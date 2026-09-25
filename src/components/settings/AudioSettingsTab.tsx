import React, { useCallback, useEffect, useState } from "react";

import { useSyncExternalStore } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { isDebugModeEnabled, setDebugModeEnabled, subscribeDebugMode } from "../../platform/debugMode";
import { Bug, Gauge, ShieldCheck, Timer, Waves } from "lucide-react";
import type { AudioEngine } from "../../audio/AudioEngine";

/**
 * Audio tab of the settings panel.
 *
 * Three of these settings (`latencyCompensationMs`, `hearingProtection`, `maxVolumeLimit`)
 * have existed in the engine — persisted in `groove_audio_settings_v1` — since before the
 * audio-quality work, but had no UI at all, so the only way to reach them was the console.
 * The GS-1 switch (P6) had a quick toggle in the toolbar drawer; the user asked for it to
 * live "in the audio settings", so this panel is the authoritative place for all four and
 * the drawer keeps a shortcut.
 *
 * Every control writes through the engine setter and then re-reads the engine value, so the
 * UI shows the *clamped* result (the engine clamps the limit to 0.1–1.0 and the compensation
 * to ±100 ms) instead of the raw number the user dragged to.
 */
export interface AudioSettingsTabProps {
  engine: AudioEngine | null;
  /** Mirrors the engine's GS-1 routing switch; owned by the view so the toolbar stays in sync. */
  gs1Enabled: boolean;
  onToggleGs1: () => void;
}

const pct = (value: number) => Math.round(value * 100);

export const AudioSettingsTab: React.FC<AudioSettingsTabProps> = ({
  engine,
  gs1Enabled,
  onToggleGs1,
}) => {
  const { t } = useLanguage();
  /**
   * The debug switch reads its own store rather than being threaded through two hosts: it is one persisted boolean,
   * and passing it down would put the same prop on every settings caller for no gain.
   */
  const debugEnabled = useSyncExternalStore(subscribeDebugMode, isDebugModeEnabled, () => false);
  const onToggleDebug = () => setDebugModeEnabled(!debugEnabled);

  const [masterVolume, setMasterVolume] = useState(0.8);
  const [effectiveVolume, setEffectiveVolume] = useState(0.8);
  const [hearingProtection, setHearingProtection] = useState(true);
  const [maxVolumeLimit, setMaxVolumeLimit] = useState(0.85);
  const [latencyCompensation, setLatencyCompensation] = useState(0);
  const [outputLatency, setOutputLatency] = useState(0);
  const [limiterKind, setLimiterKind] = useState("fallback");
  const [limiterLookaheadMs, setLimiterLookaheadMs] = useState(0);

  const readEngine = useCallback(() => {
    if (!engine) return;
    setMasterVolume(engine.getMasterVolume());
    setEffectiveVolume(engine.getEffectiveMasterVolume());
    setHearingProtection(engine.isHearingProtectionEnabled());
    setMaxVolumeLimit(engine.getMaxVolumeLimit());
    setLatencyCompensation(engine.getLatencyCompensation());
    setOutputLatency(engine.getOutputLatency());
    setLimiterKind(engine.getMasterLimiterKind());
    setLimiterLookaheadMs(Math.round(engine.getMasterLimiterLatencySeconds() * 1000));
  }, [engine]);

  // Re-sync on mount: the toolbar or the mixing console can change the same values while the
  // panel is closed, so the tab always opens on the engine's real state rather than a stale copy.
  useEffect(() => {
    readEngine();
  }, [readEngine]);

  const applyMasterVolume = (value: number) => {
    engine?.setMasterVolume(value);
    readEngine();
  };

  const applyHearingProtection = (enabled: boolean) => {
    engine?.setHearingProtection(enabled);
    readEngine();
  };

  const applyMaxVolumeLimit = (value: number) => {
    engine?.setMaxVolumeLimit(value);
    readEngine();
  };

  const applyLatencyCompensation = (ms: number) => {
    engine?.setLatencyCompensation(ms);
    readEngine();
  };

  const sectionClass = "space-y-3 rounded-2xl bg-panel2 border border-line-subtle p-4";
  const sectionTitleClass =
    "flex items-center gap-2 text-accent text-xs font-bold uppercase tracking-wider";
  const rowLabelClass = "text-xs font-semibold text-text";
  const hintClass = "text-[11px] text-text-sub leading-relaxed";
  const toggleClass = (on: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
      on
        ? "bg-accent/20 border-accent text-accent"
        : "bg-[#1d2028] border-line text-text-sub hover:text-text"
    }`;

  return (
    <div className="space-y-5" data-testid="settings-panel-audio">
      <div className="space-y-5">
        {/* GS-1 voices (P6) */}
        <div className={sectionClass}>
          <div className={sectionTitleClass}>
            <Waves className="w-4 h-4" />
            <span>{t("audio_settings_section_voices")}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className={rowLabelClass}>{t("audio_settings_gs1_label")}</div>
              <div className={hintClass}>{t("audio_settings_gs1_hint")}</div>
            </div>
            <button
              type="button"
              onClick={onToggleGs1}
              aria-pressed={gs1Enabled}
              data-testid="audio-settings-gs1-toggle"
              className={toggleClass(gs1Enabled)}
            >
              {gs1Enabled ? t("audio_settings_on") : t("audio_settings_off")}
            </button>
          </div>
        </div>

        {/* Debug panel */}
        <div className={sectionClass}>
          <div className={sectionTitleClass}>
            <Bug className="w-4 h-4" />
            <span>{t("audio_settings_section_debug")}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className={rowLabelClass}>{t("audio_settings_debug_label")}</div>
              <div className={hintClass}>{t("audio_settings_debug_hint")}</div>
            </div>
            <button
              type="button"
              onClick={onToggleDebug}
              aria-pressed={debugEnabled}
              data-testid="audio-settings-debug-toggle"
              className={toggleClass(debugEnabled)}
            >
              {debugEnabled ? t("audio_settings_on") : t("audio_settings_off")}
            </button>
          </div>
        </div>

        {/* Hearing protection + master level */}
        <div className={sectionClass}>
          <div className={sectionTitleClass}>
            <ShieldCheck className="w-4 h-4" />
            <span>{t("audio_settings_section_protection")}</span>
          </div>

          <label className="block space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={rowLabelClass}>{t("audio_settings_master_volume")}</span>
              <span className="text-xs font-mono text-text-sub" data-testid="audio-settings-master-value">
                {pct(masterVolume)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={pct(masterVolume)}
              onChange={(e) => applyMasterVolume(Number(e.target.value) / 100)}
              aria-label={t("audio_settings_master_volume")}
              data-testid="audio-settings-master-slider"
              className="w-full accent-[var(--color-accent,#f59e0b)]"
            />
          </label>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className={rowLabelClass}>{t("audio_settings_hearing_protection")}</div>
              <div className={hintClass}>{t("audio_settings_hearing_protection_hint")}</div>
            </div>
            <button
              type="button"
              onClick={() => applyHearingProtection(!hearingProtection)}
              aria-pressed={hearingProtection}
              data-testid="audio-settings-hearing-toggle"
              className={toggleClass(hearingProtection)}
            >
              {hearingProtection ? t("audio_settings_on") : t("audio_settings_off")}
            </button>
          </div>

          <label className="block space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={rowLabelClass}>{t("audio_settings_max_volume_limit")}</span>
              <span className="text-xs font-mono text-text-sub" data-testid="audio-settings-limit-value">
                {pct(maxVolumeLimit)}%
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={1}
              value={pct(maxVolumeLimit)}
              disabled={!hearingProtection}
              onChange={(e) => applyMaxVolumeLimit(Number(e.target.value) / 100)}
              aria-label={t("audio_settings_max_volume_limit")}
              data-testid="audio-settings-limit-slider"
              className="w-full accent-[var(--color-accent,#f59e0b)] disabled:opacity-40"
            />
            <div className={hintClass}>{t("audio_settings_max_volume_limit_hint")}</div>
          </label>

          {hearingProtection && effectiveVolume < masterVolume && (
            <div
              className="text-[11px] text-amber-400"
              data-testid="audio-settings-effective-note"
            >
              {t("audio_settings_effective_volume", { value: pct(effectiveVolume) })}
            </div>
          )}
        </div>

        {/* Timing / latency */}
        <div className={sectionClass}>
          <div className={sectionTitleClass}>
            <Timer className="w-4 h-4" />
            <span>{t("audio_settings_section_timing")}</span>
          </div>

          <label className="block space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={rowLabelClass}>{t("audio_settings_latency_compensation")}</span>
              <span className="text-xs font-mono text-text-sub" data-testid="audio-settings-latency-value">
                {latencyCompensation > 0 ? `+${latencyCompensation}` : latencyCompensation} ms
              </span>
            </div>
            <input
              type="range"
              min={-100}
              max={100}
              step={5}
              value={latencyCompensation}
              onChange={(e) => applyLatencyCompensation(Number(e.target.value))}
              aria-label={t("audio_settings_latency_compensation")}
              data-testid="audio-settings-latency-slider"
              className="w-full accent-[var(--color-accent,#f59e0b)]"
            />
            <div className={hintClass}>{t("audio_settings_latency_compensation_hint")}</div>
          </label>
        </div>

        {/* Read-only diagnostics: what the master bus is actually doing right now. */}
        <div className={sectionClass} data-testid="audio-settings-diagnostics">
          <div className={sectionTitleClass}>
            <Gauge className="w-4 h-4" />
            <span>{t("audio_settings_section_diagnostics")}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-sub">{t("audio_settings_output_latency")}</span>
            <span className="font-mono text-text" data-testid="audio-settings-output-latency">
              {outputLatency} ms
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-sub">{t("audio_settings_limiter")}</span>
            <span className="font-mono text-text" data-testid="audio-settings-limiter">
              {limiterKind === "worklet"
                ? t("audio_settings_limiter_worklet", { value: limiterLookaheadMs })
                : t("audio_settings_limiter_fallback")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
