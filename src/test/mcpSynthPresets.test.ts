/**
 * ⭐ **The library has to be choosable, and choosing one has to actually voice the lane.**
 *
 * `list_synth_presets` exists because a caller cannot ask for a sound they have never heard of — the complaint that
 * started this work was that `catlead`, `bladerunner` and `dxepiano` were invisible. `load_synth_preset` is the other half:
 * the listing gives ids, and this writes one to a lane.
 *
 * The failure that matters is the same one `synthesize_vocal` guards: **the share code is an opaque 900-character blob**,
 * so a write that silently used the wrong row, or a refusal that came after the write, would both look like success. The
 * table's own criterion checks the codes; this one checks that the *tool* reaches the lane with the right one.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { GS1_TOOLS } from "../../mcp/registryGs1";
import { createMcpArrangement, getMcpTrack } from "../../mcp/arrangement";
import { decodeGs1PatchCode } from "../audio/gs1/gs1PatchCode";
import { SYNTH_PRESETS, SYNTH_PRESET_CATEGORIES, synthPresetById } from "../data/synthPresets.generated";

const tool = (name: string) => GS1_TOOLS.find((entry) => entry.name === name)!;
type Reply = { content?: Array<{ text?: string }> };
const textOf = (reply: Reply) => reply.content?.[0]?.text ?? "";

let arrangementId: string;
let trackId: string;
beforeEach(() => {
  const created = createMcpArrangement({ template: "empty" } as never);
  arrangementId = created.arrangementId;
  trackId = created.tracks[0]!.id;
});

describe("list_synth_presets", () => {
  it("⭐ lists the whole library with the ids a caller needs, without the codes", () => {
    const listed = tool("list_synth_presets").handler({}, undefined as never) as {
      count: number;
      categories: readonly string[];
      presets: Array<{ id: string; name: string }>;
    };
    expect(listed.count).toBe(SYNTH_PRESETS.length);
    expect(listed.categories).toEqual(SYNTH_PRESET_CATEGORIES);

    /**
     * ⭐ **The share code is deliberately absent.** A listing that carried 120 blobs of ~900 characters would be
     * unreadable in a transcript, and a caller choosing a sound wants the id — `load_synth_preset` is what carries the
     * code.
     */
    for (const preset of listed.presets) {
      expect(Object.keys(preset).sort()).toEqual(["cat", "id", "name", "tag"]);
    }
    // The three the proposal named as the reason for this work are all reachable by id.
    for (const id of ["catlead", "bladerunner", "dxepiano"]) {
      expect(listed.presets.some((preset) => preset.id === id), `${id} is listed`).toBe(true);
    }
  });

  it("⭐ filters by the synth's own category, and says so when a category holds nothing", () => {
    const leads = tool("list_synth_presets").handler({ cat: "lead" }, undefined as never) as { presets: Array<{ cat: string }> };
    expect(leads.presets.length).toBeGreaterThan(0);
    // Case-insensitive, because a caller should not have to know the synth spells them in caps.
    expect(leads.presets.every((preset) => preset.cat === "LEAD")).toBe(true);

    const empty = tool("list_synth_presets").handler({ cat: "NO_SUCH_CAT" }, undefined as never) as { count: number; problem?: string };
    expect(empty.count).toBe(0);
    expect(empty.problem, "an empty filter says why rather than looking broken").toMatch(/no presets in category/);
  });
});

describe("load_synth_preset", () => {
  it("⭐ voices the lane with that preset's own code, by track id or by name", () => {
    const reply = tool("load_synth_preset").handler(
      { arrangementId, track: trackId, presetId: "catlead" },
      undefined as never
    ) as { preset: { id: string }; trackId: string };
    const written = getMcpTrack(arrangementId, trackId)!.gs1Patch;

    expect(written, "the lane carries the preset's code").toBe(synthPresetById("catlead")!.shareCode);
    // ⭐ And it is a code this repository's own decoder accepts — the same reader the engine uses to load a lane's patch.
    expect(decodeGs1PatchCode(written).ok).toBe(true);
    expect(reply.preset.id).toBe("catlead");

    // By name as well: an agent that read a track out of a summary has its name, not always its id.
    const other = createMcpArrangement({ template: "empty" } as never);
    const name = other.tracks[0]!.name;
    tool("load_synth_preset").handler({ arrangementId: other.arrangementId, track: name, presetId: "dxepiano" }, undefined as never);
    expect(getMcpTrack(other.arrangementId, other.tracks[0]!.id)!.gs1Patch).toBe(synthPresetById("dxepiano")!.shareCode);
  });

  it("⭐ refuses an unknown preset or lane, and writes nothing when it refuses", () => {
    const before = getMcpTrack(arrangementId, trackId)!.gs1Patch;
    const badPreset = tool("load_synth_preset").handler(
      { arrangementId, track: trackId, presetId: "no-such-preset" },
      undefined as never
    ) as Reply;
    expect(textOf(badPreset), "the refusal counts the library rather than naming a guess").toMatch(String(SYNTH_PRESETS.length));
    const badTrack = tool("load_synth_preset").handler(
      { arrangementId, track: "no-such-lane", presetId: "catlead" },
      undefined as never
    ) as Reply;
    expect(textOf(badTrack)).toMatch(/no track/);
    // ⭐ Nothing written: `setMcpTrackGs1` records the state it leaves behind, so a refusal after the write would leave an
    // undo step for a change that never happened.
    expect(getMcpTrack(arrangementId, trackId)!.gs1Patch).toBe(before);
  });
});
