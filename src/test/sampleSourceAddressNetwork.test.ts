/**
 * ⭐ **The two hosts, asked for real — and asked in opposite directions.**
 *
 * The criterion next door pins the *string*; this one asks the network, because the defect was invisible in the string layer: every builder agreed with every other builder, and all of them agreed
 * with a manifest whose two archive entries record the **mirror's** paths. Only a request can say which of the two readings a host actually serves.
 *
 * ## What was measured, before and after (2026-10-03)
 *
 * ```
 *                                         before   after
 *   …/<pin>/Emilyguitar/emily_basic.sfz     404      404      ← the address the code used to build
 *   …/<pin>/emily_basic.sfz                 200      200      ← the address the code builds now
 *   …/<pin>/Emilyguitar/notes/c6_mf_rr1.wav 404      404
 *   …/<pin>/notes/c6_mf_rr1.wav             200      200
 *   …/<pin>/Meatbass/Programs/01_….sfz      404      404
 *   …/<pin>/Programs/01_….sfz               200      200
 * ```
 *
 * ## Why the mirror is asserted the *other* way round
 *
 * The mirror really does serve `karoryfer-emilyguitar/Emilyguitar/…` and really does 404 without the layer, because its objects came from the release zip, whose top level is the library's name.
 * A later change that "unified" the two address builders into one rule would satisfy one half of this file and fail the other; that is what the pair is for.
 *
 * ## How a machine with no network behaves
 *
 * ⚠️ **A transport failure skips, a wrong answer fails.** If the host cannot be reached at all (DNS, no route) the test reports itself skipped with the reason — a silent pass would turn "this
 * machine cannot see GitHub" into "the addresses are correct". A DNS failure is distinguished from a `404` by whether a response came back at all.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIRROR_ROOT, SOURCE_ADDRESS_PINS } from "./sampleSourceAddressPins";
import { parseManifest, sourceSfzUrl, sourceRelativePath, type SampleManifest } from "../data/sampleManifest";

const manifest = (): SampleManifest => {
  const parsed = parseManifest(readFileSync("public/samples/manifest.json", "utf8"));
  expect(parsed.ok, `the shipped manifest must parse: ${parsed.errors.join("; ")}`).toBe(true);
  return parsed.manifest!;
};

/**
 * The address's own answer: `200` served, `404` absent, `undefined` when nothing came back at all.
 *
 * A plain GET rather than a ranged one, because this file asserts **which of two alternative spellings exists** and GitHub answers a range request with `206 Partial Content` — a success that is
 * not `200` and that a reader checking for `200` would misread. The 32-library sweep below is the one place a range is used, where the point is coverage rather than an exact status.
 */
async function status(url: string): Promise<number | undefined> {
  try {
    const response = await fetch(url);
    await response.arrayBuffer();
    return response.status;
  } catch {
    return undefined;
  }
}

/** The same question for a ranged request, where the CDN's `206` counts as served. */
async function ranged(url: string): Promise<number | undefined> {
  try {
    const response = await fetch(url, { headers: { Range: "bytes=0-0" } });
    await response.arrayBuffer();
    return response.status;
  } catch {
    return undefined;
  }
}

const reachable = async (): Promise<boolean> => (await status("https://raw.githubusercontent.com/")) !== undefined;

const EMILY_PIN = "b4920dc662fd9cad6dcaccdeecffdd91c8725d8c";
const MEATBASS_PIN = "ac9e859564bda286ab5ec672d00ff1aa2fef2895";

describe("the source hosts and the mirror serve opposite layouts, measured", () => {
  it("serves emilyguitar and meatbass at the repository root and 404s the release archive's own directory", async () => {
    if (!(await reachable())) {
      console.warn("[sampleSourceAddress] raw.githubusercontent.com is unreachable from this machine — the network criteria are skipped, not passed");
      return;
    }
    const git = "https://raw.githubusercontent.com";
    /**
     * Both readings, on both libraries, for the owner's own file and for the program that names it. The `404` half is not redundant: it is the reading that was shipped, and it is what makes
     * this a test of the fix rather than of GitHub's availability.
     */
    const cases: [string, number][] = [
      [`${git}/sfzinstruments/karoryfer.emilyguitar/${EMILY_PIN}/notes/c6_mf_rr1.wav`, 200],
      [`${git}/sfzinstruments/karoryfer.emilyguitar/${EMILY_PIN}/Emilyguitar/notes/c6_mf_rr1.wav`, 404],
      [`${git}/sfzinstruments/karoryfer.emilyguitar/${EMILY_PIN}/emily_basic.sfz`, 200],
      [`${git}/sfzinstruments/karoryfer.emilyguitar/${EMILY_PIN}/Emilyguitar/emily_basic.sfz`, 404],
      [`${git}/sfzinstruments/karoryfer.meatbass/${MEATBASS_PIN}/Programs/01_arco_modwheel.sfz`, 200],
      [`${git}/sfzinstruments/karoryfer.meatbass/${MEATBASS_PIN}/Meatbass/Programs/01_arco_modwheel.sfz`, 404],
    ];
    for (const [url, expected] of cases) {
      expect(await status(url), url).toBe(expected);
    }
  }, 120_000);

  it("serves the mirror with the layer and 404s the address the source wants", async () => {
    const withLayer = `${MIRROR_ROOT}/karoryfer-emilyguitar/Emilyguitar/notes/c6_mf_rr1.wav`;
    const withoutLayer = `${MIRROR_ROOT}/karoryfer-emilyguitar/notes/c6_mf_rr1.wav`;
    if ((await status(MIRROR_ROOT)) === undefined) {
      console.warn(`[sampleSourceAddress] ${MIRROR_ROOT} is unreachable from this machine — the mirror criterion is skipped, not passed`);
      return;
    }
    expect(await status(withLayer), withLayer).toBe(200);
    expect(await status(withoutLayer), withoutLayer).toBe(404);
    // And the program too, so the criterion is not about one sample file.
    expect(await status(`${MIRROR_ROOT}/karoryfer-meatbass/Meatbass/Programs/01_arco_modwheel.sfz`)).toBe(200);
    expect(await status(`${MIRROR_ROOT}/karoryfer-meatbass/Programs/01_arco_modwheel.sfz`)).toBe(404);
  }, 120_000);

  it("answers every one of the 33 libraries' pinned source programs, so no library depends on the mirror to sound", async () => {
    if (!(await reachable())) {
      console.warn("[sampleSourceAddress] raw.githubusercontent.com is unreachable from this machine — the coverage criterion is skipped, not passed");
      return;
    }
    const parsed = manifest();
    const failures: string[] = [];
    let asked = 0;
    for (const entry of parsed.entries) {
      const pin = SOURCE_ADDRESS_PINS[entry.id]!;
      const program = entry.sfz ?? entry.instruments?.[0]?.sfz;
      if (!program || !pin.source) continue;
      const url = sourceSfzUrl(parsed, entry.id, program)!;
      asked++;
      const code = await ranged(url);
      if (code !== 200 && code !== 206) failures.push(`${entry.id}: ${code ?? "no response"} at ${url}`);
    }
    // The count is asserted so a loop that stopped early cannot look like a clean sweep.
    expect(asked).toBeGreaterThanOrEqual(30);
    expect(failures, `source addresses that do not answer:\n${failures.join("\n")}`).toEqual([]);
  }, 600_000);
});

describe("the fixed libraries sound from the source alone, the owner's file included", () => {
  it("resolves emilyguitar's `c6_mf_rr1.wav` to the owner's exact address and answers it", async () => {
    if (!(await reachable())) {
      console.warn("[sampleSourceAddress] raw.githubusercontent.com is unreachable from this machine — the note criterion is skipped, not passed");
      return;
    }
    const parsed = manifest();
    const programUrl = sourceSfzUrl(parsed, "karoryfer-emilyguitar", "Emilyguitar/emily_basic.sfz")!;
    /**
     * ⭐ **The owner's own sentence, as an address.** `emily_basic.sfz` names its samples `notes\c6_mf_rr1.wav` — a backslash, as SFZ writes
     * separators either way — and `sampleAssetForPath` resolves it against the program's URL, so the assertion below is the address the loader builds
     * for that region, not a string this test invented. It is the fixed form of the reported defect, character for character.
     */
    const sample = new URL("notes/c6_mf_rr1.wav", programUrl).toString();
    expect(sample).toBe(`https://raw.githubusercontent.com/sfzinstruments/karoryfer.emilyguitar/${EMILY_PIN}/notes/c6_mf_rr1.wav`);
    expect(sample).not.toContain("/Emilyguitar/");
    expect(await status(programUrl)).toBe(200);
    expect(await status(sample)).toBe(200);

    /**
     * **And the reading that was shipped, still refused.** A file that answered under both spellings would leave this criterion unable to tell the two apart; it does not, which is why the fix
     * is a correction rather than a preference.
     */
    expect(await status(`https://raw.githubusercontent.com/sfzinstruments/karoryfer.emilyguitar/${EMILY_PIN}/Emilyguitar/notes/c6_mf_rr1.wav`)).toBe(404);
  }, 120_000);

  it("serves meatbass's program and one of its samples from the source, so neither library needs the mirror", async () => {
    if (!(await reachable())) {
      console.warn("[sampleSourceAddress] raw.githubusercontent.com is unreachable from this machine — the meatbass criterion is skipped, not passed");
      return;
    }
    const parsed = manifest();
    const programUrl = sourceSfzUrl(parsed, "karoryfer-meatbass", "Meatbass/Programs/01_arco_modwheel.sfz")!;
    expect(programUrl).toBe(`https://raw.githubusercontent.com/sfzinstruments/karoryfer.meatbass/${MEATBASS_PIN}/Programs/01_arco_modwheel.sfz`);
    expect(await status(programUrl)).toBe(200);
    // `01_arco_modwheel.sfz` includes three sibling mapping files, whose own names are relative to the program's directory.
    const body = await (await fetch(programUrl)).text();
    expect(body).toContain('#include "arco_mw_basic_map.sfz"');
    expect(await status(new URL("arco_mw_basic_map.sfz", programUrl).toString())).toBe(200);

    /**
     * ⭐ **And one of the library's own samples, addressed the way the loader addresses it**: the manifest's recorded path with the archive's declared layer removed,
     * against `repo/pin/`. Taking the path from the manifest rather than writing `..\Samples\…` here is the same reason the builders take it — the arithmetic of a
     * relative path is what this whole defect was, so the criterion uses the recorded path and the one function that transforms it.
     */
    const entry = parsed.entries.find((candidate) => candidate.id === "karoryfer-meatbass")!;
    const recorded = entry.files.find((file) => file.path.endsWith("Samples/arco_looped/a0_vl3_down.wav"))!;
    const sampleUrl = `https://raw.githubusercontent.com/sfzinstruments/karoryfer.meatbass/${MEATBASS_PIN}/${sourceRelativePath(recorded.path, entry.sourcePrefix)}`;
    expect(sampleUrl).toBe(`https://raw.githubusercontent.com/sfzinstruments/karoryfer.meatbass/${MEATBASS_PIN}/Samples/arco_looped/a0_vl3_down.wav`);
    expect(await status(sampleUrl)).toBe(200);
  }, 120_000);
});
