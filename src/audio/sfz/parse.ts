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
  /**
   * ⭐ **SFZ's `sw_last` — the keyswitch value this region plays on**, or `undefined` when the region says nothing about keyswitches.
   *
   * Absent means "not gated": SFZ's own default for the opcode is `-1`, which `Opcode::readOptional` rejects as out of the 0–127 range
   * (`Defaults.cpp`: `UInt8Spec key { 60, {0, 127}, kCanBeNote }`), so a region without `sw_last` is not a region that matches keyswitch `-1` — it is a region the
   * opcode never touched. The two are different, and conflating them would silence every ordinary region of a file that happens to use keyswitches elsewhere.
   *
   * It is carried on the region rather than reported for the file because that is what the format does: `kinwie`-style keyswitch programs put the same
   * `sw_lokey`/`sw_hikey` in `<global>` and then a different `sw_last` in each `<group>`, so the only place the answer exists is the region.
   */
  swLast?: number;
  /**
   * ⭐ **SFZ's `sw_default` — the articulation a player picks when the patch loads and nobody has pressed a keyswitch.**
   *
   * [sfzformat.com/opcodes/sw_default](https://sfzformat.com/opcodes/sw_default/) states the reason it exists: *"Define keyswitch 'power on default' so that you hear
   * something when a patch loads. … Without `sw_default`, this instrument would be silent until a keyswitch is manually used to select an articulation."* The opcode is
   * ARIA's answer to a documented SFZ v1/v2 behaviour — its `sw_last` page says an instrument that uses keyswitches *"will not have a default articulation preselected,
   * meaning when loaded, it will play no sound until one of the keyswitches is pressed"*.
   *
   * It travels on the region for the same reason `defaultPath` does: it is **file-level state captured where the region was written**, and a caller that read one
   * value at the end would give every region the last declaration in the file.
   */
  swDefault?: number;
  /**
   * ⭐ **The `sw_lokey`/`sw_hikey` pair in force for this region**, from whatever scope carried it (`<global>` in the libraries that use it), or `undefined` when the
   * file names neither — an unspecified range, which is the opcodes' own default of `-1` and is not the same as `0–127`.
   *
   * It gates the **switch values a file offers** rather than the played note: with a switch value `v` active, a region's `sw_last` is reachable only when
   * `lokey <= v <= hikey`. See the note on `swLast` for why that is the reading, and for what it costs (it needs no live keyboard, which is the point).
   */
  swLow?: number;
  swHigh?: number;
  /**
   * ⭐ **`sw_lolast`／`sw_hilast` — the same gate as `sw_last`, over a range of keyswitches.**
   *
   * <https://sfzformat.com/opcodes/sw_lolast/>: *"Like `sw_last`, but allowing a region to be triggered across a range of keyswitches. `sw_lolast` specifies the bottom of
   * the range, and `sw_hilast` the high."* Both are ARIA opcodes with default `N/A`, so an absent one is absent rather than `0`.
   *
   * When either is present the pair is the range and `sw_last` is ignored — which is what sfizz does: `Region.cpp`'s `sw_last` arm is guarded by `if (!lastKeyswitchRange)`
   * while `sw_lolast`／`sw_hilast` build that range, so a file writing both gets the range (<https://github.com/sfztools/sfizz/blob/f5c6e29f23b8057867c08e88f5f6ac6738baa30b/src/sfizz/Region.cpp#L285-L312>).
   */
  swLoLast?: number;
  swHiLast?: number;
  /**
   * ⭐ **`sw_down`／`sw_up` — the switches that apply only while a key is held, and only while it is not.**
   *
   * <https://sfzformat.com/opcodes/sw_down/>: *"Enables the region to play if the key equal to `sw_down` value is depressed."* … *"`sw_last` is a \"sticky\"
   * keyswitch - after releasing the keyswitch note, it continues to affect notes until another keyswitch is pressed. `sw_down`, on the other hand, is \"non-sticky\" and
   * only affects notes played while the switch is held down."* And the same page for `sw_up`: *"`sw_up` should be defined for those regions"* that are the default
   * articulation, *"so it only sounds when no ornamentation keyswitch is held down"* — i.e. a region with `sw_up=X` plays while X is **not** depressed.
   *
   * These are carried as the **targets they are** rather than as a file-level rule: `sw_down`/`sw_up` name the note that holds the switch, and only live note-off
   * events can change it, which is why they are read here and gated in `regionsForNote` against a live state (`keyswitch.ts`) rather than resolved statically.
   */
  swDown?: number;
  swUp?: number;
  /**
   * ⭐ **`sw_previous` — the region plays if the last note-on before this one was this pitch.**
   *
   * <https://sfzformat.com/opcodes/sw_previous/>: *"Previous note value. The region will play if last note-on message was equal to `sw_previous` value."* … *"unlike
   * `sw_last`, the note specified by `sw_previous` doesn't need to fall in the `sw_lokey`/`sw_hikey` range"* — which is why it is gated against the previous note-on and
   * **not** against the switch range, and why a state that keeps that pitch is what makes it decidable at all.
   */
  swPrevious?: number;
  /**
   * ⭐ **`sw_vel=previous` — this region takes the previous note's velocity rather than its own.**
   *
   * <https://sfzformat.com/opcodes/sw_vel/>: *"Allows overriding the velocity for the region with the velocity of the previous note."* Values are `current` (the default)
   * and `previous`; sfizz implements exactly this in `Voice.cpp`／`Layer.cpp` (`if (region.velocityOverride == VelocityOverride::previous) velocity =
   * midiState_.getVelocityOverride();`), and its `MidiState` keeps that velocity beside the last note played.
   */
  swVelPrevious?: boolean;
  /**
   * ⭐ **SFZ's `trigger` — *"Sets the trigger which will be used for the sample to play"* (<https://sfzformat.com/opcodes/trigger/>) — as one of the five values the
   * specification and the reference engine agree on.**
   *
   * The page's own list: *"**attack** : (Default): Region will play on note-on. **release**: Region will play on note-off or sustain pedal off. … **first**: Region
   * will play on note-on, but if there's no other note going on (commonly used for or first note in a legato phrase). **legato**: Region will play on note-on, but
   * only if there's a note going on (notes after first note in a legato phrase). **release_key**: Region will play on note-off. Ignores sustain pedal."* The same table
   * makes `release_key` the one **SFZ v2** addition and gives the opcode the default `attack`. sfizz's set is identical — `enum class Trigger { attack = 0, release,
   * release_key, first, legato };` (`src/sfizz/Defaults.h:42`) with `ESpec<Trigger> trigger { Trigger::attack, {Trigger::attack, Trigger::release_key}, 0 };`
   * (`Defaults.cpp:207`).
   *
   * **`last` is not one of them.** The work order names it as a possible value and the page does not carry it — this is written down as *not found* rather than
   * mapped to something that sounds similar. A file that does write `trigger=last` therefore has an **unknown** value, which is why the type has a third arm: the
   * parser keeps the raw spelling in `opcodes.trigger` either way, and `noteOnTrigger` refuses to let a value it does not know sound on note-on.
   *
   * ⭐ **Absent means "the opcode was never written", which is `attack` by the specification's own default** — the same distinction `swLast` draws for `-1`. The
   * `parse.ts` reader folds the default in (a region's `trigger` is the `attack` the format specifies), so a caller never has to re-implement the default; the raw
   * opcode stays in `opcodes` so a caller that wants "declared or defaulted" can still see it.
   */
  trigger?: "attack" | "release" | "release_key" | "first" | "legato" | "unknown";
  /** The spelling of an unrecognised `trigger=`, kept so a report can name it instead of guessing. Undefined for every known value. */
  triggerUnknown?: string;
  /**
   * ⭐ **The file that wrote this region** — the `#include`d file it sits in, or the program itself. Absent when the caller did not supply the expansion's
   * `sources` map (a hand-written string, a fixture), because "declared in the program" and "provenance not recorded" are different facts and this field must not
   * confuse them.
   *
   * It exists because the reference engine and this project disagree about what a sample path is relative to, and the disagreement is **measured rather than
   * assumed**. sfizz resolves `sample=` against the **main program's directory** plus the `default_path` in force (its `Synth::Impl::buildRegion` hands the Layer only
   * `defaultPath_`; `Region::parseOpcode` builds `defaultPath + sample`; `FilePool` opens `rootDirectory / filename`), and a render says the same thing: a fixture
   * whose `Programs/root.sfz` includes `Programs/sub/art.sfz`, where `art.sfz` writes `sample=..\Samples\tone.wav`, plays at peak **0.0604** through the root and
   * **0.00003** through `art.sfz` as its own entry point. `karoryfer.war-tuba` is that shape: all six acoustic roots include their articulations, the articulations write
   * `..\Samples\…`, and those 3 850 references **resolve correctly through the root and nowhere else**.
   *
   * So the field is provenance, not a different resolver: it lets a caller that wants the **other** reading have it explicitly
   * (`sampleAssetForPath(path, { …, declaredIn })`, or `samplePathRelativeToProgram`), which is the only way a sub-program can be a usable entry point — and it is a
   * deliberate divergence from sfizz, stated here so it cannot be mistaken for parity.
   */
  sourcePath?: string;
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
 * ⭐ **A key opcode may be written as a note name, and reading one as a number is a wrong answer rather than a missing one.**
 *
 * SFZ allows `c4`, `c#4` and `db4` wherever a MIDI number is allowed (`key`, `lokey`, `hikey`, `pitch_keycenter`). `num()` returns its fallback for those,
 * and the fallback for `lokey`/`hikey` is **0–127** — so every region of the file matches every note, the narrowest-range rule has nothing to narrow between, and
 * the instrument plays its *first* region for the whole keyboard. That is not silence, which would be noticed; it is a plausible wrong answer, which is the failure
 * this workstream keeps having to hunt down. Two real libraries in this round do exactly that: `Discord GM/Melodic/105-Sitar.sfz` (`pitch_keycenter=c2`, `lokey=c0`)
 * and Sonatina's brass (`lokey=e3`, `pitch_keycenter=e3`).
 *
 * **The octave convention is measured, not assumed.** `horns-sus-mp-e2-PB-loop.wav` is declared `pitch_keycenter=40` in the same region that names it `e2`, so in this
 * family `e2` is MIDI 40 — that is scientific pitch notation with middle C `c4` = 60, i.e. `12 × (octave + 1) + semitone`. The alternative convention (`c4` = 48) would
 * put `e2` at 28 and detune every named region by an octave, which no listening test could have told apart from a badly recorded library.
 */
const NOTE_SEMITONES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

export function noteNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const text = value.trim().toLowerCase();
  if (text === "") return undefined;
  // A plain number is a MIDI note, and stays exactly as written — including the fractional values some files use.
  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) return asNumber;
  const match = /^([a-g])([#b]?)(-?\d+)$/.exec(text);
  if (!match) return undefined;
  const semitone = NOTE_SEMITONES[match[1]!]! + (match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0);
  return (Number(match[3]) + 1) * 12 + semitone;
}

/**
 * ⭐ **SFZ's `trigger` as one of the five values the specification lists, with the format's default folded in and an unrecognised spelling named rather than
 * swallowed.**
 *
 * The values and the default are the specification's own table (<https://sfzformat.com/opcodes/trigger/>): *"trigger | SFZ v1 | string | attack | attack, release,
 * first, legato"*, with `release_key` added under SFZ v2. sfizz's set is the same five — `enum class Trigger { attack = 0, release, release_key, first, legato };`
 * (`src/sfizz/Defaults.h:42`), default `Trigger::attack` (`Defaults.cpp:207`).
 *
 * **A value that is not one of the five becomes `unknown`, and that is deliberate.** This parser ignores opcodes it does not model, and for most of them that costs
 * nothing; here it would mean playing a region on note-on whose trigger the file used to say *"not on note-on"*. `noteOnTrigger` refuses an unknown value, and
 * `triggerUnknown` keeps the spelling so a report can name the file's word instead of inventing one.
 */
export function triggerOf(value: string | undefined): Pick<SfzRegion, "trigger" | "triggerUnknown"> {
  const text = value?.trim().toLowerCase();
  // Absent or empty is the specification's default, and it is folded in here so no caller has to re-implement it.
  if (text === undefined || text === "") return { trigger: "attack" };
  /**
   * `release_key` is SFZ v2 and some files write it without the underscore. Both spellings are read as the one value, because they are the same behaviour and a
   * file that writes the other one is not asking for something else — this is a spelling tolerance, not a sixth trigger.
   */
  const normalised = text === "releasekey" ? "release_key" : text;
  if (normalised === "attack" || normalised === "release" || normalised === "release_key" || normalised === "first" || normalised === "legato") {
    return { trigger: normalised };
  }
  /**
   * `trigger=off` is the spelling several real libraries use for "this region is silent on purpose"; it is **not** in the specification's list, and it is not
   * treated as `attack` — `noteOnTrigger` refuses it, so a silent region stays silent. `last` is here for the same reason: the work order names it, the
   * specification's table does not carry it, so it is recorded as unknown rather than guessed at.
   */
  return { trigger: "unknown", triggerUnknown: text };
}

/**
 * ⭐ **Whether a region may sound on a note-on** — the one rule the `trigger` opcode needs on a path that has no note-off.
 *
 * The specification's own words decide it (<https://sfzformat.com/opcodes/trigger/>):
 *
 * ```
 *   attack       "Region will play on note-on."                                          → yes
 *   first        "Region will play on note-on, but if there's no other note going on"     → yes, with the divergence below
 *   legato       "Region will play on note-on, but only if there's a note going on"       → no: this path has no other note
 *   release      "Region will play on note-off or sustain pedal off."                     → no
 *   release_key  "Region will play on note-off. Ignores sustain pedal."                   → no
 * ```
 *
 * The reference engine agrees, and it is the reason `first` and `legato` are not treated as one thing: `Layer::registerNoteOn` returns
 * `keyOk && velOk && randOk && (attackTrigger || firstLegatoNote || notFirstLegatoNote)` where `firstLegatoNote` is
 * `region.trigger == Trigger::first && midiState_.getActiveNotes() == 1` and `notFirstLegatoNote` is
 * `region.trigger == Trigger::legato && midiState_.getActiveNotes() > 1` (`src/sfizz/Layer.cpp:78-82`, pinned `f5c6e29f23b8057867c08e88f5f6ac6738baa30b`).
 * So `legato` **requires** another note to be sounding, which a note-on with no held key never has — and this project's offline lane schedulers emit note-ons only, so
 * nothing is ever "going on". `first` is a note-on trigger and is kept.
 *
 * ⚠️ **The divergence, said out loud rather than hidden:** sfizz admits a `first` region only when exactly one note is active, so it sounds the *first* note of a
 * phrase and not the ones after it. Nothing on this path can count active notes (a note-off is never delivered), so a `first` region is admitted here for **any**
 * note-on — a superset that includes sfizz's case. It is the same reading the `sw_down`／`sw_up`／`sw_previous` note records for opcodes that need a live keyboard:
 * the honest choice is the one that cannot be right by accident, and a note-on sound for a note-on trigger is not a wrong sound the way a key-release noise is.
 * `docs/KEYSWITCH.md` §6 carries the full census and this divergence.
 *
 * A region whose `trigger` is `unknown` is refused: a value this project cannot read is not evidence for "plays on note-on", and the failure the rule exists to
 * remove — a key-release noise answering a key press — is exactly what guessing would put back.
 */
export function noteOnTrigger(region: SfzRegion): boolean {
  return region.trigger === "attack" || region.trigger === "first";
}

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

export function parseSfz(text: string, options: { sources?: ReadonlyArray<{ from: number; to: number; file: string }> } = {}): SfzRegion[] {
  // ⭐ The `#define` layer runs first: a definition applies from its point onward, and doing it here means the parser never sees a directive nor a `$NAME` it could have resolved.
  text = applyDefines(text).text;
  /**
   * ⭐ **The line-based provenance, read from the expansion's own map, so a region knows which file wrote it.**
   *
   * `from`/`to` are half-open line ranges and the runs are contiguous and sorted, so a pointer that only moves forward resolves each line in amortised constant time —
   * which matters: a real `war-tuba` root program is 20 000-odd lines through 12 includes, and a linear search per line would be quadratic.
   */
  const sourceAt = (line: number): string | undefined => {
    const runs = options.sources;
    if (!runs || runs.length === 0) return undefined;
    // A binary search, because the runs are contiguous and sorted and a `war-tuba` root is long enough for it to matter.
    let low = 0;
    let high = runs.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const run = runs[middle]!;
      if (line < run.from) high = middle - 1;
      else if (line >= run.to) low = middle + 1;
      else return run.file;
    }
    return undefined;
  };
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
   * **measured against sfizz** in the criterion and quoted line by line in the `<master>` branch below.   */
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

  for (const [lineIndex, rawLine] of text.split(/\r?\n/).entries()) {
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
         * sets `tune_cc90=1200`, so an octave of transposition is the signal that a value survived:         *
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
         *
         * ⭐ **What that measurement did not cover is `<master>` → `<master>`, and the second half of the rule is there:** the two scopes are stored separately, so a new `<master>` clears master values while the `<global>` values survive it (and a new `<global>` clears global values while master values survive). Karoryfer's programs are four `<master>` blocks in a row and only work under that reading — see the note on `master` above.
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
        current = master;      } else if (name === "group") {
        group = {};
        current = group;
      } else if (name === "region") {
        current = {};
        const source = sourceAt(lineIndex);
        regions.push({
          ...DEFAULTS,
          sample: "",
          opcodes: current,
          unresolved: [],
          inherited: { ...global, ...master, ...group },
          // Only present when the caller supplied the map, so "declared in the program" is never invented from a missing map.
          ...(source === undefined ? {} : { sourcePath: source }),
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
      lokey: noteNumber(merged.lokey) ?? noteNumber(merged.key) ?? DEFAULTS.lokey,
      hikey: noteNumber(merged.hikey) ?? noteNumber(merged.key) ?? DEFAULTS.hikey,
      lovel: num(merged.lovel, DEFAULTS.lovel),
      hivel: num(merged.hivel, DEFAULTS.hivel),
      // Left undefined when absent, because "no transposition" is the real behaviour and 60 is only a value a file may choose.
      pitchKeycenter: merged.pitch_keycenter === undefined ? undefined : noteNumber(merged.pitch_keycenter) ?? num(merged.pitch_keycenter, 0),
      /**
       * ⭐ **`sw_last` and `sw_default`, read the way a key is read** — a note name or a number, because SFZ allows both and the library that motivated this writes
       * numbers while the VSCO keyswitch programs write `c6`. A value that is neither stays absent rather than becoming a number: an unreadable keyswitch is not
       * keyswitch 0, and defaulting it would gate the region on a value the file never named.
       */
      ...(noteNumber(merged.sw_last) === undefined ? {} : { swLast: noteNumber(merged.sw_last) }),
      ...(noteNumber(merged.sw_default) === undefined ? {} : { swDefault: noteNumber(merged.sw_default) }),
      ...(noteNumber(merged.sw_lokey) === undefined ? {} : { swLow: noteNumber(merged.sw_lokey) }),
      ...(noteNumber(merged.sw_hikey) === undefined ? {} : { swHigh: noteNumber(merged.sw_hikey) }),
      /**
       * ⭐ **The rest of the `sw_*` family, read the same way and for the same reason** — a note name or a number, absent when neither.
       *
       * `sw_vel` is the one non-numeric member: its two values are `current` (SFZ's own default, <https://sfzformat.com/opcodes/sw_vel/>) and `previous`, so it is read
       * as a flag rather than a key. A file writing anything else gets `false`, which is `current`'s behaviour rather than a manufactured override.
       */
      ...(noteNumber(merged.sw_lolast) === undefined ? {} : { swLoLast: noteNumber(merged.sw_lolast) }),
      ...(noteNumber(merged.sw_hilast) === undefined ? {} : { swHiLast: noteNumber(merged.sw_hilast) }),
      ...(noteNumber(merged.sw_down) === undefined ? {} : { swDown: noteNumber(merged.sw_down) }),
      ...(noteNumber(merged.sw_up) === undefined ? {} : { swUp: noteNumber(merged.sw_up) }),
      ...(noteNumber(merged.sw_previous) === undefined ? {} : { swPrevious: noteNumber(merged.sw_previous) }),
      ...(merged.sw_vel?.trim().toLowerCase() === "previous" ? { swVelPrevious: true } : {}),
      /**
       * ⭐ **`trigger`, read with the format's own default folded in and an unknown spelling kept rather than dropped.**
       *
       * The value is what the region needs to answer "am I a note-on sound?" — see `noteOnTrigger`. The default is `attack` from the specification's table, so a
       * region that never writes the opcode reads `attack` here; `opcodes.trigger` still holds only what the file actually wrote, which is what makes "declared"
       * and "defaulted" separable for a report.
       */
      ...triggerOf(merged.trigger),
      // `tune` plus whatever the controller-driven tuning adds at rest, so a region's cents are the cents it will play.
      tuneCents: num(merged.tune, DEFAULTS.tuneCents) + ccTuneCents(merged, cc),
      seqLength: Math.max(1, num(merged.seq_length, DEFAULTS.seqLength)),
      seqPosition: Math.max(1, num(merged.seq_position, DEFAULTS.seqPosition)),
      ...(applicable === undefined ? {} : { defaultPath: applicable }),
      ...(problem === undefined ? {} : { defaultPathProblem: problem }),
      // The provenance captured when the region was created, carried out unchanged: it is a fact about where the line was, which the end of the file cannot recover.
      ...(region.sourcePath === undefined ? {} : { sourcePath: region.sourcePath }),
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
 *
 * ⭐ **And `sw_label` is the second such value, measured the same way.** Every one of the pinned library's `-KS`
 * programs writes an articulation's name unquoted and with spaces — `sw_label=C2 Sustain Vibrato`,
 * `sw_label=D#2 Pizzicato`, `sw_label=C#2 Tremolo` — and under the whitespace rule they arrived as `C2`, `D#2` and
 * `C#2`, i.e. as bare note names, which is exactly the information that says *which* articulation a switch selects.
 * The reference engine reads the whole name: `src/sfizz/parser/Parser.cpp` extracts the value to end of line and
 * cuts only before a token shaped like `name=`, so `sw_label=Sine lokey=41` is `Sine` while
 * `sw_label=C2 Sustain Vibrato` is the whole name, and `Region.cpp` stores it with
 * `case hash("sw_label"): keyswitchLabel = opcode.value;`. `keyswitch.ts` is what needs it.
 */
function scanOpcodes(line: string, into: Record<string, string>): void {
  /** The opcodes whose value is a name or a path that may contain spaces unquoted (see the note above). */
  const SPACE_BEARING = new Set(["sample", "sw_label"]);
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

    if (SPACE_BEARING.has(name)) {
      const following = /\s+[a-zA-Z0-9_]+\s*=/.exec(line.slice(valueStart));
      const end = following ? valueStart + following.index : line.length;
      into[name] = line.slice(valueStart, end).trim().replace(/^"|"$/g, "");
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
 * ⭐ **The keyswitch a file declares as its power-on default, or `undefined` when it declares none.**
 *
 * `sw_default` is SFZ v2's / ARIA's opcode, so its default is genuinely absent rather than a number (<https://sfzformat.com/opcodes/sw_default/>: version SFZ v2,
 * default `N/A`) — and the **absence is a behaviour, not a gap**: <https://sfzformat.com/opcodes/sw_last/> states that an instrument which uses `sw_last` to select
 * articulations *"will not have a default articulation preselected, meaning when loaded, it will play no sound until one of the keyswitches is pressed"*. This project
 * live keyboard supplies the value that opens the gate (`KeyswitchState`, `keyswitch.ts`); a caller without one has to turn that sentence into a rule, and the rule here is
 * the literal one:
 *
 * · **a value is active** when the caller passes `switch`, or when the file declares a `sw_default` — and then only the regions whose `sw_last` matches it are selectable;
 * · **no value is active** — a file with `sw_last` regions and no `sw_default`, and no caller switch — and then **every `sw_last`-gated region is out**, because its
 *   condition can never have been met. Regions that declare no `sw_last` are unaffected: they are not keyswitch candidates at all.
 *
 * The price is stated rather than hidden: the eight pinned VSCO `-KS` programs are exactly this shape, and under this rule they answer nothing until a switch is
 * supplied — which is what sfizz does with them, and what `sfzSwKeyswitch.test.ts` pins so the choice is on the record instead of discovered later. ⭐ **And "a switch is
 * supplied" is now something a caller can actually do**: `techniqueSwitchFor` turns the articulation a track chose into a `sw_last` value through the file's own `sw_label`,
 * and `KeyswitchState` holds the value a live keyboard presses — the strict rule below is what makes both of them necessary rather than optional.
 *
 * ## ⭐ Which declaration wins when a file writes more than one: **the last**, and that is the reference engine's rule
 *
 * sfizz's `Synth::Impl::buildRegion` ends with
 *
 * ```cpp
 * if (lastRegion->defaultSwitch)
 *     setCurrentSwitch(*lastRegion->defaultSwitch);
 * ```
 *
 * and `buildRegion` runs **once per `<region>`, in file order** (`Synth::Impl::onParseEvent`, `case hash("region"): buildRegion(members); break;` —
 * <https://github.com/sfztools/sfizz/blob/f5c6e29f23b8057867c08e88f5f6ac6738baa30b/src/sfizz/Synth.cpp#L128> and `#L213-L214`). So the value left in
 * `currentSwitch_` is the one from the **last region built whose effective `sw_default` is defined** — the last declaration, not the first. This function
 * used to return the first, which is a different answer for any file whose defaults disagree, and the difference is "which articulation you hear when the
 * patch loads".
 *
 * Measured cost on the pinned `-KS` programs: **none** — every one of them that repeats a `sw_default` repeats a single value (`CelloEns-KS.sfz` writes
 * `c6` in all six of its groups), so first and last agree on all eight files. It is still the reference engine's rule rather than ours, and a file with two
 * different defaults is the case that tells them apart; `sfzKeyswitchTechnique.test.ts` holds that case.
 */
export function declaredSwitchDefault(regions: readonly SfzRegion[]): number | undefined {
  for (let index = regions.length - 1; index >= 0; index -= 1) {
    const value = regions[index]!.swDefault;
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Whether **this file's** `sw_last` regions can be reached at all — true when a `sw_default` exists, and false when the file is the documented "silent until a
 * keyswitch is pressed" shape. A caller with a live keyboard passes `switch` and never consults this.
 */
export function hasReachableSwitch(regions: readonly SfzRegion[]): boolean {
  return declaredSwitchDefault(regions) !== undefined;
}

/**
 * ⭐ **The live keyswitch state a region is gated against** — one value per opcode that can only be known from a keyboard.
 *
 * It is a type of its own rather than four more inline parameters because `regionsForNote`, `playbackForNote` and `KeyswitchState` all have to agree about it word for
 * word, and "the second copy of one rule" is the defect this workstream keeps paying for.
 *
 * Every field is **optional, and absent means "not supplied" rather than "nothing held"**. That distinction is the whole of the offline path's backwards
 * compatibility: `down`／`up` absent is what an offline caller passes, and a region gated on `sw_down` then cannot be reached — which is the literal rule, since
 * <https://sfzformat.com/opcodes/sw_down/> makes the region's condition *"the key … is depressed"* and nothing is depressed without a keyboard.
 */
export interface SwitchGate {
  /** The sticky keyswitch in force — `sw_last`'s value (see `swLast`), or the file's `sw_default`. */
  switch?: number;
  /** The file's `sw_default`, used only when no live value was supplied. */
  switchDefault?: number;
  /** The `sw_down` targets **currently held down**. */
  down?: ReadonlySet<number>;
  /** The `sw_up` targets **currently held down** — such a region plays while its key is *not* depressed. */
  up?: ReadonlySet<number>;
  /** The pitch of the **previous note-on**, for `sw_previous`. Undefined means there was none. */
  previousNote?: number;
  /** Its velocity, for `sw_vel=previous`. */
  previousVelocity?: number;
}

/**
 * Which region a note and velocity select, out of those that cover them.
 *
 * Order matters and is not obvious: SFZ picks the region whose key range is **narrowest** around the note (the "most specific" match), and this returns the first of
 * those in file order — which is the documented behaviour for the layer/round-robin cases this subset covers. Round-robin selection is a separate call, because it
 * depends on how many times the note has already been played.
 *
 * ## ⭐ The keyswitch gate
 *
 * `sw_last` means *"Enables the region to play if the last key pressed in the range specified by sw_lokey and sw_hikey is equal to the `sw_last` value"*
 * (<https://sfzformat.com/opcodes/sw_last/>). There is no last key press here, so the value comes from, in order:
 *
 * 1. **`options.switch`** — a caller that has one (a live keyboard, a test, an explicit articulation choice). It wins outright.
 * 2. **`options.switchDefault`** — the file's `sw_default`, or `declaredSwitchDefault(regions)`.
 * 3. **Nothing** — and then a region gated by `sw_last` is **not selectable**, because its condition was never satisfied. A file in that shape is the format's own
 *    "plays no sound until one of the keyswitches is pressed"; the caller can tell that apart from "the file covers no such key" by reading the regions' `swLast`.
 *
 * A region with **no** `sw_last` is never gated: the opcode's default is `-1`, which is out of range and therefore "not declared" rather than "declared as -1".
 *
 * ## ⭐ And the three opcodes that need a live keyboard, which this used to read and ignore
 *
 * `sw_down`, `sw_up` and `sw_previous` are gated from `SwitchGate` — `sw_lolast`／`sw_hilast` widen `sw_last` to a range. Each one's absence closes its own region
 * rather than opening it, which is the same literal reading the `sw_last` rule above takes, and `SwitchGate`'s own note says why an offline caller therefore reaches
 * none of them.
 */
export function regionsForNote(
  regions: readonly SfzRegion[],
  note: number,
  velocity = 100,
  channel = 1,
  options: SwitchGate = {}
): SfzRegion[] {
  const keyswitch = options.switch ?? options.switchDefault;
  const covering = regions.filter(
    (region) =>
      /**
       * ⭐ **A region whose `trigger` is not a note-on trigger does not answer a note-on** — the defect this filter exists for.
       *
       * Measured on the shipped `salamander-grand` at pin `3382bf9496bba2486f5ab0de55a264d1dfc38404`: MIDI 60, any velocity, resolved through this repository's own
       * `parseSfz` ＋ `regionsForNote` to **`rel40.flac`** — a *hammer-release noise*, because the file's second `<global>` says `trigger=release` and every included
       * `Data/hammer.txt` region inherits it. The release region also writes `key=40`, so its span is **one key wide** while the piano notes' regions are three keys
       * wide (`lokey=59 hikey=61 pitch_keycenter=60`), and the narrowest-covering-region rule below therefore preferred the key-release noise over the note itself.
       * Ignoring the opcode was not a missing feature in a corner: it made the piano play a noise on every note-on.
       *
       * The rule itself, and why `first` is admitted while `legato` is not, is `noteOnTrigger`'s own note. This is a **preference** filter placed here — where the
       * note-on question is asked — and not a deletion from the parsed regions, so `resolveInstrumentNote` can still report a file whose only regions are release
       * samples rather than pretending they do not exist.
       */
      noteOnTrigger(region) &&
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
      /**
       * ⭐ **`sw_vel=previous` is a per-region velocity**, so the velocity test is per region too.
       *
       * sfizz does the same substitution before matching: `Layer::registerNoteOn` and `Voice.cpp` both read
       * `if (region.velocityOverride == VelocityOverride::previous) velocity = midiState_.getVelocityOverride();`. A file that asks for it and a caller that has no
       * previous velocity keeps the note's own, which is the `current` behaviour rather than a manufactured one.
       */
      effectiveVelocity(region, velocity, options) >= region.lovel &&
      effectiveVelocity(region, velocity, options) <= region.hivel &&
      switchAllows(region, keyswitch, options)
  );
  void channel;
  if (covering.length === 0) return [];
  const narrowest = Math.min(...covering.map((region) => region.hikey - region.lokey));
  return covering.filter((region) => region.hikey - region.lokey === narrowest);
}

/** The velocity a region is actually matched and played with — its own, or the previous note's when `sw_vel=previous`. */
function effectiveVelocity(region: SfzRegion, velocity: number, gate: SwitchGate): number {
  if (region.swVelPrevious && gate.previousVelocity !== undefined) return gate.previousVelocity;
  return velocity;
}

/**
 * Whether a region's switch conditions are all satisfied, and `true` for a region that declares none of them — such a region is not a keyswitch candidate at all (each
 * opcode's own default is out of range, so "not declared" rather than "declared as -1").
 *
 * Every arm **closes** on absence: `sw_last` with no value in force is the format's *"silent until a keyswitch is pressed"*; `sw_down`／`sw_up` with no live keyboard
 * is a condition that has never been met; `sw_previous` with no previous note-on is a note that was never played.
 */
function switchAllows(region: SfzRegion, keyswitch: number | undefined, gate: SwitchGate): boolean {
  /**
   * `sw_lolast`／`sw_hilast` replace `sw_last` with a range, and either alone is a one-value range — sfizz builds `emplace(value, value)` and then moves one end
   * (`Region.cpp`, the `sw_lolast`／`sw_hilast` arms). So the low end is `sw_lolast`, else `sw_last`; the high end is `sw_hilast`, else `sw_last`.
   */
  const lastLow = region.swLoLast ?? region.swLast;
  const lastHigh = region.swHiLast ?? region.swLast;
  if (lastLow !== undefined || lastHigh !== undefined) {
    if (keyswitch === undefined) return false;
    const low = Math.min(lastLow ?? lastHigh!, lastHigh ?? lastLow!);
    const high = Math.max(lastLow ?? lastHigh!, lastHigh ?? lastLow!);
    if (keyswitch < low || keyswitch > high) return false;
    if (region.swLow !== undefined && keyswitch < region.swLow) return false;
    if (region.swHigh !== undefined && keyswitch > region.swHigh) return false;
  }
  if (region.swDown !== undefined && !(gate.down?.has(region.swDown) ?? false)) return false;
  if (region.swUp !== undefined && (gate.up?.has(region.swUp) ?? false)) return false;
  if (region.swPrevious !== undefined && gate.previousNote !== region.swPrevious) return false;
  return true;
}

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
