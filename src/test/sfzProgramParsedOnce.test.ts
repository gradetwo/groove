/**
 * ⭐ **One program is parsed once, however many notes are played from it — and never across assets.**
 *
 * ## The measurement this criterion exists for (2026-10-03)
 *
 * `resolveInstrumentNote` used to call `parseSfz` on every note. That was invisible on the render path and it was
 * **the whole cost** on the owner's import path: `敢当.mid` (20,458 B, **2,371 note-ons**) imported with both parts on
 * `salamander-grand` produced, in a 15-second playback window on a production build,
 *
 * ```
 *   worst frame            7,683 ms      (the same arrangement with synth tracks: 150 ms)
 *   long tasks             12, total 15,112 ms, worst 7,676 ms
 *   droppedSteps           41            (synth: 0)
 *   CPU profile            58.5 % of samples inside the sampler chunk —
 *                          scanOpcodes 9.6 %, parse walk 9.3 %, ccTuneCents 6.9 %,
 *                          regionSoundsAtCc 6.1 %, parseSfz 5.4 %, noteNumber 5.1 %
 *   from second 6 on       the main thread was 100 % busy in that parse, to the end of the window
 * ```
 *
 * Salamander's expanded program is ~24 KB and some six hundred regions, re-parsed once per note — 2,371 parses of an
 * unchanged string. The parser is the hot function, so **the count is the criterion**: it is cheap, deterministic, and
 * it says exactly the thing that was wrong.
 *
 * ## What is asserted
 *
 * 1. **sixty notes, one program ⇒ `parseSfz` at most twice.** The two are the two places that legitimately read a
 *    program once — the resolver's own program facts (`sfz/instrument.ts`) and `sampleLoader`'s `declaredSamples`,
 *    which reads the text for `loop_mode=no_loop` (a value the resolver drops on purpose). Before the cache this was
 *    **61**, which is what makes the criterion red rather than decorative.
 * 2. **two programs are not each other's.** Each asset's notes resolve to the sample its own text names, interleaved,
 *    so a cache keyed by anything coarser than the catalogue entry fails here.
 * 3. **one asset object with two different texts is not served stale facts** — the guard that makes the `WeakMap`
 *    entry safe when a catalogue is reloaded in place.
 * 4. **⭐ §26: nothing about the sound moved.** Twenty notes of the repository's own pinned VSCO program, with the
 *    sample path, playback ratio, root key and region count frozen as the values measured **before** the cache existed
 *    (`VlnEns_susVib_B2_v2.wav` at note 58 with ratio 0.9438743126816935, …). Changing what a note resolves to cannot
 *    pass this, which is the point: the cache is allowed to remove work and not allowed to change an answer.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SampleAsset } from "../data/sampleCatalogue";

/** Counted before the module under test is imported, so the wrapper is what the resolver calls. */
const { parseCalls } = vi.hoisted(() => ({ parseCalls: { count: 0 } }));

vi.mock("../audio/sfz/parse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../audio/sfz/parse")>();
  return {
    ...actual,
    parseSfz: (...args: Parameters<typeof actual.parseSfz>) => {
      parseCalls.count += 1;
      return actual.parseSfz(...args);
    },
  };
});

import { createSampleLoader } from "../audio/sampleLoader";
import { resolveInstrumentNote } from "../audio/sfz/instrument";

const fakeBuffer = (id: string) => ({ id } as unknown as AudioBuffer);
/** Absolute, because the loader resolves a region's `sample=` against the program's address (and never fetches here). */
const url = (name: string) => `https://example.invalid/samples/${name}.sfz`;

/**
 * One program, sixty regions, one per key 40–99 — the shape a piano program has and the shape that made the parse
 * expensive. Nothing here declares a loop, so `sampleLoader`'s `declaredSamples` really does read the text (and is the
 * second, legitimate parse).
 */
const SIXTY_KEYS = Array.from({ length: 60 }, (_, index) => `<region> sample=k${40 + index}.wav lokey=${40 + index} hikey=${40 + index} pitch_keycenter=${40 + index}`).join("\n");

const KEYS: SampleAsset[] = [{ assetId: "sixty", name: "Sixty", kind: "one-shot", seconds: 1, sfz: { url: url("sixty") } }];

const otherProgram = (assetId: string) =>
  ({ assetId, name: assetId, kind: "one-shot", seconds: 1, sfz: { url: url(assetId) } }) as SampleAsset;

const TEXT_A = "<region> sample=a.wav lokey=0 hikey=127 pitch_keycenter=60";
const TEXT_B = "<region> sample=b.wav lokey=0 hikey=127 pitch_keycenter=60";

beforeEach(() => {
  parseCalls.count = 0;
});

describe("one program is parsed once, and never across assets", () => {
  it("⭐⭐ sixty notes through one program parse its text at most twice — not once per note", async () => {
    const loader = createSampleLoader(async (asset) => fakeBuffer(asset.assetId), KEYS, async () => SIXTY_KEYS);
    // Every note resolved, so the count is about the parse rather than about notes that never got that far.
    const resolved = [];
    for (let note = 40; note < 100; note += 1) resolved.push((await loader.loadNote("sixty", note)).samplePath);
    expect(resolved).toHaveLength(60);
    expect(new Set(resolved).size, "each note reached its own region, so this is a real sixty-note read").toBe(60);

    // Before the program-facts cache this was 61 (sixty resolutions plus `declaredSamples`).
    expect(parseCalls.count, `parseSfz ran ${parseCalls.count} time(s) for one program and sixty notes`).toBeLessThanOrEqual(2);
    expect(parseCalls.count).toBeGreaterThan(0);
  });

  it("keeps two programs apart: each asset answers from its own text, interleaved", () => {
    const first = otherProgram("first");
    const second = otherProgram("second");
    expect(resolveInstrumentNote(first, TEXT_A, 60).note?.samplePath).toBe("a.wav");
    expect(resolveInstrumentNote(second, TEXT_B, 60).note?.samplePath).toBe("b.wav");
    // Back to the first, after the second was cached: a cache keyed by anything but the entry would answer b.wav here.
    expect(resolveInstrumentNote(first, TEXT_A, 62).note?.samplePath).toBe("a.wav");
    expect(resolveInstrumentNote(second, TEXT_B, 62).note?.samplePath).toBe("b.wav");
  });

  it("does not serve stale facts when one asset object is handed a different program", () => {
    const shared = otherProgram("shared");
    expect(resolveInstrumentNote(shared, TEXT_A, 60).note?.samplePath).toBe("a.wav");
    expect(resolveInstrumentNote(shared, TEXT_B, 60).note?.samplePath).toBe("b.wav");
    expect(resolveInstrumentNote(shared, TEXT_A, 60).note?.samplePath).toBe("a.wav");
  });

  it("⭐ §26: the same twenty notes resolve to the same sample, ratio and root key as before the cache", () => {
    /**
     * Measured on the code **before** the program-facts cache existed, and pasted verbatim. `regions: 22` is carried
     * too, because "same sample" would also be true of a resolution that had silently lost most of the file.
     */
    const program = readFileSync(join("src", "test", "fixtures", "sfz", "vsco2ce", "ViolinEnsSusVib.sfz"), "utf8");
    const asset = { assetId: "vsco2ce:ViolinEnsSusVib", sfz: { url: "https://example.invalid/ViolinEnsSusVib.sfz" } };
    const expected: [note: number, sample: string, ratio: number, rootKey: number, regions: number][] = [
      [55, "VlnEns_susVib_G2_v2.wav", 1, 55, 22],
      [57, "VlnEns_susVib_A2_v2.wav", 1, 57, 22],
      [58, "VlnEns_susVib_B2_v2.wav", 0.9438743126816935, 59, 22],
      [60, "VlnEns_susVib_B2_v2.wav", 1.0594630943592953, 59, 22],
      [61, "VlnEns_susVib_D3_v2.wav", 0.9438743126816935, 62, 22],
      [62, "VlnEns_susVib_D3_v2.wav", 1, 62, 22],
      [64, "VlnEns_susVib_F#3_v2.wav", 0.8908987181403393, 66, 22],
      [65, "VlnEns_susVib_F#3_v2.wav", 0.9438743126816935, 66, 22],
      [66, "VlnEns_susVib_F#3_v2.wav", 1, 66, 22],
      [67, "VlnEns_susVib_F#3_v2.wav", 1.0594630943592953, 66, 22],
      [69, "VlnEns_susVib_A3_v2.wav", 1, 69, 22],
      [70, "VlnEns_susVib_A3_v2.wav", 1.0594630943592953, 69, 22],
      [71, "VlnEns_susVib_C4_v2.wav", 0.9438743126816935, 72, 22],
      [72, "VlnEns_susVib_C4_v2.wav", 1, 72, 22],
      [73, "VlnEns_susVib_C4_v2.wav", 1.0594630943592953, 72, 22],
      [74, "VlnEns_susVib_E4_v2.wav", 0.8908987181403393, 76, 22],
      [76, "VlnEns_susVib_E4_v2.wav", 1, 76, 22],
      [77, "VlnEns_susVib_E4_v2.wav", 1.0594630943592953, 76, 22],
      [79, "VlnEns_susVib_G4_v2.wav", 1, 79, 22],
      [81, "VlnEns_susVib_B4_v2.wav", 0.8908987181403393, 83, 22],
    ];
    const actual = expected.map(([note]) => {
      const resolved = resolveInstrumentNote(asset, program, note);
      return [
        note,
        resolved.note?.samplePath ?? null,
        resolved.note?.ratio ?? null,
        resolved.note?.rootKey ?? null,
        resolved.regions.length,
      ];
    });
    expect(actual).toEqual(expected);
  });
});
