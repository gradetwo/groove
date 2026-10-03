import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { AudioStartGate } from "../components/AudioStartGate";

/**
 * ⭐ **G9 — the first screen everyone sees: two languages, and the three modal rules it was missing.**
 *
 * The census (`/var/tmp/gaps-work/WEB_FEATURE_GAPS.md`, G9) measured this on the real product:
 *
 *   · `01-boot.png` is an **English** interface — "Studio / New / Chords / Kick Design / Explore / Compare /
 *     Challenge" — under a button that says **"启动音频引擎"**, because `AudioStartGate.tsx` had no
 *     `useLanguage` and no `t()` call at all (regex: `null`), leaving four hard-coded Chinese literals at
 *     `:127` (the dialog's `aria-label`), `:151`, `:155` and `:164`;
 *   · `probe8.mjs` pressed Escape and read `[gate] after Escape, still present: 1` — the gate could only be
 *     left by clicking it;
 *   · nothing in the file focused anything, so a keyboard or screen-reader user landed outside the dialog.
 *
 * That is a violation of three literal requirements of the W3C ARIA APG Dialog (Modal) Pattern:
 * *"When a dialog opens, focus moves to an element inside the dialog."*, *"Escape: Closes the dialog."*, and
 * *"The dialog container element has `aria-modal` set to `true`."* — and of WCAG 2.1.1 Keyboard, which asks
 * that all functionality be operable from the keyboard.
 *
 * ⚠️ **The gate itself is right and is not what this file argues against.** Chrome's autoplay policy needs a
 * user gesture before `AudioContext.resume()` (the census quotes it verbatim), so the door stays. What was
 * missing is the localisation and the keyboard contract. Nothing here asks for the gate to be removable by a
 * route or a query parameter.
 *
 * The criteria are written so that **removing the fix turns them red**, which is how this round verified them:
 * the same file was run against the unfixed component first (three failures: Han text in the English build, a
 * gate that survives Escape, and focus left on `document.body`) and against the fixed one afterwards.
 */

/** Any CJK ideograph. A property escape, so neither an en dash nor a punctuation mark can satisfy it. */
const HAN = /\p{Script=Han}/u;

function renderGate(language: "en" | "zh", onStart = vi.fn().mockResolvedValue(undefined)) {
  // `getInitialLanguage()` reads this, which is the same path the app itself uses.
  localStorage.setItem("groove_language", language);
  const view = render(
    <LanguageProvider>
      <AudioStartGate onStart={onStart}>
        <div data-testid="app">app</div>
      </AudioStartGate>
    </LanguageProvider>
  );
  return { onStart, ...view };
}

describe("G9 · the audio start gate speaks the interface's language", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("⭐ the button and the dialog's own name differ between English and Chinese", () => {
    const englishView = renderGate("en");
    const english = screen.getByTestId("audio-start-button").textContent ?? "";
    const englishLabel = screen.getByTestId("audio-start-gate").getAttribute("aria-label") ?? "";

    // The defect was a literal, so the criterion is about the literal: an English build may not contain one.
    expect(english, `the English build's button still reads "${english}"`).not.toMatch(HAN);
    expect(englishLabel, `the English build's dialog label still reads "${englishLabel}"`).not.toMatch(HAN);
    expect(english.trim().length, "the button has no text at all").toBeGreaterThan(0);

    // Unmounted rather than left mounted, so the second reading is a fresh mount and not a second match.
    englishView.unmount();
    renderGate("zh");
    const chinese = screen.getByTestId("audio-start-button").textContent ?? "";

    expect(chinese, "the Chinese build's button is not in Chinese").toMatch(HAN);
    expect(chinese, `both languages render the same button text ("${chinese}")`).not.toBe(english);
  });

  it("⭐ Escape closes the dialog, and does not start the engine on the way out", () => {
    const { onStart } = renderGate("en");
    expect(screen.getByTestId("audio-start-gate")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    // "Escape: Closes the dialog." — measured before the fix as `after Escape, still present: 1`.
    expect(screen.queryByTestId("audio-start-gate"), "the gate survived Escape").toBeNull();
    // Closing is a dismissal, not a start: the one thing the gate exists to get is a real gesture.
    expect(onStart, "Escape must not count as the gesture the gate is asking for").not.toHaveBeenCalled();
    // And the app underneath was mounted the whole time, so a dismissal is never a blank screen.
    expect(screen.getByTestId("app")).toBeTruthy();
  });

  it("⭐ focus moves to an element inside the dialog when it opens", () => {
    renderGate("en");
    const button = screen.getByTestId("audio-start-button");
    // "When a dialog opens, focus moves to an element inside the dialog."
    expect(document.activeElement, "focus did not move into the gate").toBe(button);
    // And the gate contains the focused element, not merely an element that happens to be focused.
    expect(screen.getByTestId("audio-start-gate").contains(document.activeElement)).toBe(true);
  });

  it("declares itself modal, which is what tells assistive technology to stay inside it", () => {
    renderGate("en");
    const gate = screen.getByTestId("audio-start-gate");
    expect(gate.getAttribute("role")).toBe("dialog");
    expect(gate.getAttribute("aria-modal"), "the dialog container has no aria-modal").toBe("true");
    // APG: "the dialog has either ... a label specified by aria-label" — and it must not be empty.
    expect((gate.getAttribute("aria-label") ?? "").trim().length).toBeGreaterThan(0);
  });

  it("keeps the failure path translated too, so the reason is readable in either language", async () => {
    const onStart = vi.fn().mockRejectedValue(new Error("no audio here"));
    renderGate("en", onStart);
    fireEvent.click(screen.getByTestId("audio-start-button"));

    await waitFor(() => expect(screen.getByTestId("audio-start-error")).toBeTruthy());
    expect(screen.getByTestId("audio-start-error").textContent ?? "").not.toMatch(HAN);
    expect(screen.getByTestId("audio-start-retry").textContent ?? "").not.toMatch(HAN);
  });
});
