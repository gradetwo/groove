/**
 * **The browser half of `scripts/probe_chunk_equivalence.mjs`** — the app's own renderer plus the repository's own
 * measurement helpers, driven by the probe's Node side.
 *
 * ## Why this is split across pages rather than one long function
 *
 * A headless Chromium's page does not survive an open-ended amount of audio work. Measured while building this probe:
 * one page rendered ~99 s of audio (three 12-bar renders) before the renderer died and took the measurement with it,
 * and the profile's "forty to a hundred and twenty renders" is a **one-bar** figure — the fixture, not the call count,
 * is what exhausts it. So this module is a **stateful, resumable** API: the driver opens a page, calls one step at a
 * time, and if the page dies between steps it opens another and the step is retried. `build` must be re-run on a fresh
 * page; everything after it is idempotent.
 *
 * ## What it does not do
 *
 * Nothing here is imported by production code, the audio never crosses the page boundary (only numbers do), and no
 * metric is re-implemented: the 13-band fingerprint, integrated LUFS and true peak are `src/test/helpers/`, the same
 * ones `scripts/probe_headless_parity.ts` uses.
 */

/* ------------------------------------------------------------------ the persistent page state */

const state = {
  options: null,
  /** Set by `build`: everything that depends only on the requested fixture. */
  fixture: null,
  /** The whole render's channel data and metrics — the reference every arm is compared against. */
  whole: null,
  /** Chunk A's render: bar 0 is never a chunk, so it is the same render for every arm. */
  chunkA: null,
  arms: [],
};

/* ------------------------------------------------------------------ numbers, not audio */

const channelData = (buffer) => {
  const out = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) out.push(buffer.getChannelData(c));
  return out;
};

/** Peak by loop — never `Math.max(...samples)`, which overflows the argument stack on a long buffer. */
const peakOf = (buffer) => {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 1) {
      const value = Math.abs(data[i]);
      if (value > peak) peak = value;
    }
  }
  return peak;
};

const bandDistance = (a, b) => {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let k = 0; k < n; k += 1) sum += Math.abs(a[k] - b[k]);
  return n > 0 ? sum / n : 0;
};

const maxBandDelta = (a, b) => {
  let worst = 0;
  let at = -1;
  for (let k = 0; k < Math.min(a.length, b.length); k += 1) {
    const delta = Math.abs(a[k] - b[k]);
    if (delta > worst) {
      worst = delta;
      at = k;
    }
  }
  return { worst, at };
};

/**
 * **Where the wall clock went, per phase**, from the renderer's own shipped instrumentation
 * (`__grooveRenderTimings`, the same sink `scripts/profile_offline_render.mjs` reads). A chunked render that costs more
 * than a whole one has to be attributable to a named phase; the candidate is the per-render fixed work, which does not
 * divide with the piece.
 */
const timedRender = async (run) => {
  const sink = { phases: {}, meta: {}, onPhase() {} };
  globalThis.__grooveRenderTimings = sink;
  const started = performance.now();
  try {
    const value = await run();
    return { value, wallMs: performance.now() - started, phases: { ...sink.phases }, meta: { ...sink.meta } };
  } finally {
    delete globalThis.__grooveRenderTimings;
  }
};

const sumPhases = (arms) => {
  const totals = {};
  for (const arm of arms) {
    for (const [name, ms] of Object.entries(arm.phases ?? {})) totals[name] = (totals[name] ?? 0) + ms;
  }
  return totals;
};

/** Largest sample-to-sample step near a seam, with where it is relative to the seam. A click is a step, not a level. */
const seamStats = (channels, seams) => {
  let worstStep = 0;
  let worstAt = -1;
  let maxSample = 0;
  for (const seam of seams) {
    const from = Math.max(1, seam.at - 2048);
    const to = Math.min(channels[0].length - 1, seam.at + seam.frames + 2048);
    for (let c = 0; c < channels.length; c += 1) {
      const data = channels[c];
      for (let i = from; i <= to; i += 1) {
        const step = Math.abs(data[i] - data[i - 1]);
        if (step > worstStep) {
          worstStep = step;
          worstAt = i - seam.at;
        }
        const value = Math.abs(data[i]);
        if (value > maxSample) maxSample = value;
      }
    }
  }
  return { worstStep, worstAt, maxSample };
};

/**
 * **The most a merged render differs from the whole one, anywhere**, with where it happened.
 *
 * The seam-region aggregate and a whole-file band fingerprint are both level-weighted, and a 6 dB discontinuity at one
 * boundary disappears into either. A chunk missing the reverb it should have carried over a boundary differs from the
 * whole render by exactly that missing tail, and the largest absolute sample difference is where that shows.
 */
const worstDifference = (a, b, sampleRate, seams = []) => {
  let worst = 0;
  let worstAt = -1;
  let worstSeam = 0;
  let worstSeamAt = -1;
  const inSeam = (frame) => seams.some((seam) => frame >= seam.at - seam.frames && frame <= seam.at + seam.frames);
  for (let c = 0; c < a.length; c += 1) {
    const length = Math.min(a[c].length, b[c].length);
    for (let i = 0; i < length; i += 1) {
      const difference = Math.abs(a[c][i] - b[c][i]);
      if (difference > worst) {
        worst = difference;
        worstAt = i;
      }
      if (inSeam(i) && difference > worstSeam) {
        worstSeam = difference;
        worstSeamAt = i;
      }
    }
  }
  /** How far the difference reaches: the span of frames within 40 dB of the worst. */
  let first = -1;
  let last = -1;
  const threshold = worst / 100;
  for (let i = 0; i < Math.min(a[0].length, b[0].length); i += 1) {
    let above = false;
    for (let c = 0; c < a.length && !above; c += 1) above = Math.abs(a[c][i] - b[c][i]) >= threshold;
    if (above) {
      if (first < 0) first = i;
      last = i;
    }
  }
  return {
    db: worst > 0 ? 20 * Math.log10(worst) : -Infinity,
    atSec: worstAt / sampleRate,
    fromSec: first / sampleRate,
    toSec: last / sampleRate,
    spanSec: (last - first + 1) / sampleRate,
    seamDb: worstSeam > 0 ? 20 * Math.log10(worstSeam) : -Infinity,
    seamAtSec: worstSeamAt / sampleRate,
  };
};

/** Error against signal **in the seam region**: a hard cut at a reverb boundary is large error against small signal. */
const seamDifference = (a, b, seams, radiusFrames) => {
  let signal = 0;
  let error = 0;
  for (const seam of seams) {
    const from = Math.max(0, seam.at - radiusFrames);
    const to = Math.min(a[0].length, b[0].length, seam.at + Math.max(seam.frames, radiusFrames));
    if (from >= to) continue;
    for (let c = 0; c < a.length; c += 1) {
      for (let i = from; i < to; i += 1) {
        signal += a[c][i] * a[c][i];
        const difference = a[c][i] - b[c][i];
        error += difference * difference;
      }
    }
  }
  const signalDb = 10 * Math.log10(Math.max(signal, 1e-30));
  const errorDb = error > 0 ? 10 * Math.log10(error) : -Infinity;
  return { signalDb, errorDb, ratioDb: signalDb - errorDb };
};

/**
 * Merge chunks the way a caller has to: **place each chunk on the piece's own timeline and crossfade wherever two of
 * them cover the same frames.**
 *
 * Not a concatenation, and the difference is the subject. A chunk's buffer starts at its pre-roll, so its first
 * `preRollFrames` samples are audio the **previous** chunk already has. Placing them by their own lengths instead (the
 * first version of this function) writes chunk B a whole bar late: it produced a 125 s "merge" of a 17 s piece. With a
 * pre-roll the overlap is real and is crossfaded; with `preRollSec: 0` there is no overlap and the same code performs a
 * hard splice — exactly the arm the deletion test measures.
 */
const mergeChunks = (chunks) => {
  const sampleRate = chunks[0].buffer.sampleRate;
  const channels = chunks[0].buffer.numberOfChannels;
  const pieceStartFrame = (chunk) =>
    Math.round(chunk.barStartSeconds * sampleRate) - chunk.preRollFrames;
  /**
   * The piece ends where the **last** chunk's own audio ends — `barStartFrame + chunkEndFrame`, not the end of its
   * buffer.
   *
   * The buffer extends past that point with the render's *tail*, which the whole render also has and which the merge
   * must not count twice: taking `buffer.length` here (the first version) ran 1.75 s of tail twice into the merged
   * file and reported a 1 dB RMS difference from a render whose **peak was identical to 0.00 dB** — a measurement
   * artefact that read exactly like "the chunked path is quieter".
   */
  /**
   * The piece runs to the end of the **last** piece's own audio plus that render's tail — `chunkEndFrame` alone stops
   * before the tail, so a merge that ended there was 0.69 s short of the whole render and reported a 0.85 dB RMS gap
   * that belonged to the difference in length, not to the seam.
   *
   * The whole render's own length is the independently measured check: a correct merge is exactly `whole.frames`.
   */
  const lastPiece = chunks[chunks.length - 1];
  const endFrame = pieceStartFrame(lastPiece) + lastPiece.chunkEndFrame + Math.ceil(lastPiece.tailSec * sampleRate);
  const merged = [];
  for (let c = 0; c < channels; c += 1) merged.push(new Float32Array(endFrame));
  const seams = [];
  let placedEnd = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const rendered = chunks[index];
    const start = pieceStartFrame(rendered);
    const ownEnd = Math.min(rendered.buffer.length, rendered.chunkEndFrame);
    const length = rendered.buffer.length;
    const known = Math.max(0, Math.min(placedEnd, ownEnd) - start);
    seams.push({ at: start, frames: Math.max(0, known), chunkStart: start, index });
    for (let c = 0; c < channels; c += 1) {
      const source = rendered.buffer.getChannelData(c);
      const target = merged[c];
      /**
       * The overlap — this chunk's pre-roll against the previous chunk's tail — is **crossfaded**, and the previous
       * chunk is attenuated as the new one comes up. Keeping both at full gain is what an equal-gain fade over
       * correlated audio does; a hard switch would be the `preRollSec: 0` arm, so the two arms differ by exactly the
       * thing under test.
       */
      for (let i = 0; i < known; i += 1) {
        /** Weights that **sum to 1**, because the two sides are the same music rendered twice: any other pair makes
         * the seam dip (equal-gain) or bump (equal-power on correlated audio). */
        const t = known > 1 ? i / (known - 1) : 1;
        target[start + i] = target[start + i] * (1 - t) + source[i] * t;
      }
      /** Everything after the overlap, up to the end of this chunk's own audio. */
      for (let i = known; i < ownEnd - start; i += 1) target[start + i] = source[i];
      /** …and the last piece's tail, which is part of the piece and is truncated by nothing. */
      if (index === chunks.length - 1) {
        for (let i = Math.max(known, ownEnd - start); i < length && start + i < endFrame; i += 1) {
          target[start + i] = source[i];
        }
      }
    }
    placedEnd = Math.max(placedEnd, ownEnd);
  }
  /**
   * A compact geometry line, always. It is the one record that distinguishes "the merge is wrong" from "the renderer
   * is wrong" when a number looks impossible, and it is four numbers wide: the piece's length, the seam, the overlap
   * and the peak. The frame counts beside it are each chunk's `[preRollFrames, chunkEndFrame, buffer.length]`.
   */
  const mergedPeak = Math.max(...merged.map((channel) => channel.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0)));
  console.log(
    `[page] merge frames=${endFrame} seam=${JSON.stringify(seams[seams.length - 1] ?? null)} peak=${mergedPeak.toFixed(6)} chunks=${JSON.stringify(chunks.map((chunk) => [chunk.preRollFrames, chunk.chunkEndFrame, chunk.buffer.length]))}`
  );
  return { channels: merged, sampleRate, seams, frames: endFrame, peak: mergedPeak };
};

/* ------------------------------------------------------------------ the page API */

/** The fixture, or a sentence saying which step has to run first — never a `null` dereference. */
function requireFixture() {
  if (!state.fixture) {
    throw new Error("this page has no fixture: call build(options) before whole()/arm()/collected()");
  }
  return state.fixture;
}

/** `build(options)` — the fixture, resolved once per page. Idempotent: a repeat call is a no-op. */
export async function build(options) {
  /**
   * The idempotent path returns the **metadata**, which is what the page API promises — not the internal state object.
   * Returning `state.fixture` here (the first version) made the driver's second call read `bars: undefined` and
   * `split: undefined`, and every arm after the first then rendered a chunk of `undefined` bars: measured, chunk A's
   * `chunkEndFrame` came out as its whole 757,525-frame buffer and the merge crossfaded a whole buffer's worth of
   * frames. The first `build` was correct, which is exactly why the failure looked like a renderer bug.
   */
  if (state.options && JSON.stringify(state.options) === JSON.stringify(options)) return state.fixture.fixture;
  const [genres, mix] = await Promise.all([
    import("/src/data/genres/index.ts"),
    import("/src/data/genreMix.ts"),
  ]);
  const entry = genres.ALL_GENRES.find((genre) => genre.id === options.genre);
  if (!entry) throw new Error(`unknown genre ${options.genre}`);

  const clip = mix.patternFromGenre(entry);
  const stepsPerBar = 16;
  const clipSteps = clip.totalSteps && clip.totalSteps > 0 ? clip.totalSteps : clip.tracks[0]?.steps.length ?? stepsPerBar;
  const clipBars = Math.max(1, Math.round(clipSteps / stepsPerBar));

  /**
   * The fixture's length is the caller's `--bars`, and the clip is **truncated or repeated** to reach it. Truncation
   * rather than rounding up matters for cost: a page survives roughly a hundred seconds of rendered audio, and
   * `chicago-house`'s clip is eight bars — rounding every request up to a multiple of it made the cheap fixture
   * unaffordable and the affordable one impossible.
   */
  const totalBars = Math.max(2, Math.floor(options.bars));
  const splitBar = Math.max(1, Math.floor(totalBars / 2));

  const pattern = {
    ...clip,
    totalSteps: totalBars * stepsPerBar,
    stepsPerBar,
    tracks: clip.tracks.map((track) => {
      const len = track.steps?.length ?? stepsPerBar;
      const steps = [];
      const velocity = [];
      const pitch = [];
      const gate = [];
      for (let i = 0; i < totalBars * stepsPerBar; i += 1) {
        const at = i % len;
        steps.push(track.steps?.[at] ?? 0);
        velocity.push(track.velocity?.[at] ?? 100);
        pitch.push(track.pitch?.[at] ?? 0);
        gate.push(track.gate?.[at] ?? 0.8);
      }
      return { ...track, steps, velocity, pitch, gate };
    }),
  };

  const sections = Math.max(1, Math.ceil(totalBars / clipBars));
  const song = {
    id: "probe",
    name: "probe",
    genreId: options.genre,
    bpm: pattern.bpm ?? 120,
    swing: 0,
    resolution: "1/16",
    clips: { A: clip },
    sections: Array.from({ length: sections }, (_, i) => ({ id: `s${i}`, slot: "A", bars: clipBars })),
    loopRange: null,
  };

  state.options = options;
  /**
   * Every fact a later step needs lives in **one** object, `fixture`, including the mode.
   *
   * Splitting it (`state.fixture` for the music, `state.options` for the mode) is how the first version of this file
   * failed: a step destructured `{ ...state.fixture, mode: state.options.mode }`, and when that read met a page whose
   * `build` had not run it threw `Cannot read properties of null (reading 'mode')` instead of saying "build has not
   * run" — a page-rebuild loop that looked like a browser problem and was not one.
   */
  /**
   * **One shape for the fixture, and the caller reads that shape.** `bars`/`split` are the names the page reports;
   * `totalBars`/`splitBar` were the names it stored, and a step that read `state.fixture.bars` after an idempotent
   * `build` got `undefined` — which then rendered a chunk of `undefined` bars (measured: chunk A's `chunkEndFrame` came
   * out as its whole buffer, and the merge crossfaded 149,372 frames instead of 74,686).
   */
  state.fixture = {
    fixture: { genre: options.genre, mode: options.mode, bars: totalBars, clipBars, split: splitBar, sections },
    pattern,
    song,
    stepsPerBar,
  };
  state.whole = null;
  state.chunkA = null;
  state.arms = [];
  return state.fixture.fixture;
}

/** Render the whole piece (twice, so the measurement's own floor is known) and keep it as the reference. */
export async function whole() {
  if (state.whole) return state.whole.summary;
  const [wav, loudness, timbre] = await Promise.all([
    import("/src/audio/WavExporter.ts"),
    import("/src/test/helpers/loudness.ts"),
    import("/src/test/helpers/timbre.ts"),
  ]);
  const { pattern, song, fixture } = requireFixture();
  const render = () =>
    timedRender(() => {
      return fixture.mode === "song" ? wav.renderSongOffline(song, {}) : wav.renderPatternOffline(pattern, { bars: 1 });
    });
  const first = await render();
  const second = await render();

  const metricsOf = (buffer) => {
    const channels = channelData(buffer);
    const loud = loudness.measureLoudness(channels, buffer.sampleRate);
    const fp = timbre.fingerprintChannels(channels, buffer.sampleRate);
    return {
      frames: buffer.length,
      seconds: buffer.duration,
      peak: peakOf(buffer),
      integratedLufs: loud.integratedLufs,
      truePeakDb: loud.truePeakDb,
      bandDb: fp.bandDb,
      centroidHz: fp.centroidHz,
      rmsDb: fp.rmsDb,
    };
  };

  const metrics = metricsOf(first.value);
  const again = metricsOf(second.value);
  state.whole = {
    channels: channelData(first.value),
    sampleRate: first.value.sampleRate,
    metrics,
    summary: {
      wallMs: first.wallMs,
      againWallMs: second.wallMs,
      phases: first.phases,
      meta: first.meta,
      frames: first.value.length,
      seconds: first.value.duration,
      metrics,
      againMetrics: again,
      bandL1: bandDistance(metrics.bandDb, again.bandDb),
      worstBand: maxBandDelta(metrics.bandDb, again.bandDb),
      /**
       * The impulse the render really built, from the renderer's own metadata (`ReverbBus.buildImpulse`) rather than
       * rebuilt here. It is the length a pre-roll has to cover, so it belongs next to every sweep point.
       */
      impulseFrames: first.meta?.reverbImpulseFrames ?? 0,
      impulseSeconds: (first.meta?.reverbImpulseFrames ?? 0) / first.value.sampleRate,
      reverbDecaySec: first.meta?.reverbDecaySec ?? 0,
    },
  };
  return state.whole.summary;
}

/**
 * Render the two chunks at one pre-roll and measure the merge.
 *
 * `preRollSec === undefined` is the renderer's own default; `0` is the deletion test. Chunk A (bars `[0, split)`)
 * starts at bar 0 and so never has a pre-roll: it is rendered once per page and reused.
 */
export async function arm(plan) {
  const [wav, loudness, timbre] = await Promise.all([
    import("/src/audio/WavExporter.ts"),
    import("/src/test/helpers/loudness.ts"),
    import("/src/test/helpers/timbre.ts"),
  ]);
  const { pattern, song, fixture } = requireFixture();
  const { split, mode } = fixture;
  /**
   * **`bars` is a count of *whole pattern repetitions*, not of bars.** The renderer is `totalSteps = patternSteps *
   * bars`, so a chunk of this fixture — whose pattern already *is* the whole piece — asks for exactly **one**
   * repetition and lets `fromBar` select the window (`fromBar * 16` steps to `+16 * bars`); asking for `bars: 2` made
   * a two-bar chunk render the whole eight-bar pattern **twice**, which measured as chunk A's `chunkEndFrame` being
   * 682,839 frames of a 4-bar piece.
   *
   * `return` inside the arrow is spelled out for the same kind of reason: an arrow with a block body that only
   * *calls* the renderer returns `undefined`, and `timedRender` then reports `value: undefined` — which surfaced two
   * frames later as `Cannot read properties of undefined (reading 'buffer')` inside `mergeChunks`, i.e. as a merge bug
   * rather than a missing `return`.
   */
  const renderChunk = (fromBar, chunkBars, preRollSec) =>
    timedRender(() => {
      return mode === "song"
        ? wav.renderSongChunkOffline(song, {
            fromBar,
            bars: chunkBars,
            ...(preRollSec === undefined ? {} : { preRollSec }),
          })
        : wav.renderPatternChunkOffline(pattern, {
            fromBar,
            bars: chunkBars,
            ...(preRollSec === undefined ? {} : { preRollSec }),
          });
    });

  if (!state.chunkA) state.chunkA = await renderChunk(0, 1, 0);
  const b = await renderChunk(split, 1, plan.preRollSec);
  /**
   * Stated, not assumed. A render result that is missing its buffer is a defect in this file — and the two frames
   * between here and its first use turn that into a merge error that reads like bad arithmetic.
   */
  for (const [name, chunk] of [
    ["chunk A", state.chunkA],
    ["chunk B", b],
  ]) {
    if (!chunk?.value?.buffer) throw new Error(`${name} produced no buffer (renderer returned ${typeof chunk?.value})`);
  }
  const chunks = [state.chunkA.value, b.value];
  const merged = mergeChunks(chunks);
  /**
   * **Where each chunk's own audio sits against the whole render** — the one comparison that separates "the renderer
   * produced different samples for these bars" from "the merge put them together differently".
   *
   * `alignment` compares the chunk's own frames with the whole render's frames for the same bars, length-normalised:
   * the same music at the same place is ~0 dB, a different take of those bars is not. `splice` compares the merged
   * result with the whole render over the same span, so the pair says which of the two the total difference comes
   * from.
   */
  const alignment = { chunkA: null, chunkB: null, splice: null };
  if (state.whole) {
    const whole = state.whole.channels;
    const rate = state.whole.sampleRate;
    const compare = (a, aStart, bChannels, bStart, frames) => {
      let signal = 0;
      let error = 0;
      for (let c = 0; c < Math.min(a.length, bChannels.length); c += 1) {
        for (let i = 0; i < frames; i += 1) {
          const x = a[c]?.[aStart + i] ?? 0;
          const y = bChannels[c]?.[bStart + i] ?? 0;
          signal += x * x;
          const d = x - y;
          error += d * d;
        }
      }
      const signalDb = 10 * Math.log10(Math.max(signal, 1e-30));
      const errorDb = error > 0 ? 10 * Math.log10(error) : -Infinity;
      return { signalDb, errorDb, ratioDb: signalDb - errorDb };
    };
    const aValue = state.chunkA.value;
    const bValue = b.value;
    alignment.chunkA = compare(aValue.buffer ? channelData(aValue.buffer) : [], 0, whole, 0, Math.min(aValue.chunkEndFrame, state.whole.frames));
    const bStart = Math.round(bValue.barStartSeconds * rate);
    const bOwn = Math.max(0, bValue.chunkEndFrame - bValue.preRollFrames);
    alignment.chunkB = compare(channelData(bValue.buffer), bValue.preRollFrames, whole, bStart, Math.min(bOwn, state.whole.frames - bStart));
    alignment.splice = compare(
      merged.channels,
      bStart,
      whole,
      bStart,
      Math.min(merged.frames - bStart, state.whole.frames - bStart)
    );
  }

  const loud = loudness.measureLoudness(merged.channels, merged.sampleRate);
  const fp = timbre.fingerprintChannels(merged.channels, merged.sampleRate);
  const metrics = {
    frames: merged.frames,
    seconds: merged.frames / merged.sampleRate,
    integratedLufs: loud.integratedLufs,
    truePeakDb: loud.truePeakDb,
    bandDb: fp.bandDb,
    centroidHz: fp.centroidHz,
    rmsDb: fp.rmsDb,
  };
  const reference = state.whole.metrics;
  const result = {
    label: plan.label,
    preRollSec: (b.value.preRollFrames ?? 0) / b.value.sampleRate,
    preRollFrames: b.value.preRollFrames,
    usedPreRoll: state.chunkA.value.usedPreRoll || b.value.usedPreRoll,
    wallMs: state.chunkA.wallMs + b.wallMs,
    phases: sumPhases([state.chunkA, b]),
    chunkA: {
      fromBar: state.chunkA.value.fromBar,
      toBar: state.chunkA.value.toBar,
      frames: state.chunkA.value.buffer.length,
      preRollFrames: state.chunkA.value.preRollFrames,
    },
    chunkB: {
      fromBar: b.value.fromBar,
      toBar: b.value.toBar,
      frames: b.value.buffer.length,
      preRollFrames: b.value.preRollFrames,
      barStartSeconds: b.value.barStartSeconds,
      chunkEndFrame: b.value.chunkEndFrame,
    },
    merged: { frames: merged.frames, seconds: merged.frames / merged.sampleRate },
    metrics,
    bandL1: bandDistance(reference.bandDb, metrics.bandDb),
    worstBand: maxBandDelta(reference.bandDb, metrics.bandDb),
    lufsDelta: metrics.integratedLufs - reference.integratedLufs,
    truePeakDelta: metrics.truePeakDb - reference.truePeakDb,
    rmsDelta: metrics.rmsDb - reference.rmsDb,
    seam: seamStats(merged.channels, merged.seams),
    seamRegion: seamDifference(state.whole.channels, merged.channels, merged.seams, Math.round(0.5 * merged.sampleRate)),
    worstDifference: worstDifference(state.whole.channels, merged.channels, merged.sampleRate, merged.seams),
    alignment,
  };
  state.arms.push(result);
  return result;
}

/**
 * **The page's whole vocabulary for the driver: build, render the whole piece, measure one arm — in one call.**
 *
 * One call on purpose. A Vite dev server can reload the client (it does, when its dependency optimization decides the
 * config changed), and a reload resets this module's state — so a driver that built a fixture in one call and measured
 * an arm in the next was measuring against a page whose state had been wiped, and reported "this page has no fixture"
 * while a fixture had just been built. A step that carries its own inputs cannot be interrupted that way, and a page
 * that dies mid-measurement simply gets the same step replayed on a new one.
 */
export async function measure(request) {
  console.log(`[page] measure ${JSON.stringify(request.arm?.label ?? "(whole only)")}`);
  const fixture = await build(request.options);
  const wholeSummary = request.whole ?? (await whole());
  if (!request.arm) return { fixture, whole: wholeSummary, arm: null };
  return { fixture, whole: wholeSummary, arm: await arm(request.arm) };
}

/**
 * **The cut arm — no second render at all.**
 *
 * Every number so far compares two *renders* of different bar ranges, so a render difference and a splice difference
 * are indistinguishable in them. This takes the whole render and does nothing but **slice** it at the split bar, then
 * compares that slice against the whole render in exactly the two places the chunked path is compared. Slicing cannot
 * change a sample, so this arm's answer is a property of the *analysis*, not of the renderer: if the cut already
 * differs from the whole, the difference lives in the comparison; if the cut matches and the splice does not, the
 * difference was introduced by putting two renders together.
 *
 * Nothing is re-rendered and nothing is written: `page.evaluate` gets the answer from the audio already in memory.
 */
export async function cut(request) {
  const [loudness, timbre] = await Promise.all([
    import("/src/test/helpers/loudness.ts"),
    import("/src/test/helpers/timbre.ts"),
  ]);
  /**
   * **This arm renders the whole piece itself.** It used to read the sweep's `whole` state, and a page that Vite
   * reloads between two `page.evaluate` calls has no such state — which is the only reason this arm had no verdict.
   * One whole render plus a slice is a few seconds of audio, far inside the ~99 s a page survives, and owning the
   * input is what makes the answer independent of everything the rest of the probe did.
   */
  const fixture = await build(request.options);
  const wholeSummary = await whole();
  const wholeChannels = state.whole.channels;
  const rate = state.whole.sampleRate;
  /**
   * Where to cut: the same frame the second chunk starts its own audio at, expressed from the fixture rather than from
   * a chunk render — `split` bars of `stepsPerBar` steps, each `stepDur` in the tempo that was actually used. Taken
   * from the whole render's own length so the two cannot disagree: the split is a fraction of the piece, `split /
   * totalBars`.
   */
  const cutFrame = Math.round((fixture.split / fixture.bars) * wholeSummary.frames);

  /** The piece with a knife, not a renderer: frames [0, cutFrame) then [cutFrame, length) of the **same** buffer. */
  const cutChannels = wholeChannels.map((channel) => {
    const out = new Float32Array(channel.length);
    out.set(channel.subarray(0, Math.min(cutFrame, channel.length)), 0);
    if (cutFrame < channel.length) out.set(channel.subarray(cutFrame), cutFrame);
    return out;
  });

  const loud = loudness.measureLoudness(cutChannels, rate);
  const fp = timbre.fingerprintChannels(cutChannels, rate);
  return {
    options: request.options,
    fixture,
    splitFrame: cutFrame,
    splitSeconds: cutFrame / rate,
    frames: wholeSummary.frames,
    wholeFrames: wholeSummary.frames,
    whole: wholeSummary.metrics,
    /** A slice cannot change a sample, so this is the analysis's own floor — `-inf` is the correct answer. */
    vsWhole: worstDifference(wholeChannels, cutChannels, rate, [{ at: cutFrame, frames: 0 }]),
    bandL1: bandDistance(wholeSummary.metrics.bandDb, fp.bandDb),
    worstBand: maxBandDelta(wholeSummary.metrics.bandDb, fp.bandDb),
    lufsDelta: loud.integratedLufs - wholeSummary.metrics.integratedLufs,
    truePeakDelta: loud.truePeakDb - wholeSummary.metrics.truePeakDb,
    rmsDelta: fp.rmsDb - wholeSummary.metrics.rmsDb,
    wholeLufs: wholeSummary.metrics.integratedLufs,
    cutLufs: loud.integratedLufs,
    wholeRms: wholeSummary.metrics.rmsDb,
    cutRms: fp.rmsDb,
  };
}

/** Everything measured so far on this page, so a driver can print progress and a verdict at the end. */
export function collected() {
  return {
    fixture: state.fixture?.fixture ?? null,
    whole: state.whole?.summary ?? null,
    arms: state.arms,
  };
}
