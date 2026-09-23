/**
 * B5 — arrangement forms: the generator that turns one loop into a song.
 *
 * The listening report's "there is no fill, no variation, no build" is a statement about a *timeline*, and the
 * alternative to fixing it per genre is fixing it once: a form is a short list of sections (clip, repeats, label,
 * ramp, fill) and the generator expands it against whatever clip the project holds. That is the rule this repository
 * already applies to colour (`scripts/desktop_skins.mjs`) and to velocity (P0.2): **no per-genre hand-editing**, one
 * table, and a drift check where drift is possible.
 *
 * Two decisions worth naming:
 *
 *   * **A fill is derived from the clip's own lanes.** The generator does not invent a "tom"; it looks for the lanes
 *     the clip actually has that read as drums, and puts the hits on those. A clip with no drum lane gets no fill
 *     rather than a fill on a chord track.
 *   * **The form is data, not a magic function.** `ARRANGEMENT_FORMS` is inspectable and a test pins each form's
 *     shape (bars, labels, which steps build and which fill), so "the drop got shorter" is a failing test rather
 *     than a surprise after an export.
 *
 * Labels are the conventional short English words a DAW shows on a region ("intro", "build", "drop"). They are
 * section *labels* — user-editable data on the song, not UI chrome — so they travel with the arrangement instead of
 * being re-translated on load.
 */
import {
  DEFAULT_FILL_VELOCITY,
  MAX_SECTION_BARS,
  type ClipSlot,
  type SectionOverrides,
  type SongFill,
  type SongSection,
} from "../types/song";

/**
 * The only thing a fill needs to know about a lane.
 *
 * A deliberate string, not `SequencerTrack["track_id"]` (which is a closed union): the generator is given whatever
 * the clip holds, and *matching* a lane by a substring is the same operation for a known id and for a custom one.
 */
export interface FillLane {
  track_id: string;
  name?: string;
}

export type ArrangementFormId = "loop" | "club" | "song";

export interface ArrangementFormStep {
  slot: ClipSlot;
  bars: number;
  label: string;
  /** A build across this section: the multiplier at its first and last pass. */
  velocityRamp?: [number, number];
  /** Put a drum fill on this section's last pass. */
  fill?: boolean;
}

export interface ArrangementForm {
  id: ArrangementFormId;
  /** The name on the picker. Short, because it sits in a row of three. */
  label: { en: string; zh: string };
  /**
   * What the form is for, for a tooltip.
   *
   * Deliberately **without** a bar count: `formBars()` computes that, the picker shows it next to the name, and a
   * number written twice is a number that disagrees with itself the first time the table is edited (it did, in the
   * draft of this file: the summary said 36 and the steps added up to 40).
   */
  summary: { en: string; zh: string };
  steps: readonly ArrangementFormStep[];
}

/**
 * The forms.
 *
 * `loop` is the identity — one section, the pattern as written — so "generate an arrangement" is always reversible
 * by picking it back. The other two differ in *shape*, not in content: which clip each section points at, how long
 * it repeats, where it builds and where it fills.
 */
export const ARRANGEMENT_FORMS: Record<ArrangementFormId, ArrangementForm> = {
  loop: {
    id: "loop",
    label: { en: "loop", zh: "循环" },
    summary: {
      en: "the pattern as one section — what the studio does today",
      zh: "把当前 pattern 作为单一段落——即现在的工作台行为",
    },
    steps: [{ slot: "A", bars: 4, label: "loop" }],
  },
  club: {
    id: "club",
    label: { en: "club", zh: "俱乐部" },
    summary: {
      en: "intro → build → drop → break → drop → outro",
      zh: "前奏 → 渐强 → drop → 间奏 → drop → 尾奏",
    },
    steps: [
      { slot: "A", bars: 8, label: "intro", velocityRamp: [0.55, 0.85] },
      { slot: "A", bars: 8, label: "build", velocityRamp: [0.85, 1] },
      { slot: "A", bars: 8, label: "drop" },
      { slot: "B", bars: 4, label: "break", fill: true },
      { slot: "A", bars: 8, label: "drop" },
      { slot: "B", bars: 4, label: "outro", fill: true },
    ],
  },
  song: {
    id: "song",
    label: { en: "song", zh: "歌曲" },
    summary: {
      en: "intro → verse → chorus → verse → chorus → outro",
      zh: "前奏 → 主歌 → 副歌 → 主歌 → 副歌 → 尾奏",
    },
    steps: [
      { slot: "A", bars: 4, label: "intro", velocityRamp: [0.6, 0.9] },
      { slot: "A", bars: 8, label: "verse" },
      { slot: "B", bars: 8, label: "chorus" },
      { slot: "A", bars: 8, label: "verse" },
      { slot: "B", bars: 8, label: "chorus", fill: true },
      { slot: "A", bars: 4, label: "outro", fill: true },
    ],
  },
};

export const ARRANGEMENT_FORM_IDS = Object.keys(ARRANGEMENT_FORMS) as ArrangementFormId[];

/**
 * How many steps at the end of a pass a fill covers.
 *
 * Four: the last beat of a 16-step bar, one beat of a 32-step bar — the window a fill actually occupies, and short
 * enough that a clip whose pass is only a step or two long does not have its whole bar replaced by hits.
 */
export const FILL_STEPS = 4;

/** Lane ids that read as drums, most fill-like first. Matched case-insensitively against id *and* name. */
const FILL_LANES: readonly string[] = ["snare", "clap", "rim", "tom", "perc", "conga", "shaker", "hat"];

/**
 * Which of the clip's lanes a fill should hit, most fill-like first.
 *
 * Exported because the arrangement view shows the choice: a user who sees "fill: snare" can tell whether the
 * generator picked the lane they meant.
 */
export function fillLanes(tracks: readonly FillLane[]): string[] {
  const found: string[] = [];
  for (const wanted of FILL_LANES) {
    for (const track of tracks) {
      const id = (track.track_id ?? "").toLowerCase();
      const name = (track.name ?? "").toLowerCase();
      if ((id.includes(wanted) || name.includes(wanted)) && !found.includes(track.track_id)) {
        found.push(track.track_id);
      }
    }
  }
  return found;
}

/**
 * The fill for one section, or `undefined` when the clip has no lane to put it on.
 *
 * The hits land on the last `FILL_STEPS` steps of a pass, at one velocity — the fill's own — which the section's
 * `velocityRamp` then scales, so a fill at the end of a build still arrives at the build's end value. A per-hit
 * crescendo would need a per-step velocity list on `SongFill`; it is deliberately not in this slice, because the
 * *onsets* are what the plan promises ("the last bar's onset count differs from the others") and one velocity is the
 * smallest thing that can be tested.
 */
export function fillForTracks(tracks: readonly FillLane[], stepsPerPass: number): SongFill | undefined {
  const lanes = fillLanes(tracks);
  if (!lanes.length) return undefined;
  const pass = Math.floor(stepsPerPass);
  if (!Number.isFinite(pass) || pass <= 0) return undefined;
  const first = Math.max(0, pass - FILL_STEPS);
  const steps: number[] = [];
  for (let step = first; step < pass; step += 1) steps.push(step);
  if (!steps.length) return undefined;
  return { tracks: lanes, steps, velocity: DEFAULT_FILL_VELOCITY };
}

export interface ArrangementRequest {
  songId: string;
  form: ArrangementFormId;
  /** The clip's lanes, so a fill can name real ones. Omitted means "no fills". */
  tracks?: readonly FillLane[];
  /** Steps in one pass of the clip — where the fill's hits land. */
  stepsPerPass?: number;
}

/**
 * Expand a form into sections.
 *
 * Ids follow the model's own convention (`<songId>-s<n>`) so a generated arrangement looks exactly like one the
 * studio's chain editor produced, and `bars` is clamped to the model's limit — a form is a table a human can edit,
 * and a typo there must not produce a section the renderer refuses.
 */
export function arrangementSections(request: ArrangementRequest): SongSection[] {
  const form = ARRANGEMENT_FORMS[request.form] ?? ARRANGEMENT_FORMS.loop;
  const fill =
    request.tracks && request.stepsPerPass
      ? fillForTracks(request.tracks, request.stepsPerPass)
      : undefined;

  return form.steps.map((step, index) => {
    const overrides: SectionOverrides = {};
    if (step.velocityRamp) overrides.velocityRamp = step.velocityRamp;
    if (step.fill && fill) overrides.fill = fill;
    return {
      id: `${request.songId}-s${index + 1}`,
      slot: step.slot,
      bars: Math.max(1, Math.min(MAX_SECTION_BARS, Math.floor(step.bars))),
      label: step.label,
      ...(Object.keys(overrides).length ? { overrides } : {}),
    };
  });
}

/** Total bars a form expands to — what a picker shows next to the name. */
export function formBars(form: ArrangementFormId): number {
  return (ARRANGEMENT_FORMS[form] ?? ARRANGEMENT_FORMS.loop).steps.reduce((sum, step) => sum + step.bars, 0);
}
