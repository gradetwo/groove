/**
 * ⭐ **`trigger` — the opcode that decides *when* a region sounds, and the defect that came of ignoring it.**
 *
 * The owner's audit found that `salamander-grand` (Salamander Grand Piano) played **`Samples/rel40.flac`** — a hammer-release noise — for MIDI 60, and it was right:
 * the file's second `<global>` says `trigger=release`, every included `Data/hammer.txt` region inherits it, those regions write `key=40` (a **one-key-wide** span while
 * the piano notes' regions are three keys wide), and the narrowest-covering-region rule therefore preferred the key-release noise over the note itself. `parse.ts`
 * read no `trigger` at all, so nothing could tell the two apart.
 *
 * ## What the criteria below hold, and how each one can go red
 *
 * 1. **The synthetic fixture** — a release region narrower than the note region, one `legato` region and one unknown value — is refused on note-on, while the note and
 *    the `first` region still sound. Removing the filter makes every one of them sound again, so this is the direct red/green pair.
 * 2. **The real library, from the pin the manifest carries.** `salamander-grand` note 60 must resolve to a piano sample (`C4v*.flac`) and never to a `rel*` hammer
 *    noise. This is the audit's own finding, re-measured through `resolveInstrumentNote` rather than trusted.
 * 3. **The whole-corpus census** (§② of the work order): every `trigger=` in every declared SFZ／TXT file of every pinned entry, by value and by library, pinned in
 *    `triggerCensus.ts`. The point is not the numbers for their own sake — it is that **the next library to arrive using `trigger` cannot do so silently**: the live
 *    half of the criterion re-reads the corpus and fails, naming the file, until the census is updated on purpose.
 *
 * The whole-corpus and real-library halves need `raw.githubusercontent.com`, so they **skip, loudly, when the network is not there** — the pattern
 * `sfizzAgreement.test.ts` and the other real-library criteria already use, because a criterion that fails for a missing network teaches people to ignore it. A
 * *partial* failure is not a missing network: when some files fetch and others do not, the case names the ones that did not.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseManifest, sourceSfzUrl, type SampleManifest } from "../data/sampleManifest";
import { expandRemoteIncludes } from "../audio/sfz/remoteIncludes";
import { declaredSwitchDefault, noteOnTrigger, parseSfz, regionsForNote, triggerOf } from "../audio/sfz/parse";
import { resolveInstrumentNote } from "../audio/sfz/instrument";
import { TRIGGER_CENSUS, TRIGGER_CENSUS_ROWS, TRIGGER_CENSUS_UNREADABLE, TRIGGER_VALUES, type TriggerValue } from "./triggerCensus";

const manifest: SampleManifest = parseManifest(readFileSync("public/samples/manifest.json", "utf8")).manifest!;

/** One fetch per address, shared across the whole file — the corpus is ~1 700 requests and the tests re-read the same files. */
const fetched = new Map<string, string | null>();
const fetchText = async (url: string): Promise<string> => {
  const cached = fetched.get(url);
  if (cached !== undefined) {
    if (cached === null) throw new Error(`already failed: ${url}`);
    return cached;
  }
  const response = await fetch(url);
  if (!response.ok) {
    fetched.set(url, null);
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  const text = await response.text();
  fetched.set(url, text);
  return text;
};

// ---------------------------------------------------------------------------------------------
// ① the synthetic fixture: the rule itself, with nothing else in the way
// ---------------------------------------------------------------------------------------------

/**
 * Three regions that would collapse into one answer without the filter, deliberately shaped like the real file:
 *
 * ```
 *   key=60  sample=note.wav                    span 0   the note itself
 *   key=60  sample=hammer-release.wav  trigger=release      span 0   a key-release noise
 *   key=60  sample=legato-tail.wav     trigger=legato       span 0   needs another note sounding
 *   key=60  sample=first-note.wav      trigger=first        span 0   a note-on trigger
 *   key=61  sample=mystery.wav         trigger=continuous   span 0   a value neither the page nor sfizz has
 *   key=62  sample=loud-note.wav       trigger=release_key  span 0   the SFZ v2 spelling
 * ```
 *
 * Every one of them is one key wide, so the **narrowest-range rule cannot help** — the only thing that can separate them is the trigger. That is the point: the real
 * defect was a *span* accident, and a criterion that leaned on span would be pinning the accident rather than the rule.
 */
const FIXTURE = `
  <region> key=60 sample=note.wav
  <region> key=60 sample=hammer-release.wav trigger=release
  <region> key=60 sample=legato-tail.wav trigger=legato
  <region> key=60 sample=first-note.wav trigger=first
  <region> key=61 sample=mystery.wav trigger=continuous
  <region> key=62 sample=loud-note.wav trigger=release_key
`;

describe("a region's trigger decides whether a note-on may sound it", () => {
  it("gives a region that writes no trigger the format's own default, which is `attack`", () => {
    /**
     * *"**attack** : (Default): Region will play on note-on."* (<https://sfzformat.com/opcodes/trigger/>) — and sfizz's `ESpec<Trigger> trigger {
     * Trigger::attack, {Trigger::attack, Trigger::release_key}, 0 };` (`Defaults.cpp:207`) says the same. The reader folds the default in so no caller re-implements it,
     * while `opcodes.trigger` still holds only what the file wrote.
     */
    const [plain] = parseSfz("<region> key=60 sample=note.wav");
    expect(plain!.trigger).toBe("attack");
    expect(plain!.opcodes.trigger).toBeUndefined();
    expect(noteOnTrigger(plain!)).toBe(true);
  });

  it("reads the five values the specification lists, and leans on the parser rather than a per-caller regex", () => {
    expect(triggerOf(undefined)).toEqual({ trigger: "attack" });
    expect(triggerOf("  RELEASE  ")).toEqual({ trigger: "release" });
    expect(triggerOf("release_key")).toEqual({ trigger: "release_key" });
    // Some files write the SFZ v2 value without the underscore. It is the same behaviour under a second spelling, not a sixth trigger.
    expect(triggerOf("releasekey")).toEqual({ trigger: "release_key" });
    for (const value of TRIGGER_VALUES) expect(triggerOf(value)).toEqual({ trigger: value });
  });

  it("records a value that is not one of the five as unknown rather than guessing at it", () => {
    /**
     * `last` is named in the work order and is **not** on the specification's page, so this is the *not found* case written down: the value the file wrote is kept,
     * and the region is refused rather than treated as `attack`. Decent Sampler's own `trigger` list adds `continuous` (`DecentSampler, Release 1.34.0` manual,
     * *"Valid values: attack … release … first … legato … continuous means that the sample will always play"*) — a value with no SFZ specification page, and one this
     * project will not invent a rule for either.
     */
    expect(triggerOf("last")).toEqual({ trigger: "unknown", triggerUnknown: "last" });
    expect(triggerOf("continuous")).toEqual({ trigger: "unknown", triggerUnknown: "continuous" });
    expect(triggerOf("off")).toEqual({ trigger: "unknown", triggerUnknown: "off" });
    const regions = parseSfz(FIXTURE);
    expect(regions.find((region) => region.sample === "mystery.wav")).toMatchObject({ trigger: "unknown", triggerUnknown: "continuous" });
    expect(regions.find((region) => region.sample === "mystery.wav")!.opcodes.trigger).toBe("continuous");
  });

  it("refuses `release`, `release_key`, `legato` and an unknown value on a note-on, and admits `attack` and `first`", () => {
    const regions = parseSfz(FIXTURE);
    const samples = (keys: number[]) => keys.flatMap((key) => regionsForNote(regions, key).map((region) => region.sample));

    // The note-on triggers, and only those — `first` included, for the reason `noteOnTrigger` records.
    expect(samples([60]).sort()).toEqual(["first-note.wav", "note.wav"]);
    // The key-release noise and its SFZ v2 sibling never answer a key press. Removing the filter in `regionsForNote` puts all six back and this is the line that goes red.
    expect(samples([61])).toEqual([]);
    expect(samples([62])).toEqual([]);
    // And the exclusion is not an accident of the narrowest-range rule: every region here is the same width.
    expect(new Set(regions.map((region) => region.hikey - region.lokey)).size).toBe(1);
  });

  it("says nothing sounds on a note-on when every region is release-triggered, instead of naming a key range that is covered", () => {
    /**
     * The reason string is a deliverable of its own (§27: a partial implementation says so rather than degrading quietly). Before this, a file of release samples
     * reported *"the file's regions cover keys 21–108"* — true, and useless, because the note **is** covered and it is the trigger that does not match.
     */
    const releaseOnly = `
      <region> key=60 sample=hammer-release.wav trigger=release
      <region> key=61 sample=string-resonance.wav trigger=release
    `;
    const resolution = resolveInstrumentNote({ assetId: "fixture:release-only", sfz: { url: "file:///release-only.sfz" } }, releaseOnly, 60);
    expect(resolution.ok).toBe(false);
    expect(resolution.reason).toContain("no note can sound");
    expect(resolution.reason).toContain("2 region(s) read");
    // The regions are still reported — the parser did not delete them, and a caller can still see what the file holds.
    expect(resolution.regions).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------
// ② the real library: the audit's own finding, re-measured
// ---------------------------------------------------------------------------------------------

const SALAMANDER = manifest.entries.find((entry) => entry.id === "salamander-grand")!;
const SALAMANDER_SFZ = sourceSfzUrl(manifest, "salamander-grand")!;

/** The pinned program and each file it includes, or `null` when the network did not deliver it. */
async function expandedSalamander(): Promise<{ text: string; included: string[] } | null> {
  try {
    const program = await fetchText(SALAMANDER_SFZ);
    const base = new URL("./".repeat(SALAMANDER.sfz!.split("/").length), SALAMANDER_SFZ).toString();
    const expanded = await expandRemoteIncludes(program, { fetchText, programUrl: SALAMANDER.sfz!, baseUrl: base, requestTimeoutMs: 20000 });
    return { text: expanded.text, included: expanded.included };
  } catch {
    return null;
  }
}

const salamander = await expandedSalamander();

describe.skipIf(salamander === null)("salamander-grand, from the pin the manifest carries", () => {
  it("⭐ the parser's own note-on selection never offers the file's release regions — the red/green pair", () => {
    /**
     * **This is the criterion that fails the moment `regionsForNote`'s `noteOnTrigger` filter goes away**, and it is written at the parser level on purpose. The
     * resolution-level case below goes through `resolveInstrumentNote`, which has its own note-on filter; this one asks the parser directly, so it cannot be satisfied
     * by the second filter.
     *
     * Measured on the unfiltered parser (the red state): **MIDI 60 at every velocity answers `rel40.flac`** — a `trigger=release` hammer-release noise whose `key=40`
     * makes it a one-key-wide region, narrower than the three-key note regions it competes with. With the filter: `C4v1.flac` … `C4v16.flac`, one per velocity layer.
     */
    const regions = parseSfz(salamander!.text);
    const switchDefault = declaredSwitchDefault(regions);
    for (const velocity of [1, 20, 64, 100, 127]) {
      const chosen = regionsForNote(regions, 60, velocity, 1, { switchDefault });
      expect(chosen.length, `velocity ${velocity}: note 60 found no region`).toBeGreaterThan(0);
      expect(chosen.map((region) => region.sample), `velocity ${velocity}: a key-release noise answered a key press`).toEqual(
        expect.not.arrayContaining([expect.stringMatching(/^rel\d+/)])
      );
      for (const region of chosen) expect(region.trigger, `velocity ${velocity}: sample ${region.sample}`).toBe("attack");
    }
  });

  it("resolves MIDI 60 to a piano sample, and never to a hammer-release noise", () => {
    /**
     * The audit's reading, and the one line that states it: *"MIDI 60 播的是榔头噪音 `Samples/rel40.flac`，不是钢琴音色"*. With the filter removed this returns
     * `rel40.flac` — measured, and the red/green pair for the whole change.
     */
    const asset = { assetId: "salamander-grand", sfz: { url: SALAMANDER_SFZ, path: SALAMANDER.sfz! } };
    const resolution = resolveInstrumentNote(asset, salamander!.text, 60, { velocity: 100 });
    expect(resolution.ok, resolution.reason).toBe(true);
    expect(resolution.note!.samplePath).toMatch(/^C4v\d+\.flac$/);
    expect(resolution.note!.samplePath).not.toMatch(/^rel\d+/);
  });

  it("still answers a note the velocity layers cover, at every velocity, and never with a release sample", () => {
    /**
     * Every velocity is resolved rather than the one the audit named, because a filter that removed the release noise and then fell through to nothing at some
     * velocity would be a different silent defect. The sixteen layers are `lovel`/`hivel` pairs 1–26 … 121–127, so the answers must be sixteen *different* recorded
     * takes of the same key.
     */
    const asset = { assetId: "salamander-grand", sfz: { url: SALAMANDER_SFZ, path: SALAMANDER.sfz! } };
    const resolved = new Map<number, string>();
    for (const velocity of [1, 26, 27, 34, 35, 50, 64, 80, 96, 104, 113, 121, 127]) {
      const resolution = resolveInstrumentNote(asset, salamander!.text, 60, { velocity });
      expect(resolution.ok, `velocity ${velocity}: ${resolution.reason}`).toBe(true);
      expect(resolution.note!.samplePath, `velocity ${velocity} chose a release sample`).not.toMatch(/^rel\d+/);
      expect(resolution.note!.samplePath).toMatch(/^C4v\d+\.flac$/);
      resolved.set(velocity, resolution.note!.samplePath);
    }
    // Soft and loud are different recordings, so the filter did not flatten the velocity layers into one.
    expect(resolved.get(1)).not.toBe(resolved.get(127));
  });

  it("keeps the release regions in the parsed file, so a caller can see what the library holds", () => {
    /**
     * The filter is a **preference at the note-on question**, not a deletion from the parse. The file's 157 `trigger=release` regions are still there — 157 of the
     * 1 121 regions this parse produces — and `noteOnTrigger` is the one predicate that says which of them may sound.
     */
    const regions = parseSfz(salamander!.text);
    const byTrigger = new Map<string, number>();
    for (const region of regions) byTrigger.set(region.trigger!, (byTrigger.get(region.trigger!) ?? 0) + 1);
    expect(byTrigger.get("release")).toBe(TRIGGER_CENSUS["salamander-grand"].regions.byTrigger.release);
    expect(regions.filter(noteOnTrigger).length).toBe(regions.length - byTrigger.get("release")!);
  });
});

// ---------------------------------------------------------------------------------------------
// ③ the whole-corpus census: the next library using `trigger` cannot arrive silently
// ---------------------------------------------------------------------------------------------

/** Every `.sfz`／`.txt`／`.ariax` file the entry declares — the corpus the census is taken over. */
const corpusFiles = (entryId: string) => manifest.entries.find((entry) => entry.id === entryId)!.files.filter((file) => /\.(sfz|txt|ariax)$/i.test(file.path));

const ASSIGNMENT = /(?<![\w$])trigger\s*=\s*([^\s]+)/g;

/**
 * Every `trigger=` in the entry's declared text files, **as written** — including one written inside a `<global>` that no region inherits. That is deliberate: the census
 * is a census of the *corpus*, so a file that mentions the opcode is found whether or not this run agrees on its scope.
 *
 * A file that could not be read is returned as a failure rather than skipped, so a partial network is a named failure instead of a smaller total. The fetches run with a
 * **bounded window of 8**, which is `expandRemoteIncludes`'s own compromise and was measured there: all-at-once gets a shared CI egress throttled, fully sequential is
 * 230 round trips of waiting.
 */
async function censusOf(entryId: string): Promise<{ counts: Record<string, number>; files: string[]; failures: string[] }> {
  const counts: Record<string, number> = {};
  const files: string[] = [];
  const failures: string[] = [];
  const declared = corpusFiles(entryId);
  const window = 8;
  for (let start = 0; start < declared.length; start += window) {
    await Promise.all(
      declared.slice(start, start + window).map(async (file) => {
        const url = sourceSfzUrl(manifest, entryId, file.path)!;
        let text: string;
        try {
          text = await fetchText(url);
        } catch (error) {
          failures.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
          return;
        }
        const hits = [...text.matchAll(ASSIGNMENT)].map((match) => match[1]!.trim().toLowerCase());
        if (hits.length === 0) return;
        files.push(file.path);
        for (const hit of hits) counts[hit] = (counts[hit] ?? 0) + 1;
      })
    );
  }
  return { counts, files: files.sort(), failures };
}

/** One crawl of the libraries the census names, in parallel with a bounded window so the total stays a few seconds rather than a few minutes. */
const CENSUS_LIBRARIES = Object.keys(TRIGGER_CENSUS);
const live = await Promise.all(CENSUS_LIBRARIES.map(async (entryId) => ({ entryId, ...(await censusOf(entryId)) })));
/** Nothing fetched at all is a missing network; *something* failing while others succeed is a real failure and is asserted below. */
const offline = live.every((library) => library.files.length === 0 && library.failures.length > 0);

describe.skipIf(offline)("the whole-corpus trigger census", () => {
  it("read every corpus file it is about to make a claim over, and names the ones that are genuinely absent", () => {
    /**
     * 48 of the 1 714 declared text files are 404 at their pinned address — 40 in `karoryfer-meatbass` and 7 in `karoryfer-emilyguitar` (the two libraries the audit
     * could not measure either), plus one empty text file in `vcsl`. Those are **named and counted**, not waved through: a failure anywhere else is a test failure, and
     * the two libraries the census has no claim about are the two the manifest names as unreadable.
     */
    const failures = live.flatMap((library) => library.failures.map((failure) => `${library.entryId} :: ${failure}`));
    const byLibrary = new Map<string, number>();
    for (const library of live) byLibrary.set(library.entryId, library.failures.length);
    expect(
      Object.fromEntries([...byLibrary].filter(([, count]) => count > 0)),
      "these files did not fetch; the census says only karoryfer-meatbass and karoryfer-emilyguitar are absent, so anything else is a real failure rather than a missing network"
    ).toEqual(TRIGGER_CENSUS_UNREADABLE);
    expect(failures.filter((failure) => /meatbass|emilyguitar/.test(failure)).length).toBe(failures.length);
  });

  it("matches the pinned census value for value, library for library — a new `trigger` cannot arrive unnoticed", () => {
    /**
     * ⭐ **This is the criterion §② of the work order asks for.** The census in `triggerCensus.ts` is the measured state of the whole corpus; this re-measures it live.
     * A library that gains a `trigger`, a library that gains a **new value**, and a count that moves all fail here, and the failure names the library and the file. The
     * repair is to read the change and update the census, which is the point — the reading cannot drift without somebody deciding it should.
     */
    const problems: string[] = [];
    for (const library of live) {
      const pinned = TRIGGER_CENSUS_ROWS[library.entryId]!;
      const pinnedFiles = [...(pinned.files ?? [])].sort();
      if ([...library.files].sort().join(", ") !== pinnedFiles.join(", ")) {
        problems.push(`${library.entryId}: files with \`trigger=\` are now [${[...library.files].sort().join(", ")}], the census says [${pinnedFiles.join(", ")}]`);
      }
      for (const value of new Set([...Object.keys(pinned.textual), ...Object.keys(library.counts)])) {
        const want = (pinned.textual as Record<string, number>)[value] ?? 0;
        const got = library.counts[value] ?? 0;
        if (want !== got) problems.push(`${library.entryId}: \`trigger=${value}\` appears ${got} time(s) in the corpus and the census says ${want}`);
      }
    }
    expect(problems, "the corpus and the pinned census disagree; read the change and update `triggerCensus.ts` rather than the other way round").toEqual([]);
  });

  it("refuses to let a library outside the census use `trigger` at all", async () => {
    /**
     * The other half of the same guard, and it is a **crawl rather than a roster**: every pinned library that is not in `TRIGGER_CENSUS` has its declared `.sfz`／`.txt`
     * files read, and **any** `trigger=` in them fails — because such a library would otherwise arrive with no census row to disagree with. Two entries in the corpus
     * have no `repo`/`pin` at all (`freepats-drawbar-organ`, `freepats-percussive-organ`, 2 text files each); their bytes are addressed through the mirror rather than a
     * pin, so they are outside this crawl and named here instead of being silently absent from it.
     *
     * The claim is only meaningful if there is something outside the census to check, so the count of libraries actually crawled is asserted too.
     */
    const pinned = new Set(CENSUS_LIBRARIES);
    const outside = manifest.entries.filter((entry) => entry.repo !== undefined && entry.pin !== undefined && !pinned.has(entry.id));
    const withText = outside.filter((entry) => corpusFiles(entry.id).length > 0);
    expect(withText.length, "every pinned library is now in the census, so this guard has nothing to check").toBeGreaterThan(10);
    const problems: string[] = [];
    for (const entry of withText) {
      const { counts, files } = await censusOf(entry.id);
      if (files.length > 0) problems.push(`${entry.id} writes \`trigger=\` in [${files.join(", ")}] and has no census row`);
      void counts;
    }
    expect(problems, "these libraries are not in the trigger census, so nothing would notice one of them starting to use `trigger`").toEqual([]);
    /**
     * A **timeout, not a retry**: the crawl is ~2 300 HTTP requests (1 666 for the census libraries and ~640 for the ones outside it), and the bounded window makes that
     * tens of seconds against `raw.githubusercontent.com`. A flaky measurement would be worse than a slow one — this project has learned that twice — so the budget is
     * named rather than the work made cleverer.
     */
  }, 180_000);

  it("pins the values the specification lists, and records that `last` is not one of them", () => {
    /**
     * The work order names `last` among the values to look for. It is **not** on <https://sfzformat.com/opcodes/trigger/>, whose table reads
     * *"attack, release, first, legato"* for SFZ v1 with `release_key` added under SFZ v2, and sfizz's enum is the same five
     * (`enum class Trigger { attack = 0, release, release_key, first, legato };`, `src/sfizz/Defaults.h:42`). So the pinned vocabulary has five members and `last` is
     * asserted **absent** rather than quietly added.
     */
    expect([...TRIGGER_VALUES].sort()).toEqual(["attack", "first", "legato", "release", "release_key"]);
    expect((TRIGGER_VALUES as readonly string[]).includes("last")).toBe(false);
  });

  it("names every library that uses the release family, which is what a key-release noise would come from", () => {
    /**
     * The audit's sample was one library; this is the full corpus, and it finds **five** libraries writing `trigger=release` and one writing `trigger=release_key`:
     * `salamander-grand`, `vcsl`, `karoryfer-bear-sax`, `karoryfer-black-and-blue-basses` and `freepats-button-accordion-hn` (release), and
     * `virtuosity-drums-basic` (release_key). Only Salamander resolved a note-on to one of them — the others' release regions lose the narrowest-range comparison to a
     * note region — which is why the audit's spot-check of 35 libraries found one audible defect and this census is the stronger claim.
     */
    const releaseLibraries = Object.entries(TRIGGER_CENSUS_ROWS)
      .filter(([, row]) => (row.textual.release ?? 0) > 0 || (row.textual.release_key ?? 0) > 0)
      .map(([id]) => id)
      .sort();
    expect(releaseLibraries).toEqual(["freepats-button-accordion-hn", "karoryfer-bear-sax", "karoryfer-black-and-blue-basses", "salamander-grand", "vcsl", "virtuosity-drums-basic"]);
    const legatoLibraries = Object.entries(TRIGGER_CENSUS_ROWS)
      .filter(([, row]) => (row.textual.legato ?? 0) > 0)
      .map(([id]) => id)
      .sort();
    expect(legatoLibraries).toEqual([
      "aliexpress-erhu",
      "discord-gm-sitar",
      "ixox-flute",
      "karoryfer-272-merry-orks",
      "karoryfer-bear-sax",
      "karoryfer-bigcat-cello",
      "karoryfer-squidpipes",
      "mtg-solo-sax",
      "sonatina-brass",
    ]);
  });
});

/** A type-level reminder that the census rows are the five values plus what the parser derived; `satisfies` in the fixture file keeps the two in step. */
export type { TriggerValue };
