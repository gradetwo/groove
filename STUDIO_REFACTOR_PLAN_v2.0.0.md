# GROOVE LAB · 工作台（Studio）操作 / 交互 / UI / 功能 与模块联动 重构规划

> **规划对象**：`src/views/StudioView.tsx` 及其子系统（`src/components/sequencer/`、`src/features/sequencer/`、`src/components/console/`）
> **当前基线**：v1.16.20（`package.json` = 1.16.20，`public/changelog.json` 62 条发布记录）
> **目标版本**：v2.0.0 → v2.0.12（小步递增，每个里程碑独立可发布）
> **版本口径**：`package.json` 在**首个里程碑（v2.0.0 = S0 布局偏好持久化）完成并通过门禁时**才提升到 2.0.0；在那之前应用版本仍是 1.16.20，避免出现「2.0.0 已声明但功能未交付」的空窗。
> **方法**：静态审阅 + **本机 DOM 实测**（隔离端口 `vite --port 5199` + Playwright 读 `getBoundingClientRect()` / `querySelectorAll` 计数）
> **结论可复核性**：本文每个数字均为本机实测，命令与原始输出见 [§11](#11-附本次审查的原始实测证据)；每个问题均带 `file:line`
> **明确排除**：本文**不含**任何无障碍专项（对照 WCAG 的焦点环 / ARIA / 对比度 / 字号 / 触控目标等）与任何 WebRTC / 局域网互联（"互弹"）工作项，两者的归属与理由见 [§10](#10-建议不做含理由)。

---

## 0. 摘要（TL;DR）

**一句话结论**：工作台"能干的活"已经齐了（8 轨矩阵 / 力度泳道 / 欧几里得 / P-Lock / 双 Pattern 槽 / 盲测 / 导出 5 格式 / 调音台 / 分享），但"把活干顺手"这一层从没被设计过——工具栏在 1440×900 上占 **173 px**、在 390×844 手机上占 **395 px**（视口的 47%）；**33 个控件**平铺在一行 `flex-wrap` 里；8 条轨道在 1280×800 上只有 **3 条**落在首屏；而真正该被折叠的低频项（导出 / 分享 / 触感 / FX 开关 / 快速工具）与高频项（播放 / 撤销 / 力度 / 欧几里得）享受同等待遇。

三个立刻可动的结论：

1. **不缺口子，缺"折叠"**：`showAdvancedControls` 抽屉（`Toolbar.tsx:1094-1304`）已经证明团队会做渐进披露，而且做得不错（折叠态按钮上带 `{swing}%` 徽标，`Toolbar.tsx:1108-1112`）。要做的是把这一条已验证的模式从"1 个抽屉"推广成"**3 级频率分层**"，而不是重写。
2. **最大的空间浪费不是控件数量，而是抽屉的占位方式**：抽屉展开固定吃掉 **88 px**，比一条轨道行（实测 **85 px**）还高——它在最需要看轨道的时候把轨道推下去。同一条抽屉改成浮层，展开它就不再吃掉第 5 条轨道；再把一级行压成一行，`1440×900` 的首屏轨行可从 5 条增到 6 条。
3. **模块之间目前不是"联动"，是"各开各的店"**：`StudioView`、`HardwareConsoleView`、`CompareView` 各自 `new AudioEngine()`（`StudioView.tsx:146`、`HardwareConsoleView.tsx:59,124`、`CompareView.tsx:95,239`），各自 `useSequencerStore()`（无 Provider，`useSequencerStore.ts:189`），跨模块传递只有 `groove_project_v1` 这个 localStorage 快照（`projectStorage.ts:7`）且在 `saved.genreId === genre.id` 时才恢复（`useSequencerStore.ts:194`）——**工作台里调好的 pattern，切到调音台后按曲风默认值重新开始**。

### 0.1 健康度基线（本机实测，2026-09-15，基线 v1.16.16）

| 项目 | 实测结果 | 判定 |
|---|---|---|
| `npm run docs:check` | 7/7 ✅（本次新增文档不进入该门禁的校验集，见 §11.3） | ✅ |
| `npm run typecheck` | 0 error | ✅ |
| 测试规模 | `src/**/*.test.ts(x)` **63 个文件 / 535 用例**（发布 v1.16.16 时全量实测，全绿） | ✅ |
| `src/` 体量 | **247 个 TS/TSX 文件、145,675 行**（口径 = 递归 `src/**.tsx?`，与 `scripts/check_docs.mjs` 的 `countSources` 一致） | — |
| 工作台子系统体量 | `components/sequencer` + `features/sequencer` + `components/console` = **41 个文件 / 10,897 行** | ⚠️ 占 `src/` 7.5% |
| 工作台最大单文件 | `Toolbar.tsx` **1307 行**、`ProjectHubModal.tsx` 991、`PitchPickerModal.tsx` 660 | ⚠️ |
| 工作台布局偏好持久化 | 5 个开关（侧栏/最大化/力度/分析仪/高级抽屉）**全部是会话态，0 处持久化** | ❌ |
| `SequencerPanel` props 数 | **112 个**（AST 计数） | ❌ |
| `TrackRow` props 数 | **28 个**（AST 计数） | ⚠️ |
| 工具栏常显可交互控件 | **33 个**（25 `button` + 6 `select` + 2 `input`），另有抽屉内 14 个 | ❌ |
| 工具栏高度（1440×900 / 1280×800 / 1024×768 / 390×844） | **173 / 213 / 293 / 395 px** | ❌ |
| 首屏可见轨行数（同上四档） | **5 / 3 / 2 / 2**（共 8 轨；轨行高 85 px，手机 76 px） | ❌ |
| FX 机架参数可达性 | 引擎支持 7 个参数，UI **只暴露 4 个 on/off**，7 个参数全仓 **0 个写入点** | ❌ |
| 跨模块状态共享 | 无实时共享；仅 localStorage 快照 + 同曲风条件下恢复 | ❌ |
| 已有的自适应机制 | `@media (max-height:500px) and (orientation:landscape)` 下控件压到 28 px、隐藏侧栏（`index.css:239-269`） | ✅ 可复用 |

> 注：上表体量类数字（文件/行数）为**某一时刻**的实测。审查期间 `src/` 正被三个并行工作树修改（`docs:check` 的实测值在同一次会话内从 145,021 漂到 145,675 行），上表已按 **v1.16.16 发布时**的实测值回填；**交互/像素类数字（§3.1）不受影响**，体量类数字引用前请复测。

### 0.2 六条改进主线

| 主线 | 核心内容 | 解决什么 |
|---|---|---|
| **① 布局偏好持久化**（D） | 侧栏/最大化/力度/分析仪/高级抽屉 + 密度档位写入 localStorage，带版本与迁移 | "每次刷新都要重新收起侧栏、重新打开力度条" |
| **② 折叠优先的信息架构**（C） | 把 33 个常显控件按"是否有单键快捷键 + 是否演奏中会用"分 3 级；低频进"更多"面板与浮层抽屉 | 1440 宽上工具栏 173 → ≤ 56 px；1280×800 首屏轨行 3 → ≥ 5 |
| **③ 模块联动**（L） | 工作台 ↔ 调音台 ↔ 分析仪 ↔ 底鼓设计 ↔ 曲风详情/对比：明确**共享态**与**隔离态**，用 1 条事件总线替代 ad-hoc `window` 事件 | "切页面就丢工作"、"底鼓做完了工作台看不见" |
| **④ 浮窗控制台**（X） | 把调音台从"独立页面"变成"可在工作台上浮出的面板"，复用 `components/console/*` | 分轨混音时必须离开工作台，看不见 pattern |
| **⑤ 死控件与参数补全**（D-05 / C-07） | FX 机架 7 个参数接出 UI；`Groove v1.7.0` 陈旧版本串；硬编码 `159` | "按钮按下去只有开关，拧不动" |
| **⑥ 门禁与测试**（G） | 为"常显控件数 / 工具栏高度 / 偏好持久化 / FX 参数可达性"加可失败的自动化断言 | 让本次重构不会在下一个版本腐化回去 |

### 0.3 与 `CODE_REVIEW_AND_PLAN_v1.16.0.md` 的关系

- 本文是**独立新文档**，ID 命名空间（`D-` / `C-` / `L-` / `X-` / `G-`）与 v1.16.0 的 `F-` / `A-` / `E-` / `U-` / `N-` **不重叠**，两份文档可同时引用。
- v1.16.0 的 `F-01…F-10`（正确性/数据安全）、`A-01…A-08`（性能架构）、`E-01…E-13`（工程化门禁）、`U-03/08/09/10/11`（非无障碍体验项）、`N-01/02/04…08`（功能补全）**均已实施完毕**（见该文档 §9.5 与 v1.16.1–v1.16.16 的 58 条 changelog）。本文不重复这些条目。
- v1.16.0 明确排除的无障碍项（`U-01/02/04/05/06/07`）与 WebRTC 局域网 `N-03`，本文**同样排除**，并给出理由（§10）。

---

## 1. 审查范围与实测方法

### 1.1 范围

| 层 | 文件 |
|---|---|
| 工作台容器 | `src/views/StudioView.tsx`(658)、`src/App.tsx`(533) |
| 音序器组件 | `src/components/sequencer/*`：`Toolbar.tsx`(1307)、`ProjectHubModal.tsx`(991)、`PitchPickerModal.tsx`(660)、`SequencerPanel.tsx`(507)、`VelocityLane.tsx`(466)、`TrackRow.tsx`(322)、`EuclideanModal.tsx`(284)、`InfoDossier.tsx`(227)、`StepCell.tsx`(217)、`SequencerModals.tsx`(159)、`Ruler.tsx`(145)、`StepContextMenu.tsx`(134)、`GenreRail.tsx`(108)、`ToastBanner.tsx`(22)、`trackConfig.ts`(17) |
| 工作台 hooks | `src/features/sequencer/hooks/*`（**18 个文件，全部被 `StudioView` 调用**，含 `usePanelToggles.ts`(70)、`useAudioEngineLifecycle.ts`(295)、`useGridInteraction.ts`(291)、`useExportActions.ts`(285)、`useGenreSwitching.ts`(269)） |
| 状态与持久化 | `src/features/sequencer/useSequencerStore.ts`(1102)、`projectStorage.ts`、`projectDb.ts` |
| 邻接模块 | `src/views/HardwareConsoleView.tsx`(436)、`AnalyzerView.tsx`(397)、`KickAnatomyView.tsx`(274)、`GenreDetailView.tsx`(1114)、`CompareView.tsx`(1746)；`src/components/console/*`（`ChannelStrip`、`MasterStrip`、`ConsoleMeter`、`meterMath`、`trackVisuals`） |
| 音频设施 | `src/audio/AudioEngine.ts`、`EffectsRack.ts`、`trackStates.ts`、`ecosystemBus.ts` |
| 样式/自适应 | `src/index.css:239-269`（`landscape-*`）、`tailwind.config.js` |

### 1.2 实测方法

- **体量与计数**：`find`/`wc -l`；props 数用 Node 读取 `interface XxxProps { … }` 后按 `字段:` 行计数（口径 = 接口声明字段数，不展开 `React.FC` 泛型）。
- **DOM 实测**（本文最有价值的部分）：`npx vite --port 5199 --strictPort` 起隔离 dev server，Playwright Chromium 打开 `?tab=studio`，等 `div.landscape-compact-bar` 出现后 `waitForTimeout(1500)`，再在页面内执行：
  - `bar.querySelectorAll("button, select, input").length` → 常显控件数；
  - `getBoundingClientRect().height` → 工具栏/抽屉/轨行高度；
  - `[class*='track-row-']` 过滤 `track-row-\d` → 轨行，`bottom <= innerHeight` 计为"首屏完整可见"；
  - 点击标题含 `Advanced/高级` 的按钮后重测 → 抽屉展开开销；
  - 四档视口：`1440×900`、`1280×800`、`1024×768`、`390×844`；调音台另测 `?tab=console`。
- **可达性核对**：对 `filterCutoff` / `filterQ` / `filterType` / `saturationDrive` / `chorusMix` / `chorusRate` / `bitDepth` 全仓 grep，**只统计读点与写点**（排除 `src/audio/EffectsRack.ts`、`AudioEngine.ts`、`PolySynth.ts` 与测试）。
- **门禁核对**：读 `scripts/check_docs.mjs`（`PLANNING_DOCS` 只含 3 个文件）与 `scripts/redlines.mjs`（R4/R5/R8 均不扫描根目录 `.md`），确认新增文档是否可能破坏门禁。

### 1.3 明确排除项

本文**不含**：① 任何无障碍专项工作（焦点环、ARIA、对比度、字号、触控目标尺寸、canvas 文本替代、键盘可达性审计）；② 任何 WebRTC / 局域网 / 跨端"互弹"能力（含 `src/audio/ecosystemBus.ts` 的跨源 `BroadcastChannel` 能力扩展）。理由与边界见 §10。

---

## 2. 现状架构地图（工作台）

### 2.1 体量分布（实测）

| 单位 | 行数 | 说明 |
|---|---:|---|
| `components/sequencer/Toolbar.tsx` | 1307 | 工作台最大文件；已拆出 `MeterControls`(117-246)、`PatternSlotControls`(248-355)、`ExportMenu`(357-…)，三者均 `memo` |
| `views/StudioView.tsx` | 658 | A-02 后已是薄容器：`hooks/` 下全部 18 个 hook + `useSequencerStore` + `useLanguage`，另渲染 12 个懒加载兄弟视图 |
| `components/sequencer/ProjectHubModal.tsx` | 991 | 单文件承载工程库 |
| `components/sequencer/PitchPickerModal.tsx` | 660 | |
| `components/sequencer/SequencerPanel.tsx` | 507 | **112 props** 的布局容器 |
| `features/sequencer/hooks/useAudioEngineLifecycle.ts` | 295 | 引擎生命周期 + FX 参数同步 |
| 工作台子系统合计 | **10,897** | `src/` 共 145,675 行（占 7.5%） |

### 2.2 组件与数据流（现状）

```
App.tsx (路由/懒加载, 533)
  └─ StudioView.tsx (658)                      ← useSequencerStore() 实例 #1
       ├─ 18 × features/sequencer/hooks/*
       ├─ useRef<AudioEngine>  (StudioView.tsx:146)   ← AudioEngine 实例 #1
       │    └─ onAudioEngineReady → App.handleEngineReady (App.tsx:148)
       │         └─ engineInstance → AnalyzerView.externalAnalyser (App.tsx:272-274)
       ├─ GenreRail (108)          ← 只吃 GENRE_INDEX 轻量元数据（A-01 的成果）
       ├─ InfoDossier (227)        ← 352px 固定侧栏（StudioView.tsx:487）
       └─ SequencerPanel (507)     ← 112 props
            ├─ Toolbar (1307)      ← 76 props（ToolbarProps, Toolbar.tsx:38-114）
            ├─ Ruler (145)
            ├─ TrackRow (322) × 8  ← 28 props / 轨，轨内 12 个可交互控件
            ├─ VelocityLane (466)
            └─ MasterAnalyzerSuite
       └─ SequencerModals (159) → EuclideanModal / PitchPickerModal / ProjectHubModal
```

**关键事实**：`useSequencerStore` **不是** Context，是每个调用点各自的 `useReducer`（`useSequencerStore.ts` 全文无 `createContext`）。因此工作台、调音台、对比视图各持一份互不感知的 pattern 副本。

### 2.3 已有的折叠 / 自适应机制（**这些是资产，不要推倒**）

| 机制 | 位置 | 现状 |
|---|---|---|
| 高级设置抽屉 | `Toolbar.tsx:1094-1304` | 默认折叠；展开后 88 px、内含 6 个簇 14 个控件（摇摆 / 精细步数 / FX 机架 / 触感 / 平移导航） |
| 抽屉按钮上的状态徽标 | `Toolbar.tsx:1108-1112` | 折叠时若 `swing > 0` 显示 `{swing}%` —— **正确的渐进披露示范** |
| 条件渲染 | `Toolbar.tsx:819`（bar>1 才出小节选择）、`Toolbar.tsx:757`（有自定义底鼓才出 optgroup） | 已经有"不需要就不出现" |
| 响应式标签降级 | `hidden sm:inline` / `md:` / `lg:` / `xl:` / `2xl:inline` 大量使用 | 实测 1440 仅 1 个标签被隐藏，1024 有 6 个，390 有 **16 个** → 降级是**标签隐藏**而非**控件收纳**，控件本体仍全部占位 |
| 手机横屏紧凑模式 | `index.css:239-269` | `max-height:500px + landscape` 下控件压到 28 px、隐藏侧栏、格高 1.85rem |
| 侧栏 / 最大化 | `StudioView.tsx:107-108,487-502` | `isSidebarCollapsed || isEditorMaximized` → 单列；最大化时隐藏分享按钮（`Toolbar.tsx:1082`） |
| 记忆化 | `Toolbar`/`MeterControls`/`PatternSlotControls`/`ExportMenu`/`TrackRow`/`StepCell`/`GenreRail` 均 `memo` | A-03 已落地，并有 `sequencerMemo.test.tsx` 的**渲染探针**守护 |

### 2.4 模块联动现状（**问题最集中处**）

| 通道 | 位置 | 共享什么 | 问题 |
|---|---|---|---|
| `onAudioEngineReady` | `StudioView.tsx:50` → `App.tsx:148-160` | 把工作台的 `AudioEngine` 实例交给 App，再转给 `AnalyzerView`（`App.tsx:272-274`） | 只在工作台已挂载过时有效；卸载时 `setEngineInstance(null)` → 分析仪退回自测信号 |
| `groove_project_v1` 快照 | `projectStorage.ts:7`、`useSequencerStore.ts:190-220` | pattern A/B、bpm、swing、拍号、分辨率、步数、songMode、loop、节拍器/预备拍 | **只在挂载时读一次**，且仅当 `saved.genreId === genre.id`；两个视图共用同一 key，**后写覆盖先写** |
| `groove_kick_presets_changed` | 派发 `AnatomyKickEngine.ts:88,104`；监听 `Toolbar.tsx:580-586`、`kick/SomaticControls.tsx:57` | 底鼓设计器存了新预设 → 工作台鼓机下拉实时刷新 | 这是**唯一做对的自定义事件**，但只同步"预设清单"，不同步"当前正在编辑的底鼓" |
| `groove_custom_genres_changed` | 派发 `customGenreDb.ts:57`；监听 `useCustomGenres.ts:36` | 自定义曲风清单 | 正常 |
| `ecosystemBus`（BroadcastChannel） | `audio/ecosystemBus.ts`；`AudioEngine.ts:681,905,938,1274`、`AnatomyKickEngine.ts:401`、`kick/GravitationalSequencer.tsx` | 跨窗口/跨源时钟与瞬态 | **属于被排除的跨端互联范畴**（§10）；但注意 `AudioEngine.setBpm` 也在其上发消息 |
| 路由外链 | `App.tsx:206-219` | 工作台只能向外推 **genre id**：`onSelectGenre` / `onViewDetail` / `onAddToCompare` / `onOpenGenreMaker` | **无法把当前 pattern / 当前底鼓 / 当前混音推给别的模块** |
| 反向入口 | `App.tsx:240-248` | 和弦视图可把 `initialChords` / `initialArpeggio` 推进工作台；`MasterclassView` 推 `initialMasterclassPattern` | 已实现"一次性注入 + 清空回调"模式，可作为通用"跨模块载荷"的样板 |

---

## 3. 实测证据：空间与操作成本

### 3.1 工具栏在每个视口吃掉多少（实测）

| 视口 | 工具栏高度（抽屉收起） | 工具栏高度（抽屉展开） | 抽屉单项成本 | 首个轨行顶部 y | 首屏完整可见轨行 | 页面总高 |
|---|---:|---:|---:|---:|---:|---:|
| **1440×900** 桌面 | **173 px** | 261 px | +88 px | y=414 | **5 / 8** | 1351 |
| **1280×800** 笔记本 | **213 px** | 301 px | +88 px | y=454 | **3 / 8** | 1407 |
| **1024×768** 平板 | **293 px** | 381 px | +88 px | y=534 | **2 / 8** | 1503 |
| **390×844** 手机 | **395 px** | 483 px | +88 px | y=630 | **2 / 8**（轨行 76 px） | 2590 |

补充实测（同一轮）：
- 工具栏之上还有：`header` **57 px**（手机 55）+ `GenreRail` **57 px** = **114 px** 固定占用，工具栏从 y=114 开始。
- 轨行高度 **85 px**（桌面）/ **76 px**（手机）。
- **抽屉的 88 px > 一个轨行 85 px**：展开高级设置 = 直接少吃一条轨道。这是本次最容易被忽视、收益最直接的一处。
- 常显控件数：**33**（25 按钮 + 6 下拉 + 2 数字输入），分布在 2 个 flex 直接子节点（左组 / 右组，`Toolbar.tsx:594,817`），`flex-wrap` 下自动折成多行 → 1440 上 173 px ≈ 4 行 × 32 px + 间距 + 内边距，与实测吻合。

### 3.2 控件频率分级（判据 = 代码本身的行为，不是主观感觉）

**判据 A（客观）**：是否有单键快捷键 —— `useTransportShortcuts.ts:100-153` + `useAppShortcuts.ts` 定义了全部绑定。
**判据 B**：是否属于"演奏/编辑过程中会连续调整"。

#### 高频（12 项）— 必须留在一级可见

| 控件 | 快捷键 / 理由 | 证据 |
|---|---|---|
| 播放 / 暂停 | `Space` | `useTransportShortcuts.ts:100-105` |
| 撤销 / 重做 | `Cmd/Ctrl+Z`、`Cmd+Shift+Z`、`Ctrl+Y` | `:143-153` |
| 力度泳道 | `V` | `:129-131` |
| 欧几里得 | `E` | `:132-134` |
| 主分析仪 | `O` | `:135-137` |
| Project Hub | `P` | `:123-125` |
| Drums Only | `D` | `:126-128` |
| 关闭浮层 / 退出最大化 | `Esc` | `:106-122` |
| BPM | 无快捷键，但连续调节 | `Toolbar.tsx:639-652` |
| Pattern 槽 A/B + 复制 | 演奏中切换 | `Toolbar.tsx:276-316` |
| 步进矩阵 / 每轨条带 | 核心工作区 | `TrackRow.tsx`（12 个控件/轨） |
| 小节导航（`barCount>1` 时） | 演奏中跳小节 | `Toolbar.tsx:819-841` |

> 结论：**当前被当作"次要按钮"的 V/E/O/D/P 其实都是高频项**，这一点必须写清楚，避免下一轮"美容式折叠"把有快捷键的功能收进"更多"里，反而让熟练用户变慢。

#### 中频（10 项）— 保留可见但可图标化 / 窄屏收纳

拍号、网格分辨率、步长、工具模式（`MeterControls` 4 项，`Toolbar.tsx:134-246`）；鼓机选择（`Toolbar.tsx:719-768`）；`SONG`、盲测、复制槽（`PatternSlotControls`）；摇摆（现居抽屉，但徽标已外露）；录音待命 `REC`（`Toolbar.tsx:701-717`，录制时才高频）；节拍器与预备拍（`Toolbar.tsx:666-699`，练琴场景中频）。

#### 低频（11 项）— **默认折叠的第一批候选**

| 控件 | 位置 | 折叠理由 |
|---|---|---|
| `TAP` 测速 | `Toolbar.tsx:653-664` | 每次会话最多用 1 次 |
| 快速工具下拉（6 项：打开工程库/复制第 1 小节/人性化/清空/重置/清理缓存） | `Toolbar.tsx:948-978` | 纯一次性命令；且其中"打开工程库"与 `P` 快捷键重复 |
| Inspire Me | `Toolbar.tsx:980-990` | 灵感触发，非连续操作 |
| 导入 MIDI | `Toolbar.tsx:992-1017` | 一次性 |
| 键盘/MIDI 输入模式 | `Toolbar.tsx:1019-1038` | 一次性开关（`hidden 2xl:inline`，多数视口只有图标） |
| 曲风工坊 | `Toolbar.tsx:1056-1070` | 一次性（`hidden xl:inline`） |
| 导出菜单（WAV/Stems/MIDI/.als/.groove） | `Toolbar.tsx:357-…`（`ExportMenu`） | 一次性；且已有下拉，可整体移入"更多" |
| 分享 | `Toolbar.tsx:1081-1092` | 一次性 |
| FX 机架 4 个开关 | `Toolbar.tsx:1171-1234` | 已在抽屉；**且是"半成品"**（§4.2 / D-05） |
| 触感反馈开关 + 强度 | `Toolbar.tsx:1236-1274` | 设备级设置，一次设定长期不变 |
| 精细步数（±组/±1 小节/±2 小节） | `Toolbar.tsx:1136-1169` | 结构级调整 |
| 平移导航 ◀ ▶ | `Toolbar.tsx:1276-1302` | 桌面有滚轮、手机有滑动；重复入口 |

### 3.3 抽屉的真实代价（实测）

展开高级设置：`1440×900` 173 → 261 px（+88），首屏轨行 **5 → 4**；`1280×800` 213 → 301（同样 +88），首屏轨行 **3 → 2**；`1024×768` **2 → 1**。

> 也就是说，当前唯一可用的"进阶设置"入口，**代价是让出比一条轨道还多的空间**。而它装的恰恰是"设定一次、长期不变"的东西。这是"折叠方式错了"，不是"不该折叠"。

---

## 4. 缺陷与问题清单

> 说明：本文只登记**工作台交互/信息架构/联动**相关缺陷；音频正确性、数据安全类缺陷已由 v1.16.0 的 `F-01…F-10` 处理完毕，不在此重复。
> 严重度口径：**P0** = 造成工作丢失或功能不可用；**P1** = 明确的使用阻塞/误导；**P2** = 效率与一致性；**P3** = 整洁度。

### 4.1 P0 · Critical

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| **S-P0-1** | **跨视图切换会丢弃工作台里的编辑**：调音台/对比视图各自 `useSequencerStore()` 与 `new AudioEngine()`，只靠 localStorage 快照且必须 `saved.genreId === genre.id` 才恢复；跨曲风或首次进入即回落到曲风默认 pattern | `useSequencerStore.ts:189-220`、`projectStorage.ts:10-33`、`HardwareConsoleView.tsx:55,59,124`、`CompareView.tsx:95,239`、`StudioView.tsx:146` | 用户在调音台拧了半天推子/静音，切回工作台或再进调音台，可能看到的是**另一个来源的状态**；"mixer 的改动"与"pattern 的改动"谁赢由挂载顺序决定 |
| **S-P0-2** | **撤销历史不跨视图、且每次挂载归零**：`canUndo/canRedo` 初始化即 `false`（`useSequencerStore.ts:217-218,243-244`），history 在 hook 内 | 同上 | 用户以为"撤销能退回上一个页面做的操作"，实际不能 |
| **S-P0-3** | **布局偏好零持久化**：5 个布局开关全部 `useState(false)`，全仓无任何读写 | `StudioView.tsx:107`(侧栏) `:108`(最大化) `:116`(力度) `:119`(分析仪) `:131`(高级抽屉)；`grep localStorage src/views/StudioView.tsx` = 0 命中 | 每次刷新/每次从别的视图回来，都要重新收侧栏、重新开力度条；与"项目数据已持久化"形成刺眼反差 |

### 4.2 P1 · High

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| **S-P1-1** | **工具栏 33 个常显控件 / 4 档视口 173–395 px**，高频与低频同权 | §3.1 实测 | 1280×800 上 8 条轨道只看得到 3 条；手机上工具栏占视口 47% |
| **S-P1-2** | **响应式只降级"标签"，不收纳"控件"**：`hidden sm/md/lg/xl/2xl:inline` 数量实测 1440→1、1024→6、390→**16** | `Toolbar.tsx` 全文 + §3.1 实测 | 窄屏上大量无名图标按钮（用户得靠 hover title），而控件本体仍占位 |
| **S-P1-3** | **抽屉吃空间而非浮出**：固定 +88 px > 一个轨行 85 px | `Toolbar.tsx:1119-1120`（`mb-2` + 普通文档流）、§3.3 实测 | 最需要看轨道时把轨道推下去；1024×768 首屏只剩 1 条轨 |
| **S-P1-4** | **FX 机架是有壳无芯**：引擎 4 个 `setMaster*` 接收 7 个参数（`filterCutoff/filterQ/filterType/saturationDrive/chorusMix/chorusRate/bitDepth`），同步 effect 逐个读取并下发（`useAudioEngineLifecycle.ts:239-261`），但 **`src/` 内除 `src/audio/` 外只有这 1 个读点、0 个写点** | 见 §11.4 grep 输出 | 用户看到 `FLT / DRIVE / CHORUS / LO-FI` 四个按钮，按下只有开关效果、**参数永远停在默认值**：`16000Hz` 低通、`drive`/`mix`/`bitDepth` 默认（`EffectsRack.ts:28-45`）。这是"看起来能用其实不可用"的典型误导 |
| **S-P1-5** | **`ecosystemBus.publishClockSync` 挂在 transport 热路径上**：`AudioEngine.setBpm` 内直接 `BroadcastChannel.postMessage`（`AudioEngine.ts:681`），另有 `setMasterBitcrusher` 等 3 处 | `AudioEngine.ts:681,905,938,1274` | 目的地在**另一个源**（`synth.wangda.today`，见 `ecosystemBus.ts:5-9`），属被排除范畴；但它跑在工作台每次 BPM 变更/播放停止路径上。**本轮只登记、不改动**（§10） |

### 4.3 P2 · Medium

| # | 问题 | 证据 |
|---|---|---|
| S-P2-1 | `SequencerPanel` **112 props**、`ToolbarProps` **76**、`TrackRowProps` **28**：新增一个控件要穿过 3 层接口 | `SequencerPanel.tsx` 接口、`Toolbar.tsx:38-114` |
| S-P2-2 | 撤销历史**不含布局与 FX 状态**：`StudioHistorySnapshot` 无 `showAdvancedControls`/`effectsRack`/面板开关 | `useSequencerStore.ts:11-33` |
| S-P2-3 | `effectsRackState` 是 `StudioView` 的 `useState`（`:140`），进项目库（`ProjectHubModal.tsx:215`、`useProjectHub.ts:83-84`）但**不进撤销栈**；改 FX 再撤销会回退 pattern 而不回退 FX | 同上 |
| S-P2-4 | 底鼓联动只有"预设清单"方向：`KickAnatomyView` 收 **0 props**（`App.tsx:259`），工作台选中的 `kick:*` 带不过去，设计完成的底鼓也带不回来"边听边调" | `App.tsx:252-261`、`Toolbar.tsx:574-586` |
| S-P2-5 | 手机横屏紧凑模式的触发是**媒体查询**（`index.css:239`），用户无法手动选择密度；桌面 `1440×900` 上却享受不到已写好的紧凑样式 | `index.css:239-269` |
| S-P2-6 | 工作台是"信息单向出口"：只能推 genre id（`App.tsx:206-219`），无把 pattern / 混音 / 底鼓推给对比或分享的通道 | `App.tsx:206-219` |
| S-P2-7 | App 用 **100 ms `setInterval`** 轮询 `engine.getIsPlaying()` 驱动顶栏播放指示 | `App.tsx:151-153` |

### 4.4 P3 · Low / 清理

| # | 问题 | 证据 |
|---|---|---|
| S-P3-1 | 页脚硬编码陈旧版本串 `Groove v1.7.0 · FL Studio Pattern Engine`（当前 1.16.15） | `SequencerPanel.tsx:503` |
| S-P3-2 | `GenreRail` 硬编码曲风总数 `全部大类 (159)` / `All Categories (159)` | `GenreRail.tsx:56`（数据源实为 `src/data/genres/*` + `src/data/index/`，v1.16.0 已把"硬编码 159 的测试文件"清零，UI 侧漏了这一处） |
| S-P3-3 | 页脚快捷键提示是**大段常显文本**且为内联 `isZh ?` 三元（`SequencerPanel.tsx:470-503`），同时同一信息已在 Shortcuts 弹窗（`?`）内 | 同上 |
| S-P3-4 | 工作台内联 `isZh ?` 三元计数（文本 grep 口径）全仓 **148** 处；工作台页脚、`GenreRail`、`KickAnatomyView` 占相当比例 | `grep -rn "isZh ?" src` |

---

## 5. 应该保留不动的部分（明确列出，避免下一轮误改）

这一节和缺陷清单同等重要：下列内容**经实测确认是资产**，重构时必须原样保留。

| 资产 | 为什么别动 | 证据 |
|---|---|---|
| **`showAdvancedControls` 抽屉机制本身** | 模式正确、有状态徽标、有 `Esc` 语义延伸。要做的是"改成浮层 + 扩充分组"，**不是换成新机制** | `Toolbar.tsx:1094-1304`、`:1108-1112` |
| **7 个高频控件的单键快捷键** | `Space/Esc/P/D/V/E/O/Cmd+Z` 已经是最优交互；折叠重构不得让它们变远 | `useTransportShortcuts.ts:100-153` |
| **`memo` + 渲染探针的测试文化** | `sequencerMemo.test.tsx` 用"渲染探针"而非 DOM 身份做断言，方法论说明里明确写了为什么朴素断言会假绿；这是全仓最高质量的测试之一 | `src/test/sequencerMemo.test.tsx:1-25` |
| **`GenreRail` 只吃轻量 `GENRE_INDEX`** | A-01 的成果，是"首屏只 1 个曲风 chunk"的直接原因，改成吃完整 `Genre` 会立刻回退 | `GenreRail.tsx:6-12,18-27` |
| **hook 拆分（无 god hook）** | `StudioView` 658 行里没有巨型 hook，它把 `hooks/` 下全部 18 个 hook 逐个组装；`usePanelToggles` 全部稳定引用 | `StudioView.tsx:19-45`、`usePanelToggles.ts` |
| **`landscape-compact-*` 紧凑样式** | 已写好、已验证，本轮只需把它从"媒体查询"升级为"密度档位的一个取值" | `index.css:239-269` |
| **`components/console/*` 的独立性与 rAF 计量** | 计量只写 DOM、不触发 React 重渲染（`HardwareConsoleView.tsx:40-56` 注释与实现）；44px 控件、`data-console-channel` 等测试钩子齐备 | `HardwareConsoleView.tsx:40-56`、`components/console/meterMath.ts` |
| **调音台/工作台各自的 `AudioEngine` 生命周期** | 在"一个视图一套引擎"的前提下是正确设计（挂载建、卸载销毁）。**要改的是"谁拥有状态"，不是"谁拥有引擎"** | `useAudioEngineLifecycle.ts`、`HardwareConsoleView.tsx:59,124` |
| **`groove_kick_presets_changed` 事件的用法** | 唯一做对的自定义事件：单一定义、双向监听、有清理。应把它抽成通用总线的第 1、2 个迁移用户，而不是废弃 | `AnatomyKickEngine.ts:88,104`、`Toolbar.tsx:580-586` |
| **调色板与视觉语义** | 8 轨固定色板（`trackConfig.ts`，`#ff5964…`）、`--g` 曲风强调色、`accent` 主色已在工作台/调音台/星系之间一致 | `trackConfig.ts`、`StudioView.tsx:466` |

---

## 6. 模块联动设计

### 6.1 状态归属矩阵（**先定这张表，再写代码**）

| 状态 | 当前归属 | 目标归属 | 共享 / 隔离 | 理由 |
|---|---|---|---|---|
| `pattern` / `patterns.A/B` | 每视图各一份 `useReducer` | **1 个 `SequencerStoreProvider`（App 层）** | **共享** | 这是"作品"本体，跨视图必须同一份 |
| `bpm` / `swing` / `timeSignature` / `resolution` / `stepCount` | 同上 | 同上（共享） | **共享** | 同上 |
| `activeSlot` / `songMode` / `songChain` / `loopRange` | 同上 | 同上（共享） | **共享** | 同上 |
| undo / redo 历史 | hook 内、每视图一份 | 共享 | **共享** | 用户不区分"哪个页面的撤销" |
| `AudioEngine` 实例 | 每视图一个 | 保持每视图一个，但**由共享层登记并在切换时迁移传输状态** | **半共享** | 避免双引擎同时出声；曲风/pattern 由共享层同步 |
| `isPlaying` / 播放头 | 各视图本地 | 共享层（`transport` 切片） | **共享** | 切视图应继续放（或明确停止并提示） |
| 侧栏 / 最大化 / 力度 / 分析仪 / 高级抽屉 / 密度档 | 会话态 | **持久化偏好**（localStorage，独立 key，带 schema 版本） | **共享且持久** | §4.1 S-P0-3 |
| `isDrumsOnly` / `isKeyboardMode` / `isRecordArmed` | 会话态 | **保持会话态**（不持久化） | 隔离 | `isRecordArmed` 持久化会造成"下次打开就录音"的危险默认 |
| `effectsRackState` | `StudioView` `useState` | 进共享层 + **进撤销栈** | **共享** | §4.3 S-P2-3 |
| 调音台推子/声像/发送（`TrackState`） | 已在 store 的 `pattern.tracks` 内 | 不变 | **共享**（天然） | `trackStates.ts` 已是引擎与离线渲染的共同口径 |
| 当前编辑中的底鼓参数 | `KickAnatomyView` 本地 + localStorage 预设 | 共享层加一个**可选手柄**（不是全量参数） | **半共享** | 只传 `{kickId, name, engineReady}`，参数仍由底鼓设计器拥有 |
| 分析仪 FFT 数据 | 已通过 `onAudioEngineReady` 传给 `AnalyzerView` | 不变 | **共享（只读）** | 现有机制正确，保留 |
| 对比视图的 A/B 曲目池 | App 层 | 不变 | **共享（只读）** | v1.16.0 已优化为按需加载 |
| `ecosystemBus`（跨窗口/跨源） | 全局单例 | **不动** | **排除** | §10 |

### 6.2 联动通道设计

**问题**：现在有 3 种通道（props 回传、localStorage 快照、2 个 ad-hoc `window` 事件），谁是真相源取决于挂载顺序。

**方案（最小改动）**：

1. **一个 store，一个 Provider**：把 `useSequencerStore` 的 reducer 原样搬进 `SequencerStoreProvider`（App 层），`useSequencerStore()` 改为读 Context。所有 hook 的调用签名不变，因此**改动面小、可分批**（先让工作台吃 Provider，再让调音台吃，最后对比视图）。这是本规划里**唯一的大改动**，因此排在最后一个里程碑，且必须"新旧并存 + 逐视图切换"。
2. **一条类型化应用内总线**：`src/app/studioBus.ts`，`CustomEvent` + `dispatchEvent`/`addEventListener`，事件签名强类型（`StudioBusEvent` 联合类型）。把现有 `groove_kick_presets_changed`、`groove_custom_genres_changed` 作为第 1 批迁移用户（行为不变，仅换名），新增：
   - `studio:pattern-changed`（P2P 通知，供浮窗/分析仪刷新只读视图）
   - `studio:track-selected`（`{ trackIdx }`：工作台点轨道 → 调音台/浮窗高亮该通道）
   - `studio:kick-selected`（`{ kickId }`：工作台鼓机下拉 → 底鼓设计器切换）
   - `studio:kick-saved`（`{ kickId }`：底鼓设计器 → 工作台刷新下拉**并高亮新预设**）
   - `studio:audition`（`{ genreId, pattern? }`：工作台 → 对比/详情"用这段 pattern 试听"）
   - `studio:console-float`（`{ open, anchor, channels }`：工作台 ↔ 浮窗控制台）
3. **明确"不共享"的边界**：底鼓的**参数细节**、分析仪的**测试信号状态**、对比视图的**评分状态**都不进共享层——它们各自是"工具状态"，共享它们只会制造耦合。

### 6.3 与调音台 / 分析仪 / 底鼓 / 曲风详情·对比 的具体联动清单

| 方向 | 现状 | 目标 | 归属里程碑 |
|---|---|---|---|
| 工作台 → 调音台/浮窗 | 只能带 genre id | 带 `pattern + transport + 选中的轨道` | L-01 / X-02 |
| 调音台/浮窗 → 工作台 | 靠 localStorage 快照（可能不生效） | 实时写共享 store；关闭浮窗立即反映 | L-01 / X-03 |
| 工作台 → 分析仪 | 通过 `engineInstance` 只读 FFT | 保留；新增"选中轨道优先"（有 per-track analyser 时用 `enableTrackAnalysers`，无则回落母带） | L-03 |
| 底鼓设计 → 工作台 | 只有预设清单事件 | 加"选中/试听/一键设为该轨音色" | L-04 |
| 工作台 → 底鼓设计 | 无 | 从鼓机下拉的当前 `kick:*` 跳转并预载参数 | L-04 |
| 工作台 → 曲风详情 | `onViewDetail`（仅 genre id） | 保留；新增从详情返回时**不重置已编辑 pattern**（因为是同一个 genre id，靠共享 store 自然成立） | L-02 |
| 工作台 → 对比 | `onAddToCompare`（仅 genre id） | 新增"把当前编辑后的 pattern 加入对比"（需对比视图支持 `patternOverride`，标为可选项） | L-05 |

---

## 7. 改进与完善规划

> 组织方式：五个冲刺（S0–S4）。
> ID 可直接用于 commit message（例：`feat(studio): C-01 工具栏三级频率分层`）。
> 每项给出**可量化验收标准**；`⚠️ 高风险` / `⛔ 不可逆` 已标注。
> 每个冲刺的出口都要求：`npm run fast` 绿 + 该冲刺新增测试绿；涉及构建/首屏的冲刺再加 `npm run slow`。

### S0 · 布局偏好持久化与数据一致性（建议 3–4 人日，最高优先，最低风险）

| ID | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| **D-01** | 新增 `src/features/sequencer/layoutPrefs.ts`：`groove_layout_prefs_v1`（带 `version`），读写 5 个布局开关 + 密度档；损坏/超限/未知版本回落默认且不抛错 | 新文件、`StudioView.tsx:107-131` | 单测：往返一致；`null`/非法 JSON/`version:999` 均回落默认；写入后刷新 `isSidebarCollapsed` 等 5 值原样恢复 |
| **D-02** | 5 个布局开关接入 `layoutPrefs`（读一次 + 变更即写；`isEditorMaximized` 也持久化） | `StudioView.tsx:107,108,116,119,131` | 手测：收起侧栏 → 刷新 → 仍收起；E2E 断言 `localStorage['groove_layout_prefs_v1']` 含 5 个键 |
| **D-03** | `effectsRackState` 进撤销栈（`StudioHistorySnapshot` 加 `effectsRack?`） | `useSequencerStore.ts:11-33,893-1030` | 单测：改 FX → Ctrl+Z → FX 回退；且与 pattern 快照同一次 commit 只占 1 条历史 |
| **D-04** | `effectsRackState` 上移共享层（配合 L-01）；未上移前先保证"切视图不丢"（进 `PersistedProject`） | `projectStorage.ts:12-33`、`useSequencerStore.ts:190-220` | 单测：写入 FX → 重挂载 store → FX 一致 |
| **D-05** | **FX 机架参数接出 UI**：抽屉内为 4 个效果各加 1 个主参数（`filterCutoff` / `saturationDrive` / `chorusMix` / `bitDepth`），`filterType` 用下拉，`filterQ`/`chorusRate` 进"高级"二级 | `Toolbar.tsx:1171-1234`、`EffectsRack.ts:28-45`、`useAudioEngineLifecycle.ts:239-261` | 单测：新控件 onChange 后 `DEFAULT_FX_STATE` 的 7 个字段**每个都有 ≥1 个写入点**（用 grep 断言的可达性测试，见 G-02）；E2E：拖动滤波截止后 `EffectsRack.getState().filterCutoff` 变化 |
| **D-06** | `isDrumsOnly` / `isKeyboardMode` / `isRecordArmed` **明确保持会话态**，在代码注释里写明理由（防"顺手全持久化"） | `StudioView.tsx:134,138,139` | 代码注释存在 + 单测断言三者不进 `layoutPrefs` 序列化结果 |

**S0 出口**：`npm run fast` 绿；D-01/D-03/D-05 各带新单测；刷新页面后布局保持不变（人工确认 + E2E）。

### S1 · 折叠优先的信息架构（建议 5–7 人日）

| ID | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| **C-01** | **三级频率常量表**：`src/components/sequencer/toolbarTiers.ts` 定义 `TIER_1_PRIMARY`（12 项高频）/`TIER_2`（中频）/`TIER_3`（低频），每项含 `id/labelKey/shortcut?`。**含断言：凡有单键快捷键的控件必须在 Tier 1** | 新文件、`useTransportShortcuts.ts`（导出快捷键清单供测试比对） | 单测：快捷键清单 ⊆ Tier 1；遍历 `Toolbar` 渲染结果，每个 Tier 3 控件默认不可见 |
| **C-02** | 一级行只保留 Tier 1：左侧"侧栏/播放/BPM/槽位/小节"，右侧"力度/欧几里得/分析仪/撤销重做/最大化/更多"。Tier 2 收进一级行末尾的**图标按钮组**（拍号/网格/长度/工具为 1 个"节拍"弹层按钮 + 当前值徽标） | `Toolbar.tsx:592-1116` | 实测：**常显控件 ≤ 14**；`1440×900` 工具栏高度 **≤ 56 px**（一行）；`1280×800` ≤ 96 px（两行） |
| **C-03** | 新增"**更多**"面板（Popover，非文档流）：装 Tier 3 全部项 + 快速工具下拉；`Esc` 关闭；点击外部关闭；触屏 ≥44px | 新 `ToolbarMoreMenu.tsx`（复用 `ExportMenu` 的 outside-click 模式，`Toolbar.tsx:383-392`） | 单测：默认不渲染 Tier 3；点击"更多"后全部出现；`Esc` 关闭；面板打开时不影响工具栏高度（`getBoundingClientRect` 断言工具栏父节点高度不变） |
| **C-04** | **抽屉改浮层**（`absolute` + `z-40`，锚定工具栏），不再占文档流 | `Toolbar.tsx:1119-1304` | 实测：展开抽屉后工具栏父节点高度**不变（±2 px）**；且"展开态首屏轨行数 == 收起态首屏轨行数"（`1280×800` 下均为 ≥ 5） |
| **C-05** | 抽屉内按"律动 / 结构 / 音色 / 设备"分 4 组并加组标题；摇摆（唯一高频项）保留在组首，并保留折叠态徽标 | `Toolbar.tsx:1119-1304` | 目测 + 单测：4 个组标题存在；`swing > 0` 且抽屉关闭时徽标仍显示 |
| **C-06** | **密度档位**（`紧凑 / 标准 / 舒适`）落进 `layoutPrefs`；`紧凑` 复用 `index.css:239-269` 的类，不再只由媒体查询触发 | `src/index.css:239-269`、`layoutPrefs.ts` | 单测：`紧凑` 下控件高 28px、侧栏隐藏；媒体查询行为保持不变（横屏手机仍自动紧凑） |
| **C-07** | 清理陈旧串与硬编码：页脚版本改为**构建期注入**（读 `package.json` 版本，复用 `version.mjs` 的单一来源思路）；`全部大类 (159)` 改为从 `GENRE_INDEX` 长度推导 | `SequencerPanel.tsx:503`、`GenreRail.tsx:56` | 单测：断言 UI 文本包含 `v${pkg.version}`；断言 `GenreRail` 分类标签里的数字 === `GENRE_INDEX` 长度（数据变化时测试会失败） |
| **C-08** | 页脚快捷键提示改为**可折叠一行摘要**（默认 1 行，点击展开/`?` 打开完整弹窗） | `SequencerPanel.tsx:470-503` | 实测：页脚高度 ≤ 24 px；点击后展开 |

**S1 出口**：D-01 已落地；实测工具栏高度 `1440×900 ≤ 56 px`、`1280×800 ≤ 96 px`、`390×844 ≤ 132 px`；常显控件 ≤ 14；Tier 3 默认全部不可见；`npm run fast` 绿；新增 ≥6 条单测 + 1 条 E2E。

### S2 · 模块联动（建议 4–6 人日）

| ID | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| **L-01** | ⚠️ **高风险**：抽出 `SequencerStoreProvider`（App 层），`useSequencerStore()` 改为 Context 读取；**分三步**——① Provider 与旧 hook 并存（默认旧行为）；② 工作台切到 Provider；③ 调音台切到 Provider。每步单独发布 | 新 `src/app/SequencerStoreProvider.tsx`、`useSequencerStore.ts`、`StudioView.tsx`、`HardwareConsoleView.tsx` | 单测：Provider 内外 `commit` 后，另一挂载组件读到同值；`sequencerStore.test.ts`、`sequencerHistory.test.tsx`、`HardwareConsoleView.test.tsx` 全绿；**切到调音台再回来，pattern 与撤销栈不丢**（E2E） |
| **L-02** | 新增 `src/app/studioBus.ts`（类型化 `CustomEvent` 总线），迁移 `groove_kick_presets_changed`、`groove_custom_genres_changed` 为第 1 批用户（行为不变，仅改名 + 集中常量） | 新文件、`AnatomyKickEngine.ts:88,104`、`Toolbar.tsx:580-586`、`customGenreDb.ts:57`、`useCustomGenres.ts:36`、`kick/SomaticControls.tsx:57` | 单测：新事件名生效、旧名不再派发；订阅/退订无泄漏 |
| **L-03** | 分析仪 **轨道优先**：工作台点选某轨时若 `enableTrackAnalysers` 已开启则把该轨 analyser 交给分析视图，否则回落母带 | `App.tsx:263-276`、`AudioEngine.ts`（`getTrackAnalyser`）、`AnalyzerView.tsx:24-30` | 单测：注入 fake analyser，断言选中轨后 `externalAnalyser` 等于该轨实例；无轨道 analyser 时等于母带 |
| **L-04** | 底鼓双向：工作台鼓机下拉的当前 `kick:*` → 底鼓设计器预载；底鼓设计器"保存/试听" → 工作台刷新并高亮 | `App.tsx:252-261`、`KickAnatomyView.tsx`、`Toolbar.tsx:719-768`、`studioBus.ts` | E2E：在设计器保存预设 → 切到工作台 → 该预设出现在自定义 optgroup 且被选中；反向：工作台选 `kick:berlin-orphic` → 进设计器 → 参数与之相符 |
| **L-05** | （可选）"把当前编辑后的 pattern 加入对比"：`CompareView` 接受 `patternOverride?: SequencerPattern` | `App.tsx:126-139`、`CompareView.tsx` | 单测：带 override 时对比用的是 override 而非曲风默认；不带时行为不变 |

**S2 出口**：跨视图（工作台 ↔ 调音台 ↔ 分析仪 ↔ 底鼓 ↔ 详情/对比）切换后，pattern / 撤销栈 / FX / 选中轨道均保持一致；`localStorage` 不再是"隐式真相源"（改为只做持久化）；`npm run fast` 绿；新增 ≥8 条测试（含 1 条 E2E 跨视图往返）。

### S3 · 浮窗控制台（建议 5–7 人日）

> 依赖 S2 的共享 store；**没有 L-01 就做 X，一定会出现两套状态打架**。

| ID | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| **X-01** | 抽出**与视图无关**的 `ConsoleSurface`（无路由、无标题、无页面外层），`HardwareConsoleView` 改为薄壳包一层 | `HardwareConsoleView.tsx:1-436`（保留 `data-testid="hardware-console"`、`data-console-channel`、`console-phase-N` 等既有钩子） | `HardwareConsoleView.test.tsx` 全绿不改断言；`scripts/test_matrix.js` 的 console 段全绿（`data-console-channel`、`console-spatial-toggle`、`console-phase-0`、`data-meter-bar ≥ 2`） |
| **X-02** | 新增 `StudioConsoleFloat`：`position: fixed`，可拖拽（记忆位置到 `layoutPrefs`）、可折叠、可调高度（默认 320 px）、宽度自适应通道数；**默认关闭** | 新 `src/components/console/StudioConsoleFloat.tsx`、`StudioView.tsx` | 单测：默认不渲染；打开后 `data-testid="console-float"` 存在；拖拽后位置写入 `layoutPrefs`；`Esc` 关闭且不触发 transport 停止 |
| **X-03** | 浮窗与工作台共用**同一 store 与同一 `AudioEngine` 引用**（不新建引擎，避免双声源） | `StudioConsoleFloat.tsx`、`StudioView.tsx`、`useAudioEngineLifecycle.ts` | 单测：浮窗打开后 `AudioEngine` 构造次数 **+0**（spy 计数）；浮窗静音某轨，主矩阵该轨立即显示静音态 |
| **X-04** | 传输条一致性：浮窗内播放/停止/取消静音与工作台同步（同一 transport 切片） | 同上 | E2E：浮窗点播放 → 工作台播放按钮进入播放态；工作台停止 → 浮窗停止态 |
| **X-05** | 入口：工具栏一级行的"控制台"图标按钮（带浮窗开合态）+ `Shift+M` 快捷键；`?tab=console` 路由**保留** | `Toolbar.tsx:592-1116`、`Header.tsx:27+`、`useTransportShortcuts.ts` | E2E：`Shift+M` 开合浮窗；`?tab=console` 仍可用；快捷键在输入框聚焦时不触发 |

**S3 出口**：浮窗打开时工作台仍可见 pattern 与轨道（同一屏），混音改动实时反映到主矩阵；新增 `StudioConsoleFloat.test.tsx`；`npm run slow` 全绿（含 7 端矩阵与体积预算）。

### S4 · 工程化门禁与性能收尾（建议 3–4 人日）

| ID | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| **G-01** | **布局回归测试**：jsdom 渲染 `Toolbar`，断言 Tier 1 控件数 ≤ 14、Tier 3 默认不可见、抽屉打开不影响工具栏高度 | 新 `src/test/toolbarTiers.test.tsx` | 测试能**失败**：人为把 1 个 Tier 3 控件挪进一级行后测试必须红（在 PR 描述里贴出红/绿两次输出） |
| **G-02** | **FX 参数可达性断言**（防"有壳无芯"复发）：读 `src/` 源码，断言 7 个参数字段各有 ≥1 个 `.tsx` 写入点 | 新 `src/test/fxParamReachability.test.ts` | 测试在 v1.16.15 上必须**失败**（当前 0 个写点），D-05 完成后转绿 —— 这是"先写会红的测试"的标准用法 |
| **G-03** | **偏好持久化测试**：`layoutPrefs` 往返、非法输入回落、不污染项目数据 | 新 `src/test/layoutPrefs.test.ts` | 覆盖 `null`/非法 JSON/未知 version/字段类型错误 4 类 |
| **G-04** | E2E 增加 3 条断言：① 刷新后布局不变；② 工作台↔调音台往返 pattern 不丢；③ 抽屉展开不改变工具栏高度 | `scripts/test_matrix.js`（studio 段，现 `:175` 起） | 7 端矩阵全绿；断言失败时输出可定位（复用现有 `overflowCheck` 风格的自定义报错） |
| **G-05** | App 顶栏播放指示去轮询：改为引擎事件/订阅（若引擎已有播放态回调则直接接；否则在共享层暴露 `subscribeTransport`），移除 `setInterval(100ms)` | `App.tsx:148-160` | 单测：`setInterval` 不再被调用（spy）；播放/停止状态切换在 1 帧内反映 |

**S4 出口**：`npm run fast` + `npm run slow` 全绿；`npm run redlines`（20 条）不减少；`npm run docs:check` 7/7；新增 5 个测试文件；首屏 JS gzip 不高于 v1.16.15（浮窗与总线必须懒加载）。

---

## 8. 里程碑与交付顺序（每个里程碑 = 一个可独立发布的小版本）

> **版本号由两条线共享**：本重构（工作台）与并行的音频质量计划（`AUDIO_QUALITY_AND_SYNTH_PLAN.md` 的 P2–P6）都在 2.0.x 序列上发布。因此下表的 v2.0.1–v2.0.12 是**顺序位置**，不是固定版本号——每个里程碑发布时取当时的**下一个可用版本号**。例如音频线先发布了 v2.0.1（和弦奏法与乐器），则本节表中原标 v2.0.1 的「FX 参数补全」将落在 v2.0.2，以此类推。这样版本号始终单调且每次发布都真实对应一个已交付的里程碑。

> 顺序原则：**先修"会丢东西"与"记忆"（S0）→ 再改"看得见"（S1）→ 再动"状态归属"（S2）→ 最后加"浮窗"（S3）**。
> 理由：S1 的折叠重构会让工具栏结构大改；如果先做 S2/S3，等于在流沙上盖楼。S0 风险最低、用户感知最强，必须第一个上。

| 版本 | 主题 | 含项 | 快/慢轨 | 出口（一句话可验收） |
|---|---|---|---|---|
| **v2.0.0** | 布局偏好持久化 | D-01, D-02, G-03 | 快轨 | 刷新后侧栏/力度条/抽屉状态原样恢复，非法存储值不崩 |
| **v2.0.1** | FX 参数补全 + 撤销一致性 | D-05, D-03, G-02 | 快轨 | 4 个 FX 主参数可调且进撤销栈；可达性测试由红转绿 |
| **v2.0.2** | FX 跨视图一致 + 会话态边界文档化 | D-04, D-06 | 快轨 | 切视图不丢 FX；`isRecordArmed` 等确认不持久化 |
| **v2.0.3** | 频率分层常量 + 测试先行 | C-01, G-01 | 快轨 | `toolbarTiers` 落地；布局回归测试在旧结构上先红 |
| **v2.0.4** | 一级行瘦身 + "更多"面板 | C-02, C-03 | 快轨 | 常显控件 ≤ 14；1440 工具栏 ≤ 56 px；Tier 3 默认不可见 |
| **v2.0.5** | 抽屉浮层化 + 分组 | C-04, C-05 | 快轨 | 展开抽屉工具栏高度不变（±2 px）；展开/收起首屏轨行数相同 |
| **v2.0.6** | 密度档位 + 文案清理 | C-06, C-07, C-08 | 快轨 | 密度三档生效；页脚版本随构建更新；`159` 由数据推导 |
| **v2.0.7** | 应用内总线 + 分析仪轨道优先 | L-02, L-03 | 快轨 | 事件总线统一；选中轨道时分析仪切到该轨 |
| **v2.0.8** | 底鼓双向联动 | L-04 | 快轨 | 工作台↔底鼓设计器双向预载与高亮 |
| **v2.0.9** | ⛔ **共享 store（三步走，本版本做第 ①②步）** | L-01（① Provider 并存、② 工作台切入） | 慢轨 | 工作台切到 Provider 后全部既有测试绿；跨视图 pattern 不丢 |
| **v2.0.10** | ⛔ 共享 store（第 ③ 步）+ 对比 override | L-01（③ 调音台）、L-05 | 慢轨 | 工作台↔调音台往返 pattern/撤销/FX 一致 |
| **v2.0.11** | 浮窗控制台 | X-01…X-05 | 慢轨 | 浮窗与工作台同屏、同 store、同引擎；`?tab=console` 保留 |
| **v2.0.12** | 门禁收尾 + 去轮询 | G-04, G-05 | 慢轨 | 3 条新 E2E 进 7 端矩阵；顶栏不再轮询 |

**总计 5 个冲刺 / 29 个任务项**（D-01…06、C-01…08、L-01…05、X-01…05、G-01…05）**/ 约 20–28 人日。** 其中：
- **建议必做且低风险**：v2.0.0 – v2.0.8（D / C / L-02,03,04 全部 + G-01~G-03）——**用户感知最强、几乎不动状态归属**。
- **高风险 / 建议单独评估**：v2.0.9 – v2.0.10（`L-01` 共享 store）。⚠️ 这会改变 `StudioView`/`HardwareConsoleView`/`CompareView` 的状态所有权，是最容易引发回归的一步；必须"并存 + 逐视图切换 + 每步独立回滚点"。
- **⛔ 不可逆项**：`D-01` 一旦写入 `groove_layout_prefs_v1` 就会留在既有用户机器上 → key 必须带 `version` 且**永不删除旧 key**（沿用 v1.16.0 R7c"发布历史只增不减"的同一条纪律）；`C-02` 改变默认可见集合 → 必须同时提供"恢复默认布局"入口。

---

## 9. 度量目标（current → target）

| 指标 | 当前（实测 v1.16.16） | 目标（v2.0.12） | 验证方式 |
|---|---|---|---|
| 工具栏常显可交互控件 | **33** | **≤ 14** | `querySelectorAll("button,select,input")` in `div.landscape-compact-bar` |
| 工具栏高度 @1440×900 | **173 px** | **≤ 56 px** | 同上 `getBoundingClientRect().height` |
| 工具栏高度 @1280×800 | **213 px** | **≤ 96 px** | 同上 |
| 工具栏高度 @390×844 | **395 px** | **≤ 132 px** | 同上 |
| 抽屉展开的额外高度成本 | **+88 px**（> 1 条轨行） | **0 px**（浮层） | 展开前后比较父节点高度 |
| 首屏完整可见轨行 @1280×800 | **3 / 8** | **≥ 5 / 8** | `[class*='track-row-']` 中 `bottom ≤ innerHeight` 计数 |
| 首个轨行顶部 y @1280×800 | **454**（视口 57%） | **≤ 340** | `getBoundingClientRect().top` |
| 布局偏好持久化项 | **0 / 5** | **5 / 5 + 密度档** | 刷新后状态比对 |
| FX 参数字段有 UI 写入点 | **0 / 7** | **7 / 7** | 源码可达性测试（G-02） |
| 跨视图 pattern 一致性 | **依赖曲风 id 命中，未命中即回默认** | **100% 一致（同一 store）** | 跨视图往返 E2E |
| 跨视图撤销栈 | **每次挂载清零** | 保持 | 同上 |
| ad-hoc `window` 事件通道 | 2 个（`groove_kick_presets_changed`、`groove_custom_genres_changed`） | **0 个裸名**（全走 `studioBus`） | grep 断言 |
| 常量重复的版本串 | 1 处陈旧（`Groove v1.7.0`） | **0** | 单测断言含 `pkg.version` |
| 硬编码曲风总数 | 1 处（`159`） | **0**（由 `GENRE_INDEX` 推导） | 单测 |
| 工作台布局回归测试 | **0** | **≥ 3 个文件**（G-01/G-02/G-03） | `npm run test` |
| 首屏 JS gzip | 164 KB（实测基线） | **不增加**（浮窗 + 总线必须 `lazy`） | `npm run check:budget` + `npm run perf:check` |

---

## 10. 建议不做（含理由）

> 这一节是刻意写的"负面清单"：不写清楚边界，下一轮就会有人把"看起来应该做"的东西做掉。

### 10.1 用户已明确排除（本文不列为任务）

| 排除项 | 范围 | 理由 |
|---|---|---|
| **全部无障碍专项** | 焦点环 / ARIA / 对比度 / 字号 / 触控目标尺寸 / canvas 文本替代 / 键盘可达性审计 | 用户明确排除（v1.16.0 的 `U-01/02/04/05/06/07` 同样排除）。**但**：本规划的"触屏 ≥44px""`Esc` 关闭""快捷键不在输入框触发"是**交互正确性**顺带满足，不作为验收目标 | 
| **全部 WebRTC / 局域网 "互弹"** | 含 `ecosystemBus` 的跨源/跨窗口能力扩展、`synth.wangda.today` 对接、时钟/瞬态跨端同步 | 用户明确排除（`N-03` 同样排除）。`ecosystemBus` 已存在且在工作台 transport 路径上（§4.2 S-P1-5），**本轮只登记不动** |

### 10.2 建议不做（技术判断，含理由）

| 不建议做 | 理由 |
|---|---|
| **把 `SequencerPanel` 的 112 props 一次性换成 Context** | 收益（更少 props）远小于风险（112 个 prop 的语义在 18 个 hook 里交叉引用）。真正的问题是**状态所有权**（S2 的 L-01），不是 prop 数量。等 L-01 落地后 props 会自然减少，再评估 |
| **拆分 `Toolbar.tsx`（1307 行）为多文件** | 它已按 A-03 拆出 3 个 `memo` 子组件，剩余部分是"布局 + 条件渲染"，拆开只会增加跨文件跳转成本。C-02/C-03 会把 Tier 3 整体移出，届时文件自然变短 |
| **重写调音台计量为 analyser 全通道** | 现方案（母带真 analyser + 触发脉冲 + peak 松弛弹道）在只有母带 analyser 的引擎能力下是正确取舍，且已修掉"挂起 AudioContext 假满格"。改全通道需要引擎为 8 轨各建 analyser，是**纯成本** |
| **把手机横屏紧凑模式推广成"默认手机紧凑"** | 紧凑样式压到 28 px，在触屏上过小（与 44px 触控目标冲突）。正确做法是 C-06 的**可选密度档**，让用户自己选 |
| **给工作台加"多工程并排/多窗口"** | `ecosystemBus` 的跨窗口同步是被排除范畴；应用内共享 store（L-01）已能解决"切视图丢工作"这个**真实**痛点 |
| **把 `GenreRail` 改成吃完整 `Genre` 对象（以便显示更多信息）** | 会立刻破坏 A-01 的首屏优化（1 个曲风 chunk）——这是 v1.16.0 用 336→164 KB 换来的成果 |
| **`isRecordArmed` / `isKeyboardMode` 持久化** | 会造成"一打开页面就待命录音 / 键盘输入直接改 pattern"的危险默认。S0/D-06 明确把它们留在会话态 |
| **为"折叠"本身引入动画** | 实测工具栏已经在 4 档视口折成 2–6 行；再加高度动画会让 60fps 计量与矩阵滚动更难稳定（该项目已为 CLS 做过专项治理，CLS 0.191→0.000）。折叠只做状态切换，不做高度补间 |
| **在浮窗里再建一个 `AudioEngine`** | 会出现两个引擎同时出声/两套 `trackStates`。X-03 明确要求引擎构造次数 +0 |

---

## 11. 附：本次审查的原始实测证据

> 以下为本次审查实际执行的命令与原始输出（节选），不做修饰。

### 11.1 环境与基线

```console
$ node -e "console.log(require('./package.json').version)"
1.16.15

$ # 与 scripts/check_docs.mjs 的 countSources 同口径（递归 src/**.tsx?）
$ node -e "…countSources(src)…"
246 files / 145021 lines

$ find src/components/sequencer src/features/sequencer src/components/console -type f | xargs wc -l | tail -1
10897 total

$ ls src/test/ | grep -c "\.test\.tsx\?$"
62

$ node -e "const c=require('./public/changelog.json');console.log('changelog entries', c.changelog.length)"
changelog entries 57

$ grep -rn "isZh ?" src --include=*.tsx --include=*.ts | grep -v "\.test\." | wc -l
148
```

### 11.2 DOM 实测（Playwright + 隔离端口）

```console
$ npx vite --port 5199 --strictPort &        # 已安装 playwright（devDependency）
$ node /tmp/gm.mjs                            # 四档视口 + 抽屉开合 + 调音台
{"viewport":"desktop-1440","opened":true,"barHeight":165,"wrapperHeight":173,"playTop":168,"controlCount":33,"buttonCount":25,"selectCount":6,"inputCount":2,"directChildren":2,"distinctRowTops":2,"hiddenLabels":1,"advancedDrawerOpen":false,"viewportH":900,"docScrollH":1351,"advancedOpen":true,"drawerHeight":72,"drawerControls":14,"wrapperHeightAfter":261}
{"viewport":"laptop-1280","opened":true,"barHeight":205,"wrapperHeight":213,"playTop":168,"controlCount":33,"buttonCount":25,"selectCount":6,"inputCount":2,"directChildren":2,"distinctRowTops":2,"hiddenLabels":1,"advancedDrawerOpen":false,"viewportH":800,"docScrollH":1407,"advancedOpen":true,"drawerHeight":72,"drawerControls":14,"wrapperHeightAfter":301}
{"viewport":"tablet-1024","opened":true,"barHeight":285,"wrapperHeight":293,"playTop":168,"controlCount":33,"buttonCount":25,"selectCount":6,"inputCount":2,"directChildren":2,"distinctRowTops":2,"hiddenLabels":6,"advancedDrawerOpen":false,"viewportH":768,"docScrollH":1503,"advancedOpen":true,"drawerHeight":72,"drawerControls":14,"wrapperHeightAfter":381}
{"viewport":"phone-390","opened":true,"barHeight":387,"wrapperHeight":395,"playTop":162,"controlCount":33,"buttonCount":25,"selectCount":6,"inputCount":2,"directChildren":2,"distinctRowTops":2,"hiddenLabels":16,"advancedDrawerOpen":false,"viewportH":844,"docScrollH":2590,"advancedOpen":true,"drawerHeight":72,"drawerControls":14,"wrapperHeightAfter":483}
{"viewport":"console-1440","rootScrollHeight":796,"stripCount":8,"stripWidth":166,"stripHeight":665,"docScrollW":1440,"winW":1440,"viewportH":900}
```

第二组（含轨行与首屏可见数）：

```console
{"vp":"desktop-1440x900","closed":{"headerH":57,"railH":57,"toolbarH":173,"rulerH":14,"rowCount":8,"rowH":85,"firstRowTop":414,"rowsFullyVisibleAboveFold":5,"vh":900,"docScrollH":1351},"openAdvanced":{"toolbarH":261,"firstRowTop":502,"rowsFullyVisibleAboveFold":4}}
{"vp":"laptop-1280x800","closed":{"headerH":57,"railH":57,"toolbarH":213,"rowCount":8,"rowH":85,"firstRowTop":454,"rowsFullyVisibleAboveFold":3,"vh":800},"openAdvanced":{"toolbarH":301,"firstRowTop":542,"rowsFullyVisibleAboveFold":2}}
{"vp":"tablet-1024x768","closed":{"headerH":57,"railH":57,"toolbarH":293,"rowCount":8,"rowH":85,"firstRowTop":534,"rowsFullyVisibleAboveFold":2,"vh":768},"openAdvanced":{"toolbarH":381,"firstRowTop":622,"rowsFullyVisibleAboveFold":1}}
{"vp":"phone-390x844","closed":{"headerH":55,"railH":55,"toolbarH":395,"rowCount":8,"rowH":76,"firstRowTop":630,"rowsFullyVisibleAboveFold":2,"vh":844},"openAdvanced":{"toolbarH":483,"firstRowTop":718,"rowsFullyVisibleAboveFold":1}}
```

> 口径说明：抽屉展开的 **+88 px** = 抽屉本体 **72 px** + 父容器 `gap-2`(8 px) + 抽屉自身 `mb-2`(8 px)，与原始 JSON 里的 `drawerHeight: 72` 并不矛盾（一个是本体、一个是父容器增量）。
> `barHeight` = `div.landscape-compact-bar` 自身盒高（`pb-2.5 mb-2` 属外距不计入，故略小于 `wrapperHeight`）；`wrapperHeight` = 其父容器（`flex flex-col gap-2`，即整个工具栏区）高度，本文 §3.1 采用 **wrapperHeight**。`rowH` = `[class*='track-row-']` 首个元素的 `getBoundingClientRect().height`。`rowsFullyVisibleAboveFold` 统计 `bottom <= innerHeight` 的轨行数（**不含**被视口底部裁一半的行）。

### 11.3 门禁兼容性核对

```console
$ grep -n "PLANNING_DOCS" scripts/check_docs.mjs
const PLANNING_DOCS = ["IMPROVEMENT_PLAN.md", "ROADMAP_V2.md", "BACKLOG.md"];

$ grep -n "\.md\|readdir" scripts/redlines.mjs
（仅 R4a/R4b 对 git ls-files 做 .pyc / .env 检查；无根目录 .md 枚举）
```

结论：新增一份根目录 `.md` **不可能**破坏 `docs:check` 或 `redlines`（除非修改那 3 份被校验的文档本身——本次未修改）。

### 11.4 FX 参数可达性实测（S-P1-4 的证据）

```console
$ grep -rn "filterCutoff\|filterQ\|filterType\|saturationDrive\|chorusMix\|chorusRate\|bitDepth" src \
    --include=*.ts --include=*.tsx \
  | grep -v "src/audio/EffectsRack.ts\|src/audio/AudioEngine.ts\|src/audio/PolySynth.ts" | grep -v "\.test\."
src/audio/WavExporter.ts:47:  const bitDepth = 16;                                       # 同名局部变量，无关
src/audio/WavExporter.ts:48:  const bytesPerSample = bitDepth / 8;
src/audio/WavExporter.ts:80:  view.setUint16(34, bitDepth, true);
src/features/sequencer/hooks/useAudioEngineLifecycle.ts:243:        effectsRackState.filterCutoff,   # ← 读
src/features/sequencer/hooks/useAudioEngineLifecycle.ts:244:        effectsRackState.filterQ,        # ← 读
src/features/sequencer/hooks/useAudioEngineLifecycle.ts:245:        effectsRackState.filterType      # ← 读
src/features/sequencer/hooks/useAudioEngineLifecycle.ts:249:        effectsRackState.saturationDrive # ← 读
src/features/sequencer/hooks/useAudioEngineLifecycle.ts:253:        effectsRackState.chorusMix,      # ← 读
src/features/sequencer/hooks/useAudioEngineLifecycle.ts:254:        effectsRackState.chorusRate      # ← 读
src/features/sequencer/hooks/useAudioEngineLifecycle.ts:258:        effectsRackState.bitDepth        # ← 读
```

**7 个字段全部只有读点、0 个写点**（`Toolbar.tsx:1181-1232` 的 4 个按钮只写 `*Enabled` 布尔）。

### 11.5 跨视图状态实测

```console
$ grep -rn "createContext\|Provider" src/features/sequencer/useSequencerStore.ts
（无输出 —— useSequencerStore 是 per-call useReducer）

$ grep -n "new AudioEngine" src/views/*.tsx
src/views/HardwareConsoleView.tsx:124:    const engine = new AudioEngine({
src/views/CompareView.tsx:239:        engine = new AudioEngine({
src/views/CompareView.tsx:331:        engine = new AudioEngine({

$ grep -n "loadSavedProject\|saved.genreId" src/features/sequencer/useSequencerStore.ts
190:  const saved = loadSavedProject();
194:  if (saved && saved.genreId === genre.id) {
```

### 11.6 面板开关持久化实测

```console
$ grep -n "useState<boolean>\|useState(false)" src/views/StudioView.tsx | head
103:  const [isPlaying, setIsPlaying] = useState<boolean>(false);
107:  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
108:  const [isEditorMaximized, setIsEditorMaximized] = useState<boolean>(false);
116:  const [isVelocityLaneOpen, setIsVelocityLaneOpen] = useState(false);
118:  const [isEuclideanOpen, setIsEuclideanOpen] = useState(false);
119:  const [isAnalyzerOpen, setIsAnalyzerOpen] = useState(false);
131:  const [showAdvancedControls, setShowAdvancedControls] = useState(false);

$ grep -rn "localStorage" src/views/StudioView.tsx
（无输出）
```

---

## 勘误与声明

- **版本口径**：本文标题为 v2.0.0 是指**目标版本**；所有实测数字与 `file:line` 均取自**当前基线 v1.16.15 → v1.16.16**（发布 v1.16.16 时把测试规模与 `src/` 体量回填为实测值，交互/像素类数字仍取自 v1.16.15 基线的同一次量测）。实施过程中若基线版本推进，请以最新实测复核 §3.1 与 §9 的数字，不要沿用本文表格。
- **不在门禁内**：本文是**独立新增文档**，不参与 `npm run docs:check` 的 7 条断言（该校验集只含 `IMPROVEMENT_PLAN.md` / `ROADMAP_V2.md` / `BACKLOG.md`）。因此本文的数字漂移**不会被门禁拦住**——这是刻意选择（避免一次审查文档的新增就要求同步 3 份规划文档的版本号），代价是本文§9 的指标需要靠 G-01~G-05 的自动化测试来守护，而不是靠文档本身。
- **未做的事**：本次审查**没有**运行 `npm run slow` / `npm run test:e2e`（任务范围为文档规划与门禁核对）；测试规模在 v1.16.16 发布时已由集成方全量实测回填为 **63 文件 / 535 用例**。
- **一手数据来源**：§3、§9 中所有像素与控件计数均来自 §11.2 的原始 JSON；任何"应该能省 N px"的表述都以该 JSON 的字段相减得出，未做估算外推。

---

## 12. 交付记录

### v2.0.0 · S0 第一里程碑（布局偏好持久化）

**含项**：`D-01`（`layoutPrefs` 模块）、`D-02`（`StudioView` 接入）、`G-03`（持久化测试）。

| ID | 交付内容 | 证据 |
|---|---|---|
| **D-01** | 新增 `src/features/sequencer/layoutPrefs.ts`：键 `groove_layout_prefs_v1`，载荷内含 `version`；读写 5 个布局开关 + `density` 档位。**读失败一律回落默认且绝不抛错**；采用**逐字段修复**而非全量丢弃——一个坏字段不会带走其余四个好设置；未知 `version` 则整体回落（形状未知时不猜测） | 模块导出 `LAYOUT_BOOLEAN_KEYS` / `SESSION_ONLY_FLAGS` / `toPersistedShape`，使"持久化了哪些键"成为可断言的事实 |
| **D-02** | `StudioView` 的 5 个布局开关从裸 `useState(false)` 改为**挂载时读一次**（`bootLayoutPrefs`，避免每次渲染重读而与用户点击打架）+ **变更即写**的一次 `useEffect` | 5 个开关的初值全部来自 `bootLayoutPrefs.<key>`，由测试逐键断言 |
| **G-03** | 新增 `src/test/layoutPrefs.test.ts`：覆盖计划要求的四类非法输入（`null`/空、非法 JSON、未知 `version`、字段类型错误），另加**非对象载荷**、缺 `version`、`version` 类型错误、存储抛错（SecurityError/quota）、无 storage、以及"不得污染 `groove_project_v1`"与"清除只删自己的键" | 35 条用例 |

**D-06 的前置固化**：`isDrumsOnly` / `isKeyboardMode` / `isRecordArmed` 明确**不持久化**并在模块注释中写明理由（它们描述演奏中的实时状态，静默恢复会重新武装录音或重进只听鼓组）。测试从两个方向守护：类型层拒绝，以及**绕开类型**（模拟从 JSON 展开）时运行时过滤器仍然拦下。

**尚未做（按计划归属后续里程碑）**：
- **浏览器级"刷新后原样恢复"断言**属 `G-04`（v2.0.12 的 7 端 E2E 矩阵）。v2.0.0 目前的验证强度是：模块级往返（走真实 `localStorage`）+ 接线守护（源码级断言 5 个开关全部落盘、会话态不落盘）。这一区分是有意保留的，不把"单元测试通过"表述为"浏览器已验收"。
- `density` 档位的 UI 生效属 `C-06`（v2.0.6）；v2.0.0 只落地字段与持久化，档位默认 `standard`，尚无消费方。

**本轮附带**：目标版本号由 `v1.17.0 → v1.17.13` 改为 **`v2.0.0 → v2.0.12`**（计划内 21 处版本令牌、文件名、以及 `CODE_REVIEW_AND_PLAN_v1.16.0.md` 的交叉引用同步更新）。`package.json` 在**本里程碑完成并通过门禁时**才提升到 `2.0.0`——在此之前应用版本仍是 `1.16.20`，避免出现"2.0.0 已声明但功能未交付"的空窗。
