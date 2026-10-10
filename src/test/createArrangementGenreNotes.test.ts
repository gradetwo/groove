import { describe, expect, it } from "vitest";
import { createMcpArrangement, getMcpArrangement } from "../../mcp/arrangement";

/**
 * ⭐ **The genre's own content, reachable on request — and only on request** (2026-10-10).
 *
 * The surface deliberately drops starter notes: two field reports describe agents receiving notes nobody wrote, and the code
 * says so. But a caller cutting a **clip** from a genre needs exactly that content, and without it the arrangement renders
 * **digital silence** — measured with `analyze_audio` on a 20.6 s render: thirteen bands at −120 dB, spectral centroid 0 Hz.
 *
 * So the fix is one explicit word rather than a changed default, and this criterion holds both halves: the default still
 * carries nothing, and the opt-in carries the genre.
 */
const notesIn = (model: ReturnType<typeof getMcpArrangement>): number =>
  Object.values(model?.notesByTrack ?? {}).reduce((total, list) => total + (list?.length ?? 0), 0);

const stepsOn = (model: ReturnType<typeof getMcpArrangement>): number =>
  (model?.tracks ?? []).reduce((total, track) => {
    const extra = track as unknown as { stepsOn?: number; steps?: number[] };
    return total + (extra.stepsOn ?? (Array.isArray(extra.steps) ? extra.steps.filter((step) => Number(step) !== 0).length : 0));
  }, 0);

describe("a genre-seeded arrangement", () => {
  it("⭐ still carries no notes by default — the decision the field reports asked for stands", () => {
    const created = createMcpArrangement({ genreId: "bossa-nova" }) as { arrangementId: string };
    const model = getMcpArrangement(created.arrangementId)!;
    expect(notesIn(model), "default: nothing nobody wrote").toBe(0);
    expect(model.tracks.length, "but its tracks exist").toBeGreaterThan(0);
  });

  it("⭐ and carries the genre's own content when the caller says so", () => {
    const created = createMcpArrangement({ genreId: "bossa-nova", withGenreNotes: true }) as { arrangementId: string };
    const model = getMcpArrangement(created.arrangementId)!;
    const notes = notesIn(model);
    const steps = stepsOn(model);
    console.log(`MEASURE withGenreNotes: notes=${notes} stepsOn=${steps} tracks=${model.tracks.length}`);
    expect(notes + steps, "the opt-in produces playable content, not silence").toBeGreaterThan(0);
  });

  it("ignores the flag without a genre, because there is no seed to keep", () => {
    const created = createMcpArrangement({ blankKind: "synth", withGenreNotes: true }) as { arrangementId: string };
    const model = getMcpArrangement(created.arrangementId)!;
    expect(notesIn(model)).toBe(0);
  });
});
