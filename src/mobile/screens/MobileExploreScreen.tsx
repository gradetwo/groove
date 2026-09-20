/**
 * 探索 (the explore module, M6).
 *
 * Three sub-pages, and every one of them is the **desktop view, reused as-is** rather than a phone-only
 * reimplementation — the mature views already do the work, and they hold up especially well in
 * landscape:
 *
 *  - **和弦走向** — `ChordProgressionsView`: the curated progressions and their auditions.
 *  - **底鼓设计** — `KickAnatomyView`: the kick's three physical layers, feel values and visualizers.
 *  - **律动解构** — `MasterclassView`: the polyrhythm / feel lessons that take a groove apart.
 *
 * 和弦走向 comes first: it is the sub-page the user reaches for, and it is the default.
 *
 * All three arrive through `React.lazy`, so the phone bundle does not carry the desktop audio, canvas
 * and data graphs until a sub-page is actually opened. Each one sits inside `[data-legacy="desktop"]`:
 * the reused controls keep their desktop sizes, so the phone touch-target gate skips just those
 * subtrees while this screen's own chrome — the sub-tab switcher — is still held to 44 px.
 *
 * What the reused views deliberately do **not** get is the shell's transport (`isPlaying` /
 * `onTogglePlay` / `onApplyPattern`). Each view owns its engine and its own audition transport, and
 * silently driving the phone's loop from a desktop panel would replace what the user is working on.
 * The props stay on the interface because `MobileApp` still passes them.
 */
import React, { useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import type { Genre, SequencerPattern } from "../../types/genre";

type ExplorePage = "chords" | "kick" | "groove";

/** The desktop views, loaded on demand and rendered inside the phone's 探索 page. */
const LegacyChordView = React.lazy(() =>
  import("../../views/ChordProgressionsView").then((m) => ({ default: m.ChordProgressionsView }))
);
const LegacyKickView = React.lazy(() =>
  import("../../views/KickAnatomyView").then((m) => ({ default: m.KickAnatomyView }))
);
const LegacyGrooveView = React.lazy(() =>
  import("../../views/MasterclassView").then((m) => ({ default: m.MasterclassView }))
);

/**
 * `MASTERCLASSES[0].id` — the polyrhythm lesson, the most literal "take a groove apart" entry. It is a
 * literal rather than an import so the masterclass data module stays out of the phone's eager graph.
 */
const GROOVE_LESSON_ID = "polyrhythm";

/**
 * Stand-in for the reused views' own desktop affordances (help / return to studio / bake).
 *
 * The phone has no studio tab or guide modal to navigate to, and an inert button is better than one
 * that yanks the user out of 探索. A zero-argument function satisfies every one of those handler
 * types, so one constant covers all three views.
 */
const noop = () => {};

/** One Suspense placeholder for all three lazy chunks — the phone only needs "something is coming". */
const LegacyFallback = () => (
  <p className="m-mono text-[10px] text-[var(--m-ink-3)]">…</p>
);

export interface MobileExploreScreenProps {
  genreId?: string;
  isPlaying: boolean;
  onTogglePlay: (genre: Genre) => void;
  onApplyPattern: (pattern: SequencerPattern) => void;
}

export function MobileExploreScreen(_props: MobileExploreScreenProps) {
  const { t } = useLanguage();
  // 和弦走向 first (the user's order), and it is the desktop view itself — see below.
  const [page, setPage] = useState<ExplorePage>("chords");

  return (
    <section className="m-rise px-4 pt-2" data-testid="mobile-explore" data-page={page}>
      <h1 className="text-[22px] font-bold leading-none">{t("mobile_module_explore")}</h1>

      <div className="m-rail mt-3" role="tablist" aria-label={t("mobile_module_explore")}>
        {(
          [
            ["chords", "mobile_explore_chords"],
            ["kick", "mobile_explore_kick"],
            ["groove", "mobile_explore_groove"],
          ] as Array<[ExplorePage, string]>
        ).map(([id, labelKey]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={page === id}
            data-testid={`mobile-explore-tab-${id}`}
            onClick={() => setPage(id)}
            className={`m-press min-h-[46px] min-w-[46px] flex-none rounded-full border px-3.5 text-[12px] ${
              page === id
                ? "border-[var(--m-gold)] bg-[var(--m-gold)] text-[var(--m-on-gold)]"
                : "border-[var(--m-line-2)] text-[var(--m-ink-2)]"
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {page === "chords" && (
        /**
         * The **desktop chord view, reused as-is**.
         *
         * The user asked for the old modules to come along ("和弦走向横屏后就很好用"), and this is the
         * honest way to do that: the view already has the auditions, the key/timbre pickers and a
         * layout that works in landscape.
         */
        <div data-legacy="desktop" data-testid="mobile-explore-chords-legacy" className="mt-3">
          <React.Suspense fallback={<LegacyFallback />}>
            <LegacyChordView />
          </React.Suspense>
        </div>
      )}
      {page === "kick" && (
        // The desktop kick laboratory, with its visualizers and its shared engine. The `noop`s keep its
        // guide / workbench buttons inert instead of unmounting them.
        <div data-legacy="desktop" data-testid="mobile-explore-kick-legacy" className="mt-3">
          <React.Suspense fallback={<LegacyFallback />}>
            <LegacyKickView onOpenHelp={noop} onOpenStudio={noop} />
          </React.Suspense>
        </div>
      )}
      {page === "groove" && (
        // The desktop masterclass, opened on the polyrhythm lesson. `onOpenStudio` is required by the
        // view's props, so a no-op stands in for the studio tab the phone does not have.
        <div data-legacy="desktop" data-testid="mobile-explore-groove-legacy" className="mt-3">
          <React.Suspense fallback={<LegacyFallback />}>
            <LegacyGrooveView initialLessonId={GROOVE_LESSON_ID} onOpenStudio={noop} />
          </React.Suspense>
        </div>
      )}
    </section>
  );
}
