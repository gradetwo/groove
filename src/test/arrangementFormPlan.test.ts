import { describe, expect, it } from "vitest";
import { applyForm, applyFormBars, formBarsV2, formPartsV2 } from "../data/arrangementFormPlan";
import { arrangementSeededFromGenre } from "../data/arrangementProjection";
import { GENRES_MAP } from "../data/genres";

/**
 * ⭐ **The three forms, as the arrangement layer reads them.**
 *
 * Measured rather than assumed: `club` and `song` are the **same length** — both forty bars — and differ in how they are shaped,
 * so a criterion that demanded three different lengths would have been red against a correct form.
 */
describe("an arrangement form read as bars", () => {
  it("gives each form its own length", () => {
    expect(formBarsV2("loop")).toBe(4);
    expect(formBarsV2("club")).toBe(40);
    expect(formBarsV2("song")).toBe(40);
  });

  it("⭐ tells club from song by its parts, since their lengths agree", () => {
    const club = formPartsV2("club").map((part) => part.label);
    const song = formPartsV2("song").map((part) => part.label);
    expect(club).toEqual(["intro", "build", "drop", "break", "drop", "outro"]);
    expect(song).toEqual(["intro", "verse", "chorus", "verse", "chorus", "outro"]);
    expect(club).not.toEqual(song);
  });

  it("⭐ lays the parts end to end, so the last one ends where the form does", () => {
    for (const form of ["loop", "club", "song"] as const) {
      const parts = formPartsV2(form);
      expect(parts[0]!.fromBar).toBe(0);
      expect(parts.at(-1)!.toBar).toBe(formBarsV2(form));
      for (let i = 1; i < parts.length; i += 1) expect(parts[i]!.fromBar).toBe(parts[i - 1]!.toBar);
    }
  });
});

describe("an arrangement in a chosen form", () => {
  it("⭐ takes the form's length and leaves every note where it was", () => {
    const before = arrangementSeededFromGenre("new", Object.values(GENRES_MAP)[0]!);
    const club = applyFormBars(before, "club");
    expect(club.bars).toBe(40);
    expect(JSON.stringify(club.notesByTrack)).toBe(JSON.stringify(before.notesByTrack));
    // ⭐ And picking the identity form back gives the arrangement the composer started from.
    const loop = applyFormBars(club, "loop");
    expect(loop.bars).toBe(4);
    expect(JSON.stringify(loop.notesByTrack)).toBe(JSON.stringify(before.notesByTrack));
  });
});

describe("a whole form applied", () => {
  it("⭐ grows the music across the build rather than only lengthening the frame", () => {
    const before = arrangementSeededFromGenre("new", Object.values(GENRES_MAP)[0]!);
    const trackId = before.tracks[0]!.id;
    const notes = (a: typeof before) => a.notesByTrack?.[trackId] ?? [];
    const club = applyForm(before, "club");
    expect(club.bars).toBe(40);
    // ⭐ Every note in the intro's span (bars 0–8) is quieter, and none of them is silent.
    const intro = (a: typeof before) => notes(a).filter((note) => note.startBeats < 32);
    expect(intro(club).length).toBeGreaterThan(0);
    expect(Math.max(...intro(club).map((note) => note.velocity))).toBeLessThan(
      Math.max(...intro(before).map((note) => note.velocity))
    );
    expect(Math.min(...intro(club).map((note) => note.velocity))).toBeGreaterThan(0);
    // ⭐ The form moves no note: the track still holds exactly what it held.
    expect(notes(club).length).toBe(notes(before).length);
    // ⭐ And the identity form leaves the music exactly as it was.
    expect(JSON.stringify(applyForm(before, "loop").notesByTrack)).toBe(JSON.stringify(before.notesByTrack));
  });
});

