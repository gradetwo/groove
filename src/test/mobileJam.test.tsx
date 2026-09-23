/**
 * 即兴 (the jam module, M4).
 *
 * The screen's contract: edit the groove, hear it, and put the tempo where a thumb can reach it.
 * Everything here is driven through the props the shell hands in, so the tests need no audio and no
 * engine — the two things that make an editor like this hard to test.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { MobileJamScreen } from "../mobile/screens/MobileJamScreen";
import { ALL_GENRES } from "../data/genres";
import type { SequencerPattern } from "../types/genre";

const GENRE = ALL_GENRES.find((genre) => genre.id === "deep-house") ?? ALL_GENRES[0];

const renderJam = async (
  overrides: { genreId?: string; isPlaying?: boolean; readClock?: () => { step: number; fraction: number } } = {}
) => {
  // Typed spies, kept out of the props object so the assertions can read their call arguments.
  const spies = {
    onTogglePlay: vi.fn<(genreId: string) => void>(),
    onApplyPattern: vi.fn<(pattern: SequencerPattern) => void>(),
    onTempo: vi.fn<(bpm: number) => void>(),
    onSwing: vi.fn<(swing: number) => void>(),
    onAuditionTrack: vi.fn<(trackId: string, instrument?: string) => void>(),
    onMetronome: vi.fn<(enabled: boolean) => void>(),
  };
  const props = {
    genreId: GENRE.id,
    isPlaying: false,
    readClock: () => ({ step: 4, fraction: 0 }),
    ...spies,
    ...overrides,
  };
  const utils = render(
    <LanguageProvider>
      <MobileJamScreen {...props} />
    </LanguageProvider>
  );
  /**
   * The backing genre is resolved on demand (A-01), so the editor mounts a tick after the render — the
   * screen shows a placeholder until `loadGenre` answers. Every case waits for the real grid, which is
   * also what proves the async path lands.
   */
  await screen.findByTestId("mobile-jam", {}, { timeout: 5000 });
  return { ...utils, props, spies };
};

describe("jam module", () => {
  /**
   * The 即兴 additions from the user's second pass: every instrument has its own colour, everything you
   * touch makes a sound and lights up, and the transport lives in the same dock as the tempo.
   */
  it("gives each lane and pad its own instrument colour", async () => {
    await renderJam();
    /**
     * The colour lives in a bar beside the lane word, not in the word itself.
     *
     * Painting the *label* in the instrument colour reads well on a dark ground and fails on a light one
     * (amber on paper is 1.7:1), and a light skin is a supported choice — so the identity moved to a bar
     * and the word takes the shell's ink. This asserts the bar still differs per lane.
     */
    const colours = [0, 1, 2, 3, 4, 5].map((lane) => screen.getByTestId(`mobile-jam-lane-colour-${lane}`).style.background);
    for (const colour of colours) expect(colour).not.toBe("");
    expect(new Set(colours).size, `lane colours: ${colours.join(", ")}`).toBe(6);
    // …and the labels stay legible in every skin because they inherit the shell's ink.
    for (const lane of [0, 1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(`mobile-jam-lane-label-${lane}`).className).toContain("text-[var(--m-ink-2)]");
    }

    // Every pad names the row it writes, so "the clap lights the snare row" is legible instead of surprising
    // (a true one-row-per-pad grid needs the clap/rim to be their own lanes — the drum-kit model decision).
    // Language-agnostic on purpose: the tag must equal the *row's* label, whatever the locale renders.
    for (const [pad, laneIndex] of [
      ["kick", 0],
      ["snare", 1],
      ["hat", 2],
      ["clap", 1],
      ["rim", 1],
      ["bass", 4],
    ] as const) {
      const rowLabel = screen.getByTestId(`mobile-jam-lane-label-${laneIndex}`).textContent ?? "";
      expect(screen.getByTestId(`mobile-jam-row-of-${pad}`).textContent ?? "").toBe(rowLabel);
    }

    // The six pads carry their own instrument colours on the dot and the label, so a clap never reads as
    // a snare even though both write the snare lane.
    const padDots = ["kick", "snare", "hat", "clap", "rim", "bass"].map((id) => {
      const pad = screen.getByTestId(`mobile-jam-pad-${id}`);
      return (pad.querySelector("span[aria-hidden]") as HTMLElement | null)?.style.background ?? "";
    });
    expect(padDots.every(Boolean), `pad dots: ${padDots.join(", ")}`).toBe(true);
    expect(new Set(padDots).size, `pad dots: ${padDots.join(", ")}`).toBe(6);
    /**
     * …and they are **roles**, not hexes.
     *
     * The six colours used to be hardcoded `{ hex, rgb }` pairs in this file — the one kind of colour a skin
     * cannot reach, so the jam pads kept the default palette on every phone skin. Each pad now names the shared
     * lane palette (`--d-track-*`), which the generator derives from the *phone skin's own* accent family; a hex
     * here again would be a regression this assertion catches.
     */
    for (const dot of padDots) {
      expect(dot, `pad dot "${dot}" is not a role token`).toMatch(/^var\(--d-track-[a-z]+(-on)?\)$/);
    }
  });

  it("sounds and flashes a pad on every tap, whether or not the transport runs", async () => {
    const { spies } = await renderJam({ isPlaying: false });
    fireEvent.click(screen.getByTestId("mobile-jam-pad-clap"));
    // The clap writes into the snare lane but must *sound* as a clap.
    expect(spies.onAuditionTrack).toHaveBeenCalledWith("snare", "clap");
    const pad = screen.getByTestId("mobile-jam-pad-clap");
    expect(pad.style.boxShadow).not.toBe("");

    fireEvent.click(screen.getByTestId("mobile-jam-pad-kick"));
    expect(spies.onAuditionTrack).toHaveBeenCalledWith("kick", undefined);
  });

  it("sounds a step cell when it is tapped", async () => {
    const { spies } = await renderJam();
    fireEvent.click(screen.getByTestId("mobile-jam-step-2-5"));
    expect(spies.onAuditionTrack).toHaveBeenCalledWith("hihat", undefined);
  });

  it("lights the playhead cell in its lane's colour", async () => {
    await renderJam({ isPlaying: true, readClock: () => ({ step: 3, fraction: 0 }) });
    // The playhead arrives on a timer; the cell for step 3 carries a ring rather than the neutral fill.
    return waitFor(() => {
      const cell = screen.getByTestId("mobile-jam-step-0-3");
      expect(cell.style.background).not.toBe("");
      expect(cell.style.background).not.toBe("rgba(232,232,255,0.055)");
    });
  });
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
  });

  /**
   * jsdom performs no layout, so the feel rail's rect is all zeros and a drag would have nothing to
   * map against. State the measured rail the browser would hand over, exactly as the piano roll's
   * tests state a viewport width.
   */
  const measureSwingRail = (width = 200, left = 0) => {
    const rail = screen.getByTestId("mobile-jam-swing-slider");
    Object.defineProperty(rail, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left,
        top: 0,
        right: left + width,
        bottom: 44,
        width,
        height: 44,
        x: left,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    return rail;
  };

  it("renders six lanes of sixteen steps — one visible row per pad, plus percussion and chords", async () => {
    await renderJam();
    // The phone's report: "the pads and the rows do not match". Six pads, six rows.
    for (let lane = 0; lane < 6; lane += 1) {
      for (let step = 0; step < 16; step += 1) {
        expect(screen.getByTestId(`mobile-jam-step-${lane}-${step}`)).toBeInTheDocument();
      }
    }
    expect(screen.getByTestId("mobile-jam-grid")).toBeInTheDocument();
    expect(screen.getByTestId("mobile-jam-tempo")).toBeInTheDocument();

    // The grid is six rows of sixteen *buttons* — the step is the tap target, not a cell.
    const rows = Array.from(screen.getByTestId("mobile-jam-grid").children);
    expect(rows).toHaveLength(6);
    for (const row of rows) expect(row.querySelectorAll("button")).toHaveLength(16);
    expect(screen.getByTestId("mobile-jam-step-0-0").tagName).toBe("BUTTON");
  });

  it("toggles a step and pushes the edited pattern to the engine", async () => {
    const { spies } = await renderJam();
    const step = screen.getByTestId("mobile-jam-step-0-0");
    const before = step.getAttribute("aria-pressed");
    fireEvent.click(step);
    expect(screen.getByTestId("mobile-jam-step-0-0").getAttribute("aria-pressed")).not.toBe(before);
    expect(spies.onApplyPattern).toHaveBeenCalled();
    const lastPattern = spies.onApplyPattern.mock.calls.at(-1)?.[0] as SequencerPattern;
    const kick = lastPattern.tracks.find((track) => track.track_id === "kick");
    expect(Boolean(kick?.steps[0])).toBe(before !== "true");
  });

  it("resets the groove back to the genre's own pattern", async () => {
    await renderJam();
    const step = screen.getByTestId("mobile-jam-step-0-0");
    const original = step.getAttribute("aria-pressed");
    fireEvent.click(step);
    expect(screen.getByTestId("mobile-jam-step-0-0").getAttribute("aria-pressed")).not.toBe(original);

    fireEvent.click(screen.getByTestId("mobile-jam-reset"));
    expect(screen.getByTestId("mobile-jam-step-0-0").getAttribute("aria-pressed")).toBe(original);
  });

  it("plays and stops through the shell's transport", async () => {
    const { spies, unmount } = await renderJam();
    fireEvent.click(screen.getByTestId("mobile-jam-play"));
    expect(spies.onTogglePlay).toHaveBeenCalledTimes(1);
    // The screen hands the shell an **id**; the shell resolves the record and builds the pattern.
    expect(spies.onTogglePlay).toHaveBeenCalledWith(GENRE.id);
    unmount();

    await renderJam({ isPlaying: true });
    expect(screen.getByTestId("mobile-jam-play")).toHaveAttribute("aria-pressed", "true");
  });

  it("arms recording, and a pad then writes the step under the playhead", async () => {
    await renderJam();
    expect(screen.queryByTestId("mobile-jam-record-hint")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("mobile-jam-record"));
    expect(screen.getByTestId("mobile-jam-record")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("mobile-jam-record-hint")).toBeInTheDocument();

    // `readClock` reports step 4, so the kick pad writes step 4 of lane 0.
    const target = screen.getByTestId("mobile-jam-step-0-4");
    const before = target.getAttribute("aria-pressed");
    fireEvent.click(screen.getByTestId("mobile-jam-pad-kick"));
    expect(screen.getByTestId("mobile-jam-step-0-4").getAttribute("aria-pressed")).not.toBe(before);
  });

  it("keeps the tempo inside its documented range and tells the engine", async () => {
    const { spies } = await renderJam();
    const bpm = () => Number((screen.getByTestId("mobile-jam-bpm").textContent ?? "").replace(/[^0-9]/g, ""));
    const start = bpm();
    fireEvent.click(screen.getByTestId("mobile-jam-bpm-up"));
    expect(bpm()).toBe(start + 2);
    expect(spies.onTempo).toHaveBeenLastCalledWith(start + 2);

    for (let i = 0; i < 60; i += 1) fireEvent.click(screen.getByTestId("mobile-jam-bpm-up"));
    expect(bpm()).toBe(180);
    for (let i = 0; i < 120; i += 1) fireEvent.click(screen.getByTestId("mobile-jam-bpm-down"));
    expect(bpm()).toBe(60);
  });

  it("raises the feel when the rail is dragged right, and the readout follows", async () => {
    const { spies } = await renderJam();
    const rail = measureSwingRail(200);

    fireEvent.pointerDown(rail, { clientX: 0, pointerId: 1 });
    expect(screen.getByTestId("mobile-jam-swing-value").textContent).toContain("0%");

    // Halfway along a 200 px rail is 20% of the engine's 0..0.4 swing range.
    fireEvent.pointerMove(rail, { clientX: 100, pointerId: 1 });
    expect(screen.getByTestId("mobile-jam-swing-value").textContent).toContain("20%");
    expect(spies.onSwing).toHaveBeenLastCalledWith(0.2);

    // 60 px of 200 is 12% of the range, which snaps down to the 5% step (10%) rather than reading 12%.
    fireEvent.pointerMove(rail, { clientX: 60, pointerId: 1 });
    expect(screen.getByTestId("mobile-jam-swing-value").textContent).toContain("10%");
    expect(spies.onSwing).toHaveBeenLastCalledWith(0.1);

    fireEvent.pointerUp(rail, { clientX: 60, pointerId: 1 });
    // A move with no pointer down is a hover, not a drag: the groove must not follow the cursor.
    fireEvent.pointerMove(rail, { clientX: 190, pointerId: 1 });
    expect(screen.getByTestId("mobile-jam-swing-value").textContent).toContain("10%");
  });

  it("clamps a drag past either end of the rail", async () => {
    const { spies } = await renderJam();
    const rail = measureSwingRail(200);

    fireEvent.pointerDown(rail, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(rail, { clientX: 900, pointerId: 1 });
    expect(screen.getByTestId("mobile-jam-swing-value").textContent).toContain("40%");
    expect(spies.onSwing).toHaveBeenLastCalledWith(0.4);
    fireEvent.pointerUp(rail, { clientX: 900, pointerId: 1 });

    fireEvent.pointerDown(rail, { clientX: 100, pointerId: 2 });
    fireEvent.pointerMove(rail, { clientX: -500, pointerId: 2 });
    expect(screen.getByTestId("mobile-jam-swing-value").textContent).toContain("0%");
    expect(spies.onSwing).toHaveBeenLastCalledWith(0);
    fireEvent.pointerUp(rail, { clientX: -500, pointerId: 2 });
  });

  it("keeps record, tempo, swing and the metronome in one dock above the pads", async () => {
    await renderJam();
    const dock = screen.getByTestId("mobile-jam-tempo");
    for (const id of [
      "mobile-jam-record",
      "mobile-jam-metronome",
      "mobile-jam-bpm",
      "mobile-jam-bpm-up",
      "mobile-jam-bpm-down",
      "mobile-jam-swing-slider",
      "mobile-jam-swing-value",
    ]) {
      expect(dock.contains(screen.getByTestId(id))).toBe(true);
    }

    /**
     * Pads last, nearest the thumbs.
     *
     * They used to sit above the dock, which put the transport under the playing hand: a thumb reaching for a
     * pad could land on record. The order is transport, then pads, and the pads own the sticky slot.
     */
    const padsDock = screen.getByTestId("mobile-jam-pads-dock");
    expect(dock.compareDocumentPosition(padsDock) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(padsDock.contains(screen.getByTestId("mobile-jam-pad-kick"))).toBe(true);
    expect(screen.queryByTestId("mobile-player-bar")).not.toBeInTheDocument();

    // The old chip row is gone: swing is a rail now.
    expect(screen.queryByTestId("mobile-jam-swing-30")).not.toBeInTheDocument();
    expect(screen.getByTestId("mobile-jam-swing-slider").getAttribute("role")).toBe("slider");
    expect(screen.getByTestId("mobile-jam-record").tagName).toBe("BUTTON");
  });

  it("toggles the metronome through the shell", async () => {
    const { spies } = await renderJam();
    const button = screen.getByTestId("mobile-jam-metronome");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    expect(spies.onMetronome).toHaveBeenLastCalledWith(true);
  });

  it("opens the multi-level genre picker from the backing-genre row", async () => {
    /**
     * The row used to navigate away to the genre's page — a *browse* gesture on a screen whose whole purpose is
     * "play this genre now", and the only way to change what the jam is backed by. It opens the picker instead
     * (C-02), and the picker takes the grid's place rather than sitting beside it, because this module is one
     * screen with no scrolling: anything added to the column would push the pads off the bottom.
     */
    await renderJam();
    expect(screen.queryByTestId("mobile-jam-picker")).toBeNull();
    expect(screen.getByTestId("mobile-jam-genre").getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByTestId("mobile-jam-genre"));
    expect(screen.getByTestId("mobile-jam-picker")).toBeTruthy();
    expect(screen.queryByTestId("mobile-jam-grid")).toBeNull();
    expect(screen.getByTestId("mobile-jam-genre").getAttribute("aria-expanded")).toBe("true");

    // The same control closes it again, which is what a thumb expects of a toggle.
    fireEvent.click(screen.getByTestId("mobile-jam-genre"));
    expect(screen.queryByTestId("mobile-jam-picker")).toBeNull();
    expect(screen.getByTestId("mobile-jam-grid")).toBeTruthy();
  });

  it("switches the backing genre from the picker, and does not restart the one already playing", async () => {
    const { spies } = await renderJam();
    fireEvent.click(screen.getByTestId("mobile-jam-genre"));
    // The picker's own rows carry the jam's prefix, so the assertion cannot pass on a player row left in the DOM.
    const rows = screen.getAllByTestId(/^mobile-jam-picker-genre-/);
    expect(rows.length).toBeGreaterThan(0);

    const other = rows.find((row) => row.getAttribute("data-genre-id") !== GENRE.id) ?? rows[0];
    fireEvent.click(other);
    expect(spies.onTogglePlay).toHaveBeenCalledTimes(1);
    // …and choosing closes the picker, so the grid is back under the thumb.
    expect(screen.queryByTestId("mobile-jam-picker")).toBeNull();
    expect(screen.getByTestId("mobile-jam-grid")).toBeTruthy();
  });
});
