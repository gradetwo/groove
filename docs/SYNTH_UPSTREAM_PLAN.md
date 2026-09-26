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

**And then the measurement itself became the suspect.** The next test asked whether the *effects* hide a fixed-block
assumption — they run after the voices and a split render hands them short blocks — and the upstream suite now pins that
they are chunk-stable (chorus, delay and reverb enabled, divergence no worse than the dry path). So the DSP is not
chunk-dependent, and yet block-aligning the events moved the number six-fold.

That is the confound: the ratio flags **any** large sample step, and a bright stack whose voices line up produces large
steps musically. Block-aligning the events changes *which* samples coincide and therefore the interference pattern — it is
a different render, not a fixed one. **The metric cannot tell this owner's pop from a legitimately steep waveform**, just
as an absolute step bound could not. What is needed next is a detector that is specifically about the boundary (envelope
continuity across a note's end) or a timestamp from the person who can hear it — and the honest thing to record is that
two rounds of A/Bs were run against a number that could not answer the question.

**What the bisect did rule out, all with the same stem and metric:**

* the chunk-invariance test already bounds the *split alone* at 0.0056 on a ~0.5 signal (the parameter smoother's drift,
  not a discontinuity) — so the step comes from the **event application**, not from a shorter chunk by itself;
* next: apply the same note with the effects path bypassed (a dry, single-voice patch) and with the reverb/delay returns
  muted, one at a time, watching the same ratio. A global/effect buffer being reset by a note-on would show up immediately;
* the honest Groove-side workaround — snapping events to block boundaries — is **not** acceptable: it costs up to 2.9 ms of
  timing accuracy at 44.1 kHz, which is exactly the thing a professional editor is supposed to get right.

### 1h. **The reviewer found it: a one-sample step at every note-off, in the GS-1 render only** (2026-09-26)

The `agy` review (with the prompt fixed to let it *read the audio* — see `docs/AUDIO_REVIEW.md`) was given the UK Garage lead
rendered two ways, opaque names, and asked one question. Its answer, abridged but not paraphrased:

* the pop is in **`clip-a`** — the **GS-1** render — and **not** in `clip-b`, the native one, which "releases smoothly";
* it appears at **every one of the twelve note-offs**: 0.603, 1.306, 1.636, 2.424, 3.121, 3.452, 4.241, 4.941, 5.271, 6.058,
  6.759, 7.089 s;
* the signal is a **single-sample vertical step** (≈22.7 µs), no amplitude release at all, peaking at **20 005/32768 ≈
  −4.3 dBFS**, typically −12 to −5.7 dBFS, **larger in the right channel** than the left;
* spectrally it is a **broadband impulse** flat to Nyquist, with 12–20 kHz energy jumping **40–70 dB** — "a dry, sharp click
  with no tail".

Three things follow. The times are **exactly** the ones the high-frequency envelope detector reported in §1d (1.306, 3.121,
4.241, 4.941, 6.759, 7.089…), so that detector was right and my later "it is only the note's own decay" retraction was reading
a *different* metric's false positives. The right-channel emphasis matches the lane's `pan: +0.6`. And the mechanism is
narrow now: the envelope **does not ramp at all** at note-off — and an A/B agrees, because the step scales with the patch's
release: `ENV_RELEASE` 4 s shrinks it to 61× the sound's own median slope, the shipped 1.3 s gives 181×, and 0.15 s makes it
**2487×**. A release that is *inversely* proportional to the click is not a release; it is a cut.

**And the core survives the exact shipped patch, released where the lane releases it.** Four upstream cases now pass: a
note-off between `process` calls, a release **mid-attack**, a release **inside a block** (the worklet's own shape), and one
reproducing `organStab` **exactly** — its own ids and values, released at the lane's real 148 ms, which lands **during the
decay** (0.22 s) rather than in the attack. The first in-block case also had to be fixed for the same reason this whole
investigation keeps repeating: it compared the two renders with a 25 % tolerance, which cannot see a 0.09 step on a 0.5 peak,
and passed while doing so.

So the core is not the source in any configuration Groove can put it in, and the step is introduced **between the core and
the file**: the worklet's buffer copy, the host's gain and connection, or the exporter's mixdown. The next measurement is at
that boundary — capture the wasm output buffer around a note-off and compare it with the final output, which says which side
of the line the step appears on.

**The A/B ran, and the trigger is the note-off.** With the GS-1 note-offs never scheduled (`--no-note-off`), the same lead
stem's high-frequency outliers fall from **181x / 154x / 135x** the signal's own median slope to **41x / 38x / 33x** — a
4.5x reduction, and the surviving peaks move to different times (the note-ons). So the step is triggered by the off.

**And the core is not where it goes wrong.** Three upstream cases now pass: a note-off between two `process` calls, a release
**mid-attack** (the shipped lane's 0.15 s attack against its ~0.148 s notes, which is the stage-switch path the first test
missed), and a one-sample chunk. The envelope ramps in all of them.

What is left is the **worklet's application of the off** — or the host's framing of its frame — and the next experiment starts
there: log the chunk boundaries and the applied frames around an off, and compare against the same note released through the
core directly. The probe flag stays, because it is the control that measurement needs.

**Next experiment, once the loudness re-record stops using the machine**: render the same stem with (a) the note-offs never
scheduled and (b) the worklet's supersede rule disabled, both judged by the high-frequency envelope view. The plan already
called for re-running (b) with a detector that can see the pop; this is that re-run.

### 1g. Five detectors, and the pattern they share

The fifth measurement was the most promising and the shortest-lived: correlate the audio's onsets with the notes the plan
schedules and list the ones nothing explains. It reported **ten unexplained events** in the GS-1 stem against **none** in
the native render — exactly the owner's complaint — and refuted itself the moment the events were inspected:

```
0.76s: before 0.0320/525Hz   onset 0.0294/1125Hz   after 0.0231/550Hz
1.18s (a real note):                              0.0821/1700Hz
```

Those "events" are quieter than a real note's onset (0.029 against 0.082) and sit in the same 500–1400 Hz band as the note
around them: they are the **note's own decay** crossing a threshold scaled to the loudest note in the file.

**The pattern is worth more than any of the five.** Every threshold detector built here has flagged a *normal musical
shape* as a defect — a bright waveform's sample steps, a slow attack's envelope, a decaying note's body, a block-aligned
event set that simply contained fewer notes. A threshold cannot tell "unusual" from "musical", and this investigation has
now paid for that lesson four times.

**And the one instrument that could settle it by listening is unavailable here**: the `agy` review documented in
`docs/AUDIO_REVIEW.md` answers "User location is not supported for the API use". So the next thing this plan proposes is not
a sixth detector but a **capture button in the app**: let the person who can hear the pop hand over the signal.

### 1i. Where the pop stands, and what would finish it (2026-09-26)

**Characterised, reproducible, and not the core.** The reviewer's description and my own sample-level check agree on every
particular: a **one-sample step at each note's release**, GS-1 only, up to −4.3 dBFS, broadband to Nyquist, larger in the
right channel (the lane is panned +0.6). The trigger is the note-off — rendering with the note-offs unscheduled drops the
high-frequency outliers from 181×/154×/135× the signal's own median slope to 41×/38×/33× and moves the survivors to the
note-ons. And the core is clean in **five** configurations now: a note-off between `process` calls, a release mid-attack, a
release **inside** a block, a one-sample chunk, and one reproducing `organStab` **exactly** (its ids and values, released at
the lane's real 148 ms, which lands in the 0.22 s decay).

So the step is introduced **between the core and the file**: the worklet's copy of the wasm output buffer, the host node's
gain or channel configuration, or the exporter's mixdown. The instrument that settles it is small and does not exist yet:
have the worklet post the ±8 wasm-buffer samples around a note-off, and compare them with the same samples in the rendered
file. That is one `postMessage` and a probe, not another day of bisecting.

**What is deliberately not being done meanwhile**: guessing. The five detectors earlier in this file each produced a
confident wrong answer, and the last one — "it is only the note's own decay" — was itself wrong because it read a different
metric's false positives. The next change to this path will be made against the buffer capture, not against a theory.

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
