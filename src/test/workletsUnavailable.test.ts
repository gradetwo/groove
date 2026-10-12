/**
 * A render that ran **without worklets** has to say so, and a render that had them has to stay quiet.
 *
 * `AudioWorklet` is exposed only in a secure context (`docs/WORKLET_AVAILABILITY.md`): `http://127.0.0.1:<port>` — what
 * `mcp/render/worker.ts` serves from — is one, so its renders have the true-peak limiter and the GS-1 WASM host. A page
 * opened from `http://<LAN-IP>:3000`, or any plain-HTTP hostname, is not: `ctx.audioWorklet` is `undefined`, the master
 * limiter falls back to a `DynamicsCompressor` (2.36 dB louder overall, 4.83 dB off in one band — G.14) and GS-1 lanes
 * are voiced by the native engine. The render used to say nothing about that, which is this project's worst shape: ok
 * while doing something else.
 *
 * **The second half is the assertion that matters as much as the first.** A warning keyed on `limiterKind === "fallback"`
 * would fire in this very test environment (there is no `AudioWorkletNode` here), on every module-load flake, and on
 * every GS-1 failure — and a warning that always fires is noise. So the check reads the **context's own** `audioWorklet`,
 * and the case below pins that the fallback limiter alone is not enough to make it fire.
 *
 * These are the two halves of the criterion. The MCP reply needs no extra seam: `renderAudio` passes
 * `onProblems` straight through to `RenderResult.problems` (`mcp/render/worker.ts`), which is the same list these
 * assertions read.
 */
import { afterEach, describe, expect, it } from "vitest";
import { exportMasterWav, exportStemsZip, renderPatternOffline, WORKLETS_UNAVAILABLE_PROBLEM } from "../audio/WavExporter";
import type { DrumPattern } from "../types/genre";
import { FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";

const PATTERN: DrumPattern = {
  genre_id: "deep-house",
  bpm: 124,
  swing: 0,
  scale: "minorPentatonic",
  tracks: [
    { name: "Kick", track_id: "kick", instrument: "kick", steps: [1, 0, 0, 0], volume: 0.9, pan: 0 },
    { name: "Snare", track_id: "snare", instrument: "snare", steps: [0, 0, 1, 0], volume: 0.8, pan: 0 },
  ],
};

describe("a render without worklets says so", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("reports the origin problem when the context has no audioWorklet", async () => {
    restore = installFakeOfflineAudioContext();
    FakeOfflineAudioContext.workletsAvailable = false;

    const problems: string[] = [];
    let limiterKind = "";
    const buffer = await renderPatternOffline(PATTERN, {
      bpm: 124,
      onProblems: (list) => problems.push(...list),
      onLimiterKind: (kind) => {
        limiterKind = kind;
      },
    });

    // The render still succeeds — this is a report, not a failure.
    expect(buffer.length).toBeGreaterThan(0);
    // The context's own property is what was read, and it is named in the problem.
    expect(problems).toContain(WORKLETS_UNAVAILABLE_PROBLEM);
    expect(problems[0]).toMatch(/ran without audio worklets/);
    expect(problems[0]).toMatch(/secure context/);
    // And the limiter really did take the fallback on this render, which is the thing being reported.
    expect(limiterKind).toBe("fallback");
  });

  it("says nothing when the context has one — even though the limiter still falls back here", async () => {
    restore = installFakeOfflineAudioContext();
    // The default fake has `audioWorklet`; this environment has no `AudioWorkletNode`, so
    // `createMasterLimiter` takes its fallback path anyway. That is deliberate: it is the state that would make a
    // `limiterKind`-keyed warning fire on a perfectly secure origin, and it must not.
    expect(FakeOfflineAudioContext.workletsAvailable).toBe(true);

    const problems: string[] = [];
    let limiterKind = "";
    await renderPatternOffline(PATTERN, {
      bpm: 124,
      onProblems: (list) => problems.push(...list),
      onLimiterKind: (kind) => {
        limiterKind = kind;
      },
    });

    expect(limiterKind).toBe("fallback");
    expect(problems.some((problem) => /without audio worklets/.test(problem))).toBe(false);
    expect(problems).not.toContain(WORKLETS_UNAVAILABLE_PROBLEM);
  });
});

/**
 * The app's own export path is the same render, so it has to carry the same fact out — the page a person opens from a
 * LAN IP exports through `exportMasterWav` / `exportStemsZip`, and a toast keyed only on `limiterKind === "fallback"`
 * tells them to "try again in a new tab", which cannot help when the origin is the cause.
 */
describe("the app's export carries the origin fact out", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("flags a master export from a context with no worklets", async () => {
    restore = installFakeOfflineAudioContext();
    FakeOfflineAudioContext.workletsAvailable = false;
    const result = await exportMasterWav(PATTERN, "deep-house", { bpm: 124 });
    expect(result.workletsUnavailable).toBe(true);
    // And the transient fallback is still distinguishable: a worklet-capable context is not flagged.
    FakeOfflineAudioContext.workletsAvailable = true;
    const clean = await exportMasterWav(PATTERN, "deep-house", { bpm: 124 });
    expect(clean.workletsUnavailable).toBe(false);
  });

  it("flags a stem package when any stem rendered without worklets", async () => {
    restore = installFakeOfflineAudioContext();
    FakeOfflineAudioContext.workletsAvailable = false;
    const zipped = await exportStemsZip(PATTERN, "deep-house", { bpm: 124 });
    expect(zipped.workletsUnavailable).toBe(true);
  });
});
