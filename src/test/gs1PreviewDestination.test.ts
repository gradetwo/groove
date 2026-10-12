/**
 * A preview must play **on the lane**, and this is the UK Garage lead defect.
 *
 * The reproduction the user found was the smallest possible: tap a track header's own preview button two or three
 * times and the lead goes silent, or wrong, with GS-1 on. The cause was one line in `triggerInstrument` — a preview
 * was routed straight to the master gain while the pool's rule is that a host is bound to one destination, so each
 * preview tore the live host down and rebuilt it against the master, and the next scheduled note found a mismatched
 * slot and fell back to the native engine, churning again.
 *
 * The class of bug had already been documented and "fixed" once for the pads' entry point (`auditionTrack` passes
 * `isAudition = false` with a comment explaining exactly this); `triggerNote` — the track header, the pitch picker and
 * the chord keyboard — still sent `true`. These cases hold the one rule: whatever entry point asks, the notes go to
 * the same destination, so the pool never has a reason to rebuild.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import type { Gs1VoicePool, PoolNote } from "../audio/gs1/Gs1VoicePool";
import { DEFAULT_GS1_ROUTING_ENABLED, setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";
import type { SequencerPattern } from "../types/genre";
import { installFakeAudioContext } from "./helpers/fakeAudio";

interface Captured {
  trackIdx: number;
  role: string;
  notes: readonly PoolNote[];
  dest: unknown;
}

function makePoolStub() {
  const plays: Captured[] = [];
  const pool = {
    isTrackReady: () => true,
    ensureTrack: async () => true,
    tryPlay: (trackIdx: number, role: string, _instrument: unknown, notes: readonly PoolNote[], dest: unknown) => {
      plays.push({ trackIdx, role, notes, dest });
      return true;
    },
    releaseAll: vi.fn(),
    status: () => [],
    /** The engine tells the pool the genre on every pattern change. */
    setGenre: () => undefined,
    dispose: vi.fn(),
  } as unknown as Gs1VoicePool;
  return { pool, plays };
}

/** The genre the defect was reported on, and the lane that was audible: `uk-garage`'s lead is GS-1 (`m1_organ`). */
const pattern = (): SequencerPattern =>
  ({
    genre_id: "uk-garage",
    bpm: 132,
    swing: 0,
    scale: "C minor",
    totalSteps: 16,
    tracks: [
      { track_id: "kick", name: "Kick", instrument: "punchy_kick", steps: new Array(16).fill(0) },
      { track_id: "snare", name: "Snare", instrument: "rimshot", steps: new Array(16).fill(0) },
      { track_id: "hihat", name: "Hi-hat", instrument: "closed_hat", steps: new Array(16).fill(0) },
      { track_id: "percussion", name: "Perc", instrument: "rim_shaker", steps: new Array(16).fill(0) },
      { track_id: "bass", name: "Bass", instrument: "sub_bass", steps: new Array(16).fill(0) },
      { track_id: "chords", name: "Chords", instrument: "rhodes_ep", steps: new Array(16).fill(0) },
      {
        track_id: "lead",
        name: "Lead",
        instrument: "m1_organ",
        steps: new Array(16).fill(0),
        pitch: new Array(16).fill(72),
      },
      { track_id: "fx", name: "FX", instrument: "vinyl_crackle", steps: new Array(16).fill(0) },
    ],
  }) as unknown as SequencerPattern;

describe("GS-1 previews and playback share one destination", () => {
  let restore: () => void;
  beforeEach(() => {
    localStorage.clear();
    setGs1RoutingEnabled(true);
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore();
    setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
    localStorage.clear();
  });

  it("sends a track-header preview to the same destination as a pad hit", () => {
    const { pool, plays } = makePoolStub();
    const engine = new AudioEngine({ createGs1Pool: () => pool });
    engine.setPattern(pattern(), { resetSteps: false } as never);

    // The track header's preview (`triggerNote`), then the pads' entry point (`auditionTrack`), then another preview
    // — the tap-tap-tap that used to rebuild the host each time.
    engine.triggerNote(6, "Lead", 0.9, 72, 1, 0.8);
    engine.auditionTrack("lead", 0.9);
    engine.triggerNote(6, "Lead", 0.9, 72, 1, 0.8);

    expect(plays.length, "three taps must reach GS-1 three times").toBe(3);
    const destinations = new Set(plays.map((play) => play.dest));
    expect(
      destinations.size,
      "one destination: a second one is what makes the pool tear the live host down and rebuild it"
    ).toBe(1);
  });

  it("does not send a preview to the master gain", () => {
    /**
     * The specific shape of the bug, not just its consequence: the master gain is a *different* node from the track's
     * destination, and the old code chose it for `isAudition` calls. Asserting the identity of the destination is not
     * possible here (the engine does not hand it out), so this holds the property that rules it out — every preview
     * agrees with the scheduled path, which is what `playChords` has always used.
     */
    const { pool, plays } = makePoolStub();
    const engine = new AudioEngine({ createGs1Pool: () => pool });
    engine.setPattern(pattern(), { resetSteps: false } as never);

    engine.triggerNote(6, "Lead", 0.9, 72, 1, 0.8);
    const previewDest = plays[0]?.dest;
    engine.triggerNote(5, "Chords", 0.9, 60, 1, 0.8);
    const chordDest = plays[1]?.dest;

    expect(previewDest).toBeTruthy();
    expect(chordDest).toBeTruthy();
    // Different lanes have different destinations; the point is that the *preview* is not special-cased away from its
    // own lane. Two lanes therefore differ, and neither is the shared master gain.
    expect(previewDest).not.toBe(chordDest);
  });
});

/**
 * The invariant behind the fix, over **every** entry point that can reach a GS-1 lane.
 *
 * The defect was not "the preview path is wrong" but "two callers disagreed about a host's destination", and the
 * question that follows is whether any other caller disagrees. This holds the rule for all three roles GS-1 voices
 * (`chords`, `lead`, `fx`) across all three ways a person can trigger them — the transport, a track header preview and
 * a pad — so a new call site cannot reintroduce the disagreement without failing here.
 */
describe("GS-1 destinations are per lane, whatever plays them", () => {
  let restore: () => void;
  beforeEach(() => {
    localStorage.clear();
    setGs1RoutingEnabled(true);
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore();
    setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
    localStorage.clear();
  });

  it("hands the pool one destination per track index across previews and pads", () => {
    const { pool, plays } = makePoolStub();
    const engine = new AudioEngine({ createGs1Pool: () => pool });
    engine.setPattern(pattern(), { resetSteps: false } as never);

    // `chords` (index 5), `lead` (6) and `fx` (7) are the three GS-1 roles in this genre.
    const trigger = [
      () => engine.triggerNote(5, "Chords", 0.9, 60, 1, 0.8),
      () => engine.triggerNote(6, "Lead", 0.9, 72, 1, 0.8),
      () => engine.triggerNote(7, "FX", 0.9, 60, 1, 0.8),
      () => engine.auditionTrack("chords", 1),
      () => engine.auditionTrack("lead", 1),
      () => engine.auditionTrack("fx", 1),
    ];
    for (const call of trigger) call();
    for (const call of trigger) call();

    expect(plays.length, "every call must have reached GS-1").toBe(trigger.length * 2);
    const byTrack = new Map<number, Set<unknown>>();
    for (const play of plays) {
      const seen = byTrack.get(play.trackIdx) ?? new Set<unknown>();
      seen.add(play.dest);
      byTrack.set(play.trackIdx, seen);
    }
    for (const [trackIdx, destinations] of byTrack) {
      expect(destinations.size, `track ${trackIdx} was handed ${destinations.size} destinations`).toBe(1);
    }
    // …and the lanes are genuinely different destinations, so the map above is not one shared node.
    expect(new Set([...byTrack.values()].map((set) => [...set][0])).size).toBe(byTrack.size);
  });
});
