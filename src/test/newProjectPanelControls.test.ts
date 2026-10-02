/**
 * **Every control in the new-project panel reports what it shows.**
 *
 * ## Why this file exists
 *
 * The panel carried a Tempo field and a Key field, and both were `<input … defaultValue=…>` with no `onChange`.
 * Typing in them changed nothing, so a person could believe they had set a project's tempo when the project would
 * be created at the model's own default. That is the shape this repository calls a lying control, and the fix was
 * to remove both — the model has no project-level key to store one in, and the arrangement's tempo is set where it
 * is edited, so neither field could be made honest without inventing something.
 *
 * ## Why the assertion is about `defaultValue` rather than about those two fields
 *
 * Deleting two inputs does not stop the next one. `defaultValue` (and its sibling `defaultChecked`) is the exact
 * mechanism by which an uncontrolled control can be rendered with a plausible-looking value, so the invariant is
 * stated for the whole panel: **no control here may be uncontrolled**, and every `input`/`select` in it must carry
 * an `onChange`. Adding a lying field back — of any kind — turns this red.
 *
 * ## ⚠️ The first version of this file failed on its own explanation
 *
 * The assertions read the whole file including comments, and this header quotes the very tokens they search for —
 * `defaultValue`, `<input … defaultValue=…>`, `onChange` — so a correct component failed three assertions. The
 * lesson is the one this repository keeps arriving at from the other direction: **assertions about what code does
 * must be made against the code, not against the prose around it.** Everything below reads `code`, which is the
 * source with comments removed, and only the last assertion about the explanation reads the comment itself.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PANEL = "src/components/arrangement/NewProjectPanelV2.tsx";
const source = readFileSync(path.join(ROOT, PANEL), "utf8");

/** The source with block, JSX and line comments removed, so assertions read code rather than prose. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every JSX opening tag for a form control, so the assertions read one tag at a time. */
function controlTags(text: string): string[] {
  return text.match(/<(input|select|textarea)\b[\s\S]*?\/?>/g) ?? [];
}

describe("the new-project panel's controls", () => {
  it("renders at least one control, so an empty file cannot pass by having nothing to check", () => {
    expect(controlTags(code).length, "no controls found — the reader would be checking nothing").toBeGreaterThan(0);
  });

  it("has no uncontrolled control: `defaultValue` and `defaultChecked` are the lying-control mechanism", () => {
    expect(code, "defaultValue makes a control look filled without reporting it").not.toContain("defaultValue");
    expect(code, "defaultChecked does the same for a checkbox").not.toContain("defaultChecked");
  });

  it("ties every control to a handler, so what is shown is what is reported", () => {
    for (const tag of controlTags(code)) {
      expect(tag, `a control with no onChange:\n${tag}`).toContain("onChange");
    }
  });

  it("keeps the removal explained where it happened, so it is not silently re-added", () => {
    /**
     * ⚠️ Three ways this assertion was wrong before it was right, all worth keeping because each is a different
     * mistake and only the last one was about the component rather than about me:
     *   1. it asserted "missing control" while the component says "missing one" — a paraphrase is not a quote;
     *   2. it compared against the raw source, where the sentence **wraps**, so the literal substring could not
     *      match — the first fix was to normalise whitespace;
     *   3. and normalising was still not enough, because a wrapped comment carries a **continuation `*`** between
     *      the lines, so the sentence as stored is `… reports nothing is * worse than …`. No amount of whitespace
     *      collapsing removes a character that is really there.
     * So the assertion quotes two fragments that each sit **inside one comment line**. A checkable quote has to be
     * shorter than the line it is quoted from.
     */
    expect(source, "the removal is stated where it happened").toContain(
      "A tempo and a key field were removed here"
    );
    expect(source, "and the rule behind it").toContain("worse than a missing one");
  });
});
