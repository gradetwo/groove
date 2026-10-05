/**
 * ⭐ **The render, audition and stem tools, gathered out of the registry grab bag.**
 *
 * ⚠️ Moved, not rewritten; helpers come from `./toolKit`.
 */
import path from "node:path";
import { patternFromGenre } from "../src/data/genreMix";
import { legatoGapNote, legatoGapsFor } from "../src/data/legatoGaps";
import { flattenSong } from "../src/data/songFlatten";
import { chordChangeReattackNote, chordChangeReattacks } from "../src/data/stringTechniques";
import { SequencerPattern } from "../src/types/genre";
import { flattenMcpArrangement, getMcpArrangement, summariseArrangement } from "./arrangement";
import { findGenre } from "./library";
import { audioLaneReplyFields } from "./pattern";
import { HEADLESS_POINTER_SENTENCE, PREVIEW_DEFAULT_CLAUSE, headlessParameterDescription, renderBudgetSentence, renderCostSentence } from "./render/budget";
import { auditionInstrumentNote, renderAudio, renderStems } from "./render/worker";
import { flattenMcpSong } from "./song";
import { ToolDefinition, failure, patternFromArgs, patternSchema, unknownGenre } from "./toolKit";
import { z } from "zod";

export const RENDER_TOOLS: ToolDefinition[] = [
  {
    /**
     * Recommendation 1 of the dev-branch report, and the answer to the pain it describes: a 48-bar song takes **6–24 s** at full rate, while an
     * 8 kHz mono analysis render takes **1.8 s** — so an agent debugging a two-bar transition should not be re-rendering the whole piece into a
     * client that may time out at 30 s.
     *
     * It is not a new renderer: it slices the requested section out of the song exactly the way `export_ableton` already slices its clips
     * (`flattenSong({ ...song, sections: [section] })`), and renders it through the same path with a low rate and one channel by default. What
     * it adds is a **name** for that path, a **default that is fast**, and a truthful label: the reply says `preview: true` and carries its own
     * wall-clock time, because a preview that is mistaken for a deliverable is worse than no preview.
     */
    name: "render_preview_clip",
    title: "Render one short section quickly, for listening while composing",
    description:
      "Render a section (or one pattern) at a low sample rate for fast iteration. Report how long it took. Defaults are 8 kHz mono, which measures about 1.8 s against 6-24 s for a full-rate song render. A composing loop that needs to hear a two-bar change does not have to re-render the whole piece. " +
      renderCostSentence() +
      " " +
      PREVIEW_DEFAULT_CLAUSE +
      " " +
      renderBudgetSentence() +
      HEADLESS_POINTER_SENTENCE +
      " **The measured speed above is the browser path's** — the Node host's cold start for a preview has not been measured here, so `headless` on this tool buys a preview with no browser rather than a faster one." +
      " The reply is labelled `preview: true` — use render_song or render_audio for anything you intend to deliver.",
    readOnly: false,
    inputSchema: {
      songId: z.string().optional().describe("the song to take a section from"),
      sectionId: z.string().optional().describe("which section, by id"),
      index: z.number().int().min(0).optional().describe("or by position; default 0"),
      genreId: z.string().optional().describe("instead of a song: preview a bare genre's pattern"),
      bars: z.number().int().min(1).max(16).optional().describe("how many bars of the section to render; default 4"),
      sampleRate: z.number().int().min(8000).max(96000).optional().describe("default 8000, which is the point of this tool"),
      channels: z.number().int().min(1).max(2).optional().describe("default 1"),
      format: z.enum(["wav", "mp3"]).optional().describe("default wav"),
      headless: z.boolean().optional().describe(headlessParameterDescription()),
    },
    handler: async (args, ctx) => {
      try {
        const bars = (args.bars as number | undefined) ?? 4;
        const sampleRate = (args.sampleRate as number | undefined) ?? 8000;
        const channels = (args.channels as 1 | 2 | undefined) ?? 1;
        const format = (args.format as "wav" | "mp3" | undefined) ?? "wav";

        let pattern: SequencerPattern;
        let label: string;
        if (args.songId) {
          const { song } = flattenMcpSong(String(args.songId));
          const at = args.sectionId
            ? song.sections.findIndex((section) => section.id === args.sectionId)
            : Math.max(0, Math.min(song.sections.length - 1, Math.floor((args.index as number | undefined) ?? 0)));
          if (at < 0) return failure(`no section "${args.sectionId}" in song "${args.songId}"`);
          const section = song.sections[at]!;
          // The same slice `export_ableton` uses for its per-section clips: one section, flattened on its own.
          pattern = flattenSong({ ...song, sections: [{ ...section, bars }] }).pattern;
          label = `${song.genreId} ${section.label ?? section.slot}${at + 1}`;
        } else if (args.genreId) {
          const genre = findGenre(String(args.genreId));
          if (!genre) return failure(`unknown genreId "${args.genreId}"`);
          pattern = patternFromGenre(genre);
          label = String(args.genreId);
        } else {
          return failure("provide either songId (with index or sectionId) or genreId");
        }

        const startedAt = Date.now();
        // `bars: 1` is the flattened pattern *is* the section, the same convention `render_song` documents.
        const result = await renderAudio(pattern, {
          format,
          bars: 1,
          sampleRate,
          channels,
          nameSlug: `${label.replace(/[^a-z0-9]+/gi, "-")}-preview`,
          // Absent when the caller did not ask for it, so "default engine" is a missing key rather than `false`.
          ...(args.headless === true ? { headless: true } : {}),
          ...(ctx?.progress ? { progress: ctx?.progress } : {}),
        });
        const seconds = Number(((Date.now() - startedAt) / 1000).toFixed(2));
        return {
          preview: true,
          label,
          seconds,
          sampleRate: result.sampleRate,
          channels: result.channels,
          durationSec: result.durationSec,
          integratedLufs: result.integratedLufs,
          truePeakDb: result.truePeakDb,
          path: result.path,
          // Which host produced this file, read rather than inferred — the preview reply is a curated shape rather than a
          // spread of the render result, so the field has to be named here or it would be dropped and the silence
          // this line of work keeps meeting would be back.
          engine: result.engine,
          note:
            `a ${seconds}s preview at ${result.sampleRate} Hz and ${result.channels} channel(s) — for iterating, not for delivery; ` +
            "use render_song or render_audio when the file matters",
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "render_instrument_note",
    title: "Sound one instrument note and say which sample answered",
    description:
      "Render **one note** of one instrument through the app's own sampler. Report what the library did with it. Which sample file answered, at what playback ratio, its root key, its choke group, whether the file calls it a one-shot. Its note-polyphony cap. Use it to answer the question a whole-mix render cannot. *Does this library resolve. Does it do what its file says?* A note that renders silent is reported as a result with its resolved sample path. Silence has two readings, because a silent note with a sample path is a gain problem. A silent note without one is a library that did not resolve. " +
      HEADLESS_POINTER_SENTENCE +
      " The note is resolved and rendered through the **same `loadNote` and the same loader** on either host — `createSampleLoader` over `browserSampleDecoder`, which is the loader `renderPatternOffline` already builds on the Node host — so what `headless` changes is the engine and not the resolution, and the reply's `engine` says which one answered.",
    readOnly: false,
    inputSchema: {
      assetId: z.string().describe("an instrument from `list_arrangement_instruments`"),
      midi: z.number().int().min(0).max(127),
      seconds: z.number().min(0.1).max(10).optional().describe("how much to render; default 2"),
      gainDb: z.number().min(-60).max(12).optional().describe("a trim for listening; the file's own controller gain is applied regardless"),
      sampleRate: z.number().int().min(8000).max(96000).optional().describe("default 44100"),
      headless: z.boolean().optional().describe(headlessParameterDescription()),
    },
    handler: async (args) => {
      try {
        return await auditionInstrumentNote(String(args.assetId), Number(args.midi), {
          format: "wav",
          seconds: args.seconds as number | undefined,
          gainDb: args.gainDb as number | undefined,
          ...(args.sampleRate ? { sampleRate: args.sampleRate as number } : {}),
          ...(args.headless === true ? { headless: true } : {}),
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "render_arrangement_stems",
    title: "Render the arrangement as one file per track",
    description:
      "Bounce every track of an arrangement to **its own WAV**, next to each other in one directory, through the same offline engine as `render_arrangement`. Use it when the question is about a part rather than the mix: an agent that can hear the bass alone can fix a balance problem instead of guessing at one. Each reply entry carries the measured duration, sample rate, channel count and true peak of that stem. A stem that rendered to silence says so rather than being reported as a file nobody can hear. **It costs one render per track**. A four-track arrangement is four of the measurements quoted here. One of the few render calls that can report progress per track rather than only a heartbeat. " +
      renderCostSentence() +
      " " +
      renderBudgetSentence() +
      HEADLESS_POINTER_SENTENCE +
      " `headless: true` renders each stem on the Node Web Audio host, one track per render, through the **same `stemTrackIdx` argument the browser path passes** — so it is the same per-track render on a different engine, not a second definition of a stem. The reply's `engine` names the host, and each stem's own true peak and duration are measured from that host's buffer. **One thing it does not inherit on that path: the render budget** — that exists to reset a stuck page and there is no page. **Its progress is still per track, in frames instead of budget milliseconds**: the Node host suspends inside `startRendering()`, so a `progressToken` gets each stem's rendered frames out of that stem's own frame count, at the heartbeat cadence, with `track i/N` in the message — a budget denominator would be a number this path cannot honour. The measured 1.03 dB / 1.04 dB / 1.612 LU host gap above is a **whole-mix** fixture — the parity probe has measured no stem, so that band-and-loudness comparison is unknown for a stem rather than zero. (A spot check on one drumkit stem found its true peak 0.08 dB apart between the hosts; one true-peak reading is not that comparison.)",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      sampleRate: z.number().int().min(8000).max(96000).optional().describe("default 44100; a lower rate renders faster and is honest about it"),
      startBar: z.number().int().min(0).optional().describe("first bar of the span, with endBar; 0 is the first bar"),
      endBar: z.number().int().min(0).optional().describe("exclusive end of the span, with startBar; the bar it names is not rendered"),
      channels: z.union([z.literal(1), z.literal(2)]).optional().describe("default 2, the exporter's own stereo"),
      headless: z.boolean().optional().describe(headlessParameterDescription()),
    },
    handler: async (args, ctx) => {
      try {
        /**
         * ⭐ **The span the other two arrangement tools take, so a part can be judged on a passage rather than the whole
         * piece.** It travels through the same notes-map seam (`flattenMcpArrangement`'s range), so this is not a second
         * definition of what a span means; with no span the call is byte for byte what it was.
         */
        const range =
          args.startBar !== undefined && args.endBar !== undefined
            ? { startBar: args.startBar as number, endBar: args.endBar as number }
            : undefined;
        const { flattened, bars } = flattenMcpArrangement(String(args.arrangementId), range);
        const result = await renderStems(flattened.pattern, {
          format: "wav",
          ...(args.sampleRate ? { sampleRate: args.sampleRate as number } : {}),
          ...(args.channels ? { channels: args.channels as 1 | 2 } : {}),
          bars: 1,
          genreId: "custom",
          ...(args.headless === true ? { headless: true } : {}),
          ...(ctx?.progress ? { progress: ctx?.progress } : {}),
        });
        const audioLanes = result.audioLanes;
        /**
         * ⭐ **The arrangement's own problems travel with the stems too.** `render_arrangement` has carried them as
         * `arrangementProblems` since the starter-content report; the stems reply did not, so "this track sounds through
         * the built-in synth preset, and here is the sampler call that would sound a real instrument" was visible in the
         * mix reply and invisible in the per-track one — exactly the asymmetry the arrangement problems exist to remove.
         */
        const summary = summariseArrangement(String(args.arrangementId), getMcpArrangement(String(args.arrangementId))!);
        /**
         * ⭐ **The seams in a sustained part are reported with the stems, which is where a part is judged on its own.**
         *
         * A string bed whose notes end exactly where the next chord begins sounds detached, and the three numbers that
         * decide it — `startBeats`, `lengthBeats` and the next `startBeats` — were already in the arrangement. This says
         * so once, in the reply that exists for listening to one part at a time, and **changes nothing**: the notes are
         * the composer's, and a diagnostic that edited them would be deciding the music.
         */
        const arrangement = getMcpArrangement(String(args.arrangementId))!;
        const legatoGaps = legatoGapsFor(arrangement);
        const legatoNote = legatoGapNote(legatoGaps);
        /**
         * ⭐ **And the other half of a sustained part's join: where it overlaps and still re-attacks.**
         *
         * `legatoGaps` reports the chords that fail to reach the next one. The owner's own project reports **nothing**
         * there — its chords are held 8.5 beats and are 8 beats apart, so every one is still sounding when the next
         * begins — and the owner still heard the strings break, at an instant that measures to a chord change. The
         * distinction the ear was making is that **overlap is not legato**: a note that starts its own attack re-strikes
         * however much it overlaps. This travels beside `legatoGaps` for the same reason it does: it is a diagnostic
         * about the composer's notes, and it changes nothing.
         */
        const reattacks = chordChangeReattacks(arrangement, arrangement.bpm ?? 120);
        const reattackNote = chordChangeReattackNote(reattacks);
        return {
          ...result,
          arrangementId: String(args.arrangementId),
          bars,
          ...(summary.problems.length ? { arrangementProblems: summary.problems } : {}),
          ...(legatoGaps.length ? { legatoGaps } : {}),
          ...(legatoNote ? { legatoNote } : {}),
          ...(reattacks.length ? { chordChangeReattacks: reattacks } : {}),
          ...(reattackNote ? { chordChangeReattackNote: reattackNote } : {}),
          ...audioLaneReplyFields(audioLanes),
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
];
