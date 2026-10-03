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
