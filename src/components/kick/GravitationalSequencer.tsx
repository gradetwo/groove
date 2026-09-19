import React, { useEffect, useRef, useState, useCallback } from "react";
import { Play, Square, FastForward, Heart, Footprints, Flame, Clock } from "lucide-react";
import { AnatomyKickEngine } from "../../audio/AnatomyKickEngine";
import { ecosystemBus } from "../../audio/ecosystemBus";

interface StepConfig {
  active: boolean;
  velocity: number;
  microtiming: number; // -50ms to +50ms
}

interface GravitationalSequencerProps {
  engine: AnatomyKickEngine;
  /**
   * Called before the transport starts so the caller can create/resume the
   * AudioContext inside the user gesture. Without it, INITIATE PULSE ran the step
   * scheduler against a null context and produced no sound until some other control
   * had initialised audio.
   */
  onEnsureAudio?: () => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  className?: string;
}

export const GravitationalSequencer: React.FC<GravitationalSequencerProps> = ({
  engine,
  onEnsureAudio,
  bpm,
  onBpmChange,
  className = "",
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // 16-step default four-on-the-floor pattern (steps 0, 4, 8, 12)
  const [steps, setSteps] = useState<StepConfig[]>([
    { active: true, velocity: 1.0, microtiming: 0 },
    { active: false, velocity: 0.8, microtiming: 0 },
    { active: false, velocity: 0.8, microtiming: 0 },
    { active: false, velocity: 0.8, microtiming: 0 },
    { active: true, velocity: 0.9, microtiming: 0 },
    { active: false, velocity: 0.8, microtiming: 0 },
    { active: false, velocity: 0.8, microtiming: 0 },
    { active: false, velocity: 0.8, microtiming: 0 },
    { active: true, velocity: 0.95, microtiming: 0 },
    { active: false, velocity: 0.8, microtiming: 0 },
    { active: false, velocity: 0.8, microtiming: 0 },
    { active: false, velocity: 0.8, microtiming: 0 },
    { active: true, velocity: 0.9, microtiming: 0 },
    { active: false, velocity: 0.8, microtiming: 0 },
    { active: false, velocity: 0.8, microtiming: 0 },
    { active: false, velocity: 0.8, microtiming: 0 },
  ]);

  const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(0);
  const rippleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ripplesRef = useRef<{ x: number; y: number; radius: number; maxRadius: number; alpha: number; color: string }[]>([]);

  // Sound play scheduler
  const timerRef = useRef<number | null>(null);
  const currentStepRef = useRef(0);
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  // Add ripple shockwave
  const triggerRipple = useCallback((stepIdx: number, vel: number) => {
    const canvas = rippleCanvasRef.current;
    if (!canvas) return;
    const width = canvas.width;
    const stepX = ((stepIdx + 0.5) / 16) * width;
    const p = engine.getParams();
    const maxR = 60 + p.boomToWhere * 120;
    const color = p.grit > 0.6 ? "#ff5555" : "#f5b73d";

    ripplesRef.current.push({
      x: stepX,
      y: canvas.height / 2,
      radius: 4,
      maxRadius: maxR * vel,
      alpha: 1.0,
      color,
    });
  }, [engine]);

  // Tick scheduler
  const stepDurationMs = (60 / bpm) / 4 * 1000;

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const interval = (60 / bpmRef.current) / 4 * 1000;
    timerRef.current = window.setInterval(() => {
      const stepIdx = (currentStepRef.current + 1) % 16;
      currentStepRef.current = stepIdx;
      setCurrentStep(stepIdx);

      const step = stepsRef.current[stepIdx];
      if (step && step.active) {
        // Microtiming delay in ms
        const delay = Math.max(0, step.microtiming);
        if (delay === 0) {
          engine.trigger(undefined, step.velocity);
          triggerRipple(stepIdx, step.velocity);
        } else {
          setTimeout(() => {
            engine.trigger(undefined, step.velocity);
            triggerRipple(stepIdx, step.velocity);
          }, delay);
        }
      }

      // Sync with ecosystem bus
      ecosystemBus.publishClockSync(bpmRef.current, true, stepIdx, Math.floor(stepIdx / 16) + 1);
    }, interval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying, bpm, engine, triggerRipple]);

  // Canvas ripple animation loop
  useEffect(() => {
    let animId: number;
    const canvas = rippleCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      animId = requestAnimationFrame(render);
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Render expanding ripples
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const rip = ripplesRef.current[i];
        rip.radius += 2.5;
        rip.alpha *= 0.94;

        ctx.save();
        ctx.strokeStyle = rip.color;
        ctx.globalAlpha = Math.max(0, rip.alpha);
        ctx.lineWidth = 1.5;

        // Concentric shockwave circle
        ctx.beginPath();
        ctx.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Secondary inner echo
        if (rip.radius > 15) {
          ctx.beginPath();
          ctx.arc(rip.x, rip.y, rip.radius * 0.6, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        if (rip.alpha < 0.02 || rip.radius > rip.maxRadius) {
          ripplesRef.current.splice(i, 1);
        }
      }
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleTogglePlay = () => {
    if (!isPlaying) {
      // Starting the transport must also make sure audio exists *now*, inside the
      // click gesture: previously the engine had no AudioContext until the "dispatch
      // transient" button was pressed, so INITIATE PULSE ran silently.
      onEnsureAudio?.();
      engine.ensureContext();
      currentStepRef.current = 15;
      setIsPlaying(true);
      ecosystemBus.publishClockStart(bpm);
    } else {
      setIsPlaying(false);
      ecosystemBus.publishClockStop();
    }
  };

  const handleToggleStep = (idx: number) => {
    setSteps((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], active: !next[idx].active };
      return next;
    });
    setSelectedStepIdx(idx);
  };

  const handleMicrotimingChange = (idx: number, val: number) => {
    setSteps((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], microtiming: val };
      return next;
    });
  };

  const handleVelocityChange = (idx: number, val: number) => {
    setSteps((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], velocity: val };
      return next;
    });
  };

  return (
    <div className={`bg-[#07090e] border border-line/60 rounded-lg p-4 font-mono select-none shadow-[0_4px_24px_rgba(0,0,0,0.6)] ${className}`}>
      {/* Top Controls: Transport & Somatic Tempo Presets */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line/40">
        <div className="flex items-center gap-3">
          <button
            onClick={handleTogglePlay}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold transition-all shadow-md ${
              isPlaying
                ? "bg-[#f5b73d] text-black hover:bg-[#ffc95c] shadow-[0_0_12px_rgba(245,183,61,0.5)]"
                : "bg-[#181d28] text-text hover:bg-[#232a3b] border border-line/60"
            }`}
          >
            {isPlaying ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>HALT PULSE</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>INITIATE PULSE</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2 bg-black/60 px-2.5 py-1 rounded border border-line/40">
            <Clock className="w-3.5 h-3.5 text-[#f5b73d]" />
            <span className="text-xs text-text-sub font-semibold">TEMPO:</span>
            <input
              type="number"
              min={40}
              max={220}
              value={bpm}
              onChange={(e) => onBpmChange(Number(e.target.value) || 120)}
              className="w-12 bg-transparent text-xs text-[#f5b73d] font-bold text-center border-b border-line focus:outline-none"
            />
            <span className="text-[10px] text-text-dim">BPM</span>
          </div>
        </div>

        {/* Physiological / Somatic Tempo Presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => onBpmChange(70)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border transition-all ${
              bpm === 70
                ? "bg-[#f5b73d]/20 text-[#f5b73d] border-[#f5b73d]"
                : "bg-[#10141d] text-text-sub border-line/40 hover:bg-[#19202e]"
            }`}
            title="70 BPM: Resting Heart / Somatic Meditation"
          >
            <Heart className="w-3 h-3 text-red-400" />
            <span>70 [RESTING]</span>
          </button>

          <button
            onClick={() => onBpmChange(115)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border transition-all ${
              bpm === 115
                ? "bg-[#f5b73d]/20 text-[#f5b73d] border-[#f5b73d]"
                : "bg-[#10141d] text-text-sub border-line/40 hover:bg-[#19202e]"
            }`}
            title="115 BPM: Locomotion / Stride / Natural Bodily Swing"
          >
            <Footprints className="w-3 h-3 text-blue-400" />
            <span>115 [STRIDE]</span>
          </button>

          <button
            onClick={() => onBpmChange(132)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border transition-all ${
              bpm === 132
                ? "bg-[#f5b73d]/20 text-[#f5b73d] border-[#f5b73d]"
                : "bg-[#10141d] text-text-sub border-line/40 hover:bg-[#19202e]"
            }`}
            title="132 BPM: Acceleration / Industrial Club Hypnosis"
          >
            <Flame className="w-3 h-3 text-amber-500" />
            <span>132 [HYPNOSIS]</span>
          </button>
        </div>
      </div>

      {/* Ripple Shockwave Canvas Overlay */}
      <div className="relative w-full h-12 my-2 overflow-hidden bg-black/40 rounded border border-line/30">
        <canvas
          ref={rippleCanvasRef}
          width={800}
          height={48}
          className="w-full h-full block"
        />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-between px-3 text-[9px] text-text-dim">
          <span>GRAVITATIONAL SHOCKWAVE PLANE</span>
          <span>TIME CONTRACT: 16 SUB-DIVISIONS</span>
        </div>
      </div>

      {/* 16-Step Matrix */}
      <div
        className="gap-1 w-full pt-1"
        style={{ display: "grid", gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}
      >
        {steps.map((step, idx) => {
          const isPlayhead = isPlaying && currentStep === idx;
          const isDownbeat = idx % 4 === 0;
          const isSelected = selectedStepIdx === idx;

          return (
            <div key={idx} className="flex flex-col items-center gap-1">
              <button
                onClick={() => handleToggleStep(idx)}
                className={`relative w-full h-12 rounded flex flex-col items-center justify-between p-1 transition-all ${
                  step.active
                    ? "bg-[#f5b73d] text-black font-bold shadow-[0_0_8px_rgba(245,183,61,0.4)]"
                    : isDownbeat
                    ? "bg-[#151922] text-text-sub border border-line/70 hover:bg-[#1f2533]"
                    : "bg-[#0d1017] text-text-dim border border-line/30 hover:bg-[#161b26]"
                } ${
                  isPlayhead
                    ? "ring-2 ring-white scale-105 z-10 brightness-125"
                    : isSelected
                    ? "ring-1 ring-[#f5b73d]/70"
                    : ""
                }`}
                title={`Step ${idx + 1}: ${step.active ? "ACTIVE" : "INACTIVE"}`}
              >
                {/* Step index */}
                <span className="text-[9px] opacity-75">{idx + 1}</span>

                {/* Velocity bar indicator */}
                {step.active && (
                  <div
                    className="w-full bg-black/40 rounded-sm"
                    style={{ height: `${Math.max(2, step.velocity * 8)}px` }}
                  />
                )}

                {/* Microtiming indicator */}
                <span className="text-[8px] opacity-60">
                  {step.microtiming !== 0 ? `${step.microtiming > 0 ? "+" : ""}${step.microtiming}` : ""}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Microtiming & Velocity Editor for Selected Step */}
      {selectedStepIdx !== null && (
        <div className="mt-3 pt-3 border-t border-line/30 flex flex-wrap items-center justify-between gap-4 text-xs bg-black/30 p-2.5 rounded">
          <div className="flex items-center gap-2">
            <span className="text-[#f5b73d] font-bold">STEP {selectedStepIdx + 1} ANATOMY:</span>
            <span className="text-text-sub">
              {steps[selectedStepIdx].active ? "TRIGGER ACTIVE" : "MUTED"}
            </span>
          </div>

          <div className="flex items-center gap-6">
            {/* Velocity */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-dim">VELOCITY:</span>
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={steps[selectedStepIdx].velocity}
                onChange={(e) => handleVelocityChange(selectedStepIdx, parseFloat(e.target.value))}
                className="w-20 accent-[#f5b73d]"
              />
              <span className="text-[10px] text-text font-bold w-7">
                {Math.round(steps[selectedStepIdx].velocity * 100)}%
              </span>
            </div>

            {/* Microtiming Push/Drag (Time Bending) */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-dim">TIME BENDING (PUSH/DRAG):</span>
              <input
                type="range"
                min={-30}
                max={30}
                step={2}
                value={steps[selectedStepIdx].microtiming}
                onChange={(e) => handleMicrotimingChange(selectedStepIdx, parseInt(e.target.value, 10))}
                className="w-24 accent-[#f5b73d]"
              />
              <span className="text-[10px] text-[#f5b73d] font-mono font-bold w-12">
                {steps[selectedStepIdx].microtiming > 0 ? `+${steps[selectedStepIdx].microtiming}` : steps[selectedStepIdx].microtiming}ms
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
