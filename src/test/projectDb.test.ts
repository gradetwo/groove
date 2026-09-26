import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  saveProject,
  getProject,
  getAllProjects,
  deleteProject,
  duplicateProject,
  renameProject,
  toggleProjectFavorite,
  updateProjectTags,
  getProjectCount,
  createBlankProject,
  exportProjectPackage,
  exportProjectToGrooveFile,
  validateGroovePackage,
  importGrooveFile,
  migrateLegacyLocalStorage,
  getActiveProjectId,
  setActiveProjectId,
  LEGACY_STORAGE_KEY,
  LEGACY_MIGRATED_FLAG,
} from "../features/sequencer/projectDb";
import { GENRES_MAP } from "../data/genres";
import { APP_VERSION } from "../version";
import { GrooveProject } from "../types/project";

describe("IndexedDB Multi-Project Hub Engine (P7-02)", () => {
  const sampleGenre = Object.values(GENRES_MAP)[0];

  beforeEach(() => {
    localStorage.clear();
  });

  it("creates a blank project with full schema and snapshot summary", () => {
    const proj = createBlankProject(sampleGenre, "My First Beat");
    expect(proj.id).toMatch(/^proj_/);
    expect(proj.name).toBe("My First Beat");
    expect(proj.genreId).toBe(sampleGenre.id);
    expect(proj.patterns.A).toBeDefined();
    expect(proj.patterns.B).toBeDefined();
    expect(proj.snapshotSummary).toBeDefined();
    expect(proj.snapshotSummary?.trackCount).toBeGreaterThan(0);
    expect(proj.isFavorite).toBe(false);
  });

  it("saves and retrieves a project from IndexedDB", async () => {
    const proj = createBlankProject(sampleGenre, "Acid Dream 303");
    const saved = await saveProject(proj);
    expect(saved.id).toBe(proj.id);

    const fetched = await getProject(proj.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("Acid Dream 303");
    expect(fetched?.bpm).toBe(proj.bpm);
    expect(fetched?.patterns.A.tracks.length).toBe(proj.patterns.A.tracks.length);
  });

  it("lists all projects sorted by updatedAt descending by default", async () => {
    const proj1 = await saveProject(createBlankProject(sampleGenre, "Alpha"));
    // Small delay to ensure distinct timestamps
    await new Promise((r) => setTimeout(r, 10));
    const proj2 = await saveProject(createBlankProject(sampleGenre, "Beta"));

    const all = await getAllProjects();
    expect(all.length).toBeGreaterThanOrEqual(2);
    // Beta was saved later, should be first
    const idxBeta = all.findIndex((p) => p.id === proj2.id);
    const idxAlpha = all.findIndex((p) => p.id === proj1.id);
    expect(idxBeta).toBeLessThan(idxAlpha);
  });

  it("supports sorting by name and bpm", async () => {
    const projA = createBlankProject(sampleGenre, "Zebra Beat");
    projA.bpm = 140;
    await saveProject(projA);

    const projB = createBlankProject(sampleGenre, "Apple Beat");
    projB.bpm = 90;
    await saveProject(projB);

    const sortedByName = await getAllProjects("name", "asc");
    const appleIdx = sortedByName.findIndex((p) => p.name === "Apple Beat");
    const zebraIdx = sortedByName.findIndex((p) => p.name === "Zebra Beat");
    expect(appleIdx).toBeLessThan(zebraIdx);

    const sortedByBpm = await getAllProjects("bpm", "asc");
    const lowBpmIdx = sortedByBpm.findIndex((p) => p.bpm === 90);
    const highBpmIdx = sortedByBpm.findIndex((p) => p.bpm === 140);
    expect(lowBpmIdx).toBeLessThan(highBpmIdx);
  });

  it("updates, renames, and toggles favorite status", async () => {
    const proj = await saveProject(createBlankProject(sampleGenre, "Original Name"));
    expect(proj.isFavorite).toBe(false);

    // Toggle favorite
    const fav = await toggleProjectFavorite(proj.id);
    expect(fav.isFavorite).toBe(true);

    const fetchedFav = await getProject(proj.id);
    expect(fetchedFav?.isFavorite).toBe(true);

    // Rename
    const renamed = await renameProject(proj.id, "Renamed Master");
    expect(renamed.name).toBe("Renamed Master");

    const fetchedRenamed = await getProject(proj.id);
    expect(fetchedRenamed?.name).toBe("Renamed Master");

    // Update tags
    const tagged = await updateProjectTags(proj.id, ["Synthwave", "Live"]);
    expect(tagged.tags).toEqual(["Synthwave", "Live"]);
  });

  it("duplicates an existing project with independent ID and deep cloned patterns", async () => {
    const original = await saveProject(createBlankProject(sampleGenre, "Master Loop"));
    const copy = await duplicateProject(original.id, "Master Loop (Remix)");

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe("Master Loop (Remix)");
    expect(copy.patterns.A).toEqual(original.patterns.A);

    // Mutating copy does not affect original
    const initialVal = original.patterns.A.tracks[0].steps[0];
    copy.patterns.A.tracks[0].steps[0] = initialVal === 1 ? 0 : 1;
    await saveProject(copy);

    const freshOriginal = await getProject(original.id);
    expect(freshOriginal?.patterns.A.tracks[0].steps[0]).toBe(initialVal);
    expect(copy.patterns.A.tracks[0].steps[0]).not.toBe(initialVal);
  });

  it("deletes a project and clears active project ID if matched", async () => {
    const proj = await saveProject(createBlankProject(sampleGenre, "To Delete"));
    setActiveProjectId(proj.id);
    expect(getActiveProjectId()).toBe(proj.id);

    await deleteProject(proj.id);
    const found = await getProject(proj.id);
    expect(found).toBeNull();
    expect(getActiveProjectId()).toBeNull();
  });

  it("exports and validates .groove package schema", () => {
    const proj = createBlankProject(sampleGenre, "Export Test");
    const pkg = exportProjectPackage(proj);

    expect(pkg.format).toBe("groove-project");
    expect(pkg.version).toBe(1);
    expect(pkg.exportedAt).toBeGreaterThan(0);
    expect(pkg.project.id).toBe(proj.id);

    const validated = validateGroovePackage(pkg);
    expect(validated.format).toBe("groove-project");

    expect(() => validateGroovePackage(null)).toThrow();
    expect(() => validateGroovePackage({ format: "invalid" })).toThrow();
  });

  it("carries a section's B5 overrides through a .groove package, JSON and all", () => {
    /**
     * The third persistence surface B1 lists. `exportProjectPackage` spreads the whole project and
     * `validateGroovePackage` is a structural check rather than a field whitelist, so the overrides survive — and
     * this is the test that notices the day either of those stops being true, because the whole round trip goes
     * through `JSON.parse(JSON.stringify(...))` exactly like a downloaded and re-imported file does.
     */
    const proj = createBlankProject(sampleGenre, "Overrides Test");
    const sections = [
      { id: "p1", slot: "A" as const, bars: 8, label: "build", overrides: { velocityRamp: [0.6, 1] as [number, number] } },
      {
        id: "p2",
        slot: "B" as const,
        bars: 4,
        overrides: { fill: { tracks: ["snare"], steps: [12, 13, 14, 15], velocity: 118 }, transpose: -2 },
      },
    ];
    const pkg = exportProjectPackage({ ...proj, sections, songChain: ["A", "B"] });
    const roundTripped = validateGroovePackage(JSON.parse(JSON.stringify(pkg)));
    expect(roundTripped.project.sections).toEqual(sections);
  });

  /**
   * Regression (E-05 follow-up): `exportProjectToGrooveFile` used to default its
   * `appVersion` parameter to a hardcoded "1.15.2", so every .groove file written
   * from Project Hub / Export carried a stale version stamp. The version must
   * come from the single source (`src/version.ts`) only.
   */
  it("stamps the current APP_VERSION into exported .groove packages", () => {
    const proj = createBlankProject(sampleGenre, "Version Stamp");
    expect(exportProjectPackage(proj).appVersion).toBe(APP_VERSION);

    // The download helper must not fall back to a stale literal either.
    const src = exportProjectToGrooveFile.toString();
    expect(src).toContain("APP_VERSION");
    expect(src).not.toMatch(/appVersion\s*=\s*"\d+\.\d+\.\d+"/);
  });

  it("imports a valid .groove file into the database", async () => {
    const original = createBlankProject(sampleGenre, "Import Source");
    const pkg = exportProjectPackage(original);
    const jsonStr = JSON.stringify(pkg);

    // Mock File object
    const file = new File([jsonStr], "imported_test.groove", { type: "application/json" });

    const imported = await importGrooveFile(file);
    expect(imported.id).not.toBe(original.id);
    expect(imported.name).toContain("Import Source");

    const inDb = await getProject(imported.id);
    expect(inDb).not.toBeNull();
    expect(inDb?.genreId).toBe(sampleGenre.id);
  });

  it("migrates legacy localStorage project into IndexedDB automatically", async () => {
    const legacyData = {
      version: 1,
      genreId: "chicago-house",
      bpm: 124,
      swing: 15,
      timeSignature: "4/4",
      resolution: "1/16",
      stepCount: 16,
      patterns: {
        A: sampleGenre.sequencer_pattern,
        B: sampleGenre.sequencer_pattern,
      },
      activeSlot: "A",
      updatedAt: 1700000000000,
    };

    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyData));
    expect(localStorage.getItem(LEGACY_MIGRATED_FLAG)).toBeNull();

    const migrated = await migrateLegacyLocalStorage();
    expect(migrated).not.toBeNull();
    expect(migrated?.bpm).toBe(124);
    expect(migrated?.swing).toBe(15);
    expect(localStorage.getItem(LEGACY_MIGRATED_FLAG)).toBe("true");

    // Second run should be no-op
    const secondRun = await migrateLegacyLocalStorage();
    expect(secondRun).toBeNull();
  });
});

describe("the .groove package carries an arrangement (C1)", () => {
  /**
   * The composer's round trip, at the format level: compose a song, export it, read it back, and find the arrangement intact.
   *
   * Before this field the export was lossy — `GrooveProject` is `patterns: { A, B }` and has nowhere to put a clip slot or a
   * section (`src/types/project.ts:12-27`) — so an agent that composed a song through MCP could not round-trip it. This is the
   * test that should have been red yesterday and is green now.
   */
  const project = {
    id: "p1",
    name: "a song",
    genreId: "chicago-house",
    genreName: "Chicago House",
    bpm: 124,
    swing: 0,
    timeSignature: "4/4",
    resolution: "1/16",
    stepCount: 16,
    patterns: { A: { bpm: 124, tracks: [] }, B: { bpm: 124, tracks: [] } },
    activeSlot: "A",
    songMode: true,
  } as unknown as Parameters<typeof exportProjectPackage>[0];

  it("writes version 2 with the arrangement and validates", () => {
    const arrangement = {
      clips: { A: { bpm: 124, tracks: [] }, B: { bpm: 124, tracks: [] } },
      sections: [{ slot: "A", bars: 8, label: "verse" }],
      activeSlot: "B",
    } as unknown as Parameters<typeof exportProjectPackage>[2];
    const pkg = exportProjectPackage(project, "2.34.0", arrangement);
    expect(pkg.version).toBe(2);
    const read = validateGroovePackage(JSON.parse(JSON.stringify(pkg)));
    expect(Object.keys(read.arrangement!.clips).sort()).toEqual(["A", "B"]);
    expect(read.arrangement!.sections).toHaveLength(1);
    expect(read.arrangement!.activeSlot).toBe("B");
  });

  it("still writes a v1 package for a plain two-pattern project", () => {
    const pkg = exportProjectPackage(project, "2.34.0");
    expect(pkg.version).toBe(1);
    expect(pkg.arrangement).toBeUndefined();
    // …and a v1 package is valid as it stands: no arrangement means "one clip, no sections", not "broken".
    expect(() => validateGroovePackage(JSON.parse(JSON.stringify(pkg)))).not.toThrow();
  });

  it("rejects a v2 arrangement that promises clips and has none", () => {
    const pkg = exportProjectPackage(project, "2.34.0", { clips: {}, sections: [] } as never);
    expect(() => validateGroovePackage(pkg)).toThrow(/carries no clips/);
  });
});
