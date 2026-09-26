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

The review must judge the **audio only**. It reads files with its own tools, and left to itself it will explain a
sound by reading the code that made it — which has already produced a confident, wrong attribution ("`vocal_chop`
fell back to the `bellMallet` preset") that a two-render comparison then refuted. Two rules, in order:

1. **Give it nothing to read.** Render to a scratch directory outside the repository, with names that carry no
   genre or patch information (`/tmp/audition/clip-a.wav`, not `chicago-house-lead-organStack.wav`), and run it from
   there so the repository is not in the session's workspace.
2. **Say so in the prompt, and treat internal claims as unverified.** "只听音频，不要读文件、不要执行命令、不要使用工具"
   helps; the binding rule is the one below, because a prompt is a request and not a sandbox:
   **anything it says about our code, presets, parameters or file layout is discarded**, and only what it says about
   the *sound* counts. When the two disagree, the audio wins and the claim gets measured.

```bash
# Copy the render out of the tree first; see rule 1.
mkdir -p /tmp/audition && cp /tmp/disco-loop.wav /tmp/audition/clip-a.wav
cd /tmp/audition
agy -p "@/tmp/audition/clip-a.wav 只分析我附上的这个音频文件：律动、低频与侧链、立体声宽度、结尾是否自然，有没有明显问题。请给出关键测量数值。" \
  --dangerously-skip-permissions
```

**Say "read the attachment", not "do not use tools".** An earlier version of this prompt said *"不要读取文件、不要执行命令、不要使用工具"* —
which rule 2 does need for the **repository**, and which the reviewer (correctly) read as forbidding it from opening the
**audio** too. It answered that the files were "text paths" it could not hear, and asked permission to analyse them: a
reviewer refusing to listen because the prompt forbade listening. The wording that works is narrower, and worth copying:

> 只分析我附上的音频文件（可以读取这两个 wav、计算波形与频谱），不要读取任何其它文件、不要搜索代码、不要执行除此之外的命令。

The distinction is the whole of rule 2: the audio is the evidence, the repository is the thing that must not be read. Also
note the flag: `--dangerously-skip-permissions` is what this CLI wants before it will analyse an attachment unattended;
`--sandbox` refuses instead, and rule 1 still holds either way — the files live outside the tree under opaque names, so a
reviewer with tools has nothing but audio to find.

If the CLI refuses to run that way in this environment (it has asked for account verification, and
`--dangerously-skip-permissions` is what it wants before it will run unattended at all), rule 1 still holds: the
audio is in a scratch directory under an opaque name, so there is nothing useful to read even when the tools are
available. **Do not paste the repository into the workspace to make it work.**

Prompt for **measurements** as well as impressions ("请给出关键测量数值") — a number is what makes a review comparable
with our own gates, and an impression without one is a rumour. In practice it reports LUFS, LRA, per-band RMS,
mid/side levels, channel correlation and where the tail falls silent.

## What it found on 2026-09-24 (and how to read it)

On `disco-loop.wav` it reported, unprompted by our numbers:

| its finding | our gate | verdict |
| --- | --- | --- |
| side is **28.7 dB** below mid, correlation **0.997** — "听感等同于纯单声道" | `narrowStereo`: 8–9 of 12 genres above 0.98 correlation | **agrees** — the same defect (A1's remaining work) |
| "几乎没有明显的侧链抽吸避让" | `duckErasedInMaster`: the file's median dip was −0.3 dB before the release hold, −3.82 dB after | **agrees on the problem, disagrees on the residue** |
| LRA **0.6 LU** ("机械感偏重") | `thinDynamics`: 0 offenders | **disagrees** — the claim measures per-track velocity spread, this is a *master* dynamics statement |
| a **1.74 s** silent tail after the last hit | `cutTail` asks only for silence | **new** — a loop asset that cannot loop; closed later by `seamlessLoop` |

`ambient-loop.wav` (87 s, a pad) confirmed the pattern on a second genre, and its numbers line up with ours:
correlation **+0.9867**, side/mid **−21.18 dB**, **L/R balance 0.53 dB** (a gap nothing in the suite measured), and a
3-second fade to −90 dBFS before the file ends.

That is the point of the tool: corroborations, disagreements and gaps in a single review, on a genre the gates are
happy with. Treat every finding as a **candidate** — measure it before believing it, and record the disagreement
rather than smoothing it over. And read the internal claims with the scepticism the `vocal_chop` case earned: the
reviewer is trustworthy about sound and unreliable about code.
