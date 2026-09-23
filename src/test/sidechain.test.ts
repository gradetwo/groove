import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DUCK_ATTACK_SEC,
  DUCK_DIP_SCAN_SEC,
  DUCK_DIP_WINDOW_SEC,
  DUCK_MIN_DEPTH_GAIN,
  DUCK_VELOCITY_FLOOR,
  duckDipDb,
  duckGainAt,
  resolveKickDuckShape,
  scheduleKickDuck,
} from "../audio/sidechain";
import {
  DEFAULT_DUCK,
  DUCK_DB_MAX,
  DUCK_DB_MIN,
  DUCK_RELEASE_MAX_MS,
  DUCK_RELEASE_MIN_MS,
  GENRE_MIX,
  getGenreDuck,
} from "../data/genreMix";

const GENRE_IDS = Object.keys(GENRE_MIX);
const db = (gain: number) => 20 * Math.log10(gain);

describe("P0.3 · the sidechain shape", () => {
  it("resolves the genre's depth at full velocity", () => {
    const shape = resolveKickDuckShape("chicago-house", 1);
    expect(db(shape.depthGain)).toBeCloseTo(-getGenreDuck("chicago-house").duckDb, 6);
    expect(shape.attackSec).toBe(DUCK_ATTACK_SEC);
    expect(shape.releaseSec).toBeCloseTo(getGenreDuck("chicago-house").releaseMs / 1000, 9);
  });

  it("ducks less for a quieter kick, but never not at all", () => {
    const loud = resolveKickDuckShape("trap-rap", 1);
    const half = resolveKickDuckShape("trap-rap", 0.5);
    const soft = resolveKickDuckShape("trap-rap", 0);
    expect(half.depthGain).toBeGreaterThan(loud.depthGain);
    expect(soft.depthGain).toBeGreaterThan(half.depthGain);
    // The floor is a *relationship*: a ghosted kick still ducks, at 60% of the depth.
    const full = getGenreDuck("trap-rap").duckDb;
    expect(db(soft.depthGain)).toBeCloseTo(-full * DUCK_VELOCITY_FLOOR, 6);
  });

  it("gives unknown and custom genres the neutral default", () => {
    expect(getGenreDuck("custom-blank")).toEqual(DEFAULT_DUCK);
    expect(getGenreDuck(undefined)).toEqual(DEFAULT_DUCK);
    expect(db(resolveKickDuckShape("custom-blank", 1).depthGain)).toBeCloseTo(-DEFAULT_DUCK.duckDb, 6);
  });

  it("clamps every table entry into the documented bounds", () => {
    for (const id of GENRE_IDS) {
      const duck = getGenreDuck(id);
      expect(duck.duckDb, id).toBeGreaterThanOrEqual(DUCK_DB_MIN);
      expect(duck.duckDb, id).toBeLessThanOrEqual(DUCK_DB_MAX);
      expect(duck.releaseMs, id).toBeGreaterThanOrEqual(DUCK_RELEASE_MIN_MS);
      expect(duck.releaseMs, id).toBeLessThanOrEqual(DUCK_RELEASE_MAX_MS);
      expect(resolveKickDuckShape(id, 1).depthGain, id).toBeGreaterThanOrEqual(DUCK_MIN_DEPTH_GAIN);
    }
  });

  it("walks down to the depth and back to unity", () => {
    const shape = resolveKickDuckShape("disco", 1);
    expect(duckGainAt(shape, 0)).toBe(1);
    expect(duckGainAt(shape, DUCK_ATTACK_SEC)).toBeCloseTo(shape.depthGain, 9);
    expect(duckGainAt(shape, shape.releaseSec)).toBeCloseTo(1, 6);
    expect(duckGainAt(shape, shape.releaseSec + 1)).toBe(1);
    // Monotone recovery between the bottom and unity: no overshoot, no second dip.
    let previous = duckGainAt(shape, DUCK_ATTACK_SEC);
    for (let i = 1; i <= 40; i++) {
      const t = DUCK_ATTACK_SEC + ((shape.releaseSec - DUCK_ATTACK_SEC) * i) / 40;
      const gain = duckGainAt(shape, t);
      expect(gain).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = gain;
    }
  });

  it("schedules the ramp in the order an AudioParam requires", () => {
    const param = {
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    } as unknown as AudioParam;
    const shape = resolveKickDuckShape("boom-bap", 1);
    scheduleKickDuck(param, 2.5, shape);

    const calls = [
      (param.cancelScheduledValues as ReturnType<typeof vi.fn>).mock.calls,
      (param.setValueAtTime as ReturnType<typeof vi.fn>).mock.calls,
      (param.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls,
      (param.exponentialRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls,
    ];
    for (const call of calls) expect(call).toHaveLength(1);
    expect(calls[0][0]).toEqual([2.5]);
    // Re-triggering a second kick must start from unity, not from wherever the last release was.
    expect(calls[1][0]).toEqual([1.0, 2.5]);
    expect(calls[2][0][0]).toBeCloseTo(shape.depthGain, 9);
    expect(calls[2][0][1]).toBeCloseTo(2.5 + DUCK_ATTACK_SEC, 9);
    // An exponential ramp to 0 throws, which is why the depth is floored rather than clamped to zero.
    expect(calls[3][0]).toEqual([1.0, 2.5 + shape.releaseSec]);
  });
});

describe("P0.3 · every genre is audible in the dip check:groove measures", () => {
  it("drops 3.5 dB or more in its deepest 5 ms", () => {
    // This is the claim the gate ratchets, computed from the scheduled curve instead of from audio: if a
    // genre's shape does not dip this far, no amount of correct rendering will make the gate see it. The
    // margin over the gate's 3 dB threshold exists because the rendered dip reads ~1 dB shallower than the
    // scheduled one (energy weighting inside the window).
    const silent = GENRE_IDS.filter((id) => duckDipDb(resolveKickDuckShape(id, 1)) > -3.5);
    expect(silent).toEqual([]);
  });

  it("does not pump: no genre drops deeper than 9 dB", () => {
    const pumping = GENRE_IDS.filter((id) => duckDipDb(resolveKickDuckShape(id, 1)) < -9);
    expect(pumping).toEqual([]);
  });

  it("keeps a fast genre's release short and a slow genre's release long", () => {
    // The release is the genre character, so it must not collapse onto one value across 159 genres.
    const releases = new Set(GENRE_IDS.map((id) => getGenreDuck(id).releaseMs));
    expect(releases.size).toBeGreaterThanOrEqual(6);
    expect(getGenreDuck("hardcore-gabber").releaseMs).toBeLessThan(getGenreDuck("ambient").releaseMs);
    expect(getGenreDuck("trap-rap").duckDb).toBeGreaterThan(getGenreDuck("chicago-blues").duckDb);
  });

  it("measures the dip the analyser actually reports on", () => {
    const analyser = fs.readFileSync(path.resolve(__dirname, "..", "..", "scripts", "analyze_export_audio.mjs"), "utf8");
    expect(analyser).toMatch(/rate \* 0\.005/);
    expect(analyser).toMatch(/rate \* 0\.06/);
    expect([DUCK_DIP_WINDOW_SEC, DUCK_DIP_SCAN_SEC]).toEqual([0.005, 0.06]);
  });
});

describe("P0.3 · live and offline schedule the same duck", () => {
  const read = (file: string) => fs.readFileSync(path.resolve(__dirname, "..", "audio", file), "utf8");

  it("both engines go through the shared helper", () => {
    for (const file of ["AudioEngine.ts", "WavExporter.ts"]) {
      const source = read(file);
      expect(source, file).toMatch(/from "\.\/sidechain"/);
      expect(source, file).toMatch(/resolveKickDuckShape\(/);
      expect(source, file).toMatch(/scheduleKickDuck\(/);
    }
  });

  it("the duplicated inline formula is gone", () => {
    for (const file of ["AudioEngine.ts", "WavExporter.ts"]) {
      const source = read(file);
      // The old shape: a local `duckDepth` plus the 3 ms/65 ms ramps. Prose may still describe it.
      expect(source, file).not.toMatch(/const duckDepth/);
      expect(source, file).not.toMatch(/time \+ 0\.065/);
      expect(source, file).not.toMatch(/subTime \+ 0\.065/);
      expect(source, file).not.toMatch(/linearRampToValueAtTime\(duckDepth/);
    }
  });
});
