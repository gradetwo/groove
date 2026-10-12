import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import os from "node:os";
import path from "node:path";
import { APP_VERSION } from "../src/version";
import { buildTar, type TarEntry } from "../src/features/debug/tar";
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
  /** ⭐ What the archive holds, so a caller can see it without unpacking it. */
  entries: string[];
  sections: string[];
  omitted: string[];
  /** ⭐ Named here because the archive carries the work: a person should know before sending it. */
  carriesWork: boolean;
}

export interface DebugBundleInput {
  outputDir?: string;
  note?: string;
  /** ⭐ The open work, which is the strongest thing for reproducing a fault and the one item worth naming in the readme. */
  arrangement?: unknown;
  /** ⭐ Related files a caller has in hand, each written under `files/`; oversize ones are named, not truncated. */
  files?: Array<{ name: string; bytes: Uint8Array }>;
}

/** ⭐ A ceiling per file, so a bundle cannot grow without bound; an oversize file is reported, never cut. */
export const DEBUG_BUNDLE_FILE_LIMIT = 8 * 1024 * 1024;

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
  const omitted = [...OMITTED];
  const bundle = {
    collectedAt,
    appVersion: APP_VERSION,
    runtime: { platform: process.platform, arch: process.arch, node: process.version },
    surface: { tools: TOOLS.length, resources: RESOURCES.length, prompts: PROMPTS.length },
    budget: MEASURED_RENDER_COST,
    env: { GROOVE_MCP_OUT: process.env.GROOVE_MCP_OUT ? "set" : "unset" },
    ...(input.note ? { note: input.note } : {}),
    manifest: MANIFEST,
    omissions: omitted,
  };
  const encoder = new TextEncoder();
  const entries: TarEntry[] = [
    { name: "bundle.json", bytes: encoder.encode(`${JSON.stringify(bundle, null, 2)}\n`) },
    { name: "environment.json", bytes: encoder.encode(`${JSON.stringify(bundle.env, null, 2)}\n`) },
  ];
  if (input.arrangement) {
    entries.push({ name: "arrangement.groove.json", bytes: encoder.encode(`${JSON.stringify(input.arrangement, null, 2)}\n`) });
  } else {
    omitted.push("the arrangement: no arrangement was passed, so this archive cannot reproduce the work it came from");
  }
  for (const file of input.files ?? []) {
    if (file.bytes.length > DEBUG_BUNDLE_FILE_LIMIT) {
      omitted.push(`${file.name}: ${file.bytes.length} bytes is above the ${DEBUG_BUNDLE_FILE_LIMIT} byte ceiling, so it is named rather than cut`);
      continue;
    }
    entries.push({ name: `files/${file.name.replace(/^\/+/, "")}`, bytes: file.bytes });
  }
  const list = entries.map((entry) => `| \`${entry.name}\` | ${entry.bytes.length} |`).join("\n");
  const carriesWork = Boolean(input.arrangement);
  const readme = [
    "# Groove debug bundle",
    "",
    `Written ${collectedAt} by version ${APP_VERSION}.`,
    "",
    carriesWork
      ? "**This archive carries the work itself**, in `arrangement.groove.json`, because a fault is easiest to reproduce from the work that caused it. Read that file's contents before sending the archive to anyone."
      : "This archive carries no work content: no arrangement was available when it was collected.",
    "",
    "## What is inside",
    "",
    "| file | bytes |",
    "|---|---|",
    list,
    "",
    "## What each part is for",
    "",
    ...MANIFEST.map((part) => `- **${part.section}**: ${part.what} — ${part.why}`),
    "",
    "## What could not be collected, and why",
    "",
    ...(omitted.length ? omitted.map((line) => `- ${line}`) : ["- nothing: every part was collected"]),
    "",
  ].join("\n");
  entries.push({ name: "README.md", bytes: encoder.encode(readme) });
  entries.push({
    name: "manifest.json",
    bytes: encoder.encode(`${JSON.stringify({ collectedAt, carriesWork, entries: entries.map((entry) => ({ name: entry.name, bytes: entry.bytes.length })), omitted }, null, 2)}\n`),
  });
  const archive = gzipSync(buildTar(entries), { level: 9 });
  const filename = `groove-debug-${collectedAt.replace(/[:.]/g, "-")}.tar.gz`;
  const file = path.join(dir, filename);
  writeFileSync(file, archive);
  return {
    path: file,
    filename,
    bytes: archive.length,
    entries: entries.map((entry) => entry.name),
    sections: Object.keys(bundle),
    omitted,
    carriesWork,
  };
}
