# GROOVE LAB 产品改进规划 v2.1.0

> **本轮目的**：回答用户的两个直接诉求 ——
> ① 钢琴卷帘试听和弦"声音不正常"，且需要"对当前谱子单独播放"的能力；
> ② 先查清现有代码到底有哪些问题，给出详细改进计划，核心是**上手容易、音质好听、每个曲风更接近真实听感**。
>
> **基线**：分支 `next`，HEAD `ac4656a`（v2.0.46 已提交），工作区有 21 个文件已修改 + 1 个未跟踪文件，属于在飞的 v2.0.48。
> `src/` 380 个 TS/TSX 文件、195,053 行。
>
> **证据等级标记**（本文所有结论都带标记，请按标记采信）：
> - **[已复现]** —— 我在本机跑代码/探针实测到的事实（附命令与输出）；
> - **[已核对]** —— 逐行读了代码，逻辑链完整可复核（附 `file:line`）；
> - **[静态推断]** —— 读代码得出的合理结论，但没有运行时验证；
> - **[未验证]** —— 需要人耳、真机或浏览器才能判定，本文只登记不做结论。
>
> **一条必须说清的边界**：音频质量的最终判据是**耳朵**，而本机没有浏览器听感环境。
> 因此 §2 的所有音质结论都是"从代码结构推断的差距"（波形、包络、路由、增益结构），
> 不是"我听过觉得不好"。凡属主观听感的地方我都标了 [未验证]，并在 §8 给出**必须先建听感基线**的规定动作。

---

## 0. 摘要

### 0.1 一句话结论

**这套代码的"工程纪律"相当高（195k 行、1690 个单测全绿、typecheck 零错误、真·Playwright 7 端 e2e、真峰值前瞻限幅器、逐曲风实测响度配平到 0.32 LU），但"产品体验"有系统性断层：
音色引擎的地基是"两个振荡器 + 一个低通"这一张模板（51 个预设共用），鼓组 100% 合成且关键频率写死，响度目标是"159 个曲风互相对齐"而不是"对齐真实唱片"，而钢琴卷帘的试听走了一条**与音序器完全不同的发声路径**——这才是"试听和弦声音不正常"的根因。**

换句话说：不是某处写错了，而是**三处"看起来对、听起来不对"的结构性选择**：预设模板天花板、鼓组合成天花板、试听路径与播放路径不一致。

### 0.2 本轮最该先做的 12 件事（按 收益 ÷ 成本 排序）

| # | 事项 | 类别 | 证据 | 规模 |
|---|---|---|---|---|
| 1 | **钢琴卷帘试听和弦被"再和声化"** —— 试听 4 个音实际发出 24 个振荡器（每个音又被配成一副三/七和弦） | 音质·功能 | [已复现] §1.1 | S |
| 2 | **钢琴卷帘需要"单独播放当前谱子"** —— 现在只有全局走带，无隔离试听 | 功能 | [已核对] §1.2 | M |
| 3 | **`SET_STEP_COUNT` 数组增长被截断，128 步只有 32 步有数据** —— 选 64/128 后大半格子是死的，导出也大半是静音 | 正确性·数据 | [已复现] §2.1 | S |
| 4 | **版本清单漂移且本地门禁不生效** —— 包里 2.0.48、代码里 2.0.47，`version:check`/`docs:check` 都红且不在 `verify` 里；`sw.js` 字节不变 → 已安装 PWA 永远不更新 | 工程化 | [已复现] §5.1 | S |
| 5 | **加载工程后残留一条假撤销点，Ctrl+Z 会用上一个工程覆盖刚打开的工程，且被自动保存写回** | 数据丢失 | [已核对] §2.2 | S |
| 6 | **持久化快照是无校验强转** —— 缺 `patterns.B` 直接在 reducer 初始化里抛异常，工作室打不开且坏快照永不清除 | 正确性 | [已核对] §2.3 | S/M |
| 7 | **开镲 choke 是"阶跃"而不是"淡出"** —— 每一次"闭镲切前一个开镲"都有咔哒 + 电平跳变 | 音质 | [已核对] §3.2 | S |
| 8 | **51/159 个曲风的军鼓轨声明了 `clap`/`rimshot`，引擎完全忽略** —— 房子/嘻哈/回响贝斯的军鼓不是数据里写的那个 | 音质·真实性 | [已核对] §3.2 | S |
| 9 | **踩镲/底鼓音色过于单一** —— 4 套鼓里有 3 套的踩镲是"一段噪声 + 高通"；底鼓无饱和级 | 音质·真实性 | [已核对] §3.2 | M |
| 10 | **响度目标是 −15.7 LUFS，比真实唱片安静 6–9 dB，且 124/159 曲风已经顶在限幅器上（另一半却有 10 dB 空余）** | 音质·听感 | [已核对] §3.3 | M |
| 11 | **上手路径缺失** —— 工具栏三层分级表 `toolbarTiers.ts` 只被测试引用、从未接入渲染；密度设置 `layout.density` 没有任何消费者；教程教练没有任何 DOM 定位 | 上手 | [已核对] §4.1 | M/L |
| 12 | **点击"工作室"标签会静默把曲风重置成默认** —— `genreId: undefined` 覆盖路由 → 回落 `chicago-house` → `SET_GENRE` 换掉两个 pattern 槽 | 正确性·数据 | [已核对] §2.4 | S |

### 0.3 五个工作包与建议排期

| 工作包 | 内容 | 建议版本 | 规模 |
|---|---|---|---|
| **P0 止血** | §2 的 6 项正确性/数据缺陷（含版本门禁与卷帘试听根因修复） | v2.1.0 | 3–4 人日 |
| **P1 卷帘隔离播放** | §1.2 的"单独播放当前谱子" + 统一的试听发声路径 + 卷帘内走带 UI | v2.1.0 | 3–5 人日 |
| **P2 音质** | §3 的 Tier-1 快速项（choke / 军鼓路由 / 踩镲金属簇 / 底鼓音高 / 包络 / 过零） | v2.1.1 | 4–6 人日 |
| **P3 上手** | §4 的工具栏分级真正接入、首屏单一动作、密度设置落地、教练可定位 | v2.1.2 | 6–9 人日 |
| **P4 接近唱片** | §3.3–§3.5 的结构性工作（波表/齐奏/键盘跟踪、鼓组采样层与轮转、响度目标与总线） | v2.2.x | 15–25 人日 |

---

## 1. 诉求 ①：钢琴卷帘的试听与"单独播放"

### 1.1 根因：试听走的是"再和声化"路径，与音序器不是同一个声音 [已复现]

**这是本轮唯一一个我能用探针钉死的音质缺陷。**

**代码路径**（每一跳都已核对）：

1. `PianoRollLane.tsx:599-606` 试听和弦进行时，**把和弦的每个音分别**调用一次 `onAudition`：
   ```ts
   chords.forEach((chord, chordIdx) => {
     const timer = window.setTimeout(() => {
       chord.chordNotes.forEach((midi) => {
         onAudition(activeTrackIdx, midi, 95, 0.7);   // ← 注意：逐音调用
       });
     }, chordIdx * 450);
   ```
2. `StudioView.tsx:775-782` → `engine.triggerNote(trackIdx, name, vel, midi, 1, gate)`。
3. `AudioEngine.ts:1656-1688` → `triggerInstrument(..., isAudition=true, stepIdx=-1)`。
4. `AudioEngine.ts:1755-1779`：轨道是 chords 轨 → 解析 `chordTreatment` → 调 `playChord(...)`，并把
   `chordNotesForStep(track, stepIdx=-1, effectivePitch=pitch, ...)` 传进去。
5. `chordVoicing.ts:380-399`：`stepIdx=-1` 取不到"存储音堆"，于是**回落到 `chordVoicingForStep(pitch)`**。
6. `chordVoicing.ts:166-235`：把**这一个音**当成根音，配出一副完整和弦（三/七/九和弦，含转位折叠）。

**结果**：试听一副 4 音和弦 = 4 次调用 × 每次配出 3 音 = **12 个声部**。

**实测证据**（`FakeAudioContext` 统计新建振荡器数，探针已用完删除）：

```
PROBE(A 无存储音堆): 试听 4 个音 -> 24 oscillators, 48 gains
PROBE(B 有存储音堆[60,63,67,70]，试听这 4 个音) -> 24 oscillators, 48 gains
PROBE(C 有存储音堆，试听一个不在堆里的音 72) -> 6 oscillators
```

24 个振荡器 = 12 个声部 × 2 个振荡器/声部，与代码推导完全一致。
（若按"4 个音就是 4 个声部"的预期，应该是 8 个振荡器。**实际多出 3 倍。**）

**同一缺陷的另一面**：试听 `pad` 类音色时，`chordTreatment` 带 `strumSeconds` 起音错开与
`gateScale` 延长（`AudioEngine.ts:2009-2016` 有专门注释说明这一点曾被修过一次），
4 个和弦音各自再展开、每个音的门长按 `gate=0.7`（约 0.35 s @124 BPM）叠加，
**必然糊成一团**。这与用户描述的"声音不正常"完全吻合。

**根因归类**：`triggerNote` 是为**旋律轨**设计的单音试听入口，但它按 `track_id` 分发，
chords 轨走进了一条会"再和声化"的支路，而调用方（卷帘、虚拟键盘、悬停预览、小节和弦按钮）
**都不知道这件事**。所以这不只是"和弦进行试听"的问题：

| 触发位置 | 现象 |
|---|---|
| `PianoRollLane.tsx:599` 和弦进行试听 | 12 声部叠加，糊 |
| `PianoRollLane.tsx:1884` 小节栏和弦名按钮（点一下试听整小节和弦） | 每个和弦音再展开一次 |
| `PianoRollLane.tsx:634/648` 左侧键盘点击/滑奏 | 按一个键发出 3 音和弦 |
| `PianoRollLane.tsx:686` 拖动音高时的实时试听 | 同上 |
| `PianoRollLane.tsx:2188-2210` 悬停幽灵音符（已有 `chordNotes` 却仍逐音触发） | 同上 |
| `SequencerModals.tsx:126` 音高选择器试听 | 同上 |

### 1.2 诉求：钢琴卷帘需要对"当前谱子"单独播放 [已核对，功能缺失]

**现状**：卷帘里唯一的播放手段是**全局走带**（`handleTogglePlay` → `engine.play()`），它播放的是
**完整 8 轨 pattern**。卷帘自身没有任何"只播这条轨 / 只播这一段"的能力：

- `PianoRollLane.tsx` 里没有任何预览播放状态（全文只有被动订阅 `subscribePlayhead`，`:545-572`）；
- `AudioEngine.play()`（`:1299-1342`）没有轨道过滤参数，`schedulerLoop`（`:1497`）也没有；
- 唯一接近的能力是全局 `Solo`（`trackStates[i].solo`，`AudioEngine.ts:1576-1581`），
  但那是**共享状态**，会改 UI 上的 Solo 按钮，用户从卷帘退出后状态还在；
- 卷帘里的 `currentStep` 是写死的 `-1`（`SequencerPanel.tsx:627`），所以卷帘**根本收不到走带位置**
  （`PianoRollLane.tsx:545` 的 `subscribePlayhead` 只用于移动那条激光线）。

**设计**（复用现有架构，不改任何共享状态，符合本仓库"单一收口"的习惯）：

```
AudioEngine 新增：
  setPreviewScope(scope: { trackIdx: number; fromStep: number; toStep: number } | null): void
    - 仅设置状态，不改 trackStates（mute/solo 原样保留，预览"像混音里那样"发声）
    - 置 null 即退出预览
  private previewScope = null
  schedulerLoop 内：
    - 预览时步进上限取 toStep-fromStep（而不是 totalSteps/loopRange）
    - 起点强制从 fromStep 开始（play() 的 currentStep 初始化同样处理）
  scheduleStep 内：
    - 在现有 mute/solo/drumsOnly 判定**之后**再加一条：
      if (previewScope && trackIdx !== previewScope.trackIdx) return;
    这样"预览 = 该轨在真实混音里的样子"，且不污染共享状态
  stepQueue 继续照常推送 → onStepCallback → playheadBus，
    卷帘的激光线（已存在，:545-572）自动跟随预览进度，无需新通路
```

```
UI（PianoRollLane 顶部工具区新增一组）：
  ▶/■  预览本轨（含循环：到底自动回到起点）
  显示 "Bar 2–4 / 全轨" 的范围选择（复用已有的 loopLen / barCount）
  进入预览时：若全局走带在播 → 先 stop（避免两套声音叠加）
  退出/关闭卷帘/切换轨道 → 自动 setPreviewScope(null)
  预览中，轨道被 Mute 或别的轨 Solo 时给出明确提示（"该轨当前被静音，预览无声"）
```

**验收标准**：
1. 卷帘预览只发出该轨的声音（其余 7 轨在音频图层面被过滤，而不是把音量拉到 0——后者会被
   取证测试发现，见 §7 红线）；
2. 预览**不修改** `trackStates`（预览前后 mute/solo 数组逐字节相等）；
3. 预览中卷帘的播放头随预览步进移动（复用 playheadBus，不新增订阅通路）；
4. 预览中点击音符试听时，先结束预览（避免叠加）；
5. 关闭卷帘后 `previewScope === null`（有测试断言）。

### 1.3 顺带必须一起修的：试听的发声路径与音序器不一致 [已核对]

`AudioEngine.ts:1717`：

```ts
const dest = isAudition ? (this.masterGain || this.getTrackDestination(trackIdx))
                        : this.getTrackDestination(trackIdx);
```

**试听绕过了整条轨道条**（`ChannelStripDsp`：HPF + 三段 EQ + 压缩 + 驱动，`AudioEngine.ts:561-610`），
也绕过了该轨的推子、声像、送出。后果：

- 用户调好的音色在试听里听不到（"我明明调了 EQ，试听不是那个味道"）；
- 试听与音序器播放**接受的增益级不同**（母带 vs 轨道条）；
- 讽刺的是，`AudioEngine.ts:2018-2023` 的注释已经把这件事说清楚了，并且**GS-1 那条支路已经改成了
  走轨道条**（`:2024`），理由是"一个 host 只能绑一个目的地，改母带会导致 host 反复重建"。
  也就是说：**和弦轨在 GS-1 下走轨道条，在原生引擎下走母带** —— 同一份代码里两种行为。

**修法**：新增一个明确的语义区分，让"试听"与"预览"都走轨道条：

```ts
// 语义拆分：isAudition（用户点一下听音色）不再等于"送往母带"
//  - 试听 = 该轨在混音里的声音（走轨道条）→ 默认
//  - 仅在轨道被 Mute 时才需要"越权发声"，这时给出 UI 提示而不是偷偷改路由
```

**风险**：试听会带上该轨的声像/EQ/压缩/送出——这正是"我想要"的效果；
但**被静音的轨道试听将无声**，需要在 UI 上给出提示（否则又是一个"点了没反应"）。这一条与 §4.2
的"静默 no-op"清单合并处理。

### 1.4 和弦进行试听必须"试听 = 写入的结果"

`handleAuditionProgression`（`:592-607`）用固定 `chordStyle: "triad"`、固定 `baseOctave: 4`、
固定 `450 ms` 间隔；而写入用的 `applyChordProgression`（`rollModel.ts:1072-1121`）用的是
**默认值 + 按 pattern 长度均分**。两者本来就可能不一致，一旦用户改了 `chordStamp` 或轨长，
"试听的和写入的不是一回事"。

**修法**：让试听直接复用"写入将要产生的那组音符"：

```ts
// 1. 先算出将要写入的音符（纯函数，复用 applyChordProgression 的同一段计算）
//    把 rollModel 里的音符计算抽成一个纯函数 previewProgressionNotes(...)，
//    applyChordProgression 与试听**共用**它，从结构上杜绝漂移。
// 2. 每个和弦作为**一次**调用提交给引擎（而不是逐音）：
//    engine.previewChord(trackIdx, notes, velocity, durationSeconds)
//    → 内部走 playChord(dest=轨道条, storedNotes=notes, treatment=resolveChordTreatment(genre))
//    → 与音序器 100% 同一条发声路径、同一个 treatment、同一个声部增益法则
// 3. 时值用引擎的真实步长：durationSeconds = getStepDuration() * stepsPerChord * 0.9
//    （而不是写死的 450 ms）
```

新增引擎方法 `previewChord(trackIdx, notes, velocity, seconds)` 是本方案的关键：
**它让"试听一副和弦"变成一次原子操作，而不是 N 次单音触发**，从根上消灭 §1.1 的放大问题。

---

## 2. 代码缺陷（P0：正确性 / 数据丢失）

> 本节 6 项全部可从**普通 UI 操作**触达，其中 3 项会**损坏或丢失用户作品**。
> 建议全部纳入 v2.1.0 的发版门禁。

### 2.1 `SET_STEP_COUNT` 把并行数组截断，128 步只有 32 步有数据 [已复现]

**证据**：`useSequencerStore.ts:848-855`

```ts
if (targetSteps > steps.length) {
  const diff = targetSteps - steps.length;
  steps = [...steps, ...steps.slice(0, diff)];      // ← diff > steps.length 时切片不足
  velocity = [...velocity, ...velocity.slice(0, diff)];
  // ... pitch / gate / ratchet / probability 同样
```

`Array.prototype.slice(0, diff)` 在 `diff > arr.length` 时只返回 `arr.length` 项。
16 步 → 128 步时 `diff = 112`，而每个数组只有 16 项，**每次只补 16 项**。

**实测**（探针，已删除）：

```
PROBE before(array lens): 16,16,16,16,16,16,16,16
PROBE after: {"steps":32,"velocity":32,"pitch":32,"gate":32,
              "ratchet":32,"probability":32,"trackLength":128}
PROBE start stepCount: 128       ← stepCount 声称 128
```

即：`stepCount = 128`、`totalSteps = 128`、`trackLength = 128`，但**六个数组长度全是 32**。
引擎按 `totalSteps` 迭代（`AudioEngine.ts:643-648`），三个导出器也按 `totalSteps` 迭代
（`MidiExporter.ts:103`、`AbletonExporter.ts:79`、`WavExporter.ts:156-159`）。

**用户可见后果**：在工具栏 Length 下拉里选 64/128（`Toolbar.tsx:250-266`）或按"+2 bars"
（`Toolbar.tsx:1554` → `useToolbarControls.ts:119`）之后，**第 33 步以后的格子点了没声音，
导出的 MIDI/WAV 大半是静音**。159 个曲风里有 55 个本身是 32 步，所以"32 → 128"是一次下拉即可触达。

**修法**：

```ts
// 用"平铺"而不是"切片"：把现有内容当作循环体重复补足
const tiled = <T,>(arr: T[], target: number): T[] =>
  arr.length === 0 ? arr : Array.from({ length: target }, (_, i) => arr[i % arr.length]);
// 并对 count 做白名单校验（只允许 16/32/48/64/96/128）
```

**必须同时修**：`trackLength: targetSteps`（`:873`）把**每条轨的独立循环长度**无条件改写成全局长度。
实测 1272 条出厂轨道模板里有 785 条用的是非默认 `trackLength`，也就是**一次 Length 改动会把
曲风的 polymeter 律动永久抹平**。修法：仅当 `trackLength === 旧的 stepCount` 时才跟随改写。

**测试**：扩展 `sequencerStore.test.ts`——16→48/64/128 断言**六个数组长度全部等于 stepCount**；
再加一条"polymeter 保持"用例。这两条测试现在**都不存在**，所以这个缺陷才能一路绿到发版。

### 2.2 加载工程后残留假撤销点，Ctrl+Z 用上一个工程覆盖刚打开的工程 [已核对]

**链路**：`LOAD_PROJECT` 把 `lastRecordedStateRef` 置 null（`useSequencerStore.ts:1163`），
但 `stateRef` 仍指向旧 state；紧接着 `useProjectHub.ts:83-85` → `StudioView.tsx:225` 会做一次
**母带 FX 机架同步**，走的是 `commitCoalesced`（`:1208-1231`），于是把**上一个工程**的快照推进历史。
`projectStorage.ts:100-122` 再在 500 ms 后把这份内容**自动保存进当前激活工程**。

**用户可见后果**：打开已存工程 → 顺手按 Ctrl+Z → 上一个工程的 BPM/pattern 盖到当前工程上，
**并且被自动保存写回磁盘**，原工程被破坏。

**修法**：`LOAD_PROJECT` 直接带上 `effectsRack`，并让加载后的机架同步走**不记历史**的路径
（`commit(action, false)` 或独立 setter）。**测试**：新增 `projectHubLoad.test.tsx`，
在**真实 useProjectHub 调用链**上断言 `canUndo === false` 且 `bpm` 未变
（现有 `sequencerHistory.test.tsx:138` 只测了 reducer 单步、没做机架同步，所以看不见这个 bug）。

### 2.3 持久化快照是无校验强转，坏快照让工作室直接打不开 [已核对]

**证据**：`projectStorage.ts:142` 只检查 `patterns.A` 真值，`:153` 一句 `return data as PersistedProject`；
而 `useSequencerStore.ts:240` 会**无条件解引用 `saved.patterns.B`**。

| 快照内容 | 后果 |
|---|---|
| 有 `patterns.A`、缺 `patterns.B` | `TypeError: Cannot read properties of undefined (reading 'tracks')`，**抛在 useReducer 初始化里** → 工作室挂载失败，且坏快照永不被清除（没有自救入口） |
| `patterns.A = {}` 或 `tracks` 为字符串/null | 同上（`.map is not a function`） |
| `bpm: "fast"` | `state.bpm === "fast"`，流向引擎、BPM 显示与 MIDI tempo 元事件 |
| `stepCount: "lots"` | `state.stepCount` 变成字符串 |
| `activeSlot: "Z"` | 编辑写进 `patterns.Z`，而自动保存只写 `A/B` → **用户的修改永远不会被保存** |

**修法**：在 `loadSavedProject` 里做**逐字段形状+类型校验与修复**（pattern 结构、`patterns.B` 回落到 A、
`bpm`/`stepCount` 走 `Number`+范围、`activeSlot` 白名单 `"A"|"B"`），校验失败**清除该键**并回落默认；
同时给 `.groove` 导入补 `try` 包 `JSON.parse` 与文件体积上限（`projectDb.ts:545`，`:467-491` 的
校验只查 format/version/genreId/`patterns.A` 真值）。

### 2.4 点击"工作室"标签会静默重置曲风（并换掉两个 pattern 槽）[已核对]

`App.tsx:138-140`：

```ts
const handleSelectTab = useCallback((tab: NavTab) => {
  navigate({ tab, genreId: tab === "detail" || tab === "console" ? selectedGenre?.id : undefined });
}, [navigate, selectedGenre?.id]);
```

`router.tsx:288-305` 的 `navigate` 做的是 `{ ...prev, ...newRoute }` —— **`genreId: undefined` 会覆盖**。
随后 `App.tsx:49` 的 `route.genreId || "chicago-house"` 回落到默认曲风，
触发 `useGenreSwitching.performSwitch` → `commit({ type: "SET_GENRE" })`，**两个 pattern 槽都被替换**。

**用户可见后果**：在 Techno 详情页 → 点"Studio" → 变成 Chicago House，作品被换掉；
若 pattern 是脏的，还会弹一个"未保存改动"对话框——**用户只是点了个同页标签**。

**修法**：未定义时**不要写这个键**（`tab === "detail" || tab === "console" ? { tab, genreId } : { tab }`）。
顺带：`formatRouteToUrl` 对 studio 无 genreId 时返回 `/`（`router.tsx:245-254`），修完这条
studio 的 URL 才会稳定带上曲风。

### 2.5 母带 FX 机架从不被持久化 [已核对]

`useSequencerStore.ts:1090-1107` 的自动保存载荷**刻意省略** `effectsRack`（注释在 `:262-264`），
`useProjectHub.ts:63-78` 的 `LOAD_PROJECT` 也省略。后果：滤波/饱和/合唱/降比特设置在重开后
永远回到 `DEFAULT_FX_STATE`；加载工程后 store 的机架还是上一个工程的，UI 却显示新工程 →
**第一次撤销/重做会把机架换掉**。修法：`PersistedProject` 与 `LOAD_PROJECT` 都带上 `effectsRack`。

### 2.6 曲风试听钩子泄漏 AudioContext [已核对]

`useGenreAudition.ts:24-30` 卸载时只 `engine.stop()` 然后丢弃 ref，**从不 `destroy()`**
（正确写法见 `CustomGenreMakerView.tsx:172-176`）。浏览器对同页 `AudioContext` 数量有上限（约 6 个），
浏览若干曲风页之后**试听会静默失效**。修法：卸载时 `destroy()`，或全局共用一个引擎。

---

## 3. 音质与"接近真实听感"

> **本节结论均为 [已核对] 的代码事实 + [静态推断] 的听感后果；单个音色"好不好听"属 [未验证]。**
> §3.5 给出把主观判断变成可回归资产的必须先做项。

### 3.1 天花板在架构层：51 个预设共用同一张模板 [已核对]

`PolySynth.ts:964-1213`（`playPolySynthNote`）是所有旋律音色的唯一实现：**两个振荡器 + 一个 12 dB 低通 + 一条 ADSR**。

| 能力 | 现状（已核对） | 听感后果 |
|---|---|---|
| 波形 | 只有 `sine/square/sawtooth/triangle`；全仓库 **0 处** `createPeriodicWave` | 管风琴拉杆、钢琴/钟琴的不谐分音**不可能**做出来 |
| FM | `fmLead` 的"FM"是 osc2 固定失谐 **1207 音分**（`PolySynth.ts:832`；`bellLead` 1900、`cowbellLead` 540） | 固定失谐是静态双音，不是会演化的不谐频谱 |
| 齐奏 unison | 最多 2 个振荡器，失谐 ≤ 28 音分；`supersaw` 就是**两把锯齿**（`:258-269`） | Trance/EDM 的"音墙"做不出来 |
| 键盘跟踪 | **无**。`filterCutoff` 是绝对常数（`:985, 1036`） | C2 与 C6 用同一个截止频率：高音发闷、低音发轰 |
| 滤波包络 | 48/51 个预设共用 `cutoff × 2.5`（≈1.32 个八度，`:896, 1062-1083`） | 钢琴、长笛、弦乐、萨克斯、风琴"打开的量"完全一样 |
| 起音曲线 | 指数从 −80 dB 起（`:1149, 1177-1184`） | 起音发"软/海绵"，打击性乐器的音头被抹平 |
| 相位 | 所有振荡器从相位 0 开始（`:1205-1206`），和弦各音同时起 | 第二小节与第一小节在音色层**逐位相同**；和弦音头相干叠加、更容易顶限幅器 |
| 力度→音色 | 21/51 个预设支持，其余 30 个**只有音量**（`:81-100`） | 重音只等于"更响"，不等于"更亮" |
| 24 dB 斜率 | 只有 `acidBass` 用，且第二级停在基准截止频率、不跟包络扫（`:1116` vs `:1081`） | 303 的"哇"只有一半深度，听起来发闷 |

**结论**：这不是"某个音色没调好"，而是"所有仿声学乐器（钢琴/电钢/钟琴/颤音琴/弦乐/管乐）
在机制上就不可能像"。Tier-1 快速修复能显著改善听感（§3.4），但**要真正接近唱片，必须补
波表/齐奏/键盘跟踪这三件事**（§3.5 S2/S3）。

### 3.2 鼓组：100% 合成 + 关键参数写死 [已核对]

| # | 事实 | 位置 | 听感后果 |
|---|---|---|---|
| D1 | **音高轨只改变扫频起点，终点频率写死**（808 终点恒 42 Hz、909 恒 48、acoustic 恒 54；军鼓落点 140/260/95 也是常数） | `DrumKitModels.ts:423, 473, 520, 569, 630-631, 682` | 变调的鼓**在音高落地后跑调**；移调后的鼓组听起来像没调准 |
| D2 | **底鼓路径没有饱和级**（注释声称有 "driven saturation"，但 4 套鼓分支里都没有 `WaveShaper`） | `DrumKitModels.ts:469` 注释 vs 实现 | 808/909 的谐波缺失——真实的 808 味道大半来自那级削波 |
| D3 | **6 套 `kick:*` 预设完全忽略力度→音色**（`velocityTimbre` 在 `DrumKitModels.ts` 全线使用，但 `AnatomyKickEngine` 从未 import） | `AnatomyKickEngine.ts:12-14` | 唯一"力气不改变音色"的鼓 |
| D4 | **踩镲：4 套鼓里 3 套是"一段噪声 + 高通 + 一个指数衰减"**（只有 808 用了 6 个不谐方波） | `DrumKitModels.ts:860-886` vs `:896-928` | 默认踩镲听起来像被滤过的噪声，不是金属 |
| D5 | **开镲时值被步进门长限死**（`decayTime = max(0.02, base*gateVal)*scale`，上限 0.45 s） | `DrumKitModels.ts:847-854` | 真实的 0.4–1.0 s 开镲做不出来 |
| D6 | **闭镲 choke 是阶跃而不是淡出**：`cancelScheduledValues(time)` + `setValueAtTime(g.value, time)` —— `time` 是**前瞻调度的未来时刻**，而 `g.value` 是**现在**的值 | `AudioEngine.ts:1885-1900`（`WavExporter.ts:395-410` 同样） | 每次"闭镲切开镲"都有电平跳变 + 咔哒。**本仓库其他地方的 voice steal 恰恰是避免这个写法的**（`voiceRegistry.ts:90-104`） |
| D7 | **拍手的 3 次爆发 + 主体读同一个噪声偏移** | `DrumKitModels.ts:1016, 1039` | 三次爆发相干叠加 → 梳状染色，像一次"拍偏了的"噪声，不像 4 下拍手 |
| D8 | **51/159 个军鼓轨声明的 `clap`/`rimshot` 被完全忽略**（`synthesizeSnare` 不收 `instrument` 参数，分发处也没传；对照：打击乐轨是传的） | `AudioEngine.ts:1737-1738`；`DrumKitModels.ts:600-609` | 声明 clap 的 25 个曲风、声明 rimshot 的 26 个曲风拿到的是普通军鼓 |
| D9 | **选择底鼓预设会连带换掉整套鼓**：`getBaseDrumKit` 用字符串嗅探，军鼓/踩镲/打击乐都调它 | `DrumKitModels.ts:43-50, 406, 616, 855` | 用户只选了底鼓，军鼓和踩镲一起变了 |
| D10 | **轮转（round-robin）不存在**：噪声偏移由 `trackIdx*65536 + stepIdx*64 + ratchet` 决定 | `noise.ts:117-119` | 第 N+1 小节与第 N 小节**逐位相同**——"MIDI 鼓"最典型的破绽 |
| D11 | 声部清理的 source↔gain 是**按下标配对**，而 808 军鼓的 `sources=[osc1,osc2,noise]` 与 `gains=[oscGain,noiseGain]` 长度不等 | `AudioEngine.ts:1841-1843`；`DrumKitModels.ts:644-665` | 抢占/panic 时会去 ramp 错误的层 → 密集段落出现层次丢失 |
| D12 | 打击乐模型库 16 个里，**只有 `rim_shaker` 可达**（159 个曲风全部声明它） | `DrumKitModels.ts:175-337, 1408` | 曲风 `instrumentation` 文本里写的"Timbales/Congas"不是实际听到的声音 |

### 3.3 空间、混音与响度

**已核对的结构问题**：

| # | 事实 | 位置 | 后果 |
|---|---|---|---|
| M1 | 送出（sendA/sendB）在**推子后、声像前**分接：`stripOut` 同时喂 panner 与 send | `AudioEngine.ts:605` vs `:612-624` | 硬左/硬右的轨道，混响/延迟送的是**居中**信号（真实调音台是 post-pan）——**已修，见附录 G.19** |
| M2 | 母带 `DRIVE` 是**硬削波**：WaveShaper 曲线定义域固定 `[-1,1]`，而机架在推子之后、8 轨求和之后 | `EffectsRack.ts:59-67`；`masterGraph.ts:264` | 在 rock/metal/dubstep（drive 3.5–5.5，`genreFx.ts:113, 213, 217`）上，母带在进限幅器之前就已经被削平——**已修（Q13）**：曲线定义域改为 ±`SATURATION_INPUT_CEILING = 2`，超界处是饱和而不是平顶；同时把曲线改成 `tanh(k·x)/k`（小信号增益恰为 1），消掉了旧归一化带的 +3.9–15.6 dB 无请求增益 |
| M3 | 合唱把立体声**降混成单声道**（`ChannelMergerNode` 的输入默认 `channelCount 1`），且左右两抽头共用同一个 LFO | `EffectsRack.ts:179-184, 219-221` | 湿声是单声道、主总线每隔约 66 Hz 一个梳状陷波——**已修，见附录 G.20** |
| M4 | 乒乓开关会**重建整条延迟图并切断尾音**（`if (pingChanged) this._build()`） | `DelayBus.ts:234-236, 277-284` | 切曲风/切乒乓时延迟尾巴被砍断——**已修（v2.0.92）**：实测可达（`genreFx.ts` 有 11 处 `pingPong: true`，切到/切离这些曲风即 `_build()`）。修法是**交叉淡化**（计划里给的两个方向之一）：每个 build 有自己的输出增益，旧 build 不断线、只把增益淡到 0，尾音继续从自己的延迟线里响；淡化窗**跟着延迟时间走**（0.25–0.5 s），因为它要盖住新 build 空延迟线的预热期。拆除靠 `ctx.currentTime`（音频时钟）而非 `setTimeout`，以保住"离线渲染建出同一张图"的契约。见 G.31 |
| M5 | 混响 IR 生成在**主线程同步**执行并直接换缓冲、无交叉淡化（最长约 9 s，约 4 MB 立体声） | `ReverbBus.ts:350-354, 190-211, 396-397` | 切曲风时掉帧 + 尾音被瞬间截断——**已降级，计划原文的数字是错的**：9 s 是**冲激响应长度**（`ambient` 确实用 `decaySec: 9.0`），不是计算耗时。实测生成本身：0.9 s → **4.3 ms**、1.9 s → **6.4 ms**、9 s → **29.7 ms**（初始化 0.2 ms）。即最坏 1–2 帧，且只在该曲风被切入/切出时发生一次；「移出主线程」因此从「必修」降为「若将来 profile 显示才做」 |
| M6 | 母带推子是**阶跃写入**（`setValueAtTime`），且"听力保护"开关会重写推子 | `AudioEngine.ts:1077, 1042` | 拖推子有 zipper 噪声——**已修（Q11）**：`setMasterVolume` 现在先 `cancelScheduledValues` + 钉住当前值，再 `setTargetAtTime`（15 ms）平滑；`setHearingProtection` / `setMaxVolumeLimit` 都走这条路，所以切限幅器也不再咔哒 |
| M7 | 延迟反馈量与阻尼在每次 `setParams`（含仅改返回量、改 BPM）都是阶跃写入 | `DelayBus.ts:374-379` | 变速时延迟的"变暗/反馈量"有阶跃——**已修（Q11）**：反馈增益与阻尼截止都改成"先钉住当前值、再 `setTargetAtTime`（12 ms）" |
| M8 | 插入条（EQ/压缩/makeup/drive）参数全是 `setValueAtTime`，无平滑；`setFilter` 每次写都重连图 | `ChannelStripDsp.ts:286-315, 383-390`；`EffectsRack.ts:257-266` | 拖插入旋钮有 zipper；每帧重连图——**一半已修（v2.0.83）**：`EffectsRack.setFilter` 每次写都重连图，而它在**每次 BPM 变化**都会被 `applyGenreFxToGraph` 调用，所以拖速度滑杆就会把主滤波器拽出链路再装回；现已只在拓扑变化时重连。插入条那半是**刻意**的：`ChannelStripDsp.writeParam` 的注释写明步进写入才能让离线渲染逐位一致，不是缺陷 |
| M9 | **实时的 `probability` 用 `Math.random()`，导出用确定性掷骰** | `AudioEngine.ts:1603` vs `WavExporter.ts:335` | 概率轨的播放**永远不等于自己的导出**——**刻意为之，不是缺陷**：`AudioEngine` 该处注释写明 Chance 是演奏功能、每次经过都重掷，导出用确定性掷骰是为了可复现，并明确写着「Do not "fix" this by seeding live playback」 |
| M10 | 实时 ratchet **未做 1..8 夹取**，导出做了 | `AudioEngine.ts:1624-1626` vs `noteEvents.ts:59-61` | 畸形/导入的 pattern 能一次性喷出大量声部——**已修（Q10）**：实时路径改走与导出同一个 `resolveRatchet`（1..8 夹取），`exporterParity.test.ts` 钉住夹取边界；这一轮顺手把实时路径里**复制的那份**副拍力度渐变也换成共享的 `ratchetVelocityScale`（公式本来就一样，改的是"只留一份"） |
| M11 | 逐轨 swing 分支丢掉了 `latencyCompensationMs`（用的是 `this.nextStepTime` 而不是 `time`） | `AudioEngine.ts:1618-1620` vs `WavExporter.ts:340-344` | 带独立 swing 的轨道与导出有几毫秒偏差——**已修（v2.0.94）**：该分支自己重建了时间，于是把调用方已经折进 `time` 的**两个**活演奏修正都丢了：延迟补偿，以及"不得早于 `currentTime`"的钳位。独立 swing 的轨道因此比其它轨道（以及它自己的导出）整整早一个补偿量。现在只有 swing 项不同，另两项照旧。见 G.33 |
| M12 | 混响返回量的 ramp 没有先钉住当前值（DelayBus 有先钉） | `ReverbBus.ts:337-343` vs `DelayBus.ts:402-403` | ramp 起点可能跳变——**只在降级路径成立**：现代路径先 `cancelAndHoldAtTime(now)`（已钉住当前值），只有不支持它的 context 才退到 `cancelScheduledValues` 而跳变 |
| M13 | 母带链路**没有 DC 阻断**，混响 IR 也没有高通 | `masterGraph.ts`（无 HPF）、`ReverbBus.ts`（无 HPF） | 任何 DC 会持续占用限幅器的天花板——**已修，见 Q12** |
| M14 | 限幅器的增益包络是**瞬时阶跃**（`this.gain = target`），滑窗最小值是每样本 O(D) 线性扫描，且 NaN/Inf 无消毒 | `MasterLimiter.ts:358-360, 352-356, 346` | 限幅时的调制颗粒感/泵动；渲染线程额外负载——**已修（v2.0.95）**：三条里两条站不住、一条是真的。**瞬时起音**在有前瞻时是正确做法（注释也这么写）；**NaN/Inf** 不会污染增益（NaN 输入算出的 peak 是 0 → 不衰减，Inf 输入 → 增益 0），所以没加"消毒"这种掩盖上游损坏的分支；真正的问题是那个**每样本 O(D) 的滑窗最小值**，已换成**单调队列**：O(1) 摊还、**输出逐位不变**。实测（4.41 M 样本、窗口 145）比较次数 **639,450,000 → 8,549,300**（145.0 → 1.939/样本），该步耗时 **2126 ms → 127 ms**（约 17×），校验和一致。见 G.34 |

**响度：已测数据（离线口径）** —— 这是本仓库最扎实也最"反直觉"的一块：

| 指标 | 实测值 | 含义 |
|---|---|---|
| 目标 `targetLufs` | **−15.716 LUFS** | 这是**159 个曲风的中位数**，不是任何交付标准 |
| trim 后 p10–p90 spread | **0.32 LU** | 曲风之间**互相对齐**做得极好（门禁 1.5） |
| 全距 | −18.34 … −15.52 = **2.82 LU** | |
| 真峰值顶到天花板（≥ −1.35 dBTP）的曲风 | **124 / 159** | 近八成曲风被限幅器压着 |
| 最低峰均比 | death-metal **4.36 dB**（真峰值 −11.36 dBTP） | 一半曲风被压得很扁 |
| 可达上限（推子 1.0、关听力保护） | ≈ **−13.8 LUFS** | 默认状态 −15.7 |
| 真实现代唱片（同类流派） | 约 −6 … −9 LUFS | Spotify 归一化到 −14 LUFS |

**结论**：当前默认比 Spotify 的归一化点低约 1.7 dB，比真实同类唱片低 **6–9 dB**；
而且"对齐"是靠**把密集曲风压下去**实现的，不是把稀疏曲风抬上来 → **一半曲风被重压、
另一半有 10 dB 空余**，可感知的"密度"极不一致。

> ⚠️ **这是产品决策，不是纯技术缺陷。** 把它改成"对齐唱片"会动到全部 159 个曲风的听感、
> 必须重测响度与音色基线、重配 159 条 trim。§6 把它列为**需要你拍板的 D1 决策**。

### 3.4 Tier-1 快速项（小改动、直接可听，建议 v2.1.1）

| 项 | 改法 | 位置 | 预期听感 |
|---|---|---|---|
| Q1 | 修开镲 choke：改用 `cancelAndHoldAtTime(time)`（或解析式算出 `time` 时刻的包络值）再 3 ms 淡出 | `AudioEngine.ts:1885-1900`；`WavExporter.ts:395-410` | 每次闭镲不再有咔哒 + 跳变 |
| Q2 | 军鼓分发补传 `track.instrument`，让 `clap`/`rimshot` 曲风拿到声明的声音 | `AudioEngine.ts:1737-1738`；`DrumKitModels.ts:600` | 51/159 个曲风拿到正确的军鼓 |
| Q3 | 音高轨**整体移调**鼓（`endFreq`/落点频率乘 `pitchMultiplier`） | `DrumKitModels.ts:423,473,520,569,630-631,682` | 变调的鼓不再跑调 |
| Q4 | 非 808 的踩镲加金属簇（复用 808 的 6 方波簇过 HP/BP） | `DrumKitModels.ts:896-929` | 默认踩镲从"滤过的噪声"变成金属 |
| Q5 | 开镲时值不再被步进门长限死，上限提到 ~0.8 s | `DrumKitModels.ts:847-854` | 开镲像镲片，不像被门限切过的采样 |
| Q6 | 拍手每次爆发用**各自的**噪声偏移 | `DrumKitModels.ts:1000-1020, 1039` | 拍手不再是梳状的单次噪声 |
| Q7 | 底鼓路径加饱和级（默认 kick 路径，不只是 `kick:*` 预设） | `DrumKitModels.ts:394-596` | 808/909 找回谐波与"咬合感" |
| Q8 | `kick:*` 预设接上 `velocityTimbre` | `AnatomyKickEngine.ts:12-14` | 力度改变音色，而不只是音量 |
| Q9 | 24 dB 滤波第二级跟随同一条包络 | `PolySynth.ts:1116` vs `:1081` | 303 的扫频深度回归 |
| Q10 | 实时 ratchet 夹取到 1..8（复用 `resolveRatchet`） | `AudioEngine.ts:1624-1626` | 畸形 pattern 不能喷声部；实时==导出 |
| Q11 | 母带推子/延迟反馈/混响返回改用 `setTargetAtTime` 平滑（并跳过未变化的写入） | `AudioEngine.ts:1077`；`DelayBus.ts:374-379`；`ReverbBus.ts:337-343` | 拖旋钮不再 zipper |
| Q12 | 母带与混响 IR 加 20 Hz 高通 | `masterGraph.ts`；`ReverbBus.ts:186-212` | 去掉 DC 占用天花板 |
| Q13 | 母带 `DRIVE` 曲线归一化到更大定义域（如 ±4 → ±1），并把机架放回推子前或补自动增益 | `EffectsRack.ts:59-67`；`masterGraph.ts:264` | 高 drive 曲风不再被削平 |
| Q14 | 声部 `onended` 时 `disconnect()` | `voiceRegistry.ts:135-146` | 长会话节点/GC 压力下降 |

### 3.5 结构性工作（要"像唱片"必须做，建议 v2.2.x）

| 项 | 内容 | 位置 | 为什么必须做 |
|---|---|---|---|
| S1 | **波表 + 齐奏 + 键盘跟踪 + 逐预设力度→音色**：`createPeriodicWave` 做风琴拉杆/钢琴/钟琴的分音；2–3 路失谐齐奏 + 相位随机；`cutoff × 2^((note−60)/12·depth)` | `PolySynth.ts:964-1213` | §3.1 表格里所有"仿声学乐器"的唯一出路 |
| S2 | **鼓组采样层 + 每击轮转**：底鼓击槌、军鼓鼓皮/鼓边、踩镲金属各一层（**离线生成、不下载**），噪声偏移改为按轮转索引取 | `DrumKitModels.ts:394/600/827`；`noise.ts:117` | 单一步骤里收益最大的改动：真实音头、不再"机关枪式重复" |
| S3 | **鼓组房间/房间麦**：鼓总线加一条短早期反射总线 | `masterGraph.ts:193-220` | 鼓不再是"真空里的单声道一击" |
| S4 | **真响度仪表 + 限幅器 GR 遥测**：运行时暴露 LUFS/真峰值，把 trim 从"开环常数"变成"可验证量" | `MasterLimiter.ts`（增 GR 上报）；`scripts/measure_genre_loudness.mjs` | §3.3 的响度决策必须建立在可测数据上，而不是手感 |
| S5 | **立体声完整性**：合唱左右独立 LFO、声像后分接送出、延迟带宽控制、主链路单声道折叠检查 | `EffectsRack.ts:159-195`；`AudioEngine.ts:612-624`；`DelayBus.ts:303-320` | 去掉"主总线被降成单声道梳状"这个隐藏损失 |
| S6 | **混响 IR 移出主线程**（Worker 或预计算缓存），换 IR 用交叉淡化 | `ReverbBus.ts:267-278, 350-354` | 消除切曲风掉帧与尾音截断 |
| S7 | **延迟不重建图**：两种拓扑常驻、交叉淡化 | `DelayBus.ts:234-236, 277-284` | 消除切 ping-pong 断尾 |

### 3.6 一处需要你拍板的现状：GS-1 默认开启 [已核对]

`src/audio/gs1/gs1Tracks.ts` 的**模块头注释**写着"默认关闭，否则会在没人验证过的情况下改变 159 个曲风的音色，
并使已测的音色基线失效"；而文件下方 `DEFAULT_GS1_ROUTING_ENABLED = true`，注释改口为"用户的决定：默认开启"。
也就是说 **chords/lead 两轨当前由 GS-1（WASM worklet）发声**，而 `scripts/timbre.baseline.json` 描述的
很可能不是默认听到的声音。另外 GS-1 是**加载中异步就绪**的（`Gs1VoicePool.ts:99-108, 188-195`），
**第一小节内音色会从原生切到 GS-1**。

这不是缺陷，是一个**未被记录的默认值变更**。建议：要么把它写进正式决策记录并把音色/响度基线重录，
要么暂时关掉让默认状态回到基线描述的声音。见 §6 决策 D2。

---

## 4. 上手容易（可学习性 / 首屏 / 反馈）

### 4.1 已经建好但**从未接线**的三样东西 [已核对]

这是本轮最"便宜"的改进来源——**代码已经写好了，只是没接进渲染路径**：

| 资产 | 现状 | 影响 |
|---|---|---|
| `src/components/sequencer/toolbarTiers.ts:197` `DEFAULT_VISIBLE_IDS`（三层分级表 + 校验 + 测试） | **只被 `toolbarTiers.test.tsx` 引用**，生产代码零引用；文件头自己写着"工具栏当前无条件渲染所有控件" | 计划里的"33 → ≤14 个常显控件"根本没生效 |
| `layout.density`（紧凑/标准/舒适，`SettingsModal.tsx:321-332`，`layoutPrefs.ts:136,214` 有序列化） | **没有任何消费者**（除 settings 自身的 round-trip 测试） | 用户点"紧凑"什么都不变——比没有更伤信任 |
| `useReducedMotion.ts`（唯一职责是加 `html.reduced-motion` 类并持久化） | **零引用** | 设置里承诺的"减弱动效"开关不存在；CSS 侧规则倒是写好了 |

**动作**：把 `toolbarTiers` 接进 `Toolbar.tsx`（Tier1 常显 / Tier2 折叠 / Tier3 进 More，并
**删掉 More 菜单里那批重复项**——现在 More 是"追加"而不是"收纳"），把 `layout.density` 接到
已存在的密度类（`StepCell.tsx:184` 的 `h-7/h-10`、`SequencerPanel.tsx:311`），把 `useReducedMotion`
接到设置项上。

### 4.2 上手路径的核心缺陷

| # | 事实 | 位置 | 用户感受 |
|---|---|---|---|
| U1 | 首屏是**密集编辑器 + 无单一动作指引**：默认 4 组工具栏全开，桌面约 40 个可见控件，手机 390×844 下工具栏占 **47% 视口**（团队自己的量测） | `Toolbar.tsx:1149/1236/1382` | 第一印象是"控制面板"而不是"做个 beat"——密度部分已修（G.10：36 → 16 控件）；**首屏单一动作已完成（v2.0.88）**，见 G.26（桌面/平板；手机端故意不显示，那端由用户重做） |
| U2 | 7 页 onboarding 是**功能清单**（"零采样合成…159 个曲风…"），只有第 7 页有动作 | `help.ts:131-157`；`NewUserOnboardingModal.tsx:36-93` | 先读 7 屏才第一次出声——**已修第一部分（v2.0.85）**，见附录 G.23：第 1 页就有单一动作「先听一下这个曲风」，一次点击进入工作台并开始播放；遮罩/Esc 关闭**不再**写入完成标记；About 页可重看。「点一个格子」那一步**已完成（v2.0.87）**，见 G.25：实操教学的每一步现在**指向真实控件**（压暗其余、圈出目标、且 `pointer-events: none` 不挡点击），控件不在当前界面时**明说**而不是圈一片空白 |
| U3 | 点一下遮罩就**永久结束** onboarding（`Modal` 默认 `closeOnBackdropClick=true`，而 `onClose={handleFinish}` 会写已完成标记），设置里**没有"重看引导"** | `Modal.tsx:41,125-129`；`NewUserOnboardingModal.tsx:98-105,122-127` | 手机上误触一次，唯一的新手引导再也回不来——**已修（v2.0.85）**：遮罩/Esc 关闭不再写完成标记，About 页可重看。见 G.23 |
| U4 | 教程教练**没有任何 DOM 定位**：8 门课每一步都只 `onNavigateTab("studio")`，无 spotlight、无高亮、无"你完成了吗"判定 | `InteractiveTutorialCoach.tsx:81-90` | 承诺的"交互式动手课"实际是幻灯片——**已修（v2.0.87）**：每一步可带 `anchor`，教练测量目标、圈出并压暗其余，且不挡点击；控件不在当前界面时明说。见 G.25 |
| U5 | 主编辑面（音序器）**是唯一没有帮助入口的界面**（卷帘有，`PianoRollLane.tsx:1197-1204`） | `Toolbar.tsx`（grep "help" 零命中） | 最需要帮助的地方没有帮助——**已修（v2.0.89）**：More 菜单里加了「本页帮助」（Tier 3，不占默认密度），打开帮助中心的 sequencer 章节。见 G.28 |
| U6 | iOS 静音开关下**点播放会"看起来在播但没声音"**：`play()` 是 async 且调用处不 await、不 catch；iOS unlocker 只被 `ChordAudioEngine` 引用，工作室引擎从不调用 | `useTransportControls.ts:94-99`；`AudioEngine.ts:1299-1305`；`iosAudioUnlock.ts:215` | 最典型也最致命的"这 App 坏了" |
| U7 | 静默 no-op：播放引擎为空、撤销/重做为空、**第一次 tap tempo 无任何反馈**、song mode/blind compare/metronome/count-in 四个模式开关**都没有 toast 也没有 announce** | `useTransportControls.ts:88,99-121,68-80,141-160` | "点了没反应"——**已修（v2.0.84）**，见附录 G.22。顺带查明 tap tempo 那段 `calculatedBpm >= 40 && <= 240` 是**死分支**：`AudioEngine.calculateTapTempo` 本身就会夹取到 40–240 并返回整数 |
| U8 | 自动保存让"未保存"模型自相矛盾：每 500 ms debounce 写 localStorage，但**工作台里没有任何 dirty 指示**（maker 视图倒是有 `● maker_unsaved`） | `useSequencerStore.ts:1090`；对比 `CustomGenreMakerView.tsx:404` | 用户不知道作品是否安全——**已修（v2.0.90）**：自动保存的状态改由**写盘的那个模块**拥有并公开订阅，工作台显示「保存中…／已保存／保存失败」，失败态是刻意加的（存储写不进去时必须说，而不是永远转圈）。见 G.29 |
| U9 | 中文术语**同一概念 4–5 个名字**：工作室 = 律动工作台/工作台/编曲工作台/编曲台/编曲室；星系 = 星系云团/律动星系/3D 星系图谱/曲风星谱/3D 宇宙星图；音长 = 门限时值/门限/音长/长度/时长 | `common.ts:5,87`；`HelpCenterModal.tsx:353,252`；`studio.ts:387,456` 等 | 教程说的名字，界面上找不到 |
| U10 | 卷帘网格是**无障碍空洞**：音符是无 role 的 div、无 `tabIndex`（全文 0 处），力度条只能指针操作 | `PianoRollLane.tsx:1920-1922, 2100-2110, 2338` | 屏幕阅读器读到一个空格子；旋律编辑只能鼠标——**已修（v2.0.93）**：原表的说法有两处不准（网格**早就有** `role="grid"`，而且**早就有一整套** window 级键盘编辑：方向键移动选中的音、Delete 删选区、字母切工具），真正缺的是**可聚焦的落点**与**读屏反馈**。现在网格是一个可聚焦表面（`role="application"` + 键盘说明 + live region），有键盘光标，Enter 建/删音、Delete 删音、`+/-` 调力度、`[`/`]` 调音长，方向和速度都会播报；选区存在时方向键仍归选区（原有行为不变）。音符仍只是视觉层（`aria-hidden`），因为无行可承载 `gridcell`。见 G.32 |
| U11 | 模态**没有栈**：`Modal` 的 Escape 是每个实例各挂一个 window 监听、无最顶层判定（`StudioView.tsx:994-1008` 可达"工程中心 + 未保存确认"叠放） | `Modal.tsx:69-74,105` | 一次 Escape 关掉两层，丢失上下文——**已修（v2.0.86）**：对话框改成栈，只有栈顶响应 Escape/Tab，`aria-modal` 也只由栈顶声明。见 G.24 |
| U12 | 对比度与字号：`ChallengeView.tsx:640` ≈2.3:1、`Ruler.tsx:157` ≈1.96:1 @7.5px；工具栏 44 处 ≤10px 字号 | 多处 | 低视力用户读不到提示文字——**已修（v2.0.91）**：量出 66 个硬编码文字色、18 处低于 4.5:1，改完并留下一条**会失败**的扫描检查。两处计划没料到的事实：工具栏「44 处 ≤10px」**早已过时**（现最小 10px，已加回归检查），`Ruler` 那行 7.5px **是 28px 格宽的工作条件**、真正的问题是颜色。手机 viewport 拦双指缩放的 `user-scalable=no` 是有意为之且属冻结的手机端，未动。见 G.30 |

### 4.3 缺失的那条主线：**没有任何地方教"怎么做好听"** [已核对]

产品声称的核心价值是"新手快速做出好听的东西"，但现有的学习面分别是：

- Challenge = "这是哪个曲风"（听辨，`ChallengeView.tsx:129-150`）；
- Masterclass = 律动/声学理论实验（`src/components/masterclass/*`）；
- 教程教练 = 幻灯片（U4）；
- Help Center = 166 项词典 + 9 个分类页（`HelpCenterModal.tsx`）。

**没有一条路径是**：选曲风 → 听出厂预设（已按曲风配好混音/送出/插入）→ 安全地改 3 个参数做前后对比 →
导出。`AUDIO_QUALITY_AND_SYNTH_PLAN.md:249` 自己也承认这条链"从未存在"。

**建议新增 P3-1「四步出片」引导**（不写新 DSP，只编排已有能力）：
GenreRail 选曲风 → 一键试听（已有曲风试听）→ 三个安全旋钮（drums-only 切换 `Toolbar.tsx:924`、
一个插入旋钮、一个送出量）带 A/B 前后对比 → ExportMenu 导出。这条路径同时把 §3 的"音质改进"
变成**用户能听见并验证**的东西。

---

## 5. 工程与发布纪律

### 5.1 版本漂移，且本地发版门禁比 CI 弱 [已复现]

```
package.json        2.0.48        ← 唯一正确的
src/version.ts      2.0.47  (APP_VERSION，用户可见：Header/Settings/SequencerPanel/ErrorBoundary)
public/version.json 2.0.47
public/sw.js        groove-v2.0.47  (CACHE_VERSION)
public/changelog.json 2.0.48     ← 已更新
三份规划文档          v2.0.47
```

```
$ node scripts/version.mjs check   → exit 1（列出 6 个文件）
$ node scripts/check_docs.mjs      → exit 1（5 处漂移）
```

而 `package.json:30` 的 `verify` **不包含** `version:check` / `docs:check` / `redlines` /
`test:coverage` / `perf:check` / `data:lint` —— 这些只在 `.github/workflows/ci.yml` 里跑。
更关键的是 `deploy = verify && deploy:only`（`:32`），**发版路径绕过 CI**。

**最实际的后果**：`public/sw.js` 的**文件字节只在 `CACHE_VERSION` 变化时才变**，所以版本不同步
= 发出去的 `sw.js` 与上一版逐字节相同 = **已安装 PWA 的用户永远收不到新外壳**，
继续吃旧的 `/` 与 `/index.html` 预缓存。

**修法**：`npm run version:sync`，并把 `version:check && docs:check && redlines` 前置进 `verify`。
（S 规模，30 分钟。）

### 5.2 测试的"有牙"程度：两层分化明显

| 模块 | 测试质量 | 说明 |
|---|---|---|
| `rollModel.ts` | **很好**（60 用例 / 189 断言） | 覆盖到"旧单音数据不得改变"这类回归 |
| `MasterLimiter.ts` | **很好**（16 用例 / 59 断言） | 真峰值天花板、worklet↔TS **逐样本一致**、立体声联动、块长无关 |
| `SequencerUrlShare.ts` | **好** | base64 长度、字段范围、越界夹取、显式降级 |
| `StepCell`/`TrackRow` memo | **好** | `sequencerMemo.test.tsx` 用渲染探针证明 bail-out，而不是比 DOM 身份 |
| `DrumKitModels.ts` | **弱（危险）** | `drumKit.test.ts:93-101` 声称验证"噪声偏移是合法缓冲位置"，实际只断言 `Number.isFinite(offset) && offset >= 0`，**从不与 `mockNoiseBuffer.duration`（2.0 s）比较**。v2.0.47 那次"踩镲/打击乐/军鼓全静音"的回归（`DrumKitModels.ts:31-40` 把秒当样本数返回）就是这样绿着发出去的——20492 既有限又非负 |
| `AudioEngine` 调度器 | **未测** | 步进循环、真实 Web Audio 下的 masterGraph 接线、worklet 时钟回落都没有单测 |
| `WavExporter.renderPatternOffline` | **未测（真 DSP）** | 所有 parity 测试都跑在 `FakeOfflineAudioContext`（返回全零缓冲）上，只验接线与门控 |
| `MidiImporter` | **薄** | 3 个用例；SMPTE 分频、VLQ 溢出、轨道/音符数量上限全未覆盖 |

**测试套件看不见的两类 bug**：① "断言的是结构而不是声音"（DrumKit 静音回归）；
② "漏了生产真正走的那一步"（`sequencerHistory.test.tsx:138` 只走 reducer，没走机架同步 → §2.2 隐形）。
**这两类正是本轮 §2 里 4 个数据缺陷能发版的原因。**

### 5.3 结构与代码卫生（P2，不阻塞功能）

- **两个真实循环依赖**：`projectDb → useSequencerStore → projectStorage → projectDb`；
  `types/genre.ts → data/trackInsert.ts → data/genreMix.ts → data/genreExpression.ts → types/genre.ts`
  （根因是**类型模块 import 运行期数据**）。
- **上帝模块**：`sequencerReducer` **762 行 / 45 个 action 类型**（`useSequencerStore.ts:297-1058`）；
  `PianoRollLane.tsx` 2638 行、`GalaxyView.tsx` 2317、`Toolbar.tsx` 1889、`HelpCenterModal.tsx` 1686。
- **属性钻孔**：`StudioView` 向 `SequencerPanel` 传 **127** 个字段，`SequencerPanel` 再向 `Toolbar` 传 **83** 个；
  **两者都没有 `React.memo`** → 一次格子点击会重渲染 1889 行的 Toolbar。
- **197 个未使用符号 / 15 个空 catch**，但 `lint` 用 `--quiet` 跑，全部不可见；
  `.eslintrc.cjs:20-27` 关掉了 `no-explicit-any`（169 处）、`no-empty`、`no-case-declarations`。
- **无迁移阶梯**：`STORAGE_VERSION`/`GROOVE_DB_VERSION` 都是 1，版本不匹配就静默丢弃；
  每次操作新开一个 IndexedDB 连接且从不关闭。
- **仓库卫生**：19 份根目录规划文档约 600 KB，其中 `CODE_REVIEW_AND_PLAN_v1.16.0.md` 已经比当前版本老 5 个版本；
  `scratch/` 覆盖报告 31 MB、`e2e-out/` 61 个目录、`slowpack-out/` 2.3 MB（均已被 gitignore，可清理）。
  `src/` 里 **0 个真实 TODO/FIXME**（3 处命中是歌手名 XXXTENTACION）——**债务全在文档里，代码里没有信号**。

---

## 6. 需要你拍板的两件事

### D1 · 响度目标：继续"159 曲风互相对齐"，还是"对齐真实唱片"？

| 方案 | 动作 | 代价 | 我的建议 |
|---|---|---|---|
| A 保持现状（−15.7 LUFS 中位数对齐） | 什么都不做 | 继续比真实唱片安静 6–9 dB，一半曲风被重压、一半有空余 | 不推荐，但它是最稳的 |
| **B 新增"响度档位"（推荐）** | 保留现有 trim 表不动，另加一档 `loud`（目标约 −11…−12 LUFS，配合鼓/音乐总线压缩与胶水限幅），默认仍是 A | 需要新增一条总线与一套 trim；不改现有基线 | ✅ 用户可切换、可 A/B，风险可控 |
| C 直接把全库目标改到 −11 LUFS | 重配 159 条 trim + 重录响度与音色基线 | 影响全部曲风听感；需要重新走一遍实测流程；若总线压缩不足会"更响但更扁" | 不建议在功能版本里做 |

**无论选哪个，前置动作相同**：先做 §3.5 的 **S4（真响度/真峰值仪表 + 限幅器 GR 遥测）**，
否则"更接近唱片"这件事无法验收。

### D2 · GS-1（和弦/主音由 WASM 合成器发声）默认开还是关？

- **开（现状）**：chords/lead 有真复音与独立滤波包络，但（a）模块头注释与代码默认值自相矛盾，
  （b）已测的音色基线描述的很可能不是默认听到的声音，（c）**第一小节内会从原生切到 GS-1**。
- **关**：默认声音回到基线描述的状态，但失去这些角色最好的合成器。

**建议**：**保留开启**，但（1）把决策写进文档并删掉矛盾的注释，（2）**预加载** chords/lead 的 host 消除
第一小节的音色切换（`Gs1VoicePool.ts:99-108`），（3）重录音色/响度基线并把它写进发布流程。

---

## 7. 实施计划与验收门禁

### 7.1 v2.1.0 —— 止血 + 卷帘隔离播放（**建议先做这一版**）

| ID | 任务 | 文件 | 规模 |
|---|---|---|---|
| P0-1 | 版本同步 + 把 `version:check`/`docs:check`/`redlines` 置入 `verify` | `package.json:30`、`src/version.ts`、`public/version.json`、`public/sw.js`、3 份文档 | S |
| P0-2 | `SET_STEP_COUNT` 平铺修法 + `count` 白名单 + 保留逐轨 `trackLength` | `useSequencerStore.ts:811-881` | S |
| P0-3 | 加载工程不再污染历史（`LOAD_PROJECT` 带 `effectsRack`；机架同步不记历史） | `useProjectHub.ts:63-85`、`StudioView.tsx:225-237`、`useSequencerStore.ts:1159-1177` | S/M |
| P0-4 | 持久化快照逐字段校验/修复/清除；`.groove` 导入加 `try` 与体积上限 | `projectStorage.ts:131-161`、`projectDb.ts:467-491,543-566` | M |
| P0-5 | 机架端到端持久化 | `projectStorage.ts`、`useProjectHub.ts`、`useSequencerStore.ts:1089-1108` | S/M |
| P0-6 | 修点击"工作室"标签重置曲风 | `App.tsx:138-140` | S |
| P1-1 | **引擎 `previewScope`**：按轨过滤 + 步进范围 + 复用 playheadBus | `AudioEngine.ts`（`schedulerLoop`/`scheduleStep`/新增 setter） | M |
| P1-2 | **引擎 `previewChord(trackIdx, notes, vel, seconds)`**：一次原子调用、走轨道条、复用 `resolveChordTreatment` | `AudioEngine.ts`、`playChord` 复用 | S |
| P1-3 | `rollModel` 抽出 `previewProgressionNotes()`，与 `applyChordProgression` 共用 | `rollModel.ts:1072-1121` | S |
| P1-4 | 卷帘内"预览本轨"UI：播放/停止、范围、mute/solo 提示、关闭自动退出 | `PianoRollLane.tsx`、`SequencerPanel.tsx:618-640` | M |
| P1-5 | 试听路由与音序器一致（走轨道条）+ 被静音时的明确提示 | `AudioEngine.ts:1717`、`StudioView.tsx:775-782` | S |
| P1-6 | `useGenreAudition` 卸载 `destroy()` | `useGenreAudition.ts:24-30` | S |

**v2.1.0 验收标准（每条都要有测试）**：

1. 卷帘预览只发出被预览轨的声音；**预览前后 `trackStates` 数组逐字节相等**（证明没有偷改 mute/solo）。
2. 试听一副 4 音和弦只产生 **4 个声部**（用现有 `FakeAudioContext` 统计振荡器数：应为 8，而不是当前的 24）。
3. 试听发出的音**经过该轨的插入条与推子**（测试断言 `getTrackDestination` 被使用，而非 `masterGain`）。
4. 和弦进行"试听"与"写入"使用**同一个音符计算函数**（源码级断言：两处都调用 `previewProgressionNotes`）。
5. `SET_STEP_COUNT`：16→48/64/128 后**六个数组长度全部等于 stepCount**；polymeter 用例保持逐轨 `trackLength`。
6. 真实 `useProjectHub` 链路：加载后面板 `canUndo === false` 且 `bpm` 不变。
7. 坏快照（缺 `patterns.B` / `bpm:"fast"` / `activeSlot:"Z"`）**不抛异常**，被修复或清除后回落默认。
8. `npm run verify` 里包含版本与文档门禁；`version:check`、`docs:check` 退出码 0。
9. 点"工作室"标签不改变 `genreId`，不触发 `SET_GENRE`。

### 7.2 v2.1.1 —— 音质 Tier-1（§3.4 的 Q1–Q14）

全部纳入一个版本，配套新增**能失败的测试**（而不是结构断言）：
- 开镲 choke 的包络**逐样本**无跳变（二阶差分峰值门禁，`PolySynth` 已有同类测试可照抄）；
- 军鼓分发读到声明的 `instrument`（源码级 + 引擎侧各一条）；
- 底鼓音高轨：`endFreq / pitchMultiplier` 为常数；
- 鼓测试的噪声偏移断言改为 `offset < noiseBuffer.duration`（**直接堵住 v2.0.47 那类回归**）。

### 7.3 v2.1.2 —— 上手（§4）

1. ~~把 `toolbarTiers.DEFAULT_VISIBLE_IDS` 接进 `Toolbar.tsx`……~~ —— **已完成（v2.0.76）**，见 G.10。
2. ~~`layout.density` 真正生效~~ —— **已完成**：`useDensityPreference()` 在 `StudioView` 调用，
   `index.css` 有 `:root[data-density="compact"|"comfortable"]` 规则（本轮复核）。
3. ~~遮罩点击**不再**结束引导~~、~~设置里加"重看新手引导"~~、~~"按播放"~~ —— **已完成（v2.0.85）**，见 G.23。
   ~~"点一个格子"~~ —— **已完成（v2.0.87）**，见 G.25：教学教练按步骤**指向真实控件**，非模态、不挡点击。
4. ~~修 U6（iOS 静音下静默无声）……~~ —— **已完成**：`play()` 被 await 且有 catch，`isAudioBlocked()` 决定是否声称在播放，导出器不回退。
5. ~~补 U7 的静默 no-op~~ —— **已完成（v2.0.84）**，见 G.22。
6. 统一中文术语表（工作室/星系/音长/调音台各定一个词），加一条 i18n 术语一致性测试。
7. 音序器工具栏加 `?` 帮助入口（复用卷帘已有的 `onOpenHelp("sequencer")`）。
8. ~~`Modal` 加栈（只有最顶层处理 Escape / 恢复焦点）；`useId()` 替换写死的 `modal-title`~~
   —— **已完成（v2.0.86）**，见 G.24。顺带发现并修掉第三个缺陷：焦点 effect 依赖 `onClose`，
   而调用方传内联闭包，于是**每次宿主重渲染都会在 50ms 后把焦点抢回第一个可聚焦元素**。

### 7.4 v2.2.x —— 接近唱片（§3.5 S1–S7 + §4.3 四步出片）

按"S4 仪表 → S1 波表/齐奏/键盘跟踪 → S2 鼓组采样层与轮转 → S5 立体声 → S6/S7 空间"顺序推进。

### 7.5 全局门禁（建议写进 `verify`）

| 门禁 | 内容 | 现状 |
|---|---|---|
| 版本/文档/红线 | `version:check`、`docs:check`、`redlines` | 前两项**当前为红**，需修 |
| 覆盖率 | `test:coverage`（阈值 lines 78 / funcs 58 / branches 60） | 只跑在 CI |
| 音频不变量 | 包络连续性、真峰值天花板、**试听声部数**、**预览不改共享状态** | 部分有，本轮新增 |
| 响度/音色基线 | `loudness.baseline.json` / `timbre.baseline.json` | **只读已提交报告、从不重渲染** → 代码改动导致的实际漂移检测不到（上一条响度基线就是这样过期了 5.7 dB）。建议至少在发版流程里加一次真实重测 |

---

## 8. 两条必须遵守的边界（否则这轮改进会变成新的技术债）

1. **音质的最终判据是耳朵，不是代码。** 本文 §3 的所有结论都是"从结构推断的差距"。
   在动任何音色之前，先把**听感基线**建起来：用已有的浏览器离线渲染管线
   （`scripts/measure_genre_loudness.mjs` / `measure_genre_timbre.mjs` 的架构）
   导出 10–15 个代表曲风的 WAV，人耳过一遍并留档；此后每次音色改动都要重跑这套 A/B。
   **没有这一步，"更接近真实听感"无法验收，也无法防止改坏。**

2. **不要回退已经做对的东西。** 本仓库有几处很扎实的资产，改动时必须绕开而不是重做：
   `dspGuards.ts` 的指数斜坡单一收口（曾修掉调度卡死）；真实峰值前瞻限幅器 + 逐样本 parity 测试；
   `voiceRegistry` 的有界登记与无咔哒抢占；逐曲风混音表（1272 条解析值、曲风间 0.32 LU spread）；
   实时/离线共用同一张 `buildMasterGraph`（曾解掉导出与试听两套声音）；以及
   `rollModel` / `limiterTruePeak` / `sequencerMemo` 这三个"断言的是行为而不是形状"的测试。

---

## 附：本轮证据复现命令

```bash
# 基线（全部通过）
npx tsc --noEmit                      # exit 0
npx vitest run                        # 144 files / 1690 tests 全绿（~178s）
npx eslint 'src/**/*.{ts,tsx}' --quiet # exit 0（不加 --quiet：205 warnings / 0 errors）

# 当前为红的两个门禁
node scripts/version.mjs check        # exit 1
node scripts/check_docs.mjs           # exit 1

# 试听声部放大（探针已删除，结论：4 个音 -> 24 oscillators）
# SET_STEP_COUNT 截断（探针已删除，结论：stepCount=128 但六个数组长度=32）
```

---

# 附录 A · 本轮施工状态（暂停点，等系统重启）

> 记录于 2026-09-18。这一节是**跨重启的交接单**：已完成什么、当前代码处在什么状态、重启后第一件事做什么。

## A.1 已完成并验证

### 诉求 ①：钢琴卷帘试听 + 单独播放 —— 已完成

| 项 | 内容 | 证据 |
|---|---|---|
| 试听根因 | 和弦试听对**每个和弦音**各调一次 `onAudition`，而 chords 轨的 `triggerNote` 会为传进来的**单个音**再配一副和弦 → 4 个音发出 **12 个声部（24 个振荡器）** | `src/test/pianoRollPreview.test.ts` 断言 4 音 → **8 个振荡器**（旧实现 24） |
| 统一发声路径 | 新增 `AudioEngine.previewChord(trackIdx, notes, velocity, seconds)`：一次调用播放**整副已完成声部**，走轨道条（该轨的插入/推子/声像），复用 `resolveChordTreatment` | 同上，另有「不重新配和声」与「空/非法音符不发声」两条 |
| 试听=写入 | 抽出 `previewProgressionNotes()`，`applyChordProgression` 与试听**共用**；时值改用真实步长（不再写死 450 ms） | 测试断言试听的和弦与写入的 pitch 数组逐音相等 |
| 单独播放 | `AudioEngine.setPreviewScope({trackIdx, fromStep, toStep})`：调度器只发该轨、范围循环、复用走带与播放头总线 | 断言「不修改 `trackStates`」「非法范围清空而非播全曲」「`scheduleStep` 只返回该轨」 |
| UI | 卷帘新增「试听本轨 / 停止 + 范围（全轨 / 第 N 小节）」，关闭卷帘自动停止 | `piano-roll-preview-suite` / `piano-roll-preview-toggle` / `piano-roll-preview-range` |
| i18n | 6 条中英键 | `src/i18n/locales/studio.ts` |

### 音质 Tier-1（Q1–Q14）—— 已完成 13 项

| 项 | 内容 |
|---|---|
| Q1 | 开镲 choke 由**阶跃**改为按解析式包络锚点淡出（新增纯函数 `drumEnvelopeLevelAt`，实时与离线同步） |
| Q2/D8 | 51/159 个声明 `clap`/`rimshot` 的军鼓轨改由打击乐库发声（新增 `instrumentWantsPercussionVoice`） |
| D9 | 选底鼓预设不再连带换掉整套鼓（新增 `drumKitForVoice`） |
| Q3 | 鼓的音高轨**整体移调**（终频不再写死） |
| Q4 | 909/acoustic/cyber 踩镲补上 6 个不谐方波金属簇 |
| Q5 | 开镲时值上限 0.45 s → 0.6 s，且不再被步进门长限死 |
| Q6 | 拍手 3 次爆发 + 主体各读**不同**噪声切片（新增 `noiseOffsetForLayer`） |
| Q7 | 4 套底鼓补齐**饱和级**（原先注释声称有、实现里没有） |
| Q8 | 6 套 `kick:*` 预设接上力度→音色 |
| Q9 | 24 dB 滤波第二级跟随同一条包络扫频 |
| Q10 | 实时 ratchet 夹取 1..8（与导出一致） |
| Q11 | 母带推子 + 延迟反馈改用 `setTargetAtTime` |
| Q12 | 母带加 20 Hz DC 阻断 |
| Q13 | 母带 DRIVE 曲线定义域 ±1 → ±2，消除 >0 dBFS 硬削波 |
| Q14 | 声部 `onended` 时 `disconnect()` |
| ~~限幅器起音平滑~~ | **已尝试并回退**：三次实现分别导致天花板泄漏到 +1.9 dBTP 或块长不一致，已恢复原球istics并在代码注释与 §3.5 登记为待办 |

**新增/修改的测试**：`drumFidelityTier1.test.ts`（新增 11 条）、`pianoRollPreview.test.ts`（新增 8 条）、
`drumKit.test.ts` 的噪声偏移断言改为**上界**（堵住 v2.0.47「静音一整版」那类回归）、
`effectsRack.test.ts` 新增 Q13 平台检测、`masterLoudnessTrim.test.ts` / `wavLoudnessTrim.test.ts` 的链路断言更新。

**基线**：`npx tsc --noEmit` 0 error；`npx vitest run` **146 文件 / 1710 用例全绿**。

## A.2 响度重定向 —— 实测结论与进行中的工作

### 已实测（这是本轮最重要的发现）

| 实测项 | 数值 |
|---|---|
| 159 曲风「峰均比」（真峰值 − LUFS） | 最小 **4.36 dB**（death-metal）、中位 **14.34 dB**、最大 **17.04 dB**（microhouse） |
| 在 −1.0 dBTP 天花板下**物理上**能达到 −11 LUFS 的曲风 | **21 / 159**（几乎全是摇滚/金属） |
| 增益传递率（已顶天花板时再加增益） | chicago-house：**+10 dB → −0.1 LUFS（0%）**；ambient：最深一步仅 28% |
| 结论 | **全库统一 −11 LUFS 不可能**，除非把中位峰均比从 14.3 压到 9.7 dB（=大幅牺牲动态） |

**原因**：限幅器只能压峰、不能提响；顶到天花板后，再加的增益被限幅器全部吃掉。
所以「更响」的唯一途径是**降低峰均比**（压缩/削波），而不是加增益。

### 已按你的选择（按大类分档）实现的改动

1. `masterGraph.ts` 新增 **母带总线压缩级**（2:1 / 30 ms / 220 ms / 8 dB knee，软膝），
   实测把 chicago-house 的峰均比从 11.3 降到 10.67 dB。
2. `masterGraph.ts` 新增 **`MASTER_MAKEUP_DB = 5`** 固定补偿级（在 trim 与总线压缩之后、限幅器之前），
   实时与离线共用，故导出与播放一致。pre-trim 全库中位由 **−15.72 → −12.83 LUFS**。
3. `measure_genre_loudness.mjs` 支持 **按大类目标表**：
   Rock/Metal −10、Hip Hop −12.5、Electronic −13、Pop/R&B −13.5、Latin/World −13.5、Jazz/Blues −14.5；
   并对每个曲风取 `min(类别目标, 天花板−峰均比)`，**物理上做不到的不硬拉**。
4. `check_loudness_spread.mjs` 的 spread 门禁改为**分类别**校验（类别内 p90−p10 ≤ 1.5 dB），
   全库跨度只作信息输出——因为分档目标本来就故意让金属比 ambient 响。

### 暂停时的状态（重要）

- 全量测量跑到 **159/159 首轮 + 第 2 轮 60/85** 时被暂停，**未写入最终报告**。
- `scripts/loudness.baseline.json`（已提交的旧基线）**完好未动**，仍是 159 曲风 / target −15.716。
- `src/data/genreMix.ts` 的 159 条 trim **仍是旧值**，尚未回填。
- 因此当前 `check_loudness_spread.mjs` 会**失败**（代码默认值已改、基线未重录）——
  这是预期的中间态，**不是缺陷**，重启后重跑一次全量测量即可闭环。

### 重启后的第一件事

```bash
# 1. 全量重测（--repeats=1 足够：脚本自身实测重复渲染离散度 ±0.00 dB）
node scripts/measure_genre_loudness.mjs --repeats=1 --out=scripts/loudness.baseline.json
# 2. 回填 159 条 trim 到 src/data/genreMix.ts（脚本报告里逐曲风给出 trimDb）
# 3. 通过门禁
node scripts/check_loudness_spread.mjs
node scripts/check_timbre_spread.mjs      # 音色基线也需重录（母带链路变了）
```

## A.3 关于「Playwright 跑 Chrome 慢 / 吃 CPU 是不是没用集显」

**结论：不是集显的问题，重启也基本不会让这套测量变快。**

- 本机 `lsmod` 显示 **i915 已加载且在use**（Intel 集显驱动正常），另有一块 AMD 独显；
  但当前会话**看不到 `/dev/dri`**（命令运行在 bwrap 沙箱里，`--dev /dev` 未暴露 GPU 设备节点）。
  即便如此——
- **这套测量根本不用 GPU**：`measure_genre_loudness.mjs` 的浏览器只做一个页面里的
  `OfflineAudioContext` 离线渲染，算的是音频 DSP（8 轨合成 + 逐轨插入 + 总线 + 母带 + 真峰值限幅），
  **Chromium 不会把 `OfflineAudioContext` 的渲染丢给 GPU**。慢的原因是纯 CPU 的 DSP 工作量：
  每个曲风要渲染多次整曲（首轮 + 每轮 trim 迭代），单曲风 4–15 秒。
- 本机 8 核，且当时系统同时有测量子进程 + 你在用的浏览器/IDE，所以更慢。

**真正能提速的杠杆**（都已在脚本里）：
`--repeats=1`（默认 2，实测离散度 ±0.00 dB，纯浪费一倍时间）、
`--bars=2`（默认 3）、`--limit=N` 或 `--genres=a,b,c` 只跑子集。

**可顺手做的一件小事**：给 Playwright 的 `chromium.launch` 加
`--use-gl=angle --use-angle=gl --enable-gpu-rasterization`，
这样如果 `/dev/dri` 暴露出来，页面合成会走 GPU（但如上所述对本测量帮助很小）。

### A.3b 重启后复核（GPU 与权限）

系统重启 + 文件策略放宽为 `danger-full-access` 后实测复核：

- **`/dev/dri` 现在可见**：`card1`（Intel 2nd-gen iGPU，`root:video 226:1`）、
  `renderD128`（`root:render 226:128`，全局可读写）。**宿主侧 GPU 节点确实存在**；
  之前看不到是沙箱 `--dev /dev` 没暴露，不是驱动或硬件问题。
  另有 Vulkan ICD（`intel_icd.json` / `radeon_icd.json`）与完整 Mesa DRI 驱动集。
- **但对本测量依旧没有帮助**：`OfflineAudioContext` 的离线渲染走音频渲染线程，**不使用 GPU**。
  实测佐证：重启前后单曲风耗时基本一致（8.8–9.2 s/曲风）。
- **结论：不接入 GPU。** 加 GPU 参数只会改变页面合成路径，对纯 DSP 负载是噪声，
  反而在旧 iGPU/独显上增加渲染进程不稳定的风险。真正的提速杠杆仍是
  `--repeats=1`（本轮已默认采用）与 `--bars`。
- **权限放宽后仍有一个沙箱行为残留**：`nohup … &` 启动的进程**不随命令会话存活**，
  必须用受管后台任务（`run_in_background`）。否则会在第 1 个曲风后静默消失
  （本轮踩到两次，现象是日志停在第 1 行、进程消失）。已写入本节以免后续再踩。

## A.4 本轮未做（登记，避免误以为已完成）

- **限幅器起音平滑**：见 Q 那一行的说明，三次尝试后回退，需要离线迭代再动。
- **母带链路改动后的音色基线重录**：`timbre.baseline.json` 尚未重录（母带变了，它一定会漂移）。
- **按大类分档的响度门禁**：代码已改，但**尚未有一次成功写入的新基线**验证过它。
- §3.5 的结构性工作（波表/齐奏/键盘跟踪、鼓组采样层与轮转、立体声完整性、混响 IR 移出主线程、
  延迟不重建图）与 §4 的上手改造（toolbarTiers 接线、密度设置、首屏单一动作、iOS 静音无声等）**均未开始**。

---

# 附录 B · 交付结果（本轮完成）

> 2026-09-18。承接附录 A 的交接单；本节是**结果与证据**，不是计划。

## B.1 音质 Tier-1（Q1–Q14）

全部完成 14 项中的 13 项，第 14 项（限幅器起音平滑）**已尝试并如实回退**。

| 项 | 交付 | 可失败测试 |
|---|---|---|
| Q1 开镲 choke | `drumEnvelopeLevelAt` + 实时/离线同锚点 | `drumFidelityTier1.test.ts` 包络解析式 + 单调性 |
| Q2 / D8 军鼓 instrument 路由 | `instrumentWantsPercussionVoice`，clap/rimshot 走打击乐库 | 同名测试：真实区分 clap 与普通军鼓 |
| D9 底鼓预设不连带换整套鼓 | `drumKitForVoice` | `kick:berlin-orphic` → 909 而非 808 |
| Q3 鼓音高轨整体移调 | 终频随 `pitchMultiplier` | `+12 半音 → 84 Hz` 精确断言 |
| Q4 踩镲金属簇 | 非 808 套件补 6 个不谐方波 | `squareOscillators === 6` |
| Q5 开镲时值 | 上限 0.6 s、下限 0.25 s、不再被步进门长限死 | 时值区间断言 |
| Q6 拍手去相关 | `noiseOffsetForLayer` 按层分配 | 4 个偏移互不相同 |
| Q7 底鼓饱和级 | `applyKickSaturation` + `KICK_BODY_DRIVE` | 4 套件各一个 shaper，`oversample 2x` |
| Q8 `kick:*` 力度→音色 | grit/softness/decay 随力度 | 见 `AnatomyKickEngine` 注释与既有套件 |
| Q9 24 dB 滤波包络 | 两级共用 `cutoffStages` | `polySynth`/`insertCurves` 套件 |
| Q10 ratchet 夹取 | 实时改用 `resolveRatchet` | 与导出一致 |
| Q11 zipper 平滑 | 母带推子 `setTargetAtTime`；延迟反馈/阻尼平滑 | 既有母带/延迟套件 |
| Q12 DC 阻断 | `MASTER_DC_BLOCK_HZ` 高通入主链路 | 链路断言 + 频谱套件 |
| Q13 DRIVE 硬削波 | 曲线定义域 ±1 → ±2 | **新增 Q13 专项测试**：>0 dBFS 不再平台化 |
| Q14 声部释放 | `releaseVoiceNodes` on `onended` | 声部套件 |

**并顺带堵住一个历史回归**：`drumKit.test.ts` 的噪声偏移断言由 `isFinite && >= 0`
改为 **上界**（`offset + 0.5s ≤ buffer.duration`）——v2.0.47「踩镲/打击乐/军鼓整版静音」
就是靠旧断言绿着发出去的。

## B.2 诉求 ①：钢琴卷帘试听与单独播放

| 项 | 交付 |
|---|---|
| 试听根因 | 和弦逐音触发导致**每个音再配一副和弦**（4 音 → 12 声部 / 24 振荡器）。新增 `AudioEngine.previewChord()` 一次播完整声部，走该轨插入/推子 |
| 试听 = 写入 | 抽出 `previewProgressionNotes()`，与 `applyChordProgression` **共用**同一份音符计算；时值改用真实步长 |
| 单独播放 | `AudioEngine.setPreviewScope()`：调度器只发该轨、按范围循环、复用走带与播放头总线；**不修改 `trackStates`** |
| UI | 卷帘「试听本轨 / 停止 + 范围（全轨 / 第 N 小节）」；关闭卷帘自动停止 |
| 测试 | `pianoRollPreview.test.ts` 8 条：4 音 → **8 个振荡器**、不重新配和声、非法输入不发声、预览不改共享状态、`scheduleStep` 只返回该轨 |

## B.3 响度重定向（按你拍板的「按大类分档」）

**母带链路新增两级**（实时与离线共用，导出与播放一致）：
`fader → DC 阻断 → FX 机架 → trim → 固定补偿 +5 dB → 母带总线压缩(2:1/30ms/220ms) → 真峰值限幅`

| 指标 | 改造前 | 改造后 |
|---|---|---|
| 全库中位 | −15.72 LUFS | **−12.92 LUFS** |
| Rock/Metal 中位 | ≈ −15.7 | **−9.90** |
| Electronic 中位 | ≈ −15.7 | **−12.91** |
| Pop/R&B 中位 | ≈ −15.7 | **−13.18** |
| Latin/World 中位 | ≈ −15.7 | **−13.69** |
| Jazz/Blues 中位 | ≈ −15.7 | **−14.10** |
| Hip Hop 中位 | ≈ −15.7 | **−14.37** |
| 最差真峰值 | −1.09 dBTP | **−1.12 dBTP**（0/159 超 −1.0） |
| trim 回填 | — | 159 条（101 条非零，−9 … +6.65） |
| 被自身峰均比封顶 | — | **69/159**（报告逐曲风记录，属物理而非拟合错误） |

**音色基线**同步重录：159/159 互异，最近一对 `microhouse ↔ ambient-techno` 0.3039 dB（地板 0.25）。

## B.4 门禁状态（全部为绿）

| 门禁 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 error |
| `npx vitest run` | **1710 / 1710 通过**（146 文件） |
| `scripts/check_loudness_spread.mjs` | ✅ 通过（改为检查「不超类别目标 + 每曲风在最终 trim 上测过」，不再对已封顶曲风误报） |
| `scripts/check_timbre_spread.mjs` | ✅ 通过 |
| `scripts/version.mjs check` / `check_docs.mjs` / `redlines.mjs` | ✅ 全绿（23 条红线） |
| `check:budget` / `check:gs1` / `lint` / `lint:data` | ✅ 全绿 |
| Playwright E2E 7 端 | ✅ 7/7 通过 |
| `npm run verify` | 已把 `version:check`、`docs:check`、`redlines` 前置进链路（此前只在 CI 跑，本地发版可绕过） |

## B.5 遗留（明确未做）

1. **限幅器起音平滑**：三次实现分别导致天花板泄漏至 +1.9 dBTP 或块长不一致，已回退并在
   `MasterLimiter.ts` 注释、本文件 §3.5 双处登记。正确做法是离线迭代（构造增益包络使其
   在瞬态离开延迟线前到位），不适合在功能轮次里猜。
2. **`achievableLufs` 已从门禁移除**：它是透过限幅器测得的，在曲风顶到天花板后该量已成循环
   定义（会误报「未被拟合」）。门禁改查真正成立的属性，理由写在 `check_loudness_spread.mjs`。
3. §3.5 结构性工作（波表/齐奏/键盘跟踪、鼓组采样层与轮转、立体声完整性、混响 IR 移出主线程、
   延迟不重建图）与 §4 上手改造（toolbarTiers 接线、密度设置、首屏单一动作、iOS 静音无声等）**未开始**。

---

# 附录 C · 手机端独立 UI（本轮交付）

> 目标：手机端按自身特点取舍功能（难做好用的不提供），交互要好、不堆砌按钮；禁止误触放大镜与页面缩放；接近原生应用体验。

## C.1 已交付（v2.0.50 / v2.0.51）

| 项 | 内容 | 证据 |
|---|---|---|
| 禁止放大镜与缩放 | viewport 去掉 `maximum-scale`（它会重开双指缩放，iOS 上一旦可缩放就恢复长按放大镜——密集步进格上等于每次点格子都被挡住）；根样式 `touch-action: manipulation` 消除双击缩放（连点两格打拍子以前会把整页放大）；`overscroll-behavior: none` 去掉回弹与下拉刷新；文档禁横向滚动 | `deviceCapabilities.test.ts` 源码级断言 viewport 与 CSS |
| 原生观感 | `theme-color`、PWA/standalone 元信息、`apple-mobile-web-app-status-bar-style`、`format-detection: telephone=no` | `index.html` |
| 能力探测单一来源 | 新增 `useDeviceCapabilities`：触控/手机/横屏/减弱动效，读平台（`pointer: coarse` + 尺寸 + 朝向）而非 UA 嗅探；分类是纯函数，所以**横屏手机**（844px 宽，单看宽度会被当成平板）可测 | `deviceCapabilities.test.ts` 8 条 |
| 手机底部导航 | 五格标签栏（工作台/探索/学习/工具/我的），全部带文字标签、52px 触控高度、安全区适配；`pointerup` 即响应而非等 ~300ms click；别名视图点亮所属标签 | `mobileShell.test.tsx` 14 条（含「图标必须有文字标签」「跨度覆盖全部视图」） |
| 其余视图收进抽屉 | 一个底部抽屉按用途分组，56px 行且带说明；四种关闭方式（背景/按钮/Esc/把手拖拽） | 同上 + 手势回归 3 条 |
| 走带条替代 64 按钮工具栏 | 六个控件（播放/上一小节/下一小节/速度读数/撤销/重做/更多），全部 44px，**不含文本输入框**（键盘弹起遮网格本身就是缺陷）；被收纳的 15 项全部进抽屉 | `mobileTransportBar.test.tsx` 21 条，含**控件数上界**断言 |
| 刻意不提供 | 硬件调音台不进入手机抽屉（100mm 推子 + ±0.1dB 精度在 390px 上不是难做而是难用；同一条混音可由每轨音量/声像完成）。有测试断言它不在，同时断言其余视图全可达 | 同上 |
| 触控目标 | 轨道行 8 个按钮 20px → **36px**（桌面保持 16px）；走带条 44px；抽屉行 56px | `mobileTransportBar.test.tsx` 尺寸断言 + E2E |
| 宽度预算 | 走带条总宽按最窄支持机型 360px 预算，导出为常量并有测试断言（此前总宽超 390px 导致「更多」在屏幕外 x=385，被收纳控件完全无法进入） | 同上 |

> **勘误（v2.0.73，见附录 G.12）**：本表「禁止放大镜与缩放」「禁止误触放大镜与页面缩放」两行里
> 关于 `overscroll-behavior: none` 与「viewport 去掉 `maximum-scale`」的描述**已经不是现状**：
> 根部的 `overscroll-behavior` 后来改成按轴拆开（`-x: none; -y: auto`），因为 `none` 让
> **macOS Chrome 的双指滚动彻底失效**；`maximum-scale` 后来也加回了 `1.0`
> （去掉它并不能阻止缩放，只是不再**限制**缩放）。表内其余内容仍准确。

## C.2 本轮查出并修掉的真实缺陷（都由 E2E 矩阵发现）

1. **走带条溢出屏幕**：总宽 > 390px，`更多` 按钮 x=385 落在屏幕外 → 所有被收纳控件不可达。
2. **点抽屉里的行会关闭抽屉**：拖拽关闭手势原先加在整张抽屉上且无守卫，任何 pointerup 比 pointerdown 低 60px 就关闭——点靠下的行会被误判为下滑关闭。
3. **标签栏遮挡轨道检查器**：标签栏 `z-[70]` 固定底部、检查器 `bottom-0 z-50`，最后约 52px 被盖住；横屏手机检查器只有 ~279px 高，**整块 EQ 画布**都在被盖区，实测症状是 EQ 频段手柄的命中落到标签栏按钮上、拖动完全无效。改为共用 `--mobile-tab-bar-h`（默认 0，仅在手机断点下非零）。
4. **发布门禁在测旧产物**：E2E 服务 `dist/`，`npm run build` 失败时七个目标仍全绿（本轮真实发生）。现加构建产物过期守卫。
5. **`version:check` 误报**：它要求规划文档写死精确行数，该数字随未跟踪文件与测量时机浮动，导致版本正确时门禁变红。改由 `check_docs.mjs` 单一负责（±10% 容差）。

## C.3 仍未做（下一轮优先级）

1. **手机端仍显示桌面快捷键提示**：`SequencerPanel` 底部提示与走带条旁文案在手机上仍写「空格播放 / V 力度 / E 欧几里得 / Ctrl+Z」，而手机没有键盘。
2. **走带条与标签栏双层堆叠**：底部共占 ~104px，竖屏 664px 下约 16% 视口。需评估是否把走带合并进标签栏上沿或改为可折叠。
3. **`StepCell` 在手机上 28×40px**（高度差 4px 到 44 门槛），横向密度与可点性的取舍需要真机手感确认。
4. **钢琴卷帘在手机上仍是 128 行抽屉**：`touch-action: none` 抑制单指平移，53 个按钮。需要决定「简化到什么程度」或降级为只读预览。
5. **§3.5 结构性音质工作**（波表/齐奏/键盘跟踪、鼓组采样层与轮转、立体声完整性、混响 IR 移出主线程、延迟不重建图）与 **§4 上手改造**（toolbarTiers 接线、密度设置落地、首屏单一动作、iOS 静音无声）仍未开始。
6. **限幅器起音平滑**：三次尝试后回退，需离线迭代（见 §3.5 与 B.5）。

## C.4 追加交付（v2.0.52 / v2.0.53）

| 项 | 内容 |
|---|---|
| 步进格尺寸 | 手机 28×40px → **36×44px**（宽低于约 32px 可用下限、高差 4px 到 44px 建议值）；桌面保持 16px 行高与自适应宽度。测试 `stepCellGeometry.test.tsx` 钉住宽/高/紧凑覆盖仍生效/`touch-action` 未被移除四项 |
| 手机端不再提供钢琴卷帘 | 实测抽屉高 **1095px**、网格宽 **2304px**、工具栏 **55 按钮**、网格必须 `touch-action: none`（单指要画音符，没手势留给平移）→ 绝大部分网格在屏幕外且无法导航。按「不提供难做好用的功能」原则撤下；音符仍在步进网格编辑，和弦走向用「和弦」视图 |
| 明确省略而非静默消失 | 抽屉入口改为「编辑音符」说明，讲清原因并给出前往和弦视图按钮；E2E 在手机端断言该说明存在、有去处、且可关闭 |

**手机实测几何（改后）**：步进格 36×44px；标签栏 53px + 走带条 59px = 视口 17%（664px 高）。
双层底部栏仍是待评估项（见 C.3）。

## C.5 手机端独立 UI —— 交付完成判定

本轮目标中「手机端重新设计独立 UI」的四项要求已全部落地并有测试与真机矩阵证据：

| 要求 | 交付 | 证据 |
|---|---|---|
| 按手机特点取舍功能（难做好用的直接不提供） | 硬件调音台不提供（同一条混音可由每轨音量/声像完成）；**钢琴卷帘撤下**（实测抽屉 1095px、网格 2304px、55 按钮、无手势可平移）。两者都有测试断言「不出现」，且被撤下的功能在界面上**明确说明原因并给出去处** | `mobileShell.test.tsx`、`mobileTransportBar.test.tsx`、E2E 手机端断言说明弹层与和弦入口 |
| 交互要好、绝不密密麻麻堆砌按钮 | 底部五格标签栏（全部带文字、52px）+ 一个分组抽屉（56px 行带说明）+ 六控件走带条（44px、无文本输入框），替代桌面 64 按钮工具栏；控件数上界写成测试 | `mobileTransportBar.test.tsx` 断言渲染按钮数 ≤7；`mobileShell.test.tsx` 断言标签数=5 且跨视图可达 |
| 禁止误触放大镜与页面缩放 | viewport 去掉 `maximum-scale`；根样式 `touch-action: manipulation`、`overscroll-behavior: none`、禁横向滚动 | `deviceCapabilities.test.ts` 源码级断言 |
| 接近原生应用 | 五格标签栏 + 底部抽屉 + 指针抬起即响应（不等 ~300ms click）+ 安全区适配 + 主题色/PWA 元信息 | `mobileShell.test.tsx`（断言 `pointerup` 触发而非 click）、`index.html` |

**全链路绿灯**：`npm run verify` = 0；typecheck、lint、data lint、**1763 单测**、build、budget、GS-1、23 红线、**7/7 浏览器与设备目标**（含 iPhone 竖/横、iPad 竖/横）。

### 仍未完成（不阻塞「手机端 UI」这一项，属产品规划后续）

1. **底部双层栏**：标签栏 53px + 走带条 59px = 664px 视口的 17%。已量到数字，是否合并/折叠待评估。
2. **§4 上手改造**（桌面与手机共用）：`toolbarTiers` 三层分级仍未接入渲染路径、`layout.density` 无消费者、首屏单一动作、iOS 静音无声（`play()` 未 await/catch）、静默 no-op 与 toast 可达性。
3. **§3.5 结构性音质**：波表/齐奏/键盘跟踪、鼓组采样层与每击轮转（**每击轮转已于 v2.0.73 完成**，
   见 G.13；采样层仍未做）、立体声完整性、混响 IR 移出主线程、延迟不重建图。
4. **限幅器起音平滑**：三次尝试后如实回退，需离线迭代。

---

# 附录 D · 关键跟踪与播放真实性（v2.0.54 / v2.0.55）

## D.1 键盘跟踪：响度的「系统性偏差」而非个案

**缺陷**：滤波截止频率是**绝对常数**。C2 的贝斯与 C6 的主音都开到预设写的同一个值（长笛 2.6kHz、贝斯 1.2kHz）。相对各自基频，低音是「全开」（薄、亮、无厚度），高音是「几乎关死」（闷）——与真实共鸣体的行为正好相反。

**为什么这是最重要的一项**：它不是某个预设没调好，而是**全部 51 个预设共有的偏差**，因此是「每个曲风更接近真实听感」这个核心诉求的直接阻碍之一。

**修法**：默认开启（`keyTrackFilter` 缺省 = 0.5，即音高移动一个八度、截止频率移动半个八度），因为原行为就是缺陷；`keyTrackFilter: 0` 可让刻意固定角落的预设退出。参考音为 C4（`KEY_TRACK_REFERENCE_MIDI`），所以每个预设里写的数字仍然意味着「C4 时的值」。比例从**振荡器频率**推导而非 MIDI 参数——引擎既传绝对音高也传角色相对偏移，只有频率是共同基准。公式抽成导出的 `keyTrackedCutoff(preset, midi)`，音色路径与测试共用一份。

**顺带效果**：一副 C-E-G 和弦的三个音现在各有不同截止频率（三音比根音亮），而不再是三个相同设置——实时与离线两条路径都有断言。

## D.2 播放真实性

`play()` 会 `await ctx.resume()`；iOS 静音开关或需要新手势的浏览器会让它被拒绝、或让上下文保持 suspended。此前调用处不 await、不 catch，却无条件置「播放中」——按钮亮、播放头走、**没有声音**，且 Promise 拒绝无人处理。

现在：新增 `AudioEngine.isAudioBlocked()` 直接读上下文真实状态；`handleTogglePlay` await `play()`、捕获拒绝、只在真的开始播放时才报告；被阻止时**停止走带并说明原因**。

## D.3 基线重录（按仓库规矩）

键盘跟踪改变音色与电平，因此：

| 基线 | 结果 |
|---|---|
| 响度（159 曲风，`--repeats=1`，5 轮迭代求解） | 中位 **−13.04 LUFS**；最差真峰值 **−1.25 dBTP**（0/159 超 −1.0）；trim 回填 159 条（98 非零，−8.9 … +6.66） |
| 分类别中位 | Rock/Metal −9.90 ｜ Electronic −12.91 ｜ Pop/R&B −13.18 ｜ Latin/World −13.74 ｜ Jazz/Blues −14.09 ｜ Hip Hop −14.56 |
| 音色指纹 | **159/159 互异**，最近一对 `french-house ↔ nu-disco-house` **0.3074 dB**（地板 0.25） |

两个门禁均通过（`check_loudness_spread` / `check_timbre_spread`）。

**测试订正说明**：parity 套件此前断言 `toContain(preset.filterCutoff)`——这只在「截止频率忽略音高」时成立，也就是**只在缺陷存在时成立**。现改为断言实际演奏音符的跟踪值，并新增「各音截止频率互不相同」的断言。同一个主张（用的确实是这个预设），描述修正后的行为。

## D.4 本轮发行

| 版本 | 内容 |
|---|---|
| v2.0.54 | 播放真实性（`isAudioBlocked` + await + 被阻止时停止并说明） |
| v2.0.55 | 键盘跟踪 + 两条基线重录 + parity 断言订正 |

**全链路绿灯**：`npm run verify` = 0（typecheck、lint、data lint、**1777 单测**、build、budget、GS-1、23 红线、7/7 设备目标）。

## D.5 剩余（§3.5 其余项，按 收益÷成本 排序）

1. **逐 preset 力度→音色覆盖**：目前 21/51 个预设支持，其余 30 个只有音量。
2. **Unison / 立体声展开**：`supersaw` 目前是两把锯齿，真实超级锯是 7 路失谐。
3. **波表（`createPeriodicWave`）**：风琴拉杆、钢琴/钟琴的不谐分音目前无法实现。
4. **鼓组采样层与每击轮转**（`DrumKitModels` 100% 合成、噪声偏移按步进确定）。
5. **立体声完整性**（混响 IR 移出主线程、延迟不重建图）。（送出与合唱已修，见 G.19 / G.20。）
6. **限幅器起音平滑**：三次尝试后如实回退。
7. **§4 上手改造**：~~`toolbarTiers` 接线~~、~~`layout.density` 落地~~、~~静默 no-op~~ 已完成（G.10 / G.22）；~~首屏单一动作~~ —— **已完成（v2.0.88）**，见 G.26：首屏一条细提示「按播放，再点亮一个格子」，播过一次或主动关掉就永久退场（手机端不显示）。
8. **手机端底部双层栏**（标签栏 53px + 走带条 59px = 视口 17%）。

---

# 附录 E · 力度→音色全覆盖（v2.0.56）

## E.1 缺口与修法

**缺口**：21/51 个预设支持「力度→音色」，其余 30 个只改音量。轻弹与重弹只差响度——「像是编出来的、不是弹出来的」最典型的破绽。

**实测依据**：出厂 pattern 的力度**本来就有 12 种取值**（50–120，扫描 `src/data/genres/**` 得到），所以映射是可听的，不是理论上的。

**修法**：30 个预设逐一按乐器特性给出深度，而不是共用一个数字：

| 类别 | 深度 | 依据 |
|---|---|---|
| 击弦类（`deepPluck` 1.9、钢琴/颤音琴已在原标注内） | 最深 | 琴弦的亮度确实随击打力度变化 |
| 吹奏/拉奏类（`panFlute` 2.1、`hornStab` 1.9、`brassSection` 2.0） | 次深 | 气息压力同时抬高音量与亮度 |
| 垫子/风琴（`warmPad` 1.0、`m1Organ` 0.7） | 最浅 | 持续音没有声学理由随力度大幅变亮 |
| 噪声类过渡音色（`vinylCrackle` 0.5、`tapeStop` 0.6） | 最轻 | 它们是「手势」不是「音符」 |

**安全性**：每个深度项在满力度时都是**精确空操作**（因子含 `(velCurve − 1)` 或 `(1 − velCurve)`，在 `velCurve === 1` 时为 0）。这一点由测试断言，而不是靠算术「应该如此」。

## E.2 两个纯函数抽出

`keyTrackedCutoff(preset, note)` 与 `velocityScaledCutoff(preset, note, velocity)`——音色路径与测试**问同一个问题**，而不是各自重推公式。这也顺带修掉一处覆盖缺口：键盘跟踪原先在 `filterCutoff` 的**消费者之后**计算，导致滤波包络与 24dB 第二级用的是**未跟踪**的基准值；现在跟踪在任何消费者之前建立。

## E.3 测试订正

`velocityTimbre.test.ts` 此前断言「未标注的预设在任何力度下音色相同」——这在 30 个预设确实如此时是对的，而**正是本次修掉的缺陷**。现改为对**剥离了动态的副本**断言短路性质：保证不变，且不再依赖库里存在缺陷。

## E.4 基线重录

| 基线 | 结果 |
|---|---|
| 响度（159 曲风） | 中位 **−12.98 LUFS**；最差真峰值 **−1.24 dBTP**（0/159 超 −1.0）；trim 回填 159 条（99 非零，−8.96 … +6.46） |
| 音色指纹 | **159/159 互异**，最近一对 0.3075 dB（地板 0.25） |

两个门禁通过；`npm run verify` = 0（1773 单测 + 7/7 设备目标）。

## E.5 剩余（按 收益÷成本）

1. **Unison / 立体声展开**：`supersaw` 目前是两把锯齿，真实超级锯是 7 路失谐 + 相位随机。
2. **波表（`createPeriodicWave`）**：风琴拉杆、钢琴/钟琴的不谐分音目前机制上做不到。
3. **鼓组采样层与每击轮转**：`DrumKitModels` 100% 合成，噪声偏移按步进确定（不随小节变化）。
4. **立体声完整性**（混响 IR 移出主线程、延迟不重建图）。（送出与合唱已修，见 G.19 / G.20。）
5. **限幅器起音平滑**：三次尝试后回退，需离线迭代。
6. **§4 上手改造**：~~`toolbarTiers` 接线~~、~~`layout.density` 落地~~、~~静默 no-op~~ 已完成（G.10 / G.22）；~~首屏单一动作~~ —— **已完成（v2.0.88）**，见 G.26：首屏一条细提示「按播放，再点亮一个格子」，播过一次或主动关掉就永久退场（手机端不显示）。
7. **手机端底部双层栏**（标签栏 53px + 走带条 59px = 664px 视口的 17%）。

---

# 附录 F — 本轮交付（v2.0.57，七项直接诉求）

> 这一轮的输入是七条具体反馈，不是规划。每条都先**测量**再改，改完再**测量一次**；
> 下面每条都附上支撑它的命令与数字，凡是本机测不出来的（真机听感、真实耳机延迟）一律标注。

## F.1 七项的处置与证据

| # | 诉求 | 根因（实测） | 处置 | 证据 |
|---|---|---|---|---|
| ① | 发布要用 `wrangler deploy` | `scripts/deploy.mjs` 只读 `.env.deploy`，凭据实际在 `.env` | 两个文件按序合并读取 | `node scripts/deploy.mjs --dry-run` → `Read 67 files from …/dist`，exit 0 |
| ② | 电脑 Chrome 不能两指上下滑动 | 根元素 `touch-action: manipulation` 关掉了整页的滚动手势 | 根元素移除，改为在 `button/[role=button]/[role=gridcell]/select/input[type=range]` 上按元素声明 | 逐元素断言 |
| ③ | 手机端去掉又丑又遮挡的按钮 | 桌面悬浮键盘 FAB 在手机上仍是 `fixed bottom-5 right-4` | 类名加 `sm:hidden`（骨架保留，E2E 仍能断言其存在） | `virtualKeyboardFab.test.tsx` 6 项通过 |
| ④ | 打开首页停在页面中间 | 钢琴卷帘挂载时执行 `scrollIntoView({block:"nearest"})` | 移除该 effect | 首屏位置测量 |
| ⑤ | 虚拟键盘按键点击无视觉变化 | 底部按键高亮依赖一次瞬时 class，快速点击时被同帧覆盖 | `KEYBED_MIN_HIGHLIGHT_MS = 160` 最短保持 | `pianoRollLane` 测试 |
| ⑥ | 轨道头区域乱 + 和弦轨道被遮挡 | 见 §F.2 | 见 §F.2 | `diagnose_track_alignment.mjs`：四个端全对齐 |
| ⑦ | 播放卡顿 / 音画不同步 | 见 §F.3 | 见 §F.3 | `measure_playback_smoothness.mjs` |

## F.2 轨道列：一个宽度，四个端全对齐

**这是「和弦轨道被遮挡」的真正原因，而且和和弦本身无关。** 同一个冻结列被四个地方各自写死：

| 位置 | 原宽度 | 层级 |
|---|---|---|
| `Ruler.tsx` 左侧标签 | **138px**（sm: 172px） | `z-30` |
| `TrackRow.tsx` 轨道头 | **142px**（sm: 176px） | `z-20` |
| `VelocityLane.tsx` 左侧标签 | **126px**（sm: 172px） | — |
| `index.css` 滚动条留白 | **126px**（sm: 172px） | — |

标尺那列 `z-30` 比轨道头 `z-20` 高，于是**窄 4px 的标尺压在宽的轨道头上**——任何轨道都被压，
但和弦轨道头上多了「和弦长度」按钮，视觉上最明显，所以被报成「和弦轨道有遮挡」。
同时两处 gap 不一致（标尺 `sm:gap-3`、轨道行 `gap-2 sm:gap-3`），
导致**手机端步号比它标注的格子偏移 4px**。

处置：`--trk-head-w`（142px / sm:176px）与 `--trk-head-gap`（0.75rem / sm:1rem）单点定义，
四处引用；并加不变量测试禁止任何硬编码宽度回归。

```
### desktop-1440   ruler w=176 left=417  row w=176 left=417  first step 609 = 609   ALIGNED
### iPhone14-竖屏  ruler w=142 left=25   row w=142 left=25   first step 179 = 179   ALIGNED
### iPad11-竖屏    ruler w=176 left=45   row w=176 left=45   first step 237 = 237   ALIGNED
### iPhone14-横屏  ruler w=176 left=45   row w=176 left=45   first step 237 = 237   ALIGNED
```

**第二层问题是轨道头自己溢出。** 142px 的列里放了十一个控件，实测内容宽 **241px**：

```
head: w=142  overflow=hidden  scrollW=241  clientW=138
  div  w=182 right=243.5   <== OVERFLOWS HEAD     ← 试听/长度/静音/独奏/滑杆
  div  w=150 right=197     <== OVERFLOWS HEAD     ← 力度/卷帘/左移/右移
```

列是 `sticky` + `overflow:hidden`，所以溢出部分被裁掉并**压在步进格上方**：
点静音/独奏实际是在切步进格。手机上 36px 触摸目标下，十一个控件需要 396px，
这列只有 128px 可用——**这不是调参能解决的，是「手机端不提供做不好的功能」的另一面**。

处置：手机只留音符身份（折叠/类型/色条/电平/名称）与**静音、独奏**（演奏时最需要当场切换），
其余（试听、和弦长度、滑杆、力度、卷帘、左右移、智能填充、清空、音量、声像）交给每轨控制台——
它们本来就在那里。**试听钮补进控制台头部**，所以手机端没有丢功能。

一个值得记下的坑：**已有的 `hidden md:flex` 标记并没有生效**。元素自己的 `flex`
与 Tailwind 的 `hidden` 同优先级，最终由 Tailwind 的输出顺序决定——所以必须用真正的
`display: none !important`（`.trk-head-desktop-only`）。两处溢出按钮本来就带着
`hidden md:flex`，这解释了为什么缺陷能存活。

## F.3 播放：卡顿来源与音画对齐

### 已实测：主线程几乎没有在算

5 秒播放，三个端：

| 端 | 帧 p50 | 帧 p95 | 最差 | >50ms | 长任务 | 步进速率 |
|---|---|---|---|---|---|---|
| 桌面 1440 | 16.7ms | 21.5ms | 39.3ms | 0 | 0 | 8.2 步/秒 |
| 手机竖屏 | 16.6ms | 20.3ms | 23.9ms | 0 | 0 | 8.2 步/秒 |
| 手机横屏 | 16.7ms | 20.7ms | 54.6ms | 1 | 0 | 8.28 步/秒 |

124 BPM 4/4 的 16 分音符理论值是 **8.27 步/秒** —— 实测 8.2，**音画同相**。

### 唯一能归因到代码的来源：自动跟随的 smooth 滚动

自动跟随默认开启，且**每一步**都调 `scrollTo({behavior:"smooth"})`。
浏览器在动画进行中收到新的 smooth 请求会**取消并重启**，于是滚动器永远在动画、永不落定，
每秒约 8 次——为了几像素的位移。改为增量步进直接定位，只在循环回到开头时保留平滑
（那才是值得展示的一次移动）。

### 深挖：尖峰不在 JS 里（四次独立探针一致）

`scripts/diagnose_playback_stall.mjs` 用 CDP 采了 CPU profile、DevTools trace、
`long-animation-frame` 与 `localStorage` 写入归属，结论和「某段代码在算」相反：

| 探针 | 结果 |
|---|---|
| CPU profile（6 秒） | 加权窗口 8083ms，其中 idle **7353ms**；最重的非空转项 `requestAnimationFrame` 8.9ms、`fillRect` 4.7ms、`H`(index) 4.7ms、GC 2.2ms |
| DevTools trace（最干净的一次） | `RunTask` 79 个、合计 **5.5ms**，最坏单次 **2.3ms** |
| long-animation-frame | 报出 17 个 >50ms 帧，blocking 被归给 `st @ vendor-react`（单帧自报 656ms） |
| localStorage 写入归属 | 播放窗口内 **0 次**写入（`innerSerialize`/`serialize` 合计 <1ms，不是病灶） |

`st @ vendor-react` 单帧自报 blocking 656ms，而同一函数在 CPU 采样里自用仅零点几毫秒——
两者不可能同时成立，所以 LAF 的脚本归因在这里不可采信（它给的是「该帧栈上出现过的脚本集」，不是真正的耗时者）。
**可以确证的只有一句：JS 侧没有热路径。** 残留的单帧 130–370ms 尖峰来自浏览器内部/合成与宿主机 I/O：
本机 `ps` 里没有任何残留 Chromium（`pgrep -c chrome` 为 0），而 `uptime` 的负载来自 `iou_exit` 与 `btrfs-endio`
这两个内核 I/O worker —— 也就是这块机器本身在存储 I/O 上阻塞。

标 [已复现] 的是「没有 JS 热路径」与「滚动事件降到每 6 秒 1–3 次」；
标 [未验证] 的是尖峰的确切成因（需要一台非 I/O 受限的机器复测）。**环境噪声不写成修复。**
### 音画对齐：播放头此前系统性偏早

原实现在 `ctx.currentTime` 越过 `stepQueue[0].time` 时推进播放头，注释写着
「Exact alignment: playhead advances when the audio block starts playing」。
但 **`currentTime` 是渲染时间，不是到达扬声器的时间**：排在 `t` 的音在 `t + outputLatency`
才被听到。所以画面早于声音，差值就是整条输出链的延迟。

处置（`visualLeadSeconds`，纯函数、可单测）：
`-(outputLatency + 限幅器前瞻 + 用户补偿)`，**封顶半步**，
且延迟为 0 时结果精确为 0——所以离线导出与既有测试不受影响。

本机 headless Chrome 实测 `baseLatency = 10.67ms`、`outputLatency = 0`，
即修正量约 10–15ms（不足一帧）。**真机上蓝牙耳机/慢接口可达 150–300ms，那才是这条修复的价值**；
标 [未验证]，本机测不到。封顶逻辑保证即使延迟异常也不会退到显示上一步。

### 新增的测量工具

- `scripts/measure_playback_smoothness.mjs` —— 帧间隔分布、长任务、步进速率 vs 理论速率。
- `scripts/diagnose_playback_stall.mjs` —— CDP CPU 采样 + DevTools trace + long-animation-frame + localStorage 写入归属，用来区分「代码在算」与「机器在等 I/O」。
- `scripts/diagnose_track_header.mjs` —— 轨道头逐元素几何与溢出链。
- `scripts/diagnose_track_alignment.mjs` —— 冻结列宽度与首列 x 坐标对齐。

## F.4 顺带修掉的正确性缺陷（计划 ③）

`SET_STEP_COUNT` 用 `steps.slice(0, diff)` 追加：`diff` 只在**小于源数组长度**时才够用。
16 → 128 时 `diff = 112 > 16`，六个并行数组只长到 **32**，后四分之三永远空着
（导出也大半是静音）。改为按模重复（tiling）。

新增 `patternLengthGrowth.test.ts`（5 项），并且**先用旧代码反向验证过它确实失败**——
否则测试只是在描述实现，不是在守住行为。

## F.5 门禁与发行

- 单元测试 **1795 项全绿**（156 个文件；本轮新增 21 项：播放头延迟数学 8、冻结列不变量 8、增长不截断 5）。
- E2E **7/7 设备目标通过**（`dist` 新鲜度守卫在位）。
- `scripts/deploy.mjs` 凭据核对通过，`--dry-run` 读取 67 个资源文件。

### F.5.1 E2E 的连带修改（重要）

打开每轨控制台的那一步原本点 `track-inspector-open-0`——一个 16×16、且**随网格横向滚动**的按钮，
而它现在是手机端的桌面专用控件。改为点击**轨道头本身**：它是七端都可见的唯一控件，
142px 宽、钉在左边缘，且触发的是同一个 inspector。同时给 `clickVerified` 加了 `scrollInline` 选项——
对 `sticky left-0` 的列做 `inline:"center"` 会让滚动器去居中被钉住的盒子，纯属白滚。

## F.6 仍未做（登记，避免误以为已完成）

音色侧的大项（附录 E.5 前四条）一个没动：**unison/立体声展开、波表 `createPeriodicWave`、
鼓组采样层与每击轮转、立体声完整性**。它们各自需要新的合成机制，不是调参。
另有 §4 上手改造与手机端底部双层栏（标签栏 53px + 走带条 59px = 664px 视口的 17%）。

**一条测试基建的缺口**：`check-timbre.mjs` / `check-loudness-spread.mjs` 读的是**已提交的报告**，
从不重新渲染，所以交付前必须重录基线，否则门禁会脱节（本仓库已有这条规矩，此处只是重申）。

---

# 附录 G — v2.0.58：超级锯立体声展开 + 界面密度落地

> 本轮从附录 E.5 的剩余清单里取了两项：音色侧的第 1 条（unison / 立体声展开），
> 以及 §4 上手改造里的 `layout.density`。两项都先量出「没做」的证据，再改，改完再量。

## G.1 超级锯：从单声道两锯到真正的声墙

**改前的实测事实**：`supersaw` 预设是 `osc1Type: sawtooth` + `osc2Type: sawtooth`、
`osc2DetuneCents: 26`，两个振荡器都汇入**同一个**混音节点——即完全单声道。
两把相差 26 音分的锯齿在同一信道里只会**以一种速率互相拍频**，听感是「一把稍微加了合唱的主音」，
不是 trance 的声墙。而这个音色是 trance / hardstyle / euphoric 类曲风的和弦担当
（仓库内被 59 个曲风引用）。

**改法**：新增一对失谐副振荡器，与预设自身那对分开摆位。

| 项 | 值 | 理由 |
|---|---|---|
| 副对失谐 | ±42 音分 = 26 × **1.6** | 拍频速率与音分差成正比；若副对也用 26 音分，整个堆叠仍是一条窄带、只有一个拍频。`UNISON_OUTER_DETUNE_MULTIPLE` 可调，且测试断言「外侧确实更宽」而不是硬编码两个数字。 |
| 摆位 | 等功率，`angle = (1 + spread) × 45°`，spread = 0.65 | 居中时两声道各 **√½ ≈ 0.7071**，且 `L² + R² = 1` 恒成立。线性摆位在 spread=0 时会给 `{1, 0}`——把「居中」做得比单声道**响 3 dB**，方向完全错了。 |
| 副对电平 | `osc2Mix × 0.5` | 加了一对振荡器但不抬总电平：预设自身的 osc1/osc2 平衡不变，只有宽度变。 |
| 摆位节点 | 1 进 2 出 `ChannelSplitter` + `ChannelMerger` | 单声道信号要走两条独立 pan 增益，必须先在节点层面分开。**不能用** `GainNode.connect(destination)` 代替——那会把副对送进扬声器、整轨播两遍。 |
| 级的位置 | 混音之后、滤波之前 | 滤波器、共振补偿、包络、噪声床全部保持原来的单声道图；只有振荡器混音被展宽。 |

**逐位不变保证**：整个立体声级只在预设声明了 `stereoSpread` 时创建节点。
未选择加入的 50 个预设**不多分配任何一个节点**，因此逐位不变——
这正是两份已提交基线对它们仍然有效的前提。测试用**节点计数**断言（遍历全部未加入的预设，
断言 splitter/merger 数量为 0），而不是相信那个 `if`：一旦有人把它改成无条件，
158 个预设会静默改声且两份基线同时失效。

**顺手堵掉的数据陷阱**：`unisonOuterDetuneCents` 是按预设自身失谐缩放的，
所以「要求宽度但 `osc2DetuneCents: 0`」的预设会造出四个**完全相同**的振荡器摆开——
不拍频、不展宽、+3 dB、节点翻倍。这是数据错误不是代码错误，所以测试对全库断言：
凡是 `stereoSpread > 0` 的预设，其失谐不得为 0，且外侧必须真的比内侧宽。

## G.2 界面密度：一个会撒谎的控件

**改前的实测事实**：`layout.density` 有完整的三档 UI、持久化字段、校验函数、中英文案，
而 `src/` 里**没有任何组件读它**（`grep -rn "density" src/` 只命中设置面板本身、
`layoutPrefs` 与和弦声部密度的同名概念）。用户按「紧凑」，按钮亮起，界面**一模一样**。
这比不提供该控件更糟：控件对「已生效」撒了谎。

**改法**：`useDensityPreference()` 把档位写到 `<html data-density>`，
由 `index.css` 的几何自定义属性消费。走 DOM 属性而不是 React 状态，因为消费者是 CSS 变量——
于是**不需要任何组件订阅该偏好**，改偏好也不会整树重渲染（与播放头走 DOM 总线同一考虑）。
`applyDensity` 从 hook 里拆出来单独导出，这样它可以脱离 React 被测试。

**两段式解析（这是本轮最容易踩的坑）**：

```
第一段 —— 视口 / 横屏方向   →  --step-cell-h-dense / -base（输入）
第二段 —— 三档密度          →  --step-cell-h（结果，从输入里选）
```

分层不是风格问题，是特异性问题：媒体查询里的 `:root` **特异性低于** `:root[data-density="compact"]`。
所以短横屏块若直接写 `--step-cell-h`，会被每一个密度档覆盖——用户的密度选择**只在短横屏手机上**
静默失效，而且只在那个方向。横屏块因此只准改「输入」，不变量测试专门守住这条
（断言横屏块内不得出现解析后的名字）。

**实测（`scripts/diagnose_density.mjs`，真浏览器）**：

| 目标 | 紧凑 | 标准 | 宽松 | 结论 |
|---|---|---|---|---|
| 桌面 1440×900 | 44px | 40px | 48px | 三档互异 |
| 手机竖屏 390×664 | 44px | 40px | 48px | 三档互异 |
| 手机横屏 844×390 | 29.6px | 29.6px | 37.6px | 紧凑=标准（横屏输入相同），宽松仍有效 |

横屏那一行是**正确行为**：横屏把输入压到 1.85rem，紧凑与标准都取该值；宽松在其上加 0.5rem。
关键是宽松**仍然生效**——如果横屏块写的是解析后的名字，这一列会全部相同。

**一处刻意保留的取舍**：手机端「标准」是 40px，低于 44px 触摸目标下限。
默认值保持 40px 是因为它是本设置出现之前应用的行为（存量用户不变），而**用户显式选择「宽松」即为 44px+**，
是一条显式的用户覆盖，而不是应用在无人察觉时降低可用性。

## G.3 两次门禁失败暴露的测试基建问题（值得单独记）

本轮 `verify` 红了两次，两次都不是产品缺陷，但两次都指向同一类基建问题。

**其一：手写 AudioContext 桩会在声部新增节点类型时静默失效。**
`velocityTimbreCoverage.test.ts` 自带一份「按节点类型逐个打桩」的 mock，立体声级一加
`ChannelSplitter`，它就以 `ctx.createChannelSplitter is not a function` 失败——这个报错
**和力度毫无关系**，而且它失败的方式是「测试崩了」，不是「断言不成立」。
已改为使用共享的 `FakeOfflineAudioContext`（实现完整图 API，并且会像浏览器一样对非法
ramp 目标抛错）。仍然存在三份手写桩（`audioDspGuards` / `keyTracking` / `drumFidelityTier1`），
它们目前不播放展宽音色所以没爆，但这意味着**它们对新增节点类型的覆盖是零**：
一个没实现的节点不是「跳过测试」，而是「测试根本不跑到那里」。这是下一步该收口的债。

**其二：中途取消的基线脚本会覆盖已提交的报告。**
`measure_genre_loudness.mjs` 收敛很慢（见上），我在 round 3 中途 kill 了它，
而它**已经把 `scripts/loudness.baseline.json` 覆盖成了那一轮的部分结果**，
于是 `loudnessReport.test.ts` 出现 3 项失败。已 `git checkout` 恢复。
教训是：这类「跑到一半写盘」的脚本被中断后，工作区是**不一致**的，恢复是必须动作而不是可选项。
本轮一开始判断「报告未变、不必重录」时用的是**被 kill 之前的检查**，那个判断本身仍然成立
（恢复后 `git diff` 为零、门禁退出码 0），但结论的正确性一度是靠运气。

## G.4 仍未做（更新）

1. **手机端底部双层栏**：标签栏 53px + 走带条 59px = 664px 视口的 17%。合并方案已想清
   （走带并入标签栏），但需要真机量测，留到下一轮。
2. **工具条分层（`toolbarTiers.ts`）仍未接线**：306 行的分层表只有它自己的测试引用它。
   它的头部注释已说明这是 C-01 的**目标设计**而非现状描述，所以不删；但要说清：
   目前的 `verify` 里没有任何东西会因工具条多出一个按钮而失败。
3. **波表 `createPeriodicWave`、鼓组采样层与每击轮转、立体声完整性其余部分**（附录 E.5 第 2–4 条）。
4. **`check-timbre` / `check-loudness-spread` 读的是已提交报告，从不重新渲染**——
   所以改动音色后必须判断每份基线是否真的需要重录，而不是反射式地都重跑一遍。本轮的处理：

   | 基线 | 处理 | 依据 |
   |---|---|---|
   | `timbre.baseline.json` | **已重录** | 立体声展开改变相关系数与频段形状，指纹必然变化。重录后 159/159 仍互异，最近一对 **0.3075 → 0.3266 dB**（地板 0.25），平均对距 **0.94 → 3.57 dB**——即展宽同时**改善**了可区分度。门禁通过。 |
   | `loudness.baseline.json` | **未改动，并已实测确认无需改动** | 立体声级对单声道输出是**电平中性**的：原对居中通到两个声道（各 √½），副对经等功率摆位后 `L² + R² = 1` 且电平为预设的一半，两支路在单声道下逐支路复原原信号。实测佐证：提交版基线在**新构建**上仍然全部成立——`check_loudness_spread.mjs` 退出码 0，trim 钳位命中 **0/159**、159 条 trim 全部与 `genreMix.ts` 一致、最差真峰值 **−1.242 dBTP** 未变。既然报告仍然描述现实，就不重录。 |

   顺带记录一个**求解器的固有特性**（不是本轮引入）：trim 迭代收敛很慢，第一轮后仍有 83 条超出 ±0.2 dB、第二轮后 76 条。原因是上文那句「68/159 条被自身动态范围钳住」——这些曲风无论怎么调 trim 都停在天花板上，残差是物理造成的，不是拟合失败。这也解释了为什么「重录基线」在这类改动上代价很高（单轮渲染 70 分钟），因此更值得先判断是否真的需要。
   所以每次改动音色必须重录基线。本轮已按此规矩重录两份。

## G.5 手机固定栏占用的实测演进

两条固定栏在两种方向上的真实几何（`iPhone 14` 视口，`?tab=studio`，
`scripts/diagnose_mobile_chrome.mjs` 可复现）：

| 版本 | 方向 | 视口高 | 走带条 | 标签栏 | 固定合计 | 两栏之间的可用带 |
|---|---|---|---|---|---|---|
| v2.0.58 | 竖屏 | 664px | 59px | 53px | 112px = **17%** | 390px = 59% |
| v2.0.58 | 横屏 | 390px | 59px | 53px | 112px = **29%** | 128px = 33% |
| v2.0.59 | 竖屏 | 664px | 59px | 53px | 112px = **17%** | 390px = 59% |
| v2.0.59 | 横屏 | 390px | **49px** | 53px | **102px = 26%** | **138px = 35%** |

**「可用带」是这里真正该看的指标**，而不是固定栏百分比、也不是步进网格的盒子高度：
网格**会滚动**，它在横屏下的盒子高 747px（整个 pattern），用一个会滚动的元素的盒子高度
去谈「占视口多少」是自欺。两栏之间的距离才是用户能看到的空间。

### v2.0.59 做了什么

横屏下走带条从 59px 压到 49px，办法是**去掉小节导航那一簇**（◀ 1/4 ▶，88px 宽）并把
纵向内边距从 `py-1.5` 收到 `py-0.5`。**控件本身仍然全部是 44px**——省的是内边距和一个控件，
不是触摸目标，这是这条取舍拒绝付出的代价。

小节导航不是被删掉，而是**移进工作台面板**（`MobileStudioSheet`）：
横屏下多出一组「小节导航」，两行分别是上一小节/下一小节，行描述显示当前位置（`第 2 / 4 小节`），
边界处自动禁用。竖屏**不注入**这一组，因为走带条已经在显示它们，再来一份是重复而不是兜底。
——这一条是本次能安全缩小的前提：**只有当能力在别处可达时，才允许从主界面移除一个控件。**

### 仍未做：横屏的彻底解法

横屏的自由空间仍然只有 138px（35%）。要真正达到「接近原生」，需要把那两条栏**合并成一条**
（省下整整 49px，可用带 → 187px = 48%）。做法已经想清：把走带状态从 `SequencerPanel`
提升到 `App`，让 `MobileTabBar` 渲染它。

没有做的原因是具体的技术约束，不是工作量：`MobileTabBar` 渲染在 `App`，而
`MobileTransportBar` 渲染在 `SequencerPanel` 内部——两者相隔整个视图树。本轮我另外确认了
**不能简单地在横屏隐藏标签栏**：`MOBILE_SHEET_GROUPS`（`MobileTabBar.tsx`）里**没有**
`studio` 与 `galaxy` 两个目的地，所以隐藏标签栏会让用户无法离开工作台或进入探索页。
要么先给抽屉补上这两个入口，要么做上面的状态提升——两者都属于独立一轮的工作。

## G.5b 顺带查出的两处死配置

1. **`.landscape-compact-bar` 是一条无人引用的 CSS 规则**（`index.css`），
   连同它内部的 button/select/input 28px 高度压缩规则一起。28px 也低于 44px 触摸下限，
   所以正确处置是**删掉**而不是接线到走带条上。
2. **`PHONE_MAX_HEIGHT_PX` 与 CSS 断点不一致**：JS 是 480、CSS 的
   `@media (max-height: 500px) and (orientation: landscape)` 是 500。
   即 490px 高的横屏视口会拿到压缩后的样式表，而 JS 仍把它当高视口——
   一个元素可以被一条规则定尺寸、被另一条规则定位。已统一为 500，并加了
   **读样式表断言两者相等**的测试（CSS 与 TS 无法共享常量，只能靠测试钉住）。

# 合并手机两条固定栏 —— 下一轮的施工图（不需要状态提升）

> 目标：横屏可用带 138px → **187px**（35% → 48%），做法是让走带条与标签栏**共享同一行**，
> 而不是上下各占一条。这是一份可直接执行的方案，本轮只做了调研与测量，未实施。

## 为什么之前的判断（要状态提升到 App）是错的

先前记录的前提是「必须把走带状态从 `SequencerPanel` 提升到 `App`」。重新看了一遍数据流，
**那是把方向搞反了**：

- `MobileTransportBar` 需要的东西（`isPlaying` / `bpm` / `viewedBar` / `barCount` / `canUndo` /
  `canRedo` / 五个回调）**全部已经是 `SequencerPanel` 的 props**，来自 `StudioView`。
- 真正「在 `SequencerPanel` 里」的只有 `isMobileSheetOpen` 与 `buildStudioSheetGroups(...)`，
  而那个 builder 需要**四十多个 prop**——把**它**提升到 `App` 才是昂贵的。
- 而 `MobileTabBar` 只需要三个 prop：`activeTab` / `onSelectTab` / `onOpenSheet`。

所以正确方向是 **把标签栏挪下来**，而不是把走带挪上去。

## 施工步骤

1. `StudioView` 增加两个可选 prop：`onSelectTab?: (tab: NavTab) => void`、
   `onOpenSheet?: () => void`。`App` 已经把 `handleSelectTab` 与 `setMobileSheetOpen` 拿在手里，
   直接传下去，**不新增任何状态**。
2. `SequencerPanel` 在 `isShortLandscape` 时，把走带条与标签栏渲染进同一个
   `fixed bottom-0 inset-x-0 z-[70]` 容器：走带条 `flex-1`，标签栏 `shrink-0`。
   走带条当前在 `SequencerPanel` 的常规流里（`top 150`）——这是它占掉 49px 纵向空间的原因；
   改成固定后，它只占标签栏那一行的横向空间。
3. 走带条需要一个「横排」变体：控件数不变（play / tempo / undo / redo / more），
   但去掉 `w-full` 与上下的整行背景，让它作为那一行的一半存在。
4. `App` 在横屏工作台时**不渲染**自己的 `MobileTabBar`，避免出现两条。
5. `--mobile-bottom-bars-h` 从 `--mobile-tab-bar-h`（53px）改为两栏堆叠所需的高度；
   `TrackInspector` 已经在用这个变量（`bottom-[var(--mobile-tab-bar-h)]`），
   所以控制台会跟着上移，不需要单独改。
6. `main` 的底部内边距按同一个变量走，避免遮住最后一行。

## 已知风险（必须由 E2E 覆盖的三点）

1. **横屏进入非工作台视图时标签栏会消失。** 理由是：横屏能走 `StudioView`，而抽屉的
   `MOBILE_SHEET_GROUPS` 里恰好有 `chords` / `kick` / `challenge` / 时间线 / `compare` 等目的地，
   所以在工作台里导航仍然完整。但 `galaxy` 与 `studio` 不在那份列表里——一旦标签栏消失，
   用户回不到探索页。两个选项：
   (a) 抽屉补上 `galaxy` 入口（一行数据，推荐）；
   (b) 横屏在**所有**视图都保留一条极简标签栏（放弃部分收益）。
2. **面板的 bottom 偏移。** 合并后两栏同层，`--mobile-bottom-bars-h` 必须等于那一行的真实高度
   （横屏走带 49px 或标签栏 53px，取高者），否则控制台底部会与其中一条重叠——
   这正是 v2.0.52 修过的那类缺陷（当时是 EQ 画布整块被标签栏盖住，命中测试落到标签栏按钮上）。
3. **安全区。** 标签栏自身带 `paddingBottom: env(safe-area-inset-bottom)`；合并后这个内边距
   必须留在**整行**上，否则 iPhone 的 home indicator 会压住走带条右半边的按钮。

## 验证方式

- `node scripts/diagnose_mobile_chrome.mjs` 必须报告横屏可用带 ≥ 180px（现在 138px）。
- `npm run verify` 全绿，特别是 iPhone 14 横屏目标（它已经覆盖控制台几何与抽屉行点击）。
- 新增可失败测试：横屏下走带条与标签栏的盒子**不重叠**、且都在视口内；
  竖屏布局**不变**（回归保护）。

---

## G.6 手机两条固定栏已合并到同一行（v2.0.61，已完成）

施工图（见上文 §「合并手机两条固定栏」）已实施。**实际结果**：

| 版本 | 方向 | 走带条 | 标签栏 | 占用的**高度** | 占视口 |
|---|---|---|---|---|---|
| v2.0.60 | 横屏（堆叠） | 49px（顶部） | 53px（底部） | 104px | 27% |
| **v2.0.61** | 横屏（同行） | 320px 宽 | 524px 宽 | **52px** | **13%** |
| v2.0.60 / 61 | 竖屏 | 59px | 53px | 112px | 17% |

横屏一次性拿回 **52px**（104 → 52），超出施工图预估的 49px。标签栏内每个 tab 从
**39px 宽升到 104px 宽**（`scripts/diagnose_mobile_chrome.mjs` 实测），也就是这次合并
不仅省了纵向空间，还**改善了导航的触摸目标**——因为横向本来就有 844px 富余。
竖屏布局**逐像素不变**（回归保护由测试断言）。

### 实施中发现的三个真实陷阱（都已修，并各有测试）

1. **`fixed inset-x-0 bottom-0` 无法参与 flex 行。** 它无视容器、覆盖容器——第一次合并时
   标签栏在一个 1px 宽的父元素里自报整屏宽。为此给 `MobileTabBar` 加了 `embedded` 变体：
   嵌入式时不加 `fixed`、由调用方负责定位与安全区留白。
2. **不设上限时走带条会赢下整个 flex 行。** 它按内容尺寸拿到 **646px**，把五个 tab 挤成
   每个 **39px**。现在走带条固定 320px（`--mobile-transport-row-w`，与
   `TRANSPORT_ROW_WIDTH_PX` 由测试钉为同值），标签栏 `flex-1` 取剩余 524px。
3. **裸 `env()` 会让 React 丢掉整条 style 声明。** 安全区内边距原先写作
   `paddingBottom: "env(safe-area-inset-bottom, 0px)"`，jsdom 解析不了该值，于是**整个 style
   属性消失**——测试因此以「断言失败」的形式暴露了一个真实的序列化问题。改为
   `max(0px, env(...))`（也与会话其余部分写法一致）后正常。

### 顺带修正的两处措辞

- 施工图里「必须把走带状态提升到 `App`」是**错的**：走带条的 props 全部已从 `StudioView`
  下来，真正昂贵的只有 `buildStudioSheetGroups` 的四十多个 prop；而标签栏只需三个。
  正确方向是**把标签栏挪下来**。已在施工图中订正，实际实施也按此进行、未新增任何状态。
- **`App` 仍是导航的所有者**：标签栏元素由 `App` 构造，只是当视口是短横屏且当前是工作台时
  改为交给 `StudioView` 放进同一行，并抑制自己那份固定渲染，避免出现两条。

---

## G.7 v2.0.62 热修：合并底栏自身的两个缺陷

v2.0.61 上线后自查发现并修掉两处——**都是合并动作引入的**，且都属于「截图里看不出来、
只有探针能量出来」的类型。记在这里是因为它们的成因比现象更值得记。

### 一、底栏照抄了标签栏的层级

合并行复制了标签栏的 `z-[70]`。但轨道控制台是 `z-50` 的浮层、下垫 `z-40` 遮罩，
于是**控制台最下面 52px 被底栏压住**。探针在重叠区做 element-at-point，
返回的是**走带条的图标**而不是面板。

**成因**：一个**包含**高层的容器，不应当**继承**高层的层级。
独立的标签栏可以站得很高，因为它上面没有别的东西；而一行会被浮层覆盖的底栏不行。
现在底栏用 `z-30`（低于控制台的遮罩 40）。

### 二、横屏下 `--mobile-tab-bar-h` 是 0

该变量只在 `@media (max-width: 767px)` 下被设值，而横屏手机是 **844px 宽**——
变量留在 `0px`，所有依赖它的底部浮层在横屏下都少了 53px 留白。
**注意这不是 v2.0.61 引入的**，而是自该变量存在以来就有的缺口，只是合并底栏把它暴露得更明确。

**修法**由「宽度媒体查询」改为「DOM 属性」，因为**宽度回答不了这个问题**：
横屏工作台（底栏合并进行内）与横屏其他视图（底栏固定贴底）**都是 844px 宽**。
现在 `App` 依据「标签栏是否固定」写 `data-bottom-bar="tab"`，
合并行则**自己声明** `data-bottom-chrome="fixed"`；
两者在 CSS 里保留同一高度（53px），所以无论哪种排布，浮层都落在同一位置。
——这是本项目第三次遇到「CSS 与 TS 无法共享常量，只能靠测试钉住」的同类问题
（前两次是 `PHONE_MAX_HEIGHT_PX` 与 `TRANSPORT_ROW_WIDTH_PX`）。

### 验收（都做了前后对比）

| 探针 | 修前 | 修后 |
|---|---|---|
| 横屏重叠区 element-at-point | `path`（走带条图标） | `null`（无重叠） |
| 竖屏重叠区 element-at-point | `mobile-tab-learn` | `null` |
| 控制台底边 vs 底栏顶边（横屏） | 390 vs 337（压住 53px） | 337 vs 337 |
| `--mobile-tab-bar-h`（横屏） | `0px` | `calc(53px + …)` |

三条可失败测试锁住：底栏 `z-index < 40`、两种排布保留同一高度、行必须声明自己的高度。
## G.8 波表：两个管风琴变成真正的音栓组合（v2.0.63）

附录 E.5 第 2 条「波表 `createPeriodicWave`」已实施，落点是两个管风琴预设。
**为什么先做这两个**：它们是全库里「机制上做不到」最明确的例子——
哈蒙德管风琴的音色是**在选定音栓长度上的纯分音之和**，
而任何内置波形的组合都逼近不了它；所以两个预设此前一直是「方波 + 正弦」，
听感是「合成器管风琴」而不是音栓乐器。

### 实现

| 项 | 做法 |
|---|---|
| 预设字段 | `harmonics?: readonly number[]`（0 基，index 0 为基频） |
| 系数 | 纯函数 `periodicWaveCoefficients()`，**正弦级数**（`real` 全零） |
| 归一化 | 按**分音幅度之和**归一，而非采样峰值 |
| 应用 | `osc1` 先赋 `osc1Type`，再在有 `harmonics` 时用 `setPeriodicWave` 覆盖 |
| 回退 | 系数函数对「空/全零/非法」返回 `null`，此时退回普通波形而不是造一个不发声的振荡器 |

**为什么按「和」归一而不是按峰值**：幅度之和是波形峰值的**严格上界**，一次遍历即精确，
且无论分音如何都保证不超过 1。按真实峰值归一需要一次采样，而采样分辨率会随分音数量变化——
那是实时图与离线图产生分歧的无谓来源。这条取舍写进了函数注释。

**为什么用正弦级数**：音栓是用「长度 + 幅度」描述的，不是相位关系。
正弦级数让波形与任意相位选择无关——两个预设只要音栓相同，声音就相同。

**逐位不变保证**：没有声明 `harmonics` 的 49 个预设**不创建任何 periodic wave**，
`osc1Type` 照旧，因此逐位不变、已提交基线对它们仍然有效。测试对全库断言这一点
（遍历所有未声明的预设，断言 `periodicWave === null` 且 `type` 仍是自己的 `osc1Type`）。

### 音栓映射（写下来是因为我在这里错了两次）

数组是 **0 基**，index `i` 对应长度为 `8′ / 2^i` 的音栓：

| index | 长度 | `m1_organ`（全开） | `organ_lead`（爵士 888000000+2′） |
|---|---|---|---|
| 0 | 8′ | 1 | 1 |
| 1 | 4′ | 0 | 0 |
| 2 | 5⅓′ | 0.42 | 0.3 |
| 3 | 2′ | 0.36 | 0.5 |
| 5 | 2⅔′ | 0.24 | 0.12 |
| 7 | 1′ | 0.16 | — |
| 12 | ½′ | 0.1 | — |

**16′（index −1，即次八度）在这里表达不出来**：`createPeriodicWave` 是围绕**一个基频**展开的，
比基频更低的分量需要第二个振荡器。这恰好也是正确结果——真实管风琴上 16′ 属于另一层手键盘，
塞进来会在音符下方产生本应由贝斯声部占有的能量。

**两次写错**：第一版测试按 1 基读数组（于是断言 4′ 位置有能量），
第二版修过头又按 1 基写标签。现在测试的标签同时写明「长度」与「算术」（`8′ / 2^i`），
因为凭长度记 index 正是读者会犯的同一个错。


### 基线重录（按仓库规矩）

| 指标 | 重录前 | 重录后 |
|---|---|---|
| 互异指纹 | 159/159 | **159/159** |
| 最近一对 | 0.3266 dB | **0.2853 dB**（french-house ↔ nu-disco-house） |
| 平均对距 | 3.5662 dB | 3.5798 dB |
| 门禁 | 通过 | **通过**（脚本内联重算与报告一致） |

**最近一对收紧了 0.04 dB，这一条要说清楚而不是掩饰**：查了两者的配器——
french-house 是 punchy_kick + clap + closed_hat，nu-disco-house 是 punchy_kick + clap，
**两个管风琴都不在里面**。所以这一对的距离与本次改动基本无关，
0.04 dB 属于渲染的极小漂移（门禁自己记录的重复稳定度上界是 1.32 dB，
远大于这对 0.29 dB——**门禁的 0.25 dB 地板本来就紧贴着测量噪声**，这是既有状况，不是本轮引入的）。
反过来看：改了两个管风琴而平均对距还略升（3.5662 → 3.5798 dB），
说明音栓化让整体音色分布更分散了一点。

### 未做

- **不谐分音（inharmonic partials）**：`createPeriodicWave` 只能生成**谐波**级数，
  所以钟/锣/钟琴的金属感仍只能用「两个不成整数比的振荡器」近似（`bell_lead` 现在就是这么做的）。
  真正的解决方案是采样或加减法合成，属于独立工作。
- 鼓组采样层与每击轮转、立体声完整性其余部分（E.5 第 3–4 条）。
## G.9 转向「三端架构」：功能与界面解耦（v2.0.64 起）

用户决定：**手机端 UI/交互/功能将重做**，底层功能复用 PC 与 iPad；
三端将来 UI、交互、功能都会有差异（PC 最全）。因此本轮起的工作重点是
**把功能代码与视觉/交互代码解耦**，让三套界面能挂在同一套功能上。

已交付（v2.0.64）：

1. **分层约定与门禁**：新增 `scripts/check_layers.mjs` 并接入 `verify`。
   四层 `domain / platform / logic / ui`（外加 `util`），违规即失败；
   只对**新增**违规失败，已存在的登记在 `ALLOW` 里、只应减少。
2. **实测结果**：`src/features/` 与 `src/hooks/` **原本已无任何组件 import**——
   解耦的基础比预想的好。本轮清掉了其中仅有的耦合：
   - `announcer` 从 `src/ui/AriaLiveRegion.tsx`（一个 `.tsx`！）移到 `src/platform/announcer.ts`，
     于是 logic 播报不再依赖 React 组件；
   - `NavTab` → `src/app/navigation.ts`；`ParameterDimension` / `GenreRailItem` / `UnsavedDecision`
     各自回到 `src/features/sequencer/` 的归属地（原来都在组件里定义，logic 反向 import 组件取类型）。
3. **文档**：新增 `ARCHITECTURE_SURFACES.md`——分层表、门禁用法、
   「想知道是不是手机该怎么办」的**正例与反例**、类型归属判据、三端功能默认取向、
   以及「删掉某一端整个目录后 features/audio 仍应能编译」这条可检验的判据。
4. **测试范围临时缩小**（并按用户要求）：`verify` 里的 E2E 只跑 PC 三浏览器；
   全量矩阵保留且由红线 **R6c** 守住不被删。同时修掉一处既有缺陷：
   部分目标运行时汇总信息硬编码「ALL 7 ... PASSED」。

剩余债务（门禁登记）：`src/data/index/loader.ts` 依赖 `features/customGenre/customGenreDb`
（domain 指名 feature）。正确修法是**反转依赖**：loader 接受 resolver，由 `src/app` 注入。

## G.10 工具条密度：已接线（v2.0.76），36 → 16 控件、215 → 111px

用户在手机端提出的要求里有一条是**「绝不密密麻麻堆砌一堆按钮」**。这条同样适用于 PC——
而且 PC 正是用户日常使用的那一面。**先量，再改**：这一节原来的数字是手工探针测的，
本轮把它变成了一个可重跑、可当门禁的脚本（`scripts/measure_toolbar_density.mjs`，
`npm run probe:toolbar`），并重新测了基线。

### 接线前（1440×900，实测）

| 状态 | 可见控件 | 视觉行数 | 工具条高度 | 占视口 |
|---|---|---|---|---|
| 高级面板**关闭**（默认） | **36** | 4 | **215px** | **23.9%** |
| 高级面板开启（1920 宽） | 38 | 3 | 163px | 18.1% |

### 接线后（同一脚本，同一视口）

| 指标 | 前 | 后 |
|---|---|---|
| 可见控件（元素） | 36 | **16** |
| 可见控件（**去重后的 tier id**，即设计口径） | — | **12**（= Tier 1 全部，`TIER_1_MAX = 14`） |
| 视觉行数 | 4 | **2** |
| 工具条高度 | 215px | **111px** |
| 占视口 | 23.9% | **12.3%** |
| 默认可见的 Tier 2/3 控件 | 24 | **0** |
| 高级（More）触发按钮位置 | **left=1565，超出 1440 视口** | left=845，**在视口内** |

最后一行是这次改动意外修掉的一个**真缺陷**：接线前，Fold / 高级 / More 三个触发按钮
被横向挤到 `left≈1565`，在 1280 与 1440 宽下**都在窗口右边缘之外**——它们所在的容器是
`overflow-x-auto scrollbar-none`，也就是**连滚动条都不显示**。所以「高级面板」这个入口
在最常见的桌面宽度下实际上是**不可发现**的，Tier 3 的 FX、量化细调、触感等全部连带不可达。
控件瘦下来之后它自然回到了视口内。这条已写进脚本的输出（`advanced("More") trigger` 一行）。

### 怎么接的

1. **一个谓词**：`toolbarTiers.ts` 新增 `isControlVisible(id, showAdvanced)`，
   即「Tier 1 常驻，其余跟着高级密度走」。Toolbar 里定义一次
   `const shows = (id) => isControlVisible(id, showAdvancedControls)`，13 处沿用。
2. **不是在两千行里找位置**：原计划第一步是先把 `Toolbar.tsx` 拆成四个组件。
   实际做的时候发现更省的风险点：这些控件**本来就已经各自包在 `{cond && (` 里**，
   所以接线是「在既有条件后面追加一个 `&& shows("id")`」而不是插入新的包裹层——
   纯字符串替换、每处都断言锚点唯一，改动量小一个数量级。
   真正需要新包裹的只有三处（量化组、Quick Tools 药丸、工程组），且都是整组同 tier。
3. **分组同 tier 是可断言的**：`MeterControls` 的四个（meter/grid/length/tool-mode）
   用**一个** `shows("meter")` 一起开关，所以测试里断言「这四个 tier 相同」——
   否则将来给其中一个改 tier，另外三个会被一个不再描述它们的 gate 挡住。

### 守卫（可失败，且已实跑验证）

- **`isControlVisible` 的密度契约**（单元测试）：密度关闭时**恰好** Tier 1 可见；
  密度开启时全部可见；未知 id 一律不可见（一个没被分类的控件不该「碰巧」显示）。
- **stamp 与表对账**（单元测试，读 `Toolbar.tsx` 源码）：每个
  `data-toolbar-id` / `data-toolbar-tier` 都必须命中表里的同一 tier。
  实跑验证：把 `tap-tempo` 的 stamp 改成 tier 1，该测试立刻失败。
- **`probe:toolbar` 进 `verify`**：浏览器里数**真实可见**的控件，只要有 Tier 2/3 漏出来就失败。
  这条是行为口径的验收，而且阈值是「不许漏」这种结构不变量，不是一个会被重新拍脑袋的数字。
- **表完整性**：这轮补上了两个**一直在渲染、却从未登记在表里**的控件——
  `piano-roll-toggle`（Tier 2）与 `fold-toggle`（Tier 1）。表的头注释声称它是
  「完整的描述」，此前没有任何东西检查这一点；现在两侧对账。

### 接线过程中暴露的一个真交互 bug：密度里的控件点不动

E2E 报「钢琴卷帘打不开」，隔离复现后是**点击被吞掉**：

```
initial         rollToggle=false  grid=false
after advanced  rollToggle=true   grid=false
after roll click rollToggle=false  grid=false      <- 控件消失、卷帘没开
```

原因：高级面板的「点外面就收起」处理器判断的是 `advancedRef.current.contains(target)`。
我把 Tier 2/3 控件移进密度后，它们**大多数并不在那个面板里**（走带组、律动四选、卷帘/控制台开关、
整个工程组），于是按下它们 = 按在面板外 → 面板立刻收起 → 控件被卸载 → `click` 落到空处。
**用户要点两次才有反应，看起来就是坏的。**

修法一条规则：**工具栏自己的控件不收起密度**。选择器就是本轮刚加的
`[data-toolbar-id]` / `[data-toolbar-tier]` stamp——即「由决定可见性的同一张表决定」，而不是再写一份名单。
副作用是把 Tier 1 控件也一并排除（原来点 Play 会收起面板），这让密度的行为**一致且可预期**：
它只在自己的按钮、Esc、以及真正点在工作台之外时收起。

单元测试：`toolbarPopover.test.tsx` 新增三条（Tier 2 控件按下时既不清除密度、也确实触发回调；
Tier 1 同样不清除；真正的外部点击仍然清除）。这三条在修复前会失败。

> 这条也是「为什么门禁要是行为口径」的实例：源码级断言、类型检查、2000 条单元测试
> 全都放过了它，只有**在真实浏览器里点一下**才发现。

### 顺带修掉的「覆盖率静默消失」

E2E 的 `openPianoRoll()` 原来是「找到卷帘开关就点、找不到就跳过」。
卷帘移进高级密度之后，这个写法会让**桌面端的卷帘断言静默消失**——
正是该函数手机分支的注释警告过的那种失败。现在桌面分支先开密度再点，
并且用 `waitForSelector` 把「找不到」变成失败而不是跳过。

> 教训（与 G.12 同一条）：**注意力的默认值应该是「显式失败」，而不是「安静跳过」。**

## G.11 下一轮的优先级（按 收益÷成本）

**本轮之后已完成**：手机两条固定栏合并（G.6/v2.0.61）、波表与管风琴音栓（G.8/v2.0.63）、
无人引用 CSS 的系统清查 + 门禁（v2.0.68）、文档引用清查 + 门禁（v2.0.72）、
以及视图解耦的四个 hook（`usePanelVisibility` / `useAudioEngineInstance` /
`useAuditionPreview` / `useEffectsRack`，v2.0.65–v2.0.71）。

1. ~~**`toolbarTiers.ts` 接线**~~ —— **已完成（v2.0.76）**，见 G.10。
   实测 **36 → 16 个控件（去重 12 个 tier id）、4 → 2 行、215 → 111px（占视口 23.9% → 12.3%）**，
   默认可见的 Tier 2/3 控件 **24 → 0**；顺带修掉两个真缺陷（高级入口在 1280/1440 下不可发现、
   密度里的控件点击被吞掉）。门禁 `npm run probe:toolbar` 已进 `verify`。
2. ~~**离线导出的 ~1.3 dB 离群重复偏差**~~ —— **已定案（v2.0.78）**，见 G.14。
   结论是**调度确定、浏览器 DSP 不确定**：30 次 1 小节渲染只有 **1 条**调度流、却有 30 个不同音频；
   3 小节同样（1 条流 / 8 个音频）。所以这是**平台特性**，不是可修的代码，
   已按「承诺 = 容差」处理，门禁阈值改按实测重复底噪（中位数 ≈7e-5 dB）论证。
   调查中顺带修掉两个真缺陷（GS-1 核心 WASM 未缓存、GS-1 host 静默回退），两者都已带测试。
3. ~~**限幅器静默回退**~~ —— **已完成（v2.0.75）**：`RenderWavOptions.onLimiterKind`
   把实际使用的限幅器报出来，`ExportedWav.limiterKind` 一路带到调用方，
   导出动作在拿到 `"fallback"` 时改说「该文件比试听更响、控制更差」而不是「导出完成」。
   测试：`src/test/exportLimiterKind.test.ts`。回退本身保留（音频绝不能被放任无上限），
   要修的是「静默」。
4. **音色侧剩余两条**（附录 E.5 第 3–4 条）：
   - **鼓组采样层**：`DrumKitModels` 100% 合成，噪声偏移按步进确定（不随小节变化）。
     ~~同一鼓件连续敲击因此逐次完全相同~~ —— **「每击轮转」已完成（v2.0.73）**，
     见 G.13：音高/音量/长度按音乐位置做确定性微变，四个鼓件族与六个打击乐族全部接入。
     仍未做的是**真正的采样层**（需引入采样资源与许可），本轮不涉及。
   - **立体声完整性其余部分**：混响 IR 移出主线程、延迟不重建图。
     ~~送出为声像前分接~~ —— **已完成（v2.0.81）**，见 G.19。
     ~~合唱降混成单声道、左右共用同一 LFO~~ —— **已完成（v2.0.82）**，见 G.20。
5. **不谐分音**：`createPeriodicWave` 只能生成**谐波**级数，所以钟/锣/钟琴的金属感
   仍只能用两个不成整数比的振荡器近似。真正的解法是采样或加减法合成。
6. **`StudioView` 剩余接线的继续外提**：播放/混音设置（鼓组、drums-only、录音待命）、
   键盘演奏模式与 FAB 偏好、项目抽屉与检查器游标。目标仍是那条判据：
   **删掉某一端整个目录后，`src/features` 与 `src/audio` 仍应能编译通过。**
7. **CSS 与 TS 常量仍靠测试钉同值**（`--mobile-transport-row-w` / `TRANSPORT_ROW_WIDTH_PX`）：
   这是本项目第三次遇到「CSS 与 TS 无法共享常量」（前两次是 `PHONE_MAX_HEIGHT_PX`、
   `TRANSPORT_ROW_WIDTH_PX`）。根治办法是把这类常量集中到一处、由 TS 生成 CSS 变量——
   属一次小型工程改造，收益是以后不必再为每个跨语言常量写一条守卫。
8. **PC/iPad 的走带条会随页面滚走**，而手机版已固定 —— **性质待确认**：
   `MobileTransportBar.tsx` 上方的注释明确写着这是刻意的（避免遮挡长页面）。
   在确认是有意设计还是权宜之前不动它；若属后者，三端的走带可达性就应统一。

## G.12 页面双指滚动失效：根因是 `overscroll-behavior: none`（v2.0.73 修）

### 现象与根因

用户在 macOS Chrome 上报告：页面**无法用触控板双指滚动**。用户本人在真机上逐步二分，
**确认根因是 `html`/`body` 上的 `overscroll-behavior: none`**：

```css
/* 之前（坏） */
body { overscroll-behavior: none; overscroll-behavior-x: none; overscroll-behavior-y: none; }
html { overflow-x: hidden; overscroll-behavior: none; }
```

这个属性的字面定义只是「禁止滚动链与回弹」，但 Chrome 在**支持触摸的桌面硬件**上同样会采纳它，
于是纵向的那一半把最基础的页面手势一并关掉了；Safari 宽松，所以同一份代码在 Safari 上正常。
用户实测的四条对照正好解释了我们之前查不出来的原因：

| 对照项 | 结果 |
|---|---|
| `touch-action: auto` | ✅ 正常 |
| `overflow: auto` | ✅ 正常 |
| 程序化滚动（`window.scrollTo`） | ✅ 正常（`scrollY` 能改） |
| **双指滚动手势** | ❌ 被静默忽略 |

### 修法：按轴拆开

```css
/* 之后（对） */
body, html {
  overscroll-behavior-x: none;   /* 保留：挡住 Chrome 的横向双指「后退/前进」手势 */
  overscroll-behavior-y: auto;   /* 还给浏览器：页面要能滚 */
}
```

保留 `-x: none` 是**刻意的**，不是漏改：本项目的步进格子本身有横向平移，
若放开横向回弹，双指横滑会不断触发浏览器的历史导航（后退/前进）。

值得一提的是，`src/index.css` 里**早就有正确写法**的同类规则——
`.overscroll-x-contain { overscroll-behavior-x: contain; overscroll-behavior-y: auto; }`
（步进面板的滚动容器在用）。也就是说这个教训此前已经在**局部**应用过，只有**根部**没跟上。

### 代价（明说）

根部纵向改回 `auto` 后，触摸设备上「在步进格子上向下拖」有可能重新触发下拉刷新
（`contain` 挡不住下拉刷新，只有 `none` 能挡）。这是真取舍：桌面端是用户日常使用的那一面，
且手机端正在被用户重新设计，所以这一轮取桌面可用。手机端重做时应把它作为一条明确的设计输入。

### 诊断脚本为什么没找到它（这才是要记的教训）

`scripts/diagnose_page_scroll.mjs` 当时报了「5 个变体都能滚动」，我据此向用户说过
「可能不是主因」。**那个结论错了**，而且错法是可复现的：

- 它的每条探针都用 `window.scrollTo` **程序化**滚动，或判断 `scrollHeight > clientHeight`；
- 这两件事与 `overscroll-behavior` **无关**——该属性管的是**手势与回弹**，不是滚动范围，也不是滚动 API；
- 所以它能诚实地报「都能滚」，同时真机纹丝不动。

**教训：绕过输入路径的探针，测不出输入路径的 bug。**
因此该脚本这一版加了一条**读计算样式**的结论行（`overscroll-x/y` 与 `touch-action`），
不需要手势、不需要硬件，命中已知坏配置时直接 `exit 1`。
`src/test/deviceCapabilities.test.ts` 里也有对应的来源级守卫。

### 顺带修掉一条「永不失败」的守卫

同一份测试里，守卫「根部不得有 `touch-action`」的那条断言写的是：

```ts
const bodyBlock = css.slice(css.indexOf("html,"), css.indexOf("/* Explicitly allow selection"));
```

而 `src/index.css` 里**没有 `html,` 这个选择器**，于是 `indexOf` 返回 `-1`、
`slice` 返回**空字符串**、`expect("").not.toMatch(...)` **恒真**。
一条用来防真实回归的守卫从不失败，比没有守卫更糟——它让人以为已经复核过。
现已改为按选择器解析真实声明块，**选择器改名即抛错**，
并用「把 `-y` 改回 `none`」实跑验证过它确实会失败（两种坏写法都会失败）。

## G.13 每击轮转：让同一鼓件的连续敲击不再逐次完全相同（v2.0.73）

### 缺陷

`DrumKitModels` 是 100% 合成，且**同一音乐位置**（同一轨、同一步、同一轮擦）产出的参数是
逐位相同的：音高相同、包络相同、音量相同，**只有噪声读取偏移在变**。所以一小节里八次
同力度的闭合踩镲，听感上就是同一个 60ms 片段被放了八遍——这是「像程序不像演奏」最容易被
听出来的一处，而且**加花力度也去不掉**，因为问题不在力度上。

### 做法：确定性微变，键仍然只用音乐位置

新增 `hitVariation(position)`（`src/audio/noise.ts`），三个参数各自取**独立的哈希盐**：

| 参数 | 幅度 | 为什么是这个量级 |
|---|---|---|
| 音高 | ±6 音分 | 鼓皮张力逐次微变差不多就是这个量级；半音就成了错音 |
| 音量 | ±0.28 dB（硬下界 ±0.6 dB） | 「听得出是另一击」的下限，同时高于「完全一样」 |
| 长度 | ±4% | 鼓的衰减由鼓皮和房间主导，逐次变化很小；这是微光而不是另一面鼓 |

**三条参数用三个不同的盐**，所以不会「一起变大」——一击同时更高、更短、更响，听感上会变成
**另一面鼓**，恰好是这件事要避免的反面。测试里有一条专门钉这个性质（相关性不得过强）。

**确定性不可谈判。** 位置键与噪声偏移用的是同一个（`noisePositionFor`，只由轨/步/轮擦构成，
不含时钟），所以现场引擎与离线导出必然一致，导出对齐不被破坏；`Math.random` 会直接摧毁这条保证。

### 位置 0 = 不变（一个必须说清的边界）

四个鼓件函数与 `synthesizePercussion` 的 `noisePosition` 默认值都是 `0`，
所以 `0` 必须表示「没有给定位置」，否则**每一个从没要求过人性化的调用方**都会静默获得一个
固定的、无法解释的失谐，改动前那些「参数逐字不变」的基线也就不再可复现。
代价是每个 pattern 有**一击**不变（`noisePositionFor(0, 0, 0)` 也是 0，即第一轨第 0 步）。
这是最便宜的一处损失——它是单次敲击而不是一段律动——所以按此取舍，并在代码里写明。

### 接入范围（全部经真实合成路径断言，而不是纯函数测试）

| 鼓件 | 接入方式 |
|---|---|
| 808/909/acoustic/cyber 底鼓 | 与军鼓同样的 `decayOf()` / `levelOf()` 折叠助手 + 音高乘子。**第一版只接了 808 分支、漏了另外三支**——正是军鼓那两个助手存在的理由，却在它上面的函数里犯了一次；现在四个分支都走助手，所以「哪些 kit 接通了」不再需要审阅者逐个分支去读。测试对此有断言（四个 kit 的起始频率必须各不相同）。 |
| `kick:*` 六个音色预设 | 位于**另一个模块** `AnatomyKickEngine`，但可从工具条的下拉框选到。按「每次敲击的属性」落在三处：`basePitch` 与 thump 两层扫频（被击打的两层）、三层的衰减、以及**一个总线电平增益**。该增益刻意放在**失真器上游**——敲得重一点让饱和器多吃一点，正是真实模拟底鼓的行为，也和本模块已有的做法一致（`gripScale` 用 `velNorm` 缩 `effectiveGrit`）；同时失真器仍然直连 `dest`，这是 `AnatomyKickEngine.test.ts` 钉住的契约。 |
| 军鼓（808/909/acoustic/cyber 四支） | 在函数入口算一次，四支分支共用：音高乘子 + `decayOf()` / `levelOf()` 两个折叠助手 |
| 踩镲（808 簇 / 噪声支） | 包络长度与音量；**不动滤波器中心**（那是「另一件乐器」而不是「另一击」） |
| 打击乐六族（cowbell/clap/composite/membrane/metal/wood） | 在 `synthesizePercussion` 里对 `timbre` 与 `mult` 各折一次，所以**六个族全部覆盖**——包括没有噪声层可变的族 |

`src/test/hitVariation.test.ts` 同时测纯函数性质（确定性、三条边界、跨小节不复用、三参数不联动、
非有限/非正值防护）与**接线**（底鼓、军鼓、踩镲、打击乐各渲染两次比较参数；
以及「位置 0 时军鼓仍是改动前的 180Hz」）。后者是关键：纯函数正确但没人调用，
正是本项目反复清理的「死配置」味道。

### 顺带修正的一条测试

`percussionModels.test.ts` 里「reproduces the pre-change ff parameters exactly」
原先断言 808 底鼓 `lastRamp ≈ 1.15`（0.5 + 0.65 固定衰减）。人性化后 body 长度会变，
所以这条现在**按同一个显式位置的 `hitVariation().decayScale` 反算期望值**，
并额外断言「与改动前字面量 1.15 的偏差 ≤ 0.65 × `HIT_VARIATION_MAX_DECAY`」。
这样既钉住了「0.65 这个数还在、只是被乘了一个已知系数」，也不会因为它依赖默认位置而变得不可复现。

## G.16 文档清理：删掉六份「过程记录」，把其中耐久的部分搬到本文

用户要求清掉过时/没用的 markdown。按「谁引用它、它记的是什么」逐份审过之后，
删掉了六份**过程记录**（分支工作日志、提交清单、逐文件前后计数），
并把其中**耐久的部分**搬到这里——因为这份计划文档在本项目里是「为什么是这样」的正式记录，
删掉一份记录却丢掉它的结论，是比留着冗余文件更糟的结果。

### 已删（6 份，约 66 KB）

| 文件 | 它是什么 | 为什么可以删 | 耐久内容去哪了 |
|---|---|---|---|
| `I18N_NOTES.md` / `I18N_NOTES_B.md` / `I18N_NOTES_C.md` | `refactor/i18n-a/b/c` 三个**分支**的迁移日志：逐文件 `isZh ?` 前后计数、新增 key 清单、提交 SHA | 分支已合并删除；迁移早已完成；内容是**过程**不是**决定** | 见下「i18n 的保留决定」 |
| `ANALYZER_UX_NOTES.md` | 分析仪信号发生器的**变更日志**（提交清单 + 截图证据） | 功能已交付且被测试覆盖 | 见下「单状态源」 |
| `PERFORMANCE_NOTES.md` | `A-03` 性能工作记录 | 工作已完成；且它引用的 `REFACTOR_NOTES.md` 同时被删 | 见下「memo 那次判断错在哪」 |
| `REFACTOR_NOTES.md` | `StudioView` 拆分的提交清单（2440 → 658 行、18 个 hook） | 拆分规则已固化在 `ARCHITECTURE_SURFACES.md`，过程本身不再有读者 | 见下「StudioView 拆分的数字」 |

**判据**：六份都**没有任何文件引用**（脚本、源码、测试、其它文档都没有），
所以删除不会让 `check:docs:refs` 或任何门禁失败。反过来，**当时保留了**那些被代码引用的文档——
`TIMBRE_NOTES.md`（`instrumentPresets.test.ts` 引用）、`MIX_LOUDNESS_NOTES.md`（`masterGraph.ts` 引用）、
`SLOW_TRACK_HANDOFF.md`（`slow_pack.mjs` 引用）、`STUDIO_REFACTOR_PLAN_v2.0.0.md`（`toolbarTiers.ts` 引用）、
`CODE_REVIEW_AND_PLAN_v1.16.0.md`（多份文档与后续工作都上溯到它，是审计链的起点）。
**「没有引用」是删除的必要条件，不是充分条件**——否则会顺手删掉唯一记录某个理由的文件。

> 开源整理时这条判据被**正面使用**而不是绕过：先把引用改掉，再删文档。见附录 **G.18**。

### i18n 的保留决定（原文的结论）

迁移把**面向用户的文案**全部搬进了 `t("...")` 字典；**刻意留在原地**的是**数据驱动**的三元组
（约 19 处），它们选的是**数据字段**而不是文案（例如按语言选曲风名/乐器名的字段），
搬进字典只会把数据复制一份。**将来做 i18n 审计时，这些残留不是漏迁移。**

### memo 那次判断错在哪（原文的自我更正）

简报曾说仓库「零 `React.memo`」。实测不是：`StepCell`、`TrackRow`、`Ruler`、`GenreRail`、
`InfoDossier`、`Toolbar` **早就是** `memo<Props>(...)`。之前的结论来自检索式 `memo(`——
它**匹配不到** `memo<Props>(`。真正的瓶颈不是缺 memo，而是 `StudioView` 每次渲染都新建
内联箭头函数与内联对象，**令所有 memo 的浅比较必然失败**：任意一次 store dispatch
都会重渲染整张 8×N 网格与整个 Toolbar。这也正是后来把它拆成 hook（G.9）的动机。

> 教训：**「grep 没命中」只能证明检索式没命中**，不能证明东西不存在。

### StudioView 拆分的数字（原文的结论）

从 **2440 行**降到 **658 行**（目标 ≤700），新增 18 个 hook，容器内 `useEffect` 归零
（全部迁入 hook），零行为变更。拆分规则现在是 `ARCHITECTURE_SURFACES.md` 的分层表与判据。

### 单状态源（原文的结论）

分析仪的仪器级信号发生器开关与旧的信号卡片**共用同一个发生器状态源**——
两处控件不会各自持有一份状态而相互漂移。

## G.15 冻结轨道头那一列必须「实心」（v2.0.77 起，v2.0.79 才算修对）

用户报告两次：**连续播放时会侵入轨道头那块空间**，并且强调
「**下方空间应该让用户感觉是实心的**，不能侵入」。

### v2.0.77 只修了一半

第一次我只修了轨道头与网格之间那道 **16px 空隙**（`.trk-head-gap-cover`，见下），
用户复测后说仍然侵入。原因是我把「空隙」当成了全部，而**同一列还有第二处漏光**：

| 漏光处 | 机制 | 实测 |
|---|---|---|
| ① 轨道头与网格之间的空隙 | `gap: var(--trk-head-gap)` 在 sticky 头**盒子之外**，无人覆盖 | 静止 0 个格子、播放中 8 个（每轨一个） |
| ② 轨道头**上下两条边条** | 行高 85px、轨道头盒子只有 **73px**——差的那 6px×2 是**行自己的 padding**，任何子元素都够不到 | 用「列是否实心」的口径测：**3217/16256 采样点透出东西** |

②是关键，也是我第一版没测出来的东西：**我用「这里有没有出现步进格子」当判据，而格子只有 40px、
位于 73px 盒子内部，根本到不了那 6px 边条**——所以检查「通过」了一个透光的列。
**判据错了，比没有判据更糟**：它让我以为修好了。

### 三个测出来的结论（都写进代码注释）

1. **`align-self: stretch` 修不了它。** 给轨道头加 `self-stretch` 后实测高度**仍是 73px**：
   flex 行交叉轴尺寸来自内容盒，而行自己的 padding 在内容盒之外，**子元素无论怎么拉伸都覆盖不到**。
2. **`pointer-events: none` 会让探针看不见图层。** 探针用 `elementFromPoint`，它会**跳过**
   `pointer-events: none` 的元素——于是图层明明在，探针却报 3217 处失败。图层现在不加这个属性：
   它不遮挡任何可交互元素（格子正好从它右缘开始，轨道头 z 更高）。
3. **行的 padding 条必须由行自己画。** 行现在带 `bg-panel`——那里本来就透出面板色，所以静止时
   像素不变，滚动时**不透明**。

### 最终做法

- 新增 `.trk-head-solid`：`position: sticky; left: 0; z-index: 30`，宽度
  `calc(var(--trk-head-w) + var(--trk-head-gap))`，`align-self: stretch`，放在轨道头**之前**，
  用 `margin-right: calc(-1 * (hw + 2*gap))` 抵消自己占的宽度与两个 gap，**布局一格不动**
  （实测冻结列仍是 `[417, 609)`，格子首列仍是 609）。轨道头与标尺标签抬到 `z-40` 画在它上面。
- 行加 `bg-panel`，补上它自己那两条 padding。

### 守卫：判据说清楚了

`npm run probe:grid-gutter` 现在断言的是**「这一列不许透出东西」**，并把采样点分三类：
`column`（轨道头或图层）、`row`（行自己的不透明 padding，**合法**）、
`stepCell`/`transparent`（**失败**）。实测：静止与播放中**全部 solid**
（column 14144、row padding 2112、格子 0）；`--no-cover` 反证：**600 处透出，其中 564 处是格子**。

> 教训（与 G.12、G.14 同一条，这里第二次出现）：**判据本身要先被验证。**
> G.12 的探针用程序化滚动测手势，G.14 的探针在挂着应用的页面上记录调度流，
> 这次的探针用「有没有格子」测「实心」。三次都是**仪器**错了，而三次都表现为「通过」。

## G.14 离线导出不可逐位复现：根因是「一个节点上叠加 3 个振荡器」（v2.0.74 修）

### 起因与最终结论

重新录制 timbre 基线时发现 `chicago-house` 的 `repeatMaxBandDeltaDb` 是 **1.317 dB**，
而 `check_timbre_spread.mjs` 的头注释声称导出器逐位可复现（冒烟测得 0.000014 dB）。
**不是本轮改动引入的**：改动前基线就是 1.317172，改动后 1.317833。

追下去之后，根因是一条**平台层面的可测规律**，而且**修得掉**：

> **一个 Web Audio 节点上叠加 3 个及以上「频率各不相同」的振荡器时，
> Chrome 的 `OfflineAudioContext` 每次渲染的结果都不一样。**
> 同频振荡器可以，buffer 源可以，每个节点最多 2 个可以。

超过 2 个就出问题，直接命中本项目的**踩镲金属簇（6 个方波）**——
而 `[310, 387, 466, 522, 681, 1070]` 正落在**频段 6–10**，与观测到的差异频段完全一致。

### 实测规律（`scripts/diagnose_repeat_determinism.mjs --primitives`，每个图渲染 10 次）

| 图 | 不同哈希数 / 10 |
|---|---|
| 1 个振荡器 / 2 个振荡器 | 1（可复现） |
| 3 个振荡器，**同频** | 1 |
| 3 / 4 / 5 / 6 个振荡器，**不同频** | 3 / 7 / 9 / 10 |
| 3 个 **buffer 源**叠加 | 1 |
| 6 个 buffer 源叠加 | 1 |
| 4 个振荡器按「每节点 2 个」树状扇入 | 1 |
| 3 个振荡器按 (2+1) 树状扇入 | 1 |
| 1 振荡器 + 2 buffer 源（3 个混合源） | 3 |
| 2 振荡器 + 1 buffer 源 | 3 |
| 2 振荡器 + 2 buffer 源 | 7 |
| **平台原生节点**（biquad / compressor / waveshaper / convolver / panner / limiter worklet） | 1 |

结论：**buffer 源不触发，纯振荡器 ≥3 或混合源 ≥3 触发**。
最可能的机制是 Chrome 为振荡器惰性构建**带限波表**：同频振荡器共用一张表，
而「渲染开始时某张表还在被填充」的那一次渲染就会读到不同的样本——
这也解释了为什么差异从一个音符起就出现、极小、且随机正负。

### 修法（三处，全部保留原有音色参数）

| 位置 | 原写法 | 现写法 |
|---|---|---|
| 踩镲金属簇（808 与 909/acoustic/cyber） | 6 个方波振荡器 → `clusterGain` | `inharmonicClusterBuffer()` 烘焙成一个 buffer，1 个源；音高走 `playbackRate` |
| 打击乐 metal 族（triangle 等） | 3 个振荡器 → `bus` | 同上（buffer 按 spec 基频烘焙，`playbackRate = mult` 承载音高轨） |
| 铃鼓 jingle 层 | 3 个振荡器 → `jingle` | 同上 |
| 膜鸣族（timbale，3 个分音各有**独立衰减与音高下滑**） | 3 个振荡器 → `bus` | 不能烘焙（会丢掉「Defect B」的逐分音包络），改为 **(2+1) 树状扇入**，参数一字不改 |
| `kick:*` 模拟底鼓（`somatic-808-gravity` 四层全开） | 4 个振荡器 → `busNode` | 改为 **2+2 树状扇入**（两个单位增益求和节点） |

烘焙的分音用**奇次谐波 1/n** 展开来还原方波（`inharmonicClusterBuffer`），
所以音色不变，同时**每次踩镲少 6 个振荡器**——踩镲是 pattern 里最密的声部。
缓冲按「采样率 + 分音集合」缓存，一个采样率只烘焙一次。

守卫测试：`src/test/oscillatorFanIn.test.ts`（对全部鼓件、全部 16 个打击乐模型、
全部 `kick:*` 预设断言「同一节点首次混合的异频振荡器 ≤2」），
以及 `drumFidelityTier1.test.ts` 里对烘焙缓冲的 **Goertzel 频谱断言**
（每个分音基频与三次谐波都有能量、非谐波频点没有）——
后者是为了防止这次改动把 Q4 的金属簇悄悄变成静音缓冲。

### 修掉的效果（实测，**全库 159 曲风复测**，不是单曲风抽样）

先说明一次自我更正：本轮中途我曾据**单曲风一次**的测量写下「1.317 dB → 0.0001 dB」，
随后录完整库基线发现**那是抽样误差**。真实数字如下（每个曲风重复渲染 2 次）：

| 指标 | 修前（6 振荡器簇） | 修后（烘焙缓冲） |
|---|---|---|
| 中位数 | 0.000067 dB | **0.000063 dB** |
| p90 | 0.000698 dB | 0.000578 dB |
| p99 | 1.152777 dB | 1.320452 dB |
| 最大值 | 1.317833 dB（chicago-house） | **1.546828 dB（detroit-techno）** |
| >0.10 dB 的曲风 | chicago-house, electro-house | chicago-house, detroit-techno, acid-techno |

**所以：这轮修改并没有消掉那个 ~1.3 dB 的离群事件。**
中位数（也就是「每次都有的那层底噪」）**完全没变**——量级 ~6e-5 dB，属亚采样级时序差异，
对指纹没有影响。离群事件仍在，而且**每次跑命中的曲风都不一样**
（修前是 electro-house，修后是 detroit-techno / acid-techno），
说明它**与具体曲风无关**，只是「那一刻正在渲染谁」。

那这轮修改的意义是什么？**它是一个独立的、有实测依据的正确性修复**，而不是这个离群事件的解药：

- 它消掉的是「同一节点叠加 ≥3 个异频振荡器」这一**明确可测的平台违规**，本项目的踩镲正踩在上面；
- 每次踩镲少 6 个振荡器、每个金属族打击乐少 3 个（最密的声部，实打实的 CPU）；
- 留下了 `oscillatorFanIn.test.ts` 这条守卫，使「下一个为了更丰富再加一个分音」的改动不会重新踩坑。

### 结论（v2.0.78 定案）：**调度是确定的，不确定的是浏览器的 DSP**

前面三套假设全部落空（振荡器扇入规则、限幅器回退、GS-1 回退 + 未缓存的 WASM 抓取）。
第四个动作不是再猜，而是**直接测量**：把 `AudioParam` 的调度方法与源节点的 `start` 全部记录成
一条「调度流」，逐次渲染比对**同一次渲染的调度流哈希与音频哈希**
（`scripts/diagnose_repeat_determinism.mjs --stream=N [--bars=3]`）。

| 条件 | 渲染次数 | 不同的**调度流** | 不同的**音频** | 每次调度调用数 |
|---|---|---|---|---|
| 1 小节 | 30 | **1** | 30 | 529（恒定） |
| 3 小节 | 8 | **1** | 8 | 1079（恒定） |

**每次渲染调度的参数流逐字相同，音频却每次都不同。**
也就是说：**本项目这一侧没有任何非确定性**，差异发生在浏览器 DSP 内部；
把它归因到本项目的代码是错的，**再改图也不可能变成逐位一致**。

这条结论也解释了为什么差异随长度放大：1 小节时频段差 ~1e-4 dB，3 小节时到 ~1.3 dB——
起点只是 LSB 级的 DSP 差异，经过饱和/压缩这些非线性级被逐步放大。
所以那个「每跑命中一个曲风」的 ~1.3–1.55 dB 离群值不是「另一个输出」，
而是同一条发散分布的尾部；幅度稳定是因为放大倍率是信号链的属性。

**正确的应对不是继续改代码，而是把承诺改成容差**：门禁的阈值论证现在建立在
**实测的重复底噪**上（中位数 ≈0.00007 dB，p90 ≈0.0006 dB），而不是那个被证伪的「0 dB」。

> 方法论注记（这轮最贵的教训）：**探针本身先要可信。**
> `--stream` 的第一版在挂着 app 的页面上记录，于是一边渲染一边把**活引擎**的调度也记了进去，
> 调用数出现 2199 与 529 两个值（4 倍差），看起来像一个惊人的发现；
> 同时它的参数 id 在整个页面生命周期内递增，导致每次渲染的流哈希**必然**不同。
> 两个缺陷都在**没有挂载任何东西的空页面**上跑、并把 id 限制在单次渲染内之后消失。
> **先怀疑仪器，再怀疑被测对象**——这一条值得写在这里，因为它差点让我去修一个不存在的问题。

### 顺带修掉的两个真缺陷（都不是离群值的成因）

调查过程中测出两个独立缺陷，**已修，但都不是那个 ~1.3 dB 离群值的原因**（修完后离群值仍在，
见下表）。它们值得单独记录，因为都属于「导出会静默地变成另一个东西」这一类：

**① GS-1 核心 WASM 每次建 host 都重新抓取（v2.0.78 修）。**
`fetchCore` 没有缓存，而 host 是**每个被路由的轨道、每次渲染**都建一个：
159 曲风 × 2 次重复 × 2 条轨道 ≈ **600 次多余的多兆字节抓取**，每一次都带着 20 秒超时定时器。
实测：连建 3 个 host 会抓 3 次 `/gs1/synth_core.wasm`；加缓存后 1 次。
抓取失败会让 `createGs1Host` reject，而 `renderPatternOffline` 只是 `catch` 掉、
那条轨道改用内置合成器**且只影响那一次渲染**——实测指纹偏移 **0.71–3.66 dB**（取决于哪条轨道）。
缓存把「有机会失败」变成「没有请求可失败」。
测试 `gs1CoreCache.test.ts`（去掉缓存即失败：3 → 1）。

**② GS-1 host 静默回退（v2.0.78 修）。** 现在**有界重试 3 次**，并把失败数一路报出来
（`RenderWavOptions.onGs1HostFailures` → `ExportedWav.gs1HostFailures` → 导出提示改为
「GS-1 音色未能加载，导出仍有效但不是你试听的那个」）。测试 `gs1HostRetry.test.ts`
（把重试次数改成 1 即失败）。回退本身保留——失败的是「静默」。

**同时更正 G.14 早先的一个归因错误**：早先 `--force-fallback` 测到的 4.83 dB 曾被我记成
「限幅器回退的代价」。那一次拒绝的是**所有** `addModule`，同时打掉了限幅器 **和两个 GS-1 host**。
单独让限幅器失败实测：**频段形状只差 0.67 dB**（band 11），另外 2.4 dB 是整体电平。
所以那条数字不能算在限幅器头上。

### 四次全库复测：离群值没有被我修掉

| 代码状态 | 全库最大 `repeatMaxBandDeltaDb` | 命中曲风 |
|---|---|---|
| v2.0.73 基线（扇入修复前） | 1.318 dB | chicago-house |
| 扇入修复后 | 1.547 dB | detroit-techno |
| GS-1 重试后 | 1.161 dB | electro-house |
| GS-1 缓存后 | 1.546 dB | detroit-techno |

中位数四次都在 0.000063–0.000073 dB 之间（即「每次都有」的那层底噪没变）。
**离群值稳定存在、每次命中的曲风不同、幅度 1.16–1.55 dB**——与上面的结论一致：
它是 DSP 差异在非线性级上的尾部放大，不是任何一处可修的代码。因此它从「待修缺陷」
降级为**已知的、有界的平台特性**，并已按此写进门禁的阈值论证。

## G.17 和弦进行「割裂」的两个实测根因（v2.0.80 修）

用户报告：在钢琴卷帘写入和弦进行后，配好的和弦「都很割裂」，并自猜
「可能是因为都是一两个和弦而且拍子很短的缘故」。**先量再改**：把 8 条进行 × 4 种小节长度
（1/2/4/8 小节，1/16 网格）全跑一遍，两个根因都成立，而且就在同一处代码里。

### ① `stepsPerBar` 被接收，但从未使用

`previewProgressionNotes(scale, prog, stepCount, stepsPerBar)` 的和声节奏是
`floor(可用步数 ÷ 和弦数)`——**与小节无关**。于是一小节 16 步的模板里：

| 进行 | 和弦数 | 旧「每和弦步数」 | 听感 |
|---|---|---|---|
| 任何 4 和弦进行 | 4 | 4 步 = **1 拍** | 每拍换和弦 |
| 卡农（8 和弦） | 8 | 2 步 = **半拍（8 分音符）** | 8 个和弦挤进一小节 |

### ② 和弦的「槽」能超过一个音符的长度上限，gate 却被钉死在 16

`MAX_NOTE_GATE_STEPS = 16`（= 一小节）是音符模型的硬上限，成曲规则也写明了
（`data/genreExpression.ts`：「一个音符最长一小节，整小节和弦就是一个长 gate 的音符」）。
旧代码让**槽长**（`stepsPerChord`）自由增长，却把 gate 夹在 16：

| 进行 | 模板 | 旧槽长 | 旧 gate | 实际发声 |
|---|---|---|---|---|
| `dorian_funk_14`（双和弦 vamp） | 4 小节 | 32 步 | 16 步 | **响 1 小节、静 1 小节** |
| `dorian_funk_14` | 8 小节 | 64 步 | 16 步 | **响 1 小节、静 3 小节** |

**这才是「一两个和弦 + 拍子很短」的真相**：用户选的正是那条双和弦 vamp——和弦少（2 个）、
每小节又只响一半。用户的直觉指对了位置，因果却是反的：不是「和弦太少所以听起来短」，
而是**槽被拉长、gate 被截断**，每个和弦有一半是静音。

### 修法：跟随成曲规则（一小节一个和弦），装不下就**重复**而不是拉长

- 节奏阶梯：一小节/和弦 → 半小节 → 一拍，取**能装下整条进行的最慢档**；永不快于一拍
  （比一拍更快的分割不是和声，是 stab）。
- 一整条进行装不下时**丢掉多余和弦**并在提示里说明（`truncated`），而不是继续细分。
- 小节数多于进行所需时**重复进行**填满（`cycles`）——音符模型的 16 步上限不允许
  「一个和弦占两小节」，而 `dorian_funk_14` 铺满 4 小节本来就该是 i–IV–i–IV。
- 整段跨度由实例无缝平铺，唯一的静音是刻意的 10% 释放（`gate = 槽 × 0.9`）。

修后同一张表：

| 进行 | 1 小节 | 2 小节 | 4 小节 | 8 小节 |
|---|---|---|---|---|
| 4 和弦进行 | 1 拍 ×1 | 2 拍 ×1 | **1 小节 ×1** | 1 小节 ×2 |
| `dorian_funk_14` | 2 拍 ×1 | 1 小节 ×1 | **1 小节 ×2** | 1 小节 ×4 |
| 卡农 | 1 拍 ×1（只放 4/8，提示） | 1 拍 ×1 | 2 拍 ×1 | **1 小节 ×1** |

8 条进行 × 4 种长度的**最大静音占比：75.0% → 10.0%**（剩下的全是刻意的释放）。
最坏情形是 `dorian_funk_14` 在 8 小节模板里：槽长 64 步、gate 被夹到 16 步，
即**每个和弦的槽里有 75% 是静音**（4 小节情形是 50%）。
`dorian_funk_14` + 4 小节：旧 = 2 个 32 步槽 / 16 步 gate，新 = i–IV–i–IV 各占满 1 小节。

### 试听与提示一起改（否则又是「试听 ≠ 结果」）

`handleAuditionProgression` 现在直接消费同一个 plan 的 `instances`（音高、起点、gate、
小节内位置），不再自己算「固定 450 ms × 0.9」。「试听 = 写入结果」因此是**结构性**成立，
而不是两处算术的巧合。写入提示也从「已写入和弦进行：X」变成
「… · 每小节 1 个和弦 · 重复 4 次」或「… · 每拍 1 个和弦 · 小节太短 — 只放得下 4/8 个和弦」。

测试：`rollModel.test.ts` 新增 6 条（`progression harmonic rhythm`）。把旧节奏公式放回去实测
**3 条失败 / 63 条通过**（重复、快于一拍、平铺三条），说明这些测试守得住这个缺陷。
全量单测 174 文件 / 2029 测试。

### 同一轮修的另一半：工作区播放不再只剩和弦

「试听本轨」会在引擎上设一个只调度单轨的预览范围，而工作区的播放键从不清除它——
用户写入和弦后再按播放，听到的只有 chords 轨。修法刻意分两层：

- **音频层**（`AudioEngine.play()`）：全量播放默认清掉范围，唯一例外是 `playScoped()`。
  不变量放在这里，所以它不依赖任何界面「记得」调用什么。
- **UI 层**（`useAuditionPreview` → `useTransportControls`）：范围没了以后，卷帘的
  `isRollPreviewing` 也要释放，否则那个开关会亮在一个已经不存在的范围上。
  传输控件在视图里比持有范围的 hook **更早**创建（后者依赖更晚产生的 `handleAudition`），
  所以这根线用 ref 后置绑定，并保持回调身份稳定（它在传输控件的 `useCallback` 依赖表里）。

这根线属于**接线**而不是行为：hook 写对了但没人传，和没写这个功能无法区分
（本仓已用 `genreInsertWiring.test.ts` 立过这个判据）。所以 `pianoRollPreview.test.ts`
里加了**源码级接线断言**（读 `StudioView.tsx`，断言传输确实收到 `releasePreviewScope`、
ref 确实绑到了 hook 的导出），并另有一条断言把「清范围的是引擎而不是界面」钉住。
实测把那一行参数删掉，接线断言立刻失败。

### 顺带量到、但**没有**动的东西：曲库自带和弦轨的同类现象

同一把尺子量 159 个曲风的 chords 轨（是曲库数据，不是模板）：

| 指标 | 数量 |
|---|---|
| 有 chords 轨的曲风 | 139 / 159 |
| 至少一个和弦的 gate < 到下一个和弦的间距 | 79 / 139 |
| **全部**和弦都如此（每个和弦之后都有静音） | 59 / 139 |
| 不同和弦排列（voicing）≤ 2 种 | 89 / 139 |
| 平均间距 ≤ 2 步（每 8 分音符换和弦） | 12 / 139 |

最极端的是 dubstep / techstep / speedbass / downtempo / brooklyn-drill：`gate/gap = 0.13`
（一小节里响 2 步、静 14 步）。**但这些是否算缺陷取决于曲风**：dubstep 的 stab 留白可能
是刻意的，house 的 pad 留白就是错的。逐个判断等于重写 159 个曲风的编曲，并会把
`scripts/timbre.baseline.json` 的全库指纹全部推翻——所以这一轮**不动**，列为下一轮候选
（判据：和弦乐器属 pad/sustain 类则必须连奏，stab 类才允许留白）。

## G.18 开源整理：删 5 份被取代的文档、重写 `DEPLOY.md`、补 README 与 LICENSE

用户准备把仓库公开到 GitHub，要求删掉没用/过时的 markdown，并补中英文 README 与 MIT license。
G.16 立的判据是「没有引用才能删」。这一轮**先在代码与文档里改掉引用，再删文档**，
所以判据仍然成立：删除后 `check:docs:refs`、`docs:check`、`version:check` 都没有变红。

### 已删（5 份，约 158 KB）

| 文件 | 它是什么 | 为什么过时 | 引用怎么处理 |
|---|---|---|---|
| `IMPROVEMENT_PLAN.md` | v1.0 基线的**历史**规划（开头自称「历史文档」），头部写 194 文件 / 134,892 行 | 基线早已是 v2.0.80；`docs:check` 拿它做行数基线，而那个数字漂了约 40% | `BACKLOG.md` 头部改指本文；`check_docs.mjs` 去掉该文档与行数断言；`version.mjs` 去掉它的版本头重写，并删掉随之变成**死代码**的 `measureSourceSize()` |
| `STUDIO_REFACTOR_PLAN_v2.0.0.md` | 工作台重构规划（目标 v2.0.0–v2.0.12） | 每条都已交付或并入本文的 U/C/L 系列 | `toolbarTiers.ts`、`MobileTransportBar.tsx` 的注释改为自述量测；审计表两处注明「已删除」 |
| `CONSOLE_FLOAT_NOTES.md` | v1.16.17 浮层调音台的交付记录 | 交付记录，功能已被测试覆盖 | 审计表去掉指向它的尾注 |
| `CROSS_ENGINE_TESTING_NOTES.md` | 对照姊妹项目做的跨引擎审计 | 一次性审计，结论已进测试 | `AUDIO_QUALITY_AND_SYNTH_PLAN.md` 只留教训本身，不再指向文件 |
| `SLOW_TRACK_HANDOFF.md` | 慢机器↔快机器的门禁交接流程 | 作者本机工作流，对读者没有意义；工具 `slow_pack.mjs` 仍在 | 改指脚本自身的 preflight 注释 |

### 重写而不是删除：`DEPLOY.md`

它已经**假**到不能留：声称有 `release/groove-release.tar.gz`（仓库里没有这个产物）、
「401 项测试 / 49 个测试文件」（实测 174 文件 / 2029 测试）、项目名写成了另一个名字，
而且完全没写真正的部署方式（Cloudflare Workers + `scripts/deploy.mjs` + `.env.deploy`）。
部署恰好是开源用户真正需要的信息，所以按实测重写。

### 同时处理的仓库卫生

- `wrangler.toml` **取消跟踪**：`.gitignore` 早已忽略它，但它仍被跟踪，于是忽略形同虚设——
  而它写的是**作者的 worker 名**。补 `wrangler.toml.example`，并把步骤写进 `DEPLOY.md`。
- 全库扫过密钥：只有 `.env.deploy.example` 里的 `replace-me` 占位符；`.env` 从未进过 git 历史
  （`git log --all -- .env` 为空）。`vendor/gs1/` 是第三方代码，其中一条注释提到 `prd.md`
  属上游文本，**不改**。
- 新增 `README.md`（英）/ `README.zh-CN.md`（中）/ `LICENSE`（MIT）；`package.json` 补
  `license` 与 `description`。线上体验地址进两份 README：`https://groove.wangda.today/`。

### 保留了什么，为什么

`PRODUCT_PLAN_v2.1.0.md`（当前计划 + 全部附录）、`ROADMAP_V2.md` / `BACKLOG.md`（当前基线，
`version:sync` 写它们的版本头、`docs:check` 校验）、`ARCHITECTURE_SURFACES.md`（三端解耦的现行约定）、
`prd.md`（最初的需求；`vendor/gs1` 与审计链上溯到它）、`AUDIO_QUALITY_AND_SYNTH_PLAN.md` 与
`CODE_REVIEW_AND_PLAN_v1.16.0.md`（代码注释里 `E-xx` / `V-xx` / `N-xx` 编号的登记表）、
`TIMBRE_NOTES.md` / `MIX_LOUDNESS_NOTES.md`（音色与母带/响度的实测记录，门禁基线以它们为据）。


## G.19 送出改到声像后分接：实时与导出重新一致（v2.0.81）

### 缺陷（读代码 + 图断言双重确认）

`AudioEngine.setupTrackStrips` 把 `sendA`/`sendB` 从 `stripOut` 分接——那是极性/分析仪那一级，
位于 `StereoPannerNode` 的**上游**；而离线导出器 `WavExporter` 从 `tPan`（声像**之后**）分接，
并且它的注释还写着「the live engine taps post-pan」——**注释是假的，两张图不一致**。

后果：硬左/硬右的轨道，混响与延迟收到的是**居中**的信号，于是干的信号在一侧、湿的尾巴在正中间，
逐曲风策展的送出量失去了它本来要制造的宽度。真实调音台的惯例同样是 post-pan：效果跟着声源走。
（这正是 §3.3 的 **M1**，也是 §3.5 / G.11 里一直挂着的「送出为声像前分接」。）

### 修法

```ts
const sendTap: AudioNode = panner ?? spatialPanner ?? stripOut;
```

两个送出都从 `sendTap` 分接。空间（HRTF）模式下自动跟着 `spatialPanner`；没有声像节点时回退到
原来的 `stripOut`。实时链路的其余部分（插入条 → duck → 推子 → 极性 →[分析仪]→ 声像 → 分组总线）
一个节点都没动，所以这不会顺带改变别的声音。

### 测试（新增 `src/test/trackSends.test.ts`，4 条）

1. 硬左轨道（`pan: -1`、两个送出全开）：两个送出的 `incoming` **只有 panner**，且 panner 上确实是 −1；
2. 打开逐轨分析仪时仍分接在声像之后（旧代码这时分接点会变成分析仪，仍在声像之前）；
3. 空间模式下分接 `spatialPanner`；
4. **离线导出器分接在同一级**：离线图里被硬左 panner 直接喂到的增益正好 3 个
   （分组总线 + 混响送出 + 延迟送出）。

把送出改回 `stripOut` 实测：**第 1–3 条失败**，第 4 条本来通过——它钉的正是导出侧那一级，
也就是这次要对齐的目标。全量单测 **175 文件 / 2033 用例**。

### 为什么**没有**重录 timbre / loudness 基线

两个基线都由 `measure_genre_timbre.mjs` / `measure_genre_loudness.mjs` **只经
`renderPatternOffline`（离线导出器）**渲染得到（脚本头部与本轮复核都确认：`path` 字段写的是
`offline: renderPatternOffline() via Vite dev server`）。本轮的改动**只在实时 `AudioEngine` 的送处分接点**，
导出器的分接点本来就是对的，所以它的输出没有变，基线仍然准确。

我起过两轮全库重测（约 25 分钟/轮），确认这一点后**主动终止**：否则只会把平台的 DSP 重渲染噪声
（中位数 ≈7e-5 dB、偶发 1.16–1.55 dB 离群，见 G.14）写进已提交的基线，换来约 270 KB 无意义 diff。

**顺带记一个工具坑**：`measure_genre_loudness.mjs` 在全库跑到一半时会**就地覆盖**
`scripts/loudness.baseline.json`（不像 timbre 那样只写 `.progress.json`、末尾才落盘），
所以中途终止会留下一个残缺的基线。本轮踩到了，已 `git checkout --` 还原并核对 md5 与 HEAD 一致。
如果以后要中途停它，先备份基线。

## G.20 立体声合唱：两个抽头各走一个声道，反向调制（v2.0.82）

### 缺陷（读代码确认，两半都在湿分支里）

`EffectsRack` 的合唱湿分支原来是：`crusherNode → chorusDelayL / chorusDelayR → ChannelMergerNode → chorusWet`。

1. **两个抽头拿到的都是「立体声总线的单声道和」。** `ChannelMergerNode` 的每个输入按规范只有
   **1 个声道**，所以把立体声信号接进去会被**降混**。一个本来用来加宽声场的效果，实际把声像塌成了
   单声道，左右唯一的差别只剩固定的 15 / 22 ms 延迟。
2. **两个延迟时间由同一个 LFO 增益驱动**（`depth` 同时接 `chorusDelayL.delayTime` 与
   `chorusDelayR.delayTime`），所以两侧**同相**摆动——这是「双单声道」合唱，不是立体声合唱。

### 修法

- 湿分支先经过一个**显式两声道**的增益再分流：
  `crusherNode → chorusStereo(2ch, explicit, speakers) → ChannelSplitter(2) → 左右各一个延迟 → merger(2)`，
  左抽头 = 声道 0、右抽头 = 声道 1。那个显式上混是必要的：`ChannelSplitterNode` 遇到单声道输入时，
  输出 1 是**静音**——全居中的混音会把右抽头整个丢掉。
- LFO 改成**两个增益、一正一负**（`+3 ms` / `−3 ms`）：两侧反向摆动，这正是 Juno 那一代立体声合唱的
  做法（加宽而不是只做梳状）。两个基延迟是 15 / 22 ms，±3 ms 摆动不会把延迟时间推到负值。
- 调制深度提成一个常量 `CHORUS_DEPTH_SEC = 0.003`，不再散落在代码里。

### 测试（新增 `src/test/chorusStereo.test.ts`，6 条）

图断言（这个缺陷就在图里；顺手给 `FakeNode` 加了 `outgoing`，记录每条边用的输出/输入**序号**——
`incoming` 分不出分流器的两个输出，而「哪个输出喂哪个抽头」正是这次的缺陷）：

1. 分流器存在且是 2 输出；左抽头来自 `outputIndex 0`、右抽头来自 `outputIndex 1`；两个抽头不再从
   分流前的节点取信号；
2. 分流前那个增益是 `channelCount 2 / explicit / speakers`（单声道混音也保得住右抽头）；
3. 两个抽头回到合并器的**不同输入**（`inputIndex 0 / 1`）；
4. 两个深度的**幅度相同、符号相反**；
5. 关闭合唱后两个深度增益都被释放（不能像早先那样留下一个空转的振荡器）；
6. **关闭时湿增益为 0、不创建 LFO** —— 这条钉住「旁通时不影响渲染」，也就是下面基线不动的依据。

把旧接线放回去实测：**第 1、4 条失败**。全量单测 **176 文件 / 2039 用例**。

### 为什么基线又一次不需要重录

和 G.19 同样的道理，而且这次连「有没有曲风开启它」都查了：`DEFAULT_FX_STATE.chorusEnabled = false`，
且**曲库数据里没有任何一个曲风把它打开**（`grep "chorusEnabled: true" src/data/*.ts` = 0 处）。
两个基线都只经离线导出器渲染，而旁通状态下湿增益为 0、新节点到不了输出（第 6 条测试钉住这一点），
所以既有基线仍然准确——这一点是**查过**的，不是推断的。

## G.21 值写入不再重建图（v2.0.83），以及 §3.3 那一表的分诊结果

### 修的是什么

`EffectsRack.setFilter()` **无条件**调用 `updateFilterRouting()`，而后者先把两条边都断开
（`inputNode.disconnect()` / `filterNode.disconnect()`）再按 `filterEnabled` 重接——在实时图里这不是
空操作，而是**主链路上一次短暂的断路**。更糟的是它的调用时机：`applyGenreFxToGraph()` 在**每次
`setPattern` 和每次 BPM 变化**时都会调用 `setFilter`，所以只要滤波器是开着的，**拖速度滑杆就会把主
滤波器拽出链路再装回来一次**（每个输入事件一次）。

修法：路由只取决于 `filterEnabled`，所以记下上次为哪个值布线（`routedFilterEnabled`），值变化只写参数、
不发图。频率/Q/类型仍然用**步进**写入——这是刻意的，见下。

### 测试（新增 `src/test/effectsRackRewiring.test.ts`，3 条）

给测试用的 `FakeNode` 加了 `disconnectCalls` 计数器：「断开一条边再接回同一条边」在实时图里不是
空操作，计数正是区分「重建了路由」和「写了个值」的东西。

1. 只改 cutoff/Q 的连续写入：`inputNode` / `filterNode` 的 `disconnectCalls` **不变**，而参数确实写进去了；
2. 开关滤波器**仍会**重连，且重连后的边是正确的那一组（开：input→filter→shaper；关：input→shaper）；
3. **走用户真实路径**：`applyGenreFxToGraph(graph, resolveGenreFx("chicago-house"), bpm)` 连调 5 个不同
   BPM，已开启的滤波器一次都没被重连。

把 `setFilter` 改回无条件重连实测：**第 1、3 条失败**。全量单测 **177 文件 / 2042 用例**。

### §3.3 那一表的分诊（这轮顺手把「未验证的缺陷」变成「有证据的结论」）

审计表是当时的快照，其中几行要么已经修过、要么被我读成了比实际更严重的问题。逐行核实后：

| 行 | 结论 | 证据 |
|---|---|---|
| **M4** 乒乓切换重建延迟图、砍断尾音 | **已完成（v2.0.92）** | `genreFx.ts` 有 **11 处** `pingPong: true`，切到/切离这些曲风即 `_build()`。旧 build 现在不断线，只淡出（窗长跟着延迟时间 0.25–0.5 s），拆除在下次 `setParams`/`dispose` 时按 `ctx.currentTime` 判定，不用定时器。6 条新测试，把旧行为注入回去实测 4 条失败。见 G.31 |
| **M5** 混响 IR 在主线程生成，「最长约 9 s，约 4 MB」 | **降级**，且原文数字混淆了两件事 | 9 s 是**冲激响应长度**（`ambient` 确实用 9.0 s）；**生成耗时**实测 0.9 s→**4.3 ms**、1.9 s→**6.4 ms**、9 s→**29.7 ms**，初始化 0.2 ms。最坏 1–2 帧、一次性。Worker 方案从「必修」降为「若 profile 显示才做」 |
| **M8** 插入条参数无平滑；`setFilter` 每次写都重连 | **一半已修**（本轮），一半是刻意 | 重连那半已修；步进写入那半是 `ChannelStripDsp.writeParam` 注释写明的刻意选择（步进 → 离线渲染逐位一致） |
| **M9** 实时 probability 用 `Math.random()`，导出确定性 | **刻意为之，不是缺陷** | `AudioEngine` 该处注释：Chance 是演奏功能，每次经过重掷；导出确定性是为了可复现，并写着「Do not "fix" this by seeding live playback」 |
| **M11** 逐轨 swing 丢掉延迟补偿 | **已完成（v2.0.94）** | 独立 swing 分支自己重建时间，于是丢了**两个**活演奏修正（延迟补偿 + 不得早于 `currentTime` 的钳位），比其它轨道早整整一个补偿量。2 条新测试用 20 ms 正补偿与 −8 ms 负补偿钉住；把旧行为注入回去，两条都失败且差值正好是被丢掉的 20 ms / 8 ms。见 G.33 |
| **M12** 混响返回量 ramp 没先钉住当前值 | **只在降级路径成立** | 现代路径先 `cancelAndHoldAtTime(now)`；只有不支持它的 context 才退到 `cancelScheduledValues` |
| **M14** 限幅器滑窗最小值每样本 O(D) | **已完成（v2.0.95）** | 三条里"瞬时起音"在有前瞻时是对的、"NaN/Inf"不会污染增益（没加掩盖上游损坏的消毒分支），真问题只有滑窗扫描。换成单调队列后**输出逐位不变**（7 组 golden 哈希全同），比较次数 145.0 → **1.939/样本**。两份实现（TS 内核 + `public/limiterWorklet.js`）都改了，原有的 worklet 对拍测试 + 新的源码守卫一起防漂移。见 G.34 |

**教训（这轮重复犯了旧错）**：我先按计划的表述打算「修 M9」，读代码才发现注释明确写着不要那样修；
M5 也是先量了才发现 30 ms 而不是 9 s，还先按表里前几行的 0.9–1.9 s 推断「没有曲风用长衰减」，
再查全表才发现 `ambient` 用满 9.0 s。**审计表也是二手材料，动它之前要回到代码与实测。**

## G.22 静默 no-op：点了没反应的那些控件现在都会说话（v2.0.84）

用户对「上手」的核心抱怨是「点了没反应」。§4 的 U7 列了五处**状态变了却一个字都不说**的地方，
本轮把五处都补上反馈（`showToast` + `announcer.announce`，也就是「只听鼓组」一直在用的那一对）：

| 位置 | 旧行为 | 现在 |
|---|---|---|
| tap tempo 第一次点 | **什么都不发生**（要两次才有反应） | "再点一次即可测定速度"（toast + 播报） |
| tap tempo 第二次点 | 有 toast，但**没有播报** | toast + 播报都带上测得的 BPM |
| song mode / blind compare / metronome / count-in | **四个开关都只改状态**：没有 toast、没有 announce | 每个开关都报告**新状态**（开/关各一条文案），并播报 |
| 撤销 / 重做（历史为空） | **静默返回** | "没有可撤销的操作" / "没有可重做的操作" |
| 播放（引擎实例还没就绪） | **静默返回** | "音频仍在启动中——请稍后再点一次播放" + 播报 |

顺带把撤销/重做里「有历史、但引擎恰好还没就绪」的情况也改了：以前它连确认提示都一起吞掉，
现在存储已经回滚，就照常给确认（同步引擎退化为尽力而为）。

### 死分支（顺手查明）

`handleTapTempo` 里那段 `if (calculatedBpm >= 40 && calculatedBpm <= 240)` **永远不会为假**：
`AudioEngine.calculateTapTempo` 自己就把结果 `Math.max(40, Math.min(240, ...))` 并 `Math.round`，
退化输入还返回 120。所以「超出范围」从来不是一个静默 no-op——那个分支是死代码，已删掉并加了注释。
（**但它暴露了另一个诚实问题**：点得过快/过慢时结果被夹取，界面却把它当"测到的速度"显示。
没有证据说这会困扰用户，所以这轮只记录、不改。）

### 测试（`transportPlaybackTruth.test.ts` 新增 6 条 + 改写 1 条）

断言**刻意与语言无关**（测试环境解析到哪种语言不确定）：文案存在、同一个开关开/关两条文案**不相同**、
以及提交给 store 的 action 载荷正确。播报通过 `announcer.setListener()` 捕获计数。

同时把测试里那个假引擎补全了：它只有 `play`/`stop`/`isAudioBlocked`，所以 `setBpm` 一被调用就在
handler 里抛异常——**看起来像被测代码的错，其实是假替身不完整**（和之前 `mobileBottomControlBar`
缺 `setPreviewScope` 是同一类）。现在 `setBpm`/`setPattern`/`setSwing`/`setTimeSignature`/
`setResolution`/`setDrumsOnly` 都在，并在接口上写明了原因。

把 hook 暂存回改前的版本实测：**7 条全部失败**（"引擎未就绪"那条 + 6 条新增）。
全量单测 **177 文件 / 2048 用例**。

### 顺手核实的 §4 清单

- ~~`toolbarTiers` 接线~~ **已完成（v2.0.76，G.10）**：`Toolbar.tsx` 里 `isControlVisible` 与
  `data-toolbar-tier` 都在。
- ~~`layout.density` 落地~~ **已完成**：`useDensityPreference()` 在 `StudioView` 调用，
  `index.css` 有 `:root[data-density="compact"|"comfortable"]` 规则。
- ~~iOS 静音无声（U6）~~ **已完成**：`play()` 被 await、有 catch，`isAudioBlocked()` 决定是否声称在播放。
- **仍未做**：**首屏单一动作**（U1/U2：把 onboarding 第 2 页提前成「按播放 → 点一个格子」），
  以及 v2.1.2 清单里的术语表、工具栏 `?` 入口、Modal 栈这三项（本轮未核实，不宣称状态）。

## G.23 新手引导的第一个动作，以及「误点一次就永久消失」（v2.0.85）

U2 的原文是：7 页 onboarding 是**功能清单**，只有第 7 页有动作，所以新用户**先读 7 屏才第一次出声**。
本轮把能一次点击就出声的那一半做掉，并修掉一个更糟的问题——引导会因为一次误点而永久消失。

### 修的三处

1. **遮罩/Esc 关闭不再等于「已完成」。** `Modal` 的 `onClose` 在点遮罩和按 Esc 时都会触发，而它
   原本直接接到写入 `groove_onboarding_completed` 的 `handleFinish`——**一次误点就等于永久关闭**，
   而且偏偏发生在最需要这份引导的人身上。现在只有显式的「跳过」和最后一页的两个动作会写标记；
   关掉之后下次仍会再问一次。
2. **第 1 页就有单一动作**：「先听一下这个曲风」→ 关掉引导、切到工作台、**开始播放**。
   刻意不写完成标记：想听一段律动不等于「读完了」。
3. **About 页可以重看引导**（清掉完成标记并重新打开）——否则「我不小心关了」除了清站点数据没有别的补救。

### 「等引擎就绪」这件事，是我自己的测试先抓到的

引导的第 1 页把请求交给工作台时，工作台**还没挂载完**：引擎实例由里面的一个挂载 effect 创建。
第一版 `useInitialAutoPlay` 接收 `engineRef` 并在 effect 里读 `engineRef.current`——**看起来在等，
实际上是拿 `null` 判空后直接返回，而且不会再有下一次**（设置 ref 不触发重渲染）。

我为此写的那条测试（「引擎在首次渲染之后才就绪」）**当场失败**，才暴露出这个设计错误。
修法不是加轮询，而是把它变成**依赖**：`useAudioEngineLifecycle` 新增 `engineReady` 状态（引擎创建时置真），
hook 收 `ready: boolean`。这样「引擎存在」这件事第一次成为**可观察**的，别的消费者（手机端、教学）
也不用再猜。第 1 页动作的测试也随之变成「先 pending，后就绪 → 只播一次」。

### 测试（+9 条，178 文件 / 2057 用例）

- `initialAutoPlay.test.ts`（5 条）：就绪即播且只播一次、**未就绪时不丢请求**（就是上面那条）、
  消费后重渲染不再播、无请求时不动作、**第二次请求仍然有效**（假 → 真）。
- `NewUserOnboardingModal.test.tsx`（+3 条）：Esc / 关闭按钮都不写完成标记（跳过按钮仍然写，原有测试保留）、
  第 1 页有单一动作且不写完成标记、以及一条**源码级接线断言**（App 把 `onAudition` → `setInitialAutoPlay(true)`、
  把 `initialAutoPlay`/`onClearInitialAutoPlay` 交给 `StudioView`、`StudioView` 用 `ready: engineReady`）——
  理由同 `genreInsertWiring.test.ts`：hook 写对了但没人接，和没这个功能无法区分。
- `settingsModal.test.tsx`（+1 条）：About 页的重看入口真的调到宿主的回调。

把源码暂存回改前版本实测：上述 **4 条失败**（第 1、2、3 条与设置那条）。

### 仍然没做的那一步

U2 的另一半是「**点一个格子**」：让用户在引导里直接点出一个音符。那要求引导**不遮住编辑器**
（非模态高亮 + 指向某个 step cell），与现在的模态结构是两件事，因此本轮不做、也不假称做了。
U1（应用首屏本身没有单一动作）同样仍未做——本轮只让**引导的第 1 页**有了动作。

## G.24 多开对话框：一个 Esc 关掉整叠、`aria-labelledby` 撞 id、以及每次重渲染抢焦点（v2.0.86）

v2.1.2 清单第 8 条只说了一句「`Modal` 加栈；`useId()` 替换写死的 `modal-title`」。
动手前先按那条清单写了三条**会失败的测试**，结果三条全红——而且第三条清单里没写。

| # | 缺陷 | 现象 | 修法 |
|---|---|---|---|
| 1 | 每个打开的对话框都往 `window` 上挂自己的 keydown | **一次 Esc 关掉整叠对话框**（帮助叠在设置上、选择器叠在卷帘上）；两个 `Tab` 陷阱还会互相抢焦点，把用户拽出他正在用的那一层 | 模块级**栈**（进入时 push、卸载时按标识删除），只有栈顶响应 Esc 与 Tab |
| 2 | `aria-labelledby="modal-title"` 是字面量 | 两个对话框 → 两个同 id 的 `h3`，屏幕阅读器念的可能是**下面那层**的标题；另外每个对话框都自称 `aria-modal="true"`，等于告诉辅助技术「忽略我以外的一切」——包括压在它上面的那个 | `useId()` 生成每个实例自己的标题 id；`aria-modal` 只由栈顶声明（用 `useSyncExternalStore` 订阅栈的变化） |
| 3 | 焦点 effect 的依赖里有 `onClose` | 调用方几乎都传内联闭包 → **每次宿主重渲染都会重跑该 effect**，50ms 后把焦点抢回第一个可聚焦元素：点了第二个按钮、或在输入框里打字，任何状态变化都会把你拽回去 | 回调与开关读 ref（`useAudioEngineInstance` 同款手法：回调走 ref、effect 只依赖开合），effect 只依赖 `isOpen`，一次打开只跑一次 |

### 测试（`modalStack.test.tsx`，5 条）

- 两个对话框打开时，Esc **只**调用栈顶的 `onClose`；
- 两个对话框各有**不同的** `aria-labelledby`，且每个 id 真的指向**它自己**的标题；`aria-modal` 只有栈顶是 `true`；
- 宿主重渲染后焦点**留在用户放的地方**（先落在第一个可聚焦元素 → 用户移到第二个 → 重渲染 + 推进 50ms → 仍在第二个）；
- 关闭时焦点**回到打开前**的元素；
- 单个对话框仍然能被 Esc 与点遮罩关闭（回归）。

全量单测 **179 文件 / 2062 用例**。三条缺陷的测试在修之前都是红的，第三条（抢焦点）是写测试时才发现的。

**教训**：清单上一句话的三项改动里，往往藏着一项没人写的缺陷。这三条测试是我按清单写出来的，
不是为了验证某个已知修法——**先写会失败的测试，才知道清单有没有把问题说全**。

## G.25 实操教学现在真的指向那个控件（v2.0.87）

U2 的另一半是「点一个格子」：`InteractiveTutorialCoach` 一直只能**切换视图**（每步带 `targetTab`），
但**没有任何东西指向文字所说的按钮或格子**——写着「点一个格子里放底鼓」，格子在哪儿得自己找。
这一轮把它补上。

### 做了什么

- **步骤数据新增 `anchor`**：`{ attribute: "data-testid" | "data-toolbar-id"; value: string }`。
  用**属性对**而不是裸 CSS 选择器，是为了让锚点**可校验**（见下）。鼓组 4 步、钢琴 3 步、调音台 1 步
  已接上（`play`、`step-cell-1-4`、`euclid`、`velocity-lane`、钢琴卷帘开关、和弦进行面板、Arp、调音台推子）。
- **教练测量并圈出目标**：`getBoundingClientRect()` 取位置，`position: fixed` 画环，并用
  `box-shadow: 0 0 0 9999px rgba(...)` 把其余部分压暗——**关键是环上 `pointer-events: none`**，
  所以应用照旧可点，指令是「跟着做」而不只是「读一读」。
- **重测时机**：步骤切换、窗口 resize、以及任意滚动（capture 阶段，能抓到内部滚动容器），
  再加两帧 rAF 兜住布局未落定。**不做常驻轮询**。
- **控件不存在时就明说**：手机布局、面板未打开、控件被重命名——这几种情况下 `anchorRect` 为 null，
  面板显示一条说明（`tut_anchor_missing`）。**圈一片空白比不圈更糟**：用户会去找一个并不存在的控件。

### 测试（`tutorialCoachAnchor.test.tsx`，6 条）

1. 有目标时环的位置**等于目标 rect ± 4px**，且带 `pointer-events-none`；
2. **目标不在时就明说**（无环 + 有说明）；
3. 无锚点的步骤既无环也无说明（钢琴第 2 步）；
4. **切步骤会重新测量**（鼓组第 1 步 → 第 2 步，环从 y=6 移到 y=496）；
5. **锚点不会腐烂**：遍历 `TUTORIAL_COURSES` 的所有 `anchor`，在 `src/` 全量源码里找
   `attribute="value"`（网格格子与通道条是模板字符串，所以按模板字面前缀匹配），少一个就失败；
6. 这条门禁**自己可失败**（拿一个不存在的控件名与两个真实的名字对照）。

第 5 条当场就抓到了我自己：`step-cell-1-4` 在源码里是 `` data-testid={`step-cell-${trackIdx}-${stepIdx}`} ``，
字面量匹配不到——于是门禁学会识别模板字面量，而不是我改数据去迁就门禁。

把源码暂存回改前版本实测：**4/6 失败**。全量单测 **180 文件 / 2068 用例**。

### 仍受冻结约束的部分

教练是**三端共用**的：手机布局上若没有某个锚点控件，它现在会**说明**而不是乱指——这正是本次
「明说」那条要求的用处。手机端自己的首次体验仍由用户重做，我没有改任何被冻结的文件。

## G.26 首屏的单一动作：一条会自己退场的提示（v2.0.88）

U1 剩下的那一半是「首屏是密集编辑器 + **无单一动作指引**」。导游（v2.0.85）解决的是**第一次访问**，
但一个回来的人、或当初把导游关掉的人，看到的仍然是一张格子和一排控件，没有任何东西告诉他先碰哪个。

### 做了什么

- **`useFirstRunPrompt({ isPlaying })`**：返回 `visible / started / dismiss`。只要「播过一次」这个记录
  不存在，就显示；三种情况都会把它**永久退场**并写记录：按它自己的播放键、**从别的路径开始播放**
  （空格、走带、教学——靠 `isPlaying` 观察）、或主动关掉。**关掉也算退场**是刻意的：被关掉又回来的
  提示比没有提示更烦人。
- **`FirstRunPrompt`**：一条细横条（一句说明 + 播放 + ✕），不是面板也不是遮罩。U1 的抱怨是「第一印象
  像控制面板」，用更多家具回答它就是重复同一个错误。
- **`firstRun.ts`**：一个键 `groove_first_play_done`。读失败视为「没有记录」（而不是让提示永久化），
  写失败静默（提示下次再出现，没有别的东西依赖它）。
- **只在 `!isPhone` 渲染**：手机端是你正在重做的部分，我不把这条提示作为约束交给你。这不是「绕过冻结」，
  而是这条新组件本来就该按端取舍。

### 测试（`firstRunPrompt.test.tsx`，8 条）

横条本身（说明足够长、播放/关闭各调一次回调）；四种可见性（新访问显示、**自己的键退场并落盘**、
**从别的路径播放也退场**、关掉也退场、已有记录则初始就隐藏）；记录往返与重置；
**存储读写都抛异常时不崩、也不会把提示永久钉在屏幕上**；以及一条源码级接线断言
（`useFirstRunPrompt({ isPlaying })`、`!isPhone && firstRunPrompt.visible`、`void handleTogglePlay()`）——
把 StudioView 暂存回改前版本，这条断言失败。

全量单测 **181 文件 / 2076 用例（随后又加了 2 条，见下）**。

### 这条提示自己暴露的三个缺陷（都由门禁抓出，不是我自检出来的）

1. **它一度成了 `<main>` 的第三个网格项**（`grid-cols-[352px_1fr]`）：提示占了第二列，`SequencerPanel`
   被挤到下一行。`probe:grid-gutter` 立刻报「16256/16256 采样点透出」。修法：提示与面板包成**同一个**网格项。
2. **它改变了兄弟节点的位置，导致整个网格被重新挂载。** React 按位置匹配子节点：`{visible && <提示/>}`
   放在面板**之前**，提示消失时面板就从 child 0 变成 child 1 → React 卸载旧的、挂载新的。E2E 报的
   `elementHandle.click: Element is not attached to the DOM` 就是这个。修法：组件**始终挂载**、用
   `visible` 属性决定是否 `return null`，位置恒定。
3. **它的按钮文字与走带撞名。** E2E 用 `button:has-text('播放')` 找走带播放键，而提示的按钮也叫「播放」
   且在 DOM 里更靠前——于是矩阵点的是**提示的按钮**，点了两次，第二次点到一个已经退场的元素（同一句
   `not attached` 报错）。两处都改了：提示的动作改叫**「先听一遍 / Listen」**（它本来就是"听一下"，不是走带控制），
   E2E 改为**按测试 id 定位**走带控件（`data-toolbar-id='play'` / `mobile-transport-play`），不再依赖文案。
   另加一条单测钉住「提示的动作文案不得等于走带的 play 文案」，这样同类歧义在单测阶段就会失败，而不是等到 E2E。

### 哪些「待办」其实是薄的（顺手核实，避免为了勾清单而改代码）

本轮原本打算做 G.11 第 6 条「StudioView 继续外提」，动手前先核对了那几项的实际内容（第一版结论写错，
核对后已改正）：`drumKit` / `isDrumsOnly` / `isRecordArmed` 在 StudioView 里确实只是 `useState` + 透传，
引擎同步在 `useAudioEngineLifecycle`（创建时 + 变化时），而**「切曲风时把鼓机换成该曲风的默认套件」这条真实逻辑
在 `useGenreSwitching` 里**（`useEffect` 与 `performSwitch` 各一处，都调 `getDefaultDrumKitForGenre`）——
它拿的是 StudioView 传下来的 `setDrumKit` / `isDrumsOnly`。所以外提的价值不是「补上缺失的行为」，
而是**把这三个状态的归属收到一个 hook 里，让 `useGenreSwitching` 与 UI 读写同一个所有者**，
这是一次结构改善而不是新功能。本轮仍不做，理由不是「没东西可做」，而是**目前只有一个调用方**：
等手机端要自己的走带/鼓机设置时才有真实的第二调用点，那时抽象对不对立刻能被验证；
现在先按一个调用方的形状抽，反而容易抽错（G.21 的教训：审计表/清单是二手材料，动之前回到代码）。

## G.27 冻结列里漏出播放头光束：一个半红半绿的门禁（v2.0.88）

做 G.26 的时候 `npm run verify` 红了，红在 `probe:grid-gutter`：
**16256/16256 个采样点全部透出**。第一版归因是我自己造成的——我把首屏提示直接放进了
`<main>`（`grid-cols-[352px_1fr]`），于是它成了**第三个网格项**：提示占了第二列、`SequencerPanel`
被挤到下一行。修法是把「提示 + 面板」包成同一个网格项（`<div className="min-w-0 flex flex-col">`）。

修完再跑，剩下 **99/14592** 个点透出，而透出的东西是 **`playhead-laser-beam`**。
这里做了一个正确的判断：**先确认它是不是我引入的**。把首屏提示临时关掉、重建、连跑两次探针：
**一次全绿、一次同样 99 点失败** → 与我的改动无关，是既有的间歇性缺陷。

### 根因与修法

光束 `position: absolute; z-index: 15`，是轨道行的**兄弟节点**；冻结列的实心层是
`position: sticky; z-index: 30`，但它**在行内部**，而行没有层叠上下文，于是两者在同一个上下文里比较——
按说 30 > 15 应该赢。实际失败只发生在**播放头落在可见窗口的第一个 step** 时：光束的左缘正好落在冻结列
里几像素（探针量到 x=229，列的范围是 [45,237)）。**行一旦成为自己的层叠上下文（`relative z-20`），
整行（行底色 + 实心层 30 + 表头 40）就作为一个整体画在光束之上**，这件事就不再取决于它内部的层叠细节。

连跑三次探针：**三次全绿**（包括此前必红的那次 `scrollLeft 1418`）。

### 为什么另加一条确定性测试

`probe:grid-gutter` 只有播放头恰好落在那个位置时才看得见这个问题——**大约一半的运行是红的**。
半红半绿的门禁比没有门禁更糟（人会开始忽略它）。所以不变式另外用 `frozenColumnLayering.test.ts`
钉住：光束 `z-index` 必须 **小于** 行的 `z-20`，而行的 `z-20` 又必须小于实心层的 30 与表头的 40，
并且 `TrackRow` 与 `Ruler` 两处都写着那行 class。**这不是替代探针**（探针仍然在门禁里做行为验证），
而是让「有人删掉 `relative z-20`」这件事**立刻、确定地**失败。

### 顺带

- `trackHeaderLayout.test.ts` 的那条守卫原本锚定「行必须是文件里第一个 `className="flex …`」，
  我加上 `relative z-20` 前缀后它就失败了。它的**意图**是「外层行只能有一个 gap 类」，
  于是重写成**位置无关、而且更强**的版本：取出该行的 class 串，数出所有 `gap-*`，必须恰好是
  `gap-[var(--trk-head-gap)]` 一个。
- `.trk-head-solid` 的注释里还写着「`pointer-events: none` 让它不拦截点击」——那条属性在 G.15 就已经
  删掉了（因为它会让 `elementFromPoint` 看不见这一层，也就是让**守卫本身失效**）。注释已改为写明这一点。

## G.28 音序器终于有「本页帮助」（v2.0.89）＋ 把 U 表的状态补齐

U5：**主编辑面是唯一没有帮助入口的界面**。卷帘有（`onOpenHelp("sequencer")`），而工具栏 grep "help" 零命中——
最需要帮助的地方没有帮助。

### 做了什么

- `Toolbar` 新增可选 `onOpenHelp?: (chapterId?: string) => void`，在 **More 菜单**里加了一个「本页帮助」入口
  （`data-toolbar-id="sequencer-help"`，调用 `onOpenHelp("sequencer")`），行为与菜单里其它入口一致：点完关菜单。
- **Tier 3，不占默认密度**：帮助属于「会话边缘」类，而 G.10 好不容易把默认可见控件从 36 降到 16。放在
  More 菜单里意味着密度探针（`probe:toolbar`）看不见它，规则上也不会被判为「Tier 2/3 泄漏」——
  探针只禁止**默认可见**的非 Tier 1 控件。层级表里照样登记了这一行（表是单一事实来源）。
- `SequencerPanel` 把已有的 `onOpenHelp` 透传给工具栏（一行 prop，**没有碰任何手机分支**）。
- 可选 prop：宿主没给 handler 时**不渲染**这个入口——和 console 开关同一约定，能打开的入口才会出现。

### 测试（`toolbarPopover.test.tsx` +3 条）

打开 More 菜单 → 点「本页帮助」→ `onOpenHelp` 收到 `"sequencer"` 且菜单关闭；宿主不给 handler 时
**没有这个入口**；以及一条源码级接线断言（`SequencerPanel` 与 `StudioView` 都把 `onOpenHelp` 传下去）。
层级表的既有守卫（每个 `labelKey` 必须在 locale 里有定义）当场抓到我只加了行、忘了加文案，补上后通过。
全量单测 **182 文件 / 2083 用例**。

### U 表状态补齐（这轮顺手核实，不再让已完成的条目挂着「未修」）

| 行 | 状态 |
|---|---|
| **U1** 首屏无单一动作 | **已完成**（密度 v2.0.76 见 G.10；单一动作 v2.0.88 见 G.26）。顺带修掉此行里我上一轮重复粘贴的一句「密度部分已修」 |
| **U2** 引导只有最后一页有动作 | **已完成**（v2.0.85 / v2.0.87，见 G.23 / G.25） |
| **U3** 误触遮罩永久结束引导 | **已完成（v2.0.85）**，见 G.23 |
| **U4** 教练没有 DOM 定位 | **已完成（v2.0.87）**，见 G.25 |
| **U5** 音序器没有帮助入口 | **已完成（v2.0.89）**，见本文 |
| **U6** iOS 静音无声 | **已完成**（`play()` await + catch + `isAudioBlocked()` 决定是否声称在播放） |
| **U7** 静默 no-op | **已完成（v2.0.84）**，见 G.22 |
| **U11** 模态没有栈 | **已完成（v2.0.86）**，见 G.24 |
| **U8** 自动保存但没有「已保存」指示 | **已完成（v2.0.90）**，见 G.29 |
| **U9** 中文术语一名多译 | **仍未做**：同一概念 4–5 个名字（工作室/星系/音长）。这项工作**需要用户拍板用词**，不是我能替他选的 |
| **U10** 卷帘是无障碍空洞 | **主体已完成（v2.0.93）**：可聚焦表面（`role="application"` + 键盘说明 + `role="status"` live region），键盘光标 + Enter/Delete/`+`/`-`/`[`/`]` 完成建、删、力度、音长，移动与编辑全部播报；音符改为 `aria-hidden`（无行可放 `gridcell`，原来的 `role="grid"` 是无效 ARIA）。方向键在**有选区时仍归选区**（原有 window 级行为一行未改）。仍未做：力度条本身不可聚焦、卷帘键盘（点击试听）仍是指针；力度/音长改由键盘在光标或选区上调整。见 G.32 |
| **U12** 对比度与字号 | **已完成（v2.0.91）**：对比度做成一条会失败的扫描检查（66 个硬编码文字色、18 处不达标，改完；白名单只有 1 条且写明理由）；工具栏最小字号 10px 加了回归检查（计划里的「44 处 ≤10px」在工具栏重做时就已过时）；`Ruler` 的 7.5px 是 28px 格宽的必要条件，修的是颜色。唯一没动的：手机 viewport 的 `user-scalable=no` 是**有意写下**的（iOS 放大镜），属冻结的手机端，见 G.30 |

## G.29 自动保存终于可见：保存中／已保存／保存失败（v2.0.90）

U8：项目**每次改动后 500 ms** 就被写进 localStorage，而工作台**从不告诉用户**；反倒是「曲风制作器」一直有
一个 `● 未保存修改` 徽标。于是用户分不清「已保存」和「只活在内存里」，也分不清「存储写满、一直在拒绝写」——
而后者的旧代码**只 `console.warn`**。

### 做了什么

- **状态由写盘的那个模块拥有**：`projectStorage.ts` 新增 `SaveStatus`（`idle` / `saving` / `saved` / `failed`）
  与 `subscribeSaveStatus` / `getSaveStatusSnapshot`。理由很简单：只有真正执行写入的模块知道有没有写成，
  另建一套记账迟早会和事实不一致。`saving` 的含义是「改动还在 debounce 里排队」，不是「字节在飞」——
  文案按这个事实写，不假装是进度条。
- **`failed` 是刻意加的**：localStorage 满或被禁用会抛异常，旧代码只打日志。没有这个状态，指示器会在
  用户的作品**并不安全**时永远显示「保存中…」。
- **`useAutosaveStatus`** 用 `useSyncExternalStore` 订阅（不是 `useState` + effect）：状态在 React 之外变化
  （debounce 在用户看屏幕时到点），快照对象**只在变化时换新**——`useSyncExternalStore` 按身份比较，
  每次返回新对象会无限重渲染。
- **`SaveIndicator`**：`role="status"` + `aria-live="polite"`（这份安心对读屏用户同样要有），三态文案 + 图标，
  悬浮提示写清楚**存在哪**——「已保存到本浏览器（HH:MM）」以及「仅保存在本浏览器——要留副本请导出」。
  对勾不能暗示云备份，因为并没有云。
- **只在桌面/平板显示**，并且**无条件挂载**、由 `visible` 属性决定是否 `return null`。

### 一个我这次自己先想到的坑（上一轮是 E2E 教的）

上一轮首屏提示教过一次：**在面板前面放条件兄弟节点会让整个网格重新挂载**。这次写指示器时我一开始又把
`{!isPhone && (<div>…</div>)}` 放在面板前面——`isPhone` 会随窗口尺寸变化，所以那不是理论问题。改成
**无条件挂载**、布局（`flex justify-end mb-1`）挪进组件内部，隐藏时零占位、位置恒定。这一条也写进了接线断言。

### 测试（`autosaveStatus.test.tsx`，7 条）

`saving → saved` 且记下写入时间；**`flushPendingProject` 也标成 saved**（页面隐藏时不能停在「保存中」）；
**写失败标成 `failed`**（模拟 `setItem` 抛异常）；订阅会在 React 之外的状态变化时重渲染；
组件在 `idle`/`visible=false` 时**什么都不渲染**；三态各带各自的 `data-save-status`、`role`/`aria-live`
与不同文案；以及一条接线断言（`useAutosaveStatus()`、无条件挂载、**不得**再出现条件兄弟节点）。
把三处 `setSaveStatus` 调用删掉实测 **4/7 失败**。全量单测 **183 文件 / 2090 用例**。

## G.30 U12 对比度：把「读不清」变成一条会失败的检查（v2.0.91）

U12 原话有两个症状：`ChallengeView` 的提示文字 ≈2.3:1、`Ruler` 的刻度 ≈1.96:1 @7.5px，以及
「工具栏 44 处 ≤10px 字号」。两个比例都没引错，但**照着一行一行改是修不完的**：这两处改完，下一次随手写
`text-[#4a4e58]` 又回到原样。所以这一轮先量、再修、最后**留下一条会失败的检查**。

### 量出来的事实（与计划不一致的两处）

- 扫出 `src/` 里 **66 个互不相同的硬编码文字颜色**。按 `--panel #121317` 逐个算 WCAG 对比度：
  **10 个低于 3:1**、再 **8 个低于 4.5:1** 的正文线。计划点名的两处只是其中两个。
- **工具栏的「44 处 ≤10px」已经过时**：`Toolbar.tsx` 现在最小字号是 **10px**（45 处 10px、13 处 11px，
  低于 10px 的 **0 处**）——工具栏重做时已经抬上来了，只是计划表没跟着改。这里按实测更正。
- `Ruler.tsx` 那行 **7.5px 是工作条件，不是疏忽**：刻度子标签是 `BAR 12`／`.3`，格子 `min-w-[28px]`，
  7.5px 的 JetBrains Mono 六字符 ≈27px 刚好放得下；抬到 9px 就是 ≈32px，会溢出格宽。
  那一处真正的问题是**颜色**（1.96:1），所以改色、不改号。

### 改了什么

- **52 处、11 个文件**从各自的低对比硬编码灰换成早就存在的 `text-dim` 语义色；另把四处彩色胶囊改到过线：
  `ChannelStrip`/`TrackInspector` 的 `#ff5964/25 → /15`、`HelpCenterModal` 的 `#ec4899/20 → /10`、
  `MusicalTypingModal` 与 `PianoRollLane` 的黑键标签提到 `#b9bdc9`。
- **`readabilityAudit.test.ts`**（新增，5 条）：扫**全部** `text-[#hex]`，按它自己那条 class 串里声明的
  背景算对比度，低于 4.5:1 就报出**引入它的那一行**。这不是截图比对，是一次读源码的静态检查——毫秒级、
  能一次看全、报的是行号和比值。

### 扫描器必须懂的三件事（都是先写错再修对的）

1. **看的是 class 串，不是那一行**。`className` 的模板串会跨行，三元把 `bg-accent` 放一行、
   `text-[#0a0b0d]` 放下一行；按行扫会把「强调色上的镂空深字」报成「面板上的深字」。
2. **变体前缀是一对**。`group-hover:bg-accent` + `group-hover:text-[#0a0b0d]` 是**正确**的镂空：
   深字只在强调色铺上的那一刻出现。带变体的字色只对**同变体**的背景负责；同变体没有背景时才退回全部背景
   （「状态变了、背景没变」几乎总是错）。这一条消掉了一批假失败。
3. **半透明底是「叠在上面」**。`bg-[#ec4899]/20` 要按 20% 合成到面板上算，`bg-white/[0.06]` 同理，
   而且 Tailwind 的透明度有三种写法（`/20`、`/[0.06]`、`/[6%]`）。少了这一条，时间线上那个
   「6% 白胶囊里的灰字」会被误报——它真实是 5.23:1，一直合格。

**扫描器唯一看不见的是祖先背景**，这类只能进白名单并**写明理由**（同 `check_doc_refs.mjs` 的 PROPOSED 风格）。
当前白名单**只有 1 条**：`PianoRollLane` 白键上的音名，它的浅底由父按钮三元的另一支声明。白名单是一条
可审阅的声明，比「猜背景的聪明启发式」安全——后者是检查悄悄停止检查的方式（G.15）。

### 字号这一半

- 工具栏最小 10px **加了回归检查**（`Toolbar.tsx` + `toolbarTiers.ts`）：它防的正是计划点名的那个症状，
  而 `measure_toolbar_density.mjs` 数的是**控件**不是像素，这一半它看不见。
- 其余 ≤10px 是 DAW 式微型标注（刻度 `BAR n`、步进格的力度数字）。WCAG 没有绝对最小字号，要求是
  **对比度**与**可缩放**，前者已由上面的扫描器覆盖。
- **可缩放这一半没动，这是个要拍板的取舍**：`index.html` 的 viewport 写着 `maximum-scale=1.0,
  user-scalable=no`，它挡的是手机上双指缩放（桌面浏览器缩放不受这条影响）。这是**有意写下的决定**，
  理由就在 HTML 注释里：手机上双指缩放会同时唤起 iOS 放大镜，叠在密集的步进格上，每次稍慢的点击都会
  弹出放大镜挡住正在瞄的格子。要照顾低视力用户就得放弃这个保护，**而这属于手机端体验**——用户已明确
  手机端 UI 由他自己重新设计，所以这里不改、只记录：U12 的主体两项已完成，剩下的是产品选择，不是漏做。

### 测试

`readabilityAudit.test.ts` 5 条：调色板语义色在两种深底上都过 AA；全量扫描 0 处不合格；工具栏无 <10px；
扫描器自身 2 条自检（已知色对 + 上面全部扫描语义：声明背景、透明度三种写法、渐变取最差一站、变体配对、
半透明胶囊、字号检测器）。把 `#4a4e58` 写进 `src/` 的一个文件实测**失败并报出 `文件:行号  2.23:1`**
（这个数字正好和计划里 ChallengeView 的 ≈2.3:1 对上）。全量单测 **184 文件 / 2095 用例**（比 v2.0.90 多 1 文件 5 用例，
就是这份扫描器），`npm run verify` 全绿，PC E2E 3/3（Chromium／Firefox／WebKit）。

## G.31 M4 延迟重建不再砍断尾音：交叉淡化，且不用定时器（v2.0.92）

M4 原话是"乒乓开关会重建整条延迟图并切断尾音（`if (pingChanged) this._build()`）"，并给了两个方向：
**交叉淡化**或**原地改路由**。这一轮选了交叉淡化，理由在下面第三节。

### 为什么原地改路由被否掉

两种拓扑的差别看起来只在于"反馈回哪一路"：居中是一条（立体声）延迟线自环，乒乓是两条单声道线互喂。
如果把居中改成"两条单声道线各自自环"，那条延迟线的**内容和尾音可以完整保留**，切换只需要改两条连线——
理论上比交叉淡化更干净。但它要求输入先**拆成两路**：`ChannelSplitter` 的第 1 路在没有第二声道的**单声道**
输入上输出的是**静音**，于是居中的湿声会整条跑到左声道。发送端现在是声像之后（v2.0.81 的修复），通常是
立体声，但"通常"不是契约：这条巴士的原注释明确写着它要能吃单声道发送。为了保住这一点，居中这一侧就得再加
一个升混合并器，节点从 3 个变 5 个，而且把一个原本"单节点、天然保留立体声"的拓扑换成了"拆开再拼回去"。
交叉淡化则完全不动两种拓扑的内部结构，居中仍是那一条延迟线。**少改结构、保留单声道安全，比省几个节点重要。**

### 交叉淡化怎么做

- **每个 build 有自己的输出增益**（`gen`）。这是能交叉淡化的前提：旧 build 的 `gen` 从当前值线性淡到 0，
  新 build 的 `gen` 从 0 淡到 1，两者都汇总进那个常驻的 `_wetSum`。旧 build 的节点**一个都不断线**，
  它只是不再接收新的发送（`_pre` 到它的边被摘掉），但**已经录进它延迟线里的东西继续在响**——这正是"尾音没被砍"。
- **淡出窗跟着延迟时间走，0.25–0.5 s**（`delayCrossfadeSeconds`，纯函数、有测试）。固定窗是不够的：
  新 build 的延迟线一开始是空的，它的第一声回声要等一个延迟时间才到，这段空档得由正在淡出的旧尾音来盖。
  250 ms 只盖得住 120 BPM 的 1/8（250 ms）；60 BPM 的 1/4（1 s）就会露一个洞。所以窗长取
  `clamp(延迟时间, 0.25, 0.5)`：下限 250 ms 保证无咔哒（本文件其余的斜坡是 12–20 ms）；上限 500 ms
  是因为再长"切换"就不像切换了（一秒后旧的空间感还满着），而且更长的延迟回声更稀疏，在两个回声之间结束
  本来就听不出来。
- **两个回声流是时间对齐的**，所以重叠不会打架：两种拓扑拿到的延迟时间、阻尼、反馈都相同，新线只是从切换
  那一刻开始录。听到的是"旧尾音淡出 + 新回声淡入"的自然交叠，而不是两个不同步的回声。

### 拆除用音频时钟，不用定时器

`_sweepRetired(now)` 在 `setParams`/重建/`dispose` 时检查 `ctx.currentTime` 是否已过淡出终点，过了就断开。
**不能**用 `setTimeout`：这个文件的契约是"`OfflineAudioContext` 建出完全相同的图"，而定时器会让图依赖真实时钟。
副作用是一次切换后如果再不调 `setParams`，那个已经静音的 build 会挂到下一次参数变更；实际上切曲风和改速度
都会调 `setParams`，所以就是下一次用户操作。这点写在字段注释里，没有藏。

### 没有变化的地方（这才是敢改的前提）

- 不切乒乓时 `_build()` 根本不会被调用，正常参数变更路径零开销。
- 只多做了一次 `×1.0` 的增益：居中路径从 `delay → wetSum` 变成 `delay → gen(1.0) → wetSum`。
  IEEE754 下乘以 1.0 是精确的，所以离线渲染与基线**逐位相同**——时间/响度基线不受影响。
- `input`/`output` 仍是那两个常驻节点（原有"端点在多次 setParams 后不变"的测试照旧通过）。

### 测试（`delayBus.test.ts` 新增 6 条，共 29 条）

旧 build 的节点在切换瞬间**没有被 disconnect**（用假上下文的 `disconnectCalls` 计数，这正是它存在的理由）；
旧 `gen` 记下了 `setValueAtTime(当前值)` + `linearRampToValueAtTime(0, 窗口)`；新 `gen` 记下 `0 → 1`；
淡出中途不拆、过了淡出点再调参数才拆、再扫一次不会重复断开；一个窗口内连切两次两条 build 都各自有淡出斜坡
且都以第二次切换为起点；`dispose` 会把还在淡出的 build 一并拆掉（防泄漏）；窗长的上下限与非有限输入；
两次相同切换序列产生完全一致的事件日志。

**把旧行为注入回去**（`_build` 里恢复"立刻 disconnect 旧 build"）实测 **6 条里 4 条失败**——它们确实钉住了
这个缺陷，不是事后描述代码。全量单测 **184 文件 / 2101 用例**，`npm run verify` 全绿，PC E2E 3/3。

## G.32 U10 卷帘不再是键盘空洞：一个光标，而不是两百个 Tab 停靠点（v2.0.93）

### 先把原表更正

U10 那行说"音符是无 role 的 div、无 `tabIndex`（全文 0 处），力度条只能指针操作"。动手前先核对：

- 网格容器**早就有** `role="grid"` 和 `aria-label`。问题是这个 role **无效**：ARIA 要求
  `grid > row > gridcell`，而卷帘的音符是绝对定位的 div，**根本没有"行"元素**可承载 `gridcell`。
  它承诺了一个不存在的结构。
- 卷帘**早就有**一整套 window 级键盘：方向键移动**选中的音**、Delete 删选区、`p`/`b`/`1`–`5` 切工具、
  ⌘A 全选、⌘N/⌘S。所以"旋律编辑只能鼠标"是不准确的。
- 真正缺的是两件：**一个能落焦的点**（键盘用户没有任何入口走到网格上），和**读屏反馈**（编辑静默发生，
  音量、位置、增删都不报）。

### 为什么是"一个光标"而不是"每个音符一个 Tab 停靠点"

把每个音符变成可聚焦元素，最"正确"的做法是把它做成 `gridcell` 并给 128 行加 `role="row"`。但那等于把
布局层重构成表格结构：卷帘的分层渲染（底纹、小节列、和声、幽灵音符、音符层）全在同一个相对定位容器里，
而指针命中测试（`cellFromPoint`）和 `probe:grid-gutter` 的 `elementFromPoint` 采样都依赖现在的结构。
为一处语义正确去搬动整个命中测试面，风险远大于收益。

所以按 canvas 类控件的标准做法处理：**一个可聚焦表面 + 内部一个光标**。光标就是指针本来就有的那个东西
（行高亮条 `hoverCell` 一直跟着指针走），按键作用于光标下的音符。读屏听到的是 live region 的描述，
而不是两百个无名 div。

### 谁拥有哪个键（这一版没有推翻旧行为）

旧的方向键语义（**有选区时移动选区**）很值钱，一行没改。分工是：

- **有选区**：方向键、Delete 归原来的 window 处理器（移动/删除选区），我只在成功后**补一句播报**
  （"已移动到 C4 · 第 3 步"、"已删除 2 个音"）。
- **没有选区**：方向键移动光标，网格跟着滚动（`scrollToRevealCursor`，带一格余量，且视口未测量时
  原样返回，避免"滚到不存在的地方"）；Home/End 跳首尾步；Shift 跨小节/八度。
- **两种情况下都属于网格**：Enter/空格 在光标处建音或删音（与铅笔工具同一条 `commitDraft` 路径，
  所以撤销、试听、选中行为完全一致）、`+`/`-` 调力度（用力度条自己的 `scaleNotesVelocity`，钳位只有一处）、
  `[`/`]` 调音长（用 `resizeNote`，钳位在模型里）。播报的数字是**从提交后的模式里读回来的**，
  不是自己再算一遍——两边各算一次迟早会说谎。
- **一律不碰**：所有 ⌘/Ctrl 组合（⌘←、Ctrl+Delete 属于平台）、Tab、以及一切不认识的键。
  只有真正处理了的键才 `preventDefault` + `stopPropagation`，所以"有选区时的方向键"能照常落到
  window 处理器上。

### 结构上的改动

- `role="grid"` → `role="application"`（诚实：这是一个键盘驱动的编辑器，不是表格），`tabIndex={0}`
  （不可编辑的轨道是 `-1`），`aria-describedby` 指向一段 `sr-only` 的键盘说明（中英各一份），
  加一个 `role="status" aria-live="polite"` 的播报区。live region 只有"文本变化"才会重播，而重复播报
  在这套交互里很正常（力度顶到上限、方向键顶到裁剪边界），所以消息末尾交替一个零宽字符——对读屏是同一句话，
  对 DOM 是不同文本。
- **音符加 `aria-hidden="true"`**：它们是这个控件的视觉层，暴露出去就是两百个无名 div。
- **光标可见**：行高亮条现在同时服务指针和键盘（`data-cursor-source` 区分），失焦即消失。

### 测试（`rollKeyboard.test.ts` 10 条 + `pianoRollLane.test.tsx` 新增 12 条）

纯模型：步/半音移动与钳位、Shift 跨小节/八度、Home/End、编辑键映射、平台键一律返回 `null`、
在视口内不动 / 向右只滚到"带一格余量"且**再算一次结果不变** / 向左上回滚不为负 / 未测量视口不动。

组件：`role`/`tabIndex`/`aria-describedby` 能解析到说明、`queryByRole("grid")` 为空、音符 `aria-hidden`；
聚焦后光标落在第一个音上并播报音名/步号/力度；方向键移动并钳位；Enter 建音→再按删除（经同一条
`COMMIT_PATTERN`）并各有一句播报；Delete 删音、空步播报"没有音符"；`+`/Shift+`+` 力度 101/111；
力度下限 1；`[`/`]` 音长 0.8→1.8→（Shift 回退）0.1→上限 16；**有选区时方向键移动选区而光标不动**；
⌘+方向键不改光标、失焦后光标消失；视野带动滚动。

**故障注入**（播报改成空实现 + 取消"有选区就让路"）：**10 条里 8 条失败**——这两个行为确实被钉住了。
全量单测 **185 文件 / 2123 用例**，`npm run verify` 全绿，PC E2E 3/3。

## G.33 动手前先核对 M 表：四行早已修好，M11 是真的（v2.0.94）

这一轮本来打算从 M 表里挑活干，第一件事是**逐行核对**——结果 14 行里有 4 行写的缺陷**早就不存在了**，
而它们的行号也全都过期了（文件在这些条目写完之后改过很多次）：

| 行 | 计划说 | 实际 |
|---|---|---|
| M2 | 母带 DRIVE 硬削波，曲线定义域固定 ±1 | **已修（Q13）**：`SATURATION_INPUT_CEILING = 2`，超界处饱和不平顶；曲线也从 `tanh(kx)/tanh(k)` 改成 `tanh(kx)/k`，小信号增益恰为 1（旧写法在 drive 1.5 时白送 +3.9 dB、drive 6 时 +15.6 dB） |
| M6 | 母带推子阶跃写入，切听力保护会咔哒 | **已修（Q11）**：`setMasterVolume` 先钉住当前值再 15 ms `setTargetAtTime` |
| M7 | 延迟反馈/阻尼每次 `setParams` 阶跃 | **已修（Q11）**：两者都先钉住再 12 ms 平滑 |
| M10 | 实时 ratchet 没做 1..8 夹取 | **已修（Q10）**：实时路径直接用共享的 `resolveRatchet`，`exporterParity.test.ts` 钉住 0→1、99→8 等边界 |

顺手做掉一处**漂移隐患**：实时路径里那份复制粘贴的副拍力度渐变（`0.85 + (r/ratchet)*0.15`）换成了共享的
`ratchetVelocityScale`。公式本来就一模一样，改的是"同一件事只留一份"——这正是 Q10 注释里那句
「one shared function is the only way those two stay equal」的意思。它的取值已在 `exporterParity` 钉住，
所以这里没有新增测试，只有删掉一份重复。

**M11 是真的，而且比计划写的多丢了一样东西。** 计划说"丢掉了 `latencyCompensationMs`"，实际这个分支
自己用 `nextStepTime` 重建时间，于是把调用方已经折进 `time` 的**两个**活演奏修正都丢了：

1. **延迟补偿** `latencyCompensationMs`（把每个声部对齐到"已经到达听者"的时刻）；
2. **`>= currentTime` 的钳位**（迟排的步不得排到过去）。

于是带独立 swing 的轨道比其它轨道**整整早一个补偿量**，也比它自己的导出早——导出是一次离线渲染，
没有输出延迟可补，所以那边本来就不该有这一项。修法只有一句：**这个分支里只有 swing 项允许不同**，
另外两项照抄调用方的语义：

```ts
const trackStepTime = (step % 2 === 1 && effSwing !== this.swing)
  ? Math.max(ctx.currentTime, this.nextStepTime + (effSwing * 0.5) * stepDur + this.latencyCompensationMs / 1000)
  : time;
```

（`this.ctx` 在回调里会重新变宽成 nullable，所以顺手把守卫后的上下文收进一个局部 `ctx`。）

### 测试（`audioScheduler.test.ts` +2，共 16 条）

两条都用假 AudioContext 直接驱动 `scheduleStep`，从**实际排出的声部起音时间**（`FakeOscillatorNode.startedAt`
/ `FakeBufferSourceNode.started[].when`）读结果，而不是读我们自己算的中间值：

1. 同一音在奇步上，一条轨道无独立 swing、一条 `swing: 40`，补偿 20 ms：前者必须是 `grid + 20 ms`，
   后者必须是 `grid + 0.4·0.5·stepDur + 20 ms`——**两个修正都在**。同时断言两者之差正好是 swing 项，
   且后者**不**等于漏掉补偿的值。
2. 全局 swing 50 %、轨道 `swing: -50`（正好抵消）、补偿 **−8 ms**（提前监听是合法设置）：轨道必须落在
   未摆动的网格上，但仍带 −8 ms。这条同时钉住了"负补偿也是补偿"和"抵消全局 swing 不是缺陷，是功能"。

**故障注入**（把那一行换回 `nextStepTime + swing` 的旧写法）：**两条都失败**，差值正好是 20 ms 与 8 ms
——不是"看起来不对"，是被丢掉的那两个量本身。

### 下一件：M14（已核准仍是真缺陷）

核对时一并看了限幅器：**瞬时起音在有前瞻时是站得住的**（注释也这么写，不是缺陷），但那个
**每样本 O(D) 的滑窗最小值**确实还在（`MasterLimiter.ts:352-356`）：3 ms 前瞻 @48 kHz 即 D≈144，
约 700 万次比较/秒/声道，而且它在渲染线程里。换成**单调队列**可以做到 O(1) 摊还、**输出逐位不变**
（因此不动物理基线，也不用重测响度）——这是下一轮的第一件事。

全量单测 **185 文件 / 2125 用例**，`npm run verify` 全绿，PC E2E 3/3。

## G.34 M14 限幅器的滑窗最小值：单调队列，输出逐位不变（v2.0.95）

M14 那行写了三件事。**两件站不住，一件是真的**：

1. "增益包络是瞬时阶跃" —— 有过前瞻（3 ms）时，瞬时**起音**正是让天花板成为硬墙的做法：增益必须在峰值到达*之前*就降下去，
   提前量由前瞻提供。代码注释也是这么写的。**不是缺陷**，"调制颗粒感"的说法没有依据。
2. "NaN/Inf 无消毒" —— 核对后：NaN 输入算出的 `peak` 停在 0（`m > peak[i]` 对 NaN 恒假），所以 `required = 1`，
   **增益永远是有限值**；Inf 输入 → `ceiling/Infinity = 0` → 增益 0（静音）。加一个"消毒"分支只会掩盖上游的损坏，
   还多一次每样本判断。**没做，是判断，不是漏做**（NaN 样本本身仍会穿过限幅器，和任何音频节点一样）。
3. "滑窗最小值是每样本 O(D) 线性扫描" —— **真的**，而且它在渲染线程里：3 ms 前瞻 @48 kHz 即 D≈144，
   每个样本扫 145 次。

### 改了什么

`gainWindow`（一个 Float32Array 环 + 每样本全扫）换成**单调队列**：存窗口内样本的下标与值，值从前到后递增，
所以**队首就是窗口最小值**，O(1) 读出；每个样本入队一次、出队至多一次，整体 O(1) 摊还。容量只比窗口多一格
（`head === tail` 表示空）。

**逐位不变是刻意的**：入队时值先过 `Math.fround`，这正是旧代码写进 `Float32Array` 时发生的转换，所以"选中的最小值"
与旧扫描完全一致——而最小值正是下游增益包络唯一的输入。旧代码里窗口初值是 1，而 `required = min(1, …) ≤ 1`，
所以省略那些 1 不会改变最小值（这一点也在注释里写了原因，而不是留个"看起来少了个 fill"的疑问）。

### 两份实现都要改（而这正是上一轮的主题）

真正的实时限幅器不是 TS 内核，而是 `public/limiterWorklet.js`——`src/**` 不能进音频线程，所以那份是**逐行镜像**。
只改 TS 内核等于没优化生产路径。两份都改了，且有两道防线：

- **原有的对拍测试**（`limiterTruePeak.test.ts` 早就用 `new Function` 逐字执行 shipped worklet 源码并断言两份实现
  sample-identical）——只改一份就会红。
- **新的源码守卫**：两份文件都必须出现 `dequeHead`，且都不得再有 `for (… < windowSize` 的每样本扫描。
  这条断言是**故意的源码级断言**：golden 测试已经证明两种实现对输出不可区分，所以"扫描被重新引入"在行为上永远
  测不出来，只会在渲染线程里悄悄贵回来。

### 证据

- **7 组 golden 哈希**（响正弦、域外过冲、宽带噪声、瞬态爆发、立体声联动、37 帧非整齐块、天花板以下）在改之前
  从**旧实现**采集，改之后**全部逐位相同**（含最终增益一起入哈希）。用哈希而不是容差，因为这一版的主张就是
  "逐位不变"——容差恰好会放过它要排除的那种一 ULP 漂移。
- **算法工作量实测**（把窗口这一步单独拿出来跑，因为改动只在它）：4,410,000 样本、窗口 145，
  比较次数 **639,450,000 → 8,549,300**（145.0 → **1.939/样本**），该步耗时 **2126 ms → 127 ms**；
  两者的校验和一致。注意这是**窗口步**的数字，不是整条限幅链的加速比——4×12 抽头的真峰卷积没动。
- `npm run verify` 全绿，PC E2E 3/3。全量单测 **185 文件 / 2127 用例**（限幅器 +2）。

## G.35 手机端：先量，再改能改的；把不能改的记下来（v2.0.96）

目标的后半段是"为手机端重新设计独立 UI：按手机特点取舍功能，绝不密密麻麻堆砌按钮，禁止误触放大镜与页面缩放"。
动手前先确认了两件事：**手机端的 E2E 是绿的**（`E2E_PROFILE=mobile` 4/4 通过），而且**它是有设计的**
（底部 5 个 tab 明确写着"五个是 390 px 宽下 44 px 目标 + 11 px 标签的极限"，硬件调音台是**刻意不提供**的，
卷帘在手机上会给出提示并改走 Chords 路由）。所以这不是修 bug，而是一个**产品取舍**——而取舍要先有数字。

### 量出来的东西（`scripts/measure_phone_surface.mjs`）

新工具，在真实构建产物上量 iPhone 14 竖/横两屏：viewport meta、横向溢出、两栏固定 chrome 占比、
**可触摸控件数**（并分成"工作区"与"两条栏"）、**每个控件的盒子与是否 < 44 px**、最小字号、`main` 的节点数。
两个方法上的决定是量准的关键：

- **用 `elementFromPoint` 判断"能不能按到"，不用 `getBoundingClientRect`**：布局出来但被裁掉、被遮住、
  或 `display:none` 的元素都有非零矩形。第一次量就把**首屏引导弹窗**当成了手机界面（22 个控件全是弹窗的），
  截图一看才发现——所以工具现在也**存截图**（`--shots=`），因为"是不是一堵按钮墙"是看一眼的事。
- **网格单元不算工具栏**：`StepCell` 是可聚焦的 `role="gridcell"`，naive 查询会把 16 步 × N 轨数成"控件"，
  并报告整张网格都是过小的按钮。两件事都重要但是两件事：网格一屏放多少步是设计约束
  （390 px ÷ 16 步 = 24 px/目标，画法再变也躲不掉），工具栏放多少按钮才是密度问题。

**竖屏 390×664 的基线（改动前）**：控件 **22** 个（工作区 11 + 两条栏 11），其中 **11 个 < 44 px**——
9 个来自**页眉**（Search 36×28、Random 30×30、语言 30×30、设置 30×30、版本 24×20、菜单 30×30、品牌 126×24…），
另有类型筛选 168×36、骰子 36×36；页面**无横向溢出** ✓；**缩放被 `user-scalable=no` 挡住** ✓（与目标一致）；
两条固定栏占 **17%**（横屏 31%）；最小字号 7.5 px（标尺微标签，U12 已保证其对比度）；
步进格子的**实际单元很大** ✓——之前报的"4×126×14"是**轨道色条被当成 `role=button`**（见下）。

### 改了两处（都在未被冻结的文件里）

1. **页眉在手机上变成标题栏**（`Header.tsx`）：只留品牌 + **一个 44×44 的"全部板块"按钮**，
   打开 App 自己的 sections sheet；原本 9 个桌面控件与**页眉自带的抽屉**全部不再渲染。
   这个删减是有依据的：把页眉抽屉的入口清单与 `MOBILE_SHEET_GROUPS` 逐条比对，**sheet 是超集**
   （chords / kick / maker / challenge / masterclass / 两条时间线 / compare / analyzer / search / settings /
   help / updates 全在里面），语言开关在 Settings 里，引导在帮助中心里，随机曲风在 Explore 自己那里。
2. **类型栏的两个控件**（`GenreRail.tsx`）：筛选框 36 → **44 px 高**，骰子 36×36 → **44×44**。
   它们正是手机用户在这个界面最先要按的两个。

**改动后**：控件 22 → **17**，工作区 11 → **6**，**低于 44 px 的从 11 个降到 2 个**——
剩下的两个是手机传输条的"上一小节/下一小节"（32×44，**冻结文件**里的刻意取舍），在门禁里**具名豁免**而不是放宽规则。

### 新的门禁（`scripts/test_matrix.js`，只在手机目标上跑）

1. **页眉最多 2 个控件**（品牌 + 全部板块）；
2. **步进网格之外、当前在屏的每个控件都 ≥ 44×44**（内容链接与网格单元排除，理由写在注释里）；
3. 顺便把原来"页眉必须有全局设置入口"的断言改成**设备相关**：手机上从页眉的"全部板块"进 sheet 再进设置，
   桌面/平板仍走页眉（那条"设置夹在语言与版本之间"的顺序断言只对桌面成立）。

三条都在 iPhone 14 竖/横两屏上跑通（`E2E_PROFILE=mobile` 4/4 全绿）。

### 量到但**没有**改的（都写在这，因为它们在冻结文件里或需要一次布局决定）

- **键盘 FAB 盖住了"You"tab 的中心（竖屏）**：FAB 是 48×48、位于 x=326..374 / y=596..644，
  而"You"tab 的盒子是 x=312..390 / y=612..664——在它的中心做 `elementFromPoint` 返回的是
  `virtual-keyboard-fab`。而"You"tab 正是 App sections sheet 的开启者（`MobileTabBar.tsx`，冻结），
  于是竖屏下**只剩左右两条约 15 px 的缝**能按到它。这就是页眉那个 44 px"全部板块"按钮存在的原因
  ——它不是重复入口，而是**在冻结文件之外给出的可靠入口**。FAB 的位置本身留给重设计。
- **轨道检查器按钮在手机上是 4×20 px**：`track-header-N`（`role="button"`，打开该轨的混音/插入/音色，
  是进这条轨的唯一入口）的父容器 128 px 宽，同排的 `L:16`/`M`/`S` 吃掉了几乎全部宽度，
  `flex-1 min-w-0` 就塌到它自己那个 4 px 色条的宽度。**这是下一轮的第一件事**（`TrackRow.tsx` +
  手机下的轨道头布局，两者都未被冻结）。
- **其它屏/屏外**：页脚的版本按钮 114×16（屏外，滚动才到）；Explore 视图的"收起侧栏" 28×28、
  卡片里的"Detail →/Compare +" 34 px 高。它们都是真实目标，只是不在首页那一屏上。

### 重设计的取舍清单（目标要求的那一半，落成一张表）

- **保留**：传输条与 tab 条（两条栏、安全区、`onPointerUp` 免 300 ms 延迟）、步进网格（单元本来就大）、
  sections sheet 作为**应用级入口的唯一去处**、`user-scalable=no`（禁止双指缩放与 iOS 放大镜）。
- **手机端不提供**（有的已经如此，有的要照着做）：硬件调音台（已在注释里写明理由）、钢琴卷帘
  （已给出提示并改走 Chords）、**页眉当工具栏**（这一版删掉）、以及任何"一屏塞 16 个 24 px 格子"的交互。
- **待做**：把轨道头重新排一次（让检查器入口 ≥44 px），然后是 Explore / 时间线 / analyzer 三个视图的逐屏
  手机体检——每个都用 `measure_phone_surface.mjs` 出基线、按同一套门禁收口。

## G.36 手机端第二轮：轨道头（4×20 px 的检查器入口）与门禁的盲区（v2.0.97）

### 上一轮的门禁有个盲区，先补上

G.35 的门禁把 **整个 `[role="grid"]` 子树**排除在外（因为步进格子是 `role="gridcell"`）。但**轨道头就在同一个
网格容器里**——于是手机轨道头上那五个控件（`track-fold` 14×14、检查器入口 4×20、`L:16` 30×36、Mute 36×36、
Solo 36×36）从来没被量到过。修法是把排除范围缩到 **`role="gridcell"` 本身**；量到的东西立刻印证了这一点：
竖屏控件数从"16"变成 **44**（新增的几乎全是轨道头），低于 44 px 的从 2 变成 **29**。
审计脚本的 `isGridCell` 也一并改正（同样的错误：`[role="grid"]` 一律当成网格）。

### 轨道头为什么只能"取舍"而不是"放大"

量出来的那一行（142 px 的固定列，128 px 可用宽）里塞了五个控件：

| 控件 | 手机上的盒子 | 作用 |
|---|---|---|
| `track-fold-N` | **14×14** | 折叠这条轨的编辑器（工具栏已有"Fold All Tracks"） |
| `track-header-N`（检查器入口） | **4×20** | 打开该轨的混音/插入/音色——**进这条轨的唯一入口** |
| `L:16` | 30×36 | 逐轨 polymeter 长度（循环切换） |
| Mute | 36×36 | 静音 |
| Solo | 36×36 | 独奏 |

检查器入口之所以塌成 4 px：它是 `flex-1 min-w-0`，而同排的 `L:16`/M/S 把 128 px 吃光了。**128 px 放不下
三个 44 px 目标**（3×44 + 间距 > 128），所以这一行必须减东西。减什么有依据：

- **Solo**：`TrackInspector` 里写着"Always visible: muting or soloing must not require finding the
  right tab"——检查器一直显示 Mute/Solo 一对，所以轨道头的 Solo 是**重复**的（Mute 保留在轨道头，因为
  静音是最高频的操作，值得一次点击）。
- **`track-fold`**：工具栏有"Fold All Tracks" ✓，逐轨折叠不是 390 px 屏幕该做的事。
- **`L:16` 的循环**：手机上改成**只读徽标**（`track-length-badge-N`，仍显示自定义长度），改长度留给桌面布局
  ——逐轨 polymeter 在手机上不是一个能做好用的操作。
- **检查器入口**：`min-h-11 min-w-11`，并且终于有了宽度——**手机轨道头现在能看见轨名了**（之前被挤成 0 宽）。

顺带修掉 Ruler 的"复制 B1"按钮（58×30 → 手机上 `min-h-11`）。**结果（都用改正后的分类器测）：竖屏低于 44 px
的从 29 降到 3，横屏剩 1**，剩下的全都在**冻结文件**里（传输条的上一/下一小节 32×44、工具栏"Fold All Tracks"
126×22），在门禁里**具名豁免**、理由写在注释里，并在下面记着。

### 一个值得记下的教训

第一版把新布局挂在 `isCompact` 上，构建、测量之后**数字一点没变**——因为 `isCompact` 是**逐轨"紧凑行"
密度开关**（`SequencerPanel` 传的是 `compactTracks[trackIdx]`），不是"这是不是手机"。改成从
`useDeviceCapabilities()` 读 `isMobile` 才对。**没有重新测一遍，就会以为改好了。**

### 仍未做（都在冻结文件里，留给重设计）

- 工具栏"Fold All Tracks" 126×22（`SequencerPanel.tsx` 的手机分支被冻结）。
- 传输条"上一/下一小节" 32×44（`MobileTransportBar.tsx`）。
- 步进格子 36×40：390 px ÷ 11 步 ≈ 36 px，**再怎么做也到不了 44**——这正是目标里"按手机特点取舍"的那类
  东西：要么接受（格子是网格，不是按钮），要么换成每屏更少步、可翻页的交互（属于重设计）。

### 测试与门禁

- `E2E_PROFILE=mobile` 4/4（iPhone 竖/横 + iPad 竖/横）：页眉 ≤2 控件、网格之外在屏控件 ≥44×44 ✓。
- `TrackRow` 的桌面/平板路径一行未改（`isCompact` 的既有语义保持），`workspaceGroupingAndClipManagement`
  等既有测试全绿。
- 手机端审计：控件 27（工作区 16 + 两条栏 11），低于 44 px 的 **3**，全部具名豁免。
