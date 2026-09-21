/**
 * Per-genre artwork.
 *
 * The library shows one tile per genre and every genre should look like *itself*, not like a category
 * colour repeated. Two layers, in order:
 *
 *  1. `public/covers/<genre-id>.jpg` when it exists — drop a real photo in and it wins, with no code
 *     change. That is the hook for licensing actual artwork, which is a decision for whoever ships it,
 *     not something a build step can invent.
 *  2. otherwise a **generated** cover: a deterministic gradient seeded by the genre id, tinted by its
 *     category. Not stock photography, and the docs say so — but every genre gets a distinct,
 *     recognisable tile today.
 */

/**
 * Category hue ranges, taken from the reference artwork the user pointed at: an aurora palette of
 * violet → pink → teal over a deep navy ground, not flat category colours.
 */
const CATEGORY_HUES: Record<string, [number, number]> = {
  Electronic: [168, 196],
  "Rock/Metal": [318, 344],
  "Hip Hop": [256, 284],
  "Jazz/Blues": [204, 232],
  "Pop/R&B": [286, 312],
  "Latin/World": [150, 178],
};

/**
 * One colour per category, from the reference palette.
 *
 * The desktop galaxy view derives colours from cluster membership; the phone shell needs exactly six
 * stable, high-contrast swatches, so it maps the six categories it already has rather than inventing a
 * seventh colour source. It lives beside the generated art (rather than on the home screen) so the
 * player bar and the player can use it without statically importing the home screen — which would drag
 * the library list's module into the shell's first-paint chunk.
 */
export const CATEGORY_SWATCH: Record<string, string> = {
  // A cool, high-contrast set. The reference designs leaned on amber for everything, which made every
  // genre's tile look identical (and yellow); these six read as distinct at tile size.
  Electronic: "#5eead4",
  "Rock/Metal": "#fb7185",
  "Hip Hop": "#a78bfa",
  "Jazz/Blues": "#60a5fa",
  "Pop/R&B": "#f0abfc",
  "Latin/World": "#34d399",
};

/** Stable 32-bit hash: the same genre always gets the same art. */
export function hashGenreId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The real cover if one has been dropped in `public/covers/`, else null. */
export function genreCoverUrl(id: string): string {
  return `/covers/${encodeURIComponent(id)}.jpg`;
}

/** A CSS background for a genre's tile: deterministic, distinct, and no asset required. */
export function genreArtBackground(genre: { id: string; category: string }): string {
  const hash = hashGenreId(genre.id);
  const [hueA, hueB] = CATEGORY_HUES[genre.category] ?? [172, 196];
  const spread = hueB - hueA;
  const first = hueA + (hash % Math.max(1, Math.abs(spread) + 1)) * Math.sign(spread || 1);
  const second = first + 34;
  const angle = 120 + (hash % 7) * 20;
  const blob = 40 + (hash % 40);
  // Three aurora bands over a dark ground: the layered look of the reference's covers, generated
  // rather than photographed (see the file header for why).
  return [
    `radial-gradient(130% 90% at ${blob}% 8%, hsl(${first} 82% 62%) 0%, transparent 58%)`,
    `radial-gradient(120% 110% at ${100 - blob}% 34%, hsl(${second} 76% 52%) 0%, transparent 62%)`,
    `radial-gradient(150% 120% at 50% 118%, hsl(${(first + second) / 2} 70% 40%) 0%, transparent 66%)`,
    `linear-gradient(${angle}deg, hsl(${first} 60% 14%), hsl(${second} 55% 8%))`,
  ].join(", ");
}
