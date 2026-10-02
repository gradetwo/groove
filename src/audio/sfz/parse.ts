import { applyDefines } from "./defines";
import { defaultPathFrom } from "./defaultPath";

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
  /**
   * The `default_path` that applies to **this region**, from the `<control>` block in force where it was written — and absent when the file declares no path at all, which
   * means the sample is already relative to the program.
   *
   * `default_path` is **sequential state, not a file-level constant.** It applies from its declaration onward, and the next `<control>` block replaces it; the `<group>` and
   * `<global>` blocks that sit between them do not reset it. The pinned upstream files are why this field exists, and they were measured rather than reasoned about
   * (`schollz/VSCO-2-CE@6dd651d55dde97fd4028699be9d4481f26917891`): its eight `-KS` programs declare 2, 4 or 5 paths each, one per folded articulation, and each path names a
   * directory the samples exist in. Cello Ensemble declares `susvib`, `trem`, `spic` and `pizzT` in one file; under this region's own path all 156 of its regions name files
   * that exist, while under the first path 129 of them name files that do not.
   *
   * It sits on the region, captured when the region was created, for the same reason `inherited` does: a caller that reads one file-level value afterwards gives every region
   * the same answer, which is the defect this replaced.
   */
  defaultPath?: string;
  /**
   * Why this region's `default_path` cannot be known, when the file declares one but the region sits **before** the first `<control>` that carries it.
   *
   * SFZ's own answer is that the value applies from its declaration onward, so a region written earlier has no applicable declaration — but the file plainly intends a path,
   * and choosing either the later one or none at all would be a guess that resolves a sample out of the wrong directory. That is the silent-wrong-data failure this project
   * treats as the worst kind, so it is carried as a named problem instead.
   */
  defaultPathProblem?: string;
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
  /**
   * ⭐ **`set_hdccN` is a default too, and it is the form Salamander Grand Piano uses.**
   *
   * The owner's report: the arrangement printed `instrument "salamander-grand" has 161 region(s) and none of them sound at the controller values the file declares`, once per step. Every one of those regions gates on `locc20=1`, `locc21=1` or `locc22=1` — "sound when this controller is at least 1" — and the file brings those controllers up with **`set_hdcc20=0.5`**, the **normalised** form (0–1) rather than the raw 0–127 one. Only `set_ccN` was read, so those controllers looked unset, an unset controller is 0, and `0 >= 1` gated the whole instrument out: a piano that could not play a note, with the blame printed against the file.
   *
   * Both forms are read now, **in the order they appear**, so a control block that uses one after the other behaves as it reads. `set_hdccN` is scaled into the 0–127 domain because that is the domain `locc`/`hicc` compare in.
   */
  for (const match of line.matchAll(/(?:^|\s)set_hdcc(\d+)\s*=\s*(\S+)/g)) {
    const normalised = Number(match[2]);
    if (Number.isFinite(normalised)) {
      defaults.set(Number(match[1]), Math.round(Math.max(0, Math.min(1, normalised)) * 127));
    }
  }
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
  /**
   * **SFZ's `<master>` layer — the level between `<global>` and `<group>`, and a scope of its own.**
   *
   * [sfzformat.com/headers](https://sfzformat.com/headers/) defines it as *"an extra level added inbetween group and
   * global for the ARIA player"*, so the hierarchy is `global → master → group → region`. `virtuosity_drums` writes it
   * that way: each percussion piece is `<master> … key=$PERC_…` followed by its own `#include`, and the next piece opens
   * with a bare `<master>`.
   *
   * Folding it into `global` (what this file used to do) and letting an earlier `<group>` survive into it made **all 752
   * percussion regions of the basic kit answer note 50**, because `snaremic_basic.sfz` opens a `<group> key=50` and never
   * closes it. The rule now implemented — a new `<master>` starts from `<global>` and ends any open `<group>` — is
   * **measured against sfizz** in the criterion and quoted line by line in the `<master>` branch below.
   */
  let master: Record<string, string> = {};
  let group: Record<string, string> = {};
  let current: Record<string, string> | null = null;
  /**
   * The `default_path` in force, and the ones each region saw, captured as the file is read rather than looked up afterwards.
   *
   * A second pass that searched the text for "the" `default_path` is what this replaces, and it is the same shape as the `inherited` defect above one level up: reading a
   * value at the end gives every region the same answer, and here the file itself declares that the answer differs per section.
   */
  let controlDefaultPath: string | undefined;
  const seenDefaultPath: (string | undefined)[] = [];
  /** That the file declares a path somewhere, even if not before the region being examined — the difference between "no path to apply" and "not knowable here". */
  let declaresDefaultPath = false;

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
      /**
       * A `<control>` block is not inherited state like a group — it is the file talking to the player — but `default_path` inside it **is** forward-applying state, and
       * it is read here, at its own line, rather than at the end. This is the whole difference the keyswitch programs needed: the value belongs to the section it opens,
       * and the next `<control>` replaces it. The body lines of the same block are read below, past the `continue`, because a `<control>` block has no opcode map of its own.
       */
      if (name === "control") {
        current = null;
      } else if (name === "global") {
        /**
         * A `<global>` is the outermost scope and the only header that **clears** what came before it.
         *
         * Measured against sfizz by rendering one note at two values of CC90 through a fixture whose outer `<global>`
         * sets `tune_cc90=1200`, so an octave of transposition is the signal that a value survived:
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
        global = {};
        master = {};
        current = global;
      } else if (name === "master") {
        /**
         * **A `<master>` opens a new layer that lasts until the next `<master>` or `<global>`, and it ends any `<group>`
         * that was open before it.**
         *
         * Both halves are measured against `sfizz_render`, not read off a grammar, because the library that needed this
         * is written entirely in `<master>` blocks and every wrong guess here is silent. One 0.25 s 1 kHz region per
         * fixture, rendered at 44.1 kHz, peak in parentheses:
         *
         * ```
         *   global(key=36) → master(key=40) → region      36: 0.0000   40: 0.0604   the master's key wins
         *   global(key=36) → master()       → region      36: 0.0604   40: 0.0000   a bare master keeps the global's
         *   master(key=36) → master(key=40) → region      36: 0.0000   40: 0.0604   the second master replaces the first
         *   master(key=36) → master()       → region      36: 0.0604   40: 0.0604   ← see below
         *   global(key=36) → master(key=40) → master() → region  36: 0.0604  40: 0.0000
         *   group(key=50)  → master(key=54) → region      50: 0.0000   54: 0.0604   the group does NOT survive
         *   master(key=54) → group(key=50)  → region      50: 0.0604   54: 0.0000   a group inside the master does
         * ```
         *
         * The fourth line's `40: 0.0604` is not a second sound — that fixture's earlier `key=36` had already been
         * replaced, and the master inherited nothing that bound note 40, so the region was unconstrained and matched
         * both. The rule it confirms is the one every other line agrees on: **a new `<master>` starts from the
         * `<global>` scope, not from the previous master and not from a group that was open.**
         *
         * `virtuosity_drums` is why this matters rather than being pedantry. Its program sets `key=50` in a `<global>`
         * for the high tom, then `snaremic_basic.sfz` opens a `<group> key=50` — and never closes it. The percussion
         * mappings that follow are `<master> key=$PERC_…` blocks, and a region inside them inherited that stale
         * `group key=50`, so **all 752 percussion regions of the basic kit answered note 50** and notes 54–84 — the
         * tambourine, cowbell, congas, bongos, shakers, triangles and agogos the library ships — answered nothing.
         */
        master = {};
        group = {};
        current = master;
      } else if (name === "group") {
        group = {};
        current = group;
      } else if (name === "region") {
        current = {};
        regions.push({
          ...DEFAULTS,
          sample: "",
          opcodes: current,
          unresolved: [],
          inherited: { ...global, ...master, ...group },
        } as SfzRegion & { inherited: Record<string, string> });
      } else {
        // A header this subset does not model (curve, effect, …) is skipped, not fatal — and its opcodes are ignored with it.
        current = null;
      }
    }
    /**
     * A `default_path` on a `<control>` block's own body line, which is how every upstream keyswitch program writes it: the header is `<control>` and the declaration is
     * the next line. Read before the `if (!current) continue`, because a `<control>` block has no current opcode map — it is state, not something a region inherits.
     */
    if (!header || header[1]!.toLowerCase() === "control") {
      const declared = defaultPathValue(rest);
      if (declared !== undefined) {
        controlDefaultPath = declared;
        declaresDefaultPath = true;
      }
    }
    if (!current) continue;
    scanOpcodes(rest, current);
    /**
     * The path this region is written under, taken where it is written and **after** its own opcodes are read: a `default_path` written on the region line itself wins
     * over the section's, and the region's own value is the one `scanOpcodes` stores in full rather than the one this line would cut out of a line carrying other opcodes.
     */
    if (header && header[1]!.toLowerCase() === "region") {
      seenDefaultPath[regions.length - 1] = applicableDefaultPath(current, { ...global, ...master, ...group }, controlDefaultPath);
    }
  }

  /** Every `$NAME` a value still contains, deduplicated — reported rather than silently defaulted. */
  const unresolvedIn = (opcodes: Record<string, string>): string[] => [
    ...new Set(Object.values(opcodes).flatMap((value) => value.match(/\$[A-Za-z_][A-Za-z0-9_]*/g) ?? [])),
  ];

  // Inheritance is resolved from each region's own snapshot, taken when it was created — the group it is *inside*, not whichever group came last.
  return regions.map((region, index) => {
    const merged = { ...(region.inherited ?? {}), ...region.opcodes };
    /**
     * The path that applies to this region, in SFZ's order of precedence: its own `default_path`, then one inherited from the `<global>`/`<group>` it sits in (which is how
     * older files declare it), then the `<control>` block in force where it was written. When none exists the field stays absent, meaning "relative to the program" — unless
     * the file declares a path somewhere else, and then this region's answer is genuinely unknowable and is reported as a problem rather than filled in with a nearby value.
     */
    const applicable = applicableDefaultPath(region.opcodes, region.inherited ?? {}, seenDefaultPath[index]);
    const problem =
      applicable === undefined && declaresDefaultPath
        ? `region ${index + 1} ("${merged.sample ?? ""}") is written before any <control> block declares default_path, so the directory its sample resolves against is unknowable`
        : undefined;
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
      ...(applicable === undefined ? {} : { defaultPath: applicable }),
      ...(problem === undefined ? {} : { defaultPathProblem: problem }),
      opcodes: merged,
      unresolved: unresolvedIn(merged),
    };
  });
}

/**
 * The `default_path` that applies to a region, in SFZ's order of precedence.
 *
 * Its own opcode wins, then one inherited from the `<global>`/`<group>` it sits in — older files declare it there, in the merged `global`+`group` snapshot, and dropping
 * that would regress every one of them — and last the `<control>` block in force where the region was written. One function, so the parser has a single notion of "the
 * applicable path": the previous code had a second one, `readDefaultPath`, which read the first declaration in the file and gave it to every region.
 */
function applicableDefaultPath(
  own: Readonly<Record<string, string | undefined>>,
  inherited: Readonly<Record<string, string | undefined>>,
  fromControl: string | undefined
): string | undefined {
  return defaultPathFrom(own) ?? defaultPathFrom(inherited) ?? fromControl;
}

/**
 * A `default_path` written on one line, or undefined when the line does not declare one.
 *
 * The value runs to the **end of the line**, not to the first whitespace, and that is measured rather than assumed. Every one of the pinned library's 75 programs writes
 * `default_path=Strings\Violin Section\susVib\` unquoted with spaces in it, and truncating at whitespace yields `Strings/Violin` — which is how a measurement script of
 * this project's own reported that half of 12 instruments had no samples at all. The upstream files are the fixture this reads.
 *
 * Used for a `<control>` block, where the declaration is a line of its own and the rest of the line is nothing. A region or group goes through `scanOpcodes` instead, so
 * that a line carrying other opcodes cannot leak them into the value.
 */
function defaultPathValue(line: string | undefined): string | undefined {
  if (line === undefined) return undefined;
  const match = line.replace(/\/\/.*$/, "").match(/(?:^|\s)default_path\s*=\s*(.+)$/);
  if (!match) return undefined;
  const value = match[1]!.trim().replace(/^"|"$/g, "");
  return value === "" ? undefined : value;
}

/**
 * The `key=value` pairs on one line, into `into`.
 *
 * **A `sample=` path may contain spaces unquoted, and that is measured rather than assumed.** The previous version
 * ended every value at the first whitespace and *reported* the cut — `Tubular Bells 1/chimes.wav` became `Tubular` —
 * on the reading that "an unquoted value ends at whitespace". The reference engine says otherwise. Rendering a
 * 440 Hz tone through `sample=space dir/tone.wav` produces the tone (peak 0.0824), while the quoted form
 * `sample="space dir/tone.wav"` renders **silence** (peak 0.000031): sfizz reads the spaces and rejects the quotes,
 * so the truncation was ours all along.
 *
 * That matters beyond tidiness, because VCSL — a library this project mirrors — writes **every** sample path
 * unquoted and many of them inside directories with spaces (`Timpani 1/Hit/…`, `Baroque Alto Recorder/…`). Under
 * the old rule those regions resolved to a file named `Timpani`, so the one orchestral instrument the mirror holds
 * could not sound. So a sample's value runs to the end of the line, or up to the next `name=value` pair when the
 * same line carries more opcodes after it (`sample=space dir/tone.wav pitch_keycenter=60`); every other value keeps
 * the grammar's rule, quoted or up to the next whitespace.
 */
function scanOpcodes(line: string, into: Record<string, string>): void {
  let index = 0;
  while (index < line.length) {
    const opener = /([a-zA-Z0-9_]+)\s*=\s*/.exec(line.slice(index));
    if (!opener) return;
    const name = opener[1]!.toLowerCase();
    const valueStart = index + opener.index + opener[0]!.length;

    /**
     * **An `=` with nothing after it is not a value.** The old pattern simply failed to match there and moved on to
     * the next pair on the line, and the scanner has to do the same explicitly or `lovel= hivel=63` would read
     * `hivel=63` as the value of `lovel`.
     */
    if (/^[a-zA-Z0-9_]+\s*=/.test(line.slice(valueStart)) && line[valueStart] !== '"') {
      index = valueStart;
      continue;
    }

    if (name === "sample") {
      const following = /\s+[a-zA-Z0-9_]+\s*=/.exec(line.slice(valueStart));
      const end = following ? valueStart + following.index : line.length;
      into.sample = line.slice(valueStart, end).trim().replace(/^"|"$/g, "");
      index = following ? end : line.length;
      continue;
    }

    if (line[valueStart] === '"') {
      const close = line.indexOf('"', valueStart + 1);
      into[name] = line.slice(valueStart + 1, close === -1 ? line.length : close);
      index = close === -1 ? line.length : close + 1;
      continue;
    }

    const token = /^\S+/.exec(line.slice(valueStart));
    // Nothing after the `=` is not a value the old grammar would have matched either, so the line ends here.
    if (!token) return;
    into[name] = token[0]!;
    index = valueStart + token[0]!.length;
  }
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
