/* ------------------------------------------------------------------------- *
 * C-01 · Toolbar frequency tiers (single source of truth)
 *
 * The studio toolbar currently renders every control unconditionally and is
 * ~173 px tall at 1440x900. The tiering splits it into three frequency tiers so a later milestone can show Tier 1, fold Tier 2 into a
 * trailing icon group, and move Tier 3 into a "more" popover.
 *
 * Tiering rule
 * ------------
 * A control belongs to the tier that matches how often a producer reaches for it
 * *while a pattern is looping*:
 *
 *   Tier 1 — transport-critical / touched every few seconds.
 *   Tier 2 — groove, feel, routing and project context: several times a session.
 *   Tier 3 — set-and-forget or session-edge: sound design, structural edits,
 *            device preferences, exports and niche modes.
 *
 * Why keyboard-shortcut controls must stay reachable
 * --------------------------------------------------
 * A global accelerator is only honest if the control it drives can be reached.
 * Hiding a shortcut-bearing control teaches the user that the key is broken, and
 * the plan states the invariant explicitly: any control with a single-key
 * binding MUST live in Tier 1.
 *
 * Three bindings make the literal form of that rule impossible to satisfy: the
 * hook also binds `D` (drums-only), `P` (project hub) and `C` (floating console),
 * and the plan's own Tier 1 list does not name them. Pinning all three would put
 * Tier 1 at 15 against the plan's harder exit criterion (<= 14 visible controls).
 * The rule is therefore stated in the form that preserves its *purpose*:
 *
 *     every shortcut-bearing control is either Tier 1, or declares the Tier 1
 *     surface that can reach it (`reachableVia`).
 *
 * `more` is itself Tier 1, so D/P/C stay one click away behind a control that is
 * always visible. `validateTiers` enforces exactly this, so a binding can never be
 * dropped from the table again — the earlier revision recorded only the Tier 1
 * bindings and silently omitted these three, which made the table an incomplete
 * description of the app's own keyboard model.
 *
 * Deliberate modelling decisions (read before adding rows)
 * --------------------------------------------------------
 * 1. Composite controls count once. `pattern-slot` is the segmented PTN A /
 *    PTN B / copy-slot switcher that the Toolbar renders inside one bordered
 *    container; the plan calls the whole thing "槽位".
 * 2. Dropdown / popover *items* are not separate rows (the export menu's five
 *    formats, the quick-tools options, the 10 metre options, ...). The row is
 *    the trigger control; the items are that control's payload.
 * 3. RESOLVED — the three shortcut bindings the plan's Tier 1 list omits
 *    (`drums-only`/D, `project-hub`/P, `console`/C) are recorded here *with*
 *    their real tokens plus `reachableVia: "more"`, and `validateTiers` accepts a
 *    non-Tier-1 shortcut only when it points at a real Tier 1 surface. See
 *    "Why keyboard-shortcut controls must stay reachable" above.
 * 4. `Escape` is a shared dismiss key (console -> project hub -> context menu ->
 *    pitch picker -> euclidean -> velocity lane -> analyzer -> maximize), not the
 *    accelerator of any one control, and `shortcut` is single-valued, so it is
 *    not recorded.
 *
 * Dependency-free on purpose: this module must be importable from any layer
 * (test, store, component) without pulling React or app state into scope.
 * ------------------------------------------------------------------------- */

export type ToolbarTier = 1 | 2 | 3;

export interface ToolbarTierItem {
  /** Stable kebab-case identifier, grounded in what the control does. */
  id: string;
  /** The exact i18n key the Toolbar already passes to `t(...)`. */
  labelKey: string;
  /** A real keyboard binding, grounded in `useTransportShortcuts.ts`. */
  shortcut?: string;
  /**
   * Extra bindings for the same control. `shortcut` is a single token and cannot
   * hold them, but dropping them would make this table an incomplete record of the
   * app's own key model (redo answers to both Cmd/Ctrl+Shift+Z and Cmd/Ctrl+Y).
   */
  shortcutAliases?: readonly string[];
  /**
   * For a shortcut-bearing control that is NOT Tier 1: the id of the Tier 1
   * surface that can reach it (today always `"more"`). Required in that case by
   * `validateTiers`, so a binding can never be recorded without a way to reach it.
   */
  reachableVia?: string;
  tier: ToolbarTier;
  /** The control's real `data-testid`, when the Toolbar renders one. */
  testId?: string;
}

/**
 * Tier 1 — the 12 controls named as the future always-visible row: left side
 * sidebar / play / BPM / slot / bar navigation, right side velocity lane /
 * euclidean / analyzer / undo / redo / maximize / more.
 */
export const TIER_1_PRIMARY: readonly ToolbarTierItem[] = [
  { id: "sidebar-toggle", labelKey: "toolbar_dossier_short", tier: 1 },
  // Space. The hook ignores Space while a button has focus.
  { id: "play", labelKey: "toolbar_play", shortcut: "Space", tier: 1 },
  { id: "bpm", labelKey: "toolbar_bpm_title", tier: 1 },
  // Composite: PTN A + PTN B + copy-slot segmented switcher.
  { id: "pattern-slot", labelKey: "toolbar_pattern_a_title", tier: 1 },
  { id: "bar-nav", labelKey: "toolbar_bar_label", tier: 1 },
  { id: "velocity-lane", labelKey: "toolbar_velocity_label", shortcut: "V", tier: 1 },
  { id: "euclid", labelKey: "toolbar_euclid_label", shortcut: "E", tier: 1 },
  { id: "analyzer", labelKey: "toolbar_analyzer_label", shortcut: "O", tier: 1 },
  // Cmd/Ctrl+Z. On macOS the hook reads `metaKey`; elsewhere `ctrlKey`.
  { id: "undo", labelKey: "toolbar_undo_title", shortcut: "Ctrl/Cmd+Z", tier: 1 },
  // Cmd/Ctrl+Shift+Z primary; the hook also accepts Cmd/Ctrl+Y.
  {
    id: "redo",
    labelKey: "toolbar_redo_title",
    shortcut: "Ctrl/Cmd+Shift+Z",
    shortcutAliases: ["Ctrl/Cmd+Y"],
    tier: 1,
  },
  { id: "maximize", labelKey: "toolbar_fullscreen_enter_label", tier: 1 },
  /**
   * The toolbar's own compact/expand toggle.
   *
   * Tier 1, and the second control this table had simply failed to record (the piano roll was the
   * first). It is the companion of `more`: both are controls *about the toolbar itself* rather than
   * about the music, and hiding the one that lets you compact the toolbar would leave the user with
   * no way to reclaim the space except by knowing a shortcut that does not exist.
   */
  { id: "fold-toggle", labelKey: "toolbar_fold_compact", testId: "toolbar-fold-toggle", tier: 1 },
  // The Toolbar's label for this toggle is "More" (zh: 高级).
  { id: "more", labelKey: "toolbar_advanced_label", tier: 1 },

  /**
   * Export is **primary**, not advanced.
   *
   * It shipped as tier 2, which means "behind the advanced-controls toggle", with a trigger whose label is
   * `hidden lg:inline` and whose tooltip came from the i18n key `export` — which in this app means "MIDI". The
   * result is the report that started this: on a PC and on an iPad nobody could find WAV export, because the
   * only entry point was an unlabelled icon behind a toggle, titled "MIDI". Exporting the master, the stems, a
   * MIDI file and an Ableton set is a primary thing to do with a finished groove.
   */
  { id: "export", labelKey: "toolbar_export_menu", tier: 1 },
];

/** Tier 2 — medium frequency: fold behind an icon group without losing them. */
export const TIER_2: readonly ToolbarTierItem[] = [
  { id: "tap-tempo", labelKey: "toolbar_tap_tempo_title", tier: 2 },
  { id: "metronome", labelKey: "toolbar_metronome_label", tier: 2 },
  { id: "count-in", labelKey: "toolbar_count_in_title", tier: 2 },
  { id: "record-arm", labelKey: "toolbar_record_title", tier: 2 },
  { id: "drum-kit", labelKey: "toolbar_drum_kit_label", tier: 2 },
  // The hook binds D; hidden behind the Tier 1 "more" surface, so the key stays
  // honest without pushing Tier 1 past TIER_1_MAX (see note 3).
  { id: "drums-only", labelKey: "toolbar_drums_only_label", shortcut: "D", reachableVia: "more", tier: 2 },
  { id: "meter", labelKey: "toolbar_meter_label", tier: 2 },
  { id: "grid", labelKey: "toolbar_grid_label", tier: 2 },
  { id: "length", labelKey: "toolbar_length_label", tier: 2 },
  { id: "tool-mode", labelKey: "toolbar_tool_label", tier: 2 },
  { id: "song-mode", labelKey: "toolbar_song_mode_title", tier: 2 },
  /**
   * B3's arrangement view.
   *
   * Tier 2 beside song mode because it is the editor for the same thing that toggle turns on — and because Tier 1
   * is at its cap of 14. It has no keyboard binding of its own, so it needs no `reachableVia`; the host passes its
   * handler only on the desktop/iPad shell, so the phone never renders it at all.
   */
  { id: "arrangement", labelKey: "toolbar_arrangement_title", tier: 2 },
  // The hook binds C to the floating console; reachable from "more" (note 3).
  { id: "console",
    labelKey: "console_float_toggle",
    shortcut: "C",
    reachableVia: "more",
    testId: "studio-console-toggle",
    tier: 2,
  },
  /**
   * The per-track note editor.
   *
   * Tier 2 because it is opened on purpose for one track and closed again, not reached for every
   * few seconds like the velocity drawer beside it. It went unrecorded until the wiring pass: the
   * table claimed to be a complete description of the toolbar, nothing checked that, and this
   * control — rendered, visible, shortcut-free — was simply absent from it. The grounding test now
   * compares the stamped controls against the table in both directions.
   */
  { id: "piano-roll-toggle", labelKey: "roll_toggle", testId: "toolbar-piano-roll-toggle", tier: 2 },
  { id: "keyboard-mode", labelKey: "toolbar_keyboard_label", tier: 2 },
  // The hook binds P to the project hub; reachable from "more" (note 3).
  { id: "project-hub", labelKey: "toolbar_project_hub_title", shortcut: "P", reachableVia: "more", tier: 2 },
  { id: "inspire", labelKey: "toolbar_inspire_label", tier: 2 },
  // The drawer's only high-frequency row (plan C-05 keeps it at the group head).
  { id: "swing", labelKey: "swing", tier: 2 },
];

/** Tier 3 — low frequency: belong in the "more" popover, hidden by default. */
export const TIER_3: readonly ToolbarTierItem[] = [
  { id: "blind-compare", labelKey: "toolbar_blind_label", tier: 3 },
  { id: "quick-tools", labelKey: "toolbar_quick_tools_placeholder", tier: 3 },
  { id: "import-midi", labelKey: "toolbar_import_label", tier: 3 },
  { id: "genre-maker", labelKey: "toolbar_genre_maker_label", tier: 3 },
  { id: "share", labelKey: "share_groove", tier: 3 },
  /**
   * U5: the sequencer is the only screen without a help entry, and it is the one that needs it most.
   *
   * Tier 3 on purpose: help is a session-edge affordance, and the density work (G.10) spent real
   * effort getting the default surface down to 16 controls. It lives in the More menu, which is not
   * rendered until opened, so the density probe stays green either way.
   */
  { id: "sequencer-help", labelKey: "toolbar_help_title", tier: 3 },
  { id: "fine-remove-steps", labelKey: "toolbar_remove_steps", tier: 3 },
  { id: "fine-add-steps", labelKey: "toolbar_add_steps", tier: 3 },
  { id: "fine-add-1-bar", labelKey: "toolbar_add_1_bar", tier: 3 },
  { id: "fine-add-2-bars", labelKey: "toolbar_add_2_bars", tier: 3 },
  { id: "fx-filter-toggle", labelKey: "toolbar_fx_filter", tier: 3 },
  { id: "fx-filter-cutoff", labelKey: "toolbar_fx_filter_cutoff", tier: 3 },
  { id: "fx-filter-type", labelKey: "toolbar_fx_filter_type", tier: 3 },
  { id: "fx-filter-q", labelKey: "toolbar_fx_filter_q", tier: 3 },
  { id: "fx-saturation-toggle", labelKey: "toolbar_fx_saturation", tier: 3 },
  { id: "fx-saturation-drive", labelKey: "toolbar_fx_saturation_drive", tier: 3 },
  { id: "fx-chorus-toggle", labelKey: "toolbar_fx_chorus", tier: 3 },
  { id: "fx-chorus-mix", labelKey: "toolbar_fx_chorus_mix", tier: 3 },
  { id: "fx-chorus-rate", labelKey: "toolbar_fx_chorus_rate", tier: 3 },
  { id: "fx-bitcrusher-toggle", labelKey: "toolbar_fx_bitcrusher", tier: 3 },
  { id: "fx-bit-depth", labelKey: "toolbar_fx_bit_depth", tier: 3 },
  { id: "fx-advanced-toggle", labelKey: "toolbar_fx_advanced", tier: 3 },
  { id: "haptic-toggle", labelKey: "toolbar_haptic_title", tier: 3 },
  { id: "haptic-intensity", labelKey: "toolbar_haptic_intensity", tier: 3 },
  { id: "pan-left", labelKey: "toolbar_scroll_left", tier: 3 },
  { id: "pan-right", labelKey: "toolbar_scroll_right", tier: 3 },
  { id: "drawer-close", labelKey: "toolbar_drawer_close", tier: 3 },
];

/** Every row, in tier order. */
export const ALL_TIER_ITEMS: readonly ToolbarTierItem[] = [
  ...TIER_1_PRIMARY,
  ...TIER_2,
  ...TIER_3,
];

/** Hard cap on always-visible controls; the plan's S1 exit criterion is <= 14. */
export const TIER_1_MAX = 14;

/**
 * Ids that stay visible by default. This is the hand-off point for the later
 * slimming milestone; today it is exactly the Tier 1 ids.
 */
export const DEFAULT_VISIBLE_IDS: readonly string[] = TIER_1_PRIMARY.map((item) => item.id);

/** The tier an id belongs to, or `undefined` for an unknown id. */
export function tierOf(id: string): ToolbarTier | undefined {
  return ALL_TIER_ITEMS.find((item) => item.id === id)?.tier;
}

/**
 * Whether a control is shown at the given density — the one predicate the Toolbar renders through.
 *
 * `showAdvanced` is the existing "advanced" toggle, which the toolbar has had for a while. Wiring
 * the tier table to it is what turns that toggle from a *sound-design* drawer into the density
 * control: Tier 1 stays on screen, Tier 2 and Tier 3 wait behind it.
 *
 * It lives here, beside `tierOf`, so that a control's frequency and its visibility cannot be
 * decided in two places — the failure this table exists to prevent. An id the table does not know
 * returns `false`: an unrecorded control is not something to show by accident, and the grounding
 * test fails on one anyway.
 */
export function isControlVisible(id: string, showAdvanced: boolean): boolean {
  return tierOf(id) === 1 || showAdvanced;
}

/**
 * Every keyboard binding recorded in the table, primary tokens first and then each
 * control's aliases, in table order.
 */
export function shortcutBindings(): string[] {
  return ALL_TIER_ITEMS.flatMap((item) => [
    ...(item.shortcut ? [item.shortcut] : []),
    ...(item.shortcutAliases ?? []),
  ]);
}

/** The key a binding token actually presses: `Ctrl/Cmd+Shift+Z` -> `Z`. */
export function bindingKey(token: string): string {
  const parts = token.split("+");
  return parts[parts.length - 1].trim().toUpperCase();
}

/**
 * Validates a candidate tier table. Returns human-readable violation strings and
 * an empty array when the table is sound, so it is safe to assert
 * `expect(validateTiers(ALL_TIER_ITEMS)).toEqual([])`.
 *
 * Detects, at minimum:
 *   - a duplicate id;
 *   - an empty id or empty labelKey;
 *   - a shortcut on a non-Tier-1 control that does not declare a Tier 1
 *     `reachableVia` surface (the plan's binding invariant, in the form that is
 *     actually satisfiable — see the module header);
 *   - a `reachableVia` that names an unknown id, or one that is not Tier 1;
 *   - a redundant `reachableVia` on a Tier 1 control;
 *   - the same shortcut token bound to more than one control;
 *   - a Tier 1 longer than TIER_1_MAX.
 *
 * It cannot detect an item whose `tier` field disagrees with the array it was
 * passed in as part of — that only exists in the caller's head, so the test
 * suite asserts it separately.
 */
export function validateTiers(items: readonly ToolbarTierItem[]): string[] {
  const violations: string[] = [];
  const firstIdIndex = new Map<string, number>();
  const firstShortcutOwner = new Map<string, string>();
  const allIds = new Set(items.map((item) => item.id));
  const tier1Ids = new Set(items.filter((item) => item.tier === 1).map((item) => item.id));
  let tier1Count = 0;

  items.forEach((item, index) => {
    const where = `item #${index}${item.id ? ` ("${item.id}")` : ""}`;

    if (!item.id || item.id.trim() === "") {
      violations.push(`${where}: empty id`);
    } else if (firstIdIndex.has(item.id)) {
      violations.push(
        `${where}: duplicate id "${item.id}" (first seen at #${firstIdIndex.get(item.id)})`,
      );
    } else {
      firstIdIndex.set(item.id, index);
    }

    if (!item.labelKey || item.labelKey.trim() === "") {
      violations.push(`${where}: empty labelKey`);
    }

    if (item.tier === 1) {
      tier1Count += 1;
      if (item.reachableVia) {
        violations.push(
          `${where}: tier 1 item declares reachableVia "${item.reachableVia}" — it is already visible`,
        );
      }
    } else if (item.reachableVia) {
      if (!allIds.has(item.reachableVia)) {
        violations.push(`${where}: reachableVia "${item.reachableVia}" is not a known control id`);
      } else if (!tier1Ids.has(item.reachableVia)) {
        violations.push(
          `${where}: reachableVia "${item.reachableVia}" is not a tier 1 item, so it cannot keep this control reachable`,
        );
      }
    }

    const tokens = [...(item.shortcut ? [item.shortcut] : []), ...(item.shortcutAliases ?? [])];
    if (tokens.length > 0 && item.tier !== 1 && !item.reachableVia) {
      violations.push(
        `${where}: shortcut "${tokens[0]}" on a tier ${item.tier} item with no reachableVia — a keyboard binding must be visible (tier 1) or reachable from a tier 1 surface`,
      );
    }
    for (const raw of tokens) {
      const token = raw.toLowerCase();
      if (firstShortcutOwner.has(token)) {
        violations.push(
          `${where}: duplicate shortcut "${raw}" (already bound to "${firstShortcutOwner.get(token)}")`,
        );
      } else {
        firstShortcutOwner.set(token, item.id || where);
      }
    }
  });

  if (tier1Count > TIER_1_MAX) {
    violations.push(`tier 1 has ${tier1Count} items, over TIER_1_MAX (${TIER_1_MAX})`);
  }

  return violations;
}
