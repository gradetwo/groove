/**
 * ⭐ **What the last play actually asked for — the ledger the `?diag=1` panel reads.**
 *
 * ## The owner's ask, and why this is a *ledger* rather than a panel
 *
 * *"在 `diag=1` 模式里头加些这类的信息"*, said while stuck on two things: pressing play showed no "正在下载音源", and a sample's
 * source address had an **extra directory level** (`…/<pin>/Emilyguitar/notes/…` where the mirror is `…/<pin>/notes/…`).
 * Both are questions about what the *playback* did, and the playback is over by the time anyone opens a panel. So the play
 * writes down what it did, here, and the panel is a rendering of that record.
 *
 * ## Why it is this small, and this import-free
 *
 * The panel itself is loaded on demand (`src/platform/diagnostics.ts` is behind a dynamic `import`, and the bundle budget
 * is a hard gate that has already failed once at 221.8 KB against 220 KB). But a **play** cannot be on-demand — it is on
 * the studio's initial route — so the writer must not pull in the panel, the SFZ resolver, or the program fetcher. Every
 * import below is a `type` and every module boundary that matters is a plain object, which is what keeps the heavy half
 * (`src/hooks/samplerDiagnostics.ts`) reachable only from the lazily-loaded panel.
 *
 * ## What it deliberately does not decide
 *
 * It stores **facts the play observed** — the addresses from the catalogue entry it used, the notes the loader answered,
 * the sentences it produced — and no judgement about them. The reading of those facts (an asset's playable key range, and
 * whether a written note falls outside it) is `sampledKeyCoverage`'s, asked by the panel; a copy here would be the second
 * opinion `src/features/sampledCoverage/sampledKeyCoverage.ts` exists to prevent.
 *
 * ⚠️ **Two helpers below do take value imports** (`ledgerLanesOf` / `observingSamplerLoader`), and they are chosen so that
 * every one of them is already on the route that calls them: `standDownSamplerLanes` and `sampledAssetForLane` are what the
 * play itself uses, and `stepPitches`/`stepVelocity` are two pure readers from the note layer. Nothing here reaches for the
 * SFZ resolver or the program fetcher — that chain is `src/hooks/samplerDiagnostics.ts`, which the lazily-loaded panel is
 * the only caller of, because a play is on the initial route and a panel is not.
 */
import { findSampleAsset, type SampleAsset } from "../data/sampleCatalogue";
import { sampledAssetForLane } from "../data/sampledInstruments";
import { stepPitches, stepVelocity } from "../data/noteLayer";
import { standDownSamplerLanes } from "../audio/samplerLanePrepare";
import type { SampleLoader } from "../audio/sampleLoader";
import type { SequencerPattern } from "../types/genre";

/** Which route pressed play — the first line of the panel, and the one thing a record cannot be inferred from. */
export interface SamplerLedgerLane {
  /** The lane's own name, as the studio shows it. */
  name: string;
  /** The written instrument name the palette maps — `walking_upright`, `guitar_lead`, … */
  instrument?: string;
  /** The catalogue asset this lane's sound resolves to. */
  assetId: string;
  /**
   * The lane's written notes, **as the model's own readers produce them** (`stepPitches` / `stepVelocity`), with each
   * note's velocity kept.
   *
   * Velocity is not decoration: `resolveInstrumentNote` gates on `lovel`/`hivel`, so a note the key span covers can still
   * be refused by the layer it falls in — and the census's judgement is per note, at that note's own velocity, rather than
   * against a min/max span. Empty for a drum lane, which writes no pitch at all.
   *
   * The shape is **structurally `WrittenNote`** (`src/features/sampledCoverage/sampledKeyCoverage.ts`), so it can be handed
   * straight to `notesOutsideCoverage` without this module importing that one — a play is on the initial route and the SFZ
   * chain is not.
   */
  notes: Array<{ step: number; pitch: number; velocity: number }>;
}

/** What one asset's load looked like from the caller's side. */
export interface SamplerLedgerAsset {
  assetId: string;
  /**
   * The pinned source address, read off the catalogue entry this play resolved against.
   *
   * Carried here rather than looked up again by the panel so the panel needs no catalogue: the owner's extra-directory
   * bug is visible by comparing this with `mirrorUrl`, and a second lookup could be answered by a *different* catalogue
   * than the one the play used.
   */
  sourceUrl?: string;
  /** The mirror address, tried only when the source does not answer. */
  mirrorUrl?: string;
  /** Distinct pitches this asset was asked for. */
  notes: number[];
  /** How many of those resolved and decoded. */
  loaded: number;
  /** The sample each resolved note named, relative to the library root — the loader's own answer. */
  samplePaths: string[];
  /** One sentence per note that did not resolve, in the loader's own words. */
  problems: string[];
}

export interface SamplerPlayRecord {
  /** The route that pressed play. */
  entry: string;
  /**
   * The genre this pattern came from (`SequencerPattern.genre_id`), when it has one.
   *
   * Carried because "which entry" is not enough to reproduce a report: the owner's delta-blues/Emily-guitar question is
   * about a *genre's* lane mapping, and the lane list alone does not say which genre asked for it.
   */
  genre?: string;
  /** When, for a report that may be read much later. */
  at: string;
  /** Every lane the pattern maps to a catalogue recording — the **download set**, drum lanes included. */
  lanes: SamplerLedgerLane[];
  /** How many lanes the pattern has at all, so "no mapped lane" can be stated as a fraction rather than a guess. */
  laneCount: number;
  assets: SamplerLedgerAsset[];
  /** `loaded / total` while the wait was up; `null` when there was nothing to wait for. */
  progress: { loaded: number; total: number } | null;
  /** Whether every needed recording was in memory when the transport started. */
  ready: boolean;
  /** Whether there was nothing to load — the ordinary answer for a pattern whose mapped lanes write no pitch. */
  empty: boolean;
  /** Every sentence the play produced about a lane this catalogue could not serve. */
  problems: string[];
  /**
   * ⭐ **The cache reading, which is the whole "第二次播放是缓存命中" question in two numbers.**
   *
   * `loaderBuilds` is `sharedSamplerLoaderBuilds()` — a **session** build counter, so `1` after any number of plays that
   * shared one loader. `decodes` is how many decodes **this play** ran, read as a delta around it, so the second play of
   * the same genre reports `0` and the cache hit is visible from one record rather than by comparing two. A second play
   * that reported decodes again is the measured defect `src/audio/sharedSamplerLoader.ts` records: 45 files, paid at our
   * layer on every press.
   *
   * ⚠️ **`loaderBuilds` is optional on purpose.** The studio reads it directly; the genre page would need a second import
   * of `sharedSamplerLoaderBuilds` from `src/audio/sharedSamplerLoader`, and an existing criterion doubles that module with
   * only `sharedSamplerLoader` on it — so a required field here would turn a working genre page into a failing one for no
   * improvement in what the owner can see. An entry that cannot report it says so instead.
   */
  loaderBuilds?: number;
  decodes: number;
}

let record: SamplerPlayRecord | null = null;

/** Remember what this play did. Overwrites: the panel describes the **last** press, not a history. */
export function publishSamplerPlay(next: SamplerPlayRecord): void {
  record = next;
}

/** The last play's record, or `null` when nothing on this page has played yet. */
export function samplerPlayRecord(): SamplerPlayRecord | null {
  return record;
}

/**
 * Test seam.
 *
 * A module-level record is exactly the kind of state a suite must be able to clear: without this, a criterion about "no
 * play has happened" would read the previous test's answer.
 */
export function __resetSamplerPlayLedger(): void {
  record = null;
}

/**
 * ⭐ **The lanes of a pattern that are catalogue recordings, each with the notes it writes.**
 *
 * The lane set is `standDownSamplerLanes` — the *same* function `prepareSamplerLanes` warms and `AudioEngine`'s dispatch
 * stands down — so the ledger cannot describe a different set from the one the play acted on. The notes come from the
 * model's own readers (`stepPitches` / `stepVelocity`, the pair `sampledKeyCoverage` also uses), so a drum lane's "writes
 * no pitch at all" is the same fact `planSamplerSteps` reads rather than a second opinion about it.
 */
export function ledgerLanesOf(pattern: SequencerPattern, assets: readonly SampleAsset[]): SamplerLedgerLane[] {
  return standDownSamplerLanes(pattern, assets).map(({ lane }) => ({
    name: lane.name || lane.track_id || "lane",
    ...(lane.instrument === undefined ? {} : { instrument: lane.instrument }),
    assetId: sampledAssetForLane(lane) ?? "",
    notes: lane.steps.flatMap((value, step) =>
      value
        ? stepPitches(lane, step).map((pitch) => ({ step, pitch, velocity: Math.round(stepVelocity(lane, step) * 127) }))
        : []
    ),
  }));
}

/**
 * ⭐ **A loader that records what it was asked for and what answered, while delegating every call.**
 *
 * `prepareSamplerLanes` reports `loaded / total` and its sentences; the panel needs "which asset, which note, resolved or
 * refused, and to which sample path". Building a **second** loader to observe with would be a second download and a
 * different cache — the defect this whole workstream removes — so the observation rides on the session's own loader and
 * cannot change what the play does. The scheduler that runs afterwards is handed the *unwrapped* loader, so its notes are
 * the same cache entries the wait just filled.
 *
 * `decodes` delegates too, which is what lets a criterion (and the panel) read "this play decoded nothing" off the loader
 * the play actually used.
 */
export function observingSamplerLoader(
  loader: SampleLoader,
  assets: readonly SampleAsset[],
  observed: Map<string, SamplerLedgerAsset>
): SampleLoader {
  const describe = (assetId: string): SamplerLedgerAsset => {
    const asset = findSampleAsset(assetId, assets);
    return {
      assetId,
      ...(asset?.sfz?.url ?? asset?.url ? { sourceUrl: asset?.sfz?.url ?? asset?.url } : {}),
      ...(asset?.sfz?.fallbackUrl ?? asset?.fallbackUrl
        ? { mirrorUrl: asset?.sfz?.fallbackUrl ?? asset?.fallbackUrl }
        : {}),
      notes: [],
      loaded: 0,
      samplePaths: [],
      problems: [],
    };
  };
  return {
    load: (assetId: string) => loader.load(assetId),
    loadNote: async (assetId, note, options) => {
      let entry = observed.get(assetId);
      if (entry === undefined) {
        entry = describe(assetId);
        observed.set(assetId, entry);
      }
      if (!entry.notes.includes(note)) entry.notes.push(note);
      try {
        const answer = await loader.loadNote(assetId, note, options);
        entry.loaded += 1;
        if (answer.samplePath && !entry.samplePaths.includes(answer.samplePath)) entry.samplePaths.push(answer.samplePath);
        return answer;
      } catch (error) {
        entry.problems.push(`${assetId} note ${note}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    },
    decodes: () => loader.decodes(),
  };
}
