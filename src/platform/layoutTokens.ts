/**
 * Layout boundaries that CSS and TypeScript both need.
 *
 * ## Why this file exists
 *
 * Three numbers are load-bearing on both sides of the CSS/TS line, and each one had already been
 * written twice by hand:
 *
 *   - `PHONE_MAX_WIDTH_PX` — the JS phone classification and the `@media (max-width: …)` block that
 *     hides the desktop-only track-header controls;
 *   - `PHONE_MAX_HEIGHT_PX` — the JS short-landscape check and the `@media (max-height: …)` block.
 *     These were 480 and 500 for a while: a 490 px-tall landscape viewport got the compressed
 *     stylesheet while JS still called it a tall phone, so one rule sized a control and another
 *     positioned it;
 *   - `TRANSPORT_ROW_WIDTH_PX` — the width the phone transport claims when it shares the bottom row
 *     with the tab bar, used by JS and by the `--mobile-transport-row-w` custom property.
 *
 * A unit test pinned each pair, which is how they were kept equal — but a test that asserts "copy A
 * equals copy B" has to be written again for every new pair, and it never notices a *third* copy.
 * So the number lives here once, and `scripts/layout_tokens.mjs` writes it into `src/index.css`
 * (`npm run layout:sync`), with `npm run check:layout` in `verify` failing on any drift — the same
 * arrangement as the version header in `ROADMAP_V2.md`.
 *
 * ## What belongs here
 *
 * Only a value that CSS and TypeScript must agree on. A layout value used by one side alone — the
 * track-header width, the step-cell heights, the density tiers — stays where it is: moving those
 * here would add a generator hop for nothing. The rule of thumb is the test that used to exist:
 * if the only reason to write a test is "two copies must match", the value belongs in this file.
 *
 * Kept dependency-free and DOM-free: it is imported by the device hook, by components that size
 * themselves, and by a build script.
 */

/**
 * Widest viewport that is still a phone.
 *
 * Used twice: `useDeviceCapabilities` builds a `matchMedia` query from it, and the phone stylesheet
 * uses it as its `max-width` boundary. A viewport at exactly this width is a phone — the media query
 * is inclusive on both sides.
 */
export const PHONE_MAX_WIDTH_PX = 639;

/**
 * Tallest viewport that is still short enough to need the compressed landscape layout.
 *
 * Written as an inclusive `max-height` on the CSS side and as `max-height` in the device hook's
 * query, so the two agree at the boundary itself (the 480/500 bug was exactly a disagreement one
 * pixel away from it).
 */
export const PHONE_MAX_HEIGHT_PX = 500;

/**
 * Width the phone transport claims when it shares the bottom row with the navigation bar.
 *
 * The panel sizes the slot with `min(var(--mobile-transport-row-w), 55vw)`, and the bar itself
 * renders its own width; if the two disagree the transport is clipped or leaves a gap. Must stay
 * wide enough for its five 44 px controls plus four 4 px gaps and 12 px of container padding.
 */
export const TRANSPORT_ROW_WIDTH_PX = 320;
