/**
 * P6 parity: live and offline must agree on *when* a GS-1 note sounds.
 *
 * This is the test the wiring was gated on. The project's hard rule is that playback and the
 * exported WAV render the same music; routing `chords`/`lead` through GS-1 introduces a second
 * scheduler, so the risk is not "does it make sound" but "does it make sound at the same frames
 * in both paths".
 *
 * The host is mocked (no WASM in a unit test) but everything else is real: the real exporter, the
 * real shared planner (`gs1Tracks.planGs1Notes`), and the real per-note times and durations the
 * exporter computes. The assertion is that the offline renderer addresses its events exactly as
 * the live pool would for the same notes — same frames, same latency subtraction, same order.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/** Recorded host interactions, shared with the mock below. */
const recorded = vi.hoisted(() => ({
  noteOnAt: [] as number[][],
  noteOffAt: [] as number[][],
  /** `[note, cents]` pairs the renderer sent (ABI 9's per-note variation). */
  tuning: [] as number[][],
  patches: 0,
  latencyFrames: 128,
  hosts: 0,
}));

vi.mock("../audio/gs1/Gs1Host", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audio/gs1/Gs1Host")>();
  return {
  ...actual,
  createGs1Host: async () => {
    recorded.hosts += 1;
    return {
      scheduledNoteLatencyFrames: recorded.latencyFrames,
      ready: Promise.resolve({ abi: GS1_EXPECTED_ABI, variant: "simd" }),
      output: { connect: () => undefined },
      noteOnAt: (note: number, velocity: number, atFrame: number, pan?: number) =>
        recorded.noteOnAt.push([note, velocity, atFrame, pan ?? 0]),
      noteOffAt: (note: number, atFrame: number) => recorded.noteOffAt.push([note, atFrame]),
      /**
       * ABI 9's entry point, recorded like the others: the renderer sends the per-note variation through it, and a
       * stub that omits it fails inside the render loop rather than at the interface.
       */
      setTuningNote: (note: number, cents: number) => recorded.tuning.push([note, cents]),
      setPatch: () => {
        recorded.patches += 1;
      },
      allNotesOff: () => undefined,
      dispose: () => undefined,
    };
  },
  };
});

import { GS1_EXPECTED_ABI } from "../audio/gs1/Gs1Host";
import { renderPatternOffline } from "../audio/WavExporter";
import {
  DEFAULT_GS1_ROUTING_ENABLED,
  planGs1Notes,
  setGs1RoutingEnabled,
} from "../audio/gs1/gs1Tracks";
import { Gs1VoicePool } from "../audio/gs1/Gs1VoicePool";
import { chordVoicingForStep, chordNoteDuration, chordVoiceOnset, chordVoiceGain } from "../audio/chordVoicing";
import { resolveChordTreatment } from "../data/genreVoicing";
import { installFakeOfflineAudioContext, FakeOfflineAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern } from "../types/genre";

const SR = 48000;
/** A pattern whose chords and lead both land on step 0, so the frames are easy to reason about. */
function makePattern(): SequencerPattern {
  const steps = 16;
  const track = (track_id: string, name: string, instrument: string, pitch: number) => ({
    track_id,
    name,
    instrument,
    steps: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    velocity: new Array(steps).fill(100),
    pitch: [pitch, ...new Array(steps - 1).fill(0)],
    gate: new Array(steps).fill(0.8),
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
  });
  return {
    genre_id: "heavy-metal",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: [
      track("chords", "Chords", "distorted_guitar", 60),
      track("lead", "Lead", "saw_lead", 72),
    ] as SequencerPattern["tracks"],
  };
}

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
  setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
  recorded.noteOnAt.length = 0;
  recorded.tuning.length = 0;
  recorded.noteOffAt.length = 0;
  recorded.patches = 0;
  recorded.hosts = 0;
});

describe("GS-1 export parity", () => {
  it("changes nothing at all while routing is off", async () => {
    restore = installFakeOfflineAudioContext();
    setGs1RoutingEnabled(false);
    await renderPatternOffline(makePattern(), { bars: 1, sampleRate: SR });
    // The default path must not even look for a host.
    expect(recorded.hosts).toBe(0);
    expect(recorded.noteOnAt).toHaveLength(0);
  });

  it("addresses offline GS-1 events at the same frames the live pool would use", async () => {
    restore = installFakeOfflineAudioContext();
    setGs1RoutingEnabled(true);
    const pattern = makePattern();
    await renderPatternOffline(pattern, { bars: 1, sampleRate: SR });

    if (recorded.hosts !== 2) {
      console.log("DIAG hosts", recorded.hosts, "patches", recorded.patches, "noteOn", recorded.noteOnAt.length, "tuning", JSON.stringify(recorded.tuning));
    }
    // One host per routed track, each patch pushed once.
    expect(recorded.hosts).toBe(2);
    expect(recorded.patches).toBe(2);
    expect(recorded.noteOnAt.length).toBeGreaterThan(0);

    /**
     * The parity claim, stated positively: the exporter's frames are what the *shared planner*
     * produces for the same inputs. The exporter is free to compute its note times however it
     * likes, but the frame arithmetic — including the latency subtraction — must not be
     * re-implemented on either side, because that is exactly how playback and export drift apart.
     */
    const chordTrack = pattern.tracks[0];
    const stepDur = 60 / pattern.bpm / 4;
    const treatment = resolveChordTreatment(pattern.genre_id, chordTrack.instrument);
    const notes = chordVoicingForStep(60, pattern.scale, { style: treatment.style });
    const chordDur = chordNoteDuration(stepDur, 0.8, treatment);
    const expected = planGs1Notes({
      role: "chords",
      instrument: chordTrack.instrument,
      notes: notes.map((note, i) => ({
        note,
        time: chordVoiceOnset(0, i, treatment),
        duration: chordDur,
        velocity: (100 / 127) * chordVoiceGain(notes.length),
      })),
      sampleRate: SR,
      latencyFrames: recorded.latencyFrames,
    })!;
    const expectedFrames = expected.notes.map((note) => note.atFrame);

    // The offline chord events for step 0 are the first `notes.length` recorded.
    const offlineFrames = recorded.noteOnAt.slice(0, notes.length).map((call) => call[2]);
    expect(offlineFrames).toEqual(expectedFrames);
    expect(offlineFrames.length).toBe(notes.length);

    // …and the live pool, handed the same notes, produces the same frames.
    const dest = {} as AudioNode;
    const live = new Gs1VoicePool({ sampleRate: SR } as BaseAudioContext, {
      createHost: (async () => ({
        scheduledNoteLatencyFrames: recorded.latencyFrames,
        ready: Promise.resolve({ abi: GS1_EXPECTED_ABI, variant: "simd" }),
        output: { connect: () => undefined },
        noteOnAt: (note: number, velocity: number, atFrame: number) =>
          recorded.noteOnAt.push([note, velocity, atFrame, 0]),
        noteOffAt: (note: number, atFrame: number) => recorded.noteOffAt.push([note, atFrame]),
      /**
       * ABI 9's entry point, recorded like the others: the renderer sends the per-note variation through it, and a
       * stub that omits it fails inside the render loop rather than at the interface.
       */
      setTuningNote: (note: number, cents: number) => recorded.tuning.push([note, cents]),
        setPatch: () => undefined,
        allNotesOff: () => undefined,
        dispose: () => undefined,
      })) as never,
    });
    await live.ensureTrack(0, "chords", chordTrack.instrument, dest);
    const before = recorded.noteOnAt.length;
    expect(
      live.tryPlay(
        0,
        "chords",
        chordTrack.instrument,
        notes.map((note, i) => ({
          note,
          time: chordVoiceOnset(0, i, treatment),
          duration: chordDur,
          velocity: (100 / 127) * chordVoiceGain(notes.length),
        })),
        dest
      )
    ).toBe(true);
    const liveFrames = recorded.noteOnAt.slice(before).map((call) => call[2]);
    expect(liveFrames).toEqual(expectedFrames);
    live.dispose();
  });

  it("keeps the native voices out of a GS-1 track, so nothing is doubled", async () => {
    restore = installFakeOfflineAudioContext();
    setGs1RoutingEnabled(true);
    await renderPatternOffline(makePattern(), { bars: 1, sampleRate: SR });
    const ctx = FakeOfflineAudioContext.lastInstance!;
    // The chords/lead tracks are GS-1's, so the native synth created no oscillators for them.
    // (A bass or fx track in the same pattern would still create them — this pattern has none.)
    expect(ctx.createdOscillators.length).toBe(0);
  });
});
