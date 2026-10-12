/**
 * Types for `sampleRoot.mjs`, which is JavaScript because it runs inside `deploy.mjs`.
 *
 * The test that drives the guard is TypeScript, and importing an untyped `.mjs` from it is an error under this
 * repository's typecheck (`TS7016: Could not find a declaration file`). That is exactly what happened: the guard's
 * criteria passed locally on `vitest` and eslint, the push went out, and the remote typecheck failed — the same class
 * of mistake as trusting a push line as if it were a gate verdict, and the reason `tsc` is part of the local set.
 *
 * The declarations are written by hand rather than inferred, and `src/js-yaml.d.ts` sets the precedent: a dependency
 * with no types gets an ambient file beside it, not a suppression.
 */

/** Every `.js` under a directory, recursively — including lazy chunks, which is the point. */
export declare function builtScripts(dir: string): string[];

/** Whether a manifest describes bytes that live at absolute addresses, in which case no root is needed. */
export declare function manifestCarriesAbsoluteUrls(manifestText: string | undefined | null): boolean;

/**
 * The verdict, as data rather than as a process exit, so a criterion can drive it with a fixture.
 */
export declare function sampleRootVerdict(input: {
  distDir: string;
  envRoot?: string;
  manifestText?: string;
}): { ok: boolean; reason?: string; scriptsRead?: number };
