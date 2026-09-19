/**
 * U8: the studio's auto-save is visible now.
 *
 * The project has always been written to localStorage 500 ms after every change, and the studio never
 * said so — while the genre maker has shown an "unsaved" badge all along. A user could not tell a
 * saved project from one that only existed in memory, or from one whose storage was full and silently
 * refusing writes.
 *
 * Three properties matter, and each is pinned here:
 *
 *  1. **The status comes from the writer.** `projectStorage` is the only module that knows whether a
 *     write happened, so it owns the status and this only subscribes — no parallel bookkeeping that
 *     could disagree with reality.
 *  2. **A refused write is not "saving".** localStorage throws when full or disabled; the old code
 *     only logged it, which would have left this indicator claiming "saving…" for ever.
 *  3. **It says where the work is.** Saved *in this browser* is the truth — there is no server — and
 *     the tooltip says so rather than letting a checkmark imply a cloud backup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LanguageProvider } from "../i18n/LanguageContext";
import { SaveIndicator } from "../components/sequencer/SaveIndicator";
import { useAutosaveStatus } from "../features/sequencer/hooks/useAutosaveStatus";
import {
  debounceSaveProject,
  flushPendingProject,
  getSaveStatusSnapshot,
  resetSaveStatus,
} from "../features/sequencer/projectStorage";

const SRC = resolve(__dirname, "..");
const read = (relative: string) => readFileSync(resolve(SRC, relative), "utf8");

/** The smallest payload `debounceSaveProject` accepts. */
function payload() {
  const pattern = {
    genre_id: "test",
    bpm: 120,
    swing: 0,
    scale: "C minor",
    totalSteps: 16,
    tracks: [],
  } as never;
  return {
    genreId: "test",
    bpm: 120,
    swing: 0,
    timeSignature: "4/4",
    resolution: "1/16" as const,
    stepCount: 16,
    patterns: { A: pattern, B: pattern },
    activeSlot: "A" as const,
    songMode: false,
    songChain: [],
    loopRange: null,
    isMetronome: false,
    isCountIn: false,
  };
}

beforeEach(() => {
  localStorage.clear();
  resetSaveStatus();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("autosave status · the writer owns it", () => {
  it("goes saving → saved around the debounce, and keeps the write time", () => {
    expect(getSaveStatusSnapshot().status).toBe("idle");

    debounceSaveProject(payload());
    expect(getSaveStatusSnapshot().status).toBe("saving");
    expect(getSaveStatusSnapshot().savedAt).toBeNull();

    act(() => {
      vi.advanceTimersByTime(600);
    });

    const snapshot = getSaveStatusSnapshot();
    expect(snapshot.status).toBe("saved");
    expect(snapshot.savedAt).toBeGreaterThan(0);
  });

  it("marks a flushed write as saved too, so a page hide cannot leave it claiming to save", () => {
    debounceSaveProject(payload());
    expect(getSaveStatusSnapshot().status).toBe("saving");

    flushPendingProject();

    expect(getSaveStatusSnapshot().status).toBe("saved");
  });

  it("says the write failed instead of pretending it is still saving", () => {
    // Storage full or disabled: the old code only logged this, so the indicator would have spun for
    // ever while the user's work was not safe.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    try {
      debounceSaveProject(payload());
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(getSaveStatusSnapshot().status).toBe("failed");
    } finally {
      setItem.mockRestore();
      warn.mockRestore();
    }
  });
});

describe("autosave status · the subscription", () => {
  it("re-renders when the status changes outside React", () => {
    const { result } = renderHook(() => useAutosaveStatus());
    expect(result.current.status).toBe("idle");

    act(() => {
      debounceSaveProject(payload());
    });
    expect(result.current.status).toBe("saving");

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.status).toBe("saved");
  });
});

describe("save indicator", () => {
  it("renders nothing until something has happened, and nothing when the host hides it", () => {
    const { container } = render(
      <LanguageProvider>
        <SaveIndicator visible status={{ status: "idle", savedAt: null }} />
      </LanguageProvider>
    );
    expect(container.querySelector("[data-testid='save-indicator']")).toBeNull();

    const hidden = render(
      <LanguageProvider>
        <SaveIndicator visible={false} status={{ status: "saved", savedAt: Date.now() }} />
      </LanguageProvider>
    );
    expect(hidden.container.querySelector("[data-testid='save-indicator']")).toBeNull();
  });

  it("announces each state, and names the time of the last write", () => {
    const { rerender } = render(
      <LanguageProvider>
        <SaveIndicator visible status={{ status: "saving", savedAt: null }} />
      </LanguageProvider>
    );

    const saving = screen.getByTestId("save-indicator");
    // A screen reader gets the same reassurance as the eye: `role="status"` is a live region.
    expect(saving.getAttribute("role")).toBe("status");
    expect(saving.getAttribute("aria-live")).toBe("polite");
    expect(saving.getAttribute("data-save-status")).toBe("saving");
    const savingText = saving.textContent;

    const savedAt = Date.now();
    rerender(
      <LanguageProvider>
        <SaveIndicator visible status={{ status: "saved", savedAt }} />
      </LanguageProvider>
    );
    const saved = screen.getByTestId("save-indicator");
    expect(saved.getAttribute("data-save-status")).toBe("saved");
    expect(saved.getAttribute("title")).toBeTruthy();
    // Capture the text now: the element is reused by the next render, so reading it later would
    // compare the new state with itself.
    const savedText = saved.textContent;
    expect(savedText).not.toBe(savingText);

    rerender(
      <LanguageProvider>
        <SaveIndicator visible status={{ status: "failed", savedAt: null }} />
      </LanguageProvider>
    );
    const failed = screen.getByTestId("save-indicator");
    expect(failed.getAttribute("data-save-status")).toBe("failed");
    expect(failed.textContent).not.toBe(savedText);
  });
});

describe("save indicator · wiring", () => {
  it("is mounted by the studio, positionally stable, next to the first-run hint", () => {
    // Wiring, not behaviour: the status and the component are covered above, and an indicator
    // rendered nowhere (or as a conditional sibling that remounts the panel) is the failure here.
    const view = read("views/StudioView.tsx");
    expect(view).toContain("useAutosaveStatus()");
    expect(view).toContain("<SaveIndicator visible={!isPhone} status={autosave} />");
    expect(view).not.toMatch(/\{!isPhone && \(\s*<div className="flex justify-end/);
  });
});
