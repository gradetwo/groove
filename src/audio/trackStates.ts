import { SequencerPattern } from "../types/genre";

/**
 * Per-track mixer state shared by the realtime engine and the offline renderers.
 *
 * F-03: previously the live engine derived this from the pattern while the WAV
 * exporter silently defaulted to `{mute:false, volume:0.8, pan:0}` whenever the
 * caller did not pass it — so exported masters ignored the mixer. Both paths now
 * call `deriveTrackStates`, which makes drift impossible.
 */
export interface TrackState {
  mute: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  sendA?: number;
  sendB?: number;
  /** Polarity inversion (Ø): multiplies the channel by -1. */
  phaseInvert?: boolean;
}

export const DEFAULT_TRACK_VOLUME = 0.8;

export function deriveTrackStates(pattern: Pick<SequencerPattern, "tracks"> | null | undefined): TrackState[] {
  if (!pattern?.tracks) return [];
  return pattern.tracks.map((t) => ({
    mute: Boolean(t.mute),
    solo: Boolean(t.solo),
    volume: Number.isFinite(t.volume) ? (t.volume as number) : DEFAULT_TRACK_VOLUME,
    pan: Number.isFinite(t.pan) ? (t.pan as number) : 0,
    sendA: Number.isFinite(t.sendA) ? (t.sendA as number) : 0,
    sendB: Number.isFinite(t.sendB) ? (t.sendB as number) : 0,
    phaseInvert: Boolean(t.phaseInvert),
  }));
}
