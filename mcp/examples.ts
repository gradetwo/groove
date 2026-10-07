/**
 * Worked examples, one genre at a time — the thing a few-shot prompt needs and the thing an agent can imitate.
 *
 * They are **built from the genre library rather than written down**, and that is the design decision that matters: an example that is
 * pasted JSON drifts the moment a genre's pattern changes, and the drift is invisible. Built, an example is a small recipe over the same
 * tools an agent calls, so it cannot disagree with what the tools do — and one of them exercises the harmony and melody tools end to end,
 * which is also how this file proves they compose.
 */
import { allGenreIds, findGenre } from "./library";
import { applyPatternOps } from "./pattern";
import { suggestProgression } from "./library";
import { generateMelody } from "./melody";

export interface MCPExample {
  id: string;
  genreId: string;
  title: { en: string; zh: string };
  /** What the example is trying to show, in one sentence the prompt can quote. */
  teaches: string;
  /** The tool chain that produced it, in order — the part an agent imitates. */
  recipe: string[];
  /** The pattern to imitate, as the tools return it. */
  pattern: unknown;
  /** Anything worth knowing about the result, including what it deliberately leaves alone. */
  notes: string[];
}

/** Genres with examples so far. Deliberately short: one worked pair is worth more than forty auto-generated ones. */
export const EXAMPLE_GENRES = ["chicago-house", "deep-house", "hard-techno"] as const;

const clean = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function hasExamples(genreId: string): boolean {
  return (EXAMPLE_GENRES as readonly string[]).includes(clean(genreId));
}

/**
 * The examples for one genre.
 *
 * The first is the genre's own arranged pattern, unchanged: an agent that imitates nothing else should start from the material the app
 * itself plays. The second is a variation built with the tools this project added for composition — a chosen progression placed on the
 * chords lane and a generated melody on the lead — so the pair shows both the baseline and the kind of change worth making to it.
 */
export function examplesFor(genreId: string): MCPExample[] {
  const genre = findGenre(clean(genreId));
  if (!genre) return [];
  const base = applyPatternOps(patternFromGenreSafe(genre), []).pattern;

  const suggested = suggestProgression({ emotion: "nostalgic", key: { tonic: 60, mode: "minor" } });
  const chords = Array.isArray(suggested.chords) ? (suggested.chords as number[][]) : [];
  const withProgression = chords.length
    ? applyPatternOps(base, [{ op: "set_chord_progression", chords }]).pattern
    : base;
  const melody = generateMelody({ tonic: 60, mode: "minor", bars: 4, seed: 3, form: "AABA" });
  const lead = withProgression.tracks.find((track) => track.track_id === "lead");
  const illustrated = lead ? applyPatternOps(withProgression, [
    { op: "clear_track", track: lead.track_id },
    ...melody.steps.map((on, index) =>
      on > 0
        ? [{ op: "set_step" as const, track: lead.track_id, step: index, on: true }]
        : []
    ).flat(),
  ]).pattern : withProgression;

  return [
    {
      id: `${clean(genreId)}-as-arranged`,
      genreId: clean(genreId),
      title: { en: `${genre.name ?? genreId} — as the app arranges it`, zh: `${genreId} — 应用自身编排的样子` },
      teaches: "the baseline: the material the app itself starts this genre from, with no edits",
      recipe: ["create_arrangement({ genreId })", "get_arrangement({ arrangementId })"],
      pattern: base,
      notes: [
        "This is the material to imitate first; every other example is a change to it.",
        "`create_arrangement` seeds an arrangement from exactly this material; the `pattern` field is the v1 shape the renderer still plays underneath it.",
      ],
    },
    {
      id: `${clean(genreId)}-with-progression-and-melody`,
      genreId: clean(genreId),
      title: { en: `${genre.name ?? genreId} — a chosen progression and a written melody`, zh: `${genreId} — 选定进行 + 生成的旋律` },
      teaches: "composition: choose a progression for a feeling, place it, then write a melody over it",
      recipe: [
        'create_arrangement({ genreId })',
        'suggest_progression({ emotion: "nostalgic", tonic: 60, mode: "minor" })',
        'add_arrangement_notes({ trackId: "chords", notes }) — one note per chord tone, held for the chord',
        'generate_melody({ tonic: 60, mode: "minor", bars: 4, form: "AABA", seed: 3 })',
        'add_arrangement_notes({ trackId: "lead", notes }) — the melody\'s steps, as beats',
      ],
      pattern: illustrated,
      notes: [
        chords.length ? `the progression is ${suggested.roman} → ${JSON.stringify(chords)}` : "no progression was available to place",
        `the melody is ${melody.statistics.notes} notes, ${melody.contour.join("")}, inside ${JSON.stringify(melody.range)}`,
        "the melody is placed on `lead` because that is the lane this genre reserves for a voice; nothing else in the pattern is touched",
        "the `pattern` field is the v1 shape this example was built from; the recipe names the arrangement calls that write the same music today",
      ],
    },
  ];
}

/** The genre's arranged pattern, without importing the whole mix module at the top of this file. */
function patternFromGenreSafe(genre: unknown): Parameters<typeof applyPatternOps>[0] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return patternFromGenre(genre as never);
}

/**
 * What a caller needs in order to choose an example and then fetch it.
 *
 * The pattern and the notes are the payload and stay in `get_example`; this is the index over the same material, so the two cannot
 * disagree about what exists. `index` is the position within the genre's pair, which is exactly the argument `get_example` takes.
 */
export interface ExampleSummary {
  id: string;
  genreId: string;
  index: number;
  title: { en: string; zh: string };
  teaches: string;
  recipe: string[];
}

export interface ExampleList {
  total: number;
  returned: number;
  offset: number;
  /** The genres the filter matched, so a paged caller can see the shape of the whole set. */
  genres: string[];
  examples: ExampleSummary[];
}

/**
 * Every example there is, paged — the read side of `get_example`.
 *
 * It is deliberately built by calling `examplesFor`, the same function `get_example` and the `groove://examples/{genre}` resource call,
 * rather than by keeping a list of ids: a second list would be a second thing to keep true, and the whole point of building examples
 * from the genre library is that there is only one. Examples exist for every genre in the library, so the unfiltered listing covers all
 * of them; `genreId` narrows it, and the default page mirrors `list_genres`.
 */
export function listExamples(args: { genreId?: string; limit?: number; offset?: number } = {}): ExampleList {
  const genreIds = args.genreId ? [clean(args.genreId)] : allGenreIds();
  const all: ExampleSummary[] = genreIds.flatMap((genreId) =>
    examplesFor(genreId).map((example, index) => ({
      id: example.id,
      genreId: example.genreId,
      index,
      title: example.title,
      teaches: example.teaches,
      recipe: example.recipe,
    }))
  );
  const offset = Math.max(0, args.offset ?? 0);
  const limit = Math.min(500, Math.max(1, args.limit ?? 50));
  return {
    total: all.length,
    returned: Math.min(limit, Math.max(0, all.length - offset)),
    offset,
    genres: [...new Set(all.map((example) => example.genreId))],
    examples: all.slice(offset, offset + limit),
  };
}

import { patternFromGenre } from "../src/data/genreMix";
