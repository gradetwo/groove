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

Two things this surface states rather than leaves to be discovered:

* **A sampler track always has an instrument.** A new one is created with the default catalogue asset, and changing a track's kind to `sampler` gives it one too — so the same kind of track sounds regardless of how it came to exist. A summary reports the
  asset, and warns when a sampler somehow has none, because a silent sampler reads as a broken renderer.
* **Choosing an instrument has two halves and both are here.** `list_arrangement_instruments` says what exists and `set_arrangement_track_instrument` puts one on a track; the id the first returns is the id the second accepts, which a criterion holds together. The list is read from the manifest in the repository rather than from the network, so "what can I play" answers the same offline as online.

* **A request that cannot be carried out is refused out loud.** The data layer returns the arrangement unchanged when an instrument is pointed at a non-sampler track, which is right for a button and useless for a caller that cannot see the screen. The tool
  raises instead, and an unknown `trackId` is answered with the ids that do exist.

| Tool | Arguments | Returns |
| :--- | :--- | :--- |
| `list_arrangement_instruments` ▢ | `library?`, `limit?` | the catalogue assets a sampler track can play, each with its library and measured duration; `vcsl` alone declares 88 |
| `create_arrangement` ▣ | `templateId?`, `blankKind?`, `songId?` | the new `arrangementId`, its tracks, the template ids it would accept, and any problem |
| `get_arrangement` ▢ | `arrangementId` | every track's kind, name, flags, `sampleAssetId`, `steps` with `stepsOn`, and takes |
| `describe_arrangement` ▢ | `arrangementId` | one line per track, for reading rather than parsing |
| `add_arrangement_track` ▣ | `arrangementId`, `kind`, `name?` | the arrangement with the track added |
| `remove_arrangement_track` ▣ | `arrangementId`, `trackId` | the arrangement without it; a folder's children detach rather than disappear |
| `set_arrangement_track_kind` ▣ | `arrangementId`, `trackId`, `kind` | the kind changed, with the instrument rule above |
| `rename_arrangement_track` ▣ | `arrangementId`, `trackId`, `name` | the renamed track |
| `set_arrangement_track_flag` ▣ | `arrangementId`, `trackId`, `flag`, `value` | muted or soloed |
| `set_arrangement_track_parent` ▣ | `arrangementId`, `trackId`, `parentId` | attached to a folder, or detached with `null` |
| `set_arrangement_track_instrument` ▣ | `arrangementId`, `trackId`, `assetId` | the sampler track pointed at a catalogue asset; refused for any other kind |
| `set_arrangement_track_steps` ▣ | `arrangementId`, `trackId`, `steps` | the pattern written whole; a step is on when non-zero, and the length is the caller's |
| `add_arrangement_take` ▣ | `arrangementId`, `trackId`, `source`, `label?`, `recordedAt?`, `startBar?`, `endBar?` | the take filed and selected; a bar range is claimed when one is given |
| `render_arrangement` ▣ | `arrangementId`, `format?`, `bitrateKbps?`, `sampleRate?`, `channels?` | the bounce, through the same offline engine the song and pattern tools use. **An arrangement is one bar of sixteen steps**, so this is the loop, not a piece |
| `add_arrangement_note` ▣ | `arrangementId`, `trackId`, `pitch`, `startBeats`, `lengthBeats?`, `velocity?` | one note written where it starts in **beats**, how long it is held, its pitch and velocity — the edit a piano roll uses, not limited to a grid |
| `remove_arrangement_note` ▣ | `arrangementId`, `trackId`, `pitch`, `startBeats` | the note at that position removed; removing nothing is not an error, so a caller may be idempotent |
| `move_arrangement_note` ▣ | `arrangementId`, `trackId`, `pitch`, `startBeats`, `toPitch`, `toStartBeats` | the note moved in time and pitch; **refused when the destination already holds a note**, rather than merging two into one |
| `set_arrangement_note_length` ▣ | `arrangementId`, `trackId`, `pitch`, `startBeats`, `lengthBeats` | how long the note is held, with a floor of one step — shorter than that and it is invisible in the grid |
| `set_arrangement_track_gain` ▣ | `arrangementId`, `trackId`, `gainDb` | the track's level, 0 at unity, clamped to −60…+12; a muted track keeps its level |
| `set_arrangement_track_pan` ▣ | `arrangementId`, `trackId`, `pan` | −1 hard left, 0 centre, 1 hard right — the scale the genres already use |
| `render_arrangement` ▣ | `arrangementId`, `format?`, `bitrateKbps?`, `sampleRate?`, `channels?` | the bounce, through the same offline engine the song tools use. **An arrangement is one bar of sixteen steps**, so this is the loop rather than a piece |
| `select_arrangement_take` ▣ | `arrangementId`, `trackId`, `takeId` | which take plays, or cleared with `null` |
| `assign_arrangement_take_range` ▣ | `arrangementId`, `trackId`, `takeId`, `startBar`, `endBar` | an existing take claimed for a bar range, splitting any range it crosses |
| `set_arrangement_track_collapsed` ▣ | `arrangementId`, `trackId`, `collapsed` | folded in the interface; display only, and never a change to what is heard |

A minimal call, as it looks over stdio:

```
create_arrangement        { "templateId": "samplers" }        → arrangement-1, two sampler tracks, each with virtuosity-drums-basic
add_arrangement_track     { "arrangementId": "arrangement-1", "kind": "drumkit", "name": "Kit" }
describe_arrangement      { "arrangementId": "arrangement-1" }
  arrangement-1 (3 track(s))
    sampler-1  Sampler 1 (sampler) · plays virtuosity-drums-basic · 4/16 steps
    sampler-2  Sampler 2 (sampler) · plays virtuosity-drums-basic · 4/16 steps
    drumkit-3  Kit (drumkit) · 4/16 steps
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
| `make_unique` ▣ | `songId`, `sectionId?`, `index?`, `pattern?` | **a clip slot is song-global**, so two sections pointing at B are the same clip; this copies a section's clip into a free slot (A–D) and repoints **only that section**, which is how three verses get three melodies. Fails with an explanation when all four slots are in use rather than overwriting |
| `set_clip` ▣ | `songId`, `slot`, `pattern?`, `genreId?` | the song's shape after one slot's clip is replaced (or seeded from a genre) — how a section gets its own variation |
| `add_section` ▣ | `songId`, `slot`, `bars?`, `label?`, `mute?`, `velocityScale?`, `velocityRamp?`, `fill?`, `transpose?`, `index?` | the whole arrangement (shape, bar count, per-section overrides, problems) |
| `duplicate_section` ▣ | `songId`, `index`, `at?`, `bars?`, `label?` | the arrangement with a copy of that section, its clip and **all** its overrides intact |
| `get_song` ▢ | `songId`, `includePatterns?` | the clips (each with its pattern), the sections in order, the shape and the tempo — what makes a composition readable and re-exportable |
| `export_groove` ▣ | `songId`, `outputDir?` | a **validated** `.groove` package under `GROOVE_MCP_OUT`, carrying the arrangement rather than a flattened copy |
| `undo_song` ▣ | `songId`, `steps?` | the arrangement as it now stands, one change back by default — every song change is recorded with an `opId`, which `get_song` lists under `history` |
| `render_preview_clip` ▣ | `songId?`, `sectionId?`, `index?`, `genreId?`, `bars?`, `sampleRate?`, `channels?`, `format?` | a **fast** render of one section for iterating: 8 kHz mono by default (**~1.8 s** measured, against 6–24 s at full rate), labelled `preview: true` and carrying its own wall-clock time. Use it while composing and `render_song`/`render_audio` for anything you deliver |
| `render_song` ▣ | `songId`, `format?`, `bitrateKbps?`, `maxDurationSec?` | a WAV/MP3 path under `GROOVE_MCP_OUT`, its duration, loudness and true peak — every section, in order |

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

Two companions worth knowing at the same point: `set_lane_slots` binds a lane to its own clip across **many** sections in one all-or-nothing call (the matrix
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
| **lane slots over MCP**: a batch op and a tool | `set_lane_slots`: 72 cells in one all-or-nothing call, reporting the slots the edited sections share | `setSectionLaneSlotsBatch.test.ts` (deep-equality with N single calls, transaction by object identity, the 72-cell case) and `laneSlotsStore.test.ts` |
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
| "no prosody or tone support" | **true, and fixed**: `validate_prosody`, and `set_vocal_melody` binds a syllable at the same index as its pitch |
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
| `set_vocal_melody` ▣ | `songId?`, `sectionId?`, `index?`, `pattern?`, `track?`, `syllables[]`, `tones[]`, `pitches?`, `seed?`, `tonic?`, `mode?` | binds one syllable per note **at the same index as its pitch**, writes the melody when only a lyric is given, and returns the prosody check on the result. Tones are input and never guessed; it says which slot it edited, and warns when that slot is shared (call `make_unique` first) |
| `validate_prosody` ▢ | `tones[]`, `pitches[]`, `syllables?`, `threshold?` | the reversals between a lyric's tones and a melody's movement — advisory, never throws, no pinyin guessing, and 3+3 sandhi changes what it expects rather than rewriting your tones |
| `generate_melody` ▢ | `tonic`, `mode?`, `bars?`, `form?`, `range?`, `seed?`, `density?` | lane-shaped arrays (`steps`, `pitch`, `velocity`, `gate`) plus the contours, phrase ranges and interval statistics — contour-first, in key by construction, at most two octaves, deterministic for a seed, `AABA` repeating its first phrase literally |
| `get_example` ▢ | `genreId`, `index?` | worked examples for a genre — the pattern the app itself arranges, and a variation built with the composition tools — each with the tool calls that produced it. Built from the genre library rather than pasted, so an example cannot drift from what the tools do |
| `suggest_progression` ▢ | `tonic?`, `mode?`, `emotion?`, `category?`, `avoid?` | a progression from the committed library for a feeling, rendered in the key: the roman numerals, the concrete chords, and the songs that used it — feed `chords` to `apply_pattern_ops` **`set_chord_progression`** |
| `estimate_key` ▢ | `genreId?`, `pattern?` | the tonic, mode and fit from the pattern's **pitches** (a pitch-class histogram against major/minor profiles) — the notes rather than an FFT of a kick-heavy loop |
| `synthesize_vocal` ▢ **(reserved)** | `syllables[]`, `tones[]`, `track?` | **not implemented**: always answers that singing synthesis is reserved and changes nothing. It exists so the absence is discoverable rather than guessed at; `set_vocal_melody` is what sings today |
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

**A pattern keeps the fields the schema does not name.** The `pattern` argument checks the types and ranges of the
fields listed above and passes every other key through instead of removing it. A track also carries fields the app
itself writes — `syllables`, `laneId`, `sample`, `mute`, `solo`, `trackLength`, `phaseInvert`, `insert` — and the
top-level pattern carries `tempoTrack`; a pattern that has them comes back from `apply_pattern_ops` with them
intact. This is a correction: the track object used to be closed, and Zod removed those keys without an error, so a
caller that sent a vocal pattern got it back with the lyric gone.

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

### MIDI 导入：给编排用的那一条（2026-09-30）

`import_arrangement_midi` 把标准 MIDI 文件读成**编排轨道**，而不是十六步网格。这一条是业主指示的直接结果——"每个功能开发过程中，MCP 要第一时间提供"——也是因为它与既有的 MIDI 导入**不是同一件事**：

* 既有导入（`importMidiToPattern`）量化进旧的 `DrumPattern`，**音符长度被丢掉**：一个持续的和弦与一次鼓击进去出来是同一个东西。
* 编排的模型是 `NoteEvent {pitch, startBeats, lengthBeats, velocity}`，长度是其中一半。所以解析器现在**把每个 note-off 与它的 note-on 配对**（同音重叠时先进先出——MIDI 本身不携带音符身份，这是唯一可能的约定），文件没释放的音符**不编造长度**，而是用默认值并在 `problems` 里说出来。
* 文件的结构也保留：一条 MIDI 轨一条编排轨，用文件自己的轨名（**GBK 中文轨名按 GBK 解码**）；**format 0** 的文件把整个乐队塞在一轨里，所以按通道再拆——format 1 不拆，因为那里的轨本来就是分开的。

工具与 `import_arrangement_musicxml` 走**同一条加轨路径**（`addImportedParts`），两条导入因此不会在音序、命名这些事上各自漂移。夹具是**仓库自己按规范写出的字节**（`src/test/fixtures/midi_file.mjs`），CI 不依赖任何人的音乐文件；`npm run check:mcp` 里有一条**协议级**调用，验证中文轨名与音符长度真的过线。

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
