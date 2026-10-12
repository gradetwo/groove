/**
 * ⭐ **See the sample cache, and clear it.**
 *
 * The persistent cache is a directory the server writes without being asked, so it needs a way to be looked at and a way to be
 * emptied that does not involve knowing where it is. Both are here:
 *
 *     npm run cache:stats                       # where it is, how many entries, how many bytes
 *     npm run cache:clear                       # delete every cached file
 *     npx vite-node scripts/sample_cache.mjs --stats --dir /somewhere
 *
 * (It runs under `vite-node`, like every other script in this repository that imports a `.ts` module by path —
 * `check:css`, `check:docs:refs`, `probe:headless`. `npm run cache:stats` is the spelling; a bare `node` cannot import the
 * module that owns the directory rule, and a second copy of that rule here is exactly what this file exists to avoid.)
 *
 * The bound is `GROOVE_SAMPLE_CACHE_BYTES` (default 512 MB) and the directory is `GROOVE_SAMPLE_CACHE`, else the OS's own
 * per-user cache directory — **never `/tmp`**, see `mcp/render/sampleCache.ts` for why. `--dir` overrides for one run so the two
 * questions ("what is in the default cache" and "what is in this measured one") cannot be confused.
 *
 * Why a script rather than an MCP tool: the cache is server infrastructure, not a composing tool, and every tool added to the
 * surface is a tool a model may call by mistake. `GROOVE_SAMPLE_CACHE=off` disables it for one process.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveSampleCacheDirectory, resolveSampleCacheBytes, readUsage } from "../mcp/render/sampleCache.ts";

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const valueOf = (flag) => {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
};

const directoryOverride = valueOf("--dir");
if (directoryOverride) process.env.GROOVE_SAMPLE_CACHE = path.resolve(directoryOverride);

const directory = resolveSampleCacheDirectory();
const limit = resolveSampleCacheBytes();

if (directory === null) {
  console.log("sample cache: OFF (`GROOVE_SAMPLE_CACHE` disables it for this process)");
  process.exit(0);
}

if (has("--clear")) {
  let removed = 0;
  let bytes = 0;
  for (const name of fs.readdirSync(directory)) {
    if (!name.endsWith(".bin")) continue;
    const file = path.join(directory, name);
    try {
      bytes += fs.statSync(file).size;
      fs.rmSync(file);
      removed += 1;
    } catch {
      /* leave what cannot be removed */
    }
  }
  console.log(`✅ cleared ${removed} entr${removed === 1 ? "y" : "ies"} (${(bytes / 1024 / 1024).toFixed(1)} MB) from ${directory}`);
  process.exit(0);
}

const usage = readUsage(directory);
console.log(`sample cache : ${directory}`);
console.log(`entries      : ${usage.entries}`);
console.log(`bytes        : ${usage.bytes} (${(usage.bytes / 1024 / 1024).toFixed(1)} MB)`);
console.log(`limit        : ${limit === null ? "none" : `${limit} (${(limit / 1024 / 1024).toFixed(0)} MB)`}`);
console.log(`over limit   : ${limit !== null && limit > 0 && usage.bytes > limit ? "yes — the next download sweeps" : "no"}`);
