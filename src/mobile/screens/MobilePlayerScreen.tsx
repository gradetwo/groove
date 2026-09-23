/**
 * The full-screen phone player — a direct port of `player2.html`.
 *
 * The previous version of this file was "inspired by" the reference: it kept the canvas record but
 * replaced the layout with its own header, its own progress bar, its own transport and a drawer. The
 * user's verdict was blunt and correct — the reference's *look and feel* had been deleted. So this is
 * the reference's own stage zone, in the reference's own order:
 *
 * ```
 * topbar      brand + a status dot that pulses on the kick
 * stage       the record, the drag hint, the name/category and the tempo with press-and-hold ±
 * prog-row    a 2px rail driven by the transport, and the "realtime synth · loop" meta line
 * transport   mode | previous | play | next | track list
 * picker      the multi-level genre browse (C-02): category → genre, with a filter
 * ```
 *
 * Three things are ours, and each replaces or adds exactly one control:
 *
 *  - the **down chevron** in the top bar collapses back to the player bar;
 *  - **tapping the record** opens the genre's page (the NetEase "show lyrics" toggle), while a *drag*
 *    is the jog — the two are told apart by how far the pointer travelled;
 *  - the **mode button** cycles 单曲循环 → 大曲风内循环 → 全部随机, and the mode decides what
 *    previous/next picks and what the list plays next.
 *
 * The track-list button used to open the reference's `.cue` pull-down: the genre's own category, capped
 * at fourteen rows. C-02 replaced it with `MobileGenrePicker` — the same gesture, but the whole library
 * is browsable by category and searchable in both languages. The port's list is gone; its one idea (lead
 * with the genre's own category) is the picker's `initialCategory`.
 *
 * Not ported, on purpose: the reference's `.styles`, `.pads` and `.sliders` zones. Those are 曲风库 and
 * 即兴 in this app; a copy inside the player would be two modules pretending to be one.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { loadGenre } from "../mobileGenreData";
import { patternFromGenre } from "../../data/genreMix";
import { useLanguage } from "../../i18n/LanguageContext";
import type { Genre } from "../../types/genre";
import { CATEGORY_SWATCH } from "../genreArt";
import { MobileGenrePicker } from "../MobileGenrePicker";
import { VinylCanvas, type VinylClock } from "../vinyl/VinylCanvas";
import { PLAY_MODE_LABEL_KEYS, type PlayMode } from "../vinyl/vinylMath";

const MODE_ICONS: Record<PlayMode, React.ReactNode> = {
  one: <Repeat1 className="h-5 w-5" />,
  genre: <Repeat className="h-5 w-5" />,
  all: <Shuffle className="h-5 w-5" />,
};

export interface MobilePlayerScreenProps {
  genreId: string;
  /** Applied to the engine by the shell; the jog and the ± buttons both report through it. */
  onTempo?: (bpm: number) => void;
  /** The vinyl scratch, played while the record is dragged (see `src/audio/VinylScrub.ts`). */
  onScrubSound?: (velocity: number) => void;
  onScrubSoundEnd?: () => void;
  isPlaying: boolean;
  playMode: PlayMode;
  readClock: () => VinylClock | null;
  /** Play/pause a genre *by id*: the shell resolves the record (the phone browses by index). */
  onTogglePlay: (genreId: string) => void;
  /** Switch the record to another genre without leaving the player (the pull-down list). */
  onPlayGenre?: (genreId: string) => void;
  onCycleMode: () => void;
  onSkip: (direction: 1 | -1) => void;
  onCollapse: () => void;
  onOpenDetail: (genreId: string) => void;
}

/**
 * The screen's data path: resolve the route's genre, then render the record.
 *
 * This is the surface that genuinely needs a full `Genre` — the lane dots are its real
 * `sequencer_pattern`, its cue prints `time_signature`, and the record is drawn from its chord voicings
 * — so it is the one that fetches the category chunk. It shows a placeholder while that happens (a
 * blank frame rather than a record drawn from a guess) and the existing "missing" state when
 * `loadGenre` finds nothing.
 */
export function MobilePlayerScreen(props: MobilePlayerScreenProps) {
  const { t } = useLanguage();
  const { genreId } = props;
  const [genre, setGenre] = useState<Genre | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setGenre(null);
    void loadGenre(genreId).then((record) => {
      if (!alive) return;
      setGenre(record);
      setStatus(record ? "ready" : "missing");
    });
    return () => {
      alive = false;
    };
  }, [genreId]);

  if (status === "loading") {
    return (
      <div
        className="m-rise flex min-h-[70dvh] items-center justify-center px-6"
        data-testid="mobile-player-loading"
      >
        <p className="m-mono text-[11px] tracking-[0.24em] text-[var(--m-ink-3)]">…</p>
      </div>
    );
  }

  if (!genre) {
    return (
      <div className="m-rise flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6" data-testid="mobile-player-missing">
        <p className="text-[13px] text-[var(--m-ink-2)]">{t("mobile_detail_missing")}</p>
        <button
          type="button"
          data-testid="mobile-player-collapse"
          onClick={props.onCollapse}
          className="m-press m-mono min-h-[46px] rounded-full border border-[var(--m-line-2)] px-4 text-[11px] text-[var(--m-gold)]"
        >
          {t("mobile_back")}
        </button>
      </div>
    );
  }

  return <PlayerForGenre genre={genre} {...props} />;
}

/** The record itself, with a resolved genre in hand. */
function PlayerForGenre({
  genre,
  onTempo,
  onScrubSound,
  onScrubSoundEnd,
  isPlaying,
  playMode,
  readClock,
  onTogglePlay,
  onPlayGenre,
  onCycleMode,
  onSkip,
  onCollapse,
  onOpenDetail,
}: MobilePlayerScreenProps & { genre: Genre }) {
  const { t } = useLanguage();
  const [listOpen, setListOpen] = useState(false);
  /** The reference's "落针…": the needle is on its way down for about half a second. */
  const [dropping, setDropping] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const bpmOutRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef<HTMLElement | null>(null);
  /** Set by a jog's release so the record's own click does not also open the genre page. */
  const draggedRef = useRef(false);

  /**
   * The tempo the record is playing at: seeded from the genre and moved by the jog and the ± buttons.
   * Clamped to the engine's own 60-180 range, and reported on every change so what is heard matches
   * what is shown. The number *drawn* eases into it (the reference's damper, in `VinylCanvas`).
   */
  const [bpm, setBpm] = useState(genre.default_bpm);
  /**
   * What React paints into the readout *once*.
   *
   * The canvas damper owns that node from the first frame on (it is what makes the number walk to a new
   * tempo instead of snapping). Rendering `{bpm}` there instead would paint the target immediately and
   * the loop would then overwrite it with a lower, eased value — the number would jump up, fall back and
   * climb again. A frozen initial value keeps React out of the way: a re-render with the same text leaves
   * the DOM untouched.
   */
  const initialBpm = useRef(genre.default_bpm).current;
  const changeBpm = useCallback(
    (delta: number) => {
      setBpm((current) => {
        const next = Math.min(180, Math.max(60, Math.round(current + delta)));
        if (next !== current) onTempo?.(next);
        return next;
      });
    },
    [onTempo]
  );

  /**
   * A different genre means a different tempo.
   *
   * The state was seeded once from the genre the screen first mounted with, so skipping to the next song
   * (or opening the player on another genre) left the readout, the damper and the engine's tempo all
   * disagreeing. The engine has already switched by the time this runs, so this follows it: the state
   * takes the new genre's default and the canvas snaps its damper instead of walking from the old number.
   */
  useEffect(() => {
    setBpm(genre.default_bpm);
  }, [genre.id, genre.default_bpm]);

  useEffect(() => {
    if (!isPlaying) return;
    setDropping(true);
    const id = window.setTimeout(() => setDropping(false), 550);
    return () => window.clearTimeout(id);
  }, [isPlaying]);

  /** The reference counts the elapsed time on its own 400 ms timer, not on the audio clock. */
  useEffect(() => {
    if (!isPlaying) return;
    const started = performance.now();
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((performance.now() - started) / 1000), 400);
    return () => window.clearInterval(id);
  }, [isPlaying]);

  /** The lane dots the record shows: the genre's real step pattern, four lanes, outer ring first. */
  const lanes = useMemo(() => {
    const pattern = patternFromGenre(genre);
    return ["kick", "snare", "hihat", "bass"].map((role) => {
      const track = pattern.tracks.find((item) => item.track_id === role) ?? pattern.tracks[0];
      const steps = track?.steps ?? [];
      return Array.from({ length: 16 }, (_, index) => Boolean(steps[index % Math.max(1, steps.length)]));
    });
  }, [genre]);

  const accent = CATEGORY_SWATCH[genre.category];
  const status = isPlaying ? (dropping ? t("mobile_player_status_dropping") : t("mobile_player_status_playing")) : t("mobile_player_status_idle");
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed % 60)).padStart(2, "0")}`;

  return (
    <section
      className="m-player"
      data-testid="mobile-player"
      data-genre={genre.id}
      data-playing={isPlaying ? "true" : "false"}
    >
      <div className="m-player-aura" aria-hidden="true" />

      <header className="m-topbar">
        <div className="m-brand">
          <button
            type="button"
            data-testid="mobile-player-collapse"
            aria-label={t("mobile_player_collapse")}
            onClick={onCollapse}
            className="m-press -ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[var(--m-ink-2)]"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
          <b>GROOVE</b>
          <span>{t("mobile_player_tagline")}</span>
        </div>
        <div className="m-status">
          <span className="m-dot" aria-hidden="true" />
          <span data-testid="mobile-player-status">{status}</span>
        </div>
      </header>

      <section className="m-stage">
        {/*
          The record is one control with two gestures, exactly as in the reference: a drag is the jog,
          and a press that never moves is a tap. Keeping it a real <button> means the tap is a click —
          which is why a jog's release sets `draggedRef` and the handler ignores that one click.
        */}
        <button
          type="button"
          data-testid="mobile-player-record"
          aria-label={t("mobile_genre_open_detail")}
          onClick={() => {
            if (draggedRef.current) {
              draggedRef.current = false;
              return;
            }
            onOpenDetail(genre.id);
          }}
          className="m-orb-wrap m-press border-0 bg-transparent p-0"
        >
          <VinylCanvas
            playing={isPlaying}
            readClock={readClock}
            onScrub={changeBpm}
            onScrubEnd={(flickDelta) => {
              draggedRef.current = true;
              changeBpm(flickDelta);
            }}
            onScrubSound={onScrubSound}
            onScrubSoundEnd={onScrubSoundEnd}
            /* The engine follows the damper, so a jog audibly eases into the new tempo. */
            onBpmTick={onTempo}
            lanes={lanes}
            accent={accent}
            title={genre.name}
            subtitle={genre.category}
            artSeed={genre.id}
            bpm={bpm}
            footer={t("mobile_player_label_footer")}
            bpmOutRef={bpmOutRef}
            progressRef={progressRef}
            totalSteps={genre.sequencer_pattern?.totalSteps || 16}
          />
        </button>

        {/*
          The console: every control except the record, in one column.

          It exists for landscape. Stacked, a landscape phone (390 px tall) has to squeeze the record
          into whatever is left after the top bar, the two hints, the name/tempo line, the progress rail
          and the transport — which measured 143 px of record, i.e. a postage stamp. As a column beside
          the record, the record takes its size from the *height* and the controls take the rest of the
          width, and both are comfortable.
        */}
        <div className="m-console">
          <div className="m-drag-hint" data-testid="mobile-player-scrub-hint">
            <i aria-hidden="true">&#9664;</i>
            {t("mobile_player_scrub_hint")}
            <i aria-hidden="true">&#9654;</i>
          </div>
          <p className="m-mono mt-1 text-[9px] tracking-[0.14em] text-[var(--m-ink-3)]">{t("mobile_player_tap_detail")}</p>

          <div className="m-now-line">
            <div className="min-w-0">
              <div className="m-now-name truncate" data-testid="mobile-player-name">
                {genre.name}
              </div>
              <div className="m-now-cn truncate">{genre.category}</div>
            </div>
            <div className="m-bpm-ctl">
              <HoldButton
                data-testid="mobile-player-bpm-down"
                aria-label={t("mobile_player_slow")}
                step={-1}
                onStep={changeBpm}
              >
                &minus;
              </HoldButton>
              <div className="m-bpm-val" data-testid="mobile-player-bpm">
                {/* The damper's value, not React's target — see `initialBpm`. */}
                <b ref={bpmOutRef as React.RefObject<HTMLElement>} data-testid="mobile-player-bpm-value">
                  {initialBpm}
                </b>{" "}
                <small>BPM</small>
              </div>
              <HoldButton
                data-testid="mobile-player-bpm-up"
                aria-label={t("mobile_player_fast")}
                step={1}
                onStep={changeBpm}
              >
                +
              </HoldButton>
            </div>
          </div>

          <div className="m-prog-row">
            <div className="m-prog-track">
              <div
                ref={progressRef as React.RefObject<HTMLDivElement>}
                className="m-prog-fill"
                data-testid="mobile-player-progress"
              />
            </div>
            <div className="m-prog-meta">
              <span data-testid="mobile-player-elapsed">{mmss}</span>
              <span>{t("mobile_player_realtime")}</span>
              <span>&#8734; {t("mobile_player_loop")}</span>
            </div>
          </div>

          <div className="m-transport">
            <button
              type="button"
              data-testid="mobile-player-mode"
              aria-label={t(PLAY_MODE_LABEL_KEYS[playMode])}
              onClick={onCycleMode}
              className={`m-tbtn ${playMode === "one" ? "" : "on"}`}
            >
              {MODE_ICONS[playMode]}
            </button>
            <button
              type="button"
              data-testid="mobile-player-skip-back"
              aria-label={t("mobile_back")}
              onClick={() => onSkip(-1)}
              className="m-tbtn"
            >
              <SkipBack className="h-5 w-5" />
            </button>
            <button
              type="button"
              data-testid="mobile-player-play"
              aria-pressed={isPlaying}
              aria-label={isPlaying ? t("mobile_player_pause") : t("mobile_player_play")}
              onClick={() => onTogglePlay(genre.id)}
              className="m-tbig"
            >
              {/* Both icons are in the DOM; `[data-playing]` swaps them, exactly as the reference does. */}
              <Play className="m-ic-play h-8 w-8" fill="currentColor" />
              <Pause className="m-ic-pause h-8 w-8" fill="currentColor" />
            </button>
            <button
              type="button"
              data-testid="mobile-player-skip-forward"
              aria-label={t("mobile_player_open")}
              onClick={() => onSkip(1)}
              className="m-tbtn"
            >
              <SkipForward className="h-5 w-5" />
            </button>
            <button
              type="button"
              data-testid="mobile-player-drawer-toggle"
              aria-label={t("mobile_genre_picker_title")}
              aria-expanded={listOpen}
              onClick={() => setListOpen((open) => !open)}
              className={`m-tbtn ${listOpen ? "on" : ""}`}
            >
              <ListMusic className="h-5 w-5" />
            </button>
          </div>

          {/*
            The list button opens the shell's genre picker (C-02), not the fourteen-row tease it used to.
            
            The panel wrapper stays in the DOM whether or not the picker is showing — it is the switch the
            picker's own test drives, and a wrapper that vanished when closed would make "is it open?"
            unanswerable from the outside. The picker itself owns the two levels, the filter and the
            back control; the host owns only the choice's meaning, which here is "switch the record
            without leaving the player" (`onPlayGenre`), exactly what the pull-down list did. It stays in
            the flow rather than over it so the transport's own button can still close it.
          */}
          <div
            data-testid="mobile-player-drawer-panel"
            className={listOpen ? "is-open" : ""}
            aria-hidden={!listOpen}
          >
            <MobileGenrePicker
              open={listOpen}
              onClose={() => setListOpen(false)}
              onSelect={(id) => {
                // Tapping the row that is already playing is a no-op, not a restart.
                if (id !== genre.id) (onPlayGenre ?? onTogglePlay)(id);
                setListOpen(false);
              }}
              currentGenreId={genre.id}
              initialCategory={genre.category}
              /* The rows keep the ids this screen's tests (and the E2E matrix) already drive. */
              genreTestIdPrefix="mobile-player-cue"
            />
          </div>
        </div>
      </section>

      <footer className="m-foot" data-testid="mobile-player-foot">
        <span>{t("mobile_player_footer")}</span>
      </footer>
    </section>
  );
}

/**
 * A tempo button that repeats while it is held.
 *
 * Straight from the reference's `holdable()`: one step immediately, then — after 420 ms — one step every
 * 70 ms. The click handler is suppressed for half a second after a pointer press, so a real hold does
 * not add a second step on release while a keyboard or programmatic click still works.
 */
function HoldButton({
  step,
  onStep,
  children,
  ...rest
}: { step: number; onStep: (delta: number) => void; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const timers = useRef<{ delay: number; repeat: number } | null>(null);
  const pressedAt = useRef(0);

  const stop = useCallback(() => {
    if (!timers.current) return;
    window.clearTimeout(timers.current.delay);
    if (timers.current.repeat) window.clearInterval(timers.current.repeat);
    timers.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  return (
    <button
      type="button"
      {...rest}
      onPointerDown={(event) => {
        event.preventDefault();
        pressedAt.current = Date.now();
        onStep(step);
        const delay = window.setTimeout(() => {
          const repeat = window.setInterval(() => onStep(step), 70);
          timers.current = { delay: 0, repeat };
        }, 420);
        timers.current = { delay, repeat: 0 };
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={() => {
        if (Date.now() - pressedAt.current < 500) return;
        onStep(step);
      }}
    >
      {children}
    </button>
  );
}
