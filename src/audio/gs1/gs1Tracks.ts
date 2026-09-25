/**
 * GS-1 track routing: which tracks are voiced by GS-1, and when each note sounds (P6, Phase 2).
 *
 * This module is the piece both engines share, and it exists as a *pure core* plus a thin
 * lifecycle wrapper so that the risky part — the frame arithmetic that keeps GS-1 notes aligned
 * with sample-accurate native voices — can be tested without an audio graph.
 *
 * ## Why a planner instead of "play now"
 *
 * The worklet accepts frame-addressed events (`noteAt` / `noteOffAt`, GS-1 v2.1.5) and reports the
 * constant voice-start latency it adds (`scheduledNoteLatencyFrames`, one render quantum). So a
 * caller that wants a note at time `t` must ask for it at `t - latency`. That subtraction is the
 * whole difference between "in the pocket" and "2.7 ms late on every note", it applies identically
 * in live playback and in the offline renderer, and it is therefore in one function with tests.
 *
 * ## Why it is off by default
 *
 * Enabling GS-1 for `chords`/`lead` **changes the sound of most genres** (different synthesis,
 * different patches) and its patches have never been compared by ear against the native presets —
 * the repository cannot measure "sounds better". Shipping it enabled would therefore change 159
 * genres on a judgement nobody has verified, and would invalidate the measured timbre baseline.
 * The switch is therefore explicit: the code path is complete and tested, and turning it on is a
 * deliberate act with a documented cost (re-measure loudness + timbre, re-fit trims).
 */
import type { MixTrackId } from "../../data/genreMix";
import { resolveGs1Patch, type Gs1Patch, type Gs1PatchName } from "../../data/gs1Patches";

/** Voices the E3 measurement says one GS-1 instance can sustain alongside the full 8-track app. */
export const GS1_POLYPHONY_CEILING = 8;
/** Roles GS-1 voices. Everything else stays on the native engine (see `gs1Patches.ts`). */
/**
 * Track ids GS-1 voices. `texture` is deliberately **not** here: it is not a `MixTrackId` — a texture lane is an `fx`
 * lane whose *instrument* names a recording (`GS1_TEXTURE_ROUTING`), and this list is what gates and UI code use to ask
 * "could this track be GS-1". The role reaches `planGs1Notes` as a string from that lane.
 */
export const GS1_ROUTED_ROLES: readonly MixTrackId[] = ["chords", "lead"];

/**
 * Whether `chords`/`lead` are voiced by GS-1.
 *
 * **On by default** (the user's call): GS-1 is what these two roles were waiting for — real
 * polyphony, independent filter envelopes, unison — and the native engine remains the fallback for
 * every note GS-1 cannot take. The audio-settings panel carries the switch
 * (`AudioEngine.setGs1Enabled`), so a user who prefers the previous sound turns it off once and
 * the choice persists.
 *
 * The initial value here is the *default*; `AudioEngine` applies the stored setting at
 * construction, and the two must agree (`DEFAULT_GS1_ROUTING_ENABLED`).
 */
export const DEFAULT_GS1_ROUTING_ENABLED = true;
let routingEnabled = DEFAULT_GS1_ROUTING_ENABLED;

/** True while GS-1 voices `chords`/`lead`. */
export function isGs1RoutingEnabled(): boolean {
  return routingEnabled;
}

/**
 * Listen for routing-switch changes.
 *
 * The switch is read by the schedulers (module state) *and* displayed by the UI (the toolbar
 * chip, the audio tab, the About tab). Without a subscription each of those keeps its own copy
 * and they drift the moment one of them writes — the toolbar would say ON while the settings
 * panel said OFF. Kept React-free here; `useGs1Setting` adapts it to `useSyncExternalStore`.
 */
const routingListeners = new Set<(enabled: boolean) => void>();

export function subscribeGs1Routing(listener: (enabled: boolean) => void): () => void {
  routingListeners.add(listener);
  return () => routingListeners.delete(listener);
}

/** Applied by the audio settings on load and when the user flips the toggle. */
export function setGs1RoutingEnabled(enabled: boolean): void {
  if (routingEnabled === enabled) return;
  routingEnabled = enabled;
  for (const listener of routingListeners) listener(enabled);
}

/** One note of a planned chord/lead event, in absolute context frames. */
export interface Gs1PlannedNote {
  note: number;
  /** Absolute frame at which the voice should *start* sounding. */
  atFrame: number;
  /** Absolute frame at which the note is released. */
  offFrame: number;
  velocity: number;
  pan?: number;
  /** Per-note microtuning in cents (ABI 9). See `PoolNote.cents`. */
  cents?: number;
}

export interface Gs1Plan {
  patch: Gs1PatchName;
  params: Gs1Patch;
  notes: Gs1PlannedNote[];
}

export interface Gs1PlanOptions {
  role: MixTrackId | string | null | undefined;
  /** The track's `instrument` name, which is what selects a patch. */
  instrument: string | null | undefined;
  /**
   * The genre, so a lane can be voiced the way **this genre** plays it (`GENRE_GS1_PATCH_OVERRIDES`).
   *
   * Optional, and absent means "the instrument table's answer": a caller that does not know the genre keeps working
   * exactly as before, which is what every existing test relies on.
   */
  genreId?: string | null;
  /** Note times in seconds, in the sound source's own timeline (`AudioContext` or offline). */
  notes: readonly {
    note: number;
    time: number;
    duration: number;
    velocity: number;
    pan?: number;
    /** Per-note microtuning in cents — carried through so A3's variation reaches the GS-1 voice (ABI 9). */
    cents?: number;
  }[];
  sampleRate: number;
  /**
   * The latency the worklet reported (frames). The planner subtracts it so the *audible* onset
   * lands on `time`; a caller that does not know it yet passes 0 and gets the un-compensated
   * schedule, which is still frame-accurate relative to its own notes.
   */
  latencyFrames?: number;
}

/**
 * Turn note times into frame-addressed GS-1 events, or `null` when this track must stay native.
 *
 * Total and side-effect free: an unrouted role, an instrument with no GS-1 patch, a disabled
 * routing switch, a nonsense sample rate or an empty note list all return `null`, which every
 * caller can treat as "use the native engine".
 */
export function planGs1Notes(options: Gs1PlanOptions): Gs1Plan | null {
  const { role, instrument, notes, sampleRate } = options;
  if (!routingEnabled) return null;
  if (!(sampleRate > 0) || !Number.isFinite(sampleRate)) return null;
  if (!notes || notes.length === 0) return null;
  /**
   * `texture` is a plan-able role since P2.5: the arrangement already has the lane (A4's risers fire on it), and its
   * instruments resolve to a **sample** patch rather than an oscillator. Nothing declares one yet — the mechanism
   * ships before the content — so this is the allow-list, not a claim that a genre uses it.
   */
  if (role !== "chords" && role !== "lead" && role !== "texture" && role !== "fx") return null;

  const resolved = resolveRoutedPatch(role, instrument, options.genreId);
  if (!resolved) return null;

  const latency = Math.max(0, Math.round(options.latencyFrames ?? 0));
  const planned: Gs1PlannedNote[] = [];
  for (const note of notes) {
    if (!Number.isFinite(note.time) || !Number.isFinite(note.duration)) return null;
    if (!Number.isFinite(note.velocity) || note.velocity <= 0) continue;
    // The voice starts `latency` frames after the event is applied, so the event is addressed
    // early by exactly that much. Clamped at 0: a note in the first block cannot be pulled
    // earlier than the render starts, and pretending otherwise would schedule it in the past.
    const atFrame = Math.max(0, Math.round(note.time * sampleRate) - latency);
    const offFrame = Math.max(atFrame + 1, Math.round((note.time + note.duration) * sampleRate) - latency);
    planned.push({
      note: Math.round(note.note),
      atFrame,
      offFrame,
      velocity: Math.min(1, Math.max(0, note.velocity)),
      ...(note.pan === undefined ? {} : { pan: note.pan }),
      ...(note.cents === undefined ? {} : { cents: note.cents }),
    });
  }
  if (planned.length === 0) return null;
  // Stable order, so live and offline schedule identically for the same input.
  planned.sort((a, b) => a.atFrame - b.atFrame || a.note - b.note);
  return { patch: resolved.patch, params: resolved.params, notes: planned };
}

/**
 * Drop the oldest notes until the plan fits the polyphony ceiling.
 *
 * A genre's chord voicing plus a lead can exceed eight voices (a five-note extension plus a
 * four-note lead stack), and the E3 measurement says eight is where one instance stops keeping
 * real time. The *newest* notes win: a dropped tail is heard as thinning, whereas dropping the
 * new notes would sound like a stuck chord.
 */
export function capPlanPolyphony(plan: Gs1Plan, ceiling = GS1_POLYPHONY_CEILING): Gs1Plan {
  if (plan.notes.length <= ceiling) return plan;
  const kept = [...plan.notes].sort((a, b) => a.atFrame - b.atFrame || a.note - b.note).slice(-ceiling);
  kept.sort((a, b) => a.atFrame - b.atFrame || a.note - b.note);
  return { ...plan, notes: kept };
}

/** Just the patch decision, for callers that only need to know whether GS-1 would voice a track. */
/**
 * The patch for a track, with the **texture fallback** P2.5 needs.
 *
 * A texture lane is an `fx` lane whose *instrument* names a recording (`GS1_TEXTURE_ROUTING`), so the role alone does
 * not decide: an instrument that appears in the texture table routes to its sample patch wherever it is found. That is
 * one rule in one place, and both the renderer and the live pool ask it — the alternative (each call site trying two
 * roles) is how a track ends up voiced by GS-1 in the file and by the native engine in the room.
 */
export function resolveRoutedPatch(
  role: string | null | undefined,
  instrument: string | null | undefined,
  genreId?: string | null
) {
  return resolveGs1Patch(role, instrument, genreId) ?? resolveGs1Patch("texture", instrument, genreId);
}

export function gs1PatchFor(
  role: string | null | undefined,
  instrument: string | null | undefined,
  genreId?: string | null
) {
  if (!routingEnabled) return null;
  return resolveRoutedPatch(role, instrument, genreId);
}

/** Whether a patch plays an **imported sample**, and therefore cannot sound until one is loaded. */
export function patchNeedsSample(patch: Gs1PatchName): boolean {
  return patch === "sampleTexture";
}
