/**
 * A stem render must not build GS-1 hosts for tracks it is going to drop.
 *
 * ## Why this is a correctness test and not just a speed one
 *
 * Each GS-1 host instantiates a WASM core in that context's worklet scope (that is what the vendored
 * processor does — see `src/audio/gs1/Gs1Host.ts`), and the page's WASM memory budget is finite **and
 * not reclaimable**. `scripts/probe_gs1_memory_release.mjs` measures the wall at **~124 hosts** with a
 * fresh browser per policy: `keep`, `keep+gc`, `dispose`, `dispose+gc` and `dispose+close` all fail at
 * instance 124-125 with
 *
 *   RangeError: WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance
 *
 * (`OfflineAudioContext.close()` does not even exist, and `host.dispose()` only disconnects the node.)
 * Past that point `renderPatternOffline` counts a failure and voices the track with the native synth
 * instead, so the export is a different file than the audition — measured on `ambient`: the chords
 * stem **+13.05 dB** and the lead stem **-16.56 dB** between a fresh page and one that had rendered 60
 * other genres.
 *
 * The renderer used to build two hosts for *every* stem render (one per GS-1 role) although the
 * scheduling loop drops every track but its own on the first line, so one export cost 2 + 8×2 = 18
 * hosts of which 14 could never play a note. That is the difference between ~7 and ~31 exports per
 * page before GS-1 dies, which is why this is pinned by a test rather than left to a comment.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DrumPattern } from "../types/genre";

const mocks = vi.hoisted(() => ({ createGs1Host: vi.fn() }));

vi.mock("../audio/gs1/Gs1Host", () => ({
  createGs1Host: mocks.createGs1Host,
}));

import { renderPatternOffline, exportStemsWav } from "../audio/WavExporter";
import { setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";
import { installFakeOfflineAudioContext } from "./helpers/fakeAudio";

/** `kick` is not a GS-1 role; `chords` and `lead` are (`GS1_ROLES`). */
const PATTERN: DrumPattern = {
  genre_id: "chicago-house",
  bpm: 124,
  swing: 0,
  scale: "minorPentatonic",
  tracks: [
    { name: "Kick", track_id: "kick", instrument: "kick_909", steps: [1, 0, 0, 0], volume: 0.9, pan: 0 },
    { name: "Chords", track_id: "chords", instrument: "m1_organ", steps: [1, 0, 0, 0], volume: 0.8, pan: 0 },
    { name: "Lead", track_id: "lead", instrument: "saw_lead", steps: [1, 0, 0, 0], volume: 0.8, pan: 0 },
  ],
};

function fakeHost() {
  return {
    ready: Promise.resolve(),
    setPatch: vi.fn(),
    output: { connect: vi.fn() },
    noteOnAt: vi.fn(),
    noteOffAt: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("GS-1 hosts in stem renders", () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    mocks.createGs1Host.mockReset();
    mocks.createGs1Host.mockImplementation(() => Promise.resolve(fakeHost()));
    restore = installFakeOfflineAudioContext();
    setGs1RoutingEnabled(true);
  });

  afterEach(() => {
    restore?.();
    restore = null;
    setGs1RoutingEnabled(true);
  });

  it("builds exactly one host when the stem's own track is routed", async () => {
    await renderPatternOffline(PATTERN, { bpm: 124, stemTrackIdx: 1 });
    expect(mocks.createGs1Host).toHaveBeenCalledTimes(1);
  });

  it("builds no host when the stem's track is not a GS-1 role", async () => {
    await renderPatternOffline(PATTERN, { bpm: 124, stemTrackIdx: 0 });
    expect(mocks.createGs1Host).not.toHaveBeenCalled();
  });

  it("still builds one host per routed track for a full master render", async () => {
    await renderPatternOffline(PATTERN, { bpm: 124 });
    expect(mocks.createGs1Host).toHaveBeenCalledTimes(2);
  });

  it("costs one export two hosts, not one per stem per role", async () => {
    // Three tracks (one routed? two routed) — the whole batch is what the WASM budget pays for.
    const stems = await exportStemsWav(PATTERN, "chicago-house", { bpm: 124 });
    expect(stems).toHaveLength(3);
    // Old behaviour: 3 stem renders × 2 hosts = 6. Now: kick 0, chords 1, lead 1 = 2.
    expect(mocks.createGs1Host).toHaveBeenCalledTimes(2);
    for (const stem of stems) expect(stem.gs1HostFailures).toBe(0);
  });
});
