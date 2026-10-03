/**
 * ⭐ **The `?diag=1` sampler section: it exists, it is off until asked for, it says what the play did, and it prints no secret.**
 *
 * ## The two questions it exists for, in the owner's words
 *
 *   · *"我播放时候，没有 cache 模式，直接点播放，没看到哪里会提示下载音源"* — answered by the **progress / ready / problems** lines,
 *     which describe the press rather than the current render (a play is over by the time anyone opens a panel, so the play
 *     writes a ledger and the panel is a rendering of it);
 *   · *"源站地址多一层目录"* — answered by **two addresses side by side** on every asset, plus a probe button that turns that
 *     reading into `200`/`404` per address. ⚠️ The probe is **this panel's own request** and the criterion says so: the loader
 *     does not attribute a *successful* load to one host, and the panel must not claim it does.
 *
 * ## ⚠️ The counting rule, which is two rules and both are shown
 *
 * `docs/SAMPLED_RANGE_COVERAGE.md` §1.1 states the census's own scope verbatim: *"本普查只算 `bass`/`chords`/`lead` 三个旋律声部
 * （**202 条**），因为鼓声部由**另一张表**（`src/audio/drumRoles.ts`）决定，且鼓轨不写音高"*. That is why the census row for
 * `edm-trap` is `0`: its two mapped lanes are **drum** lanes. It is **not** "no lane is a recording" — the download set is every
 * mapped lane, and both numbers are on the panel. The two cases below pin both readings against the engine's own resolvers, and
 * the third pins the census's headline instance (`bebop`'s lead → `sax_lead` → `mtg-solo-sax:MTG-Tenor-Sax`, written 82–91
 * against a recording that sounds 39–76).
 *
 * ## The two iron rules
 *
 *   1. **默认不显示** — with no reader handed in, the section is in the DOM and **empty**, so the panel is one character poorer
 *      than before rather than one richer; and the panel itself is only installed behind the flag (`debugModeForcedByUrl`),
 *      which the last case reads;
 *   2. **绝不出密钥** — every string comes from the catalogue entry the play resolved against or from the loader's own messages.
 *      The criterion reads the two modules' **source** for `import.meta.env` / `process.env` / `VITE_`, and the rendered text
 *      **and the copied report** for a marker placed in the process's environment, because a panel that leaked a token is not
 *      something a later commit can undo.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { GENRES_MAP } from "../data/genres";
import { patternFromGenre } from "../data/genreMix";
import { standDownSamplerLanes } from "../audio/samplerLanePrepare";

/**
 * ⚠️ **The manifest is read inside the mock factory, not at this file's top level.**
 *
 * `vi.mock` is hoisted above every `const`, so a factory closing over a top-level binding throws
 * `Cannot access 'assets' before initialization` — which is how this file failed its first run. A hoisted holder is the
 * seam: the factory fills it when the module is first imported, and the cases read it after that.
 */
const holder = vi.hoisted(() => ({ assets: [] as readonly import("../data/sampleCatalogue").SampleAsset[] }));

vi.mock("../data/sampleCatalogueRuntime", async () => {
  const { catalogueFromManifestText } = await import("../data/sampleCatalogue");
  const { readFileSync } = await import("node:fs");
  const { assets } = catalogueFromManifestText(
    readFileSync("public/samples/manifest.json", "utf8"),
    "https://r2mirror.groove.wangda.today"
  );
  holder.assets = assets;
  return {
    appCatalogueRuntime: {
      assets,
      problems: [] as string[],
      ready: true,
      configured: true,
      loading: false,
      load: async () => ({ assets, problems: [] as string[] }),
    },
  };
});

/**
 * ⭐ **A program per address, so the coverage answer is the engine's and the criterion's numbers are pinned to a fixture.**
 *
 * Every asset gets a recording that sounds the whole MIDI range (so nothing is out of range for a reason that belongs to a
 * different case), except the tenor sax, which gets the census's own measured range — **39–76** — because `bebop`'s lead is
 * written 82–91 and that is the instance `docs/SAMPLED_RANGE_COVERAGE.md` §0 counts as "一个音都不发".
 */
const WIDE = ["<control> default_path=Samples/", "<region> sample=a.wav lokey=0 hikey=127 pitch_keycenter=60"].join("\n");
const TENOR = ["<control> default_path=Samples/", "<region> sample=a.wav lokey=39 hikey=76 pitch_keycenter=60"].join("\n");

/** Counted, so "the panel asked the two addresses once each" is a reading rather than a hope. */
const fetchCalls: string[] = [];

function installFetchStub(): void {
  fetchCalls.length = 0;
  globalThis.fetch = (async (url: string) => {
    fetchCalls.push(url);
    if (url.includes("Sample")) return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8), text: async () => "" };
    // The owner's extra-directory shape: the **source** address is wrong, the mirror answers.
    if (url.includes("raw.githubusercontent.com")) {
      return { ok: false, status: 404, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
    }
    return {
      ok: true,
      status: 200,
      text: async () => (url.includes("MTG") ? TENOR : WIDE),
      arrayBuffer: async () => new ArrayBuffer(8),
    };
  }) as unknown as typeof fetch;
}

import {
  __resetSamplerPlayLedger,
  ledgerLanesOf,
  observingSamplerLoader,
  publishSamplerPlay,
  type SamplerLedgerAsset,
} from "../hooks/samplerPlayLedger";
import { prepareSamplerLanes } from "../audio/samplerLanePrepare";
import { __resetSamplerDiagnostics, probeSamplerAddresses, samplerDiagView } from "../hooks/samplerDiagnostics";
import { installDiagnostics } from "../platform/diagnostics";
import { debugModeForcedByUrl } from "../platform/debugMode";

/** A loader that answers every note and reports the decode count, so the play can be recorded without a graph. */
function countingLoader() {
  const seen = new Set<string>();
  return {
    load: async () => ({}) as AudioBuffer,
    loadNote: async (assetId: string, pitch: number) => {
      seen.add(`${assetId}|${pitch}`);
      return { buffer: {} as AudioBuffer, ratio: 1, samplePath: `${assetId.split(":")[0]}.wav` };
    },
    decodes: () => seen.size,
  };
}

/**
 * ⭐ **Record one press of a genre, through the production helpers** (`ledgerLanesOf`, `observingSamplerLoader`,
 * `prepareSamplerLanes`) rather than by hand-writing a record — so a criterion here cannot pass on a ledger shape the
 * application never produces.
 */
async function recordPress(genreId: string, entry = "/studio") {
  const genre = GENRES_MAP[genreId]!;
  const pattern = patternFromGenre(genre);
  const lanes = standDownSamplerLanes(pattern, holder.assets);
  const observed = new Map<string, SamplerLedgerAsset>();
  const loader = countingLoader();
  const preparation = await prepareSamplerLanes({
    pattern,
    catalogue: holder.assets,
    loader: observingSamplerLoader(loader, holder.assets, observed),
    bpm: pattern.bpm ?? 120,
    lanes,
  });
  publishSamplerPlay({
    entry,
    ...(pattern.genre_id === undefined ? {} : { genre: pattern.genre_id }),
    at: "2026-10-03T00:00:00.000Z",
    lanes: ledgerLanesOf(pattern, holder.assets),
    laneCount: pattern.tracks.length,
    assets: [...observed.values()],
    progress: preparation.total > 0 ? { loaded: preparation.loaded, total: preparation.total } : null,
    ready: preparation.ready,
    empty: preparation.empty,
    problems: preparation.problems,
    loaderBuilds: 1,
    decodes: preparation.loaded,
  });
  return preparation;
}

beforeEach(() => {
  __resetSamplerPlayLedger();
  __resetSamplerDiagnostics();
  installFetchStub();
});

afterEach(() => {
  vi.restoreAllMocks();
  /**
   * ⚠️ **The panel is real DOM, so a case that throws before `remove()` would leave it in the document** — and the very next
   * case is the one asserting that no panel exists by default. Measured: that is exactly how this file failed its second run.
   */
  for (const node of document.querySelectorAll('[data-testid^="diag-"]')) node.remove();
});

describe("the sampler ledger, read the way the panel reads it", () => {
  it("⭐ edm-trap：映射了 2 条鼓声部、旋律 0 —— 没有要下载的东西，但也不是'没有采样声部'", async () => {
    const preparation = await recordPress("edm-trap");
    const view = await samplerDiagView();

    expect(view.record?.lanes.length, "edm-trap maps two lanes to a catalogue recording").toBe(2);
    expect(view.melodicLanes, "the census's melodic count for edm-trap is 0 (drum lanes write no pitch)").toHaveLength(0);
    expect(view.drumLanes.map((lane) => lane.name).sort()).toEqual(["Hi-Hats", "Percussion"]);
    expect(view.assets.map((asset) => asset.assetId)).toEqual(["virtuosity-drums-basic"]);
    // Nothing to fetch — the plan is empty, so there is no wait to raise.
    expect(preparation.total).toBe(0);
    expect(preparation.empty).toBe(true);
    expect(view.record?.progress).toBeNull();
    expect(view.lines.join("\n")).toContain("旋律 0 · 鼓 2");
    expect(view.lines.join("\n")).toContain("no pitch: nothing to fetch");
    // And it does **not** claim the pattern has no recordings — it has two.
    expect(view.lines.join("\n")).not.toContain("no lane of this pattern is a catalogue recording");
  }, 60000);

  it("⭐ delta-blues：3 条旋律声部与其 assetId，且每个资产的两个地址并排", async () => {
    const preparation = await recordPress("delta-blues");
    const view = await samplerDiagView();
    const text = view.lines.join("\n");

    // The census's three melodic lanes, with the exact assets it lists.
    expect(view.melodicLanes.map((lane) => `${lane.name}→${lane.assetId}`).sort()).toEqual([
      "Bassline→dsmolken-double-bass:d-smolken-rubner-bass-pizz",
      "Chords / Pad→karoryfer-emilyguitar:emily-clean",
      "Lead Synth→karoryfer-emilyguitar:emily-clean",
    ]);
    // The download set is every mapped lane, drum lanes included — the second count, kept apart from the first.
    expect(view.record?.lanes.length).toBe(7);
    expect(preparation.total).toBeGreaterThan(0);

    const emily = view.assets.find((asset) => asset.assetId === "karoryfer-emilyguitar:emily-clean");
    expect(emily?.sourceUrl).toBe(
      "https://raw.githubusercontent.com/sfzinstruments/karoryfer.emilyguitar/b4920dc662fd9cad6dcaccdeecffdd91c8725d8c/Emilyguitar/emily_clean.sfz"
    );
    expect(emily?.mirrorUrl).toBe(
      "https://r2mirror.groove.wangda.today/karoryfer-emilyguitar/Emilyguitar/emily_clean.sfz"
    );
    // ⭐ Both addresses are on the panel, which is the whole "多一层目录" question.
    expect(text).toContain(emily!.sourceUrl!);
    expect(text).toContain(emily!.mirrorUrl!);
    expect(text).toContain(`progress   ${preparation.loaded} / ${preparation.total} ready`);
  }, 60000);

  it("⭐ 一条写在录音音域之外的声部：面板报出超出几个音（普查那条实例的形状）", async () => {
    /**
     * ⚠️ **This used to press `bebop`'s real lead, and it stopped being able to.**
     *
     * `docs/SAMPLED_RANGE_COVERAGE.md` §0 counted `bebop`'s lead as one of the five "一个音都不发" lanes — *"44 条 note，写
     * 82–91，而 `sax_lead` 映射的 `mtg-solo-sax:MTG-Tenor-Sax` 只发 39–76"*. On a later `origin/dev` the genre data was
     * **fixed** (`cd8ac53 fix(genres): fold four lines written outside their instrument's range back into it`), and the lead
     * now writes 58–67 — so a criterion that pressed the genre would have gone green for the wrong reason and red for the
     * right one, which is what happened on this change's first rebase (measured: `expected 0 to be greater than 0`).
     *
     * So the criterion reproduces the census's **shape** as a ledger record rather than depending on the genre data: the
     * asset and its address are the real ones from the shipping catalogue, the program is this file's fixture (39–76, the
     * asset's measured range), and it is the **engine's** `notesOutsideCoverage` that answers. The genre data itself is
     * guarded by `src/test/sampledRangeCensus.test.ts`, which is where a fixed line belongs.
     */
    const saxPitches = [82, 85, 86, 89, 91];
    const notes = saxPitches.map((pitch, step) => ({ step, pitch, velocity: 100 }));
    publishSamplerPlay({
      entry: "/studio",
      genre: "census-fixture",
      at: "2026-10-03T00:00:00.000Z",
      lanes: [{ name: "Lead Synth", instrument: "sax_lead", assetId: "mtg-solo-sax:MTG-Tenor-Sax", notes }],
      laneCount: 1,
      assets: [
        {
          assetId: "mtg-solo-sax:MTG-Tenor-Sax",
          notes: saxPitches,
          loaded: saxPitches.length,
          samplePaths: [],
          problems: [],
        },
      ],
      progress: { loaded: saxPitches.length, total: saxPitches.length },
      ready: true,
      empty: false,
      problems: [],
      loaderBuilds: 1,
      decodes: saxPitches.length,
    });

    const view = await samplerDiagView();
    const sax = view.assets.find((asset) => asset.assetId === "mtg-solo-sax:MTG-Tenor-Sax");
    expect(sax, "the shipping catalogue must still carry the tenor sax the census measured").toBeTruthy();
    expect(sax!.coverageStatus).toBe("ready");
    // The fixture sounds 39–76, exactly the census's measured range for this asset.
    expect(sax!.coverageRange).toBe("39–76");
    expect(sax!.playableKeys).toBe(38);
    // ⭐ Every written note is refused, and the panel says how many.
    expect(sax!.outside).toEqual(sax!.written.map((note) => note.pitch));
    expect(sax!.outside!.length).toBe(saxPitches.length);
    expect(Math.min(...sax!.outside!)).toBeGreaterThan(76);
    expect(view.lines.join("\n")).toContain("超出 5 note(s)");
  }, 60000);
});

describe("the panel section", () => {
  const engineDouble = () =>
    ({
      getGs1Diagnostics: () => ({ hosts: [] }),
      isGs1Enabled: () => false,
      setGs1Enabled: () => undefined,
      getIsPlaying: () => false,
      getCurrentStep: () => 0,
      getMasterAnalyser: () => null,
    }) as never;

  it("⭐ 默认不显示：没有 reader 时这个区块在 DOM 里但一个字都没有", async () => {
    const remove = installDiagnostics(engineDouble());
    const panel = document.querySelector('[data-testid="diag-panel"]') as unknown as { __report?: unknown };
    /**
     * ⚠️ **The render is awaited, and this is not decoration.**
     *
     * `installDiagnostics` starts an async `render()`; an assertion made synchronously after it read the section *before*
     * anything had written to it, so the first draft of this case passed even with the section deliberately made to print a
     * placeholder. Waiting for the report on the node is what makes the emptiness a fact about the code rather than about
     * the timing — measured: the placeholder red only became visible after this `waitFor` was added.
     */
    await waitFor(() => expect(panel.__report).toBeTruthy(), { timeout: 10000 });
    const section = document.querySelector('[data-testid="diag-sampler"]');
    expect(section, "the section must exist so the panel's layout does not shift").toBeTruthy();
    expect(section!.textContent, "a panel with no sampler reader rendered sampler text").toBe("");
    expect(document.querySelector('[data-testid="diag-sampler-probe-button"]'), "no prober ⇒ no button").toBeNull();
    remove();
  }, 60000);

  it("⭐ 有 reader 时画出记录与两个地址，并且'探测地址'报出 200／404", async () => {
    await recordPress("delta-blues", "/studio");
    const remove = installDiagnostics(engineDouble(), {
      sampler: () => samplerDiagView(),
      probe: () => probeSamplerAddresses(),
    });
    await waitFor(() =>
      expect(document.querySelector('[data-testid="diag-sampler"]')!.textContent).toContain("delta-blues")
    , { timeout: 10000 });
    const section = document.querySelector('[data-testid="diag-sampler"]')!;
    expect(section.textContent).toContain("entry      /studio");
    expect(section.textContent).toContain("karoryfer-emilyguitar:emily-clean");

    const button = document.querySelector('[data-testid="diag-sampler-probe-button"]') as HTMLButtonElement;
    expect(button, "the prober was handed in, so the control must exist").toBeTruthy();
    await act(async () => {
      fireEvent.click(button);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const probeOut = document.querySelector('[data-testid="diag-sampler-probe"]')!;
    await waitFor(() => expect(probeOut.textContent).toContain("404"), { timeout: 10000 });
    // ⭐ The owner's shape: the pinned source does not answer, the mirror does.
    expect(probeOut.textContent).toContain("source");
    expect(probeOut.textContent).toContain("mirror");
    expect(probeOut.textContent).toContain("200");
    expect(fetchCalls.filter((url) => url.includes("raw.githubusercontent.com")).length).toBeGreaterThan(0);
    remove();
  }, 60000);

  it("⭐ 面板只在 diag=1（或设置开关）时安装 —— 默认一个字符都不多", () => {
    expect(debugModeForcedByUrl("")).toBe(false);
    expect(debugModeForcedByUrl("?tab=studio")).toBe(false);
    expect(debugModeForcedByUrl("?diag=0")).toBe(false);
    expect(debugModeForcedByUrl("?diag=1")).toBe(true);
    expect(debugModeForcedByUrl("?diag=1&tab=studio")).toBe(true);
    // And the app renders no panel node unless something installed one.
    expect(document.querySelector('[data-testid="diag-panel"]')).toBeNull();
    expect(document.querySelector('[data-testid="diag-sampler"]')).toBeNull();
  }, 60000);
});

describe("the panel prints no secret", () => {
  const SOURCES = ["src/hooks/samplerDiagnostics.ts", "src/hooks/samplerPlayLedger.ts", "src/platform/diagnostics.ts"];

  /**
   * ⭐ **The syntax tree, not the text** — `scripts/check_layers.mjs` records why, and the same reason applied here on the
   * first run: this criterion's own prose names the tokens it forbids, so a text match reported *the criterion's own
   * documentation* as a leak. An AST node named `env` hanging off `import.meta` is code by construction; the word inside a
   * comment or a doc block is not a node at all.
   */
  function envReadsIn(source: string, fileName: string): string[] {
    const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX);
    const hits: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node)) {
        const text = node.getText(file);
        if (text === "import.meta.env" || text.startsWith("import.meta.env.")) hits.push(text);
        if (text === "process.env" || text.startsWith("process.env.")) hits.push(text);
      }
      if (ts.isStringLiteral(node) && /VITE_/.test(node.text)) hits.push(node.text);
      ts.forEachChild(node, visit);
    };
    visit(file);
    return hits;
  }

  it("⭐ 面板/账本的源码不读任何环境变量（import.meta.env／process.env／VITE_）", () => {
    for (const file of SOURCES) {
      expect(envReadsIn(readFileSync(file, "utf8"), file), `${file} reads an environment variable`).toEqual([]);
    }
  }, 60000);

  it("⭐ 环境里的取值不会出现在面板文本或复制出来的报告里", async () => {
    const SENTINEL = "SENTINEL_d0_not_print_9f3a";
    process.env.VITE_SAMPLE_TOKEN = SENTINEL;
    process.env.VITE_SAMPLE_ROOT = `https://user:${SENTINEL}@mirror.invalid/`;
    try {
      await recordPress("delta-blues", "/studio");
      const engine = {
        getGs1Diagnostics: () => ({ hosts: [] }),
        isGs1Enabled: () => false,
        setGs1Enabled: () => undefined,
        getIsPlaying: () => false,
        getCurrentStep: () => 0,
        getMasterAnalyser: () => null,
        // The private context the report reads, wearing the shape a leaked value would have.
        ctx: { sampleRate: 44100, state: "running" },
      } as never;
      const remove = installDiagnostics(engine, { sampler: () => samplerDiagView() });
      await waitFor(() => expect(document.querySelector('[data-testid="diag-sampler"]')!.textContent).toContain("entry"));
      const copied = JSON.stringify(screen.queryByTestId("nothing") ?? document.querySelector('[data-testid="diag-panel"]')!);
      expect(document.body.textContent, "the panel printed a value from the environment").not.toContain(SENTINEL);
      expect(copied, "the copyable report carried a value from the environment").not.toContain(SENTINEL);
      // The section is still useful — it printed addresses, just not the ones that live in the environment.
      expect(document.querySelector('[data-testid="diag-sampler"]')!.textContent).toContain(
        "https://r2mirror.groove.wangda.today/karoryfer-emilyguitar/Emilyguitar/emily_clean.sfz"
      );
      remove();
    } finally {
      delete process.env.VITE_SAMPLE_TOKEN;
      delete process.env.VITE_SAMPLE_ROOT;
    }
  }, 60000);
});

/** Kept so the file compiles the same way under `tsc --noEmit`: the panel is a DOM surface and needs a document. */
void React;
void LanguageProvider;
