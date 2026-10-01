/**
 * **A bar offset on the render path** — `RenderWavOptions.fromBar` / `renderPatternChunkOffline`, and the timeline the
 * merge needs.
 *
 * The criterion for the equivalence of a *chunked* render against a whole one is a measurable tolerance and lives in
 * `scripts/probe_chunk_equivalence.mjs`, because it needs real audio and the repository's analysis helpers. What can
 * be proved without a browser is the half that decides whether the tolerance is even meaningful: that asking for
 * "bars N until M" starts the graph at N (the context is shorter, not sliced), that the scheduled times land where the
 * whole render put them, that the first chunk never pays a pre-roll while a later one does, and that the deletion arm
 * (`preRollSec: 0`) really is the un-warmed boundary.
 *
 * `FakeOfflineAudioContext` fills its buffer with a constant, so nothing here claims anything about the *sound*. It
 * claims the coordinates, which is exactly the part a probe cannot bisect.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  computeRenderWindow,
  exportMasterWav,
  renderPatternChunkOffline,
  renderPatternOffline,
  trimChunkFrames,
  type RenderedChunk,
} from "../audio/WavExporter";
import { delayParamsAtTempo, resolveGenreFx } from "../data/genreFx";
import { FakeAudioBuffer, FakeOfflineAudioContext, installFakeOfflineAudioContext } from "./helpers/fakeAudio";
import { setGs1RoutingEnabled } from "../audio/gs1/gs1Tracks";
import type { DrumPattern } from "../types/genre";

const BPM = 120;
/** One 16th-note step at 120 BPM. */
const STEP_SEC = 60 / BPM / 4;
/** A 4/4 bar is **sixteen** steps, not four: 4 beats × 4 sixteenths. */
const BAR_SEC = 16 * STEP_SEC;

/** Four one-bar tracks (kick on 0, snare on 2, bass on 1 and 3), so a bar boundary is audible as a step change. */
const PATTERN: DrumPattern = {
  genre_id: "chicago-house",
  bpm: BPM,
  swing: 0,
  scale: "C minor",
  totalSteps: 16,
  tracks: [
    {
      name: "Kick",
      track_id: "kick",
      instrument: "punchy_kick",
      steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      volume: 0.9,
      pan: 0,
      velocity: new Array(16).fill(110),
      pitch: new Array(16).fill(0),
      gate: new Array(16).fill(0.8),
    },
    {
      name: "Snare",
      track_id: "snare",
      instrument: "snare",
      steps: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
      volume: 0.8,
      pan: 0,
      velocity: new Array(16).fill(100),
      pitch: new Array(16).fill(0),
      gate: new Array(16).fill(0.6),
    },
    {
      name: "Bass",
      track_id: "bass",
      instrument: "bass",
      steps: [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
      volume: 0.85,
      pan: 0,
      velocity: new Array(16).fill(95),
      pitch: new Array(16).fill(36),
      gate: new Array(16).fill(0.7),
    },
  ],
};

const GENRE_FX = resolveGenreFx("chicago-house")!;
/**
 * The tail this genre's profile asks for, derived **here** from the profile rather than read from
 * `resolveRenderTailSec` or written as a literal. It is the renderer's own length input, so deriving it independently
 * is what makes the frame counts below a claim about the renderer rather than arithmetic checked against itself.
 *
 * The documented formula (`renderTail.ts`): the longer of the reverb's RT60 and the delay's repeats-to-60 dB, floored
 * at 0.6 s and capped at 5 s. The delay's time comes from `delayParamsAtTempo`, the one conversion the graph also
 * uses, so a tempo-synced division is converted identically without this test restating the division table.
 */
const TAIL_SEC = (() => {
  const reverbDecay = Number.isFinite(GENRE_FX.reverb?.decaySec) ? Math.max(0, GENRE_FX.reverb!.decaySec as number) : 0;
  const delay = delayParamsAtTempo(GENRE_FX, BPM);
  const delaySeconds = Number.isFinite(delay?.timeSeconds) ? Math.max(0, delay.timeSeconds as number) : 0;
  const feedback = Number.isFinite(delay?.feedback) ? Math.max(0, Math.min(0.95, delay.feedback as number)) : 0;
  const repeats = feedback > 0 ? Math.ceil(60 / (-20 * Math.log10(feedback))) : 0;
  const derived = Math.max(reverbDecay, delaySeconds * (repeats + 1));
  return Math.max(0.6, Math.min(5, derived));
})();
const SR = 44100;

/** Every start time the fake graph recorded, so two renders' scheduling can be compared without audio. */
function scheduledTimes(context: FakeOfflineAudioContext): number[] {
  const times: number[] = [];
  for (const oscillator of context.createdOscillators) {
    times.push(...oscillator.startedAt);
  }
  return times.sort((a, b) => a - b);
}

describe("computeRenderWindow — the arithmetic, without a context", () => {
  const base = {
    bars: 2,
    bpm: BPM,
    sampleRate: SR,
    stepDur: STEP_SEC,
    stepsPerBar: 16,
    tailSec: 1.6,
    timing: null as null,
  };

  it("is null when the render starts at the top, so the whole-render path is the path it always was", () => {
    expect(computeRenderWindow({ ...base })).toBeNull();
    expect(computeRenderWindow({ ...base, fromBar: 0 })).toBeNull();
    expect(computeRenderWindow({ ...base, fromBar: -3 })).toBeNull();
    expect(computeRenderWindow({ ...base, fromBar: Number.NaN })).toBeNull();
  });

  it("starts at the bar, keeps the requested range, and adds the tail after it", () => {
    const window = computeRenderWindow({ ...base, fromBar: 3, preRollSec: 1.6 })!;
    expect(window.fromStep).toBe(48);
    expect(window.toStep).toBe(80);
    expect(window.barStartSeconds).toBeCloseTo(3 * BAR_SEC, 9);
    expect(window.preRollFrames).toBe(Math.ceil(1.6 * SR));
    expect(window.barStartFrame).toBe(Math.ceil(1.6 * SR));
    // pre-roll + the requested range + the tail, and nothing before or after.
    expect(window.contextSeconds).toBeCloseTo(1.6 + 2 * BAR_SEC + 1.6, 9);
    expect(window.contextFrames).toBe(Math.ceil(window.contextSeconds * SR));
  });
  it("defaults the pre-roll to the render's own tail and honours an explicit one, including zero", () => {
    expect(computeRenderWindow({ ...base, fromBar: 1 })!.preRollFrames).toBe(Math.ceil(base.tailSec * SR));
    expect(computeRenderWindow({ ...base, fromBar: 1, preRollSec: 0 })!.preRollFrames).toBe(0);
    expect(computeRenderWindow({ ...base, fromBar: 1, preRollSec: 0.25 })!.preRollFrames).toBe(Math.ceil(0.25 * SR));
  });

  it("never lets a caller's literal pre-roll allocate an unbounded context", () => {
    const window = computeRenderWindow({ ...base, fromBar: 1, preRollSec: 10_000 })!;
    expect(window.preRollFrames).toBeLessThanOrEqual(30 * SR);
  });

  it("reads a bar as 16 steps even when the pattern as a whole is many bars long", () => {
    /**
     * The bug this pins (found by `scripts/probe_chunk_equivalence.mjs`, not by any test here): the window used the
     * *pattern's* length as steps-per-bar, and for a flat one-bar pattern those are the same number — 16 — so every
     * test above passes either way. A 4-bar pattern made `stepsPerBar` 64, and asking for two bars from bar 2
     * rendered **eight** bars: the chunk was four times too long, and a merge would have placed it there.
     */
    const window = computeRenderWindow({ ...base, bars: 2, fromBar: 2, stepsPerBar: 16, preRollSec: 0 })!;
    expect(window.fromStep).toBe(32);
    expect(window.toStep).toBe(64);
    expect(window.toStep - window.fromStep).toBe(32);
    expect(window.contextSeconds).toBeCloseTo(2 * BAR_SEC + 1.6, 9);
  });

  it("reads the bar start from the tempo map rather than multiplying a constant", () => {
    const starts = new Array(129).fill(0).map((_, step) => step * STEP_SEC);
    starts[32] = 7.5; // a movement that cost more than its nominal 4 bars
    for (let step = 33; step < starts.length; step += 1) starts[step] = 7.5 + (step - 32) * STEP_SEC;
    const window = computeRenderWindow({
      ...base,
      fromBar: 2,
      preRollSec: 0,
      timing: { starts, total: starts[128]! },
    })!;
    expect(window.fromStep).toBe(32);
    expect(window.barStartSeconds).toBeCloseTo(7.5, 9);
  });

  it("keeps the whole requested range even when it runs past the pattern's own end", () => {
    // A 3-bar request from bar 2 of a pattern whose timing covers only 2 bars: the steps exist (silence), the frame
    // count is still the request. Truncating here would make a caller's last chunk quietly short.
    const starts = new Array(33).fill(0).map((_, step) => step * STEP_SEC);
    const window = computeRenderWindow({
      ...base,
      bars: 3,
      fromBar: 2,
      preRollSec: 0,
      timing: { starts, total: starts[32]! },
    })!;
    expect(window.toStep - window.fromStep).toBe(48);
  });
});

describe("renderPatternChunkOffline — the graph starts at the offset", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
    setGs1RoutingEnabled(true);
  });

  it("makes the context shorter by exactly the bars it skips — the cost is the chunk's", async () => {
    restore = installFakeOfflineAudioContext();
    const whole = await renderPatternOffline(PATTERN, { bars: 4, sampleRate: SR });
    const chunk = await renderPatternChunkOffline(PATTERN, { bars: 2, fromBar: 2, sampleRate: SR });
    expect(whole.length).toBe(Math.ceil((4 * BAR_SEC + TAIL_SEC) * SR));
    // pre-roll (the resolved tail) + two bars + the tail, not four bars plus the tail.
    expect(chunk.buffer.length).toBe(Math.ceil((TAIL_SEC + 2 * BAR_SEC + TAIL_SEC) * SR));
    expect(chunk.buffer.length).toBeLessThan(whole.length);
    /**
     * …and it is shorter by nearly the two bars it skips: the whole render is 4 bars + tail, the chunk is 2 bars +
     * tail + pre-roll, so the difference is one bar plus the pre-roll's own seconds. That is the cost model chunking
     * is built on, and a context that quietly rendered all four bars would show a difference near zero.
     */
    const difference = whole.length - chunk.buffer.length;
    expect(difference).toBeGreaterThan(BAR_SEC * SR);
    expect(difference).toBeLessThan(2 * BAR_SEC * SR);
  });

  it("is the identity for fromBar 0: same frame count, same context, same schedule", async () => {
    restore = installFakeOfflineAudioContext();
    const plain = await renderPatternOffline(PATTERN, { bars: 2, sampleRate: SR });
    const plainTimes = scheduledTimes(FakeOfflineAudioContext.lastInstance!);
    const chunk = await renderPatternChunkOffline(PATTERN, { bars: 2, sampleRate: SR });
    expect(chunk.buffer.length).toBe(plain.length);
    expect(chunk.fromBar).toBe(0);
    expect(chunk.barStartFrame).toBe(0);
    expect(chunk.preRollFrames).toBe(0);
    expect(chunk.usedPreRoll).toBe(false);
    /**
     * One meaning for `chunkEndFrame` on both paths: the render's own audio. For a whole render that is the scheduled
     * bars and stops **before** the tail — the merge needs that boundary, and `exportMasterWav` deliberately keeps the
     * tail by trimming to the buffer's end instead (tested below).
     */
    expect(chunk.chunkEndFrame).toBe(Math.round(2 * BAR_SEC * SR));
    expect(chunk.buffer.length).toBe(chunk.chunkEndFrame + Math.ceil(TAIL_SEC * SR));
    expect(scheduledTimes(FakeOfflineAudioContext.lastInstance!)).toEqual(plainTimes);
  });

  it("schedules the chunk's events at the times the whole render put them, shifted by the bar start", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(PATTERN, { bars: 4, sampleRate: SR });
    const wholeTimes = scheduledTimes(FakeOfflineAudioContext.lastInstance!);
    const chunk = await renderPatternChunkOffline(PATTERN, { bars: 2, fromBar: 2, preRollSec: 0, sampleRate: SR });
    const chunkTimes = scheduledTimes(FakeOfflineAudioContext.lastInstance!);
    // The whole render's events from bar 2 to bar 4, moved onto the chunk's own timeline.
    const barStart = 2 * BAR_SEC;
    const expected = wholeTimes.filter((time) => time >= barStart && time < barStart + 2 * BAR_SEC).map((time) => time - barStart);
    expect(chunk.barStartSeconds).toBeCloseTo(barStart, 9);
    expect(expected.length).toBeGreaterThan(0);
    expect(chunkTimes.length).toBe(expected.length);
    chunkTimes.forEach((time, index) => expect(time).toBeCloseTo(expected[index]!, 9));
  });

  it("keeps the pre-roll out of the requested range but inside the buffer, where a merge can fade it", async () => {
    restore = installFakeOfflineAudioContext();
    const chunk = await renderPatternChunkOffline(PATTERN, { bars: 2, fromBar: 2, sampleRate: SR });
    expect(chunk.preRollFrames).toBe(Math.ceil(TAIL_SEC * SR));
    // The bar start is the buffer's own frame, so it is the pre-roll — the buffer begins at the warm-up, not the bar.
    expect(chunk.barStartFrame).toBe(chunk.preRollFrames);
    expect(chunk.barStartSeconds).toBeCloseTo(2 * BAR_SEC, 9);
    expect(chunk.usedPreRoll).toBe(true);
    // The chunk's own audio ends where the requested range does, and the tail is what is left.
    // An offset in the buffer's frames, so it sits one requested range past the bar start.
    expect(chunk.chunkEndFrame).toBe(chunk.barStartFrame + Math.round(2 * BAR_SEC * SR));
    expect(chunk.buffer.length).toBeGreaterThan(chunk.chunkEndFrame);
    // buffer = pre-roll + the requested range + the tail, and nothing else.
    expect(chunk.buffer.length).toBe(chunk.chunkEndFrame + Math.ceil(TAIL_SEC * SR));
  });

  it("with preRollSec 0 renders no audio before the bar: the un-warmed boundary the criterion must reject", async () => {
    restore = installFakeOfflineAudioContext();
    const chunk = await renderPatternChunkOffline(PATTERN, { bars: 2, fromBar: 2, preRollSec: 0, sampleRate: SR });
    expect(chunk.preRollFrames).toBe(0);
    expect(chunk.barStartFrame).toBe(0);
    expect(chunk.usedPreRoll).toBe(false);
    // Still positioned on the piece's timeline — bar 2 is 4 s in — it just did not render the audio before it.
    expect(chunk.barStartSeconds).toBeCloseTo(2 * BAR_SEC, 9);
    // Shorter by exactly the pre-roll it did not render, and the requested range is unchanged.
    expect(chunk.buffer.length).toBe(Math.ceil((2 * BAR_SEC + TAIL_SEC) * SR));
    expect(chunk.chunkEndFrame).toBe(Math.round(2 * BAR_SEC * SR));
  });
});

describe("trimChunkFrames — the file is the bars, not the warm-up", () => {
  const chunk = (frames: number, preRollFrames: number, chunkEndFrame: number): RenderedChunk => ({
    buffer: (() => {
      const buffer = new FakeAudioBuffer(1, frames, SR);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i += 1) data[i] = i;
      return buffer as unknown as AudioBuffer;
    })(),
    fromBar: 0,
    toBar: 1,
    sampleRate: SR,
    preRollFrames,
    barStartFrame: preRollFrames,
    chunkEndFrame,
    tailSec: 1,
    barStartSeconds: 0,
    usedPreRoll: preRollFrames > 0,
  });

  it("drops the pre-roll and the tail, and keeps the requested range", () => {
    const trimmed = trimChunkFrames(chunk(1000, 100, 900), 100, 900);
    expect(trimmed.length).toBe(800);
    expect(trimmed.getChannelData(0)[0]).toBe(100);
    expect(trimmed.getChannelData(0)[799]).toBe(899);
  });

  it("returns the very buffer when there is nothing to drop, so a whole export is byte-identical", () => {
    const source = chunk(1000, 0, 1000);
    expect(trimChunkFrames(source, 0, 1000)).toBe(source.buffer);
  });

  it("clamps rather than throwing when a caller's range is wrong", () => {
    expect(trimChunkFrames(chunk(100, 10, 100), 500, 900).length).toBe(0);
    expect(trimChunkFrames(chunk(100, 10, 100), -20, 50).length).toBe(50);
    expect(trimChunkFrames(chunk(100, 10, 100), 60, 40).length).toBe(0);
  });
});

describe("exportMasterWav — a chunk is a file of the requested bars", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
    setGs1RoutingEnabled(true);
  });

  it("names the range and writes only the bars, not the pre-roll", async () => {
    restore = installFakeOfflineAudioContext();
    const exported = await exportMasterWav(PATTERN, "chicago-house", { bars: 2, fromBar: 2, sampleRate: SR });
    expect(exported.fromBar).toBe(2);
    expect(exported.toBar).toBe(4);
    expect(exported.filename).toBe("chicago-house_master_120bpm_bars2-4.wav");
    expect(exported.durationSec).toBeCloseTo(2 * BAR_SEC, 6);
  });

  it("keeps a whole export's tail, which is what the file must end on", async () => {
    restore = installFakeOfflineAudioContext();
    const exported = await exportMasterWav(PATTERN, "chicago-house", { bars: 2, sampleRate: SR });
    // Two bars plus the tail — not the two bars alone, which `chunkEndFrame` reports for a merge's benefit.
    expect(exported.durationSec).toBeCloseTo(2 * BAR_SEC + TAIL_SEC, 6);
    expect(exported.durationSec).toBeGreaterThan(2 * BAR_SEC);
  });

  it("leaves a whole export's name, duration and buffer untouched", async () => {
    restore = installFakeOfflineAudioContext();
    const exported = await exportMasterWav(PATTERN, "chicago-house", { bars: 2, sampleRate: SR });
    expect(exported.fromBar).toBeUndefined();
    expect(exported.toBar).toBeUndefined();
    expect(exported.filename).toBe("chicago-house_master_120bpm.wav");
    // Two bars plus the genre's own resolved tail (1.75 s: a 1.6 s reverb RT60 plus the impulse's pad).
    expect(TAIL_SEC).toBeCloseTo(1.75, 9);
    expect(exported.durationSec).toBeCloseTo(2 * BAR_SEC + TAIL_SEC, 6);
  });
});

