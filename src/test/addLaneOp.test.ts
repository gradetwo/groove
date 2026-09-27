import { describe, expect, it } from "vitest";
import { applyPatternOps, validatePattern } from "../../mcp/pattern";

/**
 * `add_lane` — owner decision 1A made usable: the model could express a second lane of a kind, and no op could create one.
 *
 * The criteria, written before the op, are the ones the decision record asked for: an existing pattern is untouched, the new lane is reachable by its own name,
 * `validatePattern` accepts the result, two lanes of a kind keep **distinct names** (the exporter names by `name`), and a name or id that already exists is
 * refused rather than silently duplicated.
 */
const lane = (track_id: string, name: string, extra: Record<string, unknown> = {}) => ({
  track_id,
  name,
  instrument: "synth",
  steps: Array.from({ length: 16 }, (_, index) => (index === 0 ? 1 : 0)),
  velocity: new Array(16).fill(100),
  ...extra,
});

const pattern = () =>
  ({
    genre_id: "custom",
    bpm: 120,
    scale: "C major",
    totalSteps: 16,
    tracks: [lane("kick", "Kick"), lane("lead", "Lead")],
  });

interface TestLane {
  track_id: string;
  name: string;
  laneId?: string;
  steps: number[];
  pitch?: number[];
}

/** Accepts either a pattern or an op result, so no call site needs a cast that the compiler then mistrusts. */
const leads = (value: unknown): TestLane[] => {
  const wrapped = value as { pattern?: { tracks?: TestLane[] }; tracks?: TestLane[] };
  const tracks = wrapped.pattern?.tracks ?? wrapped.tracks ?? [];
  return tracks.filter((track) => track.track_id === "lead");
};

describe("add_lane", () => {
  it("adds a second lane of a kind, with its own id and a distinct name, and leaves the first alone", () => {
    const { pattern: next, applied } = applyPatternOps(pattern() as never, [{ op: "add_lane", track: "lead" }]);
    expect(applied[0]?.ok, JSON.stringify(applied[0])).toBe(true);
    const both = leads(next);
    expect(both).toHaveLength(2);
    expect(both.map((track) => track.laneId)).toEqual([undefined, "lead-2"]);
    expect(both.map((track) => track.name)).toEqual(["Lead", "Lead 2"]);
    // The lane that was already there is untouched, note for note.
    expect(both[0]!.steps).toEqual(pattern().tracks[1]!.steps);
  });

  it("makes the new lane reachable by its own name, and keeps the kind meaning the first one", () => {
    const added = applyPatternOps(pattern() as never, [{ op: "add_lane", track: "lead", laneId: "counter" }]).pattern;
    const named = applyPatternOps(added, [{ op: "set_step", track: "counter", step: 5 }]);
    expect(named.applied[0]?.ok).toBe(true);
    expect(leads(named).find((track) => track.laneId === "counter")!.steps[5]).toBe(1);
    expect(leads(named).find((track) => track.name === "Lead")!.steps[5]).toBe(0);
  });

  it("copies a lane when asked, so a counter-melody can start from the melody it answers", () => {
    const source = { ...pattern(), tracks: [lane("kick", "Kick"), lane("lead", "Lead", { pitch: new Array(16).fill(67) })] };
    const { pattern: next } = applyPatternOps(source as never, [{ op: "add_lane", track: "lead", from: "Lead", laneId: "answer", name: "Answer" }]);
    const answer = leads(next).find((track) => track.laneId === "answer")!;
    expect(answer.name).toBe("Answer");
    expect(answer.pitch).toEqual(new Array(16).fill(67));
    // A copy, not a second reference: editing one cannot move the other.
    expect(answer.steps).not.toBe(source.tracks[1]!.steps);
  });

  it("keeps the result valid for validatePattern, which is the gate every result passes", () => {
    const { pattern: next } = applyPatternOps(pattern() as never, [{ op: "add_lane", track: "lead", laneId: "lead-2", name: "Counter" }]);
    expect(validatePattern(next as never).problems).toEqual([]);
  });

  it("refuses an id or a name that already exists, and an unknown kind", () => {
    const base = pattern();
    for (const op of [
      { op: "add_lane", track: "lead", laneId: "lead" },
      { op: "add_lane", track: "lead", name: "Kick" },
      { op: "add_lane", track: "trombone" },
      { op: "add_lane", track: "lead", from: "nope" },
    ] as const) {
      const result = applyPatternOps(base as never, [op as never]);
      expect(result.applied[0]?.ok, JSON.stringify(op)).toBe(false);
      // Nothing was appended: a refused op is not a partial edit.
      expect(result.pattern.tracks).toHaveLength(base.tracks.length);
    }
  });

  it("leaves a pattern untouched when it is not asked to add anything", () => {
    const base = pattern();
    const { pattern: next } = applyPatternOps(base as never, [{ op: "set_step", track: "kick", step: 3 }]);
    expect(next.tracks).toHaveLength(base.tracks.length);
    expect(JSON.stringify(next).includes("laneId")).toBe(false);
  });
});
