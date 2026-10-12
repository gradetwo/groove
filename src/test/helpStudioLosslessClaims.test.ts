/**
 * Three copy lines claimed "lossless" or "24-bit" audio. Each claim is measured against the code that would have
 * to support it, and the line is held to what that code actually does.
 *
 * ## The report
 *
 * 1. `help.ts`'s `tut_maker_desc` — Lesson 5, the Genre Maker — said "share lossless URLs" / "通过无损轻量 URL 自由
 *    分享". The maker's share button (`CustomGenreMakerView.tsx`, `encodeGenreToSharePayload`) does not carry the
 *    pattern whole: measured below, a lane's per-step `velocity`, `ratchet`, `probability`, `trackLength`, and the
 *    mixer's `pan`/`sendA` do not survive the round trip, and the decoder *invents* `aliases`, `common_chords`,
 *    `structure` and `sources`. Deflate is a lossless *compression*, so the sentence's "compressed" half was never
 *    the problem; "lossless" as a claim about the parameters is. Both encoder branches were run: on Node 22 the
 *    deflate branch (`"c."`), and under this suite's jsdom the stream fallback (`"u."`) — the dropped fields are the
 *    same in both, so the criterion does not depend on which one the environment reaches.
 * 2. `help.ts`'s `onboarding_s1_tip` — the first tour card, about live synthesis — said "输出无损母带级音频"
 *    ("outputs lossless master-grade audio"). The live path is an `AudioContext` whose rate is the device's
 *    (`AudioEngine.ts` passes no options) and which declares no format at all, while the app's own file surface
 *    holds a **lossy** MP3 encoder (`Mp3Exporter.ts`) beside a **16-bit PCM** master WAV
 *    (`WavExporter.ts`'s `const bitDepth = 16`). A blanket losslessness claim about "the audio this app outputs" is
 *    therefore false for the MP3 export and unsupported for the live one. The English line makes no such claim —
 *    "studio master quality" is a quality adjective — so only the Chinese word was removed, and the English claim
 *    is *pinned* below to the mastering bus it rests on rather than left vague.
 * 3. `studio.ts`'s `kick_dossier_ch4_tip` said "24-bit PCM WAV" / "24-bit 无损采样". Measured end to end by
 *    rendering the workbench's own export through `AnatomyKickEngine.exportWav` on `node-web-audio-api` and reading
 *    the RIFF header it wrote: `RIFF/WAVE`, `audioFormat 1` (PCM), **1 channel**, **44100 Hz**, **bitsPerSample 16**.
 *    The derived source below (the same header fields, parsed) is what the criterion holds the copy to.
 *
 * ## What is derived rather than transcribed
 *
 * The bit depth, channel count and sample rate are *read out of the encoder* before they are compared with the copy,
 * so changing the encoder to 24-bit fails here and names the number the copy would have to move to. The share-link
 * test **runs the shipped codec** rather than asserting which fields it mentions. The word the share sentence has to
 * use is taken from the maker's own shipped control (`maker_share_url_copy`, "Copy Share Link" / "复制分享链接")
 * rather than typed twice. And the claim that is *kept* is pinned to the mechanism that supports it — the true-peak
 * ceiling and the glue bus compressor — so removing the mastering bus reddens the sentence that advertises it.
 *
 * ## Scope, and what is deliberately not counted
 *
 * This file holds the three lines this change was scoped to, in `help.ts` and `studio.ts`. The same "无损" wording
 * also lives in surfaces a later change owns, and they are **named here rather than silently skipped**:
 * `src/data/tutorialCourses.ts` (`tut_maker_s3`, "无损压缩 URL"), `src/components/help/HelpCenterModal.tsx` (lines
 * 308, 576, 654, 1527, 1528, 1537 — including a "48kHz / 24-bit 无损" master claim that this same measurement
 * contradicts), and `src/components/help/NewUserOnboardingModal.tsx:100` ("一键无损导出"). They are outside this
 * file's scope, not outside its finding.
 *
 * ## Why it can go red
 *
 * Every assertion below reads the shipped copy or the shipped code. Reverting any one of the three sentences fails,
 * and the last test carries the old phrasing verbatim so the revert is named rather than merely counted.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DICTIONARY, type MessageKey } from "../i18n/locales";
import { decodeSharePayloadToGenre, encodeGenreToSharePayload } from "../features/customGenre/customGenreCodec";
import type { CustomGenre } from "../types/customGenre";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** The kick workbench's own exporter, and the master exporter; the two places this repo writes a WAV bit depth. */
const KICK_ENGINE = "src/audio/AnatomyKickEngine.ts";
const WAV_EXPORTER = "src/audio/WavExporter.ts";
const MP3_EXPORTER = "src/audio/Mp3Exporter.ts";
const MASTER_LIMITER = "src/audio/MasterLimiter.ts";
const MASTER_GRAPH = "src/audio/masterGraph.ts";
const MAKER_LOCALE = "src/i18n/locales/maker.ts";

/** The `{ en, zh }` pair of a dictionary key, with the key named in the failure when it is missing. */
function pair(key: MessageKey): { en: string; zh: string } {
  const entry = DICTIONARY[key] as unknown as { en: string; zh: string } | undefined;
  expect(entry, `${key} is referenced but not in the dictionary`).toBeTruthy();
  return entry!;
}

/**
 * The format `AnatomyKickEngine.audioBufferToWavBlob` writes, derived from the writer itself.
 *
 * The three numbers are the RIFF header's own fields — `bits per sample` (`setUint16(…); // bits per sample`), the
 * channel count of the `OfflineAudioContext` the offline render builds, and the sample rate that context is given.
 * Parsed rather than restated so a 24-bit encoder is a failing test, not a stale sentence.
 */
function derivedKickWavFormat(): { bitsPerSample: number; channels: number; sampleRate: number } {
  const source = read(KICK_ENGINE);
  const bits = source.match(/setUint16\((\d+)\);\s*\/\/\s*bits per sample/);
  const context = source.match(/new OfflineAudioContext\((\d+),\s*length,\s*sampleRate\)/);
  const rate = source.match(/const sampleRate = (\d+);/);
  expect(bits, "the kick WAV writer's 'bits per sample' field moved: re-derive this criterion").not.toBeNull();
  expect(context, "the kick WAV export's OfflineAudioContext moved: re-derive this criterion").not.toBeNull();
  expect(rate, "the kick WAV export's sample rate moved: re-derive this criterion").not.toBeNull();
  return {
    bitsPerSample: Number(bits![1]),
    channels: Number(context![1]),
    sampleRate: Number(rate![1]),
  };
}

/** The master WAV's declared depth, derived from the encoder that the menu's WAV item and the stems both use. */
function derivedMasterWavBitDepth(): number {
  const match = read(WAV_EXPORTER).match(/const bitDepth = (\d+);/);
  expect(match, "encodeAudioBufferToWav's bitDepth moved: re-derive this criterion").not.toBeNull();
  return Number(match![1]);
}

/**
 * One forked genre whose lane carries every field a "complete parameters" claim would have to move, run through the
 * maker's real encoder and decoder. `unknown` rather than a full `CustomGenre` literal because the encoder reads a
 * named handful of fields; the cast is confined to this factory.
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
  // Chinese is not whitespace-delimited, so the noun is taken as the label's trailing two characters — the same
  // mechanical read, so renaming the control moves the requirement instead of silently passing.
  const zh = label.zh.slice(-2);
  expect(zh, `"${label.zh}" is too short to carry a noun: this criterion's word moved with the control`).toHaveLength(2);
  return { en: en!, zh };
}

describe("the help and studio copy's audio-format claims match the code that makes them", () => {
  it("derives the kick WAV format from its own header writer", () => {
    const format = derivedKickWavFormat();
    // The measured end-to-end render (see the file header) is RIFF/WAVE, PCM, 1 ch, 44100 Hz, 16 bits. If this
    // fails, the encoder changed: update this expectation *and* the tip, in that order.
    expect(format, "the kick workbench's WAV export is no longer what the tip describes").toEqual({
      bitsPerSample: 16,
      channels: 1,
      sampleRate: 44100,
    });
    // The master WAV is the same depth, so no surface of this app writes 24-bit PCM.
    expect(derivedMasterWavBitDepth(), "the master WAV's depth disagrees with the kick's").toBe(format.bitsPerSample);
  });

  it("states the measured bit depth in the workbench tip, in both languages", () => {
    const { bitsPerSample } = derivedKickWavFormat();
    const tip = pair("kick_dossier_ch4_tip");
    expect(tip.en, "the workbench tip no longer states the depth its exporter writes").toContain(`${bitsPerSample}-bit`);
    expect(tip.zh, "the workbench tip no longer states the depth its exporter writes").toContain(`${bitsPerSample}-bit`);
  });

  it("runs the maker's share codec and finds the pattern it does not carry", async () => {
    const encoded = await encodeGenreToSharePayload(genreWithRichLane());
    const decoded = await decodeSharePayloadToGenre(encoded);
    expect(decoded, "the maker's own share link no longer decodes: re-derive this criterion").not.toBeNull();
    const lane = decoded!.sequencer_pattern.tracks[0];

    // The derived fact the copy has to live with: these are sent and do not arrive. If the codec is widened to
    // carry them, this fails and the sentence may be strengthened again — which is the point of measuring it.
    expect(lane.velocity, "the maker's share link now carries per-step velocity: the copy may say more").toBeUndefined();
    expect(lane.ratchet, "the maker's share link now carries per-step ratchet: the copy may say more").toBeUndefined();
    expect(lane.probability, "the maker's share link now carries per-step probability: the copy may say more").toBeUndefined();
    expect(lane.trackLength, "the maker's share link now carries trackLength: the copy may say more").toBeUndefined();
    expect(lane.pan, "the maker's share link now carries mixer pan: the copy may say more").toBeUndefined();
    expect(lane.sendA, "the maker's share link now carries the reverb send: the copy may say more").toBeUndefined();
    expect(lane.sendB, "the maker's share link now carries the delay send: the copy may say more").toBeUndefined();
  });

  it("describes the maker's share as a link, in the words the maker's own control uses", () => {
    const words = shippedLinkWords();
    const desc = pair("tut_maker_desc");
    expect(desc.en.toLowerCase(), `the Lesson 5 line no longer calls it a ${words.en}`).toContain(words.en);
    expect(desc.zh, `the Lesson 5 line no longer calls it a ${words.zh}`).toContain(words.zh);
  });

  it("pins the kept mastery claim to the mastering bus that supports it", () => {
    // What "studio master quality" / "母带级" rests on, derived: a true-peak ceiling and a glue bus compressor.
    const limiter = read(MASTER_LIMITER);
    expect(limiter, "the true-peak ceiling left the master limiter, which the tour card's claim rests on").toMatch(
      /export const MASTER_LIMITER_CEILING_DB = -?\d/
    );
    expect(limiter, "the master limiter no longer describes itself as true-peak").toMatch(/[Tt]rue-peak/);
    expect(read(MASTER_GRAPH), "the glue bus compressor left the master graph").toMatch(/createBusCompressor/);

    const tip = pair("onboarding_s1_tip");
    expect(tip.en, "the tour card no longer names the master it claims").toContain("master");
    expect(tip.zh, "the tour card no longer names the master it claims").toContain("母带");
  });

  it("has dropped every losslessness claim from the three lines", () => {
    // The lossy half of the export surface, derived rather than asserted from the copy: an MP3 encoder with a
    // bitrate, beside the 16-bit PCM WAV above. A blanket "lossless audio" claim cannot stand next to that.
    const mp3 = read(MP3_EXPORTER);
    expect(mp3, "the MP3 export left this repo; re-read whether the losslessness ban still applies").toMatch(
      /bitrateKbps/
    );

    const maker = pair("tut_maker_desc");
    expect(maker.en.toLowerCase(), "Lesson 5 still claims a lossless link").not.toContain("lossless");
    expect(maker.zh, "Lesson 5 still claims a lossless link").not.toContain("无损");

    const onboarding = pair("onboarding_s1_tip");
    expect(onboarding.en.toLowerCase(), "the tour card claims lossless audio").not.toContain("lossless");
    expect(onboarding.zh, "the tour card claims lossless audio").not.toContain("无损");
  });

  it("carries the old wording verbatim, so a revert names itself", () => {
    // The three sentences as they shipped, quoted so a revert is a named failure rather than a count. The bits
    // that were false: "lossless URLs" for a link that drops fields, "无损母带级音频" over a lossy MP3 export, and
    // "24-bit" for an encoder whose header says 16.
    const oldMaker = { en: "share lossless URLs", zh: "通过无损轻量 URL 自由分享" };
    const oldOnboardingZh = "输出无损母带级音频";
    const oldKick = { en: "24-bit PCM WAV", zh: "24-bit 无损采样" };

    const maker = pair("tut_maker_desc");
    expect(maker.en, `Lesson 5 reverted to "${oldMaker.en}"`).not.toContain(oldMaker.en);
    expect(maker.zh, `Lesson 5 reverted to "${oldMaker.zh}"`).not.toContain(oldMaker.zh);

    const onboarding = pair("onboarding_s1_tip");
    expect(onboarding.zh, `the tour card reverted to "${oldOnboardingZh}"`).not.toContain(oldOnboardingZh);

    const kick = pair("kick_dossier_ch4_tip");
    expect(kick.en, `the workbench tip reverted to "${oldKick.en}"`).not.toContain(oldKick.en);
    expect(kick.zh, `the workbench tip reverted to "${oldKick.zh}"`).not.toContain(oldKick.zh);
  });

  it("reads the maker's shipped label from the locale rather than the copy", () => {
    // The one place this file reads a source other than the implementation: the control's own vocabulary. Named
    // here so the derivation above is auditable — the criterion's word comes from `maker.ts`, not from the prose.
    expect(read(MAKER_LOCALE), "the maker's share control moved out of maker.ts").toContain("maker_share_url_copy");
  });
});
