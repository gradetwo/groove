/**
 * Haptic Engine (P8-01) — Web Vibration API tactile feedback system
 *
 * Provides hardware-grade percussion impact feel (打击感) for mobile
 * and touch interactions. Includes global on/off toggle, intensity
 * scaling (0–1), and localStorage persistence. Safe against permissions
 * policy restrictions and non-touch/desktop environments.
 */

const HAPTIC_SETTINGS_KEY = "groove_haptic_settings_v1";

export interface HapticSettings {
  enabled: boolean;
  intensity: number; // 0.0 – 1.0
}

// --------------- singleton state ---------------

let settings: HapticSettings = loadSettings();

function loadSettings(): HapticSettings {
  const defaults: HapticSettings = { enabled: true, intensity: 0.7 };
  if (typeof localStorage === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(HAPTIC_SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaults.enabled,
      intensity:
        typeof parsed.intensity === "number"
          ? Math.max(0, Math.min(1, parsed.intensity))
          : defaults.intensity,
    };
  } catch {
    return defaults;
  }
}

function saveSettings(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(HAPTIC_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore quota / policy errors
  }
}

// --------------- public API ---------------

export function getHapticSettings(): HapticSettings {
  return { ...settings };
}

export function setHapticEnabled(enabled: boolean): void {
  settings.enabled = enabled;
  saveSettings();
}

export function setHapticIntensity(intensity: number): void {
  settings.intensity = Math.max(0, Math.min(1, intensity));
  saveSettings();
}

/**
 * Fire a vibration pattern. Duration values are scaled by the current
 * intensity setting. Pause values in array patterns are preserved.
 */
export function triggerHaptic(pattern: number | number[] = 10): void {
  if (!settings.enabled) return;
  try {
    if (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      const scaled =
        typeof pattern === "number"
          ? Math.round(pattern * settings.intensity)
          : pattern.map((v, i) =>
              // Even indices = vibration duration, odd indices = pause
              i % 2 === 0 ? Math.round(v * settings.intensity) : v,
            );
      // Skip if scaled to zero
      const first = typeof scaled === "number" ? scaled : scaled[0];
      if (first === 0) return;
      navigator.vibrate(scaled);
    }
  } catch {
    // Graceful silent fallback on unsupported devices or iframe permission blocks
  }
}

// --------------- pattern presets ---------------

export const HapticPatterns = {
  /** Step grid cell toggle — ultra-light pad feel */
  lightTap: 8,
  /** General UI interaction */
  tap: 10,
  /** Accent toggle / stronger interaction */
  accent: 18,
  /** Downbeat / kick on beat 1 — heavy thud */
  heavyThud: 25,
  /** Long press / context menu — distinct double tap */
  doubleTap: [12, 35, 12] as number[],
  /** Undo / redo confirmation */
  undoRedo: 14,
  /** Slider detent / micro-tick */
  slider: 6,
  /** Slider hitting boundary snap */
  sliderSnap: [4, 20, 4] as number[],
  /** Tab / tool mode switch */
  modeSwitch: 15,
  /** Transport play / pause */
  playPause: 16,
  /** Challenge correct answer — celebratory double pulse */
  correctAnswer: [10, 30, 10] as number[],
  /** Challenge wrong answer — warning long buzz */
  wrongAnswer: [40] as number[],
  /** Export success — triple pulse */
  exportComplete: [8, 40, 8, 40, 8] as number[],
  /** Metronome sub-beat tick — very subtle */
  metronomeClick: 5,
  /** Metronome downbeat — stronger click */
  metronomeBeat1: 12,
} as const;
