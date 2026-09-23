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
and `render_song` bounces the whole arrangement through the same offline engine `render_audio` uses (the flattening
is B2's `flattenSong`, so the tool cannot render something the app would not). Songs live in the server process.

| Tool | Arguments | Returns |
| :--- | :--- | :--- |
| `create_song` ▣ | `genreId?`, `pattern?`, `name?`, `bpm?`, `swing?`, `resolution?`, `bars?` | `songId` plus the arrangement summary; clip A is seeded from the genre's *arranged* pattern, or from an explicit `pattern` |
| `add_section` ▣ | `songId`, `slot`, `bars?`, `label?`, `mute?`, `velocityScale?`, `index?` | the whole arrangement (shape, bar count, per-section overrides, problems) |
| `render_song` ▣ | `songId`, `format?`, `bitrateKbps?` | a WAV/MP3 path under `GROOVE_MCP_OUT`, its duration, loudness and true peak — every section, in order |

### Sequencer

| Tool | Arguments | Returns |
| :--- | :--- | :--- |
| `get_pattern` ▢ | `genreId` | the genre's default pattern verbatim |
| `apply_pattern_ops` ▢ | `pattern`, `ops[]` | a **new** pattern with the operations applied (never mutates the library) |
| `validate_pattern` ▢ | `pattern` | diagnostics: step-count agreement, velocity range, unknown track ids, gate/pitch length mismatches |
| `pattern_statistics` ▢ | `pattern` | per-track density, velocity spread, note range, off-beat ratio, recommended swing |
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
| `groove://docs/architecture` | `ARCHITECTURE_SURFACES.md` |

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
