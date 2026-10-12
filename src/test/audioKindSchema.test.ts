import { describe, expect, it } from "vitest";
import { ALL_GENRES } from "../data/genres";
import { validateGenre } from "../data/schema";

/**
 * The ninth kind — `audio` — versus the `.groove`/genre schema, which used to demand **exactly eight** tracks.
 *
 * That count was a proxy for "all eight roles are present", and the role loop checks that directly; the exact number therefore only ever forbade **extra**
 * lanes. The criteria here pin both sides, because "at least eight" would be a weakening if it let a missing role through:
 *
 *   · eight → valid; nine with an `audio` lane → **valid**; a second lane of a kind → valid;
 *   · seven → invalid; nine **missing a role** → invalid, so the floor still bites;
 *   · and a genre without an audio lane validates **exactly** as before, which is what additive means here.
 */
const clone = () => JSON.parse(JSON.stringify(ALL_GENRES[0]));
const lane = (track_id: string) => ({
  track_id,
  name: track_id,
  instrument: "synth",
  steps: new Array(16).fill(0),
  velocity: new Array(16).fill(100),
});

describe("the audio kind and the genre schema", () => {
  it("accepts a genre that carries no audio lane, unchanged", () => {
    const result = validateGenre(clone());
    expect(result.errors).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it("accepts an audio lane as a ninth track — the decision this exists for", () => {
    const genre = clone();
    genre.sequencer_pattern.tracks.push(lane("audio"));
    const result = validateGenre(genre);
    expect(result.errors, JSON.stringify(result.errors)).toEqual([]);
    expect(result.isValid).toBe(true);
  });

  it("accepts a second lane of a kind, which the old count also forbade", () => {
    const genre = clone();
    genre.sequencer_pattern.tracks.push({ ...lane("lead"), laneId: "lead-2", name: "Lead 2" });
    expect(validateGenre(genre).isValid).toBe(true);
  });

  it("still refuses a genre that is missing a role, so 'at least' did not weaken the floor", () => {
    const genre = clone();
    genre.sequencer_pattern.tracks = genre.sequencer_pattern.tracks.filter((track: { track_id: string }) => track.track_id !== "lead");
    genre.sequencer_pattern.tracks.push(lane("audio")); // nine tracks, still missing the lead
    const result = validateGenre(genre);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((error) => error.includes("lead"))).toBe(true);
  });

  it("refuses a genre with fewer than eight tracks", () => {
    const genre = clone();
    genre.sequencer_pattern.tracks = genre.sequencer_pattern.tracks.slice(0, 7);
    const result = validateGenre(genre);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((error) => error.includes("at least the 8 roles"))).toBe(true);
  });
});
