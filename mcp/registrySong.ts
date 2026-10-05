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
];
