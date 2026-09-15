/**
 * GS-1 track routing — the scheduling core (P6, Phase 2).
 *
 * The engine wiring is not in yet (and the switch is off by default), so these tests are what
 * currently guarantees the two properties the wiring will depend on: the **frame arithmetic**
 * (including the latency compensation that keeps GS-1 notes aligned with native ones) and the
 * **polyphony cap**. Both are pure functions precisely so that live playback and the offline
 * renderer cannot disagree about them.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_GS1_ROUTING_ENABLED,
  GS1_POLYPHONY_CEILING,
  capPlanPolyphony,
  gs1PatchFor,
  isGs1RoutingEnabled,
  planGs1Notes,
  setGs1RoutingEnabled,
} from "../audio/gs1/gs1Tracks";

const SR = 48000;

const notes = (list: Array<Partial<{ note: number; time: number; duration: number; velocity: number; pan: number }>>) =>
  list.map((n, i) => ({
    note: n.note ?? 60 + i,
    time: n.time ?? 0,
    duration: n.duration ?? 0.25,
    velocity: n.velocity ?? 0.8,
    ...(n.pan === undefined ? {} : { pan: n.pan }),
  }));

afterEach(() => setGs1RoutingEnabled(DEFAULT_GS1_ROUTING_ENABLED));

describe("the routing switch is on by default and can be turned off", () => {
  it("plans GS-1 voices out of the box (the user's call)", () => {
    expect(DEFAULT_GS1_ROUTING_ENABLED).toBe(true);
    expect(isGs1RoutingEnabled()).toBe(true);
    expect(gs1PatchFor("chords", "warm_pad")).not.toBeNull();
    expect(
      planGs1Notes({ role: "chords", instrument: "warm_pad", notes: notes([{}]), sampleRate: SR })
    ).not.toBeNull();
  });

  it("plans nothing and reports no patch once the user switches it off", () => {
    setGs1RoutingEnabled(false);
    expect(isGs1RoutingEnabled()).toBe(false);
    expect(planGs1Notes({ role: "chords", instrument: "warm_pad", notes: notes([{}]), sampleRate: SR })).toBeNull();
    expect(gs1PatchFor("chords", "warm_pad")).toBeNull();
  });
});

describe("frame arithmetic", () => {
  it("converts seconds to absolute frames", () => {
    setGs1RoutingEnabled(true);
    const plan = planGs1Notes({
      role: "chords",
      instrument: "warm_pad",
      notes: notes([{ note: 60, time: 0.5, duration: 0.25 }]),
      sampleRate: SR,
    })!;
    expect(plan.notes[0].atFrame).toBe(0.5 * SR);
    expect(plan.notes[0].offFrame).toBe(0.75 * SR);
    expect(plan.patch).toBe("warmPad");
  });

  it("addresses events early by the reported latency, so the onset lands on the requested time", () => {
    setGs1RoutingEnabled(true);
    const latency = 128;
    const plan = planGs1Notes({
      role: "lead",
      instrument: "saw_lead",
      notes: notes([{ note: 72, time: 1, duration: 0.5 }]),
      sampleRate: SR,
      latencyFrames: latency,
    })!;
    // The voice starts `latency` frames *after* the event, so the event is `latency` frames early.
    expect(plan.notes[0].atFrame).toBe(1 * SR - latency);
    expect(plan.notes[0].offFrame).toBe(1.5 * SR - latency);
  });

  it("never schedules in the past when a note sits inside the first latency window", () => {
    setGs1RoutingEnabled(true);
    const plan = planGs1Notes({
      role: "chords",
      instrument: "warm_pad",
      notes: notes([{ note: 60, time: 0, duration: 0.2 }]),
      sampleRate: SR,
      latencyFrames: 128,
    })!;
    expect(plan.notes[0].atFrame).toBe(0);
    expect(plan.notes[0].offFrame).toBeGreaterThan(plan.notes[0].atFrame);
  });

  it("orders the notes deterministically, whatever order they arrive in", () => {
    setGs1RoutingEnabled(true);
    const forward = planGs1Notes({
      role: "chords",
      instrument: "warm_pad",
      notes: notes([
        { note: 64, time: 0 },
        { note: 60, time: 0 },
        { note: 62, time: 0.1 },
      ]),
      sampleRate: SR,
    })!;
    const reversed = planGs1Notes({
      role: "chords",
      instrument: "warm_pad",
      notes: notes([
        { note: 62, time: 0.1 },
        { note: 60, time: 0 },
        { note: 64, time: 0 },
      ]),
      sampleRate: SR,
    })!;
    expect(reversed.notes).toEqual(forward.notes);
    // Same frame ⇒ ordered by pitch, so "which note is which" is not left to chance.
    expect(forward.notes.map((n) => n.note)).toEqual([60, 64, 62]);
  });

  it("carries pan through when the caller supplies it", () => {
    setGs1RoutingEnabled(true);
    const plan = planGs1Notes({
      role: "lead",
      instrument: "square_lead",
      notes: notes([{ note: 72, pan: -0.5 }]),
      sampleRate: SR,
    })!;
    expect(plan.notes[0].pan).toBe(-0.5);
    const plain = planGs1Notes({
      role: "lead",
      instrument: "square_lead",
      notes: notes([{ note: 72 }]),
      sampleRate: SR,
    })!;
    expect("pan" in plain.notes[0]).toBe(false);
  });
});

describe("what stays native", () => {
  it("returns null for a role GS-1 does not voice", () => {
    setGs1RoutingEnabled(true);
    for (const role of ["kick", "snare", "hihat", "percussion", "bass", "fx"]) {
      expect(planGs1Notes({ role, instrument: "warm_pad", notes: notes([{}]), sampleRate: SR }), role).toBeNull();
    }
  });

  it("returns null for an instrument with no GS-1 patch", () => {
    setGs1RoutingEnabled(true);
    // Kept native on purpose: acoustic instruments have no honest subtractive analogue.
    for (const instrument of ["piano_lead", "sitar_lead", "flute_lead", "vibraphone"]) {
      expect(planGs1Notes({ role: "chords", instrument, notes: notes([{}]), sampleRate: SR }), instrument).toBeNull();
    }
  });

  it("returns null rather than guessing when the input is unusable", () => {
    setGs1RoutingEnabled(true);
    const base = { role: "chords" as const, instrument: "warm_pad", sampleRate: SR };
    expect(planGs1Notes({ ...base, notes: [] })).toBeNull();
    expect(planGs1Notes({ ...base, notes: notes([{}]), sampleRate: 0 })).toBeNull();
    expect(planGs1Notes({ ...base, notes: notes([{}]), sampleRate: Number.NaN })).toBeNull();
    expect(planGs1Notes({ ...base, notes: notes([{ time: Number.NaN }]) })).toBeNull();
    // A zero-velocity note is a rest, not an error: it is dropped, and an all-rest plan is null.
    expect(planGs1Notes({ ...base, notes: notes([{ velocity: 0 }]) })).toBeNull();
  });

  it("clamps velocity and rounds non-integer pitches", () => {
    setGs1RoutingEnabled(true);
    const plan = planGs1Notes({
      role: "chords",
      instrument: "warm_pad",
      notes: notes([
        { note: 60.4, velocity: 1.7 },
        { note: 64, velocity: -1 },
      ]),
      sampleRate: SR,
    })!;
    expect(plan.notes.map((n) => n.note)).toEqual([60]);
    expect(plan.notes[0].velocity).toBe(1);
  });
});

describe("polyphony ceiling", () => {
  it("keeps the newest notes and drops the tail beyond the ceiling", () => {
    setGs1RoutingEnabled(true);
    const many = planGs1Notes({
      role: "chords",
      instrument: "warm_pad",
      notes: notes(Array.from({ length: 12 }, (_, i) => ({ note: 48 + i, time: i * 0.01 }))),
      sampleRate: SR,
    })!;
    expect(many.notes).toHaveLength(12);
    const capped = capPlanPolyphony(many);
    expect(capped.notes).toHaveLength(GS1_POLYPHONY_CEILING);
    // The last eight by onset time survive: dropping the *new* notes would sound like a stuck chord.
    expect(capped.notes.map((n) => n.note)).toEqual(many.notes.slice(-GS1_POLYPHONY_CEILING).map((n) => n.note));
  });

  it("leaves a plan that already fits untouched, and honours a custom ceiling", () => {
    setGs1RoutingEnabled(true);
    const small = planGs1Notes({
      role: "chords",
      instrument: "warm_pad",
      notes: notes([{ note: 60 }, { note: 64 }]),
      sampleRate: SR,
    })!;
    expect(capPlanPolyphony(small)).toBe(small);
    expect(capPlanPolyphony(small, 1).notes).toHaveLength(1);
  });

  it("documents the measured ceiling", () => {
    // E3 measured one instance sustaining real time at 8 voices alongside the full 8-track app
    // (p90 load 0.054, real-time ratio 1.00) and failing at 16 (p90 0.336, ratio 0.58).
    expect(GS1_POLYPHONY_CEILING).toBe(8);
  });
});
