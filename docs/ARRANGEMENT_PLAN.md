# Song and arrangement plan — real tracks, a step sequencer as the editor

The question this answers: should the Logic-Pro-style *track/arrangement* concept be pulled forward, with the step
sequencer demoted to "the fast way to edit a drum pattern", and should the product target **iPad and PC only**?

**Yes to both, and the arrangement first.** The reasoning is not that a DAW is nice to have — it is that most of the
remaining audio-quality plan is *unimplementable without it*, and the app turns out to be much closer to it than it
looks.

## What already exists (and what does not)

`GrooveProject` (`src/types/project.ts`) already carries:

```ts
patterns: { A: SequencerPattern; B: SequencerPattern };
activeSlot: "A" | "B";
songMode: boolean;
songChain: ("A" | "B")[];
loopRange: [number, number] | null;
```

So the *shape* of an arrangement is there: two named clips and an ordered chain of them. But:

* **`songChain` is never rendered or played.** `grep` finds it in the type, the persistence layer, the project-hub
  modal (copied through) and one modal prop — nowhere in the engine, the exporters or the sequencer. `songMode` is
  a boolean that nothing acts on. It is a promise the code carries around.
* **The renderer has no timeline.** `renderPatternOffline` takes `bars: number` and *repeats one pattern*
  (`totalSteps = patternSteps * bars`), which is exactly the "infinite loop machine" the listening report heard: a
  4-bar export is four identical bars.
* **The sequencer *is* the whole product surface.** Sixteen steps of A or B, and the bar strip is a ruler inside one
  pattern.

That is the gap: not "no arrangement feature", but **a recorded arrangement with no engine, no editor and no
render**.

## The model

```ts
// src/types/song.ts
export interface SongSection {
  id: string;                 // stable, so undo and the share codec can reference it
  slot: "A" | "B" | "C" | …;  // which clip plays (a clip *is* a SequencerPattern)
  bars: number;               // how many times it repeats — the unit Logic calls a "region length"
  /** Optional per-section overrides: the fill, the variation, the mute. */
  mute?: string[];            // track ids silenced in this section
  velocityScale?: number;     // arrangement-level dynamics (a build, a breakdown)
  label?: string;             // "intro", "drop", "fill"
}
export interface Song {
  id: string;
  name: string;
  genreId: string;
  bpm: number;
  swing: number;
  resolution: "1/8" | "1/16" | "1/32";
  clips: Record<string, SequencerPattern>;  // A, B, C… — what the sequencer edits
  sections: SongSection[];                  // what the arrangement view edits
  loopRange: [number, number] | null;
}
```

Two properties make this safe to introduce now:

1. **Migration is lossless and trivial.** `songChain: ("A"|"B")[]` becomes one 1-bar section per entry. A project
   saved today opens tomorrow with the same eight bars in the same order; the old field is read if `sections` is
   absent, and the first save writes the new shape. The share codec and the `.groove` package get the same
   treatment (they already version their payloads).
2. **A pattern stays exactly what it is.** The step sequencer keeps editing `SequencerPattern`; it simply edits
   *the clip the arrangement has selected*. Nothing about the current editing surface is thrown away — it becomes
   the detail view, which is what the request asks for.

## The work, in the order that unblocks the most

Track B is the arrangement; Track A is the audio-quality work from `docs/GROOVE_QUALITY_PLAN.md`. They are
independent until B5, and B is what makes that document's P1 possible.

| # | Step | Where | Verified by | Effort |
| :-- | :--- | :--- | :--- | :--- |
| **B0** | **This slice**: the `Song` types, the pure timeline functions (flatten, normalise, migrate, total bars) and their tests | `src/types/song.ts`, `src/features/arrangement/songTimeline.ts` | unit tests: migration is lossless, flattening agrees with the old semantics, invalid sections are reported not thrown | **done in this round** |
| **B1** | Persistence and share: read/write `sections`, keep reading `songChain`; `.groove` and the share URL carry the arrangement | `projectStorage.ts`, `SequencerUrlShare.ts` | round-trip tests, plus a share link that decodes an arrangement | S |
| **B2** | **The renderer gets a timeline**: `renderSongOffline(song)` concatenates sections (per-section clip, repeats, mutes, velocity scale) instead of repeating one pattern. `bars` becomes "render the song" rather than "repeat the loop" | `WavExporter.ts` | `check:groove` gains section-level metrics; a 4-section song renders with measurable differences per section | M |
| **B3** | **The arrangement view** (iPad and PC): tracks down the side, bars across the top, clips as regions; select a clip → the step sequencer edits it. Drag to move, edge-drag to repeat, keyboard on PC, touch on iPad | new `src/views/ArrangementView.tsx` + toolbar entry | a new `probe:arrangement` (clip drag/resize with mouse *and* touch, ≥44 px targets on iPad, no clipped controls) | L — the visible feature |
| **B4** | **Exporters follow the timeline**: MIDI/ALS/.als/MP3 render the arrangement; the share link carries it | `MidiExporter`, `AbletonExporter`, `useExportActions` | the exported MIDI's length equals the song's bar count; the ALS has one clip per section | M |
| **B5** | **The payoff for the audio plan**: fills, variation, harmonic movement every 8 bars, risers and builds become *sections and overrides* instead of pattern hacks | arrangement data + the new `texture`/fill voices | `check:groove`'s static-harmony and velocity claims fall; the report's "no fill, no variation" items become expressible | M |
| **B6** | MCP surface: `create_song`, `add_section`, `render_song` — an agent composes an arrangement, not a loop | `mcp/**` | the MCP gate calls them; docs updated | S |

## iPad + PC only

That is a scoping decision with a large, concrete consequence list — and most of it is *removal*, which is why it
belongs in the same plan rather than in a backlog.

**What it removes:**

| Removed | Size / where |
| :--- | :--- |
| The phone shell | `src/mobile/**` — 17 files, 6,866 lines (screens, the vinyl canvas, the tab bar, the studio sheet) |
| Phone-only skin layers | `src/mobile/skins/*.css` (five character sheets + `legacySkin.css`, `panelSkin.css`), `JAM_COLORS` role-isation, the phone views in `probe:skins` |
| `/m/*` routes and their gates | the router's phone branch, the phone legs of the E2E matrix (both iPhone 14 targets), `probe:jank`, the phone touch rules |
| Skin work that only served the phone | the phone tab-bar label class, the `panelSkin`/`legacySkin` split, and the phone half of the "shared role table" item (P0 0-5) |

**What it adds:**

* The desktop surface becomes the *only* surface, so it must be **touch-correct on iPad**: the ≥44 px touch-target
  budget (currently a phone gate) becomes a requirement for the desktop layout too, and hover-only affordances need
  a touch path. `probe:toolbar` already counts visible controls and the matrix already asserts "no control outside
  the viewport" on iPad — those become the primary touch gates instead of secondary ones.
* The arrangement view must be designed for both input models from the start: drag/resize with a mouse, long-press
  and drag with a finger, no hover-only affordances, and a timeline that is legible on an 11-inch screen without
  the phone layout's density tricks.
* The E2E matrix shrinks from 7 targets to 4 (three desktop engines + iPad portrait/landscape) — which makes room
  for the arrangement legs in the same runtime.

**The recommendation on sequencing the removal** (this is the one decision worth your confirmation): **freeze and
de-gate the phone now, delete it in the release that ships the arrangement view.** Freezing means: no new phone
work, its gates stop blocking the build (they cannot fail a merge), `/m/*` keeps working for anyone with the URL,
and nothing user-visible breaks mid-flight. Deleting it in the same release as the arrangement view avoids ever
shipping a release whose phone surface is half-removed, and it means the deletion is verified against the feature
that replaces it.

## What this changes in the audio-quality plan

`docs/GROOVE_QUALITY_PLAN.md` had the arrangement as **P2.1, "product decision required"**, on the grounds that it
was the deepest item. That was the wrong call, for a reason that only became clear while planning it: **most of P1
is unimplementable without a timeline.** "Add a fill in bar 4", "change the chord every 8 bars", "build a riser" and
"vary the stab" are all statements about the arrangement, not about a one-bar pattern.

So the revised order is:

| Track | Round 1 | Round 2 | Round 3 | Round 4 |
| :--- | :--- | :--- | :--- | :--- |
| **A — audio quality** (independent) | velocity humanisation, duck depth | stereo width, swing, tail | mid-range fill, ghost notes (pattern-level) | per-note timbre variation, saturation depth |
| **B — song/arrangement** | B0 types + timeline (**this round**) | B1 persistence + share | B2 renderer timeline | B3 arrangement view |

Track A's first two rounds need no timeline and fix the report's three biggest complaints. Track B's B0–B2 are
invisible (no UI) and can proceed in parallel. The arrangement view (B3) is the first user-visible step, and it is
where the two tracks meet.
