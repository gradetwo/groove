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
 *
 * They also do **not** get the desktop-only navigation handlers (`onOpenHelp` / `onOpenStudio`): the
 * phone has no guide modal, no 工作台 tab and no "bake to studio" destination, and passing a no-op
 * only put dead buttons on screen. `KickAnatomyView` renders its whole guide/studio block only when
 * one of those props is present, and `MasterclassView`'s `onOpenStudio` is optional, so omitting them
 * removes the affordances instead of leaving them inert. See `legacyViews.css` for the phone-specific
 * layout pass over the reused desktop markup.
 */
import React, { useState, useTransition } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import type { SequencerPattern } from "../../types/genre";

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

/** One Suspense placeholder for all three lazy chunks — the phone only needs "something is coming". */
const LegacyFallback = () => (
  <p className="m-mono text-[10px] text-[var(--m-ink-3)]">…</p>
);

export interface MobileExploreScreenProps {
  genreId?: string;
  isPlaying: boolean;
  /** Accepted (and ignored) for interface symmetry with the other modules; the reused views own their
      own transport, so the id is never used here. */
  onTogglePlay: (genreId: string) => void;
  onApplyPattern: (pattern: SequencerPattern) => void;
}

export function MobileExploreScreen(_props: MobileExploreScreenProps) {
  const { t } = useLanguage();
  // 和弦走向 first (the user's order), and it is the desktop view itself — see below.
  const [page, setPage] = useState<ExplorePage>("chords");
  /**
   * The view that is actually mounted, which trails `page` by one frame.
   *
   * These are the *desktop* views, reused as-is: the chord page alone builds ~1 000 elements, and on a
   * throttled phone that is a single 1 350 ms task (`scripts/measure_phone_jank.mjs`). Rendering it in
   * the same commit as the tab click means the tap produces no feedback at all until the whole page is
   * built; deferring the mount by a frame lets the segment's own selected state paint first, and
   * `startTransition` marks the heavy render as interruptible so the browser can keep painting while it
   * happens. The user sees the switch immediately and the view arrives a beat later, which is the
   * difference between "slow" and "stuck".
   */
  const [mounted, setMounted] = useState<ExplorePage>("chords");
  const [isPending, startTransition] = useTransition();
  /**
   * Picking a sub-page is two updates: the segment's own state (urgent — it is what the finger touched)
   * and the view's mount (a transition, so React may paint the segment first and build ~1 000 elements
   * afterwards, in a render it can interrupt). No timer and no `requestAnimationFrame`: the transition is
   * React's own version of "later, but as soon as you can", and it behaves the same in a browser and in a
   * test.
   */
  const selectPage = (next: ExplorePage) => {
    setPage(next);
    startTransition(() => setMounted(next));
  };
  /** True while the newly selected view has not been built yet: the skeleton stands in for it. */
  const loadingNext = mounted !== page || isPending;

  return (
    <section className="m-rise px-4 pt-2" data-testid="mobile-explore" data-page={page}>
      <h1 className="text-[22px] font-bold leading-none">{t("mobile_module_explore")}</h1>

      {/*
        The switcher is a full-width segmented control in a card, not a floating pill rail: on a phone
        it reads as the page's own header chrome and each segment keeps a 46 px tap target. It stays
        outside `[data-legacy="desktop"]`, so the touch-target gate still measures it.
      */}
      <div
        className="mt-3 grid grid-cols-3 gap-1 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-1"
        role="tablist"
        aria-label={t("mobile_module_explore")}
      >
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
            onClick={() => selectPage(id)}
            className={`m-press min-h-[46px] min-w-[46px] rounded-xl px-2 text-[12px] ${
              page === id
                ? "bg-[var(--m-gold)] font-semibold text-[var(--m-on-gold)]"
                : "text-[var(--m-ink-2)]"
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {mounted === "chords" && (
        /**
         * The **desktop chord view, reused as-is**.
         *
         * The user asked for the old modules to come along ("和弦走向横屏后就很好用"), and this is the
         * honest way to do that: the view already has the auditions, the key/timbre pickers and a
         * layout that works in landscape. It gets no studio / piano-roll handlers, so those desktop
         * CTAs never render.
         */
        <div data-legacy="desktop" data-testid="mobile-explore-chords-legacy" className="mt-3">
          <React.Suspense fallback={<LegacyFallback />}>
            {/* Collapsed on the phone: see `initialBuilderCollapsed` — it is what makes this page open. */}
            <LegacyChordView initialBuilderCollapsed />
          </React.Suspense>
        </div>
      )}
      {mounted === "kick" && (
        // The desktop kick laboratory, with its visualizers and its shared engine. Without
        // `onOpenHelp` / `onOpenStudio` its whole guide + return-to-studio block is not rendered.
        <div data-legacy="desktop" data-testid="mobile-explore-kick-legacy" className="mt-3">
          <React.Suspense fallback={<LegacyFallback />}>
            <LegacyKickView />
          </React.Suspense>
        </div>
      )}
      {mounted === "groove" && (
        // The desktop masterclass, opened on the polyrhythm lesson. `onOpenStudio` is left off, which
        // makes the view drop its "bake to studio" CTA for the phone.
        <div data-legacy="desktop" data-testid="mobile-explore-groove-legacy" className="mt-3">
          <React.Suspense fallback={<LegacyFallback />}>
            <LegacyGrooveView initialLessonId={GROOVE_LESSON_ID} />
          </React.Suspense>
        </div>
      )}
      {/*
        The skeleton for a view that has been picked but not built yet. It is the same placeholder the
        Suspense boundary uses for the chunk itself, so the two kinds of waiting look alike.
      */}
      {loadingNext && <LegacyFallback />}
    </section>
  );
}
