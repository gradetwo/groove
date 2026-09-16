/**
 * One switch, many surfaces (item ⑤).
 *
 * The user's report was "I cannot see a global switch for the new architecture's voices". The
 * switch did exist — but it lived in the studio toolbar's collapsed drawer, and each surface kept
 * its own `useState` copy of the value. That is the shape of a bug waiting to happen: flip it in
 * the settings panel and the toolbar chip still says ON.
 *
 * `useGs1Setting` subscribes to the module state the schedulers actually read, so these tests
 * assert that whichever surface flips it, all of them re-render together, that the engine's
 * persistence is written, and that a freshly mounted surface reads the real value rather than a
 * default.
 */
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AudioEngine } from "../audio/AudioEngine";
import { useGs1Setting } from "../features/sequencer/useGs1Setting";
import {
  DEFAULT_GS1_ROUTING_ENABLED,
  isGs1RoutingEnabled,
  setGs1RoutingEnabled,
} from "../audio/gs1/gs1Tracks";

/** One UI surface that displays and flips the shared switch (toolbar chip, settings tab, …). */
const Surface: React.FC<{ label: string; engine: AudioEngine | null }> = ({ label, engine }) => {
  const [enabled, setEnabled] = useGs1Setting(engine);
  return (
    <button data-testid={`surface-${label}`} aria-pressed={enabled} onClick={() => setEnabled(!enabled)}>
      {label}:{String(enabled)}
    </button>
  );
};

const pressed = (label: string) => screen.getByTestId(`surface-${label}`).getAttribute("aria-pressed");

afterEach(() => {
  setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED);
  localStorage.clear();
});

describe("useGs1Setting · one source of truth", () => {
  it("ships on, and every surface starts from the real routing state", () => {
    const engine = new AudioEngine();
    render(
      <>
        <Surface label="toolbar" engine={engine} />
        <Surface label="settings" engine={engine} />
        <Surface label="about" engine={engine} />
      </>
    );
    // Default-on is a product decision (v2.0.16) and each surface must say so, not guess.
    expect(pressed("toolbar")).toBe("true");
    expect(pressed("settings")).toBe("true");
    expect(pressed("about")).toBe("true");
  });

  it("re-renders every surface when one of them flips the switch", () => {
    const engine = new AudioEngine();
    render(
      <>
        <Surface label="toolbar" engine={engine} />
        <Surface label="settings" engine={engine} />
        <Surface label="about" engine={engine} />
      </>
    );

    fireEvent.click(screen.getByTestId("surface-settings"));
    expect(pressed("toolbar")).toBe("false");
    expect(pressed("about")).toBe("false");

    fireEvent.click(screen.getByTestId("surface-toolbar"));
    expect(pressed("settings")).toBe("true");
    expect(pressed("about")).toBe("true");
  });

  it("writes through the engine, so the choice persists and the schedulers see it", () => {
    const engine = new AudioEngine();
    render(<Surface label="settings" engine={engine} />);

    fireEvent.click(screen.getByTestId("surface-settings"));
    expect(isGs1RoutingEnabled()).toBe(false);
    const stored = JSON.parse(localStorage.getItem("groove_audio_settings_v1") ?? "{}");
    expect(stored.gs1Enabled).toBe(false);

    // And a reloaded engine adopts the persisted value.
    const reloaded = new AudioEngine();
    expect(reloaded.isGs1Enabled()).toBe(false);
  });

  it("gives a surface that mounts later the real value, not a default", () => {
    const engine = new AudioEngine();
    setGs1RoutingEnabled(false); // as if the settings panel had flipped it while this was closed

    render(<Surface label="late" engine={engine} />);
    expect(pressed("late")).toBe("false");
  });

  it("still flips the shared state when no engine exists yet", () => {
    // First paint can precede the engine; the switch must not silently do nothing.
    render(<Surface label="early" engine={null} />);
    fireEvent.click(screen.getByTestId("surface-early"));
    expect(isGs1RoutingEnabled()).toBe(false);
    expect(pressed("early")).toBe("false");
  });
});
