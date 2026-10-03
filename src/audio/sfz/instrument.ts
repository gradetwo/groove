/**
 * A note against a **catalogue entry that is an instrument** — the bridge between the SFZ work and the playback path that already exists.
 *
 * It introduces no arithmetic of its own. `parseSfz` decides which regions exist, `playbackForNote` decides which one answers the note and at what ratio, and this
 * function only connects them to a catalogue id and turns "nothing covers this note" into a reason a composer can read. Writing a second copy of that arithmetic here
 * would be the same defect this workstream keeps removing, one layer up.
 *
 * Fetching the SFZ text is deliberately **not** done here: I/O is not pure, and this stays pure so its criteria need no browser and no network.
 */
import { parseSfz, readControlDefaults, declaredSwitchDefault, noteOnTrigger } from "./parse";
import { regionsAtCc } from "./ccGate";
import { playbackForNote, playbackGap } from "./regionPlayback";
import { techniqueSwitchFor, type KeyswitchState } from "./keyswitch";
import { isAbsolutePath, samplePathRelativeToProgram } from "./defaultPath";
import type { SfzRegion, SwitchGate } from "./parse";
import type { SampleAsset } from "../../data/sampleCatalogue";

export interface ResolvedInstrumentNote {
  /** The sample path exactly as the SFZ wrote it — resolution to bytes is the loader's job, as it always was. */
  samplePath: string;
  rootKey: number;
  /** Playback rate: 1 means "at the recorded pitch". */
  ratio: number;
  seqPosition: number;
  /**
   * ⭐ **SFZ's choke groups, which a drum kit cannot be played without.**
   *
   * `group=N` puts a region in a group, and `off_by=N` says "starting me stops whatever is sounding in group N". That is how a closed hi-hat silences an open one, and a kit whose hats overlap is audibly wrong however good the samples are. The real library this project pins uses both (`group=41` and `off_by=41`).
   *
   * It comes out of the resolver rather than being read again by the caller because **only the resolver knows which region answered the note**: one instrument holds the closed hat and the open one, and the file decides which is which.
   */
  group?: number;
  offBy?: number;
  /**
   * ⭐ **What the region says about looping** — SFZ's `loop_mode`, carried for the **player**, because only a
   * `AudioBufferSourceNode` can act on it and only the resolver sees the file.
   *
   * **The owner's report read the cause upside down, and the measurements are why this field exists at all.** The
   * report was that a sustaining instrument collapses because `ViolinEnsSusVib` declares a loop the player ignores.
   * Measured: that program declares **no** loop opcode — nor does any of the pinned `VSCO-2-CE@6dd651d`'s 75 programs,
   * and its sustained `.wav`s carry no `smpl` chunk — and `/usr/bin/sfizz_render` plays the note once and goes silent
   * at 12.5 s, exactly as this project does. So the VSCO strings are one-shot recordings and no loop semantics can
   * change that. **This field is not for them.** It is for the files that *do* declare one: `karoryfer-meatbass`
   * writes `loop_mode=loop_sustain` in a `<global>` block, and before this existed those regions looped nowhere.
   *
   * The values, all measured through sfizz rather than read off the opcode's name (`loop_mode` takes several, and a
   * bare `continuous` is **not** one of them — sfizz answers `Unknown loop mode: continuous` and plays once):
   *
   * ```
   *   absent / no_loop      plays once and stops at the sample's end            (the default this project always had)
   *   one_shot              plays once, and a key release does not stop it      (the `oneShot` field above)
   *   loop_continuous       loops while the note sounds; the release does not end the loop
   *   loop_sustain          loops while the note is held; the release exits the loop and plays to the sample's end
   * ```
   *
   * A value this subset does not model stays **absent** rather than becoming a guess, and the note then plays exactly
   * as it did before this field existed.
   */
  loopMode?: "loop_continuous" | "loop_sustain";
  /**
   * The loop's **start and end in frames of the sample**, straight from SFZ's `loop_start`/`loop_end`, which are
   * sample frames and not seconds.
   *
   * `loopEndFrames` absent means SFZ's own default — the sample's last frame — and the **player** resolves that against
   * the decoded buffer, because a frame count is not comparable to a duration until the buffer is in hand. See
   * `samplerVoice` for the conversion and for why it is not done here.
   */
  loopStartFrames?: number;
  loopEndFrames?: number;
  /**
   * ⭐ **Whether the sample plays through a key release**, which SFZ spells `loop_mode=one_shot`.
   *
   * Measured with sfizz rather than inferred from the opcode's name: the same 0.1-second note on a one-second sample renders **2.091 s** with `loop_mode=one_shot` and **0.341 s** without it, and the energy 0.2–0.6 s after the note-off is nonzero only in the first. So a drum kit that says `one_shot` means "this hit rings out
   * however briefly you press the key" — and a player that stops at note-off truncates every drum hit.
   */
  oneShot?: boolean;
  /**
   * **How many voices of one note may sound at once**, which SFZ spells `note_polyphony=N`. Measured with sfizz on four hits of the same note, each letting the sample ring: absent → 4.04 voices' worth of level, `note_polyphony=1` → 1.01, `=2` → 2.02, `=3` → 3.03. So the opcode caps the simultaneous voices of that note, and **which voice survives was measured too**: with a loud first hit and three quiet ones at `note_polyphony=1` the level stays at the loud one's (0.0831 against a 0.0811 reference), so the **new note is refused** while the cap is reached rather than replacing the oldest.
   */
  notePolyphony?: number;
  /**
   * **A linear scale on the note's level**, from `amplitude_onccN` — see the resolver for the measurement. Absent means unchanged, so a file that says nothing about controllers sounds exactly as it did before this existed.
   */
  gainScale?: number;
  /**
   * The `default_path` that applies to **the region that answered this note**, which the loader joins to `samplePath` before it becomes an address.
   *
   * It travels with the note for the same reason the choke group does: only the resolver knows which region answered, and the path is a property of where in the file that
   * region was written. The pinned library's eight keyswitch programs each declare 2–5 paths in one file, so a caller reading one value for the file resolves some notes
   * into directories their samples are not in — a missing file rather than an error.
   */
  defaultPath?: string;
  /**
   * Why that path is not knowable, when it is not — a region written before the `<control>` block that declares a path. Present means the caller must report it rather than
   * resolve the sample against a guess.
   */
  defaultPathProblem?: string;
  /**
   * ⭐ **Which keyswitch articulation answered**, so the choice is visible instead of inferred from a sample name.
   *
   * `switchState` is the value the selection was made under (`sw_default` when the file declares one and the caller passed none), and `switchLabel` is ARIA's own
   * `sw_label` from the region that answered — `"Staccato"`, `"Sustain"`. A caller can therefore print *why* this sample and not the other one, which is what §27 asks of
   * a partially implemented opcode family: silence about the reason is how a wrong articulation becomes undistinguishable from a missing one.
   */
  switchState?: number;
  switchLabel?: string;
  /**
   * ⭐ **The file that declared the region which answered** — the provenance `parseSfz` recorded from the expansion, when the caller supplied it. It travels with the
   * note for the same reason `defaultPath` does: only the resolver knows which region answered, and a caller that wants the declaring-file reading of a sample path
   * cannot recover it from the program URL afterwards.
   */
  sourcePath?: string;
}

export interface InstrumentResolution {
  ok: boolean;
  note?: ResolvedInstrumentNote;
  /** Why not, in words a reply can carry — never a silent default. */
  reason?: string;
  /** The regions the file actually defines, so a caller can report rather than guess when something is wrong. */
  regions: SfzRegion[];
}

/**
 * SFZ's `loop_mode` as one of four behaviours, or `undefined` when the file names none this subset models.
 *
 * **Exported, and used for `oneShot` too, because the two readers were about to disagree.** The old code compared the
 * raw opcode to the literal `"one_shot"`, which is right for every file ever seen and silently wrong for
 * `loop_mode=ONE_SHOT` — and now that a second reader exists, "one reader, one answer" is the rule the rest of this
 * file already follows.
 *
 * The names are what sfizz actually accepts, measured: a file that writes the bare `continuous`/`sustain` gets
 * `Unknown loop mode: …` on stderr and plays once, so those spellings are **deliberately not** mapped to looping. The
 * same measurement refuses `loop_until_release` and `loop_continuous_release`, and neither is mapped either — guessing
 * at one would be inventing a behaviour from the opcode's name, which is the mistake this workstream keeps removing.
 */
export function loopModeOf(value: string | undefined): "loop_continuous" | "loop_sustain" | "one_shot" | "no_loop" | undefined {
  if (value === undefined) return undefined;
  switch (value.trim().toLowerCase()) {
    case "loop_continuous":
      return "loop_continuous";
    case "loop_sustain":
      return "loop_sustain";
    case "one_shot":
      return "one_shot";
    case "no_loop":
      return "no_loop";
    default:
      return undefined;
  }
}

/**
 * One of SFZ's frame-valued loop opcodes as a frame count, or `undefined` when it is absent or not a usable frame.
 *
 * A count that is not a whole number, or is negative, is **not a loop point**: SFZ writes frames, and a file that writes
 * `loop_start=-1` or `loop_end=1.5` has said something the format does not allow. Returning `undefined` leaves the
 * player on SFZ's own default rather than on a manufactured frame.
 */
function loopFrameOf(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  /**
   * A **whole non-negative number and nothing else**. `Number.parseInt("1.5")` is 1 and `Number.parseInt("12abc")` is
   * 12, and both would turn a value the format does not allow into a loop point that looks deliberate — the class of
   * silent-wrong-answer this workstream keeps removing. A file that writes either is not asking for a loop here.
   */
  if (trimmed === undefined || !/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

/**
 * Resolve one note for one instrument entry.
 *
 * Failure is a **result**, not an exception and not a default: an entry with no `sfz`, empty SFZ text, a file with no regions, or a note outside every region each
 * return `ok: false` with a reason. That is the same standard the ninth track kind was held to — a reference naming nothing is an **error rather than silence**.
 */
export function resolveInstrumentNote(
  asset: Pick<SampleAsset, "assetId" | "sfz">,
  sfzText: string,
  note: number,
  /**
   * `sources` is the expansion's line map, when the caller has one (`expandIncludes(...).sources`). Supplying it makes every region carry the file that declared it,
   * which the note then reports as `sourcePath`; omitting it is exactly the old behaviour and leaves the field absent.
   *
   * ⭐ `technique` is **the articulation the caller chose**, in the words a player uses ("spiccato", "pizzicato", "tremolo"). `techniqueSwitchFor` turns it into a
   * keyswitch value through the file's own `sw_label`, and it wins over the file's `sw_default` — which is the whole point, since six of the eight pinned `-KS`
   * programs declare no `sw_default` for the articulation being asked for and are silent without it. A name the file's own labels do not carry is **refused with
   * those labels named** rather than guessed at, and a file with no keyswitches at all is untouched by the option.
   *
   * ⭐ `keyswitch` is **the live state a caller is holding** (see `keyswitch.ts`). When it is present it is driven from here — the file is learned, the note-on already
   * recorded by the caller is read back as a gate, and every switch condition (`sw_last`, `sw_lolast`／`sw_hilast`, `sw_down`, `sw_up`, `sw_previous`, `sw_vel`) is
   * decided against it. Absent means the offline rule, exactly as it was.
   */
  options: {
    velocity?: number;
    nth?: number;
    sources?: ReadonlyArray<{ from: number; to: number; file: string }>;
    technique?: string;
    keyswitch?: KeyswitchState;
  } = {}
): InstrumentResolution {
  if (!asset.sfz) {
    return { ok: false, regions: [], reason: `sample "${asset.assetId}" is not an instrument (it has no sfz)` };
  }
  if (!sfzText || sfzText.trim() === "") {
    return { ok: false, regions: [], reason: `instrument "${asset.assetId}" has empty SFZ text` };
  }

  const regions = parseSfz(sfzText, options.sources === undefined ? {} : { sources: options.sources });
  if (regions.length === 0) {
    return { ok: false, regions, reason: `instrument "${asset.assetId}" defines no regions` };
  }

  /**
   * **The controller gates first, at the values the file itself declares.** `loccN`/`hiccN` decide whether a region exists rather than how loud it is, and with no controller sent the file's own `<control>` block is where those values come from — `virtuosity_drums`
   * turns every one of its microphones on by setting CC101 to 127 there. So a gate that would silence every region is not a bug in the file; it is a file whose defaults say so.
   */
  const audible = regionsAtCc(regions, readControlDefaults(sfzText));  if (audible.length === 0) {
    return { ok: false, regions, reason: `instrument "${asset.assetId}" has ${regions.length} region(s) and none of them sound at the controller values the file declares` };
  }

  /**
   * ⭐ **The power-on articulation, from the file's own `sw_default`.**
   *
   * `karoryfer.war-tuba`'s six acoustic programs are the measured reason this line exists: 14 articulations are `#include`d into each, every region of each carries
   * `sw_last` (24 = staccatissimo, 25 = staccato, 26 = sustain) and the `<global>` states `sw_default=25`. Without the gate the probe answered **note 60 as
   * `g2_ss_vl3_rr4_cnd.wav` — a staccatissimo — while the file asks for staccato**, because the narrowest-covering-range rule has nothing to choose between two
   * articulations that cover the same note. With it, the answer is the articulation the file declares, and `switchLabel` says so in the file's own words.
   *
   * A file with no `sw_default` gets `undefined`, which is exactly the old behaviour — see `declaredSwitchDefault` for why that rule is chosen and what it costs.
   */
  const switchDefault = declaredSwitchDefault(audible);
  /**
   * ⭐ **The chosen articulation, when the caller named one** — and the file's own `sw_label` is what turns a name into a switch value.
   *
   * `techniqueSwitchFor` returns `undefined` for a file with no `sw_last` regions at all, which is not a keyswitch question: a dedicated `ViolinEnsSpic.sfz`
   * asked for `spiccato` must still play, and it does, through the ordinary path. A name the file's labels do **not** carry is refused here, with the labels the
   * file does declare, rather than falling back to a default the caller did not ask for.
   */
  const chosen = options.technique === undefined ? undefined : techniqueSwitchFor(audible, options.technique);
  if (chosen !== undefined && !chosen.ok) {
    return { ok: false, regions, reason: `instrument "${asset.assetId}": ${chosen.reason}` };
  }

  /**
   * ⭐ **A live state decides everything, and it is driven here rather than at the call site** — because this is the only place that has the parsed regions, and
   * `KeyswitchState.observe` is what turns them into "which notes are switches".
   *
   * The caller has already recorded the note-on (in the order the keys were pressed, which is what `sw_previous` needs); this reads it back as the gate for this very
   * note. That split is deliberate: the press order belongs to the layer that owns the keyboard, and the file's facts belong to the layer that owns the parser.
   */
  let gate: SwitchGate | undefined;
  if (options.keyswitch) {
    const learned = options.keyswitch.observe(audible, options.technique);
    if (!learned.ok) return { ok: false, regions, reason: `instrument "${asset.assetId}": ${learned.reason}` };
    gate = options.keyswitch.gate();
  }
  /**
   * ⭐ **Only the regions whose `trigger` is a note-on trigger can answer a note-on** — the resolution half of the filter in `regionsForNote`.
   *
   * `regionsForNote` already refuses the others, so this changes no note it answers; what it changes is the **answer when there is none**. Without it,
   * `playbackGap(audible, …)` described the whole file's key range, and a caller asking why `salamander-grand` played nothing at a note would have been told *"the
   * file's regions cover keys 21–108"* — true of the file and useless as an explanation, because the note is covered and it is the **trigger** that is not satisfied.
   * Measuring against the note-on regions instead means the honesty this project asks for reaches the reason string as well as the sample choice.
   *
   * A file whose only regions are release samples therefore reports the format's own situation — *"no region of this file sounds on a note-on"* — rather than a
   * range that looks like a wrong note. The true note-off behaviour is **not** implemented and is recorded in `docs/KEYSWITCH.md` §6.
   */
  const playable = audible.filter(noteOnTrigger);
  if (playable.length === 0) {
    return {
      ok: false,
      regions,
      reason: `instrument "${asset.assetId}": every region is gated or triggered away from note-on, so no note can sound; ${audible.length} region(s) read, ${audible.filter((region) => region.trigger === "unknown").length} with a \`trigger\` this project does not know`,
    };
  }
  const playback = playbackForNote(playable, note, {
    ...options,
    ...(gate ?? {}),
    ...(chosen === undefined ? {} : { switch: chosen.switch }),
    // With a live state the state's own value is authoritative, and its seed already came from `sw_default` — passing the default too would re-open the gate behind it.
    ...(gate === undefined ? { switchDefault } : {}),
  });
  if (!playback) {
    return { ok: false, regions, reason: playbackGap(playable, note) };
  }

  /**
   * The choke group and what this region silences, read off the region that answered. **A number that is not a number is left absent rather than becoming `NaN`**: a file that writes `group=hat` has done something the format does not allow, and the honest result is a region with no group rather than every region in one.
   */
  const asInt = (value: string | undefined): number | undefined => {
    if (value === undefined) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const answered = audible.find((region) => region.sample === playback.sample);
  /**
   * A region whose applicable `default_path` cannot be known is refused here, before any caller can resolve its sample against a guess. The parser already says so on the
   * region; this is the point where it becomes an answer. The loader checks the same field again because it is the layer that would otherwise build a wrong address.
   */
  if (answered?.defaultPathProblem) {
    return { ok: false, regions, reason: `instrument "${asset.assetId}": ${answered.defaultPathProblem}` };
  }
  const group = asInt(answered?.opcodes.group);
  const offBy = asInt(answered?.opcodes.off_by);
  // `loop_mode` takes several values; only `one_shot` means "ignore the key release". Anything else keeps the note-off behaviour this project has always had.
  const oneShot = loopModeOf(answered?.opcodes.loop_mode) === "one_shot";
  /**
   * The two looping values, and the frames they loop between. Read from the region that answered, for the same reason
   * the choke group is: one instrument holds a staccato and a sustained articulation, and the file decides which one a
   * note reached.
   */
  const loopMode = loopModeOf(answered?.opcodes.loop_mode);
  const loopStartFrames = loopFrameOf(answered?.opcodes.loop_start);
  const loopEndFrames = loopFrameOf(answered?.opcodes.loop_end);
  // A value that is not a positive integer is **no cap**, not a cap of zero: `note_polyphony=0` would otherwise silence a note the file plainly intends to sound.
  const notePolyphony = asInt(answered?.opcodes.note_polyphony);
  const polyphonyCap = notePolyphony !== undefined && notePolyphony > 0 ? notePolyphony : undefined;
  /**
   * ⭐ **`amplitude_onccN`: a linear scale of `(CC ÷ 127) × (N ÷ 100)`.**
   *
   * Measured with sfizz rather than read off the opcode's name, and the four points fit exactly: with `amplitude_oncc1=100`, CC 32 gives −11.9 dB and CC 64 gives −5.9 dB, which are `20·log10(32/127)` and `20·log10(64/127)`; with the controller at 127, `N=50` gives −6.0 dB and `N=200` gives +6.0 dB. So the controller scales **linearly** (it is a percentage of level, not a number of decibels) and `N` is a percentage of that, which is why `N=100` is "unchanged".
   *
   * The controller values come from the file's own `<control>` block, exactly as the `locc`/`hicc` gates do: a file that never sends CC 101 has it at zero, and the measurement above says zero is silence — so a region whose controller is unset must not be quietly played at full level.
   */
  const controlValues = readControlDefaults(sfzText);
  let gainScale = 1;
  for (const [opcode, value] of Object.entries(answered?.opcodes ?? {})) {
    const matched = /^amplitude_oncc(\d+)$/.exec(opcode);
    if (!matched) continue;
    const controller = Number.parseInt(matched[1]!, 10);
    const percent = Number.parseFloat(String(value));
    if (!Number.isFinite(percent)) continue;
    const cc = controlValues.get(controller) ?? 0;
    gainScale *= (Math.max(0, Math.min(127, cc)) / 127) * (percent / 100);
  }

  return {
    ok: true,
    regions,
    note: {
      samplePath: playback.sample,
      rootKey: playback.rootKey,
      ratio: playback.ratio,
      seqPosition: playback.seqPosition,
      ...(group === undefined ? {} : { group }),
      ...(offBy === undefined ? {} : { offBy }),
      ...(oneShot ? { oneShot: true } : {}),
      // Only the two looping values travel: `no_loop` and `one_shot` mean "do not loop", and an absent field says that already.
      ...(loopMode === "loop_continuous" || loopMode === "loop_sustain" ? { loopMode } : {}),
      ...(loopStartFrames === undefined ? {} : { loopStartFrames }),
      ...(loopEndFrames === undefined ? {} : { loopEndFrames }),
      ...(polyphonyCap === undefined ? {} : { notePolyphony: polyphonyCap }),
      ...(gainScale === 1 ? {} : { gainScale }),
      // The path the answering region answers to, and the reason it has none when that is the truth — never a substitute value.
      ...(answered?.defaultPath === undefined ? {} : { defaultPath: answered.defaultPath }),
      ...(answered?.defaultPathProblem === undefined ? {} : { defaultPathProblem: answered.defaultPathProblem }),
      // And the articulation that answered, in the file's own words when it has any.
      ...(playback.switchState === undefined ? {} : { switchState: playback.switchState }),
      ...(playback.switchLabel === undefined ? {} : { switchLabel: playback.switchLabel }),
      // And where the region was written, so a caller wanting the declaring-file reading does not have to guess it from the program URL.
      ...(answered?.sourcePath === undefined ? {} : { sourcePath: answered.sourcePath }),
    },
  };
}

/**
 * A region's `sample=` turned into **an address**, because a catalogue lookup cannot find it.
 *
 * The catalogue holds **instruments**, and a region names a **file** (`../Samples/kickmic/snare/x.flac`). Asking the catalogue for that path is what produced
 * `no sample "…" — the catalogue holds virtuosity-drums-basic`: not a missing library, a wrong kind of question.
 *
 * **Two addresses, resolved by URL semantics rather than arithmetic.** The path is relative to **the program file that wrote it**, so `new URL(samplePath, programUrl)` is correct by construction — and the
 * fallback is derived the same way from the mirror's address. That distinction matters because arithmetic is where this went wrong twice: a source URL that carried the mirror's `prefix`, and includes
 * resolved against the program's directory when their paths were root-relative. Here the two relationships are different, and only one of them is "relative to the program".
 */
export interface InstrumentAddresses {
  /** Where the program was fetched from, and where the mirror serves it. */
  programUrl: string;
  programFallbackUrl?: string;
  /**
   * ⭐ **A different base for the sample path: the file that declared the region**, when the caller wants the "how a sub-program would have meant it" reading.
   *
   * Omitted — the default — is the reference engine's behaviour: the path resolves against `programUrl`, which is what makes `karoryfer.war-tuba`'s six roots work.
   * Passing it is an **explicit divergence from sfizz**, and it exists so an articulation file can be a usable entry point on its own; see
   * `samplePathRelativeToProgram` for the measurement that establishes the difference and for the refusals (absolute paths, climbing past the program's root).
   */
  declaredIn?: string;
  /**
   * ⭐ **The program's own path relative to the library root** (`Programs/1-solo-legato.sfz`), when the caller knows it — which every caller that got its
   * `sourcePath`s from `expandIncludes` does, because the expander was handed exactly that path.
   *
   * It is what makes the declaring-file reading exact: `samplePathRelativeToProgram` compares two library-relative paths, and without this one the program's own path
   * has to be inferred from the URL, which cannot tell `/PIN/Programs/x.sfz` from `/PIN/Samples/x.sfz`. When it is absent the program's directory is assumed to be the
   * library root, the reading that matches every layout this project has measured; when the two are equal the rewrite is the identity, so a caller that supplies
   * nothing gets exactly the behaviour that was there before `declaredIn` existed.
   */
  libraryPath?: string;
}

/**
 * **A sample path escaped for a URL, without breaking the paths that are already fine.**
 *
 * Muse, composing through the MCP server, reported samples that never fetched: `chimes_G#3_ff_rr1.wav` becomes `…/chimes_G` plus the fragment `3_ff_rr1.wav` under `new URL(path, base)`, because `#` starts a fragment. A `?` in a filename does the same thing to the query string.
 *
 * Only those two characters are escaped, and `%` deliberately is not: a path that already carries `%20` would become `%2520` under a blanket `encodeURIComponent`, which is the same class of bug in the other direction. Spaces and unicode are handled by `URL` itself, which is why they never caused this.
 */
function encodeSamplePath(samplePath: string): string {
  return samplePath.replace(/#/g, "%23").replace(/\?/g, "%3F");
}

export function sampleAssetForPath(samplePath: string, addresses: InstrumentAddresses): SampleAsset {
  /**
   * ⭐ **The declaring-file reading, in the coordinate both paths are given in — and the default reading when that coordinate is not known.**
   *
   * `SfzRegion.sourcePath` and the `libraryPath` a caller supplies are both **library-relative**, which is the only pair of paths `samplePathRelativeToProgram` compares.
   * `libraryPath` is the program's own path in that currency, and **the reading is offered only when the caller states it**: a caller holding
   * `expandIncludes(...).sources` knows the program path it handed the expander, so it can always state it, and one that does not gets the default reading rather than a
   * guess about where the library root begins inside a URL. That is the conservative direction — the address a caller already had — and it is also what keeps this
   * function's default path byte-for-byte what it was before `declaredIn` existed.
   *
   * An **absolute or URL** sample path is never rewritten: `samplePathRelativeToProgram` refuses it, and so does this, because the base cannot change for a path that
   * does not depend on a base at all.
   */
  const adjusted =
    addresses.declaredIn === undefined || addresses.libraryPath === undefined || isAbsolutePath(samplePath)
      ? samplePath
      : samplePathRelativeToProgram(samplePath, addresses.declaredIn, addresses.libraryPath);
  const escaped = encodeSamplePath(adjusted);
  /**
   * **The base does not move; the path is expressed against it.** That is what keeps this function's two readings comparable, and what lets the mirror fallback reuse
   * the identical arithmetic: `samplePathRelativeToProgram` has already put the declaring file's meaning into the program's own terms, so `new URL` sees one base in
   * both cases.
   */
  const primary = new URL(escaped, addresses.programUrl).toString();
  const mirror = addresses.programFallbackUrl ? new URL(escaped, addresses.programFallbackUrl).toString() : undefined;
  return {
    assetId: samplePath,
    name: samplePath,
    kind: "one-shot",
    // Not knowable before decoding; the field exists for display and the loader measures the truth when it decodes.
    seconds: 0,
    url: primary,
    ...(mirror && mirror !== primary ? { fallbackUrl: mirror } : {}),
  };
}

