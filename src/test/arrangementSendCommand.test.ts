/**
 * ⭐ **The console's send knobs, reaching the field a render reads.**
 *
 * `setTrackSends` was the last Web-reachability entry and the only one whose ledger asked for a *ruling* rather than
 * admitting a gap: the console's knobs write the sequencer store's `pattern.tracks[idx].sendA`, while this operation writes
 * `TrackV2.sendA`. The ruling is recorded on the entry and it is made on evidence, not preference —
 * `arrangementCompile` copies `TrackV2.sendA` into the lane's `sendAByStep`, and `AudioEngine` ramps the strip's send gain
 * from the state it is handed — so **a render hears the arrangement's value**, and the arrangement owns the decision.
 *
 * This file holds the half that is model-side and testable: the undoable command the console will need. ⚠️ The wiring
 * itself (the console reaching the arrangement) is **not** done — see `docs/OPEN_WORK.md` §412-8 — and the ledger entry says
 * so rather than pretending otherwise.
 *
 * The property worth pinning is the one that differs from the time signature and the tempo map: `setTrackSends` **clamps**
 * rather than validating, so a command can never be refused and needs no `undefined` return. Getting that wrong would mean
 * a caller guarding a case that cannot happen — or, worse, a send silently dropped because the guard was copied from
 * a sibling that does refuse.
 */
import { describe, it, expect } from "vitest";
import { setTrackSendsCommand } from "../data/arrangementHistory";
import { createArrangement } from "../data/arrangementEdits";

/**
 * ⚠️ **One arrangement per case, not one per call.** `createArrangement` mints a **fresh track id on every call**
 * (`synth-2`, `synth-5`, …), so a test that asked for a new arrangement each time would hand the command an id the
 * arrangement does not contain — and the setter would match no track and change nothing, which reads exactly like a broken
 * command. That mistake is why this comment exists.
 */
const arrangement = () => createArrangement("s1");
const sendsOf = (a: ReturnType<typeof arrangement>) => ({ sendA: a.tracks[0]!.sendA, sendB: a.tracks[0]!.sendB });

describe("setTrackSendsCommand", () => {
  it("⭐ writes a send and undoes it, so a knob move is one step", () => {
    const base = arrangement();
    const before = sendsOf(base);
    const after = { ...before, sendA: 0.5 };
    const command = setTrackSendsCommand(base.tracks[0]!.id, before, after);
    const changed = command.redo(base);
    expect(changed.tracks[0]!.sendA).toBe(0.5);
    /**
     * ⚠️ **`setTrackSends` merges, so an `undefined` in the before-pair does not clear a field** — it means "leave this one
     * alone", which is what makes one knob unable to move the other. An undo whose target was unset therefore restores the
     * *other* send and leaves this one where the edit put it. That is the model's stated semantics rather than a defect,
     * and pinning it as `toEqual(before)` was my mistake: the honest assertion is about the explicit target.
     */
    const restored = command.undo(changed);
    // The target was `undefined`, and `undefined` means "leave this one alone" — so it stays where the edit put it. Stated
    // rather than asserted away: this is the documented merge semantics, and it is why the console must commit both sends.
    expect(sendsOf(restored).sendA, "an unset target cannot be restored by a merge").toBe(0.5);
    // Both ends explicit, which is how the console would commit a pair: then the undo is exact.
    const pair = setTrackSendsCommand(base.tracks[0]!.id, { sendA: 0.1, sendB: 0.2 }, { sendA: 0.5, sendB: 0.6 });
    const moved = pair.redo(base);
    expect(sendsOf(pair.undo(moved)), "a pair undoes as a pair").toEqual({ sendA: 0.1, sendB: 0.2 });
  });

  it("⭐ clamps rather than refusing, so it never returns undefined the way its validating siblings do", () => {
    const base = arrangement();
    const id = base.tracks[0]!.id;
    // Past the range in both directions: a send is a level, and there is nothing here for the model to refuse.
    const command = setTrackSendsCommand(id, { sendA: 0 }, { sendA: 4 });
    expect(command.redo(base).tracks[0]!.sendA, "clamped into 0…1").toBe(1);
    const below = setTrackSendsCommand(id, { sendA: 0 }, { sendB: -3 });
    expect(below.redo(base).tracks[0]!.sendB).toBe(0);
  });

  it("⚠️ leaves the untouched send alone, so one knob cannot move the other", () => {
    const base = arrangement();
    const withB = setTrackSendsCommand(base.tracks[0]!.id, {}, { sendB: 0.25 }).redo(base);
    const both = setTrackSendsCommand(base.tracks[0]!.id, { sendB: 0.25 }, { sendA: 0.75 }).redo(withB);
    expect(both.tracks[0]!.sendA).toBe(0.75);
    expect(both.tracks[0]!.sendB, "the B the command never named is still there").toBe(0.25);
  });
});
