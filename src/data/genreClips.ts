/**
 * ⭐ **The pre-generated phone clips: the manifest, and when it has gone stale** (owner's decision, 2026-10-10:
 * *"大部分都可以考虑提前生成 mp3，手机端只是下载播放而已"*, *"MP3 不入 git 库，同时有脚本重新批量生成"*).
 *
 * The audio itself never enters this repository — it lives in a Cloudflare Worker's static assets — and this file is the
 * **list** of what is there: the app reads it to know what a phone can play without loading a single sample. Three things
 * follow from that split, and this module exists to hold all three in one place:
 *
 *  · **A clip must say what it is**: its genre, how long it is, how loud it was measured to be, and **how many of its
 *    lanes carry a real recording rather than the built-in synth** — measured, not claimed, because a genre's arrangement
 *    mixes both (measured 2026-10-10: melodic-house 2 of 8 lanes carry a recording, bossa-nova 6 of 8).
 *  · **A clip is only true for the build that made it.** The engine and the arrangement both change, so the manifest
 *    carries `engineVersion` and `recipeVersion`; `staleClips` is the criterion's half — a shipped manifest that names a
 *    version other than this build's is a **lie about today's sound**, which is worse than no clip at all.
 *  · **An empty manifest must say why it is empty.** Until the batch has run, "no clips" is honest as long as it is
 *    explicit; a silently empty list is how "the phone has no audio" becomes nobody's decision.
 */

export interface GenreClip {
  genreId: string;
  /** Where the MP3 actually is (the Worker's static assets), absolute or root-relative. */
  url: string;
  seconds: number;
  bytes?: number;
  /** Gated loudness of the clip, measured with the same tooling as a render's own report. */
  lufs?: number;
  /** Which build's sound this clip is: the engine version and the recipe that cut it. */
  engineVersion: string;
  recipeVersion: string;
  generatedAt: string;
  /** ⭐ Measured, not claimed: how much of the arrangement is a real recording. */
  recordedLanes: number;
  synthLanes: number;
}

export interface GenreClipManifest {
  /** The bar the clip starts at, and how many bars it covers — so a clip is reproducible rather than "some 20 seconds". */
  bars?: number;
  /** Present only while the list is empty, and it must be a sentence a reviewer can check. */
  emptyReason?: string;
  clips: GenreClip[];
}

const REQUIRED: readonly (keyof GenreClip)[] = [
  "genreId",
  "url",
  "seconds",
  "engineVersion",
  "recipeVersion",
  "generatedAt",
  "recordedLanes",
  "synthLanes",
];

/** Strict on purpose: a manifest that names a field wrong is a manifest that would play the wrong sound. */
export function readClipManifest(raw: unknown): GenreClipManifest {
  if (typeof raw !== "object" || raw === null) throw new Error("the clip manifest must be an object");
  const manifest = raw as Record<string, unknown>;
  if (!Array.isArray(manifest.clips)) throw new Error("the clip manifest must carry a `clips` array");
  const clips = manifest.clips.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) throw new Error(`clips[${index}] must be an object`);
    const clip = entry as Record<string, unknown>;
    for (const field of REQUIRED) {
      if (clip[field] === undefined) throw new Error(`clips[${index}] is missing \`${field}\``);
    }
    if (typeof clip.genreId !== "string" || clip.genreId.trim() === "") throw new Error(`clips[${index}].genreId must be a non-empty string`);
    if (typeof clip.url !== "string" || clip.url.trim() === "") throw new Error(`clips[${index}].url must be a non-empty string`);
    if (typeof clip.seconds !== "number" || !(clip.seconds > 0)) throw new Error(`clips[${index}].seconds must be a positive number`);
    if (typeof clip.recordedLanes !== "number" || typeof clip.synthLanes !== "number") {
      throw new Error(`clips[${index}] must count its recorded and synth lanes`);
    }
    return clip as unknown as GenreClip;
  });
  const manifestOut: GenreClipManifest = { clips };
  if (typeof manifest.bars === "number") manifestOut.bars = manifest.bars;
  if (typeof manifest.emptyReason === "string") manifestOut.emptyReason = manifest.emptyReason;
  if (clips.length === 0 && !manifestOut.emptyReason) {
    throw new Error("an empty clip manifest must say why it is empty (`emptyReason`), so 'the phone has no audio' is a decision rather than an accident");
  }
  return manifestOut;
}

export interface StaleClip {
  genreId: string;
  reason: string;
}

/**
 * ⭐ **Which clips are no longer true.** A clip is a recording of a particular build's sound: when the engine version or
 * the cutting recipe moves on, the clip is a claim about today that was measured yesterday. This is the same shape as the
 * loudness baseline's freshness rule (`check:loudness:fresh`), for the same reason.
 */
export function staleClips(manifest: GenreClipManifest, engineVersion: string, recipeVersion: string): StaleClip[] {
  return manifest.clips
    .map((clip) => {
      if (clip.engineVersion !== engineVersion) {
        return { genreId: clip.genreId, reason: `cut by engine ${clip.engineVersion}, this build is ${engineVersion}` };
      }
      if (clip.recipeVersion !== recipeVersion) {
        return { genreId: clip.genreId, reason: `cut by recipe ${clip.recipeVersion}, this recipe is ${recipeVersion}` };
      }
      return undefined;
    })
    .filter((entry): entry is StaleClip => entry !== undefined);
}

export function clipForGenre(manifest: GenreClipManifest, genreId: string): GenreClip | undefined {
  return manifest.clips.find((clip) => clip.genreId === genreId);
}
