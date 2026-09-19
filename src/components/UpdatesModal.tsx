import React, { useState, useEffect, useMemo } from "react";
import { 
  X, 
  RefreshCw, 
  CheckCircle2, 
  Sparkles, 
  Flame, 
  Sliders, 
  AlertCircle,
  ExternalLink,
  History,
  ShieldCheck,
  Zap,
  ArrowUpCircle,
  Wrench,
  FileText
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { Modal } from "../ui";
import {
  ChangelogEntry,
  VersionInfo,
  ChangelogArchive,
  changelogArchiveUrl,
  compareVersionsDesc,
  isNewerVersion,
  mergeChangelog,
} from "../utils/changelog";

export type { ChangelogEntry, ChangelogHighlight, VersionInfo, ChangelogArchive } from "../utils/changelog";

import { APP_VERSION } from "../version";

/** Single source of truth lives in package.json → src/version.ts (E-05). */
export const CURRENT_CLIENT_VERSION = APP_VERSION;

interface UpdatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdateAvailable?: (newVersion: string) => void;
}

export const UpdatesModal: React.FC<UpdatesModalProps> = ({
  isOpen,
  onClose,
  onUpdateAvailable,
}) => {
  const { t, isZh, language } = useLanguage();

  const [versionData, setVersionData] = useState<VersionInfo | null>(null);
  // A-08: `version.json` is now ~3KB; the 83KB archive loads only on demand.
  // Kept together with the version it belongs to, so a payload fetched for an
  // older release can never overwrite a newer one.
  const [archive, setArchive] = useState<ChangelogArchive | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState<"idle" | "latest" | "update_available" | "error">("idle");
  const [latestVersion, setLatestVersion] = useState<string>(CURRENT_CLIENT_VERSION);
  const [lastCheckedTime, setLastCheckedTime] = useState<string | null>(null);

  const checkForUpdates = async (silent = false) => {
    if (!silent) setIsChecking(true);
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch version info");
      const data = (await res.json()) as VersionInfo & { latest?: ChangelogEntry; changelogCount?: number };
      const latestEntries = data.latest ? [data.latest] : (data.changelog || []);
      setVersionData({ ...data, changelog: latestEntries });
      setLatestVersion(data.version);

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
      setLastCheckedTime(timeStr);

      // `isNewerVersion` (not `!==`) so a rollback — or a stale edge copy of
      // version.json — cannot advertise a downgrade as an available update and
      // trap the user in a reload loop.
      if (isNewerVersion(data.version, CURRENT_CLIENT_VERSION)) {
        setCheckStatus("update_available");
        if (onUpdateAvailable) onUpdateAvailable(data.version);
      } else {
        setCheckStatus("latest");
      }
    } catch {
      if (!silent) setCheckStatus("error");
    } finally {
      if (!silent) setIsChecking(false);
    }
  };

  // Load changelog when opened
  useEffect(() => {
    if (isOpen) {
      checkForUpdates(false);
    }
  }, [isOpen]);

  /**
   * The version the server just reported. The archive is keyed on this rather
   * than on the *running* client version: a client that has not reloaded into the
   * update yet must still be able to read the newest release notes.
   */
  const serverVersion = versionData?.version ?? null;

  // A-08: fetch the full bilingual archive only when the modal is actually opened.
  // The URL is version-keyed, so shipping a release invalidates it by construction —
  // the old unversioned fetch could be answered from a stale HTTP/SW cache entry,
  // which is exactly how the newest release note went missing after an update.
  useEffect(() => {
    if (!isOpen || !serverVersion) return;
    // Already holding the archive for the version the server reported.
    if (archive && archive.version === serverVersion) return;

    let cancelled = false;
    fetch(changelogArchiveUrl(serverVersion))
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("changelog fetch failed"))))
      .then((data: ChangelogArchive) => {
        if (cancelled || !Array.isArray(data?.changelog)) return;
        // Never let a stale payload replace a newer archive already in hand.
        setArchive((prev) =>
          prev && compareVersionsDesc(prev.version, data.version) < 0 ? prev : data
        );
      })
      .catch(() => {
        // Falls back to the single `latest` entry from version.json, which is
        // enough to prove the update landed even if the archive is unreachable.
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, serverVersion, archive]);

  /**
   * Newest-first union of the cacheable archive and the never-stale `latest`
   * entry. Rendering the archive *instead of* `latest` is what hid the newest
   * release from a just-updated client.
   */
  const entries = useMemo(
    () => mergeChangelog(archive?.changelog, versionData?.latest),
    [archive, versionData]
  );

  /**
   * A badge per category, as a **record rather than a switch**.
   *
   * This was a `switch` with cases for feature/audio/fix and no `default`, so an unrecognised
   * category returned `undefined` and the render threw
   * `Cannot read properties of undefined (reading 'classes')` — taking the whole updates panel to the
   * error boundary. A release shipped with `category: "refactor"` and that is exactly what happened.
   *
   * A record keyed by the union cannot have a missing arm: adding a category to
   * `CHANGELOG_CATEGORIES` is a type error here until a badge exists for it, which is the check a
   * `switch` without a `default` never had. `normalizeChangelogCategory` additionally guarantees the
   * value is one of these keys even though the data arrives as JSON from the network.
   */
  const CATEGORY_BADGES: Record<
    ChangelogEntry["category"],
    { labelKey: string; classes: string; icon: React.ReactNode }
  > = {
    feature: {
      labelKey: "updates_category_feature",
      classes: "bg-accent/15 text-accent border-accent/30",
      icon: <Sparkles className="w-3 h-3" />,
    },
    audio: {
      labelKey: "updates_category_audio",
      classes: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
      icon: <Zap className="w-3 h-3" />,
    },
    fix: {
      labelKey: "updates_category_fix",
      classes: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
      icon: <ShieldCheck className="w-3 h-3" />,
    },
    refactor: {
      labelKey: "updates_category_refactor",
      classes: "bg-violet-500/15 text-violet-300 border-violet-500/30",
      icon: <Wrench className="w-3 h-3" />,
    },
    docs: {
      labelKey: "updates_category_docs",
      classes: "bg-slate-500/15 text-slate-300 border-slate-500/30",
      icon: <FileText className="w-3 h-3" />,
    },
  };

  const getCategoryBadge = (category: ChangelogEntry["category"]) => {
    // Belt and braces: the record is total over the union, and this cannot be reached with a key
    // outside it because `mergeChangelog` normalises before the entry gets here.
    const badge = CATEGORY_BADGES[category] ?? CATEGORY_BADGES.fix;
    return { label: t(badge.labelKey), classes: badge.classes, icon: badge.icon };
  };

  const handleReloadToUpdate = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      showCloseButton={false}
      className="max-h-[90vh]"
      ariaLabel={t("updates_modal_title")}
    >
      <div className="flex flex-col h-full overflow-hidden bg-[#0d0f16]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#1f222b] bg-[#121319]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f5b73d]/20 to-amber-500/10 border border-accent/30 flex items-center justify-center text-accent">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-text flex items-center gap-2">
                <span>{t("updates_modal_title")}</span>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-[#1c1f26] border border-[#2d313d] text-[#a0a4b0]">
                  v{CURRENT_CLIENT_VERSION}
                </span>
              </h2>
              <p className="text-[11px] text-text-dim">
                {t("updates_modal_subtitle")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#1c1f27] hover:bg-[#282d38] border border-[#2d313d] flex items-center justify-center text-text-sub hover:text-text transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Status Action Bar */}
        <div className="px-5 sm:px-6 py-3.5 bg-[#14161f] border-b border-[#1f222b] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            {checkStatus === "idle" && (
              <span className="text-text-sub">
                {t("updates_idle_hint")}
              </span>
            )}

            {checkStatus === "latest" && (
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {isZh 
                    ? `当前已是最新版本 (v${CURRENT_CLIENT_VERSION}) ✓` 
                    : `You are on the latest version (v${CURRENT_CLIENT_VERSION}) ✓`}
                </span>
              </span>
            )}

            {checkStatus === "update_available" && (
              <span className="inline-flex items-center gap-1.5 text-accent font-bold animate-pulse">
                <ArrowUpCircle className="w-4 h-4 shrink-0" />
                <span>
                  {isZh 
                    ? `发现新版本 v${latestVersion} 可用！` 
                    : `New version v${latestVersion} available!`}
                </span>
              </span>
            )}

            {checkStatus === "error" && (
              <span className="inline-flex items-center gap-1.5 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{t("updates_failed")}</span>
              </span>
            )}

            {lastCheckedTime && (
              <span className="text-[10px] text-text-dim font-mono ml-1">
                ({lastCheckedTime})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {checkStatus === "update_available" && (
              <button
                onClick={handleReloadToUpdate}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#f5b73d] to-amber-500 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-transform hover:scale-105"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t("updates_btn_update")}</span>
              </button>
            )}

            <button
              onClick={() => checkForUpdates(false)}
              disabled={isChecking}
              className="px-3.5 py-1.5 rounded-xl bg-[#1d202a] hover:bg-[#272b38] border border-[#2d313d] text-xs font-semibold text-text hover:text-accent flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? "animate-spin text-accent" : ""}`} />
              <span>
                {isChecking ? t("updates_btn_checking") : t("updates_btn_check")}
              </span>
            </button>
          </div>
        </div>

        {/* Scrollable Changelog List */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 divide-y divide-[#1f222b]/60 bg-[#0d0f16]">
          {entries.map((entry, idx) => {
            const badge = getCategoryBadge(entry.category);
            const isCurrent = entry.version === CURRENT_CLIENT_VERSION;

            return (
              <div key={entry.version} className={idx > 0 ? "pt-5" : ""}>
                {/* Release Header */}
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-['JetBrains_Mono'] text-sm sm:text-base font-extrabold text-text">
                      v{entry.version}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {t("updates_badge_current")}
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.classes}`}>
                      {badge.icon}
                      <span>{badge.label}</span>
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-text-dim">
                    {entry.date}
                  </span>
                </div>

                {/* Release Title */}
                <h3 className="text-xs sm:text-sm font-bold text-[#b9b7b0] mb-2">
                  {entry.title[language] || entry.title.en}
                </h3>

                {/* Highlights List */}
                <ul className="space-y-1.5 text-xs text-[#8e92a0]">
                  {entry.highlights.map((h, hIdx) => (
                    <li key={hIdx} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent/70 shrink-0 mt-1.5" />
                      <span className="leading-relaxed">
                        {h[language] || h.en}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 border-t border-[#1f222b] bg-[#121319] flex items-center justify-between text-[11px] text-text-dim">
          <span>Groove Lab • Cloudflare Edge Distribution</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#1d202a] hover:bg-[#272b38] border border-[#2d313d] text-xs text-text font-medium transition-colors"
          >
            {t("close")}
          </button>
        </div>
      </div>
    </Modal>
  );
};
