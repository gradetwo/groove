/**
 * The per-track sends (reverb `sendA`, delay `sendB`) tap **after** the panner.
 *
 * They used to tap the polarity/analyser stage, which sits *upstream* of the `StereoPannerNode`:
 * a hard-panned track pushed a mono, centred signal into the reverb and the delay, so its wet tail
 * came back in the middle of the image while the dry signal sat on one side. The offline renderer has
 * always tapped post-pan, and its own comment claimed the live engine did too — so playback and the
 * exported file disagreed about the one thing a send is for, and the per-genre curated sends lost the
 * width they were curated for.
 *
 * The assertions are about the graph, not about audio, for the same reason the rest of this suite is:
 * the fake contexts record edges (`FakeNode.incoming`) but render silence, so an edge is the only
 * honest evidence available here — and the edge *is* the defect.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { renderPatternOffline } from "../audio/WavExporter";
import type { SequencerPattern } from "../types/genre";
import {
  FakeGainNode,
  FakeNode,
  FakeOfflineAudioContext,
  FakeStereoPannerNode,
  installFakeAudioContext,
  installFakeOfflineAudioContext,
} from "./helpers/fakeAudio";

interface StripShape {
  polarity: FakeNode;
  analyser: FakeNode | null;
  panner: FakeStereoPannerNode | null;
  spatialPanner: FakeNode | null;
  sendA: FakeGainNode;
  sendB: FakeGainNode;
}

/** One track, hard left, with both sends fully open. */
function makePattern(over: { pan?: number; sendA?: number; sendB?: number } = {}): SequencerPattern {
  const steps = 8;
  return {
    genre_id: "send-tap-test",
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
        pan: over.pan ?? -1,
        sendA: over.sendA ?? 1,
        sendB: over.sendB ?? 1,
        mute: false,
        solo: false,
      },
    ],
  } as unknown as SequencerPattern;
}

describe("track sends · post-pan tap point", () => {
  let restore: (() => void) | null = null;
  let restoreOffline: (() => void) | null = null;

  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restoreOffline?.();
    restore = null;
    restoreOffline = null;
  });

  function strips(engine: AudioEngine): StripShape[] {
    return (engine as unknown as { trackStrips: StripShape[] }).trackStrips;
  }

  function hardPannedStrip(): { engine: AudioEngine; strip: StripShape } {
    const engine = new AudioEngine();
    engine.initAudioContext();
    engine.setPattern(makePattern());
    return { engine, strip: strips(engine)[0] };
  }

  it("feeds both sends from the panner, with the track's own pan applied", () => {
    const { engine, strip } = hardPannedStrip();

    expect(strip.panner, "the strip has no stereo panner to tap").toBeTruthy();
    // The pan really is on the node the sends listen to, so the wet tail follows the dry signal.
    expect(strip.panner!.pan.value).toBe(-1);

    // Exactly the panner — not the polarity/analyser stage it used to tap.
    expect(strip.sendA.incoming).toEqual([strip.panner]);
    expect(strip.sendB.incoming).toEqual([strip.panner]);
    expect(strip.sendA.incoming).not.toContain(strip.polarity);
    expect(strip.sendB.incoming).not.toContain(strip.polarity);

    engine.destroy();
  });

  it("keeps the tap after the panner when the analyser is in the path", () => {
    // With per-channel metering on, the old tap point moved to the analyser — still pre-pan, so the
    // send would have followed whichever node happened to end the strip rather than the pan.
    const engine = new AudioEngine();
    engine.enableTrackAnalysers(true);
    engine.setPattern(makePattern());
    const strip = strips(engine)[0];

    expect(strip.analyser, "the analyser was not inserted").toBeTruthy();
    // polarity → analyser → panner: the analyser is *in* the path, and still upstream of the tap.
    expect(strip.analyser!.incoming).toContain(strip.polarity);
    expect(strip.panner!.incoming).toContain(strip.analyser);
    expect(strip.sendA.incoming).toEqual([strip.panner]);
    expect(strip.sendB.incoming).toEqual([strip.panner]);
    expect(strip.sendA.incoming).not.toContain(strip.analyser);

    engine.destroy();
  });

  it("keeps the tap after the panner in binaural monitoring", () => {
    // Spatial mode swaps the stereo panner for an HRTF one; the sends must follow that instead.
    const engine = new AudioEngine();
    engine.setSpatialMode(true);
    engine.setPattern(makePattern());
    const strip = strips(engine)[0];

    expect(strip.panner).toBeNull();
    expect(strip.spatialPanner).toBeTruthy();
    expect(strip.sendA.incoming).toEqual([strip.spatialPanner]);
    expect(strip.sendB.incoming).toEqual([strip.spatialPanner]);

    engine.destroy();
  });

  it("gives the offline renderer the same tap point as playback", async () => {
    // Parity is asserted on both graphs rather than by comparing files: the live engine above taps
    // its panner, and the export must tap its panner too — the group bus input plus two sends.
    restoreOffline = installFakeOfflineAudioContext();
    await renderPatternOffline(makePattern());

    const ctx = FakeOfflineAudioContext.lastInstance!;
    const panned = ctx.createdPanners.filter((p) => p.pan.value === -1);
    expect(panned, "the hard-panned track has no panner in the export").toHaveLength(1);

    const fedByPanner = ctx.createdGains.filter((g) => g.incoming.includes(panned[0]));
    // 1 group bus + reverb send + delay send: the sends are downstream of the pan, as in playback.
    expect(fedByPanner).toHaveLength(3);
  });
});
