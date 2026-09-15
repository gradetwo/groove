/**
 * GS-1 voice pool: the live-playback half of the P6 wiring.
 *
 * Owns at most one `Gs1Host` per routed track (so the instrument feeds that track's insert chain
 * and its sends keep working), plans frame-addressed events with `gs1Tracks.ts`, and refuses —
 * silently, returning `false` — whenever GS-1 cannot take the note. Refusing is always safe: the
 * caller falls back to the native voice, which is what the library sounded like before any of
 * this existed.
 *
 * ## Asynchrony
 *
 * A host needs a `fetch` + a WASM compile, so it cannot exist at the moment the first note is
 * scheduled. The pool therefore:
 *
 *   - returns `false` for notes that arrive before its host is ready (the native engine plays
 *     them), and
 *   - kicks off host creation in the background, so the *next* notes can be GS-1's.
 *
 * That is deliberately not "queue the notes until the host is up": a sequencer that stalls its
 * first bar to await a download is worse than one that plays the first bar natively.
 *
 * ## Not enabled in production yet
 *
 * `isGs1RoutingEnabled()` (in `gs1Tracks.ts`) is the switch, and it is **off**. Do not turn it on
 * until the offline renderer routes through GS-1 as well: a live-only route would make the export
 * disagree with playback, which this repository treats as a hard rule. See
 * `AUDIO_QUALITY_AND_SYNTH_PLAN.md` §5.14.
 */
import type { MixTrackId } from "../../data/genreMix";
import { createGs1Host, type Gs1Host } from "./Gs1Host";
import { GS1_POLYPHONY_CEILING, capPlanPolyphony, isGs1RoutingEnabled, planGs1Notes } from "./gs1Tracks";

/** One note to schedule, in the sound source's own timeline. */
export interface PoolNote {
  note: number;
  time: number;
  duration: number;
  velocity: number;
  pan?: number;
}

export interface Gs1VoicePoolOptions {
  /** Host factory, injectable so tests never touch WASM. */
  createHost?: typeof createGs1Host;
  maxVoices?: number;
}

interface TrackSlot {
  role: MixTrackId;
  instrument: string | null | undefined;
  host: Gs1Host | null;
  ready: boolean;
  /** The patch the host was told to load, so a change does not get silently ignored. */
  patch: string | null;
  creating: Promise<void> | null;
  dest: AudioNode | null;
}

export class Gs1VoicePool {
  private readonly slots = new Map<number, TrackSlot>();
  private readonly createHost: typeof createGs1Host;
  private readonly maxVoices: number;
  private disposed = false;

  constructor(private readonly ctx: BaseAudioContext, options: Gs1VoicePoolOptions = {}) {
    this.createHost = options.createHost ?? createGs1Host;
    this.maxVoices = options.maxVoices ?? GS1_POLYPHONY_CEILING;
  }

  /** True when this pool has a ready host for the track — what a UI would show as "GS-1 active". */
  isTrackReady(trackIdx: number): boolean {
    return this.slots.get(trackIdx)?.ready === true;
  }

  /** Load (or re-target) the instrument for one track. Resolves when the host is usable. */
  async ensureTrack(
    trackIdx: number,
    role: MixTrackId,
    instrument: string | null | undefined,
    dest: AudioNode
  ): Promise<boolean> {
    if (this.disposed || !isGs1RoutingEnabled()) return false;
    const existing = this.slots.get(trackIdx);
    if (existing?.ready && existing.instrument === instrument && existing.dest === dest) return true;
    // A different instrument on the same track: tear the old host down rather than playing the
    // wrong patch. `slot.instrument` is updated first so a second call does not duplicate the work.
    if (existing) {
      existing.host?.dispose();
      this.slots.delete(trackIdx);
    }
    const slot: TrackSlot = {
      role,
      instrument,
      host: null,
      ready: false,
      patch: null,
      creating: null,
      dest,
    };
    this.slots.set(trackIdx, slot);
    slot.creating = (async () => {
      try {
        const host = await this.createHost({ context: this.ctx });
        const ready = await host.ready;
        if (this.disposed || this.slots.get(trackIdx) !== slot) {
          host.dispose();
          return;
        }
        host.output.connect(dest);
        slot.host = host;
        slot.ready = true;
        void ready;
      } catch {
        // A failed load is not fatal: the track stays on the native engine, and the next
        // `ensureTrack` (a genre change, say) tries again.
        if (this.slots.get(trackIdx) === slot) this.slots.delete(trackIdx);
      }
    })();
    await slot.creating;
    return slot.ready;
  }

  /**
   * Schedule one note event for a track, or return `false` to mean "play it natively".
   *
   * The plan is capped at the measured polyphony ceiling before anything is sent, and the patch is
   * pushed to the host when it changes.
   */
  tryPlay(
    trackIdx: number,
    role: MixTrackId,
    instrument: string | null | undefined,
    notes: readonly PoolNote[],
    dest: AudioNode
  ): boolean {
    if (this.disposed || !isGs1RoutingEnabled()) return false;
    const slot = this.slots.get(trackIdx);
    if (slot?.ready && slot.host && slot.instrument === instrument && slot.dest === dest) {
      const plan = planGs1Notes({
        role,
        instrument,
        notes,
        sampleRate: this.ctx.sampleRate,
        latencyFrames: slot.host.scheduledNoteLatencyFrames,
      });
      if (!plan) return false;
      if (slot.patch !== plan.patch) {
        slot.host.setPatch(plan.params);
        slot.patch = plan.patch;
      }
      const capped = capPlanPolyphony(plan, this.maxVoices);
      for (const note of capped.notes) {
        slot.host.noteOnAt(note.note, note.velocity, note.atFrame, note.pan);
      }
      for (const note of capped.notes) {
        slot.host.noteOffAt(note.note, note.offFrame);
      }
      return true;
    }
    // Not ready (or a different instrument): start loading in the background and let the native
    // engine cover this note. Never await here — this runs inside the scheduler.
    if (!slot || slot.instrument !== instrument || slot.dest !== dest) {
      void this.ensureTrack(trackIdx, role, instrument, dest);
    }
    return false;
  }

  /** Release everything (panic, stop, track mute). */
  releaseAll(): void {
    for (const slot of this.slots.values()) slot.host?.allNotesOff();
  }

  dispose(): void {
    this.disposed = true;
    for (const slot of this.slots.values()) {
      try {
        slot.host?.dispose();
      } catch {
        /* best effort */
      }
    }
    this.slots.clear();
  }
}
