import { useLanguage } from "../../i18n/LanguageContext";
import { collectWebDebugArchive, downloadArchive, webDebugBundleFileName } from "../../features/debug/webDebugBundle";
import { getRecentErrors } from "../../utils/telemetry";

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

  const download = async () => {
    const archive = await collectWebDebugArchive({
      errors: getRecentErrors().map((report) => JSON.stringify(report)),
    });
    downloadArchive(webDebugBundleFileName(new Date().toISOString()), archive.blob);
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
