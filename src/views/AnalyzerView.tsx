import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  Activity,
  Radio,
  Play,
  Square,
  Sparkles,
  Waves,
  Volume2,
  Sliders,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";
import { MasterAnalyzerSuite } from "../components/analyzer/MasterAnalyzerSuite";
import {
  AnalyzerSignalGenerator,
  TestSignalType,
} from "../audio/AnalyzerSignalGenerator";
import { FREQUENCY_BANDS } from "../utils/audioAnalysis";
import { useLanguage } from "../i18n/LanguageContext";

interface AnalyzerViewProps {
  onOpenStudio?: () => void;
  onOpenHelp?: () => void;
  externalAnalyser?: AnalyserNode | null;
  externalAnalyserL?: AnalyserNode | null;
  externalAnalyserR?: AnalyserNode | null;
  isExternalPlaying?: boolean;
}

interface TestSignalConfig {
  type: TestSignalType;
  labelZh: string;
  labelEn: string;
  descZh: string;
  descEn: string;
  expectedZh: string;
  expectedEn: string;
  badge: string;
}

const TEST_SIGNALS: TestSignalConfig[] = [
  {
    type: "sweep",
    labelZh: "20Hz - 20kHz 全频扫频",
    labelEn: "20Hz - 20kHz Sine Sweep",
    descZh: "正弦波从 20Hz 极低频平滑对数滑移至 20kHz 超高空气频，检验全频段响应。",
    descEn: "Logarithmic sine sweep gliding from 20Hz sub-bass to 20kHz air, inspecting full response.",
    expectedZh: "瀑布流呈现一条清晰向上滑行的亮金斜线；李萨如示波器保持纯垂直线 (M 轴)。",
    expectedEn: "A bright ascending streak across the waterfall; Lissajous remains a vertical line on M axis.",
    badge: "FFT 线性度",
  },
  {
    type: "sub_808",
    labelZh: "808 极深低音 (Sub-Bass)",
    labelEn: "808 Sub-Bass Fundamental",
    descZh: "45Hz 超重基频与 90Hz、135Hz 微量二次与三次泛音，模拟标志性 808 震颤。",
    descEn: "45Hz fundamental with 90Hz & 135Hz harmonic overtones, modeling iconic 808 sub rumble.",
    expectedZh: "能量高度聚集在 20-60Hz Sub-Bass 区域，基频与泛音清晰分层，纯单声道居中。",
    expectedEn: "Energy tightly concentrated in 20-60Hz Sub-Bass band with clear overtone steps.",
    badge: "低频能量",
  },
  {
    type: "stereo_chorus",
    labelZh: "立体声合唱空间垫乐 (Chorus)",
    labelEn: "Stereo Chorus Pad",
    descZh: "双微走音锯齿波，左右声道 90° 相位正交调制，产生开阔的立体声铺底。",
    descEn: "Detuned dual saw waves with 90-degree orthogonal phase modulation producing wide stereo warmth.",
    expectedZh: "李萨如示波器展开为旋转膨胀的立体声云团 (r ≈ +0.40)，立体声宽约 40%-60%。",
    expectedEn: "Lissajous opens into an elliptical swirling cloud (r ≈ +0.40) with ~50% stereo width.",
    badge: "声场展开",
  },
  {
    type: "anti_phase",
    labelZh: "180° 反相信号 (Anti-Phase)",
    labelEn: "180° Anti-Phase Inverted",
    descZh: "左声道与右声道极性完全相反 (L = +Sine, R = -Sine)，声波在单声道下完全抵消消音！",
    descEn: "Left and Right in complete 180° polar inversion; complete cancellation when folded to mono!",
    expectedZh: "李萨如呈纯水平横线 (-S 轴)；相关系数跌入 -1.00，触发红色严重相位抵消警报！",
    expectedEn: "Lissajous renders a horizontal line (-S axis); correlation drops to -1.00 triggering alert!",
    badge: "相位预警",
  },
  {
    type: "pink_noise",
    labelZh: "粉红噪声 (1/f 听觉平衡)",
    labelEn: "Pink Noise (1/f Reference)",
    descZh: "每倍频程能量衰减 3dB，最符合人耳等响度曲线的黄金声学混音参考基准。",
    descEn: "Energy drops 3dB per octave, the acoustic reference matching human equal-loudness curves.",
    expectedZh: "在对数瀑布流中呈现完全平缓均匀的声学能量坡度，全频段均衡分布。",
    expectedEn: "Uniform, smooth energy distribution across logarithmic spectrum matching human hearing.",
    badge: "混音参考",
  },
  {
    type: "white_noise",
    labelZh: "白噪声 (全频等能)",
    labelEn: "White Noise (Flat Energy)",
    descZh: "在所有线性频率上具有相同能量密度的平坦随机噪声，高频能量较为突出。",
    descEn: "Stochastic flat noise with identical energy density per linear Hertz.",
    expectedZh: "高频段能量逐渐抬升（因对数坐标下高频频段跨度更宽），呈现上扬的能量坡度。",
    expectedEn: "Rising curve in high registers due to logarithmic octave bandwidth integration.",
    badge: "随机噪声",
  },
];

export const AnalyzerView: React.FC<AnalyzerViewProps> = ({
  onOpenStudio,
  onOpenHelp,
  externalAnalyser = null,
  externalAnalyserL = null,
  externalAnalyserR = null,
  isExternalPlaying = false,
}) => {
  const { t, isZh } = useLanguage();

  const generatorRef = useRef<AnalyzerSignalGenerator | null>(null);
  const [internalAnalyser, setInternalAnalyser] = useState<AnalyserNode | null>(null);
  const [internalAnalyserL, setInternalAnalyserL] = useState<AnalyserNode | null>(null);
  const [internalAnalyserR, setInternalAnalyserR] = useState<AnalyserNode | null>(null);

  const [activeSignal, setActiveSignal] = useState<TestSignalType | null>(null);
  const [isPlayingSignal, setIsPlayingSignal] = useState<boolean>(false);
  // Instrument-level selection: which built-in generator the power toggle starts.
  const [selectedSignal, setSelectedSignal] = useState<TestSignalType>(TEST_SIGNALS[0].type);

  // Initialize internal signal generator and local analysers
  useEffect(() => {
    const gen = new AnalyzerSignalGenerator();
    generatorRef.current = gen;

    const ctx = gen.getAudioContext();
    let mainAnalyser: AnalyserNode | null = null;
    let splitter: ChannelSplitterNode | null = null;
    let aL: AnalyserNode | null = null;
    let aR: AnalyserNode | null = null;

    if (typeof ctx.createAnalyser === "function") {
      mainAnalyser = ctx.createAnalyser();
      mainAnalyser.fftSize = 2048;
      mainAnalyser.smoothingTimeConstant = 0.8;
      gen.getOutputNode().connect(mainAnalyser);
      mainAnalyser.connect(ctx.destination);
    }

    if (typeof ctx.createChannelSplitter === "function" && typeof ctx.createAnalyser === "function") {
      try {
        splitter = ctx.createChannelSplitter(2);
        aL = ctx.createAnalyser();
        aL.fftSize = 1024;
        aR = ctx.createAnalyser();
        aR.fftSize = 1024;

        gen.getOutputNode().connect(splitter);
        splitter.connect(aL, 0);
        splitter.connect(aR, 1);
      } catch {}
    }

    setInternalAnalyser(mainAnalyser);
    setInternalAnalyserL(aL);
    setInternalAnalyserR(aR);

    return () => {
      gen.destroy();
      generatorRef.current = null;
    };
  }, []);

  const handleToggleSignal = (type: TestSignalType) => {
    const gen = generatorRef.current;
    if (!gen) return;

    if (activeSignal === type && isPlayingSignal) {
      gen.stop();
      setActiveSignal(null);
      setIsPlayingSignal(false);
    } else {
      gen.playSignal(type);
      setActiveSignal(type);
      setIsPlayingSignal(true);
      // Keep the instrument dropdown pointing at whatever is actually sounding.
      setSelectedSignal(type);
    }
  };

  const handleStopSignal = () => {
    if (generatorRef.current) {
      generatorRef.current.stop();
      setActiveSignal(null);
      setIsPlayingSignal(false);
    }
  };

  // Instrument-level power toggle: one shared generator instance drives both this
  // cluster and the legacy reference card grid further down the page.
  const handleInstrumentToggle = () => {
    const gen = generatorRef.current;
    if (!gen) return;

    if (isPlayingSignal) {
      gen.stop();
      setActiveSignal(null);
      setIsPlayingSignal(false);
    } else {
      gen.playSignal(selectedSignal);
      setActiveSignal(selectedSignal);
      setIsPlayingSignal(true);
    }
  };

  // Switching the dropdown while enabled re-voices the running generator.
  // playSignal() tears its own previous voice down, so there is no stop/start gap.
  const handleInstrumentSelect = (type: TestSignalType) => {
    setSelectedSignal(type);
    const gen = generatorRef.current;
    if (!gen || !isPlayingSignal) return;
    gen.playSignal(type);
    setActiveSignal(type);
  };

  const signalOptions = useMemo(
    () => TEST_SIGNALS.map((sig) => ({ type: sig.type, label: isZh ? sig.labelZh : sig.labelEn })),
    [isZh]
  );

  // Determine active analyser source:
  // If user is auditioning external studio beat, prioritize studio; else use local generator
  const isUsingExternal = Boolean(externalAnalyser && isExternalPlaying);
  const currentAnalyser = isUsingExternal ? externalAnalyser : internalAnalyser;
  const currentAnalyserL = isUsingExternal ? externalAnalyserL : internalAnalyserL;
  const currentAnalyserR = isUsingExternal ? externalAnalyserR : internalAnalyserR;
  const currentPlaying = isUsingExternal ? isExternalPlaying : isPlayingSignal;

  return (
    <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
      {/* Hero Header */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-panel2 via-panel to-panel2 p-5 sm:p-6 rounded-2xl border border-line shadow-xl">
        <div className="flex flex-col gap-1.5 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-accent font-['JetBrains_Mono'] text-xs font-bold">
              {t("analyzer_badge_workstation")}
            </span>
            <span className="text-text-dim text-xs font-['JetBrains_Mono']">
              Phase 6 · P6-05
            </span>
            {isUsingExternal && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-['JetBrains_Mono'] font-bold animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {t("analyzer_monitoring_studio")}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text tracking-tight font-['Space_Grotesk']">
            {t("analyzer_title")}
          </h1>
          <p className="text-sm text-text-sub leading-relaxed">
            {t("analyzer_page_desc")}
          </p>
        </div>

        {/* Action Buttons: Guide & Studio */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onOpenHelp && (
            <button
              type="button"
              data-testid="analyzer-help-button"
              onClick={onOpenHelp}
              title={t("analyzer_guide_btn")}
              className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-accent/40 bg-accent/10 text-accent font-semibold text-xs hover:bg-accent/20 transition-all shrink-0"
            >
              <BookOpen className="w-4 h-4 text-accent" />
              <span>{t("analyzer_guide_btn")}</span>
            </button>
          )}
          {onOpenStudio && (
            <button
              onClick={onOpenStudio}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-[#0a0b0d] font-bold text-sm hover:brightness-110 shadow-[0_0_16px_rgba(245,183,61,0.25)] transition-all shrink-0"
            >
              <span>{t("analyzer_open_studio_monitor")}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </section>

      {/* Main Real-time Visualizer Suite */}
      <section className="w-full">
        <MasterAnalyzerSuite
          analyser={currentAnalyser}
          analyserL={currentAnalyserL}
          analyserR={currentAnalyserR}
          isPlaying={currentPlaying}
          signalGenerator={{
            enabled: isPlayingSignal,
            selected: selectedSignal,
            options: signalOptions,
            onToggle: handleInstrumentToggle,
            onSelect: handleInstrumentSelect,
          }}
        />
      </section>

      {/* Built-in Acoustic Signal Generator Section */}
      <section className="flex flex-col gap-3 bg-panel p-5 rounded-2xl border border-line">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-accent" />
            <h2 className="font-bold text-base text-text">
              {t("analyzer_signal_gen_heading")}
            </h2>
            <span className="text-xs text-text-dim font-['JetBrains_Mono']">
              {t("analyzer_signal_gen_hint")}
            </span>
          </div>

          {isPlayingSignal && (
            <button
              onClick={handleStopSignal}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 font-['JetBrains_Mono'] text-xs font-bold hover:bg-red-500/25 transition-colors"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>{t("analyzer_stop_signal")}</span>
            </button>
          )}
        </div>

        {/* Signal Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {TEST_SIGNALS.map((sig) => {
            const isThisPlaying = isPlayingSignal && activeSignal === sig.type;
            return (
              <div
                key={sig.type}
                onClick={() => handleToggleSignal(sig.type)}
                className={`group cursor-pointer flex flex-col justify-between p-3.5 rounded-xl border transition-all ${
                  isThisPlaying
                    ? "bg-accent/10 border-accent shadow-[0_0_16px_rgba(245,183,61,0.2)]"
                    : "bg-[#10121a] border-line hover:border-line-active hover:bg-[#141722]"
                }`}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold bg-white/5 text-text-sub border border-white/5">
                      {sig.badge}
                    </span>
                    <button
                      type="button"
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                        isThisPlaying
                          ? "bg-accent text-[#0a0b0d]"
                          : "bg-panel2 text-text-sub group-hover:text-accent"
                      }`}
                    >
                      {isThisPlaying ? (
                        <Square className="w-2.5 h-2.5 fill-current" />
                      ) : (
                        <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                      )}
                    </button>
                  </div>

                  <h3 className="font-bold text-sm text-text group-hover:text-accent transition-colors">
                    {isZh ? sig.labelZh : sig.labelEn}
                  </h3>

                  <p className="text-xs text-text-sub leading-relaxed">
                    {isZh ? sig.descZh : sig.descEn}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-white/5 flex items-start gap-1.5 text-[11px] text-text-dim">
                  <span className="text-accent font-bold shrink-0">
                    {t("analyzer_observation_label")}
                  </span>
                  <span className="leading-normal">
                    {isZh ? sig.expectedZh : sig.expectedEn}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Acoustic Theory & Engineering Dossier Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Fourier FFT Mechanics */}
        <div className="flex flex-col gap-2.5 bg-panel p-5 rounded-2xl border border-line">
          <div className="flex items-center gap-2 text-accent font-bold text-sm">
            <Radio className="w-4 h-4" />
            <h3>{t("analyzer_card_fft_title")}</h3>
          </div>
          <p className="text-xs text-text-sub leading-relaxed">
            {t("analyzer_card_fft_desc")}
          </p>
          <div className="bg-[#0f1118] p-3 rounded-lg border border-white/5 text-[11px] font-['JetBrains_Mono'] text-text-dim">
            <code>f(x) = f_min · (f_max / f_min)^(x / width) · 20Hz ~ 20kHz</code>
          </div>
        </div>

        {/* Card 2: Lissajous & Stereo Phase Scope */}
        <div className="flex flex-col gap-2.5 bg-panel p-5 rounded-2xl border border-line">
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
            <Waves className="w-4 h-4" />
            <h3>{t("analyzer_card_lissajous_title")}</h3>
          </div>
          <p className="text-xs text-text-sub leading-relaxed">
            {t("analyzer_card_lissajous_desc")}
          </p>
          <div className="bg-[#0f1118] p-3 rounded-lg border border-white/5 text-[11px] font-['JetBrains_Mono'] text-text-dim">
            <code>Mid = (L + R) / √2 (垂直轴) | Side = (L - R) / √2 (水平轴)</code>
          </div>
        </div>

        {/* Card 3: Phase Correlation & Mono Compatibility */}
        <div className="flex flex-col gap-2.5 bg-panel p-5 rounded-2xl border border-line">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <AlertTriangle className="w-4 h-4" />
            <h3>{t("analyzer_card_phase_title")}</h3>
          </div>
          <p className="text-xs text-text-sub leading-relaxed">
            {t("analyzer_card_phase_desc")}
          </p>
          <div className="flex items-center gap-2 text-[11px] font-['JetBrains_Mono']">
            <span className="text-red-400 font-bold">r &lt; 0: 严重抵消</span>
            <span className="text-cyan-400 font-bold">0 ≤ r &lt; 0.5: 宽成立体声</span>
            <span className="text-emerald-400 font-bold">r ≥ 0.5: 安全单声道</span>
          </div>
        </div>

        {/* Card 4: 7 Frequency Bands */}
        <div className="flex flex-col gap-2.5 bg-panel p-5 rounded-2xl border border-line">
          <div className="flex items-center gap-2 text-fuchsia-400 font-bold text-sm">
            <Sliders className="w-4 h-4" />
            <h3>{t("analyzer_card_bands_title")}</h3>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px] font-['JetBrains_Mono']">
            {FREQUENCY_BANDS.slice(0, 6).map((b) => (
              <div key={b.bandId} className="flex items-center gap-1.5 text-text-sub">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }} />
                <span className="font-bold text-text">{b.nameEn}:</span>
                <span className="text-text-dim text-[10px]">{b.rangeZh}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-sub leading-relaxed mt-1">
            {t("analyzer_card_bands_desc")}
          </p>
        </div>
      </section>
    </main>
  );
};
