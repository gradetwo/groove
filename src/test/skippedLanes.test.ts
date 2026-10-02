import { describe, expect, it } from "vitest";
import { audioLaneReplyFields } from "../../mcp/pattern";
import type { OfflineAudioLaneReport } from "../../src/audio/offlineAudioLanes";
import type { LegatoJoinReading } from "../../src/audio/legatoJoin";
import type { LegatoVoiceReading } from "../../src/audio/legatoVoices";

/**
 * **The reply's audio-lane rule**, which used to be the bug in prose.
 *
 * The old reply asked only "does this lane have `track_id: audio`?" and listed every such lane under `skippedLanes` with the reason "an audio lane has no
 * notes to schedule, so a MIDI render skips it". Once the offline renderer mixes those lanes, that claim is false in two ways at once: the lane *is* in the
 * render, and a lane that really was dropped is not distinguishable from one that played. These criteria pin the three states apart — rendered, skipped with a
 * reason, and no audio lane at all — because "the list got shorter" is not a test of either.
 */
const report = (overrides: Partial<OfflineAudioLaneReport> = {}): OfflineAudioLaneReport => ({
  lanes: [],
  events: 0,
  problems: [],
  ...overrides,
});

describe("the audio-lane fields of a render reply", () => {
  it("says nothing at all for a render with no audio lane, which is the additive promise", () => {
    expect(audioLaneReplyFields(report())).toEqual({});
    // And an older caller that has no report at all is not told a lane was skipped.
    expect(audioLaneReplyFields(undefined)).toEqual({});
  });

  it("does **not** claim a lane was skipped when its bytes reached the mix", () => {
    const fields = audioLaneReplyFields(report({ lanes: [{ trackIndex: 0, track_id: "audio", laneId: "riser", name: "Riser" }], events: 1 }));
    expect(fields.skippedLanes).toBeUndefined();
    expect(fields).toEqual({ renderedAudioLanes: [{ track_id: "audio", laneId: "riser", name: "Riser" }] });
  });

  it("names a lane that could not be mixed, with the reason and the asset it named", () => {
    const fields = audioLaneReplyFields(
      report({
        problems: [
          {
            trackIndex: 1,
            track_id: "audio",
            laneId: "vox",
            name: "Vox Chop",
            assetId: "not-in-the-catalogue",
            reason: 'no sample "not-in-the-catalogue" — the catalogue holds riser',
          },
        ],
      })
    );
    const skipped = fields.skippedLanes as Array<Record<string, unknown>>;
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ track_id: "audio", laneId: "vox", name: "Vox Chop", assetId: "not-in-the-catalogue" });
    // The reason is the point of the entry: without it a caller cannot tell an unresolvable id from a failed fetch.
    expect(String(skipped[0]!.reason)).toMatch(/not-in-the-catalogue/);
    expect(String(fields.skippedNote)).toMatch(/each entry names the lane and why/);
  });

  it("names the rendered lanes and the dropped ones from the same report, without conflating them", () => {
    const fields = audioLaneReplyFields(
      report({
        lanes: [{ trackIndex: 0, track_id: "audio", name: "Rendered" }],
        problems: [{ trackIndex: 1, track_id: "audio", name: "Dropped", reason: "no sample" }],
      })
    );
    expect((fields.renderedAudioLanes as unknown[]).length).toBe(1);
    expect((fields.skippedLanes as unknown[]).length).toBe(1);
    expect((fields.renderedAudioLanes as Array<Record<string, unknown>>)[0]!.name).toBe("Rendered");
    expect((fields.skippedLanes as Array<Record<string, unknown>>)[0]!.name).toBe("Dropped");
  });

  it("lists a partly-rendered lane under both, because the rest of it did reach the mix", () => {
    // A drum kit whose note 60 has no region and whose other notes sound: "skipped" alone would hide the notes that played, "rendered" alone would hide the miss.
    const fields = audioLaneReplyFields(
      report({
        lanes: [{ trackIndex: 0, track_id: "audio", name: "Kit" }],
        events: 3,
        problems: [{ trackIndex: 0, track_id: "audio", name: "Kit", assetId: "probe-kit", reason: "note 60 has no playback" }],
      })
    );
    expect((fields.renderedAudioLanes as unknown[]).length).toBe(1);
    expect((fields.skippedLanes as unknown[]).length).toBe(1);
    expect(String((fields.skippedLanes as Array<Record<string, unknown>>)[0]!.reason)).toMatch(/note 60/);
  });
});

/**
 * ⭐ **The overlap rule's reading in the reply** — the field the owner asked for at the end of the legato work,
 * because `OfflineAudioLaneReport.legato` existed on the report and `audioLaneReplyFields` did not pick it.
 *
 * The numbers below are the owner's own project's (`docs/LEGATO_OVERLAP.md` §4.2): nineteen chord changes, fifty-seven
 * notes on them, all fifty-seven requested by the rule, thirty-two carried by the voice layer and twenty-five refused
 * because the one-shot recordings run out — so twenty-five attacks still land on a sounding chord where fifty-seven
 * did. The criterion is that the reply says each of those as its **own named counter**, so a reader can tell the
 * rule's refusal from the recording's, and that "no voice reading at all" is reported as the floor (every requested
 * handover is still an attack) rather than as the good case.
 */
const PLANNED: LegatoJoinReading = {
  overlappingOnsets: 19,
  notesAtOverlaps: 57,
  joins: 57,
  reattacks: 0,
  lanes: [
    {
      trackIndex: 0,
      name: "弦乐",
      assetId: "vsco2ce:ViolinEnsSusVib",
      technique: "sustain",
      legatoCapable: true,
      overlappingOnsets: 19,
      notesAtOverlaps: 57,
      joins: 57,
      reattacks: 0,
      refusals: [],
    },
  ],
};
const VOICES: LegatoVoiceReading = {
  joins: 32,
  refusals: Array.from({ length: 25 }, (_value, index) => ({
    reason: "recording-would-run-out" as const,
    trackIndex: 0,
    name: "弦乐",
    atSeconds: 24 + index,
    pitch: 67,
    fromPitch: 67,
    because: "the recording has only 1.795 s left",
  })),
};

describe("the legato reading in a render reply", () => {
  it("keeps the rule's answer and the voice layer's apart, and derives the attacks that remain", () => {
    const fields = audioLaneReplyFields(report({ legato: { planned: PLANNED, voices: VOICES } }));
    expect(fields.audioLaneLegato).toMatchObject({
      overlappingChordChanges: 19,
      notesOnThem: 57,
      handedOverByTheRule: 57,
      refusedByTheRule: 0,
      carriedByTheVoice: 32,
      refusedByTheVoice: 25,
      attacksOnSoundingChords: 25,
    });
    /** The reason is counted, not described: one entry per distinct reason, so a second failure cannot hide behind the first. */
    expect((fields.audioLaneLegato as { refusedBecause: Record<string, number> }).refusedBecause).toEqual({ "recording-would-run-out": 25 });
    /** And the lane is named, with the technique that made the join possible at all. */
    expect((fields.audioLaneLegato as { lanes: Array<Record<string, unknown>> }).lanes[0]).toMatchObject({
      track_index: 0,
      name: "弦乐",
      assetId: "vsco2ce:ViolinEnsSusVib",
      technique: "sustain",
      legatoCapable: true,
      handedOver: 57,
      refused: 0,
    });
    expect(String(fields.audioLaneLegatoNote)).toMatch(/attacksOnSoundingChords/);
  });

  it("reports every requested handover as an attack when no voice reading was handed over", () => {
    /**
     * The sink's `legatoReading()` is optional — a renderer that does not perform handovers is a valid one — so this
     * is the honest floor rather than a missing number: nothing carried anything, so fifty-seven attacks remain.
     */
    const fields = audioLaneReplyFields(report({ legato: { planned: PLANNED } }));
    expect(fields.audioLaneLegato).toMatchObject({
      handedOverByTheRule: 57,
      attacksOnSoundingChords: 57,
    });
    expect((fields.audioLaneLegato as Record<string, unknown>).carriedByTheVoice).toBeUndefined();
    expect((fields.audioLaneLegato as Record<string, unknown>).refusedBecause).toBeUndefined();
  });

  it("says nothing about legato for a report whose notes never overlapped, which is the additive promise", () => {
    // The rule reports a lane only when a decision was forced on it (`planLegatoJoins`), so a gap-free render has no reading and must not grow a key.
    expect(audioLaneReplyFields(report({ lanes: [{ trackIndex: 0, track_id: "audio", name: "Riser" }], events: 2 }))).toEqual({
      renderedAudioLanes: [{ track_id: "audio", name: "Riser" }],
    });
  });
});
