/**
 * 📋 **Every name the registry declares is in the alignment table.**
 *
 * `docs/FEATURE_ALIGNMENT.md` answers "is this capability in the engine, in the web UI and on the MCP surface" for
 * the owner. Its MCP column is only worth reading if it is **complete**, and the cheapest way for it to rot is a
 * tool added to the registry and never mentioned in the table — the same failure the README had when its Quick
 * Start sat eighty lines down.
 *
 * The source of names is the registry modules themselves, not the built server: `dist-mcp/` is gitignored, so a
 * criterion that needed it would be checking whatever was built last rather than the tree. The extraction is
 * deliberately the same shape the table was built from (`name: "…"` entries in `mcp/registry*.ts`), which also
 * covers the resources and prompts that carry the same field — ninety eight names against ninety four tools,
 * because the other four are the prompts.
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOC = "docs/FEATURE_ALIGNMENT.md";

function registryNames(): string[] {
  const files = globSync("mcp/registry*.ts").sort();
  const names = new Set<string>();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/\n\s*name: "([a-z0-9_]+)",/g)) names.add(match[1]);
  }
  return [...names].sort();
}

describe("the alignment table covers the registry", () => {
  it("⭐ names every entry the registry declares", () => {
    const doc = readFileSync(DOC, "utf8");
    const missing = registryNames().filter((name) => !doc.includes(name));
    expect(missing).toEqual([]);
  });

  it("⭐ states the authoritative tool count, so the table and the server agree", () => {
    const doc = readFileSync(DOC, "utf8");
    expect({ saysNinetyFour: /\b94\b/.test(doc), namesTheServerCheck: doc.includes("scripts/list_mcp_tools.mjs") })
      .toEqual({ saysNinetyFour: true, namesTheServerCheck: true });
  });

  it("⭐ still measures, so an empty registry or a moved doc cannot pass quietly", () => {
    const names = registryNames();
    const doc = readFileSync(DOC, "utf8");
    expect({ many: names.length > 90, docSizeable: doc.length > 3000 })
      .toEqual({ many: true, docSizeable: true });
  });
});
