/**
 * **The arrangement's own level and position reach the lane — and the two level conventions are pinned, not assumed.**
 *
 * `compileArrangementToLanes` used to drop `gainDb` and `pan`, so `set_arrangement_track_gain` and `set_arrangement_track_pan` were tools whose values no renderer
 * read. Carrying them makes two conventions meet, and this file exists because the review of that change found nothing pinning the result: the model says
 * `gainDb: 0` is **unity**, while the engine's default for a lane that says nothing is `DEFAULT_TRACK_VOLUME` (a linear 0.8, −1.94 dB). Taking "0 is unity" at its
 * word therefore makes an explicit 0 dB 1.94 dB above the default — intended, stated in the compile, and asserted here so it cannot be mistaken for a regression.
 */
import { describe, expect, it } from "vitest";
import { compileArrangementToLanes } from "../data/arrangementCompile";
import { DEFAULT_TRACK_VOLUME, deriveTrackStates } from "../audio/trackStates";
import type { ArrangementV2, TrackV2 } from "../types/arrangementV2";

function arrangementWith(track: Partial<TrackV2>): ArrangementV2 {
  return {
    songId: "song",
    sourceSlots: [],
    bars: 1,
    tracks: [{ id: "t1", kind: "synth", name: "Keys", ...track }],
  };
}

describe("an arrangement track's level and position on its compiled lane", () => {
  it("writes neither key when the track states neither, so the engine's default stands exactly as before", () => {
    const lane = compileArrangementToLanes(arrangementWith({}))[0]!.track;
    expect("volume" in lane).toBe(false);
    expect("pan" in lane).toBe(false);
    // The default is the engine's, not a number this compile invented.
    expect(deriveTrackStates({ tracks: [lane] })[0]!.volume).toBe(DEFAULT_TRACK_VOLUME);
    expect(deriveTrackStates({ tracks: [lane] })[0]!.pan).toBe(0);
  });

  it("takes `gainDb: 0` as unity, which is 1.94 dB above the no-opinion default — deliberately", () => {
    const lane = compileArrangementToLanes(arrangementWith({ gainDb: 0 }))[0]!.track;
    expect(lane.volume).toBe(1);
    // The stated consequence: an explicit 0 dB is not the same as saying nothing, and the gap is the default fader's own −1.94 dB.
    expect(20 * Math.log10(1 / DEFAULT_TRACK_VOLUME)).toBeCloseTo(1.938, 3);
  });

  it("maps dB to a linear fader, and clamps at the mixer's own +6 dB ceiling", () => {
    expect(compileArrangementToLanes(arrangementWith({ gainDb: -6.0206 }))[0]!.track.volume).toBeCloseTo(0.5, 4);
    expect(compileArrangementToLanes(arrangementWith({ gainDb: -60 }))[0]!.track.volume).toBeCloseTo(0.001, 5);
    // `setTrackGain` allows +12 dB, and the fader cannot go past 2 (the same bound the live engine and the lane mixer clamp at).
    expect(compileArrangementToLanes(arrangementWith({ gainDb: 12 }))[0]!.track.volume).toBe(2);
  });

  it("carries pan in the model's own −1…1 range, clamped", () => {
    expect(compileArrangementToLanes(arrangementWith({ pan: -1 }))[0]!.track.pan).toBe(-1);
    expect(compileArrangementToLanes(arrangementWith({ pan: 0.5 }))[0]!.track.pan).toBe(0.5);
    expect(compileArrangementToLanes(arrangementWith({ pan: 3 }))[0]!.track.pan).toBe(1);
  });
});
