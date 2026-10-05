/**
 * ⭐ **The song, section and vocal tools, gathered out of the registry grab bag.**
 *
 * ⚠️ Moved, not rewritten; helpers come from `./toolKit`.
 */
import path from "node:path";
import { MAX_BARS } from "../src/data/arrangementEdits";
import { SequencerPattern } from "../src/types/genre";
import { ClipSlot } from "../src/types/song";
import { findGenre } from "./library";
import { audioLaneReplyFields } from "./pattern";
import { HEADLESS_POINTER_SENTENCE, headlessParameterDescription, renderBudgetSentence, renderCostSentence } from "./render/budget";
import { renderAudio } from "./render/worker";
import { addMcpSection, createMcpSong, duplicateMcpSection, flattenMcpSong, getMcpSong, mcpSongHistory, setMcpClip, summariseSong, undoMcpSong } from "./song";
import { ToolDefinition, clipSlotSchema, failure, patternSchema, unknownGenre } from "./toolKit";
import { setVocalMelody } from "./vocal";
import { flattenMcpArrangement, setMcpTrackNotes } from "./arrangement";
import { STEPS_PER_BAR } from "../src/data/noteEvents";
import { z } from "zod";

import { patternFromGenre } from "../src/data/genreMix";
import { setMcpLaneSlots, setMcpTempo } from "./song";

export const SONG_TOOLS: ToolDefinition[] = [
  {
    /**
     * The tool half of `setVocalMelody`, and the answer to the dev-branch report's third item from the composing side: a lyric used to be an
     * annotation beside the notes, so nothing could check a syllable's tone against the pitch it was sung on.
     *
     * It is a **song** tool rather than a pattern tool for the same reason `set_clip` is: a pattern an agent built is easy to lose, and a song's
     * clip is where a composer's work actually lives. It says which slot it edited, and points at `make_unique` when that slot is shared — the
     * honesty about song-global slots belongs in the reply, not in a doc the caller may not read.
     */
    name: "set_arrangement_vocal_melody",
    title: "Bind a lyric to a melody and check its tones (倒字)",
    description:
      "Put syllables on a song's vocal lane, one per note and at the same index as its pitch, and return the prosody check on the result. Give `pitches` to set the melody yourself, or give only the lyric and a melody is written for it. Tones are input (1 阴平, 2 阳平, 3 上声, 4 去声, 0/5 neutral) and never guessed. A rising tone sung on a falling interval is reported as a warning, because that is what makes a listener hear the wrong word.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string().describe("the arrangement whose track sings these syllables"),
      trackId: z.string().describe("the track the syllables are written to; **its notes are replaced**"),
      syllables: z.array(z.string().max(8)).min(1).max(64).describe("one syllable per note, in order"),
      tones: z.array(z.number().int().min(0).max(5)).min(1).max(64).describe("one tone per syllable"),
      pitches: z.array(z.number().int().min(0).max(127)).optional().describe("the notes to sing them on; omitted, a melody is written"),
      seed: z.number().int().min(0).max(1_000_000).optional(),
      tonic: z.number().int().min(0).max(108).optional().describe("key for a written melody; default 60"),
      mode: z.enum(["major", "minor"]).optional(),
    },
    handler: (args) => {
      try {
        const arrangementId = String(args.arrangementId);
        const trackId = String(args.trackId);
        const { flattened } = flattenMcpArrangement(arrangementId);
        /**
         * ⭐ **The lyric engine is the step engine, reached through the arrangement's own flatten.**
         *
         * The borrow is an implementation detail: the inputs, the reply and every word a caller reads are v2. The engine
         * answers with one record per syllable, each carrying its pitch and its step.
         */
        const result = setVocalMelody({
          pattern: flattened.pattern,
          syllables: args.syllables as string[],
          tones: args.tones as number[],
          pitches: args.pitches as number[] | undefined,
          seed: args.seed as number | undefined,
          tonic: args.tonic as number | undefined,
          mode: args.mode as "major" | "minor" | undefined,
        });
        /**
         * ⭐ **The conversion, with both decisions stated.** A step is a sixteenth of a bar, so a syllable on step `s`
         * starts at `s / 16 * 4` beats. One syllable lasts one step, and the records carry no velocity, so every note
         * takes the same stated default; other lengths come from the note tools afterwards.
         */
        const notes = result.notes.map((sung) => ({
          pitch: sung.pitch,
          startBeats: (sung.step / STEPS_PER_BAR) * 4,
          lengthBeats: 4 / STEPS_PER_BAR,
          velocity: 0.8,
        }));
        return {
          arrangementId,
          trackId,
          notes,
          syllables: result.notes,
          prosody: result.prosody,
          edit: setMcpTrackNotes(arrangementId, trackId, notes),
          ...(result.warnings.length ? { warnings: result.warnings } : {}),
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * Owner decision 4: the singing-synthesis interface is **reserved and empty**, and it says so.
     *
     * A hole an agent will guess at is worse than a refusal: with no tool at all it builds a vocal out of what it has and produces something that sounds like a
     * mistake. This is reachable, validates the arguments a real implementation would need, and answers honestly — so the absence is a fact about the server
     * instead of a surprise, and a `check:mcp` case holds the answer in place.
     */
    name: "synthesize_vocal",
    title: "Sing a lyric (reserved — not implemented)",
    description:
      "Reserved for singing synthesis (SVS) and **not implemented**: this call always reports that the capability is reserved. Changes nothing. It exists so an agent discovers the absence instead of guessing. It validates the arguments a future implementation would take (a lyric, one tone per syllable, and the lane to sing on) so the failure explains what is missing rather than what is malformed.",
    readOnly: true,
    inputSchema: {
      syllables: z.array(z.string().max(8)).min(1).max(64).describe("one syllable per note, as set_arrangement_vocal_melody takes them"),
      tones: z.array(z.number().int().min(0).max(5)).min(1).max(64).describe("one tone per syllable"),
      track: z.string().max(40).optional().describe("the lane to sing on; default lead"),
    },
    handler: (args) => {
      if ((args.syllables as string[]).length !== (args.tones as number[]).length) {
        return failure("one tone per syllable, as set_arrangement_vocal_melody requires — and note that this tool is reserved and does not sing anything yet");
      }
      return failure(
        "reserved, not implemented: singing synthesis is an interface here and no implementation. For a sung line today use set_arrangement_vocal_melody (which binds syllables to notes and checks the tones) with the synth voices the genre already has; the SVS direction is the upstream synth project (docs/SYNTH_UPSTREAM_PLAN.md)."
      );
    },
  },
  {
    name: "create_song",
    title: "Create a song",
    description:
      "Start an arrangement: one clip (A) seeded from a genre's arranged pattern, or from an explicit pattern, plus a first section. Returns a songId that add_section and render_song take. Songs live in this server process only.",
    readOnly: false,
    inputSchema: {
      genreId: z.string().optional().describe("genre id whose arranged pattern seeds clip A"),
      pattern: patternSchema.optional().describe("an explicit pattern for clip A instead of a genre's"),
      name: z.string().optional(),
      bpm: z.number().min(20).max(300).optional(),
      swing: z.number().min(0).max(100).optional(),
      resolution: z.enum(["1/8", "1/16", "1/32"]).optional(),
      bars: z
        .number()
        .int()
        .min(1)
        // Kept numerically equal to `MAX_SECTION_BARS` (src/types/song.ts); `sectionCeilings.test.ts` asserts they still agree, because a hardcoded copy is
        // exactly how a model's bound and a tool's bound drift apart.
        .max(256)
        .describe(
          "how many bars this section lasts — **at most 256 per section** (`MAX_SECTION_BARS`); a longer piece uses more sections rather than a longer one, which is also what keeps a render chunkable"
        )
        .optional()
        .describe(
          "A genre's clip is a one-bar loop of 16 sixteenth steps, seeded per genre; a song's `totalSteps` is its bars multiplied by 16"
        ),
      label: z
        .string()
        .max(24)
        .optional()
        .describe('what the first section is, e.g. "intro" — `add_section` has always taken this and `create_song` did not'),
      clips: z
        // `.optional()` on the **value** type, so a caller may send the slots it has: `z.record(keys, schema)` makes every key
        // required, which is what a composer hit when it sent `{B, C}` and got "expected object, received undefined at clips.A".
        .record(clipSlotSchema, patternSchema.optional())
        .optional()
        .describe(
          "clips beyond the seeded A, keyed by slot — the verse/chorus path. Without it a song can only ever have one clip and the contrast has to be squeezed out of section overrides. `set_clip` replaces one later."
        ),
    },
    handler: (args) => {
      try {
        const genreId = args.genreId as string | undefined;
        const genre = genreId ? findGenre(genreId) : undefined;
        if (!genre && !args.pattern) {
        const wanted = (args as { genreId?: string }).genreId;
        return failure(wanted ? unknownGenre(wanted) : "provide either genreId or pattern");
      }
        return createMcpSong({
          genreId: genreId ?? "custom",
          genre: genre ?? null,
          pattern: args.pattern as SequencerPattern | undefined,
          name: args.name as string | undefined,
          bpm: args.bpm as number | undefined,
          swing: args.swing as number | undefined,
          resolution: args.resolution as "1/8" | "1/16" | "1/32" | undefined,
          bars: args.bars as number | undefined,
          label: args.label as string | undefined,
          clips: args.clips as Partial<Record<ClipSlot, SequencerPattern>> | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "add_section",
    title: "Add a section",
    description:
      "Place a clip on the song's timeline: slot, how many times it repeats. Optional per-section mutes, velocity scale, label, velocity ramp (a build across the section), a drum fill on its last pass. A transposition of its pitched lanes. Returns the whole arrangement, so a model can see what it built.",
    readOnly: false,
    inputSchema: {
      songId: z.string().describe("the id create_song returned"),
      slot: clipSlotSchema,
      bars: z
        .number()
        .int()
        .min(1)
        .max(MAX_BARS)
        .optional()
        .describe(
          "how many PASSES of the section's clip — not measures. The result reports `passBars` and a running `secondsEstimate`."
        ),
      label: z.string().max(24).optional().describe('e.g. "intro", "drop", "fill"'),
      mute: z.array(z.string()).max(16).optional().describe("track ids silenced in this section"),
      velocityScale: z.number().min(0).max(2).optional().describe("1 = as written, 0.8 = a quieter build"),
      velocityRamp: z
        .tuple([z.number().min(0).max(4), z.number().min(0).max(4)])
        .optional()
        .describe("velocity multiplier at the section's first and last pass, e.g. [0.6, 1] for an 8-bar build"),
      fill: z.boolean().optional().describe("add a drum fill on the section's last pass; the lanes come from the clip"),
      transpose: z
        .number()
        .int()
        .min(-24)
        .max(24)
        .optional()
        .describe("move the section's pitched lanes by this many semitones; drums are untouched"),
      index: z.number().int().min(0).optional().describe("insert position; appended when omitted"),
    },
    handler: (args) => {
      try {
        return addMcpSection({
          songId: String(args.songId),
          slot: args.slot as "A" | "B" | "C" | "D",
          bars: args.bars as number | undefined,
          label: args.label as string | undefined,
          mute: args.mute as string[] | undefined,
          velocityScale: args.velocityScale as number | undefined,
          velocityRamp: args.velocityRamp as [number, number] | undefined,
          fill: args.fill as boolean | undefined,
          transpose: args.transpose as number | undefined,
          index: args.index as number | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    name: "render_song",
    title: "Render the arrangement",
    description:
      "Bounce a song created with create_song: every section, in order, with its repeats, mutes and velocity scale, through the app's own offline engine (WAV or MP3, written under GROOVE_MCP_OUT). Needs headless Chromium unless `headless: true`, which renders on the Node Web Audio host with no browser at all. A song reaches the renderer as **one** flattened pattern and the time goes into the page's `OfflineAudioContext.startRendering()`, which has no callback. So there is no per-bar figure to report. This tool is honest about that rather than pretending. " +
      renderBudgetSentence() +
      " While it runs, a caller that sent a progressToken gets a heartbeat every 15 s saying the page is still inside `startRendering()`; that is a sign of life and not a completion estimate — and on the `headless` path the progress is better than a heartbeat, because the Node host can suspend inside that same call: the same progressToken receives **frames rendered out of the render's own frame count**, at the same 15 s cadence. The estimate in the reply — the song's `secondsEstimate`, read **before** rendering — is what `maxDurationSec` compares against, and refusing with it is cheaper than hanging: a 2816-step arrangement ran fifteen minutes with no result. The preview's own measured figure (14.4 s of audio in 1.45 s) is for 8 kHz mono, and a full-rate stereo bounce is heavier; this server has **not** measured a whole-song full-rate bounce, so no duration is promised for one. **If you need real per-bar visibility rather than a heartbeat, render movements separately with `render_arrangement`**: each file is mastered on its own, which buys N/M visibility, a file per movement and bounded memory — and is **not** the same master as a single bounce of the whole song. That is measured, not assumed: per-section rendering was compared against a whole-song render and the difference runs through the whole chunk (max 1.7, mean 0.14 on a ±1 scale), because reverb tails, the bus compressor and the parallel drum path span the entire piece and a chunk rendered alone never has them. " +
      renderCostSentence() +
      HEADLESS_POINTER_SENTENCE,
    readOnly: false,
    inputSchema: {
      songId: z.string().describe("the id create_song returned"),
      format: z.enum(["wav", "mp3"]).default("wav"),
      bitrateKbps: z.number().int().min(32).max(320).optional().describe("MP3 only; default 192"),
      sampleRate: z
        .number()
        .int()
        .min(8000)
        .max(96000)
        .optional()
        .describe(
          "render rate; 8000 makes an analysis pass about a fifth of the work, and the exporter builds its context at this rate so the audio really is fewer samples rather than a relabelled file"
        ),
      channels: z
        .number()
        .int()
        .min(1)
        .max(2)
        .optional()
        .describe(
          "1 for a mono analysis render; panning and stereo effects collapse, so this is for measuring rather than for delivery. The default is the stereo this exporter has always produced."
        ),
      maxDurationSec: z
        .number()
        .min(1)
        .max(1800)
        .optional()
        .describe(
          "refuse to render a song longer than this. A guard against the unbounded hang a composer hit (2816 steps ran 15 minutes with no result): the estimated duration is checked *before* the browser starts."
        ),
      headless: z.boolean().optional().describe(headlessParameterDescription()),
    },
    handler: async (args, ctx) => {
      try {
        const { song, flattened } = flattenMcpSong(String(args.songId));
        /**
         * The guard, and it runs **before** the browser starts.
         *
         * A composer's 2816-step arrangement rendered for fifteen minutes with no result and no way to tell "working" from
         * "stuck"; the estimate the summary already carries is what makes refusing cheap, and the message says what to do
         * instead of leaving the caller to guess.
         */
        const budget = args.maxDurationSec as number | undefined;
        if (budget !== undefined) {
          const estimate = summariseSong(song).secondsEstimate;
          if (estimate > budget) {
            return failure(
              `this song is about ${estimate}s and maxDurationSec is ${budget}s — shorten the arrangement, raise the limit, or render one section with render_arrangement; a lower sampleRate or fewer channels makes the render itself cheaper, but neither changes this estimate`
            );
          }
        }
        const result = await renderAudio(flattened.pattern, {
          format: (args.format as "wav" | "mp3") ?? "wav",
          ...(args.sampleRate ? { sampleRate: args.sampleRate as number } : {}),
          ...(args.channels ? { channels: args.channels as 1 | 2 } : {}),
          // The flattened pattern *is* the song, so one pass plays all of it (B2).
          bars: 1,
          bitrateKbps: args.bitrateKbps as number | undefined,
          genreId: song.genreId,
          // The caller's own title, whitelisted in the worker — never model prose, and never the whole name in place of the genre
          // and tempo. A song with no name (its genre id) lands on the previous `_master_` form by construction.
          nameSlug: song.name,
          // Absent when the caller did not ask for it, so "default engine" is a missing key rather than `false`.
          ...(args.headless === true ? { headless: true } : {}),
          ...(ctx?.progress ? { progress: ctx?.progress } : {}),
        });
        return {
          ...(result as unknown as Record<string, unknown>),
          songId: song.id,
          totalSteps: flattened.pattern.totalSteps,
          ...audioLaneReplyFields(result.audioLanes),
        };
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
];
