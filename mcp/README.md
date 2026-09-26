# groove-lab MCP server

Give an LLM or agent the genre library, the sequencer, the exporters and the measurements. 159 genres with their
real patterns, composed and exported without a browser — and rendered through the app's own engine when a file is
actually wanted.

The contract (every tool, resource, prompt, limit and gate) is in [`docs/MCP.md`](../docs/MCP.md).

## Quick start

```bash
npm ci
npm run mcp:build          # → dist-mcp/groove-mcp.mjs
GROOVE_MCP_OUT=/tmp/groove npm run mcp
```

`npm run mcp` builds and serves on **stdio**, which is what desktop MCP clients speak.

## Client configuration

Claude Desktop, Cursor, or any MCP client with stdio servers:

```json
{
  "mcpServers": {
    "groove-lab": {
      "command": "node",
      "args": ["/absolute/path/to/groove/dist-mcp/groove-mcp.mjs"],
      "env": {
        "GROOVE_MCP_OUT": "/tmp/groove-lab"
      }
    }
  }
}
```

On Windows the `command` is `node.exe` and the path uses backslashes.

## Environment

| Variable | Default | What it does |
| :--- | :--- | :--- |
| `GROOVE_MCP_OUT` | a fresh temp directory per call | where `render_audio` writes |
| `GROOVE_MCP_ROOT` | the working directory | the repo root the renderer should serve (set it if you launch from elsewhere) |
| `GROOVE_MCP_APP_URL` | `https://groove.wangda.today` | the origin `share_url` links to |
| `GROOVE_MCP_NO_BROWSER` | unset | `1` disables `render_audio` (everything else still works) |
| `GROOVE_MCP_PORT` | `5399` | the dev-server port the renderer uses |

## What an agent can do with it

```
search_genres "boom bap"              → the genre, its era, tempo, instrumentation
get_genre boom-bap                    → cultural context, rhythm features, production tips, mix, lineage
get_pattern boom-bap                  → the pattern it actually plays
apply_pattern_ops                     → clear a step, humanize the hats with a seed, set swing
validate_pattern / pattern_statistics → is it well formed, and what does it sound like on paper
share_url                             → a link a human can open and hear
export_midi / export_ableton          → files for a DAW
render_audio wav|mp3                  → a real file through the app's own engine, with LUFS/true peak/balance
analyze_audio                         → measure what came out
```

## Notes

* **Nothing in the library is editable.** `get_pattern` returns a copy and `apply_pattern_ops` returns a new
  pattern; there is no tool that writes to `src/data/`.
* **Only `render_audio` needs Chromium.** It starts a Vite dev server and a headless browser on first use (~40 s
  cold, then a few seconds per render) and keeps them for the session. It renders through
  `renderPatternOffline` — the same code the export button uses — so the audio is the app's audio, not a second
  implementation of it.
* **The bundle is ~4 MB** of JavaScript (the whole genre library, its metadata and the loudness table). It is a
  local Node artifact and never reaches the web bundle; `npm run check:budget` is unaffected by construction.
* **`npm run check:mcp`** is the gate: it boots this server over stdio, lists tools/resources/prompts and calls
  the browser-free tools for real.

## Verified gap list — composition through MCP (2026-09-28)

An AI composer drove the server end to end and reported what it could not do. Every claim below was checked against the code
before anything was changed; the file:line is the evidence.

| # | Claim | Verified |
|---|---|---|
| P1 | a song can only ever have clip A | **true.** `setMcpClip(songId, slot, pattern)` exists at `song.ts:207` and **no `set_clip` tool** exposes it (`registry.ts` has no such name), so the one function that replaces a slot's clip is unreachable from MCP. `createSong` **already accepts `clips`** (`song.ts:118`, `...(input.clips ?? {})`), so this is a **schema + passthrough** fix rather than new behaviour. |
| P2 | there is no `get_song` | **true.** Nothing in `mcp/` returns a song's clips and sections; the song lives only in the server's map, so the composition cannot be read back or re-exported. |
| P3 | there is no `.groove` export | **closed.** The package format could not carry a song's arrangement (C1 in `docs/DAW_MCP_REFACTOR.md`), so the format grew an `arrangement` field and a version bump first, and `export_groove` now maps a song onto the exporter, validates the package **before** writing it, and reports what it carried. |
| P4 | `analyze_audio` takes WAV only | **true, but the second render was avoidable for a different reason.** The description said "Analyse a rendered WAV" and the schema took a `.wav` path, and neither said what the render already returns: `render/worker.ts` computes **gated loudness and true peak for both formats** (`:210-211` for MP3, `:221-222` for WAV) and the tool's own description lists them. So the fix is not an MP3 decoder — the analyser decodes the app's 16-bit PCM on purpose and a decoder would be a new dependency — it is **saying where the numbers are**, which the two descriptions now do. `analyze_audio` is for the metrics a render does *not* return: discontinuities, correlation, tail level, the 13-band shape. |
| P2b | `create_song` cannot label its first section | **true.** `add_section` has `label` (`registry.ts:394`) and `create_song` does not, so the shape reads `A×4` where `主歌×4` is meant. |
| P3b | `render_song` derives the filename from the genre id | **true, and deliberate** — the server never lets model text name a file. The report's own suggestion (whitelist the sanitised song name) is the way to keep that guarantee and still be useful. |
| O1 | `analyze_audio` reports ~2406 discontinuities | **plausible, unverified by ear.** `flattenSong` renders the sections into one pattern with no cross-fade at mute/velocity jumps, so a click at a section boundary is possible. It is a listening question, and the fix (a 5–10 ms fade at the jumps) is small if it is audible. |
| F1 | no C-pop / mandopop genre | **true.** `search_genres "mandopop"` returns nothing out of 159 genres; writing a Chinese ballad means substituting neo-soul, which is a real style mismatch. This is a **data** task (a genre file plus its mix and voicing), not a tool fix. |

**P3 surveyed (2026-09-28)**: the app's exporter is **pure**, which makes this smaller than it looked.
`exportProjectPackage(project, appVersion)` (`src/features/sequencer/projectDb.ts:496`) only *builds* the package object — no browser,
no IndexedDB — and a wrapper beside it does the `JSON.stringify`. The module's IndexedDB work is all inside functions, so the MCP
server (Node) can import it the way it already imports `genreMix`. What is missing is therefore a **mapping**, not a dependency:
`export_groove` has to turn a song (clips + sections + tempo, which `get_song` now returns) into the `GrooveProject` the exporter
takes, run the package's own validation, and write the JSON under `GROOVE_MCP_OUT` like the render tools do. The mapping is the
design question, and reading the type answers it: **`GrooveProject` holds exactly two patterns** — `patterns: { A, B }` plus
`activeSlot` and `songMode` (`src/types/project.ts:12-27`) — and **nothing that can carry a clip slot or a section**. A song has
up to four clips and an ordered arrangement, so a `.groove` export of a song is **lossy today** and no amount of wrapping changes
that.

Three honest routes, in order of how much they cost:

1. **export the A/B clips as the project's two patterns**, and say in the tool's result exactly what was dropped (C/D clips and
   the section timeline). Useful immediately, honest by construction, no format change;
2. **refuse** a song that uses more than A and B, and export the rest — same code, a stricter contract;
3. **extend the package format** with an optional arrangement field and bump its version (`validateGroovePackage` is the gate
   that would have to learn it). This is the only route that makes the round trip lossless, and it is a **format decision for the
   owner**, not something a tool should slip in.

The tool should ship route 1 or 2 and name the limitation in its output; route 3 is recorded here so the choice is made
deliberately rather than by accident.

**Order, by what unblocks composition rather than by what is easiest**: P1 (expose `set_clip` and pass `clips` through
`create_song`), P2 (`get_song`), P3 (`export_groove`), P4 (mp3 in `analyze_audio`), then the two small ones, then O1 if it is
audible, then F1 as content work.
