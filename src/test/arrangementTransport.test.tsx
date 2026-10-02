/**
 * ⭐ The owner's report, as criteria: **"the play and stop buttons have no state of their own, and the stop button does nothing."**
 *
 * The audio half of that — that a stop really stops the engine — is judged where it lives, in `arrangementEnginePlayback.test.ts` and by the `wangda_audio_bus` timeline the probe records. What is left here is the half a jsdom render can still
 * see: that the two buttons *report* the transport, and that the position indicators are fed by the transport rather
 * than by a constant.
 *
 * Three claims, and each is one of the diagnostic's findings:
 *
 *   1. the buttons were **byte-identical in every state** — same `className`, same computed style, no `aria-pressed`,
 *      no `title`, and `Play`/`Stop` forever. Here they must differ, and by the project's own idiom rather than a new one;
 *   2. the playhead was **hard-wired to zero** (`playheadBar` was never passed), so it could not move;
 *   3. the timecode's beat was the literal `1`, so the readout could only ever say `N.1`.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { LanguageProvider } from "../i18n/LanguageContext";
import type { ArrangementPlayer, ArrangementTransport, ArrangementTransportState } from "../audio/playArrangementV2";

const noCapture = () => new Promise<never>(() => undefined);
const NOTES = {};

/**
 * A transport a criterion can drive, so the view is judged against a *reported* position rather than against a
 * rendered prop — which is the distinction the whole complaint is about.
 *
 * It keeps the unsubscribe set so a test can also assert that an unmounted view stops being written to: a live
 * callback holding a removed DOM node is how a "playhead that moves" becomes a leak.
 */
function makeTransport() {
  let state: ArrangementTransportState = { step: 0, playing: false };
  const listeners = new Set<(next: ArrangementTransportState) => void>();
  const transport: ArrangementTransport = {
    read: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    transport,
    emit: (next: ArrangementTransportState) => {
      state = next;
      for (const listener of listeners) listener(next);
    },
    listeners: () => listeners.size,
  };
}

function renderTransportView(player: ArrangementPlayer) {
  localStorage.setItem("groove_language", "en");
  const rendered = render(
    <LanguageProvider>
      <ArrangementViewV2 songId="s" capture={noCapture} player={player} />
    </LanguageProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: "Create" }));
  return rendered;
}

describe("the transport's state, on the buttons that own it", () => {
  it("starts stopped, with Stop disabled rather than a second live button that would do nothing", () => {
    const { transport } = makeTransport();
    renderTransportView({ play: vi.fn(async () => ({ planned: 1 })), stop: vi.fn(() => 0), transport });

    const play = screen.getByTestId("arrangement-play") as HTMLButtonElement;
    // ⭐ The project's own convention for a toggle, the same attribute the Loop, Snap, mute and solo controls
    // carry — so a screen reader hears "Play, not pressed" instead of a bare word.
    expect(play.getAttribute("aria-pressed")).toBe("false");
    expect(play.textContent).toBe("Play");
    expect(play.disabled).toBe(false);
    // Nothing is running, so there is nothing to stop: a live Stop here is the button the owner pressed for no effect.
    expect((screen.getByTestId("arrangement-stop") as HTMLButtonElement).disabled).toBe(true);
  });

  it("says it is playing — pressed, renamed, filled with the accent — and hands Stop the live state", () => {
    const { transport, emit } = makeTransport();
    renderTransportView({ play: vi.fn(async () => ({ planned: 1 })), stop: vi.fn(() => 0), transport });

    const play = screen.getByTestId("arrangement-play") as HTMLButtonElement;
    const stop = screen.getByTestId("arrangement-stop") as HTMLButtonElement;
    const before = play.className;

    act(() => emit({ step: 0, playing: true }));

    // ⭐ The state the owner said was missing, in three registers at once: the accessibility tree, the word, and the paint.
    expect(play.getAttribute("aria-pressed")).toBe("true");
    expect(play.textContent).toBe("Pause");
    expect(play.getAttribute("aria-label")).toBe("Pause");
    expect(play.className).not.toBe(before);
    /**
     * ⭐ The fill is the project's active-control idiom — `--d-accent` behind and `--d-on-accent` in front — wrapped in
     * `rgb()` because a bare palette triple is a declaration the browser drops (`arrangementColours.test.ts`). Using
     * the token rather than a colour is what makes this legible on all six skins instead of on the dark one.
     */
    expect(play.className).toContain("rgb(var(--d-accent))");
    expect(play.className).toContain("rgb(var(--d-on-accent))");
    // And the other half: now there is something to stop.
    expect(stop.disabled).toBe(false);

    // Back to stopped, and every register goes back with it.
    act(() => emit({ step: 0, playing: false }));
    expect(play.getAttribute("aria-pressed")).toBe("false");
    expect(play.textContent).toBe("Play");
    expect(play.className).toBe(before);
    expect(stop.disabled).toBe(true);
  });

  it("moves the playhead and the timecode from the transport's own steps, and gives the beat a real number", () => {
    const { transport, emit } = makeTransport();
    renderTransportView({ play: vi.fn(async () => ({ planned: 1 })), stop: vi.fn(() => 0), transport });

    const playhead = screen.getByTestId("arrangement-playhead");
    const position = screen.getByTestId("arrangement-position");
    // Stopped, the transport is at bar one — not at whatever bar the ruler was last clicked on.
    expect(position.textContent).toBe("1.1");

    /**
     * Step 36 of a 4/4 arrangement: two bars and four steps in, which is **bar three, beat two** — the readout that
     * could only ever say `N.1` while the beat was a literal. 36/16 × 64 px per bar is the playhead's own position.
     */
    act(() => emit({ step: 36, playing: true }));
    expect(position.textContent).toBe("3.2");
    expect(playhead.style.left).toBe(`${(36 / 16) * 64}px`);
    // The title carries the same reading in words, which is what an accessible name can hold.
    expect(position.getAttribute("title")).toBe("Bar 3.2");

    // One more step, and the picture is one sixteenth further on.
    act(() => emit({ step: 37, playing: true }));
    expect(playhead.style.left).toBe(`${(37 / 16) * 64}px`);
  });

  it("keeps the picture where the transport left it when something else re-renders, instead of rewinding to bar one", () => {
    const { transport, emit } = makeTransport();
    renderTransportView({ play: vi.fn(async () => ({ planned: 1 })), stop: vi.fn(() => 0), transport });

    act(() => emit({ step: 48, playing: true }));
    const playhead = screen.getByTestId("arrangement-playhead");
    expect(playhead.style.left).toBe(`${(48 / 16) * 64}px`);

    /**
     * ⭐ The zoom button re-renders the toolbar, and the playhead's own `style` prop is written by React on every
     * render that changes it. Without the last reported bar being read back at render time, this press would put the
     * line back at bar one and the next step would snap it forward — a one-frame lie, sixteen times a second.
     */
    fireEvent.click(screen.getByTestId("arrangement-zoom-in"));
    const zoomed = expect(screen.getByTestId("arrangement-playhead").style.left);
    // 64 × 1.5 = 96 px per bar, and three bars in.
    zoomed.toBe(`${3 * 96}px`);
  });

  it("toggles: a press while the transport is running stops it rather than compiling the arrangement again", () => {
    const { transport, emit } = makeTransport();
    const play = vi.fn(async () => ({ planned: 1 }));
    const stop = vi.fn(() => 0);
    renderTransportView({ play, stop, transport });

    act(() => emit({ step: 8, playing: true }));
    fireEvent.click(screen.getByTestId("arrangement-play"));

    // ⭐ One press, one effect: the second press of this button is a stop, which is what the studio's own Play/Pause
    // control does and what makes "pressing play twice" one transport instead of a re-compile over a running one.
    expect(play).toHaveBeenCalledTimes(0);
    expect(stop).toHaveBeenCalledTimes(1);

    // And Stop itself goes through the same one call.
    act(() => emit({ step: 8, playing: true }));
    fireEvent.click(screen.getByTestId("arrangement-stop"));
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it("stops writing to the playhead once the view is gone", () => {
    const { transport, emit, listeners } = makeTransport();
    const rendered = renderTransportView({ play: vi.fn(async () => ({ planned: 1 })), stop: vi.fn(() => 0), transport });
    expect(listeners()).toBe(1);
    rendered.unmount();
    // A callback still holding the removed node is how "the playhead moves" becomes a write nobody can see.
    expect(listeners()).toBe(0);
    expect(() => emit({ step: 4, playing: true })).not.toThrow();
  });
});
