/**
 * Sequencer URL Parameter Encoder / Decoder
 * Serializes groove state into a compact URL-safe base64 string for instant sharing.
 */

import { MAX_NOTE_GATE_STEPS, SequencerPattern, SequencerTrack } from "../types/genre";
import { CLIP_SLOTS, MAX_SECTION_BARS, normaliseFill, type ClipSlot, type SectionOverrides, type SongSection } from "../types/song";

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
    gate?: number[];
    ratchet?: number[];
    probability?: number[];
    trackLength?: number;
    mute?: boolean;
    solo?: boolean;
    volume?: number;
    pan?: number;
    swing?: number;
    sendA?: number;
    sendB?: number;
  }>;
  /**
   * B1 — the arrangement, when the link carries one.
   *
   * Optional: links made before the arrangement existed are still valid, and a decoder that finds none leaves it
   * out (the caller migrates its own chain, exactly as the store does). Sections are validated on the way in with
   * the same suspicion as every other field: a link is untrusted input.
   */
  sections?: SongSection[];
}

/**
 * Maps a sequencer track onto the share payload.
 *
 * Both share entry points (the studio toolbar via `useExportActions`, and the project
 * hub) used to build this object inline, and they diverged: the project hub mapped every
 * field, while the studio toolbar forgot `gate`, `ratchet`, `probability`, `trackLength`,
 * `swing`, `pan`, `sendA` and `sendB`. A link shared from the studio therefore arrived
 * with default gates and a centred, dry mix — even though this codec has always encoded
 * and decoded all of them. One mapper used by every caller is the only shape that cannot
 * drift again.
 */
export function toSharedTrack(track: SequencerTrack): SharedSequencerState["tracks"][number] {
  return {
    track_id: track.track_id,
    name: track.name,
    instrument: track.instrument || "synth",
    steps: track.steps,
    velocity: track.velocity,
    pitch: track.pitch,
    gate: track.gate,
    ratchet: track.ratchet,
    probability: track.probability,
    trackLength: track.trackLength,
    mute: track.mute,
    solo: track.solo,
    volume: track.volume,
    pan: track.pan,
    swing: track.swing,
    sendA: track.sendA,
    sendB: track.sendB,
  };
}

interface CompactTrackPayload {
  id?: string;
  n?: string;
  ins?: string;
  m?: number;
  st?: number[];
  v?: number[];
  p?: (number | null)[];
  gt?: number[];
  r?: number[];
  pr?: number[];
  tl?: number;
  mu?: number;
  so?: number;
  vol?: number;
  pn?: number;
  sw?: number;
  sA?: number;
  sB?: number;
}

/**
 * B5 overrides, compactly.
 *
 * `r` is a section's velocity ramp `[from, to]`; `f` is its fill `[tracks, steps, velocity]`. An object rather than
 * more tuple positions because a fill has three parts of its own, and a tuple whose meaning depends on how many
 * optional fields precede it is exactly the shape that breaks when the next field is added.
 */
interface CompactOverrides {
  r?: [number, number];
  f?: [string[], number[], number];
}

/** Share-link bounds for a section's overrides — small enough that 64 sections cannot blow the URL ceiling. */
const MAX_FILL_TRACKS = 8;
const MAX_FILL_STEPS = 32;
const MAX_RAMP = 4;
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * A section's overrides in share form, or `undefined` when there is nothing worth spending bytes on.
 *
 * The bounds are the encoder's half of the same contract the decoder enforces: a link must never carry a value the
 * reader would refuse, or the app would produce links it cannot open (F-09).
 */
function compactOverrides(section: SongSection): CompactOverrides | undefined {
  const source = section.overrides;
  if (!source || typeof source !== "object") return undefined;
  const out: CompactOverrides = {};

  const ramp = source.velocityRamp;
  if (Array.isArray(ramp) && ramp.length >= 2 && Number.isFinite(ramp[0]) && Number.isFinite(ramp[1])) {
    out.r = [
      round2(Math.max(0, Math.min(MAX_RAMP, ramp[0]))),
      round2(Math.max(0, Math.min(MAX_RAMP, ramp[1]))),
    ];
  }

  const fill = normaliseFill(source.fill);
  if (fill) {
    const tracks = fill.tracks.slice(0, MAX_FILL_TRACKS).map((id) => id.slice(0, 32));
    const steps = fill.steps.slice(0, MAX_FILL_STEPS);
    if (tracks.length && steps.length) out.f = [tracks, steps, fill.velocity ?? 112];
  }

  return Object.keys(out).length ? out : undefined;
}

/**
 * The inverse of {@link compactOverrides}, on data that may be anything at all.
 *
 * Everything is re-bounded here rather than trusted: `normaliseFill` already drops non-finite steps, negative
 * offsets and out-of-range velocities, and the ramp is clamped to the same ceiling the model uses.
 */
function decodeOverrides(raw: unknown): SectionOverrides | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const source = raw as CompactOverrides;
  const out: SectionOverrides = {};

  if (Array.isArray(source.r) && source.r.length >= 2) {
    const [from, to] = source.r;
    if (Number.isFinite(from) && Number.isFinite(to)) {
      out.velocityRamp = [
        Math.max(0, Math.min(MAX_RAMP, Number(from))),
        Math.max(0, Math.min(MAX_RAMP, Number(to))),
      ];
    }
  }

  if (Array.isArray(source.f) && source.f.length >= 2) {
    const [tracks, steps, velocity] = source.f;
    const fill = normaliseFill({
      tracks: Array.isArray(tracks) ? (tracks.filter((id) => typeof id === "string").slice(0, MAX_FILL_TRACKS).map((id) => id.slice(0, 32)) as string[]) : [],
      steps: Array.isArray(steps) ? (steps.filter((step) => typeof step === "number").slice(0, MAX_FILL_STEPS) as number[]) : [],
      velocity: typeof velocity === "number" ? velocity : undefined,
    });
    if (fill) out.fill = fill;
  }

  return Object.keys(out).length ? out : undefined;
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
  /** `[slot, bars, label?, velocityScale?, mute?, overrides?]` per section; absent for a pre-B1 link. */
  sec?: Array<[ClipSlot, number, string?, number?, string[]?, CompactOverrides?]>;
}

const VALID_RESOLUTIONS = new Set(["1/8", "1/16", "1/32"]);
/**
 * Hard ceiling for a shareable URL payload. The decoder rejects anything longer,
 * so the encoder must never emit more than this either (F-09) — otherwise the app
 * generated links it could not open itself.
 */
export const MAX_BASE64_LENGTH = 8192;
const MAX_TRACKS = 16;
const MIN_STEPS = 4;
const MAX_STEPS = 128;
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
        gt: Array.isArray(t.gate) && t.gate.some((g) => g !== 0.8 && g !== 1.0)
          ? t.gate.slice(0, MAX_STEPS).map((g) => Math.round(Math.max(0.1, Math.min(MAX_NOTE_GATE_STEPS, Number(g) || 0.8)) * 10) / 10)
          : undefined,
        r: Array.isArray(t.ratchet) && t.ratchet.some((r) => r > 1)
          ? t.ratchet.slice(0, MAX_STEPS).map((r) => Math.max(1, Math.min(8, Math.round(Number(r) || 1))))
          : undefined,
        pr: Array.isArray(t.probability) && t.probability.some((pr) => pr < 100)
          ? t.probability.slice(0, MAX_STEPS).map((pr) => Math.max(0, Math.min(100, Math.round(Number(pr) || 100))))
          : undefined,
        tl: (t.trackLength && t.trackLength !== totalSteps && t.trackLength >= MIN_STEPS && t.trackLength <= MAX_STEPS)
          ? t.trackLength
          : undefined,
        mu: t.mute ? 1 : undefined,
        so: t.solo ? 1 : undefined,
        vol: t.volume !== undefined && t.volume !== 0.8 ? Math.round(Math.max(0, Math.min(1, t.volume)) * 100) : undefined,
        pn: t.pan !== undefined && t.pan !== 0 ? Math.round(Math.max(-1, Math.min(1, t.pan)) * 100) : undefined,
        sw: t.swing !== undefined && t.swing !== 0 ? Math.round(Math.max(-50, Math.min(50, t.swing))) : undefined,
        sA: t.sendA !== undefined && t.sendA !== 0 ? Math.round(Math.max(0, Math.min(1, t.sendA)) * 100) : undefined,
        sB: t.sendB !== undefined && t.sendB !== 0 ? Math.round(Math.max(0, Math.min(1, t.sendB)) * 100) : undefined,
      });
    }

    /**
     * The arrangement, compactly: a tuple per section, and only the fields that differ from the defaults.
     *
     * A section that cannot be expressed within the bounds is dropped rather than failing the whole link: the link's
     * purpose is to share a groove, and a malformed extra should not make the groove unshareable.
     */
    const compactSections: CompactSharePayload["sec"] = [];
    for (const section of state.sections ?? []) {
      if (!section || typeof section !== "object") continue;
      if (!CLIP_SLOTS.includes(section.slot)) continue;
      const bars = Number(section.bars);
      if (!Number.isInteger(bars) || bars < 1 || bars > MAX_SECTION_BARS) continue;
      const label = typeof section.label === "string" ? section.label.slice(0, 24) : undefined;
      const scale = Number(section.velocityScale);
      const velocityScale = Number.isFinite(scale) && scale !== 1 ? Math.max(0, Math.min(2, scale)) : undefined;
      const mute = Array.isArray(section.mute)
        ? section.mute.filter((id): id is string => typeof id === "string").slice(0, 16).map((id) => id.slice(0, 32))
        : undefined;
      const overrides = compactOverrides(section);
      compactSections.push(
        overrides || mute || velocityScale !== undefined || label
          ? [section.slot, bars, label, velocityScale, mute?.length ? mute : undefined, overrides]
          : [section.slot, bars]
      );
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
      ...(compactSections.length ? { sec: compactSections } : {}),
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

      let gate: number[];
      if (Array.isArray(ct.gt)) {
        if (ct.gt.length > MAX_STEPS) return null;
        gate = ct.gt.slice(0, stepsLen).map((g) => {
          const num = Number(g);
          return (!isNaN(num) && num >= 0.1 && num <= 2.0) ? num : 0.8;
        });
      } else {
        gate = Array(stepsLen).fill(0.8);
      }
      while (gate.length < stepsLen) gate.push(0.8);

      let ratchet: number[];
      if (Array.isArray(ct.r)) {
        if (ct.r.length > MAX_STEPS) return null;
        ratchet = ct.r.slice(0, stepsLen).map((r) => {
          const num = Number(r);
          return (!isNaN(num) && num >= 1 && num <= 8) ? Math.floor(num) : 1;
        });
      } else {
        ratchet = Array(stepsLen).fill(1);
      }
      while (ratchet.length < stepsLen) ratchet.push(1);

      let probability: number[];
      if (Array.isArray(ct.pr)) {
        if (ct.pr.length > MAX_STEPS) return null;
        probability = ct.pr.slice(0, stepsLen).map((pr) => {
          const num = Number(pr);
          return (!isNaN(num) && num >= 0 && num <= 100) ? Math.round(num) : 100;
        });
      } else {
        probability = Array(stepsLen).fill(100);
      }
      while (probability.length < stepsLen) probability.push(100);

      const rawPan = ct.pn !== undefined ? Number(ct.pn) : 0;
      const pan = !isNaN(rawPan) ? Math.max(-1, Math.min(1, rawPan / 100)) : 0;

      const rawTrackSwing = ct.sw !== undefined ? Number(ct.sw) : 0;
      const trackSwing = !isNaN(rawTrackSwing) ? Math.max(-50, Math.min(50, rawTrackSwing)) : 0;

      const rawSendA = ct.sA !== undefined ? Number(ct.sA) : 0;
      const sendA = !isNaN(rawSendA) ? Math.max(0, Math.min(1, rawSendA / 100)) : 0;

      const rawSendB = ct.sB !== undefined ? Number(ct.sB) : 0;
      const sendB = !isNaN(rawSendB) ? Math.max(0, Math.min(1, rawSendB / 100)) : 0;

      const rawTl = ct.tl !== undefined ? Number(ct.tl) : undefined;
      const trackLength = (rawTl !== undefined && !isNaN(rawTl) && rawTl >= MIN_STEPS && rawTl <= MAX_STEPS)
        ? rawTl
        : totalSteps;

      tracks.push({
        track_id: String(ct.id || "track").slice(0, 32),
        name: String(ct.n || "Track").slice(0, 48),
        instrument: String(ct.ins || "synth").slice(0, 32),
        steps,
        velocity,
        pitch,
        gate,
        ratchet,
        probability,
        trackLength,
        mute: Boolean(ct.mu),
        solo: Boolean(ct.so),
        volume: vol,
        pan,
        swing: trackSwing,
        sendA,
        sendB,
      });
    }

    /**
     * The arrangement, validated the same way as the rest of an untrusted payload: a tuple that does not fit the
     * bounds is dropped, not trusted, and an absent field stays absent (the caller migrates its own chain).
     */
    const sections: SongSection[] = [];
    if (Array.isArray(payload.sec)) {
      for (const raw of payload.sec.slice(0, 64)) {
        if (!Array.isArray(raw) || raw.length < 2) continue;
        const [slot, bars, label, velocityScale, mute, overrides] = raw as [
          unknown,
          unknown,
          unknown,
          unknown,
          unknown,
          unknown,
        ];
        if (typeof slot !== "string" || !CLIP_SLOTS.includes(slot as ClipSlot)) continue;
        const barCount = Number(bars);
        if (!Number.isInteger(barCount) || barCount < 1 || barCount > MAX_SECTION_BARS) continue;
        const section: SongSection = { id: `share-s${sections.length + 1}`, slot: slot as ClipSlot, bars: barCount };
        if (typeof label === "string" && label) section.label = label.slice(0, 24);
        const scale = Number(velocityScale);
        if (Number.isFinite(scale) && scale !== 0) section.velocityScale = Math.max(0, Math.min(2, scale));
        if (Array.isArray(mute)) {
          const ids = mute.filter((id): id is string => typeof id === "string").slice(0, 16).map((id) => id.slice(0, 32));
          if (ids.length) section.mute = ids;
        }
        const decoded = decodeOverrides(overrides);
        if (decoded) section.overrides = decoded;
        sections.push(section);
      }
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
      ...(sections.length ? { sections } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Returns full shareable URL with encoded query parameter
 */
export interface ShareUrlResult {
  url: string;
  /** True when optional detail (pitch/gate/ratchet/probability/mixer) had to be dropped. */
  degraded: boolean;
  /** Machine-readable failure reason when `url` is empty. */
  reason?: "too-large" | "invalid-input";
}

/**
 * Builds a share URL and reports whether fidelity had to be reduced (F-09).
 *
 * The full-fidelity payload is tried first; if it exceeds the URL budget we retry
 * with the optional per-step arrays stripped, which is still a playable pattern.
 * If even that does not fit we fail loudly instead of producing a link the decoder
 * would silently reject.
 */
export function getShareUrlResult(state: SharedSequencerState): ShareUrlResult {
  const baseUrl = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";

  const full = encodeSharedSequencer(state);
  if (full && full.length <= MAX_BASE64_LENGTH) {
    return { url: `${baseUrl}?groove=${full}`, degraded: false };
  }

  const reduced: SharedSequencerState = {
    ...state,
    tracks: state.tracks.map((t) => ({
      track_id: t.track_id,
      name: t.name,
      instrument: t.instrument,
      steps: t.steps,
      velocity: t.velocity,
      pitch: undefined,
      gate: undefined,
      ratchet: undefined,
      probability: undefined,
      trackLength: undefined,
      mute: t.mute,
      solo: t.solo,
      volume: t.volume,
    })),
  };
  const lean = encodeSharedSequencer(reduced);
  if (lean && lean.length <= MAX_BASE64_LENGTH) {
    return { url: `${baseUrl}?groove=${lean}`, degraded: true };
  }

  return {
    url: "",
    degraded: false,
    reason: full === "" ? "invalid-input" : "too-large",
  };
}

export function getShareUrl(state: SharedSequencerState): string {
  return getShareUrlResult(state).url;
}
