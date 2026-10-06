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
> `set_arrangement_vocal_melody` 接 `arrangementId` ⭐ **已办结（2026-10-05 ✓，`7b2c3e3` ✓）**：**现已接受 `arrangementId` ＋ `trackId`** ✓，写入编曲轨道 ✓ —— ~~✗~~（歌词 × 编曲的打通 ✓）。两者都写了"**什么条件下才该改**" ✓。

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

## 2026-10-05 21:15 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **系统（音频引擎）** | 新增 `setMcpTrackNotes(arrangementId, trackId, notes)`：**替换**某轨全部音符（⭐ 不改模型层 ✓，守 `fx`／`folder` 守卫 ✓） | `f030a01` ✓ |
| ⭐ **MCP 面** | `set_vocal_melody` ⇒ ⭐ **`set_arrangement_vocal_melody`** ✓；入参 ⭐ **只留 `arrangementId` ＋ `trackId`** ✓（删 `songId`／`sectionId`／`index`／`pattern` ✗）；回包 ⭐ `notes`（音符事件 ✓）＋ `syllables`（音节记录 ✓）＋ `prosody` ＋ `edit` ✓ | `4a6904e` ✓／`7b2c3e3` ✓ |
| ⭐ **Web 面** | **无变化** ✓（该项本来就没有界面 ✓ —— 见第 25 行"Web ✗" ✓） | — |

**转换规则（明写 ✓）：** 一步 ＝ 十六分之一小节 ⇒ `startBeats = step / 16 × 4` ✓；音长 ＝ 一步 ✓；力度 ＝ **0.8**（明写的默认值 ✓，因为音节记录不带力度 ✓）。
**术语 ✓：** 入参、回包、描述**全部 v2** ✓；⚠️ 内部**仍借 v1 的步进引擎** ✓ ⇒ ⭐ 已注释说明 ✓（⭐ 纯 V2 架构最终要换掉它 ✓）。
**判据读数 ✓：** `tsc=0` ✓｜`lint=0` ✓｜`check:mcp` **123/123** ✓｜判据组 **15 用例** ✓（含改名后的 `mcpCopy_set_arrangement_vocal_melody.test.ts` ✓）｜结构门全 0 ✓

## 2026-10-05 21:45 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **系统** | **无变化** ✓ —— 采集只**读**既有数据 ✓（版本 ✓／平台 ✓／注册面计数 ✓／实测成本 ✓），**不改编曲** ✓ | — |
| ⭐ **MCP 面** | ⭐ 新增只读工具 ⭐ **`collect_debug_bundle`** ✓ ⇒ 工具数 **93 ⇒ 94** ✓；采集**白名单** ✓（⭐ 不采用户目录路径 ✗／令牌 ✗／密钥 ✗／环境整包 ✗／作品内容 ✗）；⭐ 包内 `omissions` **写明采不到的两项及其原因** ✓ | 本轮 ✓ |
| ⭐ **Web 面** | ⏳ **待做** ✗ —— Web 侧的采集入口尚未实现 ✓（⭐ 业主需求 ✓，⭐ 见台账 §466 ✓） | — |

**包的形状 ✓：** `collectedAt` ✓／`appVersion` ✓／`runtime{platform,arch,node}` ✓／`surface{tools,resources,prompts}` ✓／`budget`（实测成本 ✓）／`env{GROOVE_MCP_OUT: "set"｜"unset"}` ✓（⭐ **绝不写值** ✗）／`note?` ✓／`manifest[]` ✓／`omissions[]` ✓
**落盘规矩 ✓：** 与既有写手一致 ✓ —— `args.outputDir || GROOVE_MCP_OUT || mkdtempSync(os.tmpdir())` ✓；回包 ⭐ **绝对路径 ＋ 字节数** ✓
**判据读数 ✓：** 新判据 **2 用例** ✓（⭐ 已验**能红** ✓：清单长度断言改成 99 时失败 ✓）；`tsc=0` ✓／`lint=0` ✓／`check:mcp` ✓／工具与尺寸门 0 ✓

## 2026-10-05 21:54 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **系统** | **无变化** ✓（采集只读 ✓） | — |
| ⭐ **MCP 面** | ✅ `collect_debug_bundle`（只读 ✓）⇒ 工具 **94** ✓ | `7da3851` ✓ |
| ⭐ **Web 面** | ✅ ⭐ **顶栏"采集调试信息"按钮** ✓（`data-testid="header-debug-bundle"` ✓）⇒ 采集 ⇒ ⭐ **下载一个文件** ✓，⭐ 文件名与 MCP 侧**同名规** ✓ | `91fb07c` ✓ ＋ 本轮 ✓ |

**Web 侧采集内容 ✓：** 应用版本 ✓／UA 与平台与语言 ✓／视口与像素比 ✓／关键耗时 ✓／编曲计数（⭐ 调用方传入才采 ✓）／音频上下文（⭐ 同理 ✓）／⭐ 你的一句话 ✓／⭐ `manifest[]` ✓／⭐ `omissions[]` ✓
**两条判据 ✓：** ⭐ Web 判据 **3 用例** ✓（与 MCP 侧同形状 ✓）；⭐ ⭐ **`check:dead-exports` 不再列出 `downloadJsonFile`** ✓ —— ⭐ 这就是"顶栏接完了"的判据 ✓
**文案 ✓：** 新键 `debug_bundle`（`zh` ＋ `en` ✓）在 `src/i18n/locales/common.ts` ✓；⭐ `skins:gen` 零 diff ✓ ＋ `check:skins=0` ✓
**读数 ✓：** `tsc=0` ✓／`lint=0` ✓／`check:skins=0` ✓／相关判据 **13 个文件**全过 ✓（`i18nKeys` ✓／`i18n` ✓／`headerNav` ✓／`desktopSkins` ✓…）

## 2026-10-05 23:12 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **系统** | ⭐ 新增共享 ⭐ **tar 写入器** ✓（`src/features/debug/tar.ts` ✓，纯函数 ✓，ustar ✓，含读回 ✓） | `0abfcb9` ✓ |
| ⭐ **MCP 面** | ⭐ `collect_debug_bundle` ⭐ **改为产出 `.tar.gz` 压缩包** ✓（⭐ 不再是单文件 JSON ✗）：内含 `bundle.json` ✓／`environment.json` ✓／`manifest.json` ✓／`README.md` ✓（⭐ 自描述 ✓）／⭐ **若给了编曲** ⇒ `arrangement.groove.json` ✓／⭐ 相关文件 ⇒ `files/…` ✓（⭐ 每个 ≤ 8 MiB ✓，⭐ 超限**记名不截断** ✓）；⭐ 回包含 ⭐ `entries` ✓／`carriesWork` ✓／`omitted` ✓ | 本轮 ✓ |
| ⭐ **Web 面** | ⏳ **待做** ✗ —— Web 按钮仍产出单文件 JSON ✓ ⇒ ⭐ 要改为同一压缩包格式 ✓ | — |

**⚠️ 隐私取舍（明写 ✓）**：⭐ 若传入编曲 ✓ ⇒ ⭐ **包内含作品内容** ✓ ⇒ ⭐ `README.md` **显眼写明** ✓；⭐ 未传编曲时 ⭐ 包内含**不含作品内容** ✓ 且 `omitted` 写明原因 ✓
**判据读数 ✓**：⭐ `src/test/mcpDebugBundle.test.ts` **4 用例** ✓（⭐ **真实解包往返** ✓：`gunzip` ＋ `readTar` ✓）｜⭐ `src/test/tarArchive.test.ts` **3 用例** ✓｜⭐ 可读性 ✓／覆盖 ✓／死导出预算 ✓／`check:mcp` ✓｜⭐ 七道快门全 0 ✓｜⭐ 两处均已**验能红** ✓

## 2026-10-05 23:21 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **系统** | ⭐ 共享 tar 写入器 ✓（`src/features/debug/tar.ts` ✓）＋ ⭐ 两侧各自压缩 ✓（Node `zlib` ✓／浏览器 `CompressionStream` ✓） | `0abfcb9` ✓ |
| ⭐ **MCP 面** | ✅ `collect_debug_bundle` 产出 `.tar.gz` ✓（`945a05a` ✓） | `945a05a` ✓ |
| ⭐ **Web 面** | ✅ ⭐ **顶栏按钮改为产出同一 `.tar.gz`** ✓ —— 内含 `bundle.json` ✓／`environment.json` ✓／`manifest.json` ✓／`README.md` ✓／⭐ 若传入编曲 ⇒ `arrangement.groove.json` ✓／⭐ 相关文件 ⇒ `files/…` ✓（⭐ ≤ 8 MiB ✓，⭐ 超限记名不截断 ✓） | 本轮 ✓ |

**⭐ 两侧现已同名规同形状 ✓**：⭐ `groove-debug-<时间>.tar.gz` ✓｜⭐ 同一 tar 写入器 ✓｜⭐ 同一 `README`／`manifest` 结构 ✓｜⭐ 同一 8 MiB 上限 ✓｜⭐ 同一"载作品时写明"规则 ✓
**判据读数 ✓**：⭐ Web 判据 **4 用例** ✓（⭐ **真实解包往返** ✓：`DecompressionStream` ＋ `readTar` ✓）｜⭐ tar 判据 3 ✓｜⭐ MCP 判据 4 ✓｜⭐ 可读性 ✓／覆盖 ✓／死导出预算 ✓／`i18nKeys` ✓／`headerNav` ✓｜⭐ 七道快门 ＋ 皮肤门 ＋ `check:mcp` 全 0 ✓

## 2026-10-05 23:56 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **系统** | ⭐ 新增 ⭐ **渲渲染成本估算** ✓（`mcp/render/estimate.ts` ✓）：⭐ 只用**项目自测常量** ✓（⭐ 实测倍率 ✓ ＋ 8 小节音频／墙钟区间 ✓ ⇒ 差值即启动成本 ✓）；⭐ 报 `audioSeconds` ✓／`estimatedWallSec` ✓／**区间** ✓／⭐ **建议客户端超时** ✓；⭐ 无法推理的输入**拒绝** ✓ | `b44b5c6` ✓ |
| ⭐ **MCP 面** | ⭐ `validate_arrangement`（只读 ✓）⭐ 回包新增 ⭐ **`renderEstimate`** ✓ ⇒ ⭐ 调用方**渲染前**即可定超时 ✓（⭐ 性能报告 P0 的可行解 ✓）；⭐ **工具数不变（94）** ✓ | `b50e040` ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ 为什么放在这个工具里 ✓**：⭐ 它本来就回答"**这份编曲行不行**" ✓ ⇒ ⭐ 同一调用方也问"**渲它要多久**" ✓；⭐ 放这里可**不新增工具** ✓（⭐ 方向是让表面变小 ✓）
**判据读数 ✓**：⭐ 估算 **3 用例** ✓（⭐ 按实测常量核对 ✓）｜⭐ 接线判据 **1 用例** ✓（⭐ 读源码 ✓，⭐ 已验**能红** ✓）｜⭐ 相关 5 个判据文件全 0 ✓｜⭐ 七道快门 ＋ `docs`／`refs`／`check:mcp` 全 0 ✓

## 2026-10-06 00:32 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **系统** | ⭐ `.groove` **v2 包**成为主路径 ✓（`arrangementPackage.ts` ✓：⭐ 存 `ArrangementV2` ✓，⭐ **拒绝** `clips`／`sections`／`slots`／`project` ✗）＋ ⭐ 新增 ⭐ `putMcpArrangement` ✓（⭐ 存储的"放入"门 ✓，⭐ id 默认新 ✓） | `3daabdc`／`6972c00`／`dbae22d`／本轮 ✓ |
| ⭐ **MCP 面** | ✅ `export_groove` ⭐ **接 `arrangementId`** ✓（⭐ 删掉 `as unknown as` 伪造 ✗，⭐ 教训 102 ✓）；✅ `import_groove` ⭐ **载入为 arrangement** ✓（⭐ 回 `{ arrangementId, tracks, bars }` ✓，⭐ v1 形状被拒 ✓）；⭐ 两者描述与标题改用 v2 词 ✓ | 本轮 ✓ |
| ⭐ **Web 面** | ⏳ **待做** ✗ —— Web 的保存／读取仍走 v1 形状的包 ✓（⭐ `arrangementFiles.ts:202` ＋ `:515` ✓，⭐ 台账 §485 已列 ✓） | — |

**判据读数 ✓**：⭐ `check:mcp` **123/123** ✓｜⭐ 相关判据 6 个文件全过 ✓｜⭐ 十一道门全 0 ✓｜⭐ 文档双门 0 ✓

## 2026-10-06 00:50 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **系统** | ✅ `.groove` **v2 包**为唯一路径 ✓（`arrangementPackage.ts` ✓）＋ ⭐ 存储有 ⭐ **`putMcpArrangement`** ✓，⭐ 且 ⭐ **由 `import_groove` 调用** ✓（⭐ 覆盖判据因此满足 ✓，⭐ 临时登记已删 ✓） | `3a…`／`dbae22d`／本轮 ✓ |
| ⭐ **MCP 面** | ✅ `export_groove` 接 `arrangementId` ✓（`5a2f423` ✓）｜✅ `import_groove` ⭐ **载入为 arrangement** ✓（⭐ 回 `{ arrangementId, tracks, bars }` ✓；⭐ 标题与描述已用 v2 词 ✓） | 本轮 ✓ |
| ⭐ **Web 面** | ⏳ **待做** ✗ —— 保存／读取仍走 v1 形状 ✓（⭐ 四件已到行 ✓，⭐ 台账 §492／§494 末尾 ✓） | — |

**判据读数 ✓**：⭐ `mcpCoverage=0` ✓｜⭐ `check:mcp` **123/123** ✓｜⭐ 十一道门全 0 ✓｜⭐ 相关判据 6 文件全过 ✓｜⭐ 文档双门 0 ✓

## 2026-10-06 00:55 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **系统** | ✅ `.groove` v2 包成为**唯一路径** ✓（⭐ MCP 与 Web 都是 ✓） | 本轮 ✓ |
| ⭐ **MCP 面** | ✅ 导出接 `arrangementId` ✓／导入载入为 arrangement ✓（`5a2f423`／`e5db525` ✓） | 前轮 ✓ |
| ⭐ **Web 面** | ✅ ⭐ **保存与读取都走 v2 包** ✓：⭐ `grooveFileFor(arrangement, stem = "arrangement")` ✓（⭐ 文件名不再取 `songId` ✓ —— ⭐ 那会撞名 ✓）；⭐ 读取用 ⭐ `arrangementFromPackage` ✓ 并直接取包内编曲 ✓；⭐ 判据改为断言 v2 形状与"不含 `clips`" ✓ | 本轮 ✓ |

**判据读数 ✓**：⭐ `arrangementEntries`（Web 的包往返 ✓）**通过** ✓｜⭐ `check:mcp` **123/123** ✓｜⭐ 十一道门全 0 ✓｜⭐ 相关判据 7 文件全过 ✓｜⭐ 文档双门 0 ✓
**⏳ 遗留 ✓**：⭐ `arrangementFromGroovePackage`（`src/data/arrangementImport.ts:232` ✓）⭐ **已无 v2 调用者** ✓ ⇒
  ⭐ 退场待办 ✓（⭐ `check:dead-exports` 会**列出**它 ✓，⭐ 不失败 ✓）；⭐ 退场前先量其余调用者 ✓（可逆性差 ✓）

## 2026-10-06 01:06 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **系统** | **无变化** ✓ —— 复用既有 Live 写手 ✓（`exportAbletonLiveSet` ✓）与既有展平 ✓（`flattenMcpArrangement` ✓） | 本轮 ✓ |
| ⭐ **MCP 面** | ✅ ⭐ 新增 ⭐ **`export_arrangement_ableton`** ✓ ⇒ 工具 **94 ⇒ 95** ✓（⭐ 这是**移植**：⭐ 保住能力，⭐ 而 pattern 版 `export_ableton` 稍后退场 ⇒ ⭐ 回到 94 ✓） | 本轮 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**工具行为 ✓**：⭐ 展平编曲 ⇒ ⭐ 取编曲自己的 `bpm`（⭐ 缺省 120 ✓）⇒ ⭐ 写 `.als`（gzipped XML ✓）⇒
  ⭐ 回包 ⭐ `{ path ✓, filename ✓, bytes ✓, format: "als" ✓, tracks ✓ }` ✓
**⚠️ 一处诚实说明 ✓**：⭐ `readOnly: false` ✓（⭐ 它写文件 ✓）；⭐ 描述明说"⭐ 只读编曲：⭐ 它写文件，⭐ 不改编曲" ✓
**判据读数 ✓**：⭐ 新判据 **2 用例** ✓（⭐ 读源码断言：⭐ 接 `arrangementId` ✓、⭐ 经既有写手 ✓、⭐ 回包含 `format: "als"` ✓、⭐ 速度取编曲 ✓）｜
  ⭐ `check:mcp` **123/123** ✓｜⭐ 十一道门全 0 ✓｜⭐ 相关判据 6 文件全过 ✓｜⭐ 文档双门 0 ✓
**⏳ 下一步 ✓**：⭐ ① 给该工具加 ⭐ `check_mcp` 的**运行时**用例（⭐ 真跑一次并 gunzip 成 XML ✓）
  ⭐ ② ⭐ `docs/MCP.md` 声明行 ✓ ③ ⭐ **然后**删 `export_ableton` ✗（⭐ 先立 v2 判据再删 v1 ✓）④ ⭐ 回填 ✓

## 2026-10-06 01:13 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ `export_arrangement_ableton` ✓ ⭐ 现在有 ⭐ **运行时**用例 ✓：⭐ 真建一个编曲 ⇒ ⭐ 真导出 ⇒ ⭐ **gunzip 成 XML** ✓ ⇒ ⭐ 断言含 Live Set 标记 ✓ ⇒ ⭐ 证明它是**真的 Live Set** ✓，⭐ 不是"⭐ 一个叫这名字的文件" ✓ | 本轮 ✓ |
| ⭐ **系统／Web** | **无变化** ✓ | — |

**判据读数 ✓**：⭐ `check:mcp` **123/123** ✓（⭐ 含新增的运行时用例 ✓）｜⭐ 十一道门全 0 ✓｜⭐ 相关判据全过 ✓｜⭐ 文档双门 0 ✓
**⚠️ 教训 117 已验证 ✓**：⭐ 把插入包进 ⭐ `{ }` ✓ ⇒ ⭐ 名字**不再需要挑** ✓ ⇒ ⭐ 一次就绿 ✓（⭐ 上一次挑名三次都撞 ✗）
**⏳ 下一步 ✓**：⭐ `docs/MCP.md` 的声明行 ✓ ⇒ ⭐ **然后**删 `export_ableton` ✗（⭐ 先立 v2 判据再删 v1 ✓）

## 2026-10-06 01:21 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ **pattern 基的 `export_ableton` 退场** ✓ ⇒ 工具 **95 ⇒ 94** ✓；⭐ 能力由 ⭐ `export_arrangement_ableton` 承接 ✓（⭐ 已验 ✓） | 本轮 ✓ |
| ⭐ **系统／Web** | **无变化** ✓ | — |

**⭐ 退场触及 7 个文件 ✓**：⭐ `mcp/registryFiles.ts`（⭐ 工具块 52 行 ✓）｜⭐ `scripts/redlines.mjs`（⭐ **必需清单** ✓ —— ⭐ 上次咬我的陷阱 ✓）｜
  ⭐ `scripts/check_mcp.mjs`（⭐ 表项 ＋ **两个用例块** ✓）｜⭐ `src/test/mcpTools.test.ts` ✓｜⭐ `src/test/exportSurfaceCopy.test.ts` ✓｜
  ⭐ `src/test/mcpCapability.test.ts` ✓｜⭐ `mcp/README.md` ✓
**⭐ 判据读数 ✓**：⭐ `redlines=0` ✓｜⭐ `check:mcp=0` ✓｜⭐ 十一道门全 0 ✓｜⭐ 相关判据 6 文件全过 ✓｜⭐ 文档双门 0 ✓
**⭐ 教训 118／119 已验证 ✓**：⭐ **按括号配平定块边界** ✓（⭐ 两块的实测边界 ✓：⭐ `870–873` ✓ 与 ⭐ `491–501` ✓）
  ＋ ⭐ **先把全部边界算完并断言，再统一写盘** ✓ ⇒ ⭐ 一次通过 ✓

## 2026-10-06 01:27 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ **v2 判据现在断言"歌词进 MIDI"** ✓：⭐ `arrangementToMidi.test.ts` 新增一例 ✓，⭐ 建带 `syllable` 的编曲 ⇒
  ⭐ 导出 ⇒ ⭐ 在字节里找 ⭐ **`FF 05 <len> <utf-8>`** ✓ ⇒ ⭐ 解码后断言文本 ✓（⭐ 已验**能红** ✓） | 本轮 ✓ |
| ⭐ **系统／Web** | **无变化** ✓ | — |

**判据读数 ✓**：⭐ 该文件 **13 用例**（⭐ 原 12 ＋ 新 1 ✓）全过 ✓｜⭐ 十一道门全 0 ✓｜⭐ 文档双门 0 ✓
**⭐ 为什么先做这一步 ✓**：⭐ 旧的歌词判据（`lyricExport.test.ts:107–114` ✓）⭐ 是**唯一**在断言这条能力的地方 ✓
  ⇒ ⭐ 先把它在 v2 侧**立起来** ✓ ⇒ ⭐ 才允许退 v1 ✓（⭐ 铁律 ✓）
**⏳ 下一步 ✓**：⭐ `export_midi` 退场（⭐ 8 处 ＋ ⭐ 那条旧判据 ＝ 9 处 ✓，⭐ §506 清单 ✓）⇒ ⭐ 工具数 **94 ⇒ 93** ✓

## 2026-10-06 01:31 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ **pattern 基的 `export_midi` 退场** ✓ ⇒ 工具 **94 ⇒ 93** ✓；⭐ 歌词能力由 ⭐ `export_arrangement_midi` 承接 ✓
  （⭐ 判据已在 v2 侧立住 ✓，`c0b80e6` ✓） | 本轮 ✓ |
| ⭐ **系统／Web** | **无变化** ✓ | — |

**⭐ 退场触及 8 个文件 ✓**：⭐ `mcp/registryFiles.ts` ✓｜⭐ `scripts/redlines.mjs`（⭐ **必需清单** ✓）｜
  `scripts/check_mcp.mjs`（⭐ 名表 ＋ ⭐ 用例块 ＋ ⭐ 孤立的断言行 ✓）｜⭐ `src/test/mcpTools.test.ts` ✓｜
  `src/test/exportSurfaceCopy.test.ts` ✓｜⭐ `src/test/lyricExport.test.ts`（⭐ 旧歌词判据 ✓ —— ⭐ 已在 `c0b80e6` 立好 v2 版 ✓）｜
  `docs/MCP.md`（⭐ 声明行 ✓）｜⭐ `mcp/README.md` ✓
**⭐ 判据读数 ✓**：⭐ `redlines=0` ✓｜⭐ `check:mcp=0` ✓｜⭐ 十一道门全 0 ✓｜⭐ 相关判据 7 文件全过 ✓｜⭐ 文档双门 0 ✓
**⚠️ ⭐ 教训 122 ✓**：⭐ **块尾按"括号归零"算，会在"⭐ 自平衡的一行"上提前停** ✗ ——
  ⭐ 本例 ⭐ `const midi = payload(` ✓ 自身配平 ⇒ ⭐ 块尾算在它那里 ✓ ⇒ ⭐ **留下一条孤立的 `check(…)`** ✓ ⇒ `check:mcp` 报
  "midi is not defined" ✓
  ⇒ ⭐ 修法 ✓：⭐ ① 块尾若后面紧跟 ⭐ `check(` ✓ ⇒ ⭐ **一并吃进来** ✓ ② ⭐ 或跑门后 ⭐ **按报错补删** ✓（⭐ 本轮用的 ② ✓）
  ⇒ ⭐ 更稳 ✓：⭐ **删完立刻跑 `check:mcp`** ✓（⭐ 它抓到了 ✓）

## 2026-10-06 01:41 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ **`normalize_loudness` 改接 `arrangementId`** ✓ ⇒ ⭐ 渲染、测量、求增益、复渲染全部作用于**编曲** ✓；⭐ 回包新增 ⭐ **`peakHeadroom`** ✓ | `5fe6a53` ✓ |
| ⭐ **系统／音频** | ✅ ⭐ 谱面（分析对象）的 `genreId` 取 ⭐ **展平后的 pattern 自己带的 `genre_id`** ✓（⭐ 不再取歌 ✓），⭐ `nameSlug` 取编曲 id ✓（⭐ 编曲无名字 ✓）⇒ ⭐ **增益种子不受影响** ✓ | 同上 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ 一次改动推进两条线 ✓**：⭐ 迁移 ④ 的第一件 ✓ ＋ ⭐ 执行顺序 ④（"⭐ arrangement ＋ ⭐ 峰值余量" ✓）
  ⇒ ⭐ 峰值余量**本来就算** ✓（⭐ 天花板残差与目标残差并列 ✓，⭐ 用来判定哪个边界赢 ✓）⇒ ⭐ 本轮是**报出来** ✓
**⭐ 判据读数 ✓**：⭐ `check:mcp` **113 checks ／ 93 tools** ✓｜⭐ 十一道门全 0 ✓｜⭐ 相关判据 5 文件全过 ✓｜⭐ 文档双门 0 ✓
**⏳ ④ 还剩 ✓**：⭐ `make_unique`（⭐ 段落是 v1 ✓）⇒ ⭐ 处理完 ④ 即完成 ✓

## 2026-10-06 01:46 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ **`make_unique` 退场** ✓ ⇒ 工具 **93 ⇒ 92** ✓ ⇒ ⭐ **迁移 ④ 完成** ✓（⭐ 两个工具：一个改接 ✓，一个退场 ✓） | 本轮 ✓ |
| ⭐ **系统／数据** | ✅ ⭐ "**每段各有旋律**"这个用途在 v2 由 ⭐ **`takes`** 承接 ✓（`TrackV2.takes?: Take[]` ✓，`arrangementV2.ts:80` ✓）⇒ ⭐ **能力未丢** ✓，⭐ 只是换了模型语言 ✓ | 本轮 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ 判据读数 ✓**：⭐ `check:mcp` **92 tools** ✓｜⭐ 十一道门全 0 ✓｜⭐ 相关判据全过 ✓｜⭐ 文档双门 0 ✓
**⚠️ 教训 123 已验证 ✓**：⭐ **先打印块的前后各 2 行** ✓ ⇒ ⭐ 一眼看出场景是 ⭐ **396–466**（71 行 ✓，⭐ 含 `laneProbe`／`firstSection`／`laneBatch`／`laneRejected`／`slowed`／`uniqueSection` 六个变量 ✓）
  ⇒ ⭐ 上一次我算成"⭐ 只删第一处调用" ✗ ⇒ ⭐ 越界 ✓；⭐ 这次一次通过 ✓

## 2026-10-06 02:14 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ **`set_lane_slots` 退场** ✓ ⇒ 工具 **92 ⇒ 91** ✓（⭐ 迁移 ⑤ 的第一刀 ✓，⭐ 且是**零纠缠**那一类 ✓） | 本轮 ✓ |
| ⭐ **系统／数据** | ✅ ⭐ 能力由 ⭐ **`set_arrangement_track_steps`** 承接 ✓（⭐ 轨的步进在 v2 按轨写 ✓，⭐ 不再有"⭐ 跨段落的 lane slot" ✗） | 本轮 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ 触及 3 个文件 ✓**：⭐ `mcp/registrySong.ts`（⭐ 工具块 454–506 ✓，53 行 ✓）｜
  `src/test/mcpCapability.test.ts`（⭐ **三处**能力清单 ✓）｜⭐ `docs/MCP.md`（⭐ 两处散文改成"⭐ 已由 v2 承接" ✓）
**⭐ 未触及 ✓**：⭐ `scripts/check_mcp.mjs`（⭐ **零命中** ✓ ⇒ ⭐ 与施工序预测一致 ✓）｜⭐ `scripts/redlines.mjs`（⭐ 未列 ✓）
  ⇒ ⭐ 印证教训 129 ✓：⭐ **零纠缠的退场只需三处** ✓
**⭐ 判据读数 ✓**：⭐ `check:mcp` **91 tools** ✓｜⭐ 十一道门全 0 ✓｜⭐ 相关判据全过 ✓｜⭐ 文档双门 0 ✓
**⏳ ⑤ 的下一刀 ✓**：⭐ `duplicate_section` ✓（⭐ 同样零纠缠 ✓）⇒ ⭐ 然后 1–2 命中的五个 ✓（⭐ 含 `undo_song` 移植 ✓）

## 2026-10-06 02:19 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ **`duplicate_section` 退场** ✓ ⇒ 工具 **91 ⇒ 90** ✓（⭐ ⑤ 第二刀 ✓，⭐ 也是零纠缠 ✓） | 本轮 ✓ |
| ⭐ **系统／数据** | ✅ ⭐ 能力由 ⭐ **`takes`** 承接 ✓：⭐ `add_arrangement_take` ✓／`assign_arrangement_take_range` ✓（⭐ "同一轨的多个变体" ✓） | 本轮 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ 触及 4 个文件 ✓**：⭐ `mcp/registrySong.ts`（工具块 272–302 ✓）｜⭐ `src/test/mcpSong.test.ts`（**整个 describe 327–368** ✓ —— ⭐ 边界先打印后删 ✓）｜
  `src/test/mcpCapability.test.ts`（清单 ✓）｜⭐ `docs/MCP.md`（表行 ⇒ **记账为 takes** ✓）
**⭐ 判据读数 ✓**：⭐ `check:mcp` **90 tools** ✓｜⭐ 十一道门全 0 ✓｜⭐ 相关判据全过 ✓｜⭐ 文档双门 0 ✓
**⭐ 实施笔记 ✓**：⭐ python 中途语法错一次 ✗（⭐ 写盘前即死 ⇒ 树脏 0 ✓）⇒ ⭐ 修一行即过 ✓
**⏳ ⑤ 的下一刀 ✓**：⭐ 1–2 命中的五个 ✓（⭐ `apply_chord_progression` ✓／`set_clip` ✓／⭐ **`undo_song` 移植** ✓／`get_pattern` ✓／`get_song` ✓／`set_tempo` ✓）

## 2026-10-06 02:26 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ 新增 ⭐ **v2 工具级判据** ✓：⭐ `arrangementTempoMapRoundTrip.test.ts` ✓ —— ⭐ 通过 ⭐ `setMcpArrangementTempoMap` **把地图写进编曲** ✓，⭐ 再 ⭐ `getMcpArrangement` **读回逐点对照** ✓；⭐ 第二例断言"⭐ **整图替换**，⭐ 不是追加**" ✓（⭐ 已验**能红** ✓） | 本轮 ✓ |
| ⭐ **系统／数据** | ✅ ⭐ 数据层判据 ⭐ `tempoWorkedExample.test.ts` **保留** ✓（⭐ 它测 `tempoMap.ts` ✓，⭐ 与 v1／v2 无关 ✓；⭐ tempo 地图两边**形状相同** ✓） | 本轮 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ 为什么这一步必须在退场之前 ✓**：⭐ 该工具原有的两个判据 ⭐ 只测**描述措辞** ✗ ⇒ ⭐ "⭐ 写读往返"**无人守** ✗
  ⇒ ⭐ 现在有人守了 ✓ ⇒ ⭐ **才允许**退 `set_tempo` ✓（⭐ 铁律 ✓）
**⭐ 判据读数 ✓**：⭐ 新判据 2 用例 ✓（⭐ 能红 ✓）｜⭐ `check:mcp` ✓｜⭐ 十一道门全 0 ✓｜⭐ 相关判据全过 ✓｜⭐ 文档双门 0 ✓
**⏳ 下一步 ✓**：⭐ 退 `set_tempo`（⭐ 约 7 处 ✓：⭐ 块 ✓／⭐ `mcpCopy_set_tempo.test.ts` ✓／⭐ `check_mcp:384–391` ✓／
  `docsWorkflow` 步骤表 ✓／`mcpCapability:149` ✓／`mcp_call.mjs:120` ✓／`docs/MCP.md:227`＋`:261` ✓／`arrangementV2.ts:194–196` 注释 ✓）

## 2026-10-06 02:31 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ **`set_tempo` 退场** ✓ ⇒ 工具 **90 ⇒ 89** ✓（⭐ ⑤ 第三刀 ✓，⭐ 且是**先立判据再删**的范式 ✓） | 本轮 ✓ |
| ⭐ **系统／数据** | ✅ ⭐ tempo 地图能力由 ⭐ **`set_arrangement_tempo_map`** 承接 ✓：⭐ 整幅地图写进编曲 ✓，⭐ 点落整小节 ✓、⭐ `jump`／`linear` ✓（⭐ 语义与旧的一致 ✓） | 本轮 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ 触及 8 处 ✓**：⭐ `mcp/registrySong.ts`（工具块 382–422 ✓）｜⭐ `the criterion that measured its description（随工具退场已删除 ✓）`（**删文件** ✓ 用 `rm` ✓）｜
  `scripts/check_mcp.mjs`（**整个场景 383–391** ✓）｜⭐ `src/test/docsWorkflow.test.ts`（步骤表 ✓）｜
  `src/test/mcpCapability.test.ts`（清单 ✓）｜⭐ `scripts/mcp_call.mjs`（示例行 ✓）｜⭐ `docs/MCP.md`（两处散文 ⇒ **记账** ✓）｜
  ⭐ `src/types/arrangementV2.ts`（注释里的旧名 ⇒ 新名 ✓）
**⚠️ ⭐ 又一次块边界错 ✓（第三次 ✓）**：⭐ 首删只删了 ⭐ `const tempoApplied` 一行 ✗ ⇒ ⭐ 门报
  "⭐ **tempoApplied is not defined**" ✓ ⇒ ⭐ 场景实为 ⭐ **383–391**（⭐ 含 `tempoRejected` 与断言 ✓）⇒ 补删即绿 ✓
  ⇒ ⭐ 印证教训 123 ✓：⭐ **场景要整体删** ✓；⭐ 且 ⭐ **按"提及该变量的行"定场景** ✓ 是可靠的定界法 ✓
**⭐ 判据读数 ✓**：⭐ `check:mcp` **89 tools** ✓｜⭐ 十一道门全 0 ✓｜⭐ 相关判据全过 ✓｜⭐ 文档双门 0 ✓
**⏳ ⑤ 剩 6 ✓**：⭐ `create_song` ✓／⭐ `get_song` ✓／⭐ `render_song` ✓／⭐ `set_clip` ✓／⭐ `add_section` ✓／⭐ `undo_song`（移植 ✓）

## 2026-10-06 02:39 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ 新增 ⭐ **`undo_arrangement`** ✓ ⇒ 工具 **89 ⇒ 90** ✓（⭐ 这是 ⑤ 的**移植**件 ✓，⭐ 不是退场 ✓） | 本轮 ✓ |
| ⭐ **系统／数据** | ✅ ⭐ 编曲存储有了 ⭐ **撤销历史** ✓：⭐ 记录点挂在**唯一写缝** `edit` ✓（⭐ 24 个写工具共用 ✓）⇒ ⭐ "⭐ 回到改动之前" ✓ 在 v2 有了 ✓ | 本轮 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ 触及 3 个文件 ✓**：⭐ `mcp/arrangement.ts`（⭐ 历史表 ＋ `edit` 里一行 ＋ `undoMcpArrangement` ✓）｜
  `mcp/registryArrangement.ts`（工具 ＋ 导入 ✓）｜⭐ `src/test/arrangementUndo.test.ts`（**新判据 5 用例** ✓）
**⭐ 判据内容 ✓**：⭐ ① 退一步并报告现状 ✓ ② 一次退三步 ✓ ③ **无事可退时失败** ✓（⭐ 不假装做了事 ✓）
  ④ 加轨与改名各算一次改动 ✓ ⑤ **按名字在 `TOOLS` 里找到它** ✓（⭐ 守门判据要求 ✓）
**⭐ 判据读数 ✓**：⭐ `check:mcp` **90 tools** ✓｜⭐ 十一道门全 0 ✓｜⭐ 守门判据（`mcpCoverage`／`mcpToolCoverage`）全过 ✓｜⭐ 文档双门 0 ✓
**⚠️ ⭐ 一处刻意差别 ✓**：⭐ v2 的历史**不带工具名** ✗（⭐ `edit` 不知道调用者 ✓）⇒ ⭐ v1 那条"⭐ 列出可撤销项" ✗
  ⭐ 随 `get_song` 一起退 ✓
**⏳ ⑤ 剩 5 ✓**：⭐ `get_song`（⭐ 现在其前置已就绪 ✓）⇒ `create_song` ✓／`render_song` ✓／`set_clip` ✓／`add_section` ✓

## 2026-10-06 03:10 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ **`set_clip`／`get_song`／`undo_song` 退场** ✓ ⇒ 工具 **90 ⇒ 87** ✓；⚠️ ⭐ **`add_section` 暂留** ✗ —— ⭐ 它承载**三项 v2 没有的能力** ✓（⭐ 逐小节力度斜坡 ✓／`fill` ✓／移调 ✓，⭐ 见 §533 的 `needs` ✓） | 本轮 ✓ |
| ⭐ **系统／数据** | ✅ ⭐ 能力承接 ✓：⭐ `set_arrangement_track_steps` ✓（⭐ 替 `set_clip` ✓）／⭐ `get_arrangement` ✓（⭐ 替 `get_song` ✓）／⭐ `undo_arrangement` ✓（⭐ 替 `undo_song` ✓） | 本轮 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ 触及 6 个文件 ✓**：⭐ `mcp/registrySong.ts`（⭐ 三段删除 ✓，⭐ `add_section` 保留 ✓）｜⭐ `src/test/mcpTools.test.ts`（⭐ 读者数组 ✓）｜
  `src/test/mcpCapability.test.ts`（⭐ 两处清单 ⇒ v2 ✓）｜⭐ `src/test/mcpSchemaPassthrough.test.ts`（⭐ pattern 来源 ⇒ `get_pattern` ✓）｜
  `docs/MCP.md`（⭐ 三行 ⇒ 记账 ✓）｜⭐ `docs/FEATURE_ALIGNMENT.md` ✓
**⭐ 判据读数 ✓**：⭐ `check:mcp` **87 tools** ✓｜⭐ 十一道门全 0 ✓｜⭐ 相关判据全过 ✓｜⭐ 文档双门 0 ✓
**⭐ 教训 143 的落地 ✓**：⭐ 退**三个**而**留一个** ✓ —— ⭐ 因为那一个带三项别处没有的能力 ✓ ⇒ ⭐ **按能力退，不按名字退** ✓

## 2026-10-06 03:15 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ 迁移 ⑤ 的**退场阶段结束** ✓：⭐ **6 个已退** ✓（`set_lane_slots` ✓／`duplicate_section` ✓／`set_tempo` ✓／`set_clip` ✓／`get_song` ✓／`undo_song` ✓）＋ ⭐ **3 个暂留** ✗（`add_section` ✓／`create_song` ✓／`render_song` ✓）⇒ ⭐ 暂留者各带缺口 ✓ | 本轮 ✓ |
| ⭐ **系统／数据** | ✅ ⭐ **五处能力缺口已登记** ✓（§537 的 `needs` ✓）：⭐ 逐小节力度斜坡 ✓／`fill` ✓／段落移调 ✓／流派播种＋名字＋swing＋resolution ✓／`maxDurationSec` ✓ | 本轮 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ 判据读数 ✓**：⭐ `check:mcp` **87 tools** ✓｜⭐ 十一道门全 0 ✓｜⭐ 文档双门 0 ✓｜⭐ 围栏偶数 ✓
**⭐ ⑤ 完成的判据 ✓**：⭐ ① ⭐ 五处各自在 v2 有家 ✓（或有明文决定 ＋ 用例改写 ✓）② ⭐ 然后三个工具退场 ✓

## 2026-10-06 03:24 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ `render_arrangement` 增加 **`maxDurationSec`** ✓ —— ⭐ **渲染前拒答** ✓（⭐ 命名参数 ＋ 说明替代做法 ✓）⇒ ⭐ 缺口 ⑤ 关闭 ✓；⚠️ 因此 ⭐ `render_song` ⭐ **具备退场条件** ✓ | `996cc00` ✓ |
| ⭐ **系统／数据** | ✅ ⭐ 估算**共享** ✓：⭐ 守卫与 `validate_arrangement` 的 `renderEstimate` 用**同一个** `estimateRenderCost` ✓ ⇒ ⭐ 两数不会漂移 ✓ | 同上 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ 新增判据 ✓**：`src/test/arrangementRenderBudget.test.ts` ✓（2 例 ✓；⭐ 落守卫前**已见红** ✓）
**⭐ 读数 ✓**：⭐ `check:mcp` **0** ✓｜⭐ 十一道门 **0** ✓｜⭐ 双文档门 **0** ✓
**⭐ `needs` 余下 ✓**：⭐ §537 的 ①②③④ ✓（⭐ `add_section` 三项 ✓／`create_song` 四项 ✓）

## 2026-10-06 03:37 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ `create_arrangement` 增加 **`genreId?`** ✓ —— ⭐ **用流派的编曲 pattern 播种轨** ✓（⭐ `patternFromGenre` ✓ ⇒ `projectSongToV2` ✓）；⭐ 未知流派**建前拒答** ✓ 并点名参数 ✓ | 本轮 ✓ |
| ⭐ **系统／数据** | ✅ ⭐ 顺带 ✅ ⭐ `ArrangementV2.name?` ✓（⭐ 上一轮 ✓）：⭐ 建／读／描述／列都可带名字 ✓；⭐ 缺省即未设 ✓ | 上一轮 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ 缺口 ④ 的进度 ✓**：⭐ ① ⭐ 名字 ✓ **完成** ✓｜⭐ ② ⭐ 流派播种 ✓ **完成** ✓｜⭐ ③ ⭐ `swing` ✗｜⭐ ④ ⭐ `resolution` ✗
**⭐ 新增判据 ✓**：`src/test/arrangementSeeding.test.ts` ✓（3 例 ✓；⭐ 基线**在用例内量出** ✓ 而非假设 ✓）
**⭐ 读数 ✓**：⭐ `check:mcp` **0** ✓｜⭐ 十一道门 **0** ✓｜⭐ 双文档门 **0** ✓

## 2026-10-06 03:56 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ **`add_section` 退场** ✓ ⇒ 工具 **87 ⇒ 86** ✓；⭐ 它的三项能力**由音符级工具承载** ✓（⭐ 见 §553 的判据 ✓）；⭐ 便利工具另记 `needs` ✓ | 本轮 ✓ |
| ⭐ **系统／数据** | ✅ ⭐ **§537 五处缺口全部结案** ✓：⭐ ⑤ `maxDurationSec` ✓／⭐ ④ `swing`＋`resolution` ✓／⭐ ①②③ 力度斜坡＋`fill`＋移调 ✓ | 本轮 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ 触及 5 个文件 ✓**：⭐ `mcp/registrySong.ts` ✓（⭐ 工具块 187–240 ✓）｜⭐ `scripts/check_mcp.mjs` ✓（⭐ 清单 ＋ ⭐ 删三条用例 825–870 ✓ ＋ ⭐ 注释 ✓）｜
  `src/test/docsWorkflow.test.ts` ✓（⭐ `STEPS` ⇒ `add_arrangement_track` ✓）｜⭐ `src/test/mcpCapability.test.ts` ✓（⭐ 两处 ⇒ v2 ✓）｜
  ⭐ a copy criterion for `add_section` that was deleted with the tool (its subject ceased; the three abilities it asserted now have arrangement criteria) ✓（⭐ **删除** ✓，⭐ `rm` ✓）
**⭐ 判据读数 ✓**：⭐ `check:mcp` **86 tools** ✓｜⭐ 十一道门 0 ✓｜⭐ 相关判据全过 ✓｜⭐ 文档双门 0 ✓
**⭐ 因此 ✓**：⭐ ⑤ 的**暂留三个**里 `add_section` 已完成 ✓ ⇒ ⭐ 剩 `create_song` ✗ 与 `render_song` ✗ ⇒ ⭐ **两者合并一次收尾** ✓

## 2026-10-06 04:09 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ **`render_song` 的工具块退场** ✓ ⇒ 工具 **86 ⇒ 85** ✓；⭐ 它的**调用点与判据**上一轮已清 ✓ ⇒ 本轮只剩块本身 ✓ | 本轮 ✓ |
| ⭐ **系统／数据** | ✅ ⭐ 两个**地板**同批改成 ⭐ `> 80` ✓（⭐ 跟登记表留余量 ✓，⭐ 不写死到临界 ✓） | 本轮 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ `mcp/registrySong.ts` 现在只剩 3 个工具 ✓**：⭐ `set_arrangement_vocal_melody` ✓／⭐ `synthesize_vocal` ✓／⭐ `create_song` ✓
**⭐ 判据读数 ✓**：⭐ `check:mcp` **85 tools** ✓｜⭐ 十一道门 0 ✓｜⭐ 地板判据 0 ✓｜⭐ 文档双门 0 ✓

## 2026-10-06 04:37 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面** | ✅ ⭐ **`create_song` 退场** ✓ ⇒ 工具 **85 ⇒ 84** ✓；⭐ `registrySong.ts` 只剩 ⭐ **`set_arrangement_vocal_melody`** ✓ 与 ⭐ **`synthesize_vocal`** ✓；⭐ 该文件从 ⭐ **11 个工具**降到 ⭐ **2 个** ✓ | 本轮 ✓ |
| ⭐ **系统／数据** | ✅ ⭐ `get_transposition_report` **改为只读 pattern 的 lane** ✓ —— ⭐ 去掉段落半 ✓（⭐ 依 §568 的决定 ✓）；⭐ 六个缺口**全部结案或已定** ✓ | 上一轮 ✓ |
| ⭐ **Web 面** | **无变化** ✓ | — |

**⭐ ⑤ 的状态 ✓**：⭐ **九个待退工具全部退场** ✓（⭐ `set_lane_slots` ✓／⭐ `duplicate_section` ✓／⭐ `set_tempo` ✓／
  `set_clip` ✓／⭐ `get_song` ✓／⭐ `undo_song` ✓／⭐ `render_audio` ✓／⭐ `render_preview_clip` ✓／⭐ `add_section` ✓／
  `render_song` ✓／⭐ **`create_song`** ✓）⇒ ⭐ **⑤ 的退场阶段完成** ✓ ✓
**⭐ 判据读数 ✓**：⭐ `check:mcp` **84 tools** ✓｜⭐ 十一道门 0 ✓｜⭐ 地板判据 0 ✓｜⭐ 文档双门 0 ✓
**⭐ 注 ✓**：⭐ 若 ⭐ **`registrySong.ts` 只剩 2 个工具** ✗ ⇒ ⚠️ ⭐ 可考虑**并入编曲侧** ✓（⭐ 记为下一步的整理项 ✓）

## 2026-10-06 07:15 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **Web 面** | ✅ ⭐ **保存状态的来源迁到编曲存储** ✓：⭐ `projectDb` 新增 ⭐ `ArrangementSaveStatus` ✓ ＋ ⭐ 发布／订阅／快照 ✓ ＋ ⭐ **三处通知**（⭐ 开始／成功／失败 ✓）；⭐ `useAutosaveStatus` ✓ 与 ⭐ `SaveIndicator` ✓ 改听新存储 ✓ | 本轮 ✓ |
| ⭐ **系统／数据** | ✅ ⭐ 且 ⭐ **失败路径不会谎报已保存** ✓（⭐ `"saved"` 在 ⭐ `try` 内 ✓，⭐ `"failed"` 在 ⭐ `catch` 首行 ✓） | 本轮 ✓ |
| ⭐ **MCP 面** | **无变化** ✓ | — |

## 2026-10-06 07:23 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **系统／判据** | ✅ ⭐ 三处陈旧基线按**实测**更新 ✓：⭐ 描述数下限 **90 ⇒ 80** ✓（⭐ 工具 84 ✓）｜⭐ 文件桶 1500 行 **11 ⇒ 12** ✓｜⭐ 小节上限的工具断言**随 `add_section` 退场** ✓（⭐ 只留陈旧 prose 守卫 ✓） | 本节 ✓ |
| ⭐ **缺口** | ⚠️ ⭐ **v2 编曲没有小节上限** ✗（⭐ v1 的 `MAX_SONG_BARS` 2048 ✓ 由模型强制 ✓ ⇒ ⭐ v2 的 `set_arrangement_bars` 无 `max()` ✓）⇒ ⭐ 已登记 ✓ | 本节 ✓ |
| ⭐ **MCP 面** | **无变化** ✓（⭐ 84 tools ✓） | — |

## 2026-10-06 07:35 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP 面（判据）** | ✅ ⭐ Node 主机的渲染判据改接 **`render_arrangement`** ✓（⭐ 原为已退场的 `render_song` ✗）；⭐ 两处**幅度**断言 ⇒ **接线**断言 ✓（⭐ 空编曲是静音 ✓，⭐ 幅度由真渲染判据覆盖 ✓） | 本节 ✓ |
| ⭐ **本地已知条件** | ⚠️ ⭐ `sfzTrigger` 的取样文件获取在**本地**失败 ✓（⭐ 与迁移无关 ✓，⭐ CI 无此项 ✓） | 本节 ✓ |
| ⭐ **系统／判据** | ✅ ⭐ 推前跑**全套** `npx vitest run` ✓（⭐ 十一道门不含它 ✗） | 本节 ✓ |

## 2026-10-06 07:50 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **Web 面** | ✅ ⭐ `SaveIndicator` **自带状态形状** ✓ ⇒ ⭐ 不再 import v1 存储 ✓（⭐ v1 存储的非判据消费者 **4 ⇒ 3** ✓） | 本节 ✓ |
| ⭐ **判据** | ✅ ⭐ CI **转绿** ✓（⭐ 三处陈旧基线按实测更新 ✓） | 本节 ✓ |

## 2026-10-06 07:59 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **Web 面（计划）** | ⭐ 查明 ⑦ 主体 ✓：⭐ v1 音序器 store 有 **24 个消费者** ✗，⭐ v2 编曲 store 只管**工程生命周期** ✓ ⇒ ⭐ 需把音序器**移植为编曲的视图** ✓（⭐ 模型注释：⭐ "the grid is a view, not a model field" ✓） | 本节 ✓ |
| ⭐ **工作流** | ⭐ **⑦-A** 收 3 个 v1 存储消费者 ✓｜⭐ **⑦-B** 音序器 ⇒ 编曲视图 ✓（⭐ 先立判据 ✓）｜⭐ **⑦-C** v1 类型与层退场 ✓ | 本节 ✓ |

## 2026-10-06 08:00 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **Web 面** | ✅ ⭐ `clear_saved` 改接 **`clearSavedArrangementProject`** ✓ ⇒ ⭐ v1 存储消费者 **4 ⇒ 2** ✓ | 本节 ✓ |
| ⭐ **待办** | ⭐ `useProjectHub` 的 `saveProjectImmediate`（⭐ 传 v1 字段 ✗）⇒ ⭐ 改用编曲保存 ✓ | 本节 ✓ |

## 2026-10-06 08:10 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **Web 面** | ✅ ⭐ `useProjectHub` 的草稿快照 ⇒ **编曲指针** ✓（⭐ `setSavedArrangementProject` ✓）⇒ ⭐ v1 存储消费者 **3 ⇒ 1** ✓，⭐ 只剩 v1 store 本身 ✓ | 本节 ✓ |
| ⭐ **盘点** | ⚠️ ⭐ `GrooveProject`（⭐ `src/types/project.ts` ✓）仍为 **v1 形状** ✗（⭐ `patterns A/B` ✓／`activeSlot` ✗／`songChain` ✗／`sections` ✗）⇒ ⭐ 归 ⑦-C ✓ | 本节 ✓ |

## 2026-10-06 08:36 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **Web 面（能力盘点）** | ⭐ 音序器 **55 个动作** ✓：⭐ **50 个模型中立** ⇒ 译到编曲 ✓；⭐ **5 个 v1 专有** ✗（⭐ 槽位 ×2 ✓／段落与歌曲链与歌曲模式 ×3 ✓）⇒ ⭐ **被编曲模型吸收** ✓（⭐ 编曲本身即线性 ⇒ 歌曲模式恒真 ✓），**不删除** ✓ | 本节 ✓ |

## 2026-10-06 08:37 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **Web 面（盘点）** | ⚠️ ⭐ **两个工作室并存** ✗：⭐ `StudioView` 渲染 v1 的 `SequencerPanel`＋`ArrangementPanel` ✓；⭐ v2 的 `ArrangementViewV2` 由 `App`／`NewProjectView` 渲染 ✓ ⇒ ⭐ 与业主硬约束 ②"不要新老并存"**直接冲突** ✗ ⇒ ⭐ ⑦-B 目标改为**合二为一** ✓ | 本节 ✓ |
| ⭐ **能力** | ✅ ⭐ v2 侧已有网格（`PianoRollV2` ✓）／轨 ✓／标尺 ✓／takes ✓／乐谱 ✓ ⇒ ⭐ 缺口**应为小** ✓，⭐ 须逐项量 ✓ | 本节 ✓ |

## 2026-10-06 08:38 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **Web 面（路由）** | ⭐ 两套界面 ＝ **两条路由** ✓：⭐ `/`（v1 工作室：`SequencerPanel` 常驻 ＋ `ArrangementPanel` 开关 ✓）｜⭐ `/new`（v2：`ArrangementViewV2` ＋ `store.create` ✓）⇒ ⭐ 合成点明确 ✓ | 本节 ✓ |
| ⭐ **待查能力** | ⚠️ ⭐ **流派驱动生成** ✓：⭐ v2 路由自称"deliberately has no genre" ✗，⭐ 但 `create_arrangement` 收 `genreId` ✓ ⇒ ⭐ 待量 `NewProjectPanelV2`／模板 ✓ | 本节 ✓ |

## 2026-10-06 08:39 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **能力差（Web）** | ⚠️ ⭐ v2 新建＝**模板驱动**（4 模板 ＋ 通用起始音符 ✓），⭐ **无流派驱动** ✗；⭐ 但流派能力已在 MCP（`create_arrangement` 收 `genreId` ✓）与 Web 助手（`genreVoicing`／`genreGroove`／`genreExpression`／`genreInsert`／`genreFx` ✓）⇒ ⭐ 缺**入口与调用** ✓ | 本节 ✓ |

## 2026-10-06 08:40 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP／Web 对齐** | ✅ ⭐ 流派播种**已实现** ✓（⭐ `createMcpArrangement` 的流派分支 ✓：`projectSongToV2({ id, clips: { A: patternFromGenre(genre) } })` ✓）⇒ ⭐ **Web 只需同样两句** ✓ ⇒ ⭐ 落地时抽**共享助手** ✓ 以保三方同源 ✓ | 本节 ✓ |
| ⭐ **待办** | ⭐ 先立判据（⭐ 能红 ✓）⇒ ⭐ 再给 v2 新建面板加**流派入口** ✓ ⇒ ⭐ 然后关 `/` 老路 ✓ | 本节 ✓ |

## 2026-10-06 08:41 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **判据（先立）** | ✅ ⭐ 新判据已立并**证明能红** ✓：⭐ "**offers a genre, so a project can start from the music rather than only from a template**" ✓ ⇒ ⭐ 红文：⭐ `Unable to find an element by: [data-testid="genre-chicago-house"]` ✗ ⇒ ⭐ 回退保持树绿 ✓ | 本节 ✓ |
| ⭐ **待实现** | ⭐ 面板加**流派选择** ＋ ⭐ 创建时走 `patternFromGenre` ⇒ `projectSongToV2` ✓（⭐ 优先共享助手 ✓） | 本节 ✓ |

## 2026-10-06 08:42 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **教训** | ⚠️ ⭐ 嵌套括号的调用不能用扁平正则改 ✓（⭐ 计数为 1 不等于改得对 ✓ ⇒ ⭐ 靠 `tsc` 兜底 ✓） | 本节 ✓ |
| ⭐ **待落** | ⭐ 面板流派选择 ＋ 判据（⭐ 已写就 ✓）＋ ⭐ 调用点按**收尾行**补第四参 ✓ | 本节 ✓ |

## 2026-10-06 08:44 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **教训 186** | ⚠️ ⭐ 不能假设表达式的形状 ✓（⭐ `name.trim()` 之后是 ` || ` ✗ 不是 `)` ✓）⇒ ⭐ **数括号**或**打印整行** ✓ | 本节 ✓ |
| ⭐ **纪律** | ⚠️ ⭐ 改**调用签名**时，⭐ **必须同时检查所有既有断言** ✓（⭐ `toHaveBeenCalledWith` **逐参比对** ✓ ⇒ ⭐ 加第 4 参会让旧例红 ✓） | 本节 ✓ |

## 2026-10-06 08:47 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **Web 面** | ✅ ⭐ v2 新建面板**提供流派选择** ✓（⭐ 从 `GENRES_MAP` ✓，⭐ `onCreate` 第四参上报 ✓）⇒ ⭐ v1 工作室招牌能力的**入口**已到 v2 路由 ✓ | 本节 ✓ |
| ⭐ **教训 187** | ⚠️ ⭐ 改**调用元数**牵动**该文件全部** `toHaveBeenCalledWith` ✓（⭐ 逐参比对 ✓）⇒ ⭐ 先 `grep` 再**一次补齐** ✓ | 本节 ✓ |
| ⭐ **待办** | ⭐ 流派**尚未被使用** ✗ ⇒ ⭐ 立"按流派创建 ⇒ 带该流派音符"的判据（先红 ✓）⇒ ⭐ 视图接线 ✓ | 本节 ✓ |

## 2026-10-06 08:58 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **判据（先立）** | ✅ ⭐ 能力判据已立并**证明能红** ✓：⭐ 红文 ⭐ `expected [ 'Synth' ] to deeply equal [ 'Kick Drum', 'Snare / Clap', …(6) ]` ✗ ⇒ ⭐ 点流派＋创建**现在只给空白默认** ✓ ⇒ ⭐ 已回退保持树绿 ✓ | 本节 ✓ |
| ⭐ **待实现** | ⭐ `ArrangementViewV2` 的创建分支收 `genreId` ⇒ ⭐ 走 `patternFromGenre` ⇒ `projectSongToV2` ✓（⭐ 否则原路径不变 ✓） | 本节 ✓ |

## 2026-10-06 09:02 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **Web 面** | ✅ ⭐ **按流派创建已生效** ✓：⭐ v2 新建路径选流派 ⇒ ⭐ 编曲由该流派的编配模式投影而成 ✓（⭐ 与协议创建者同两步 ✓）；⭐ 未选流派 ⇒ ⭐ 模板路径不变 ✓ | 本节 ✓ |
| ⭐ **判据** | ✅ ⭐ 能力判据全过 ✓（⭐ 并记：⭐ `notesByTrack` 无音符时**省略** ✓ ⇒ ⭐ 读法统一为 `?? {}` ✓） | 本节 ✓ |
| ⭐ **待办** | ⭐ 抽共享助手（MCP／Web 同源）⇒ ⭐ 关 `/` 老路 ⇒ ⭐ ⑦-C 退场 | 本节 ✓ |

## 2026-10-06 09:15 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **MCP／Web 对齐** | ✅ ⭐ **流派 ⇒ 编曲 只有一处实现** ✓：⭐ `arrangementSeededFromGenre` ✓（`data/arrangementProjection` ✓）⇒ ⭐ MCP 与 Web **同用** ✓ ⇒ ⭐ 三方对齐落点 ✓ | 本节 ✓ |
| ⭐ **待办** | ⭐ 关 `/` 老路 ⇒ ⭐ ⑦-C 退场（v1 store／`types/song.ts`／`songEdit.ts`／`projectStorage` ＋ 其判据）⇒ ⭐ 发布 | 本节 ✓ |

## 2026-10-06 09:41 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **收尾计划** | ⭐ 三个锚点 ✓：⭐ `App.tsx:362`（v1 路由 ✓）｜⭐ `StudioView.tsx` **1477 行** ✗（`SequencerPanel` ✓／`ArrangementPanel` ✓）｜⭐ 其依赖（v1 store／`types/song.ts`／`songEdit.ts`／`projectStorage` ✓）⇒ ⭐ 按**能力清单法**逐项搬 ✓ | 本节 ✓ |
| ⭐ **下一阶段** | ⭐ 2.35.0 发布后：⭐ 量四指标 × 八环节 ⇒ ⭐ 大头先优化 ✓（⭐ §613 ✓） | §613 ✓ |

## 2026-10-06 09:42 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **方法（教训 188）** | ⚠️ ⭐ **testid 差集量名字，不量能力** ✗ ⇒ ⭐ 改按**能力**比 ✓，⭐ 并**跨整个 v2 路由**查 ✓（⭐ 有些能力住在编曲层 ✓） | 本节 ✓ |
| ⭐ **缺口清单（首份）** | ⚠️ ⭐ v2 网格缺：⭐ **力度斜坡**／**量化**／**人性化**／**和弦图章**／**琶音**／**连奏**／**复制粘贴**／**区间预览**／**录音** ✗；⭐ 吸附／缩放／循环**已在编曲层** ✓；⭐ 力度／移调／选择／音阶**已有** ✓ | 本节 ✓ |

## 2026-10-06 09:42 回填（第 4 条规矩：改完实现回来改表）

| 面 | 变化 | 依据 |
|---|---|---|
| ⭐ **缺口清单（补全）** | ⚠️ ⭐ 真缺 **10** ✓：⭐ 量化／力度斜坡／选择框／复制粘贴／连奏／琶音／和弦图章／全屏全范围／行高／（网格内人性化 ✓）；⭐ 已有 **18** ✓ ⇒ ⭐ 移植次序四档 ✓ | 本节 ✓ |
| ⭐ **教训 189** | ⚠️ ⭐ v2 目录树里**仍有 v1 文件** ✗（`ArrangementPanel` ✓／`TrackRows` ✓）⇒ ⭐ 扫描必须**列命中文件并确认所属侧** ✓ | 本节 ✓ |

