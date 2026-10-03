import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import "fake-indexeddb/auto";
import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import { ProjectHubModal } from "../components/sequencer/ProjectHubModal";
import { LanguageProvider } from "../i18n/LanguageContext";
import { GENRES_MAP } from "../data/genres";
import { DEFAULT_FX_STATE } from "../audio/EffectsRack";
import { createArrangementFromTemplate } from "../data/arrangementEdits";
import {
  getAllArrangementProjects,
  getSavedArrangementProject,
  saveArrangementProject,
} from "../features/sequencer/projectDb";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * ⭐ **G1: an arrangement project that was saved is a project the Hub shows — and can open, rename and delete.**
 *
 * ## The report
 *
 * "I made an arrangement in `/new` and saved it; the next day there was no 'open project' anywhere, and the Project Hub
 * said **0 saved projects**." Measured, not inferred: `getAllArrangementProjects` had **zero callers outside its own
 * module**, while the Hub read `getAllProjects` — the *other* object store in the same database — so the two could not
 * agree and the hub's "0" was the truthful answer to the wrong question.
 *
 * ## What is asserted, and why in this shape
 *
 * The claim is about **which store the list is built from**, so the criteria seed a real (fake-indexeddb) arrangement
 * through `saveArrangementProject` and require its name in the rendered list. Point the query back at the studio store
 * alone and every criterion here goes red — which is the mutation this file exists to catch.
 *
 * The second half is that a row must be **actionable**: Open must route to *that* project's id, and the rename and
 * delete dialogs must act on the arrangement store rather than on a studio project with the same name.
 */

/** Under coverage instrumentation a single fake IndexedDB round-trip can exceed the 1s default wait. */
const ASYNC_UI_TIMEOUT = 5000;

/**
 * The language is **pinned, not inherited**.
 *
 * `getInitialLanguage` resolves from `navigator.language` when storage is empty, so an unpinned criterion asserts
 * Chinese or English depending on the machine it runs on. Writing the choice once means the labels below mean one
 * thing everywhere, which is what makes them usable as evidence.
 */
localStorage.setItem("groove_language", "en");

const sampleGenre = Object.values(GENRES_MAP)[0]!;

function sampleArrangement(): ArrangementV2 {
  const created = createArrangementFromTemplate("new", "drums-bass");
  return { ...created, bpm: 128, bars: 8 };
}

describe("the Project Hub lists arrangement projects (G1)", () => {
  const mockClose = vi.fn();
  const mockLoad = vi.fn();
  const mockToast = vi.fn();
  const mockOpenArrangement = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("groove_language", "en");
    // Per-test isolation by the convention `ProjectHubModal.test.tsx` records: `projectDb` opens a connection per call
    // and never closes it, so a fresh fake backend is the only deterministic reset.
    globalThis.indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  });

  const defaultProps = {
    isOpen: true,
    onClose: mockClose,
    currentGenre: sampleGenre,
    currentPatterns: {
      A: sampleGenre.sequencer_pattern,
      B: sampleGenre.sequencer_pattern,
    },
    activeSlot: "A" as const,
    bpm: 120,
    swing: 0,
    timeSignature: "4/4",
    resolution: "1/16" as const,
    stepCount: 16,
    songMode: false,
    songChain: ["A", "B"] as ("A" | "B")[],
    loopRange: null,
    effectsRackState: DEFAULT_FX_STATE,
    drumKit: "808" as const,
    isMetronome: false,
    isCountIn: false,
    onLoadProject: mockLoad,
    onOpenArrangementProject: mockOpenArrangement,
    onToast: mockToast,
  };

  it("⭐ shows every saved arrangement project, not only the last one", async () => {
    // Two, deliberately: one could be reached by "reopen the most recent" alone, and the defect is precisely that the
    // hub has no idea the *second* one exists.
    await saveArrangementProject({ name: "Gap Probe One", arrangement: sampleArrangement() });
    await saveArrangementProject({ name: "Gap Probe Two", arrangement: sampleArrangement(), fresh: true });

    render(
      <LanguageProvider>
        <ProjectHubModal {...defaultProps} />
      </LanguageProvider>
    );

    expect(
      await screen.findByText("Gap Probe One", {}, { timeout: ASYNC_UI_TIMEOUT }),
      "a stored arrangement project must appear in the Hub's list"
    ).toBeTruthy();
    expect(
      await screen.findByText("Gap Probe Two", {}, { timeout: ASYNC_UI_TIMEOUT }),
      "and so must the second one — a list that only ever shows one is the defect"
    ).toBeTruthy();
  });

  it("⭐ an empty store still says zero — no row is invented to look populated", async () => {
    render(
      <LanguageProvider>
        <ProjectHubModal {...defaultProps} />
      </LanguageProvider>
    );

    // The empty state is honest: nothing was stored, so nothing is listed.
    expect(
      await screen.findByText(/No matching projects found|未找到匹配的工程/i, {}, { timeout: ASYNC_UI_TIMEOUT })
    ).toBeTruthy();
    expect(document.querySelectorAll('[data-project-kind="arrangement"]').length).toBe(0);
    expect(getSavedArrangementProject()).toBeNull();
  });

  it("⭐ opens the arrangement that was clicked, by its id", async () => {
    const first = await saveArrangementProject({ name: "Open Target One", arrangement: sampleArrangement() });
    await saveArrangementProject({ name: "Open Target Two", arrangement: sampleArrangement(), fresh: true });

    render(
      <LanguageProvider>
        <ProjectHubModal {...defaultProps} />
      </LanguageProvider>
    );

    const open = await screen.findByTestId(
      `project-hub-open-arrangement-${first.id}`,
      {},
      { timeout: ASYNC_UI_TIMEOUT }
    );
    fireEvent.click(open);

    // ⭐ The *clicked* id, not "the most recent one" — the difference between a list and a decoration.
    // `waitFor` because the handler reads the record back from IndexedDB before it routes, so the click is not the
    // moment the route is decided.
    await waitFor(() => expect(mockOpenArrangement).toHaveBeenCalledWith(first.id), { timeout: ASYNC_UI_TIMEOUT });
    expect(mockClose).toHaveBeenCalled();
  });

  it("renames an arrangement through the same dialog as a studio project", async () => {
    const saved = await saveArrangementProject({ name: "Before Rename", arrangement: sampleArrangement() });

    render(
      <LanguageProvider>
        <ProjectHubModal {...defaultProps} />
      </LanguageProvider>
    );

    const card = await screen.findByTestId(
      `project-hub-arrangement-${saved.id}`,
      {},
      { timeout: ASYNC_UI_TIMEOUT }
    );
    fireEvent.click(within(card).getByTitle("Rename", { exact: true }));

    const input = screen.getByDisplayValue("Before Rename");
    fireEvent.change(input, { target: { value: "After Rename" } });
    const renameDialog = await screen.findByTestId("project-hub-rename-dialog", {}, { timeout: ASYNC_UI_TIMEOUT });
    fireEvent.click(within(renameDialog).getByRole("button", { name: /保存重命名|Rename/i }));

    expect(
      await screen.findByText("After Rename", {}, { timeout: ASYNC_UI_TIMEOUT })
    ).toBeTruthy();
    const stored = await getAllArrangementProjects();
    expect(stored.map((r) => r.name)).toEqual(["After Rename"]);
    expect(stored[0]!.id).toBe(saved.id);
  });

  it("deletes an arrangement from its own store", async () => {
    const saved = await saveArrangementProject({ name: "Delete Target", arrangement: sampleArrangement() });

    render(
      <LanguageProvider>
        <ProjectHubModal {...defaultProps} />
      </LanguageProvider>
    );

    const card = await screen.findByTestId(
      `project-hub-arrangement-${saved.id}`,
      {},
      { timeout: ASYNC_UI_TIMEOUT }
    );
    fireEvent.click(within(card).getByTitle("Delete", { exact: true }));
    const deleteDialog = await screen.findByTestId("project-hub-delete-dialog", {}, { timeout: ASYNC_UI_TIMEOUT });
    fireEvent.click(within(deleteDialog).getByRole("button", { name: /彻底删除|^Delete$/i }));

    await waitFor(async () => expect(await getAllArrangementProjects()).toEqual([]), { timeout: ASYNC_UI_TIMEOUT });
  });
});
