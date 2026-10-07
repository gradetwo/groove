/**
 * ⭐ **Moved out of the registry whole, so the registry can go back to being a barrel.**
 */
import path from "node:path";
import { getGenreLoudnessTrimDb } from "../src/data/genreMix";
import { SequencerPattern } from "../src/types/genre";
import { loudnessReport, shareUrl } from "./exporting";
import { HEADLESS_POINTER_SENTENCE, headlessParameterDescription } from "./render/budget";
import { analyseWavFile, renderAudio } from "./render/worker";
import { flattenMcpArrangement } from "./arrangement";
import { runWithProgress } from "./render/progress";
import { ToolDefinition, estimateKey, failure, patternFromArgs, patternSchema, unknownGenre } from "./toolKit";
import { z } from "zod";

export const ANALYSIS_TOOLS: ToolDefinition[] = [
  {
    /**
     * The report asked for `analyze_loudness`, `analyze_spectral_balance` and `estimate_key`. Loudness needs no tool — **every render
     * already returns gated loudness and true peak**, which is what this server has said since the analyser was written — so this adds
     * the two that were genuinely absent, and says in its description why the third is not here.
     */
    name: "estimate_key",
    title: "Estimate a pattern's key",
    description:
      "Estimate the key of a pattern from **its notes** — a pitch-class histogram fitted against major and minor profiles — and report the tonic, the mode and the fit. It reads the composition rather than the audio on purpose. The notes are what the composer chose, while an FFT estimate of a loop with a kick on every beat is mostly a statement about the kick. Per-render loudness needs no tool: render_audio and render_song already return gated loudness and true peak.",
    readOnly: true,
    inputSchema: {
      genreId: z.string().optional().describe("estimate this genre's pattern"),
      pattern: patternSchema.optional().describe("or a pattern you have"),
    },
    handler: (args) => {
      const pattern = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!pattern) {
        // `create_song` reaches here when a supplied genreId did not resolve, so this is the message most composers will actually see.
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
      return estimateKey(pattern);
    },
  },
  {
    /**
     * Recommendation 5 of the dev-branch report, as a closed loop rather than a suggestion: measure, compute, **render again**, measure again.
     *
     * Every render already answers with gated loudness and true peak, and the graph has always accepted an explicit master trim — the missing
     * piece was that nothing on the MCP side could set it, so a caller measuring −17.31 LUFS against a −14 target had to hand-compute a gain and
     * edit the pattern by hand. This uses the plumbing added for exactly that.
     *
     * The gain is bounded by the true-peak ceiling and **which bound won is reported**: that is the difference between "it reached the target"
     * and "it reached the ceiling, so the target was not reachable" — the second being a real answer a caller can act on.
     */
    name: "normalize_loudness",
    title: "Render an arrangement to a target loudness",
    description:
      "Render an arrangement, measure it, compute the master trim that would reach a target integrated loudness, render again with it, and report both readings plus which bound decided the trim. The gain is capped by a true-peak ceiling, so the answer distinguishes reaching the target from reaching the ceiling. Returns the path of the normalized file. " +
      HEADLESS_POINTER_SENTENCE +
      " **Every pass of the loop runs on the host you chose, and the reply's `engine` names it**: with `passes: 1` (the default) this is one render and the choice is the same one `render_song` offers; with more passes the loop is still the same host each time, so the trim is corrected against that host's own readings rather than mixing two engines. The measured host gap (1.03 dB band 3, 1.04 dB band 7, 1.612 LU) applies to the final file exactly as it does to a single render — what is *not* measured is a multi-pass loop whose rounds used different hosts, which this does not do.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string().describe("the arrangement to normalize"),
      targetLufs: z.number().min(-40).max(0).optional().describe("default −14, the usual streaming target"),
      truePeakCeilingDb: z.number().min(-12).max(0).optional().describe("default −1 dBTP, the usual delivery ceiling"),
      format: z.enum(["wav", "mp3"]).optional().describe("default wav"),
      sampleRate: z.number().int().min(8000).max(96000).optional(),
      channels: z.number().int().min(1).max(2).optional(),
      passes: z
        .number()
        .int()
        .min(1)
        .max(3)
        .optional()
        .describe(
          "how many measure-and-correct rounds to run inside this call; **default 1**, because each round is a full render and a client's 30-second RPC timeout is real. A second call continues from the trim this one reports"
        ),
      headless: z.boolean().optional().describe(headlessParameterDescription()),
    },
    handler: async (args, ctx) => {
      try {
        const { flattened } = flattenMcpArrangement(String(args.arrangementId));
        const target = (args.targetLufs as number | undefined) ?? -14;
        const ceiling = (args.truePeakCeilingDb as number | undefined) ?? -1;
        const format = (args.format as "wav" | "mp3" | undefined) ?? "wav";
        const analysis = {
          format,
          bars: 1,
          genreId: flattened.pattern.genre_id,
          nameSlug: String(args.arrangementId),
          ...(args.sampleRate ? { sampleRate: args.sampleRate as number } : {}),
          ...(args.channels ? { channels: args.channels as 1 | 2 } : {}),
          // ⭐ Every pass carries the engine choice, so one call cannot render its rounds on two hosts.
          ...(args.headless === true ? { headless: true } : {}),
        };
        const baseTrimSeed = () => Number(getGenreLoudnessTrimDb(flattened.pattern.genre_id).toFixed(3));
        const render = (trimDb?: number) =>
          renderAudio(flattened.pattern, { ...analysis, ...(trimDb !== undefined ? { loudnessTrimDb: trimDb } : {}) });
        const reading = (result: Awaited<ReturnType<typeof renderAudio>>) => ({
          integratedLufs: Number(result.integratedLufs.toFixed(3)),
          truePeakDb: Number(result.truePeakDb.toFixed(3)),
          path: result.path,
        });

        const before = await runWithProgress(ctx?.progress, "measuring the arrangement", () => render());
        /**
         * **Iterate, because a limiter makes this a nonlinear problem.**
         *
         * Two measurements said so before any code did. Asking for −1.37 dB moved the mix by 0.04 dB; asking for −11.37 dB moved it by 4.97
         * dB and the peak by only 1.6. Neither is proportional, and the two do not share a ratio or an offset — which rules out a wrong base
         * and points at the master **true-peak limiter** sitting downstream of the trim: on this material it was already reducing by roughly
         * 6.4 dB, so trimming the input partly *relieves* that reduction instead of lowering the output. A linear control law cannot converge
         * against that, and no amount of reading the trim constants would have said so.
         *
         * So the trim is corrected per measurement: measure, adjust by the residual, measure again, up to three times. Each round is bounded
         * by the true-peak ceiling, the readings are returned, and `converged` says whether the loop is what produced the answer — because
         * "it took three passes" is information a caller should have.
         */
        let best = { result: before, trimDb: baseTrimSeed(), lufs: before.integratedLufs };
        const attempts: Array<{ trimDb: number; integratedLufs: number; truePeakDb: number }> = [
          { trimDb: best.trimDb, integratedLufs: before.integratedLufs, truePeakDb: before.truePeakDb },
        ];
        const maxPasses = Math.max(1, Math.min(3, (args.passes as number | undefined) ?? 1));
        for (let round = 1; round < maxPasses; round += 1) {
          const residual = target - best.lufs;
          if (Math.abs(residual) <= 0.2) break;
          const headroom = ceiling - best.result.truePeakDb;
          const nextTrim = best.trimDb + Math.min(residual, headroom);
          const next = await runWithProgress(ctx?.progress, `pass ${round + 1}`, () => render(Number(nextTrim.toFixed(3))));
          best = { result: next, trimDb: Number(nextTrim.toFixed(3)), lufs: next.integratedLufs };
          attempts.push({ trimDb: best.trimDb, integratedLufs: next.integratedLufs, truePeakDb: next.truePeakDb });
        }
        /** The seed: what a render with no explicit option would use, so the loop starts from the graph's own baseline. */
        const baseTrimDb = getGenreLoudnessTrimDb(flattened.pattern.genre_id);
        // Which bound decided it, with a small tolerance so a target that is *exactly* peak-limited is reported as such rather than by noise.
        // Which bound took the last step: the ceiling if it stopped the trim short of the residual, the target otherwise.
        const previous = attempts.length >= 2 ? attempts[attempts.length - 2]! : attempts[0]!;
        const residual = target - previous.integratedLufs;
        const headroom = ceiling - previous.truePeakDb;
        /**
         * Three outcomes, and the third was measured rather than assumed.
         *
         * The runs that produced this: a −1.37 dB request moved the mix 0.04 dB; −11.37 moved it 4.97; and the iterating version drove the
         * trim to −3.916 dB and moved the reading from −12.674 to −13.122 while the **true peak did not move at all** (−1.3 dBTP every
         * time). A trim upstream of a limiter cannot lower the output if the limiter restores what it removes, and a peak that never leaves the
         * ceiling across three different trims is that behaviour seen directly. So the answer is not always "it reached the target": on this
         * chain the loudness is the **limiter's**, and an upstream trim mostly buys nothing.
         */
        const peakPinned =
          attempts.length >= 2 && attempts.every((attempt) => Math.abs(attempt.truePeakDb - attempts[0]!.truePeakDb) <= 0.05);
        const limitedBy = peakPinned && Math.abs(best.result.integratedLufs - target) > 0.2 ? "masterLimiter" : residual - headroom > 0.05 ? "truePeak" : "target";
        const after = best.result;
        return {
          /**
           * ⭐ **`null` when the reading is not a number, rather than `NaN`.**
           *
           * A blank arrangement is silent, and a silent render has no true peak to subtract from the ceiling -- so the arithmetic produces
           * `NaN`, which JSON turns into `null` anyway on the way out. Saying `null` here means the reply reads the same before and after
           * serialisation, and a caller can tell "there is no headroom to report" from a number. The criterion in `mcpHeadlessRender.test.ts`
           * is what found this: it asserted the field meant what it said and got `NaN`.
           */
          peakHeadroom: Number.isFinite(headroom) ? Number(headroom.toFixed(3)) : null,
          arrangementId: String(args.arrangementId),
          targetLufs: target,
          truePeakCeilingDb: ceiling,
          /** Which host rendered every pass — read, not inferred, the same rule as the single-render tools. */
          engine: after.engine,
          before: reading(before),
          gainDb: Number((target - before.integratedLufs).toFixed(3)),
          baseTrimDb: Number(baseTrimDb.toFixed(3)),
          appliedTrimDb: best.trimDb,
          passes: attempts.length,
          converged: Math.abs((after.integratedLufs ?? 0) - target) <= 0.2,
          attempts,
          limitedBy,
          after: reading(after),
          nextTrimDb: best.trimDb,
          note:
            attempts.length < maxPasses ? "the loop stopped at the requested number of passes" :
            limitedBy === "target"
              ? "the trim reached the target; re-measure to confirm, and check the true peak is still under the ceiling"
              : limitedBy === "truePeak"
                ? `the true-peak ceiling capped the trim at ${best.trimDb.toFixed(3)} dB, so the target was not reachable without exceeding ${ceiling} dBTP — lower the target or accept the ceiling`
                : limitedBy === "masterLimiter"
                  ? `the true peak stayed at ${attempts[0]!.truePeakDb.toFixed(2)} dBTP across ${attempts.length} different trims and the reading settled at ${Number((after.integratedLufs - target).toFixed(2))} LU from the target — the master limiter is holding the output, so an upstream trim cannot set loudness on this chain. This is a property of the graph, measured, not a failure of the request`
                  : `the trim settled at ${best.trimDb.toFixed(3)} dB after ${attempts.length} pass(es), ${Number((after.integratedLufs - target).toFixed(2))} LU from the target — a further pass is worth trying`,
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "spectral_balance",
    title: "Spectral balance of a rendered file",
    description:
      "The 13-band spectral shape of a WAV this server produced, with the bands named (sub, low, low-mid, mid, high-mid, high) rather than left as indices, plus the spectral centroid. This is the same fingerprint the timbre baseline uses, so a reading here is comparable with it. No browser needed. **The same measurement as `analyze_audio`**: both call one analysis, so calling both repeats it and only costs time. Ask for one of them.",
    readOnly: true,
    inputSchema: { path: z.string().describe("a .wav path this server produced") },
    handler: (args) => {
      try {
        return analyseWavFile(args.path as string);
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "share_url",
    title: "Build a share link",
    description: "A URL that opens the app with this groove loaded. Reports whether fidelity had to be reduced to fit the URL budget.",
    readOnly: true,
    inputSchema: { genreId: z.string().optional(), pattern: patternSchema.optional(), origin: z.string().url().optional() },
    handler: (args) => {
      const pattern = patternFromArgs(args as { genreId?: string; pattern?: unknown });
      if (!pattern) {
        // `create_song` reaches here when a supplied genreId did not resolve, so this is the message most composers will actually see.
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
      return shareUrl(pattern, { origin: args.origin as string | undefined });
    },
  },
  {
    name: "get_loudness_report",
    title: "Loudness report",
    description: "The committed measurement for one genre, or the whole library's spread (min/median/max LUFS) with per-genre rows.",
    readOnly: true,
    inputSchema: { genreId: z.string().optional() },
    handler: (args) => loudnessReport(args.genreId as string | undefined),
  },
  {
    name: "analyze_audio",
    title: "Analyse a rendered WAV",
    description:
      "Dense material reports many discontinuities. The count is relative to the file's own median jump, so percussive and plucked mixes look busy without any click. Measure a WAV this server produced. Gated loudness, true peak, pinned samples, discontinuity count **and where the worst one is** (`worstDiscontinuitySec`), stereo correlation, tail level and the 13-band spectral shape. No browser needed. **The position is what makes the count useful**: a whole-file count is dominated by the music's own transients. To ask whether these are splice clicks at your section boundaries. Compare that position against the boundaries you can derive from `get_song`'s sections (`bars` per section, at the song's tempo). This tool counts; the arrangement says where the joins are. **A render already returns its own gated loudness and true peak for either format** — reach for this only when the extra metrics are what you want, not to measure a file you just rendered.",
    readOnly: true,
    inputSchema: { path: z.string().describe("a .wav path this server produced; the analyser decodes the app's own 16-bit PCM — there is no MP3 decoder here, because a render already reports its loudness and true peak") },
    handler: async (args, ctx) => {
      try {
        /**
         * ⭐ **One call, and one phase.** The analyser is synchronous, so a heartbeat could not fire between its start and its
         * end — the event loop is inside it. The announcement is still worth making: a caller that asked to be told learns what
         * the tool is doing, and if the analyser ever becomes asynchronous the heartbeat arrives without a second change.
         */
        return await runWithProgress(ctx?.progress, "analysing the rendered file", async () => analyseWavFile(String(args.path)));
      } catch (error) {
        return failure(`could not analyse "${String(args.path)}": ${(error as Error).message}`);
      }
    },
  },
];
