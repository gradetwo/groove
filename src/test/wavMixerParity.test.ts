import { describe, it, expect, afterEach } from "vitest";
import { encodeAudioBufferToWav, renderPatternOffline } from "../audio/WavExporter";
import { deriveTrackStates } from "../audio/trackStates";
import { FakeAudioBuffer, FakeOfflineAudioContext, FakeGainNode, installFakeOfflineAudioContext } from "./helpers/fakeAudio";

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

    const stripGains = FakeOfflineAudioContext.lastInstance!.createdGains.slice(1, 3) as FakeGainNode[];
    expect(stripGains[0].gain.events[0].value).toBe(0.5);
    expect(stripGains[1].gain.events[0].value).toBe(0.9);
  });

  it("drops muted tracks and keeps soloed ones", async () => {
    restore = installFakeOfflineAudioContext();

    const muted = makePattern();
    muted.tracks[0].mute = true;
    await renderPatternOffline(muted);
    const mutedStrips = FakeOfflineAudioContext.lastInstance!.createdGains.slice(1, 3);
    expect(mutedStrips[0].incoming.length).toBe(0);
    expect(mutedStrips[1].incoming.length).toBeGreaterThan(0);

    const soloed = makePattern();
    soloed.tracks[1].solo = true;
    await renderPatternOffline(soloed);
    const soloStrips = FakeOfflineAudioContext.lastInstance!.createdGains.slice(1, 3);
    expect(soloStrips[0].incoming.length).toBe(0);
    expect(soloStrips[1].incoming.length).toBeGreaterThan(0);
  });

  it("respects probability 0 so exports never contain unhearable notes", async () => {
    restore = installFakeOfflineAudioContext();
    const pattern = makePattern();
    pattern.tracks[0].probability = new Array(16).fill(0);
    await renderPatternOffline(pattern);
    const strips = FakeOfflineAudioContext.lastInstance!.createdGains.slice(1, 3);
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
