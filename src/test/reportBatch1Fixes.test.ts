import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **Three findings from the independent evaluation, held by a scanner rather than by memory.**
 *
 * Each was measured before it was changed, and each fix is one role lookup rather than a new colour:
 *
 *   · **S1 — the audio gate's button.** `color: #231703` under a hard-coded gold gradient measured **1.15:1** on four
 *     skins, because a skin that flattens or recolours the plate (the pixel sheet flattens gradients on purpose) leaves
 *     dark ink on a dark plate. The plate and the ink are now `--d-accent` / `--d-on-accent`, the pair every skin
 *     already declares.
 *   · **S2 — the roll's non-octave pitch labels.** `text-text opacity-50` measured **2.35:1** on the paper skins: half
 *     transparent black ink becomes mid grey, and at 9px it washes out. `text-text-sub` is the role for "quieter than
 *     body text", defined per skin against its own paper.
 *   · **S8 — the chord keyboard's lit keys.** The plate took `--d-accent` while the label kept a muted grey chosen for
 *     the *unlit* key, measuring between 1.02:1 and 1.83:1 on four skins. Both now come from the accent pair.
 *
 * A scanner is the right instrument here for the reason `readabilityAudit` gives: the failure is invisible until you
 * switch skins, and this fails on the line that reintroduces it.
 */
/**
 * ⭐ **Comments are stripped before scanning**, so a note that *describes* the colour it removed cannot fail the check
 * that the colour is gone — which is exactly how this test first went red on its own explanation.
 */
const source = (path: string) =>
  readFileSync(resolve(__dirname, "..", path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

describe("the first batch of evaluation findings", () => {
  it("⭐ S1 — the gate button takes its plate and ink from the skin", () => {
    const css = source("index.css");
    const rule = css.slice(css.indexOf(".gate-btn {"), css.indexOf(".gate-btn::after"));
    expect(rule, "the plate is the skin's accent").toContain("var(--d-accent)");
    expect(rule, "the ink is the skin's readable-on-accent").toContain("var(--d-on-accent");
    expect(rule, "the hard-coded ink that measured 1.15:1 is gone").not.toContain("#231703");
    expect(rule, "the hard-coded gold gradient is gone").not.toContain("linear-gradient");
  });

  it("⭐ S2 — a dimmer token, not half-transparent ink, for the roll's quiet pitch labels", () => {
    const roll = source("components/arrangement/PianoRollV2.tsx");
    expect(roll, "half-transparent ink measured 2.35:1 on the paper skins").not.toContain('"text-text opacity-50"');
    expect(roll).toContain('"text-text-sub"');
  });

  it("⭐ S8 — a lit key's label uses the on-accent role", () => {
    const keyboard = source("components/chords/PianoKeyboardVisualizer.tsx");
    expect(keyboard, "the lit plate and its ink are one pair").toContain("var(--d-on-accent)");
    expect(keyboard, "the fixed grey that vanished into the highlight is gone").not.toContain('"bg-[#e2dfd5] text-zinc-600"');
    expect(keyboard, "the fixed teal plate is gone").not.toContain('"bg-[#4ad8c8]');
  });

  it("⭐ S4 — the pixel skin's 2px hairlines spare the grid's own cells", () => {
    /**
     * The evaluation measured a 12×16 px cell losing 4 px of width to the skin's forced 2px borders — about 28 % of its
     * hit area — so sixteen-step entry became aiming. The exclusion is keyed on `[data-note]`, which the roll's cells
     * and notes already carry; deleting the `:not(...)` turns this red.
     */
    const sheet = source("styles/skin-pixel.css");
    expect(sheet, "the bottom hairline spares the grid").toMatch(/\.border-b:not\(\[data-note\]\)/);
    expect(sheet, "and so does the right one").toMatch(/\.border-r:not\(\[data-note\]\)/);
  });


  it("⭐ S7 — the pixel skin never asks a pixel face for a fractional or sub-8px size", () => {
    /**
     * The face is drawn on an 8px grid with smoothing off, so a fractional size splits a stroke across a sub-pixel —
     * the broken letterforms the evaluation photographed in the small caps. The sheet had a 9.5px rule; this fails if
     * one comes back, or if anything shrinks below the face's own size.
     */
    const sheet = source("styles/skin-pixel.css");
    const sizes = [...sheet.matchAll(/font-size:\s*([0-9.]+)px/g)].map((match) => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter((size) => !Number.isInteger(size)), "no fractional pixel sizes").toEqual([]);
    expect(sizes.filter((size) => size < 8), "nothing below the face's own 8px").toEqual([]);
  });

});