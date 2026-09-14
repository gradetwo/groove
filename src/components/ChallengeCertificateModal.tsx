import React, { useState } from "react";
import { X, Award, Trophy, Sparkles, Copy, Check, ShieldCheck, Flame, Zap, Target } from "lucide-react";
import { RankTier, SM2GenreMemory } from "../utils/challengeAlgorithm";
import { useLanguage } from "../i18n/LanguageContext";

interface ChallengeCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  elo: number;
  tierInfo: {
    tier: RankTier;
    nextTier?: RankTier | null;
    progressPercent: number;
    pointsToNext: number;
  };
  stats: {
    totalAnswered: number;
    correctCount: number;
    bestStreak: number;
    streak: number;
  };
  sm2Memory: Record<string, SM2GenreMemory>;
  isZh: boolean;
}

export const ChallengeCertificateModal: React.FC<ChallengeCertificateModalProps> = ({
  isOpen,
  onClose,
  elo,
  tierInfo,
  stats,
  sm2Memory,
  isZh,
}) => {
  const [copied, setCopied] = useState(false);
  const { t } = useLanguage();

  if (!isOpen) return null;

  const { tier } = tierInfo;
  const accuracy = stats.totalAnswered > 0 ? Math.round((stats.correctCount / stats.totalAnswered) * 100) : 0;
  
  // Count items mastered (reps >= 2 and totalCorrect >= 2)
  const masteredCount = Object.values(sm2Memory).filter(
    (m) => m.repetitions >= 2 && m.totalCorrect >= 2
  ).length;

  const certificateId = `GRV-CERT-${(elo * 31 + stats.totalAnswered * 7).toString(16).toUpperCase().padStart(6, "0")}`;
  const issueDate = new Date().toISOString().split("T")[0];

  const handleCopyShare = async () => {
    const shareText = t("cert_share_text", { tier: isZh ? tier.nameZh : tier.nameEn, elo, accuracy, streak: stats.bestStreak, mastered: masteredCount });

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cert-title"
    >
      <div
        className="relative w-full max-w-lg bg-[#0d0e14] border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-amber-500/10 text-text overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Subtle holographic glow elements */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-gradient-to-br from-amber-500/10 to-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-gradient-to-tr from-cyan-500/10 to-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-text-dim hover:text-text rounded-xl bg-panel hover:bg-neutral-800 transition-colors z-20"
          aria-label={t("cert_close_aria")}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Outer Certificate Frame */}
        <div className="border border-line/80 rounded-2xl p-5 sm:p-6 bg-panel/70 relative">
          {/* Header Banner */}
          <div className="text-center space-y-1 pb-4 border-b border-line">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold tracking-widest uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Groove Acoustic Board</span>
            </div>
            <h2 id="cert-title" className="text-base sm:text-lg font-black tracking-wider text-text uppercase">
              {t("cert_title")}
            </h2>
            <p className="text-[11px] text-text-sub font-mono">
              {t("cert_subtitle")}
            </p>
          </div>

          {/* Rank Badge & Tier Display */}
          <div className="py-6 text-center space-y-2">
            <div className="relative inline-flex items-center justify-center">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-indigo-500/20 to-purple-500/20 border-2 border-amber-400/40 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Trophy className="w-10 h-10 sm:w-12 sm:h-12 text-amber-400 drop-shadow-md" />
              </div>
              <div className="absolute -bottom-2 px-2.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-black uppercase tracking-wider shadow">
                VERIFIED
              </div>
            </div>

            <div className="pt-2">
              <div className="text-xs font-bold uppercase tracking-widest text-text-dim">
                {t("cert_current_tier")}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-text tracking-wide mt-0.5">
                {isZh ? tier.nameZh : tier.nameEn}
              </div>
              <div className="text-base font-extrabold text-amber-400 font-mono">
                {elo} <span className="text-xs text-text-dim">ELO RATING</span>
              </div>
            </div>
          </div>

          {/* Grid Stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 py-3 border-y border-line">
            <div className="text-center p-2 rounded-xl bg-panel2/60 border border-line">
              <div className="flex items-center justify-center space-x-1 text-[10px] text-text-dim font-bold uppercase">
                <Target className="w-3 h-3 text-cyan-400" />
                <span>{t("cert_accuracy")}</span>
              </div>
              <div className="text-sm sm:text-base font-black text-cyan-300 font-mono mt-0.5">
                {accuracy}%
              </div>
            </div>

            <div className="text-center p-2 rounded-xl bg-panel2/60 border border-line">
              <div className="flex items-center justify-center space-x-1 text-[10px] text-text-dim font-bold uppercase">
                <Flame className="w-3 h-3 text-amber-400" />
                <span>{t("cert_best_streak")}</span>
              </div>
              <div className="text-sm sm:text-base font-black text-amber-300 font-mono mt-0.5">
                {stats.bestStreak}
              </div>
            </div>

            <div className="text-center p-2 rounded-xl bg-panel2/60 border border-line">
              <div className="flex items-center justify-center space-x-1 text-[10px] text-text-dim font-bold uppercase">
                <Zap className="w-3 h-3 text-purple-400" />
                <span>{t("cert_answered")}</span>
              </div>
              <div className="text-sm sm:text-base font-black text-purple-300 font-mono mt-0.5">
                {stats.totalAnswered}
              </div>
            </div>
          </div>

          {/* Verification Meta Footer */}
          <div className="pt-4 flex items-center justify-between text-[10px] text-text-dim font-mono">
            <div className="flex items-center space-x-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{certificateId}</span>
            </div>
            <div>
              <span>{t("cert_issued")}</span>
              <span>{issueDate}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={handleCopyShare}
            className={`flex-1 inline-flex items-center justify-center space-x-2 py-3 px-4 rounded-2xl font-bold text-xs transition-all shadow-xl ${
              copied
                ? "bg-emerald-600 text-white shadow-emerald-600/30"
                : "bg-accent hover:bg-indigo-500 text-white shadow-indigo-600/30"
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>
              {copied
                ? (t("cert_copied"))
                : (t("cert_copy"))}
            </span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-3 rounded-2xl bg-panel border border-line text-text-sub hover:text-text text-xs font-semibold hover:bg-neutral-800 transition-colors"
          >
            {t("cert_close")}
          </button>
        </div>
      </div>
    </div>
  );
};
