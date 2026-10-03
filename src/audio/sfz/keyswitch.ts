/**
 * ⭐ **Choosing an articulation by name, through the file's own `sw_label`.**
 *
 * ## The measured problem this exists for
 *
 * The eight `-KS` programs of the pinned string/wind library
 * (`schollz/VSCO-2-CE@6dd651d55dde97fd4028699be9d4481f26917891`) fold several articulations into one
 * program, each behind its own `sw_last`. Measured with this repository's own `parseSfz`: **44 `sw_last`
 * groups between them**, and only **8 of the 44 are reachable today** — one per file, because each file's
 * effective `sw_default` names exactly one group. The other **36** are out of reach of every note until
 * something presses a keyswitch:
 *
 * | program | regions | `sw_last` groups | groups reachable today | groups in a `<group>` with no `sw_default` |
 * | --- | --- | --- | --- | --- |
 * | `CelloEns-KS.sfz` | 156 | 6 | 1 (`c6` = `C6 Sustain Vibrato`) | 0 |
 * | `Clarinet-KS.sfz` | 97 | 3 | 1 (`c2` = `C2 Sustain Long`) | 2 |
 * | `Contrabass-KS.sfz` | 152 | 7 | 1 (`c6`) | 0 |
 * | `Flute-KS.sfz` | 94 | 5 | 1 (`c2`) | 4 |
 * | `SViolin-KS.sfz` | 161 | 6 | 1 (`c2`) | 0 |
 * | `Tuba-KS.sfz` | 87 | 5 | 1 (`c6`) | 0 |
 * | `ViolaEns-KS.sfz` | 144 | 6 | 1 (`c2`) | 0 |
 * | `ViolinEns-KS.sfz` | 131 | 6 | 1 (`c2`) | 5 |
 * | **total** | **1022** | **44** | **8** | **11** |
 *
 * The 11 in the last column are the groups the task's own reading calls out: a group that writes no
 * `sw_default` at all is unreachable even in principle, while the other 25 unreachable ones lose to a
 * *sibling's* default inside the same file.
 *
 * Every one of those files writes the articulation's **name** beside its switch — `sw_label=C2 Sustain
 * Vibrato`, `sw_label=D#2 Pizzicato`, `sw_label=C#2 Tremolo` — so the file itself already says which
 * articulation each switch selects. What was missing was a way to *ask* for one by that name, and a bug in
 * the reader that made the names unreadable: `scanOpcodes` ended every value at the first whitespace, so
 * `sw_label=C2 Sustain Vibrato` arrived as `C2`. `parse.ts` now reads a label the way the reference engine
 * does (to end of line, or up to the next `name=`), which is what makes this module possible at all.
 *
 * ## The reference engine, for the record
 *
 * sfizz reads the same value: `src/sfizz/parser/Parser.cpp` extracts to end of line and then cuts only
 * before something shaped like an opcode — *"if sequence of identifier chars and then \"=\", an opcode
 * follows"* — so `sw_label=Sine lokey=41 sample=*sine` yields the label `Sine` and
 * `sw_label=C2 Sustain Vibrato` yields the whole name. And `Region.cpp` reads it with
 * `case hash("sw_label"): keyswitchLabel = opcode.value;`, i.e. the value is the whole name.
 *
 * ## What this is not
 *
 * It is **not** a heuristic that guesses an articulation when the file names none. A request that matches
 * no `sw_label` is **refused, with the labels the file does declare**, because picking one anyway is the
 * silent-wrong-answer this workstream keeps removing. And it is not the state machine: this function
 * answers *"which switch value would select the articulation called X"* — the **initial** state a caller
 * chooses before any key is pressed. `KeyswitchState` below is the live one.
 */
import type { SfzRegion, SwitchGate } from "./parse";

/** The articulation a name selects, and the file's own spelling of it. */
export interface TechniqueSwitch {
  /** The `sw_last` value of the group the name matched — what a caller passes as `switch`. */
  switch: number;
  /** The `sw_label` exactly as the file wrote it, so a report can quote the file rather than this code. */
  label: string;
}

/** Why a requested articulation could not be selected — always with the file's own labels, never a bare "no". */
export interface TechniqueSwitchRefusal {
  reason: string;
}

export type TechniqueSwitchResult = ({ ok: true } & TechniqueSwitch) | ({ ok: false } & TechniqueSwitchRefusal);

/**
 * ⭐ **The switch value that selects an articulation called `technique`, from the file's own `sw_label`s.**
 *
 * Matching is **word-by-word on the normalised label**, not a substring test: `non vibrato` must not be
 * found inside `vibrato`, and `-`／`_` are word separators because the library writes both (`Non-Vibrato`,
 * `SusVib`). Case is ignored because SFZ labels are capitalised for a panel, not for a parser.
 *
 * **Two matches are broken by the file's own `sw_default`, and only then refused.** `Flute-KS` labels its
 * groups `C2 Sustain Non-Vibrato` and `C#2 Sustain Vibrato`, so the word `sustain` genuinely names two
 * articulations in that file; the file's `sw_default=c2` is its author saying which one a patch should load
 * with, so that group wins. A file whose tie the default cannot break is **refused by name** rather than
 * guessed at.
 *
 * Returns `undefined` when the file has **no `sw_last` regions at all** — such a program is not a keyswitch
 * program, so a technique name is not a keyswitch question and the caller must fall through to its ordinary
 * resolution (this is what keeps a dedicated `ViolinEnsSpic.sfz` playing when a caller asks for `spiccato`).
 */
export function techniqueSwitchFor(regions: readonly SfzRegion[], technique: string): TechniqueSwitchResult | undefined {
  const wanted = words(technique);
  if (wanted.length === 0) return undefined;
  const gated = regions.filter((region) => region.swLast !== undefined);
  if (gated.length === 0) return undefined;

  /** One entry per distinct switch value, keeping the file's first spelling of its label. */
  const matched = new Map<number, string>();
  const declared = new Set<string>();
  for (const region of gated) {
    const label = region.opcodes.sw_label;
    if (label === undefined || label.trim() === "") continue;
    declared.add(label);
    if (!containsWords(words(label), wanted)) continue;
    const value = region.swLast!;
    if (!matched.has(value)) matched.set(value, label);
  }

  if (matched.size === 0) {
    const labels = [...declared].sort();
    return {
      ok: false,
      reason:
        `no articulation called "${technique}" in this file: its sw_label values are ` +
        `${labels.length === 0 ? "absent (no region declares sw_label)" : labels.map((label) => `"${label}"`).join(", ")}`,
    };
  }
  if (matched.size === 1) {
    const [value, label] = [...matched.entries()][0]!;
    return { ok: true, switch: value, label };
  }

  /**
   * More than one articulation answered to the name. The file's own `sw_default` is the author's answer to
   * "which one loads", so it settles the tie when it names one of the candidates.
   */
  const preferred = matched.get(defaultOf(regions) ?? -1);
  if (preferred !== undefined) {
    const value = [...matched.entries()].find(([, label]) => label === preferred)![0];
    return { ok: true, switch: value, label: preferred };
  }
  return {
    ok: false,
    reason:
      `"${technique}" names ${matched.size} articulations in this file (` +
      `${[...matched.entries()].map(([value, label]) => `sw_last=${value} "${label}"`).join(", ")}) ` +
      `and the file's sw_default does not choose between them`,
  };
}

/**
 * The file's power-on default, read **last declaration wins** to match the reference engine, or `undefined`.
 *
 * sfizz's `Synth::Impl::buildRegion` ends with `if (lastRegion->defaultSwitch) setCurrentSwitch(*lastRegion->defaultSwitch);`
 * and `buildRegion` is called once per `<region>` **in file order** (`onParseEvent`, `case hash("region"):
 * buildRegion(members); break;`) — so the value left in `currentSwitch_` is the one from the **last region
 * built whose effective `sw_default` is defined**, not the first. `declaredSwitchDefault` in `parse.ts` is
 * the same rule and this function defers to it.
 *
 * Measured on the pinned files: it costs nothing there, because every `-KS` file that repeats `sw_default`
 * repeats **one value** (`CelloEns-KS` writes `c6` six times), so first and last agree. It is still the
 * reference engine's rule rather than ours, and a file with two different defaults is the case that tells
 * them apart.
 */
function defaultOf(regions: readonly SfzRegion[]): number | undefined {
  for (let index = regions.length - 1; index >= 0; index -= 1) {
    const value = regions[index]!.swDefault;
    if (value !== undefined) return value;
  }
  return undefined;
}

/** A label or a technique name as comparable words: case folded, `-`／`_` treated as separators. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[-_/\\]+/g, " ")
    .split(/\s+/)
    .filter((word) => word !== "");
}

/** Whether `haystack` contains `needle` as a contiguous run of words. */
function containsWords(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return true;
  }
  return false;
}

/* ------------------------------------------------------------------------------------------------ */
/*                                   the live state machine                                           */
/* ------------------------------------------------------------------------------------------------ */

/** What the file says a keyswitch is — the targets the state machine watches, and what it starts at. */
interface SwitchTargets {
  /** Every note some region's `sw_last`／`sw_lolast`／`sw_hilast` names — the **sticky** switches. */
  last: Set<number>;
  /** Every note some region's `sw_down` names — the switches that apply while held. */
  down: Set<number>;
  /** Every note some region's `sw_up` names — the switches whose *release* is the condition. */
  up: Set<number>;
  /** The file's `sw_default`, which is the state a patch loads in (`sw_default`'s own page: *"so that you hear something when a patch loads"*). */
  defaultSwitch?: number;
  /**
   * A value fingerprint of the above, so the state can tell "the same file again" from "a different file on this track".
   *
   * It is a **value** rather than the array's identity because `resolveInstrumentNote` re-parses the program on every note (`parseSfz` is cheap and pure by design),
   * so every call hands in a fresh array and identity would re-seed the machine on every key press.
   */
  key: string;
}

/** One note-on or note-off, in the order it was seen — the log a re-learned file is replayed from. */
interface SwitchEvent {
  on: boolean;
  note: number;
  velocity: number;
}

/**
 * How many events are kept for replay. A track's switch history only has to cover the moment the file is (re)learned, which is the first note after a track's
 * instrument changes — so this is generous, and bounded so a long session cannot grow it without limit.
 */
const MAX_LOGGED_EVENTS = 512;

/** The result of learning a file: whether the requested articulation was found, and why not when it was not. */
export type KeyswitchLearnResult = { ok: true } | { ok: false; reason: string };

/**
 * The gate a live state always produces: the sticky value may be absent (a file with no `sw_default` and nothing pressed yet) but the held-sets are always known, because
 * "nothing is held" is a fact this layer is the only one able to assert.
 */
export interface KeyswitchGate extends SwitchGate {
  down: ReadonlySet<number>;
  up: ReadonlySet<number>;
}

/**
 * ⭐ **The live keyswitch state of one instrument instance — the sticky/non-sticky machine the format describes and this codebase had no place for.**
 *
 * ## Where it lives, and why it is that layer
 *
 * The state is **per instrument instance**, which in this repository means **per track**: the owner's requirement is that two tracks playing at once must not cross
 * switches, and the reference engine agrees. sfizz keeps exactly one `absl::optional<uint8_t> currentSwitch_` and one `std::array<LayerViewVector, 128>
 * lastKeyswitchLists_` on `Synth::Impl` (`SynthPrivate.h:292`／`:307`), i.e. **one per loaded instrument, not per MIDI channel**, and its `previousKeySwitched_` is a
 * per-`Layer` flag written on every note-on the instance receives (`Synth.cpp:1386`). One track here is one instrument instance, so one `KeyswitchState` per track is
 * the same scope rather than an approximation of it.
 *
 * It is **not** in `sampleLoader`: the live keyboard path builds a fresh loader on every key press (`playerFromEngine.ts`'s `audition` calls `createSampleLoader`
 * inside itself), so loader-held state would reset between two notes of one performance. It is **not** in `regionsForNote` either, which is pure and re-entered per
 * note. It is the layer that owns a *sequence* of notes for one instrument — `playerFromEngine.ts`'s `audition`／`releaseNote` pair, which is the only path in this
 * repository with both a press and a release.
 *
 * ## The order of the updates is the reference engine's, and it decides `sw_previous`
 *
 * `Synth::Impl::noteOnDispatch` updates the sticky switch **first** (guarded by `if (!lastKeyswitchLists_[noteNumber].empty())`), then applies the `sw_up`／`sw_down`
 * flags for this note, **then** runs the region-matching loop, and only **after** it sets `previousKeySwitched_ = (region.previousKeyswitch == noteNumber)` — so a
 * note is matched against the switch state *including its own* update, while `sw_previous` sees the note-on **before** it. That is the order `noteOn` below
 * implements, and the reason it returns a gate rather than merely mutating.
 *
 * ## Offline callers are untouched
 *
 * A caller that holds no state passes no state, and every switch condition then closes exactly as it did — which is the literal reading of the format (*"it will play
 * no sound until one of the keyswitches is pressed"*) and the behaviour the existing criteria pin. The one thing this class adds for such a caller is
 * `initialSwitch`, the explicitly chosen articulation that Commit 1's `technique` option supplies, so that "the track chose spiccato" and "the track's spiccato
 * switch is the state it starts in" are one mechanism rather than two.
 */
export class KeyswitchState {
  private targets?: SwitchTargets;
  /** The refusal a named articulation produced, kept so every note of the track reports the same reason rather than only the first. */
  private techniqueRefusal?: string;
  private sticky?: number;
  /** The pitch of the **most recent** note-on, and of the one before it — `sw_previous` asks for the latter. */
  private lastNote?: number;
  private previousNote?: number;
  private lastVelocity?: number;
  private previousVelocity?: number;
  /** Note-ons and note-offs, in order, so a file learned midway can be replayed rather than guessed at. */
  private log: SwitchEvent[] = [];

  /**
   * `initialSwitch` is the state a caller chooses before any key is pressed — the chosen articulation's `sw_last` value. It **wins over the file's own `sw_default`**,
   * because a caller naming an articulation is more specific than a file naming its power-on default; that precedence is Commit 1's and is not restated here as a
   * second rule but reused through `techniqueSwitchFor`.
   */
  constructor(private readonly initialSwitch?: number) {}

  /**
   * Learn which notes this file treats as switches, and seed the state.
   *
   * Idempotent per file: called on every note, and it re-seeds `sticky` (and replays the recorded history) only when the file's own switch facts change. The live
   * state — what is held, what was played last — is deliberately **not** reset on a re-learn of the same file, which is what lets a chord press a keyswitch and a note
   * "at once" and still have the note answer to the switch.
   */
  observe(regions: readonly SfzRegion[], technique?: string): KeyswitchLearnResult {
    const targets = targetsOf(regions);
    if (this.targets?.key !== targets.key) {
      this.targets = targets;
      /**
       * The seed, in precedence order: the articulation the caller named (Commit 1's mechanism, reused rather than duplicated), then the file's own `sw_default`, then
       * nothing — which is the spec's "no sound until one of the keyswitches is pressed".
       */
      this.techniqueRefusal = undefined;
      let seed = this.initialSwitch;
      if (technique !== undefined) {
        const chosen = techniqueSwitchFor(regions, technique);
        if (chosen !== undefined) {
          if (chosen.ok) seed = chosen.switch;
          else {
            seed = undefined;
            this.techniqueRefusal = chosen.reason;
          }
        }
        // `undefined` means the file is not a keyswitch program at all, so the name is not a keyswitch question and the default stands.
      }
      this.sticky = seed ?? targets.defaultSwitch;
      this.lastNote = undefined;
      this.previousNote = undefined;
      this.lastVelocity = undefined;
      this.previousVelocity = undefined;
      for (const event of this.log) this.apply(event);
    }
    if (this.techniqueRefusal !== undefined) return { ok: false, reason: this.techniqueRefusal };
    return { ok: true };
  }

  /**
   * A note-on: press the key. The returned gate is what the note **itself** is matched against, in the reference engine's order (its own switch update included,
   * `sw_previous` from the note before it).
   */
  noteOn(note: number, velocity: number): KeyswitchGate {
    this.record({ on: true, note, velocity });
    return this.gate();
  }

  /** A note-off: `sw_down` stops applying, `sw_up` starts. */
  noteOff(note: number): void {
    this.record({ on: false, note, velocity: 0 });
  }

  /**
   * The state as it stands, for a caller that needs it without a new event — the gate for the **most recent** note-on.
   *
   * A note-off leaves `previousNote` alone, because `sw_previous` is defined against the last **note-on** message
   * (<https://sfzformat.com/opcodes/sw_previous/>: *"if last note-on message was equal to `sw_previous` value"*).
   */
  gate(): KeyswitchGate {
    return {
      ...(this.sticky === undefined ? {} : { switch: this.sticky }),
      down: this.heldDown(),
      up: this.heldUp(),
      ...(this.previousNote === undefined ? {} : { previousNote: this.previousNote }),
      ...(this.previousVelocity === undefined ? {} : { previousVelocity: this.previousVelocity }),
    };
  }

  /** Forget everything — a track whose instrument changed, or a transport that starts a new performance. */
  reset(): void {
    this.log = [];
    this.targets = undefined;
    this.techniqueRefusal = undefined;
    this.sticky = undefined;
    this.lastNote = undefined;
    this.previousNote = undefined;
    this.lastVelocity = undefined;
    this.previousVelocity = undefined;
  }

  /** The state, spelled for a report: which articulation is in force and which keys are held. */
  describe(): { switch?: number; down: number[]; up: number[]; previousNote?: number } {
    return {
      ...(this.sticky === undefined ? {} : { switch: this.sticky }),
      down: [...this.heldDown()].sort((a, b) => a - b),
      up: [...this.heldUp()].sort((a, b) => a - b),
      ...(this.previousNote === undefined ? {} : { previousNote: this.previousNote }),
    };
  }

  /** The notes currently held that the file names as `sw_down` targets. */
  private heldDown(): Set<number> {
    const targets = this.targets;
    if (!targets) return new Set();
    const held = new Set<number>();
    for (const event of this.log) if (event.on && targets.down.has(event.note)) held.add(event.note);
    for (const event of this.log) if (!event.on) held.delete(event.note);
    return held;
  }

  /** The notes currently held that the file names as `sw_up` targets — a region with `sw_up=X` plays while X is *not* depressed. */
  private heldUp(): Set<number> {
    const targets = this.targets;
    if (!targets) return new Set();
    const held = new Set<number>();
    for (const event of this.log) if (event.on && targets.up.has(event.note)) held.add(event.note);
    for (const event of this.log) if (!event.on) held.delete(event.note);
    return held;
  }

  private record(event: SwitchEvent): void {
    this.apply(event);
    this.log.push(event);
    if (this.log.length > MAX_LOGGED_EVENTS) this.log.splice(0, this.log.length - MAX_LOGGED_EVENTS);
  }

  /**
   * ⭐ **The reference engine's order, in one place**: the sticky switch moves first, then `sw_previous` is moved to *this* note — so the gate a caller reads
   * afterwards already describes the note after this one, which is exactly `previousKeySwitched_`'s behaviour.
   */
  private apply(event: SwitchEvent): void {
    /**
     * A note-off moves nothing sticky: `sw_last` is the *"sticky"* keyswitch that *"continues to affect notes until another keyswitch is pressed"*
     * (<https://sfzformat.com/opcodes/sw_last/>). What a note-off *does* change is the held-set, which `heldDown`／`heldUp` read straight off the log.
     */
    if (!event.on) return;
    if (this.targets?.last.has(event.note)) this.sticky = event.note;
    /**
     * ⭐ **The shift is what makes `sw_previous` mean "the note before this one"**, and it is why `noteOn` is called for the note being resolved.
     *
     * An earlier version kept only the latest pitch, so a caller that recorded the press and then resolved that same note compared `sw_previous` against the note
     * itself and never against its predecessor. The reference engine's ordering is the same as this shift: `previousKeySwitched_ = (region.previousKeyswitch == noteNumber)`
     * runs *after* the region-matching loop for each note-on, so note *N* is gated by note *N−1*.
     */
    this.previousNote = this.lastNote;
    this.previousVelocity = this.lastVelocity;
    this.lastNote = event.note;
    this.lastVelocity = event.velocity;
  }
}

/**
 * What a file's own regions say its switches are, plus a fingerprint of that.
 *
 * ## The trigger-selector range, which is the one place this deliberately differs from the reference engine
 *
 * `sw_lokey`／`sw_hikey` are *"the range of the keyboard to be used as trigger selectors for the `sw_last` opcode"*
 * (<https://sfzformat.com/opcodes/sw_lokey/>), so a note **outside** that range is not a trigger selector however its pitch compares to some region's `sw_last` — and that is
 * what `rangeOf` below enforces for the sticky targets.
 *
 * **sfizz does not do this**: its `Region.cpp` reads `sw_lokey` and `sw_hikey` into nothing at all
 * (`case hash("sw_lokey"): // fallthrough` / `case hash("sw_hikey"): break;`), so there the whole keyboard is a trigger range. The two agree on every well-formed file — a
 * program that declares `sw_lokey=84 sw_hikey=87` and switches 84–87 selects the same notes either way — and they differ only for a file whose `sw_last` sits outside its own
 * declared range, which is a file contradicting itself. This project follows the specification's sentence and says so here rather than silently choosing.
 *
 * `sw_down`／`sw_up` targets are **not** range-filtered, which is the ARIA reading of the same page: *"In ARIA, either `sw_down` or `sw_up` can be a note in the playable range,
 * regardless of whether `sw_lokey` / `hikey` is defined or not."*
 *
 * ## The range form
 *
 * `sw_lolast`／`sw_hilast` expand to every key in their range, the way sfizz builds `lastKeyswitchLists_`
 * (`for (uint8_t note = range.getStart(), end = range.getEnd(); note <= end; note++) lastKeyswitchLists_[note].push_back(lastLayer);`), so a key anywhere in a `sw_lolast`／`sw_hilast`
 * range is a switch that can be pressed. Either end alone is a one-value range, which is sfizz's own `emplace(value, value)` followed by moving one end.
 */
function targetsOf(regions: readonly SfzRegion[]): SwitchTargets {
  const last = new Set<number>();
  const down = new Set<number>();
  const up = new Set<number>();
  let defaultSwitch: number | undefined;
  /** Whether a switch value is a trigger selector for the region that declared it — `sw_lokey`／`sw_hikey`'s own sentence. */
  const inRange = (region: SfzRegion, note: number): boolean =>
    (region.swLow === undefined || note >= region.swLow) && (region.swHigh === undefined || note <= region.swHigh);
  for (const region of regions) {
    if (region.swLast !== undefined && region.swLoLast === undefined && region.swHiLast === undefined && inRange(region, region.swLast)) last.add(region.swLast);
    const low = region.swLoLast ?? region.swHiLast;
    const high = region.swHiLast ?? region.swLoLast;
    if (low !== undefined && high !== undefined) {
      for (let note = Math.min(low, high); note <= Math.max(low, high); note += 1) if (inRange(region, note)) last.add(note);
    }
    if (region.swDown !== undefined) down.add(region.swDown);
    if (region.swUp !== undefined) up.add(region.swUp);
    if (region.swDefault !== undefined) defaultSwitch = region.swDefault;
  }
  const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b).join(",");
  return {
    last,
    down,
    up,
    ...(defaultSwitch === undefined ? {} : { defaultSwitch }),
    key: `last:${sorted(last)}|down:${sorted(down)}|up:${sorted(up)}|default:${defaultSwitch ?? "-"}`,
  };
}
