import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory as FakeIDBFactory } from "fake-indexeddb";
import {
  createBlankProject,
  getAllProjects,
  getArrangementProject,
  getArrangementProjectCount,
  getLastArrangementProject,
  getProject,
  isArrangementProjectId,
  openProjectsDb,
  saveArrangementProject,
  saveProject,
  validateArrangementV2,
  clearSavedArrangementProject,
  getSavedArrangementProject,
  GROOVE_ARRANGEMENT_STORE_NAME,
  GROOVE_STORE_NAME,
} from "../features/sequencer/projectDb";
import { createArrangementFromTemplate } from "../data/arrangementEdits";
import { GENRES_MAP } from "../data/genres";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * ⭐ **The v2 arrangement is written where the brief said to write it — the existing IndexedDB channel — and it is
 * written as something the project store cannot mistake for a project.**
 *
 * Two claims are being judged here, and they are separate:
 *
 * 1. **the round trip**: what is stored is what comes back, including the fields that decide how a track *sounds*
 *    (`instrument`, `sample`) — the failure this whole model documents is a track that comes back as the role's default
 *    synthesiser;
 * 2. **the separation**: the studio's project store still holds exactly its own records, so nothing that already works
 *    can be reached by this change.
 */
const sampleGenre = Object.values(GENRES_MAP)[0]!;

/** A v2 arrangement with two tracks, an instrument, a sample and notes on both — small, and wide enough to catch a dropped field. */
function sampleArrangement(): ArrangementV2 {
  const created = createArrangementFromTemplate("new", "drums-bass");
  const [drums, bass] = created.tracks;
  return {
    ...created,
    bpm: 132,
    bars: 16,
    timeSignature: "4/4",
    tracks: [
      { ...drums!, muted: true, gainDb: -3.5, pan: 0.25 },
      { ...bass!, instrument: "walking_upright", sample: { assetId: "meatbass:pizz-basic" } },
    ],
    notesByTrack: {
      [drums!.id]: [
        { pitch: 36, startBeats: 0, lengthBeats: 0.5, velocity: 110 },
        { pitch: 38, startBeats: 1, lengthBeats: 0.5, velocity: 96 },
      ],
      [bass!.id]: [{ pitch: 43, startBeats: 0.5, lengthBeats: 1.5, velocity: 88, syllable: "la" }],
    },
  };
}

describe("the v2 arrangement's own store", () => {
  beforeEach(() => {
    localStorage.clear();
    /**
     * ⭐ Per-test isolation, by the convention `ProjectHubModal.test.tsx` records: `projectDb` opens a connection on
     * every call and never closes it, so `deleteDatabase` would block for ever on those leaked connections. A fresh
     * fake backend discards both the rows and the connections.
     */
    globalThis.indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  });

  it("⭐ round-trips tracks, notes and the fields that decide how a track sounds", async () => {
    const saved = await saveArrangementProject({ name: "My Song", arrangement: sampleArrangement() });
    expect(saved.editor).toBe("arrangement-v2");

    const read = await getArrangementProject(saved.id);
    expect(read).not.toBeNull();
    expect(read?.name).toBe("My Song");
    expect(read?.arrangement.tracks).toHaveLength(2);
    // ⭐ The field a projection exists to preserve: lose it and the upright bass becomes a synth.
    expect(read?.arrangement.tracks[1]?.instrument).toBe("walking_upright");
    expect(read?.arrangement.tracks[1]?.sample?.assetId).toBe("meatbass:pizz-basic");
    // The track flags and mixer values come back too — they are part of the arrangement, not of its drawing.
    expect(read?.arrangement.tracks[0]?.muted).toBe(true);
    expect(read?.arrangement.tracks[0]?.gainDb).toBe(-3.5);
    expect(read?.arrangement.tracks[0]?.pan).toBe(0.25);
    // Notes are counted **and compared**, so "two notes" cannot pass while the pitches moved.
    expect(read?.arrangement.notesByTrack?.[read.arrangement.tracks[0]!.id]).toEqual([
      { pitch: 36, startBeats: 0, lengthBeats: 0.5, velocity: 110 },
      { pitch: 38, startBeats: 1, lengthBeats: 0.5, velocity: 96 },
    ]);
    expect(read?.arrangement.notesByTrack?.[read.arrangement.tracks[1]!.id]?.[0]?.syllable).toBe("la");
    expect(read?.arrangement.bpm).toBe(132);
    expect(read?.arrangement.bars).toBe(16);
  });

  it("⭐ keeps the studio's project store to itself: the two never see each other's records", async () => {
    const baseline = await getArrangementProjectCount();
    const project = await saveProject(createBlankProject(sampleGenre, "A Studio Project"));
    const arrangement = await saveArrangementProject({ name: "An Arrangement", arrangement: sampleArrangement() });

    // The arrangement is not a project, so the hub's list — which the studio's whole hub UI is built on — is unchanged.
    const projects = await getAllProjects();
    expect(projects.map((entry) => entry.id)).toContain(project.id);
    expect(projects.map((entry) => entry.id)).not.toContain(arrangement.id);
    expect(await getProject(arrangement.id)).toBeNull();

    // And the arrangement store holds no projects: reading one by a studio id is "nothing there", not a mis-read record.
    expect(await getArrangementProject(project.id)).toBeNull();
    expect(await getArrangementProjectCount()).toBe(baseline + 1);
  });

  it("⭐ both stores live in the one database the app already opened, so nothing else has to find it", async () => {
    const db = await openProjectsDb();
    // ⭐ The project store is still there, which is what makes this an upgrade rather than a new database.
    expect(Array.from(db.objectStoreNames)).toContain(GROOVE_STORE_NAME);
    expect(Array.from(db.objectStoreNames)).toContain(GROOVE_ARRANGEMENT_STORE_NAME);
    // A v1 database is at version 1 and this one is above it, which is what ran `onupgradeneeded`.
    expect(db.version).toBeGreaterThanOrEqual(2);
    db.close();
  });

  it("⭐ names the project synchronously, so the top bar does not have to wait for a transaction", async () => {
    expect(getSavedArrangementProject()).toBeNull();
    const saved = await saveArrangementProject({ name: "Named At Once", arrangement: sampleArrangement() });
    // The pointer is written before the transaction resolves — it is what the top bar reads on the click itself.
    expect(getSavedArrangementProject()).toEqual({ id: saved.id, name: "Named At Once" });
    clearSavedArrangementProject();
    expect(getSavedArrangementProject()).toBeNull();
  });

  it("⭐ reopens the project the pointer names, and answers 'is this id an arrangement?' for the studio guard", async () => {
    const baseline = await getArrangementProjectCount();
    const first = await saveArrangementProject({ name: "First", arrangement: sampleArrangement() });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await saveArrangementProject({ id: first.id, name: "Renamed", arrangement: sampleArrangement() });

    // Saving with an id updates that project rather than starting a second one — the whole reason an id is carried.
    expect(second.id).toBe(first.id);
    // ⭐ One more than the baseline, not "one": the count is asserted as a **delta**, so the criterion does not depend
    // on which store the read happened to come from, and a second project would show up as two.
    expect(await getArrangementProjectCount()).toBe(baseline + 1);

    const reopened = await getLastArrangementProject();
    expect(reopened?.id).toBe(first.id);
    expect(reopened?.name).toBe("Renamed");
    expect(isArrangementProjectId(first.id)).toBe(true);
    expect(isArrangementProjectId("proj_never_seen")).toBe(false);
    expect(isArrangementProjectId(null)).toBe(false);
  });

  it("⭐ refuses to read an arrangement it cannot understand, and says which field", async () => {
    // The kind was renamed `instrument` → `synth` with no alias (§27), so a stored arrangement that still says the old
    // word must fail **naming it** rather than load as a track with no voice.
    const legacy = sampleArrangement() as unknown as { tracks: Array<Record<string, unknown>> };
    legacy.tracks[0]!.kind = "instrument";
    expect(() => validateArrangementV2(legacy)).toThrow(/instrument/);

    // And a known field of the wrong type is refused rather than coerced into silence.
    const broken = sampleArrangement() as unknown as Record<string, unknown>;
    broken.notesByTrack = { "synth-1": [{ pitch: 60, startBeats: "zero", lengthBeats: 1, velocity: 100 }] };
    expect(() => validateArrangementV2(broken)).toThrow(/start/);
  });

  it("reads a studio project id as 'not an arrangement', so the studio's boot restore is untouched by this", () => {
    // The guard is what the studio asks: for every project it has ever written, the answer must be "the studio's".
    expect(isArrangementProjectId(null)).toBe(false);
    expect(isArrangementProjectId(createBlankProject(sampleGenre, "Anything").id)).toBe(false);
  });

  /**
   * ⭐ **The last save is the one that is stored, even when two are in flight at once.**
   *
   * This is the criterion for a defect a real browser found: `saveArrangementProject` awaits opening the database
   * before it can write, and on a fresh profile that open *creates* the database, so two calls made milliseconds apart
   * can reach the store in the opposite order and the older arrangement lands last. The measurement was two added
   * tracks disappearing behind the one-track project that was created first. A promise chain fixes it, and this is the
   * invariant that chain exists for — asserted without awaiting the first call, which is the shape that raced.
   */
  it("⭐ keeps the last write when two saves are in flight together", async () => {
    const created = await saveArrangementProject({ fresh: true, name: "Racing", arrangement: sampleArrangement() });
    const older = saveArrangementProject({ id: created.id, name: "Racing", arrangement: { ...sampleArrangement(), bars: 1 } });
    const newer = saveArrangementProject({ id: created.id, name: "Racing", arrangement: { ...sampleArrangement(), bars: 99 } });
    await Promise.all([older, newer]);

    const read = await getArrangementProject(created.id);
    expect(read?.arrangement.bars).toBe(99);
  });

  it("gives a brand-new project its own id rather than taking over the pointer's", async () => {
    const first = await saveArrangementProject({ fresh: true, name: "One", arrangement: sampleArrangement() });
    const second = await saveArrangementProject({ fresh: true, name: "Two", arrangement: sampleArrangement() });
    // ⭐ "New" has to be new: reusing the pointer's id would make starting a second project silently overwrite the first.
    expect(second.id).not.toBe(first.id);
    expect(await getArrangementProject(first.id)).not.toBeNull();
    expect(getSavedArrangementProject()?.id).toBe(second.id);
  });
});
