/**
 * ⭐ **Moved out of the registry whole, so the registry can go back to being a barrel.**
 */
import { examplesFor, listExamples } from "./examples";
import { loudnessReport } from "./exporting";
import { findGenre, getGenre, suggestProgression } from "./library";
import { generateMelody } from "./melody";
import { comparePatterns } from "./pattern";
import { validateProsody } from "./prosody";
import { ToolDefinition, failure } from "./toolKit";
import { z } from "zod";

export const EXAMPLE_TOOLS: ToolDefinition[] = [
  {
    name: "compare_genres",
    title: "Compare two genres",
    description: "Tempo, key, meter, swing and per-track onset differences between two genres' default patterns.",
    readOnly: true,
    inputSchema: { a: z.string(), b: z.string() },
    handler: (args) => {
      const left = findGenre(String(args.a));
      const right = findGenre(String(args.b));
      if (!left || !right) return failure(`unknown genre: ${!left ? String(args.a) : String(args.b)}`);
      return {
        a: { id: left.id, name: left.name, summary: getGenre(left.id) },
        b: { id: right.id, name: right.name, summary: getGenre(right.id) },
        pattern: comparePatterns(left.sequencer_pattern, right.sequencer_pattern),
        loudness: { a: loudnessReport(left.id), b: loudnessReport(right.id) },
      };
    },
  },
  {
    /**
     * The one item in the whole evaluation that asks for something with no answer anywhere in the tree, and the reason it takes tones as
     * **input**: an LLM's pinyin is the least reliable link in the chain, so this check reads tone against melodic movement and never
     * guesses the tone. It warns rather than errors, and it does not rewrite the caller's tones when sandhi changes the expectation.
     */
    name: "validate_prosody",
    title: "Check lyrics against a melody (倒字)",
    description:
      "Compare a lyric's tones with the melody's movement and report reversals — a rising tone sung on a falling interval, or the reverse, which is what makes a listener hear the wrong word. Takes one tone per syllable (1 阴平, 2 阳平, 3 上声, 4 去声, 0/5 neutral) and one MIDI pitch per syllable; it does not guess pinyin, because that is the least reliable link in the chain. **Advisory only**: it warns and never throws, and 3+3 sandhi changes what it expects rather than rewriting the tones you sent.",
    readOnly: true,
    inputSchema: {
      tones: z.array(z.number().int().min(0).max(5)).min(1).describe("one tone per syllable"),
      pitches: z.array(z.number().int().min(0).max(127)).min(1).describe("one MIDI note per syllable"),
      syllables: z.array(z.string().max(8)).optional().describe("optional syllable text, used to point at the warning in your own words"),
      threshold: z.number().int().min(1).max(12).optional().describe("semitones that count as an intentional direction; default 2"),
    },
    handler: (args) => {
      try {
        return validateProsody({
          tones: args.tones as number[],
          pitches: args.pitches as number[],
          syllables: args.syllables as string[] | undefined,
          threshold: args.threshold as number | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * The melody half of workstream 4, and the piece the evaluation's diagnosis pointed at: lyrics arrive with no melodic shape to attach
     * to, so the shape is chosen first (a contour per phrase), the key's scale supplies the notes, and the range is bounded by
     * construction. Seeded, so a second attempt is a different melody rather than a different sound.
     */
    name: "generate_melody",
    title: "Generate a melody",
    description:
      "Write a melody contour-first: a named contour per phrase (arch, valley, rising, falling), the contour mapped onto the key's own scale so every note is in key by construction. Notes are placed on an eighth-note grid with seeded rests. Returns lane-shaped arrays (steps, pitch, velocity, gate) ready for a track, plus the contours, phrase ranges, the range used and interval statistics. AABA repeats its first phrase literally. Deterministic for a seed.",
    readOnly: true,
    inputSchema: {
      tonic: z.number().int().min(0).max(108).describe("MIDI note of the key's tonic"),
      mode: z.enum(["major", "minor"]).optional().describe("default major"),
      bars: z.number().int().min(2).max(32).optional().describe("bars of 4/4; default 8, which gives an AABA of two-bar phrases"),
      form: z.enum(["AABA", "ABAB"]).optional().describe("default AABA"),
      range: z.tuple([z.number().int(), z.number().int()]).optional().describe("inclusive MIDI range; at most two octaves, clamped"),
      seed: z.number().int().min(0).max(1_000_000).optional().describe("default 1; the same seed gives the same melody. The seed runs from 0 to 1000000."),
      density: z.number().min(0.1).max(1).optional().describe("how many eighth-note slots carry a note; default 0.55"),
      tones: z
        .array(z.number().int().min(0).max(5))
        .max(64)
        .optional()
        .describe(
          "**one tone per sounding note**, in playing order (1 阴平 / 2 阳平 / 3 上声 / 4 去声 / 0 or 5 neutral): the melody is then written against the words, and the reply reports how many notes it had to move (`prosody.adjusted`) and whether any reversal survived (`prosody.remaining`). Omit it and the melody is exactly what it was before this parameter existed. Use `validate_prosody` to check tones against a melody you already have"
        ),
    },
    handler: (args) => {
      try {
        return generateMelody({
          tonic: args.tonic as number,
          mode: args.mode as "major" | "minor" | undefined,
          bars: args.bars as number | undefined,
          form: args.form as "AABA" | "ABAB" | undefined,
          range: args.range as [number, number] | undefined,
          seed: args.seed as number | undefined,
          density: args.density as number | undefined,
          /**
           * ⭐ **`tones` reaches the generator, which it did not.**
           *
           * The schema declares it — "**one tone per sounding note**, in playing order" — and `generateMelody` accepts it and runs the 倒字 repair with it. The handler simply never passed it on, so a caller who supplied tone marks got a melody composed **as if the words had no tones at all**, and then `validate_prosody` reported the mismatches the input had been given to prevent. Muse found it by using the two tools together, which is the only way this shows up: each one looks right on its own.
           */
          tones: args.tones as number[] | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * The genuinely new half of the harmony work: the library says **which** progression and `romanToChords` says what it sounds like,
     * so this joins them and reports both — the numerals so a caller can see the choice, the pitches so it can be applied.
     */
    name: "suggest_progression",
    title: "Suggest a chord progression in a key",
    description:
      "Pick a progression from the committed library for an emotion or category and render it in the caller's key: returns the roman numerals, the concrete chords, and the songs that used it. Write the `chords` onto a track with add_arrangement_notes, holding each chord for as many beats as you want it. It is a chooser plus a renderer rather than a generator, so every result traces to a committed entry.",
    readOnly: true,
    inputSchema: {
      tonic: z.number().int().min(0).max(127).optional().describe("MIDI note of the key's tonic; default 60 (C)"),
      mode: z.enum(["major", "minor"]).optional().describe("default major"),
      emotion: z.string().max(60).optional().describe('what the music should feel like, e.g. "nostalgic", "uplifting"'),
      category: z.string().max(40).optional().describe("the library's category, matched exactly"),
      avoid: z.string().max(200).optional().describe("progression ids not to pick, comma separated"),
    },
    handler: (args) => {
      try {
        return suggestProgression({
          key: { tonic: args.tonic as number | undefined, mode: args.mode as "major" | "minor" | undefined },
          emotion: args.emotion as string | undefined,
          category: args.category as string | undefined,
          avoid: args.avoid as string | undefined,
        });
      } catch (error) {
        return failure((error as Error).message);
      }
    },
  },
  {
    /**
     * The index over the examples. `get_example` can only serve a genre a caller already knows; this is how a caller learns which
     * examples exist and what each one is for. It walks the same `examplesFor` the tool and the resource walk rather than keeping a
     * list of ids, because a second list is a second thing to keep true.
     */
    name: "list_examples",
    title: "List worked examples",
    description:
      "Every worked example the server can serve, as compact rows — id, genre, what it demonstrates and the recipe that produced it — so a caller can choose one and fetch it with get_example. Examples are built from the genre library, so every genre in list_genres has a pair; narrow with genreId or page with limit/offset. The pattern itself stays in get_example.",
    readOnly: true,
    inputSchema: {
      genreId: z.string().optional().describe("only this genre's examples; omit for every genre in the library"),
      limit: z.number().int().min(1).max(500).optional().describe("default 50"),
      offset: z.number().int().min(0).optional(),
    },
    handler: (args) => listExamples(args as { genreId?: string; limit?: number; offset?: number }),
  },
  {
    /**
     * Few-shot material, callable: an agent that is about to compose asks what a good result looks like here, and gets a pattern plus the
     * chain of calls that made it.
     */
    name: "get_example",
    title: "Get worked examples for a genre",
    description:
      "Worked examples for a genre: the pattern the app itself arranges, and a variation built with the composition tools — each with the recipe (the tool calls, in order) that produced it. Built from the genre library rather than pasted, so an example cannot drift from what the tools do. Imitate the recipe, not the JSON.",
    readOnly: true,
    inputSchema: {
      genreId: z.string().describe("the genre to get examples for; list_examples names every example that exists"),
      index: z.number().int().min(0).optional().describe("which example; all of them when omitted"),
    },
    handler: (args) => {
      const examples = examplesFor(String(args.genreId));
      if (!examples.length) {
        return failure(
          `no worked examples for "${args.genreId}" — that is not a genre in the library; list_examples names every example that exists and list_genres the genres`
        );
      }
      const index = args.index as number | undefined;
      if (index === undefined) return { total: examples.length, examples };
      const one = examples[index];
      return one ? one : failure(`index ${index} is outside the ${examples.length} example(s) for ${args.genreId}`);
    },
  },
];
