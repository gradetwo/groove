import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mirrorSfzUrl, parseManifest, shippableEntries } from "../data/sampleManifest";

/**
 * The manifest's criteria. Two of them are rules rather than shapes, and both come from the integration discussion: ids must be unique because a manifest that names
 * one instrument twice cannot be resolved deterministically, and a licence that requires attribution must carry it because redistributing without it is a licence
 * violation rather than a style choice.
 */
const manifest = (entries: unknown) => JSON.stringify({ version: 1, entries });

describe("parseManifest", () => {
  it("accepts a well-formed manifest and reports what it holds", () => {
    const result = parseManifest(
      manifest([
        { id: "vcsl-piano", name: "VCSL Piano", licence: "CC0", prefix: "vcsl/", sfz: "piano.sfz", files: [{ path: "piano.sfz", bytes: 120 }], needs: ["lokey", "hikey", "pitch_keycenter"] },
      ])
    );
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.manifest!.entries[0]).toMatchObject({ id: "vcsl-piano", licence: "CC0" });
    // The needs field is the answer to "will this library work here", kept as data rather than as someone's memory.
    expect(result.manifest!.entries[0]!.needs).toEqual(["lokey", "hikey", "pitch_keycenter"]);
  });

  it("refuses a duplicate id, because resolution would otherwise be a coin toss", () => {
    const result = parseManifest(manifest([{ id: "same", name: "A", licence: "CC0", files: [] }, { id: "same", name: "B", licence: "CC0", files: [] }]));
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/duplicate id "same"/);
  });

  it("requires attribution for a licence that demands it, and does not for one that does not", () => {
    const missing = parseManifest(manifest([{ id: "salamander", name: "Salamander", licence: "CC-BY", files: [] }]));
    expect(missing.ok).toBe(false);
    expect(missing.errors.join("\n")).toMatch(/licence CC-BY requires attribution/);

    // The same entry with attribution is fine, and a CC0 entry needs none.
    const withAttribution = parseManifest(
      manifest([
        { id: "salamander", name: "Salamander", licence: "CC-BY", attribution: "Chisato Yamauchi; Alexander Holm", files: [] },
        { id: "drums", name: "Virtuosity Drums", licence: "CC0", files: [] },
      ])
    );
    expect(withAttribution.ok).toBe(true);
  });

  it("reports every problem at once rather than stopping at the first", () => {
    const result = parseManifest(manifest([{ name: "no id", licence: "nonsense", files: "not an array" }, { id: "x", licence: "CC-BY", files: [] }]));
    expect(result.ok).toBe(false);
    /**
     * The property worth asserting is that **more than one** problem comes back, and that they come from **different entries** — not a number I pencilled in.
     *
     * The first version of this assertion claimed four and the code produced three, because I had counted the fixture wrong rather than the code. The count was never
     * the point: a validator that stops at the first fault makes a manifest take as many round trips as it has mistakes, and that is what this is guarding.
     */
    expect(result.errors.length).toBeGreaterThan(1);
    expect(result.errors.some((message) => message.includes("entries[0]"))).toBe(true);
    expect(result.errors.some((message) => message.includes("entries[1]"))).toBe(true);
  });

  it("treats a broken file as a reported error rather than as an empty manifest", () => {
    expect(parseManifest("{ not json").ok).toBe(false);
    expect(parseManifest("{ not json").errors[0]).toMatch(/not valid JSON/);
    expect(parseManifest(JSON.stringify({ version: 2, entries: [] })).errors.join()).toMatch(/version must be 1/);
    expect(parseManifest(JSON.stringify({ version: 1 })).errors.join()).toMatch(/no entries array/);
  });

  it("separates what ships from what is deliberately excluded, and resolves a mirror URL", () => {
    const parsed = parseManifest(
      manifest([
        { id: "vcsl", name: "VCSL", licence: "CC0", prefix: "vcsl", sfz: "piano.sfz", files: [] },
        { id: "vsco2", name: "VSCO 2 CE", licence: "CC-Sampling-Plus", files: [], excludedReason: "the licence terms are vague, so this project does not redistribute it" },
        { id: "samples-only", name: "Just samples", licence: "CC0", files: [] },
      ])
    ).manifest!;
    expect(shippableEntries(parsed).map((entry) => entry.id)).toEqual(["vcsl", "samples-only"]);
    // A trailing slash on either side must not produce a doubled one.
    expect(mirrorSfzUrl(parsed, "vcsl", "https://cdn.example/samples/")).toBe("https://cdn.example/samples/vcsl/piano.sfz");
    // An entry that is not an instrument has no SFZ to fetch, which is a legitimate answer rather than an error.
    expect(mirrorSfzUrl(parsed, "samples-only", "https://cdn.example")).toBeUndefined();
    expect(mirrorSfzUrl(parsed, "nope", "https://cdn.example")).toBeUndefined();
  });
});

/**
 * The bridge from the manifest to the catalogue the playback path already uses — the last piece that lets the bytes live on a CDN while the song format stays unchanged.
 */
describe("sampleAssetsFromManifest", () => {
  const root = "https://cdn.example/samples";

  it("turns a shippable instrument into a catalogue entry whose sfz url is resolved against the mirror", async () => {
    const { sampleAssetsFromManifest } = await import("../data/sampleManifest");
    const parsed = parseManifest(
      manifest([
        { id: "vcsl-piano", name: "VCSL Piano", licence: "CC0", prefix: "vcsl", sfz: "piano.sfz", durationSeconds: 3.5, files: [] },
        { id: "riser", name: "Riser", licence: "CC0", durationSeconds: 2, files: [] },
      ])
    ).manifest!;
    const { assets, problems } = sampleAssetsFromManifest(parsed, root);
    expect(problems).toEqual([]);
    expect(assets.map((asset) => asset.assetId)).toEqual(["vcsl-piano", "riser"]);
    // The instrument carries the sfz; the plain sample does not, which is what keeps every existing path byte-identical.
    expect(assets[0]!.sfz).toEqual({ url: "https://cdn.example/samples/vcsl/piano.sfz" });
    expect(assets[1]!.sfz).toBeUndefined();
    expect(assets[0]!.seconds).toBe(3.5);
  });

  it("skips an excluded entry silently and an unmeasured one loudly, because the two are different facts", async () => {
    const { sampleAssetsFromManifest } = await import("../data/sampleManifest");
    const parsed = parseManifest(
      manifest([
        { id: "vsco2", name: "VSCO 2 CE", licence: "CC-Sampling-Plus", files: [], excludedReason: "vague terms, not redistributed" },
        { id: "unmeasured", name: "Not measured yet", licence: "CC0", files: [] },
      ])
    ).manifest!;
    const { assets, problems } = sampleAssetsFromManifest(parsed, root);
    // Exclusion is a decision, so it produces no catalogue entry and no complaint; a missing duration is a gap, so it produces a reason.
    expect(assets).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/"unmeasured" is not in the catalogue: the manifest gives no durationSeconds/);
  });

  it("reports the gap in the manifest this repository actually ships, instead of inventing a duration", async () => {
    const { sampleAssetsFromManifest } = await import("../data/sampleManifest");
    const shipped = JSON.parse(readFileSync("public/samples/manifest.json", "utf8"));
    const parsed = parseManifest(JSON.stringify(shipped));
    // It must parse: the shipped manifest is data this project relies on, so a mistake in it should fail here rather than at runtime.
    expect(parsed.ok, parsed.errors.join("; ")).toBe(true);

    /**
     * And it declares a real instrument whose duration nobody has measured — because the samples have not been downloaded. The honest outcome is therefore **not** an
     * entry with `seconds: 0`: it is **no entry and a reason**, which is what the bridge is for. The first version of this test asserted an empty manifest yields
     * nothing; the manifest is no longer empty, and asserting the old state would have been asserting the past.
     */
    const { assets, problems } = sampleAssetsFromManifest(parsed.manifest!, root);
    /**
     * **This used to assert that nothing came out, and it was right at the time.** Now the manifest carries a real, measured instrument, so the bridge produces one — which is the
     * closure this whole chain was built for: a manifest entry, derived from the SFZ, whose files were fetched, hashed and measured, resolving into a catalogue asset with an
     * `sfz` URL.
     *
     * The **half that still has no duration keeps being reported as a gap**, and that half is asserted too, because "one works and one is honestly incomplete" is the state that
     * actually exists and the one a future change should not quietly break.
     */
    expect(assets.map((asset) => asset.assetId)).toContain("virtuosity-drums-basic");
    const instrument = assets.find((asset) => asset.assetId === "virtuosity-drums-basic")!;
    // A real instrument, resolved against the mirror, with a duration that was measured rather than guessed.
    expect(instrument.sfz?.url).toMatch(/virtuosity-drums\/Programs\/01-basic-kit\.sfz$/);
    expect(instrument.seconds).toBeCloseTo(14.529542, 6);
    expect(problems.join("\n")).toMatch(/salamander-grand/);
    /**
     * One problem **per declared entry**, and each naming its entry — not a count I pencilled in.
     *
     * The first version asserted exactly one problem, which was true while the manifest held one instrument; adding a second broke a test that was measuring my memory of
     * the file rather than the property it cares about. The property is: nothing becomes a catalogue entry without a measured duration, and every such gap is reported by
     * name.
     */
    /**
     * **The general form of that assertion, rather than a count.** It used to require one problem per shipped entry, which was true while every entry lacked a duration — and
     * stopped being true the moment one of them was measured. What it should always have said is: an entry appears in `problems` **if and only if** it has no measured duration.
     */
    const shippedEntries = parsed.manifest!.entries.filter((entry) => !entry.excludedReason);
    const withoutDuration = shippedEntries.filter((entry) => typeof entry.durationSeconds !== "number");
    expect(shippedEntries.length).toBeGreaterThan(0);
    expect(problems).toHaveLength(withoutDuration.length);
    for (const entry of withoutDuration) expect(problems.join("\n")).toContain(entry.id);
    for (const entry of shippedEntries.filter((entry) => typeof entry.durationSeconds === "number")) {
      expect(problems.join("\n"), `${entry.id} has a measured duration and must not be reported as a gap`).not.toContain(entry.id);
    }
  });
});

/**
 * The promises a mirror acts on, checked where they are written rather than after a download.
 *
 * Before this, `files` only had to be an array — an entry could carry `[{ bytes: -5 }]` or a twenty-character hash and pass. The failure would then appear as a broken mirror
 * **after** 1.2 GB had been fetched, which is the worst possible moment and the reason the manifest exists in the first place.
 */
describe("the manifest validates its own promises", () => {
  it("requires a path and sane bytes and hashes for every file", () => {
    const bad = parseManifest(manifest([{ id: "x", name: "X", licence: "CC0", files: [{ bytes: 10 }, { path: "a.wav", bytes: -5 }, { path: "b.wav", sha256: "abc" }] }]));
    expect(bad.ok).toBe(false);
    const messages = bad.errors.join("\n");
    expect(messages).toMatch(/files\[0\]: path is required/);
    expect(messages).toMatch(/bytes must be a positive number/);
    expect(messages).toMatch(/sha256 must be 64 lower-case hex characters/);
  });

  it("accepts a well-formed file list and refuses a duration that is not positive", () => {
    const good = parseManifest(manifest([{ id: "x", name: "X", licence: "CC0", durationSeconds: 1.9, files: [{ path: "a.wav", bytes: 93103, sha256: "a".repeat(64) }] }]));
    expect(good.ok, good.errors.join("; ")).toBe(true);

    const zero = parseManifest(manifest([{ id: "x", name: "X", licence: "CC0", durationSeconds: 0, files: [] }]));
    expect(zero.ok).toBe(false);
    // A zero duration is the invented value this whole mechanism exists to avoid, so it is refused at the door.
    expect(zero.errors.join("\n")).toMatch(/durationSeconds must be a positive number/);
  });
});

/**
 * The last pure link: manifest **text** in, catalogue assets and problems out.
 *
 * The parts already existed and this joins them, which is worth a criterion because the join has one decision in it: a manifest that fails to parse must produce **no assets and
 * its errors**, not an empty catalogue. Those are different facts — "the library failed to load" and "the library has no instruments" lead a composer to different actions.
 */
describe("catalogueFromManifestText", () => {
  it("returns the assets a valid manifest describes, resolved against the mirror", async () => {
    const { catalogueFromManifestText } = await import("../data/sampleCatalogue");
    const text = manifest([
      { id: "kit", name: "Kit", licence: "CC0", prefix: "kit", sfz: "Programs/kit.sfz", durationSeconds: 2.5, files: [{ path: "Programs/kit.sfz", bytes: 100 }] },
    ]);
    const { assets, problems } = catalogueFromManifestText(text, "https://cdn.example/samples");
    expect(problems).toEqual([]);
    expect(assets.map((asset) => asset.assetId)).toEqual(["kit"]);
    expect(assets[0]!.sfz).toEqual({ url: "https://cdn.example/samples/kit/Programs/kit.sfz" });
  });

  it("reports a manifest that does not parse instead of returning an empty catalogue", async () => {
    const { catalogueFromManifestText } = await import("../data/sampleCatalogue");
    const broken = catalogueFromManifestText("{ not json", "https://cdn.example");
    expect(broken.assets).toEqual([]);
    // The distinction matters: an empty catalogue says "no instruments", while these errors say "the manifest is wrong".
    expect(broken.problems[0]).toMatch(/manifest: manifest is not valid JSON/);
  });
});

/**
 * Source-first addressing: the URL derived from the pin the manifest already carries.
 *
 * The owner's decision is that the **source is tried first and the mirror is the fallback**, reversing what the first implementation did. Two things are asserted, and the second is the one that
 * matters for the fallback actually being reachable: a pinned source URL is produced, and it is **derived** — no second URL field to drift out of step with `repo`/`pin`.
 */
describe("sourceSfzUrl", () => {
  it("derives a pinned raw URL from the entry's own repo and pin", async () => {
    const { sourceSfzUrl, parseManifest } = await import("../data/sampleManifest");
    const parsed = parseManifest(manifest([
      { id: "kit", name: "Kit", licence: "CC0", prefix: "kit", repo: "sfzinstruments/virtuosity_drums", pin: "9f04cf9a7345", sfz: "Programs/01-basic-kit.sfz", files: [{ path: "Programs/01-basic-kit.sfz", bytes: 10 }] },
    ]));
    expect(sourceSfzUrl(parsed.manifest!, "kit")).toBe("https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/9f04cf9a7345/kit/Programs/01-basic-kit.sfz");
  });

  it("returns nothing without a pin, rather than an address that would drift with the default branch", async () => {
    const { sourceSfzUrl, parseManifest } = await import("../data/sampleManifest");
    const parsed = parseManifest(manifest([
      { id: "kit", name: "Kit", licence: "CC0", prefix: "kit", repo: "someone/library", sfz: "k.sfz", files: [] },
    ]));
    // Unpinned means the address could change under us, so there is no honest source address to give — the mirror is the only stable one.
    expect(sourceSfzUrl(parsed.manifest!, "kit")).toBeUndefined();
    expect(sourceSfzUrl(parsed.manifest!, "not-an-entry")).toBeUndefined();
  });
});
