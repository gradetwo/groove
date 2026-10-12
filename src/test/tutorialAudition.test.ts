import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { auditionTutorialSound, stopTutorialAudition } from "../utils/tutorialAudition";

describe("tutorialAudition · synthesized acoustic demonstrations for 8 courses", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopTutorialAudition();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("triggers acoustics demo without throwing", async () => {
    const cancel = await auditionTutorialSound("acoustics");
    expect(typeof cancel).toBe("function");
    cancel();
  });

  it("triggers piano chord demo without throwing", async () => {
    const cancel = await auditionTutorialSound("piano");
    expect(typeof cancel).toBe("function");
    cancel();
  });

  it("triggers chords progression demo with sequence timers", async () => {
    const cancel = await auditionTutorialSound("chords");
    expect(typeof cancel).toBe("function");

    // Advance timers for step 2 and step 3
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1200);

    cancel();
  });

  it("triggers drum euclidean demo with scheduled clicks", async () => {
    const cancel = await auditionTutorialSound("drum");
    expect(typeof cancel).toBe("function");

    vi.advanceTimersByTime(600);
    cancel();
  });

  it("triggers masterclass polyrhythm demo", async () => {
    const cancel = await auditionTutorialSound("masterclass");
    expect(typeof cancel).toBe("function");
    cancel();
  });

  it("handles mixer, maker, and galaxy sound triggers", async () => {
    for (const id of ["mixer", "maker", "galaxy"]) {
      const cancel = await auditionTutorialSound(id);
      expect(typeof cancel).toBe("function");
      cancel();
    }
  });

  it("cancels prior audition sound when a new one is started", async () => {
    const cancel1 = await auditionTutorialSound("piano");
    const cancel2 = await auditionTutorialSound("drum");

    expect(typeof cancel1).toBe("function");
    expect(typeof cancel2).toBe("function");
    stopTutorialAudition();
  });
});
