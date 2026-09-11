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

interface CompactTrackPayload {
  id?: string;
  n?: string;
  ins?: string;
  m?: number;
  st?: number[];
  v?: number[];
  p?: (number | null)[];
  mu?: number;
  so?: number;
  vol?: number;
}

interface CompactSharePayload {
  g: string;
  b: number;
  s: number;
  sc?: string;
  ts?: string;
  rs?: "1/8" | "1/16" | "1/32";
  stLen?: number;
  t: CompactTrackPayload[];
}

const VALID_RESOLUTIONS = new Set(["1/8", "1/16", "1/32"]);
const MAX_BASE64_LENGTH = 8192;
const MAX_TRACKS = 16;
const MIN_STEPS = 4;
const MAX_STEPS = 64;
const MIN_BPM = 20;
const MAX_BPM = 300;
const MIN_SWING = 0;
const MAX_SWING = 100;

/**
 * Encodes sequencer state to URL-safe Base64 string
 */
export function encodeSharedSequencer(state: SharedSequencerState): string {
  try {
    if (!state || typeof state !== "object") return "";
    if (!state.genreId || typeof state.genreId !== "string" || state.genreId.length > 64) return "";
    if (typeof state.bpm !== "number" || isNaN(state.bpm) || state.bpm < MIN_BPM || state.bpm > MAX_BPM) return "";
    if (typeof state.swing !== "number" || isNaN(state.swing) || state.swing < MIN_SWING || state.swing > MAX_SWING) return "";
    if (!Array.isArray(state.tracks) || state.tracks.length === 0 || state.tracks.length > MAX_TRACKS) return "";

    const totalSteps = state.totalSteps !== undefined
      ? state.totalSteps
      : (state.tracks[0]?.steps?.length || 16);

    if (typeof totalSteps !== "number" || isNaN(totalSteps) || !Number.isInteger(totalSteps) || totalSteps < MIN_STEPS || totalSteps > MAX_STEPS) {
      return "";
    }

    const compactTracks: CompactTrackPayload[] = [];
    for (const t of state.tracks) {
      if (!t || typeof t !== "object") return "";
      if (!Array.isArray(t.steps) || t.steps.length === 0 || t.steps.length > MAX_STEPS) return "";
      for (const s of t.steps) {
        if (typeof s !== "number" || isNaN(s) || !Number.isInteger(s) || s < 0 || s > 3) {
          return "";
        }
      }

      const hasMultiVal = t.steps.some((s) => s > 1) || t.steps.length !== 16;
      let mask = 0;
      for (let i = 0; i < Math.min(16, t.steps.length); i++) {
        if (t.steps[i] > 0) {
          mask |= (1 << i);
        }
      }

      compactTracks.push({
        id: typeof t.track_id === "string" ? t.track_id.slice(0, 32) : "track",
        n: typeof t.name === "string" ? t.name.slice(0, 48) : "Track",
        ins: typeof t.instrument === "string" ? t.instrument.slice(0, 32) : "synth",
        m: mask,
        st: hasMultiVal ? t.steps.slice(0, MAX_STEPS) : undefined,
        v: Array.isArray(t.velocity) && t.velocity.some((v) => v !== 100)
          ? t.velocity.slice(0, MAX_STEPS).map((v) => Math.max(0, Math.min(127, Number(v) || 100)))
          : undefined,
        p: Array.isArray(t.pitch) && t.pitch.some((p) => p !== null && p !== undefined)
          ? t.pitch.slice(0, MAX_STEPS).map((p) => (p !== null && !isNaN(Number(p))) ? Math.max(0, Math.min(127, Math.round(Number(p)))) : null)
          : undefined,
        mu: t.mute ? 1 : undefined,
        so: t.solo ? 1 : undefined,
        vol: t.volume !== undefined && t.volume !== 0.8 ? Math.round(Math.max(0, Math.min(1, t.volume)) * 100) : undefined,
      });
    }

    const payload: CompactSharePayload = {
      g: state.genreId,
      b: Math.round(state.bpm),
      s: Math.round(state.swing),
      sc: typeof state.scale === "string" ? state.scale.slice(0, 32) : "C minor",
      ts: typeof state.timeSignature === "string" ? state.timeSignature.slice(0, 16) : "4/4",
      rs: (state.resolution && VALID_RESOLUTIONS.has(state.resolution)) ? state.resolution : "1/16",
      stLen: totalSteps,
      t: compactTracks,
    };

    const jsonStr = JSON.stringify(payload);
    const base64 = btoa(unescape(encodeURIComponent(jsonStr)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return base64;
  } catch {
    return "";
  }
}

/**
 * Decodes URL-safe Base64 string back into SharedSequencerState
 */
export function decodeSharedSequencer(encoded: string): SharedSequencerState | null {
  try {
    if (!encoded || typeof encoded !== "string" || encoded.length > MAX_BASE64_LENGTH) return null;
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const jsonStr = decodeURIComponent(escape(atob(base64)));
    const payload = JSON.parse(jsonStr) as Partial<CompactSharePayload>;

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    if (!payload.g || typeof payload.g !== "string" || payload.g.length === 0 || payload.g.length > 64) {
      return null;
    }
    if (!payload.t || !Array.isArray(payload.t) || payload.t.length === 0 || payload.t.length > MAX_TRACKS) {
      return null;
    }

    // BPM bounds check
    const rawBpm = Number(payload.b);
    if (isNaN(rawBpm) || rawBpm < MIN_BPM || rawBpm > MAX_BPM) {
      return null;
    }
    const bpm = Math.round(rawBpm);

    // Swing bounds check
    const rawSwing = Number(payload.s);
    if (isNaN(rawSwing) || rawSwing < MIN_SWING || rawSwing > MAX_SWING) {
      return null;
    }
    const swing = Math.round(rawSwing);

    // Step length bounds check: if stLen is specified, it MUST be an integer in 4..64
    let totalSteps = 16;
    if (payload.stLen !== undefined) {
      const rawTotalSteps = Number(payload.stLen);
      if (isNaN(rawTotalSteps) || !Number.isInteger(rawTotalSteps) || rawTotalSteps < MIN_STEPS || rawTotalSteps > MAX_STEPS) {
        return null;
      }
      totalSteps = rawTotalSteps;
    }

    const resolution = (typeof payload.rs === "string" && VALID_RESOLUTIONS.has(payload.rs))
      ? (payload.rs as "1/8" | "1/16" | "1/32")
      : "1/16";

    const tracks = [];
    for (const ct of payload.t) {
      if (!ct || typeof ct !== "object" || Array.isArray(ct)) {
        return null;
      }

      let rawSteps: number[];
      if (Array.isArray(ct.st) && ct.st.length > 0) {
        if (ct.st.length > MAX_STEPS) return null;
        rawSteps = ct.st.slice(0, totalSteps);
        // Validate each step strictly
        for (const s of ct.st) {
          const num = Number(s);
          if (isNaN(num) || !Number.isInteger(num) || num < 0 || num > 3) {
            return null;
          }
        }
      } else {
        const mask = ct.m !== undefined ? Number(ct.m) : 0;
        if (isNaN(mask) || mask < 0) return null;
        rawSteps = [];
        for (let i = 0; i < Math.min(16, totalSteps); i++) {
          rawSteps.push((mask & (1 << i)) !== 0 ? 1 : 0);
        }
      }

      // Pad up to totalSteps if shorter
      while (rawSteps.length < totalSteps) {
        rawSteps.push(0);
      }

      const steps = rawSteps.map((s) => {
        const num = Number(s);
        return (!isNaN(num) && num >= 0 && num <= 3) ? Math.floor(num) : 0;
      });

      const stepsLen = steps.length;

      let velocity: number[];
      if (Array.isArray(ct.v)) {
        if (ct.v.length > MAX_STEPS) return null;
        velocity = ct.v.slice(0, stepsLen).map((v) => {
          const num = Number(v);
          return isNaN(num) ? 100 : Math.max(0, Math.min(127, Math.round(num)));
        });
      } else {
        velocity = Array(stepsLen).fill(100);
      }
      while (velocity.length < stepsLen) velocity.push(100);

      let pitch: (number | null)[];
      if (Array.isArray(ct.p)) {
        if (ct.p.length > MAX_STEPS) return null;
        pitch = ct.p.slice(0, stepsLen).map((p) => {
          if (p === null || p === undefined) return null;
          const num = Number(p);
          return (!isNaN(num) && num >= 0 && num <= 127) ? Math.round(num) : null;
        });
      } else {
        pitch = Array(stepsLen).fill(null);
      }
      while (pitch.length < stepsLen) pitch.push(null);

      const rawVol = ct.vol !== undefined ? Number(ct.vol) : 80;
      const vol = !isNaN(rawVol) ? Math.max(0, Math.min(1, rawVol / 100)) : 0.8;

      tracks.push({
        track_id: String(ct.id || "track").slice(0, 32),
        name: String(ct.n || "Track").slice(0, 48),
        instrument: String(ct.ins || "synth").slice(0, 32),
        steps,
        velocity,
        pitch,
        mute: Boolean(ct.mu),
        solo: Boolean(ct.so),
        volume: vol,
      });
    }

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
  } catch {
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
