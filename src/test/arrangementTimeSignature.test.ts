/**
 * ⭐ **The time signature could not be set from the interface, and the reason it is not just "add a dropdown" is the
 * exception.**
 *
 * `setArrangementTimeSignature` is the one setter in its family that **throws** instead of clamping, and the model says why:
 * `"4/5"` or `"waltz"` clamped to `"4/4"` would leave a caller believing a 7/8 arrangement had been written when a 4/4 one
 * had, and "an assumption must not look like a reading". That is right — and it collides with the undo stack, because
 * `ArrangementCommand.undo`/`.redo` must be **total functions over any arrangement**: a command that throws when replayed
 * breaks undo for every entry above it.
 *
 * So the command validates *before* it becomes a command and returns `undefined` for a value the model refuses. The
 * failures worth catching:
 *
 *   - **a command for an illegal value** — it would sit on the stack and throw later, far from the press that caused it;
 *   - **a clamp hidden in the command** — the undo stack would then hold a *different* signature than the one asked for,
 *     which is the same lie the throw exists to prevent;
 *   - **a control offering a value the model refuses** — the dropdown lists the signatures a person writes, and this pins
 *     that every one of them is actually legal.
 */
import { describe, it, expect } from "vitest";
import { setArrangementTimeSignatureCommand } from "../data/arrangementHistory";
import { setArrangementTimeSignature, createArrangement } from "../data/arrangementEdits";
import { beatsPerBar, stepsPerBarFor } from "../data/noteEvents";

const arrangement = () => createArrangement("t1");

describe("setArrangementTimeSignatureCommand", () => {
  it("⭐ applies and undoes a legal signature, so a change is one undo step", () => {
    const command = setArrangementTimeSignatureCommand("4/4", "7/8");
    expect(command, "a legal value becomes a command").toBeDefined();
    const changed = command!.redo(arrangement());
    expect(changed.timeSignature).toBe("7/8");
    expect(command!.undo(changed).timeSignature, "undo returns to what it was").toBe("4/4");
  });

  it("⭐ refuses an illegal value by returning nothing, rather than putting a thrower on the undo stack", () => {
    // The model's own refusal, reachable through the command instead of deferred to a later undo.
    // ⚠️ `"4/5"` is deliberately **not** in this list: the model asks for two positive numbers, so `4/5` is legal to it
    // and the control only offers musically usual ones. Misspelling the model's rule here would have made this case pass
    // for the wrong reason.
    for (const bad of ["waltz", "", "4", "4/0", "4/-4"]) {
      expect(setArrangementTimeSignatureCommand("4/4", bad), `"${bad}" is not a signature`).toBeUndefined();
    }
    // And the model still throws, which is the behaviour the command exists to keep off the stack.
    expect(() => setArrangementTimeSignature(arrangement(), "waltz")).toThrow(/not a time signature/);
  });

  it("⚠️ does not clamp, because a clamped undo value is the lie the throw prevents", () => {
    // If the command clamped, this would produce a command whose `after` is "4/4" — a different value than was asked for.
    expect(setArrangementTimeSignatureCommand("4/4", "9/8")).toBeDefined();
    const command = setArrangementTimeSignatureCommand("4/4", "9/8")!;
    expect(command.redo(arrangement()).timeSignature).toBe("9/8");
  });

  it("⭐ normalises spacing once, so two spellings cannot become two undo values", () => {
    const command = setArrangementTimeSignatureCommand("4/4", " 6 / 8 ")!;
    expect(command.redo(arrangement()).timeSignature, "stored as n/d with no spaces").toBe("6/8");
  });

  it("⭐ and every signature the control offers is one the model accepts", () => {
    /**
     * ⭐ The list is the control's, duplicated here on purpose: the control must not be able to produce a value the model
     * refuses, and this fails the moment one is added without the model agreeing.
     */
    const offered = ["4/4", "3/4", "5/4", "6/8", "7/8", "12/8"];
    for (const signature of offered) {
      expect(setArrangementTimeSignatureCommand("4/4", signature), `${signature} is legal`).toBeDefined();
    }
    // And the grid those signatures produce, since a signature that does not change the bar length is not a signature.
    expect(stepsPerBarFor("4/4"), "four quarters").toBe(16);
    expect(stepsPerBarFor("3/4"), "three quarters").toBe(12);
    expect(stepsPerBarFor("6/8"), "six eighths is three quarters' worth of steps, not six").toBe(12);
    expect(stepsPerBarFor("7/8"), "seven eighths").toBe(14);
    expect(beatsPerBar(undefined), "an arrangement that never said means 4/4").toBe(4);
  });
});
