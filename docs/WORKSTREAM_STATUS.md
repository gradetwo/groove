# Where the two workstreams stand (2026-09-28, live v2.34.18)

> **Historical status snapshot** — this records the state as of 2026-09-28/29, when the live version was v2.34.18 (package.json is now 2.34.34). The measurements are kept as the project's record.
> Two sections are superseded: the lane-cost-curve conclusion (`docs/RENDER_PROFILE.md`, 2026-09-30 — the probe has run in the `audio` scope since 2026-09-27) and the `scripts/sync_release_mirror.sh` note (retired 2026-10-01, `docs/OPEN_WORK.md` §十). The audio-lane latency has since been added to PDC's table (`docs/MCP.md`). Read status and 'next round' lines as dated.

## Where to start reading

This workstream's record is spread across several documents, each of which answers one question. Read in this order:

| document | the question it answers | one-line state |
|---|---|---|
| [`SAMPLE_LIBRARY_INTEGRATION.md`](SAMPLE_LIBRARY_INTEGRATION.md) | how a real library lands here — bytes, manifest, licence, and what SFZ it needs | ⭐ **it sounds, end to end and on real bytes**: live manifest → source-first SFZ → **126 includes fetched over the network** → **1676 regions** → a sample address → a decoded buffer (85289 frames, peak 0.091 — and 1.93399 s against the manifest's own measured 1.9340 s). Guarded by a criterion in CI's `audio` scope. What does **not** exist is a way for a user to trigger it — that is a feature, not a wire |
| [`SCALE_HUNDRED_LANES.md`](SCALE_HUNDRED_LANES.md) | what a hundred lanes cost, and whether Rust is the answer | browser floor **0.005%**; flatten **138.94 ms for 409 600 steps** (the old "~18 s" is refuted); the master knobs were 21% of one render and **~2% of another** — enough to say the rack is **≲2–3%**, not enough to say what exactly |
| [`RUST_DECISION.md`](RUST_DECISION.md) | the owner's answer to that question, and why | **no new repository, no Rust** — the reasoning is there, including where Rust *would* pay |
| [`WOW_EVALUATION.md`](WOW_EVALUATION.md) | the proposal that came before, assessed against this repository's own facts | direction right, priority wrong: sampling playback was already built here |
| [`AUDIO_TRACKS_AND_SVS_PLAN.md`](AUDIO_TRACKS_AND_SVS_PLAN.md) | the ninth track kind, its blast radius, and the part deliberately left empty | format half shipped and CI-verified; SVS is a reserved interface with no implementation |
| `WORKSTREAM_STATUS.md` (this file) | what happened, in order, with the mistakes kept in | — |

**A note on how to read any of it**: the numbers here are labelled by how they were obtained, and the failures are kept rather than tidied away. Where a figure was withdrawn — the "26% effects rack" above — the withdrawal is in the document next to the number, because a reader who sees only the second version learns nothing about why the first was wrong.


One page, because the rounds are long and nobody should have to read them to find out what is done, what is left, and what is left **on purpose**.

## The fifth report (a composer's first-hand session) — every item closed

| item | outcome |
|---|---|
| **P0** the render reports no progress | **root cause found, not patched over**: a song reaches Node as one flattened pattern and the time goes into the page's `OfflineAudioContext.startRendering()`, which has **no callback** — so there is nothing to instrument. The description now says so, carries the **measured** magnitude (14.4 s of audio in 1.45 s, about **6 s per minute**, with its provenance and a plain statement that a full-rate bounce is **not** measured), and `maxDurationSec` refuses in advance. The fix — chunked rendering — has its cut **proved** (`planRenderChunks`, five criteria) and its shape decided (below). |
| **P1.2** genreId had to be guessed | the claim was half wrong (`list_genres` **is** a tool) and half right (the error never said so). Every genre-resolving tool now names it and suggests the nearest id: `techno` → `detroit-techno`. |
| **P1.3** no standard workflow | a six-step table in `docs/MCP.md`, and its **test** caught the first version listing `add_lane` as a tool (it is an **op**). |
| **P2.5/P2.6** the truth about long patterns | the share format's 64 steps is a different limit from a clip's (none); a section's `bars` counts **bars**, not "passes"; the tool refuses past the ceiling rather than clamping. |
| **P2.4/P2.6** the ceilings | **the owner relaxed them**: 2048 bars per song, 256 per section, `A`-`H` slots — released in v2.34.18 and verified on CI. |
| **P3.7** the artifact's version | the claim could not happen (`check:mcp` rebuilds; `dist-mcp/` is gitignored) — and a cheap assertion now holds artifact and source to the same version. |
| **P3.8** the tempo semantics | `set_tempo` carries a worked 66→84→66 example, and `tempoWorkedExample.test.ts` **runs** it. |

## The sixth report (seven DSP/architecture claims) — three described a version that no longer exists

| claim | outcome |
|---|---|
| II tempo drift, IV batch lanes, V loudness write-back | **already built** (`tempoTrack`+`set_tempo`; `set_lane_slots`; `normalize_loudness` with `targetLufs`/`truePeakCeilingDb`). |
| III phase nulling | **confirmed, and measured**: stacked sub kicks sit **6.23 dB below** the louder single and **13.45 dB** down at 38 Hz. |
| VII tones ignored by generation | **the real one, now built**: `generate_melody` takes `tones` and `satisfyTones` repairs the melody using the checker's own rule, so generation and checking cannot disagree. |
| I cross-section clicks | **the premise does not match the model** (no per-section gain/filter/reverb), and whether a clip *swap* leaves a step is **not measured** — so it gets measured before anything is built. |
| VI memory, no chunked rendering | **confirmed**, with arithmetic (~1.1 GB for 6 min × 8 stereo lanes), and it shares the fix with P0. |

## The ninth lane kind (`audio`) — built, additive, released

Declared in the type and in the MCP's kind table; carried through the share codec, its guard and the package schema (allowed, **not** required); decided **by kind
rather than by name** in the four places that used to guess (the drum classifier, the mix role, the group bus, GS-1's routing); a **sample catalogue that ships
empty and says so**, where a reference naming nothing is an **error rather than silence**; and a render reply that reports skipped lanes instead of dropping them
quietly.

## What is left, and it is exactly two things — both need a browser

1. **Chunked rendering** (the P0 fix, and the sixth report's VI). Everything decidable without a browser is done: the cut is proved, and the shape is decided —
   render chunks **masterless** (four parameters, no graph change), concatenate, then run the master **once** over the finished buffer, because the master chain is
   **stateful** and per-chunk mastering is only approximate. Remaining: a `masterAudioBuffer`-style path, the slice-render-concatenate loop with N/M bar
   reporting, and the audio-scope criterion (**chunked versus single-pass, sample for sample within epsilon**, plus no level step at a section boundary).
2. **The audio path's latency, measured into PDC's table** — a **measured** row, never a declared one, following the master limiter's 7.415 ms.

## The chunking measurement: designed, in the probe, before any production change

The probe is the right place to prove this, and reading it made the design smaller than I had been carrying around:

* the probe already has `render(song, extra) → { buffer, channels[] }` (a page-side offline render of a **song**), which the boundary-click block uses;
* so a **chunk is a song with a subset of its sections** — no step-slicing, no new exporter option, and `planRenderChunks`'s bar-level plan is the general case that
  the section-level cut already satisfies;
* render each chunk **masterless** (the four parameters: `loudnessTrimDb: 0`, `masterMakeupDb: 0`, `masterBusCompEnabled: false`, a ceiling above the signal),
  concatenate the channel arrays, and compare against a single whole-song render: **max |difference|**, plus the level either side of each boundary;
* print the result the way `kickPhase` prints its verdict, so the first run produces a number rather than a gate. **Deciding whether to gate it comes after reading it** —
  which is the same order as every other measurement in this project, and the reason its gates mean something.

Nothing here needs a production change until the numbers say the chunked path matches the whole one. If they do not, the next suspect is already named: the master
chain is stateful, so a chunk that masters itself is only ever approximate.

## The first chunking measurement, read (audio scope, run 36391076005)

```
chunked vs whole : 2 sections · length 1.0266x · max |Δ| 1.674 · mean |Δ| 0.1649 (5612082 samples)
```

Two findings, and the first one was not on the list:

* **the chunks are 2.66% longer than the song** — each render carries the genre's **own reverb/delay tail**, so concatenating chunks appends a tail **per chunk**.
  Chunking therefore has to trim every chunk's tail but the last. That is a structural requirement the design had not named, and it is exactly the kind of thing a
  measurement exists to say before the code does.
* **max |Δ| 1.674 and mean |Δ| 0.1649** — full-scale, sample-level disagreement. So per-chunk mastering is not merely approximate: it is **unusable**, which turns the
  A/B fork from a preference into a requirement. The chosen design — masterless chunks, concatenate, then master **once** — is now backed by numbers rather than by
  reasoning about statefulness.

```text
boundary click   : worst step within ±10 ms of the jump 2.30e-2 → 2.30e-2 · no-jump control 2.30e-2 → 2.30e-2
boundary fade    : discontinuities 1210 → 1212 with an 8 ms fade
```

**And the sixth report's click claim comes back as "no evidence, from an instrument that cannot currently tell."** The fade changes the click metric **not at all**,
and the **no-jump control is identical** — 2.30e-2 for a real jump, a smooth boundary, with and without the fade. When the control equals the treatment, the honest
reading is about the instrument, not the audio: this probe cannot distinguish a boundary click from ordinary samples, so it cannot testify either way. The claim is
therefore **unproven rather than refuted**, and the next step is a measurement that separates the two cases (the control has to differ) before any de-clicking work is
justified.

## The second chunking measurement: the tail was the length, and something else is the discontinuity

```
chunked vs whole : 2 sections · length 1.0266x · max |Δ| 1.674 · mean |Δ| 0.1649 (5612082 samples)
lean chunks      : tail 74685 frames trimmed · length 1x · max |Δ| 1.7 · mean |Δ| 0.135 (5612082 samples)
```

**What the trim settled**: the extra length was the genre's reverb/delay tail and nothing else — **74685 frames (1.694 s at 44.1 kHz)**, a number the measurement
**derived** (`extra / (chunks - 1)`) rather than a constant anyone declared, and with it trimmed the concatenation is **exactly** the song's length (`1x`). That
also refutes the alternative I had written down: there is no hidden pre-roll or lookahead padding in the length.

**What it did not settle**: the sample-level difference is essentially unchanged (1.674 → 1.7). So neither the trim, nor the makeup, nor the bus compressor was the
cause. **The cause is state carried across the boundary** — and the reverb is the clearest one: in the whole-song render, chunk 1's reverb **decays into the
beginning of chunk 2**, while a chunk rendered on its own simply starts dry. The limiter and the compressor have the same property.

**Which corrects my own simplification from the previous round.** I had reduced a chunk to "a song with a subset of its sections" because that needed no step
slicing. It needs one after all: sample-exact chunking must render with **overlap** — each chunk rendered from `tail` frames (or bars) *before* its start, with the
lead-in discarded — and that requires rendering a **range**, which is the general case `planRenderChunks` was written for. The pieces fit; my shortcut did not.

## The third chunking measurement: the overlap did not help, and that is not yet a conclusion

```
chunked vs whole : length 1.0266x · max |Δ| 1.674  · mean |Δ| 0.1649
lean chunks      : length 1x      · max |Δ| 1.7    · mean |Δ| 0.1351
overlap chunks   : length 1.0266x · max |Δ| 1.716  · mean |Δ| 0.1876
```

The overlap variant — each chunk rendered with the previous section in front of it, the lead-in discarded — is **no better**, and its mean is slightly worse. The tempting
reading is "so continuity was not the cause", and **that reading is not yet earned**, because one shape explains all three rows at once:

* **max is ~1.7 in every variant** — including the one that carries the boundary state across;
* **mean is small and nearly constant** (~0.13–0.19);
* and the overlap's extra length is exactly the **last** chunk's untrimmed tail (1.0266x), which is what its slice arithmetic should produce.

A difference concentrated at one place per chunk — a **limiter attack at each render's own start**, where the whole-song render has only one — produces exactly that
signature: a large max, a small mean, and **no improvement from a lead-in**, because the lead-in does not remove the fresh start.

**So the next measurement is localisation, not another variant**: find *where* the difference lives. If it is the first few milliseconds of each render, the answer is a
boundary trim at the start as well as the end, and the conclusion is "chunking is exact apart from each render's own attack". If it is spread across the boundary, the
state hypothesis stands. **Same rule as the boundary-click instrument: a number that does not separate the two cases cannot decide between them.**

## The localisation: the difference is everywhere, so chunking cannot be a substitute for a whole-song bounce

```
where the diff is: head max 1.412 mean 0.2275 · mid max 1.71 mean 0.1868 · tail max 0.6964 mean 0.1837
```

**It is not the start.** The middle carries the largest max (1.71) and the three means are the same order (0.18–0.23), so the difference is **spread through the whole
chunk** rather than concentrated at each render's fresh attack — which refutes the explanation I wrote down last round, and does so cleanly, because that explanation
predicted exactly the opposite shape.

**So the state hypothesis stands, and it is not a boundary effect**: the engine's whole-song state — reverb tails, the bus compressor, the drum parallel path — runs
across the entire piece, and a chunk rendered on its own never has it. Section-level chunking therefore **cannot be sample-exact**, and no amount of trimming changes
that: the trim fixes the **length** (already exact, `1x`) and nothing else.

### What that means for P0, which is the real outcome of this measurement

**Progress and equivalence are in tension, and the numbers say so.** A chunked bounce is a *different master* — not a broken one, but a different one — so:

* **the single whole-song render stays the deliverable**, and its equivalence with itself is trivially true;
* **chunked rendering is offered as an explicitly labelled mode** for a long piece: a movement at a time, each mastered on its own, which buys **observability** (N/M
  bars, a file per movement, bounded memory) and **not** equivalence. The label has to say that, because the alternative is a composer discovering that two bounces of
  the same song differ and having no idea why;
* and the acceptance line for that mode is therefore **"same length, stated difference"** rather than sample equality — with the numbers from this run quoted in the
  docs so nobody has to re-derive them.

This is the third time in this block that a measurement changed the plan rather than confirming it (the tail's existence, the state's reach, and now the tension
itself), which is the argument for measuring **before** building rather than after.

## The GS-1 e2e failure: a **correct** engine, and a test that hard-codes a default

Two `verify` runs failed on **different** iPhone targets, and six hypotheses died before the right answer came from reading **who writes the flag**:

| hypothesis | verdict |
|---|---|
| a target watchdog timeout | ✗ the watchdog is 480 s; the failures reported 74 s and 87 s |
| the service worker returning HTML for a `.js` asset | ✗ that fallback is gated to `mode === "navigate"` / `.html` |
| the `/assets/*` branch doing the same | ✗ it has no HTML fallback at all |
| COOP/COEP/CORP blocking a module worker | ✗ the repository has no `Cross-Origin-*` configuration |
| the harness intercepting routes | ✗ no `page.route` / `abort` in the matrix |
| two sources of truth for the GS-1 switch | ✗ `useGs1Setting` uses `useSyncExternalStore` against the module flag — **one** source |

**The answer**: `AudioEngine.probeLiveGs1()` **measures** whether GS-1 makes a sound in this browser and switches it off when it does not — its own comment says "measured, not guessed", and it names Safari's worklet rendering the GS-1 core silent. So on a WebKit/iOS target the engine **deliberately** turns GS-1 off, the panel **faithfully** renders OFF through the shared store, and the e2e assertion `"GS-1 should default to on inside the panel"` fails. **Nothing in the app is wrong.**

It also explains the two symptoms that made this look like a flake: the verdict depends on `ensureLiveGs1Capability` finishing, and if the probe runs **before** audio unlock it returns `unmeasured` — which the code says "changes nothing". So ON or OFF depends on **a race with the first user gesture**, and the earlier green run was the `unmeasured` branch.

**The fix, and why it is not a relaxation**: a test that hard-codes a **default** is wrong when a runtime capability probe is allowed to change that default. The assertion becomes the **invariant**: wait for the probe to settle, then accept ON, or accept OFF **only with the measured reason on the console** — which needs a `page.on("console")` listener attached **inside this test** (the harness currently captures `pageerror` only, at `scripts/test_matrix.js:551`, and a page-scoped listener cannot leak into other cases). If it starts OFF without that reason, the test still fails, because then something really did go wrong.

Recorded before the patch because the patch touches an e2e harness this machine cannot run — and this workstream's rule is that the fix follows the reading, not the other way round.

## TRACK A closed: SFZ real instruments, judged by sfizz, in CI

The four steps the objective named, each with its evidence, and the last one running **in CI** with readings identical to the development machine:

| step | what it means | evidence |
|---|---|---|
| **A1** the oracle | sfizz builds from source in CI at tag `1.2.3` (cached, discovered rather than assumed) and reads like the known one | `✅ sfizz oracle agrees with its known reading` — `2 ch, 14336 frames, 0.3251 s, peak 0.0824`, same locally and in CI |
| **A2** the parser | `<global>` → `<group>` → `<region>` inheritance, key/velocity ranges, `tune`, round-robin, unknown opcodes ignored | 7 criteria; and the fixtures knew the format better than the first parser did (`<region> sample=x key=v` on one line) |
| **A3** the mapping | a note becomes a sample, a root and a **ratio** — one formula in the whole codebase | 5 criteria: root is 1, an octave is exactly 2 or 0.5, a tritone is 2^(6/12), `tune=100` is exactly a semitone and **combines** with the interval |
| **A4** the agreement | **sfizz's own output judges this project's mapping** — the same region, the same pitch | `note 40: 220.05 vs 220.00 · note 52: 277.24 vs 277.18 · note 60: 440.04 vs 440.00 · note 72: 466.21 vs 466.16` — 0.01–0.02%, in CI |

**What A4 deliberately does not compare, and why that is the honest version.** This project decides *which sample* and *at what ratio*; sfizz also applies a default amplitude envelope (release ≈ 0.075 s) and a default gain (−15.7 dB), both **measured**. Sample-for-sample amplitude equality would therefore be measuring sfizz's envelope rather than this code. The expectation is computed as `sourceFrequency × ratio` where the ratio comes from `playbackForNote` itself, so the mapping is what is on trial. Note 72 is the load-bearing case: −12 semitones **and** `tune=100` in one expected number.

**Two things had to be fixed for the criterion to mean anything**, and both were found by the instrument rather than by reasoning: the fixture's notes all sat on their own region's roots, so every expected ratio was 1 and a wrong ratio would have looked exactly like a right one; and the pitch estimator's first version read 3838 Hz for a 220 Hz sine, because it compared each lag against a **running** maximum. Its known limit — a strong second harmonic under a weak fundamental reads an octave high — is written into the module's contract with YIN named as the fix, rather than hidden, because **a real library's samples are not harmonic-free**.

## TRACK B: the baseline probe has a bug, and the run was green anyway

The audio scope passed (`completed success`) and the new block reported:

```
⚠️ render profile : could not measure (measured is not defined)
```

**Both halves of that are worth stating.** The bug is mine: the profile block reads `measured.song`, which does not exist in that scope, so it never measured anything. And
the run was **green** — because the probe never gates: it prints numbers or prints why it could not, by design. That design is why a broken measurement cannot turn the
chain red, and it is also why a broken measurement can go unnoticed. The print is the alarm, and it fired.

**The fix is not to guess the right variable.** It is to read what the probe actually has in scope and pass the song through deliberately — the same rule that has
prevented several blind patches in this workstream and whose violation caused four red CI runs in TRACK A.

What the run *did* confirm, from the same probe: the audio lane's latency is still **0 ms** (`scheduled at 0s, first sound at frame 0`), and the chunk difference is still
spread through the whole chunk (`head 1.412 · mid 1.71 · tail 0.6964`), so neither of those has drifted.

## The MIDI writer now has two independent confirmations, not one

The writer built for the sfizz oracle was already confirmed **by sfizz** — a C++ implementation that read its output and rendered audio from it. With `mido` installed in
`~/music/groove/.venv`, it has a second, unrelated one, and the second is what makes "an external implementation understands this file" a fact rather than an anecdote:

```
mido: type=0 tracks=1 ticks_per_beat=480 length=0.7500s
  tempo@0: 500000 µs/quarter = 120.0 bpm
mido reads: [('note-on',0,60,100), ('note-off',240,60,0), ('note-on',240,60,100), ('note-off',480,60,0), ('note-on',480,64,90), ('note-off',720,64,0)]
matches the expectations written by hand in this repository's test: True
```

Two details are worth keeping, because neither was arranged for:

* **`length=0.7500 s` is third-party arithmetic** — mido computed it from the tempo and the last note-off itself, so the tick-to-second conversion is confirmed by
  something other than the code that produced the ticks;
* **the off-before-on ordering at tick 240 survived** — a repeated pitch ends before the next begins, which is the one ordering detail that silently truncates notes when
  it is wrong, and it is now confirmed by an implementation that has no reason to agree with ours.

**Why it is a recorded one-off rather than a test**: `mido` is a Python package in a local virtualenv, and CI has neither. Enforcing it there would take a `pip install`
step; the file records the evidence and the option instead of implying a check that does not run.

**And the CI policy, as the owner restated it**: heavy work — browser probes, renders and profiling, the sfizz build, the full chain, the device matrix — belongs in the
`manual-verify` scopes and in `ci.yml`. Locally the cheap instruments run: `typecheck`, `lint`, and the unit suite.

## Telling "slow" from "stuck" in CI, in one command

The audio scope takes twenty to thirty minutes, and twice this session a run looked stalled when it was working. `gh run view --json status` answers the wrong question — it
says *in progress* either way. The question worth asking is **which step**, and since when:

```
gh api repos/<owner>/<repo>/actions/runs/<id>/jobs   --jq '.jobs[].steps[] | select(.status=="in_progress") | "RUNNING: \(.name) (started \(.started_at))"'
```

**It settled the question both times.** Once the answer was `Section-boundary fade (stage 3 measurement)`, a step that renders the arrangement many times over and is slow by
design — so the run was healthy, and the probe block I was waiting for simply had not been reached yet. The other time it exposed a build step that was genuinely failing.

**And it prevents a worse mistake than waiting**: the status endpoint makes a stalled run and a working one look identical, which is exactly the shape of check that cannot
tell you what you care about. The step API can.

## The audio scope's long pole: it is the whole probe, and the arithmetic now closes

Third observation, and this one identified it. The "step" is not a step inside the probe:

```yaml
- name: Section-boundary fade (stage 3 measurement)
  run: node scripts/probe_arrangement_audio.mjs --genre=chicago-house
```

**It is the entire probe**, named after one of its own readings, and it contains the render baseline, the split, the chunking experiment, the boundary fade and the latency
measurement — all of them rendering the arrangement repeatedly.

**And the arithmetic closes**, which is what turns an observation into an understanding:

| figure | source |
|---|---|
| one render | **72.33 s** — measured by the split |
| renders the probe makes | roughly 15–25, the chunking experiment alone accounting for several |
| therefore | **20–30 minutes** — exactly the observed step time |

So the long pole is **not a defect**. It is *N renders at ~70 seconds each*, and two independent measurements agree on that: the per-render price from the split, and the total
divided by the count.

**The actionable part is now predictable**: the probe's cost is proportional to how many times it renders the arrangement, so making the scope faster means **rendering less**,
not rewriting anything — and with the per-render price known, the saving from dropping any given measurement can be worked out before doing it.

## The audio scope's long pole, measured twice

Both audio-scope runs spent their time in the same place: **`Section-boundary fade (stage 3 measurement)`**, twenty minutes and more on that step alone, while the rest of the
scope moved quickly. It is a step that renders the arrangement many times over, so being slow is expected — but "expected" and "the thing that dominates" are different claims,
and the second one is now measured rather than assumed.

It matters because of what it costs elsewhere: a probe reading that arrives half an hour late is a round spent waiting, and this session spent several. **If that scope ever needs
to get faster, this is the first thing to split** — and the way to split it is the way the render split was done: one existing switch, one discarded warm-up, and a labelled
remainder.

Recorded here rather than in my head because the third time it is noticed, someone should be able to find out in one line that it was already known twice.

## Check the sha a dispatched run is actually testing

I read a probe's progress for several hours across many rounds, and every reading came from a run whose `headSha` was **older than the commit I had just pushed.** The workflow was
dispatched against the `dev` ref, the mirror's push had not become visible to Actions yet, and nothing in the run's output says so — the log looks exactly like the log of the build I
meant to test.

**It cost more than time.** A block I had added was absent from the output, so I spent a round concluding it had failed to print, when in fact it had never been in that build.

The check is one line, and it belongs before any reading is believed:

```
gh run view <id> --json headSha -q .headSha
```

**A dispatched run is a run of *some* commit, not of *my* commit**, and the two differ whenever the ref lags. This is the same family as "read the step, not the status" — a signal
that does not distinguish the thing you care about — and it is the one that took longest to notice, because the output was plausible the whole time.

## A running step's log is not readable — only the finished one's

While `Section-boundary fade (stage 3 measurement)` runs, `gh run view --log` returns **nothing for it**, and there is no partial output. The step is the whole probe, so this is
forty minutes of a long-running run whose log is empty until the step ends and then arrives all at once.

**That combination produced a wasted round.** The probe printed nothing, and I concluded that a block I had added had failed to print — when in fact the block was in the build and
the log simply was not readable yet. The thing that settled it was checking the run's `headSha` against the mirror's (see the note above): **the block's presence in the build is
provable before its output exists**, and those are two different questions.

So the rule for waiting on one of these: **check the sha, then check the step, and only then decide that something is missing.** "No output" is ambiguous between three states —
still running, not in this build, and broken — and the sha plus the step name distinguish all three without waiting.

## Measure elapsed time from the run's timestamps, not from how many rounds have passed

Watching a long probe across several rounds, I concluded it had been running "over two hours" and started treating that as an anomaly worth diagnosing. The clock said otherwise:

```
now              2026-09-28T20:44:45Z
job started      2026-09-28T20:17:28Z     → 27 minutes
probe step       2026-09-28T20:23:32Z     → 21 minutes
```

**Twenty-one minutes, which is exactly what the same step took in the earlier runs.** No anomaly existed. My sense of elapsed time came from the number of conversation rounds, and rounds are not a
clock: a round can be a few minutes of my work while the job moves not at all, or the reverse.

It is the fourth instance of one shape, and by now the shape is the point — **a signal that cannot distinguish the two outcomes I care about.** "How long it feels" cannot separate *slow*
from *stuck*; `started_at` can. So:

```
gh api repos/<owner>/<repo>/actions/runs/<id>/jobs \
  --jq '.jobs[] | "\(.name) | started \(.started_at) | \(.status)"'
date -u +%Y-%m-%dT%H:%M:%SZ
```

And the workflow's own `timeout-minutes: 150` bounds the wait, so a stuck job ends by itself rather than needing to be inferred.

**Measured, so the size of the error is on record**: two consecutive readings forty-one seconds apart —

```
now              2026-09-28T20:44:45Z    (end of one round)
now              2026-09-28T20:45:26Z    (start of the next)
job started      2026-09-28T20:17:28Z
probe step       2026-09-28T20:23:32Z
```

**A round is about a minute of wall time** while the probe needs twenty-plus, so "several rounds have passed" and "the job has had time" differ by an order of magnitude. That is why the
impression was wrong rather than merely imprecise, and it is the number that makes the rule usable: waiting is bounded by the CI clock, and a single bounded sleep covers what felt like
many rounds.

## `node --check` cannot see which side of an async boundary a line is on

The lane-curve block returned its points and the CI log showed nothing — indistinguishable from a block that never ran. It **had** run: the `headSha` matched, and `git show` of that build's
own copy of the file showed the block present and silent.

The cause was one line of scoping that no syntax check can report: **the `console.log` was inside `page.evaluate`, and a browser's console does not reach Node's stdout.** Every other
block in that probe returns its data and is printed from Node; this one was the exception, and the exception is invisible until you ask which side of the evaluate boundary a line sits on.

**Then the fix repeated the mistake.** The new print landed at line 231 — inside an evaluate that runs from 106 to 982 — and `node --check` passed both times. What caught it was comparing
the line number of the closing call (`}, { genreId, ramp: rampPair });`) with the line number of the print: **forty lines of reading against another round of a silent log.**

The general form, since this is the fifth member of one family: **a check that only validates syntax cannot validate placement.** Which side of a boundary a line is on is a property of the
program's structure, and `git show` plus a line number answers it; a green `node --check` does not, and never will.

## Do not block on a long deploy — work, and check back

The owner's instruction, after watching a deploy hold a turn for twenty minutes: **a long build or deploy is not a reason to stop working.** Poll it, do something else meanwhile, and check again.

It is the same rule as the four instrument ones, applied to my own behaviour rather than to a measurement: **a blocking wait is a signal that tells me nothing while consuming the thing I have least of**.
The four rules were about readings that cannot distinguish two outcomes; this one is about a *process* that cannot produce anything until it finishes, and the response is the same — get a better
arrangement rather than a better reading: start it in the background, keep working, and look at it on a schedule.

Concretely: `npm run deploy` runs `verify` first (node, actions, version, docs, the unit suite, the build), so it is minutes of waiting with a full queue of work behind it. **Waiting adds nothing to
the result**; checking later costs one command.

## Method notes worth keeping, all learned by being wrong here

* **A local green is evidence about the tree that was checked, not the tree that is pushed.** A release failed on `'"kick" | … | "fx"' and '"audio"' have no
  overlap` while the local tree compiled, because the pushed mirror differed in **1791 files**. `scripts/sync_release_mirror.sh` now compares every tracked file,
  proves equality, and says to commit **before** syncing (it only sees tracked files).
* **A closed union is not always an instrument.** Widening `track_id` raised **one** type error, and widening `ClipSlot` raised **none** — so safety came from
  tests, and the tests had to be written for what the compiler could not see (six hardcoded "four"s; `isDrumTrack` calling an audio lane a drum at lane 0).
* **A finding is not a rule.** The 64-bar clamp was recorded as a finding, the owner's decision resolved it, and the test now asserts the better thing.
* **Guards should be read, not re-run.** Every time a gate disagreed, reading which step failed was faster than another attempt — and twice the answer was that I had
  changed the wrong code path.


## ⚠️ TRACK B 的"车道成本曲线"**从未被测量过**（2026-09-28，读到的事实 ✓）

⭐ 目标里写着：**"为 1/4/16/64 条车道建成本曲线（墙钟 + 峰值内存）"** ✗ —— ⭐ **而我先前几次去 CI 日志里取 `lane curve` 都"取不到"** ✗✓ —— ⭐ **我当时把它归因于"打印坏了"或"那次运行没有跑到"** ✗。

**读一遍代码，答案是另一回事** ✓：

| 检查 | 结果 |
|---|---|
| 谁会打印 `lane curve` | ⭐ **只有 `scripts/probe_arrangement_audio.mjs`** ✓ |
| `.github/workflows/manual-verify.yml` 里有没有跑它 | ⚠️ **没有任何一行提到它** ✗✓ |
| 最近 6 次成功的 `Manual verify` 里有没有 `lane curve` | **0 次命中** ✗（**与上面一致 ✓**） |

⭐⭐ **所以：那个探针【不在任何 CI scope 里】** ✓✓ —— ⭐ **它只是我在本机跑过的一次性测量 ✓，而"取不到"是因为它从未被派出去** ✗✓。

### ⭐ 而这次归因错误，与本会话的其它几次同形

⭐ **我先把"取不到"解释成了读数问题 ✗，而它是"那个数从未产生"** ✓✓ —— ⭐ **一个数字取不到时，先问"它有没有被量过"，而不是"我是不是读错了地方"** ✓ —— **这与"先量再解释"是同一条规矩的另一面** ✓✓。

### 结论（下一轮要做的）✓

1. ⭐ **把 `probe_arrangement_audio.mjs` 接进 `audio` scope** ✓（**或只接它的车道曲线那一段 ✓**）；
2. ⭐ **然后在 CI 日志里读 1/4/16/64 的墙钟** ✓ —— ⭐ **那才是 TRACK B 这条账的收尾** ✓；
3. ⚠️ **峰值内存**：⭐ **仍然没有仪器 ✓ —— 具名，不填** ✓。
