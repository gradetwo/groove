/**
 * GS-1 vendored-core contract (ABI 8).
 *
 * The Node-side gate is `scripts/check-gs1.mjs`; this file gives the same
 * contract a normal test-suite signal so `npm run test` catches a drifted or
 * badly built vendored core even where the gate is not wired in.
 *
 * Contract, read out of the module rather than trusted from the manifest:
 *   - every file listed in `vendor/gs1/UPSTREAM.json` exists with a matching
 *     SHA-256;
 *   - each `.wasm` validates and instantiates under Node;
 *   - `gs_abi_version()` / `gs_max_voices()` / `gs_max_block_size()` /
 *     `gs_spectrum_bins()` match the pinned ABI and the documented contract;
 *   - the core renders a note without silence and reports zero allocation
 *     violations;
 *   - the vendored parameter table declares no duplicate ids.
 *
 * If the core has not been vendored (no `UPSTREAM.json`), the suite skips with
 * the reason rather than faking anything — the artifacts are build outputs and
 * a checkout without them is a legitimate state.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Locating the vendored core
// ---------------------------------------------------------------------------

function repoRoot(): string {
  // Under vitest's jsdom environment `import.meta.url` can be an http URL, so
  // fall back to the process cwd (the suite runs from the repo root).
  try {
    if (import.meta.url.startsWith("file:")) {
      return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    }
  } catch {
    /* fall through */
  }
  return process.cwd();
}

const VENDOR_ROOT = path.join(repoRoot(), "vendor", "gs1");
const MANIFEST_PATH = path.join(VENDOR_ROOT, "UPSTREAM.json");
const PARAMS_REL = "src/audio/params.ts";
const PRIMARY_WASM = "src/generated/synth_core.wasm";

/**
 * Files in vendor/gs1 that are ours, not upstream copies, and so unhashed.
 *
 * `THIRD_PARTY_NOTICES.md` is here because the attribution for the libraries linked into the
 * WASM core is a *compliance gap in the upstream artifacts*: GS-1 ships its own MIT LICENSE
 * but neither DaisySP's nor Soundpipe's notice, so the bundled core cannot legally be
 * redistributed without us supplying it. `gs1Attribution.test.ts` checks the content.
 */
const LOCAL_METADATA = new Set(["UPSTREAM.json", "README.md", "THIRD_PARTY_NOTICES.md"]);

/** The published ABI contract this integration is written against (GS-1 v8). */
const EXPECTED = {
  abiVersion: 8,
  maxVoices: 32,
  maxBlockSize: 1024,
  spectrumBins: 36,
};

interface ManifestFile {
  sha256: string;
  bytes: number;
}

interface Manifest {
  abi: number;
  upstream?: { name?: string; version?: string; commit?: string; license?: string };
  files: Record<string, ManifestFile>;
}

const manifest: Manifest | null = existsSync(MANIFEST_PATH)
  ? (JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest)
  : null;

if (!manifest) {
  console.warn(
    "[gs1Contract] SKIP: vendor/gs1/UPSTREAM.json not found — the GS-1 core is not vendored. " +
      "Build it upstream (`cd <gs1> && npm run build:wasm`) then run " +
      "`node scripts/sync-gs1.mjs --from <gs1>`.",
  );
}

function requireManifest(): Manifest {
  if (!manifest) throw new Error("vendor/gs1/UPSTREAM.json is not present");
  return manifest;
}

function sha256(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function wasmFiles(m: Manifest): string[] {
  return Object.keys(m.files).filter((rel) => rel.endsWith(".wasm"));
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs));
    else out.push(abs);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Core loading (typed view over the block ABI)
// ---------------------------------------------------------------------------

interface CoreExports {
  memory: WebAssembly.Memory;
  gs_abi_version(): number;
  gs_max_voices(): number;
  gs_max_block_size(): number;
  gs_spectrum_bins(): number;
  gs_init(sampleRate: number, maxVoices: number): void;
  gs_set_param(id: number, value: number): void;
  gs_note_on(note: number, velocity: number): void;
  gs_note_off(note: number): void;
  gs_all_notes_off(): void;
  gs_process(frames: number): void;
  gs_left_ptr(): number;
  gs_right_ptr(): number;
  gs_alloc_violations(): number;
  gs_reset_alloc_violations(): void;
}

function instantiate(rel: string): { raw: WebAssembly.Exports; ex: CoreExports } {
  const bytes = readFileSync(path.join(VENDOR_ROOT, rel));
  const raw = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports;
  return { raw, ex: raw as unknown as CoreExports };
}

// ---------------------------------------------------------------------------
// Parameter table
// ---------------------------------------------------------------------------

interface ParamTable {
  entries: Array<[string, number]>;
  byName: Map<string, number>;
  duplicateIds: string[];
  duplicateNames: string[];
}

function parseParamTable(source: string): ParamTable {
  const start = source.indexOf("export const Param = {");
  const end = start === -1 ? -1 : source.indexOf("} as const;", start);
  if (start === -1 || end === -1) return { entries: [], byName: new Map(), duplicateIds: [], duplicateNames: [] };
  const body = source.slice(start, end);
  const entries = [...body.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(-?\d+)\s*,/gm)].map(
    (match) => [match[1], Number(match[2])] as [string, number],
  );

  const byName = new Map<string, number>();
  const byId = new Map<number, string>();
  const duplicateNames: string[] = [];
  const duplicateIds: string[] = [];
  for (const [name, id] of entries) {
    if (byName.has(name)) duplicateNames.push(name);
    byName.set(name, id);
    if (byId.has(id)) duplicateIds.push(`${id} (${byId.get(id)} and ${name})`);
    else byId.set(id, name);
  }
  return { entries, byName, duplicateIds, duplicateNames };
}

// ---------------------------------------------------------------------------

describe.skipIf(!manifest)("GS-1 vendored core contract", () => {
  it("pins the ABI 8 core with upstream provenance", () => {
    const m = requireManifest();
    expect(m.abi).toBe(EXPECTED.abiVersion);
    expect(m.upstream?.version).toBeTruthy();
    expect(m.upstream?.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("hash-lists every vendored file, and only vendored files", () => {
    const m = requireManifest();
    expect(Object.keys(m.files).length).toBeGreaterThan(0);

    for (const [rel, meta] of Object.entries(m.files)) {
      const abs = path.join(VENDOR_ROOT, rel);
      expect(existsSync(abs), `missing vendored file: ${rel}`).toBe(true);
      const bytes = readFileSync(abs);
      expect(bytes.length, `size of ${rel}`).toBe(meta.bytes);
      expect(sha256(bytes), `sha256 of ${rel}`).toBe(meta.sha256);
    }

    const unexpected = walkFiles(VENDOR_ROOT)
      .map((abs) => path.relative(VENDOR_ROOT, abs).split(path.sep).join("/"))
      .filter((rel) => !(rel in m.files) && !LOCAL_METADATA.has(rel));
    expect(unexpected, "unlisted files under vendor/gs1").toEqual([]);
  });

  it("validates and instantiates every vendored core", () => {
    const m = requireManifest();
    const cores = wasmFiles(m);
    expect(cores.length).toBeGreaterThan(0);
    for (const rel of cores) {
      const bytes = readFileSync(path.join(VENDOR_ROOT, rel));
      expect(WebAssembly.validate(bytes), `${rel} does not validate`).toBe(true);
      expect(() => new WebAssembly.Module(bytes), `${rel} does not compile`).not.toThrow();
    }
  });

  it("reads the ABI contract out of the module", () => {
    const m = requireManifest();
    const { raw, ex } = instantiate(PRIMARY_WASM);

    for (const fn of ["gs_abi_version", "gs_max_voices", "gs_max_block_size", "gs_spectrum_bins"]) {
      expect(typeof raw[fn], `missing export ${fn}`).toBe("function");
    }

    expect(ex.gs_abi_version()).toBe(m.abi);
    expect(ex.gs_abi_version()).toBe(EXPECTED.abiVersion);
    expect(ex.gs_max_voices()).toBe(EXPECTED.maxVoices);
    expect(ex.gs_max_block_size()).toBe(EXPECTED.maxBlockSize);
    expect(ex.gs_spectrum_bins()).toBe(EXPECTED.spectrumBins);

    for (const rel of wasmFiles(m)) {
      const other = instantiate(rel).ex;
      expect(other.gs_abi_version(), `${rel} ABI`).toBe(m.abi);
    }
  });

  it("records which per-note controls the pinned core does and does not export", () => {
    /**
     * A3's GS-1 half needs a **per-note** timbre parameter, and this is where that stands — measured out of the
     * shipped binary rather than assumed, because the adapter and the processor disagree about it in a way that costs
     * an afternoon to untangle:
     *
     *   · `public/gs1/workletProcessor.js` **handles** `noteBend` and `tuning`, calling `gs_note_bend` and
     *     `gs_set_tuning_note` behind `if (this.wasm.…)` guards;
     *   · the vendored **engine** (v2.1.6) offers `noteBend(note, semitones)` and `setTuning(table)`;
     *   · the shipped **core** exports neither — its 104 exports include `gs_note_on`, `gs_note_on_pan`,
     *     `gs_note_off`, `gs_pitch_bend`, `gs_set_param` and `gs_set_param_inst`, and the two functions the guards
     *     test for are absent, so those branches are dead with this pin.
     *
     * `Gs1Host` is therefore right to say "no notesBend / microtuning", and per-note timbre on GS-1 needs an
     * **upstream ABI bump** (a core that exports them) rather than more host code. This case fails the day the pin
     * gains either export, which is the prompt to expose it in the adapter and finish A3's GS-1 half instead of
     * rediscovering why it was impossible.
     */
    const { raw } = instantiate(PRIMARY_WASM);
    for (const fn of ["gs_note_on", "gs_note_on_pan", "gs_note_off", "gs_pitch_bend", "gs_set_param"]) {
      expect(typeof raw[fn], `expected export ${fn}`).toBe("function");
    }
    for (const fn of ["gs_note_bend", "gs_set_tuning_note"]) {
      expect(raw[fn], `${fn} is not in the pin yet — if it appears, expose it in Gs1Host`).toBeUndefined();
    }
  });

  it("has no duplicate parameter ids", () => {
    const table = parseParamTable(readFileSync(path.join(VENDOR_ROOT, PARAMS_REL), "utf8"));
    expect(table.entries.length).toBeGreaterThan(0);
    expect(table.duplicateNames).toEqual([]);
    expect(table.duplicateIds).toEqual([]);
    expect(table.byName.get("MASTER_VOLUME")).toBe(0);
  });

  it("renders a note without silence and with no allocation violations", () => {
    const { ex } = instantiate(PRIMARY_WASM);
    const table = parseParamTable(readFileSync(path.join(VENDOR_ROOT, PARAMS_REL), "utf8"));
    const id = (name: string): number => {
      const value = table.byName.get(name);
      if (value === undefined) throw new Error(`parameter ${name} is missing from the vendored table`);
      return value;
    };

    ex.gs_init(48000, 16);
    for (const [param, value] of [
      [id("MASTER_VOLUME"), 0.8],
      [id("OSC1_ON"), 1],
      [id("OSC1_WAVE"), 0], // sine
      [id("OSC1_LEVEL"), 1],
      [id("OSC1_DETUNE"), 0],
      [id("OSC2_ON"), 0],
      [id("FILTER_TYPE"), 0],
      [id("FILTER_CUTOFF"), 20000],
      [id("FILTER_RES"), 0],
      [id("FILTER_ENV_AMT"), 0],
      [id("ENV_ATTACK"), 0.001],
      [id("ENV_SUSTAIN"), 1],
      [id("LFO_ON"), 0],
      [id("FX_REVERB_ON"), 0],
      [id("FX_DELAY_ON"), 0],
    ] as Array<[number, number]>) {
      ex.gs_set_param(param, value);
    }

    ex.gs_all_notes_off();
    ex.gs_note_on(69, 1); // A4
    let peak = 0;
    for (let block = 0; block < 40; block += 1) {
      ex.gs_process(128);
      const frame = new Float32Array(ex.memory.buffer, ex.gs_left_ptr(), 128);
      for (const sample of frame) peak = Math.max(peak, Math.abs(sample));
    }
    expect(peak).toBeGreaterThan(0.01);

    ex.gs_reset_alloc_violations();
    for (let block = 0; block < 200; block += 1) ex.gs_process(128);
    expect(ex.gs_alloc_violations()).toBe(0);
    ex.gs_all_notes_off();
  });
});

if (!manifest) {
  // Keep the skip visible in the reporter even though the suite is empty.
  describe("GS-1 vendored core contract (skipped)", () => {
    it.skip("vendor/gs1 is not populated — run scripts/sync-gs1.mjs", () => {});
  });
}
