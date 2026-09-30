# Staff notation + MusicXML for groove — factual survey and recommendation

**Status:** research report, no application code written.
**Scope:** what to use to (a) display a piano grand staff from groove's own note model
(`{ pitch: MIDI, startBeats, lengthBeats, velocity }`, beats, 4/4, bars = 4 beats) and
(b) import/export MusicXML. Editing is a later, optional stage.
**Date of research:** measurements taken against the packages named in each row; all
registry/GitHub figures read on 2026-09-30.

---

## 0. How to read the numbers

Every size below is **gzipped**, measured here, not quoted from a blog:

- Node `v22.22.3`, `esbuild 0.25.0`, `--bundle --minify --format=esm --target=es2020`,
  then `gzip -9`. This models what Vite/Rollup will emit for a lazy route chunk.
- Where a library ships a pre-minified bundle (OSMD, abcjs, alphaTab, Verovio), both the
  shipped bundle and an esbuild bundle of the library are reported.
- Where a library's own tarball is the unit of distribution (alphaTab fonts, Verovio), the
  asset is measured separately because it is downloaded separately.

**The budget this has to fit** (read from `scripts/check_budgets.js` in this repo):

| Gate | Limit | Source in repo |
| --- | --- | --- |
| Initial route (html + entry + modulepreloads + css, gzip) | **226 KB** | [`scripts/check_budgets.js`](../../scripts/check_budgets.js) `initialRouteGzipKb` |
| **Max single JS chunk (gzip)** | **150 KB** | same file, `maxSingleChunkGzipKb` |
| index.html (gzip) | 10 KB | same |
| vendor-react / vendor-three | 60 / 145 KB | same |

Two consequences that drive the whole recommendation:

1. The **150 KB per-chunk cap applies to every emitted `.js` chunk**, including lazy ones.
   A renderer over 150 KB gzipped **cannot ship as a single chunk** without splitting it or
   changing the gate.
2. [`vite.config.ts`](../../vite.config.ts) has an explicit `manualChunks` function. A new
   `node_modules` dependency that is **not** listed there gets pulled into a shared chunk
   with the entry, i.e. it becomes part of the initial 226 KB. Any renderer must be given
   its own `manualChunks` entry **and** be reached only through `React.lazy`/dynamic
   `import()` so it is not preloaded.

---

## 1. Verdict up front

**Recommended: VexFlow 5 (render) + our own MusicXML writer/reader built on
`musicxml-io` (parse/serialize) + a thin beaming/spelling layer we own.**

- Render directly from groove's model with VexFlow — do **not** round-trip through
  MusicXML for display. VexFlow is the only candidate that takes a hand-built note model
  natively, is MIT, has first-party TypeScript types, no WASM, and can be lazy-loaded.
- Lazy chunk sizes measured: **89 KB gzip** for VexFlow core with the font loaded from a
  same-origin URL, or **378 KB gzip** if the Bravura font data is embedded as base64
  (which does **not** fit the 150 KB chunk gate as one chunk).
- Use `musicxml-io` (MIT, TypeScript, active) for the MusicXML read/write plumbing:
  **76 KB gzip** bundled, and it already handles `.mxl` zip containers, `backup`/`forward`,
  and emits the correct MusicXML 4.0 DOCTYPE (verified by running it).
- Reject: Verovio (**LGPL-3.0-or-later**, **2.28 MB gzip** WASM), `musicxml-interfaces`
  (**AGPL-3.0**), OpenSheetMusicDisplay as the primary renderer (BSD-3 is fine, but it pins
  a patched VexFlow **1.2.93** and cannot render anything but MusicXML), alphaTab (**MPL-2.0**
  file-level copyleft, 272 KB gzip + 306 KB font asset, wrong output shape).

---

## 2. Candidate comparison

| Library | What it does | Licence (source) | Latest | Last activity | Size (gzip, measured) | WASM? | Render from our model? | Editing? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **VexFlow** | Render only (SVG or Canvas) | **MIT** — [`LICENSE`](https://github.com/vexflow/vexflow/blob/main/LICENSE), npm `license: MIT` | 5.0.0 (2025-03-05) | 67 commits on `main` since 5.0.0; last 2026-09-16 | **89 KB** core (font via URL) / **378 KB** with Bravura embedded / 674 KB full entry + all fonts | No | **Yes** — `StaveNote`/`Voice`/`Beam` take arrays we build | Yes (it is a drawing API; hit-testing is ours) |
| **OpenSheetMusicDisplay** | MusicXML *in* → render (SVG/Canvas). No export. | **BSD-3-Clause** — [`LICENSE`](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/blob/develop/LICENSE) | 2.1.3 (2026-09-19) | daily; 2026-09-30 | **327 KB** shipped bundle / **339 KB** esbuild | No | **No** — MusicXML document only | Limited: colour, hide, transpose. ["not a full interactive sheet music editor"](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/blob/develop/README.md) |
| **alphaTab** | MusicXML/GuitarPro/alphaTex *in* → render + playback; exports alphaTex & GP7, **not MusicXML** | **MPL-2.0** — [`LICENSE`](https://github.com/CoderLine/alphaTab/blob/develop/packages/alphatab/LICENSE); GitHub API reports `NOASSERTION`, package.json says `MPL-2.0` | 1.8.4 (2026-07-05) | dependency bumps only (2026-09-24) | **272 KB** main / 271 KB core; + **306 KB** `Bravura.woff2` asset; + 954 KB `sonivox.sf3` for playback | No | **No** — its own `Score` object; closest is `ScoreLoader.loadAlphaTex()` | No (renderer + player) |
| **Verovio** | MEI/MusicXML *in* → SVG (render only) | **LGPL-3.0-or-later** (npm `license` field, [`package.json`](https://registry.npmjs.org/verovio/6.3.0)); repo has GPL-3.0 root `COPYING` + `COPYING.LESSER`, README says LGPL | 6.3.0 (2026-08-19) | 2026-09-25 | **2 283 KB** (`verovio-toolkit-wasm.js`, 7 139 KB raw) | **Yes** (Emscripten) | **No** — MEI/MusicXML only | No |
| **abcjs** | ABC *in* → render + synth; has MIDI output, no MusicXML | **MIT** — [`LICENSE.md`](https://github.com/paulrosen/abcjs/blob/master/LICENSE.md), npm `license: MIT` (GitHub API `NOASSERTION` because the file is named `LICENSE.md`) | 6.7.1 (2026-09-21) | 2026-09-21 | **149 KB** bundle | No | Only via ABC text | No |
| **musicxml-io** | MusicXML `.xml`/`.mxl` **and ABC** parse **and** serialize; MIDI export; query/operations/validate API | **MIT** — [`package.json`](https://registry.npmjs.org/musicxml-io/0.10.3), README badge | 0.10.3 (2026-09-11) | 2026-09-11 | **76 KB** | No | N/A (it is the parser) | It has add/remove note operations, no UI |
| **@stringsync/vexml** | MusicXML → VexFlow rendering (the closest off-the-shelf "render MusicXML with modern VexFlow") | **MIT** — [repo](https://github.com/stringsync/vexml) | 1.6.1 (2026-09-28) | 2026-09-28 | **790 KB** | No | No (MusicXML in) | No |
| `musicxml-interfaces` | MusicXML TypeScript interfaces + parser | **AGPL-3.0** — [`package.json`](https://registry.npmjs.org/musicxml-interfaces/0.0.21) | 0.0.21 (2022-08-18) | stale | n/a | No | N/A | No |
| `@stringsync/musicxml` | MusicXML model/serializer | MIT | 0.3.0 (2023-12-01) | repo pushed 2025-03-04 | **5.1 MB** unpacked | No | N/A | No |
| `fast-xml-parser` | General XML parse/build, order-preserving option | **MIT** — [repo](https://github.com/NaturalIntelligence/fast-xml-parser) | 5.11.2 (2026-09-29) | 2026-09-29 | small (not measured) | No | N/A (DIY serializer base) | No |
| `xml-js` | General XML parse/build | MIT | 1.6.11 (**2019-02-13**) | effectively unmaintained | small | No | N/A | No |
| `tonal` | Music-theory helpers (keys, intervals, note spelling) — **no rendering** | **MIT** — [repo](https://github.com/tonaljs/tonal) | 6.5.0 (2026-09-28) | 2026-09-28 | 269 KB unpacked | No | N/A | N/A |
| `svguitar`, `vexchords` | Guitar **chord diagrams** only — no staves, no MusicXML | MIT on npm (`vexchords` last published **2019-03-31**) | 2.6.2 / 1.2.0 | svguitar 2026-09-17 | — | No | N/A | N/A |

### Things this table does not capture

- **`musicxml-mjs` does not exist on npm** (`npm view musicxml-mjs` → 404). The closest
  names are `musicxml` (0.0.1, 2016) and the abandoned `vexflow-musicxml` (0.3.1, **2017**,
  ISC) which predates VexFlow 2 and cannot target VexFlow 5's API.
- **`@grame/libmusicxml`** (MPL-2.0, npm 3.22.0, **2022-06-20**) is a libmusicxml WASM/embind
  binding. It is stale and its main utility is partwise↔timewise conversion, which the
  MusicXML XSLT files already do. Not recommended, but it exists.
- **`webmscore`** (MuseScore compiled to WASM, 2023) exists and would theoretically import
  and re-export MusicXML with MuseScore fidelity. I did **not** evaluate it (size, licence
  and API surface are the obvious objections); see §7.

---

## 3. VexFlow 5 — the licensing subtlety, checked

The subtlety is real but benign, and it is now resolved:

| Version | `LICENSE` first lines | SPDX |
| --- | --- | --- |
| [3.0.9](https://raw.githubusercontent.com/vexflow/vexflow/3.0.9/LICENSE) / [4.2.2](https://raw.githubusercontent.com/vexflow/vexflow/4.2.2/LICENSE) | `Vex Flow - A JavaScript library for rendering music notation.` / `Copyright (c) 2010 Mohit Muthanna Cheppudira` | the **body text is verbatim MIT**; only the title line differed from the standard template |
| [5.0.0 `main`](https://github.com/vexflow/vexflow/blob/main/LICENSE) | `The MIT License` / `Copyright (c) 2023-2026 VexFlow contributors (see AUTHORS.md)` / `Copyright (c) 2010-2022 Mohit Muthanna Cheppudira` | **MIT**, stated as such in [`package.json`](https://registry.npmjs.org/vexflow/5.0.0) |

So the "older Mohit Muthanna licence" is not a different licence — it is the MIT text under a
project-specific heading, and v5 replaces it with the canonical MIT text while **retaining**
the 2010–2022 Mohit Muthanna copyright line alongside the contributors line. The change was
made in [PR #330 "Make LICENSE machine readable"](https://github.com/vexflow/vexflow/pull/330)
(merged 2026-09-16). Action for us: nothing beyond keeping the copyright notice in our
third-party notices.

**Font red flag (verified by unpacking the tarball).** `npm pack vexflow@5.0.0` contains
`package/LICENSE`, `package/AUTHORS.md`, `package/README.md` and `build/**` — and **no OFL
text**, even though `vexflow/bravura` embeds Bravura as a base64 `data:font/woff2` URI and
`@vexflow-fonts/bravura` is [`OFL-1.1`](https://registry.npmjs.org/@vexflow-fonts%2Fbravura)
(Bravura's own [LICENSE.txt](https://raw.githubusercontent.com/steinbergmedia/bravura/master/LICENSE.txt)).
If we embed the font, **we ship the OFL notice ourselves** — that is our obligation, not
something VexFlow discharges for us.

**Font loading, two modes (both verified in `build/esm/src/font.js`):**

- `vexflow` / `vexflow/bravura`: the font is inlined as a base64 data URI — **self-contained,
  +289 KB gzip** over core, and it blows the 150 KB chunk gate as a single chunk.
- `vexflow/core`: music glyphs come from a `FontFace` loaded from
  `Font.HOST_URL = 'https://cdn.jsdelivr.net/npm/@vexflow-fonts/'`. Third-party CDN by
  default (the source comments cite the German Google-Fonts ruling and say the field is
  meant to be overridden). **Set `Font.HOST_URL` to our own origin and self-host the woff2**
  — that keeps the chunk at 89 KB and avoids the GDPR/availability question.

**Integration answer:** VexFlow is *rendering only*. It has no MusicXML anywhere in
`build/types/` (grepped, zero hits) and no concept of our data. That is exactly why it fits:
`new StaveNote({ keys: ['c/4','e/4','g/4'], duration: '8' })`, `new Voice({ numBeats, beatValue })`,
`new Formatter().joinVoices(...).format(...)`, `new Beam(notes)`, `stave.addClef()/addKeySignature()/
addTimeSignature()/setMeasure(n)` are all present in the 5.0 typings
([`stave.d.ts`](https://github.com/vexflow/vexflow/blob/main/src/stave.ts)). Nothing has to be
shoehorned. No DOM is touched at import time (verified: importing a VexFlow esbuild bundle in
bare Node succeeds); a container element is only needed at render time, and both
`Renderer.Backends.CANVAS` and `Renderer.Backends.SVG` exist
([`renderer.d.ts`](https://github.com/vexflow/vexflow/blob/main/src/renderer.ts)).

---

## 4. Why the others lose

**OpenSheetMusicDisplay.** BSD-3-Clause is fine. Its API is `new OpenSheetMusicDisplay(container)`
→ `load(content)` → `render()`; `load` accepts a URL, a `Document`, a string of `.xml`/`.mxl`
content, or a `Blob`, and there is an `OnXMLRead(xml) => xml` hook. So the integration is
"generate MusicXML, hand it to OSMD" — which means we would write the MusicXML writer *anyway*
and then pay twice. The disqualifier is its renderer: `package.json` pins
`"vexflow": "1.2.93"` (plus `@types/vexflow ^1.2.38`) and runs
`prebuildVexflow: ncp src/VexFlowPatch/src/ node_modules/vexflow/src/` — **OSMD patches VexFlow
source before building**, so it cannot share our VexFlow 5. The dist typings `import Vex from
"vexflow"` in 23 files, so a bundler will pull the ancient VexFlow in alongside the modern one
if we used both. 339 KB gzip for a renderer we cannot drive from our model, plus a name
collision with the library we actually want. Its own README calls it
["a renderer, not a full interactive sheet music editor"](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/blob/develop/README.md).
There is **no MusicXML export** anywhere in the dist (searched for exporter/serializer/writer:
zero hits). Use OSMD as a **reference implementation for MusicXML edge cases and as a
visual oracle in tests**, not as a dependency.

**alphaTab.** MPL-2.0 is file-level copyleft: we may link it from our MIT app and distribute
the combined work, but **modifications to alphaTab's own files must be published in source
form**. That is usually acceptable, but it is a real, documented implication rather than a
non-issue, and it conflicts with the project's "permissive or clearly documented copyleft"
rule only in the sense that it must be written down. Practically it also loses on shape:
272 KB gzip exceeds the 150 KB chunk gate as one chunk; it needs `Bravura.woff2` (306 KB) at
runtime (`display.resources.smuflFontSources` resolves `${fontDirectory}Bravura.woff2`);
playback drags in `sonivox.sf3` (954 KB); the web build is designed around Web Workers and
`new AlphaTabApi(element, settings)` takes an `HTMLElement`. And it **cannot export
MusicXML** — its exporters are
[`AlphaTexExporter` and `Gp7Exporter`](https://github.com/CoderLine/alphaTab/tree/develop/packages/alphatab/src/exporter).
It is a guitar-tab-first tool; the piano grand staff is not its centre of gravity.

**Verovio.** The licence question resolves to **LGPL-3.0-or-later**: the npm package declares
it, `COPYING.LESSER` exists, and the README says so; the root `COPYING` is GPL-3.0, which is
the usual LGPL-project layout. LGPL for a **dynamically loaded WASM module** is workable
(keep the module separable, publish any Verovio changes), but it adds a compliance obligation
to a browser app that could otherwise be 100% MIT/BSD. The cost is decisive regardless:
`verovio-toolkit-wasm.js` is **7 139 KB raw / 2 283 KB gzip for a single file** — one `.js`
chunk 15× the chunk budget and 10× the whole initial route. There is a fetch-oriented
`verovio/esm` wrapper (`verovio.mjs`, 14 KB) if the wasm is served separately, but the wasm
itself is still megabytes and it renders MEI/MusicXML only. **Reject.**

**abcjs.** MIT, 149 KB gzip, maintained, renders staves, plays back. It just cannot read or
write MusicXML, so it would force an ABC intermediate and a second converter in each
direction. It is a reasonable *fallback display* if VexFlow integration stalls — nothing more.

---

## 5. MusicXML: version and profile to target

### 5.1 Version

- **Target MusicXML 4.0, `score-partwise`.** MusicXML 4.0 was released June 2021, developed by
  the [W3C Music Notation Community Group](https://www.w3.org/community/music-notation/) and
  published as a **W3C Community Group Final Report** —
  <https://www.w3.org/2021/06/musicxml40/> — licensed under the
  [W3C Community Final Specification Agreement](https://www.w3.org/community/about/agreements/final/)
  ([MakeMusic, "For Developers"](https://www.musicxml.com/for-developers/)).
- **Backward compatibility is explicit:** "Valid MusicXML 1.0, 1.1, 2.0, 3.0, and 3.1 files are
  also valid MusicXML 4.0 files" ([same page](https://www.musicxml.com/for-developers/)). So
  writing 4.0 costs nothing and readers of older versions still accept it.
- **DTDs are deprecated as of 4.0 in favour of the XSD**, but the spec still tells writers to
  emit the DOCTYPE for compatibility: "The MusicXML DTDs are deprecated as of Version 4.0 in
  favor of the XSD. However there are still applications using DTDs. When writing MusicXML
  files, writing the document type declaration makes it easier for all applications — XSD or
  DTD based — to validate" ([Hello World tutorial](https://www.w3.org/2021/06/musicxml40/tutorial/hello-world/)).
  Emit it.
- A **3.1 fallback** is unnecessary unless a specific partner tool rejects `version="4.0"`.
  I found no primary-source statement of a mainstream tool rejecting 4.0; the practical
  situation across MuseScore/Sibelius/Dorico/Logic is **UNVERIFIED** at the release-note level
  (see §7).
- **Finale is no longer a moving target**: MakeMusic
  [announced the sunset of Finale](https://www.makemusic.com/press-room/press-releases-2024/makemusic-sunsets-finale/)
  in 2024 and [technical support has ended](https://makemusic.zendesk.com/hc/en-us/articles/33668410024343-What-Happens-Now-That-Finale-Technical-Support-Has-Ended).
  Optimise for MuseScore/Dorico/Sibelius/Logic, and keep the file conservative.

### 5.2 Structure: partwise, not timewise

`score-partwise` (parts contain measures) is the interchange default and the form every
tutorial and example uses; `score-timewise` (measures contain parts) exists and the spec
provides `parttime.xsl` / `timepart.xsl` to convert. **Write and accept `score-partwise`.**
If we ever need timewise, do not hand-code it — run the spec's own XSLT
([file listings](https://www.w3.org/2021/06/musicxml40/listings/overview/)).

### 5.3 Compressed `.mxl`

- It is a **zip (DEFLATE, RFC 1951)** whose first file must be `mimetype` containing exactly
  `application/vnd.recordare.musicxml`, **stored uncompressed**, with no extra field, no BOM,
  no whitespace; plus `META-INF/container.xml` naming the root file
  ([Compressed .MXL Files](https://www.w3.org/2021/06/musicxml40/tutorial/compressed-mxl-files/)).
- The `mimetype`-first rule arrived in **3.1**; older `.mxl` files may lack it, so **the reader
  must not require it**.
- `META-INF/container.xml` example and the meaning of `full-path`/`media-type` are on the same
  page; the first `<rootfile>` is the MusicXML root.
- `musicxml-io` handles this today: `isCompressed()`, `parseCompressed()`,
  `serializeCompressed()` all worked in a local smoke test (a 1 396-byte `score-partwise`
  round-tripped through a zip built with `fflate` and came back `PK…`).

### 5.4 Minimal **correct** piano grand-staff file

Element **order is significant** — the spec's content models are sequences, and the Hello
World tutorial says so in as many words: "The order in which these elements appear does matter.
In the `<note>` element, the `<pitch>` element must precede the `<duration>` element, and the
`<type>` element must come afterwards."

Skeleton (a bar of two hands, 4/4, division = 4 per quarter):

```xml
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC
    "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
    "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <identification>
    <encoding>
      <software>groove</software>
      <encoding-date>2026-09-30</encoding-date>
      <supports element="print" attribute="new-system" type="yes" value="yes"/>
      <supports element="print" attribute="new-page"  type="yes" value="yes"/>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>4</divisions>            <!-- divisions per QUARTER note -->
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <!-- staff 1, voice 1 -->
      <note>
        <pitch><step>C</step><alter>1</alter><octave>5</octave></pitch>
        <duration>4</duration><tie type="start"/>
        <voice>1</voice><type>quarter</type><stem>up</stem><staff>1</staff>
        <beam number="1">begin</beam>
        <notations><tied type="start"/></notations>
      </note>
      <note>
        <pitch><step>C</step><alter>1</alter><octave>5</octave></pitch>
        <duration>4</duration><tie type="stop"/>
        <voice>1</voice><type>quarter</type><stem>up</stem><staff>1</staff>
        <beam number="1">end</beam>
      </note>
      <note><rest/><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>16</duration></backup>   <!-- rewind for staff 2 -->
      <!-- staff 2, voice 2 -->
      <note>
        <pitch><step>C</step><octave>3</octave></pitch>
        <duration>16</duration>
        <voice>2</voice><type>whole</type><stem>down</stem><staff>2</staff>
      </note>
    </measure>
  </part>
</score-partwise>
```

**This exact file was run through `musicxml-io@0.10.3` during this research:**
`parse()` succeeds, `isValid(score)` returns `true`, and `validate(score)` returns
`{ valid: true, errors: [], warnings: [], infos: [] }`. The first draft of it did **not** —
the validator caught `BEAM_BEGIN_WITHOUT_END` ("Beam 1 started but never ended in measure"),
a mistake that is easy to make and invisible in a browser. That is an argument for wiring
`validate()` into the exporter's Vitest suite from day one.

Caveat found while testing: the individual validators
(`validateBackupForward`, `validateMeasureDuration`, `validateStaffStructure`) **throw**
`TypeError: Cannot read properties of undefined` when called with only a score — in 0.10.3 they
need a second options argument that the published typings describe loosely. *(Verified
behaviour; the required options object is UNVERIFIED.)*

Ordering rules that matter, all from the spec's content models
([`<note>`](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/note/),
[Notation Basics](https://www.w3.org/2021/06/musicxml40/tutorial/notation-basics/)):

1. `<note>` order is: `grace?` → (`chord`? then one of `pitch`/`unpitched`/`rest`) → `tie`(0-2)
   → `duration` → `instrument`* → (`footnote`? `level`? `voice`?) → `type` → `dot`* →
   `accidental` → `time-modification` → `stem` → `notehead` → `staff` → `beam`* →
   `notations`* → `lyric`* → `play` → `listen`.
2. **`<tie>` (sound) and `<notations><tied>` (visual) are separate elements**; ties across
   barlines need both, on both the starting and stopping note.
3. `<chord/>` means "this note starts at the same time as the previous one"; the **first**
   note of a chord does not carry it.
4. `<staff>` should be present wherever possible in multi-staff parts — it is what makes a
   cross-staff chord come out as a cross-staff chord.
5. Independent hands are two **voices** with a `<backup><duration>` between them; adding
   `<voice>` numbers makes the file import correctly into layer-aware tools.
6. `<type>` is the *written* value and is separate from `<duration>`; both are written.
7. Beams: `<beam number="1..8">begin|continue|end|forward hook|backward hook</beam>`.
8. Tuplets need `<time-modification><actual-notes>/<normal-notes>` for placement **and**
   `<notations><tuplet type="start|stop">` to be visible; `<normal-type>` is needed when the
   note's `<type>` differs from the tuplet's implied type (the classic failure: one quarter
   plus one eighth instead of three eighths).
9. `<attributes>` should appear before the first note it governs, `<divisions>` must be
   established before any `<duration>` is used, and `key`/`time`/`clef` are optional thereafter
   (changes mid-measure are legal).
10. Common/cut time: `<time symbol="common">` / `<time symbol="cut">` — otherwise 4/4 prints
    as "4/4", not "C".

### 5.5 What other tools need in practice

- **Always emit**: XML declaration, DOCTYPE (see above), `<score-partwise version="4.0">`,
  `<part-list>` with a `<score-part id>` whose `id` the `<part id>` references, `<divisions>`
  in the first `<attributes>`, `<staves>` + numbered clefs for a grand staff, `<staff>` on
  every note of a multi-staff part, `<voice>` numbers, `<backup>` between staves, `<type>` on
  every non-grace note.
- **Emit opportunistically**: `<identification><encoding><software>` (grace's own value is a
  good provenance marker), `<supports element="print" attribute="new-system" type="yes"
  value="yes"/>` and the `new-page` twin, `<work>`/`<movement-title>`, `<direction>` for tempo
  and dynamics (a `<sound tempo="…">` inside a `<direction>` is the interoperable way to carry
  tempo).
- I could **not** find a primary, tool-vendor statement enumerating "elements required for
  tool X to accept a file". The list above is derived from the spec's own required/optional
  markers plus the tutorial's worked examples; the *rejection* behaviour of specific tools is
  **UNVERIFIED** and needs empirical testing with real exports from MuseScore, Dorico,
  Sibelius and Logic (see §7).
- **Validation we should run ourselves**: `musicxml-io` ships the tools to do it in-process —
  `validate()`, `validateBackupForward()`, `validateMeasureDuration()`, `validateTies()`,
  `validateSlurs()`, `validateTuplets()`, `validateBeams()`, `validateVoiceStaff()`,
  `validateStaffStructure()`, `measureRoundtrip()`, `scoresEqual()`. That is a much better
  safety net than eyeballing XML, and it works in Vitest with no browser.
- The authoritative schema to validate against is
  [`musicxml.xsd`](https://www.w3.org/2021/06/musicxml40/listings/musicxml.xsd) from the
  [W3C MusicXML release](https://github.com/w3c/musicxml/releases/tag/v4.0).

---

## 6. What we implement ourselves regardless of the library

Beaming, ties, spelling and layout are *musical* decisions; no library in this list makes
them for us when the input is `{pitch, startBeats, lengthBeats}`.

| # | Task | Why it is ours | What VexFlow/`musicxml-io` gives us |
| --- | --- | --- | --- |
| 1 | **Duration → written value** (`lengthBeats` → `whole`/`half`/`quarter`/`eighth`/`16th` + dots, or a tie chain) | A beat-length is not a notated duration. 1.5 beats = dotted quarter, but 5 beats = half tied to quarter. | VexFlow takes a duration **string**; `musicxml-io` has `getNormalizedDuration()` |
| 2 | **Beaming** | Which notes beam together is a metrical decision (beat boundaries, 4/4 groups of 4 sixteenths, vocal exceptions). | `Beam.generateBeams(notes)` exists in VexFlow; `musicxml-io` has `autoBeam()` and `getBeamGroups()` — we still choose the policy |
| 3 | **Ties across barlines** | A note whose duration crosses a bar must be split and tied; the split segments need matched `<tie>`/`<tied type="start|stop">`. | `musicxml-io` `addTie`/`removeTie`/`getTiedNoteGroups`/`validateTiesAcrossMeasures` |
| 4 | **Enharmonic spelling** (MIDI → step/alter/octave) | MIDI 61 is C♯4 or D♭4; the correct answer comes from the key and the harmonic context. This is the single biggest source of "technically valid, musically wrong" output. | `tonal` (`Note.fromMidi`, key-aware spelling) or our own key→spelling table |
| 5 | **Key signature → fifths, and courtesy/accidental state** | `<alter>` must always be present when the pitch is altered, *even if the alteration is in the key signature* (spec, Hello World). Accidentals that repeat within a bar are a policy choice. | nothing; `Stave.addKeySignature('Db')` only draws |
| 6 | **Rests** | Silence between notes must become explicit `<rest>` entries with a duration; gaps are not implied. | `musicxml-io` `isRest()`, `isRestMeasure()`, `AddVoice`/`addVoice` |
| 7 | **Layout and system breaks** | Where the page breaks; VexFlow positions one stave at a time (`Formatter`, `System`), OSMD does this for us but we are not using OSMD. | VexFlow `System`/`Formatter`, `Stave.setMeasure()` for bar numbers |
| 8 | **Tuplets** | `time-modification` + `<tuplet>` + matching `actual-notes`/`normal-notes`; not derivable from a beat length alone. | `musicxml-io` `createTuplet`/`getTupletGroups`/`validateTuplets`; VexFlow `Tuplet` |
| 9 | **Import: MusicXML → our model** | The inverse of 1–5, plus `<backup>`/`<forward>` traversal, voice→hand assignment, and discarding notation we cannot represent (`<type>` does not round-trip a swing feel). Lossy by design; document it. | `musicxml-io` `parse`/`parseCompressed` + `iterateNotes`/`getVoicesForStaff`/`getEffectiveStaff` |
| 10 | **Undo/redo and dirty-state for import** | An import replaces the arrangement; that must be one undoable step and must not fire a second time on re-render. | app-level |
| 11 | **Score ⇄ piano-roll correspondence** | Highlights, selection sync, "show me this bar". | VexFlow gives SVG nodes but no mapping; we maintain the index |

Item 4 deserves an explicit spike: pick 20 real groove patterns, spell them, and diff against
what MuseScore produces for the same MIDI. A generic `pitch % 12 → sharp` table will look
wrong in F major and flat keys.

---

## 7. Explicitly unverified / marked as inference

- **Tool-by-tool MusicXML 4.0 acceptance** (MuseScore, Sibelius, Dorico, Logic, Notion):
  not verified from release notes or vendor import documentation. The claim that 4.0 is
  broadly accepted rests on the spec's backward-compatibility statement and on 4.0 being a
  W3C CG Final Report since 2021, not on per-tool evidence. **Must be tested empirically.**
- **Tool-specific "required element" lists**: no vendor document found that enumerates them.
  §5.5 is spec-derived, not vendor-derived. *(Inference.)*
- **OSMD's exact released bundle composition**: I verified `vexflow@1.2.93` and the
  `prebuildVexflow` patch step in `package.json` and the `import Vex from "vexflow"` type
  references, and the shipped bundle is 327 KB gzip. Whether VexFlow 1.2.93 is *inlined* in
  that minified bundle or left external is **not fully determined** (the `.min.js` contains
  one occurrence of the string `vexflow`, and the published `files` list ships only the
  minified bundle, so the effective answer depends on the consumer's bundler). Treat the
  327 KB figure as a floor, not a ceiling. *(Partially unverified.)*
- **Verovio licence tension**: npm says `LGPL-3.0-or-later`, the repo README says LGPL, but the
  top-level `COPYING` is GPL-3.0 and there is a separate `COPYING.LESSER`. Which applies to
  the npm JS/WASM artifact specifically in all jurisdictions is a legal question, not one I
  resolved. Either way it is copyleft. *(Resolved enough to reject on size alone.)*
- **`webmscore`** (MuseScore→WASM, npm 1.2.1, 2023-01-24): not evaluated. If MusicXML
  *fidelity* ever becomes the binding constraint, it is the thing to look at, and the size
  objection (a full engraver as WASM) is likely to be as decisive as Verovio's.
- **Bundle-size figures are for one configuration.** esbuild minify differs slightly from
  Rollup/Terser, and tree-shaking outcomes depend on our import surface. A VexFlow import that
  reaches for more modules than the ten I stubbed will be larger than 89 KB. Re-measure with
  `npm run check:budget` once the route exists.
- **`@stringsync/vexml` 790 KB gzip** was measured through `export *` from the package root,
  which is the worst case and may pull in modules a targeted import would not. *(Upper bound.)*
- **`svguitar` / `vexchords`** were only checked at the registry/licence level (MIT on npm);
  their repos did not resolve through the GitHub API for me. Their irrelevance is established
  by their stated purpose (chord diagrams), which is enough.

---

## 8. Recommended approach, with the engineering consequences stated

### 8.1 Shape

```
src/score/
  model.ts            our model → "score events": voice, hand, written duration, dots, ties
  durations.ts        beats → written duration + dots / tie chains            (ours)
  spelling.ts         MIDI + key → step/alter/octave (tonal or a table)       (ours)
  beam.ts             beam policy (4/4 default)                               (ours)
  musicxml/write.ts   score events → MusicXML 4.0 score-partwise              (ours, on musicxml-io)
  musicxml/read.ts    MusicXML/.mxl → score events  (lossy, documented)       (ours, on musicxml-io)
  render/vexflow.ts   score events → VexFlow staves/voices/beams              (ours, on vexflow)
  ScorePanel.tsx      React.lazy route, dynamic import('vexflow')
```

Dependencies: `vexflow@5` (render, MIT), `musicxml-io@0.10` (parse/serialize, MIT), optional
`tonal` for spelling (MIT), and a zip library only if we build `.mxl` **ourselves** — but
`musicxml-io` already brings `fflate` for that.

### 8.2 Bundle consequences — the part that decides the design

| Choice | Gzip cost | Fits 150 KB chunk gate? | Fits 226 KB initial route? |
| --- | --- | --- | --- |
| VexFlow core + font from **our own origin** | **89 KB** | ✅ yes | ✅ yes, as a lazy chunk (0 KB on the initial route) |
| VexFlow core + Bravura **embedded** | **378 KB** | ❌ no | only if split across ≥3 chunks |
| VexFlow `vexflow/bravura` entry as shipped | 378 KB | ❌ | ❌ |
| VexFlow full entry (all fonts) | 674 KB | ❌ | ❌ |
| + `musicxml-io` | +76 KB | combined ≈ 165 KB ❌ as **one** chunk; split them | ✅ if both lazy |
| OSMD alone | 339 KB | ❌ | ❌ |
| alphaTab alone | 272 KB | ❌ | ❌ |
| Verovio (`verovio-toolkit-wasm.js`) | 2 283 KB | ❌ | ❌ |

So the plan has three hard requirements:

1. **Lazy-load.** `React.lazy(() => import('./ScorePanel'))` and inside it
   `await import('vexflow/core')`. Verified: importing a VexFlow esbuild bundle in bare Node
   does not touch the DOM, so the import itself is safe to defer to first render.
2. **Two chunks, not one.** Give VexFlow and `musicxml-io` separate `manualChunks` entries in
   [`vite.config.ts`](../../vite.config.ts), e.g. `vendor-vexflow` and `vendor-musicxml`.
   Without an entry they land in a shared chunk with the entry and the initial route regresses
   immediately — this is the failure the budget comments in `check_budgets.js` describe.
   Then verify `vendor-vexflow` ≤ 150 KB (89 KB expected) and `vendor-musicxml` ≤ 150 KB
   (76 KB expected). Note the current `check_budgets.js` step 4 fails **any** chunk over
   150 KB, so the 378 KB embed path is not shippable without either splitting the font into
   its own chunk (still >150 KB — fails) or serving it as a real `.woff2` asset (the right
   answer).
3. **Self-host the font.** Set `Font.HOST_URL` to our origin and serve the two woff2 files
   (Bravura for glyphs, plus a text font for bar numbers and titles). This is also the OFL
   compliance answer: ship the OFL notice for Bravura ourselves. Cost: two static files
   (~300 KB for Bravura woff2, cached, not part of the JS budget — the gate only measures
   `.js` and `.wasm`, per `collectWasmFiles`/step 4).

### 8.3 Tradeoffs, honestly

| Approach | What it buys | What it costs |
| --- | --- | --- |
| **VexFlow from our model (recommended)** | 89 KB lazy; MIT; TS types; SVG *or* Canvas; full control; no third-party format in the hot path; an editing stage is a natural extension of the same drawing code | **We own layout** — systems, page breaks, spacing, collision avoidance. VexFlow formats a stave/voice; it does not lay out a score. For "piano grand staff with bar numbers" that is a few hundred lines; for "looks like MuseScore" it is a project. |
| **Generate MusicXML → OSMD** | Correct engraving for free; MusicXML correctness tested by someone else | 339 KB; a second, ancient VexFlow; a MusicXML round-trip on every render (serialize then parse); cursor/hit-testing goes through OSMD's model, not ours; **we still write the writer**. |
| **VexFlow render + `musicxml-io` import/export** | Each half is the best available at its job; import is independent of render | Two dependencies, two upgrade paths; a conversion layer between `musicxml-io`'s `Score` and our note events that we own and must test |
| **alphaTab** | Playback, GuitarPro, MusicXML, all in one | MPL-2.0 file-level copyleft; 272 KB + fonts; worker-based; wrong output shape for MIDI-derived piano music |
| **Verovio** | Best-in-class engraving | LGPL; 2.28 MB gzip single file; MEI/MusicXML only |

### 8.4 Maintenance burden we are accepting

- **`musicxml-io` is young** (0.10.3, six stars, one author). It is the best-maintained typed
  permissive option today, but a 0.x single-maintainer dependency for a product's import/export
  path is a real risk. Mitigations, in order: (1) pin the version and vendor the lockfile;
  (2) keep `musicxml/write.ts` and `musicxml/read.ts` as our own thin modules so the dependency
  is swappable; (3) put the [W3C MusicXML 4.0 test suite / examples](https://www.w3.org/2021/06/musicxml40/musicxml-reference/examples/)
  and files exported by MuseScore/Dorico into `src/test/fixtures/` so a swap is verifiable.
  The fallback is `fast-xml-parser` (MIT, very active) + our own serializer — more code, no
  single-maintainer risk.
- **VexFlow** is a healthy 2010-era project: 5.0.0 in March 2025, still committing in 2026,
  35 open issues, MIT. The main hazard is that it is pre-6.0 and its font handling changed
  between 4 and 5; pin it.
- **Beaming/spelling/duration logic is ours forever.** No dependency removes it.

---

## Sources

Primary sources used, by claim.

**Licences (read from the repositories, not from memory):**
[VexFlow LICENSE](https://github.com/vexflow/vexflow/blob/main/LICENSE) ·
[VexFlow 3.0.9 LICENSE](https://raw.githubusercontent.com/vexflow/vexflow/3.0.9/LICENSE) ·
[VexFlow 4.2.2 LICENSE](https://raw.githubusercontent.com/vexflow/vexflow/4.2.2/LICENSE) ·
[VexFlow PR #330](https://github.com/vexflow/vexflow/pull/330) ·
[OSMD LICENSE](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/blob/develop/LICENSE) ·
[alphaTab package LICENSE](https://github.com/CoderLine/alphaTab/blob/develop/packages/alphatab/LICENSE) ·
[alphaTab LICENSE.header](https://github.com/CoderLine/alphaTab/blob/develop/packages/alphatab/LICENSE.header) ·
[Verovio COPYING.LESSER](https://github.com/rism-digital/verovio/blob/develop/COPYING.LESSER) ·
[Verovio README](https://github.com/rism-digital/verovio/blob/develop/README.md) ·
[abcjs LICENSE.md](https://github.com/paulrosen/abcjs/blob/master/LICENSE.md) ·
[Bravura LICENSE.txt](https://raw.githubusercontent.com/steinbergmedia/bravura/master/LICENSE.txt)

**Registry metadata (versions, licence fields, publish dates, unpacked sizes):**
[vexflow](https://registry.npmjs.org/vexflow) ·
[vexflow@5.0.0](https://registry.npmjs.org/vexflow/5.0.0) ·
[opensheetmusicdisplay](https://registry.npmjs.org/opensheetmusicdisplay) ·
[@coderline/alphatab](https://registry.npmjs.org/@coderline%2Falphatab) ·
[verovio@6.3.0](https://registry.npmjs.org/verovio/6.3.0) ·
[abcjs](https://registry.npmjs.org/abcjs) ·
[musicxml-io@0.10.3](https://registry.npmjs.org/musicxml-io/0.10.3) ·
[musicxml-interfaces](https://registry.npmjs.org/musicxml-interfaces) ·
[@stringsync/musicxml](https://registry.npmjs.org/@stringsync%2Fmusicxml) ·
[@vexflow-fonts/bravura](https://registry.npmjs.org/@vexflow-fonts%2Fbravura) ·
[fast-xml-parser](https://registry.npmjs.org/fast-xml-parser) ·
[xml-js](https://registry.npmjs.org/xml-js) ·
[tonal](https://registry.npmjs.org/tonal) ·
[svguitar](https://registry.npmjs.org/svguitar) ·
[vexchords](https://registry.npmjs.org/vexchords)

**Repositories / maintenance:**
[vexflow](https://github.com/vexflow/vexflow) ·
[opensheetmusicdisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) ·
[CoderLine/alphaTab](https://github.com/CoderLine/alphaTab) ·
[rism-digital/verovio](https://github.com/rism-digital/verovio) ·
[paulrosen/abcjs](https://github.com/paulrosen/abcjs) ·
[tan-z-tan/musicxml-io](https://github.com/tan-z-tan/musicxml-io) ·
[stringsync/vexml](https://github.com/stringsync/vexml) ·
[alphaTab exporters](https://github.com/CoderLine/alphaTab/tree/develop/packages/alphatab/src/exporter) ·
[OSMD README (limitations)](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay/blob/develop/README.md)

**MusicXML specification:**
[MusicXML 4.0 (W3C CG Final Report)](https://www.w3.org/2021/06/musicxml40/) ·
[Hello World tutorial](https://www.w3.org/2021/06/musicxml40/tutorial/hello-world/) ·
[Notation Basics](https://www.w3.org/2021/06/musicxml40/tutorial/notation-basics/) ·
[Compressed .MXL Files](https://www.w3.org/2021/06/musicxml40/tutorial/compressed-mxl-files/) ·
[`<note>` element reference](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/note/) ·
[`musicxml.xsd`](https://www.w3.org/2021/06/musicxml40/listings/musicxml.xsd) ·
[file listings / XSLT](https://www.w3.org/2021/06/musicxml40/listings/overview/) ·
[MakeMusic "For Developers"](https://www.musicxml.com/for-developers/) ·
[W3C MusicXML v4.0 release](https://github.com/w3c/musicxml/releases/tag/v4.0) ·
[W3C Music Notation Community Group](https://www.w3.org/community/music-notation/) ·
[MuseScore Studio Handbook: MusicXML](https://handbook.musescore.org/file-management/working-with-musicxml-files)

**Commercial-tool context:**
[MakeMusic sunsets Finale](https://www.makemusic.com/press-room/press-releases-2024/makemusic-sunsets-finale/) ·
[Finale support has ended](https://makemusic.zendesk.com/hc/en-us/articles/33668410024343-What-Happens-Now-That-Finale-Technical-Support-Has-Ended) ·
[Finale Sunset FAQ](https://makemusic.zendesk.com/hc/en-us/articles/25843888130839-Finale-Sunset-FAQ)
