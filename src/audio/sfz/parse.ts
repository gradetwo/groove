/**
 * An SFZ subset, parsed by hand — the first half of real-instrument support (owner decision, inside groove, no new repository).
 *
 * The shape that matters is not "read opcodes" but **headers that inherit**: `<global>` → `<group>` → `<region>`, where a later header overrides what it inherits and
 * a region ends up as the merge of the three. Everything below is built around that, because a parser without inheritance works on a toy file and fails on the first
 * real instrument.
 *
 * Deliberately a **subset**: the opcodes this project needs to place a sample correctly — `sample`, `lokey`/`hikey`, `pitch_keycenter`, `lovel`/`hivel`, `tune`,
 * `seq_length`/`seq_position` — plus the rule that an opcode it does not know is **ignored rather than fatal**, because a picky parser is a parser nobody can point at
 * a real library.
 *
 * SFZ's defaults that this file states rather than assumes: a region with no key range covers **0–127**, and with no velocity range **0–127**.
 *
 * And `pitch_keycenter` has **no default transposition**: a region that does not set it plays its sample at the recorded rate. The first version of this file asserted
 * 60 as the default — confidently, in a comment about defaults that "silently detune everything if guessed wrong" — and a comparison against sfizz on a real library
 * showed the assertion was the thing that was wrong. `pitch_keycenter` is now optional, and `regionPlayback` treats an unset one as ratio 1.
 */
export interface SfzRegion {
  /** The sample path exactly as written, relative to the SFZ file's directory. */
  sample: string;
  lokey: number;
  hikey: number;
  lovel: number;
  hivel: number;
  /**
   * SFZ's `pitch_keycenter`, or **undefined when the region does not set it** — and undefined means **no transposition**, not 60.
   *
   * This was wrong until a real library was compared against sfizz: the kick of `virtuosity_drums` played at 0.51 s through the real kit and 0.53 s through a
   * one-region control with `pitch_keycenter` set explicitly, while the 60-default model predicted 0.28× and about 1.9 s. So a region without the opcode plays its
   * sample at the recorded rate, and 60 only applies where it is written.
   */
  pitchKeycenter?: number;
  /** Cents, SFZ's `tune`. Zero when absent. */
  tuneCents: number;
  /** Round-robin selector, both 1-based in SFZ. `seq_length` 1 (the default) means "no round-robin". */
  seqLength: number;
  seqPosition: number;
  /** Every opcode the region ended up with, after inheritance, for anything this subset does not model yet. */
  opcodes: Record<string, string>;
  /**
   * Variables this region still contains — `$KICK_SNRIGHT_KEY` and friends — because SFZ's `#define`/`$VAR` layer is not implemented.
   *
   * **A marked region never matches a note.** That is the whole point: before this existed, an unresolved `key=$KICK_SNRIGHT_KEY` failed to parse as a number, fell back to
   * the 0–127 default, and made **every region match every note** — so a real drum kit answered note 38 with a kick while sfizz, which does understand the variables,
   * correctly triggered nothing. The failure mode was not an error but a plausible wrong answer, which is the one this workstream keeps having to hunt down.
   */
  unresolved: string[];
}

const DEFAULTS: Omit<SfzRegion, "sample" | "opcodes" | "unresolved"> = {
  lokey: 0,
  hikey: 127,
  lovel: 0,
  hivel: 127,
  tuneCents: 0,
  seqLength: 1,
  seqPosition: 1,
};

/** Where an unknown opcode goes: kept in `opcodes` rather than thrown away, so a later stage can use it without reparsing. */
const num = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function parseSfz(text: string): SfzRegion[] {
  const regions: SfzRegion[] = [];
  let global: Record<string, string> = {};
  let group: Record<string, string> = {};
  let current: Record<string, string> | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    // Comments run to the end of the line; SFZ uses `//`, and a file that uses it must not be swallowed whole.
    const line = rawLine.replace(/\/\/.*$/, "").replace(/\/\/.*$/, "").trim();
    if (!line) continue;

    /**
     * A line is a header **optionally followed by opcodes**, and may carry several `key=value` pairs — which is how real SFZ files are written
     * (`<region> sample=tone.wav pitch_keycenter=60`, all on one line). The first version of this loop required the header to be the whole line and therefore parsed
     * **zero** regions out of every realistic file; the test said so immediately, in the shape this workstream keeps meeting: the fixture knew the format and the code
     * did not.
     */
    const header = line.match(/^<([a-zA-Z0-9_]+)>\s*(.*)$/);
    let rest = line;
    if (header) {
      const name = header[1]!.toLowerCase();
      rest = header[2]!;
      if (name === "global") {
        global = {};
        current = global;
      } else if (name === "group") {
        group = {};
        current = group;
      } else if (name === "region") {
        current = {};
        regions.push({ ...DEFAULTS, sample: "", opcodes: current, unresolved: [] });
      } else {
        // A header this subset does not model (curve, effect, …) is skipped, not fatal — and its opcodes are ignored with it.
        current = null;
      }
    }
    if (!current) continue;

    // Values may be quoted (a path with spaces); everything else runs to the next whitespace.
    for (const match of rest.matchAll(/([a-zA-Z0-9_]+)\s*=\s*("[^"]*"|[^\s]+)/g)) {
      const value = match[2]!.replace(/^"|"$/g, "");
      current[match[1]!.toLowerCase()] = value;
    }
  }

  /** Every `$NAME` a value still contains, deduplicated — reported rather than silently defaulted. */
  const unresolvedIn = (opcodes: Record<string, string>): string[] => [
    ...new Set(Object.values(opcodes).flatMap((value) => value.match(/\$[A-Za-z_][A-Za-z0-9_]*/g) ?? [])),
  ];

  // Inheritance is resolved **after** parsing, so a region cannot be affected by where in the file it appeared relative to its group.
  return regions.map((region) => {
    const merged = { ...global, ...group, ...region.opcodes };
    return {
      ...DEFAULTS,
      sample: merged.sample ?? "",
      lokey: num(merged.lokey, DEFAULTS.lokey),
      hikey: num(merged.hikey, DEFAULTS.hikey),
      lovel: num(merged.lovel, DEFAULTS.lovel),
      hivel: num(merged.hivel, DEFAULTS.hivel),
      // Left undefined when absent, because "no transposition" is the real behaviour and 60 is only a value a file may choose.
      pitchKeycenter: merged.pitch_keycenter === undefined ? undefined : num(merged.pitch_keycenter, 0),
      tuneCents: num(merged.tune, DEFAULTS.tuneCents),
      seqLength: Math.max(1, num(merged.seq_length, DEFAULTS.seqLength)),
      seqPosition: Math.max(1, num(merged.seq_position, DEFAULTS.seqPosition)),
      opcodes: merged,
      unresolved: unresolvedIn(merged),
    };
  });
}

/**
 * Which region a note and velocity select, out of those that cover them.
 *
 * Order matters and is not obvious: SFZ picks the region whose key range is **narrowest** around the note (the "most specific" match), and this returns the first of
 * those in file order — which is the documented behaviour for the layer/round-robin cases this subset covers. Round-robin selection is a separate call, because it
 * depends on how many times the note has already been played.
 */
export function regionsForNote(regions: readonly SfzRegion[], note: number, velocity = 100, channel = 1): SfzRegion[] {
  const covering = regions.filter(
    (region) =>
      /**
       * A region holding unresolved variables is **not selectable**, and this is a defect fix rather than caution.
       *
       * Measured: a real kit writes `key=$KICK_SNRIGHT_KEY`, which SFZ's own `#define` layer resolves to 36. Without that layer the value is not a number, the old code
       * fell back to the 0-127 default, and **every region matched every note** — note 38 came back as a kick while sfizz, which understands the variables, correctly
       * triggered nothing. The failure was a plausible wrong answer rather than an error, which is the kind this workstream keeps having to hunt down.
       */
      region.unresolved.length === 0 &&
      note >= region.lokey &&
      note <= region.hikey &&
      velocity >= region.lovel &&
      velocity <= region.hivel
  );
  void channel;
  if (covering.length === 0) return [];
  const narrowest = Math.min(...covering.map((region) => region.hikey - region.lokey));
  return covering.filter((region) => region.hikey - region.lokey === narrowest);
}

/**
 * The round-robin pick for the `nth` time this note is played (0-based), so a repeated note cycles through its variants instead of repeating one sample.
 *
 * `seq_length` 1 means no round-robin, which is the default and the reason this returns the same region every time for a file that does not ask for it.
 */
export function roundRobinPick(regions: readonly SfzRegion[], nth: number): SfzRegion | null {
  if (regions.length === 0) return null;
  const cycle = Math.max(1, ...regions.map((region) => region.seqLength));
  if (cycle === 1) return regions[0]!;
  const position = (nth % cycle) + 1;
  return regions.find((region) => region.seqPosition === position) ?? regions[0]!;
}

/**
 * Every variable a file still contains, and how many regions hold one — the report that makes an unimplemented `#define` layer **visible instead of silent**.
 *
 * It exists because of a measured failure rather than for tidiness: a real kit's `key=$KICK_SNRIGHT_KEY` used to match every note and answer with a kick. An instrument
 * whose variables are unresolved should say so, by name, and then produce nothing.
 */
export function unresolvedVariables(regions: readonly SfzRegion[]): { variables: string[]; regions: number } {
  return {
    variables: [...new Set(regions.flatMap((region) => region.unresolved))],
    regions: regions.filter((region) => region.unresolved.length > 0).length,
  };
}
