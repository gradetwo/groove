/**
 * Haptic feedback utility using Web Vibration API (navigator.vibrate)
 * Provides subtle tactile "impact feel" (打击感) for mobile and touch interactions.
 * Safe against permissions policy restrictions and non-touch/desktop environments.
 */

export function triggerHaptic(pattern: number | number[] = 10): void {
  try {
    if (
      typeof window !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Graceful silent fallback on unsupported devices or iframe permission blocks
  }
}

export const HapticPatterns = {
  tap: 10,                 // Light tap for pad toggle / step click
  accent: 18,              // Stronger punch for accent toggle / downbeat
  doubleTap: [12, 35, 12], // Distinct vibration for long press context menu
  undoRedo: 14,            // Tactile confirmation for Undo/Redo
  slider: 8,               // Subtle tick for dragging velocity or ruler
  modeSwitch: 15,          // Tool or tab switch
  playPause: 16,           // Transport button press
};
