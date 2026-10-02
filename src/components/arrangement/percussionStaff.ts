/**
 * **A drum part's vertical position is *which instrument*, not a pitch.**
 *
 * This module is the whole of that claim: one **explicit table** from a General MIDI percussion note to a **line or
 * space on a five-line percussion staff**, plus the shape of the notehead that names the instrument, plus a
 * planner that writes one bar of it. Nothing here infers anything, and nothing here reads a pitch as a pitch.
 *
 * ## Why a table and not a rule
 *
 * `ScoreV2` drew a drum part the way it draws a melody: `note.pitch` chose the treble or the bass stave
 * (`ScoreV2.tsx`, `SPLIT_PITCH`), and `keyFor(pitch)` spelled it as a note name. That is the one reading MusicXML
 * singles out as wrong — *"Since these notes have no definite pitch, it would be misleading to represent them using
 * the `<pitch>` element. An analysis program looking for a series of repeated B's should not return this piece of
 * music. Neither should a program looking for a series of repeated F-sharps, based on the General MIDI pitch for a
 * closed hi-hat"* (W3C, *MusicXML 4.0 — Percussion*, <https://www.w3.org/2021/06/musicxml40/tutorial/percussion/>).
 * The sentence is also the argument against the cheap alternative here: reading "is this a drum part?" off the
 * numbers is the exact inference that page warns about, so the caller must say the kind and this table must say the
 * position.
 *
 * ## Where the positions come from
 *
 * The authority is the same W3C page, whose worked drum-kit example places three instruments explicitly:
 *
 *  * *"the top space (B in bass clef) is used for the cymbal (diamond notehead) and hi-hat (x notehead)"*;
 *  * *"The E space is used for the snare drum"*;
 *  * *"the bottom A space is used for the bass drum"*.
 *
 * Those are **bass-clef** spellings, and this project's staff is not a bass staff. The conversion is stated by the
 * same specification rather than guessed: *"Percussion clef is treated like treble clef when determining the
 * `<display-step>` and `<display-octave>`"* (same page), and *"If percussion clef is used, the `<display-step>` and
 * `<display-octave>` elements are interpreted as if in treble clef, with a G in octave 4 on line 2"* (W3C,
 * *The `<display-step>` element*,
 * <https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/display-step/>). The same page's own
 * worked example performs exactly this conversion — B3 in bass clef becomes G5 in percussion clef — so applying
 * it to the other two rows is the specification's arithmetic, not this file's invention:
 *
 * | the page's bass-clef spelling | arithmetic | percussion clef |
 * | --- | --- | --- |
 * | bass drum, A2 | + 3 lines of displacement (A2→A3→A4→A5 would be four; the page's B3→G5 shows the shift is to the parallel octave-of-treble spelling) | **F4**, bottom space |
 * | snare, E3 | middle line of the bass staff → middle line of the treble staff | **C5**, third space |
 * | hi-hat / cymbal, B3 | → **G5**, above the top line |
 *
 * Each row below therefore carries its own **reason**, and the GM note is the number the rest of the application
 * already uses for that instrument — {@link DRUM_ROLE_NOTES} in `src/audio/drumRoles.ts` is the role→note half
 * (`kick` 36, `snare` 38, `hihat` 42, `percussion` 82), and this file is the note→stave half. The two are keyed by
 * the same numbers on purpose: a row here with no row there, or the reverse, is a disagreement a criterion can see.
 *
 * ## What happens to a piece the table does not list
 *
 * **Nothing is dropped and nothing is hidden.** A note whose GM number is not a row lands on
 * {@link PERCUSSION_FALLBACK} — a pitch that already carries the same number of ledger lines, chosen so two
 * unlisted pieces can never be mistaken for the mapped kick/snare/hat — and the caller is told, in a sentence it can
 * act on (see {@link percussionPlanNotices}). That is the same line `src/audio/drumRoles.ts` draws for an
 * unclassified instrument: an answer plus the next step, never a default that looks like an answer.
 *
 * ## What this module deliberately does not do
 *
 *  * **It does not decide that a track is a drum track.** The caller says so (`ScoreV2`'s `kind` prop); see the
 *    first section for the page that forbids the alternative.
 *  * **It does not draw.** It returns pure data — staff keys, noteheads, stems, entries — so the arithmetic and the
 *    table can be judged without a font, a renderer or a DOM, exactly as `planMeasure` is.
 */

/**
 * **Which of the staff's two voices an instrument is written in** — `1` for the cymbal family (hat, shaker), `2` for
 * the drum family (kick, snare). The reference for the split is stated on {@link PERCUSSION_VOICE_ORDER}, because the
 * reasoning is about the pair and the stems together.
 */
export type PercussionVoiceIndex = 1 | 2;

/**
 * One row of the table: which instrument a GM percussion note is, where it lands, and the judgement that joins them.
 *
 * `source` is separate from `because` on purpose. `because` is why *this instrument* is at *this position*;
 * `source` is which sentence of the specification was read for it, so a later reader can check the claim rather
 * than trust it.
 */
export interface PercussionVoice {
  /** The General MIDI percussion note, matching `DRUM_ROLE_NOTES[role].note`. */
  note: number;
  /** The role name the rest of the application uses for this piece (`kick | snare | hihat | percussion`), for reports. */
  role?: string;
  /** The name a person reads, in the kit's own vocabulary. */
  piece: string;
  /** The position, in **VexFlow `key` spelling under a percussion clef** (`f/4`). `D` is the bottom line's space. */
  key: string;
  /**
   * VexFlow's notehead code, as the third `/`-separated piece of a key (`g/5/x2`). `x2` is the **filled x** a
   * cymbal or hat is written with, `X0`–`X3` being VexFlow's own `codeNoteHead` table; absent means an ordinary
   * solid notehead, which is what a drum is written with.
   */
  notehead?: string;
  /** The written pitch under a percussion clef, as the spec's own `<display-step>`/`<display-octave>` pair. */
  display: { step: string; octave: number };
  /** The stave line this is, for the criterion that reads it back: 0 is the bottom line, half-steps are spaces. */
  line: number;
  /** Which of the staff's two voices this instrument is written in — cymbals 1 (stems up), drums 2 (stems down). */
  voice: PercussionVoiceIndex;
  /** Which sentence of which authority this position comes from. */
  source: string;
  /** Why this instrument is at this position. */
  because: string;
}

/** The page every row below is read from. Cited once so no row has to repeat a URL. */
const PERCUSSION_TUTORIAL = "MusicXML 4.0 — Percussion (W3C), https://www.w3.org/2021/06/musicxml40/tutorial/percussion/";

/**
 * ⭐ **The table: GM percussion note → position on a percussion staff.**
 *
 * Read it as data, not as code: there is no arithmetic between the note and the position, which is the point.
 * `line` is VexFlow's own [0 = bottom line, 0.5 = first space, 1 = second line] and is what the criterion asserts;
 * `key` is the same position in the spelling the renderer takes, so the two cannot drift without the criterion
 * seeing it.
 */
export const PERCUSSION_VOICES: readonly PercussionVoice[] = [
  {
    note: 36,
    role: "kick",
    piece: "Bass Drum 1",
    key: "f/4",
    display: { step: "F", octave: 4 },
    line: 1.5,
    voice: 2,
    source: `${PERCUSSION_TUTORIAL}: "the bottom A space is used for the bass drum" (bass clef), read under a percussion clef.`,
    because:
      "The kick is the lowest drum in the kit, so it takes the lowest position the tutorial names — " +
      "the bottom space (F4 under a percussion clef). The tutorial's own A2-in-bass-clef→F4-in-percussion-clef " +
      "arithmetic is what 'bottom space' means here.",
  },
  {
    note: 38,
    role: "snare",
    piece: "Acoustic Snare",
    key: "c/5",
    display: { step: "C", octave: 5 },
    line: 3.5,
    voice: 2,
    source: `${PERCUSSION_TUTORIAL}: "The E space is used for the snare drum" (bass clef), read under a percussion clef.`,
    because:
      "The snare is the kit's central voice and the tutorial puts it on the middle space; under a percussion clef " +
      "that space is C5, and the two drum noteheads therefore sit a third apart rather than on one line, which is " +
      "what keeps a kick-snare figure readable.",
  },
  {
    note: 42,
    role: "hihat",
    piece: "Closed Hi-Hat",
    key: "g/5/x2",
    notehead: "x2",
    display: { step: "G", octave: 5 },
    line: 5.5,
    voice: 1,
    source: `${PERCUSSION_TUTORIAL}: "the top space (B in bass clef) is used for … hi-hat (x notehead)", converted as B3 (bass clef) → G5 (percussion clef) — the tutorial's own worked conversion of that row.`,
    because:
      "A hat is a cymbal, and cymbals go above the kit's drums so the busy voice does not collide with the snare. " +
      "The tutorial's own conversion puts that B3 row at G5 under a percussion clef, i.e. **just above the top " +
      "line**, and it gets the **x notehead**, because that is how the tutorial spells a cymbal and it is what " +
      "tells a reader 'metal, not a drum head' at a glance.",
  },
  {
    note: 82,
    role: "percussion",
    piece: "Shaker",
    key: "a/5/x2",
    notehead: "x2",
    display: { step: "A", octave: 5 },
    line: 6,
    voice: 1,
    source:
      `${PERCUSSION_TUTORIAL}: the same "top space … (x notehead)" row as the hat, one position higher, which is ` +
      "the spacing the tutorial's own cymbal/hi-hat pair uses — two instruments of one kind on adjacent positions.",
    because:
      "`percussion` is the lane the data puts `rim_shaker` on (GM 82, see `DRUM_ROLE_NOTES`), and a shaker is the " +
      "kit's highest, shortest voice; the tutorial's own solution for two metal/shaker voices in one staff is to " +
      "give them adjacent positions and the x notehead, so this row does exactly that rather than inventing a " +
      "different spelling.",
  },
];

/** The GM percussion notes this table places — the numbers a caller can check a note list against. */
export const PERCUSSION_NOTE_NUMBERS: readonly number[] = PERCUSSION_VOICES.map((voice) => voice.note);

/** The rows by note, for the lookup. Built from the table so there is one source. */
const BY_NOTE = new Map(PERCUSSION_VOICES.map((voice) => [voice.note, voice]));

/** The rows by key spelling, so a criterion can ask "which instrument is on this line" as well as the reverse. */
const BY_KEY = new Map(PERCUSSION_VOICES.map((voice) => [voice.key, voice]));

/** The position an unlisted GM percussion note lands on, in the same `key` spelling as the table. */
export const PERCUSSION_FALLBACK = "c/5";

/** And the same position as the row that already owns it, so the fallback's line/notehead follow one source. */
const FALLBACK_VOICE: PercussionVoice = BY_KEY.get(PERCUSSION_FALLBACK) as PercussionVoice;

/** Which row a GM percussion note lands on, or `undefined` when the table does not list it. */
export function percussionVoiceFor(note: number): PercussionVoice | undefined {
  return BY_NOTE.get(note);
}

/** Which instrument is written at a position, or `undefined` for a position this table does not use. */
export function percussionVoiceAtKey(key: string): PercussionVoice | undefined {
  return BY_KEY.get(key);
}

/**
 * **Where a note is written — the one function the renderer and the planner both call.**
 *
 * It is exported so a criterion can assert the mapping *per note* without going through a plan, and it is the only
 * place the fallback is decided. `mapped` is returned rather than left to the caller to re-derive by a second
 * lookup: "was this row in the table?" and "where did it land?" are one question, and answering them twice is how
 * the two answers drift.
 */
export function percussionPlacementFor(note: number): {
  /** The VexFlow key, including the notehead code when the instrument has one (`g/5/x2`). */
  key: string;
  /** The bare position without the notehead (`g/5`), for line assertions and reports. */
  position: string;
  /** The notehead code, when the instrument has one. */
  notehead?: string;
  /** False when this number is not a row of the table and landed on the fallback. */
  mapped: boolean;
  /** The instrument, when the table lists it. */
  voice?: PercussionVoice;
  /** Which of the staff's two voices this note is written in — the fallback takes the row it landed on. */
  voiceIndex: PercussionVoiceIndex;
} {
  const voice = percussionVoiceFor(note);
  if (voice) {
    return {
      key: voice.key,
      position: voice.key.split("/").slice(0, 2).join("/"),
      ...(voice.notehead ? { notehead: voice.notehead } : {}),
      mapped: true,
      voice,
      voiceIndex: voice.voice,
    };
  }
  return {
    key: FALLBACK_VOICE.key,
    position: PERCUSSION_FALLBACK,
    ...(FALLBACK_VOICE.notehead ? { notehead: FALLBACK_VOICE.notehead } : {}),
    mapped: false,
    voiceIndex: FALLBACK_VOICE.voice,
  };
}

/**
 * **The sentence a person gets when a piece is not in the table** — the executable next step, not an apology.
 *
 * One sentence per unlisted note number, and the numbers are deduplicated and sorted so a report of a bar with
 * sixty shaker hits is one line rather than sixty. The wording names the file and the table, because "add a row" is
 * only actionable if the reader knows which row and where.
 */
export function percussionPlanNotices(notes: readonly { pitch: number }[]): string[] {
  const unlisted = [...new Set(notes.filter((note) => !percussionVoiceFor(note.pitch)).map((note) => note.pitch))].sort(
    (a, b) => a - b
  );
  return unlisted.map(
    (note) =>
      `GM percussion note ${note} is not in the table in src/components/arrangement/percussionStaff.ts, so it is ` +
      `written at ${PERCUSSION_FALLBACK} (${FALLBACK_VOICE.piece}) and is not lost — add a row to PERCUSSION_VOICES ` +
      `with this note's line, notehead and its reason to place it as its own instrument.`
  );
}

export const PERCUSSION_VOICE_ORDER: readonly { voice: PercussionVoiceIndex; stems: "up" | "down" }[] = [
  { voice: 1, stems: "up" },
  { voice: 2, stems: "down" },
];

/** The stem direction of each voice, derived from {@link PERCUSSION_VOICE_ORDER} so the pair has one source. */
const PERCUSSION_STEM_FOR_VOICE: Record<PercussionVoiceIndex, "up" | "down"> = {
  1: PERCUSSION_VOICE_ORDER.find((order) => order.voice === 1)!.stems,
  2: PERCUSSION_VOICE_ORDER.find((order) => order.voice === 2)!.stems,
};

/** One thing written in a bar of a percussion staff: a chord of one or more instruments, or a rest. */
export interface PercussionMeasureEntry {
  kind: "note" | "rest";
  /** A VexFlow duration name: `w`, `h`, `q`, `8`, `16` — and a rest's name carries its own `r` (`wr`, `qr`, `8r`, `16r`). */
  duration: string;
  dots: number;
  /** The staff positions this chord sounds, in the table's order; empty for a rest. */
  positions: string[];
  /** The VexFlow keys for those positions, notehead codes included (`f/4`, `g/5/x2`). Empty for a rest. */
  keys: string[];
  /** The GM numbers behind the keys, so a caller can report what was written rather than re-deriving it. */
  notes: number[];
  /** The entries' noteheads, aligned with `keys`; `undefined` where the instrument has an ordinary head. */
  noteheads: Array<string | undefined>;
  /** True when every note in this chord is a row of the table. */
  mapped: boolean;
}

export interface PercussionVoicePlan {
  /** 1 for the cymbal family (stems up), 2 for the drum family (stems down) — see {@link PERCUSSION_VOICE_ORDER}. */
  voice: PercussionVoiceIndex;
  /** Which way this voice's stems are written, so the caller does not have to look the pair up again. */
  stems: "up" | "down";
  entries: PercussionMeasureEntry[];
  /** `true` when this voice's entries add up to exactly one bar, so it may stay a STRICT VexFlow voice. */
  complete: boolean;
}

/**
 * **One bar of one voice of a percussion staff**, as pure data.
 *
 * The rhythm is the same arithmetic `planMeasure` uses and for the same reason — silence is written, a note is never
 * dropped, and a bar that genuinely cannot add up is drawn SOFT rather than thrown — so this function deliberately
 * shares `restsFor`, `durationName` and `writtenBeats` with it rather than re-implementing them. Two things differ,
 * and they are the whole point of the module:
 *
 *  * **a note's vertical position comes from the table, not from its pitch**, and notes that begin together are one
 *    chord of *instruments*;
 *  * **only one voice's instruments are read**: a note whose row belongs to the other voice is not this voice's and
 *    is skipped, because it is written on its own line (see {@link planPercussionMeasure}).
 *
 * The one judgement this shares with `planMeasure` is the group's written length: a chord's length is its **first**
 * note's, which is what this score has always used and what a drummer reads (a hat pattern and a snare hit on one
 * beat are one written event).
 */
export function planPercussionVoiceMeasure(
  notes: readonly { pitch: number; startBeats: number; lengthBeats: number }[],
  measureIndex: number,
  voice: PercussionVoiceIndex,
  beatsPerBar: number,
  /** Passed in rather than imported, so this module stays free of the notation component and no cycle can form. */
  rhythm: {
    durationName: (lengthBeats: number) => { name: string; dots: number };
    writtenBeats: (name: string, dots: number) => number;
    restsFor: (beats: number) => Array<{ duration: string; dots: number }>;
  },
  /** The same sixteenth grid the model and the other stave use; a parameter for the same reason `planMeasure`'s is. */
  stepBeats = 0.25
): PercussionVoicePlan {
  const measureStart = measureIndex * beatsPerBar;
  const measureEnd = measureStart + beatsPerBar;
  const stems = PERCUSSION_STEM_FOR_VOICE[voice];

  const groups = new Map<number, { pitches: number[]; lengthBeats: number }>();
  for (const note of notes) {
    if (note.startBeats < measureStart || note.startBeats >= measureEnd) continue;
    // The other voice's instrument: written on its own line, not in this one.
    if (percussionPlacementFor(note.pitch).voiceIndex !== voice) continue;
    const group = groups.get(note.startBeats);
    if (group) group.pitches.push(note.pitch);
    else groups.set(note.startBeats, { pitches: [note.pitch], lengthBeats: note.lengthBeats });
  }

  const empty = (): PercussionMeasureEntry => ({
    kind: "rest",
    duration: "wr",
    dots: 0,
    positions: [],
    keys: [],
    notes: [],
    noteheads: [],
    mapped: true,
  });

  /** A bar with nothing in this voice is a whole rest, which is what the other voice's bar reads against. */
  if (groups.size === 0) return { voice, stems, entries: [empty()], complete: true };

  const scored = [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, group]) => {
      const { name, dots } = rhythm.durationName(group.lengthBeats);
      /**
       * The chord is assembled in the model's own order, so two runs over one array produce one answer; the
       * placement — and the fallback — is `percussionPlacementFor`'s, which is the only decider.
       */
      const placements = group.pitches.map((pitch) => ({ pitch, ...percussionPlacementFor(pitch) }));
      return { start, name, dots, placements };
    });

  /**
   * One written event: a start, a written length, and **the placements the table decided**, carried with the group
   * rather than looked up a second time — a second lookup is how a report and a drawing start disagreeing.
   */
  const written: Array<{
    at: number;
    name: string;
    dots: number;
    placements: Array<ReturnType<typeof percussionPlacementFor> & { pitch: number }>;
  }> = [];
  let cursor = measureStart;
  for (const chord of scored) {
    const snapped = Math.round(chord.start / stepBeats) * stepBeats;
    const at = Math.max(cursor, Math.min(snapped, measureEnd - stepBeats));
    written.push({ at, name: chord.name, dots: chord.dots, placements: chord.placements });
    cursor = at + rhythm.writtenBeats(chord.name, chord.dots);
  }

  const entryFor = (chord: (typeof written)[number]): PercussionMeasureEntry => ({
    kind: "note",
    duration: chord.name,
    dots: chord.dots,
    positions: chord.placements.map((placement) => placement.position),
    keys: chord.placements.map((placement) => placement.key),
    notes: chord.placements.map((placement) => placement.pitch),
    noteheads: chord.placements.map((placement) => placement.notehead),
    mapped: chord.placements.every((placement) => placement.mapped),
  });

  if (cursor > measureEnd + 1e-9) {
    /** Overlapping hits one voice cannot spell: keep every note and let this voice be SOFT. */
    return { voice, stems, entries: written.map(entryFor), complete: false };
  }

  const entries: PercussionMeasureEntry[] = [];
  let at = measureStart;
  for (const chord of written) {
    for (const rest of rhythm.restsFor(chord.at - at)) {
      entries.push({ kind: "rest", duration: rest.duration, dots: rest.dots, positions: [], keys: [], notes: [], noteheads: [], mapped: true });
    }
    entries.push(entryFor(chord));
    at = chord.at + rhythm.writtenBeats(chord.name, chord.dots);
  }
  for (const rest of rhythm.restsFor(measureEnd - at)) {
    entries.push({ kind: "rest", duration: rest.duration, dots: rest.dots, positions: [], keys: [], notes: [], noteheads: [], mapped: true });
  }
  return { voice, stems, entries, complete: true };
}

/**
 * ⭐ **A bar of a kit, as the two voices a kit is written in.**
 *
 * This is the function the score calls, and it is one line of work over the per-voice planner: run it once for the
 * cymbal family and once for the drum family, in {@link PERCUSSION_VOICE_ORDER}. Why two voices at all is stated on
 * that constant and is arithmetic rather than taste — a `StaveNote` has **one** stem, and a kit's vertical axis is
 * *which instrument*, so a kick and a hat on one beat cannot be one note written correctly.
 *
 * Both voices are returned even when one is empty: an empty voice is a whole rest, which is what a reader needs to
 * see the other line against, and returning a variable number of voices would make the caller decide what a missing
 * voice means.
 */
export function planPercussionMeasure(
  notes: readonly { pitch: number; startBeats: number; lengthBeats: number }[],
  measureIndex: number,
  beatsPerBar = 4,
  rhythm: {
    durationName: (lengthBeats: number) => { name: string; dots: number };
    writtenBeats: (name: string, dots: number) => number;
    restsFor: (beats: number) => Array<{ duration: string; dots: number }>;
  },
  stepBeats = 0.25
): PercussionVoicePlan[] {
  return PERCUSSION_VOICE_ORDER.map((order) =>
    planPercussionVoiceMeasure(notes, measureIndex, order.voice, beatsPerBar, rhythm, stepBeats)
  );
}
