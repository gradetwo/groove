import { describe, expect, it } from "vitest";
import { buildArrangementPackage, validateArrangementPackage } from "../features/sequencer/arrangementPackage";
import { createArrangement } from "../data/arrangementEdits";

/**
 * ⭐ **The door checks the values, not only the shape** (third evaluation, F06).
 *
 * The evaluation imported a `.groove` carrying invalid notes and an invalid tempo and the app accepted it — one track,
 * 129 bars — so the mistake surfaced later, as silence or as a bar count nothing could explain. Shape checks alone
 * cannot catch that: the file *is* a v2 package, it just says things the model cannot hold.
 */
const withArrangement = (mutate: (arrangement: ReturnType<typeof createArrangement>) => void) => {
  const arrangement = createArrangement("fixture", "synth");
  mutate(arrangement);
  return buildArrangementPackage(arrangement);
};

describe("an arrangement package's values", () => {
  it("⭐ refuses a note outside MIDI, a zero velocity, a bad start, a bad length, a bad bar count and a bad tempo", () => {
    const trackId = createArrangement("ids", "synth").tracks[0]!.id;
    const note = { pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 };
    const cases: Array<[string, RegExp]> = [
      ["pitch 128", /pitch 128/],
      ["velocity 0", /velocity 0/],
      ["start −1", /starting at -1/],
      ["length 0", /0 beats long/],
    ];
    for (const [label, expected] of cases) {
      const broken = { ...note };
      if (label.startsWith("pitch")) broken.pitch = 128;
      if (label.startsWith("velocity")) broken.velocity = 0;
      if (label.startsWith("start")) broken.startBeats = -1;
      if (label.startsWith("length")) broken.lengthBeats = 0;
      const pkg = withArrangement((arrangement) => {
        arrangement.notesByTrack = { [trackId]: [broken] };
      });
      expect(() => validateArrangementPackage(pkg), label).toThrow(expected);
    }
    expect(() => validateArrangementPackage(withArrangement((a) => { a.bars = 129.5; }))).toThrow(/bars is 129\.5/);
    expect(() => validateArrangementPackage(withArrangement((a) => { a.bpm = -20; }))).toThrow(/bpm is -20/);
  });

  it("⭐ and still accepts what a valid arrangement produces", () => {
    const arrangement = createArrangement("valid", "synth");
    arrangement.bpm = 96;
    arrangement.bars = 8;
    const trackId = arrangement.tracks[0]!.id;
    arrangement.notesByTrack = { [trackId]: [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }] };
    expect(() => validateArrangementPackage(buildArrangementPackage(arrangement))).not.toThrow();
  });
});
