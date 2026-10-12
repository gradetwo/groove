/**
 * Navigation vocabulary: the set of destinations the app can show.
 *
 * This union lived in `src/components/Header.tsx`, which meant every consumer — the router, the
 * phone tab bar, the tutorial data, a keyboard-shortcut hook — depended on a *component* to name a
 * destination. `src/data/tutorialCourses.ts` needed it from the domain layer and
 * `src/hooks/useAppShortcuts.ts` from the logic layer, so a rename inside the header's props would
 * have rippled into both. A destination is not a component's shape; it is shared vocabulary, and it
 * lives on its own.
 *
 * Deliberately framework-free and dependency-free, so any layer can import it — which is the point.
 * `Header` re-exports it so existing importers keep working; the layering gate rejects new logic
 * files that reach into a component for it.
 */
export type NavTab =
  | "studio"
  | "chords"
  | "kick"
  | "maker"
  | "analyzer"
  | "console"
  | "masterclass"
  | "galaxy"
  | "horizontal-timeline"
  | "vertical-timeline"
  | "compare"
  | "challenge"
  | "detail";
