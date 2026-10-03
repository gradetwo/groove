/**
 * ⭐⭐ **The mapping really lands: a named part becomes a `sampler` track pointed at the recording.**
 *
 * This is the owner's acceptance path, and the step that did not work: *import a MIDI file, name each part's
 * instrument, play*. The dialog could always write `TrackV2.instrument`, and the placement always created the track
 * as `"synth"` — so the arrangement reported nine synthesizers, the sampler-only instrument slot never rendered, and
 * the choice a person made was invisible on the very surface that asked for it.
 *
 * Three readings, because one of them can be faked:
 *
 *   1. **the arrangement the view reports** — every mapped part's track has `kind === "sampler"` and a
 *      `sample.assetId` equal to the asset `sampledAssetForLane` resolves the chosen name to (**the model**);
 *   2. **the sampler-only instrument slot** (`instrument-slot-*` / `instrument-open-*`), which
 *      `TrackListV2`/`TrackHeaderV2` render *iff* `track.kind === "sampler"` — so its presence is a second,
 *      independent reading of the same fact, taken off the DOM rather than off the value the test already holds;
 *   3. **the sentence in the toolbar**, so the person who just made the choice can read it back.
 *
 * The reverse is pinned too, at the same level: naming nothing leaves the same anonymous synthesizers the importer
 * produced before the dialog existed, and a name the recorded table cannot serve is **said out loud** rather than
 * silently left a synthesizer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { midiFileFor, placeMidiIntoArrangement, type ReadMidiImport } from "../features/arrangement/arrangementFiles";
import { fromMidi } from "../data/midiToArrangement";
import type { InstrumentChoice } from "../components/arrangement/TrackListV2";
import { buildMidiFile } from "./fixtures/midi_file.mjs";
import type { ArrangementV2 } from "../types/arrangementV2";

vi.mock("vexflow/core", () => ({
  Renderer: class {
    static Backends = { SVG: 1 };
    resize() {}
    getContext() {
      return {};
    }
  },
  Stave: class {
    addClef() {
      return this;
    }
    addTimeSignature() {
      return this;
    }
    setEndBarType() {
      return this;
    }
    setContext() {
      return this;
    }
    draw() {
      return this;
    }
  },
  StaveNote: class {
    getDuration() {
      return "q";
    }
  },
  Voice: class {
    addTickables() {
      return this;
    }
    setStrict() {
      return this;
    }
    draw() {
      return this;
    }
  },
  Formatter: class {
    joinVoices() {
      return this;
    }
    format() {
      return this;
    }
  },
  Beam: { generateBeams: () => [] },
  Dot: { buildAndAttach: () => [] },
  Barline: { type: { END: 1 } },
  Font: { HOST_URL: "", load: () => Promise.resolve() },
}));

const noCapture = () => new Promise<never>(() => undefined);

/**
 * ⭐ The catalogue is injected, as it is in the application, so the sampler-only slot has something to draw. One entry
 * is enough: the slot's condition is `track.kind === "sampler" && instruments.length > 0`, and what it lists is not
 * what this criterion is about.
 */
const CATALOGUE: InstrumentChoice[] = [{ assetId: "salamander-grand", name: "Salamander Grand Piano", library: "salamander-grand" }];

let reported: ArrangementV2 | undefined;
const reportArrangement = (next: ArrangementV2) => {
  reported = next;
};

const renderView = () => {
  reported = undefined;
  localStorage.setItem("groove_language", "en");
  return render(
    <LanguageProvider>
      <ArrangementViewV2 songId="s" capture={noCapture} instruments={CATALOGUE} onArrangementChange={reportArrangement} />
    </LanguageProvider>
  );
};

const createProject = () => fireEvent.click(screen.getByRole("button", { name: "Create" }));
const pickInto = (input: HTMLElement, file: File) => fireEvent.change(input, { target: { files: [file] } });

/** An eight-part `.mid`, built by this repository's own writer — the shape the dialog appears for. */
const eightPartMidi = () => {
  const names = Array.from({ length: 8 }, (_, index) => `Part ${index + 1}`);
  const arrangement: ArrangementV2 = {
    songId: "s",
    sourceSlots: [],
    bars: 2,
    bpm: 120,
    tracks: names.map((name, index) => ({ id: `t${index}`, kind: "synth" as const, name })),
    notesByTrack: Object.fromEntries(
      names.map((_, index) => [`t${index}`, [{ pitch: 60 + index, startBeats: 0, lengthBeats: 1, velocity: 100 }]])
    ),
  };
  return new File([midiFileFor(arrangement).blob], "eight.mid", { type: "audio/midi" });
};

/** The distinct track ids the sampler-only slot/button is drawn for — the DOM's own answer to "which are samplers". */
const slotTrackIds = (prefix: "instrument-slot-" | "instrument-open-") =>
  new Set(
    [...document.querySelectorAll(`[data-testid^="${prefix}"]`)].map((element) =>
      element.getAttribute("data-testid")!.replace(prefix, "")
    )
  );

const readFixture = (bytes: Uint8Array, filename: string): ReadMidiImport => ({ filename, imported: fromMidi(bytes) });
const blank = (): ArrangementV2 => ({ songId: "s", sourceSlots: [], bars: 2, bpm: 120, tracks: [], notesByTrack: {} });

describe("a mapped import becomes sampler tracks", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:test", revokeObjectURL: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("turns every part named with a recorded instrument into a sampler track, and says so", async () => {
    renderView();
    createProject();

    pickInto(screen.getByTestId("arrangement-import-input"), eightPartMidi());
    await waitFor(() => {
      expect(screen.getByTestId("import-instrument-mapping")).toBeDefined();
    });

    // A person maps every part to the same recorded instrument.
    for (let index = 0; index < 8; index++) {
      fireEvent.change(screen.getByTestId(`import-mapping-select-${index}`), { target: { value: "piano_lead" } });
    }
    expect((screen.getByTestId("import-mapping-confirm") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("import-mapping-confirm"));

    await waitFor(() => {
      expect(screen.getByTestId("arrangement-file-report").textContent).toContain("Imported eight.mid");
    });

    // ⭐ Reading ① — the model the view installed.
    const tracks = reported?.tracks ?? [];
    const imported = tracks.filter((track) => track.name.startsWith("Part "));
    expect(imported).toHaveLength(8);
    expect(imported.filter((track) => track.kind === "sampler")).toHaveLength(8);
    // ⭐ …pointed at the very asset the dialog's own `→ salamander-grand` promised.
    expect(imported.every((track) => track.sample?.assetId === "salamander-grand")).toBe(true);
    // The name is kept as well, so the choice is still readable after the kind change.
    expect(imported.every((track) => track.instrument === "piano_lead")).toBe(true);
    // And nothing else was touched: the template's own track is still the synthesiser it was.
    expect(tracks.filter((track) => track.kind !== "sampler")).toHaveLength(tracks.length - 8);

    // ⭐⭐ Reading ② — the sampler-only slot, drawn iff `kind === "sampler"`, for exactly the mapped tracks.
    const slots = slotTrackIds("instrument-slot-");
    const chips = slotTrackIds("instrument-open-");
    expect(slots.size).toBe(8);
    expect(chips.size).toBe(8);
    expect([...slots].sort()).toEqual(imported.map((track) => track.id).sort());

    // ⭐ Reading ③ — the mapping is a fact the toolbar states rather than one the person has to inspect eight selects for.
    expect(screen.getByTestId("arrangement-file-report").textContent).toContain(
      "8 imported track(s) are now sampler tracks playing the recording you chose"
    );
    /**
     * ⚠️ **An explicit budget, because this machine's load is not the suite's.** Eight parts through the real view is
     * seconds of rendering, and the default 5 s turns a slow host into a false red — the same mistake the performance
     * line measured on the Playwright side (40 s fails, 90 s succeeds). The pattern is this repository's own
     * (`samplerDiagnostics.test.tsx`).
     */
  }, 60000);

  it("leaves the tracks anonymous synthesizers when the dialog is skipped, unchanged", async () => {
    renderView();
    createProject();
    pickInto(screen.getByTestId("arrangement-import-input"), eightPartMidi());
    await waitFor(() => {
      expect(screen.getByTestId("import-instrument-mapping")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("import-mapping-skip"));
    await waitFor(() => {
      expect(screen.getByTestId("arrangement-file-report").textContent).toContain("Imported eight.mid");
    });

    const imported = (reported?.tracks ?? []).filter((track) => track.name.startsWith("Part "));
    expect(imported).toHaveLength(8);
    expect(imported.every((track) => track.kind === "synth")).toBe(true);
    expect(imported.every((track) => track.instrument === undefined)).toBe(true);
    expect(slotTrackIds("instrument-slot-").size).toBe(0);
    // The report does not claim a mapping that never happened.
    expect(screen.getByTestId("arrangement-file-report").textContent).not.toContain("sampler tracks playing the recording");
  }, 60000);

  /**
   * ⚠️ **No silent no-op.** The dialog only offers names the recorded table holds, so it cannot produce the case below;
   * a programmatic caller can. A name that cannot be served leaves the track a synthesiser — and says so, rather than
   * reporting an import that looks like it mapped something.
   */
  it("says out loud when a name cannot become a sampler rather than silently ignoring it", () => {
    const bytes = buildMidiFile({ tracks: [{ name: "Pad", notes: [{ note: 60, startTicks: 0, durationTicks: 480 }] }] });
    const placed = placeMidiIntoArrangement(blank(), readFixture(bytes, "pad.mid"), { 0: "warm_pad" });
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    const track = placed.arrangement.tracks[0]!;
    expect(track.kind).toBe("synth");
    expect(track.instrument).toBe("warm_pad");
    expect(placed.mapped).toBeUndefined();
    expect(placed.problems.join(" | ")).toContain('"warm_pad"');
    expect(placed.problems.join(" | ")).toContain("keeps its built-in synthesizer");
  });
});
