/**
 * Dialogs, plural.
 *
 * Three defects lived in `Modal`, all of them invisible while only one dialog is ever open — which
 * is how they survived:
 *
 *  1. **Every open dialog listened for Escape.** Each instance attached its own `window` keydown
 *     handler and closed itself on the key, so with two dialogs stacked (help over settings, a
 *     picker over the roll) one Escape closed *both*. The `Tab` trap had the same problem: two
 *     handlers fought over focus, and the user could be pulled out of the dialog they were in.
 *  2. **Every dialog labelled itself with the same id.** `aria-labelledby="modal-title"` was a
 *     literal, so two dialogs produced two elements with that id and a screen reader read whichever
 *     one the DOM happened to resolve first — possibly the dialog underneath.
 *  3. **Focus was re-taken on every re-render.** The focus effect listed `onClose` in its
 *     dependencies, and callers pass inline closures, so the effect re-ran on every parent render:
 *     50 ms later focus jumped back to the first focusable element. Click a second button, or type
 *     in a field, and any state change in the dialog yanked you back.
 *
 * The first two are fixed with an explicit stack and `useId`; the third by keeping the callbacks
 * current in a ref (the pattern `useAudioEngineInstance` uses) so the effect runs once per open.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { Modal } from "../ui/Modal";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Mounts a dialog and lets its deferred focus settle. */
function openModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  const utils = render(
    <Modal isOpen onClose={onClose} title={props.title ?? "Dialog"} {...props}>
      {props.children ?? null}
    </Modal>
  );
  act(() => {
    vi.advanceTimersByTime(60);
  });
  return { ...utils, onClose: onClose as ReturnType<typeof vi.fn> };
}

describe("Modal · two dialogs open at once", () => {
  it("lets only the topmost dialog handle Escape", () => {
    const lowerClose = vi.fn();
    const upperClose = vi.fn();

    render(
      <>
        <Modal isOpen onClose={lowerClose} title="Lower">
          <p>lower</p>
        </Modal>
        <Modal isOpen onClose={upperClose} title="Upper">
          <p>upper</p>
        </Modal>
      </>
    );
    act(() => {
      vi.advanceTimersByTime(60);
    });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(upperClose).toHaveBeenCalledTimes(1);
    expect(lowerClose).not.toHaveBeenCalled();
  });

  it("names each dialog with its own title id", () => {
    render(
      <>
        <Modal isOpen onClose={vi.fn()} title="Lower">
          <p>lower</p>
        </Modal>
        <Modal isOpen onClose={vi.fn()} title="Upper">
          <p>upper</p>
        </Modal>
      </>
    );

    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(2);

    const labelledBy = dialogs.map((d) => d.getAttribute("aria-labelledby"));
    expect(labelledBy[0]).toBeTruthy();
    expect(labelledBy[1]).toBeTruthy();
    // Two dialogs, two distinct labels — a shared literal id is what made the screen reader read the
    // wrong title.
    expect(labelledBy[0]).not.toBe(labelledBy[1]);

    // …and each id really points at that dialog's own heading.
    dialogs.forEach((dialog) => {
      const id = dialog.getAttribute("aria-labelledby")!;
      const heading = document.getElementById(id);
      expect(heading).toBeTruthy();
      expect(dialog.contains(heading)).toBe(true);
    });

    // Only the topmost dialog claims to be modal: `aria-modal="true"` tells assistive tech to ignore
    // everything outside the dialog, which would hide the dialog *on top of it*.
    expect(dialogs[0].getAttribute("aria-modal")).toBe("false");
    expect(dialogs[1].getAttribute("aria-modal")).toBe("true");
  });
});

describe("Modal · focus", () => {
  it("does not steal focus back when the host re-renders", () => {
    // No close button: it is the first focusable in the DOM and would make "the first focusable"
    // ambiguous, which is not what this test is about.
    const view = render(
      <Modal isOpen onClose={() => {}} title="Dialog" showCloseButton={false}>
        <button type="button">first</button>
        <button type="button">second</button>
      </Modal>
    );
    act(() => {
      vi.advanceTimersByTime(60);
    });

    const [first, second] = screen.getAllByRole("button");
    // On open, focus lands on the first focusable element — that part is intended.
    expect(document.activeElement).toBe(first);

    // The user moves to the second one…
    second.focus();
    expect(document.activeElement).toBe(second);

    // …and anything re-renders the host, which hands the dialog a new inline `onClose`.
    view.rerender(
      <Modal isOpen onClose={() => {}} title="Dialog" showCloseButton={false}>
        <button type="button">first</button>
        <button type="button">second</button>
      </Modal>
    );
    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(document.activeElement).toBe(second);
  });

  it("restores focus to the element that was focused before it opened", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "open";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(
      <Modal isOpen onClose={vi.fn()} title="Dialog">
        <button type="button">inside</button>
      </Modal>
    );
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("Modal · single dialog keeps working", () => {
  it("closes on Escape and on a backdrop click", () => {
    const onClose = vi.fn();
    openModal({ onClose, title: "Solo" });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
