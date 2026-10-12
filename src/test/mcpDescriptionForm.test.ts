/**
 * ⭐ **Every description is well formed, not merely long enough or short enough.**
 *
 * ⚠️ This exists because a separator table once declared ", which " as seven characters when it is eight, so a split
 * consumed the comma and the word but left the space behind: the sentences the anchors checked for were all still there,
 * so the criteria stayed green while the join read "…`get_arrangement`.  reports…". Length and presence are not form.
 *
 * Code spans are replaced with a placeholder before the check so that a file extension such as `.als` or a code span
 * followed by punctuation is not mistaken for damage.
 */
import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = [
  registrySource(),
  readFileSync("mcp/registryArrangement.ts", "utf8"),
  readFileSync("mcp/registryProject.ts", "utf8"),
  readFileSync("mcp/registryLibrary.ts", "utf8"),
  readFileSync("mcp/registryGs1.ts", "utf8"),
  readFileSync("mcp/registryChords.ts", "utf8"),
  readFileSync("mcp/registryVocals.ts", "utf8"),
  readFileSync("mcp/registryRender.ts", "utf8"),
  readFileSync("mcp/registryFiles.ts", "utf8"),
  readFileSync("mcp/registryAnalysis.ts", "utf8"),
  readFileSync("mcp/registryExamples.ts", "utf8"),
].join("\n");
const names = [...source.matchAll(/^ {4}name: "([a-z0-9_]+)",/gm)].map((m) => m[1]);
const blocks = source.split(/^ {4}name: "[a-z0-9_]+",/m).slice(1);

const descriptions = names
  .map((name, i) => {
    const m = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(blocks[i] ?? "");
    return m ? { name, text: m[1].replace(/`[^`]*`/g, "«code»") } : null;
  })
  .filter((row): row is { name: string; text: string } => row !== null);

const DAMAGE = [
  ["  ", "doubled space where a word was eaten"],
  [", .", "comma in front of a full stop"],
  [" ,", "space in front of a comma"],
  [", ,", "two commas in a row"],
  [". ,", "full stop in front of a comma"],
  ["; .", "semicolon in front of a full stop"],
  ["..", "two full stops in a row"],
] as const;

describe("MCP descriptions are well formed", () => {
  it("⭐ at least ninety descriptions were found, so the check cannot pass vacuously", () => {
    expect(descriptions.length).toBeGreaterThanOrEqual(90);
  });

  it("⭐ no description carries a damaged join", () => {
    const damaged = descriptions.flatMap(({ name, text }) =>
      DAMAGE.filter(([pattern]) => text.includes(pattern)).map(
        ([pattern, why]) => `${name}: ${JSON.stringify(pattern)} (${why})`,
      ),
    );
    expect({ damaged }).toEqual({ damaged: [] });
  });
});
