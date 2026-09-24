# Listening to what we shipped (the `agy` audio review)

Every gate in this repository compares **numbers**: LUFS within 0.35 dB, correlation above 0.98, a tail under
−60 dBFS. None of them says whether the result *sounds* like the genre, and three of the defects found in the last
week were audible long before they were measurable (a duck that stops ducking, a stereo field that is mono, a loop
that ends in silence).

`agy` is an agent CLI that can take an audio file as an attachment and describe it. It reads the file with its own
tools and reports spectral and loudness measurements, so it is useful in two ways: as an **independent check** on our
own metrics, and as a **source of candidates** — findings to go and measure properly.

## Rendering a file to listen to

```bash
node scratch/render_genre_to_wav.mjs --genre=disco --form=loop --out=/tmp/disco-loop.wav
node scratch/render_genre_to_wav.mjs --genre=ambient --form=club --out=/tmp/ambient-club.wav
```

`--form=loop` renders the genre's pattern; `--form=club|song` renders the arrangement the exporters write (B2), which
is what a phone track is (`auditionArrangementFor`). The render is the **same offline path** the exporters and the
analysers use, with the genre's own trim applied, so what you hear is what the file contains.

Two practical limits, both learned the hard way:

* **Keep the render short.** A 26-second loop transfers as base64 in a few megabytes and is fine; an 80-second
  arrangement is ~35 MB of WAV and **kills the renderer process** (`Target page, context or browser has been
  closed`). The script chunks the transfer, but the page still has to hold the buffer — so review a loop, or a short
  form, and use the analyser for full-length work.
* **The first render in a fresh page is a fallback render** (the limiter worklet registers lazily), so the script
  throws one render away before the measured one. A one-off render is not comparable with the recorded baseline.

## Asking for a review

```bash
agy -p "@/tmp/disco-loop.wav 分析下这个音频：曲风、律动、低频与侧链、立体声宽度、结尾是否自然，以及有没有明显的问题" \
  --dangerously-skip-permissions
```

Prompt for **measurements** as well as impressions ("请给出关键测量数值") — the numbers are what make a review
comparable with our own gates, and an impression without one is a rumour. In practice it reports LUFS, LRA
(loudness range), per-band RMS, mid/side levels, channel correlation and where the tail falls silent.

## What it found on 2026-09-24 (and how to read it)

On `disco-loop.wav` it reported, unprompted by our numbers:

| its finding | our gate | verdict |
| --- | --- | --- |
| side is **28.7 dB** below mid, correlation **0.997** — "听感等同于纯单声道" | `narrowStereo`: 8–9 of 12 genres above 0.98 correlation | **agrees** — and it is the same defect (A1's remaining work) |
| "几乎没有明显的侧链抽吸避让" | `duckErasedInMaster`: the file's median dip was −0.3 dB before the release hold, −3.82 dB after | **agrees on the problem, disagrees on the residue** — worth a look: is a −3.8 dB median dip audible as ducking, or is our median flattering a duck that is still mostly gone? |
| LRA **0.6 LU** ("机械感偏重") | `thinDynamics`: 0 offenders | **disagrees** — our claim measures something else (per-track velocity spread), and this is a *master* dynamics statement. One of the two is measuring the wrong thing |
| a **1.74 s** silent tail after the last hit | `cutTail` asks only for silence | **new** — for a *loop asset* that is a defect: the file cannot be looped seamlessly. The claim's ceiling has no floor |

`ambient-loop.wav` (87 s, a pad) confirmed the pattern on a second genre, and its numbers line up with ours:

| its measurement | our gate | verdict |
| --- | --- | --- |
| correlation **+0.9867**, side/mid **−21.18 dB** | `narrowStereo` lists ambient at 0.99xx; `sideTooHot` only fails above −8 dB | **agrees** — narrow, and correctly not flagged as hot |
| **L/R balance 0.53 dB** (slightly left) | nothing in the suite measures channel balance | **new gap** |
| a **3-second fade to −90 dBFS**, then the file ends | `cutTail` is satisfied | same gap as disco: silence has no *floor*, so a loop asset that cannot loop passes |

That is the point of the tool: corroborations, disagreements and gaps in a single review, on a genre the gates are
happy with. Treat every
finding as a **candidate**: measure it before believing it, and record the disagreement rather than smoothing it over.
