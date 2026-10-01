# 试听与比对：MCP 与 WEB 两侧的实测（2026-10-01）

**缘起** ✓：一份意见说 `maxDurationSec` 能正确挡住 529.1 秒的超长渲染 ✓，**建议再加一个 `render_preview_audio` 出低采样率试听版** ✓；**而业主把问题推得更远**：

> **"MCP 和 WEB 有没有方便的、快速的试听？某个范围／某一节／某几节，单轨／多轨？这个在修改过程中很重要，包括**某个修改的前后对比试听**。创作是个反复修改和比对的过程，要考虑创作过程中类似的真实操作体验。"** ✓✓

**⇒ 逐条量，不猜** ✓。

---

## §1 结论先行：**那条建议已经实现了** ✗✓✓

**`render_preview_clip`（`mcp/registry.ts:2270`）就是它** ✓，**而且比建议更全**：

| 参数 | 它自己的说明 |
| --- | --- |
| `songId` | "the song to take a section from" ✓ |
| **`sectionId`** | **"which section, by id"** ✓ |
| `index` | "or by position; default 0" ✓ |
| `genreId` | "instead of a song: preview a bare genre's pattern" ✓ |
| **`bars`** | **"how many bars of the section to render; default 4"** ✓ |
| **`sampleRate`** | **"default **8000**, which is the point of this tool"** ✓✓ |
| `channels` | **"default 1"** ✓ |
| `format` | "default wav" ✓ |

**⇒ 低采样率试听版**已经在** ✓，**默认 8000 Hz 单声道 ✓**，**能指定某一节 ✓ 与小节数 ✓**。**要补的不是这个工具，而是**它的可发现性**（与 §3 同源：正确工具的说明帮不了正在读别处的人 ✓）。**

## §2 两侧的实测对照

| 能力 | **MCP** | **WEB** |
| --- | --- | --- |
| **某一节／某几小节** | **`render_preview_clip`** ✓（`sectionId` ＋ `bars` ✓） | **loop range** ✓：`src/data/arrangementLoop.ts` ✓、`ArrangementViewV2.tsx:122` ✓、`LoopBraceV2` 画在时间线上（`:441` ✓） |
| **单轨／多轨** | **`render_arrangement_stems`**（`:3234` ✓，分轨导出 ✓） | **每轨 solo／mute** ✓：`track-solo-${id}`／`track-mute-${id}`（`TrackHeaderV2.tsx:198`／`:211` ✓），**而它的注释写着"solo overrides mute, and it is not cosmetic"** ✓ |
| **低采样率快速版** | ✓ `sampleRate: 8000` ✓（`render_arrangement:408` ✓、stems ✓） | —（**实时播放，不需要渲染** ✓） |
| **arrangement 的任意小节区间** | **✗ 没有**——`render_arrangement`（`:389` ✓）只有 `arrangementId`／`format`／`bitrateKbps`／重复次数／`sampleRate`／`channels` ✓ | **✓ 有**（loop range ✓） |
| **⭐ 改前／改后对比（A/B）** | **✗ 没有** | **✗ 没有** |

## §3 因此真正缺的两件

1. **⭐ A/B 两边都没有** ✗✓✓，**而业主明确说这件最重要** ✓。**项目里的 take 是**录音**（`takePlanning.ts:24 PlannedTake` ✓，注释还强调"a recording is not a track kind" ✓）**——**不是"某次编辑前后"的对比** ✗**。**今天"改前"只能靠人记住，或者自己存两个文件去比 ✓**；
2. **`render_arrangement` 没有小节范围** ✗✓——**所以"编排的某 8 小节"在 MCP 侧不可表达 ✓**，**而 WEB 侧有 ✓**（**正是下面那条不对称**）。

## §4 一处值得记下的**不对称** ✓✓

**WEB 有 loop range，而 MCP 的编排渲染没有范围** ✗；**MCP 有分轨导出，而 WEB 的分轨是**交互式**的（能 solo 听，不能"导出这三轨"✗）** ✓。**两边各缺一半，而且缺的不是同一半 ✓✓**——**所以"有没有方便的试听"这个问题，答案取决于你在哪一侧创作 ✓**。

## §5 下一步（按"影响 × 可判定"排）

1. **给 `render_arrangement` 加小节范围** ✓（**最小、最可判 ✓**：`startBar`／`endBar` ✓，与 `render_preview_clip` 的 `bars` 用同一套语义 ✓），**它直接把"某个范围"补齐到 MCP 侧 ✓**；
2. **再做 A/B** ✓✓：**机制不必新造** ✗——**`render_preview_clip` 已经能出"低采样率 ＋ 某一节 ＋ 若干小节"✓**，**成本在**接口形状**（渲染两遍并并排给出 ✓），不在 DSP ✓**。**判据要写死一件事** ✓：**每个文件必须标明它来自哪个状态 ✓✓**——**否则"前后"退化成两个无名的 wav ✓**；
3. **可发现性** ✓：**`render_preview_clip` 这个名字不含"preview"以外的线索 ✗**，**而它做的事（一节 ／ 几小节 ／ 8000 Hz 单声道）值得写在 `render_arrangement` 的描述里指路 ✓**——**与 §1 同一个病 ✓**。
