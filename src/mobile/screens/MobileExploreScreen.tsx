/**
 * 探索 (the explore module, M6).
 *
 * Three sub-pages, all of them *doing* something rather than describing it:
 *
 *  - **底鼓设计** — the kick's three physical layers (SUB / THUMP / CLICK) and three feel values, with
 *    the four curated presets from `AnatomyKickEngine`. Firing it is one tap; the sound is the point.
 *  - **和弦走向** — the curated progressions from `src/data/popularProgressions.ts`, grouped by
 *    category and auditioned through `ChordAudioEngine` in the key they are written in.
 *  - **律动解构** — take the current genre's groove apart: four lanes with their real steps, and a tap
 *    drops a lane out of the loop that is playing (the pattern is re-sent to the engine, so the change
 *    is audible on the next bar).
 *
 * What did **not** come along from the desktop: "载入工作台" (bake to the sequencer) and the custom-kick
 * preset save/delete. Both need a workspace to write into, and on a phone the module that owns the
 * workspace already has its own entry point; two buttons that silently replace what the user is
 * working on are worse than no buttons.
 *
 * ## Landscape
 *
 * The reference has no orientation handling at all (a fixed 432 px column), so this is new design
 * rather than a port: in landscape the sub-page body becomes two columns (controls beside the list)
 * via a `@media (orientation: landscape)` rule in `mobile.css`, and the whole surface is capped so it
 * never grows taller than the viewport. The tests assert the layout hooks; the E2E measures the
 * rendered column count on a landscape target.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flame } from "lucide-react";
import { ALL_GENRES } from "../../data/genres";
import { patternFromGenre } from "../../data/genreMix";
import { POPULAR_PROGRESSION_CATEGORIES, POPULAR_PROGRESSIONS } from "../../data/popularProgressions";
import { KICK_PRESETS, globalAnatomyKickEngine } from "../../audio/AnatomyKickEngine";
import { ChordAudioEngine } from "../../audio/ChordAudioEngine";
import { useLanguage } from "../../i18n/LanguageContext";
import type { Genre, SequencerPattern } from "../../types/genre";

type ExplorePage = "kick" | "chords" | "groove";

const LANES = [
  { trackId: "kick", labelKey: "mobile_jam_lane_kick" },
  { trackId: "snare", labelKey: "mobile_jam_lane_snare" },
  { trackId: "hihat", labelKey: "mobile_jam_lane_hat" },
  { trackId: "bass", labelKey: "mobile_jam_lane_bass" },
];

/** The three feel values, each as five named steps (the reference's 4-word buckets, plus a neutral). */
/**
 * The three feel values, in the engine's own vocabulary.
 *
 * The reference's 柔软度 / 砂砾感 / 内脏压力 are `softness` / `grit` / `rumble`, and their four-word
 * buckets are the labels below; the fifth step is the extreme end of each scale, because a phone row
 * of chips has room for one more than the desktop's wording had.
 */
const FEELS = [
  { key: "softness", labelKey: "mobile_explore_kick_soft", steps: ["硬", "实", "韧", "松", "软"] },
  { key: "grit", labelKey: "mobile_explore_kick_grit", steps: ["滑", "润", "糙", "砾", "砂"] },
  { key: "rumble", labelKey: "mobile_explore_kick_low", steps: ["轻", "稳", "沉", "压", "闷"] },
] as const;

/** The three physical layers are mute switches on the engine. */
const KICK_LAYERS = [
  { id: "sub", muteKey: "subMute", label: "SUB" },
  { id: "thump", muteKey: "thumpMute", label: "THUMP" },
  { id: "click", muteKey: "clickMute", label: "CLICK" },
] as const;

const pageOfPresetName = (preset: { name?: unknown; id?: string }, language: string): string => {
  const name = preset.name as { zh?: string; en?: string } | string | undefined;
  if (typeof name === "string") return name;
  return (language === "zh" ? name?.zh : name?.en) ?? preset.id ?? "";
};

export interface MobileExploreScreenProps {
  genreId?: string;
  isPlaying: boolean;
  onTogglePlay: (genre: Genre) => void;
  onApplyPattern: (pattern: SequencerPattern) => void;
}

export function MobileExploreScreen({
  genreId,
  isPlaying,
  onTogglePlay,
  onApplyPattern,
}: MobileExploreScreenProps) {
  const { t, language } = useLanguage();
  const [page, setPage] = useState<ExplorePage>("kick");

  return (
    <section className="m-rise px-4 pt-2" data-testid="mobile-explore" data-page={page}>
      <h1 className="text-[22px] font-bold leading-none">{t("mobile_module_explore")}</h1>

      <div className="m-rail mt-3" role="tablist" aria-label={t("mobile_module_explore")}>
        {(
          [
            ["kick", "mobile_explore_kick"],
            ["chords", "mobile_explore_chords"],
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
            className={`m-press min-h-[36px] flex-none rounded-full border px-3.5 text-[12px] ${
              page === id
                ? "border-[var(--m-gold)] bg-[var(--m-gold)] text-[var(--m-on-gold)]"
                : "border-[var(--m-line-2)] text-[var(--m-ink-2)]"
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {page === "kick" && <KickLab />}
      {page === "chords" && <ChordLab />}
      {page === "groove" && (
        <GrooveLab
          genreId={genreId}
          isPlaying={isPlaying}
          onTogglePlay={onTogglePlay}
          onApplyPattern={onApplyPattern}
          language={language}
        />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ 底鼓设计 */

function KickLab() {
  const { t, language } = useLanguage();
  const [params, setParams] = useState(() => ({ ...globalAnatomyKickEngine.getParams() }));
  const [presetId, setPresetId] = useState<string | null>(null);

  const apply = useCallback((next: Partial<typeof params>) => {
    const merged = { ...globalAnatomyKickEngine.getParams(), ...next };
    setParams(merged);
    globalAnatomyKickEngine.setParams(merged);
  }, []);

  const fire = useCallback(() => {
    // The engine is shared (a single module-level instance), so this is the same voice the desktop
    // kick lab fires — one kick, no second audio graph.
    // `trigger` lazily creates and resumes the context, so the first tap already sounds.
    globalAnatomyKickEngine.trigger();
  }, []);

  return (
    <div className="mt-3 space-y-3" data-testid="mobile-explore-kick">
      <button
        type="button"
        data-testid="mobile-explore-kick-fire"
        onClick={fire}
        className="m-press flex min-h-[58px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--m-gold)] text-[16px] font-bold text-[var(--m-on-gold)]"
      >
        <Flame className="h-5 w-5" />
        {t("mobile_explore_kick_fire")}
      </button>

      <div className="rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-3.5">
        <p className="m-mono text-[9px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">
          {t("mobile_explore_kick_layers")}
        </p>
        <div className="mt-2 flex gap-2">
          {KICK_LAYERS.map((layer) => {
            const on = !params[layer.muteKey];
            return (
              <button
                key={layer.id}
                type="button"
                data-testid={`mobile-explore-kick-layer-${layer.id}`}
                aria-pressed={on}
                onClick={() => apply({ [layer.muteKey]: on } as Partial<typeof params>)}
                className={`m-press min-h-[44px] flex-1 rounded-xl border text-[11px] ${
                  on
                    ? "border-[var(--m-gold)] bg-[rgba(233,162,59,0.1)] text-[var(--m-gold)]"
                    : "border-[var(--m-line-2)] text-[var(--m-ink-3)]"
                }`}
              >
                {layer.label}
              </button>
            );
          })}
        </div>
      </div>

      {FEELS.map((feel) => (
        <div key={feel.key} className="rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-3.5">
          <div className="flex items-baseline justify-between">
            <p className="m-mono text-[9px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">
              {t(feel.labelKey)}
            </p>
            <span className="m-mono text-[10px] text-[var(--m-gold)]">
              {Math.round(params[feel.key] * 100)}%
            </span>
          </div>
          <div className="m-rail mt-2">
            {feel.steps.map((word, index) => {
              const value = index / (feel.steps.length - 1);
              const active = Math.abs(params[feel.key] - value) < 0.13;
              return (
                <button
                  key={word}
                  type="button"
                  data-testid={`mobile-explore-kick-${feel.key}-${index}`}
                  aria-pressed={active}
                  onClick={() => apply({ [feel.key]: value } as Partial<typeof params>)}
                  className={`m-press min-h-[36px] flex-none rounded-full border px-3 text-[11px] ${
                    active
                      ? "border-[var(--m-gold)] text-[var(--m-gold)]"
                      : "border-[var(--m-line-2)] text-[var(--m-ink-3)]"
                  }`}
                >
                  {word}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-3.5">
        <p className="m-mono text-[9px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">
          {t("mobile_explore_kick_presets")}
        </p>
        <div className="mt-2 space-y-2">
          {KICK_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              data-testid={`mobile-explore-kick-preset-${preset.id}`}
              aria-pressed={presetId === preset.id}
              onClick={() => {
                setPresetId(preset.id);
                apply(preset.params);
                fire();
              }}
              className={`m-press min-h-[46px] w-full rounded-xl border px-3 text-left text-[12px] ${
                presetId === preset.id
                  ? "border-[var(--m-gold)] text-[var(--m-gold)]"
                  : "border-[var(--m-line)] text-[var(--m-ink-2)]"
              }`}
            >
              {pageOfPresetName(preset, language)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 和弦走向 */

function ChordLab() {
  const { t, language } = useLanguage();
  const [category, setCategory] = useState<string>(POPULAR_PROGRESSION_CATEGORIES[0]?.id ?? "all");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const engineRef = useRef<ChordAudioEngine | null>(null);

  useEffect(() => {
    return () => {
      engineRef.current?.panic();
      engineRef.current = null;
    };
  }, []);

  const progressions = useMemo(
    // `all` is the unfiltered view, not a category of its own.
    () =>
      category === "all"
        ? POPULAR_PROGRESSIONS
        : POPULAR_PROGRESSIONS.filter((progression) => progression.category === category),
    [category]
  );

  const toggle = useCallback(
    (progression: (typeof POPULAR_PROGRESSIONS)[number]) => {
      if (!engineRef.current) engineRef.current = new ChordAudioEngine();
      const engine = engineRef.current;
      if (playingId === progression.id) {
        engine.panic();
        setPlayingId(null);
        return;
      }
      engine.stop();
      engine.initAudioContext();
      engine.setTimbre(progression.suggestedTimbre);
      engine.setStyle(progression.suggestedStyle);
      engine.setBpm(progression.suggestedBpm);
      engine.setLoop(true);
      engine.startProgression(progression.chords, () => {});
      setPlayingId(progression.id);
    },
    [playingId]
  );

  return (
    <div className="mt-3" data-testid="mobile-explore-chords" data-landscape="split">
      <div className="m-rail" role="tablist" aria-label={t("mobile_explore_chords")}>
        {POPULAR_PROGRESSION_CATEGORIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={category === entry.id}
            data-testid={`mobile-explore-chord-category-${entry.id}`}
            onClick={() => setCategory(entry.id)}
            className={`m-press min-h-[36px] flex-none rounded-full border px-3.5 text-[12px] ${
              category === entry.id
                ? "border-[var(--m-gold)] bg-[var(--m-gold)] text-[var(--m-on-gold)]"
                : "border-[var(--m-line-2)] text-[var(--m-ink-2)]"
            }`}
          >
            {language === "zh" ? entry.nameZh : entry.nameEn}
          </button>
        ))}
      </div>

      {/* `flex` + `gap` rather than `space-y`: the landscape rule swaps `display` to `grid`, and a
          margin-based row spacing (Tailwind's `space-y-*`, specificity 0,3,0) would beat that rule and
          offset the second column by 10px, making a shared row look like a stack. */}
      <ul className="mt-3 flex flex-col gap-2.5">
        {progressions.map((progression) => (
          <li
            key={progression.id}
            data-testid={`mobile-explore-chord-${progression.id}`}
            className={`m-press rounded-2xl border bg-[var(--m-card)] p-3.5 ${
              playingId === progression.id ? "border-[var(--m-gold)]" : "border-[var(--m-line)]"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold">
                  {language === "zh" ? progression.name.zh : progression.name.en}
                </p>
                <p className="m-mono mt-1 truncate text-[10px] text-[var(--m-gold)]">
                  {progression.roman.join(" – ")} · {progression.defaultKey}
                </p>
              </div>
              <button
                type="button"
                data-testid={`mobile-explore-chord-play-${progression.id}`}
                aria-pressed={playingId === progression.id}
                aria-label={playingId === progression.id ? t("mobile_player_pause") : t("mobile_player_play")}
                onClick={() => toggle(progression)}
                className="m-press flex h-12 w-12 flex-none items-center justify-center rounded-full bg-[var(--m-gold)] text-[var(--m-on-gold)]"
              >
                {playingId === progression.id ? "■" : "▶"}
              </button>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--m-ink-2)]">
              {language === "zh" ? progression.emotion.zh : progression.emotion.en}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ 律动解构 */

function GrooveLab({
  genreId,
  isPlaying,
  onTogglePlay,
  onApplyPattern,
  language,
}: {
  genreId?: string;
  isPlaying: boolean;
  onTogglePlay: (genre: Genre) => void;
  onApplyPattern: (pattern: SequencerPattern) => void;
  language: string;
}) {
  const { t } = useLanguage();
  const genre = ALL_GENRES.find((item) => item.id === genreId) ?? ALL_GENRES[0];
  const [dropped, setDropped] = useState<string[]>([]);
  const [playhead, setPlayhead] = useState(0);
  const base = useMemo(() => patternFromGenre(genre), [genre]);

  /** Lane dropout: the pattern sent to the engine simply omits the dropped lanes' steps. */
  const pattern = useMemo(() => {
    if (dropped.length === 0) return base;
    return {
      ...base,
      tracks: base.tracks.map((track) =>
        dropped.includes(track.track_id)
          ? ({ ...track, steps: track.steps.map(() => false) } as unknown as typeof track)
          : track
      ),
    } as SequencerPattern;
  }, [base, dropped]);

  useEffect(() => {
    onApplyPattern(pattern);
  }, [onApplyPattern, pattern]);

  // A coarse playhead readout: the grid is a picture of the groove, not an editor.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => setPlayhead((step) => (step + 1) % 16), 120);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  return (
    <div className="mt-3" data-testid="mobile-explore-groove" data-landscape="split">
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{genre.name}</p>
          <p className="m-mono mt-0.5 truncate text-[9.5px] text-[var(--m-ink-3)]">
            {dropped.length === 0 ? t("mobile_explore_groove_all") : `${t("mobile_explore_groove_dropped")}: ${dropped.length}`}
          </p>
        </div>
        <button
          type="button"
          data-testid="mobile-explore-groove-play"
          aria-pressed={isPlaying}
          onClick={() => onTogglePlay(genre)}
          className={`m-press m-mono flex h-[50px] w-[50px] items-center justify-center rounded-full text-[11px] font-bold ${
            isPlaying ? "bg-[var(--m-gold)] text-[var(--m-on-gold)]" : "border border-[rgba(233,162,59,0.5)] bg-[#171208] text-[var(--m-gold)]"
          }`}
        >
          {isPlaying ? "■" : "▶"}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {LANES.map((lane) => {
          const track = base.tracks.find((item) => item.track_id === lane.trackId);
          const steps = track?.steps ?? [];
          const isDropped = dropped.includes(lane.trackId);
          return (
            <button
              key={lane.trackId}
              type="button"
              data-testid={`mobile-explore-groove-lane-${lane.trackId}`}
              aria-pressed={!isDropped}
              onClick={() =>
                setDropped((current) =>
                  current.includes(lane.trackId)
                    ? current.filter((id) => id !== lane.trackId)
                    : [...current, lane.trackId]
                )
              }
              className={`m-press block w-full rounded-2xl border bg-[var(--m-card)] p-3 text-left ${
                isDropped ? "border-[var(--m-line)] opacity-45" : "border-[var(--m-line-2)]"
              }`}
            >
              <span className="m-mono flex items-center justify-between text-[9px] text-[var(--m-ink-3)]">
                {t(lane.labelKey)}
                <span>{lane.trackId}</span>
              </span>
              <span className="mt-1.5 flex gap-[3px]">
                {Array.from({ length: 16 }, (_, index) => (
                  <span
                    key={index}
                    className={`h-3.5 flex-1 rounded-sm ${
                      steps[index]
                        ? isDropped
                          ? "bg-[rgba(238,225,200,0.18)]"
                          : index === playhead && isPlaying
                            ? "bg-[var(--m-gold-hi)]"
                            : "bg-[var(--m-gold)]"
                        : "bg-[rgba(238,225,200,0.055)]"
                    }`}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <p className="m-mono mt-2 text-[9px] text-[var(--m-ink-3)]" data-testid="mobile-explore-groove-hint">
        {language === "zh" ? "点一轨就把它从循环里拿掉" : "Tap a lane to drop it out of the loop"}
      </p>
    </div>
  );
}
