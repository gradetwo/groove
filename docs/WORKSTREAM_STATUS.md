# Where the two workstreams stand (2026-09-28, live v2.34.18)

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

## Method notes worth keeping, all learned by being wrong here

* **A local green is evidence about the tree that was checked, not the tree that is pushed.** A release failed on `'"kick" | … | "fx"' and '"audio"' have no
  overlap` while the local tree compiled, because the pushed mirror differed in **1791 files**. `scripts/sync_release_mirror.sh` now compares every tracked file,
  proves equality, and says to commit **before** syncing (it only sees tracked files).
* **A closed union is not always an instrument.** Widening `track_id` raised **one** type error, and widening `ClipSlot` raised **none** — so safety came from
  tests, and the tests had to be written for what the compiler could not see (six hardcoded "four"s; `isDrumTrack` calling an audio lane a drum at lane 0).
* **A finding is not a rule.** The 64-bar clamp was recorded as a finding, the owner's decision resolved it, and the test now asserts the better thing.
* **Guards should be read, not re-run.** Every time a gate disagreed, reading which step failed was faster than another attempt — and twice the answer was that I had
  changed the wrong code path.
