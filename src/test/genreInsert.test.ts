/**
 * Per-genre insert overrides (requirement 9, phase D).
 *
 * The layer's whole value is that it is *specific*: a metal rhythm guitar is driven and a
 * jazz comp is not, and both of those are audible claims. These tests pin the three things
 * that can silently break that:
 *
 *   1. coverage — every shipped genre is named exactly once, so a new genre cannot arrive
 *      with no channel strip and a renamed id cannot leave an orphan behind;
 *   2. validity — every patch touches only real fields, and every resolved number is inside
 *      the bounds the DSP and the inspector clamp to (a patch outside them would be silently
 *      clamped at render time, which reads as "the default didn't apply");
 *   3. resolution — the role layer still shows through, unknown genres fall back, and the
 *      role defaults themselves are never mutated.
 */
import { describe, expect, it } from "vitest";
import { ALL_GENRES } from "../data/genres";
import {
  GENRE_INSERT,
  GENRE_INSERT_ROLES,
  applyInsertPatch,
  hasGenreInsert,
  resolveTrackInsertForGenre,
} from "../data/genreInsert";
import {
  INSERT_COMP_MAX_ATTACK_SEC,
  INSERT_COMP_MAX_MAKEUP_DB,
  INSERT_COMP_MAX_RATIO,
  INSERT_COMP_MAX_RELEASE_SEC,
  INSERT_COMP_MAX_THRESHOLD_DB,
  INSERT_COMP_MIN_ATTACK_SEC,
  INSERT_COMP_MIN_MAKEUP_DB,
  INSERT_COMP_MIN_RATIO,
  INSERT_COMP_MIN_RELEASE_SEC,
  INSERT_COMP_MIN_THRESHOLD_DB,
  INSERT_DRIVE_MAX,
  INSERT_DRIVE_MIN,
  INSERT_DRIVE_MIX_MAX,
  INSERT_EQ_MAX_GAIN_DB,
  INSERT_EQ_MAX_HZ,
  INSERT_EQ_MAX_Q,
  INSERT_EQ_MIN_GAIN_DB,
  INSERT_EQ_MIN_HZ,
  INSERT_EQ_MIN_Q,
  INSERT_HPF_MAX_HZ,
  INSERT_HPF_MIN_HZ,
  ROLE_INSERT_DEFAULTS,
  type TrackInsertParams,
} from "../data/trackInsert";
import { MIX_TRACK_IDS } from "../data/genreMix";

const GENRE_IDS = ALL_GENRES.map((g) => g.id).sort();
const PATCH_FIELDS = new Set([
  "hpfEnabled",
  "hpfHz",
  "low",
  "mid",
  "high",
  "compEnabled",
  "compThresholdDb",
  "compRatio",
  "compAttackSec",
  "compReleaseSec",
  "compMakeupDb",
  "driveEnabled",
  "driveAmount",
  "driveMix",
]);
const BAND_FIELDS = new Set(["enabled", "hz", "gainDb", "q"]);
const ROLE_SET = new Set<string>(MIX_TRACK_IDS);

/** Every (genre, role) resolved pair, built once — 159 x 8 = 1272 chains. */
function allResolved(): Array<{ genreId: string; role: string; params: TrackInsertParams }> {
  const out: Array<{ genreId: string; role: string; params: TrackInsertParams }> = [];
  for (const genreId of Object.keys(GENRE_INSERT)) {
    for (const role of GENRE_INSERT_ROLES) {
      out.push({ genreId, role, params: resolveTrackInsertForGenre(role, genreId) });
    }
  }
  return out;
}

describe("genre insert table — coverage (the R10-style guard)", () => {
  it("names every shipped genre and no orphan id", () => {
    const keys = Object.keys(GENRE_INSERT).sort();
    const missing = GENRE_IDS.filter((id) => !keys.includes(id));
    const orphan = keys.filter((id) => !GENRE_IDS.includes(id));
    expect(missing, `genres with no channel-strip patch: ${missing.join(", ")}`).toEqual([]);
    expect(orphan, `patches for unknown genre ids: ${orphan.join(", ")}`).toEqual([]);
    expect(keys.length).toBe(ALL_GENRES.length);
  });

  it("the coverage check can fail (mutation guard)", () => {
    // Proves the assertion above is not vacuous: a table missing one id is detected.
    const partial = { ...GENRE_INSERT };
    delete partial[GENRE_IDS[0]];
    const keys = Object.keys(partial).sort();
    const missing = GENRE_IDS.filter((id) => !keys.includes(id));
    expect(missing).toEqual([GENRE_IDS[0]]);
  });

  it("only patches roles that exist", () => {
    const bad: string[] = [];
    for (const [genreId, patch] of Object.entries(GENRE_INSERT)) {
      for (const role of Object.keys(patch)) {
        if (!ROLE_SET.has(role)) bad.push(`${genreId}.${role}`);
      }
    }
    expect(bad, `unknown roles: ${bad.join(", ")}`).toEqual([]);
  });

  it("only touches real fields, at both levels", () => {
    const bad: string[] = [];
    for (const [genreId, patch] of Object.entries(GENRE_INSERT)) {
      for (const [role, rolePatch] of Object.entries(patch)) {
        for (const [field, value] of Object.entries(rolePatch ?? {})) {
          if (!PATCH_FIELDS.has(field)) bad.push(`${genreId}.${role}.${field}`);
          if (value && typeof value === "object") {
            for (const bandField of Object.keys(value)) {
              if (!BAND_FIELDS.has(bandField)) bad.push(`${genreId}.${role}.${field}.${bandField}`);
            }
          }
        }
      }
    }
    expect(bad, `unknown fields: ${bad.join(", ")}`).toEqual([]);
  });

  it("hasGenreInsert agrees with the table", () => {
    expect(hasGenreInsert("heavy-metal")).toBe(true);
    expect(hasGenreInsert("definitely-not-a-genre")).toBe(false);
    expect(hasGenreInsert(null)).toBe(false);
    expect(hasGenreInsert(undefined)).toBe(false);
  });
});

describe("genre insert resolution — the role layer still shows through", () => {
  it("returns the role default for an unknown or absent genre", () => {
    expect(resolveTrackInsertForGenre("bass", "not-a-genre")).toEqual(ROLE_INSERT_DEFAULTS.bass);
    expect(resolveTrackInsertForGenre("bass", null)).toEqual(ROLE_INSERT_DEFAULTS.bass);
    expect(resolveTrackInsertForGenre("bass")).toEqual(ROLE_INSERT_DEFAULTS.bass);
  });

  it("keeps the role's untouched fields exactly", () => {
    // heavy-metal only patches drive/comp on `chords`; the EQ bands must be the role's.
    const resolved = resolveTrackInsertForGenre("chords", "heavy-metal");
    const role = ROLE_INSERT_DEFAULTS.chords;
    expect(resolved.hpfEnabled).toBe(role.hpfEnabled);
    expect(resolved.hpfHz).toBe(role.hpfHz);
    expect(resolved.low).toEqual(role.low);
    expect(resolved.high).toEqual(role.high);
    // …and the patched fields really changed.
    expect(resolved.driveEnabled).toBe(true);
    expect(resolved.driveEnabled).not.toBe(role.driveEnabled);
  });

  it("never mutates the role defaults", () => {
    const before = JSON.stringify(ROLE_INSERT_DEFAULTS);
    for (const genreId of Object.keys(GENRE_INSERT)) {
      for (const role of GENRE_INSERT_ROLES) resolveTrackInsertForGenre(role, genreId);
    }
    // Mutate a returned chain and confirm the next call is unaffected.
    const first = resolveTrackInsertForGenre("chords", "heavy-metal");
    first.driveAmount = 99;
    first.mid.gainDb = -99;
    expect(resolveTrackInsertForGenre("chords", "heavy-metal").driveAmount).not.toBe(99);
    expect(JSON.stringify(ROLE_INSERT_DEFAULTS)).toBe(before);
  });

  it("applyInsertPatch is a no-op for undefined, and returns a fresh object", () => {
    const base = ROLE_INSERT_DEFAULTS.kick;
    const same = applyInsertPatch(base, undefined);
    expect(same).toEqual(base);
    expect(same).not.toBe(base);
    expect(same.mid).not.toBe(base.mid);
  });
});

describe("genre insert values — inside the bounds the DSP clamps to", () => {
  const inRange = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

  it("every resolved number is inside range", () => {
    const bad: string[] = [];
    const check = (label: string, v: number, lo: number, hi: number) => {
      if (!inRange(v, lo, hi)) bad.push(`${label}=${v} outside [${lo}, ${hi}]`);
    };
    for (const { genreId, role, params } of allResolved()) {
      const at = `${genreId}.${role}`;
      check(`${at}.hpfHz`, params.hpfHz, INSERT_HPF_MIN_HZ, INSERT_HPF_MAX_HZ);
      for (const bandName of ["low", "mid", "high"] as const) {
        const band = params[bandName];
        check(`${at}.${bandName}.hz`, band.hz, INSERT_EQ_MIN_HZ, INSERT_EQ_MAX_HZ);
        check(`${at}.${bandName}.gainDb`, band.gainDb, INSERT_EQ_MIN_GAIN_DB, INSERT_EQ_MAX_GAIN_DB);
        check(`${at}.${bandName}.q`, band.q, INSERT_EQ_MIN_Q, INSERT_EQ_MAX_Q);
      }
      check(
        `${at}.compThresholdDb`,
        params.compThresholdDb,
        INSERT_COMP_MIN_THRESHOLD_DB,
        INSERT_COMP_MAX_THRESHOLD_DB
      );
      check(`${at}.compRatio`, params.compRatio, INSERT_COMP_MIN_RATIO, INSERT_COMP_MAX_RATIO);
      check(
        `${at}.compAttackSec`,
        params.compAttackSec,
        INSERT_COMP_MIN_ATTACK_SEC,
        INSERT_COMP_MAX_ATTACK_SEC
      );
      check(
        `${at}.compReleaseSec`,
        params.compReleaseSec,
        INSERT_COMP_MIN_RELEASE_SEC,
        INSERT_COMP_MAX_RELEASE_SEC
      );
      check(`${at}.compMakeupDb`, params.compMakeupDb, INSERT_COMP_MIN_MAKEUP_DB, INSERT_COMP_MAX_MAKEUP_DB);
      check(`${at}.driveAmount`, params.driveAmount, INSERT_DRIVE_MIN, INSERT_DRIVE_MAX);
      check(`${at}.driveMix`, params.driveMix, 0, INSERT_DRIVE_MIX_MAX);
    }
    expect(bad.slice(0, 10), `${bad.length} out-of-range values`).toEqual([]);
  });

  it("keeps drive mix conservative — this is character, not a level jump", () => {
    const loud = allResolved().filter((r) => r.params.driveMix > 0.6);
    expect(loud.map((r) => `${r.genreId}.${r.role}=${r.params.driveMix}`)).toEqual([]);
  });
});

describe("genre insert values — the musical claims", () => {
  it("drives the metal rhythm guitar and not the jazz comp", () => {
    for (const id of ["heavy-metal", "thrash-metal", "death-metal", "black-metal", "metalcore"]) {
      const chords = resolveTrackInsertForGenre("chords", id);
      expect(chords.driveEnabled, `${id} chords should be driven`).toBe(true);
      expect(chords.driveAmount, `${id} chords drive amount`).toBeGreaterThanOrEqual(4);
    }
    for (const id of ["bebop", "cool-jazz", "modal-jazz", "traditional-jazz", "gypsy-jazz"]) {
      expect(resolveTrackInsertForGenre("chords", id).driveEnabled, `${id} chords`).toBe(false);
    }
  });

  it("gives dub a sculpted, driven bass and a dark snare", () => {
    const bass = resolveTrackInsertForGenre("bass", "dub");
    expect(bass.driveEnabled).toBe(true);
    expect(bass.mid.gainDb).toBeLessThan(-3);
    expect(bass.low.gainDb).toBeGreaterThan(2);
    expect(resolveTrackInsertForGenre("snare", "dub").high.gainDb).toBeLessThan(0);
  });

  it("gives the 808 genres a slower release than the role default", () => {
    const role = ROLE_INSERT_DEFAULTS.bass.compReleaseSec;
    for (const id of ["trap-rap", "uk-drill", "reggaeton", "contemporary-rnb"]) {
      expect(resolveTrackInsertForGenre("bass", id).compReleaseSec, id).toBeGreaterThan(role);
    }
  });

  it("moves most of the library away from the bare role default", () => {
    // If this ever fails, the per-genre layer has quietly become a no-op.
    const changed = Object.keys(GENRE_INSERT).filter((genreId) =>
      GENRE_INSERT_ROLES.some(
        (role) =>
          JSON.stringify(resolveTrackInsertForGenre(role, genreId)) !==
          JSON.stringify(ROLE_INSERT_DEFAULTS[role])
      )
    );
    expect(changed.length).toBeGreaterThan(50);
    // …and the untouched remainder is deliberate, not an oversight: every genre must still
    // resolve to a complete chain.
    for (const genreId of Object.keys(GENRE_INSERT)) {
      const resolved = resolveTrackInsertForGenre("kick", genreId);
      expect(Number.isFinite(resolved.hpfHz)).toBe(true);
      expect(resolved.low.gainDb).toBeTypeOf("number");
    }
  });
});
