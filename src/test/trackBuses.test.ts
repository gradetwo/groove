/**
 * E-11 — group buses and glue compression.
 *
 * The defect this closes: every track summed directly into the master fader, so nothing glued the
 * kit together and nothing stopped a pad, a bass and a lead from each claiming their own peak.
 * The only dynamics stage in the whole application was the true-peak limiter on the sum — a
 * safety device being asked to do a mixing job.
 *
 * These tests pin the parts that are easy to get subtly wrong: the role→bus decision (which must
 * be identical in both engines), the topology (tracks reach the fader only *through* a bus), and
 * the fact that the glue is glue rather than a limiter (slow attacks, low ratios, no ceiling
 * claim).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GROUP_BUS_ROLES, resolveGroupBus } from "../audio/trackBuses";
import { DRUM_PARALLEL_BLEND } from "../audio/masterGraph";
import { MIX_TRACK_IDS } from "../data/genreMix";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(TEST_DIR, "..");
const read = (relative: string) => readFileSync(path.join(SRC_DIR, relative), "utf8");

describe("role → group bus", () => {
  it("puts every known role on the documented bus", () => {
    for (const { role, bus } of GROUP_BUS_ROLES) {
      expect(resolveGroupBus(role), role).toBe(bus);
    }
  });

  it("covers all eight sequencer roles exactly once", () => {
    const mapped = GROUP_BUS_ROLES.map((r) => r.role).sort();
    expect(mapped).toEqual([...MIX_TRACK_IDS].sort());
    expect(new Set(mapped).size).toBe(mapped.length);
  });

  it("splits the roles four and four", () => {
    const drums = GROUP_BUS_ROLES.filter((r) => r.bus === "drum").map((r) => r.role);
    expect(drums).toEqual(["kick", "snare", "hihat", "percussion"]);
  });

  it("falls back to the name for a track with no standard id", () => {
    expect(resolveGroupBus("", "Kick Drum")).toBe("drum");
    expect(resolveGroupBus(undefined, "open hat")).toBe("drum");
    expect(resolveGroupBus("", "shaker")).toBe("drum");
    // …and to the music bus for anything unrecognised: the drum bus carries parallel
    // compression, so a stray melodic track must never land there by accident.
    expect(resolveGroupBus("", "mystery")).toBe("music");
    expect(resolveGroupBus(null, null)).toBe("music");
    expect(resolveGroupBus("custom-role")).toBe("music");
  });

  it("is case- and whitespace-insensitive for ids", () => {
    expect(resolveGroupBus(" KICK ")).toBe("drum");
    expect(resolveGroupBus("Snare")).toBe("drum");
    expect(resolveGroupBus("BASS")).toBe("music");
  });
});

describe("E-11 topology — a track reaches the fader only through a bus", () => {
  it("the live engine routes every strip path through a bus, not to the fader", () => {
    const source = read("audio/AudioEngine.ts");
    // The three paths that used to reach `masterGain` directly: the binaural panner, the stereo
    // panner, and the mono fallback.
    const routed =
      source.match(/^[ \t]*(spatialPanner|panner|stripOut)\.connect\(this\.busInputFor\(i\)\);/gm) ?? [];
    expect(routed.length).toBe(3);
    for (const dead of ["spatialPanner.connect(this.masterGain)", "panner.connect(this.masterGain)", "stripOut.connect(this.masterGain)"]) {
      expect(source, `stale direct connection: ${dead}`).not.toContain(dead);
    }
  });

  it("the offline renderer routes through the same decision function", () => {
    const source = read("audio/WavExporter.ts");
    expect(source).toContain("resolveGroupBus(pattern.tracks[t]?.track_id, pattern.tracks[t]?.name)");
    expect(source).toMatch(/tPan\.connect\(bus === "drum" \? graph\.drumBusInput : graph\.musicBusInput\)/);
    // The old direct connection must be gone, or the export would skip the glue stage.
    expect(source).not.toMatch(/tPan\.connect\(masterGain\)/);
  });

  it("both engines take the bus from the shared graph builder", () => {
    const graph = read("audio/masterGraph.ts");
    expect(graph).toContain("const drumBusInput = ctx.createGain();");
    expect(graph).toContain("const musicBusInput = ctx.createGain();");
    expect(graph).toContain("drumGlue.connect(masterGain);");
    expect(graph).toContain("musicGlue.connect(masterGain);");
    // The parallel path is what makes the drum bus dense without losing attack.
    expect(graph).toContain("drumParallelGain.connect(masterGain);");
  });

  it("leaves the metronome out of the buses", () => {
    // The click is a monitoring aid: it goes to the fader directly, like talkback on a console.
    const source = read("audio/AudioEngine.ts");
    expect(source).toMatch(/gain\.connect\(this\.masterGain\);\n\n {4}osc\.start\(time\);/);
  });
});

describe("E-11 glue is glue, not a limiter", () => {
  const graph = read("audio/masterGraph.ts");
  const numberAfter = (needle: string): number => {
    const match = graph.match(new RegExp(`${needle}\\.value = (-?[\\d.]+)`));
    expect(match, `could not read ${needle}`).toBeTruthy();
    return Number(match![1]);
  };

  it("uses low ratios and slow attacks on both buses", () => {
    expect(numberAfter("drumGlue.ratio")).toBeLessThanOrEqual(4);
    expect(numberAfter("musicGlue.ratio")).toBeLessThanOrEqual(3);
    // A fast attack would flatten exactly the transients a drum bus is supposed to keep.
    expect(numberAfter("drumGlue.attack")).toBeGreaterThanOrEqual(0.005);
    expect(numberAfter("musicGlue.attack")).toBeGreaterThanOrEqual(0.02);
  });

  it("keeps the music bus gentler than the drum bus", () => {
    expect(numberAfter("musicGlue.ratio")).toBeLessThan(numberAfter("drumGlue.ratio"));
    expect(numberAfter("musicGlue.attack")).toBeGreaterThan(numberAfter("drumGlue.attack"));
  });

  it("blends the parallel drum path in at a low, documented level", () => {
    expect(DRUM_PARALLEL_BLEND).toBeGreaterThan(0);
    expect(DRUM_PARALLEL_BLEND).toBeLessThanOrEqual(0.3);
    // The parallel compressor itself must be genuinely crushed — that is the point of it.
    expect(numberAfter("drumParallel.ratio")).toBeGreaterThanOrEqual(6);
    expect(numberAfter("drumParallel.threshold")).toBeLessThan(numberAfter("drumGlue.threshold"));
  });

  it("makes no ceiling claim of its own", () => {
    // Only the true-peak limiter enforces a ceiling; the buses must not grow a second one.
    const section = graph.slice(graph.indexOf("const drumBusInput"), graph.indexOf("const fxRack"));
    expect(section).not.toMatch(/ceiling|limiter/i);
  });
});
