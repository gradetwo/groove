# Where the time goes, and what a creator is missing — MCP and web

**What this is.** A 5-minute Hans Zimmer-style cue ("Iron Tide", 100 BPM, 4/4, 125 bars, 10 sampled parts,
2,096 notes) built twice: once through the **MCP tool surface**, once through the **web UI**. Everything in the
tables below was measured while doing it, on this machine (8 cores, 16 GB, headless Chromium 1243, v2.35.1). The
second goal is the useful one: what the two surfaces *cannot* do, and what that costs a person.

**Conditions, stated because they matter.** The MCP full render and the web interaction pass overlapped for a few
minutes; the render pins **one** core, so the web numbers below carry ≈12 % CPU contention and should be re-run on
an idle machine before anyone treats the last digits as a target. The render, CPU and memory figures are uncontended.

---

## 1. The measurements, by stage

### 1.1 Shared engine (both surfaces render through it)

| stage | measurement | where |
| --- | --- | --- |
| offline render, 8 bars / 7 lanes, 125.6 s audio, 44.1 kHz stereo | **379.4 s end to end = 0.30× realtime**; `startRendering()` is **99.8 %** of it (378.7 s) | `profile_offline_render.mjs` |
| the same render's non-DSP work | voice scheduling 385 ms, GS-1 host build 92 ms, graph 76 ms, WAV encode 311 ms — **0.3 % together** | same |
| render CPU | **106–109 % of one core** (single-threaded), ceiling 125 % | `check:render-cpu:gate` |
| flatten (`Song` → steps, the renderer's input) | 65,536 steps: 25.7 ms at 4 lanes → **649 ms at 128 lanes** (**25.3× for the same step count**); 409,600 steps → 3.16 s | `flattenCost.test.ts` |
| flatten projection | 2048 bars × 100 lanes ≈ **25 s of flattening and 159 MB of steps** before any audio | same |
| audio graph | convolution reverb impulse 74,750 frames (1.70 s) rebuilt per render; limiter + master bus compressor in the chain | `profile_offline_render.mjs` |

### 1.2 MCP path — one server process, the way a client holds one

| step | wall | reply | RSS |
| --- | --- | --- | --- |
| `list_arrangement_instruments` (the first call a creator makes) | **180.4 s**, identical on a repeat → **no cache** | **96 KB** | 121 MB |
| create / tempo / bars / rename / asset / add track | 2–7 ms each | small | ~102 MB |
| `add_arrangement_notes` × 10 (2,096 notes) | 13–64 ms each | 130 KB → **541 KB, 3.46 MB total** | 102 → 121 MB |
| `describe_arrangement` | 5 ms | 1.2 KB (plain text) | — |
| `validate_arrangement` | 654 ms | 2.1 KB | 116 → **204 MB (+88 MB)** |
| `render_arrangement_preview`, 2 bars, 8 kHz mono | 40.3 s (cold: browser + 10 orchestral instruments) | 5.3 KB | 207 → 221 MB |
| `render_arrangement_preview` warm, 1 lane, 8 kHz mono | 8 bars 1.5 s, 32 bars 2.4 s, **128 bars 6.8 s** (≈38× realtime for this light fixture) | — | ~200–221 MB |
| **`render_arrangement`, the whole 5:00 cue, 44.1 kHz stereo** | **517.6 s (8 m 38 s) = 0.58× realtime**, 53 MB WAV, −9.14 LUFS, true peak −1.28 dBTP | 94 KB | median 245 MB, **peak 447 MB** |
| the whole MCP session | 518.6 s, of which **99.8 % is that one render** | — | peak 447 MB |

### 1.3 Web path (1820×918, 10 parts, contention noted)

| step | wall | note |
| --- | --- | --- |
| create a blank project (+ a first track) | 288–329 ms | panel, template + Create |
| set tempo / bars | 49–61 ms each | toolbar inputs |
| **add one sampler track** | **2,256–6,879 ms** (≈3.0 s typical; the first also loads the sampler) | one click each — 9 clicks ≈ 28 s |
| switch a track's kind to `sampler` | 3,017 ms | header kind select |
| **open the instrument library** | **≥11.5 s (one run), >40 s (another)** | 315 programs; search *after* it opens is 97–199 ms |
| choose an instrument | 781–3,037 ms | row click → chip name |
| open the piano roll | 1,586 ms | track picker + Roll tab |
| **bulk entry — import a 5-minute MIDI (10 parts, 2,096 notes)** | **127 ms to the mapping dialog + 303 ms to place = ~0.6 s** | dialog names all **10 parts** with 49 instrument options; **Confirm is disabled until one part is mapped**, Skip places them all as synths |
| **the arrangement's length after that import** | **stays 8 bars** while the file's music reaches **125** | the ruler, the regions and the transport all stay 8 bars; setting Bars to 125 by hand costs **394 ms** |
| draw one note in the roll (the *editing* gesture, not the entry path) | 368–507 ms per landed note | later steps need a horizontal scroll: 4 of 8 targeted cells landed |
| "Copy selection" (the only repeat gesture) | 7,206 ms | duplicates the marked span **once**; the copies are not re-selected, so pressing again does nothing new |
| start playback (11 imported parts) | **393 ms** to the first playhead movement | frames p50 16.7 ms, p95 21.6 ms, worst 45.8 ms, 1 frame >32 ms, 0 long tasks |
| page JS heap | **15–16 MB with 11 imported (synth) lanes**; 43 MB with one *sampler* lane; **391 MB with ten sampler lanes and the instrument library open** | so the memory is in sampler state + the library, not in track count |
| boot / first paint (from `perf:check`, idle machine) | desktop FCP 1,300 ms, LCP 2,424 ms, CLS 0.000; mobile 4G+4× FCP 3,568 ms, LCP 6,192 ms | initial route **226 KB gzip** |

---

## 2. What a creator is missing (the findings, in the order they bit)

### 2.1 Both surfaces

1. **There is no loop, repeat or pattern primitive.** A Zimmer cue *is* an ostinato: one 8-bar figure twelve
   times. On MCP all 2,096 notes had to be generated outside the tool and pushed in; on the web the only repeat
   gesture is "Copy selection", which duplicates the marked span **once** and leaves the copies unselected. This is
   the single largest musical-workflow gap in the product.
2. **A 5-minute piece is at the model's edge.** `MAX_BARS = 128` (both the MCP `set_arrangement_bars` schema and
   the toolbar's Bars input), so 5:00 in 4/4 is only reachable at **≤ 102.4 BPM**. At 120 BPM the cue needs 150 bars
   and cannot be expressed at all. Length is a *duration*, not a bar count, and the model says otherwise.
3. **Playback is the loop's bottleneck.** MCP: **8 m 38 s** to hear the 5:00 cue, on **one core** of eight. Web:
   the same engine, so the same wait at export. A creator cannot iterate at this cadence, which is why both
   surfaces end up used in "write a lot, listen once" mode.
4. **Nothing exposes the mix.** Reverb, master compression, the limiter and per-part reverb are fixed by the
   render path; only synth lanes take `apply_gs1_patch`. "More hall on the strings" — the defining move of the
   genre — is inexpressible on both surfaces.
5. **Discovery is the most expensive thing after rendering.** MCP's catalogue call is **3 minutes / 96 KB,
   uncached**; the web's instrument library takes **11–40 s** to show its first list. Both are pure listing work.
6. **No dynamics/tempo automation as a *gesture*.** A tempo map exists on MCP (`set_arrangement_tempo_map`) and
   the arrangement has regions, but neither surface offers "swell here", "rit. into the hit", or a velocity curve
   across a phrase — the vocabulary this style is built from.
7. **Memory grows with track count.** 10 sampler tracks ≈ **391 MB** of JS heap in the page and ~245 MB in the MCP
   server, before any audio is loaded.

### 2.2 MCP-specific

8. **Replies are O(the arrangement), not O(the edit).** Ten note calls returned **3.46 MB** (the last 541 KB)
   because every reply restates the whole arrangement. For an agent that is context; for a person it is noise.
9. **`validate_arrangement` cannot say "ready".** It costs **+88 MB** and its problems are dominated by
   `no sample "…" — no samples ship with the app yet`, so `ready: false` cannot distinguish a missing pack from a
   typo in an asset id.
10. **The preview's cold start dominates short previews.** 40 s for 2 bars, of which ~25 s is browser + instrument
    load; a warm 128-bar preview is 6.8 s. There is no "keep the renderer warm" notion in the protocol.
11. **`add_arrangement_notes` silently declines on `fx`/`folder` lanes** (it reports `requested` beside the
    count — good), but a mistyped `trackId` is only visible by comparing counts.

### 2.3 Web-specific

12. **Editing operations that should be instant cost seconds.** Adding a track is ~3 s; switching a kind is 3 s;
    starting playback is 3.2 s; "Copy selection" is 7.2 s. Each is a full re-render of the surface, not an edit.
13. **The roll's visible window fights the mouse.** The grid is 128 steps wide; cells outside the visible area do
    not receive a coordinate click. Drawing the ostinato means scroll-click-scroll, at ~0.45 s per note — **≈16
    minutes of clicking for 2,096 notes**, before any musical judgement.
14. **The bulk path is the file, and the file arrives with the wrong length.** MIDI import is fast and names the
    parts (measured above), but it leaves the arrangement at **8 bars** while the music reaches 125: the ruler, the
    regions and the transport all stop at 8 until someone types 125 by hand. A creator who imports a five-minute
    cue and presses play hears sixteen seconds of it. ⭐ **This is the first thing to fix.**
15. **The instrument mapping exists only at import time.** The dialog is good — one row per part, the file's own
    names, 49 catalogue options, and the created track says which recording it ended on — but the decision cannot
    be revisited afterwards: the report itself says "re-import the file and choose an instrument in this dialog".
    `Confirm` is also **disabled until at least one part is mapped**, while `Skip` quietly makes every part a
    synthesiser (the report does say so, which is the good half).
16. **Nothing records what you play.** The arrangement *does* wire Web MIDI input
    (`ArrangementViewV2` → `useMidiInput`, `isKeyboardMode: true`) and it renders a virtual keyboard
    (`ArrangementKeyboardV2`) — but both only **audition** (`engineRef.triggerNote` / `player.audition`). There is
    no path from "I played that" to a note in `notesByTrack`, so the two input methods a creator reaches for
    first cannot put a note in. Drawing, generators and file import are the only ways in.
15. **No way to see or set the piece's *length* in time.** Bars are bars; at 100 BPM 125 bars is 5:00, at 120 BPM
    it is 4:10. The creator thinks in minutes.

---

## 3. The plan

Ordered by (value to a creator) ÷ (cost), each item with the baseline it must move and the criterion that keeps it
moved. Targets are for an **idle** 8-core machine unless stated.

### 3.1 Engine (shared; every surface inherits it)

| # | change | baseline | target | how it is verified |
| --- | --- | --- | --- | --- |
| E1 | **Parallel chunked render.** Split the timeline into N chunks with overlap, render them in N workers (or N `OfflineAudioContext`s in one page), crossfade the overlaps. The code already fades at section boundaries for the MP3 path. | 517.6 s one core | **≤ 150 s** on 8 cores (≥ 3.4×), and CPU utilisation ≥ 300 % during a render | `check_render_cpu_budget.mjs` gains a "render is parallel" reading; a new `probe:render-wall` records wall clock for a fixed fixture |
| E2 | **Reuse the render worker.** Keep the browser/page (and the loaded SFZ instruments) alive across calls instead of spawning per render. | preview 40.3 s cold vs 6.8 s warm | cold preview **≤ 10 s**; second preview ≤ 2 s | `measure_interaction_latency.mjs`-style probe: two previews in one session |
| E3 | **Cheap preview by construction.** Preview at 8 kHz mono is already 5×; add a "graph-lite" preview (no convolution reverb, limiter in-line) behind a flag. | 0.58× realtime full | preview ≥ **20× realtime** for ≤ 8 bars | preview probe with a fixed 8-bar fixture |
| E4 | **Flatten cost per lane.** The 25.3× at fixed steps is per-lane overhead: preallocate per-lane arrays, avoid re-scanning `notesByTrack` per lane, and stop materialising the 159 MB JSON proxy. | 649 ms at 128 lanes / 65,536 steps | **≤ 150 ms**, and ≤ 4× rather than 25× across lane counts | extend `flattenCost.test.ts` with a hard ceiling per row |
| E5 | **Length in seconds.** `MAX_BARS` 128 → 512 (or a `durationSec` → bars conversion at the current tempo) so a 5-minute cue at 120 BPM exists. | 5:00 possible only ≤ 102.4 BPM | 5:00 at **any tempo ≤ 200 BPM** | model test + MCP schema test; the toolbar input follows |
| E6 | **Mix and space controls.** Per-lane reverb send + a master reverb/limiter setting on the arrangement, honoured by the render. | none | a lane's reverb send is audible and settable from MCP and the UI | render A/B probe (reverb short vs long) with a spectral/decay reading |
| E7 | **A loop/pattern primitive.** `repeat_region` / a region with `repeats`, resolved at flatten time (so the data stays small). | 2,096 notes written by hand | the same cue expressible in **≤ 200 notes + repeats** | model + flatten tests; MCP tool + UI gesture |

### 3.2 MCP

| # | change | baseline | target | how it is verified |
| --- | --- | --- | --- | --- |
| M1 | **Cache and stream the catalogue.** Build the instrument list once per install (content-hashed), cache it, and add a `query`/`limit`/`category` filter; return ids and names only unless asked for prose. | 180 s / 96 KB, uncached | first call **≤ 3 s**, repeat ≤ 50 ms, default reply ≤ 8 KB | a criterion that calls it twice and asserts the second is > 20× faster; reply-size ceiling in `check_mcp.mjs` |
| M2 | **Reply by delta.** `add_arrangement_notes` and friends return what changed (counts, ranges) instead of restating the arrangement; keep a `verbose: true` escape hatch. | 3.46 MB over 10 calls | **≤ 40 KB** over the same 10 calls | `check_mcp.mjs` reply-size assertion on a 10-track fixture |
| M3 | **Make `validate_arrangement` know about the deployment.** Report `samplesAvailable: false` once, and separate "asset id unknown" (an error) from "pack not installed" (a warning). | `ready:false`, 88 MB, misleading problems | `ready:true` when the only problems are missing packs; **≤ 20 MB** growth | unit criterion on the validator's problem taxonomy |
| M4 | **Prewarm + progress for renders.** Keep one browser warm; emit `notifications/progress` per chunk with elapsed/remaining (the server already emits progress for long renders). | 40 s cold preview, 8 m 38 s render, 1 progress at start | cold preview ≤ 10 s; progress every ≤ 5 s with a percentage | scale probe (`probe_arrangement_scale.mjs`) asserts progress cadence |
| M5 | **`estimate_render_cost`** — bars × lanes × voices → seconds and MB, so an agent can choose a span or a preview before committing 8 minutes. | none | within ±30 % of the actual wall clock on the fixture | criterion compares the estimate with a measured 32-bar render |

### 3.3 Web

| # | change | baseline | target | how it is verified |
| --- | --- | --- | --- | --- |
| W1 | **Incremental editing.** Adding a track, switching a kind or starting playback must not re-render the whole surface: memoise the lane list, keep the grid's scroll/selection, and commit through the same command path without a full pass. | 3.0 s / 3.0 s / 3.2 s | **≤ 300 ms** each | `probe:latency`-style interaction probe on the arrangement surface (it already measures click → DOM) |
| W2 | **The instrument library must open in one frame.** The 315-row list is the cost: virtualise it, defer the per-row coverage probe until a row is hovered (the component already asks for coverage on hover/focus), and remember the last category. | ≥ 11.5 s / > 40 s | **≤ 800 ms** to first list | a browser criterion that clicks the chip and asserts the list within 800 ms |
| W3 | ✅ **DONE (2026-10-07) — an imported file sets the arrangement's length.** `barsCoveringNotes` (in `src/data/arrangementImport.ts`) is used by the file picker's import *and* by the MCP `addImportedParts`, so both roads agree. | 125 bars of music arrived into an 8-bar arrangement (both surfaces) | ✅ the 5:00 MIDI now lands at **126 bars** (ruler and regions follow; verified in the browser and through MCP) | `arrangementImportSamplerKind.test.ts` — "an import makes the arrangement as long as its music" (extend / never shorten / cap at `MAX_BARS`) |
| W3b | **Recording.** Route MIDI-in and the virtual keyboard into `notesByTrack` (quantise/velocity options, arm-per-track already exists as a flag): "press record, play, see the notes". | both only audition | a played phrase lands as notes and can be undone in one step | a browser probe with a fake MIDI device (`requestMIDIAccess` stub) writes 8 notes while the transport runs |
| W3c | **The mapping stays revisitable.** The per-track instrument chip already exists; make it the place the import's decision can be changed later, instead of re-importing. | decide-at-import only | any imported part can be re-pointed from its own track | UI criterion: change an imported track's asset and the lanes show the new recording |
| W4 | **Orchestral generators.** An "ostinato" generator (figure × bars × dynamic arc), a "swell" (velocity/length curve over a phrase) and a "score from chords" pass; the existing generators stay for electronic idioms. | none | one gesture writes an 8-bar orchestral ostinato | unit criteria on the generated note set + a UI test that the gesture lands it |
| W5 | **Length in seconds, on the toolbar.** Show `125 bars ≈ 5:00 @ 100 BPM` and let a person type either. | bars only | a creator can ask for 5:00 and get the bars | unit + toolbar criterion |
| W6 | **Memory per track.** 35 MB per sampler lane is mostly duplicated catalogue/coverage state; share it per instrument and drop it when the lane's instrument changes. | 391 MB at 10 tracks | **≤ 150 MB** at 10 tracks | a browser criterion reading `performance.memory` after building 10 tracks |
| W7 | **Export feedback.** A 5-minute export must show progress, remaining time and a cancel that works (the cancel exists; the estimate does not). | spinner only | progress ≥ 1 Hz with an ETA within ±30 % | export probe on a 32-bar fixture |

### 3.4 Targets, in one place

- **Hear the piece:** 5:00 stereo render **≤ 2 min** (today 8 m 38 s), preview of a phrase **≤ 2 s** warm.
- **Discover an instrument:** MCP **≤ 3 s** first call, web **≤ 0.8 s**; repeat **≤ 50 ms**.
- **Build a 10-part palette:** MCP **≤ 100 ms** total (today ~40 ms ✓), web **≤ 3 s** total (today ~28 s).
- **Enter 2,000 notes:** web **by file, ≤ 1 s** (today ~0.6 s ✓) and it must arrive at the music's own length
  (today the arrangement stays at 8 bars); by hand, the editing gestures stay sub-second; by keyboard, **it must land
  at all** (today it cannot). MCP unchanged (13–64 ms per part).
- **Memory:** ≤ 150 MB at 10 tracks (today 391 MB web / 245 MB MCP).
- **Never a silent wait:** every operation over 1 s reports progress and an estimate.

---

## 4. How this gets verified

Every target above names the instrument that owns it. Three of them do not exist yet and are part of the work:

1. **`probe:render-wall`** — fixed fixture, wall clock + CPU utilisation + peak RSS, with a ceiling (E1, E2, M4).
2. **`probe:web-interaction`** — the arrangement surface's own operation costs (W1, W3, W5): add track, switch
   kind, open library, draw/marquee/repeat notes, start playback.
3. **`check_mcp_replies`** — reply and catalogue sizes from a real stdio session (M1, M2).

The existing gates keep what they already own: `check_render_cpu_budget.mjs` (the render stays single-core-safe
until E1 makes parallelism explicit), `flattenCost.test.ts` (E4), `fileSizeBudget.test.ts` and `check:budget`
(the bundle), `probe:latency` + `probe:latency:gate` (interaction budgets), `measure_playback_smoothness.mjs`
(real-time frames/drift during playback).

---

## 5. What is not in this plan, and why

- **A native/Rust renderer.** `docs/RUST_DECISION.md` asks for exactly the measurement in §1.1 before that
  discussion, and it is now in hand: 99.8 % of the render is inside `startRendering()`. Parallelising across the
  eight idle cores (E1) is a larger, cheaper win than a rewrite, and it does not change the DSP.
- **Replacing the v1 song model.** `flattenSong` is the renderer's input and its cost curve is in §1.1; the fix
  (E4, E7) does not require retiring the model.
- **Reducing the 8 kHz preview's sample rate further.** It is not the cost; the cold start and the voice count are.
