/**
 * The lightweight genre shape the rail (and anything that lists genres) consumes.
 *
 * A-01: naming a genre in a list must not require the full `Genre` with its sequencer pattern, or
 * the genre data chunks end up in the first paint. That optimisation is a *data* decision, so the
 * type belongs here rather than inside the component that first needed it — the genre-switching
 * hook builds these and was importing a `.tsx` file to do it.
 */
export interface GenreRailItem {
  id: string;
  name: string;
  category: string;
  origin_year?: string;
  default_bpm?: number;
  isCustom?: boolean;
}
