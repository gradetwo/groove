/**
 * **The picker says what a recording can sound, and the track says when its own line falls outside that — both from the
 * engine, never from a table and never from a printed span.**
 *
 * The four criteria here are the ones the work order names, and each is written so that the *wrong* implementation is red
 * rather than merely absent:
 *
 *   1. the range a row shows **follows the fixture's regions** — the same asset with a different program shows a
 *      different range, so a hardcoded table cannot pass;
 *   2. before the engine answers, the slot says **尚未加载** and contains **no digit** — a guessed range is red;
 *   3. `hard-bop`'s lead (writes 72–77) against a fixture of `mtg-solo-sax:MTG-Tenor-Sax` (sounds 39–76, no 41–43)
 *      reports **超出 4 个**; deleting the report is red. ⭐ This case used to use `bebop`'s lead (44 notes written
 *      82–91) — that line was written **above the tenor saxophone's own range**, so
 *      `docs/SAMPLED_RANGE_COVERAGE.md` §8 folded it back into range and it now reports nothing. `hard-bop`'s lead is
 *      a real lane that is **still** outside its recording for the honest reason (77 is just above the recording's
 *      76), so the criterion keeps a subject rather than an empty assertion;
 *   4. a lane written **41–43** — inside the printed 39–76 span and inside its hole — reports **超出 3 个**; a min/max
 *      comparison is red.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import {
  CatalogueRecordingPicker,
  type CatalogueRecordingPickerProps,
} from "../components/arrangement/CatalogueRecordingPicker";
import { ALL_GENRES } from "../data/genres";
import { patternFromGenre } from "../data/genreMix";
import type { SampleAsset } from "../data/sampleCatalogue";
import type { CatalogueStatus } from "../data/sampleCatalogueStatus";
import type { ProgramTextSource } from "../features/sampledCoverage/programText";
import type { SequencerTrack } from "../types/genre";

const MTG = "mtg-solo-sax:MTG-Tenor-Sax";
const OTHER = "fixture-other-flute";
/** A stable empty catalogue, so a rerender can change the address book **by identity** and nothing else. */
const EMPTY_CATALOGUE: readonly SampleAsset[] = [];

const asset = (assetId: string, name: string): SampleAsset => ({
  assetId,
  name,
  kind: "one-shot",
  seconds: 0,
  sfz: { url: `https://fixture.invalid/${assetId.replace(":", "-")}.sfz` },
});

const TENOR_ASSET = asset(MTG, "MTG Tenor Sax");
const OTHER_ASSET = asset(OTHER, "Fixture Flute");

/** The measured shape of MTG's tenor: 39–76, with **no sample for 41/42/43**. */
const TENOR = `
<region> sample=tenor-a3.wav lokey=39 hikey=40 pitch_keycenter=39
<region> sample=tenor-bb3.wav lokey=44 hikey=76 pitch_keycenter=44
`;
const OTHER_PROGRAM = "<region> sample=flute.wav lokey=20 hikey=30 pitch_keycenter=20";

const instruments = [
  { assetId: MTG, name: "MTG Tenor Sax", library: "mtg-solo-sax" },
  { assetId: OTHER, name: "Fixture Flute", library: "fixture" },
];

const status: CatalogueStatus = {
  phase: "ready",
  summary: "Sample catalogue ready — 2 instruments available.",
  detail: [],
};

function picker(props: Partial<CatalogueRecordingPickerProps> = {}) {
  return (
    <LanguageProvider>
      <CatalogueRecordingPicker
        trackName="Lead Synth"
        role="lead"
        instruments={instruments}
        status={status}
        onChoose={() => undefined}
        {...props}
      />
    </LanguageProvider>
  );
}

/** A lane with one note per written key — enough for the report, read through the model's own step readers. */
const laneWriting = (pitches: number[]): SequencerTrack =>
  ({ track_id: "lead", name: "Hole Lane", steps: pitches.map(() => 1), pitch: pitches }) as unknown as SequencerTrack;

describe("the recording picker's coverage display", () => {
  beforeEach(() => {
    localStorage.setItem("groove_language", "zh");
  });
  afterEach(() => {
    localStorage.removeItem("groove_language");
  });

  it("⭐ shows the range the engine reads from the regions, and moves when the regions move", async () => {
    const { rerender } = render(
      picker({ assetId: MTG, assets: [TENOR_ASSET], programText: async () => TENOR })
    );
    await waitFor(() =>
      expect(screen.getByTestId("lane-recording-coverage").textContent).toContain("可发 39–76（缺 41–43）")
    );

    // The **same assetId**, a different program. A hardcoded row for this id cannot follow this.
    rerender(picker({ assetId: MTG, assets: [TENOR_ASSET], programText: async () => OTHER_PROGRAM }));
    await waitFor(() =>
      expect(screen.getByTestId("lane-recording-coverage").textContent).toContain("可发 20–30")
    );
  });

  it("⭐ says 尚未加载 and shows no number before the engine has answered", async () => {
    render(
      picker({
        assetId: MTG,
        assets: [TENOR_ASSET],
        // Never answers: the state under test is "asked, not yet known".
        programText: () => new Promise<string>(() => undefined),
      })
    );
    const slot = await screen.findByTestId("lane-recording-coverage");
    expect(slot.textContent).toContain("尚未加载");
    expect(slot.getAttribute("data-coverage-status")).toBe("loading");
    // The whole point: no range, no digits, nothing a person could mistake for a measurement.
    expect(slot.textContent).not.toMatch(/\d/);
  });

  it("⭐ a list row reads on intent and stays blank until it has an answer", async () => {
    render(
      picker({
        assets: [TENOR_ASSET, OTHER_ASSET],
        programText: async (requested) => (requested.assetId === MTG ? TENOR : OTHER_PROGRAM),
      })
    );
    fireEvent.click(screen.getByTestId("lane-recording-open"));

    // Nobody has pointed at a row yet: a row shows no number rather than a guess.
    expect(screen.getByTestId(`instrument-coverage-${MTG}`).textContent).toBe("");

    fireEvent.mouseEnter(screen.getByTestId(`instrument-option-${MTG}`));
    await waitFor(() =>
      expect(screen.getByTestId(`instrument-coverage-${MTG}`).textContent).toContain("可发 39–76（缺 41–43）")
    );
    // And the row nobody asked about is still blank — the read is per row, not a sweep of the catalogue.
    expect(screen.getByTestId(`instrument-coverage-${OTHER}`).textContent).toBe("");
  });

  it("⭐ reports the 4 notes of hard-bop's lead that fall outside its tenor", async () => {
    const genre = ALL_GENRES.find((candidate) => candidate.id === "hard-bop");
    expect(genre, "the hard-bop genre must exist for this criterion to mean anything").toBeDefined();
    const lane = patternFromGenre(genre!).tracks.find((track) => track.track_id === "lead");
    expect(lane, "hard-bop must still have a lead lane").toBeDefined();

    render(picker({ assetId: MTG, lane, assets: [TENOR_ASSET], programText: async () => TENOR }));
    const report = await screen.findByTestId("lane-range-report");
    expect(report.textContent).toContain("有 4 个音超出");
    expect(report.textContent).toContain("可发 39–76（缺 41–43）");
    // The lane's own written range is shown beside it, which is the pairing the census found missing everywhere.
    expect(screen.getByTestId("lane-written-range").textContent).toContain("本轨写出 72–77");
  });

  it("⭐ counts a note written into the recording's hole as outside, not as inside the span", async () => {
    render(
      picker({
        assetId: MTG,
        lane: laneWriting([41, 42, 43]),
        assets: [TENOR_ASSET],
        programText: async () => TENOR,
      })
    );
    const report = await screen.findByTestId("lane-range-report");
    expect(report.textContent).toContain("有 3 个音超出");
    // And the range beside it names the hole, so the report and the label agree about why.
    expect(screen.getByTestId("lane-recording-coverage").textContent).toContain("缺 41–43");
  });

  it("reports nothing when every written note is covered", async () => {
    render(
      picker({
        assetId: MTG,
        lane: laneWriting([50, 60]),
        assets: [TENOR_ASSET],
        programText: async () => TENOR,
      })
    );
    await screen.findByTestId("lane-written-range");
    expect(screen.queryByTestId("lane-range-report")).toBeNull();
  });

  it("shows no coverage at all when the caller has no catalogue to read from", () => {
    render(picker({ assetId: MTG }));
    expect(screen.queryByTestId("lane-recording-coverage")).toBeNull();
    expect(screen.queryByTestId("lane-range-report")).toBeNull();
  });

  it("recovers when the catalogue arrives after the panel has opened", async () => {
    // The real order: the inspector can be open on a lane before `appCatalogueRuntime.load()` has answered. The first
    // answer is "not in this catalogue" — a fact about the address book in hand, not about the recording — and it must
    // not become permanent. The reader is the **same function** across both renders, so nothing but the catalogue moves.
    const source: ProgramTextSource = async () => TENOR;
    const { rerender } = render(
      picker({ assetId: MTG, assets: EMPTY_CATALOGUE, programText: source })
    );
    await waitFor(() =>
      expect(screen.getByTestId("lane-recording-coverage").getAttribute("data-coverage-status")).toBe("failed")
    );

    rerender(picker({ assetId: MTG, assets: [TENOR_ASSET], programText: source }));
    await waitFor(() =>
      expect(screen.getByTestId("lane-recording-coverage").textContent).toContain("可发 39–76（缺 41–43）")
    );
  });
});
