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

**Refuted as well** (all four A/Bs, same lead stem, same ratio metric):

| hypothesis | measured | verdict |
| --- | --- | --- |
| steal fade 20 ms → 50 ms | 7.76 → 7.77 | no |
| the supersede rule (dropping a stale release) | 7.76 with it disabled | no |
| the per-note **tuning** write (`cents`, ABI 9) | 8.14 without it | no |
| the **patch** (uk-garage's `organStab` vs the shared organ) | 15.45 with the shared patch | no — and the shared one is worse |

So the pops are GS-1-specific (7.76 against 2.12 for the native render of the same lane) and *none* of the patch, the
scheduling rules or the tuning is responsible. What is left is the mechanism only GS-1 has: **the worklet splits the render
block at every due note event** (`gs_process(chunk)` per segment) so a note can start mid-block. That was the next
hypothesis, and the honest result of testing it is in the test above: the split is *not* supposed to be bit-identical
(the parameter smoothing depends on the frame count by construction) and its divergence is 0.0056 on a ~0.5 signal, which
is a drift rather than a discontinuity — so the split is **not yet** implicated either.

The next experiment is therefore the split itself, staged rather than inferred: render the same part with every event on a
**block boundary** (so no split ever happens) and compare the ratio. That is a one-flag render, and it decides whether the
remaining suspect is the chunking or something in the voice's own start (`gs_voice_reset` + `gs_voice_phase` on a slot whose
filter is still ringing).

### 1b. **Found it**: the pop is the event split — a mid-block note start

The staged experiment the plan asked for, run on the UK Garage lead stem (the owner's "little pop after every note"):

| render | worst step / p99.9 |
| --- | --- |
| events at their real frames (the app's own path) | **7.76** |
| the same events snapped to a **128-frame block boundary** | **1.33** |

Six times smaller, and the difference is nothing but *where in the block a note starts*. So the pop is the worklet's
**event split**: `gs_process(chunk)` for the part of the block before a due event, then the event, then the rest — and
something in that sequence puts a step in the output that a block-aligned start does not.

That also explains every earlier refutation rather than contradicting them: the steal fade, the supersede rule, the
per-note tuning and the patch are all *inputs* to the event, and the defect is in how the event is applied.

**What is left to bisect, with the measurement that makes it cheap:**

* the chunk-invariance test already bounds the *split alone* at 0.0056 on a ~0.5 signal (the parameter smoother's drift,
  not a discontinuity) — so the step comes from the **event application**, not from a shorter chunk by itself;
* next: apply the same note with the effects path bypassed (a dry, single-voice patch) and with the reverb/delay returns
  muted, one at a time, watching the same ratio. A global/effect buffer being reset by a note-on would show up immediately;
* the honest Groove-side workaround — snapping events to block boundaries — is **not** acceptable: it costs up to 2.9 ms of
  timing accuracy at 44.1 kHz, which is exactly the thing a professional editor is supposed to get right.

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
