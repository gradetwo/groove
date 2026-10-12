import { describe, it, expect } from "vitest";
import { ALL_GENRES } from "../data/genres";
import {
  CATEGORY_MIX_PROFILES,
  GENRE_MIX,
  GENRE_MIX_RESOLVED,
  HUMANISE_BY_CATEGORY,
  HUMANISE_TRACK_SCALE,
  LEGACY_PLACEHOLDER_MIX,
  LOUDNESS_TRIM_MAX_DB,
  LOUDNESS_TRIM_MIN_DB,
  MIX_TRACK_IDS,
  MIX_WIDTH_SCALE,
  applyGenreMixDefaults,
  getGenreHumaniseAmount,
  getGenreLoudnessTrimDb,
  widenPan,
  humanisePatternVelocities,
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

  it("spreads the side lanes by MIX_WIDTH_SCALE, and only the side lanes", () => {
    /**
     * P0.4. The authored pan is the mix's *intent*; the width stage is what makes it audible. Measured at 2.0 on
     * 2026-09-23: the sample goes from 12/12 effectively mono to 3/12, with the side at −9.2…−20.5 dB.
     */
    // Kick, bass and snare keep exactly what the table authored — the doubling must not touch the centre.
    for (const trackId of ["kick", "bass", "snare"] as const) {
      const authored = new Set<number>();
      for (const mix of Object.values(GENRE_MIX)) {
        const base = CATEGORY_MIX_PROFILES[mix.category] ?? CATEGORY_MIX_PROFILES.Electronic;
        authored.add((mix.overrides?.[trackId]?.pan ?? base[trackId]?.pan ?? 0));
      }
      const resolved = new Set(Object.values(GENRE_MIX_RESOLVED).map((mix) => mix[trackId].pan));
      for (const value of resolved) expect(authored.has(value), `${trackId} pan ${value} was not authored`).toBe(true);
    }
    // Every other lane is exactly doubled, until the clamp at ±1.
    const doubled = Object.entries(GENRE_MIX).filter(([id]) => !id.startsWith("__"));
    let checked = 0;
    for (const [, mix] of doubled) {
      const base = CATEGORY_MIX_PROFILES[mix.category] ?? CATEGORY_MIX_PROFILES.Electronic;
      for (const trackId of MIX_TRACK_IDS) {
        if (trackId === "kick" || trackId === "bass" || trackId === "snare") continue;
        const raw = mix.overrides?.[trackId]?.pan ?? base[trackId]?.pan ?? 0;
        const expected = Math.max(-1, Math.min(1, raw * MIX_WIDTH_SCALE));
        expect(widenPan(trackId, raw)).toBeCloseTo(expected, 6);
        checked += 1;
      }
    }
    // 159 genres x the five side lanes; named so a genre dropped from the table cannot pass this silently.
    expect(checked).toBe(Object.keys(GENRE_MIX).length * 5);
    // A hard-panned lane is the case the clamp exists for.
    expect(widenPan("lead", 0.5)).toBe(1);
    expect(widenPan("lead", -0.5)).toBe(-1);
    expect(widenPan("lead", Number.NaN)).toBe(0);
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

/** The twelve ids `scripts/check_groove.mjs` samples; the gate's budgets are about these. */
const GROOVE_SAMPLE = [
  "chicago-house",
  "detroit-techno",
  "minimal-techno",
  "liquid-dnb",
  "ambient",
  "reggaeton",
  "afrobeat",
  "chicago-blues",
  "boom-bap",
  "trap-rap",
  "disco",
  "synthwave",
];

/** The analyser's `velocityByTrack` view of a pattern (sounding steps only). */
function distinctVelocitiesByTrack(pattern: SequencerPattern): Record<string, number | null> {
  return Object.fromEntries(
    pattern.tracks.map((track) => {
      const on = track.steps
        .map((step, index) => (step ? track.velocity?.[index] ?? 100 : null))
        .filter((value): value is number => value !== null);
      return [track.track_id, on.length ? new Set(on).size : null];
    })
  );
}

describe("P0.2 · velocity humanisation policy", () => {
  it("gives an unknown genre, an unknown lane and a zero amount no amount at all", () => {
    const lane = { track_id: "hihat", name: "Hi-hat" } as SequencerTrack;
    expect(getGenreHumaniseAmount("custom-blank", lane)).toBe(0);
    expect(getGenreHumaniseAmount("nope", lane)).toBe(0);
    expect(getGenreHumaniseAmount(undefined, lane)).toBe(0);
    expect(getGenreHumaniseAmount("reggaeton", { track_id: "weird", name: "Weird" } as unknown as SequencerTrack)).toBe(0);
  });

  it("is the category default scaled per lane, and a genre can override the default", () => {
    const lane = (track_id: string, name: string) => ({ track_id, name }) as unknown as SequencerTrack;
    // reggaeton declares no humanise override, so it is its category default times the lane scale.
    expect(getGenreHumaniseAmount("reggaeton", lane("hihat", "Hi-hat"))).toBeCloseTo(
      HUMANISE_BY_CATEGORY["Latin/World"] * HUMANISE_TRACK_SCALE.hihat
    );
    // chiptune does: trackers are grid-locked, so it sits far below the Electronic base.
    expect(getGenreHumaniseAmount("chiptune", lane("hihat", "Hi-hat"))).toBeCloseTo(
      GENRE_MIX.chiptune.humanise! * HUMANISE_TRACK_SCALE.hihat
    );
    expect(GENRE_MIX.chiptune.humanise!).toBeLessThan(HUMANISE_BY_CATEGORY.Electronic);
    // The low end is the quietest lane in every genre: kick and bass must never be the loosest.
    for (const genreId of Object.keys(GENRE_MIX)) {
      const kick = getGenreHumaniseAmount(genreId, lane("kick", "Kick"));
      const hats = getGenreHumaniseAmount(genreId, lane("hihat", "Hi-hat"));
      expect(kick, genreId).toBeLessThan(hats);
      expect(getGenreHumaniseAmount(genreId, lane("bass", "Bass")), genreId).toBeLessThan(hats);
    }
  });

  it("bakes a stable performance in, leaves the input alone, and skips silent steps", () => {
    const source: SequencerPattern = {
      genre_id: "reggaeton",
      bpm: 96,
      scale: "A minor",
      totalSteps: 16,
      tracks: [
        {
          track_id: "hihat",
          name: "Hi-hat",
          instrument: "drum",
          steps: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
          velocity: new Array(16).fill(100),
          volume: 0.7,
          pan: -0.3,
          sendA: 0,
          sendB: 0,
        },
      ],
    } as unknown as SequencerPattern;

    const first = humanisePatternVelocities(source, "reggaeton");
    const second = humanisePatternVelocities(source, "reggaeton");
    expect(first.tracks[0].velocity).toEqual(second.tracks[0].velocity);
    // The input is untouched, and the sounding steps really moved.
    expect(source.tracks[0].velocity).toEqual(new Array(16).fill(100));
    const velocity = first.tracks[0].velocity!;
    expect(new Set([0, 4, 8, 12].map((i) => velocity[i])).size).toBeGreaterThan(1);
    // A step that does not sound keeps its authored value exactly.
    for (const silent of [1, 2, 3, 5, 6, 7]) expect(velocity[silent]).toBe(100);
    // Range is the MIDI range the engine and every exporter share.
    for (const value of velocity) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(127);
    }
  });

  it("creates the velocity lane when a genre's track has none", () => {
    const source = {
      genre_id: "afrobeat",
      bpm: 110,
      scale: "C minor",
      totalSteps: 8,
      tracks: [
        {
          track_id: "percussion",
          name: "Percussion",
          instrument: "drum",
          steps: [1, 0, 1, 0, 1, 0, 1, 0],
          volume: 0.9,
          pan: -0.4,
          sendA: 0,
          sendB: 0,
        },
      ],
    } as unknown as SequencerPattern;
    const humanised = humanisePatternVelocities(source, "afrobeat");
    const velocity = humanised.tracks[0].velocity!;
    expect(velocity).toHaveLength(8);
    expect(new Set([0, 2, 4, 6].map((i) => velocity[i])).size).toBeGreaterThan(1);
  });
});

describe("P0.2 · the groove gate's flatTracks claim", () => {
  it("no sampled genre ships four lanes of one velocity", () => {
    const offenders: string[] = [];
    for (const genreId of GROOVE_SAMPLE) {
      const genre = ALL_GENRES.find((entry) => entry.id === genreId);
      expect(genre, `sample id ${genreId} must exist in ALL_GENRES`).toBeDefined();
      const pattern = patternFromGenre(genre!);
      const distinct = distinctVelocitiesByTrack(pattern);
      const flat = Object.values(distinct).filter((count) => count !== null && count <= 1).length;
      if (flat >= 4) offenders.push(`${genreId}: ${flat} flat lanes`);
    }
    expect(offenders).toEqual([]);
  });

  it("is what changed the measurement: the authored skeleton really was flat", () => {
    // The gate used to render `genre.sequencer_pattern` directly — the authored skeleton,
    // which no user ever plays. It is flat; the pattern the app plays is not. If this ever
    // stops being true the humanisation has been undone somewhere upstream.
    const flatLanes = (pattern: SequencerPattern) =>
      Object.values(distinctVelocitiesByTrack(pattern)).filter((count) => count !== null && count <= 1).length;

    const genre = ALL_GENRES.find((entry) => entry.id === "reggaeton")!;
    expect(flatLanes(genre.sequencer_pattern)).toBeGreaterThanOrEqual(4);
    expect(flatLanes(patternFromGenre(genre))).toBeLessThan(4);
  });
});
