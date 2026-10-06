import { useLanguage } from "../../i18n/LanguageContext";
import { collectWebDebugBundle } from "../../data/debugBundleWeb";
import { APP_VERSION, getRecentErrors } from "../../utils/telemetry";

/**
 * ⭐ **The debug entry the browser side was missing.**
 *
 * The server half writes a compressed archive beside its output and reports the path and the byte count; a browser downloads one
 * self-describing file instead, and it is built from the same whitelist: the version, the user agent, how much music is open and
 * the errors `telemetry` already collects. It lives in its own file so `SettingsModal` stays below the file-size ceiling, which
 * is the same measured reason `PwaInstallRow` was extracted.
 */
export function DebugBundleRow() {
  const { t } = useLanguage();

  const download = () => {
    const bundle = collectWebDebugBundle({
      appVersion: APP_VERSION,
      userAgent: typeof navigator === "undefined" ? "unknown" : navigator.userAgent,
      errors: getRecentErrors().map((report) => JSON.stringify(report)),
    });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `groove-debug-${bundle.manifest.generatedAt.replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        data-testid="settings-download-debug"
        onClick={download}
        className="rounded border border-[rgb(var(--d-line))] px-2 py-1 text-xs text-text"
      >
        {t("settings_about_debug")}
      </button>
      <p className="text-[11px] text-text-sub leading-relaxed">{t("settings_about_debug_hint")}</p>
    </div>
  );
}
