import { ARRANGEMENT_FORMS, type ArrangementFormId } from "./arrangementForm";
import type { ArrangementV2 } from "../types/arrangementV2";

/**
 * ⭐ **What an arrangement form means in the arrangement layer.**
 *
 * The studio's picker has offered `loop`, `club` and `song` for a long time, and what it built from that choice was a v1 section
 * chain. The arrangement layer has no sections, so the form has to be said again in its own terms: how many bars the arrangement
 * lasts, and where each labelled part of it begins. The two are one source of truth — the bar counts come from the form's own
 * steps, so a form edited here cannot disagree with the picker.
 */
export interface FormPart {
  label: string;
  fromBar: number;
  toBar: number;
}

/** ⭐ The arrangement's length for a form: the sum of its steps, because each step is a stretch of bars. */
export function formBarsV2(form: ArrangementFormId): number {
  return ARRANGEMENT_FORMS[form].steps.reduce((total, step) => total + step.bars, 0);
}

/** ⭐ Where each labelled part sits, in bars from the arrangement's start. */
export function formPartsV2(form: ArrangementFormId): FormPart[] {
  let at = 0;
  return ARRANGEMENT_FORMS[form].steps.map((step) => {
    const part = { label: step.label, fromBar: at, toBar: at + step.bars };
    at += step.bars;
    return part;
  });
}

/**
 * ⭐ **A form sets the frame, never the music.**
 *
 * Choosing a form is a decision about how long the arrangement is and how its parts are laid out, so the notes are carried over
 * untouched: a composer who picks `club` and then picks `loop` again has the music they started with. This is the whole of what a
 * form means at this layer today — the ramps, fills and risers the form also names are recorded as gaps rather than applied here.
 */
export function applyFormBars(arrangement: ArrangementV2, form: ArrangementFormId): ArrangementV2 {
  return { ...arrangement, bars: formBarsV2(form) };
}
