/**
 * Genre artwork, re-exported from the layer that logic is allowed to read.
 *
 * The functions here are pure string/image work with no component in them, but they lived in `src/mobile/` — a **ui** layer — so any hook importing them
 * broke R2 ("logic must not import ui") without meaning to. `scripts/check_layers.mjs` had been red about it for two files and nobody had read the gate.
 *
 * They now live in `src/utils/genreArt.ts`, which is a layer logic may import, and this module re-exports them so every existing consumer keeps
 * working unchanged. That is the same shape as the project's two previous fixes to this rule: invert the dependency rather than allow-list it.
 */
export * from "../utils/genreArt";
