import { describe, it, expect, afterEach } from "vitest";
import { encodeAudioBufferToWav, renderPatternOffline } from "../audio/WavExporter";
import { DEFAULT_SYNTH_PRESETS } from "../audio/PolySynth";
import { resolveInstrumentPreset } from "../audio/instrumentPresets";
import { chordVoicingForStep } from "../audio/chordVoicing";
import { deriveTrackStates } from "../audio/trackStates";
import { FakeAudioBuffer, FakeOfflineAudioContext, FakeGainNode, installFakeOfflineAudioContext } from "./helpers/fakeAudio";

/**
 * Volume stages of the two rendered tracks (track 0 then track 1). Each track builds a
 * volume gain and a polarity gain, so position alone is no longer meaningful.
 */
function stripVolumeGains(): FakeGainNode[] {
  const gains = FakeOfflineAudioContext.lastInstance!.createdGains.slice(1) as FakeGainNode[];
  return gains.filter((g) => g.gain.events[0]?.value !== 1);
}

function makePattern(overrides: Partial<Record<string, unknown>> = {}) {
  const steps = new Array(16).fill(0);
  steps[0] = 1;
  steps[4] = 1;

  return {
    bpm: 120,
    swing: 0,
    totalSteps: 16,
    tracks: [
      {
        track_id: "kick",
        name: "Kick",
        steps: [...steps],
        velocity: new Array(16).fill(100),
        pitch: new Array(16).fill(0),
        gate: new Array(16).fill(0.8),
        volume: 0.5,
        pan: 0,
        mute: false,
        solo: false,
      },
      {
        track_id: "snare",
        name: "Snare",
        steps: [...steps],
        velocity: new Array(16).fill(100),
        pitch: new Array(16).fill(0),
        gate: new Array(16).fill(0.8),
        volume: 0.9,
        pan: 0,
        mute: false,
        solo: false,
      },
    ],
    ...overrides,
  } as any;
}

describe("F-10 · WAV container correctness", () => {
  it("encodes a mono buffer without overflowing the data chunk", () => {
    const buffer = new FakeAudioBuffer(1, 64, 44100);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i / 4);

    const wav = encodeAudioBufferToWav(buffer as unknown as AudioBuffer);
    const view = new DataView(wav);

    // RIFF header integrity: 44-byte header + numSamples * channels * 2 bytes.
    expect(view.getUint32(4, true)).toBe(36 + 64 * 2);
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint16(32, true)).toBe(2); // block align = 1 channel * 2 bytes
    expect(view.getUint32(28, true)).toBe(44100 * 2); // byte rate
    expect(wav.byteLength).toBe(44 + 64 * 2);
  });

  it("encodes a stereo buffer with matching sizes", () => {
    const buffer = new FakeAudioBuffer(2, 32, 48000);
    const wav = encodeAudioBufferToWav(buffer as unknown as AudioBuffer);
    const view = new DataView(wav);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint32(28, true)).toBe(48000 * 4);
    expect(wav.byteLength).toBe(44 + 32 * 4);
  });
});

describe("F-03 · offline renderer honours the mixer", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("derives per-track mixer state from the pattern (mute/solo/volume/pan)", () => {
    const states = deriveTrackStates(makePattern());
    expect(states).toHaveLength(2);
    expect(states[0].volume).toBe(0.5);
    expect(states[1].volume).toBe(0.9);
    expect(states[0].mute).toBe(false);
  });

  it("falls back to sane defaults for non-finite mixer values", () => {
    const states = deriveTrackStates({
      tracks: [{ volume: Number.NaN, pan: undefined as unknown as number, mute: undefined }],
    } as any);
    expect(states[0].volume).toBe(0.8);
    expect(states[0].pan).toBe(0);
    expect(states[0].mute).toBe(false);
  });

  it("uses track volumes for the channel strips instead of a hard-coded 0.8", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern());

    // Each track now contributes two gain nodes (volume, then polarity ±1), so pick
    // the volume stages by their value rather than by position.
    const gains = FakeOfflineAudioContext.lastInstance!.createdGains.slice(1) as FakeGainNode[];
    const volumeStages = gains.filter((g) => g.gain.events[0]?.value !== 1).map((g) => g.gain.events[0].value);
    expect(volumeStages).toContain(0.5);
    expect(volumeStages).toContain(0.9);
    // And the polarity stages sit at unity by default.
    const polarityStages = gains.filter((g) => g.gain.events[0]?.value === 1);
    expect(polarityStages.length).toBeGreaterThanOrEqual(2);
  });

  it("drops muted tracks and keeps soloed ones", async () => {
    restore = installFakeOfflineAudioContext();

    const muted = makePattern();
    muted.tracks[0].mute = true;
    await renderPatternOffline(muted);
    const mutedStrips = stripVolumeGains();
    expect(mutedStrips[0].incoming.length).toBe(0);
    expect(mutedStrips[1].incoming.length).toBeGreaterThan(0);

    const soloed = makePattern();
    soloed.tracks[1].solo = true;
    await renderPatternOffline(soloed);
    const soloStrips = stripVolumeGains();
    expect(soloStrips[0].incoming.length).toBe(0);
    expect(soloStrips[1].incoming.length).toBeGreaterThan(0);
  });

  it("respects probability 0 so exports never contain unhearable notes", async () => {
    restore = installFakeOfflineAudioContext();
    const pattern = makePattern();
    pattern.tracks[0].probability = new Array(16).fill(0);
    await renderPatternOffline(pattern);
    const strips = stripVolumeGains();
    expect(strips[0].incoming.length).toBe(0);
  });

  it("clamps hostile render parameters instead of allocating absurd buffers", async () => {
    restore = installFakeOfflineAudioContext();
    const ctx = await renderPatternOffline(makePattern(), { bpm: -500, bars: 100000 });
    expect(ctx.length).toBeGreaterThan(0);
    const instance = FakeOfflineAudioContext.lastInstance!;
    // 64 bars max at 20 BPM/1-16 = 768.6s (incl. decay tail) — bounded, not gigabytes.
    expect(instance.length).toBeLessThanOrEqual(Math.ceil(769 * 44100));
  });
});

/**
 * Exporter-parity follow-up to the genre-timbre fix: the offline renderer used to
 * hard-code `acidBass` / `warmPad` / `analogLead` per role, so a bounced WAV did not
 * match what the live engine played. These tests inspect the oscillator/filter network
 * the renderer actually built and compare it with the resolved preset.
 */
describe("genre timbres · offline render voices the declared instrument", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  function synthPattern(trackId: string, instrument: string, pitch: number) {
    const steps = 16;
    const hits = new Array(16).fill(0);
    hits[0] = 1;
    return {
      genre_id: "timbre-test",
      bpm: 120,
      swing: 0,
      scale: "C minor",
      totalSteps: steps,
      tracks: [
        {
          track_id: trackId,
          name: trackId,
          instrument,
          steps: hits,
          velocity: new Array(steps).fill(100),
          pitch: new Array(steps).fill(pitch),
          gate: new Array(steps).fill(0.8),
          volume: 0.8,
          pan: 0,
          mute: false,
          solo: false,
        },
      ],
    } as any;
  }

  it("renders a flute_lead lead track with the flute preset", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(synthPattern("lead", "flute_lead", 72));

    const ctx = FakeOfflineAudioContext.lastInstance!;
    const flute = resolveInstrumentPreset("flute_lead", "lead");

    expect(ctx.createdOscillators.map((o) => o.type)).toEqual([flute.osc1Type, flute.osc2Type]);
    expect(ctx.createdOscillators[1].detune.events[0]?.value).toBe(flute.osc2DetuneCents);
    // The renderer's only biquad for this pattern is the voice low-pass.
    expect(ctx.createdFilters).toHaveLength(1);
    expect(ctx.createdFilters[0].frequency.events[0]?.value).toBe(flute.filterCutoff);
  });

  it("renders sub_bass, not the legacy acidBass, on a sub_bass bass track", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(synthPattern("bass", "sub_bass", 36));

    const ctx = FakeOfflineAudioContext.lastInstance!;
    const sub = resolveInstrumentPreset("sub_bass", "bass");

    expect(ctx.createdOscillators.map((o) => o.type)).toEqual([sub.osc1Type, sub.osc2Type]);
    const cutoff = ctx.createdFilters[0].frequency.events[0]?.value;
    expect(cutoff).toBe(sub.filterCutoff);
    expect(cutoff).toBeLessThan(DEFAULT_SYNTH_PRESETS.acidBass.filterCutoff);
  });

  it("renders supersaw, not the legacy warmPad, on a supersaw chords track", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(synthPattern("chords", "supersaw", 60));

    const ctx = FakeOfflineAudioContext.lastInstance!;
    const superSaw = resolveInstrumentPreset("supersaw", "chords");

    // E-01: the offline renderer must produce the SAME voicing as the live engine.
    // Exporter parity is a hard rule, so both sides call `chordVoicingForStep` and this
    // pins that the exporter really voices the chord rather than rendering one note.
    const voicing = chordVoicingForStep(60, "C minor");
    expect(voicing).toHaveLength(3);
    expect(ctx.createdOscillators.map((o) => o.type)).toEqual(
      voicing.flatMap(() => [superSaw.osc1Type, superSaw.osc2Type])
    );
    expect(ctx.createdOscillators[1].detune.events[0]?.value).toBe(superSaw.osc2DetuneCents);
    expect(ctx.createdFilters).toHaveLength(voicing.length);
    for (const filter of ctx.createdFilters) {
      expect(filter.frequency.events[0]?.value).toBe(superSaw.filterCutoff);
      expect(filter.frequency.events[0]?.value).not.toBe(
        DEFAULT_SYNTH_PRESETS.warmPad.filterCutoff
      );
    }
  });

  it("keeps the shared noise-sweep riser for the noise_sweep fx track", async () => {
    restore = installFakeOfflineAudioContext();
    await renderPatternOffline(synthPattern("fx", "noise_sweep", 12));

    const ctx = FakeOfflineAudioContext.lastInstance!;
    // synthFX is a single swept oscillator through a bandpass starting at 2 kHz;
    // the poly synth would have produced two oscillators instead.
    expect(ctx.createdOscillators).toHaveLength(1);
    expect(ctx.createdFilters).toHaveLength(1);
    expect(ctx.createdFilters[0].frequency.events[0]?.value).toBe(2000);
  });
});
