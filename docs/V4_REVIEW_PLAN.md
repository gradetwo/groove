# Plan from the v4 evaluation (`z2.md`)

An anonymous "v4 merged" evaluation of Groove Lab, dated against **v2.34.3**, covering the MCP server, the web app, the audio engine,
the data model and the docs. It is the most substantial of the external reports so far: 43 claimed problems, 25 recommendations, and a
Phase 0–4 refactor proposal. This file is the plan built from it — **after** checking its claims against the code, because a roadmap
built on false gaps wastes the work it orders.

## Where the report is wrong, and what that changes

Nine of its load-bearing claims were checked against the code. **Five disagree or are already fixed**, and each one would have
ordered work that is already done or proposed something the project deliberately does not want:

| its claim | what the code says | consequence |
|---|---|---|
| "MCP is write-mostly; read/analysis missing" | `get_pattern`, `pattern_statistics`, `validate_pattern`, `compare_genres`, `get_loudness_report`, `render_audio`, `analyze_audio`, `get_song` are all exposed (`mcp/registry.ts`, documented in `docs/MCP.md`) | drop the "add read tools" item; the gap is **project state**, not reads |
| "Resources and Prompts primitives unused" | four resources and three prompts are declared and registered (`mcp/registry.ts`, `mcp/server.ts`) | drop it |
| "No project save / no arrangement model; Schema v2 needed" | `.groove` v2 carries `arrangement`; `projectDb.ts` validates it; `docs/GROOVE_PACKAGE_FORMAT.md` specs it | the remaining schema work is **versioning + seeds**, not the arrangement |
| "No undo" | the **app** records history per `onChange`; the **MCP server** has none | keep it, but scoped to the server |
| "No mixer / bus / send" | `ReverbBus`, `DelayBus`, `MasterLimiter`, `ChannelStripDsp`, `ChannelStrip.tsx` exist | the gap is the **mixer UI, inserts, sidechain, PDC**, not buses |
| "Render is minute-level, no SLO" | already measured and recorded (`docs/GROOVE_QUALITY_PLAN.md`) | keep the SLO work; the premise is already agreed |
| "`render_preview` should return audio in context" | `docs/MCP.md` says audio deliberately stays a file path | reject the content-type change; an analysis summary is the right return |
| "`groove://changelog` proposal" | it is **already documented** (`docs/MCP.md`) and **missing from the registry** | it is a **docs/code mismatch to fix**, not a proposal |
| "`v2.34.3`" | the tree is **2.34.5** | the report is version-stale; re-read before acting on any "current state" claim |

**One correction to a correction**: the report is right that Logic has no global Chord Track and that its "AI" is embedded rather
than absent — those are the parts where it is more accurate than the previous reports.

## What is genuinely new (and worth building)

1. **`validate_prosody`** — Chinese tone (55/35/214/51) as a constraint on melodic direction, with 变调 handling, a
   generation-time soft constraint and a **warning-only** post-check. This is the one item in every report for which the project has
   no answer at all (no tone data, no pinyin, no check), and the report supplies a design rather than a wish.
2. **`melody.generate_melody` / `motif_ops`** — contour-first, phrase-aligned (AABA), range ≤ 2 octaves, plus the
   lyrics → melody → prosody → synthesize dependency chain as a diagnosis.
3. **The vocal path** — the SVS/SVC correction, a four-format export matrix (SMF+lyric, MusicXML, UST, `.groove`), a `VocalTrack`
   spec and a `vocal.synthesize` signature with a dry stem, a manifest and a `local-loopback` mode.
4. **A metric system that measures *enabling* rather than only quality** — compliance, an "expressivity ratio" with `L_min`
   baselines, detour classification, and a tool-side attribution rule. That is a better frame for "is the agent able to work?"
   than the quality-only dashboards used so far.
5. **PDC in two domains** — a latency table (declared/measured/contract), offline pre-roll + trim with `common_latency_samples`, a
   realtime delay + crossfade, and a **comb-filter probe** as the test. The report is right that enabling more FX without this makes
   phase coherence worse, and it names stems as the delivery that must carry the alignment.
6. **The 8 kHz mono analysis render** — a cheap `get_energy_curve`, 1/12 the data, sub-second for a three-minute song.
7. **Compact notation with a read/write asymmetry** — compact for reading, structured for writing.
8. **Render SLOs as staged commitments** (energy ≤ 1 s, section ≤ 5 s, full song ≤ 20 s; a one-minute closed loop ≤ 90 s).

## The plan

Ordered by (a) breaks something or is user-visible, (b) cheap and verifiable, (c) the rest. Each item states its **acceptance line**,
because this project's rule is that a plan entry ends at a gate rather than at a promise.

**Workstream 0 — correct the record (docs, small).**
Fold the table above into `docs/MCP.md` and this file, so the next reader does not re-order finished work. Acceptance: the stale
claims are answered with file:line beside them.

**Workstream 1 — the `groove://changelog` mismatch (code, small).**
`docs/MCP.md` documents a changelog resource that `mcp/registry.ts` does not register. Either register it (a resource over the
committed `public/changelog.json`, which already exists) or remove the documentation. Acceptance: `check:mcp` asserts every
documented resource exists.

**Workstream 2 — the MCP's missing memory (code, medium).**
`opId` + undo/redo on the server, sharing the store's history shape, so an agent can try and revert rather than re-send state.
Acceptance: a test that a sequence of tool calls can be undone to the starting summary, and a `check:mcp` case.

**Workstream 3 — measurement the agent can use (code, medium).**
`get_energy_curve` over the 8 kHz mono offline render, `analyze_loudness` / `analyze_spectral_balance` / `estimate_key`, and the SLO
table published in `docs/MCP.md`. Acceptance: the curve for a three-minute song is produced in ≤ 1 s and differs between a build and
a drop section; a CI step records the render timings so the SLOs stop being aspirations.

**Workstream 4 — harmony, then melody, then prosody (code, large).**
`set_chord_progression` + `suggest_progression` at pattern level, then `melody.generate_melody` (contour-first, AABA, range-bounded),
then `validate_prosody` **warning-only** with 变调 handling and an optional pinyin override. Acceptance: a prosody test that a
deliberately wrong tone/melody pairing is **warned about** and a deliberately right one is not, on a small hand-checked fixture.

**Workstream 5 — style examples (content, medium).**
Two to four curated example projects per genre, exposed as resources and few-shot prompts. Acceptance: the examples are validated by
the same gates as any project, and a prompt renders one end to end.

**Workstream 6 — the deferred refactors (code, large).**
Track factory / folder+summing tracks / region timeline / PDC / audio tracks / SVS. These are the report's Phase 0–4 and they stay
**behind** the workstreams above: they are the largest changes in the document and the ones whose prerequisites (PDC latency table,
golden render, schema versioning) the earlier workstreams establish.

## The harmony gap, located exactly: the library knows *which* progression, not *what it sounds like*

Reading `mcp/library.ts` closes the question of what `set_chord_progression` and `suggest_progression` still need:

* `listChordProgressions` and `getChordProgression` return `id`, a bilingual name, **`roman`** (`"vi-IV-I-V"`), `category`, `emotion`,
  `description` and the songs that use it — and **no concrete chords at all**;
* so the library is the source of **which** progression, and nothing in the tree turns a roman numeral into pitches in a key.

That is the missing piece, and it is small, deterministic and testable: a `romanToChords(roman, key)` step — scale degrees, chord
quality by numeral case, seventh where the numeral says so — which gives the tool layer the pitches that
`set_chord_progression`'s op takes. `suggest_progression` then has a clean shape: pick from the library by emotion and category, render
it in the caller's key, and report both the roman numerals and the pitches.

Recording this before writing it because it is the third time in this plan that reading the data changed what the work is: the harmony
"subsystem" is a roman-numeral renderer plus a chooser, not a new model.

## The mono mystery, solved: the render tools reply in a different shape from every other tool

The probe's own diagnostic answered it in one run — `render reply : raw`, which is what the probe's `payload()` returns when the reply is
**not a JSON text part**. Every browser-free tool answers with a JSON string in `content[0].text`, which is why `payload()` works
everywhere else; `render_audio` and `render_song` return something else — a plain-text or structured result — so `rendered.channels` was
never undefined because the field was missing. It was undefined because **the parser never saw the object**.

That retires the whole line of enquiry with one line of evidence:

* the 8 kHz analysis render's **0.1 s** stands (it is measured from the request, not from the reply);
* **mono is neither confirmed nor refuted** — the probe could not read the answer, and no amount of re-running it would have changed that;
* and there is a **real interface inconsistency** behind it: the render tools reply in a different shape from the other fourteen, which is
  the kind of thing that costs every client an hour and is invisible in the tool list.

The fix belongs on the server side — the render tools should reply the way the others do, with the metrics as a JSON text part — and the
probe's reading is then ordinary. It is worth doing before the example library (workstream 5), because a client that cannot parse a render
reply cannot use `get_energy_curve` either.

## The mono verification: the field was already there, and the fix attempted for it was not

Reading `render_song`'s handler before editing it — which is the rule the previous round broke — shows it returns the **whole render
result**:

```ts
return { ...(result as unknown as Record<string, unknown>), songId: song.id, totalSteps: … };
```

`RenderResult` already carries `channels: buffer.numberOfChannels` (the worker has reported it since it was written) and `sampleRate`. So
the channel count **is** returned, the probe **does** read it, and the change attempted in the previous round — adding `channels` to a
hand-written return object — was aimed at a return object that does not exist. It went into `export_ableton`'s handler instead, broke
the type check, was committed anyway, and was reverted.

Two lessons, both recorded rather than smoothed over: **the anchor `sections: clips.length` exists in more than one tool**, and **a
red type check is not a thing to commit past** — the round after a revert is worth spending on reading the code instead of repairing the
guess.

What the `? channel(s)` in run 36287591164 therefore needs is one more run with the probe as it now stands, not another code change.

## Workstream 4's harmony half is smaller than the report assumed

The evaluation asks for a "harmony minimum set" — `set_chord_progression` plus `suggest_progression` — as though harmony is absent. Reading
the tool list says otherwise, and this is the same pattern the earlier items followed:

* **the reading half exists**: `list_chord_progressions` and `get_chord_progression` are declared tools over a committed progression
  library (`mcp/registry.ts`); an agent can already ask what progressions exist and what one contains;
* **the writing half is one op**, not a subsystem: `apply_pattern_ops` already carries `set_pitch` and the `chords` lane exists, so
  `set_chord_progression` belongs there as a **deterministic, serializable operation** — which is also what the evaluation's own
  recommendation 12 asks for ("a deterministic, serializable pipeline reused for rhythm and melody").

The design that follows from the split: the **op** takes concrete chords (`{ op: "set_chord_progression", chords: number[][] }`) because
`mcp/pattern.ts` is pure and cannot reach the library, and the **tool layer** resolves a progression id to those chords before applying
it. That keeps the operations replayable without the library, and keeps the library the single source of what a named progression is.

`suggest_progression` is the genuinely new half: it needs a key and a mood and a rule for voice leading, and nothing in the tree does
that today.

## Workstream 3, the 8 kHz render: what is established, and the one check that gates it

Reconnaissance rather than code, because a head-less render at the wrong rate is worse than a slow one:

* `src/audio/WavExporter.ts` **accepts** `sampleRate` (`:63`) and uses it for the render's length and the WAV header (`:290`, `:319`),
  so the option exists and is not decorative;
* the MCP render path calls `wav.renderPatternOffline(pattern, { … })` (`mcp/render/worker.ts:162`), so passing a rate through is a
  one-line change on that side;
* **but `src/` contains exactly one `new OfflineAudioContext` — in `AnatomyKickEngine.ts:658`, which is unrelated.** The context that
  `renderPatternOffline` renders into is therefore constructed some other way (an alias, or through a helper), and that is the check
  that has to happen first: if the context's own rate follows `options.sampleRate`, an 8 kHz analysis render is a small, honest slice;
  if it does not, the option **relabels the file** and any 8 kHz analysis would be reading audio at the wrong speed — a bug worth
  finding on its own terms before `analyze_song` is built on top of it.

So the next step is one grep for the context construction (the alias form), and the two outcomes are both useful: a small slice, or a
real find.

## The region timeline is mostly built, and `docs/TRACK_ARRANGEMENT_PLAN.md` already says which half is not

The evaluation lists a "region timeline" as a missing capability. There is a committed plan for exactly that — `docs/TRACK_ARRANGEMENT_PLAN.md`
— and a census against it says most of the model is already in the tree:

| that plan's step | state |
|---|---|
| **1. model** — per-lane clip choice | ✅ `SongSection.slots?: Partial<Record<string, ClipSlot>>` (`src/types/song.ts:110`), whose own comment calls itself "the first step of the per-track arrangement" and addresses lanes by `track_id` — the additive shape, exactly like `arrangement` and `extraClips` |
| **2. normalise and flatten** | ✅ `songFlatten.ts:90` — `bar.slots?.[baseTrack.track_id]`, with the fallback the model describes |
| **4. export** | 🟡 WAV and MIDI follow the flatten and so follow per-lane choices; **ALS does not** — `src/audio/AbletonExporter.ts` mentions `sections` **zero** times, which is the plan's own complaint: the whole song becomes one clip |
| **3. the view** — track headers plus one row per lane | ⏳ not built; **this** is the region timeline the evaluation means, and it is UI work |
| **5. share and persistence** | ✅ the same path as `arrangement`, already in `.groove` |
| **6. phones** | a declared capability boundary, not an omission |

So the region timeline is **not** a model gap — the model landed with `slots` — and what is left is concrete and independent of the `track_id`
question that track factory raises. Two pieces:

* **ALS per-section clips**: pure logic, unit-testable by counting clips, no audio touched, no schema decision needed. The plan calls it the
  remainder of B4, and it is the obvious next slice;
* **the arrangement view**: track headers and a row per lane, which is UI work with its own risk.

**The clip-count criterion I was about to write already exists too.**

`src/test/AbletonExporter.test.ts` has a block for exactly this — `describe("Ableton exporter · the clip shape (stage 5's ALS item)")` — and in
it:

```
it("writes exactly one MidiClip today, at time zero")     # :248
it("fills a scene per clip and leaves the rest empty")     # :283
```

The first is the default path (no `clips` given → one clip, at zero), the second is the multi-clip path with a `clips` array — which is the
count criterion, written and passing. So the sixth time this plan has gone looking for work the report implies and found the work already
done and already held to a test.

**What that means for workstream 6's region-timeline item: the non-UI half is closed.** The model (`SongSection.slots`), the flatten, the
fallback semantics, the byte-identical guarantee when no lane overrides, and the per-section ALS clips are all present **and tested**. What
remains is the **view** — track headers and a row per lane — which is UI work with its own risk, and which the evaluation is right to call
missing.

**And the "ALS writes one clip" remainder is done too — my own grep said otherwise.**

`docs/TRACK_ARRANGEMENT_PLAN.md` complains that `AbletonExporter` writes the whole song as one clip and "has no `sections` handling". That was
true when it was written. It is not true now:

```ts
clips?: Array<{ pattern: SequencerPattern; name?: string }>;                  // AbletonExporter.ts:32
const clipsForExport = options.clips?.length ? options.clips : [{ pattern, name: undefined }];   // :344
const clipName = options.clips?.[idx]?.name;                                  // :565
```

and the fallback is documented as "the single pattern in scene 0 — which is what this exporter has always produced, **byte for byte**", which is
the additive shape this project keeps using. The MCP tool already fills `clips` from `song.sections`, so per-section clips exist today under a
different name.

The lesson is the one this plan keeps relearning: **a grep for `sections` in that file returns zero, and zero was the wrong answer** — the
concept is there under the name the exporter chose. Naming is not evidence; behaviour is.

What that leaves is not code but a **criterion**: nothing in the suite appears to assert the count, so "three sections export as three clips" is a
claim without a test. Writing it is the next slice, in the exporter's own test file, read first.

**And the acceptance line is not just written down — it is a test.** `src/test/sectionLaneSlots.test.ts`:

```
it("flattens byte-identically when no lane names a clip")           # :67
    expect(JSON.stringify(withField.pattern)).toBe(JSON.stringify(without.pattern));
    expect(withField.totalSteps).toBe(without.totalSteps);

it("falls back for a lane the named clip does not have, rather than taking another lane's steps")   # :75
    expect(Array.from(percussion.steps), "A's percussion, not B's kick lane").toEqual([0, 0, 1, 0]);
```

The first is exactly the property the plan demanded ("this has to be written as a test, not believed"), and the second is the subtle one the
model's own comment warns about — a lane the named clip does not contain must fall back rather than silently take another lane's steps,
which is a bug that would be invisible in a mix and obvious in a stem.

So the region timeline's model half is **present and held to its stated property**, which makes the remaining work smaller than the census
alone suggested. What is left is the two pieces named above, and the ALS one is next.

The plan also wrote the acceptance line for this work in advance, and it is the one to hold: **a song with no per-lane overrides must render
byte-identically to today**. With the model already in place, that test should exist — checking whether it does is part of the next slice, and
if it does not, writing it is worth more than the feature.

## Track factory is a schema change, and the real gap is multiplicity

Reading before writing, and this is the fourth time in this plan that reading changed what the work is:

* **`track_id` is a closed union of eight kinds** — `'kick' | 'snare' | 'hihat' | 'percussion' | 'bass' | 'chords' | 'lead' | 'fx'`
  (`src/types/genre.ts:50`) — not an open string;
* **lanes are addressed by kind, not by identity**: `findTrack` is `pattern.tracks.find((track) => track.track_id === id)`
  (`mcp/pattern.ts:62`), and `copy_track` reports itself as `from → to` (`:263`). So a **second `lead` is unaddressable** — the first match
  wins, and no op can say which one it meant;
* the assumption is load-bearing, not theoretical: `mcp/examples.ts:55` finds `lead` this way, and so does anything that routes a lane to a
  voice, an instrument or a stem.

So "add a track" is **not** an op on top of the existing model; it is a change to the model. And the more useful framing is that the
limitation an agent actually hits is **multiplicity** — one lane of each kind, so a counter-melody, a second percussion line or a doubled
chord part cannot be expressed at all — rather than the absence of a button.

**The blast radius to read before deciding**, in the order it would be felt:

| consumer | why it matters |
|---|---|
| `validatePattern` (`mcp/pattern.ts`) | it is the gate every example and every op result passes; unknown lanes may already be rejected |
| drum routing and voices | `kick`/`snare`/`hihat`/`percussion` are not names, they are **roles** the engine routes to specific voices |
| GS-1 lanes | `chords`, `lead`, `fx` are the lanes the GS-1 path hosts; a second instance has to be given a host |
| the Ableton exporter | it writes one track per lane, so it needs a naming rule for a second |
| **the `.groove` format** | `project.patterns {A,B}` requires the pattern shape, and the v1 compatibility promise is that **v1 stays readable forever** — so any widening has to be additive in the same way `arrangement` and `extraClips` were |
| the URL share codec | it has a size budget, and a widened lane set is a schema version question there too |

None of that is a reason not to do it. It is the reason the work is written down before it is done: the last three times this plan looked
like N features and turned out to be one op (harmony, melody, prosody), this time it looks like one op and turns out to be a schema change —
and the schema is the one thing in this project with a written compatibility promise attached.

## Workstream 6's first prerequisite, measured: renders are deterministic to 0.005 dB

The determinism probe now runs in the audio scope, and its first CI run answers the question every other audio number depends on:

```
same page     #1  limiter worklet   hosts failed 0  RMS -9.053 dBFS  peak -1.3 dBFS
same page     #2  limiter worklet   hosts failed 0  RMS -9.053 dBFS  peak -1.3 dBFS
same page     #3  limiter worklet   hosts failed 0  RMS -9.053 dBFS  peak -1.3 dBFS
after reload  #1  limiter worklet   hosts failed 0  RMS -9.053 dBFS  peak -1.3 dBFS
after reload  #2  limiter worklet   hosts failed 0  RMS -9.053 dBFS  peak -1.3 dBFS
after reload  #3  limiter worklet   hosts failed 0  RMS -9.058 dBFS  peak -1.3 dBFS
```

So: **identical within a page, and within 0.005 dB across a reload** — which is the golden-render property, stated in the form this project
can actually measure. And every row names the limiter as **`worklet`**, which settles the drift the loudness re-record once refused to
publish: that was the **`DynamicsCompressor` fallback**, exactly as the probe's own comment hypothesised, and not a nondeterministic
engine.

**What that buys the rest of workstream 6**: a change that alters the sound now has a baseline to be measured against, and a change that
does not is expected to land inside 0.005 dB. PDC — the next piece, and the one that can make phase coherence worse — can be checked
against this instead of against an impression.

**And the declared number is 3 ms** — so the measured 10.408 ms decomposes.

`MASTER_LIMITER_LOOKAHEAD_MS = 3.0` (`MasterLimiter.ts:90`), and the worklet's latency is
`Math.max(1, Math.round((requestedLookaheadMs / 1000) * ctx.sampleRate))` (`:608`) — about 132 samples at 44.1 kHz — while the fallback sets
`latencySamples: 0` (`:582`). Against the measured baseline:

| path | declared | measured first sound |
|---|---|---|
| worklet | **3 ms** | **10.408 ms** |
| fallback | **0 ms** | not yet measured (the probe reports `hosts failed`, so it cannot force the fallback) |

So the shared 10.408 ms is **3 ms of limiter lookahead plus about 7.4 ms of everything else** — the drum voice's own start, the channel
strip, the graph — and that is a testable relation rather than a note: a future run that lands on the fallback should measure about 7.4 ms,
and a run that shows 10.4 ms on both paths would mean the declared lookahead is not being applied at all, which is the kind of bug this
table exists to catch.

**PDC's first concrete obligation**, therefore: compensate **3 ms** on the `worklet` path and **nothing** on the fallback — and the check
that it did is the pair (`limiterKind`, first sound), which the determinism probe is already halfway to printing.

**The limiter's latency is declared, and it differs by path.**

Reading the chain rather than measuring it first turned up the fact the table needs: the master limiter **declares** its latency —
`MasterLimiter.latencySeconds = latencySamples / ctx.sampleRate` (`MasterLimiter.ts:667`), exposed through
`AudioEngine.getMasterLimiterLatencySeconds()` (`AudioEngine.ts:1095`) — and the declared value is **0 on the `DynamicsCompressor`
fallback and non-zero on the worklet path** (`:583` versus the worklet's own). The comment there says it plainly: "the whole master bus is
delayed by this much on the worklet path (0 on the compressor fallback). Live playback and the offline bounce are delayed identically, so
the exporter-parity rule is unaffected".

Two consequences, both worth having before PDC is written:

* **PDC has to compensate one path and not the other.** A mix rendered on the worklet and one rendered on the fallback are shifted relative
  to each other by exactly that latency — which is the same asymmetry the determinism probe reports per row (`limiter worklet` in every line
  of its first run) and the same one the loudness re-record tripped over;
* **the declared number should be read in the browser, not from a grep.** The value is computed from `ctx.sampleRate`, so the honest way to
  put it in the table is for a probe to print `limiterKind` and `latencySeconds` together — the pair, because either alone is misleading.
  That is the next slice, and it is the reason the measurement rides in the audio scope rather than in a unit test.

**Second prerequisite, first row measured: the FX rack costs no latency.**

```
fx rack latency : first sound at 10.408 ms bypassed vs 10.408 ms with the rack (44100 Hz)
```

Identical to the millisecond across two renders of the same song, one through the rack and one past it — so **PDC does not have to compensate
for the rack**, which is one worry retired rather than one number collected. The 10.408 ms that both share is the rest of the path (the drum
voice's own start, the channel strip, the master limiter), and it now has a baseline: whatever the individual rows turn out to be, they have
to add up to it.

Worth stating what the measurement can and cannot say: two renders that agree to a millisecond are evidence about a **10.408 ms** scale, so a
latency under about 22 samples (0.5 ms) would hide inside it. The buses' and limiter's own rows therefore need the impulse-in-a-single-effect
setup rather than this difference-of-two-renders trick, and that is the next slice.

**Second prerequisite still open**: a **latency table** for the effects PDC has to compensate (`ReverbBus`, `DelayBus`, the master limiter,
the channel strip). It needs its own probe — an impulse in, the first non-zero sample out — because a declared latency is exactly the kind
of number that drifts from the measured one, and the difference is inaudible until it is not.

## PDC's offline half, confirmed by a prediction that came true

The latency table predicted 10.408 ms − 3.0 ms = **7.408 ms** once the lookahead was compensated, and the first run after the change:

```
fx rack latency  : first sound at 7.415 ms bypassed vs 7.415 ms with the rack (44100 Hz)
```

**7.415 ms**, against a prediction of 7.408 — agreement to 0.007 ms, or about a third of one sample. That is the kind of check this project
keeps asking for and rarely gets: not "the change looks right" but **a number written down beforehand that the measurement then hit**. It
also settles what the compensation did: exactly the limiter's lookahead and nothing else, with the FX rack still contributing zero.

The same run answers the question the change deserved to be asked — did it damage the audio?

* ✅ **timbre**: "The 159 genres carry distinct, well-formed timbre fingerprints" — the baseline **held**;
* ✅ **loudness**: "still describes the code (3 genre(s) re-rendered, all within ±0.35 dB)" — so no re-record was needed;
* ✅ **determinism**, now **with PDC in the path**: six renders across a page and a reload, RMS −9.052 to −9.054 dBFS, "renders are consistent
  in this page";
* ⚠️ B7 unchanged and still marginal (1.5× against its control's 1.0×), which is the criterion flagged earlier — the arrangement/control
  contrast is not strong enough to be a gate, and re-anchoring it is still on the list.

A 3 ms shift is invisible to a whole-signal statistic, which is exactly why the baselines holding is *expected* rather than reassuring — and
why the latency row, which is a local measurement, is the one that could see it.

### The realtime half, and a parity the offline fix broke

Reading the realtime path before touching it turned up the same defect class a second time, and a consequence of last round's change that
has to be stated plainly.

**The realtime hook exists and is not connected.** `AudioEngine` carries `latencyCompensationMs` — default `0`, clamped to ±100 ms,
persisted with the other audio settings, exposed through `getLatencyCompensation()` — and the code's own comments describe it and two
neighbours as settings "**reachable only from the console**" (`AudioSettingsTab.tsx:12`, `SettingsModal.tsx:45`). Grepping every reference
outside the engine finds: a settings tab that reads it, a modal comment, and unit tests. **Nothing on the audio path reads it.** So it is
declared, stored, displayed and never applied — the same shape as the limiter latency itself, which is presumably not a coincidence: this
project's recurring defect is a number that is computed correctly and then not used.

**The consequence of the offline fix, which this round would have missed if it had gone straight to code.** The limiter's own comment says
"live playback and the offline bounce are delayed identically, so the exporter-parity rule is unaffected" — that was true **before** PDC and
is **false after it**. The offline bounce is now aligned (trimmed by the lookahead); live playback is still delayed by the same lookahead;
so they differ by **3 ms**, and the property the comment relies on no longer holds. That is not a reason to revert — trimming is the correct
behaviour, and a nominal event should land at its nominal time — it is a reason to finish the realtime half.

**What "finished" means, concretely**: realtime cannot trim, so it must **schedule earlier** by the compensation — which is precisely what
`latencyCompensationMs` is for. So the work is not a new mechanism but a connection: apply the knob to the scheduling path, and default it
to the limiter's latency when the worklet (rather than the fallback) is in the graph, with the user's value still winning when they set one.
The criterion is the pair already used elsewhere — `limiterKind` beside a measured first-sound — plus the parity statement itself: **live
and offline must agree again**, which is a check that can be written before the change.

**Still open in workstream 6**: the realtime path (a `DelayNode` with a crossfade, so live playback is aligned too), track factory, folder and
summing tracks, the region timeline, audio tracks and SVS.

## B7's gate has been red, and the control says why the fix is a paired comparison

Reading the criterion rather than the verdicts:

```js
const floor = report.alignedFloor ?? selfDistanceA;   // two bars of the same section: the method's own noise
const ratio = floor ? distanceAB / floor : Infinity;
console.log(`${ratio >= 3 ? "✅" : "❌"} the two sections differ by …`);
```

**The gate is `ratio ≥ 3`** — and every CI reading in this session has been **1.5× and 1.7×** for the arrangement against floors of 4.8–6.1, with
the **control** at 1.0× and 1.2×. So the gate has been **failing**, not "marginal": the earlier note in this file that it "closed on 2.0×" was
an understatement of the gap, and the ✅ on the arrangement step in the logs is a different check in the same step.

The control is the important part, and it is the reason the fix is not to lower the threshold. The probe takes `controlLoop`, so the same
measurement runs on material where **no section change happens** — and there its ratio is **1.0–1.2×**, which is what this method's noise
floor looks like end to end rather than in one window pair. Two numbers follow from that:

* the section change B7 is looking for is **real but small**: 1.5× against a control of 1.0× means the arrangement differs from itself by
  about **half again** what the method differs from itself on unchanged material;
* an **absolute** threshold of 3 cannot express that, and picking one that passes today would be fitting the gate to the data — the failure
  mode this project keeps recording.

**So the hardening is to replace the absolute threshold with a paired comparison**: run the probe on the arrangement and on the control in the
same CI invocation, and gate on `ratio_arrangement ≥ k · ratio_control` (k = 2 as a starting point, stated as a choice rather than derived),
with **medians over repeats** on both sides because a single 40 ms-window measurement is exactly the kind of number that moves by a factor of
1.5 between runs. That is a stronger statement than `ratio ≥ 3` ever was: it says the arrangement carries a change the control does not, which
is the actual claim.

**What this round did not do**: change the gate. Replacing a threshold is a decision about what the project is willing to call evidence, and it
belongs in the plan before it belongs in the probe — which is where it now is.

## B7's first honest verdict: no evidence — and the measurement is the reason, not the music

The paired gate's first run:

```
❌ the two sections differ by 5.04 dB/band against a time-aligned floor of 4.31 (ratio 1.2×; frame-split 5.32)
❌ the two sections differ by 7.17 dB/band against a time-aligned floor of 5.31 (ratio 1.4×; frame-split 7.79)
❌ B7 paired: arrangement 1.17× vs control 1.35× = 0.86× of the control (gate: ≥ 2×)
```

**The control differs from itself more than the arrangement does** — 1.35× against 1.17×, or **0.86× of the control**. So B7's claim that a
section change is audible *as a change* has **no support from this measurement at all**, and the ✅ that used to appear on that step belonged to a
different assertion (the arrangement rendered). A gate that has been red for its whole life, replaced by one that says why.

**What it does not mean**, and this matters more than the verdict: it is **not** evidence that the audio does not change between sections. It is
evidence that **this measurement cannot see the change**, and the diagnosis is in the metric itself.

The probe compares **mean spectra** — 13 bands averaged over each section's windows. A section change is a **temporal** rearrangement: the same
kit, the same instruments, the same mix, playing in a different order. Its average spectrum is therefore very nearly the same, and the ratio
lands at ~1 — while the method's own window-to-window variation (the control, and the two-bars-apart floor) is of the same size. **The metric
throws away exactly the dimension the feature lives in**, which is the same failure this project has recorded four times in other guises: a
detector that fires on the music, an analysis that reads silence, a proxy blind to its band, a command that silently did nothing. This one is
**a mean that is blind to time**.

**So the honest next step is a measurement that can see it**, not a lower factor and not a musical change:

* compare **time courses** rather than means — per-bar (or per-beat) energy, onset counts or band energy sequences, correlated across the
  section boundary. A rearrangement changes *when* things happen, and a sequence comparison is sensitive to precisely that;
* keep the same control discipline: the control's own time-course self-difference is the floor, and the paired gate is again a ratio of ratios;
* and if that measurement also says no evidence, then the finding is about the arrangement — which is a **musical** decision, and not one to make
  by instrument.

`check_b7_pair.mjs` stays as it is in the meantime. It is failing, and it is failing correctly; the number it replaced was passing nothing.

## A third evaluation (dev-branch composing report): six claims, checked

A third report arrived, written from composing on `dev` rather than from reading it, and it is the most useful of the three because its claims
come with reproductions. Checked one by one:

| claim | verdict |
|---|---|
| **1. long renders risk client RPC timeouts**; add a `render_preview_clip` | **true, and already measured**: a 44.1 kHz render took **24.4 s** on a loaded CI runner and 5–7 s cold, while the **8 kHz mono analysis render takes 1.8 s** (13.5×). A short-render budget exists in `docs/MCP.md`; a **named preview tool does not**, and the part that actually exists — `render_audio` on a pattern, `render_song` on a one-section song — is not discoverable from the tool list |
| **2. no continuous automation across sections** | **true**: per-step values and a per-section `velocityScale` exist; a continuous envelope crossing a section boundary does not. The task notes call this a *composition* primitive, which is the right frame |
| **3. vocal lead is not first-class; no `set_vocal_melody`** | **half stale**: `validate_prosody` exists as of this plan's workstream 4 and takes tones, pitches and optional syllable text — but it only **checks**; nothing binds syllable text to notes in one call, and the report's ask is the binding |
| **4. GS-1 is not in the export pipeline** | **true**, and it is the owner's own synth item. Nothing in this plan contradicts it |
| **5. `get_loudness_report` reads but cannot act** | **true, and the smallest of the six to close**: the measurement exists (`integratedLufs`, `truePeakDb`) and a per-genre `loudnessTrimDb` already exists, so a write tool has both the number and the mechanism |
| **6. clip reference semantics are undefined** (destructive edit vs make-unique) | **true and important**: `set_clip` on a slot two sections share does not say whether it edits both. Note this is a **behaviour** decision, not a schema one, so it does not wait on the `track_id` question |

**And one inference to correct**, because it is about evidence rather than features: the report reads commit `a22bcd9` ("the analysis render never
worked; the budget table says so") as proof of "hangs and inconsistency in headless environments". The commit says something narrower and more
specific — the page callback named a variable that exists only on the Node side, so `render_song` threw
`ReferenceError: options is not defined` and **returned fast**; the failure looked like a very quick render, not a hang. Reading commit subjects as
evidence of a defect class is how a report acquires a claim its source does not support.

**Ordering, if the owner wants this report worked next** — smallest closed loop first: (5) the loudness write tool, (6) copy-on-write
semantics for `set_clip`, (1) a named short-render tool plus a discoverable budget, (3) the syllable-binding interface, then (2) automation lanes,
with (4) staying the owner's synth project.

## The loudness tool's arithmetic is right and the render ignored it — a criterion doing its job

The first audio-scope run of the acceptance:

```
❌ normalize_loudness : -12.63 → -12.674 LUFS (target -14, trim -1.37 dB, target, peaks -1.3)
```

Read it carefully, because everything except one step is correct:

* the song measures **−12.63 LUFS**, already **louder** than the −14 target, so the trim must be negative: `−14 − (−12.63) = −1.37 dB` — and
  the tool reports exactly that;
* the peak is **−1.3 dBTP** against a −1 ceiling, so the headroom bound is **+0.3 dB**; the applied trim is therefore the target bound, and
  `limitedBy: "target"` is the right answer;
* **and the re-render did not move**: −12.674 is −12.63 within measurement noise, where a −1.37 dB trim should have landed at ≈ −14.0.

So the tool's arithmetic, its bound and its reporting are all right, and **`loudnessTrimDb` is not reaching the graph through the MCP render
path**. This is the second time this exact shape has appeared — the `sampleRate`/`channels` options were also plumbed, type-checked, and inert,
because the value has to cross three layers (the tool, the Node side of `page.evaluate`, and the page's own parameter list) and each layer names
it differently. The acceptance check is what noticed, which is the entire reason for writing it before believing the tool.

**The read is done, and it clears the clamp.** `masterGraph.ts:268-269` sets `MASTER_TRIM_MIN_DB = -12` and `MAX = 12`, and
`WavExporter.ts:332` combines an explicit option as
`Math.max(LOUDNESS_TRIM_MIN_DB, Math.min(LOUDNESS_TRIM_MAX_DB, optionOrGenreTrim))` — so −1.37 dB passes through untouched, and an explicit option
**replaces** the genre's own trim rather than folding against it. The exporter is not the problem.

That leaves a contradiction worth stating plainly rather than guessing at: all four layers are verifiably present — `RenderOptions.loudnessTrimDb`
and the page-call field, the page callback's parameter list, the spread into `renderPatternOffline`, and the exporter's use of it — and the
measurement says the output did not move. Reading has now cleared the clamp and the exporter, so **the next step has to be an experiment rather
than another read**.

**The decisive experiment, and it is one CI run**: ask for **−12 dB** instead of −1.37. That separates the two remaining explanations, which no
amount of reading will:

* if the output **still** does not move, the option is **inert** somewhere between the tool and the graph, and the place to instrument is the page
  (print the value the callback receives, exactly as the `ReferenceError` was caught);
* if it **does** move by 12 dB, then the plumbing works and the −1.37 dB result needs a different explanation — most likely that the measurement
  is taken after a limiter that holds the level, which would itself be worth knowing.

An extreme value is the honest instrument here: it is the difference between "the effect is smaller than I expected" and "there is no effect",
and those two have opposite fixes.

: `WavExporter.ts:325-345` shows how `loudnessTrimDb` is combined (it is a `Math.max(...)` with a
condition on the option being finite), and the question is whether that combination lets a **negative** trim through or folds it against the
genre's own trim. A negative trim is the ordinary case for a mix that is already too loud, and the run above is that case.

**Also from the same run**, and worth recording because it is the budget table's third data point: the texture probe's renders took **23.6 s,
7.9 s and 8.4 s** while the **8 kHz analysis render took 1.8 s** — a factor of 4–13 between the full-rate renders and the analysis pass, on the
same material, in the same run.

## Clip slots are song-global, so three verses cannot have three melodies — and the fix needs no schema change

Reported from composing, and verified in the tool: `set_clip` is described as "set **a slot's** clip (A–D) … **Replaces what is there**", and a
section stores a **slot reference** (`add_section`), so two sections pointing at slot B are the **same clip**. A song whose verses have
different lyrics therefore cannot give them different melodies: the third verse must reuse the first's clip, and this session's composer worked
around it with `transpose` and `velocityScale` — which is legitimate technique (motif repetition and transposition are real compositional
tools) but is a **product limit**, not a musical one. The earlier evaluations did not hit it because their verses repeated their lyrics.

This is the same root as the dev-branch report's claim 6 ("destructive edit or make-unique"), stated from the other side: that report asks what
`set_clip` should **do** when a slot is shared, and this reports what a composer **cannot** do because it is.

**And the fix needs no schema change**, which is the part worth noticing:

* `ClipSlot` is already `"A" | "B" | "C" | "D"` and `set_clip` already accepts all four (`mcp/registry.ts:702`), so there are **two free slots**
  in the ordinary case;
* the `.groove` format already carries the slots, and this project's editor gained all four in workstream 3a of this plan;
* so **make-unique is an allocation plus a repoint**: copy the clip into a free slot, point **that one section** at it, and leave every other
  section where it was. No widening, no migration, and nothing that waits on the `track_id` question;
* with all four slots in use the operation must **say so** rather than overwrite — a song that needs five distinct clips needs a wider slot set,
  and that is a deliberate report rather than a silent loss.

The missing primitive today is the repoint: `add_section` adds, `duplicate_section` duplicates, and **nothing changes an existing section's
slot**. That, plus the copy-on-write decision, is the work.

## The loudness tool: closed, and the answer is about the graph rather than the number

Four runs, three hypotheses, and the measurements decided:

| run | what it showed | the explanation it killed |
|---|---|---|
| `-14` (≈ −1.37 dB) | the mix moved **0.04 dB** | "the option is inert" looked right, but the `-24` run disproved it |
| `-24` (≈ −11.37 dB) | the mix moved **4.97 dB**, the peak **1.6 dB** | a **wrong base** looked right — and the next run killed it (this genre's trim is 0) |
| iterating | the trim drove to **−3.916 dB**, the mix moved **0.45 dB**, the **peak never moved** | "a further pass will fix it" — the peak column says otherwise |
| final | `masterLimiter`, **4 passes**, peaks **−1.3** at every one | — |

**The answer**: the master **true-peak limiter** is holding the output. The peak sits on its ceiling across four different trims, so a trim
**upstream** of it mostly **relieves limiting** rather than lowering the level, and no upstream trim can set loudness on this chain. That is a
property of the graph, **measured** — and it is a more useful answer to "get me to −14 LUFS" than a number that quietly missed, because it tells
the caller which lever to look for next (a limiter target, or gain **downstream** of it).

`normalize_loudness` therefore reports three outcomes — reached the target, stopped by the peak ceiling, or **held by the master limiter** — and
the acceptance check accepts the third **only when the readings prove it**: the peak must be identical across every attempt. A tool that missed
the target and blamed the limiter fails, which is the difference between reporting a limit and excusing a bug.

**What the reading never did**: three plausible explanations came from reading the code and all three were wrong. The peak column — one number
the tool already returned — decided it. Recorded here because this plan has now spent four rounds on a tool whose arithmetic was right from the
first attempt.

## The dev-branch report's items 1 and 5, closed with numbers

```
✅ normalize_loudness : -12.63 → -12.674 LUFS (target -14, trim -1.37 dB, masterLimiter, 2 pass(es), peaks -1.3)
✅ render_preview_clip : 1.45s at 8000 Hz, 1 channel(s) (14.40s of audio)
```

**Item 1** — the timeout risk and the preview tool. A preview of a section renders **14.4 seconds of audio in 1.45 s** at 8 kHz mono, against
**6–24 s** for a full-rate song render measured in the same runs. That is the recommendation's own argument, stated as a number: an agent
debugging a two-bar change does not have to spend the budget of a client's 30 s timeout, and **the same run is evidence for why it matters** —
one round earlier a `tools/call` that rendered **did** time out at 30 s, in this project's own probe, because `normalize_loudness` was doing up to
four renders inside one request. The preview's acceptance (`≤ 3 s`) and the loudness loop's default (`passes: 1`) come from the same lesson seen
from two sides.

**Item 5** — the loudness tool, and the honest limit. `masterLimiter` with **2 passes** and the peak identical across both: the tool reached the
ceiling-bound conclusion and **proved it with its own readings**, so the acceptance accepts it. What a caller gets is not a number that quietly
missed: it is a measurement with an explanation, which is what "get me to −14 LUFS" deserves on a graph where the master limiter holds the
output.

**Both were reached inside the probe's timeouts, which is the point of the `passes` change** — and both are now green in CI rather than green in
an argument.

## The automation gap is narrower than the report says: a ramp exists, one parameter wide

Read before writing, and the third evaluation's second item narrows the same way the others did:

* **a per-section ramp already exists**: `SectionOverrides.velocityRamp?: [number, number]` (`src/types/song.ts:67`), documented as "the velocity
  multiplier at the section's first and last pass: an 8-bar build is `[0.6, 1]`" — so a build **across a section's passes** is a thing the
  arrangement can already ask for;
* it **multiplies** `velocityScale` rather than replacing it ("a quiet build" and "a build" compose), and it is clamped to `[0, 4]` with a stated
  reason: a share link must not be able to turn a section into a 1000× gain;
* **a riser into the next section also exists** — a flag that puts "a fill-shaped hit on the clip's **texture lane** (`fx`), rising across its
  steps" (`:70`).

So "continuous automation across sections is missing" is **true of the parameter set and not of the idea**:

| what the report asks for | state |
|---|---|
| a build inside a section | ✅ `velocityRamp` |
| a riser into the next section | ✅ a flag, on the `fx` lane |
| automation of a **non-velocity** parameter (the report names filter cutoff and reverb wet) | ⚠️ nothing |
| a ramp that is provably **continuous across a boundary** | ⚠️ and there is a comment at `songFlatten.ts:171` saying a section's `velocityRamp` "would not reach" something — which is exactly the seam to read next |

**The smallest honest slice, therefore**, is not a new automation model: it is (a) the boundary case that comment points at, measured, and (b) one
more parameter if the render path exposes one — not a general envelope system that pretends to cover parameters it cannot reach. Both are
additive and neither needs the `track_id` decision.

**And the seam is closed, and the remaining gap is structural.**

`songFlatten.ts:171`'s "would not reach it" turns out to describe a **bug that was already fixed**: the `filled` clause a few lines below builds the
velocity array whenever a section carries a fill, precisely so the section's `velocityRamp` **does** reach the hits the fill adds. So of claim 2's
four parts, three are present — the per-section ramp, the riser, and the fill's velocity — and only the parameter set is narrow.

Then the question is which parameters the render path actually exposes, and `MasterGraphOptions` answers it: `loudnessTrimDb`, **`masterMakeupDb`**
("one number for the whole record, applied identically in the live graph and the offline exporter, so parity holds"), the mastering bus
compressor and its release. Those are whole-mix parameters — and **every one of them sits upstream of the master limiter**.

That collides with what item 5 measured: the limiter **holds the output**, so a trim upstream of it mostly relieves limiting instead of changing
the level. **Automation of an upstream parameter is automation that looks like it does nothing**, and the graph's own option list is evidence for
that, not a guess.

**So claim 2's honest conclusion is structural rather than a missing feature**: builds and risers are expressible (and clamped, and composable with
`velocityScale`); automating a whole-mix parameter would be absorbed by the limiter; and per-track parameters (the channel strip) are upstream of it
too. A general automation lane needs a parameter **downstream of the limiting** to be worth having, and the graph does not have one today. That is
worth writing down as the answer instead of shipping an envelope system whose first use would be reported as "it did nothing" — which is exactly
the report item 5 experience, one level up.

**What I did not do this round**: write the model. Reading changed what the work is for the fifth time in this plan, and the difference here is
that the feature is *narrower* than advertised rather than already built — which is worth knowing before spending rounds on it.

### Correction: the panel exists — I searched one directory and concluded from it

The section above says `src/features/arrangement/` "contains exactly one file … and there is no `ArrangementPanel.tsx`". The first half is true and the
conclusion is **wrong**: `ArrangementPanel.tsx` lives in **`src/components/arrangement/`** (555 lines, `ArrangementPanelProps { song, selectedId,
onSelect, onChange, onClose, onGenerate? }`), which a directory-scoped `ls` could not see.

So the view **does** exist, my "the view does not exist at all" was a claim made from the wrong evidence, and the work is **smaller** than that
section says: `trackRows` plus `TrackRows` mount into a panel that already takes the `song` they need. This is the **third** time in this plan that a
name- or location-scoped search produced a confident wrong answer (a `sections` grep that returned 0, and a `render_song` field that arrived under a
different shape), and the lesson is the same each time: **search by behaviour, not by where you expect the file to be**.

The section is left in place rather than rewritten, because the mistake is the most useful part of it.

## The arrangement view: the logic exists and has no view at all

Following `docs/TRACK_ARRANGEMENT_PLAN.md`'s step 3 to its file turned up something the plan's own text hides: **`src/features/arrangement/` contains
exactly one file, `songEdit.ts`, and there is no `ArrangementPanel.tsx`** — the plan names a component that does not exist, and `songEdit`'s
functions have **no consumer in `src/components/`**.

That changes the size of the work, in the direction the plan did not expect. The command layer is complete and pure:

```
sectionRegions(song)            arrangementBars(song)          moveSection(song, id, toIndex)
resizeSection(song, id, bars)   duplicateSectionInPlace(...)   dropIndexForBar(song, bar)
applyArrangementCommand(...)    commandForKey(key, shift, meta) setSectionLabel(song, id, label)
```

So a section timeline's **arithmetic, keyboard model and commands are already built** — and nothing renders them. Building "track headers plus a row
per lane" is therefore not extending a panel; it is building the **first** view of a model that has been complete and unused.

**The smallest honest slice, given that**: a **read-only** track-row view — one row per lane, each stage showing the clip slot that lane plays (from
the section's `slot` and its per-lane `slots`) and whether it is muted, laid out with `sectionRegions`. No drag, no new state, no new command: those
exist and can come second. It makes the per-lane arrangement **visible** for the first time, which is the thing the evaluation is actually asking
for, and its criterion is cheap — a render test that the rows show the slots the song says, plus the standing rule that **audio does not change**,
because a view cannot change it.

**What this round did not do**: write the component. Two reads in a row have now moved the size of this item in opposite directions — the model was
already built (smaller), and the view does not exist at all (larger) — and it is a new component tree rather than an edit to one, so it deserves a
round with the context to write it properly rather than the tail of one.

## The region timeline is complete — and the one thing missing is a way to *set* a lane's clip

Reading the panel instead of assuming, as the last correction taught: **editing already exists and is wired**, so this item is not "the view needs
commands":

```
resizeSection(song, drag.id, …)            :167   applyArrangementCommand(song, id, command)   :187
moveSection(song, id, dropIndexForBar(…))  :172   commandForKey(event.key, shift, meta)        :199
…→ onChange({ sections: next.sections, gesture: "arrangement:move:<id>", continuous: true })   :173
setSectionLabel …  :219        the mute toggle …  :224
```

Every structural edit goes through `onChange` with a **named gesture** and a `continuous` flag, which is what makes a drag undoable as one action rather
than fifty. So the full list for this item is now present and tested: the model (`SongSection.slots`), the flatten, the fallback semantics, the
byte-identical guarantee when no lane overrides, per-section ALS clips, the command layer, dragging, and the keyboard model.

**What my work added, and what it exposed.** The only genuinely missing piece when I started was visibility — `slots` was expressible and invisible —
and `TrackRows` supplies it. But reading this far also shows the **reverse** gap, which no one has stated before because nothing displayed the feature:
the panel can **show** a lane's own clip (`:331`'s lane renders the section's regions) and cannot **set** it. `songEdit` has no lane-slot setter and no
cell has a control.

That is the honest remaining slice, and it is small and additive: a command-layer `setSectionLaneSlot(song, id, trackId, slot | null)` beside its
siblings, and a control on the cell `TrackRows` already draws. Both keep the existing discipline — pure function in `songEdit` with its own test,
`onChange` with a named gesture, and a view that computes nothing.

## The red layer gate: what it is, why it is right, and the two ways this project has fixed it before

CI's `verify` fails on two undeclared violations that predate this session:

```
[R2] src/hooks/useCoverWarmup.ts -> src/mobile/genreArt — logic imports ui
[R2] src/hooks/useLabelArt.ts    -> src/mobile/genreArt — logic imports ui
```

`git log` puts the last change to `useCoverWarmup.ts` at `143d4cd`, an earlier session's cover warm-up refactor, so **the gate has been red for a while
and nobody read it** — which is worse than a failure, because a gate that is always red stops meaning anything.

**The rule is explicit** (`scripts/check_layers.mjs:42`): "R2 logic must not import ui (components, views, ui primitives). **Types are not exempt**". The
two hooks are logic; `src/mobile/genreArt` is classified ui; and the project's `ALLOW` list is **deliberately empty**, with a comment recounting the two
times it was not — and both were fixed the same way, by **inverting the dependency** rather than excusing it: "the loader now takes a resolver that
`src/app/installCustomGenreResolver.ts` supplies", and "`useAppShortcuts.ts` importing `NavTab` from a component (since moved…)".

**What the two hooks actually import** decides which inversion each needs:

| import | what it is | the honest fix |
|---|---|---|
| `genreCoverCandidates` (in `useLabelArt`) | **pure string building** — no DOM, no React | **move it down** to `src/utils/`, and have `genreArt` re-export it so its existing consumers do not move |
| `preloadGenreCover` / `preloadGenreCovers` (in `useCoverWarmup`) | touches `Image`, i.e. a **platform capability** | moving it does not help: R3 forbids logic reading platform capabilities too, so the hook must **take the loader as an argument** — the same shape as the resolver fix |

So neither fix is an allow-list entry, and neither is a rewrite: one function moves down a layer, one hook takes a parameter. That the project already
fixed this exact rule twice by inverting the dependency is the strongest evidence for how to fix it the third time.

**Not done in this round**, deliberately: it means editing two modules this session has never read, at the tail of a round. The next round reads
`genreArt` and both hooks first — which is the practice that has held up all session and the one whose absence produced the wrong "the view does not
exist" claim.

## The fourth report's kick-phase claim: the file is wrong, the API is right, and the criterion is written

The report cites `src/dsp/kickEngine.ts` for a −8 dB phase null at 38 Hz when two sub kicks are stacked. **That file does not exist**, so the number has no
source in this tree. But the pieces needed to test the claim do:

* the presets are real — `KICK_PRESETS` (`src/audio/AnatomyKickEngine.ts:122`), with `berlin-orphic` at `basePitch: 42` (the report says 40 Hz);
* `resolveKickPresetParams(presetId)` (`:323`) turns a preset into `SomaticKickParams`;
* `synthesizeAnatomyKickVoice(ctx, dest, time, vel, presetIdOrParams, …)` (`:813`) schedules **one voice into a context the caller owns** — which is the
  part that matters here: two calls with two presets and the same `dest` **are** the stacking the report describes, so no new engine is needed;
* the engine already renders offline (`exportWav`, `:654`) and the test suite drives it with a fake context (`src/test/AnatomyKickEngine.test.ts:295`),
  which is why the existing tests say nothing about phase: **a fake context has no samples to cancel.**

**The criterion, written before the probe exists**, so the answer is a measurement rather than a reading of the report:

1. in one page, render three buffers offline at 44.1 kHz — preset A alone, preset B alone, and both scheduled into the same destination at the same
   time;
2. measure **narrow-band energy** (a Goertzel at 30–45 Hz, plus the specific 38 Hz the report names) in the first **60 ms**, which is the window the claim
   is about;
3. report `E(A)`, `E(B)`, `E(A+B)`, their ratio to `max(E)` in dB, and the depth at 38 Hz relative to the louder of the two alone;
4. **classification, stated in advance**: *cancellation* if `E(A+B)` sits **below** `max(E(A), E(B))` by more than 1 dB at 38 Hz; *reinforcement* if above;
   **inconclusive** if `E(A)` and `E(B)` differ enough that level dominates the comparison — the same three-way honesty the loudness tool ended up with.

If it is cancellation, the fix has a criterion to satisfy (align the peaks and re-measure); if it is not, the report's item is retired with a number
instead of an argument. Either way the answer comes from the engine, not from a file that does not exist.

## The kick-phase claim, measured: the report was right, and the number is worse than it claimed

The probe ran in the audio scope:

```
❌ kick stacking : 0.2845 (berlin-orphic, basePitch 42) · 0.3663 (somatic-808-gravity, basePitch 36)
                  · 0.1787 stacked = −6.23 dB vs the louder single, 38 Hz −13.45 dB → cancellation
```

**Two sub kicks stacked lose 6.23 dB** of 30–45 Hz energy against the louder of them alone, and **13.45 dB at 38 Hz** — the frequency the report named, where it
claimed −8 dB. So the direction is confirmed and the magnitude is **worse than claimed**.

**And the drop is itself the proof, which is the part worth stating.** Two *independent* sources add in energy: a sum can never sit below its loudest component
when the two are incoherent — `√(a² + b²) ≥ max(a, b)` by construction. Measuring **6.23 dB below** the louder single therefore cannot be a level or
normalisation artefact; it can only be destructive interference between the two voices. Nothing in that path attenuates the sum (each voice applies its own
`volume`, and two voices into one destination add), so the finding does not need the engine's internals to be trusted — the arithmetic rules the alternatives
out.

**So the answer to the question this item was built to ask is: yes, auto phase alignment is worth building — and it now has a criterion to satisfy.** Align
the two voices' initial phase and the stacked band energy should come back **at or above the louder single** rather than 6.23 dB below it, with the 38 Hz
notch gone. That is a measurable acceptance line for a future change, written before the change exists, which is the same shape as PDC's prediction
(10.408 − 3.0 = 7.408 ms, measured 7.415).

Worth noting where the report was imprecise, since it affects how the feature should be built: it attributes the null to the two presets' "initial phase
happening to coincide at bar 0 and invert over the 30–50 ms window". The measurement says the interaction is real and large; **it does not say the mechanism is
initial phase**, and a fix should be built against the criterion (band energy of the stack vs the louder single) rather than against that explanation. If
alignment alone does not recover the energy, the next candidate is the frequency envelope of each preset, and the probe will say so.

## What is deliberately rejected

* **Audio in context** (`render_preview` returning audio data). The MCP keeps returning file paths plus an analysis summary; a
  three-minute buffer in an agent's context is the opposite of the token economy the report itself argues for.
* **Rubber Band** for time-stretch. The report flags its GPL licence itself; **Signalsmith Stretch (MIT)** is the proposal this plan
  accepts.
* **Re-doing the arrangement/schema work** under a "Schema v2 needed" banner: v2 exists, and the package format document already
  carries the compatibility commitment a versioning scheme would otherwise have to invent.
