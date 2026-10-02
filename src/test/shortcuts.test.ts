import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, createEvent } from "@testing-library/react";
import { ShortcutsModal } from "../components/ShortcutsModal";
import { useAppShortcuts } from "../hooks/useAppShortcuts";
import { LanguageProvider } from "../i18n/LanguageContext";

function TestShortcutsComponent({ onNavigateTab }: { onNavigateTab: (tab: any) => void }) {
  const { shortcutsOpen, setShortcutsOpen } = useAppShortcuts({
    onNavigateTab,
    isZh: true,
  });

  return React.createElement(
    "div",
    null,
    React.createElement("button", { onClick: () => setShortcutsOpen(true) }, "Open Shortcuts"),
    React.createElement(ShortcutsModal, {
      isOpen: shortcutsOpen,
      onClose: () => setShortcutsOpen(false),
    })
  );
}

describe("Keyboard Shortcuts & Modal (P2-20)", () => {
  it("renders shortcuts modal when opened and lists key navigation guides", () => {
    const handleNavigate = vi.fn();
    render(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(TestShortcutsComponent, { onNavigateTab: handleNavigate })
      )
    );

    // Initially modal is not open
    expect(screen.queryByText("键盘快捷键指南")).toBeNull();

    // Click open
    fireEvent.click(screen.getByText("Open Shortcuts"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.queryByText("键盘快捷键指南") || screen.queryByText("Keyboard Shortcuts Guide")
    ).toBeTruthy();
    expect(
      screen.queryByText("跳转至 工作台") || screen.queryByText("Go to Studio")
    ).toBeTruthy();
  });

  it("handles ? key to toggle shortcuts modal", () => {
    const handleNavigate = vi.fn();
    render(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(TestShortcutsComponent, { onNavigateTab: handleNavigate })
      )
    );

    // Press '?'
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("dialog")).toBeTruthy();

    // Press '?' again to toggle close
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /**
   * ⭐ **The popup is global; the sequencer's keys are not.**
   *
   * `?` opens this modal on every route, but the keys under "Studio Sequencer Shortcuts" are handled by
   * `useTransportShortcuts`, which only `StudioView` mounts — on `/new` there is no listener and no undo
   * history. The owner opened `?` there and read "Undo pattern change Ctrl+Z" for a route that has no undo, so
   * the list must say only what the current view can keep.
   */
  it("does not advertise the sequencer's keys outside the studio (U: scoped shortcut help)", () => {
    render(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(ShortcutsModal, { isOpen: true, onClose: () => {} })
      )
    );
    // The global rows are still there — they work on every route.
    expect(screen.queryByText("跳转至 工作台") || screen.queryByText("Go to Studio")).toBeTruthy();
    // The sequencer rows are not, and the modal says where they do apply.
    expect(screen.queryByText(/撤销步进修改|Undo pattern change/)).toBeNull();
    expect(screen.queryByText(/重做步进修改|Redo pattern change/)).toBeNull();
    expect(screen.getByTestId("shortcut-studio-scope-note")).toBeTruthy();
  });

  it("shows the sequencer's keys where that listener is mounted, undo and redo included", () => {
    render(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(ShortcutsModal, { isOpen: true, onClose: () => {}, scope: "studio" })
      )
    );
    expect(screen.queryByText(/撤销步进修改|Undo pattern change/)).toBeTruthy();
    expect(screen.queryByText(/重做步进修改|Redo pattern change/)).toBeTruthy();
    expect(screen.queryByTestId("shortcut-studio-scope-note")).toBeNull();
  });

  /**
   * ⭐ **The other half of the same rule, and the row that used to be missing on purpose.**
   *
   * Hiding Ctrl+Z on the arrangement route was correct while that route had no history — it was the "do not lie"
   * half. Now `ArrangementViewV2` mounts a listener and owns a stack, so the reference has to say so, or the modal
   * becomes the opposite defect: silent about a key that works.
   */
  it("⭐ shows the arrangement's undo/redo where that listener is mounted, and nowhere else", () => {
    const { unmount } = render(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(ShortcutsModal, { isOpen: true, onClose: () => {}, scope: "arrangement" })
      )
    );
    // The arrangement's own rows, with the keys its listener really binds. Both redo spellings are printed because
    // both are bound on every platform, so the canonical one is asserted by name and the alias alongside it.
    expect(screen.queryByText(/撤销编排修改|Undo arrangement edit/)).toBeTruthy();
    expect(screen.queryByText(/^重做编排修改$|^Redo arrangement edit$/)).toBeTruthy();
    expect(screen.queryByText(/同义键|\(alias\)/)).toBeTruthy();
    expect(screen.queryByTestId("shortcut-arrangement-scope-note")).toBeNull();
    // And the sequencer's rows are still absent here, because that listener is not mounted on this route either.
    expect(screen.queryByText(/撤销步进修改|Undo pattern change/)).toBeNull();
    expect(screen.getByTestId("shortcut-studio-scope-note")).toBeTruthy();
    unmount();

    // Anywhere else, the arrangement's rows must not be advertised — the invariant is unchanged, only its reach grew.
    render(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(ShortcutsModal, { isOpen: true, onClose: () => {} })
      )
    );
    expect(screen.queryByText(/撤销编排修改|Undo arrangement edit/)).toBeNull();
    expect(screen.getByTestId("shortcut-arrangement-scope-note")).toBeTruthy();
  });

  it("handles g followed by s/c/g/t/v/m/q for fast navigation", () => {
    const handleNavigate = vi.fn();
    render(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(TestShortcutsComponent, { onNavigateTab: handleNavigate })
      )
    );

    // Press 'g' then 's' -> Studio
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "s" });
    expect(handleNavigate).toHaveBeenCalledWith("studio");

    // Press 'g' then 'g' -> Galaxy
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "g" });
    expect(handleNavigate).toHaveBeenCalledWith("galaxy");

    // Press 'g' then 'c' -> Chords
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "c" });
    expect(handleNavigate).toHaveBeenCalledWith("chords");
  });

  it("ignores global shortcuts while a modal dialog is open (U-09)", () => {
    const handleNavigate = vi.fn();
    render(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(
          "div",
          null,
          React.createElement(TestShortcutsComponent, { onNavigateTab: handleNavigate }),
          React.createElement("div", {
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "Some other dialog",
          })
        )
      )
    );

    // 'g' + 's' navigation must not fire behind the dialog
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "s" });
    expect(handleNavigate).not.toHaveBeenCalled();

    // '?' must not open the shortcuts panel behind the dialog
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.queryByText("键盘快捷键指南")).toBeNull();
  });

  it("ignores shortcuts when the event was already handled (U-09)", () => {
    const handleNavigate = vi.fn();
    render(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(TestShortcutsComponent, { onNavigateTab: handleNavigate })
      )
    );

    const handled = createEvent.keyDown(window, { key: "?" });
    handled.preventDefault();
    fireEvent(window, handled);

    expect(screen.queryByText("键盘快捷键指南")).toBeNull();
    expect(handleNavigate).not.toHaveBeenCalled();
  });
});
