/**
 * ⭐ **The vocal lane has to end up with a real voice, and the reply has to admit what it did not do.**
 *
 * `synthesize_vocal` was a stub that reported singing synthesis as reserved, because this repository had no vocal patch.
 * It now binds a lane to one of the synth's five factory vowel voices — writing `TrackV2.gs1Patch`, which is the field the
 * GS-1 host loads a lane's sound from — so the notes already on that lane sound through a formant voice.
 *
 * Three failures are worth catching, and the third is the one that reads as success:
 *
 *   - a refusal that happens **after** the write, leaving an undo step for a change that never happened
 *     (`setMcpTrackGs1` goes through `edit`, which records the state being left behind — so the voice is resolved first);
 *   - a patch that is written but never **loaded**: the share code has to be the synth's own, checked with this
 *     repository's decoder, or the host silently keeps its previous sound;
 *   - **a reply that lets a caller believe their lyric was sung.** A share code carries a voice, not words, so the answer
 *     says which half it performed and names the tool that binds the lyric.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { VOCAL_TOOLS } from "../../mcp/registryVocals";
import { createMcpArrangement, getMcpTrack } from "../../mcp/arrangement";
import { decodeGs1PatchCode } from "../audio/gs1/gs1PatchCode";
import { FACTORY_VOCAL_PATCHES, vocalPatchById } from "../data/vocalPatches";

type Handler = (args: Record<string, unknown>) => unknown;
const tool = VOCAL_TOOLS.find((entry) => entry.name === "synthesize_vocal")!;
const run = (args: Record<string, unknown>) => tool.handler(args as never, undefined as never) as Handler extends never ? never : any;

let arrangementId: string;
let trackId: string;
beforeEach(() => {
  const created = createMcpArrangement({ template: "empty" } as never);
  arrangementId = created.arrangementId;
  trackId = created.tracks[0]!.id;
});

describe("synthesize_vocal", () => {
  it("⭐ binds the lane to the named patch, writing the share code the host loads", () => {
    const reply = run({ arrangementId, track: trackId, patch: "vocalee" });
    const written = getMcpTrack(arrangementId, trackId)!.gs1Patch;

    expect(written, "the lane now carries a voice").toBe(vocalPatchById("vocalee")!.shareCode);
    // ⭐ And it is a code this repository's own decoder accepts — a drifted string would leave the host on its old sound.
    expect(decodeGs1PatchCode(written).ok).toBe(true);
    expect(reply.voice.patch).toBe("vocalee");
    expect(reply.trackId).toBe(trackId);
  });

  it("⭐ picks the patch by vowel too, so a caller can choose by the sound rather than by an id", () => {
    run({ arrangementId, track: trackId, vowel: "呜" });
    expect(getMcpTrack(arrangementId, trackId)!.gs1Patch).toBe(vocalPatchById("vocaloo")!.shareCode);
    // And with neither named it still voices the lane rather than failing — the default is the first factory vowel.
    const other = createMcpArrangement({ template: "empty" } as never);
    run({ arrangementId: other.arrangementId, track: other.tracks[0]!.id });
    expect(getMcpTrack(other.arrangementId, other.tracks[0]!.id)!.gs1Patch).toBe(FACTORY_VOCAL_PATCHES[0]!.shareCode);
  });

  it("⭐ refuses an unknown voice and an unknown lane, and writes nothing when it refuses", () => {
    const before = getMcpTrack(arrangementId, trackId)!.gs1Patch;
    // `failure()` answers in the transport's own shape (`{ content, isError }`), which is what the caller actually sees.
    const textOf = (reply: { content?: Array<{ text?: string }> }) => reply.content?.[0]?.text ?? "";
    const badVoice = run({ arrangementId, track: trackId, patch: "vocalsaxophone" });
    expect(textOf(badVoice), "an id the synth does not have is refused, listing the five").toMatch(/vocalah/);
    const badTrack = run({ arrangementId, track: "no-such-lane", patch: "vocalah" });
    expect(textOf(badTrack)).toMatch(/no track/);
    // ⭐ Nothing was written: a refusal must not leave an undo step behind it.
    expect(getMcpTrack(arrangementId, trackId)!.gs1Patch).toBe(before);
  });

  it("⭐ says which half it did, and that it did not sing the lyric", () => {
    const reply = run({ arrangementId, track: trackId, patch: "vocalhum" });
    expect(reply.bound, "what it did").toMatch(/sound|voice/i);
    expect(reply.notDone, "what it did not do").toMatch(/singing synthesis/i);
    expect(reply.notDone, "and where the lyric actually goes").toMatch(/set_arrangement_vocal_melody/);
  });
});
