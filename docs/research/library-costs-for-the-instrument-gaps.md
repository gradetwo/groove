# A 5 GB sample-library plan: the thirteen gaps first, then the rest

**Status:** research report and costed procurement plan. **No audio was downloaded, no audio or playback code was
written or changed, no commit, no push.** Every byte figure below is either a sum of blob sizes read from a GitHub
`git/trees` API response, a size the publisher states on its own page, or an explicitly labelled estimate. The only
commands run as gates were `npm run docs:check` and `npm run check:docs:refs`.

**Scope:** the thirteen instrument names the genre data asks for and the mirror cannot serve, costed to be filled
first; then the best use of whatever remains of a **new** 5 GB.

**What this report is not:** it contains **no listening claim**. Nothing was auditioned, nothing was loaded into a
sampler. Quality statements are either the publisher's own words (quoted, with a link), or a structural fact read
from an SFZ file (velocity opcodes, round-robin opcodes, loop opcodes, region count) — never an impression.

**Maintenance:** `docs/research/` is outside the doc-reference gate. `scripts/check_doc_refs.mjs` builds its `DOCS`
list from the repository root's `*.md` plus `docs/*.md` with a non-recursive `readdirSync`, so this directory is never
scanned. Staying current is this file's job, not the gate's.

**Unit convention:** MiB means 2^20 bytes and is used for anything measured from a file tree or a compressed archive;
MB means 10^6 bytes and is used where a publisher wrote "MB"; GB in the budget arithmetic means 10^9 bytes, to match
the mirror's own `rclone size` figure.

---

## 0. The three numbers, first

1. **The thirteen gaps cost about 1.93 GB** with the quality-first choices below (dominated by one high-quality
   electric bass at 1.06 GiB and one brass-section library at 0.60 GB), or **about 0.80 GB** if every gap takes the
   leanest acceptable option. Both figures leave more than half of the 5 GB. Part 1 does not exceed the budget.
2. **What remains is about 3.07 GB** (quality-first) or about 4.20 GB (lean).
3. **Part 2, in order of value density:** the string articulations the owner named (about 0.50 GB, already-pinned
   CC0), then the rest of the orchestral palette from the same pinned library (about 0.89 GB, CC0), then a real drum
   kit (about 0.73 GB, CC0), then solo strings and world instruments (about 0.65 GB, CC0), then saxophones and extra
   electric pianos (about 0.13 GB, CC-BY). That spends about 2.90 GB of the 3.07 GB remaining without a filler item.

Two gaps do **not** have a clean high-quality option and are put in front of the owner rather than papered over:
`slap_bass` (the only high-quality library found forbids redistribution, and the author's licence is non-commercial)
and `brass_section` (the practical free library carries a composite licence whose main component is not in the
repository's accepted list). `rhodes_ep` has a clean CC0 GM mapping whose parent library is non-commercial, which is
a licensing question rather than a cost question. These are section 5.

---

## 1. The budget, in the owner's words

> 「那 13 个缺口的"新库成本清单"去查，**是你还有 5G 可以用，不算之前上传的**」

> 「5G 尽量用满，高质量和值得加入的乐器都加入」

> 「前提把 13 个补齐」

The already-uploaded figure is the mirror's own: `rclone size :s3:groove --json` gives
`{"count":7242,"bytes":4984997091,"sizeless":0}` (`docs/SAMPLE_LIBRARY_INTEGRATION.md:1278`), which is 4.985 GB
decimal or 4.643 GiB. That 4.985 GB is **not** part of this plan. The budget this plan spends is a **new** 5 GB, and
nothing here assumes headroom in the existing 4.985 GB.

---

## 2. How this was researched, and what counts as evidence

What was read:

* GitHub REST metadata only: `api.github.com/repos/.../git/trees/<sha>?recursive=1`, which returns paths and blob
  byte sizes and no file contents; `/repos/...` for the detected SPDX licence and default branch. No archive, no
  `.git` clone, no audio, no `.sfz` bundle was downloaded. Individual small text files (`LICENSE`, `README`, `.sfz`
  headers) were read as text from `raw.githubusercontent.com` where a licence or an opcode list is the evidence.
* Publisher pages for the licences, formats and stated sizes of libraries not on GitHub.
* The repository itself, before the web: the thirteen gaps, the licence policy, the loader subset, the existing
  mirror, and the measurements already recorded in `docs/SAMPLE_LIBRARY_INTEGRATION.md`.

Evidence rules applied:

* A **licence** is the original declaration: the file or page that carries it, quoted, with the URL. Where the only
  statement is a second-hand summary, the row says so. Where nothing was found, it says "no licence declaration
  found".
* A **size** is a measured sum of blob sizes (GitHub tree), a publisher's own stated size, or a labelled estimate
  with its basis. No size is a guess from a screenshot or a plugin listing.
* Web pages are external data. Nothing in them was treated as an instruction.

---

## 3. What the repository already knows, so it is not re-reported as new

These are existing facts, cited here only because the plan rests on them:

* **The thirteen gaps are already recorded as data**, with a reason per name, in
  `src/data/sampledInstruments.ts` (`SAMPLED_INSTRUMENT_GAPS`, lines 133–147). This report does not discover the
  gaps; it prices libraries for them.
* **None of the thirteen exists in the mirror.** The catalogue is the six-entry manifest `public/samples/manifest.json`
  (virtuosity-drums-basic, salamander-grand, karoryfer-meatbass, karoryfer-emilyguitar, vcsl, vsco2ce), 7242 files,
  4,984,997,091 bytes. Commit `bbf51fd` records the same conclusion.
* **The licence policy is executable** in `src/data/libraryLicence.ts`. The accepted set is `CC0-1.0`, `CC-BY-4.0`,
  `CC-BY-SA-4.0`, `CC-BY-3.0`, `CC-BY-SA-3.0`, `public-domain`; `CC-BY` variants must carry attribution; a missing
  source URL is itself a problem. A `CC-BY-NC*`, `CC Sampling Plus`, `Unlicense`, `MIT` or composite licence is
  therefore **not accepted today** without an owner decision.
* **The loader reads SFZ**, and supports a stated subset: `sample`, `lokey`/`hikey`, `pitch_keycenter`,
  `lovel`/`hivel`, `tune`, includes and `$VAR`, `set_ccN`/`set_hdccN`, `loccN`/`hiccN`, `tune_ccN`,
  `tune_curveccN`, `group`/`off_by`, `loop_mode=one_shot`, `seq_length`/`seq_position`, `amplitude_onccN`,
  `note_polyphony`, `loop_start`/`loop_end`. Opcodes outside the subset are kept, not fatal, but have no effect;
  each manifest entry lists the ones it needs in `needs`.
* **The VSCO 2 CE inventory and the string-articulation gap are already measured** in
  `docs/SAMPLE_LIBRARY_INTEGRATION.md` (the 75-program library, the 26 mirrored programs, and the note that
  spiccato, tremolo, the quiet set and the whole solo-violin family are unmirrored). This report adds the per-program
  byte cost of the unmirrored programs, measured the same way.
* **The mirror is read from Cloudflare R2** and the per-library prefixes match the manifest byte for byte. This plan
  is therefore about bytes to add, not about re-uploading anything.

---

## 4. Part 1: the thirteen gaps

### 4.1 The table

Bytes are new bytes. "Measured" is a sum of blob sizes from the GitHub tree API for the files that program
references; "page" is the publisher's own stated download size. The last column names the genre-data instrument
(`src/data/genres/**`) the library would be mapped to, with the number of genre files that use it.

| Gap | Library | Source link | Where to download | New bytes | Licence | Format | Quality (layers / RR / loop / range / recording) | Maps to |
|---|---|---|---|---|---|---|---|---|
| rhodes_ep | Discord SFZ GM Bank, program `005-Electric Piano 1` | https://github.com/sfzinstruments/Discord-SFZ-GM-Bank | the repo (git) | **5.90 MiB** (measured, 17 files) | file header: `// License: Creative Commons CC0, Jeff Learman`; the parent jRhodes3c is CC BY-NC-SA 4.0 (see 5.1) | SFZ + WAV | GM map of jRhodes3c, 15 regions, one sample per zone; the parent has 5 velocity layers and 67 full-length samples, the GM map does not | rhodes_ep (11 genre files) |
| m1_organ | FreePats "Drawbar organ emulation" | https://freepats.zenvoid.org/Organ/electric-organ.html | link on the page (`DrawbarOrganEmulation-SFZ-20190712.tar.xz`) | **5.8 MiB** (page) | CC0 1.0 | SFZ + WAV | tonewheel/drawbar organ emulation recorded from setBfree (an emulation, not a real Hammond); sustained; layer count not stated | m1_organ (5) |
| organ_lead | FreePats "Percussive organ emulation" | https://freepats.zenvoid.org/Organ/electric-organ.html | link on the page (`PercussiveOrganEmulation-SFZ-20190715.tar.xz`) | **12 MiB** (page) | CC0 1.0 | SFZ + WAV | percussive registration of the same emulation; a "Rock organ emulation" of the same size exists on the same page if wanted | organ_lead (1) |
| pick_bass | FreePats "Bass Guitar YR", pick variation | https://freepats.zenvoid.org/ElectricGuitar/clean-electric-bass.html | GitHub release `PickedBassYR-SFZ+FLAC-20190930.7z` | **2.7 MiB** (page; the source repo totals 6.0 MiB for both variations, measured) | CC0 1.0 (the GitHub repo `freepats/electric-bass-YR` is CC0-1.0) | SFZ + FLAC | Yamaha RBX, direct; one sample per semitone, no velocity layers (read from the SFZ: a `<region>` per `key=`); uses `ampeg_release`, which the loader lists as unsupported, so the release shape is the app's | pick_bass (2) |
| finger_bass | Karoryfer "Black And Blue Basses", or FreePats YR finger variation (lean) | https://github.com/sfzinstruments/karoryfer.black-and-blue-basses | the repo (git) | **1081.6 MiB** (measured) / **3.1 MiB** (page) | CC0 1.0 (the repo ships the CC0 1.0 legal text as `license`) | SFZ + FLAC/WAV | keyswitch programs: Pluck, Ghost, Staccato, Behind the bridge; four velocity layers (`lovel`/`hivel` 31/63/95/127), `seq_length=4` round robin; two basses (darkblack, babyblue) with release samples; fingerstyle, no pick or slap | finger_bass (6) |
| slap_bass | no clean option found. Project16 Rickenbacker 4001 is the best-quality library and is blocked | https://github.com/sfzinstruments/Project16Rickenbacker4001 | the repo (git) | **482.2 MiB** (measured) if permission is obtained | CC BY-NC-SA 3.0 (modified); the readme adds "You are not allowed to use this product in a sampling library or in a related product" | SFZ | fingered, picked, slapped and muted; five layers, A to G, three octaves, 44.1 kHz 16-bit | slap_bass (3) |
| distorted_guitar | FreePats "FSBS Electric Guitar Distorted #2" (or #1) | https://freepats.zenvoid.org/ElectricGuitar/distorted-electric-guitar.html | GitHub release `EGuitarFSBS-dist2-SFZ+FLAC-20220911.7z` | **129 MiB** FLAC (131 MiB) (page); #1 is 300 MiB (301 MiB) | CC0 1.0 | SFZ + FLAC | Fender sampled through an amplifier and effects rack; two distinct distortion flavours exist (#1, #2); layer count not stated on the page | distorted_guitar (1) |
| pluck_string | FreePats "Spanish classical guitar" | https://freepats.zenvoid.org/Guitar/acoustic-guitar.html | link on the page (`SpanishClassicalGuitar-SFZ+FLAC-20190618.7z`) | **4.5 MiB** FLAC (5.1 MiB) (page) | CC0 1.0 | SFZ + FLAC | nylon-string Spanish classical guitar; the author's own note: "The recording conditions were far from ideal, so several filters have been applied to reduce noise" | pluck_string (1) |
| brass_section | Virtual Playing Orchestra 3.3, or Sonatina Symphonic Orchestra 4.0 | https://virtualplaying.com/virtual-playing-orchestra/ , https://github.com/peastman/sso | VPO wave archive on its page; SSO repo/release | **603 MB** wave archive + 536 KB scripts (VPO, page); **1412.5 MiB** whole SSO (measured) | VPO: composite, redistribution allowed if credited and kept free; includes SSO's CC Sampling Plus 1.0. SSO's own `LICENSE`: "It may be used and distributed under the terms of the Creative Commons Sampling Plus 1.0 license" | SFZ + WAV | VPO has a "general purpose patch for full brass section (trumpet + french horn + trombone + tuba in a single patch)", 2 velocity layers for trumpets/horns/trombones, looped sustains, staccato and accent; SSO has ensemble brass | brass_section (4) |
| accordion_lead | FreePats "Button Accordion HN" | https://freepats.zenvoid.org/Organ/accordion.html | GitHub release `ButtonAccordionHN-SFZ+FLAC-20240329.7z` | **4.8 MiB** FLAC (5.1 MiB) (page; the source repo totals 5.1 MiB, measured) | CC0 1.0 | SFZ + FLAC | Hohner button accordion, recorded by Jeff Stauffer 2023; one velocity layer; looped (`loop_start`/`loop_end`, `loop_mode=loop_continuous`); uses `amp_veltrack`, `offset`, `offset_random`, `ampeg_*`, which the loader does not read | accordion_lead (2) |
| sitar_lead | Discord SFZ GM Bank, program `105-Sitar` | https://github.com/sfzinstruments/Discord-SFZ-GM-Bank | the repo (git) | **9.67 MiB** directory, 7.39 MiB referenced (measured) | file header: `// License: CC0, Dr. Narayan Bhagawan Raikar` | SFZ + FLAC | 78 regions, one sample per note, plus a sliding variant; the file itself says "created for testing purpose only for indian instruments", so this is a real recording with a thin map | sitar_lead (1) |
| pan_flute | Polyphone "Pan Flute" by Samster752birdies | https://www.polyphone.io/en/soundfonts/flutes/825-pan-flute | the page (registration required) | **9.02 MB** SF2 (page) | the page's licence field: `public domain` | **SF2, not SFZ** — conversion to SFZ required | bamboo pan flute, 22 pipes, G major, B3–E6, one sample per note, Blue Yeti; the author's own words: "This is my first sound font, don't expect professional quality" | pan_flute (1) |
| bell_lead | VCSL bells already in the mirror (mapping only), or VSCO 2 CE `Glockenspiel` / `TubularBells` | https://github.com/sgossner/VCSL , https://github.com/schollz/VSCO-2-CE | already mirrored / the pinned repo | **0 new bytes** (VCSL) / **6.08 MiB** (VSCO Glockenspiel) / **15.28 MiB** (VSCO TubularBells), measured | CC0 | SFZ + WAV | VCSL's `Idiophones` family (already mirrored) contains `Tubular Bells 1/2/3`, `Tubular Glockenspiel` and `Glockenspiel` as real struck idiophones with keyswitch articulations | bell_lead (4) |

### 4.2 Notes that do not fit in the table

**`bell_lead` is the cheapest row and the plan should take the free one.** `public/samples/manifest.json` shows the
`vcsl` entry's `paths` are `["Aerophones","Idiophones","Membranophones","Electrophones"]` and the entry holds 2651
files. The VCSL tree at the pinned commit `dfcf4a4` contains `Idiophones/Struck Idiophones/Tubular Bells 1.sfz`,
`Tubular Bells 2.sfz`, `Tubular Bells 3 - Legacy.sfz`, `Tubular Glockenspiel.sfz` and `Glockenspiel.sfz`. The bytes
are already in the mirror. What is missing is a row in `src/data/sampledInstruments.ts` and the exposure change that
follows from it, not a download. `pluck_string`'s own reason string already acknowledges the neighbouring-instrument
line: a real orchestral bell is not the synthesiser patch the name literally means, so this is a judgement for the
owner, and the fallback (VSCO's glockenspiel, 6.08 MiB) is a separate instrument rather than the same one.

**The organ rows are one library's registrations, not two libraries.** FreePats records three drawbar-organ
registrations from setBfree: "Drawbar organ emulation" (5.8 MiB), "Percussive organ emulation" (12 MiB) and "Rock
organ emulation" (12 MiB). `m1_organ` (the full-drawbars registration) and `organ_lead` (the jazz registration) can
share the first; the percussive or rock registration is the second colour. All three are CC0. The honest caveat is
that setBfree is a synthesiser emulation of a tonewheel organ, not a recording of a Hammond; it is the right
instrument family but not a real tonewheel recording, and the plan should say so.

**`pick_bass` and `finger_bass` from FreePats are five-eighths of a megabyte of licence-clean bass**, and the
`finger_bass` row can spend 1 GiB on Karoryfer instead. The Karoryfer library is the better instrument by every
structural measure available without listening (four velocity layers, four round robins, two basses, release
samples), but it has no picked or slapped articulation. The plan therefore uses FreePats for `pick_bass` and offers
the owner the choice for `finger_bass`.

**The FreePats packages are SFZ, but several of them use opcodes outside the loader's subset.** The finger-bass SFZ
(read from `freepats/electric-bass-YR`) uses only `sample`, `key`, `lokey`/`hikey`, `pitch_keycenter` and
`ampeg_release`; the accordion SFZ (read from `freepats/button-accordion-HN`) uses `amp_veltrack`, `offset`,
`offset_random`, `offset_cc131`, `amp_random`, `ampeg_attack/decay/sustain/release`, `trigger`, `tune`, `volume`,
`loop_mode=loop_continuous` and `loop_start`/`loop_end`. Of these, the loader implements the region, tuning, loop and
`trigger`-free parts; it does **not** implement the amplitude envelope or sample-offset opcodes, so an accordion
sounds with the app's own envelope and without the file's attack-offset. This is a quality cost, not a blocker, and
it is the kind of thing the manifest's `needs` array is for. It was not verified note by note against the loader;
see section 9.

**VSCO 2 CE's unmirrored programs are the source of Part 2, and their byte costs are now measured.** The table below
is every VSCO program that is not yet mirrored, with the exact bytes its `sample=` references resolve to, computed by
reading each of the 75 root `.sfz` files and summing the referenced blobs from the pinned tree
(`6dd651d55dde97fd4028699be9d4481f26917891`, 3273 blobs). This is the same method the repository already used for
the articulation set, which it reproduced to 162.7 MiB; the numbers here are per program, not per directory, so the
uploaded figure will be slightly higher where a directory prefix carries an unreferenced file (the existing
timpani directory has 10 such files, 37.4 MiB).

---

## 5. The gaps that need an owner decision

### 5.1 `rhodes_ep`: a CC0 GM map whose parent library is non-commercial

The Discord SFZ GM Bank's `005-Electric Piano 1.sfz` carries, in its own header:

```
// GM Electric Piano
// jRhodes GM version
// Author: Jeff Learman: http://github.com/jlearman
// License: Creative Commons CC0, Jeff Learman
// Source: http://github.com/sfzinstruments/jlearman.jRhodes3c
// Mapped and relooped for GM by jlearman
```

The parent library's `LICENSE` (https://github.com/sfzinstruments/jlearman.jRhodes3c/blob/master/LICENSE) says the
opposite for the full sample set:

```
To distribute the samples themselves, such as in an application, software instrument,
or as a sample set, the jRhodes samples are licensed under CC BY-NC-SA 4.0. ...
    NC: Only noncommercial use of the work is permitted.
To use the samples in a commercial product, please contact me and I will be happy to
grant a license.
```

Both statements are from the same author. The GM mapping is a derivative of the same recordings, so which licence
governs the GM map's audio is a question to put to the author rather than to assume. If the CC0 header governs,
`rhodes_ep` costs 5.90 MiB and the plan is clean. If the parent's NC terms govern, the repository's
`checkLibraryLicence` refuses it, and the choices are: ask the author for a written licence, accept a
non-commercial-only library as a deliberate policy exception, or leave `rhodes_ep` on the synthesiser. Recording
quality is not in question: this is a 1977 Rhodes Mark I Stage 73 with five velocity layers in the parent, sampled
to peak 3 dB apart per layer and with the bark on the high velocities as the author's own README describes.

### 5.2 `slap_bass`: the only high-quality library forbids redistribution

The best-quality slap bass found is Project16's Rickenbacker 4001: fingered, picked, slapped and muted patches, five
layers, three octaves, 482.2 MiB. Its README carries the original author's licence:

```
// License: Attribution-NonCommercial-ShareAlike 3.0 Unported (CC BY-NC-SA 3.0), modified
//
// Modification:
// You may use this sound in a commercial music production for free!
// You are not allowed to use this product in a sampling library or in a
// related product (like sampling CD's) !
```

That is two separate blockers for a mirror: non-commercial, and an explicit prohibition on inclusion in a sampling
library. It cannot be mirrored without the author's permission. No CC0 or CC-BY SFZ slap bass was found. The
fallbacks are worse than the gap: a General MIDI soundfont's Slap Bass program (SF2, conversion to SFZ required, and
the candidate licences are not clean — Debian's bug tracker has an open "unclean license" report against GeneralUser
GS, and FluidR3's licence was not verified here because the API rate limit was reached), or one of Karoryfer's bass
libraries, none of which has a slap articulation. The recommendation is to put this single gap to the owner: obtain
permission, commission a recording, or accept a GM-grade slap for a few megabytes with a conversion step.

### 5.3 `brass_section`: the practical free library has a composite licence

VSCO 2 CE, the pinned library, carries solo brass only (F horn, trumpet, trombone, tuba, with mute and staccato
programs) and no brass section, which is why `brass_section` is a gap. The free library that has the section is
Virtual Playing Orchestra 3.3, whose own licensing section says:

> you can safely copy, redistribute, modify whatever you want provided appropriate credit is given ... and that any
> derived samples or library is kept for personal use only or is given away for free

but whose component list includes Sonatina Symphonic Orchestra under "Creative Commons Sampling Plus 1.0 license",
plus CC BY-SA 3.0 and CC BY-SA 4.0 material and CC0 material. Sonatina's own `LICENSE` confirms: "It may be used and
distributed under the terms of the Creative Commons Sampling Plus 1.0 license". `CC Sampling Plus 1.0` is not in
`src/data/libraryLicence.ts`'s accepted set. Mirroring VPO or SSO therefore needs either an explicit owner decision
to add that licence (or to treat the composite as acceptable with attribution) or a different brass section.
Sonatina's whole library is 1412.5 MiB measured; VPO's wave archive is a single 603 MB download, and the brass-only
share was not isolated (see section 9). VPO's feature list also gives it tremolo for all string sections and for solo
violin, which makes it a Part 2 candidate as well, under the same licence question.

---

## 6. Part 2: the remaining budget, ranked by what it unlocks

The ranked list below assumes the quality-first Part 1 (1.93 GB) and therefore about 3.07 GB to spend. Each row
states what the bytes unlock, because "this library looks good" is not a reason. All VSCO costs are measured
per-program blob sums from the pinned tree; all Karoryfer costs are measured blob sums from the `sfzinstruments` org.

**Priority 1 — the string articulations the owner named (VSCO 2 CE, CC0, already pinned): about 473 MiB.**
The repository has already established that these are unmirrored. These exact bytes fill them:

| What | Programs | MiB |
|---|---|---|
| Section tremolo | ViolinEnsTrem 33.56, ViolaEnsTrem 44.16, CelloEnsTrem 50.05, ContrabassTrem 20.32 | 148.09 |
| Section spiccato | ViolinEnsSpic 8.84, ViolaEnsSpic 9.61, CelloEnsSpic 24.95, ContrabassSpic 12.37 | 55.77 |
| Section quiet (弱奏) | ViolinEnsSusVib-Quiet 21.99, ViolaEnsSusVib-Quiet 29.87, CelloEnsSusVib-Quiet 30.48, ContrabassSusVB-Quiet 20.85 | 103.19 |
| Solo violin | SViolinVib 70.91, SViolinVib-Quiet 37.15, SViolinTrem 32.39, SViolinPizz 13.08, SViolinSpic 12.81 | 166.34 |
| **Total** | | **473.39** |

⚠️ **Correction, added 2026-10-02 after the purchase was actually made** (the per-program figures above are right, the
total is not). The four `-Quiet` programs are **not separate recordings**: every one of their regions names the
**main program's `_v1` soft-layer samples**, with `lovel/hivel` widened from `0–62` to `0–127`. The earlier round
mirrored those directories whole, so those bytes were **already in the bucket** — the quiet group's true new cost is
**0**, and what was missing was only the mapping. Likewise `SViolinVib-Quiet` (37.15 MiB) is a strict subset of
`SViolinVib` (70.91 MiB), so the solo-violin family's real new cost is the union of its four directories,
**129.19 MiB**, not 166.34. Measured new bytes for all four groups: **349 224 766 B = 333.05 MiB** (433 sample files),
not 473.39 MiB. The account and its per-program figures are in `docs/SAMPLE_LIBRARY_INTEGRATION.md` §8 and
`docs/STRING_TECHNIQUES.md` §14.1.

⚠️ **And the `-KS` programs cannot be used as the paragraph below assumes.** Their articulations are selected with
`sw_lokey`/`sw_hikey`/`sw_last`/`sw_default`, which the loader does **not** implement — so including one whole file
would answer a note with every folded articulation at once (or, in practice, whichever region the file lists first).
They were deliberately left out; implementing `sw_*` is a prerequisite, not a download.

The `*-KS` key-switch programs (`SViolin-KS` 129.19 MiB, `ViolinEns-KS` 94.83 MiB, etc.) reference the union of the
individual articulations, so once the individual programs are mirrored the key-switch program adds only its
program text. The loader already reads `default_path` per `<control>` section, so these are usable. Unlocks: every
sustained articulation used by `strings_lead` and the string-role lanes gains tremolo, spiccato, a soft dynamic and
a solo voice, in the same CC0 library and the same upload pipeline.

**Priority 2 — the rest of the pinned orchestra's palette (VSCO 2 CE, CC0): about 848 MiB for the whole table, or
about 586 MiB for the pianos, percussion and mallets alone.**

| What | Programs (MiB) | Subtotal |
|---|---|---|
| Two upright pianos | UprightPiano 241.89, VSUpright1 147.89 | 389.78 |
| Percussion set | GM-StylePerc 147.51 | 147.51 |
| Mallets, bells, piccolo | Marimba 11.23, TubularBells 15.28, Glockenspiel 6.08, Xylophone 4.33, PiccoloSus 11.32, PiccoloStac 0.58 | 48.82 |
| Pipe organ registrations | OrganLoud 43.38, OrganQuiet 42.79, OrganLoudPedal 23.72, OrganQuietPedal 22.21 | 132.10 |
| Non-vibrato sustains | ContrabassSusNV 50.35, FluteSusNV 46.73, OboeSusNV 33.24 | 130.32 |

Unlocks: the two uprights give the piano-role genres a second and third recorded piano beyond Salamander's grand;
`GM-StylePerc` gives the drum lanes a real orchestral/percussion source; the mallets and piccolo widen the lead
palette for the same names the VCSL mallets already serve; the organ registrations are a real pipe organ, explicitly
not the drawbar organ `m1_organ` means.

**Priority 3 — one real drum kit (Karoryfer, CC0): about 697 MiB.**
`karoryfer.big-rusty-drums` is 697.0 MiB measured, 4466 audio files, 347 SFZ programs including full, basic, kick,
snare, toms and hi-hat. Unlocks: the drum lanes, which are physical models today, gain a recorded kit that is
velocity-layered and round-robined and that the SFZ loader can read directly. Larger alternatives exist and are all
CC0: `karoryfer.swirly-drums` 1742.3 MiB, `Karoryfer.TheHatWithThePhat` 937.9 MiB (hi-hat only),
`karoryfer.unruly-drums` 777.7 MiB, `karoryfer.frankensnare` 416.0 MiB.

**Priority 4 — solo strings and world instruments (Karoryfer and others, CC0): about 620 MiB.**
`karoryfer-bigcat.cello` 138.7 MiB (bowed velocity-layer, bowed mod-wheel, plucked, legato maps),
`karoryfer.string-cyborgs` 72.6 MiB, `karoryfer.war-tuba` 133.5 MiB (solo, duo and trio tuba),
`aliexpress-erhu` 88.5 MiB, `hungarian_zither` 170.1 MiB, `cithara-barbarica` 228.0 MiB. Unlocks: a solo cello
against the existing section, a tuba ensemble, and three world plucked/bowed voices that no genre can currently
sound with a recording.

**Priority 5 — saxophones and extra electric pianos (CC-BY): about 126 MiB.**
`MTG.SoloSax` 105.8 MiB (CC-BY-4.0, soprano/alto/tenor/baritone) and `GregSullivan.E-Pianos` 20.5 MiB
(CC-BY-3.0: Yamaha CP80, Hohner Pianet T, Wurlitzer EP200). Unlocks: VCSL's tenor sax is the only recorded sax
today; these add the other three voices. The E-Pianos are not a Rhodes, but they are a second and third electric
piano for the same lanes, and they are cheap and licence-clean.

**Priority 6 — what was considered and left out of the ranked list**, with the reason in section 7.

---

## 7. The three tiers

### 7.1 The best combination that fits in 5 GB

| Part | Item | GB (decimal) |
|---|---|---|
| Part 1 | the thirteen gaps, quality-first (section 4) | 1.93 |
| Part 2.1 | VSCO tremolo + spiccato + quiet + solo violin | 0.50 |
| Part 2.2 | VSCO upright pianos + percussion + mallets + piccolo | 0.61 |
| Part 2.3 | Karoryfer `big-rusty-drums` | 0.73 |
| Part 2.4 | Karoryfer cello + string-cyborgs | 0.22 |
| **Total** | | **3.99** |

That is about 3.97 GB of the 5 GB. The remaining ~1.0 GB can go to the world instruments of Priority 4
(`hungarian_zither` 0.17 GB + `cithara-barbarica` 0.24 GB + `aliexpress-erhu` 0.09 GB + `war-tuba` 0.13 GB =
0.63 GB) and still leave about 0.4 GB. In other words the plan fills the budget with real, ranked value and does not
need a filler purchase. The 13 gaps are prerequisites and are all inside the first 1.93 GB.

### 7.2 What it would take to buy everything identified

Every licence-clean candidate identified in this research totals about **12.9 GB**; counting the licence-blocked
ones as well it is about **13.4 GB**. So if the owner wants all of it rather than the best 5 GB, the raise is to
about **13 GB** of new space. The 13 gaps alone are 1.93 GB, so a raise is not needed to satisfy the prerequisite.

### 7.3 Not recommended, and why

| Item | Reason |
|---|---|
| `jlearman.jRhodes3c` / `jRhodes3d` full sets | `CC BY-NC-SA 4.0`, redistribution of the samples only for non-commercial use; not in the accepted licence set |
| `Project16Rickenbacker4001` | `CC BY-NC-SA 3.0` plus an explicit "not allowed ... in a sampling library" clause |
| Sonatina SSO and Virtual Playing Orchestra, unless the owner accepts `CC Sampling Plus 1.0` | the component licence is not in `src/data/libraryLicence.ts`'s accepted set |
| Pianobook instruments | its default terms allow use in recordings but forbid redistributing the raw samples; that forbids a mirror |
| Spitfire LABS, orchestral "free" Kontakt libraries | plugin-locked or EULA-restricted; the bytes are not redistributable |
| `GeneralUser GS` | Debian has an open report that its licence is unclean |
| `EthanWiner.Soundfonts`, `OvationGuitar`, `DamiensFunkyGuitar` | GitHub reports no licence and the READMEs carry no declaration found; a 3.1 MiB guitar is not worth the review |
| `jlearman.SteelDrum` | licence is `Unlicense`, which is not in the accepted set; a mapping-only, quality question besides |
| `SalamanderGrandPiano` | already mirrored |

---

## 8. Entries with no licence declaration, and entries with no size evidence

**No licence declaration found:** `sfzinstruments/Discord-SFZ-GM-Bank` as a whole (its README states intent, and each
instrument's own `.sfz` carries its own licence; the two rows used here do declare), `OvationGuitar`,
`DamiensFunkyGuitar`, `Terkelsen.Marimba`, `EthanWiner.Soundfonts`, `Kastendieck.SteelDrum`, `Clavecin`,
`Discord-SFZ-GM-Bank`'s unimplemented 118 programs (they are stubs with no licence line and no samples).

**Size evidence is an estimate, not a measurement:** `BenktNilsson.HeadroomPiano` (the tree fetch failed; only the
org listing's `size` field was available, which counts git history, so its ~134 MB is not used in any total);
Virtual Playing Orchestra's brass-only share (only the whole 603 MB wave archive is stated); Sonatina's brass-only
share (its SFZ are include-based wrappers and the per-instrument byte extraction returned zero, so only the whole
1412.5 MiB library is measured).

---

## 9. What was not verified, and what could not be judged

* **The SFZ subset compatibility of every candidate was not verified note by note.** Two FreePats SFZ files were read
  in full (finger bass, button accordion) and their opcodes are listed in section 4.2. The distorted guitar,
  tubular bells, drawbar organ and bass-guitar pick package internals were not read (the archives were not
  downloaded, and the API rate limit was reached before every source repo tree could be listed). The manifest's
  `needs` array is the right place to record whatever the loader does not implement once a package is fetched.
* **`slap_bass` has no verified clean source.** FluidR3_GM's licence and its Slap Bass program were not verified; the
  API rate limit was reached first. It is named as a fallback with that caveat attached, not as a recommendation.
* **The Discord GM E-Piano's CC0 header versus its parent's NC licence is a legal question**, not a measurement one;
  section 5.1 states both declarations and does not choose between them.
* **Virtual Playing Orchestra's and Sonatina's brass-only byte shares were not isolated** (section 8). Any figure
  quoted for them is the whole library.
* **No listening judgement was made anywhere in this report.** Where "quality" is stated it is a structural fact
  (velocity opcodes, round-robin opcodes, loop opcodes, region counts) or the publisher's own quoted words.

---

## 10. URLs read

Repository and pinned-family metadata:

* https://github.com/sgossner/VCSL tree at `dfcf4a4918771eee884b96ad4493de82ef84daf6`
* https://github.com/schollz/VSCO-2-CE tree at `6dd651d55dde97fd4028699be9d4481f26917891` and its 75 root `.sfz`
* https://github.com/sfzinstruments (org listing, 76 repositories) and the library trees cited per row
* https://github.com/sfzinstruments/mappings

Publisher pages and licence files:

* https://freepats.zenvoid.org/ and https://freepats.zenvoid.org/Organ/electric-organ.html
* https://freepats.zenvoid.org/Organ/accordion.html
* https://freepats.zenvoid.org/ElectricGuitar/distorted-electric-guitar.html
* https://freepats.zenvoid.org/ElectricGuitar/clean-electric-bass.html
* https://freepats.zenvoid.org/Guitar/acoustic-guitar.html
* https://freepats.zenvoid.org/ChromaticPercussion/tubular-bells.html
* https://www.polyphone.io/en/soundfonts/flutes/825-pan-flute
* https://virtualplaying.com/virtual-playing-orchestra/ (licensing section)
* https://github.com/peastman/sso (its `LICENSE`, and the sfzinstruments SSO page https://sfzinstruments.github.io/orchestra/sso/)
* https://github.com/sfzinstruments/Discord-SFZ-GM-Bank (README, and the `005-Electric Piano 1.sfz`, `105-Sitar.sfz`,
  `076-Pan Flute.sfz`, `034-Electric Bass (finger).sfz` files)
* https://github.com/sfzinstruments/karoryfer.black-and-blue-basses (its `license` and `Programs/01-darkblack_keysw.sfz`)
* https://github.com/sfzinstruments/karoryfer.black-and-green-guitars , `karoryfer.shinyguitar`, `karoryfer.squidpipes`
* https://github.com/sfzinstruments/jlearman.jRhodes3c (its `LICENSE`) and `jlearman.jRhodes3d` (its `README.md`)
* https://github.com/sfzinstruments/GregSullivan.E-Pianos (its `README.md` and `LICENSE`)
* https://github.com/sfzinstruments/Project16Rickenbacker4001 (its `README.md`)
* https://theremin.music.uiowa.edu/MIS.html (licence paragraph and instrument list)
* https://samplestack.app/news/free-multisample-instrument-sources/ (a survey of free sources and their redistribution
  terms, used only as a cross-check, not as a licence source)
* https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=1036719 (GeneralUser GS licence report)
