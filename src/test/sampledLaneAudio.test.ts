/**
 * **A genre lane whose instrument names a recorded instrument sounds that recording** — the criterion for the vertical
 * slice, on every path the slice touches.
 *
 * The gap this closes had no criterion at all: sixty-one instrument names in the genre data resolved to built-in presets,
 * physical drum models and GS-1 patches, and the mirrored libraries were reachable from `kind:"sampler"` tracks and from
 * nowhere else. So the assertions here are the **facts that make the recording audible**, one per link of the chain:
 *
 *   · the written table resolves a lane to an asset, and only for an exact name and only for a melodic role;
 *   · the lane is **stood down from the synthesiser** exactly when the render's catalogue can serve the recording — the
 *     owner's "a recording by default, a synthesiser when the recording is not there", which is why an unserved row is a
 *     case with its own assertion rather than an omission;
 *   · the live planner emits one event **per note per bar**, the offline planner one per note, and both read a chord's
 *     `pitches` stack rather than its root alone;
 *   · the compile carries the resolved asset onto the lane, and the arrangement surface's `sound` report says
 *     `catalogue-asset` for it — the readback, read through the same resolver the renderer uses.
 */
import { describe, expect, it } from "vitest";
import { compileArrangementToLanes, compileArrangementToPattern } from "../data/arrangementCompile";
import { catalogueFromManifestText } from "../data/sampleCatalogue";
import { readFileSync } from "node:fs";
import { planAudioLaneEvents } from "../audio/audioLanePlan";
import { scheduleAudioLaneSamples } from "../audio/audioLaneScheduler";
import { planOfflineAudioLanes, isAudioLane } from "../audio/offlineAudioLanes";
import { planSamplerSteps } from "../audio/samplerSteps";
import { sampledInstrumentProblems, sampledLaneRefs, sampledStandDownIndexes } from "../audio/sampledLanes";
import { AudioEngine } from "../audio/AudioEngine";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { SequencerPattern, SequencerTrack } from "../types/genre";
import type { ArrangementV2 } from "../types/arrangementV2";

const CATALOGUE: readonly SampleAsset[] = catalogueFromManifestText(readFileSync("public/samples/manifest.json", "utf8"), "").assets;

/** The smallest catalogue that serves one id — the mirror-configured case, without the manifest. */
function serving(...assetIds: string[]): readonly SampleAsset[] {
  return assetIds.map((assetId) => ({
    assetId,
    name: assetId,
    kind: "one-shot" as const,
    seconds: 1,
    url: `/samples/${assetId}.wav`,
    sfz: { url: `/samples/${assetId}.sfz` },
  }));
}

/** A `bebop`-shaped chords lane: a piano, playing a three-note chord and a single note. */
function pianoChordsLane(): SequencerTrack {
  return {
    track_id: "chords",
    name: "Chords",
    instrument: "piano_lead",
    steps: [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    pitch: [60, 0, 0, 0, 67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    pitches: [[60, 64, 67], null, null, null, [67, 71, 74], null, null, null, null, null, null, null, null, null, null, null],
    gate: [4, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    volume: 0.5,
    pan: -0.25,
  };
}

function patternWith(track: SequencerTrack): SequencerPattern {
  return { genre_id: "bebop", bpm: 120, totalSteps: 16, tracks: [track] } as unknown as SequencerPattern;
}

describe("a recorded instrument reaches a genre lane", () => {
  it("resolves the lane to its asset, and only the lanes the table applies to", () => {
    expect(sampledLaneRefs(patternWith(pianoChordsLane()))).toEqual([{ trackIndex: 0, assetId: "salamander-grand", name: "Chords" }]);
    expect(sampledLaneRefs(patternWith({ ...pianoChordsLane(), track_id: "kick" }))).toEqual([]);
    expect(sampledLaneRefs(patternWith({ ...pianoChordsLane(), instrument: "warm_pad" }))).toEqual([]);
  });

  it("stands the synthesiser down only for the lanes this catalogue can sound, which is the stated fallback", () => {
    const pattern = patternWith(pianoChordsLane());
    // A mirror that serves it: the lane is the recording's, and the synthesised voice must not double it.
    expect([...sampledStandDownIndexes(pattern, serving("salamander-grand")).keys()]).toEqual([0]);
    // A mirror that does not: the lane keeps the synthesiser it has today, and says why.
    expect([...sampledStandDownIndexes(pattern, serving("vcsl:Marimba")).keys()]).toEqual([]);
    expect(sampledInstrumentProblems(pattern, serving("vcsl:Marimba"))).toEqual([
      expect.stringContaining("no configured sample mirror serves"),
    ]);
    expect(sampledInstrumentProblems(pattern, serving("salamander-grand"))).toEqual([]);
  });

  it("stands a v1 audio lane down even when its asset resolved nothing, because it has no synthesised voice", () => {
    const audio = { track_id: "audio", name: "Riser", instrument: "synth", steps: [1], sample: { assetId: "riser-01" } } as SequencerTrack;
    expect(isAudioLane(audio)).toBe(true);
    expect([...sampledStandDownIndexes(patternWith(audio), serving("anything")).keys()]).toEqual([0]);
  });

  it("plans one event per note, per bar of its section, on the live path — and reads the chord, not its root", () => {
    const lane = pianoChordsLane();
    const plan = planAudioLaneEvents(
      {
        clips: { A: { tracks: [lane] } },
        sections: [{ id: "s1", slot: "A", bars: 2 }],
        boundaries: [0],
      },
      CATALOGUE
    );
    expect(plan.problems).toEqual([]);
    // Three notes on the first downbeat, three on the second: six notes per bar, twelve over two bars.
    expect(plan.events).toHaveLength(12);
    expect(plan.events[0]).toMatchObject({ assetId: "salamander-grand", atStep: 0, atBar: 0, pitch: 60, gateSteps: 4, pan: -0.25 });
    expect(plan.events.map((event) => event.pitch).slice(0, 6)).toEqual([60, 64, 67, 67, 71, 74]);
    // Bar two is the same music one bar later, not one event at the section's start.
    expect(plan.events[6]).toMatchObject({ atBar: 1, atStep: 16, pitch: 60 });
    expect(plan.events.every((event) => typeof event.pitch === "number")).toBe(true);
  });

  it("plans the same notes for the offline renderer, with the lane's own gate as the note's length", () => {
    const plan = planOfflineAudioLanes(patternWith(pianoChordsLane()), CATALOGUE);
    expect(plan.problems).toEqual([]);
    expect(plan.lanes).toEqual([{ trackIndex: 0, track_id: "chords", name: "Chords" }]);
    expect(plan.events).toHaveLength(6);
    const first = plan.events[0]!;
    expect(first.pitch).toBe(60);
    // Four steps of gate at 120 bpm 4/4 is a quarter note: 4 * (60 / 120 / 4) = 0.5 s.
    expect(first.seconds).toBeCloseTo(0.5, 9);
    expect(first.gainDb).toBeCloseTo(-6.0206, 3);
    expect(first.pan).toBeCloseTo(-0.25, 9);
    // And a lane this catalogue cannot serve keeps the synthesiser rather than rendering silence.
    const unserved = planOfflineAudioLanes(patternWith(pianoChordsLane()), serving("vcsl:Marimba"));
    expect(unserved.events).toEqual([]);
    expect(unserved.problems.map((problem) => problem.reason)).toEqual([expect.stringContaining("no sample \"salamander-grand\"")]);
  });

  it("carries the region's loop declaration to the live voice, which stopped at the scheduler", async () => {
    /**
     * `karoryfer-meatbass` writes `loop_mode=loop_sustain`, and `startSamplerNote` has honoured it since the
     * sustaining-strings fix — but the live schedulers never passed it, so a held upright note was cut at its gate
     * while the offline render let it hold. This asserts the **live** half, which is the one a person hears.
     */
    const seen: Array<{ loopMode?: string; loopStartFrames?: number; loopEndFrames?: number; seconds?: number }> = [];
    const loader = {
      async load() {
        throw new Error("an instrument event must resolve a note, not the whole buffer");
      },
      async loadNote() {
        return {
          buffer: { duration: 8.2 } as unknown as AudioBuffer,
          ratio: 1,
          samplePath: "Meatbass/Programs/pizz_basic.sfz",
          loopMode: "loop_sustain" as const,
          loopStartFrames: 1234,
          loopEndFrames: 56789,
        };
      },
    } as never;
    const report = await scheduleAudioLaneSamples(
      {
        clips: { A: { tracks: [{ track_id: "bass", name: "Bassline", instrument: "walking_upright", steps: [1], pitch: [40], gate: [8] }] } },
        sections: [{ id: "s1", slot: "A", bars: 1 }],
        boundaries: [0],
        bpm: 120,
      },
      loader,
      {
        start(_buffer, _when, _gainDb, event, note) {
          seen.push({ loopMode: note?.loopMode, loopStartFrames: note?.loopStartFrames, loopEndFrames: note?.loopEndFrames, seconds: event.seconds });
        },
      },
      undefined,
      CATALOGUE
    );
    expect(report.scheduled).toBe(1);
    expect(seen).toEqual([{ loopMode: "loop_sustain", loopStartFrames: 1234, loopEndFrames: 56789, seconds: 1 }]);
  });

  it("reads a chord's stack on the arrangement player too, where only the root used to be read", () => {
    const steps = planSamplerSteps([{ sourceTrackId: "chords", lane: pianoChordsLane() }]);
    expect(steps.map((step) => step.pitch)).toEqual([60, 64, 67, 67, 71, 74]);
    expect(steps.every((step) => step.assetId === "salamander-grand")).toBe(true);
    // A lane the table does not map and that carries no asset is not a sampler lane at all.
    expect(planSamplerSteps([{ sourceTrackId: "lead", lane: { ...pianoChordsLane(), instrument: "saw_lead" } }])).toEqual([]);
  });

  it("carries the resolved asset onto the compiled lane, so the arrangement route sounds it too", () => {
    const arrangement: ArrangementV2 = {
      songId: "s",
      tracks: [{ id: "t1", kind: "synth", name: "Chords", fromTrackId: "chords", instrument: "piano_lead" }],
      sourceSlots: [],
      bars: 1,
    };
    const lanes = compileArrangementToLanes(arrangement, { t1: [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }] });
    expect(lanes[0]!.track.sample).toEqual({ assetId: "salamander-grand" });
    expect(lanes[0]!.track.instrument).toBe("piano_lead");
    // And the pattern the engine plays carries the same field, which is what `compileArrangementToPattern` hands over.
    expect(compileArrangementToPattern(arrangement, lanes).tracks[0]!.sample).toEqual({ assetId: "salamander-grand" });
    // A track created in the new interface declares no instrument and is not a recording.
    const plain = compileArrangementToLanes({ songId: "s", tracks: [{ id: "t2", kind: "synth", name: "Synth" }], sourceSlots: [], bars: 1 });
    expect(plain[0]!.track.sample).toBeUndefined();
    expect(plain[0]!.track.instrument).toBe("synth");
  });

  it("stands the live engine's own sequencer down for exactly the lanes the catalogue serves", () => {
    const engine = new AudioEngine();
    engine.setPattern(patternWith(pianoChordsLane()));
    expect(engine.sampledLanesStoodDown()).toEqual([]);
    // A catalogue that cannot serve it: the lane keeps the synthesiser, and the engine says why.
    const unserved = engine.prepareSampledLanes(serving("vcsl:Marimba"));
    expect(unserved.stoodDown).toEqual([]);
    expect(unserved.problems).toEqual([expect.stringContaining("no configured sample mirror serves")]);
    expect(engine.sampledLanesStoodDown()).toEqual([]);
    // A catalogue that can: the lane is the recording's, and the synthesiser stands down.
    expect(engine.prepareSampledLanes(serving("salamander-grand")).stoodDown).toEqual([0]);
    expect(engine.sampledLanesStoodDown()).toEqual([0]);
    // A new pattern clears it, so a piano's old index cannot silence whatever now sits there.
    engine.setPattern(patternWith({ ...pianoChordsLane(), instrument: "saw_lead" }));
    expect(engine.sampledLanesStoodDown()).toEqual([]);
  });
});
