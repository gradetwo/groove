# groove-composition

How to write a part an agent composes here so that it does not sound mechanical, and which tool to reach for.
Derived from the owner's MCP test report (2026-10-04); installed as `~/skills/groove-composition/SKILL.md`.

## 1. Humanise a piano part, or it will sound mechanical

A MIDI file generated note by note is *too correct*: exact durations, one velocity, no pedal. Measured feedback:
"机械，很少钢琴的味道". Four things fix it, and all four are cheap:

- **Layer the velocity**, never one value: melody **85–110**, accompaniment **50–70**, bass **low and steady**.
- **Pedal**: write **CC64 sustain** per bar (down at the bar, up before the next) instead of holding everything dry.
- **Micro-timing**: offset onsets by roughly **±10–20 ticks**; exactly-on-the-grid onsets are what "quantised" sounds like.
- **Phrase dynamics**: a phrase starts a little stronger and **fades at its end**; without it every bar has the same weight.

## 2. `create_song` and other parameters

- `create_song`'s `pattern` must be **an object, not a string**. When unsure of a shape, read the tool's own
  `inputSchema` rather than guessing.
- A blank **`sampler`** track starts on the drum kit `virtuosity-drums-basic`; pass `assetId` (for example
  `salamander-grand`) in the same call when an instrument was meant. `blankKind` does **not** accept `"piano"`.

## 3. Arrangement or song, and which export

- `export_midi` is for a **song**; an arrangement uses **`export_arrangement_midi`** (and its MusicXML twin).
- `export_arrangement_musicxml` writes **one track** unless `trackId` says which — the first non-folder lane otherwise.
- `add_arrangement_track` reports the new lane **inside its summary**, not as a top-level `trackId`.

## 4. Hearing what you changed

- **`render_arrangement_preview`**: one span, optionally one lane or several, 8 kHz mono by default, rendered once.
  This is the fast loop — hear two bars, not the whole piece.
- **A/B**: call the preview **twice** on the same span (before against after, or one lane against another) and compare
  the two replies; each names its own file, span, lanes and measured levels, so the pair describes itself.
- Nothing is mixed together here: these tools **hand back files**, and playing them is the caller's job.

## 5. Look up an instrument's real range before you write notes

Nothing exposes an SFZ's key range yet, so a note outside it fails at render time instead of at write time — and one
render costs about two minutes per track. `get_pitch_report` resolves a single note in about a second, so ask it first
when a part sits near the edge of an instrument. Measured ranges differ from sample file names: a zither whose samples
are named G4–C7 accepts region 40–72.

## 6. `spectral_balance` and `analyze_audio` are the same measurement

Both call the same analyser, so their replies carry the same fields; one file measured 126.3 s and 115.4 s in the same
session for identical output. Pick one. The analysis is cached by path, size and mtime, so repeating a call on an
unchanged file is cheap, and rendering a new file is not.

## 7. The analysis is synchronous

One `analyze_audio` on a master blocked the server for 87–112 s, during which nothing else was answered, against a
one-to-eight millisecond baseline for cheap calls. Do not put a status call next to an analysis and expect it back.

## 8. Say what does not exist, and name your units

`synthesize_vocal` is reserved and not implemented, and the sample library has no sung vocals, so there is no sung
delivery: carry the melody on an instrument and say so in the hand-over. Name the unit of every number — `truePeakDb`
is −1.296 dBTP while `samplePeakDb` is −1.300 dBFS, and neither is the integrated loudness. A stereo file reads about
3.01 dB above the same signal in mono, so say which of the two a figure came from.

