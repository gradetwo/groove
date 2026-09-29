/**
 * The CC conditions that decide **whether a region sounds at all**.
 *
 * `loccN`/`hiccN` are gates rather than modulations: a region outside its range is not quiet, it is absent. `virtuosity_drums` uses them for microphone levels — `locc101=1` on the kick's microphone means "this microphone is on" — and its
 * `<control>` block turns them all on by setting CC101 to 127. A loader that ignored the gates would sound the same for this library by accident; it would be wrong for any library that gates a region off at rest.
 *
 * **The semantics and the boundaries are measured, not read off the names.** Rendering one tone per case with sfizz, at CC1 values of 0, 63, 64 and 127:
 *
 * ```
 *   locc1=64   220 Hz at CC1 = 0 ✗   63 ✗   64 ✓   127 ✓     → sounds when cc >= locc
 *   hicc1=64   220 Hz at CC1 = 0 ✓   63 ✓   64 ✓   127 ✗     → sounds when cc <= hicc
 *   no <control>, locc1=64, no CC sent        ✗   → an unset CC is 0, so 0 >= 64 fails
 *   <control> set_cc1=64, locc1=64           ✓   → the file's control block is where an initial value comes from
 *   <control> set_cc1=64, locc1=65           ✗   → and it is compared, not merely present
 * ```
 *
 * Both ends are inclusive, which is what the two measurements at the boundary say: `locc1=64` sounds at exactly 64, and `hicc1=64` sounds at exactly 64.
 */
import type { SfzRegion } from "./parse";

/** `set_ccN=value` from a file's `<control>` blocks, later declarations winning. */
export function readControlDefaults(text: string): Map<number, number> {
  const defaults = new Map<number, number>();
  let inControl = false;
  for (const rawLine of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    const line = rawLine.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    const header = line.match(/^<([a-zA-Z0-9_]+)>\s*(.*)$/);
    if (header) {
      inControl = header[1]!.toLowerCase() === "control";
      // `set_ccN` may sit on the header line itself (`<control> set_cc1=64`).
      if (inControl) applyControlLine(header[2] ?? "", defaults);
      continue;
    }
    if (inControl) applyControlLine(line, defaults);
  }
  return defaults;
}

function applyControlLine(line: string, defaults: Map<number, number>): void {
  for (const match of line.matchAll(/(?:^|\s)set_cc(\d+)\s*=\s*(\S+)/g)) {
    const value = Number(match[2]);
    if (Number.isFinite(value)) defaults.set(Number(match[1]), value);
  }
}

/**
 * Whether a region sounds at these CC values.
 *
 * A region with no gate sounds, which is the common case and the one that must not become conditional by accident.
 */
export function regionSoundsAtCc(region: SfzRegion, cc: ReadonlyMap<number, number>): boolean {
  for (const [opcode, raw] of Object.entries(region.opcodes)) {
    const gate = /^(locc|hicc)(\d+)$/.exec(opcode);
    if (!gate) continue;
    const wanted = Number(raw);
    if (!Number.isFinite(wanted)) continue;
    // An unset controller is 0, measured above rather than assumed from the specification.
    const value = cc.get(Number(gate[2])) ?? 0;
    if (gate[1] === "locc" && value < wanted) return false;
    if (gate[1] === "hicc" && value > wanted) return false;
  }
  return true;
}

/** The regions that sound at these CC values, in order. */
export function regionsAtCc(regions: readonly SfzRegion[], cc: ReadonlyMap<number, number>): SfzRegion[] {
  return regions.filter((region) => regionSoundsAtCc(region, cc));
}
