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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

/**
 * ⭐ **Auditioning, which is the only way a list of 120 sounds is usable.**
 *
 * Choosing by name alone is how somebody ends up applying each preset and undoing to compare two. The button is optional on
 * the component — a host with no audio draws none rather than one that does nothing — and the **reason** a preview could not
 * sound is shown rather than swallowed, because a ▷ that silently does nothing is the "looks like it works" control this
 * project refuses.
 */
describe("UserPresetList · audition", () => {
  it("⭐ offers the button only when the host can audition, and asks for that preset", () => {
    const mine = preset();
    // No handler ⇒ no button: a control that cannot act is worse than an absent one.
    renderList(<UserPresetList {...props({ presets: [mine] })} />);
    expect(screen.queryByTestId(`user-presets-audition-${mine.id}`)).toBeNull();

    const onAudition = vi.fn();
    renderList(<UserPresetList {...props({ presets: [mine], onAudition })} />);
    fireEvent.click(screen.getByTestId(`user-presets-audition-${mine.id}`));
    expect(onAudition).toHaveBeenCalledWith(mine);
  });

  it("⚠️ shows why a preview could not sound rather than staying silent", () => {
    const mine = preset();
    renderList(<UserPresetList {...props({ presets: [mine], onAudition: vi.fn(), problem: "not a share code: it must start with \"gs1.1.\"" })} />);
    const shown = screen.getByTestId("user-presets-problem");
    expect(shown.textContent).toMatch(/gs1\.1\./);
  });
});

/**
 * ⭐ **And the yard is actually reachable, which is the half a component test cannot see.**
 *
 * The button's criterion above passes with any handler, including one a test supplies — so it can never notice that the
 * *application* forgot to wire one. That is exactly the shape of the defect this project has already shipped once (the
 * console's timbre picker passed a no-op), so the call site is pinned here: the view builds the yard from the engine's own
 * context and hands the callback down.
 */
describe("the arrangement wires the preview yard", () => {
  it("⭐ builds it from the engine's context and master destination, and disposes it", () => {
    const view = readFileSync(resolve(__dirname, "../components/arrangement/ArrangementViewV2.tsx"), "utf8");
    expect(view, "the yard comes from the engine's own context, so the preview is audible").toContain(
      "engineRef?.current?.audioContext"
    );
    expect(view, "and its master destination, not a lane's").toContain("engineRef?.current?.musicDestination");
    expect(view, "a worklet voice left running is a leak the next preview pays for").toMatch(/yard\.dispose\(\)/);
    expect(view, "no genre re-voicing: a factory preset is a sound, and bladerunner should sound like bladerunner").toContain(
      "genreId: null"
    );
    expect(view, "and the callback reaches the list").toContain("onAudition={onAuditionPreset}");
  });
});
