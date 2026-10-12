/**
 * The two sentences that describe this project list the exports it actually has.
 *
 * ## The report
 *
 * `package.json#description` and `index.html`'s `meta[name=description]` both said the same three formats —
 * "WAV/MIDI/Ableton export" — long after the surface had grown past them. Measured on this tree, the browser
 * exports **seven**: the workbench and arrangement menus each hold six (`MIDI`, `Ableton Live Set`, `.groove`,
 * `WAV`, `MP3`, `stems`), and the arrangement's score tab exports `MusicXML`; the MCP server exposes the same
 * seven as tools (`export_arrangement_midi`, `export_arrangement_ableton`, `export_groove`, `render_arrangement`, `render_arrangement_stems`,
 * `export_arrangement_midi`, `export_arrangement_musicxml`). A reader deciding whether this app can hand a
 * score to MuseScore, or stems to a mixer, was told no by omission — the defect is the omission, not the order.
 *
 * ## Why the list is derived rather than typed twice
 *
 * The format table below is checked **against the anchors in the components** before it is checked against the
 * prose: if someone adds a format to the menus, the first test fails and names the id, instead of the prose
 * silently becoming stale again. The prose half then asserts one word per format in both documents, and that
 * the old three-format phrasing is gone — the wording is free to change, the *list* is not free to shrink.
 *
 * `og:description` and `twitter:description` never mentioned exports at all, so they are not asserted here:
 * silence is not a false claim, and this file only holds the sentences that make one.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/**
 * The measured surface: one row per exported format, with the anchor that proves it exists and the word both
 * documents must use for it.
 */
const FORMATS: Array<{ id: string; source: string; prose: string }> = [
  { id: "arrangement-export-midi", source: "src/components/arrangement/ArrangementFileEntriesV2.tsx", prose: "MIDI" },
  { id: "arrangement-export-als", source: "src/components/arrangement/ArrangementFileEntriesV2.tsx", prose: "Ableton" },
  { id: "arrangement-export-groove", source: "src/components/arrangement/ArrangementFileEntriesV2.tsx", prose: ".groove" },
  { id: "arrangement-export-wav", source: "src/components/arrangement/ArrangementFileEntriesV2.tsx", prose: "WAV" },
  { id: "arrangement-export-mp3", source: "src/components/arrangement/ArrangementFileEntriesV2.tsx", prose: "MP3" },
  { id: "arrangement-export-stems", source: "src/components/arrangement/ArrangementFileEntriesV2.tsx", prose: "stems" },
  { id: "score-export-musicxml", source: "src/components/arrangement/ScoreV2.tsx", prose: "MusicXML" },
];

/**
 * The two anchors that wrap the menu rather than choosing a format. Named explicitly so the derived set below
 * stays exact: a new *item* has to appear in `FORMATS`, a new *container* has to appear here.
 */
const MENU_CONTAINER_IDS = [
  "arrangement-export-menu",
  "arrangement-export-items",
  // ⭐ Not formats: the progress readout and the cancel button were added with the export state and share the prefix.
  "arrangement-export-progress",
  "arrangement-export-cancel",
];

const descriptionOf = (): string => JSON.parse(read("package.json")).description as string;

const metaDescriptionOf = (): string => {
  const html = read("index.html");
  const match = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
  expect(match, "index.html should still carry a meta description").not.toBeNull();
  return match![1];
};

describe("the documented export surface matches the shipped one", () => {
  it("derives the format list from the components, so a new format cannot slip past the prose", () => {
    const arrangement = read("src/components/arrangement/ArrangementFileEntriesV2.tsx");
    const ids = [...arrangement.matchAll(/data-testid="(arrangement-export-[a-z0-9]+)"/g)].map((match) => match[1]);
    const items = ids.filter((id) => !MENU_CONTAINER_IDS.includes(id)).sort();

    expect(
      items,
      "the arrangement menu's items changed: update FORMATS (and the two documents) rather than this expectation alone"
    ).toEqual(FORMATS.filter((format) => format.id.startsWith("arrangement-")).map((format) => format.id).sort());

    for (const format of FORMATS) {
      expect(read(format.source), `${format.id} is listed here but not rendered in ${format.source}`).toContain(
        `data-testid="${format.id}"`
      );
    }
  });

  it("names every measured format in package.json's description", () => {
    const description = descriptionOf();
    for (const format of FORMATS) {
      expect(description, `package.json no longer names ${format.prose}`).toContain(format.prose);
    }
  });

  it("names every measured format in index.html's meta description", () => {
    const meta = metaDescriptionOf();
    for (const format of FORMATS) {
      expect(meta, `index.html's meta description no longer names ${format.prose}`).toContain(format.prose);
    }
  });

  it("has dropped the three-format phrasing that was the defect", () => {
    // The old sentence is not "a shorter version of the new one": it named three of seven and read as a limit.
    for (const [where, text] of [
      ["package.json", descriptionOf()],
      ["index.html", metaDescriptionOf()],
    ] as const) {
      expect(text, `${where} still advertises the old three-format surface`).not.toContain("WAV/MIDI/Ableton");
    }
  });
});
