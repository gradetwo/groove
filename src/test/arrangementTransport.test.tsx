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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { LanguageProvider } from "../i18n/LanguageContext";
import { createArrangementPlayer } from "../audio/playerFromEngine";
import { AudioEngine } from "../audio/AudioEngine";
import { ecosystemBus } from "../audio/ecosystemBus";
import { FakeAudioContext, installFakeAudioContext } from "./helpers/fakeAudio";
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

/**
 * A player for the view's criteria.
 *
 * ⭐ `pause` is a **required** part of the seam and defaults to a double here: the button is labelled Pause while the
 * transport runs, so a player that cannot pause is a player that would have to lie about that press. A criterion that
 * wants to watch the pause itself passes its own.
 */
function renderTransportView(player: Omit<ArrangementPlayer, "pause"> & { pause?: ArrangementPlayer["pause"] }) {
  localStorage.setItem("groove_language", "en");
  const withPause: ArrangementPlayer = { pause: vi.fn(() => 0), ...player };
  const rendered = render(
    <LanguageProvider>
      <ArrangementViewV2 songId="s" capture={noCapture} player={withPause} />
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

  it("toggles: a press while the transport is running pauses it rather than compiling the arrangement again", () => {
    const { transport, emit } = makeTransport();
    const play = vi.fn(async () => ({ planned: 1 }));
    const stop = vi.fn(() => 0);
    const pause = vi.fn(() => 0);
    renderTransportView({ play, stop, transport, pause });

    act(() => emit({ step: 8, playing: true }));
    fireEvent.click(screen.getByTestId("arrangement-play"));

    /**
     * ⭐ **The press the owner reported.** The button says Pause while the transport runs, so this press must reach
     * `pause` — the control that holds the position — and not `stop`, which is the rewind. One press, one effect, and
     * no re-compile over a running transport.
     */
    expect(play).toHaveBeenCalledTimes(0);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(0);

    // And Stop itself goes through the other one, which is still the only control that goes back to the top.
    act(() => emit({ step: 8, playing: true }));
    fireEvent.click(screen.getByTestId("arrangement-stop"));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
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

/**
 * ⭐ **The owner's report, as a criterion: "the button says Pause and behaves like Stop — the playhead jumps back to the top."**
 *
 * The whole chain is real here — the rendered `ArrangementViewV2`, `createArrangementPlayer`, and an `AudioEngine` driven on the
 * strict fake `AudioContext` (`audioScheduler.test.ts` records why that harness exists). Nothing is faked between the press and the
 * reading, so the two readings below are the answer to *"does the button a user presses actually pause?"* and not a restatement of
 * the code.
 *
 * The readings are exactly the two the report is about: `arrangement-playhead`'s `left` (the picture) and `arrangement-position`'s
 * text (the `1.x` timecode). The step is the engine's own `getCurrentStep()`, which is where both of them come from.
 *
 * **Falsifiable by the reading, not by the intent**: on the build that was reported, the pause press takes the step from 8 to 0
 * and the playhead from `32px` to `0px`; the assertion after it is the criterion.
 */
describe("the Pause button pauses — it does not stop and rewind to the top", () => {
  let restore: (() => void) | null = null;

  beforeEach(() => {
    restore = installFakeAudioContext();
  });

  afterEach(() => {
    restore?.();
    restore = null;
    vi.restoreAllMocks();
  });

  /** Drives the real look-ahead loop forward without a real audio clock — the same helper `audioScheduler.test.ts` uses. */
  function advance(engine: AudioEngine, ctx: FakeAudioContext, seconds: number, tickSeconds = 0.025) {
    const ticks = Math.max(1, Math.round(seconds / tickSeconds));
    const scheduler = engine as unknown as { schedulerLoop: () => void };
    for (let i = 0; i < ticks; i++) {
      ctx.currentTime += tickSeconds;
      scheduler.schedulerLoop();
    }
  }

  it("holds the step, the playhead and the timecode, and continues from there on the next Play", async () => {
    const engine = new AudioEngine();
    engine.setBpm(120);
    const ctx = engine.getAudioContext() as unknown as FakeAudioContext;

    /**
     * The timeline the app publishes to other windows (`wangda_audio_bus`), read through the bus's own local fan-out.
     *
     * ⭐ **`CLOCK_SYNC` carries the step**, and `play` publishes one through `setBpm` before the transport starts — so the
     * timeline itself says which step each start began from, which is the evidence a press either rewound or did not.
     */
    const timeline: Array<{ type: string; step?: number }> = [];
    const unsubscribeTimeline = ecosystemBus.subscribe((message) =>
      timeline.push({ type: message.type, ...(message.type === "CLOCK_SYNC" ? { step: message.currentStep } : {}) })
    );

    const player = createArrangementPlayer({ engine, loadCatalogue: async () => ({ assets: [] }) });
    renderTransportView(player);

    const button = () => screen.getByTestId("arrangement-play") as HTMLButtonElement;
    const readStep = () => engine.getCurrentStep();
    const readPlayhead = () => (screen.getByTestId("arrangement-playhead") as HTMLElement).style.left;
    const readPosition = () => screen.getByTestId("arrangement-position").textContent;
    /**
     * The view's own mapping from a step to a picture: a bar is `stepsPerBarFor("4/4")` = 16 steps and the default zoom is
     * 64 px per bar, which `arrangementTransport.test.tsx`'s playhead criterion already pins.
     */
    const leftForStep = (step: number) => `${(step / 16) * 64}px`;

    /** One animation frame, so the engine's own `startPlayheadSync` reports the step the view draws from. */
    const followTransport = async () => {
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      });
    };

    // ---- Play, and let it run. --------------------------------------------------------------
    await act(async () => {
      fireEvent.click(button());
    });
    expect(engine.getIsPlaying()).toBe(true);
    expect(button().textContent).toBe("Pause");

    act(() => advance(engine, ctx, 1.0));
    await followTransport();

    const playedStep = readStep();
    type Reading = { step: number; playhead: string; position: string | null; stopDisabled: boolean };
    /**
     * ⭐ The three position readings plus the one button fact: **whether Stop is live at that moment**. It is captured
     * per row rather than asserted at the end because it is a state, not a value — the press itself changes it, and a
     * check made afterwards would be reading the wrong moment.
     */
    const readStop = () => (screen.getByTestId("arrangement-stop") as HTMLButtonElement).disabled;
    const snapshot = (): Reading => ({ step: readStep(), playhead: readPlayhead(), position: readPosition(), stopDisabled: readStop() });
    const readings: Record<string, Reading> = {
      "after Play + 1.0s": { step: playedStep, playhead: readPlayhead(), position: readPosition(), stopDisabled: readStop() },
    };
    // The transport really moved, so the readings below are about a position worth holding rather than about zero.
    expect(playedStep).toBeGreaterThan(0);
    expect(readings["after Play + 1.0s"]!.playhead).not.toBe("0px");
    expect(readings["after Play + 1.0s"]!.position).not.toBe("1.1");

    // ---- The reported press: Pause. ---------------------------------------------------------
    await act(async () => {
      fireEvent.click(button());
    });
    readings["after Pause"] = snapshot();
    expect(engine.getIsPlaying()).toBe(false);
    expect(button().textContent).toBe("Play");

    // ---- Play again: it must continue, not restart. -----------------------------------------
    await act(async () => {
      fireEvent.click(button());
    });
    readings["after Play again"] = snapshot();
    act(() => advance(engine, ctx, 0.5));
    await followTransport();
    readings["after Play again + 0.5s"] = snapshot();

    // ---- Pause once more, so Stop is pressed from the paused state the report is about. ------
    await act(async () => {
      fireEvent.click(button());
    });
    readings["after second Pause"] = snapshot();

    // ---- Stop is the control that rewinds, and it still does. -------------------------------
    await act(async () => {
      fireEvent.click(screen.getByTestId("arrangement-stop"));
    });
    readings["after Stop"] = snapshot();

    unsubscribeTimeline();
    // eslint-disable-next-line no-console -- the readings are the evidence this criterion exists to produce
    console.log("PAUSE_RESUME_READINGS", JSON.stringify({ readings, timeline }));

    /**
     * ⭐ **The claim, in the order the report states it.**
     *
     * 1. Pause **holds the step exactly** — this is the assertion the reported build failed, with 10 against 0;
     * 2. and the picture is *of that held step* rather than of the top: the playhead and the timecode agree with the
     *    transport instead of being rewound to `0px` / `1.1`. (The playhead may legitimately catch up across the press,
     *    because the steps the look-ahead had already scheduled are reported on the frames that follow — it must never
     *    go *back*.)
     * 3. The next Play continues from the held step and keeps moving; it does not restart at the top.
     * 4. **The way back stays open from the paused state** — Stop's enabled state used to be `!playing`, which was
     *    only correct while Pause *was* a stop; with a real pause that left the arrangement unable to return to the top
     *    from the state the user is most likely to be in, which is the same missing action the studio's Stop restores.
     * 5. Stop is still the control that returns to the top, and it works **from that paused state**.
     */
    const held = readings["after Pause"]!;
    expect(held.step).toBe(playedStep);
    // The picture is *of the held step*, because the pause report carries the engine's own step at that instant.
    expect(held.playhead).toBe(leftForStep(playedStep));
    expect(held.position).not.toBe("1.1");
    // ⭐ The paused transport has a position, so its Stop is live — and it was dead before the play, at the top.
    expect(readings["after Play + 1.0s"]!.stopDisabled).toBe(false);
    expect(held.stopDisabled).toBe(false);

    const resumed = readings["after Play again"]!;
    const moved = readings["after Play again + 0.5s"]!;
    expect(resumed.step).toBeGreaterThanOrEqual(playedStep);
    expect(resumed.playhead).not.toBe("0px");
    expect(resumed.position).not.toBe("1.1");
    // And it keeps going *forward* from where it was held, rather than starting over at the top.
    expect(moved.step).toBeGreaterThan(playedStep);
    expect(Number.parseFloat(moved.playhead)).toBeGreaterThan(Number.parseFloat(held.playhead));
    expect(moved.position).not.toBe("1.1");

    // The second pause held a later position, and the Stop after it is the press this criterion's last row records.
    const repaused = readings["after second Pause"]!;
    expect(repaused.step).toBe(moved.step);
    expect(repaused.playhead).not.toBe("0px");
    // Back at the top, and the control that took it there is dead again — nothing left to return from.
    expect(readings["after Stop"]).toEqual({ step: 0, playhead: "0px", position: "1.1", stopDisabled: true });
  });
});
