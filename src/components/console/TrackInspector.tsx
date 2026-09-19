import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { InstrumentPicker } from "./InstrumentPicker";
import { InsertFlowStrip, type InsertStageId } from "./InsertFlowStrip";
import { CompressorCurveView, DriveCurveView, EqCurveView } from "./insertCurveViews";
import { GripHorizontal, Music2, Play, X } from "lucide-react";
import type { MixTrackId } from "../../data/genreMix";
import {
  INSERT_COMP_MAX_ATTACK_SEC,
  INSERT_COMP_MAX_MAKEUP_DB,
  INSERT_COMP_MAX_RATIO,
  INSERT_COMP_MAX_RELEASE_SEC,
  INSERT_COMP_MAX_THRESHOLD_DB,
  INSERT_COMP_MIN_ATTACK_SEC,
  INSERT_COMP_MIN_MAKEUP_DB,
  INSERT_COMP_MIN_RATIO,
  INSERT_COMP_MIN_RELEASE_SEC,
  INSERT_COMP_MIN_THRESHOLD_DB,
  INSERT_DRIVE_MAX,
  INSERT_DRIVE_MIN,
  INSERT_DRIVE_MIX_MAX,
  INSERT_EQ_MAX_GAIN_DB,
  INSERT_EQ_MAX_HZ,
  INSERT_EQ_MAX_Q,
  INSERT_EQ_MIN_GAIN_DB,
  INSERT_EQ_MIN_HZ,
  INSERT_EQ_MIN_Q,
  INSERT_HPF_MAX_HZ,
  INSERT_HPF_MIN_HZ,
  isTrackInsertBypassed,
  type TrackEqBand,
  type TrackInsertParams,
} from "../../data/trackInsert";
import { useLanguage } from "../../i18n/LanguageContext";
import { Button } from "../../ui/Button";
import { formatDb, panLabel } from "./meterMath";

/**
 * Per-track inspector (E-10 UI) — the Logic-style "click a track header and get the
 * whole channel strip" panel.
 *
 * The console's `ChannelStrip` gives a track a fader, a pan, two sends, mute and
 * solo. That is only half of what a channel strip is: nothing in the UI shapes the
 * sound *before* the fader, even though `src/data/trackInsert.ts` has defined the
 * high-pass / EQ / compressor / drive chain since E-10. This panel is that missing
 * surface, in three labelled sections — **Timbre**, **Mix**, **Effects** — so the
 * instrument preset, the mix moves and the insert chain are all adjustable from the
 * track that owns them instead of from a separate floating desk.
 *
 * ## Presentational, exactly like `ConsolePanel`
 *
 * Every value arrives as a prop and every edit leaves through a callback; the panel
 * never imports the sequencer store or an audio engine. The host owns the state and
 * decides what a reset/bypass means for undo and persistence.
 *
 * ## One clamp, at the edge
 *
 * Every numeric control passes its value through {@link clampInspectorValue} before
 * calling back, against the frozen `INSERT_*` bounds (and 0..1 / -1..1 for the mix
 * fields). The displayed value is clamped too, so a host that hands this panel an
 * out-of-range value cannot make the slider lie or emit a stray number on the next
 * drag.
 */

export interface TrackInspectorProps {
  /** Role id, e.g. "kick" — decides the default chain and the label. */
  role: MixTrackId;
  /** Display name of the track as the sequencer knows it. */
  trackName: string;
  /** Current instrument/preset name (the "timbre" control). */
  instrument: string;
  /** Every preset the track could use, for the timbre picker. */
  instrumentOptions: readonly string[];
  /** Opens the piano roll for this track (item ⑦). Optional: the console omits it. */
  onOpenPianoRoll?: () => void;
  /**
   * Previews this track's current timbre. The header's ▶ button is desktop-only now, so this
   * is the phone's only route to it — without this prop the phone would lose auditioning.
   * Optional: the console omits it.
   */
  onAudition?: () => void;
  /** Context sample rate for the curve views; the filters' shapes barely move with it. */
  sampleRate?: number;
  /** Reads the live gain reduction (dB, ≤ 0) for the compressor meter. */
  getGainReductionDb?: () => number;
  isPlaying?: boolean;
  onInstrumentChange: (instrument: string) => void;

  // --- mix ---
  volume: number;
  pan: number;
  sendA: number;
  sendB: number;
  muted: boolean;
  soloed: boolean;
  onVolumeChange: (v: number) => void;
  onPanChange: (v: number) => void;
  onSendAChange: (v: number) => void;
  onSendBChange: (v: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;

  // --- insert chain (E-10) ---
  insert: TrackInsertParams;
  onChangeInsert: (patch: Partial<TrackInsertParams>) => void;
  /** Restores the role's factory chain; the "Logic default patch" affordance. */
  onResetInsert: () => void;
  /** Removes the whole chain (all stages bypassed). */
  onBypassInsert: () => void;

  onClose: () => void;
}

/** Mix fader / send travel. Kept here so the clamp and the slider cannot disagree. */
export const MIX_MIN = 0;
export const MIX_MAX = 1;
/** Pan travel, matching `ChannelStrip`'s knob. */
export const PAN_MIN = -1;
export const PAN_MAX = 1;

/**
 * Clamp one control value into `[min, max]`.
 *
 * `NaN` (an empty or malformed input) falls back to `min` rather than propagating a
 * non-number; the infinities clamp to the matching end through `Math.min/max`.
 */
export function clampInspectorValue(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** `20 Hz` … `18.0 kHz` — the readout used by every frequency slider. */
function formatHz(hz: number): string {
  if (!Number.isFinite(hz)) return "—";
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
}

function formatGainDb(gainDb: number): string {
  const sign = gainDb > 0 ? "+" : "";
  return `${sign}${gainDb.toFixed(1)} dB`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatMs(seconds: number): string {
  const ms = seconds * 1000;
  return `${ms.toFixed(ms < 10 ? 2 : 1)} ms`;
}

interface SliderRowProps {
  /** Stable test hook (`data-testid` on the `<input>`). */
  testId: string;
  /** `data-inspector-param` value — the parameter this control writes. */
  param: string;
  /** Visible label text (short: the surrounding stage group supplies the context). */
  label: string;
  /** Full accessible name, scoped to the stage so it is unique on the panel. */
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  formatValue: (value: number) => string;
  onValueChange: (value: number) => void;
}

const SliderRow: React.FC<SliderRowProps> = ({
  testId,
  param,
  label,
  ariaLabel,
  value,
  min,
  max,
  step,
  formatValue,
  onValueChange,
}) => {
  const fieldId = useId();
  const clamped = clampInspectorValue(value, min, max);
  return (
    <div className="flex flex-col gap-1" data-inspector-param={param}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={fieldId}
          className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.08em] text-text-sub"
        >
          {label}
        </label>
        <span
          aria-hidden="true"
          className="font-['JetBrains_Mono'] text-[10px] tabular-nums text-accent"
        >
          {formatValue(clamped)}
        </span>
      </div>
      <input
        id={fieldId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamped}
        onChange={(e) => onValueChange(clampInspectorValue(Number(e.target.value), min, max))}
        aria-label={ariaLabel}
        data-testid={testId}
        className="h-1.5 w-full cursor-pointer accent-[#f5b73d]"
      />
    </div>
  );
};

interface StageToggleProps {
  testId: string;
  param: string;
  ariaLabel: string;
  pressed: boolean;
  onToggle: () => void;
}

/**
 * One stage's enable switch. A real `<button aria-pressed>` (the console's idiom for
 * Mute/Solo/Ø): the stage stays visible and its parameters stay reachable while it is
 * off, so a user can dial a chain in before switching it in.
 */
const StageToggle: React.FC<StageToggleProps> = ({
  testId,
  param,
  ariaLabel,
  pressed,
  onToggle,
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={pressed}
    aria-label={ariaLabel}
    title={ariaLabel}
    data-testid={testId}
    data-inspector-param={param}
    data-stage-enabled={pressed ? "true" : "false"}
    className={`h-7 shrink-0 rounded-md border px-2 font-['JetBrains_Mono'] text-[9px] font-bold tracking-[0.08em] transition-colors ${
      pressed
        ? "border-accent/70 bg-accent/20 text-accent"
        : "border-line bg-[#15171d] text-text-dim hover:text-text"
    }`}
  >
    {pressed ? "ON" : "OFF"}
  </button>
);

interface StageGroupProps {
  testId: string;
  title: string;
  enabled: boolean;
  toggle: React.ReactNode;
  children: React.ReactNode;
}

const StageGroup: React.FC<StageGroupProps> = ({ testId, title, enabled, toggle, children }) => (
  <div
    role="group"
    aria-label={title}
    data-testid={testId}
    data-stage-enabled={enabled ? "true" : "false"}
    className={`mt-2 rounded-lg border border-line-subtle bg-[#15171d]/60 p-2 ${
      enabled ? "" : "opacity-70"
    }`}
  >
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-[0.1em] text-text">
        {title}
      </h3>
      {toggle}
    </div>
    <div className="mt-2 flex flex-col gap-2">{children}</div>
  </div>
);

const SECTION_HEADING =
  "font-['JetBrains_Mono'] text-[11px] font-bold uppercase tracking-[0.14em] text-accent";

/**
 * Logic-style per-track inspector: **Timbre**, **Mix**, **Effects**.
 *
 * `role` selects nothing by itself — the host resolves the chain with
 * `resolveTrackInsertForGenre(role, genreId)` (the role default plus the genre's patch,
 * see `src/data/genreInsert.ts`) and passes it down — but it is surfaced as
 * `data-inspector-role` so the panel, the default chain and any future preset layer
 * can be reconciled by tests and by the host.
 */
export const TrackInspector: React.FC<TrackInspectorProps> = ({
  role,
  trackName,
  instrument,
  instrumentOptions,
  onInstrumentChange,
  volume,
  pan,
  sendA,
  sendB,
  muted,
  soloed,
  onVolumeChange,
  onPanChange,
  onSendAChange,
  onSendBChange,
  onMuteToggle,
  onSoloToggle,
  insert,
  onChangeInsert,
  onResetInsert,
  onBypassInsert,
  onClose,
  onOpenPianoRoll,
  onAudition,
  sampleRate = 48000,
  getGainReductionDb,
  isPlaying = false,
}) => {
  const { t } = useLanguage();
  /**
   * Item ③: the panel used to stack every control, which on a 400 px dock (or a phone sheet)
   * meant scrolling past the timbre picker to reach the EQ. Three tabs keep each group one screen
   * tall, and the two controls that must always be reachable — mute and solo — moved into the
   * header instead of living inside a tab.
   */
  const [activeTab, setActiveTab] = useState<"timbre" | "mix" | "effects">("timbre");
  /** Which insert stage the effects page is editing (item ①: one stage at a time, Logic-style). */
  const [effectStage, setEffectStage] = useState<InsertStageId>("eq");
  /** Which band the EQ curve emphasises: the last band the user touched. */
  const [eqFocusBand, setEqFocusBand] = useState<"hpf" | "low" | "mid" | "high">("mid");
  const uid = useId();
  const fieldId = useCallback((name: string) => `${uid}-${name}`, [uid]);

  const bypassed = isTrackInsertBypassed(insert);

  /**
   * Escape closes the panel.
   *
   * It floats above the studio now, so it has to be dismissible by keyboard like any other
   * overlay — a floating panel you can only close by hitting a 28 px button is a trap.
   * (The shared `Modal` does this for dialogs; this panel is not a Modal because it stays open
   * while the track is edited.)
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // The current preset must always be selectable, even if the host's option list is
  // momentarily stale — otherwise a controlled <select> would render blank.
  const options = useMemo(() => {
    // A current value that is not a preset name — a kick track's instrument is a kick preset, for
    // instance — is listed so the selection always has a home, and badged (`unlistedValue`) so it
    // is clear it is not a preset. It disappears once a real preset replaces it, which is correct;
    // what was *not* correct was the picker opening scoped to that value's family, which left only
    // two entries on a drum track ("the drum kits were two, and after choosing one only one was
    // left") and hid the other 114 timbres.
    const list = [...instrumentOptions];
    if (instrument && !list.includes(instrument)) list.unshift(instrument);
    return list;
  }, [instrument, instrumentOptions]);

  const patchBand = useCallback(
    (band: "low" | "mid" | "high", patch: Partial<TrackEqBand>) => {
      // Touching a band focuses it on the curve, so the drawing follows the edit.
      setEqFocusBand(band);
      onChangeInsert({ [band]: { ...insert[band], ...patch } } as Partial<TrackInsertParams>);
    },
    [insert, onChangeInsert]
  );

  const stageAria = useCallback(
    (stage: string) => t("track_inspector_stage_aria", { stage }),
    [t]
  );

  const panReadoutFor = useCallback((v: number) => {
    const info = panLabel(v);
    return info.side === "C" ? "C" : `${info.side}${info.amount}`;
  }, []);

  const hpfLabel = t("track_inspector_hpf");
  const lowLabel = t("track_inspector_low");
  const midLabel = t("track_inspector_mid");
  const highLabel = t("track_inspector_high");
  const compLabel = t("track_inspector_comp");
  const driveLabel = t("track_inspector_drive");

  return (
    <>
      {/**
       * Scrim, phones only. On a desktop the panel is docked to the left and must not dim the
       * studio — the whole point of an inspector is to watch the track while you change it.
       */}
      <div
        className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        onClick={onClose}
        aria-hidden="true"
        data-testid="track-inspector-scrim"
      />
      <aside
        data-testid="track-inspector"
        data-inspector-role={role}
        data-insert-bypassed={bypassed ? "true" : "false"}
        aria-label={`${trackName} ${t("track_inspector_title")}`}
        /**
         * Item ②: it used to render in normal flow *after* the sequencer, so on a phone it
         * appeared below everything and on a desktop it pushed the layout around. Now it floats
         * above the current layer on phones (bottom sheet, thumb-reachable, dismissible by
         * scrim/Escape/close) and docks to the left on desktop, where the studio stays visible.
         */
        /**
         * On a phone the inspector must clear the tab bar, not merely the safe area.
         *
         * The tab bar is `z-[70]` and fixed to the bottom; this sheet was `bottom-0 z-50`, so the
         * bar covered the bottom ~52 px of the inspector — and on a landscape phone, where the
         * sheet is only ~279 px tall, that is the whole EQ canvas. The measured symptom was an EQ
         * band handle inside the covered strip whose hit test resolved to `mobile-tab-learn`: the
         * drag never reached the handle, so the value never moved. Offsetting the sheet by the
         * bar's height (plus the inset the bar itself adds) fixes the geometry for every control
         * at the bottom of the sheet, not just the one the matrix happened to exercise.
         */
        className="fixed inset-x-0 bottom-[var(--mobile-tab-bar-h)] z-50 flex max-h-[82vh] flex-col gap-3 overflow-y-auto rounded-t-2xl border border-line bg-panel p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_32px_rgba(0,0,0,0.5)] lg:inset-y-0 lg:left-0 lg:right-auto lg:bottom-auto lg:h-full lg:max-h-none lg:w-[400px] lg:rounded-none lg:rounded-r-2xl lg:border-r lg:pb-3 lg:shadow-[8px_0_32px_rgba(0,0,0,0.45)]"
      >
      {/* Phone affordance: a grab handle says "this sheet is dismissible" without a label. */}
      <div className="mx-auto h-1 w-10 shrink-0 rounded-full bg-line lg:hidden" aria-hidden="true" />

      {/* ---------------------------------------------------------------- header */}
      <header className="flex items-start justify-between gap-2 border-b border-line pb-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.14em] text-text-dim">
            {t("track_inspector_title")}
          </span>
          <h2
            className="truncate font-['Space_Grotesk'] text-sm font-bold text-text"
            title={trackName}
          >
            {trackName}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Always visible: muting or soloing must not require finding the right tab. */}
          {onAudition && (
            <button
              type="button"
              onClick={onAudition}
              aria-label={`${trackName} ${t("track_audition_title")}`}
              title={t("track_audition_title")}
              data-testid="track-inspector-audition"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-[#15171d] text-text-sub transition-colors hover:text-accent"
            >
              <Play className="h-3 w-3 fill-current" />
            </button>
          )}
          <button
            type="button"
            onClick={onMuteToggle}
            aria-pressed={muted}
            aria-label={`${trackName} ${t("console_mute")}`}
            title={t("console_mute")}
            data-testid="track-inspector-mute"
            className={`h-7 w-7 rounded-lg border font-['JetBrains_Mono'] text-[10px] font-bold transition-colors ${
              muted
                ? "border-[#ff5964] bg-[#ff5964]/25 text-[#ff5964]"
                : "border-line bg-[#15171d] text-text-sub hover:text-text"
            }`}
          >
            M
          </button>
          <button
            type="button"
            onClick={onSoloToggle}
            aria-pressed={soloed}
            aria-label={`${trackName} ${t("console_solo")}`}
            title={t("console_solo")}
            data-testid="track-inspector-solo"
            className={`h-7 w-7 rounded-lg border font-['JetBrains_Mono'] text-[10px] font-bold transition-colors ${
              soloed
                ? "border-accent bg-accent/25 text-accent"
                : "border-line bg-[#15171d] text-text-sub hover:text-text"
            }`}
          >
            S
          </button>
          {onOpenPianoRoll && (
            <button
              type="button"
              onClick={onOpenPianoRoll}
              title={t("roll_toggle_title")}
              aria-label={t("roll_toggle")}
              data-testid="track-inspector-open-roll"
              className="flex h-7 items-center gap-1 rounded-lg border border-line bg-panel2 px-2 font-['JetBrains_Mono'] text-[10px] text-text-sub transition-colors hover:border-accent/50 hover:text-accent"
            >
              <Music2 className="h-3.5 w-3.5" />
              {t("roll_toggle")}
            </button>
          )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("track_inspector_close")}
          title={t("track_inspector_close")}
          data-testid="track-inspector-close"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line bg-panel2 text-text-sub transition-colors hover:border-accent/50 hover:text-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        </div>
      </header>

      {/* Item ③: tabs, so each group fits one screen. */}
      <div role="tablist" aria-label={t("track_inspector_title")} className="flex gap-1 border-b border-line pb-2">
        {(["timbre", "mix", "effects"] as const).map((tabId) => (
          <button
            key={tabId}
            role="tab"
            type="button"
            aria-selected={activeTab === tabId}
            data-testid={`track-inspector-tab-${tabId}`}
            onClick={() => setActiveTab(tabId)}
            className={`rounded-lg border px-2 py-1 font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-[0.08em] transition-colors ${
              activeTab === tabId
                ? "border-accent bg-accent/20 text-accent"
                : "border-line bg-panel2 text-text-sub hover:text-text"
            }`}
          >
            {t(
              tabId === "timbre"
                ? "track_inspector_section_timbre"
                : tabId === "mix"
                  ? "track_inspector_section_mix"
                  : "track_inspector_section_effects"
            )}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------- 1. Timbre / 音色 */}
      <section
        data-testid="track-inspector-section-timbre"
        aria-labelledby={fieldId("timbre-heading")}
        hidden={activeTab !== "timbre"}
      >
        <h3 id={fieldId("timbre-heading")} className={SECTION_HEADING}>
          {t("track_inspector_section_timbre")}
        </h3>
        <div className="mt-2">
          {/**
           * Item ②: a categorized, searchable picker instead of a 115-row flat select. GS-1-routed
           * names are badged so the two engines are distinguishable at a glance.
           */}
          <InstrumentPicker
            role={role === "chords" || role === "lead" ? role : null}
            value={instrument}
            options={options}
            unlistedValue={instrument && !instrumentOptions.includes(instrument) ? instrument : undefined}
            onChange={onInstrumentChange}
            label={t("track_inspector_instrument")}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------- 2. Mix / 混音 */}
      <section
        data-testid="track-inspector-section-mix"
        aria-labelledby={fieldId("mix-heading")}
        hidden={activeTab !== "mix"}
      >
        <h3 id={fieldId("mix-heading")} className={SECTION_HEADING}>
          {t("track_inspector_section_mix")}
        </h3>
        <div className="mt-2 flex flex-col gap-2">
          <SliderRow
            testId="track-inspector-volume"
            param="volume"
            label={t("track_inspector_volume")}
            ariaLabel={`${trackName} ${t("track_inspector_volume")}`}
            value={volume}
            min={MIX_MIN}
            max={MIX_MAX}
            step={0.01}
            formatValue={(v) => `${formatDb(v)} dB`}
            onValueChange={onVolumeChange}
          />
          <SliderRow
            testId="track-inspector-pan"
            param="pan"
            label={t("track_inspector_pan")}
            ariaLabel={`${trackName} ${t("track_inspector_pan")}`}
            value={pan}
            min={PAN_MIN}
            max={PAN_MAX}
            step={0.01}
            formatValue={panReadoutFor}
            onValueChange={onPanChange}
          />
          <SliderRow
            testId="track-inspector-send-a"
            param="sendA"
            label={t("console_send_a")}
            ariaLabel={t("console_send_a_aria", { name: trackName })}
            value={sendA}
            min={MIX_MIN}
            max={MIX_MAX}
            step={0.01}
            formatValue={formatPercent}
            onValueChange={onSendAChange}
          />
          <SliderRow
            testId="track-inspector-send-b"
            param="sendB"
            label={t("console_send_b")}
            ariaLabel={t("console_send_b_aria", { name: trackName })}
            value={sendB}
            min={MIX_MIN}
            max={MIX_MAX}
            step={0.01}
            formatValue={formatPercent}
            onValueChange={onSendBChange}
          />
        </div>
      </section>

      {/* ------------------------------------------------------ 3. Effects / 效果 */}
      <section
        data-testid="track-inspector-section-effects"
        hidden={activeTab !== "effects"}
        aria-labelledby={fieldId("effects-heading")}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 id={fieldId("effects-heading")} className={SECTION_HEADING}>
            {t("track_inspector_section_effects")}
          </h3>
          {bypassed && (
            <span
              data-testid="track-inspector-bypassed-badge"
              className="rounded-md border border-line bg-panel2 px-1.5 py-0.5 font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.1em] text-text-dim"
            >
              {t("track_inspector_bypassed")}
            </span>
          )}
        </div>

        {/* Item ①: the signal chain, one slot per processor, in DSP order. */}
        <InsertFlowStrip
          selected={effectStage}
          onSelect={setEffectStage}
          stages={[
            {
              id: "hpf",
              label: t("insert_stage_hpf"),
              enabled: insert.hpfEnabled,
              summary: formatHz(insert.hpfHz),
              onToggle: () => onChangeInsert({ hpfEnabled: !insert.hpfEnabled }),
            },
            {
              id: "eq",
              label: t("insert_stage_eq"),
              enabled: insert.low.enabled || insert.mid.enabled || insert.high.enabled,
              summary: `${formatGainDb(insert.low.gainDb)} · ${formatGainDb(insert.mid.gainDb)} · ${formatGainDb(insert.high.gainDb)}`,
              // One power dot for the EQ block: it switches the three bands together, while the
              // individual band switches stay available inside the stage.
              onToggle: () => {
                const next = !(insert.low.enabled || insert.mid.enabled || insert.high.enabled);
                onChangeInsert({
                  low: { ...insert.low, enabled: next },
                  mid: { ...insert.mid, enabled: next },
                  high: { ...insert.high, enabled: next },
                });
              },
            },
            {
              id: "comp",
              label: t("insert_stage_comp"),
              enabled: insert.compEnabled,
              summary: `${formatGainDb(insert.compThresholdDb)} · ${insert.compRatio.toFixed(1)}:1`,
              onToggle: () => onChangeInsert({ compEnabled: !insert.compEnabled }),
            },
            {
              id: "drive",
              label: t("insert_stage_drive"),
              enabled: insert.driveEnabled,
              summary: `${insert.driveAmount.toFixed(1)} · ${Math.round(insert.driveMix * 100)}%`,
              onToggle: () => onChangeInsert({ driveEnabled: !insert.driveEnabled }),
            },
          ]}
        />

        {/* High-pass — three bands, a compressor and drive follow, in signal order. */}
        <div hidden={effectStage !== "hpf"} data-testid="insert-stage-panel-hpf">
<StageGroup
          testId="track-inspector-stage-hpf"
          title={hpfLabel}
          enabled={insert.hpfEnabled}
          toggle={
            <StageToggle
              testId="track-inspector-hpf-enable"
              param="hpfEnabled"
              ariaLabel={stageAria(hpfLabel)}
              pressed={insert.hpfEnabled}
              onToggle={() => onChangeInsert({ hpfEnabled: !insert.hpfEnabled })}
            />
          }
        >
          <SliderRow
            testId="track-inspector-hpf-hz"
            param="hpfHz"
            label={t("track_inspector_frequency")}
            ariaLabel={`${hpfLabel} ${t("track_inspector_frequency")}`}
            value={insert.hpfHz}
            min={INSERT_HPF_MIN_HZ}
            max={INSERT_HPF_MAX_HZ}
            step={1}
            formatValue={formatHz}
            onValueChange={(v) => onChangeInsert({ hpfHz: v })}
          />
                <EqCurveView
            params={insert}
            sampleRate={sampleRate}
            highlight="hpf"
            testIdSuffix="-hpf"
            onBandChange={(band, patch) => {
            if (band === "hpf") onChangeInsert({ hpfHz: patch.hz });
            else if (band === "low") patchBand("low", { hz: patch.hz, ...(patch.gainDb !== undefined ? { gainDb: patch.gainDb } : {}) });
            else if (band === "mid") patchBand("mid", { hz: patch.hz, ...(patch.gainDb !== undefined ? { gainDb: patch.gainDb } : {}) });
            else patchBand("high", { hz: patch.hz, ...(patch.gainDb !== undefined ? { gainDb: patch.gainDb } : {}) });
          }}
          />
        </StageGroup>
</div>

        {/* Low shelf */}
        <div hidden={effectStage !== "eq"} data-testid="insert-eq-curve-block">
          <EqCurveView
            params={insert}
            sampleRate={sampleRate}
            highlight={eqFocusBand}
            onBandChange={(band, patch) => {
            if (band === "hpf") onChangeInsert({ hpfHz: patch.hz });
            else if (band === "low") patchBand("low", { hz: patch.hz, ...(patch.gainDb !== undefined ? { gainDb: patch.gainDb } : {}) });
            else if (band === "mid") patchBand("mid", { hz: patch.hz, ...(patch.gainDb !== undefined ? { gainDb: patch.gainDb } : {}) });
            else patchBand("high", { hz: patch.hz, ...(patch.gainDb !== undefined ? { gainDb: patch.gainDb } : {}) });
          }}
          />
        </div>
        <div hidden={effectStage !== "eq"} data-testid="insert-stage-panel-low">
<StageGroup
          testId="track-inspector-stage-low"
          title={lowLabel}
          enabled={insert.low.enabled}
          toggle={
            <StageToggle
              testId="track-inspector-low-enable"
              param="low.enabled"
              ariaLabel={stageAria(lowLabel)}
              pressed={insert.low.enabled}
              onToggle={() => patchBand("low", { enabled: !insert.low.enabled })}
            />
          }
        >
          <SliderRow
            testId="track-inspector-low-hz"
            param="low.hz"
            label={t("track_inspector_frequency")}
            ariaLabel={`${lowLabel} ${t("track_inspector_frequency")}`}
            value={insert.low.hz}
            min={INSERT_EQ_MIN_HZ}
            max={INSERT_EQ_MAX_HZ}
            step={1}
            formatValue={formatHz}
            onValueChange={(v) => patchBand("low", { hz: v })}
          />
          <SliderRow
            testId="track-inspector-low-gain"
            param="low.gainDb"
            label={t("track_inspector_gain")}
            ariaLabel={`${lowLabel} ${t("track_inspector_gain")}`}
            value={insert.low.gainDb}
            min={INSERT_EQ_MIN_GAIN_DB}
            max={INSERT_EQ_MAX_GAIN_DB}
            step={0.1}
            formatValue={formatGainDb}
            onValueChange={(v) => patchBand("low", { gainDb: v })}
          />
                </StageGroup>
</div>

        {/* Mid peaking band — the only band with Q. */}
        <div hidden={effectStage !== "eq"} data-testid="insert-stage-panel-mid">
<StageGroup
          testId="track-inspector-stage-mid"
          title={midLabel}
          enabled={insert.mid.enabled}
          toggle={
            <StageToggle
              testId="track-inspector-mid-enable"
              param="mid.enabled"
              ariaLabel={stageAria(midLabel)}
              pressed={insert.mid.enabled}
              onToggle={() => patchBand("mid", { enabled: !insert.mid.enabled })}
            />
          }
        >
          <SliderRow
            testId="track-inspector-mid-hz"
            param="mid.hz"
            label={t("track_inspector_frequency")}
            ariaLabel={`${midLabel} ${t("track_inspector_frequency")}`}
            value={insert.mid.hz}
            min={INSERT_EQ_MIN_HZ}
            max={INSERT_EQ_MAX_HZ}
            step={1}
            formatValue={formatHz}
            onValueChange={(v) => patchBand("mid", { hz: v })}
          />
          <SliderRow
            testId="track-inspector-mid-gain"
            param="mid.gainDb"
            label={t("track_inspector_gain")}
            ariaLabel={`${midLabel} ${t("track_inspector_gain")}`}
            value={insert.mid.gainDb}
            min={INSERT_EQ_MIN_GAIN_DB}
            max={INSERT_EQ_MAX_GAIN_DB}
            step={0.1}
            formatValue={formatGainDb}
            onValueChange={(v) => patchBand("mid", { gainDb: v })}
          />
          <SliderRow
            testId="track-inspector-mid-q"
            param="mid.q"
            label={t("track_inspector_q")}
            ariaLabel={`${midLabel} ${t("track_inspector_q")}`}
            value={insert.mid.q}
            min={INSERT_EQ_MIN_Q}
            max={INSERT_EQ_MAX_Q}
            step={0.1}
            formatValue={(v) => v.toFixed(2)}
            onValueChange={(v) => patchBand("mid", { q: v })}
          />
                </StageGroup>
</div>

        {/* High shelf */}
        <div hidden={effectStage !== "eq"} data-testid="insert-stage-panel-high">
<StageGroup
          testId="track-inspector-stage-high"
          title={highLabel}
          enabled={insert.high.enabled}
          toggle={
            <StageToggle
              testId="track-inspector-high-enable"
              param="high.enabled"
              ariaLabel={stageAria(highLabel)}
              pressed={insert.high.enabled}
              onToggle={() => patchBand("high", { enabled: !insert.high.enabled })}
            />
          }
        >
          <SliderRow
            testId="track-inspector-high-hz"
            param="high.hz"
            label={t("track_inspector_frequency")}
            ariaLabel={`${highLabel} ${t("track_inspector_frequency")}`}
            value={insert.high.hz}
            min={INSERT_EQ_MIN_HZ}
            max={INSERT_EQ_MAX_HZ}
            step={1}
            formatValue={formatHz}
            onValueChange={(v) => patchBand("high", { hz: v })}
          />
          <SliderRow
            testId="track-inspector-high-gain"
            param="high.gainDb"
            label={t("track_inspector_gain")}
            ariaLabel={`${highLabel} ${t("track_inspector_gain")}`}
            value={insert.high.gainDb}
            min={INSERT_EQ_MIN_GAIN_DB}
            max={INSERT_EQ_MAX_GAIN_DB}
            step={0.1}
            formatValue={formatGainDb}
            onValueChange={(v) => patchBand("high", { gainDb: v })}
          />
                </StageGroup>
</div>

        {/* Compressor */}
        <div hidden={effectStage !== "comp"} data-testid="insert-stage-panel-comp">
<StageGroup
          testId="track-inspector-stage-comp"
          title={compLabel}
          enabled={insert.compEnabled}
          toggle={
            <StageToggle
              testId="track-inspector-comp-enable"
              param="compEnabled"
              ariaLabel={stageAria(compLabel)}
              pressed={insert.compEnabled}
              onToggle={() => onChangeInsert({ compEnabled: !insert.compEnabled })}
            />
          }
        >
          <SliderRow
            testId="track-inspector-comp-threshold"
            param="compThresholdDb"
            label={t("track_inspector_threshold")}
            ariaLabel={`${compLabel} ${t("track_inspector_threshold")}`}
            value={insert.compThresholdDb}
            min={INSERT_COMP_MIN_THRESHOLD_DB}
            max={INSERT_COMP_MAX_THRESHOLD_DB}
            step={0.5}
            formatValue={(v) => `${v.toFixed(1)} dB`}
            onValueChange={(v) => onChangeInsert({ compThresholdDb: v })}
          />
          <SliderRow
            testId="track-inspector-comp-ratio"
            param="compRatio"
            label={t("track_inspector_ratio")}
            ariaLabel={`${compLabel} ${t("track_inspector_ratio")}`}
            value={insert.compRatio}
            min={INSERT_COMP_MIN_RATIO}
            max={INSERT_COMP_MAX_RATIO}
            step={0.1}
            formatValue={(v) => `${v.toFixed(1)}:1`}
            onValueChange={(v) => onChangeInsert({ compRatio: v })}
          />
          <SliderRow
            testId="track-inspector-comp-attack"
            param="compAttackSec"
            label={t("track_inspector_attack")}
            ariaLabel={`${compLabel} ${t("track_inspector_attack")}`}
            value={insert.compAttackSec}
            min={INSERT_COMP_MIN_ATTACK_SEC}
            max={INSERT_COMP_MAX_ATTACK_SEC}
            step={0.0005}
            formatValue={formatMs}
            onValueChange={(v) => onChangeInsert({ compAttackSec: v })}
          />
          <SliderRow
            testId="track-inspector-comp-release"
            param="compReleaseSec"
            label={t("track_inspector_release")}
            ariaLabel={`${compLabel} ${t("track_inspector_release")}`}
            value={insert.compReleaseSec}
            min={INSERT_COMP_MIN_RELEASE_SEC}
            max={INSERT_COMP_MAX_RELEASE_SEC}
            step={0.01}
            formatValue={formatMs}
            onValueChange={(v) => onChangeInsert({ compReleaseSec: v })}
          />
          <SliderRow
            testId="track-inspector-comp-makeup"
            param="compMakeupDb"
            label={t("track_inspector_makeup")}
            ariaLabel={`${compLabel} ${t("track_inspector_makeup")}`}
            value={insert.compMakeupDb}
            min={INSERT_COMP_MIN_MAKEUP_DB}
            max={INSERT_COMP_MAX_MAKEUP_DB}
            step={0.1}
            formatValue={formatGainDb}
            onValueChange={(v) => onChangeInsert({ compMakeupDb: v })}
          />
        <CompressorCurveView params={insert} getGainReductionDb={getGainReductionDb} isPlaying={isPlaying} />
        </StageGroup>
</div>

        {/* Drive */}
        <div hidden={effectStage !== "drive"} data-testid="insert-stage-panel-drive">
<StageGroup
          testId="track-inspector-stage-drive"
          title={driveLabel}
          enabled={insert.driveEnabled}
          toggle={
            <StageToggle
              testId="track-inspector-drive-enable"
              param="driveEnabled"
              ariaLabel={stageAria(driveLabel)}
              pressed={insert.driveEnabled}
              onToggle={() => onChangeInsert({ driveEnabled: !insert.driveEnabled })}
            />
          }
        >
          <SliderRow
            testId="track-inspector-drive-amount"
            param="driveAmount"
            label={t("track_inspector_drive_amount")}
            ariaLabel={`${driveLabel} ${t("track_inspector_drive_amount")}`}
            value={insert.driveAmount}
            min={INSERT_DRIVE_MIN}
            max={INSERT_DRIVE_MAX}
            step={0.1}
            formatValue={(v) => `${v.toFixed(2)}×`}
            onValueChange={(v) => onChangeInsert({ driveAmount: v })}
          />
          <SliderRow
            testId="track-inspector-drive-mix"
            param="driveMix"
            label={t("track_inspector_drive_mix")}
            ariaLabel={`${driveLabel} ${t("track_inspector_drive_mix")}`}
            value={insert.driveMix}
            min={MIX_MIN}
            max={INSERT_DRIVE_MIX_MAX}
            step={0.01}
            formatValue={formatPercent}
            onValueChange={(v) => onChangeInsert({ driveMix: v })}
          />
        <DriveCurveView params={insert} />
        </StageGroup>
</div>

        {/* The two "get me back" affordances: without them a broken chain is a dead end. */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line-subtle pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onResetInsert}
            title={t("track_inspector_reset_hint")}
            data-testid="track-inspector-reset"
          >
            {t("track_inspector_reset")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onBypassInsert}
            title={t("track_inspector_bypass_hint")}
            data-testid="track-inspector-bypass"
          >
            {t("track_inspector_bypass")}
          </Button>
        </div>
      </section>
      </aside>
    </>
  );
};
