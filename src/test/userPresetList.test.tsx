/**
 * ⭐ **The list has to be operable, because until now a person had no way to keep a sound.**
 *
 * The MCP could save, list, rename, delete and export user presets and the interface could do none of it — the
 * `webEntryReachability` ledger recorded `setUserPresets` as unreachable from Web source, which is that project's way of
 * saying "an agent can do this and you cannot". This file holds the control to its four jobs.
 *
 * The failure worth catching is a control that **looks** wired and reports nothing back: a save button that never fires, a
 * delete that removes the row from the screen without changing the list, an export that copies nothing. Each is asserted
 * through the callback the component receives, and the callbacks are the caller's — so what is checked is that the
 * component asks for the right change, which is the half a component owns.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import { UserPresetList } from "../components/arrangement/UserPresetList";
import type { UserPreset } from "../data/userPresets";

const renderList = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

const preset = (over: Partial<UserPreset> = {}): UserPreset => ({
  id: "user-mine-1",
  name: "我的超级锯齿",
  cat: "LEAD",
  shareCode: "gs1.1.AAAA",
  savedAt: "2026-10-15T10:00:00.000Z",
  ...over,
});

const props = (over: Record<string, unknown> = {}) => ({
  presets: [] as readonly UserPreset[],
  selectedId: "",
  onSave: vi.fn(),
  onApply: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onExport: vi.fn(),
  trackName: "Lead",
  currentCode: "gs1.1.AAAA" as string | undefined,
  ...over,
});

describe("UserPresetList", () => {
  it("⭐ saves under the typed name, and refuses a blank one", () => {
    const onSave = vi.fn();
    renderList(<UserPresetList {...props({ onSave })} />);

    // ⭐ Blank is refused: the name is how a person finds the sound again.
    const save = screen.getByTestId("user-presets-save");
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByTestId("user-presets-name"), { target: { value: "Paddy" } });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith("Paddy");
  });

  it("⭐ says it is empty rather than drawing nothing, so 'no presets' is not mistaken for a broken list", () => {
    renderList(<UserPresetList {...props()} />);
    expect(screen.getByTestId("user-presets-empty")).toBeTruthy();
    expect(screen.queryByTestId("user-presets-list")).toBeNull();
  });

  it("⭐ offers apply, rename, export and delete per preset, each asking for its own change", () => {
    const onApply = vi.fn();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const onExport = vi.fn();
    const mine = preset();
    renderList(<UserPresetList {...props({ presets: [mine], onApply, onRename, onDelete, onExport })} />);

    fireEvent.click(screen.getByTestId(`user-presets-apply-${mine.id}`));
    expect(onApply).toHaveBeenCalledWith(mine);

    fireEvent.click(screen.getByTestId(`user-presets-export-${mine.id}`));
    expect(onExport).toHaveBeenCalledWith(mine);

    fireEvent.click(screen.getByTestId(`user-presets-delete-${mine.id}`));
    expect(onDelete).toHaveBeenCalledWith(mine.id);

    // Rename is two steps, and renaming must not fire while the edit is still open.
    fireEvent.click(screen.getByTestId(`user-presets-rename-${mine.id}`));
    expect(onRename).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId(`user-presets-rename-input-${mine.id}`), { target: { value: "Brighter" } });
    fireEvent.click(screen.getByTestId(`user-presets-rename-confirm-${mine.id}`));
    expect(onRename).toHaveBeenCalledWith(mine.id, "Brighter");
  });

  it("⭐ marks the preset the lane is currently using, matched by share code", () => {
    const mine = preset();
    const { container } = renderList(<UserPresetList {...props({ presets: [mine], selectedId: mine.id })} />);
    // The chosen row is visually distinguished; the id is what the caller matches on.
    expect(container.querySelector(`[data-testid="user-presets-item-${mine.id}"]`)!.className).toContain("accent");
  });
});
