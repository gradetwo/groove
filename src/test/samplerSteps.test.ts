/**
 * **A sampler lane's notes end in the browser too** — the criterion the realtime half never had.
 *
 * The export had a note-off bug and so did this, in the same shape: `scheduleSamplerSteps` passed `startSamplerNote` a start
 * time and nothing else, so every voice took the branch that schedules no end. The difference is what happens next. An offline
 * render stops at its own length, so a missing note-off there is a drone for the rest of the file; a live context never stops on
 * its own, so the note rings until the user presses stop or closes the tab, and an arrangement whose notes overlap piles voices
 * up on the audio clock.
 *
 * The seam is the same one the offline path is judged through: `planSamplerSteps` is pure ("which steps sound, at what pitch,
 * how long") and `scheduleSamplerSteps` places them, with the context and the loader injected. So the criterion is measured on
 * the scheduler's own calls, with no browser and no audio hardware.
 *
 * The length is the lane's, not the scheduler's invention: a note is held for its `gate` in steps (`noteLayer.stepDuration`,
 * the rule `AudioEngine` and the offline paths read) timed by the **same** `stepSeconds` that places its onset — one reading of
 * the grid for both ends of the note.
 */
import { describe, expect, it } from "vitest";
import { planSamplerSteps, scheduleSamplerSteps, type SamplerStepInput } from "../audio/samplerSteps";
import { FakeAudioBuffer, FakeAudioContext } from "./helpers/fakeAudio";
import type { SampleLoader } from "../audio/sampleLoader";
import type { SequencerTrack } from "../types/genre";

const SAMPLE_RATE = 44100;

/** The lane's bytes: a cosine, so a note that did start is distinguishable from one that did not. */
function sampleBuffer(frames = 44100): FakeAudioBuffer {
  const buffer = new FakeAudioBuffer(1, frames, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.cos((2 * Math.PI * i) / 64);
  return buffer;
}

/** A loader that resolves every note, recording which were asked for — the resolution is not what this file judges. */
function fakeLoader(): { loader: SampleLoader; notes: Array<{ assetId: string; pitch: number }> } {
  const notes: Array<{ assetId: string; pitch: number }> = [];
  const loader = {
    async loadNote(assetId: string, pitch: number) {
      notes.push({ assetId, pitch });
      return { buffer: sampleBuffer() as unknown as AudioBuffer, ratio: 1, samplePath: `${assetId}/${pitch}.wav` };
    },
  } as unknown as SampleLoader;
  return { loader, notes };
}

/** A sampler lane as the engine's pattern carries it: one entry per step, the pitch and the gate in parallel arrays. */
function samplerLane(notes: Array<{ step: number; pitch: number; gate?: number }>, length = 16): SequencerTrack {
  const steps = new Array<number>(length).fill(0);
  const pitch = new Array<number | null>(length).fill(null);
  const gate = new Array<number>(length).fill(0);
  for (const note of notes) {
    steps[note.step] = 1;
    pitch[note.step] = note.pitch;
    if (note.gate !== undefined) gate[note.step] = note.gate;
  }
  return {
    track_id: "audio",
    laneId: "sampler-1",
    name: "Bassoon",
    instrument: "sampler",
    steps,
    pitch,
    gate,
    sample: { assetId: "vsco2ce:BassoonStac" },
  } as unknown as SequencerTrack;
}

async function schedule(lane: SequencerTrack): Promise<{ context: FakeAudioContext; started: Array<{ when: number; offset: number; duration?: number }> }> {
  const context = new FakeAudioContext();
  const { loader } = fakeLoader();
  const input: SamplerStepInput = {
    context: context as unknown as BaseAudioContext,
    destination: context.createGain() as unknown as AudioNode,
    loader,
    bpm: 120,
  };
  const events = planSamplerSteps([{ sourceTrackId: "t1", lane }]);
  await scheduleSamplerSteps(events, input);
  return { context, started: context.createdBufferSources.map((source) => source.started[0]!) };
}

describe("scheduling a sampler lane's steps in the browser", () => {
  it("ends each note at the lane's own gate, so a played note does not ring until the tab closes", async () => {
    // A note held for one beat: `gate` 4 steps at 120 bpm is 4 × (60 / 120 / 4) = 0.5 s.
    const { started } = await schedule(samplerLane([{ step: 0, pitch: 60, gate: 4 }]));
    expect(started).toEqual([{ when: 0, offset: 0, duration: 0.5 }]);
  });

  it("falls back to the engine's own 0.8-step length when the lane states no gate", async () => {
    // A step with no `gate` sounds for 0.8 steps — `noteLayer.stepDuration`'s rule, the same default the offline planner uses.
    const events = planSamplerSteps([{ sourceTrackId: "t1", lane: samplerLane([{ step: 0, pitch: 60 }]) }]);
    expect(events[0]!.gateSteps).toBeCloseTo(0.8, 6);
    const { started } = await schedule(samplerLane([{ step: 0, pitch: 60 }]));
    expect(started[0]!.duration).toBeCloseTo(0.1, 6);
  });

  it("keeps repeated notes on consecutive steps separate, because a step grid cannot tie a note", async () => {
    /**
     * ⭐ **The guardrail, on the path users hear.** Three repeated C4s a sixteenth apart are three attacks — the shape an
     * arrangement produces for three notes on consecutive steps — and merging consecutive pitched steps into one "held" note
     * would silence the second and third. A held note in this model is `gate > 1` on **one** step, which the case above pins.
     */
    const lane = samplerLane([
      { step: 0, pitch: 60, gate: 1 },
      { step: 1, pitch: 60, gate: 1 },
      { step: 2, pitch: 60, gate: 1 },
    ]);
    const events = planSamplerSteps([{ sourceTrackId: "t1", lane }]);
    expect(events.map((event) => event.step)).toEqual([0, 1, 2]);

    const { context, started } = await schedule(lane);
    expect(context.createdBufferSources).toHaveLength(3);
    expect(started.map((entry) => entry.when)).toEqual([0, 0.125, 0.25]);
    expect(started.map((entry) => entry.duration)).toEqual([0.125, 0.125, 0.125]);
  });
});
