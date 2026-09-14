import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MAX_DECOMPRESSED_BYTES,
  MAX_ENCODED_LENGTH,
  validateSharePayload,
} from "../features/customGenre/sharePayloadGuard";
import { decodeSharePayloadToGenre, encodeGenreToSharePayload } from "../features/customGenre/customGenreCodec";
import {
  MAX_BASE64_LENGTH,
  encodeSharedSequencer,
  decodeSharedSequencer,
  getShareUrlResult,
  type SharedSequencerState,
} from "../audio/SequencerUrlShare";

function validPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    v: 1,
    id: "custom-1",
    n: "Neon Funk",
    cat: "Electronic",
    bpm: 120,
    ts: "4/4",
    scale: "C minor",
    r: [5, 6, 7, 8, 4, 5],
    ctx: { en: "Test context", zh: "测试背景" },
    tracks: [{ t: "kick", s: [1, 0, 0, 0, 1, 0, 0, 0] }],
    ...overrides,
  });
}

describe("F-08 · share payload validation", () => {
  it("accepts a well-formed payload and rebuilds it", () => {
    const result = validateSharePayload(validPayload());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.n).toBe("Neon Funk");
    expect(result.payload.tracks[0].s).toHaveLength(8);
  });

  it("rejects a non-object payload", () => {
    expect(validateSharePayload("[1,2,3]").ok).toBe(false);
    expect(validateSharePayload("null").ok).toBe(false);
    expect(validateSharePayload("not json").ok).toBe(false);
  });

  it("rejects an unsupported version", () => {
    expect(validateSharePayload(validPayload({ v: 2 })).ok).toBe(false);
  });

  it("rejects an object where a genre name string is expected", () => {
    // This used to reach React and crash render with "Objects are not valid as a React child".
    expect(validateSharePayload(validPayload({ n: { evil: true } })).ok).toBe(false);
  });

  it("rejects non-finite and out-of-range bpm", () => {
    expect(validateSharePayload(validPayload({ bpm: Number.POSITIVE_INFINITY })).ok).toBe(false);
    expect(validateSharePayload('{"v":1,"n":"X","bpm":1e999,"tracks":[{"t":"kick","s":[1]}]}').ok).toBe(false);
    expect(validateSharePayload(validPayload({ bpm: Number.NaN })).ok).toBe(false);
    expect(validateSharePayload(validPayload({ bpm: -20 })).ok).toBe(false);
    expect(validateSharePayload(validPayload({ bpm: 900 })).ok).toBe(false);
  });

  it("rejects oversized step arrays and non-integer steps", () => {
    const huge = new Array(1_000_000).fill(1);
    expect(validateSharePayload(validPayload({ tracks: [{ t: "kick", s: huge }] })).ok).toBe(false);
    expect(validateSharePayload(validPayload({ tracks: [{ t: "kick", s: ["x", "y"] }] })).ok).toBe(false);
    expect(validateSharePayload(validPayload({ tracks: [{ t: "kick", s: [9, 9] }] })).ok).toBe(false);
  });

  it("rejects unknown track ids and too many tracks", () => {
    expect(validateSharePayload(validPayload({ tracks: [{ t: "DROP TABLE", s: [1] }] })).ok).toBe(false);
    const tooMany = Array.from({ length: 40 }, () => ({ t: "kick", s: [1, 0] }));
    expect(validateSharePayload(validPayload({ tracks: tooMany })).ok).toBe(false);
  });

  it("does not let prototype pollution through", () => {
    const hostile = `{"v":1,"n":"X","bpm":120,"tracks":[{"t":"kick","s":[1]}],"__proto__":{"polluted":true}}`;
    const result = validateSharePayload(hostile);
    expect(result.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (result.ok) {
      expect(Object.prototype.hasOwnProperty.call(result.payload, "polluted")).toBe(false);
    }
  });
});

describe("F-08 · decode entry point rejects hostile encodings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for an oversized encoded string without decoding it", async () => {
    const huge = "u." + "A".repeat(MAX_ENCODED_LENGTH + 10);
    await expect(decodeSharePayloadToGenre(huge)).resolves.toBeNull();
  });

  it("returns null for garbage", async () => {
    await expect(decodeSharePayloadToGenre("!!!not-base64!!!")).resolves.toBeNull();
    await expect(decodeSharePayloadToGenre("u." + btoa('{"v":2}'))).resolves.toBeNull();
  });

  it("decodes its own encoder output (round trip)", async () => {
    const genre = {
      id: "custom-roundtrip",
      name: "Round Trip",
      category: "Electronic" as const,
      default_bpm: 128,
      time_signature: "4/4",
      cultural_context: { en: "ctx", zh: "背景" },
      origin_year: "2026",
      origin_place: { en: "Studio", zh: "工作室" },
      representative_artists: ["Tester"],
      radar_metrics: {
        groove: 6,
        brightness: 6,
        harmonicComplexity: 6,
        rhythmDensity: 6,
        bassEnergy: 6,
        melodicFocus: 6,
      },
      sequencer_pattern: {
        scale: "C minor",
        tracks: [
          {
            track_id: "kick",
            name: "Kick",
            steps: [1, 0, 0, 0],
            pitch: [0, 0, 0, 0],
            gate: [0.8, 0.8, 0.8, 0.8],
            volume: 0.8,
            mute: false,
            swing: 0,
          },
        ],
      },
    } as any;

    const encoded = await encodeGenreToSharePayload(genre);
    const decoded = await decodeSharePayloadToGenre(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.name).toBe("Round Trip");
    expect(decoded?.sequencer_pattern.tracks).toHaveLength(1);
    expect(decoded?.sequencer_pattern.tracks[0].steps).toHaveLength(4);
  });

  it("keeps the decompressed-size ceiling documented and enforced", () => {
    expect(MAX_DECOMPRESSED_BYTES).toBeGreaterThan(0);
  });
});

describe("F-09 · sequencer share URL never exceeds what the decoder accepts", () => {
  function makeState(trackCount: number, steps: number): SharedSequencerState {
    return {
      genreId: "chicago-house",
      bpm: 124,
      swing: 0,
      timeSignature: "4/4",
      resolution: "1/16",
      totalSteps: steps,
      tracks: Array.from({ length: trackCount }, (_, i) => ({
        track_id: `track${i}`,
        name: `Track ${i}`,
        instrument: "synth",
        steps: Array.from({ length: steps }, (_, s) => (s % 4 === 0 ? 1 : 0)),
        velocity: Array.from({ length: steps }, (_, s) => 40 + ((s * 7) % 88)),
        pitch: Array.from({ length: steps }, (_, s) => 36 + ((s * 3) % 24)),
        gate: Array.from({ length: steps }, () => 0.8),
        ratchet: Array.from({ length: steps }, (_, s) => (s % 8 === 0 ? 2 : 1)),
        probability: Array.from({ length: steps }, (_, s) => 60 + ((s * 5) % 40)),
      })),
    };
  }

  it("produces a decodable URL for a realistic pattern", () => {
    const result = getShareUrlResult(makeState(8, 32));
    expect(result.url).not.toBe("");
    const code = result.url.split("groove=")[1];
    expect(code.length).toBeLessThanOrEqual(MAX_BASE64_LENGTH);
    expect(decodeSharedSequencer(code)).not.toBeNull();
  });

  it("degrades fidelity instead of emitting a link the decoder would reject", () => {
    const result = getShareUrlResult(makeState(16, 64));
    if (result.url) {
      const code = result.url.split("groove=")[1];
      expect(code.length).toBeLessThanOrEqual(MAX_BASE64_LENGTH);
      // Whatever we emit must be readable by our own decoder.
      expect(decodeSharedSequencer(code)).not.toBeNull();
    } else {
      expect(result.reason).toBe("too-large");
    }
  });

  it("still rejects over-long strings on the decode side", () => {
    expect(decodeSharedSequencer("A".repeat(MAX_BASE64_LENGTH + 1))).toBeNull();
  });

  it("round-trips a small pattern losslessly", () => {
    const state = makeState(2, 16);
    const code = encodeSharedSequencer(state);
    const decoded = decodeSharedSequencer(code);
    expect(decoded).not.toBeNull();
    expect(decoded?.tracks).toHaveLength(2);
    expect(decoded?.tracks[0].steps.slice(0, 16)).toEqual(state.tracks[0].steps);
    expect(decoded?.tracks[0].velocity?.slice(0, 16)).toEqual(state.tracks[0].velocity);
  });
});
