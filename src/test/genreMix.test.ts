import { describe, it, expect } from "vitest";
import { ALL_GENRES } from "../data/genres";
import {
  CATEGORY_MIX_PROFILES,
  GENRE_MIX,
  GENRE_MIX_RESOLVED,
  LEGACY_PLACEHOLDER_MIX,
  LOUDNESS_TRIM_MAX_DB,
  LOUDNESS_TRIM_MIN_DB,
  MIX_TRACK_IDS,
  applyGenreMixDefaults,
  getGenreLoudnessTrimDb,
  migrateLegacyPlaceholderMix,
  patternFromGenre,
  resolveGenreMix,
  resolveMixTrackId,
} from "../data/genreMix";
import type { SequencerPattern, SequencerTrack } from "../types/genre";
import { expressionStepCount, resolveGenreExpression } from "../data/genreExpression";

const CATEGORIES = Object.keys(CATEGORY_MIX_PROFILES);

function makePattern(trackOverrides: Partial<SequencerTrack> = {}): SequencerPattern {
  const role = (track_id: SequencerTrack["track_id"], name: string): SequencerTrack => ({
    track_id,
    name,
    instrument: "drum",
    steps: [1, 0, 0, 0, 1, 0, 0, 0],
    velocity: new Array(8).fill(100),
    volume: 0.42,
    pan: -0.77,
    sendA: 0.11,
    sendB: 0.22,
    ...trackOverrides,
  });

  return {
    genre_id: "custom-blank",
    bpm: 120,
    scale: "C minor",
    totalSteps: 8,
    tracks: [
      role("kick", "Kick"),
      role("snare", "Snare"),
      role("hihat", "Hihat"),
      role("percussion", "Percussion"),
      role("bass", "Bass"),
      role("chords", "Chords"),
      role("lead", "Lead"),
      role("fx", "FX"),
    ],
  };
}

describe("genre mix defaults · coverage", () => {
  it("has exactly one mix entry per genre id with no orphans", () => {
    const genreIds = ALL_GENRES.map((g) => g.id).sort();
    const mixIds = Object.keys(GENRE_MIX).sort();
    expect(genreIds.length).toBe(159);
    expect(mixIds).toEqual(genreIds);
    expect(Object.keys(GENRE_MIX_RESOLVED).sort()).toEqual(genreIds);
  });

  it("assigns every genre the category it actually declares", () => {
    const mismatches = ALL_GENRES.filter((g) => GENRE_MIX[g.id]?.category !== g.category).map(
      (g) => `${g.id}: ${g.category} vs ${GENRE_MIX[g.id]?.category}`
    );
    expect(mismatches).toEqual([]);
  });

  it("only uses the six categories that exist in the database", () => {
    const fromData = [...new Set(ALL_GENRES.map((g) => g.category))].sort();
    expect([...CATEGORIES].sort()).toEqual(fromData);
  });
});

describe("genre mix defaults · musical variety", () => {
  it("is not one repeated profile", () => {
    const tuples = new Set<string>();
    for (const mix of Object.values(GENRE_MIX_RESOLVED)) {
      for (const trackId of MIX_TRACK_IDS) {
        tuples.add(`${mix[trackId].volume}/${mix[trackId].pan}`);
      }
    }
    // 159 genres x 8 tracks cannot all collapse onto the old single preset (8 tuples).
    expect(tuples.size).toBeGreaterThanOrEqual(120);
  });

  it("varies panning genuinely per track role", () => {
    const pansFor = (trackId: (typeof MIX_TRACK_IDS)[number]) =>
      [...new Set(Object.values(GENRE_MIX_RESOLVED).map((mix) => mix[trackId].pan))].sort(
        (a, b) => a - b
      );
    const spread = (trackId: (typeof MIX_TRACK_IDS)[number]) => {
      const pans = pansFor(trackId);
      return pans[pans.length - 1] - pans[0];
    };

    // Kick and sub-bass stay mono in the centre — that is a mix decision, not laziness.
    expect(pansFor("kick")).toEqual([0]);
    expect(pansFor("bass")).toEqual([0]);
    // Snare/clap stays effectively centred too.
    expect(Math.max(...pansFor("snare").map(Math.abs))).toBeLessThanOrEqual(0.1);

    // The rest must genuinely move: >=3 distinct positions and a real stereo spread.
    for (const trackId of ["hihat", "percussion", "chords", "lead", "fx"] as const) {
      expect(pansFor(trackId).length, `${trackId} pan is parked`).toBeGreaterThanOrEqual(3);
    }
    expect(spread("hihat")).toBeGreaterThanOrEqual(0.19);
    expect(spread("percussion")).toBeGreaterThanOrEqual(0.6);
    expect(spread("chords")).toBeGreaterThanOrEqual(0.5);
    expect(spread("lead")).toBeGreaterThanOrEqual(0.5);
    // Lead and percussion are placed on both sides depending on the genre.
    for (const trackId of ["percussion", "chords", "lead"] as const) {
      const pans = pansFor(trackId);
      expect(pans.some((p) => p < 0), `${trackId} never pans left`).toBe(true);
      expect(pans.some((p) => p > 0), `${trackId} never pans right`).toBe(true);
    }
  });

  it("revives the send buses instead of leaving them dead", () => {
    const declaredA = Object.values(GENRE_MIX_RESOLVED).filter((mix) =>
      MIX_TRACK_IDS.some((t) => mix[t].sendA > 0)
    ).length;
    const declaredB = Object.values(GENRE_MIX_RESOLVED).filter((mix) =>
      MIX_TRACK_IDS.some((t) => mix[t].sendB > 0)
    ).length;
    expect(declaredA).toBe(159);
    expect(declaredB).toBe(159);
  });

  it("reflects each category's character in the resolved base values", () => {
    // Jazz sits the kit back and the upright bass forward; Rock pushes kick+snare.
    const jazz = CATEGORY_MIX_PROFILES["Jazz/Blues"];
    const rock = CATEGORY_MIX_PROFILES["Rock/Metal"];
    const latin = CATEGORY_MIX_PROFILES["Latin/World"];
    expect(jazz.bass.volume).toBeGreaterThan(jazz.kick.volume);
    expect(rock.kick.volume).toBeGreaterThan(jazz.kick.volume);
    expect(rock.chords.pan).toBeLessThan(-0.3);
    expect(rock.lead.pan).toBeGreaterThan(0.3);
    expect(latin.percussion.volume).toBeGreaterThan(latin.snare.volume);
    expect(latin.percussion.pan).toBeLessThan(-0.3);
  });
});

describe("genre mix defaults · ranges", () => {
  it("keeps every resolved value inside its documented range", () => {
    const problems: string[] = [];
    for (const [genreId, mix] of Object.entries(GENRE_MIX_RESOLVED)) {
      for (const trackId of MIX_TRACK_IDS) {
        const t = mix[trackId];
        if (!(t.volume >= 0 && t.volume <= 1)) problems.push(`${genreId}.${trackId}.volume=${t.volume}`);
        if (!(t.pan >= -1 && t.pan <= 1)) problems.push(`${genreId}.${trackId}.pan=${t.pan}`);
        if (!(t.sendA >= 0 && t.sendA <= 1)) problems.push(`${genreId}.${trackId}.sendA=${t.sendA}`);
        if (!(t.sendB >= 0 && t.sendB <= 1)) problems.push(`${genreId}.${trackId}.sendB=${t.sendB}`);
        if (!Number.isFinite(t.volume) || !Number.isFinite(t.pan)) problems.push(`${genreId}.${trackId} NaN`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("keeps loudness trims inside the clamp bounds", () => {
    for (const [genreId, entry] of Object.entries(GENRE_MIX)) {
      expect(Number.isFinite(entry.loudnessTrimDb), `${genreId} trim not finite`).toBe(true);
      expect(entry.loudnessTrimDb).toBeGreaterThanOrEqual(LOUDNESS_TRIM_MIN_DB);
      expect(entry.loudnessTrimDb).toBeLessThanOrEqual(LOUDNESS_TRIM_MAX_DB);
    }
  });
});

describe("genre mix defaults · apply helper", () => {
  it("seeds volume/pan/sendA/sendB from the table without mutating the input", () => {
    const pattern = makePattern();
    const applied = applyGenreMixDefaults(pattern, "chicago-house");
    const expected = resolveGenreMix("chicago-house")!;

    expect(applied).not.toBe(pattern);
    expect(applied.tracks[0]).not.toBe(pattern.tracks[0]);
    expect(applied.tracks[0].steps).not.toBe(pattern.tracks[0].steps);
    applied.tracks.forEach((track, idx) => {
      const role = MIX_TRACK_IDS[idx];
      expect(track.volume).toBe(expected[role].volume);
      expect(track.pan).toBe(expected[role].pan);
      expect(track.sendA).toBe(expected[role].sendA);
      expect(track.sendB).toBe(expected[role].sendB);
    });
    // Original keeps the caller's own values.
    expect(pattern.tracks[0].volume).toBe(0.42);
    expect(pattern.tracks[0].pan).toBe(-0.77);
    expect(pattern.tracks[0].sendA).toBe(0.11);
  });

  it("falls back to the genre_id carried by the pattern", () => {
    const pattern = { ...makePattern(), genre_id: "trap-rap" };
    const applied = applyGenreMixDefaults(pattern);
    expect(applied.tracks[0].volume).toBe(resolveGenreMix("trap-rap")!.kick.volume);
  });

  it("leaves an unknown/custom genre's own values untouched", () => {
    const pattern = makePattern({ volume: 0.05, pan: 0.9, sendA: 0.03, sendB: 0.04 });
    for (const unknownId of ["custom-abc", "made-up-genre", ""]) {
      const applied = applyGenreMixDefaults(pattern, unknownId);
      expect(applied).not.toBe(pattern);
      for (const track of applied.tracks) {
        expect(track.volume).toBe(0.05);
        expect(track.pan).toBe(0.9);
        expect(track.sendA).toBe(0.03);
        expect(track.sendB).toBe(0.04);
      }
    }
  });

  it("patternFromGenre applies the genre's mix, and expands the pattern to the genre's expression", () => {
    const genre = ALL_GENRES.find((g) => g.id === "boom-bap")!;
    const applied = patternFromGenre(genre);
    const expected = resolveGenreMix("boom-bap")!;
    expect(applied.tracks[0].volume).toBe(expected.kick.volume);
    expect(applied.bpm).toBe(genre.sequencer_pattern.bpm);
    // The authored pattern is a 16-step skeleton; loading a genre expands it to the length its
    // chord progression needs, and the authored loop is preserved as that track's own loop so the
    // drums repeat underneath instead of being re-authored.
    const expression = resolveGenreExpression("boom-bap", genre.category);
    expect(applied.totalSteps).toBe(expressionStepCount(expression, applied));
    expect(applied.totalSteps).toBeGreaterThan(genre.sequencer_pattern.tracks[0].steps.length);
    // `totalSteps` is optional on the type; the arrays are the source of truth the store derives it from.
    expect(applied.tracks[0].steps.length).toBe(applied.totalSteps);
    expect(applied.tracks[0].trackLength).toBe(genre.sequencer_pattern.tracks[0].steps.length ?? 16);
    // The authored steps are still there at the top of the track (they are the loop).
    expect(applied.tracks[0].steps.slice(0, 16)).toEqual(genre.sequencer_pattern.tracks[0].steps);
    // Independent copy: mutating the result must not touch the database.
    applied.tracks[0].steps[0] = 3;
    expect(genre.sequencer_pattern.tracks[0].steps[0]).not.toBe(3);
  });

  it("writes the genre's chords into the pattern as real note stacks", () => {
    const genre = ALL_GENRES.find((g) => g.id === "boom-bap")!;
    const applied = patternFromGenre(genre);
    const chords = applied.tracks.find((t) => t.track_id === "chords")!;
    const stacks = (chords.pitches ?? []).filter((stack): stack is number[] => Array.isArray(stack) && stack.length > 0);
    // The whole complaint was that the chords track held single notes: every sounding chord step
    // must now carry a stack, and at least one of them must be an actual chord.
    expect(stacks.length).toBeGreaterThan(0);
    expect(Math.max(...stacks.map((s) => s.length))).toBeGreaterThanOrEqual(3);
    // `pitch` keeps its old meaning (the root) for every step that sounds.
    chords.steps.forEach((value, i) => {
      if (value > 0) expect(chords.pitch?.[i]).toBe(Math.min(...(chords.pitches?.[i] as number[])));
    });
  });

  it("maps track roles by id and falls back to name heuristics", () => {
    expect(resolveMixTrackId({ track_id: "kick", name: "anything" })).toBe("kick");
    expect(resolveMixTrackId({ track_id: "unknown" as never, name: "808 Snare" })).toBe("snare");
    expect(resolveMixTrackId({ track_id: "other" as never, name: "Shaker" })).toBe("percussion");
    expect(resolveMixTrackId({ track_id: "other" as never, name: "Mystery" })).toBeNull();
  });
});

describe("genre mix defaults · legacy placeholder migration", () => {
  const legacyPattern = (): SequencerPattern => {
    const pattern = makePattern();
    return {
      ...pattern,
      tracks: pattern.tracks.map((track) => {
        const role = resolveMixTrackId(track)!;
        const legacy = LEGACY_PLACEHOLDER_MIX[role];
        return { ...track, volume: legacy.volume, pan: legacy.pan, sendA: legacy.sendA, sendB: legacy.sendB };
      }),
    };
  };

  it("re-seeds untouched tracks and leaves user-moved tracks alone, per track", () => {
    const pattern = legacyPattern();
    // User moved only the kick.
    pattern.tracks[0].volume = 0.33;

    const migrated = migrateLegacyPlaceholderMix(pattern, "chicago-house");
    const expected = resolveGenreMix("chicago-house")!;

    expect(migrated.tracks[0].volume).toBe(0.33);
    expect(migrated.tracks[0].pan).toBe(LEGACY_PLACEHOLDER_MIX.kick.pan);
    for (const track of migrated.tracks.slice(1)) {
      const role = resolveMixTrackId(track)!;
      expect(track.volume, role).toBe(expected[role].volume);
      expect(track.pan, role).toBe(expected[role].pan);
      expect(track.sendA, role).toBe(expected[role].sendA);
      expect(track.sendB, role).toBe(expected[role].sendB);
    }
  });

  it("treats a non-zero send as a user edit even when volume/pan still look legacy", () => {
    const pattern = legacyPattern();
    pattern.tracks[2].sendA = 0.4;
    const migrated = migrateLegacyPlaceholderMix(pattern, "trap-rap");
    expect(migrated.tracks[2].volume).toBe(LEGACY_PLACEHOLDER_MIX.hihat.volume);
    expect(migrated.tracks[2].sendA).toBe(0.4);
    expect(migrated.tracks[3].volume).toBe(resolveGenreMix("trap-rap")!.percussion.volume);
  });

  it("never touches an unknown/custom genre and never mutates its input", () => {
    const pattern = { ...legacyPattern(), genre_id: "custom-legacy" };
    const migrated = migrateLegacyPlaceholderMix(pattern, "custom-legacy");
    expect(migrated).not.toBe(pattern);
    migrated.tracks.forEach((track, idx) => {
      expect(track.volume).toBe(pattern.tracks[idx].volume);
      expect(track.pan).toBe(pattern.tracks[idx].pan);
    });
    expect(migrated.tracks[0].steps).not.toBe(pattern.tracks[0].steps);
  });

  it("migrates the full legacy preset only where it is still exactly the old tuple", () => {
    const genre = ALL_GENRES.find((g) => g.id === "ambient")!;
    const legacy = {
      ...genre.sequencer_pattern,
      tracks: genre.sequencer_pattern.tracks.map((track) => ({
        ...track,
        ...LEGACY_PLACEHOLDER_MIX[resolveMixTrackId(track)!],
      })),
    };
    const migrated = migrateLegacyPlaceholderMix(legacy, genre.id);
    const expected = resolveGenreMix(genre.id)!;
    for (const track of migrated.tracks) {
      const role = resolveMixTrackId(track)!;
      expect(track.volume).toBe(expected[role].volume);
      expect(track.sendB).toBe(expected[role].sendB);
    }
  });
});

describe("genre mix defaults · loudness trim lookup", () => {
  it("returns the table value for a known genre", () => {
    expect(getGenreLoudnessTrimDb("chicago-house")).toBe(GENRE_MIX["chicago-house"].loudnessTrimDb);
  });

  it("returns 0 dB for custom and unknown genres", () => {
    expect(getGenreLoudnessTrimDb("custom-whatever")).toBe(0);
    expect(getGenreLoudnessTrimDb("nope")).toBe(0);
    expect(getGenreLoudnessTrimDb(undefined)).toBe(0);
  });
});
