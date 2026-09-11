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

    if (!payload.g || typeof payload.g !== "string" || payload.g.length > 64) {
      return null;
    }
    if (!payload.t || !Array.isArray(payload.t) || payload.t.length === 0 || payload.t.length > 16) {
      return null;
    }

    const rawTotalSteps = Number(payload.stLen);
    const totalSteps = (!isNaN(rawTotalSteps) && rawTotalSteps >= 4 && rawTotalSteps <= 64)
      ? Math.floor(rawTotalSteps)
      : 16;

    const rawBpm = Number(payload.b);
    const bpm = (!isNaN(rawBpm) && rawBpm >= 20 && rawBpm <= 300)
      ? Math.round(rawBpm)
      : 120;

    const rawSwing = Number(payload.s);
    const swing = (!isNaN(rawSwing) && rawSwing >= 0 && rawSwing <= 100)
      ? Math.round(rawSwing)
      : 0;

    const validResolutions = ["1/8", "1/16", "1/32"] as const;
    const resolution = validResolutions.includes(payload.rs) ? payload.rs : "1/16";

    const tracks = payload.t.slice(0, 16).map((ct: any) => {
      let rawSteps: number[];
      if (Array.isArray(ct.st) && ct.st.length > 0) {
        rawSteps = ct.st.slice(0, totalSteps);
      } else {
        const mask = ct.m || 0;
        rawSteps = [];
        for (let i = 0; i < Math.min(16, totalSteps); i++) {
          rawSteps.push((mask & (1 << i)) !== 0 ? 1 : 0);
        }
      }

      // Ensure length matches totalSteps
      while (rawSteps.length < totalSteps) {
        rawSteps.push(0);
      }

      // Step values must be in range 0..3
      const steps = rawSteps.map((s) => {
        const num = Number(s);
        return (!isNaN(num) && num >= 0 && num <= 3) ? Math.floor(num) : 0;
      });

      const stepsLen = steps.length;

      const velocity = Array.isArray(ct.v)
        ? ct.v.slice(0, stepsLen).map((v: any) => Math.max(0, Math.min(127, Number(v) || 100)))
        : Array(stepsLen).fill(100);
      while (velocity.length < stepsLen) velocity.push(100);

      const pitch = Array.isArray(ct.p)
        ? ct.p.slice(0, stepsLen).map((p: any) => (p !== null && !isNaN(Number(p))) ? Math.max(0, Math.min(127, Math.round(Number(p)))) : null)
        : Array(stepsLen).fill(null);
      while (pitch.length < stepsLen) pitch.push(null);

      const vol = ct.vol !== undefined ? Math.max(0, Math.min(1, Number(ct.vol) / 100)) : 0.8;

      return {
        track_id: String(ct.id || "track").slice(0, 32),
        name: String(ct.n || "Track").slice(0, 48),
        instrument: String(ct.ins || "synth").slice(0, 32),
        steps,
        velocity,
        pitch,
        mute: Boolean(ct.mu),
        solo: Boolean(ct.so),
        volume: vol,
      };
    });

    return {
      genreId: String(payload.g),
      bpm,
      swing,
      scale: typeof payload.sc === "string" ? payload.sc.slice(0, 32) : "C minor",
      timeSignature: typeof payload.ts === "string" ? payload.ts.slice(0, 16) : "4/4",
      resolution,
      totalSteps,
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
  if (!code) return "";
  const baseUrl = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  return `${baseUrl}?groove=${code}`;
}
