/**
 * **What an SFZ actually says, without reading the source.**
 *
 * Muse, composing through the MCP server, put it plainly: `note_polyphony` and `amplitude_onccN` had been measured
 * and covered by criteria, and there was **no way to see the values of a given SFZ from a tool** — debugging a sampler
 * meant reading the parser's source. The information existed and had no outlet, which is the shape most of this
 * work's findings share.
 *
 * Nothing needed building underneath: `SfzRegion` keeps `opcodes: Record<string, string>` and distinguishes what was
 * **inherited** from `<global>`/`<group>`, so this is a summariser over data that is already there.
 *
 * It reports **only parameters that were actually written**, with where each came from. A table listing every
 * parameter with a default would answer a different question — "what would this do" rather than "what does this say"
 * — and the second is the one that settles an argument about a file.
 */

/**
 * The parameters worth surfacing: the ones that change how a note sounds or whether it sounds at all.
 *
 * ⭐ **`sw_` is a prefix rather than one name, because the keyswitch set is the answer to a question the owner asked
 * directly**: which articulation a file actually offers, and which one it loads with. `sw_last` alone said *that* a
 * region is gated but not *which* articulation it is — the names live in `sw_label`, the power-on value in
 * `sw_default`, and the reachable key range in `sw_lokey`/`sw_hikey`. Reporting the gate without the label is the
 * shape this whole tool exists to remove: the value was read and had no outlet. The matcher below is already a
 * prefix match, so this one entry covers every switch opcode the parser keeps.
 */
const INTERESTING = [
  "note_polyphony",
  "amplitude_oncc",
  "amplitude",
  "one_shot",
  "off_by",
  "off_mode",
  "tune_cc",
  "tune",
  "loop_mode",
  "group",
  "group_label",
  "seq_length",
  "seq_position",
  "locc",
  "hicc",
  "sw_",
  "xfin_lokey",
] as const;

export interface SfzParameterRow {
  /** The opcode as written, e.g. `note_polyphony`, `locc64`, `amplitude_oncc7`. */
  opcode: string;
  /** The value as written — this is a reading of the file, not a parsed number. */
  value: string;
  /** How many regions carry it, so a parameter set once on a group and once on a region reads differently from one set everywhere. */
  regions: number;
  /** True when the value came from `<global>`/`<group>` rather than this region's own line. */
  inherited: boolean;
}

/**
 * Summarise the interesting parameters of a parsed instrument.
 *
 * `regions` is typed structurally on purpose: the caller passes what the parser produced, and this function needs
 * nothing else from it — no import means no coupling, and a criterion can hand it two plain objects.
 */
export function summariseSfzParameters(
  regions: readonly { opcodes: Record<string, string>; inherited?: Record<string, string> }[]
): SfzParameterRow[] {
  /** Keyed by `opcode=value=inherited` so that a parameter written twice with different values produces two rows rather than hiding one. */
  const seen = new Map<string, SfzParameterRow>();
  for (const region of regions) {
    const own = region.opcodes ?? {};
    const inherited = region.inherited ?? {};
    for (const [opcode, value] of Object.entries({ ...inherited, ...own })) {
      if (!INTERESTING.some((wanted) => opcode === wanted || opcode.startsWith(wanted))) continue;
      /**
       * A value that came from a parent is marked as such **even when the region does not repeat it** — which is the
       * whole reason `inherited` is a separate map. Reporting the two identically would make "this region says
       * nothing" and "this region was told by its group" look the same, and that difference is what a person
       * debugging a library is looking for.
       */
      const fromParent = own[opcode] === undefined && inherited[opcode] !== undefined;
      const key = `${opcode}=${value}=${fromParent}`;
      const row = seen.get(key);
      if (row) row.regions += 1;
      else seen.set(key, { opcode, value, regions: 1, inherited: fromParent });
    }
  }
  // Most widespread first, then alphabetical, so the table reads like a summary rather than like file order.
  return [...seen.values()].sort((a, b) => b.regions - a.regions || a.opcode.localeCompare(b.opcode));
}
