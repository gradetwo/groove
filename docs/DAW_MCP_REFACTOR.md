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

## What this is not

It is not a rewrite of the sequencer, the audio engine or the genre library — those are the parts this project has spent its
measurements on, and none of them conflicts with the positioning. It is the **document model** that has to grow from "two
patterns" to "an arrangement", and the **render path** that has to stop throwing the arrangement away.
