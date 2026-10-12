/**
 * ⭐ **The `?diag=1` sampler section: what the last play asked for, where it asked, what answered, and what the engine can sound.**
 *
 * ## Why this is a separate module from the ledger
 *
 * A play is on the studio's **initial route** and a panel is not. `src/hooks/samplerPlayLedger.ts` is therefore import-free
 * and holds only facts the play observed; everything that needs a *reader* — the SFZ resolver, the program fetcher, the
 * catalogue — lives here, and this module is reachable only from `src/platform/diagnostics.ts`, which is behind a dynamic
 * `import` because the bundle budget is a hard gate. Putting the two in one file would drag the SFZ resolver and the
 * #include expander into the first paint to serve a panel that is off by default.
 *
 * ## The two questions this answers, in the owner's own words
 *
 *   · *"我播放时候，没有 cache 模式，直接点播放，没看到哪里会提示下载音源"* — the record carries `loaded / total`, `ready`,
 *     `empty` and every problem sentence, so the panel can say what the wait was and why it produced nothing;
 *   · *"源站地址多一层目录"* — every asset shows its **pinned source** and its **mirror** side by side, so a base that has
 *     grown a directory is visible without a network call, and the probe button turns that reading into statuses.
 *
 * ## What it refuses to invent
 *
 * **Which host actually answered a successful load is not reported by the loader.** `loadNote` answers with the buffer, the
 * ratio and the *sample path* relative to the library root; both addresses produce the same relative path, so a successful
 * load cannot be attributed to one of them. The panel says so rather than guessing, and offers a probe — **this panel's own
 * request**, labelled as such — for the person who needs the 200/404. On the failure path the loader's own sentence already
 * names both addresses and both reasons (`src/audio/sampleLoader.ts`), and that sentence is carried through verbatim.
 *
 * ## And it prints no secret
 *
 * Every string here comes from the catalogue entry the play resolved against (addresses the manifest publishes) or from the
 * loader's own messages. Nothing reads `import.meta.env`, `process.env`, or any `VITE_*` value — a criterion asserts that in
 * the source *and* in the rendered text, because "the diagnostic panel leaked the mirror token" is a failure that cannot be
 * undone by a later commit.
 */
import {
  sampledKeyCoverage,
  notesOutsideCoverage,
  keyRuns,
  type CoverageAsset,
} from "../features/sampledCoverage/sampledKeyCoverage";
import { cachedProgramText, catalogueProgramText, type InstrumentAsset } from "../features/sampledCoverage/programText";
import { appCatalogueRuntime } from "../data/sampleCatalogueRuntime";
import { findSampleAsset } from "../data/sampleCatalogue";
import { samplerPlayRecord, type SamplerPlayRecord } from "./samplerPlayLedger";

/** One `#include`-expanded program reader for this session, the same shape `useSampledCoverage` keeps. */
const programText = cachedProgramText(catalogueProgramText());

export type SamplerCoverageStatus = "idle" | "loading" | "ready" | "failed" | "not-an-instrument";

export interface SamplerDiagAsset {
  assetId: string;
  /** The pinned source address from the catalogue entry. */
  sourceUrl?: string;
  /** The mirror address, tried only when the source does not answer. */
  mirrorUrl?: string;
  /** True when the mirror is the only address — "回退到镜像" is not a question for an asset that has no source. */
  mirrorOnly: boolean;
  /** Distinct pitches asked for, ascending. */
  notes: number[];
  loaded: number;
  samplePaths: string[];
  problems: string[];
  /** How many lanes of this play use it. */
  lanes: string[];
  /** The written notes of those lanes, so "超出几个音" is asked per note. */
  written: Array<{ step: number; pitch: number; velocity: number }>;
  coverageStatus: SamplerCoverageStatus;
  /** `12–120，缺 61–71, 90–95` — the engine's answer, holes included, or why there is none. */
  coverageRange?: string;
  playableKeys?: number;
  /** Written notes the engine refuses, at each note's own velocity. **The census's verdict, asked of the engine.** */
  outside?: number[];
  coverageReason?: string;
}

/** A row of the address probe: this panel's own request, not the playback's. */
export interface SamplerAddressProbe {
  assetId: string;
  kind: "source" | "mirror";
  url: string;
  /** `200`, `404`, … or `—` when the request itself failed before a response. */
  status: string;
  ok: boolean;
  /** The reason, when it did not answer. */
  reason?: string;
}

export interface SamplerDiagView {
  record: SamplerPlayRecord | null;
  /** The lanes of this play, split the way the census splits them: melodic lanes write pitches, drum lanes do not. */
  melodicLanes: Array<{ name: string; instrument?: string; assetId: string }>;
  drumLanes: Array<{ name: string; instrument?: string; assetId: string }>;
  assets: SamplerDiagAsset[];
  /** Ready-to-render lines — one fact each, so the panel is a renderer rather than a second formatter. */
  lines: string[];
}

/** Distinct pitches, ascending, from a lane's written notes. */
function distinctPitches(notes: readonly { pitch: number }[]): number[] {
  return [...new Set(notes.map((note) => note.pitch))].sort((a, b) => a - b);
}

/** `12–120，缺 61–71, 90–95` — the label shape `keyRuns` exists for. */
function rangeLabel(keys: readonly number[], holes: readonly number[]): string {
  if (keys.length === 0) return "no key sounds";
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  const holesLabel = holes.length > 0 ? `，缺 ${keyRuns(holes).map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ")}` : "";
  return `${first}–${last}${holesLabel}`;
}

/**
 * Read the engine's coverage for one asset, through this module's own cache.
 *
 * The program text is fetched (and its `#include`s expanded) **once per asset per session**, by the shared
 * `cachedProgramText` reader — the same one `useSampledCoverage` uses — so a panel that refreshes every two seconds does not
 * re-fetch a program it already holds. A failure is remembered with its reason rather than retried, so a broken address
 * cannot become a request loop; only "the catalogue does not carry it yet" is not a failure at all (there is no address to
 * try, and that is said).
 */
const coverageCache = new Map<string, { status: SamplerCoverageStatus; label?: string; playableKeys?: number; outside?: number[]; reason?: string }>();

async function readCoverage(
  assetId: string,
  written: readonly { step: number; pitch: number; velocity: number }[]
): Promise<{ status: SamplerCoverageStatus; label?: string; playableKeys?: number; outside?: number[]; reason?: string }> {
  const cached = coverageCache.get(assetId);
  if (cached) return cached;

  const asset = findSampleAsset(assetId, appCatalogueRuntime.assets);
  if (asset === null) {
    const failure = { status: "idle" as const, reason: `the session's catalogue does not carry "${assetId}"` };
    coverageCache.set(assetId, failure);
    return failure;
  }
  if (!asset.sfz) {
    const failure = { status: "not-an-instrument" as const, reason: `"${assetId}" is a sample, not an instrument, so a note cannot select from it` };
    coverageCache.set(assetId, failure);
    return failure;
  }

  try {
    const text = await programText(asset as InstrumentAsset);
    const coverage = sampledKeyCoverage(asset as CoverageAsset, text);
    const outside = notesOutsideCoverage(asset as CoverageAsset, text, written);
    const answer = {
      status: "ready" as const,
      label: coverage === null ? "no key sounds" : rangeLabel(coverage.keys, coverage.holes),
      playableKeys: coverage === null ? 0 : coverage.keys.length,
      outside: outside.map((note) => note.pitch),
    };
    coverageCache.set(assetId, answer);
    return answer;
  } catch (error) {
    const failure = {
      status: "failed" as const,
      reason: error instanceof Error ? error.message : String(error),
    };
    coverageCache.set(assetId, failure);
    return failure;
  }
}

/** Test seam: drop the reading cache, so a criterion can watch it fill. */
export function __resetSamplerDiagnostics(): void {
  coverageCache.clear();
}

/** Compose the panel's view from the last play's record. Never throws: a panel that cannot answer says why. */
export async function samplerDiagView(): Promise<SamplerDiagView> {
  const record = samplerPlayRecord();
  if (record === null) {
    return {
      record: null,
      melodicLanes: [],
      drumLanes: [],
      assets: [],
      lines: ["no play has been recorded on this page yet — press Play and this fills in."],
    };
  }

  const byAsset = new Map<string, SamplerDiagAsset>();
  for (const lane of record.lanes) {
    const asset = findSampleAsset(lane.assetId, appCatalogueRuntime.assets);
    const existing = byAsset.get(lane.assetId);
    const target =
      existing ??
      ({
        assetId: lane.assetId,
        ...(asset?.sfz?.url ?? asset?.url ? { sourceUrl: asset?.sfz?.url ?? asset?.url } : {}),
        ...(asset?.sfz?.fallbackUrl ?? asset?.fallbackUrl
          ? { mirrorUrl: asset?.sfz?.fallbackUrl ?? asset?.fallbackUrl }
          : {}),
        mirrorOnly: (asset?.sfz?.url ?? asset?.url) === undefined,
        notes: [],
        loaded: 0,
        samplePaths: [],
        problems: [],
        lanes: [],
        written: [],
        coverageStatus: "idle" as const,
      } satisfies SamplerDiagAsset);
    target.lanes.push(lane.name);
    target.written.push(...lane.notes);
    if (!existing) byAsset.set(lane.assetId, target);
  }
  for (const observed of record.assets) {
    const target = byAsset.get(observed.assetId);
    if (!target) continue;
    target.notes = [...observed.notes].sort((a, b) => a - b);
    target.loaded = observed.loaded;
    target.samplePaths = observed.samplePaths;
    target.problems = observed.problems;
  }

  const assets = [...byAsset.values()];
  await Promise.all(
    assets.map(async (asset) => {
      const reading = await readCoverage(asset.assetId, asset.written);
      asset.coverageStatus = reading.status;
      if (reading.label !== undefined) asset.coverageRange = reading.label;
      if (reading.playableKeys !== undefined) asset.playableKeys = reading.playableKeys;
      if (reading.outside !== undefined) asset.outside = reading.outside;
      if (reading.reason !== undefined) asset.coverageReason = reading.reason;
    })
  );

  const melodicLanes = record.lanes
    .filter((lane) => lane.notes.length > 0)
    .map(({ name, instrument, assetId }) => ({ name, ...(instrument === undefined ? {} : { instrument }), assetId }));
  const drumLanes = record.lanes
    .filter((lane) => lane.notes.length === 0)
    .map(({ name, instrument, assetId }) => ({ name, ...(instrument === undefined ? {} : { instrument }), assetId }));

  const lines: string[] = [];
  lines.push(`entry      ${record.entry}${record.genre === undefined ? "" : ` · ${record.genre}`} · ${record.at}`);
  /**
   * ⭐ The census's own split, said in the census's own terms: it counts `bass`/`chords`/`lead` and excludes drum lanes
   * *"因为鼓声部由另一张表（`src/audio/drumRoles.ts`）决定，且鼓轨不写音高"*. The **download set** is every mapped lane, so both
   * numbers are shown rather than one of them being quietly substituted for the other.
   */
  lines.push(
    `lanes      ${record.lanes.length} of ${record.laneCount} mapped · 旋律 ${melodicLanes.length} · 鼓 ${drumLanes.length}`
  );
  if (record.lanes.length === 0) {
    lines.push("           no lane of this pattern is a catalogue recording — every lane is the built-in synthesiser.");
  }
  for (const lane of record.lanes) {
    const pitches = distinctPitches(lane.notes);
    lines.push(
      `  lane     ${lane.name} → ${lane.instrument ?? "(no instrument)"} → ${lane.assetId}${
        lane.notes.length === 0 ? "  [writes no pitch: nothing to fetch]" : `  written ${pitches.join(", ")} (${lane.notes.length} notes)`
      }`
    );
  }

  for (const asset of assets) {
    lines.push(`  asset    ${asset.assetId}`);
    lines.push(`    source ${asset.sourceUrl ?? "— (no pinned source address on the catalogue entry)"}`);
    lines.push(`    mirror ${asset.mirrorUrl ?? "— (no mirror address on the catalogue entry)"}`);
    lines.push(`    lanes  ${asset.lanes.join(", ")}`);
    lines.push(
      `    asked  ${asset.notes.length} distinct → ${asset.loaded} resolved${
        asset.samplePaths.length > 0 ? ` · e.g. ${asset.samplePaths[0]}` : ""
      }`
    );
    /**
     * The loader does not attribute a *successful* load to one host, so that fact is stated as unknown rather than guessed;
     * a failure is the loader's own sentence, which names both addresses and both reasons.
     */
    lines.push(
      asset.problems.length === 0
        ? "    served  ok (which host answered is not reported by the loader for a successful load — press 探测 to ask the two addresses)"
        : `    served  FAILED · ${asset.problems.length} note(s) · ${asset.problems[0]}`
    );
    if (asset.written.length > 0) {
      const written = distinctPitches(asset.written);
      lines.push(`    written ${written.join(", ")} (${asset.written.length} notes)`);
    }
    lines.push(
      asset.coverageStatus === "ready"
        ? `    playable ${asset.coverageRange} · ${asset.playableKeys} keys · 超出 ${asset.outside?.length ?? 0} note(s)${
            asset.outside && asset.outside.length > 0 ? ` (${[...new Set(asset.outside)].sort((a, b) => a - b).join(", ")})` : ""
          }`
        : `    playable not read (${asset.coverageStatus})${asset.coverageReason === undefined ? "" : `: ${asset.coverageReason}`}`
    );
  }

  lines.push(
    `progress   ${
      record.progress === null ? "nothing to wait for" : `${record.progress.loaded} / ${record.progress.total} ready`
    } · ready ${record.ready} · empty ${record.empty}`
  );
  if (record.problems.length > 0) {
    lines.push(`problems   ${record.problems.length}`);
    for (const problem of record.problems) lines.push(`  problem  ${problem}`);
  } else {
    lines.push("problems   none — every mapped lane this session can serve was served");
  }
  /**
   * ⭐ **The cache reading.** `loaderBuilds` is the session's build counter, so a `1` after two plays is the sharing
   * holding; `decodes` unchanged across a re-play is the cache hit. Both are numbers the loader itself reports, not
   * estimates.
   */
  lines.push(
    `cache      loader builds ${
      record.loaderBuilds === undefined ? "not reported on this entry" : record.loaderBuilds
    } · decodes ${record.decodes} (a second play that reports decodes again is a cache miss)`
  );

  return { record, melodicLanes, drumLanes, assets, lines };
}

/**
 * Ask the two addresses the panel is showing, and report what each answered.
 *
 * ⚠️ **This is the panel's own request, not the playback's**, and the distinction matters: a `404` here means the address is
 * wrong *now*, which is exactly the owner's extra-directory question, while a `200` here says nothing about which host the
 * loader used earlier. Deliberately **on demand** rather than on every refresh — a panel that fetched every address every
 * two seconds would be a stampede the app has already been bitten by
 * (`src/hooks/useSampledCoverage.ts` states the rule: "a browser that fetched all of them on open would be a stampede").
 */
export async function probeSamplerAddresses(): Promise<SamplerAddressProbe[]> {
  const record = samplerPlayRecord();
  if (record === null) return [];
  const addresses = new Map<string, { source?: string; mirror?: string }>();
  for (const lane of record.lanes) {
    if (addresses.has(lane.assetId)) continue;
    const asset = findSampleAsset(lane.assetId, appCatalogueRuntime.assets);
    addresses.set(lane.assetId, {
      ...(asset?.sfz?.url ?? asset?.url ? { source: asset?.sfz?.url ?? asset?.url } : {}),
      ...(asset?.sfz?.fallbackUrl ?? asset?.fallbackUrl ? { mirror: asset?.sfz?.fallbackUrl ?? asset?.fallbackUrl } : {}),
    });
  }

  const probes: SamplerAddressProbe[] = [];
  for (const [assetId, { source, mirror }] of addresses) {
    for (const [kind, url] of [
      ["source", source],
      ["mirror", mirror],
    ] as const) {
      if (url === undefined) continue;
      try {
        const response = await fetch(url);
        probes.push({ assetId, kind, url, status: String(response.status), ok: response.ok });
      } catch (error) {
        probes.push({
          assetId,
          kind,
          url,
          status: "—",
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return probes;
}
