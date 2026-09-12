import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isIosDevice, IosAudioUnlocker, initIosAudioUnlock, SILENCE_MP3_DATA_URI } from "../audio/iosAudioUnlock";

describe("iOS Hardware Silent Switch Bypass (iosAudioUnlock)", () => {
  const originalUserAgent = navigator.userAgent;
  const originalMaxTouchPoints = navigator.maxTouchPoints;

  afterEach(() => {
    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: originalMaxTouchPoints,
      configurable: true,
    });
    IosAudioUnlocker.getInstance().dispose();
  });

  it("detects iPhone devices correctly", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15",
      configurable: true,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: 5,
      configurable: true,
    });
    expect(isIosDevice()).toBe(true);
  });

  it("detects iPad and iPadOS desktop-mode correctly", () => {
    // iPadOS 13+ reports MacIntel in userAgent but has touch points
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      configurable: true,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: 5,
      configurable: true,
    });
    expect(isIosDevice()).toBe(true);
  });

  it("returns false on Desktop and Android", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      configurable: true,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      value: 0,
      configurable: true,
    });
    expect(isIosDevice()).toBe(false);
  });

  it("generates a valid silent MP3 data URI", () => {
    expect(SILENCE_MP3_DATA_URI.startsWith("data:audio/mpeg;base64,")).toBe(true);
    const b64 = SILENCE_MP3_DATA_URI.replace("data:audio/mpeg;base64,", "");
    const decoded = atob(b64);
    expect(decoded.length).toBeGreaterThan(100);
  });

  it("initializes singleton and handles unlock and context resume gracefully", () => {
    const unlocker = initIosAudioUnlock();
    expect(unlocker).toBeDefined();

    const mockResume = vi.fn().mockResolvedValue(undefined);
    const mockCtx = {
      state: "suspended",
      resume: mockResume,
    } as unknown as AudioContext;

    unlocker.setAudioContext(mockCtx);
    unlocker.unlock();

    expect(mockResume).toHaveBeenCalled();
  });
});
