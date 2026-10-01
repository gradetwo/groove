import { describe, expect, it } from "vitest";
import { audioLaneReplyFields } from "../../mcp/pattern";
import type { OfflineAudioLaneReport } from "../../src/audio/offlineAudioLanes";

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
