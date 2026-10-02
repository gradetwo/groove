/**
 * ⭐ **The criterion that keeps "temporarily disabled" from becoming "quietly disabled".**
 *
 * `docs/DISABLED_GATES.md` and `scripts/disabledGates.mjs` say four measurement gates are switched
 * off by the owner's decision of 2026-10-02, because they render — or hold a baseline recorded from
 * a render — without `audioLaneCatalogue`, and therefore cannot see the sampling path at all. That
 * decision is only safe while it stays exactly that size, so this file locks it from two directions:
 *
 *   · the **wiring** must equal the ledger (`auditDisabledGates`, the same function
 *     `npm run check:disabled-gates` runs in CI) — a gate switched off without a ledger entry fails,
 *     and a ledger entry that still runs fails;
 *   · the **ledger itself** must still be those four gates, written out here by hand — so a fifth
 *     entry, however well wired, cannot be added without a human editing this expectation and
 *     reading why.
 *
 * ⭐ **That is exactly how the fourth got here.** The owner ruled the musical ratchet in on
 * 2026-10-02, after the first three: *"check:groove 一起禁"*. The edit to `EXPECTED_DISABLED` below
 * is that decision being written down where a person has to read it — the mechanism working, not
 * being worked around.
 *
 * The behaviour is checked by running the guard, not by reading it: the disabled command must not
 * run, the override must run it, and an unlisted id must run it (fail-safe), because a gate that
 * stops judging without saying so is the failure this whole ledger exists against.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DISABLED_GATES, NEVER_DISABLED, auditDisabledGates } from "../../scripts/disabledGates.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * These four, and nothing else — see the file comment for why this list is written out twice.
 *
 * The fourth (`check:groove`) was added by the owner's ruling of 2026-10-02 ("check:groove 一起禁"),
 * not by a developer deciding it was convenient.
 */
const EXPECTED_DISABLED = ["check:loudness:fresh", "check:loudness", "check:timbre", "check:groove"];

function guard(gateId: string, command: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["scripts/disabled_gate_guard.mjs", gateId, "--", ...command], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("the disabled-gates ledger", () => {
  it("is exactly the ledger, in both directions, with no never-disable gate switched off", () => {
    const { problems, oks } = auditDisabledGates(ROOT);
    expect(problems, problems.join("\n")).toEqual([]);
    expect(oks.length).toBeGreaterThan(0);
  });

  it("holds exactly the four gates the owner ruled out, each with why / when / who", () => {
    expect(DISABLED_GATES.map((gate) => gate.id).sort()).toEqual([...EXPECTED_DISABLED].sort());
    for (const gate of DISABLED_GATES) {
      expect(gate.why, `${gate.id} must say why`).toMatch(/catalogue/i);
      expect(gate.returnsWhen, `${gate.id} must say when it comes back`).toMatch(/catalogue/i);
      expect(gate.returnsWhen, `${gate.id} must name the baseline re-record`).toMatch(/baseline|re-record/i);
      expect(gate.decidedBy, `${gate.id} must name the decision`).toMatch(/owner/i);
      expect(gate.decidedBy, `${gate.id} must date the decision`).toMatch(/2026-10-02/);
    }
    for (const id of NEVER_DISABLED) {
      expect(DISABLED_GATES.map((gate) => gate.id), `${id} must never be disabled`).not.toContain(id);
    }
  });

  it("does not run a disabled gate, and says why instead", () => {
    for (const id of EXPECTED_DISABLED) {
      const result = guard(id, [process.execPath, "-e", "console.log('THE GATE RAN')"]);
      expect(result.status, `${id} must exit 0 so its CI step stays green`).toBe(0);
      expect(result.stdout, `${id} must print the notice`).toContain(`DISABLED GATE — ${id}`);
      expect(result.stdout).toContain("why         :");
      expect(result.stdout).toContain("comes back  :");
      expect(result.stdout).toContain("decided by  :");
      expect(result.stdout, `${id} must not run the real gate`).not.toContain("THE GATE RAN");
    }
  });

  it("runs the real gate when overridden, so the switch is reversible without an edit", () => {
    const result = guard("check:loudness", [process.execPath, "-e", "console.log('THE GATE RAN')"], {
      DISABLED_GATES_IGNORE: "1",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("THE GATE RAN");
    expect(result.stdout).toContain("DISABLED_GATES_IGNORE");
  });

  it("runs a gate that was wired through the guard without a ledger entry — fail-safe, and loud", () => {
    const result = guard("some:gate:that:is:not:listed", [process.execPath, "-e", "process.exit(7)"]);
    expect(result.status, "an unlisted gate must still run, with its own exit status").toBe(7);
    expect(result.stderr).toContain("no entry in scripts/disabledGates.mjs");
  });
});
