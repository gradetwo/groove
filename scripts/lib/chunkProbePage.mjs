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
const worstDifference = (a, b, sampleRate) => {
  let worst = 0;
  let worstAt = -1;
  for (let c = 0; c < a.length; c += 1) {
    const length = Math.min(a[c].length, b[c].length);
    for (let i = 0; i < length; i += 1) {
      const difference = Math.abs(a[c][i] - b[c][i]);
      if (difference > worst) {
        worst = difference;
        worstAt = i;
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
  const sampleRate = chunks[0].rendered.buffer.sampleRate;
  const channels = chunks[0].rendered.buffer.numberOfChannels;
  const pieceStartFrame = (chunk) =>
    Math.round(chunk.rendered.barStartSeconds * sampleRate) - chunk.rendered.preRollFrames;
  const totalFrames = Math.max(...chunks.map((chunk) => pieceStartFrame(chunk) + chunk.rendered.buffer.length));
  const merged = [];
  for (let c = 0; c < channels; c += 1) merged.push(new Float32Array(totalFrames));
  const seams = [];
  let pieceEnd = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const { rendered } = chunks[index];
    const start = pieceStartFrame(chunks[index]);
    const length = rendered.buffer.length;
    const known = Math.max(0, Math.min(pieceEnd, start + length) - start);
    seams.push({ at: start, frames: known, chunkStart: start, index });
    for (let c = 0; c < channels; c += 1) {
      const source = rendered.buffer.getChannelData(c);
      const target = merged[c];
      for (let i = 0; i < known; i += 1) {
        const t = known > 1 ? i / (known - 1) : 1;
        target[start + i] = target[start + i] * (1 - t) + source[i] * t;
      }
      for (let i = known; i < length; i += 1) target[start + i] = source[i];
    }
    pieceEnd = Math.max(pieceEnd, start + length);
  }
  return { channels: merged, sampleRate, seams, frames: totalFrames };
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
  if (state.options && JSON.stringify(state.options) === JSON.stringify(options)) return state.fixture;
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
  state.fixture = { entry, clip, clipBars, pattern, song, totalBars, splitBar, sections, stepsPerBar, mode: options.mode, genre: options.genre };
  state.whole = null;
  state.chunkA = null;
  state.arms = [];
  return {
    genre: options.genre,
    mode: options.mode,
    bars: totalBars,
    clipBars,
    split: splitBar,
    sections,
  };
}

/** Render the whole piece (twice, so the measurement's own floor is known) and keep it as the reference. */
export async function whole() {
  if (state.whole) return state.whole.summary;
  const [wav, loudness, timbre] = await Promise.all([
    import("/src/audio/WavExporter.ts"),
    import("/src/test/helpers/loudness.ts"),
    import("/src/test/helpers/timbre.ts"),
  ]);
  const { pattern, song, mode } = requireFixture();
  const render = () =>
    timedRender(() => (mode === "song" ? wav.renderSongOffline(song, {}) : wav.renderPatternOffline(pattern, { bars: 1 })));
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
  const { pattern, song, totalBars, splitBar, mode } = requireFixture();
  const renderChunk = (fromBar, chunkBars, preRollSec) =>
    timedRender(() =>
      mode === "song"
        ? wav.renderSongChunkOffline(song, {
            fromBar,
            bars: chunkBars,
            ...(preRollSec === undefined ? {} : { preRollSec }),
          })
        : wav.renderPatternChunkOffline(pattern, {
            fromBar,
            bars: chunkBars,
            ...(preRollSec === undefined ? {} : { preRollSec }),
          })
    );

  if (!state.chunkA) state.chunkA = await renderChunk(0, splitBar, 0);
  const b = await renderChunk(splitBar, totalBars - splitBar, plan.preRollSec);
  const chunks = [state.chunkA, b];
  const merged = mergeChunks(chunks);

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
    phases: sumPhases(chunks),
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
    worstDifference: worstDifference(state.whole.channels, merged.channels, merged.sampleRate),
  };
  state.arms.push(result);
  return result;
}

/** Everything measured so far on this page, so a driver can print progress and a verdict at the end. */
export function collected() {
  return {
    fixture: state.fixture
      ? {
          genre: state.fixture.genre,
          mode: state.fixture.mode,
          bars: state.fixture.totalBars,
          clipBars: state.fixture.clipBars,
          split: state.fixture.splitBar,
          sections: state.fixture.sections,
        }
      : null,
    whole: state.whole?.summary ?? null,
    arms: state.arms,
  };
}
