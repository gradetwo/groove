/**
 * The ruler's own controls: what they are made of, and what they say.
 *
 * A narrow file, because the defect it guards is narrow and was reported by eye rather than by a
 * test: the ruler's "复制B1" button carried a 📋 **emoji** while everything around it — including the
 * piano roll's control for the *same action* — is a lucide SVG. An emoji is a full-colour platform
 * glyph, so it lands at a different optical weight and baseline from the 8 px monospace label beside
 * it, and it is the only colour in an otherwise uniformly accent-tinted pill. It reads as something
 * pasted in, which is exactly what the report said.
 *
 * Asserting "there is an `<svg>` and no emoji" is the honest form of that complaint: it is checkable,
 * it fails against the old markup, and it does not pin the specific glyph name (a different lucide
 * icon for the same meaning is a design choice, not a regression).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Ruler } from "../components/sequencer/Ruler";

/**
 * Colour emoji, and the variation selector that forces colour presentation.
 *
 * Deliberately *not* a wider "pictograph" range: the ruler and its neighbours use monochrome
 * typographic marks on purpose (`✕` to clear the loop, `→`, `✓`), and those render in the text font
 * at the label's own weight. Flagging them would make this test fight the design instead of the
 * defect, which was specifically a full-colour platform glyph.
 *
 * The variation selector is an alternation rather than a member of the class because a combining
 * character inside a character class is what `no-misleading-character-class` exists to catch — the
 * same lint rule that found this line.
 */
const COLOUR_EMOJI = /\u{1F300}-\u{1FAFF}|\uFE0F/u;

function renderRuler(overrides: Partial<React.ComponentProps<typeof Ruler>> = {}) {
  return render(
    <Ruler
      stepCount={16}
      timeSignature="4/4"
      stepsPerBar={16}
      groupSize={4}
      isRulerDragging={false}
      isZh
      barCount={2}
      onDuplicateBar1={() => {}}
      {...overrides}
    />
  );
}

describe("the ruler draws icons, not emoji", () => {
  it("gives the duplicate-bar control an SVG icon instead of a pictograph", () => {
    const { container } = renderRuler();
    const button = screen.getByTitle(/将第 1 小节快速复制到所有小节/);

    expect(button.querySelector("svg"), "the control must carry a real icon").not.toBeNull();
    expect(
      COLOUR_EMOJI.test(button.textContent ?? ""),
      `colour emoji left in the label: ${JSON.stringify(button.textContent)}`
    ).toBe(false);
    // The visible label is the text alone, so a regression cannot hide behind another glyph.
    expect((button.textContent ?? "").trim()).toBe("复制B1");

    // Nothing else in the ruler should have picked up a colour emoji either.
    expect(COLOUR_EMOJI.test(container.textContent ?? "")).toBe(false);
  });

  it("says the same thing in English", () => {
    renderRuler({ isZh: false });
    const button = screen.getByTitle(/Duplicate Bar 1 to all bars/);
    expect((button.textContent ?? "").trim()).toBe("Dup B1");
  });

  it("renders the control exactly when the action is available", () => {
    /**
     * The gate is the *callback*, not the bar count: `SequencerPanel` decides whether there is
     * anything to copy into and passes `undefined` when there is not (`barCount > 1 ? ... : undefined`).
     * Asserting the boundary here is what keeps the guard above from having made the button
     * unconditional — duplicating bar 1 into itself is not an action worth offering.
     */
    const { unmount } = renderRuler();
    expect(screen.queryByTitle(/将第 1 小节快速复制到所有小节/)).not.toBeNull();
    unmount();

    renderRuler({ onDuplicateBar1: undefined });
    expect(screen.queryByTitle(/将第 1 小节快速复制到所有小节/)).toBeNull();
  });
});
