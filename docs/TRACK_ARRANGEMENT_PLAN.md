# 分轨编排（Logic 的 Tracks 区）—— 计划

这份文档回答一个问题：**什么时候 Groove 会有一张真正按轨排的编排界面**，以及要走到那里需要动哪些地方。

结论先写：**现在没有，而且它需要改数据模型，不只是加一张视图。** 下面把已有的东西、缺的东西、第一刀切在哪里，都写清楚。

## 一、现在有什么

`docs/ARRANGEMENT_PLAN.md` 的 B3 已经落地，可以放心依赖：

- **一条时间轴上的段落区块**：顶部小节标尺，A/B 片段作为区块排在轴上，拖动移动、拖底部横带重复、PC 键盘微调、iPad 触摸。实现分两层：算术在 `src/features/arrangement/songEdit.ts`（区块位置、落点、键盘模型、id 生成），DOM 在 `src/components/arrangement/ArrangementPanel.tsx`（区块、标尺、指针捕获、≥44px 目标）。
- **段落级的覆盖**：`SongSection` 带 `mute: string[]`（逐段静音某些轨）、`velocityScale`（整段力度）、`label`，以及 `overrides`（B5 的渐强 `velocityRamp` 与 `fill`）。
- **渲染/导出跟随时间轴**：`patternForExport` 把 `Song` 拍平成一条 pattern，WAV、MP3、MIDI、分轨都走它；因此**导出长度等于歌曲小节数**这一点在 MIDI 上已经成立。
- **门禁**：`src/test/arrangementForm.test.ts`（24 例）、`src/test/arrangementPanel.test.tsx`（14 例）、`src/test/songEdit.test.ts`（15 例）、`probe:arrangement`（驱动构建产物量区块位置与触控目标）。

## 二、缺的是什么

**每一条轨各有自己的片段与排布**。今天 `Song` 是：

```
Song { clips: { A, B }, sections: [{ slot, bars, mute?, velocityScale?, overrides? }] }
```

一个段落指向**一个槽位**，对八条轨同时生效。所以能做到的是"这一段用 A、那一段用 B"，做不到的是"这一段鼓用 A、贝斯用 B"。Logic 的 Tracks 区正是后者：**每条轨一行、各自摆自己的片段**。

这一条缺口也是 B4 里那个具体项的原因：`AbletonExporter` 现在整首写**一个 clip**（`src/audio/AbletonExporter.ts` 里没有任何 `sections` 处理），而计划要求"每个段落一个 clip"。

## 三、要动的地方（按依赖顺序）

1. **模型**（`src/types/song.ts`）：让片段按轨寻址。两种形态，必须二选一：
   - **A. 轨道行**：`lanes: Record<MixTrackId, Array<{ slot, bars }>>`，每轨自己的时间轴。最贴近 Logic，也最贵：段落的对齐、总长度、迁移都要重新定义。
   - **B. 段落 × 轨的槽位**：`SongSection.slots: Partial<Record<MixTrackId, ClipSlot>>`，缺省回落到段落自己的 `slot`。**推荐先做 B**：它与现有语义同构（段落仍是时间单位），已有文件迁移是"什么都不写"，而且第一刀不需要新的时间轴概念。
2. **归一化与拍平**（`src/data/songFlatten.ts`）：`resolveTimeline` / `patternForExport` 现在按段落取一个片段；改成按轨取，缺省回落。**这是唯一会改变渲染的地方。**
3. **视图**（`src/features/arrangement/songEdit.ts` + `ArrangementPanel.tsx`）：在现有标尺下加**轨头 + 每轨一行**，每行的区块来自第 1 步；拖动/复制/删除对单行生效；键盘模型复用现有 `songEdit` 的落点算术。轨头要能静音/独奏（复用引擎既有的 mute/solo，而不是再加一套状态）。
4. **导出**：MIDI/ALS/WAV 都经第 2 步，所以它们自动跟随；ALS 顺带把"每段一个 clip"补上（B4 剩余项），因为它本来就是按段落切片的格式。
5. **分享与持久化**：`sections` 已经在 `.groove` 与分享链接里（B1），新字段走同一条路；旧文件读出来就是"没有分轨覆盖"，行为不变。
6. **手机**：`src/platform/surfaceCapabilities.ts` 里明确分轨视图属于桌面/iPad 能力，手机继续用现有单轴视图——这是声明过契约的做法，不是遗漏。

## 四、必须守住的约束

- **循环渲染不能变**。159 条 trim 与音色指纹都建立在"单曲风 pattern 的渲染"上；分轨编排只影响**歌曲**渲染。第一刀之后要能证明：同一首歌在没有任何分轨覆盖时，渲染结果与今天**逐字节相同**（这条要写成测试，而不是靠相信）。
- **八轨上限不变**。库里的曲目是固定八条轨，"分轨"是这八条，不是可以新增轨道。
- **A3 的教训**：任何**时变**效果都会写进"连续音符是否不同"的测量里（见 `GROOVE_QUALITY_PLAN.md` 里立体声扩散那一节）。分轨编排是结构变化，不该碰这条；如果第一刀让 `check:groove` 的任一预算上升，就是设计出了问题，而不是预算该放宽。

## 五、第一刀（建议的范围）

**只做模型 B + 拍平 + 视图中最小的一步**：

- `SongSection.slots`（按轨槽位，缺省回落）+ 迁移测试（旧文件读出来行为不变）；
- `patternForExport` 按轨取片段 + 一条"没有覆盖时逐字节相同"的测试；
- 视图里给每轨加**一行**，可以从下拉里为**当前段落**选择该轨的槽位（先不做拖拽与复制）；
- 导出跟随；ALS 的每段一个 clip 作为独立小步，不塞进第一刀。

这样第一刀交付的是"**能把某一轨在某一段换成另一个片段，并且听得出来、导得出来**"，而界面离 Logic 的样子还差拖拽、复制与缩放——那些在第二刀，等第一刀的数据形状被证明够用之后再写。

## 六、不做的事（明确写出）

- 不做音频/MIDI 片段的**内容编辑**（那是步进音序器与钢琴卷的事，编排只排列它们）。
- 不做**自动化曲线**（音量/声像随时间画线）：它是另一套模型与另一套门禁。
- 不做"任意长度片段"：槽位仍是整小节循环，"跨段落淡出"这类由段落覆盖表达。
- 不因为这条工作线而放宽任何现有预算。
