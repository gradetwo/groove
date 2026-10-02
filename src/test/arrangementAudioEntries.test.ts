/**
 * **The arrangement's audio exports**, through the workbench's own renderers.
 *
 * An offline render needs a Web Audio context jsdom does not have, so the waveform cannot be judged here — and the
 * question that actually went wrong while this was being written is not the waveform anyway. `compileArrangementToPattern`'s
 * second parameter defaults to **empty notes**, so an export that forgets to hand over `arrangement.notesByTrack` renders
 * silence and still returns a valid `.wav` with a plausible size. That is exactly the class of failure the owner reported
 * ("功能有了，页面没做入口" and, behind it, no way to tell), so the renderers are stubbed and the **pattern they were
 * handed** is what is asserted: its tempo, and that its lanes actually fire.
 *
 * The mocks live in their own file on purpose. A module mock is module-global, and mixing it into a file that also drives
 * the real Ableton writer made that writer hang — the isolation is not tidiness, it is what makes the unmocked test real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArrangementV2, NoteEvent } from "../types/arrangementV2";
import { mp3FileFor, stemsFileFor, wavFileFor } from "../features/arrangement/arrangementFiles";

const audioMock = vi.hoisted(() => ({ wav: [] as Array<{ bpm?: number; soundingSteps: number }>, stems: [] as number[] }));

const soundingSteps = (pattern: { tracks?: Array<{ steps?: number[] }> }) =>
  (pattern.tracks ?? []).reduce((total, track) => total + (track.steps ?? []).filter((value) => Number(value) > 0).length, 0);

vi.mock("../audio/WavExporter", () => ({
  exportMasterWav: async (pattern: { bpm?: number; tracks?: Array<{ steps?: number[] }> }) => {
    audioMock.wav.push({ bpm: pattern.bpm, soundingSteps: soundingSteps(pattern) });
    return { blob: new Blob(["wav"]), filename: "arrangement_master.wav", limiterKind: "true-peak", gs1HostFailures: 0, workletsUnavailable: false };
  },
  exportStemsZip: async (pattern: { tracks?: Array<{ steps?: number[] }> }) => {
    audioMock.stems.push(soundingSteps(pattern));
    return { blob: new Blob(["zip"]), filename: "arrangement_stems.zip", gs1HostFailures: 0, workletsUnavailable: false };
  },
}));

vi.mock("../audio/Mp3Exporter", () => ({
  exportMasterMp3: async () => ({
    blob: new Blob(["mp3"]),
    filename: "arrangement_master.mp3",
    limiterKind: "true-peak",
    gs1HostFailures: 0,
    workletsUnavailable: false,
    bitrateKbps: 192,
  }),
}));

const note = (pitch: number, startBeats: number, lengthBeats = 1): NoteEvent => ({ pitch, startBeats, lengthBeats, velocity: 100 });

const arrangement = (): ArrangementV2 => ({
  songId: "new",
  sourceSlots: [],
  bars: 2,
  bpm: 128,
  timeSignature: "4/4",
  tracks: [
    { id: "t-lead", kind: "instrument", name: "Lead" },
    { id: "t-drums", kind: "drumkit", name: "Drums" },
  ],
  notesByTrack: {
    "t-lead": [note(60, 0), note(64, 1), note(67, 2, 2)],
    "t-drums": [note(36, 0, 0.25), note(38, 2, 0.25)],
  },
});

describe("the arrangement's audio exports", () => {
  beforeEach(() => {
    audioMock.wav.length = 0;
    audioMock.stems.length = 0;
  });

  it("renders the arrangement's own notes and tempo, so an export is not silence", async () => {
    const wav = await wavFileFor(arrangement());
    expect(wav.filename).toContain(".wav");
    expect(audioMock.wav).toHaveLength(1);
    expect(audioMock.wav[0]!.bpm).toBe(128);
    // Five notes on the grid is five sounding steps; zero is the bug this criterion exists for.
    expect(audioMock.wav[0]!.soundingSteps).toBeGreaterThanOrEqual(5);
  });

  it("encodes the same master to MP3 and reports its own bitrate", async () => {
    const mp3 = await mp3FileFor(arrangement());
    expect(mp3.kind).toBe("mp3");
    expect(mp3.filename.endsWith(".mp3")).toBe(true);
    expect(mp3.bitrateKbps).toBe(192);
  });

  it("hands the stems renderer the same sounding pattern, not an empty one", async () => {
    await stemsFileFor(arrangement());
    expect(audioMock.stems[0]).toBeGreaterThanOrEqual(5);
  });
});
