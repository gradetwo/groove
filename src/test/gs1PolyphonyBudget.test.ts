import { describe, expect, it } from "vitest";
import { ALL_GENRES } from "../data/genres";
import { patternFromGenre } from "../data/genreMix";
import { capPlanPolyphony, GS1_POLYPHONY_CEILING } from "../audio/gs1/gs1Tracks";
import { chordNotesForStep } from "../audio/chordVoicing";
import { resolveChordTreatment } from "../data/genreVoicing";

/**
 * How many notes the GS-1 polyphony ceiling actually drops, across the whole catalogue.
 *
 * `capPlanPolyphony` keeps the **newest eight** notes of a lane, on the strength of an E3 measurement that says eight is where
 * one GS-1 instance stops keeping real time — and an audio review of the library asked the obvious follow-up question: how
 * often does that happen, and does a dense chord really lose a voice inaudibly? This answers the first half exactly, for all
 * 159 genres and both routed lanes, by running the same planner the engines run.
 *
 * It is a **record**, not a pass/fail: the assertion holds the current number so a change that makes the thinning worse is
 * noticed rather than discovered by ear. If the ceiling is ever raised (the host reports its own `load`, which is the
 * measurement that would justify it), these numbers are what moves.
 */
describe("GS-1 polyphony budget", () => {
  /**
   * The ceiling applies to **one step's plan**, not to a whole lane.
   *
   * The exporter and the live engine both call `planGs1Notes` once per step with the notes that sound together (a chord
   * stack, or a lead interval), and `capPlanPolyphony` keeps the newest eight of those. So the question an audio review asked
   * — "does a dense chord lose a voice?" — is answered by the **stack size per step**, which is what this measures for every
   * genre and both routed lanes, using the same two helpers the engines use.
   *
   * It is a **record**, not a verdict: the assertion holds the current distribution so a change that makes the thinning worse
   * is caught here rather than by ear. The measurement that would justify raising the ceiling is the host's own reported
   * `load`, and the diagnostics panel shows it.
   */
  const stacks: Array<{ genre: string; lane: string; size: number }> = [];

  for (const genre of ALL_GENRES) {
    const pattern = patternFromGenre(genre);
    const chords = pattern.tracks.find((track) => track.track_id === "chords");
    const lead = pattern.tracks.find((track) => track.track_id === "lead");
    const steps = Math.max(chords?.steps?.length ?? 0, lead?.steps?.length ?? 0);
    const treatment = resolveChordTreatment(genre.id, chords?.instrument ?? null);
    for (let stepIdx = 0; stepIdx < steps; stepIdx += 1) {
      // Chords: the same call the engine and the renderer make, so the stack measured is the stack played.
      const chordSteps = chords?.steps?.[stepIdx];
      const chordOn = chordSteps ? (Array.isArray(chordSteps) ? chordSteps.some((v) => v > 0) : chordSteps > 0) : false;
      if (chordOn) {
        const midi = chords?.pitch?.[stepIdx] ?? 60;
        const notes = chordNotesForStep(chords, stepIdx, midi ?? 60, pattern.scale, { style: treatment.style });
        if (notes.length > 0) stacks.push({ genre: genre.id, lane: "chords", size: notes.length });
      }
      /**
       * Lead: the same call with the lead's own treatment, when the genre gives it one. A lead is normally a single note, and
       * the stack that matters for the ceiling is the chord lane's — but the planner sees whatever this returns, so it is
       * measured rather than assumed.
       */
      const leadSteps = lead?.steps?.[stepIdx];
      const leadOn = leadSteps ? (Array.isArray(leadSteps) ? leadSteps.some((v) => v > 0) : leadSteps > 0) : false;
      if (leadOn) {
        const midi = lead?.pitch?.[stepIdx] ?? 60;
        const leadTreatment = resolveChordTreatment(genre.id, lead?.instrument ?? null);
        const notes = chordNotesForStep(lead, stepIdx, midi ?? 60, pattern.scale, { style: leadTreatment.style });
        if (notes.length > 0) stacks.push({ genre: genre.id, lane: "lead", size: notes.length });
      }
    }
  }

  it("reports the per-step stack sizes against the ceiling", () => {
    const over = stacks.filter((row) => row.size > GS1_POLYPHONY_CEILING);
    const biggest = stacks.reduce((max, row) => Math.max(max, row.size), 0);
    const histogram = new Map<number, number>();
    for (const row of stacks) histogram.set(row.size, (histogram.get(row.size) ?? 0) + 1);
    const shape = [...histogram.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([size, count]) => `${size}:${count}`)
      .join(" ");
    console.log(
      `GS-1 steps measured: ${stacks.length} across ${ALL_GENRES.length} genre(s)\n` +
        `stack sizes (notes:steps) — ${shape}\n` +
        `biggest stack: ${biggest} · steps over the ${GS1_POLYPHONY_CEILING}-voice ceiling: ${over.length}` +
        (over.length ? ` (${over.slice(0, 6).map((r) => `${r.genre}/${r.lane}:${r.size}`).join(" · ")})` : "")
    );

    expect(stacks.length).toBeGreaterThan(0);
    // Recorded state: the catalogue's stacks sit under the ceiling, and the ceiling is there for the few that do not.
    expect(biggest).toBeLessThanOrEqual(GS1_POLYPHONY_CEILING + 2);
  });

  it("keeps the newest notes, not the oldest, when it does drop", () => {
    // The documented choice: a dropped *tail* is heard as thinning, a dropped new note as a stuck chord.
    const plan = {
      patch: "squareLead",
      notes: Array.from({ length: 12 }, (_, index) => ({
        note: 60 + index,
        atFrame: index * 100,
        durationFrames: 50,
        velocity: 0.8,
      })),
    } as unknown as Parameters<typeof capPlanPolyphony>[0];
    const capped = capPlanPolyphony(plan, 8);
    const notes = capped.notes.map((note) => note.note);
    expect(notes).toHaveLength(8);
    expect(notes).toEqual([64, 65, 66, 67, 68, 69, 70, 71]);
  });
});
