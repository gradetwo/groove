import React, { useState, useEffect } from "react";
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
  ArrowUpCircle
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { Modal } from "../ui";

export interface ChangelogHighlight {
  zh: string;
  en: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  category: "feature" | "audio" | "fix";
  title: {
    zh: string;
    en: string;
  };
  highlights: ChangelogHighlight[];
}

export interface VersionInfo {
  version: string;
  releaseDate: string;
  changelog: ChangelogEntry[];
}

export const CURRENT_CLIENT_VERSION = "1.6.0";

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
  const { language } = useLanguage();

  const [versionData, setVersionData] = useState<VersionInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState<"idle" | "latest" | "update_available" | "error">("idle");
  const [latestVersion, setLatestVersion] = useState<string>(CURRENT_CLIENT_VERSION);
  const [lastCheckedTime, setLastCheckedTime] = useState<string | null>(null);

  // Compare semantic versions (e.g. "1.1.0" > "1.0.2")
  const isNewerVersion = (remote: string, current: string): boolean => {
    const rParts = remote.split(".").map((n) => parseInt(n, 10) || 0);
    const cParts = current.split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
      const r = rParts[i] || 0;
      const c = cParts[i] || 0;
      if (r > c) return true;
      if (r < c) return false;
    }
    return false;
  };

  const checkForUpdates = async (silent = false) => {
    if (!silent) setIsChecking(true);
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data: VersionInfo = await res.json();
      setVersionData(data);
      setLatestVersion(data.version);

      const hasUpdate = isNewerVersion(data.version, CURRENT_CLIENT_VERSION);
      if (hasUpdate) {
        setCheckStatus("update_available");
        if (onUpdateAvailable) onUpdateAvailable(data.version);
      } else {
        setCheckStatus("latest");
      }
      setLastCheckedTime(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn("Failed to check for updates:", err);
      if (!silent) setCheckStatus("error");
    } finally {
      if (!silent) setIsChecking(false);
    }
  };

  // Load changelog when opened
  useEffect(() => {
    if (isOpen) {
      checkForUpdates(true);
    }
  }, [isOpen]);

  const getCategoryBadge = (category: ChangelogEntry["category"]) => {
    switch (category) {
      case "feature":
        return {
          label: language === "zh" ? "全新功能" : "Feature",
          classes: "bg-accent/15 text-accent border-accent/30",
          icon: <Sparkles className="w-3 h-3" />,
        };
      case "audio":
        return {
          label: language === "zh" ? "音频重构" : "Audio Engine",
          classes: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
          icon: <Zap className="w-3 h-3" />,
        };
      case "fix":
        return {
          label: language === "zh" ? "稳定修复" : "Bug Fix",
          classes: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
          icon: <ShieldCheck className="w-3 h-3" />,
        };
    }
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
      ariaLabel={language === "zh" ? "检查更新 & 更新记录" : "Updates & Release Notes"}
    >
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#1f222b] bg-[#121319]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#f5b73d]/20 to-amber-500/10 border border-accent/30 flex items-center justify-center text-accent">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-text flex items-center gap-2">
                <span>{language === "zh" ? "检查更新 & 更新记录" : "Updates & Release Notes"}</span>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-[#1c1f26] border border-[#2d313d] text-[#a0a4b0]">
                  v{CURRENT_CLIENT_VERSION}
                </span>
              </h2>
              <p className="text-[11px] text-[#717684]">
                {language === "zh" ? "查看最新功能特性、音频算法进化与更新日志" : "Check for latest features, audio engine updates and changelogs"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#1c1f27] hover:bg-[#282d38] border border-[#2d313d] flex items-center justify-center text-text-sub hover:text-text transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Status Action Bar */}
        <div className="px-5 sm:px-6 py-3.5 bg-[#14161f] border-b border-[#1f222b] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            {checkStatus === "idle" && (
              <span className="text-text-sub">
                {language === "zh" ? "点击右侧按钮立即检查云端版本" : "Click check to discover latest cloud updates"}
              </span>
            )}

            {checkStatus === "latest" && (
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {language === "zh" 
                    ? `当前已是最新版本 (v${CURRENT_CLIENT_VERSION}) ✓` 
                    : `You are on the latest version (v${CURRENT_CLIENT_VERSION}) ✓`}
                </span>
              </span>
            )}

            {checkStatus === "update_available" && (
              <span className="inline-flex items-center gap-1.5 text-accent font-bold animate-pulse">
                <ArrowUpCircle className="w-4 h-4 shrink-0" />
                <span>
                  {language === "zh" 
                    ? `发现新版本 v${latestVersion} 可用！` 
                    : `New version v${latestVersion} available!`}
                </span>
              </span>
            )}

            {checkStatus === "error" && (
              <span className="inline-flex items-center gap-1.5 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{language === "zh" ? "检查更新失败，请重试" : "Failed to check updates, please retry"}</span>
              </span>
            )}

            {lastCheckedTime && (
              <span className="text-[10px] text-[#555a67] font-mono ml-1">
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
                <span>{language === "zh" ? "立即刷新更新" : "Update Now"}</span>
              </button>
            )}

            <button
              onClick={() => checkForUpdates(false)}
              disabled={isChecking}
              className="px-3.5 py-1.5 rounded-xl bg-[#1d202a] hover:bg-[#272b38] border border-[#2d313d] text-xs font-semibold text-text hover:text-accent flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? "animate-spin text-accent" : ""}`} />
              <span>
                {isChecking 
                  ? (language === "zh" ? "检查中..." : "Checking...") 
                  : (language === "zh" ? "检查更新" : "Check")}
              </span>
            </button>
          </div>
        </div>

        {/* Scrollable Changelog List */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 divide-y divide-[#1f222b]/60">
          {(versionData?.changelog || []).map((entry, idx) => {
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
                        {language === "zh" ? "当前运行" : "Current"}
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.classes}`}>
                      {badge.icon}
                      <span>{badge.label}</span>
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-[#616675]">
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
        <div className="px-5 sm:px-6 py-3 border-t border-[#1f222b] bg-[#121319] flex items-center justify-between text-[11px] text-[#616675]">
          <span>Groove Lab • Cloudflare Edge Distribution</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#1d202a] hover:bg-[#272b38] border border-[#2d313d] text-xs text-text font-medium transition-colors"
          >
            {language === "zh" ? "关闭" : "Close"}
          </button>
        </div>
      </div>
    </Modal>
  );
};
