#!/usr/bin/env node
/**
 * Export audio audit — the ten claims, measured on the app's own renders.
 *
 * A listener's report ("clicks on note attack", "harsh hats", "it is mono and dry", "the tail is cut") is a
 * hypothesis about the *audio*, so this turns each one into a number that can be confirmed or refuted on every
 * genre rather than discussed:
 *
 *   A1 clicks        largest sample-to-sample jump (dBFS) and how many jumps stand out from the texture
 *   A2 aliasing      13-band filterbank shape: energy above ~12 kHz relative to the total, plus rolloff band
 *   A3 dynamics      velocity spread in the pattern, and whether velocity reaches gain at all
 *   B1 clipping      4x-oversampled true peak (dBTP), pinned samples, per-genre headroom
 *   B2 hats          8-16 kHz energy share and the spectral centroid, for the hi-hat/percussion content
 *   B3 swing         the pattern's declared swing, and whether any track carries its own offset
 *   C1 space         inter-channel correlation and side energy (is the render effectively mono?),
 *                    plus whether the genre's mix enables the reverb/delay sends at all
 *   C2 tail          RMS and peak of the final milliseconds (a natural decay ends near silence)
 *
 * It renders through `renderPatternOffline` — the app's real offline path, the same one the WAV/MP3 export
 * uses — via the Vite **dev** server, so no test hook ships in the production bundle (the pattern
 * `measure_genre_loudness.mjs` established). The DSP comes from the repo's own tested helpers
 * (`helpers/loudness.ts` for LUFS/true peak, `helpers/timbre.ts` for the band shape, `helpers/audioMetrics.ts`
 * for clicks/clipping/space/tail) — never an inline copy.
 *
 * Usage
 *   node scripts/analyze_export_audio.mjs                      # every genre, export defaults
 *   node scripts/analyze_export_audio.mjs --only=reggaeton,chicago-blues
 *   node scripts/analyze_export_audio.mjs --bars=4             # what a longer render looks like
 *   node scripts/analyze_export_audio.mjs --json               # the raw rows
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const inline = argv.find((a) => a.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index !== -1 && argv[index + 1] ? argv[index + 1] : fallback;
};

const JSON_OUT = flag("--json");
/**
 * Which tracks get a stem render.
 *
 * All eight per genre would be 8x the render time, and three of them answer every instrument-level claim: the
 * kick (headroom, and whether swing actually reached the audio), the hats (harshness) and the melodic tracks
 * (aliasing).
 */
const STEM_TRACKS = value("--stem-tracks", "kick,hihat,lead,chords")
  .split(",")
  .map((track) => track.trim())
  .filter(Boolean);
const ONLY = value("--only", "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
/** Bus-compressor overrides — the A/B knobs for the mastering chain's give-back (P2.3). */
const BUS_COMP_RELEASE = Number(value("--bus-comp-release", "0")) || 0;
/** `--no-note-variation` renders with every stab identical (A3's control), for attributing a regression. */
const NO_NOTE_VARIATION = process.argv.includes("--no-note-variation");
const BUS_COMP_THRESHOLD = value("--bus-comp-threshold", "");
const BUS_COMP_RATIO = value("--bus-comp-ratio", "");
/** The **export** default is one bar; `--bars=4` shows what the tail looks like with more material. */
const BARS = Number(value("--bars", "1"));
const PORT = Number(value("--port", "5321"));
const OUT_JSON = value("--out", "scratch/export-audio-audit.json");

function startDevServer() {
  return new Promise((resolve, reject) => {
    const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
    const child = spawn(process.execPath, [viteBin, "--port", String(PORT), "--strictPort"], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const onData = (chunk) => {
      output += chunk.toString();
      if (/Local:\s+http/.test(output) || /ready in/.test(output)) resolve(child);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => reject(new Error(`vite exited early (${code}):\n${output}`)));
    setTimeout(() => reject(new Error(`vite did not become ready in 60s:\n${output}`)), 60000);
  });
}

/**
 * Render one genre and measure it **inside the page**.
 *
 * The metrics run in the browser because the buffer lives there; only the numbers cross the boundary, so a
 * four-bar stereo render never has to be serialised into Node.
 */
async function measureGenre(page, genreId, bars, soloTracks) {
  return page.evaluate(
    /**
     * `busCompRelease` crosses the boundary explicitly: a Node-side constant is not visible inside this function
     * (the first version of the A/B referenced one and crashed the whole measurement with a ReferenceError).
     */
    async ({ id, bars: barsArg, soloTracks, busCompRelease, busCompThreshold, busCompRatio, noNoteVariation }) => {
      const [wav, genresModule, mixModule, loudness, timbre, metrics, trackUtils, noteEvents, sidechain] = await Promise.all([
        import("/src/audio/WavExporter.ts"),
        import("/src/data/genres/index.ts"),
        import("/src/data/genreMix.ts"),
        import("/src/test/helpers/loudness.ts"),
        import("/src/test/helpers/timbre.ts"),
        import("/src/test/helpers/audioMetrics.ts"),
        import("/src/utils/trackUtils.ts"),
        // The duck measurement reproduces the renderer's step grid, so it uses the *shared* probability
        // helper instead of a second copy of the decision.
        import("/src/audio/noteEvents.ts"),
        // The authored duck envelope: the depth claim is measured from the render, the *duration* is computed here
        // (see `envelopeHold3DbMs`) because widening the scan made the render-side numbers unstable.
        import("/src/audio/sidechain.ts"),
      ]);
      const genre = genresModule.ALL_GENRES.find((g) => g.id === id);
      if (!genre) throw new Error(`unknown genre: ${id}`);
      /**
       * The pattern the *user* hears — genre mix applied, chords/expression expanded,
       * velocities humanised (P0.2) — not `genre.sequencer_pattern`.
       *
       * Measuring the authored skeleton was a calibration bug: that object is a progression
       * root plus one loop of placeholder velocities, it never passes through `patternFromGenre`,
       * and nothing in the app ever renders it. Every claim in this report was therefore about
       * a pattern no user can play, which is the same class of mistake as sampling genre ids
       * that do not exist (A3/`flatTracks` read the pattern, not the audio).
       */
      const pattern = mixModule.patternFromGenre(genre);
      const drumKit = trackUtils.getDefaultDrumKitForGenre(genre);

      const renderMaster = async () => {
        let kind = "fallback";
        const rendered = await wav.renderPatternOffline(pattern, {
        ...(noNoteVariation ? { noteVariation: false } : {}),

          bars: barsArg,
          drumKit,
          onLimiterKind: (value) => {
            kind = value;
          },
        });
        const renderedChannels = [];
        for (let c = 0; c < rendered.numberOfChannels; c += 1) renderedChannels.push(rendered.getChannelData(c));
        return { rendered, renderedChannels, kind };
      };

      /**
       * A cut tail is reported only when a **second** render agrees.
       *
       * The engine's own repeat nondeterminism is documented in `scripts/diagnose_repeat_determinism.mjs`:
       * two renders of the same project are not sample-identical, and the sensitive place is exactly here —
       * detroit-techno's final 50 ms measured −65.5 dBFS in four runs and −24.7 dBFS in two, with the same
       * duration, true peak and integrated loudness. A gate that fails on a coin flip is worse than no gate,
       * so a tail that trips the claim is re-rendered once; a *real* cut tail (a pattern still sounding at the
       * end, like boom-bap) trips both renders, and a burst that was an artefact does not.
       */
      /**
       * The level the last 50 ms must be below.
       *
       * −30 dBFS was the *measured* bar when the renderer had a fixed 0.6 s tail; the plan's target was always
       * "under −60 dBFS", and P0.6 (a tail sized to the genre's own reverb and delay) reaches it everywhere:
       * every sampled genre now measures below −82 dBFS. The threshold moved with the fix, so the claim now means
       * "the render ends in silence" rather than "the render is not obviously cut".
       */
      const TAIL_CLAIM_DB = -60;
      let tailRenders = 1;
      /**
       * A discarded warm-up render, so the measured one is never the first on a freshly recycled page.
       *
       * The loudness script has done this since P0.8 ("Warm-up render (discarded)") for the same reason: the first
       * render after a page is created runs in a different state from the ones after it, and the difference shows up
       * in the *tail* — which is exactly the number `cutTail` is made of.
       */
      await renderMaster();
      const first = await renderMaster();
      let buffer = first.rendered;
      let channels = first.renderedChannels;
      let limiterKind = first.kind;
      const rate = buffer.sampleRate;
      let tailRmsDb = metrics.tailRmsDb(channels, rate, 50);
      if (tailRmsDb > TAIL_CLAIM_DB) {
        const confirmation = await renderMaster();
        tailRenders = 2;
        const confirmed = metrics.tailRmsDb(confirmation.renderedChannels, confirmation.rendered.sampleRate, 50);
        tailRmsDb = Math.max(tailRmsDb, confirmed);
      }

      const shape = timbre.fingerprintChannels(channels, rate);
      /** Measured once: the return object needs it twice (the claim and the relative tail). */
      const integratedLufs = loudness.measureLoudness(channels, rate).integratedLufs;

      // The highest three 2/3-octave bands (centres ~8 kHz and up) hold what "harsh" means.
      const bands = shape.bandDb;
      const topShareDb = bands.slice(-3).reduce((acc, db) => acc + 10 ** (db / 10), 0);
      const velocities = pattern.tracks.flatMap((track) => (track.velocity ?? []).filter((_, i) => track.steps[i]));
      const uniqueVelocities = new Set(velocities);
      const mix = mixModule.resolveGenreMix(id);

      /**
       * Swing, measured rather than declared: how far past the grid do the off-beats land?
       *
       * The grid is `60 / bpm / 4` seconds per 16th. This used to look only at the **odd 16ths** ("e" and "a"),
       * which is why boom-bap — declared swing 60, the highest in the sample — measured as perfectly straight:
       * its kick plays 8ths, and an 8th grid never touches an odd 16th. Any off-downbeat position counts now
       * (steps 1, 2 and 3 of each beat, i.e. all of the "e", "&" and "a"), so a pattern that swings on the
       * off-8th is measurable, exactly as P0.5 makes it audible.
       */
      const stepSec = 60 / (pattern.bpm || 120) / 4;
      const measureSwing = (stemChannels, rate) => {
        const onsets = metrics.onsetTimesMs(stemChannels, rate);
        const offsets = [];
        for (const ms of onsets) {
          const steps = ms / 1000 / stepSec;
          const nearest = Math.round(steps);
          if (nearest % 4 !== 0 && Math.abs(steps - nearest) < 0.35) {
            offsets.push((steps - nearest) * stepSec * 1000);
          }
        }
        if (!offsets.length) return null;
        const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
        return { samples: offsets.length, meanOffsetMs: Math.round(mean * 100) / 100 };
      };

      /**
       * Per-track pass: the claims are about *instruments* ("the hats are harsh", "the lead aliases", "the kick
       * gives no headroom"), and a mix-level number cannot tell which track caused it. Each stem is the same
       * pattern with every other track silenced, rendered through the same path.
       */
      const stems = {};
      const stemIds = soloTracks && soloTracks.length ? soloTracks : pattern.tracks.map((t) => t.track_id);
      for (const trackId of stemIds) {
        const solo = {
          ...pattern,
          tracks: pattern.tracks.map((track) =>
            track.track_id === trackId
              ? track
              : {
                  ...track,
                  steps: track.steps.map(() => 0),
                  velocity: track.velocity ? track.velocity.map(() => 0) : undefined,
                  gate: track.gate ? track.gate.map(() => 0) : undefined,
                }
          ),
        };
        let stemBuffer;
        try {
          stemBuffer = await wav.renderPatternOffline(solo, { bars: barsArg, drumKit });
        } catch {
          continue;
        }
        const stemChannels = [];
        for (let c = 0; c < stemBuffer.numberOfChannels; c += 1) stemChannels.push(stemBuffer.getChannelData(c));
        /** Which lane this stem is, for the per-stab grid below. */
        const stemsTrackId = trackId;
        const stemShape = timbre.fingerprintChannels(stemChannels, stemBuffer.sampleRate);
        const stemTop = stemShape.bandDb.slice(-3).reduce((acc, db) => acc + 10 ** (db / 10), 0);
        const onsets = metrics.onsetTimesMs(stemChannels, stemBuffer.sampleRate);
        // Alternating onset intervals: 1.00 is straight 16ths, above 1 is a long-short (swung) pair.
        /**
         * How much the *timbre* moves from one stab to the next (P2.2/A3).
         *
         * A 16-step loop repeats the same stab twelve times a bar; if those twelve are identical, the loop reads as
         * a machine and this number is 0. Measured on the detected onsets rather than on a reconstructed step grid,
         * because the question is "did the sound change between two hits a listener hears", and the detector is
         * already the thing that found them.
         *
         * The window is 30 ms from each onset — long enough for the 2/3-octave bank's low bands to have some energy,
         * short enough to stay inside the note. The metric is the **filterbank centroid** the timbre helper already
         * exposes (there is no FFT helper in this repo; see its header), so a move here is a real spectral move at
         * the bank's 2/3-octave resolution, not an artefact of a different analyser.
         */
        /**
         * How much the *timbre* moves between two hits of the **same note** (P2.2/A3).
         *
         * A 16-step loop repeats the same stab twelve times a bar; if those twelve are identical, the loop reads as a
         * machine and this number is 0. The first version of this measurement compared consecutive *detected*
         * onsets and read 13–34 % — which was the metric measuring **pitch**, since consecutive onsets are usually
         * different notes. The nudge is what makes the same note sound different twice, so the comparison has to be
         * within a pitch:
         *
         *  · the grid is the *renderer's* own (step → time with its swing rule and probability gate), because the
         *    question is about the notes the pattern asked for, not about what a detector made of the sum;
         *  · onsets are grouped by MIDI pitch and compared **within** each group, in time order;
         *  · the metric is the filterbank centroid the timbre helper already exposes (there is no FFT helper in this
         *    repo — see its header), over a 30 ms window: long enough for the low bands to have energy, short enough
         *    to stay inside the note.
         */
        /**
         * How much the *timbre* moves between two hits of the **same note** (P2.2/A3), and its control.
         *
         * A 16-step loop repeats the same stab twelve times a bar; if those twelve are identical, the loop reads as a
         * machine and this number is 0. Three things had to be fixed before the number meant anything, and each is
         * worth keeping written down:
         *
         *  1. comparing consecutive *detected* onsets read 13–34 % because consecutive onsets are usually different
         *     **pitches** — the metric was measuring melody;
         *  2. keying the groups by pitch alone put every chord-lane hit in one bucket (`pitch` is often 0 there, with
         *     the harmony in `pitches`), and then by velocity too, because P0.2 humanises it and velocity drives the
         *     filter — so two hits in a group were still not "the same stab twice";
         *  3. measuring inside the filter envelope's own sweep (0–30 ms) reported the transient's *phase*: a small
         *     cutoff difference is a large instantaneous centroid difference there. The settled window (90–120 ms) is
         *     what a listener hears as the stab's colour.
         *
         * Even so, the settled number is 15–27 % with the nudge on, and the honest question is how much of that is the
         * nudge at all — a stab is not rendered in isolation, so the filter's state and the seeded noise bed differ
         * per hit. Hence the control: the **same pattern rendered with the variation off**. Whatever that reads is
         * context; the difference is the fix.
         */
        const stabMove = await (async () => {
          const track = pattern.tracks.find((t) => (t.track_id || "").toLowerCase() === stemsTrackId);
          if (!track) return null;
          const trackIndex = pattern.tracks.indexOf(track);
          const trackLength = track.trackLength > 0 ? track.trackLength : track.steps.length;
          const patternSteps = pattern.totalSteps > 0 ? pattern.totalSteps : trackLength || 16;
          const stepDurSec = 60 / Math.max(20, Math.min(300, pattern.bpm || 120)) / 4;
          const rawSwing = pattern.swing ? (pattern.swing > 1 ? pattern.swing / 100 : pattern.swing) : 0;
          const swingAmount = Math.max(0, Math.min(0.75, rawSwing + (track.swing ?? 0) / 100));
          const stabSeed = noteEvents.patternSeed(pattern);
          /** key -> sample offsets, in time order, at the given sample rate. */
          const gridAt = (sampleRate) => {
            const byKey = new Map();
            for (let step = 0; step < patternSteps * barsArg; step += 1) {
              const idx = trackLength > 0 ? step % trackLength : step;
              if (!(track.steps[idx] > 0)) continue;
              if (!noteEvents.probabilityPasses(track.probability?.[idx], stabSeed, trackIndex, idx)) continue;
              const swingOffset = step % 2 === 1 && swingAmount > 0 ? swingAmount * 0.5 * stepDurSec : 0;
              const at = Math.round((step * stepDurSec + swingOffset) * sampleRate);
              const voicing = track.pitches?.[idx];
              const velocity = track.velocity?.[idx] ?? 0;
              const key = `${
                voicing && voicing.length ? `v:${voicing.join("-")}` : `p:${track.pitch?.[idx] ?? 0}`
              }@${Math.round(velocity)}`;
              if (!byKey.has(key)) byKey.set(key, []);
              byKey.get(key).push(at);
            }
            return byKey;
          };
          /** The median settled centroid move within a group, per cent — null when there is too little to say. */
          const settledMedian = (channels, sampleRate) => {
            const byKey = gridAt(sampleRate);
            const start = Math.round(sampleRate * 0.09);
            const windowSamples = Math.round(sampleRate * 0.03);
            const moves = [];
            const distances = [];
            let hits = 0;
            for (const positions of byKey.values()) {
              const shapes = [];
              for (const at of positions) {
                const from = at + start;
                if (from <= 0 || from + windowSamples > (channels[0]?.length ?? 0)) continue;
                const window = channels.map((channel) => channel.subarray(from, from + windowSamples));
                const shape = timbre.fingerprintChannels(window, sampleRate);
                if (shape.centroidHz > 0) shapes.push(shape);
              }
              hits += shapes.length;
              for (let i = 1; i < shapes.length; i += 1) {
                if (!(shapes[i - 1].centroidHz > 0)) continue;
                moves.push(
                  ((Math.abs(shapes[i].centroidHz - shapes[i - 1].centroidHz) / shapes[i - 1].centroidHz) * 100)
                );
                /**
                 * …and the **band-shape** distance between the same two hits.
                 *
                 * The centroid is a 2/3-octave-weighted average, and an 8 % cutoff nudge is a sixth of a band: it
                 * moved the centroid by nothing measurable (native on 7.83 % against off 7.84 %) while the two hits
                 * were not identical at all. The helper's band-distance is the metric that can see a change that
                 * small, and it is the one the claim uses.
                 */
                distances.push(timbre.fingerprintDistance(shapes[i - 1], shapes[i]));
              }
            }
            if (moves.length < 3) return null;
            const sorted = [...moves].sort((a, b) => a - b);
            const at = (q) =>
              Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] * 100) / 100;
            const sortedDistances = [...distances].sort((a, b) => a - b);
            const atDistance = (q) =>
              Math.round(
                (sortedDistances[Math.min(sortedDistances.length - 1, Math.floor(q * sortedDistances.length))] ?? 0) *
                  1000
              ) / 1000;
            return {
              hits,
              comparisons: moves.length,
              medianPct: at(0.5),
              p25Pct: at(0.25),
              maxPct: Math.round(sorted[sorted.length - 1] * 100) / 100,
              /** Mean absolute band-shape difference between consecutive hits of the same note, dB. */
              medianDistanceDb: sortedDistances.length ? atDistance(0.5) : null,
            };
          };
          /**
           * The shipping pair first, as the *context* figure: with GS-1 voicing the lane (its default), the nudge
           * never runs, and this pair is identical — which is how the gap was found. It stays in the report because
           * it is the honest description of what the delivered file does today.
           */
          const shippingOn = settledMedian(stemChannels, stemBuffer.sampleRate);
          if (!shippingOn) return null;
          const renderSettled = async (options) => {
            try {
              const buffer = await wav.renderPatternOffline(solo, { bars: barsArg, drumKit, ...options });
              const channels = [];
              for (let c = 0; c < buffer.numberOfChannels; c += 1) channels.push(buffer.getChannelData(c));
              return settledMedian(channels, buffer.sampleRate);
            } catch {
              return null;
            }
          };
          const shippingOff = await renderSettled({ noteVariation: false });

          /**
           * And the pair the claim is about: the **native** path, where the variation actually reaches the voice.
           *
           * GS-1's host API has no per-note timbre parameters (`noteOnAt(note, velocity, atFrame, pan)`), so with
           * the pool enabled the nudge cannot run at all. Measuring the native path is therefore the only way to
           * measure the fix, and it is reported as *that* — a native-path figure, not a claim about every genre's
           * delivered file, which GS-1 currently voices with no per-note timbre at all.
           */
          let nativeOn = null;
          let nativeOff = null;
          try {
            const gs1 = await import("/src/audio/gs1/gs1Tracks.ts");
            gs1.setGs1RoutingEnabled(false);
            nativeOn = await renderSettled({});
            nativeOff = await renderSettled({ noteVariation: false });
            gs1.setGs1RoutingEnabled(true);
          } catch {
            nativeOn = null;
            nativeOff = null;
          }
          const delta = (a, b) =>
            a && b && Number.isFinite(a.medianPct) && Number.isFinite(b.medianPct)
              ? Math.round((a.medianPct - b.medianPct) * 100) / 100
              : null;
          return {
            ...shippingOn,
            /** The shipping lane (GS-1 by default): identical with and without the nudge, until the core grows one. */
            shippingMedianPct: shippingOn.medianPct,
            shippingControlPct: shippingOff?.medianPct ?? null,
            shippingDeltaPct: delta(shippingOn, shippingOff),
            /** The native path: the figure the claim uses, because it is where the nudge lands. */
            nativeMedianPct: nativeOn?.medianPct ?? null,
            nativeControlPct: nativeOff?.medianPct ?? null,
            nativeDeltaPct: delta(nativeOn, nativeOff),
            /** The claim's metric: band-shape distance between consecutive hits, native path, nudge on and off. */
            nativeDistanceDb: nativeOn?.medianDistanceDb ?? null,
            nativeControlDistanceDb: nativeOff?.medianDistanceDb ?? null,
          };
        })();
        const intervals = onsets.slice(1).map((ms, i) => ms - onsets[i]).filter((ms) => ms > 20);
        const even = intervals.filter((_, i) => i % 2 === 0);
        const odd = intervals.filter((_, i) => i % 2 === 1);
        const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
        const meanEven = mean(even);
        const meanOdd = mean(odd);
        stems[trackId] = {
          truePeakDb: loudness.truePeakDbChannels(stemChannels),
          samplePeakDb: metrics.samplePeakDb(stemChannels),
          clippedSamples: metrics.clippedSampleCount(stemChannels),
          centroidHz: stemShape.centroidHz,
          topBandShareDb: 10 * Math.log10(Math.max(stemTop, 1e-12)),
          clicks: metrics.clickAnalysis(stemChannels, stemBuffer.sampleRate, { factor: 6 }),
          onsetCount: onsets.length,
          /** Per-stab timbre movement (P2.2/A3) — null when the lane has too few stabs to say. */
          stabMove,
          swingRatio: meanEven && meanOdd ? meanEven / meanOdd : null,
          /** How far the off-16ths sit past their grid line, in ms (0 = straight). */
          swingOffsetMs: measureSwing(stemChannels, stemBuffer.sampleRate)?.meanOffsetMs ?? null,
          swingSamples: measureSwing(stemChannels, stemBuffer.sampleRate)?.samples ?? 0,
          /**
           * Per-stem stereo, so "the mix is mono" can be attributed to a lane instead of guessed at: a lane that
           * is panned and loud shows low correlation here even when the master is dominated by centred kick/bass.
           */
          correlation: stemChannels.length > 1 ? metrics.channelCorrelation(stemChannels[0], stemChannels[1]) : 1,
          sideToMidDb: metrics.sideToMidDb(stemChannels),
        };
      }

      /**
       * The musical claims, which are about the pattern and the mix rather than the signal.
       *
       * A listening report says "every note has the same velocity", "the melody never moves", "there is no
       * swing", "the bass fights the kick", "the mid-range is empty". Each of those is checkable:
       */
      const velocityByTrack = Object.fromEntries(
        pattern.tracks.map((track) => {
          const on = track.steps.map((step, index) => (step ? track.velocity?.[index] ?? 100 : null)).filter((v) => v !== null);
          return [
            track.track_id,
            on.length ? { min: Math.min(...on), max: Math.max(...on), distinct: new Set(on).size, onsets: on.length } : null,
          ];
        })
      );
      const pitchByTrack = Object.fromEntries(
        pattern.tracks
          .filter((track) => track.pitch?.some((p) => p !== null))
          .map((track) => {
            const notes = track.pitch.filter((p) => p !== null);
            return [
              track.track_id,
              { distinct: new Set(notes).size, min: Math.min(...notes), max: Math.max(...notes), changes: notes.filter((p, i) => i > 0 && p !== notes[i - 1]).length },
            ];
          })
      );

      /**
       * Does the bass actually duck when the kick hits?
       *
       * Measured as a **paired** render: the same bass+kick pair once with the duck active and once with the kick
       * removed (the control can never schedule a duck — the trigger lives inside the kick's own branch of the
       * render loop). The two renders differ only in the kick's presence, so the level ratio over the same windows
       * *is* the sidechain and nothing else.
       *
       * Earlier versions of this measurement were wrong in ways worth keeping written down:
       *
       *   1. it rendered the bass **alone** and compared the window before a kick with the window after it. With the
       *      kick's steps zeroed no duck is ever scheduled, so that number was the bass part's own envelope — a bass
       *      note starting on the kick read as +2..+5 dB — and no amount of depth could have falsified it;
       *   2. it anchored the window to a detected kick *peak*. An 808's peak lands tens of milliseconds after its
       *      trigger, so the window fell into the release and reported a 6 dB duck as a 0.5 dB mean.
       *
       * The window is anchored to the **scheduled** kick step: the grid below mirrors `renderPatternOffline`
       * (`step % trackLength`, its swing rule, its `totalSteps`, and the shared probability helper), and the
       * kick-only render is kept as a cross-check that the mirror still lines up with what rendered.
       *
       * It is measured **twice**: once with the mastering bus compressor in the chain (`duckMasterDb`, what reaches
       * the file) and once with it bypassed (`duckDb`, the sidechain's own depth). The difference is not academic —
       * the glue compressor and the ceiling give part of the duck back on loud genres, so reporting only one of the
       * two numbers would either flatter the sidechain or understate it.
       */
      const measureDuck = async () => {
        const bassTrack = pattern.tracks.find((t) => t.track_id === "bass");
        const kickTrack = pattern.tracks.find((t) => t.track_id === "kick");
        if (!bassTrack || !kickTrack) return null;
        const kickIdx = pattern.tracks.indexOf(kickTrack);
        /** Keep the named tracks and silence everything else, so no other part can mask the pair. */
        const only = (keep) => ({
          ...pattern,
          tracks: pattern.tracks.map((t) =>
            keep.includes(t.track_id)
              ? t
              : { ...t, steps: t.steps.map(() => 0), gate: t.gate ? t.gate.map(() => 0) : undefined }
          ),
        });
        /** The pattern's own mixer, with the kick's *output* removed and its triggering untouched. */
        const kickSilentStates = () =>
          pattern.tracks.map((t) => ({
            mute: false,
            solo: false,
            volume: t.track_id === "kick" ? 0 : Number.isFinite(t.volume) ? t.volume : 0.8,
            pan: Number.isFinite(t.pan) ? t.pan : 0,
            sendA: t.track_id === "kick" ? 0 : Number.isFinite(t.sendA) ? t.sendA : 0,
            sendB: t.track_id === "kick" ? 0 : Number.isFinite(t.sendB) ? t.sendB : 0,
          }));
        /**
         * A render pair with the two mastering stages switchable **independently**.
         *
         * The first version of this measurement turned both off together, so "the sidechain is −4.4 dB and the file
         * shows −0.4 dB" said *that* something in the mastering chain gave the duck back but not *what*. It is two
         * very different bugs: the bus compressor's makeup (a level decision) or the ceiling's gain recovering as
         * the duck removes programme peak (a peak decision), and each has a different fix. The matrix is the cheapest
         * way to tell them apart — four renders instead of two.
         */
        const compRelease = {
          ...(busCompRelease > 0 ? { masterBusCompReleaseSec: busCompRelease } : {}),
          ...(busCompThreshold !== "" ? { masterBusCompThresholdDb: Number(busCompThreshold) } : {}),
          ...(busCompRatio !== "" ? { masterBusCompRatio: Number(busCompRatio) } : {}),
        };
        const renderPair = (busComp, ceilingLifted) =>
          Promise.all([
            wav
              .renderPatternOffline(only(["bass", "kick"]), {
                bars: barsArg,
                trackStates: kickSilentStates(),
                masterBusCompEnabled: busComp,
                ...compRelease,
                limiterCeilingDb: ceilingLifted ? 12 : undefined,
              })
              .catch(() => null),
            wav
              .renderPatternOffline(only(["bass"]), {
                bars: barsArg,
                trackStates: kickSilentStates(),
                masterBusCompEnabled: busComp,
                ...compRelease,
                limiterCeilingDb: ceilingLifted ? 12 : undefined,
              })
              .catch(() => null),
          ]);
        const [
          [pureDucked, pureControl],
          [compDucked, compControl],
          [ceilingDucked, ceilingControl],
          [fullDucked, fullControl],
          kickSolo,
        ] = await Promise.all([
          // No bus compressor, ceiling lifted: the sidechain's own depth.
          renderPair(false, true),
          // Bus compressor only.
          renderPair(true, true),
          // Ceiling only.
          renderPair(false, false),
          // Both: what the file shows.
          renderPair(true, false),
          wav.renderPatternOffline(only(["kick"]), { bars: barsArg }).catch(() => null),
        ]);
        if (!pureDucked || !pureControl || !fullDucked || !fullControl || !kickSolo) return null;
        const rate = pureDucked.sampleRate;
        const rms = (data, from, to) => {
          let sum = 0;
          const start = Math.max(0, from);
          const end = Math.min(data.length, to);
          for (let i = start; i < end; i += 1) sum += data[i] * data[i];
          return Math.sqrt(sum / Math.max(1, end - start));
        };
        const clampSwing = (value) => Math.max(0, Math.min(0.75, Number.isFinite(value) ? value : 0));
        const bpm = Math.max(20, Math.min(300, pattern.bpm || 120));
        const stepDur = 60 / bpm / 4;
        const swing = clampSwing(pattern.swing ? (pattern.swing > 1 ? pattern.swing / 100 : pattern.swing) : 0);
        const effectiveSwing = clampSwing(swing + (kickTrack.swing ?? 0) / 100);
        const patternSteps = pattern.totalSteps > 0 ? pattern.totalSteps : kickTrack.steps.length || 16;
        const kickLength = kickTrack.trackLength > 0 ? kickTrack.trackLength : kickTrack.steps.length;
        const seed = noteEvents.patternSeed(pattern);
        /**
         * The dip, measured as the **deepest 5 ms** in the 60 ms after each kick.
         *
         * A fixed window cannot work here. The first attempt averaged 5-25 ms, which measures a long release as a
         * deeper duck than a short one at the same depth; the second averaged 3-15 ms, which lands before the bass
         * note's own energy has developed — the ratio is energy-weighted, so a note that peaks at 20 ms read as
         * 0 dB and the sounding floor excluded the rest. The deepest short window is what a listener actually hears
         * as "the bass dropped", and it is independent of both the release length and the note's envelope.
         */
        const windowSamples = Math.round(rate * 0.005);
        /**
         * A 60 ms scan, and a **tried-and-reverted** longer one worth recording.
         *
         * A listening review of `disco-loop.wav` (2026-09-24, `docs/AUDIO_REVIEW.md`) reported
         * "几乎没有明显的侧链抽吸避让" while this file's median dip read −3.82 dB, and the scan window looked like the
         * explanation: 60 ms cannot contain a duck. It was widened to one onset's worth of time (capped at 400 ms)
         * and the readings got *worse and unstable* — `disco` fell from −4.4 dB to 0 dB on the sample run while a
         * local run of the same genre read −2.2 dB, and the derived "≥3 dB hold" came out at 14 ms for an envelope
         * that holds 3 dB for **64.5 ms** (`duckGainAt`, Electronic: 6 dB, 3 ms attack, 130 ms release —
         * `sidechainDuck.test.ts`).
         *
         * So the longer window adds windows where the ducked and control renders differ for reasons that are not the
         * duck (a note ending, the next note's onset, the noise-based drum variation), and the median across onsets
         * stops describing the dip. The scan stays at 60 ms, the claim stays a **depth** check — and the honest
         * statement about duration comes from the envelope, not from a render.
         */
        const stepSamples = Math.max(1, Math.round(rate * 0.001));
        const scanSamples = Math.round(rate * 0.06);

        /** Every scheduled kick step in the render, as `[sampleIndex, step]`. */
        const grid = [];
        for (let step = 0; step < patternSteps * barsArg; step++) {
          const stepIdx = kickLength > 0 ? step % kickLength : step;
          if (!(kickTrack.steps[stepIdx] > 0)) continue;
          if (!noteEvents.probabilityPasses(kickTrack.probability?.[stepIdx], seed, kickIdx, stepIdx)) continue;
          const swingOffset = step % 2 === 1 && effectiveSwing > 0 ? effectiveSwing * 0.5 * stepDur : 0;
          const at = Math.round((step * stepDur + swingOffset) * rate);
          if (at + scanSamples >= pureDucked.length) break;
          grid.push(at);
        }
        const kickAudio = kickSolo.getChannelData(0);
        const kickPeak = kickAudio.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
        const energyOnsets = grid.filter(
          (at) => kickPeak > 0 && rms(kickAudio, at, at + scanSamples) > kickPeak * 0.01
        ).length;

        /**
         * The ratio at every grid point where the bass is *properly* sounding.
         *
         * An absolute floor of 1e-4 (−80 dBFS) treated a decaying tail or the noise floor as "the bass is playing
         * here", and with a sparse bass line those meaningless windows were the majority — they are why a real duck
         * first measured as a 0.5 dB mean. The floor is relative to the control's own average level (within ~16 dB
         * of it) with an absolute guard; the sounding test uses the *control* of the same pair, so the two pairs
         * cannot disagree about which windows count.
         */
        const ratiosFor = (duckedBuffer, controlBuffer) => {
          const ducked = duckedBuffer.getChannelData(0);
          const unducked = controlBuffer.getChannelData(0);
          const floor = Math.max(1e-3, rms(unducked, 0, unducked.length) * 0.15);
          const dips = [];
          let louderOnsets = 0;
          for (const at of grid) {
            let deepest = null;
            let windows = 0;
            for (let start = at; start + windowSamples <= at + scanSamples; start += stepSamples) {
              const reference = rms(unducked, start, start + windowSamples);
              if (reference <= floor) continue;
              const ratio = 20 * Math.log10(Math.max(rms(ducked, start, start + windowSamples), 1e-9) / reference);
              deepest = deepest === null ? ratio : Math.min(deepest, ratio);
              windows += 1;
            }
            // Two windows is the minimum for "there is bass here and it was watched over time".
            if (deepest === null || windows < 2) continue;
            dips.push(deepest);
            if (deepest > 0) louderOnsets += 1;
          }
          if (!dips.length) return { onsets: 0, meanDb: 0 };
          const sorted = [...dips].sort((a, b) => a - b);
          return {
            onsets: dips.length,
            meanDb: Math.round((dips.reduce((a, b) => a + b, 0) / dips.length) * 100) / 100,
            medianDb: Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100,
            minDb: Math.round(sorted[0] * 100) / 100,
            /** Onsets where the bass never dipped at all — a red flag if this is not ~0. */
            louderOnsets,
          };
        };
        /**
         * The absolute levels of the four pairs, because a *ratio* cannot say whether the ducked side came up or the
         * control went down.
         *
         * What the four cells say (disco, 2026-09-23), mean | median:
         *
         *   pure (no bus comp, ceiling lifted)   −4.41 | −4.37
         *   bus compressor only                  −2.09 |  0
         *   ceiling only                         −4.41 | −4.37
         *   both — the file                      −1.98 | −0.2
         *
         * The ceiling is transparent in **both** statistics, so the gain-recovery hypothesis is dead. The bus
         * compressor is what takes the *median* onset's dip to **zero** while only halving the mean, and three
         * attempts to tune it away all failed: release (0.22/0.50/0.80 s → −2.09/−2.04/−2.03), threshold (−6 dB →
         * −2.2), ratio (1.2:1 → −2.18). Content cannot pay for it either — a temporary **×3** duck depth moved the
         * pure median to −13.62 dB and the file's median only to −0.35, i.e. the median is *saturated at zero* by the
         * node rather than shrunk proportionally.
         *
         * The conclusion is structural, not a setting: a `DynamicsCompressorNode` whose detector sees the ducked
         * programme will give a deliberate dip back, and the fix is a compressor the sidechain cannot fool (detect on
         * a pre-duck copy). These fields are what makes that arguable rather than asserted.
         */
        const rmsOf = (buffer) => rms(buffer.getChannelData(0), 0, buffer.getChannelData(0).length);
        const levels = {
          pureDucked: Math.round(rmsOf(pureDucked) * 1e6) / 1e6,
          pureControl: Math.round(rmsOf(pureControl) * 1e6) / 1e6,
          compDucked: compDucked ? Math.round(rmsOf(compDucked) * 1e6) / 1e6 : null,
          compControl: compControl ? Math.round(rmsOf(compControl) * 1e6) / 1e6 : null,
          ceilingDucked: ceilingDucked ? Math.round(rmsOf(ceilingDucked) * 1e6) / 1e6 : null,
          fullDucked: Math.round(rmsOf(fullDucked) * 1e6) / 1e6,
          fullControl: Math.round(rmsOf(fullControl) * 1e6) / 1e6,
        };
        const pure = ratiosFor(pureDucked, pureControl);
        const comp = compDucked && compControl ? ratiosFor(compDucked, compControl) : null;
        const ceiling = ceilingDucked && ceilingControl ? ratiosFor(ceilingDucked, ceilingControl) : null;
        const full = ratiosFor(fullDucked, fullControl);
        return {
          /** Scheduled kick steps in the render (the mirror of the renderer's `totalSteps` loop). */
          kickSteps: grid.length,
          /** Of those, how many show kick energy in the kick-only render — 0 here means the mirror has drifted. */
          kickOnsets: energyOnsets,
          /** Of those, how many have the bass sounding — the denominator of every number below. */
          duckOnsets: pure.onsets,
          /**
           * The **authored envelope's** ≥3 dB hold, in ms — computed, not measured.
           *
           * `weakDuck`/`duckErasedInMaster` read depth out of a 60 ms scan, which cannot describe a duck; the
           * envelope the renderer schedules is what says how long one lasts, and `sidechainDuck.test.ts` pins it per
           * category. Reported beside the depth so a row says both "the dip measures 4.4 dB" and "the duck it came
           * from lasts 64.5 ms" — which is the whole answer to "is this sidechain audible?".
           */
          envelopeHold3DbMs: (() => {
            const shape = sidechain.resolveKickDuckShape(pattern.genre_id, 1);
            let held = 0;
            for (let t = 0; t < shape.releaseSec; t += 0.0005) {
              if (20 * Math.log10(Math.max(sidechain.duckGainAt(shape, t), 1e-9)) <= -3) held += 0.5;
            }
            return Math.round(held * 10) / 10;
          })(),
          /** The sidechain's own depth (mastering bus compressor and ceiling bypassed): the mechanism. */
          duckDb: pure.meanDb,
          duckMedianDb: pure.medianDb,
          duckMinDb: pure.minDb,
          duckLouderOnsets: pure.louderOnsets ?? 0,
          /**
           * The mastering chain, attributed: the same pair rendered with one stage at a time.
           *
           * `duckCompDb` is the bus compressor alone and `duckCeilingDb` the ceiling alone, so
           * `duckDb - duckMasterDb` can be spent on whichever stage actually owns it instead of on a guess.
           */
          /** Absolute RMS of each pair, for attributing a ratio change to one side or the other. */
          duckLevels: levels,
          /** Bus compressor alone: the mean halves and the *median* is zeroed — the claim's own statistic. */
          duckCompDb: comp ? comp.meanDb : null,
          duckCompMedianDb: comp ? comp.medianDb : null,
          duckCeilingDb: ceiling ? ceiling.meanDb : null,
          duckCeilingMedianDb: ceiling ? ceiling.medianDb : null,
          /** Through the full mastering chain — what the file actually shows, and the claim's number. */
          duckMasterDb: full.meanDb,
          duckMasterMedianDb: full.medianDb,
          duckMasterMinDb: full.minDb,
        };
      };
      const duck = await measureDuck();



      /**
       * The per-stab figure for the row: the melodic lane with the most comparisons.
       *
       * `chords` and `lead` are measured separately because they mask differently — the lead is exposed and showed a
       * clean 2.5x separation from its control, the chords are buried under the harmony and showed 1.16x. Reporting
       * both and claiming on the better one would flatter; reporting the *most-populated* lane and requiring the
       * separation to hold is the honest version, and a genre whose only melodic lane is buried will say so.
       */
      const stabVariation = (() => {
        const candidates = ["chords", "lead"]
          .map((lane) => ({ lane, move: stems[lane]?.stabMove }))
          .filter((entry) => entry.move && Number.isFinite(entry.move.nativeDistanceDb));
        if (!candidates.length) return null;
        const best = candidates.sort((a, b) => b.move.comparisons - a.move.comparisons)[0];
        const distanceDb = best.move.nativeDistanceDb;
        const controlDistanceDb = best.move.nativeControlDistanceDb;
        return {
          lane: best.lane,
          comparisons: best.move.comparisons,
          distanceDb,
          controlDistanceDb,
          /** The claim's number: how many times the control the nudge's own movement is. */
          ratio:
            Number.isFinite(controlDistanceDb) && controlDistanceDb > 0
              ? Math.round((distanceDb / controlDistanceDb) * 100) / 100
              : null,
          /** The shipping lane's number, for the GS-1 gap: identical to its control until the core grows a seam. */
          shippingDeltaDb: null,
        };
      })();

      /** Where the energy sits: the 2/3-octave bands that cover roughly 200 Hz - 2 kHz. */
      const bandCentres = timbre.TIMBRE_BAND_CENTRES_HZ;
      const midBands = bands.map((db, i) => ({ hz: bandCentres[i], db })).filter((b) => b.hz >= 200 && b.hz <= 2000);

      return {
        id,
        musical: {
          stabVariation,
          velocityByTrack,
          pitchByTrack,
          // Where the off-16ths actually land is measured per stem, in the stem loop below.
          swing: { declared: pattern.swing ?? 0 },
          duck,
          midBandShareDb: 10 * Math.log10(midBands.reduce((acc, b) => acc + 10 ** (b.db / 10), 0)),
          midBands,
          panSends: Object.fromEntries(
            pattern.tracks.map((track) => [
              track.track_id,
              { pan: track.pan ?? 0, sendA: track.sendA ?? 0, sendB: track.sendB ?? 0 },
            ])
          ),
        },
        stems,
        bpm: pattern.bpm,
        bars: barsArg,
        durationSec: buffer.duration,
        sampleRate: rate,
        limiterKind,
        // A1 / A2
        maxStepDb: metrics.maxStepDb(channels),
        medianStepDb: metrics.medianStepDb(channels),
        stepOutliers: metrics.stepOutlierCount(channels),
        clicks: metrics.clickAnalysis(channels, rate, { factor: 6 }),
        centroidHz: shape.centroidHz,
        rolloffBand: shape.rolloffBand,
        topBandShareDb: 10 * Math.log10(Math.max(topShareDb, 1e-12)),
        // B1
        truePeakDb: loudness.truePeakDbChannels(channels),
        samplePeakDb: metrics.samplePeakDb(channels),
        clippedSamples: metrics.clippedSampleCount(channels),
        integratedLufs,
        /**
         * EBU R128 loudness range, in LU — the **master's** own dynamics, reported rather than claimed.
         *
         * Added after a listening review (`docs/AUDIO_REVIEW.md`) reported this master at **0.6 LU** and called the
         * result mechanical, while `thinDynamics` — which measures the *pattern's* per-track velocity spread — read 0
         * offenders. The two are not the same question, and this is the one a listener hears. It is informational for
         * now: a loop of club music is *supposed* to sit in a narrow range, so a threshold has to come from measuring
         * the library rather than from taste.
         */
        lraLu: Math.round(loudness.measureLoudnessRange(channels, rate) * 10) / 10,
        // C1
        channelCount: buffer.numberOfChannels,
        correlation: channels.length > 1 ? metrics.channelCorrelation(channels[0], channels[1]) : 1,
        sideToMidDb: metrics.sideToMidDb(channels),
        // C2
        tailRmsDb,
        /**
         * The same tail, relative to the render's own body.
         *
         * `tailRmsDb` is absolute, and the batch raised the master level by design (A2's calibrated makeup), which
         * moves every tail towards the line at once. The relative figure is the level-independent half of the same
         * question — and it is recorded, not claimed, because four runs of the same code put four *different* genres
         * across both lines (absolute −27…−50 dBFS, relative −12…−40 dB), while a quiet machine reads the same genre
         * at −89. That is a property of Chromium's DSP state between pages (P0.8's residual), not of the code.
         */
        tailRelativeDb:
          Number.isFinite(tailRmsDb) && Number.isFinite(integratedLufs)
            ? Math.round((tailRmsDb - (integratedLufs + 3)) * 10) / 10
            : null,
        /** 2 when the tail claim tripped and a second render confirmed (or cleared) it. */
        tailRenders,
        finalPeakDb: metrics.finalPeakDb(channels, rate, 5),
        decayShapeRatio: metrics.decayShapeRatio(channels, rate),
        // A3 / B3 / C1 as *content* facts: what the pattern and the mix actually ask for.
        velocityMin: velocities.length ? Math.min(...velocities) : null,
        velocityMax: velocities.length ? Math.max(...velocities) : null,
        velocityUnique: uniqueVelocities.size,
        declaredSwing: pattern.swing ?? 0,
        tracksWithSwing: pattern.tracks.filter((t) => (t.swing ?? 0) !== 0).length,
        tracksWithPan: pattern.tracks.filter((t) => (t.pan ?? 0) !== 0).length,
        /** Lanes the mix places decisively off-centre (P0.4): the data side of "the field is wide". */
        tracksWithWidePan: pattern.tracks.filter((t) => Math.abs(t.pan ?? 0) >= 0.4).length,
        tracksWithReverb: pattern.tracks.filter((t) => (t.sendA ?? 0) > 0).length,
        tracksWithDelay: pattern.tracks.filter((t) => (t.sendB ?? 0) > 0).length,
        mixSends: mix
          ? Object.values(mix).filter((lane) => (lane.sendA ?? 0) > 0 || (lane.sendB ?? 0) > 0).length
          : null,
        trackCount: pattern.tracks.length,
      };
    },
    {
      id: genreId,
      bars,
      soloTracks,
      busCompRelease: BUS_COMP_RELEASE,
      busCompThreshold: BUS_COMP_THRESHOLD,
      busCompRatio: BUS_COMP_RATIO,
      noNoteVariation: NO_NOTE_VARIATION,
    }
  );
}

/**
 * The thresholds a claim has to cross to count as confirmed.
 *
 * They are judgements, so they are written down: every one of them is a statement about what a listener hears,
 * and each has a *control* that must not trip it (a bright hi-hat is not a click; a loud mix is not distortion).
 */
/**
 * P1.1 — the spread, in MIDI steps, below which a lane reads as programmed rather than played.
 *
 * The plan's own bar ("max − min ≥ 15 on snare/hats"), in one place: the analyser's claim and the gate's budget
 * both cite it, so the two cannot drift apart.
 */
export const MIN_LANE_SPREAD = 15;

const CLAIMS = {
  /** A discontinuity: a sample 6x (≈ +15.6 dB) above its own local median slew. */
  clicks: (row) => (row.clicks?.count ?? 0) > 0,
  /** Near-Nyquist energy in the hi-hat stem, where "harsh digital fizz" would live. */
  harshHats: (row) => (row.stems?.hihat?.topBandShareDb ?? -99) > -12,
  /** The same for the melodic stems, which is what aliasing sounds like. */
  harshLead: (row) => Math.max(row.stems?.lead?.topBandShareDb ?? -99, row.stems?.chords?.topBandShareDb ?? -99) > -14,
  /** No dynamics at all: every triggered step carries the same velocity. */
  flatVelocity: (row) => (row.velocityUnique ?? 0) <= 1,
  /** A true peak above 0 dBTP is inter-sample clipping by definition. */
  overTruePeak: (row) => row.truePeakDb > 0,
  /** Pinned samples. */
  clipped: (row) => row.clippedSamples > 0,
  /** Effectively mono: nearly identical channels and no side energy worth the name. */
  mono: (row) => row.correlation > 0.98 && row.sideToMidDb < -30,
  /** No send anywhere in the pattern: whatever space there is comes only from the mix defaults. */
  dryPattern: (row) => row.tracksWithReverb === 0 && row.tracksWithDelay === 0,
  /** A tail still at -30 dBFS RMS in its last 50 ms was cut, not decayed. */
  cutTail: (row) => row.tailRmsDb > -60,
  /** Declared swing that the audio does not show: the ratio of alternating intervals stays at 1.00. */
  swingNotAudible: (row) =>
    (row.declaredSwing ?? 0) >= 20 && row.stems?.kick?.swingRatio != null && Math.abs(row.stems.kick.swingRatio - 1) < 0.05,
  /** Hard quantised by design: nothing declares swing. */
  noSwing: (row) => row.declaredSwing === 0 && row.tracksWithSwing === 0,
  /**
   * The musical claims from the listening report, made countable.
   *
   * `flatTracks` counts tracks whose triggered steps all carry **one** velocity — "it sounds like a MIDI dump".
   * The threshold is 4 of 8 because a drum machine legitimately has a fixed kick; it is the *number* of flat
   * tracks that a listener hears as lifeless.
   */
  flatTracks: (row) => {
    const rows = Object.values(row.musical?.velocityByTrack ?? {}).filter(Boolean);
    return rows.length > 0 && rows.filter((v) => v.distinct <= 1).length >= 4;
  },
  /** A declared swing the audio does not show: ≥20 declared, and no offset measurable on the off-16ths. */
  inaudibleSwing: (row) => {
    const declared = row.musical?.swing?.declared ?? 0;
    if (declared < 20) return false;
    const offsets = Object.values(row.stems ?? {})
      .map((stem) => stem.swingOffsetMs)
      .filter((value) => value !== null && value !== undefined);
    if (!offsets.length) return true;
    return Math.max(...offsets.map(Math.abs)) < 3;
  },
  /**
   * The kick and the bass arrive together and the sidechain is too shallow to hear.
   *
   * Measured on the *mechanism* (`duckMedianDb`, the deepest 5 ms window per onset, median across onsets, with
   * the mastering chain's dynamics bypassed) and never on the raw mean: a single loud onset or a long release
   * would move a mean around. `duckOnsets` (not `kickOnsets`) is the denominator — a genre whose bass is silent
   * under every kick has no sidechain to hear and is reported as unmeasurable, not counted as passing or failing.
   */
  weakDuck: (row) => {
    const duck = row.musical?.duck;
    return Boolean(duck) && duck.duckOnsets > 0 && (duck.duckMedianDb ?? 0) > -3;
  },
  /**
   * The sidechain is real and the mastering chain gives it back.
   *
   * A separate claim because the two failures need different work: `weakDuck` is the mix (P0.3), this is the
   * master chain's gain recovery (P2.3). It shows up on loud genres — disco measures a −4.4 dB dip with the
   * dynamics bypassed and −0.4 dB through the ceiling — and it also flattens the per-note dynamics P0.2 added.
   */
  duckErasedInMaster: (row) => {
    const duck = row.musical?.duck;
    if (!duck || duck.duckOnsets <= 0) return false;
    return (duck.duckMedianDb ?? 0) <= -3 && (duck.duckMasterMedianDb ?? 0) > -1.5;
  },
  /**
   * P1.1 — the *dynamics* of the lanes a listener hears as played, not just "more than one value".
   *
   * `flatTracks` asks whether a lane has any variation at all (`distinct <= 1`); this asks whether the variation is
   * wide enough to hear. Measured at the pattern level on 2026-09-23, the snare lane reached a spread of 15 MIDI
   * steps in **1 of 11** sampled genres and the hats in **8 of 11** — while `flatTracks` was already 0/12. A gate
   * with no claim for this simply cannot see the problem the plan's P1.1 names, which is why P0.2 "fixed" the report
   * and the grooves still sounded flat.
   *
   * Only the two lanes an idiom actually ornaments are counted: a fixed kick and a fixed bass are decisions (that is
   * the same allowance `flatTracks` makes), a fixed snare is a MIDI dump. A genre with neither lane sounding is not
   * measurable and is not counted as passing.
   */
  thinDynamics: (row) => {
    const lanes = ["snare", "hihat"]
      .map((id) => row.musical?.velocityByTrack?.[id])
      .filter((lane) => lane && lane.onsets > 0);
    if (!lanes.length) return false;
    return lanes.some((lane) => lane.max - lane.min < MIN_LANE_SPREAD);
  },
  /**
   * The mid-range is thin: the 200 Hz - 2 kHz bands hold less than the average band's share.
   *
   * The −6 dB floor is the plan's own number, and P1.2 measured twice that neither content (0.00 dB) nor a 5 dB cut of
   * the low end (+0.2…+1.0 dB) reaches it — see `check_groove.mjs` for the full note. Kept as the *definition* of the
   * claim so the budget has something stable to ratchet against.
   */
  thinMids: (row) => (row.musical?.midBandShareDb ?? 0) < -6,
  /** The harmony never moves inside the loop: one chord for the whole pattern. */
  staticHarmony: (row) => {
    const chords = row.musical?.pitchByTrack?.chords;
    return Boolean(chords) && chords.distinct <= 1;
  },
  /** Still effectively mono: correlation this high means the pan in the mix is not reaching the file. */
  narrowStereo: (row) => row.correlation > 0.98,
  /**
   * The other failure: so much side energy that a mono fold loses an element.
   *
   * P0.4 widens the field, so the guard has to exist: −8 dB of side-to-mid is where a phone speaker (or a club's
   * mono rig) starts to lose level on a hard-panned lane. The sample sits at −15…−29 dB, comfortably inside.
   */
  sideTooHot: (row) => row.sideToMidDb > -8,
};

/** A short label for a stem, so the table stays readable. */
const fmt = (value, digits = 1) => (value == null || !Number.isFinite(value) ? "-" : value.toFixed(digits));

(async () => {
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const server = await startDevServer();
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const allIds = await page.evaluate(async () => {
    const { ALL_GENRES } = await import("/src/data/genres/index.ts");
    return ALL_GENRES.map((g) => g.id);
  });
  const ids = ONLY.length ? allIds.filter((id) => ONLY.includes(id)) : allIds;
  if (!ids.length) throw new Error("no genres matched");
  /**
   * Say which requested ids do not exist.
   *
   * Three of the twelve in the first sample silently vanished here (`house`, `dnb`, `shoegaze` are not genre ids
   * in this library), so a "12-genre sample" was nine genres and every count was compared against a budget
   * calibrated on a different set. Silent filtering is how a measurement becomes a guess.
   */
  const unmatched = ONLY.filter((id) => !allIds.includes(id));
  if (unmatched.length) {
    console.error(`⚠️  ${unmatched.length} requested genre id(s) do not exist and were skipped: ${unmatched.join(", ")}`);
  }

  /**
   * Recycle the page every few genres, because a long-lived page **degrades** and the tail is where it shows.
   *
   * Measured 2026-09-23: `ambient` renders a tail of **−89 dBFS** in a fresh page and **−27 dBFS** after a run of
   * renders in the same one — a 62 dB difference in the number the `cutTail` claim is made of, with the integrated
   * loudness unchanged to 0.3 dB. `measure_genre_loudness.mjs` has recycled for exactly this reason since P0.8 (its
   * note: past ~50–75 offline renders in one page, renders start to shift); this analyser rendered every genre of a
   * shard in one page and did not. A claim measured in a degrading page is a claim about the page, so the page is
   * now replaced before that happens — and the count is lower here than the loudness script's because a genre costs
   * about eight renders (master, four stems, four duck cells).
   */
  /**
   * One page per genre, and a discarded warm-up render inside each.
   *
   * The tail is where page state shows first (P0.8's own finding), and three runs of the *same* code failed
   * `cutTail` for three *different* genres — `ambient` at −27 dBFS, `liquid-dnb` at −49.8, `disco` at −46.3 — while a
   * fresh page renders ambient at −89. So the number a genre gets depends on how many renders its page has already
   * done, which is not a property of the genre or of the code. Recycling per genre bounds that history identically
   * for every genre, and the discarded render means the measured one is never the first on a fresh page (the
   * cold/warm fork the loudness sentinel hit, fixed the same way there).
   */
  const RELOAD_EVERY = 1;
  const reloadPage = async () => {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  };

  const rows = [];
  for (const [index, id] of ids.entries()) {
    if (index > 0 && index % RELOAD_EVERY === 0) await reloadPage();
    try {
      rows.push(await measureGenre(page, id, BARS, STEM_TRACKS));
    } catch (error) {
      rows.push({ id, error: String(error).slice(0, 200) });
    }
  }

  await browser.close();
  server.kill("SIGTERM");

  const good = rows.filter((row) => !row.error);
  if (!JSON_OUT) {
    console.log("\n🎧 EXPORT AUDIO AUDIT");
    console.log(`   ${good.length}/${rows.length} genres rendered · bars=${BARS} · export defaults\n`);
    console.log(
      "   genre".padEnd(26) +
        "clicks".padEnd(9) +
        "topBand".padEnd(9) +
        "truePk".padEnd(9) +
        "corr".padEnd(7) +
        "tailRms".padEnd(9) +
        "LRA".padEnd(7) +
        "vel".padEnd(9) +
        "swing"
    );
    for (const row of good.slice(0, ONLY.length ? good.length : 12)) {
      console.log(
        `   ${row.id.padEnd(24)}${fmt(row.clicks?.worstDb).padEnd(9)}${row.topBandShareDb.toFixed(1).padEnd(9)}` +
          `${row.truePeakDb.toFixed(2).padEnd(9)}${row.correlation.toFixed(3).padEnd(7)}${row.tailRmsDb.toFixed(1).padEnd(9)}` +
          `${fmt(row.lraLu).padEnd(7)}` +
          `${`${row.velocityMin ?? "-"}-${row.velocityMax ?? "-"}(${row.velocityUnique})`.padEnd(9)}${row.declaredSwing}`
      );
    }
    if (!ONLY.length && good.length > 12) console.log(`   … ${good.length - 12} more genres in the JSON`);

    console.log("\n   claim".padEnd(26) + "confirmed".padEnd(12) + "worst");
    for (const [name, test] of Object.entries(CLAIMS)) {
      const hits = good.filter(test);
      let detail = "";
      if (name === "clicks" && hits.length) {
        const row = hits.reduce((a, b) => ((a.clicks?.worstDb ?? 0) > (b.clicks?.worstDb ?? 0) ? a : b));
        detail = `${row.id} worst +${fmt(row.clicks.worstDb)} dB above local floor, ${row.clicks.count} samples`;
      } else if (name === "harshHats" && hits.length) {
        const row = hits.reduce((a, b) => ((a.stems?.hihat?.topBandShareDb ?? -99) > (b.stems?.hihat?.topBandShareDb ?? -99) ? a : b));
        detail = `${row.id} hat top-3 bands ${fmt(row.stems.hihat.topBandShareDb)} dB, centroid ${fmt(row.stems.hihat.centroidHz, 0)} Hz`;
      } else if (name === "harshLead" && hits.length) {
        const row = hits.reduce((a, b) => Math.max(a.stems?.lead?.topBandShareDb ?? -99, a.stems?.chords?.topBandShareDb ?? -99) > Math.max(b.stems?.lead?.topBandShareDb ?? -99, b.stems?.chords?.topBandShareDb ?? -99) ? a : b);
        detail = `${row.id} melodic top-3 bands ${fmt(Math.max(row.stems?.lead?.topBandShareDb ?? -99, row.stems?.chords?.topBandShareDb ?? -99))} dB`;
      } else if (name === "overTruePeak" && hits.length) {
        const row = hits.reduce((a, b) => (a.truePeakDb > b.truePeakDb ? a : b));
        detail = `${row.id} ${fmt(row.truePeakDb, 2)} dBTP`;
      } else if (name === "clipped" && hits.length) {
        const row = hits.reduce((a, b) => (a.clippedSamples > b.clippedSamples ? a : b));
        detail = `${row.id} ${row.clippedSamples} samples pinned`;
      } else if (name === "mono" && hits.length) {
        detail = `${hits.length} genres: correlation \u2265 0.98 with side below -30 dB (e.g. ${hits[0].id})`;
      } else if (name === "cutTail" && hits.length) {
        const row = hits.reduce((a, b) => (a.tailRmsDb > b.tailRmsDb ? a : b));
        detail = `${row.id} ${fmt(row.tailRmsDb)} dBFS in the last 50 ms (final peak ${fmt(row.finalPeakDb)})`;
      } else if (name === "flatVelocity" && hits.length) {
        detail = `${hits.length} genres carry a single velocity, e.g. ${hits[0].id}`;
      } else if (name === "dryPattern" && hits.length) {
        detail = `${hits.length}/${good.length} patterns use no reverb or delay send at all`;
      } else if (name === "swingNotAudible" && hits.length) {
        const row = hits[0];
        detail = `e.g. ${row.id}: declares swing ${row.declaredSwing}, kick intervals ratio ${fmt(row.stems?.kick?.swingRatio, 3)}`;
      }
      console.log(`   ${name.padEnd(24)}${String(hits.length).padEnd(12)}${detail}`);
    }

    // Stem detail for the genres the report named, so the instrument claims have their own line.
    if (ONLY.length) {
      console.log("\n   stem detail (bars=" + BARS + ")");
      for (const row of good) {
        for (const [track, stem] of Object.entries(row.stems ?? {})) {
          console.log(
            `   ${row.id}/${track}`.padEnd(32) +
              `peak ${fmt(stem.truePeakDb, 2)} dBTP`.padEnd(20) +
              `top3 ${fmt(stem.topBandShareDb)} dB`.padEnd(16) +
              `centroid ${fmt(stem.centroidHz, 0)} Hz`.padEnd(20) +
              `clicks ${stem.clicks.count}`.padEnd(12) +
              `onsets ${stem.onsetCount}`.padEnd(12) +
              `swing ${fmt(stem.swingRatio, 3)}`
          );
        }
      }
    }
  }

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify({ bars: BARS, rows }, null, 2));
  if (JSON_OUT) console.log(JSON.stringify({ rows }, null, 2));
  else console.log(`\n   full rows → ${OUT_JSON}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
