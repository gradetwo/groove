/**
 * ⭐ **A preview of a synth preset, on its own voices — because the alternative changes the sound you are already using.**
 *
 * The factory library became choosable in v2.47.0 (`load_synth_preset`, and a control on the lane), and choosing among 120
 * sounds by name alone is how a person ends up auditioning by *applying* each one and undoing. So a preview. The design
 * question is not "how do I make a note" but **whose voice it uses**:
 *
 *   - ⚠️ **It must not borrow a track's host.** The pool's hosts are per track and `tryPlay` deliberately does not compare
 *     destinations ("a caller asking for a different one — **audition → master** — must not cost the live host its life"),
 *     so reusing a lane's slot would push the previewed patch into a slot the lane is playing through. The preview would
 *     then be audible *as a change to the project*, which is the opposite of a preview.
 *   - ⇒ **Its own pool, its own slot, its own destination.** The cost is one extra host while a preview is open, which is
 *     why this is a lazily-created object with a `dispose` rather than something constructed per render.
 *
 * ⭐ **It reports whether it actually sounded, and that is not decoration.** `tryPlay` returns `false` — and the pool says
 * why on its own status — when GS-1 routing is off, when the lane's patch cannot be read, or when no patch matches the
 * role. A preview button that silently does nothing is exactly the "looks like it works" control this project refuses, so
 * `play` hands back a report a caller can show.
 */
import { Gs1VoicePool, type Gs1VoicePoolOptions } from "./Gs1VoicePool";
import { GS1_PATCH_PREFIX } from "./gs1PatchCode";
import type { MixTrackId } from "../../data/genreMix";

/** Where a preview is sent. `dest` is the caller's, so the same yard works in an engine or in a test. */
export interface PresetPreviewOptions extends Gs1VoicePoolOptions {
  /** The context the voices live in. */
  context: BaseAudioContext;
  /** Where the sound goes — the engine's master in the app. */
  dest: AudioNode;
  /** The role the patch is resolved through: voicing depends on it, exactly as it does for a real lane. */
  role?: MixTrackId;
  /** The genre whose patch overrides apply, or `null` for none. */
  genreId?: string | null;
}

/** What `play` did, so a caller can say it rather than assume it. */
export interface PreviewOutcome {
  sounded: boolean;
  /** Why not, when `sounded` is false — one sentence a UI can show. */
  problem?: string;
}

/**
 * ⭐ **A slot index no track can occupy.** The pool is private to this object, so the number only has to be distinct within
 * it; using a negative index keeps it impossible to confuse with a real lane's index if a bug ever crossed the two pools.
 */
const PREVIEW_SLOT = -1;

/**
 * One reused preview yard. Construct it when the preview surface opens and `dispose()` when it closes: GS-1 voices are
 * worklet-backed, so a yard per hover or per render would compile a host each time and leak a slot each time.
 */
export class Gs1PresetPreview {
  private readonly pool: Gs1VoicePool;
  private readonly role: MixTrackId;
  private disposed = false;

  constructor(private readonly options: PresetPreviewOptions) {
    this.role = options.role ?? "lead";
    this.pool = new Gs1VoicePool(options.context, options);
    if (options.genreId !== undefined) this.pool.setGenre(options.genreId);
  }

  /**
   * ⭐ **The code is checked before the pool is asked, so a bad code reports the format rather than "it did not sound".**
   * `resolveGs1Lane` would refuse it a layer down too, but that path also plays the note natively — fine for a lane, wrong
   * for a preview, where the only honest outcome for an unreadable patch is to say so.
   */
  async play(shareCode: string, midi = 60, seconds = 1.2): Promise<PreviewOutcome> {
    if (this.disposed) return { sounded: false, problem: "the preview was closed" };
    if (!shareCode.startsWith(GS1_PATCH_PREFIX)) {
      return { sounded: false, problem: `not a share code: it must start with "${GS1_PATCH_PREFIX}"` };
    }
    /**
     * ⭐ **One note at a time, and the previous one is released first.** A person auditioning 120 presets presses quickly;
     * without this, held notes stack into a chord nobody asked for and the last preset is the only one clearly audible.
     */
    this.pool.releaseAll();

    const ready = await this.pool.ensureTrack(PREVIEW_SLOT, this.role, null, this.options.dest);
    if (!ready) return { sounded: false, problem: "the synth voices could not be started (is GS-1 routing on?)" };

    const sounded = this.pool.tryPlay(
      PREVIEW_SLOT,
      this.role,
      null,
      [{ note: midi, time: 0, duration: Math.max(0.05, seconds), velocity: 100 }],
      this.options.dest,
      shareCode
    );
    if (!sounded) {
      // The pool records a reason on the slot (an unreadable patch, no patch for the role), so it is read back rather
      // than guessed at — the same "do not invent a cause" rule the rest of this codebase follows.
      const status = this.pool.status().find((row) => row.trackIdx === PREVIEW_SLOT) as { problem?: string } | undefined;
      return { sounded: false, problem: status?.problem ?? "the patch could not be voiced" };
    }
    return { sounded: true };
  }

  /** Release anything still sounding, keeping the yard for the next press. */
  stop(): void {
    if (!this.disposed) this.pool.releaseAll();
  }

  /** Release everything and tear the hosts down. Idempotent, so a close twice is not an error. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pool.releaseAll();
    this.pool.dispose();
  }
}
