/**
 * ⭐ **A tool must not tell a caller to pass an input it does not accept** (mcp/registryArrangement.ts).
 *
 * `create_arrangement`'s `blankKind` description told clients to pass an `assetId`, and the tool has no `assetId` in its
 * schema, so the argument was stripped before the handler ever ran and the reply said nothing. A creation run followed the
 * instruction and got a default drum kit with no problem reported. The general rule is the one this asserts: if a tool's
 * description names a parameter, the schema must carry it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const registry = readFileSync("mcp/registryArrangement.ts", "utf8");

describe("create_arrangement", () => {
  it("⭐ never names an input it does not accept", () => {
    const start = registry.indexOf('name: "create_arrangement"');
    expect(start, "create_arrangement is gone").toBeGreaterThan(-1);
    const end = registry.indexOf('name: "get_arrangement"', start);
    const block = registry.slice(start, end);
    // Mentioning the parameter is allowed only if the schema takes it, or the text says where to set the sound instead.
    const namesAssetId = /assetId/.test(block);
    const takesAssetId = /^\s*assetId:/m.test(block);
    const namesTheSetter = /set_arrangement_track_asset/.test(block);
    expect({ namesAssetId, explains: takesAssetId || namesTheSetter }).toEqual({ namesAssetId, explains: true });
  });
});
