# GS-1 音色设计能不能从 MCP 写？（裁定：**缺口真实，但已被裁定过**）

> 一位日常使用 MCP 表面的作曲者报告："GS-1 synth 引擎能力未暴露到 MCP 工具面 —— groove 浏览器端音频引擎内部就是 Web Audio + GS-1 wasm，但 MCP registry 里没有任何 synth 音色设计工具：无 `gs1.patch` / `patch.morph` / 振荡器 / 滤波 / 包络参数。genre 自带的 synth voice 只是固定预设。实测影响：精细音色设计必须切到 synth repo 的 GS-1 MCP 另渲，再用 ffmpeg 外部混入。"
>
> 这份笔记把这条报告逐句对着代码验了一遍。结论是：**报告的机制部分成立，"完全没有"部分不成立，而这条缺口早已在 [`Z2_ADJUDICATION.md`](Z2_ADJUDICATION.md) 里裁定过并给了第一步** —— 这是本项目第三次出现"以为缺失、其实已有决定"的同一类情况（前两次是能量曲线与编排 tempo map，见文末）。

## 一句话结论

引擎**确实**是一台可打补丁的 GS-1 减法合成器，参数面（408 个 `AudioParam`）也**确实**完全到不了模型与工具面；但能到工具面的是**预设选择**（14 个具名预设，约 30 个乐器名），而且是**经由 `patternSchema` 的 passthrough 意外可达的**。逐参数（振荡器/滤波/包络）的写入需要一个新的补丁模型，不是一个工具 —— 因此本次**只记录，不实施**。

## 1. 现状：引擎能做什么（这一半，报告是对的）

浏览器的引擎**就是** GS-1：MCP 的渲染不是第二个渲染器，而是驱动真的那个。

| 事实 | 证据 |
| --- | --- |
| MCP 渲染启动应用自己的 dev server + headless Chromium，import 真的 `renderPatternOffline`；"app 的引擎就是 Web Audio + GS-1 wasm host" | `mcp/render/worker.ts:4`（文件头 1–13 说明了为什么不在 Node 里重写第二个渲染器） |
| host 的接口里有单参数与整补丁写入 | `src/audio/gs1/Gs1Host.ts:184`（`setParam(id, value)`）、`:188`（`setPatch(values: Record<number, number>)`）、实现在 `:518-524` |
| 参数面是**声明式**的：每个参数有 id、范围、默认值、曲线、格式 | `vendor/gs1/src/audio/params.ts:1453` 的 `PARAM_SPECS`（`spec(id, name, min, max, default, format, opts)`）；`PARAM_NAMES` 408 项；id 例：`OSC1_ON: 1`、`FILTER_CUTOFF: 14`（`:27`）、`ENV_ATTACK: 19`、`OSC1_PW: 6`、`LFO_DEPTH: 26` |
| 补丁本身就是"GS-1 自己的预设格式" | `src/data/gs1Patches.ts:41`（`export type Gs1Patch = Record<number, number>`，"exactly GS-1's preset format"） |

所以报告里"引擎能做工"这句是准确的。**关键差别在参数从哪来。**

## 2. 参数从哪来：一张固定的手写表，按键名查

| 事实 | 证据 |
| --- | --- |
| 具名预设是一张**手写的固定表** | `src/data/gs1Patches.ts:100`（`GS1_PATCHES: Record<Gs1PatchName, Gs1Patch>`） |
| 解析补丁 = 用 `role` + `instrument` + `genreId` 查表，`params` 直接取自该表 | `src/data/gs1Patches.ts:816`（`resolveGs1Patch`，末行 `return { patch, params: GS1_PATCHES[patch], … }`） |
| 唯一的选择层是**按流派换一个预设名**，且是代码级、调用者不可写 | `src/data/gs1Patches.ts:845`（`GENRE_GS1_PATCH_OVERRIDES`，如 `"uk-garage": { m1_organ: "organStab" }`） |
| 规划器只吃 role / instrument / genreId / notes / sampleRate / latencyFrames —— **没有任何补丁覆盖入口** | `src/audio/gs1/gs1Tracks.ts:101`（`Gs1PlanOptions`）、`:138`（`planGs1Notes`）、`:202`（`resolveRoutedPatch`）、`:210`（`gs1PatchFor`） |
| 全仓库只有**两处**把参数写进核心，两处都喂自那张固定表 | 离线：`src/audio/WavExporter.ts:591`（`host.setPatch(routed.params)`）；实时：`src/audio/gs1/Gs1VoicePool.ts:281`（`slot.host.setPatch(plan.params)`） |

**可达预设的实测规模**（按路由表读源统计，与方法同 `scripts/probe_gs1_instrument_voicing.mjs:5` 的注释"~30 instruments"）：

| 角色 | 表 | 走 GS-1 的乐器 | 保持原生 | 不同预设名 |
| --- | --- | --- | --- | --- |
| chords | `GS1_CHORDS_ROUTING`（`gs1Patches.ts:721`） | 8 | 4 | 8（warmPad, electricPiano, cleanPluck, supersawStack, drivenGuitar, organStack, analogLead, sustainedStrings） |
| lead | `GS1_LEAD_ROUTING`（`:744`） | 17 | 10 | 11（+squareLead, acidLead, bellMallet, sineLead） |
| texture | `GS1_TEXTURE_ROUTING`（`:782`） | 5 | 0 | 2（sampleSurface, sampleTexture） |

即：**14 个具名预设、约 30 个乐器名**。`lead` 的 10 个与原生的 4/10 个不路由的原因是**写在表里的**（声学乐器的本体就是它的音色，减法合成没有诚实的对应物）—— 这一层设计是有理由的，不是遗漏。

## 3. 缺的是什么（报告的这一半也不完全对）

### 3.1 真的没有：逐参数写入

| 缺的东西 | 证据 |
| --- | --- |
| 模型里**没有**放补丁的地方 | `src/types/arrangementV2.ts:16`（`TrackV2`：kind/name/color/collapsed/muted/soloed/armed/gainDb/pan/parentId/fromTrackId/fromLaneId/sample/takes/selectedTakeId/takeRegions —— **无 patch / synth params 字段**） |
| 走 GS-1 的轨道，`instrument` 是 v1 pattern 的一个**字符串名**，不是补丁 | `src/types/genre.ts:78`（`instrument: string`） |
| 应用**自己没有**编辑补丁的界面 | `GS1_PATCHES` / `Gs1Patch` / `resolveGs1Patch` 只被 `src/audio/**`、`src/data/**` 与测试引用，**零个 `.tsx` 引用**；GS-1 在 UI 上只有一枚只读的"这件乐器由 GS-1 发声"徽章（`src/components/console/InstrumentPicker.tsx:165`、`:189-212`）和一个总开关（`src/views/StudioView.tsx:374`） |
| MCP 工具面里**一个都没有** | 整个 `mcp/` 树里 `gs1` / `patch` / `synth` 参数**零命中**；只有保留未实现的 `synthesize_vocal`（`mcp/registry.ts:1653`）与一个乐器名字符串（`mcp/progression.ts:98`）。实测 `npm run check:mcp`：**84 tools、7 resources、4 prompts、91 checks passed** |
| 裁定里点名的两个工具都**只存在于文档里** | `set_track_preset` / `set_synth_params` 全仓库只出现在 `docs/Z2_ADJUDICATION.md:114` 与 `:144` |
| `list_arrangement_instruments` **不是**预设目录 | `mcp/registry.ts:262-273` 列的是 sampler 的**采样库资产**（`assetId`、library、duration），与"合成器预设"是两条轴 —— 所以裁定里"预设参数读取"那一步也真的还没有 |

### 3.2 意外可达：预设**选择**已经能过线

这一条是本次新查出来的，也是"完全没有写音色的工具"这句**不准确**的地方：

* `patternSchema` 暴露了 `tracks[].instrument: z.string()` —— `mcp/registry.ts:128`，且该对象是 `.passthrough()`（`:142`，schema 定义自 `:113`）；
* `render_audio` 接受整个 `pattern` —— `mcp/registry.ts:1848`（`:1855` 的 `pattern: patternSchema.optional()`）；
* 渲染器按 `track.instrument` 决定补丁 —— `src/audio/WavExporter.ts:537`（`gs1PatchFor(track.track_id, track.instrument, pattern.genre_id)`）。

因此：**调用者今天就能通过 `render_audio` 传入一个 track 的 `instrument` 名字，选中 14 个具名预设中的任意一个。** 这是一条**没有人记录过的旁路**，而且它不校验名字 —— `resolveGs1Patch` 是全函数，未知名字**静默回落到原生引擎**（`src/data/gs1Patches.ts:816-843`，注释明说"which is the safe answer"），所以打错一个字母得到的是另一台合成器，而不是报错。

结论的准确表述是：

> **预设选择**：可过线，但只经由 schema 的 passthrough，未文档化、未校验、非意图。
> **逐参数设计**（振荡器 / 滤波 / 包络 / mod matrix）：**真的没有**，且没有任何地方能放它。

## 4. 这条缺口已经被裁定过了（第三次同类）

`docs/Z2_ADJUDICATION.md:144` 的 `sound` 行：

> | sound | `set_synth_params`/`set_track_preset` | 🗺 | **完全没有写音色的 MCP 工具**（83 个里没有）。这是 `mcpCoverage`/`mcpCapability` 两张机制表都抓不到的缺口，因为音色参数不在 `arrangementEdits.ts` 的导出里。**决定**：🗺 第一步 = 一个只读的 `list_arrangement_instruments` 已有的目录之上，加 `set_arrangement_track_instrument`（**已存在**）之外的预设参数读取；写侧的第一步是 `set_track_preset`，**因为预设是有限集合而逐个合成器参数不是** |

以及 `:114`（§5.3 第 1 条）：

> **决定**：🗺 两条都在 §5.4 的 `sound` 行与 §2.5 行给了第一步（`set_track_preset`；`set_track_send`），**而不是各加一个只读镜像工具**

两点含义：

1. **缺口是真的，报告有价值** —— 但它是**已知且已排期**的，不是新发现。它没进 `mcpCoverage` / `mcpCapability` 两张机制表的原因也已被写明：音色参数不在 `arrangementEdits.ts` 的导出里，也没有对应的视图，所以两张表都扫不到它。
2. **第一步已经被定死为"有限预设集合"，并明确否掉了逐参数** —— 理由是预设有限、可枚举、已过闸门，而 408 个参数不是。

这与本项目前两次的形态相同（见文末"同类先例"），因此**本次的交付就是把报告对回这条既有裁定，并把新查到的旁路与两个成本理由补上**。

## 5. 顺带查到的一处**假声明**（报告者为什么会以为功能存在）

应用自己的帮助文案声称可以导出 GS-1 补丁，而**不存在任何 GS-1 补丁导出**：

| 位置 | 原文 |
| --- | --- |
| `src/i18n/locales/help.ts:74` | en: "… or export directly as a **GS1 patch** or Ableton project." / zh: "…或一键导出为 **GS1 开放协议补丁**及 Ableton Live 工程。" |
| `src/data/tutorialCourses.ts:200` | `tipEn: "Share lossless compressed URLs or export GS1 patch bundles"` |
| `src/components/help/HelpCenterModal.tsx:308` | 同一句的两个语言分支 |

而导出侧的全部动作是 **MIDI / ALS(Ableton) / Groove / WAV / MP3 / Stems**，没有第七项：`src/features/sequencer/hooks/useExportActions.ts:114,124,148,231,287,318`（六个 `handleExport*`）与 `src/components/sequencer/Toolbar.tsx:1716` 的 `ExportMenu`。`mcp/registry.ts` 里同样没有补丁导出工具。

这是一处**一行级的假声明**（三处重复），独立于本缺口，本次只记录不改：改哪一种表述是产品决定（若指上游 synth repo 的能力，则该写明"在 synth 里做"）。但它解释了为什么使用者相信这条能力已经在。

## 6. 本次的决定：**不实施**，以及为什么第一步不"小"

按任务的判据（"若第一步真的小而安全就实施：例如模型里已经带着补丁对象，缺的只是把它从工具写出去"），这里**不满足**：

| 逐参数写入需要什么 | 现状 |
| --- | --- |
| 一个新的补丁模型 + 它住在哪（pattern track / arrangement track / genre） | 都不存在（`src/types/arrangementV2.ts:16`、`src/types/genre.ts:78`） |
| 一个**单点**解析缝 | 现在导出侧解析**两次**：`WavExporter.ts:537`（建 host 用）与 `planGs1Notes` 内部的 `resolveRoutedPatch`（`:798`/`:859`/`:901`）。覆盖值必须同时到达两处，否则**文件里的声音会与 `setPatch` 收到的不一致** —— 正是这个代码库花闸门避免的"第二个声音" |
| 实时/离线一致 | 实时侧另有一处 `Gs1VoicePool.ts:263` → `:281`，不一起改则"试听 ≠ 渲染" |
| 一个应用界面 | 没有（§3.1）：MCP 会写一份**没有任何人能看见或编辑**的状态 —— 跨阶段原则 1 是"No UI-only Features"，这是它的镜像（tool-only feature） |
| 参数校验 | `PARAM_SPECS`（`:1453`）**已经**给了范围与默认值，这一步反而便宜；但"哪些参数属于哪一族补丁、什么默认值安全"没有——`GS1_PATCHES` 是手写稀疏表，其文件头（`gs1Patches.ts:36-38`）明说**按参数语义写、没有做过听感测试** |
| 持久化 | `instrument` 所在的 v1 pattern 是版本化模型（`.groove` v2、分享链接都要跟着动） |

**所以逐参数那一步不开始**，理由如上并已记录在案（与 `Z2_ADJUDICATION.md:144` 的裁定一致：预设是有限集合，逐参数不是）。

## 7. 最小的诚实第一步（沿用既有裁定，不另起一套）

既有裁定给的第一步是 `set_track_preset`，落在"有限预设集合"上。对着本次查到的旁路，它有一个**更具体的形态**，而且**不需要新模型字段**：

> **第一步（小，未做，等一个决定）**：把**预设选择**从 schema 旁路变成一等操作 —— 在 `apply_pattern_ops` 增加一个 `{ op: "set_instrument", track, instrument }`（或等价的一个 `set_lane_instrument` 工具），**对名字做校验**，把 `GS1_*_ROUTING` 的可达预设与原生乐器名作为合法集合列出。
>
> 这样做的三个好处，都对着真实缺陷：① `patternSchema` 的 `instrument` 旁路不再是"意外的能力"而是**有名字、有文档**的操作；② 打错名字**不再静默回落到原生引擎**（今天的行为，`gs1Patches.ts:816-843`）；③ 14 个预设与约 30 个乐器名第一次**可被 agent 枚举**。

* **为什么算小**：`instrument` 已经是真实字段（`src/types/genre.ts:78`）、已经驱动路由（`WavExporter.ts:537`）、路由本身已是全函数。纯字段写 + 一处校验，无新模型、无 UI、无 wasm、无持久化变更 —— 与编排 tempo map 当初"只差一层 pass-through"同形。
* **为什么本次仍不做**：合法集合的**边界是个产品决定**而不是机械提取 —— `GS1_*_ROUTING` 只有 chords/lead/texture 三张表，而 159 个流派里存在大量不在这三张表内的乐器名；校验集合取小了会**误拒合法名字**，取大了等于不校验。同时 `set_instrument` 在原生轨道上是**无声的空操作**（如 `piano_lead` 本就原生），一个有时什么都不做却报成功的工具需要一句解释。这两件事应当与"补丁住在哪"一起定，而不是由这一份调查替业主定。
* **成本量级**：`opSchema` 一条 + `mcp/pattern.ts` 一个纯变换 + 一个校验 helper（可复用 `src/data/instrumentCategories.ts:177` 的 `isGs1Instrument`）+ `scripts/check_mcp.mjs` 一条协议检查 + `docs/MCP.md` 一行 + `src/test/mcpTools.test.ts` 一条判据。
* **它买不到什么**：**逐参数设计**。那一步（振荡器/滤波/包络）留在第 2 步，挡在 §6 的模型决定后面。

## 同类先例（本项目第三次）

| 报告/评估的说法 | 实际 | 位置 |
| --- | --- | --- |
| `get_energy_curve` 缺失 | **已有决定**：曲线随渲染指标一起返回，不为它单设工具 | `docs/Z2_ADJUDICATION.md:160`（M1 #3，"这一条被判错过两次"） |
| 编排侧 tempo map 缺失 | **一处 pass-through**：`ArrangementV2.tempo` → 投影 → `set_arrangement_tempo_map`，已闭合 | `docs/Z2_ADJUDICATION.md:181`（§能力缺口 1） |
| **`sound` 命名空间（写音色）完全缺失** | **已有裁定与第一步**：`docs/Z2_ADJUDICATION.md:144`；缺口真实，第一步 = 有限预设集合，逐参数明确不做 | 本文件 §4 |

## 复现本次结论的命令

```bash
node scripts/mcp_call.mjs --list          # 84 tools，其中无一个 synth/patch 参数工具
npm run check:mcp                         # 91 checks passed；surface: 84 tools, 7 resources, 4 prompts
grep -rn "gs1\|patch\|synth" mcp/ --include='*.ts'   # 只命中保留未实现的 synthesize_vocal 与一个乐器名
grep -rn "Gs1Patch\|GS1_PATCHES\|resolveGs1Patch" src/ --include='*.tsx'   # 零命中：应用没有补丁编辑界面
grep -rn "set_track_preset\|set_synth_params" . --include='*.ts' --include='*.md'   # 只命中 Z2_ADJUDICATION.md:114,144
```
