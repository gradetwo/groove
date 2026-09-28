import { describe, expect, it } from "vitest";
import { lanesWithoutMidi } from "../../mcp/pattern";

/**
 * The exporter rule for a lane with no notes (owner decision 2026-09-28).
 *
 * A MIDI renderer schedules notes, and an audio lane has none, so it is skipped — and the rule is that skipping must never be **silent**. What this file can
 * prove without a browser is which lanes are reported; that they really produce no notes (rather than falling through to a default voice) is a claim for the
 * audio scope.
 */
const lane = (track_id: string, extra: Record<string, unknown> = {}) => ({
  track_id,
  name: track_id,
  instrument: "synth",
  steps: new Array(16).fill(0),
  velocity: new Array(16).fill(100),
  ...extra,
});

const pattern = (tracks: Array<Record<string, unknown>>) =>
  ({ genre_id: "custom", bpm: 120, scale: "C major", totalSteps: 16, tracks }) as never;

describe("lanes a MIDI render cannot play", () => {
  it("reports nothing for a song without an audio lane, which is the additive promise", () => {
    expect(lanesWithoutMidi(pattern([lane("kick"), lane("lead")]))).toEqual([]);
    expect(
      lanesWithoutMidi(pattern([lane("kick", { laneId: "kick-2" }), lane("lead", { laneId: "lead-2", name: "Lead 2" })]))
    ).toEqual([]);
  });

  it("names an audio lane and says why it is skipped", () => {
    const reported = lanesWithoutMidi(pattern([lane("kick"), lane("audio", { laneId: "riser", name: "Riser" })]));
    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatchObject({ track_id: "audio", laneId: "riser", name: "Riser" });
    expect(reported[0]!.reason).toMatch(/no notes to schedule/);
  });

  it("reports every audio lane, including a second one of the kind", () => {
    const reported = lanesWithoutMidi(
      pattern([lane("audio", { laneId: "a", name: "A" }), lane("kick"), lane("audio", { laneId: "b", name: "B" })])
    );
    expect(reported.map((entry) => entry.laneId)).toEqual(["a", "b"]);
    // And a lane with no laneId still reports, so the message can name it by its kind and name.
    expect(lanesWithoutMidi(pattern([lane("audio", { name: "Lone" })]))[0]).toMatchObject({ track_id: "audio", name: "Lone" });
  });
});
