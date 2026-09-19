/**
 * U1: the first screen offers **one** action, and stops offering it once it has been taken.
 *
 * The screen is a dense editor with a pattern already loaded. The new-user guide covers a first
 * visit, but a returning visitor — or anyone who dismissed the guide — gets a grid, a transport, and
 * no indication of which to touch first. The studio now renders one slim line: press play, then light
 * up a cell.
 *
 * What matters beyond "it renders":
 *
 *  - it retires **for good** once playback has started, by any route (its own button, the space bar,
 *    the transport), so it can never become furniture;
 *  - dismissing it also retires it — a hint that returns after being dismissed is worse than no hint;
 *  - a storage that refuses to read or write must not make it permanent, or make the app throw.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LanguageProvider } from "../i18n/LanguageContext";
import { FirstRunPrompt } from "../components/onboarding/FirstRunPrompt";
import { useFirstRunPrompt } from "../features/sequencer/hooks/useFirstRunPrompt";
import {
  hasStartedPlayback,
  markPlaybackStarted,
  resetFirstRunRecord,
} from "../features/sequencer/firstRun";

const SRC = resolve(__dirname, "..");
const read = (relative: string) => readFileSync(resolve(SRC, relative), "utf8");

beforeEach(() => {
  localStorage.clear();
});

describe("first-run prompt · the strip itself", () => {
  it("states the one action and offers exactly two controls", () => {
    const onPlay = vi.fn();
    const onDismiss = vi.fn();
    render(
      <LanguageProvider>
        <FirstRunPrompt visible onPlay={onPlay} onDismiss={onDismiss} />
      </LanguageProvider>
    );

    const prompt = screen.getByTestId("first-run-prompt");
    expect(prompt.textContent?.length).toBeGreaterThan(10);

    fireEvent.click(screen.getByTestId("first-run-prompt-play"));
    expect(onPlay).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("first-run-prompt-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("hides by returning null rather than by being unmounted from the call site", () => {
    // The host keeps this component mounted and flips `visible`: a conditional sibling *before* the
    // sequencer panel would change the panel's position when the hint hides, and React would then
    // unmount and remount the whole grid (the E2E matrix caught that as "Element is not attached to
    // the DOM").
    const mounts = vi.fn();
    const Below: React.FC = () => {
      React.useEffect(() => {
        mounts();
      }, []);
      return <div data-testid="below" />;
    };
    const Host: React.FC<{ visible: boolean }> = ({ visible }) => (
      <LanguageProvider>
        <div>
          <FirstRunPrompt visible={visible} onPlay={() => {}} onDismiss={() => {}} />
          <Below />
        </div>
      </LanguageProvider>
    );

    const { rerender } = render(<Host visible />);
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("first-run-prompt")).toBeTruthy();

    rerender(<Host visible={false} />);
    expect(screen.queryByTestId("first-run-prompt")).toBeNull();
    // Same component instance below: nothing was remounted.
    expect(mounts).toHaveBeenCalledTimes(1);
  });
});

describe("first-run prompt · when it is allowed to appear", () => {
  it("shows on a fresh visit and retires itself when its own button is used", () => {
    const { result } = renderHook(() => useFirstRunPrompt({ isPlaying: false }));
    expect(result.current.visible).toBe(true);
    expect(hasStartedPlayback()).toBe(false);

    act(() => result.current.started());

    expect(result.current.visible).toBe(false);
    // Recorded, so it does not come back on the next visit.
    expect(hasStartedPlayback()).toBe(true);
  });

  it("retires when playback starts by another route", () => {
    // The space bar, the transport, a lesson — the prompt has nothing left to say either way.
    const { result, rerender } = renderHook(
      ({ isPlaying }: { isPlaying: boolean }) => useFirstRunPrompt({ isPlaying }),
      { initialProps: { isPlaying: false } }
    );
    expect(result.current.visible).toBe(true);

    rerender({ isPlaying: true });

    expect(result.current.visible).toBe(false);
    expect(hasStartedPlayback()).toBe(true);
  });

  it("retires when dismissed, rather than asking again", () => {
    const { result } = renderHook(() => useFirstRunPrompt({ isPlaying: false }));
    act(() => result.current.dismiss());

    expect(result.current.visible).toBe(false);
    expect(hasStartedPlayback()).toBe(true);
  });

  it("starts hidden once the visit has been recorded", () => {
    markPlaybackStarted();
    const { result } = renderHook(() => useFirstRunPrompt({ isPlaying: false }));
    expect(result.current.visible).toBe(false);
  });
});

describe("first-run record", () => {
  it("round-trips, and can be reset for another first run", () => {
    expect(hasStartedPlayback()).toBe(false);
    markPlaybackStarted();
    expect(hasStartedPlayback()).toBe(true);
    resetFirstRunRecord();
    expect(hasStartedPlayback()).toBe(false);
  });

  it("survives storage that refuses to be read or written", () => {
    // A browser with storage disabled must neither crash the app nor pin the prompt on screen for
    // ever: reading fails to "no record", writing fails silently.
    const getSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    try {
      expect(hasStartedPlayback()).toBe(false);
      expect(() => markPlaybackStarted()).not.toThrow();
      expect(() => resetFirstRunRecord()).not.toThrow();
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });
});

describe("first-run prompt · its label is not the transport's", () => {
  it("does not reuse the transport's play wording", () => {
    // A text-based selector ("click the button that says 播放") is only unambiguous while nothing else
    // offers to play. The E2E matrix found the hint's button first and then clicked it a second time
    // after it had retired — `elementHandle.click: Element is not attached to the DOM`. The hint says
    // what it does ("listen to this one") instead of repeating the transport's word, and the matrix
    // now targets transport controls by test id.
    const studio = read("i18n/locales/studio.ts");
    const hint = studio.match(/first_run_prompt_play:\s*\{\s*en:\s*"([^"]+)",\s*zh:\s*"([^"]+)"\s*\}/);
    const transport = studio.match(/\btoolbar_play:\s*\{\s*en:\s*"([^"]+)",\s*zh:\s*"([^"]+)"\s*\}/);
    expect(hint, "the hint's action label is missing").toBeTruthy();
    expect(transport, "the transport's play label is missing").toBeTruthy();
    expect(hint![1]).not.toBe(transport![1]);
    expect(hint![2]).not.toBe(transport![2]);
  });
});

describe("first-run prompt · wiring", () => {
  it("is rendered by the studio, desktop only, on the transport's own play", () => {
    // Wiring rather than behaviour: the hook and the strip are covered above, and a correct prompt
    // rendered nowhere (or on the phone layout being redesigned) is the failure this pins.
    const view = read("views/StudioView.tsx");
    expect(view).toContain("useFirstRunPrompt({ isPlaying })");
    // Rendered unconditionally with a `visible` prop — see the component's note on remounting.
    expect(view).toContain("visible={!isPhone && firstRunPrompt.visible}");
    expect(view).not.toMatch(/\{!isPhone && firstRunPrompt\.visible && \(/);
    expect(view).toContain("void handleTogglePlay()");
  });
});
