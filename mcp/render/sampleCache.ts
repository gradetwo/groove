/**
 * ⭐ **The samples a render downloaded are on disk, so the next render does not download them again.**
 *
 * ## The defect this removes, measured
 *
 * `createSampleLoader` keeps a decode cache and an expanded-program cache, and **both die with the loader**
 * (`src/audio/sharedSamplerLoader.ts` says the same thing about the Web session and answers it with a `WeakMap` per context).
 * On the MCP render path that is not enough:
 *
 *   · every `render_arrangement` / `render_song` call builds a **fresh** loader — `mcp/render/worker.ts`'s headless branch of
 *     `renderAudio`, and `src/audio/WavExporter.ts`, where `renderPatternOffline` builds its own — so a second render of one
 *     arrangement pays for every byte again. Measured on a three-bar `chicago-house` song, twice in one server process:
 *     **134 requests, then the same 134 requests again**, with all 134 URLs fetched more than once;
 *   · `render_arrangement_stems` calls `renderPatternOffline` **once per track** (`mcp/render/worker.ts`, the stem loop), so an
 *     N-track arrangement downloads and decodes the whole set **N times** — the owner's "被重复下载 5 次".
 *
 * ## What is stored, and why the bytes rather than the decoded buffer
 *
 * **The downloaded bytes.** A decoded buffer belongs to the `BaseAudioContext` that produced it — `decodeAudioData` is a method
 * on that context and the buffer it returns can be played by no other — so a decoded buffer is not portable across renders
 * even inside one process, let alone across processes. The bytes are the portable half, and the decode that follows is a local,
 * CPU-only step whose cost this module measures **separately** (the owner's boundary note: the ~23 s was never split into
 * download and decode).
 *
 * ## Where it lives, and how it is bounded
 *
 * The directory is `GROOVE_SAMPLE_CACHE`, else the OS's own per-user cache directory (`%LOCALAPPDATA%` on Windows,
 * `~/Library/Caches` on macOS, `$XDG_CACHE_HOME` or `~/.cache` elsewhere) under `groove-samples`. **It is never `/tmp`**: the
 * owner measured a 7.8 GB memory-backed `/tmp` filling up and blocking the toolchain, and a cache that has to be re-earned
 * after every boot is not a persistent cache at all. `os.tmpdir()` is deliberately not consulted on any platform, so a host
 * with `TMPDIR` pointed somewhere small cannot move it there.
 *
 * The size bound is `GROOVE_SAMPLE_CACHE_BYTES` (default {@link DEFAULT_SAMPLE_CACHE_BYTES}), enforced by **whole-file LRU**:
 * a read touches the file (`utimes`), a write sweeps the least recently used entries until the directory fits. Nothing here
 * grows without a bound, and the bound is inspectable and escapable: `node scripts/sample_cache.mjs --stats` / `--clear`, and
 * `GROOVE_SAMPLE_CACHE=off` to disable it for one process.
 *
 * ⚠️ **A failure is never cached.** Only a 2xx response with a non-empty body is written, so a transient 502 does not become a
 * permanently broken sample — the rule `sampleLoader` states for its two in-memory caches, kept here because a disk cache is
 * exactly where that mistake becomes permanent.
 *
 * ## The key, and why it is not the URL
 *
 * `src/audio/sampleCacheKey.ts` owns that decision and states the evidence; in one sentence, the key is the asset's id or the
 * library-relative path **plus the pin the library is addressed by**, with the host dropped — so a mirror move is a cache hit
 * and two libraries on one host cannot collide.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { sampleCacheKey, programCacheKey } from "../../src/audio/sampleCacheKey";
import type { SampleAsset } from "../../src/data/sampleCatalogue";
import type { DecodedSample } from "../../src/audio/sampleLoader";

/** 512 MB. The whole pinned set is a few hundred megabytes, so an ordinary session never evicts anything it still needs. */
export const DEFAULT_SAMPLE_CACHE_BYTES = 512 * 1024 * 1024;

/** `off` / `0` / `false` / `no` disables the cache for one process, which is what measuring the *cold* path needs. */
const DISABLED = new Set(["off", "0", "false", "no"]);

/** The per-user cache directory, from the OS rather than from `$TMPDIR` — see the header. */
function userCacheRoot(): string {
  const home = os.homedir();
  if (process.platform === "win32") return process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
  if (process.platform === "darwin") return path.join(home, "Library", "Caches");
  return process.env.XDG_CACHE_HOME ?? path.join(home, ".cache");
}

/** Where the cache is, or `null` when it is off for this process. The string `--stats` prints and the criteria assert on. */
export function resolveSampleCacheDirectory(): string | null {
  const configured = process.env.GROOVE_SAMPLE_CACHE?.trim();
  if (configured && DISABLED.has(configured.toLowerCase())) return null;
  if (configured) return path.resolve(configured);
  return path.join(userCacheRoot(), "groove-samples");
}

/** The byte bound in force, or `null` when the cache is off or explicitly unbounded (`0`). */
export function resolveSampleCacheBytes(): number | null {
  if (resolveSampleCacheDirectory() === null) return null;
  const raw = process.env.GROOVE_SAMPLE_CACHE_BYTES?.trim();
  if (!raw) return DEFAULT_SAMPLE_CACHE_BYTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : DEFAULT_SAMPLE_CACHE_BYTES;
}

/** What the cache has done in this process — the units a criterion asserts and `--stats` prints. */
export interface SampleCacheStats {
  /** Where the bytes are, or `null` when the cache is off for this process. */
  directory: string | null;
  /** The byte bound in force, or `null` when off/unbounded. */
  limitBytes: number | null;
  /** Reads answered from disk without a request. */
  diskHits: number;
  /** Downloads with a body, written to disk. */
  writes: number;
  /** Downloads that failed, and were therefore **not** written. */
  failures: number;
  /** Bytes this process wrote. */
  bytesWritten: number;
  /** Files the LRU sweep removed, and the bytes they held. */
  evictions: number;
  evictedBytes: number;
  /** ⭐ Requests that actually reached the network. **"0 new downloads" is this number.** */
  networkRequests: number;
  /** ⭐ Milliseconds waiting for those requests — the **download** half of the download/decode split. */
  networkMs: number;
  /** ⭐ Milliseconds inside `decodeAudioData` — the **decode** half of the same split. */
  decodeMs: number;
  /** How many times the decoder answered. */
  decoded: number;
}

/** What a cache directory currently holds. */
export interface SampleCacheUsage {
  entries: number;
  bytes: number;
}

export interface ByteCacheOptions {
  directory?: string | null;
  limitBytes?: number | null;
}

/**
 * **The bytes, on disk, keyed by `sampleCacheKey`.** No decoder, no audio context, no fetch policy: this is the half that is
 * portable across renders and processes, and it is deliberately the smallest thing that can be.
 */
export class SampleByteCache {
  readonly directory: string | null;
  readonly limitBytes: number | null;
  /** This store's counters. Owned here so "bytes written" and "bytes evicted" cannot get out of step with the files. */
  readonly stats: SampleCacheStats;
  private ready = false;

  constructor(options: ByteCacheOptions = {}) {
    this.directory = options.directory === undefined ? resolveSampleCacheDirectory() : options.directory;
    this.limitBytes = options.limitBytes === undefined ? resolveSampleCacheBytes() : options.limitBytes;
    this.stats = {
      directory: this.directory,
      limitBytes: this.limitBytes,
      diskHits: 0,
      writes: 0,
      failures: 0,
      bytesWritten: 0,
      evictions: 0,
      evictedBytes: 0,
      networkRequests: 0,
      networkMs: 0,
      decodeMs: 0,
      decoded: 0,
    };
  }

  /** Bytes for this asset, or `null` on a miss. Never throws: an unreadable cache is a miss, not a failed render. */
  read(asset: SampleAsset): ArrayBuffer | null {
    return this.readKeyed(sampleCacheKey(asset));
  }

  /**
   * Bytes for a **program or include** file, keyed by its address.
   *
   * The same store, deliberately: the owner's "音源需要下载" is about the recording being there when the render starts, and a
   * recording cannot be resolved without the SFZ that names it — measured on this repository's own manifest, the program and
   * include files were **126 of 134** requests for one three-bar `chicago-house` song. A second cache for them would be the
   * "two places, one thing" failure; the only difference is how the key is written, and `programCacheKey` states it.
   */
  readProgram(url: string): ArrayBuffer | null {
    return this.readKeyed(programCacheKey(url));
  }

  /** Write one downloaded asset. A failure never fails a render. */
  write(asset: SampleAsset, bytes: ArrayBuffer): void {
    this.writeKeyed(sampleCacheKey(asset), bytes);
  }

  /** Write one downloaded program or include file. */
  writeProgram(url: string, bytes: ArrayBuffer): void {
    this.writeKeyed(programCacheKey(url), bytes);
  }

  /** Bytes under a raw key — the two callers above, and a criterion that wants to place an entry by hand. */
  readKeyed(key: string): ArrayBuffer | null {
    const file = this.fileForKey(key);
    if (file === null) return null;
    let bytes: Buffer;
    try {
      bytes = readFileSync(file);
    } catch {
      return null;
    }
    /**
     * The touch is what makes eviction least-recently-**used** rather than least-recently-written. Its failure is ignored on
     * purpose: a read-only cache directory still gives a hit, only the ordering hint is lost.
     */
    try {
      const now = new Date();
      utimesSync(file, now, now);
    } catch {
      /* the hit counts anyway */
    }
    /**
     * ⭐ **A copy, made in this realm, because `decodeAudioData` detaches what it is given.**
     *
     * The same entry may be read again in this process and the host takes ownership of the buffer, so a copy is required either
     * way. It is built through a `Uint8Array` rather than `Buffer#slice`/`ArrayBuffer#slice` because **the host validates the
     * argument's type**: measured on this checkout, a sliced `ArrayBuffer` is rejected by `node-web-audio-api`'s
     * `decodeAudioData` with *"parameter 1 is not of type ArrayBuffer"* while `Object.prototype.toString` still calls it
     * `[object ArrayBuffer]` — a realm identity the type check sees and a string tag does not. Copying through a typed array
     * gives a buffer this realm owns, which is what a caller of a decode is entitled to hand over.
     */
    return new Uint8Array(bytes).buffer;
  }

  /** Write bytes under a raw key, atomically, then bound the directory. */
  writeKeyed(key: string, bytes: ArrayBuffer): void {
    const file = this.fileForKey(key);
    if (file === null || bytes.byteLength === 0) return;
    if (!this.ensureDirectory()) return;
    const buffer = Buffer.from(bytes);
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      writeFileSync(temporary, buffer);
      renameSync(temporary, file);
      this.sweep();
    } catch {
      try {
        unlinkSync(temporary);
      } catch {
        /* nothing left to remove */
      }
    }
  }

  /** Files and bytes on disk right now. A directory walk; `--stats` and the criteria call it. */
  usage(): SampleCacheUsage {
    if (this.directory === null || !existsSync(this.directory)) return { entries: 0, bytes: 0 };
    let entries = 0;
    let bytes = 0;
    for (const name of readdirSync(this.directory)) {
      if (!name.endsWith(".bin")) continue;
      try {
        const info = statSync(path.join(this.directory, name));
        if (!info.isFile()) continue;
        entries += 1;
        bytes += info.size;
      } catch {
        /* a file that vanished between the listing and the stat is already gone */
      }
    }
    return { entries, bytes };
  }

  /** Delete every cached file, and answer how many were removed so a CLI can print it. */
  clear(): number {
    if (this.directory === null || !existsSync(this.directory)) return 0;
    let removed = 0;
    for (const name of readdirSync(this.directory)) {
      if (!name.endsWith(".bin")) continue;
      try {
        rmSync(path.join(this.directory, name));
        removed += 1;
      } catch {
        /* leave what cannot be removed */
      }
    }
    return removed;
  }

  /** Where one asset's bytes are, or `null` when the cache is off. */
  fileFor(asset: SampleAsset): string | null {
    return this.fileForKey(sampleCacheKey(asset));
  }

  /** Where the bytes for a raw key are, or `null` when the cache is off. */
  fileForKey(key: string): string | null {
    if (this.directory === null) return null;
    const digest = createHash("sha256").update(key).digest("hex");
    return path.join(this.directory, `${digest}.bin`);
  }

  /** The key this asset is stored under — exposed so a criterion can assert the *key*, not only the file name. */
  keyFor(asset: SampleAsset): string {
    return sampleCacheKey(asset);
  }

  private ensureDirectory(): boolean {
    if (this.ready) return true;
    if (this.directory === null) return false;
    try {
      mkdirSync(this.directory, { recursive: true });
      this.ready = true;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Evict least-recently-used entries until the directory is under the bound.
   *
   * Called after a write rather than before, so a cache already over the bound (a lowered `GROOVE_SAMPLE_CACHE_BYTES`, or a
   * hand-copied directory) converges on the next download instead of on every read.
   */
  private sweep(): void {
    if (this.directory === null || this.limitBytes === null || this.limitBytes <= 0) return;
    const found: Array<{ file: string; bytes: number; mtimeMs: number }> = [];
    for (const name of readdirSync(this.directory)) {
      if (!name.endsWith(".bin")) continue;
      const file = path.join(this.directory, name);
      try {
        const info = statSync(file);
        if (info.isFile()) found.push({ file, bytes: info.size, mtimeMs: info.mtimeMs });
      } catch {
        /* gone already */
      }
    }
    let total = found.reduce((sum, entry) => sum + entry.bytes, 0);
    if (total <= this.limitBytes) return;
    found.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const entry of found) {
      if (total <= this.limitBytes) break;
      try {
        unlinkSync(entry.file);
        total -= entry.bytes;
        this.stats.evictions += 1;
        this.stats.evictedBytes += entry.bytes;
      } catch {
        /* an entry that cannot be removed must not fail the render waiting on this write */
      }
    }
  }
}

/**
 * ⭐ **The per-render wiring: the process's bytes, in front of this render's own decode.**
 *
 * The split is the whole design: bytes survive the render and the process; a decode belongs to the `AudioContext` that
 * produced it and cannot be shared. So the **store** is process-wide (`processSampleStore`) and the **decoder factory** takes
 * the context each render built.
 */
export interface RenderSampleCacheWiring {
  /** The process-wide store, for a caller that wants to report its size or clear it. */
  store: SampleByteCache;
  /** The process-wide counters. */
  stats(): SampleCacheStats;
  /**
   * Build this render's `SampleDecoder` on the context it created. `decode` is the renderer's own bytes→buffer step (in the
   * Node host, `browserBytesDecoder(context)`).
   */
  decoderFor(
    context: BaseAudioContext,
    decode: (asset: SampleAsset, bytes: ArrayBuffer) => Promise<DecodedSample>
  ): (asset: SampleAsset) => Promise<DecodedSample>;
  /** The `fetchSfzBytes` for this render: program and include text, from disk when it is there. */
  fetchSfzBytes(url: string): Promise<string>;
}

/**
 * Build the wiring for one render.
 *
 * `fetchImpl` is injected for the same reason every other I/O seam in this codebase is: so a criterion can count requests
 * independently of these counters, and so a test never needs the network.
 */
export function renderSampleCacheWiring(options: { fetchImpl?: typeof fetch; store?: SampleByteCache } = {}): RenderSampleCacheWiring {
  const store = options.store ?? processSampleStore();
  const stats = store.stats;
  const fetchImpl = options.fetchImpl ?? fetch;

  /**
   * One download, keyed by the caller's own key so the read that follows cannot disagree with the write.
   *
   * `readKeyed`/`writeKeyed` rather than `read(asset)`/`write(asset)`: the decoder's cache key is `sampleCacheKey(asset)` and
   * the program's is `programCacheKey(url)`, and building a synthetic asset to get the first one would work only as long as
   * the synthetic asset happened to hash to the same string. Stating the key once removes the possibility.
   */
  const download = async (url: string, key: string): Promise<ArrayBuffer> => {
    /**
     * ⭐ **The network half, bracketed separately from the decode half.** The owner's boundary note was that the ~23 s was
     * never split into download and decode; this bracket and the one in `decoderFor` are that split.
     */
    const networkStarted = performance.now();
    stats.networkRequests += 1;
    try {
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      stats.networkMs += performance.now() - networkStarted;
      if (bytes.byteLength > 0) {
        store.writeKeyed(key, bytes);
        stats.writes += 1;
        stats.bytesWritten += bytes.byteLength;
      }
      return bytes;
    } catch (error) {
      stats.failures += 1;
      stats.networkMs += performance.now() - networkStarted;
      throw error;
    }
  };

  return {
    store,
    stats: () => ({ ...stats }),
    decoderFor: (context, decode) => {
      void context;
      return async (asset: SampleAsset): Promise<DecodedSample> => {
        const key = sampleCacheKey(asset);
        const cached = store.readKeyed(key);
        if (cached !== null) {
          stats.diskHits += 1;
          const started = performance.now();
          const decoded = await decode(asset, cached);
          stats.decodeMs += performance.now() - started;
          stats.decoded += 1;
          return decoded;
        }
        if (!asset.url) throw new Error(`sample "${asset.assetId}" has no url, so there are no bytes to decode`);
        const bytes = await download(asset.url, key);
        const decodeStarted = performance.now();
        const decoded = await decode(asset, bytes);
        stats.decodeMs += performance.now() - decodeStarted;
        stats.decoded += 1;
        return decoded;
      };
    },
    fetchSfzBytes: async (url: string): Promise<string> => {
      const key = programCacheKey(url);
      const cached = store.readKeyed(key);
      if (cached !== null) {
        stats.diskHits += 1;
        return new TextDecoder().decode(cached);
      }
      return new TextDecoder().decode(await download(url, key));
    },
  };
}

/** Every store this process has built, by directory — so two renders under one configuration share one. */
const stores = new Map<string, SampleByteCache>();

/**
 * ⭐ **The process's byte store** — one per configured directory, however many renders ask for it.
 *
 * This `Map` is the in-process half of the owner's requirement ("至少要在同一个 MCP server 进程内跨渲染共享"): the loader's own caches are
 * per loader and every render builds a new loader, so the sharing has to live at a level the loaders do not own. The disk is
 * the other half, and it is what makes the sharing survive a restart.
 */
export function processSampleStore(): SampleByteCache {
  const directory = resolveSampleCacheDirectory();
  const key = directory ?? "\u0000off";
  let store = stores.get(key);
  if (!store) {
    store = new SampleByteCache(directory === null ? { directory: null } : { directory, limitBytes: resolveSampleCacheBytes() });
    stores.set(key, store);
  }
  return store;
}

/**
 * Files and bytes in a cache directory, without building a store — what `scripts/sample_cache.mjs --stats` prints.
 *
 * A directory walk rather than a store method, so a CLI can answer "how big is it" without a store whose lifetime has to be
 * reasoned about; `SampleByteCache.usage()` is the same walk for a caller that already has one.
 */
export function readUsage(directory: string): SampleCacheUsage {
  if (!existsSync(directory)) return { entries: 0, bytes: 0 };
  let entries = 0;
  let bytes = 0;
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".bin")) continue;
    try {
      const info = statSync(path.join(directory, name));
      if (!info.isFile()) continue;
      entries += 1;
      bytes += info.size;
    } catch {
      /* a file that vanished between the listing and the stat is already gone */
    }
  }
  return { entries, bytes };
}

/** The process's counters as they stand — the number a report or a criterion reads. */
export function sampleCacheStats(): SampleCacheStats {
  return { ...processSampleStore().stats };
}

/** Start the counters from a known state, for a criterion that asserts "0 new downloads". */
export function __resetSampleCacheStats(): void {
  const stats = processSampleStore().stats;
  stats.diskHits = 0;
  stats.writes = 0;
  stats.failures = 0;
  stats.bytesWritten = 0;
  stats.evictions = 0;
  stats.evictedBytes = 0;
  stats.networkRequests = 0;
  stats.networkMs = 0;
  stats.decodeMs = 0;
  stats.decoded = 0;
}
