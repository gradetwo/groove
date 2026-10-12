import { useEffect, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { applyUpdate, promptInstallApp, subscribePwaStatus, type PwaStatus } from "../../utils/pwa";

/**
 * 📲 **The install and update entries the platform offered and nothing showed.**
 *
 * `initPwa` has always captured the install prompt and watched for a waiting worker, and `pwa.ts` has always exposed
 * `subscribePwaStatus`, `promptInstallApp` and `applyUpdate` — but no component called them, so a user whose browser
 * could install the app had no button and an update waited until the tab was closed.
 *
 * It lives in its own file for a measured reason as well as a tidy one: it started inside `SettingsModal.tsx`, whose
 * forty added lines pushed that file from below six hundred to six hundred and twenty one, and the file-size
 * criterion counts how many production files sit at or above six hundred. Extracting it keeps the panel as it was.
 *
 * A control that cannot take effect says nothing rather than showing a disabled button: a disabled "install" would be
 * a promise the browser has not made.
 */
export function PwaInstallRow() {
  const { t } = useLanguage();
  const [pwa, setPwa] = useState<PwaStatus>({
    isInstalled: false,
    canInstall: false,
    isUpdateAvailable: false,
    offlineReady: false,
  });

  /** The subscription reports the current status immediately, so the first render is already right. */
  useEffect(() => subscribePwaStatus(setPwa), []);

  const hintClass = "text-[11px] text-text-sub leading-relaxed";

  return (
    <>
      {pwa.canInstall && !pwa.isInstalled && (
        <div className="space-y-1">
          <button
            type="button"
            data-testid="settings-about-install"
            onClick={() => void promptInstallApp()}
            className="w-full px-3 py-2 rounded-lg text-xs font-bold border border-accent bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            {t("settings_about_install")}
          </button>
          <p className={hintClass}>{t("settings_about_install_hint")}</p>
        </div>
      )}
      {pwa.isInstalled && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-sub">{t("settings_about_install")}</span>
          <span className="font-mono text-text" data-testid="settings-about-installed">
            {t("settings_about_installed")}
          </span>
        </div>
      )}
      {pwa.isUpdateAvailable && (
        <div className="space-y-1">
          <p className={hintClass}>{t("settings_about_update_ready")}</p>
          <button
            type="button"
            data-testid="settings-about-apply-update"
            onClick={() => applyUpdate()}
            className="w-full px-3 py-2 rounded-lg text-xs font-bold border border-accent bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
          >
            {t("settings_about_update_now")}
          </button>
        </div>
      )}
    </>
  );
}
