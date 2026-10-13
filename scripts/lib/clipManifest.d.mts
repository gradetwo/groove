/**
 * Types for `clipManifest.mjs`, which is JavaScript because it runs inside `deploy.mjs`.
 *
 * The criterion that drives the guard is TypeScript, and importing an untyped `.mjs` from it fails this repository's
 * typecheck with `TS7016` — the failure `sampleRoot.d.mts` already records for the guard beside this one. The
 * declarations are written by hand beside the module rather than suppressed.
 */

/**
 * The verdict on a shipped clip manifest, as data rather than as a process exit, so a criterion can drive it with a
 * fixture.
 *
 * `ok` is true only when every clip's **origin** is the configured mirror root; the path beneath the root is not
 * compared, because that is the manifest's business and a clip moving prefix is not a failure.
 */
export declare function clipManifestVerdict(input: { manifestText?: string; root?: string }): {
  ok: boolean;
  reason?: string;
  checked?: number;
  hosts?: string[];
};
