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

## What is deliberately rejected

* **Audio in context** (`render_preview` returning audio data). The MCP keeps returning file paths plus an analysis summary; a
  three-minute buffer in an agent's context is the opposite of the token economy the report itself argues for.
* **Rubber Band** for time-stretch. The report flags its GPL licence itself; **Signalsmith Stretch (MIT)** is the proposal this plan
  accepts.
* **Re-doing the arrangement/schema work** under a "Schema v2 needed" banner: v2 exists, and the package format document already
  carries the compatibility commitment a versioning scheme would otherwise have to invent.
