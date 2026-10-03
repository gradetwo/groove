/**
 * ⭐ **The 32 libraries' addresses, pinned — measured, not written by hand from memory.**
 *
 * Every value here was produced by running the repository's own `sourceSfzUrl`／`mirrorSfzUrl` over `public/samples/manifest.json`, and the criterion next door re-derives the same values on
 * every test run. A hand-copied table would be a second implementation; this is a recording of the first one, and the reason it is a separate file is that the test file should read as the
 * *rules* while this reads as the *reading*.
 *
 * `programs` is the count of programs the entry offers — `instruments.length` when it has a list, `1` when only `sfz` is declared — so a library that gains or loses a program cannot pass unnoticed.
 * `source` and `mirror` are the **first** program's two addresses; the resolver test walks all of them.
 *
 * ## What the before/after pair was
 *
 * The same table was generated with the previous code and the previous manifest, and compared entry by entry:
 *
 * ```
 * source program addresses   320 total: 45 changed, 275 byte-for-byte identical
 * mirror program addresses   320 total: 320 byte-for-byte identical
 * source sample addresses    45 unresolvable 404 → 0;  and the 45 were exactly the two libraries below
 * ```
 *
 * The 45 changed source addresses are `karoryfer-meatbass` (39 programs) and `karoryfer-emilyguitar` (6), each losing the release archive's own top-level directory. **No other library moved a
 * character**, which is what "only the ones that were really wrong change" means.
 */

/** The mirror root the shipped application uses. Written here so the criterion does not depend on a developer's `.env.local` being present. */
export const MIRROR_ROOT = "https://r2mirror.groove.wangda.today";

/**
 * All the programs an entry offers, in the order it offers them — `instruments` when it has a list, else the single `sfz`.
 *
 * Lives here rather than in the criterion so anything else that needs the same reading imports it instead of writing a second one; a manifest entry's program list has exactly one meaning.
 */
export const programsOf = (entry: { sfz?: string; instruments?: readonly { sfz: string }[] }): string[] =>
  entry.instruments?.length ? entry.instruments.map((program) => program.sfz) : entry.sfz ? [entry.sfz] : [];

export interface SourceAddressPin {
  /** How many programs the entry declares. */
  programs: number;
  /** The pinned source address of the entry's first program — `repo/pin/<repository-relative path>`. */
  source: string | undefined;
  /** The pinned mirror address of the same program — `root/prefix/<recorded path>`, unchanged by this fix. */
  mirror: string | undefined;
}

export const SOURCE_ADDRESS_PINS: Readonly<Record<string, SourceAddressPin>> = {
  "virtuosity-drums-basic": { programs: 1, source: "https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/9f04cf9a7345/Programs/01-basic-kit.sfz", mirror: "https://r2mirror.groove.wangda.today/virtuosity-drums/Programs/01-basic-kit.sfz" },
  "salamander-grand": { programs: 1, source: "https://raw.githubusercontent.com/sfzinstruments/SalamanderGrandPiano/3382bf9496bba2486f5ab0de55a264d1dfc38404/Salamander Grand Piano V3.sfz", mirror: "https://r2mirror.groove.wangda.today/salamander-grand/Salamander Grand Piano V3.sfz" },
  "karoryfer-meatbass": { programs: 39, source: "https://raw.githubusercontent.com/sfzinstruments/karoryfer.meatbass/ac9e859564bda286ab5ec672d00ff1aa2fef2895/Programs/01_arco_modwheel.sfz", mirror: "https://r2mirror.groove.wangda.today/karoryfer-meatbass/Meatbass/Programs/01_arco_modwheel.sfz" },
  "karoryfer-emilyguitar": { programs: 6, source: "https://raw.githubusercontent.com/sfzinstruments/karoryfer.emilyguitar/b4920dc662fd9cad6dcaccdeecffdd91c8725d8c/emily_basic.sfz", mirror: "https://r2mirror.groove.wangda.today/karoryfer-emilyguitar/Emilyguitar/emily_basic.sfz" },
  vcsl: { programs: 88, source: "https://raw.githubusercontent.com/sgossner/VCSL/dfcf4a4918771eee884b96ad4493de82ef84daf6/Aerophones/Edge-blown Aerophones/Ball Whistle.sfz", mirror: "https://r2mirror.groove.wangda.today/vcsl/Aerophones/Edge-blown Aerophones/Ball Whistle.sfz" },
  vsco2ce: { programs: 60, source: "https://raw.githubusercontent.com/schollz/VSCO-2-CE/6dd651d55dde97fd4028699be9d4481f26917891/BassoonStac.sfz", mirror: "https://r2mirror.groove.wangda.today/vsco2ce/BassoonStac.sfz" },
  "freepats-electric-bass-yr": { programs: 2, source: "https://raw.githubusercontent.com/freepats/electric-bass-YR/8dcb7ea9116f417273ef8c030d15e7b3aa654301/FingerBassYR 20190930.sfz", mirror: "https://r2mirror.groove.wangda.today/freepats-electric-bass-yr/FingerBassYR 20190930.sfz" },
  "karoryfer-black-and-blue-basses": { programs: 11, source: "https://raw.githubusercontent.com/sfzinstruments/karoryfer.black-and-blue-basses/6e7d674cdb41be7a54dbccb15472401ad01099b9/Programs/01-darkblack_keysw.sfz", mirror: "https://r2mirror.groove.wangda.today/karoryfer-black-and-blue-basses/Programs/01-darkblack_keysw.sfz" },
  "freepats-button-accordion-hn": { programs: 1, source: "https://raw.githubusercontent.com/freepats/button-accordion-HN/d70d16456fd99305d1c24c612b205ab38846eb0f/PRESET Button Accordion HN tuned.sfz", mirror: "https://r2mirror.groove.wangda.today/freepats-button-accordion-hn/PRESET Button Accordion HN tuned.sfz" },
  "freepats-fsbs-dist2": { programs: 1, source: "https://raw.githubusercontent.com/freepats/electric-guitar-FSBS-dist2/21261b8bcb02d1cbf52dc02f1b1636df52d4a947/EGuitarFSBS-dist2 bridge 20220911.sfz", mirror: "https://r2mirror.groove.wangda.today/freepats-fsbs-dist2/EGuitarFSBS-dist2 bridge 20220911.sfz" },
  "freepats-spanish-classical-guitar": { programs: 1, source: "https://raw.githubusercontent.com/freepats/spanish-classical-guitar/6f4eb1b092acc88f5448cea1a0001bd07b971af8/SpanishClassicalGuitar-20190618.sfz", mirror: "https://r2mirror.groove.wangda.today/freepats-spanish-classical-guitar/SpanishClassicalGuitar-20190618.sfz" },
  "discord-gm-sitar": { programs: 2, source: "https://raw.githubusercontent.com/sfzinstruments/Discord-SFZ-GM-Bank/7a9c478fe331f94f246d33332f0adedb25bbbe27/Discord GM/Melodic/105-Sitar.sfz", mirror: "https://r2mirror.groove.wangda.today/discord-gm-sitar/Discord GM/Melodic/105-Sitar.sfz" },
  "freepats-drawbar-organ": { programs: 1, source: undefined, mirror: "https://r2mirror.groove.wangda.today/freepats-drawbar-organ/DrawbarOrganEmulation-SFZ-20190712/DrawbarOrganEmulation-20190712.sfz" },
  "freepats-percussive-organ": { programs: 1, source: undefined, mirror: "https://r2mirror.groove.wangda.today/freepats-percussive-organ/PercussiveOrganEmulation-SFZ-20190715/PercussiveOrganEmulation-20190715.sfz" },
  "jlearman-jrhodes3c": { programs: 3, source: "https://raw.githubusercontent.com/sfzinstruments/jlearman.jRhodes3c/ba6000f633d0a1d405049d877851ff7cc43f108b/jRhodes3c-looped-flac-sfz/_jRhodes-both-looped.sfz", mirror: "https://r2mirror.groove.wangda.today/jlearman-jrhodes3c/jRhodes3c-looped-flac-sfz/_jRhodes-both-looped.sfz" },
  "sonatina-brass": { programs: 48, source: "https://raw.githubusercontent.com/peastman/sso/32bbdb169aef636b8216029a2e056424ba7c2abb/Sonatina Symphonic Orchestra/Brass - Notation/All Brass Sustain.sfz", mirror: "https://r2mirror.groove.wangda.today/sonatina-brass/Sonatina Symphonic Orchestra/Brass - Notation/All Brass Sustain.sfz" },
  "karoryfer-bigcat-cello": { programs: 3, source: "https://raw.githubusercontent.com/sfzinstruments/karoryfer-bigcat.cello/6fd75fbfc1dbb3109bf26220ba1adea46188a18b/Programs/01- Bowed (velocity layer).sfz", mirror: "https://r2mirror.groove.wangda.today/karoryfer-bigcat-cello/Programs/01- Bowed (velocity layer).sfz" },
  "karoryfer-string-cyborgs": { programs: 3, source: "https://raw.githubusercontent.com/sfzinstruments/karoryfer.string-cyborgs/f2238b3e36ae64c6383356221dc89c9c476c7b11/Programs/Blackheart.sfz", mirror: "https://r2mirror.groove.wangda.today/karoryfer-string-cyborgs/Programs/Blackheart.sfz" },
  "aliexpress-erhu": { programs: 4, source: "https://raw.githubusercontent.com/sfzinstruments/aliexpress-erhu/6615047b2fd06126877483e97b8bb4af9d00b080/Programs/02-erhu_long.sfz", mirror: "https://r2mirror.groove.wangda.today/aliexpress-erhu/Programs/02-erhu_long.sfz" },
  "hungarian-zither": { programs: 2, source: "https://raw.githubusercontent.com/sfzinstruments/hungarian_zither/973d9445ba890661a4f4cd8e417d36134fb5f337/Programs/hungarian_zither.sfz", mirror: "https://r2mirror.groove.wangda.today/hungarian-zither/Programs/hungarian_zither.sfz" },
  "cithara-barbarica": { programs: 6, source: "https://raw.githubusercontent.com/sfzinstruments/cithara-barbarica/a47c10dc4a26538a8a56d31d3436488138292ca2/Programs/02-cithara_barbarica_finger.sfz", mirror: "https://r2mirror.groove.wangda.today/cithara-barbarica/Programs/02-cithara_barbarica_finger.sfz" },
  "mtg-solo-sax": { programs: 8, source: "https://raw.githubusercontent.com/sfzinstruments/MTG.SoloSax/b494d256549b3d088fdec176ce82867f8a1f58b2/MTG Solo Saxophones/MTG Soprano Sax.sfz", mirror: "https://r2mirror.groove.wangda.today/mtg-solo-sax/MTG Solo Saxophones/MTG Soprano Sax.sfz" },
  "karoryfer-big-rusty-drums": { programs: 8, source: "https://raw.githubusercontent.com/sfzinstruments/karoryfer.big-rusty-drums/f07ce00df34a46b6b08375be56fe116cf15782bc/Programs/01-full.sfz", mirror: "https://r2mirror.groove.wangda.today/karoryfer-big-rusty-drums/Programs/01-full.sfz" },
  "dsmolken-double-bass": { programs: 2, source: "https://raw.githubusercontent.com/sfzinstruments/dsmolken.double-bass/c2985eb647109d2a8f30a70071e3e163339d7396/d_smolken_rubner_bass_arco.sfz", mirror: "https://r2mirror.groove.wangda.today/dsmolken-double-bass/d_smolken_rubner_bass_arco.sfz" },
  "karoryfer-bear-sax": { programs: 4, source: "https://raw.githubusercontent.com/sfzinstruments/karoryfer.bear-sax/7abb3c652525a15dfac80e1b5dfbba9964ee568f/Programs/1-solo-mono.sfz", mirror: "https://r2mirror.groove.wangda.today/karoryfer-bear-sax/Programs/1-solo-mono.sfz" },
  "body-percussion": { programs: 1, source: "https://raw.githubusercontent.com/sfzinstruments/body_percussion/4ac9d8966679c648b62fa10a188179e186b97f24/Programs/body.sfz", mirror: "https://r2mirror.groove.wangda.today/body-percussion/Programs/body.sfz" },
  "karoryfer-squidpipes": { programs: 3, source: "https://raw.githubusercontent.com/sfzinstruments/karoryfer.squidpipes/b258528c8f49d6389ec2b4ec04a8b10013169dd9/Programs/01-squidpipes.sfz", mirror: "https://r2mirror.groove.wangda.today/karoryfer-squidpipes/Programs/01-squidpipes.sfz" },
  "karoryfer-272-merry-orks": { programs: 3, source: "https://raw.githubusercontent.com/sfzinstruments/karoryfer.272-merry-orks/a437e2c02014e02710a104a6692193eab8672d0a/ork_vocals.sfz", mirror: "https://r2mirror.groove.wangda.today/karoryfer-272-merry-orks/ork_vocals.sfz" },
  "jlearman-steel-drum": { programs: 2, source: "https://raw.githubusercontent.com/sfzinstruments/jlearman.SteelDrum/dc15a36ad69a43b0d240fcbd0cc78fbc61b2b47e/jSteelDrum.sfz", mirror: "https://r2mirror.groove.wangda.today/jlearman-steel-drum/jSteelDrum.sfz" },
  ganjo: { programs: 1, source: "https://raw.githubusercontent.com/sfzinstruments/ganjo/ccff5cd5cd3b513873a48994c07724d9d3c39e1c/ganjo.sfz", mirror: "https://r2mirror.groove.wangda.today/ganjo/ganjo.sfz" },
  "ixox-flute": { programs: 1, source: "https://raw.githubusercontent.com/sfzinstruments/Ixox.Flute/0cc54468bb0d2d9b32921958585caad65ba8df21/Ixox Flute.sfz", mirror: "https://r2mirror.groove.wangda.today/ixox-flute/Ixox Flute.sfz" },
  "karoryfer-cowsynth": { programs: 5, source: "https://raw.githubusercontent.com/sfzinstruments/karoryfer.cowsynth/5a5b5afc2dabbe54cf9d75ab64711ce01862b42c/cowsynth_baggy.sfz", mirror: "https://r2mirror.groove.wangda.today/karoryfer-cowsynth/cowsynth_baggy.sfz" },
};
