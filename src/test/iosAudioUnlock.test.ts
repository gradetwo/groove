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

  it("resumes a context the system interrupted, on any platform", () => {
    /**
     * The report was "lock the phone and come back and it is silent", and the code had two ways to produce exactly that:
     * the foreground handler returned early unless the device was an iPhone, and it only resumed when the state was exactly
     * `"suspended"` — while Safari reports `"interrupted"` after a lock screen, a state the TypeScript union does not name.
     *
     * This drives both halves: an Android-shaped environment (no iOS media channel) with an interrupted context must still
     * be resumed, both when the context announces the interruption and when the page comes back to the foreground.
     */
    // The constructor is private by design: one unlocker per page.
    const unlocker = IosAudioUnlocker.getInstance();
    const mockResume = vi.fn().mockResolvedValue(undefined);
    const listeners = new Map<string, EventListener>();
    const mockCtx = {
      state: "interrupted",
      resume: mockResume,
      addEventListener: (type: string, handler: EventListener) => listeners.set(type, handler),
      removeEventListener: () => undefined,
    } as unknown as AudioContext;

    unlocker.setAudioContext(mockCtx);
    unlocker.init();

    // The system interrupts it: `statechange` alone must be enough.
    listeners.get("statechange")?.(new Event("statechange"));
    expect(mockResume).toHaveBeenCalledTimes(1);

    /**
     * …and coming back to the foreground must too, without waiting for another interrupt. `document.hidden` is a getter in
     * jsdom, so the visibility state is stubbed rather than assigned.
     */
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const focused = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    // The visibility handler is registered on , not on the context; the map above only sees the context.
    document.dispatchEvent(new Event("visibilitychange"));
    expect(mockResume.mock.calls.length).toBeGreaterThanOrEqual(2);
    hidden.mockRestore();
    focused.mockRestore();

    unlocker.dispose();
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
