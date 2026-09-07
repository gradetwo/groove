/**
 * Sequencer URL Parameter Encoder / Decoder
 * Serializes groove state into a compact URL-safe base64 string for instant sharing.
 */

import { SequencerPattern, SequencerTrack } from "../types/genre";

export interface SharedSequencerState {
  genreId: string;
  bpm: number;
  swing: number;
  scale?: string;
  timeSignature?: string;
  resolution?: "1/8" | "1/16" | "1/32";
  totalSteps?: number;
  tracks: Array<{
    track_id: string;
    name: string;
    instrument: string;
    steps: number[];
    velocity?: number[];
    pitch?: (number | null)[];
    mute?: boolean;
    solo?: boolean;
    volume?: number;
  }>;
}

/**
 * Encodes sequencer state to URL-safe Base64 string
 */
export function encodeSharedSequencer(state: SharedSequencerState): string {
  try {
    const compactTracks = state.tracks.map((t) => {
      const hasMultiVal = t.steps.some((s) => s > 1) || t.steps.length !== 16;
      let mask = 0;
      for (let i = 0; i < Math.min(16, t.steps.length); i++) {
        if (t.steps[i] > 0) {
          mask |= (1 << i);
        }
      }

      return {
        id: t.track_id,
        n: t.name,
        ins: t.instrument,
        m: mask,
        st: hasMultiVal ? t.steps : undefined,
        v: t.velocity && t.velocity.some((v) => v !== 100) ? t.velocity : undefined,
        p: t.pitch && t.pitch.some((p) => p !== null && p !== undefined) ? t.pitch : undefined,
        mu: t.mute ? 1 : undefined,
        so: t.solo ? 1 : undefined,
        vol: t.volume !== undefined && t.volume !== 0.8 ? Math.round(t.volume * 100) : undefined,
      };
    });

    const payload = {
      g: state.genreId,
      b: state.bpm,
      s: state.swing,
      sc: state.scale || "C minor",
      ts: state.timeSignature || "4/4",
      rs: state.resolution || "1/16",
      stLen: state.totalSteps || state.tracks[0]?.steps?.length || 16,
      t: compactTracks,
    };

    const jsonStr = JSON.stringify(payload);
    const base64 = btoa(unescape(encodeURIComponent(jsonStr)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return base64;
  } catch (err) {
    return "";
  }
}

/**
 * Decodes URL-safe Base64 string back into SharedSequencerState
 */
export function decodeSharedSequencer(encoded: string): SharedSequencerState | null {
  try {
    if (!encoded || typeof encoded !== "string") return null;
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const jsonStr = decodeURIComponent(escape(atob(base64)));
    const payload = JSON.parse(jsonStr);

    if (!payload.g || !payload.t || !Array.isArray(payload.t)) {
      return null;
    }

    const tracks = payload.t.map((ct: any) => {
      let steps: number[];
      if (Array.isArray(ct.st) && ct.st.length > 0) {
        steps = ct.st;
      } else {
        const mask = ct.m || 0;
        steps = [];
        for (let i = 0; i < 16; i++) {
          steps.push((mask & (1 << i)) !== 0 ? 1 : 0);
        }
      }

      const stepsLen = steps.length;
      return {
        track_id: ct.id || "track",
        name: ct.n || "Track",
        instrument: ct.ins || "synth",
        steps,
        velocity: ct.v || Array(stepsLen).fill(100),
        pitch: ct.p || Array(stepsLen).fill(null),
        mute: Boolean(ct.mu),
        solo: Boolean(ct.so),
        volume: ct.vol !== undefined ? ct.vol / 100 : 0.8,
      };
    });

    return {
      genreId: payload.g,
      bpm: Number(payload.b) || 120,
      swing: Number(payload.s) || 0,
      scale: payload.sc || "C minor",
      timeSignature: payload.ts || "4/4",
      resolution: payload.rs || "1/16",
      totalSteps: Number(payload.stLen) || (tracks[0] ? tracks[0].steps.length : 16),
      tracks,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Returns full shareable URL with encoded query parameter
 */
export function getShareUrl(state: SharedSequencerState): string {
  const code = encodeSharedSequencer(state);
  const baseUrl = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  return `${baseUrl}?groove=${code}`;
}
