import { describe, expect, it } from "vitest";
import { parseManifest, sampleAssetsFromManifest } from "../data/sampleManifest";

/**
 * ⭐ **The fields `parseManifest` must carry, because a field it forgets vanishes silently.**
 *
 * This parser builds entries field by field, and its own comment says what that costs: *"the parser builds entries
 * field by field, so one it forgets disappears silently."* That is not hypothetical. `sourceUrl` was declared on
 * `SampleManifestEntry` and then dropped here anyway, which broke a criterion asserting that a library requiring
 * attribution also says where to point — and it broke nothing else, so only a test that reads a parsed manifest
 * would have caught it.
 *
 * The criterion that missed it was mine and it walked the merge path instead, where entries are built directly and
 * this parser is never called. Removing the carry-through below left that criterion green, which is how a test
 * with no teeth announces itself. This file is the version that bites: it parses manifest **text**, the way the
 * catalogue really does.
 */
const MANIFEST = JSON.stringify({
  version: 1,
  entries: [
    {
      id: "shipped",
      name: "A shipped library",
      licence: "CC-BY",
      // The parser refuses CC-BY without one — "licence CC-BY requires attribution, and none is given" — which is
      // the rule the sourceUrl criterion below is really about: owing attribution and not saying where to point is
      // an incomplete record, not a warning.
      attribution: "Someone, CC-BY",
      durationSeconds: 42,
      durationSource: "stated",
      sourceUrl: "https://example.invalid/shipped",
      mirroredAt: "2026-10-01T00:00:00Z",
      instruments: [{ sfz: "Lib/Sus.sfz", name: "Sus" }],
      files: [],
    },
  ],
});

const only = () => {
  const parsed = parseManifest(MANIFEST);
  expect(parsed.ok).toBe(true);
  const entry = parsed.manifest!.entries[0]!;
  return entry;
};

describe("what the manifest parser carries through", () => {
  it("⭐ keeps sourceUrl, mirroredAt and durationSource, which it once dropped in silence", () => {
    const entry = only();
    // Each of these was declared on the interface first and needed this line second — the trap the comment names.
    expect(entry.sourceUrl).toBe("https://example.invalid/shipped");
    expect(entry.mirroredAt).toBe("2026-10-01T00:00:00Z");
    expect(entry.durationSource).toBe("stated");
    expect(entry.durationSeconds).toBe(42);
  });

  it("keeps the licence a caller needs in order to know attribution is owed", () => {
    // The two criteria that failed when sourceUrl vanished were about exactly this pairing.
    const entry = only();
    expect(entry.licence).toBe("CC-BY");
    expect(entry.sourceUrl).toBeDefined();
  });

  it("still produces a catalogue asset from that entry, so the fields are not carried into a dead end", () => {
    const parsed = parseManifest(MANIFEST);
    const { assets, problems } = sampleAssetsFromManifest(parsed.manifest!, "https://mirror.invalid");
    expect(problems).toEqual([]);
    expect(assets.map((asset) => asset.assetId)).toEqual(["shipped:Sus"]);
    expect(assets[0]!.seconds).toBe(42);
  });
});
