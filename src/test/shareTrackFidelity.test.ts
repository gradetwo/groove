import { describe, it, expect } from "vitest";
import {
  decodeSharedSequencer,
  encodeSharedSequencer,
  getShareUrlResult,
  toSharedTrack,
  type SharedSequencerState,
} from "../audio/SequencerUrlShare";
import type { SequencerTrack } from "../types/genre";

/**
 * Regression: the studio toolbar's share button used to build the payload inline and
 * forgot `gate`, `ratchet`, `probability`, `trackLength`, `swing`, `pan`, `sendA` and
 * `sendB`, while the project hub mapped them all. Links shared from the studio therefore
 * arrived with default gates and a centred, dry mix even though the codec supports every
 * one of those fields. Both call sites now go through `toSharedTrack`.
 */

/** A track with every share-relevant field set to a distinctive, non-default value. */
function maximalTrack(): SequencerTrack {
  return {
    track_id: "lead",
    name: "Lead Synth",
    instrument: "saw_lead",
    steps: [1, 0, 1, 0, 1, 1, 0, 0],
    velocity: [37, 100, 111, 100, 88, 64, 100, 100],
    pitch: [72, null, 74, null, 76, 79, null, null],
    gate: [0.3, 0.8, 1.7, 0.8, 0.5, 1.2, 0.8, 0.8],
    ratchet: [1, 3, 1, 1, 2, 1, 1, 4],
    probability: [100, 45, 100, 90, 100, 100, 75, 100],
    trackLength: 8,
    mute: true,
    solo: false,
    volume: 0.63,
    pan: -0.42,
    swing: 17,
    sendA: 0.31,
    sendB: 0.27,
  } as SequencerTrack;
}

function stateWith(track: SequencerTrack): SharedSequencerState {
  return {
    genreId: "chicago-house",
    bpm: 124,
    swing: 12,
    scale: "C minor",
    timeSignature: "4/4",
    resolution: "1/16",
    totalSteps: 16,
    tracks: [toSharedTrack(track)],
  };
}

describe("share link · per-track field fidelity", () => {
  it("maps every share-relevant field the payload declares", () => {
    const mapped = toSharedTrack(maximalTrack());
    expect(Object.keys(mapped).sort()).toEqual(
      [
        "gate",
        "instrument",
        "mute",
        "name",
        "pan",
        "pitch",
        "probability",
        "ratchet",
        "sendA",
        "sendB",
        "solo",
        "steps",
        "swing",
        "track_id",
        "trackLength",
        "velocity",
        "volume",
      ].sort()
    );
    for (const [key, value] of Object.entries(mapped)) {
      expect(value, `${key} must not be dropped`).toBeDefined();
    }
  });

  it("survives a full encode/decode round trip without losing a field", () => {
    const track = maximalTrack();
    const encoded = encodeSharedSequencer(stateWith(track));
    expect(encoded).toBeTruthy();
    const decoded = decodeSharedSequencer(encoded as string);
    expect(decoded).not.toBeNull();
    if (!decoded) return;

    const out = decoded.tracks[0];
    expect(out.volume).toBeCloseTo(track.volume as number, 2);
    expect(out.pan).toBeCloseTo(track.pan as number, 2);
    expect(out.swing).toBe(track.swing);
    expect(out.sendA).toBeCloseTo(track.sendA as number, 2);
    expect(out.sendB).toBeCloseTo(track.sendB as number, 2);
    expect(out.trackLength).toBe(track.trackLength);
    expect(out.mute).toBe(true);
    expect(out.solo).toBe(false);
    expect(out.gate?.slice(0, 8)).toEqual(track.gate);
    expect(out.ratchet?.slice(0, 8)).toEqual(track.ratchet);
    expect(out.probability?.slice(0, 8)).toEqual(track.probability);
    expect(out.velocity?.slice(0, 8)).toEqual(track.velocity);
    expect(out.pitch?.slice(0, 8)).toEqual(track.pitch);
  });

  it("keeps the mix arrangement in the share URL, not just in the payload object", () => {
    // The user-visible artefact is the URL; assert on it end to end.
    const track = maximalTrack();
    const { url } = getShareUrlResult(stateWith(track));
    expect(url).toContain("groove=");
    const lean = url.split("groove=")[1];
    const decoded = decodeSharedSequencer(lean);
    expect(decoded?.tracks[0].pan).toBeCloseTo(-0.42, 2);
    expect(decoded?.tracks[0].sendA).toBeCloseTo(0.31, 2);
    expect(decoded?.tracks[0].sendB).toBeCloseTo(0.27, 2);
    expect(decoded?.tracks[0].swing).toBe(17);
  });
});
