/**
 * The arrangement's notes reaching the engine's **own sequencer** — the criterion for the gap that was measured.
 *
 * Two halves were each correct and were never joined: the compile produced lanes carrying steps and pitches (checked in `arrangementToAudio.test.ts`), and the engine's `setPattern`/`play` turned a pattern's steps into
 * voices (`StudioView` plays a real pattern that way). The v2 arrangement's play path went to `playAudioLanes` instead, which starts **one sample per lane per bar** and only for a lane whose `track_id` is `"audio"`.
 * So a drumkit lane (`track_id: "kick"`) and an instrument lane (`track_id: "lead"`) compiled with four steps on produced **zero** events, and play was silent.
 *
 * This criterion records what the engine was handed, which is the only way to tell "the note reached the sequencer" from "the compile produced something nobody played".
 */
import { describe, expect, it, vi } from "vitest";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { playArrangementV2 } from "../audio/playArrangementV2";
import { FakeAudioBuffer, FakeAudioContext } from "./helpers/fakeAudio";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { ArrangementV2 } from "../types/arrangementV2";
import type { SequencerPattern } from "../types/genre";

const SFZ = "<region> sample=low.wav lokey=0 hikey=59 pitch_keycenter=40\n<region> sample=high.wav lokey=60 hikey=127 pitch_keycenter=72\n";
const ASSETS: SampleAsset[] = [
  { assetId: "piano", name: "Piano", kind: "one-shot", seconds: 1, sfz: { url: "/samples/piano.sfz", path: "piano.sfz" } },
  { assetId: "low.wav", name: "low", kind: "one-shot", seconds: 1, url: "/samples/low.wav" },
  { assetId: "high.wav", name: "high", kind: "one-shot", seconds: 1, url: "/samples/high.wav" },
];

/**
 * A fake engine that records the two calls the arrangement path has to make. It is deliberately the **narrowest** thing that can answer the question: not an `AudioEngine`, because the criterion is about what the
 * player hands over, and a real engine would answer it only through a browser's audio graph.
 */
function recordingEngine(context: FakeAudioContext) {
  const setPattern = vi.fn((_pattern: SequencerPattern) => undefined);
  const play = vi.fn(async () => undefined);
  const stop = vi.fn(() => undefined);
  const setBpm = vi.fn((_bpm: number) => undefined);
  return {
    audioContext: context as never,
    musicDestination: context.createGain() as never,
    setPattern,
    play,
    stop,
    setBpm,
  };
}

function playerWith(engine: ReturnType<typeof recordingEngine>) {
  return createArrangementPlayer({
    engine,
    loadCatalogue: async () => ({ assets: ASSETS }),
    decode: async () => new FakeAudioBuffer(1, 48000, 48000) as unknown as AudioBuffer,
    fetchSfzText: async () => SFZ,
  });
}

const NOTES = [0, 1, 2, 3].map((beat) => ({ pitch: 64, startBeats: beat, lengthBeats: 0.25, velocity: 100 }));
describe("playing a v2 arrangement through the engine's sequencer", () => {
  it("hands the engine a pattern whose lane carries the notes' steps and pitches", async () => {
    const context = new FakeAudioContext();
    const engine = recordingEngine(context);
    const arrangement: ArrangementV2 = {
      songId: "s",
      sourceSlots: [],
      tracks: [{ id: "t1", kind: "instrument", name: "Keys" }],
    };
    await playArrangementV2(arrangement, { t1: NOTES }, playerWith(engine));

    expect(engine.setPattern).toHaveBeenCalledTimes(1);
    const pattern = engine.setPattern.mock.calls[0]![0];
    const lane = pattern.tracks[0]!;
    // The four steps on — one per beat, so each landing on a step boundary — and the pitch they carry: "the note reached the sequencer" is a claim about the data it was given.
    expect(lane.steps.filter((value) => value !== 0)).toHaveLength(4);
    expect(lane.pitch?.[0]).toBe(64);
    expect(lane.pitch?.[4]).toBe(64);
    expect(lane.pitch?.[12]).toBe(64);
    expect(engine.play).toHaveBeenCalledTimes(1);
  });

  it("gives the engine the arrangement's own length and tempo, so a note in bar three has a step to land on", async () => {
    const context = new FakeAudioContext();
    const engine = recordingEngine(context);
    const arrangement: ArrangementV2 = {
      songId: "s",
      sourceSlots: [],
      tracks: [{ id: "t1", kind: "drumkit", name: "Kit" }],
      bars: 3,
      bpm: 96,
    };
    // Bar three begins at beat 32; this note sits on beat 33, which is its own sixteenth at four steps per beat plus one step.
    const noteStep = 4 * 33;
    await playArrangementV2(arrangement, { t1: [{ pitch: 36, startBeats: 33, lengthBeats: 0.25, velocity: 100 }] }, playerWith(engine));

    const pattern = engine.setPattern.mock.calls[0]![0];
    /**
     * The grid reaches past the note — `stepCountFor` rounds the content's reach up to a whole bar — and that is the claim: a one-bar grid would have wrapped this note into bar one or dropped it, and
     * nothing here would have been on step 132.
     */
    expect(pattern.totalSteps).toBeGreaterThanOrEqual(noteStep + 1);
    expect(pattern.tracks[0]!.steps[noteStep]).toBe(1);
    expect(pattern.bpm).toBe(96);
    expect(engine.setBpm).toHaveBeenCalledWith(96);
  });

  it("answers a press with a reason instead of throwing when the engine is not ready", async () => {
    const cold = createArrangementPlayer({
      engine: { audioContext: null, musicDestination: null },
      loadCatalogue: async () => ({ assets: ASSETS }),
    });
    const arrangement: ArrangementV2 = {
      songId: "s",
      sourceSlots: [],
      tracks: [{ id: "t1", kind: "instrument", name: "Keys" }],
    };
    // The audio-lane path already reported rather than threw, and the engine path must not regress that.
    const result = await playArrangementV2(arrangement, { t1: NOTES }, cold);
    expect(result.reason).toMatch(/not ready/);
    expect(result.planned).toBe(0);
  });
});

describe("a sampler lane's steps", () => {
  it("resolves each step's note through the instrument and sounds it at the step's own time", async () => {
    const context = new FakeAudioContext();
    const engine = recordingEngine(context);
    const player = playerWith(engine);
    const arrangement: ArrangementV2 = {
      songId: "s",
      sourceSlots: [],
      tracks: [{ id: "t1", kind: "sampler", name: "Piano", sample: { assetId: "piano" } }],
      bpm: 120,
    };
    // Two notes, one of them above the SFZ's split so two different regions are reached.
    const result = await playArrangementV2(
      arrangement,
      {
        t1: [
          { pitch: 40, startBeats: 0, lengthBeats: 0.25, velocity: 100 },
          { pitch: 72, startBeats: 1, lengthBeats: 0.25, velocity: 100 },
        ],
      },
      player
    );

    // Two buffer sources, one per step: the whole-asset lane would have started one sample per bar instead.
    expect(context.createdBufferSources).toHaveLength(2);
    // Step 0 at the transport's start, and step 4 one **beat** later — four sixteenths at 120 bpm is 0.5 s.
    expect(context.createdBufferSources[0]!.started[0]!.when).toBeCloseTo(0, 6);
    expect(context.createdBufferSources[1]!.started[0]!.when).toBeCloseTo(0.5, 6);
    // Note 72 is the high region's own centre and note 40 the low region's, so both play as recorded rather than at one shared rate.
    expect(context.createdBufferSources[0]!.playbackRate.value).toBeCloseTo(1, 6);
    expect(context.createdBufferSources[1]!.playbackRate.value).toBeCloseTo(1, 6);
    expect(result.planned).toBeGreaterThan(0);
  });

  it("stops the notes it started when the arrangement is stopped", async () => {
    const context = new FakeAudioContext();
    const engine = recordingEngine(context);
    const player = createArrangementPlayer({
      engine,
      loadCatalogue: async () => ({ assets: ASSETS }),
      decode: async () => new FakeAudioBuffer(1, 48000, 48000) as unknown as AudioBuffer,
      fetchSfzText: async () => SFZ,
    });
    const arrangement: ArrangementV2 = {
      songId: "s",
      sourceSlots: [],
      tracks: [{ id: "t1", kind: "sampler", name: "Piano", sample: { assetId: "piano" } }],
    };
    await playArrangementV2(arrangement, { t1: [{ pitch: 40, startBeats: 0, lengthBeats: 0.25, velocity: 100 }] }, player);
    // The arrangement's stop is the only thing that can silence a sample the engine's transport never started.
    expect(player.stop!()).toBeGreaterThan(0);
    expect(context.createdBufferSources[0]!.stopCalls.length).toBeGreaterThan(0);
    // A second stop reports zero rather than stopping the same source twice.
    expect(player.stop!()).toBe(0);
  });
});
