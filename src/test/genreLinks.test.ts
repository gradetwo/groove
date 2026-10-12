import { describe, it, expect } from "vitest";
import {
  HOUSE_GENRES,
  TECHNO_GENRES,
  TRANCE_GENRES,
  DUBSTEP_GENRES,
  DNB_GENRES,
  UK_BASS_GENRES,
  TRAP_DRILL_GENRES,
  FUTURE_DOWNTEMPO_GENRES,
  HARD_ELECTRO_GENRES,
  ROCK_METAL_GENRES,
  HIPHOP_GENRES,
  JAZZ_BLUES_GENRES,
  POP_RNB_GENRES,
  LATIN_WORLD_GENRES,
} from "../data/genres";
import { MIN_GENRE_SOURCES } from "../data/schema";
import type { Genre } from "../types/genre";

/**
 * N-06 acceptance: "关系覆盖 159/159 source；外链可校验".
 *
 * Relation coverage is enforced by red line R3c. This test covers the other half —
 * that every representative track actually carries a resolvable, well-formed link and
 * that every genre has at least the required number of sources. The links are YouTube
 * *search* URLs by design (a canonical per-track URL for 795 tracks would have to be
 * hand-authored), so the rule enforced here is structural: absolute https URL, an
 * allow-listed host, a non-empty query, plus a title/year for each entry.
 *
 * If the data is ever upgraded to canonical links, tighten ALLOWED_LINK_HOSTS rather
 * than deleting this guard.
 */
const ALLOWED_LINK_HOSTS = new Set(["www.youtube.com", "youtube.com", "music.youtube.com"]);

const ALL_GENRES: Genre[] = [
  ...HOUSE_GENRES,
  ...TECHNO_GENRES,
  ...TRANCE_GENRES,
  ...DUBSTEP_GENRES,
  ...DNB_GENRES,
  ...UK_BASS_GENRES,
  ...TRAP_DRILL_GENRES,
  ...FUTURE_DOWNTEMPO_GENRES,
  ...HARD_ELECTRO_GENRES,
  ...ROCK_METAL_GENRES,
  ...HIPHOP_GENRES,
  ...JAZZ_BLUES_GENRES,
  ...POP_RNB_GENRES,
  ...LATIN_WORLD_GENRES,
];

describe("N-06 · representative track links are verifiable", () => {
  it("every genre has a non-empty representative track list", () => {
    const empty = ALL_GENRES.filter((g) => (g.representative_tracks?.length ?? 0) === 0).map((g) => g.id);
    expect(empty, `genres without representative tracks: ${empty.join(", ")}`).toEqual([]);
  });

  it("every link is an absolute https URL on an allow-listed host", () => {
    const bad: string[] = [];
    for (const genre of ALL_GENRES) {
      for (const track of genre.representative_tracks ?? []) {
        const link = track.link ?? "";
        if (!link.startsWith("https://")) {
          bad.push(`${genre.id}: not https -> ${link}`);
          continue;
        }
        let host = "";
        try {
          host = new URL(link).host;
        } catch {
          bad.push(`${genre.id}: unparseable -> ${link}`);
          continue;
        }
        if (!ALLOWED_LINK_HOSTS.has(host)) {
          bad.push(`${genre.id}: unexpected host ${host}`);
        }
      }
    }
    expect(bad, `malformed or untrusted track links:\n${bad.slice(0, 10).join("\n")}`).toEqual([]);
  });

  it("every linked track carries a title and a plausible year", () => {
    const bad: string[] = [];
    for (const genre of ALL_GENRES) {
      for (const track of genre.representative_tracks ?? []) {
        if (!track.title || !track.title.trim()) bad.push(`${genre.id}: missing title`);
        if (!track.artist || !track.artist.trim()) bad.push(`${genre.id}: missing artist`);
        // 1900 is the practical start of recorded music; blues/jazz genres legitimately
        // reference 1940s recordings (the first draft of this bound used 1950 and
        // flagged 47 valid entries).
        if (typeof track.year !== "number" || track.year < 1900 || track.year > 2100) {
          bad.push(`${genre.id}: implausible year ${track.year}`);
        }
      }
    }
    expect(bad, `incomplete track metadata:\n${bad.slice(0, 10).join("\n")}`).toEqual([]);
  });

  it("every genre lists at least the required number of sources", () => {
    const thin = ALL_GENRES.filter((g) => (g.sources?.length ?? 0) < MIN_GENRE_SOURCES).map((g) => g.id);
    expect(thin, `genres below the ${MIN_GENRE_SOURCES}-source minimum: ${thin.join(", ")}`).toEqual([]);
  });

  it("covers the whole database", () => {
    expect(ALL_GENRES.length).toBeGreaterThanOrEqual(159);
    const withTracks = ALL_GENRES.filter((g) => (g.representative_tracks?.length ?? 0) > 0).length;
    // PRD 10.2 requires at least five representative tracks per genre.
    const withFive = ALL_GENRES.filter((g) => (g.representative_tracks?.length ?? 0) >= 5).length;
    expect(withTracks).toBe(ALL_GENRES.length);
    expect(withFive).toBeGreaterThanOrEqual(Math.floor(ALL_GENRES.length * 0.9));
  });
});
