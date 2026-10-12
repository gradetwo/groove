#!/usr/bin/env node
/**
 * Which catalogue instrument actually *reports* the articulation a keyswitch selected?
 *
 * `switchState` / `switchLabel` are produced by the SFZ resolver (`src/audio/sfz/regionPlayback.ts`) and carried by
 * `sampleLoader.loadNote`. The MCP surface is where they have to arrive for a caller to see them. This probe answers
 * "is there a reachable instrument that has any to show, and which note shows them" **without decoding a sample**:
 * it fetches the program, expands its includes and runs `resolveInstrumentNote`, which is the exact call `loadNote`
 * makes before it touches a byte of audio.
 *
 *     npx vite-node scripts/probe_sfz_keyswitch_mcp.ts -- --asset=karoryfer-black-and-blue-basses:01-darkblack-keysw --notes=36,40,48
 *     npx vite-node scripts/probe_sfz_keyswitch_mcp.ts -- --query=keyswitch --notes=40,48,60,72
 *
 * A reading harness, not a gate: what it prints is a fact about the pinned libraries at the commit the manifest names,
 * and the reachable set can change when the manifest does.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogueFromManifestText } from "../src/data/sampleCatalogue";
import { expandRemoteIncludes } from "../src/audio/sfz/remoteIncludes";
import { resolveInstrumentNote } from "../src/audio/sfz/instrument";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const arg = (name: string, fallback?: string): string | undefined => {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
};
const argAll = (name: string): string[] => process.argv.filter((a) => a.startsWith(`${name}=`)).map((a) => a.slice(name.length + 1));

const wantAssets = argAll("--asset");
const query = (arg("--query") ?? "").toLowerCase();
const notes = (arg("--notes", "40,48,60,72") ?? "").split(",").map(Number).filter((n) => Number.isFinite(n));

const text = readFileSync(path.join(ROOT, "public", "samples", "manifest.json"), "utf8");
const { assets, problems } = catalogueFromManifestText(text, process.env.GROOVE_SAMPLE_ROOT ?? "");
if (problems.length) console.log(`catalogue problems: ${problems.join(" | ")}`);

const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
const wanted = wantAssets.length
  ? wantAssets.map((id) => byId.get(id)).filter((asset): asset is NonNullable<typeof asset> => asset !== undefined)
  : assets.filter(
      (asset) =>
        asset.sfz !== undefined &&
        (query === "" || asset.assetId.toLowerCase().includes(query) || (asset.sfz.path ?? "").toLowerCase().includes(query))
    );

console.log(`${wanted.length} instrument(s) to probe, notes ${notes.join(",")}`);

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.text();
};

for (const asset of wanted) {
  const url = asset.sfz!.url;
  let expanded;
  try {
    const programme = new URL(url);
    const programPath = programme.pathname.split("/").filter(Boolean).pop() ?? "program.sfz";
    const libraryBase = new URL(".", programme).toString();
    const raw = await fetchText(url);
    expanded = await expandRemoteIncludes(raw, { fetchText, programUrl: programPath, baseUrl: libraryBase });
  } catch (error) {
    console.log(`skip ${asset.assetId}: ${(error as Error).message}`);
    continue;
  }
  const rows: string[] = [];
  for (const note of notes) {
    const resolution = resolveInstrumentNote(asset, expanded.text, note);
    if (!resolution.ok) {
      rows.push(`  note ${note}: no playback — ${resolution.reason}`);
      continue;
    }
    const info = resolution.note;
    rows.push(
      `  note ${note}: switchState=${info.switchState ?? "-"} switchLabel=${JSON.stringify(info.switchLabel ?? null)} sample=${info.samplePath}`
    );
  }
  const anySwitch = rows.some((row) => !row.includes("switchState=- "));
  console.log(`${anySwitch ? "SWITCH" : "no-switch"} ${asset.assetId} (regions=${expanded.text.length ? "expanded" : "?"}, missing=${expanded.missing.length})`);
  console.log(rows.join("\n"));
}
