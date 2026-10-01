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
