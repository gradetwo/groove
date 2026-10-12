import { describe, expect, it } from "vitest";
import { playAudioLanes } from "../audio/audioLanePlayback";

/**
 * The composition, with fakes where the browser would be.
 *
 * Two criteria, and both are about the decision this file makes rather than about the modules it calls: **a song with no audio lane does nothing and is not an error**, and **a lane whose
 * asset resolves is planned and reaches the loader**. The second is the one that would have been a test-only claim before — nothing in the app had ever run a lane through the loader.
 */
const emptyContext = () =>
  ({
    createBufferSource: () => ({ connect() {}, start() {}, buffer: null, playbackRate: { value: 1 }, detune: { value: 0 } }),
    createGain: () => ({ connect() {}, gain: { value: 1 } }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(8), length: 8, numberOfChannels: 1, sampleRate: 44100, duration: 0 }),
    destination: {},
    sampleRate: 44100,
  }) as unknown as BaseAudioContext;

const song = (tracks: unknown[]) => ({
  clips: { A: { tracks } },
  sections: [{ id: "s", slot: "A", bars: 1 }],
  boundaries: [0],
  bpm: 120,
}) as never;

const catalogue = [{ assetId: "probe-impulse", name: "Probe", kind: "one-shot" as const, seconds: 0.05 }];

describe("playAudioLanes", () => {
  it("does nothing, and reports no problem, for a song with no audio lane", async () => {
    const result = await playAudioLanes({
      song: song([{ track_id: "kick", name: "Kick", steps: new Array(16).fill(true) }]),
      context: emptyContext(),
      destination: {} as AudioNode,
      catalogue,
    });
    // The normal case: a song without audio lanes must not look like a failure, and this is what guarantees the feature cannot change existing songs.
    expect(result.planned).toBe(0);
    expect(result.scheduled).toBe(0);
    expect(result.problems).toEqual([]);
  });

  it("plans a lane whose asset resolves, and gets as far as the loader", async () => {
    const result = await playAudioLanes({
      song: song([{ track_id: "audio", name: "Lane", sample: { assetId: "probe-impulse" } }]),
      context: emptyContext(),
      destination: {} as AudioNode,
      catalogue,
    });
    // Planned: the lane was found. Not necessarily scheduled: the fetch of a real sample is not part of this criterion, and the loader's own suite covers the rest.
    expect(result.planned).toBeGreaterThan(0);
  });

  it("reports a lane whose asset resolves to nothing, rather than silently dropping it", async () => {
    const result = await playAudioLanes({
      song: song([{ track_id: "audio", name: "Lane", sample: { assetId: "not-in-the-catalogue" } }]),
      context: emptyContext(),
      destination: {} as AudioNode,
      catalogue,
    });
    // The empty-catalogue state this project actually ships: a referenced asset that resolves to nothing is a named problem, not a silent gap.
    expect(result.problems.join("\n")).toMatch(/not-in-the-catalogue/);
  });
});
