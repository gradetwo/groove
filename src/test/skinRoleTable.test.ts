/**
 * The shared literal→role table: what a hardcoded hex means, in one place.
 *
 * The desktop generator decides that, and it was once written independently of the phone's `legacySkin`/
 * `panelSkin` sheets. The table is the single source, and `scripts/check_skin_roles.mjs` holds the generator to
 * it — this test holds the *table itself* to its own rules, so a bad entry fails here with a precise message
 * rather than as a mysterious colour somewhere in a skin.
 */
import { describe, it, expect } from "vitest";
import table from "../data/skinLiteralRoles.json";

const ROLES = new Set(table.roles as string[]);
const HEX = /^#[0-9a-f]{3,8}$/;

describe("skin literal role table", () => {
  it("lists a role vocabulary without duplicates", () => {
    const roles = table.roles as string[];
    expect(roles.length).toBeGreaterThan(20);
    expect(new Set(roles).size).toBe(roles.length);
    for (const role of roles) expect(role).toMatch(/^[a-z][a-zA-Z0-9]*$/);
  });

  it("maps every literal to a role that exists", () => {
    const literals = Object.entries(table.literals as Record<string, string>);
    expect(literals.length).toBeGreaterThan(20);
    for (const [hex, role] of literals) {
      expect(hex, "literals are lower-case hex").toMatch(HEX);
      expect(ROLES.has(role), `${hex} → "${role}" is not in the vocabulary`).toBe(true);
    }
  });

  it("records no deviations, because the sheets that could deviate are cut", () => {
    /**
     * A deviation was the escape hatch that kept the drift check usable: the phone's character sheets were
     * opinionated (the comic skin printed dark plates as ink). Both sheets are cut with the phone shell
     * (`docs/OPEN_WORK.md` §十三), so there is nothing left to deviate from the table — and a non-empty list
     * would be a dead reference to a file that no longer exists. The check is an equality on purpose: it fails
     * on a *new* entry, which is the moment someone must decide whether it is really a second surface again.
     */
    expect(table.deviations).toEqual([]);
  });

  it("never records a deviation that matches the table (it would be dead weight)", () => {
    for (const entry of table.deviations as Array<Record<string, string>>) {
      const declared = (table.literals as Record<string, string>)[entry.literal];
      expect(entry.role, `${entry.literal} deviates to the value it already has`).not.toBe(declared);
    }
  });

  it("documents why the table exists", () => {
    expect((table.$comment as string[]).join(" ")).toMatch(/single source/);
  });
});
