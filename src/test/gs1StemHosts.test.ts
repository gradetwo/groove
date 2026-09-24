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
    /**
     * ABI 9's entry point, which the renderer now calls for A3's variation.
     *
     * Its absence is what these cases caught first — the fixture had the shape the adapter used to have, so a
     * `setTuningNote is not a function` failure was the interface telling the test double to catch up rather than a
     * defect in the render.
     */
    setTuningNote: vi.fn(),
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

/**
 * A3's GS-1 half, which ABI 9 unblocked: the variation must reach the **shipping** voice.
 *
 * Until the core exported `gs_set_tuning_note` the render with the pool enabled was *identical* with and without the
 * per-note nudge (measured Δ0), which is why the plan's per-note claim was taken on the native path and labelled as
 * such. This is the wiring that changes it: the same `polyVoiceVariation` the native path uses, arriving as per-note
 * tuning, because GS-1 has no per-note cutoff.
 */
describe("GS-1 · the per-note variation reaches the shipping voice", () => {
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
  });

  it("sends a tuning offset per routed note, and none when the variation is off", async () => {
    const { renderPatternOffline } = await import("../audio/WavExporter");
    const withVariation = await renderPatternOffline(PATTERN, { noteVariation: true, bars: 1 });
    const hostsAfterOn = mocks.createGs1Host.mock.results.map((result) => result.value);
    const tuningCalls = await Promise.all(
      hostsAfterOn.map(async (host) => (await host) as unknown as { setTuningNote: { mock: { calls: unknown[][] } } })
    );
    const offsetsOn = tuningCalls.flatMap((host) => host.setTuningNote.mock.calls.map((call) => call[1] as number));
    expect(offsetsOn.length, "at least one routed note carries a tuning offset").toBeGreaterThan(0);
    // The nudge is ±12 cents by definition, and the engine clamps at ±1200 — so this is the same quantity the native
    // path applies to a voice's detune, not a different one that happens to be in cents.
    for (const cents of offsetsOn) expect(Math.abs(cents)).toBeLessThanOrEqual(12.001);

    mocks.createGs1Host.mockClear();
    const withoutVariation = await renderPatternOffline(PATTERN, { noteVariation: false, bars: 1 });
    const hostsAfterOff = mocks.createGs1Host.mock.results.map((result) => result.value);
    const offsetsOff = (
      await Promise.all(
        hostsAfterOff.map(async (host) => (await host) as unknown as { setTuningNote: { mock: { calls: unknown[][] } } })
      )
    ).flatMap((host) => host.setTuningNote.mock.calls);
    expect(offsetsOff, "the escape hatch sends nothing at all").toEqual([]);
    // The renders are different objects; the point of the case above is that the *messages* differ.
    expect(withVariation.numberOfChannels).toBe(withoutVariation.numberOfChannels);
  });
});
