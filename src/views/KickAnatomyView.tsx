import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { useDeviceCapabilities } from "../hooks/useDeviceCapabilities";
import { 
  AnatomyKickEngine, 
  globalAnatomyKickEngine, 
  SomaticKickParams, 
  DEFAULT_SOMATIC_PARAMS 
} from "../audio/AnatomyKickEngine";
import { ecosystemBus } from "../audio/ecosystemBus";
import { PhosphorOscilloscope } from "../components/kick/PhosphorOscilloscope";
import { WaterfallSpectrogram } from "../components/kick/WaterfallSpectrogram";
import { GravitationalSequencer } from "../components/kick/GravitationalSequencer";
import { SomaticControls } from "../components/kick/SomaticControls";
import { KickPhilosophyDossier } from "../components/kick/KickPhilosophyDossier";
import { Activity, Layers, Disc, Sparkles, Radio, Cpu, Network, ExternalLink, BookOpen, ArrowLeft } from "lucide-react";

export interface KickAnatomyViewProps {
  onOpenHelp?: () => void;
  onOpenStudio?: () => void;
}

export const KickAnatomyView: React.FC<KickAnatomyViewProps> = ({
  onOpenHelp,
  onOpenStudio,
}) => {
  const { t, isZh } = useLanguage();
  /** Phone surface: measured at 390×664 the header buttons were 24–26 px tall and the mode buttons 26 px. */
  const { isMobile } = useDeviceCapabilities();
  const engineRef = useRef<AnatomyKickEngine>(globalAnatomyKickEngine);
  const [params, setParams] = useState<SomaticKickParams>(() => engineRef.current.getParams());
  const [plv, setPlv] = useState<number>(() => engineRef.current.calculatePLV());
  const [lastHitTime, setLastHitTime] = useState<number>(0);
  const [visualMode, setVisualMode] = useState<"oscilloscope" | "waterfall">("oscilloscope");
  const [bpm, setBpm] = useState<number>(128);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(() => engineRef.current.getAnalyser());
  const [ecoBusOnline, setEcoBusOnline] = useState<boolean>(() => ecosystemBus.getIsOnline());

  // Initialize Web Audio context on user interaction if not ready. Delegates to the
  // engine so every entry point (this view, the gravitational sequencer transport,
  // hotkeys and any future caller) goes through one implementation.
  const ensureAudioContext = useCallback(() => {
    engineRef.current.ensureContext();
    setAnalyser(engineRef.current.getAnalyser());
  }, []);

  // Subscribe to transient events for kinetic shock
  useEffect(() => {
    const unsub = engineRef.current.onTransientHit((_layer, _vel, newPlv) => {
      setLastHitTime(performance.now());
      setPlv(newPlv);
    });

    // Listen to ecosystem bus
    const unsubBus = ecosystemBus.subscribe((msg) => {
      if (msg.type === "CLOCK_SYNC") {
        setBpm(msg.bpm);
      }
    });

    return () => {
      unsub();
      unsubBus();
    };
  }, []);

  // Update params in engine and local state
  const handleParamsChange = useCallback((newParams: Partial<SomaticKickParams>) => {
    engineRef.current.setParams(newParams);
    setParams(engineRef.current.getParams());
    setPlv(engineRef.current.calculatePLV());
  }, []);

  // Manual trigger
  const handleTrigger = useCallback(() => {
    ensureAudioContext();
    engineRef.current.trigger();
  }, [ensureAudioContext]);

  // Global hotkey: Space bar triggers kick when not in input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        handleTrigger();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTrigger]);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 font-mono selection:bg-[#f5b73d]/30 selection:text-[#f5b73d]">
      {/* Top Telemetry & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 mb-6 bg-[#07090e] border border-line/60 rounded-lg text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f5b73d] shadow-[0_0_8px_#f5b73d] animate-pulse" />
            <span className="font-bold text-text uppercase">
              {isZh ? "底鼓设计 // 躯体声学实验室" : "KICK DESIGN // SOMATIC ACOUSTIC LAB"}
            </span>
          </div>
          <span className="text-text-dim text-[10px] hidden sm:inline">|</span>
          <span className="text-[10px] text-text-sub hidden sm:inline">
            ONTOLOGY · ACOUSTICS · NEURO-PLV · TOUCHDESIGNER
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-4 text-[10px] text-text-dim">
            <div className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-[#f5b73d]" />
              <span>PLV:</span>
              <span className="text-[#f5b73d] font-bold">{plv.toFixed(3)}</span>
            </div>

            <div className="flex items-center gap-1">
              <Network className="w-3 h-3 text-emerald-400" />
              <span>ECOSYSTEM:</span>
              <span className={ecoBusOnline ? "text-emerald-400 font-bold" : "text-text-dim"}>
                {ecoBusOnline ? "BUS ACTIVE" : "LOCAL"}
              </span>
            </div>

            <div className="hidden md:flex items-center gap-1">
              <span>RES: 48kHz / 32-FLOAT</span>
            </div>
          </div>

          {(onOpenHelp || onOpenStudio) && (
            <div className="flex items-center gap-2 border-l border-line/40 pl-3">
              {onOpenHelp && (
                <button
                  type="button"
                  data-testid="kick-help-button"
                  onClick={onOpenHelp}
                  title={t("kick_guide_btn")}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#f5b73d]/40 bg-[#f5b73d]/10 text-[#f5b73d] font-semibold text-xs hover:bg-[#f5b73d]/20 transition-all shrink-0 ${isMobile ? "min-h-11" : ""}`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-[#f5b73d]" />
                  <span>{t("kick_guide_btn")}</span>
                </button>
              )}
              {onOpenStudio && (
                <button
                  type="button"
                  data-testid="kick-studio-button"
                  onClick={onOpenStudio}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#f5b73d] text-zinc-950 font-bold text-xs hover:brightness-110 shadow-[0_0_12px_rgba(245,183,61,0.25)] transition-all shrink-0 ${isMobile ? "min-h-11" : ""}`}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{isZh ? "返回工作台" : "Return to Studio"}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Workbench Layout: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Visualizers & Gravitational Sequencer (7 Cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Visualizer Container with Mode Switcher */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setVisualMode("oscilloscope")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all border ${isMobile ? "min-h-11" : ""} ${
                    visualMode === "oscilloscope"
                      ? "bg-[#f5b73d]/15 text-[#f5b73d] border-[#f5b73d] shadow-[0_0_8px_rgba(245,183,61,0.2)]"
                      : "bg-[#0d1017] text-text-sub border-line/40 hover:bg-[#141924]"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>CRT OSCILLOSCOPE</span>
                </button>

                <button
                  onClick={() => setVisualMode("waterfall")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all border ${isMobile ? "min-h-11" : ""} ${
                    visualMode === "waterfall"
                      ? "bg-[#f5b73d]/15 text-[#f5b73d] border-[#f5b73d] shadow-[0_0_8px_rgba(245,183,61,0.2)]"
                      : "bg-[#0d1017] text-text-sub border-line/40 hover:bg-[#141924]"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>WATERFALL FFT</span>
                </button>
              </div>

              <span className="text-[10px] text-text-dim hidden sm:inline">
                ACOUSTIC TRANSIENT PROJECTION
              </span>
            </div>

            {/* Selected Visualizer */}
            {visualMode === "oscilloscope" ? (
              <PhosphorOscilloscope
                analyser={analyser}
                plv={plv}
                lastHitTime={lastHitTime}
              />
            ) : (
              <WaterfallSpectrogram
                analyser={analyser}
                lastHitTime={lastHitTime}
              />
            )}
          </div>

          {/* Gravitational Sequencer */}
          <GravitationalSequencer
            engine={engineRef.current}
            bpm={bpm}
            onBpmChange={setBpm}
            onEnsureAudio={ensureAudioContext}
          />
        </div>

        {/* Right Column: Somatic Parameters & Layer Strips (5 Cols) */}
        <div className="lg:col-span-5 space-y-5">
          <SomaticControls
            engine={engineRef.current}
            params={params}
            onParamsChange={handleParamsChange}
            onTriggerKick={handleTrigger}
            isZh={isZh}
          />
        </div>
      </div>

      {/* Bottom Full-Width Section: Philosophical & Anatomical Dossier */}
      <div className="mt-8">
        <KickPhilosophyDossier isZh={isZh} />
      </div>

      {/* Tribute & Philosophical Attribution Footer */}
      <div className="mt-8 p-6 rounded-2xl bg-gradient-to-br from-[#090b12] to-[#121622] border border-[#f5b73d]/30 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#f5b73d]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#f5b73d]/20 text-[#f5b73d] border border-[#f5b73d]/40">
                TRIBUTE & INSPIRATION
              </span>
              <h3 className="text-base sm:text-lg font-bold text-text flex items-center gap-2">
                {isZh ? "特别致敬：声学解剖与身体现象学探索" : "Special Tribute: Acoustic Anatomy & Bodily Phenomenology"}
              </h3>
            </div>
            <p className="text-xs text-text-sub max-w-3xl leading-relaxed">
              {isZh
                ? "本项目「底鼓设计」中的三层身体解剖（次低频 Sub、肌肉打击 Thump、神经时钟 Click）、听觉脑干锁相值（PLV）测量、微瞬态微雕以及极简示波器视觉交互哲学，深度启发自艺术家与声音哲学家 Bahadırhan Koçer 的经典研究视频《Analyzing The Kick》。特向作者致敬！"
                : "The 3-layer somatic decomposition (Visceral Sub, Muscular Thump, Neural Click), auditory brainstem phase-locking value (PLV) metrics, and CRT phosphor visual aesthetic in this kick design lab are deeply inspired by the groundbreaking acoustic research video 'Analyzing The Kick' by Bahadırhan Koçer. Special thanks and tribute to the author!"}
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
              <div className="flex items-center gap-1.5 text-text-dim">
                <span>{isZh ? "原作者" : "Author"}:</span>
                <span className="font-bold text-text">Bahadırhan Koçer</span>
              </div>
              <div className="flex items-center gap-1.5 text-text-dim">
                <span>YouTube ID:</span>
                <a
                  href="https://www.youtube.com/@Bahadirhankocer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[#f5b73d] hover:underline flex items-center gap-1"
                >
                  <span>Bahadirhankocer</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href="https://www.youtube.com/watch?v=mTGI15msfrE"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600/90 hover:bg-red-600 text-white text-xs font-bold transition-all shadow-md hover:shadow-red-600/30"
            >
              <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
              <span>{isZh ? "观看原版视频" : "Watch Video"}</span>
            </a>
            <a
              href="https://www.youtube.com/@Bahadirhankocer"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1c202d] hover:bg-[#252b3d] border border-line text-text text-xs font-bold transition-all"
            >
              <span>{isZh ? "访问频道" : "Channel"}</span>
              <ExternalLink className="w-3.5 h-3.5 text-text-dim" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
