import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { instrumentDisplayName } from "../components/arrangement/instrumentDisplayName";

/**
 * ⭐ **The chip names the instrument, not its library** (owner's instruction, 2026-10-09: "只显示乐器名"), which is also
 * what the chip's own comment has claimed since it was written. The catalogue joins the two with a spaced em dash.
 */
describe("the instrument's display name", () => {
  it("⭐ drops the library prefix the catalogue writes before a spaced em dash", () => {
    expect(instrumentDisplayName("Virtuosity Drums — Basic Kit")).toBe("Basic Kit");
    expect(instrumentDisplayName("Salamander Grand — Piano")).toBe("Piano");
  });

  it("leaves a name that carries no library prefix exactly as it is", () => {
    expect(instrumentDisplayName("Salamander Grand Piano")).toBe("Salamander Grand Piano");
    expect(instrumentDisplayName("arco 3vel")).toBe("arco 3vel");
  });

  it("cuts only the first prefix, so a program may contain the separator itself", () => {
    expect(instrumentDisplayName("Library — Program — Variant")).toBe("Program — Variant");
  });

  it("keeps the whole name when the part after the separator is empty", () => {
    expect(instrumentDisplayName("Library — ")).toBe("Library — ");
  });

  it("⭐ leaves a hyphen alone, because a hyphen is part of names like `Hi-Hat - Closed`", () => {
    expect(instrumentDisplayName("Hi-Hat - Closed")).toBe("Hi-Hat - Closed");
  });

  it("⭐ and the chip uses it, while the full name stays in the tooltip", () => {
    const browser = readFileSync(resolve(__dirname, "../components/arrangement/InstrumentBrowserV2.tsx"), "utf8");
    expect(browser, "the visible label is the instrument").toContain("instrumentDisplayName(current.name)");
    expect(browser, "and `title` still carries the catalogue's own name").toMatch(/title=\{current \? current\.name/);
  });
});
