# The drum lane's role → note map, and what the mirrored kit actually answers

> **Status:** landed on `dev` (branch `drums`). Every number below is a **measurement**, and the sentence that is not a
> measurement is marked as a judgement.
>
> **One line first:** the genre data writes a drum **role** (`kick`/`snare`/`hihat`/`percussion`) and no pitches, and the
> mirrored kit is a sampled instrument that answers **many notes**. This document is the map between the two, the evidence
> that the map matches what the library actually contains, and an A/B reading of what changes audibly.

---

## 1. What the library is

`virtuosity-drums-basic` is `sfzinstruments/virtuosity_drums`, pinned at **`9f04cf9a7345`**, CC0, mirrored with
**2078 files / 419 of them `.sfz`**. Its manifest entry points at `Programs/01-basic-kit.sfz` (1205 bytes), which reaches its
regions through `#include`:

```
Programs/01-basic-kit.sfz
 ├── keymaps/keymap_basic.sfz            ← the note assignments, with `//General MIDI percussion keys` in the source
 ├── mappings/kickmic_basic.sfz    → kickmic/kick_snon_map.sfz, kick_snoff_map.sfz
 ├── mappings/snaremic_basic.sfz   → snare_center/offcenter/rimshot/stickshot1…, hi-hat, crash, ride, toms
 ├── mappings/closemic_perc.sfz    → perc/close/{tambourine,cowbell,bongos,congas,…}
 ├── mappings/oh_basic.sfz
 └── mappings/oh_perc.sfz
```

`Programs/02-full-kit.sfz` is the same kit with **seven microphone chains** (kickmic, snaremic, closemic, oh, mid, room,
lofi) and the extra snare articulations; the manifest's `sfz` field names the basic one, so **the basic kit is what ships**.

### 1.1 The arrangement of the kit — measured, key by key

Measured with the repository's **own** `expandIncludes` + `parseSfz` + `regionsForNote` (`/var/tmp/vd/answers.ts`, one pass
per program), so the table is what this codebase will actually play rather than a reading of the upstream README. Velocity
100 in every row; "vel layers" counts the distinct `lovel`–`hivel` bands that cover the key; "rr" is the largest
`seq_length` among them.

| key | GM name | what the library answers | vel layers | rr |
| --- | --- | --- | --- | --- |
| 35 | Acoustic Bass Drum | `kickmic_kick_snoff` | 4 | 4 |
| 36 | Bass Drum 1 | `kickmic_kick_snon` | 4 | 4 |
| 37 | Side Stick | `kickmic_snare_stickshot1` | 18 | 1 |
| 38 | Acoustic Snare | `kickmic_snare_center` | **48** | 1 |
| 39 | Hand Clap | `kickmic_snare_offcenter` | 48 | 1 |
| 40 | Electric Snare | `kickmic_snare_rimshot` | 12 | 1 |
| 41 | Low Floor Tom | `kickmic_ltom_center` | 16 | 1 |
| 42 | Closed Hi-Hat | `kickmic_hh_closed` | 5 | 4 |
| 43 | High Floor Tom | `kickmic_ltom_offcenter` | 12 | 1 |
| 44 | Pedal Hi-Hat | `kickmic_hh_pedal` | 4 | 4 |
| 45 | Low Tom | `kickmic_ltom_rimshot` | 10 | 1 |
| 47 | Low-Mid Tom | `kickmic_ltom_crossstick` | 10 | 1 |
| 48 | Hi-Mid Tom | `kickmic_htom_center` | 16 | 1 |
| 49 | Crash Cymbal 1 | `kickmic_crash_crash` | 3 | 4 |
| 50 | High Tom | `kickmic_htom_offcenter` | 16 | 1 |
| 51 | Ride Cymbal 1 | `kickmic_ride_ride` | 3 | 4 |
| 53 | Ride Bell | `kickmic_ride_bell` | 3 | 3 |
| 54 | Tambourine | `Tamb1_Shake` | 1 | **10** |
| 55 | Splash Cymbal | `kickmic_flatride_crash` | 4 | 1 |
| 56 | Cowbell | `Cowbell1_Normal` | 3 | 7 |
| 57 | Crash Cymbal 2 | `kickmic_crash_sizzle` | 3 | 4 |
| 58 | Vibraslap | `Vibraslap1_1_Hit` | 2 | 8 |
| 59 | Ride Cymbal 2 | `kickmic_flatride_ride` | 3 | 4 |
| 60 | Hi Bongo | `BongoH_Hit1` | 3 | 8 |
| 61 | Low Bongo | `BongoL_Hit1` | 3 | 8 |
| 62 | Mute Hi Conga | `Conga_17_HitHM1` | 2 | 8 |
| 63 | Open Hi Conga | `Conga_22_HitN` | 3 | 8 |
| 64 | Low Conga | `Tumba_24_HitN` | 4 | 8 |
| 65 | High Timbale | `timb13` | 5 | 4 |
| 66 | Low Timbale | `timb14` | 4 | 4 |
| 67 | High Agogo | `Agogo_High` | 3 | 8 |
| 68 | Low Agogo | `Agogo_Low` | 2 | 8 |
| 69 | Cabasa | `Cabasa1_Rub` | 2 | 8 |
| 70 | Maracas | `LShaker_Shake1U` | 1 | 7 |
| 71 | Short Whistle | `Close_BallWhistle_Short` | 1 | 6 |
| 72 | Long Whistle | `Close_BallWhistle_Long` | 1 | 2 |
| 73 | Short Guiro | `Guiro_Med` | 1 | 8 |
| 74 | Long Guiro | `Guiro_Fast` | 1 | 8 |
| 75 | Claves | `Claves1_Hit` | 3 | 8 |
| 76 | Hi Wood Block | `woodblock_hi` | 6 | 1 |
| 77 | Low Wood Block | `woodblock_lo` | 6 | 1 |
| 78 | Mute Cuica | `Long_p7_Main` | 1 | 5 |
| 79 | Open Cuica | `Long_p2_Main` | 1 | 7 |
| 80 | Mute Triangle | `Triangle1_HitM` | 1 | 8 |
| 81 | Open Triangle | `Triangle1_Hit` | 2 | 8 |
| 82 | Shaker | `LShaker_Shake1D` | 1 | 7 |
| 83 | Jingle Bell | `Sleighbells_Hit` | 1 | 8 |
| 84 | Belltree | `BellTree_Stroke` | 1 | **11** |
| 85 | — | `kickmic_snare_stickshot2` | 28 | 1 |
| 86 | — | `kickmic_snare_muted` | 28 | 1 |
| 87 | — | `kickmic_snare_halfopen` | 28 | 1 |
| 88 | — | `kickmic_snare_crossstick` | 26 | 1 |
| 89 | — | `kickmic_ltom_muted` | 16 | 1 |
| 91 | — | `kickmic_ltom_halfopen` | 16 | 1 |
| 92 | — | `kickmic_hh_splash` | 1 | 4 |
| 93 | — | `kickmic_snare_buzz` | 12 | 1 |
| 95 | — | `kickmic_snare_flam` | 12 | 1 |
| 96 | — | `kickmic_snare_roll` | 1 | 1 |

**Silent keys in 27–96: 27–34, 46, 52, 90, 94.** Note 46 (Open Hi-Hat) is silent **on the basic program** and present on
`02-full-kit.sfz`; this is a real difference between the shipped program and the full kit, not a gap in the library.

Reading of the whole program, from the same measurement: `loop_mode=one_shot` in every `<global>`, **no `smpl` block**, no
`direction`, no `sw_*` keyswitches; `ampeg_release`/`ampeg_decay`/`ampeg_hold`/`ampeg_sustain` plus
`ampeg_decay_oncc71` (CC71 = kick dampen). `seq_length` is the round-robin count; samples are `.flac`.

### 1.2 It serves four roles, and cannot serve the drum-machine names

| the data's role (`track_id`) | instrument names it uses | served? |
| --- | --- | --- |
| `kick` | `acoustic_kick`, `punchy_kick` | **yes** — note 36 |
| `snare` | `acoustic_snare` | **yes** — note 38 |
| `hihat` | `closed_hat` | **yes** — note 42 |
| `percussion` | `rim_shaker` | **yes** — note 82 |
| `kick` | `808_kick`, `sub_kick`, `distorted_kick` | **no** — a circuit or a processed sound, not a drum recording |
| `snare` | `808_snare`, `tight_snare`, `clap`, `reggae_rim`, `rimshot` | **no** — a drum machine or a one-shot effect |
| `bass` (`distorted_kick` on a bass lane) | `distorted_kick` | **no** — the role is not a drum role, so nothing maps it |

**The refusals are data, not a default.** `ELECTRONIC_DRUM_INSTRUMENTS` (`src/audio/drumRoles.ts`) lists them with the
reason beside each, and `ACOUSTIC_DRUM_INSTRUMENTS` lists the other half, so a criterion can require that every drum
`instrument` in `src/data/genres/**` is in exactly one of the two lists.

**`rim_shaker` is the row that list earned.** It reads like a synthetic effect and is the only instrument the
`percussion` lane carries; it is a **shaker** — GM 82 — which the kit has as `perc/close/shaker_up|down` and as
`$PERC_SHAKER_KEY 82`. My first version of the refusal list contained it, and the read-back below is what caught it:
the percussion lane resolved to no asset at all.

### 1.3 The names are not always descriptive — measured, and it took two attempts

A drum lane's `instrument` is not a controlled vocabulary, and **two places in this repository write a role word instead
of an instrument**:

| where | what it writes | why |
| --- | --- | --- |
| `src/data/genres/**` (all 159 genres) | `closed_hat` 159, `rim_shaker` 159, `punchy_kick` 55, `tight_snare` 50, `acoustic_kick` 44, `acoustic_snare` 41, `clap` 25, `distorted_kick` 22, … | descriptive names, one per part — **zero** bare role words |
| `src/audio/MidiImporter.ts` | `{ track_id: "kick", instrument: "kick" }`, and the same for `snare`/`hihat`/`percussion` | an imported MIDI file carries no instrument vocabulary, so the **role** is the only word there is |
| `src/data/masterclasses.ts` | `instrument: "percussion"` on a **`kick`** lane ("Kick Pulse (Ratio 4)") and a **`snare`** lane ("Downbeat Marker") | there the word means "this is a drum part", not "this is a percussion instrument" |

`drumVoicingForLane` first required a **descriptive** name, which reported both generic shapes as unclassified
instruments and turned `src/test/renderSilence.test.ts` red in CI. The correction was `instrument === roleName`, which
fixed the MIDI-import shape and **still missed the third row**: measured by generating all 16 shipped masterclass
patterns, `instrument: "percussion"` on a kick or snare lane produced **48 false "not classified" reports**.

The rule now is that the **role** is the classification and the instrument name only has to (a) not name a drum machine
and (b) be recognisable as a drum at all — a descriptive name (`ACOUSTIC_DRUM_INSTRUMENTS`) **or** a role word
(`ROLE_NAMED_DRUM_INSTRUMENTS`, which is `DRUM_ROLE_IDS`). After it, the same measurement gives **0** false reports on
masterclasses and **0** over all 159 genres, and a criterion asserts both counts.

### 1.4 What a drum lane reports when the kit is not there

**Nothing is suppressed.** A drum lane mapped to the kit whose catalogue cannot serve it carries the *same* sentence every
mapped lane carries — `this lane is mapped to the catalogue recording "virtuosity-drums-basic", which no configured
sample mirror serves — this lane keeps its physical model in src/audio/DrumKitModels.ts` — and for the same reason: "the
lane is mapped and this catalogue does not have it" is a fact about the **lane and the catalogue**, identical for a kick
and for a piano, and it is the only signal that separates *a mirror that is configured and does not carry this kit*
(worth acting on) from *no mirror at all* (the shipped default).

The consequence is deliberate and owned: in an environment with no mirror — CI, and every unit test — each mapped drum
lane adds one such line to a render's `problems`, exactly as each mapped melodic lane already does. That is why
`src/test/renderSilence.test.ts`'s attached assertion states the property it is about (**no problem of the render's own**:
every entry must be that catalogue sentence) rather than the bare absence of entries; that test is about the silence
guard, not about mirrors. Removing the sentence from the code was the one option rejected — it would have hidden the case
that matters.

---

## 2. The standard, and where it says so

The mapping is **General MIDI Percussion**, and that is a decision with a source rather than a convenience:

* **The MIDI Association** describes GM 1 as requiring *"a minimum of 128 preset instruments (MIDI program numbers)
  conforming to the GM 1 Instrument Patch Map, and **47 percussion sounds which conform to the GM 1 Percussion Key
  Map**"* — [General MIDI (midi.org, archived)](https://web.archive.org/web/20231209205025/https://www.midi.org/specifications-old/item/general-midi).
  The key map itself is Table 2 of the GM 1 specification, reproduced verbatim (including "35 Acoustic Bass Drum",
  "36 Bass Drum 1", "38 Acoustic Snare", "42 Closed Hi-Hat", "82 Shaker") at
  [General MIDI Standards: Table 2 — Percussion Key Map](https://www.cs.cmu.edu/~music/cmp/archives/cmsip/readings/GMSpecs_PercMap.htm).
  **Key-based percussion is always on MIDI channel 10**, which is why the numbers are not free.
* **The library is written in that map**, and says so in its own source:
  `Programs/keymaps/keymap_basic.sfz` defines `$KICK_SNWRONG_KEY 35`, `$KICK_SNRIGHT_KEY 36`, `$SNARE_CENTER_KEY 38`,
  `$SNARE_STICKSHOT1_KEY 37`, `$SNARE_RIMSHOT_KEY 40`, `$HH_CLOSED_KEY 42`, `$HH_PEDAL_KEY 44`, `$HH_OPEN_KEY 46`,
  `$CRASH_CRASH_KEY 49`, `$RIDE_RIDE_KEY 51`, `$RIDE_BELL_KEY 53`, `$PERC_TAMB_KEY 54`, `$PERC_COWBELL_KEY 56`,
  `$PERC_BONGOH_KEY 60`, `$PERC_CONGAHM_KEY 62`, `$PERC_SHAKER_KEY 82`, … under the comment
  **`//General MIDI percussion keys`**.
* **SFZ's own hierarchy** is where the `<master>` scope semantics come from:
  [sfzformat.com/headers](https://sfzformat.com/headers/) — *"The global header (one per file) contains opcodes which
  apply to all regions in the file. The master header is an extra level added inbetween group and global for the ARIA
  player. So, the **global/group/region or global/master/group/region hierarchy** contains the opcodes which define
  which samples are played…"* — and [`‹master›`](https://sfzformat.com/headers/master/) gives the worked example whose
  `key=` sits on the `<master>` header itself.

Everything above is a document or the library's own source. **The parser's `<master>` semantics are not taken from a
document**: they are **measured against `sfizz_render`**, the reference engine this repository already settles SFZ
semantics with. See §4.

---

## 3. The map this project implements

`src/audio/drumRoles.ts` holds it as **explicit data**, exactly as `src/data/sampledInstruments.ts` holds the melodic
mapping, and for the same reason: an inference over the *words* would answer confidently and wrongly on a kit whose pads
are in another order, and a wrong drum is worse than a synthesised one because nothing downstream can tell.

| role (`track_id`) | asset | note | why this note |
| --- | --- | --- | --- |
| `kick` | `virtuosity-drums-basic` | **36** | GM 36 = Bass Drum 1; the kit's own `$KICK_SNRIGHT_KEY 36` is the same pad |
| `snare` | `virtuosity-drums-basic` | **38** | GM 38 = Acoustic Snare; the kit's `$SNARE_CENTER_KEY 38` |
| `hihat` | `virtuosity-drums-basic` | **42** | GM 42 = Closed Hi-Hat, the default because a one-sound hat lane is the closed one in every genre the data writes; 44/46 are the same kit's pedal and open hats |
| `percussion` | `virtuosity-drums-basic` | **82** | GM 82 = Shaker, and the lane's only instrument is `rim_shaker`; the kit's `$PERC_SHAKER_KEY 82` |

`DRUM_ROLE_IDS` is derived from the table so a criterion can assert it covers every drum `track_id` the genre data writes
— which is what keeps "we never mapped it" from looking identical to "it is a drum machine".

### 3.1 Where the note is used

A drum lane has **no `pitch` column** (`SequencerTrack`: `steps` and `velocity`, and `pitch` is documented as the root of a
*melodic* step). The role supplies the note, and it is supplied at the two places that decide what a lane sounds, so the
live and the offline paths cannot disagree:

| path | file | what it does with the note |
| --- | --- | --- |
| offline (render, bounce, stem, export) | `src/audio/offlineAudioLanes.ts` | `pitchedSteps(track, drumNote)` — one event per attack, resolved by `sampleLoader.loadNote` |
| live (studio transport, arrangement player) | `src/audio/audioLanePlan.ts` | `pitchedLaneSteps(track, drumNote)` — the same fallback, so a live kit and a rendered one agree |

Both then run through `WavExporter`'s / `AudioEngine`'s stand-down (`sampledStandDownIndexes`), which is unchanged: a drum
lane whose asset the session's catalogue can serve is **not** voiced by `DrumKitModels`, and the same lane with an
unconfigured mirror keeps its model and is reported.

A lane that *does* write a `pitch` keeps it — the role note is a **fallback**, so a pattern that deliberately places a hit
on another pad still plays that pad.

---

## 4. The defect this work found in the parser, and how it was arbitrated

`parseSfz` treated `<master>` as a second `<global>`. Two things followed, and both are wrong.

**How it was decided:** `sfizz_render` (the reference engine, now used as an oracle rather than assumed), one 0.25 s
1 kHz region per fixture, 44.1 kHz, **peak in parentheses**:

```
global(key=36) → master(key=40) → region        36: 0.0000   40: 0.0604   the master's key wins
global(key=36) → master()       → region        36: 0.0604   40: 0.0000   a bare master keeps the global's
master(key=36) → master(key=40) → region        36: 0.0000   40: 0.0604   the second master replaces the first
master(key=36) → master()       → region        36: 0.0604   40: 0.0604   unconstrained: see below
global(key=36) → master(key=40) → master() → region  36: 0.0604  40: 0.0000
group(key=50)  → master(key=54) → region        50: 0.0000   54: 0.0604   the group does NOT survive
master(key=54) → group(key=50)  → region        50: 0.0604   54: 0.0000   a group inside the master does
```

The fourth line is not a second sound: that fixture's earlier `key=36` had already been replaced, the master inherited
nothing that bound note 40, so the region was unconstrained and matched both. Every other line agrees on the rule now
implemented: **a new `<master>` starts from the `<global>` scope, and it ends any `<group>` that was open before it.**

**Why it mattered for this library.** `snaremic_basic.sfz` opens `<group> key=50` and never closes it, and the percussion
mappings that follow are `<master> key=$PERC_…` blocks. With the group surviving into the master, **all 752 percussion
regions of the basic kit answered note 50**, and notes 54–84 — tambourine, cowbell, congas, bongos, shakers, triangles,
agogos, claves — answered **nothing**. The measurement before the fix said key 50 matched 1220 regions and 54–84 were
silent; after it, every key carries its own piece.

The six readings are in the criterion's comment (`src/test/sfzParse.test.ts`, `describe("the master header")`), which is
where the only truth about this fix lives, and seven cases assert each line of the table.

---

## 5. A/B — the physical model against the sampled kit

**This is not a listening judgement.** It says what the two signals are, not which is better.

Both renders are `renderPatternOffline` on **the same bebop pattern**, with every non-drum lane muted, so the difference is
the drums and nothing else. **A** hands the renderer a catalogue that does not contain the kit — which is what
`VITE_SAMPLE_ROOT` unset means in production, so **A is the shipped behaviour before this change**; **B** hands it the real
catalogue. `virtuosity-drums-basic`'s SFZ text was served from a local mirror at the pinned commit and its audio proxied
from the public R2 mirror, so the reading is not a CDN measurement.

| metric (from `mcp/render/worker.ts`'s own `measure()`) | A physical model | B sampled kit | Δ (B − A) |
| --- | --- | --- | --- |
| integrated loudness (LUFS, ITU-R BS.1770-4) | −15.06 | −21.64 | **−6.58** |
| true peak (dBTP) | −1.3 | −1.3 | **0.0** |
| sample peak (dBFS) | −1.3 | −1.3 | 0.0 |
| spectral centroid (Hz) | 89.3 | 121.1 | +31.8 |
| discontinuities | 25 | 64 | +39 |
| audio-lane events / lanes from bytes | 0 / 0 | 18 / 4 | — |

13-band fingerprint (mean |Δ| **3.58 dB**; largest single band **band 1 at −8.96 dB**; total band energy identical at
−11.14 dB on both sides):

| band | A | B | Δ |
| --- | --- | --- | --- |
| 1 | −7.23 | −16.18 | −8.96 |
| 2 | −2.92 | −10.32 | −7.39 |
| 3 | −8.56 | −3.11 | +5.44 |
| 4 | −10.77 | −5.93 | +4.84 |
| 5 | −14.16 | −10.44 | +3.72 |
| 6 | −16.66 | −15.23 | +1.42 |
| 7 | −20.84 | −19.46 | +1.38 |
| 8 | −24.10 | −23.63 | +0.47 |
| 9 | −26.84 | −27.66 | −0.81 |
| 10 | −28.89 | −31.60 | −2.71 |
| 11 | −29.70 | −34.13 | −4.43 |
| 12 | −31.81 | −34.34 | −2.53 |
| 13 | −35.29 | −37.71 | −2.42 |

### 5.1 What the numbers say, and what they do not

* **The sampled kit is quieter on this fixture, by 6.58 LU integrated**, and *that is not a claim that it is worse*. The two
  sides are summed from different sources: the model writes its own gain staging at the velocities the pattern carries,
  while the kit is a recording whose level is whatever the library's `amp_velcurve`/`amp_veltrack` produce at those
  velocities. **Matching them is a gain decision, not a defect** — and it is a decision this change deliberately does not
  make, because it would change the loudness of every genre that keeps the model.
* **True peak is identical to 0.0 dB (−1.30 dBTP) on both sides**, which is the limiter's ceiling doing its job in the same
  place. This is the one metric where the two agree exactly, and it is the one that matters for clipping.
* **The sampled kit is brighter** — centroid 89.3 → 121.1 Hz, bands 3–7 up 1.4–5.4 dB — and **thinner below 100 Hz** — bands 1–2
  down 7.4–9.0 dB. `A`'s kick is the `acoustic` model, which puts a synthesised sub-sine under the shell; the recording's
  own low end is what the microphone heard. Both facts follow from *what each source is*.
* **More discontinuities (25 → 64)**, because a recorded drum has real transients where a model has a smooth attack; the
  metric counts waveform discontinuities, and a stick hit has one.
* **The total band energy is identical to two decimal places (−11.14 dB on both)**, so the difference is *distribution*
  rather than level — which is exactly what "a recording instead of a model" should look like.
* **What is not measured here:** whether a listener prefers it. Nothing in this document claims that, and §5.1's first
  bullet is the reason the A/B cannot be read as a verdict.

---

## 6. Reproducing the numbers

| step | command |
| --- | --- |
| the key-by-key table | `TMPDIR=/var/tmp ./node_modules/.bin/vite-node /var/tmp/vd/answers.ts 01-basic-kit.sfz 02-full-kit.sfz` (fetches the 419 `.sfz` at `9f04cf9a7345` into a scratch mirror first) |
| before/after read-back | `TMPDIR=/var/tmp ./node_modules/.bin/vite-node /var/tmp/vd/readback.ts bebop` |
| the A/B | local mirror (§5) + `TMPDIR=/var/tmp ./node_modules/.bin/vite-node /var/tmp/vd/ab.ts` |
| the parser's six readings | `sfizz_render --sfz … --midi … --wav …` on the seven fixtures written out in `src/test/sfzParse.test.ts` |
| host parity | `npm run probe:headless` |

`/var/tmp` rather than `/tmp` because `/tmp` here is a 7.8 GB tmpfs and the SFZ tree plus the proxied audio does not belong
in memory.
