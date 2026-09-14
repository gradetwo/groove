/**
 * Runtime validation for untrusted share payloads (F-08).
 *
 * Share payloads arrive from `location.href` (`/#/maker?share=…`) and from dropped
 * `.groove` files, so every field is attacker-controlled. The previous decoder did
 * `JSON.parse(json) as ShareableCustomGenrePayload` plus a couple of truthiness
 * checks, which meant:
 *   - `n` / `cat` could be objects and crash React during render,
 *   - `steps` could be a million-element array or a string,
 *   - `bpm: 1e999` became Infinity and poisoned every downstream calculation,
 *   - a small deflate payload could expand without bound (decompression bomb).
 *
 * This module validates the decoded JSON field by field and returns a sanitised,
 * freshly-constructed object — never the parsed object itself, so `__proto__` and
 * prototype pollution cannot survive.
 */
import { ShareableCustomGenrePayload } from "../../types/customGenre";

/** Largest base64 payload we will even attempt to decode. */
export const MAX_ENCODED_LENGTH = 48_000;

/** Largest decompressed JSON we will accept (defends against decompression bombs). */
export const MAX_DECOMPRESSED_BYTES = 512 * 1024;

/** Structural limits mirroring the sequencer's real capabilities. */
export const MAX_TRACKS = 16;
export const MAX_STEPS = 64;
export const MAX_TEXT_LENGTH = 200;

const ALLOWED_TRACK_IDS = new Set([
  "kick",
  "snare",
  "hihat",
  "percussion",
  "bass",
  "chords",
  "lead",
  "fx",
]);

const ALLOWED_CATEGORIES = new Set([
  "Electronic",
  "Rock",
  "HipHop",
  "Jazz",
  "Pop",
  "Latin",
]);

export type SharePayloadValidation =
  | { ok: true; payload: ShareableCustomGenrePayload }
  | { ok: false; reason: string };

function asText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function asNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function asNumberArray(value: unknown, min: number, max: number, length: number): number[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > length) return null;
  const out: number[] = [];
  for (const item of value) {
    const num = asNumber(item, min, max);
    if (num === null) return null;
    out.push(num);
  }
  while (out.length < length) out.push(0);
  return out;
}

/** Pitch arrays are the one wire field that legitimately contains `null` (no note). */
function asPitchArray(value: unknown, length: number): (number | null)[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > length) return null;
  const out: (number | null)[] = [];
  for (const item of value) {
    if (item === null || item === undefined) {
      out.push(null);
      continue;
    }
    const num = asNumber(item, 0, 127);
    if (num === null) return null;
    out.push(Math.round(num));
  }
  while (out.length < length) out.push(null);
  return out;
}

function asBilingual(value: unknown): { en: string; zh: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const en = asText(record.en);
  const zh = asText(record.zh);
  if (en === null || zh === null) return null;
  return { en, zh };
}

function asStringArray(value: unknown, maxItems = 24): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const out: string[] = [];
  for (const item of value) {
    const text = asText(item);
    if (text === null) return null;
    out.push(text);
  }
  return out;
}

/**
 * Validates a raw JSON string into a sanitised share payload.
 * Never throws; returns a discriminated result instead.
 */
export function validateSharePayload(json: string): SharePayloadValidation {
  if (typeof json !== "string" || json.length === 0) {
    return { ok: false, reason: "empty payload" };
  }
  if (json.length > MAX_DECOMPRESSED_BYTES) {
    return { ok: false, reason: "payload too large" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: "malformed JSON" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "payload is not an object" };
  }
  const raw = parsed as Record<string, unknown>;

  if (raw.v !== 1) return { ok: false, reason: "unsupported payload version" };

  const name = asText(raw.n);
  if (!name) return { ok: false, reason: "missing genre name" };

  const category = asText(raw.cat, 32);

  const bpm = raw.bpm === undefined ? 120 : asNumber(raw.bpm, 20, 300);
  if (bpm === null) return { ok: false, reason: "bpm out of range" };

  const radar: [number, number, number, number, number, number] = [5, 5, 5, 5, 5, 5];
  if (raw.r !== undefined) {
    const parsedRadar = asNumberArray(raw.r, 1, 10, 6);
    if (!parsedRadar) return { ok: false, reason: "invalid radar metrics" };
    for (let i = 0; i < 6; i++) radar[i] = Math.round(parsedRadar[i]);
  }

  if (!Array.isArray(raw.tracks)) return { ok: false, reason: "missing tracks" };
  if (raw.tracks.length === 0 || raw.tracks.length > MAX_TRACKS) {
    return { ok: false, reason: "track count out of range" };
  }

  const tracks: ShareableCustomGenrePayload["tracks"] = [];
  for (const entry of raw.tracks) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, reason: "invalid track entry" };
    }
    const track = entry as Record<string, unknown>;

    const trackId = asText(track.t, 32);
    if (!trackId || !ALLOWED_TRACK_IDS.has(trackId)) {
      return { ok: false, reason: "unknown track id" };
    }

    const stepCount = Array.isArray(track.s) ? track.s.length : 0;
    if (stepCount === 0 || stepCount > MAX_STEPS) {
      return { ok: false, reason: "invalid step count" };
    }

    const steps = asNumberArray(track.s, 0, 3, stepCount);
    if (!steps) return { ok: false, reason: "invalid step values" };

    const gate = track.g === undefined ? undefined : asNumberArray(track.g, 0.05, 4, steps.length);
    if (track.g !== undefined && !gate) return { ok: false, reason: "invalid gate array" };

    const pitch = track.p === undefined ? undefined : asPitchArray(track.p, steps.length);
    if (track.p !== undefined && !pitch) return { ok: false, reason: "invalid pitch array" };

    // `v` is the track volume in the wire format (not a velocity array).
    const volume = track.v === undefined ? undefined : asNumber(track.v, 0, 2);
    if (track.v !== undefined && volume === null) {
      return { ok: false, reason: "invalid track volume" };
    }

    tracks.push({
      t: trackId as ShareableCustomGenrePayload["tracks"][number]["t"],
      s: steps,
      ...(gate ? { g: gate } : {}),
      ...(pitch ? { p: pitch } : {}),
      ...(volume !== undefined && volume !== null ? { v: volume } : {}),
      ...(typeof track.m === "boolean" ? { m: track.m } : {}),
      ...(typeof track.sw === "number" && Number.isFinite(track.sw)
        ? { sw: Math.max(-50, Math.min(50, track.sw)) }
        : {}),
    });
  }

  const context = raw.ctx === undefined ? undefined : asBilingual(raw.ctx);
  if (raw.ctx !== undefined && !context) return { ok: false, reason: "invalid cultural context" };

  const place = raw.plc === undefined ? undefined : asBilingual(raw.plc);
  if (raw.plc !== undefined && !place) return { ok: false, reason: "invalid origin place" };

  const artists = raw.art === undefined ? undefined : asStringArray(raw.art);
  if (raw.art !== undefined && !artists) return { ok: false, reason: "invalid artist list" };

  const id = asText(raw.id, 64) ?? `custom-${Date.now()}`;
  const timeSignature = asText(raw.ts, 16) ?? "4/4";
  const scale = asText(raw.scale, 32) ?? "C minor";
  const originYear = asText(raw.yr, 16);
  const author = asText(raw.author, 64);
  const fork = asText(raw.fork, 64);
  const forkName = asText(raw.forkName, 64);

  // Rebuild from scratch: only whitelisted fields survive, so prototype pollution
  // (`__proto__`) and unexpected shapes cannot pass through.
  const payload: ShareableCustomGenrePayload = {
    v: 1,
    id,
    n: name,
    cat: (category && ALLOWED_CATEGORIES.has(category)
      ? category
      : "Electronic") as ShareableCustomGenrePayload["cat"],
    bpm,
    ts: timeSignature,
    scale,
    r: radar,
    ctx: context ?? {
      en: `Custom music genre variation: ${name}`,
      zh: `自定义音乐流派变奏：${name}`,
    },
    tracks,
    ...(place ? { plc: place } : {}),
    ...(originYear ? { yr: originYear } : {}),
    ...(artists ? { art: artists } : {}),
    ...(author ? { author } : {}),
    ...(fork ? { fork } : {}),
    ...(forkName ? { forkName } : {}),
  };

  return { ok: true, payload };
}
