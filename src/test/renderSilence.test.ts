/**
 * A render that produced no sound is a failed render, not a quiet one.
 *
 * The measured defect (`docs/HEADLESS_CORE_PLAN.md` §6): on the Node Web Audio host a render intermittently comes
 * back with the **correct frame count and nothing in it** — `LUFS = -Infinity`, every spectral band on the −120 dB
 * floor, the limiter reporting `worklet`. Before this, the exporter handed that buffer to its caller, which wrote it
 * to a WAV and reported a successful render; an agent asking for audio got a file of silence and no message.
 *
 * Two layers are pinned here, and they catch different things:
 *
 *  1. `bufferHasAudio` — the detector, on a **deliberately emptied buffer**. A detector that says "yes" to a buffer
 *     of zeros (or to a buffer with zero channels) is the whole defect, so this is the assertion that matters most.
 *  2. `renderPatternOffline` — the product decision, on a host that returns silence every time. It must **not**
 *     return the buffer, and its retry must be visible in `onProblems` when a later attempt recovers.
 *
 * What these would catch in CI: a refactor that drops the emptiness check (test 1 and 3), one that returns the
 * silent buffer anyway (test 3), one that retries invisibly (test 4), and one that retries so eagerly that a real
 * render with signal in it pays for attempts it does not need (test 5).
 */
import { describe, it, expect, afterEach } from "vitest";
import { bufferHasAudio, bufferPeak, SILENT_RENDER_PEAK_THRESHOLD } from "../audio/renderSilence";
import { renderPatternOffline, renderPatternOfflineGuarded } from "../audio/WavExporter";
import type { DrumPattern } from "../types/genre";
import { FakeAudioBuffer, FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";
import { setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";

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

/** A buffer of exactly the shape the host returns when the defect happens: right length, no samples. */
function emptiedBuffer(channels = 2, length = 1024): FakeAudioBuffer {
  return new FakeAudioBuffer(channels, length, 44100);
}

describe("an emptied buffer is silence, and silence is not audio", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
    setGs1RoutingEnabled(true);
  });

  it("says no to a buffer of digital silence at the correct frame count", () => {
    const buffer = emptiedBuffer(2, 165375);
    expect(buffer.length).toBe(165375);
    expect(bufferPeak(buffer)).toBe(0);
    expect(bufferHasAudio(buffer)).toBe(false);
  });

  it("says no to a buffer with no channels at all", () => {
    expect(bufferHasAudio(emptiedBuffer(0, 0))).toBe(false);
  });

  /**
   * The boundary. −120 dBFS is the floor this project's fingerprint prints for a silent render, and a value that
   * small is *numerically* non-zero, so a detector written as `peak !== 0` passes the test above and still calls
   * this audio. It is not: it is denormal dust from a failing host.
   */
  it("says no to a buffer whose only content is below −120 dBFS", () => {
    const buffer = emptiedBuffer(1, 512);
    buffer.getChannelData(0)[7] = SILENT_RENDER_PEAK_THRESHOLD / 2;
    expect(bufferPeak(buffer)).toBeGreaterThan(0);
    expect(bufferHasAudio(buffer)).toBe(false);
  });

  it("says yes to a buffer with one audible sample in it", () => {
    const buffer = emptiedBuffer(2, 512);
    buffer.getChannelData(1)[300] = 0.001;
    expect(bufferHasAudio(buffer)).toBe(true);
  });
});

describe("the renderer refuses to present a silent render as a success", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
    setGs1RoutingEnabled(true);
  });

  it("throws, naming what happened, when every attempt comes back silent", async () => {
    restore = installFakeOfflineAudioContext();
    FakeOfflineAudioContext.silenceLevel = 0; // the host defect, every time
    const problems: string[] = [];
    await expect(
      renderPatternOffline(PATTERN, { bpm: 124, onProblems: (p) => problems.push(...p) })
    ).rejects.toThrow(/silent render/i);
    // The message has to make the failure distinguishable from "the pattern was empty": the length is right.
    await expect(renderPatternOffline(PATTERN, { bpm: 124 })).rejects.toThrow(/165375 frames|frames/);
    // And the attempts that failed before the throw were reported, not swallowed.
    expect(problems.some((p) => /silent render on attempt 1/.test(p))).toBe(true);
  });

  it("returns a render that has signal in it, and reports no problem for it", async () => {
    restore = installFakeOfflineAudioContext(); // silenceLevel 0.5: the healthy host
    const problems: string[] = [];
    const buffer = await renderPatternOffline(PATTERN, { bpm: 124, onProblems: (p) => problems.push(...p) });
    expect(bufferHasAudio(buffer)).toBe(true);
    expect(problems).toEqual([]);
  });
});

describe("the silence guard retries, and says so", () => {
  /**
   * An injected render function, so the interleaving is exact rather than probabilistic.
   *
   * This is the seam the guard exists for: the host failure is intermittent (measured 2/48 renders at 8-way
   * concurrency), and a test that waits for it to happen by chance is a test nobody can trust.
   */
  const silent = () => Promise.resolve(emptiedBuffer());
  const audible = () => {
    const buffer = emptiedBuffer();
    buffer.getChannelData(0).fill(0.25);
    return Promise.resolve(buffer);
  };

  it("returns the first attempt when it already has signal", async () => {
    let calls = 0;
    const problems: string[] = [];
    const buffer = await renderPatternOfflineGuarded(() => {
      calls += 1;
      return audible();
    }, problems);
    expect(calls).toBe(1);
    expect(problems).toEqual([]);
    expect(bufferHasAudio(buffer)).toBe(true);
  });

  it("retries a silent attempt and returns the recovered render, with the problem recorded", async () => {
    let calls = 0;
    const problems: string[] = [];
    const buffer = await renderPatternOfflineGuarded(() => {
      calls += 1;
      return calls === 1 ? silent() : audible();
    }, problems);
    expect(calls).toBe(2);
    expect(bufferHasAudio(buffer)).toBe(true);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/silent render on attempt 1 of \d+/);
  });

  it("stops at the attempt limit and throws rather than returning zeros", async () => {
    let calls = 0;
    const problems: string[] = [];
    await expect(
      renderPatternOfflineGuarded(() => {
        calls += 1;
        return silent();
      }, problems)
    ).rejects.toThrow(/silent render 4 time\(s\) in a row/);
    expect(calls).toBe(4);
    expect(problems).toHaveLength(3);
  });

  /**
   * The third outcome, and the one `13da133`'s audio lanes forced: silence the render itself explained.
   *
   * A pattern whose only sound is an audio lane whose sample cannot be resolved is *supposed* to render silence, and
   * the lane plan names the reason. Retrying it would render the same nothing four times and then replace a named,
   * actionable reason with "the host returned a silent render" — which is worse than the answer it replaced.
   */
  it("returns explained silence without retrying, and says why", async () => {
    let calls = 0;
    const problems: string[] = [];
    const buffer = await renderPatternOfflineGuarded(
      () => {
        calls += 1;
        return silent();
      },
      problems,
      4,
      () => ({
        expectSilence: true,
        reason: 'every audio lane was reported as not playable (no sample "probe-impulse")',
      })
    );
    expect(calls).toBe(1);
    expect(bufferHasAudio(buffer)).toBe(false);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/no sound source/);
    expect(problems[0]).toMatch(/probe-impulse/);
  });

  it("still retries when the verdict says silence was not expected", async () => {
    let calls = 0;
    const problems: string[] = [];
    const buffer = await renderPatternOfflineGuarded(
      () => {
        calls += 1;
        return calls === 1 ? silent() : audible();
      },
      problems,
      4,
      () => ({ expectSilence: false })
    );
    expect(calls).toBe(2);
    expect(bufferHasAudio(buffer)).toBe(true);
    expect(problems[0]).toMatch(/the audio host returned a silent render/);
  });
});
