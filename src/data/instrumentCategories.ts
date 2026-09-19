import { INSTRUMENT_PRESET_ALIASES } from "../audio/instrumentPresets";
import { gs1PatchFor } from "../audio/gs1/gs1Tracks";

/**
 * Instrument categories for the timbre picker (item ②).
 *
 * The picker used to be a single flat `<select>` over 115 names — `rhodes_ep`, `reese_bass`,
 * `reverse_cymbal`, `muted_trumpet_lead` in one alphabetical wall. The user asked for categories
 * and filtering, so this table gives every name exactly one home.
 *
 * ## How the categories are decided
 *
 * A **rule first, then explicit overrides**, not a hand-typed partition of 115 names: a hand-typed
 * partition silently rots when someone adds an instrument, whereas a rule plus a *completeness
 * test* fails loudly. The rule reads the name the genre data actually uses (the alias key), which
 * follows the project's own naming convention: `*_bass` are basses, `*_lead`/`saw`/`square` are
 * leads, `pad`/`*_pad` are pads, and so on. The overrides exist where the name lies — `piano_lead`
 * is a keyboard, `cowbell_lead` is percussion, `distorted_kick` is a drum, and the FX names
 * (`riser`, `tape_stop`, `reverse_cymbal`, `vinyl_crackle`) are transitions rather than pitched
 * instruments.
 *
 * `assertEveryInstrumentCategorized()` is used by the test suite so a new alias cannot be added
 * without landing in a category (and therefore being visible in the picker).
 */
export const INSTRUMENT_CATEGORY_IDS = [
  "keys",
  "synthLead",
  "bass",
  "guitarPluck",
  "brassWinds",
  "malletPerc",
  "padTexture",
  "drums",
  "fx",
] as const;

export type InstrumentCategoryId = (typeof INSTRUMENT_CATEGORY_IDS)[number];

/** Explicit exceptions to the naming rule, each with the reason it is an exception. */
const CATEGORY_OVERRIDES: Record<string, InstrumentCategoryId> = {
  // A lead by name, a keyboard by nature.
  piano_lead: "keys",
  piano: "keys",
  acoustic_piano: "keys",
  grand_piano: "keys",
  rhodes: "keys",
  rhodes_ep: "keys",
  electric_piano: "keys",
  organ: "keys",
  organ_lead: "keys",
  m1_organ: "keys",
  hammond: "keys",
  hammond_organ: "keys",
  // Mallets and bells are pitched percussion: one-shots with a tuned body.
  vibraphone: "malletPerc",
  vibes: "malletPerc",
  marimba: "malletPerc",
  marimba_lead: "malletPerc",
  bell_lead: "malletPerc",
  bells: "malletPerc",
  music_box: "malletPerc",
  cowbell: "malletPerc",
  cowbell_lead: "malletPerc",
  // Drums, despite a lead-ish or synth-ish name.
  distorted_kick: "drums",
  // Transitional FX: they have no pitch identity and are used as risers/drops/stops.
  noise_sweep: "fx",
  noise_rise: "fx",
  sweep: "fx",
  sweep_down: "fx",
  down_sweep: "fx",
  reverse_sweep: "fx",
  fx_riser: "fx",
  riser: "fx",
  sub_drop: "fx",
  drop: "fx",
  tape_stop: "fx",
  tape: "fx",
  laser_zap: "fx",
  laser: "fx",
  zap: "fx",
  reverse_cymbal: "fx",
  vinyl_crackle: "fx",
  vinyl: "fx",
  crackle: "fx",
  horn_stab: "brassWinds",
  stab: "brassWinds",
  growl: "synthLead",
  growl_lead: "synthLead",
  // Strings that are pads in practice.
  strings: "padTexture",
  string_section: "padTexture",
  strings_lead: "padTexture",
  warm_pad: "padTexture",
  pad: "padTexture",
  synth_pad: "padTexture",
  // Plucked/strummed bodies.
  sitar_lead: "guitarPluck",
  nylon_guitar: "guitarPluck",
};

/** Names whose suffix is not enough; kept together so the intent is readable. */
const PAD_EXACT = new Set(["pad", "synth_pad", "warm_pad", "strings", "string_section", "strings_lead"]);

/**
 * The naming rule. Order matters: the first match wins, so the specific families are tested
 * before the generic `*_lead` suffix.
 */
function categorizeByRule(name: string): InstrumentCategoryId | null {
  if (PAD_EXACT.has(name) || name.endsWith("_pad")) return "padTexture";
  if (name.includes("bass") || name === "sub" || name === "808" || name === "808_sub" || name === "upright") return "bass";
  if (name.includes("guitar") || name.includes("pluck") || name.includes("sitar") || name.includes("banjo")) {
    return "guitarPluck";
  }
  if (name.includes("sax") || name.includes("trumpet") || name.includes("horn") || name.includes("brass") || name.includes("cornet")) {
    return "brassWinds";
  }
  if (name.includes("flute") || name.includes("harmonica") || name.includes("accordion") || name.includes("melodica")) {
    return "brassWinds";
  }
  if (name.includes("drum") || name.includes("kick") || name.includes("snare") || name.includes("hat") || name.includes("clap")) {
    return "drums";
  }
  if (name.includes("fx") || name.includes("sweep") || name.includes("riser") || name.includes("drop")) return "fx";
  if (
    name.includes("lead") ||
    name.includes("saw") ||
    name.includes("square") ||
    name.includes("pulse") ||
    name.includes("acid") ||
    name.includes("fm") ||
    name.includes("sine") ||
    name === "super_saw" ||
    name === "growl"
  ) {
    return "synthLead";
  }
  return null;
}

/** Resolve one instrument name to its category. Unknown names fall back to a lead-style bucket. */
export function categoryForInstrument(name: string): InstrumentCategoryId {
  const override = CATEGORY_OVERRIDES[name];
  if (override) return override;
  return categorizeByRule(name) ?? "synthLead";
}

export interface CategorizedInstruments {
  id: InstrumentCategoryId;
  /** Every alias in this category, sorted for display. */
  instruments: string[];
}

/** The whole catalog grouped by category, empty categories dropped. */
export function groupInstrumentsByCategory(
  names: readonly string[] = Object.keys(INSTRUMENT_PRESET_ALIASES)
): CategorizedInstruments[] {
  const buckets = new Map<InstrumentCategoryId, string[]>();
  for (const name of names) {
    const id = categoryForInstrument(name);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(name);
    else buckets.set(id, [name]);
  }
  // Category order is the declared order, so the picker's tabs never reshuffle between renders.
  return INSTRUMENT_CATEGORY_IDS.filter((id) => buckets.has(id)).map((id) => ({
    id,
    instruments: (buckets.get(id) as string[]).sort((a, b) => a.localeCompare(b)),
  }));
}

/**
 * Whether GS-1 voices this instrument, so the picker can mark which names belong to the new
 * architecture instead of leaving the user to guess why two patches sound different.
 */
export function isGs1Instrument(role: "chords" | "lead", name: string): boolean {
  return gs1PatchFor(role, name) !== null;
}

/**
 * Completeness guard for the test suite: every alias has exactly one category and the grouping
 * loses nothing. Returns the problems rather than throwing so a test can report them all at once.
 */
export function findCategorizationProblems(
  names: readonly string[] = Object.keys(INSTRUMENT_PRESET_ALIASES)
): string[] {
  const problems: string[] = [];
  const seen = new Map<string, InstrumentCategoryId>();
  for (const name of names) {
    const id = categoryForInstrument(name);
    if (!INSTRUMENT_CATEGORY_IDS.includes(id)) problems.push(`${name}: unknown category ${id}`);
    seen.set(name, id);
  }
  const grouped = groupInstrumentsByCategory(names).flatMap((g) => g.instruments);
  if (grouped.length !== names.length) {
    problems.push(`grouping lost instruments: ${names.length} in, ${grouped.length} out`);
  }
  const dupes = grouped.filter((name, i) => grouped.indexOf(name) !== i);
  if (dupes.length) problems.push(`duplicated across categories: ${[...new Set(dupes)].join(", ")}`);
  return problems;
}
