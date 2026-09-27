import { describe, expect, it } from "vitest";
import { applyPatternOps } from "../../mcp/pattern";

/**
 * Decision 1A's addressing rule, held to the two things it has to be true of the same time: a second lane of a kind is reachable **by name**, and everything
 * that names the kind keeps meaning exactly what it meant.
 *
 * `track_id` is a **role** — drums route by it, GS-1 hosts by it, the exporter names by it — so widening it was never an option; a lane that carries no
 * `laneId` must behave as if the field did not exist.
 */
const lane = (track_id: string, extra: Record<string, unknown> = {}) => ({
  track_id,
  name: track_id,
  instrument: "synth",
  steps: new Array(16).fill(0),
  velocity: new Array(16).fill(100),
  ...extra,
});

const patternWithTwoLeads = () =>
  ({
    genre_id: "custom",
    bpm: 120,
    scale: "C major",
    totalSteps: 16,
    tracks: [lane("kick"), lane("lead", { laneId: "lead-1" }), lane("lead", { laneId: "lead-2" })],
  }) as never;

const patternWithoutLaneIds = () =>
  ({
    genre_id: "custom",
    bpm: 120,
    scale: "C major",
    totalSteps: 16,
    tracks: [lane("kick"), lane("lead")],
  }) as never;

describe("laneId addressing", () => {
  it("reaches a lane by its own name, so a second lead is addressable at all", () => {
    const { pattern, applied } = applyPatternOps(patternWithTwoLeads(), [{ op: "set_step", track: "lead-2", step: 3 }]);
    expect(applied[0]?.ok, JSON.stringify(applied[0])).toBe(true);
    const leads = pattern.tracks.filter((track) => track.track_id === "lead");
    expect(leads).toHaveLength(2);
    // Only the named lane changed: `lead-1` is untouched, which is the whole reason for the second name.
    expect(Array.from(leads[0]!.steps).filter(Boolean)).toHaveLength(0);
    expect(leads[1]!.steps[3]).toBe(1);
  });

  it("still means the first lane of a kind when the kind is what is named", () => {
    const { pattern, applied } = applyPatternOps(patternWithTwoLeads(), [{ op: "set_step", track: "lead", step: 5 }]);
    expect(applied[0]?.ok).toBe(true);
    const leads = pattern.tracks.filter((track) => track.track_id === "lead");
    expect(leads[0]!.steps[5]).toBe(1);
    expect(leads[1]!.steps[5]).toBe(0);
  });

  it("changes nothing about a pattern that has no laneId at all", () => {
    const before = patternWithoutLaneIds();
    const { pattern, applied } = applyPatternOps(before, [{ op: "set_step", track: "lead", step: 2 }]);
    expect(applied[0]?.ok).toBe(true);
    expect(pattern.tracks[1]!.steps[2]).toBe(1);
    // And the op does not invent the field: the output has no `laneId` key anywhere.
    expect(JSON.stringify(pattern)).not.toContain("laneId");
  });

  it("does not let a lane name shadow a kind that a pattern does not have", () => {
    // A name that is not a lane and not a kind is still an error, so a typo cannot silently no-op.
    const { applied } = applyPatternOps(patternWithoutLaneIds(), [{ op: "set_step", track: "lead-2", step: 1 }]);
    expect(applied[0]?.ok).toBe(false);
  });
});
