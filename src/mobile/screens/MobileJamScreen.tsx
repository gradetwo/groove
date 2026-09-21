/**
 * 即兴 (the jam module, M4).
 *
 * Layout follows the reference's jam screen, with the changes the user asked for: **one dock at the
 * bottom** carries the backing genre, play, record, tempo and swing together (the genre row used to sit
 * at the top, so arming a take meant reaching to the top of the screen and the tempo meant reaching to
 * the bottom — one job, one block), the drum-group mute row is **gone**, and there is **no player bar**
 * here. What is left is one screen that does one thing: edit the groove and hear it.
 *
 * ## Everything you touch sounds and lights up
 *
 * The reference's pads sound immediately because its whole stack is a local one-shot synth. This engine
 * grew the equivalent as `AudioEngine.auditionTrack(trackId, velocity, instrument)` — one voice, now,
 * through the track's own fader and inserts, so a pad sounds the way that lane sounds in the loop.
 * That is what makes a step editor feel like an instrument rather than a form:
 *
 *  - **pads** always sound and always flash, whether or not the transport is running and whether or not
 *    record is armed; while armed they also write the step at the playhead (quantised by definition,
 *    because it *is* the playhead);
 *  - **step cells** sound the lane they belong to when tapped, so you hear what you are editing before
 *    the loop comes round;
 *  - the lane colours are the instrument colours the record is drawn with (`LAYER_COLORS`), so the grid,
 *    the pads and the vinyl agree about which colour is the kick;
 *  - during playback the playhead cell of every lane lights in its own colour, and a lane whose step is
 *    on glows on its pad.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Minus, Play, Plus, RotateCcw, Square } from "lucide-react";
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

/**
 * The six pads.
 *
 * `lane` is the grid lane a pad writes into; `trackId` is what it *sounds* (the lane's track) and
 * `instrument` is what it sounds *as*. The last two matter for the percussion pads: the clap and the rim
 * write into the snare lane — that is the lane a backbeat belongs to — but a clap pad that played a plain
 * snare would be a lie, so they ask the engine for the percussion model by name.
 */
const PADS: Array<{ id: string; labelKey: string; lane: number; trackId: string; instrument?: string }> = [
  { id: "kick", labelKey: "mobile_jam_lane_kick", lane: 0, trackId: "kick" },
  { id: "snare", labelKey: "mobile_jam_lane_snare", lane: 1, trackId: "snare" },
  { id: "hat", labelKey: "mobile_jam_lane_hat", lane: 2, trackId: "hihat" },
  { id: "clap", labelKey: "mobile_jam_pad_clap", lane: 1, trackId: "snare", instrument: "clap" },
  { id: "rim", labelKey: "mobile_jam_pad_rim", lane: 1, trackId: "snare", instrument: "rimshot" },
  { id: "bass", labelKey: "mobile_jam_lane_bass", lane: 3, trackId: "bass" },
];

/**
 * The instrument palette, taken from the reference's own pads (player2.html) and identical to
 * `LAYER_COLORS` in `vinylMath.ts` for the four shared instruments.
 *
 * One palette for the whole product is the point: the kick is the same amber on the grid cell, on the
 * pad and on the record's outer ring, so the screen teaches the mapping instead of decorating it. The
 * two percussion pads have their own colours because they are different sounds (a clap is not a snare),
 * which is why the pads carry a colour per *pad* while the grid carries one per *lane*.
 */
const JAM_COLORS: Record<string, { hex: string; rgb: string }> = {
  kick: { hex: "#FFB25A", rgb: "255,178,90" },
  snare: { hex: "#FF7A6B", rgb: "255,122,107" },
  hat: { hex: "#6FD3C0", rgb: "111,211,192" },
  clap: { hex: "#FF9FB0", rgb: "255,159,176" },
  rim: { hex: "#D8C79A", rgb: "216,199,154" },
  bass: { hex: "#9AA7FF", rgb: "154,167,255" },
};

/** The lane's identity colour: its track id, except the hat lane, which the pads call `hat`. */
function laneColour(trackId: string) {
  return JAM_COLORS[trackId === "hihat" ? "hat" : trackId] ?? JAM_COLORS.kick;
}

const STEPS = 16;
const BPM_MIN = 60;
const BPM_MAX = 180;
/** The swing range the engine already accepts, and the grid the rail snaps to. */
const SWING_MAX = 0.4;
const SWING_STEP = 0.05;

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
  /**
   * Play one hit now, for a pad or a step cell.
   *
   * Optional so the screen is renderable without an engine (tests, and a shell that has not mounted one
   * yet); the visual feedback does not depend on it.
   */
  onAuditionTrack?: (trackId: string, instrument?: string) => void;
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
  onAuditionTrack,
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
  const swingRail = useRef<HTMLDivElement | null>(null);
  /** True between pointerdown and pointerup on the feel rail: a plain hover must not move the groove. */
  const swingDragging = useRef(false);
  /**
   * Lanes that were hit by hand in the last ~160 ms.
   *
   * A tap has to *look* like it did something even when the lane has no step on the playhead and the
   * transport is stopped — that is the feedback loop a pad is for. The timeout map means a fast roll on
   * one pad re-arms its own timer instead of stacking them, and each lane is independent so two hands can
   * light two pads at once.
   */
  const [flashing, setFlashing] = useState<number[]>([]);
  const flashTimers = useRef<Map<number, number>>(new Map());

  const flashLane = useCallback((lane: number) => {
    setFlashing((current) => (current.includes(lane) ? current : [...current, lane]));
    const existing = flashTimers.current.get(lane);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      flashTimers.current.delete(lane);
      setFlashing((current) => current.filter((value) => value !== lane));
    }, 160);
    flashTimers.current.set(lane, timer);
  }, []);

  useEffect(
    () => () => {
      for (const timer of flashTimers.current.values()) window.clearTimeout(timer);
      flashTimers.current.clear();
    },
    []
  );

  /** Sound + light for one lane. Every pad tap and every step tap goes through here. */
  const hitLane = useCallback(
    (lane: number, instrument?: string) => {
      flashLane(lane);
      onAuditionTrack?.(LANES[lane].trackId, instrument);
    },
    [flashLane, onAuditionTrack]
  );

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
    (lane: number, instrument?: string) => {
      const clock = readClock();
      const step = clock ? clock.step % STEPS : playhead;
      toggleStep(lane, step);
      hitLane(lane, instrument);
    },
    [hitLane, playhead, readClock, toggleStep]
  );

  /** A grid cell is both an editor and an instrument: it sounds the lane it belongs to when tapped. */
  const tapStep = useCallback(
    (lane: number, step: number) => {
      toggleStep(lane, step);
      hitLane(lane);
    },
    [hitLane, toggleStep]
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

  /**
   * Swing is quantised to 5% because that is the smallest step the feel audibly distinguishes, and a
   * rail that reported 23% while the pattern played 20% would be lying about the groove. The engine
   * keeps the fraction (0..1); the readout converts.
   */
  const changeSwing = (value: number) => {
    const clamped = Math.min(SWING_MAX, Math.max(0, value));
    const next = Number((Math.round(clamped / SWING_STEP) * SWING_STEP).toFixed(2));
    setSwing(next);
    onSwing(next);
  };

  /**
   * A pointer's x on the rail *is* the feel — position, not delta — so a tap jumps straight to that
   * swing and a drag tracks the thumb. The rect is read per event because the rail reflows with the
   * viewport (and the tests hand it a measured width).
   */
  const swingFromPointer = (clientX: number) => {
    const rect = swingRail.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    changeSwing(((clientX - rect.left) / rect.width) * SWING_MAX);
  };

  return (
    <section className="m-rise px-4 pt-2" data-testid="mobile-jam" data-genre={genre.id}>
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
          {LANES.map((lane, laneIndex) => {
            const colour = laneColour(lane.trackId);
            return (
              <div key={lane.trackId} className="flex items-center gap-2 py-1">
                {/*
                  The lane's identity: a colour bar plus a readable word.
                  
                  The word used to be painted *in* the instrument colour, which is fine on a dark ground and
                  unreadable on a light one — amber on paper is 1.7:1, and a light skin is a supported
                  choice. So the colour moved into a bar beside the label and the label itself takes the
                  shell's ink: the mapping from colour to instrument is still on screen, and it survives
                  every skin.
                */}
                <span className="flex w-9 flex-none items-center gap-1">
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-1 flex-none rounded-[1px]"
                    style={{ background: colour.hex }}
                    data-testid={`mobile-jam-lane-colour-${laneIndex}`}
                  />
                  <span className="m-mono truncate text-[9px] text-[var(--m-ink-2)]" data-testid={`mobile-jam-lane-label-${laneIndex}`}>
                    {t(lane.labelKey)}
                  </span>
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
                        onClick={() => tapStep(laneIndex, step)}
                        /**
                         * Three states, and the colour is what distinguishes them:
                         *
                         *  - **on** — the instrument's own colour, because the grid doubles as the
                         *    legend for the pads, the record and the playhead;
                         *  - **playhead** — the lane colour at low alpha with a ring, so the moving step
                         *    is visible without hiding the pattern under it;
                         *  - **off** — the shell's neutral cell.
                         */
                        className="m-press h-8 flex-1 rounded"
                        style={
                          on
                            ? { background: `rgba(${colour.rgb}, 0.82)`, boxShadow: active ? `0 0 10px rgba(${colour.rgb}, 0.65)` : undefined }
                            : active
                              ? { background: `rgba(${colour.rgb}, 0.22)`, boxShadow: `inset 0 0 0 1.5px rgba(${colour.rgb}, 0.75)` }
                              : { background: "rgba(232,232,255,0.055)" }
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
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
            const colour = JAM_COLORS[pad.id] ?? JAM_COLORS.kick;
            /** Lit while the lane's step is on the playhead, or for a moment after a hand hit it. */
            const lit = flashing.includes(pad.lane) || (isPlaying && Boolean(grid[pad.lane]?.[playhead]));
            return (
              <button
                key={pad.id}
                type="button"
                data-testid={`mobile-jam-pad-${pad.id}`}
                onClick={() => writeAtPlayhead(pad.lane, pad.instrument)}
                /**
                 * The halo is the instrument's colour, so a glance at the pads you are hitting tells you
                 * which lane is answering. `box-shadow` rather than a border colour because it reads as
                 * light rather than as selection, and `transform` stays untouched so the tap feedback in
                 * `.m-press` is unaffected.
                 */
                className="m-press relative flex h-[76px] flex-col items-center justify-center rounded-[18px] border bg-[linear-gradient(180deg,var(--m-card-2),var(--m-card))]"
                style={{
                  borderColor: lit ? `rgba(${colour.rgb}, 0.85)` : undefined,
                  boxShadow: lit ? `0 0 22px rgba(${colour.rgb}, 0.35), inset 0 0 18px rgba(${colour.rgb}, 0.14)` : undefined,
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full"
                  style={{ background: colour.hex, opacity: lit ? 1 : 0.5 }}
                />
                <span className="text-[13px] font-semibold">{t(pad.labelKey)}</span>
                <span className="m-mono mt-1 text-[8px] uppercase tracking-[0.26em]" style={{ color: colour.hex }}>
                  {pad.id}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/*
        One dock, pinned above the tab bar: record, tempo and swing are the same gesture — "change the
        groove while it plays" — so they belong in one bar rather than two stacked ones. `sticky`
        rather than `fixed` keeps it inside the shell's column and lets the page still scroll.
      */}
      <section
        /**
         * `m-jam-dock` is the hook `mobile.css` needs to un-stick this dock on a short landscape phone:
         * there, a floating 114 px dock would cover the very grid it belongs to, so it goes back into
         * the flow (and the module scrolls to it, which is where it lives in the first place).
         */
        className="m-jam-dock sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 mt-3 rounded-2xl border border-[var(--m-line)] bg-[var(--m-card)] px-3.5"
        data-testid="mobile-jam-tempo"
      >
        {/*
          Row 1: the backing genre, play/stop, and record.
          
          The genre row used to be its own card at the top of the screen, which meant two separate places
          for "what is playing" and "start it": you armed a take at the bottom and started it at the top.
          They are one gesture, so they are one row — and the dock is the only chrome on this screen now.
        */}
        <div className="flex min-h-[58px] items-center gap-2 border-b border-[var(--m-line)]">
          <button
            type="button"
            data-testid="mobile-jam-genre"
            onClick={() => onOpenGenre(genre.id)}
            className="m-press flex min-h-[46px] min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold leading-tight">{genre.name}</span>
              <span className="m-mono block truncate text-[9px] text-[var(--m-ink-3)]">
                {t("mobile_jam_backing")} · {genre.category}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-[var(--m-ink-3)]" />
          </button>

          <button
            type="button"
            data-testid="mobile-jam-play"
            aria-pressed={isPlaying}
            aria-label={isPlaying ? t("mobile_jam_stop") : t("mobile_jam_play")}
            onClick={() => onTogglePlay(genre)}
            className="m-press flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full border border-[var(--m-line-2)] text-[var(--m-ink)]"
          >
            {isPlaying ? <Square className="h-5 w-5" fill="currentColor" /> : <Play className="ml-0.5 h-5 w-5" fill="currentColor" />}
          </button>

          <button
            type="button"
            data-testid="mobile-jam-record"
            aria-pressed={recording}
            aria-label={t("mobile_jam_record")}
            onClick={() => setRecording((on) => !on)}
            className={`m-press flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full border ${
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

          {/* The hint shares the row so arming record never reflows the controls beside it. */}
          <div className="min-w-0 flex-1">
            {recording && (
              <p
                className="m-mono text-[10px] leading-tight text-[var(--m-red)]"
                data-testid="mobile-jam-record-hint"
              >
                {t("mobile_jam_record_on")}
              </p>
            )}
          </div>

          <span className="text-[13px]">{t("mobile_jam_tempo")}</span>
          <button
            type="button"
            data-testid="mobile-jam-bpm-down"
            aria-label={`${t("mobile_jam_bpm")} -1`}
            onClick={() => changeBpm(-2)}
            className="m-press m-mono flex h-12 w-12 flex-none items-center justify-center rounded-full border border-[var(--m-line-2)] text-[var(--m-ink)]"
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
            className="m-press m-mono flex h-12 w-12 flex-none items-center justify-center rounded-full border border-[var(--m-line-2)] text-[var(--m-ink)]"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Swing: a feel rail, dragged rather than picked from chips. `touch-none` keeps the drag. */}
        <div className="flex min-h-[56px] items-center gap-3 border-t border-[var(--m-line)]">
          <span className="text-[13px]">{t("mobile_jam_swing")}</span>
          <div
            ref={swingRail}
            data-testid="mobile-jam-swing-slider"
            role="slider"
            tabIndex={0}
            aria-label={t("mobile_jam_swing")}
            aria-valuemin={0}
            aria-valuemax={Math.round(SWING_MAX * 100)}
            aria-valuenow={Math.round(swing * 100)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") changeSwing(swing - SWING_STEP);
              else if (event.key === "ArrowRight") changeSwing(swing + SWING_STEP);
              else return;
              event.preventDefault();
            }}
            onPointerDown={(event) => {
              // Capture so a drag that leaves the rail (or the card) keeps feeding the value.
              swingDragging.current = true;
              event.currentTarget.setPointerCapture?.(event.pointerId);
              swingFromPointer(event.clientX);
            }}
            onPointerMove={(event) => {
              if (swingDragging.current) swingFromPointer(event.clientX);
            }}
            onPointerUp={(event) => {
              swingDragging.current = false;
              event.currentTarget.releasePointerCapture?.(event.pointerId);
            }}
            onPointerCancel={() => {
              swingDragging.current = false;
            }}
            className="relative flex h-11 min-w-0 flex-1 cursor-pointer touch-none items-center"
          >
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[rgba(232,232,255,0.12)]"
            />
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--m-gold)]"
              style={{ width: `${Math.round(swing * 100)}%` }}
            />
            <span
              aria-hidden="true"
              className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--m-gold)] bg-[var(--m-bg)]"
              style={{ left: `${Math.round(swing * 100)}%` }}
            />
          </div>
          <span
            className="m-mono min-w-[40px] text-right text-[12px] text-[var(--m-gold)]"
            data-testid="mobile-jam-swing-value"
          >
            {Math.round(swing * 100)}%
          </span>
        </div>
      </section>
    </section>
  );
}
