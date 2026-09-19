import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "../../ui/Modal";
import { useLanguage, type Language } from "../../i18n/LanguageContext";
import {
  Gauge,
  Info,
  LayoutDashboard,
  SlidersHorizontal,
  Smartphone,
  Waves,
} from "lucide-react";
import type { AudioEngine } from "../../audio/AudioEngine";
import { AudioSettingsTab } from "./AudioSettingsTab";
import {
  DENSITY_TIERS,
  loadLayoutPrefs,
  saveLayoutPrefs,
  defaultLayoutPrefs,
  type DensityTier,
  type LayoutPrefs,
} from "../../features/sequencer/layoutPrefs";
import {
  loadKeyboardFabPref,
  saveKeyboardFabPref,
} from "../../features/sequencer/keyboardFabPref";
import {
  getHapticSettings,
  setHapticEnabled,
  setHapticIntensity,
  triggerHaptic,
  HapticPatterns,
} from "../../utils/haptics";
import { APP_VERSION, BUILD_DATE } from "../../version";

/**
 * Global settings panel (item ⑤).
 *
 * The user's report was blunt and correct: "there is no visible global switch for the new
 * architecture's voices". The GS-1 switch existed, but only inside the studio toolbar's
 * collapsed advanced drawer, which is exactly the wrong place for a global engine setting.
 * Several other engine-level settings had the same problem — implemented, persisted, and
 * reachable only from the console (`latencyCompensationMs`, `hearingProtection`,
 * `maxVolumeLimit`, the layout defaults, haptics).
 *
 * So this panel is the one place for parameters that are **not** per-track, grouped by what the
 * user is trying to change rather than by which module implements them:
 *
 *   - 音频     the engine: voices, level, protection, latency, diagnostics
 *   - 演奏     performance feel: haptics
 *   - 界面     language, layout defaults, density
 *   - 关于     version, update check, local storage usage
 *
 * It is opened from the header, between the language switch and the version button, which is
 * where the user asked for it.
 *
 * Honesty rules applied here: every control writes to the same store the feature itself reads
 * (no shadow state), a control that cannot take effect says so, and the About tab reports what
 * is actually stored rather than a fixed blurb.
 */
export type SettingsTabId = "audio" | "performance" | "interface" | "about";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Which tab to show when it opens; the toolbar shortcut uses `audio`. */
  initialTab?: SettingsTabId;
  engine: AudioEngine | null;
  gs1Enabled: boolean;
  onToggleGs1: () => void;
  /** Opens the changelog/update dialog from the About tab, when the host provides one. */
  onOpenUpdates?: () => void;
  /**
   * U2: the walkthrough is dismissed without being finished, so the user needs a way back to it —
   * otherwise "I closed it by accident" has no remedy other than clearing site data.
   */
  onReplayOnboarding?: () => void;
}

const TAB_ORDER: SettingsTabId[] = ["audio", "performance", "interface", "about"];

/** Storage keys this app owns, for the About tab's usage report. */
const OWNED_STORAGE_PREFIXES = ["groove_"];

function storageUsage(): { entries: Array<{ key: string; bytes: number }>; totalBytes: number } {
  const entries: Array<{ key: string; bytes: number }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !OWNED_STORAGE_PREFIXES.some((p) => key.startsWith(p))) continue;
      const value = localStorage.getItem(key) ?? "";
      // UTF-16 code units, which is what the browser charges for a string value.
      entries.push({ key, bytes: value.length * 2 });
    }
  } catch {
    /* private mode / no storage: report nothing rather than throwing */
  }
  entries.sort((a, b) => b.bytes - a.bytes);
  return { entries, totalBytes: entries.reduce((s, e) => s + e.bytes, 0) };
}

const formatBytes = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialTab = "audio",
  engine,
  gs1Enabled,
  onToggleGs1,
  onOpenUpdates,
  onReplayOnboarding,
}) => {
  const { t, language, setLanguage } = useLanguage();
  const [tab, setTab] = useState<SettingsTabId>(initialTab);

  // Re-open on the requested tab: the toolbar shortcut means "audio", the header means "last".
  useEffect(() => {
    if (isOpen) setTab(initialTab);
  }, [isOpen, initialTab]);

  // Haptics live in their own module (a device capability, not an audio one).
  const [hapticOn, setHapticOn] = useState(() => getHapticSettings().enabled);
  const [hapticLevel, setHapticLevel] = useState(() => getHapticSettings().intensity);
  const [hapticSupported, setHapticSupported] = useState(true);
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    // `vibrate` is absent on desktop Safari and Firefox; saying so beats a silent no-op switch.
    setHapticSupported(typeof (navigator as Navigator & { vibrate?: unknown }).vibrate === "function");
  }, []);

  // Layout defaults are read/written through the same module the studio boots from.
  const [layout, setLayout] = useState<LayoutPrefs>(() => loadLayoutPrefs());
  const [showKeyboardFab, setShowKeyboardFab] = useState<boolean>(() => loadKeyboardFabPref());
  const [defaultRollTool, setDefaultRollTool] = useState<"pointer" | "pencil">(() => {
    try {
      const val = localStorage.getItem("groove_default_roll_tool");
      return val === "pencil" ? "pencil" : "pointer";
    } catch {
      return "pointer";
    }
  });
  useEffect(() => {
    if (isOpen) {
      setLayout(loadLayoutPrefs());
      setShowKeyboardFab(loadKeyboardFabPref());
      try {
        const val = localStorage.getItem("groove_default_roll_tool");
        setDefaultRollTool(val === "pencil" ? "pencil" : "pointer");
      } catch {
        setDefaultRollTool("pointer");
      }
    }
  }, [isOpen]);

  const updateLayout = useCallback((patch: Partial<LayoutPrefs>) => {
    setLayout((prev) => {
      const next = { ...prev, ...patch };
      saveLayoutPrefs(next);
      return next;
    });
  }, []);

  const usage = useMemo(() => (isOpen && tab === "about" ? storageUsage() : { entries: [], totalBytes: 0 }), [isOpen, tab]);

  const tabLabel = (id: SettingsTabId) => t(`settings_tab_${id}`);
  const tabIcon = (id: SettingsTabId) => {
    switch (id) {
      case "audio":
        return <Waves className="w-3.5 h-3.5" />;
      case "performance":
        return <Smartphone className="w-3.5 h-3.5" />;
      case "interface":
        return <LayoutDashboard className="w-3.5 h-3.5" />;
      case "about":
        return <Info className="w-3.5 h-3.5" />;
    }
  };

  const sectionClass = "space-y-3 rounded-2xl bg-panel2 border border-line-subtle p-4";
  const sectionTitleClass = "flex items-center gap-2 text-accent text-xs font-bold uppercase tracking-wider";
  const rowLabelClass = "text-xs font-semibold text-text";
  const hintClass = "text-[11px] text-text-sub leading-relaxed";
  const toggleClass = (on: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
      on ? "bg-accent/20 border-accent text-accent" : "bg-[#1d2028] border-line text-text-sub hover:text-text"
    }`;

  const layoutRows: Array<{ key: keyof LayoutPrefs; labelKey: string }> = [
    { key: "isSidebarCollapsed", labelKey: "settings_layout_sidebar" },
    { key: "isEditorMaximized", labelKey: "settings_layout_maximized" },
    { key: "isVelocityLaneOpen", labelKey: "settings_layout_velocity" },
    { key: "isAnalyzerOpen", labelKey: "settings_layout_analyzer" },
    { key: "showAdvancedControls", labelKey: "settings_layout_advanced" },
    { key: "autoFollowPlayhead", labelKey: "settings_layout_auto_follow_playhead" },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("settings_title")} className="max-w-2xl">
      <div className="flex flex-col gap-4 max-h-[75vh]">
        {/* Category tabs */}
        <div role="tablist" aria-label={t("settings_title")} className="flex flex-wrap gap-1.5 shrink-0">
          {TAB_ORDER.map((id) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              data-testid={`settings-tab-${id}`}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                tab === id
                  ? "bg-accent/20 border-accent text-accent"
                  : "bg-[#1d2028] border-line text-text-sub hover:text-text"
              }`}
            >
              {tabIcon(id)}
              <span>{tabLabel(id)}</span>
            </button>
          ))}
        </div>

        <div className="overflow-y-auto pr-1">
          {tab === "audio" && (
            <AudioSettingsTab engine={engine} gs1Enabled={gs1Enabled} onToggleGs1={onToggleGs1} />
          )}

          {tab === "performance" && (
            <div className={sectionClass} data-testid="settings-panel-performance">
              <div className={sectionTitleClass}>
                <Smartphone className="w-4 h-4" />
                <span>{t("settings_section_haptics")}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={rowLabelClass}>{t("settings_haptics_enabled")}</div>
                  <div className={hintClass}>
                    {hapticSupported ? t("settings_haptics_hint") : t("settings_haptics_unsupported")}
                  </div>
                </div>
                <button
                  type="button"
                  aria-pressed={hapticOn}
                  data-testid="settings-haptics-toggle"
                  onClick={() => {
                    const next = !hapticOn;
                    setHapticEnabled(next);
                    setHapticOn(next);
                    if (next) triggerHaptic(HapticPatterns.tap);
                  }}
                  className={toggleClass(hapticOn)}
                >
                  {hapticOn ? t("audio_settings_on") : t("audio_settings_off")}
                </button>
              </div>
              <label className="block space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className={rowLabelClass}>{t("settings_haptics_intensity")}</span>
                  <span className="text-xs font-mono text-text-sub" data-testid="settings-haptics-value">
                    {Math.round(hapticLevel * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(hapticLevel * 100)}
                  disabled={!hapticOn}
                  onChange={(e) => {
                    const v = Number(e.target.value) / 100;
                    setHapticIntensity(v);
                    setHapticLevel(v);
                  }}
                  onPointerUp={() => hapticOn && triggerHaptic(HapticPatterns.slider)}
                  aria-label={t("settings_haptics_intensity")}
                  data-testid="settings-haptics-slider"
                  className="w-full accent-[var(--color-accent,#f59e0b)] disabled:opacity-40"
                />
              </label>
            </div>
          )}

          {tab === "interface" && (
            <div className="space-y-5" data-testid="settings-panel-interface">
              <div className={sectionClass}>
                <div className={sectionTitleClass}>
                  <LayoutDashboard className="w-4 h-4" />
                  <span>{t("settings_section_language")}</span>
                </div>
                <div className="flex items-center gap-2">
                  {(["zh", "en"] as Language[]).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      aria-pressed={language === lang}
                      data-testid={`settings-language-${lang}`}
                      onClick={() => setLanguage(lang)}
                      className={toggleClass(language === lang)}
                    >
                      {lang === "zh" ? "中文" : "English"}
                    </button>
                  ))}
                </div>
              </div>

              <div className={sectionClass}>
                <div className={sectionTitleClass}>
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>{t("settings_section_layout")}</span>
                </div>
                <div className={hintClass}>{t("settings_layout_hint")}</div>
                {layoutRows.map(({ key, labelKey }) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className={rowLabelClass}>{t(labelKey)}</span>
                    <button
                      type="button"
                      aria-pressed={Boolean(layout[key])}
                      data-testid={`settings-layout-${key}`}
                      onClick={() => updateLayout({ [key]: !layout[key] } as Partial<LayoutPrefs>)}
                      className={toggleClass(Boolean(layout[key]))}
                    >
                      {layout[key] ? t("audio_settings_on") : t("audio_settings_off")}
                    </button>
                  </div>
                ))}
                <label className="block space-y-1.5 pt-1">
                  <span className={rowLabelClass}>{t("settings_layout_density")}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {DENSITY_TIERS.map((tier: DensityTier) => (
                      <button
                        key={tier}
                        type="button"
                        aria-pressed={layout.density === tier}
                        data-testid={`settings-density-${tier}`}
                        onClick={() => updateLayout({ density: tier })}
                        className={toggleClass(layout.density === tier)}
                      >
                        {t(`settings_density_${tier}`)}
                      </button>
                    ))}
                  </div>
                </label>

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-line/40">
                  <div>
                    <span className={rowLabelClass}>{t("settings_keyboard_fab")}</span>
                    <div className="text-[11px] text-text-sub leading-relaxed">{t("settings_keyboard_fab_desc")}</div>
                  </div>
                  <button
                    type="button"
                    aria-pressed={showKeyboardFab}
                    data-testid="settings-keyboard-fab-toggle"
                    onClick={() => {
                      const next = !showKeyboardFab;
                      setShowKeyboardFab(next);
                      saveKeyboardFabPref(next);
                    }}
                    className={toggleClass(showKeyboardFab)}
                  >
                    {showKeyboardFab ? t("audio_settings_on") : t("audio_settings_off")}
                  </button>
                </div>

                {/* Default Piano Roll Tool */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-line/40">
                  <div>
                    <span className={rowLabelClass}>{t("settings_default_roll_tool")}</span>
                    <div className="text-[11px] text-text-sub leading-relaxed">{t("settings_default_roll_tool_desc")}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-pressed={defaultRollTool === "pointer"}
                      data-testid="settings-default-tool-pointer"
                      onClick={() => {
                        setDefaultRollTool("pointer");
                        localStorage.setItem("groove_default_roll_tool", "pointer");
                        window.dispatchEvent(new CustomEvent("groove_default_tool_changed", { detail: "pointer" }));
                      }}
                      className={toggleClass(defaultRollTool === "pointer")}
                    >
                      {t("roll_tool_pointer")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={defaultRollTool === "pencil"}
                      data-testid="settings-default-tool-pencil"
                      onClick={() => {
                        setDefaultRollTool("pencil");
                        localStorage.setItem("groove_default_roll_tool", "pencil");
                        window.dispatchEvent(new CustomEvent("groove_default_tool_changed", { detail: "pencil" }));
                      }}
                      className={toggleClass(defaultRollTool === "pencil")}
                    >
                      {t("roll_tool_pencil")}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="settings-layout-reset"
                  onClick={() => {
                    const next = defaultLayoutPrefs();
                    setLayout(next);
                    saveLayoutPrefs(next);
                  }}
                  className="text-[11px] font-semibold text-text-sub hover:text-text underline decoration-dotted"
                >
                  {t("settings_layout_reset")}
                </button>
              </div>
            </div>
          )}

          {tab === "about" && (
            <div className="space-y-5" data-testid="settings-panel-about">
              <div className={sectionClass}>
                <div className={sectionTitleClass}>
                  <Gauge className="w-4 h-4" />
                  <span>{t("settings_section_about")}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-sub">{t("settings_about_version")}</span>
                  <span className="font-mono text-text" data-testid="settings-about-version">
                    v{APP_VERSION} · {BUILD_DATE}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-sub">{t("settings_about_gs1")}</span>
                  <span className="font-mono text-text" data-testid="settings-about-gs1">
                    {gs1Enabled ? t("settings_about_gs1_on") : t("settings_about_gs1_off")}
                  </span>
                </div>
                {onOpenUpdates && (
                  <button
                    type="button"
                    data-testid="settings-about-updates"
                    onClick={onOpenUpdates}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-xs font-bold border border-line bg-[#1d2028] text-text-sub hover:text-text transition-colors"
                  >
                    {t("header_check_updates_title")}
                  </button>
                )}
                {onReplayOnboarding && (
                  <button
                    type="button"
                    data-testid="settings-about-replay-onboarding"
                    onClick={onReplayOnboarding}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-xs font-bold border border-line bg-[#1d2028] text-text-sub hover:text-text transition-colors"
                  >
                    {t("settings_replay_onboarding")}
                  </button>
                )}
              </div>

              <div className={sectionClass}>
                <div className={sectionTitleClass}>
                  <Info className="w-4 h-4" />
                  <span>{t("settings_section_storage")}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-sub">{t("settings_storage_total")}</span>
                  <span className="font-mono text-text" data-testid="settings-storage-total">
                    {formatBytes(usage.totalBytes)} · {usage.entries.length} {t("settings_storage_keys")}
                  </span>
                </div>
                {usage.entries.slice(0, 6).map((entry) => (
                  <div key={entry.key} className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-text-sub truncate mr-2">{entry.key}</span>
                    <span className="font-mono text-text-dim shrink-0">{formatBytes(entry.bytes)}</span>
                  </div>
                ))}
                <div className={hintClass}>{t("settings_storage_hint")}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
