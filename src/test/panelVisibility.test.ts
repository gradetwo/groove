/**
 * Panel visibility: defaults, persistence, and what must **not** be persisted.
 *
 * This state was 40-odd lines of `useState` plus a persist effect inside `StudioView`, a 1255-line
 * view that is about to have three sibling implementations. Extracting it is only worth anything if
 * the behaviour travels with it, so the three properties that were actually load-bearing are pinned
 * here rather than left to be re-derived by the next surface:
 *
 *  1. Defaults are read **once** on mount. Re-reading on every render would let a stale or failing
 *     storage read overwrite what the user just clicked.
 *  2. The seven layout fields are written back on change, so a refresh keeps the user's panels.
 *  3. The live-performance flags are **not** among them. `layoutPrefs`' D-06 note is explicit that
 *     restoring them would re-arm the recorder — a surprise, possibly a destructive one.
 *
 * The third is the one an extraction is most likely to lose: it is invisible in the hook's own code
 * and only shows up as a field that quietly appeared in the persisted shape.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePanelVisibility } from "../features/sequencer/hooks/usePanelVisibility";
import { LAYOUT_PREFS_KEY, saveLayoutPrefs, loadLayoutPrefs } from "../features/sequencer/layoutPrefs";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("usePanelVisibility", () => {
  it("exposes every panel the studio shells need, with a setter", () => {
    const { result } = renderHook(() => usePanelVisibility());
    const expected = [
      "isSidebarCollapsed",
      "isEditorMaximized",
      "isVelocityLaneOpen",
      "velocityActiveTrackIdx",
      "isPianoRollOpen",
      "pianoRollTrackIdx",
      "isEuclideanOpen",
      "isAnalyzerOpen",
      "showAdvancedControls",
      "autoFollowPlayhead",
    ] as const;
    for (const key of expected) {
      expect(result.current[key], `${key} is missing`).toBeDefined();
    }
    // Each has a matching setter, which is what a surface binds to a control.
    for (const key of expected) {
      const setter = `set${key[0].toUpperCase()}${key.slice(1)}`;
      expect(typeof (result.current as unknown as Record<string, unknown>)[setter], setter).toBe(
        "function"
      );
    }
  });

  it("starts from the stored layout rather than from hardcoded false", () => {
    // Before the persistence work, every panel started closed and a refresh lost the user's layout.
    saveLayoutPrefs({
      isSidebarCollapsed: true,
      isEditorMaximized: true,
      isVelocityLaneOpen: true,
      isAnalyzerOpen: true,
      isPianoRollOpen: true,
      showAdvancedControls: true,
      autoFollowPlayhead: false,
    });
    const { result } = renderHook(() => usePanelVisibility());
    expect(result.current.isSidebarCollapsed).toBe(true);
    expect(result.current.isEditorMaximized).toBe(true);
    expect(result.current.isVelocityLaneOpen).toBe(true);
    expect(result.current.isAnalyzerOpen).toBe(true);
    expect(result.current.isPianoRollOpen).toBe(true);
    expect(result.current.showAdvancedControls).toBe(true);
    expect(result.current.autoFollowPlayhead).toBe(false);
  });

  it("writes a change back, so a refresh keeps it", () => {
    const { result } = renderHook(() => usePanelVisibility());
    act(() => result.current.setIsSidebarCollapsed(true));
    expect(loadLayoutPrefs().isSidebarCollapsed).toBe(true);

    act(() => result.current.setIsAnalyzerOpen(true));
    expect(loadLayoutPrefs().isAnalyzerOpen).toBe(true);

    act(() => result.current.setAutoFollowPlayhead(false));
    expect(loadLayoutPrefs().autoFollowPlayhead).toBe(false);
  });

  it("does not persist the live-performance flags, which are not layout", () => {
    /**
     * The D-06 rule, asserted against the persisted shape rather than by inspecting the effect: a
     * field that appeared in storage would be a bug whether or not the hook mentions it, and this is
     * how it would be noticed.
     */
    const { result } = renderHook(() => usePanelVisibility());
    act(() => result.current.setIsVelocityLaneOpen(true));
    const raw = localStorage.getItem(LAYOUT_PREFS_KEY) ?? "";
    for (const forbidden of ["isDrumsOnly", "isRecordArmed", "isKeyboardMode"]) {
      expect(raw, `${forbidden} must never be persisted`).not.toContain(forbidden);
    }
  });

  it("keeps the velocity and piano-roll cursors out of storage", () => {
    /**
     * A cursor is not a layout. Persisting it would reopen the drawer on a track the user had moved
     * away from, and — worse — would make a test or a surface that sets it look like it changed the
     * stored preference.
     */
    const { result } = renderHook(() => usePanelVisibility());
    act(() => result.current.setVelocityActiveTrackIdx(5));
    act(() => result.current.setPianoRollTrackIdx(3));
    const raw = localStorage.getItem(LAYOUT_PREFS_KEY) ?? "";
    expect(raw).not.toContain("velocityActiveTrackIdx");
    expect(raw).not.toContain("pianoRollTrackIdx");
    expect(result.current.velocityActiveTrackIdx).toBe(5);
    expect(result.current.pianoRollTrackIdx).toBe(3);
  });

  it("survives a hostile stored value without losing the working defaults", () => {
    localStorage.setItem(LAYOUT_PREFS_KEY, "{not json at all");
    const { result } = renderHook(() => usePanelVisibility());
    // `loadLayoutPrefs` is best-effort; the hook must not throw on a corrupt profile.
    expect(typeof result.current.isSidebarCollapsed).toBe("boolean");
    expect(typeof result.current.autoFollowPlayhead).toBe("boolean");
  });
});
