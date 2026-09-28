/**
 * A note against a **catalogue entry that is an instrument** — the bridge between the SFZ work and the playback path that already exists.
 *
 * It introduces no arithmetic of its own. `parseSfz` decides which regions exist, `playbackForNote` decides which one answers the note and at what ratio, and this
 * function only connects them to a catalogue id and turns "nothing covers this note" into a reason a composer can read. Writing a second copy of that arithmetic here
 * would be the same defect this workstream keeps removing, one layer up.
 *
 * Fetching the SFZ text is deliberately **not** done here: I/O is not pure, and this stays pure so its criteria need no browser and no network.
 */
import { parseSfz } from "./parse";
import { playbackForNote, playbackGap } from "./regionPlayback";
import type { SfzRegion } from "./parse";
import type { SampleAsset } from "../../data/sampleCatalogue";

export interface ResolvedInstrumentNote {
  /** The sample path exactly as the SFZ wrote it — resolution to bytes is the loader's job, as it always was. */
  samplePath: string;
  rootKey: number;
  /** Playback rate: 1 means "at the recorded pitch". */
  ratio: number;
  seqPosition: number;
}

export interface InstrumentResolution {
  ok: boolean;
  note?: ResolvedInstrumentNote;
  /** Why not, in words a reply can carry — never a silent default. */
  reason?: string;
  /** The regions the file actually defines, so a caller can report rather than guess when something is wrong. */
  regions: SfzRegion[];
}

/**
 * Resolve one note for one instrument entry.
 *
 * Failure is a **result**, not an exception and not a default: an entry with no `sfz`, empty SFZ text, a file with no regions, or a note outside every region each
 * return `ok: false` with a reason. That is the same standard the ninth track kind was held to — a reference naming nothing is an **error rather than silence**.
 */
export function resolveInstrumentNote(
  asset: Pick<SampleAsset, "assetId" | "sfz">,
  sfzText: string,
  note: number,
  options: { velocity?: number; nth?: number } = {}
): InstrumentResolution {
  if (!asset.sfz) {
    return { ok: false, regions: [], reason: `sample "${asset.assetId}" is not an instrument (it has no sfz)` };
  }
  if (!sfzText || sfzText.trim() === "") {
    return { ok: false, regions: [], reason: `instrument "${asset.assetId}" has empty SFZ text` };
  }

  const regions = parseSfz(sfzText);
  if (regions.length === 0) {
    return { ok: false, regions, reason: `instrument "${asset.assetId}" defines no regions` };
  }

  const playback = playbackForNote(regions, note, options);
  if (!playback) {
    return { ok: false, regions, reason: playbackGap(regions, note) };
  }

  return {
    ok: true,
    regions,
    note: { samplePath: playback.sample, rootKey: playback.rootKey, ratio: playback.ratio, seqPosition: playback.seqPosition },
  };
}
