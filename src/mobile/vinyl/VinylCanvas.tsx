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
 * ## What a frame costs, and why it is shaped like this
 *
 * A CPU profile of this screen on the audit's phone profile (`scripts/measure_phone_jank.mjs`: 390×844,
 * 4× throttle) put 82 % of its samples in `(program)` — raster, not JavaScript — so the work to remove
 * was per-frame *pixels* and per-frame *style invalidations*, not logic. Measured by ablation:
 *
 *  - **A full-canvas radial gradient every frame was the largest single item.** The centre bloom alone
 *    covers most of the canvas, and the label wash and the needle flash each built their own gradient
 *    per frame. None of them carried information a baked sprite plus `globalAlpha` cannot: they are
 *    sprites now, re-tinted only when the eased glow colour has visibly moved (see `TINT_QUANTUM`).
 *  - **`ctx.shadowBlur` was the other one.** It is a Gaussian evaluated per pixel over the shape's
 *    inflated bounds, and the needle paid for it on every kick. The flash is a baked glow drawn with
 *    `globalAlpha`, and it is only drawn while it is actually visible, so a quiet record pays nothing.
 *  - **The backing store was 600×704.** `DPR_CAP` is 1.5 (see below), ~44 % fewer pixels for a texture
 *    nobody can resolve at 2×; the *label* stays crisp because it is baked at 512 px and drawn scaled.
 *  - **Every frame wrote three inherited custom properties on `.mobile-root`**, and an inherited custom
 *    property invalidates style for the whole shell subtree — measured at ~40 ms per frame under the
 *    audit's throttle. They are still written, because the chrome rides them, but only when the rounded
 *    value actually changes, and `--breath` is quantised so a slow sine cannot force a style
 *    recalculation sixty times a second.
 *  - **A settled picture is not repainted at all.** `vinylIsIdle` says when nothing is moving; the loop
 *    keeps its `requestAnimationFrame` while skipping the draw entirely. Pressing play changes `playing`,
 *    which wakes it on the very next frame, so the record still starts instantly.
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
  LAYER_RADII,
  loopProgress,
  LAYER_COLORS,
  mixGlow,
  NEEDLE_ANGLE,
  rgbaString,
  stepScrubReturn,
  stepTonearm,
  TONEARM_NEEDLE_RADIUS,
  TONEARM_PLAY_POSITION,
  TONEARM_REST_POSITION,
  TONEARM_TRAVEL,
  tonearmDrawAngle,
  tonearmHeadHop,
  tonearmWorkingAngle,
  tonearmLift,
  tonearmTheta,
  vinylGeometry,
  vinylIsIdle,
  type TonearmState,
  type VinylEnergy,
  type VinylGeometry,
} from "./vinylMath";
import {
  bakeDisc,
  bakeGlow,
  bakeLabel,
  bakeSheen,
  bakeVinyl,
  LABEL_ART,
  labelCacheKey,
  tintKey,
  type BakedSprite,
  type GlowStop,
  type LabelSpec,
  type Rgb,
} from "./vinylTexture";

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

/**
 * The backing-store cap.
 *
 * The canvas is 300 CSS px wide, so at 2× it rasterised 600×704 = 422k pixels *per frame*: a rotated
 * disc blit, the bloom, the sheen and the label wash, all of them over most of that surface. Measured
 * by ablation on the audit's 4× phone profile, dropping the cap to 1.5 took the frame from ~146 ms to
 * ~108 ms — a quarter of the whole frame — with no visible loss: the disc is a dark, low-frequency
 * texture, and the *label*, the only part of it with type, is baked at 512 px and drawn scaled, so its
 * type is still resolved from far more pixels than 1.5× asks for. 1.25 measured faster still (~96 ms)
 * but starts to soften the 9 px mono footer, which is the one thing on the record a user reads.
 */
const DPR_CAP = 1.5;
/** How far a pointer may travel and still count as a tap rather than a jog. */
const TAP_SLOP_PX = 6;

/**
 * The grid `--breath` is rounded to before it is published to CSS.
 *
 * `--breath` is a 3.4 s sine, so at three decimals it changes on *every* frame, and a changed inherited
 * custom property invalidates style for the whole `.mobile-root` subtree — measured at ~40 ms of style
 * recalculation per frame under the audit's throttle, the largest single item in the frame. 0.05 is a
 * 2 % step on the aura's opacity (`0.4 * 0.05`), below what the eye resolves, and it caps the writes at
 * roughly 12/s instead of 60/s.
 */
const BREATH_STEP = 0.05;
/** `--kick`'s grid: the reference's CSS multiplies it by ≤ 10 px, so two decimals is all its detail. */
const KICK_STEP = 0.01;

/**
 * The shortest gap between two *publications* of the beat slaves, in milliseconds.
 *
 * Change detection alone is not enough for two of the three: `--breath` is a slow sine that genuinely
 * moves every frame, and `--kick` decays exponentially through its 0.01 grid for most of a beat. Each
 * republication invalidates style for the whole shell — measured at ~40 ms per frame under the audit's
 * 4× throttle, and ~12 ms on an unthrottled CPU, which is most of a 60 Hz frame budget. The chrome the
 * slaves drive is a set of *glows*: the aura's opacity, the status dot's scale and shadow, the progress
 * rail's bloom. 80 ms is 12.5 Hz, six samples across a kick's half-second decay — smooth to the eye, and
 * it turns a per-frame cost into ~1 % of the frame. The canvas itself is untouched: the record still
 * turns and pulses on every frame.
 */
const SLAVE_MIN_INTERVAL_MS = 80;

/**
 * Adaptive frame pacing.
 *
 * The drawn frame costs ~12 ms of raster on an unthrottled phone CPU (see the note above the loop), which
 * is most of a 60 Hz budget: the *rate* of drawing is what has to give, not the quality of a frame, because
 * a phone cannot rasterise this scene 60 times a second and still have room for anything else. So the loop
 * watches how long its own draws take and settles on the fastest rate it can actually hold:
 *
 *   - a draw that takes longer than `FRAME_SLOW_MS` halves the rate to `FRAME_MIN_MS` (≈30 fps),
 *   - a run of draws that are comfortably inside `FRAME_FAST_MS` returns to full rate.
 *
 * Skipping a frame is nearly free (no canvas work, no style writes — the loop still advances its springs,
 * clock and slaves), and the record at 30 fps reads as smooth rotation rather than as a dropped frame,
 * which is exactly the trade a phone UI makes everywhere else. The frame-rate floor only applies while
 * something is actually moving; the idle path above returns before any of this.
 */
const FRAME_MIN_MS = 33;
/** A rAF-to-rAF gap above this means full rate is not being held (60 Hz is 16.7 ms). */
const FRAME_SLOW_GAP_MS = 24;
/** A paint this cheap has room to try full rate again. */
const FRAME_FAST_MS = 6;
/** How many consecutive fast draws it takes to try full rate again. */
const FRAME_FAST_RUNS = 24;

/** The sequencer dot radii, as the reference draws them. */
const DOT_RADIUS = 3.1;
const PIP_RADIUS = 1.2;
/** The faint pip of a step that is off is one fixed alpha, playing or not (the reference's 0.07). */
const PIP_ALPHA = 0.07;
/** The needle's dot radius, which the flash glow sits behind. */
const NEEDLE_DOT_RADIUS = 2.1;
/** The furthest an impulse halo reaches: the bake has to cover the biggest of them. */
const HALO_RADIUS = DOT_RADIUS + 10;
/** The needle glow's sprite radius: `2.1 + 9 * 1` plus room for the falloff. */
const NEEDLE_GLOW_RADIUS = 11;

/** The centre bloom's profile: the reference's own stops, with the alphas made relative to the peak. */
const BLOOM_STOPS: readonly GlowStop[] = [
  { at: 0, alpha: 1.5 },
  { at: 0.645, alpha: 1 },
  { at: 1, alpha: 0 },
];
/**
 * The same profile once the reference's centre clamp (`min(0.2, a * 1.5)`) has bitten.
 *
 * The clamp makes the profile depend on the alpha, which one baked sprite cannot express; baking the
 * clamped shape for the loud end and the free shape for the quiet end is within 0.025 alpha of the
 * reference at the only place they differ, the innermost fifth of a soft halo.
 */
const BLOOM_STOPS_CLAMPED: readonly GlowStop[] = [
  { at: 0, alpha: 0.2 / 0.16 },
  { at: 0.645, alpha: 1 },
  { at: 1, alpha: 0 },
];
/** Where the reference's `min(0.2, a * 1.5)` starts to bite. */
const BLOOM_CLAMP_ALPHA = 0.2 / 1.5;

/** The needle's glow, standing in for the reference's `shadowBlur = 9 * intensity`. */
const NEEDLE_STOPS: readonly GlowStop[] = [
  { at: 0, alpha: 1 },
  { at: 0.18, alpha: 0.72 },
  { at: 0.5, alpha: 0.22 },
  { at: 1, alpha: 0 },
];

/** A baked sprite tinted by the eased glow colour, and so re-baked whenever that colour moves. */
interface TintedSprite {
  key: string;
  sprite: BakedSprite | null;
}

/** `#rrggbb` → `rgba(r,g,b,a)`: canvas colours must be concrete, never `var(...)`. */
function withAlpha(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return `rgba(94,234,212,${alpha})`;
  const value = parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

/** The largest value in a lane — the idle test needs the loudest impulse, not the sum. */
function peak(values: readonly number[]): number {
  let max = 0;
  for (const value of values) if (value > max) max = value;
  return max;
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
    /** The current pacing floor in ms (0 = every animation frame) and the fast-draw run counter. */
    let minFrameMs = 0;
    let fastRuns = 0;
    let lastPaintedAt = 0;
    let arm: TonearmState = { position: TONEARM_REST_POSITION, velocity: 0 };
    let lastFrame = performance.now();
    let lastDrawnStep = -1;
    let baseRotation = NEEDLE_ANGLE + Math.PI / 2;
    let armWasOn = false;
    let needleFlash = 0;
    let ripple = 0;
    let glow = { r: 232, g: 186, b: 120 };
    let displayedBpm = liveRef.current.bpm;
    /** The genre the damper is currently showing; a change means the tempo must snap, not walk. */
    let displayedFor = liveRef.current.artSeed;
    let dpr = 1;
    /** The module root the beat slaves are published on: resolved per resize, not per frame. */
    let host: HTMLElement | null = null;
    /** Every sprite below is size-dependent, which is why `resize()` drops all of them. */
    let disc: BakedSprite | null = null;
    let label: { key: string; sprite: BakedSprite | null } | null = null;
    let dots: { key: string; on: Record<string, BakedSprite | null>; off: BakedSprite | null } | null = null;
    let halo: { key: string; sprites: Record<string, BakedSprite | null> } | null = null;
    let core: BakedSprite | null = null;
    let sheen: BakedSprite | null = null;
    let bloom: TintedSprite | null = null;
    let wash: TintedSprite | null = null;
    let needle: TintedSprite | null = null;
    /** The module accent resolved from the stylesheet: canvas cannot read CSS variables. */
    let accentHex = accent;
    /** The skin's type faces, resolved the same way and for the same reason. */
    let displayFont = '"Space Grotesk", "PingFang SC", sans-serif';
    let monoFont = '"JetBrains Mono", monospace';
    /** The step the last clock read returned, for the active-step highlight. */
    let clockStep = -1;
    /** Whether the last picture the loop drew was a settled one (see `vinylIsIdle`). */
    let paintedIdle = false;
    /** Set by anything that changes the picture outside the clock: a resize, a new genre, a skin. */
    let dirty = true;
    /** The props the last drawn picture was made from; a change is a new picture. */
    let lastPropKey = "";
    /** The rounded slave values last published, so an unchanged one costs nothing. */
    const slaves = { kick: "", breath: "", bpmBeat: "" };
    /** When the slaves were last published, for the `SLAVE_MIN_INTERVAL_MS` cap. */
    let lastSlaveAt = -1e9;

    const resize = () => {
      host = canvas.closest(".mobile-root") as HTMLElement | null;
      const styles = host ? window.getComputedStyle(host) : null;
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
      // Every sprite is baked from the size (and some from the accent and the faces), so all of them drop.
      disc = null;
      label = null;
      dots = null;
      halo = null;
      core = null;
      sheen = null;
      bloom = null;
      wash = null;
      needle = null;
      dirty = true;
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

    /**
     * One repaint on the way back from a hidden tab.
     *
     * Nothing else wakes a settled loop, and a backgrounded tab is exactly where a canvas's backing
     * store is allowed to be dropped — so the loop would otherwise leave an empty record on screen until
     * the user touched something. One dirty flag costs a single frame.
     */
    const onVisibility = () => {
      dirty = true;
    };
    document.addEventListener("visibilitychange", onVisibility);

    const spriteFor = (geometry: VinylGeometry) => {
      if (!disc || disc.size !== Math.ceil(geometry.maxR * 2 + 4)) disc = bakeVinyl(geometry.maxR);
      return disc;
    };

    const labelFor = (): BakedSprite | null => {
      const spec: LabelSpec = {
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

    /**
     * The sequencer dots, baked per *pattern* rather than stroked per dot.
     *
     * 64 `arc` + `fill` pairs a frame is 64 path rasterisations; a baked dot is a six-pixel blit. Only
     * the pattern changes the geometry, so the cache key is the lanes — and the two fills differ only
     * in alpha between playing and paused, which is applied per frame with `globalAlpha`.
     */
    const dotsFor = () => {
      let key = "";
      for (const lane of liveRef.current.lanes) {
        for (const on of lane) key += on ? "1" : "0";
        key += "|";
      }
      if (!dots || dots.key !== key) {
        const on: Record<string, BakedSprite | null> = {};
        for (const laneKey of LAYER_KEYS) on[laneKey] = bakeDisc(DOT_RADIUS, LAYER_COLORS[laneKey]);
        dots = { key, on, off: bakeDisc(PIP_RADIUS, { r: 237, g: 230, b: 214 }, 3) };
      }
      return dots;
    };

    const halosFor = (geometry: VinylGeometry) => {
      const key = String(Math.ceil(geometry.maxR));
      if (!halo || halo.key !== key) {
        const sprites: Record<string, BakedSprite | null> = {};
        for (const laneKey of LAYER_KEYS) {
          sprites[laneKey] = bakeGlow({
            radius: HALO_RADIUS,
            colour: LAYER_COLORS[laneKey],
            stops: [
              { at: 0, alpha: 1 },
              { at: 1, alpha: 0 },
            ],
          });
        }
        halo = { key, sprites };
      }
      return halo;
    };

    const sheenFor = (geometry: VinylGeometry) => {
      if (!sheen) sheen = bakeSheen(geometry.maxR);
      return sheen;
    };

    const coreFor = () => {
      if (!core) core = bakeDisc(1, { r: 255, g: 255, b: 255 }, 8);
      return core;
    };

    /** Re-bake a tinted sprite only when the eased colour has moved a visible amount. */
    const tint = (cache: TintedSprite | null, colour: Rgb, bake: () => BakedSprite | null): TintedSprite => {
      const key = tintKey(colour);
      if (cache && cache.key === key) return cache;
      return { key, sprite: bake() };
    };

    const bloomFor = (geometry: VinylGeometry, colour: Rgb, alpha: number) => {
      bloom = tint(bloom, colour, () =>
        bakeGlow({
          // A soft, low-frequency glow: baked at a quarter of the size, which is a sixteenth of the
          // raster and indistinguishable once scaled back up — nothing in it has an edge to lose.
          radius: geometry.maxR * 1.55,
          inner: { radius: geometry.maxR * 0.22 },
          colour,
          stops: alpha > BLOOM_CLAMP_ALPHA ? BLOOM_STOPS_CLAMPED : BLOOM_STOPS,
          downscale: 4,
        })
      );
      return bloom.sprite;
    };

    const washFor = (geometry: VinylGeometry, colour: Rgb) => {
      wash = tint(wash, colour, () =>
        bakeGlow({
          radius: geometry.labelR,
          // The reference's wash is a two-circle gradient: a small ring above the spindle opening out
          // to the label's own edge, clipped to the label.
          inner: { y: -geometry.labelR * 0.2, radius: geometry.labelR * 0.1 },
          colour,
          stops: [
            { at: 0, alpha: 1 },
            { at: 1, alpha: 0.5 },
          ],
          clipRadius: geometry.labelR,
        })
      );
      return wash.sprite;
    };

    const needleFor = (colour: Rgb) => {
      needle = tint(needle, colour, () =>
        bakeGlow({ radius: NEEDLE_GLOW_RADIUS, colour, stops: NEEDLE_STOPS, superSample: 2 })
      );
      return needle.sprite;
    };

    const drawTonearm = (geometry: VinylGeometry, theta: number, hop: number, energy: VinylEnergy) => {
      if (!ctx) return;
      const travel = Math.min(1, Math.max(0, arm.position));
      const lift = tonearmLift(arm.position);
      const onRecord = travel > 0.96;
      /**
       * The arm's own working angle — from the *pivot*, not from the disc centre.
       *
       * `NEEDLE_ANGLE` says where the stylus sits relative to the disc; the arm rotates about a pivot
       * above it, so its angle is that needle position seen from the pivot (~+0.82 rad, pointing right
       * and down at the record). Drawing the arm at `NEEDLE_ANGLE` itself held the stylus up and off the
       * disc in both states — see `tonearmWorkingAngle`.
       */
      const workingAngle = tonearmWorkingAngle(geometry);
      // The bar's length is measured from the pivot to where the stylus should be: the arm is rigid and
      // only ever rotates or translates, which is what keeps its shape from stretching mid-swing.
      const tipX = geometry.cx + Math.cos(NEEDLE_ANGLE) * geometry.maxR * TONEARM_NEEDLE_RADIUS;
      const tipY = geometry.cy + Math.sin(NEEDLE_ANGLE) * geometry.maxR * TONEARM_NEEDLE_RADIUS;
      const barLength = Math.hypot(tipX - geometry.pivotX, tipY - geometry.pivotY);
      /** The resting angle: the reference's `th0`, where the stylus hangs off the disc's upper right. */
      const resting = workingAngle - TONEARM_TRAVEL;
      // `theta` is the offset from rest; the drawn angle is the rest angle plus that offset.
      const drawnAngle = tonearmDrawAngle(workingAngle, theta);

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

      /**
       * The needle's glow, which the reference draws with `ctx.shadowBlur = 9 * intensity`.
       *
       * A shadow blur is a Gaussian evaluated per pixel over the shape's inflated bounds — after the
       * gradients the most expensive thing in the frame, and it was paid on every kick. It is a baked
       * glow now: the spread still rides the intensity (the sprite is scaled), and it is only drawn
       * while there is something to see, so a quiet record pays nothing at all.
       */
      const intensity = Math.max(energy.kick, needleFlash, energy.headKick * 0.5);
      const glowSprite = onRecord && intensity > 0.03 ? needleFor(glow) : null;
      if (glowSprite) {
        const glowRadius = (NEEDLE_DOT_RADIUS + 9 * intensity) * 1.6;
        ctx.globalAlpha = 0.8;
        ctx.drawImage(glowSprite.canvas, -0.8 - glowRadius, -glowRadius, glowRadius * 2, glowRadius * 2);
        if (needleFlash > 0.03) {
          const flashRadius = (12 * needleFlash + 3) * 1.1;
          ctx.globalAlpha = 0.45 * needleFlash;
          ctx.drawImage(glowSprite.canvas, -0.8 - flashRadius, -flashRadius, flashRadius * 2, flashRadius * 2);
        }
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = onRecord ? withAlpha(accentHex, 0.6 + energy.kick * 0.4) : "rgba(190,184,170,0.45)";
      ctx.beginPath();
      ctx.arc(-0.8, 0, NEEDLE_DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
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

    /**
     * One whole picture, in the reference's order.
     *
     * Nothing in here is conditional on a timer: every value comes from the transport, the springs and
     * the eased mix, all of which the loop advances every frame whether or not it paints.
     */
    const drawScene = (
      now: number,
      geometry: VinylGeometry,
      energy: VinylEnergy,
      breath: number,
      shine: number,
      dragVelocity: number
    ) => {
      if (!ctx) return;
      const state = liveRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, geometry.width, geometry.height);

      // --- centre bloom (fixed to the screen, not to the disc) ------------------------------------
      const total = Math.min(1, (energy.layers.kick + energy.layers.snare + energy.layers.hat + energy.layers.bass) / 1.8);
      const slow = 0.5 + 0.5 * Math.sin((now / 1000) * ((Math.PI * 2) / 9.5) + 1.7);
      let bloomAlpha = state.playing ? 0.05 + 0.045 * breath + 0.02 * slow + 0.07 * total : 0.03 + 0.02 * breath;
      bloomAlpha = Math.min(0.16, bloomAlpha);
      const bloomRadius = geometry.maxR * 1.55;
      const bloomSprite = bloomFor(geometry, glow, bloomAlpha);
      if (bloomSprite) {
        /**
         * Clipped to the ring the disc does not cover.
         *
         * The bloom's sprite is `2 × 1.55 × maxR` across, which on this canvas is most of its area, and
         * the disc — opaque, and drawn immediately after — hides everything inside `maxR`. Rasterising
         * that middle is work no pixel can show, so the fill is clipped to the annulus. The visible
         * result is identical: the hole is exactly where the disc lands, and the two glow rings stroked
         * below go over its edge.
         */
        ctx.save();
        ctx.beginPath();
        ctx.arc(geometry.cx, geometry.cy, bloomRadius, 0, Math.PI * 2);
        ctx.arc(geometry.cx, geometry.cy, geometry.maxR, 0, Math.PI * 2, true);
        ctx.clip("evenodd");
        ctx.globalAlpha = bloomAlpha;
        ctx.drawImage(
          bloomSprite.canvas,
          geometry.cx - bloomRadius,
          geometry.cy - bloomRadius,
          bloomRadius * 2,
          bloomRadius * 2
        );
        ctx.restore();
      }
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

      /**
       * The disc itself is blitted **outside** the rotation, and that is the cheapest frame in the file.
       *
       * It is the largest thing drawn (a ~450 px sprite over most of the canvas) and, until now, it was
       * drawn *through* a rotation transform — which asks the rasteriser to resample every one of its
       * ~200k pixels each frame. The sprite carries the grooves and the ring guides (see `bakeVinyl`) and
       * they are all **concentric**: rotating them cannot change a single pixel. What actually has to turn
       * is the *label* and the sequencer dots, and both are small (the label is ~126 px across) — they stay
       * inside the rotation below. The sheen, the one non-symmetric detail, is drawn unrotated on purpose
       * (see its comment further down), so nothing that should move with the record is left behind.
       */
      const discSprite = spriteFor(geometry);
      if (discSprite) {
        ctx.drawImage(discSprite.canvas, -discSprite.size / 2, -discSprite.size / 2, discSprite.size, discSprite.size);
      }

      ctx.save();
      ctx.rotate(baseRotation + scrubRef.current.offset);

      // Scrub shine: dragging lights all four rings at once.
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

      // Sequencer dots: the pattern is baked, the alphas and the impulses are not.
      const activeStep = clockStep;
      const dotSprites = dotsFor();
      const dotAlpha = state.playing ? 0.55 : 0.36;
      const halos = halosFor(geometry);
      const centre = coreFor();
      LAYER_KEYS.forEach((key, laneIndex) => {
        const lane = state.lanes[laneIndex] ?? [];
        const radius = LAYER_RADII[key] * geometry.maxR;
        const on = dotSprites.on[key];
        const off = dotSprites.off;
        // Two passes per lane, because the two fills carry different alphas: the faint pip of a step
        // that is off is always the reference's 0.07, while a lit step is brighter while playing.
        if (off) {
          ctx.globalAlpha = PIP_ALPHA;
          for (let step = 0; step < 16; step += 1) {
            if (lane[step]) continue;
            const angle = -Math.PI / 2 - step * (Math.PI * 2) / 16;
            ctx.drawImage(
              off.canvas,
              Math.cos(angle) * radius - off.size / 2,
              Math.sin(angle) * radius - off.size / 2,
              off.size,
              off.size
            );
          }
        }
        if (on) {
          ctx.globalAlpha = dotAlpha;
          for (let step = 0; step < 16; step += 1) {
            if (!lane[step]) continue;
            const angle = -Math.PI / 2 - step * (Math.PI * 2) / 16;
            ctx.drawImage(
              on.canvas,
              Math.cos(angle) * radius - on.size / 2,
              Math.sin(angle) * radius - on.size / 2,
              on.size,
              on.size
            );
          }
        }
        ctx.globalAlpha = 1;
        for (let step = 0; step < 16; step += 1) {
          const impulse = Math.max(energy.steps[key][step] ?? 0, step === activeStep && lane[step] ? 0.45 : 0);
          if (impulse <= 0.02 || (!lane[step] && impulse <= 0.3)) continue;
          const angle = -Math.PI / 2 - step * (Math.PI * 2) / 16;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const halo = halos.sprites[key];
          if (halo) {
            const haloRadius = DOT_RADIUS + impulse * 10;
            ctx.globalAlpha = 0.8 * impulse;
            ctx.drawImage(halo.canvas, x - haloRadius, y - haloRadius, haloRadius * 2, haloRadius * 2);
          }
          if (centre) {
            const coreRadius = 2.6 + impulse * 1.4;
            ctx.globalAlpha = 0.25 + 0.5 * impulse;
            ctx.drawImage(centre.canvas, x - coreRadius, y - coreRadius, coreRadius * 2, coreRadius * 2);
          }
          ctx.globalAlpha = 1;
        }
      });

      // Label: the paper is baked, the wash over it is a baked glow drawn at the wash's own alpha.
      const labelSprite = labelFor();
      const labelR = geometry.labelR;
      if (labelSprite) {
        ctx.drawImage(labelSprite.canvas, -labelR, -labelR, labelR * 2, labelR * 2);
        const washAlpha = state.playing ? 0.05 + 0.06 * breath + energy.kick * 0.12 : 0.02;
        const washSprite = washFor(geometry, glow);
        if (washSprite) {
          ctx.globalAlpha = washAlpha;
          ctx.drawImage(washSprite.canvas, -labelR, -labelR, labelR * 2, labelR * 2);
          ctx.globalAlpha = 1;
        }
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
      const sheenSprite = sheenFor(geometry);
      if (sheenSprite) {
        ctx.globalAlpha = sheenAlpha;
        ctx.drawImage(
          sheenSprite.canvas,
          geometry.cx - geometry.maxR,
          geometry.cy - geometry.maxR,
          sheenSprite.size,
          sheenSprite.size
        );
        ctx.globalAlpha = 1;
      }

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
      clockStep = clock ? clock.step % 16 : -1;
      if (clock) {
        baseRotation = discRotation(clock.step, clock.fraction);
        if (clock.step !== lastDrawnStep) {
          lastDrawnStep = clock.step;
          energyRef.current = fireStep(energyRef.current, state.lanes, clock.step % Math.max(1, state.totalSteps));
        }
      }
      energyRef.current = decayEnergy(energyRef.current, dtMs);
      const energy = energyRef.current;

      /**
       * A new genre is a new tempo, not a jog: snap rather than ease.
       *
       * Walking from the previous genre's number would animate a transition the music is not making —
       * the engine switched on the same beat the screen did.
       */
      if (state.artSeed !== displayedFor) {
        displayedFor = state.artSeed;
        displayedBpm = state.bpm;
        if (bpmOutRef?.current) bpmOutRef.current.textContent = String(Math.round(state.bpm));
      }
      const damped = dampBpm(displayedBpm, state.bpm, dtMs);
      if (Math.round(damped) !== Math.round(displayedBpm)) {
        // The engine follows the same damper the number on screen does, on whole-BPM steps only: that is
        // what makes a jog sound like a motor rather than a slider, and it keeps `setBpm` off the frame
        // budget.
        state.onBpmTick?.(Math.round(damped));
        if (bpmOutRef?.current) bpmOutRef.current.textContent = String(Math.round(damped));
      }
      const bpmDelta = Math.abs(damped - state.bpm);
      displayedBpm = damped;

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
      const drag = dragRef.current;
      const dragVelocity = drag ? drag.velocity : 0;

      // --- glow colour: the instrument mix, eased -------------------------------------------------
      const glowBefore = glow;
      glow = mixGlow(glow, glowTarget(energy, { r: 232, g: 186, b: 120 }), dtMs);
      const glowDelta = Math.max(
        Math.abs(glowBefore.r - glow.r),
        Math.abs(glowBefore.g - glow.g),
        Math.abs(glowBefore.b - glow.b)
      );

      /** Is anything on screen still moving? (`vinylIsIdle` says what each value means.) */
      const idle = vinylIsIdle({
        playing: state.playing,
        scrubbing:
          drag !== null || Math.abs(scrubRef.current.offset) > 1e-4 || Math.abs(scrubRef.current.velocity) > 0.02,
        armMoving:
          Math.abs(arm.velocity) > 0.004 ||
          Math.abs(arm.position - (state.playing ? TONEARM_PLAY_POSITION : TONEARM_REST_POSITION)) > 0.001,
        energy: Math.max(
          energy.kick,
          energy.headKick,
          energy.layers.kick,
          energy.layers.snare,
          energy.layers.hat,
          energy.layers.bass,
          peak(energy.steps.kick),
          peak(energy.steps.snare),
          peak(energy.steps.hat),
          peak(energy.steps.bass)
        ),
        needleFlash,
        ripple,
        glowDelta,
        bpmDelta,
      });

      /**
       * The breath, frozen while nothing else moves.
       *
       * A paused, settled record has exactly one animation left in it: this 3.4 s sine, which drives the
       * aura's opacity (and the bloom's, and the sheen's). Keeping it alive would mean repainting a
       * picture that is otherwise identical — and re-publishing an inherited custom property, which
       * costs a style recalculation of the whole shell — sixty times a second, for a 2 % opacity drift.
       * It is pinned at the middle of its range instead, which is a frame the sine passes through twice a
       * cycle, so the paused look is exactly one of the looks it already had.
       */
      const breath = idle ? 0.5 : 0.5 + 0.5 * Math.sin((now / 1000) * ((Math.PI * 2) / 3.4));

      /**
       * The beat slaves, published only when the *rounded* value changes — and at most every
       * `SLAVE_MIN_INTERVAL_MS`.
       *
       * An inherited custom property invalidates style for every element that reads it, which is the
       * whole console, so a frame that publishes the same number it published last frame (or publishes
       * a number the eye cannot resolve arriving) is a frame that paid a style recalculation for
       * nothing. `--bpmBeat` settles to a constant the moment the damper lands, `--breath` moves on a
       * 0.05 grid, `--kick` on a hundredth.
       */
      if (host && now - lastSlaveAt >= SLAVE_MIN_INTERVAL_MS) {
        const kick = (Math.round(energy.kick / KICK_STEP) * KICK_STEP).toFixed(2);
        const roundedBreath = (Math.round(breath / BREATH_STEP) * BREATH_STEP).toFixed(2);
        const bpmBeat = `${beatSeconds(displayedBpm).toFixed(3)}s`;
        let published = false;
        if (kick !== slaves.kick) {
          slaves.kick = kick;
          host.style.setProperty("--kick", kick);
          published = true;
        }
        if (roundedBreath !== slaves.breath) {
          slaves.breath = roundedBreath;
          host.style.setProperty("--breath", roundedBreath);
          published = true;
        }
        if (bpmBeat !== slaves.bpmBeat) {
          slaves.bpmBeat = bpmBeat;
          host.style.setProperty("--bpmBeat", bpmBeat);
          published = true;
        }
        // Only a publication counts against the interval: an unchanged value costs nothing and must not
        // be able to push the next real change past the cap.
        if (published) lastSlaveAt = now;
      }

      // The progress rail is written here rather than from a React interval so it moves with the disc:
      // one clock, one place, and no state churn at 2.5 Hz.
      if (clock && progressRef?.current) {
        progressRef.current.style.width = `${(loopProgress(clock.step, clock.fraction, state.totalSteps) * 100).toFixed(2)}%`;
      }

      if (!ctx) return;
      const geometry = vinylGeometry(canvas.width / dpr, canvas.height / dpr);

      // A prop change — a new genre, a new pattern, a new skin — is a new picture: the sprites keyed on
      // it rebuild through their own caches, and the draw below has to happen at least once.
      let laneKey = "";
      for (const lane of state.lanes) {
        for (const on of lane) laneKey += on ? "1" : "0";
        laneKey += "|";
      }
      const propKey = `${state.artSeed}~${state.title}~${state.subtitle}~${state.footer}~${state.accent}~${state.totalSteps}~${accentHex}~${displayFont}~${monoFont}~${laneKey}`;
      if (propKey !== lastPropKey) {
        lastPropKey = propKey;
        dirty = true;
      }

      /**
       * The one cheap frame is the one that is not drawn.
       *
       * When every value above has settled the picture is identical to the last one, so the loop keeps
       * its `requestAnimationFrame` — the clock, the slaves and the tempo readout are all still live —
       * and returns without touching the canvas. `paintedIdle` is what makes the *first* settled frame
       * paint: the frame on which the last thing stopped moving still has to be drawn.
       */
      if (idle && paintedIdle && !dirty) return;

      /**
       * The pacing gate: everything above still ran, the paint is what waits.
       *
       * Placed after the state advance so the springs, damper, clock and slaves keep their real time (a
       * skipped frame must not slow the motor), and before `drawScene` so the expensive part is what gets
       * skipped. `dirty` bypasses it: an input the user just made is drawn immediately, at whatever rate,
       * because responsiveness beats a steady rate.
       */
      /** The gap between paints: this is what includes the browser's own raster, which a synchronous
          measurement inside the callback cannot see (it ends when the callback returns). */
      const gapMs = lastPaintedAt ? now - lastPaintedAt : 16.7;
      if (!dirty && lastPaintedAt && gapMs < minFrameMs) return;

      const paintStart = now;
      const shine = Math.min(1, Math.abs(scrubRef.current.velocity) / 16 + Math.min(1, Math.abs(dragVelocity) * 1.1));
      drawScene(now, geometry, energy, breath, shine, dragVelocity);
      /** The synchronous cost of the paint — the part the device would spend again next frame. */
      const paintMs = now - paintStart;
      lastPaintedAt = now;

      /**
       * Adapt the rate to what this device can actually hold.
       *
       * At full rate the question is whether the *gap* is being held: a gap well over 16.7 ms means frames
       * are being dropped, so the floor goes on. At the floor the question is whether there is headroom
       * again, and that is the paint's own cost — a gap of ~33 ms is exactly what the floor asks for, so it
       * says nothing about headroom. `dirty` (a fresh input or a state change) never waits for the floor:
       * responsiveness beats a steady rate.
       */
      if (!minFrameMs) {
        if (gapMs > FRAME_SLOW_GAP_MS) {
          minFrameMs = FRAME_MIN_MS;
          fastRuns = 0;
        }
      } else if (paintMs <= FRAME_FAST_MS) {
        fastRuns += 1;
        if (fastRuns >= FRAME_FAST_RUNS) {
          minFrameMs = 0;
          fastRuns = 0;
        }
      } else {
        fastRuns = 0;
      }
      paintedIdle = idle;
      dirty = false;
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      skinObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
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
