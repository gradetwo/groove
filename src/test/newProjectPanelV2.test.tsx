import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewProjectPanelV2 } from "../components/arrangement/NewProjectPanelV2";
import { TEMPLATES } from "../data/arrangementEdits";
import { GENRES_MAP } from "../data/genres";
import { LanguageProvider } from "../i18n/LanguageContext";

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
    // ⭐ And the name is reported with it: it is the one thing the chooser decides that nothing else can supply.
    expect(onCreate).toHaveBeenCalledWith("samplers", expect.anything(), expect.any(String), undefined);
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
    expect(onCreate).toHaveBeenCalledWith(undefined, "sampler", expect.any(String), undefined);
  });

  it("hides the blank-only choice when a template is selected, because templates bring their own tracks", () => {
    render(<NewProjectPanelV2 onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(screen.getByTestId("template-drums-bass"));
    expect(screen.queryByLabelText("First track kind")).toBeNull();
  });

  /**
   * ⭐ **The first track's kind is offered as 合成器, not 乐器.** The old word made a person who wanted a piano choose a
   * fixed built-in synthesiser; the value changed with it, so `instrument` is not among the options at all.
   */
  it("offers Synth as the blank track's kind, and no longer offers the misleading word", () => {
    render(<NewProjectPanelV2 onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    const select = screen.getByLabelText("First track kind") as HTMLSelectElement;
    const labels = [...select.options].map((option) => option.textContent);
    const values = [...select.options].map((option) => option.value);
    expect(labels).toContain("合成器");
    expect(labels).not.toContain("乐器");
    expect(values).toContain("synth");
    expect(values).not.toContain("instrument");
  });

  /**
   * **The card's sentence follows the language toggle.** It did not: the descriptions were an `{en, zh}` pair inside the component and the card rendered `?.en` unconditionally, so a Chinese session read English here while every other surface switched. The assertion
   * is against the dictionary's own value rather than against a sentence written here, so it cannot pass by both sides being hardcoded the same way.
   */
  it("⭐ filters the genre list, and says how many of the library are showing", () => {
    /**
     * ⭐ **The wall this exists for.** 159 chips filled ~420 px of the landing screen, ten rows of names; the filter
     * narrows by name and by id, and the count states the narrowing rather than leaving a person to count chips. The
     * empty query is every genre, which is what the criterion above relies on.
     */
    render(<NewProjectPanelV2 onCreate={vi.fn()} />);
    expect(screen.getByTestId("genre-filter-count").textContent).toContain(String(Object.keys(GENRES_MAP).length));

    fireEvent.change(screen.getByTestId("genre-filter"), { target: { value: "chicago" } });
    expect(screen.getByTestId("genre-chicago-house")).toBeDefined();
    expect(screen.queryByTestId("genre-deep-house")).toBeNull();
    // ⭐ The count says the list narrowed, without pinning how many genres happen to contain "chicago".
    expect(screen.getByTestId("genre-filter-count").textContent?.startsWith(`${Object.keys(GENRES_MAP).length} /`)).toBe(false);

    // Ids are searched too: "dnb" is how a person names drum & bass, and it appears in no display name.
    fireEvent.change(screen.getByTestId("genre-filter"), { target: { value: "dnb" } });
    expect(screen.queryByTestId("genre-chicago-house")).toBeNull();
    expect(screen.getByTestId("genre-filter-count").textContent).not.toContain("0 /");
  });

  it("⭐ offers a genre, so a project can start from the music rather than only from a template", () => {
    const onCreate = vi.fn();
    render(<NewProjectPanelV2 onCreate={onCreate} />);
    // ⭐ The older studio leads with a genre, and this route must not lose that ability. The panel names the genres it can
    // start from, and the chosen one travels with the choice the person makes.
    const [first, second] = Object.values(GENRES_MAP);
    for (const genre of [first, second]) {
      expect(screen.getByTestId(`genre-${genre.id}`)).toBeDefined();
    }
    fireEvent.click(screen.getByTestId(`genre-${first.id}`));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    // ⭐ Read the reported genre directly: a matcher that accepts anything would also accept the wrong id.
    expect(onCreate.mock.calls.at(-1)?.[3]).toBe(first.id);
  });

  it("reads its sentence from the dictionary, in whichever language is on", () => {
    window.localStorage.setItem("groove_language", "zh");
    render(
      <LanguageProvider>
        <NewProjectPanelV2 onCreate={vi.fn()} />
      </LanguageProvider>
    );
    const card = screen.getByTestId("template-samplers");
    // The dictionary's own Chinese rendering, as a literal — the same convention the surrounding tests use.
    expect(card.textContent).toContain("两条采样器轨道");
    // And the English sentence is different, so the assertion above is about the language rather than about some text existing.
    expect(card.textContent).not.toContain("Two sampler tracks");
    window.localStorage.removeItem("groove_language");
  });
});

/**
 * ⭐ **The field that did not exist.**
 *
 * The owner's finding was measured, not guessed: the chooser's `input/select/textarea` count was **0**, so a project
 * started here could not be named at all — nothing to show in the top bar, nothing to find it by. These criteria judge
 * the three things a name field has to do: exist, arrive filled in, and go where the caller can store it.
 */
/**
 * ⭐ **The field that did not exist.**
 *
 * The owner's finding was measured, not guessed: the chooser's `input/select/textarea` count was **0**, so a project
 * started here could not be named at all — nothing to show in the top bar, nothing to find it by. These criteria judge
 * the three things a name field has to do: exist, arrive filled in, and go where the caller can store it.
 *
 * ⚠️ They render inside a `LanguageProvider` because the field's **accessible name is a dictionary word**, which is
 * the point of it being one: a criterion that addressed it by a hardcoded string would pass while the Chinese session
 * showed English, which is the defect this file's own last case is about.
 */
const renderNamed = (onCreate: (templateId: string | undefined, blankKind: string, name: string) => void) => {
  localStorage.setItem("groove_language", "en");
  return render(
    <LanguageProvider>
      <NewProjectPanelV2 onCreate={onCreate as never} />
    </LanguageProvider>
  );
};

describe("the project name", () => {
  it("⭐ is on the chooser, not folded into Details, because it is not a detail", () => {
    renderNamed(vi.fn());
    // Nothing was clicked first: the field is visible the moment the panel is.
    expect(screen.getByLabelText("Project name")).toBeDefined();
    expect(screen.getByPlaceholderText("Enter project name...")).toBeDefined();
  });

  it("⭐ starts filled in, so Create is never a press that does nothing", () => {
    const onCreate = vi.fn();
    renderNamed(onCreate);
    const field = screen.getByLabelText("Project name") as HTMLInputElement;
    expect(field.value.trim().length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate).toHaveBeenCalledWith(undefined, expect.anything(), field.value, undefined);
  });

  it("⭐ follows the card, and a name the person typed is never put back", () => {
    const onCreate = vi.fn();
    renderNamed(onCreate);
    const field = screen.getByLabelText("Project name") as HTMLInputElement;
    const blankDefault = field.value;

    // Untouched, the name follows the card: someone who picks Samplers is naming a samplers project, not "Untitled".
    fireEvent.click(screen.getByTestId("template-samplers"));
    const samplersDefault = field.value;
    expect(samplersDefault).not.toBe(blankDefault);

    // ⭐ Once typed, the card must not overwrite it — that is the line between "filled in for you" and "put back".
    fireEvent.change(field, { target: { value: "My Tune" } });
    fireEvent.click(screen.getByTestId("template-drums-bass"));
    expect(field.value).toBe("My Tune");

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate).toHaveBeenCalledWith("drums-bass", expect.anything(), "My Tune", undefined);
  });

  it("falls back to the dictionary's default rather than creating an unnamed project from an emptied field", () => {
    localStorage.setItem("groove_language", "zh");
    const onCreate = vi.fn();
    render(
      <LanguageProvider>
        <NewProjectPanelV2 onCreate={onCreate} />
      </LanguageProvider>
    );
    // Read from the dictionary, not asserted as an English literal: the fallback has to be a word in the session's own
    // language, and a name nobody can read in a list is barely better than no name.
    fireEvent.change(screen.getByLabelText("工程名"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate).toHaveBeenCalledWith(undefined, expect.anything(), "未命名工程", undefined);
  });
});
