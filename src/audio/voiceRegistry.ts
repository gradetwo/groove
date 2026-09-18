/**
 * Shared audio-engine plumbing (A-05).
 *
 * The three engines each grew their own copy of the same infrastructure:
 *   - AudioEngine        : activeVoices[] + registerVoice + panic + limiter config
 *   - ChordAudioEngine   : activeVoices[] + registerVoice + panic + limiter config
 *                          + its own AudioContext bootstrap + its own unlock listeners
 *   - MasterclassAudioEngine: no voice tracking at all, so `stop()` left already
 *                          scheduled voices sounding
 *
 * This module holds the single implementation. Engines keep their own synthesis and
 * scheduling; only the shared lifecycle pieces live here.
 */

export interface ScheduledVoice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
  /** Context time at which the voice is expected to have finished. */
  stopTime: number;
}

/** Hard cap so a long session cannot retain unbounded voice bookkeeping. */
export const MAX_TRACKED_VOICES = 512;

/**
 * Q14: tears down the two nodes every voice owns once the voice is silent.
 *
 * `onended` is the portable "this source has finished" signal. Attaching it (rather than
 * disconnecting eagerly at `stopTime`) means the graph is only dismantled after the browser has
 * actually stopped rendering the source, so the disconnect can never truncate a tail. Guarded
 * throughout: a source may already be stopped or disconnected by panic/steal, and tearing down
 * twice must be a no-op.
 */
export function releaseVoiceNodes(voice: ScheduledVoice): void {
  const { source, gain } = voice;
  try {
    const fire = () => {
      try {
        gain.disconnect();
      } catch {
        // Already disconnected.
      }
      try {
        source.disconnect();
      } catch {
        // Already disconnected.
      }
    };
    if (typeof source.addEventListener === "function") {
      // `once` so a source that fires onended more than once cannot double-disconnect.
      source.addEventListener("ended", fire, { once: true });
    } else {
      (source as { onended?: (() => void) | null }).onended = fire;
    }
  } catch {
    // A node type that refuses listeners simply keeps its old (GC-dependent) behaviour.
  }
}

/** Fade applied by `panic()` so voices stop without a click. */
export const PANIC_FADE_SEC = 0.005;

/**
 * E-08: default ceiling on *simultaneously sounding* tracked source nodes.
 *
 * The engine has no voice pool and no polyphony limit — every note builds a fresh node
 * graph — so a dense 1/32 pattern, a stuck MIDI controller or a long release could pile
 * up without bound. This is the safety net.
 *
 * It is counted in tracked **sources**, not musical notes: a `PolySynth` note registers
 * two oscillators and a 909 clap registers four buffer sources, so 128 sources is
 * roughly 32 simultaneous melodic notes. The default is deliberately generous so it
 * never engages during normal playback and therefore cannot colour the sound — it exists
 * to bound the pathological case (and to give the planned GS-1 engine drop-in a real
 * voice budget to allocate against).
 */
export const DEFAULT_MAX_ACTIVE_VOICES = 128;

/** Fade applied when a voice is stolen, so stealing is inaudible rather than a click. */
export const STEAL_FADE_SEC = 0.005;

/**
 * Tracks scheduled voices so `stop()`/`panic()` can cancel them, and so stale
 * entries are pruned instead of growing forever.
 */
export class VoiceRegistry {
  private voices: ScheduledVoice[] = [];
  private maxActiveVoices: number;
  private stolenVoices = 0;

  constructor(
    private readonly now: () => number,
    maxActiveVoices: number = DEFAULT_MAX_ACTIVE_VOICES
  ) {
    this.maxActiveVoices = VoiceRegistry.sanitizeCap(maxActiveVoices);
  }

  private static sanitizeCap(value: number): number {
    if (!Number.isFinite(value) || value < 1) return DEFAULT_MAX_ACTIVE_VOICES;
    return Math.floor(value);
  }

  /**
   * Sets the polyphony ceiling. Exposed so an engine can budget against the host's
   * capability (and so tests can drive the cap down to a few voices).
   */
  setMaxActiveVoices(value: number): void {
    this.maxActiveVoices = VoiceRegistry.sanitizeCap(value);
  }

  get maxVoices(): number {
    return this.maxActiveVoices;
  }

  /** Sources currently believed to be sounding. */
  get activeVoices(): number {
    return this.voices.length;
  }

  /** How many voices have been stolen since construction — a load diagnostic. */
  get stealCount(): number {
    return this.stolenVoices;
  }

  /**
   * Smoothly stops one voice and removes it from the registry.
   *
   * The ramp starts from wherever the envelope currently is rather than from a fixed
   * value: an unconditional `setValueAtTime(0)` here would itself be a step
   * discontinuity — the same broadband-impulse click that E-02 fixed in the synth
   * envelope.
   */
  private releaseVoice(voice: ScheduledVoice, now: number, fadeSec: number): void {
    try {
      const gain = voice.gain.gain;
      if (typeof gain.cancelScheduledValues === "function") gain.cancelScheduledValues(now);
      if (typeof gain.setValueAtTime === "function") {
        gain.setValueAtTime(Math.max(0, gain.value), now);
      }
      if (typeof gain.linearRampToValueAtTime === "function") {
        gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      }
      voice.source.stop(now + fadeSec + 0.001);
    } catch {
      // The node may already be stopped or disconnected; nothing to do.
    }
  }

  /**
   * Frees one slot by stealing the voice that is **closest to finishing anyway**.
   *
   * Stealing the oldest voice is the textbook rule, but the least audible victim is the
   * one whose own `stop()` is nearest, so that is what is chosen here. Returns false when
   * there is nothing left to steal, so the caller can still make progress.
   */
  private stealQuietest(now: number): boolean {
    if (this.voices.length === 0) return false;
    let victimIdx = 0;
    for (let i = 1; i < this.voices.length; i++) {
      if (this.voices[i].stopTime < this.voices[victimIdx].stopTime) victimIdx = i;
    }
    const victim = this.voices[victimIdx];
    this.releaseVoice(victim, now, STEAL_FADE_SEC);
    this.voices.splice(victimIdx, 1);
    this.stolenVoices += 1;
    return true;
  }

  /** Records a voice that has already been scheduled. */
  register(source: AudioScheduledSourceNode, gain: GainNode, stopTime: number): void {
    const now = this.now();
    this.prune(now);
    // Make room before admitting the new voice, so the cap is never exceeded.
    while (this.voices.length >= this.maxActiveVoices) {
      if (!this.stealQuietest(now)) break;
    }
    const voice: ScheduledVoice = { source, gain, stopTime };
    // Q14: arm the teardown now, so a voice that simply plays to its end is disconnected even
    // if nothing calls `prune` afterwards.
    releaseVoiceNodes(voice);
    this.voices.push(voice);
    if (this.voices.length > MAX_TRACKED_VOICES) {
      this.voices.splice(0, this.voices.length - MAX_TRACKED_VOICES);
    }
  }

  /**
   * Drops voices that have already finished.
   *
   * Q14: finished voices are **released**, not just forgotten.
   *
   * Every note builds a fresh node graph and nothing ever disconnected it — `prune` only
   * dropped the bookkeeping, so the registry's reference went away while the nodes stayed
   * wired into the track strip. Whether the browser eventually collects a finished but still
   * connected subgraph is implementation-defined; relying on that is a retention and GC-pause
   * risk that grows with session length, and a dense pattern builds hundreds of nodes per bar.
   * `source.onended` is the portable signal that the graph is silent, so each voice tears
   * itself down once, guarded so a re-entrant call or an already-stopped source is harmless.
   */
  prune(now = this.now()): void {
    if (this.voices.length === 0) return;
    const surviving: ScheduledVoice[] = [];
    for (const voice of this.voices) {
      if (voice.stopTime > now) {
        surviving.push(voice);
      } else {
        releaseVoiceNodes(voice);
      }
    }
    this.voices = surviving;
  }

  /**
   * Smoothly cancels every tracked voice. Safe to call when nothing is playing and
   * safe against voices that a browser has already stopped.
   */
  panic(): void {
    const now = this.now();
    for (const voice of this.voices) {
      this.releaseVoice(voice, now, PANIC_FADE_SEC);
    }
    this.voices = [];
  }

  clear(): void {
    this.voices = [];
  }

  get size(): number {
    return this.voices.length;
  }
}

/**
 * Fallback master-ceiling settings (identical across engines by design).
 *
 * E-12 / N-15: this is no longer the master ceiling. The real ceiling is the true-peak
 * lookahead limiter in `MasterLimiter.ts`, and these values only configure the
 * `DynamicsCompressorNode` that `createMasterLimiter` falls back to when AudioWorklet
 * is unavailable. They are kept (and still applied by `applyMasterLimiter`) so that
 * configuration path, and the tests that pin it, remain valid.
 */
export const MASTER_LIMITER_SETTINGS = {
  threshold: -1.0,
  knee: 0.0,
  ratio: 20.0,
  attack: 0.003,
  release: 0.05,
} as const;

/** Applies the fallback master-ceiling configuration to a compressor node. */
export function applyMasterLimiter(limiter: DynamicsCompressorNode, ctx: BaseAudioContext): void {
  const t = ctx.currentTime;
  limiter.threshold.setValueAtTime(MASTER_LIMITER_SETTINGS.threshold, t);
  limiter.knee.setValueAtTime(MASTER_LIMITER_SETTINGS.knee, t);
  limiter.ratio.setValueAtTime(MASTER_LIMITER_SETTINGS.ratio, t);
  limiter.attack.setValueAtTime(MASTER_LIMITER_SETTINGS.attack, t);
  limiter.release.setValueAtTime(MASTER_LIMITER_SETTINGS.release, t);
}

/** Creates an AudioContext, or null when Web Audio is unavailable (SSR, old engines). */
export function createEngineAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  return new AudioContextClass();
}

/**
 * Mutes/unmutes a bus without a click.
 *
 * Used by engines whose voices are all short one-shots: instead of registering every
 * oscillator for cancellation, silencing the bus guarantees an immediate `stop()`.
 */
export function rampBusMute(
  gain: GainNode,
  ctx: BaseAudioContext,
  muted: boolean,
  restoreTo: number,
  fadeSec = 0.006
): void {
  const t = ctx.currentTime;
  try {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.linearRampToValueAtTime(muted ? 0.0001 : Math.max(0.0001, restoreTo), t + fadeSec);
  } catch {
    // Non-fatal: fall back to an immediate assignment.
    try {
      gain.gain.value = muted ? 0.0001 : restoreTo;
    } catch {
      /* ignore */
    }
  }
}
