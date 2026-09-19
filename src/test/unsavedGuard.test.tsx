/**
 * Unsaved-changes guard (item ⑧).
 *
 * The reported scenario: edit a pattern, click another genre, and the work is gone with no
 * question. `SET_GENRE` replaces both pattern slots, so the loss is total. These tests pin the
 * three things that make the guard trustworthy:
 *
 *  1. **No false positives.** A freshly loaded genre must never look edited, or the prompt becomes
 *     noise the user learns to click through — checked against the whole catalog, not one genre.
 *  2. **No false negatives.** A single changed step, in either slot, must be detected.
 *  3. **The answer is honoured.** Canceled → the action does not run; discarded → it does; saved →
 *     it runs only after the save succeeds, and a failed save keeps the edits.
 */
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  canonicalPattern,
  isPatternDirty,
  loadUnsavedPromptPrefs,
  patternsEqual,
  saveUnsavedPromptPrefs,
  UNSAVED_PROMPT_KEY,
} from "../features/sequencer/unsavedGuard";
import { useUnsavedGuard } from "../features/sequencer/hooks/useUnsavedGuard";
import { UnsavedChangesDialog } from "../components/sequencer/UnsavedChangesDialog";
import { ALL_GENRES } from "../data/genres";
import { patternFromGenre } from "../data/genreMix";
import type { Genre, SequencerPattern } from "../types/genre";

const genres = ALL_GENRES as unknown as Genre[];
const genre = genres[0];

const clone = (p: SequencerPattern): SequencerPattern => JSON.parse(JSON.stringify(p));

describe("unsaved guard · dirty detection", () => {
  it("never calls a freshly loaded genre edited (all 159 of them)", () => {
    const falsePositives: string[] = [];
    for (const g of genres) {
      const fresh = patternFromGenre(g);
      if (isPatternDirty({ A: fresh, B: fresh }, g)) falsePositives.push(g.id);
    }
    // A prompt that fires when nothing was edited is worse than no prompt: it trains the user to
    // dismiss it, which is how the real edit gets discarded.
    expect(falsePositives, `false positives: ${falsePositives.slice(0, 5).join(", ")}`).toEqual([]);
  });

  it("detects one edited step in either slot", () => {
    const clean = patternFromGenre(genre);
    const edited = clone(clean);
    edited.tracks[0].steps[1] = edited.tracks[0].steps[1] > 0 ? 0 : 1;

    expect(isPatternDirty({ A: edited, B: clean }, genre)).toBe(true);
    // SET_GENRE overwrites B too, so an edit parked in the inactive slot is just as lost.
    expect(isPatternDirty({ A: clean, B: edited }, genre)).toBe(true);
  });

  it("counts a newly materialised field as an edit, but not a reordering of the same data", () => {
    const clean = patternFromGenre(genre);
    const withGate = clone(clean);
    // A *differing* gate array counts as an edit. It must differ from what the genre produced —
    // this used to write a flat 0.8 and rely on the authored pattern not having one, which stopped
    // being true once the genre's phrase rules started writing gates for every step.
    withGate.tracks[0].gate = withGate.tracks[0].steps.map((_, i) =>
      clean.tracks[0].gate?.[i] === 1.5 ? 1.4 : 1.5
    );
    expect(isPatternDirty({ A: withGate, B: clean }, genre)).toBe(true);

    // Same content, different key insertion order: must NOT look dirty. (Rebuild every object
    // with its keys reversed — dropping a field would change the data and prove nothing.)
    const reordered = Object.fromEntries(Object.entries(clean).reverse()) as unknown as SequencerPattern;
    reordered.tracks = clean.tracks.map(
      (track) => Object.fromEntries(Object.entries(track).reverse()) as typeof track
    );
    expect(patternsEqual(reordered, clean)).toBe(true);
    expect(canonicalPattern(reordered)).toEqual(canonicalPattern(clean));
  });

  it("treats a missing genre as clean rather than prompting about nothing", () => {
    const clean = patternFromGenre(genre);
    expect(isPatternDirty({ A: clean, B: clean }, null)).toBe(false);
    expect(isPatternDirty({ A: null, B: null }, genre)).toBe(true); // nothing loaded = will be replaced
  });
});

describe("unsaved guard · the ask-once preference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("asks by default and only stays quiet when the user opted out", () => {
    expect(loadUnsavedPromptPrefs().suppress).toBe(false);
    saveUnsavedPromptPrefs({ version: 1, suppress: true });
    expect(loadUnsavedPromptPrefs().suppress).toBe(true);
    expect(JSON.parse(localStorage.getItem(UNSAVED_PROMPT_KEY) ?? "{}").version).toBe(1);
  });

  it("falls back to asking when the payload is corrupt or of an unknown version", () => {
    // Asking again costs the user nothing; silently skipping the question can cost the work.
    localStorage.setItem(UNSAVED_PROMPT_KEY, "not json");
    expect(loadUnsavedPromptPrefs().suppress).toBe(false);
    localStorage.setItem(UNSAVED_PROMPT_KEY, JSON.stringify({ version: 99, suppress: true }));
    expect(loadUnsavedPromptPrefs().suppress).toBe(false);
  });
});

/** Harness: a component that owns the guard and mirrors what StudioView does with it. */
function GuardHarness({
  dirty,
  onSave,
}: {
  dirty: boolean;
  onSave: () => Promise<boolean>;
}) {
  const [ran, setRan] = React.useState(0);
  const guard = useUnsavedGuard({ isDirty: () => dirty, onSave });
  return (
    <div>
      <button
        data-testid="trigger"
        onClick={() => guard.request("切换到 House", () => setRan((n) => n + 1))}
      >
        go
      </button>
      <div data-testid="ran">{ran}</div>
      <UnsavedChangesDialog
        isOpen={guard.pending !== null}
        actionLabel={guard.pending?.label ?? ""}
        onDecide={guard.decide}
      />
    </div>
  );
}

describe("unsaved guard · decisions", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("runs the action straight away when nothing was edited", () => {
    render(<GuardHarness dirty={false} onSave={async () => true} />);
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.queryByTestId("unsaved-changes-dialog")).toBeNull();
    expect(screen.getByTestId("ran")).toHaveTextContent("1");
  });

  it("asks first when there are edits, and cancel keeps them", async () => {
    render(<GuardHarness dirty onSave={async () => true} />);
    fireEvent.click(screen.getByTestId("trigger"));

    expect(screen.getByTestId("unsaved-changes-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("unsaved-message")).toHaveTextContent("切换到 House");
    expect(screen.getByTestId("ran")).toHaveTextContent("0");

    await act(async () => {
      fireEvent.click(screen.getByTestId("unsaved-cancel"));
    });
    expect(screen.getByTestId("ran")).toHaveTextContent("0");
    expect(screen.queryByTestId("unsaved-changes-dialog")).toBeNull();
  });

  it("discards and proceeds when asked to", async () => {
    render(<GuardHarness dirty onSave={async () => true} />);
    fireEvent.click(screen.getByTestId("trigger"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("unsaved-discard"));
    });
    expect(screen.getByTestId("ran")).toHaveTextContent("1");
  });

  it("proceeds only after a successful save, and keeps the edits when saving fails", async () => {
    const onSave = vi.fn(async () => false);
    render(<GuardHarness dirty onSave={onSave} />);
    fireEvent.click(screen.getByTestId("trigger"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("unsaved-save"));
    });
    // A failed save must not lead to the destructive action — that is the whole point.
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("ran")).toHaveTextContent("0");

    onSave.mockResolvedValue(true);
    fireEvent.click(screen.getByTestId("trigger"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("unsaved-save"));
    });
    expect(screen.getByTestId("ran")).toHaveTextContent("1");
  });

  it("stops asking once 'do not ask again' is ticked, and remembers it", async () => {
    render(<GuardHarness dirty onSave={async () => true} />);
    fireEvent.click(screen.getByTestId("trigger"));
    fireEvent.click(screen.getByTestId("unsaved-dont-ask"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("unsaved-discard"));
    });
    expect(loadUnsavedPromptPrefs().suppress).toBe(true);

    // The next destructive action goes straight through, with no dialog.
    fireEvent.click(screen.getByTestId("trigger"));
    expect(screen.queryByTestId("unsaved-changes-dialog")).toBeNull();
    expect(screen.getByTestId("ran")).toHaveTextContent("2");
  });
});
