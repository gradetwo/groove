/**
 * 即兴 (the jam module, M4).
 *
 * Layout follows the reference's jam screen, with the changes the user asked for: the tempo controls
 * live at the **bottom**, the drum-group mute row is **gone**, there is **no player bar** here, and
 * record/play sit at the top. What is left is one screen that does one thing: edit the groove and hear
 * it.
 *
 * ## One deliberate deviation from the reference
 *
 * The reference records pad hits into a separate "take" and only writes them into the grid when
 * quantised, and its pads sound immediately because its whole audio stack is a local one-shot synth.
 * Here the pads write the **current step** directly: this engine has no public one-shot path (adding
 * a second `AudioContext` for pad latency would be worse than not offering it), and a take that is
 * silently an overlay would be a second source of truth next to the grid. So:
 *
 *  - pads are **step entry** — arm 录制 and tap a pad to write it at the playhead (quantised by
 *    definition, because it is the playhead);
 *  - they light up when their lane fires during playback, so the screen shows the groove moving;
 *  - the sound feedback is the loop itself.
 *
 * Live pad auditioning needs a `playOneShot(trackIdx)` on the engine first; it is recorded as the
 * follow-up rather than faked here.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Minus, Plus, RotateCcw } from "lucide-react";
import { ALL_GENRES } from "../../data/genres";
import { patternFromGenre } from "../../data/genreMix";
import { useLanguage } from "../../i18n/LanguageContext";
import type { Genre, SequencerPattern } from "../../types/genre";

/** The four lanes the grid edits, in the reference's order, mapped to real track ids. */
const LANES: Array<{ trackId: string; labelKey: string }> = [
  { trackId: "kick", labelKey: "mobile_jam_lane_kick" },
  { trackId: "snare", labelKey: "mobile_jam_lane_snare" },
  { trackId: "hihat", labelKey: "mobile_jam_lane_hat" },
  { trackId: "bass", labelKey: "mobile_jam_lane_bass" },
];

/** The six pads; `lane` is the grid lane a pad writes into. */
const PADS: Array<{ id: string; labelKey: string; lane: number }> = [
  { id: "kick", labelKey: "mobile_jam_lane_kick", lane: 0 },
  { id: "snare", labelKey: "mobile_jam_lane_snare", lane: 1 },
  { id: "hat", labelKey: "mobile_jam_lane_hat", lane: 2 },
  { id: "clap", labelKey: "mobile_jam_pad_clap", lane: 1 },
  { id: "rim", labelKey: "mobile_jam_pad_rim", lane: 1 },
  { id: "bass", labelKey: "mobile_jam_lane_bass", lane: 3 },
];

const STEPS = 16;
const BPM_MIN = 60;
const BPM_MAX = 180;

export const clampJamBpm = (value: number): number =>
  Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(value)));

export interface MobileJamScreenProps {
  genreId?: string;
  isPlaying: boolean;
  readClock: () => { step: number; fraction: number } | null;
  onTogglePlay: (genre: Genre) => void;
  onApplyPattern: (pattern: SequencerPattern) => void;
  onTempo: (bpm: number) => void;
  onSwing: (swing: number) => void;
  onOpenGenre: (genreId: string) => void;
}

export function MobileJamScreen({
  genreId,
  isPlaying,
  readClock,
  onTogglePlay,
  onApplyPattern,
  onTempo,
  onSwing,
  onOpenGenre,
}: MobileJamScreenProps) {
  const { t } = useLanguage();
  const genre = ALL_GENRES.find((item) => item.id === genreId) ?? ALL_GENRES[0];

  /** The working copy: the genre's pattern, edited here and pushed to the engine as it changes. */
  const [pattern, setPattern] = useState<SequencerPattern>(() => patternFromGenre(genre));
  const [recording, setRecording] = useState(false);
  const [bpm, setBpm] = useState(genre.default_bpm);
  const [swing, setSwing] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const lastApplied = useRef<string>("");

  // A different backing genre replaces the working copy (the module is about one genre at a time).
  useEffect(() => {
    const next = patternFromGenre(genre);
    setPattern(next);
    setBpm(genre.default_bpm);
    setSwing(0);
    lastApplied.current = "";
  }, [genre]);

  /** The 16×4 grid, read off the pattern's tracks. */
  const grid = useMemo(
    () =>
      LANES.map(({ trackId }) => {
        const track = pattern.tracks.find((item) => item.track_id === trackId);
        const steps = track?.steps ?? [];
        return Array.from({ length: STEPS }, (_, index) => Boolean(steps[index]));
      }),
    [pattern]
  );

  /**
   * Push edits to the engine while it is playing.
   *
   * Keyed on a cheap serialisation so the pattern is only re-sent when it actually changed: the
   * engine re-schedules the whole pattern on `setPattern`, and doing that on every render would
   * stutter the loop.
   */
  useEffect(() => {
    const key = grid.map((lane) => lane.map((on) => (on ? 1 : 0)).join("")).join("|");
    if (key === lastApplied.current) return;
    lastApplied.current = key;
    onApplyPattern(pattern);
  }, [grid, onApplyPattern, pattern]);

  // The playhead and the pad glow are read from the transport, at a rate a UI can use.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(() => {
      const clock = readClock();
      if (clock) setPlayhead(clock.step % STEPS);
    }, 80);
    return () => window.clearInterval(id);
  }, [isPlaying, readClock]);

  const toggleStep = useCallback(
    (lane: number, step: number) => {
      setPattern((current) => {
        const trackId = LANES[lane].trackId;
        return {
          ...current,
          tracks: current.tracks.map((track) => {
            if (track.track_id !== trackId) return track;
            const steps = Array.from({ length: Math.max(STEPS, track.steps.length) }, (_, index) =>
              Boolean(track.steps[index])
            );
            steps[step] = !steps[step];
            // `tracks` is a discriminated union; the spread has to keep the member's own type.
            return { ...track, steps } as unknown as typeof track;
          }),
        };
      });
    },
    []
  );

  /**
   * Write on the step that is playing *now*.
   *
   * The playhead state is sampled every 80 ms, which at 180 BPM is a whole step of lag — enough for a
   * recorded hit to land one step late. Reading the clock at click time is what makes "tap it on the
   * beat" mean the beat the player heard.
   */
  const writeAtPlayhead = useCallback(
    (lane: number) => {
      const clock = readClock();
      const step = clock ? clock.step % STEPS : playhead;
      toggleStep(lane, step);
    },
    [playhead, readClock, toggleStep]
  );

  const reset = useCallback(() => {
    setPattern(patternFromGenre(genre));
  }, [genre]);

  const changeBpm = (delta: number) => {
    setBpm((current) => {
      const next = clampJamBpm(current + delta);
      onTempo(next);
      return next;
    });
  };

  const changeSwing = (value: number) => {
    const next = Math.min(0.4, Math.max(0, value));
    setSwing(next);
    onSwing(next);
  };

  return (
    <section className="m-rise px-4 pt-2" data-testid="mobile-jam" data-genre={genre.id}>
      <div className="flex items-center gap-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-3">
        <button
          type="button"
          data-testid="mobile-jam-genre"
          onClick={() => onOpenGenre(genre.id)}
          className="m-press flex min-h-[46px] min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-bold leading-tight">{genre.name}</span>
            <span className="m-mono block truncate text-[9.5px] text-[var(--m-ink-3)]">
              {t("mobile_jam_backing")} · {genre.category}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 flex-none text-[var(--m-ink-3)]" />
        </button>

        <button
          type="button"
          data-testid="mobile-jam-record"
          aria-pressed={recording}
          aria-label={t("mobile_jam_record")}
          onClick={() => setRecording((on) => !on)}
          className={`m-press flex h-12 w-12 flex-none items-center justify-center rounded-full border ${
            recording
              ? "border-[var(--m-red)] bg-[rgba(242,109,109,0.18)]"
              : "border-[var(--m-line-2)]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-3.5 w-3.5 rounded-full ${recording ? "bg-[var(--m-red)]" : "bg-[rgba(242,109,109,0.7)]"}`}
          />
        </button>

        <button
          type="button"
          data-testid="mobile-jam-play"
          aria-pressed={isPlaying}
          aria-label={isPlaying ? t("mobile_jam_stop") : t("mobile_jam_play")}
          onClick={() => onTogglePlay(genre)}
          className={`m-press m-mono flex h-[54px] w-[54px] flex-none items-center justify-center rounded-full text-[11px] font-bold ${
            isPlaying
              ? "bg-[var(--m-gold)] text-[var(--m-on-gold)]"
              : "border border-[rgba(233,162,59,0.5)] bg-[#171208] text-[var(--m-gold)]"
          }`}
        >
          {isPlaying ? "■" : "▶"}
        </button>
      </div>

      {recording && (
        <p className="m-mono mt-2 text-[10px] text-[var(--m-red)]" data-testid="mobile-jam-record-hint">
          {t("mobile_jam_record_on")}
        </p>
      )}

      {/* Groove grid */}
      <section className="mt-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] p-3.5">
        <header className="flex items-center justify-between">
          <h2 className="text-[13px] font-bold">
            {t("mobile_jam_grid")}{" "}
            <span className="m-mono text-[9px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">GROOVE</span>
          </h2>
          <button
            type="button"
            data-testid="mobile-jam-reset"
            onClick={reset}
            className="m-press m-mono flex min-h-[46px] items-center gap-1 rounded-full border border-[var(--m-line-2)] px-3 text-[10px] text-[var(--m-ink-2)]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("mobile_jam_reset")}
          </button>
        </header>
        <p className="m-mono mt-1 text-[9px] text-[var(--m-ink-3)]">{t("mobile_jam_grid_hint")}</p>

        <div className="mt-2" data-testid="mobile-jam-grid">
          {LANES.map((lane, laneIndex) => (
            <div key={lane.trackId} className="flex items-center gap-2 py-1">
              <span className="m-mono w-9 flex-none text-[9px] text-[var(--m-ink-3)]">
                {t(lane.labelKey)}
              </span>
              <div className="flex flex-1 gap-[3px]">
                {grid[laneIndex].map((on, step) => {
                  const active = isPlaying && step === playhead;
                  return (
                    <button
                      key={step}
                      type="button"
                      data-testid={`mobile-jam-step-${laneIndex}-${step}`}
                      aria-pressed={on}
                      aria-label={`${t(lane.labelKey)} ${step + 1}`}
                      onClick={() => toggleStep(laneIndex, step)}
                      className={`m-press h-8 flex-1 rounded ${
                        on
                          ? "bg-[var(--m-gold)]"
                          : active
                            ? "bg-[rgba(233,162,59,0.35)]"
                            : "bg-[rgba(238,225,200,0.055)]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pads: step entry at the playhead */}
      <section className="mt-3">
        <header className="flex items-baseline justify-between px-1">
          <h2 className="text-[13px] font-bold">
            {t("mobile_jam_pads")}{" "}
            <span className="m-mono text-[9px] uppercase tracking-[0.24em] text-[var(--m-ink-3)]">PADS</span>
          </h2>
          <p className="m-mono text-[9px] text-[var(--m-ink-3)]">{t("mobile_jam_pads_hint")}</p>
        </header>
        <div className="mt-2 grid grid-cols-3 gap-2.5">
          {PADS.map((pad) => {
            const firing = isPlaying && grid[pad.lane]?.[playhead];
            return (
              <button
                key={pad.id}
                type="button"
                data-testid={`mobile-jam-pad-${pad.id}`}
                onClick={() => writeAtPlayhead(pad.lane)}
                className={`m-press flex h-[76px] flex-col items-center justify-center rounded-[18px] border bg-[linear-gradient(180deg,#1C1710,#120F09)] ${
                  firing ? "border-[rgba(233,162,59,0.8)]" : "border-[var(--m-line)]"
                }`}
              >
                <span className="text-[13px] font-semibold">{t(pad.labelKey)}</span>
                <span className="m-mono mt-1 text-[8px] uppercase tracking-[0.26em] text-[var(--m-ink-3)]">
                  {pad.id}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Tempo, at the bottom where the user asked for it */}
      <section
        className="mt-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] px-3.5"
        data-testid="mobile-jam-tempo"
      >
        <div className="flex min-h-[52px] items-center gap-3">
          <span className="text-[13px]">{t("mobile_jam_tempo")}</span>
          <button
            type="button"
            data-testid="mobile-jam-bpm-down"
            aria-label={`${t("mobile_jam_bpm")} -1`}
            onClick={() => changeBpm(-2)}
            className="m-press m-mono flex h-12 w-12 items-center justify-center rounded-full border border-[var(--m-line-2)] text-[var(--m-ink)]"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="m-mono min-w-[64px] text-center text-[16px] text-[var(--m-gold-hi)]" data-testid="mobile-jam-bpm">
            {bpm} <span className="text-[8px] tracking-[0.14em] text-[var(--m-ink-3)]">BPM</span>
          </span>
          <button
            type="button"
            data-testid="mobile-jam-bpm-up"
            aria-label={`${t("mobile_jam_bpm")} +1`}
            onClick={() => changeBpm(2)}
            className="m-press m-mono flex h-12 w-12 items-center justify-center rounded-full border border-[var(--m-line-2)] text-[var(--m-ink)]"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-[52px] items-center gap-3 border-t border-[var(--m-line)]">
          <span className="text-[13px]">{t("mobile_jam_swing")}</span>
          <span className="m-mono text-[10px] text-[var(--m-gold)]" data-testid="mobile-jam-swing-value">
            {Math.round(swing * 100)}%
          </span>
          <div className="m-rail flex-1" role="group" aria-label={t("mobile_jam_swing")}>
            {[0, 0.1, 0.2, 0.3, 0.4].map((value) => (
              <button
                key={value}
                type="button"
                data-testid={`mobile-jam-swing-${Math.round(value * 100)}`}
                aria-pressed={Math.abs(swing - value) < 0.001}
                onClick={() => changeSwing(value)}
                className={`m-press m-mono min-h-[46px] flex-none rounded-full border px-3 text-[10px] ${
                  Math.abs(swing - value) < 0.001
                    ? "border-[var(--m-gold)] bg-[var(--m-gold)] text-[var(--m-on-gold)]"
                    : "border-[var(--m-line-2)] text-[var(--m-ink-2)]"
                }`}
              >
                {Math.round(value * 100)}%
              </button>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}
