/**
 * GS-1 patch set and routing table (P6 / requirement 11) — the guarantees that make it safe.
 *
 * Three things can go wrong with a hand-written mapping and all three are silent:
 *   1. a genre declares an instrument name nobody mapped, so the track silently keeps the native
 *      voice (or worse, gets a wrong one) — prevented by the exhaustive-coverage test below,
 *      which reads the names out of `ALL_GENRES` instead of trusting this file's own list;
 *   2. a patch writes a value outside the parameter's declared range, which the core maps to a
 *      *different algorithm* rather than an error (plan risk R5) — prevented by validating every
 *      value against the worklet's own `PARAMS` table, read from disk;
 *   3. a "patch" that sets almost nothing, i.e. a routing decision that does not actually make a
 *      sound — prevented by requiring each patch to be non-trivial and to define its oscillators,
 *      filter and envelope.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_GENRES } from "../data/genres";
import {
  GS1_CHORDS_ROUTING,
  GS1_LEAD_ROUTING,
  GS1_PATCHES,
  GS1_ROLES,
  patchParamIds,
  resolveGs1Patch,
  routingForRole,
} from "../data/gs1Patches";
import { Param } from "../../vendor/gs1/src/audio/params";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..", "..");
const WORKLET_PATH = path.join(REPO_ROOT, "vendor", "gs1", "src", "audio", "worklet-processor.js");

/**
 * The worklet's `PARAMS` table is the authority on ids and ranges: it is what actually reaches
 * `gs_set_param`, and it is the file the contract gate hashes.
 */
function readWorkletRanges(): Map<number, { name: string; min: number; max: number; def: number }> {
  const source = readFileSync(WORKLET_PATH, "utf8");
  const start = source.indexOf("const PARAMS = [");
  const end = source.indexOf("];", start);
  const body = source.slice(start, end);
  const ranges = new Map<number, { name: string; min: number; max: number; def: number }>();
  for (const match of body.matchAll(/\['([A-Za-z0-9_]+)',\s*(\d+),\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\]/g)) {
    ranges.set(Number(match[2]), {
      name: match[1],
      def: Number(match[3]),
      min: Number(match[4]),
      max: Number(match[5]),
    });
  }
  return ranges;
}

/** Every instrument name the library actually puts on a role. */
function instrumentsForRole(role: string): string[] {
  const names = new Set<string>();
  for (const genre of ALL_GENRES) {
    for (const track of genre.sequencer_pattern.tracks) {
      if (track.track_id === role && track.instrument) names.add(track.instrument);
    }
  }
  return [...names].sort();
}

describe("GS-1 routing — exhaustive coverage, read from the genre database", () => {
  it("routes or explicitly keeps native every chords instrument name in the library", () => {
    const used = instrumentsForRole("chords");
    expect(used.length).toBeGreaterThan(5);
    const unmapped = used.filter((name) => GS1_CHORDS_ROUTING[name] === undefined);
    expect(unmapped, `chords instruments with no GS-1 decision: ${unmapped.join(", ")}`).toEqual([]);
  });

  it("routes or explicitly keeps native every lead instrument name in the library", () => {
    const used = instrumentsForRole("lead");
    expect(used.length).toBeGreaterThan(10);
    const unmapped = used.filter((name) => GS1_LEAD_ROUTING[name] === undefined);
    expect(unmapped, `lead instruments with no GS-1 decision: ${unmapped.join(", ")}`).toEqual([]);
  });

  it("has no orphan entries for instruments the library never uses", () => {
    for (const role of GS1_ROLES) {
      const used = new Set(instrumentsForRole(role));
      const table = routingForRole(role) as Record<string, unknown>;
      const orphans = Object.keys(table).filter((name) => !used.has(name));
      expect(orphans, `${role} routing names that no genre uses: ${orphans.join(", ")}`).toEqual([]);
    }
  });

  it("gives every native decision a reason", () => {
    for (const role of GS1_ROLES) {
      const table = routingForRole(role) as Record<string, { native?: boolean; reason?: string }>;
      const mute = Object.entries(table)
        .filter(([, entry]) => entry.native === true && !(entry.reason && entry.reason.length > 20))
        .map(([name]) => name);
      expect(mute, `${role}: native decisions without a real reason: ${mute.join(", ")}`).toEqual([]);
    }
  });

  it("keeps roughly half the library on GS-1 and names the rest honestly", () => {
    // Not a target, a sanity check on the shape of the decision: an all-native table would mean
    // the integration does nothing, an all-GS-1 table would mean the acoustic instruments were
    // silently forced through a subtractive engine.
    for (const role of GS1_ROLES) {
      const table = routingForRole(role) as Record<string, { native?: boolean }>;
      const routed = Object.values(table).filter((e) => !e.native).length;
      const kept = Object.values(table).filter((e) => e.native).length;
      expect(routed, `${role} routes nothing to GS-1`).toBeGreaterThan(0);
      expect(kept, `${role} keeps nothing native`).toBeGreaterThan(0);
    }
  });
});

describe("GS-1 patches — every value is inside the core's declared range", () => {
  const ranges = readWorkletRanges();

  it("read a usable parameter table from the vendored worklet", () => {
    expect(ranges.size).toBeGreaterThan(200);
    expect(ranges.get(Param.ENV_ATTACK)?.name).toBe("envAttack");
  });

  it("writes no parameter the core does not declare", () => {
    const unknown = patchParamIds().filter((id) => !ranges.has(id));
    expect(unknown, `patch parameter ids not in the worklet PARAMS table: ${unknown.join(", ")}`).toEqual([]);
  });

  it("keeps every patch value within its declared min/max (risk R5)", () => {
    const bad: string[] = [];
    for (const [name, patch] of Object.entries(GS1_PATCHES)) {
      for (const [idText, value] of Object.entries(patch)) {
        const id = Number(idText);
        const range = ranges.get(id);
        if (!range) {
          bad.push(`${name}.${id}: no declared range`);
          continue;
        }
        if (!(value >= range.min && value <= range.max)) {
          bad.push(`${name}.${range.name}=${value} outside [${range.min}, ${range.max}]`);
        }
      }
    }
    expect(bad, `${bad.length} out-of-range value(s)`).toEqual([]);
  });

  it("requires each patch to be a real voice, not a fragment", () => {
    const incomplete: string[] = [];
    for (const [name, patch] of Object.entries(GS1_PATCHES)) {
      const hasOsc = patch[Param.OSC1_ON] === 1 || patch[Param.OSC2_ON] === 1;
      const hasFilter = patch[Param.FILTER_CUTOFF] !== undefined;
      const hasEnv = patch[Param.ENV_ATTACK] !== undefined;
      const size = Object.keys(patch).length;
      if (!hasOsc || !hasFilter || !hasEnv || size < 12) {
        incomplete.push(`${name} (osc=${hasOsc} filter=${hasFilter} env=${hasEnv} params=${size})`);
      }
    }
    expect(incomplete).toEqual([]);
  });

  it("leaves headroom: no patch drives the master into the core's own limiter", () => {
    // PATCH_GAIN is the per-patch output trim; the eight-voice measurement (E3) was taken with
    // patches at or below 0.6, and the app's own master chain adds the loudness trim.
    const loud = Object.entries(GS1_PATCHES)
      .filter(([, patch]) => (patch[Param.PATCH_GAIN] ?? 1) > 0.6)
      .map(([name]) => name);
    expect(loud).toEqual([]);
  });
});

describe("GS-1 resolution", () => {
  it("returns the patch for a routed instrument", () => {
    expect(resolveGs1Patch("chords", "warm_pad")).toEqual({
      patch: "warmPad",
      params: GS1_PATCHES.warmPad,
    });
    expect(resolveGs1Patch("lead", "acid_303")?.patch).toBe("acidLead");
  });

  it("returns null for a native decision, an unknown instrument or an unknown role", () => {
    expect(resolveGs1Patch("chords", "piano_lead")).toBeNull();
    expect(resolveGs1Patch("lead", "sitar_lead")).toBeNull();
    expect(resolveGs1Patch("lead", "no_such_instrument")).toBeNull();
    expect(resolveGs1Patch("bass", "warm_pad")).toBeNull();
    expect(resolveGs1Patch(null, "warm_pad")).toBeNull();
    expect(resolveGs1Patch("chords", undefined)).toBeNull();
  });

  it("covers the roles the plan scoped and nothing else", () => {
    expect(GS1_ROLES).toEqual(["chords", "lead"]);
    for (const role of ["kick", "snare", "hihat", "percussion", "bass", "fx"]) {
      expect(routingForRole(role), `${role} must stay on the native engine`).toBeNull();
    }
  });

  it("routes the overwhelming majority of chord genres, measured by genre count", () => {
    // Coverage by *name* is not the same as coverage by *usage*: 61 of 159 genres use warm_pad.
    let routed = 0;
    let total = 0;
    for (const genre of ALL_GENRES) {
      for (const track of genre.sequencer_pattern.tracks) {
        if (track.track_id !== "chords") continue;
        total += 1;
        if (resolveGs1Patch("chords", track.instrument)) routed += 1;
      }
    }
    expect(total).toBe(ALL_GENRES.length);
    expect(routed / total).toBeGreaterThan(0.85);
  });
});
