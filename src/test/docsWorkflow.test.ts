import { registrySource } from "./helpers/registrySource";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The documented composing workflow must name tools that exist (fifth report, P1.3).
 *
 * A workflow section that lists a call the server does not have is worse than no section at all — `set_song_structure` is exactly the name the report's composer
 * tried first, and it does not exist. So the six steps are checked against the registry by source, which costs nothing and cannot drift silently.
 */
const registry = registrySource();
const docs = readFileSync("docs/MCP.md", "utf8");

// `add_lane` is deliberately absent: it is an **op** inside `apply_pattern_ops`, not a tool, and the first version of the workflow table got that wrong — which is
// the whole reason this file exists.
const STEPS = ["create_song", "set_arrangement_track_steps", "apply_pattern_ops", "add_arrangement_track", "render_song"];

describe("the documented workflow", () => {
  it("names six steps that the registry actually registers", () => {
    for (const step of STEPS) {
      expect(new RegExp(`name: "${step}"`).test(registry), `${step} is documented but not registered`).toBe(true);
      expect(docs).toContain(`\`${step}\``);
    }
  });

  it("does not document the name the report's composer tried first, because it does not exist", () => {
    expect(registry).not.toContain('name: "set_song_structure"');
    expect(docs).not.toContain("set_song_structure");
  });
});
