import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "fake-indexeddb/auto";
import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import { CustomGenreMakerView } from "../views/CustomGenreMakerView";
import { LanguageProvider } from "../i18n/LanguageContext";
import { saveCustomGenre, createBlankCustomGenre, getAllCustomGenres } from "../features/customGenre/customGenreDb";

// Mock AudioEngine to avoid WebAudio errors in test environment
vi.mock("../audio/AudioEngine", () => {
  return {
    AudioEngine: vi.fn().mockImplementation(() => ({
      setPattern: vi.fn(),
      setBpm: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
    })),
  };
});

// Coverage instrumentation makes a single fake IndexedDB round-trip slower than
// the 1s default waitFor budget, so bound async DOM signals explicitly instead
// of leaning on the 15s test-level wall clock that used to hide the problem.
const ASYNC_UI_TIMEOUT = 5000;

describe("CustomGenreMakerView Component (P7-03)", () => {
  const mockOpenStudio = vi.fn();
  const mockSelectGenre = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Give every test a brand-new fake IndexedDB backend so a genre saved by an
    // earlier test can never be the active genre of a later one.
    globalThis.indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  });

  it("renders the workshop header, identity form, radar, and 8-track matrix", async () => {
    const blank = createBlankCustomGenre("Galactic House");
    await saveCustomGenre(blank);

    render(
      <LanguageProvider>
        <CustomGenreMakerView
          onOpenStudio={mockOpenStudio}
          onSelectGenre={mockSelectGenre}
        />
      </LanguageProvider>
    );

    // Header & actions
    await waitFor(() => {
      expect(screen.getByText(/自定义曲风与变奏工坊|Custom Genre & Variation Maker/i)).toBeTruthy();
      expect(screen.getByTitle(/新建空白曲风|New Blank Genre/i)).toBeTruthy();
      expect(screen.getByTitle(/在编曲室中打开|Open in Studio/i)).toBeTruthy();
      expect(screen.getByTitle(/专属海报与分享|Poster & Share/i)).toBeTruthy();
    }, { timeout: ASYNC_UI_TIMEOUT });

    // 8 tracks are present
    expect(screen.getByText("Kick 909")).toBeTruthy();
    expect(screen.getByText("Snare Crisp")).toBeTruthy();
    expect(screen.getByText("Closed Hat")).toBeTruthy();
    expect(screen.getByText("Acid Bass 303")).toBeTruthy();

    // 6-axis radar sliders
    expect(screen.getAllByText(/律动感|Groove/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/明亮度|Brightness/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/和声度|Harmonics/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/节奏密度|Density/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/低频能量|Bass/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/旋律性|Melodic/i).length).toBeGreaterThanOrEqual(1);
  }, 10000);

  it("modifies genre name and marks as unsaved until saved", async () => {
    render(
      <LanguageProvider>
        <CustomGenreMakerView
          onOpenStudio={mockOpenStudio}
          onSelectGenre={mockSelectGenre}
        />
      </LanguageProvider>
    );

    // findBy* drives the real async load path (IndexedDB -> useCustomGenres -> DOM).
    const nameInput = await screen.findByDisplayValue(
      /Galactic House|Custom Genre/i,
      {},
      { timeout: ASYNC_UI_TIMEOUT }
    );
    fireEvent.change(nameInput, { target: { value: "Neon Synth Funk" } });

    expect(screen.getByDisplayValue("Neon Synth Funk")).toBeTruthy();
    expect(screen.getByText(/未保存修改|Unsaved/i)).toBeTruthy();

    // Click save
    const saveBtn = screen.getByRole("button", { name: /保存到工坊|Save to Hub/i });
    fireEvent.click(saveBtn);

    // The save resolves through customGenreDb -> fake IndexedDB. Wait on the DOM
    // signal (dirty badge disappears) with a bounded timeout rather than a 15s
    // wall-clock allowance.
    await waitFor(() => {
      expect(screen.queryByText(/未保存修改|Unsaved/i)).toBeNull();
    }, { timeout: ASYNC_UI_TIMEOUT });

    // And prove the rename actually reached the database, not just React state.
    await waitFor(async () => {
      const persisted = await getAllCustomGenres();
      expect(persisted.some((g) => g.name === "Neon Synth Funk")).toBe(true);
    }, { timeout: ASYNC_UI_TIMEOUT });
  }, 10000);

  it("toggles pattern steps and auditions pattern", async () => {
    render(
      <LanguageProvider>
        <CustomGenreMakerView
          onOpenStudio={mockOpenStudio}
          onSelectGenre={mockSelectGenre}
        />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByTitle("Step 1 (Kick 909)")).toBeTruthy();
    }, { timeout: ASYNC_UI_TIMEOUT });

    const step1 = screen.getByTitle("Step 1 (Kick 909)");
    fireEvent.click(step1);

    // Audition toggle button
    const auditionBtn = screen.getByRole("button", { name: /试听律动|Audition Pattern/i });
    fireEvent.click(auditionBtn);

    expect(screen.getByText(/停止试听|Stop Audition/i)).toBeTruthy();
  }, 10000);

  it("navigates to studio with active custom genre", async () => {
    render(
      <LanguageProvider>
        <CustomGenreMakerView
          onOpenStudio={mockOpenStudio}
          onSelectGenre={mockSelectGenre}
        />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByTitle(/在编曲室中打开|Open in Studio/i)).toBeTruthy();
    }, { timeout: ASYNC_UI_TIMEOUT });

    const studioBtn = screen.getByTitle(/在编曲室中打开|Open in Studio/i);
    fireEvent.click(studioBtn);

    expect(mockOpenStudio).toHaveBeenCalledWith(
      expect.objectContaining({ isCustom: true })
    );
  }, 10000);
});
