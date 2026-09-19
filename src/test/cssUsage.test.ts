/**
 * The CSS-usage sweep's parsing rules.
 *
 * The sweep found seven dead rules in `src/index.css` — including `.animate-spawn` with its
 * `@keyframes`, the two `touch-action-pan-*` shells, four safe-area helpers and a landscape header
 * rule. Before that it reported **thirteen**, because it counted class names mentioned in comments:
 * the explanatory notes left behind when a rule is deleted, and the block that documents
 * `.landscape-compact-bar`'s removal. So the interesting behaviour here is not "does it find dead
 * rules" but "does it tell a comment from a declaration", which these tests pin.
 *
 * The other half is the safe direction of the reference test. A class name is often assembled from
 * fragments, so reference detection is a substring search — it errs towards "referenced", because a
 * missed dead rule costs nothing while deleting a live one is a visual regression.
 */
import { describe, it, expect } from "vitest";
import {
  declaredClassesInSource,
  partitionByUsage,
  stripCssComments,
} from "../utils/cssUsage";

describe("stripCssComments", () => {
  it("blanks a block comment without changing the line count", () => {
    const css = ["a {", "/* .dead {", "  color: red;", "} */", "b { color: blue; }"].join("\n");
    const stripped = stripCssComments(css);
    expect(stripped.split("\n")).toHaveLength(css.split("\n").length);
    expect(stripped).not.toContain(".dead");
    expect(stripped).toContain("b { color: blue; }");
  });

  it("blanks whole-line // comments", () => {
    const stripped = stripCssComments("// .dead { color: red; }\n.live { color: blue; }");
    expect(stripped).not.toContain(".dead");
    expect(stripped).toContain(".live");
  });

  it("keeps every offset, so a reported line number still points at the rule", () => {
    const css = "/* one\ntwo */\n.after { color: red; }";
    expect(stripCssComments(css).length).toBe(css.length);
    expect(declaredClassesInSource(css).get("after")).toBe(3);
  });
});

describe("declaredClassesInSource", () => {
  it("finds class selectors and their line numbers", () => {
    const css = [".a {", "  color: red;", "}", "", ".b, .c {", "  color: blue;", "}"].join("\n");
    const found = declaredClassesInSource(css);
    expect([...found.keys()].sort()).toEqual(["a", "b", "c"]);
    expect(found.get("a")).toBe(1);
    expect(found.get("b")).toBe(5);
  });

  it("does not count a class named only inside a comment", () => {
    /**
     * The regression: a comment explaining that `.removed` was deleted made the sweep believe
     * `.removed` was still declared, so its own explanatory note suppressed the finding.
     */
    const css = "/* `.deleted` used to live here. */\n.live { color: red; }";
    const found = declaredClassesInSource(css);
    expect(found.has("deleted")).toBe(false);
    expect(found.has("live")).toBe(true);
  });

  it("does not count a commented-out rule, which is what commenting a rule out means", () => {
    const css = "/*\n.dead { color: red; }\n*/\n.live { color: blue; }";
    const found = declaredClassesInSource(css);
    expect(found.has("dead")).toBe(false);
    expect(found.has("live")).toBe(true);
  });

  it("finds a rule nested inside an at-rule, which is how the reduced-motion guard is written", () => {
    const css = "@media (prefers-reduced-motion: reduce) {\n  .animate-orbit {\n    animation: none;\n  }\n}";
    expect(declaredClassesInSource(css).has("animate-orbit")).toBe(true);
  });

  it("ignores a class-like string inside a declaration value", () => {
    // `content: ".notaclass"` is text, not a selector.
    const css = '.x { content: ".notaclass"; }';
    const found = declaredClassesInSource(css);
    expect(found.has("x")).toBe(true);
    expect(found.has("notaclass")).toBe(false);
  });

  it("keeps the first line when a selector is declared twice", () => {
    const css = ".dup { color: red; }\n.dup { color: blue; }";
    expect(declaredClassesInSource(css).get("dup")).toBe(1);
  });
});

describe("partitionByUsage", () => {
  const declared = new Map([
    ["live", 1],
    ["dead", 2],
    ["track-row-", 3],
  ]);

  it("separates referenced from unreferenced", () => {
    const corpus = 'className="live"  // track-row- prefix is built at runtime';
    const { referenced, unreferenced } = partitionByUsage(declared, corpus);
    expect(referenced.map((r) => r.cls).sort()).toEqual(["live", "track-row-"]);
    expect(unreferenced.map((r) => r.cls)).toEqual(["dead"]);
  });

  it("treats a partial match as referenced, which is the safe direction", () => {
    /**
     * `track-row-` appears only as part of `track-row-3` in the corpus. Reporting it as dead would
     * invite deleting a rule that styles every track row, so the substring test errs towards live.
     */
    const { referenced } = partitionByUsage(declared, 'className="track-row-3"');
    expect(referenced.map((r) => r.cls)).toContain("track-row-");
  });

  it("orders the result by line, so the report reads like the stylesheet", () => {
    const { referenced } = partitionByUsage(declared, "live track-row-");
    expect(referenced.map((r) => r.line)).toEqual([1, 3]);
  });
});
