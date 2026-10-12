/**
 * Live Sequencer Note Recording & Adaptive Quantizer (P5-05)
 *
 * Captures real-time keyboard/MIDI note triggers during playback
 * and intelligently quantizes them to the current pattern grid.
 */

import { SequencerPattern } from "../types/genre";

export interface RecordedNote {
  trackIdx: number;
  pitch: number;
  velocity: number;
  timestamp: number;
}

export interface QuantizedStepResult {
  trackIdx: number;
  stepIdx: number;
  stepVal: 1 | 2; // 1 = normal, 2 = accent
  velocity: number;
  pitch: number;
}

export class LiveRecorder {
  private isArmed: boolean = false;
  private onQuantizedStepCallback?: (result: QuantizedStepResult) => void;

  public setArmed(armed: boolean): void {
    this.isArmed = armed;
  }

  public getIsArmed(): boolean {
    return this.isArmed;
  }

  public setOnQuantizedStep(callback: (result: QuantizedStepResult) => void): void {
    this.onQuantizedStepCallback = callback;
  }

  /**
   * Quantizes a recorded event to the nearest pattern step
   */
  public recordTrigger(
    trackIdx: number,
    pitch: number,
    velocity: number,
    currentPlaybackStep: number,
    stepCount: number
  ): QuantizedStepResult | null {
    if (!this.isArmed) return null;

    const safeStep = Math.max(0, Math.min(stepCount - 1, currentPlaybackStep));
    const stepVal: 1 | 2 = velocity >= 0.85 ? 2 : 1;

    const result: QuantizedStepResult = {
      trackIdx,
      stepIdx: safeStep,
      stepVal,
      velocity: Math.max(0.2, Math.min(1.0, velocity)),
      pitch: pitch > 0 ? pitch : 0,
    };

    if (this.onQuantizedStepCallback) {
      this.onQuantizedStepCallback(result);
    }

    return result;
  }

  /**
   * Applies a quantized note directly into a pattern clone
   */
  public applyToPattern(pattern: SequencerPattern, record: QuantizedStepResult): SequencerPattern {
    const updated = JSON.parse(JSON.stringify(pattern)) as SequencerPattern;
    const track = updated.tracks[record.trackIdx];
    if (!track) return pattern;

    if (record.stepIdx < track.steps.length) {
      track.steps[record.stepIdx] = record.stepVal;
      if (track.velocity) {
        track.velocity[record.stepIdx] = record.velocity;
      }
      if (track.pitch && record.pitch > 0) {
        track.pitch[record.stepIdx] = record.pitch;
      }
    }

    return updated;
  }
}
