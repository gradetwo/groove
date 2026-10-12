import { describe, it, expect } from 'vitest';
import { ALL_GENRES, ELECTRONIC_GENRES, NON_ELECTRONIC_GENRES, GENRES_MAP } from '../data/genres';
import { GENRE_RELATIONS } from '../data/relations';
import { TIMELINE_STORIES } from '../data/timeline_stories';

describe('Genre Database Verification (PRD Standard 10.2)', () => {
  it('should contain at least 150 unique genres', () => {
    expect(ALL_GENRES.length).toBeGreaterThanOrEqual(150);
    const idSet = new Set(ALL_GENRES.map(g => g.id));
    expect(idSet.size).toBe(ALL_GENRES.length);
  });

  it('should contain at least 80 electronic music genres', () => {
    expect(ELECTRONIC_GENRES.length).toBeGreaterThanOrEqual(80);
    expect(NON_ELECTRONIC_GENRES.length).toBeGreaterThan(0);
  });

  it('every genre must have at least 5 representative tracks with required fields', () => {
    for (const g of ALL_GENRES) {
      expect(g.representative_tracks.length, `Genre ${g.id} tracks count`).toBeGreaterThanOrEqual(5);
      for (const track of g.representative_tracks) {
        expect(track.title).toBeTruthy();
        expect(track.artist).toBeTruthy();
        expect(track.year).toBeGreaterThanOrEqual(1850);
        expect(track.link).toBeTruthy();
      }
    }
  });

  it('every genre must have English name and bilingual descriptions', () => {
    for (const g of ALL_GENRES) {
      // English name
      expect(g.name).toMatch(/^[A-Za-z0-9\s/&'-]+$/);

      // Bilingual context & production fields
      expect(g.cultural_context.en.length).toBeGreaterThan(10);
      expect(g.cultural_context.zh.length).toBeGreaterThan(10);
      expect(g.sound_design.en.length).toBeGreaterThan(5);
      expect(g.sound_design.zh.length).toBeGreaterThan(5);
      expect(g.rhythm_features.en.length).toBeGreaterThan(5);
      expect(g.rhythm_features.zh.length).toBeGreaterThan(5);
      expect(g.bass_pattern.en.length).toBeGreaterThan(5);
      expect(g.bass_pattern.zh.length).toBeGreaterThan(5);

      // Production tips at least 3
      expect(g.production_tips.en.length).toBeGreaterThanOrEqual(3);
      expect(g.production_tips.zh.length).toBeGreaterThanOrEqual(3);

      // Drum pattern features
      expect(g.drum_pattern.kick.en).toBeTruthy();
      expect(g.drum_pattern.snare_clap.en).toBeTruthy();
      expect(g.drum_pattern.hihats.en).toBeTruthy();
      expect(g.drum_pattern.percussion.en).toBeTruthy();
      expect(g.drum_pattern.swing.en).toBeTruthy();
      expect(g.drum_pattern.tempo).toBeTruthy();
    }
  });

  it('every genre must have an 8-track sequencer pattern', () => {
    const trackIds = ['kick', 'snare', 'hihat', 'percussion', 'bass', 'chords', 'lead', 'fx'];
    for (const g of ALL_GENRES) {
      const pattern = g.sequencer_pattern;
      expect(pattern.bpm).toBeGreaterThan(40);
      expect(pattern.tracks.length).toBe(8);

      const actualTrackIds = pattern.tracks.map(t => t.track_id);
      expect(actualTrackIds).toEqual(trackIds);

      for (const t of pattern.tracks) {
        expect(t.steps.length).toBe(16);
      }
    }
  });

  it('relations graph must only refer to valid genre IDs', () => {
    expect(GENRE_RELATIONS.length).toBeGreaterThan(50);
    for (const rel of GENRE_RELATIONS) {
      expect(GENRES_MAP[rel.source], `Relation source ${rel.source} exists`).toBeDefined();
      expect(GENRES_MAP[rel.target], `Relation target ${rel.target} exists`).toBeDefined();
      expect(['origin_from', 'influenced_by', 'derived_to', 'fusion_with', 'regional_variant']).toContain(rel.type);
    }
  });

  it('vertical timeline stories must be valid and link to valid genres', () => {
    expect(TIMELINE_STORIES.length).toBeGreaterThanOrEqual(10);
    for (const story of TIMELINE_STORIES) {
      expect(story.decade).toBeGreaterThanOrEqual(1900);
      expect(story.title.en).toBeTruthy();
      expect(story.title.zh).toBeTruthy();
      expect(story.description.en).toBeTruthy();
      expect(story.description.zh).toBeTruthy();
      expect(story.genre_ids.length).toBeGreaterThan(0);
      for (const gid of story.genre_ids) {
        expect(GENRES_MAP[gid], `Story genre ${gid} exists in map`).toBeDefined();
      }
    }
  });

  it('every genre must have valid and differentiated radar metrics', () => {
    const radarKeys = ['groove', 'brightness', 'harmonicComplexity', 'rhythmDensity', 'bassEnergy', 'melodicFocus'] as const;
    const profileSet = new Set<string>();

    for (const g of ALL_GENRES) {
      expect(g.radar_metrics, `Genre ${g.id} has radar_metrics`).toBeDefined();
      for (const k of radarKeys) {
        const val = g.radar_metrics[k];
        expect(val).toBeGreaterThanOrEqual(1);
        expect(val).toBeLessThanOrEqual(10);
      }
      profileSet.add(JSON.stringify(g.radar_metrics));
    }

    // Must have diverse profiles (not single dummy placeholder)
    expect(profileSet.size).toBeGreaterThan(100);
  });
});
