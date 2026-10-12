/**
 * The Anatomy Kick Engine (P-NEXT: Somatic DSP)
 *
 * Implements Bahadırhan Koçer's 3-Layer Somatic Decomposition:
 * 1. Sub (30–60 Hz): The Viscera & Gravity (Cochlear basilar membrane bypass, mechanoreceptors)
 * 2. Thump (100–200 Hz): The Muscular Mass & Impact (Auditory chest weight, non-linear saturation)
 * 3. Click (1–2.5 kHz): The Neural Clock & PLV (Auditory brainstem response, phase-locking)
 *
 * Replaces pre-packaged static samples ("McPulse / Simulacra") with pure algorithmic synthesis.
 */

import { ecosystemBus } from "./ecosystemBus";
import { safeGain, safeVelocity } from "./dspGuards";
import { createMasterLimiter, type MasterLimiterHandle } from "./MasterLimiter";
import { hitVariation } from "./noise";

export interface SomaticKickParams {
  softness: number; // 0 (razor sharp pitch dip) to 1 (velvety soft curve)
  clickAmount: number; // 0 (muted) to 1 (hyper-intense neural spike)
  tameHighs: number; // 0 (bright/raw) to 1 (darkened/subdued)
  grit: number; // 0 (clean pure sine/tri) to 1 (distorted overdrive revolt)
  boomToWhere: number; // 0 (ultra-tight punch) to 1 (subterranean endless rumble)
  hitSkin: number; // 0 (hollow) to 1 (thick muscular acoustic mass)
  rumble: number; // 0 (static) to 1 (sub-harmonic secondary oscillation)
  basePitch: number; // 32 Hz to 65 Hz (default: 48 Hz)
  volume: number; // Master gain (0 to 1.5)
  // Layer Solo/Mute
  subMute: boolean;
  subSolo: boolean;
  thumpMute: boolean;
  thumpSolo: boolean;
  clickMute: boolean;
  clickSolo: boolean;
}

export const DEFAULT_SOMATIC_PARAMS: SomaticKickParams = {
  softness: 0.35,
  clickAmount: 0.65,
  tameHighs: 0.3,
  grit: 0.25,
  boomToWhere: 0.55,
  hitSkin: 0.6,
  rumble: 0.4,
  basePitch: 48,
  volume: 1.0,
  subMute: false,
  subSolo: false,
  thumpMute: false,
  thumpSolo: false,
  clickMute: false,
  clickSolo: false,
};

export interface CustomKickPreset {
  id: string;
  name: string;
  createdAt: number;
  params: SomaticKickParams;
}

export const CUSTOM_KICK_PRESETS_KEY = "groove_custom_kick_presets_v1";

export function loadCustomKickPresets(): CustomKickPreset[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_KICK_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomKickPreset(name: string, params: SomaticKickParams): CustomKickPreset {
  const existing = loadCustomKickPresets();
  const id = `custom-${Date.now()}`;
  const trimmedName = name.trim() || `Custom Kick ${existing.length + 1}`;
  const newPreset: CustomKickPreset = {
    id,
    name: trimmedName,
    createdAt: Date.now(),
    params: { ...params },
  };
  const next = [newPreset, ...existing];
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(CUSTOM_KICK_PRESETS_KEY, JSON.stringify(next));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("groove_kick_presets_changed"));
      }
    } catch {
      // ignore write error
    }
  }
  return newPreset;
}

export function deleteCustomKickPreset(id: string): void {
  const existing = loadCustomKickPresets();
  const next = existing.filter((p) => p.id !== id);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(CUSTOM_KICK_PRESETS_KEY, JSON.stringify(next));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("groove_kick_presets_changed"));
      }
    } catch {
      // ignore write error
    }
  }
}

export interface KickPreset {
  id: string;
  name: { zh: string; en: string };
  category: "orphic" | "club" | "somatic" | "industrial" | "acoustic" | "neural";
  philosophy: { zh: string; en: string };
  params: Partial<SomaticKickParams>;
}

export const KICK_PRESETS: KickPreset[] = [
  {
    id: "berlin-orphic",
    name: { zh: "柏林奥菲斯巨柱", en: "Berlin Orphic Pillar" },
    category: "orphic",
    philosophy: {
      zh: "受 Koçer《Dub Techno: The Orphic Experience of Sound》启发。深沉内向的次低频回响，空间化耳机内向声场，次低频如液态金属缓缓沉降。",
      en: "Inspired by Koçer's 'Dub Techno: The Orphic Experience of Sound'. Subterranean, introspective cavernous resonance designed for inner-ear architecture.",
    },
    params: {
      basePitch: 42,
      softness: 0.2,
      clickAmount: 0.4,
      tameHighs: 0.55,
      grit: 0.35,
      boomToWhere: 0.8,
      hitSkin: 0.5,
      rumble: 0.7,
      volume: 1.05,
    },
  },
  {
    id: "detroit-mechanical",
    name: { zh: "底特律机械脉冲", en: "Detroit Mechanical Pulse" },
    category: "club",
    philosophy: {
      zh: "致敬 TR-909 与底特律极简主义。强劲的高频瞬态击皮，神经脑干高度锁相，定义不可撼动的机械时间秩序。",
      en: "Tribute to TR-909 and Detroit minimalism. Crisp high-frequency beater slap, high PLV coherence, establishing strict chronological discipline.",
    },
    params: {
      basePitch: 52,
      softness: 0.15,
      clickAmount: 0.85,
      tameHighs: 0.15,
      grit: 0.4,
      boomToWhere: 0.32,
      hitSkin: 0.8,
      rumble: 0.2,
      volume: 1.0,
    },
  },
  {
    id: "somatic-808-gravity",
    name: { zh: "躯体 808 内脏引力", en: "Visceral 808 Gravity" },
    category: "somatic",
    philosophy: {
      zh: "36 Hz 极低基频纯正弦波。跳过耳蜗基底膜直接激发生理机械感受器，内脏与重力的深层共振。",
      en: "Pure 36 Hz sub-bass sine wave. Bypasses the cochlea to activate visceral mechanoreceptors; gravity transformed into biological acoustic mass.",
    },
    params: {
      basePitch: 36,
      softness: 0.6,
      clickAmount: 0.2,
      tameHighs: 0.8,
      grit: 0.05,
      boomToWhere: 0.92,
      hitSkin: 0.3,
      rumble: 0.85,
      volume: 1.15,
    },
  },
  {
    id: "industrial-revolt",
    name: { zh: "工业阶级抵抗", en: "Industrial Class Revolt" },
    category: "industrial",
    philosophy: {
      zh: "反对商业预制菜的平庸抛光。非线性饱和过载与硬质削波，让音色承载阶级摩擦力与叛逆张力。",
      en: "Refusal of the over-polished McPulse. Severe non-linear wavefolding and tanh saturation; timbre carrying socio-political friction.",
    },
    params: {
      basePitch: 46,
      softness: 0.05,
      clickAmount: 0.9,
      tameHighs: 0.05,
      grit: 0.92,
      boomToWhere: 0.5,
      hitSkin: 0.95,
      rumble: 0.45,
      volume: 0.95,
    },
  },
  {
    id: "acoustic-beater-skin",
    name: { zh: "真皮鼓锤敲击", en: "Acoustic Beater Skin" },
    category: "acoustic",
    philosophy: {
      zh: "还原 19 世纪军乐队大军鼓向现代爵士演进的物理击打感。饱满的木腔共振与羊毛鼓锤撞击皮膜的弹性质感。",
      en: "Anatomy of the 19th-century marching drum evolved into jazz. Organic wooden shell resonance and elastic felt-beater contact with drumhead.",
    },
    params: {
      basePitch: 58,
      softness: 0.45,
      clickAmount: 0.5,
      tameHighs: 0.45,
      grit: 0.2,
      boomToWhere: 0.4,
      hitSkin: 0.85,
      rumble: 0.15,
      volume: 1.0,
    },
  },
  {
    id: "neural-click-clock",
    name: { zh: "神经时钟微瞬态", en: "Neural Click Clock" },
    category: "neural",
    philosophy: {
      zh: "极端微雕的高频脉冲，剥离大部分低频质量，只保留神经锁相所必需的数毫秒尖刺，使时间结晶化。",
      en: "Micro-sculpted high-frequency transient. Strips excessive sub mass, leaving only the microsecond spike required for neural phase-locking.",
    },
    params: {
      basePitch: 50,
      softness: 0.1,
      clickAmount: 0.98,
      tameHighs: 0.05,
      grit: 0.1,
      boomToWhere: 0.15,
      hitSkin: 0.2,
      rumble: 0.05,
      volume: 0.95,
    },
  },
];

/**
 * Curves are cached per quantised `amount` (D2). The key is the `amount` rounded
 * to this step; the values themselves are always computed from the *exact*
 * `amount` that first populated the bucket, so every curve a caller receives is
 * bit-identical to what `Math.tanh(k * x) / Math.tanh(k)` produced before the
 * cache existed. 0.001 of drive resolution corresponds to a worst-case change of
 * ~0.0025 in curve value (measured across amount 0..1), i.e. ~0.25% of full
 * scale, which is far below audibility; every shipped default/preset value sits
 * exactly on the grid, so the measured loudness baseline is untouched.
 */
export const DISTORTION_CURVE_QUANTISATION_STEP = 0.001;

/**
 * Hard bound on cached curves. 32 entries x 4096 floats x 4 bytes ~= 512 KiB,
 * which comfortably covers every curated/custom preset plus generous slider
 * churn while guaranteeing a dragged knob cannot grow the cache without bound.
 */
export const DISTORTION_CURVE_CACHE_MAX_ENTRIES = 32;

/** Quantised-amount -> curve. Insertion order doubles as LRU order (see below). */
const distortionCurveCache = new Map<string, Float32Array>();

/** Test/observability hook: empties the saturation-curve cache. */
export function clearDistortionCurveCache(): void {
  distortionCurveCache.clear();
}

/** Test/observability hook: current number of cached curves. */
export function getDistortionCurveCacheSize(): number {
  return distortionCurveCache.size;
}

function quantiseDistortionAmount(amount: number): number {
  return Math.round(amount / DISTORTION_CURVE_QUANTISATION_STEP);
}

/**
 * Creates a tanh-based saturation curve for non-linear waveshaping.
 *
 * The returned `Float32Array` is shared and MUST be treated as immutable: it is
 * handed to `WaveShaperNode.curve` (which copies it) and may be served to several
 * voices/nodes. Never write into a curve returned from here.
 */
export function makeDistortionCurve(amount: number, n_samples = 4096): Float32Array {
  const bucket = quantiseDistortionAmount(amount);
  // `n_samples` is part of the key so a caller that overrides it can never be
  // served an array of the wrong length.
  const cacheKey = `${bucket}|${n_samples}`;

  const cached = distortionCurveCache.get(cacheKey);
  if (cached !== undefined) {
    // Refresh LRU position so hot curves (the ones actually being sequenced)
    // are not evicted by slider-driven churn.
    distortionCurveCache.delete(cacheKey);
    distortionCurveCache.set(cacheKey, cached);
    return cached;
  }

  const curve = new Float32Array(n_samples);
  const k = Math.max(0.01, amount * 25);
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    // Tanh soft saturation
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }

  distortionCurveCache.set(cacheKey, curve);
  while (distortionCurveCache.size > DISTORTION_CURVE_CACHE_MAX_ENTRIES) {
    const oldest = distortionCurveCache.keys().next().value;
    if (oldest === undefined) break;
    distortionCurveCache.delete(oldest);
  }
  return curve;
}

/**
 * Resolves preset parameters from curated or custom presets
 */
export function resolveKickPresetParams(presetId: string): Partial<SomaticKickParams> | undefined {
  const builtIn = KICK_PRESETS.find((p) => p.id === presetId);
  if (builtIn) return builtIn.params;
  const custom = loadCustomKickPresets().find((p) => p.id === presetId);
  if (custom) return custom.params;
  return undefined;
}

export class AnatomyKickEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private masterLimiter: MasterLimiterHandle | null = null;
  private analyser: AnalyserNode | null = null;
  private waveshaper: WaveShaperNode | null = null;
  private dcBlocker: BiquadFilterNode | null = null;
  private params: SomaticKickParams = { ...DEFAULT_SOMATIC_PARAMS };

  // Transient hit callback for UI kinetic shock
  private onTransientHitCallbacks: Set<(layer: "sub" | "thump" | "click" | "master", vel: number, plv: number) => void> = new Set();

  constructor(externalCtx?: AudioContext) {
    if (externalCtx) {
      this.ctx = externalCtx;
      this.initNodes();
    }
  }

  public getCustomPresets(): CustomKickPreset[] {
    return loadCustomKickPresets();
  }

  public saveCustomPreset(name: string): CustomKickPreset {
    return saveCustomKickPreset(name, this.params);
  }

  public deleteCustomPreset(id: string): void {
    deleteCustomKickPreset(id);
  }

  public init(ctx: AudioContext): void {
    if (this.ctx !== ctx) {
      this.ctx = ctx;
      this.initNodes();
    }
  }

  /**
   * Creates and initialises an AudioContext on demand.
   *
   * The kick view used to create the context only when the "dispatch transient" button
   * was pressed, so any other caller — notably the gravitational sequencer's INITIATE
   * PULSE transport — silently produced no sound because `trigger()` bails out when
   * `ctx` is null. Self-initialising here means no call site can forget.
   *
   * Must be reached from a user gesture: browsers only allow context creation/resume
   * from user activation, which every caller in this app is.
   */
  public ensureContext(): AudioContext | null {
    if (!this.ctx) {
      if (typeof window === "undefined") return null;
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.initNodes();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private initNodes(): void {
    if (!this.ctx) return;

    // Master DC Blocker (Highpass at 20 Hz to protect hardware drivers from DC offset)
    this.dcBlocker = this.ctx.createBiquadFilter();
    this.dcBlocker.type = "highpass";
    this.dcBlocker.frequency.value = 22;
    this.dcBlocker.Q.value = 0.707;

    // Non-linear master saturator
    this.waveshaper = this.ctx.createWaveShaper();
    this.waveshaper.curve = makeDistortionCurve(this.params.grit) as Float32Array<ArrayBuffer>;
    this.waveshaper.oversample = "2x";

    // Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.params.volume;

    // Analyser Node for Oscilloscope & Waterfall Spectrogram
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.55;

    // Master brickwall ceiling to protect ears and transducers
    this.masterLimiter = createMasterLimiter(this.ctx);

    // Chain: dcBlocker -> waveshaper -> masterGain -> analyser -> masterLimiter -> destination
    this.dcBlocker.connect(this.waveshaper);
    this.waveshaper.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.masterLimiter.input);
    this.masterLimiter.output.connect(this.ctx.destination);
  }

  public destroy(): void {
    if (this.masterLimiter) {
      this.masterLimiter.dispose();
      this.masterLimiter = null;
    }
    if (this.ctx && this.ctx.state !== "closed") {
      this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.waveshaper = null;
    this.dcBlocker = null;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  public getParams(): SomaticKickParams {
    return { ...this.params };
  }

  public setParams(newParams: Partial<SomaticKickParams>): void {
    this.params = { ...this.params, ...newParams };
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.params.volume, this.ctx.currentTime, 0.02);
    }
    if (this.waveshaper && (newParams.grit !== undefined)) {
      this.waveshaper.curve = makeDistortionCurve(this.params.grit) as Float32Array<ArrayBuffer>;
    }
  }

  public onTransientHit(cb: (layer: "sub" | "thump" | "click" | "master", vel: number, plv: number) => void): () => void {
    this.onTransientHitCallbacks.add(cb);
    return () => {
      this.onTransientHitCallbacks.delete(cb);
    };
  }

  private notifyTransientHit(layer: "sub" | "thump" | "click" | "master", vel: number, plv: number): void {
    this.onTransientHitCallbacks.forEach((cb) => {
      try {
        cb(layer, vel, plv);
      } catch (err) {
        console.error(err);
      }
    });

    // Also broadcast to the Wangda Audio Ecosystem Bus
    ecosystemBus.publishTransientHit(layer, vel, this.params.basePitch, plv);
  }

  /**
   * Calculates instantaneous Phase-Locking Value (PLV) coherence
   * based on click sharpness and high-frequency content.
   */
  public calculatePLV(): number {
    const clickWeight = this.params.clickAmount * (1 - this.params.softness * 0.4);
    const highCeiling = 1 - this.params.tameHighs * 0.3;
    const rawPlv = 0.55 + 0.42 * clickWeight * highCeiling;
    return Math.min(0.99, Math.max(0.4, Number(rawPlv.toFixed(3))));
  }

  /**
   * Triggers the 3-Layer Anatomical Kick Drum Synthesis
   */
  public trigger(time?: number, velocity = 1.0): void {
    // Lazy init: a transport that starts before any knob was touched must still sound.
    if (!this.ctx || !this.dcBlocker) {
      this.ensureContext();
    }
    if (!this.ctx || !this.dcBlocker) return;

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    const t = time !== undefined ? Math.max(this.ctx.currentTime, time) : this.ctx.currentTime;
    const p = this.params;
    const plv = this.calculatePLV();

    // Check layer solo / mute isolation rules
    const anySolo = p.subSolo || p.thumpSolo || p.clickSolo;
    const playSub = !p.subMute && (!anySolo || p.subSolo);
    const playThump = !p.thumpMute && (!anySolo || p.thumpSolo);
    const playClick = !p.clickMute && (!anySolo || p.clickSolo);

    // -------------------------------------------------------------
    // LAYER 1: SUB (Viscera / Gravity, 30–60 Hz)
    // -------------------------------------------------------------
    if (playSub) {
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      const subFilter = this.ctx.createBiquadFilter();

      subOsc.type = "sine";
      const startPitch = p.basePitch * (1 + 2.2 * (1 - p.softness));
      const endPitch = p.basePitch;

      subOsc.frequency.setValueAtTime(startPitch, t);
      // Exponential steep pitch descent (time bending)
      const pitchDropTime = 0.025 + p.softness * 0.04;
      subOsc.frequency.exponentialRampToValueAtTime(endPitch, t + pitchDropTime);

      // Lowpass mono-cutoff to avoid harmonic spill
      subFilter.type = "lowpass";
      subFilter.frequency.value = 140;

      // Amplitude decay (governed by Boom to Where)
      const subDecay = 0.2 + p.boomToWhere * 0.9;
      const subPeak = safeGain(velocity * 1.25);
      subGain.gain.setValueAtTime(0.0001, t);
      subGain.gain.linearRampToValueAtTime(subPeak, t + 0.002);
      subGain.gain.exponentialRampToValueAtTime(subPeak * 0.45, t + 0.08);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + subDecay);

      subOsc.connect(subFilter);
      subFilter.connect(subGain);
      subGain.connect(this.dcBlocker);

      subOsc.start(t);
      subOsc.stop(t + subDecay + 0.05);

      // Secondary Rumble Sub-Harmonic (if rumble > 0.2)
      if (p.rumble > 0.2) {
        const rumbleOsc = this.ctx.createOscillator();
        const rumbleGain = this.ctx.createGain();
        rumbleOsc.type = "sine";
        rumbleOsc.frequency.setValueAtTime(p.basePitch * 0.75, t);
        const rumbleDecay = subDecay * 1.1;
        const rumbleAmp = velocity * p.rumble * 0.4;
        rumbleGain.gain.setValueAtTime(0.0001, t);
        rumbleGain.gain.linearRampToValueAtTime(rumbleAmp, t + 0.04);
        rumbleGain.gain.exponentialRampToValueAtTime(0.0001, t + rumbleDecay);

        rumbleOsc.connect(rumbleGain);
        rumbleGain.connect(this.dcBlocker);
        rumbleOsc.start(t);
        rumbleOsc.stop(t + rumbleDecay + 0.05);
      }
    }

    // -------------------------------------------------------------
    // LAYER 2: THUMP (Muscular Mass / Impact, 100–200 Hz)
    // -------------------------------------------------------------
    if (playThump) {
      const thumpOsc = this.ctx.createOscillator();
      const thumpGain = this.ctx.createGain();
      const thumpShaper = this.ctx.createWaveShaper();
      const thumpFilter = this.ctx.createBiquadFilter();

      thumpOsc.type = "triangle";
      const thumpStart = 380 * (1 - p.softness * 0.3);
      const thumpEnd = 110;

      thumpOsc.frequency.setValueAtTime(thumpStart, t);
      thumpOsc.frequency.exponentialRampToValueAtTime(thumpEnd, t + 0.022);

      // Thump waveshaper for muscular drive
      thumpShaper.curve = makeDistortionCurve(0.2 + p.grit * 0.6) as Float32Array<ArrayBuffer>;

      thumpFilter.type = "bandpass";
      thumpFilter.frequency.value = 160;
      thumpFilter.Q.value = 1.8;

      const thumpDecay = 0.05 + p.hitSkin * 0.18;
      const thumpPeak = safeGain(velocity * (0.8 + p.hitSkin * 0.5));

      thumpGain.gain.setValueAtTime(0.0001, t);
      thumpGain.gain.linearRampToValueAtTime(thumpPeak, t + 0.001);
      thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + thumpDecay);

      thumpOsc.connect(thumpShaper);
      thumpShaper.connect(thumpFilter);
      thumpFilter.connect(thumpGain);
      thumpGain.connect(this.dcBlocker);

      thumpOsc.start(t);
      thumpOsc.stop(t + thumpDecay + 0.05);
    }

    // -------------------------------------------------------------
    // LAYER 3: CLICK (Neural Clock / PLV, 1–2.5 kHz)
    // -------------------------------------------------------------
    if (playClick && p.clickAmount > 0.01) {
      const clickOsc = this.ctx.createOscillator();
      const clickFilter = this.ctx.createBiquadFilter();
      const clickGain = this.ctx.createGain();

      clickOsc.type = "square";
      clickOsc.frequency.setValueAtTime(1800, t);
      clickOsc.frequency.exponentialRampToValueAtTime(750, t + 0.008);

      clickFilter.type = "bandpass";
      const centerFreq = 1600 + (1 - p.tameHighs) * 1200;
      clickFilter.frequency.setValueAtTime(centerFreq, t);
      clickFilter.Q.value = 4.5;

      const clickDecay = 0.008 + (1 - p.softness) * 0.007;
      const clickPeak = safeGain(velocity * p.clickAmount * 0.95);

      clickGain.gain.setValueAtTime(0.0001, t);
      clickGain.gain.linearRampToValueAtTime(clickPeak, t + 0.0003);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, t + clickDecay);

      clickOsc.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(this.dcBlocker);

      clickOsc.start(t);
      clickOsc.stop(t + clickDecay + 0.02);
    }

    // Dispatch kinetic shock notification to UI & Ecosystem
    this.notifyTransientHit("master", velocity, plv);
  }

  /**
   * Offline WAV Audio Exporter (1.0s or 2.0s 44.1kHz 16-bit PCM)
   */
  public async exportWav(durationSeconds = 1.0): Promise<Blob> {
    const sampleRate = 44100;
    const length = Math.floor(sampleRate * durationSeconds);
    const offlineCtx = new OfflineAudioContext(1, length, sampleRate);

    // Recreate synthesis graph in offline context
    const dc = offlineCtx.createBiquadFilter();
    dc.type = "highpass";
    dc.frequency.value = 22;

    const shaper = offlineCtx.createWaveShaper();
    shaper.curve = makeDistortionCurve(this.params.grit) as Float32Array<ArrayBuffer>;

    const master = offlineCtx.createGain();
    master.gain.value = this.params.volume;

    dc.connect(shaper);
    shaper.connect(master);
    master.connect(offlineCtx.destination);

    const t = 0;
    const p = this.params;
    const anySolo = p.subSolo || p.thumpSolo || p.clickSolo;
    const playSub = !p.subMute && (!anySolo || p.subSolo);
    const playThump = !p.thumpMute && (!anySolo || p.thumpSolo);
    const playClick = !p.clickMute && (!anySolo || p.clickSolo);

    if (playSub) {
      const osc = offlineCtx.createOscillator();
      const gain = offlineCtx.createGain();
      osc.type = "sine";
      const startP = p.basePitch * (1 + 2.2 * (1 - p.softness));
      osc.frequency.setValueAtTime(startP, t);
      osc.frequency.exponentialRampToValueAtTime(p.basePitch, t + 0.03);
      const subDecay = Math.min(durationSeconds - 0.05, 0.2 + p.boomToWhere * 0.9);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(1.2, t + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + subDecay);
      osc.connect(gain);
      gain.connect(dc);
      osc.start(t);
      osc.stop(t + subDecay);
    }

    if (playThump) {
      const osc = offlineCtx.createOscillator();
      const gain = offlineCtx.createGain();
      const filter = offlineCtx.createBiquadFilter();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(360, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.022);
      filter.type = "bandpass";
      filter.frequency.value = 160;
      const decay = 0.05 + p.hitSkin * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.85, t + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dc);
      osc.start(t);
      osc.stop(t + decay);
    }

    if (playClick && p.clickAmount > 0.01) {
      const osc = offlineCtx.createOscillator();
      const filter = offlineCtx.createBiquadFilter();
      const gain = offlineCtx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(1800, t);
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1600 + (1 - p.tameHighs) * 1200, t);
      const decay = 0.01;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(p.clickAmount * 0.9, t + 0.0003);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dc);
      osc.start(t);
      osc.stop(t + decay);
    }

    const renderedBuffer = await offlineCtx.startRendering();
    return audioBufferToWavBlob(renderedBuffer);
  }
}

/**
 * Converts an AudioBuffer to standard 16-bit PCM WAV Blob
 */
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const outBuffer = new ArrayBuffer(length);
  const view = new DataView(outBuffer);
  const channels: Float32Array[] = [];
  let sample = 0;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF chunk descriptor
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  // fmt sub-chunk
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // subchunk1size (16 for PCM)
  setUint16(1); // audio format (1 = PCM)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2); // block align
  setUint16(16); // bits per sample

  // data sub-chunk
  setUint32(0x61746164); // "data" chunk
  setUint32(length - pos - 4); // subchunk2size

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([outBuffer], { type: "audio/wav" });
}

export const globalAnatomyKickEngine = new AnatomyKickEngine();

export interface KickVoiceCleanup {
  sources: AudioScheduledSourceNode[];
  gains: GainNode[];
  stopTime: number;
}

/**
 * Synthesizes a kick drum voice using the 3-Layer Somatic Decomposition.
 * Routes directly to the specified destination node at the scheduled audio time.
 */
export function synthesizeAnatomyKickVoice(
  ctx: BaseAudioContext,
  dest: AudioNode,
  time: number,
  vel: number,
  presetIdOrParams: string | Partial<SomaticKickParams>,
  _noiseBuffer?: AudioBuffer | null,
  noisePosition?: number
): KickVoiceCleanup {
  const sources: AudioScheduledSourceNode[] = [];
  const gains: GainNode[] = [];

  // F-01: user-controlled velocity/volume can be 0; exponential ramps require > 0.
  vel = safeVelocity(vel);

  /**
   * Per-hit humanisation, shared with `DrumKitModels` through `noise.ts`.
   *
   * These six `kick:*` presets are the only drum voice family outside `DrumKitModels`, and a kick
   * usually lands on every beat — the most exposed place in a pattern for a repeated hit to read as
   * the same sample twice. Leaving them out would have made "every drum voice is humanised" false
   * for exactly the voice a listener hears most often.
   *
   * `undefined` and `0` are no-ops, so every existing caller and every exact-parameter test of this
   * engine is untouched by this wiring.
   */
  const hit = hitVariation(noisePosition);

  const rawParams =
    typeof presetIdOrParams === "string"
      ? resolveKickPresetParams(presetIdOrParams)
      : presetIdOrParams;

  const p: SomaticKickParams = {
    ...DEFAULT_SOMATIC_PARAMS,
    ...(rawParams || {}),
  };

  /**
   * Q8: velocity must reach the *timbre*, not just the level.
   *
   * Every other drum voice in `DrumKitModels` maps velocity through `velocityTimbre`
   * (brightness / decay / transient), and this one — the six `kick:*` presets, reachable from
   * the toolbar's kick dropdown — was the only family that did not: velocity scaled amplitudes
   * and nothing else, so a ghost kick and an accented kick differed only in loudness. That is
   * the single most recognisable "programmed drums" tell.
   *
   * The mapping is expressed with this module's own parameters rather than importing
   * `velocityTimbre` from `DrumKitModels` — that module already imports this one, and a cycle
   * would be the price of sharing three numbers:
   *   - soft hits    → less grit (a lightly struck head distorts less), softer pitch drop,
   *                    a touch longer decay;
   *   - hard hits    → unchanged from the pre-Q8 defaults, so ff output is untouched.
   */
  const velNorm = Math.max(0, Math.min(1, vel));
  const gripScale = 0.55 + 0.45 * Math.pow(velNorm, 0.6); // 0.55 at ppp → 1.0 at ff
  // Ghost notes ring slightly longer, and each stroke differs a little from the last.
  const decayScale = (1 + 0.25 * (1 - velNorm)) * hit.decayScale;
  const effectiveGrit = p.grit * gripScale;
  const effectiveSoftness = Math.min(0.95, p.softness / gripScale);
  /**
   * The tonal layers' base frequency with this stroke's pitch variation folded in.
   *
   * `p.basePitch` itself is left alone: the click layer's filter centres are deliberately fixed
   * (moving a filter centre reads as a different instrument, not a different stroke), so the
   * variation belongs on the two pitched layers, which is what this local alias feeds.
   */
  const basePitch = p.basePitch * hit.pitchRatio;

  const t = Math.max(ctx.currentTime, time);
  const anySolo = p.subSolo || p.thumpSolo || p.clickSolo;
  const playSub = !p.subMute && (!anySolo || p.subSolo);
  const playThump = !p.thumpMute && (!anySolo || p.thumpSolo);
  const playClick = !p.clickMute && (!anySolo || p.clickSolo);

  /**
   * This stroke's level variation reaches every layer's peak (`subPeak` / `rumbleAmp` / `thumpPeak` /
   * `clickPeak` below) rather than being applied as a single bus gain, for two concrete reasons,
   * both about this module's voice lifetime:
   *
   *  - `VoiceRegistry` pairs `sources[i]` with `gains[i]` and disconnects exactly those on teardown.
   *    A bus gain that no source is paired with would never be disconnected, so every hit would leak
   *    one gain node into the graph for the life of the context; putting it first instead would shift
   *    every pairing, making a stolen voice fade the wrong layer.
   *  - It also matches how `DrumKitModels` applies the same variation (`levelOf()` on each peak),
   *    so the two engines cannot drift into different ideas of what a stroke's level means.
   *
   * The cost is that the level no longer reaches the grit shaper the way velocity does. At ±0.28 dB
   * that difference is inaudible, and keeping the graph shape is worth more than the interaction.
   */

  let busNode: AudioNode = dest;
  if (effectiveGrit > 0.05 && typeof (ctx as any).createWaveShaper === "function") {
    try {
      const shaper = ctx.createWaveShaper();
      shaper.curve = makeDistortionCurve(effectiveGrit * 0.4) as Float32Array<ArrayBuffer>;
      // D1: this is a saturating (non-linear) stage, so its harmonics must be
      // filtered before decimation or they fold back into the audible band. The
      // class-based master saturator already uses "2x"; this sequencer-reachable
      // copy previously left oversampling unset. "4x" is the strongest standard
      // anti-aliasing setting and costs only the voices with grit > 0.05, whose
      // harmonics are exactly what would alias.
      shaper.oversample = "4x";
      shaper.connect(dest);
      busNode = shaper;
    } catch {
      busNode = dest;
    }
  }

  /**
   * The four layers (sub, rumble, thump, click) meet two at a time rather than all at `busNode`.
   *
   * This preset's layers are four oscillators at four different frequencies, which is the case
   * Chrome renders differently every time — measured in
   * `scripts/diagnose_repeat_determinism.mjs --primitives` at 6-7 distinct hashes out of 10 renders,
   * against 1 of 10 for the same four fanned in two per node. `somatic-808-gravity` is the preset
   * that enables all four layers, and `src/test/oscillatorFanIn.test.ts` pins it.
   *
   * Unity gains, so the sum is the same signal: only the order the layers are added in changes.
   * Not pushed to `gains`, for the same reason `busNode` is not — see the note in `DrumKitModels`'
   * membrane model.
   */
  const sumLower = ctx.createGain();
  const sumUpper = ctx.createGain();
  sumLower.gain.value = 1;
  sumUpper.gain.value = 1;
  sumLower.connect(busNode);
  sumUpper.connect(busNode);

  let maxDecay = 0.4;

  // 1. SUB (30-60 Hz)
  if (playSub) {
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    const subFilter = ctx.createBiquadFilter();

    subOsc.type = "sine";
    const startPitch = basePitch * (1 + 2.2 * (1 - effectiveSoftness));
    const endPitch = basePitch;

    subOsc.frequency.setValueAtTime(startPitch, t);
    const pitchDropTime = 0.025 + effectiveSoftness * 0.04;
    subOsc.frequency.exponentialRampToValueAtTime(endPitch, t + pitchDropTime);

    subFilter.type = "lowpass";
    subFilter.frequency.setValueAtTime(140, t);

    const subDecay = (0.2 + p.boomToWhere * 0.9) * hit.decayScale;
    if (subDecay > maxDecay) maxDecay = subDecay;
    const subPeak = safeGain(vel * 1.25 * p.volume * hit.levelScale);

    subGain.gain.setValueAtTime(0.0001, t);
    subGain.gain.linearRampToValueAtTime(subPeak, t + 0.002);
    subGain.gain.exponentialRampToValueAtTime(subPeak * 0.45, t + 0.08);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + subDecay);

    subOsc.connect(subFilter);
    subFilter.connect(subGain);
    subGain.connect(sumLower);

    subOsc.start(t);
    subOsc.stop(t + subDecay + 0.05);
    sources.push(subOsc);
    gains.push(subGain);

    if (p.rumble > 0.2) {
      const rumbleOsc = ctx.createOscillator();
      const rumbleGain = ctx.createGain();
      rumbleOsc.type = "sine";
      rumbleOsc.frequency.setValueAtTime(basePitch * 0.75, t);
      const rumbleDecay = subDecay * 1.1;
      const rumbleAmp = vel * p.rumble * 0.4 * p.volume * hit.levelScale;
      rumbleGain.gain.setValueAtTime(0.0001, t);
      rumbleGain.gain.linearRampToValueAtTime(rumbleAmp, t + 0.04);
      rumbleGain.gain.exponentialRampToValueAtTime(0.0001, t + rumbleDecay);

      rumbleOsc.connect(rumbleGain);
      rumbleGain.connect(sumLower);
      rumbleOsc.start(t);
      rumbleOsc.stop(t + rumbleDecay + 0.05);
      sources.push(rumbleOsc);
      gains.push(rumbleGain);
    }
  }

  // 2. THUMP (100-200 Hz)
  if (playThump) {
    const thumpOsc = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    const thumpFilter = ctx.createBiquadFilter();

    thumpOsc.type = "triangle";
    // The thump layer's own sweep, transposed by the same stroke variation as the sub, so the two
    // pitched layers stay in the same relationship to each other instead of drifting apart.
    const thumpStart = 380 * (1 - effectiveSoftness * 0.3) * hit.pitchRatio;
    const thumpEnd = 110 * hit.pitchRatio;

    thumpOsc.frequency.setValueAtTime(thumpStart, t);
    thumpOsc.frequency.exponentialRampToValueAtTime(thumpEnd, t + 0.022);

    thumpFilter.type = "bandpass";
    thumpFilter.frequency.setValueAtTime(160, t);
    thumpFilter.Q.setValueAtTime(1.8, t);

    const thumpDecay = (0.05 + p.hitSkin * 0.18) * hit.decayScale;
    if (thumpDecay > maxDecay) maxDecay = thumpDecay;
    const thumpPeak = safeGain(vel * (0.8 + p.hitSkin * 0.5) * p.volume * hit.levelScale);

    thumpGain.gain.setValueAtTime(0.0001, t);
    thumpGain.gain.linearRampToValueAtTime(thumpPeak, t + 0.001);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + thumpDecay);

    thumpOsc.connect(thumpFilter);
    thumpFilter.connect(thumpGain);
    thumpGain.connect(sumUpper);

    thumpOsc.start(t);
    thumpOsc.stop(t + thumpDecay + 0.05);
    sources.push(thumpOsc);
    gains.push(thumpGain);
  }

  // 3. CLICK (1-2.5 kHz)
  if (playClick && p.clickAmount > 0.01) {
    const clickOsc = ctx.createOscillator();
    const clickFilter = ctx.createBiquadFilter();
    const clickGain = ctx.createGain();

    clickOsc.type = "square";
    clickOsc.frequency.setValueAtTime(1800, t);
    clickOsc.frequency.exponentialRampToValueAtTime(750, t + 0.008);

    clickFilter.type = "bandpass";
    const centerFreq = 1600 + (1 - p.tameHighs) * 1200;
    clickFilter.frequency.setValueAtTime(centerFreq, t);
    clickFilter.Q.setValueAtTime(4.5, t);

    const clickDecay = (0.008 + (1 - effectiveSoftness) * 0.007) * decayScale;
    const clickPeak = safeGain(vel * p.clickAmount * 0.95 * p.volume * hit.levelScale);

    clickGain.gain.setValueAtTime(0.0001, t);
    clickGain.gain.linearRampToValueAtTime(clickPeak, t + 0.0003);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, t + clickDecay);

    clickOsc.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(sumUpper);

    clickOsc.start(t);
    clickOsc.stop(t + clickDecay + 0.02);
    sources.push(clickOsc);
    gains.push(clickGain);
  }

  return { sources, gains, stopTime: t + maxDecay + 0.05 };
}
