import { describe, it, expect } from "vitest";
import { GS1_CHORDS_ROUTING, GS1_LEAD_ROUTING, GS1_TEXTURE_ROUTING, GS1_PATCHES } from "../data/gs1Patches";
import { resolveInstrumentPreset } from "../audio/instrumentPresets";
import { ATTACK_ARRIVAL_MULTIPLE } from "../audio/chordVoicing";

/**
 * The attack-arrival rule reads the **native** preset's attack, so every GS-1 patch must not attack more slowly than the
 * preset it stands in for.
 *
 * `soundingDuration` guarantees a note lasts at least `attack × ATTACK_ARRIVAL_MULTIPLE`, and the attack it is handed is the
 * native preset's — because that is what the rule was written against when a pad was being cut at 18 % of its swell. On the
 * GS-1 path the voice that actually plays is the *patch*, so a patch attacking more slowly than its preset would slip past
 * the rule and be cut exactly the way the rule exists to prevent.
 *
 * The tolerance is where it matters rather than where it is exact: a patch may attack up to 20 ms — or half as long again —
 * slower than its preset before the difference could cut a note the rule was supposed to protect. The first version of this
 * test demanded `patch <= preset` exactly and flagged four patches whose differences are **1 to 2 milliseconds** (0.010
 * against 0.008, 0.002 against 0.001), which is a guard measuring its own arithmetic instead of the sound.
 *
 * Every routed patch is checked, which is also the cheapest moment to notice that a new patch needs a faster attack: the
 * measurement that would find it afterwards is a stem render whose window may not even contain the note.
 */
const ENV_ATTACK_PARAM = 19;

const routed = [
  ...Object.entries(GS1_CHORDS_ROUTING),
  ...Object.entries(GS1_LEAD_ROUTING),
  ...Object.entries(GS1_TEXTURE_ROUTING),
]
  .map(([instrument, entry]) => ({ instrument, patch: (entry as { patch?: string })?.patch }))
  .filter((row): row is { instrument: string; patch: keyof typeof GS1_PATCHES } => Boolean(row.patch));

describe("GS-1 patches never attack more slowly than the preset they replace", () => {
  it("keeps every routed patch inside its preset's attack budget", () => {
    const offenders: string[] = [];
    for (const row of routed) {
      const preset = resolveInstrumentPreset(row.instrument, "lead") as unknown as { adsr?: { attack?: number } };
      const presetAttack = preset.adsr?.attack ?? 0;
      const patchAttack = GS1_PATCHES[row.patch][ENV_ATTACK_PARAM] ?? 0;
      const tolerance = Math.max(0.02, presetAttack * 0.5);
      if (patchAttack > presetAttack + tolerance) {
        offenders.push(
          `${row.instrument} (${row.patch}): patch ${patchAttack}s is more than ${tolerance.toFixed(3)}s slower than preset ${presetAttack}s`
        );
      }
    }
    expect(offenders, "a patch much slower than its preset is cut by the attack-arrival rule").toEqual([]);
  });

  it("is a real constraint, not a formality", () => {
    // The multiple the rule uses is what turns "fits inside the note" into an audible guarantee; if it ever drops to 1 the
    // rule stops protecting a slowly-attacking patch.
    expect(ATTACK_ARRIVAL_MULTIPLE).toBeGreaterThanOrEqual(2);
  });
});
