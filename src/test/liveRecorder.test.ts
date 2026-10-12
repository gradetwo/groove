import { describe, it, expect, vi } from "vitest";
import { LiveRecorder, QuantizedStepResult } from "../audio/LiveRecorder";
import { SequencerPattern } from "../types/genre";

describe("Live Sequencer Recording & Adaptive Quantizer (P5-05)", () => {
  it("initializes with disarmed state", () => {
    const recorder = new LiveRecorder();
    expect(recorder.getIsArmed()).toBe(false);

    // Recording while disarmed returns null and triggers nothing
    const result = recorder.recordTrigger(0, 60, 0.8, 3, 16);
    expect(result).toBeNull();
  });

  it("records and quantizes note trigger to the correct step when armed", () => {
    const recorder = new LiveRecorder();
    recorder.setArmed(true);
    expect(recorder.getIsArmed()).toBe(true);

    const onQuantize = vi.fn();
    recorder.setOnQuantizedStep(onQuantize);

    const result = recorder.recordTrigger(2, 64, 0.9, 5, 16);

    expect(result).not.toBeNull();
    expect(result?.trackIdx).toBe(2);
    expect(result?.stepIdx).toBe(5);
    expect(result?.pitch).toBe(64);
    // Velocity >= 0.85 produces stepVal = 2 (accent)
    expect(result?.stepVal).toBe(2);
    expect(result?.velocity).toBe(0.9);

    expect(onQuantize).toHaveBeenCalledWith(result);
  });

  it("safely clamps step indices within valid boundary [0, stepCount - 1]", () => {
    const recorder = new LiveRecorder();
    recorder.setArmed(true);

    // Negative step clamp
    const negResult = recorder.recordTrigger(0, 36, 0.5, -2, 16);
    expect(negResult?.stepIdx).toBe(0);

    // Over-boundary step clamp
    const overResult = recorder.recordTrigger(0, 36, 0.5, 25, 16);
    expect(overResult?.stepIdx).toBe(15);
  });

  it("applies a quantized record directly into a SequencerPattern clone", () => {
    const recorder = new LiveRecorder();

    const pattern: SequencerPattern = {
      genre_id: "test",
      bpm: 120,
      scale: "minor",
      tracks: [
        {
          name: "Kick",
          track_id: "kick",
          instrument: "kick",
          steps: [0, 0, 0, 0],
          velocity: [0.5, 0.5, 0.5, 0.5],
          pitch: [0, 0, 0, 0],
        },
      ],
    };

    const record: QuantizedStepResult = {
      trackIdx: 0,
      stepIdx: 2,
      stepVal: 1,
      velocity: 0.8,
      pitch: 48,
    };

    const updated = recorder.applyToPattern(pattern, record);

    // Immutability check: original pattern remains untouched
    expect(pattern.tracks[0].steps[2]).toBe(0);

    // Cloned updated pattern receives step mutation
    expect(updated.tracks[0].steps[2]).toBe(1);
    expect(updated.tracks[0].velocity?.[2]).toBe(0.8);
    expect(updated.tracks[0].pitch?.[2]).toBe(48);
  });
});
