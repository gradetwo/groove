/**
 * A GS-1 host that fails to load is retried, and the attempt count is what makes the retry real.
 *
 * `renderPatternOffline` used to make one attempt inside a bare `catch`, so a transient network fetch
 * or module load left that track on the native synth for that render only — measured at 0.71 dB
 * (chords) to 3.66 dB (lead) of fingerprint change, which is the shape of the rare repeat-render
 * outliers in appendix G.14. The retry is the fix; this file is what stops it from being deleted
 * later, because an unretried failure and a retried one produce *the same render* when the host
 * genuinely cannot load — the difference is only visible in how many times it was tried.
 *
 * The host is mocked here (rather than failing `addModule`) because `createGs1Host` fetches the WASM
 * core before it touches the worklet, so in this environment it throws before any worklet call and
 * the attempt count would be unobservable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DrumPattern } from "../types/genre";

const mocks = vi.hoisted(() => ({ createGs1Host: vi.fn() }));

/**
 * Only the factory is replaced; everything else the module exports is kept.
 *
 * A mock that returns a *subset* is a trap the fixtures walked into twice in one day: `WavExporter` reads
 * `GS1_EXPECTED_ABI` from this module, and a factory that omitted it made the host-acquisition `try` throw — which
 * looked like six hosts built and none used (three retries × two tracks) rather than a missing export.
 */
vi.mock("../audio/gs1/Gs1Host", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audio/gs1/Gs1Host")>();
  return { ...actual, createGs1Host: mocks.createGs1Host };
});

import { exportMasterWav } from "../audio/WavExporter";
import { setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";
import { installFakeOfflineAudioContext } from "./helpers/fakeAudio";

/** Two GS-1-routed tracks (`chords` and `lead`), so two hosts are attempted. */
const PATTERN: DrumPattern = {
  genre_id: "chicago-house",
  bpm: 124,
  swing: 0,
  scale: "minorPentatonic",
  tracks: [
    { name: "Chords", track_id: "chords", instrument: "m1_organ", steps: [1, 0, 0, 0], volume: 0.8, pan: 0 },
    { name: "Lead", track_id: "lead", instrument: "saw_lead", steps: [1, 0, 0, 0], volume: 0.8, pan: 0 },
  ],
};

/**
 * A host stub that satisfies what the renderer actually uses.
 *
 * `noteOnAt`/`noteOffAt` are part of it because the scheduler calls them for every planned note — a
 * stub without them fails inside the render loop, which is how this list was arrived at rather than
 * guessed.
 */
function fakeHost() {
  return {
    ready: Promise.resolve(),
    setPatch: vi.fn(),
    output: { connect: vi.fn() },
    noteOnAt: vi.fn(),
    /**
     * ABI 9's entry point. A stub without it fails inside the render loop the moment the variation is on, which is
     * how this list has always been arrived at (see the note above) — the interface is the source of truth, not the
     * set of calls a stub happened to see.
     */
    setTuningNote: vi.fn(),
    noteOffAt: vi.fn(),
    dispose: vi.fn(),
  };
}

const ATTEMPTS_PER_HOST = 3;

describe("GS-1 host loading", () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    mocks.createGs1Host.mockReset();
    restore = installFakeOfflineAudioContext();
    setGs1RoutingEnabled(true);
  });

  afterEach(() => {
    restore?.();
    restore = null;
    setGs1RoutingEnabled(true);
  });

  it("retries a failing host instead of giving up on the first attempt", async () => {
    mocks.createGs1Host.mockRejectedValue(new Error("transient fetch failure"));

    const result = await exportMasterWav(PATTERN, "chicago-house", { bpm: 124 });

    // Two routed tracks, three attempts each.
    expect(mocks.createGs1Host).toHaveBeenCalledTimes(2 * ATTEMPTS_PER_HOST);
    expect(result.gs1HostFailures).toBe(2);
  });

  it("stops retrying as soon as an attempt succeeds", async () => {
    // Second attempt wins: one failure then a host, per track.
    let call = 0;
    mocks.createGs1Host.mockImplementation(() => {
      call += 1;
      return call % 2 === 1 ? Promise.reject(new Error("first attempt fails")) : Promise.resolve(fakeHost());
    });

    const result = await exportMasterWav(PATTERN, "chicago-house", { bpm: 124 });

    expect(mocks.createGs1Host).toHaveBeenCalledTimes(2 * 2);
    expect(result.gs1HostFailures).toBe(0);
  });

  it("uses the first attempt when it works, and patches the voice it loaded", async () => {
    const hosts = [fakeHost(), fakeHost()];
    let call = 0;
    mocks.createGs1Host.mockImplementation(() => Promise.resolve(hosts[call++]));

    const result = await exportMasterWav(PATTERN, "chicago-house", { bpm: 124 });

    expect(mocks.createGs1Host).toHaveBeenCalledTimes(2);
    expect(result.gs1HostFailures).toBe(0);
    /**
     * A host that loaded must be given its patch, wired in, *and* played — otherwise "no failure
     * reported" would be true of a render that silently dropped the track's notes instead.
     */
    for (const host of hosts) {
      expect(host.setPatch).toHaveBeenCalledTimes(1);
      expect(host.output.connect).toHaveBeenCalledTimes(1);
      expect(host.noteOnAt.mock.calls.length).toBeGreaterThan(0);
    }
  });

  it("does not attempt a host at all when routing is off", async () => {
    setGs1RoutingEnabled(false);
    const result = await exportMasterWav(PATTERN, "chicago-house", { bpm: 124 });
    expect(mocks.createGs1Host).not.toHaveBeenCalled();
    expect(result.gs1HostFailures).toBe(0);
  });
});
