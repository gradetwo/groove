/**
 * Responsiveness of the GS-1 switch and of timbre switching during playback (item ② of the
 * v2.0.18 follow-up).
 *
 * The report: "whether GS-1 is on or off, switching a track's timbre while it is playing often
 * does nothing for a moment and the display lags; it feels stuck." Reading the code found three
 * mechanisms that produce exactly that, and none of them is a listening matter — they are all
 * lifecycle work on the main thread:
 *
 *  1. **A host was rebuilt on every timbre change.** `ensureTrack`/`tryPlay` treated "different
 *     instrument" as "tear this slot down and load a new host", so switching from one GS-1 patch
 *     to another disposed a perfectly usable worklet, played the following notes on the *native*
 *     engine while the replacement compiled, and only then switched back — heard as "the timbre
 *     did not change, then it did".
 *  2. **Switching GS-1 off disposed synchronously** inside the click handler.
 *  3. **Every pattern commit re-pushed all eight insert chains**, and `setPattern` runs on every
 *     commit (step toggles, timbre changes, coalesced drags).
 *
 * These tests pin the fixes. They deliberately use the injected-host seam, so no WASM is involved
 * and the assertions are about *work that is not done* — which is the whole point.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { Gs1VoicePool, type PoolNote } from "../audio/gs1/Gs1VoicePool";
import { DEFAULT_GS1_ROUTING_ENABLED, setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";
import { GS1_EXPECTED_ABI, type Gs1Host } from "../audio/gs1/Gs1Host";
import type { SequencerPattern, SequencerTrack } from "../types/genre";
import { installFakeAudioContext } from "./helpers/fakeAudio";

const SR = 48000;

function makeHost() {
  const calls = { noteOnAt: 0, patches: 0, allNotesOff: 0, dispose: 0 };
  const host = {
    scheduledNoteLatencyFrames: 128,
    ready: Promise.resolve({ abi: GS1_EXPECTED_ABI, variant: "simd" }),
    output: { connect: vi.fn() },
    noteOnAt: () => {
      calls.noteOnAt += 1;
    },
    noteOffAt: () => {},
    setPatch: () => {
      calls.patches += 1;
    },
    allNotesOff: () => {
      calls.allNotesOff += 1;
    },
    dispose: () => {
      calls.dispose += 1;
    },
  } as unknown as Gs1Host;
  return { host, calls };
}

const ctx = { sampleRate: SR } as BaseAudioContext;
const dest = {} as AudioNode;
const note = (over: Partial<PoolNote> = {}): PoolNote => ({
  note: 60,
  time: 0.5,
  duration: 0.25,
  velocity: 0.8,
  ...over,
});

beforeEach(() => {
  setGs1RoutingEnabled(true);
  localStorage.clear();
});
afterEach(() => {
  setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
  localStorage.clear();
});

describe("GS-1 pool · a timbre change must not rebuild the host", () => {
  it("reuses the loaded host and just pushes the new patch", async () => {
    const first = makeHost();
    const createHost = vi.fn(async () => first.host); // one host no matter how many instruments
    const pool = new Gs1VoicePool(ctx, { createHost: createHost as never });

    await pool.ensureTrack(4, "chords", "warm_pad", dest);
    expect(pool.tryPlay(4, "chords", "warm_pad", [note()], dest)).toBe(true);
    const patchesAfterFirst = first.calls.patches;

    // Same track, different GS-1 instrument (`warm_pad` and `rhodes_ep` are both routed for
    // chords): the note must still be GS-1's (not a native fallback), the host must not be
    // recreated, and the patch must actually change.
    expect(pool.tryPlay(4, "chords", "rhodes_ep", [note()], dest)).toBe(true);
    expect(createHost).toHaveBeenCalledTimes(1);
    expect(first.calls.dispose).toBe(0);
    expect(first.calls.noteOnAt).toBe(2);
    expect(first.calls.patches).toBeGreaterThan(patchesAfterFirst);
  });

  it("keeps the host alive when the new instrument has no GS-1 patch", async () => {
    const { host, calls } = makeHost();
    const pool = new Gs1VoicePool(ctx, { createHost: (async () => host) as never });
    await pool.ensureTrack(4, "chords", "warm_pad", dest);
    expect(pool.tryPlay(4, "chords", "warm_pad", [note()], dest)).toBe(true);

    // `piano` is deliberately not routed to GS-1 (an acoustic body has no honest subtractive
    // equivalent), so this must play natively — but the host stays, because the user may switch
    // back and tearing it down here is exactly what made switching feel slow.
    const before = calls.noteOnAt;
    expect(pool.tryPlay(4, "chords", "piano", [note()], dest)).toBe(false);
    expect(calls.noteOnAt).toBe(before);
    expect(calls.dispose).toBe(0);

    // Switching back is immediate: same host, no new creation.
    expect(pool.tryPlay(4, "chords", "warm_pad", [note()], dest)).toBe(true);
    expect(pool.isTrackReady(4)).toBe(true);
  });
});

describe("AudioEngine · switching GS-1 off must not stall the click", () => {
  let restore: () => void;
  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore();
  });

  const makeEngineAndPool = () => {
    const { host, calls } = makeHost();
    const pool = {
      isTrackReady: () => true,
      ensureTrack: async () => true,
      tryPlay: () => true,
      releaseAll: vi.fn(),
      dispose: vi.fn(),
    } as unknown as Gs1VoicePool;
    const engine = new AudioEngine({ createGs1Pool: () => pool });
    void host;
    void calls;
    return { engine, pool };
  };

  it("silences immediately but defers the teardown, and cancels it if switched back on", () => {
    vi.useFakeTimers();
    try {
      const { engine, pool } = makeEngineAndPool();

      engine.setGs1Enabled(false);
      // Audible output stops now: no waiting for the teardown.
      expect(pool.releaseAll).toHaveBeenCalledTimes(1);
      // But the expensive part has not happened yet.
      expect(pool.dispose).not.toHaveBeenCalled();

      // Flipping back on inside the grace period keeps the loaded hosts (no reload to pay).
      engine.setGs1Enabled(true);
      vi.advanceTimersByTime(10_000);
      expect(pool.dispose).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does dispose once the user stays switched off", () => {
    vi.useFakeTimers();
    try {
      const { engine, pool } = makeEngineAndPool();
      engine.setGs1Enabled(false);
      vi.advanceTimersByTime(5_000);
      expect(pool.dispose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("AudioEngine · a pattern commit only re-applies what changed", () => {
  let restore: () => void;
  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore();
  });

  const track = (over: Partial<SequencerTrack> = {}): SequencerTrack =>
    ({
      track_id: "chords",
      name: "Chords",
      instrument: "warm_pad",
      steps: new Array(16).fill(1),
      velocity: new Array(16).fill(100),
      volume: 0.8,
      pan: 0,
      ...over,
    }) as unknown as SequencerTrack;

  const pattern = (tracks: SequencerTrack[]): SequencerPattern =>
    ({ genre_id: "chicago-house", bpm: 120, scale: "C minor", totalSteps: 16, tracks }) as SequencerPattern;

  it("does not push unchanged chains again, and pushes a changed one exactly once", () => {
    const engine = new AudioEngine();
    const tracks = [track(), track({ track_id: "lead", name: "Lead" })];
    engine.setPattern(pattern(tracks));
    const afterFirst = engine.getPatternInsertApplications();
    expect(afterFirst).toBe(2); // one per track, the first time

    // A commit that changes something else entirely (e.g. a step) must not re-push chains.
    engine.setPattern(pattern([track(), track({ track_id: "lead", name: "Lead" })]));
    expect(engine.getPatternInsertApplications()).toBe(afterFirst);

    // Editing one track's chain re-applies that track and nothing else.
    const edited = [track({ insert: { drive: { enabled: true, amount: 0.4, mix: 0.3 } } as never }), track({ track_id: "lead", name: "Lead" })];
    engine.setPattern(pattern(edited));
    expect(engine.getPatternInsertApplications()).toBe(afterFirst + 1);
  });

  it("re-resolves the chains when the genre changes, because the defaults differ", () => {
    const engine = new AudioEngine();
    engine.setPattern(pattern([track()]));
    const afterFirst = engine.getPatternInsertApplications();

    engine.setPattern({ ...pattern([track()]), genre_id: "heavy-metal" });
    expect(engine.getPatternInsertApplications()).toBe(afterFirst + 1);
  });
});
