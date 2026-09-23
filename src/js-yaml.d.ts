/**
 * `js-yaml` ships no types, and it is a *transitive* dependency (through vite) rather than one this project chose.
 *
 * `ciWorkflows.test.ts` parses the workflow files with it, because GitHub rejects a workflow with a duplicated key
 * and nothing else locally does (see the note in that test — the failure it prevents is a run that never starts).
 * Declaring the one function used is cheaper than adding `@types/js-yaml` for a test that reads two files, and it
 * has to live in an ambient file: a `declare module` inside a module is an *augmentation*, and TypeScript refuses to
 * augment a module that resolves to an untyped `.mjs`.
 */
declare module "js-yaml" {
  export function load(source: string): unknown;
}
