/**
 * The changelog's `**bold**`, as a pure function.
 *
 * The panel used to print the markers, so every highlight began with a row of asterisks. What matters
 * here is not Markdown correctness but that a malformed entry cannot be swallowed: an unclosed marker or
 * an empty pair has to stay on screen as text, because a changelog that silently drops a sentence is
 * worse than one that shows a stray asterisk.
 */
import { describe, it, expect } from "vitest";
import { splitBoldRuns } from "../utils/markdownLite";

const text = (input: string) => splitBoldRuns(input).map((run) => run.text).join("");
const bold = (input: string) => splitBoldRuns(input).filter((run) => run.bold).map((run) => run.text);

describe("splitBoldRuns", () => {
  it("marks the emphasised run and keeps the rest plain", () => {
    expect(splitBoldRuns("plain **bold** tail")).toEqual([
      { text: "plain ", bold: false },
      { text: "bold", bold: true },
      { text: " tail", bold: false },
    ]);
  });

  it("handles several runs, and a line that is entirely bold", () => {
    expect(bold("**a** then **b**")).toEqual(["a", "b"]);
    expect(splitBoldRuns("**all of it**")).toEqual([{ text: "all of it", bold: true }]);
  });

  it("loses nothing but the markers themselves", () => {
    // The markers are *replaced* by styling, so the runs hold the sentence and not the asterisks…
    expect(text("plain **bold** tail")).toBe("plain bold tail");
    expect(text("**a**b**c**")).toBe("abc");
    // …while a malformed marker is not a marker at all, so those lines survive byte for byte.
    for (const input of ["no markers at all", "trailing **", "**unclosed", "****", "** **", ""]) {
      expect(text(input), input).toBe(input);
    }
  });

  it("keeps a malformed marker visible instead of eating the sentence", () => {
    expect(splitBoldRuns("**unclosed tail")).toEqual([{ text: "**unclosed tail", bold: false }]);
    expect(splitBoldRuns("****")).toEqual([{ text: "****", bold: false }]);
    expect(bold("****")).toEqual([]);
  });

  it("holds up on a real changelog line", () => {
    const line =
      "**The amber is gone.** The ground went cool (#0b0b14) and the text neutral, with **one accent per module**.";
    expect(bold(line)).toEqual(["The amber is gone.", "one accent per module"]);
    expect(text(line)).toBe(line.replace(/\*\*/g, ""));
  });
});
