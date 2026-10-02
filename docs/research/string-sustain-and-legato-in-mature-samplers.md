# String sustain and legato in mature samplers — a sourced survey

**Status:** research report. **No audio or playback code was written or changed.** No commit, no push.
**Scope:** the two measured defects reported for the strings in the owner's project (A: a hard re-attack at every
chord change; B: a note that outlives its recording simply stops), plus **what the class of problem is called and how
mature/top-tier samplers solve it**, with sources.
**What this report is not:** it contains **no listening claim**. The author has not heard any sound, and no
measurement was taken in this repository for this report — the two defects are taken as given from the report that
commissioned it, and everything about the repository below is a **citation of existing code or a reading of it**.
**Maintenance:** this report is **not** in the doc-reference gate's scan scope. `scripts/check_doc_refs.mjs` builds its
`DOCS` list from the repository root's `*.md` plus `docs/*.md` only — `readdirSync` is not recursive, so
`docs/research/` is never scanned. Verified by reading `scripts/check_doc_refs.mjs:150-158` and running
`npm run check:docs:refs` (green, see §7). Staying current is this line's job, not the gate's.

---

## 0. How this was researched, and what "source" means here

Every non-obvious claim below carries a link to an **official specification, a vendor manual, or a vendor help page**.
Where the only thing found was a forum post or a user Q&A, it is labelled as such and used for illustration only,
never as the basis of a mechanism claim. Where nothing authoritative could be found,
**"未找到权威出处"** is written instead of a guess.

The web pages were read as **external data**, as material. Nothing in them was treated as an instruction to this
repository, and no suggestion found in them was applied to code.

The Kontakt and KSP numbers below come from the **vendors' own PDFs**, downloaded and searched locally with
`pdftotext` rather than quoted from memory:

* KONTAKT 7.5 Manual (EN) — `KONTAKT_7_5_Manual_en.pdf`
* KSP Reference Manual 7.3 (EN) — `KSP_Reference_Manual_en_7_3.pdf`

---

## 1. The two defects, stated as the facts they are

### 1.1 Defect A — a hard re-attack at every chord change

The real project writes the strings as **20 chords × 3 notes, one chord every 8 beats**, with every note
`lengthBeats = 8.5`. Therefore, at chord `k`:

```
old note end  = 8k + 8.5        (still sounding)
new note start = 8(k+1) = 8k + 8
overlap        = 0.5 beat
```

So the writing is **already legato**: each chord's three notes are still sounding half a beat into the next chord.
This is exactly the fact `legatoGapsFor` is built to report (`src/data/legatoGaps.ts:2-13`), and the owner's own
project is one of the arrangements it reports **nothing** about, because there is no seam
(`src/test/ownerProjectAcceptance.test.ts:141-150` asserts the −0.5-beat overlap for all 19 seams).

The defect is therefore **not in the writing** — it is in the **playback of an overlap**: each of the three new
notes starts with its recording's own **hard attack**, over the top of a chord that is still sustaining. The
sustained bed is interrupted by three attacks every 8 beats. At 120 bpm that is every 4 seconds, so beat 48 (the
report's "the break is at 23.98 s") is simply the 7th such change.

**The name for this in sampler terms:** the instrument has no **legato transition handling**. A sampler that receives
overlapping notes but has no legato logic does the only thing it can: it triggers each note-on as a fresh attack.
The attack of a bowed string recording is a bow change, and stacking 60 of them over 20 chords is what "the strings
keep breaking" is.

### 1.2 Defect B — a note longer than its recording stops

The pinned library is VSCO-2-CE (`6dd651d…`). The relevant measured facts, all of which are **already recorded in
this repository** rather than discovered here:

* none of its 75 programs writes a loop opcode, and its sustained `.wav`s carry no `smpl` chunk
  (`src/audio/sfz/instrument.ts:36-42`, `src/test/ownerProjectAcceptance.test.ts:170-178`);
* `/usr/bin/sfizz_render` plays such a note once and goes silent at the sample's end
  (`src/audio/sfz/instrument.ts:38-41`);
* the sustained recording is **11.697 s**, and the note is **4.25 s** at 120 bpm — the note is *shorter* than the
  recording, so this project's strings do not currently run out
  (`src/test/ownerProjectAcceptance.test.ts:181-196`).

So defect B is latent in the owner's project as written today and fatal the moment a note is held longer than
11.697 s (a chord at ≤ 34 bpm, or a pad role, or any future content). The general form is: **a one-shot recording
cannot be sustained, and no playback-side setting can change that** — the recording does not contain the audio.
The name for the fix in sampler terms: **a loop**, or **more recording**.

---

## 2. ⭐ Main table — the practice, the mechanism, our state, our cost

The table is the payload. `我们有吗` cites `file:line` from this repository where the answer is yes, and
**"没有"** where it is not. "Cost here" is an engineering estimate, not a measurement — the one number that *is*
measured in this repository is cited.

| # | 做法（术语） | 解决什么 | 机制要点 | 成熟软件里的实例（＋出处） | 我们有吗 | 在我们这里做要什么成本 |
|---|---|---|---|---|---|---|
| 1 | **`loop_mode=no_loop`** | 一次性播放；采样末尾即结束 | 不循环；note-off 或采样末尾，取先到者 | SFZ 规范，[sfzformat.com/opcodes/loop_mode](https://sfzformat.com/opcodes/loop_mode/)（`no_loop` 是**没有循环点文件**的默认值） | **有** — `loopModeOf()` 显式识别 `no_loop` 并映射为"不循环"（`src/audio/sfz/instrument.ts:120-134`、`:253-254`）；voice 端只有 `loop_continuous`/`loop_sustain` 才真的设 `loop`（`src/audio/samplerVoice.ts:124-133`） | 无 |
| 2 | **`loop_mode=one_shot`** | 鼓/吊镲：按一下要响完 | 播放到采样末尾，**忽略 note-off** | 同上 SFZ 规范页；"`count` 被定义时自动进入该模式" | **有** — 解析为 `oneShot`（`src/audio/sfz/instrument.ts:210-211`、`:252`），voice 靠 `onended` 判定自然结束（`src/audio/samplerVoice.ts:203-210`）；判据 `src/test/sfzOneShot.test.ts` | 无 |
| 3 | **`loop_mode=loop_continuous`** | 延音：按住就一直响，**释放后仍循环** | 到达循环点后循环直到 note 过期；**释放阶段也循环** | 同上；Kontakt 的对应项是 **Until End**（"the loop will keep playing during your amplitude envelope's release phase"），见 §Sources 的 KONTAKT 7.5 Manual — The Wave Editor, Loop Mode | **有** — `src/audio/sfz/instrument.ts:120-134`、`src/audio/samplerVoice.ts:124-133`、`:95`（`loop_sustain` 释放时关掉 loop，`loop_continuous` 不关） | 无 |
| 4 | **`loop_mode=loop_sustain`** | 延音：按住循环，**释放即退出循环** | 按住时循环；释放阶段不循环 | 同上；Kontakt 的对应项是 **Until Release**（"as long as the key is being held. When it's released, it will resume normal playback of the Sample, starting from the current playback position"） | **有** — 同 3；release 语义写在 `src/audio/samplerVoice.ts:185-201`，并有 sfizz 实测注记 | 无 |
| 5 | **`loop_start` / `loop_end`** | 指定循环区间 | **单位是采样帧**；`loop_start` 默认 0，`loop_end` 默认采样末帧 | [sfzformat.com/opcodes/loop_end](https://sfzformat.com/opcodes/loop_end/)（"in samples"）；`loop_start` 同页 | **有** — 帧值解析（只接受纯非负整数，`1.5`/`12abc` 一律拒绝：`src/audio/sfz/instrument.ts:143-153`）；帧→秒在 voice 端用**buffer 自己的采样率**换算（`src/audio/samplerVoice.ts:122-133`） | 无 |
| 6 | **`loop_count`** | 循环有限次后继续播采样尾部 | 整数；"`loop_count=3` 结果是循环段播 **4** 次而非 3 次"；循环播完后播循环点之后的素材 | [sfzformat.com/opcodes/loop_count](https://sfzformat.com/opcodes/loop_count/)（SFZ v2） | **没有** — 解析器不认识 `loop_count`（`src/audio/sfz/parse.ts` 的 opcode 子集见文件头 `:11-12`）；voice 只设 `source.loop`，无法表达"循环 N 次" | 小到中：解析一个整数 + 在 voice 里用 `AudioBufferSourceNode` 没有"循环计数"原语，要么改成自建重触发调度，要么只在**渲染**路径（离线）里循环 N 次拼接。对"弦乐要延音"这件事**不是必需的**（1/3/4 就够） |
| 7 | ⭐ **交叉淡化循环 crossfade loop**（`loop_crossfade`） | **短录音要延音**的经典答案：录音里没有干净的循环点，靠淡化把 loop 末尾混进 loop 开头，掩掉接缝的爆音与相位跳变 | `loop_crossfade` 是**秒**为单位的 SFZ v2 浮点 opcode；"在循环样本没有把 crossfade **烘焙进音频**时，用它给循环加交叉淡化"；sfizz 用正弦公式 `amp=(1-cos(pi*x))/2`，OpenMPT 用 `amp=x^0.75` | SFZ 规范 [sfzformat.com/opcodes/loop_crossfade](https://sfzformat.com/opcodes/loop_crossfade/)——**该页自己说"这个 opcode 在多数 SFZ 播放器里未实现，但 OpenMPT 和 sfizz 里有"**；sfizz 支持表 loop_crossfade 打✔（[sfztools opcodes 支持表](https://sfztools.github.io/sfizz/development/status/opcodes/)） | **没有** — `loop_crossfade` 在 `src` 里 0 处出现（全仓 grep `loop_crossfade`/`xfade` 只命中延迟总线的分块交叉淡化与 i18n，与采样循环无关） | **大**：`AudioBufferSourceNode` 只提供 `loop`/`loopStart`/`loopEnd`，**没有** 交叉淡化参数。真做需要自己用两个 source + gain 包络拼循环，或改走 AudioWorklet 在回调里做读指针与淡化。这是本表里**最贵的一项**，也是"未经处理的短录音变延音"的唯一正道 |
| 8 | **crossfade loop 的另一种做法：在采样编辑器里烘焙（destructive）** | 同上，但把淡化**写进音频** | 把 loop 起点之前的一段混入 loop 末尾 | Sound Forge Pro 的 **Crossfade Loop** 命令：*"Mixing sound occurring before the loop start point into the end of the loop can make the transition from the end to the beginning of the loop much smoother"*，并有 Sustaining / Release 两种 loop、Pre/Post-Loop 两个滑块（[Boris FX Sound Forge 文档](https://cdn.borisfx.com/borisfx/Documentation/soundforge/2026/en/content/proonly/crossfade_loop.htm)） | **没有** — 不是我们**代码**能做的事：这要求**改动/再生成采样字节**。本项目镜像的是上游库的原始字节 | **代价在内容侧，不在代码侧**：要么等待一个自带循环点的库（例如已镜像的 `karoryfer-meatbass` 写了 `loop_mode=loop_sustain`，见 `src/audio/sfz/instrument.ts:41-42`），要么自己产出一套带循环点的弦乐录音。**代码这边我们已经能播它们** |
| 9 | **player 端交叉淡化循环（非破坏性）** | 同上，但在播放时做 | 播放器在 loop 边界按曲线交叉读 | **Decent Sampler** 的 `loopCrossfade`（**帧**为单位）+ `loopCrossfadeMode`（`linear` / `equal_power`，默认 `equal_power`）：*"instead of simply looping at a specific end point, a portion of the audio from before the loop point is faded in just as the audio from the end of the loop is faded out. In this way, smooth audio loops can be achieved on samples that weren't specifically prepared as looping."*（[Decent Sampler 开发者指南 · 循环段](https://decentsampler-developers-guide.readthedocs.io/en/stable/_sources/the-groups-element.md.txt)） | **没有**，同 7 | 同 7 |
| 10 | **Kontakt 的 X-Fade（loop 交叉淡化）** | 同 7/9，商业采样器里的对应功能 | 循环编辑器里的 **X-Fade** 数值，**毫秒**为单位；波形图上以斜线标出 | KONTAKT 7.5 Manual, The Wave Editor, 循环参数：*"To mask imperfect loop points, KONTAKT can fade the end of the loop region into its beginning. This value adjusts the length of this crossfade in milliseconds."* | 同 7 | 同 7 |
| 11 | ⭐ **"库里没有循环点"时的专业做法** | 采样本身不适合作延音 | 见 §3 的四条分岔 | 见 §3 | 见 §3 | 见 §3 |
| 12 | **`trigger=release` / release samples / release trigger** | 换音/换和弦时，**前一支音**要有它自己的释放声（弓离弦、踏板抬起、房间尾巴），而不是被硬切 | note-off 时触发**另一组采样**；可与保持时长挂钩（按得久则释放音轻一点） | SFZ 规范 [sustain_note_basics](https://sfzformat.com/tutorials/sustained_note_basics/) + `trigger`/`rt_decay`（opcode 表）；**Kontakt** 的 **Release Trigger**：*"samples in this Group will be triggered when a MIDI note-off command is received … you can recreate the natural release sound of an instrument, such as the damper on a harpsichord or a reverb trail"*，并有 **T (Time)** 按保持时长调制释放音量、**Note Mono** 让重复音的释放音互相打断（KONTAKT 7.5 Manual, The Group Editor, Sampler mode）；**Orchestral Tools**：`Releases` 开关，"If it is off (or if no dedicated release samples exist), **a release fade at the end of the sample will be used**"（[Articulation Options](https://orchestraltools.helpscoutdocs.com/article/302-articulation-options)） | **没有** — 解析器不读 `trigger`；`src/audio/sfz/parse.ts` 的 opcode 子集里没有它；`resolveInstrumentNote` 也只输出 `oneShot`/`loopMode`/`group`/`offBy` 等，没有释放采样字段（`src/audio/sfz/instrument.ts:242-263`） | 中：解析 `trigger=release` 并按区域分组发声；调度器要在 note-off 时**再起一支** voice。**对我们当前两个缺陷不是必需的**（我们缺的不是释放声，是延音与连接） |
| 13 | **`note-off` 的 release 时间（ampeg_release）** | 前一支音**淡出而不被硬切** | note-off 后按包络释放 | SFZ 规范 [sustain_note_basics](https://sfzformat.com/tutorials/sustained_note_basics/)：*"The samples will play as long as a note is held, but when the note is released, they will end suddenly … We'll need to apply a volume envelope with a release time set"*；sfzformat 的 legato 教程再次强调 off_by 若不带 off_mode/ampeg_release 会"来得极快，在过渡中留下可闻的电平下陷" | **部分** — 我们有 `fadeOut()`（约 50 ms，`src/audio/samplerVoice.ts:48-51`、`:172-184`），但它**只用于 choke**（`off_by`），不是通用的 note-off 释放；`stop()` 是硬停（`src/audio/samplerVoice.ts:185-201`）。**没有**包络式的 note-off 释放时间 | 中：把"note-off"从 `source.stop(when)` 改成 gain 包络 ramp 后再 stop；需要知道每个采样的 `ampeg_release` 或接受一个统一默认值。**这与缺陷 A 直接相关** |
| 14 | ⭐ **SFZ 的 legato 机制（`trigger=first` / `trigger=legato` + `offset` 跳过起音 + `ampeg_attack`）** | 换音时用**另一支采样**做连接，并**跳过它的 attack** | `trigger=legato` 的分区只在"已有音在响"时触发；用 `offset` 跳过采样开头（换弓/换音的那一下），用 `ampeg_attack` 让它淡入；用 `off_by`+`off_mode`+`ampeg_release` 让旧音淡出 | SFZ 规范 [tutorials/legato](https://sfzformat.com/tutorials/legato/)："**Legato regions** … it can make sense to use the `offset` opcode to skip the start of the sample for legato regions … also probably a good idea to use offset_attack in these cases, which both makes the transition sound smoother and avoids clicks and pops"，并给出 Hadziha 人声的具体数值（`offset=6000`、`off_mode=time`、`off_time=1`、`ampeg_attack=0.4`） | **没有** — 不读 `trigger`；"跳过起音"= `offset`，解析器里有 `offset` 吗？——**没有**（`src/audio/sfz/parse.ts:11-12` 的清单里没有 `offset`；`samplerVoice` 的 `start()` 一律从 0 开始，`src/audio/samplerVoice.ts:160-164`） | 中到大：解析 `trigger`/`offset` + 调度器要知道"上一个音还在响" + voice 要支持从帧偏移起播。**注意**：这套要成立，**库里得有录好的 legato 转接采样**；VSCO-2-CE 的 14 个持续音程序没有（`src/test/ownerProjectAcceptance.test.ts:170-178`） |
| 15 | ⭐ **真 legato 的采样组织：按音程选转接采样（`sw_previous`）** | 上/下行到某个音，用**真实录下的那段转接** | `sw_previous=<上一个音>` 让同一 target 音按来源音选不同采样；转接采样可以只是**短的一段**，之后淡入常规延音 | SFZ 规范 [tutorials/legato](https://sfzformat.com/tutorials/legato/) 的 "True sampled legato" 一节：`<region> sample=legatovib_g4_a4.wav key=A4 sw_previous=G4`；并说"录下每个转接后的完整延音会极大增加录音时间、磁盘和内存，所以可以只用短的转接采样，**然后淡入常规延音采样**"；也说明不必每个音程都录（例如只录一个八度内），缺的音程可用移调近似或 Melodyne/reTune 补 | **没有** — `sw_previous` 不在解析子集里；`roundRobinPick`/`regionsForNote` 只看音高与力度（`src/audio/sfz/parse.ts:429-444`、`:456-462`） | **代价几乎全在内容侧**：转接采样我们没有；代码侧需要解析 `sw_previous` 并维护"上一个音"的状态 |
| 16 | ⭐ **Kontakt 的 Legato：把播放位置**带过去**，不重播 attack** | 已在响的采样**继续**，只是换音高——从根上消除"重新起音" | Time Machine **Legato** 按钮：*"If this button is activated and you play multiple notes in a legato fashion, KONTAKT will carry its current playback position over to each following note, rather than playing each Sample from the beginning."* | KONTAKT 7.5 Manual, The Source Module, Time Machine | **没有** — 我们的每条 note 都是一支独立的 `AudioBufferSourceNode`，每次 `start(when, 0, …)`；不存在"把播放位置带到下一个音"的概念（`src/audio/samplerVoice.ts:160-164`） | **很大**：这要求一个**持久的读指针**（AudioWorklet 或自建 buffer 播放器），而不是每条 note 一个 Web Audio 节点。属于架构级，不是补丁级 |
| 17 | ⭐ **Kontakt 的 Glide/portamento** | 换音高时滑过去而不是跳 | Glide 模块作为**调制源**驱动音高；"adds a sliding transition between the pitches of two consecutive notes when they are played in a legato fashion"；"while using this facility with polyphonic Instruments certainly works, the effect is usually associated with monophonic Instruments" | KONTAKT 7.5 Manual, The Source Module, Glide | **没有**（对弦乐而言也不该要：弦乐换和弦不是滑音） | — |
| 18 | ⭐ **legato 开启后声部变单音（monophonic）** | 保证"前一音让位给后一音"而不是叠加 | 打开 Legato 后该 articulation 变为单音 | **Orchestral Tools**：*"When Legato is enabled, articulations will be monophonic."*（[Legato Handling](https://orchestraltools.helpscoutdocs.com/article/324-legato-handling)、[Articulation Options](https://orchestraltools.helpscoutdocs.com/article/302-articulation-options)） | **没有** — 我们**刻意**是多音的（`legatoGapsFor` 正是把"重叠"当作写得好，`src/data/legatoGaps.ts:11-13`）。⚠️ **这里有一个真正的取舍**：弦乐**和弦**需要三支音同时换，mono legato 会把它压成一支，所以专业弦乐库里"poly legato"是单独一件事 | 需要区分 **mono legato**（单声部线条）与 **poly legato**（和弦换和弦）。业主的工程是**和弦**，所以是 poly 那一类 |
| 19 | **poly legato / 和弦的 legato** | 和弦换和弦时，三支旧音与三支新音各自正确交接 | 同一套 legato 逻辑按"每个声部"分别处理，而不是整台乐器压成单音 | Kontakt 的用户脚本生态与厂商手册常把这两者分开讨论；**在 KONTAKT 7.5 官方手册中未找到 "poly legato" 的专节**（手册只在 Wave Editor/legato 按钮等语境下用 legato，`monophonic` 一词仅出现于效果器与 Glide 的说明）。相关官方口径见 Orchestral Tools 的 "Legato Handling" 与 Spitfire 的帮助页（[What is Legato in Virtual Instruments?](https://support.spitfireaudio.com/en/articles/11816088-what-is-legato-in-virtual-instruments)，页面正文由 JS 渲染，本次抓取只得到导航外壳 ⇒ **未找到可引用的正文**） | **没有** | **这就是缺陷 A 的正面答案**（§5） |
| 20 | ⭐ **旧音的尾 × 新音的体：交叉淡化（off_mode / off_time）** | 交接处不出现电平凹陷与爆音 | 被抢占的 voice 按给定时间淡出，新音同时淡入；两者的和保持平稳 | SFZ 规范 [sustain_note_basics](https://sfzformat.com/tutorials/sustained_note_basics/)：`off_mode=normal`（而非默认 `fast` 的硬切）+"This cuts off the note suddenly, creating a gap before the next note can reach full volume. That problem can be fixed by setting `off_mode` to normal, which will make the notes being muted **fade out gradually over the duration previously specified with the ampeg_release**"；sfzformat 的 legato 教程给出 `off_mode=time` + `off_time=1` 的显式"交叉淡化时间" | **部分**：我们有 `fadeOut()` 的 50 ms 线性 ramp（`src/audio/samplerVoice.ts:172-184`），说明里明确写了"**A choke is a fade, not a cut**"。但我们**没有任何"新旧交接"的淡化**——`off_by` 的 choke 是我们唯一的淡出路径，而且 sfizz 实测说这个 build 里 `off_mode` 的 `fast`/`normal`/缺失**没有差别**（`src/audio/samplerVoice.ts:57-59`） | 中：给 note 的调度加"重叠时把旧 voice 淡出、把新 voice 淡入"的规则。**这是最小可行方向 A 的骨架**（§5） |
| 21 | **KSP：`fade_in()` / `fade_out()`（voice 级、微秒）** | 脚本层面手动做交叉淡化与"自定义 All Sound Off" | `fade_out(<ID>, <fade-time>, <stop-voice>)` 对**单个 note event** 做淡出；`stop-voice=0` 表示淡完后 voice 仍在跑；`fade_in(<ID>, <fade-time>)` 对称 | KSP Reference Manual 7.3, Event Commands（`fade_out()` / `fade_in()`，含"Use the modwheel on held notes to create a stutter effect"与"custom All Sound Off"两个官方例子） | **没有**——我们的 `fadeOut()` 是 gain ramp + `source.stop`，等价于 `stop-voice=1`；没有"淡到 0 但保留 voice"的语义，也没有按 voice id 的 API 面 | 小：我们已经是"gain ramp 再 stop"，要做的是**让旧 voice 的 ramp 与新 voice 的起播共用一条时间线** |
| 22 | ⭐ **Kontakt 的 Release Trigger + Note Mono + T(ime)** | 释放声本身的管理（重复音只留一支释放声；按得越久释放声越轻） | `Note Mono`："playing a note repeatedly will cut off any previous release samples that are still sounding (if any), so that only one release sample will play at any time"；`T`："KONTAKT will count from that value backwards … then stop the timer and provide its current value as a modulation source when it receives the corresponding note-off" | KONTAKT 7.5 Manual, The Group Editor, Sampler mode | **没有**，同 12 | 同 12 |
| 23 | ⭐ **Round robin（`seq_length`/`seq_position`；Kontakt `Cycle Round Robin`）** | 重复音不"机关枪" | 同一音的多个变体按顺序（或随机）轮换 | SFZ opcode 表 `seq_length`/`seq_position`（"used together … to use samples as round robins"）；**Kontakt** `Cycle Round Robin`：*"All Groups that have this condition in their Group Start Options will be cycled in a round-robin fashion on each note"*，其动机被手册原文点名为 *"this eliminates the dreaded 'machine gun effect', which is a giveaway of sampled instruments"*（KONTAKT 7.5 Manual, The Group Editor, Group Start Options） | **有（顺序轮换）** — `roundRobinPick(regions, nth)`，`seq_length` 循环、`seq_position` 选取；`seq_length=1`（默认）就是"每个音都同一支"（`src/audio/sfz/parse.ts:452-462`；解析 `:321-322`；判据 `src/test/sfzParse.test.ts:152-155`） | **"我们有"到这里为止**：`nth` 是谁算出来的、跨 chord 怎么复位，本报告未核实（§6）。`lorand`/`hirand`（随机半层）**没有**——`docs/SAMPLE_LIBRARY_INTEGRATION.md` 已把"VSCO 的表情程序用了 `lorand`/`hirand` 而解析器不读"记为已知缺口 |
| 24 | ⭐ **velocity → layer（`lovel`/`hivel`；dynamic layers）** | 力度不同用不同的录音层 | 按 note 力度选区域 | SFZ opcode 表 `lovel`/`hivel`；**Orchestral Tools** 的 Dynamics 页把层叫 dynamic layers，并可 **XFade/Switch** 选择"淡入淡出穿层"还是"切换层"：*"This toggle determines whether the articulation will crossfade through its velocity layers or switch between them. The latter is especially useful for percussion instruments to avoid phasing between layers."* | **有** — `regionsForNote()` 用 `velocity >= region.lovel && velocity <= region.hivel` 过滤（`src/audio/sfz/parse.ts:429-444`；解析 `:315-316`）；判据 `src/test/orchestralCoverage.test.ts:35` 明说"**Every velocity layer is resolved, not just the loudest**" | 无（对层内 crossfade：**没有**） |
| 25 | ⭐ **CC 交叉淡化层（`xfin_loccN`/`xfin_hiccN`/`xfout_*`；modwheel dynamics）** | 按住一个音时**力度连续变化**（弦乐的表情） | 同一个音用多层采样，层之间按 CC 淡入淡出 | SFZ 规范 [sustain_note_basics](https://sfzformat.com/tutorials/sustained_note_basics/)：对 flute/violin 这类"可以在延音中改变力度"的乐器，用 `xfin_locc1`/`xfin_hicc1`/`xfout_locc1`/`xfout_hicc1` 按 CC1 做层间淡化，并设 `amp_veltrack=0`；**Orchestral Tools**：Dynamics 由 MIDI CC（默认 CC1）或 velocity 控制（`CC/Velocity Switch`） | **没有** — 全仓 grep `xfin_locc`/`xfout_locc`/`xfin_hicc` 在 `src` 里 0 处；我们只做**离散选层**，不做层内连续淡化 | 中：要同时起两层并给它们互补的 gain 包络；也要求库里有相邻力度层的录音（VSCO 的持续音弦乐有 `_v1`/`_v2` 一类分层，仓库里的观测见 `src/test/ownerProjectAcceptance.test.ts:183-191`：力度 50 取到 soft take `_v1`，takes 在 63 处分开） |
| 26 | **"没有相应录音时怎么补"（力度/表情）** | 库里没有那一层 | ——**未找到权威出处**。可引用的只有相邻事实：SFZ 规范说 `lorand`/`hirand` 可把一层随机劈半（[opcode 表](https://sfzformat.com/opcodes/?q=loop)），Orchestral Tools 说没有专用释放采样时**退回采样尾部的 release fade**（见 12）。"用合成或移调补一层"这类说法本次未找到厂商文档 | 我们**有**一个相关缺口已登记：`lorand`/`hirand` 不读（`docs/SAMPLE_LIBRARY_INTEGRATION.md`，`vsco2ce` 的 `needs`） | — |
| 27 | **调性插值/nearest 采样、按音区 stretch** | 音区之间没有采样 | 邻近采样移调覆盖（`lokey`/`hikey`/`pitch_keycenter`） | SFZ 规范 [sustain_note_basics](https://sfzformat.com/tutorials/sustained_note_basics/)（"Whether to use the D or E sample to cover the D# … is a judgment call"）；SFZ 规范 [legato](https://sfzformat.com/tutorials/legato/) 的 "Further True Legato Possibilities" 讲转接采样的音区扩展 | **有** — `lokey`/`hikey`/`pitch_keycenter` 与播放比率（`src/audio/sfz/parse.ts:26-34`；`regionPlayback.ts`）；判据见全程音高真值 `docs/PITCH_TRUTH.md` | 无 |

---

## 3. ⭐ "库里没有循环点"时，专业做法是什么（第 11 行的展开）

四条分岔，按"改动发生在哪一层"分。**前两条是内容层的，后两条是播放层的**：

1. **加循环点（采样编辑器，破坏性）** — 用 zero-crossing 对齐 loop 首尾，再用 **crossfade loop** 把接缝掩掉。
   Sound Forge 的原话见第 8 行；Kontakt 的 **X-Fade** 是同一件事在采样器内部做（第 10 行）。这是**最老、
   最普遍**的答案，也是"短录音要延音"的标准做法。
2. **换库 / 补录** — 用一个**自带循环点**的库。本项目里就有实例：`karoryfer-meatbass` 的
   `<global>` 写了 `loop_mode=loop_sustain`（`src/audio/sfz/instrument.ts:41-42`）。这不需要任何新代码。
3. **播放器端交叉淡化循环** — 第 7/9 行。SFZ 的 `loop_crossfade`、Decent Sampler 的 `loopCrossfade`。
   **注意这里有一个真实的可移植性事实**：sfzformat 自己在 `loop_crossfade` 页上写着"这个 opcode 在多数 SFZ
   播放器里未实现"，只有 OpenMPT 和 sfizz 有；sfizz 自己的支持表也把 `loop_crossfade` 打✔、
   把 `loop_tune`/`loop_type` 打✘（[sfizz 支持表](https://sfztools.github.io/sfizz/development/status/opcodes/)）。
   所以"写 `loop_crossfade` 就会有淡化的循环"**不是**可依赖的假设。
4. **重触发 + 叠层 / 合成延音 / 干脆不写那么长的音** — 这三条**本次没有找到权威厂商文档**作为机制描述
   （第 26 行的情形）。本次能找到的、方向相反的**官方**建议只有两条：Orchestral Tools 说延音"usually hold
   their timbre, in which case they are **always looped**"（[Sustains](https://orchestraltools.helpscoutdocs.com/article/101-sustains)），
   以及它提醒**不现实的超长音本身就是要避免的**：*"This allows for very long lines at … the expense of realism if
   unrealistically long notes are played which a real player would not be able to sustain before running out of breath.
   In this case, singing the line is the best way to make sure it is playable."*

**对我们的直接含义**：VSCO-2-CE 的弦乐**同时**缺循环点**和**缺 legato 转接采样。所以第 1/2/14/15 行这几条
"内容层"的答案，**不是我们改代码能得到的**；而第 3/7/9 行（播放器端淡化循环）是唯一能在**现有 VSCO 字节**上
把缺陷 B 减轻的路径，代价是第 7 行那一栏说的"大"。

---

## 4. ⚠️ 先搜本仓：哪些做法我们**已经**做了

**这一节是报告的防误读部分。** 上面主表里打"有"的，都不是缺失。

| 已经做了 | 在哪里 | 依据 |
|---|---|---|
| **SFZ 的 `loop_mode` 语义**（`no_loop` / `one_shot` / `loop_continuous` / `loop_sustain` 四值） | `src/audio/sfz/instrument.ts:107-134`（`loopModeOf`）、`:210-211`、`:253-254` | 代码在；判据 `src/test/sfzLoopPlayback.test.ts:206-244`（含"裸 `continuous`/`sustain` 不是合法值"这一 sfizz 实测结论）与 `src/test/sfzOneShot.test.ts` |
| **`loop_start`/`loop_end` 从 SFZ 到 `AudioBufferSourceNode` 的整条路** | 解析 `src/audio/sfz/instrument.ts:143-153`；帧→秒与设 `loop` `src/audio/samplerVoice.ts:122-133`；离线渲染同路 `src/audio/offlineAudioLanes.ts:361`、`src/audio/WavExporter.ts:1756-1768` | 代码在；判据 `src/test/sfzLoopPlayback.test.ts:248-368` |
| **`loop_sustain` 在 note-off 时退出循环** | `src/audio/samplerVoice.ts:185-201` | 代码在；注释里带 sfizz 实测（"renders 1.115 s"） |
| **`loop_mode=one_shot` 忽略 note-off** | `src/audio/sfz/instrument.ts:210-211`、`src/audio/samplerVoice.ts:203-210` | 代码在；判据 `src/test/sfzOneShot.test.ts`（含"one_shot 不能免疫 off_by choke"） |
| **`legatoGaps` 检测（把"写得不连"说出来）** | `src/data/legatoGaps.ts`（整文件；`legatoGapsFor` `:70-107`、`legatoGapNote` `:119-132`） | 代码在；判据 `src/test/legatoGaps.test.ts`。⚠️ 它**只报告，从不修改**（`:11-13`），而且它检测的是**写作层**的缝，**不是**播放层的重新起音——这正是缺陷 A 能躲过它的原因 |
| **velocity → layer** | `src/audio/sfz/parse.ts:315-316`（解析 `lovel`/`hivel`）、`:429-444`（按力度选区域） | 代码在；判据 `src/test/orchestralCoverage.test.ts:35` 明说每一层都要解析，不是只取最响一层 |
| **round robin（`seq_length`/`seq_position`，顺序轮换）** | `src/audio/sfz/regionPlayback.ts:39-43`（`nth` 入口）、`src/audio/sfz/parse.ts:321-322`、`:452-462`（`roundRobinPick`） | 代码在；判据 `src/test/sfzParse.test.ts:152-155` |
| **`off_by` choke，且是**淡化**而非硬切** | `src/audio/samplerVoice.ts:48-51`、`:172-184`；分组/offBy 解析 `src/audio/sfz/instrument.ts:208-209` | 代码在；注释带 sfizz 实测（"0.0500 → … → 0.0007 over fifty milliseconds"）。判据 `src/test/sfzChokeGroups.test.ts` |
| **`note_polyphony` 上限** | `src/audio/sfz/instrument.ts:220-222`、`:257` | 代码在；判据 `src/test/sfzNotePolyphony.test.ts` |
| **`amplitude_onccN` 线性增益** | `src/audio/sfz/instrument.ts:223-240` | 代码在；判据 `src/test/sfzAmplitudeOnCc.test.ts` |
| **默认音高不转调（`pitch_keycenter` 无默认 60）** | `src/audio/sfz/parse.ts:26-34` | 代码在；与 sfizz 对账过 |
| **`default_path` 按「答应该音的 region」取（VSCO 的 Windows 分隔符）** | `src/audio/sfz/instrument.ts:83-95`、`:269-291` | 代码在；`docs/SAMPLE_LIBRARY_INTEGRATION.md` 记录了"按文件第一条路径解析会让 64–131 个 region 指向不存在的文件" |
| **力度层的镜像完整性判据（每程序在 1/32/64/96/127 各解析一遍）** | `src/test/orchestralCoverage.test.ts` | `docs/SAMPLE_LIBRARY_INTEGRATION.md` 记载 |

### 4.1 ⚠️ 明确**没有**的（与缺陷 A/B 直接相关）

* **交叉淡化循环**：`loop_crossfade` 全仓 0 处（主表第 7 行）。
* **`loop_count`**：解析器不认（第 6 行）。
* **note-off 的包络式释放时间**：`stop()` 是硬停；唯一的 ramp 是 choke 用的 50 ms（第 13/20 行）。
* **legato 的任何形式**：`trigger=legato`/`offset`/`sw_previous`/播放位置延续，一条都没有（第 14/15/16/18/19 行）。
* **release samples**：不读 `trigger`（第 12 行）。
* **CC 层内交叉淡化（`xfin_*`/`xfout_*`）**：0 处（第 25 行）。
* **随机 round robin（`lorand`/`hirand`）**：不读（第 23/26 行；已在 `docs/SAMPLE_LIBRARY_INTEGRATION.md` 里登记为缺口）。

### 4.2 ⚠️ 一个容易把"已有"读成"缺失"的坑

`src/test/ownerProjectAcceptance.test.ts:170-178` 断言的是**业主工程的这些 region 没有声明循环**——
它是"这份内容没有循环点"的**实测记录**，**不是**"播放器不支持循环"。支持已经在
`src/test/sfzLoopPlayback.test.ts` 里。同理，`legatoGapsFor` 对这 20 个和弦**报告为空**，是"写作已经连了"的
证明，**不是**"检测器坏了"。

---

## 5. 针对 A 与 B 各一条**最小可行方向**（⚠️ 方向，不是已定方案）

> 两节都明确标注：**是否被"让 synth 角色能载真采样"那座桥挡住**。那座桥是**别人在做**，本报告只标注，不设计。

### 5.1 方向 A — 让**重叠**真的听起来是连接的

**方向（不是方案）：给调度器一条"新旧交接"的规则，而不是让每条 note 各自从头开始。**

最小可行的形状是三条，按代价从小到大：

1. **先只做"旧音不硬停"**：在今天**已经存在**的 0.5-beat 重叠上，把旧音的结束从 `stop()` 改成一次
   长于重叠的 gain 释放（现有 `fadeOut()` 的形状，`src/audio/samplerVoice.ts:172-184`，只是时长要按音符长度而非
   固定的 50 ms）。这一步**不碰采样、不碰内容**，直接对着缺陷 A 的机制（"持续弦乐被打断了一下"）。
   依据：SFZ 规范的 `off_mode=normal` + `ampeg_release` 与 `off_mode=time` + `off_time`（主表第 20 行）。
2. **再考虑"新音不起音"**：用 SFZ 的 `trigger=legato` + `offset`（主表第 14 行）——**但这要求库里有转接采样**，
   VSCO 的持续音程序没有（`src/test/ownerProjectAcceptance.test.ts:170-178`）。
3. **最后才是 Kontakt 式的"播放位置延续"**（主表第 16 行）——架构级。

⚠️ **是否被那座桥挡住**：**部分挡住，但不是全部。** 第 1 条落在**我们已经有的**采样播放路径上
（`src/audio/samplerVoice.ts` + `WavExporter` 的 note 调度），**不需要**那座桥。第 2、3 条要求"换音时还有
别的音在响"这个上下文，而**这条上下文在今天的合成器角色里根本不存在**——因为曲风角色走的是
`routingForRole()` 那张表（`src/data/gs1Patches.ts:796-801`），映射到的是物理模型/合成补丁，
真实采样字节只经"显式 sampler 轨的 `track.sample.assetId`"到达播放（`docs/OPEN_WORK.md:1128`）。
所以：**A 的第 1 步不被挡；A 的第 2、3 步被挡**——它们只有在"一个带 legato 采样的真实乐器能挂在曲风角色上"
之后才有意义。

### 5.2 方向 B — 让音**长过录音**时不消失

**方向（不是方案）：先分清"能让录音循环"和"录音里没有可循环的东西"这两件不同的事，然后只对前者动手。**

* 对**声明了循环点的库**（例如 `karoryfer-meatbass`，`src/audio/sfz/instrument.ts:41-42`），我们**已经能播**
  （`src/test/sfzLoopPlayback.test.ts`）。这类 B **今天就不成立**，不需要动。
* 对**没声明循环点的库**（VSCO 的弦乐），现实只有两条：
  * **（B-1）接受录音长度**，把"音比录音长"变成**作曲/内容层的约束**，而不是播放层的 bug。这和 Orchestral
    Tools 的官方提醒方向一致（"if you can sing it, most likely the player could play it in reality"，
    [Sustains](https://orchestraltools.helpscoutdocs.com/article/101-sustains)）。**代价为零，但我们无法
    阻止内容越过 11.697 s。**
  * **（B-2）播放器端交叉淡化循环**（主表第 7 行）：解析 `loop_crossfade` 并在 voice 层实现淡化循环。
    ⚠️ 即便做出来，**它也只是"淡化"，不是"更长的录音"**——它把一个干净的循环变成一个可接受的循环，
    对弦乐合奏的持续音往往够用，但它**不产生新的音乐内容**。
* **不建议**的方向（并且本次**未找到权威出处**支持它）：重触发叠层、合成延音替代。见 §3 第 4 条。

⚠️ **是否被那座桥挡住**：**B 不被挡，B 被"内容"挡住。** `loop_crossfade` 作用于**已经在播的采样字节**，
这条路今天就在跑（sampler 轨 + `src/audio/samplerVoice.ts`），不需要曲风角色的桥。真正挡住 B 的是：
**VSCO 的弦乐字节里没有循环点**，而 `loop_crossfade` 只能淡化一个**存在**的循环。所以 B-2 的诚实描述是
"让一个我们已经有循环点的库听起来更顺"，而它对**业主工程里这 14 个 VSCO 持续音程序没有作用**。

---

## 6. 判不了／未核实

**本报告明确不主张以下任何一项：**

1. **我没有听过任何声音。** 全文没有一句听感结论（"听起来断"、"更顺"、"像真的"都不在此报告里作为主张）。
   缺陷 A 与 B 是**委托任务里给出的实测事实**，本报告把它们当作输入引用，并标明来源是委托方，不是我。
2. **我没有在本仓做实测。** 没有跑渲染、没有跑 MCP、没有读 WAV、没有测 RMS 或基频。主表里"我们有/没有"
   的每一格都是**读代码**（`grep`/`read`）或**引用仓库里已存在的文档/判据**，不是运行结果。
3. **`nth`（round-robin 的计数）从哪里来、跨和弦如何复位** —— 未核实。`roundRobinPick` 的入参在
   `src/audio/sfz/regionPlayback.ts:39-43`，但调用方如何维护这个计数没有追到底。
4. **VSCO 的 14 个持续音程序在 owner 工程那 60 个音上，实际会不会跑到 11.697 s** —— 未核实（那需要渲染，
   属于另一条工作流）。本报告只引用仓库里已有的算术：8.5 beats @120bpm = 4.25 s < 11.697 s
   （`src/test/ownerProjectAcceptance.test.ts:181-196`）。
5. **Spitfire Audio 的 legato 帮助页正文** —— 抓取只得到导航外壳（正文由 JS 渲染），所以 Spitfire 的口径在
   本报告里**没有被引用为机制依据**。链接留作线索。
6. **Vienna Symphonic Library（VSL）的 legato / interval 官方文档** —— `https://www.vsl.co.at/manuals/synchron-player/`
   的 HTML 里 `data-ssr="false"`，正文由客户端渲染，本次**未能取到可引用的正文**。
   ⇒ **未找到权威出处**：本报告**不**描述 VSL 的 legato 与 interval 机制。（能找到的只有论坛讨论
   [vi-control "VSL Legato Question"](https://vi-control.net/community/threads/vsl-legato-question.28439/)，**帖子不是依据**。）
7. **Kontakt 的 "poly legato" 专节** —— KONTAKT 7.5 手册里搜不到这个术语的专门章节（`monophonic` 仅出现于
   效果器与 Glide 说明）。Kontakt 生态里"poly legato"通常由第三方脚本实现，本报告**不**把它当成 Kontakt 的
   官方特性。⇒ 该条**未找到权威出处**。
8. **Sforzando（ARIA）对 `loop_crossfade` 的支持** —— 官方指南 `sforzando_guide_1.621.pdf` 里 grep 不到
   `loop`/`crossfade` 的任何实质内容，**未找到权威出处**。可引用的只有 sfzformat 的
   `loop_crossfade` 页（"多数播放器未实现，OpenMPT 与 sfizz 有"）与 sfizz 自己的支持表。
9. **Kontakt 的 mono/poly legato 与"和弦换和弦"的声部管理细节** —— 手册只到 Legato 按钮与 Glide 为止，
   **未找到**关于"poly legato 下每个声部各自交接"的官方机制描述。
10. **"绕过录不到的音程"的权威说法** —— SFZ 的 legato 教程给了实践（移调近似、Melodyne/reTune 补录），
    但那是**社区教程站**（sfzformat.com 的 Tutorials 栏目），不是厂商手册。本报告如实标注它是教程而非规范。

---

## 7. 判据：本文件对门禁的影响（已实测）

只跑了要求的两个，没跑别的：

* `npm run check:docs:refs` —— **通过**。原因见文件头：`scripts/check_doc_refs.mjs:150-158` 的 `DOCS`
  由根目录 `*.md` + `docs/*.md` 组成，`readdirSync` 不递归，**`docs/research/` 不在扫描范围**。
  同目录下已有的 `docs/research/staff-notation-and-musicxml-survey.md` 也在同一范围之外，与该文件自己的
  说明一致（其第 10 行）。
* `npm run docs:check` —— **通过**。它的三条断言是：`BACKLOG.md` 头部版本号、`BACKLOG.md` 提到当前版本、
  以及用 `git ls-files` **追踪文件里没有冲突标记**（`scripts/check_docs.mjs:39-105`）。本文件不影响前两条；
  第三条在**提交后**才会看到本文件，所以本文件刻意不写任何冲突标记行——本文里出现的 `<`/`>` 都远少于
  七连字符。

**⚠️ 本报告没有、也不会**：改 `docs/OPEN_WORK.md`、改版本号、动 `src/mobile/**`、改任何播放/音频代码、
提交、推送。

---

## Sources

以**官方规范/厂商手册/厂商帮助页**为一级来源；社区教程与论坛帖只作线索，并在正文里标注。

* SFZ Format — [`loop_mode`](https://sfzformat.com/opcodes/loop_mode/)、[`loop_count`](https://sfzformat.com/opcodes/loop_count/)、[`loop_crossfade`](https://sfzformat.com/opcodes/loop_crossfade/)、[opcode 总表](https://sfzformat.com/opcodes/?v=2)
* SFZ Format Tutorials — [Sustained note basics](https://sfzformat.com/tutorials/sustained_note_basics/)（`ampeg_release`、`xfin_*`/`xfout_*`、`group`/`off_by`/`off_mode`）、[Legato](https://sfzformat.com/tutorials/legato/)（`trigger=first`/`legato`、`offset`、`sw_previous`、端口音）
  ——⚠️ Tutorials 栏目是**教程站**，不是规范正文；规范正文以 opcode 页为准。
* sfizz / SFZTools — [Opcodes Support Table](https://sfztools.github.io/sfizz/development/status/opcodes/)、[Quick Reference](https://sfztools.github.io/sfizz/quick_reference/)
* Native Instruments — KONTAKT 7.5 Manual (EN), `KONTAKT_7_5_Manual_en.pdf`：The Wave Editor（Loop Start/End/**X-Fade**/Count/**Loop Mode**: Until End / Until End ↔ / Until Release / Until Release ↔、Loop Edit），The Group Editor（Group Start Options 的 **Cycle Round Robin** / Cycle Random、"machine gun effect"，Sampler mode 的 **Release Trigger** / **T** / **Note Mono**），The Source Module（**Legato**、**Glide**）
* Native Instruments — KSP Reference Manual 7.3 (EN), `KSP_Reference_Manual_en_7_3.pdf`：Event Commands `fade_in()` / `fade_out()`、`change_note()`、`change_tune()`
* Decent Sampler — [The `<groups>` element（开发者指南）](https://decentsampler-developers-guide.readthedocs.io/en/stable/_sources/the-groups-element.md.txt)：`loopStart` / `loopEnd` / **`loopCrossfade`** / `loopCrossfadeMode`（`linear`/`equal_power`）、`trigger`（`attack`/`release`/`first`/`legato`/`continuous`）、`releaseTriggerDecay`、`seqMode`（`round_robin`/`random`/`true_random`/`always`）；[Loop 点的帧含义与 crossfade 用法（用户 Q&A）](https://www.decentsamples.com/qa/453/finding-the-best-loop-points?show=463#c463)
  ——⚠️ 后者是**用户问答**，只用于印证"帧"这一单位与"5% crossfade"的实践，不作机制依据。
* Orchestral Tools — [Sustains](https://orchestraltools.helpscoutdocs.com/article/101-sustains)（"always looped"、超长音的取舍）、[Legato Handling](https://orchestraltools.helpscoutdocs.com/article/324-legato-handling)、[Articulation Options](https://orchestraltools.helpscoutdocs.com/article/302-articulation-options)（Releases / XFade-Switch / RR / Dyn / Leg）
* Boris FX — Sound Forge Pro: [Crossfading Loops](https://cdn.borisfx.com/borisfx/Documentation/soundforge/2026/en/content/proonly/crossfade_loop.htm)
* Spitfire Audio Help Centre — [What is Legato in Virtual Instruments?](https://support.spitfireaudio.com/en/articles/11816088-what-is-legato-in-virtual-instruments)、[Legato Insights](https://support.spitfireaudio.com/en/articles/11815898-legato-insights-legendary-low-strings-and-sparkling-woodwinds) —— ⚠️ 正文由 JS 渲染，本次**未取得可引用的正文**，仅列为线索。
* VSL — `https://www.vsl.co.at/manuals/synchron-player/` —— ⚠️ 客户端渲染，**未取得可引用正文**；VSL 的 legato/interval 机制在本报告中**不作主张**。

**仓库内引用**（全部为 `origin/dev` @ `58da430`，即本报告所在的工作树）：

* `src/audio/sfz/instrument.ts`、`src/audio/sfz/parse.ts`、`src/audio/sfz/regionPlayback.ts`
* `src/audio/samplerVoice.ts`、`src/audio/sampleLoader.ts`、`src/audio/offlineAudioLanes.ts`、`src/audio/WavExporter.ts`
* `src/data/legatoGaps.ts`、`src/data/gs1Patches.ts`、`src/audio/gs1/textureSample.ts`
* `src/test/sfzLoopPlayback.test.ts`、`src/test/sfzOneShot.test.ts`、`src/test/legatoGaps.test.ts`、`src/test/ownerProjectAcceptance.test.ts`、`src/test/orchestralCoverage.test.ts`、`src/test/sfzParse.test.ts`、`src/test/sfzChokeGroups.test.ts`
* `docs/SAMPLE_LIBRARY_INTEGRATION.md`、`docs/OPEN_WORK.md`、`docs/PITCH_TRUTH.md`、`docs/research/staff-notation-and-musicxml-survey.md`
* `scripts/check_doc_refs.mjs`、`scripts/check_docs.mjs`
