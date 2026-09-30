/**
 * A note against a **catalogue entry that is an instrument** — the bridge between the SFZ work and the playback path that already exists.
 *
 * It introduces no arithmetic of its own. `parseSfz` decides which regions exist, `playbackForNote` decides which one answers the note and at what ratio, and this
 * function only connects them to a catalogue id and turns "nothing covers this note" into a reason a composer can read. Writing a second copy of that arithmetic here
 * would be the same defect this workstream keeps removing, one layer up.
 *
 * Fetching the SFZ text is deliberately **not** done here: I/O is not pure, and this stays pure so its criteria need no browser and no network.
 */
import { parseSfz, readControlDefaults } from "./parse";
import { regionsAtCc } from "./ccGate";
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
  /**
   * ⭐ **SFZ's choke groups, which a drum kit cannot be played without.**
   *
   * `group=N` puts a region in a group, and `off_by=N` says "starting me stops whatever is sounding in group N". That is how a closed hi-hat silences an open one, and a kit whose hats overlap is audibly wrong however good the samples are. The real library this project pins uses both (`group=41` and `off_by=41`).
   *
   * It comes out of the resolver rather than being read again by the caller because **only the resolver knows which region answered the note**: one instrument holds the closed hat and the open one, and the file decides which is which.
   */
  group?: number;
  offBy?: number;
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

  /**
   * **The controller gates first, at the values the file itself declares.** `loccN`/`hiccN` decide whether a region exists rather than how loud it is, and with no controller sent the file's own `<control>` block is where those values come from — `virtuosity_drums`
   * turns every one of its microphones on by setting CC101 to 127 there. So a gate that would silence every region is not a bug in the file; it is a file whose defaults say so.
   */
  const audible = regionsAtCc(regions, readControlDefaults(sfzText));
  if (audible.length === 0) {
    return { ok: false, regions, reason: `instrument "${asset.assetId}" has ${regions.length} region(s) and none of them sound at the controller values the file declares` };
  }

  const playback = playbackForNote(audible, note, options);
  if (!playback) {
    return { ok: false, regions, reason: playbackGap(audible, note) };
  }

  /**
   * The choke group and what this region silences, read off the region that answered. **A number that is not a number is left absent rather than becoming `NaN`**: a file that writes `group=hat` has done something the format does not allow, and the honest result is a region with no group rather than every region in one.
   */
  const asInt = (value: string | undefined): number | undefined => {
    if (value === undefined) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const answered = audible.find((region) => region.sample === playback.sample);
  const group = asInt(answered?.opcodes.group);
  const offBy = asInt(answered?.opcodes.off_by);

  return {
    ok: true,
    regions,
    note: {
      samplePath: playback.sample,
      rootKey: playback.rootKey,
      ratio: playback.ratio,
      seqPosition: playback.seqPosition,
      ...(group === undefined ? {} : { group }),
      ...(offBy === undefined ? {} : { offBy }),
    },
  };
}

/**
 * A region's `sample=` turned into **an address**, because a catalogue lookup cannot find it.
 *
 * The catalogue holds **instruments**, and a region names a **file** (`../Samples/kickmic/snare/x.flac`). Asking the catalogue for that path is what produced
 * `no sample "…" — the catalogue holds virtuosity-drums-basic`: not a missing library, a wrong kind of question.
 *
 * **Two addresses, resolved by URL semantics rather than arithmetic.** The path is relative to **the program file that wrote it**, so `new URL(samplePath, programUrl)` is correct by construction — and the
 * fallback is derived the same way from the mirror's address. That distinction matters because arithmetic is where this went wrong twice: a source URL that carried the mirror's `prefix`, and includes
 * resolved against the program's directory when their paths were root-relative. Here the two relationships are different, and only one of them is "relative to the program".
 */
export interface InstrumentAddresses {
  /** Where the program was fetched from, and where the mirror serves it. */
  programUrl: string;
  programFallbackUrl?: string;
}

export function sampleAssetForPath(samplePath: string, addresses: InstrumentAddresses): SampleAsset {
  const primary = new URL(samplePath, addresses.programUrl).toString();
  const mirror = addresses.programFallbackUrl ? new URL(samplePath, addresses.programFallbackUrl).toString() : undefined;
  return {
    assetId: samplePath,
    name: samplePath,
    kind: "one-shot",
    // Not knowable before decoding; the field exists for display and the loader measures the truth when it decodes.
    seconds: 0,
    url: primary,
    ...(mirror && mirror !== primary ? { fallbackUrl: mirror } : {}),
  };
}
