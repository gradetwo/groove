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
| P3 | there is no `.groove` export | **true.** `exportProjectPackage` is not referenced anywhere under `mcp/`; the tool set has MIDI, Ableton and share links only. |
| P4 | `analyze_audio` takes WAV only | **true.** Its description is "Analyse a rendered WAV" and its schema takes `path: "a .wav path"` (`registry.ts:322-326`), so measuring an MP3 delivery means rendering the song twice. |
| P2b | `create_song` cannot label its first section | **true.** `add_section` has `label` (`registry.ts:394`) and `create_song` does not, so the shape reads `A×4` where `主歌×4` is meant. |
| P3b | `render_song` derives the filename from the genre id | **true, and deliberate** — the server never lets model text name a file. The report's own suggestion (whitelist the sanitised song name) is the way to keep that guarantee and still be useful. |
| O1 | `analyze_audio` reports ~2406 discontinuities | **plausible, unverified by ear.** `flattenSong` renders the sections into one pattern with no cross-fade at mute/velocity jumps, so a click at a section boundary is possible. It is a listening question, and the fix (a 5–10 ms fade at the jumps) is small if it is audible. |
| F1 | no C-pop / mandopop genre | **true.** `search_genres "mandopop"` returns nothing out of 159 genres; writing a Chinese ballad means substituting neo-soul, which is a real style mismatch. This is a **data** task (a genre file plus its mix and voicing), not a tool fix. |

**Order, by what unblocks composition rather than by what is easiest**: P1 (expose `set_clip` and pass `clips` through
`create_song`), P2 (`get_song`), P3 (`export_groove`), P4 (mp3 in `analyze_audio`), then the two small ones, then O1 if it is
audible, then F1 as content work.
