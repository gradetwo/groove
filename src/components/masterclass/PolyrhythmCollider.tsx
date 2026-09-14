import React, { useState, useEffect, useRef, useCallback } from "react";
import { MasterclassAudioEngine, TapAccuracyResult } from "../../audio/MasterclassAudioEngine";
import { Play, Square, Zap, Volume2, Sparkles, Award } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

interface PolyrhythmColliderProps {
  engine: MasterclassAudioEngine;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  onTapResult?: (result: TapAccuracyResult) => void;
}

export const PolyrhythmCollider: React.FC<PolyrhythmColliderProps> = ({
  engine,
  bpm,
  onBpmChange,
  onTapResult,
}) => {
  const { t } = useLanguage();
  const [ratioA, setRatioA] = useState(4);
  const [ratioB, setRatioB] = useState(3);
  const [soundA] = useState<"kick" | "davul">("kick");
  const [soundB] = useState<"woodblock" | "bell">("woodblock");
  const [isPlaying, setIsPlaying] = useState(false);
  const [volA, setVolA] = useState(0.85);
  const [volB, setVolB] = useState(0.85);

  // Tap stats
  const [lastTapResult, setLastTapResult] = useState<TapAccuracyResult | null>(null);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Animation states
  const [animAngles, setAnimAngles] = useState({ angleA: 0, angleB: 0 });
  const [activeNodeA, setActiveNodeA] = useState<number | null>(null);
  const [activeNodeB, setActiveNodeB] = useState<number | null>(null);
  const [collisionFlash, setCollisionFlash] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Cycle duration in seconds for 1 complete polyrhythm measure:
  const cycleDuration = (60.0 / bpm) * 4;

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      engine.stop();
      setIsPlaying(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setAnimAngles({ angleA: 0, angleB: 0 });
    } else {
      engine.setBpm(bpm);
      engine.start();
      setIsPlaying(true);
      startTimeRef.current = performance.now() / 1000;
    }
  }, [engine, isPlaying, bpm]);

  // Handle animation loop and scheduling
  useEffect(() => {
    if (!isPlaying) return;

    let lastHitTimeA = -1;
    let lastHitTimeB = -1;

    const loop = () => {
      if (!isPlaying) return;
      const now = performance.now() / 1000;
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const progress = (elapsed % cycleDuration) / cycleDuration;

      // Rotation angles in radians
      const angleA = progress * 2 * Math.PI;
      const angleB = progress * 2 * Math.PI;
      setAnimAngles({ angleA, angleB });

      // Step check for Voice A
      const stepIndexA = Math.floor(progress * ratioA);
      if (stepIndexA !== lastHitTimeA) {
        lastHitTimeA = stepIndexA;
        setActiveNodeA(stepIndexA);
        const isCollision = stepIndexA === 0 && (lastHitTimeB === 0 || progress < 0.05);
        if (isCollision) {
          engine.triggerSound("collision", undefined, Math.max(volA, volB));
          setCollisionFlash(true);
          setTimeout(() => setCollisionFlash(false), 200);
          engine.registerPulseTimestamp(engine.getCurrentTime());
        } else {
          engine.triggerSound(soundA, undefined, volA);
        }
        setTimeout(() => setActiveNodeA(null), 120);
      }

      // Step check for Voice B
      const stepIndexB = Math.floor(progress * ratioB);
      if (stepIndexB !== lastHitTimeB) {
        lastHitTimeB = stepIndexB;
        setActiveNodeB(stepIndexB);
        const isCollision = stepIndexB === 0 && lastHitTimeA === 0;
        if (!isCollision) {
          engine.triggerSound(soundB, undefined, volB);
        }
        setTimeout(() => setActiveNodeB(null), 120);
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, cycleDuration, ratioA, ratioB, soundA, soundB, volA, volB, engine]);

  // Tap evaluation
  const handleTap = useCallback(() => {
    const result = engine.evaluateTap();
    setLastTapResult(result);
    if (result.rating === "perfect" || result.rating === "great") {
      setStreak((prev) => {
        const next = prev + 1;
        setBestStreak((b) => Math.max(b, next));
        return next;
      });
    } else {
      setStreak(0);
    }
    if (onTapResult) {
      onTapResult(result);
    }
  }, [engine, onTapResult]);

  // Keyboard shortcut Space for tapping when playing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && isPlaying) {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA" && target.tagName !== "BUTTON") {
          e.preventDefault();
          handleTap();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, handleTap]);

  // Geometry calculations for dual rings
  const center = 160;
  const radiusA = 110; // Outer ring (Ratio A)
  const radiusB = 68;  // Inner ring (Ratio B)

  const nodesA = Array.from({ length: ratioA }).map((_, i) => {
    const theta = (i / ratioA) * 2 * Math.PI - Math.PI / 2;
    return {
      index: i,
      x: center + radiusA * Math.cos(theta),
      y: center + radiusA * Math.sin(theta),
    };
  });

  const nodesB = Array.from({ length: ratioB }).map((_, i) => {
    const theta = (i / ratioB) * 2 * Math.PI - Math.PI / 2;
    return {
      index: i,
      x: center + radiusB * Math.cos(theta),
      y: center + radiusB * Math.sin(theta),
    };
  });

  // Scanner needle endpoints
  const needleAX = center + radiusA * Math.cos(animAngles.angleA - Math.PI / 2);
  const needleAY = center + radiusA * Math.sin(animAngles.angleA - Math.PI / 2);
  const needleBX = center + radiusB * Math.cos(animAngles.angleB - Math.PI / 2);
  const needleBY = center + radiusB * Math.sin(animAngles.angleB - Math.PI / 2);

  return (
    <div className="space-y-6">
      {/* Ratio Selector & Presets */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-panel2 p-3.5 rounded-2xl border border-line">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold text-text-sub uppercase">
            {t("poly_ratios_label")}:
          </span>
          {[
            { a: 4, b: 3, label: "4:3 (Spinach)" },
            { a: 3, b: 4, label: "3:4 (Butter)" },
            { a: 5, b: 4, label: "5:4 (Tea)" },
            { a: 2, b: 3, label: "2:3 (Hemiola)" },
          ].map((preset) => (
            <button
              key={`${preset.a}_${preset.b}`}
              onClick={() => {
                setRatioA(preset.a);
                setRatioB(preset.b);
              }}
              className={`px-2.5 py-1 text-xs rounded-lg font-mono font-medium transition-colors ${
                ratioA === preset.a && ratioB === preset.b
                  ? "bg-accent text-black font-bold shadow-[0_0_10px_rgba(245,183,61,0.4)]"
                  : "bg-surface text-text-sub hover:text-text border border-line"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Play/Stop & BPM */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-text-sub">
            <span>BPM</span>
            <input
              type="range"
              min={60}
              max={180}
              value={bpm}
              onChange={(e) => {
                const b = Number(e.target.value);
                onBpmChange(b);
                engine.setBpm(b);
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
                <span>{t("poly_stop")}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{t("poly_start")}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Dual-Ring SVG Display & Tap Pad Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Visualizer Canvas */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center p-6 rounded-3xl bg-[#0b0c10] border border-line relative overflow-hidden shadow-2xl">
          {/* Collision Flash Halo */}
          <div
            className={`absolute inset-0 bg-accent/20 pointer-events-none transition-opacity duration-200 ${
              collisionFlash ? "opacity-100" : "opacity-0"
            }`}
          />

          <svg
            viewBox="0 0 320 320"
            className="w-full max-w-[340px] aspect-square select-none overflow-visible"
          >
            <defs>
              <radialGradient id="ringGlowA" cx="50%" cy="50%" r="50%">
                <stop offset="70%" stopColor="#f5b73d" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#f5b73d" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="ringGlowB" cx="50%" cy="50%" r="50%">
                <stop offset="70%" stopColor="#45e0c9" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#45e0c9" stopOpacity="0" />
              </radialGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Background concentric guide circles */}
            <circle
              cx={center}
              cy={center}
              r={radiusA}
              fill="none"
              stroke="#222530"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
            <circle
              cx={center}
              cy={center}
              r={radiusB}
              fill="none"
              stroke="#222530"
              strokeWidth="2"
              strokeDasharray="4 4"
            />

            {/* Central hub */}
            <circle
              cx={center}
              cy={center}
              r={16}
              fill="#141720"
              stroke={collisionFlash ? "#f5b73d" : "#323746"}
              strokeWidth="2"
            />
            <circle
              cx={center}
              cy={center}
              r={collisionFlash ? 8 : 4}
              fill={collisionFlash ? "#f5b73d" : "#8b8f99"}
              className="transition-all"
            />

            {/* Scanner Arms */}
            {isPlaying && (
              <>
                <line
                  x1={center}
                  y1={center}
                  x2={needleAX}
                  y2={needleAY}
                  stroke="#f5b73d"
                  strokeWidth="2"
                  opacity={0.8}
                  filter="url(#glow)"
                />
                <line
                  x1={center}
                  y1={center}
                  x2={needleBX}
                  y2={needleBY}
                  stroke="#45e0c9"
                  strokeWidth="2"
                  opacity={0.8}
                  filter="url(#glow)"
                />
              </>
            )}

            {/* Ring A Nodes (Outer Ring - Amber) */}
            {nodesA.map((node) => {
              const isActive = activeNodeA === node.index;
              const isConvergence = node.index === 0;
              return (
                <g key={`nodeA-${node.index}`}>
                  {isActive && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={18}
                      fill="url(#ringGlowA)"
                      className="animate-ping"
                    />
                  )}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isConvergence ? 10 : 8}
                    fill={isActive ? "#fff" : isConvergence ? "#f5b73d" : "#1a1d26"}
                    stroke="#f5b73d"
                    strokeWidth={isConvergence ? 3 : 2}
                    filter={isActive ? "url(#glow)" : undefined}
                    className="transition-transform duration-75"
                  />
                  <text
                    x={node.x}
                    y={node.y + 3}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="bold"
                    fill={isActive ? "#000" : isConvergence ? "#000" : "#f5b73d"}
                  >
                    {node.index + 1}
                  </text>
                </g>
              );
            })}

            {/* Ring B Nodes (Inner Ring - Cyan) */}
            {nodesB.map((node) => {
              const isActive = activeNodeB === node.index;
              const isConvergence = node.index === 0;
              return (
                <g key={`nodeB-${node.index}`}>
                  {isActive && (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={14}
                      fill="url(#ringGlowB)"
                      className="animate-ping"
                    />
                  )}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isConvergence ? 9 : 7}
                    fill={isActive ? "#fff" : isConvergence ? "#45e0c9" : "#141720"}
                    stroke="#45e0c9"
                    strokeWidth={isConvergence ? 2.5 : 2}
                    filter={isActive ? "url(#glow)" : undefined}
                  />
                  <text
                    x={node.x}
                    y={node.y + 3}
                    textAnchor="middle"
                    fontSize="8"
                    fontWeight="bold"
                    fill={isActive ? "#000" : isConvergence ? "#000" : "#45e0c9"}
                  >
                    {node.index + 1}
                  </text>
                </g>
              );
            })}

            {/* Top Convergence Marker Flag */}
            <path
              d={`M ${center - 6} 20 L ${center + 6} 20 L ${center} 28 Z`}
              fill="#f5b73d"
              opacity={collisionFlash ? 1 : 0.4}
            />
          </svg>

          {/* Voice Volume Sliders */}
          <div className="w-full flex items-center justify-around gap-4 mt-4 pt-4 border-t border-line/60">
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="w-2.5 h-2.5 rounded-full bg-accent inline-block" />
              <span className="text-text-sub">{t("poly_voice_a", { ratioA })}</span>
              <Volume2 className="w-3.5 h-3.5 text-text-dim" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volA}
                onChange={(e) => setVolA(Number(e.target.value))}
                className="w-16 accent-accent"
              />
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="w-2.5 h-2.5 rounded-full bg-[#45e0c9] inline-block" />
              <span className="text-text-sub">{t("poly_voice_b", { ratioB })}</span>
              <Volume2 className="w-3.5 h-3.5 text-text-dim" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volB}
                onChange={(e) => setVolB(Number(e.target.value))}
                className="w-16 accent-[#45e0c9]"
              />
            </div>
          </div>
        </div>

        {/* Tap-Along Precision Challenge Pad */}
        <div className="lg:col-span-5 flex flex-col gap-4 bg-panel p-6 rounded-3xl border border-line shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-accent text-sm font-bold">
              <Zap className="w-4 h-4" />
              <span>{t("poly_tap_title")}</span>
            </div>
            {streak > 0 && (
              <div className="flex items-center gap-1 text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30">
                <Sparkles className="w-3 h-3" />
                <span>{streak}x {t("poly_streak")}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-text-sub leading-relaxed">
            {t("poly_tap_desc")}
          </p>

          {/* Interactive Giant Tap Pad */}
          <button
            onClick={handleTap}
            disabled={!isPlaying}
            data-testid="tap-sync-pad"
            className={`w-full py-8 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 select-none transition-all active:scale-95 ${
              !isPlaying
                ? "border-line bg-surface/50 text-text-dim cursor-not-allowed"
                : lastTapResult?.rating === "perfect"
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-300 shadow-[0_0_24px_rgba(52,211,153,0.3)]"
                : lastTapResult?.rating === "great"
                ? "border-cyan-400 bg-cyan-500/20 text-cyan-300 shadow-[0_0_20px_rgba(69,224,201,0.25)]"
                : lastTapResult?.rating === "good"
                ? "border-amber-400 bg-amber-500/20 text-amber-300"
                : "border-accent/40 bg-accent/10 text-text hover:border-accent hover:bg-accent/20"
            }`}
          >
            <Zap className="w-6 h-6 animate-pulse text-accent" />
            <span className="text-base font-bold font-mono tracking-wide">
              {t("poly_tap_btn")}
            </span>
            <span className="text-[11px] font-mono text-text-sub">
              {isPlaying ? t("poly_tap_ready") : t("poly_tap_disabled")}
            </span>
          </button>

          {/* Precision Feedback Card */}
          {lastTapResult && (
            <div className="p-3.5 rounded-xl bg-surface border border-line flex items-center justify-between text-xs font-mono">
              <div>
                <div className="text-text-dim uppercase text-[10px]">{t("poly_rating")}</div>
                <div
                  className={`text-sm font-bold uppercase tracking-wider ${
                    lastTapResult.rating === "perfect"
                      ? "text-emerald-400"
                      : lastTapResult.rating === "great"
                      ? "text-cyan-400"
                      : lastTapResult.rating === "good"
                      ? "text-amber-400"
                      : "text-rose-400"
                  }`}
                >
                  {lastTapResult.rating === "perfect"
                    ? t("poly_rating_perfect")
                    : lastTapResult.rating === "great"
                    ? t("poly_rating_great")
                    : lastTapResult.rating === "good"
                    ? t("poly_rating_good")
                    : t("poly_rating_miss")}
                </div>
              </div>

              <div className="text-right">
                <div className="text-text-dim uppercase text-[10px]">{t("poly_delta_offset")}</div>
                <div className="text-sm font-bold text-text">
                  {lastTapResult.offsetMs > 0 ? `+${lastTapResult.offsetMs}` : lastTapResult.offsetMs} ms
                </div>
              </div>

              <div className="text-right">
                <div className="text-text-dim uppercase text-[10px]">{t("poly_best_streak")}</div>
                <div className="text-sm font-bold text-accent flex items-center gap-1 justify-end">
                  <Award className="w-3.5 h-3.5" />
                  <span>{bestStreak}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
