/**
 * The bus compressor as a *handle*, in the same shape as the ceiling's.
 *
 * Two implementations, one interface, and the choice is made by whether a detector was supplied:
 *
 *  · **node** — a `DynamicsCompressorNode` with the shipped settings. It has one input, so its detector is the
 *    programme, which is why the sidechain duck disappears in the file (A2: the median onset's dip goes from
 *    −4.37 dB to 0 dB through it, and every setting was refuted by measurement).
 *  · **worklet** — `public/glueCompressorWorklet.js`, with **two** inputs: the programme and a pre-duck copy of the
 *    bus. Its gain follows the copy, so a deliberate dip is not mistaken for a quiet passage.
 *
 * The swap is invisible to the caller: the handle exposes a fixed `input` and `output` gain, and the worklet replaces
 * the node between them once its module is in. Until then the node holds the stage, so audio is never un-compressed in
 * between — the same fallback discipline the ceiling uses. `kind()` reports which one is live, because a silent
 * fallback would measure as "the fix did not work" rather than "the module did not load".
 */
import {
  GLUE_COMP_ATTACK_SEC,
  GLUE_COMP_KNEE_DB,
  GLUE_COMP_MAKEUP_DB,
  GLUE_COMP_RATIO,
  GLUE_COMP_RELEASE_SEC,
  GLUE_COMP_THRESHOLD_DB,
} from "./GlueCompressor";

export type BusCompressorKind = "node" | "worklet";

/** URL of the module, served from `public/` (the same pattern as the limiter and the clock). */
export const GLUE_COMPRESSOR_WORKLET_URL = "/glueCompressorWorklet.js";
export const GLUE_COMPRESSOR_PROCESSOR_NAME = "groove-glue-compressor-processor";

export interface BusCompressorOptions {
  thresholdDb?: number;
  kneeDb?: number;
  ratio?: number;
  releaseSec?: number;
  /** The pre-duck bus copy. When null or absent, the shipped `DynamicsCompressorNode` is used. */
  detector?: AudioNode | null;
  /** Fixed makeup for the worklet, dB. The node applies its own; see the calibration note in the plan. */
  makeupDb?: number;
}

export interface BusCompressorHandle {
  /** The programme goes in here. */
  input: AudioNode;
  /** The stage's output; connect this onward. */
  output: AudioNode;
  /** Which implementation is live. */
  kind: () => BusCompressorKind;
  /** Resolves once module loading has settled. */
  ready: Promise<BusCompressorKind>;
  dispose: () => void;
}

/** Whether this context can host an `AudioWorkletNode` at all (the jsdom double cannot). */
const audioWorkletAvailable = (ctx: BaseAudioContext): boolean =>
  typeof (ctx as BaseAudioContext & { audioWorklet?: AudioWorklet }).audioWorklet?.addModule === "function" &&
  typeof (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode === "function";

export function createBusCompressor(
  ctx: BaseAudioContext,
  options: BusCompressorOptions = {}
): BusCompressorHandle {
  const finite = (value: number | undefined, fallback: number) =>
    Number.isFinite(value) ? (value as number) : fallback;
  const settings = {
    thresholdDb: finite(options.thresholdDb, GLUE_COMP_THRESHOLD_DB),
    kneeDb: Math.max(0, finite(options.kneeDb, GLUE_COMP_KNEE_DB)),
    ratio: Math.max(1, finite(options.ratio, GLUE_COMP_RATIO)),
    releaseSec: Math.max(0.01, finite(options.releaseSec, GLUE_COMP_RELEASE_SEC)),
    makeupDb: finite(options.makeupDb, GLUE_COMP_MAKEUP_DB),
  };

  const input = ctx.createGain();
  input.gain.value = 1;
  const output = ctx.createGain();
  output.gain.value = 1;

  const node = ctx.createDynamicsCompressor();
  node.threshold.value = settings.thresholdDb;
  node.knee.value = settings.kneeDb;
  node.ratio.value = settings.ratio;
  node.attack.value = GLUE_COMP_ATTACK_SEC;
  node.release.value = settings.releaseSec;
  input.connect(node);
  node.connect(output);

  const detector = options.detector ?? null;
  let kind: BusCompressorKind = "node";
  let disposed = false;
  let workletNode: AudioWorkletNode | null = null;

  /**
   * With no detector there is nothing the worklet could do that the node does not: the detector input would be the
   * programme either way, and swapping in a second implementation would only risk a difference nobody asked for.
   */
  const ready: Promise<BusCompressorKind> =
    detector && audioWorkletAvailable(ctx)
      ? (async () => {
          try {
            const worklet = (ctx as BaseAudioContext & { audioWorklet: AudioWorklet }).audioWorklet;
            await worklet.addModule(GLUE_COMPRESSOR_WORKLET_URL);
            if (disposed) return kind;
            const created = new AudioWorkletNode(ctx, GLUE_COMPRESSOR_PROCESSOR_NAME, {
              numberOfInputs: 2,
              numberOfOutputs: 1,
              outputChannelCount: [2],
              channelCount: 2,
              channelCountMode: "explicit",
              channelInterpretation: "speakers",
              processorOptions: {
                thresholdDb: settings.thresholdDb,
                kneeDb: settings.kneeDb,
                ratio: settings.ratio,
                attackSec: GLUE_COMP_ATTACK_SEC,
                releaseSec: settings.releaseSec,
                makeupDb: settings.makeupDb,
                sampleRate: ctx.sampleRate,
              },
            });
            detector.connect(created, 0, 1);
            input.disconnect(node);
            node.disconnect(output);
            input.connect(created);
            created.connect(output);
            workletNode = created;
            kind = "worklet";
          } catch {
            // Keep the node: a failed module load must not leave the bus uncompressed, and `kind()` says so.
            kind = "node";
          }
          return kind;
        })()
      : Promise.resolve<BusCompressorKind>("node");

  return {
    input,
    output,
    kind: () => kind,
    ready,
    dispose: () => {
      disposed = true;
      try {
        input.disconnect();
        node.disconnect();
        workletNode?.disconnect();
        output.disconnect();
      } catch {
        /* already detached */
      }
    },
  };
}
