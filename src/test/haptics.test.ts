import { describe, it, expect, vi, beforeEach } from "vitest";

// Dynamic imports so we can reset module-level singleton state between tests
async function loadHaptics() {
  return await import("../utils/haptics");
}

describe("Haptic Engine (P8-01)", () => {
  beforeEach(() => {
    // Provide a mock for navigator.vibrate
    Object.defineProperty(navigator, "vibrate", {
      value: vi.fn(() => true),
      writable: true,
      configurable: true,
    });
    localStorage.clear();
  });

  it("triggerHaptic calls navigator.vibrate with scaled value", async () => {
    const { triggerHaptic, setHapticEnabled, setHapticIntensity } = await loadHaptics();
    setHapticEnabled(true);
    setHapticIntensity(1.0);
    triggerHaptic(20);
    expect(navigator.vibrate).toHaveBeenCalledWith(20);
  });

  it("does NOT vibrate when disabled", async () => {
    const { triggerHaptic, setHapticEnabled } = await loadHaptics();
    setHapticEnabled(false);
    (navigator.vibrate as ReturnType<typeof vi.fn>).mockClear();
    triggerHaptic(10);
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it("scales vibration duration by intensity", async () => {
    const { triggerHaptic, setHapticEnabled, setHapticIntensity } = await loadHaptics();
    setHapticEnabled(true);
    setHapticIntensity(0.5);
    triggerHaptic(20);
    expect(navigator.vibrate).toHaveBeenCalledWith(10); // 20 * 0.5 = 10
  });

  it("scales array pattern — only vibration durations, not pauses", async () => {
    const { triggerHaptic, setHapticEnabled, setHapticIntensity } = await loadHaptics();
    setHapticEnabled(true);
    setHapticIntensity(0.5);
    triggerHaptic([20, 40, 20]); // [vib, pause, vib]
    expect(navigator.vibrate).toHaveBeenCalledWith([10, 40, 10]);
  });

  it("persists settings to localStorage", async () => {
    const { setHapticEnabled, setHapticIntensity } = await loadHaptics();
    setHapticEnabled(false);
    setHapticIntensity(0.3);
    const raw = localStorage.getItem("groove_haptic_settings_v1");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.enabled).toBe(false);
    expect(parsed.intensity).toBeCloseTo(0.3);
  });

  it("getHapticSettings returns current state", async () => {
    const { getHapticSettings, setHapticEnabled, setHapticIntensity } = await loadHaptics();
    setHapticEnabled(true);
    setHapticIntensity(0.8);
    const s = getHapticSettings();
    expect(s.enabled).toBe(true);
    expect(s.intensity).toBeCloseTo(0.8);
  });

  it("HapticPatterns has all required pattern keys", async () => {
    const { HapticPatterns } = await loadHaptics();
    expect(HapticPatterns.lightTap).toBeDefined();
    expect(HapticPatterns.tap).toBeDefined();
    expect(HapticPatterns.accent).toBeDefined();
    expect(HapticPatterns.heavyThud).toBeDefined();
    expect(HapticPatterns.doubleTap).toBeDefined();
    expect(HapticPatterns.undoRedo).toBeDefined();
    expect(HapticPatterns.slider).toBeDefined();
    expect(HapticPatterns.sliderSnap).toBeDefined();
    expect(HapticPatterns.modeSwitch).toBeDefined();
    expect(HapticPatterns.playPause).toBeDefined();
    expect(HapticPatterns.correctAnswer).toBeDefined();
    expect(HapticPatterns.wrongAnswer).toBeDefined();
    expect(HapticPatterns.exportComplete).toBeDefined();
    expect(HapticPatterns.metronomeClick).toBeDefined();
    expect(HapticPatterns.metronomeBeat1).toBeDefined();
  });

  it("clamps intensity to 0–1 range", async () => {
    const { setHapticIntensity, getHapticSettings } = await loadHaptics();
    setHapticIntensity(2.5);
    expect(getHapticSettings().intensity).toBe(1);
    setHapticIntensity(-0.5);
    expect(getHapticSettings().intensity).toBe(0);
  });
});
