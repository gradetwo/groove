/**
 * Sequencer URL Parameter Encoder / Decoder
 * Serializes groove state into a compact URL-safe base64 string for instant sharing.
 */

export interface SharedTrackState {
  name: string;
  steps: Array<{
    active: boolean;
    velocity?: number;
    pitch?: number;
  }>;
  mute?: boolean;
  solo?: boolean;
  volume?: number;
}

export interface SharedSequencerState {
  genreId: string;
  bpm: number;
  swing: number;
  scaleKey?: string;
  scaleMode?: string;
  tracks: SharedTrackState[];
}

/**
 * Encodes sequencer state to URL-safe Base64 string
 */
export function encodeSharedSequencer(state: SharedSequencerState): string {
  try {
    // Compact format:
    // [genreId, bpm, swing, scaleKey, scaleMode, [ [name, bitmask16, [velocities], [pitches]] ]]
    const compactTracks = state.tracks.map((t) => {
      let mask = 0;
      const vels: number[] = [];
      const pitches: number[] = [];

      (t.steps || []).forEach((step, idx) => {
        if (step.active) {
          mask |= (1 << idx);
          if (step.velocity !== undefined && step.velocity !== 0.8) {
            vels.push(Math.round(step.velocity * 100));
          } else {
            vels.push(-1); // default
          }
          if (step.pitch !== undefined && step.pitch !== 0) {
            pitches.push(step.pitch);
          } else {
            pitches.push(0);
          }
        }
      });

      return {
        n: t.name,
        m: mask,
        v: vels.some((v) => v !== -1) ? vels : undefined,
        p: pitches.some((p) => p !== 0) ? pitches : undefined,
        mu: t.mute ? 1 : undefined,
        so: t.solo ? 1 : undefined,
        vol: t.volume !== undefined && t.volume !== 1 ? t.volume : undefined,
      };
    });

    const payload = {
      g: state.genreId,
      b: state.bpm,
      s: state.swing,
      k: state.scaleKey || "C",
      m: state.scaleMode || "minor",
      t: compactTracks,
    };

    const jsonStr = JSON.stringify(payload);
    // Base64 encode safe for URLs
    const base64 = btoa(unescape(encodeURIComponent(jsonStr)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return base64;
  } catch (err) {
    console.error("Failed to encode sequencer state", err);
    return "";
  }
}

/**
 * Decodes URL-safe Base64 string back into SharedSequencerState
 */
export function decodeSharedSequencer(encoded: string): SharedSequencerState | null {
  try {
    if (!encoded || typeof encoded !== "string") return null;
    // Restore standard base64
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const jsonStr = decodeURIComponent(escape(atob(base64)));
    const payload = JSON.parse(jsonStr);

    if (!payload.g || !payload.t || !Array.isArray(payload.t)) {
      return null;
    }

    const tracks: SharedTrackState[] = payload.t.map((ct: any) => {
      const mask = ct.m || 0;
      const vels: number[] = ct.v || [];
      const pitches: number[] = ct.p || [];
      let activeCounter = 0;

      const steps = [];
      for (let i = 0; i < 16; i++) {
        const isActive = (mask & (1 << i)) !== 0;
        let vel = 0.8;
        let pitch = 0;
        if (isActive) {
          if (vels[activeCounter] !== undefined && vels[activeCounter] !== -1) {
            vel = vels[activeCounter] / 100;
          }
          if (pitches[activeCounter] !== undefined) {
            pitch = pitches[activeCounter];
          }
          activeCounter++;
        }
        steps.push({
          active: isActive,
          velocity: vel,
          pitch,
        });
      }

      return {
        name: ct.n || "Track",
        steps,
        mute: !!ct.mu,
        solo: !!ct.so,
        volume: ct.vol !== undefined ? ct.vol : 1.0,
      };
    });

    return {
      genreId: payload.g,
      bpm: Number(payload.b) || 120,
      swing: Number(payload.s) || 0,
      scaleKey: payload.k || "C",
      scaleMode: payload.m || "minor",
      tracks,
    };
  } catch (err) {
    // Invalid base64 or json payload
    return null;
    return null;
  }
}

/**
 * Returns full shareable URL with encoded hash or search query
 */
export function getShareUrl(state: SharedSequencerState): string {
  const code = encodeSharedSequencer(state);
  const baseUrl = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  return `${baseUrl}?groove=${code}`;
}
