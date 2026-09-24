/**
 * GS-1 voice pool — the live-playback half of the P6 wiring.
 *
 * Tested with an injected host stub, so none of this touches WASM: what is asserted here is the
 * *policy* — when GS-1 takes a note, when it refuses (and the native engine must cover it), how
 * many hosts exist, and that the polyphony ceiling is applied before anything is sent.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Gs1VoicePool, type PoolNote } from "../audio/gs1/Gs1VoicePool";
import { GS1_EXPECTED_ABI } from "../audio/gs1/Gs1Host";
import { DEFAULT_GS1_ROUTING_ENABLED, setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";
import type { Gs1Host } from "../audio/gs1/Gs1Host";

const SR = 48000;

/** A host stub that records what it was told to do. */
function makeHost(options: { latency?: number; readyDelayMs?: number; fail?: boolean } = {}) {
  const calls: { noteOnAt: number[][]; noteOffAt: number[][]; patches: number } = {
    noteOnAt: [],
    noteOffAt: [],
    patches: 0,
  };
  const host = {
    scheduledNoteLatencyFrames: options.latency ?? 128,
    ready: options.fail
      ? Promise.reject(new Error("load failed"))
      : new Promise<{ abi: number; variant: "simd" }>((resolve) =>
          setTimeout(() => resolve({ abi: GS1_EXPECTED_ABI, variant: "simd" }), options.readyDelayMs ?? 0)
        ),
    output: { connect: vi.fn() },
    noteOnAt: (note: number, velocity: number, atFrame: number, pan?: number) =>
      calls.noteOnAt.push([note, velocity, atFrame, pan ?? 0]),
    noteOffAt: (note: number, atFrame: number) => calls.noteOffAt.push([note, atFrame]),
    setPatch: () => {
      calls.patches += 1;
    },
    allNotesOff: vi.fn(),
    dispose: vi.fn(),
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

afterEach(() => setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED));

describe("the pool refuses until it can actually play", () => {
  it("returns false while routing is disabled", () => {
    setGs1RoutingEnabled(false);
    const pool = new Gs1VoicePool(ctx, { createHost: (async () => makeHost().host) as never });
    expect(pool.tryPlay(0, "chords", "warm_pad", [note()], dest)).toBe(false);
  });

  it("returns false for the first note and loads in the background", async () => {
    setGs1RoutingEnabled(true);
    const { host, calls } = makeHost({ readyDelayMs: 5 });
    const createHost = vi.fn(async () => host);
    const pool = new Gs1VoicePool(ctx, { createHost: createHost as never });

    // The scheduler cannot await a download: this note goes native.
    expect(pool.tryPlay(0, "chords", "warm_pad", [note()], dest)).toBe(false);
    await vi.waitFor(() => expect(pool.isTrackReady(0)).toBe(true));
    expect(createHost).toHaveBeenCalledTimes(1);
    expect(calls.noteOnAt).toHaveLength(0);
    // …and once ready, the next note is GS-1's.
    expect(pool.tryPlay(0, "chords", "warm_pad", [note()], dest)).toBe(true);
    expect(calls.noteOnAt).toHaveLength(1);
  });

  it("returns false for an instrument with no GS-1 patch, even when ready", async () => {
    setGs1RoutingEnabled(true);
    const { host } = makeHost();
    const pool = new Gs1VoicePool(ctx, { createHost: (async () => host) as never });
    await pool.ensureTrack(0, "chords", "warm_pad", dest);
    expect(pool.isTrackReady(0)).toBe(true);
    // A native decision is a `null` plan, not a failure to load.
    expect(pool.tryPlay(0, "chords", "piano_lead", [note()], dest)).toBe(false);
  });

  it("survives a failed load and stays on the native engine", async () => {
    setGs1RoutingEnabled(true);
    const pool = new Gs1VoicePool(ctx, { createHost: (async () => makeHost({ fail: true }).host) as never });
    await pool.ensureTrack(0, "chords", "warm_pad", dest);
    expect(pool.isTrackReady(0)).toBe(false);
    expect(pool.tryPlay(0, "chords", "warm_pad", [note()], dest)).toBe(false);
  });
});

describe("what the pool sends", () => {
  it("posts frame-addressed note-on and note-off, compensated for the reported latency", async () => {
    setGs1RoutingEnabled(true);
    const { host, calls } = makeHost({ latency: 128 });
    const pool = new Gs1VoicePool(ctx, { createHost: (async () => host) as never });
    await pool.ensureTrack(0, "chords", "warm_pad", dest);

    expect(pool.tryPlay(0, "chords", "warm_pad", [note({ note: 64, time: 1, duration: 0.5 })], dest)).toBe(true);
    expect(calls.noteOnAt).toEqual([[64, 0.8, SR - 128, 0]]);
    expect(calls.noteOffAt).toEqual([[64, 1.5 * SR - 128]]);
  });

  it("pushes the patch once and only when it changes", async () => {
    setGs1RoutingEnabled(true);
    const { host, calls } = makeHost();
    const pool = new Gs1VoicePool(ctx, { createHost: (async () => host) as never });
    await pool.ensureTrack(0, "chords", "warm_pad", dest);

    pool.tryPlay(0, "chords", "warm_pad", [note()], dest);
    pool.tryPlay(0, "chords", "warm_pad", [note()], dest);
    expect(calls.patches).toBe(1);
    // A different instrument on the same track is a different patch: reload, not reuse.
    await pool.ensureTrack(0, "chords", "supersaw", dest);
    pool.tryPlay(0, "chords", "supersaw", [note()], dest);
    expect(calls.patches).toBe(2);
  });

  it("caps polyphony before sending, keeping the newest notes", async () => {
    setGs1RoutingEnabled(true);
    const { host, calls } = makeHost();
    const pool = new Gs1VoicePool(ctx, { createHost: (async () => host) as never, maxVoices: 3 });
    await pool.ensureTrack(0, "chords", "warm_pad", dest);

    const many = Array.from({ length: 6 }, (_, i) => note({ note: 48 + i, time: i * 0.05 }));
    expect(pool.tryPlay(0, "chords", "warm_pad", many, dest)).toBe(true);
    expect(calls.noteOnAt).toHaveLength(3);
    // The three latest onsets survive: dropping the *new* notes would sound like a stuck chord.
    expect(calls.noteOnAt.map((c) => c[0])).toEqual([51, 52, 53]);
    expect(calls.noteOffAt).toHaveLength(3);
  });

  it("keeps one host per track, and releases or drops them on demand", async () => {
    setGs1RoutingEnabled(true);
    const first = makeHost();
    const second = makeHost();
    const hosts = [first.host, second.host];
    const createHost = vi.fn(async () => hosts[createHost.mock.calls.length - 1]);
    const pool = new Gs1VoicePool(ctx, { createHost: createHost as never });

    await pool.ensureTrack(0, "chords", "warm_pad", dest);
    await pool.ensureTrack(1, "lead", "saw_lead", dest);
    expect(createHost).toHaveBeenCalledTimes(2);
    expect(pool.isTrackReady(0)).toBe(true);
    expect(pool.isTrackReady(1)).toBe(true);

    pool.releaseAll();
    expect(first.host.allNotesOff).toHaveBeenCalled();
    expect(second.host.allNotesOff).toHaveBeenCalled();

    pool.dispose();
    expect(first.host.dispose).toHaveBeenCalled();
    expect(second.host.dispose).toHaveBeenCalled();
    // After disposal the pool is inert rather than throwing at a torn-down graph.
    expect(pool.tryPlay(0, "chords", "warm_pad", [note()], dest)).toBe(false);
  });

  it("keeps the live host when a caller asks for a different destination", async () => {
    // Regression (v2.0.18): audition routes to the master output while playback routes to the
    // track strip. Treating that difference as "rebuild this slot" made the two tear down each
    // other's hosts — the next sequencer note then found a mismatched slot, fell back to native
    // and rebuilt again. That loop is the reported "the audition button has latency, or does not
    // sound". A host's output is connected once, so a destination difference is not a rebuild
    // reason; the engine disposes the whole pool when it rebuilds the master graph.
    setGs1RoutingEnabled(true);
    const { host, calls } = makeHost();
    const createHost = vi.fn(async () => host);
    const pool = new Gs1VoicePool(ctx, { createHost: createHost as never });
    const masterDest = {} as AudioNode;

    await pool.ensureTrack(0, "chords", "warm_pad", dest);
    expect(pool.tryPlay(0, "chords", "warm_pad", [note()], masterDest)).toBe(true);
    expect(createHost).toHaveBeenCalledTimes(1);
    expect(host.dispose).not.toHaveBeenCalled();
    expect(calls.noteOnAt.length).toBe(1);

    // A different *instrument* must NOT rebuild either (v2.0.19): the host is instrument-agnostic
    // — a patch is a set of parameters — so switching timbre just pushes the new patch in
    // `tryPlay`. Rebuilding here was what made switching timbre during playback tear the worklet
    // down, play the next notes natively while the replacement compiled, and only then come back.
    expect(await pool.ensureTrack(0, "chords", "rhodes_ep", dest)).toBe(true);
    expect(createHost).toHaveBeenCalledTimes(1);
    expect(host.dispose).not.toHaveBeenCalled();
    expect(pool.tryPlay(0, "chords", "rhodes_ep", [note()], dest)).toBe(true);
    expect(calls.noteOnAt.length).toBe(2);
  });
});
