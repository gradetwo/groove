import { beforeEach, describe, expect, it } from "vitest";
import {
  createMcpArrangement,
  getMcpArrangement,
  setMcpTrackAutomation,
  flattenMcpArrangement,
  makeDryPattern,
  makeDryEffectsOverrides,
} from "../../mcp/arrangement";
import { resetTrackIdsForTests } from "../data/arrangementEdits";
import { AudioEngine } from "../audio/AudioEngine";
import { isTrackInsertBypassed } from "../data/trackInsert";

describe("MCP automation parameter pass-through (P0)", () => {
  let arrangementId: string;
  let trackId: string;

  beforeEach(() => {
    resetTrackIdsForTests();
    const created = createMcpArrangement({ templateId: "samplers", songId: "test_auto" });
    arrangementId = created.arrangementId;
    trackId = created.tracks[0]!.id;
  });

  it("supports pan automation and clamps points within [-1, 1]", () => {
    setMcpTrackAutomation(arrangementId, trackId, [
      [0, -0.8],
      [16, 1.5], // should clamp to 1.0
    ], "pan");

    const track = getMcpArrangement(arrangementId)?.tracks.find((t) => t.id === trackId);
    const panLane = track?.automation?.find((l) => l.parameter === "pan");
    expect(panLane).toBeDefined();
    expect(panLane?.points).toEqual([
      { atBeats: 0, value: -0.8 },
      { atBeats: 16, value: 1.0 },
    ]);

    const { flattened } = flattenMcpArrangement(arrangementId);
    const flatTrack = flattened.pattern.tracks.find((t) => t.name === track?.name);
    expect(flatTrack?.panByStep).toBeDefined();
    expect(flatTrack?.panByStep?.[0]).toBeCloseTo(-0.8);
  });

  it("supports sendA and sendB automation and clamps within [0, 1]", () => {
    setMcpTrackAutomation(arrangementId, trackId, [
      [0, 0.2],
      [8, 1.5], // should clamp to 1.0
    ], "sendA");

    setMcpTrackAutomation(arrangementId, trackId, [
      [0, 0.5],
      [16, -0.2], // should clamp to 0.0
    ], "sendB");

    const track = getMcpArrangement(arrangementId)?.tracks.find((t) => t.id === trackId);
    const sendALane = track?.automation?.find((l) => l.parameter === "sendA");
    const sendBLane = track?.automation?.find((l) => l.parameter === "sendB");

    expect(sendALane?.points).toEqual([
      { atBeats: 0, value: 0.2 },
      { atBeats: 8, value: 1.0 },
    ]);
    expect(sendBLane?.points).toEqual([
      { atBeats: 0, value: 0.5 },
      { atBeats: 16, value: 0.0 },
    ]);
  });

  it("supports EQ automation without clamping frequencies to gainDb bounds", () => {
    // Crucial bug fix test: previously clampGainDb (-60..6) clamped 1200Hz to 6Hz!
    setMcpTrackAutomation(arrangementId, trackId, [
      [0, 200],
      [32, 2500],
    ], "eq.mid.hz");

    setMcpTrackAutomation(arrangementId, trackId, [
      [0, -3],
      [16, 4.5],
    ], "eq.mid.gainDb");

    const track = getMcpArrangement(arrangementId)?.tracks.find((t) => t.id === trackId);
    const midHzLane = track?.automation?.find((l) => l.parameter === "mid.hz");
    const midGainLane = track?.automation?.find((l) => l.parameter === "mid.gainDb");

    expect(midHzLane?.points).toEqual([
      { atBeats: 0, value: 200 },
      { atBeats: 32, value: 2500 },
    ]);
    expect(midGainLane?.points).toEqual([
      { atBeats: 0, value: -3 },
      { atBeats: 16, value: 4.5 },
    ]);
    expect(track?.automation?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Dry rendering utilities (P1)", () => {
  it("makeDryPattern bypasses all inserts and zeroes sends while preserving volume and pan", () => {
    const arrangement = createMcpArrangement({ templateId: "samplers", songId: "test_dry" });
    const track = arrangement.tracks[0]!;

    const dryPattern = makeDryPattern({
      genre_id: "chicago-house",
      bpm: 124,
      totalSteps: 16,
      tracks: [
        {
          track_id: "kick",
          name: "Kick",
          steps: [1, 0, 0, 0],
          volume: 0.85,
          pan: -0.2,
          sendA: 0.35,
          sendB: 0.45,
          insert: {
            hpfEnabled: true,
            hpfHz: 30,
            low: { enabled: true, hz: 80, gainDb: 2, q: 0.7 },
            mid: { enabled: true, hz: 500, gainDb: -2, q: 1.0 },
            high: { enabled: true, hz: 8000, gainDb: 1, q: 0.7 },
            compEnabled: true,
            compThresholdDb: -18,
            compRatio: 3,
            compAttackSec: 0.01,
            compReleaseSec: 0.2,
            compMakeupDb: 2,
            driveEnabled: true,
            driveAmount: 2.0,
            driveMix: 0.5,
          },
        },
      ],
    } as never);

    const dryTrack = dryPattern.tracks[0]!;
    expect(dryTrack.volume).toBe(0.85);
    expect(dryTrack.pan).toBe(-0.2);
    expect(dryTrack.sendA).toBe(0);
    expect(dryTrack.sendB).toBe(0);
    expect(dryTrack.insert).toBeDefined();
    expect(isTrackInsertBypassed(dryTrack.insert!)).toBe(true);
  });

  it("makeDryEffectsOverrides turns off reverb, delay and master rack effects", () => {
    const dryFx = makeDryEffectsOverrides({
      reverb: { decaySec: 4.5, enabled: true },
      delay: { feedback: 0.6, enabled: true },
      rack: { chorusMix: 0.5, chorusEnabled: true },
    });

    expect(dryFx.reverb?.enabled).toBe(false);
    expect(dryFx.delay?.enabled).toBe(false);
    expect(dryFx.delay?.feedback).toBe(0);
    expect(dryFx.rack?.chorusEnabled).toBe(false);
    expect(dryFx.rack?.saturationEnabled).toBe(false);
  });
});

describe("AudioEngine · setDryMode", () => {
  it("enters dry audition mode and restores full mix when toggled off", () => {
    const engine = new AudioEngine();
    expect(engine.isDryMode()).toBe(false);

    engine.setDryMode(true);
    expect(engine.isDryMode()).toBe(true);

    // Verify all strips in engine are bypassed
    const strips = engine.getTrackStrips();
    strips.forEach((strip) => {
      expect(strip.insert.isBypassed()).toBe(true);
    });

    engine.setDryMode(false);
    expect(engine.isDryMode()).toBe(false);
  });
});
