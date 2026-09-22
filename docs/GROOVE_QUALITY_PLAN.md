# Groove quality plan — the listening report, verified

A second listening report on two exported masters (`chicago-blues_master_120bpm.mp3`,
`reggaeton_master_95bpm.mp3`) listed roughly twenty mixing and arrangement problems. This document checks each one
against the engine, the pattern data and the rendered audio, then lays out the work in the order that makes the
most of what already exists.

It is deliberately *not* a to-do list derived from the report: four of the report's technical premises are already
implemented, and the measurements below say which. The two workstreams (this and the skin/gate work) are
independent — nothing here touches CSS, and the gates added here do not overlap `probe:skins`.

## Method

Everything below comes from `scripts/analyze_export_audio.mjs`, which renders each genre through the app's **own**
offline engine, per track as well as mixed, and turns each claim into a number. It was extended for this report
with the *musical* metrics the listening complaints need:

| Metric | What it answers |
| :--- | :--- |
| `velocityByTrack` | "every note has the same velocity" → how many tracks carry one value |
| `pitchByTrack` | "the melody never moves", "the harmony is static", "the bass only plays roots" |
| `swingOffsetMs` | "it is dead straight" → where the off-16ths actually land, in ms, per stem |
| `duckDb` | "the bass fights the kick" → the bass RMS 25 ms *after* a kick onset vs 25 ms before |
| `midBandShareDb` | "the mids are hollow" → energy in the 200 Hz – 2 kHz bands |
| `panSends` + the resolved mix | what stereo and space the mix actually asks for |

Sample for the prevalence numbers: 24 genres across categories (15 rendered cleanly; the rest failed on
`--stem-tracks` combinations that do not exist in those patterns).

The **gate** (`npm run check:groove`) uses a fixed 12-genre sample instead, and its budgets are that sample's
measurements: **12/12** flat velocities, **11/12** inaudible sidechain, **12/12** near-mono, **11/12** hollow mids,
**5/12** static harmony, **2/12** cut tails. Its first calibration was wrong twice over — three of the twelve ids
did not exist and the analyser dropped them silently, so the budgets described nine genres. The analyser now names
unmatched ids rather than filtering them away.

## What the measurements say

### Confirmed

| Claim | Measurement | Scale |
| :--- | :--- | :--- |
| **Velocities are flat — "a MIDI dump"** | In chicago-blues and reggaeton, **six of eight tracks carry a single velocity** (kick 120, snare 115, bass/chords/lead/fx 100). Across the sample, **15 of 15** genres have ≥4 flat tracks. | library-wide |
| **The bass and kick collide (no usable sidechain)** | The ducking stage *exists* (`duckGain`, wired into the offline render) but measures **0.6 dB** on chicago-blues and **2.09 dB** on reggaeton; **14 of 15** sampled genres duck less than 1.5 dB. | library-wide |
| **It is effectively mono** | Channel correlation **0.9958 / 0.9993**; **15 of 15** sampled genres correlate above 0.98. Panning is implemented and the mix even asks for it (chicago-blues: chords −0.22, lead +0.22), but the *material* those values apply to is quiet and centred. | library-wide |
| **The mid-range is hollow** | The 200 Hz – 2 kHz bands hold **−8.4 dB** (reggaeton) and **−3.7 dB** (chicago-blues) of the total; **13 of 15** sampled genres are below −6 dB. | most genres |
| **The harmony never moves inside the loop** | The chords track has **one distinct pitch for the whole pattern** in both named genres; **6 of 15** sampled genres are the same. | common |
| **The melody barely moves** | Lead: **3 distinct pitches across a 4th** (81–86, 72–77) in both named genres. Not static, but narrow. | the named two |
| **No fills, no variation over time, no riser** | **Structural**: a genre *is* one pattern. `renderPatternOffline` repeats it `bars` times; there is no arrangement, section or fill concept anywhere in the types or the data. Every "add a fill in bar 4 / change the chord every 8 bars / build a riser" item needs that layer to exist first. | product gap |
| **Swing is declared but rarely felt** | chicago-blues declares **swing 35**, and the only measurable off-16th offset is −8.7 ms on the **chords** stem; its kick and hats play 8th notes, which a 16th-based swing does not touch. Reggaeton declares 5 (straight by design). | engine + data |
| **One genre cuts its tail** | detroit-techno ends at **−26 dBFS** in its last 50 ms (final peak −19.7 dBFS): the render stops while the sound is still going. | 1 of 15 |

### Refuted (the report's premise is already in the code)

| Claim | Reality |
| :--- | :--- |
| "No sidechain compression at all" | It exists — `duckGain` per track in `AudioEngine` **and** in `WavExporter`'s offline graph. It is too *shallow*, which is a tuning problem, not a missing feature. |
| "No panning" | Every track carries `pan`, the offline render applies it (`StereoPannerNode`, post-insert), and the mix table sets ±0.22 on chicago-blues and up to −0.42 on reggaeton. Too subtle, not absent. |
| "No reverb or delay" | `sendA`/`sendB` exist per track, the mix resolves them (chicago-blues: lead 0.2, chords 0.16, snare 0.14), and both buses are `BaseAudioContext`-only so they render identically offline. |
| "Pure digital waveforms, no analogue saturation" | Six engine modules already shape with saturation curves (`insertCurves.ts`, `ChannelStripDsp.ts`, `DrumKitModels.ts`, …). Whether it is *enough* is taste; the measurable part is the band and crest shape. |
| "Hats are unshaped white noise" | True for the two named genres' **mix** (the hi-hat stem's top three bands hold all its energy, centroid 6.9 kHz) — but in the 24-genre sample with hat stems rendered, **0 of 15** hit the harsh-hat threshold, so it is not the library-wide problem the report implies. |
| "The tail is cut at the end of both files" | Both named genres end in silence (−202 dBFS / −84 dBFS). The tail problem is real but *genre-specific* (detroit-techno above). |

### Unmeasurable as stated

* "Add a vocal chop / footsteps / vinyl crackle" — the engine is a synthesiser and a drum machine with no sample
  playback. This is a **content-acquisition** decision (sample pack + licensing + a new instrument role), not a
  mixing fix, and it is the one item in the report that changes what the product is.
* "The sound is cold and inhuman" — a taste summary. Its measurable parts are the velocity spread, the timbre
  variation and the mid-range density, all covered below.

## The plan

Ordered so that each phase is verifiable with the tooling that exists, and so that the first phase is entirely
independent of the skin work.

### P0 — make what already exists audible (gates first)

The three biggest findings (flat velocities, inaudible duck, near-mono) are all "the mechanism is there and the
setting is wrong". They are fixed in the **mix table** (`src/data/genreMix.ts`) and the **render defaults**, which
means one change per *category* rather than 159 hand-edits, and they can be measured immediately.

| # | Change | Where | How it is verified | Effort | Risk |
| :-- | :--- | :--- | :--- | :--- | :--- |
| 0.1 | **A `check:groove` gate** — the musical ratchet | new `scripts/check_groove.mjs` | Renders a sample per category and fails when velocity spread, duck depth, stereo width, mid-band share, swing audibility or tail level regress. Budgets start at today's numbers and only go down, like `probe:skins`. | M | none (read-only) |
| 0.2 | **Seeded velocity humanisation as a render default** | `WavExporter` + `genreMix` (`humanise: number` per category) | `velocityByTrack[*].distinct` rises without changing the pattern files; a fixed seed means two renders of the same groove stay byte-identical. | S | low — a wrong amount sounds sloppy, so the gate pins the range |
| 0.3 | **An audible sidechain** | `AudioEngine` duck depth/release + `genreMix` (`duckDb`, `duckReleaseMs`) | `duckDb` metric moves from −0.6…−2 to −4…−6 dB, with the shape measured per genre; the kick's own peak must not move. | M | medium — over-ducking pumps; the gate caps the depth |
| 0.4 | **Deliberate width** | `genreMix` pans per role (hats/perc/lead ±0.3…0.5, kick/bass centre) | `correlation` falls below 0.98 for the genres that ask for width, with mono compatibility checked (side ≤ −8 dB) so a phone speaker does not lose an element. | S | low |
| 0.5 | **Make swing act on 8th off-beats too** | `WavExporter` swing application (+ the sequencer's, kept in parity) | `swingOffsetMs` measurable on a *busy* stem for every genre that declares swing ≥ 20; a genre that declares it and does not show it fails. | M | medium — changes existing timing; golden-render tests will need re-baselining, deliberately |
| 0.6 | **Tail per pattern** | `WavExporter` (`+0.6 s` → the pattern's own release) | `tailRmsDb` under −60 dBFS for every genre; detroit-techno is the regression case. | S | low |

### P1 — content design (data, in category batches)

| # | Change | Where | Verification | Effort |
| :-- | :--- | :--- | :--- | :--- |
| 1.1 | **Ghost notes and velocity accents** in the drum patterns (a light snare 20–30 below the main hit, hats alternating 70/90) | `src/data/genres/*` — via a generator + per-category rules, not 159 hand-edits | `velocityByTrack` distinct ≥ 2 on every drum track; the pattern's *rhythm* unchanged (onset counts pinned by test) | M |
| 1.2 | **Mid-range fill**: bass moves to the 5th/octave instead of the root, and a soft pad doubles the chord an octave up | genre patterns + `genreVoicing` | `midBandShareDb` rises above −6 dB; `pitchByTrack.bass.distinct` ≥ 3 | M |
| 1.3 | **Harmonic movement inside the loop** for the 6-in-15 static genres: a two-chord loop | genre patterns | `pitchByTrack.chords.distinct` ≥ 2 where the genre's own description implies movement | S–M |
| 1.4 | **Percussion texture**: shaker/conga/clave patterns on the off-beats, low velocity | genre patterns (`percussion` track) | onsets on the percussion track ≥ 4 with distinct velocities | S |
| 1.5 | **A fill in the last bar** | needs P2.1 | the last bar's onset count differs from the others | M |

### P2 — engine and product

| # | Change | Where | Verification | Effort |
| :-- | :--- | :--- | :--- | :--- |
| 2.1 | **An arrangement layer**: a pattern gains sections (A/A/B/A + a fill), so "change the chord every 8 bars", "add a riser", "vary the stab" become data instead of wishes | `src/types/genre.ts` + the renderer + the sequencer's bar model | a 4-section song renders with measurable variation per section (`patternStatistics` per section differ) | L — the deepest item here |
| 2.2 | **Per-note timbre variation**: seeded detune / cutoff / send nudges per stab | `PolySynth` (and GS-1 patch params) | consecutive stabs differ in centroid by ≥ 3 %; with a fixed seed two renders match | M |
| 2.3 | **Saturation depth** per category | `insertCurves` + the channel strip | crest factor and the 3rd-harmonic ratio rise without the true peak moving | M |
| 2.4 | **Top-end texture** (noise sweep / riser / vinyl crackle) as a real instrument role | new voice + a `texture` track id | the top three bands gain energy only in the bars the arrangement says | M |
| 2.5 | **Sample-based texture** (vocal chops, found sound) | product decision first | — | L, needs licensing |

## What this plan refuses to do

* **No per-genre hand-editing of 159 files.** Everything in P1 that applies to the whole library goes through a
  generator (like `desktop_skins.mjs` does for colour) with a drift check, because 159 hand-maintained patterns
  is how they diverged in the first place.
* **No raising the loudness.** The master already sits at −1.3 dBTP with a true-peak ceiling; the fixes above are
  about *shape*, and `check:loudness` pins the level.
* **No second renderer.** Every measurement and every fix goes through `renderPatternOffline`, so what is measured
  is what the export button produces.

> **Revised after `docs/ARRANGEMENT_PLAN.md`:** the arrangement layer was P2.1 here, on the grounds that it was
> the deepest item. That was wrong — most of P1 below (fills, variation over 8 bars, harmonic movement, risers) is a
> statement about a **timeline**, not about a one-bar pattern, so the arrangement moves to the front of its own
> track. Track A below is unchanged and independent of it.

## Sequencing (parallel with the skin work)

| Round | This workstream | Skin workstream (unchanged) |
| :--- | :--- | :--- |
| next | P0.1 gate + P0.2 humanisation + P0.3 duck depth | remaining 13 findings, `JAM_COLORS`, P0 0-5 |
| +1 | P0.4 width + P0.5 swing + P0.6 tail | touch/jank ratchet |
| +2 | P1.1 ghost notes + P1.2 mid fill (generator) | — |
| +3 | P1.3/P1.4 + category review by ear | — |
| +4 | P2.2 timbre variation + P2.3 saturation | — |
| +5 | P2.1 arrangement layer (product decision required) | — |

The first two rows touch no CSS and no component; the skin rows touch no audio. Neither gate can mask the other.
