import React, { useCallback, useId, useMemo } from "react";
import { X } from "lucide-react";
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
}) => {
  const { t } = useLanguage();
  const uid = useId();
  const fieldId = useCallback((name: string) => `${uid}-${name}`, [uid]);

  const bypassed = isTrackInsertBypassed(insert);

  // The current preset must always be selectable, even if the host's option list is
  // momentarily stale — otherwise a controlled <select> would render blank.
  const options = useMemo(() => {
    const list = [...instrumentOptions];
    if (instrument && !list.includes(instrument)) list.unshift(instrument);
    return list;
  }, [instrument, instrumentOptions]);

  const patchBand = useCallback(
    (band: "low" | "mid" | "high", patch: Partial<TrackEqBand>) =>
      onChangeInsert({ [band]: { ...insert[band], ...patch } } as Partial<TrackInsertParams>),
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
    <aside
      data-testid="track-inspector"
      data-inspector-role={role}
      data-insert-bypassed={bypassed ? "true" : "false"}
      aria-label={`${trackName} ${t("track_inspector_title")}`}
      className="flex w-full max-w-[440px] flex-col gap-3 rounded-xl border border-line bg-panel p-3 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
    >
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
      </header>

      {/* ------------------------------------------------------- 1. Timbre / 音色 */}
      <section
        data-testid="track-inspector-section-timbre"
        aria-labelledby={fieldId("timbre-heading")}
      >
        <h3 id={fieldId("timbre-heading")} className={SECTION_HEADING}>
          {t("track_inspector_section_timbre")}
        </h3>
        <div className="mt-2 flex flex-col gap-1">
          <label
            htmlFor={fieldId("instrument")}
            className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-[0.08em] text-text-sub"
          >
            {t("track_inspector_instrument")}
          </label>
          <select
            id={fieldId("instrument")}
            value={instrument}
            onChange={(e) => onInstrumentChange(e.target.value)}
            aria-label={`${trackName} ${t("track_inspector_instrument")}`}
            data-testid="track-inspector-instrument"
            className="w-full rounded-lg border border-line bg-panel2 px-2 py-1.5 font-['JetBrains_Mono'] text-[11px] text-text outline-none transition-colors focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* ---------------------------------------------------------- 2. Mix / 混音 */}
      <section data-testid="track-inspector-section-mix" aria-labelledby={fieldId("mix-heading")}>
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
          <div className="flex items-center gap-2 border-t border-line-subtle pt-2">
            <button
              type="button"
              onClick={onMuteToggle}
              aria-pressed={muted}
              aria-label={`${trackName} ${t("console_mute")}`}
              title={t("console_mute")}
              data-testid="track-inspector-mute"
              className={`h-9 w-9 shrink-0 rounded-lg border font-['JetBrains_Mono'] text-xs font-bold transition-colors ${
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
              className={`h-9 w-9 shrink-0 rounded-lg border font-['JetBrains_Mono'] text-xs font-bold transition-colors ${
                soloed
                  ? "border-accent bg-accent/25 text-accent"
                  : "border-line bg-[#15171d] text-text-sub hover:text-text"
              }`}
            >
              S
            </button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ 3. Effects / 效果 */}
      <section
        data-testid="track-inspector-section-effects"
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

        {/* High-pass — three bands, a compressor and drive follow, in signal order. */}
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
        </StageGroup>

        {/* Low shelf */}
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

        {/* Mid peaking band — the only band with Q. */}
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

        {/* High shelf */}
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

        {/* Compressor */}
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
        </StageGroup>

        {/* Drive */}
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
        </StageGroup>

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
  );
};
