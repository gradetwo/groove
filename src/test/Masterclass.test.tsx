import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MasterclassAudioEngine } from "../audio/MasterclassAudioEngine";
import { MASTERCLASSES } from "../data/masterclasses";
import { MasterclassView } from "../views/MasterclassView";
import { LanguageProvider } from "../i18n/LanguageContext";

// Mock AudioContext for Web Audio synthesis
class MockAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state = "running";
  destination = {};

  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };
  }

  createOscillator() {
    return {
      type: "sine",
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }

  createBiquadFilter() {
    return {
      type: "bandpass",
      frequency: { setValueAtTime: vi.fn() },
      Q: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: () => new Float32Array(length),
    };
  }

  createBufferSource() {
    return {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }

  createDynamicsCompressor() {
    return {
      threshold: { setValueAtTime: vi.fn() },
      knee: { setValueAtTime: vi.fn() },
      ratio: { setValueAtTime: vi.fn() },
      attack: { setValueAtTime: vi.fn() },
      release: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }

  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);
}

// Attach mock audio context
(window as unknown as { AudioContext: typeof MockAudioContext }).AudioContext = MockAudioContext;

describe("P6-01: Rhythm Masterclasses Curriculum & Engine", () => {
  let engine: MasterclassAudioEngine;

  beforeEach(() => {
    engine = new MasterclassAudioEngine();
  });

  it("should have all 5 masterclasses defined with proper metadata", () => {
    expect(MASTERCLASSES).toHaveLength(5);
    const ids = MASTERCLASSES.map((m) => m.id);
    expect(ids).toEqual([
      "polyrhythm",
      "clave",
      "downbeat_omission",
      "balkan_odd_meters",
      "dilla_microtiming",
    ]);

    MASTERCLASSES.forEach((lesson) => {
      expect(lesson.title.zh).toBeTruthy();
      expect(lesson.title.en).toBeTruthy();
      expect(lesson.culturalContext.zh).toBeTruthy();
      expect(lesson.acousticPrinciple.zh).toBeTruthy();
      expect(lesson.presets.length).toBeGreaterThanOrEqual(2);

      const pattern = lesson.generateStudioPattern();
      expect(pattern.tracks.length).toBeGreaterThanOrEqual(3);
      expect(pattern.bpm).toBeGreaterThan(0);
      expect(pattern.timeSignature).toBeTruthy();
    });
  });

  it("should synthesize percussion sounds and manage BPM in MasterclassAudioEngine", () => {
    engine.setBpm(128);
    expect(engine.getBpm()).toBe(128);

    // Test bounds
    engine.setBpm(20);
    expect(engine.getBpm()).toBe(30);
    engine.setBpm(300);
    expect(engine.getBpm()).toBe(240);

    // Test sound triggering
    const sounds = [
      "woodblock",
      "bell",
      "collision",
      "clave",
      "davul",
      "kick",
      "snare",
      "hihat",
      "shaker",
    ] as const;

    sounds.forEach((snd) => {
      expect(() => engine.triggerSound(snd, 0, 0.8)).not.toThrow();
    });
  });

  it("should evaluate tap accuracy correctly with ms deviation", () => {
    // Empty pulse register
    const defaultResult = engine.evaluateTap();
    expect(defaultResult.rating).toBe("perfect");
    expect(defaultResult.scorePercent).toBe(100);

    // Register a pulse at t = 1.0s
    engine.registerPulseTimestamp(1.0);

    // Evaluate tap
    const res = engine.evaluateTap();
    expect(res).toHaveProperty("offsetMs");
    expect(res).toHaveProperty("absOffsetMs");
    expect(res).toHaveProperty("rating");
    expect(res).toHaveProperty("scorePercent");
  });

  it("should start and stop the transport loop cleanly", () => {
    expect(engine.getIsPlaying()).toBe(false);
    engine.start();
    expect(engine.getIsPlaying()).toBe(true);
    engine.stop();
    expect(engine.getIsPlaying()).toBe(false);
    engine.destroy();
  });
});

describe("MasterclassView Component", () => {
  it("renders curriculum tabs and allows switching lessons", () => {
    const onOpenStudio = vi.fn();

    render(
      <LanguageProvider>
        <MasterclassView onOpenStudio={onOpenStudio} />
      </LanguageProvider>
    );

    // Check title presence (English default)
    expect(screen.getByText(/Rhythm Deconstruction/)).toBeTruthy();

    // Check lesson tabs
    expect(screen.getAllByText(/Polyrhythm Collider/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Clave Evolution Tree/)).toBeTruthy();
    expect(screen.getByText(/Downbeat Omission/)).toBeTruthy();

    // Switch to Balkan Odd Meters
    const balkanTab = screen.getByText(/Balkan Odd Meters/);
    fireEvent.click(balkanTab);

    expect(screen.getAllByText(/Aksak/).length).toBeGreaterThanOrEqual(1);
  });

  it("triggers Bake to Studio callback with generated pattern", () => {
    const onOpenStudio = vi.fn();

    render(
      <LanguageProvider>
        <MasterclassView onOpenStudio={onOpenStudio} />
      </LanguageProvider>
    );

    const bakeBtn = screen.getByTestId("bake-to-studio-btn");
    expect(bakeBtn).toBeTruthy();

    fireEvent.click(bakeBtn);
    expect(onOpenStudio).toHaveBeenCalledTimes(1);
    const payload = onOpenStudio.mock.calls[0][0];
    expect(payload).toHaveProperty("pattern");
    expect(payload).toHaveProperty("label");
    expect(payload.pattern.tracks.length).toBeGreaterThanOrEqual(3);
  });
});
