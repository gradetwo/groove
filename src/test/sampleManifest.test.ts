import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mirrorSfzUrl, parseManifest, sampleAssetsFromManifest, shippableEntries } from "../data/sampleManifest";

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
        /**
         * ⭐ `CC-Sampling-Plus` owes attribution by its own terms, so this fixture carries one — an entry with a credit-owing licence and no credit is refused by the parser now, which is the rule and not an accident of the fixture.
         */
        { id: "vsco2", name: "VSCO 2 CE", licence: "CC-Sampling-Plus", attribution: "Sonatina Symphonic Orchestra (Mattias Westlund), CC Sampling Plus 1.0", files: [], excludedReason: "this project chose not to redistribute this one (fixture)" },
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
    // The address now also carries the program's own path, because include paths resolve against the library root and the loader subtracts it. **No `repo`/`pin` here, so there is no pinned source** and
    // the mirror remains the only address — which is the case the `fallbackUrl` field must stay absent for.
    expect(assets[0]!.sfz).toEqual({ url: "https://cdn.example/samples/vcsl/piano.sfz", path: "piano.sfz" });
    expect(assets[1]!.sfz).toBeUndefined();
    expect(assets[0]!.seconds).toBe(3.5);
  });

  it("skips an excluded entry silently and an unmeasured one loudly, because the two are different facts", async () => {
    const { sampleAssetsFromManifest } = await import("../data/sampleManifest");
    const parsed = parseManifest(
      manifest([
        // Same rule as above: `CC-Sampling-Plus` requires a credit, and the fixture supplies one rather than tripping the validator.
        { id: "vsco2", name: "VSCO 2 CE", licence: "CC-Sampling-Plus", attribution: "Sonatina Symphonic Orchestra (Mattias Westlund), CC Sampling Plus 1.0", files: [], excludedReason: "excluded here, so its missing duration does not matter" },
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
    // **Source first**, pinned — and the mirror demoted to a fallback, which is the owner's decision. The old assertion required the mirror URL, so it was checking the behaviour that has just been reversed.
    expect(instrument.sfz?.url).toBe("https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/9f04cf9a7345/Programs/01-basic-kit.sfz");
    // **Root-agnostic on purpose**: this criterion supplies its own root, so naming the production hostname here would be asserting the test's own parameter rather than the behaviour. What matters is that the
    // fallback is the mirror's layout for this program — the same path under whatever root the caller configured.
    expect(instrument.sfz?.fallbackUrl).toMatch(/\/virtuosity-drums\/Programs\/01-basic-kit\.sfz$/);
    expect(instrument.seconds).toBeCloseTo(14.529542, 6);
    /**
     * ⭐ **The rule: every entry that declares a program and has no measured duration is named as a gap, and nothing else is.** The assertion has taken three forms and each failure taught the next one: it first named
     * `salamander-grand` specifically, then asserted the list was empty once that entry was measured — and both pinned one moment's data. Deriving the expected set from the manifest means a library that is declared but not yet
     * mirrored is reported, and one that has been mirrored is not, without editing this test when either changes.
     */
    // ⭐ The parameters are annotated because `shipped` comes from `JSON.parse` and is therefore `any` — the same reason the earlier version of this line failed the type check rather than the test.
    const declared = (shipped.entries as Array<{ id: string; sfz?: string; archive?: unknown; durationSeconds?: number }>)
      .filter((entry) => Boolean(entry.sfz || entry.archive) && entry.durationSeconds === undefined)
      .map((entry) => entry.id);
    /**
     * ⭐ **The id is read from the leading quoted word.** The message is of the form `"karoryfer-meatbass" is not in the catalogue: …`, and splitting on the first colon yields `"…" is not in the catalogue`, because that colon
     * belongs to `catalogue:`. Two earlier attempts at this line did exactly that; printing the two lists is what showed it.
     */
    const reported = [...new Set(problems.flatMap((problem) => { const match = /^"([^"]+)"/.exec(problem); return match ? [match[1]!] : []; }))];
    expect(reported.sort()).toEqual(declared.sort());
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
    // The wording follows the rule, which changed to allow zero: an empty file is a size, and VCSL ships one.
    expect(messages).toMatch(/bytes must be a number of zero or more/);
    expect(messages).toMatch(/sha256 must be 64 lower-case hex characters/);
  });

  it("accepts a file of zero bytes, because zero is a size rather than a missing one", () => {
    // VCSL ships `Non-standard pitch (please transpose).txt` at zero bytes; the rule refused it and the repository could not parse its own enumeration.
    const parsed = parseManifest(
      manifest([{ id: "x", name: "X", licence: "CC0", files: [{ path: "note.txt", bytes: 0 }] }])
    );
    expect(parsed.ok, parsed.errors.join("; ")).toBe(true);
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
    expect(assets[0]!.sfz).toEqual({ url: "https://cdn.example/samples/kit/Programs/kit.sfz", path: "Programs/kit.sfz" });
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
    // **No `prefix`** — and this assertion used to require one, which is the bug the end-to-end probe found: `prefix` describes the *mirror's* layout, the upstream repository has no such directory,
    // and asking GitHub for `…/<pin>/kit/Programs/…` returned fourteen bytes of `404: Not Found` that parsed as an SFZ with no regions.
    expect(sourceSfzUrl(parsed.manifest!, "kit")).toBe("https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/9f04cf9a7345/Programs/01-basic-kit.sfz");
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
describe("a library that holds several instruments", () => {
  const libraryEntry = {
    id: "vcsl",
    name: "VCSL",
    licence: "CC0",
    repo: "sgossner/VCSL",
    pin: "abc123",
    prefix: "vcsl",
    durationSeconds: 12.5,
    files: [],
    instruments: [
      { sfz: "Aerophones/Ball Whistle.sfz", name: "Ball Whistle" },
      { sfz: "Idiophones/Glockenspiel.sfz", name: "Glockenspiel" },
      { sfz: "Membranophones/Tom.sfz", name: "Tom" },
    ],
  };

  it("produces one selectable instrument per declared program, each at its own address", () => {
    /**
     * The gap this closes: a library used to yield a single asset whatever it contained, so uploading VCSL's four families would have put 155 instruments' bytes on the CDN while the catalogue offered one. Each program now becomes an
     * asset whose address is that program's own file.
     */
    const parsed = parseManifest(manifest([libraryEntry])).manifest!;
    const { assets, problems } = sampleAssetsFromManifest(parsed, "https://cdn.example/samples");
    expect(problems).toEqual([]);
    expect(assets.map((asset) => asset.name)).toEqual(["Ball Whistle", "Glockenspiel", "Tom"]);
    expect(assets.map((asset) => asset.sfz?.path)).toEqual([
      "Aerophones/Ball Whistle.sfz",
      "Idiophones/Glockenspiel.sfz",
      "Membranophones/Tom.sfz",
    ]);
    expect(assets[1]!.sfz?.url).toBe("https://raw.githubusercontent.com/sgossner/VCSL/abc123/Idiophones/Glockenspiel.sfz");
  });

  it("gives each instrument a short id from its own file name, not its position", () => {
    /**
     * Position would move every id when the list is reordered, and the ids are what a song or a shared genre records. The file name rather than the whole path, because the entry id already names the library: slugging the path produced
     * `karoryfer-meatbass:Meatbass-Programs-02-arco-3vel`, naming the library twice.
     */
    const parsed = parseManifest(manifest([libraryEntry])).manifest!;
    const { assets } = sampleAssetsFromManifest(parsed, "https://cdn.example/samples");
    expect(assets.map((asset) => asset.assetId)).toEqual(["vcsl:Ball-Whistle", "vcsl:Glockenspiel", "vcsl:Tom"]);
  });

  it("falls back to the whole path for names that would collide, so an id never points at two instruments", () => {
    // Two programs in different directories with the same file name is the case a base-name slug cannot tell apart, and an id that collided would select the wrong instrument.
    const parsed = parseManifest(
      manifest([
        {
          ...libraryEntry,
          instruments: [
            { sfz: "Aerophones/Edge-blown/Pipe Organ.sfz", name: "Pipe Organ (edge)" },
            { sfz: "Idiophones/Struck/Pipe Organ.sfz", name: "Pipe Organ (struck)" },
            { sfz: "Idiophones/Struck/Glockenspiel.sfz", name: "Glockenspiel" },
          ],
        },
      ])
    ).manifest!;
    const { assets } = sampleAssetsFromManifest(parsed, "https://cdn.example/samples");
    expect(assets.map((asset) => asset.assetId)).toEqual([
      "vcsl:Aerophones-Edge-blown-Pipe-Organ",
      "vcsl:Idiophones-Struck-Pipe-Organ",
      "vcsl:Glockenspiel",
    ]);
    expect(new Set(assets.map((asset) => asset.assetId)).size).toBe(assets.length);
  });

  it("keeps a single-instrument entry under its own id, which is what the published entries rely on", () => {
    const parsed = parseManifest(
      manifest([{ id: "salamander-grand", name: "Salamander Grand Piano", licence: "CC-BY", attribution: "Alexander Holm", repo: "r", pin: "p", prefix: "salamander-grand", sfz: "Salamander Grand Piano V3.sfz", durationSeconds: 25.86, files: [] }])
    ).manifest!;
    const { assets } = sampleAssetsFromManifest(parsed, "https://cdn.example/samples");
    expect(assets).toHaveLength(1);
    expect(assets[0]!.assetId).toBe("salamander-grand");
    expect(assets[0]!.sfz?.path).toBe("Salamander Grand Piano V3.sfz");
  });

  it("falls back to the mirror when there is no pinned source, rather than losing the instrument", () => {
    /**
     * An entry declared before its bytes are pinned still describes instruments. The mirror address is built from `prefix` and the program path, so the asset resolves; what the source adds is a second address to try first, which is
     * the reason both are carried.
     */
    const parsed = parseManifest(manifest([{ ...libraryEntry, repo: undefined, pin: undefined }])).manifest!;
    const { assets, problems } = sampleAssetsFromManifest(parsed, "https://cdn.example/samples");
    expect(problems).toEqual([]);
    expect(assets).toHaveLength(3);
    expect(assets[0]!.sfz?.url).toBe("https://cdn.example/samples/vcsl/Aerophones/Ball Whistle.sfz");
    expect(assets[0]!.sfz?.fallbackUrl).toBeUndefined();
  });
});

