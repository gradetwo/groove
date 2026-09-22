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
