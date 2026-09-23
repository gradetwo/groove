/**
 * Glue-compressor kernel — the mastering bus compressor, with a **detector input of its own**.
 *
 * Why this exists (A2, measured 2026-09-23): the bus compressor used to be a `DynamicsCompressorNode`, whose
 * detector necessarily sees the programme it compresses. The sidechain duck is *in* that programme, so the
 * compressor read the duck as "less music", eased off, and handed the dip back. Four cells of the same bass+kick
 * pair, one mastering stage at a time, mean | median dip:
 *
 *     pure (no bus comp, ceiling lifted)   −4.41 | −4.37
 *     bus compressor only                  −2.09 |  0
 *     ceiling only                         −4.41 | −4.37
 *     both — the file                      −1.98 | −0.2
 *
 * The ceiling is transparent in both statistics. The compressor takes the *median* onset's dip to zero, and no
 * setting explains it: release 0.22/0.50/0.80 s → −2.09/−2.04/−2.03, threshold −6 dB → −2.2, ratio 1.2:1 → −2.18.
 * Content cannot pay for it either — a temporary ×3 duck depth moved the pure median to −13.62 dB and the file's
 * only to −0.35, so the median is saturated at zero rather than shrunk.
 *
 * So the compressor has to stop reacting to a dip that is not a drop in the music. This kernel takes two streams:
 * the **programme** (which carries the duck) and the **detector** (a pre-duck copy of the same bus). Its gain
 * follows the detector, so the duck passes through untouched while the glue behaviour is unchanged. Web Audio's
 * `DynamicsCompressorNode` has one input and cannot express this; the worklet twin in
 * `public/glueCompressorWorklet.js` mirrors this file line for line, and `glueCompressor.test.ts` evaluates that
 * file and asserts the two are sample-identical.
 *
 * The ballistics are the stage's existing ones (`MASTER_BUS_COMP_*` in `masterGraph.ts`): 2:1 over a soft 8 dB
 * knee at −16 dB, 30 ms attack, 220 ms release — glue, not pumping. `makeupDb` is explicit here because the node
 * applied its own internal makeup and the delivered level has to be calibrated against it rather than inherited.
 */

/** Defaults, mirroring the node this replaces. Kept in one object so the worklet can be given them verbatim. */
export interface GlueCompressorOptions {
  thresholdDb?: number;
  kneeDb?: number;
  ratio?: number;
  attackSec?: number;
  releaseSec?: number;
  /** Fixed makeup, dB. 0 = none; the graph calibrates this against the node it replaces. */
  makeupDb?: number;
  sampleRate?: number;
}

export interface ResolvedGlueCompressorOptions {
  thresholdDb: number;
  kneeDb: number;
  ratio: number;
  attackSec: number;
  releaseSec: number;
  makeupDb: number;
  sampleRate: number;
}

/**
 * Fixed makeup, dB — calibrated against the node this kernel replaces.
 *
 * `DynamicsCompressorNode` applies its own internal makeup; a custom compressor has to state it. Measured on disco
 * (2026-09-23, same pattern, same trim): the node's path renders at **−13.34 LUFS / −1.30 dBTP** and this kernel at
 * **−19.70 / −2.36** with no makeup, so the node's makeup is worth **6.36 dB** on that material. Anything the node
 * did that this does not (its detector's own smoothing) is inside the trims' noise floor, and the batch re-records
 * them anyway.
 */
export const GLUE_COMP_MAKEUP_DB = 5.5;

export const GLUE_COMP_THRESHOLD_DB = -16;
export const GLUE_COMP_KNEE_DB = 8;
export const GLUE_COMP_RATIO = 2;
export const GLUE_COMP_ATTACK_SEC = 0.03;
export const GLUE_COMP_RELEASE_SEC = 0.22;

export function resolveGlueCompressorOptions(
  options: GlueCompressorOptions = {}
): ResolvedGlueCompressorOptions {
  const finite = (value: number | undefined, fallback: number) =>
    Number.isFinite(value) ? (value as number) : fallback;
  const ratio = Math.max(1, finite(options.ratio, GLUE_COMP_RATIO));
  return {
    thresholdDb: finite(options.thresholdDb, GLUE_COMP_THRESHOLD_DB),
    kneeDb: Math.max(0, finite(options.kneeDb, GLUE_COMP_KNEE_DB)),
    ratio,
    attackSec: Math.max(0, finite(options.attackSec, GLUE_COMP_ATTACK_SEC)),
    releaseSec: Math.max(0, finite(options.releaseSec, GLUE_COMP_RELEASE_SEC)),
    makeupDb: finite(options.makeupDb, 0),
    sampleRate: Math.max(1, finite(options.sampleRate, 44100)),
  };
}

/**
 * The static gain computer: how much reduction a detector level asks for, soft knee and all.
 *
 * Exported because it is the part worth testing on its own — the knee's continuity at both corners is what stops
 * the compressor from sounding like it switches on.
 */
export function glueCompressorReductionDb(levelDb: number, options: ResolvedGlueCompressorOptions): number {
  const { thresholdDb, kneeDb, ratio } = options;
  const over = levelDb - thresholdDb;
  if (over <= -kneeDb / 2) return 0;
  const slope = 1 - 1 / ratio;
  if (over >= kneeDb / 2 || kneeDb === 0) return over * slope;
  const x = over + kneeDb / 2;
  return (slope * x * x) / (2 * kneeDb);
}

/**
 * One channel-set of the compressor, sample by sample.
 *
 * The detector is a **maximum across its channels**, which is what makes the two streams interchangeable: pass the
 * programme as its own detector and this behaves like a stock bus compressor; pass a pre-duck copy and the duck is
 * invisible to the gain.
 */
export class GlueCompressorKernel {
  readonly options: ResolvedGlueCompressorOptions;
  private readonly attackCoefficient: number;
  private readonly releaseCoefficient: number;
  private readonly makeupGain: number;
  /** Current gain reduction in dB, ≥ 0. Starts at 1.0 linear (no reduction), like the node. */
  private reductionDb = 0;

  constructor(options: GlueCompressorOptions = {}) {
    this.options = resolveGlueCompressorOptions(options);
    // One-pole smoothing, the same shape the limiter uses: the coefficient is the fraction of the distance covered
    // per sample. A zero time constant means "follow exactly", not "never move".
    this.attackCoefficient =
      this.options.attackSec <= 0 ? 1 : 1 - Math.exp(-1 / (this.options.attackSec * this.options.sampleRate));
    this.releaseCoefficient =
      this.options.releaseSec <= 0 ? 1 : 1 - Math.exp(-1 / (this.options.releaseSec * this.options.sampleRate));
    this.makeupGain = Math.pow(10, this.options.makeupDb / 20);
  }

  /** Gain reduction the kernel is currently applying, dB (0 = none). */
  get gainReductionDb(): number {
    return this.reductionDb;
  }

  reset(): void {
    this.reductionDb = 0;
  }

  /**
   * Processes one sample: `programme` is scaled, `detector` decides by how much.
   *
   * `detector` may be null, in which case the programme is its own detector — the stock behaviour, and the path the
   * fallback and the tests use.
   */
  processSample(programme: number, detector: number | null): number {
    const observed = detector === null ? Math.abs(programme) : Math.abs(detector);
    const levelDb = 20 * Math.log10(observed > 1e-9 ? observed : 1e-9);
    const target = glueCompressorReductionDb(levelDb, this.options);
    // Attack when the reduction deepens, release when it eases — the usual asymmetry, and the reason the detector's
    // own movement (rather than the programme's) is what the gain follows.
    const coefficient = target > this.reductionDb ? this.attackCoefficient : this.releaseCoefficient;
    this.reductionDb += (target - this.reductionDb) * coefficient;
    const gain = this.makeupGain * Math.pow(10, -this.reductionDb / 20);
    return programme * gain;
  }

  /**
   * Processes a block in place. `detector` is a parallel block, or null for the stock behaviour (the programme
   * detects itself) — the two paths are the same arithmetic, which is what lets the tests compare them directly.
   */
  process(programme: Float32Array[], detector: Float32Array[] | null): Float32Array[] {
    const frames = programme[0]?.length ?? 0;
    for (let i = 0; i < frames; i += 1) {
      let observed = 0;
      for (const channel of detector ?? programme) {
        const value = Math.abs(channel[i] ?? 0);
        if (value > observed) observed = value;
      }
      const levelDb = 20 * Math.log10(observed > 1e-9 ? observed : 1e-9);
      const target = glueCompressorReductionDb(levelDb, this.options);
      const coefficient = target > this.reductionDb ? this.attackCoefficient : this.releaseCoefficient;
      this.reductionDb += (target - this.reductionDb) * coefficient;
      const gain = this.makeupGain * Math.pow(10, -this.reductionDb / 20);
      for (const channel of programme) channel[i] = (channel[i] ?? 0) * gain;
    }
    return programme;
  }
}
