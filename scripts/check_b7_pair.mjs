#!/usr/bin/env node
/**
 * B7's paired criterion: the arrangement must differ from itself by more than the **control** does.
 *
 * The probe's absolute gate was `ratio >= 3` and it has been failing on every run, while the control — the same probe and analyser measuring
 * a plain loop, where no section change happens — reads 1.0–1.2×. That control is what this file turns into the actual claim: not "the
 * arrangement differs by a factor of three" (a number chosen before there was data) but "**the arrangement carries a change the control does
 * not**", expressed as a ratio of ratios.
 *
 * It is deliberately a separate script reading two JSON reports rather than logic inside the probe, because the probe's measurement must not
 * change while its gate does — a gate and a measurement edited in the same commit cannot tell you which one moved.
 *
 * Usage: node scripts/check_b7_pair.mjs <arrangement.json> <control.json>
 */
import { readFileSync } from "node:fs";

/** The starting choice, stated as one: 2× the control's own self-difference. */
const FACTOR = 2;

const [, , arrangementPath, controlPath] = process.argv;
if (!arrangementPath || !controlPath) {
  console.error("usage: node scripts/check_b7_pair.mjs <arrangement.json> <control.json>");
  process.exit(2);
}

const ratioOf = (file) => {
  const report = JSON.parse(readFileSync(file, "utf8"));
  const floor = report.alignedFloor ?? report.selfDistanceA;
  if (!report.distanceAB || !floor) return null;
  return {
    ratio: report.distanceAB / floor,
    genre: report.genre,
    distanceAB: report.distanceAB,
    floor,
    /**
     * The temporal reading, reported alongside rather than instead of the mean-spectrum one.
     *
     * The mean asks "do these sections sound alike on average", which a rearrangement of the same material answers "yes" to — and that is why
     * the first honest verdict was 0.86× of the control. The time course asks "does frame *i* match frame *i*", which is the question a
     * rearrangement answers "no" to. Both are printed; only the second is expected to move.
     */
    timeCourse: report.timeCourseAB && report.timeCourseFloor ? report.timeCourseAB / report.timeCourseFloor : null,
    timeCourseAB: report.timeCourseAB ?? null,
    timeCourseFloor: report.timeCourseFloor ?? null,
  };
};

const arrangement = ratioOf(arrangementPath);
const control = ratioOf(controlPath);
if (!arrangement || !control) {
  console.error(`❌ B7 pair: could not read a ratio from ${!arrangement ? arrangementPath : controlPath}`);
  process.exit(1);
}

const paired = arrangement.ratio / control.ratio;
const ok = paired >= FACTOR;
console.log(
  `${ok ? "✅" : "❌"} B7 paired: arrangement ${arrangement.ratio.toFixed(2)}× vs control ${control.ratio.toFixed(2)}× ` +
    `= ${paired.toFixed(2)}× of the control (gate: ≥ ${FACTOR}×)`
);
if (arrangement.timeCourse !== null && control.timeCourse !== null) {
  const pairedTime = arrangement.timeCourse / control.timeCourse;
  const timeOk = pairedTime >= FACTOR;
  console.log(
    `${timeOk ? "✅" : "❌"} B7 paired (time course): arrangement ${arrangement.timeCourse.toFixed(2)}× vs control ` +
      `${control.timeCourse.toFixed(2)}× = ${pairedTime.toFixed(2)}× of the control (gate: ≥ ${FACTOR}×)`
  );
  if (!timeOk) {
    console.error(
      `   the frame-by-frame reading does not separate the two sections from the control either — so the finding is about the arrangement ` +
        `itself (a musical decision) rather than about the metric (a measurement problem).`
    );
  }
}

if (!ok) {
  /**
   * A failure here is a statement about evidence, not about the feature: the section change B7 exists to demonstrate is currently smaller
   * than the gate requires. Saying so plainly is the point — the number this replaces was passing nothing.
   */
  console.error(
    `   the arrangement's self-difference is ${paired.toFixed(2)}× the control's; B7's claim ("the section change is audible as a change") ` +
      `is not yet supported at this factor. Lowering the factor would fit the gate to the data, which is the failure mode this project records.`
  );
  process.exitCode = 1;
}
