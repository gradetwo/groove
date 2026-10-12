/**
 * ⭐ The shape of an MCP reply, pinned.
 *
 * A reply is pretty-printed JSON, so the first thing a caller reads is the **first key**; the domain summaries therefore put
 * the answer there — the arrangement summary names its `arrangementId` before the track tree — and a reorder that buries it is
 * a regression, not a tidy-up.
 *
 * The render replies also have to stay **self-describing**: say where the file landed, promise to
 * name it, and lead with the measurement rather than with an apology.
 *
 * ⚠️ The phrases are short and flat on purpose. Two earlier attempts failed by extracting whole
 * sentences: the anchors sat inside the string literal, so searching forward found the closing
 * quote, and a phrase carrying markdown emphasis is not a substring of the source at all.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summariseArrangement } from "../../mcp/arrangement";
import { arrangementSeededFromGenre } from "../data/arrangementProjection";
import { GENRES_MAP } from "../data/genres";

const raw = (path: string) => readFileSync(path, "utf8");
const flat = (path: string) => raw(path).replace(/\s+/g, " ");

const PHRASES: Array<{ file: string; phrase: string; why: string }> = [
  { file: "mcp/render/budget.ts", phrase: "and the reply names it.", why: "\u6e32\u67d3\u56de\u6267\u5fc5\u987b\u7ee7\u7eed\u627f\u8bfa\u70b9\u540d\u843d\u76d8\u6587\u4ef6" },
  { file: "mcp/render/budget.ts", phrase: "GROOVE_MCP_OUT", why: "\u5fc5\u987b\u7ee7\u7eed\u8bf4\u6587\u4ef6\u843d\u5728\u54ea" },
  { file: "mcp/render/budget.ts", phrase: "Measured on this server:", why: "\u6e32\u67d3\u6210\u672c\u5fc5\u987b\u7ee7\u7eed\u4ee5\u5b9e\u6d4b\u8bfb\u6570\u5f00\u5934" },
];

describe("MCP reply shape", () => {
  it("keeps the self-describing sentences", () => {
    const missing = PHRASES.filter(({ file, phrase }) => !raw(file).includes(phrase)).map((p) => p.why);
    expect(missing, `reply-shape sentences missing:\n  ${missing.join("\n  ")}`).toEqual([]);
  });

  it("keeps the arrangement summary's identity ahead of its payload", () => {
    // ⭐ Measured on the reply itself rather than on the source: a reorder that buries the identity is what this catches.
    const summary = summariseArrangement("new", arrangementSeededFromGenre("new", Object.values(GENRES_MAP)[0]!));
    const keys = Object.keys(summary);
    expect(
      keys.indexOf("arrangementId"),
      `summariseArrangement buries its identity behind the payload: ${keys.join(", ")}`
    ).toBeLessThan(keys.indexOf("tracks"));
  });
});
