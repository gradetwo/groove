/**
 * ⭐ **The timeline is a curated story, not a catalogue — and it still has to obey the search field.**
 *
 * The home screen's list and its `GENRES · n` count narrowed with the query while the timeline above them kept drawing
 * the whole set, so on a phone — where the timeline is the prominent block — typing looked like it did nothing at all
 * (owner, 2026-10-11).
 *
 * The matching rule is **passed in** rather than imported: the phone shell owns what "matches" means, and a module that
 * reached back into `src/mobile` for it would breach the boundary rule that keeps the shell contained. The predicate is
 * the same one the list uses, so the two can no longer disagree.
 */
export function filterTimelineStories<T extends { genre_ids: string[] }>(
  stories: readonly T[],
  keeps: (genreId: string) => boolean,
): { story: T; genreIds: string[] }[] {
  const out: { story: T; genreIds: string[] }[] = [];
  for (const story of stories) {
    const genreIds = story.genre_ids.filter(keeps);
    if (genreIds.length > 0) out.push({ story, genreIds });
  }
  return out;
}
