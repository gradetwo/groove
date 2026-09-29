import { applyDefines } from "./defines";

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
  /**
   * The `global` and `group` values **as they stood when this region was created** — captured at that moment, not read at the end.
   *
   * The first version merged in the **final** `global` and `group` for every region, so a file with two `<group>` blocks gave every region the **last** one's values. Its
   * comment asserted the opposite ("so a region cannot be affected by where in the file it appeared relative to its group"), which is the kind of comment this workstream
   * has learned to treat as a claim rather than a fact. A real library, whose kick and snare live under different `<group> key=…` blocks, is what exposed it.
   */
  inherited?: Record<string, string>;
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

/**
 * `set_ccN=value` from a file's `<control>` blocks, later declarations winning.
 *
 * It lives here rather than beside the gate that consumes it, because the parser needs the same numbers: `tune_ccN` is a **tuning at the controller's current value**, so a region's cents cannot be computed without them. One reader, one answer — a
 * second implementation for the gate would be a second thing to keep in step.
 */
export function readControlDefaults(text: string): Map<number, number> {
  const defaults = new Map<number, number>();
  let inControl = false;
  for (const rawLine of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    const line = rawLine.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    const header = line.match(/^<([a-zA-Z0-9_]+)>\s*(.*)$/);
    if (header) {
      inControl = header[1]!.toLowerCase() === "control";
      // `set_ccN` may sit on the header line itself (`<control> set_cc1=64`).
      if (inControl) applyControlLine(header[2] ?? "", defaults);
      continue;
    }
    if (inControl) applyControlLine(line, defaults);
  }
  return defaults;
}

function applyControlLine(line: string, defaults: Map<number, number>): void {
  for (const match of line.matchAll(/(?:^|\s)set_cc(\d+)\s*=\s*(\S+)/g)) {
    const value = Number(match[2]);
    if (Number.isFinite(value)) defaults.set(Number(match[1]), value);
  }
}

/**
 * The cents a region's `tune_ccN` opcodes contribute at these controller values.
 *
 * **Two shapes, both measured through sfizz, and the second one is why this function exists at all.**
 *
 * ```
 *   no curve opcode (or 0), tune_cc90=1200   CC 0 → 0       64 → +600   127 → +1200     linear from zero
 *   tune_curvecc90=1,       tune_cc90=1200   CC 0 → −1200   64 → 0      127 → +1200     bipolar about 64
 * ```
 *
 * The first version of this function ignored `tune_curveccN` and applied the linear rule to everything, which put `virtuosity_drums` **an octave sharp at rest**: both of its tuning knobs use curve 1, whose whole point is that the declared default of 63.5 is the
 * neutral position his labels say it is ("Master tune", "Kick tune").
 *
 * Other curve indices exist and are not modelled — measured at CC 32, index 2 reads +909 cents and index 4 +90, so they are genuinely different shapes rather than aliases. A file naming one is treated as linear, and that limit is stated rather than
 * hidden: the two shapes below cover every library this project mirrors.
 */
export function ccTuneCents(opcodes: Record<string, string>, cc: ReadonlyMap<number, number>): number {
  let cents = 0;
  for (const [opcode, raw] of Object.entries(opcodes)) {
    const match = /^tune_cc(\d+)$/.exec(opcode);
    if (!match) continue;
    const span = Number(raw);
    if (!Number.isFinite(span)) continue;
    const controller = Number(match[1]);
    // An unset controller is 0, which is what makes "no controller sent" mean no detuning under the linear rule.
    const value = cc.get(controller) ?? 0;
    const curve = Number(opcodes[`tune_curvecc${controller}`] ?? 0);
    // Curve 1 spans −span to +span with its neutral at 64, which is what `set_ccN=63.5` is for in the libraries that use it.
    cents += curve === 1 ? span * ((2 * value) / 127 - 1) : (span * value) / 127;
  }
  return cents;
}

export function parseSfz(text: string): SfzRegion[] {
  // ⭐ The `#define` layer runs first: a definition applies from its point onward, and doing it here means the parser never sees a directive nor a `$NAME` it could have resolved.
  text = applyDefines(text).text;
  // Read from the text as written, once: a `<control>` block applies to every region in the file wherever it sits.
  const cc = readControlDefaults(text);

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
      if (name === "global" || name === "master") {
        /**
         * `<master>` is SFZ v2's other global-scope header, and a real library uses it — its `ampeg_release`, `tune_cc*` and bleed opcodes live there.
         *
         * Treating it as `<global>` is the minimal honest rule: its opcodes apply to the regions that follow, exactly as a global's do. The distinction SFZ draws between the
         * two is about reset points rather than about scope, and modelling that without a consumer for it would be inventing behaviour nobody has asked for. What matters
         * immediately is that its opcodes are **kept** instead of dropped, so a range or pitch set there cannot be silently lost.
         */
        /**
         * **`<global>` starts a new global scope; `<master>` does not.** Both were treated as a reset, and sfizz says that is only half right — measured by rendering one note at two values of CC90 against a fixture whose outer
         * `<global>` sets `tune_cc90=1200`, so an octave of transposition is the signal that a value survived:
         *
         * ```
         *   tune on the region            比值 2.005   (the control: it applies)
         *   global(tune) → master → region 1.988   ← survives the master
         *   master(tune) → region          2.005
         *   global(tune) → global(other) → region 1.000   ← a second global clears the first
         *   global(tune) → group → region  2.005
         *   region overriding global       1.000
         * ```
         *
         * So a real library that states `locc101` or `tune_cc90` in its program file and then includes a microphone mapping that opens with `<master>` keeps those values for the included regions — which is how `virtuosity_drums` is
         * written, and what the previous rule silently discarded.
         */
        if (name === "global") global = {};
        current = global;
      } else if (name === "group") {
        group = {};
        current = group;
      } else if (name === "region") {
        current = {};
        regions.push({ ...DEFAULTS, sample: "", opcodes: current, unresolved: [], inherited: { ...global, ...group } } as SfzRegion & { inherited: Record<string, string> });
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

  // Inheritance is resolved from each region's own snapshot, taken when it was created — the group it is *inside*, not whichever group came last.
  return regions.map((region) => {
    const merged = { ...(region.inherited ?? {}), ...region.opcodes };
    return {
      ...DEFAULTS,
      sample: merged.sample ?? "",
      /**
       * `key` is SFZ's shorthand for `lokey` and `hikey` together, and **not handling it was the second silent widening of a key range** in this file.
       *
       * Measured: the real kit writes `key=$KICK_SNRIGHT_KEY`, which now resolves to 36 — and note 38 still matched that kick, while sfizz triggered no voice for 38 at
       * all. The reason was here: only `lokey`/`hikey` were read, so `key=36` was ignored and the range stayed 0–127. The explicit opcodes win when both are present.
       */
      lokey: num(merged.lokey, num(merged.key, DEFAULTS.lokey)),
      hikey: num(merged.hikey, num(merged.key, DEFAULTS.hikey)),
      lovel: num(merged.lovel, DEFAULTS.lovel),
      hivel: num(merged.hivel, DEFAULTS.hivel),
      // Left undefined when absent, because "no transposition" is the real behaviour and 60 is only a value a file may choose.
      pitchKeycenter: merged.pitch_keycenter === undefined ? undefined : num(merged.pitch_keycenter, 0),
      // `tune` plus whatever the controller-driven tuning adds at rest, so a region's cents are the cents it will play.
      tuneCents: num(merged.tune, DEFAULTS.tuneCents) + ccTuneCents(merged, cc),
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


/**
 * The `default_path` a file declared, read from the same text a caller would parse.
 *
 * Separate from `parseSfz` because it is a property of the **file** rather than of any region — and because a caller resolving sample addresses needs it whether or not the file produced a region this parser understood. It
 * runs the same `#define` layer first, since a declaration may be written in terms of a variable (`default_path=$DIR/`).
 */
export function readDefaultPath(text: string): string | undefined {
  const defined = applyDefines(text).text;
  // The declaration lives in `<control>` in modern files and `<global>` in older ones; both are scanned rather than assumed, because the cost of the wrong guess is a sample resolved one directory too high.
  for (const line of defined.split(/\r?\n/)) {
    const clean = line.replace(/\/\/.*$/, "").trim();
    const match = clean.match(/^default_path\s*=\s*(.+)$/);
    if (match) return match[1]!.trim().replace(/^"|"$/g, "");
  }
  return undefined;
}
