import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every operation the implementation declares must be **accepted by the runtime schema**.
 *
 * `set_chord_progression` was implemented in `mcp/pattern.ts`, documented in `docs/MCP.md`, and recommended by `suggest_progression`'s own
 * reply — while the zod union in `mcp/registry.ts` did not list it, so MCP input validation rejected it before the implementation ever ran. The
 * type checker cannot see this: the op type and the zod schema are two separate declarations of the same set.
 *
 * So this test compares the two declarations directly. It is a source check because the schemas are built at module scope and the op type is
 * erased — reading both texts is the only way to notice a member that exists in one and not the other.
 */
const patternSource = readFileSync("mcp/pattern.ts", "utf8");
const registryText = registrySource();

describe("the op schema covers the op type", () => {
  it("declares a zod literal for every `op:` in the PatternOp union", () => {
    // The union's members, from the type declaration: `| { op: "name"` — the op type is the block after `export type PatternOp`.
    const union = patternSource.slice(patternSource.indexOf("export type PatternOp"));
    const declared = [...union.matchAll(/\{\s*op:\s*"([a-z_]+)"/g)].map((match) => match[1]);
    expect(declared.length).toBeGreaterThanOrEqual(10);

    const schemas = [...registryText.matchAll(/z\.literal\("([a-z_]+)"\)/g)].map((match) => match[1]);
    const missing = declared.filter((op) => !schemas.includes(op));
    expect(missing, `ops declared but not accepted by the schema: ${missing.join(", ")}`).toEqual([]);
  });

  it("and every op the schema accepts is declared, so neither side can drift alone", () => {
    const union = patternSource.slice(patternSource.indexOf("export type PatternOp"));
    const declared = new Set([...union.matchAll(/\{\s*op:\s*"([a-z_]+)"/g)].map((match) => match[1]));
    // Only the `op` literals inside the op union matter; other `z.literal` uses in the registry are for unrelated enums.
    const opBlock = registryText.slice(registryText.indexOf("const opSchema"), registryText.indexOf("Turn a genre id into a pattern"));
    const schemas = [...opBlock.matchAll(/z\.literal\("([a-z_]+)"\)/g)].map((match) => match[1]);
    const extra = schemas.filter((op) => !declared.has(op));
    expect(extra, `schema accepts ops the type does not declare: ${extra.join(", ")}`).toEqual([]);
  });
});
