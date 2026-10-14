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
import { valueAt } from "../data/automation";
import { STEP_BEATS } from "../data/noteEvents";
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

/**
 * ⭐ **An automated level is a curve, and the compile is where it becomes per-step values.**
 *
 * `docs/DAW_GAP_ARRANGEMENT.md` §8's fourth item: without it a fade is faked by splitting the part. Expanding the curve
 * **here** is what keeps one implementation of "what is this gain at this step" instead of one in the live engine and
 * another in the offline renderer — and a project with no automation has to compile to exactly the lane it always did,
 * which is the first case below.
 */
describe("an automated level on its compiled lane", () => {
  const fade = {
    parameter: "gainDb" as const,
    points: [
      { atBeats: 0, value: 0 },
      { atBeats: 4, value: -6.0206 },
    ],
  };

  it("⭐ expands the curve to one linear fader per step, and the static level still describes the lane", () => {
    const lane = compileArrangementToLanes(arrangementWith({ gainDb: 0, automation: [fade] }))[0]!.track;
    const perStep = lane.volumeByStep;
    expect(perStep, "an automated lane carries the curve").toBeDefined();
    expect(perStep!.length, "one value per step of the compiled lane").toBe(lane.steps.length);
    expect(perStep![0], "the curve starts at unity").toBeCloseTo(1, 6);
    // Every step is the curve's own reading at that step's beat, converted once — the same source the compile used,
    // so this pins the expansion without inventing a second opinion about the grid.
    for (const step of [0, 4, 8, 15]) {
      const beats = step * STEP_BEATS;
      const expected = Math.min(2, Math.max(0, Math.pow(10, valueAt(fade.points, beats) / 20)));
      expect(perStep![step], `step ${step} at beat ${beats}`).toBeCloseTo(expected, 6);
    }
    // And the fade really does descend: a curve that read flat would satisfy the loop above only by accident.
    expect(perStep![4]).toBeLessThan(perStep![0]);
    // The static field is still written: it is what a reader that knows nothing about automation uses.
    expect(lane.volume, "the mixer's own fader still describes the lane").toBe(1);
  });

  it("⭐ writes no curve at all when the track is not automated, so old projects compile unchanged", () => {
    const plain = compileArrangementToLanes(arrangementWith({ gainDb: -6 }))[0]!.track;
    expect("volumeByStep" in plain).toBe(false);
    // An empty lane is not automation either.
    const empty = compileArrangementToLanes(arrangementWith({ automation: [{ parameter: "gainDb", points: [] }] }))[0]!.track;
    expect("volumeByStep" in empty).toBe(false);
  });

  it("⭐ honours the mixer's ceiling rather than letting a curve exceed what it can play", () => {
    const loud = compileArrangementToLanes(
      arrangementWith({ automation: [{ parameter: "gainDb", points: [{ atBeats: 0, value: 99 }] }] })
    )[0]!.track;
    // `gainDbToLinear` clamps at +6 dB, so a stored curve cannot make a lane louder in the file than in the room.
    expect(loud.volumeByStep![0]).toBeLessThanOrEqual(2);
  });
});

/**
 * ⭐ **A lane of any automatable kind reaches its own key, which is what "parameter-aware" has to mean.**
 *
 * The compile used to look up one hard-coded name (`"gainDb"`), so a pan or send lane would have been stored, drawn, and
 * silently ignored — the same "two places, one thing" defect this codebase keeps removing. These cases assert the
 * expansion per kind, and that each curve is **converted the way its own static field is**: a pan is not clamped like a
 * level, and a send is not converted to a linear gain the way a dB level is.
 */
describe("an automated pan or send on its compiled lane", () => {
  it("⭐ emits a per-step curve for pan, send A and send B, each under its own key", () => {
    const lane = compileArrangementToLanes(
      arrangementWith({
        pan: 0,
        sendA: 0,
        sendB: 0,
        automation: [
          { parameter: "pan", points: [{ atBeats: 0, value: -1 }, { atBeats: 4, value: 1 }] },
          { parameter: "sendA", points: [{ atBeats: 0, value: 0 }, { atBeats: 4, value: 1 }] },
          { parameter: "sendB", points: [{ atBeats: 0, value: 0.5 }] },
        ],
      })
    )[0]!.track;

    expect(lane.panByStep, "pan has its own key").toBeDefined();
    expect(lane.sendAByStep).toBeDefined();
    expect(lane.sendBByStep, "a single point is still a curve").toBeDefined();
    expect(lane.volumeByStep, "and a level that is not automated emits nothing").toBeUndefined();

    // A pan travels the −1…1 scale, so its first step is −1 — not clamped to a level's −60…6, nor converted to linear.
    expect(lane.panByStep![0]).toBeCloseTo(-1, 6);
    expect(lane.sendAByStep![0]).toBeCloseTo(0, 6);
    // The pan's static field is still written, so a reader that knows nothing about automation uses it.
    expect(lane.pan).toBe(0);
  });

  it("⭐ keeps a level lane working unchanged, so the widening changed nothing for it", () => {
    const lane = compileArrangementToLanes(
      arrangementWith({
        gainDb: 0,
        automation: [{ parameter: "gainDb", points: [{ atBeats: 0, value: 0 }, { atBeats: 4, value: -6.0206 }] }],
      })
    )[0]!.track;
    expect(lane.volumeByStep![0]).toBeCloseTo(1, 6);
    expect(lane.panByStep).toBeUndefined();
  });
});
