import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP_VERSION } from "../src/version";
import { MEASURED_RENDER_COST } from "./render/budget";
import { PROMPTS, RESOURCES, TOOLS } from "./registry";

/**
 * ⭐ **A debug bundle: what a problem needs, collected on demand and written as one file.**
 *
 * The collection is a **whitelist**. It never dumps the environment, a home directory path, a token or any work content,
 * because a bundle a composer sends for analysis must be safe to send without reading it first. What it cannot collect it
 * names in `omissions` with the reason, so a gap is a stated fact rather than a silence.
 */
export interface DebugBundleResult {
  path: string;
  filename: string;
  bytes: number;
  sections: string[];
  omitted: string[];
}

export interface DebugBundleInput {
  outputDir?: string;
  note?: string;
}

const MANIFEST = [
  { section: "collectedAt", what: "when this bundle was written", why: "a reading is only meaningful with its time" },
  { section: "appVersion", what: "the application version", why: "behaviour changes between versions" },
  { section: "runtime", what: "platform, architecture and Node version", why: "many failures are host-specific" },
  { section: "surface", what: "how many tools, resources and prompts are declared", why: "a missing tool is visible as a smaller number" },
  { section: "budget", what: "the measured render costs the tool prose quotes", why: "a slow render is compared against a measured figure, not a guess" },
  { section: "env", what: "whether the output directory variable is set, never its value", why: "the value contains a home path and the fact is what matters" },
  { section: "note", what: "the reporter's own words, when given", why: "what the person saw is the one thing no instrument records" },
];

const OMITTED = [
  "arrangement summary: this version has no listing function, only a lookup by id, so no arrangement counts are reported",
  "recent failures: this version keeps no ring buffer of failed replies, so none are reported",
];

export function collectDebugBundle(input: DebugBundleInput = {}): DebugBundleResult {
  const dir = input.outputDir || process.env.GROOVE_MCP_OUT || mkdtempSync(path.join(os.tmpdir(), "groove-debug-"));
  mkdirSync(dir, { recursive: true });
  const collectedAt = new Date().toISOString();
  const bundle = {
    collectedAt,
    appVersion: APP_VERSION,
    runtime: { platform: process.platform, arch: process.arch, node: process.version },
    surface: { tools: TOOLS.length, resources: RESOURCES.length, prompts: PROMPTS.length },
    budget: MEASURED_RENDER_COST,
    env: { GROOVE_MCP_OUT: process.env.GROOVE_MCP_OUT ? "set" : "unset" },
    ...(input.note ? { note: input.note } : {}),
    manifest: MANIFEST,
    omissions: OMITTED,
  };
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  const filename = `groove-debug-${collectedAt.replace(/[:.]/g, "-")}.json`;
  const file = path.join(dir, filename);
  writeFileSync(file, json);
  return {
    path: file,
    filename,
    bytes: Buffer.byteLength(json),
    sections: Object.keys(bundle),
    omitted: OMITTED.map((line) => line.split(":")[0]!),
  };
}
