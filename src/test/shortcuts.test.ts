import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
});
