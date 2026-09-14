import React from "react";
import { formatDb, dbToMeterPosition, panLabel } from "./meterMath";
import { ConsoleMeter } from "./ConsoleMeter";

export interface ChannelStripProps {
  trackIdx: number;
  name: string;
  color: string;
  volume: number;
  pan: number;
  sendA: number;
  sendB: number;
  isMute: boolean;
  isSolo: boolean;
  isSilenced: boolean;
  t: (key: any, vars?: Record<string, string | number>) => string;
  meterLeftRef: React.MutableRefObject<HTMLDivElement | null>;
  meterRightRef: React.MutableRefObject<HTMLDivElement | null>;
  onVolumeChange: (trackIdx: number, volume: number) => void;
  onPanChange: (trackIdx: number, pan: number) => void;
  onSendAChange: (trackIdx: number, send: number) => void;
  onSendBChange: (trackIdx: number, send: number) => void;
  onToggleMute: (trackIdx: number) => void;
  onToggleSolo: (trackIdx: number) => void;
  isPhaseInverted: boolean;
  onTogglePhase: (trackIdx: number) => void;
}

const FADER_TICKS_DB = [0, -6, -12, -24, -48];

interface PanKnobProps {
  value: number;
  ariaLabel: string;
  testId: string;
  onChange: (value: number) => void;
}

const PanKnob: React.FC<PanKnobProps> = ({ value, ariaLabel, testId, onChange }) => (
  <div className="relative w-10 h-10 shrink-0">
    <input
      type="range"
      min={-1}
      max={1}
      step={0.01}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={ariaLabel}
      data-testid={testId}
      className="peer absolute inset-0 w-full h-full opacity-0 cursor-pointer"
    />
    <div className="pointer-events-none absolute inset-0 rounded-full bg-[#15171d] border border-line-strong shadow-[inset_0_2px_4px_rgba(0,0,0,0.7)] peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60">
      <div
        className="absolute inset-0"
        style={{ transform: `rotate(${value * 135}deg)` }}
        aria-hidden="true"
      >
        <span
          className="absolute left-1/2 top-1 w-[2px] h-3 -translate-x-1/2 rounded-full"
          style={{ backgroundColor: "#f5b73d" }}
        />
      </div>
      <span className="absolute left-1/2 top-1/2 w-1 h-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong" />
    </div>
  </div>
);

interface SendSliderProps {
  label: string;
  value: number;
  ariaLabel: string;
  testId: string;
  onChange: (value: number) => void;
}

const SendSlider: React.FC<SendSliderProps> = ({ label, value, ariaLabel, testId, onChange }) => (
  <div className="flex items-center gap-1.5">
    <span className="w-8 shrink-0 font-['JetBrains_Mono'] text-[8px] text-text-dim">{label}</span>
    <input
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={ariaLabel}
      data-testid={testId}
      className="h-1.5 w-full accent-[#f5b73d] cursor-pointer"
    />
    <span className="w-6 shrink-0 text-right font-['JetBrains_Mono'] text-[8px] text-text-sub">
      {Math.round(value * 100)}
    </span>
  </div>
);

/**
 * One console channel: fader + digital dB scale, stereo peak meter, pan knob,
 * Send A/B, Mute / Solo / phase-invert. Every control is a real `<input
 * type="range">` or `<button>` and every value is read back from the sequencer
 * store, so the desk can never disagree with the sequencer.
 */
export const ChannelStrip: React.FC<ChannelStripProps> = ({
  trackIdx,
  name,
  color,
  volume,
  pan,
  sendA,
  sendB,
  isMute,
  isSolo,
  isSilenced,
  t,
  meterLeftRef,
  meterRightRef,
  onVolumeChange,
  onPanChange,
  onSendAChange,
  onSendBChange,
  onToggleMute,
  onToggleSolo,
  isPhaseInverted,
  onTogglePhase,
}) => {
  const panInfo = panLabel(pan);

  return (
    <div
      data-console-channel={trackIdx}
      data-testid={`console-channel-${trackIdx}`}
      className={`flex w-[166px] shrink-0 flex-col items-center gap-2 rounded-xl border border-line bg-panel px-2 py-3 transition-opacity ${
        isSilenced ? "opacity-60" : "opacity-100"
      }`}
      style={{ ["--tc" as any]: color }}
    >
      {/* Name plate */}
      <div className="flex w-full flex-col items-center gap-1">
        <span
          className="h-1 w-8 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
          aria-hidden="true"
        />
        <span
          className="w-full truncate text-center font-['JetBrains_Mono'] text-[10px] font-bold tracking-[0.05em] text-text"
          title={name}
        >
          {name}
        </span>
      </div>

      {/* Meter + 100mm fader + digital scale */}
      <div className="flex items-stretch gap-1.5">
        <ConsoleMeter leftRef={meterLeftRef} rightRef={meterRightRef} heightPx={378} testId={`console-meter-${trackIdx}`} />

        <div className="flex flex-col items-center gap-1">
          <span className="font-['JetBrains_Mono'] text-[9px] tabular-nums text-accent">
            {formatDb(volume)}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolumeChange(trackIdx, Number(e.target.value))}
            aria-label={t("console_volume_aria", { name })}
            data-testid={`console-fader-${trackIdx}`}
            className="h-[100mm] w-6 cursor-pointer accent-[#f5b73d]"
            style={{ writingMode: "vertical-lr", direction: "rtl" }}
          />
        </div>

        <div className="relative w-7 select-none" style={{ height: "100mm" }} aria-hidden="true">
          {FADER_TICKS_DB.map((db) => (
            <div
              key={db}
              className="absolute right-0 flex items-center gap-0.5"
              style={{ bottom: `${dbToMeterPosition(db) * 100}%`, transform: "translateY(50%)" }}
            >
              <span className="font-['JetBrains_Mono'] text-[7px] leading-none text-text-dim">{db}</span>
              <span className="w-1 border-t border-line-strong" />
            </div>
          ))}
        </div>
      </div>

      {/* Pan */}
      <div className="flex flex-col items-center gap-0.5">
        <PanKnob
          value={pan}
          ariaLabel={t("console_pan_aria", { name })}
          testId={`console-pan-${trackIdx}`}
          onChange={(value) => onPanChange(trackIdx, value)}
        />
        <span className="font-['JetBrains_Mono'] text-[8px] tabular-nums text-text-sub">
          {panInfo.side}
          {panInfo.side === "C" ? "" : panInfo.amount}
        </span>
      </div>

      {/* Sends */}
      <div className="flex w-full flex-col gap-1 border-t border-line-subtle pt-1.5">
        <SendSlider
          label={t("console_send_a")}
          value={sendA}
          ariaLabel={t("console_send_a_aria", { name })}
          testId={`console-send-a-${trackIdx}`}
          onChange={(value) => onSendAChange(trackIdx, value)}
        />
        <SendSlider
          label={t("console_send_b")}
          value={sendB}
          ariaLabel={t("console_send_b_aria", { name })}
          testId={`console-send-b-${trackIdx}`}
          onChange={(value) => onSendBChange(trackIdx, value)}
        />
      </div>

      {/* Mute / Solo / Phase invert */}
      <div className="flex w-full items-center justify-center gap-1.5 border-t border-line-subtle pt-2">
        <button
          type="button"
          onClick={() => onToggleMute(trackIdx)}
          aria-pressed={isMute}
          aria-label={`${name} ${t("console_mute")}`}
          title={t("console_mute")}
          data-testid={`console-mute-${trackIdx}`}
          className={`h-11 w-11 shrink-0 rounded-lg border font-['JetBrains_Mono'] text-xs font-bold transition-colors ${
            isMute
              ? "border-[#ff5964] bg-[#ff5964]/25 text-[#ff5964]"
              : "border-line bg-[#15171d] text-text-sub hover:text-text"
          }`}
        >
          M
        </button>
        <button
          type="button"
          onClick={() => onToggleSolo(trackIdx)}
          aria-pressed={isSolo}
          aria-label={`${name} ${t("console_solo")}`}
          title={t("console_solo")}
          data-testid={`console-solo-${trackIdx}`}
          className={`h-11 w-11 shrink-0 rounded-lg border font-['JetBrains_Mono'] text-xs font-bold transition-colors ${
            isSolo
              ? "border-accent bg-accent/25 text-accent"
              : "border-line bg-[#15171d] text-text-sub hover:text-text"
          }`}
        >
          S
        </button>
        {/* Polarity inversion (Ø): flips the channel sign via a dedicated gain stage. */}
        <button
          type="button"
          onClick={() => onTogglePhase(trackIdx)}
          aria-pressed={isPhaseInverted}
          aria-label={`${name} ${t("console_phase")}`}
          title={t("console_phase_hint")}
          data-testid={`console-phase-${trackIdx}`}
          className={`h-11 w-11 shrink-0 rounded-lg border font-['JetBrains_Mono'] text-xs font-bold transition-colors ${
            isPhaseInverted
              ? "border-amber-400/70 bg-amber-500/20 text-amber-300"
              : "border-line bg-[#15171d] text-text-sub hover:text-text"
          }`}
        >
          Ø
        </button>
      </div>
    </div>
  );
};
