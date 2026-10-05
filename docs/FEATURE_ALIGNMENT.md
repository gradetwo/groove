# 三方对齐表：系统能力 × Web 暴露 × MCP 暴露

**这份表回答一件事**：某项能力**引擎里有没有**、**Web 界面上能不能用**、**MCP 上能不能调**，以及**没有的那一侧为什么没有、打算怎么办、现在什么状态**。

- 业主提出（2026-10-05）："系统已经实现/计划功能，web 端暴露功能，mcp 暴露功能 三方对齐检查表格（放到 docs 下），哪些已经有，没有的标明原因/计划/状态"。
- **本表的读法**：`✓` 有 ／ `✗` 没有 ／ `🔶` 部分或半接线 ／ `?` **尚未核实**（不猜，见"待核"一节）。

## 口径（每一列怎么复算，避免"凭印象"）

| 列 | 来源 | 怎么复算 |
|---|---|---|
| **系统**（引擎／数据层） | `src/audio/**`、`src/data/**`、`mcp/**` 里的实现 | 看该能力是否有实现与调用方；下面每行给路径 |
| **Web**（界面暴露） | `src/views/**`、`src/components/**`（菜单／面板／按钮） | 路径即入口；`✓` 表示界面里能点到，`🔶` 表示只读或部分 |
| **MCP**（工具面） | ⭐ **服务端自报**，不是 grep | `npm run mcp:build` 后 `node scripts/list_mcp_tools.mjs`（**95 tools**，2026-10-05 20:41 实测） |

`node scripts/list_mcp_tools.mjs` 走 stdio 问 `tools/list`，与真实客户端所见**同一份**；`npm run check:mcp` 另外跑 123 项断言（含 stdio 可达性）。**不要用正则数注册面**：`name`/`title` 在 resources 与 prompts 上也出现，2026-10-05 实测正则会数出 98 个，而真实是 94 个。

## 对齐表

| # | 能力 | 系统 | Web（入口） | MCP（工具） | 状态 / 原因 |
|---|---|---|---|---|---|
| 1 | 曲风库浏览、搜索、分类、关系 | ✓ | ✓ `src/views/ExploreListView.tsx`、`GenreDetailView.tsx` | ✓ `list_genres`、`get_genre`、`search_genres`、`explain_genre`、`list_categories`、`get_genre_relations` | 三方齐 |
| 2 | 自定义曲风（增删改查） | ✓ | ✓ `src/views/CustomGenreMakerView.tsx` | ✓ `list_custom_genres`、`get_custom_genre`、`save_custom_genre`、`delete_custom_genre`、`duplicate_custom_genre` | 三方齐 |
| 3 | 步进模板（pattern）读写与运算 | ✓ | ✓ `src/views/StudioView.tsx` | ✓ `get_pattern`、`apply_pattern_ops`、`validate_pattern`、`pattern_statistics` | 三方齐 |
| 4 | 歌曲与段落（song / section / clip） | ✓ | ✓ `src/views/StudioView.tsx` | ✓ `create_song`、`get_song`、`add_section`、`duplicate_section`、`make_unique`、`set_clip`、`set_lane_slots`、`set_tempo`、`undo_song` | 三方齐 |
| 5 | 编曲 v2（轨道、区域、音符、take） | ✓ | ✓ `src/views/HorizontalTimelineView.tsx`、`VerticalTimelineView.tsx` | ✓ `create_arrangement`、`get_arrangement`、`describe_arrangement`、`add_arrangement_track`、`remove_arrangement_track`、`rename_arrangement_track`、`set_arrangement_track_kind`、`set_arrangement_track_flag`、`set_arrangement_track_gain`、`set_arrangement_track_pan`、`set_arrangement_track_parent`、`set_arrangement_track_asset`、`set_arrangement_track_steps`、`set_arrangement_track_collapsed`、`set_arrangement_region`、`set_arrangement_note_length`、`set_arrangement_bars`、`set_arrangement_tempo`、`set_arrangement_time_signature`、`set_arrangement_tempo_map`、`add_arrangement_note`、`add_arrangement_notes`、`add_arrangement_take`、`assign_arrangement_take_range`、`select_arrangement_take`、`remove_arrangement_note`、`move_arrangement_note` | 三方齐 |
| 6 | 作曲辅助（进行／旋律／练习／示例） | ✓ | 🔶 `src/views/ChordProgressionsView.tsx`（**只浏览**） | ✓ `suggest_progression`、`generate_melody`、`practice_plan`、`compose_groove`、`compose_with_examples`、`list_examples`、`get_example`、`list_chord_progressions`、`get_chord_progression`、`apply_chord_progression` | **Web ✗**：生成链路只走 MCP（作曲是 agent 侧工作流） |
| 7 | 理论核查（倒字、调性、音高） | ✓ | 🔶 **部分**：有移调步进（`src/components/arrangement/ArrangementPanel.tsx`）；**倒字／调性／音高报告无界面** | ✓ `validate_prosody`、`estimate_key`、`get_pitch_report`、`get_transposition_report`、`compare_genres` | 已核（2026-10-05 ✓）：**MCP 独有那三项** ⇒ Web 只覆盖移调 |
| 8 | 导出（MIDI／WAV／MP3／Groove／ALS） | ✓ | ✓ `src/components/arrangement/ArrangementFileEntriesV2.tsx` | ✓ `export_midi`、`export_arrangement_midi`、`export_groove`、`export_ableton`、`render_audio`、`render_song` | 三方齐 |
| 9 | 导出乐谱（MusicXML） | ✓ | ✓ 乐谱页头部 | ✓ `export_arrangement_musicxml` | 三方齐 |
| 10 | ⭐ 导出 Logic 工程（`.logicx.zip`） | ✓ | ✓ 乐谱页头部（v2.34.46 新增） | ✓ `export_logic_project` | 三方齐；⚠️ **Logic 本体能否打开未证**（无 Mac） |
| 11 | ⭐ 导入 Logic 工程 | ✓ `src/data/logicToArrangement.ts` | ✅ **有入口**：`src/features/arrangement/arrangementFiles.ts`（`kind = "logic"` ⇒ 解包取 `Alternatives/<n>/ProjectData` ✓） | ✓ `import_logic_project` | ✅ **三方齐**（2026-10-05 补 ✓）：Web 的导入入口是**单一按内容嗅探**的那一个 ⇒ 用户直接上传 `.logicx.zip` 即可 ✓；判据 `src/test/webLogicImport.test.ts`（含**往返** ✓） |
| 12 | 导入（MIDI／MusicXML／Groove） | ✓ | ✅ **逐项已核**：`src/features/arrangement/arrangementFiles.ts` 的 `arrangementFileKind` 认 `.mid/.midi` ⇒ `midi` ✓、`.groove` ⇒ `groove` ✓、`.musicxml/.mxl/.xml` ⇒ `musicxml` ✓、`.logicx.zip/.zip` ⇒ `logic` ✓ | ✓ `import_arrangement_midi`、`import_arrangement_musicxml`、`import_arrangement_musicxml_file`、`import_groove` | ✅ **三方齐**（2026-10-05 逐项核 ✓）；单一入口按**内容嗅探** ✓ |
| 13 | 渲染音频（整曲／编曲） | ✓ | ✓ 实时播放（`StudioView`）；离线导出见第 8 行 | ✓ `render_audio`、`render_song`、`render_arrangement` | 三方齐；⚠️ 全曲 64 小节 ≈ 360 s，**客户端 300 s 超时偏紧**（见"未暴露/待办"） |
| 14 | ⭐ 段落试听渲染（span） | ✓ | ✗（Web 靠实时播放） | ✓ `render_arrangement_preview`、`render_preview_clip` | **Web ✗**：MCP 独有的"便宜听一段"；⚠️ span 语义 2026-10-05 改为**裁到 span**（`mcp/arrangement.ts` 的 `intoSpan`） |
| 15 | 分轨导出（stems） | ✓ | ✅ **有入口**：`src/components/arrangement/ArrangementFileEntriesV2.tsx` 的 `onExportStems`（`data-testid="arrangement-export-stems"` ✓，文案 `toolbar_export_stems` ✓） | ✓ `render_arrangement_stems` | ✅ **三方齐**（2026-10-05 核实 ✓）；⚠️ 8 小节 5 轨 ≈ 300 s，**RPC 会超时**（见"未暴露/待办"） |
| 16 | 响度与频谱分析 | ✓ | 🔶 `src/views/AnalyzerView.tsx` | ✓ `normalize_loudness`、`get_loudness_report`、`analyze_audio`、`spectral_balance` | Web 只读展示；MCP 可**产出报告** |
| 17 | GS-1 音色（patch） | ✓ | 🔶 `StudioView` 的开关与选择器 | ✓ `apply_gs1_patch`、`get_gs1_patch` | MCP 面**更深**（完整 patch 设计） |
| 18 | 采样库管理 | ✓ | ✓ `src/components/settings/SampleLibrariesPanel.tsx` | ✓ `list_sample_libraries`、`add_sample_library`、`list_arrangement_instruments`、`inspect_instrument_sfz` | 三方齐 |
| 19 | 采样乐器试听（单音） | ✓ | ✓ 键盘试听 | ✓ `render_instrument_note` | 三方齐 |
| 20 | 主课／教学 | ✓ | ✓ `src/views/MasterclassView.tsx` | ✓ `list_masterclasses` | 三方齐（MCP 仅**列举**，无逐步教学状态） |
| 21 | 挑战／耳训 | ✓ | ✓ `src/views/ChallengeView.tsx` | ✗ | **MCP ✗**：游戏化交互未工具化（无计划） |
| 22 | 硬件控制台 | ✓ | ✓ `src/views/HardwareConsoleView.tsx` | ✗ | **MCP ✗**：面向现场操作，非 agent 场景 |
| 23 | 音频分析视图（示波器／频谱） | ✓ | ✓ `src/views/AnalyzerView.tsx` | 🔶 `spectral_balance`、`analyze_audio`（离线文件级） | 实时可视化 MCP 无法表达 |
| 24 | 分享链接 | ✓ | ✅ **有入口**：`src/components/sequencer/ProjectHubModal.tsx`（`shareUrl` ＋ 文案 `project_hub_share` ✓ ＋ 二维码 `project_hub_share_qr_alt` ✓；降级时显示 `project_hub_share_degraded` ✓） | ✓ `share_url` | ✅ **三方齐**（2026-10-05 核实 ✓）；且**降级会明说** ✓（见 `docs/OPEN_WORK.md` §394） |
| 25 | ⭐ 人声：绑定歌词与旋律 | ✓ | ✗ | ✓ `set_arrangement_vocal_melody` | **Web ✗**：无 UI |
| 26 | ⭐ 人声：合成演唱 | 🔶 **未实现** | ✗ | 🔶 `synthesize_vocal`（标题自述 "reserved — not implemented"） | **计划**：工具面预留；两侧都没有可用实现 |
| 27 | ⭐ PWA 安装／更新入口 | ✓ `src/utils/pwa.ts`（`initPwa` 已在 `src/main.tsx` 跑） | ✅ **有入口**：`src/components/settings/SettingsModal.tsx`（「关于」页订阅 `subscribePwaStatus` ✓；`canInstall` 时给「安装应用」✓；`isUpdateAvailable` 时给「立即更新」✓） | n/a | ✅ **已完成**（2026-10-05 ✓，见 `docs/OPEN_WORK.md` §399）；判据 `src/test/pwaEntry.test.ts` ✓（含「缺 `matchMedia` 的主机不得在导入时抛」✓） |
| 28 | ⭐ 无障碍「减少动效」 | ✓ `src/hooks/useReducedMotion.ts`（写 `.reduced-motion` ✓、跟随系统查询 ✓）＋ `src/hooks/useDeviceCapabilities.ts`（只读系统偏好） | ✅ **已接**：`src/App.tsx` 在根上**调一次** ✓（`GalaxyView` 另在读该类 ✓） | n/a | ✅ **已完成**（2026-10-05 ✓，见 `docs/OPEN_WORK.md` §398）；判据 `src/test/reducedMotionWiring.test.ts` ✓（要求**调用**而非导入 ✓；`check:skins` 零 diff ✓） |
| 29 | 工程文件（`.groove` 包） | ✓ | ✓ 导出／导入菜单 | ✓ `export_groove`、`import_groove` | 三方齐 |
| 30 | 试听预热／封面（体验项） | 🔶 `src/hooks/useCoverWarmup.ts`（基础钩子已用于列表） | 🔶 部分 | n/a | **待接线**：`useCoverWarmupBothSizes` 无人调用（业主已批准补） |

## 未暴露 / 待办项（原因 · 计划 · 状态）

| 项 | 原因 | 计划 | 状态 |
|---|---|---|---|
| ✅ **Web：Logic 导入入口**（第 11 行） | — | 已完成（2026-10-05 ✓，见 `docs/OPEN_WORK.md` §378） | **已完成并推** ✓（判据含往返 ✓） |
| ✅ **MCP：段落渲染超时**（第 13/15 行） | 渲染时长由编曲长度决定（8 小节 5 轨 ≈ 300 s、全曲 ≈ 360 s） | 业主批准后**逐条核查** ⇒ **表面已具备**：服务端预算 **900 s** ✓／描述已写「客户端超时须至少同长」✓／带 `progressToken` 即报进度 ✓／stems 已写「每轨一次渲染」✓ | **核查完成，无需改代码** ✓（`docs/OPEN_WORK.md` §380；两条判据守着那句提示 ✓） |
| ✅ **MCP：`add_arrangement_track` 顶层 `trackId`** | 原回执为 `{summary, problems}`，新 id 藏在 `summary.tracks[last].id` | 业主批准后已实现（保留嵌套 ✓ 向后兼容 ✓） | **已完成并推** ✓（§377；判据拿返回 id 直接做下一步调用 ✓，验红 ✓） |
| ✅ **Web：PWA 安装/更新入口**（第 27 行） | — | 已完成（2026-10-05 ✓，见 `§399`） | **已完成并推** ✓（判据 4 用例 ✓，弄红过 ✓） |
| ✅ **Web：减少动效**（第 28 行） | — | 已完成（2026-10-05 ✓，见 `§398`）：保守法，根组件调一次 ✓ | **已完成并推** ✓（判据 3 用例 ✓，弄红过 ✓；`check:skins` 零 diff ✓） |
| **MCP：`synthesize_vocal`**（第 26 行） | 标题即写明 "reserved — not implemented" | 无 | **计划（预留）** |
| **Logic 工程实机打开** | 无 Mac／Logic | 需外部环境 | **未测（`needs`）** |
| **采样镜像可达性对渲染的影响** | 本机渲染宿主连不上采样镜像；deep-test 沙箱亦然 | 需可用的镜像出口 | **未测（`needs`）** |

## 待核（本表里标 `?` 的，不是"没有"，是**没量**）

- 第 7、12、15、24 行的 Web 侧：导入项逐条核对、理论报告是否有界面、stems 是否可从界面导出、分享链接是否有按钮。
- 第 22 行硬件控制台是否有 MCP 对应（`list_masterclasses` 已在使用，但控制台的工具面未逐条比对）。

## 本表的维护约定

1. **MCP 列只信服务端自报**：改完注册面 ⇒ `npm run mcp:build && node scripts/list_mcp_tools.mjs` ⇒ 与本表比对。
2. **新增能力** ⇒ **三列同时补**：实现（系统）＋ 入口（Web，或写明"仅 MCP"的原因）＋ 工具（MCP，或写明原因）。
3. **"没有"必须带原因**："设计如此 / 仅 MCP / 未建 / 需 Mac / 未测" 五类之一，不允许留空。
4. ⭐ **改完实现要回来改这张表** ✗ —— 本表会**过时**（2026-10-05 就发生过一次：Logic 导入已实现 ✗ 而表里仍写"未开工" ✓）；
   覆盖判据只保证"工具名一个不漏" ✓，**保证不了"状态与事实一致"** ✗ ⇒ 这一条靠人 ✓。
5. **本表不是判据**：它随实现更新，不设阈值；能被判据钉住的是"**每个 MCP 工具都出现在表里**"（见 `src/test/featureAlignmentCoverage.test.ts`）。

## 2026-10-05 回填（按本表第 4 条规矩：改完实现回来改表）

| 行 | 改了什么 | 为什么与表有关 |
|---|---|---|
| 13 渲染音频 | 渲染回包**新增** `networkMs`／`decodeMs`（`sampleCacheStats()` ✓） | 表里只写了"能渲染"，没写"**能说清时间去哪**" ✓；现在 280.6 s 的 stem 渲染**可归因**到下载 vs 解码 |
| 16／23 分析 | `spectral_balance` 描述**指名**它与 `analyze_audio` 是**同一份分析** ✓；`analyseWavFile` 按 `path+size+mtime` **缓冲** ✓ | 表里把两者并列 ✓，未说"**同 handler、回复逐字节相同**" ✗ ⇒ 实测一次创作跑**白花 115–126 s/曲** |
| 5 编曲 v2 | `create_arrangement` **不再承诺**它没有的 `assetId` ✓（改为指名 `set_arrangement_track_asset` ✓）；`add_arrangement_notes` 描述**指名** `get_pitch_report` 的"先解析一个音" ✓ | 表里这两条都记"✓" ✓，但**字段层面的诚实**与**音域试错成本**（2 分钟/轨 ✗）原来没在表里 |
| — 工具面 | 仍 **94 tools** ✓（三处都**只改文案／回包**，**未增删工具** ✓） | 表的口径是"**暴露/未暴露**" ⇒ 本次**不改变暴露面** ✓，只提高**可用性**与**诚实度** |

> ⚠️ **仍未暴露、且已记账不改** ✓（见 `docs/OPEN_WORK.md` `§443`）：音域字段 `rangeLow/High` ✗（全仓无该数据 ✗）、
> `set_arrangement_vocal_melody` 接 `arrangementId` ✗（歌词 × 编曲的打通 ✓）。两者都写了"**什么条件下才该改**" ✓。

## 2026-10-05 20:42 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **系统（音频引擎）** | `src/audio/WavExporter.ts` 新增 `preparePatternAudioLanes` ＋ `RenderWavOptions.prepareOnly` ＋ `ArrangementLaneReport` | `a7d652d` ✓；一处准备，不复制 |
| ⭐ **MCP 面** | **新增只读工具 `validate_arrangement`** ⇒ 工具数 **94 ⇒ 95** | `cc86138` ✓；`check:mcp` **95 tools／123 checks 0 failed** ✓ |
| ⭐ **Web 面** | **无变化** ✓ | 新入口只在 MCP／Node 宿主路径上使用 ✓；页面不动 ✓ |

**新工具的口径：** 它**只解析、不渲染**，**不写文件**。
**它的回包是自己的形状：** `prepareOnly`、`ready`、`empty`、`loaded`、`total`、`problems`。
**它不借用渲染字段：** 没有 `path`、`bytes`、`truePeakDb`、`integratedLufs`。
**诚实边界：** 热缓存几秒；冷缓存仍要取采样。

**判据：** `src/test/mcpValidateArrangement.test.ts`（先红后绿 ✓）；`src/test/mcpTools.test.ts` 已登记（22 用例 ✓）。
**历史行不改：** 上表中「仍 94 tools」那一行是**当时**的记录，保留原样。
