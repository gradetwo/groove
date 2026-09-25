/**
 * Wiring: the per-genre insert layer must actually reach both engines (requirement 9, phase D).
 *
 * `genreInsert.test.ts` proves the *table* is right. This file proves the table is **used**:
 * a correct table that no engine consults is indistinguishable from no feature at all, and
 * that failure mode is invisible to a data test. It is the same class of mistake the plan
 * warns about ("有壳无芯" / a shell with nothing inside).
 *
 * Two kinds of evidence, because they cover different failure modes:
 *   - a behavioural assertion on the realtime engine's own read-back (`getTrackInsert`), and
 *   - source-level wiring assertions for both engines and both UI call sites, so a future edit
 *     that drops the genre argument fails here instead of silently reverting to role-only
 *     defaults. The plan sets the precedent for source-level wiring gates
 *     (`check_loudness_spread.mjs` asserts the master-chain topology by reading the source).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AudioEngine } from "../audio/AudioEngine";
import { resolveTrackInsertForGenre } from "../data/genreInsert";
import { resolveTrackInsert } from "../data/trackInsert";
import { ROLE_INSERT_DEFAULTS } from "../data/trackInsert";
import { installFakeAudioContext } from "./helpers/fakeAudio";
import type { SequencerPattern } from "../types/genre";

const SRC = resolve(__dirname, "..");
const read = (relative: string) => readFileSync(resolve(SRC, relative), "utf8");

function makePattern(genreId: string): SequencerPattern {
  const steps = 8;
  const track = (track_id: string, name: string) => ({
    track_id,
    name,
    instrument: track_id === "chords" ? "distorted_guitar" : "drum",
    steps: [1, 0, 0, 0, 1, 0, 0, 0],
    velocity: new Array(steps).fill(100),
    pitch: new Array(steps).fill(track_id === "chords" ? 60 : 0),
    gate: new Array(steps).fill(0.8),
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
  });
  return {
    genre_id: genreId,
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: steps,
    tracks: [track("kick", "Kick"), track("chords", "Chords")] as SequencerPattern["tracks"],
  };
}

describe("genre insert · the realtime engine resolves through the genre layer", () => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    restore = installFakeAudioContext();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("applies the genre's patch to a track that carries no stored chain", () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern("heavy-metal"));
    // The pattern's tracks declare no `insert`, so this is the factory default path — the
    // exact path a freshly loaded genre takes.
    expect(engine.getTrackInsert(1)).toEqual(resolveTrackInsertForGenre("chords", "heavy-metal"));
    expect(engine.getTrackInsert(1)?.driveEnabled).toBe(true);
    // …and it is genuinely different from the bare role default, or this test proves nothing.
    expect(engine.getTrackInsert(1)).not.toEqual(ROLE_INSERT_DEFAULTS.chords);
    engine.destroy();
  });

  it("does not drive the jazz comp", () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern("bebop"));
    expect(engine.getTrackInsert(1)).toEqual(resolveTrackInsertForGenre("chords", "bebop"));
    expect(engine.getTrackInsert(1)?.driveEnabled).toBe(false);
    engine.destroy();
  });

  it("lets a stored per-track chain win over the genre patch", () => {
    const pattern = makePattern("heavy-metal");
    pattern.tracks[1].insert = { ...ROLE_INSERT_DEFAULTS.chords, driveAmount: 1.25 };
    const engine = new AudioEngine();
    engine.setPattern(pattern);
    expect(engine.getTrackInsert(1)?.driveAmount).toBe(1.25);
    engine.destroy();
  });

  it("falls back to the role default for a genre with no patch (custom genre)", () => {
    const engine = new AudioEngine();
    engine.setPattern(makePattern("my-custom-genre"));
    // `resolveTrackInsert` is the role layer's own answer, which always carries every field; the authored literal
    // leaves the optional ones out.
    expect(engine.getTrackInsert(1)).toEqual(resolveTrackInsert("chords"));
    engine.destroy();
  });
});

describe("genre insert · every call site passes the genre through", () => {
  /**
   * The two engines plus the two UI paths that expose the default chain. `resolveTrackInsert(`
   * (the role-only function) must not appear: its presence means a call site silently dropped
   * the genre argument.
   */
  const CALLERS = [
    "audio/AudioEngine.ts",
    "audio/WavExporter.ts",
    "views/StudioView.tsx",
    "features/sequencer/useSequencerStore.ts",
  ] as const;

  it.each(CALLERS)("%s resolves through resolveTrackInsertForGenre", (file) => {
    const source = read(file);
    expect(source).toContain("resolveTrackInsertForGenre(");
    expect(source).not.toContain("resolveTrackInsert(");
  });

  it("the two engines read the genre from the pattern they are rendering", () => {
    // The offline renderer takes its genre from the pattern argument; the realtime engine
    // from its current pattern. Asserting the expression (not just the import) is what makes
    // this a wiring check rather than an import check.
    expect(read("audio/WavExporter.ts")).toContain("resolveTrackInsertForGenre(");
    expect(read("audio/WavExporter.ts")).toMatch(/pattern\.genre_id/);
    expect(read("audio/AudioEngine.ts")).toMatch(/this\.pattern\?\.genre_id/);
  });
});
