/**
 * The channel strip's compressor, as **the project's own worklet**.
 *
 * ## Why this module exists
 *
 * `ChannelStripDsp` used a per-channel `ctx.createDynamicsCompressor()`. That node is a *host* implementation: Chromium
 * and `node-web-audio-api` do not agree on its curve, its ballistics or its internal makeup, and the divergence is not
 * a rounding difference — it is the whole of the headless parity gap's band error. Measured on the parity probe's
 * fixture (2026-10-02 baseline): the kick lane's strip compressor alone accounted for 0.508 LU of a 1.774 LU loudness
 * delta, and with it switched off both 13-band assertions moved inside their 1 dB tolerance while the loudness one did
 * not (see `docs/HEADLESS_CORE_PLAN.md` §8.10).
 *
 * The project already owns a compressor: `public/glueCompressorWorklet.js`, the bus stage's kernel. §8.11 established
 * that its parameter surface is a superset of what a channel strip needs, so this is **wiring, not a second DSP** —
 * the strip swaps the host node for the same worklet the bus uses, and the two hosts then run identical code. §8.12
 * added the other half of the wiring: the worklet now accepts a settings message after construction, because a channel
 * strip rebuilds its chain whenever its parameters change.
 *
 * ## Two things this module deliberately does *not* do
 *
 *  · **It does not create the node unless the module is already in.** `new AudioWorkletNode(ctx, name)` for a
 *    processor that has not been registered **throws** `InvalidStateError` (measured on `node-web-audio-api@2.2.0`,
 *    and the same is true in a browser), and a strip's chain is built synchronously from its constructor. So the
 *    condition sits on a *synchronous* fact — "this context's module load has resolved" — which `ensure…` is what
 *    establishes. A strip built on a context nobody called `ensure…` for keeps the host node, exactly as before.
 *  · **It does not put the makeup inside the compressor.** The worklet has a `makeupDb` and the bus uses it, because
 *    `DynamicsCompressorNode` has no makeup of its own. The strip has a *separate* makeup gain node on purpose
 *    (`ChannelStripDsp`'s header: so `compMakeupDb` is auditable independently of the compressor curve), so the
 *    settings here always send `makeupDb: 0` and that node keeps doing the work. The same reasoning turns the bus's
 *    release **hold** off: it is a glue feature, and a channel strip's release is its own.
 *
 * ## One definition of the URL, one of the settings object
 *
 * The URL and the processor name come from `GlueCompressorFactory`, which already owns them for the bus; a second
 * copy of either is how the two paths come to load different files. `insertCompressorSettings` is the single place
 * that maps a strip's parameters onto the worklet's fields, and both the constructor's `processorOptions` and every
 * later message go through it — the same "two copies of a curve are how the two drift apart" rule the worklet itself
 * states.
 */
import {
  GLUE_COMPRESSOR_PROCESSOR_NAME,
  GLUE_COMPRESSOR_WORKLET_URL,
  audioWorkletAvailable,
} from "./GlueCompressorFactory";
import type { TrackInsertParams } from "../data/trackInsert";

/**
 * Compressor knee, dB. `trackInsert.ts` deliberately does not expose a knee — the published contract is
 * threshold/ratio/attack/release — so the DSP fixes one. 6 dB is a gentle, musical knee: below the browser default of
 * 30 (which would start compressing ~15 dB under the threshold and make `compThresholdDb` stop meaning what it says).
 *
 * It lives here rather than in `ChannelStripDsp` because this is now the compressor's home; that module re-exports it
 * so its existing importers (the insert-curve views) are unchanged.
 */
export const INSERT_COMP_KNEE_DB = 6;

/** The worklet's settings object, as `applySettings` in `public/glueCompressorWorklet.js` reads it. */
export interface InsertCompressorSettings {
  thresholdDb: number;
  kneeDb: number;
  ratio: number;
  attackSec: number;
  releaseSec: number;
  /** Always 0 — the strip's own makeup gain node applies `compMakeupDb`. See this module's header. */
  makeupDb: number;
  /** Always 0 — the release hold is a glue-stage feature, not a channel-strip one. See this module's header. */
  holdMs: number;
  sampleRate: number;
  /**
   * Whether the processor should post its gain reduction back. On for a strip (its meter reads it), and never sent on
   * the bus path, so a node that is not asked behaves exactly as it did before §8.12.
   */
  reportReduction: boolean;
}

/** The strip's parameters mapped onto the worklet's fields. The single mapping; both callers use it. */
export function insertCompressorSettings(
  params: TrackInsertParams,
  sampleRate: number,
  reportReduction: boolean
): InsertCompressorSettings {
  return {
    thresholdDb: params.compThresholdDb,
    kneeDb: INSERT_COMP_KNEE_DB,
    ratio: params.compRatio,
    attackSec: params.compAttackSec,
    releaseSec: params.compReleaseSec,
    makeupDb: 0,
    holdMs: 0,
    sampleRate,
    reportReduction,
  };
}

/** One context's module load: the promise a caller awaits, and the synchronous fact a strip's constructor reads. */
interface InsertCompressorLoad {
  promise: Promise<boolean>;
  loaded: boolean;
}

/**
 * ⭐ **A fallback is said once per distinct reason, not once per context** (MCP deep test of v2.35.9: a render farm's log
 * filled with `[InsertCompressor] … the worklet module did not load`, which the report filed as noise).
 *
 * The message itself is right and stays: a strip that cannot load the project's worklet keeps the host compressor, and
 * silence about that would be worse than the line. What told the reader nothing was repetition — a headless render builds a
 * fresh context every time, the same failure came back, and the same sentence came with it. Keying the note on the
 * **reason** keeps a new failure audible while the known one stops shouting.
 */
const reportedFallbacks = new Set<string>();

/** True the first time this reason is seen; the caller then does the speaking. */
function firstTimeSaying(reason: string): boolean {
  if (reportedFallbacks.has(reason)) return false;
  reportedFallbacks.add(reason);
  return true;
}

const loads = new WeakMap<BaseAudioContext, InsertCompressorLoad>();

/**
 * Loads `/glueCompressorWorklet.js` into this context **once**, and resolves `true` when it is in.
 *
 * Cached per context rather than per strip: a render builds one strip per track, and every one of them asking for the
 * same module would be N fetches of the same file (measured: a second `addModule` for the same URL on the same context
 * resolves rather than throwing, but it is still a fetch). Resolves `false` — and says why, once — when the context
 * cannot host worklets at all or the module fails to load; a strip then keeps the host node, so audio is never lost to
 * a module flake. That is the same fallback discipline, and the same warning, as the bus factory's.
 */
export function ensureInsertCompressorWorklet(ctx: BaseAudioContext): Promise<boolean> {
  if (!audioWorkletAvailable(ctx)) return Promise.resolve(false);
  const existing = loads.get(ctx);
  if (existing) return existing.promise;
  const record: InsertCompressorLoad = { promise: Promise.resolve(false), loaded: false };
  record.promise = ctx.audioWorklet.addModule(GLUE_COMPRESSOR_WORKLET_URL).then(
    () => {
      record.loaded = true;
      return true;
    },
    (error: unknown) => {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      if (firstTimeSaying(`worklet did not load: ${reason}`)) {
        console.warn(
          "[InsertCompressor] the channel strip keeps the host compressor: the worklet module did not load:",
          reason,
          "— said once per distinct reason; every later context with the same failure stays quiet"
        );
      }
      return false;
    }
  );
  loads.set(ctx, record);
  return record.promise;
}

/**
 * **The synchronous fact a strip's constructor can act on**: has this context's module load resolved?
 *
 * Not "can this context host worklets" — a registered processor is what the constructor needs, and asking the weaker
 * question is what produces an `InvalidStateError` (see this module's header).
 */
export function insertCompressorWorkletReady(ctx: BaseAudioContext): boolean {
  return loads.get(ctx)?.loaded === true;
}

/**
 * The strip's compressor node, or `null` when the worklet is not available and the caller must keep the host node.
 *
 * The `try` is not decoration: a host can report a module as loaded and still refuse the node, and a strip that threw
 * here would take the whole track — and every render containing it — down with it. A refusal is reported and falls
 * back, exactly like the bus factory's swap.
 *
 * Plain defaults for the channel options (`channelCount` 2 / `channelCountMode` "max" / no `outputChannelCount`) are
 * deliberate: they make the node's channel count **follow its input**, which is what `DynamicsCompressorNode` does.
 * Measured on `node-web-audio-api@2.2.0` (2026-10-02): mono in → 1 channel out, stereo in → 2; whereas the bus's
 * `explicit`/2 shape up-mixes a mono strip input to stereo and `explicit`/1 down-mixes a stereo one.
 */
export function createInsertCompressorNode(
  ctx: BaseAudioContext,
  params: TrackInsertParams
): AudioWorkletNode | null {
  if (!insertCompressorWorkletReady(ctx)) return null;
  try {
    return new AudioWorkletNode(ctx, GLUE_COMPRESSOR_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      processorOptions: insertCompressorSettings(params, ctx.sampleRate, true),
    });
  } catch (error) {
    console.warn(
      "[InsertCompressor] the channel strip keeps the host compressor: the worklet node could not be built:",
      error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    );
    return null;
  }
}

/**
 * Sends the strip's current compressor parameters to a live worklet node.
 *
 * This is the half §8.12 added to the worklet and this is what uses it: a strip rebuilds its chain whenever a
 * parameter changes, so a compressor that could only be configured at construction would go stale the first time
 * anyone moved a knob.
 */
export function sendInsertCompressorSettings(node: AudioWorkletNode, params: TrackInsertParams): void {
  const settings = insertCompressorSettings(params, node.context.sampleRate, true);
  try {
    node.port.postMessage(settings);
  } catch (error) {
    console.warn(
      "[InsertCompressor] a strip's compressor parameters could not be sent; the processor keeps its previous settings:",
      error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    );
  }
}

/** Gain reduction the processor reports, in dB ≤ 0 — the same sign `DynamicsCompressorNode.reduction` uses. */
export interface InsertCompressorReductionMessage {
  type: "reduction";
  reductionDb: number;
}

/** Narrows a worklet port message to the reduction report, so a consumer does not trust an untyped `data`. */
export function asInsertCompressorReduction(data: unknown): InsertCompressorReductionMessage | null {
  if (!data || typeof data !== "object") return null;
  const message = data as Partial<InsertCompressorReductionMessage>;
  if (message.type !== "reduction") return null;
  if (typeof message.reductionDb !== "number" || !Number.isFinite(message.reductionDb)) return null;
  return { type: "reduction", reductionDb: message.reductionDb };
}
