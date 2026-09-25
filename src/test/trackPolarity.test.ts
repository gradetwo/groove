import { setGs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { AudioEngine } from "../audio/AudioEngine";
import { deriveTrackStates } from "../audio/trackStates";
import { renderPatternOffline } from "../audio/WavExporter";
import { useSequencerStore } from "../features/sequencer/useSequencerStore";
import { GENRES_MAP } from "../data/genres";
import type { SequencerPattern } from "../types/genre";
import {
  FakeAudioContext,
  FakeGainNode,
  FakeOfflineAudioContext,
  installFakeAudioContext,
  installFakeOfflineAudioContext,
} from "./helpers/fakeAudio";

/**
 * N-01 follow-up: channel polarity inversion (Ø).
 *
 * Previously the console surfaced this control disabled because no layer supported it.
 * It is now a real mixing feature: a dedicated gain stage per channel that flips the
 * sign, honoured by the realtime engine, the offline WAV renderer and the store (so it
 * persists in projects and is undoable).
 */
function makePattern(phaseInvert = false): SequencerPattern {
  const steps = 8;
  return {
    genre_id: "polarity-test",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: [
      {
        track_id: "kick",
        name: "Kick",
        instrument: "drum",
        steps: [1, 0, 0, 0, 1, 0, 0, 0],
        velocity: new Array(steps).fill(100),
        pitch: new Array(steps).fill(0),
        gate: new Array(steps).fill(0.8),
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
        phaseInvert,
      },
    ],
  } as unknown as SequencerPattern;
}

describe("polarity · deriveTrackStates", () => {
  it("maps the track flag and defaults to non-inverted", () => {
    const [normal] = deriveTrackStates({ tracks: [{ volume: 0.8 }] } as never);
    expect(normal.phaseInvert).toBe(false);

    const [inverted] = deriveTrackStates({ tracks: [{ volume: 0.8, phaseInvert: true }] } as never);
    expect(inverted.phaseInvert).toBe(true);
  });
});

describe("polarity · realtime engine", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  function strip(engine: AudioEngine, idx: number) {
    return (engine as unknown as { trackStrips: Array<{ polarity: FakeGainNode }> }).trackStrips[idx];
  }

  it("creates a unity polarity stage per channel", () => {
    const engine = new AudioEngine();
    expect(strip(engine, 0).polarity.gain.value).toBe(1);
    engine.destroy();
  });

  it("inverts and restores the channel sign without touching the volume", () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern());
    const volumeBefore = (engine as unknown as { trackStrips: Array<{ gain: FakeGainNode }> }).trackStrips[0]
      .gain.gain.value;

    engine.setTrackState(0, { phaseInvert: true });
    const events = strip(engine, 0).polarity.gain.events;
    const last = events[events.length - 1];
    expect(["linearRampToValueAtTime", "setValueAtTime"]).toContain(last.type);
    expect(last.value).toBe(-1);

    engine.setTrackState(0, { phaseInvert: false });
    const back = strip(engine, 0).polarity.gain.events;
    expect(back[back.length - 1].value).toBe(1);

    // The volume stage never moves because of a polarity flip.
    expect(
      (engine as unknown as { trackStrips: Array<{ gain: FakeGainNode }> }).trackStrips[0].gain.gain.value
    ).toBe(volumeBefore);
    engine.destroy();
  });

  it("keeps polarity across a spatial/stereo mode switch (strips are rebuilt)", () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern());
    engine.setTrackState(0, { phaseInvert: true });

    engine.setSpatialMode(true);
    // The rebuilt strip is re-synced from the track state, so it stays inverted.
    engine.syncTrackGains();
    const events = strip(engine, 0).polarity.gain.events;
    expect(events.some((e) => e.value === -1)).toBe(true);

    engine.destroy();
  });

  it("never emits a ramp to exactly zero", () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern());
    engine.setTrackState(0, { phaseInvert: true });
    for (const event of strip(engine, 0).polarity.gain.events) {
      if (event.type === "linearRampToValueAtTime") expect(event.value).not.toBe(0);
    }
    engine.destroy();
  });
});

describe("polarity · offline WAV renderer", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("renders an inverted channel with a negative polarity stage", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern(true));

    const gains = FakeOfflineAudioContext.lastInstance!.createdGains as FakeGainNode[];
    const polarityStage = gains.find((g) => g.gain.events[0]?.value === -1);
    expect(polarityStage, "no polarity stage set to -1 was created").toBeTruthy();
  });

  it("keeps unity polarity for a normal channel", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern(false));

    const gains = FakeOfflineAudioContext.lastInstance!.createdGains as FakeGainNode[];
    expect(gains.some((g) => g.gain.events[0]?.value === -1)).toBe(false);
  });
});

describe("polarity · sequencer store", () => {
  const genre = GENRES_MAP["chicago-house"] ?? Object.values(GENRES_MAP)[0];

  beforeEach(() => {
    localStorage.clear();
  });

  it("toggles the flag and is undoable", () => {
    const { result } = renderHook(() => useSequencerStore(genre));
    expect(result.current.state.pattern.tracks[0].phaseInvert).toBeFalsy();

    act(() => {
      result.current.commit({ type: "TOGGLE_PHASE_INVERT", trackIdx: 0 });
    });
    expect(result.current.state.pattern.tracks[0].phaseInvert).toBe(true);

    act(() => {
      result.current.undo();
    });
    expect(result.current.state.pattern.tracks[0].phaseInvert).toBeFalsy();
  });

  it("round-trips through the engine track states", () => {
    const { result } = renderHook(() => useSequencerStore(genre));
    act(() => {
      result.current.commit({ type: "TOGGLE_PHASE_INVERT", trackIdx: 1 });
    });
    const states = deriveTrackStates(result.current.state.pattern);
    expect(states[1].phaseInvert).toBe(true);
    expect(states[0].phaseInvert).toBe(false);
  });
});

describe("master volume · persisted level", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    localStorage.clear();
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("defaults to 0.8 and exposes the value the console should mount with", () => {
    const engine = new AudioEngine();
    expect(engine.getMasterVolume()).toBe(0.8);
    engine.destroy();
  });

  it("clamps, applies and persists the master level across engine instances", () => {
    const engine = new AudioEngine();
    engine.setMasterVolume(0.42);
    expect(engine.getMasterVolume()).toBeCloseTo(0.42);

    engine.setMasterVolume(5);
    expect(engine.getMasterVolume()).toBe(1);
    engine.setMasterVolume(-3);
    expect(engine.getMasterVolume()).toBe(0);

    engine.setMasterVolume(0.33);
    engine.destroy();

    // A freshly constructed engine (e.g. the console view mounting later) restores it.
    const next = new AudioEngine();
    expect(next.getMasterVolume()).toBeCloseTo(0.33);
    next.destroy();
  });

  it("reports the effective level after hearing protection", () => {
    const engine = new AudioEngine();
    engine.setMasterVolume(0.95);
    expect(engine.getEffectiveMasterVolume()).toBeLessThanOrEqual(0.95);
    engine.destroy();
  });
});

describe("per-channel analysers · real console meters", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("creates no analysers until a view asks for them", () => {
    const engine = new AudioEngine();
    expect(engine.areTrackAnalysersEnabled()).toBe(false);
    expect(engine.getTrackAnalyser(0)).toBeNull();
    engine.destroy();
  });

  it("creates one pass-through analyser per channel on demand", () => {
    const engine = new AudioEngine();
    engine.enableTrackAnalysers(true);

    expect(engine.areTrackAnalysersEnabled()).toBe(true);
    const first = engine.getTrackAnalyser(0);
    const second = engine.getTrackAnalyser(1);
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);
    // 256-point window keeps the per-frame read cheap for 8 channels.
    expect(first!.fftSize).toBe(256);

    // The analyser sits in the signal path (it has both an input and an output edge).
    const strip = (engine as unknown as { trackStrips: Array<{ polarity: { incoming: unknown[] }; analyser: { incoming: unknown[] } | null }> })
      .trackStrips[0];
    expect(strip.polarity.incoming.length).toBeGreaterThan(0);
    expect(strip.analyser!.incoming.length).toBe(1);

    engine.destroy();
  });

  it("removes them again when the view unmounts", () => {
    const engine = new AudioEngine();
    engine.enableTrackAnalysers(true);
    expect(engine.getTrackAnalyser(0)).toBeTruthy();

    engine.enableTrackAnalysers(false);
    expect(engine.areTrackAnalysersEnabled()).toBe(false);
    expect(engine.getTrackAnalyser(0)).toBeNull();
    engine.destroy();
  });

  it("keeps analysers when the monitoring mode is switched", () => {
    const engine = new AudioEngine();
    engine.enableTrackAnalysers(true);
    engine.setSpatialMode(true);
    expect(engine.getTrackAnalyser(0)).toBeTruthy();
    engine.setSpatialMode(false);
    expect(engine.getTrackAnalyser(0)).toBeTruthy();
    engine.destroy();
  });
});

describe("kick design · transport self-initialises audio", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("creates its own AudioContext on the first trigger (INITIATE PULSE regression)", async () => {
    const { AnatomyKickEngine } = await import("../audio/AnatomyKickEngine");
    const engine = new AnatomyKickEngine();
    expect(engine.getAudioContext()).toBeNull();

    // No init() call first — exactly the state the gravitational sequencer started in.
    expect(() => engine.trigger(0, 1)).not.toThrow();

    const ctx = engine.getAudioContext();
    expect(ctx, "trigger() should have created an AudioContext").not.toBeNull();
    expect(ctx!.state).not.toBe("closed");
  });

  it("ensureContext() is idempotent and resumes a suspended context", async () => {
    const { AnatomyKickEngine } = await import("../audio/AnatomyKickEngine");
    const engine = new AnatomyKickEngine();

    const first = engine.ensureContext();
    const second = engine.ensureContext();
    expect(first).toBe(second);
    expect(engine.getAudioContext()).toBe(first);
  });
});


/**
 * The offline GS-1 capability probe renders a throwaway context of its own; these cases inspect the *app's* render
 * (hosts, strips, buffers) and would otherwise find the probe's instead. Declared satisfied at module scope here; the
 * probe has its own file, and `probe_engine_parity.mjs` is its acceptance test.
 */
setGs1OfflineCapability("usable");
