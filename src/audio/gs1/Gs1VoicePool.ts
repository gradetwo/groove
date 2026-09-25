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
 * ## Destination stability
 *
 * A host's output is connected once, to the track's own destination. `dest` is therefore only
 * used when a host is *created*: it is deliberately not part of the "is this slot usable" test.
 * Making it part of that test caused a host-churn loop — auditioning a track passes the master
 * output, which asked for a different destination, which tore the live host down and rebuilt it
 * against the master; the next sequencer note then found a mismatched slot, fell back to native
 * and rebuilt again. The user-visible symptom was exactly "the audition button has latency, or
 * does not sound".
 *
 * ## The switch
 *
 * `isGs1RoutingEnabled()` (in `gs1Tracks.ts`) is the switch. It ships **on** (v2.0.16), is
 * persisted per user in `groove_audio_settings_v1`, and both the toolbar quick toggle and the
 * audio settings panel write through `AudioEngine.setGs1Enabled`. Turning it off is safe at any
 * moment: the pool silences and disposes its hosts and the native engine takes the notes.
 */
import type { MixTrackId } from "../../data/genreMix";
import { createGs1Host, type Gs1Host } from "./Gs1Host";
import {
  GS1_POLYPHONY_CEILING,
  capPlanPolyphony,
  isGs1RoutingEnabled,
  patchNeedsSample,
  planGs1Notes,
} from "./gs1Tracks";
import { generateTextureSample } from "./textureSample";

/** One note to schedule, in the sound source's own timeline. */
export interface PoolNote {
  note: number;
  time: number;
  duration: number;
  velocity: number;
  pan?: number;
  /**
   * Per-note microtuning, in cents — A3's variation on the GS-1 voice.
   *
   * The native path nudges a voice's second-oscillator detune and its cutoff; GS-1 has no per-note cutoff, so the
   * nudge arrives as per-note **tuning** (ABI 9). Without this a render with the pool enabled was identical with and
   * without the variation, which is why the per-note claim used to be measured on the native path only.
   */
  cents?: number;
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
  /**
   * Whether this host has been handed its recording (P2.5).
   *
   * A sample patch is silent until one arrives, and the import is asynchronous, so it is requested once per host
   * rather than once per note.
   */
  sampleLoaded: boolean;
  /** The most recent self-report from this track's worklet (see `status()`). */
  analysis?: Record<string, number>;
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
    // A ready host is reused for any destination *and any instrument*: the host is
    // instrument-agnostic (a patch is just a set of parameters), its output is connected once, and
    // rebuilding it on every timbre change is what made switching timbre during playback feel
    // unresponsive — each switch tore the worklet down, played the next notes on the native engine
    // while the replacement compiled, and only then came back. The patch is pushed by `tryPlay`.
    if (existing?.ready) {
      existing.instrument = instrument;
      return true;
    }
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
      sampleLoaded: false,
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
        /**
         * Keep what the worklet reports about itself (`voices`, `load`, `violations`).
         *
         * Nothing else in the app reads these — they were only ever asserted in tests — and they are exactly the
         * numbers a "starts fine then crackles" report needs: a voice count pinned at the ceiling and a load above the
         * core's own 0.35 threshold mean the engine is shedding voices, which sounds like a broken instrument rather
         * than a load problem.
         */
        host.onAnalysis((analysis) => {
          if (this.slots.get(trackIdx) !== slot) return;
          slot.analysis = {
            voices: analysis.voices,
            load: Number(analysis.load?.toFixed?.(3) ?? analysis.load ?? 0),
            violations: analysis.violations,
            truePeak: Number(analysis.truePeak?.toFixed?.(4) ?? analysis.truePeak ?? 0),
            limit: Number(analysis.limit?.toFixed?.(4) ?? analysis.limit ?? 1),
            at: Date.now(),
          };
        });
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
  /**
   * The genre whose patches this pool voices, set by the engine when the pattern changes.
   *
   * `null` means "the instrument table's answer", which is what the pool did before per-genre voicing existed.
   */
  private genreId: string | null = null;

  /** Called by the engine on every pattern change; cheap, and it never rebuilds a host. */
  public setGenre(genreId: string | null | undefined): void {
    this.genreId = genreId ?? null;
  }

  /**
   * What each track's host is doing, for the in-app diagnostic (`?diag=1`).
   *
   * Deliberately tiny and read-only: the question a defect report has to answer is "did this track get a host, what
   * variant, which patch, and did it ever become ready" — and none of that is visible from outside otherwise.
   */
  status(): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const [trackIdx, slot] of this.slots) {
      out.push({
        trackIdx,
        role: slot.role,
        instrument: slot.instrument ?? null,
        patch: slot.patch,
        ready: slot.ready,
        variant: slot.host?.variant ?? null,
        hasHost: Boolean(slot.host),
        analysis: slot.analysis ?? null,
      });
    }
    return out;
  }

  tryPlay(
    trackIdx: number,
    role: MixTrackId,
    instrument: string | null | undefined,
    notes: readonly PoolNote[],
    dest: AudioNode
  ): boolean {
    if (this.disposed || !isGs1RoutingEnabled()) return false;
    const slot = this.slots.get(trackIdx);
    // The destination is intentionally not compared here: the host is already connected to this
    // track's output, and a caller asking for a different one (audition → master) must not cost
    // the live host its life.
    if (slot?.ready && slot.host) {
      const plan = planGs1Notes({
        role,
        instrument,
        notes,
        sampleRate: this.ctx.sampleRate,
        latencyFrames: slot.host.scheduledNoteLatencyFrames,
        // The genre decides how a lane is voiced (`GENRE_GS1_PATCH_OVERRIDES`); the live pool is told it once per
        // pattern by the engine, so a genre change re-voices without any per-note work.
        genreId: this.genreId,
      });
      if (!plan) {
        // No GS-1 patch for this instrument: play it natively, but keep the host alive — the user
        // may switch back, and disposing here would make that switch pay the load again.
        slot.instrument = instrument;
        slot.patch = null;
        return false;
      }
      if (slot.patch !== plan.patch) {
        slot.host.setPatch(plan.params);
        slot.patch = plan.patch;
        /**
         * A sample patch needs its recording (P2.5). Not awaited: this runs inside the scheduler, and the native
         * engine already covers the first notes while the import lands — the same fallback the pool uses while a host
         * is loading. `sampleLoaded` keeps it to once per host rather than once per note.
         */
        if (patchNeedsSample(plan.patch) && !slot.sampleLoaded) {
          slot.sampleLoaded = true;
          void slot.host.importSample(generateTextureSample(this.ctx.sampleRate), this.ctx.sampleRate);
        }
      }
      slot.instrument = instrument;
      const capped = capPlanPolyphony(plan, this.maxVoices);
      for (const note of capped.notes) {
        // The nudge rides with the note, so the worklet applies it at the note's own frame — a separate message
        // retuned whichever voice was still sounding on that key (see the worklet protocol's `cents`).
        slot.host.noteOnAt(note.note, note.velocity, note.atFrame, note.pan, note.cents);
      }
      for (const note of capped.notes) {
        slot.host.noteOffAt(note.note, note.offFrame);
      }
      return true;
    }
    // Not ready (or a different instrument): start loading in the background and let the native
    // engine cover this note. Never await here — this runs inside the scheduler. A ready slot
    // with the same instrument cannot reach this branch, so a destination difference alone never
    // triggers a rebuild.
    if (!slot || !slot.ready) {
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
