# Audio tracks, and an SVS interface that says it is empty — scoping (owner decision 4)

The owner's decision was: **scope audio tracks, and for singing synthesis reserve the interface and leave it empty.** This is the scope, and the stub is
deliberately reachable so the absence is discoverable.

## 1. Audio tracks

**What it means here**: a lane whose steps trigger **samples** rather than a synthesised voice. The library already knows how to hold and play sample data (the
drum kit models are exactly that), so the interesting work is not playback — it is everything else a new lane kind drags with it:

| area | what has to be decided | why it is not small |
|---|---|---|
| the lane model | `track_id` is a closed union of **eight roles** (`src/types/genre.ts:50`); an audio lane is a ninth kind, or an `instrument` mode inside an existing one | owner decision 1A just added `laneId` for **multiplicity**; this is **kind**, which is a different question and touches the same compatibility promise |
| `.groove` | a package would have to reference sample data — by path (not portable), by hash (needs a store), or embedded (size) | the format's promise is that v1 stays readable; samples are the first data that cannot be additive in the same way |
| **PDC** | a sample track has its **own** latency (file offset, any resampling), and PDC's table is the thing that must know it | the comb-filter criterion already exists and the latency table has one measured row; a new source of latency belongs in it, not beside it |
| the delay table | add the audio path's latency as a **measured** row, not a declared one | PDC's own history: the declared limiter latency was never applied until it was measured |
| stems and export | an audio lane in a stem export is a stream copy; in the mix it is a bus | `AbletonExporter` writes one track per lane and would need a rule for a non-MIDI lane |
| the URL share | samples cannot travel in a share link | the codec has a size budget and already refuses what does not fit — this would be a new refusal reason |

**Recommendation**: do it **after** the `laneId` work has settled, because a ninth *kind* and a second *instance* of a kind are the two halves of the same
question, and doing both at once would put two format-affecting changes in one release. The first slice worth building is a **read-only** audio lane: play a
sample in a render, measure its latency into the table, and change no export path — which answers "what does an audio lane cost in PDC" without answering "what
is an audio lane in the format".

## 2. SVS: an interface with no implementation

The owner asked for the interface to be **reserved and left empty**, and the honest way to do that is to expose it and have it **say so**, rather than to leave a
hole an agent will guess at. `synthesize_vocal` is registered, is `readOnly`, and returns `reserved, not implemented` with the reason.

The reason it is written down rather than merely coded: an agent that finds no tool will try to build a vocal from the tools it has and produce something that
sounds like a mistake, whereas an agent told the capability is reserved can plan around it — and the absence becomes a fact about the server rather than a
surprise.

**What "reserved" commits us to**, so the interface is not a decoration:

* the tool's **name and purpose** are fixed, so a future implementation does not move under a caller's feet;
* it takes the arguments such a call would need (a lyric, tones, a target lane) and **validates them**, so the shape is exercised now and the failure message can
  explain what is missing rather than what is malformed;
* a `check:mcp` case asserts that it **says it is reserved**, so the stub cannot be mistaken for a working tool by either a human reading the list or a gate
  watching the surface.

## 3. What is explicitly not in this scope

* **No SVS implementation**, and no partial one: no formant model, no phoneme set, no alignment. The direction, when it is taken up, is the upstream synth
  project (`docs/SYNTH_UPSTREAM_PLAN.md`), not a second synthesizer inside this repository.
* **No audio samples committed to this repository** as part of this scoping.
* **No change to the delay table's existing row** — the audio path's latency is added when there is an audio path to measure.
