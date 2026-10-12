# vendor/gs1 — pinned GROOVE SYNTH GS-1 core

This directory is a **one-directional vendored copy** of the parts of the upstream
project [`gradetwo/synth`](https://github.com/gradetwo/synth) ("GROOVE SYNTH GS-1",
MIT licensed, ABI version 9) that Groove Lab needs to run the polyphonic
instrument engine for the `chords` and `lead` track roles.

`scripts/sync-gs1.mjs` reads that repository by default (`--ref <tag|commit>`,
default: the newest `v*` tag) and pins the bytes here. A local checkout passed via
`--from <path>` is a documented, optional override for when one is already built.

It is **not** a git submodule (a submodule would track a moving ref, and the cores
this repo needs are build artifacts upstream does not commit), **not** a subtree
(it would splice GS-1's unrelated history into this repo), and **not** an npm
dependency (GS-1 is `private: true` and publishes no package). It is a pinned file
copy, refreshed by a script.

## Provenance

`UPSTREAM.json` is the source of truth for the pin: upstream version, upstream
commit SHA, the ABI version the artifacts actually export, and a SHA-256 for
every vendored file. It is generated — do not hand-edit it.

## What is vendored

| file | role |
| --- | --- |
| `src/audio/worklet-processor.js` | AudioWorklet processor. Self-contained: it drives the Rust core through the block ABI and imports nothing. |
| `src/audio/params.ts` | Parameter table. The numeric ids are the wire format for `gs_set_param` and must match the Rust core. |
| `src/audio/engine.ts` | TypeScript host engine. |
| `src/generated/synth_core.wasm` | SIMD DSP core. |
| `src/generated/synth_core_scalar.wasm` | Scalar fallback DSP core. |
| `LICENSE` | Upstream MIT licence, required to redistribute the code. |

Keeping upstream-relative paths means the eventual integration remaps exactly one
alias (`@/` → `vendor/gs1/src/`) rather than rewriting import specifiers file by
file.

## What is deliberately *not* vendored

`engine.ts` imports four modules that are Groove Lab concerns, not engine
internals, and would drag app code in here:

    ./settle            (settleWithin)
    ./wasmFetch          (fetchCoreBytes)
    @/pwa/register       (recoverFromStaleBuild)
    @/i18n               (t)

The engine *runtime* is still fully covered — `worklet-processor.js` is
self-contained and is what actually runs the core on the audio thread. The
integration step is expected to provide those four host dependencies (or remap
them) when `engine.ts` is wired into `src/audio/`. Until then `engine.ts` will not
typecheck on its own; that is a known, tracked gap, not an accident.

## The `.wasm` files are committed on purpose

The two cores are build artifacts and are **gitignored upstream**
(`src/generated/*.wasm`), so a fresh GS-1 clone does not contain them. The default
GitHub sync builds them from the clone's own Rust sources (with `CARGO_TARGET_DIR`
pointed outside the clone, so the checkout it reads stays read-only). They are
committed *here* because this repository's CI has no Rust toolchain: a vendored
artifact CI cannot rebuild is the only option. `vendor/` is **not** excluded by
this repo's `.gitignore`, so the binaries are committed like any other source.

## Refreshing the pin ("a new GS-1 release came out")

```sh
# 1. Re-vendor from GitHub. Clones the newest v* tag, builds the .wasm cores from
#    its Rust sources, and copies the pinned subset. Needs git + Rust (wasm32);
#    pin a different release with --ref <tag|commit>.
node scripts/sync-gs1.mjs

#    ...or read a local checkout that already has the built artifacts (optional
#    override, needs `npm run build:wasm` there first):
#      node scripts/sync-gs1.mjs --from /path/to/synth

# 2. Verify the pin (hashes, wasm validation, ABI values, render, param ids).
node scripts/check-gs1.mjs
```

`git diff vendor/gs1/UPSTREAM.json` is the review artefact: it shows the new
version, commit, ABI and every changed hash. If a source file changed, the sync
also updates that file.

If CI reports `vendor/gs1` files missing while `UPSTREAM.json` exists, the pin is
broken (a partial commit, or a checkout that dropped binaries) — re-run the sync
or restore the files. The gate fails rather than silently skipping in that case.
