/**
 * ⭐ **The song, section and vocal tools, gathered out of the registry grab bag.**
 *
 * ⚠️ Moved, not rewritten; helpers come from `./toolKit`.
 */
import path from "node:path";
import { ToolDefinition, failure } from "./toolKit";
import { setVocalMelody } from "./vocal";
import { flattenMcpArrangement, getMcpArrangement, getMcpTrack, setMcpTrackGs1, setMcpTrackNotes } from "./arrangement";
import { FACTORY_VOCAL_PATCHES, vocalPatchById } from "../src/data/vocalPatches";
import { STEPS_PER_BAR } from "../src/data/noteEvents";
import { z } from "zod";


export const VOCAL_TOOLS: ToolDefinition[] = [
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
     * ⭐ **The vocal lane gets a voice, which is the piece that was actually missing.**
     *
     * This tool used to be an honest stub: it reported singing synthesis as reserved, because this repository had **no
     * vocal patch at all**. The synth project then shipped five formant vocal-choir presets (`gradetwo/synth` `d75630c`),
     * and `data/vocalPatches.ts` carries them; what was missing after that was the wiring, not the voice.
     *
     * ⚠️ **What it does and does not do, because the difference is the whole point.** It binds the lane to one of those
     * factory patches — writing `TrackV2.gs1Patch`, the field the GS-1 host loads a lane's sound from — so the notes
     * already on that lane sound through a vowel-shaped voice. It does **not** turn a lyric into singing: a share code
     * carries a voice, not words, so "sing these syllables" is not something this can honour and it does not pretend to.
     * The lyric is bound to the notes with `set_arrangement_vocal_melody`, which is where a syllable's tone is checked
     * against the pitch it is sung on.
     */
    name: "synthesize_vocal",
    title: "Give a vocal lane one of the factory vowel voices",
    description:
      "Voice a lane with one of the synth's five factory vocal-choir patches: vocalah, vocaloh, vocalee, vocaloo, vocalhum. Writes the lane's own GS-1 sound (`gs1Patch`) to that patch's share code, so the notes already on the lane sound through it. Pick by `patch` id or by `vowel` (a/o/e/oo/hum). This does not synthesise singing: a share code carries a voice, not words, so bind the lyric to the notes with set_arrangement_vocal_melody instead.",
    readOnly: false,
    inputSchema: {
      arrangementId: z.string(),
      track: z.string().max(40).describe("the lane to voice, by track id or name"),
      patch: z.string().max(24).optional().describe("a factory vocal patch id; omit to use the one named by `vowel`"),
      vowel: z.string().max(8).optional().describe("ah, oh, ee, oo or hum — picks the patch by the vowel it is shaped for"),
    },
    handler: (args) => {
      const arrangementId = String(args.arrangementId);
      const arrangement = getMcpArrangement(arrangementId);
      if (!arrangement) return failure(`no arrangement "${arrangementId}" — create one first`);

      /**
       * ⭐ **The voice is resolved before anything is written.** `setMcpTrackGs1` goes through `edit`, which records the
       * state being left behind, so a refusal after the write would leave an undo step for a change that never happened.
       */
      const wanted = args.patch === undefined ? undefined : String(args.patch);
      const vowel = args.vowel === undefined ? undefined : String(args.vowel).toLowerCase();
      const patch = wanted !== undefined ? vocalPatchById(wanted) : undefined;
      if (wanted !== undefined && patch === undefined) {
        return failure(
          `no factory vocal patch "${wanted}" — the five are ${FACTORY_VOCAL_PATCHES.map((row) => row.id).join(", ")}`
        );
      }
      const byVowel = vowel === undefined ? undefined : FACTORY_VOCAL_PATCHES.find((row) => row.vowel === vowel || row.id.endsWith(vowel));
      if (patch === undefined && vowel !== undefined && byVowel === undefined) {
        return failure(
          `no factory vocal patch for vowel "${vowel}" — the five are ${FACTORY_VOCAL_PATCHES.map((row) => `${row.id} (${row.vowel})`).join(", ")}`
        );
      }
      const chosen = patch ?? byVowel ?? vocalPatchById("vocalah")!;

      // The lane, by id first and then by name — the same two ways an agent has of naming it.
      const key = String(args.track);
      const target = arrangement.tracks.find((row) => row.id === key) ?? arrangement.tracks.find((row) => row.name === key);
      if (!target) {
        return failure(
          `no track "${key}" in "${arrangementId}" — the tracks are ${arrangement.tracks.map((row) => `${row.id} (${row.name})`).join(", ")}`
        );
      }
      if (getMcpTrack(arrangementId, target.id) === undefined) return failure(`track "${key}" disappeared before it could be voiced`);

      const result = setMcpTrackGs1(arrangementId, target.id, chosen.shareCode, null);
      return {
        arrangementId,
        trackId: target.id,
        track: target.name,
        voice: { patch: chosen.id, label: chosen.label, vowel: chosen.vowel, shareCode: chosen.shareCode },
        /**
         * Stated in the reply rather than left to the description: the caller is told which half it got, so "the lane
         * sings this lyric" cannot be mistaken for something this returned.
         */
        bound: "the lane's own sound, so its notes sound through this voice",
        notDone: "singing synthesis — a share code carries a voice, not words; bind the lyric with set_arrangement_vocal_melody",
        summary: result.summary,
      };
    },
  },
];
