/**
 * A library's licence is the one thing an agent must be able to see before it publishes anything.
 *
 * The manifest has always carried `licence`, `sourceUrl`, `repo` and `pin`, and the instrument list exposed none of them — so an agent could name a sound and not say where it came from. The CC-BY library in this manifest was pinned **on purpose** to exercise that path.
 *
 * The durations are the same story as everywhere else in this project: `durationSeconds` is written by the mirroring step with `ffprobe` **after** the bytes are downloaded. Until that has happened for a library, this says so instead of reporting a zero, because a zero would read as a measurement.
 */
import { describe, expect, it } from "vitest";
import { listSampleLibraries } from "../../mcp/instruments";

describe("list_sample_libraries", () => {
  const listed = listSampleLibraries();

  it("lists every library the manifest declares, with its licence", () => {
    expect(listed.libraries.length).toBeGreaterThan(0);
    for (const library of listed.libraries) {
      expect(library.id, "a library with no id cannot be referenced").toBeTruthy();
      expect(library.licence, `${library.id} declares no licence`).toBeTruthy();
    }
  });

  it("names the licences that require attribution, with somewhere to point", () => {
    // ⭐ The property an agent needs: not "this is CC-BY" alone, but which library, and where attribution goes.
    const attribution = listed.libraries.filter((library) => /BY/i.test(library.licence));
    expect(attribution.length, "the manifest pins a CC-BY library to exercise this path").toBeGreaterThan(0);
    for (const library of attribution) {
      expect(library.sourceUrl, `${library.id} needs attribution but declares no sourceUrl`).toBeTruthy();
      expect(listed.note).toContain(library.id);
    }
  });

  it("says a duration was not measured rather than reporting a zero", () => {
    // ⭐ The rule this project keeps: a number nobody measured must not be presented as one.
    for (const library of listed.libraries) {
      if (library.durationSeconds === undefined) {
        expect(library.problems.join(" ")).toContain("no measured duration");
      } else {
        expect(library.durationSeconds).toBeGreaterThan(0);
      }
    }
  });

  it("counts the instruments each library actually contributes", () => {
    // A library that contributes nothing is worth seeing rather than inferring from its absence in the instrument list.
    for (const library of listed.libraries) {
      expect(Number.isInteger(library.instruments)).toBe(true);
      if (library.instruments === 0) expect(library.problems.join(" ")).toContain("contributes no instrument");
    }
  });

  it("carries the pin, so a byte-for-byte reference is reproducible", () => {
    const pinned = listed.libraries.filter((library) => library.pin !== undefined);
    expect(pinned.length, "these libraries are pinned by commit; losing that loses reproducibility").toBeGreaterThan(0);
    for (const library of pinned) expect(library.pin).toMatch(/^[0-9a-f]{7,40}$/);
  });
});
