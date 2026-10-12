/**
 * ⭐ **A stereo pair is 3.01 dB louder than the same signal in mono** (src/test/helpers/loudness.ts).
 *
 * BS.1770 sums the per-channel mean squares with channel weights, so a signal placed in two channels reads
 * 10·log10(2) above the same signal in one. The meter divided the total by the channel count as well, which cancels
 * that sum and makes every stereo render report about 3 dB quieter than it is — a shipped number, since the MCP's
 * analyze and render replies carry `integratedLufs`. A mono test cannot see it, which is why this one is stereo.
 *
 * The criterion was red before the fix and green after; it is the only one that looks at channels at all.
 */
import { describe, expect, it } from "vitest";
import { measureLoudness } from "./helpers/loudness";

function sine(seconds: number, sampleRate: number, hz = 1000, amplitude = 0.25): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i += 1) out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  return out;
}

describe("the loudness meter", () => {
  it("⭐ reads a duplicated stereo signal 3.01 dB above the same mono signal", () => {
    const sampleRate = 48000;
    const mono = sine(5, sampleRate);
    const stereo = [mono, mono];
    const monoLufs = measureLoudness([mono], sampleRate).integratedLufs;
    const stereoLufs = measureLoudness(stereo, sampleRate).integratedLufs;
    expect({ delta: Number((stereoLufs - monoLufs).toFixed(2)) }).toEqual({ delta: 3.01 });
  });
});
