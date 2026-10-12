/** Types for the scratch-root policy, so a caller that picks a directory is still type-checked. */
export interface ScratchRoot {
  root: string;
  source: "--scratch" | "TMPDIR" | "default";
  detail: string;
}
export interface MountEntry {
  mountPoint: string;
  fsType: string;
}
export interface ScratchFacts {
  root: string;
  mountPoint: string;
  fsType: string | null;
  ramBacked: boolean;
  freeBytes: number | null;
}
export declare const DEFAULT_SCRATCH_ROOT: string;
export declare const TMPFS_MAGIC: number;
export declare const RAMFS_MAGIC: number;
export declare function flagValue(argv: string[], name: string): string | undefined;
export declare function scratchRootFrom(options?: {
  argv?: string[];
  env?: Record<string, string | undefined>;
  platform?: string;
}): ScratchRoot;
export declare function parseMounts(text: string): MountEntry[];
export declare function mountPointFor(target: string, mounts: MountEntry[]): MountEntry | null;
export declare function isRamBackedFsType(fsType: string | null): boolean;
export declare function fsTypeFromMagic(magic: number): string;
export declare function filesystemFor(
  target: string,
  options?: { mountsText?: string | null }
): { mountPoint: string; fsType: string | null; ramBacked: boolean };
export declare function describeScratch(root: string): ScratchFacts;
export declare function formatBytes(bytes: number | null | undefined): string;
export declare function ramBackedWarning(facts: ScratchFacts): string | null;
export declare function freeSpaceWarning(facts: ScratchFacts, plannedBytes: number): string | null;
export declare function makeScratchDir(root: string, prefix: string): string;
export declare function removeScratchDir(dir: string): { ok: boolean; error?: string };
