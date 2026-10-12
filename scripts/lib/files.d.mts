export interface FileFingerprint {
  sha256: string;
  bytes: number;
}
export declare function hashFile(path: string): Promise<FileFingerprint>;
export declare function matchesManifestEntry(
  path: string,
  expected: { sha256?: string; bytes?: number }
): Promise<{ ok: boolean; problems: string[]; actual: FileFingerprint }>;

export declare function fingerprintBytes(bytes: Uint8Array): FileFingerprint;
export declare function matchManifestEntry(
  bytes: Uint8Array,
  expected: { sha256?: string; bytes?: number }
): { ok: boolean; problems: string[]; actual: FileFingerprint };
