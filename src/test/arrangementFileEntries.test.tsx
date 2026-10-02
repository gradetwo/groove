/**
 * **The entries themselves**: are they on the toolbar, do they open, and does a real file change the arrangement?
 *
 * The pure round trips live in `arrangementEntries.test.ts`; what only a rendered view can answer is the owner's actual
 * complaint — *"有些是功能有了，页面没做入口"*. So this drives the route the way a person does: Create, look at the
 * toolbar, open Export, read the six items, pick a `.mid` into the hidden input, and find the imported tracks in the
 * picker with a sentence saying what happened. The Score tab's MusicXML pair is read where the score is.
 *
 * VexFlow is stubbed for the same reason `scoreV2.test.tsx` stubs it: jsdom has no layout, and what is being judged here
 * is the header's entries rather than the engraving underneath them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { ArrangementViewV2 } from "../components/arrangement/ArrangementViewV2";
import { midiFileFor, musicXmlFileFor } from "../features/arrangement/arrangementFiles";
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

const renderView = () => {
  localStorage.setItem("groove_language", "en");
  return render(
    <LanguageProvider>
      <ArrangementViewV2 songId="s" capture={noCapture} />
    </LanguageProvider>
  );
};

/** Through Logic's "Choose a Project", which every arrangement criterion has to pass. */
const createProject = () => fireEvent.click(screen.getByRole("button", { name: "Create" }));

const twoTrackMidi = () => {
  const arrangement: ArrangementV2 = {
    songId: "s",
    sourceSlots: [],
    bars: 2,
    bpm: 128,
    tracks: [
      { id: "a", kind: "instrument", name: "Imported Lead" },
      { id: "b", kind: "drumkit", name: "Imported Drums" },
    ],
    notesByTrack: {
      a: [{ pitch: 60, startBeats: 0, lengthBeats: 1, velocity: 100 }],
      b: [{ pitch: 36, startBeats: 1, lengthBeats: 0.5, velocity: 100 }],
    },
  };
  return new File([midiFileFor(arrangement).blob], "sketch.mid", { type: "audio/midi" });
};

const pickInto = (input: HTMLElement, file: File) => fireEvent.change(input, { target: { files: [file] } });

describe("the arrangement's file entries, in the toolbar", () => {
  beforeEach(() => {
    // The download path is exercised by the pure criteria; here it only has to not throw. The anchor's own `click` is
    // stubbed too, because jsdom answers a real one with "Not implemented: navigation to another Document".
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:test", revokeObjectURL: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("shows an Export menu and an Import entry on the toolbar the owner found empty", () => {
    renderView();
    createProject();
    const toolbar = within(screen.getByTestId("arrangement-toolbar"));
    expect(toolbar.getByTestId("arrangement-export-menu")).toBeDefined();
    expect(toolbar.getByTestId("arrangement-import")).toBeDefined();
    // The same six words the workbench toolbar uses, so the two surfaces teach one vocabulary.
    expect(toolbar.getByTestId("arrangement-export-menu").textContent).toContain("Export");
    expect(toolbar.getByTestId("arrangement-import").textContent).toContain("Import");
  });

  it("opens the Export menu with the workbench's six items", () => {
    renderView();
    createProject();
    fireEvent.click(screen.getByTestId("arrangement-export-menu"));
    const items = within(screen.getByTestId("arrangement-export-items"));
    expect(items.getByTestId("arrangement-export-midi").textContent).toContain("Export MIDI");
    expect(items.getByTestId("arrangement-export-als").textContent).toContain("Export Ableton Set");
    expect(items.getByTestId("arrangement-export-groove").textContent).toContain("Export .groove Set");
    expect(items.getByTestId("arrangement-export-wav").textContent).toContain("Export Master WAV");
    expect(items.getByTestId("arrangement-export-mp3").textContent).toContain("Export MP3");
    expect(items.getByTestId("arrangement-export-stems").textContent).toContain("Export Stems Pack");
  });

  it("exports the arrangement as MIDI and reports the file it wrote", async () => {
    renderView();
    createProject();
    fireEvent.click(screen.getByTestId("arrangement-export-menu"));
    fireEvent.click(screen.getByTestId("arrangement-export-midi"));
    await waitFor(() => {
      expect(screen.getByTestId("arrangement-file-report").textContent).toContain("Exported");
    });
    expect(screen.getByTestId("arrangement-file-report").textContent).toContain(".mid");
    // The menu closes behind the press, so the next export is one click away rather than two.
    expect(screen.queryByTestId("arrangement-export-items")).toBeNull();
  });

  it("imports a MIDI file into the arrangement, adding its tracks, and says what arrived", async () => {
    renderView();
    createProject();
    const before = screen.getByTestId("arrangement-track-picker").querySelectorAll("button").length;

    pickInto(screen.getByTestId("arrangement-import-input"), twoTrackMidi());

    await waitFor(() => {
      expect(screen.getByTestId("arrangement-file-report").textContent).toContain("Imported sketch.mid");
    });
    // The tracks are really on screen, which is the difference between "imported" and "reported imported".
    const picker = screen.getByTestId("arrangement-track-picker");
    expect(picker.textContent).toContain("Imported Lead");
    expect(picker.textContent).toContain("Imported Drums");
    expect(picker.querySelectorAll("button").length).toBe(before + 2);
    // And the notes came with them: two notes, said in the same sentence.
    expect(screen.getByTestId("arrangement-file-report").textContent).toContain("2 note(s)");
  });

  it("says why a file it cannot read was refused, rather than doing nothing", async () => {
    renderView();
    createProject();
    pickInto(screen.getByTestId("arrangement-import-input"), new File(["nope"], "notes.txt", { type: "text/plain" }));
    await waitFor(() => {
      expect(screen.getByTestId("arrangement-file-report").textContent).toContain("Import failed");
    });
    expect(screen.getByTestId("arrangement-file-report").textContent).toContain("notes.txt");
  });
});

describe("the Score tab's MusicXML entries", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:test", revokeObjectURL: () => undefined });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  /** Create, then select the arrangement's own track and open the Score tab — the way the entries are reached. */
  const openScore = () => {
    renderView();
    createProject();
    const firstTrack = screen.getByTestId("arrangement-track-picker").querySelector("button")!;
    fireEvent.click(firstTrack);
    fireEvent.click(screen.getByTestId("arrangement-editor-score"));
    return firstTrack.textContent;
  };

  it("offers MusicXML export and import in the score's own header", () => {
    openScore();
    expect(screen.getByTestId("score-export-musicxml").textContent).toContain("Export MusicXML");
    expect(screen.getByTestId("score-import-musicxml").textContent).toContain("Import MusicXML");
    // The input names exactly the three extensions the reader understands, `.mxl` included.
    expect(screen.getByTestId("score-import-musicxml-input").getAttribute("accept")).toBe(".musicxml,.xml,.mxl");
  });

  it("writes the track's notes as MusicXML and reports the file", async () => {
    openScore();
    fireEvent.click(screen.getByTestId("score-export-musicxml"));
    await waitFor(() => {
      expect(screen.getByTestId("arrangement-file-report").textContent).toContain("Exported");
    });
    expect(screen.getByTestId("arrangement-file-report").textContent).toContain(".musicxml");
  });

  it("imports a MusicXML document as a new track with its notes", async () => {
    openScore();
    const exported = await musicXmlFileFor([{ pitch: 67, startBeats: 0, lengthBeats: 1, velocity: 100 }], 1, { title: "Flute" });
    const before = screen.getByTestId("arrangement-track-picker").querySelectorAll("button").length;

    pickInto(screen.getByTestId("score-import-musicxml-input"), new File([exported.blob], "flute.musicxml", { type: "application/xml" }));

    await waitFor(() => {
      expect(screen.getByTestId("arrangement-file-report").textContent).toContain("Imported flute.musicxml");
    });
    const picker = screen.getByTestId("arrangement-track-picker");
    expect(picker.textContent).toContain("Flute");
    expect(picker.querySelectorAll("button").length).toBe(before + 1);
    expect(screen.getByTestId("arrangement-file-report").textContent).toContain("1 note(s)");
  });
});
