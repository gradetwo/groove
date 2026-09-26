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

**Landed (first slice, 2026-09-23): the transport asks the same function the exporters do.** `patternForExport`
already answers "what does this session *play*?" — the flattened arrangement in song mode, the loop otherwise — and
playback used to bypass it, so the arrangement could be exported, measured, and never heard. The console now feeds the
engine that answer, and clears the loop range in song mode (looping a 16-step window inside a 40-bar song is the same
silence in a different shape). The editor above still shows the loop being *edited*, which is a different job, and
`editorPositionFor` answers the one question that follows: which pass of which section the transport is in, and
whether that pass is the clip the grid is showing (`matchesEditor`) — so the beam is not drawn at a step that belongs
to different music. The playhead is wired to that helper in the same slice (a step inside the editor's own clip
moves the beam; a pass playing another clip hides it), and song mode's old A↔B alternation on every wrap is kept
**only** for a session with no sections — with the console feeding the engine the flattened arrangement, that swap was
a feedback loop.

**What remains of B7 is its *listening* proof, and it needs something the app does not have yet.** The unit cases pin
what the console feeds the engine and how the playhead maps; what none of them can show is that the *sound* changes at
a pass boundary, and a probe cannot observe it either: the engine is created inside the app and nothing exposes it, so
`page.evaluate` has no analyser to sample. The probes that do need engine internals inject a hook through
`page.addInitScript` (`measure_gs1_jitter.mjs`'s `window.__e7`) — that is the shape this takes, and it is an app change
(a deliberate test hook) rather than a probe change. Until then the plan says plainly that B7 is verified structurally
and not audibly, and a listening check by a human is the honest substitute.

**The probe exists now, and it fails honestly.** `scripts/probe_arrangement_playback.mjs` drives the built app with
`?probe=1`, builds a two-section song whose halves are deliberately different (the second at `velocityScale` 0.55 with the
lead muted), plays it, and samples the master analyser inside each section — comparing the spectral distance between the
two against the *same-section* distance, which is the noise floor. That ratio is the whole judgement: a transport that
plays the arrangement moves the spectrum; one that loops the pattern being edited does not.

Its first two runs are worth recording because they are the reason the check is shaped this way. Run one reported a
difference between the sections and a same-section floor of `null` — a bug in the probe's own spectrum maths, which
summed *arrays*. Run two fixed the maths and **failed**: both windows sat at −80 dBFS and the ratio was 0.8×, i.e. the
probe was measuring silence, because it had clicked the start gate but never opened a genre, so nothing was playing. A
check that cannot tell silence from music is worse than no check, and this one now says so out loud — which is the state
it is handed over in: **it fails, with a number, until a genre is playing.**

**Its first CI run reports a number, and the number is not yet evidence about the transport.** Run 36261801889:

```
❌ the two sections differ by 5.43 dB/band against a same-section noise floor of 9.94 (ratio 0.5×)
```

Two readings, and the second is the one to act on first:

* taken at face value, the two deliberately different sections are **less** different from each other than one section is from
  itself — which would mean the transport still loops the pattern being edited, i.e. the first slice's wiring is not doing what its
  unit cases say;
* but a **9.94 dB/band floor on a section measured against itself** is far too high to be a noise floor. A clean same-section
  comparison should be near zero, and its being the same order as the signal says the two sampling windows are not aligned with
  the music — so the ratio is currently measuring the probe's own timing rather than the transport.

**The diagnostic answered, and the answer is silence.** Run 36263103572, with the windows spanning whole bars and the levels
printed:

```
❌ the two sections differ by 4.59 dB/band against a same-section noise floor of 5.25 (ratio 0.9×)
   window levels    : A -84.5 dB · B -80.2 dB · frames A/B 46/46
```

**−84.5 and −80.2 dBFS is not music.** The probe is measuring the noise floor of an audio graph that is not producing sound, so the
ratio, the floor and the section distance are all statements about silence — and B7 is neither confirmed nor refuted by any run so
far. Three CI runs have now reported ~−80 dBFS; the earlier two were diagnosed as a suspended context and a missing genre, and
this one has a running context, a genre loaded, 46 frames per window and still no signal.

**The control ran, and it is silent too — so the probe is what is broken, not the transport.** Run 36265037064, both measurements
side by side:

```
arrangement : ❌ 3.62 dB/band against a 5.00 floor (ratio 0.7×)   · levels A -84.0 dB · B -80.8 dB · frames 46/46
plain loop  : ❌ 5.10 dB/band against a 6.77 floor (ratio 0.8×)   · levels A -85.2 dB · B -80.4 dB · frames 45/46
```

The loop has **no sections at all** — nothing to play but the pattern the editor is on — and it measures the same −85 dBFS. So the
silence is in the probe's audio path, and B7 has **never been heard by its check**: the transport is neither confirmed nor
refuted, and the ratio has been a number about nothing on all five runs.

**Answered: the app is playing loudly, and the FFT reading is what lies.** Run 36265694456 printed both diagnostics:

```
window levels    : A -85.1 dB · B -80.5 dB · frames 46/46
analyser         : waveform peak 0.858145 · rms 0.328211
engine state     : {"currentGenre":{"id":"uk-garage","name":"UK Garage", … }}
```

A time-domain **peak of 0.858 (−1.3 dBFS) and an RMS of 0.33** is a loud, playing mix — and the same analyser calls it −85 dB in the
frequency domain, on both the arrangement and the control loop. So the app **is** making sound, the transport is running, and the
silence was never in the music: it is in how the probe reads the spectrum. That retires the three candidates the previous round
listed (analyser off the sounding bus, `engine.play()` not starting, autoplay) in one step, and it is the sixth run's worth of
−80 dBFS explained.

What it does **not** yet do is judge B7, and the difference matters: a waveform proves sound, not *which* music, and the ratio was
the part that could tell the arrangement from the loop. So the next move is the FFT path itself — read a few raw bin values to see
whether they are all near −85 (a scaling/unit problem) or whether the array is stale (a reading-order problem) — and once the
spectrum is real, the ratio finally means what the plan says it means.

**The raw bins say the reading is real, and that the test itself is too weak.** Run 36266339588:

```
raw bins : [-76.6, -99.3, -110.3, -128.2, -145.9] · max -75.16 dB · minDecibels -100 · fftSize 2048
raw bins : [-85.1, -67.7, -84.9, -104.5, -120.3] · max -67.19 dB · minDecibels -100 · fftSize 2048
```

The bins are **not** all at the floor (maxes of −75 and −67 dB), so the spectrum is being read correctly — it is simply quiet
overall, because `minDecibels` is −100 and the probe averages all 1024 bins, most of which hold nothing but the float floor. That
flattening is fine for a comparison, since both sides get it.

What it exposes is the **experiment**: the two sections are the same clip, one at `velocityScale` 0.55 with the lead muted, and the
metric reduces each section to one **mean spectrum over a whole bar**. A level change and one missing lane barely move that mean,
and the "same-section floor" is the music's own movement between two sets of frames — so ≈1× is what this design produces whether or
not the transport plays the arrangement. The probe has been asking a question its own geometry cannot answer.

**Two changes make it answer**: make the sections **structurally** different (a second clip with a lane the first lacks) so the
means differ by construction; and compute the floor from two **time-aligned** windows in one section (the same beats of adjacent
bars) so the music cancels instead of counting as noise. Then a ratio well above 1 means the transport switched clips and 1 means
it did not — which is the judgement B7 has waited for.


**What to narrow next**, in the order the evidence suggests: the FFT bands say nothing about *where* the silence is, so the probe
should report the analyser's **waveform** (`getFloatTimeDomainData`'s peak/RMS), which separates "no signal reaches the analyser"
from "no signal is generated"; and it should print `probe.readState()` alongside it, which says whether the engine believes it is
playing and which pattern it holds. Those two answers cut the three remaining candidates — the analyser being tapped off the bus
that carries the sound, `engine.play()` not starting the transport, and autoplay — down to one.

**So the next experiment is a control, not another look at the ratio**: measure a **plain loop** (no sections at all) with the same
probe and the same analyser. If the loop is also at −80 dBFS then the probe's audio path is what is broken and B7's listening
proof simply does not exist yet; if the loop is loud and the song stays silent, *that* is a real finding about the transport and
it is worth following into `patternForExport`. Until one of those two is measured, the honest state of B7 is "the arrangement is
played structurally and has never been heard by the check".

**The diagnostic that decides between them** is the level of each window: if the windows are near −80 dBFS the probe is measuring
silence again (the failure it already reported once), and if they are at a normal level while the floor stays near 10 dB the
windows are too short or not held inside one section long enough, and the floor has to come down before its ratio means anything.
Either way the number is recorded rather than hidden, and B7 stays open until a run shows a ratio well above 1 **with a floor that
looks like a floor**.

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
