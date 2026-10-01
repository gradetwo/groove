# 步进栅格与编排模型：对一份测试意见的逐条审计

**被审计的意见（2026-10-01，标题＋四条）**：**"步进栅格（Step Sequencer）对叙事性歌词旋律的表达断层"** ——声称 `steps` 强制 16 分切片、`MAX_NOTE_GATE_STEPS = 16` 卡死跨小节延音、`pitch`/`pitches` 双轨是包袱、时间线缺连续自动化。

**审计规矩** ✓：**每条给 file:line 或实测 ✓，不写"大概有" ✗**；**每条明确**成立／部分成立／不成立** ✓。

---

## §0 最重要的发现：**这里有两套模型，而意见只描述了其中表达力弱的那一套** ✗✓✓

| | **模式模型**（genre / pattern） | **编排模型**（arrangement） |
| --- | --- | --- |
| **类型** | `SequencerPattern`／`SequencerTrack`（`src/types/genre.ts:183`／`:49`） | `arrangementV2.ts`（`startBeats` `:90`、`lengthBeats` `:92`） |
| **时间** | **`steps` 数组，固定 16 分栅格** ✗ | **`startBeats`，节拍单位，注释明写 "fractional is allowed"** ✓✓ |
| **时值** | **`gate`，上限 `MAX_NOTE_GATE_STEPS = 16`（一小节）** ✗ | **`lengthBeats: positive()`，无上界** ✓✓ |
| **歌词** | **无** ✗ | **⭐ "A lyric is written on the note it is sung on, not in an array beside a grid"** ✓✓ |
| **MCP 面** | `set_arrangement_track_steps`（`mcp/registry.ts:1048`） | **`add_arrangement_note`（`:1067`）、`add_arrangement_notes`（`:927`）、`remove_…`（`:1095`）、`move_…`（`:1114`）** ✓ |

**⇒ 意见里要的"音节时值、附点、连音、跨小节延音、歌词轨高阶抽象"，在编排模型里**都是已有的** ✓✓**——**而意见描述的症状，是模式模型的特征 ✓**。**这本身就是一条发现：能力在，但**没被找到** ✓**（可发现性问题）。

---

## §1 "`steps` 强制 16 分切片，缺旋律轨抽象" —— **部分成立** ✗✓

* **对模式模型成立** ✓：`steps: number[]` 与 `SequencerTrack` 是固定栅格 ✓；`genre.ts:156` 的 `pitches` 也是逐步的 ✓；
* **对编排模型不成立** ✗✓✓：**`startBeats` 允许小数 ✓**、**`lengthBeats` 无上界 ✓**、**歌词挂在音符上 ✓**（`arrangementV2.ts:90/92/98` ✓）；
* **而钢琴卷帘的内部音符模型仍是步进的** ✗：`rollModel.ts:6-8` `RollStepNote { stepIdx: number; … }`，**身份就是 `${stepIdx}:${midi}`**（`:21` ✓）——**所以界面层确实是栅格思维 ✓**。

## §2 "`MAX_NOTE_GATE_STEPS = 16` 卡死跨小节延音" —— **对模式模型成立，对编排不成立** ✗✓

* **定义**：`src/types/genre.ts:47` `export const MAX_NOTE_GATE_STEPS = 16;` ✓；**其含义由 `genreExpression.ts:40` 自己写出**："**Notes may last up to a bar (``MAX_NOTE_GATE_STEPS``): a pad or a whole-bar chord…**" ✓；
* **使用者至少 6 处**：`genreExpression.ts`（`:3542`／`:3554`／`:3571`）、`rollModel.ts`（`:180`／`:282`／`:702`／`:720`／`:753`／`:918`／`:1188`）、`AudioEngine.ts:2139`、`MidiExporter.ts:167`、`AbletonExporter.ts:203`、`SequencerUrlShare.ts:299` ✓；
* **编排侧无此上限** ✓：**`lengthBeats` 只要求正数**（`mcp/registry.ts:1067` 起的 schema ✓）。

## §3 "`pitch` 与 `pitches` 双轨是历史包袱" —— **成立，但包袱是两个字段**并存**，不是某个字段** ✓

**写入者（非测试）** ✓：
* `pitch`：**`MidiImporter.ts:411-412`** ✓、**`LiveRecorder.ts:84-85`** ✓、**`InspireMe.ts:40/153-172`** ✓、**`SequencerUrlShare.ts:72/295`** ✓、`SequencerModals.tsx:112`（写 `pitches`）✓；
**读取者（非测试）** ✓：
* `pitch`：`samplerSteps.ts:88` ✓、`MidiExporter.ts:141` ✓、`AbletonExporter.ts:177` ✓；
* `pitches`：**`chordVoicing.ts:381/387`** ✓、**`offlineAudioLanes.ts:181`** ✓、`MidiExporter.ts:188` ✓、`AbletonExporter.ts:222` ✓；
* **导出的优先级写法**：**先看 `pitch`、再看 `pitches` 的栈**（`MidiExporter.ts:169-170` ＋ `:188` ✓、`AbletonExporter.ts:206-207` ＋ `:222` ✓）——**即意见说的"覆盖优先级"** ✓。

**⇒ 结论** ✓✓：**`pitch` 不是死字段（四个写入者 ✓），`pitches` 也不是（和弦栈 ✓）**；**要抛的是"两个字段并存"** ✓——**方向是**退役 `pitch`**（`pitches` 能表达单音 ✓），**但要**在读侧接住旧数据**（分享链接 `p` ✓、旧工程 JSON ✓）✓**。

## §4 "时间线缺连续自动化包络" —— **部分不成立** ✗✓✓

**模型里已经有连续、随时间变化的参数** ✓✓：

```ts
src/types/song.ts:36   export const RISER_VELOCITY_RAMP: [number, number] = [48, 120];
src/types/song.ts:52   velocityRamp?: [number, number];   // 乐章级
src/types/song.ts:73   velocityRamp?: [number, number];   // 小节级
src/types/song.ts:191  "The ramp is folded in here rather than carried alongside, so every consumer that already honours…"
```

**另有** `song.ts:124` 的 `MOD_SOURCES` 已含 `"lfo"` ✓。

**⇒ 所以准确的说法是** ✓✓：**斜坡这个机制已经在 ✓，只是**只覆盖 velocity、只到小节粒度** ✗**——**缺的是覆盖面（滤波截止 ✓、混响湿声 ✓），不是机制 ✓**。**这把工程量从"从零造一套自动化"变成"把已有模式铺到更多参数" ✓✓**。

---

## §5 由审计得出的行动顺序（按"影响 × 可判定"排）

1. **⭐ 先解决可发现性** ✓✓：**编排模型已经能表达这份意见要的一切 ✓，而意见的作者不知道它存在 ✗**——**这是最便宜、收益最大的一步 ✓**（**文档 + MCP 工具描述里把"写旋律用 `add_arrangement_note`，不要用 `set_arrangement_track_steps`"说清 ✓**）；
2. **门限上限** ✓：**它是模式模型的限制 ✓**——**要么抬高（并说明渲染后果 ✓），要么明确"长音请用编排模型"** ✓；
3. **`pitch` 退役** ✓：**方向明确（留 `pitches` ✓），代价是 5 个写入侧 + 一个读侧兼容 ✓**——**兼容是"抛掉"与"砸掉"的区别 ✓**；
4. **自动化铺开** ✓：**沿 `velocityRamp` 已有的模式 ✓，先做**一个**参数（滤波截止 ✓）作为样板 ✓✓**——**因为它最接近意见举的那个例子 ✓**。

### §3.1 `pitch` 退役的真实代价：**734 处**（2026-10-01 实测）

**量法**（可逆 ✓）：**把 `SequencerTrack.pitch` 从 `src/types/genre.ts:135` 临时拿掉 ✓，让编译器枚举 ✓，再还原 ✓**。**grep 不行** ✗——**`\.pitch` 会同时命中 `NoteEvent.pitch`（编排的单数音高 ✓，那个该留着 ✓）**，**只有类型系统分得清"哪个对象的 `pitch`"** ✓✓。

**结果：734 个编译错误** ✓。**按文件**：

| 文件 | 处数 | 性质 |
| --- | --- | --- |
| `src/data/genres/rock_metal.ts`／`house.ts`／`jazz_blues.ts`／`pop_rnb.ts`／`future_downtempo.ts`／`hard_electro.ts`／`latin_world.ts`／`hiphop.ts`／`techno.ts`／`trance.ts`／`dubstep.ts`／`dnb.ts` … | **13 个文件共约 450+ 处**（每个 27–51） | **项目自己编的流派库 —— 是**源码**，不是用户数据** ✓ |
| `mcp/pattern.ts` | 27 | 模式模型的构造与校验 |
| `mcp/registry.ts` | — | **调用者可见的工具 schema** |
| `src/test/rollModel.test.ts` 等 | 37+ | 判据 |
| 钢琴卷帘／store／`MidiImporter`／`LiveRecorder`／`InspireMe`／`SequencerUrlShare` | 各若干 | 读写两侧 |

**⇒ 结论（并据此改计划）** ✓✓：

* **734 处不是"便宜"** ✗，**而其中大头在**作者手写的音乐数据**里 ✓**——**机械，但量极大，且要重跑那 13 个流派的所有判据 ✓**；
* **⚠️ 而另一点更重要**：**这条退役**解决的痛，是报告里说的**认知负担** ✓（**调用者看到两个字段 ✓**）——**而那个痛可以用便宜得多的办法消掉 ✓✓**；
* **⇒ 因此**不退役字段**** ✗✓，**改做两件成本近零的事** ✓✓：
  1. **把两者的角色写死** ✓：**`pitch` 是这一步的**根音** ✓、`pitches` 是**和弦叠层** ✓（**后者存在即优先 ✓，已由 `genre.ts` 自己写明 ✓**）；
  2. **在 MCP 的工具 schema 描述里把这条说给调用者** ✓✓——**因为报告人的痛本来就在那里 ✓**，**而一个字段名说明白的成本是零 ✓**。

**⇒ 记在这里而不是悄悄放弃** ✓：**"该抛就抛"是对的 ✓，但抛之前要知道它有多重 ✓——734 处，而它要换来的那点收益有更便宜的拿法 ✓✓。**

---

## §2.1 ⭐⭐ 业主要求：**如果 Sequencer 老的设计限制 arrangement，就抛弃老的** —— 实测确有两条（2026-10-01）

**业原话** ✓："**之前很多设计都是 Sequencer 视角，现在我们是 arrangement 视角，如果这两个矛盾或者 Sequencer 老的一些设计影响或者限制 arrangement，那么就果断抛弃老的。**" ✓✓

**⇒ 而这条不是口号，它点到了两条实测存在的限制** ✓✓：

### 限制一：**投影只留起点与一个音高，时值靠 `gate`，而 `gate` 只给 sampler 轨** ✗✓✓

* **`src/data/noteEvents.ts:66-77` `stepsFromNotes`** ✓：**产出 `steps`（0/1）与 `pitches`（每列一个音高 ✓）——`lengthBeats` **根本不进去**** ✗**；**它自己的注释（`:100-102`）写着**："**Notes beyond `stepCount` are ignored here … they are a **length problem**, not a collapse**"** ✓**——作者知道时值是这条投影的牺牲品 ✓**；
* **`src/data/arrangementCompile.ts:160-166`** ✓：**时值被救进 `gate`** ✓（`:178-180` `note.lengthBeats / STEP_BEATS` → `gate[step]` ✓）——**但同一段注释写明**："**Only the sampler lane is given a gate**" ✗✓✓，**并描述了后果**："**a note the arrangement holds for a beat came out an eighth of that**" ✓✓；
* **⇒ 所以今天：arrangement 上一个长音，在**sampler 轨**上能活到 `gate` ✓，在**合成器轨**上则丢掉时值 ✗**——**同一个模型，两种命运 ✓**。

### 限制二：**`MAX_NOTE_GATE_STEPS = 16` 再把 `gate` 砍到一小节** ✗✓✓

* **`src/types/genre.ts:47` = 16** ✓；**`src/audio/AudioEngine.ts:2139`** `Math.max(0.05, Math.min(MAX_NOTE_GATE_STEPS, durationSeconds / stepDur))` ✓；**`src/features/sequencer/rollModel.ts:282`** `Math.min(MAX_NOTE_GATE_STEPS, gate)` ✓——**两处都在**消费端**裁剪 ✓**；
* **⇒ 即使 `gate` 拿到了 4 小节的值，它也会在渲染前被压回 1 小节 ✓**——**这与第一份意见第 2 条的观察完全一致 ✓**。

### 因此**计划改了** ✓✓

**第 2 条此前被我定位为"栅格模型的有意限制，写清即可"** ✗——**按业主这条指示，它应当被拆掉** ✓✓：**它不是"栅格自己的规矩"，而是**老模型对新模型的限制** ✓**（**新的模型有 `lengthBeats`，而渲染链里有三处把长度当成"步的属性"处理 ✗**）。

**拆法的第一步（可判、且不猜）** ✓✓：**把三处 `MAX_NOTE_GATE_STEPS` 的使用分成两类** ✓——**哪些是**栅格自己的编辑上限**（钢琴卷帘的拖拽手感 ✓）、哪些是**渲染的硬上限**（`AudioEngine` ✓）**——**前者留着 ✓，后者对**来自 arrangement 的音符**放开 ✓✓**。**判据**：**一个 4 小节的音，经 arrangement 渲染后必须仍然是 4 小节** ✓（**今天它在合成器轨上丢时值 ✗、在 sampler 轨上被裁到 1 小节 ✗**）。

### §2.2 ⚠️ **更正**：§2.1 里我说的两处裁剪，位置是错的（2026-10-01）

§2.1 写的时候我说"**`AudioEngine.ts:2139` 会在渲染前把 arrangement 的音裁到一小节**" ✗，**并据此把渲染链当成了限制所在** ✗。**两处都不对，以下是实测的更正** ✓✓：

* **`AudioEngine.ts:2139` 属于 `previewChord`** ✓——**那是钢琴卷帘的**和弦试听** ✓**（**它自己的注释写着 "the piano roll uses its own step length … so the audition matches the bar length it is previewing"** ✓），**与离线渲染无关 ✗**；
* **而离线渲染链**从不裁 gate** ✓✓**：`src/audio/WavExporter.ts:1387` 是 **`const gateVal = track.gate?.[stepIdx] ?? 0.8`** ✓——**原样读取，没有 `Math.min(MAX_NOTE_GATE_STEPS, …)`** ✓；**`:1485`／`:1508`／`:1578` 直接拿它算时长 ✓**。

**⇒ 所以 `MAX_NOTE_GATE_STEPS` 的真实用处分五类，**没有一类在离线渲染里**** ✓：

| 用途 | 出处 | 该不该管 arrangement |
| --- | --- | --- |
| 钢琴卷帘的编辑范围 | `rollModel.ts:282` 等 ✓ | **不 —— 那是栅格自己的手感 ✓** |
| 流派库的编写规则 | `genreExpression.ts:3542/3554/3571` ✓ | **不 —— 那是栅格数据 ✓** |
| 分享链接的序列化 | `SequencerUrlShare.ts:299` ✓ | **不 —— 栅格格式 ✓** |
| 和弦试听 | `AudioEngine.ts:2139` ✓ | **不 —— 是试听 ✓** |
| **⭐ 两个导出器** | **`MidiExporter.ts:167`、`AbletonExporter.ts:203`** ✓ | **是 —— 它会**改变导出的音乐** ✗✓** |

**⇒ 因此真正的"老设计限制新设计"只有一处，就是导出** ✓✓：**一个 4 小节的 Pad 在 WAV 里是 4 小节 ✓（上一轮的编译改动已修 ✓），而导出 MIDI/Ableton 时会被压回 1 小节 ✗**——**那正是"导出与刚才试听的文件不一致"这类失败 ✓**。

**⇒ 已处理** ✓✓：**两个导出器的**上限去掉** ✓、**下界 `Math.max(0.1, …)` 保留** ✓**（**零 gate 是退化音符，不是长音符 ✓**）。**判据走**往返** ✓：`generateMidiBytes` → `fromMidi` ✓——**`gate: 64` 步（4 小节）必须回来 `lengthBeats: 16`** ✓✓。**把上限放回去，它会红成 `expected 4 to be close to 16`** ✓（**正是那个 4 倍丢失 ✓**）。

**⚠️ 而这条判据的第一版我自己写错了** ✗✓：**我把 `lengthBeats`（拍 ✓）当成了小节，于是期望 4 而实际 1** ✓。**探针把三个数打出来之后才看清：`gate: 4 → 1 拍 ✓、16 → 4 拍 ✓、64 → 16 拍 ✓`——导出器读什么写什么 ✓，单位也对 ✓，错的是我的换算 ✓✓。**
