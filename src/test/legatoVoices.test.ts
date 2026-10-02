/**
 * ⭐⭐ **What actually happens to the voices at an overlap — the measured half of "overlap is not legato".**
 *
 * `src/test/legatoJoin.test.ts` judges the rule (should this join be legato?). This file judges the performance:
 * the ledger that keeps track of what is sounding (`src/audio/legatoVoices.ts`), through the **production** sink the
 * renderer uses (`src/audio/samplerLaneSink.ts`), driven by the real lane planner
 * (`scheduleOfflineAudioLanes`). Nothing here is a copy of the production path: the same `startSamplerNote`, the same
 * release rule, the same loop declaration and the same ledger as a `render_arrangement` call.
 *
 * ## The one refusal the plan cannot make, and why it dominates the numbers
 *
 * The plan asks for a handover at all 19 of the owner's chord changes (57 notes). The voice layer performs **30** of
 * them and refuses 27, and the reason is the same every time: `VlnEns_susVib_*` are **one-shot recordings**
 * (`docs/STRING_TECHNIQUES.md` §3 — 75 programs, 0 `loop` opcodes, 0 `smpl` chunks), 11.7 s long, against chords
 * every 4 s. A voice carried from the first chord can only reach three chords in; the note that would overrun is
 * started as a fresh attack instead, which is exactly the renderer's old behaviour. So the criterion's shape is
 * "every requested join is either performed or refused **by name**", never "the join silently became a silence".
 */
import { describe, expect, it } from "vitest";
import { scheduleOfflineAudioLanes, planOfflineAudioLanes } from "../audio/offlineAudioLanes";
import { createOfflineSamplerSink } from "../audio/samplerLaneSink";
import { createLegatoVoiceLedger } from "../audio/legatoVoices";
import { startSamplerNote } from "../audio/samplerVoice";
import { compileArrangementToPattern } from "../data/arrangementCompile";
import { FakeAudioBuffer, FakeAudioContext } from "./helpers/fakeAudio";
import type { SampleLoader } from "../audio/sampleLoader";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { ArrangementV2, NoteEvent } from "../types/arrangementV2";

const SUSTAIN = "vsco2ce:ViolinEnsSusVib";
const PIZZ = "vsco2ce:ViolinEnsPizz";
/** The instrument name a lane declares, and the recording the written table resolves it to — the same two ids the app uses. */
const SUSTAIN_LANE = "strings_lead";
const PIZZ_LANE = "violin_section_pizzicato";
const RECORDING_SECONDS = 11.7;
const SAMPLE_RATE = 44100;

const asset = (assetId: string): SampleAsset => ({
  assetId,
  name: assetId,
  kind: "one-shot",
  seconds: RECORDING_SECONDS,
  sfz: { url: "https://example.test/program.sfz", path: "program.sfz" },
});

/**
 * The owner's strings as notes: twenty three-note chords, one every eight beats, every note held 8.5 beats — so each
 * chord is still sounding half a beat into the next (the measurement `src/test/ownerProjectAcceptance.test.ts` pins).
 */
function ownerShapedNotes(chordCount = 20, holdBeats = 8.5): NoteEvent[] {
  const voicings = [
    [57, 60, 64],
    [58, 62, 65],
    [60, 64, 67],
    [62, 65, 69],
  ];
  const notes: NoteEvent[] = [];
  for (let index = 0; index < chordCount; index += 1) {
    for (const pitch of voicings[index % voicings.length]!) {
      notes.push({ pitch, startBeats: 32 + index * 8, lengthBeats: holdBeats, velocity: 50 });
    }
  }
  return notes;
}

function arrangement(instrument = SUSTAIN_LANE): ArrangementV2 {
  return {
    songId: "song",
    sourceSlots: [],
    bars: 52,
    tracks: [{ id: "t1", kind: "synth", name: "弦乐", instrument } as never],
  } as ArrangementV2;
}

/** A loader that resolves every note to a recording of a stated length at its recorded pitch, and counts the calls. */
function loaderOf(durationSeconds = RECORDING_SECONDS): { loader: SampleLoader; loads: number } {
  const state = { loads: 0 };
  const loader = {
    async load() {
      throw new Error("unused: every lane in these criteria is an instrument");
    },
    async loadNote(_assetId: string, pitch: number) {
      state.loads += 1;
      return {
        buffer: new FakeAudioBuffer(1, Math.round(durationSeconds * SAMPLE_RATE), SAMPLE_RATE) as unknown as AudioBuffer,
        ratio: 1,
        samplePath: `${pitch}.wav`,
      };
    },
    decodes: () => state.loads,
  } as unknown as SampleLoader;
  return { loader, get loads() {
    return state.loads;
  } } as never;
}

/** The whole path for one arrangement: the real compile, the real planner, the real sink. */
async function render(notes: NoteEvent[], instrument = SUSTAIN_LANE, loadSeconds = RECORDING_SECONDS) {
  const pattern = compileArrangementToPattern(arrangement(instrument), { t1: notes });
  /** Both recordings are in the catalogue, and the **lane's own instrument name** decides which one it plays — the same resolution the renderer runs. */
  const catalogue = [asset(SUSTAIN), asset(PIZZ)];
  const plan = planOfflineAudioLanes(pattern, catalogue);
  const context = new FakeAudioContext();
  const sink = createOfflineSamplerSink({ context: context as never, destination: context.createGain() as never });
  const loader = loaderOf(loadSeconds);
  const report = await scheduleOfflineAudioLanes({ pattern, catalogue, loader: loader.loader, sink });
  return { pattern, plan, report, context, loader };
}

describe("the voices at a chord change", () => {
  it("⭐ hands every note over in the plan, and carries the sounding voice at the changes the recording can reach", async () => {
    const { plan, report, context } = await render(ownerShapedNotes());
    /**
     * **The plan's reading is the rule's own answer, and it is total**: nineteen overlaps, fifty-seven notes on them,
     * fifty-seven handovers asked for, zero fresh attacks decided by the rule.
     */
    expect(plan.legato).toMatchObject({ overlappingOnsets: 19, notesAtOverlaps: 57, joins: 57, reattacks: 0 });
    expect(report.legato!.planned).toMatchObject({ overlappingOnsets: 19, notesAtOverlaps: 57, joins: 57 });
    /**
     * **The voice layer's reading**: ten of the nineteen changes are carried on each of the three lines and nine are
     * not, because 11.7 s of one-shot recording covers two chords of 4 s and not three. Thirty carried, twenty-seven
     * refused — every refusal named.
     */
    const voices = report.legato!.voices!;
    /**
     * **Thirty-two carried, twenty-five refused.** The count is a consequence of the interval arithmetic rather than
     * of the chord count — a line that moves *down* consumes its recording more slowly than one that moves up, so the
     * three lines of these voicings reach the bound at different changes. It is pinned here as the measurement it is.
     */
    expect(voices.joins).toBe(32);
    expect(voices.refusals).toHaveLength(25);
    expect(new Set(voices.refusals.map((one) => one.reason))).toEqual(new Set(["recording-would-run-out"]));
    /**
     * ⭐ **The accounting, which is the criterion that matters**: every one of the sixty notes is either a recording
     * started once or a voice carried from one that was — `30 + 30 = 60`, with no note dropped and no second source
     * created for a carried voice.
     */
    expect(context.createdBufferSources).toHaveLength(28);
    expect(voices.joins + voices.refusals.length).toBe(57);
    expect(voices.joins + context.createdBufferSources.length).toBe(60);
    // And no source was ever started twice, which would be the defect this whole feature exists to remove.
    expect(context.createdBufferSources.filter((source) => source.started.length > 1)).toHaveLength(0);
    /**
     * **The carried voice is one node with three scheduled ends** — its own note's, then one per handover — which is
     * the specification's "the last invocation will be the only one applied" doing the moving.
     */
    const carried = context.createdBufferSources.filter((source) => source.stopCalls.length > 1);
    expect(carried.length).toBeGreaterThan(0);
    expect(Math.max(...carried.map((source) => source.stopCalls.length))).toBe(3);
  });

  it("⭐ leaves a repeated pitch to a fresh attack at every change, while the other two lines are carried", async () => {
    /**
     * A moving top line, a moving bottom line, and a middle line that holds one pitch for four chords. Rule ② refuses
     * the middle line every time (a repeated note is a new stroke) and carries the other two whenever the recording
     * allows — so the refusal names a *voice*, not a chord change.
     */
    const notes: NoteEvent[] = [];
    for (let index = 0; index < 4; index += 1) {
      for (const [offset, pitch] of [
        [0, 57 + index],
        [1, 60],
        [2, 64 + index],
      ] as const) {
        void offset;
        notes.push({ pitch, startBeats: 32 + index * 8, lengthBeats: 8.5, velocity: 50 });
      }
    }
    const { report } = await render(notes);
    const refused = report.legato!.planned.lanes[0]!.refusals;
    expect(refused.map((one) => one.reason)).toEqual(["repeated-pitch", "repeated-pitch", "repeated-pitch"]);
    expect(refused.map((one) => one.pitch)).toEqual([60, 60, 60]);
    /**
     * Two handovers are asked for at each of the three changes. The first change's two are performed; the second
     * change's two are refused **by the voice layer**, because carrying them would run past the recording (3.084 s
     * left, 4.25 s needed); the third change's two are performed, because the refusal before them restarted the
     * recording. So one render shows both owners of a refusal — the rule and the recording — each named.
     */
    expect(report.legato!.planned.joins).toBe(6);
    expect(report.legato!.voices!.joins).toBe(4);
    expect(report.legato!.voices!.refusals.map((one) => one.reason)).toEqual(["recording-would-run-out", "recording-would-run-out"]);
    expect(report.legato!.voices!.refusals.map((one) => one.atSeconds)).toEqual([24, 24]);
    expect(report.legato!.voices!.refusals[0]!.because).toContain("only 3.084 s is left");
  });

  it("⭐ renders a staccato-class technique with every note its own attack, and says why", async () => {
    /**
     * The same notes on the plucked program: the lane is not legato-capable at all, the plan joins nothing, and the
     * render is sixty recordings — which is the *correct* reading of a plucked part, not a gap.
     */
    const { plan, report, context } = await render(ownerShapedNotes(), PIZZ_LANE);
    expect(plan.legato!.joins).toBe(0);
    expect(plan.legato!.lanes[0]!.technique).toBe("pizzicato");
    expect(plan.legato!.lanes[0]!.legatoCapable).toBe(false);
    expect(new Set(plan.legato!.lanes[0]!.refusals.map((one) => one.reason))).toEqual(new Set(["technique-is-not-sustained"]));
    expect(report.legato!.voices!.joins).toBe(0);
    expect(report.legato!.voices!.refusals).toEqual([]);
    expect(context.createdBufferSources).toHaveLength(60);
  });

  it("⭐ changes nothing when the writing has a gap, since an overlap is the rule's whole input", async () => {
    /**
     * Notes held 7 beats against an 8-beat spacing: every chord has released before the next begins. That is
     * `legatoGapsFor`' case, the rule has no overlap to act on, and the render is exactly what it was before this
     * existed — sixty attacks, no reading, nothing refused.
     */
    const { plan, report, context } = await render(ownerShapedNotes(20, 7));
    expect(plan.legato).toBeUndefined();
    expect(report.legato).toBeUndefined();
    expect(context.createdBufferSources).toHaveLength(60);
  });
});

/**
 * The ledger on its own, with the voice it is really given — a refusal must be a fresh attack, and a carried voice must
 * be the *same node*, moved.
 */
describe("the voice ledger", () => {
  const buffer = new FakeAudioBuffer(1, SAMPLE_RATE * 20, SAMPLE_RATE) as unknown as AudioBuffer;

  it("carries the same node when the recording can reach, and starts a new one when it cannot", () => {
    const context = new FakeAudioContext();
    const ledger = createLegatoVoiceLedger();
    const start = () =>
      startSamplerNote({
        context: context as never,
        destination: context.createGain() as never,
        buffer,
        ratio: 1,
        whenSeconds: 0,
        seconds: 4.25,
        releaseSeconds: 0.25,
      });
    const first = ledger.play({ trackIndex: 0, name: "s", rank: 0, pitch: 60, atSeconds: 0, seconds: 4.25, ratio: 1, recordingSeconds: 11.7, start });
    /** A handover inside the recording's reach: the same voice comes back, and no second node exists. */
    const second = ledger.play({
      trackIndex: 0,
      name: "s",
      rank: 0,
      pitch: 64,
      atSeconds: 4,
      seconds: 4.25,
      ratio: 1,
      recordingSeconds: 11.7,
      join: { rank: 0, fromPitch: 60, fromSeconds: 0, overlapSeconds: 0.25, because: "the bow has not stopped" },
      start,
    });
    expect(second).toBe(first);
    expect(context.createdBufferSources).toHaveLength(1);
    expect(ledger.reading().joins).toBe(1);
    /** The third change is past the recording's end (4 + 4 + 4.25 > 11.7), so it is refused by name and starts fresh. */
    const third = ledger.play({
      trackIndex: 0,
      name: "s",
      rank: 0,
      pitch: 67,
      atSeconds: 8,
      seconds: 4.25,
      ratio: 1,
      recordingSeconds: 11.7,
      join: { rank: 0, fromPitch: 64, fromSeconds: 4, overlapSeconds: 0.25, because: "the bow has not stopped" },
      start,
    });
    expect(third).not.toBe(first);
    expect(context.createdBufferSources).toHaveLength(2);
    expect(ledger.reading()).toMatchObject({ joins: 1 });
    expect(ledger.reading().refusals).toHaveLength(1);
    expect(ledger.reading().refusals[0]).toMatchObject({ reason: "recording-would-run-out", pitch: 67, fromPitch: 64 });
    // And the refusal reads as the measurement it is, not as an opinion.
    expect(ledger.reading().refusals[0]!.because).toContain('4.25 s of "s"\'s recording and only 1.776 s is left');
  });

  it("refuses a handover when the voice it names is not sounding, and never joins across lanes or ranks", () => {
    const context = new FakeAudioContext();
    const ledger = createLegatoVoiceLedger();
    const start = () =>
      startSamplerNote({ context: context as never, destination: context.createGain() as never, buffer, ratio: 1, whenSeconds: 0, seconds: 4.25, releaseSeconds: 0.25 });
    ledger.play({ trackIndex: 0, name: "s", rank: 0, pitch: 60, atSeconds: 0, seconds: 4.25, ratio: 1, recordingSeconds: 11.7, start });
    /** Rank 1 has never sounded: the plan's request cannot be met, and the answer is an attack rather than silence. */
    ledger.play({
      trackIndex: 0,
      name: "s",
      rank: 1,
      pitch: 64,
      atSeconds: 4,
      seconds: 4.25,
      ratio: 1,
      recordingSeconds: 11.7,
      join: { rank: 1, fromPitch: 60, fromSeconds: 0, overlapSeconds: 0.25, because: "x" },
      start,
    });
    /** And the same for a lane that has no voice at all. */
    ledger.play({
      trackIndex: 9,
      name: "other",
      rank: 0,
      pitch: 60,
      atSeconds: 4,
      seconds: 4.25,
      ratio: 1,
      recordingSeconds: 11.7,
      join: { rank: 0, fromPitch: 60, fromSeconds: 0, overlapSeconds: 0.25, because: "x" },
      start,
    });
    expect(context.createdBufferSources).toHaveLength(3);
    expect(ledger.reading().joins).toBe(0);
    expect(ledger.reading().refusals.map((one) => one.reason)).toEqual(["no-sounding-voice", "no-sounding-voice"]);
  });

  it("refuses when the sounding voice is not the pitch the plan named, rather than carrying the wrong note", () => {
    const context = new FakeAudioContext();
    const ledger = createLegatoVoiceLedger();
    const start = () =>
      startSamplerNote({ context: context as never, destination: context.createGain() as never, buffer, ratio: 1, whenSeconds: 0, seconds: 4.25, releaseSeconds: 0.25 });
    ledger.play({ trackIndex: 0, name: "s", rank: 0, pitch: 60, atSeconds: 0, seconds: 4.25, ratio: 1, recordingSeconds: 11.7, start });
    ledger.play({
      trackIndex: 0,
      name: "s",
      rank: 0,
      pitch: 64,
      atSeconds: 4,
      seconds: 4.25,
      ratio: 1,
      recordingSeconds: 11.7,
      // The plan says this voice is sounding 62; it is sounding 60. Carrying it would move the wrong line.
      join: { rank: 0, fromPitch: 62, fromSeconds: 0, overlapSeconds: 0.25, because: "x" },
      start,
    });
    expect(ledger.reading().refusals[0]!.reason).toBe("no-sounding-voice");
    expect(ledger.reading().refusals[0]!.because).toMatch(/sounding 60, not 62/);
  });

  it("refuses a voice whose end is fixed in its node, which is a voice the take-over cannot move", () => {
    const context = new FakeAudioContext();
    const ledger = createLegatoVoiceLedger();
    /**
     * A note whose written length equals the recording's: no release is scheduled (the recording ends the note), so
     * the length was passed to `start(when, 0, seconds)` and the node owns it. The recording has "enough left" by the
     * ledger's arithmetic, so the refusal that comes back is the node's, by name.
     */
    const start = () =>
      startSamplerNote({ context: context as never, destination: context.createGain() as never, buffer, ratio: 1, whenSeconds: 0, seconds: 11.7 });
    ledger.play({ trackIndex: 0, name: "s", rank: 0, pitch: 60, atSeconds: 0, seconds: 11.7, ratio: 1, recordingSeconds: 11.7, start });
    ledger.play({
      trackIndex: 0,
      name: "s",
      rank: 0,
      pitch: 64,
      atSeconds: 4,
      seconds: 4.25,
      ratio: 1,
      recordingSeconds: 11.7,
      join: { rank: 0, fromPitch: 60, fromSeconds: 0, overlapSeconds: 0.25, because: "x" },
      start,
    });
    expect(ledger.reading().joins).toBe(0);
    expect(ledger.reading().refusals[0]!.reason).toBe("voice-cannot-be-extended");
  });
});
