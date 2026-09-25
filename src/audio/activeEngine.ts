/**
 * The one place the entry screen can reach the running engine.
 *
 * The start gate sits above the app (it has to: it is the first thing a visitor sees) and the engine is created
 * further down, inside the studio's lifecycle. The gate's job is to start audio **inside the tap**, which means it
 * needs the engine at that moment — so the engine registers itself here for as long as it lives and unregisters when
 * it is destroyed. One slot, cleared on teardown, so a destroyed engine is never reachable (the same rule the probe
 * seam follows).
 */
import type { AudioEngine } from "./AudioEngine";

let active: AudioEngine | null = null;

export function setActiveAudioEngine(engine: AudioEngine | null): void {
  active = engine;
}

export function getActiveAudioEngine(): AudioEngine | null {
  return active;
}
