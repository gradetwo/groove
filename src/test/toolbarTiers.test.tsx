import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_TIER_ITEMS,
  bindingKey,
  DEFAULT_VISIBLE_IDS,
  TIER_1_MAX,
  TIER_1_PRIMARY,
  TIER_2,
  TIER_3,
  shortcutBindings,
  tierOf,
  validateTiers,
} from "../components/sequencer/toolbarTiers";
import type { ToolbarTierItem } from "../components/sequencer/toolbarTiers";

/**
 * C-01 — toolbar tier table contract.
 *
 * The layout half of the plan's acceptance ("Tier 3 stays invisible by default",
 * "toolbar <= 56 px") belongs to the later slimming milestone (C-02/C-03) and is
 * deliberately NOT asserted here: it would be red today. What this file locks in
 * is the table itself — that it is internally valid, that every keyboard binding
 * is pinned to Tier 1, that `DEFAULT_VISIBLE_IDS` is exactly Tier 1, that the
 * validator can genuinely fail (mutation-style guards), and that no `id` or
 * `labelKey` has drifted away from the real Toolbar / locale sources.
 */

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(TEST_DIR, "..");
const TOOLBAR_PATH = path.join(SRC_DIR, "components", "sequencer", "Toolbar.tsx");
const STUDIO_LOCALE_PATH = path.join(SRC_DIR, "i18n", "locales", "studio.ts");

/**
 * `export` is the ExportMenu trigger's real key (`title={t("export")}`) but it is
 * defined in `explore.ts`, not `studio.ts` — the locale files are merged at
 * runtime. Every other labelKey resolves from `studio.ts`. This map is the
 * explicit, reviewable exception; nothing else may leave `studio.ts`.
 */
const CROSS_LOCALE_KEYS: Record<string, string> = {
  export: "i18n/locales/explore.ts",
};

const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const read = (absolutePath: string): string => fs.readFileSync(absolutePath, "utf8");

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isLocaleKeyDefined = (source: string, key: string): boolean =>
  new RegExp(`^\\s*${escapeRegExp(key)}\\s*:`, "m").test(source);

/** Terse builder for the deliberately broken tables below. */
function makeItem(
  overrides: Partial<ToolbarTierItem> & Pick<ToolbarTierItem, "id" | "labelKey" | "tier">,
): ToolbarTierItem {
  return { ...overrides };
}

describe("toolbar tier table (C-01)", () => {
  it("the shipped table is internally valid", () => {
    expect(validateTiers(ALL_TIER_ITEMS)).toEqual([]);
  });

  it("ALL_TIER_ITEMS is exactly Tier 1 + Tier 2 + Tier 3 (nothing dropped)", () => {
    expect(ALL_TIER_ITEMS).toEqual([...TIER_1_PRIMARY, ...TIER_2, ...TIER_3]);
  });

  it("each item's tier field matches the array it lives in", () => {
    // validateTiers cannot detect this from a flat list, so the test does.
    const arrays = [
      [1, TIER_1_PRIMARY],
      [2, TIER_2],
      [3, TIER_3],
    ] as const;
    for (const [tier, rows] of arrays) {
      for (const item of rows) {
        expect(item.tier, `${item.id} should be tier ${tier}`).toBe(tier);
      }
    }
  });

  it("Tier 1 is non-empty and no longer than TIER_1_MAX", () => {
    expect(TIER_1_PRIMARY.length).toBeGreaterThan(0);
    expect(TIER_1_PRIMARY.length).toBeLessThanOrEqual(TIER_1_MAX);
  });

  it("keeps every shortcut-bearing control reachable from a Tier 1 surface", () => {
    const bound = ALL_TIER_ITEMS.filter(
      (item) => Boolean(item.shortcut) || (item.shortcutAliases?.length ?? 0) > 0,
    );
    expect(bound.length, "the table records no shortcuts at all").toBeGreaterThan(0);

    const tier1Ids = new Set(TIER_1_PRIMARY.map((item) => item.id));

    for (const item of bound) {
      if (item.tier === 1) continue;
      expect(
        item.reachableVia,
        `${item.id} carries keyboard bindings but is tier ${item.tier} with no reachableVia`,
      ).toBeDefined();
      expect(tier1Ids.has(item.reachableVia as string)).toBe(true);
    }

    const tokens = bound.flatMap((item) => [
      ...(item.shortcut ? [item.shortcut] : []),
      ...(item.shortcutAliases ?? []),
    ]);
    expect(new Set(tokens).size, `duplicate tokens in ${tokens.join(", ")}`).toBe(tokens.length);

    expect([...shortcutBindings()].sort()).toEqual([...tokens].sort());
  });

  it("records all three single-key bindings the plan's Tier 1 list omits", () => {
    // Regression guard for the first revision of this table, which silently
    // dropped D/C/P because pinning them would have broken TIER_1_MAX.
    const byShortcut = new Map(ALL_TIER_ITEMS.map((item) => [item.shortcut, item.id]));
    expect(new Map(ALL_TIER_ITEMS.map((item) => [item.shortcutAliases?.[0], item.id])).get("Ctrl/Cmd+Y")).toBe(
      "redo",
    );
    expect(byShortcut.get("D")).toBe("drums-only");
    expect(byShortcut.get("C")).toBe("console");
    expect(byShortcut.get("P")).toBe("project-hub");
    // …and they stay out of the always-visible row.
    for (const id of ["drums-only", "console", "project-hub"]) {
      expect(DEFAULT_VISIBLE_IDS).not.toContain(id);
    }
  });

  it("records every single-key binding the real shortcuts hook declares", () => {
    // Grounding: read the hook and compare its key list against the table, so a new
    // binding cannot be added to the app without appearing here. `Escape` is excluded
    // because it is a shared context-dependent dismiss key, not one control's binding.
    const hook = read(
      path.join(SRC_DIR, "features", "sequencer", "hooks", "useTransportShortcuts.ts"),
    );
    const declared = new Set<string>();
    for (const m of hook.matchAll(/e\.key === "([^"]+)"/g)) {
      if (m[1].length === 1) declared.add(m[1].toUpperCase());
    }
    declared.delete("ESCAPE");
    expect(declared.size).toBeGreaterThan(4);

    const recorded = new Set(shortcutBindings().map(bindingKey));
    const unrecorded = [...declared].filter((key) => !recorded.has(key)).sort();
    expect(
      unrecorded,
      `keys bound by the hook but missing from the table: ${unrecorded.join(", ")}`,
    ).toEqual([]);

    // The one binding the hook declares via `e.code` rather than `e.key`.
    expect(hook).toContain('e.code === "Space"');
    expect(recorded.has("SPACE")).toBe(true);
  });

  it("bindingKey reduces a token to the key it presses", () => {
    expect(bindingKey("Ctrl/Cmd+Shift+Z")).toBe("Z");
    expect(bindingKey("Ctrl/Cmd+Y")).toBe("Y");
    expect(bindingKey("V")).toBe("V");
    expect(bindingKey("Space")).toBe("SPACE");
  });

  it("DEFAULT_VISIBLE_IDS is exactly the Tier 1 ids and hides no Tier 2/3 id", () => {
    expect([...DEFAULT_VISIBLE_IDS]).toEqual(TIER_1_PRIMARY.map((item) => item.id));
    expect(DEFAULT_VISIBLE_IDS.length).toBe(TIER_1_PRIMARY.length);

    const lowerTiers = new Set([...TIER_2, ...TIER_3].map((item) => item.id));
    for (const id of DEFAULT_VISIBLE_IDS) {
      expect(lowerTiers.has(id), `${id} is both default-visible and Tier 2/3`).toBe(false);
    }
  });

  it("tierOf resolves every shipped id and rejects unknown ids", () => {
    for (const item of ALL_TIER_ITEMS) {
      expect(tierOf(item.id), item.id).toBe(item.tier);
    }
    expect(tierOf("definitely-not-a-toolbar-control")).toBeUndefined();
  });
});

/**
 * Mutation-style guard: the validator must be able to go RED. If any of these
 * stop reporting, the green "real table is valid" assertion above becomes
 * meaningless. This is the layout half's stand-in until C-02/C-03 exist.
 */
describe("validateTiers is a real guard (mutation-style, must be able to fail)", () => {
  it("accepts a minimal well-formed table", () => {
    const table = [makeItem({ id: "play", labelKey: "toolbar_play", tier: 1 })];
    expect(validateTiers(table)).toEqual([]);
  });

  it("reports a duplicate id", () => {
    const table = [
      makeItem({ id: "play", labelKey: "toolbar_play", tier: 1 }),
      makeItem({ id: "play", labelKey: "toolbar_pause", tier: 1 }),
    ];
    expect(validateTiers(table).join("\n")).toContain("duplicate id");
  });

  it("reports a shortcut on a control outside Tier 1 that declares no reachableVia", () => {
    const table = [makeItem({ id: "swing", labelKey: "swing", tier: 2, shortcut: "V" })];
    expect(validateTiers(table).join("\n")).toContain("no reachableVia");
  });

  it("accepts a shortcut outside Tier 1 when it is reachable from a Tier 1 surface", () => {
    const table = [
      makeItem({ id: "more", labelKey: "toolbar_advanced_label", tier: 1 }),
      makeItem({
        id: "drums-only",
        labelKey: "toolbar_drums_only_label",
        tier: 2,
        shortcut: "D",
        reachableVia: "more",
      }),
    ];
    expect(validateTiers(table)).toEqual([]);
  });

  it("reports a reachableVia that names an unknown control", () => {
    const table = [
      makeItem({
        id: "drums-only",
        labelKey: "toolbar_drums_only_label",
        tier: 2,
        shortcut: "D",
        reachableVia: "nope",
      }),
    ];
    expect(validateTiers(table).join("\n")).toContain("not a known control id");
  });

  it("reports a reachableVia that points at a non-Tier-1 item", () => {
    const table = [
      makeItem({ id: "swing", labelKey: "swing", tier: 2 }),
      makeItem({
        id: "drums-only",
        labelKey: "toolbar_drums_only_label",
        tier: 2,
        shortcut: "D",
        reachableVia: "swing",
      }),
    ];
    expect(validateTiers(table).join("\n")).toContain("cannot keep this control reachable");
  });

  it("reports a pointless reachableVia on a Tier 1 item", () => {
    const table = [
      makeItem({ id: "more", labelKey: "toolbar_advanced_label", tier: 1, reachableVia: "more" }),
    ];
    expect(validateTiers(table).join("\n")).toContain("already visible");
  });

  it("reports a Tier 1 that is longer than TIER_1_MAX", () => {
    const table = Array.from({ length: TIER_1_MAX + 1 }, (_, i) =>
      makeItem({ id: `bulk-${i}`, labelKey: "toolbar_play", tier: 1 }),
    );
    expect(validateTiers(table).join("\n")).toContain("TIER_1_MAX");
  });

  it("reports an empty labelKey", () => {
    const table = [makeItem({ id: "mystery", labelKey: "", tier: 2 })];
    expect(validateTiers(table).join("\n")).toContain("empty labelKey");
  });

  it("reports an empty id", () => {
    const table = [makeItem({ id: "", labelKey: "toolbar_play", tier: 2 })];
    expect(validateTiers(table).join("\n")).toContain("empty id");
  });

  it("reports a duplicate between a primary binding and another control's alias", () => {
    const table = [
      makeItem({ id: "redo", labelKey: "toolbar_redo_title", tier: 1, shortcut: "Ctrl/Cmd+Shift+Z" }),
      makeItem({
        id: "undo",
        labelKey: "toolbar_undo_title",
        tier: 1,
        shortcutAliases: ["Ctrl/Cmd+Shift+Z"],
      }),
    ];
    expect(validateTiers(table).join("\n")).toContain("duplicate shortcut");
  });

  it("reports an alias on a non-Tier-1 control with no reachableVia", () => {
    const table = [
      makeItem({ id: "swing", labelKey: "swing", tier: 2, shortcutAliases: ["S"] }),
    ];
    expect(validateTiers(table).join("\n")).toContain("no reachableVia");
  });

  it("reports the same shortcut token bound to two controls (case-insensitive)", () => {
    const table = [
      makeItem({ id: "velocity-lane", labelKey: "toolbar_velocity_label", tier: 1, shortcut: "V" }),
      makeItem({ id: "euclid", labelKey: "toolbar_euclid_label", tier: 1, shortcut: "v" }),
    ];
    expect(validateTiers(table).join("\n")).toContain("duplicate shortcut");
  });
});

/**
 * Grounding check: read the real sources from disk so this table cannot drift
 * into fiction. Every `labelKey` must be a real `t("<key>")` argument in
 * Toolbar.tsx, every key must be defined in the locale sources, and every `id`
 * must be non-empty kebab-case.
 */
describe("grounding: the table cannot drift from the real Toolbar", () => {
  it("every labelKey is really passed to t() in Toolbar.tsx", () => {
    const toolbar = read(TOOLBAR_PATH);
    const missing = ALL_TIER_ITEMS.filter(
      (item) => !toolbar.includes(`t("${item.labelKey}"`),
    ).map((item) => `${item.id} -> ${item.labelKey}`);
    expect(missing, `labelKeys not found as t("<key>") in Toolbar.tsx:\n${missing.join("\n")}`).toEqual(
      [],
    );
  });

  it("every labelKey is defined in the locale sources (studio.ts, documented exceptions aside)", () => {
    const studio = read(STUDIO_LOCALE_PATH);
    const missing: string[] = [];

    for (const item of ALL_TIER_ITEMS) {
      if (isLocaleKeyDefined(studio, item.labelKey)) continue;
      const crossLocale = CROSS_LOCALE_KEYS[item.labelKey];
      if (crossLocale && isLocaleKeyDefined(read(path.join(SRC_DIR, crossLocale)), item.labelKey)) {
        continue;
      }
      missing.push(`${item.id} -> ${item.labelKey}`);
    }

    expect(missing, `labelKeys with no locale definition:\n${missing.join("\n")}`).toEqual([]);
  });

  it("every id is non-empty, kebab-case, and unique", () => {
    const ids = ALL_TIER_ITEMS.map((item) => item.id);

    const malformed = ids.filter((id) => id.trim() === "" || !KEBAB_CASE.test(id));
    expect(malformed, `ids that are not kebab-case: ${malformed.join(", ")}`).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every declared testId is really rendered by the Toolbar", () => {
    const toolbar = read(TOOLBAR_PATH);
    const missing = ALL_TIER_ITEMS.filter(
      (item) => item.testId !== undefined && !toolbar.includes(`data-testid="${item.testId}"`),
    ).map((item) => `${item.id} -> ${item.testId}`);
    expect(missing, `testIds not rendered by Toolbar.tsx:\n${missing.join("\n")}`).toEqual([]);
  });
});
