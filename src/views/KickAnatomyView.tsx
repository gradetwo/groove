import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLanguage } from "../i18n/LanguageContext";
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
import { Activity, Layers, Disc, Sparkles, Radio, Cpu, Network } from "lucide-react";

export const KickAnatomyView: React.FC = () => {
  const { isZh } = useLanguage();
  const engineRef = useRef<AnatomyKickEngine>(globalAnatomyKickEngine);
  const [params, setParams] = useState<SomaticKickParams>(() => engineRef.current.getParams());
  const [plv, setPlv] = useState<number>(() => engineRef.current.calculatePLV());
  const [lastHitTime, setLastHitTime] = useState<number>(0);
  const [visualMode, setVisualMode] = useState<"oscilloscope" | "waterfall">("oscilloscope");
  const [bpm, setBpm] = useState<number>(128);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(() => engineRef.current.getAnalyser());
  const [ecoBusOnline, setEcoBusOnline] = useState<boolean>(() => ecosystemBus.getIsOnline());

  // Initialize Web Audio context on user interaction if not ready
  const ensureAudioContext = useCallback(() => {
    let ctx = engineRef.current.getAudioContext();
    if (!ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AudioCtx();
      engineRef.current.init(ctx);
      setAnalyser(engineRef.current.getAnalyser());
    }
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
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
              ANALYZING THE KICK // SOMATIC LAB
            </span>
          </div>
          <span className="text-text-dim text-[10px] hidden sm:inline">|</span>
          <span className="text-[10px] text-text-sub hidden sm:inline">
            ONTOLOGY · ACOUSTICS · NEURO-PLV · TOUCHDESIGNER
          </span>
        </div>

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
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all border ${
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
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all border ${
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
    </div>
  );
};
