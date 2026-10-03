# Keyswitches — what the format says, what this project does, and what is not implemented

This is the record for the `sw_*` family: the specification's own sentences with their URLs, the reference engine's implementation with file and line, what this
repository implements, and — the part §27 of the working standards asks for — **what is deliberately not implemented, said out loud rather than silently degraded**.

It exists because two half-truths were circulating about these opcodes: that they "read but produce no behaviour", and that a keyswitch note may or may not sound. Both
are settled below by quoting the specification and the reference engine.

## 1. The measured shape of the pinned programs

`schollz/VSCO-2-CE@6dd651d55dde97fd4028699be9d4481f26917891`, its eight `-KS` programs, measured with this repository's own `parseSfz`:

| program | regions | `sw_last` groups | groups reachable on load | groups in a `<group>` with no `sw_default` |
| --- | --- | --- | --- | --- |
| `CelloEns-KS.sfz` | 156 | 6 | 1 | 0 |
| `Clarinet-KS.sfz` | 97 | 3 | 1 | 2 |
| `Contrabass-KS.sfz` | 152 | 7 | 1 | 0 |
| `Flute-KS.sfz` | 94 | 5 | 1 | 4 |
| `SViolin-KS.sfz` | 161 | 6 | 1 | 0 |
| `Tuba-KS.sfz` | 87 | 5 | 1 | 0 |
| `ViolaEns-KS.sfz` | 144 | 6 | 1 | 0 |
| `ViolinEns-KS.sfz` | 131 | 6 | 1 | 5 |
| **total** | **1022** | **44** | **8** | **11** |

**36 of the 44 articulations were out of reach of every note**, because each file's effective `sw_default` names exactly one group and one file's default cannot
select another file's group. The files were not wrong: each already names its articulation (`sw_label=C2 Sustain Vibrato`, `sw_label=D6 Spiccato`), and nothing could
*ask* for one.

## 2. The opcodes, with their sources

| opcode | version | default | what the specification says | URL |
| --- | --- | --- | --- | --- |
| `sw_last` | SFZ v1 | `-1` | *"Enables the region to play if the last key pressed in the range specified by sw_lokey and sw_hikey is equal to the `sw_last` value."* … *"an instrument which uses `sw_last` to select articulations will not have a default articulation preselected, meaning when loaded, it will play no sound until one of the keyswitches is pressed."* … *"sw_last is a \"sticky\" keyswitch - after releasing the keyswitch note, it continues to affect notes until another keyswitch is pressed."* | <https://sfzformat.com/opcodes/sw_last/> |
| `sw_default` | SFZ v2 | `N/A` | *"Define keyswitch 'power on default' so that you hear something when a patch loads."* … *"Without `sw_default`, this instrument would be silent until a keyswitch is manually used to select an articulation."* | <https://sfzformat.com/opcodes/sw_default/> |
| `sw_lokey` / `sw_hikey` | SFZ v1 | `-1` | *"Defines the range of the keyboard to be used as trigger selectors for the `sw_last` opcode."* … *"With `sw_down` / `sw_up` this behavior is implementation-dependent. In ARIA, either `sw_down` or `sw_up` can be a note in the playable range, regardless of whether `sw_lokey` / `hikey` is defined or not."* | <https://sfzformat.com/opcodes/sw_lokey/> |
| `sw_down` / `sw_up` | SFZ v1 | `-1` | *"Enables the region to play if the key equal to `sw_down` value is depressed."* … *"`sw_down` … is \"non-sticky\" and only affects notes played while the switch is held down."* … *"If there is a default articulation which should sound when no `sw_down` keys are pressed, `sw_up` should be defined for those regions."* (`sw_up`: *"Enables the region to play if the key equal to `sw_up` value is not depressed."*) | <https://sfzformat.com/opcodes/sw_down/> |
| `sw_previous` | SFZ v1 | `N/A` | *"Previous note value. The region will play if last note-on message was equal to `sw_previous` value."* … *"unlike `sw_last`, the note specified by `sw_previous` doesn't need to fall in the `sw_lokey` / `sw_hikey` range. This is useful for true sampled legato."* | <https://sfzformat.com/opcodes/sw_previous/> |
| `sw_vel` | SFZ v1 | `current` | *"Allows overriding the velocity for the region with the velocity of the previous note."* Values `current`／`previous`. *"if the previous velocity is 100 and the velocity of the new note-on message is 60, the new region will play as if its velocity was 100."* | <https://sfzformat.com/opcodes/sw_vel/> |
| `sw_lolast` / `sw_hilast` | ARIA | `N/A` | *"Like `sw_last`, but allowing a region to be triggered across a range of keyswitches. `sw_lolast` specifies the bottom of the range, and `sw_hilast` the high."* | <https://sfzformat.com/opcodes/sw_lolast/> |
| `sw_label` | ARIA | `N/A` | *"Label for activated keyswitch on GUI."* … *"`sw_label` causes ARIA/Sforzando to display the most recent selected keyswitch label appear on its interface."* | <https://sfzformat.com/opcodes/sw_default/> |

**The three pages said not to exist do exist.** `sw_vel`, `sw_lolast` and `sw_hilast` each have their own page (the last shared between the two range opcodes), and
sfizz implements all three. They are therefore implemented here rather than declared unimplemented.

## 3. What the reference engine does, with lines

Snapshot pinned at **`f5c6e29f23b8057867c08e88f5f6ac6738baa30b`** (`develop` as fetched on 2026-10-03), verified by diffing
`https://raw.githubusercontent.com/sfztools/sfizz/<sha>/src/sfizz/Synth.cpp` against the downloaded tree.

| question | sfizz | where |
| --- | --- | --- |
| does it read `sw_lokey`／`sw_hikey`? | **no — they are a no-op.** `case hash("sw_lokey"): // fallthrough` / `case hash("sw_hikey"): break;` | `Region.cpp:281-283` |
| `sw_last` → | `absl::optional<uint8_t> lastKeyswitch {};` read with `opcode.readOptional(Default::key)` | `Region.h:283`, `Region.cpp:285-288` |
| `sw_lolast`／`sw_hilast` → | `absl::optional<UncheckedRange<uint8_t>> lastKeyswitchRange {};`, `emplace(value, value)` then `setStart`／`setEnd`, and `lastKeyswitch` is cleared | `Region.h:284`, `Region.cpp:290-312` |
| `sw_down`／`sw_up`／`sw_previous` → | `downKeyswitch`／`upKeyswitch`／`previousKeyswitch`, each `opcode.readOptional(Default::key)` | `Region.h:286-288`, `Region.cpp:317-327` |
| `sw_vel` → | `VelocityOverride velocityOverride`, `current` or `previous` | `Region.h:290`, `Region.cpp:328-330`, `Defaults.cpp:211` |
| `sw_label` → | `keyswitchLabel = opcode.value` — **the whole value**, which is why the tokenizer ahead of it matters | `Region.cpp:314-315` |
| how a label value is tokenized | extracts to end of line, then cuts only before a token shaped like `name=`, `<`, `#define` or `#include` — so `sw_label=C2 Sustain Vibrato` is the whole name and `sw_label=Sine lokey=41` is `Sine` | `parser/Parser.cpp:314-360` |
| **`sw_default` on load** | at the end of `buildRegion`: `if (lastRegion->defaultSwitch) setCurrentSwitch(*lastRegion->defaultSwitch);` — and `buildRegion` runs **once per `<region>`, in file order**, so the **last** declaration wins | `Region.cpp:859-861`, `Synth.cpp:127-128`, `Synth.cpp:213-214` |
| **the sticky switch** | `noteOnDispatch`: `if (!lastKeyswitchLists_[noteNumber].empty()) { … currentSwitch_ = noteNumber; }` — one `absl::optional<uint8_t> currentSwitch_` **per loaded instrument** | `Synth.cpp:1355-1361`, `SynthPrivate.h:292` |
| **`sw_down`／`sw_up`** | non-sticky: `noteOnDispatch` sets `keySwitched_ = true` for a `sw_down` target and `false` for a `sw_up` target; `noteOffDispatch` reverses both | `Synth.cpp:1363-1370`, `Synth.cpp:1331-1335` |
| **`sw_previous`** | set **after** the region-matching loop: `layer->previousKeySwitched_ = (region.previousKeyswitch == noteNumber);` on every note-on — so note *N* is gated by note *N−1* | `Synth.cpp:1384-1387` |
| **`sw_vel=previous`** | the note's velocity is replaced before matching: `if (region.velocityOverride == VelocityOverride::previous) velocity = midiState_.getVelocityOverride();` | `Layer.cpp:73-74`, `Voice.cpp:425-426` |
| **does a keyswitch note also sound?** | **not suppressed.** `noteOnDispatch` has no early return: after moving the switch it runs the ordinary `noteActivationLists_` loop, so a voice starts **iff a region's key range covers that note**. The one thing withheld is the MIDI-state update — `hdNoteOn` skips `midiState.noteOnEvent(...)` when the note is a `lastKeyswitch`, so a switch note never becomes "the last note played" | `Synth.cpp:1355-1379`, `Synth.cpp:1265-1268` |
| offline rendering | there is nothing keyswitch-specific in the offline path: `OfflineRenderer`／`renderBlock` inherit `currentSwitch_` from load, so **an offline render plays exactly what a patch plays before anything is pressed** | `Synth.cpp:213-214` is the whole of it |

The specification pages **do not answer** whether a keyswitch note sounds; the reference engine's source is the answer above.

## 4. What this repository implements

| opcode | where | judged by |
| --- | --- | --- |
| `sw_last` | `parse.ts` (`SfzRegion.swLast`), `regionsForNote`'s gate | `sfzSwKeyswitch.test.ts` (39) |
| `sw_default` | `parse.ts` (`declaredSwitchDefault`, **last declaration wins**) | `sfzKeyswitchTechnique.test.ts`, `sfzSwKeyswitch.test.ts` |
| `sw_lokey`／`sw_hikey` | `parse.ts` (`swLow`／`swHigh`) as the range a **switch value** must fall in to be a trigger selector; `keyswitch.ts`'s `targetsOf` applies the same range to which **notes** are switches | `sfzSwKeyswitch.test.ts`, `sfzKeyswitchState.test.ts` |
| `sw_label` (value read whole) | `parse.ts`'s `SPACE_BEARING` | `sfzKeyswitchTechnique.test.ts` |
| **choosing an articulation by name** | `keyswitch.ts`'s `techniqueSwitchFor` — word-matched on `sw_label`, tied by `sw_default`, refused by name when it cannot match | `sfzKeyswitchTechnique.test.ts` (18) |
| `sw_down`／`sw_up` (non-sticky) | `keyswitch.ts`'s `KeyswitchState` + `parse.ts`'s gate | `sfzKeyswitchState.test.ts` |
| `sw_previous` | same | same |
| `sw_vel=previous` | same (per-region velocity in `regionsForNote`) | same |
| `sw_lolast`／`sw_hilast` | same (a range of sticky targets) | same |

**Where the live state lives:** `src/audio/playerFromEngine.ts`, one `KeyswitchState` **per track**, driven by its `audition` (`noteOn`) and `releaseNote` (`noteOff`)
pair. It cannot live in `sampleLoader` — `audition` builds a fresh loader on **every key press**, so loader-held state would be forgotten between two notes of one
performance — and it cannot live in `regionsForNote`, which is pure and re-entered per note. The reference engine's scope is the same: one `currentSwitch_` per loaded
instrument, not per channel.

## 5. ⚠️ Not implemented, and the divergences, said out loud

* **`sw_note_offset` and `sw_octave_offset` are NOT implemented.** They follow `note_offset`／`octave_offset` *"but for key switches"*
  (<https://sfzformat.com/opcodes/>, ARIA). **sfizz does not read them either** (a repository-wide search for `sw_note_offset`／`sw_octave_offset` over
  `src/` at the pinned sha returns nothing), so there is no reference behaviour to match. A file using them will have its switches taken at the written pitch.
  This is stated rather than silently ignored: nothing in the pinned libraries uses them.
* **`sw_lokey`／`sw_hikey` diverge from sfizz by design.** sfizz reads them into nothing (`Region.cpp:281-283`), so there the whole keyboard is a trigger range. This
  project follows the specification's sentence — *"Defines the range of the keyboard to be used as trigger selectors"* — and a `sw_last` outside its own file's range
  is not a trigger selector. The two agree on every well-formed file and differ only for a file whose `sw_last` contradicts its own declared range.
* **`sw_down`／`sw_up` are not range-filtered**, which is the ARIA reading of `sw_lokey`'s *"implementation-dependent"* sentence quoted above: *"either `sw_down` or
  `sw_up` can be a note in the playable range, regardless of whether `sw_lokey`/`hikey` is defined or not."*
* **`sw_previous`'s scope under polyphony is this project's reading, not a documented one.** sfizz stores it as a per-`Layer` flag written on **every** note-on the
  instrument receives (`Synth.cpp:1386`), so a simultaneous note-on in another part sharing one instrument instance would overwrite it. This repository gives each
  **track** its own `KeyswitchState`, which is the same scope as one instrument instance here — and no source found states what either engine intends under polyphony.
  Written as "not documented" rather than presented as a measurement.
* **An offline caller reaches none of the key-holding opcodes.** `sw_down`, `sw_up` and `sw_previous` need a press and a release, and the lane schedulers emit
  note-ons only; a region gated on them is therefore unreachable on that path, which is the literal reading (*"if the key … is depressed"* with nothing depressed)
  rather than a missing feature. The `technique` option is what an offline caller uses to choose an articulation, and it travels on
  `AudioLaneEvent.technique`, `OfflineAudioLaneEvent.technique` and `SamplerStepEvent.technique`.

---

# 6. `trigger` — the opcode that decides *when* a region sounds, and the P0 it caused

> This section exists because the owner's audit found `salamander-grand` (Salamander Grand Piano) playing **`Samples/rel40.flac`** — a hammer-release noise — for
> MIDI 60, and it was right. The root cause was not the piano: `src/audio/sfz/parse.ts` read no `trigger` opcode at all, so a region the file had marked *"play this on
> note-**off**"* was eligible for a note-**on**. This is the record the working standards' §27 and §28 ask for: the specification's own sentences with their URLs, the
> reference engine with file and line, **what other mature implementations do**, and what this repository deliberately does not implement.

## 6.1 The specification, verbatim

<https://sfzformat.com/opcodes/trigger/> — *"Sets the trigger which will be used for the sample to play."*

| value | version | the page's own words |
| --- | --- | --- |
| `attack` | SFZ v1 | *"**(Default)**: Region will play on note-on."* |
| `release` | SFZ v1 | *"Region will play on note-off or sustain pedal off. The velocity used to play the note-off sample is the velocity value of the corresponding (previous) note-on message."* |
| `first` | SFZ v1 | *"Region will play on note-on, but if there's no other note going on (commonly used for or first note in a legato phrase)."* |
| `legato` | SFZ v1 | *"Region will play on note-on, but only if there's a note going on (notes after first note in a legato phrase)."* |
| `release_key` | SFZ v2 | *"Region will play on note-off. Ignores sustain pedal."* |

The page's own summary table: *"trigger | SFZ v1 | string | attack | attack, release, first, legato"*, with *"release_key"* added on the **SFZ v2** row.

⚠️ **`last` is not a value.** The work order names it among the values to look for; <https://sfzformat.com/opcodes/trigger/> does not carry it, its table's four v1
values and one v2 value are the five above, and sfizz's enum below has the same five. **Written down as *not found* rather than mapped onto something that sounds
similar** — a file writing `trigger=last` now reads as an **unknown** value and is refused on note-on (see §6.4).

Two more sentences on the page matter here:

* *"Setting `trigger` to `release` or `release_key` will cause the region to play as if `loop_mode` was set to **`one_shot`**."*
* *"Release samples can require a corresponding region with `trigger` set to `attack` to be active at the moment when the note-off message is received … This is
  designed primarily designed for piano release samples."*

## 6.2 The reference engine — sfizz, with lines

Snapshot `f5c6e29f23b8057867c08e88f5f6ac6738baa30b` (`develop` as fetched for this change; the same sha §3 of this document uses).

| question | sfizz | where |
| --- | --- | --- |
| the value set and the default | `enum class Trigger { attack = 0, release, release_key, first, legato };` … `ESpec<Trigger> trigger { Trigger::attack, {Trigger::attack, Trigger::release_key}, 0};` | `src/sfizz/Defaults.h:42`, `Defaults.cpp:207` |
| reading the opcode | `case hash("trigger"): trigger = opcode.read(Default::trigger); break;` | `src/sfizz/Region.cpp:384-386` |
| which values sound on **note-on** | `const bool firstLegatoNote = (region.trigger == Trigger::first && midiState_.getActiveNotes() == 1);` / `const bool attackTrigger = (region.trigger == Trigger::attack);` / `const bool notFirstLegatoNote = (region.trigger == Trigger::legato && midiState_.getActiveNotes() > 1);` … `return keyOk && velOk && randOk && (attackTrigger \|\| firstLegatoNote \|\| notFirstLegatoNote);` | `src/sfizz/Layer.cpp:78-82` |
| which values sound on **note-off** | `for (Layer* layer : noteActivationLists_[noteNumber])` … `if (layer->registerNoteOff(noteNumber, velocity, randValue))` … `if (region.trigger == Trigger::release && !region.rtDead && !voiceManager_.playingAttackVoice(&region)) continue;` | `src/sfizz/Synth.cpp:1325-1346` |
| "is this a release region?" | `bool isRelease() const noexcept { return trigger == Trigger::release \|\| trigger == Trigger::release_key; }` | `src/sfizz/Region.h:64` |
| setting it | `if (region.isRelease() && !region.loopMode) region.loopMode = LoopMode::one_shot;` — the specification's one-shot sentence, implemented | `src/sfizz/Synth.cpp:782` |

**`release` has no path in `registerNoteOn` at all**, and `legato` requires `getActiveNotes() > 1`. So on a note-on with nothing else sounding, sfizz admits `attack`
and `first` and refuses `release`, `release_key` and `legato`.

## 6.3 ⭐ What other mature implementations do

Not only sfizz, because §28 asks for the industry's answer rather than one engine's.

| implementation | on note-on | on note-off | source |
| --- | --- | --- | --- |
| **sfizz** | `attack` ∪ `first`(when exactly one note is active) — `legato` only when >1 | `release`, `release_key` | `Layer.cpp:78-82`; `Synth.cpp:1325-1346` (above) |
| **LinuxSampler** | `q.trig = TRIGGER_ATTACK \| ((pChannel->LastKey != -1 && pChannel->PressedKeys[pChannel->LastKey] && pChannel->LastKey != q.key) ? TRIGGER_LEGATO : TRIGGER_FIRST);` — i.e. `ATTACK` plus **exactly one of** `LEGATO`/`FIRST` | `q.trig = TRIGGER_RELEASE;` | [`src/engines/sfz/Engine.cpp`](https://github.com/linuxsampler/linuxsampler/blob/master/src/engines/sfz/Engine.cpp), `TriggerNewVoices` and `TriggerReleaseVoices`; the matching is a bitmask: `((trigger & q.trig) != 0)` in [`sfz.cpp` Region::OnKey](https://github.com/linuxsampler/linuxsampler/blob/master/src/engines/sfz/sfz.cpp) |
| **Decent Sampler** | *"attack means a sample is played when the note on message is received … first means that the sample will only be played if no other notes are playing. legato means that the sample will only be played if some other notes are already playing. continuous means that the sample will always play. … Default: attack."* | *"release means the sample is played when the note off message is received (aka a release trigger)."* | Decent Sampler 1.34.0 manual, `trigger`, [decentsampler-developers-guide.readthedocs.io](https://decentsampler-developers-guide.readthedocs.io/) (PDF, Release 1.34.0, ch. 1) |
| **ARIA / Plogue sforzando** | — (no note-on path for release triggers) | *"`release` require previous attack region. `release_key` doesn't need previous attack region. `release` respond to Sustain Pedal position. `release_key` ignores Sustain Pedal."* | [sfzlab, *How Release Trigger Works in SFZ*](https://raw.githubusercontent.com/sfzlab/sfztest/master/docs/How-Release-Trigger-Works-in-SFZ.md), the *"Plogue sforzando and ARIA"* section |

⚠️ **`release_key` is the one place they do not agree, and it is not on the note-on question.** LinuxSampler's parser reads four values —
`"attack"`, `"release"`, `"first"`, `"legato"` (`sfz.cpp`, the `trigger` arm) — and has no `release_key` spelling, so a file writing it falls through to the definition's
default `trigger = TRIGGER_ATTACK` and **would play on note-on**; sfizz, ARIA and sforzando all read it as note-off-only. **The note-on question itself is unanimous**:
no implementation plays a `release` region on a note-on.

**Where they differ on `legato`/`first`, this project follows sfizz**, because it is the reference engine this repository already settles semantics against (see §3),
and LinuxSampler's `ATTACK|(LEGATO|FIRST)` says the same thing in different words: a note-on admits `attack`, and `first`/`legato` are decided by whether another key is
held. Neither is available on a path with no note-off, which is §6.4's subject.

## 6.4 What this repository implements, and the divergence stated out loud

`parse.ts` reads `trigger` into `SfzRegion.trigger` (`attack` folded in as the format's default; the raw spelling stays in `opcodes.trigger`), and `noteOnTrigger`
decides note-on eligibility. **`regionsForNote` filters on it**, so the region a note-on may sound is chosen from `{attack, first}` only.

| value | on this path | reason |
| --- | --- | --- |
| `attack` | sounds | *"Region will play on note-on."* |
| `first` | sounds | *"Region will play on note-on, but if there's no other note going on"* — a note-on trigger |
| `legato` | **refused** | *"only if there's a note going on"* — and nothing is, on a path that emits note-ons only |
| `release` | **refused** | *"on note-off or sustain pedal off"* |
| `release_key` | **refused** | *"on note-off"* |
| anything else (`last`, `continuous`, `off`, …) | **refused**, and the spelling is kept in `triggerUnknown` | a value this project cannot read is not evidence for "plays on note-on" |

⚠️ **The divergence, said out loud: `first` is admitted for *any* note-on, where sfizz admits it only when exactly one note is active.** sfizz's condition is
`midiState_.getActiveNotes() == 1`, and this project can never count active notes, because the offline lane schedulers emit note-ons and no note-off ever arrives. So
the admission here is a **superset** that includes sfizz's case. The choice between the two available readings was made on which failure is honest:
`first` regions are note-on sounds, so playing one is a sound the file wrote for a key press; refusing them would silence the `..._legato_first_map.sfz` half of every
sampled-legato library on this path. That is the same reading §5's last bullet records for `sw_down`／`sw_up`／`sw_previous`: a condition that needs a live keyboard is
read literally, and the gap is named rather than filled with a guess.

## 6.5 ⚠️ Not implemented: the note-off trigger itself

**There is no note-off trigger channel in this project, and this change does not add one.** The offline lane schedulers emit note-ons; `SamplerVoice` and the
`AudioBufferSourceNode` voice path end a note at the note's own end (`src/audio/samplerVoice.ts`), and nothing there resolves *"what would play on the release of this
note"*. So:

* a `trigger=release` / `release_key` region is **never played at all** through this code — not on note-on (this change) and not on note-off (never implemented);
* a `trigger=legato` region is likewise unreachable — it is not a note-on sound by the format's own definition, and there is no second-note context to reach it in;
* **this is recorded rather than silently degraded**, per §27. In the data it is `needs: ["…", "trigger"]` on the entries that carry the opcode; in the prose it is
  `docs/SAMPLE_LIBRARY_INTEGRATION.md` §③'s per-library disposition table; and the whole-corpus reading is pinned by `src/test/sfzTrigger.test.ts` +
  `src/test/triggerCensus.ts`.

**What implementing it would take, named rather than implied:** a note-off event delivered to the lane scheduler; a per-note record of the note-on velocity (the page says
the release sample uses it: *"The velocity used to play the note-off sample is the velocity value of the corresponding (previous) note-on message"*); a
`playingAttackVoice`-equivalent, because *"release requires a previous attack region"* in ARIA and sfizz; `rt_decay` (`Applies only to regions that triggered through
trigger=release`), and a `one_shot` loop mode for the release voice. None of those exists here, and inventing the trigger without them would be the silent wrong answer
this project keeps hunting.

## 6.6 Why piano libraries write release samples at all — the structural question

This is the author's-side fact the audit's defect hangs on, from the library's own documentation rather than inferred:

* **Salamander Grand Piano, the very library in question** — its `README` (the file the manifest pins: `sfzinstruments/SalamanderGrandPiano@3382bf9496bba2486f5ab0de55a264d1dfc38404`) records
  *"Hammer noise releases chromatically sampled in onle one layer. String resonance releases in minor thirds in three layers."* Those are the two families the parser counts as
  157 `trigger=release` regions; the note regions are the "16 Velocity layers Sampled in minor thirds from the lowest A". The README also notes the library
  *"has been optimized and only properly tested for linuxsampler"* — and LinuxSampler is the engine in §6.3 that excludes `release` from its note-on trigger mask.
* **The specification itself says the release sample is the piano's own case** — *"This is designed primarily designed for piano release samples"* and *"For cases where a
  corresponding attack region is required … This corresponding attack region is then used to calculate the volume of the release region based on the attack region's
  velocity and `rt_decay`"* (<https://sfzformat.com/opcodes/trigger/>).
* **`rt_decay`'s page uses a piano as its worked example** — *"`<region> sample=pianoA4.wav trigger=attack` / `<region> sample=keyup_noise.wav trigger=release rt_decay=3`
  //The sample keyup_noise.wav will play 3db quieter for every second the key has been on."* (<https://sfzformat.com/opcodes/rt_decay/>).
* **A commercial piano library documents the same two families as separate editable controls** — Steinberg's HALion **Swiss Grand 1860** manual: *"the key release were
  recorded with 8 samples per note. Damper noise of the sustain pedal (dampers up/down) were recorded, too, with 8 samples for push/release."*, with a *"Key release"*
  control that *"allows to adjust the volume of the key release sounds … In the far-left position of the knob, the key release samples will be turned off completely"*
  and a *"Pedal Noise"* control for *"when pressing/releasing the sustain pedal, samples of the original instruments' string noise (dampers going up/down) are being
  added"* (Steinberg, *Swiss Grand 1860* manual, pp. on key release and pedal noise).
* **Decent Sampler's `releaseTriggerDecay` says who it is for** — *"This is useful for piano pedal-up samples and other release triggers where shorter notes should have
  louder release samples."* (Decent Sampler 1.34.0 manual, `releaseTriggerDecay`).

**So a release sample is not a note.** It is the mechanical sound of the key or the pedal moving, and every implementation above agrees it belongs on the note-off. Playing
one on a note-on replaces the piano with the noise of letting go of the key — which is exactly what the audit heard.

## 6.7 The census, and the next library

The full reading — every `trigger=` in every declared text file of every pinned manifest entry, by value and by library, plus the parser-derived region counts — is
`src/test/triggerCensus.ts`, re-read live by `src/test/sfzTrigger.test.ts`. It found **2 177 assignments over 14 libraries**: `first` 1 236, `legato` 794, `release` 99,
`release_key` 20, `attack` 28 — and no `last` anywhere. **Five** libraries write `trigger=release` (`salamander-grand`, `vcsl`, `karoryfer-bear-sax`,
`karoryfer-black-and-blue-basses`, `freepats-button-accordion-hn`) and a sixth writes `release_key` (`virtuosity-drums-basic`).

The audit's sample found one audible defect; the census is the reason that "one" is a measurement rather than a hope: only in Salamander does a release region win the
narrowest-range comparison against the note region it competes with, and in the other five the release regions lose to a note region — so the *defect* was one library
while the *opcode* spans six. The criterion fails when any of those counts moves or when a library outside the census starts using `trigger`, which is what makes the
**next** arrival visible instead of silent.

