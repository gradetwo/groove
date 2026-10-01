import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseSfz } from "../audio/sfz/parse";
import { resolveSamplePath } from "../audio/sfz/defaultPath";
import { resolveInstrumentNote } from "../audio/sfz/instrument";
import { parseManifest } from "../data/sampleManifest";
import { createSampleLoader } from "../audio/sampleLoader";
import type { SampleAsset } from "../data/sampleCatalogue";

/**
 * `default_path` belongs to a `<control>` section, not to a file.
 *
 * The defect this replaces read the **first** `default_path` in a file and applied it to every region, so a keyswitch program — one file holding several folded articulation
 * groups, each opening with its own `<control>` block — had most of its regions resolved into a directory their samples are not in.
 *
 * The semantics were measured against the pinned upstream rather than read off the opcode, and the measurement is in the fixture below: it reproduces the shape and the exact
 * declarations of `schollz/VSCO-2-CE@6dd651d55dde97fd4028699be9d4481f26917891`, whose eight `-KS` programs declare 2, 4 or 5 paths each. Resolved under each region's own
 * path, all 3163 regions of the 75 programs name files that exist upstream; under the first path alone, 64 to 131 regions of each `-KS` program name files that do not.
 *
 * What would have settled it by reading alone is not available, and that is worth stating: the reference engine this project measures against, `sfizz_render`, **ignores**
 * `default_path` altogether — a fixture whose `<control>` declares `default_path=<dir>/` with the file only in `<dir>/` renders silence at peak 1, while the same file placed
 * beside the program renders at peak 2700. So sfizz cannot arbitrate here, and the upstream files themselves are the evidence: every one of a section's samples exists only
 * under that section's declared directory.
 */

const VSCO_PIN = "6dd651d55dde97fd4028699be9d4481f26917891";
const VSCO_RAW = `https://raw.githubusercontent.com/schollz/VSCO-2-CE/${VSCO_PIN}/`;

/**
 * The shape of the upstream keyswitch files, with their real declarations and sample names: the backslashes, the spaces and the missing quotes are what the library writes,
 * and a fixture that quoted them would test a case the library never produces. The sample names are the ones `CelloEns-KS.sfz` actually names in each section, because a
 * fixture with invented names would pass while the real names resolved nowhere.
 *
 * The two sections carry **disjoint** key ranges, which one file cannot do in general: in a keyswitch program a note belongs to every folded articulation at once and only
 * the keyswitch decides which sounds, and that selection is not implemented here. Disjoint ranges keep the criterion about `default_path` rather than about a feature this change did
 * not touch. The declarations and the sample names are the upstream ones; only the ranges are arranged so a note picks one section.
 */
const KEYSWITCH = `
<control>
default_path=Strings\\Cello Section\\susvib\\

<group> //Begin Sustain Group
sw_lokey=c6
sw_hikey=d#6
sw_last=c6
sw_label=C6 Sustain Vibrato

<region> sample=susvib_A2_v1_1.wav lokey=45 hikey=48 pitch_keycenter=45 lovel=0 hivel=62
<region> sample=susvib_B3_v1_1.wav lokey=69 hikey=72 pitch_keycenter=69 lovel=63 hivel=127

<control>
default_path=Strings\\Cello Section\\trem\\

<group> //Begin Tremolo Group
sw_lokey=c6
sw_hikey=d#6
sw_last=c#6
sw_label=C#6 Tremolo

<region> sample=trem_A2_v1_1.wav lokey=45 hikey=48 pitch_keycenter=45
<region> sample=trem_B3_v1_1.wav lokey=69 hikey=72 pitch_keycenter=69 lovel=0 hivel=62
`;

describe("default_path is read per control section", () => {
  it("gives each section's regions its own path, not the file's first one", () => {
    /**
     * The assertion that carries the weight is the second one: `trem`. Under the old file-level reader every region answered `Strings\Cello Section\susvib\`, so the whole
     * tremolo half of the file resolved to files that do not exist. The first region's path is the same under both implementations, which is what makes it the control.
     */
    const regions = parseSfz(KEYSWITCH);
    expect(regions.map((region) => region.sample)).toEqual([
      "susvib_A2_v1_1.wav",
      "susvib_B3_v1_1.wav",
      "trem_A2_v1_1.wav",
      "trem_B3_v1_1.wav",
    ]);
    expect(regions.map((region) => region.defaultPath)).toEqual([
      "Strings\\Cello Section\\susvib\\",
      "Strings\\Cello Section\\susvib\\",
      "Strings\\Cello Section\\trem\\",
      "Strings\\Cello Section\\trem\\",
    ]);
    // And the path is what the sample is joined to, which is the whole point of holding it. Note 69 picks the tremolo section, not the first one.
    const note = regions.find((region) => region.lokey === 69 && region.sample.includes("trem"))!;
    expect(resolveSamplePath(note.sample, note.defaultPath)).toBe("Strings/Cello Section/trem/trem_B3_v1_1.wav");
    expect(regions.some((region) => region.defaultPathProblem)).toBe(false);
  });

  it("resolves the note the section selects against that section's path, end to end", () => {
    /**
     * Through the resolver and the loader both, because the parser could be right while the loader still looked up a file-level value — which is exactly what it did before
     * this change, with `readDefaultPath(expanded.text)` at the call site.
     */
    const asset: SampleAsset = { assetId: "cello-ks", name: "Cello KS", kind: "one-shot", seconds: 1, sfz: { url: `${VSCO_RAW}CelloEns-KS.sfz` } };
    // Velocity 20 is inside the tremolo region's layer (0-62) and outside the sustained one's (63-127), so one section answers.
    const resolution = resolveInstrumentNote(asset, KEYSWITCH, 69, { velocity: 20 });
    expect(resolution.ok).toBe(true);
    expect(resolution.note!.defaultPath).toBe("Strings\\Cello Section\\trem\\");
    expect(resolveSamplePath(resolution.note!.samplePath, resolution.note!.defaultPath)).toBe(
      "Strings/Cello Section/trem/trem_B3_v1_1.wav"
    );
  });

  it("loads the sample the selected section names, through the decoder", async () => {
    const asset: SampleAsset = { assetId: "cello-ks", name: "Cello KS", kind: "one-shot", seconds: 1, sfz: { url: `${VSCO_RAW}CelloEns-KS.sfz` } };
    const decoded: string[] = [];
    const loader = createSampleLoader(
      async (sample) => {
        decoded.push(sample.assetId);
        return { duration: 1, length: 44100, numberOfChannels: 1, sampleRate: 44100 } as unknown as AudioBuffer;
      },
      [asset],
      async () => KEYSWITCH
    );
    const loaded = await loader.loadNote("cello-ks", 69, { velocity: 20 });
    // The tremolo note is asked of the tremolo directory. Before this change the address was the sustain directory's, which is a 404 and silence rather than an error.
    expect(loaded.samplePath).toBe("Strings/Cello Section/trem/trem_B3_v1_1.wav");
    expect(decoded).toEqual(["Strings/Cello Section/trem/trem_B3_v1_1.wav"]);
  });

  it("keeps a single-path file behaving exactly as it did", () => {
    // The common case: one `<control>`, one path, every region under it. Nothing here should have moved.
    const single = "<control>\ndefault_path=Samples/\n<group> ampeg_release=1\n<region> sample=harmLA0.flac\n<region> sample=harmLA1.flac";
    expect(parseSfz(single).map((region) => region.defaultPath)).toEqual(["Samples/", "Samples/"]);
    expect(parseSfz(single).some((region) => region.defaultPathProblem)).toBe(false);

    /**
     * And the two forms older files use, which must not regress: `default_path` in a `<global>`, and one written on a region line carrying other opcodes. The region line is
     * the reason the value is read through the opcode scanner rather than to the end of the line — a line-end read would take `Own/ sample=b.wav` as the path.
     */
    const globalForm = parseSfz("<global> default_path=Old/\nsome_opcode=1\n<region> sample=a.wav");
    expect(globalForm[0]!.defaultPath).toBe("Old/");
    const ownOnRegion = parseSfz("<control> default_path=Ctl/\n<region> default_path=Own/ sample=b.wav\n<region> sample=c.wav");
    expect(ownOnRegion.map((region) => region.defaultPath)).toEqual(["Own/", "Ctl/"]);

    // A file that declares no path at all is not a problem: it means the sample is already relative to the program, which is what absent has always meant.
    const declarers = parseSfz("<region> sample=n.wav");
    expect(declarers[0]!.defaultPath).toBeUndefined();
    expect(declarers[0]!.defaultPathProblem).toBeUndefined();
  });

  it("reports a region whose path is unknowable instead of guessing one", async () => {
    /**
     * A region written before the `<control>` block that declares the path. SFZ applies a `default_path` from its declaration onward, so this region has no applicable one —
     * but the file plainly intends a path, and either candidate (the later declaration, or none) is a guess that resolves a sample out of the wrong directory. The problem
     * names the region and its sample; the old implementation would have answered `Late/` for both regions without anything to show for it.
     */
    const text = "<region> sample=early.wav\n<control> default_path=Late/\n<region> sample=late.wav";
    const regions = parseSfz(text);
    expect(regions[0]!.defaultPath).toBeUndefined();
    expect(regions[0]!.defaultPathProblem).toMatch(/region 1 \("early\.wav"\)/);
    expect(regions[0]!.defaultPathProblem).toMatch(/before any <control> block declares default_path/);
    // The region after the declaration is not affected by its neighbour's problem.
    expect(regions[1]!.defaultPath).toBe("Late/");
    expect(regions[1]!.defaultPathProblem).toBeUndefined();

    // And the resolver refuses the note, which is what keeps every caller from resolving its sample against a guess.
    const asset: SampleAsset = { assetId: "ambiguous", name: "Ambiguous", kind: "one-shot", seconds: 1, sfz: { url: `https://example.test/ambiguous.sfz` } };
    const resolution = resolveInstrumentNote(asset, text, 60);
    expect(resolution.ok).toBe(false);
    expect(resolution.reason).toMatch(/early\.wav/);

    // The loader says the same thing rather than building an address, which is the layer a wrong directory would have gone silent in.
    const loader = createSampleLoader(
      async () => ({ duration: 1, length: 1, numberOfChannels: 1, sampleRate: 44100 }) as unknown as AudioBuffer,
      [asset],
      async () => text
    );
    await expect(loader.loadNote("ambiguous", 60)).rejects.toThrow(/region 1 \("early\.wav"\)/);
  });

  it("is not a problem for a file that declares no path at all", () => {
    /**
     * The distinction the problem turns on: a file with no `default_path` anywhere is not ambiguous — its samples are relative to the program, which is what absent has
     * always meant. Only a file that declares one somewhere, plus a region written before it, is unknowable.
     */
    const regions = parseSfz("<region> sample=a.wav\n<region> sample=b.wav");
    expect(regions.map((region) => region.defaultPath)).toEqual([undefined, undefined]);
    expect(regions.some((region) => region.defaultPathProblem)).toBe(false);
  });
});

/**
 * The upstream files themselves, so the change is held against the library that motivated it rather than against a fixture this session wrote.
 *
 * Nothing is downloaded beyond the nine text files: no audio. The suite skips when the network is not there, the pattern the other real-library criteria use, and it fails
 * loudly if some of the eight fetch and others do not.
 */
interface Upstream {
  /** Every blob in the pinned tree, by path — the authority on which sample files exist. */
  blobs: Map<string, number>;
  /** The eight keyswitch programs, by file name. */
  programs: Map<string, string>;
}

const upstream = await (async (): Promise<Upstream | null> => {
  try {
    /**
     * `recursive=1` is not decoration: without it the API answers with the repository root only — 96 entries instead of 3399 — and every sample path would look absent. The
     * first version of this criterion did exactly that and reported the whole library missing, which is the failure mode this repository keeps meeting: a reading that looks
     * like data and is not.
     */
    const response = await fetch(`https://api.github.com/repos/schollz/VSCO-2-CE/git/trees/${VSCO_PIN}?recursive=1`);
    if (!response.ok) return null;
    const tree = (await response.json()) as { tree?: { path: string; type: string; size?: number }[]; truncated?: boolean };
    if (!tree.tree || tree.truncated) return null;
    const blobs = new Map(tree.tree.filter((entry) => entry.type === "blob").map((entry) => [entry.path, entry.size ?? 0]));
    const names = [...blobs.keys()].filter((path) => path.endsWith("-KS.sfz")).sort();
    if (names.length !== 8) return null;
    const fetched = await Promise.all(
      names.map(async (name) => {
        const program = await fetch(`${VSCO_RAW}${name}`);
        return program.ok ? ([name, await program.text()] as const) : null;
      })
    );
    if (fetched.some((entry) => entry === null)) throw new Error("some keyswitch programs did not fetch");
    return { blobs, programs: new Map(fetched as (readonly [string, string])[]) };
  } catch {
    return null;
  }
})();

describe.skipIf(upstream === null)("the upstream keyswitch programs, held against the pinned tree", () => {
  it("declares several paths in one file, which is what a file-level reader cannot represent", () => {
    expect([...upstream!.programs.keys()].sort()).toEqual([
      "CelloEns-KS.sfz",
      "Clarinet-KS.sfz",
      "Contrabass-KS.sfz",
      "Flute-KS.sfz",
      "SViolin-KS.sfz",
      "Tuba-KS.sfz",
      "ViolaEns-KS.sfz",
      "ViolinEns-KS.sfz",
    ]);
    // The pinned tree, not a partial one: 3273 blobs, of which 75 are programs. A truncated listing would make every sample look absent and the criterion below meaningless.
    expect(upstream!.blobs.size).toBe(3273);
    for (const [name, text] of upstream!.programs) {
      const paths = new Set(parseSfz(text).map((region) => region.defaultPath));
      expect(paths.size, `${name} should hold more than one articulation directory`).toBeGreaterThan(1);
      expect(paths.has(undefined), `${name} has a region with no applicable path`).toBe(false);
    }
  });

  it("resolves every note of every one of the eight to a file the pinned tree really has", () => {
    for (const [name, text] of upstream!.programs) {
      const asset: SampleAsset = { assetId: `vsco2ce:${name.replace(/\.sfz$/, "")}`, name, kind: "one-shot", seconds: 1, sfz: { url: `${VSCO_RAW}${name}` } };
      let resolved = 0;
      for (let note = 0; note <= 127; note += 1) {
        for (const velocity of [1, 32, 64, 96, 127]) {
          const resolution = resolveInstrumentNote(asset, text, note, { velocity });
          if (!resolution.ok) continue;
          const sample = resolveSamplePath(resolution.note!.samplePath, resolution.note!.defaultPath);
          expect(upstream!.blobs.has(sample), `${name}: note ${note} at velocity ${velocity} resolved to "${sample}", which the pinned tree does not have`).toBe(true);
          resolved += 1;
        }
      }
      expect(resolved, `${name} resolved no note at all`).toBeGreaterThan(0);
    }
  }, 60_000);
});

/**
 * What one keyswitch program measures now: can it be measured at all, and how much of it is already mirrored.
 *
 * The manifest is read from the repository, so this part needs no network. Nothing is downloaded and nothing is mirrored — the question is only whether the program can be
 * resolved and what the answer says about the mirror as it stands.
 */
describe("what a keyswitch program measures", () => {
  it("resolves CelloEns-KS's 156 regions into its own four directories, and finds none of them in the mirror", () => {
    const source = upstream?.programs.get("CelloEns-KS.sfz") ?? readFileSync("/tmp/vsco/sfz/CelloEns-KS.sfz", "utf8");
    const regions = parseSfz(source);
    expect(regions).toHaveLength(156);
    expect(new Set(regions.map((region) => region.defaultPath))).toEqual(
      new Set(["Strings\\Cello Section\\susvib\\", "Strings\\Cello Section\\trem\\", "Strings\\Cello Section\\spic\\", "Strings\\Cello Section\\pizzT\\"])
    );

    /**
     * Every one of the 156 files the parser now names — four directories, 156 distinct names, each read from its own section. This is the list the old reader could not
     * produce: it answered the sustain directory for all of them, which is 129 names that do not exist.
     */
    const resolved = regions.map((region) => resolveSamplePath(region.sample, region.defaultPath));
    expect(new Set(resolved).size).toBe(156);
    const directories = (paths: string[]) => {
      const counts = new Map<string, number>();
      for (const path of paths) {
        const directory = path.split("/").slice(0, 3).join("/");
        counts.set(directory, (counts.get(directory) ?? 0) + 1);
      }
      return Object.fromEntries(counts);
    };
    expect(directories(resolved)).toEqual({
      "Strings/Cello Section/susvib": 27,
      "Strings/Cello Section/trem": 25,
      "Strings/Cello Section/spic": 52,
      "Strings/Cello Section/pizzT": 52,
    });

    /**
     * And the mirror holds 27 of them, all of them from the sustained section that the already-mirrored `CelloEnsSusVib.sfz` shares. The other 129 are absent, which is why
     * this program is not in the mirror — a statement about the mirror, measured, rather than about the parser.
     */
    const manifest = parseManifest(readFileSync("public/samples/manifest.json", "utf8"));
    const vsco = manifest.manifest!.entries.find((entry) => entry.id === "vsco2ce")!;
    const mirrored = new Set(vsco.files.map((file) => file.path));
    /**
     * ⚠️ **A total here would be a stale literal, and it just was one.** This assertion used to read
     * `expect(mirrored.size).toBe(372)` — the mirror's file count at the time it was written. Then the
     * VSCO articulations were mirrored (556 files) and the count became 928, so merging the two branches
     * turned a true statement into a red one **without anything about keyswitches changing**. A hard-coded
     * total over a file that other work grows is a count, not a claim; what this case is actually about is
     * the split below, and 27 + 129 already pins the only total that matters here.
     */
    expect(mirrored.size).toBeGreaterThan(27);
    expect(resolved.filter((path) => mirrored.has(path))).toHaveLength(27);
    expect(resolved.filter((path) => !mirrored.has(path))).toHaveLength(129);
  });
});
