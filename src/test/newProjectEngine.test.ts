/**
 * The engine behind `/new`.
 *
 * The defect this pins: that route renders the arrangement instead of the studio, and the engine used to be created only inside studio interfaces, so nothing constructed one — `player` stayed undefined and the button reported
 * "audio engine not connected yet". An interface that could not make a sound.
 *
 * Four properties matter, and each is a way the wiring can be wrong rather than merely absent:
 *
 *  1. it registers where the entry gate can reach it, since the gate sits above the app and starts audio inside its own tap;
 *  2. it primes on mount, because by the time this route renders the gate has usually already been tapped, and a tap that happened earlier cannot reach an engine created later;
 *  3. it clears the slot on unmount — but only when the slot is still its own, so leaving this route cannot unregister an engine that replaced it;
 *  4. the engine is released on unmount, so navigation does not leak a live AudioContext.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook } from "@testing-library/react";
import React from "react";
import { getActiveAudioEngine, setActiveAudioEngine } from "../audio/activeEngine";
import { NewProjectView, useNewProjectEngine } from "../views/NewProjectView";

/** Records the `player` the view hands the arrangement, which is exactly what the button's label depends on. */
let handedPlayer: unknown = "not rendered";

vi.mock("../components/arrangement/ArrangementViewV2", () => ({
  ArrangementViewV2: (props: { player?: unknown }) => {
    handedPlayer = props.player;
    return null;
  },
}));

const calls: string[] = [];

class FakeEngine {
  constructor() {
    calls.push("construct");
  }
  primeAudioContext() {
    calls.push("prime");
    return "suspended" as const;
  }
  stop() {
    calls.push("stop");
  }
  destroy() {
    calls.push("destroy");
  }
}

vi.mock("../audio/AudioEngine", () => ({
  AudioEngine: class {
    constructor() {
      return new FakeEngine() as unknown as object;
    }
  },
}));

beforeEach(() => {
  calls.length = 0;
  setActiveAudioEngine(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useNewProjectEngine", () => {
  it("registers the engine for the entry gate and primes it, since the gate's tap may already have happened", () => {
    renderHook(() => useNewProjectEngine());
    // Registration is what lets the gate start audio in its own tap; priming is for the case where that tap is behind us.
    expect(getActiveAudioEngine()).toBeInstanceOf(FakeEngine);
    expect(calls).toEqual(["construct", "prime"]);
  });

  it("returns the engine, so the player is built from something rather than undefined", () => {
    const { result } = renderHook(() => useNewProjectEngine());
    // ⭐ The hook hands back the engine **and** its ref -- the MIDI input needs the ref, because a device event arrives after the
    // render that subscribed. The claim is unchanged: the player is built from a real engine rather than from undefined.
    expect(result.current.engine).toBeInstanceOf(FakeEngine);
  });

  it("clears the slot and releases the engine on unmount", () => {
    const { unmount } = renderHook(() => useNewProjectEngine());
    unmount();
    expect(getActiveAudioEngine()).toBeNull();
    // `stop` before `destroy`: a still-running transport must not rely on graph teardown to silence it.
    expect(calls).toEqual(["construct", "prime", "stop", "destroy"]);
  });

  it("does not clear a slot another engine took over, because leaving a route must not unregister its replacement", () => {
    const { unmount } = renderHook(() => useNewProjectEngine());
    const replacement = new FakeEngine();
    setActiveAudioEngine(replacement as never);
    unmount();
    // The studio registers its own engine in the same commit when switching routes; clearing unconditionally would leave the gate with nothing registered.
    expect(getActiveAudioEngine()).toBe(replacement);
  });
});

describe("NewProjectView", () => {
  it("hands the arrangement a player, so the button no longer reports the engine as missing", () => {
    handedPlayer = "not rendered";
    render(React.createElement(NewProjectView, { capture: async () => ({ ok: false, refusal: "unsupported", summary: "test" }) as never }));
    // `undefined` here is the state the owner photographed: `Play (audio engine not connected yet)`.
    expect(handedPlayer).toBeDefined();
  });
});
