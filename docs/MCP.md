# Groove Lab MCP server

An [MCP](https://modelcontextprotocol.io) server that exposes the genre library, the sequencer, the exporters and
the audio analysis to other LLMs and agents. This document is the contract: what is exposed, what is deliberately
not, how it runs, and which gate keeps it honest.

```
┌──────────────┐   stdio (JSON-RPC)   ┌───────────────────────┐   pure TS   ┌──────────────────┐
│ LLM / agent  │ ◄──────────────────► │  groove-mcp (Node)    │ ◄─────────► │ src/data,        │
│ (Claude, …)  │                      │  tools · resources ·  │             │ src/audio,       │
└──────────────┘                      │  prompts              │             │ src/utils        │
                                      └──────────┬────────────┘             └──────────────────┘
                                                 │ only for audio rendering
                                                 ▼
                                      ┌───────────────────────┐
                                      │ headless Chromium     │  renders through the app's OWN
                                      │ + Vite dev server     │  `renderPatternOffline` — no
                                      └───────────────────────┘  test hook in the web bundle
```

## Why it can exist at all

Three properties of this codebase make a Node-side MCP server possible without touching the browser app:

1. **The library is data.** All 159 genres, their patterns, mix tables, chord progressions, relations and
   masterclasses are TypeScript modules under `src/data/` with no DOM dependency. They bundle for Node with
   esbuild and read as plain objects.
2. **The exporters are mostly pure.** MIDI (`generateMidiBytes`) and the share-link codec
   (`encodeSharedSequencer`) are byte-level JS with no Web Audio. An agent can compose, export and share without
   ever rendering sound.
3. **Rendering already has a headless path.** `scripts/measure_genre_loudness.mjs` and
   `scripts/analyze_export_audio.mjs` render through the app's real `renderPatternOffline` from a Playwright page
   served by the **dev** server. The MCP renderer reuses exactly that route, so an audio result is produced by the
   same code the export button uses — and the production bundle keeps having no test hooks.

## Layout

| Path | What it is |
| :--- | :--- |
| `mcp/server.ts` | the stdio entry point: builds the registry, connects the transport |
| `mcp/registry.ts` | every tool / resource / prompt with its schema — the single source of truth |
| `mcp/tools/*.ts` | the handlers, split by concern (library, pattern, export, analysis) |
| `mcp/render/worker.ts` | the lazily started Vite + Playwright renderer |
| `mcp/README.md` | how to run it in an MCP client |
| `scripts/build_mcp.mjs` | esbuild bundle → `dist-mcp/groove-mcp.mjs` (one file, plain `node`) |
| `scripts/check_mcp.mjs` | boots the built server over stdio and calls it — the gate |
| `src/test/mcpTools.test.ts` | the pure handlers, unit-tested in Node |

The server lives **outside `src/`** on purpose: `src/` is the layered application, and `scripts/check_isolation.mjs`
proves that `src/features` and `src/audio` compile with **no surface present**. An MCP server is a new *consumer*
of those layers, not a surface of the app — putting it in `src/` would either need the isolation experiment
weakened or would drag the Node entry point into the web build. Nothing under `src/` imports `mcp/`, and a redline
says so.

## Tools

Read-only tools are marked ▢, tools that change something outside the session ▣ (see *Safety*).

### Library

| Tool | Arguments | Returns |
| :--- | :--- | :--- |
| `list_genres` ▢ | `category?`, `limit?`, `offset?` | id, name, category, bpm, key, era, track count |
| `get_genre` ▢ | `id` | full metadata, instrumentation, description, pro tips, pattern summary, mix, relations |
| `search_genres` ▢ | `query`, `limit?` | scored matches over id, name, subgenre, description, era, origin |
| `list_categories` ▢ | — | the seven categories with genre counts |
| `get_genre_relations` ▢ | `id` | influences / influenced-by / siblings, as recorded in `src/data/relations.ts` |
| `list_chord_progressions` ▢ | `category?` | the popular-progression library |
| `get_chord_progression` ▢ | `id` | degrees, roman numerals, example songs, emotional tag |
| `get_loudness_report` ▢ | `genreId?` | the committed baseline (LUFS, true peak, trim) for one genre or the whole table |

### Song (arrangement)

An agent composes a *timeline* here, not a loop: `create_song` returns a `songId`, `add_section` places clips on it,
and `render_song` bounces the whole arrangement through the offline engine it uses for a pattern.

A section is not only "which clip, how many times":

* `velocityScale` — one multiplier for the whole section (a quieter breakdown);
* `velocityRamp: [from, to]` — the multiplier at the section's first and last pass, so `[0.6, 1]` over eight
  passes *is* an eight-bar build;
* `fill: true` — a drum fill on the section's last pass. The lanes come from the clip (`fillForTracks`), not from
  a list the model would have to guess: a pattern with no drum-ish lane gets no fill rather than a fill on a chord;
* `transpose` (±24) — moves the section's pitched lanes. Drums are untouched by construction: only a step that
  carries a pitch moves, and a kick carries none.

Every one of them is reported back in the summary's `overrides`, and all of them end up in the same flattened
pattern the app's own export renders — there is no second renderer.

`render_song` bounces the whole arrangement through the same offline engine `render_audio` uses (the flattening
is B2's `flattenSong`, so the tool cannot render something the app would not). Songs live in the server process.

| Tool | Arguments | Returns |
| :--- | :--- | :--- |
| `create_song` ▣ | `genreId?`, `pattern?`, `name?`, `bpm?`, `swing?`, `resolution?`, `bars?`, `label?`, `clips?` | `songId` plus the arrangement summary; clip A is seeded from the genre's *arranged* pattern, or from an explicit `pattern`, and `clips` seeds further slots |
| `set_clip` ▣ | `songId`, `slot`, `pattern?`, `genreId?` | the song's shape after one slot's clip is replaced (or seeded from a genre) — how a section gets its own variation |
| `add_section` ▣ | `songId`, `slot`, `bars?`, `label?`, `mute?`, `velocityScale?`, `velocityRamp?`, `fill?`, `transpose?`, `index?` | the whole arrangement (shape, bar count, per-section overrides, problems) |
| `duplicate_section` ▣ | `songId`, `index`, `at?`, `bars?`, `label?` | the arrangement with a copy of that section, its clip and **all** its overrides intact |
| `get_song` ▢ | `songId`, `includePatterns?` | the clips (each with its pattern), the sections in order, the shape and the tempo — what makes a composition readable and re-exportable |
| `export_groove` ▣ | `songId`, `outputDir?` | a **validated** `.groove` package under `GROOVE_MCP_OUT`, carrying the arrangement rather than a flattened copy |
| `undo_song` ▣ | `songId`, `steps?` | the arrangement as it now stands, one change back by default — every song change is recorded with an `opId`, which `get_song` lists under `history` |
| `render_song` ▣ | `songId`, `format?`, `bitrateKbps?`, `maxDurationSec?` | a WAV/MP3 path under `GROOVE_MCP_OUT`, its duration, loudness and true peak — every section, in order |

The package this writes is specified field by field in [`GROOVE_PACKAGE_FORMAT.md`](GROOVE_PACKAGE_FORMAT.md).

### Render budgets, as numbers rather than intentions (2026-09-28)

An external evaluation proposed staged render SLOs, on the correct observation that a minute-level render makes an agent's
trial-and-error loop unusable. What this server can honestly claim today is narrower, and it comes from CI logs rather than from a
plan: each song render in the audio scope takes **tens of seconds**, and the texture probe now prints its timings (`render timings :
as written Ns · fx lane cleared Ns · fx saturated Ns`) so the number is produced by every run instead of being remembered.

| budget | target | today | what closes the gap |
|---|---|---|---|
| a **cold** render (first in a page) | — | **5.4 s** measured | browser and page start-up, not the audio: the same probe's later renders take 0.4 s and one took under the timer's resolution |
| a **warm** render | ≤ 20 s | **0–0.4 s** measured | already met; the evaluation's "minute-level render" is about cold start and about long songs, which is the growth measured in `GROOVE_QUALITY_PLAN.md` |
| an analysis-only render | ≤ 1 s | **0.1 s at 8 kHz** measured | met: `render_song` with `sampleRate: 8000` |
| a full song render | ≤ 20 s | tens of seconds for a *long* arrangement | the render is one `page.evaluate` over an offline context; the super-linear growth with step count is measured in `GROOVE_QUALITY_PLAN.md` |
| an analysis-only render (energy curve, spectrum) | ≤ 1 s | **built, measured by the texture probe** (`render_song` with `sampleRate: 8000`) | the exporter builds its context at the requested rate (`WavExporter.ts:320`), so this really renders fewer samples — about a fifth of 44.1 kHz. **Mono is still missing**: the context is created with the exporter's two channels, and threading that through is the remaining piece |
| a section render | ≤ 5 s | available today by rendering a one-section song | already possible with `render_song` on a song whose `sections` hold one entry |

`analyze_audio` is browser-free and reads a file in milliseconds; the budgets above are about **rendering**, which is why the analysis
tools landed before the render path changed.

**Loudness needs no analysis tool.** `render_audio` and `render_song` already return gated loudness and true peak for the file they wrote;
`analyze_audio` adds the discontinuities, correlation, tail, spectral shape and energy curve. An evaluation proposed `analyze_loudness` as
a separate tool — it would return a number the caller already has.

**`bars` counts passes, not measures.** A genre's seeded clip is four measures long (64 steps at 16 to the bar), so `bars: 4` is
sixteen measures; every song summary reports `passBars` (measures per pass) and `secondsEstimate`, which is what to read before
rendering. `render_song` also takes `maxDurationSec` and refuses before it starts the browser, because long arrangements take
minutes and the call reports no progress while it runs.

### Sequencer

| Tool | Arguments | Returns |
| :--- | :--- | :--- |
| `get_pattern` ▢ | `genreId` | the genre's default pattern verbatim |
| `apply_pattern_ops` ▢ | `pattern`, `ops[]` | a **new** pattern with the operations applied (never mutates the library) |
| `validate_pattern` ▢ | `pattern` | diagnostics: step-count agreement, velocity range, unknown track ids, gate/pitch length mismatches |
| `pattern_statistics` ▢ | `pattern` | per-track density, velocity spread, note range, off-beat ratio, recommended swing |
| `validate_prosody` ▢ | `tones[]`, `pitches[]`, `syllables?`, `threshold?` | the reversals between a lyric's tones and a melody's movement — advisory, never throws, no pinyin guessing, and 3+3 sandhi changes what it expects rather than rewriting your tones |
| `generate_melody` ▢ | `tonic`, `mode?`, `bars?`, `form?`, `range?`, `seed?`, `density?` | lane-shaped arrays (`steps`, `pitch`, `velocity`, `gate`) plus the contours, phrase ranges and interval statistics — contour-first, in key by construction, at most two octaves, deterministic for a seed, `AABA` repeating its first phrase literally |
| `suggest_progression` ▢ | `tonic?`, `mode?`, `emotion?`, `category?`, `avoid?` | a progression from the committed library for a feeling, rendered in the key: the roman numerals, the concrete chords, and the songs that used it — feed `chords` to `apply_pattern_ops` **`set_chord_progression`** |
| `estimate_key` ▢ | `genreId?`, `pattern?` | the tonic, mode and fit from the pattern's **pitches** (a pitch-class histogram against major/minor profiles) — the notes rather than an FFT of a kick-heavy loop |
| `spectral_balance` ▢ | `path` | the 13-band shape of a rendered WAV with named bands, plus the spectral centroid — the same fingerprint the timbre baseline uses |
| `compare_genres` ▢ | `a`, `b` | bpm/key/track/pattern/mix differences |

`apply_pattern_ops` is the composition primitive. Each op is one of:

```
{ "op": "set_step",     "track": "kick", "step": 4 }
{ "op": "clear_step",   "track": "hihat", "step": 6 }
{ "op": "set_velocity", "track": "snare", "step": 8, "velocity": 112 }
{ "op": "set_pitch",    "track": "bass", "step": 0, "pitch": 36 }
{ "op": "set_gate",     "track": "chords", "step": 0, "gate": 2 }
{ "op": "transpose",    "semitones": -12, "tracks": ["bass"] }
{ "op": "humanize",     "amount": 0.25, "seed": 7 }
{ "op": "swing",        "amount": 35 }
{ "op": "clear_track",  "track": "percussion" }
{ "op": "copy_track",   "from": "kick", "to": "percussion" }
```

Every op that involves chance takes a **seed**, and the result is deterministic for it: an agent that asks twice
gets the same groove back, which is what makes a generated pattern worth writing down.

### Export

| Tool | Arguments | Returns |
| :--- | :--- | :--- |
| `export_midi` ▢ | `pattern`, `bpm?`, `filename?` | base64 of a Standard MIDI File (8 tracks, 16th grid) |
| `share_url` ▢ | `pattern`, `genreId?` | a `groove://`-free https URL that opens the app with the groove loaded |
| `render_audio` ▣ | `pattern` or `genreId`, `format: "wav" \| "mp3"`, `bars?` | a file path + duration, loudness, true peak, per-track peaks |
| `analyze_audio` ▢ | `path` (a WAV this server produced) | LUFS, true peak, pinned samples, discontinuity count, band shape, stereo correlation |

`render_audio` writes into `$GROOVE_MCP_OUT` (default: the OS temp directory, one run per call) and returns the
path, so a 4-bar WAV never has to travel through the model's context as base64. `analyze_audio` closes the loop:
an agent can render, measure, change one op and measure again.

### Resources

| URI | Contents |
| :--- | :--- |
| `groove://genres` | the whole library index as JSON |
| `groove://genre/{id}` | one genre document |
| `groove://loudness` | the loudness baseline table |
| `groove://changelog` | the release notes the app itself shows |

### Prompts

`compose_groove` (a genre + a mood → a pattern and its ops), `explain_genre` (why a genre sounds the way it does,
grounded in its own description and tips), `practice_plan` (a study order over the masterclass and tutorial data).

## Safety and limits

* **The library is never mutated.** `get_pattern` returns a copy; `apply_pattern_ops` returns a new pattern. There
  is no tool that writes to `src/data/`.
* **The filesystem surface is one directory.** Only `render_audio` writes, only under `GROOVE_MCP_OUT`, and the
  filename is derived from the genre id — never from model text.
* **The browser is started lazily and once.** `render_audio` and `analyze_audio` on a rendered file are the only
  tools that need Chromium; `GROOVE_MCP_NO_BROWSER=1` turns them into a clear error instead. Everything else is
  pure Node, so an agent doing library work never pays 300 MB of browser.
* **Determinism.** Given the same pattern, ops and seed, every tool returns byte-identical output. The renderer
  inherits the app's own determinism (a repeated render differs only where Chrome's DSP does; see the README).
* **No network, no credentials.** The server makes no outbound requests; the share URL it produces is a string, not
  a fetch.
* **Honest about what it does not know.** `get_genre` returns the *recorded* metadata (era, origin, description,
  tips) rather than generated prose, and `get_loudness_report` returns measured numbers.

## Running it

```bash
npm run mcp:build        # bundle → dist-mcp/groove-mcp.mjs
npm run mcp              # build + serve on stdio
npm run check:mcp        # the gate: boot it, list, call, verify
GROOVE_MCP_OUT=/tmp/groove npm run mcp
```

An MCP client config for Claude Desktop / any stdio client:

```json
{
  "mcpServers": {
    "groove-lab": {
      "command": "node",
      "args": ["/absolute/path/to/groove/dist-mcp/groove-mcp.mjs"],
      "env": { "GROOVE_MCP_OUT": "/tmp/groove-lab" }
    }
  }
}
```

## Transports

**stdio** is what this ships: it is what desktop MCP clients speak, it needs no hosting, and it keeps the app's
deployment untouched. A **streamable HTTP** transport is designed for but not implemented — it would live as a
route on the existing Cloudflare Worker and expose the read-only tools over the deployed origin. That is a
deliberate second step rather than a hidden one: it needs auth, rate limits and a decision about which tools may
run remotely (rendering certainly may not), and none of that should be invented quietly inside a stdio server.

## Gates

| Gate | What it protects |
| :--- | :--- |
| `npm run check:mcp` | the bundle builds and the server answers `tools/list` plus two real calls over stdio |
| `src/test/mcpTools.test.ts` | every pure handler: schemas, determinism, error messages, no library mutation |
| `npm run redlines` (R7a) | the tool/resource/prompt sets are still declared in full, and nothing under `src/` imports `mcp/` |
| `npm run check:budget` | unchanged by construction (the server is outside the web build) |

## Gaps this contract is *not* missing (2026-09-28)

An external evaluation (a "v4" report, written against v2.34.3) listed read-tools, resources, prompts, project persistence, mixer
buses, render SLOs and a changelog resource among the gaps. Checked against the code, most of them are already here, and the checklist
matters more than the report: **ordering work by a stale gap spends the budget on finished work.** The full table, with file:line on both
sides, is in [`V4_REVIEW_PLAN.md`](V4_REVIEW_PLAN.md); the short version:

| claimed missing | actually |
|---|---|
| read/analysis tools | `get_pattern`, `pattern_statistics`, `validate_pattern`, `compare_genres`, `get_loudness_report`, `render_audio`, `analyze_audio`, `get_song` are all declared above |
| Resources and Prompts | four resources and three prompts are declared, registered, and now **checked against this document** by `npm run check:mcp` |
| project persistence, an arrangement model | `.groove` version 2 carries `arrangement` and validates it; [`GROOVE_PACKAGE_FORMAT.md`](GROOVE_PACKAGE_FORMAT.md) is the specification |
| undo | the **app** keeps history per `onChange`; the **MCP server** does not, and that narrower claim is the open work |
| mixer buses and a channel strip | `ReverbBus`, `DelayBus`, `MasterLimiter`, `ChannelStripDsp` and the channel-strip view exist; what is missing is the mixer *view*, inserts, sidechain and PDC |
| render SLOs | already measured and recorded, including the super-linear growth, in [`GROOVE_QUALITY_PLAN.md`](GROOVE_QUALITY_PLAN.md) |

Two further corrections are the report's own: **Logic has no global Chord Track**, and its "AI" is embedded rather than absent. Those
are the places where it is more accurate than the evaluations that came before it.
