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
| **B1** | Persistence and share: read/write `sections`, keep reading `songChain`; `.groove` and the share URL carry the arrangement ✅ | `projectStorage.ts`, `projectDb.ts`, `useSequencerStore.ts`, `useProjectHub.ts`, `types/project.ts`, `SequencerUrlShare.ts` | round-trip tests, plus a share link that decodes an arrangement — `src/test/songPersistence.test.ts` (9 cases: legacy migration, hydration preference, save round-trip, the two views staying in step) and three new cases in `sharePayloadSecurity.test.ts` | **done** |
| **B2** | **The renderer gets a timeline**: `renderSongOffline(song)` plays the sections (per-section clip, repeats, mutes, velocity scale) instead of repeating one pattern; the WAV export follows it in song mode ✅ | `src/data/songFlatten.ts`, `WavExporter.ts`, `useExportActions.ts` | flattening is unit-tested bar by bar (order, repeats, mutes, velocity clamping, mixed clip lengths, optional lanes); the render is **three clip lengths longer** for a 4-pass song than the single loop it replaces, measured through the same offline path. Section-level *audio* metrics in `check:groove` are still open (recorded below) | **core done** |
| **B3** | **The arrangement view** (iPad and PC): bars across the top, clips as regions; select a clip → the step sequencer edits it. Drag to move, drag the bottom band to repeat, keyboard on PC, touch on iPad ✅ | `src/features/arrangement/songEdit.ts`, `src/components/arrangement/ArrangementPanel.tsx`, the studio toolbar's Tier 2 entry | 15 cases in `src/test/songEdit.test.ts` (ruler, drop targets, the keyboard model, ids that cannot collide) + 14 in `src/test/arrangementPanel.test.tsx` (regions, an unplayable section, the gestures, every target ≥ 44 px, focus) + `npm run probe:arrangement`, which drives the **built** app: opens the entry through the advanced density, checks every region against its own bar in the ruler's arithmetic, measures every finger target in the DOM, and performs a real mouse drag → band drag → ArrowLeft, with a sub-half-bar nudge as the negative control | **done** |
| **B4** | **Exporters follow the timeline**: MIDI/ALS/.als/MP3 render the arrangement; the share link carries it | `MidiExporter`, `AbletonExporter`, `useExportActions` | the exported MIDI's length equals the song's bar count; the ALS has one clip per section | M |
| **B5** | **The payoff for the audio plan**: fills, variation, harmonic movement every 8 bars, risers and builds become *sections and overrides* instead of pattern hacks ✅ *(model + generator; the audio claim is measured in `check:groove`)* | `src/types/song.ts` (`SectionOverrides`), `src/data/songFlatten.ts`, `src/data/arrangementForm.ts`, the arrangement view's picker | `SongSection.overrides` carries a `velocityRamp` (a build) and a `fill`; `resolveTimeline` folds the ramp into each bar's `velocityScale` and puts the fill on the section's **last pass only**, so the single renderer needed no new concept; the generator derives the fill's lanes from the clip (`fillLanes`) instead of inventing one, so it works for 159 genres with no hand edits. 24 cases in `src/test/arrangementForm.test.ts` (ramp interpolation and clamping, fill normalisation, the fill's onsets and velocities in the flattened pattern, muted lanes, a lane no fill reaches flattening exactly as before, the form table's own limits) + 4 in `src/test/arrangementPanel.test.tsx` (the picker, its 44 px targets, the build/fill badges) + `probe:arrangement` generates the club form in the built app and asserts 6 named regions with 2 build and 2 fill badges | M |
| **B6** | MCP surface: `create_song`, `add_section`, `render_song` — an agent composes an arrangement, not a loop ✅ | `mcp/song.ts`, `mcp/registry.ts` | the gate calls the two browser-free tools (46 checks, up from 42) and asserts `render_song` is declared; 14 unit tests in `src/test/mcpSong.test.ts`; `docs/MCP.md` gained the Song section | **done** |

### B1 — what landed

`sections` is now the **source of truth** and `songChain` is a derived view (`sectionsToSongChain`), so the two
cannot disagree: `SET_SECTIONS` derives the chain, `SET_SONG_CHAIN` (the studio's existing bar editor) recreates
one-bar sections from it, and `LOAD_PROJECT` derives the chain when the project brings an arrangement. Hydration
handles three ages of data — a snapshot with `sections`, one with only `songChain` (migrated), and none at all —
and a save writes both, so an older build reading the same snapshot still shows the same order. `.groove` packages
and the project hub ride along because the arrangement is on `GrooveProject`.

The share link carries it too: `SharedSequencerState.sections` encodes as one tuple per section
(`[slot, bars, label?, velocityScale?, mute?]`) and the decoder applies the same bounds as every other untrusted
field — an out-of-bounds section is dropped, not trusted, and a link made before the arrangement existed still
decodes with `sections` absent so the caller migrates its own chain.

Two things it deliberately does **not** do: the chain editor is still lossy for a section with `bars: 4` (that is
B3's editor replacing it), and nothing yet *renders* the arrangement (that is B2).

### B2 — what landed, and what it deliberately did not

There is **no second renderer**. `flattenSong(song)` turns the arrangement into one ordinary pattern — each bar
contributes its clip's full length (a bar is one *pass of its clip*, which is what `SongSection.bars` counts and
what `resolveTimeline` enumerates), with the section's mutes zeroing its own bars and its `velocityScale` applied
to that bar's velocities — and `renderSongOffline` hands that pattern to `renderPatternOffline` with `bars: 1`,
because the flattened pattern's `totalSteps` *is* the song. Every gate, limiter path, stem exporter and
measurement keeps working unchanged, and the WAV export uses it when the project is in song mode.

Three details that are decisions rather than accidents:

* **polymeter is dropped** on flattening: a lane that loops every 8 steps has no meaning in a song whose bars come
  from different clips, and leaving `trackLength` set would make the renderer wrap the lane *inside* the song;
* **an optional lane survives only if every contributing clip defines it** (otherwise a song mixing a clip with
  ratchets and one without would invent subdivisions for the second);
* **a bad section is skipped with a reason** — a missing clip, or a clip whose track list differs from the song's
  first clip — so a half-finished arrangement renders what is playable and reports the rest, which is the state the
  arrangement view has to be able to show.

Still open from B2's verification: `check:groove` has no section-level audio metrics yet (the flattening tests
prove per-bar differences in the *data*; proving them in the rendered file is a separate measurement).

### B3 — what landed, and the four decisions inside it

The view is `ArrangementPanel` (a modal over the studio, opened from a Tier 2 toolbar entry beside Song Mode);
everything it *decides* is in `songEdit.ts`, and the split is enforced by two test files rather than by intention.

1. **It draws the timeline, not the list.** `sectionRegions` walks `resolveTimeline`, so a section whose clip is
   empty has no region and does not shift the regions after it. The same honesty is in `dropIndexForBar`: a drop
   resolves to an index in `song.sections`, not to a region index, so dropping onto the bar an unplayable section
   would have occupied still lands where the user pointed.
2. **Move and resize are stacked bands, not a body and a corner.** A one-bar region is 48 px wide; a 44 px edge
   handle would leave four pixels of body, and the region could be resized but never dragged. So the region is a
   56 px move band over a 44 px resize band — both as wide as the region, both at or above the 44 px contract, and
   no gesture is ambiguous. This is the one place where the finger contract changed the layout rather than a
   colour.
3. **One `Song`, two consumers.** `sessionSong()` is the single builder of "what the session is right now", used by
   the arrangement view *and* by `patternForExport` for WAV/MP3/MIDI/`.als`. The timeline on screen and the file an
   export writes cannot describe different songs, and the subtle part — the pattern being edited lives in
   `current`, not in `patterns[activeSlot]` — is written once.
4. **A gesture is one undo entry; a key press is its own.** Drags call `commitCoalesced` under a
   `arrangement:move:<id>` / `arrangement:resize:<id>` key, discrete commands call `commit`. Without the
   distinction a drag would evict the undo stack forty times, and without the other half two quick deletions would
   collapse and the first would be unreachable.

Deliberately **not** in this slice: adding a section from the view (the studio's song chain still creates them, and
the empty state says so), the playhead, and per-section mutes/labels editors — those are B5's material, and the
panel already renders `label`, `mute` and `velocityScale` regions correctly when they arrive from a project.

### B5 — what landed, and what it deliberately leaves

The listening report's "there is no fill, no build, no variation" is a statement about a *timeline*, so the fix is
arrangement data rather than a second pattern:

* **`SongSection.overrides`** carries a `velocityRamp` (the multiplier at the section's first and last pass) and a
  `fill` (lanes + step offsets inside one pass + a velocity).
* **`resolveTimeline` is where they become facts**: the ramp is folded into each bar's `velocityScale` — multiplied
  with the section's own scale, so a quiet build stays quiet — and the fill is attached to the section's **last
  pass only**. Folding rather than carrying alongside is why `flattenSong` needed no new concept: every consumer
  that already honours `velocityScale` gets an 8-bar build for free.
* **`arrangementForm.ts` is the generator.** Three forms (`loop`, `club`, `song`) as an inspectable table, expanded
  against whatever clip the project holds. It is the same rule the colour work and P0.2 follow: one table, no
  per-genre hand-editing. `fillLanes` picks the lanes that read as drums **from the clip**, so a clip with no drum
  lane gets no fill rather than a fill on a chord.

One subtlety worth keeping: the flattening rule for the optional `velocity` array was "only if every contributing
clip provides one". A fill names a velocity for the hits it adds, so a lane with no array would sound those hits at
the renderer's default and the ramp would never reach them — the lane is therefore given an array *when a fill
reaches it*, and holes are spelled out as the same 100 the renderer would have used. A test pins the other half:
a lane no fill reaches flattens exactly as it did before, holes included.

**The harmonic half of B5 — "change the chord every 8 bars" — is a section override, not a new clip.**
`SectionOverrides.transpose` moves a section's *pitched* lanes by ±24 semitones and touches nothing else: a drum has
no key, so a kick cannot move, and the shift is clamped twice (the section's own ±24, then each note into the MIDI
range) so a share link cannot walk a line off the keyboard. It follows the same "no empty keys" rule as `label` and
`mute`: transposed and put back leaves no `overrides` object at all, so a project round-trips byte for byte and a diff
shows real edits. The arrangement view exposes it as four 44 px steppers (±1, ±12) beside the label, and the share
link carries it as `t` in the same compact override object as the ramp and the fill — bounded on both sides, like
every other field in a link.

`probe:arrangement-audio` (CI, desktop leg) renders a two-bar
build and a two-bar fill through the app's own offline engine and measures the *audio*: the fill's bar gains
**+6.04 %** high-frequency energy (a snare hit is broadband) for a **−0.17 %** level change, which is what a fill is
— onsets, not loudness. The same run also produced the number P2.3 needs: a **6 dB** velocity ramp in the pattern
(43.7 → 86.7 mean snare velocity) renders as **−1.7 %**, i.e. the master chain's gain recovery gives the ramp back.
The probe asserts what is true (the fill is audible; the ramp is in the pattern and does not *invert*), prints the
number, and names the erasure as P2.3's item rather than asserting something the engine does not do.

Why it took a probe: every audio claim in `src/test/**` is really structural — jsdom's Web Audio double renders an
empty buffer — so "the fill is audible" needs a real browser, and the unit tests can only pin the pattern.

### B7 — the transport plays the arrangement (not done; the largest gap left)

**Not done, and named here rather than discovered later: the arrangement is not *played* live.** The transport
loops the pattern being edited; `songMode` is still a flag the exports and the WAV bounce consult (B4), not something
the engine walks. So a user can build a 40-bar arrangement in the view, export it, and hear one loop while the
transport runs. Nothing in B0–B6 asked for live playback — it is a transport/engine item (switch clips at pass
boundaries, apply the section's overrides as the playhead crosses them) and it is the largest remaining gap between
what the arrangement view shows and what the app does. It is recorded here because "the surface shows a timeline the
transport ignores" is a product hole, not a missing polish item.

**What it takes, and how it would be verified.** The transport already knows the bar it is on; the missing piece is
that the *engine* is handed one pattern and told to repeat it. The shape that fits this codebase is the one B2
established for export — derive the timeline once (`resolveTimeline`), then switch the playing clip at a pass
boundary and apply that section's `velocityScale`/`mute`/`overrides` as the playhead crosses it, through the same
`flattenSong` data the renderer uses, so playback and export cannot disagree. Verification is a probe on the built
app that plays a two-section song, samples the analyser at a bar boundary, and asserts the second section is
audibly a different clip (and, once A2 of the quality plan lands, that its ramp is audible); plus a unit test that
the transport asks for the right pass at each boundary. It is deliberately **after** the audio batch: it changes what
is *played*, not what is *rendered*, so it cannot stale the trims — which is why it is the parallel track.

Deliberately left: a **per-hit crescendo** inside a fill (needs a per-step velocity list on `SongFill`), editing a
ramp or a fill by hand in the view (the picker generates them; the region shows them), and the *audio* half of the
claim — `check:groove`'s velocity and static-harmony numbers are measured from a genre's own pattern, not from a
generated arrangement, so "the sample moved" needs the arrangement to be what the analyser renders. That is the next
B5 slice, and it belongs with the nightly audio gates.

`probe:arrangement` is the part a unit test cannot do: it opens the entry in the built app, checks every region's
pixel position against the ruler's own arithmetic, measures every target a finger must hit, and performs a real
**drag**. It runs twice in CI — the desktop viewport with a mouse, and Playwright's iPad Pro 11 landscape metrics
(1194×834, DSR 2) with **touch enabled**, where the drags go through Chromium's CDP `Input.dispatchTouchEvent`
rather than `page.mouse`: the thing worth proving on a tablet is that `touch-action: none` is in place, and without
it the browser scrolls the panel instead of moving the region — which a mouse drag cannot see. Its negative control
is a deliberate nudge below half a bar; if that reordered anything, every passing drag assertion above it would be
meaningless.

### B1 implementation notes (the surfaces the arrangement has to survive)

The arrangement is only real once it survives a reload, a project package and a share link. The five places, and
the compatibility rule at each:

| Surface | What it writes | What it must keep reading |
| :--- | :--- | :--- |
| `PersistedProject` (localStorage snapshot, `projectStorage.ts`) | `sections`, plus the legacy `songChain` derived from them (`toSongChain`) so an older build reading the same snapshot still shows the same order | a snapshot without `sections` — hydrate with `migrateSongChain(saved, saved.songChain)`, which is lossless by construction (one 1-bar section per chain entry) |
| IndexedDB project record (`projectDb.ts`) | the same two fields on the project row | rows written before B1 (absent → migrate on load) |
| `.groove` package (`exportProjectPackage` / the importer) | whatever the `GrooveProject` carries, so `sections` rides along once it is on the type | packages exported before B1 (`sections` absent → migrate) |
| Share URL (`SequencerUrlShare.ts`) | `sections` as a compact array on `SharedSequencerState` | links without it — a shared link is a single pattern, so the decoded state gets one section covering the loop |
| Sequencer store (`useSequencerStore.ts`) | — (it is the reader) | a state whose `sections` is stale relative to `songChain` (both are kept in step: `songChain` is derived, never independently edited) |

Two rules keep this from drifting: **`songChain` stays a derived view** (writing it by hand beside `sections` is how
the two would disagree), and **every reader migrates rather than defaults** (a default of `["A","B"]` silently
discards an arrangement; `migrateSongChain` cannot).

## The phone is a subset (decision, and how it is enforced)

The product decision, in your words: **the phone version is a functional subset of the iPad and PC version, with
its own UI and interaction layer; professional multi-track work like this simply does not exist on the phone.**

That is a better shape than either "support it fully" or "delete it", and the codebase is already built for it:
`src/mobile/**` is an independent shell with its own screens, its own skins and its own touch rules. The work is to
make the subset **explicit**, so the next desktop feature cannot leak into the phone by autocomplete.

`src/platform/surfaceCapabilities.ts` is that declaration — a table of 22 capabilities, each with the surfaces that
have it and, where the phone does not, the reason. `src/test/surfaceCapabilities.test.ts` asserts both directions:

* **the phone is a subset, not a fork** — every phone capability must also exist on the desktop, and the phone's
  list must be strictly shorter;
* **every desktop-only capability carries a reason** (a restriction without one is how a restriction becomes an
  accident);
* **nothing under `src/mobile/**` imports a desktop-only module path** — the piano roll, the hardware console, the
  project hub's multi-clip mode and the arrangement view are named with their module paths, and the phone shell is
  grepped for them;
* **the shared model stays shared** — `src/types/song.ts` may not import a surface, so both the phone and the
  desktop can read the arrangement even though only the desktop can edit it.

The five desktop-only capabilities today:

| Capability | Why the phone does not have it |
| :--- | :--- |
| `arrangement` | the timeline this plan introduces; a phone layout cannot host it without becoming a different product |
| `arrangement-export` | it follows from `arrangement`: a surface without a timeline has nothing longer than a loop to export |
| `piano-roll` | it needs the width the phone layout does not have; the phone edits patterns on the step grid |
| `hardware-console` | an inspection surface for a large screen |
| `project-hub-multitrack` | the phone keeps the single-pattern project it ships with today |

What this means for the work below: **no deletion, no freeze**. The phone keeps shipping what it has, its own gates
(the touch budget, `probe:jank`, its skin sheets) keep guarding it, and the arrangement steps B1–B4 are simply
declared desktop-only — the router does not reach them on the phone, and the MCP surface has them because MCP has
no layout at all. The phone's skin work stays independent, which is what "UI and interaction decoupled" already
means in this codebase.

## What this changes in the audio-quality plan

`docs/GROOVE_QUALITY_PLAN.md` had the arrangement as **P2.1, "product decision required"**, on the grounds that it
was the deepest item. That was the wrong call, for a reason that only became clear while planning it: **most of P1
is unimplementable without a timeline.** "Add a fill in bar 4", "change the chord every 8 bars", "build a riser" and
"vary the stab" are all statements about the arrangement, not about a one-bar pattern.

So the revised order is:

| Track | Round 1 | Round 2 | Round 3 | Round 4 |
| :--- | :--- | :--- | :--- | :--- |
| **A — audio quality** (independent) | velocity humanisation, duck depth | stereo width, swing, tail | mid-range fill, ghost notes (pattern-level) | per-note timbre variation, saturation depth |
| **B — song/arrangement** | B0 types + timeline ✅ | B1 persistence + share ✅ | B2 renderer timeline ✅ | B3 arrangement view ✅ |

Track A's first two rounds need no timeline and fix the report's three biggest complaints. Track B's B0–B2 are
invisible (no UI) and can proceed in parallel. The arrangement view (B3) is the first user-visible step, and it is
where the two tracks meet — and with it landed, **B5** (fills, 8-bar variation and risers as arrangement data) is
unblocked, because there is finally a surface and a data path for them.
