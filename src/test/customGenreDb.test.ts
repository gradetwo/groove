import { describe, it, expect, beforeEach } from "vitest";
import { 
  createBlankCustomGenre, 
  forkGenre, 
  saveCustomGenre, 
  getCustomGenre, 
  getAllCustomGenres, 
  deleteCustomGenre, 
  duplicateCustomGenre 
} from "../features/customGenre/customGenreDb";
import { 
  encodeGenreToSharePayload, 
  decodeSharePayloadToGenre 
} from "../features/customGenre/customGenreCodec";
import { ALL_GENRES } from "../data/genres";

describe("Custom Genre Database & Codec (P7-03)", () => {
  const sampleBase = ALL_GENRES[0]; // Chicago House

  it("creates a blank custom genre with valid 8-track structure", () => {
    const blank = createBlankCustomGenre("Test Cyber Acid", "Electronic");
    expect(blank.isCustom).toBe(true);
    expect(blank.name).toBe("Test Cyber Acid");
    expect(blank.category).toBe("Electronic");
    expect(blank.default_bpm).toBe(124);
    expect(blank.radar_metrics.groove).toBe(8);
    expect(blank.sequencer_pattern.tracks.length).toBe(8);
    expect(blank.sequencer_pattern.tracks[0].steps.length).toBe(16);
  });

  it("forks a built-in genre into a variation maintaining pattern and lineage", () => {
    const forked = forkGenre(sampleBase, "Chicago House 2026 Remix");
    expect(forked.isCustom).toBe(true);
    expect(forked.forkedFromId).toBe(sampleBase.id);
    expect(forked.forkedFromName).toBe(sampleBase.name);
    expect(forked.name).toBe("Chicago House 2026 Remix");
    expect(forked.parent_genres).toContain(sampleBase.id);
    expect(forked.sequencer_pattern.tracks.length).toBe(8);
    expect(forked.default_bpm).toBe(sampleBase.default_bpm);
  });

  it("saves, retrieves, and updates custom genres in DB", async () => {
    const custom = createBlankCustomGenre("Future Dub 3000", "Electronic");
    await saveCustomGenre(custom);

    const retrieved = await getCustomGenre(custom.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe("Future Dub 3000");

    // Update field
    custom.default_bpm = 140;
    custom.radar_metrics.bassEnergy = 10;
    await saveCustomGenre(custom);

    const updated = await getCustomGenre(custom.id);
    expect(updated?.default_bpm).toBe(140);
    expect(updated?.radar_metrics.bassEnergy).toBe(10);
  });

  it("lists all custom genres sorted by updatedAt", async () => {
    const g1 = createBlankCustomGenre("Genre One", "Rock/Metal");
    const g2 = createBlankCustomGenre("Genre Two", "Hip Hop");
    await saveCustomGenre(g1);
    await new Promise((r) => setTimeout(r, 10));
    await saveCustomGenre(g2);

    const all = await getAllCustomGenres();
    expect(all.length).toBeGreaterThanOrEqual(2);
    // g2 was saved later, so should be before g1
    const idx2 = all.findIndex((g) => g.id === g2.id);
    const idx1 = all.findIndex((g) => g.id === g1.id);
    expect(idx2).toBeLessThan(idx1);
  });

  it("duplicates a custom genre with isolated ID and state", async () => {
    const original = createBlankCustomGenre("Origin Tech", "Electronic");
    await saveCustomGenre(original);

    const copy = await duplicateCustomGenre(original.id);
    expect(copy).not.toBeNull();
    expect(copy?.id).not.toBe(original.id);
    expect(copy?.name).toContain("(Copy)");
    expect(copy?.sequencer_pattern.tracks.length).toBe(8);
  });

  it("deletes a custom genre cleanly", async () => {
    const doomed = createBlankCustomGenre("To Be Deleted", "Latin/World");
    await saveCustomGenre(doomed);

    let check = await getCustomGenre(doomed.id);
    expect(check).not.toBeNull();

    await deleteCustomGenre(doomed.id);
    check = await getCustomGenre(doomed.id);
    expect(check).toBeNull();
  });

  it("encodes and decodes a custom genre over URL payload preserving fidelity", async () => {
    const genre = forkGenre(sampleBase, "Deep Ambient House");
    genre.radar_metrics = {
      groove: 9,
      brightness: 7,
      harmonicComplexity: 6,
      rhythmDensity: 8,
      bassEnergy: 10,
      melodicFocus: 5,
    };
    genre.authorName = "DJ Antigravity";
    genre.sequencer_pattern.scale = "D Dorian";
    genre.sequencer_pattern.tracks[0].steps = [1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0];

    const sharePayload = await encodeGenreToSharePayload(genre);
    expect(sharePayload.length).toBeGreaterThan(20);

    const decoded = await decodeSharePayloadToGenre(sharePayload);
    expect(decoded).not.toBeNull();
    expect(decoded?.name).toBe("Deep Ambient House");
    expect(decoded?.authorName).toBe("DJ Antigravity");
    expect(decoded?.default_bpm).toBe(genre.default_bpm);
    expect(decoded?.radar_metrics.bassEnergy).toBe(10);
    expect(decoded?.radar_metrics.groove).toBe(9);
    expect(decoded?.sequencer_pattern.scale).toBe("D Dorian");
    expect(decoded?.sequencer_pattern.tracks[0].steps).toEqual(genre.sequencer_pattern.tracks[0].steps);
  });

  it("handles malformed or invalid share payloads gracefully", async () => {
    const invalid1 = await decodeSharePayloadToGenre("invalid_garbage_payload");
    expect(invalid1).toBeNull();

    const invalid2 = await decodeSharePayloadToGenre("");
    expect(invalid2).toBeNull();
  });
});
