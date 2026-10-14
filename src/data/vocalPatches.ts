/**
 * **The synth's factory vocal-choir patches, as share codes.**
 *
 * The GS-1 host loads a track's sound from a **share code** (`gs1.1.…`), and until now this repository had no vocal patch
 * at all: `synthesize_vocal` was an honest stub reporting the capability as reserved, because there was nothing to sing
 * with. The synth project shipped five formant vocal-choir presets (`gradetwo/synth` `d75630c`), and these are those five,
 * read out of its own `gs1.patch.get` rather than transcribed — a share code is an opaque base64url payload, so copying
 * one by eye would be a silent corruption that only shows up as a wrong-sounding voice.
 *
 * ⚠️ **What these are, and are not.** Each is a *patch*: a vowel-shaped formant voice. They are **not** singing synthesis
 * — a share code says nothing about a lyric. What they give a vocal lane is a voice to sing *with*, which is the piece
 * that was missing: the notes and the syllables were already in the arrangement model.
 */
export interface VocalPatch {
  /** The synth's factory preset id, which is also how a caller names it. */
  id: string;
  /** The preset's own display name, as the synth ships it. */
  label: string;
  /** The vowel this patch is shaped for, so a caller can pick by lyric rather than by id. */
  vowel: string;
  /** The `gs1.1.…` share code, exactly as `gs1.patch.get` printed it. */
  shareCode: string;
}

export const FACTORY_VOCAL_PATCHES: readonly VocalPatch[] = [
  { id: "vocalah", label: "Vocal Ah Choir · 人声啊唱", vowel: "啊", shareCode: "gs1.1.eyJzIjo0LCJ2IjpbMC43NSwxLDIsMCw3LDAuNjUsMC41LDEsMiwwLC02LDAuNSwwLjUsNSw4MCwwLjQyLDAuMTUsMCwwLDAuNSwwLjgsMC44NSwxLjgsMSwwLDUuMSwwLjA1LDEsMCwxLDAuNzUsMC40LDAsMiwwLjM1LDAuMjIsMCwxMjAsMiwwLDAsMCwwLDEsMC4zNSwwLjYsMC4zLDAsMC4zLDAuNSwwLjQsMCwwLjQsMC42LDAuNSwwLDAuNCwwLjYsMC4wMSwwLjMsMC41LDAuMywwLDEsMC41LDAuMywwLDAuMzUsMC44LDAuMDEyLDYsMC4yOCw0LDAuMiwwLDAsMCwwLDAuMzIzLDAsMC4zNSwwLDEsMiwzLDQsNSw2LDAsMCwwLDAsMCwwLDAsMSw2MCwwLDAsMSwwLDEsMiwzLDQsNSw2LDEsMSwxLDEsMSwxLDAsMCwwLDAsMCwwLDEsMSwxLDEsMSwxLDAsMCwwLDAsMCwxLDEsMSwxLDEsMSwxLDAsMCwwLDAsMC40LDAsMC40LDAuMDI1LDAsMCwwLDkwMDAsMC4yNSwwLjE1LDAuNSwwLDgsNCwwLjUsMSwwLDAsMjAwLDAsMTAwMCwwLjksMCw0MDAwLDEsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwxLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMF0sInIiOltbMCwwLDAuOCwxXSxbMiwwLDAuNTUsMV0sWzAsMSwwLjE4LDBdLFszLDAsMC40LDBdXX0" },
  { id: "vocaloh", label: "Vocal Oh Choir · 人声哦唱", vowel: "哦", shareCode: "gs1.1.eyJzIjo0LCJ2IjpbMC43NSwxLDIsMCw3LDAuNjUsMC41LDEsMSwwLC01LDAuNCwwLjUsNSwxNTA0LDAuNDYsMC4xNSwwLDAsMC41NSwwLjksMC44NSwyLDEsMCw0LjksMC4wNSwxLDAsMSwwLjgsMC40MiwwLDIsMC4zNSwwLjIyLDAsMTIwLDIsMCwwLDAsMCwxLDAuMzUsMC41NSwwLjMyLDAsMC4zLDAuNSwwLjQsMCwwLjQsMC42LDAuNSwwLDAuNCwwLjYsMC4wMSwwLjMsMC41LDAuMywwLDEsMC41LDAuMywwLDAuMzUsMC44LDAuMDEyLDYsMC4zLDQsMC4yNSwwLDAsMCwwLDAuMjkyLDAsMC4zNSwwLDEsMiwzLDQsNSw2LDAsMCwwLDAsMCwwLDAsMSw2MCwwLDAsMSwwLDEsMiwzLDQsNSw2LDEsMSwxLDEsMSwxLDAsMCwwLDAsMCwwLDEsMSwxLDEsMSwxLDAsMCwwLDAsMCwxLDEsMSwxLDEsMSwxLDAsMCwwLDEsMC4xMiwwLDAuNCwwLjAyLDAsMCwwLDkwMDAsMC4yNSwwLjE1LDAuNSwwLDgsNCwwLjUsMSwwLDAsMjAwLDAsMTAwMCwwLjksMCw0MDAwLDEsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwxLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMF0sInIiOltbMCwwLDAuOCwxXSxbMiwwLDAuNTUsMV0sWzAsMSwwLjE4LDBdLFszLDAsMC40LDBdXX0" },
  { id: "vocalee", label: "Vocal Ee Choir · 人声衣唱", vowel: "衣", shareCode: "gs1.1.eyJzIjo0LCJ2IjpbMC43NSwxLDIsMCw3LDAuNjUsMC41LDEsMiwwLDQsMC40NSwwLjUsNSw1NjYsMC40MiwwLjE1LDAsMCwwLjQ1LDAuOCwwLjg1LDEuOSwxLDAsNS4yLDAuMDUsMSwwLDEsMC44LDAuNDIsMCwyLDAuMzUsMC4yMiwwLDEyMCwyLDAsMCwwLDAsMSwwLjM4LDAuNjUsMC4zNSwwLDAuMywwLjUsMC40LDAsMC40LDAuNiwwLjUsMCwwLjQsMC42LDAuMDEsMC4zLDAuNSwwLjMsMCwxLDAuNSwwLjMsMCwwLjM1LDAuOCwwLjAxMiw1LDAuMjUsNCwwLjIyLDAsMCwwLDAsMC4yMiwwLDAuMzUsMCwxLDIsMyw0LDUsNiwwLDAsMCwwLDAsMCwwLDEsNjAsMCwwLDEsMCwxLDIsMyw0LDUsNiwxLDEsMSwxLDEsMSwwLDAsMCwwLDAsMCwxLDEsMSwxLDEsMSwwLDAsMCwwLDAsMSwxLDEsMSwxLDEsMSwwLDAsMCwwLDAuNCwwLDAuNCwwLjAyLDAsMCwwLDkwMDAsMC4yNSwwLjE1LDAuNSwwLDgsNCwwLjUsMSwwLDAsMjAwLDAsMTAwMCwwLjksMCw0MDAwLDEsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwxLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLC0yLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMF0sInIiOltbMCwwLDAuOCwxXSxbMiwwLDAuNTUsMV0sWzAsMSwwLjE4LDBdLFszLDAsMC40LDBdXX0" },
  { id: "vocaloo", label: "Vocal Oo Choir · 人声呜唱", vowel: "呜", shareCode: "gs1.1.eyJzIjo0LCJ2IjpbMC43NSwxLDIsMCw3LDAuNywwLjUsMSwxLDAsLTcsMC40LDAuNSw1LDQwMDAsMC40OCwwLjE1LDAsMCwwLjYsMSwwLjg4LDIuMiwxLDAsNC44LDAuMDUsMSwwLDEsMC44MiwwLjQ1LDAsMiwwLjM1LDAuMjIsMCwxMjAsMiwwLDAsMCwwLDEsMC4zNSwwLjUsMC4zNSwwLDAuMywwLjUsMC40LDAsMC40LDAuNiwwLjUsMCwwLjQsMC42LDAuMDEsMC4zLDAuNSwwLjMsMCwxLDAuNSwwLjMsMCwwLjM1LDAuOCwwLjAxMiw2LDAuMyw0LDAuMjUsMCwwLDAsMCwwLjI3NCwwLDAuMzUsMCwxLDIsMyw0LDUsNiwwLDAsMCwwLDAsMCwwLDEsNjAsMCwwLDEsMCwxLDIsMyw0LDUsNiwxLDEsMSwxLDEsMSwwLDAsMCwwLDAsMCwxLDEsMSwxLDEsMSwwLDAsMCwwLDAsMSwxLDEsMSwxLDEsMSwwLDAsMCwxLDAuMTUsMCwwLjQsMC4wMTUsMCwwLDAsOTAwMCwwLjI1LDAuMTUsMC41LDAsOCw0LDAuNSwxLDAsMCwyMDAsMCwxMDAwLDAuOSwwLDQwMDAsMSwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDEsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsLTIsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwXSwiciI6W1swLDAsMC44LDFdLFsyLDAsMC41NSwxXSxbMCwxLDAuMTgsMF0sWzMsMCwwLjQsMF1dfQ" },
  { id: "vocalhum", label: "Vocal Hum Choir · 闭口哼鸣", vowel: "哼鸣", shareCode: "gs1.1.eyJzIjo0LCJ2IjpbMC43NSwxLDIsMCw3LDAuNjUsMC41LDEsMSwwLC00LDAuNDUsMC41LDUsMzgwMCwwLjQ1LDAuMTUsMCwwLDAuNiwxLDAuODUsMi4yLDEsMCw0LjcsMC4wNSwxLDAsMSwwLjg1LDAuNDgsMCwyLDAuMzUsMC4yMiwwLDEyMCwyLDAsMCwwLDAsMSwwLjMsMC41LDAuMywwLDAuMywwLjUsMC40LDAsMC40LDAuNiwwLjUsMCwwLjQsMC42LDAuMDEsMC4zLDAuNSwwLjMsMCwxLDAuNSwwLjMsMCwwLjM1LDAuOCwwLjAxMiw1LDAuMjUsMywwLjIsMCwwLDAsMCwwLjIzNCwwLDAuMzUsMCwxLDIsMyw0LDUsNiwwLDAsMCwwLDAsMCwwLDEsNjAsMCwwLDEsMCwxLDIsMyw0LDUsNiwxLDEsMSwxLDEsMSwwLDAsMCwwLDAsMCwxLDEsMSwxLDEsMSwwLDAsMCwwLDAsMSwxLDEsMSwxLDEsMSwwLDAsMCwxLDAuMTgsMCwwLjQsMC4wMjUsMCwxLDAsMTE1MCwwLjIsMC4xNSwwLjUsMCw4LDQsMC41LDEsMCwwLDIwMCwwLDEwMDAsMC45LDAsNDAwMCwxLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMSwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwtMiwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDAsMCwwLDBdLCJyIjpbWzAsMCwwLjgsMV0sWzIsMCwwLjU1LDFdLFswLDEsMC4xOCwwXSxbMywwLDAuNCwwXV19" },
] as const;

/** The patch a caller names, or `undefined` — so a tool can refuse an unknown id instead of guessing a voice. */
export function vocalPatchById(id: string): VocalPatch | undefined {
  return FACTORY_VOCAL_PATCHES.find((patch) => patch.id === id);
}
