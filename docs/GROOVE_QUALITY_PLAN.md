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
measurements. Its first calibration was wrong twice over — three of the twelve ids did not exist and the analyser
dropped them silently, so the budgets described nine genres. The analyser now names unmatched ids rather than
filtering them away.

### Two measurement bugs, found while implementing P0.2

Both are the same mistake at different depths: **measuring something other than the thing the claim is about**.

1. **The basis was the authored skeleton.** The analyser rendered `genre.sequencer_pattern` — one chord root and one
   loop of placeholder velocities — while the app renders `patternFromGenre()`, which applies the genre mix, expands
   the progression into real chord stacks (`expandGenrePattern`) and (since P0.2) humanises the velocities. The
   musical claims were therefore about a pattern no user can play. `flatTracks` counted velocities the expansion had
   already replaced; `staticHarmony` counted a skeleton whose chords are *written out* by the expansion. The
   analyser now renders the pattern the user hears, and `src/test/genreMix.test.ts` pins the difference (the
   skeleton really is flat; the played pattern is not).
2. **The duck metric was blind to the sidechain.** It rendered the bass **alone** and compared the window before a
   kick with the window after it. With the kick's steps zeroed the duck is never *scheduled* — the trigger lives in
   the kick's own branch of the render loop — so that number was the bass part's own envelope, and a bass note that
   starts on the kick read as **+2..+5 dB of "duck"**. It now renders the pair twice, once with the kick present but
   *silent* (volume and sends zeroed, so it still triggers) and once without the kick, and compares the same 5–25 ms
   windows: the only difference between the two files is the duck gain.

With the honest instrument the sample's sidechain measures a mean dip of **at most 0.25 dB** and a deepest single
dip of **−1.8 dB**. That is not a tuning detail — it is the mechanism being inaudible, which is P0.3.

### A third finding: the renders are not repeat-identical, and the tail is where it shows

`scripts/diagnose_repeat_determinism.mjs` already documents that two renders of the same project are not
sample-identical (measured on chicago-house: three repeats, three hashes; per-track and per-bus isolation both
unstable; the cause is still open). While re-deriving the budgets this showed up as a **coin flip in one claim**:
detroit-techno's final 50 ms measured **−65.5 dBFS in four runs and −24.7 dBFS in two**, with identical duration
(8.100 s), identical true peak (−1.30 dBTP) and identical loudness (−12.63 LUFS).

So `cutTail` is now **confirmation-based**: a genre whose first render trips the −30 dBFS threshold is rendered a
second time and the worse of the two is reported (`tailRenders: 2` in the JSON). A pattern that really is still
sounding at the end — boom-bap, −29.1 dBFS in every render — trips both; a burst that was an artefact does not.
Fixing the underlying nondeterminism is its own workstream (it also puts a floor under every "two exports are
identical" claim), and it is now written down in P0.8 rather than assumed away.

## What the measurements say

### The corrected baseline (12-genre sample, after P0.2)

Measured on the pattern the user hears, with the paired duck instrument. This is what the gate's budgets are now
derived from:

| Claim | Before (skeleton basis) | Now (heard pattern) | Worst offenders |
| :--- | :--- | :--- | :--- |
| `flatTracks` — ≥4 of 8 lanes at one velocity | 12/12 | **0/12** | — (P0.2) |
| `weakDuck` — mean dip shallower than 1.5 dB | 11/12 | **12/12** | minimal-techno −0.25 dB; every genre ≤0.25 dB |
| `narrowStereo` — channel correlation > 0.98 | 12/12 | 12/12 | trap-rap 0.9993, disco 0.9995 |
| `thinMids` — 200 Hz–2 kHz share below −6 dB | 11/12 | 11/12 | trap-rap −12.4 dB, disco −12.1 dB |
| `staticHarmony` — one chord for the loop | 5/12 | **0/12** | — (the expansion writes the progression) |
| `cutTail` — last 50 ms above −30 dBFS | 2/12 | 2/12 | detroit-techno −24.7 dBFS, boom-bap −29.1 dBFS |

Two of the six claims were **measurement artefacts**, one (the duck) is a real and now correctly instrumented
defect, and the other three are real. P0.4–P0.6 keep their targets; P1.3 (harmonic movement) drops off the list
below because the claim it was written for does not survive the corrected basis.

### Confirmed

| Claim | Measurement | Scale |
| :--- | :--- | :--- |
| **Velocities were flat — "a MIDI dump"** | **Fixed (P0.2).** The authored skeleton really was flat — six of eight lanes carry a single value in chicago-blues and reggaeton (kick 120, snare 115, bass/chords/lead/fx 100) — and the expansion preserved that, so **12 of 12** sampled genres shipped ≥4 flat lanes. Humanisation is now baked into `patternFromGenre`; the sample is **0 of 12**, with ≥2 distinct velocities on drum lanes (reggaeton: kick 3, snare 11, hats 18). | landed |
| **The bass and kick collide (no usable sidechain)** | The ducking stage *exists* (`duckGain`, wired into both engines) and now measures **≤0.25 dB mean** on every sampled genre (deepest single onset −1.8 dB): the mechanism fires 20 ms too briefly and 3 dB too shallow to hear. | library-wide |
| **It is effectively mono** | Channel correlation **0.9856–0.9995**; **12 of 12** sampled genres correlate above 0.98. Panning is implemented and the mix even asks for it (chicago-blues: chords −0.22, lead +0.22, afrobeat percussion −0.4), but the *material* those values apply to is quiet and centred. | library-wide |
| **The mid-range is hollow** | The 200 Hz – 2 kHz bands hold **−12.4 dB** (trap-rap) and **−12.1 dB** (disco) of the total; **11 of 12** sampled genres are below −6 dB (afrobeat −6.3 is the closest to passing). | most genres |
| **The melody barely moves** | Lead: **3 distinct pitches across a 4th** (81–86, 72–77) in the two named genres. Not static, but narrow. | the named two |
| **No fills, no variation over time, no riser** | **Structural**: a genre *is* one pattern. `renderPatternOffline` repeats it `bars` times; there is no arrangement, section or fill concept anywhere in the types or the data. Every "add a fill in bar 4 / change the chord every 8 bars / build a riser" item needs that layer to exist first. | product gap |
| **Swing reaches the audio only sometimes** | After the basis fix this is mostly resolved: `inaudibleSwing` is **0 of 12**. boom-bap (declared swing 60) is the one genre where the kick's alternating intervals still read as straight, because the kick plays 8ths and swing acts on 16ths. | 1 of 12 |
| **One genre cuts its tail** | detroit-techno ends at **−24.7 dBFS** in its last 50 ms (boom-bap −29.1): the render stops while the sound is still going. | 2 of 12 |

### Refuted (the report's premise is already in the code)

| Claim | Reality |
| :--- | :--- |
| "The harmony never moves inside the loop" | **A measuring artefact of the skeleton basis.** `expandGenrePattern` writes the genre's progression out as real chord stacks, so the pattern the user hears moves: reggaeton has **4 distinct chords and a bass that walks through 3 pitches**, and **0 of 12** sampled genres are static. P1.3 was written for a claim that does not survive measurement — it is dropped. |
| "No sidechain compression at all" | It exists — `duckGain` per track in `AudioEngine` **and** in `WavExporter`'s offline graph. It is too *shallow and too short* (P0.3), which is a tuning problem, not a missing feature. |
| "No panning" | Every track carries `pan`, the offline render applies it (`StereoPannerNode`, post-insert), and the mix table sets ±0.22 on chicago-blues and up to −0.42 on reggaeton. Too subtle, not absent. |
| "No reverb or delay" | `sendA`/`sendB` exist per track, the mix resolves them (chicago-blues: lead 0.2, chords 0.16, snare 0.14), and both buses are `BaseAudioContext`-only so they render identically offline. |
| "Pure digital waveforms, no analogue saturation" | Six engine modules already shape with saturation curves (`insertCurves.ts`, `ChannelStripDsp.ts`, `DrumKitModels.ts`, …). Whether it is *enough* is taste; the measurable part is the band and crest shape. |
| "Hats are unshaped white noise" | True for the two named genres' **mix** (the hi-hat stem's top three bands hold all its energy, centroid 6.9 kHz) — but in the 24-genre sample with hat stems rendered, **0 of 15** hit the harsh-hat threshold, so it is not the library-wide problem the report implies. |
| "The tail is cut at the end of both files" | Both named genres end in silence. The tail problem is real but *genre-specific* (detroit-techno, boom-bap above). |

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
| 0.2 | **Seeded velocity humanisation** ✅ | `genreMix.humanisePatternVelocities`, called at the end of `patternFromGenre` | `velocityByTrack[*].distinct` rises without touching the 159 genre files; a fixed seed means two renders of the same groove stay identical. **Baked into the pattern rather than applied at trigger time** so the live engine, the WAV/MP3 bounce, the MIDI/`.als` exports and the editor's velocity lane all read the same performance — and so the gate, which counts the pattern, can see it. Amounts are per category (0.18–0.34) scaled per lane (kick ×0.35, bass ×0.5, hats ×1.1) with per-genre exceptions where the style is machine-locked (chiptune, gabber, drill) or hand-played (ambient, blues, funk). Result: **0 of 12** sampled genres with a flat lane. | S | done |
| 0.3 | **An audible sidechain** | `AudioEngine` duck depth/release + `genreMix` (`duckDb`, `duckReleaseMs`), scheduled by one shared helper | `duckDb` moves from ≤0.25 dB to **4–6 dB** on the pair-isolated measurement, with the kick's own peak unmoved; the release is short enough to breathe between kicks. The claim threshold rises from "shallower than 1.5 dB" to "shallower than 3 dB" so the budget means *audible*. | M | medium — over-ducking pumps; the gate caps the depth |
| 0.4 | **Deliberate width** | `genreMix` pans per role (hats/perc/lead ±0.3…0.5, kick/bass centre) | `correlation` falls below 0.98 for the genres that ask for width, with mono compatibility checked (side ≤ −8 dB) so a phone speaker does not lose an element. | S | low |
| 0.5 | **Make swing act on 8th off-beats too** | `WavExporter` swing application (+ the sequencer's, kept in parity) | `swingOffsetMs` measurable on a *busy* stem for every genre that declares swing ≥ 20; a genre that declares it and does not show it fails. After the basis fix only boom-bap (kick plays 8ths, swing acts on 16ths) is on this list. | M | medium — changes existing timing; golden-render tests will need re-baselining, deliberately |
| 0.6 | **Tail per pattern** | `WavExporter` (`+0.6 s` → the pattern's own release) | `tailRmsDb` under −60 dBFS for every genre; detroit-techno and boom-bap are the regression cases. | S | low |
| 0.7 | **Measure the loudness and timbre baselines on the pattern the user hears** | `measure_genre_loudness.mjs`, `measure_genre_timbre.mjs` | Found while fixing A3: both baseline scripts render `applyGenreMixDefaults(genre.sequencer_pattern)` — the mix applied to the *unexpanded* skeleton. They are self-consistent (the gate re-measures the same thing), so `check:loudness`/`check:timbre` still hold, but they certify a one-loop pattern rather than a performance. Regenerating 159 baselines is a release of its own; do it deliberately, not as a side effect. | M | medium — every baseline moves |
| 0.8 | **Make two renders of the same project sample-identical** | the master chain: limiter worklet, bus compressor and channel strips | `scripts/diagnose_repeat_determinism.mjs` already isolates it to the master chain (per-track and per-bus renders are unstable too) and leaves the next experiment written down. Until it is fixed, the tail claim is confirmation-based (above), and "export twice, get the same file" is only true to the repeat noise floor `check:timbre` cites. | L | high — touches everything, so it gets its own release and its own ratchet |

### P1 — content design (data, in category batches)

| # | Change | Where | Verification | Effort |
| :-- | :--- | :--- | :--- | :--- |
| 1.1 | **Ghost notes and velocity accents** in the drum patterns (a light snare 20–30 below the main hit, hats alternating 70/90) | `src/data/genres/*` — via a generator + per-category rules, not 159 hand-edits | P0.2 already gives every lane ≥2 velocities, so the bar is content, not jitter: **max − min ≥ 15** on snare/hats, and the pattern's *rhythm* unchanged (onset counts pinned by test) | M |
| 1.2 | **Mid-range fill**: bass moves to the 5th/octave instead of the root, and a soft pad doubles the chord an octave up | genre patterns + `genreVoicing` | `midBandShareDb` rises above −6 dB; `pitchByTrack.bass.distinct` ≥ 3 | M |
| 1.3 | ~~**Harmonic movement inside the loop** for the 6-in-15 static genres~~ | — | **Dropped**: the static-harmony claim came from the skeleton basis; the played pattern already moves (0 of 12 static). | — |
| 1.4 | **Percussion texture**: shaker/conga/clave patterns on the off-beats, low velocity | genre patterns (`percussion` track) | onsets on the percussion track ≥ 4 with distinct velocities | S |
| 1.5 | **A fill in the last bar** | needs P2.1 | the last bar's onset count differs from the others | M |

### P2 — engine and product

| # | Change | Where | Verification | Effort |
| :-- | :--- | :--- | :--- | :--- |
| 2.1 | **An arrangement layer**: a pattern gains sections (A/A/B/A + a fill), so "change the chord every 8 bars", "add a riser", "vary the stab" become data instead of wishes | `src/types/genre.ts` + the renderer + the sequencer's bar model | a 4-section song renders with measurable variation per section (`patternStatistics` per section differ) | L — the deepest item here, now specced in `docs/ARRANGEMENT_PLAN.md` |
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
| done | P0.1 gate + basis fixes + **P0.2 humanisation** (flat lanes 12/12 → 0/12) | remaining 13 findings, `JAM_COLORS`, P0 0-5 |
| next | P0.3 duck depth/release (shared scheduling helper) | touch/jank ratchet |
| +1 | P0.4 width + P0.5 swing 8ths + P0.6 tail | — |
| +2 | P1.1 accents + P1.2 mid fill (generator) | — |
| +3 | P1.4 percussion texture + category review by ear | — |
| +4 | P2.2 timbre variation + P2.3 saturation | — |
| +5 | P0.7 loudness/timbre baseline basis (own release) | — |

The first two rows touch no CSS and no component; the skin rows touch no audio. Neither gate can mask the other.
