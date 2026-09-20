/**
 * The studio's session state, out of the view (G.8 item 6).
 *
 * These values used to be `useState` calls inside `StudioView`, so the behaviour was only reachable by
 * rendering the whole studio — and any other surface (the phone shell being the next one) would have
 * had to copy it. What is worth pinning is not "the hook returns a state variable" but the three rules
 * that were previously implicit in the view:
 *
 *   1. the kit starts at the genre's own default;
 *   2. none of the live performance values are persisted — restoring them would re-arm the recorder or
 *      re-enter drum-only mode on the next visit;
 *   3. the FAB preference *is* stored, and the hook follows it when another surface changes it —
 *     in this tab through the custom event, in another through `storage`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useInspectorCursor,
  useKeyboardPerformance,
  usePlaybackSettings,
} from "../features/sequencer/hooks/useStudioSession";
import { FAB_STORAGE_KEY, saveKeyboardFabPref } from "../features/sequencer/keyboardFabPref";
import { getDefaultDrumKitForGenre } from "../utils/trackUtils";

const GENRE = { id: "house", name: "House", category: "electronic" };

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("usePlaybackSettings · live performance state", () => {
  it("starts the drum kit at the genre's own default", () => {
    const { result } = renderHook(() => usePlaybackSettings({ genre: GENRE }));
    expect(result.current.drumKit).toBe(getDefaultDrumKitForGenre(GENRE));
  });

  it("starts with drums-only and record-arm off, and lets them flip", () => {
    const { result } = renderHook(() => usePlaybackSettings({ genre: GENRE }));
    expect(result.current.isDrumsOnly).toBe(false);
    expect(result.current.isRecordArmed).toBe(false);

    act(() => result.current.setIsDrumsOnly(true));
    act(() => result.current.setIsRecordArmed(true));
    expect(result.current.isDrumsOnly).toBe(true);
    expect(result.current.isRecordArmed).toBe(true);
  });

  it("does not persist any of it — a reopened studio is not armed", () => {
    // The rule the view used to state in a comment: restoring these would silently re-arm the
    // recorder or re-enter drum-only mode on the next visit.
    const first = renderHook(() => usePlaybackSettings({ genre: GENRE }));
    act(() => first.result.current.setIsDrumsOnly(true));
    act(() => first.result.current.setIsRecordArmed(true));
    act(() => first.result.current.setDrumKit("909"));
    first.unmount();

    expect(localStorage.length).toBe(0);

    const second = renderHook(() => usePlaybackSettings({ genre: GENRE }));
    expect(second.result.current.isDrumsOnly).toBe(false);
    expect(second.result.current.isRecordArmed).toBe(false);
    expect(second.result.current.drumKit).toBe(getDefaultDrumKitForGenre(GENRE));
  });
});

describe("useKeyboardPerformance · the keyboard and its button", () => {
  it("starts closed, with the button offered unless the preference says otherwise", () => {
    const { result } = renderHook(() => useKeyboardPerformance());
    expect(result.current.isKeyboardMode).toBe(false);
    expect(result.current.showKeyboardFab).toBe(true);

    localStorage.setItem(FAB_STORAGE_KEY, "false");
    const off = renderHook(() => useKeyboardPerformance());
    expect(off.result.current.showKeyboardFab).toBe(false);
  });

  it("follows a change made in this tab (the storage event never fires here)", () => {
    const { result } = renderHook(() => useKeyboardPerformance());
    expect(result.current.showKeyboardFab).toBe(true);

    act(() => saveKeyboardFabPref(false));
    expect(result.current.showKeyboardFab).toBe(false);

    act(() => saveKeyboardFabPref(true));
    expect(result.current.showKeyboardFab).toBe(true);
  });

  it("follows a change made in another tab (storage event)", () => {
    const { result } = renderHook(() => useKeyboardPerformance());
    act(() => {
      localStorage.setItem(FAB_STORAGE_KEY, "false");
      window.dispatchEvent(new StorageEvent("storage", { key: FAB_STORAGE_KEY }));
    });
    expect(result.current.showKeyboardFab).toBe(false);
  });

  it("stops listening once it is gone", () => {
    const { result, unmount } = renderHook(() => useKeyboardPerformance());
    unmount();
    // No listener left behind: a later write must not touch the (now unmounted) state.
    expect(() => saveKeyboardFabPref(false)).not.toThrow();
  });
});

describe("useInspectorCursor · the open inspector follows its track", () => {
  it("starts closed and opens on a track", () => {
    const { result } = renderHook(() => useInspectorCursor());
    expect(result.current.inspectorTrackIdx).toBeNull();
    act(() => result.current.setInspectorTrackIdx(2));
    expect(result.current.inspectorTrackIdx).toBe(2);
  });

  it("moves with a reordered row instead of following the index", () => {
    const { result } = renderHook(() => useInspectorCursor());
    act(() => result.current.setInspectorTrackIdx(1));

    act(() => result.current.moveInspectorWithRow(1, 0)); // moved up
    expect(result.current.inspectorTrackIdx).toBe(0);

    act(() => result.current.moveInspectorWithRow(0, 1)); // and back down
    expect(result.current.inspectorTrackIdx).toBe(1);
  });

  it("leaves the selection alone when the open track was not part of the move", () => {
    const { result } = renderHook(() => useInspectorCursor());
    act(() => result.current.setInspectorTrackIdx(3));
    act(() => result.current.moveInspectorWithRow(0, 1));
    expect(result.current.inspectorTrackIdx).toBe(3);

    // …and a no-op move (already at the edge) is not a move either.
    act(() => result.current.moveInspectorWithRow(2, 2));
    expect(result.current.inspectorTrackIdx).toBe(3);
  });

  it("does nothing while the inspector is closed", () => {
    const { result } = renderHook(() => useInspectorCursor());
    act(() => result.current.moveInspectorWithRow(0, 1));
    expect(result.current.inspectorTrackIdx).toBeNull();
  });
});
