import React, { useState, useEffect, useRef, useCallback } from "react";
import { MasterclassAudioEngine, TapAccuracyResult } from "../../audio/MasterclassAudioEngine";
import { Play, Square, Zap, Sparkles, Footprints, MoveRight } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

interface BalkanOddMetersProps {
  engine: MasterclassAudioEngine;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  onTapResult?: (result: TapAccuracyResult) => void;
}

interface BalkanMeter {
  id: string;
  nameZh: string;
  nameEn: string;
  timeSignature: string;
  region: string;
  subdivisions: number[]; // e.g. [2, 2, 3] = 7
  mnemonicZh: string;
  mnemonicEn: string;
  danceDescriptionZh: string;
  danceDescriptionEn: string;
}

const BALKAN_METERS: BalkanMeter[] = [
  {
    id: "kalamatianos_78",
    nameZh: "7/8 Kalamatianos (短-短-长)",
    nameEn: "7/8 Kalamatianos (2+2+3)",
    timeSignature: "7/8",
    region: "希腊伯罗奔尼撒 / 泛巴尔干",
    subdivisions: [2, 2, 3],
    mnemonicZh: "踏-踏-跳！(Ta-te Ta-te Ta-te-ti)",
    mnemonicEn: "Short - Short - Long! (Ta-te Ta-te Ta-te-ti)",
    danceDescriptionZh: "希腊最负盛名的链舞：前两步平稳行走（2+2），第 3 步轻盈跃起悬空（3 拍长拍），产生优雅的滑行感。",
    danceDescriptionEn: "Classic Greek chain dance: two steady paces followed by an airborne elongated leap on beat 3.",
  },
  {
    id: "lesnoto_78",
    nameZh: "7/8 Lesnoto (长-短-短)",
    nameEn: "7/8 Lesnoto (3+2+2)",
    timeSignature: "7/8",
    region: "北马其顿 / 保加利亚",
    subdivisions: [3, 2, 2],
    mnemonicZh: "沉——踏-踏！(Ta-te-ti Ta-te Ta-te)",
    mnemonicEn: "Long - Short - Short! (Ta-te-ti Ta-te Ta-te)",
    danceDescriptionZh: "前置重音：首拍长音带来深沉雄浑的下沉跨步，随后两记短拍轻盈收回，充满斯拉夫民俗戏剧张力。",
    danceDescriptionEn: "Front-loaded accent: a deep authoritative dip on the opening 3-pulse, resolved by two crisp short steps.",
  },
  {
    id: "karsilama_98",
    nameZh: "9/8 Karsilama (短-短-短-长)",
    nameEn: "9/8 Karsilama (2+2+2+3)",
    timeSignature: "9/8",
    region: "土耳其 / 希腊小亚细亚",
    subdivisions: [2, 2, 2, 3],
    mnemonicZh: "踏-踏-踏-摇！(2+2+2+3)",
    mnemonicEn: "Short - Short - Short - Long! (2+2+2+3)",
    danceDescriptionZh: "面对面双人罗姆对舞（Karşılaşma）：三连短步后紧跟一记长拍摇摆，极富热烈吉普赛狂欢色彩。",
    danceDescriptionEn: "Face-to-face Romani dance: three driving short steps concluding with an infectious swaying long pulse.",
  },
];

export const BalkanOddMeters: React.FC<BalkanOddMetersProps> = ({
  engine,
  bpm,
  onBpmChange,
  onTapResult,
}) => {
  const { t, isZh } = useLanguage();
  const [selectedMeterId, setSelectedMeterId] = useState<string>("kalamatianos_78");
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSubdivIdx, setActiveSubdivIdx] = useState<number | null>(null);
  const [lastTapResult, setLastTapResult] = useState<TapAccuracyResult | null>(null);
  const [streak, setStreak] = useState(0);

  const timerRef = useRef<number | null>(null);
  const activeSubdivRef = useRef(0);

  const meter = BALKAN_METERS.find((m) => m.id === selectedMeterId) || BALKAN_METERS[0];
  const totalUnits = meter.subdivisions.reduce((a, b) => a + b, 0);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setIsPlaying(false);
      setActiveSubdivIdx(null);
    } else {
      setIsPlaying(true);
      activeSubdivRef.current = 0;

      const playNextSubdiv = () => {
        const idx = activeSubdivRef.current;
        setActiveSubdivIdx(idx);
        const durationUnits = meter.subdivisions[idx];
        const isLong = durationUnits === 3;
        const isFirst = idx === 0;

        if (isFirst) {
          engine.triggerSound("davul", undefined, 1.0);
        } else if (isLong) {
          engine.triggerSound("bell", undefined, 0.85);
        } else {
          engine.triggerSound("woodblock", undefined, 0.8);
        }

        engine.registerPulseTimestamp(engine.getCurrentTime());

        // Calculate ms duration for this specific subdivision unit (each unit = 1 eighth / 2 sixteenths)
        const unitMs = ((60 / bpm) / 2) * (durationUnits / 2) * 1000;

        activeSubdivRef.current = (idx + 1) % meter.subdivisions.length;
        timerRef.current = window.setTimeout(playNextSubdiv, unitMs);
      };

      playNextSubdiv();
    }
  }, [isPlaying, bpm, meter, engine]);

  // Handle updates while playing
  useEffect(() => {
    if (isPlaying) {
      if (timerRef.current) clearTimeout(timerRef.current);
      activeSubdivRef.current = 0;
      const playNextSubdiv = () => {
        const idx = activeSubdivRef.current;
        setActiveSubdivIdx(idx);
        const durationUnits = meter.subdivisions[idx];
        const isLong = durationUnits === 3;
        const isFirst = idx === 0;

        if (isFirst) {
          engine.triggerSound("davul", undefined, 1.0);
        } else if (isLong) {
          engine.triggerSound("bell", undefined, 0.85);
        } else {
          engine.triggerSound("woodblock", undefined, 0.8);
        }

        engine.registerPulseTimestamp(engine.getCurrentTime());
        const unitMs = ((60 / bpm) / 2) * (durationUnits / 2) * 1000;

        activeSubdivRef.current = (idx + 1) % meter.subdivisions.length;
        timerRef.current = window.setTimeout(playNextSubdiv, unitMs);
      };
      playNextSubdiv();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, bpm, meter, engine]);

  const handleTap = useCallback(() => {
    const result = engine.evaluateTap();
    setLastTapResult(result);
    if (result.rating === "perfect" || result.rating === "great") {
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
    }
    if (onTapResult) onTapResult(result);
  }, [engine, onTapResult]);

  return (
    <div className="space-y-6">
      {/* Top Bar: Selector & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-panel2 p-3.5 rounded-2xl border border-line">
        <div className="flex items-center gap-2">
          <Footprints className="w-4 h-4 text-accent" />
          <span className="text-xs font-mono font-semibold text-text-sub uppercase">
            {t("balkan_meter_label")}:
          </span>
          {BALKAN_METERS.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMeterId(m.id)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                selectedMeterId === m.id
                  ? "bg-accent text-black font-bold shadow-[0_0_10px_rgba(245,183,61,0.4)]"
                  : "bg-surface text-text-sub hover:text-text border border-line"
              }`}
            >
              {m.timeSignature} {isZh ? m.nameZh.split(" ")[1] : m.nameEn.split(" ")[1]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-text-sub">
            <span>BPM</span>
            <input
              type="range"
              min={90}
              max={180}
              value={bpm}
              onChange={(e) => {
                const b = Number(e.target.value);
                onBpmChange(b);
              }}
              className="w-20 accent-accent"
            />
            <span className="w-8 text-right font-bold text-accent">{bpm}</span>
          </div>

          <button
            onClick={handleTogglePlay}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all shadow-md ${
              isPlaying
                ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
                : "bg-accent text-black hover:bg-[#ffc65c] shadow-[0_0_12px_rgba(245,183,61,0.3)]"
            }`}
          >
            {isPlaying ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>{t("balkan_stop")}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{t("balkan_play")}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Asymmetric Proportional Blocks Visualizer */}
      <div className="p-6 rounded-3xl bg-[#0b0c10] border border-line space-y-6 shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-4">
          <div>
            <h4 className="text-base font-bold text-text flex items-center gap-2">
              <span>{isZh ? meter.nameZh : meter.nameEn}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-mono">
                {meter.region}
              </span>
            </h4>
            <p className="text-xs text-text-sub mt-1">
              {isZh ? meter.danceDescriptionZh : meter.danceDescriptionEn}
            </p>
          </div>

          <button
            onClick={handleTap}
            disabled={!isPlaying}
            className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-all flex items-center gap-2 ${
              isPlaying
                ? "bg-accent/20 border border-accent text-accent hover:bg-accent/30 active:scale-95 shadow-[0_0_15px_rgba(245,183,61,0.25)]"
                : "bg-surface border border-line text-text-dim cursor-not-allowed"
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{t("balkan_tap_btn")}</span>
            {streak > 0 && <span className="text-emerald-400 font-bold">({streak}x)</span>}
          </button>
        </div>

        {/* Mnemonic Pulse Banner */}
        <div className="p-4 rounded-2xl bg-panel flex items-center justify-between border border-line">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-text-dim uppercase">{t("balkan_mnemonic_label")}:</span>
            <span className="text-accent font-bold text-sm tracking-wider">
              {isZh ? meter.mnemonicZh : meter.mnemonicEn}
            </span>
          </div>
          <div className="text-xs font-mono text-text-dim">
            {meter.subdivisions.join(" + ")} = <span className="text-text font-bold">{totalUnits}</span>
          </div>
        </div>

        {/* Proportional Metric Blocks */}
        <div className="space-y-3">
          <div className="text-xs font-mono text-text-dim flex items-center justify-between">
            <span>{t("balkan_blocks_title")}</span>
            <span>{meter.timeSignature}</span>
          </div>

          <div className="flex items-center gap-3 w-full h-36">
            {meter.subdivisions.map((subdiv, idx) => {
              const isCurrent = activeSubdivIdx === idx;
              const isLong = subdiv === 3;
              const flexGrow = subdiv; // 2 or 3

              return (
                <div
                  key={idx}
                  style={{ flex: flexGrow }}
                  className={`h-full rounded-2xl border-2 p-4 flex flex-col justify-between transition-all select-none ${
                    isCurrent
                      ? "bg-accent/20 border-accent shadow-[0_0_24px_rgba(245,183,61,0.3)] scale-[1.02]"
                      : isLong
                      ? "bg-[#161a24] border-[#38bdf8]/40"
                      : "bg-[#11131a] border-line"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        isLong
                          ? "bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/30"
                          : "bg-surface text-text-sub border border-line"
                      }`}
                    >
                      {isLong ? t("balkan_long") : t("balkan_short")}
                    </span>
                    <span className="text-base font-extrabold font-mono text-text">
                      {subdiv}
                    </span>
                  </div>

                  {/* Visual Sub-division pulses */}
                  <div className="flex items-center justify-center gap-2">
                    {Array.from({ length: subdiv }).map((_, pulseIdx) => (
                      <div
                        key={pulseIdx}
                        className={`w-3 h-3 rounded-full transition-all ${
                          isCurrent
                            ? pulseIdx === 0
                              ? "bg-accent shadow-[0_0_10px_#f5b73d] scale-125"
                              : "bg-accent/50"
                            : "bg-[#252a38]"
                        }`}
                      />
                    ))}
                  </div>

                  <div className="text-center font-mono text-xs font-bold text-text-sub">
                    {idx === 0
                      ? t("balkan_davul")
                      : isLong
                      ? t("balkan_lift")
                      : t("balkan_step")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
