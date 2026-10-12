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
import { gs1VelocityRoute, resolveGs1Patch, type Gs1Patch, type Gs1PatchName } from "../../data/gs1Patches";
import { MAX_ROUTES } from "../../../vendor/gs1/src/audio/params";
import { decodeGs1PatchCode, type Gs1PatchRoute } from "./gs1PatchCode";
import {
  applyGs1ParamOverrides,
  gs1OverridesKey,
  hasGs1Overrides,
  resolveGs1PatchOverrides,
  type ResolvedGs1Overrides,
} from "./gs1ParamOverrides";
import type { Gs1Host } from "./Gs1Host";

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

/**
 * One lane's resolved GS-1 sound.
 *
 * `patch` is the named table patch, or `null` when the lane carries its **own share code** — which
 * is why `params` cannot be derived from `patch` and every consumer must take the record from here.
 * This type is the value that crosses the single resolution seam: host creation and note planning
 * are handed the *same* object, not two lookups that are expected to agree.
 */
export interface Gs1Voice {
  /** The named patch from `GS1_PATCHES`, or `null` for a lane's own share code. */
  patch: Gs1PatchName | null;
  params: Gs1Patch;
  /** The native preset's velocity-to-cutoff response. Unused when `routes` is present. */
  velToCutoff?: number;
  /** The lane's own share code, when it carried one. Also the patch's identity for a swap check. */
  code?: string;
  /**
   * The code's own modulation routes, in the core's integer wire form.
   *
   * A share code from `gs1.patch.get` carries the synth's routing (up to eight rows); applying the
   * table patch's velocity response *instead* would render something the synth's own `gs1.render`
   * would not, which is the same lie as ignoring the code's parameters.
   */
  routes?: Gs1PatchRoute[];
  /**
   * This lane's **per-parameter overrides**, resolved to the engine's own ids and wire values.
   *
   * Kept as a separate layer rather than folded into `params`: the base record is what `setPatch`
   * receives, these are what `setParam`/`setModRoute` receive after it, and the engine's own
   * `getParam` read-back is therefore the evidence that they landed (see `gs1ParamOverrides.ts` for
   * why route ② was chosen over re-encoding the code).
   */
  overrides?: ResolvedGs1Overrides;
}

export interface Gs1Plan {
  patch: Gs1PatchName | null;
  params: Gs1Patch;
  /** The native preset's velocity-to-cutoff response, carried so the pool can wire it with the patch. */
  velToCutoff?: number;
  /** The resolved code's own routes, when the lane carried a share code. */
  routes?: Gs1PatchRoute[];
  /** The lane's per-parameter overrides, carried so every host applies the same ones. */
  overrides?: ResolvedGs1Overrides;
  /**
   * The patch's identity for a live swap check: the share code when there is one, else the patch
   * name. `patch` alone cannot distinguish two different share codes, both of which are `null`.
   */
  patchKey: string | null;
  notes: Gs1PlannedNote[];
}

/**
 * What one lane resolves to — a voice, a deliberate stay on the native engine, or a **reported
 * problem**.
 *
 * The third arm is what makes the corruption visible. `resolveGs1Patch` is total and returns
 * `null` for an unknown instrument, which is right for a name that was never routed; but a lane
 * that carries a share code *asked* for a specific sound, so an unreadable code must not be
 * absorbed into that same `null`.
 */
export type LaneGs1Resolution =
  | { kind: "voice"; voice: Gs1Voice }
  | { kind: "native" }
  | {
      kind: "problem";
      /** The lane's share code, when the problem is with the code itself (absent for an override-only lane). */
      code?: string;
      problem: string;
    };

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
  /**
   * The lane's own GS-1 patch, as the synth's opaque **share code** (the string `gs1.patch.get`
   * returns). Optional: absent keeps the instrument-table answer exactly as before.
   */
  patchCode?: string;
  /**
   * The lane's per-parameter overrides, in the shape `SequencerTrack.gs1PatchOverrides` stores.
   *
   * Only used when this function resolves for itself (`voice` absent): a caller that already has a
   * resolved voice is carrying the overrides on it. Present so that a caller cannot pass a code and
   * have its overrides silently dropped by the self-resolving path.
   */
  overrides?: unknown;
  /**
   * An already-resolved voice, from {@link resolveGs1Lane}.
   *
   * Passing it is how the single seam is *enforced* rather than trusted: a caller that resolved the
   * lane to build its host hands the planner the same object, so the patch the host was given and
   * the patch the notes were planned under cannot drift apart. Omitting it makes this function
   * resolve for itself — which is what a caller that only has a role and an instrument wants.
   */
  voice?: Gs1Voice;
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

  /**
   * The one resolution: either the caller's already-resolved voice, or this module's own answer for
   * the same inputs. A `problem` (an explicit but unreadable code) returns `null` here — the caller
   * that collected it from {@link resolveGs1Lane} is the one that reports it, and playing the
   * native engine silently is exactly what that report exists to prevent.
   */
  const voice =
    options.voice ?? laneVoice(resolveGs1Lane(role, instrument, options.genreId, options.patchCode, options.overrides));
  if (!voice) return null;

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
  return {
    patch: voice.patch,
    params: voice.params,
    velToCutoff: voice.velToCutoff,
    ...(voice.routes ? { routes: voice.routes } : {}),
    ...(voice.overrides ? { overrides: voice.overrides } : {}),
    patchKey: patchKeyOf(voice),
    notes: planned,
  };
}

/** The voice arm of a resolution, or `null` for `native` **and** for `problem`. */
function laneVoice(resolution: LaneGs1Resolution): Gs1Voice | null {
  return resolution.kind === "voice" ? resolution.voice : null;
}

/** A voice's identity for a live swap check: the share code, else the named patch. */
export function patchKeyOf(voice: Gs1Voice): string | null {
  const base = voice.code ?? voice.patch;
  /**
   * …plus the overrides, when there are any. Two lanes can carry the **same** code with different
   * per-parameter overrides, and a swap check that compared codes alone would call the second lane
   * "the same sound" and never write its overrides (`Gs1VoicePool.tryPlay`). With no overrides the
   * key is exactly what it always was, so nothing else moves.
   */
  const overrides = gs1OverridesKey(voice.overrides);
  return overrides ? `${base ?? ""}#${overrides}` : base;
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

/**
 * ⭐ **The single resolution seam.** One lane — its role, instrument, genre, optional share code and
 * optional per-parameter overrides — becomes one {@link Gs1Voice}, or a reported reason why not.
 *
 * Before this function there were two lookups that were *expected* to agree: `WavExporter` resolved
 * a patch to build the host and `planGs1Notes` resolved one again to plan the notes. That is
 * harmless while the only input is `(role, instrument, genre)` — both call the same table — and
 * becomes the repository's "second sound" the moment a lane can carry its own patch, because an
 * override that reaches one of them and not the other renders a file that disagrees with the patch
 * that was applied.
 *
 * Three answers, and the third is the one that must not be collapsed into the second:
 *
 *   * `voice`   — play this;
 *   * `native`  — this lane was never GS-1's, exactly as `resolveGs1Patch`'s `null` has always meant;
 *   * `problem` — the lane **named a patch or an override** and it cannot be honoured. Never a silent
 *                 fall back to the native engine: that is what makes a typo invisible today.
 *
 * The overrides are resolved **here**, once, and travel on the voice: the exporter, the live pool and
 * `validate_pattern` all read this one answer, so an override cannot reach the room and miss the file.
 */
export function resolveGs1Lane(
  role: string | null | undefined,
  instrument: string | null | undefined,
  genreId?: string | null,
  patchCode?: string | null,
  overrideSetting?: unknown
): LaneGs1Resolution {
  const overrides = resolveGs1PatchOverrides(overrideSetting);
  if (!overrides.ok) {
    return {
      kind: "problem",
      ...(typeof patchCode === "string" && patchCode.trim() !== "" ? { code: patchCode } : {}),
      problem: `its per-parameter overrides cannot be read: ${overrides.problem}`,
    };
  }
  const overrideRows = overrides.overrides;

  if (typeof patchCode === "string" && patchCode.trim() !== "") {
    const decoded = decodeGs1PatchCode(patchCode);
    if (!decoded.ok) return { kind: "problem", code: patchCode, problem: decoded.problem };
    /**
     * A code on a lane the engine never schedules would be silence, not a sound: the exporter's
     * drum and bass branches never ask GS-1 for notes. Refusing it is the honest answer.
     */
    if (!GS1_SCHEDULED_ROLES.has(String(role))) {
      return {
        kind: "problem",
        code: patchCode,
        problem: `a "${String(role)}" lane is not voiced by GS-1, so a patch on it would never sound`,
      };
    }
    const routes =
      overrideRows.routes.length > 0
        ? withRouteOverrides(decoded.patch.routes, overrideRows)
        : decoded.patch.routes;
    return {
      kind: "voice",
      voice: {
        patch: null,
        params: decoded.patch.params,
        code: patchCode,
        ...(routes && routes.length ? { routes } : {}),
        ...(hasGs1Overrides(overrideRows) ? { overrides: overrideRows } : {}),
      },
    };
  }

  const resolved = resolveRoutedPatch(role, instrument, genreId);
  if (!resolved) {
    /**
     * A lane whose instrument the table keeps native, carrying overrides, is the same defect as a
     * share code on a `kick`: the caller named GS-1 parameters that GS-1 will never play. Reported,
     * not absorbed — an override that silently does nothing is worse than one that is refused.
     */
    if (hasGs1Overrides(overrideRows)) {
      const count = overrideRows.parameters.length + overrideRows.routes.length;
      return {
        kind: "problem",
        problem: `a "${String(role)}" lane with instrument "${String(instrument)}" is not voiced by GS-1, so its ${count} override${count === 1 ? "" : "s"} would never sound`,
      };
    }
    return { kind: "native" };
  }
  /**
   * The base routing is whatever `applyGs1VoiceRoutes` would have written with no overrides — the
   * table patch's velocity response on slot 0 — so a route override *layers* on the patch instead of
   * deleting its feel. With no route overrides `routes` stays absent, exactly as before.
   */
  const velocity = gs1VelocityRoute(resolved.velToCutoff);
  const routes = withRouteOverrides([], overrideRows, velocity ? { ...velocity, enabled: true } : null);
  return {
    kind: "voice",
    voice: {
      ...resolved,
      ...(routes ? { routes } : {}),
      ...(hasGs1Overrides(overrideRows) ? { overrides: overrideRows } : {}),
    },
  };
}

/** Roles GS-1 is actually scheduled for — the gate a patch or an override has to pass. */
const GS1_SCHEDULED_ROLES = new Set(["chords", "lead", "fx", "texture"]);

/**
 * The route rows a voice is wired with: the base patch's own rows, with the lane's route overrides
 * folded in **by slot**. `undefined` when the lane carries no route overrides, so every existing
 * voice keeps the exact routing it had.
 *
 * The array is deliberately left sparse when an override names a high slot with none below it:
 * `applyGs1VoiceRoutes` walks all eight slots and clears every hole, which is what stops a previous
 * patch's routing from lingering.
 */
function withRouteOverrides(
  base: readonly Gs1PatchRoute[],
  overrides: ResolvedGs1Overrides,
  fallback: Gs1PatchRoute | null = null
): Gs1PatchRoute[] | undefined {
  if (overrides.routes.length === 0) return undefined;
  const merged: Gs1PatchRoute[] = base.length > 0 ? [...base] : fallback ? [fallback] : [];
  for (const route of overrides.routes) {
    merged[route.index] = { src: route.src, dst: route.dst, amount: route.amount, enabled: route.enabled };
  }
  return merged;
}

/**
 * Write a resolved voice's modulation into a host — the code's own routes when it carried any, else
 * the table patch's velocity response on slot 0. One function, so the renderer and the live pool
 * cannot wire the same patch differently.
 *
 * Every slot is written, including the empty ones: a patch swap must clear the previous patch's
 * routing, or the next instrument inherits the last one's feel.
 */
export function applyGs1VoiceRoutes(host: Pick<Gs1Host, "setModRoute">, voice: Pick<Gs1Voice, "routes" | "velToCutoff">): void {
  if (voice.routes && voice.routes.length > 0) {
    for (let slot = 0; slot < MAX_ROUTES; slot += 1) {
      const route = voice.routes[slot];
      host.setModRoute(slot, route?.src ?? 0, route?.dst ?? 0, route?.amount ?? 0, Boolean(route));
    }
    return;
  }
  const route = gs1VelocityRoute(voice.velToCutoff);
  host.setModRoute(0, route?.src ?? 3, route?.dst ?? 0, route?.amount ?? 0, Boolean(route));
  for (let slot = 1; slot < MAX_ROUTES; slot += 1) host.setModRoute(slot, 0, 0, 0, false);
}

/**
 * ⭐ **The single application point.** A resolved voice becomes engine state: the base patch through
 * `setPatch`, the lane's per-parameter overrides through `setParam`/`setModRoute`, the routing last.
 *
 * One function with two call sites (the offline exporter and the live pool), exactly like
 * `applyGs1VoiceRoutes` before it, because the alternative — each caller deciding what to write —
 * is how the room and the file come to disagree. Order matters: the base first, then the overrides
 * *on top of it*; writing the overrides first would be overwritten by `setPatch`'s full record.
 *
 * The read-back is the proof: after this call, `host.getParam(id)` returns the override for an
 * overridden id and the base value for every other one (`gs1ParamOverrides.test.ts` asserts both,
 * on a real `Gs1Host`, for all 224).
 */
export function applyGs1Voice(
  host: Pick<Gs1Host, "setPatch" | "setParam" | "setModRoute">,
  voice: Pick<Gs1Voice, "params" | "routes" | "velToCutoff" | "overrides">
): void {
  host.setPatch(voice.params);
  applyGs1ParamOverrides(host, voice.overrides);
  applyGs1VoiceRoutes(host, voice);
}

/** Whether a patch plays an **imported sample**, and therefore cannot sound until one is loaded. */
export function patchNeedsSample(patch: Gs1PatchName | null): boolean {
  return patch === "sampleTexture";
}
