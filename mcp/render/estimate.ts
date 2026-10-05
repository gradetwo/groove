import { MEASURED_RENDER_COST } from "./budget";

/**
 * ⭐ **What a render will cost, before it is asked for.**
 *
 * A caller that cannot size its own timeout waits until it expires to learn the render needed longer, which is
 * indistinguishable from a tool that does not answer. Every number here comes from constants this project measured itself —
 * the realtime ratio and the eight bar audio and wall figures — so the estimate is honest today rather than waiting on a new
 * measurement. The start cost is the difference between those two figures once the audio's own cost is removed.
 */
export interface RenderEstimateInput {
  bars: number;
  bpm: number;
  notes?: number;
  /** ⭐ Beats in a bar; four unless a caller knows the arrangement says otherwise. */
  beatsPerBar?: number;
}

export interface RenderEstimate {
  audioSeconds: number;
  estimatedWallSec: number;
  estimatedWallSecRange: [number, number];
  suggestedClientTimeoutSec: number;
  basis: { fullRateRatio: number; startSec: number; marginFactor: number };
}

/** ⭐ The margin is stated as a factor rather than dressed up as precision. */
export const ESTIMATE_MARGIN_FACTOR = 0.2;
export const CLIENT_TIMEOUT_FACTOR = 1.5;

const round = (value: number, places = 1) => Number(value.toFixed(places));

export function estimateRenderCost(input: RenderEstimateInput): RenderEstimate {
  const beatsPerBar = input.beatsPerBar ?? 4;
  if (!(input.bars > 0)) throw new Error("estimate: bars must be greater than zero");
  if (!(input.bpm > 0)) throw new Error("estimate: bpm must be greater than zero");
  const audioSeconds = (input.bars * beatsPerBar * 60) / input.bpm;
  const ratio = MEASURED_RENDER_COST.fullRateRatio;
  // ⭐ The start cost is what the eight bar measurement paid beyond its own audio, and it never counts below zero.
  // ⭐ The eight bar wall figure is a measured range; the high end gives the conservative start cost.
  const [wallLow, wallHigh] = MEASURED_RENDER_COST.eightBarWallSec;
  const audioCost8 = MEASURED_RENDER_COST.eightBarAudioSec * ratio;
  const startLow = Math.max(0, wallLow - audioCost8);
  const startHigh = Math.max(0, wallHigh - audioCost8);
  const startSec = startHigh;
  const estimatedWallSec = audioSeconds * ratio + startSec;
  return {
    audioSeconds: round(audioSeconds),
    estimatedWallSec: round(estimatedWallSec),
    // ⭐ The range combines the measured start spread with the stated margin.
    estimatedWallSecRange: [
      round(Math.min(audioSeconds * ratio + startLow, estimatedWallSec) * (1 - ESTIMATE_MARGIN_FACTOR)),
      round(Math.max(audioSeconds * ratio + startHigh, estimatedWallSec) * (1 + ESTIMATE_MARGIN_FACTOR)),
    ],
    suggestedClientTimeoutSec: Math.ceil(estimatedWallSec * CLIENT_TIMEOUT_FACTOR),
    basis: { fullRateRatio: ratio, startSec: round(startSec), marginFactor: ESTIMATE_MARGIN_FACTOR },
  };
}
