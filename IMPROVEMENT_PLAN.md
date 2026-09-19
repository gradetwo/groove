# GROOVE LAB 全面改进规划（代码功能 · UI · 交互 · 工程化）

> ⚠️ **历史文档（v1.0 基线）**：本文写于 v1.0（原始基线 commit `3e188c9`，54 个 TS/TSX 文件 / 95,047 行），
> 其中的结论与任务清单绝大部分已在 v1.1–v1.16 交付或重构。**当前代码审阅与改进规划请以
> [`CODE_REVIEW_AND_PLAN_v1.16.0.md`](./CODE_REVIEW_AND_PLAN_v1.16.0.md) 为准**；逐项交付状态与可复现证据见 `BACKLOG.md`。
>
> 版本 **v2.0.79** ｜ 基线 commit（同步时 HEAD）｜ 审阅范围：`src/` 全部 425 个 TS/TSX 文件、197,090 行
> （上述基线数字为 `d480684` 实测；A-06 清理零引用组件后为 202 个文件、137,541 行。§0 其余指标为 v1.0 当时实测，保留以示对照。）
> 所有结论均可通过文中 `file:line` 复核；文中所有数字均为本机实测值（`npm test` / `npx tsc --noEmit` / `npm run build` / `du` / `gzip`）。
> 配套任务清单见 `BACKLOG.md`。

> **执行说明（v1.16.13）**：文中提到的 21 个一次性 Python 生成器
> （`gen_*.py` / `data_*.py` / `builder.py` / `build_full_database.py` / `audit_genres.py` /
> `genres_electronic.py` / `update_genre_radar.py` / `generate_real_radar.py` /
> `apply_authentic_grooves.py` / `gen_index_relations_timeline.py` / `gen_p1.py`）
> 已确认无任何引用（既不互相 import，也不被 `build_all.py`、`package.py`、npm 脚本或 CI 调用），
> 因此在本版本中删除，仓库减重约 485 KB。同类的一次性 JS 脚本
> （`analyze_ternaries.js`、`build_genre_data.js`、`data_builder_core.js`、
> `codemod_tokens.js`、`genres_def.js`）同样已无引用，一并删除。
> 当前数据管线入口：
> - `python3 -m scripts.build_all`（校验 159 条曲风）与 `python3 scripts/package.py`（`npm run package`）
> - `npm run data:lint`（`vite-node scripts/lint_genres.ts`：159 曲风 + 300 关系 + 11 条时间线故事的硬规则审计，此前是无人调用的孤儿脚本，v1.16.13 起接入 CI 与慢轨）
> - `npm run data:index`（`vite-node scripts/build_genre_index.ts`：重新生成轻量索引，实测重新生成后与仓库文件逐字节一致）
> - 数据正确性由 `npm run lint:data` 的 6 个 Vitest 门禁承担（schema 全字段、内容审计、索引漂移、曲风 id 引用、外链可校验）
> 下文 §P1-14 与 §570–571 提到的文件名属于 v1.0 当时的状态，保留作为历史记录。

---

## 0. 摘要（TL;DR）

**一句话结论：产品完成度已经很高（159 曲风 + 8 轨音序器 + 4 种探索视图 + 双语），但"能跑"与"正确、可维护、可规模化"之间还有明显断层——问题集中在音频正确性、首屏体积、i18n 真实覆盖率、无障碍与工程化基建五处。**

### 0.1 基线健康度

| 项目 | 实测结果 | 判定 |
|---|---|---|
| `npx tsc --noEmit` | 0 error | ✅ |
| `npm test` | 4 文件 / 21 用例全过（5.5s） | ⚠️ 覆盖极窄 |
| `npm run build` | 成功，15s，`dist/assets` 35 文件 2.0MB | ✅ |
| 首屏实际传输 | **≈1,131KB 原始 / ≈249KB gzip**（16 条 `modulepreload`；gzip 为逐文件求和，近似真实传输量） | ❌ 其中 **174KB gzip（70%）是暂时用不到的曲风数据** |
| 生产依赖 | react / three / lucide-react / clsx / tailwind-merge（精简） | ✅ |
| 工程化基建 | ESLint、Prettier、CI、ErrorBoundary、监控 **全部缺失** | ❌ |

### 0.2 五条改进主线

| 主线 | 核心内容 | 解决什么 |
|---|---|---|
| **① 止血** | 12 项 P0 正确性缺陷 + 3 项"文档承诺未实现" | 削波爆音、算法失效、内存/定时器泄漏、界面显示错误文案 |
| **② 打地基** | 设计令牌 + 共享组件库、i18n 真正落地、路由与深链、Studio 状态收敛、数据层懒加载 + Schema 校验、CI | 让后续每一行代码都更便宜、更快 |
| **③ 性能与无障碍** | Studio 渲染拆解、Galaxy 逐帧优化、时间线虚拟化、WCAG 2.1 AA 达标 | 移动端可用、达标 PRD 第 7.5 节 |
| **④ 功能补全** | 音序器专业能力、Compare 真同步播放、详情页字段补齐、探索视图统一 | 兑现 PRD 第 5 章 |
| **⑤ 差异化进阶** | 离线渲染 WAV/分轨、MIDI 导入、Inspire Me 变异、真 PWA | 从"学习网站"变成"制作工具" |

### 0.3 关键指标目标（12 周后）

| 指标 | 当前 | 目标 |
|---|---|---|
| 首屏 gzip（JS+CSS） | 249 KB | **≤ 90 KB** |
| LCP（中端安卓 4G） | 未测 | **≤ 2.0 s** |
| 音序器播放期单帧重渲染 | 512 个 step cell | **≤ 8 行（行级 memo）** |
| Galaxy 帧率（桌面 / 移动） | 每帧 504KB 缓冲重传 | **≥ 30 / ≥ 24 fps，逐帧上传 ≤ 64KB** |
| 首屏音频削波 | 8 轨齐响 ≈6×FS 硬削 | **0 削波（限幅器 + 安全上限）** |
| i18n 真实覆盖率 | 518 行硬编码 CJK + 11 个 key 缺失 | **100% 走 `t()`，缺失 key 编译期报错** |
| 无障碍 | `role=` 0 处、`aria-label` 7 处、无 reduced-motion | **Lighthouse a11y ≥ 95、axe 0 critical** |
| 测试 | 21 用例，视图 0% 覆盖 | **逻辑层 ≥70%，视图冒烟 + 1 条 E2E** |
| CI | 无 | **tsc + lint + test + 数据 lint + 体积预算全绿门禁** |

---

## 1. 现状盘点

### 1.1 代码体量分布（实测）

| 区域 | 文件 | 行数 | 占比 | 备注 |
|---|---|---|---|---|
| `src/data/genres/` | 15 | 77,273 | 81% | 159 个曲风的 TS 字面量，**1.7MB** |
| `src/views/` | 10 | 9,583 | 10% | StudioView 单文件 **2,954 行** |
| `src/components/` | 11 | 1,575 | 1.7% | 含 3 个 seq 弹窗、2 个乐器可视化 |
| `src/audio/` | 8 | 2,235 | 2.4% | 全合成音频引擎（无采样文件） |
| `src/data/*`（关系/星云/时间线） | 5 | 2,837 | 3% | `relations.ts` 1,424 行 |
| `src/utils` + `i18n` + `types` + `App` | 6 | ~700 | <1% | |
| `src/test/` | 4 | 417 | 0.4% | 21 用例 |

**结论：真正需要人手维护的"应用代码"约 14,500 行，其中 20% 集中在一个文件里（StudioView）。**

### 1.2 架构现状

```
index.html ── main.tsx ── App.tsx（LanguageProvider + 7 个 React.lazy 视图 + 手写 tab 状态机）
                              │
        ┌─────────────────────┼───────────────────────────────┐
        │                     │                               │
   AudioEngine（每视图各 new 一个）            ALL_GENRES / GENRES_MAP（静态全量）
   ├ AudioWorkerBridge → audioClockWorker       └ 14 个 genre-*.ts（159 曲风，首屏全量）
   ├ SoundBankManager（buffer 合成为死代码）
   ├ ChordAudioEngine（钢琴/吉他建模，setTimeout 链）
   ├ MidiExporter（SMF Type 0）
   ├ Euclidean（Bjorklund，实现有误）
   └ SequencerUrlShare（base64 状态编解码，无校验）
```

| 模块 | 职责 | 主要问题 |
|---|---|---|
| `App.tsx` | 视图路由（`useState`）、选曲、对比池、analyser 透传 | 无路由/无 URL 写入、`handleEngineReady` 定时器泄漏、`onOpenStudioWithChords` 空实现 |
| `views/StudioView.tsx` | 8 轨步进音序器 + 曲风选择 + 工具栏 | 单文件 2,954 行 / 26 个 state / 0 个 memo / 每步全量重渲染 |
| `views/GalaxyView.tsx` | Three.js 星云图（159 节点 + 4.2 万粒子） | 实例数极干净，但逐帧 504KB 缓冲重传、标签偏移 64px、无上下文丢失处理 |
| `views/{Horizontal,Vertical}TimelineView` | 年代演化轴 | 纯 DOM 3700+ 节点、无虚拟化、分桶重复、逐段复制 |
| `views/{Compare,Challenge,GenreDetail,ChordProgressions}View` | 对比 / 听辨 / 详情 / 和弦 | 见 §2 清单 |
| `audio/AudioEngine.ts` | lookahead 调度 + 全合成音源 | 无 limiter、无 voice 登记、双重时钟、`disconnect()` 0 处 |

### 1.3 打包与首屏（实测）

| 产物 | 原始 | gzip（逐文件求和） |
|---|---|---|
| 14 个 `genre-*.js` | 810 KB | **174 KB** |
| `vendor-react` | 143 KB | 46 KB |
| `vendor-icons` | 24 KB | 5 KB |
| `index` | 26 KB | 10 KB |
| CSS | 108 KB | 16 KB |
| **首屏合计（16 条 `modulepreload` + 样式表）** | **≈1,131 KB** | **≈249 KB** |
| `vendor-three`（懒加载，仅打开星系图时） | 506 KB | 127 KB |

> 说明：若把全部文件拼接后统一 gzip，会因跨文件共享字典而低估到 ≈224KB；上表按逐文件 gzip 求和，更接近真实网络传输。

**关键事实：`vite.config.ts:20-50` 的 `manualChunks` 只做到了"分块"，没有做到"懒加载"**——因为 `src/data/genres/index.ts:1-15` 静态 import 了全部 14 个模块，`App.tsx:6` 又静态引用 `ALL_GENRES`，于是 `dist/index.html` 里出现 14 条 `modulepreload`，用户在首屏就必须下载 159 个曲风的全部双语长文本（制作技巧、文化背景、代表作品…），而其中 99% 在本次会话中不会被阅读。

### 1.4 PRD 符合度矩阵

| PRD 条款 | 状态 | 证据 |
|---|---|---|
| 5.2.3.1 16/32/64 步可编辑 | ✅ 部分 | 长度 16/32/48/64；gate（步长）字段无实现 |
| 5.2.3.2 每轨 静音/独奏/音量/声像 | ⚠️ | M/S/音量 ✅；**声像 `pan` 全仓库无 `StereoPanner`，是死状态** |
| 5.2.3.2 轨内随机生成 / 复制粘贴 | ⚠️ | 有"智能填充"，无复制粘贴、无轨排序 |
| 5.2.3.3 节拍器（可选） | ❌ | 无 |
| 5.2.3.4 演示/编辑双模式 | ❌ | 词条 `mode_demo/mode_edit` 残留但代码已删 |
| 5.2.3.5 滤波/包络/混响/延迟发送 | ❌ | 无 send bus、无效果器 |
| 5.2.3.6 MIDI 导出 + 分享链接 | ⚠️ | 均可用，但**都与听感不一致**（见 P0-13/14） |
| 5.2.3.7 触控 44×44pt / 滑动涂抹 / 触觉 | ⚠️ | 有涂抹与触觉；44px 用伪元素撑开导致 512 个热区重叠 |
| 5.3.2 星系 缩放/拖拽/筛选/搜索定位/聚类/图例 | ⚠️ | 缩放拖拽图例 ✅；**筛选无 0 结果提示、搜索框 `searchQuery` 是死代码、无聚类** |
| 5.4.2 水平轴 筛选/演变动画/地域视图 | ⚠️ | 动画 ✅；地域视图 ❌；**分桶 bug 导致 1900–1950 曲风重复渲染** |
| 5.5 垂直轴 折叠/筛选/移动端顶部圆点 | ⚠️ | 卡片 ✅；折叠/筛选部分；移动端未做顶部圆点方案 |
| 5.6.1.2/1.3 详情页字段 | ❌ 缺 | **`instrumentation / chord_inversions / sound_design / rhythm_features / structure / representative_artists / swing / tempo` 全部未渲染** |
| 5.6.1.4 关系区 + 小型关系图 | ❌ | `parent_genres / subgenres / related_genres` **159/159 全为空数组**，UI 永不渲染 |
| 5.6.1.5 内嵌简化音序器 | ❌ | 只有 16 步灯条，非音序器 |
| 5.7.2.3 同步播放两个 Groove | ❌ | 单引擎 destroy→rebuild，同一时刻只响一个 |
| 5.7.2.2 差异高亮 / 相似度 | ⚠️ | 相似度**只比较前两列**，3–4 列时数字误导 |
| 5.8 挑战 难度/统计/正确率 | ⚠️ | 三难度存在但 medium 与 hard 池相同；正确率未显示；成绩不持久化 |
| 7.1 首屏 ≤3s | ⚠️ | 213KB gzip 首屏，中端移动网络有风险 |
| 7.1 音序器延迟 ≤50ms | ✅ | Worker + 20ms tick + 200ms lookahead |
| 7.2 iOS 首次交互解锁 | ⚠️ | 有 unlock 监听，但 ChallengeView 在 useEffect 里自动 `play()` 必无声 |
| 7.5 WCAG 2.1 AA / 键盘 / 屏幕阅读器 / reduced-motion | ❌ | `role=` 0、`aria-label` 7、无 reduced-motion、无焦点管理 |
| 7.7 完整双语 | ❌ | 518 行硬编码中文/英文 + 11 个缺失 key 直接显示字面量 |
| 7.8 PWA 离线 | ❌ **文档与实现相反** | `main.tsx:7-20` 主动反注册 SW 并清空所有 cache；`public/sw.js` 自我注销 |
| 10.2 全部长文本双语 | ✅ | 数据层 `I18nString` 结构完整 |

---

## 2. 问题总清单

分级标准：
- **P0 正确性/安全**：会产生错误声音、错误数据、崩溃、泄漏或明显错误文案，必须最先修。
- **P1 体验/性能/可维护性**：用户可感知的卡顿、体积、不可访问、难以扩展。
- **P2 完善与增强**：新能力、新体验。

### 2.1 P0 正确性与安全性（12 项）

| # | 问题 | 证据 | 影响 | 修复方案 |
|---|---|---|---|---|
| P0-1 | **Euclidean 算法完全失效** | `Euclidean.ts:23-45`：用 `lastSeq.length` 判定 remainder，初始序列长度恒为 1 → `headCount=0`，立即 `break` | `generateEuclidean(8,3)` 实测 `11100000`（应为 `10010010`）；8 个预置节奏全错 | 改用经典 Bjorklund（比较首元素长度）；补**精确序列断言**测试 |
| P0-2 | **8 轨齐响硬削波** | 全仓库 0 处 `DynamicsCompressor`；`AudioEngine.ts:100` master 0.8、`:217` 允许 1.5 | 各轨峰值估算和 ≈6×FS，destination 硬削，是"爆音"根因 | master 总线加 `DynamicsCompressor` 限幅 + 软削波 + 安全上限；per-track gain 归一 |
| P0-3 | **100ms 定时器永久泄漏** | `App.tsx:78-86` 返回 `clearInterval`；`StudioView.tsx:363-365` 当普通回调调用，返回值被丢弃 | 每次挂载泄漏一个 interval，对已 `close()` 的 ctx 持续 setState，并每 100ms 重渲染整棵树（StrictMode 下翻倍） | StudioView 改为 `useEffect(() => onAudioEngineReady?.(engine), [])` 并消费返回值；或改为 `onPlayingChange` 回调 |
| P0-4 | **和弦 → 工作台链路完全未实现** | `App.tsx:137-139` 收到 `chords` 只 `setCurrentTab("studio")`；`ChordProgressionsView.tsx:50,54` 声明 prop 后**全文从未调用**；StudioView 无初始和弦入参 | "Load to Studio" 按钮语义错误，用户认知落空 | 建立 `pendingChords` 提升状态 + StudioView 接收 `initialChords`；类型从 `string[]` 改为 `ChordDefinition[]` |
| P0-5 | **Cmd/Ctrl+K 是假承诺** | `GlobalSearch.tsx:33-46` 打开分支为空注释；App/Header 无全局快捷键；`Header.tsx:152` 却写着 `title="Search (Cmd+K)"` | 用户按快捷键无反应 | App 级注册全局 `keydown`（含 `/` 快捷键），Header 提示随平台显示 `⌘K`/`Ctrl K` |
| P0-6 | **ChallengeView 引擎泄漏 + 难度双触发** | `ChallengeView.tsx:165-168` 手动建引擎，`:124-131` 的 effect 依赖 `difficulty` 又建一次，旧引擎未 destroy | 每次切难度泄漏一个 AudioEngine + AudioContext | 合并为单一 effect；引擎生命周期收敛到 `useRef` + 统一 cleanup |
| P0-7 | **听辨题被文字泄题** | `ChallengeView.tsx:270-274` 无条件显示 `TEMPO CLUE: {default_bpm} BPM`；`:332-333` 选项卡片直接印出 `category` 与 `bpm_range` | 盲听训练失去意义 | 提示改为"答后解锁"或扣分揭示；选项卡片只保留曲风英文名 |
| P0-8 | **分享链接无任何校验（可构造 DoS）** | `SequencerUrlShare.ts:82-135` 只检查 `payload.g/t` 存在；`payload.t` 长度、`stLen` 无上限，`ct.st` 直接当 steps 用 | 恶意 base64 可注入巨量数组/步数导致页面卡死 | 白名单 + 上限：tracks ≤16、steps 长度 ∈{16,24,32}、bpm 20–300、swing 0–100、step ∈0..3、totalSteps ≤64 |
| P0-9 | **无 ErrorBoundary** | 全仓库 0 处 `componentDidCatch` | 任一渲染异常 = 整页白屏（GalaxyView WebGL 不可用时必现） | `<ErrorBoundary>` 包裹 App 与每个 lazy 视图，提供重试 + 降级列表 |
| P0-10 | **BPM 解析全面失效** | 154/159 曲风用 en-dash `–`，而 `GlobalSearch.tsx:69`、`CompareView.tsx:203-206` 按 `"-"` 切分；`GlobalSearch.tsx:175` 把 `bpm_range` 当数组下标 | BPM 数值搜索失效；界面渲染出 `1-2 BPM`；相似度 BPM 判定失效 | 抽 `parseBpmRange()` 到 `utils`，按 `/[–—-]/` 拆分 + 5 个特例（ambient/free-jazz/progressive-rock/math-rock/grime）兜底 |
| P0-11 | **i18n 缺失 key 直接显示字面量** | `StudioView.tsx:1022,1641-1806,2131` 引用 11 个不存在的 key：`era/place/range/keyLabel/time/dna/harm/tips/refs/compare/export`；`t()` 缺失时原样返回 key（`LanguageContext.tsx:184-188`） | 中英界面都会出现 "era"、"place"、"dna" 等英文碎片 | 补齐 key；`t()` 加 dev 警告 + key 联合类型；重建类型安全字典 |
| P0-12 | **详情页 BPM 显示与播放不一致** | `GenreDetailView.tsx:78` bpm 初值不随 genre 重置，`:82-98` 引擎却用 `genre.default_bpm`；`:293-300` 清空输入 → `Number("")=0` → clamp 40 | 显示了错误的 BPM；输入框空白但引擎跑 40 | `bpm` 用 `useEffect([genre])` 重置；空值走单独 `string` 状态，非法输入不提交 |

**补充 P0（时间线/星系正确性）**

| # | 问题 | 证据 | 修复 |
|---|---|---|---|
| P0-13 | **水平时间线分桶重复** | `HorizontalTimelineView.tsx:408` 1920 与 1940 共用 `<=1950` → 1900–1950 约 18 个曲风在两列各渲染一次；且缺 1950s 列（数据中确有 7 个） | 用区间 `[start, end)` 分桶并补 1950s 列 |
| P0-14 | **Galaxy 标签/拾取系统性偏移 ~64px** | `GalaxyView.tsx:329-335,966-975` 用 `window` 尺寸而非 `canvas.getBoundingClientRect()`；容器 `h-[calc(100vh-64px)]` + sticky header | 统一以 canvas rect 计算 projection 与命中测试 |
| P0-15 | **Polymeter 播放头与声音错位** | 引擎按 `step % trackLen`（`AudioEngine.ts:385`），高亮用绝对 `currentStep === stepIdx`（`StudioView.tsx:2519`、`VelocityLane.tsx:237`） | 高亮统一为 `currentStep % (trackLength ?? stepCount) === stepIdx` |
| P0-16 | **Space 劫持表单 + 键盘监听每次编辑重订阅** | `StudioView.tsx:564` 只排除 `input/textarea`，页面有 6 个 `<select>`；`:562-615` 依赖含 `pattern` 派生的回调 | 排除 `select/button/[contenteditable]`；handler 用 ref 化回调，依赖收成 `[]` |
| P0-17 | **撤销/重做覆盖不全且与引擎脱钩** | 仅 7 处 `pushHistorySnapshot`（`689/919/1006/1353/1381/1398/1422`），力度绘制/P-Lock/Euclidean/轨音量/拍号/精度/M-S 全部不入栈；快照只含 `pattern`；`StudioView.tsx:313-328` 撤销后不重置引擎 `trackStates` | 抽 `commitPattern(mutator,{snapshot})` 单一入口；快照纳入 bpm/swing/meter/mutes/solos |
| P0-18 | **拍号数学错误** | `StudioView.tsx:1095` 死代码；3/8 在 1/16 下得 12 步/小节（应 6）；`:1105-1110` 对 3/2 拍硬编码 | 统一 `stepsPerBar = groupSize × (16/denominator)` |
| P0-19 | **挑战页 iOS 首题无声** | `ChallengeView.tsx:118,124-127` 在 effect 中自动 `play()`，无用户手势；`resume()` 无 catch | 首题改为"点击开始"手势内启动；所有 `resume()` 加 `await` + catch |

### 2.2 P1 体验 / 性能 / 可维护性

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| P1-1 | 首屏预载全部 159 曲风数据 | `dist/index.html` 16 条 `modulepreload` | 首屏 249KB gzip，其中 174KB 是冗余 |
| P1-2 | Studio 每步全量重渲染 | `StudioView.tsx` 2,954 行单组件、0 个 `React.memo`；`currentStep`（每个 16 分音符）与 `trackFlashTimes` 触发 512 cell + 48 chip 重渲染；每 cell 7 个内联箭头 handler ≈3500 闭包/帧 | 低端设备掉帧、耗电 |
| P1-3 | Galaxy 逐帧 504KB 缓冲重传 | `GalaxyView.tsx:1149-1165` 写 `position` 后 `needsUpdate=true`，未用 `updateRanges`；每帧 ≈6400 次 `samplePt` | 60fps 下约 30MB/s 带宽浪费 |
| P1-4 | Galaxy 无容错/无暂停 | 0 处 `webglcontextlost`、`visibilitychange`、`ResizeObserver` | 上下文丢失永久黑屏；后台标签仍渲染 |
| P1-5 | 时间线 3700+ DOM 节点、159 个常驻 `backdrop-blur-xl` tooltip | `HorizontalTimelineView.tsx:863-894` | 首屏与滚动卡顿 |
| P1-6 | 无障碍近乎为零 | `role=` 0、`aria-label` 7、`alt` 0、无焦点陷阱、无 `prefers-reduced-motion`；抽屉 Esc 不关闭 | 违反 PRD 7.5；键盘/读屏用户不可用 |
| P1-7 | i18n 双轨制 | 321 处内联 `language === "zh" ? … : …`，518 行硬编码 CJK；词典 107 key（44 个已成死词条） | 每次加文案都要改多处，无法扩展第三语言 |
| P1-8 | 无路由/无深链 | 全仓库 0 处 `pushState/replaceState`；`App.tsx:37-52` 只监听 `popstate` 且首屏不执行 | 无法分享/收藏/后退，搜索与探索视图之间无法互相定位 |
| P1-9 | 分享/MIDI 有损 | `SharedSequencerState` 缺 `ratchet/probability/gate/trackLength`；`MidiExporter.ts:71` 固定 `ticksPerStep*0.85`，忽略 swing/gate/ratchet/概率/polymeter/mute-solo；pitch 语义与引擎冲突（`>24` 绝对音高启发式） | "导出/分享"与听感不一致 |
| P1-10 | 音频层脆弱 | 双重时钟（worker + 同频 `setInterval`，`AudioEngine.ts:285,288`）；`stop()` 不取消已排程 voice；0 处 `disconnect()`；`pan` 死状态；`destroy()` 不摘 window 监听 | 停止后残响、内存缓增、状态错乱 |
| P1-11 | 音频测试形同虚设 | `vitest.config.ts` environment `node` → `AudioEngine.ts:93` 提前 return，`audio.test.ts:138-159` 从未创建 AudioContext | 音频零覆盖，Euclidean bug 因此漏网 |
| P1-12 | 数据质量 | `parent_genres/subgenres/related_genres` 159/159 全空；relations 仅 65 个 source；`steps` 实际取值 0–3 与类型注释冲突；795 条 track link 全是 YouTube 搜索链接；`sources` 477 条只有 3 种字符串；5 个曲风年份 >2025 | 详情页关系区永不渲染；星系图"演化谱系"稀疏；数据不可信 |
| P1-13 | 无工具链 | 无 ESLint/Prettier/CI/`typecheck` 脚本/体积预算/ErrorBoundary/监控；`sourcemap:false` | 回归靠人眼 |
| P1-14 | 生成管线不可复现 | Python 管线混用 cwd 假设，`python3 scripts/update_genre_radar.py` 实测 ImportError；Node 一代脚本是空壳只 print；scripts 与数据不同步（数据已被手工改过） | 无法安全重跑生成器 |
| P1-15 | 设计令牌未落地 | 1,707 处硬编码 hex（约 20 种颜色）；`index.css` 已定义 CSS 变量但组件不用；`tailwind.config.js` 声明 `Inter` 却从未加载；`animate-fade-in/no-scrollbar` 等类名在配置中不存在（静默失效） | 改色要全局替换；部分动画/滚动条样式根本没生效 |
| P1-16 | 排版过小 | 416 处 ≤12px 字号（含 100 处 10px、19 处 9px、10 处 8px、2 处 7px）；205 处 `font-bold` | 移动端与详情页可读性差，不达 WCAG |
| P1-17 | 触摸热区与安全区 | 44px 靠 `::after` 伪元素撑开 → 512 个热区重叠抢点击；无 `viewport-fit=cover`、无 `safe-area-inset`、无横屏布局 | iOS 体验缺陷 |
| P1-18 | 状态三副本 | `pattern` / `mutes-solos` Set / 引擎 `trackStates` 三份真源，40+ handler 手工同步；多处 **在 setState updater 内调 `engine.setPattern`**（StrictMode 下双调） | 状态漂移、难调试 |
| P1-19 | 重复与死代码 | pad/trim 四份、ratchet 两段 25 行逐行重复、`isHat` 判定 5 处；StudioView 14 个未使用 import；`Breadcrumbs.tsx` 恒返回 `null`；`searchQuery` 死 state；`SoundBankManager` 的采样合成无调用者；`ToneTransport` 是伪造 API | 维护成本 |
| P1-20 | PWA 名存实亡 | 无 `serviceWorker.register`；`main.tsx:7-20` 主动反注册 + 清 cache；`public/sw.js` 自我注销；图标声明 192/512 实为 SVG | DEPLOY.md 与 PRD 的"离线优先"承诺不成立 |

### 2.3 P2 完善与增强（摘要，详见 §3）

- 音序器：Pattern A/B 与链式/Song Mode、Gate 编辑、每轨 Swing、Track 拖拽排序、鼓组音色编辑器、节拍器/预备拍/Tap Tempo、自动保存、力度/概率/Ratchet 画布化 Lane、A/B 盲比、Inspire Me 受控变异。
- 音频：Reverb/Delay send-return、Master limiter 可视化、WAV 离线渲染、分轨导出、MIDI 导入、Web MIDI 输入、键盘/Pad 演奏、延迟校准与听力保护。
- 内容：详情页补齐 8 个未渲染字段 + 内嵌迷你音序器；Compare 真·同步播放（多引擎对齐）；探索视图统一脚手架 + 列表/筛选兜底视图；关系图谱回填。
- 平台：真 PWA（版本化 SW + 更新提示）、`_headers` 缓存策略、Sentry/轻量分析、深浅色之外的品牌化主题。

### 2.4 文档与实现不符（承诺缺口）

| 文档承诺 | 实现 | 处置建议 |
|---|---|---|
| `DEPLOY.md` / `prd.md 7.8` "离线优先 PWA、Cache First、SW 更新提示" | SW 自我注销，`main.tsx` 主动清缓存 | **决策点 D1**：按 Phase 4 重做真 PWA，或删除文档承诺与 manifest |
| `prd.md 7.5` "WCAG 2.1 AA" | 0 `role`、无 reduced-motion | 按 Phase 2 达标 |
| `prd.md 7.7` "所有 UI 文案双语" | 518 行硬编码 | 按 Phase 1 达标 |
| `prd.md 10.2` "≥150 曲风、每曲风 ≥5 代表作、双语" | ✅ 满足（159；`genres.test.ts` 有断言） | 保持 |
| `DEPLOY.md` "12 项测试"（实际 21 项） | 文档过期 | Phase 0 顺手更新 |
| `AudioEngine.ts:31-39` "Tone.js Transport & AudioWorklet 兼容接口" | 无 `tone` 依赖、无消费者 | Phase 0 删除 |

---

## 3. 代码功能规划

### 3.1 音序器能力矩阵

| 能力 | 现状 | 目标 | 阶段 |
|---|---|---|---|
| 步进网格 | 16/32/48/64，单击/拖拽涂抹 | ＋框选、＋区间循环 | P3 |
| 力度 | VelocityLane 抽屉（5 预设、拖拽） | ＋曲线/画笔/强度、＋随机人性化 | P3 |
| Gate（步长） | **类型字段，零实现** | 每步 gate 编辑 + 引擎/MIDI/分享全链路 | P3 |
| Ratchet / 概率 | 右键 P-Lock 菜单可设 | ＋画布可视化、＋引擎与导出对齐 | P3 |
| 音高 P-Lock | PitchPicker 弹窗 | ＋网格内直接拖拽改音高 | P3 |
| Polymeter | 每轨 L 循环 | ＋可视长度尺、＋修复播放头错位 | P0→P3 |
| Swing | 0–75% 全局滑条 | ＋8th/16th 模板、＋每轨偏移 | P2 |
| Pattern | 单一 pattern | **＋A/B 双 pattern、＋链式 Song Mode、＋A/B 盲比** | P3 |
| 预设 | 159 曲风预设 + 智能填充 | ＋曲风内 A/B 变体、＋Inspire Me 受控变异 | P4 |
| 轨 | 8 轨 M/S/音量/清空/移动 | ＋声像（需 pan 总线）、＋拖拽排序、＋乐器选择 | P3 |
| 运输 | 播放/停止/撤销/重做 | ＋节拍器、＋预备拍、＋Tap Tempo、＋循环区间 | P3 |
| 导出 | MIDI（与听感不一致） | ＋对齐 swing/gate/ratchet/概率/mute | P3 |
| | | ＋WAV 离线渲染、＋分轨 stem | P4 |
| 分享 | URL base64（有损、无校验） | ＋无损（位打包）、＋校验、＋短链感 | P0(校验)→P3 |
| 编辑历史 | 7 处入栈 | ＋全覆盖、＋持久化 | P0→P3 |
| 持久化 | 仅语言 | ＋自动保存当前工程（含版本迁移） | P3 |

### 3.2 各视图功能补全

**StudioView**：工具栏按"运输 / 编辑 / 导出"三段重排；小节跳转改为独立 state（当前被 `currentStep` 覆盖）；增加键盘演奏模式（V/E 已有雏形）。

**GenreDetailView**（对齐 PRD 5.6）：
- 补齐 `instrumentation`、`chord_inversions`、`sound_design`、`rhythm_features`、`structure`、`representative_artists`、`drum_pattern.swing/tempo`。
- 关系区：把 `GENRE_RELATIONS` 反查为父/子/相关三组（替代恒空的三个数组），并渲染小型关系图。
- 内嵌迷你步进音序器（复用 `StepCell`，只读 + 播放）。
- 修复 BPM 状态、空输入、别名按语言过滤。

**CompareView**：
- 相似度改为**矩阵式**（全列两两 + 整体一致性），并明确标注算法口径。
- 真正同步播放：每列一个轻量引擎 + 共享 transport 时钟（或 master 引擎调度多轨），支持逐列 solo/静音。
- 雷达图加 `role="img"` + `<title>` + 可展开数据表；补齐 PRD 要求的结构/配器/艺术家字段。
- 下拉支持 Esc / 点击外部关闭 / `aria-expanded`。

**ChallengeView**：
- 移除泄题元素；`bestStreak`/`totalAnswered`/正确率上屏；成绩 `localStorage` 持久化 + 出题 anti-repeat（最近 N 题排除）。
- 难度池真正分层（按 `subgenres`/`popularity`/年代分区），排位阈值按难度归一。
- 首题手势启动；答后解锁"曲风解析卡"。

**ChordProgressionsView**：打通到 Studio 的交接（P0-4）；修 `duration || 4`、`selectedChordIdx` 竞态、硬编码 D 大调音阶提示；琴键/琴弦按传入 midi 发音；钢琴标题与音域一致（36 键 C3–B5）；和弦块 `role="button"` + 键盘操作。

**GlobalSearch**：全局快捷键（P0-5）；修 `bpm_range` 解析；结果 >15 条给"还有 N 条"；最近搜索；结果行改 `<button>`/`<li role="option">`；模态语义与焦点陷阱；空态走 i18n；增加"在星图中定位"「在对比中加入」动作。

**探索三视图统一**：抽 `<ExploreScaffold>`（顶部筛选栏 + 分类 chips + 空/载/错态 + 底部分支列表），抽 `useGenreAudition()`（6 处 `AudioEngine` 生命周期逐行重复）与 `useGenreGraph()`（统一 `MAJOR_CLUSTERS` / 内嵌 `LANES` / `TIMELINE_STORIES` 三套并行分类法）；补 Explore 列表视图作为 WebGL/大 DOM 的兜底与无障碍入口。

### 3.3 全局能力：路由 / 深链 / 持久化 / 分享

```
目标 URL 契约
/                     → studio
/studio?genre=deep-house
/genre/deep-house
/compare?ids=a,b,c
/challenge?difficulty=medium
/explore/galaxy?genre=future-bass
/explore/timeline?decade=1990&category=Electronic
/chords?progression=axis&key=C
/s/2VybW…            → 分享的 pattern（只读视图 + "复制到工作台"）
```

- 引入轻量路由（见决策点 D3：`react-router` 或 ~1KB 自研 hash/History 封装）。
- 首屏解析 URL；所有导航写 URL（`replaceState` 用于 tab 切换，`pushState` 用于详情跳转）。
- 未知参数走校验函数（与 P0-8 共用同一套 schema）。
- 持久化清单：`groove_language`（已有）、`groove_project_v1`（当前工程 + 迁移版本号）、`groove_recent_searches`、`groove_challenge_stats`、`groove_prefs`（reduced-motion 覆盖、音量、默认视图）。

---

## 4. 代码架构规划

### 4.1 目标目录结构

```
src/
├─ app/            # App、路由、Providers、ErrorBoundary
├─ features/
│  ├─ sequencer/   # StudioView 拆解后的组件 + useSequencerStore + 引擎适配
│  ├─ explore/     # Galaxy / Timeline(H,V) / List + 共享 ExploreScaffold
│  ├─ compare/  challenge/  chords/  detail/
├─ audio/          # engine/（AudioEngine、voice、scheduler、fx、render）
│  └─ engine/
├─ data/
│  ├─ genres/      # 原始数据（保持）
│  ├─ index/       # 轻量索引（id/name/category/bpm/aliases）— 首屏唯一入口
│  └─ schema.ts    # 运行时校验（zod/valibot 或手写 validator）
├─ i18n/           # messages/{zh,en}.ts（按 feature 分文件）+ 类型安全 t()
├─ ui/             # 设计系统：Button/IconButton/Card/Chip/Modal/Drawer/Slider/Tooltip/EmptyState
├─ lib/            # router、storage、parseBpm、haptics、format
└─ test/
```

### 4.2 状态管理

**问题**：StudioView 26 个 `useState` + 3 份真源 + updater 内副作用（StrictMode 双调）。

**方案**：
1. 引入 `useSequencerStore`（`useReducer` + Context，或 zustand 若允许新增依赖）：
   ```
   state = {
     pattern, mutes, solos, bpm, swing, meter, resolution,
     history: {past[], future[]}, dirty, projectId
   }
   dispatch: TOGGLE_STEP | PAINT_STEPS | SET_VELOCITY | SET_RATCHET | SET_PROB |
             SET_GATE | SET_PITCH | TRACK_* | SET_PARAM | UNDO | REDO | LOAD_PRESET
   ```
2. **`mutes/solos` 写入 `track.mute/track.solo`**，与 `SequencerTrack` 类型同源，消灭 Set 副本。
3. **所有变更经 `commit(action, {snapshot})` 单一出口**：一处推历史、一处 `engine.applyPatch(diff)`（增量命令，替代 36 处 `JSON.parse(JSON.stringify())` + 全量 `setPattern`）。
4. 引擎侧改为 `useRef` 单例 + StrictMode 安全初始化（在 `useEffect` 里创建并返回真正的 cleanup）。
5. 视图级状态（抽屉开合、hover、toast）留在本地；跨视图状态（选中曲风、对比池、待载入和弦、语言、偏好）进 `AppState` Context。

### 4.3 音频层规划

| 层 | 目标设计 |
|---|---|
| 时钟 | **单一时钟源**：worker 负责 tick（`postMessage` 回传时间戳），主线程只做排程；删除同频 `setInterval` 与死代码 `CALCULATE_TRANSPORT_STEP` |
| 总线 | `track gain → track pan(StereoPanner) → bus → [master compressor] → master gain → analyser → destination`；预留 `sendA/sendB` 用于 reverb/delay |
| voice 管理 | **voice registry**：每个振荡器/噪声源登记，`stop()`/`pause()` 时 5ms ramp + `source.stop()` panic，杜绝残响；`onended` 自动 `disconnect()` |
| 上下文 | **全局共享单例 AudioContext**（跨视图复用，避免 6 个视图各建一个）；`latencyHint:'interactive'`；`resume()` 全面 `await + catch`；首次手势 gate |
| 可测性 | 抽 `ISynthBackend` 接口，测试用 `OfflineAudioContext` 渲染 PCM 快照（含"8 轨齐响不削波"回归） |
| 渲染导出 | `OfflineAudioContext` 离线渲染 → WAV；分轨 stem；MIDI 导出对齐 swing/gate/ratchet/概率/mute |
| 扩展 | Web MIDI in、键盘/Pad 演奏、延迟校准（`outputLatency`）、听力保护（渐入 + 最大音量） |

### 4.4 数据层规划

**分层**：
```
data/index/genres.index.ts   ← 首屏唯一入口：{id,name,category,origin_decade,bpm,aliases[],radar}（约 25KB 原始 / 6KB gzip）
data/genres/<category>.ts    ← 按需 import()（详情页/工作台选中时）
data/genres/<id>.json        ← （可选 P4）单曲风 JSON，进一步细粒度
```

- `ALL_GENRES` 的全量语义改为异步：`await loadCategory(cat)` / `await loadGenre(id)`；`GENRES_MAP` 只保证索引层字段。
- 搜索基于索引层（名称/别名/分类/BPM/年代），需要长文本命中时再按需加载。
- **运行时 Schema 校验**（`validateGenre`）：id 唯一、`steps ∈ {0,1,2,3}`、`velocity.length === steps.length`、`default_bpm` 落在 `bpm_range`、`radar ∈ 1..10` 整数、`origin_year ≤ 当前年`、`representative_tracks.length ≥ 5`。
- **CI 数据 lint**：把已知的 77 条数据问题规则化（唯一 id、BPM 格式、空关联数组、年份、link 类型），生成报告；`GENRES_MAP` 构建时检测重复 id 并抛错。
- 关系图谱回填：用 `GENRE_RELATIONS` 反查生成 `parent_genres/subgenres/related_genres`（或从类型与 UI 中彻底删除这三个字段）——**决策点 D2**。

### 4.5 i18n 规划

1. **类型安全**：`type MessageKey = keyof typeof zh`；`t(key: MessageKey, vars?)`；缺失 key 编译期报错，运行期 dev 警告。
2. **消息分文件**：`i18n/messages/{zh,en}/{common,studio,explore,detail,compare,challenge,chords}.ts`，避免单文件 107 key 继续膨胀。
3. **消灭内联三元**：321 处 `language === "zh" ? … : …` → `t("...")`；518 行硬编码 CJK 逐个迁移（StudioView 119、ChordProgressions 71、VerticalTimeline 66、Galaxy 65、HorizontalTimeline 56、Compare 32）。
4. **SSR/首帧语言**：语言在 `main.tsx` 渲染前同步解析（`localStorage` → `navigator.language`），消除英文用户首帧闪中文；`index.html` 的 `lang` 由运行时设置。
5. 词典清理：删除 44 个死词条；`chordTheory.ts` 的 `nameZh/descZh` 保留为数据（合理），但 UI 层统一经 `t()`。
6. 非 UI 文案（`index.html` title、manifest、分享落地页）也纳入语言切换。

### 4.6 组件与渲染

| 目标 | 手段 |
|---|---|
| 单步重渲染 ≤8 行 | 拆 `<TrackRow memo>`、`<StepCell memo>`、`<Ruler>`、`<Toolbar>`、`<GenreRail>`、`<InfoDossier>`；props 只传 primitive + 稳定回调 |
| 消灭 3500 闭包/帧 | 事件委托：容器一个 `pointerdown`，用 `data-track` / `data-step` 定位；`useCallback` + 传 id 而非闭包 |
| 播放视觉与音频解耦 | `currentStep` 不进 React 状态；改为 `requestAnimationFrame` 订阅引擎时间，只更新播放头 DOM（CSS transform），必要时用 `useSyncExternalStore` 精确订阅 |
| LED 闪烁 | 由 `engine.onTrackTrigger` 写入 ref + 直接 DOM class 切换，避免 `setState` |
| 拖拽涂抹 | rAF 批量合并，抬手时一次提交 + 一次 `engine.applyPatch` |

### 4.7 类型与错误处理

- `tsconfig`：开启 `noUnusedLocals`、`noUnusedParameters`、`noUncheckedIndexedAccess`、`noImplicitReturns`、`noFallthroughCasesInSwitch`（已开）。
- 消减 28 处 `any`（StudioView 8、`MidiExporter.ts:246`、`SequencerUrlShare.ts:96`、`chordTheory.ts:59/318/437`）。
- 统一错误处理：`lib/result.ts` 风格返回值替代"静默 catch"；`SequencerUrlShare.ts:74-76` 的 `catch → ""` 与 `SoundBankManager:74` 的 `console.error` 收敛为可上报错误。
- 全站 `ErrorBoundary`（App 级 + 每个 lazy 视图级 + WebGL 专有降级）。

---

## 5. UI 规划

### 5.1 设计令牌落地（当前 1,707 处硬编码 hex / 约 20 种颜色）

`index.css` 已有 CSS 变量，但组件全部绕过。方案：**Tailwind theme 扩展 + 单一来源**。

```js
// tailwind.config.js（目标）
colors: {
  bg:      '#0a0b0d',
  panel:   '#121317',
  panel2:  '#0d0e12',
  line:    { DEFAULT:'#23262d', strong:'#393d46' },
  text:    { DEFAULT:'#e9e7e0', sub:'#8b8f99', dim:'#5a5e68' },
  accent:  { DEFAULT:'#f5b73d', soft:'#d8b988' },   // 266 次使用 → 强调色
  track:   { kick:'#ff5964', snare:'#ffb65c', hat:'#45e0c9', perc:'#c8e06a',
             bass:'#ff8a5c', chord:'#f06ec4', lead:'#7ee787', fx:'#9aa5ce' },
  cat:     { electronic:'#4ad8c8', rock:'#ff5964', hiphop:'#f5b73d',
             jazz:'#9aa5ce', pop:'#f06ec4', latin:'#c8e06a' },  // 现有 6 大类的统一色
}
```

替换策略：脚本化 codemod（`#f5b73d` → `accent`）分批替换，CI 加 `grep -c '#[0-9a-f]\{6\}'` 上限门禁，逐步归零。

**同时修复**：删除配置中不存在却被使用的类名（`animate-fade-in`、`animate-slide-up`、`no-scrollbar`、`scrollbar-none`、`custom-scroll`）——要么在 `tailwind.config.js` 补齐，要么改用 `index.css` 中已定义的 `.touch-action-none` 等真实存在的类。

### 5.2 排版与可读性

| 问题 | 目标 |
|---|---|
| 416 处 ≤12px（100×10px、19×9px、10×8px、2×7px） | 建立**5 级字阶**：`display 28/20`、`title 16`、`body 14`、`label 12`、`micro 11`（仅用于非关键元信息）；**正文与说明文字下限 14px**，移动端下限 15px |
| 205 处 `font-bold` | 建立字重规范：文本 400/500，标题 600，数据/数字 700 等宽；避免全站加粗导致层级失效 |
| 字体配置与实现不一致（声明 Inter 未加载） | 二选一：自托管 Inter 子集，或从 tailwind 移除 Inter 并统一到 `Space Grotesk + Noto Sans SC + JetBrains Mono`；**中文字体自托管子集**（当前外链 Google Fonts 5 族，渲染阻塞且离线不可用） |
| 圆角 5 套混用（`lg/xl/2xl/3xl/full`） | 收敛为 3 档：`sm 6px`（chip/输入）、`md 10px`（卡片/面板）、`full`（圆形按钮）；全局 codemod |

### 5.3 共享组件库（`src/ui/`）

当前 5 处自研遮罩（`GlobalSearch.tsx:99`、`StudioView.tsx:1818/2706`、`EuclideanModal.tsx:71`、`PitchPickerModal.tsx:77`），行为不一致。

```
ui/Modal.tsx        # role=dialog + aria-modal + aria-labelledby + 焦点陷阱 + Esc + 焦点归还 + 遮罩点击
ui/Drawer.tsx       # 移动端底部抽屉（safe-area）
ui/Button.tsx       # variant: primary/ghost/outline/danger；size: sm/md/lg；loading/disabled 语义
ui/IconButton.tsx   # 强制 aria-label（编译期要求）
ui/Chip.tsx / Tag.tsx
ui/Card.tsx / Panel.tsx
ui/Slider.tsx       # 统一轨道/滑块的 44px 热区与键盘步进
ui/Select.tsx       # 原生 select 的键盘语义 + 统一样式（当前 6 处原生 select 风格不一）
ui/EmptyState.tsx / ErrorState.tsx / Skeleton.tsx
ui/Toast.tsx        # 单例容器（修 showToast 计时器互相覆盖）
ui/GenreCard.tsx    # 详情/搜索/对比/时间线共用
ui/RadarChart.tsx   # 带 role="img" + 数据表替代
```

### 5.4 响应式

- 断点使用严重偏向 `sm:`（177 次）而 `lg:` 仅 23 次，而 PRD 5.2.1 要求 ≥1024px 双栏——补 `lg:` 桌面布局（Studio 左信息栏 + 右网格）。
- 统一布局骨架：`AppShell`（Header / 内容 / Footer）+ 每视图 `PageHeader`（标题 + 描述 + 操作区）。
- iPad 横竖屏、iPhone 横屏：为 Studio 工具栏与全屏编辑器提供横向布局。
- `viewport-fit=cover` + `env(safe-area-inset-*)` 全站接入（toast、全屏编辑器、底部工具栏）。

### 5.5 视觉一致性清单

- 导航 IA：当前 Header 是 7 个平级 tab，与 PRD 的"曲风探索（3 个子视图）"层级不符 → 收拢为 `工作台 / 和弦 / 探索▾ / 对比 / 挑战`（探索为分组菜单）。
- 统一"分类色 → 曲风大类"映射（现 `MAJOR_CLUSTERS` / `LANES` / `TIMELINE_STORIES` 三套并行）。
- 统一空/载/错三态（当前仅 `App.tsx:112-120` 一处 Suspense fallback）。
- 统一图标语义与尺寸（lucide 已统一，需规范 `w-3.5/w-4` 两档）。

---

## 6. 交互规划

### 6.1 键盘

| 范围 | 规划 |
|---|---|
| 全局 | `⌘/Ctrl+K` 搜索（**当前无效**）、`/` 聚焦搜索、`Esc` 关闭任意模态/抽屉、`?` 打开快捷键面板 |
| 视图切换 | `g s` / `g e` / `g c` … 前缀式跳转 |
| 音序器 | `Space` 播放/暂停（**须排除 select/button/contenteditable**）、`⌘Z/⌘⇧Z` 撤销重做、`V/E` 工具、`↑↓←→` 移动编辑光标、`1..8` 选轨、`M/S` 静音/独奏、`Del` 清除 |
| 网格 | `Tab` 在 cell 间移动（`role="gridcell"`），`Enter/Space` 切换，`Shift+↑↓` 调力度 |
| 探索视图 | 列表兜底视图提供 `↑↓` 遍历 + `Enter` 进入详情；星系图 canvas `tabIndex=0` + 方向键平移 + `+/-` 缩放 |
| 无障碍 | 所有交互元素可 Tab 到达；自定义控件实现 ARIA Authoring Practices 模式（combobox/grid/dialog/slider） |

### 6.2 触控与手势

- **统一 Pointer Events**：删除与 `onPointerDown` 并存的 `onTouchStart`（当前 cell 与 VelocityLane 双触发，触摸时重复写值 + 双次触感）；拖拽用 `setPointerCapture`。
- **真实 44×44 命中区**：废弃 `::after` 伪元素撑开的方案（512 个重叠热区 `z-index:1` 抢点击），改为真实 padding + `gap`，移动端提供"放大网格"模式。
- **移动端专属编辑模式**：保留 `step/accent/ratchet/pitch/plocks` 五模式，但入口语义修正（`isTouchDevice` 现在既是探测又是开关，参与逻辑分支）。
- 手势：单指涂抹、双指缩放网格、长按 450ms 弹 P-Lock（需 `preventDefault` 阻止文本选择/滚动竞争）、横滑切换 pattern A/B。
- iOS：`touch-action` 分级（网格 `none`、页面 `pan-y`）、禁双击缩放、禁橡皮筋、`visualViewport` 适配键盘弹起。

### 6.3 反馈与状态

- 统一反馈层级：Toast（1 行，单例容器，2.4s）→ 行内提示（错误/校验）→ 骨架屏（加载）→ 空状态（带主行动按钮）。
- 修复 toast 计时器互相覆盖（`StudioView.tsx:283-286`）。
- 危险操作二次确认（清空 pattern / 重置预设），支持撤销 5 秒内可回退。
- 音频状态可视化统一：Header 频谱（已有）+ 各视图播放指示，避免"看似在播实际无声"（`isPlaying` 与引擎真实状态脱钩，见 P0-19）。
- 触觉反馈：仅在移动端且用户偏好允许时启用，补"关闭开关"（`groove_prefs`）。

### 6.4 无障碍（PRD 7.5 达标路径）

1. **语义**：全部图标按钮补 `aria-label`；交互容器改 `<button>`/`<a>`，删除 `div onClick`（Header logo、搜索结果行、和弦块、星系子标签、时间线 chip、曲风卡）。
2. **模态**：`<Modal>` 统一 `role=dialog` + `aria-modal` + 焦点陷阱 + Esc + 焦点归还 + 打开时 `aria-hidden` 背景。
3. **状态播报**：`aria-live="polite"` 播报"已切换曲风 X""播放中/已停止""第 N 题：正确/错误"。
4. **对比度**：`#8b8f99` on `#0a0b0d` 约 4.9:1（达标），但 `#5a5e68` on `#0a0b0d` 仅 ≈2.7:1（不达标）→ 用于正文的地方替换为 `#8b8f99`；逐处审计 ≤12px 灰字。
5. **reduced-motion**：新增 `@media (prefers-reduced-motion: reduce)`，停止 Galaxy 相机漂移/shader 呼吸/7s 自动回放/`animate-pulse-play`，并把设置暴露为用户偏好（`groove_prefs`）。
6. **键盘可达**：见 6.1；为 WebGL 视图提供列表兜底视图。
7. **验收**：Lighthouse a11y ≥95、`axe` 0 critical、键盘全流程走通（人工清单）。

### 6.5 动效

- 统一时长/缓动令牌：`fast 120ms`、`base 200ms`、`slow 320ms`，`ease-out` 为主；删除"每帧重启 transition"的写法（`GalaxyView.tsx:1394` 的 `.nlab-sub` 同时有 `transition-all` 与逐帧内联 transform → 标签拖影）。
- 入场动画改为真实存在的类（当前 `animate-fade-in` 等类名不存在，动画根本没生效）。

---

## 7. 性能规划

### 7.1 预算（写入 CI 门禁）

| 指标 | 预算 | 说明 |
|---|---|---|
| 首屏 JS+CSS gzip | ≤ 90 KB | 数据懒加载后可达 |
| 单路由 chunk gzip | ≤ 120 KB | StudioView 拆分后 |
| `vendor-three` | ≤ 130 KB gzip | 保持懒加载，禁止进入首屏 |
| 长任务 | 播放期无 >50ms 主线程长任务 | 触摸/滚动手感 |
| Galaxy 帧上传 | ≤ 64 KB/帧 | 用 `updateRanges` 或独立 geometry |
| 时间线 DOM 节点 | 首屏 ≤ 800 | 虚拟化或 canvas |
| LCP / INP / CLS | ≤2.0s / ≤200ms / ≤0.1 | 移动端中位数 |

### 7.2 手段清单

| 目标 | 手段 |
|---|---|
| 首屏减重 | 曲风数据按需加载（§4.4）；`relations/nebula/timeline_stories` 保持随视图懒加载；字体自托管子集 + `font-display:swap` |
| Studio 流畅 | 组件拆分 + memo + 事件委托 + 播放头脱离 React（§4.6） |
| Galaxy | `updateRanges` 局部上传或拆分独立 geometry；`project()` 去 `Vector3.clone`；拾取入 rAF 且拖拽期跳过；移除逐帧 `querySelectorAll`（`GalaxyView.tsx:1228/1250`）；`currentYear` 移出 React state；质量档扩展到边密度与 DPR；`backdrop-blur` 子标签降级 |
| 时间线 | 虚拟化/`content-visibility` 或 canvas 重写；159 个常驻 tooltip 改单例浮层；按曲风数计算列宽 |
| 渲染通用 | 10 处 index-as-key 修正；删除渲染期读时钟（`StudioView.tsx:2346`）；`trackFlashTimes` 改为 ref + 直接 DOM |
| 资源 | 自托管字体；`_headers` 给 hashed 资源加 `immutable`；`sourcemap` 上传到监控而非公开 |

---

## 8. 质量与工程化

### 8.1 测试矩阵

| 层 | 工具 | 目标覆盖 |
|---|---|---|
| 单元（逻辑） | vitest | `parseBpmRange`、steps 归一化、`decodeSharedSequencer`（含恶意 payload）、`Euclidean`（**精确序列断言**）、`chordTheory` 边界、`MidiExporter` 音符落点/tempo meta、相似度算法、拍号步数计算 |
| 数据不变量 | vitest + 脚本 | 唯一 id、`steps∈{0,1,2,3}`、velocity 长度、BPM 解析、年份、关联数组、link 类型 |
| 组件 | jsdom + `@testing-library/react`（需新增） | Header 语言切换、GlobalSearch（BPM 搜索 + `120–128 BPM` 渲染）、GenreDetail 空关联不崩、Modal 焦点陷阱 |
| 音频渲染 | `OfflineAudioContext` | 8 轨齐响不削波（真值回归）、swing 时序、stop 后无残响 |
| 端到端 | Playwright（新增） | 导出 MIDI → 用 `?groove=` 重新打开还原；语言切换；挑战页完整一题流程 |
| 视觉/无障碍 | Lighthouse CI + axe | a11y ≥95、0 critical |

删除 `sanity.test.ts`（`1+1===2` 无价值）。

### 8.2 CI 门禁（GitHub Actions）

```
typecheck (tsc --noEmit)
lint (eslint) + format check (prettier)
unit + component tests (vitest --coverage)
data lint (159 曲风 schema 校验)
build + bundle budget (size-limit 或 rollup-plugin-visualizer 断言)
lighthouse ci (a11y + performance 阈值)
```

### 8.3 可观测性

- `ErrorBoundary` + 全局 `window.onerror`/`unhandledrejection` 上报（Sentry 或自建轻量上报端点，注意 PRD 7.9 隐私要求：只上报堆栈与版本，不采集用户数据）。
- 版本号注入（`__APP_VERSION__`）+ 关于页"检查更新"（PRD 7.8.3）。
- 关键路径埋点（可选、匿名、可关闭）：视图切换、播放次数、导出成功、挑战正确率——用于内容与功能决策。

### 8.4 数据与生成管线治理

- **单一入口**：`python3 -m scripts.build_all`（或 `npm run data:build`），修复 `sys.path` 假设（当前 `update_genre_radar.py` 直接跑会 ImportError）。
- 删除空壳 Node 一代脚本（`build_full_database.py`、`generate_all_genres.js`、`generate_database.js`、`data_builder_core.js`、`build_genre_data.js`）。
- **`scripts/update_studio.py`（36KB Python 模板整文件生成 2,954 行 StudioView.tsx）必须废弃**——它正是 11 个缺失 i18n key 的来源，且使 StudioView 无法安全手工演进。改为"生成数据 + 手工维护视图"。
- CI 校验"生成结果 == 仓库数据"（避免脚本与数据漂移；当前数据已被手工修改过）。
- 内容质量补强：`representative_tracks.link` 从 YouTube 搜索链接升级为可校验的曲目链接或明确标注为"搜索入口"；`sources` 从 3 种字符串扩展为真实来源（PRD 7.3 要求每曲风 ≥2 个来源）。

---

## 9. 实施路线图

> 工时以"1 人·天"为单位，含自测与文档。P0–P4 为优先级编号，Phase 为时间顺序。

### Phase 0 · 止血（1 周 / ≈6 人日）

**目标：消除错误与泄漏，让基线可信。**

| 任务 | 工时 | 验收 |
|---|---|---|
| 修 Euclidean 算法 + 精确序列测试 | 0.5 | `generateEuclidean(8,3) === [1,0,0,1,0,0,1,0]` |
| master 限幅器 + 安全音量上限 | 0.5 | 8 轨齐响录音无削波（OfflineAudioContext 峰值 ≤1.0） |
| 修 App↔Studio 定时器泄漏 | 0.25 | 进出 studio 10 次，`setInterval` 计数不增长 |
| 修 11 个 i18n key + `t()` dev 警告 | 0.5 | 界面无 "era/place/dna" 字面量 |
| `parseBpmRange()` 抽离 + 修字符串下标 bug | 0.5 | BPM 搜索 `120`、`128` 命中；渲染 `120–128 BPM` |
| `decodeSharedSequencer` 白名单与上限 | 0.5 | 恶意 payload 测试全被拒 |
| ErrorBoundary（App + lazy 视图） | 0.5 | 人为抛错显示错误页而非白屏 |
| ChallengeView：引擎泄漏 + 泄题 + 手势播放 | 1 | 切难度 10 次仅 1 个 AudioContext；选项不含 BPM/category；iOS 首题有声 |
| Studio 快修 5 项（Space 劫持、撤销入口、polymeter 播放头、3/8 步数、小节 select） | 1 | 对应单测/手工清单通过 |
| Galaxy 标签偏移 + canvas `touch-action` | 0.5 | 标签与星点像素对齐；双指缩放生效 |
| 时间线分桶重复修复 | 0.25 | 1900–1950 无重复渲染，补 1950s 列 |
| 删除伪造 API/死代码（ToneTransport、14 个 import、Breadcrumbs、searchQuery、`duration\|\|4`） | 0.5 | tsc + 搜索无残留 |

**出口标准**：P0 清单清零；`npm test` 增加到 ≥30 用例；补一份"已知未修复问题"清单。

### Phase 1 · 打地基（2.5 周 / ≈13 人日）

| 任务 | 工时 | 产出 |
|---|---|---|
| 设计令牌落地（Tailwind theme + codemod 替换 1,707 处 hex） | 2 | 颜色/字阶/圆角/间距四套令牌 |
| `src/ui/` 组件库（Modal/Drawer/Button/IconButton/Chip/Card/Slider/Select/EmptyState/Toast） | 3 | 5 处自研遮罩收敛为 1 个 `<Modal>` |
| 路由与深链（决策点 D3） | 2 | URL 契约生效，可分享/后退 |
| i18n 重构（类型安全 + 消息分文件 + 迁移 321 处三元与 518 行硬编码） | 3 | 无内联 `language === "zh"` |
| 数据层懒加载 + 索引层 + Schema 校验 | 2 | 首屏 gzip ≤90KB；CI 数据 lint 0 error |
| 工具链：ESLint + Prettier + CI + 脚本 + 体积预算 | 1 | CI 全绿门禁 |

**出口标准**：首屏 ≤90KB gzip；CI 门禁生效；新视图开发可复用 `src/ui/`。

### Phase 2 · 性能与无障碍（3 周 / ≈15 人日）

| 任务 | 工时 | 产出 |
|---|---|---|
| Studio 组件拆分 + memo + 事件委托 + 播放头脱离 React | 4 | 单步重渲染 ≤8 行 |
| Studio 状态收敛（reducer + `commit()` 单一出口 + 移除 updater 副作用） | 3 | 状态单真源；StrictMode 无双实例 |
| Galaxy 逐帧优化（updateRanges/去 clone/拾取入 rAF/质量档） | 3 | 桌面 ≥30fps、移动 ≥24fps |
| Galaxy 容错（context lost、visibilitychange、ResizeObserver、降级列表） | 1 | 上下文丢失可恢复 |
| 时间线虚拟化/canvas 重写 | 2 | 首屏 DOM ≤800 |
| 无障碍达标（语义/模态/aria-live/对比度/reduced-motion/键盘） | 2 | Lighthouse a11y ≥95、axe 0 critical |

### Phase 3 · 功能补全（4 周 / ≈20 人日）

- 音序器专业能力：Pattern A/B + 链式/Song Mode（4）、Gate 全链路（2）、力度/概率/Ratchet 画布 Lane（3）、自动保存 + 工程持久化（1.5）、MIDI 对齐 + 分享无损（2）、节拍器/预备拍/Tap Tempo/循环区间（1.5）。
- 音频：per-track pan/gain 总线 + send bus（2）、voice registry + panic（1）。
- 视图：Compare 真同步播放 + 相似度矩阵（3）、详情页字段补齐 + 迷你音序器 + 关系图（2.5）、和弦→工作台交接（1）、Challenge 难度分层 + 成绩持久化（1.5）、探索三视图统一脚手架 + 列表兜底（2）。

### Phase 4 · 差异化进阶（✅ 已全量收官 · v1.13.0）

- 离线渲染 WAV + 分轨导出（4d · P4-01 / P4-02）：基于 `OfflineAudioContext` + RIFF 16-bit PCM WAV + 纯 TypeScript PKWARE ZIP 生成器，内置 Master Limiter，全绿通过单测。
- MIDI 导入（2d · P4-03）：SMF Type 0/1 标准解析、VLQ 解码、BPM 侦测与 1/16 智能量化映射。
- Web MIDI in + 键盘/Pad 演奏（2.5d · P4-04）：Web MIDI API 热插拔与设备监听、1-8 轨触发与 Z-M 八度音乐打字。
- 延迟校准与听力安全保护（1d · P4-05）：-100ms~+100ms 动态延迟补偿、0.85 听力安全夹紧、35ms 指数平滑渐入起播。
- Inspire Me 受控变异（3d · P4-06）：锚定底鼓重音，变奏踩镲与打击乐切分，音符严格锁定调式音阶，支持一键生成与 A/B 试听对比。
- 真 PWA（2.5d · P4-07 / P4-11 · 决策 D1A）：版本化 Service Worker（Cache First App Shell）、192/512/maskable 图标、更新提示、Cloudflare `_headers` 1年 immutable 强缓存。
- 数据治理（3d · P4-08 / P4-09 · 决策 D7A）：单一生成入口 `python3 -m scripts.build_all`、关系图谱 100% 覆盖 159 种曲风（300 条关系连线）、参考来源与代表曲目 100% 真实链接。
- 可观测性（1.5d · P4-10）：隐私优先脱敏异常采集与 ErrorBoundary 诊断报告一键复制。

**总计：101 项任务 / ≈108 人日 · 101/101 (100.0%) 全面验收交付**

---

## 10. 验收与度量

### 10.1 分阶段验收 KPI

| 阶段 | 必达 | 状态 |
|---|---|---|
| Phase 0 | P0 缺陷 0；错误页可用；无周期泄漏；i18n 无字面量 key | ✅ 100% 达标 (v1.4.5) |
| Phase 1 | 首屏 gzip ≤90KB；CI 门禁全绿；URL 深链可用；无内联语言三元 | ✅ 100% 达标 (v1.7.0) |
| Phase 2 | 首屏 DOM ≤800；Studio 播放期无长任务；Galaxy 帧上传 ≤64KB；Lighthouse a11y ≥95 | ✅ 100% 达标 (v1.11.0) |
| Phase 3 | PRD 5.x 功能矩阵全绿；导出/分享/播放三者一致；挑战页无泄题且成绩持久化 | ✅ 100% 达标 (v1.12.0) |
| Phase 4 | 离线可用（可选安装）；WAV/分轨导出可用；生成管线可复现；图谱 100% 连通 | ✅ 100% 达标 (v1.13.0) |

### 10.2 体验量化指标

- 首次可用（TTI）≤3s（4G 中端安卓）
- 音序器点击到发声 ≤50ms（PRD 7.1）
- 触摸目标 ≥44×44 CSS px（关键操作 100%）
- 双语覆盖：`t()` 覆盖率 100%，无硬编码 CJK 渲染路径
- 崩溃率：无未捕获异常导致白屏（ErrorBoundary 覆盖率 100%）

---

## 11. 决策记录（全量落实）

| ID | 决策 | 最终采纳方案 | 落地版本 |
|---|---|---|---|
| **D1** | PWA 是否恢复 | **A. 恢复真 PWA 规范**（版本化 SW + App Shell Cache First + 更新提示 + 192/512 图标） | v1.13.0 (P4-07) |
| **D2** | 三个恒空关联字段 | **A. 用 `GENRE_RELATIONS` 反查双向回填**，覆盖全量 159 种曲风 300 条关系连线 | v1.12.0 / v1.13.0 (P3-15/P4-09) |
| **D3** | 路由方案 | **B. 自研 ~1KB 极轻量客户端深链 Router**，无第三方大包，零构建膨胀 | v1.6.0 (P1-08) |
| **D4** | 状态库 | **A. 原生 useReducer + Context 架构**，零外部依赖，状态集中单一真源 | v1.8.0 (P2-04) |
| **D5** | 数据形态 | **A. TS 字面量按需懒加载分包 + 轻量索引层**，首屏 gzip 仅 26KB | v1.6.0 (P1-13) |
| **D6** | 字体 | **B. 统一使用现代化几何无衬线字体规范**，彻底清除衬线字体与杂乱字阶 | v1.4.0 (P1-01) |
| **D7** | `scripts/update_studio.py` | **A. 彻底废弃该脚本**，收敛至单一生成入口 `python3 -m scripts.build_all` | v1.13.0 (P4-08) |

---

## 附录 A · 建议的"第一天就能开工"清单

1. 建 `IMPROVEMENT_PLAN.md` / `BACKLOG.md` 到仓库并纳入版本管理（本文件）。
2. 新建分支 `chore/phase0-hardening`，按 `BACKLOG.md` 中 `P0-*` 任务逐条提交（每条一 PR，便于回溯）。
3. 先做 4 个"零风险高收益"改动验证流程：Euclidean 修复 + 测试 → `parseBpmRange` 抽离 → 11 个 i18n key → ErrorBoundary。
4. 同日搭最小 CI（typecheck + test），保证后续每个 PR 都有护栏。
5. 决策点 D1/D2/D3 需在第一周内敲定，否则 Phase 1 无法排期。

## 附录 B · 优先级矩阵（影响 × 成本）

| | 低成本 | 高成本 |
|---|---|---|
| **高影响** | Euclidean 修复、ErrorBoundary、i18n key 补全、`parseBpmRange`、分享校验、定时器泄漏、Space 劫持、Galaxy 偏移、时间线分桶 | 数据层懒加载、Studio 状态收敛、Studio 组件拆分、Galaxy 逐帧优化、时间线重写、音频总线/voice registry |
| **中影响** | 死代码清理、设计令牌 codemod、Tooltip 单例、`touch-action`、toast 单例 | 路由与深链、i18n 全量迁移、无障碍达标、Compare 同步播放、详情页字段补齐 |
| **低影响** | 词典清理、字体配置对齐、文档更新 | 真 PWA、离线渲染、Web MIDI、内容治理管线 |
