/**
 * ⭐⭐ **The overlap rule on the two live paths** — what the owner actually hears when they press play.
 *
 * `src/audio/legatoJoin.ts` landed with the offline renderer (`5bb7c7b`), which left the two paths the application
 * plays through unmarked: the arrangement player (`playerFromEngine.ts` → `planSamplerSteps` →
 * `scheduleSamplerSteps`) and the audio-lane playback plan (`audioLanePlan.ts` → `audioLaneScheduler.ts` →
 * `browserSampleSink`). This file judges that they now say the same thing the renderer says, from the **same**
 * function, and that the voice layer carries the voices rather than re-attacking them.
 *
 * The judge is the recording count, not the code path: an overlap the bow never stopped used to start a fresh
 * `AudioBufferSourceNode` for the new note, so "how many recordings did the lane start" is a direct read of "how many
 * attacks happened" (`docs/LEGATO_OVERLAP.md` §4.4 states the same measurement for the offline half).
 *
 * ## The three readings, on purpose
 *
 *   · **The plan's** — `planSamplerSteps` / `planAudioLaneEvents` write `voiceRank` and `legato` onto their own
 *     events, and `handedOn` onto the voice a later note will be carried from;
 *   · **the voice layer's** — the ledger (`src/audio/legatoVoices.ts`) reports what it carried and every refusal
 *     with its reason, so "the rule asked and the recording could not" is never read as "the join was made";
 *   · **the audio graph's** — `FakeAudioContext.createdBufferSources` counts the recordings actually started.
 *
 * ## One rule, three callers
 *
 * The middle describe block is the criterion for that claim rather than for a number: the same overlap is planned by
 * the offline planner, by the audio-lane plan and by the sampler steps, and all three must produce the mark
 * **`decideLegatoJoin` itself answers with** — the same `because` sentence, the same rank, the same pitch it is
 * carried from. A second implementation of any question would have to reproduce that sentence to pass.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fromMidi } from "../data/midiToArrangement";
import { compileArrangementToLanes, compileArrangementToPattern } from "../data/arrangementCompile";
import { planSamplerSteps, scheduleSamplerSteps } from "../audio/samplerSteps";
import { planAudioLaneEvents } from "../audio/audioLanePlan";
import { scheduleAudioLaneSamples } from "../audio/audioLaneScheduler";
import { browserSampleSink } from "../audio/browserSampleGraph";
import { createLegatoVoiceLedger } from "../audio/legatoVoices";
import { decideLegatoJoin, planLegatoJoins } from "../audio/legatoJoin";
import { planOfflineAudioLanes } from "../audio/offlineAudioLanes";
import { resolveInstrumentNote } from "../audio/sfz/instrument";
import { audioLaneReplyFields } from "../../mcp/pattern";
import { FakeAudioBuffer, FakeAudioContext } from "./helpers/fakeAudio";
import type { OfflineAudioLaneEvent } from "../audio/offlineAudioLanes";
import type { SampleLoader } from "../audio/sampleLoader";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { NoteEvent } from "../types/arrangementV2";
import type { SequencerTrack } from "../types/genre";

const SUSTAIN = "vsco2ce:ViolinEnsSusVib";
/** The pinned program text, read from this repository's own copy of the upstream file — the same one the renderer's criterion resolves against. */
const PROGRAM = join("src", "test", "fixtures", "sfz", "vsco2ce", "ViolinEnsSusVib.sfz");
const PROJECT = process.env.GROOVE_OWNER_MIDI ?? "/tmp/groove-fx/fate-echoes.mid";
/**
 * The five recordings the part resolves to, in seconds, read off the delivered RIFF headers
 * (`docs/STRING_TECHNIQUES.md` §8). They are what makes the voice layer's refusals computable here without the
 * network: the ledger's whole question is whether the carrying voice's recording reaches the end of the note it is
 * handed, and a one-second placeholder would answer a different question.
 */
const MEASURED: Record<string, number> = {
  "VlnEns_susVib_A2_v1.wav": 11.22,
  "VlnEns_susVib_B2_v1.wav": 13.12,
  "VlnEns_susVib_D3_v1.wav": 11.688,
  "VlnEns_susVib_F#3_v1.wav": 8.988,
  "VlnEns_susVib_A3_v1.wav": 10.716,
};

const SUSTAIN_ASSET: SampleAsset = {
  assetId: SUSTAIN,
  name: "Violin Section, sustained",
  kind: "one-shot",
  seconds: 11.7,
  sfz: { url: "https://example.test/ViolinEnsSusVib.sfz", path: "ViolinEnsSusVib.sfz" },
};

/** A loader that resolves every note through the **real** pinned program, with the recordings' measured lengths. */
function vscoLoader() {
  const programText = readFileSync(PROGRAM, "utf8");
  return {
    async load(): Promise<AudioBuffer> {
      throw new Error("unused: the strings lane is an instrument");
    },
    async loadNote(_assetId: string, pitch: number) {
      /**
       * ⭐ **The same resolution the offline criterion uses**, down to the part's own velocity of 50 — the program has
       * velocity-split takes and the two readings are only comparable number for number if both resolve the same
       * region. The real `createSampleLoader` is not what this file judges (it has its own criteria); what it judges is
       * that the two planners and the ledger agree.
       */
      const resolved = resolveInstrumentNote(SUSTAIN_ASSET, programText, pitch, { velocity: 50 });
      if (!resolved.ok || !resolved.note) throw new Error(resolved.reason ?? `note ${pitch} has no playback`);
      const name = resolved.note.samplePath.replace(/^.*[\\/]/, "");
      const seconds = MEASURED[name] ?? 11.7;
      return {
        buffer: new FakeAudioBuffer(1, Math.round(seconds * 44100), 44100) as unknown as AudioBuffer,
        ratio: resolved.note.ratio,
        samplePath: resolved.note.samplePath,
      };
    },
    decodes: () => 0,
  } as unknown as SampleLoader;
}

/** A sustained lane as the engine's pattern carries it: `steps`, `pitch` and `gate` in parallel arrays. */
function laneOf(notes: Array<{ step: number; pitch: number; gate: number }>, length = 16): SequencerTrack {
  const steps = new Array<number>(length).fill(0);
  const pitch = new Array<number | null>(length).fill(null);
  const gate = new Array<number>(length).fill(0);
  for (const note of notes) {
    steps[note.step] = 1;
    pitch[note.step] = note.pitch;
    gate[note.step] = note.gate;
  }
  return {
    track_id: "audio",
    laneId: "strings",
    name: "弦乐",
    instrument: "sampler",
    steps,
    pitch,
    gate,
    sample: { assetId: SUSTAIN },
  } as unknown as SequencerTrack;
}

/** The audio-lane plan's input for one such lane, one bar long, at 120 bpm. */
function songOf(lane: SequencerTrack) {
  return { clips: { A: { tracks: [lane] } }, sections: [{ id: "s1", slot: "A", bars: 1 }], boundaries: [0], bpm: 120 };
}

const owner = existsSync(PROJECT);

describe.skipIf(!owner)("⭐ the owner's strings, on the arrangement player's own path", () => {
  /**
   * ⭐⭐ **The same reading the offline renderer reports, produced by the path the owner plays through.**
   *
   * `fate-echoes.mid`'s strings part is twenty three-note chords every 8 beats, each held 8.5 — a half-beat dovetail,
   * so nineteen onsets land on a chord that has not released and fifty-seven notes are new attacks there. The rule
   * asks for all fifty-seven, and `VlnEns_susVib_*` are one-shot recordings with no loop points, so a carried voice
   * reaches about three chords before its recording runs out: **32 carried, 25 refused**, **28 recordings started for
   * 60 notes**, and **one** attack instead of three at beat 48 = 24.0000 s.
   *
   * Those are the offline numbers (`docs/LEGATO_OVERLAP.md` §4.2) and they are asserted here as **the live path's**,
   * because the owner hears the application and not the export.
   */
  it("⭐ carries 32 and refuses 25, so 25 attacks land on a sounding chord where 57 did", async () => {
    const strings: NoteEvent[] = fromMidi(new Uint8Array(readFileSync(PROJECT))).parts.find((part) => part.name.includes("弦"))!.notes;
    const arrangement = {
      songId: "owner",
      sourceSlots: [],
      bars: 52,
      bpm: 120,
      tracks: [{ id: "t1", kind: "synth", name: "弦乐", instrument: "strings_lead" }],
    } as never;
    const compiled = compileArrangementToLanes(arrangement, { t1: strings });
    const samplerLanes = [{ sourceTrackId: "t1", lane: compiled[0]!.track }];
    const bpm = 120;
    const events = planSamplerSteps(samplerLanes, { bpm });

    /**
     * The plan marks every note of every onset after the first, and names every voice a later note will be handed —
     * the second field being what lets the scheduler start those voices with a movable end at all.
     */
    expect(events).toHaveLength(60);
    expect(events.filter((event) => event.legato !== undefined)).toHaveLength(57);
    expect(events.filter((event) => event.handedOn === true)).toHaveLength(57);
    expect(events.filter((event) => event.legato !== undefined).every((event) => event.voiceRank !== undefined)).toBe(true);

    /** The overlaps, measured on the plan's own steps and gates rather than restated: 19 onsets, 57 notes on them. */
    const stepSeconds = 60 / bpm / 4;
    const onsets = new Map<number, number[]>();
    const ends = new Map<number, number[]>();
    for (const event of events) {
      onsets.set(event.step, [...(onsets.get(event.step) ?? []), event.pitch]);
      ends.set(event.step, [...(ends.get(event.step) ?? []), event.step * stepSeconds + event.gateSteps * stepSeconds]);
    }
    const steps = [...onsets.keys()].sort((a, b) => a - b);
    const overlapping = steps.filter((step, index) => index > 0 && Math.max(...ends.get(steps[index - 1]!)!) > step * stepSeconds + 1e-6);
    const notesAtOverlaps = overlapping.reduce((total, step) => total + onsets.get(step)!.length, 0);
    expect(overlapping).toHaveLength(19);
    expect(notesAtOverlaps).toBe(57);

    const context = new FakeAudioContext();
    const report = await scheduleSamplerSteps(events, {
      context: context as never,
      destination: context.createGain() as never,
      loader: vscoLoader(),
      bpm,
    });

    /** The voice layer's reading: every refusal is the recording, and every refusal names it. */
    expect(report.problems).toEqual([]);
    expect(report.legato.joins).toBe(32);
    expect(report.legato.refusals).toHaveLength(25);
    expect(new Set(report.legato.refusals.map((refusal) => refusal.reason))).toEqual(new Set(["recording-would-run-out"]));
    // ⭐ The headline: 57 attacks before the rule, 57 − 32 carried = 25 after.
    expect(notesAtOverlaps - report.legato.joins).toBe(25);
    /** And the accounting closes: 32 carried + 28 recordings started = the 60 notes of the part. */
    expect(context.createdBufferSources).toHaveLength(28);
    expect(report.legato.joins + context.createdBufferSources.length).toBe(strings.length);

    /** The instant the owner pointed at: three attacks before, one after, and the refusal names the voice it could not carry. */
    const at24 = (one: { atSeconds: number }) => Math.abs(one.atSeconds - 24) < 1e-6;
    expect(report.legato.refusals.filter(at24)).toHaveLength(1);
    expect(report.legato.refusals.find(at24)!.fromPitch).toBe(67);
    expect(onsets.get(steps.find((step) => Math.abs(step * stepSeconds - 24) < 1e-6)!)!).toHaveLength(3);
  });

  /**
   * ⭐ **The reply can carry the same reading**, which is what the owner asked for at the end of the offline work:
   * `report.legato` existed and reached no caller (`audioLaneReplyFields` did not pick it). This runs the **offline**
   * planner over the owner's own compiled pattern and puts its reading through the reply formatter, so the two halves
   * are judged on one input rather than on a fixture invented for the formatter.
   */
  it("⭐ the MCP reply carries the reading: 19 changes, 57 notes, 57 requested, 0 silent", () => {
    const strings: NoteEvent[] = fromMidi(new Uint8Array(readFileSync(PROJECT))).parts.find((part) => part.name.includes("弦"))!.notes;
    const arrangement = {
      songId: "owner",
      sourceSlots: [],
      bars: 52,
      bpm: 120,
      tracks: [{ id: "t1", kind: "synth", name: "弦乐", instrument: "strings_lead" }],
    } as never;
    const pattern = compileArrangementToPattern(arrangement, { t1: strings });
    const plan = planOfflineAudioLanes(pattern, [SUSTAIN_ASSET]);
    expect(plan.legato).toBeDefined();

    const fields = audioLaneReplyFields({ lanes: [], events: 0, problems: [], legato: { planned: plan.legato! } });
    expect(fields.audioLaneLegato).toMatchObject({
      overlappingChordChanges: 19,
      notesOnThem: 57,
      handedOverByTheRule: 57,
      refusedByTheRule: 0,
      // No voice reading was handed over, so every requested handover is still an attack — the honest floor.
      attacksOnSoundingChords: 57,
    });
    expect((fields.audioLaneLegato as { lanes: unknown[] }).lanes).toHaveLength(1);
    expect(String(fields.audioLaneLegatoNote)).toMatch(/refusedBecause/);
  });
});

describe("⭐ the audio-lane playback plan and the browser sink", () => {
  /**
   * ⭐ **Two overlapping sustained notes, one recording.** The first is held three seconds and the second begins one
   * second in, so 2.0 s of the first is still sounding when the second attacks — the same dovetail as the owner's
   * chords, in one bar. Before this work both notes started their own `AudioBufferSourceNode`; the planner now marks
   * the second as a handover from the first (rank 0, from 57) and the browser sink carries the sounding voice.
   */
  it("⭐ marks the second note as a handover and starts one recording instead of two", async () => {
    const lane = laneOf([
      { step: 0, pitch: 57, gate: 24 },
      { step: 8, pitch: 64, gate: 24 },
    ]);
    const song = songOf(lane);
    const catalogue = [SUSTAIN_ASSET];
    const plan = planAudioLaneEvents(song, catalogue);

    expect(plan.problems).toEqual([]);
    expect(plan.events).toHaveLength(2);
    // Both notes are lines of the same onset-rank space: two onsets of one note each, so both are rank 0.
    expect(plan.events.map((event) => event.voiceRank)).toEqual([0, 0]);
    const first = plan.events[0]!;
    const second = plan.events[1]!;
    expect(first.legato).toBeUndefined();
    expect(first.handedOn).toBe(true);
    expect(second.handedOn).toBeUndefined();
    expect(second.legato).toMatchObject({ rank: 0, fromPitch: 57, fromSeconds: 0, overlapSeconds: 2 });

    const context = new FakeAudioContext();
    const ledger = createLegatoVoiceLedger();
    const report = await scheduleAudioLaneSamples(song, vscoLoader(), browserSampleSink(context as never, context.createGain() as never, ledger), 0, catalogue);

    expect(report.problems).toEqual([]);
    expect(report.scheduled).toBe(2);
    expect(ledger.reading().joins).toBe(1);
    expect(ledger.reading().refusals).toEqual([]);
    /** The measurement that is the point: one recording for two notes, where two attacks used to land. */
    expect(context.createdBufferSources).toHaveLength(1);
    /**
     * ⭐ **And that one voice was started with a movable end**, because the rule named it as handed on: no scheduled
     * duration, so `takeOver()` can move where the note ends. The criterion right after this one is the negative
     * half — a note nobody will be handed keeps the scheduled length it always had.
     */
    expect(context.createdBufferSources[0]!.started[0]!.duration).toBeUndefined();
  });

  /**
   * ⭐ **A plain note is released too — the restriction to `handedOn` was the click.**
   *
   * This case used to pin the opposite: the offline sink released a note whose written end arrived before its recording,
   * while the live sinks did so **only** for voices the legato rule named as `handedOn`, so a note with nothing after it
   * kept a scheduled stop. The owner reported what that sounds like (2026-10-09): *playing the virtual keyboard, every
   * note clicked as the key came up* — the gate lands while the recording is still at full level, and stopping it there is
   * a step to zero. `samplerReleaseSeconds` now answers for every path, so this note is released, and the keyboard stopped
   * clicking while the export keeps sounding exactly as it did.
   */
  it("⭐ releases a plain note whose gate ends before its recording, exactly as the offline sink does", async () => {
    const lane = laneOf([{ step: 0, pitch: 57, gate: 24 }]);
    const catalogue = [SUSTAIN_ASSET];
    const context = new FakeAudioContext();
    const report = await scheduleAudioLaneSamples(songOf(lane), vscoLoader(), browserSampleSink(context as never, context.createGain() as never), 0, catalogue);
    expect(report.problems).toEqual([]);
    expect(report.scheduled).toBe(1);
    // One note, one recording, and **no scheduled stop**: its end is reached through the release ramp, not a cut.
    expect(context.createdBufferSources).toHaveLength(1);
    expect(
      context.createdBufferSources[0]!.started[0]!.duration,
      "released rather than cut, because the recording outlasts the gate"
    ).toBeUndefined();
  });

  it("leaves a repeated pitch and a lane with no recording alone, so the boundary cases do not move", () => {
    /** A repeated pitch is a new stroke (Dorico), whatever the bow is doing. */
    const repeated = laneOf([
      { step: 0, pitch: 60, gate: 24 },
      { step: 8, pitch: 60, gate: 24 },
    ]);
    const repeatedPlan = planAudioLaneEvents(songOf(repeated), [SUSTAIN_ASSET]);
    expect(repeatedPlan.events.map((event) => event.legato)).toEqual([undefined, undefined]);
    expect(repeatedPlan.events.map((event) => event.handedOn)).toEqual([undefined, undefined]);

    /** And a plan with no tempo states no seconds, so no decision is forced and nothing is marked. */
    const noTempo = planAudioLaneEvents({ clips: { A: { tracks: [repeated] } }, sections: [{ id: "s1", slot: "A", bars: 1 }] }, [SUSTAIN_ASSET]);
    expect(noTempo.events.every((event) => event.legato === undefined && event.voiceRank === undefined)).toBe(true);
  });
});

/**
 * ⭐⭐ **One rule, three callers — judged by the rule's own sentence.**
 *
 * The three planners build their events in three different shapes, from three different planners, and each writes
 * `voiceRank` / `legato` / `handedOn`. The proof that none of them re-implements a question is that all three produce
 * **the same `because` string** as `decideLegatoJoin` does for the same pair of notes — and that string is generated in
 * exactly one place, so a second implementation would have to reproduce it to pass.
 */
describe("⭐ one rule, three callers", () => {
  /** The same overlap in three shapes: a 1.5 s note at 0 s, a 1.5 s note at 1.0 s, pitches 60 then 64, sustained strings. */
  const previousEndSeconds = 1.5;
  const startSeconds = 1;

  it("gives the same answer, word for word, from the offline planner, the audio-lane plan and the sampler steps", () => {
    const rule = decideLegatoJoin({ previousEndSeconds, startSeconds, previousPitch: 60, pitch: 64, technique: "sustain" });
    expect(rule.kind).toBe("legato");

    /** ① The offline planner's own pass, over the events it builds (`planLegatoJoins` is what it calls). */
    const offlineEvents: OfflineAudioLaneEvent[] = [
      { trackIndex: 0, track_id: "audio", name: "弦乐", assetId: SUSTAIN, pitch: 60, atSeconds: 0, seconds: 1.5, gainDb: 0 },
      { trackIndex: 0, track_id: "audio", name: "弦乐", assetId: SUSTAIN, pitch: 64, atSeconds: 1, seconds: 1.5, gainDb: 0 },
    ];
    const offline = planLegatoJoins(offlineEvents);

    /** ② The arrangement player's planner — a step is 0.125 s at 120 bpm, so step 0 = 0 s and step 8 = 1 s, gate 12 = 1.5 s. */
    const lane = laneOf([
      { step: 0, pitch: 60, gate: 12 },
      { step: 8, pitch: 64, gate: 12 },
    ]);
    const live = planSamplerSteps([{ sourceTrackId: "t1", lane }], { bpm: 120 });

    /** ③ The audio-lane playback plan — the same lane, planned by the other live planner. */
    const playback = planAudioLaneEvents(songOf(lane), [SUSTAIN_ASSET]);

    const marks = [
      offline.events.find((event) => event.legato !== undefined)!.legato!,
      live.find((event) => event.legato !== undefined)!.legato!,
      playback.events.find((event) => event.legato !== undefined)!.legato!,
    ];
    for (const mark of marks) {
      expect(mark).toMatchObject({ rank: 0, fromPitch: 60, fromSeconds: 0, overlapSeconds: 0.5 });
      /** The rule's own sentence, character for character: the three callers did not compose a reason of their own. */
      expect(mark.because).toBe(rule.because);
    }
    /** And the voice each of them names as handed on is the same one. */
    expect(offline.events[0]!.handedOn).toBe(true);
    expect(live[0]!.handedOn).toBe(true);
    expect(playback.events[0]!.handedOn).toBe(true);
  });

  it("refuses the same pairs for the same reasons, so a repeated pitch is a new stroke on every path", () => {
    const rule = decideLegatoJoin({ previousEndSeconds, startSeconds, previousPitch: 60, pitch: 60, technique: "sustain" });
    expect(rule).toMatchObject({ kind: "bow-change", refusal: "repeated-pitch" });

    const offlineEvents: OfflineAudioLaneEvent[] = [
      { trackIndex: 0, track_id: "audio", name: "弦乐", assetId: SUSTAIN, pitch: 60, atSeconds: 0, seconds: 1.5, gainDb: 0 },
      { trackIndex: 0, track_id: "audio", name: "弦乐", assetId: SUSTAIN, pitch: 60, atSeconds: 1, seconds: 1.5, gainDb: 0 },
    ];
    const offline = planLegatoJoins(offlineEvents);
    expect(offline.reading.lanes[0]!.refusals.map((refusal) => refusal.reason)).toEqual(["repeated-pitch"]);
    /** The rule's sentence travels into the reading, so both halves of the reply can be compared to it. */
    expect(offline.reading.lanes[0]!.refusals[0]!.because).toBe(rule.because);

    const lane = laneOf([
      { step: 0, pitch: 60, gate: 12 },
      { step: 8, pitch: 60, gate: 12 },
    ]);
    expect(planSamplerSteps([{ sourceTrackId: "t1", lane }], { bpm: 120 }).every((event) => event.legato === undefined)).toBe(true);
    expect(planAudioLaneEvents(songOf(lane), [SUSTAIN_ASSET]).events.every((event) => event.legato === undefined)).toBe(true);
  });
});
