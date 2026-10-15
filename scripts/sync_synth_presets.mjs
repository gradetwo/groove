#!/usr/bin/env node
/**
 * **Regenerate `src/data/synthPresets.generated.ts` from the synth's own preset library.**
 *
 * ## Why this exists rather than "load them at runtime"
 *
 * The synth's factory presets are **TypeScript modules** (`src/state/presets.ts`), and even its own MCP has to bundle
 * them through its build pipeline to read them (`mcp/lib/data.mjs` generates an entry and runs esbuild). This repository's
 * MCP is a separate Node process with no access to the synth's source, so a share code cannot be fetched at runtime
 * without **a synth that is actually running** — and the failure mode of that dependency is silent: groove would simply
 * have fewer presets than it claims, with nothing saying so.
 *
 * So the table is **generated data, not vendored source**: this script is the generator, the output is committed, and
 * `synthPresetsSync.test.ts` holds the answer in place. The review cost that made the original 91-preset integration
 * painful is not paid by a person reading 120 share codes — it is paid by `node scripts/sync_synth_presets.mjs` and a
 * one-line diff summary.
 *
 * ## What it does
 *
 * Runs the synth's MCP server over stdio and asks its own `gs1.presets.list` for the catalogue, then its own
 * `gs1.patch.get` for each preset's **share code**. Share codes are deterministic (measured: the same preset from two
 * separate server processes is byte-identical), which is what makes the committed table verifiable at all.
 *
 * Usage:
 *   node scripts/sync_synth_presets.mjs [--synth <path>] [--check]
 *
 * `--check` regenerates into memory and **exits non-zero** if the committed table differs, so CI or a test can hold it.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/data/synthPresets.generated.ts");

const flag = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
};
const SYNTH = path.resolve(flag("synth", process.env.GROOVE_SYNTH_DIR ?? "/home/crow/music/synth"));
const CHECK = process.argv.includes("--check");

/** One JSON-RPC round trip against the synth's MCP over stdio, per call — a fresh process, so nothing is cached across it. */
function callSynth(tool, args, { timeoutMs = 90_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["mcp/server.mjs"], { cwd: SYNTH, stdio: ["pipe", "pipe", "pipe"] });
    let buf = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (buf += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`the synth's MCP did not answer ${tool} within ${timeoutMs} ms — stderr: ${stderr.slice(-400)}`));
    }, timeoutMs);

    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "groove-sync", version: "1" } } });
    setTimeout(() => send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: args } }), 1200);
    setTimeout(() => {
      clearTimeout(timer);
      const line = buf.split("\n").find((row) => row.includes('"id":2'));
      child.kill();
      if (!line) return reject(new Error(`no reply to ${tool} — stderr: ${stderr.slice(-400)}`));
      try {
        const payload = JSON.parse(line);
        if (payload.error) return reject(new Error(`${tool}: ${payload.error.message ?? JSON.stringify(payload.error)}`));
        const text = payload.result?.content?.[0]?.text;
        if (payload.result?.isError || typeof text !== "string") return reject(new Error(`${tool}: ${text ?? "no text"}`));
        resolve(JSON.parse(text));
      } catch (error) {
        reject(new Error(`${tool}: could not read the reply (${error.message}) — ${line.slice(0, 200)}`));
      }
    }, 6000);
  });
}

async function build() {
  const list = await callSynth("gs1.presets.list", {});
  const presets = list.presets ?? list;
  if (!Array.isArray(presets) || presets.length === 0) throw new Error("the synth listed no presets");

  const rows = [];
  for (const preset of presets) {
    // Sequential on purpose: each call starts its own server process, and the synth's own loader is not built to be
    // hammered. 120 presets at roughly a second each is a couple of minutes, run by hand or by the check.
    const got = await callSynth("gs1.patch.get", { presetId: preset.id });
    if (typeof got.shareCode !== "string" || !got.shareCode.startsWith("gs1.1.")) {
      throw new Error(`preset "${preset.id}" produced no share code (got ${String(got.shareCode).slice(0, 24)})`);
    }
    rows.push({
      id: preset.id,
      name: preset.name,
      cat: preset.cat,
      tag: preset.tag ?? null,
      tags: preset.tags ?? [],
      wave: preset.wave ?? null,
      shareCode: got.shareCode,
    });
    process.stderr.write(`\r[sync] ${rows.length}/${presets.length} ${preset.id}          `);
  }
  process.stderr.write("\n");
  return rows;
}

/** The committed file, formatted so its diff is stable and readable. */
function render(rows) {
  const cats = [...new Set(rows.map((row) => row.cat))].sort();
  const body = rows
    .map(
      (row) =>
        `  { id: ${JSON.stringify(row.id)}, name: ${JSON.stringify(row.name)}, cat: ${JSON.stringify(row.cat)}, ` +
        `tag: ${row.tag === null ? "null" : JSON.stringify(row.tag)}, wave: ${row.wave === null ? "null" : JSON.stringify(row.wave)}, ` +
        `shareCode: ${JSON.stringify(row.shareCode)} },`
    )
    .join("\n");
  return `/**
 * ⭐ **GENERATED — do not edit by hand. Run \`node scripts/sync_synth_presets.mjs\`.**
 *
 * The synth project's whole factory library, as share codes: ${rows.length} presets across ${cats.length} categories
 * (${cats.join(", ")}). Read out of the synth's own \`gs1.presets.list\` and \`gs1.patch.get\` over MCP by
 * \`scripts/sync_synth_presets.mjs\`, so this file is **data produced by a generator**, never a transcription.
 *
 * Share codes are deterministic — measured: the same preset asked for twice, from two separate server processes, is
 * byte-identical — which is what makes a committed table verifiable instead of merely trusted. \`--check\` regenerates and
 * fails on any difference, and \`synthPresetsSync.test.ts\` pins the shape CI can check without a synth present.
 *
 * ⚠️ **The categories are the synth's own** (\`PRESET_CATEGORIES\`), not an invented taxonomy: a second set of names would
 * mean groove's selector and the synth's drawer disagree about what a preset is, which is exactly the drift this file
 * exists to avoid.
 */
export const SYNTH_PRESET_CATEGORIES = [${cats.map((cat) => JSON.stringify(cat)).join(", ")}] as const;
export type SynthPresetCategory = (typeof SYNTH_PRESET_CATEGORIES)[number];

export interface SynthPreset {
  /** The synth's own preset id, which is how a caller names it. */
  id: string;
  /** Its display name, bilingual as the synth ships it. */
  name: string;
  /** The synth's \`cat\`, one of {@link SYNTH_PRESET_CATEGORIES}. */
  cat: SynthPresetCategory;
  /** The finer \`tag\` (a style, e.g. \`FUTURE BASS\`), or null. */
  tag: string | null;
  /** The oscillator wave the preset starts from, or null. */
  wave: string | null;
  /** The \`gs1.1.…\` share code, exactly as the synth printed it. */
  shareCode: string;
}

export const SYNTH_PRESETS: readonly SynthPreset[] = [
${body}
] as const;

/** The preset a caller names, or \`undefined\` — so a tool can refuse an unknown id instead of guessing a voice. */
export function synthPresetById(id: string): SynthPreset | undefined {
  return SYNTH_PRESETS.find((preset) => preset.id === id);
}

/** The presets in one category, in the synth's own order. */
export function synthPresetsInCategory(cat: SynthPresetCategory): readonly SynthPreset[] {
  return SYNTH_PRESETS.filter((preset) => preset.cat === cat);
}
`;
}

const rows = await build();
const next = render(rows);

if (CHECK) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    console.error(`✗ ${path.relative(ROOT, OUT)} is missing — run node scripts/sync_synth_presets.mjs`);
    process.exit(1);
  }
  if (current !== next) {
    console.error(`✗ ${path.relative(ROOT, OUT)} differs from the synth's own answer — run the sync`);
    process.exit(1);
  }
  console.log(`✅ synth presets in sync — ${rows.length} presets, ${new Set(rows.map((row) => row.cat)).size} categories`);
  process.exit(0);
}

writeFileSync(OUT, next);
console.log(`✅ wrote ${path.relative(ROOT, OUT)} — ${rows.length} presets, ${new Set(rows.map((row) => row.cat)).size} categories`);
