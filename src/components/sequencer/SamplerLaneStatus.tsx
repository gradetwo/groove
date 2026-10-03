/**
 * ⭐ **"正在获取音源" for the studio's transport — the same sentence, the same count, the same testids as the genre page.**
 *
 * ## Why it is a component and not a block inside `StudioView`
 *
 * `GenreDetailView` draws this wait inline, beside its two audition buttons. The studio's press happens in the toolbar, so
 * its wait belongs on the studio route rather than under a button that is somewhere else — but the *shape* must not be a
 * second one: the owner learnt to read "正在获取音源… 3 / 12 已就绪" on the genre page, and two spellings of the same wait
 * would be two things to recognise. So this renders the three `detail_sampling_*` keys the genre page already uses
 * (`src/i18n/locales/explore.ts`), the same `sampler-loading` / `sampler-problems` testids, and the same determinate bar.
 *
 * ## ⚠️ The wrapper is always in the tree, and that is load-bearing
 *
 * `StudioView` renders this as a sibling of `SequencerPanel`, and that view's own comments record what a **conditional
 * sibling** costs there: the sibling list changes, React remounts the sequencer, and every scheduled voice and step cell
 * is thrown away for a cosmetic change (`FirstRunPrompt` is rendered unconditionally for exactly this reason). So the
 * element is unconditional and only its *contents* are conditional — the same idiom `SaveIndicator` uses with its
 * `visible` prop. `hidden` is `display:none`, so an idle studio gains no layout either.
 *
 * ## Why the count, and why it is not an animation
 *
 * `total` is known before the first request (`prepareSamplerLanes` computes it from the plan), so the number is a fact
 * about work that remains rather than a spinner that means "something, somewhere". That is the shape `smplr` states it
 * wants (*"`total` is known before loading starts, so you can display a determinate progress bar"*) and the shape
 * `samplerLanePrepare.ts` was written to carry.
 */
import { useLanguage } from "../../i18n/LanguageContext";
import type { SamplerLaneProgress } from "../../audio/samplerLanePrepare";

export interface SamplerLaneStatusProps {
  /**
   * The recordings still being resolved, or `null` when there is nothing to wait for.
   *
   * `total === 0` is the ordinary case for a pattern with no recorded lane, and it is rendered as nothing at all rather
   * than as "0 / 0": a progress display for work that never happened is the "control that lies" this repository keeps
   * removing.
   */
  progress: SamplerLaneProgress | null;
  /** One sentence per lane this catalogue could not serve, in `reportSampledLaneProblems`' own prefixed shape. */
  problems: readonly string[];
}

export function SamplerLaneStatus({ progress, problems }: SamplerLaneStatusProps) {
  const { t } = useLanguage();
  const waiting = progress !== null && progress.total > 0;
  const percent = waiting && progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;

  return (
    <div className={waiting || problems.length > 0 ? "space-y-2" : "hidden"} data-testid="sampler-lane-status">
      {waiting && (
        <div
          role="status"
          aria-live="polite"
          data-testid="sampler-loading"
          className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#0c0d11] border border-accent/40"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse shadow-[0_0_10px_#f5b73d]" />
          <span className="text-xs sm:text-sm font-bold text-[#f0ede6]">{t("detail_sampling_loading")}</span>
          <span className="ml-auto font-mono text-xs text-accent">
            {t("detail_sampling_progress", { loaded: progress.loaded, total: progress.total })}
          </span>
          <span className="w-24 h-1.5 rounded-full bg-neutral-800 overflow-hidden" aria-hidden="true">
            <span className="block h-full bg-accent transition-[width] duration-200" style={{ width: `${percent}%` }} />
          </span>
        </div>
      )}

      {problems.length > 0 && (
        <div
          role="alert"
          data-testid="sampler-problems"
          className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/40 space-y-1"
        >
          <p className="text-xs font-bold text-red-300">{t("detail_sampling_problem")}</p>
          <ul className="space-y-0.5">
            {problems.map((problem) => (
              <li key={problem} className="font-mono text-[11px] text-red-200/90 break-all">
                {problem}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
