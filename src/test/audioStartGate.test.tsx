import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AUDIO_STARTED_KEY, AudioStartGate, audioGateCompleted } from "../components/AudioStartGate";

/**
 * The entry gate exists because browsers only start audio inside a gesture.
 *
 * Two properties matter: it shows on a first visit and **not** on later ones (a splash that reappears is a bug, not a
 * safety feature), and the tap runs the probes where a real gesture exists — which is what lets the GS-1 verdict be a
 * measurement instead of `unmeasured`.
 */
describe("the audio start gate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows on a first visit and remembers the tap", async () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    render(
      <AudioStartGate onStart={onStart}>
        <div data-testid="app">app</div>
      </AudioStartGate>
    );
    expect(screen.getByTestId("audio-start-gate")).toBeTruthy();
    // The app is rendered underneath, not held back: the gate is an overlay, and a slow probe must not hide the app.
    expect(screen.getByTestId("app")).toBeTruthy();

    fireEvent.click(screen.getByTestId("audio-start-button"));
    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId("audio-start-gate")).toBeNull());
    expect(localStorage.getItem(AUDIO_STARTED_KEY)).toBe("1");
    expect(audioGateCompleted()).toBe(true);
  });

  it("stays out of the way once it has been completed", () => {
    localStorage.setItem(AUDIO_STARTED_KEY, "1");
    render(
      <AudioStartGate>
        <div data-testid="app">app</div>
      </AudioStartGate>
    );
    expect(screen.queryByTestId("audio-start-gate")).toBeNull();
    expect(screen.getByTestId("app")).toBeTruthy();
  });

  it("closes even when the work behind the button fails", async () => {
    // Refusing to enter the app because a capability probe threw would be a worse bug than the one it is probing for.
    const onStart = vi.fn().mockRejectedValue(new Error("no audio here"));
    render(
      <AudioStartGate onStart={onStart}>
        <div data-testid="app">app</div>
      </AudioStartGate>
    );
    fireEvent.click(screen.getByTestId("audio-start-button"));
    await waitFor(() => expect(screen.queryByTestId("audio-start-gate")).toBeNull());
    expect(screen.getByTestId("app")).toBeTruthy();
  });
});
