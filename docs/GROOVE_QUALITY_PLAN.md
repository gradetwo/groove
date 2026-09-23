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
| 0.4 | **Deliberate width** — ⛔ **held, and measured** | `genreMix` (`MIX_WIDTH_SCALE` on the resolved pans) | The pan widening **works**: scaled 2.0 it took the sample from **12/12 genres effectively mono to 3/12** (detroit-techno 0.9825, ambient 0.9834, minimal-techno 0.9921) with side −9.2…−20.5 dB, comfortably mono-safe (`sideTooHot` 0/12). It is **not landed** because a hard-panned lane is up to +3 dB in one channel, so the true-peak ceiling clamps harder and the loudness falls by up to **1.9 dB** on the widest genres — and absorbing that means re-recording the 159 fitted trims, which the loudness run **refuses to publish while P0.8 is open** (its sentinel measured one genre 0.66 dB apart on identical code). A mid/side width stage was also built and measured: on the reverb return it is loudness-neutral but buys ~0.5 dB of side (12/12 stay narrow), and on the master it is audible but pays the same ceiling cost. The mechanism, the numbers and the two-line change are all here; the next session lands it immediately after P0.8. | S | **blocked on P0.8 → P0.9** |
| 0.5 | **Swing on 8th off-beats** ✅ | `src/audio/swing.ts`, used by both engines | The off-8th moves the full amount and the off-16ths half, so a pattern written in 8ths swings; the analyser's detector now looks at every off-downbeat, not just the odd 16ths (which is why boom-bap measured straight at declared swing 60). `inaudibleSwing` and `swingNotAudible` are both **0/12**. | M | done — timing changes, deliberately |
| 0.6 | **Tail per pattern** ✅ | `src/audio/renderTail.ts`, used by `WavExporter` | The tail is the genre's own reverb RT60 and its delay repeats to −60 dB (tempo-synced divisions resolved at the playing tempo), floored at the old 0.6 s and capped at 5 s. `cutTail` **2/12 → 0/12**: boom-bap went from −29.1 dBFS in its last 50 ms to −82.3, and every sampled genre is now below −82 dBFS. | S | done |
| 0.7 | **Measure the loudness and timbre baselines on the pattern the user hears** | `measure_genre_loudness.mjs`, `measure_genre_timbre.mjs` | Found while fixing A3: both baseline scripts render `applyGenreMixDefaults(genre.sequencer_pattern)` — the mix applied to the *unexpanded* skeleton. They are self-consistent (the gate re-measures the same thing), so `check:loudness`/`check:timbre` still hold, but they certify a one-loop pattern rather than a performance. Regenerating 159 baselines is a release of its own; do it deliberately, not as a side effect. | M | medium — every baseline moves |
| 0.9 | **Re-record the loudness trims after the P0.3–P0.6 mix changes** | `scripts/measure_genre_loudness.mjs` + `apply_loudness_trims.mjs` | P0.3 removes bass energy on purpose (4–6 dB of sidechain), so `check:loudness:fresh` now reads **2-step-garage −0.79 dB** against the recorded report; P0.4–P0.6 were each isolated and are loudness-neutral (the same −0.79 dB with the tail reverted, the width at identity and the pans parked). **Unblocked on 2026-09-23**: the sentinel that refused to publish was comparing two page states (see P0.8 below), and it now takes its reference on a recycled page — a 14-genre re-run that aborted at Δ +0.760 dB finishes at Δ −0.000 dB. What is left is the run itself, ~1 hour of renders, which belongs on CI/Colab rather than on the laptop. Until it lands, `check:loudness:fresh` is the one gate a release cannot pass. | S | ready to run |
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

### P1 — content design (data, in category batches)

| # | Change | Where | Verification | Effort |
| :-- | :--- | :--- | :--- | :--- |
| 1.1 | **Ghost notes and velocity accents** in the drum patterns ✅ | `src/data/genreGroove.ts` — one table per category plus named exceptions, applied at the end of `patternFromGenre`; no genre file is touched | Measured at the **pattern level** (no audio render) on 2026-09-23, which is the plan's own bar: snare `max − min ≥ 15` went **1/11 → 11/11** and hats **8/11 → 11/11** of the sampled genres that sound. The rhythm half is pinned too: every original onset keeps its step, the hat lane gains no onsets at all (accents are velocities), and a ghost is always the sixteenth before a hit and quieter than it. Two findings shaped the rule — lowering the off-eighths unconditionally *flattened* chicago-house's hat lane (its open hat is on the "and"), and three lanes put every hat on the same sixteenth, where the fallback is to alternate. Everything it does lowers a velocity or adds a quieter onset, so the library's peaks do not move. | M | **done** |
| 1.2 | **Mid-range fill**: bass moves to the 5th/octave instead of the root, and a soft pad doubles the chord an octave up | genre patterns + `genreVoicing` | `midBandShareDb` rises above −6 dB; `pitchByTrack.bass.distinct` ≥ 3 | M |
| 1.3 | ~~**Harmonic movement inside the loop** for the 6-in-15 static genres~~ | — | **Dropped**: the static-harmony claim came from the skeleton basis; the played pattern already moves (0 of 12 static). | — |
| 1.4 | ~~**Percussion texture**: shaker/conga/clave patterns on the off-beats, low velocity~~ | — | **Already holds, measured 2026-09-23**: every one of the eleven sampled genres with a sounding percussion lane has ≥ 4 onsets *and* more than one velocity, and `ambient` has no drum lane at all (correctly — it must not be given one). There is nothing to generate, so `genreGroove.ts` deliberately does not. A test records the measurement so a future change that strips the texture fails rather than being noticed by ear. | — |
| 1.5 | **A fill in the last bar** | needs P2.1 | the last bar's onset count differs from the others | M |

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
| held | **P0.4 width** (measured 12→3 narrow; waits for P0.8 → P0.9, see its row) | — |
| next | **P0.8 nondeterminism → P0.9 trim re-record** (this is the release blocker, not a nicety: it also caps how wide the mix can go) | touch/jank ratchet |
| done | **P1.1 accents + ghosts** (snare spread 1/11 → 11/11, hats 8/11 → 11/11 at the pattern level); **P1.4 measured and retired** (it already held) | touch/jank ratchet |
| next | P1.2 mid fill (bass to the 5th/octave, pad an octave up) — verified by `pitchByTrack.bass.distinct` locally and `midBandShareDb` in the nightly gate | — |
| +4 | P2.2 timbre variation + P2.3 saturation | — |
| +5 | P0.7 loudness/timbre baseline basis (own release) | — |

The first two rows touch no CSS and no component; the skin rows touch no audio. Neither gate can mask the other.
