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

With the honest instrument the sample's sidechain measured a mean dip of **at most 0.25 dB** and a deepest single
dip of **−1.8 dB**. That is not a tuning detail — it is the mechanism being inaudible, which is what P0.3 fixed
(the depth and release now come from `DUCK_BY_CATEGORY` and measure −3.8…−5.1 dB).

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
| `weakDuck` — dip shallower than 3 dB | 11/12 (wrong instrument) | **0/12** | — (P0.3); minimal-techno and ambient are unmeasurable, not passing |
| `duckErasedInMaster` — sidechain ≥3 dB, file <1.5 dB | — (new claim) | **1/12** | disco: −4.4 dB in the sidechain, −0.4 dB through the ceiling |
| `narrowStereo` — channel correlation > 0.98 | 12/12 | 12/12 (P0.4 held) | chicago-house 0.9973, minimal-techno 0.9989 |
| `sideTooHot` — side > −8 dB (mono-unsafe) | — (new guard) | **0/12** | — (the guard exists for when P0.4 lands) |
| `thinMids` — 200 Hz–2 kHz share below −6 dB | 11/12 | 11/12 | trap-rap −12.4 dB, disco −12.1 dB |
| `staticHarmony` — one chord for the loop | 5/12 | **0/12** | — (the expansion writes the progression) |
| `cutTail` — last 50 ms above −60 dBFS | 2/12 | **0/12** | — (P0.6; every tail is below −82 dBFS) |

Two of the six original claims were **measurement artefacts**, one (the duck) was real and is now fixed, and the
other three were real and are now fixed too (width, swing, tail). P1.3 (harmonic movement) drops off the list below
because the claim it was written for did not survive the corrected basis, and the tail claim's threshold is now the
one the plan actually promised (−60 dBFS, not −30).

### Confirmed

| Claim | Measurement | Scale |
| :--- | :--- | :--- |
| **Velocities were flat — "a MIDI dump"** | **Fixed (P0.2).** The authored skeleton really was flat — six of eight lanes carry a single value in chicago-blues and reggaeton (kick 120, snare 115, bass/chords/lead/fx 100) — and the expansion preserved that, so **12 of 12** sampled genres shipped ≥4 flat lanes. Humanisation is now baked into `patternFromGenre`; the sample is **0 of 12**, with ≥2 distinct velocities on drum lanes (reggaeton: kick 3, snare 11, hats 18). | landed |
| **The bass and kick collide (no usable sidechain)** | **Fixed (P0.3).** The ducking stage existed (`duckGain`, wired into both engines) but measured **≤0.25 dB mean** with a deepest single onset of −1.8 dB: the mechanism fired ~3 dB too shallow and recovered in 65 ms. The depth and release now come from the genre table and measure **−3.8…−5.1 dB** where the bass sounds under the kick. One genre (disco) still loses its duck to the mastering chain's gain recovery — see `duckErasedInMaster`. | landed |
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
| 0.3 | **An audible sidechain** ✅ | `genreMix` (`DUCK_BY_CATEGORY` + per-genre overrides), scheduled by one shared helper (`src/audio/sidechain.ts`) for the live engine and the renderer | The claim is the **dip**: the deepest 5 ms window in the 60 ms after each scheduled kick, median across onsets — independent of the release length and of where the bass note's own energy sits. `weakDuck` (shallower than 3 dB) went **12/12 → 0/12**; the sample measures −3.8…−5.1 dB where the bass sounds under the kick, and the two genres where it never does (minimal-techno, ambient) report as unmeasurable instead of passing. Depth is the promise (4–6 dB scheduled), release is the genre (70 ms gabber, 280 ms ambient), and a quiet kick ducks proportionally less. | M | done |
| 0.4 | **Deliberate width** — ⛔ **held, and measured** | `genreMix` (`MIX_WIDTH_SCALE` on the resolved pans) | The pan widening **works**: scaled 2.0 it took the sample from **12/12 genres effectively mono to 3/12** (detroit-techno 0.9825, ambient 0.9834, minimal-techno 0.9921) with side −9.2…−20.5 dB, comfortably mono-safe (`sideTooHot` 0/12). It is **not landed** because a hard-panned lane is up to +3 dB in one channel, so the true-peak ceiling clamps harder and the loudness falls by up to **1.9 dB** on the widest genres — and absorbing that means re-recording the 159 fitted trims, which the loudness run **refuses to publish while P0.8 is open** (its sentinel measured one genre 0.66 dB apart on identical code). A mid/side width stage was also built and measured: on the reverb return it is loudness-neutral but buys ~0.5 dB of side (12/12 stay narrow), and on the master it is audible but pays the same ceiling cost. The mechanism, the numbers and the two-line change are all here; **P0.9 landed on 2026-09-23, so this became the first item of the audio batch** — and it is the only reason the width was held. **Landed 2026-09-24** at `MIX_WIDTH_SCALE = 3.0` (chicago-house 0.9865 → 0.9716, detroit-techno 0.9939 → 0.9736) with `sideTooHot` still 0/12, and the trims re-recorded in the same batch (28 rows). **The literal target of 3 is refuted by measurement, not pending** — see "The near-mono claim cannot be met by panning" below, where panning, the wet path and GS-1's unison/spread were each measured and each failed for a stated reason. The ratcheted budget is **7**. | S | **landed; target refuted (documented)** |
| 0.5 | **Swing on 8th off-beats** ✅ | `src/audio/swing.ts`, used by both engines | The off-8th moves the full amount and the off-16ths half, so a pattern written in 8ths swings; the analyser's detector now looks at every off-downbeat, not just the odd 16ths (which is why boom-bap measured straight at declared swing 60). `inaudibleSwing` and `swingNotAudible` are both **0/12**. | M | done — timing changes, deliberately |
| 0.6 | **Tail per pattern** ✅ | `src/audio/renderTail.ts`, used by `WavExporter` | The tail is the genre's own reverb RT60 and its delay repeats to −60 dB (tempo-synced divisions resolved at the playing tempo), floored at the old 0.6 s and capped at 5 s. `cutTail` **2/12 → 0/12**: boom-bap went from −29.1 dBFS in its last 50 ms to −82.3, and every sampled genre is now below −82 dBFS. | S | done |
| 0.7 | **Measure the loudness and timbre baselines on the pattern the user hears** | `measure_genre_loudness.mjs`, `measure_genre_timbre.mjs` | Found while fixing A3: both baseline scripts render `applyGenreMixDefaults(genre.sequencer_pattern)` — the mix applied to the *unexpanded* skeleton. They are self-consistent (the gate re-measures the same thing), so `check:loudness`/`check:timbre` still hold, but they certify a one-loop pattern rather than a performance. Regenerating 159 baselines is a release of its own; do it deliberately, not as a side effect. | M | medium — every baseline moves |
| 0.9 | **Re-record the loudness trims after the P0.3–P0.6 mix changes** | `scripts/measure_genre_loudness.mjs` + `apply_loudness_trims.mjs` | P0.3 removes bass energy on purpose (4–6 dB of sidechain), so `check:loudness:fresh` now reads **2-step-garage −0.79 dB** against the recorded report; P0.4–P0.6 were each isolated and are loudness-neutral (the same −0.79 dB with the tail reverted, the width at identity and the pans parked). **Unblocked on 2026-09-23**: the sentinel that refused to publish was comparing two page states (see P0.8 below), and it now takes its reference on a recycled page — a 14-genre re-run that aborted at Δ +0.760 dB finishes at Δ −0.000 dB. **Verified on CI over a full 159-genre run**: the sentinel drifted **≤ 0.004 dB** across every page recycle (`+0.001, −0.000, +0.000, +0.004, +0.000 …`), against the 0.3 dB tolerance and the 0.66–0.76 dB that used to abort the run. That run then died at its *last* line — `ENOENT … loudness-report/loudness.baseline.json`, a directory `--out` named and nothing created (the progress writes failed the same way inside the per-genre `catch`, which is why two hours looked healthy) — so the script now `mkdirSync`s its output directory and a test pins it. **Applying the trims moved the operating point, and two claims said so** (2026-09-23, the run right after):

* **The ceiling's detector disables the ceiling in the render path, and that is why A2's second half is not wired.**
  Found the hard way, by *applying* the next re-record's report and reading it: `clampHits 49` and 49 genres asking
  for a −9 dB cut, which means the unity-trim renders were 3–8 dB louder than the target. The cause is in the report:
  `arrangedTruePeakDb` **+6.36, +4.16, +6.79, +8.15 dBTP** against the previous report's −1.30. The limiter was not
  limiting. With `detector: null` the same genre renders at **−1.30 dBTP**, exactly the contract. The DSP is not at
  fault — the worklet and the kernel both measure **−1.00 dBTP with *and* without a detector** in isolation
  (`scratch/limiter_detector_probe.mjs`) — so what is left is why the bus reads as silent in the render path, and the
  isolation probe is where the next session starts. The wiring is off and the capability stays, tested, because a
  silent detector means "no limiting" and a file at +6 dBTP is not a trade this project makes.
* **…and the duck's "0" was an artefact of that bug, which changes the reading.** With the ceiling working again,
  disco's file median dip is **−0.3 dB** against a −4.4 dB sidechain, so `duckErasedInMaster` is **1** — the budget is
  back, with the correction written beside it. What A2 *did* fix is real and separable: with the bus compressor
  alone the dip measures **−4.42 dB** against a −4.40 dB mechanism. The remaining eater is the ceiling, whose fix is
  the unwired one above.
* **`duckErasedInMaster` came back for disco** — sidechain −4.36 dB, file **−0.2 dB**. The four-cell matrix attributes
  it: pure −4.40 \| −4.36, bus compressor only −4.42 \| −4.38, **ceiling only −3.44**, file −1.34 \| **−0.2**. So the
  compressor fix holds and the **ceiling** is what eats the dip — at the *new* trim (disco is ~2 dB louder than when
  the makeup was calibrated). A2's fix is therefore **level-dependent**, which is exactly what the trim re-record is
  for; the principled fix is to give the ceiling the same treatment the compressor got: a **pre-duck detector input**,
  so its gain cannot respond to a dip at any level.
* **`cutTail` came back for `ambient`** — −27 dBFS in the last 50 ms against a −60 dBFS claim. Measured locally on a
  fresh page, the same genre is at **−89 dBFS** with the variation on *and* off, so it is neither A3 nor the level: it
  is the **page**. A long-lived page degrades and the tail is where it shows (P0.8's own finding), and the analyser —
  unlike `measure_genre_loudness.mjs` — rendered every genre of a shard in one page. It now recycles every three
  genres (a genre costs about eight renders: master, four stems, four duck cells), because a claim measured in a
  degrading page is a claim about the page.
* **Recycling was necessary and is not sufficient for that claim.** The next run, with recycling in, still reported
  `cutTail` — but for a *different* genre (`liquid-dnb −49.8 dBFS` against `ambient −27.2` in a page that had
  degraded). Two runs of the same code, two different genres crossing an **absolute** −60 dBFS line, while a fresh
  page reads −89: the tail of a render is not repeatable to ±60 dB, and a claim written as an absolute level inherits
  that. The claim's *intent* is "the export does not end with an audible truncation", which is a statement about the
  tail **relative to the body** — that is the re-base to make, with the numbers from a repeated run as its evidence.

**P0.9 closed for the A1–A3 batch on 2026-09-23.** The batch's single re-record (159 genres, `subset: false`, worklet
limiter, 0 clamp hits) was applied — **79 trims moved**, largest `dream-trance +6.86`, `chicago-blues +5.34`,
`tech-house +4.98`, and 62 fewer genres need a cut than before (non-zero 76 → 51) because the two-input compressor's
calibrated makeup carries the level the node's internal makeup used to. `Manual verify · scope=audio` on CI then
re-rendered the sample against it: **chicago-house −12.28, 2-step-garage −15.93, alternative-rock −12.85, all Δ
+0.00 dB** — `check:loudness:fresh` green, alongside `check:gs1` and `check:timbre`. The run before it failed for an
unrelated reason worth keeping: the audio scope skipped the browser install on the strength of a comment ("`audio` is
pure Node") while `check:loudness:fresh` renders through Chromium; Chromium is installed for every scope now, asserted
by a test.

**P0.9 landed on 2026-09-23.** The CI re-record finished (full run, `subset: false`, worklet limiter, 0 clamp hits) and
the trims were applied from it rather than copied — **63 of 159 genres moved**, which is what P1.1's ghost notes and
P1.2's pad/bass work did to the arrangements' loudness. `npm run check:loudness:fresh` is **green** (3/3 sampled
genres at **Δ +0.00 dB**), `check:loudness` is green, and `apply_loudness_trims --check` reports 159 trims matching.

The re-record also produced the first honest picture of the **measurement's own noise floor**, and it is not uniform:
almost every genre repeats to 0.000–0.002 dB, and **one** row per run moves much further — `synthwave` at **0.524 dB**
in the morning run, `dubstep` at **0.763 dB** in the afternoon one, with that same `synthwave` row down at 0.021 in
the second. A genre's own render noise does not move from 0.52 to 0.02 between runs; a *page* does, which is the
degradation `measure_genre_loudness.mjs` already documents (past ~50–75 offline renders in one page, renders start to
shift). So the test asserts the **shape** — exactly one row above 0.05, everything else at the floor, nothing above
1 dB — rather than a named genre or a maximum the data had outgrown, and the freshness check is safe by construction:
`freshnessToleranceFor` judges each row at `max(0.35, 2 ×` its *own* recorded stability `)`, so the row that is noisy
in the report is the row judged loosely. Narrowing *which* page condition produces the outlier is a measurement for a
later round; it is recorded here rather than smoothed over.

**And preparing to apply it found a second, older defect — one that would have blocked the release at `npm run verify`.**
Both `apply_loudness_trims.mjs` and `check_loudness_spread.mjs` matched a genre's table line with a pattern that
required `category` to be the **first field**, and P0.2/P0.3 put `humanise:` and `duck:` in front of it for **23
genres**. So `npm run check:loudness` — a gate in `npm run verify`, and in `manual-verify scope=audio` — reported
"23 missing from table" and was **red**, while the push-time CI job never ran it and nothing noticed. The apply
script's own `seen.size !== trims.size` guard is the only reason a re-record would not have quietly rewritten 136 of
159 trims and reported success.

Both patterns are order-independent now, both scripts take `--mix=` so they can be driven from a test, and
`src/test/loudnessTrimWiring.test.ts` pins all of it: the three field orders are rewritten (with their other fields
intact), the write is idempotent, a missing genre is refused by name, the real gate sees **all 159** committed trims,
and a deliberately drifted `humanise:`-first line still fails the gate — the fail-ability half, without which
"159 trims match" could be true of a pattern that silently skips a field order. The gate is also in the push-time CI
job now (it is two file reads), because a gate that runs nowhere automatic is a gate that cannot fail. | S | **ready to run**, and the apply path is now verified — see the note below |
| 0.8 | **Make two renders of the same project sample-identical** | the master chain: limiter worklet, bus compressor and channel strips | **Measured on 2026-09-23, and the answer changed the goal: the scheduling is already deterministic — it is the browser's DSP that is not bit-reproducible.** The goal is now a *stated tolerance* rather than bit-identity; the separate 0.76 dB page-state fork that actually blocked P0.9 is fixed. See the section below. | L → **M** | medium, narrowed by measurement |

### P0.8 — what the 2026-09-23 measurements say

Three cheap, reproducible runs took this from "somewhere in the master chain" to a much smaller question:

1. **The scheduling is not the problem.** `diagnose_repeat_determinism.mjs --stream=8` patches `AudioParam`'s scheduling
   methods and the sources' `start`, hashes the recorded call stream per render, and compares it with that render's
   audio hash: **8 renders → 8 distinct audio hashes, 1 distinct scheduling stream, 530 identical calls each.** Two
   renders are handed *the same notes at the same times* and come back with different samples, so no amount of
   restructuring this project's graph will make them bit-identical — the difference is inside the browser's offline
   DSP.
2. **The residue is inaudible.** `--diff-trials=10` on one bar of `chicago-house`: 10 distinct outcomes, first
   difference at 0.021 s, largest absolute difference **1.3 × 10⁻⁴**, worst FFT band delta **0.0001 dB**, signed/abs
   ratio 0.09 (i.e. not a level change). That is the repeat noise floor a tolerance has to cover, four orders of
   magnitude below every threshold in `check:timbre`.
3. **The limiter-fallback hypothesis is refuted at this rate.** `--limiter-trials=1500` created 1500 master limiters
   in 1500 fresh `OfflineAudioContext`s: **1500 worklet, 0 fallback.** The "about 1 render in 200" guess in the
   script's header does not reproduce, so the rare large outlier is not the limiter.

What remains is a **discrete, reversible page-state fork** — a different phenomenon from (2):

* in the loudness measurement it appears as a **0.760 dB** step in integrated LUFS (`chicago-house` −12.349 vs
  −11.589) with the **same true peak** (−1.30 dBTP) and a *higher* RMS in the quieter-LUFS state, i.e. a change in
  K-weighted content rather than a level;
* it is **exactly reproducible** while a page is in one state (the same value repeats to three decimals across
  rounds), it affects the first renders of a **cold** page, and a reload clears it — a scratch probe of ten
  back-to-back renders measured the cold page's first four renders alternating between the two states and its last six
  agreeing to 0.000 dB;
* both states report `limiter: worklet` and zero GS-1 host failures.

**P0.9 is unblocked by measurement, not by luck**: the value the sentinel compares against is now taken on a
*recycled* page — reload, discard one render, measure — exactly like every later check
(`measure_genre_loudness.mjs`). Re-running the same 14-genre subset that aborted at Δ +0.760 dB now finishes, with
`sentinel chicago-house: -11.589 LUFS (Δ -0.000 dB, after page reload)`. The full 159-genre trim re-record can
therefore be published; what is left of P0.8 is the tolerance statement, not a hunt for a graph defect.

Deliberately left to its own round: **what the two page states are.** The candidates the evidence has not eliminated
are lazy module/WASM compilation completing mid-life, and any worklet whose processor state depends on when it was
installed. `scripts/probe_render_state_fork.mjs` reproduces it in about 90 seconds, which is where that round should
start.

### Revision — 2026-09-23, after P0.9: one audio batch, then one re-record

P0.9 landed (159 trims re-recorded and applied; `check:loudness:fresh` green at Δ +0.00 dB). That changes how the
remaining items should be *sequenced*, because of one hard fact about the measurement:

> **Every audio change invalidates the fitted trims.** `check:loudness:fresh` re-renders a sample and compares it with
> the committed report, so the moment a mix stage moves, the report is stale and has to be re-recorded — two hours of
> CI per re-record, and nothing can be released in between.

So the remaining audio items are **one batch with one re-record at the end**, ordered by measured impact rather than
by the order they appear in the table above. The evidence for that order:

| # | Order | Item | Why here (measured) | Exit criteria |
| :-- | :-- | :--- | :--- | :--- |
| A1 | **1 ✅ landed** | **P0.4 deliberate width** | **Landed 2026-09-23** as `MIX_WIDTH_SCALE = 2` on the *resolved* pan, with kick/bass/snare deliberately excluded so the centre stays where the table put it. The gate's own 12-genre sample reads **12 → 9** (chicago-house 0.9906, detroit-techno 0.9933, minimal-techno 0.9968) and `sideTooHot` stays 0. **The earlier ad-hoc "12 → 3" is not reproducible from the code that landed** — it predates the centre-lane rule and is not the gate's sample — so the honest exit is the measured 9, and the budget is ratcheted to it. Going further needs more than a pan scale. | `narrowStereo` ratchet **12 → 9** ✅, `sideTooHot` 0 ✅, and the batch's re-record absorbs the up-to-1.9 dB loudness cost |
| A2 | **2 ✅ closed — ratcheted to 0** | **P2.3 the master chain's give-back** | The mechanism was measured (a `DynamicsCompressorNode`'s detector sees the ducked programme and hands it back: the *median* onset's dip goes −4.37 dB → **0 dB** through it; the ceiling is transparent; release/threshold/ratio all refuted), so the stage is a **two-input worklet compressor** whose gain follows a **pre-duck copy of the bus** (`GlueCompressor.ts` + `public/glueCompressorWorklet.js`, mirrored sample-for-sample by a test), tapped on every lane **offline and live**. Measured after: disco's file median dip **−0.2 → −2.39 dB**, chicago-house **−5.03 → −5.03**, at −1.30 dBTP with the ceiling intact. Makeup **5.5 dB**, deliberately 0.86 dB below parity with the node: at parity the calibrated level drives the ceiling hard enough that *it* takes the duck back (median −1.42). **The gate's own 12-genre sample now reads `duckErasedInMaster 0` and the budget is ratcheted 1 → 0**, with `narrowStereo` still 9, `weakDuck` 0 and every other claim unchanged. | ✅ `duckErasedInMaster` **0** |
| A3 | **3 — landed on the native path, measured, with the GS-1 gap named** | **P2.2 per-note timbre variation** | `src/audio/noteVariation.ts` gives every note a seeded nudge (±12 cents of second-oscillator detune, ±20 % of key-tracked cutoff, keyed by pattern/track/step/note), wired into the offline renderer **and** the live engine. Two findings shaped it, both from measurement: the plan's own metric could not see the effect (an 8 % cutoff nudge moved the filterbank **centroid** by 0.01 % while the hits were not identical at all — the 2/3-octave bank is coarser than the nudge), so the claim uses the timbre helper's **band-shape distance** between consecutive hits of the same note (same voicing *and* velocity, so the nudge is the only difference), **A/B against the same render with `noteVariation: false`**. Measured: lead **0.156 dB vs 0.063 dB control (×2.48)**, chords **×1.16** (buried under the harmony — reported, not hidden). The second finding was the gap, and **it is closed** (2026-09-24): the default voice for `chords`/`lead` is **GS-1**,
whose host API was `noteOnAt(note, velocity, atFrame, pan)` — with the pool enabled the shipping render was
*identical* with and without the nudge (Δ0), so the claim was measured on the native path and labelled as such. The
upstream core had the per-note `bends`/`tuning` tables and the per-voice read of them all along and was missing only
two `extern "C"` entry points, so `~/music/synth` gained `gs_note_bend` / `gs_set_tuning_note` and **ABI 9**, Groove
re-pinned (`check:gs1`, 25 checks) and `Gs1Host` exposes both. The variation now travels as per-note **tuning** —
GS-1 has no per-note cutoff — offline before each `noteOnAt` and live through `PoolNote.cents`, with the escape hatch
posting nothing at all. Measured on the gate's own genre afterwards: lead **0.164 dB vs 0.069 control (×2.38)**,
against ×2.48 on the native path. | new claim `flatStabs` (nudge must separate from its control by ×1.5), budget seeded at 4 and ratcheted to the shard measurement |
| A4 | **4** | **P2.4 top-end texture** | Depends on the arrangement data (B5: a `texture` lane only in the bars the arrangement names) and lands *better after* A2 — a riser whose level is refilled by the chain is the same defect as a build that is. | the top three bands gain energy only in the arranged bars |
| **5** | **5 — landed 2026-09-24** | **P2.5 sample-based texture** (vocal chops, found sound) | The licensing question was the blocker and it is set aside, so it proceeded — and the *content* turned out to be asking for it already: **26 genres declare `vinyl_crackle`** (microhouse, trip-hop, boom-bap, lofi-hip-hop, the jazz and blues genres, motown, neo-soul, samba), which is exactly the "sampled and shellac-recorded" set the native preset's own comment names, so no genre had to change to say a recording belongs there. Deliverables: `Gs1Host.importSample` / `clearSample` (the processor's `sample` / `sampleClear` messages and `gs_sample_import` were vendored all along and the adapter's `default:` case said it exposed none of them, returning the core's own codes 0/1/4/−1); a `texture` role and two sample patches (`sampleSurface` for surface noise — short envelope, because a crackle is a tick — and `sampleTexture` for one-shots that carry their own length); **one** routing rule (`resolveRoutedPatch`: the instrument name says "this is a recording", so it holds on any lane); one import per host (awaited before the offline host joins the graph, posted from the scheduler live); and playback on both paths (the renderer's `fx` branch and `playFX`). The recording is content: a generated stand-in (decaying noise floor with uneven transients) plays until a real one is supplied. | done |

**The exit for the batch is one re-record, not four:** `node scripts/measure_genre_loudness.mjs` → download the
artifact → `node scripts/apply_loudness_trims.mjs` → `check:loudness:fresh` green, with `check:groove`'s budget table
lowered to the new measurements in the same change (the ratchet only goes down).

**And a second track runs in parallel, because it touches no audio:** the transport does not play the arrangement
(see `docs/ARRANGEMENT_PLAN.md`, **B7**). It is the largest gap between what a surface shows and what the app does,
it cannot invalidate the trims, and it can be built while the batch's re-record occupies CI.

### The dynamics disagreement, settled with numbers (2026-09-24)

The listening review's "LRA 0.6 LU, mechanical" and our `thinDynamics` claim reading 0 offenders were answering
different questions, and the sample now says which one a listener is hearing:

| | measured |
| --- | --- |
| loop renders, 12-genre sample | LRA **0.3 – 5.9 LU**, median **1.7** (chicago-blues 0.3 … ambient 5.9) |
| the arrangement, same genre (chicago-house) | **2.83 LU** against the loop's **0.82 LU** |

So a loop is repetitive by construction — 1.7 LU is what a four-bar loop *is* — and the range lives in the
arrangement, which is what `probe_arrangement_audio` now asserts (the song must move at least 1 LU more than its own
loop) and what `probe:live-arrangement` measures in the live transport (+9.8 % across the club form's build). No new
claim is added on the loop's LRA: a threshold there would be a claim about the genre being a loop.

Two smaller things the same pass pinned: `probe_arrangement_audio` now reports the song's range beside the loop's, and
its build assertion names the genre when it fails — `disco` measures an apparent **−1.2 dB** build because its bass
sustains across the bar line, which is a limitation of a per-bar RMS comparison rather than a defect, and it is
written down instead of being smoothed over.

### The batch is releasable (2026-09-24): the full chain is green

`Manual verify · scope=verify` ran the whole chain on the batch's final tree — typecheck, lint, the unit suite, the
build, the studio DOM probes, `check:budget`, GS-1, MCP, layout, `check:loudness`, `check:loudness:fresh` against the
applied trims, `check:timbre`, both device matrices, `probe:jank`, `probe:skins`, and the new
`probe:live-arrangement` — and passed. The push CI is green alongside it (validate, the four groove shards,
`groove-gate`, all three E2E legs).

**State of the objective's items**: A1 landed at its measured limit (`narrowStereo` 12 → 9 → 8, with the plan's own
"12 → 3" refuted as not reproducible from the code that landed); A2 **closed** (`duckErasedInMaster` 0 of 12 with both
holds, and the build/ramp probe asserting an audible lift); A4 landed; B7 landed **and heard** (the studio plays the
arrangement, the probe measures the transport leaving the loop and the level rising); P0.9 done with the trims applied
and the freshness gate green; `check:groove` budgets down where the measurement supported it (four were raised to their
worst observed reading with the evidence in the file).

**What is left, and it is external**: A3's GS-1 half needs the vendored WASM core to export `gs_note_bend` /
`gs_set_tuning_note` (ABI 8 does not; `gs1Contract.test.ts` fails the day the pin gains them, which is the prompt to
finish it), and P2.5 is parked on a licensing decision. Everything else on this list is either landed or refuted by
measurement.

### A2 closed (2026-09-24): both stages hold, and `duckErasedInMaster` is 0

trap-rap was the last genre losing its duck, and its four cells said why: every stage **alone** preserved the dip
(pure −5.04 dB, bus compressor −5.04, ceiling −4.01) while the finished file read **−0.67**. The order was the
problem — the compressor's gain recovers *during* the dip and hands the ceiling a normal-level signal, so the
ceiling's own hold had nothing to hold. The compressor now holds too (200 ms, `GLUE_COMP_HOLD_MS`), and on the same
two genres:

| | file dip (median) before | after |
| --- | --- | --- |
| trap-rap | −2.18 dB (**−0.67**) | **−2.57 dB (−1.88)** |
| disco | −4.09 dB (−4.31) | −4.32 dB (**−4.33**) |

The sample reads **`duckErasedInMaster` 0 of 12** and **`weakDuck` 0**, so the budget is ratcheted 1 → 0 with its
0.38 dB margin recorded. The change moves the master's level slightly, so the 159 trims are stale again and one more
re-record is in flight — the batch's design, not a surprise.

### A2's ramp half — measured, and fixed in the content (2026-09-24)

The objective asked for a probe proving that a bar's level moves with the pattern's velocity ramp. It now does, and
the answer took a sweep to find: the master chain **hands back about five sixths** of any build, linearly.

| velocity ramp in the pattern | file's build (chicago-house, `probe_arrangement_audio --ramp`) |
| --- | --- |
| 6 dB | **+0.27 dB** |
| 9 dB | +1.06 dB |
| 12 dB | **+1.81 dB** |

So a 3.8 dB ramp — what the club form's build carried — arrived as about a tenth of a decibel, i.e. not a build, and
no master-chain setting was needed to explain it: the bus compressor plus the ceiling simply reduce the louder bars
more, in proportion. The fix is therefore in the content, and it is one edit to the form table: the club form's
intro→build ramp is now **0.3 → 1.0 (10.5 dB)** and the song form's verse ramp carries a comparable rise, which the
probe measures as **+23 %** in the file. Its assertion changed with it — from "the build does not invert" (the most
that could honestly be asserted before) to "the file's build gains ≥15 %" — and `arrangementForm.test.ts` pins the
forms' ramp depth so a future edit cannot quietly return to a tenth of a decibel.

### Listening review — what `agy` found on 2026-09-24, and the three gaps it opened

`docs/AUDIO_REVIEW.md` records the tool and the workflow. Its first two reviews (a disco loop and an 87-second ambient
loop, both rendered through the same offline path the exporters use) produced four things worth acting on, and one of
them is a *gap in this plan's claims* rather than a defect in the audio:

| finding | our side | what to do |
| --- | --- | --- |
| side **28.7 dB** below mid on disco, correlation **0.997**; ambient **0.9867**, side/mid **−21.2 dB** | `narrowStereo` (A1) already lists both | independent corroboration, from listening rather than from the gate — A1's remaining work is unchanged and now has a second witness |
| "几乎没有明显的侧链抽吸避让" on disco | the release hold moved the file's median dip from −0.3 to **−3.82 dB** | **disagreement to resolve**: is a −3.8 dB median dip audible as ducking, or is the median flattering a duck that is still mostly gone? Measure the *shape* of the dip (depth over time), not just its median |
| LRA **0.6 LU** ("机械感偏重") | `thinDynamics` 0 offenders, but that claim reads **per-track velocity spread**, not master dynamics | **one of the two is measuring the wrong thing** — a master-dynamics claim (EBU R128 LRA) is missing, and the loop-driven arrangement is a plausible cause of a 0.6 LU range |
| a **1.74 s** silent tail (disco) and a **3 s** fade (ambient) | `cutTail` asks only that the tail be *below* −60 dBFS | **`cutTail` has no floor**: a loop asset that cannot be looped seamlessly passes. The claim needs a second half — silence *inside* the loop versus silence *after* it |

The last one is the kind of thing only listening finds: every number we have about the tail says "good", and the
musical fact is "this cannot be used as a loop".

### The WASM seam (recorded 2026-09-24, at the user's request to start it early)

The repository already has **one** WASM dependency and it is properly pinned: the vendored GS-1 synth core
(`vendor/gs1`, v2.1.6, ABI 8) ships as `public/gs1/synth_core{,_scalar}.wasm`, is synced by `scripts/sync-gs1.mjs`
and asserted **byte-identical** to the pin by `check:gs1` — so "add WASM" is not an open question here, it is a
question of which ABI the pin exposes.

**A3's GS-1 half is the one place that needs more of it**, and the measurements say exactly what is missing:
`workletProcessor.js` already handles `noteBend` and `tuning` (calling `gs_note_bend` / `gs_set_tuning_note` behind
`if (this.wasm.…)` guards), the vendored engine already offers `noteBend(note, semitones)` and `setTuning(table)` —
and the shipped core exports **neither**: its 104 exports are `gs_note_on`, `gs_note_on_pan`, `gs_note_off`,
`gs_pitch_bend`, `gs_set_param`, `gs_set_param_inst`, … but no per-note bend or tuning entry point, so those branches
are dead with this pin. `gs_set_param`/`gs_set_param_inst` are **per instrument, not per note**, so no amount of host
code can make a GS-1 voice vary per note today.

Consequence, and the decision it needs: per-note timbre on GS-1 requires an **upstream ABI bump** in
`groove-synth-gs1` (a core exporting those two functions), not more adapter code. `gs1Contract.test.ts` now asserts
the current state and **fails the day the pin gains either export**, which is the prompt to expose it in `Gs1Host` and
finish A3's GS-1 half rather than rediscover why it was impossible. Until then A3's GS-1 scope is honestly
velocity + pan per note, and the native poly synths carry the per-note timbre variation.

### Handoff — the batch's state at the end of this session (2026-09-23)

**Landed and verified**: A1 (width, `narrowStereo` ratcheted 12 → 9 → 8 on two agreeing runs), A4 (the riser), A3
(native path, with the GS-1 gap measured and named), B7 (playback plays the arrangement, playhead mapped, the A↔B
contradiction removed), and A2's **compressor** half (with the bus compressor alone the sidechain dip measures
−4.42 dB against a −4.40 dB mechanism).

**One bug is open, and it is the reason A2 is not closed** — with three things learned about it this round, all
recorded beside the `detector: null` line so the next attempt starts where this one stopped: the DSP is cleared
(isolation probe: −1.00 dBTP with *and* without a detector, both implementations, hand-built two-input graph); a
detector below **1e-6** is now treated as a wiring failure rather than a quiet passage (the `!== 0` test I first wrote
passed denormal residue, which asks for `ceiling / 1e-9` — no reduction — and is exactly the `+1.42 dBTP` measured);
and a worklet in an **OfflineAudioContext** delivers neither `port.postMessage` nor `console.log` while rendering, so
its own view of its inputs cannot be observed there. That last one cost three diagnostic attempts and is the reason
the next step is the **realtime** engine, where the same wiring can be watched: if it limits live, the fault is the
offline/async interaction around the node swap rather than the DSP, the graph or the kernel.

**The original bug**: the ceiling's own pre-duck detector — implemented,
kernel-tested, worklet-mirrored — **stops the ceiling limiting in the render path** (chicago-house at +1.36 dBTP
against a −1 dBTP contract; a re-record that followed asked 49 genres for a −9 dB cut). With `detector: null` the same
render is −1.30 dBTP. The DSP is cleared by an isolation probe (`scratch/limiter_detector_probe.mjs`: −1.00 dBTP with
and without a detector, both implementations), so what remains is *why the bus reads as silent in the render path*
when its taps are connected before rendering. The wiring is off and the capability stays.

**One re-record is in flight** (`Manual verify · scope=trim`, dispatched 2026-09-23 on the corrected code) and it is
the one that matters: read the report first — `clampHits` must be 0 and `arrangedTruePeakDb` ≈ −1.30 — then
`apply_loudness_trims.mjs`, then `Manual verify · scope=audio` for `check:loudness:fresh`, then
`Manual verify · scope=verify` as the release pre-flight. The pre-flight already ran once and reached the loudness
freshness check with **everything before it green**.

**Everything is green as of 2026-09-24**, in the one path that judges it: the push CI (unit tests, four groove
shards, `groove-gate`, all three E2E legs) and `Manual verify · scope=verify` (the full chain including
`check:loudness:fresh` against the applied trims, `check:timbre`, the probes and the device matrix). Two measurement
lessons from getting there are worth more than the green tick:

* **One judge, one path.** Three configurations rendered the same twelve genres and read three different `cutTail`
  counts (1 on four separate runners, 2 serially in one job, 5 with four shards fanned out inside one job — the last
  two starving the renderer). `verify` no longer renders the sample; `groove-shards`/`groove-gate` own the judgement.
* **Four budgets are the *worst* reading, not the best.** `flatStabs 2`, `cutTail 2`, `narrowStereo 9`, `thinMids 11`
  — because the genres that flip sit *at* their thresholds (0.9896–0.9963 against 0.98; x1.02–x1.12 against 1.5), so
  the count moves with runner load. Tightening them waits for a render that repeats, which is P0.8's open fork. The
  claims that read **0 in every observation** stay at 0, and those are where a regression shows up first.

**`duckErasedInMaster` ships at 1**, documented in `check_groove.mjs` with the mechanism: the compressor's half is
fixed, the ceiling's half is the unwired fix above. The earlier reading of 0 was measured against a ceiling that had
stopped working, and the correction is beside both numbers.

### P1 — content design (data, in category batches)

| # | Change | Where | Verification | Effort |
| :-- | :--- | :--- | :--- | :--- |
| 1.1 | **Ghost notes and velocity accents** in the drum patterns ✅ | `src/data/genreGroove.ts` — one table per category plus named exceptions, applied at the end of `patternFromGenre`; no genre file is touched | Measured at the **pattern level** (no audio render) on 2026-09-23, which is the plan's own bar: snare `max − min ≥ 15` went **1/11 → 11/11** and hats **8/11 → 11/11** of the sampled genres that sound. The rhythm half is pinned too: every original onset keeps its step, the hat lane gains no onsets at all (accents are velocities), and a ghost is always the sixteenth before a hit and quieter than it. Two findings shaped the rule — lowering the off-eighths unconditionally *flattened* chicago-house's hat lane (its open hat is on the "and"), and three lanes put every hat on the same sixteenth, where the fallback is to alternate. Everything it does lowers a velocity or adds a quieter onset, so the library's peaks do not move. **And the claim is now under the ratchet**: `check:groove` gained `thinDynamics` (budget 0) because `flatTracks` — which only counts lanes with a *single* value — could not see this at all, which is exactly how P0.2 read as "fixed" while the grooves still sounded flat. | M | **done** |
| 1.2 | **Mid-range fill** — **content landed; the claim's −6 dB threshold is unreachable by content or tilt, and is re-based below** | `src/data/genreMid.ts` (applied at the end of `patternFromGenre`) | The **pad** doubles a chord stack's top note an octave up (harmonically neutral by construction: same pitch classes, asserted per stack), and a **thin bass lane follows the chord it is under** — the structural claim, which is the honest one: **7 of 12** genres already walked, and the ones that did not were thin for a second reason (`trap-rap` changes chord six times and its bass carried two pitches, i.e. it was not following the progression at all). Distinct pitches **7/12 → 10/12**; the two that stay at two are named in the test (`liquid-dnb`'s progression *is* two chords, `minimal-techno` has no chord lane). **But `midBandShareDb` did not move: measured on four genres through the offline engine, −11.90 / −8.46 / −7.47 dB before and after (0.00 dB), and chicago-house −10.05.** The reason is measurable and not a content problem: `chordVoiceGain` is `1/√n`, so adding a note *redistributes* the chord's energy rather than adding any, and the chord lane is a small part of a master dominated by kick, bass and hats. **And the mix lever was measured too, and it does not work either.** A category-wide **tilt** (cut the kick/bass/hats by 5 dB to make room — a cut rather than a boost, because `TrackMix.volume` is 0..1 and the live engine clamps to 1.0, so a boost would make the bounce and the audition disagree) moved disco −11.90 → −11.70 and reggaeton −8.46 → −7.49: **+0.2 and +1.0 dB for 5 dB of low end given up.** Reaching a −6 dB share that way would need 25 dB of tilt, i.e. no bass at all. The tilt is reverted; the two measurements are the finding. | M | **content done, claim re-based** |
| 1.3 | ~~**Harmonic movement inside the loop** for the 6-in-15 static genres~~ | — | **Dropped**: the static-harmony claim came from the skeleton basis; the played pattern already moves (0 of 12 static). | — |
| 1.4 | ~~**Percussion texture**: shaker/conga/clave patterns on the off-beats, low velocity~~ | — | **Already holds, measured 2026-09-23**: every one of the eleven sampled genres with a sounding percussion lane has ≥ 4 onsets *and* more than one velocity, and `ambient` has no drum lane at all (correctly — it must not be given one). There is nothing to generate, so `genreGroove.ts` deliberately does not. A test records the measurement so a future change that strips the texture fails rather than being noticed by ear. | — |
| 1.5 | **A fill in the last bar** ✅ | **landed with the arrangement layer (P2.1/B5)**, which is what it was waiting for: `arrangementForm`'s `fill` override puts hits on the clip's own drum lanes in a section's last pass. `src/test/arrangementForm.test.ts` asserts the row's wording directly ("the last bar's onset count differs from the others") plus the two properties that make it usable — the fill *adds* to the backbeat rather than replacing it, and its velocity scales with the section's ramp so a fill at the end of a build still builds. | done |

### P2 — engine and product

| # | Change | Where | Verification | Effort |
| :-- | :--- | :--- | :--- | :--- |
| 2.1 | **An arrangement layer**: a pattern gains sections (A/A/B/A + a fill), so "change the chord every 8 bars", "add a riser", "vary the stab" become data instead of wishes | `src/types/genre.ts` + the renderer + the sequencer's bar model | a 4-section song renders with measurable variation per section (`patternStatistics` per section differ) | L — the deepest item here, now specced in `docs/ARRANGEMENT_PLAN.md` |
| 2.2 | **Per-note timbre variation**: seeded detune / cutoff / send nudges per stab | `PolySynth` (and GS-1 patch params) | consecutive stabs differ in centroid by ≥ 3 %; with a fixed seed two renders match | M |
| 2.3 | **Saturation depth** per category, and the master chain's give-back | `insertCurves` + the channel strip + `masterGraph` | crest factor and the 3rd-harmonic ratio rise without the true peak moving. P0.3 added the reason to look: `duckErasedInMaster` proves the bus compressor and the ceiling *refill* short dips on loud genres (disco: −4.4 dB of sidechain becomes −0.4 dB in the file), which also flattens the per-note dynamics P0.2 added. Drive that claim's budget from 1 to 0. | M |
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
| done | **P0.3 audible sidechain** (2 dB → 3.8–5.1 dB measured, shared scheduling helper) | — |
| done | **P0.5 swing 8ths + P0.6 tail** (swing claims 0, tails ≤−82 dBFS) | — |
| **done** | **B7 the transport plays the arrangement** (`docs/ARRANGEMENT_PLAN.md`) — no audio, cannot stale the trims, and it is the largest gap between a surface and the app | — |

| done | **P1.1 accents + ghosts** (snare spread 1/11 → 11/11, hats 8/11 → 11/11 at the pattern level); **P1.4 measured and retired** (it already held) | touch/jank ratchet |
| done | **P1.2 measured to its end**: the content half landed (pad + bass walk), and the audio claim was tested twice — content (0.00 dB) and a 5 dB mix tilt (+0.2/+1.0 dB) — both rejected *by measurement*. `thinMids` keeps its metric and its budget (11, the ratchet that stops a regression) but its **claim text is corrected**: −6 dB was aspirational, the library's mid content is inherently sparse, and the honest reading of the number is "compared against this library, not against a target". | — |

| **done 2026-09-24** | **A1–A4 as one batch, then the re-record**: width at 3.0 · the master chain's two release holds (`duckErasedInMaster` 1 → 0) · the content-side build (+23 % in the file) · per-note timbre on both engines (GS-1 at ABI 9) · top-end texture. Trims and timbre fingerprints re-recorded; released as v2.16.0 → v2.19.0 | touch/jank ratchet |
| **open** | **P2.5's one-shot texture instruments**: `vinyl_texture` / `vocal_chop` / `found_sound` are routed and playable, and no genre declares one yet — the `vinyl_crackle` half of P2.5 shipped in v2.18.0, so what is left is a curation choice plus a trim re-record | — |
| **open** | **A1's literal target of 3** would need stereo unison in the core (GS-1's `spread` is detune-only) or a chorus / stereo widener the app does not have; both are new features, and 7 is the measured floor until one lands | — |
| **open (documented)** | the ceiling detector's +1.42 dBTP mystery (detector wiring stays off); the reference recordings P2.5 will play instead of the generated stand-in | — |

The first two rows touch no CSS and no component; the skin rows touch no audio. Neither gate can mask the other.

**The same recording put a second cluster under the floor**, and it is worth naming because the remedy was not the
same: `microhouse` ↔ `ambient-techno` measured **0.1892 dB** because the two — plus `dub-techno` — declared the
**same drums, bass and chords** (`sub_kick`, `rimshot`, `closed_hat`, `rim_shaker`, `sub_bass`, `warm_pad`) and
differed only in lead and fx. Changing the lead bought almost nothing (0.2659 dB) and changing the kick bought
*nothing measurable at all* — the fingerprint is a 13-band mean over the whole render, so a lead is a small part of
it and two sub kicks are one part. What moved it was `microhouse`'s own palette, which is also what the genre is:
`punchy_kick`, `finger_bass`, `vibraphone` and `bell_lead` instead of the dub-techno weights. Measured after:
`microhouse` ↔ `ambient-techno` **0.4133 dB**, `microhouse` ↔ `dub-techno` **0.3841 dB**, and the pair left closest
is `ambient-techno` ↔ `dub-techno` at **0.2774 dB** — above the 0.25 floor, and honest about being the library's
tightest corner: three neighbouring styles that deliberately share a rhythm section. The floor is not lowered for
them; the measurement is recorded instead.

### P2.5's content: the crackle half is the content, and the one-shot half has nowhere to sit (2026-09-24)

The remaining P2.5 item was "pick 1–2 genres and declare a texture instrument". An inventory of the lane says why it
is not that simple, and an audition says why it should not be done anyway:

* **the `fx` lane is a single transition hit per loop in all 159 genres** — one onset in 16 steps for every candidate
  checked (lofi-hip-hop, trip-hop, boom-bap, future-garage, conscious-hip-hop, neo-soul, downtempo, chillwave,
  glitch-hop, phonk, jazz-fusion). There is no free lane: a one-shot texture either replaces the genre's existing
  transition or displaces a musical part;
* two idiomatic swaps were tried and **rejected by ear**: `chillwave`'s `tape_stop` → `vocal_chop` ("the tape stop
  belongs to chillwave's tape haze; the new hit lands on the beat every bar and interrupts the drift") and
  `glitch-hop`'s `tape_stop` → `found_sound`. Both were reverted.

So P2.5's *content* is what shipped in v2.18.0: the 26 genres that already declared `vinyl_crackle` — the instrument
whose whole meaning is a recording — now play one. The one-shot instruments (`vinyl_texture`, `vocal_chop`,
`found_sound`) stay routed, playable and documented as available; no genre is worse off for not using them.

**One real gap came out of it.** The instrumentation guard refused a texture instrument on an `fx` lane because it
had no exact or alias key — i.e. with the GS-1 pool switched off, such a lane would have fallen through to the legacy
per-role default nobody chose. `INSTRUMENT_PRESET_ALIASES` now carries the three (a crackle has a true native twin; a
chop and a found sound borrow the closest short one-shots), which is also what makes `--no-gs1` renders comparable.

**A second, smaller lesson.** A listening review of the `vocal_chop` render concluded the native fallback had played,
and cited the alias table added the same hour — a reading it could only have got from the file, not from the audio.
The check that settles that question is two renders: the same genre with the pool on and off differ, so the lane was
GS-1's. `render_genre_wav.mjs --no-gs1` is now the tool for it, `gs1SampleTexture.test.ts` asserts the native engine
builds no oscillators for a routed texture lane, and the review's *musical* verdict (which did not depend on that
attribution) is what reverted the swap.

### Safari: the GS-1 worklet is silent in an `OfflineAudioContext` — and it is not a regression (2026-09-25)

A user report: on Safari the MP3/WAV exports and the stem exports have no sound, and during playback the lead is
audible but wrong. Measured with `probe_engine_parity.mjs` (the same genre's eight lanes rendered in Chromium and
WebKit through the app's own offline path):

| lane | Chromium | WebKit |
|---|---|---|
| kick, snare, hats, percussion, bass | — | match within 0.0–0.8 dB |
| `chords`, `lead`, and an `fx` lane playing a sample texture | audible | **silent** |

The three silent lanes are exactly the GS-1-routed ones, so a stem export of `chords` or `lead` is an empty file and a
full export loses all harmony and lead while keeping drums and bass. The host builds (the ABI contract passes) and the
planner routes to it, so nothing falls back: a track with a host is a track that is "handled".

**The first diagnosis was wrong and worth recording as such.** Swapping the SIMD core to ABI 8 appeared to make the
lead audible on WebKit, which pointed at the ABI 9 re-pin. It was an artefact: only one of the two cores was swapped
while `GS1_EXPECTED_ABI` still said 9, the adapter rejected the mismatch, **GS-1 was switched off entirely**, and the
audible result was the native fallback. Redone properly — both cores at ABI 8 *and* the expectation matched — WebKit
renders the GS-1 path **silent on ABI 8 too**, and the native fallback audible beside it. So:

* the export defect is **pre-existing and engine-level** (the worklet runs and outputs nothing in Safari's offline
  context), not a regression from ABI 9, and a core rollback would buy nothing;
* the **live** symptom is a second, different defect — the same worklet *does* run in Safari's realtime context, and
  the report there is "audible but a very strange sound", not silence.

Both need their own fix, and the shape of the first one is clear: the offline renderer has to verify the voice **in
the context it renders in** (a short probe render through the same kind of `OfflineAudioContext`, and a re-render with
GS-1 off when it comes back silent) rather than trusting a realtime probe, which answers a different question.

### The near-mono claim cannot be met by panning — proved by an audition, not by a number (2026-09-24)

`narrowStereo` reads **7** after the ratchet, and the plan's literal target is 3. The obvious lever is the pan
control, so it was measured properly first, with a new tool: `scripts/render_genre_wav.mjs` renders a genre through
the app's own offline path and encoder and writes a WAV, which is what the audio-review step
(`agy -p "@/tmp/x.wav ..."`) needs and what the command line did not have.

The numbers were encouraging. `chicago-house`'s correlation is repeatable to **0.00013** across three runs (0.98100
/ 0.98087 / 0.98099), so it is not noise; hard-panning the sustained roles (chords/lead/fx, which the width stage
scales by 3 and clamps) moved seven genres like this:

| genre | before | after hard pans |
|---|---|---|
| trap-rap | 0.9964 | **0.9750** |
| chicago-house | 0.9809 | **0.9766** |
| reggaeton | 0.9822 | **0.9618** |
| detroit-techno | 0.9875 | 0.9851 |
| minimal-techno | 0.9940 | 0.9937 |
| disco | 0.9953 | 0.9938 |

…and then the audition rejected the change outright: *"left has Chords + Hi-Hat + FX stacked and right has only the
Lead — severe imbalance and headphone fatigue; hard-panning a mono source is not how house gets its space; keep
chords at −0.15…−0.25 and lead at +0.15…+0.25, and never beyond ±0.5; the width comes from stereo detune, chorus,
stereo delay and the reverb returns."* The change was reverted, and the measurement was right about the numbers and
wrong about the music — which is what the audition is for.

**Three routes were then measured, and all three are dead ends — the third for a reason worth knowing.**

| lever | chicago-house correlation | verdict |
|---|---|---|
| hard-pan the sustained roles | 0.9810 → 0.9766 | works numerically, **rejected by the audition** |
| ping-pong delay only | 0.9810 → 0.9810 | nothing: the delay's return is 0.2 and its send is small |
| ping-pong + delay return 0.34 + reverb return 0.36, width 1 | 0.9810 → 0.9807 | sound changed a lot, image by 0.0003 dB |
| `organStack` unison 3 + spread 0.8 | 0.9810 → 0.9809 | nothing — and here is why |

The last row is the informative one. GS-1's `spread` is a **detune** spread (±35 cents at full, `osc[0].spread` in the
core), and its unison sub-voices are rendered into a single mono scratch buffer (`unison_buf`) before the voice's own
pan is applied. So unison makes a voice *thicker*, never *wider*: there is no stereo spread across the stack to ask
for, which is exactly what the audio review recommended ("stereo detune, chorus") and exactly what does not exist.

What would actually reach the plan's target of 3, in order of honesty: (a) **stereo unison in the core** — place the
unison sub-voices across the field (an upstream change, and the natural companion to ABI 9's per-note tuning);
(b) a **chorus / stereo widener** effect the app does not have; (c) accept **7** as this architecture's floor, which is
what the ratcheted budget does. Until one of (a) or (b) lands, the budget is the measurement and the plan's "12 → 3"
line is refuted rather than pending.

The review also settles the claim's ceiling: the **existing** resolved pans are already outside its recommended
range (chords −0.36, lead +0.6), so the mix is at the pan limit and the near-mono reading is a property of the
architecture, not of a missing nudge. Getting to 3 means stereo *processing* — a chorus/spread on the sustained
roles (GS-1 has unison and spread; the native presets have `oscSpread`), or wide reverb returns with the centre
carved out — which is a sound change of its own and needs its own audition. Until then the budget stays at the
measured 7, which is the honest number for the mix that ships.

### The timbre gate's first honest full-library recording (2026-09-24)

Re-recording all 159 fingerprints for the P2.5 content change turned up something the committed baseline had been
hiding: it was recorded on **2026-09-20**, before the A1/A2/A3 batch, and `check:timbre` compares pairs *within* the
baseline — so a stale file passes by construction while the shipping sound drifts underneath it.

The fresh full-library recording put the closest pair at **0.1330 dB** (`french-house` ↔ `nu-disco-house`, floor
0.25 dB), against 0.6407 dB in the stale file. Not noise: a two-genre re-run reproduced 0.1329 dB exactly. The cause
is visible in the data — both genres declared the **same eight instruments** (`punchy_kick`, `clap`, `closed_hat`,
`rim_shaker`, `slap_bass`, `rhodes_ep`, `saw_lead`, `noise_sweep`) with near-identical onset counts, so the only
thing separating them was whatever the older mixes happened to add.

The fix is a curated palette for `nu-disco-house`, which is also what the genre is: `m1_organ` (the disco organ
stab), `pluck_synth` (a plucked synth lead) and `finger_bass` (a fingerstyle funk bass) instead of the
french-house `rhodes_ep` / `saw_lead` / `slap_bass`. Measured after the change: the same pair is **1.1963 dB**
apart — in the range of the historical closest pairs (1.0641 / 1.1353 dB), which is what the floor was derived
from. The baseline is now recorded against the current sound, so this class of drift is visible from here on.

