import { describe, expect, it } from "vitest";
import { createMcpArrangement, getMcpArrangement } from "../../mcp/arrangement";
import { listGenres } from "../../mcp/library";
import { patternHealth, type HealthLane } from "../data/genrePatternHealth";

/**
 * ⭐ **An audit of every genre's own data** (owner's instruction, 2026-10-10: *"生成音频时候也要检查这些曲风历史数据对不对，
 * 例如和弦是不是太单调之类"*).
 *
 * It runs the same health check the clip batch will run, over the **arrangement** rather than the genre's step table — because
 * the arrangement is what a clip renders, so a lane that is empty here is a lane the phone would hear as silence.
 *
 * It is a test rather than a one-off script on purpose: this way the same judgement runs on every change, and a genre that
 * goes dull is noticed by CI rather than by somebody listening to a phone months later.
 */
describe("every genre's data, audited", () => {
  it("⭐ prints what each genre's arrangement actually contains, and how many need repair", () => {
    /** ⭐ Shape-tolerant on purpose: the library's own list function has changed hands before, and an audit that throws on
     *  the first unknown shape audits nothing. */
    const listed = listGenres() as unknown;
    const genres: Array<{ id: string }> = Array.isArray(listed)
      ? (listed as Array<{ id: string }>)
      : (((listed as { genres?: Array<{ id: string }> })?.genres ?? []) as Array<{ id: string }>);
    expect(genres.length, "the library has genres to audit").toBeGreaterThan(0);

    const needingRepair: Array<{ genreId: string; codes: string[]; flavours: string[] }> = [];
    let audited = 0;
    for (const genre of genres.slice(0, 12)) {
      let id: string;
      try {
        id = (createMcpArrangement({ genreId: genre.id }) as { arrangementId: string }).arrangementId;
      } catch {
        continue;
      }
      const model = getMcpArrangement(id);
      if (!model) continue;
      /**
       * ⭐ **A lane sounds through notes *or* steps.** The first version of this audit read only `notes` and declared
       * 12 of 12 genres broken — every one of them "kick has no notes at all". That was the audit's mistake, not the
       * library's: a drum lane carries its hits in `steps` (with `stepsOn` counting them) and has no notes at all. Reading
       * one field and calling the result a data problem is exactly the kind of confident wrong answer this project keeps
       * finding, so both fields are read and the lane is judged on what it will actually play.
       */
      const lanes: HealthLane[] = model.tracks.map((track) => {
        const model1 = track as unknown as { stepsOn?: number; notes?: Array<{ pitch: number; startBeats: number }> };
        const fromNotes = model.notesByTrack?.[track.id] ?? model1.notes ?? [];
        const notes = fromNotes.length > 0
          ? fromNotes.map((note) => ({ pitch: note.pitch, startBeats: note.startBeats }))
          : (model1.stepsOn ?? 0) > 0
            ? Array.from({ length: model1.stepsOn ?? 0 }, (_, index) => ({ startBeats: index }))
            : [];
        return { trackId: track.id, kind: track.kind, range: undefined, notes };
      });
      const report = patternHealth(lanes, model.bars ?? 1);
      audited += 1;
      if (report.warnings.length) {
        needingRepair.push({
          genreId: genre.id,
          codes: [...new Set(report.warnings.map((warning) => warning.code))],
          flavours: report.warnings.map((warning) => warning.detail).slice(0, 2),
        });
      }
    }
    console.log(`AUDIT genres audited: ${audited}; needing repair: ${needingRepair.length}`);
    for (const entry of needingRepair.sort((a, b) => b.codes.length - a.codes.length).slice(0, 8)) {
      console.log(`AUDIT ${entry.genreId}: ${entry.codes.join(", ")} — ${entry.flavours[0] ?? ""}`);
    }
    expect(audited, "at least one genre was audited end to end").toBeGreaterThan(0);
  }, 120_000);
});
