# The DAW/MCP refactor — what conflicts, and in what order to change it

The PC version is positioned as a **professional DAW**, and it has to let an **AI agent compose a complete song through MCP**. This
document is the conflict inventory between that positioning and the structures the code actually has, with the evidence for each,
and the order to change them in. It exists because the conflicts are structural — a data model or an algorithm, not a missing
button — and the cheapest time to say so is before the refactor rather than in the middle of it.

Every claim below was read out of the code; the `path:line` is the evidence.

## The conflicts, hardest first

### C1 — the project format cannot hold a song

`GrooveProject` is `patterns: { A, B }` plus `activeSlot` and `songMode`, and nothing that can carry a clip slot or a section
(`src/types/project.ts:12-27`). A song has up to **four** clips and an **ordered arrangement** (`mcp/song.ts`, `src/types/song.ts`).
So `exportProjectPackage` (`src/features/sequencer/projectDb.ts:496`) is **lossy for a song today**: the arrangement is dropped,
and there is no field to drop it into.

This is the anchor conflict. Everything else that is about *saving, loading, exporting or sharing a composition* inherits it, and
an AI that composes a song through MCP cannot round-trip the result.

**Target**: the package gains a first-class arrangement — clips keyed by slot, the ordered sections with their overrides, the tempo
and the rack — behind a version bump, with the importer reading v1 packages as a one-clip song. `validateGroovePackage`
(`:467`) is the gate that has to learn the new field, so the change is checked by construction rather than by a migration script.

### C2 — two models for "what is playing"

The app's document is a **project** (two patterns, a rack, a step count); the engine and the MCP layer compose a **song** (clips,
sections, overrides, `flattenSong`). The DAW needs **one** model — an arrangement of clips — with "two patterns" as the special
case it is. Today they are two vocabularies that meet in `flattenSong`, which is why the arrangement view, the exporters and MCP
each have their own idea of what a composition is.

**Target**: the arrangement (clips + sections) is the document; `patterns: { A, B }` becomes "the two clips the step editor shows
when the arrangement is empty". This is the change that makes per-lane slots, duplicate-section and one-clip-per-ALS-section
straightforward instead of each being a special case.

### C3 — the arrangement is a lossy flatten, not a graph

`flattenSong` renders sections into **one pattern** with no cross-fade at the mute/velocity jumps, which is why `analyze_audio`
counts ~2406 discontinuities on a rendered song and why the composer flagged a click risk at section boundaries. A flatten is the
right thing for a **bounce**; it is the wrong thing for a **document**, because it discards exactly the structure (clip identity,
section boundaries) that a DAW edits and an agent reasons about.

**Target**: keep the arrangement as data and render *from* it, with the flatten kept as an export path — and give the render a
short fade at a section's hard mute or velocity jump, because a rendered boundary is where a listener meets it.

### C4 — MCP can reach the arrangement only partially

Fixed this session: `set_clip`, `get_song`, and `create_song`'s `clips`/`label` arguments — before them, a song could only ever
have clip A and its arrangement could not be read back (`mcp/README.md`, the verified gap list). Still open there: `export_groove`
(blocked on C1), and the mp3-analyser confusion, which turned out to be a description problem rather than a decoder one.

**Target**: every arrangement operation the UI has, MCP has: create/read/update clips and sections, duplicate a section, export
the package, and read the render's own metrics instead of rendering twice.

## The order, and what verifies each stage

The stages are ordered by **what unblocks the AI's round trip**, not by what is easiest, and each ends at a gate that already
exists rather than at a promise.

| stage | change | verified by |
|---|---|---|
| 1 | **C1**: arrangement in the package format + version bump + v1 import | a round-trip test (compose → export → validate → import → the same clips and sections) and `validateGroovePackage` |
| 2 | **C4**: `export_groove` on the new format, naming anything it cannot carry | `npm run check:mcp` plus a round-trip test through the tool |
| 3 | **C3**: render from the arrangement, keep the flatten for export, add the boundary fade | `analyze_audio`'s discontinuity count before and after, on a rendered song |
| 4 | **C2**: the arrangement becomes the document; A/B are its empty case | the existing arrangement, song and project suites, unchanged where behaviour is unchanged |
| 5 | **C4 tail**: `duplicate_section`, per-lane slots, one-clip-per-ALS-section | the exporters' own tests |

Stage 4 is the largest and the one to do last: stages 1–3 give the AI a working round trip **without** moving the UI's document
model, and if the model moves badly the earlier stages still stand on their own.

## Stage 3's criterion, defined before the code (2026-09-28)

The section-boundary fade exists because `analyze_audio` counts ~**2406 discontinuities** on a rendered song and the flatten it
measures has no cross-fade where a section's mute or velocity jumps. "Is it audible?" is a listening question; "did the count
move?" is not, so the criterion is the count:

| what | where | pass |
|---|---|---|
| `analyze_audio`'s `discontinuities` | one long arrangement with hard jumps at its boundaries — the **club** form on `chicago-house` (eight sections, mutes and a velocity ramp), rendered through `render_song` at its own tempo | the count falls **substantially** (the boundaries are the only thing the fade touches) |
| the same count on a song with **no** jumps | two identical sections back to back | **unchanged** — a fade that alters continuous material is a defect, not a fix |
| the fade's length | in the flatten | **5–10 ms**, which is what the plan asked for and what a boundary in a DAW's arrangement view gets |

The measurement is taken **twice in one page** (before and after) with the same seed, so the difference is the fade and not the
renderer, and the tool is `analyze_audio`'s own counter rather than a second implementation of it. `flattenSong` gains the fade as
a parameter with a default, so a caller that wants the old behaviour (or a test that wants to compare the two) can ask for it.

### Stage 3's mechanism, corrected before it was written (2026-09-28)

Stage 3 said "`flattenSong` gains the fade". Reading the type says that is the wrong layer: `FlattenedSong` is
`pattern: SequencerPattern` plus counts and problems (`src/data/songFlatten.ts:21-30`) — **data, not samples** — so there is
nothing in it to cross-fade. Worse, the flatten is exactly what **discards** the section boundaries, so a renderer handed only the
flattened pattern cannot know where they were.

The mechanism is therefore two pieces, and both are small:

1. **`flattenSong` returns the boundaries** — the step index each section starts at, which it already computes as it lays the
   timeline out. That is data, and it is the piece the flatten currently throws away;
2. **the offline render path fades at those boundaries** — a 5–10 ms fade at the sample position the step index maps to, applied
   where the samples exist. `renderPatternOffline` already takes the flattened pattern, so it takes the boundary list with it.

That also makes the criterion honest: the count `analyze_audio` reports is a property of the **audio**, so the fade has to be in
the audio path to move it. A velocity ramp on the boundary steps was considered and rejected — it is an approximation of a fade
that also **changes the arrangement's data**, which is the opposite of what a DAW should do with a playback concern.

### Stage 3 measured: the whole-file counter cannot see a boundary (2026-09-28)

CI ran the measurement (`manual-verify.yml scope=audio`, run 36258064123):

```
✅ Arrangement audio (chicago-house, club form): 4 bars rendered
   boundary fade    : discontinuities 1211 → 1206 with an 8 ms fade
```

**−5 out of 1211 (−0.4%)** — and that is not a failed fade, it is the wrong instrument. The counter is a whole-render statistic, and
four bars of house music carry ~1200 of its own transients (kicks, snares, hats), so one smoothed boundary can only move the total
by the handful of samples that boundary occupied. The same lesson this project keeps writing down: a whole-signal statistic cannot
resolve a local fix, and a detector that fires on the music is not evidence about the edit.

**The criterion is therefore corrected** — it has to be **local**:

| measure | where | pass |
|---|---|---|
| the largest sample-to-sample step **inside ±10 ms of the boundary** | the rendered buffer, before and after the fade | falls by a large factor — this is the click the fade is for |
| the **same** window on a section boundary with no jump (two identical sections) | the same buffer | **unchanged** — the fade must be a no-op on continuous material |
| the whole-file discontinuity count | — | **not a criterion.** It is reported for context and it stays in the log, but it is dominated by the music |

The fade itself did what it was supposed to do — it removed the step at the boundary — which is why the count moved at all rather
than not. What was wrong was expecting a number about the *whole file* to measure an edit to *twenty milliseconds* of it.

### Stage 3 answered: there is no sample-level click to remove, and the fade stays an option (2026-09-28)

CI ran the corrected, local criterion (run 36258712237):

```
boundary click : worst step within ±10 ms of the jump 2.47e-2 → 2.47e-2  · no-jump control 2.47e-2 → 2.47e-2
boundary fade  : discontinuities 1208 → 1205
```

Read it carefully, because it says three things:

1. the worst step in the window is **identical before and after the fade** — so the fade is not touching whatever the worst step is;
2. it is **identical to the no-jump control**, where the material is continuous — so the worst step near a boundary is **a drum
   transient**, not the boundary;
3. and the whole-file count still moved by three samples, which is the fade doing exactly what it does.

Together: **the boundary is not a sample-level discontinuity.** A section's mute or velocity change is a discontinuity in the
*envelope*, and the waveform between two sections is continuous whenever the boundary falls where the signal is near zero — which
is where a bar line usually falls. The composer's ~2406 "discontinuities" are the music's own transients; the counter counts
transients, and reading them as clicks is the same mistake this project has now recorded four times (the detector fires on the
music, so it cannot testify about the edit).

**So the fade ships as an option, not as a default.** It is correct, cheap, five to ten milliseconds, and it is what a DAW does at
an arrangement boundary — but nothing measured here demands it, and turning it on by default would change every rendered song on
evidence that does not support it. What *did* change is the record: stage 3's premise ("the flatten's boundaries produce clicks")
is now measured rather than assumed, and it is **not** supported for the arrangement tested.

## Stage 4 reconnaissance: the bridge already exists (2026-09-28)

C2 says the app has two models for "what is playing" — a project (`patterns: { A, B }`) and a song (clips plus sections) — and that a
DAW needs one. A survey of the consumers says where the seam is and, usefully, that **the bridge is already built**:

| module | what it does with the two-pattern shape |
|---|---|
| `src/features/sequencer/useSequencerStore.ts` | **the document lives here** — this is the one that has to move |
| `src/data/songFlatten.ts` | the **converter**: `sessionSong(...)` builds a `Song` from the editor's state and `flattenSong` renders it |
| `src/features/sequencer/{projectDb,projectStorage,useProjectHub}.ts` | persistence of the project shape |
| `src/features/sequencer/useExportActions.ts` | the exporters, which already go through the flatten |
| `src/views/StudioView.tsx`, `src/components/sequencer/*` | the UI, which edits two slots |
| `src/hooks/useGenreAudition.ts` | audition, same two slots |

Twelve non-test modules touch `patterns.{A,B}` and fourteen mention `activeSlot`, and the important one is `songFlatten`'s
`sessionSong`: the app **already** turns its editor state into a song at the boundary, and the arrangement path already renders
through it. So stage 4 is not "add a song model" — it is "**make the song the document and derive the two editor slots from it**",
which is the reverse of today's direction and therefore a change of ownership rather than a new concept.

**The acceptance line, stated before the change:** the existing suites for the store, the project hub, the flatten and the studio
view must pass **unchanged** wherever behaviour is meant to be unchanged. A migration that needs its tests rewritten is a
migration that changed behaviour, and it should have to say so.

**The first move**, deliberately the smallest one that changes ownership rather than plumbing: give the store an arrangement
(clips keyed by slot plus the ordered sections), keep `patterns.A/B` as **views onto it** for the editors, and let `sessionSong`
read the arrangement directly instead of reconstructing one. Every other module in the table then keeps working against the same
shape until it is its turn.

### Stage 5's ALS item, surveyed (2026-09-28)

"One clip per section" is not a small change, and the survey says exactly why — which is the point of surveying it.

* `export_ableton` builds its file from **one pattern**: `exportAbleton(pattern, { bpm, genreName })` calls
  `buildAbletonLiveSetXml({ bpm, pattern, genreName })` (`mcp/exporting.ts:40-57`);
* the builder's input is `ExportAlsOptions`, whose required field is **`pattern: SequencerPattern`** (singular,
  `src/audio/AbletonExporter.ts:16-18`).

So an exported **song** becomes a single flattened clip today, and giving it one clip per section means the builder has to accept
**a list of clips with where each one starts** — a shape change in the exporter, not a flag.

**The design, recorded rather than guessed**: the song's sections are already a list with lengths, so the exporter needs
`clips: Array<{ pattern, startBeats, name }>` and a song path that produces it by flattening **each section on its own** — which
the existing `flattenSong` can do by being handed a one-section song, so no new flattening logic is needed.

**How it would be verified**: parse the produced XML and assert the `<MidiClip>` elements sit at **distinct, increasing start
positions** and that their count equals the section count. That is a check on the artifact Ableton will open, not on the code that
produced it, which is the only kind of evidence this item deserves.

## What this is not

It is not a rewrite of the sequencer, the audio engine or the genre library — those are the parts this project has spent its
measurements on, and none of them conflicts with the positioning. It is the **document model** that has to grow from "two
patterns" to "an arrangement", and the **render path** that has to stop throwing the arrangement away.
