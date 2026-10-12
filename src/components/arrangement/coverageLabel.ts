/**
 * **How a coverage reading is said, in both languages — one place, so the picker, a list row and the track report
 * cannot phrase the same fact three ways.**
 *
 * Two rules are the whole point of this file:
 *
 *   · **"尚未加载" is a state, not a zero.** Before the engine has answered, the only honest text is the one that says
 *     so; there is no method here that turns an absent reading into a number.
 *   · **A hole is part of the range, never hidden by it.** A recording that sounds 39–76 with no sample for 41–43 is
 *     written "可发 39–76（缺 41–43）", so the two shapes the census found (`dsmolken` 12–120 missing 61–71/90–95, MTG
 *     39–76 missing 41–43) read as what they are instead of as a span that lies at its edges.
 */
import { keyRuns, type SampledKeyCoverage } from "../../features/sampledCoverage/sampledKeyCoverage";
import type { SampledCoverageStatus } from "../../hooks/useSampledCoverage";

/** The en dash the range labels use; a hyphen between two numbers reads as subtraction in a monospaced panel. */
const DASH = "–";

/** `41–43, 90–95` / `41–43、90–95`, from a sorted key list. Empty list is an empty string, never "0". */
export function formatKeyRuns(keys: readonly number[], isZh: boolean): string {
  return keyRuns(keys)
    .map(([first, last]) => (first === last ? `${first}` : `${first}${DASH}${last}`))
    .join(isZh ? "、" : ", ");
}

/** `可发 39–76（缺 41–43）` / `plays 39–76 (missing 41–43)`. */
export function coverageRangeText(coverage: SampledKeyCoverage, isZh: boolean): string {
  const span = `${coverage.first}${DASH}${coverage.last}`;
  if (coverage.holes.length === 0) return isZh ? `可发 ${span}` : `plays ${span}`;
  return isZh
    ? `可发 ${span}（缺 ${formatKeyRuns(coverage.holes, isZh)}）`
    : `plays ${span} (missing ${formatKeyRuns(coverage.holes, isZh)})`;
}

/**
 * The one sentence a coverage slot shows, for **every** state.
 *
 * `ready` with `null` is the engine saying "no key sounds" — a real answer, and different from "not loaded yet", which
 * is why the two get different sentences rather than a shared blank.
 */
export function describeCoverage(
  status: SampledCoverageStatus,
  coverage: SampledKeyCoverage | null | undefined,
  isZh: boolean
): string {
  if (status === "ready") {
    if (coverage === null) return isZh ? "这段录音一个键都发不出" : "this recording sounds no key";
    if (coverage === undefined) return isZh ? "尚未加载" : "not loaded yet";
    return coverageRangeText(coverage, isZh);
  }
  if (status === "failed") return isZh ? "音域读取失败" : "range unavailable";
  return isZh ? "尚未加载" : "not loaded yet";
}

/**
 * The track-level report, when a lane's written notes fall outside its recording.
 *
 * It names **how many notes** first, because that is the thing a person can act on, and the recording's own range
 * second, because it is the reason. The count is the engine's per-note refusals
 * (`notesOutsideCoverage`), not a comparison against the printed span — so a lane written 41–43 against a recording
 * whose span starts at 39 still reports all three.
 */
export function outsideRangeText(
  outsideCount: number,
  coverage: SampledKeyCoverage | null | undefined,
  isZh: boolean
): string {
  const range = coverage ? coverageRangeText(coverage, isZh) : isZh ? "音域未知" : "range unknown";
  return isZh
    ? `这条轨有 ${outsideCount} 个音超出该录音的音域：${range}`
    : `${outsideCount} note${outsideCount === 1 ? "" : "s"} on this track fall outside the recording's range: ${range}`;
}

/** `本轨写出 82–91` / `this track writes 82–91`, with the two counts that say how much material that is. */
export function writtenRangeText(
  first: number,
  last: number,
  noteCount: number,
  distinctCount: number,
  isZh: boolean
): string {
  const span = `${first}${DASH}${last}`;
  return isZh
    ? `本轨写出 ${span}（${distinctCount} 个音高，共 ${noteCount} 个音）`
    : `this track writes ${span} (${distinctCount} pitch${distinctCount === 1 ? "" : "es"}, ${noteCount} note${noteCount === 1 ? "" : "s"})`;
}
