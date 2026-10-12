/**
 * **The audio lane's bytes reach the mix** — the criterion the gap never had.
 *
 * `render_arrangement` reported an audio lane in `skippedLanes` while the renderer sounded it as a synthesised percussion hit: a false report *and* a wrong
 * sound. The valuable test is therefore not "the skip list got shorter" but "the lane's own samples appear in the render, where they were asked to be and at the
 * gain the model carries", and the browser seam is where it has to be measured.
 *
 * **jsdom has no `OfflineAudioContext`**, so the Web Audio graph cannot be run here. Rather than assert a flag, this file drives the *production*
 * `scheduleOfflineAudioLanes` — the function that decides which lanes render, at what second, at what gain, and what a failure reports — through the two seams it
 * was built with (an injected loader and an injected sink), and the sink **sums the samples into a buffer exactly as `AudioBufferSourceNode.start(when)` plus a
 * `GainNode` does**. The assertions below are on that summed signal: its nonzero energy, the exact frame it begins on, and how its energy scales with the lane's
 * gain. The browser adapter (`startSamplerNote` into the master graph) is the part jsdom cannot run, and it is a dozen lines whose only job is to call the same
 * placement this file measures.
 */
import { describe, expect, it } from "vitest";
import { audioLaneReplyFields } from "../../mcp/pattern";
import { compileArrangementToLanes, compileArrangementToPattern } from "../../src/data/arrangementCompile";
import { planOfflineAudioLanes, scheduleOfflineAudioLanes, type OfflineAudioLaneEvent, type OfflineAudioLaneSink } from "../../src/audio/offlineAudioLanes";
import type { SampleLoader } from "../../src/audio/sampleLoader";
import type { SampleAsset } from "../../src/data/sampleCatalogue";
import type { ArrangementV2 } from "../../src/types/arrangementV2";

const SAMPLE_RATE = 44100;

/** A decoded sample: one channel, a known length and level, so "did it reach the mix" is a number rather than a boolean. */
function fakeBuffer(frames = 441, amplitude = 1): AudioBuffer {
  const data = new Float32Array(frames);
  // A cosine so the **first** frame is already nonzero: the assertion below is "where does the lane begin", and a sine would make frame 0 a zero crossing.
  for (let i = 0; i < frames; i += 1) data[i] = amplitude * Math.cos((2 * Math.PI * i) / 64);
  return {
    length: frames,
    duration: frames / SAMPLE_RATE,
    sampleRate: SAMPLE_RATE,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

/** A loader that resolves every id (the "known" half) to a real signal, and records which route was used. */
function fakeLoader(): { loader: SampleLoader; loads: string[]; notes: Array<{ assetId: string; pitch: number }> } {
  const loads: string[] = [];
  const notes: Array<{ assetId: string; pitch: number }> = [];
  const loader = {
    async load(assetId: string) {
      loads.push(assetId);
      return fakeBuffer();
    },
    async loadNote(assetId: string, pitch: number) {
      notes.push({ assetId, pitch });
      return { buffer: fakeBuffer(), ratio: 1, samplePath: `${assetId}/${pitch}.wav` };
    },
    decodes: () => loads.length + notes.length,
  } as unknown as SampleLoader;
  return { loader, loads, notes };
}

/**
 * The sink the browser adapter stands in for: `start(buffer, when, gain)` summed into one channel, which is precisely what a `BufferSource` → `GainNode` does
 * for a sample with no processing.
 */
function summingSink(totalFrames: number) {
  const out = new Float32Array(totalFrames);
  const starts: Array<{ atFrame: number; gainDb: number; ratio: number; assetId: string; seconds?: number }> = [];
  const sink: OfflineAudioLaneSink = {
    start(buffer: AudioBuffer, event: OfflineAudioLaneEvent, ratio: number) {
      const atFrame = Math.round(event.atSeconds * SAMPLE_RATE);
      const gain = Math.pow(10, event.gainDb / 20);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length && atFrame + i < out.length; i += 1) out[atFrame + i] += data[i]! * gain;
      starts.push({ atFrame, gainDb: event.gainDb, ratio, assetId: event.assetId, seconds: event.seconds });
    },
  };
  const energy = () => out.reduce((sum, value) => sum + value * value, 0);
  const firstNonZero = () => out.findIndex((value) => Math.abs(value) > 1e-6);
  return { out, starts, sink, energy, firstNonZero };
}

/** A one-bar arrangement with a single sampler track, which is what `render_arrangement` flattens. */
function samplerArrangement(assetId: string, gainDb?: number): ArrangementV2 {
  return {
    songId: "song",
    sourceSlots: [],
    bars: 1,
    tracks: [{ id: "t1", kind: "sampler", name: "Drums", sample: { assetId }, ...(gainDb === undefined ? {} : { gainDb }) }],
  };
}

const plainAsset: SampleAsset = { assetId: "probe-impulse", name: "Probe impulse", kind: "one-shot", seconds: 0.01 };
const instrumentAsset: SampleAsset = {
  assetId: "probe-kit",
  name: "Probe kit",
  kind: "one-shot",
  seconds: 1,
  sfz: { url: "https://example.test/kit.sfz", path: "kit.sfz" },
};

describe("an arrangement's audio lane in the offline render", () => {
  it("renders a silent-but-known lane instead of reporting it skipped, and its bytes reach the mix", async () => {
    // The lane the adjudication called "silent-but-known": it names a sample the catalogue holds and has **no notes at all**, which is exactly the lane the old
    // path could only report. The compile is the real one `render_arrangement` uses, so the pattern under test is the pattern that reaches the renderer.
    const arrangement = samplerArrangement("probe-impulse");
    const pattern = compileArrangementToPattern(arrangement, { t1: [] });
    expect(pattern.tracks[0]!.track_id).toBe("audio");
    expect(pattern.tracks[0]!.steps.every((value) => value === 0)).toBe(true);

    const plan = planOfflineAudioLanes(pattern, [plainAsset]);
    expect(plan.problems).toEqual([]);
    expect(plan.lanes).toHaveLength(1);

    const { loader, loads } = fakeLoader();
    const mix = summingSink(SAMPLE_RATE);
    const report = await scheduleOfflineAudioLanes({ pattern, catalogue: [plainAsset], loader, sink: mix.sink });

    expect(loads).toEqual(["probe-impulse"]);
    expect(report.events).toBe(1);
    expect(report.problems).toEqual([]);
    // ⭐ Measured, not flagged: a real signal is in the buffer, starting at frame 0.
    expect(mix.energy()).toBeGreaterThan(0);
    expect(mix.firstNonZero()).toBe(0);
    expect(mix.starts[0]!.atFrame).toBe(0);

    // And the reply no longer claims the lane was skipped — the same report the tool's handler formats.
    const fields = audioLaneReplyFields(report);
    expect(fields.skippedLanes).toBeUndefined();
    expect(fields.renderedAudioLanes).toEqual([{ track_id: "audio", name: "Drums" }]);
  });

  it("places an instrument's notes at their own start offsets, which is the arrangement sampler case", async () => {
    // Two notes: one on beat 1, one on beat 3 of a 120 bpm bar → steps 0 and 8, i.e. 0 s and 1 s.
    const arrangement = samplerArrangement("probe-kit");
    const pattern = compileArrangementToPattern(arrangement, {
      t1: [
        { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 },
        { pitch: 64, startBeats: 2, lengthBeats: 1, velocity: 100 },
      ],
    });

    const { loader, notes } = fakeLoader();
    const mix = summingSink(SAMPLE_RATE * 2);
    const report = await scheduleOfflineAudioLanes({ pattern, catalogue: [instrumentAsset], loader, sink: mix.sink });

    expect(notes).toEqual([
      { assetId: "probe-kit", pitch: 60 },
      { assetId: "probe-kit", pitch: 64 },
    ]);
    expect(report.events).toBe(2);
    expect(report.problems).toEqual([]);
    // The second note is audible at its own second, not stacked on the first.
    expect(mix.starts.map((start) => start.atFrame)).toEqual([0, SAMPLE_RATE]);
    expect(mix.energy()).toBeGreaterThan(0);
    const secondNoteEnergy = mix.out.slice(SAMPLE_RATE).reduce((sum, value) => sum + value * value, 0);
    expect(secondNoteEnergy).toBeGreaterThan(0);
  });

  it("starts one voice per note when a column holds a chord, because the stack reaches the lane", async () => {
    /**
     * ⭐ **The chord an arrangement used to lose.** `stepsFromNotes` keeps one pitch per column — its `StepView`
     * is `number[]` — and the lane read the flattened singular `pitch`, so three notes written on beat 0
     * started one voice (the lowest) and the other two were silent. This pins the whole chain: the compiled
     * track carries the stack, and the lane starts every note in it.
     */
    const arrangement = samplerArrangement("probe-kit");
    const pattern = compileArrangementToPattern(arrangement, {
      t1: [
        { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 },
        { pitch: 64, startBeats: 0, lengthBeats: 1, velocity: 100 },
        { pitch: 67, startBeats: 0, lengthBeats: 1, velocity: 100 },
      ],
    });

    // The stack is in the artifact, not only in the planner — every other consumer of a pattern reads `pitches`.
    expect(pattern.tracks[0]!.pitches?.[0]).toEqual([60, 64, 67]);

    const { loader, notes } = fakeLoader();
    const mix = summingSink(SAMPLE_RATE * 2);
    const report = await scheduleOfflineAudioLanes({ pattern, catalogue: [instrumentAsset], loader, sink: mix.sink });

    expect(notes).toEqual([
      { assetId: "probe-kit", pitch: 60 },
      { assetId: "probe-kit", pitch: 64 },
      { assetId: "probe-kit", pitch: 67 },
    ]);
    expect(report.events).toBe(3);
    expect(report.problems).toEqual([]);
    // A chord is notes that sound **together**, so all three start on the same frame.
    expect(mix.starts.map((start) => start.atFrame)).toEqual([0, 0, 0]);
  });

  it("applies the lane's own gain from the arrangement model, measurably", async () => {
    const gainDb = -6.0206; // a linear 0.5, so the energy must fall to a quarter of unity
    const arrangement = samplerArrangement("probe-impulse", gainDb);

    // The model's `gainDb` reaches the lane as the pattern's linear fader — otherwise "with its own gain" would be a claim about a field nothing reads.
    const compiled = compileArrangementToLanes(arrangement, { t1: [] });
    expect(compiled[0]!.track.volume).toBeCloseTo(0.5, 4);

    // The unity render is a **different arrangement** — one that states no gain — so the two energies differ only by the lane's own level.
    const quietPattern = compileArrangementToPattern(arrangement, { t1: [] });
    const unityPattern = compileArrangementToPattern(samplerArrangement("probe-impulse"), { t1: [] });
    const unity = summingSink(SAMPLE_RATE);
    const quiet = summingSink(SAMPLE_RATE);
    await scheduleOfflineAudioLanes({ pattern: unityPattern, catalogue: [plainAsset], loader: fakeLoader().loader, sink: unity.sink });
    await scheduleOfflineAudioLanes({ pattern: quietPattern, catalogue: [plainAsset], loader: fakeLoader().loader, sink: quiet.sink });

    const expectedGain = Math.min(2, Math.pow(10, gainDb / 20));
    expect(quiet.energy() / unity.energy()).toBeCloseTo(expectedGain * expectedGain, 3);
  });

  it("counts a partly-resolved instrument as rendered, and still reports the note that failed", async () => {
    // A drum kit covering only part of what was written: note 60 answers, note 64 does not. "Skipped" would deny the hit that played; "rendered" alone would deny the miss.
    const arrangement = samplerArrangement("probe-kit");
    const pattern = compileArrangementToPattern(arrangement, {
      t1: [
        { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 },
        { pitch: 64, startBeats: 2, lengthBeats: 1, velocity: 100 },
      ],
    });
    const partial = {
      async load() {
        throw new Error("unused");
      },
      async loadNote(_assetId: string, pitch: number) {
        if (pitch === 64) throw new Error("note 64 has no playback: the file's regions cover keys 35–59");
        return { buffer: fakeBuffer(), ratio: 1, samplePath: "kit/60.wav" };
      },
      decodes: () => 1,
    } as unknown as SampleLoader;

    const mix = summingSink(SAMPLE_RATE * 2);
    const report = await scheduleOfflineAudioLanes({ pattern, catalogue: [instrumentAsset], loader: partial, sink: mix.sink });

    expect(report.events).toBe(1);
    expect(report.lanes).toHaveLength(1);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.reason).toMatch(/note 64/);
    expect(mix.energy()).toBeGreaterThan(0);
    const fields = audioLaneReplyFields(report);
    expect((fields.renderedAudioLanes as unknown[]).length).toBe(1);
    expect((fields.skippedLanes as unknown[]).length).toBe(1);
  });

  it("keeps going after a failed note, so a note outside the kit's range cannot silence the rest", async () => {
    // The repro the review found: the **lowest-step** note is out of range. Abandoning the lane on the first failure would silence note 40, which the file does cover.
    const arrangement = samplerArrangement("probe-kit");
    const pattern = compileArrangementToPattern(arrangement, {
      t1: [
        { pitch: 20, startBeats: 0, lengthBeats: 1, velocity: 100 },
        { pitch: 40, startBeats: 2, lengthBeats: 1, velocity: 100 },
      ],
    });
    const partial = {
      async load() {
        throw new Error("unused");
      },
      async loadNote(_assetId: string, pitch: number) {
        if (pitch === 20) throw new Error("note 20 has no playback: the file's regions cover keys 35–59");
        return { buffer: fakeBuffer(), ratio: 1, samplePath: "kit/40.wav" };
      },
      decodes: () => 1,
    } as unknown as SampleLoader;

    const mix = summingSink(SAMPLE_RATE * 2);
    const report = await scheduleOfflineAudioLanes({ pattern, catalogue: [instrumentAsset], loader: partial, sink: mix.sink });

    // Both notes were attempted — one started, one failed — and the second is audible at its own step.
    expect(report.events).toBe(1);
    expect(report.lanes).toHaveLength(1);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]!.reason).toMatch(/note 20/);
    expect(mix.starts.map((start) => start.atFrame)).toEqual([SAMPLE_RATE]);
    expect(mix.energy()).toBeGreaterThan(0);
  });

  it("gives every note the length the lane states, so a held note ends where it was written", async () => {
    /**
     * ⭐ **The drone, at the layer that caused it.** `startSamplerNote` has always been able to end a note, and the lane's
     * planner never told it how long the note was, so every sampled voice took the "no end scheduled" branch. The length is
     * the note's own: `NoteEvent.lengthBeats` becomes the lane's `gate`, and `gate` is a note's sounding length in steps —
     * the field `noteLayer`/`AudioEngine`/the synth dispatch already read.
     *
     * The fixture is the report's own shape: three 0.9-beat notes at beats 0, 2 and 4 of a 120 bpm bar (0, 1 and 2 seconds),
     * which is what an independent user rendered and measured droning through the whole file.
     */
    const arrangement = samplerArrangement("probe-kit");
    const pattern = compileArrangementToPattern(arrangement, {
      t1: [
        { pitch: 60, startBeats: 0, lengthBeats: 0.9, velocity: 100 },
        { pitch: 64, startBeats: 2, lengthBeats: 0.9, velocity: 100 },
        { pitch: 67, startBeats: 4, lengthBeats: 0.9, velocity: 100 },
      ],
    });
    // The length survived the compile as the lane's gate — 0.9 beats is 3.6 sixteenth-note steps.
    expect(pattern.tracks[0]!.gate?.[0]).toBeCloseTo(3.6, 6);
    expect(pattern.tracks[0]!.gate?.[8]).toBeCloseTo(3.6, 6);

    const plan = planOfflineAudioLanes(pattern, [instrumentAsset]);
    expect(plan.events.map((event) => event.atSeconds)).toEqual([0, 1, 2]);
    // 3.6 steps × (60 / 120 / 4) s = 0.45 s. A voice with no number here is a voice with no end.
    expect(plan.events.map((event) => event.seconds)).toEqual([0.45, 0.45, 0.45]);

    // And the sink is handed it, so the scheduler's answer reaches the node rather than stopping at the plan.
    const { loader } = fakeLoader();
    const mix = summingSink(SAMPLE_RATE * 3);
    await scheduleOfflineAudioLanes({ pattern, catalogue: [instrumentAsset], loader, sink: mix.sink });
    expect(mix.starts.map((start) => start.seconds)).toEqual([0.45, 0.45, 0.45]);
  });

  it("keeps notes written on consecutive steps separate, because a step grid cannot tie a note", () => {
    /**
     * ⭐ **The other direction, and why a run of steps must not be merged into one note.**
     *
     * Three quarters of a beat apart is three notes in this model, and they arrive as three consecutive marked steps with the
     * same pitch. Merging consecutive pitched steps into one "held" note would silence the second and third attacks and hold
     * the first through them — the mirror image of turning a sustain into a staccato, and just as much a change of what the
     * arrangement says. Nothing in the data distinguishes the two: a held note is `gate > 1` on **one** step (`noteEvents.ts`:
     * a step array "cannot express… a note held across four of them"; `stepsFromNotes` marks only a note's start).
     */
    const arrangement = samplerArrangement("probe-kit");
    const pattern = compileArrangementToPattern(arrangement, {
      t1: [
        { pitch: 60, startBeats: 0, lengthBeats: 0.25, velocity: 100 },
        { pitch: 60, startBeats: 0.25, lengthBeats: 0.25, velocity: 100 },
        { pitch: 60, startBeats: 0.5, lengthBeats: 0.25, velocity: 100 },
      ],
    });
    expect(pattern.tracks[0]!.steps.slice(0, 3)).toEqual([1, 1, 1]);
    expect(pattern.tracks[0]!.gate?.slice(0, 3)).toEqual([1, 1, 1]);

    const plan = planOfflineAudioLanes(pattern, [instrumentAsset]);
    // Three voices at three onsets, each one step long — not one voice held for three steps.
    expect(plan.events.map((event) => event.atSeconds)).toEqual([0, 0.125, 0.25]);
    expect(plan.events.map((event) => event.seconds)).toEqual([0.125, 0.125, 0.125]);
  });

  it("reports a muted lane and does not sound it", () => {
    // The mute rule is the engine's own (`deriveTrackStates`), so a muted audio lane and a muted synth lane are silenced by one decision.
    const arrangement: ArrangementV2 = {
      songId: "song",
      sourceSlots: [],
      bars: 1,
      tracks: [{ id: "t1", kind: "sampler", name: "Drums", sample: { assetId: "probe-impulse" }, muted: true }],
    };
    const pattern = compileArrangementToPattern(arrangement, { t1: [] });
    const plan = planOfflineAudioLanes(pattern, [plainAsset]);
    expect(plan.events).toEqual([]);
    expect(plan.lanes).toEqual([]);
    expect(plan.problems).toHaveLength(1);
    expect(plan.problems[0]!.reason).toMatch(/muted/);
    // And the reply says the lane is not in the render, rather than hiding it.
    expect(audioLaneReplyFields({ lanes: [], events: 0, problems: plan.problems }).skippedLanes).toHaveLength(1);
  });

  it("plans a lane whose track_id is spelled \"Audio\", because the guard and the planner share one test", () => {
    const pattern = compileArrangementToPattern(samplerArrangement("probe-impulse"), { t1: [] });
    pattern.tracks[0]!.track_id = "Audio" as (typeof pattern.tracks)[number]["track_id"];
    const plan = planOfflineAudioLanes(pattern, [plainAsset]);
    expect(plan.problems).toEqual([]);
    expect(plan.lanes).toHaveLength(1);
    expect(plan.events).toHaveLength(1);
  });

  it("reports a lane whose bytes cannot be resolved, named, rather than passing silently", async () => {
    const arrangement = samplerArrangement("not-in-the-catalogue");
    const pattern = compileArrangementToPattern(arrangement, { t1: [] });

    const plan = planOfflineAudioLanes(pattern, [plainAsset]);
    expect(plan.lanes).toEqual([]);
    expect(plan.problems).toHaveLength(1);
    expect(plan.problems[0]).toMatchObject({ track_id: "audio", name: "Drums", assetId: "not-in-the-catalogue" });
    expect(plan.problems[0]!.reason).toMatch(/not-in-the-catalogue/);

    // And the reply names the lane and why, rather than shortening the skip list in silence.
    const fields = audioLaneReplyFields({ lanes: plan.lanes, events: 0, problems: plan.problems });
    const skipped = fields.skippedLanes as Array<Record<string, unknown>>;
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.name).toBe("Drums");
    expect(String(skipped[0]!.reason)).toMatch(/not-in-the-catalogue/);
  });

  it("reports an instrument whose lane carries no note to resolve, rather than inventing one", () => {
    const arrangement = samplerArrangement("probe-kit");
    const pattern = compileArrangementToPattern(arrangement, { t1: [] });

    const plan = planOfflineAudioLanes(pattern, [instrumentAsset]);
    expect(plan.events).toEqual([]);
    expect(plan.problems).toHaveLength(1);
    expect(plan.problems[0]!.reason).toMatch(/no pitched steps/);
  });

  it("reports a lane whose sample resolves but whose bytes fail to load, once, with the loader's reason", async () => {
    const arrangement = samplerArrangement("probe-impulse");
    const pattern = compileArrangementToPattern(arrangement, { t1: [] });
    const failing = {
      async load() {
        throw new Error("sample \"probe-impulse\": neither address served the bytes");
      },
      async loadNote() {
        throw new Error("unused");
      },
      decodes: () => 1,
    } as unknown as SampleLoader;

    const mix = summingSink(SAMPLE_RATE);
    const report = await scheduleOfflineAudioLanes({ pattern, catalogue: [plainAsset], loader: failing, sink: mix.sink });

    expect(report.lanes).toEqual([]);
    expect(report.events).toBe(0);
    expect(report.problems).toHaveLength(1);
    expect(report.problems[0]).toMatchObject({ track_id: "audio", name: "Drums", assetId: "probe-impulse" });
    expect(report.problems[0]!.reason).toMatch(/neither address served the bytes/);
    // Nothing was mixed, and the reply says so rather than leaving an empty render unexplained.
    expect(mix.energy()).toBe(0);
    expect(audioLaneReplyFields(report).skippedLanes).toHaveLength(1);
  });
});
