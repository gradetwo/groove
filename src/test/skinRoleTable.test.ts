/**
 * The shared literal→role table: the contract that keeps the two surfaces honest.
 *
 * The desktop generator and the phone's `legacySkin`/`panelSkin` sheets both decide what a hardcoded hex means.
 * The table is the single source, and `scripts/check_skin_roles.mjs` holds all three to it — this test holds the
 * *table itself* to its own rules, so a bad entry fails here with a precise message rather than as a mysterious
 * colour somewhere on a phone.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import table from "../data/skinLiteralRoles.json";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

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

  it("allows a surface to deviate, but never without a reason", () => {
    /**
     * A deviation is the escape hatch that keeps the check usable: the phone's character sheets are opinionated
     * (the comic skin prints dark plates as ink). What must never happen is a *silent* deviation — so every entry
     * names the surface, the literal, the role it chose instead, and why.
     */
    const deviations = table.deviations as Array<Record<string, string>>;
    expect(deviations.length).toBeGreaterThan(0);
    for (const entry of deviations) {
      expect(entry.surface, JSON.stringify(entry)).toMatch(/\.css$/);
      expect(entry.prefix === "*" || ["bg", "text", "border"].includes(entry.prefix), JSON.stringify(entry)).toBe(true);
      expect(entry.literal).toMatch(HEX);
      expect(ROLES.has(entry.role), `${entry.literal} → "${entry.role}" is not in the vocabulary`).toBe(true);
      expect((entry.reason ?? "").length, `${entry.surface} ${entry.literal} has no reason`).toBeGreaterThan(40);
      /**
       * The deviation has to be *real*: the sheet it names must actually map that literal.
       *
       * (The table holds the hand-written literals; the desktop's long tail is assigned per *use* rather than per
       * hex, so a deviation may legitimately name a literal the table does not list. What it may not do is name
       * one no sheet maps — that would be a stale entry that silently permits a divergence nobody has.)
       */
      const sheet = fs.readFileSync(path.resolve(TEST_DIR, "..", "mobile", "skins", entry.surface), "utf8");
      expect(sheet.includes(`[class~="${entry.prefix === "*" ? "bg" : entry.prefix}-[${entry.literal}]"`), `${entry.surface} does not map ${entry.literal}`).toBe(true);
    }
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
