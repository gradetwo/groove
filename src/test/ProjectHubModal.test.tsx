import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "fake-indexeddb/auto";
import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import { ProjectHubModal } from "../components/sequencer/ProjectHubModal";
import { LanguageProvider } from "../i18n/LanguageContext";
import { GENRES_MAP } from "../data/genres";
import { DEFAULT_FX_STATE } from "../audio/EffectsRack";
import { saveProject, createBlankProject } from "../features/sequencer/projectDb";

// Under coverage instrumentation a single fake IndexedDB round-trip can exceed
// the 1s default waitFor budget, so give every async DOM signal an explicit,
// bounded window instead of relying on the default.
const ASYNC_UI_TIMEOUT = 5000;

describe("ProjectHubModal Component (P7-02)", () => {
  const sampleGenre = Object.values(GENRES_MAP)[0];
  const mockClose = vi.fn();
  const mockLoad = vi.fn();
  const mockToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Per-test isolation: projectDb.ts opens a new IndexedDB connection on every
    // call and never closes it, so `indexedDB.deleteDatabase("groove_projects_db")`
    // fires `onblocked` and waits forever for those connections. Replacing the
    // fake-indexeddb factory gives each test a brand-new in-memory backend, which
    // discards both leaked rows and leaked connections deterministically.
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
    onToast: mockToast,
  };

  it("renders modal header and actions when open", async () => {
    render(
      <LanguageProvider>
        <ProjectHubModal {...defaultProps} />
      </LanguageProvider>
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /工程管理中心|Project Hub/i })).toBeTruthy();
    expect(screen.getByPlaceholderText(/快速搜索|Search/i)).toBeTruthy();
    expect(screen.getByTitle(/新建空白工程|New Project/i)).toBeTruthy();
  });

  it("lists saved projects and filters by search query", async () => {
    // Seed this test explicitly (fresh DB per test) instead of relying on
    // whatever a previous test/case happened to leave behind.
    await saveProject(createBlankProject(sampleGenre, "Cyberpunk Odyssey"));
    await saveProject(createBlankProject(sampleGenre, "Acoustic Folk"));

    render(
      <LanguageProvider>
        <ProjectHubModal {...defaultProps} />
      </LanguageProvider>
    );

    // Wait for the two seeded projects to be rendered from IndexedDB.
    expect(
      await screen.findByText("Cyberpunk Odyssey", {}, { timeout: ASYNC_UI_TIMEOUT })
    ).toBeTruthy();
    expect(
      await screen.findByText("Acoustic Folk", {}, { timeout: ASYNC_UI_TIMEOUT })
    ).toBeTruthy();

    // Search query
    const searchInput = screen.getByPlaceholderText(/快速搜索|Search/i);
    fireEvent.change(searchInput, { target: { value: "Cyberpunk" } });

    expect(screen.getByText("Cyberpunk Odyssey")).toBeTruthy();
    expect(screen.queryByText("Acoustic Folk")).toBeNull();
  });

  it("triggers onLoadProject callback when load button is clicked", async () => {
    const proj = await saveProject(createBlankProject(sampleGenre, "Load Target Beat"));

    render(
      <LanguageProvider>
        <ProjectHubModal {...defaultProps} />
      </LanguageProvider>
    );

    expect(
      await screen.findByText("Load Target Beat", {}, { timeout: ASYNC_UI_TIMEOUT })
    ).toBeTruthy();

    const loadBtns = screen.getAllByRole("button", { name: /载入工程|Load/i });
    fireEvent.click(loadBtns[0]);

    expect(mockLoad).toHaveBeenCalledWith(
      expect.objectContaining({ id: proj.id, name: "Load Target Beat" })
    );
    expect(mockClose).toHaveBeenCalled();
  });
});
