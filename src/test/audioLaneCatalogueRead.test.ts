/**
 * **An unreadable sample manifest is a reported problem, not a discarded report.**
 *
 * The first cut passed `onAudioLanes` to the page **only when the parsed catalogue was non-empty**, so a missing manifest was the one case where the callback was
 * never attached: the renderer planned every lane as unresolvable, called a callback nobody had passed, and the reply came back `{}` — the lane silent *and*
 * unreported. That is the same "ok while doing nothing" shape the whole audio-lane reply exists to remove, and the fix has two halves: the read reports **why** with
 * the path it tried, and `renderAudio` attaches that reason in Node so the reply cannot be empty even if the page's callback were lost again.
 *
 * These criteria cover the read (no browser needed) and the reply shaping; the WavExporter half — an empty catalogue still producing a report — is pinned in
 * `audioLaneRenderIntegration.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { audioLaneReplyFields } from "../../mcp/pattern";
import { readAudioLaneCatalogue } from "../../mcp/render/worker";
import type { SequencerPattern } from "../../src/types/genre";

const pattern = (tracks: Array<Record<string, unknown>>): SequencerPattern =>
  ({ genre_id: "custom", bpm: 120, scale: "chromatic", resolution: "1/16", totalSteps: 16, tracks }) as unknown as SequencerPattern;

const audioLane = pattern([{ track_id: "audio", name: "Sampler", instrument: "sampler", steps: new Array(16).fill(0), sample: { assetId: "x" } }]);
const noAudioLane = pattern([{ track_id: "kick", name: "Kick", instrument: "synth", steps: new Array(16).fill(0) }]);

let root: string;
let previousRoot: string | undefined;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "groove-manifest-"));
  previousRoot = process.env.GROOVE_MCP_ROOT;
  process.env.GROOVE_MCP_ROOT = root;
});

afterEach(() => {
  if (previousRoot === undefined) delete process.env.GROOVE_MCP_ROOT;
  else process.env.GROOVE_MCP_ROOT = previousRoot;
  rmSync(root, { recursive: true, force: true });
});

describe("reading the catalogue a render resolves audio lanes against", () => {
  it("names the path when a pattern has an audio lane and the manifest is not there", () => {
    const read = readAudioLaneCatalogue(audioLane);
    expect(read.text).toBeNull();
    expect(read.problem).toContain(path.join(root, "public", "samples", "manifest.json"));
    // The reason is actionable, not just a boolean: it says the manifest could not be read and where it was looked for.
    expect(read.problem).toMatch(/could not be read/);
  });

  it("reports nothing for a pattern with no audio lane, because nothing was needed", () => {
    // The additive promise: a synthesised render must not acquire a manifest read or a warning.
    expect(readAudioLaneCatalogue(noAudioLane)).toEqual({ text: null, problem: null });
  });

  it("returns the manifest text, with no problem, when it is there", () => {
    mkdirSync(path.join(root, "public", "samples"), { recursive: true });
    writeFileSync(path.join(root, "public", "samples", "manifest.json"), '{"version":1,"entries":[]}');
    expect(readAudioLaneCatalogue(audioLane)).toEqual({ text: '{"version":1,"entries":[]}', problem: null });
  });

  it("surfaces the catalogue problem in the tool reply, even with no per-lane entry", () => {
    const fields = audioLaneReplyFields({
      lanes: [],
      events: 0,
      problems: [],
      catalogueProblem: `the sample manifest could not be read at ${path.join(root, "public", "samples", "manifest.json")} (ENOENT), so no audio lane can be resolved`,
    });
    // An empty reply and an unreadable manifest must not look the same.
    expect(String(fields.audioLaneCatalogueProblem)).toContain(path.join(root, "public", "samples", "manifest.json"));
  });
});
