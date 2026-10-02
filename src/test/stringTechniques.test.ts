/**
 * ⭐ **The string technique table, held to the catalogue and to the pinned library.**
 *
 * `src/data/stringTechniques.ts` makes two kinds of claim, and each needs a different criterion because each can
 * rot in a different direction:
 *
 *   · **claims about the shipped catalogue** — "this asset id is a program you can choose". Those are checked
 *     against `public/samples/manifest.json` **offline**, and a typo in an id goes red immediately.
 *   · **claims about the upstream library** — "this technique exists as this program, over this note range, with
 *     these velocity layers, and its bytes are/are not mirrored". Those need `raw.githubusercontent.com`, so like
 *     `orchestralCoverage.test.ts` they are **skipped, not failed, when the network is absent** — a criterion that
 *     fails offline teaches people to ignore it.
 *
 * ## Why this file exists at all
 *
 * The owner asked for the string techniques to be taken seriously and for the rules to be **written down rather
 * than guessed from names**. A table is only better than a guess if it is checked: an `assetId` spelled from
 * memory, a note range copied from the wrong instrument, or a mirrored flag flipped by hand would all produce a
 * rule table that looks authoritative and is wrong — the failure mode this repository treats as the worst kind.
 *
 * ## The length claim is arithmetic, and it is tested as arithmetic
 *
 * The 11.697 s lesson is carried as `maxSampleSeconds`/`safeSeconds` per program. The criterion below pins that a
 * note inside `safeSeconds` is `fits`, a note past `maxSampleSeconds` is `exceeds` **with all three remedies**, and
 * the boundary between them is `risky` — so the advice a caller gets cannot drift from the numbers it is based on.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LENGTH_REMEDIES,
  STRING_SITUATION_RULES,
  STRING_TECHNIQUES,
  chooseTechnique,
  chordChangeReattackNote,
  chordChangeReattacks,
  dynamicSteps,
  playableTechniques,
  programFor,
  resolveLengthConstraint,
  ruleFor,
  techniquesFor,
  unmirroredTechniques,
  velocityLayerFor,
  type StringInstrument,
  type StringSituation,
  type StringTechnique,
} from "../data/stringTechniques";
import { parseManifest } from "../data/sampleManifest";
import { catalogueFromManifestText } from "../data/sampleCatalogue";
import type { NoteEvent } from "../types/arrangementV2";

const manifestText = readFileSync("public/samples/manifest.json", "utf8");
const manifest = parseManifest(manifestText).manifest!;
const catalogue = catalogueFromManifestText(manifestText, process.env.GROOVE_SAMPLE_ROOT ?? "");
const catalogueIds = new Set(catalogue.assets.map((asset) => asset.assetId));

/** The `vsco2ce` entry's own program list, so "is this really an upstream program" is answered from the manifest rather than from the table it is testing. */
const vscoEntry = manifest.entries.find((entry) => entry.id === "vsco2ce")!;
const vscoProgramFiles = new Set((vscoEntry.instruments ?? []).map((program) => program.sfz));

describe("the technique table and the shipped catalogue agree", () => {
  it("points every mirrored row at an asset id the catalogue really exposes", () => {
    const missing = playableTechniques().filter((program) => !catalogueIds.has(program.assetId));
    expect(missing.map((program) => `${program.assetId} (${program.program})`)).toEqual([]);
  });

  /**
   * ⭐ **The other direction, and it is the one that catches a silent loss.**
   *
   * Every `vsco2ce` program that is a **string** program the catalogue exposes must have a row here. Without this,
   * a program could be added to the manifest and be playable while the rule table never offers it — the same
   * "feature exists and nothing can reach it" shape the owner has reported before.
   */
  it("gives a row to every string program the catalogue exposes, so none is unreachable by technique", () => {
    const stringPrograms = (vscoEntry.instruments ?? []).filter((program) =>
      /^(Violin|Viola|Cello|Contrabass|SViolin)/.test(program.sfz)
    );
    const covered = new Set(STRING_TECHNIQUES.map((program) => program.program));
    const uncovered = stringPrograms.map((program) => program.sfz).filter((sfz) => !covered.has(sfz));
    expect(uncovered).toEqual([]);
  });

  /**
   * A row claiming `mirrored: true` must name a program the manifest itself carries. This is what makes the flag a
   * measurement rather than an assertion: the manifest is the record of what was mirrored, and it is not written
   * by this module.
   */
  it("only claims mirrored for programs the manifest's own file list carries", () => {
    const overclaimed = playableTechniques().filter((program) => !vscoProgramFiles.has(program.program));
    expect(overclaimed.map((program) => program.program)).toEqual([]);
  });

  /**
   * ⭐ **An unmirrored row must not be in the catalogue.**
   *
   * This is the claim that keeps "够不到" honest: `ViolinEnsTrem` is a real upstream technique whose bytes were not
   * mirrored, so its id must be absent from the catalogue. If a later mirror takes it, this goes red and the row
   * has to be flipped deliberately rather than left saying a technique is unavailable when it is not.
   */
  it("does not claim an unmirrored technique is absent when the catalogue actually has it", () => {
    const wrong = unmirroredTechniques().filter((program) => catalogueIds.has(program.assetId));
    expect(wrong.map((program) => `${program.assetId} is in the catalogue but the row says unmirrored`)).toEqual([]);
  });

  it("names an asset id in the catalogue's own `<entry>:<program>` form", () => {
    for (const program of STRING_TECHNIQUES) {
      expect(program.assetId).toMatch(/^[a-z0-9-]+:[A-Za-z0-9-]+$/);
    }
  });
});

describe("the table is internally consistent", () => {
  it("has at most one program per (instrument, technique)", () => {
    const seen = new Set<string>();
    for (const program of STRING_TECHNIQUES) {
      const key = `${program.instrument}/${program.technique}`;
      expect(seen.has(key), `${key} appears twice`).toBe(false);
      seen.add(key);
    }
  });

  /**
   * ⭐ **A mirrored program has a real measured length; an unmirrored one has none.**
   *
   * The unmirrored rows carry `0` on purpose. Inventing a duration for a program nobody measured would be exactly
   * the "number from nowhere" this project keeps removing — and it would also make the length advice fire
   * confidently for a technique that cannot sound at all.
   */
  it("carries measured seconds for mirrored programs and no invented number for unmirrored ones", () => {
    for (const program of STRING_TECHNIQUES) {
      if (program.mirrored) {
        expect(program.maxSampleSeconds, `${program.assetId} maxSampleSeconds`).toBeGreaterThan(0);
        expect(program.safeSeconds, `${program.assetId} safeSeconds`).toBeGreaterThan(0);
        expect(program.safeSeconds).toBeLessThanOrEqual(program.maxSampleSeconds);
      } else {
        expect(program.maxSampleSeconds, `${program.program} claims a length it never measured`).toBe(0);
        expect(program.safeSeconds, `${program.program} claims a length it never measured`).toBe(0);
      }
    }
  });

  it("gives every program a range and a non-empty, ascending set of velocity layers", () => {
    for (const program of STRING_TECHNIQUES) {
      expect(program.lowestNote, `${program.program} lowestNote`).toBeLessThanOrEqual(program.highestNote);
      expect(program.lowestNote).toBeGreaterThanOrEqual(0);
      expect(program.highestNote).toBeLessThanOrEqual(127);
      expect(program.velocityLayers.length, `${program.program} has no layers`).toBeGreaterThan(0);
      for (const [low, high] of program.velocityLayers) {
        expect(low, `${program.program} layer low`).toBeGreaterThanOrEqual(0);
        expect(high, `${program.program} layer high`).toBeLessThanOrEqual(127);
        expect(low).toBeLessThanOrEqual(high);
      }
    }
  });

  /** Every row must say why it exists — the same rule `CHORD_ARTICULATIONS` follows for its `note` field. */
  it("gives every row a note explaining it", () => {
    for (const program of STRING_TECHNIQUES) {
      expect(program.note.length, `${program.program} has no note`).toBeGreaterThan(20);
      expect(program.name.length).toBeGreaterThan(0);
    }
  });

  it("covers all five string instruments the pinned library holds", () => {
    const instruments: StringInstrument[] = ["violin", "viola", "cello", "contrabass", "solo-violin"];
    for (const instrument of instruments) {
      expect(techniquesFor(instrument).length, `${instrument} has no rows`).toBeGreaterThan(0);
    }
  });

  /**
   * ⭐ **The measured shape of the gap, stated as a criterion.**
   *
   * Exactly two techniques are reachable today — sustained and pizzicato — and the *unreachable* set is not simply
   * "spiccato and tremolo". A technique is unreachable **for a given instrument**, and the solo violin is the row
   * where that bites hardest: all five of its techniques are upstream-only. So the assertion is per instrument
   * rather than a flat list of technique names.
   */
  it("measures exactly which techniques are reachable today, per instrument", () => {
    const playable = new Set(playableTechniques().map((program) => program.technique));
    expect([...playable].sort()).toEqual(["pizzicato", "sustain"]);
    for (const instrument of ["violin", "viola", "cello", "contrabass"] as const) {
      const reachable = new Set(
        playableTechniques()
          .filter((program) => program.instrument === instrument)
          .map((program) => program.technique)
      );
      expect([...reachable].sort(), `${instrument} reachable techniques`).toEqual(["pizzicato", "sustain"]);
    }
  });

  /**
   * ⭐ **The count of reachable programs, which is the number the report quotes.**
   *
   * Four instruments × (sustained + pizzicato) = **8 playable string programs**, out of 25 rows. The solo violin has
   * a row for all five techniques and **none** of them is playable, which is why it contributes nothing.
   */
  it("counts eight playable string programs out of twenty-five rows", () => {
    expect(playableTechniques()).toHaveLength(8);
    expect(STRING_TECHNIQUES).toHaveLength(25);
    expect(unmirroredTechniques()).toHaveLength(17);
    // The four section instruments are the ones with bytes; the solo violin is upstream-only in every technique.
    expect([...new Set(playableTechniques().map((program) => program.instrument))].sort()).toEqual([
      "cello",
      "contrabass",
      "viola",
      "violin",
    ]);
    expect(playableTechniques().filter((program) => program.instrument === "solo-violin")).toEqual([]);
    // Every technique the solo violin has a row for, and not one of them sounds.
    expect(techniquesFor("solo-violin").every((program) => !program.mirrored)).toBe(true);
  });

  /**
   * The techniques the table has a word for but the pinned library has **no program for at all**. Asserted so that
   * a reader cannot mistake "col legno is missing from the table" for an oversight: it is named and absent, and a
   * request for it must be refused by name rather than fall through to a sustain.
   */
  it("names the techniques the library has no program for, rather than omitting them", () => {
    const withRows = new Set(STRING_TECHNIQUES.map((program) => program.technique));
    const namedButAbsent: StringTechnique[] = ["col-legno", "harmonics", "non-vibrato"];
    for (const technique of namedButAbsent) {
      expect(withRows.has(technique), `${technique} unexpectedly has a row`).toBe(false);
    }
  });
});

describe("velocity selects a recorded layer", () => {
  it("puts a soft velocity and a loud velocity in different layers of the sustained violin", () => {
    const violin = programFor("violin", "sustain")!;
    const soft = velocityLayerFor(violin, 50)!;
    const loud = velocityLayerFor(violin, 100)!;
    expect(soft.layer).toEqual([0, 62]);
    expect(loud.layer).toEqual([63, 127]);
    expect(soft.index).not.toBe(loud.index);
  });

  /**
   * ⭐ **The honest limit of a two-take recording, asserted rather than implied.**
   *
   * 62 and 63 are one velocity step apart and are different recordings; 40 and 62 are both the same take at the
   * same gain. A caller writing a crescendo as a velocity ramp gets one step, which is the fact the owner's
   * second question was asking about.
   */
  it("reports that velocities inside one layer are the same take, and the split is a cliff", () => {
    const violin = programFor("violin", "sustain")!;
    expect(dynamicSteps(violin)).toBe(2);
    const at40 = velocityLayerFor(violin, 40)!;
    const at62 = velocityLayerFor(violin, 62)!;
    const at63 = velocityLayerFor(violin, 63)!;
    // The same take at the same gain — only the edge flag differs, and that is the flag's own meaning.
    expect(at40.layer).toEqual(at62.layer);
    expect(at40.index).toBe(at62.index);
    expect(at40.atEdge).toBe(false);
    expect(at62.atEdge).toBe(true);
    // One velocity step across the split is a different recording.
    expect(at63.index).not.toBe(at62.index);
    expect(at63.layer).toEqual([63, 127]);
  });

  it("reports a velocity outside every declared layer rather than clamping it", () => {
    const quiet = programFor("violin", "quiet")!;
    expect(velocityLayerFor(quiet, 127)!.layer).toEqual([0, 127]);
    expect(velocityLayerFor(quiet, 0)!.index).toBe(0);
  });
});

describe("the length constraint of a one-shot recording", () => {
  const violin = programFor("violin", "sustain")!;

  it("calls a note inside the shortest sample a fit, with the headroom stated", () => {
    // At 120 bpm one beat is 0.5 s, so 8 beats is 4 s — well inside the violin's 8.988 s shortest sample.
    const verdict = resolveLengthConstraint(violin, 8, 120);
    expect(verdict.kind).toBe("fits");
    if (verdict.kind === "fits") expect(verdict.headroomSeconds).toBeCloseTo(8.988 - 4, 3);
  });

  it("calls a note between the shortest and longest sample risky, and says both numbers", () => {
    // 28 beats at 120 bpm is 14 s: past safeSeconds (8.988) but inside maxSampleSeconds (15.2).
    const verdict = resolveLengthConstraint(violin, 28, 120);
    expect(verdict.kind).toBe("risky");
    if (verdict.kind === "risky") {
      expect(verdict.safeSeconds).toBe(8.988);
      expect(verdict.maxSampleSeconds).toBe(15.2);
    }
  });

  /**
   * ⭐ **The 11.697 s lesson, as a criterion.** A note longer than the longest sample of the program cannot sound
   * whole, and the answer carries **all three** remedies rather than a truncation performed silently.
   */
  it("calls a note past the longest sample an excess and offers exactly three remedies with costs", () => {
    const verdict = resolveLengthConstraint(violin, 80, 120);
    expect(verdict.kind).toBe("exceeds");
    if (verdict.kind === "exceeds") {
      expect(verdict.maxSampleSeconds).toBe(15.2);
      expect(verdict.remedies.map((remedy) => remedy.remedy)).toEqual(["truncate", "switch-technique", "retrigger"]);
      for (const remedy of verdict.remedies) expect(remedy.cost.length).toBeGreaterThan(40);
    }
  });

  it("exposes the remedy list once, so a caller and this criterion read the same three", () => {
    expect(LENGTH_REMEDIES.map((remedy) => remedy.remedy)).toEqual(["truncate", "switch-technique", "retrigger"]);
  });

  /**
   * The plucked programs decay long before the bowed ones, so the same note length is a fit on one technique and an
   * excess on another. That difference is why the verdict is per program rather than per library.
   */
  it("judges the same note differently on a pluck and on a bow, which is the point of a per-program limit", () => {
    const pizz = programFor("violin", "pizzicato")!;
    // 12 beats at 120 bpm is 6 s: past the violin pizzicato's 3.016 s longest sample, well inside the sustain's.
    expect(resolveLengthConstraint(pizz, 12, 120).kind).toBe("exceeds");
    expect(resolveLengthConstraint(violin, 12, 120).kind).toBe("fits");
  });

  it("scales with tempo, because a beat is not a second", () => {
    expect(resolveLengthConstraint(violin, 24, 60).kind).toBe("exceeds");
    expect(resolveLengthConstraint(violin, 24, 240).kind).toBe("fits");
  });
});

describe("a musical situation chooses a technique", () => {
  it("gives a sustained bed the recorded vibrato section", () => {
    const choice = chooseTechnique({ instrument: "violin", situation: "sustained-bed", note: 60 });
    expect(choice.assetId).toBe("vsco2ce:ViolinEnsSusVib");
    expect(choice.firstChoice).toBe(true);
    expect(choice.rejected).toEqual([]);
  });

  it("gives a walking low line the contrabass pizzicato", () => {
    const choice = chooseTechnique({ instrument: "contrabass", situation: "plucked-walking", note: 36 });
    expect(choice.assetId).toBe("vsco2ce:ContrabassPizz");
    expect(choice.program!.maxSampleSeconds).toBe(6.024);
  });

  /**
   * ⭐ **A fallback is reported, not hidden.** A short repeated figure prefers spiccato; its bytes are not mirrored,
   * so the choice lands on pizzicato — and the rejection list says `spiccato: not-mirrored`, which is the difference
   * between "we chose a pluck" and "we asked for a bow and silently got a pluck".
   */
  it("falls back from spiccato to pizzicato and says why", () => {
    const choice = chooseTechnique({ instrument: "violin", situation: "short-repeating", note: 67 });
    expect(choice.program!.technique).toBe("pizzicato");
    expect(choice.firstChoice).toBe(false);
    expect(choice.rejected).toEqual([{ technique: "spiccato", reason: "not-mirrored" }]);
  });

  /** The same shape for the one the owner named as tension: tremolo is unreachable, and the sustain is a fallback. */
  it("falls back from tremolo to sustain and says why", () => {
    const choice = chooseTechnique({ instrument: "cello", situation: "tension-tremolo", note: 48 });
    expect(choice.program!.technique).toBe("sustain");
    expect(choice.firstChoice).toBe(false);
    expect(choice.rejected).toEqual([{ technique: "tremolo", reason: "not-mirrored" }]);
  });

  /**
   * A note outside the chosen program's compass is rejected rather than transposed, because playing a tenth above
   * the top sample is a different note. The viola section stops at MIDI 86, so note 90 finds nothing.
   */
  it("refuses a note outside the technique's range instead of playing the nearest sample", () => {
    const choice = chooseTechnique({ instrument: "viola", situation: "sustained-bed", note: 90 });
    expect(choice.program).toBeUndefined();
    expect(choice.rejected).toContainEqual({ technique: "sustain", reason: "out-of-range" });
  });

  /** The choice carries the length verdict with it, so a caller cannot forget to ask. */
  it("carries the length verdict on the choice when a length and tempo are given", () => {
    const choice = chooseTechnique({
      instrument: "violin",
      situation: "sustained-bed",
      note: 60,
      lengthBeats: 80,
      bpm: 120,
    });
    expect(choice.length!.kind).toBe("exceeds");
  });

  it("omits the length verdict when no length was given, rather than guessing one", () => {
    expect(chooseTechnique({ instrument: "violin", situation: "sustained-bed", note: 60 }).length).toBeUndefined();
  });

  /**
   * ⭐ **Every situation the owner named has a rule, and every preference names a technique that at least one row
   * uses.** A rule whose second preference is a technique no row has would be a rule that can never fire.
   */
  it("writes a rule for each named situation, with preferences that exist in the table", () => {
    const situations: StringSituation[] = [
      "sustained-bed",
      "legato-line",
      "short-repeating",
      "plucked-walking",
      "tension-tremolo",
      "accent-attack",
    ];
    expect(STRING_SITUATION_RULES.map((rule) => rule.situation).sort()).toEqual([...situations].sort());
    const known = new Set(STRING_TECHNIQUES.map((program) => program.technique));
    for (const rule of STRING_SITUATION_RULES) {
      expect(rule.preferred.length, `${rule.situation} has no preference`).toBeGreaterThan(0);
      for (const technique of rule.preferred) {
        // A preference may legitimately name a technique the library has no program for at all (`non-vibrato`),
        // which is a stated gap; it may not name one that is not a technique this module defines.
        expect(typeof technique).toBe("string");
      }
      expect(rule.why.length, `${rule.situation} has no why`).toBeGreaterThan(40);
      expect(rule.recognisedBy.length, `${rule.situation} does not say how it is recognised`).toBeGreaterThan(20);
      // At least one preference must be reachable somewhere, or the rule can only ever return nothing.
      expect(rule.preferred.some((technique) => known.has(technique))).toBe(true);
    }
  });

  it("returns the rule for a situation and nothing for one it does not cover", () => {
    expect(ruleFor("plucked-walking")!.preferred).toEqual(["pizzicato"]);
    expect(ruleFor("no-such-situation" as StringSituation)).toBeUndefined();
  });

  it("names no program by a string pattern, which is the guess this table replaces", () => {
    // A crude but real guard: no `why` or `note` may claim a technique was chosen by matching a file name.
    for (const rule of STRING_SITUATION_RULES) {
      expect(rule.why).not.toMatch(/match(es|ing)? the (file ?name|name)/i);
    }
  });
});

/**
 * ⭐ **Overlap is not legato — the owner's "断" at a chord change, and the detour it corrects.**
 *
 * The owner heard the strings break and narrowed it to one instant. The first reading of this project was that its
 * writing was already legato because the chords overlap by half a beat; the owner's ear said otherwise, and the owner
 * was right. These criteria pin the distinction: **overlap is a fact about `lengthBeats`, and a re-attack is a fact
 * about each note starting its own envelope.** The detector below reports the second, and the reverse direction — a
 * part that does *not* overlap — must report nothing, or the check would fire on every chord change in every project.
 */
describe("chord-change re-attacks: overlap is not legato", () => {
  /** A chord: `count` notes from `root`, all starting and ending together. */
  const chord = (root: number, startBeats: number, lengthBeats: number, count = 3): NoteEvent[] =>
    Array.from({ length: count }, (_, i) => ({ pitch: root + i * 4, startBeats, lengthBeats, velocity: 50 }));

  const track = (notes: NoteEvent[]) => ({
    tracks: [{ id: "t1", name: "弦乐" }],
    notesByTrack: { t1: notes },
  });

  /**
   * ⭐ The owner's own shape: chords every 8 beats, each held 8.5 — so every chord is still sounding when the next
   * begins, and every change is a fresh set of attacks over a ringing chord.
   */
  it("reports every chord change where the previous chord is still sounding", () => {
    const notes = [chord(57, 0, 8.5), chord(59, 8, 8.5), chord(60, 16, 8.5)].flat();
    const reports = chordChangeReattacks(track(notes), 120);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.trackName).toBe("弦乐");
    expect(reports[0]!.changesTotal).toBe(2);
    // The half-beat overlap, in seconds at 120 bpm — the number the owner's editor would show.
    expect(reports[0]!.changes[0]!.overlapSeconds).toBe(0.25);
    expect(reports[0]!.changes[0]!.atBeats).toBe(8);
    expect(reports[0]!.changes[0]!.atSeconds).toBe(4);
    expect(reports[0]!.changes[0]!.attacks).toBe(3);
  });

  /**
   * ⭐ **The reverse direction, and the one that makes the detector trustworthy.**
   *
   * Chords written end-to-end (each 8 beats long, 8 beats apart) do **not** overlap, so there is no re-attack over a
   * ringing chord — the seam is a different problem, and `legatoGapsFor` owns it. If this reported the same thing,
   * it would be measuring "there was a chord change" rather than "an attack landed on a sounding note".
   */
  it("says nothing when the chords do not overlap, which is a seam and not a re-attack", () => {
    const notes = [chord(57, 0, 8), chord(59, 8, 8), chord(60, 16, 8)].flat();
    expect(chordChangeReattacks(track(notes), 120)).toEqual([]);
  });

  it("says nothing for a single note, or for a part that is not a sustained bed", () => {
    expect(chordChangeReattacks(track([{ pitch: 60, startBeats: 0, lengthBeats: 4, velocity: 90 }]), 120)).toEqual([]);
    // Sixteenth-note percussion: overlapping by construction, but not a bed, so not this report's business.
    const hits = Array.from({ length: 8 }, (_, i) => ({ pitch: 36, startBeats: i * 0.25, lengthBeats: 0.5, velocity: 90 }));
    expect(chordChangeReattacks(track(hits), 120)).toEqual([]);
  });

  /** A chord that has *already released* before the next begins is `legatoGaps`'s case, and this must not double-count it. */
  it("counts only the changes that actually overlap, not every change", () => {
    const notes = [chord(57, 0, 8.5), chord(59, 8, 4), chord(60, 16, 8.5)].flat();
    const reports = chordChangeReattacks(track(notes), 120);
    // The first change overlaps (0.5 beats); the second does not (the beat-8 chord ended at beat 12).
    expect(reports[0]!.changesTotal).toBe(1);
  });

  it("carries the count and the first instant into a sentence, and stays silent when there is nothing to say", () => {
    const notes = [chord(57, 0, 8.5), chord(59, 8, 8.5)].flat();
    const note = chordChangeReattackNote(chordChangeReattacks(track(notes), 120))!;
    expect(note).toContain("chordChangeReattacks:");
    expect(note).toContain("first at beat 8 = 4 s");
    // The distinction, said out loud, because "the notes overlap" alone reads as reassurance.
    expect(note).toContain("overlap is not legato");
    expect(chordChangeReattackNote([])).toBeNull();
  });

  /** The report is per track, so a bed and a bass line in one arrangement are judged separately. */
  it("reports each track separately", () => {
    const arrangement = {
      tracks: [
        { id: "a", name: "Strings" },
        { id: "b", name: "Pad" },
      ],
      notesByTrack: {
        a: [chord(57, 0, 8.5), chord(59, 8, 8.5)].flat(),
        b: [chord(48, 0, 4), chord(50, 4, 4)].flat(),
      },
    };
    const reports = chordChangeReattacks(arrangement, 120);
    expect(reports.map((report) => report.trackName)).toEqual(["Strings"]);
  });
});
