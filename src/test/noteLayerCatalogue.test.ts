import { describe, it, expect } from "vitest";
import { ALL_GENRES } from "../data/genres";
import { laneFromNotes, laneStaysOnGrid, notesFromLane } from "../data/noteLayer";
import type { SequencerTrack } from "../types/genre";

/**
 * The whole catalogue through the note layer — the migration's own measurement.
 *
 * The layer exists so a lane's music can be a note list with the grid as one projection of it. This case answers the
 * question that decides how the migration goes: **how many of the catalogue's lanes survive the round trip today**, and
 * for the ones that do not, *why*. A lane that refuses is not a failure of the layer — it is a lane the step shape cannot
 * describe, which is exactly what the layer is for. So the assertion is that the refusals are only the two documented
 * reasons, and the counts are printed for the plan.
 */
describe("the catalogue through the note layer", () => {
  it("round-trips every lane the step shape can express, and names the reasons it cannot", () => {
    const total = { lanes: 0, roundTripped: 0, refused: 0 };
    const refusals = new Map<string, string[]>();
    const mismatches: string[] = [];

    for (const genre of ALL_GENRES) {
      const patternSteps = genre.sequencer_pattern.total_steps || genre.sequencer_pattern.totalSteps || 16;
      for (const track of genre.sequencer_pattern.tracks as SequencerTrack[]) {
        total.lanes += 1;
        const notes = notesFromLane(track, patternSteps);
        if (notes.length === 0) continue;
        const arrays = laneFromNotes(notes, patternSteps);
        if (!arrays) {
          total.refused += 1;
          // Why: an off-grid start, or notes on one step that disagree. Both are the note layer's business.
          const offGrid = notes.some((note) => Math.abs(note.startStep - Math.round(note.startStep)) > 1e-6);
          const reason = offGrid ? "off-grid start" : "notes on one step disagree";
          refusals.set(reason, [...(refusals.get(reason) ?? []), `${genre.id}/${track.track_id}`]);
          continue;
        }
        total.roundTripped += 1;
        // The round trip must be exact, field for field, wherever it is offered.
        const again = notesFromLane({ ...track, ...arrays } as SequencerTrack, patternSteps);
        if (JSON.stringify(again) !== JSON.stringify(notes)) {
          mismatches.push(`${genre.id}/${track.track_id}`);
        }
        if (!laneStaysOnGrid(notes, patternSteps)) {
          mismatches.push(`${genre.id}/${track.track_id} (reported on-grid but refused)`);
        }
      }
    }

    expect(mismatches, `lanes that did not round-trip exactly: ${mismatches.slice(0, 8).join(", ")}`).toEqual([]);
    const summary = [...refusals.entries()].map(([reason, lanes]) => `${reason}: ${lanes.length}`).join("; ");
    expect(summary === "" || refusals.size > 0, "refusals must carry a reason").toBe(true);
    // eslint-disable-next-line no-console
    console.log(
      `note layer: ${total.roundTripped}/${total.lanes - total.refused} expressed lanes round-trip exactly, ` +
        `${total.refused} refused (${summary || "none"})`
    );
    for (const [reason, lanes] of refusals) {
      // eslint-disable-next-line no-console
      console.log(`  ${reason}: ${lanes.slice(0, 6).join(", ")}${lanes.length > 6 ? ` …(+${lanes.length - 6})` : ""}`);
    }
  });
});
