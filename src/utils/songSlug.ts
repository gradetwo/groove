/**
 * The middle token of a rendered file's name, from the caller's own song title.
 *
 * The old version whitelisted to `[a-z0-9-]` and fell back to `master` when the result was empty — which is right for an unnamed song and **wrong
 * for a named one whose name is not ASCII**: 《星火燎原：宇宙交响史诗》 slugs to the empty string, becomes `master`, and lands on exactly the same path
 * as every other non-ASCII title. Two different songs, one file, silently overwritten. The report that found this put the bug in the test file that
 * mirrors this whitelist; the mirror is in `src/test/mcpSong.test.ts` and the code that writes the file is in `mcp/render/worker.ts`.
 *
 * Three properties, in the order they matter:
 *
 *   * **an ASCII name is unchanged, byte for byte** — `Neon Rain` is still `neon-rain`, so every existing file keeps its name;
 *   * **a non-ASCII name that would slug to nothing gets a stable token derived from the name** — stable so the same title re-renders to the same
 *     file, derived so two different titles cannot collide;
 *   * **no name at all is still `master`** — that is what an unnamed song has always produced and it is not a collision, it is the default.
 *
 * The token is always `[a-z0-9-]`, so the path cannot depend on the caller's text for safety — the `replace` at the call site stays as a second line
 * of defence rather than the only one.
 */
const MAX_SLUG_LENGTH = 40;

/** FNV-1a, 32-bit, over the UTF-16 code units — no dependency, deterministic, and enough to separate titles. */
function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function songSlug(name: string | undefined | null): string {
  const raw = (name ?? "").trim();
  const ascii = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);
  if (ascii.length > 0) return ascii;
  // Nothing usable in ASCII: unnamed stays the historical default, a real title gets a token of its own.
  if (raw.length === 0) return "master";
  return `song-${shortHash(raw)}`;
}
