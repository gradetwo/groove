/**
 * The arrangement, laid out the way the manual-reading survey says every DAW lays one out.
 *
 * `docs/ARRANGEMENT_UI_DESIGN.md` §1 records the structure from REAPER's, Bitwig's, Cubase's and Live's own manuals:
 * time runs left to right, tracks stack downward, a **fixed track-header column sits beside a lane area**, the
 * **ruler spans the lanes only**, and a global transport bar runs across the top. §8 ranks what to build first, and
 * this file is that ranking in DOM order:
 *
 * 1. one global toolbar — transport, position, tempo, bars, snap (visible value **and** toggle), loop, zoom, and the
 *    editor tabs on the right (§8 items 1 and 6);
 * 2. a 240 px fixed header column beside the lanes, the ruler over the lanes only (§8 item 2);
 * 3. a ruler label that subdivides with zoom (§8 item 3);
 * 7. track headers carrying Bitwig's documented minimum set in Bitwig's order (§8 item 7, §2);
 * 9. one region per track with a non-editable note miniature (§8 item 9, §4 option (a));
 * 4/5. a playhead and a play-start as **two** indicators, and a loop brace settable by pointer **and** keyboard
 *    (§8 items 4 and 5, with §7's WCAG 2.5.7 requirement).
 *
 * **What is deliberately absent**: modal tool palettes, editing region contents in the lane, and 24 px controls on
 * touch. Those are §5's rejected conventions, and each has a reason recorded there rather than here.
 *
 * **It owns no rules, still.** Adding, muting, arming, moving takes and playing are pure functions with their own
 * criteria; this file holds the arrangement value, the view state that is genuinely a view's (which bar, which zoom,
 * which tab), and calls them. That is the discipline the previous version of this file documented, kept.
 *
 * Two pieces of view state are **the model's** rather than this file's, which is worth saying because it looks like
 * an inconsistency: the loop range and the record-arm flag live on `arrangement` (arm) or in `loopRange` (loop) so
 * that "what will repeat" and "which track is armed" survive a re-render for reasons other than a click. Neither is
 * persisted yet, and neither changes what the engine plays — the loop brace is a ruler-level loop that no audio path
 * reads. That is stated here rather than implied.
 */
import { useCallback, useMemo, useState } from "react";
import type { ArrangementV2, TrackKindV2 } from "../../types/arrangementV2";
import { addTake, addTrack, addTrackNote, changeTrackKind, moveTrackNote, removeTrackNote, setArrangementBars, setArrangementTempo, setTrackGain, setTrackNoteLength, setTrackPan, setTrackSample, toggleStep, createArrangementFromTemplate, removeTrack, setCollapsed, setTrackFlag, selectTrackTake } from "../../data/arrangementEdits";
import type { CaptureOutcome } from "../../audio/captureTake";
import { DEFAULT_PX_PER_BAR, MAX_PX_PER_BAR, MIN_PX_PER_BAR } from "./ArrangementRulerV2";
import { TrackListV2, type InstrumentChoice } from "./TrackListV2";
import { TakeSelectorV2 } from "./TakeSelectorV2";
import { RecordButtonV2 } from "./RecordButtonV2";
import { ArrangementKeyboardV2 } from "./ArrangementKeyboardV2";
import { PianoRollV2 } from "./PianoRollV2";
import { ScoreV2 } from "./ScoreV2";
import { ArrangementRulerV2 } from "./ArrangementRulerV2";
import { ArrangementLaneV2 } from "./ArrangementLaneV2";
import { TrackHeaderV2 } from "./TrackHeaderV2";
import { LoopBraceV2 } from "./LoopBraceV2";
import { loopRangeAt, type LoopRange } from "../../data/arrangementLoop";
import { useLanguage } from "../../i18n/LanguageContext";
import { NewProjectPanelV2 } from "./NewProjectPanelV2";
import { playArrangementV2, type ArrangementPlayer } from "../../audio/playArrangementV2";

/** The snap values the toolbar offers, coarsest to finest. The **value** is shown, because a toggle's state is not a value. */
export const SNAP_VALUES = ["1/4", "1/8", "1/16", "1/32"] as const;
export type SnapValue = (typeof SNAP_VALUES)[number];
const DEFAULT_SNAP: SnapValue = "1/16";

/** The zoom step, applied on every press of − and +. The ends are the ruler's own exported bounds. */
const ZOOM_FACTOR = 1.5;

export interface ArrangementViewV2Props {
  songId: string;
  /** Starting a capture, injected so the view needs no microphone to be rendered — the same seam the capture itself uses. */
  capture: () => Promise<CaptureOutcome>;
  /** The bar the transport is on; the take selector marks what would be heard there. */
  bar?: number;
  /**
   * ⭐ The engine, injected — `playAudioLanes` with the app's context and destination in the application, a fake in a criterion.
   *
   * Optional on purpose: the view can be rendered and judged **before** the engine is wired, so the interface work and the audio wiring are not one indivisible change. When it is absent the play button says so
   * rather than pretending to play.
   */
  player?: ArrangementPlayer;
  /**
   * The instruments a sampler track may play, injected like `player` and `capture` — the view needs no catalogue to be rendered or judged, and the application decides where the list comes from.
   */
  instruments?: readonly InstrumentChoice[];
  /**
   * Where the playhead is, in bars, when the host has a transport that reports one.
   *
   * **Separate from `bar` on purpose, and that is the point of the brief's §8 item 4**: Bitwig's manual draws a
   * Global Playhead and a Play Start Marker as two indicators, and folding "where playback is" into "where a play
   * begins" is exactly the conflation that model exists to avoid. Absent means bar 0 — the picture a fresh
   * arrangement should show — not "hide the playhead".
   */
  playheadBar?: number;
}

export function ArrangementViewV2({ songId, capture, bar = 0, player, instruments, playheadBar }: ArrangementViewV2Props) {
  const { t } = useLanguage();
  /**
   * ⭐ **A new project starts by choosing what it is** — which is Logic's `Choose a Project`, and the owner's "there is no good new-project entry". `undefined` means the choice has not been made, and the panel is
   * what the route shows until it is; only then is there an arrangement to edit.
   */
  /**
   * ⭐ **`choosing`, not an optional arrangement** — and the difference is not stylistic. An `ArrangementV2 | undefined` cannot be narrowed inside the hooks, so every callback would need a guard whose absence is a
   * runtime bug rather than a type error. A separate flag keeps the arrangement always valid, so "no arrangement yet" is a thing the component *says* rather than a thing it must remember to check.
   */
  const [choosing, setChoosing] = useState(true);
  const [arrangement, setArrangement] = useState<ArrangementV2>(() => createArrangementFromTemplate(songId, undefined, "instrument"));
  const [selectedTrackId, setSelectedTrackId] = useState<string | undefined>(undefined);
  /**
   * ⭐ **Which bar the strips show, which is not the transport's bar.** `bar` above is where the transport is in the underlying song and is what the take selector marks; this is a view choice — which sixteen squares a row draws. They are separate because an arrangement of eight bars still
   * has one transport, and a person looking at bar three has not thereby moved the playhead.
   */
  const [stripBar, setStripBar] = useState(0);
  /**
   * ⭐ **Which editor is open.** Logic puts Piano Roll, Score and Smart Tempo behind tabs because they are three ways of looking at one performance, and switching between them must not move anything. Two of them here: the roll writes, the score reads.
   *
   * The tabs sit at the **right of the global toolbar** because that is where Cubase and Logic put the editor's view
   * switch, and the brief keeps them out of the mode space: switching a tab is a change of *reading*, not a change of
   * tool, and it moves neither the playhead nor the scroll position.
   */
  const [editor, setEditor] = useState<"roll" | "score">("roll");
  /** The zoom, in pixels per bar — **one number shared by the ruler and the lanes**, so bar 5 cannot sit above beat 3. */
  const [pixelsPerBar, setPixelsPerBar] = useState(DEFAULT_PX_PER_BAR);
  /** The visible snap value and whether snapping is actually on. Two facts, two pieces of state. */
  const [snap, setSnap] = useState<SnapValue>(DEFAULT_SNAP);
  const [snapOn, setSnapOn] = useState(true);
  /**
   * The loop brace. `undefined` is "no loop", which is the state Live starts in; the toolbar's Loop button turns one
   * on at the bar the view is looking at rather than at bar 1, because the bar on screen is the bar the user means.
   */
  const [loopRange, setLoopRange] = useState<LoopRange | undefined>(undefined);
  /** The play-start marker, in bars. Clicking the ruler sets it — Bitwig's "single click in the upper ruler sets the play start". */
  const [playStartBar, setPlayStartBar] = useState(0);
  /** Which row's instrument library is open. One at a time: two panels would make the header column jump height. */
  const [openLibraryFor, setOpenLibraryFor] = useState<string | undefined>(undefined);
  /** What the last play reported — **zero is shown, not hidden**: "nothing was planned" is a fact a user should see rather than a silent no-op. */
  const [played, setPlayed] = useState<number | undefined>(undefined);
  /** Why nothing played, when nothing did — the engine can be unreachable or its instrument unresolvable, and both are answers rather than silence. */
  const [playProblem, setPlayProblem] = useState<string | undefined>(undefined);

  const bars = arrangement.bars ?? 8;
  const headerBars = arrangement.tracks.length === 0 ? 0 : bars;
  const laneWidth = Math.max(1, headerBars) * pixelsPerBar;

  const onAddTrack = useCallback((kind: TrackKindV2, name: string) => {
    setArrangement((current) => {
      const next = addTrack(current, kind, name);
      // The new track becomes the selected one: a track you just created is the track you meant to act on.
      setSelectedTrackId(next.tracks[next.tracks.length - 1]?.id);
      return next;
    });
  }, []);

  const selected = useMemo(() => arrangement.tracks.find((track) => track.id === selectedTrackId), [arrangement, selectedTrackId]);

  /**
   * The toolbar's Loop button.
   *
   * ⭐ It does not flip a boolean: a loop that is "on" with no range is a state the model cannot express and the
   * ruler cannot draw, so switching it on **creates a range** at the bar the view is looking at. Switching it off
   * removes the range, which is the only honest way to say "no loop".
   */
  const toggleLoop = useCallback(() => {
    setLoopRange((current) => (current ? undefined : loopRangeAt(bars, stripBar)));
  }, [bars, stripBar]);

  const onRulerSelect = useCallback((next: number) => {
    setStripBar(next);
    // The ruler click sets where a play will begin, which is Bitwig's gesture and why the play-start marker is here.
    setPlayStartBar(next);
  }, []);

  const play = useCallback(async () => {
    if (player === undefined) return;
    // ⭐ The arrangement's own notes, not an empty map: they are content and they live with the tracks.
    const result = await playArrangementV2(arrangement, arrangement.notesByTrack ?? {}, player);
    setPlayed(result.planned);
    /**
     * ⭐ **A reason, shown.** The engine path answers with why when it cannot play — not ready, no transport, a
     * sampler note no region covers — and an interface that discarded that would put the user back in front of a
     * Play button that does nothing for no stated reason, which is the failure this whole workstream keeps removing.
     */
    setPlayProblem(result.reason ?? result.problems?.join("; "));
  }, [arrangement, player]);

  const stop = useCallback(() => {
    player?.stop?.();
    // The report goes with it: once stopped, "planned N lane events" described a play that is over.
    setPlayed(undefined);
    setPlayProblem(undefined);
  }, [player]);

  // ⭐ The early return sits **after every hook**, because a conditional hook changes their order: the first version of this had it above `useCallback` and produced six type errors, whose real content was a React bug.
  if (choosing) {
    return (
      <NewProjectPanelV2
        onCreate={(templateId, blankKind) => {
          // ⭐ The panel reports the choice; **what an arrangement is made of** is `createArrangementFromTemplate`'s business, including the default track a blank project still gets.
          setArrangement(createArrangementFromTemplate(songId, templateId, blankKind));
          setSelectedTrackId(undefined);
          setChoosing(false);
        }}
      />
    );
  }

  /** A transport button. 44 px tall like everything else in the bar: the arrangement is a phone surface too. */
  const toolButton = "h-11 shrink-0 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] px-2 text-xs text-text disabled:opacity-50";

  return (
    <div data-testid="arrangement-view-v2" className="flex flex-col gap-2 p-2 text-text">
      {/**
       * ⭐ **One global toolbar** (§8 item 1), 44 px tall. Live's Control Bar is the model: transport, position,
       * tempo, grid and zoom in one strip rather than scattered over the surface, because a person adjusting the
       * grid should not have to find which panel owns it today.
       *
       * It is one row of controls at `--arr-toolbar-h` and may wrap on a narrow window; wrapping is the right failure
       * here, because the alternative is shrinking a target below the 44 px the surface is held to.
       */}
      <div
        data-testid="arrangement-toolbar"
        role="toolbar"
        aria-label={t("arrangement_toolbar_label")}
        className="flex flex-wrap items-center gap-1"
        style={{ minHeight: "var(--arr-toolbar-h)" }}
      >
        {/* Transport. Play is disabled without an engine and says so below rather than looking broken. */}
        <button type="button" data-testid="arrangement-play" className={toolButton} disabled={player === undefined} onClick={() => void play()}>
          {t("arrangement_play")}
        </button>
        {/**
         * **Stop, because the sampler's notes are started on the audio clock and the engine's transport cannot reach them.** Without it, pressing play on a piano arrangement and then wanting it to
         * stop left every scheduled note ringing — the arrangement player is the only object that holds those voices, so only this button can silence them.
         */}
        <button type="button" data-testid="arrangement-stop" className={toolButton} disabled={player?.stop === undefined} onClick={stop}>
          {t("arrangement_stop")}
        </button>
        {/*
          Record, which used to be buried in the detail panel: the brief's item 1 puts it in the transport. Disabled
          with no track selected, because a take recorded with nowhere to go is captured and dropped — the failure the
          `onTake` seam exists to prevent, and one the toolbar makes easier to hit than the old panel did.
        */}
        <RecordButtonV2
          capture={capture}
          disabled={selected === undefined}
          onTake={(planned) => selected !== undefined && setArrangement((current) => addTake(current, selected.id, planned))}
        />

        {/**
         * ⭐ **The transport's own report**: the position, and — when there is no engine — why the play button is
         * disabled. It kept its own `data-testid` through the rebuild because these two facts are what the
         * arrangement says about playing, and the criterion that reads them is about the engine seam rather than the
         * layout. It is a sibling of the position readout rather than its container: the position is a value the
         * toolbar draws, and the report is what the transport is doing, and nesting one inside the other made the
         * readout's text look like part of the report.
         */}
        <span data-testid="arrangement-transport" className="flex items-center gap-1">
          {/* ⭐ Said rather than clicked into nothing: without an engine the button is disabled and this explains why. */}
          {player === undefined && <span className="text-[10px] text-text opacity-70">(audio engine not connected yet)</span>}
          {played !== undefined && <span data-testid="arrangement-played" className="text-[10px] text-text opacity-70">planned {played} lane event(s)</span>}
          {playProblem !== undefined && <span data-testid="arrangement-play-problem" className="text-[10px] text-text opacity-70">{playProblem}</span>}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[10px] text-text opacity-70">{t("arrangement_position")}</span>
          <span
            data-testid="arrangement-position"
            className="rounded border border-[var(--d-border,rgba(255,255,255,0.15))] px-1 font-['JetBrains_Mono'] text-xs"
          >
            {stripBar + 1}.1
          </span>
        </span>

        {/* Tempo and bars: the arrangement's own declared length and speed, editable where the transport is. */}
        <label className="flex items-center gap-1 text-[10px] text-text opacity-80">
          {t("arrangement_tempo")}
          <input
            type="number"
            min={20}
            max={300}
            aria-label={t("arrangement_tempo_bpm")}
            data-testid="arrangement-tempo"
            value={arrangement.bpm ?? 120}
            onChange={(event) => setArrangement((current) => setArrangementTempo(current, Number(event.target.value)))}
            className="h-6 w-14 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] bg-transparent px-1 font-['JetBrains_Mono'] text-xs text-text"
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-text opacity-80">
          {t("arrangement_bars")}
          <input
            type="number"
            min={1}
            max={128}
            aria-label={t("arrangement_bars")}
            data-testid="arrangement-bars"
            value={bars}
            onChange={(event) => setArrangement((current) => setArrangementBars(current, Number(event.target.value)))}
            className="h-6 w-12 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] bg-transparent px-1 font-['JetBrains_Mono'] text-xs text-text"
          />
        </label>

        {/**
         * ⭐ **The snap value is visible text, and the toggle is separate from it** (§8 item 6, §3). Live shows the
         * grid spacing in the ruler's corner for the same reason: a switch that says only "on" answers a question
         * nobody asked, because the question is *on what*. The button that changes the value is therefore not the
         * button that turns snapping on and off.
         */}
        <button
          type="button"
          data-testid="arrangement-snap-cycle"
          aria-label={t("arrangement_snap_cycle")}
          onClick={() => setSnap((current) => SNAP_VALUES[(SNAP_VALUES.indexOf(current) + 1) % SNAP_VALUES.length]!)}
          className="h-11 shrink-0 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] px-1 font-['JetBrains_Mono'] text-xs text-text"
        >
          <span className="text-[10px] opacity-70">{t("arrangement_snap")}</span>{" "}
          <span data-testid="arrangement-snap-value">{snap}</span>
        </button>
        <button
          type="button"
          data-testid="arrangement-snap-toggle"
          aria-label={t("arrangement_snap_toggle")}
          aria-pressed={snapOn}
          onClick={() => setSnapOn((current) => !current)}
          className={`h-11 w-11 shrink-0 rounded border text-xs ${snapOn ? "border-[var(--d-accent)] bg-[var(--d-accent)] text-[var(--d-accent-ink)]" : "border-[var(--d-border,rgba(255,255,255,0.15))] text-text"}`}
        >
          #
        </button>

        {/* Loop: the switch, and — when it is on — the brace in the ruler. */}
        <button
          type="button"
          data-testid="arrangement-loop"
          aria-label={t("arrangement_loop")}
          aria-pressed={loopRange !== undefined}
          onClick={toggleLoop}
          className={`h-11 shrink-0 rounded border px-2 text-xs ${loopRange !== undefined ? "border-[var(--d-accent)] bg-[var(--d-accent)] text-[var(--d-accent-ink)]" : "border-[var(--d-border,rgba(255,255,255,0.15))] text-text"}`}
        >
          ⟲
        </button>

        {/* Zoom. The same control the ruler's own manual gestures answer to, and the reason the labels subdivide. */}
        <span className="flex shrink-0 items-center">
          <button
            type="button"
            data-testid="arrangement-zoom-out"
            aria-label={t("arrangement_zoom_out")}
            onClick={() => setPixelsPerBar((current) => Math.max(MIN_PX_PER_BAR, Math.round(current / ZOOM_FACTOR)))}
            className={toolButton}
          >
            −
          </button>
          <button
            type="button"
            data-testid="arrangement-zoom-in"
            aria-label={t("arrangement_zoom_in")}
            onClick={() => setPixelsPerBar((current) => Math.min(MAX_PX_PER_BAR, Math.round(current * ZOOM_FACTOR)))}
            className={toolButton}
          >
            +
          </button>
          <span data-testid="arrangement-zoom-value" className="w-8 text-right font-['JetBrains_Mono'] text-[10px] text-text opacity-70">
            {pixelsPerBar}
          </span>
        </span>

        {/**
         * The editor tabs, on the right (§8 item 1). They read as Logic's do, and they are what makes "look at the
         * score" something a person discovers rather than a setting they have to find. Only for a track that has
         * notes to read: an effect or folder track is told why rather than given tabs that would show nothing.
         */}
        {selected !== undefined && selected.kind !== "fx" && selected.kind !== "folder" && (
          <div data-testid="arrangement-editor-tabs" role="tablist" className="ml-auto flex gap-1 pl-2">
            {(["roll", "score"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                data-testid={`arrangement-editor-${value}`}
                aria-selected={editor === value}
                onClick={() => setEditor(value)}
                className={`h-11 rounded px-3 text-xs ${editor === value ? "bg-[var(--d-accent)] text-[var(--d-accent-ink)]" : "text-text opacity-70"}`}
              >
                {value === "roll" ? t("view_piano_roll") : t("view_score")}
              </button>
            ))}
          </div>
        )}
      </div>

      {/**
       * The track picker: a row of names, one press each, for the times the header column is scrolled away or a
       * person is reading the detail dock. It kept its own `data-testid` through the layout rebuild because it is the
       * second reading of "which track is selected" — the header shows it too, and both are addressed by criteria.
       */}
      <ul data-testid="arrangement-track-picker" className="flex flex-wrap gap-1">
        {arrangement.tracks.map((track) => (
          <li key={track.id}>
            <button
              type="button"
              className="h-11 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] px-2 text-xs text-text"
              onClick={() => setSelectedTrackId(track.id)}
              aria-pressed={track.id === selectedTrackId}
            >
              {track.name}
            </button>
          </li>
        ))}
      </ul>

      {/**
       * ⭐ **The grid: a fixed header column beside a lane area** (§8 item 2). The structure is what makes three
       * things true at once, and each is a criterion:
       *
       * - the **header column has no ruler** — the ruler is inside the lane column, so there is nowhere for one to be;
       * - the **ruler scrolls horizontally with the lanes** — they are in one `overflow-x` container, not two
       *   containers kept in step by a scroll listener, which is the version that drifts by a pixel;
       * - the **headers scroll vertically with the lanes** — likewise one `overflow-y` container, with the header
       *   column pinned horizontally by `sticky left-0`, which is how the user's own layout convention is usually
       *   implemented, and is why the ruler needs an offset equal to the header width rather than a separate rail.
       */}
      <div
        data-testid="arrangement-grid"
        /*
          The width as a value, for the same reason `data-start-bar` is a value on a region: a criterion can assert
          **the structure** (that the ruler is offset by exactly this, that the header column is exactly this wide)
          without asserting a pixel a stylesheet could legitimately change. It is a literal here because inline styles
          cannot read a custom property; the value it must equal is asserted in `arrangementGrid.test.tsx` against
          `index.css`, so the two cannot drift apart silently.
        */
        data-header-width="240"
        className="relative max-h-[60vh] overflow-y-auto rounded border border-[var(--d-border,rgba(255,255,255,0.15))]"
      >
        <div data-testid="arrangement-track-space" className="flex min-w-max flex-col">
          {/* The ruler's row. The lane column begins after a spacer the width of the header column, so the ruler's
              bar 1 sits exactly above the lane's bar 1. The header column has no ruler because this row is inside the
              lane column rather than above the whole grid. */}
          <div className="flex items-stretch border-b border-[var(--d-border,rgba(255,255,255,0.15))]">
            {/* A spacer where the header column is — the ruler starts after it. */}
            <span data-testid="arrangement-ruler-offset" aria-hidden="true" style={{ width: "var(--arr-head-w)" }} className="shrink-0 border-r border-[var(--d-border,rgba(255,255,255,0.15))]" />
            <div className="sticky left-0 min-w-0 flex-1 overflow-x-auto">
              <div className="relative" style={{ width: laneWidth }}>
                <ArrangementRulerV2
                  bars={bars}
                  currentBar={stripBar}
                  onSelectBar={onRulerSelect}
                  pixelsPerBar={pixelsPerBar}
                  snapLabel={snapOn ? snap : undefined}
                />
                {/* The loop brace lives in the ruler, which is where Live and Bitwig draw it. */}
                {loopRange !== undefined && (
                  <LoopBraceV2 loop={loopRange} pixelsPerBar={pixelsPerBar} bars={bars} onChange={setLoopRange} />
                )}
                {/* ⭐ Two indicators, not one (§8 item 4). The play-start is a triangle in the ruler — Bitwig's own
                    shape — and the playhead is the line below, in the lanes. They are separate elements with
                    separate values, so "where a play begins" and "where playback is" can never be the same fact. */}
                <span
                  data-testid="arrangement-play-start"
                  aria-label={t("play_start_label")}
                  role="img"
                  className="absolute bottom-0 z-20 h-0 w-0 border-x-4 border-b-4 border-x-transparent border-b-[var(--d-accent)]"
                  style={{ left: playStartBar * pixelsPerBar - 4 }}
                />
              </div>
            </div>
          </div>

          {/* Track rows. One flex row per track: the header (sticky, so it stays while the lanes scroll sideways) and
              the lane. Headers and lanes are siblings inside one vertical scroller, so their heights cannot drift. */}
          <div data-testid="arrangement-header-column" aria-label={t("arrangement_tracks_label")} className="flex min-w-max">
            <div className="sticky left-0 z-10 shrink-0 border-r border-[var(--d-border,rgba(255,255,255,0.15))]" style={{ width: "var(--arr-head-w)" }}>
              {/* Adding tracks sits at the top of the header column, which is where every DAW's "new track" is. */}
              <div data-testid="track-list-add" className="flex flex-wrap items-center gap-1 border-b border-[var(--d-border,rgba(255,255,255,0.15))] p-1">
                {(["sampler", "instrument", "drumkit", "fx", "folder"] as const).map((kind) => (
                  <button key={kind} type="button" className="min-h-[44px] rounded border border-[var(--d-border,rgba(255,255,255,0.15))] px-1 text-[10px] text-text" onClick={() => onAddTrack(kind, kind)}>
                    + {kind}
                  </button>
                ))}
              </div>
              {arrangement.tracks.map((track) => (
                <div
                  key={track.id}
                  data-testid={`arrangement-header-row-${track.id}`}
                  onFocusCapture={() => setSelectedTrackId(track.id)}
                  onPointerDown={() => setSelectedTrackId(track.id)}
                  className={`border-b border-[var(--d-border,rgba(255,255,255,0.15))] ${track.id === selectedTrackId ? "bg-[var(--d-surface,rgba(255,255,255,0.06))]" : ""}`}
                >
                  <TrackHeaderV2
                    track={track}
                    depth={depthOf(track, arrangement)}
                    libraryOpen={openLibraryFor === track.id}
                    onLibraryOpenChange={(trackId, open) => setOpenLibraryFor(open ? trackId : undefined)}
                    instruments={instruments}
                    {...(instruments !== undefined ? { onChangeInstrument: (trackId, assetId) => setArrangement((current) => setTrackSample(current, trackId, assetId)) } : {})}
                    onToggle={(trackId, flag, value) => setArrangement((current) => setTrackFlag(current, trackId, flag, value))}
                    onToggleArm={(trackId, armed) => setArrangement((current) => setTrackFlag(current, trackId, "armed", armed))}
                    onChangeGain={(trackId, gainDb) => setArrangement((current) => setTrackGain(current, trackId, gainDb))}
                    onChangeKind={(trackId, kind) => setArrangement((current) => changeTrackKind(current, trackId, kind))}
                    onToggleCollapse={(trackId, collapsed) => setArrangement((current) => setCollapsed(current, trackId, collapsed))}
                    onRemoveTrack={(trackId) => {
                      setArrangement((current) => removeTrack(current, trackId));
                      // A removed track must not stay selected: the take selector would then describe something that is gone.
                      setSelectedTrackId((current) => (current === trackId ? undefined : current));
                    }}
                  />
                </div>
              ))}
            </div>
            {/* The lane column. Its width is bars × pixels-per-bar — the ruler's own number.
                The bar lines are a repeating background rather than one element per bar: they have to run the full
                height of the lanes so a region can be read against the ruler **between** tracks as well as inside
                one, and a node per bar per track would be `bars × tracks` elements for a line the zoom already
                implies. It sits behind the regions, so a region block is still the thing a press lands on. */}
            <div
              className="relative flex-1"
              style={{
                width: laneWidth,
                backgroundImage: `repeating-linear-gradient(to right, var(--d-border, rgba(255,255,255,0.15)) 0 1px, transparent 1px ${pixelsPerBar}px)`,
              }}
            >
              <ArrangementLaneV2
                arrangement={arrangement}
                pixelsPerBar={pixelsPerBar}
                {...(selectedTrackId !== undefined ? { selectedTrackId } : {})}
                onSelectTrack={setSelectedTrackId}
              />
              {/* The playhead: the second of the two indicators. A line over the lanes, positioned in bar space. */}
              <span
                data-testid="arrangement-playhead"
                aria-label={t("playhead_label")}
                role="img"
                className="pointer-events-none absolute inset-y-0 z-20 w-px bg-text"
                style={{ left: (playheadBar ?? 0) * pixelsPerBar }}
              />
            </div>
          </div>
        </div>
      </div>

      {/**
       * ⭐ **The detail dock**, below the grid. The brief keeps the editor tabs' *content* out of the global toolbar
       * (§6.2): one `NoteEvent[]`, two readings, one at a time, and switching views must not move the playhead, scroll
       * the arrangement or change the selection. What is above is the switch; this is the editor.
       */}
      <div data-testid="arrangement-detail" className="flex flex-col gap-2 rounded border border-[var(--d-border,rgba(255,255,255,0.15))] bg-[var(--d-surface,rgba(255,255,255,0.04))] p-3">
        {selected === undefined ? (
          // Said rather than left blank, so an empty panel reads as "nothing selected" instead of "something is broken".
          <p>Select a track to see its takes.</p>
        ) : (
          <>
            <TakeSelectorV2 track={selected} bar={bar} onSelect={(takeId) => setArrangement((current) => selectTrackTake(current, selected.id, takeId))} />
            {/**
             * **The roll, for a track that plays pitches.** It is here rather than in a separate editor because the owner's complaint was having to leave the arrangement to enter notes; the keyboard below plays, this writes, and both act on the selected track.
             */}
            {selected.kind !== "fx" && selected.kind !== "folder" && editor === "score" && (
              /**
               * **The score and the roll show the same notes.** That is the whole claim of having both, and it is why neither owns the data: they are two readings of one `NoteEvent[]`.
               */
              <ScoreV2 notes={arrangement.notesByTrack?.[selected.id] ?? []} bars={bars} title={`${selected.name} — ${t("view_score")}`} />
            )}
            {selected.kind !== "fx" && selected.kind !== "folder" && editor === "roll" && (
              <PianoRollV2
                notes={arrangement.notesByTrack?.[selected.id] ?? []}
                // The roll shows the whole arrangement, so its length and the transport's are the same number.
                beats={bars * 4}
                onSetBars={(next) => setArrangement((current) => setArrangementBars(current, next))}
                onAddNote={(note) => setArrangement((current) => addTrackNote(current, selected.id, note))}
                onRemoveNote={(at) => setArrangement((current) => removeTrackNote(current, selected.id, at))}
                onMoveNote={(from, to) => setArrangement((current) => moveTrackNote(current, selected.id, from, to))}
                onResizeNote={(at, lengthBeats) => setArrangement((current) => setTrackNoteLength(current, selected.id, at, lengthBeats))}
              />
            )}
            {selected.kind === "sampler" && selected.sample ? (
              /**
               * **The keyboard, where the instrument is.** A sampler track is the one that plays a real instrument, so
               * it is the one that can be auditioned; a drum or effect track is told why rather than given keys that
               * would do nothing.
               *
               * Pressing a key resolves that instrument's note through the SFZ path and sounds it at the note's rate —
               * the `audition` half of the player, which is what makes a mirrored library testable by hand.
               */
              <ArrangementKeyboardV2
                onNoteOn={(midi, velocity) => {
                  void player?.audition?.({ assetId: selected.sample!.assetId, midi, trackId: selected.id, gainDb: selected.gainDb });
                }}
                onNoteOff={(midi) => {
                  player?.releaseNote?.({ midi, trackId: selected.id });
                }}
              />
            ) : (
              <p className="text-xs text-text opacity-70">{t(selected.kind === "sampler" ? "keyboard_needs_instrument" : "keyboard_needs_sampler")}</p>
            )}
          </>
        )}
      </div>

      {/**
       * The old row-based list, kept as a report of the arrangement rather than as the editing surface.
       *
       * It is here because it still carries what the grid's header deliberately does not: **one bar of steps** per
       * track, which is the pattern-at-a-glance view the owner asked for and which lives nowhere else on this route.
       * Rendering it means the arrangement now has two readings of one model on screen at once, which is the risk the
       * header rebuild was supposed to remove — so it is last, it is the only place the step strip appears, and it is
       * the thing to delete once the step strip has a home in the new grid.
       */}
      <TrackListV2
        arrangement={arrangement}
        onAddTrack={onAddTrack}
        onRemoveTrack={(trackId) => {
          setArrangement((current) => removeTrack(current, trackId));
          setSelectedTrackId((current) => (current === trackId ? undefined : current));
        }}
        onToggle={(trackId, flag, value) => setArrangement((current) => setTrackFlag(current, trackId, flag, value))}
        onToggleCollapse={(trackId, collapsed) => setArrangement((current) => setCollapsed(current, trackId, collapsed))}
        onChangeKind={(trackId, kind) => setArrangement((current) => changeTrackKind(current, trackId, kind))}
        instruments={instruments}
        onChangeInstrument={(trackId, assetId) => setArrangement((current) => setTrackSample(current, trackId, assetId))}
        onToggleStep={(trackId, index) => setArrangement((current) => toggleStep(current, trackId, index))}
        bar={stripBar}
        onChangeGain={(trackId, gainDb) => setArrangement((current) => setTrackGain(current, trackId, gainDb))}
        onChangePan={(trackId, pan) => setArrangement((current) => setTrackPan(current, trackId, pan))}
      />
    </div>
  );
}

/** Depth from `parentId`, so what is drawn and what is grouped are the same fact. Mirrors `TrackListV2`'s own helper. */
function depthOf(track: { id: string; parentId?: string }, arrangement: ArrangementV2, seen = new Set<string>()): number {
  if (!track.parentId || seen.has(track.id)) return 0;
  seen.add(track.id);
  const parent = arrangement.tracks.find((candidate) => candidate.id === track.parentId);
  return parent ? 1 + depthOf(parent, arrangement, seen) : 0;
}
