import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { createArrangementFromTemplate } from "../data/arrangementEdits";
import { GENRES_MAP } from "../data/genres";
import { patternFromGenre } from "../data/genreMix";
import { arrangementSeededFromGenre, projectSongToV2 } from "../data/arrangementProjection";
import type { ArrangementV2 } from "../types/arrangementV2";
import { LanguageProvider } from "../i18n/LanguageContext";

/**
 * The provider is now explicit, and the language is pinned.
 *
 * These criteria address controls by their **accessible name**, and a name is the point: the toolbar's play button
 * used to be a literal `Play`, and it is now the dictionary's word for it. Rendering without a provider silently took
 * the context's Chinese fallback — which is a real behaviour of `useLanguage`, not a quirk of the test — so the file
 * says which language it is judging rather than inheriting one from whatever rendered last. This is a change to how
 * the criteria are set up, not to what they claim.
 */
const renderView = (ui: React.ReactElement) => {
  localStorage.setItem("groove_language", "en");
  return render(<LanguageProvider>{ui}</LanguageProvider>);
};

/**
 * The view's own responsibility is narrow — **which arrangement is on screen** — so what is checked is that the blocks act on one shared value rather than each holding its own.
 *
 * A view that let them diverge would produce the bug this whole arrangement has been avoiding: a track list showing one thing and a take selector describing another.
 */
const noCapture = () => new Promise<never>(() => undefined);

describe("ArrangementViewV2", () => {
  it("shows a track added through the list, in the same arrangement the picker reads", () => {
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} />);
    // ⭐ A new project starts by choosing what it is (Logic's Choose a Project), so every criterion goes through Create first.
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // Two add buttons now share the name: the header column's and the step list's. The library this criterion is
    // about is reached from either, so the added track — and what both readings of the arrangement show — is the
    // same either way.
    fireEvent.click(screen.getAllByRole("button", { name: "+ Sampler" })[0]!);
    // One arrangement behind both: if the blocks held their own copies, the picker would still be empty here.
    expect(screen.getByTestId("arrangement-track-picker").textContent).toContain("sampler");
  });

  it("says nothing is selected rather than showing an empty panel", () => {
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} />);
    // ⭐ A new project starts by choosing what it is (Logic's Choose a Project), so every criterion goes through Create first.
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // An empty panel reads as broken; a sentence reads as a state.
    expect(screen.getByTestId("arrangement-detail").textContent).toMatch(/Select a track/);
  });

  it("drops the selection when the selected track is removed, so the take selector cannot describe a track that is gone", () => {
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} />);
    // ⭐ A new project starts by choosing what it is (Logic's Choose a Project), so every criterion goes through Create first.
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // Two add buttons now share the name: the header column's and the step list's. The library this criterion is
    // about is reached from either, so the added track — and what both readings of the arrangement show — is the
    // same either way.
    fireEvent.click(screen.getAllByRole("button", { name: "+ Sampler" })[0]!);
    // Adding selects the new track, so the take selector is showing — and removing *it* must clear the selection, leaving the default track behind.
    expect(screen.getByTestId("take-selector-v2")).toBeDefined();
    // ⭐ The **last** one: a new arrangement now starts with a default track (the owner's requirement), so the added track is not the first row. Removing the first would test removing the default instead.
    const removers = screen.getAllByRole("button", { name: "×" });
    fireEvent.click(removers[removers.length - 1]!);
    expect(screen.getByTestId("arrangement-detail").textContent).toMatch(/Select a track/);
  });
});

describe("the play button and the engine seam", () => {
  const chooserThrough = () => {
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} />);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
  };

  it("is disabled and says why when no engine is connected, rather than looking broken", () => {
    chooserThrough();
    const play = screen.getByRole("button", { name: /Play/ }) as HTMLButtonElement;
    // ⭐ The interface work and the audio wiring are separate changes on purpose; the button must not pretend.
    expect(play.disabled).toBe(true);
    expect(screen.getByTestId("arrangement-transport").textContent).toMatch(/not connected yet/);
  });

  it("hands the arrangement to the injected engine and reports what it planned, including zero", async () => {
    const play = vi.fn(async () => ({ planned: 0 }));
    /**
     * ⭐ `pause` is part of the seam rather than an extra: the button is labelled Pause while the transport runs, so a
     * player that could not pause is a player that would have to lie about that press.
     */
    renderView(<ArrangementViewV2 songId="s" capture={noCapture} player={{ play, pause: vi.fn(() => 0) }} />);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    // Zero is shown, not hidden: "nothing was planned" is a fact a user should see rather than a silent no-op.
    await screen.findByTestId("arrangement-played");
    expect(screen.getByTestId("arrangement-played").textContent).toMatch(/planned 0/);
  });
});

/**
 * ⭐ **"Nothing is persisted" was the whole finding, so these are the criteria for the two halves of the fix at the
 * view's own seam**: a stored project opens straight into the arrangement instead of asking again, and every change is
 * reported to whoever is storing it.
 *
 * The view still owns no storage — that is why these can be judged without IndexedDB at all, which is also what keeps
 * the seam honest: a report that needed a database to observe would be a write, not a report.
 */
describe("the arrangement a host hands in, and what the host is told", () => {
  it("⭐ opens straight into the arrangement when a project is handed in, with no chooser over it", () => {
    const stored = createArrangementFromTemplate("new", "drums-bass");
    renderView(<ArrangementViewV2 songId="new" capture={noCapture} initialArrangement={stored} />);
    // The chooser's Create button is the thing that must not be there: a refresh that asks "what kind of project?"
    // over work that is being restored is the same loss as dropping it, only with an extra click.
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
    expect(screen.getByTestId("arrangement-view-v2")).toBeDefined();
    // The restored tracks are on screen, by name — the count is not the only thing that has to come back.
    expect(screen.getByTestId("arrangement-track-picker").textContent).toContain("Drums");
    expect(screen.getByTestId("arrangement-track-picker").textContent).toContain("Bass");
  });

  it("⭐ reports the arrangement it holds, including the first one, so a restored project is stored again rather than only read", () => {
    const stored = createArrangementFromTemplate("new", "drums-bass");
    const onArrangementChange = vi.fn();
    renderView(<ArrangementViewV2 songId="new" capture={noCapture} initialArrangement={stored} onArrangementChange={onArrangementChange} />);
    expect(onArrangementChange).toHaveBeenCalledWith(stored);

    // And it reports the next value too — an edit is what the store's debounce exists for.
    const before = onArrangementChange.mock.calls.length;
    fireEvent.click(screen.getAllByRole("button", { name: "+ Sampler" })[0]!);
    expect(onArrangementChange.mock.calls.length).toBeGreaterThan(before);
    expect(onArrangementChange.mock.calls.at(-1)?.[0].tracks.length).toBe(stored.tracks.length + 1);
  });

  it("⭐ hands the panel's name to the host at Create, which is the only moment a name and an arrangement exist together", () => {
    const onCreateProject = vi.fn();
    renderView(<ArrangementViewV2 songId="new" capture={noCapture} onCreateProject={onCreateProject} />);
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Evening Tune" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // ⭐ The arrangement and the name, together: a host that received only the name would have no project to name, and
    // one that received only the arrangement would have to invent the name it was just told.
    expect(onCreateProject).toHaveBeenCalledTimes(1);
    expect(onCreateProject.mock.calls[0]![0]).toBe("Evening Tune");
    expect(onCreateProject.mock.calls[0]![1].tracks.length).toBeGreaterThan(0);
  });

  it("⭐ starts from a genre, and what it creates is the genre's music rather than a template's", () => {
    const onCreateProject = vi.fn();
    renderView(<ArrangementViewV2 songId="new" capture={noCapture} onCreateProject={onCreateProject} />);
    const genre = Object.values(GENRES_MAP)[0]!;
    // ⭐ Both controls must exist before either is pressed, so a missing one is named rather than inferred later.
    expect(screen.getByTestId(`genre-${genre.id}`)).toBeDefined();
    const create = screen.getByRole("button", { name: "Create" });
    fireEvent.click(screen.getByTestId(`genre-${genre.id}`));
    fireEvent.click(create);
    expect(onCreateProject).toHaveBeenCalledTimes(1);

    // ⭐ The genre decides the content: what the route creates must be the genre's arranged pattern, projected into an
    // arrangement — the same two steps the protocol creator uses — and not a template handed the same name. An arrangement
    // with no notes at all omits the map, so both sides are read the same way.
    const notes = (value: ArrangementV2) => Object.values(value.notesByTrack ?? {}).flat();
    const expected = projectSongToV2({ id: "new", clips: { A: patternFromGenre(genre) } });
    const arrangement = onCreateProject.mock.calls[0]![1] as ArrangementV2;
    expect(arrangement.tracks.map((track) => track.name)).toEqual(expected.tracks.map((track) => track.name));
    expect(notes(arrangement).length).toBe(notes(expected).length);
  });

  it("⭐ offers a velocity ramp and a length quantiser on the arrangement it shows", () => {
    const seeded = arrangementSeededFromGenre("new", Object.values(GENRES_MAP)[0]!);
    renderView(<ArrangementViewV2 songId="new" capture={noCapture} initialArrangement={seeded} />);
    expect(screen.getByRole("button", { name: "Ramp velocity" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Quantise lengths" })).toBeDefined();
  });

  it("⭐ a genre project arrives with the genre's notes, not only its tracks", () => {
    const seeded = arrangementSeededFromGenre("new", Object.values(GENRES_MAP)[0]!);
    // ⭐ An independent measure: the notes come from the music, not from the same helper's opinion of it.
    const notes = Object.values(seeded.notesByTrack ?? {}).flat();
    expect(seeded.tracks.length).toBeGreaterThan(0);
    expect(notes.length).toBeGreaterThan(0);
    // ⭐ And they sit where the steps did: the first note starts at the beginning rather than nowhere.
    expect(Math.min(...notes.map((note) => note.startBeats))).toBe(0);
  });

  it("⭐ ramps velocity from first to last, and puts lengths on the grid without moving a start", () => {
    const seeded = arrangementSeededFromGenre("new", Object.values(GENRES_MAP)[0]!);
    const onArrangementChange = vi.fn();
    renderView(
      <ArrangementViewV2
        songId="new"
        capture={noCapture}
        initialArrangement={seeded}
        onArrangementChange={onArrangementChange}
      />
    );

    const read = () => onArrangementChange.mock.calls.at(-1)?.[0] as ArrangementV2;
    const notesOf = (value: ArrangementV2) => Object.values(value.notesByTrack ?? {}).flat();

    fireEvent.click(screen.getByTestId("arrangement-ramp-velocity"));
    const ramped = read();
    const byStart = [...notesOf(ramped)].sort((a, b) => a.startBeats - b.startBeats);
    expect(byStart.length).toBeGreaterThan(1);
    // ⭐ The two ends are the ramp's own defaults, so the shape is measurable rather than asserted in the abstract.
    const lowest = Math.min(...byStart.map((note) => note.velocity ?? 0));
    const highest = Math.max(...byStart.map((note) => note.velocity ?? 0));
    expect(lowest).toBe(40);
    expect(highest).toBe(120);

    const startsBefore = notesOf(ramped).map((note) => note.startBeats).sort();
    fireEvent.click(screen.getByTestId("arrangement-quantize-lengths"));
    const quantised = read();
    // ⭐ Lengths land on the grid and the starts do not move: quantising is time-keeping, not re-placement.
    expect(notesOf(quantised).map((note) => note.startBeats).sort()).toEqual(startsBefore);
    for (const note of notesOf(quantised)) {
      expect(note.lengthBeats).toBeGreaterThan(0);
      expect(Math.abs(note.lengthBeats / 0.25 - Math.round(note.lengthBeats / 0.25))).toBeLessThan(1e-9);
    }
  });

  it("⭐ says why an unreadable project is not shown, instead of drawing a chooser in silence over work that still exists", () => {
    renderView(<ArrangementViewV2 songId="new" capture={noCapture} loadProblem='track "Bass" names kind "instrument", which this build does not have' />);
    const alert = screen.getByTestId("arrangement-load-problem");
    expect(alert.textContent).toContain("instrument");
  });
});

/**
 * ⭐ **The toolbar acts on what the roll has marked.**
 *
 * The mark is the roll's, the arrangement is the view's, and the button between them copies the marked notes forward by the span
 * they cover. Everything is derived from the seeded arrangement rather than assumed, so the criterion is about the gesture and
 * not about which pitches a genre happens to use.
 */
describe("copying what the roll has marked", () => {
  it("⭐ copies the marked notes by the span they cover, and leaves the originals in place", () => {
    const seeded = arrangementSeededFromGenre("new", Object.values(GENRES_MAP)[0]!);
    const track = seeded.tracks[0]!;
    const notes = seeded.notesByTrack?.[track.id] ?? [];
    const first = notes[0]!;
    const second = notes.find((note) => note.startBeats > first.startBeats)!;
    const stepOf = (beats: number) => Math.round(beats / 0.25);

    const onArrangementChange = vi.fn();
    renderView(
      <ArrangementViewV2
        songId="new"
        capture={noCapture}
        initialArrangement={seeded}
        onArrangementChange={onArrangementChange}
      />
    );
    // ⭐ The picker's rows select on a click; the header row selects on a press, which is a different gesture.
    fireEvent.click(within(screen.getByTestId("arrangement-track-picker")).getByText(track.name));

    const cell = (pitch: number, step: number) => screen.getByTestId(`roll-cell-${pitch}-${step}`);
    fireEvent.pointerDown(cell(first.pitch, stepOf(first.startBeats)));
    fireEvent.pointerEnter(cell(second.pitch, stepOf(second.startBeats)));
    fireEvent.pointerUp(cell(second.pitch, stepOf(second.startBeats)));
    fireEvent.click(screen.getByTestId("arrangement-copy-selection"));

    const after = onArrangementChange.mock.calls.at(-1)?.[0] as ArrangementV2;
    const landed = after.notesByTrack?.[track.id] ?? [];
    const delta = second.startBeats - first.startBeats;
    // ⭐ The originals are still there, and each has a copy exactly one span later.
    expect(landed.some((note) => note.pitch === first.pitch && note.startBeats === first.startBeats)).toBe(true);
    expect(landed.some((note) => note.pitch === first.pitch && note.startBeats === first.startBeats + delta)).toBe(true);
  });
});

/**
 * ⭐ **Legato, from the toolbar, on what the roll has marked.**
 *
 * The model's rule reaches the next sounding note or the loop's end; the button hands it the marks and commits one command. The
 * criterion measures the distance the music actually has rather than repeating the formula.
 */
describe("making the marked notes reach", () => {
  it("⭐ stretches the earlier marked note to where the next one starts", () => {
    const seeded = arrangementSeededFromGenre("new", Object.values(GENRES_MAP)[0]!);
    const track = seeded.tracks[0]!;
    const notes = seeded.notesByTrack?.[track.id] ?? [];
    const first = notes[0]!;
    const second = notes.find((note) => note.startBeats > first.startBeats)!;
    const stepOf = (beats: number) => Math.round(beats / 0.25);

    const onArrangementChange = vi.fn();
    renderView(
      <ArrangementViewV2 songId="new" capture={noCapture} initialArrangement={seeded} onArrangementChange={onArrangementChange} />
    );
    fireEvent.click(within(screen.getByTestId("arrangement-track-picker")).getByText(track.name));
    const cell = (pitch: number, step: number) => screen.getByTestId(`roll-cell-${pitch}-${step}`);
    fireEvent.pointerDown(cell(first.pitch, stepOf(first.startBeats)));
    fireEvent.pointerEnter(cell(second.pitch, stepOf(second.startBeats)));
    fireEvent.pointerUp(cell(second.pitch, stepOf(second.startBeats)));
    fireEvent.click(screen.getByTestId("arrangement-legato-selection"));

    const after = onArrangementChange.mock.calls.at(-1)?.[0] as ArrangementV2;
    const landed = after.notesByTrack?.[track.id] ?? [];
    const stretched = landed.find((note) => note.pitch === first.pitch && note.startBeats === first.startBeats)!;
    // ⭐ The earlier note now holds until the later one begins, and no note was added or lost by the gesture.
    expect(stretched.lengthBeats).toBeCloseTo(second.startBeats - first.startBeats, 6);
    expect(landed.length).toBe(notes.length);
  });
});

/**
 * ⭐ **Arpeggio, from the toolbar.** The claim is the one the gesture makes — a chord that sounded together no longer does —
 * rather than a copy of the roll's internal marks, which the criterion cannot see and should not have to.
 */
describe("arpeggiating the marks", () => {
  it("⭐ takes a marked chord apart in time", () => {
    const seeded = arrangementSeededFromGenre("new", Object.values(GENRES_MAP)[0]!);
    const track = seeded.tracks.find((candidate) =>
      (seeded.notesByTrack?.[candidate.id] ?? []).some(
        (note, _index, all) => all.filter((other) => other.startBeats === note.startBeats).length > 1
      )
    )!;
    expect(track, "no track in this genre holds a chord — the criterion needs one").toBeDefined();
    const notes = seeded.notesByTrack?.[track.id] ?? [];
    const chordStart = notes.find((note) => notes.filter((other) => other.startBeats === note.startBeats).length > 1)!.startBeats;
    const chord = notes.filter((note) => note.startBeats === chordStart);
    const later = notes.find((note) => note.startBeats > chordStart)!;
    const stepOf = (beats: number) => Math.round(beats / 0.25);

    const onArrangementChange = vi.fn();
    renderView(
      <ArrangementViewV2 songId="new" capture={noCapture} initialArrangement={seeded} onArrangementChange={onArrangementChange} />
    );
    fireEvent.click(within(screen.getByTestId("arrangement-track-picker")).getByText(track.name));
    const cell = (pitch: number, step: number) => screen.getByTestId(`roll-cell-${pitch}-${step}`);
    fireEvent.pointerDown(cell(chord[0]!.pitch, stepOf(chordStart)));
    fireEvent.pointerEnter(cell(later.pitch, stepOf(later.startBeats)));
    fireEvent.pointerUp(cell(later.pitch, stepOf(later.startBeats)));
    fireEvent.click(screen.getByTestId("arrangement-arpeggiate-selection"));

    const after = onArrangementChange.mock.calls.at(-1)?.[0] as ArrangementV2;
    const landed = after.notesByTrack?.[track.id] ?? [];
    // ⭐ At least one of the chord's pitches has left the start it sounded on: the chord is no longer a chord there.
    const atChordStart = landed.filter(
      (note) => note.startBeats === chordStart && chord.some((member) => member.pitch === note.pitch)
    );
    expect(atChordStart.length).toBeLessThan(chord.length);
    // ⭐ And nothing was lost: the track still holds every note it began with.
    expect(landed.length).toBe(notes.length);
  });
});
