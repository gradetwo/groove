/**
 * E-10 support: keep the track inspector pointed at the same *track* across row reorders.
 *
 * The inspector is addressed by row index, and `REORDER_TRACKS` swaps two rows. Without this
 * remap, moving a row while its inspector is open would silently start editing the neighbour.
 *
 * Pure and exported separately from `StudioView` so the swap rule is unit-testable without
 * rendering the whole studio.
 */
export function followReorderedRow(
  current: number | null,
  fromIndex: number,
  toIndex: number
): number | null {
  if (current === null) return current;
  // A no-op move (already at the top/bottom) must leave the selection alone.
  if (fromIndex === toIndex) return current;
  if (current === fromIndex) return toIndex;
  if (current === toIndex) return fromIndex;
  return current;
}
