import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewProjectPanelV2 } from "../components/arrangement/NewProjectPanelV2";
import { TEMPLATES } from "../data/arrangementEdits";

/**
 * The chooser's job: show every template readably, and report **the choice that is on screen** when Create is pressed.
 *
 * What is checked is that the two cannot disagree — a panel where the highlighted card and the created project differ is the kind of bug that gets reported as "it made the wrong thing", with no clue why.
 */
describe("the new-project panel", () => {
  it("shows every template plus blank, and reports the highlighted one", () => {
    const onCreate = vi.fn();
    render(<NewProjectPanelV2 onCreate={onCreate} />);
    // ⭐ Blank is a card like the others: one shape rather than a list plus an exception.
    for (const template of TEMPLATES) expect(screen.getByTestId(`template-${template.id}`)).toBeDefined();
    expect(screen.getByTestId("template-blank")).toBeDefined();

    fireEvent.click(screen.getByTestId("template-samplers"));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // The highlighted card is the one created — not a default that ignored the click.
    expect(onCreate).toHaveBeenCalledWith("samplers", expect.anything());
  });

  it("carries the chosen kind into a blank project, and offers it only there", () => {
    const onCreate = vi.fn();
    render(<NewProjectPanelV2 onCreate={onCreate} />);
    // ⭐ Details folds away what someone is not deciding right now; the kind selector is inside it.
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByLabelText("First track kind")).toBeDefined();
    fireEvent.change(screen.getByLabelText("First track kind"), { target: { value: "sampler" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // A blank project still has a typed track, which is the owner's requirement — and the card promised exactly that.
    expect(onCreate).toHaveBeenCalledWith(undefined, "sampler");
  });

  it("hides the blank-only choice when a template is selected, because templates bring their own tracks", () => {
    render(<NewProjectPanelV2 onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(screen.getByTestId("template-drums-bass"));
    expect(screen.queryByLabelText("First track kind")).toBeNull();
  });
});
