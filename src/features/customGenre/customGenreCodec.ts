import { CustomGenre, ShareableCustomGenrePayload, RADAR_KEYS_ORDER } from "../../types/customGenre";
import { Genre, GenreCategory, GenreRadarMetrics, SequencerTrack } from "../../types/genre";
import { MAX_DECOMPRESSED_BYTES, MAX_ENCODED_LENGTH, validateSharePayload } from "./sharePayloadGuard";

/**
 * Standard 8 track definitions used to reconstruct full track objects
 */
const DEFAULT_TRACK_NAMES: Record<string, string> = {
  kick: "Kick 909",
  snare: "Snare Crisp",
  hihat: "Closed Hat",
  percussion: "Perc Shaker",
  bass: "Acid Bass 303",
  chords: "Poly Pad",
  lead: "Analog Lead",
  fx: "Noise Sweep",
};

/**
 * Encodes a CustomGenre (or standard Genre) into a compact shareable URL string
 */
export async function encodeGenreToSharePayload(genre: CustomGenre | Genre): Promise<string> {
  const radar = genre.radar_metrics || {
    groove: 5,
    brightness: 5,
    harmonicComplexity: 5,
    rhythmDensity: 5,
    bassEnergy: 5,
    melodicFocus: 5,
  };

  const payload: ShareableCustomGenrePayload = {
    v: 1,
    id: genre.id,
    n: genre.name,
    cat: genre.category,
    bpm: genre.default_bpm,
    ts: genre.time_signature || "4/4",
    scale: genre.sequencer_pattern?.scale || "C Minor",
    r: [
      radar.groove,
      radar.brightness,
      radar.harmonicComplexity,
      radar.rhythmDensity,
      radar.bassEnergy,
      radar.melodicFocus,
    ],
    ctx: {
      en: genre.cultural_context?.en || "",
      zh: genre.cultural_context?.zh || "",
    },
    plc: genre.origin_place,
    yr: genre.origin_year,
    art: genre.representative_artists,
    author: (genre as CustomGenre).authorName,
    fork: (genre as CustomGenre).forkedFromId,
    forkName: (genre as CustomGenre).forkedFromName,
    tracks: (genre.sequencer_pattern?.tracks || []).map((t) => ({
      t: t.track_id,
      s: t.steps,
      p: t.pitch,
      g: t.gate,
      v: t.volume,
      m: t.mute,
      sw: t.swing,
    })),
  };

  const json = JSON.stringify(payload);
  const utf8Bytes = new TextEncoder().encode(json);

  // Attempt deflate compression if available in browser
  if (typeof CompressionStream !== "undefined") {
    try {
      const stream = new Blob([utf8Bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
      const compressedBuffer = await new Response(stream).arrayBuffer();
      const compressedBytes = new Uint8Array(compressedBuffer);
      return "c." + toBase64Url(compressedBytes);
    } catch {
      // Fallback to uncompressed
    }
  }

  return "u." + toBase64Url(utf8Bytes);
}

/**
 * Decodes a share payload string into a valid CustomGenre object
 */
export async function decodeSharePayloadToGenre(encoded: string): Promise<CustomGenre | null> {
  if (!encoded || typeof encoded !== "string") return null;
  // F-08: reject absurd inputs before doing any base64/decompression work.
  if (encoded.length > MAX_ENCODED_LENGTH) return null;

  try {
    let rawBytes: Uint8Array;

    if (encoded.startsWith("c.")) {
      const b64 = encoded.slice(2);
      const compressed = fromBase64Url(b64);
      if (typeof DecompressionStream !== "undefined") {
        const stream = new Blob([compressed.buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        const decompressed = await new Response(stream).arrayBuffer();
        rawBytes = new Uint8Array(decompressed);
      } else {
        return null;
      }
    } else if (encoded.startsWith("u.")) {
      rawBytes = fromBase64Url(encoded.slice(2));
    } else {
      // Direct base64 fallback
      rawBytes = fromBase64Url(encoded);
    }

    // F-08: a small compressed payload can expand without bound. Bail out before
    // decoding if the decompressed size is not plausible.
    if (rawBytes.byteLength > MAX_DECOMPRESSED_BYTES) return null;

    const json = new TextDecoder().decode(rawBytes);

    // F-08: the payload comes from the URL, so it is untrusted input. Validate and
    // rebuild it field by field instead of casting the parsed object.
    const validation = validateSharePayload(json);
    if (!validation.ok) return null;
    const payload = validation.payload;

    const radar: GenreRadarMetrics = {
      groove: payload.r[0],
      brightness: payload.r[1],
      harmonicComplexity: payload.r[2],
      rhythmDensity: payload.r[3],
      bassEnergy: payload.r[4],
      melodicFocus: payload.r[5],
    };

    const tracks: SequencerTrack[] = payload.tracks.map((t) => ({
      track_id: t.t,
      name: DEFAULT_TRACK_NAMES[t.t] || t.t.toUpperCase(),
      instrument: DEFAULT_TRACK_NAMES[t.t] || t.t,
      steps: t.s,
      pitch: t.p,
      gate: t.g,
      volume: t.v ?? 0.8,
      mute: t.m ?? false,
      swing: t.sw ?? 0,
    }));

    const now = Date.now();
    const customGenre: CustomGenre = {
      isCustom: true,
      id: payload.id || `custom-${Date.now()}`,
      name: payload.n,
      aliases: [],
      category: payload.cat || "Electronic",
      parent_genres: payload.fork ? [payload.fork] : [],
      subgenres: [],
      related_genres: [],
      origin_year: payload.yr || String(new Date().getFullYear()),
      origin_decade: 2020,
      origin_place: payload.plc || { en: "Independent Studio", zh: "独立创作者空间" },
      cultural_context: payload.ctx || {
        en: `Custom music genre variation: ${payload.n}`,
        zh: `自定义音乐流派变奏：${payload.n}`,
      },
      bpm_range: `${Math.max(40, payload.bpm - 5)}-${Math.min(260, payload.bpm + 5)}`,
      default_bpm: payload.bpm || 120,
      time_signature: payload.ts || "4/4",
      key_characteristics: {
        en: `Harmonic scale ${payload.scale}`,
        zh: `基底调式 ${payload.scale}`,
      },
      common_chords: ["i", "VI", "III", "VII"],
      chord_inversions: { en: "Root and first inversions", zh: "原位与第一转位" },
      instrumentation: tracks.map((t) => t.name),
      sound_design: { en: "Custom hybrid acoustic/electronic sound palette", zh: "自定义混合声学/电子音色板" },
      rhythm_features: { en: "User crafted custom groove matrix", zh: "创作者专属客制化律动矩阵" },
      drum_pattern: {
        kick: { en: "Custom Kick Rhythm", zh: "专属底鼓节奏" },
        snare_clap: { en: "Custom Snare/Clap", zh: "专属军鼓/掌声" },
        hihats: { en: "Custom Hats", zh: "专属踩镲律动" },
        percussion: { en: "Custom Percussion", zh: "专属打击乐步进" },
        swing: { en: "Subtle swing", zh: "微摇摆律动" },
        tempo: `${payload.bpm} BPM`,
      },
      bass_pattern: { en: "Harmonic Bassline", zh: "和声低音行进" },
      structure: ["Intro", "A", "B", "Drop", "Outro"],
      production_tips: {
        en: ["Tune the 6-axis acoustic radar to balance frequency energy."],
        zh: ["根据 6 维声学雷达均衡调校频段动态。"],
      },
      representative_tracks: [
        {
          title: `${payload.n} Original Seed`,
          artist: payload.author || "Groove Lab Creator",
          year: new Date().getFullYear(),
        },
      ],
      representative_artists: payload.art && payload.art.length > 0 ? payload.art : [payload.author || "Independent Creator"],
      sources: ["GROOVE LAB Custom Genre Maker"],
      radar_metrics: radar,
      sequencer_pattern: {
        genre_id: payload.id,
        bpm: payload.bpm || 120,
        scale: payload.scale || "C Minor",
        tracks,
      },
      forkedFromId: payload.fork,
      forkedFromName: payload.forkName,
      authorName: payload.author,
      createdAt: now,
      updatedAt: now,
    };

    return customGenre;
  } catch (err) {
    console.error("Failed to decode share payload:", err);
    return null;
  }
}

/**
 * Base64 URL helper (safe for query parameters and hash fragments)
 */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(base64Url: string): Uint8Array {
  let b64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) {
    b64 += "=";
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
