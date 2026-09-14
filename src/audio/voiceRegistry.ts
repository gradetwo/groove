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

/** Fade applied by `panic()` so voices stop without a click. */
export const PANIC_FADE_SEC = 0.005;

/**
 * Tracks scheduled voices so `stop()`/`panic()` can cancel them, and so stale
 * entries are pruned instead of growing forever.
 */
export class VoiceRegistry {
  private voices: ScheduledVoice[] = [];

  constructor(private readonly now: () => number) {}

  /** Records a voice that has already been scheduled. */
  register(source: AudioScheduledSourceNode, gain: GainNode, stopTime: number): void {
    const now = this.now();
    this.prune(now);
    this.voices.push({ source, gain, stopTime });
    if (this.voices.length > MAX_TRACKED_VOICES) {
      this.voices.splice(0, this.voices.length - MAX_TRACKED_VOICES);
    }
  }

  /** Drops voices that have already finished. */
  prune(now = this.now()): void {
    if (this.voices.length === 0) return;
    this.voices = this.voices.filter((voice) => voice.stopTime > now);
  }

  /**
   * Smoothly cancels every tracked voice. Safe to call when nothing is playing and
   * safe against voices that a browser has already stopped.
   */
  panic(): void {
    const now = this.now();
    for (const voice of this.voices) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0.0001, now + PANIC_FADE_SEC);
        voice.source.stop(now + PANIC_FADE_SEC + 0.001);
      } catch {
        // The node may already be stopped or disconnected; nothing to do.
      }
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

/** Shared master-limiter settings (identical across engines by design). */
export const MASTER_LIMITER_SETTINGS = {
  threshold: -1.0,
  knee: 0.0,
  ratio: 20.0,
  attack: 0.003,
  release: 0.05,
} as const;

/** Applies the standard master-limiter configuration to a compressor node. */
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
