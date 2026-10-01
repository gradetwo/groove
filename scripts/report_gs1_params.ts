/**
 * Report (not a gate): **every GS-1 parameter, and whether the vendored table gives it a declared range.**
 *
 *   npx vite-node scripts/report_gs1_params.ts
 *
 * `docs/GS1_PATCH_SURFACE.md` §8 quotes this list verbatim, and it exists as a command rather than a copied table for the
 * repository's usual reason: a list pasted into prose drifts from the table it was copied from, and the numbers in it
 * are the whole point of the section. It reads the **vendored** table (`vendor/gs1/src/audio/params.ts`), which is the
 * same file the renderer resolves a share code against, so the report and the code cannot disagree about what a
 * `gs1.1.` code carries.
 *
 * Two counts matter: `DEFAULT_PARAMS` is the parameter vector a share code encodes (ascending id order), and
 * `PARAM_SPECS` is the subset the synth UI also gives a label, a range and a default. A per-parameter MCP write would
 * have a name and a range for the first set of ids and only a name for the second set.
 */
import { Param, DEFAULT_PARAMS, PARAM_SPECS, SPEC_BY_ID } from "../vendor/gs1/src/audio/params";

const nameById = new Map<number, string>();
for (const [key, value] of Object.entries(Param)) {
  if (typeof value === "number") nameById.set(value, key);
}

const ids = Object.keys(DEFAULT_PARAMS)
  .map(Number)
  .sort((a, b) => a - b);

const withSpec = ids.filter((id) => SPEC_BY_ID[id]);
console.log(`DEFAULT_PARAMS (the share code's vector): ${ids.length}`);
console.log(`PARAM_SPECS (label + range + default):    ${PARAM_SPECS.length}`);
console.log(`defaults with a declared range:           ${withSpec.length}`);
console.log(`defaults with only an enum name + default: ${ids.length - withSpec.length}`);
console.log("");
console.log("| id | `Param` enum | PARAM_SPECS | label | min | max | default |");
console.log("| ---: | --- | :---: | --- | ---: | ---: | ---: |");
for (const id of ids) {
  const spec = SPEC_BY_ID[id];
  const name = nameById.get(id) ?? "?";
  if (spec) console.log(`| ${id} | \`${name}\` | ✅ | ${spec.label} | ${spec.min} | ${spec.max} | ${spec.def} |`);
  else console.log(`| ${id} | \`${name}\` | — | | | | ${DEFAULT_PARAMS[id]} |`);
}
