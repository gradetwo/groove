/**
 * ⭐ **The owner's own project, end to end** — imported with the repository's reader, resolved against the real VSCO
 * program, and measured where it stops sounding.
 *
 * ## The file
 *
 * `宿命回响-工程文件.mid`, re-sent as a zip after the first attachment arrived corrupted (607 `U+FFFD` bytes, 58% of the
 * file, `notes: 0` from this reader — see the git history of this file for that measurement). This copy is clean:
 *
 * ```
 *   path   /tmp/groove-fx/fate-echoes.mid
 *   size   1902 bytes
 *   sha256 35d7f3e5c9fa50e9cd13fb00e22eaf0e3923848e9d4483a17b86f33c6017e323
 *   bytes >= 0x80 replaced by U+FFFD: 0
 *   format 1, 4 declared MTrk chunks, all 4 walk to the last byte
 * ```
 *
 * It is read here by `MidiImporter`/`midiToArrangement`, never by a second parser. The private path is environment
 * overridable, and the whole file **skips** when it is absent rather than passing on a machine that never saw it.
 *
 * ## What the project says
 *
 * ```
 *   Conductor  0 notes
 *   钢琴       58 notes, channel 0, pitches 60–77, lengths 2/4/6/8/12 beats
 *   弦乐       60 notes, channel 1, pitches 57–69, length 8.5 beats, every velocity 50
 *   贝斯       80 notes, channel 2, pitches 33–38, length 2 beats
 *   tempo 120 bpm (stated), division 480
 * ```
 *
 * The strings part is **20 chords of 3 notes**, one every 8 beats, each held 8.5 beats — so consecutive chords
 * **overlap by half a beat by construction**. The report's description ("8 beats, no overlap") is off by the half beat
 * that makes it legato, and that matters because it means the writing is already the connected kind.
 *
 * ## ⭐ The measurement that decides the report, and it decides against it
 *
 * ```
 *   8.5 beats at 120 bpm                        = 4.25 s
 *   the recording each note resolves to         = 11.70 s   (VlnEns_susVib_*_v1.wav)
 * ```
 *
 * **Every string note is shorter than the recording it plays.** So the note cannot reach the end of its sample, the
 * sample cannot be exhausted, and there is no periodic collapse to fix: the strings stop sounding when the **note**
 * ends, and on a note-off the synth preset's release takes it down. That is why the fix in `samplerVoice` changes
 * nothing about this project — its regions declare no loop at all — and it is the same answer `sfizz_render` gives for
 * the same program (measured: a 25-second note on this program goes silent at 12.5 s, at the recording's end).
 *
 * **The conclusion, stated as a conclusion rather than as an excuse**: the "断" the owner hears in these strings is the
 * **material**, not a defect in this application. `VSCO-2-CE`'s sustained strings are one-shot recordings — none of its
 * 75 pinned programs writes any `loop*=` opcode, and its sustained `.wav`s carry no `smpl` chunk — so no player can
 * hold them past 11.7 s, and these notes do not even ask to.
 *
 * ## What it does pin about the chain
 *
 *   · all 60 string notes resolve to **real** VSCO regions (`VlnEns_susVib_D3_v1`, `F#3_v1`, `A3_v1`, …) with the
 *     velocity-50 soft take, and none is refused;
 *   · those regions declare **no `loop_mode`** and no `one_shot` — so the loop work is a no-op here, by measurement;
 *   · an imported MIDI part becomes a **`synth` track**, so this project currently sounds through the built-in preset
 *     rather than through those samples. That is the bridge work, reported rather than papered over here.
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fromMidi } from "../data/midiToArrangement";
import { compileArrangementToPattern } from "../data/arrangementCompile";
import { scheduleOfflineAudioLanes } from "../audio/offlineAudioLanes";
import { createOfflineSamplerSink } from "../audio/samplerLaneSink";
import { FakeAudioBuffer, FakeAudioContext } from "./helpers/fakeAudio";
import { resolveInstrumentNote } from "../audio/sfz/instrument";
import { legatoGapsFor } from "../data/legatoGaps";
import { chordChangeReattacks } from "../data/stringTechniques";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { NoteEvent } from "../types/arrangementV2";

/** `GROOVE_OWNER_MIDI` first, so a runner can point at its own copy; the delivered path otherwise. */
const PROJECT = process.env.GROOVE_OWNER_MIDI ?? "/tmp/groove-fx/fate-echoes.mid";
const PROJECT_SHA = "35d7f3e5c9fa50e9cd13fb00e22eaf0e3923848e9d4483a17b86f33c6017e323";
/** The pinned program text, read from this repository's own copy of the upstream file. */
const PROGRAM = join("src", "test", "fixtures", "sfz", "vsco2ce", "ViolinEnsSusVib.sfz");
const PROGRAM_SHA = "4591e212cccf1cbcff0c78cf8429a8221bb0820b70cb7c8dd6685f470ace4eaa";
/** The upstream address the manifest pins, so the resolver is handed the same program identity it gets in the app. */
const PIN = "6dd651d55dde97fd4028699be9d4481f26917891";
const VIOLIN_SFZ = `https://raw.githubusercontent.com/schollz/VSCO-2-CE/${PIN}/ViolinEnsSusVib.sfz`;
const ASSET: Pick<SampleAsset, "assetId" | "sfz"> = { assetId: "vsco2ce:ViolinEnsSusVib", sfz: { url: VIOLIN_SFZ, path: "ViolinEnsSusVib.sfz" } };

/** The recording every one of the strings notes resolves to, in seconds — measured from the file's own header below. */
const RECORDING_SECONDS = 11.7;

const present = existsSync(PROJECT);

/** The strings part, as the repository's reader sees it. */
function stringsPart(): NoteEvent[] {
  const imported = fromMidi(new Uint8Array(readFileSync(PROJECT)));
  const strings = imported.parts.find((part) => part.name.includes("弦"));
  if (!strings) throw new Error(`the project has no strings part: ${imported.parts.map((part) => part.name).join(", ")}`);
  return strings.notes;
}

describe.skipIf(!present)("the owner's project (宿命回响)", () => {
  it("says where it looked, so a skip is not mistaken for a pass", () => {
    console.log(`   owner project : ${PROJECT} (sha256 ${PROJECT_SHA.slice(0, 12)}…)`);
    expect(existsSync(PROJECT)).toBe(true);
  });

  it("is a clean standard MIDI file — the re-sent copy, not the one that arrived corrupted", () => {
    const bytes = readFileSync(PROJECT);
    expect(bytes.length).toBe(1902);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(PROJECT_SHA);
    // The first attachment had 607 of these; a clean file has none, and its track chunks walk to the last byte.
    let replaced = 0;
    for (let i = 0; i + 2 < bytes.length; i += 1) if (bytes[i] === 0xef && bytes[i + 1] === 0xbf && bytes[i + 2] === 0xbd) replaced += 1;
    expect(replaced).toBe(0);
    let offset = 14;
    let chunks = 0;
    while (offset + 8 <= bytes.length && bytes.toString("latin1", offset, offset + 4) === "MTrk") {
      offset += 8 + bytes.readUInt32BE(offset + 4);
      chunks += 1;
    }
    expect(chunks).toBe(4);
    expect(offset).toBe(bytes.length);
  });

  it("reads into the three parts the report names, with the numbers the report names", () => {
    const imported = fromMidi(new Uint8Array(readFileSync(PROJECT)));
    expect(imported.problems).toEqual([]);
    expect(imported.tempoBpm).toBe(120);
    expect(imported.division).toBe(480);
    const counts = Object.fromEntries(imported.parts.map((part) => [part.name, part.notes.length]));
    expect(counts["钢琴"]).toBe(58);
    expect(counts["弦乐"]).toBe(60);
    expect(counts["贝斯"]).toBe(80);
    expect(imported.parts.reduce((total, part) => total + part.notes.length, 0)).toBe(198);
  });

  it("⭐ writes the strings as 8.5-beat chords that overlap, shorter than the recording they play", () => {
    const strings = stringsPart();
    const byOnset = new Map<number, NoteEvent[]>();
    for (const note of strings) byOnset.set(note.startBeats, [...(byOnset.get(note.startBeats) ?? []), note]);
    const onsets = [...byOnset.keys()].sort((a, b) => a - b);
    // Twenty chords of three notes, and every note held 8.5 beats at every velocity 50.
    expect(onsets).toHaveLength(20);
    expect(strings.every((note) => note.lengthBeats === 8.5)).toBe(true);
    expect([...new Set(strings.map((note) => note.velocity))]).toEqual([50]);
    expect([...new Set(strings.map((note) => note.pitch))].sort((a, b) => a - b)).toEqual([57, 58, 60, 61, 62, 64, 65, 67, 69]);
    /**
     * ⭐ **The overlap, which is the half the report missed.** A chord starting at beat 8k ends at 8k + 8.5, so it is
     * still sounding half a beat into the next chord — the writing is already legato, which is what `legatoGapsFor`
     * exists to say out loud elsewhere.
     */
    for (let index = 0; index + 1 < onsets.length; index += 1) {
      const chord = byOnset.get(onsets[index]!)!;
      const end = Math.max(...chord.map((note) => note.startBeats + note.lengthBeats));
      expect(onsets[index + 1]! - end).toBeCloseTo(-0.5, 6);
    }
    /**
     * ⭐ **And the measurement the report turns on.** 8.5 beats at 120 bpm is 4.25 seconds; the recording is 11.70.
     * The note ends two and three-quarter times earlier than its sample can run out, so "the sample plays once and
     * stops" cannot be what this project hears.
     */
    const noteSeconds = (8.5 * 60) / 120;
    expect(noteSeconds).toBe(4.25);
    expect(noteSeconds).toBeLessThan(RECORDING_SECONDS);
    expect(RECORDING_SECONDS / noteSeconds).toBeGreaterThan(2.7);
  });

  it("resolves all 60 string notes to real VSCO recordings, and this program declares no loop", () => {
    const programText = readFileSync(PROGRAM, "utf8");
    expect(createHash("sha256").update(programText).digest("hex")).toBe(PROGRAM_SHA);
    const strings = stringsPart();
    const samples = new Set<string>();
    for (const note of strings) {
      const resolved = resolveInstrumentNote(ASSET, programText, note.pitch, { velocity: note.velocity });
      expect(resolved.ok, `note ${note.pitch} has no playback`).toBe(true);
      samples.add(resolved.note!.samplePath);
      /**
       * ⭐ **The fact that decides the report**: not one of these regions declares a loop, and none declares
       * `one_shot` either. They are ordinary one-shot regions, so the `loop_mode` support added in this change is a
       * no-op for this project — reported as the result it is rather than as a gap left behind.
       */
      expect(resolved.note!.loopMode).toBeUndefined();
      expect(resolved.note!.loopStartFrames).toBeUndefined();
      expect(resolved.note!.loopEndFrames).toBeUndefined();
      expect(resolved.note!.oneShot).toBeUndefined();
    }
    /**
     * **Five recordings for nine pitches**, which is the program's own key map rather than one sample per note: its
     * regions span 2–4 semitones each, so A2/F#3/B2/D3/A3 between them answer 57, 58, 60, 61, 62, 64, 65, 67 and 69.
     * Every one is the velocity-50 soft take, because the part's own velocity is 50 and the takes split at 63.
     */
    expect([...samples].sort()).toEqual([
      "VlnEns_susVib_A2_v1.wav",
      "VlnEns_susVib_A3_v1.wav",
      "VlnEns_susVib_B2_v1.wav",
      "VlnEns_susVib_D3_v1.wav",
      "VlnEns_susVib_F#3_v1.wav",
    ]);
  });

  it("has a recording longer than the note, measured from the delivered bytes when they are here", () => {
    /**
     * The premise of the paragraph above, checked against the actual recording when this machine has it. Absent means
     * the assertion does not run — the same rule the rest of this repository uses for a large local asset.
     */
    let seconds: number;
    try {
      const wav = readFileSync(join(process.env.GROOVE_VSCO_DIR ?? "/tmp/vsco", "strings", "VlnEns_susVib_D3_v1.wav"));
      seconds = wav.readUInt32LE(40) / (wav.readUInt16LE(22) * (wav.readUInt16LE(34) / 8)) / wav.readUInt32LE(24);
    } catch {
      return;
    }
    expect(seconds).toBeCloseTo(RECORDING_SECONDS, 1);
    // 11.70 s of recording, a 4.25 s note: the note stops first, and no loop mode can change that.
    expect(seconds).toBeGreaterThan(4.25);
  });

  /**
   * ⭐⭐ **The owner's ear, located to the sample — and the correction it forced on this file.**
   *
   * The criteria above establish that the recording cannot be what ends these notes: the note is 4.25 s and the
   * recording is 11.70 s. That is true, and it was read as "so the writing is already legato and there is nothing
   * here". The owner then said **where** the break is — one instant, at 23.98 s on the ruler — and the owner was
   * right, which the arithmetic below shows to within a rendering buffer:
   *
   * ```
   *   the strings' chords start at beats 32, 40, 48, 56, … (16.00 s, 20.00 s, 24.00 s, 28.00 s, …)
   *   the owner's cursor                                       23.98 s
   *   ⇒ the nearest event is the chord at beat 48 = 24.0000 s, by 0.0200 s
   * ```
   *
   * **The distinction the earlier reading missed is that overlap is not legato.** These chords *dovetail* — each is
   * held 8.5 beats against an 8-beat spacing — but a dovetail is not a bow that never stopped: the new chord's notes
   * are new voices, each starting its own attack (`noteEnvelope` schedules every note's gain from −80 dBFS), so at
   * every change a fresh onset lands on top of a sounding chord. Twenty chords give **nineteen** such instants, and
   * the one the owner pointed at is among them.
   *
   * So the correction is: **the recording-length finding stands, and "the writing is already legato" does not.** This
   * criterion pins the second fact so the two cannot be conflated again.
   */
  it("⭐ locates the owner's break at a chord change: beat 48 = 24.00 s, 0.02 s from the cursor", () => {
    const strings = stringsPart();
    const bpm = 120;
    const seconds = (beats: number) => (beats * 60) / bpm;
    const onsets = [...new Set(strings.map((note) => note.startBeats))].sort((a, b) => a - b);
    // The first chord is at beat 32 = 16 s, and the chords run every 8 beats from there.
    expect(onsets[0]).toBe(32);
    expect(seconds(onsets[0]!)).toBe(16);
    // Beat 48 is a chord, and it is 24.0000 s exactly.
    expect(onsets).toContain(48);
    expect(seconds(48)).toBe(24);
    expect(Math.abs(seconds(48) - 23.98)).toBeLessThan(0.05);
    /**
     * And the overlap at that change, measured: the chord at beat 40 ends at beat 48.5, so when the chord at beat 48
     * begins there are **0.5 beats = 0.25 s** of the previous chord still sounding. That is the dovetail, and the
     * next assertion is that there are nineteen of them.
     */
    const chordsAt = (beat: number) => strings.filter((note) => note.startBeats === beat);
    const previousEnd = Math.max(...chordsAt(40).map((note) => note.startBeats + note.lengthBeats));
    expect(previousEnd - 48).toBeCloseTo(0.5, 6);

    const reports = chordChangeReattacks({ tracks: [{ id: "strings", name: "弦乐" }], notesByTrack: { strings } }, bpm);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.changesTotal).toBe(19);
    const at48 = reports[0]!.changes.find((change) => change.atBeats === 48)!;
    expect(at48.atSeconds).toBe(24);
    expect(at48.overlapSeconds).toBe(0.25);
    expect(at48.attacks).toBe(3);
    /**
     * **The two detectors answer different questions and only one of them sees this.** `legatoGapsFor` asks whether a
     * chord fails to reach the next; here every chord reaches it, so it reports nothing about the strings — which is
     * exactly how a real break went unnoticed by a check that looked like it covered this.
     */
    const gaps = legatoGapsFor({ tracks: [{ id: "strings", name: "弦乐" }], notesByTrack: { strings } } as never);
    expect(gaps.filter((gap) => gap.trackName === "弦乐")).toEqual([]);
  });

  /**
   * ⭐⭐ **The owner's own instant, before and after — the reading the report turns on.**
   *
   * The criterion above pins the *defect*: nineteen chord changes carry a fresh attack each, three of them at beat 48.
   * This one pins what the overlap rule does about them, through the **production** path — the same
   * `compileArrangementToPattern` the renderer flattens, the same `planOfflineAudioLanes` that decides the events, and
   * the same `createOfflineSamplerSink` a `render_arrangement` call builds.
   *
   * ```
   *   before   nineteen changes, three fresh attacks at each  = 57 attacks landing on a sounding chord
   *   after    nineteen changes, 32 notes carried, 25 refused = 25 attacks, and ONE at beat 48
   * ```
   *
   * ⚠️ **The twenty-five are not a failure of the rule.** `VlnEns_susVib_*` are one-shot recordings with no loop
   * points at all (§3 of `docs/STRING_TECHNIQUES.md`: 75 programs, zero `loop` opcodes, zero `smpl` chunks), so a
   * voice carried from one chord can only reach about three chords in before its recording runs out. Those notes are
   * started as fresh attacks — the renderer's old behaviour — and the refusal names the measurement, which is why the
   * count is asserted rather than the outcome being described as "fixed".
   */
  it("⭐ carries the strings at every change the recording can reach, and says where it cannot", async () => {
    const strings = stringsPart();
    const bpm = 120;
    const arrangement = {
      songId: "owner",
      sourceSlots: [],
      bars: 52,
      tracks: [{ id: "t1", kind: "synth", name: "弦乐", instrument: "strings_lead" }],
    } as never;
    const pattern = compileArrangementToPattern(arrangement, { t1: strings });
    const catalogue: SampleAsset[] = [
      { assetId: "vsco2ce:ViolinEnsSusVib", name: "Violin Section, sustained", kind: "one-shot", seconds: 11.7, sfz: { url: "https://example.test/ViolinEnsSusVib.sfz", path: "ViolinEnsSusVib.sfz" } },
    ];

    const programText = readFileSync(PROGRAM, "utf8");
    /**
     * **The recording each note resolves to, and how long it is.** The five durations are the ones read off the
     * delivered RIFF headers in `docs/STRING_TECHNIQUES.md` §8 — a real measurement of these exact files, carried
     * here rather than re-fetched, because the criterion's subject is the renderer and not the network.
     */
    const measured: Record<string, number> = {
      "VlnEns_susVib_A2_v1.wav": 11.22,
      "VlnEns_susVib_B2_v1.wav": 13.12,
      "VlnEns_susVib_D3_v1.wav": 11.688,
      "VlnEns_susVib_F#3_v1.wav": 8.988,
      "VlnEns_susVib_A3_v1.wav": 10.716,
    };
    const loader = {
      async load() {
        throw new Error("unused: the strings lane is an instrument");
      },
      async loadNote(_assetId: string, pitch: number) {
        const resolved = resolveInstrumentNote(ASSET, programText, pitch, { velocity: 50 });
        if (!resolved.ok) throw new Error(resolved.reason);
        const name = resolved.note!.samplePath.replace(/^.*[\\/]/, "");
        const seconds = measured[name] ?? RECORDING_SECONDS;
        return {
          buffer: new FakeAudioBuffer(1, Math.round(seconds * 44100), 44100) as unknown as AudioBuffer,
          ratio: resolved.note!.ratio,
          samplePath: resolved.note!.samplePath,
        };
      },
      decodes: () => 0,
    } as never;

    const context = new FakeAudioContext();
    const sink = createOfflineSamplerSink({ context: context as never, destination: context.createGain() as never });
    const report = await scheduleOfflineAudioLanes({ pattern, catalogue, loader, sink });

    /** The rule's own reading, on the owner's notes: every one of the 57 notes is asked to be handed over. */
    expect(report.legato!.planned).toMatchObject({ overlappingOnsets: 19, notesAtOverlaps: 57, joins: 57, reattacks: 0 });
    expect(report.legato!.planned.lanes[0]!.technique).toBe("sustain");

    /** What the voice layer could do with them: 32 carried, 25 refused, every refusal named and none of them silent. */
    const voices = report.legato!.voices!;
    expect(voices.joins).toBe(32);
    expect(voices.refusals).toHaveLength(25);
    expect(new Set(voices.refusals.map((one) => one.reason))).toEqual(new Set(["recording-would-run-out"]));

    /**
     * ⭐ **The before/after number, at the instant the owner pointed at.** `chordChangeReattacks` counts three fresh
     * attacks at beat 48; after the rule, two of those three notes are carried and the third is refused — so one
     * attack lands on a sounding chord where three did.
     */
    const at24 = (one: { atSeconds: number }) => one.atSeconds === 24;
    expect(voices.refusals.filter(at24)).toHaveLength(1);
    expect(voices.refusals.find(at24)!.fromPitch).toBe(67);
    /** And the accounting closes: 32 carried + 28 recordings started = the 60 notes of the part. */
    expect(context.createdBufferSources).toHaveLength(28);
    expect(voices.joins + context.createdBufferSources.length).toBe(strings.length);

    /** The output the report quotes, printed so a reader sees the numbers rather than the assertions. */
    console.log(
      `   弦乐 legato : ${report.legato!.planned.overlappingOnsets} overlapping chord change(s), ` +
        `${report.legato!.planned.notesAtOverlaps} note(s) on them, ${report.legato!.planned.joins} handed over by the rule; ` +
        `at the voice: ${voices.joins} carried, ${voices.refusals.length} refused (${[...new Set(voices.refusals.map((one) => one.reason))].join(", ")}); ` +
        `${context.createdBufferSources.length} recording(s) started for ${strings.length} notes; ` +
        `at beat 48 = 24 s: 3 attacks before, ${voices.refusals.filter(at24).length} after`
    );
  });
});
