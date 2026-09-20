/**
 * The vinyl, drawn on a canvas.
 *
 * All the maths lives in `vinylMath.ts`; this file only draws what those functions return. That split
 * exists because the reference implementation mixes the two inside one `draw()`, which is why none of
 * its geometry or spring behaviour could be tested.
 *
 * Two things it deliberately does *not* do:
 *  - **No CSS rotation.** The angle comes from the transport clock the caller passes in; a CSS
 *    animation would drift away from the audio it is supposed to be showing.
 *  - **No jog-scrub.** See `vinylMath.ts` for why the phone drops that gesture.
 *
 * It degrades to a no-op when there is no 2D context (jsdom, a canvas-less environment) instead of
 * throwing, so the screen that hosts it stays renderable in tests.
 */
import React, { useEffect, useRef } from "react";
import {
  discAngle,
  needleRadius,
  stepDotPosition,
  stepTonearm,
  tonearmAngle,
  tonearmLift,
  vinylGeometry,
  TONEARM_PLAY_POSITION,
  TONEARM_REST_POSITION,
  type TonearmState,
} from "./vinylMath";

export interface VinylClock {
  step: number;
  fraction: number;
}

export interface VinylCanvasProps {
  playing: boolean;
  /** Read the transport position at draw time. Returning null means "no clock yet". */
  readClock: () => VinylClock | null;
  /** 16-step lanes, outer ring first (kick, snare, hat, bass). */
  lanes: readonly (readonly boolean[])[];
  /** Genre colour for the label. */
  accent: string;
  title: string;
  subtitle: string;
  totalSteps?: number;
}

const DPR_CAP = 2;

export function VinylCanvas({
  playing,
  readClock,
  lanes,
  accent,
  title,
  subtitle,
  totalSteps = 16,
}: VinylCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /** Kept in refs: the rAF loop reads them without re-rendering React at 60 fps. */
  const clockRef = useRef({ playing, readClock, lanes, accent, title, subtitle, totalSteps });
  clockRef.current = { playing, readClock, lanes, accent, title, subtitle, totalSteps };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    // jsdom has no 2D context; the screen must stay renderable (and testable) without one.
    if (!ctx) return;

    let frame = 0;
    let arm: TonearmState = { position: TONEARM_REST_POSITION, velocity: 0 };
    let lastFrame = performance.now();
    let angle = 0;
    let grooveCache: { key: string; canvas: HTMLCanvasElement } | null = null;

    const resize = () => {
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
      const width = wrap.clientWidth || 300;
      const height = Math.round(width * (352 / 300));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    /** The disc texture is expensive and static, so it is baked once per size (reference `buildVinyl`). */
    const groovesFor = (geometry: ReturnType<typeof vinylGeometry>) => {
      const key = `${Math.round(geometry.maxR)}`;
      if (grooveCache && grooveCache.key === key) return grooveCache.canvas;
      const offscreen = document.createElement("canvas");
      offscreen.width = geometry.width;
      offscreen.height = geometry.height;
      const octx = offscreen.getContext("2d");
      if (octx) {
        const gradient = octx.createRadialGradient(
          geometry.cx - geometry.maxR * 0.35,
          geometry.cy - geometry.maxR * 0.4,
          geometry.maxR * 0.05,
          geometry.cx,
          geometry.cy,
          geometry.maxR
        );
        gradient.addColorStop(0, "#262019");
        gradient.addColorStop(0.55, "#141210");
        gradient.addColorStop(0.85, "#0B0A09");
        gradient.addColorStop(1, "#060505");
        octx.fillStyle = gradient;
        octx.beginPath();
        octx.arc(geometry.cx, geometry.cy, geometry.maxR, 0, Math.PI * 2);
        octx.fill();

        // A deterministic pseudo-random so the texture does not shimmer between frames.
        let seed = 7;
        const rnd = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 0xffffffff;
        };
        for (let r = geometry.maxR * 0.44; r < geometry.maxR - 2; r += 1.05) {
          const gap = ((r * 0.9) | 0) % 34 < 2;
          const alpha = 0.018 + Math.sin(r * 0.7) * 0.006 + rnd() * 0.02 + (gap ? 0.055 : 0);
          octx.strokeStyle = `rgba(238,230,214,${alpha.toFixed(3)})`;
          octx.lineWidth = gap ? 1.6 : 0.7;
          octx.beginPath();
          octx.arc(geometry.cx, geometry.cy, r, 0, Math.PI * 2);
          octx.stroke();
        }
        octx.strokeStyle = "rgba(0,0,0,0.5)";
        octx.lineWidth = 2.5;
        octx.beginPath();
        octx.arc(geometry.cx, geometry.cy, geometry.maxR - 2.4, 0, Math.PI * 2);
        octx.stroke();
        octx.strokeStyle = "rgba(255,246,225,0.10)";
        octx.lineWidth = 1.2;
        octx.beginPath();
        octx.arc(geometry.cx, geometry.cy, geometry.maxR - 1, 0, Math.PI * 2);
        octx.stroke();
      }
      grooveCache = { key, canvas: offscreen };
      return offscreen;
    };

    const drawTonearm = (geometry: ReturnType<typeof vinylGeometry>, position: number, needleOn: boolean) => {
      const lift = tonearmLift(position);
      const theta = tonearmAngle(position);
      const radius = needleRadius(geometry, position);
      const restingAngle = tonearmAngle(0);
      const workingAngle = tonearmAngle(1);
      const armAngle = restingAngle + (workingAngle - restingAngle) * 0 + theta;
      // The needle point for the *current* travel, so the arm always points at where it is playing.
      const tipX = geometry.cx + Math.cos(workingAngle) * radius;
      const tipY = geometry.cy + Math.sin(workingAngle) * radius;
      const barLength = Math.hypot(tipX - geometry.pivotX, tipY - geometry.pivotY);

      // Cradle (stays put while the arm lifts out of it).
      ctx.save();
      ctx.translate(geometry.pivotX, geometry.pivotY);
      ctx.rotate(restingAngle);
      ctx.fillStyle = "#17130E";
      ctx.strokeStyle = "rgba(237,230,214,0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(barLength - 19, 4.5, 21, 8, 3.5) : ctx.rect(barLength - 19, 4.5, 21, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(geometry.pivotX, geometry.pivotY - lift * 6);
      ctx.rotate(armAngle);
      // Shadow, then the tube drawn three times for a metal read.
      ctx.strokeStyle = "rgba(0,0,0,0.33)";
      ctx.lineWidth = 5.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.bezierCurveTo(barLength * 0.3, 2, barLength * 0.65, 10, barLength, 0);
      ctx.stroke();
      for (const [colour, width] of [
        ["#7E786B", 5.2],
        ["#EFE9DA", 3.2],
        ["rgba(255,255,255,0.45)", 1],
      ] as const) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(-15, 0);
        ctx.bezierCurveTo(barLength * 0.3, 2, barLength * 0.65, 10, barLength, 0);
        ctx.stroke();
      }
      // Counterweight + headshell + stylus.
      ctx.strokeStyle = "#B7B0A0";
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(-2, 0);
      ctx.stroke();
      ctx.fillStyle = "#E7E0CF";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(barLength - 24, -5.5, 15, 11, 3) : ctx.rect(barLength - 24, -5.5, 15, 11);
      ctx.fill();
      ctx.fillStyle = needleOn ? accent : "#CFC8B6";
      ctx.beginPath();
      ctx.arc(barLength - 0.8, 0, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Pivot base over the arm.
      ctx.fillStyle = "#14110C";
      ctx.beginPath();
      ctx.arc(geometry.pivotX, geometry.pivotY, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(237,230,214,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#EAE3D3";
      ctx.beginPath();
      ctx.arc(geometry.pivotX, geometry.pivotY, 3, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const dt = now - lastFrame;
      lastFrame = now;
      const state = clockRef.current;

      arm = stepTonearm(arm, state.playing ? TONEARM_PLAY_POSITION : TONEARM_REST_POSITION, dt);

      const geometry = vinylGeometry(canvas.width / (Math.min(DPR_CAP, window.devicePixelRatio || 1)), canvas.height / (Math.min(DPR_CAP, window.devicePixelRatio || 1)));
      ctx.clearRect(0, 0, geometry.width, geometry.height);

      const clock = state.playing ? state.readClock() : null;
      if (clock) angle = discAngle(clock.step, clock.fraction);

      // 1. Centre bloom (fixed to the screen, not to the disc).
      const bloom = ctx.createRadialGradient(geometry.cx, geometry.cy, geometry.maxR * 0.22, geometry.cx, geometry.cy, geometry.maxR * 1.35);
      bloom.addColorStop(0, state.playing ? "rgba(233,162,59,0.14)" : "rgba(233,162,59,0.05)");
      bloom.addColorStop(1, "rgba(233,162,59,0)");
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(geometry.cx, geometry.cy, geometry.maxR * 1.35, 0, Math.PI * 2);
      ctx.fill();

      // 2. The disc: baked texture + label + sequencer dots, rotated by the audio clock.
      ctx.save();
      ctx.translate(geometry.cx, geometry.cy);
      ctx.rotate(angle);
      ctx.drawImage(groovesFor(geometry), -geometry.cx, -geometry.cy, geometry.width, geometry.height);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.arc(0, 0, geometry.labelR, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#12100C";
      ctx.beginPath();
      ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
      ctx.fill();

      (state.lanes ?? []).forEach((lane, laneIndex) => {
        lane.forEach((on, step) => {
          if (!on) return;
          const dot = stepDotPosition({ ...geometry, cx: 0, cy: 0 }, laneIndex, step);
          const active = clock ? step === clock.step % Math.max(1, state.totalSteps) : false;
          ctx.fillStyle = active ? "rgba(255,255,255,0.92)" : `rgba(24,17,4,${laneIndex === 0 ? 0.5 : 0.36})`;
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, active ? 3.4 : 2.4, 0, Math.PI * 2);
          ctx.fill();
        });
      });
      ctx.restore();

      // 3. Fixed sheen over the disc, under the arm: this is what makes it read as vinyl.
      const sheen = ctx.createLinearGradient(
        geometry.cx - geometry.maxR,
        geometry.cy - geometry.maxR,
        geometry.cx + geometry.maxR * 0.3,
        geometry.cy + geometry.maxR * 0.55
      );
      sheen.addColorStop(0, "rgba(255,246,225,0)");
      sheen.addColorStop(0.2, "rgba(255,246,225,0.07)");
      sheen.addColorStop(0.36, "rgba(255,246,225,0)");
      sheen.addColorStop(0.68, "rgba(255,246,225,0)");
      sheen.addColorStop(0.85, "rgba(255,246,225,0.05)");
      sheen.addColorStop(1, "rgba(255,246,225,0)");
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.arc(geometry.cx, geometry.cy, geometry.maxR, 0, Math.PI * 2);
      ctx.fill();

      // 4. Label name, upright (it does not rotate with the disc).
      ctx.fillStyle = "rgba(24,17,4,0.92)";
      ctx.textAlign = "center";
      ctx.font = '700 15px "Space Grotesk", sans-serif';
      ctx.fillText(state.title.slice(0, 18), geometry.cx, geometry.cy + geometry.labelR * 0.28);
      ctx.font = '400 9px "JetBrains Mono", monospace';
      ctx.fillText(state.subtitle.toUpperCase().slice(0, 22), geometry.cx, geometry.cy + geometry.labelR * 0.52);

      // 5. The arm, over everything but the pivot base.
      drawTonearm(geometry, arm.position, arm.position > 0.96);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative w-[min(78vw,300px)]" data-testid="mobile-vinyl">
      <canvas
        ref={canvasRef}
        data-testid="mobile-vinyl-canvas"
        aria-hidden="true"
        className="block h-full w-full touch-pan-y"
      />
    </div>
  );
}
