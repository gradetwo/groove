import { GenreRelation, RelationType } from "../types/genre";
import { GENRE_RELATIONS } from "./relations";
import { GENRE_INDEX_MAP } from "./index/loader";

/**
 * N-06: "same-origin" (同源) comparison.
 *
 * The relation graph already links every one of the 159 genres (300 relations, verified
 * by the red-line gate), but it was only ever consumed as a decorative tree. This turns
 * it into a teaching aid: from the pair you are comparing, jump straight to its
 * ancestors, descendants and close relatives.
 */

export interface LineageSibling {
  id: string;
  /** The relation as seen FROM the queried genre. */
  type: RelationType;
  weight: number;
  description?: { en: string; zh: string };
}

export interface LineageGroups {
  /** Genres this one derives from. */
  ancestors: LineageSibling[];
  /** Genres that derive from this one. */
  descendants: LineageSibling[];
  /** Fusions, influences and regional variants, in either direction. */
  related: LineageSibling[];
}

const EMPTY: LineageGroups = { ancestors: [], descendants: [], related: [] };

function known(id: string): boolean {
  return Boolean(GENRE_INDEX_MAP[id]);
}

/**
 * Resolves the lineage of `genreId`. Unknown ids on either end are dropped so a stale
 * relation can never render a dead chip, and a relation pointing at itself is ignored.
 */
export function getLineage(
  genreId: string,
  relations: GenreRelation[] = GENRE_RELATIONS
): LineageGroups {
  if (!genreId) return { ...EMPTY };

  const ancestors: LineageSibling[] = [];
  const descendants: LineageSibling[] = [];
  const related: LineageSibling[] = [];
  const seen = new Map<string, LineageSibling>();

  const push = (bucket: LineageSibling[], sibling: LineageSibling) => {
    if (sibling.id === genreId || !known(sibling.id)) return;
    const existing = seen.get(sibling.id);
    // Keep the strongest claim about a given genre so the list does not show it twice
    // under two headings.
    if (existing && existing.weight >= sibling.weight) return;
    if (existing) {
      for (const list of [ancestors, descendants, related]) {
        const at = list.indexOf(existing);
        if (at !== -1) list.splice(at, 1);
      }
    }
    seen.set(sibling.id, sibling);
    bucket.push(sibling);
  };

  for (const relation of relations) {
    const isOutgoing = relation.source === genreId;
    const isIncoming = relation.target === genreId;
    if (!isOutgoing && !isIncoming) continue;

    const otherId = isOutgoing ? relation.target : relation.source;
    const sibling: LineageSibling = {
      id: otherId,
      type: relation.type,
      weight: relation.weight,
      description: relation.description,
    };

    switch (relation.type) {
      case "origin_from":
        // "target originates from source": ancestors when this genre is the target.
        if (isIncoming) push(ancestors, sibling);
        else push(descendants, sibling);
        break;
      case "derived_to":
        // Mirror of origin_from.
        if (isOutgoing) push(descendants, sibling);
        else push(ancestors, sibling);
        break;
      default:
        push(related, sibling);
        break;
    }
  }

  const byWeight = (a: LineageSibling, b: LineageSibling) => b.weight - a.weight || a.id.localeCompare(b.id);
  return {
    ancestors: ancestors.sort(byWeight),
    descendants: descendants.sort(byWeight),
    related: related.sort(byWeight),
  };
}

/** Flat list (ancestors → descendants → related) capped for compact UI rows. */
export function getLineageList(genreId: string, limit = 8, relations?: GenreRelation[]): LineageSibling[] {
  const groups = getLineage(genreId, relations);
  return [...groups.ancestors, ...groups.descendants, ...groups.related].slice(0, limit);
}
