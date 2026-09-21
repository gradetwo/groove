/**
 * The vinyl, drawn on a canvas — a faithful port of `player2.html`'s `draw()`.
 *
 * The reference keeps the whole record inside one `requestAnimationFrame` callback: the disc texture,
 * the label with its printed step rings, four lighting layers, the pulsing sequencer dots, the tonearm
 * with its cradle/lift/jitter/hop and the needle flash. All of that is here, in the reference's order,
 * because the order is what makes it read as a photograph of a record rather than a diagram — the
 * label wash goes *under* the sheen, the sheen goes under the arm, the pivot base goes over it.
 *
 * Three deliberate departures, each with a reason:
 *
 *  - **The maths is not in here.** Springs, angles, energy envelopes and colour mixing live in
 *    `vinylMath.ts`, and the sprites in `vinylTexture.ts`, so the expensive-to-eyeball behaviour has
 *    tests. That split is the whole point of the port existing in `src/` rather than in a static page.
 *  - **Hits come from the transport, not from a draw queue.** The reference pushes one queue entry per
 *    scheduled note out of its own scheduler; the phone plays through the app's engine, so the same
 *    pulse is derived from a *step change* on the clock the caller already hands in. Identical look,
 *    no second audio path.
 *  - **The beat slaves are CSS variables on the module root** (`--kick`, `--breath`, `--bpmBeat`), so
 *    the surrounding chrome — the play button's pulse, the glow behind the screen — rides the same
 *    clock. The reference does exactly this on `:root`; here it is scoped to `.mobile-root` so the
 *    desktop UI is untouched.
 *
 * The `requestAnimationFrame` loop also runs without a 2D context (jsdom, a canvas-less browser): it
 * then only maintains the clock, the beat slaves and the BPM readout, so the screen stays renderable
 * and its timing is still exercised by tests.
 */
import React, { useEffect, useRef } from "react";
import {
  beatSeconds,
  createEnergy,
  dampBpm,
  decayEnergy,
  discRotation,
  fireStep,
  glowTarget,
  labelArtIndex,
  LAYER_KEYS,
  loopProgress,
  LAYER_RADII,
  LAYER_COLORS,
  mixGlow,
  NEEDLE_ANGLE,
  rgbaString,
  stepScrubReturn,
  stepTonearm,
  TONEARM_PLAY_POSITION,
  TONEARM_REST_POSITION,
  tonearmDrawAngle,
  tonearmHeadHop,
  tonearmLift,
  tonearmTheta,
  vinylGeometry,
  type TonearmState,
  type VinylEnergy,
  type VinylGeometry,
} from "./vinylMath";
import { bakeLabel, bakeVinyl, LABEL_ART, labelCacheKey, type BakedSprite } from "./vinylTexture";

export interface VinylClock {
  step: number;
  fraction: number;
}

export interface VinylCanvasProps {
  playing: boolean;
  /** Read the transport position at draw time. Returning null means "no clock yet". */
  readClock: () => VinylClock | null;
  /** 16-step lanes, outer ring first: kick, snare, hat, bass. */
  lanes: readonly (readonly boolean[])[];
  /** Genre colour for the label's outer ring and kick band. */
  accent: string;
  title: string;
  subtitle: string;
  /** Stable identity for the label artwork (the genre id). */
  artSeed: string;
  /** The tempo the engine is playing; the drawn number eases toward it (see `dampBpm`). */
  bpm: number;
  /** The reference's footer line on the label. */
  footer: string;
  /** Where the eased BPM number is written, once per change rather than once per frame. */
  bpmOutRef?: React.RefObject<HTMLElement | null>;
  /** The progress rail's fill, whose width the loop writes from the same clock as the disc. */
  progressRef?: React.RefObject<HTMLElement | null>;
  totalSteps?: number;
  /** Drag left/right to slow/speed the record. Called with the BPM delta for this move. */
  onScrub?: (bpmDelta: number) => void;
  /** Released with momentum: one last BPM step, already computed here. */
  onScrubEnd?: (flickBpmDelta: number) => void;
  /**
   * The scratch itself: pointer speed while the record is dragged, so the caller can play the noise a
   * hand on a record makes (see `src/audio/VinylScrub.ts`), and a release to fade it out.
   */
  onScrubSound?: (velocity: number) => void;
  onScrubSoundEnd?: () => void;
  /**
   * The tempo the *engine* should be at, as the damper walks toward the target.
   *
   * The reference's scheduler reads its damped BPM, so a jog audibly accelerates and decelerates instead
   * of stepping; the phone's engine is set from outside, so the eased value is reported here — on each
   * whole-BPM change, not every frame.
   */
  onBpmTick?: (bpm: number) => void;
}

const DPR_CAP = 2;
/** How far a pointer may travel and still count as a tap rather than a jog. */
const TAP_SLOP_PX = 6;

/** `#rrggbb` → `rgba(r,g,b,a)`: canvas colours must be concrete, never `var(...)`. */
function withAlpha(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return `rgba(94,234,212,${alpha})`;
  const value = parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

export function VinylCanvas({
    playing,
    readClock,
    lanes,
    accent,
    title,
    subtitle,
    artSeed,
    bpm,
    footer,
    bpmOutRef,
    progressRef,
    totalSteps = 16,
  onScrub,
  onScrubEnd,
  onScrubSound,
  onScrubSoundEnd,
  onBpmTick,
}: VinylCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /** Kept in a ref: the rAF loop reads the current props without re-rendering React at 60 fps. */
  const liveRef = useRef({
    playing,
    readClock,
    lanes,
    accent,
    title,
    subtitle,
    artSeed,
    bpm,
    footer,
    totalSteps,
    onBpmTick,
  });
  liveRef.current = {
    playing,
    readClock,
    lanes,
    accent,
    title,
    subtitle,
    artSeed,
    bpm,
    footer,
    totalSteps,
    onBpmTick,
  };
  /** Jog state: in refs so a drag never re-renders React at pointer-move rate. */
  const dragRef = useRef<{ lastX: number; lastT: number; velocity: number; travel: number; tapped: boolean } | null>(null);
  const scrubRef = useRef({ offset: 0, velocity: 0 });
  const energyRef = useRef<VinylEnergy>(createEnergy());

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");

    let frame = 0;
    let arm: TonearmState = { position: TONEARM_REST_POSITION, velocity: 0 };
    let lastFrame = performance.now();
    let lastDrawnStep = -1;
    let baseRotation = NEEDLE_ANGLE + Math.PI / 2;
    let armWasOn = false;
    let needleFlash = 0;
    let ripple = 0;
    let glow = { r: 232, g: 186, b: 120 };
    let displayedBpm = liveRef.current.bpm;
    let dpr = 1;
    let disc: BakedSprite | null = null;
    let label: { key: string; sprite: BakedSprite | null } | null = null;
    /** The module accent resolved from the stylesheet: canvas cannot read CSS variables. */
    let accentHex = accent;
    /** The skin's type faces, resolved the same way and for the same reason. */
    let displayFont = '"Space Grotesk", "PingFang SC", sans-serif';
    let monoFont = '"JetBrains Mono", monospace';

    const resize = () => {
      const module = canvas.closest(".mobile-root");
      const styles = module ? window.getComputedStyle(module) : null;
      const resolved = styles?.getPropertyValue("--m-gold").trim() ?? "";
      accentHex = resolved || accent;
      displayFont = styles?.getPropertyValue("--m-font-display").trim() || displayFont;
      monoFont = styles?.getPropertyValue("--m-font-mono").trim() || monoFont;
      dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
      const width = wrap.clientWidth || 300;
      const height = Math.round(width * (352 / 300));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      // Both sprites are size-dependent; the disc is baked from the disc radius, so both drop.
      disc = null;
      label = null;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(wrap);

    /**
     * Re-resolve on a skin change.
     *
     * The accent and the faces come from CSS variables, which cannot be read reactively; a skin switch
     * happens at most a handful of times a session, so an attribute observer is cheaper and simpler than
     * a per-frame `getComputedStyle`.
     */
    const skinObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => resize());
    skinObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-skin"] });

    const spriteFor = (geometry: VinylGeometry) => {
      if (!disc || disc.size !== Math.ceil(geometry.maxR * 2 + 4)) disc = bakeVinyl(geometry.maxR);
      return disc;
    };

    const labelFor = (): BakedSprite | null => {
      const spec = {
        title: liveRef.current.title.toUpperCase(),
        subtitle: liveRef.current.subtitle,
        footer: liveRef.current.footer,
        lanes: liveRef.current.lanes,
        art: LABEL_ART[labelArtIndex(liveRef.current.artSeed, LABEL_ART.length)],
        accent: accentHex,
        displayFont,
        monoFont,
      };
      const key = labelCacheKey(spec);
      if (!label || label.key !== key) label = { key, sprite: bakeLabel(spec) };
      return label.sprite;
    };

    const drawTonearm = (geometry: VinylGeometry, theta: number, hop: number, energy: VinylEnergy) => {
      if (!ctx) return;
      const travel = Math.min(1, Math.max(0, arm.position));
      const lift = tonearmLift(arm.position);
      const workingAngle = NEEDLE_ANGLE;
      const onRecord = travel > 0.96;
      // `theta` is the offset from rest; the drawn angle is rest plus that offset (see `tonearmDrawAngle`).
      const drawnAngle = tonearmDrawAngle(arm.position, theta);
      // The bar's length is measured from the pivot to where the stylus should be: the arm is rigid and
      // only ever rotates or translates, which is what keeps its shape from stretching mid-swing.
      const tipX = geometry.cx + Math.cos(workingAngle) * geometry.maxR * 0.9;
      const tipY = geometry.cy + Math.sin(workingAngle) * geometry.maxR * 0.9;
      const barLength = Math.hypot(tipX - geometry.pivotX, tipY - geometry.pivotY);
      const resting = workingAngle - 0.21;

      // Cradle: fixed at the resting angle, so it stays behind when the arm swings out.
      ctx.save();
      ctx.translate(geometry.pivotX, geometry.pivotY);
      ctx.rotate(resting);
      ctx.fillStyle = "#17130E";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(barLength - 19, 4.5, 21, 8, 3.5) : ctx.rect(barLength - 19, 4.5, 21, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(237,230,214,0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Shadow: offset by the lift, so a raised arm casts its shadow further away.
      ctx.save();
      ctx.translate(geometry.pivotX + 3 + lift * 4, geometry.pivotY + 6 + lift * 7);
      ctx.rotate(drawnAngle);
      ctx.strokeStyle = "rgba(0,0,0,0.33)";
      ctx.lineWidth = 5.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-15, 0);
      ctx.bezierCurveTo(barLength * 0.3, 2, barLength * 0.65, 10, barLength, 0);
      ctx.stroke();
      ctx.restore();

      // The arm itself: translate for the lift and the kick hop, then rotate.
      ctx.save();
      ctx.translate(geometry.pivotX, geometry.pivotY - lift * 6 - hop);
      ctx.rotate(drawnAngle);
      ctx.strokeStyle = "#B7B0A0";
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(-2, 0);
      ctx.stroke();
      ctx.fillStyle = "#8F887A";
      ctx.beginPath();
      ctx.arc(-16, 0, 4.4, 0, Math.PI * 2);
      ctx.fill();
      const tube = () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(barLength * 0.3, 2, barLength * 0.65, 10, barLength, 0);
      };
      ctx.lineCap = "round";
      for (const [colour, width] of [
        ["#7E786B", 5.2],
        ["#EFE9DA", 3.2],
        ["rgba(255,255,255,0.45)", 1],
      ] as const) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        tube();
        ctx.stroke();
      }

      // Headshell, mounted along the arm's end tangent.
      const headAngle = Math.atan2(-10, barLength * 0.35) * 0.9;
      ctx.save();
      ctx.translate(barLength, 0);
      ctx.rotate(headAngle);
      ctx.fillStyle = "#E7E0CF";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-19, -5.5, 15, 11, 3) : ctx.rect(-19, -5.5, 15, 11);
      ctx.fill();
      ctx.fillStyle = "#2B2620";
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(-7.5, -4, 5, 8, 2) : ctx.rect(-7.5, -4, 5, 8);
      ctx.fill();
      ctx.strokeStyle = "#CFC8B6";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(-1, 0);
      ctx.stroke();
      const glowColour = rgbaString(glow, 1);
      if (onRecord && (energy.kick > 0.05 || needleFlash > 0.05 || energy.headKick > 0.3)) {
        ctx.shadowColor = glowColour;
        ctx.shadowBlur = 9 * Math.max(energy.kick, needleFlash, energy.headKick * 0.5);
      }
      ctx.fillStyle = onRecord ? withAlpha(accentHex, 0.6 + energy.kick * 0.4) : "rgba(190,184,170,0.45)";
      ctx.beginPath();
      ctx.arc(-0.8, 0, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (needleFlash > 0.03) {
        const flash = ctx.createRadialGradient(-0.8, 0, 0, -0.8, 0, 12 * needleFlash + 3);
        flash.addColorStop(0, rgbaString(glow, 0.45 * needleFlash));
        flash.addColorStop(1, rgbaString(glow, 0));
        ctx.fillStyle = flash;
        ctx.beginPath();
        ctx.arc(-0.8, 0, 12 * needleFlash + 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.restore();

      // Pivot base, drawn over the arm so the arm looks mounted under it.
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
      const state = liveRef.current;
      /**
       * Clamped to a non-negative window.
       *
       * `requestAnimationFrame`'s timestamp is the *frame's* start, which can precede the
       * `performance.now()` a just-mounted effect recorded — and a negative `dt` is not a small error in
       * this loop: the tempo damper's `1 - exp(-dt/130)` turns negative and walks *away* from the target
       * every frame, so the tempo (and the engine, which now follows it) diverges exponentially. Found by
       * a test that waited for the damper to settle and read `-2269773 BPM`.
       */
      const dtMs = Math.min(50, Math.max(0, now - lastFrame)) || 16.7;
      lastFrame = now;
      const dt = dtMs / 1000;

      // --- the clock: one edge = one hit per lane that is on for the step -------------------------
      const clock = state.playing ? state.readClock() : null;
      if (clock) {
        baseRotation = discRotation(clock.step, clock.fraction);
        if (clock.step !== lastDrawnStep) {
          lastDrawnStep = clock.step;
          energyRef.current = fireStep(energyRef.current, state.lanes, clock.step % Math.max(1, state.totalSteps));
        }
      }
      energyRef.current = decayEnergy(energyRef.current, dtMs);
      const energy = energyRef.current;

      // --- beat slaves: the surrounding chrome rides the same tempo ------------------------------
      const host = canvas.closest(".mobile-root") as HTMLElement | null;
      if (host) {
        host.style.setProperty("--kick", energy.kick.toFixed(3));
        const breath = 0.5 + 0.5 * Math.sin((now / 1000) * ((Math.PI * 2) / 3.4));
        host.style.setProperty("--breath", breath.toFixed(3));
        host.style.setProperty("--bpmBeat", `${beatSeconds(displayedBpm).toFixed(3)}s`);
      }
      const damped = dampBpm(displayedBpm, state.bpm, dtMs);
      if (Math.round(damped) !== Math.round(displayedBpm)) {
        // The engine follows the same damper the number on screen does, on whole-BPM steps only: that is
        // what makes a jog sound like a motor rather than a slider, and it keeps `setBpm` off the frame
        // budget.
        state.onBpmTick?.(Math.round(damped));
        if (bpmOutRef?.current) bpmOutRef.current.textContent = String(Math.round(damped));
      }
      displayedBpm = damped;

      // The progress rail is written here rather than from a React interval so it moves with the disc:
      // one clock, one place, and no state churn at 2.5 Hz.
      if (clock && progressRef?.current) {
        progressRef.current.style.width = `${(loopProgress(clock.step, clock.fraction, state.totalSteps) * 100).toFixed(2)}%`;
      }

      // --- the arm's spring, and the flash when the needle lands --------------------------------
      arm = stepTonearm(arm, state.playing ? TONEARM_PLAY_POSITION : TONEARM_REST_POSITION, dtMs);
      const armOn = arm.position > 0.97;
      if (armOn && !armWasOn) needleFlash = 1;
      armWasOn = armOn;
      needleFlash *= Math.exp(-dt * 7);
      ripple *= 0.9;
      if (ripple < 0.02) ripple = 0;

      // --- the scrub spring: after a drag the record pulls itself back to the beat --------------
      if (!dragRef.current) {
        const spring = stepScrubReturn(scrubRef.current.offset, scrubRef.current.velocity, dtMs);
        scrubRef.current = spring;
        if (Math.abs(spring.offset) < 0.0015 && Math.abs(spring.velocity) < 0.03) {
          scrubRef.current = { offset: 0, velocity: 0 };
        }
      }

      if (!ctx) return;
      const geometry = vinylGeometry(canvas.width / dpr, canvas.height / dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, geometry.width, geometry.height);

      // --- glow colour: the instrument mix, eased -------------------------------------------------
      glow = mixGlow(glow, glowTarget(energy, { r: 232, g: 186, b: 120 }), dtMs);

      // --- centre bloom (fixed to the screen, not to the disc) ------------------------------------
      const total = Math.min(1, (energy.layers.kick + energy.layers.snare + energy.layers.hat + energy.layers.bass) / 1.8);
      const breath = 0.5 + 0.5 * Math.sin((now / 1000) * ((Math.PI * 2) / 3.4));
      const slow = 0.5 + 0.5 * Math.sin((now / 1000) * ((Math.PI * 2) / 9.5) + 1.7);
      let bloomAlpha = state.playing ? 0.05 + 0.045 * breath + 0.02 * slow + 0.07 * total : 0.03 + 0.02 * breath;
      bloomAlpha = Math.min(0.16, bloomAlpha);
      const bloomRadius = geometry.maxR * 1.55;
      const bloom = ctx.createRadialGradient(
        geometry.cx,
        geometry.cy,
        geometry.maxR * 0.22,
        geometry.cx,
        geometry.cy,
        bloomRadius
      );
      bloom.addColorStop(0, rgbaString(glow, Math.min(0.2, bloomAlpha * 1.5)));
      bloom.addColorStop(0.645, rgbaString(glow, bloomAlpha));
      bloom.addColorStop(1, rgbaString(glow, 0));
      ctx.fillStyle = bloom;
      ctx.beginPath();
      ctx.arc(geometry.cx, geometry.cy, bloomRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgbaString(glow, bloomAlpha * 0.8);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(geometry.cx, geometry.cy, geometry.maxR + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = rgbaString(glow, bloomAlpha * 0.3);
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(geometry.cx, geometry.cy, geometry.maxR + 2.6, 0, Math.PI * 2);
      ctx.stroke();

      // --- the disc ------------------------------------------------------------------------------
      ctx.save();
      ctx.translate(geometry.cx, geometry.cy);
      const scale = 1 + energy.kick * 0.018 + breath * 0.004;
      ctx.scale(scale, scale);
      ctx.save();
      ctx.rotate(baseRotation + scrubRef.current.offset);

      const discSprite = spriteFor(geometry);
      if (discSprite) {
        ctx.drawImage(discSprite.canvas, -discSprite.size / 2, -discSprite.size / 2, discSprite.size, discSprite.size);
      }

      // Ring guides, one per instrument.
      for (const key of LAYER_KEYS) {
        ctx.strokeStyle = `rgba(${LAYER_COLORS[key].str},0.06)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, LAYER_RADII[key] * geometry.maxR, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Scrub shine: dragging lights all four rings at once.
      const drag = dragRef.current;
      const dragVelocity = drag ? drag.velocity : 0;
      const shine = Math.min(1, Math.abs(scrubRef.current.velocity) / 16 + Math.min(1, Math.abs(dragVelocity) * 1.1));
      if (shine > 0.03) {
        ctx.globalCompositeOperation = "lighter";
        for (const key of LAYER_KEYS) {
          ctx.strokeStyle = `rgba(${LAYER_COLORS[key].str},${(shine * 0.08).toFixed(3)})`;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(0, 0, LAYER_RADII[key] * geometry.maxR, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
      }

      // Sequencer dots: filled where the step is on, a faint pip where it is not, plus the pulse of
      // whatever just fired.
      const activeStep = clock ? clock.step % 16 : -1;
      LAYER_KEYS.forEach((key, laneIndex) => {
        const lane = state.lanes[laneIndex] ?? [];
        const radius = LAYER_RADII[key] * geometry.maxR;
        for (let step = 0; step < 16; step += 1) {
          const angle = -Math.PI / 2 - step * (Math.PI * 2) / 16;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (lane[step]) {
            ctx.fillStyle = `rgba(${LAYER_COLORS[key].str},${state.playing ? 0.55 : 0.36})`;
            ctx.beginPath();
            ctx.arc(x, y, 3.1, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = "rgba(237,230,214,0.07)";
            ctx.beginPath();
            ctx.arc(x, y, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
          const impulse = Math.max(energy.steps[key][step] ?? 0, step === activeStep && lane[step] ? 0.45 : 0);
          if (impulse > 0.02 && (lane[step] || impulse > 0.3)) {
            const halo = ctx.createRadialGradient(x, y, 0, x, y, 3.1 + impulse * 10);
            halo.addColorStop(0, `rgba(${LAYER_COLORS[key].str},${0.8 * impulse})`);
            halo.addColorStop(1, `rgba(${LAYER_COLORS[key].str},0)`);
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(x, y, 3.1 + impulse * 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.5 * impulse})`;
            ctx.beginPath();
            ctx.arc(x, y, 2.6 + impulse * 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      // Label, with a wash of the current glow colour over it.
      const labelSprite = labelFor();
      const labelR = geometry.labelR;
      if (labelSprite) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, labelR, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(labelSprite.canvas, -labelR, -labelR, labelR * 2, labelR * 2);
        const wash = state.playing ? 0.05 + 0.06 * breath + energy.kick * 0.12 : 0.02;
        const washGradient = ctx.createRadialGradient(0, -labelR * 0.2, labelR * 0.1, 0, 0, labelR);
        washGradient.addColorStop(0, rgbaString(glow, wash));
        washGradient.addColorStop(1, rgbaString(glow, wash * 0.5));
        ctx.fillStyle = washGradient;
        ctx.fillRect(-labelR, -labelR, labelR * 2, labelR * 2);
        ctx.restore();
        ctx.strokeStyle = "rgba(237,230,214,0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, labelR + 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore(); // end disc rotation

      // Ripples: a ring that expands out of the disc when something is hit by hand, or on landing.
      for (const ring of [
        { strength: ripple, rgb: LAYER_COLORS.hat.str },
        { strength: needleFlash * 0.5, rgb: LAYER_COLORS.kick.str },
      ]) {
        if (ring.strength <= 0.03) continue;
        ctx.strokeStyle = `rgba(${ring.rgb},${(ring.strength * 0.3).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, geometry.maxR + (1 - ring.strength) * 16, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore(); // end disc translate/scale

      // Fixed sheen: the highlight that makes the disc read as a physical object. It does *not* rotate
      // with the record — a real light source does not — which is why it is drawn after the restore.
      const sheenAlpha = 0.05 + breath * 0.02 + shine * 0.03;
      const sheen = ctx.createLinearGradient(
        geometry.cx - geometry.maxR,
        geometry.cy - geometry.maxR,
        geometry.cx + geometry.maxR * 0.3,
        geometry.cy + geometry.maxR * 0.55
      );
      sheen.addColorStop(0, "rgba(255,246,225,0)");
      sheen.addColorStop(0.2, `rgba(255,246,225,${sheenAlpha.toFixed(3)})`);
      sheen.addColorStop(0.36, "rgba(255,255,255,0)");
      sheen.addColorStop(0.68, "rgba(255,255,255,0)");
      sheen.addColorStop(0.85, `rgba(255,246,225,${(sheenAlpha * 0.7).toFixed(3)})`);
      sheen.addColorStop(1, "rgba(255,246,225,0)");
      ctx.fillStyle = sheen;
      ctx.beginPath();
      ctx.arc(geometry.cx, geometry.cy, geometry.maxR, 0, Math.PI * 2);
      ctx.fill();

      const theta = tonearmTheta(arm.position, {
        playing: state.playing,
        headKick: energy.headKick,
        kick: energy.kick,
        hat: energy.layers.hat,
        scrubVelocity: scrubRef.current.velocity,
        dragVelocity,
        timeMs: now,
      });
      drawTonearm(geometry, theta, tonearmHeadHop(energy.headKick, arm.position), energy);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      skinObserver?.disconnect();
    };
  }, [accent, bpmOutRef, progressRef]);

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    } catch {
      /* nothing was captured */
    }
    if (!drag) return;
    // A tap is left to the element that owns the record: it is a real button, and its click is the
    // tap. Only the *drag* has to be reported here, so a jog can be told from a tap.
    if (!drag.tapped) {
      onScrubSoundEnd?.();
      onScrubEnd?.(flickDeltaFor(drag.velocity));
    }
  };

  return (
    <div
      ref={wrapRef}
      className="relative w-full touch-pan-y"
      data-testid="mobile-vinyl"
      onPointerDown={(event) => {
        // Jog: capture the pointer so the gesture survives leaving the record, and keep `touch-pan-y`
        // so a vertical swipe still scrolls the page. A press that never moves is a *tap* instead, and
        // turns into the genre page — the same gesture pair the reference uses for scrub vs. nothing.
        dragRef.current = { lastX: event.clientX, lastT: performance.now(), velocity: 0, travel: 0, tapped: true };
        try {
          (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        } catch {
          /* jsdom and older engines have no pointer capture; the gesture still works inside the element */
        }
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        const now = performance.now();
        const dx = event.clientX - drag.lastX;
        const dt = Math.max(1, now - drag.lastT);
        drag.lastX = event.clientX;
        drag.lastT = now;
        drag.travel += Math.abs(dx);
        if (drag.travel > TAP_SLOP_PX) drag.tapped = false;
        drag.velocity = drag.velocity * 0.72 + (dx / dt) * 0.28;
        scrubRef.current = { offset: scrubRef.current.offset + dx * 0.007, velocity: 0 };
        scrubRef.current.offset = Math.min(1.6, Math.max(-1.6, scrubRef.current.offset));
        if (dx !== 0) onScrub?.(dx * 0.2);
        // The reference's `setScrub(iv)`: the instantaneous speed, not the smoothed one, so the noise
        // tracks the finger rather than lagging behind it.
        onScrubSound?.(dx / dt);
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <canvas
        ref={canvasRef}
        data-testid="mobile-vinyl-canvas"
        aria-hidden="true"
        className="block h-full w-full touch-pan-y"
      />
    </div>
  );
}

/** The reference's flick: below the threshold the record just stops, above it adds up to ±10 BPM. */
function flickDeltaFor(velocity: number): number {
  if (Math.abs(velocity) <= 0.25) return 0;
  return Math.min(10, Math.max(-10, velocity * 6));
}
