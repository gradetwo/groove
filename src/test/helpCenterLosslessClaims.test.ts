/**
 * **The "lossless" lines `31878f7` named but did not own**, measured one at a time and held to what the code does.
 *
 * ## The report
 *
 * `31878f7` fixed `help.ts`'s `tut_maker_desc`, `help.ts`'s `onboarding_s1_tip` and `studio.ts`'s
 * `kick_dossier_ch4_tip`, and named, in its own criterion's header, the same wording it had no writ over. This file
 * holds those surfaces, and judges each remaining "无损" on its own merits rather than deleting the word wherever it
 * appears: some are false, one was false only in its numbers, and four are true and are pinned instead.
 *
 * 1. `HelpCenterModal.tsx:308` **and** `src/data/tutorialCourses.ts:199-200` — the Maker lesson's third step, carried
 *    twice: inline in the help centre and as the tutorial row `InteractiveTutorialCoach.tsx:295` renders. Both said
 *    "生成包含完整参数的无损压缩 URL 链接分享" / "Share lossless compressed URLs or export an Ableton project".
 *    **False.** Run through the maker's own codec below,
 *    `encodeGenreToSharePayload` carries a lane's `steps`, `pitch`, `gate`, `volume`, `mute` and `swing` (plus
 *    `laneId`/`sampleAssetId`) and **not** `velocity`, `ratchet`, `probability`, `trackLength`, `pan`, `sendA` or
 *    `sendB`, while the decoder *invents* `aliases`, `common_chords`, `structure` and `sources`. Deflate is a lossless
 *    *compression*, so "compressed" was never the false half — "包含完整参数" and "无损" as claims about the payload
 *    are. Both languages now call the thing what the maker's own control (`maker_share_url_copy`, "Copy Share Link" /
 *    "复制分享链接") calls it: a link. (Measured first by hand on `node-web-audio-api`'s host, then here by the codec
 *    itself: prefix `c.`, payload 397 chars, the seven fields absent and the four invented.) The repo's *other* share
 *    codec agrees: `SequencerUrlShare.ts` strips `pitch`, `gate`, `ratchet`, `probability` and `trackLength` when the
 *    URL budget is exceeded and reports `degraded: true`, which its own toast admits ("pitch/gate detail omitted").
 *    ⚠️ The data row is the one file here outside the two component surfaces: the brief authorized
 *    `src/i18n/locales/tutorialCourses.ts`, which **does not exist and never has** (checked on every ref), so the
 *    criterion was stopped and the real path authorized **explicitly and for these two lines only**. It is covered here
 *    rather than left as a header note, so the same revert fails in the same place.
 * 2. `HelpCenterModal.tsx:576` — the Quick Start paragraph said the real-time synthesis "提供母带级低延迟无损音质".
 *    The live path declares **no format at all** (`AudioEngine.ts` builds `new AudioContextClass()` with no options, so
 *    its rate is the device's), so there is no encoding for the word to be true or false *of*, and the same app hands
 *    the user a **lossy** 192 kbps MP3 (`Mp3Exporter.ts`, whose encoder this file reads). The English half of the same
 *    paragraph has never made the claim. The word is gone; the mastery it also claimed stays, and stays pinned to the
 *    true-peak limiter (`MasterLimiter.ts`) and the glue bus (`masterGraph.ts`) it rests on — which is exactly how
 *    `31878f7` handled the identical sentence on the tour card.
 * 3. `HelpCenterModal.tsx:1537` — the WAV card said "输出 48kHz / 24-bit 无损立体声母带音频" / "at 48kHz / 24-bit
 *    studio quality". **The two numbers were false.** Rendering the arrangement's own WAV export (`wavFileFor` →
 *    `exportMasterWav` → `encodeAudioBufferToWav`) on `node-web-audio-api` and reading the RIFF header it wrote gives
 *    `RIFF`/`WAVE`, `audioFormat 1` (PCM), **2 channels**, **44100 Hz**, **bitsPerSample 16**. "立体声" was right; both
 *    numbers now state what the writer writes.
 * 4. `NewUserOnboardingModal.tsx:100` — the last tour card's chip said "一键无损导出" / "Lossless Export". The card's
 *    own description (`onboarding_s7_desc`, fixed by the earlier batch) lists the **seven** formats that surface really
 *    exports, MP3 among them. An unqualified losslessness claim over a set that holds a lossy encoder is the same
 *    defect those seven names were fixed for; the chip now states the count it can be held to, derived from the menu.
 *
 * ## What is kept, and why deleting it would be the mirror-image mistake
 *
 * Four "无损"/"lossless" claims **survive** this change because they are true of the formats they name, and each is
 * *pinned* here instead of being left standing on its own word: `HelpCenterModal.tsx:654` ("一键无损导出 WAV、MIDI 或
 * Ableton 工程" / "export pristine WAV, MIDI, or Ableton Live .als"), `:1527`/`:1528` ("支持无损离线 WAV 母带渲染" /
 * "Export lossless offline WAV audio") and `:1537`'s own "无损立体声母带音频". A WAV here is `audioFormat 1` — PCM,
 * uncompressed — which is the sense in which the word is true of a *file*; MIDI and `.als` are structured data. The
 * distinction this file enforces is **scope**: a claim scoped to the lossless formats is kept and held to the writer,
 * and an unqualified one over a surface that contains MP3 is not. So `:654` must keep naming no format the lossy
 * encoder serves, and the criterion fails by name if one is added.
 *
 * ## Scope, and the surfaces this change is not allowed to touch
 *
 * Named here rather than silently skipped, the same way `31878f7` named these:
 *  · **`src/i18n/locales/help.ts:74`** — `tut_maker_s3`'s own text, whose Chinese half says "生成包含全部合成参数的
 *    极简 URL". The codec run below says that is false for the same reason `:308` was. `help.ts` is explicitly out of
 *    this change's writ ("同批已改，别重复"); its English half claims only an "ultra-compact compressed link", which the
 *    same run supports.
 *  · **`src/views/KickAnatomyView.tsx:138`** — a hardcoded "RES: 48kHz / 32-FLOAT" badge. Nothing on the live path
 *    declares 48 kHz, so this is the likeliest source of the card's old number; it is outside this change's surface.
 *  · **`src/data/tutorialCourses.ts` beyond lines 199-200** — the rest of that file is the import/export-protection
 *    boundary the brief drew, and only the one copy pair was authorized.
 *
 * ## Why it can go red
 *
 * Every fact below is read from the shipped code or the shipped copy, not restated: the share test **runs the maker's
 * codec**, the format test **runs the WAV writer and parses its own header**, the rate and channel count come from the
 * renderer's defaults plus the two shipped option objects that must not override them, the word a link is called comes
 * from the maker's own control, and the chip's number comes from the export menu. Widening the codec, declaring a
 * format on the live path, changing the writer's depth, the render's rate, or the menu's size each fails here **by
 * name**. The last test carries every replaced sentence verbatim, so a revert names itself rather than merely counting.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DICTIONARY, type MessageKey } from "../i18n/locales";
import { decodeSharePayloadToGenre, encodeGenreToSharePayload } from "../features/customGenre/customGenreCodec";
import { encodeAudioBufferToWav } from "../audio/WavExporter";
import type { CustomGenre } from "../types/customGenre";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const HELP_CENTER = "src/components/help/HelpCenterModal.tsx";
const ONBOARDING = "src/components/help/NewUserOnboardingModal.tsx";
const TUTORIAL_COURSES = "src/data/tutorialCourses.ts";
const WAV_EXPORTER = "src/audio/WavExporter.ts";
const MP3_EXPORTER = "src/audio/Mp3Exporter.ts";
const MASTER_LIMITER = "src/audio/MasterLimiter.ts";
const MASTER_GRAPH = "src/audio/masterGraph.ts";
const SEQUENCER_SHARE = "src/audio/SequencerUrlShare.ts";
const AUDIO_LANE_OPTIONS = "src/features/sequencer/hooks/audioLaneExport.ts";
const ARRANGEMENT_FILES = "src/features/arrangement/arrangementFiles.ts";
const EXPORT_ACTIONS = "src/features/sequencer/hooks/useExportActions.ts";
const ARRANGEMENT_MENU = "src/components/arrangement/ArrangementFileEntriesV2.tsx";
const SCORE = "src/components/arrangement/ScoreV2.tsx";

/** The `{ en, zh }` pair of a dictionary key, with the key named in the failure when it is missing. */
function pair(key: MessageKey): { en: string; zh: string } {
  const entry = DICTIONARY[key] as unknown as { en: string; zh: string } | undefined;
  expect(entry, `${key} is referenced but not in the dictionary`).toBeTruthy();
  return entry!;
}

/**
 * Every inline `isZh ? "…" : "…"` pair in a component. The whitespace between the tokens is allowed to be *any*
 * whitespace, so the one-line form and the wrapped `{isZh\n ? "…"\n : "…"}` form are read by the same pattern.
 */
function inlinePairs(rel: string): Array<{ zh: string; en: string }> {
  return [...read(rel).matchAll(/isZh\s*\?\s*"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((match) => ({
    zh: match[1]!,
    en: match[2]!,
  }));
}

/**
 * The one inline pair **containing `anchor` in one of its two strings**, so a criterion reads a claim by what the
 * claim says rather than by a line number the next edit may move. The anchors below are substrings the old wording and
 * the new share, which is what makes a revert find the same pair and then fail on its contents. Exactly one is
 * required: zero means the sentence moved (re-derive), two means the anchor stopped identifying one sentence.
 */
function inlinePair(rel: string, anchor: string): { zh: string; en: string } {
  const found = inlinePairs(rel).filter((p) => p.zh.includes(anchor) || p.en.includes(anchor));
  expect(
    found,
    `${rel} no longer carries exactly one isZh pair containing "${anchor}": re-derive this criterion rather than moving the anchor`
  ).toHaveLength(1);
  return found[0]!;
}

/**
 * The `tipZh`/`tipEn` pair of a tutorial step. The coach's data rows spell the two languages as sibling fields rather
 * than as an `isZh` ternary, so they need their own reader — with the same anchor rule, so the *same* sentence rendered
 * on two surfaces is read by two readers that agree about which sentence it is.
 */
function tipPair(rel: string, anchor: string): { zh: string; en: string } {
  const pairs = [...read(rel).matchAll(/tipZh:\s*"((?:[^"\\]|\\.)*)",\s*tipEn:\s*"((?:[^"\\]|\\.)*)"/g)].map(
    (match) => ({ zh: match[1]!, en: match[2]! })
  );
  const found = pairs.filter((p) => p.zh.includes(anchor) || p.en.includes(anchor));
  expect(
    found,
    `${rel} no longer carries exactly one tipZh/tipEn pair containing "${anchor}": re-derive this criterion`
  ).toHaveLength(1);
  return found[0]!;
}

/**
 * Both renderings of the Maker lesson's third step: the help centre's inline tip and the coach's data row. The same
 * sentence lives twice, so a fix that reached one of them and not the other used to be invisible; here it is one loop.
 */
function shareSurfaces(): Array<{ where: string; pair: { zh: string; en: string } }> {
  return [
    { where: `${HELP_CENTER}:308`, pair: inlinePair(HELP_CENTER, "链接分享") },
    { where: `${TUTORIAL_COURSES}:199-200`, pair: tipPair(TUTORIAL_COURSES, "链接分享") },
  ];
}

/**
 * One forked genre whose lane carries every field a "complete parameters" claim would have to move, handed to the
 * maker's real encoder and decoder. `unknown` rather than a full `CustomGenre` literal because the encoder reads a
 * named handful of fields; the cast is confined to this factory. (The same fixture `helpStudioLosslessClaims.test.ts`
 * uses — the two files judge different surfaces of the same codec.)
 */
function genreWithRichLane(): CustomGenre {
  const steps = Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? 1 : 0));
  return {
    isCustom: true,
    id: "criterion-genre",
    name: "Criterion Genre",
    category: "Electronic",
    default_bpm: 124,
    time_signature: "4/4",
    origin_year: "2026",
    origin_place: { en: "Place", zh: "地点" },
    cultural_context: { en: "ctx", zh: "背景" },
    representative_artists: ["Someone"],
    authorName: "Author",
    forkedFromId: "deep-house",
    forkedFromName: "Deep House",
    radar_metrics: { groove: 7, brightness: 3, harmonicComplexity: 9, rhythmDensity: 5, bassEnergy: 8, melodicFocus: 4 },
    sequencer_pattern: {
      genre_id: "criterion-genre",
      bpm: 124,
      scale: "C Minor",
      tracks: [
        {
          track_id: "bass",
          name: "Acid Bass 303",
          instrument: "bass",
          steps,
          velocity: Array.from({ length: 16 }, (_, i) => 40 + i),
          pitch: Array.from({ length: 16 }, (_, i) => 36 + i),
          gate: Array.from({ length: 16 }, () => 0.75),
          ratchet: Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 3 : 1)),
          probability: Array.from({ length: 16 }, (_, i) => 100 - i),
          trackLength: 12,
          volume: 0.66,
          pan: -0.4,
          sendA: 0.3,
          sendB: 0.15,
        },
      ],
    },
  } as unknown as CustomGenre;
}

/** The English and Chinese nouns the maker's own copy button uses for the thing it copies. */
function shippedLinkWords(): { en: string; zh: string } {
  const label = pair("maker_share_url_copy");
  const en = (label.en.toLowerCase().match(/[a-z]+/g) ?? []).find((word) => word === "link");
  expect(en, `"${label.en}" no longer names a link: this criterion's word moved with the control`).toBeTruthy();
  // Chinese is not whitespace-delimited, so the noun is the label's trailing two characters — the same mechanical
  // read, so renaming the control moves the requirement instead of silently passing.
  const zh = label.zh.slice(-2);
  expect(zh, `"${label.zh}" is too short to carry a noun: this criterion's word moved with the control`).toHaveLength(2);
  return { en: en!, zh };
}

/** The rate and channel count the master render uses when its caller says nothing — parsed, not restated. */
function derivedRenderFormat(): { sampleRate: number; channels: number } {
  const source = read(WAV_EXPORTER);
  const rate = source.match(/const sampleRate = options\.sampleRate \|\| (\d+);/);
  const channels = source.match(/const channelCount = options\.channels === 1 \? 1 : (\d+);/);
  expect(rate, "the renderer's default sample rate moved: re-derive this criterion").not.toBeNull();
  expect(channels, "the renderer's default channel count moved: re-derive this criterion").not.toBeNull();
  return { sampleRate: Number(rate![1]), channels: Number(channels![1]) };
}

/** The WAV writer's own declared depth — the number its header writes and the card has to state. */
function derivedWriterBitDepth(): number {
  const match = read(WAV_EXPORTER).match(/const bitDepth = (\d+);/);
  expect(match, "encodeAudioBufferToWav's bitDepth moved: re-derive this criterion").not.toBeNull();
  return Number(match![1]);
}

/**
 * The RIFF header the shipped encoder actually writes, produced by **running it** on a buffer shaped like the
 * renderer's own output. `encodeAudioBufferToWav` reads only `numberOfChannels`, `sampleRate` and `getChannelData`,
 * which is why a plain object is enough and why this runs in jsdom without a Web Audio context.
 */
function measuredWavHeader(): {
  riff: string;
  wave: string;
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
} {
  const samples = new Float32Array(64).fill(0.25);
  const fake = {
    numberOfChannels: derivedRenderFormat().channels,
    sampleRate: derivedRenderFormat().sampleRate,
    length: samples.length,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
  const view = new DataView(encodeAudioBufferToWav(fake));
  const tag = (offset: number) => String.fromCharCode(...new Uint8Array(view.buffer, offset, 4));
  return {
    riff: tag(0),
    wave: tag(8),
    audioFormat: view.getUint16(20, true),
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
  };
}

describe("the help surfaces' remaining lossless claims match the code that makes them", () => {
  it("runs the maker's share codec and finds the parameters it drops and the ones it invents", async () => {
    const encoded = await encodeGenreToSharePayload(genreWithRichLane());
    // Both branches are this one payload: `c.` is deflate-raw, `u.` is the stream-less fallback. Which one the
    // environment reaches does not change what the payload carries, so the criterion does not depend on it.
    expect(encoded.slice(0, 2), "the maker's share prefix moved: re-derive this criterion").toMatch(/^[cu]\.$/);

    const decoded = await decodeSharePayloadToGenre(encoded);
    expect(decoded, "the maker's own share link no longer decodes: re-derive this criterion").not.toBeNull();
    const lane = decoded!.sequencer_pattern.tracks[0] as unknown as Record<string, unknown>;
    const whole = decoded as unknown as Record<string, unknown>;

    // The derived fact the copy now has to live with. If the codec is widened to carry them, this fails and the copy
    // may say more — which is the point of measuring it rather than transcribing it.
    for (const field of ["velocity", "ratchet", "probability", "trackLength", "pan", "sendA", "sendB"]) {
      expect(lane[field], `the maker's share link now carries ${field}: the copy may say more`).toBeUndefined();
    }
    for (const invented of ["aliases", "common_chords", "structure", "sources"]) {
      expect(whole[invented], `the decoder no longer invents ${invented}: the copy may say more`).toBeDefined();
    }

    // The repo's **other** share codec strips the same class of detail when a payload outgrows the URL budget, and
    // says so in its own toast. So no share copy here can claim losslessness whichever codec a sentence means — and
    // if the degraded branch is ever removed, this fails and the ban has to be re-read rather than assumed.
    expect(read(SEQUENCER_SHARE), "the sequencer's share no longer has a degraded mode: re-read this ban").toMatch(
      /degraded: true/
    );
    expect(pair("export_share_copied_degraded").en, "the degraded share toast no longer admits what it dropped").toMatch(
      /pitch\/gate/i
    );
  });

  it("no longer claims the share link carries complete parameters, in either language, on either surface", () => {
    for (const { where, pair: share } of shareSurfaces()) {
      expect(share.zh, `${where} still claims the link carries complete parameters`).not.toContain("完整参数");
      expect(share.zh, `${where} still claims the link carries every parameter`).not.toContain("全部参数");
      expect(share.zh, `${where} still calls a payload that drops seven fields 无损`).not.toContain("无损");
      expect(share.en.toLowerCase(), `${where} still calls a payload that drops seven fields lossless`).not.toContain(
        "lossless"
      );
    }
  });

  it("calls the share a link, in the words the maker's own control uses", () => {
    const words = shippedLinkWords();
    for (const { where, pair: share } of shareSurfaces()) {
      expect(share.en.toLowerCase(), `${where} no longer calls it a ${words.en}`).toContain(words.en);
      expect(share.zh, `${where} no longer calls it a ${words.zh}`).toContain(words.zh);
    }
  });

  it("drops the losslessness claim the live path cannot support, and keeps the mastery it can", () => {
    // What "母带级" rests on, derived: a true-peak ceiling and a glue bus compressor (the same pin `31878f7` used
    // for the identical sentence on the tour card).
    const limiter = read(MASTER_LIMITER);
    expect(limiter, "the true-peak ceiling left the master limiter, which the paragraph's claim rests on").toMatch(
      /export const MASTER_LIMITER_CEILING_DB = -?\d/
    );
    expect(limiter, "the master limiter no longer describes itself as true-peak").toMatch(/[Tt]rue-peak/);
    expect(read(MASTER_GRAPH), "the glue bus compressor left the master graph").toMatch(/createBusCompressor/);

    const intro = inlinePair(HELP_CENTER, "Groove 是一款基于 W3C");
    expect(intro.zh, "the Quick Start paragraph claims losslessness for a path that declares no format").not.toContain(
      "无损"
    );
    expect(intro.en.toLowerCase(), "the Quick Start paragraph claims lossless audio").not.toContain("lossless");
    expect(intro.zh, "the paragraph dropped the mastery it also claimed, instead of the word over it").toContain("母带级");
    expect(intro.zh, "the paragraph dropped the latency it describes").toContain("延迟");
  });

  it("derives the master WAV's format from its own writer and the render defaults, not from the copy", () => {
    const format = derivedRenderFormat();
    const header = measuredWavHeader();
    // The measured end-to-end render (see the header) is RIFF/WAVE, PCM, 2 ch, 44100 Hz, 16 bits. If this fails the
    // encoder changed: update this expectation *and* the card, in that order.
    expect(header, "the master WAV writer no longer writes what the card describes").toEqual({
      riff: "RIFF",
      wave: "WAVE",
      audioFormat: 1,
      channels: format.channels,
      sampleRate: format.sampleRate,
      bitsPerSample: derivedWriterBitDepth(),
    });

    // The two shipped master exports hand the renderer no rate and no channel count, so the defaults above *are* the
    // file a user gets. A new override is a failing test rather than a silently stale sentence.
    const builder = read(ARRANGEMENT_FILES).match(/function renderOptionsFor[\s\S]*?\n}/);
    expect(builder, "renderOptionsFor moved: re-derive this criterion").not.toBeNull();
    expect(builder![0], "the arrangement's WAV export now overrides the render's rate or channels").not.toMatch(
      /sampleRate|channels/
    );
    const call = read(EXPORT_ACTIONS).match(/exportMasterWav\(\s*pattern,\s*currentGenre\.id,\s*\{[\s\S]*?\n\s*\}\);/);
    expect(call, "the workbench's WAV export call moved: re-derive this criterion").not.toBeNull();
    expect(call![0], "the workbench's WAV export now overrides the render's rate or channels").not.toMatch(
      /sampleRate|channels/
    );
    // The one spread in both option objects cannot smuggle one in either.
    expect(read(AUDIO_LANE_OPTIONS), "AudioLaneRenderOptions now admits a rate or a channel count").toMatch(
      /AudioLaneRenderOptions = Pick<RenderWavOptions, "audioLaneCatalogue" \| "onAudioLanes">/
    );
  });

  it("states the measured rate and depth in the WAV card, in both languages", () => {
    const { sampleRate } = derivedRenderFormat();
    const bits = derivedWriterBitDepth();
    const kHz = `${sampleRate / 1000}kHz`;
    const card = inlinePair(HELP_CENTER, "OfflineAudioContext 高速离线精确渲染");

    expect(card.zh, `the WAV card's zh no longer states ${kHz}`).toContain(kHz);
    expect(card.en, `the WAV card's en no longer states ${kHz}`).toContain(kHz);
    expect(card.zh, `the WAV card's zh no longer states ${bits}-bit`).toContain(`${bits}-bit`);
    expect(card.en, `the WAV card's en no longer states ${bits}-bit`).toContain(`${bits}-bit`);
    expect(card.zh, "the WAV card still states a rate and a depth no writer produces").not.toMatch(/48kHz|24-bit/);
    expect(card.en, "the WAV card still states a rate and a depth no writer produces").not.toMatch(/48kHz|24-bit/);

    // The one word in the card that was already right, held to the render's own channel count.
    expect(measuredWavHeader().channels, "the render is no longer stereo: the card's 立体声 is now wrong").toBe(2);
    expect(card.zh, "the WAV card's channel claim no longer matches the render").toContain("立体声");
  });

  it("keeps the lossless claims that are true of the formats they name, and no others", () => {
    // What makes the kept word true: the writer emits format 1, uncompressed PCM — not a perceptual codec. If this
    // ever changes, every kept claim below has to be re-judged rather than quietly left standing.
    expect(measuredWavHeader().audioFormat, "the WAV writer stopped writing uncompressed PCM").toBe(1);

    const mixStep = inlinePair(HELP_CENTER, "在独立调音台塑形声道平衡");
    const exportIntro = inlinePair(HELP_CENTER, "Ableton Live 原生工程导出");
    expect(mixStep.zh, "the Mix & Export step dropped a claim that is true of the formats it names").toContain("无损");
    expect(exportIntro.zh, "the export section dropped a claim that is true of WAV").toContain("无损");
    expect(exportIntro.en.toLowerCase(), "the export section dropped a claim that is true of WAV").toContain("lossless");

    // The scope that keeps those claims true: none of them names the format the lossy encoder serves.
    const mp3 = pair("toolbar_export_mp3");
    const mp3Word = mp3.en.match(/MP3/i)?.[0];
    expect(mp3Word, `the menu's MP3 label ("${mp3.en}") no longer names MP3: re-derive this criterion`).toBeTruthy();
    for (const [name, text] of [
      ["the Mix & Export step (zh)", mixStep.zh],
      ["the export section (zh)", exportIntro.zh],
      ["the export section (en)", exportIntro.en],
    ] as const) {
      expect(text, `${name} now claims losslessness over a surface that holds ${mp3Word}`).not.toMatch(
        new RegExp(mp3Word!, "i")
      );
    }
    // And the lossy half is real, not hypothetical: a bitrate, in the encoder the menu's MP3 item reaches.
    expect(read(MP3_EXPORTER), "the MP3 export left this repo; re-read whether the scope ban still applies").toMatch(
      /bitrateKbps/
    );
  });

  it("states, on the last tour card, the measured export count rather than a losslessness claim", () => {
    // The count comes from the surface itself: the arrangement menu's items and the score tab's one export, the same
    // seven `helpExportSurfaceCopy.test.ts` holds `onboarding_s7_desc` to.
    /**
     * ⭐ **Not every `arrangement-export-*` id is a format.** The progress readout and the cancel button were added with the
     * export state and share the prefix, so counting them as formats would have the copy claim two more than the menu offers --
     * which is how this criterion first went red. It lists what it excludes rather than loosening the pattern, so a new *format*
     * still changes the count and still forces the copy to follow.
     */
    const containers = [
      "arrangement-export-menu",
      "arrangement-export-items",
      "arrangement-export-progress",
      "arrangement-export-cancel",
    ];
    const menuIds = [...read(ARRANGEMENT_MENU).matchAll(/data-testid="(arrangement-export-[a-z0-9]+)"/g)]
      .map((match) => match[1]!)
      .filter((id) => !containers.includes(id));
    const scoreIds = [...read(SCORE).matchAll(/data-testid="(score-export-[a-z0-9]+)"/g)].map((match) => match[1]!);
    const count = new Set([...menuIds, ...scoreIds]).size;
    expect(count, "the export surface could not be read: re-derive this criterion").toBeGreaterThan(1);

    const chip = inlinePair(ONBOARDING, "随时按 ?");
    expect(chip.zh, "the last tour card still claims a lossless export over a surface that holds MP3").not.toContain(
      "无损"
    );
    expect(chip.en.toLowerCase(), "the last tour card still claims a lossless export").not.toContain("lossless");
    expect(chip.zh, `the last tour card no longer states the measured export count (${count})`).toContain(String(count));
    expect(chip.en, `the last tour card no longer states the measured export count (${count})`).toContain(String(count));
  });

  it("carries the old wording verbatim, so a revert names itself", () => {
    // The five sentences as they shipped, quoted so a revert is a named failure rather than a count. The false bits:
    // "包含完整参数"/"lossless" over a codec that drops seven fields (on both surfaces that render it), "无损音质" over
    // a live path with no codec, "48kHz / 24-bit" over a writer whose header says 44.1 kHz / 16, and an unqualified
    // "一键无损导出" over a menu that holds MP3.
    const oldShare = { zh: "生成包含完整参数的无损压缩 URL 链接分享", en: "Share lossless compressed URLs or export an Ableton project" };
    const oldLive = "提供母带级低延迟无损音质";
    const oldCard = "48kHz / 24-bit";
    const oldChip = { zh: "一键无损导出", en: "Lossless Export" };

    for (const { where, pair: share } of shareSurfaces()) {
      expect(share.zh, `${where} reverted to "${oldShare.zh}"`).not.toContain(oldShare.zh);
      expect(share.en, `${where} reverted to "${oldShare.en}"`).not.toContain(oldShare.en);
    }

    const intro = inlinePair(HELP_CENTER, "Groove 是一款基于 W3C");
    expect(intro.zh, `the Quick Start paragraph reverted to "${oldLive}"`).not.toContain(oldLive);

    const card = inlinePair(HELP_CENTER, "OfflineAudioContext 高速离线精确渲染");
    expect(card.zh, `the WAV card reverted to "${oldCard}"`).not.toContain(oldCard);
    expect(card.en, `the WAV card reverted to "${oldCard}"`).not.toContain(oldCard);

    const chip = inlinePair(ONBOARDING, "随时按 ?");
    expect(chip.zh, `the last tour card reverted to "${oldChip.zh}"`).not.toContain(oldChip.zh);
    expect(chip.en, `the last tour card reverted to "${oldChip.en}"`).not.toContain(oldChip.en);
  });

  it("reads the maker's shipped label and the menu's MP3 label from the locale, not from the copy", () => {
    // The two places this file reads a source other than the implementation: the control's own vocabulary and the
    // lossy item's name. Named here so the derivations above are auditable.
    expect(read("src/i18n/locales/maker.ts"), "the maker's share control moved out of maker.ts").toContain(
      "maker_share_url_copy"
    );
    expect(read("src/i18n/locales/studio.ts"), "the MP3 menu label moved out of studio.ts").toContain("toolbar_export_mp3");
  });
});
