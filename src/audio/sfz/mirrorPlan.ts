/**
 * What a library **actually needs**, derived from its own SFZ rather than from a hand-written list.
 *
 * A manifest that listed every sample by hand would be a second, drifting copy of information the SFZ already carries: every `sample=` opcode names a file, and a parser that
 * can read them can say exactly which files a program needs. That is the same rule this workstream applies everywhere else — one definition of a fact — and it means adding an
 * instrument cannot silently omit a sample.
 *
 * This is the **plan** half of mirroring, and it is pure: no download, no hash, no filesystem. The step that fetches and verifies takes this list and checks it against the
 * manifest's promises, which is why the two are separate.
 */
import type { SfzRegion } from "./parse";

export interface PlannedFile {
  /** Path relative to the mirror root, as the SFZ refers to it (with `..` already resolved). */
  path: string;
  /** How many regions use it, so a caller can report the instrument's shape rather than only its size. */
  regions: number;
}

/**
 * Resolve a path written inside an SFZ against the directory of the file that wrote it.
 *
 * The same rule the include resolver uses, applied to samples, and for the same measured reason: a real library writes `../Samples/kickmic/kick/kick.wav` from
 * `Programs/mappings/kickmic_basic.sfz`, and the answer depends on which of those two directories you started from.
 */
export function resolveSamplePath(programPath: string, samplePath: string): string {
  if (samplePath.startsWith("/") || /^[a-zA-Z]+:/.test(samplePath)) return samplePath;
  /**
   * ⭐ **SFZ writes its separator either way, and this resolver only understood `/`.**
   *
   * The fact the playback resolver learned from VSCO 2 CE applies here one layer over: the libraries this project mirrors write `..\Samples\darkblack\reg\x.wav` (Karoryfer) and
   * `..\Samples\Horns\x.wav` (Sonatina). Split only on `/`, such a path is a **single** component, so `..` never popped anything and the plan named a file that does not exist — while the
   * loader, which normalises, fetched the real one. A mirror tool that disagrees with the loader about which bytes an instrument needs is the one disagreement this module exists to prevent.
   */
  const normalised = samplePath.replace(/\\/g, "/");
  const directory = programPath.includes("/") ? programPath.slice(0, programPath.lastIndexOf("/")) : "";
  const parts = `${directory}/${normalised}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/**
 * The unique sample files a set of regions needs, resolved against the program that produced them.
 *
 * Regions with **no** sample and regions holding **unresolved variables** are skipped: the first has nothing to fetch, and the second cannot be trusted to name a file, which is
 * the same reason such a region is never selectable for a note.
 */
export function samplePathsFor(regions: readonly SfzRegion[], programPath: string): PlannedFile[] {
  const counts = new Map<string, number>();
  for (const region of regions) {
    if (!region.sample || region.unresolved.length > 0) continue;
    const path = resolveSamplePath(programPath, region.sample);
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([path, count]) => ({ path, regions: count }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
