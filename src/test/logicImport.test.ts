/**
 * Reading a Logic Pro project — what is **proven**, and what is only "what the specification says".
 *
 * There is no Mac and no Logic on this machine, so there is no ground truth: nothing here has been opened in Logic
 * and compared against the bytes. What this file proves is that the reader agrees with the **format** — the record
 * framing, the note encoding, the tempo slots, the meter header, and which alternative is active — because the
 * fixtures are written byte by byte from that format rather than borrowed from anybody's project. A green run here
 * means "this parses what the specification says", never "the import is correct", and the claims below are written
 * so that the difference is visible rather than glossed over.
 *
 * The companion file `logicFixtures.test.ts` runs the same reader against **real community `.logicx` projects**,
 * which are not committed (they are a textbook's companion assets with no stated licence) and which skip loudly when
 * they are not on the machine.
 */
import { describe, expect, it } from "vitest";
import { activeVariant, fromLogicProject, fromLogicProjectBase64, LOGIC_TICKS_PER_QUARTER, scanPluginNames } from "../data/logicToArrangement";
import {
  buildBinaryPlist,
  buildLogicProjectData,
  buildMetaDataPlist,
  invalidUtf8RegionName,
} from "./fixtures/logic_project.mjs";

/** Two regions, pitched apart, with positions and pitches a person can check by eye. */
function twoRegionProject(overrides: { bpm?: number } = {}) {
  return buildLogicProjectData({
    bpm: overrides.bpm ?? 120,
    timeSignature: { numerator: 4, denominator: 4 },
    regions: [
      {
        name: "Piano",
        notes: [
          { startTicks: 0, pitch: 60, velocity: 100, lengthTicks: 480 },
          { startTicks: 480, pitch: 62, velocity: 80, lengthTicks: 240 },
          { startTicks: 960, pitch: 64, velocity: 120, lengthTicks: 960 },
        ],
      },
      {
        name: "Bass",
        notes: [{ startTicks: 0, pitch: 36, velocity: 110, lengthTicks: 960 }],
      },
    ],
  });
}

describe("Logic import · the music the project holds", () => {
  it("reads one part per MIDI region, with the notes the bytes were written with", () => {
    /**
     * The criterion in one assertion: **the notes that come out are the notes that went in**. Three notes in one
     * region and one in another, with the start, the pitch, the velocity and the length each checked separately, so a
     * reader that got the positions right and the velocities wrong cannot pass by luck.
     */
    const imported = fromLogicProject({ projectData: twoRegionProject(), metaData: buildMetaDataPlist({}) });
    expect(imported.parts.map((part) => part.name)).toEqual(["Piano", "Bass"]);
    expect(imported.parts[0]!.notes).toEqual([
      { startBeats: 0, lengthBeats: 0.5, pitch: 60, velocity: 100 },
      { startBeats: 0.5, lengthBeats: 0.25, pitch: 62, velocity: 80 },
      { startBeats: 1, lengthBeats: 1, pitch: 64, velocity: 120 },
    ]);
    expect(imported.parts[1]!.notes).toEqual([{ startBeats: 0, lengthBeats: 1, pitch: 36, velocity: 110 }]);
  });

  it("turns ticks into beats at Logic's own resolution, so the tempo is what changes the wall clock", () => {
    // A quarter note is 960 ticks and one beat, whatever the tempo. The constant is asserted rather than the number
    // 960 being written here a second time, because a reader that used 480 would be inaudible in every other test.
    const imported = fromLogicProject({ projectData: twoRegionProject(), metaData: buildMetaDataPlist({}) });
    const last = imported.parts[0]!.notes[2]!;
    expect(last.startBeats * LOGIC_TICKS_PER_QUARTER).toBe(960);
    expect(last.lengthBeats * LOGIC_TICKS_PER_QUARTER).toBe(960);
  });

  it("says nothing survived rather than nothing at all, when a region holds no notes", () => {
    const project = buildLogicProjectData({
      bpm: 100,
      timeSignature: { numerator: 4, denominator: 4 },
      regions: [{ name: "Empty", notes: [] }, { name: "Real", notes: [{ startTicks: 0, pitch: 60 }] }],
    });
    const imported = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({}) });
    expect(imported.parts.map((part) => part.name)).toEqual(["Real"]);
    expect(imported.problems.join("\n")).toContain("1 MIDI region(s) hold no notes");
  });

  it("reports a name it cannot decode instead of inventing one", () => {
    const project = buildLogicProjectData({
      bpm: 100,
      timeSignature: { numerator: 4, denominator: 4 },
      regions: [{ nameBytes: invalidUtf8RegionName(), notes: [{ startTicks: 0, pitch: 60 }] }],
    });
    const imported = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({}) });
    expect(imported.parts[0]!.name).toBe("Region 1");
    expect(imported.problems.join("\n")).toContain("not valid UTF-8");
  });
});

describe("Logic import · tempo and meter", () => {
  it("reads the tempo from the slot the specification names when a tempo map exists", () => {
    /**
     * `gnoS+0x3a6` is authoritative once a tempo map exists, and `gnoS+0x92` can hold a playhead-dependent value.
     * This fixture writes **different** values into the three slots — 120, then 121, then 122 — so a reader that
     * reads the first slot, or the last of the three, can only be right by accident.
     */
    const project = buildLogicProjectData({ regions: [] });
    // Write the three slots by hand: this is the one fixture whose whole point is that they disagree.
    const overridden = buildLogicProjectData({ bpm: 122, regions: [] });
    const withDisagreement = new Uint8Array(overridden);
    const songAt = findSongPayload(withDisagreement);
    writeU32(withDisagreement, songAt + 0x3a6, 1220000);
    writeU32(withDisagreement, songAt + 0x92, 1200000);
    writeU32(withDisagreement, songAt + 0xea, 1210000);
    expect(project.length).toBeGreaterThan(0);
    const imported = fromLogicProject({ projectData: withDisagreement, metaData: buildMetaDataPlist({}) });
    expect(imported.tempoBpm).toBe(122);
  });

  it("reads the meter from the signature sequence's own header", () => {
    const project = buildLogicProjectData({ bpm: 100, timeSignature: { numerator: 7, denominator: 8 }, regions: [] });
    const imported = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({}) });
    expect(imported.timeSignature).toBe("7/8");
  });

  it("agrees with MetaData.plist when the two agree, and says which copy wins when they do not", () => {
    /**
     * The two files are compared rather than one being trusted: `MetaData.plist` is mostly display caches and
     * `ProjectData` is authoritative, so a disagreement is a sentence a caller must be able to read. The agreeing
     * case is what makes the disagreeing case mean something.
     */
    const project = buildLogicProjectData({ bpm: 140, timeSignature: { numerator: 3, denominator: 4 }, regions: [] });
    const agreeing = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({ bpm: 140, numerator: 3, denominator: 4 }) });
    expect(agreeing.tempoBpm).toBe(140);
    expect(agreeing.timeSignature).toBe("3/4");
    expect(agreeing.problems.join("\n")).not.toContain("MetaData.plist");

    const disagreeing = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({ bpm: 90, numerator: 4, denominator: 4 }) });
    expect(disagreeing.tempoBpm).toBe(140);
    expect(disagreeing.timeSignature).toBe("3/4");
    expect(disagreeing.problems.join("\n")).toContain("MetaData.plist says 90 BPM and ProjectData says 140 BPM");
    expect(disagreeing.problems.join("\n")).toContain("ProjectData is the authoritative copy");
  });
});

describe("Logic import · what this model cannot hold, named", () => {
  it("reports audio regions as the audio tracks they are", () => {
    /**
     * ⭐ **The criterion that must be able to go red.** `TrackKindV2` is `drumkit | instrument | sampler | fx |
     * folder`: there is no audio kind, so an audio track has nowhere to land. The failure mode this forbids is the
     * quiet one — an import that returns MIDI parts and says nothing about the audio beside them, which reads as "the
     * whole project came over". The problem names the count and the reason.
     */
    const project = buildLogicProjectData({
      bpm: 100,
      timeSignature: { numerator: 4, denominator: 4 },
      regions: [
        { name: "Keys", notes: [{ startTicks: 0, pitch: 60 }] },
        { name: "Vocal", notes: [], audioName: "vocal.aif" },
      ],
    });
    const imported = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({}) });
    const audio = imported.problems.find((problem) => problem.includes("audio region reference"));
    expect(audio, imported.problems.join(" | ")).toBeDefined();
    expect(audio).toContain("2 audio region reference(s) were not imported");
    expect(audio).toContain("no audio track kind");
  });

  it("reports automation lanes as something this model cannot hold", () => {
    const project = buildLogicProjectData({
      bpm: 100,
      timeSignature: { numerator: 4, denominator: 4 },
      regions: [{ name: "Keys", notes: [{ startTicks: 0, pitch: 60 }], automation: true }],
    });
    const imported = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({}) });
    expect(imported.problems.join("\n")).toContain("automation (volume/pan envelopes, 1 record(s))");
  });

  it("reports a Drummer track as converted but missing its origin", () => {
    /**
     * Drummer carries MIDI, so it converts — and the semantic that it was **generated by a model** is exactly what
     * does not convert. Saying only "converted" would claim more than the import delivers.
     */
    const project = buildLogicProjectData({
      bpm: 100,
      timeSignature: { numerator: 4, denominator: 4 },
      regions: [{ name: "Drummer", notes: [{ startTicks: 0, pitch: 36, lengthTicks: 240 }] }],
    });
    const imported = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({}) });
    expect(imported.parts.map((part) => part.name)).toEqual(["Drummer"]);
    const drummer = imported.problems.find((problem) => problem.includes("Drummer/Session Player"));
    expect(drummer).toBeDefined();
    expect(drummer).toContain("Logic generated this");
  });

  it("names the plugins it saw, as a list to act on rather than as tracks", () => {
    // The plugin chain has no counterpart, so the useful thing to hand back is *which* ones, by name.
    const bytes = new Uint8Array(64);
    bytes.set([...Buffer.from("....AUPitch....ES2....AUChannelEQ....", "latin1")]);
    expect(scanPluginNames(bytes)).toEqual(["AUChannelEQ", "AUPitch", "ES2"]);
  });

  it("says when the tempo was never stated instead of defaulting to a number the file did not write", () => {
    const project = buildLogicProjectData({ timeSignature: { numerator: 4, denominator: 4 }, regions: [] });
    const imported = fromLogicProject({ projectData: project, metaData: buildMetaDataPlist({}) });
    expect(imported.tempoBpm).toBeUndefined();
    expect(imported.problems.join("\n")).toContain("states no tempo");
  });
});

describe("Logic import · the alternative is read, never assumed", () => {
  it("reads ActiveVariant out of ProjectInformation.plist", () => {
    /**
     * ⭐ **The criterion that must be able to go red.** A project may hold several alternatives and `004` is as
     * ordinary as `000`; a reader that opens `Alternatives/000/` because it is the first name it saw imports a
     * different arrangement than the project is on. This is the file that says which, and hardcoding `"000"` here
     * fails this assertion.
     */
    expect(activeVariant(buildBinaryPlist({ ActiveVariant: "004" }))).toBe("004");
    expect(activeVariant(Buffer.from('<?xml version="1.0"?><plist version="1.0"><dict><key>ActiveVariant</key><string>017</string></dict></plist>'))).toBe("017");
  });

  it("does not treat a VariantNames table as the answer", () => {
    // The real 10.0-era projects carry exactly this: a table of variant names and no active one. Answering its only
    // key would be `"000"` wearing a different name, which is the assumption this criterion exists to forbid.
    expect(activeVariant(buildBinaryPlist({ VariantNames: "0" }))).toBeUndefined();
  });

  it("answers undefined rather than 000 when the plist names nothing", () => {
    // The distinction matters: `undefined` lets the caller decide, `"000"` is a decision the file did not make.
    expect(activeVariant(buildMetaDataPlist({ bpm: 120 }))).toBeUndefined();
    expect(activeVariant(buildBinaryPlist({ HasProjectFolder: "false" }))).toBeUndefined();
  });
});

describe("Logic import · the entry points", () => {
  it("takes base64, because MCP arguments are JSON and JSON has no bytes", () => {
    const project = twoRegionProject();
    const meta = buildMetaDataPlist({ bpm: 120, numerator: 4, denominator: 4 });
    const imported = fromLogicProjectBase64({
      projectDataBase64: Buffer.from(project).toString("base64"),
      metaDataBase64: Buffer.from(meta).toString("base64"),
    });
    expect(imported.parts.map((part) => part.name)).toEqual(["Piano", "Bass"]);
    expect(imported.tempoBpm).toBe(120);
    expect(imported.timeSignature).toBe("4/4");
  });

  it("refuses bytes that are not a ProjectData rather than reading noise", () => {
    const imported = fromLogicProject({ projectData: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), metaData: buildMetaDataPlist({}) });
    expect(imported.parts).toEqual([]);
    expect(imported.problems.join("\n")).toContain("does not begin with the Logic root frame magic");
  });

  it("refuses empty base64 with a sentence rather than an exception from Buffer", () => {
    expect(() => fromLogicProjectBase64({ projectDataBase64: "", metaDataBase64: "AA==" })).toThrow(/projectDataBase64/);
  });
});

/** Where the `gnoS` payload starts, found the way the reader finds it: the first record's tag. */
function findSongPayload(bytes: Uint8Array): number {
  const tag = String.fromCharCode(bytes[0x18]!, bytes[0x19]!, bytes[0x1a]!, bytes[0x1b]!);
  expect(tag).toBe("gnoS");
  return 0x18;
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
}
