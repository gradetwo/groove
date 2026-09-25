# Upstream synth changes — plan

Groove vendors `gs1` from the sibling `synth` project (`vendor/gs1` + `public/gs1/*.wasm`, pinned by
`scripts/sync-gs1.mjs` and checked by `node scripts/check-gs1.mjs`). This file is the **queue of changes that belong
upstream**, with the measurement that asked for each one. The rule from the owner: if something needs an upstream change,
write the plan first and then make it — and keep the ABI contract honest while doing it.

## How a change here is made

1. Change the upstream source in `~/music/synth` (never the vendored copy — `sync-gs1` would overwrite it).
2. Add the test that fails against the old behaviour, in the upstream suite, and run the upstream gates
   (`npm test`, `npm run verify:worklet-protocol`, `npm run test:wasm` when the Rust changed).
3. Re-pin in Groove with `node scripts/sync-gs1.mjs`, then `node scripts/check-gs1.mjs`.
4. Measure the thing that asked for it (`probe_gs1_voicing.mjs`, `probe_gs1_calibration.mjs`,
   `probe_audition_repeat.mjs`, or a stem render) and record the before/after beside the change.
5. A **DSP** change also invalidates the timbre fingerprints, the loudness trims and the DSP baseline: re-record them
   in the same move, or the gate will say so.

## 1. A stolen voice clicks on a sustained patch — **in progress**

**The report**: "solo the UK Garage lead and every note has a little *pop* after it."

**The measurement**: the lead stem's largest sample-to-sample discontinuities are **0.20** against the native render's
**0.107**, at every note boundary. The cause is the voice manager, not the patch:

* `engine.rs: find_victim` prefers *released and quiet* voices, and `start_note` gives the victim
  `STEAL_RELEASE = 0.02` s — a **20 ms** fade;
* the patch's release is long (1.3 s) and notes now sound for at least their attack, so the previous note is **still in
  its release** when the next one strikes the same key;
* a 20 ms fade of a sustained tone is a click, and it lands **after** the note — which is where the owner hears it.

**The change**: `STEAL_RELEASE` 0.02 → **0.05** (a steal that is smooth to the ear without holding the slot long enough
to matter), with an upstream test that renders the boundary and asserts the discontinuity stays below a stated bound.
Beside it, the Groove-side patch change that removes most of the pressure: `organStab`'s release 1.3 → 0.6 s.

**Measured, and the hypothesis is wrong**: the steal fade is *not* what the owner hears. On the same lead stem the
discontinuity **ratio** (largest sample-to-sample step against the signal's 99.9th percentile) is **7.76 with a 20 ms
steal and 7.77 with 50 ms** — identical. The change is kept because it is a genuine smoothness improvement with a test,
but it is not the fix.

**What the same measurement did establish**:

* the pops are **GS-1-specific** — ratio **7.76** with the engine, **2.12** with `--no-gs1` on the same lane;
* an **absolute** step bound cannot detect a click: a continuous organ tone measures 0.15, so the metric must be a ratio
  (a mistake made twice in this work, now written down);
* the **supersede rule** is not the cause either — disabling it leaves the ratio at 7.76.

**Next suspect**: the per-note **tuning** write (`cents`, ABI 9). The engine sends a value with every note, and if the
core's `gs_set_tuning_note` touches a voice that is already sounding — or resets oscillator state while doing it — that is
one discontinuity per note, which is exactly the shape of the report. The test is a one-line A/B: render the lead with the
variation disabled and compare the ratio.

## 2. Velocity response belongs in the core — **partly done from Groove's side**

Every native preset carries `velocityToCutoff` (1.0–2.2 octaves) and `velocityToAttack`/`Decay`; the core reads velocity
as **amplitude alone**, so a quiet note is a darker, slower note in the native engine and not in GS-1. Groove now wires a
**`modRoute`** (velocity → cutoff) per patch, which covers the cutoff half. Remaining upstream, if the shape is ever
wanted natively rather than per-patch:

* a `velocityToAttack`/`Decay` equivalent in the core's envelope, so a soft note swells like the native engine's;
* the patch-level route replaced by a first-class parameter pair.

Not urgent: the measured gap it was expected to close turned out to be the **part-against-instrument** mismatch (see
`GROOVE_QUALITY_PLAN.md`), not a velocity one.

## 3. Per-note tuning — **done (ABI 9)**

`gs_note_bend` / `gs_set_tuning_note`, and the worklet carries `cents` **with** the note so it lands at that note's own
frame. This is the reference example of how an engine-level need becomes an upstream change: the protocol grew a field,
the protocol checker caught the doc drift, and both engines stayed in step.

## 4. A professional editor's timing: off-grid notes — **future**

The product direction is a Logic-style editor in which the step sequencer is **one view**. That needs notes with
**free** start times, durations, velocities and pitches, which today are expressed as a step index plus a gate. What the
core can already do is worth stating so the plan does not over-ask:

* **frame-addressed note-on/off** — yes (`noteAt` / `noteOffAt`, absolute frames);
* **per-note velocity, pan, tuning** — yes;
* per-note **filter** or a second envelope — no;
* **release shaping per note** — no (the envelope is per patch).

So the editor work is mostly on Groove's side (a note list, a grid that can be off, an exporter that keeps the timing) and
needs upstream only if a note must carry its own filter or envelope. Recorded here so the question is asked once, in the
right place, and not re-litigated per feature.
