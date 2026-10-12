import React, { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Brain, Orbit, Activity, Shield, Sparkles } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

interface KickPhilosophyDossierProps {
  isZh: boolean;
  className?: string;
}

export const KickPhilosophyDossier: React.FC<KickPhilosophyDossierProps> = ({
  className = "",
}) => {
  const { t } = useLanguage();
  const [openSection, setOpenSection] = useState<number | null>(0);

  const toggleSection = (idx: number) => {
    setOpenSection((prev) => (prev === idx ? null : idx));
  };

  return (
    <div className={`bg-[#050609] border border-line/60 rounded-lg p-5 font-mono select-none text-text-sub shadow-2xl ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-line/40">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-4 h-4 text-[#f5b73d]" />
          <div>
            <h3 className="text-sm font-bold text-text uppercase tracking-wider">
              {t("kick_dossier_title")}
            </h3>
            <p className="text-[10px] text-text-dim">
              BAHADIRHAN KOÇER · DUB TECHNO: THE ORPHIC EXPERIENCE OF SOUND · PHENOMENOLOGY
            </p>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded bg-[#10141e] text-[#f5b73d] border border-[#f5b73d]/30">
          ACADEMIC ARCHIVE
        </span>
      </div>

      {/* Chapters Accordion */}
      <div className="divide-y divide-line/30 mt-2">
        {/* Chapter 0: The Bodily Contract */}
        <div className="py-3">
          <button
            onClick={() => toggleSection(0)}
            className="w-full flex items-center justify-between text-left group hover:text-text transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-[#f5b73d]">00</span>
              <span className="text-xs font-bold text-text group-hover:text-[#f5b73d] transition-colors">
                {t("kick_dossier_ch0_title")}
              </span>
            </div>
            {openSection === 0 ? (
              <ChevronUp className="w-4 h-4 text-[#f5b73d]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-dim" />
            )}
          </button>

          {openSection === 0 && (
            <div className="mt-3 text-xs leading-relaxed space-y-2 text-text-sub pl-6 border-l border-[#f5b73d]/40">
              <p className="italic text-text font-serif">
                {t("kick_dossier_ch0_quote")}
              </p>
              <p>
                {t("kick_dossier_ch0_body")}
              </p>
            </div>
          )}
        </div>

        {/* Chapter 1: The Somatic Triad */}
        <div className="py-3">
          <button
            onClick={() => toggleSection(1)}
            className="w-full flex items-center justify-between text-left group hover:text-text transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-[#f5b73d]">01</span>
              <span className="text-xs font-bold text-text group-hover:text-[#f5b73d] transition-colors">
                {t("kick_dossier_ch1_title")}
              </span>
            </div>
            {openSection === 1 ? (
              <ChevronUp className="w-4 h-4 text-[#f5b73d]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-dim" />
            )}
          </button>

          {openSection === 1 && (
            <div className="mt-3 text-xs leading-relaxed space-y-3 pl-6 border-l border-[#f5b73d]/40">
              <div className="p-2.5 rounded bg-black/40 border border-line/40">
                <span className="text-[#f5b73d] font-bold">1. Sub (超低频 30–60 Hz) — 躯体与内脏 (Viscera / Gravity)</span>
                <p className="mt-1">
                  {t("kick_dossier_ch1_sub_body")}
                </p>
              </div>

              <div className="p-2.5 rounded bg-black/40 border border-line/40">
                <span className="text-white font-bold">2. Thump (击打感 100–200 Hz) — 肌肉与质量 (Muscular / Impact)</span>
                <p className="mt-1">
                  {t("kick_dossier_ch1_thump_body")}
                </p>
              </div>

              <div className="p-2.5 rounded bg-black/40 border border-line/40">
                <span className="text-[#f5b73d] font-bold">3. Click (高频瞬态 1–2.5 kHz) — 神经元与锁相 (Neural / PLV)</span>
                <p className="mt-1">
                  {t("kick_dossier_ch1_click_body")}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Chapter 2: The Ontological Evolution */}
        <div className="py-3">
          <button
            onClick={() => toggleSection(2)}
            className="w-full flex items-center justify-between text-left group hover:text-text transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-[#f5b73d]">02</span>
              <span className="text-xs font-bold text-text group-hover:text-[#f5b73d] transition-colors">
                {t("kick_dossier_ch2_title")}
              </span>
            </div>
            {openSection === 2 ? (
              <ChevronUp className="w-4 h-4 text-[#f5b73d]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-dim" />
            )}
          </button>

          {openSection === 2 && (
            <div className="mt-3 text-xs leading-relaxed space-y-2 pl-6 border-l border-[#f5b73d]/40">
              <p>
                {t("kick_dossier_ch2_body_1")}
              </p>
              <p>
                {t("kick_dossier_ch2_body_2")}
              </p>
            </div>
          )}
        </div>

        {/* Chapter 3: Resisting the McPulse & The Orphic Experience */}
        <div className="py-3">
          <button
            onClick={() => toggleSection(3)}
            className="w-full flex items-center justify-between text-left group hover:text-text transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-[#f5b73d]">03</span>
              <span className="text-xs font-bold text-text group-hover:text-[#f5b73d] transition-colors">
                {t("kick_dossier_ch3_title")}
              </span>
            </div>
            {openSection === 3 ? (
              <ChevronUp className="w-4 h-4 text-[#f5b73d]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-dim" />
            )}
          </button>

          {openSection === 3 && (
            <div className="mt-3 text-xs leading-relaxed space-y-2 pl-6 border-l border-[#f5b73d]/40">
              <p className="italic text-text font-serif">
                {t("kick_dossier_ch3_quote")}
              </p>
              <p>
                {t("kick_dossier_ch3_body_1")}
              </p>
              <p>
                {t("kick_dossier_ch3_body_2")}
              </p>
            </div>
          )}
        </div>

        {/* Chapter 4: The Sound Design Blueprint */}
        <div className="py-3">
          <button
            onClick={() => toggleSection(4)}
            className="w-full flex items-center justify-between text-left group hover:text-text transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-[#f5b73d]">04</span>
              <span className="text-xs font-bold text-text group-hover:text-[#f5b73d] transition-colors">
                {t("kick_dossier_ch4_title")}
              </span>
            </div>
            {openSection === 4 ? (
              <ChevronUp className="w-4 h-4 text-[#f5b73d]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-dim" />
            )}
          </button>

          {openSection === 4 && (
            <div className="mt-3 text-xs leading-relaxed space-y-3 pl-6 border-l border-[#f5b73d]/40">
              <p>
                {t("kick_dossier_ch4_intro")}
              </p>

              <div className="bg-black/60 p-3 rounded border border-line/60 font-mono text-[11px] space-y-2">
                <div className="text-[#f5b73d] font-bold">ALGORITHM: PARALLEL 4-OSC (ALL OSCILLATORS DIRECT TO OUTPUT)</div>
                <ul className="list-disc list-inside space-y-1 text-text-sub">
                  <li><strong className="text-white">OSC A (Sub):</strong> Sine Wave · Fixed Freq 45 Hz · Decay 450ms · Pitch Env +24st (35ms drop)</li>
                  <li><strong className="text-white">OSC B (Thump):</strong> Triangle Wave · Fixed Freq 120 Hz · Decay 80ms · Soft Drive Tanh</li>
                  <li><strong className="text-white">OSC C (Click):</strong> Square / White Noise · Highpass 1.8 kHz · Decay 6ms · Fast Attack 0.1ms</li>
                  <li><strong className="text-white">MASTER BUS:</strong> Saturator (Analog Clip 3dB) · Utility (Mono Bass &lt; 140 Hz) · Glue Limiter</li>
                </ul>
              </div>

              <p className="text-[11px] text-text-dim">
                {t("kick_dossier_ch4_tip")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
