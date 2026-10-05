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
| `mcp/render/sampleCache.ts` | the on-disk sample cache every render reads through, and its LRU bound |
| `src/audio/sampleCacheKey.ts` | what a sample's bytes are called, independently of which host served them |
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

### Custom genres

A person forks a genre in the maker and the result is saved to the browser's IndexedDB. The server is a Node process,
which has no `indexedDB` and did not reach that save at all, so the store moved behind `CustomGenreStore`
(`src/features/customGenre/customGenreStore.ts`) — an IndexedDB implementation for the browser, an in-memory one for
Node. The server half lives in `mcp/customGenres.ts`, and the tools below are its surface.

**The fork is the app's own.** `save_custom_genre` with `forkFromGenreId` calls the same `forkGenre` the maker's Fork
button calls, so the fork carries the library genre's metadata, pattern and lineage. **The store is the server
process's own**, exactly as the arrangement and song maps are: a genre saved here lives for the session, and it is
not the library a person saved in the app.

| Tool | Arguments | Returns |
| :--- | :--- | :--- |
| `list_custom_genres` ▢ | — | the session's genres, newest first: id, name, category, tempo, track count, and the genre each was forked from |
| `get_custom_genre` ▢ | `id` | the whole document and its eight-track pattern, as saved |
| `save_custom_genre` ▣ | `forkFromGenreId?`, `genre?`, `name?` | the saved genre; a fork copies the library genre's defaults, pattern and lineage, and the same id saved twice replaces the first rather than adding a second |
| `delete_custom_genre` ▣ | `id` | the ids that remain; an id that is not there is refused with the ones that are, rather than reported as deleted |
| `duplicate_custom_genre` ▣ | `id` | a copy under a new id and a name ending in `(Copy)`, original untouched |

## MCP 是功能的一部分，不是收尾工作（业主指示，2026-09-29）

> 以后一个功能开发过程中，MCP 需要第一时间提供

这条要能执行，所以它配了一个守卫，而不是留成一句嘱咐：**`src/test/mcpCoverage.test.ts` 会读 `src/data/arrangementEdits.ts` 的源码，把其中每个会改动模型的导出函数找出来，要求它要么已被某个 MCP 工具暴露，要么在一份写明了理由的例外名单里。** 少了一个，测试会红，并在消息里说清"要么加工具，要么说明为什么不需要"。

为什么用这个形式：一句"MCP 要第一时间提供"在赶时间时总是被推到后面，而"推到后面"的表现不是报错，是没人发现。把新功能的数据层操作与工具对上号，是一条能在写代码时就红、而不是等到有人问"这个 MCP 里有吗"才红的判据。

例外必须写明理由。"显示用、不影响听到什么"是一个理由；"另一个工具已经能用更确定的说法表达同一件事"也是一个理由；"暂时没做"不是。


The song tools above compose a **v1 song** — clips, sections, lane slots. The interface's `/new` route uses a different model, and until this group existed an agent could not reach it at all: no way to add a track, choose its kind, point a
sampler at one of the mirrored libraries, write the steps it plays, or file a recording onto it.

Every operation here calls `src/data/arrangementEdits` — the same code a track row's button calls — so an agent's edit and a person's edit cannot become two behaviours. What is added is the id: MCP calls are stateless, so `create_arrangement`
returns an `arrangementId` that every other tool in this group takes. The arrangements live in the server process and are not persisted, exactly as the songs are not.

**The kind decides what makes the sound, and the reply says which one it is.** `synth` is a **built-in synthesiser** — its timbre is fixed and it *cannot* be pointed at a recorded instrument; `sampler` plays a **real recorded instrument** from the catalogue; `drumkit` is the built-in drum voices; `fx` is an effect; `folder` groups without sounding. The kind was called `instrument`, and **the word was the defect**: a caller who wanted a piano read it, chose it, and got a fixed synth — so the value was renamed and `instrument` is **not accepted anywhere** (the schema refuses it and lists the values that exist; no alias, no read-time migration, per the owner's "old callers and old data may be dropped"). For a piano, strings or bass, add `kind:"sampler"` with an `assetId` in the same call.

Two things this surface states rather than leaves to be discovered:

* **What each track actually sounds through.** Every track carries a `sound` object: a sampler's catalogue `assetId`, or the built-in preset's `presetKey`/`presetName`, resolved through the path the renderer itself uses (`laneRoleForTrack`/`laneInstrumentForTrack` → `resolveInstrumentPresetKey`). `describe_arrangement` prints it on the track's own line, so a synth preset cannot be mistaken for a recorded instrument.
* **A synth track is told so, with the call that would replace it.** `problems` names the built-in preset a `synth` track sounds through **and the one call that would sound a recorded instrument instead** (`add_arrangement_track {kind:"sampler", assetId:"…"}`); the notice reaches `get_arrangement` and the render replies' `arrangementProblems`, so a track whose source nobody chose does not render in silence about it.
* **A sampler track always has an asset.** A new one is created with the default catalogue asset, and changing a track's kind to `sampler` gives it one too — so the same kind of track sounds regardless of how it came to exist. A summary reports the
  asset, and warns when a sampler somehow has none, because a silent sampler reads as a broken renderer.
* **Choosing a recorded instrument has two halves and both are here.** `list_arrangement_instruments` says what exists, `set_arrangement_track_asset` puts one on a sampler track, and `add_arrangement_track` takes the `assetId` as the track is created — so the track and its asset are one call rather than two. **The tool is named for the asset, not for a track kind** (it was `set_arrangement_track_instrument` while the kind now called `synth` was also called `instrument`, and one word for two things is what the rename removed). The id the first returns is the id the others accept, which a criterion holds together. The list is read from the manifest in the repository rather than from the network, so "what can I play" answers the same offline as online.

* **A request that cannot be carried out is refused out loud.** The data layer returns the arrangement unchanged when an asset is pointed at a non-sampler track, which is right for a button and useless for a caller that cannot see the screen. The tool
  raises instead, an `assetId` given to any kind but `sampler` is refused rather than ignored, and an unknown `trackId` is answered with the ids that do exist. A track kind this build does not have is refused by name (`requireTrackKind`) rather than compiled as nothing.

| Tool | Arguments | Returns |
| :--- | :--- | :--- |
| `list_arrangement_instruments` ▢ | `library?`, `limit?` | the catalogue assets a sampler track can play, each with its library and measured duration; `vcsl` alone declares 88 |
| `create_arrangement` ▣ | `templateId?`, `blankKind?` (`synth`\|`sampler`\|`drumkit`\|`fx`\|`folder`), `songId?` | the new `arrangementId`, its tracks, the template ids it would accept, and any problem |
| `get_arrangement` ▢ | `arrangementId` | every track's kind, name, flags, **`sound`** (the catalogue asset or the built-in preset that is actually playing), `sampleAssetId`, `steps` with `stepsOn`, and takes |
| `describe_arrangement` ▢ | `arrangementId` | one line per track — including what each one sounds with — for reading rather than parsing |
| `add_arrangement_track` ▣ | `arrangementId`, `kind`, `name?`, `assetId?` | the arrangement with the track added; on `kind:"sampler"` the `assetId` points it at its instrument **in the same call**, and `assetId` on any other kind is refused rather than ignored |
| `remove_arrangement_track` ▣ | `arrangementId`, `trackId` | the arrangement without it; a folder's children detach rather than disappear |
| `set_arrangement_track_kind` ▣ | `arrangementId`, `trackId`, `kind` | the kind changed, with the instrument rule above |
| `rename_arrangement_track` ▣ | `arrangementId`, `trackId`, `name` | the renamed track |
| `set_arrangement_track_flag` ▣ | `arrangementId`, `trackId`, `flag`, `value` | muted or soloed |
| `set_arrangement_track_parent` ▣ | `arrangementId`, `trackId`, `parentId` | attached to a folder, or detached with `null` |
| `set_arrangement_track_asset` ▣ | `arrangementId`, `trackId`, `assetId` | the sampler track pointed at a catalogue asset; refused for any other kind, **including `synth`**, whose timbre is built in |
| `set_arrangement_track_steps` ▣ | `arrangementId`, `trackId`, `steps` | the pattern written whole; a step is on when non-zero, and the length is the caller's |
| `add_arrangement_take` ▣ | `arrangementId`, `trackId`, `source`, `label?`, `recordedAt?`, `startBar?`, `endBar?` | the take filed and selected; a bar range is claimed when one is given |
| `render_arrangement` ▣ | `arrangementId`, `bars?`, `format?`, `bitrateKbps?`, `sampleRate?`, `channels?`, `headless?` | the bounce, through the same offline engine the song and pattern tools use. **An arrangement has its own length** (`set_arrangement_bars`, eight bars by default), so one pass is the whole arrangement and `bars` repeats it; the reply reports the arrangement's `bars` beside the `passes` rendered. `headless: true` renders on the **Node Web Audio host** instead of Chromium — no browser process, and it still works under `GROOVE_MCP_NO_BROWSER=1`. This project's own DSP is the same on both hosts (its limiter, bus and strip compressors are its own worklets, and the fixture's biquads agree to −0.00 dB); the residual belongs to each host's **own** nodes, and the parameter states the measured readings (1.03 dB band 3, 1.04 dB band 7, 1.612 LU) beside the bound each one sets (1.1 dB / 1.7 LU — the ceiling of those readings) and points at `docs/HEADLESS_CORE_PLAN.md` §8.13. The reply's `engine` field says which host answered. That path is **not under the render budget** — it resets and narrates a *page*, and there is none — but it **does report progress**: the Node host suspends inside `startRendering()`, so a `progressToken` gets frames rendered out of the render's own frame count, at the same 15 s cadence as the heartbeat |
| `add_arrangement_note` ▣ | `arrangementId`, `trackId`, `pitch`, `startBeats`, `lengthBeats?`, `velocity?` | one note written where it starts in **beats**, how long it is held, its pitch and velocity — the edit a piano roll uses, not limited to a grid |
| `remove_arrangement_note` ▣ | `arrangementId`, `trackId`, `pitch`, `startBeats` | the note at that position removed; removing nothing is not an error, so a caller may be idempotent |
| `move_arrangement_note` ▣ | `arrangementId`, `trackId`, `pitch`, `startBeats`, `toPitch`, `toStartBeats` | the note moved in time and pitch; **refused when the destination already holds a note**, rather than merging two into one |
| `set_arrangement_note_length` ▣ | `arrangementId`, `trackId`, `pitch`, `startBeats`, `lengthBeats` | how long the note is held, with a floor of one step — shorter than that and it is invisible in the grid |
| `set_arrangement_track_gain` ▣ | `arrangementId`, `trackId`, `gainDb` | the track's level, 0 at unity, clamped to −60…+12; a muted track keeps its level |
| `set_arrangement_track_pan` ▣ | `arrangementId`, `trackId`, `pan` | −1 hard left, 0 centre, 1 hard right — the scale the genres already use |
| `render_arrangement` ▣ | `arrangementId`, `bars?`, `format?`, `bitrateKbps?`, `sampleRate?`, `channels?`, `headless?` | the bounce, through the same offline engine the song tools use. **An arrangement has its own length** (`set_arrangement_bars`) and `bars` repeats it, reported as `passes`. Its description carries the same 900 s budget and measured costs as `render_audio`, and it reports a heartbeat when the request carries a `progressToken`. `headless: true` swaps the engine for the Node Web Audio host (`node-web-audio-api`) and states the measured host-node residual and the measurement each bound is taken from in the parameter's own description — **the same parameter, and the same shared text, as the six other tools that carry it**; on that path the render budget does not apply, while a `progressToken` gets **frames** (the Node host suspends inside `startRendering()`) at the heartbeat cadence |
| `render_arrangement_stems` ▣ | `arrangementId`, `sampleRate?`, `channels?`, `headless?` | one WAV **per track** in one directory, each with its measured duration, sample rate, channels and true peak, and a stem that rendered silent saying so. Costs one render per track, so unlike the other render tools it reports progress **per track** rather than only a heartbeat; each stem runs under the same 900 s budget **on the browser path**. `headless: true` renders one track per render on the **Node Web Audio host**, through the same `stemTrackIdx` argument the browser path passes, and the reply's `engine` names the host. The budget does not apply on the Node path (there is no page to reset), but its progress does: **frames per stem**, with `track i/N` in the message and the count never restarting. The 1.03 dB / 1.04 dB / 1.612 LU figures are a **whole-mix** fixture — the parity probe has measured no stem, so that band-and-loudness comparison is unknown for a stem rather than zero (a spot check on one drumkit stem put its true peak 0.08 dB apart between the hosts; one true-peak reading is not that comparison) |
| `select_arrangement_take` ▣ | `arrangementId`, `trackId`, `takeId` | which take plays, or cleared with `null` |
| `assign_arrangement_take_range` ▣ | `arrangementId`, `trackId`, `takeId`, `startBar`, `endBar` | an existing take claimed for a bar range, splitting any range it crosses |
| `set_arrangement_track_collapsed` ▣ | `arrangementId`, `trackId`, `collapsed` | folded in the interface; display only, and never a change to what is heard |
| `set_arrangement_region` ▣ | `arrangementId`, `trackId`, `startBar`, `endBar` (both nullable) | where a track's region sits, in bars — the range the interface's drag writes, clamped by the model (never before bar 1, never past the arrangement's end, never shorter than a bar). A region with none covers the whole arrangement, so passing `null` for both restores that |
| `import_logic_project` ▣ | `arrangementId`, `projectDataBase64`, `metaDataBase64`, `partIndex?` | one track per MIDI region of a Logic Pro project, named from the region, plus the project's tempo and meter and every problem that says what could not come over — **Phase 1 is MIDI only**, and audio tracks, plugin chains and automation are named in `problems` rather than dropped quietly. `partIndex` is a number or `"all"`, as in the other two imports |

A minimal call, as it looks over stdio:

```
create_arrangement        { "templateId": "samplers" }        → arrangement-1, two sampler tracks, each with virtuosity-drums-basic
add_arrangement_track     { "arrangementId": "arrangement-1", "kind": "drumkit", "name": "Kit" }
add_arrangement_track     { "arrangementId": "arrangement-1", "kind": "sampler", "name": "Piano", "assetId": "salamander-grand" }
describe_arrangement      { "arrangementId": "arrangement-1" }
  arrangement-1 (4 track(s))
    sampler-1  Sampler 1 (sampler) · plays catalogue asset "virtuosity-drums-basic" · 4/16 steps
    sampler-2  Sampler 2 (sampler) · plays catalogue asset "virtuosity-drums-basic" · 4/16 steps
    drumkit-3  Kit (drumkit) · the built-in drum voices (kick/snare/hat synthesis), not a sampled kit · 4/16 steps
    sampler-4  Piano (sampler) · plays catalogue asset "salamander-grand" · 0/16 steps
```

A `synth` track's line names the preset it is fixed to, and `problems` carries the call that would replace it:

```
add_arrangement_track     { "arrangementId": "arrangement-1", "kind": "synth", "name": "钢琴" }
get_arrangement           { "arrangementId": "arrangement-1" }
  tracks[1].sound  = { "source": "builtin-synth", "presetKey": "analogLead", "presetName": "Analog Lead", "selectable": false, … }
  problems         = [ "…"钢琴" is a synth track and sounds through the built-in preset "Analog Lead" (analogLead): a synth's timbre
                        cannot be pointed at a recorded instrument. For a real piano, strings or bass, add a track with
                        kind:"sampler" and give it an asset — add_arrangement_track {kind:"sampler", assetId:"<id>"}, with the ids
                        from list_arrangement_instruments" ]
```

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
| ⭐ 段落与片段 | **v2 用 `takes`** ✓ —— 旧模型的 `make_unique`（把某段落的 clip 复制到空 slot）随 v1 退场；"每段各有旋律"在 v2 是**同一轨的多个 take** ✓ |
| `set_clip` ▣ | `songId`, `slot`, `pattern?`, `genreId?` | the song's shape after one slot's clip is replaced (or seeded from a genre) — how a section gets its own variation |
| `add_section` ▣ | `songId`, `slot`, `bars?`, `label?`, `mute?`, `velocityScale?`, `velocityRamp?`, `fill?`, `transpose?`, `index?` | the whole arrangement (shape, bar count, per-section overrides, problems) |
| ⭐ 段落复制 | **v2 用 `takes`** ✓ —— 旧模型的 `duplicate_section`（复制一段）随 v1 退场；"同一轨的多个变体"在 v2 是 `add_arrangement_take` ✓／`assign_arrangement_take_range` ✓ |
| `get_song` ▢ | `songId`, `includePatterns?` | the clips (each with its pattern), the sections in order, the shape and the tempo — what makes a composition readable and re-exportable |
| `export_groove` ▣ | `songId`, `outputDir?` | a **validated** `.groove` package under `GROOVE_MCP_OUT`, carrying the arrangement rather than a flattened copy |
| `undo_song` ▣ | `songId`, `steps?` | the arrangement as it now stands, one change back by default — every song change is recorded with an `opId`, which `get_song` lists under `history` |
| `render_song` ▣ | `songId`, `format?`, `bitrateKbps?`, `sampleRate?`, `channels?`, `maxDurationSec?`, `headless?` | a WAV/MP3 path under `GROOVE_MCP_OUT`, its duration, loudness and true peak — every section, in order. Reports progress as a **heartbeat** (a phase message, then "still working" every 15 s) when the request carries a `progressToken`; see [the two timeouts](#the-two-timeouts-and-which-one-is-ours-2026-10-05). `headless: true` bounces it on the **Node Web Audio host** instead of Chromium — no browser, and it works under `GROOVE_MCP_NO_BROWSER=1`; the parameter states the measured host-node residual (1.03 dB band 3, 1.04 dB band 7, 1.612 LU) and the bound each one sets, the reply's `engine` says which host answered, and that path's progress is **better than a heartbeat**: it can suspend inside `startRendering()`, so the same `progressToken` receives frames rendered out of the render's own frame count, at the same 15 s cadence |

The package this writes is specified field by field in [`GROOVE_PACKAGE_FORMAT.md`](GROOVE_PACKAGE_FORMAT.md).

### The standard composing workflow, in six calls

A composer arriving at this server meets a few dozen tools and no order to them; this is the order, and every step is one line of intent. **The count is deliberately not written here** — it was 45 when this section was written and it grows whenever a
feature arrives, so a number in this sentence would be wrong more often than right; `npm run check:mcp` prints the surface it actually has. The fifth evaluation's own
complaint was that the names have to be guessed, so the names are here — and each description says what it is for rather than only what it takes.

| # | call | what it is for |
|---|---|---|
| 1 | `create_song` | start from a genre's pattern or from one you already have; its reply carries `secondsEstimate`, which is the number that makes `bars` unambiguous |
| 2 | `set_clip` | give a section its own variation — a clip is what a section plays, and four slots (`A`-`D`) are shared song-wide |
| 3 | `apply_pattern_ops` (op `add_lane`) | a **second** lane of a kind (`laneId`), so a counter-melody, a doubled part or an audio lane can exist at all — the ops are how one tool carries many small transforms |
| 4 | `add_section` | place sections in order, with `bars` counted as **passes of the clip**, and per-section `mute` / `velocityScale` / `velocityRamp` |
| 5 | `set_tempo` | tempo points at whole bars, `jump` or `linear` — how a multi-movement piece stops being one grid |
| 6 | `render_song` | bounce it; check `secondsEstimate` first and use `maxDurationSec` to refuse rather than hang |

**Being retired with the older model** (`set_lane_slots` bound a lane to its own clip across many sections; in v2 a track's steps come from `set_arrangement_track_steps`), and the other companion binds a lane (the matrix
rather than 72 requests), and `analyze_audio` is the ear — it returns the energy curve, loudness, true peak and spectral balance for a rendered file, which is
what closes the write-render-listen-revise loop.

A third companion belongs to a song with words: pass **`tones`** to `generate_melody` (one tone per sounding note) and the melody is written **against** the
lyric's tones — the reply reports how many notes it moved and whether any reversal survived — and `validate_prosody` then checks the same melody with the same
rule, so "the generation respected the tones" and "the checker agrees" are one claim rather than two.

### Two ceilings, and what to do before they move

Both are design decisions waiting on the owner, and neither should stop a composer in the meantime. The numbers are the code's, not estimates:

| ceiling | what it is | what to do about it today |
|---|---|---|
| **2048 bars per song** (`MAX_SONG_BARS`, `src/types/song.ts`) — **raised from 512 on 2026-09-28** | the whole arrangement, about 68 minutes at 120 bpm in 4/4. The fifth report's composer used **348** and was near the old wall, which is why the owner relaxed it | a longer piece is **two songs** rendered in sequence, or the same song with fewer, longer sections — and note the **separate** limit below, which is the one that actually bites first |
| **256 bars per section** (`MAX_SECTION_BARS`) — **raised from 64 on 2026-09-28** | one section's length, and the tool **refuses** `bars` above it rather than clamping | a movement can now be **one** section; past 256 the answer is still several sections, and a song reaches 2048 with several of them |
| **four clip slots** (`A`-`D`) | a clip is what a section plays, and slots are shared song-wide. **Being widened** by the same decision — see below | per-lane differences come from **`set_lane_slots`** (a lane's own clip for a section), **`make_unique`** (a section's own copy rather than a shared slot), and per-section **`mute` / `velocityScale` / `velocityRamp`** — which is how the report's own nine movements were already distinguished. A genuinely different movement that none of those can express is a **second song** |

**Rendering in two passes is the documented answer to a piece too long to render in one call**: `render_song` reports `secondsEstimate`, and `maxDurationSec` refuses in
advance rather than hanging, so a two-pass render is a decision a caller can make from numbers rather than from a timeout.

### What the owner decided in September 2026, and what holds it in place

Five questions were put to the owner after the fourth evaluation of this server, and all five are answered. They are recorded here with the acceptance line each
one has to satisfy, because a decision whose criterion lives only in a conversation is a decision that erodes.

| decision | what shipped | what holds it |
|---|---|---|
| **non-ASCII song titles** must not collide | a title with no ASCII in it gets a stable token derived from itself; ASCII names are byte-identical and an unnamed song is still `master` | `src/test/songSlug.test.ts` — five cases, including the pair of Chinese titles that exposed it |
| **lane multiplicity**: keep the eight `track_id`s as roles, add optional `laneId` | addressed by `laneId` first, kind as fallback, so `{track_id: "lead", laneId: "lead-2"}` is a distinct lane that everything naming `"lead"` still ignores | `laneIdAddressing.test.ts` (four cases) and `laneIdFlatten.test.ts`, which also proves `validatePattern` accepts two lanes of a kind — the rule that rejected every such song |
| **lane slots over MCP**: a batch op and a tool | **retired into `set_arrangement_track_steps`**: the older tool wrote 72 cells in one all-or-nothing call and reported the slots the edited sections share | `setSectionLaneSlotsBatch.test.ts` (deep-equality with N single calls, transaction by object identity, the 72-cell case) and `laneSlotsStore.test.ts` |
| **a tempo track** for multi-movement pieces | `tempoTrack` points at whole bars, `jump` or `linear`, absent meaning byte-identical; `set_tempo` writes it, validated rather than filtered; the renderer reads it while scheduling | `tempoMap.test.ts` (absent, jump ratio, per-bar interpolation, unreadable points ignored), `tempoCarry.test.ts` (the map travels, additively), `tempoStore.test.ts`, and `tempoSeamWiring.test.ts` for the branch that keeps the no-map expressions literal |
| **audio tracks and SVS** | audio tracks scoped in `docs/AUDIO_TRACKS_AND_SVS_PLAN.md`; **SVS reserved and empty**, exposed so the absence is discoverable | `check:mcp` asserts the stub says it is reserved and validates its arguments |

Two things learned while building them, both worth carrying:

* **"the same arithmetic" is not "the same expression".** `Σ (n copies of c)` and `n * c` agree in real arithmetic and not always in floating point, so the
  tempo seam **branches** and the no-map path keeps the literal old expressions — byte-identity as a property of the source, not a proof about rounding. The
  determinism probe (0.005 dB), the 159-genre timbre baseline and the fresh loudness re-renders are then guards rather than oracles;
* **a bar's length belongs to the bar, not to each of its steps.** The first version of the tempo accumulation added a bar's length at every step, making a bar
  sixteen times too long. It was found by a diagnostic that printed the intermediate values after two assertions failed — and it is the reason those assertions
  are in the file today rather than adjusted away.

### What three external evaluations claimed, and what the code actually does

Three reviews of this server were written by people composing with it. Their claims were checked one by one against the tree, and most were narrower,
staler, or already built than they read. This is the standing record, because the alternative is that the next reader has to re-derive it — and the
pattern is itself the finding: **a review describes what its author could see, and a feature that is present but invisible reads as absent.**

| the claim | what the code does |
|---|---|
| "the read tools are missing" | they exist; the **list** was the thing that was incomplete |
| "there are 4 resources and 3 prompts" | true when written; both have grown, and `check:mcp` now asserts every documented resource is declared |
| "`.groove` has no arrangement" | `version: 1 \| 2` with an optional `arrangement` has existed; `docs/GROOVE_PACKAGE_FORMAT.md` is the spec |
| "buses and a channel strip are missing" | both exist |
| "render SLOs are not recorded" | they are, in the table above — and the numbers come from CI, not from a plan |
| "there is no server-side undo" | **true, and fixed**: `undo_song` plus per-song history, every change carrying an `opId` |
| "no mixer view, inserts, sidechain or PDC" | **true**; PDC now exists offline and in realtime (see the budget section), the rest is workstream 6's remainder |
| "no prosody or tone support" | **true, and fixed**: `validate_prosody`, and `set_arrangement_vocal_melody` binds a syllable at the same index as its pitch |
| "the harmony minimum set is missing" | the **reading** half existed; the writing half is one op (`set_chord_progression`) plus `romanToChords` and `suggest_progression` |
| "long renders risk a client's 30 s timeout; add a preview tool" | **true and measured**: a full-rate render takes 6–24 s. `render_preview_clip` renders 14.4 s of audio in **1.45 s** — and the timeout **was** hit in this project's own probe, by a tool doing four renders in one request |
| "`get_loudness_report` reads but cannot act" | **true, and answered**: `normalize_loudness` measures, renders and measures again — and reports that on this chain the **master limiter holds the output**, so an upstream trim cannot set loudness |
| "clip references are ambiguous (destructive or make-unique)" | **true, and fixed**: `make_unique` copies a section's clip into a free slot and repoints only that section |
| "no continuous automation across sections" | **narrower than stated**: a per-section `velocityRamp` and a riser into the next section exist; what is absent is a **non-velocity** parameter — and one upstream of the limiter would be absorbed, so the honest answer is structural |
| "`AbletonExporter` writes one clip for the whole song" | **stale**: it takes `clips` and fills a scene per clip; the MCP tool passes one per section, and tests hold both behaviours |
| "the region timeline is missing" | the model, flatten, fallback rules, byte-identical guarantee, per-section ALS clips **and the command layer** were all present; what was missing was **a view of a lane's own clip** — and that is now in the arrangement panel |

Two lessons worth carrying past this server:

* **prove the instrument works before believing its number.** Four failure modes were caught here by exactly that: a detector that fires on the music, an
  analysis that reads silence, a proxy blind to its band, and a command that silently did nothing. `analyze_audio`'s energy curve, the comb-filter
  criterion and the B7 control all exist because of it;
* **a gate that is always red stops meaning anything.** Two of this project's gates had been failing for weeks — a layer violation and a lint error —
  while every run printed the failure. Reading the failing step is what fixed them, and the honest gate for a measurement that does not yet support its
  claim is one that says so, which is why B7 reports **0.8× of its control** rather than passing on a threshold chosen to fit it.

### The latency table, and the row the audio lane adds — measured, and it is zero

PDC's offline compensation exists and its first row is a **measurement**: the master limiter's lookahead, predicted at 7.408 ms and **measured at 7.415 ms**.

The ninth lane kind's playback path now has its own row, and the honest answer came from an impulse rather than from reasoning:

| path | latency | how it is known |
|---|---|---|
| master limiter (lookahead) | **7.415 ms** | predicted 7.408 from the declared lookahead, then measured on the rendered pair |
| **an audio lane's sample** | **0 ms** | `AudioBufferSourceNode.start(when)` is specified to begin **exactly at `when`**, and the probe confirms it: an impulse handed to the **real scheduler and the real adapter** through a fake loader (bypassing decode, which is asynchronous byte-fetching rather than a scheduling delay) appears at **the frame it was scheduled for** |

So PDC has **nothing to compensate** for the audio lane, and that is recorded **with its reason** rather than with an invented correction. Two notes worth keeping:

* the first run of that probe printed **−500 ms**, which is impossible — the number was right and **my label was wrong** (it subtracted a hardcoded 0.5 s expectation
  while the plan schedules a section's lane at that **section's first bar**, which is t=0 at 120 bpm). The label now reports the plan's own time. **A wrong annotation
  can make a right measurement look like a broken path**, and this workstream has now hit that three times;
* the row is subject to the same rule as the limiter's: it is a **measurement**, so if the adapter changes (`decodeAudioData` moves into the worklet, a resampler is
  added, a ring buffer appears) the row must be **re-measured**, not re-reasoned.

### Render budgets, as numbers rather than intentions (2026-09-28)

An external evaluation proposed staged render SLOs, on the correct observation that a minute-level render makes an agent's
trial-and-error loop unusable. What this server can honestly claim today is narrower, and it comes from CI logs rather than from a
plan: each song render in the audio scope takes **tens of seconds**, and the texture probe now prints its timings (`render timings :
as written Ns · fx lane cleared Ns · fx saturated Ns`) so the number is produced by every run instead of being remembered.

| budget | target | today | what closes the gap |
|---|---|---|---|
| a **cold** render (first in a page) | — | **5.4 s** measured | browser and page start-up, not the audio: the same probe's later renders take 0.4 s and one took under the timer's resolution |
| a **section preview** (`render_preview_clip`) | ≤ 3 s | **1.45 s for 14.4 s of audio** measured | met, and this is the row that answers the timeout problem: a composing loop asks for one section at 8 kHz mono instead of the whole piece at full rate. A real MCP client's 30 s timeout was **hit** in this project's own probe one round before this row existed, by a tool doing four full-rate renders in one request — which is why the loudness loop defaults to one pass |
| a **warm** render | ≤ 20 s | **0–0.4 s** measured | already met; the evaluation's "minute-level render" is about cold start and about long songs, which is the growth measured in `GROOVE_QUALITY_PLAN.md` |
| an analysis-only render | ≤ 1 s | **1.8 s at 8 kHz mono** measured | the budget is **not met**: the same song took 24.4 s at 44.1 kHz in the same run, so the lever is worth **13.5×** but 8 kHz mono is not yet under a second. Mono is confirmed — the reply reports `channels: 1` — and this is the first honest measurement: every earlier "0.1 s" was a failed call returning fast (`ReferenceError: options is not defined` inside the page callback) |
| a full song render | ≤ 20 s | tens of seconds for a *long* arrangement | the render is one `page.evaluate` over an offline context; the super-linear growth with step count is measured in `GROOVE_QUALITY_PLAN.md` |
| a section render | ≤ 5 s | available today by rendering a one-section song | already possible with `render_song` on a song whose `sections` hold one entry |
| an **eight-bar full-rate** render | — | **125.56 s of audio in 445.71–511.28 s** measured (`docs/RENDER_PROFILE.md`) | nothing closes this: the cost is super-linear in duration, so the answer is a shorter request or a lower rate, not patience. This is the row that makes the caller's own timeout the binding constraint |

`analyze_audio` is browser-free and reads a file in milliseconds; the budgets above are about **rendering**, which is why the analysis
tools landed before the render path changed.

### The two timeouts, and which one is ours (2026-10-05)

A caller planning a long render is up against **two** ceilings, and only one of them belongs to this server:

| ceiling | value | whose | where it is stated |
|---|---|---|---|
| the render budget | **900 s** | this server's, and it may be the smaller or the larger of the two | `mcp/render/budget.json` → `RENDER_BUDGET_MS`, enforced in `withRenderTimeout` and named in every rendering tool's description |
| the client's request timeout | whatever the client set | **the caller's**, and this server cannot change it | nowhere here — that is why the tool descriptions say it out loud |

The mismatch is the failure mode the numbers exist to prevent: an eight-bar full-rate render is a **445–511 s** wall clock
(measured above), so a client that leaves its timeout at 30 s fails the call no matter what this server does, and a client
that reads only "the server waits 900 s" would not know that. Every rendering tool therefore states both.

**A client that closes the pipe is reported, not fatal.** A client that gives up on a long render can close its side of
the pipe while the render is still running, and the reply write then raises `EPIPE`; on a stream with no `error` listener
that is an uncaught exception, so the whole server used to die with `Error: write EPIPE at afterWriteDispatched
(node:internal/stream_base_commons:159:15)` — the render existed on disk and nothing had said so. The transport now writes
through `mcp/stdioChannel.ts`, which installs that listener, keeps the process alive so it can finish what it started, and
names on stderr every reply it could not deliver **including the file the render did write** (`the reply to request 3 (its
file is at …) was not delivered: the client disconnected (EPIPE)`). Progress notifications are sent through the same
`send()`, so a heartbeat cannot kill the server either, and `process.stderr` gets the same listener because a broken
diagnostic channel has nowhere left to complain and must not crash for it. The same listener is attached to the
dev-server child (`awaitRendererStart` in `mcp/render/worker.ts`): a failed `spawn` is reported as a failed render, and a
checkout where Vite cannot be started no longer takes the process with it.

**When the budget is exceeded the render is *reported*, not abandoned**: `withRenderTimeout` throws the sentence
`the render of <what> did not answer within <n>s — the page may be stuck, and the renderer has been reset so the next call
starts a fresh one`, and the renderer really is reset, so the next call is not poisoned by the stuck page. It wraps **both**
render paths — `renderAudio` and `renderStems` — because a stems render waits on the same page once per track, and the one
path that runs N times is the last one that should have no ceiling. For stems the budget is **per stem**, which is what its
description says.

**Progress, and what it can honestly say.** MCP's `notifications/progress` exists for exactly this, and it is wired: a request
whose `_meta` carries a `progressToken` gets notifications; a request without one gets **none**, by construction
(`createRenderProgress` returns no reporter at all). The token travels in the **request params** (`{ name, arguments, _meta }`),
not in transport options — this SDK has no options field for it. One caveat measured while testing the wire: this SDK's client
resolves a progress notification by `Number(token)`, so an **opaque string token is dropped** ("unknown token") even though the
spec allows it; a client on this SDK should send a numeric token. The server echoes whatever type it was given.

What the browser path reports is a **phase and a heartbeat**, not a bar counter, and that is a property of the renderer rather
than a shortcut: a render is one `OfflineAudioContext.startRendering()` call that holds **96–99.9% of the wall clock**
(`docs/RENDER_PROFILE.md`), so there is no per-bar boundary to hook. A client that sees a heartbeat every 15 s knows the page
is working; a client that sees nothing for eight minutes cannot tell a slow render from a hang, which is the state this
replaced. `render_arrangement_stems` is one more that can count: it renders one file per track, so it reports per track.

**The `headless` path counts the render itself, because its host can be asked.** `node-web-audio-api` supports
`OfflineAudioContext.suspend(t)`, so the Node host is not stuck inside one opaque call the way a page is: the renderer
suspends at each 10% of the render, and a request that carries a `progressToken` receives `progress`/`total` in **frames**
(the render's own frame count, not `RENDER_BUDGET_MS` — this path is not under the render budget), throttled by
`createFrameProgress` to the same 15 s cadence the page heartbeat uses, with a cold-start phase before it and 100% when the
file is being written. Two facts make that safe to ship and both are criteria rather than claims: a token-less call still gets
**nothing** (the reporter does not exist), and the samples are **byte-identical with the channel on and off**
(`src/test/mcpHeadlessRender.test.ts`), measured at about the same wall clock (1 bar, 8 kHz mono: 1090 ms with the channel,
1167 ms without).

**Loudness needs no analysis tool.** `render_audio` and `render_song` already return gated loudness and true peak for the file they wrote;
`analyze_audio` adds the discontinuities, correlation, tail, spectral shape and energy curve. An evaluation proposed `analyze_loudness` as
a separate tool — it would return a number the caller already has.

**`bars` counts passes, not measures.** A genre's seeded clip is four measures long (64 steps at 16 to the bar), so `bars: 4` is
sixteen measures; every song summary reports `passBars` (measures per pass) and `secondsEstimate`, which is what to read before
rendering. `render_song` also takes `maxDurationSec` and refuses before it starts the browser, because long arrangements take
minutes. It now reports progress while it runs — a heartbeat, not a bar counter, because a song reaches the renderer as **one**
flattened pattern (see above).

### Sequencer

| Tool | Arguments | Returns |
| :--- | :--- | :--- |
| `get_pattern` ▢ | `genreId` | the genre's default pattern verbatim |
| `apply_pattern_ops` ▢ | `pattern`, `ops[]` | a **new** pattern with the operations applied (never mutates the library) |
| `apply_gs1_patch` ▢ | `pattern`/`genreId`, `track`, `patch?`, `parameters?`, `routes?` | a **new** pattern with one lane's own GS-1 sound: `patch` is the synth project's own share code (`gs1.1.…` from `gs1.patch.get`), and `parameters` (`{ "FILTER_CUTOFF": 700 }`, name or id) / `routes` (`[{ src: "velocity", dst: "cutoff", amount: 0.5 }]`) write **individual** parameters and modulation rows beside it — the 224 parameters and the route slots the code alone could not address. The base code is left untouched and the overrides go to the engine's own `setParam`/`setModRoute` at the one seam every consumer resolves a lane through, so the room, the file and `validate_pattern` cannot disagree. Values are the engine's own and are **not** filtered against `PARAM_SPECS`, which covers 84 of the 224 and is narrower than the served range where they overlap (it would reject `phonk`'s `osc2Pitch = 31`). An unreadable code, an unknown parameter, or either on a lane GS-1 never plays is **refused naming the lane**. `patch: null` clears the lane's whole GS-1 sound, overrides included; `parameters: {}` / `routes: []` clears one half. See `docs/GS1_PATCH_SURFACE.md` §9 |
| `get_gs1_patch` ▢ | `patch?`, `pattern`/`genreId` + `track?`, `includeUnchanged?` | what a lane — or a share code passed directly — actually plays, in named parameters rather than 224 numbers: each parameter that differs from the synth's default patch with its `Param` name, the engine's label, its value in its own unit (`700 Hz`, `20 %`) and whether it came from the code, the instrument table or an override; the modulation rows by source/destination name; and the count of the rest (`includeUnchanged: true` lists all 224). A lane with no code and no overrides is reported as playing the instrument table's patch, a lane GS-1 does not voice says so plainly, and an unreadable code is refused with the reason |
| `validate_pattern` ▢ | `pattern` | diagnostics: step-count agreement, velocity range, unknown track ids, gate/pitch length mismatches, and any lane whose `gs1Patch` code or `gs1PatchOverrides` cannot be played |
| `pattern_statistics` ▢ | `pattern` | per-track density, velocity spread, note range, off-beat ratio, recommended swing |
| `set_arrangement_vocal_melody` ▣ | `songId?`, `sectionId?`, `index?`, `pattern?`, `track?`, `syllables[]`, `tones[]`, `pitches?`, `seed?`, `tonic?`, `mode?` | binds one syllable per note **at the same index as its pitch**, writes the melody when only a lyric is given, and returns the prosody check on the result. Tones are input and never guessed; it says which slot it edited, and warns when that slot is shared (call `make_unique` first) |
| `validate_prosody` ▢ | `tones[]`, `pitches[]`, `syllables?`, `threshold?` | the reversals between a lyric's tones and a melody's movement — advisory, never throws, no pinyin guessing, and 3+3 sandhi changes what it expects rather than rewriting your tones |
| `generate_melody` ▢ | `tonic`, `mode?`, `bars?`, `form?`, `range?`, `seed?`, `density?` | lane-shaped arrays (`steps`, `pitch`, `velocity`, `gate`) plus the contours, phrase ranges and interval statistics — contour-first, in key by construction, at most two octaves, deterministic for a seed, `AABA` repeating its first phrase literally |
| `list_examples` ▢ | `genreId?`, `limit?`, `offset?` | the index over the worked examples: `id`, `genreId`, `index`, title, what each one teaches and its recipe — enough to choose one and then call `get_example`, which carries the pattern. Built from the same `examplesFor` as `get_example` and `groove://examples/{genre}`, so the three cannot disagree about what exists |
| `get_example` ▢ | `genreId`, `index?` | worked examples for a genre — the pattern the app itself arranges, and a variation built with the composition tools — each with the tool calls that produced it. Built from the genre library rather than pasted, so an example cannot drift from what the tools do |
| `suggest_progression` ▢ | `tonic?`, `mode?`, `emotion?`, `category?`, `avoid?` | a progression from the committed library for a feeling, rendered in the key: the roman numerals, the concrete chords, and the songs that used it — feed `chords` to `apply_pattern_ops` **`set_chord_progression`** |
| `estimate_key` ▢ | `genreId?`, `pattern?` | the tonic, mode and fit from the pattern's **pitches** (a pitch-class histogram against major/minor profiles) — the notes rather than an FFT of a kick-heavy loop |
| `synthesize_vocal` ▢ **(reserved)** | `syllables[]`, `tones[]`, `track?` | **not implemented**: always answers that singing synthesis is reserved and changes nothing. It exists so the absence is discoverable rather than guessed at; `set_arrangement_vocal_melody` is what sings today |
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
{ "op": "transform_pattern", "variant": "arp",   "track": "chords", "pattern": "up_down", "octaves": 2 }
{ "op": "transform_pattern", "variant": "strum", "track": "chords", "direction": "down", "speedMs": 25 }
```

`transform_pattern` is the app's own performance engine, not a second one: `arp` calls `buildArpeggioPattern` and `strum` calls `calculateStrumTiming` from `src/utils/arpeggiatorTheory.ts`, the module the chord panel and the live player use, so the note order, register and strum accents match what a person hears. It rewrites the named lane's **held chords** (a sounding step with a note stack in `pitches`), bakes the figure into the steps, and reports how many notes it wrote; `copy_track` first if the arpeggio should land on another lane. The interface's live strum is a sub-step gesture and a step pattern has no sub-step timing, so `strum` quantizes the engine's delay to the pattern's own grid, never below one step; `arp`'s `random` pattern is refused because the pure function cannot reproduce it.

Every op that involves chance takes a **seed**, and the result is deterministic for it: an agent that asks twice
gets the same groove back, which is what makes a generated pattern worth writing down.

**A pattern keeps the fields the schema does not name.** The `pattern` argument checks the types and ranges of the
fields listed above and passes every other key through instead of removing it. A track also carries fields the app
itself writes — `syllables`, `laneId`, `sample`, `mute`, `solo`, `trackLength`, `phaseInvert`, `insert` — and the
top-level pattern carries `tempoTrack`; a pattern that has them comes back from `apply_pattern_ops` with them
intact. This is a correction: the track object used to be closed, and Zod removed those keys without an error, so a
caller that sent a vocal pattern got it back with the lyric gone.

### Export

| Tool | Arguments | Returns |
| :--- | :--- | :--- |
| `share_url` ▢ | `pattern`, `genreId?` | a `groove://`-free https URL that opens the app with the groove loaded |
| `analyze_audio` ▢ | `path` (a WAV this server produced) | LUFS, true peak, pinned samples, discontinuity count, band shape, stereo correlation |

`render_audio` writes into `$GROOVE_MCP_OUT` (default: the OS temp directory, one run per call) and returns the
path, so a 4-bar WAV never has to travel through the model's context as base64. `analyze_audio` closes the loop:
an agent can render, measure, change one op and measure again.

### The sample cache

A render that mixes a recorded lane has to **have the bytes**, and a recorded lane is a library: an SFZ program, its
`#include` files, and one recording per region it names. Those bytes are cached on disk, keyed by the **library and the
path** rather than by the address, so a second render — and every track of a `render_arrangement_stems` call — finds them
instead of downloading them again. `docs/SAMPLE_CACHE.md` is the measurement and the reasoning; this is the operator's
half.

| Setting | Default | Meaning |
| :--- | :--- | :--- |
| `GROOVE_SAMPLE_CACHE` | the OS's per-user cache directory under `groove-samples` (`%LOCALAPPDATA%`, `~/Library/Caches`, `$XDG_CACHE_HOME`/`~/.cache`) | where the bytes live. **Never `/tmp`** — a memory-backed `/tmp` has filled up on this project's own machine, and a cache that has to be re-earned every boot is not persistent. `off` disables it for one process. |
| `GROOVE_SAMPLE_CACHE_BYTES` | `536870912` (512 MB) | the bound, enforced by whole-file LRU: a read touches the entry, a write sweeps the least recently used until the directory fits. `0` means unbounded, which is a deliberate choice and not the default. |
| `GROOVE_SAMPLE_ROOT` | the project mirror | where the bytes are fetched from when they are not cached. It is part of neither the key nor the file name: moving the mirror is a cache **hit**. |

```bash
npm run cache:stats                    # where it is, how many entries, how many bytes, against what bound
npm run cache:clear                    # delete every cached file
GROOVE_SAMPLE_CACHE=off npm run mcp    # measure the cold path on purpose
```

Every render also reports its warm-up through the same channel as its other progress — "recordings ready: n of N"
before `startRendering()` begins — and a recording that could not be resolved is named in the render's own `problems`
list **before** the render, in the same sentence shape the lane report uses.

### Resources

| URI | Contents |
| :--- | :--- |
| `groove://genres` | the whole library index as JSON |
| `groove://genre/{id}` | one genre document |
| `groove://loudness` | the loudness baseline table |
| `groove://examples/{genre}` | worked examples for a genre: each pattern plus the recipe that produced it |

Prompts: `compose_groove`, `explain_genre`, `practice_plan` and **`compose_with_examples`** — the last one is the few-shot path, which sends an agent to read a worked example's **recipe** before it writes anything, and reminds it of `undo_song` so an experiment does not have to be permanent.
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
* **No credentials.** The server holds no token and signs no request; the share URL it produces is a string, not a
  fetch. **It does make outbound requests, and only for audio rendering**: a render that mixes a recorded lane fetches
  its SFZ program, its `#include` files and its recordings from `GROOVE_SAMPLE_ROOT` (the project's mirror by default)
  unless they are already in the sample cache. Every other tool — the library, patterns, MIDI, Ableton, share links —
  is pure Node with no network at all.
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
| `src/test/mcpStdioDisconnect.test.ts` | a client that closes the pipe cannot kill the server: the transport's `send()` still resolves and every undelivered reply is named, with its file |
| `src/test/renderWorkerSpawnError.test.ts` | a dev server that cannot be started fails the render, not the process (a real `spawn` `error`, with the listener that is the difference) |
| `src/test/renderSongBudgetGuard.test.ts` | `maxDurationSec` refuses in one shape at every magnitude, names the numbers, and names the levers |
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

## 已有功能的覆盖审计（2026-09-30）

业主问："已有功能 MCP 都提供了吗"。这种问题只能**逐条列举**回答，不能凭印象，所以答案本身就是一份判据：`src/test/mcpCapability.test.ts` 里每个**能力面**一行，写明由哪种 MCP 表面提供——**工具**（做事）、**资源**（读）、**提示词**（怎么问）——或者写明为什么没有。

判据从三个方向维持它：

- `src/views/` 里每个视图都必须有一行：新界面在有人说明"agent 在这里能做什么"之前，这套测试就是红的——而那时补一个工具最便宜；
- 每个名字都必须存在于**对应的那一类**里：把提示词写进工具列，会让服务器显得比实际能干（这个文件第一版就是这么错的，判据当场抓住）；
- 一个能力面**什么都没有时必须有理由**：没有理由的空白，在没写它的人眼里就等同于"已覆盖"。

19 个能力面里，18 个有直接覆盖；有 4 处是**部分覆盖并写明理由**：

| 能力面 | 情况 | 理由 |
| --- | --- | --- |
| 自定义流派 | 部分 | 保存到浏览器 **IndexedDB**，而 MCP 服务端是 **Node 进程**，没有 `indexedDB`。库可读、可 fork，**保存还到不了** |
| 挑战/练习 | 部分 | 计划有提示词；**段位与连击**是"这个人练过什么"的记录，不是音乐的属性 |
| 硬件控制台 | 部分 | 推子写的是**实时播放参数**，不是持久状态；它演奏的那个 pattern 有工具可达 |
| 鼓的解剖编辑器 | 部分 | 同上：写实时合成参数；**结果是 pattern**，那是可达的 |

还有一处是**明确的界面上限而非缺口**：编排里的**键盘、卷帘、谱面**是输入与展示面，它们改的每一件事都是 `NoteEvent`，而音符有完整的工具（增删移改长度）、能渲染、能导出 MusicXML。没有"打开谱面"这种工具，正如没有"按第三个琴键"这种工具。

**已知的下一步**：把自定义流派的存储挪到一个 Node 也能实现的接口后面（`customGenreDb` 只依赖 IndexedDB），那样"保存自己的流派"就能有工具。

### ⭐ 写旋律用哪一套：两条模型的分工（2026-10-01）

这里有两套模型，**表达力不同** ✓，而工具清单是平铺的一百多条 ✓——**所以先说清分工**：

| 你要写的东西 | 用哪一套 | 关键差别 |
| --- | --- | --- |
| **有真实时值的旋律、歌词、附点、连音、跨小节延音、长 Pad 铺底** | **音符工具：`add_arrangement_note`／`add_arrangement_notes`／`move_arrangement_note`／`set_arrangement_note_length`／`remove_arrangement_note`** | `startBeats` **允许小数**（**不在栅格上** ✓）、`lengthBeats` **无上界** ✓、**歌词写在音符上**（`arrangementV2.ts:98`："A lyric is written on the note it is sung on, not in an array beside a grid"）✓ |
| 鼓组、琶音、循环式的节奏型 | `set_arrangement_track_steps` | 步进栅格：**每个起点落在格上** ✗，门限上限 **`MAX_NOTE_GATE_STEPS = 16`（一小节）** ✗（`src/types/genre.ts:47` ✓） |

**⚠️ 一份测试意见正是踩在这里** ✗✓：它说"**MCP 下大模型只能把歌词切碎塞进 `steps`**"——**那不是能力缺失，而是**可发现性**问题：从步进工具入手的人，不会被告知另一套模型存在** ✓✓。**`add_arrangement_note` 自己的说明早就写着"not limited to a grid — a note may begin between steps and last across several"** ✓，**但正确工具的说明帮不了正在读错误工具的人** ✗——**所以 `set_arrangement_track_steps` 现在也会指路** ✓，**而这段是本节的补丁** ✓。

**⇒ 一句话** ✓✓：**门限上限是**栅格模型**的属性，不是编排模型的**——**编排里一个音符能持续多久，没有上限 ✓**。

### MIDI 导入：给编排用的那一条（2026-09-30）

`import_arrangement_midi` 把标准 MIDI 文件读成**编排轨道**，而不是十六步网格。这一条是业主指示的直接结果——"每个功能开发过程中，MCP 要第一时间提供"——也是因为它与既有的 MIDI 导入**不是同一件事**：

* 既有导入（`importMidiToPattern`）量化进旧的 `DrumPattern`，**音符长度被丢掉**：一个持续的和弦与一次鼓击进去出来是同一个东西。
* 编排的模型是 `NoteEvent {pitch, startBeats, lengthBeats, velocity}`，长度是其中一半。所以解析器现在**把每个 note-off 与它的 note-on 配对**（同音重叠时先进先出——MIDI 本身不携带音符身份，这是唯一可能的约定），文件没释放的音符**不编造长度**，而是用默认值并在 `problems` 里说出来。
* 文件的结构也保留：一条 MIDI 轨一条编排轨，用文件自己的轨名（**GBK 中文轨名按 GBK 解码**）；**format 0** 的文件把整个乐队塞在一轨里，所以按通道再拆——format 1 不拆，因为那里的轨本来就是分开的。

工具与 `import_arrangement_musicxml` 走**同一条加轨路径**（`addImportedParts`），两条导入因此不会在音序、命名这些事上各自漂移。夹具是**仓库自己按规范写出的字节**（`src/test/fixtures/midi_file.mjs`），CI 不依赖任何人的音乐文件；`npm run check:mcp` 里有一条**协议级**调用，验证中文轨名与音符长度真的过线。

### MIDI 导出：把编排交给 DAW（2026-10-01）

编排一直**进得来、出不去**：`import_arrangement_midi` 能把 DAW 的文件读成编排轨，却没有一个工具把编排写回 MIDI——用 MCP 作曲的人最后**自己写了一个 MIDI 生成器**，才把乐谱交给外部 DAW。导入没有导出是一处不对称，这就是另一半。

`export_arrangement_midi` 写 **Standard MIDI File，format 1：一条编排轨一条 MIDI 轨**，另加一条 conductor 轨放速度与拍号；文件落在 `GROOVE_MCP_OUT`（或 `outputDir`）下并返回路径与轨道摘要。写法是导入器的**镜像**，所以判据不是"我们能写出一个 MIDI"，而是**这个服务器写出的文件，被这个服务器自己的导入器读回来是同一段音乐**：

* **每条轨都写轨名，conductor 轨也有。** 导入器把轨名按出现顺序收进一个数组，再按**轨块下标**取名——少一个名字，后面每条轨都会顶替邻居的名字。
* **速度写 `bpm`，`tempoTrack` 的每个点各写一条 tempo 事件**，`atBar` 按编排自己的拍号换算成 tick（3/4 的小节是 3 拍，不是 4 拍）；读回来的是最后一条，也就是"文件结束时生效的速度"。
* **拍号写进 `0x58` meta 事件**，而**导入器为此学会了读它**——否则"导出后读回同一个拍号"这条判据根本无法成立。
* MIDI 表达不了的事**明说**，不静默近似：文件夹轨不写（MIDI 没有文件夹），同音重叠的音符无法区分（读回时按先进先出配对），比 tick 更细的位置被取整，`velocity` 0 被钳到 1（在 MIDI 里它就是 note-off）。这些都进返回值的 `problems`。

判据在 `src/test/arrangementToMidi.test.ts`（含"导出→导入→音符逐一相同"、速度/拍号往返、tempo map 的落点）；`npm run check:mcp` 里另有一条**协议级**往返：导出写盘，把字节交回 `import_arrangement_midi`，比较前后音符的多重集。

### Ableton 导出：按**编排**写 Live Set（2026-10-06）

原来只有一个 `export_ableton`，它吃的是**一个 pattern**（或一个 song），产出**内联 base64**：那是 v1 的步进网格形状，在纯 v2 的表面上没有位置。但它提供的**能力**要留住，所以先补上按编排导出的路，再让 pattern 版退场。

新的 `export_arrangement_ableton` 只接 `arrangementId`（可给 `filename`、`outputDir`）。它用**渲染器同一份展平代码**把编排展平，速度取**编排自己的 `bpm`**（缺省 120），然后交给应用自己的 Live 写手（`src/audio/AbletonExporter.ts`）产出 `.als`：gzip 压过的 XML。回包给出**绝对路径、文件名、字节数、格式与轨数**。它只读编排，只写文件。

判据**解开文件**再断言，因为一个 gzip 的 Live Set 和一个叫 `.als` 的文本文件从外面看是一样的：`check:mcp` 真建一个编排、真导出、`gunzipSync` 之后断言解压出来的文本带 Live Set 的标记（`scripts/check_mcp.mjs`）。


### Logic Pro 工程导入：Phase 1 只做 MIDI（2026-10-01）

`import_logic_project` 把 Logic Pro 工程读成**编排轨道**，是 `addImportedParts` 上的**第三个生产者**（前两个是 MusicXML 与 MIDI 导入），不是第二条落库路径——这正是 `src/test/mcpLogicImport.test.ts` 里那条**结构判据**要钉住的：`mcp/arrangement.ts` 里 `addImportedParts` 只有一处定义、三处调用，任何一个导入器自己写 `edit(...)` 或手写 `notesByTrack` 都会让这条断言变红。

`.logicx` 是**目录**，所以工具收的是那两个承载音乐的小文件，而不是整个包：`projectDataBase64`（`Alternatives/NNN/ProjectData`）与 `metaDataBase64`（同目录的 `MetaData.plist`）。`Media/` 里可能有上 GB 的音频，Phase 1 用不上，JSON 参数也传不了。

已实现并各有判据的：

* **记录流**：根帧 magic `23 47 C0 AB` + 逐条记录（4 字节 tag、`+8` 簇号、`+0x1c` 负载长度）。**按长度走，不扫 tag**——负载里可以是任何字节，扫 tag 会扫出不是记录的东西。
* **音符**：region 的 `qSvE` 载荷不是定长事件，而是 **16 字节行**（line／atom）的序列：行的 **byte7 的 bit7 ＝ 1 表示"继续前一个事件"**，所以一个事件是**头行 ＋ N 条续行 ＝ `16 × (N + 1)` 字节**（N=0→16、N=1→32、N=2→48、N=3→64、N=4→80、N=5→96），**头行自身不选长度**（它的 byte 1..3 是标志位，`90 40 00 00` 与 `90 00 51 9d` 都是音符，长度由续行说了算）。字段在**头行**：`+0x04` 位置（`38400 + region 内 tick`）、`+0x0b` 力度、`+0x0c` 音高；**长度在第一条续行的 `+12`**（也就是事件的 `+0x1c`），而且**只在存在续行时才读**——没有续行的事件没有长度字段，按 0 读并把这件事作为一条 problem 说出来，而不是拿下一个事件的开头当长度。960 PPQ。**头行 ≠ 音符**：`0x90`..`0x9F` 才是音符（每个 MIDI 通道一个状态），`0xB0` 是 controller、`0xC0` 是 program change、`0xE0` 是 pitch bend——它们同样是头行，但读成音符就会把延音踏板的值当成音高（实测 `Colors` 有 **861** 条 `0xE0` 头行、其音符 **2007**；`ocean eyes` **314** 条 `0xB0`、其音符 **1415**；`Manzana` 的 **1137** 条头行只算"首事件在通道 0"，真音符 **1369**）。**N≥2 的续行语义未核实**：来源把它们叫音符的 *score symbols*，但**没有任何项目说它们对位置、长度或力度做什么**，所以读取器随事件一起消费、**不解释**——这是真实的限制，不是"那里什么都没有"。⚠️ **这套行模型不是那份规范给的**：那份 `jonkubis/logicproformatwriter` 规范只写 **32 字节（N=1）**一种长度；行模型出自三个独立项目对同一个字节机制的记述（`logicxkit`／`logic2ableton`／`logicx`），读取器照它重写，**不声称"已按规范验证"**（见 `src/data/logicToArrangement.ts` 的 `lineRun` 注释）。region 名在 `qeSM` 的 `+0x34`，按 **UTF-8** 解码（真实夹具里有韩文名，逐字节读会变乱码）。
  <!-- logic-note-form -->
  > `line=16; sizes=16,32,48,64,80,96; note-status=0x90..0x9f; head-line-not-note=0xb0,0xc0,0xe0`
* **速度**：`gnoS` 的 `+0x3a6`（有 tempo map 时规范点名的那个槽；`+0x92` 在有 map 时可能是播放头相关值），`uint32 = bpm × 10000`。拍号取签名 `qSvE` 的 80 字节头（`+0x0b` 分母指数、`+0x0c` 分子）。
* **alternative 不能硬编码**：`Resources/ProjectInformation.plist` 的 `ActiveVariant`（可能不是 `000`），plist 的**二进制与 XML 两种写法都读**。一个真实发现：这套 10.0 时代夹具的 `ProjectInformation.plist` **根本没有 `ActiveVariant`**，只有一个按 `"0"` 索引的 `VariantNames` 表——表不等于当前项，所以不拿它当答案，返回 `undefined` 让调用方决定。**文件不存在时读 `undefined`，绝不假装是 `000`**。

**诚实边界（每条都进 `problems`，按名字说，不静默丢）**：`TrackKindV2` 只有 `synth|sampler|drumkit|fx|folder`（`synth` 原名 `instrument`，已改名且旧值不再接受），**没有 audio 轨**，所以音频 region 只能报告；AU 插件链、自动化包络同样没有对应物；Drummer/Session Player 轨的音符**能转**，但"这是模型生成的"这个语义转不过去，也要说出来。

**最大的一条保留，必须和结论一起读**：本机**没有 Mac、没有 Logic**，也就**没有 ground truth**——所有判据证明的是"**按规范解析出了这些值**"，**不是"导入是正确的"**。规范取 `jonkubis/logicproformatwriter` 的 `PROJECTDATA_FORMAT.md`（MIT，解析器在 TypeScript 里自己写）；GPL 的分析器只看不抄。真实夹具是某本教材的配套资产（`github.com/wikibook/logicprox-106`，**许可不明**）→ 只放在仓库外的目录里本地验证（`GROOVE_LOGIC_FIXTURES`，默认 `/tmp/logic-fixtures`，不在就**响亮地跳过**），**不提交进仓库**；CI 读的是 `src/test/fixtures/logic_project.mjs` 按规范逐字节写出的工程。

**已知未能可靠读出的一件事，写在代码与 `problems` 里**：Logic 10.x 的 **region 起始位置**与其 note 位置基线对不上（同一 region 的 note 位置否定了它自己的 start 字段），所以**不应用**它——每个 part 从 beat 0 起、内部时值保持不变，并把这个事实作为一条 problem 返回。notes 本身是可靠的；它们在时间轴上的落点还不是。

判据：`src/test/logicImport.test.ts`（按规范构造的字节：音符数/起点/音高、tempo/拍号、ActiveVariant=`004`、音频/自动化/Drummer 逐条进 problems）、`src/test/logicFixtures.test.ts`（真实 `.logicx`，不在则跳过）、`src/test/mcpLogicImport.test.ts`（第三个生产者与"只有一条落库路径"的结构判据）。`npm run check:mcp` 里另有一条**协议级**调用：两个 base64 进，读回音符/速度/拍号，并确认音频被点名。

### 采样库的许可与署名（2026-09-30）

`list_arrangement_instruments` 回答"能弹什么"，`list_sample_libraries` 回答**发布前必须问的那个问题：这些字节从哪来、许可要求什么**。清单里一直带着 `licence`、`sourceUrl`、`repo`、`pin`，而 agent 一个都看不到——对一个**特意为了练习署名路径而钉住的 CC-BY 库**来说，这是最要紧的一处缺口。

工具会点名**哪些库按其许可名需要署名**，并给出该指向的 `sourceUrl`（以及 `repo`/`pin`，用于逐字节可复现的引用）。

**没有测量过的时长就写"没有测量"**：`durationSeconds` 是镜像步骤在下载之后用 `ffprobe` 写进去的；在那之前这里报告缺失并说明原因，而不是给一个 0——0 会被读成一个测量结果。
### 分轨导出：让 agent 听到"某一件乐器"（2026-09-30）

`render_arrangement` 给的是整首混音；`render_arrangement_stems` 给的是**每轨一个 WAV**，通过同一个离线引擎。差别在于能问什么问题：听得出"低音太浑"的人可以单独听低音再改，听不出的只能猜。

实现上有两条刻意的选择：

* **一次只渲染一轨，并且写盘之后才开下一轨。** 浏览器里的打包器早就学过这一课（它自己的注释记着：`Promise.all` 会把所有分轨同时物化在页面里，而一首三分钟的歌八条立体声分轨不是页面该拿的东西）。这里同形：渲染一轨、把字节交给 Node、写盘、丢弃。
* **文件名在 Node 侧决定**，不是页面里。这让它成为**一条可测的规则**而不是两条：`01_bass_128bpm.wav`——**位置在前**（一套鼓里两条都叫"Percussion"的轨很常见，重名会静默丢一条分轨），随后是名字与速度。无名轨用位置命名而**不用** `songSlug` 的兜底 `master`：在混音里 `master` 是总线的意思，而分轨恰恰不是总线。

每条分轨都带**实测**的时长、采样率、声道数与真峰值；渲染成静音的分轨会明说，而不是交出一个没人能听见的文件。

### 试听一个音符：让 SFZ 那层可被观察（2026-09-30）

`audition_instrument_note` 渲染**一个乐器的一个音**，并且把**库对它做了什么**一并答出来：哪个采样文件应答、以什么比率、根音、掐断组、文件是否声明它是 one-shot、同音复音上限。

它存在的理由是**整段渲染答不出的那个问题**：*这个库解析得出来吗，它按文件说的做了吗？* 而这正是这一整层工作在做的事——在此之前，只有 CI 里那个真实乐器探针能问它。

实现走的是探针已经证明可行的那条路：页面里导入应用自己的目录、加载器与图模块，用**应用播放时用的同一个 `loadNote`** 解析，在 `OfflineAudioContext` 里起音并渲染。**没有任何一处重新实现解析。**

一条刻意的报告规则：**渲染成静音是结果而不是失败**，而且它与解析结果一起返回——**有 `samplePath` 的静音是增益问题，没有 `samplePath` 的静音是库根本没解析出来**。把两者报成一样，这个工具对最需要它的那种情况就毫无用处。

### 无头宿主补齐到剩余三个渲染工具（2026-10-02）

`docs/HEADLESS_CORE_PLAN.md` §9.6 记下三个"没进"无头入口的工具与理由。逐条复核后，三条理由里属于**架构**的那半都不成立，属于**测量**的那半成立——于是入口补齐，未测量的部分写进描述而不是省略：

| 工具 | 当时记下的理由 | 复核结论 |
| :--- | :--- | :--- |
| `render_arrangement_stems` | "`renderStems` 自己跑逐轨 `page.evaluate`，带一个无头模块不收的 `stemTrackIdx`，要进就得先写新渲染代码" | **不成立** ✗：`renderPatternOffline` 自始接受 `stemTrackIdx`（`src/audio/WavExporter.ts:131`，在 `:1212`／`:1362` 应用，并经 `src/audio/offlineAudioLanes.ts:249` 传给音频 lane 规划器）。缺的是 `RenderOptions` 上的转发，不是渲染器。现在每条分轨在 Node 宿主上单独渲染、写盘、实测，回复带 `engine` |
| `render_instrument_note` | "它走 `auditionInstrumentNote`：页里 `loadNote` + SFZ 采样器渲染一个音，无头宿主完全没有这条路的实现" | **不成立** ✗：页里那段就是 `createSampleLoader(browserSampleDecoder(ctx)) → loadNote → createBufferSource → render`，而**同一组模块**正是 `renderPatternOffline` 在 Node 宿主上已经在跑的那组（`src/audio/WavExporter.ts:1727` 用同一个 `browserSampleLoader`）。复核用的就是同一个 `loadNote`：本机实测 `vsco2ce:ViolinEnsSusVib` midi 60 解析出 `Strings/Violin Section/susVib/VlnEns_susVib_B2_v2.wav`、`rootKey 59`、`ratio = 2^(1/12)`，与浏览器路径记录的数字一致（`docs/PITCH_TRUTH.md:23`） |
| `normalize_loudness` | "一次调用跑 1–3 个 pass，宿主差会在多次渲染间累积，而那个累积没量过" | **一半成立** ✓：循环的状态在 Node 侧，但每一轮仍是同一个 `renderAudio`，所以把 `headless` 透传给**每一轮**，一轮调用就只用一个宿主，回复的 `engine` 说明是哪个。**没有发生跨宿主**，所以"跨宿主的累积"不是本实现的性质，而是没有被造成 |

**补齐后**：七个渲染工具都收 `headless`，回复都带 `engine`（`normalize_loudness` 与 `render_arrangement_stems` 是本轮新加的字段，`render_instrument_note` 的 `engine` 同理）。**判据**：`src/test/mcpHeadlessRouting.test.ts` 由 4 个工具 ×4 例扩到 7×4=28 例（不依赖可选包）；`src/test/mcpHeadlessRender.test.ts` 的五例真实渲染在 `GROOVE_MCP_NO_BROWSER=1` 下跑通。

**另外补上的一个同形状缺口**：`get_pitch_report` 在给 `assetId` 时走 `auditionInstrumentNote(..., { resolveOnly: true })` 逐音解析音源，而这条路径**一个采样都不渲染**。它现在也收 `headless`（Node 宿主解析，回复带 `engine`），但**故意不复用** `headlessParameterDescription()`——那段文字引用的 1.03 dB／1.04 dB／1.612 LU 是两宿主的**声音**差，对一条不产出音频的调用是把对的事实用在错的对象上。判据在 `src/test/mcpHeadlessRouting.test.ts` 单列一组（4 例，其中一条**断言参数文字里不出现 `1.612 LU`**），真解析一例（506 ms，不渲染）进 `src/test/mcpHeadlessRender.test.ts`。

**仍未变的**：三个数字（1.03 dB band 3／1.04 dB band 7／1.612 LU）一个都没动；**单轨与单音的宿主差没有量过** ✗——所以描述里写的是"unknown rather than zero"（另有一次同夹具真峰值点测：单轨 Δ0.08 dB、单音 Δ0.32 dB，明确标为 spot check），而不是把整混夹具的数字挪用过来；无头路径仍**不走渲染预算、不发 progress**（那是页面机器）。

### 音色设计：报告、实测与一条已裁定的缺口（2026-10-01）

一位日常使用 MCP 的作曲者报告"GS-1 引擎能力未暴露到工具面，没有 `gs1.patch` / 振荡器 / 滤波 / 包络参数，只能切到 synth repo 另渲"。对着代码逐句验过之后，**结论是缺口真实，但它已经被裁定过**，而且报告里"完全没有写音色的工具"这句不完全准确：

* **引擎**确实是可打补丁的 GS-1（`mcp/render/worker.ts:4`），参数面是声明式的 408 个 `AudioParam`（`vendor/gs1/src/audio/params.ts:1453` 的 `PARAM_SPECS`），host 早就有 `setParam` / `setPatch`（`src/audio/gs1/Gs1Host.ts:184,188`）；
* 但参数只能来自一张**手写的固定预设表**（`src/data/gs1Patches.ts:100`、`:816`），路由只由 `role` + `instrument` 名 + `genreId` 决定（`src/audio/gs1/gs1Tracks.ts:138`、`WavExporter.ts:537`），**14 个具名预设、约 30 个乐器名**；
* **逐参数写入真的没有，也没有地方放它**：`TrackV2` 无补丁字段（`src/types/arrangementV2.ts:16`），应用**自己没有**补丁编辑界面（`Gs1Patch` 零个 `.tsx` 引用），整个 `mcp/` 树零命中；
* 但**预设选择已经能过线**，只经由 `patternSchema` 的 `instrument` 字段与 `.passthrough()`（`mcp/registry.ts:128,142`）+ `render_audio` 的 `pattern` 参数（`:1848`）—— 未文档化、未校验，打错名字会**静默回落到原生引擎**；
* 帮助文案里那句"或一键导出为 **GS1 开放协议补丁**"（`src/i18n/locales/help.ts:74`）**是假声明**：导出只有 MIDI/ALS/Groove/WAV/MP3/Stems 六项。

`sound` 命名空间（`set_synth_params` / `set_track_preset`）的缺口与第一步早已写在 [`Z2_ADJUDICATION.md`](Z2_ADJUDICATION.md) §5.4（`:144`）与 §5.3 第 1 条（`:114`）：**第一步是有限预设集合，逐参数明确不做**。本次调查补上了意外旁路、假声明与成本理由，全文见 [`GS1_PATCH_SURFACE.md`](GS1_PATCH_SURFACE.md)。**当时只记录、不实施**；其中"逐参数"这一条**已由该文 §10 实施**（`apply_gs1_patch` 的 `parameters`/`routes` + `get_gs1_patch`，覆盖层经引擎自己的 `setParam`/`setModRoute` 在唯一解析缝应用），而 `set_synth_params`/`set_track_preset` 这个**按名字选预设**的命名空间仍未做——那仍是一个产品决定（需要一个合法名字集合）。
