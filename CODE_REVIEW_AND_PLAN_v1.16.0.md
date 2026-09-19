# GROOVE LAB `next` 分支 · 代码与实现审查 + 改进完善规划

> **审查对象**：`git branch: next` @ `390a764`（v1.16.0，2026-09-14）
> **审查范围**：`src/` 194 个文件 / 134,892 行（非测试代码 129,096 行）、`scripts/` 35 个脚本、`public/`、构建与 CI 配置、四份规划文档
> **方法**：静态审阅 + 本机实测（`tsc` / `eslint` / `vitest` / `vitest --coverage` / `vite build` / 体积预算门禁 / 7 端 Playwright 矩阵 / 产物分包分析 / 正则量化统计）
> **结论可复核性**：文中每个数字均为本机实测；每个缺陷均带 `file:line`

---

## 0. 摘要（TL;DR）

**一句话结论：产品形态与工程骨架都已经达到"可交付的专业级 Web 音频工作站"水准（159 曲风 / 8 轨音序器 / 13 个视图 / 双语 / PWA / 离线导出 / 7 端自动化矩阵），但"演示级正确性"与"生产级可靠性"之间仍有一条清晰的断层——集中在①**音频调度与导出的正确性**、②**工程/工程数据（项目库、分享链接）的丢失与污染风险**、③**无障碍与国际化只是"部分达标"**、④**测试是"绿灯但无牙"**、⑤**性能优化被自己的静态导入抵消**五处。**

### 0.1 健康度基线（本机实测，2026-09-14）

| 项目 | 实测结果 | 判定 |
|---|---|---|
| `npm run typecheck` | 0 error | ✅ |
| `npm run lint`（`--quiet`） | 0 error，但**掩盖了 179 条 warning**（171 未使用变量 + 8 prefer-const） | ⚠️ |
| `npm run test` | **41 文件 / 324 用例全过，49.5s** | ✅ |
| `npx vitest run --coverage` | **2 个用例失败**（`ProjectHubModal.test.tsx` / `CustomGenreMakerView.test.tsx`），覆盖率报告因此不产出 | ❌ **CI 门禁当前是红的** |
| `npm run build` | 成功，65s，`dist` 原始 2.89 MB | ✅ |
| `npm run check:budget` | 全绿（但仅 4 项检查，阈值宽松：three 124.3/145 KB） | ⚠️ 偏松 |
| `npm run test:e2e`（7 端矩阵） | **7/7 PASS，约 190s** | ✅ |
| 覆盖率 | 唯一一次成功运行：**行 82.3% / 函数 61.1%**，但 `src/views` 仅 **13.8%**（9 个视图 **0%**）、`src/components` 24.1%；`vitest.config.ts` **无 thresholds**，`verify` 根本不跑 coverage | ❌ 数字好看，分布极偏 |
| CI 可触发性 | `.github/workflows/ci.yml` 只监听 `main`/PR→`main`；而 **`main` 落后 `next` 17 个 commit（停在 v1.14.1）**，且仓库**没有配置任何 git remote** → v1.15–v1.16 全部工作从未被 CI 校验过 | ❌ **CI 事实上从未运行** |
| 首屏 `/studio` 实际传输 | **≈336 KB gzip JS + 22 KB CSS ≈ 358 KB**，其中 **172 KB（48%）是全部 159 个曲风数据** | ❌ 与"按需加载"设计目标相悖 |
| 测试代码占比 | 5,796 / 134,892 = **4.3%**；**54 个模块零测试引用** | ❌ |
| i18n | 646 个 key，**4 个 key 缺失会把 `drums_only` 这类原始 key 直接渲染给用户**；556 处内联 `isZh ?` 三元绕过词表 | ⚠️ |
| 无障碍 | `htmlFor` **全仓 0 处**；22 个纯图标按钮无 `aria-label`；9 个 `<canvas>` 无文本替代；447 处字号 < 12px；2 个 token 对比度不达 WCAG AA | ❌ |
| 版本号一致性 | 同一版本号散落 5 处，其中 **2 处已漂移**（`telemetry.ts` APP_VERSION=`1.13.0`、`sw.js` CACHE_VERSION=`groove-v1.13.0`） | ❌ |

### 0.2 五条改进主线

| 主线 | 核心内容 | 解决什么 |
|---|---|---|
| **① 正确性止血** | 音频调度零值崩溃 / 追赶风暴 / 导出忽略混音器 / 撤销历史污染 / 跨工程数据覆写 / 不可信载荷校验 | 用户"听不见、导错、丢工程"的致命问题 |
| **② 数据安全** | IndexedDB 事务语义、配额与阻塞、分享链接自兼容、导入白名单 | 不可逆的数据丢失与安全暴露 |
| **③ 体验与无障碍** | 全局 focus-visible、3 个野生弹窗收敛、缺失 key、对比度、字号、触控目标、画布替代文本 | WCAG 2.1 AA 真正达标，移动端可用 |
| **④ 性能与架构收敛** | 打断曲风静态导入链、Toolbar/StepCell 记忆化、`src/ui` 设计系统真正启用、巨型文件拆分 | 首屏 -48%，重渲染从 512 cell 降到行级 |
| **⑤ 质量门禁** | 假测试替换、flaky 消除、无牙断言重写、CI 覆盖 `next`、版本单一来源、端口隔离 | 让"全绿"重新具有信息量 |

---

## 1. 审查范围与实测方法

```bash
# 全部为本次审查实际执行过的命令
npm run typecheck                  # → 0 error
npm run lint                       # → 0 error（--quiet 掩藏 179 warnings）
npx eslint 'src/**/*.{ts,tsx}' -f json   # → 171 unused-vars + 8 prefer-const
npm run test                       # → 41 files / 324 tests pass / 49.5s
npx vitest run --coverage          # → 2 failed / 322 passed，EXIT=1
npm run build && npm run check:budget    # → OK / 全绿
node scripts/test_matrix.js        # → 7/7 PASS
python3 - <<'EOF' ...              # 产物 gzip 分包统计
EOF
```

本次审查对 4 个高风险子系统做了问题域深挖（音频引擎、音序器状态与持久化、视图/UI/无障碍、数据层与 CI），并交叉复核了 `BACKLOG.md`（113/113 全勾）、`ROADMAP_V2.md`、`prd.md` 与实现的差距。

---

## 2. 现状架构地图

### 2.1 代码体量分布（实测）

| 区域 | 行数 | 占比 | 备注 |
|---|---:|---:|---|
| `src/data/`（含 `genres/` 14 文件 77k 行） | 86,104 | **66.7%** | 159 曲风 TS 字面量，全量 810 KB 原始 |
| `src/views/` | 13,606 | 10.5% | `GalaxyView` 2,298 行、`StudioView` 2,142 行 |
| `src/components/` | 11,587 | 9.0% | `Toolbar` 1,194 行、`ProjectHubModal` 801 行 |
| `src/audio/` | 7,977 | 6.2% | 4 套独立调度器（见 §4.1） |
| `src/features/` + `hooks/` + `utils/` + `i18n/` + `types/` | ~7,000 | 5.4% | |
| `src/ui/`（设计系统） | 1,790 | 1.4% | **大部分无生产引用**（见 §5.4） |
| `src/test/` | 5,796 | 4.5% | 41 文件 / 324 用例 |

### 2.2 视图与路由矩阵

| Tab | 视图 | 行数 | 懒加载 | 错误边界 |
|---|---|---:|---|---|
| `studio` | StudioView | 2142 | ✅ | ✅ + 骨架屏 |
| `chords` | ChordProgressionsView | 1501 | ✅ | ✅ |
| `kick` | KickAnatomyView | — | ✅ | ✅（硬编码双语文案） |
| `maker` | CustomGenreMakerView | 1001 | ✅ | ✅ |
| `analyzer` | AnalyzerView | — | ✅ | ✅ |
| `masterclass` | MasterclassView | — | ✅ | ✅ |
| `galaxy` | GalaxyView | 2298 | ✅ | ✅ + WebGL 降级 |
| `horizontal-timeline` / `vertical-timeline` | 两个时间线 | 1048 / 592 | ✅ | ✅ |
| `compare` | CompareView | 1605 | ✅ | ✅ |
| `challenge` | ChallengeView | 778 | ✅ | ✅ |
| `detail` | GenreDetailView | 1114 | ✅ | ✅ + 骨架屏 |

路由为自研 1 KB 客户端 Router（`src/app/router.tsx`），支持 path / hash / query 三种深链形态，`popstate`+`hashchange` 双监听——**这块实现质量高**，18 个路由单测覆盖良好。

### 2.3 数据流

```
GENRE_INDEX(159, 3547行, 轻索引)  ──► App.tsx loadGenre(id) ──► CATEGORY_LOADERS[chunk] 动态 import
        │                                                        │
        └── GlobalSearch / Galaxy / Compare / Challenge ──────────┘
                                                                  ▼
                                       genres/<chunk>.ts (810 KB 原始 / 172 KB gzip)
                                                                  ▼
         AudioEngine.scheduleStep() ◄── useSequencerStore (useReducer + Context)
                 │                                   │
                 ▼                                   ▼
     Worklet 时钟 / Worker 降级            localStorage(500ms debounce) ──► IndexedDB 多工程
```

---

## 3. 功能层面审查

### 3.1 已交付且经复核为真的能力

- **音频引擎**：AudioWorklet 采样计数时钟 + Worker 降级（`AudioWorkletClock.ts` / `public/audioClockWorklet.js`）；4 套鼓机物理建模（808/909/Acoustic/Cyber）；4 复音 ADSR 合成器；母带效果机架；实时录音量化。
- **乐理教学**：5 套节奏大师课、11 调式锁定网格、琶音/扫弦烘焙、Elo + SM-2 听力天梯与证书。
- **生产力**：Ableton `.als` 导出、IndexedDB 多工程中心、`.groove` 工程包导入导出、WAV 母带/分轨 ZIP、MIDI 导入导出、Web MIDI 输入、自定义曲风工坊 + 二维码分享。
- **工程化**：自研路由、ErrorBoundary 全站接入、PWA（SW + manifest + PNG 图标）、`_headers` 缓存策略、体积预算门禁、7 端 Playwright 矩阵。
- **文档**：`BACKLOG.md` 113/113 勾选，`ROADMAP_V2.md` Phase 5–8 除 3 项外全部标记交付。
- **数据完整性（本次实测为正）**：`genresIndex` 159 个 id 与 14 个数据文件中的 159 个 id **完全一致，双向零差异**；`relations.ts` 300 条关系的 source/target **全部命中真实曲风**，且 159/159 个曲风都被至少一条关系覆盖。数据层当前不存在"脏引用"，风险是**latent（生成脚本孤儿化，见 §4.4）而非 actual**。

### 3.2 功能缺口与"文档已交付但实现未兑现"

| # | 缺口 | 证据 | 影响 |
|---|---|---|---|
| F-1 | **WAV 母带/分轨导出完全忽略混音器**：mute/solo/volume/pan 一律取默认（不静音、0.8、居中） | 调用方只传 `{bpm, swing, drumKit}`：`StudioView.tsx:1360-1366,1380-1384`；离线渲染仅在 `options.trackStates` 存在时才读：`WavExporter.ts:165,192-194` | 用户听到的和导出的不是同一首歌；MIDI/ALS 却读了 mute/solo（`MidiExporter.ts:105`），三个导出器产出不同音符集 |
| F-2 | **分享链接自不兼容**：编码端无上限，解码端拒绝 > 8192 字符 | `SequencerUrlShare.ts:177`（解码上限）vs 编码端无校验；16 轨 × 64 步含 velocity/pitch/gate/ratchet/probability 约 27 KB base64 | 大工程点"分享"生成的链接，自己都打不开 |
| F-3 | **分享/导入链路丢失字段**：URL 还原时丢弃 `gate`/`ratchet`/`probability`/`trackLength` | `StudioView.tsx:647-657` | 静默数据损失，用户无感知 |
| F-4 | **实时录音量化到错误的步**：记录的是"正在预排的未来步"（提前约 200 ms） | `AudioEngine.ts:1009-1011` vs look-ahead 窗口 `:889` | 录进去的节奏整体前移 |
| F-5 | **按需加载名不副实**：`StudioView` 等 8 处静态 import 曲风桶文件 | `StudioView.tsx:4`、`CompareView.tsx:29`、`ChallengeView.tsx:21`、`ExploreListView.tsx:19`、`VerticalTimelineView.tsx:19`、`GenreDetailView.tsx:29`、`HorizontalTimelineView.tsx:37`、`hooks/useGenreGraph.ts:20` | 默认落地页一次性拉全 14 个 chunk（172 KB gzip） |
| F-6 | **MIDI 导入三项失真**：SMPTE division 被当 uint16 读导致音符坍缩到 step 0；32 步文件按 `% totalSteps` 折叠；同 step 音符互相覆盖 | `MidiImporter.ts:108,222-236,262-268` | 外部 MIDI 导入不可信 |
| F-7 | **元曲名/拍号硬编码**：节拍器重音写死 `step % 4`，预备拍写死 4 拍 | `AudioEngine.ts:905,734` | 3/4、7/8 下节拍器错位 |
| F-8 | **曲风单轨 swing 无法关闭全局 swing** | `AudioEngine.ts:960-963`（`effSwing === this.swing` 时回退全局值） | `track.swing = 0` 仍会摇摆 |
| F-9 | **P7-04 / P8-02 / P8-03 未实现**：WebRTC 局域网合奏、硬件调音台视窗、HRTF 3D 空间音频 | `ROADMAP_V2.md` 对应行无 ✅ | 路线图剩余 3 项（约 8.5 人日） |
| F-10 | **`window.confirm` 原生弹窗**破坏暗色视觉与焦点一致性 | `CustomGenreMakerView.tsx:285,840` | 与全站自研 Modal 体系不一致 |
| F-11 | **`version.json` 91 KB 单体文件**，每次"检查更新"用 `cache: "no-store"` 拉全量 42 条 changelog | `public/version.json`（91,232 bytes）、`UpdatesModal.tsx:78` | 浪费带宽；无分页/增量 |

### 3.3 版本号与元数据一致性（漂移）

| 位置 | 值 | 状态 |
|---|---|---|
| `package.json` | 1.16.0 | 基准 |
| `UpdatesModal.tsx:41` `CURRENT_CLIENT_VERSION` | 1.16.0 | ✅ |
| `public/version.json` | 1.16.0 | ✅ |
| `src/utils/telemetry.ts:6` `APP_VERSION` | **1.13.0** | ❌ 漂移（错误报告里版本号是错的） |
| `public/sw.js:7` `CACHE_VERSION` | **groove-v1.13.0** | ❌ 漂移（缓存永不失效，且 `install` 里直接 `skipWaiting()` 使"发现更新"流程形同虚设） |
| `features/sequencer/projectDb.ts:400` 默认 `appVersion` | **1.15.2** | ❌ 漂移（导出的 `.groove` 包版本号错误） |
| `DEPLOY.md` | 声称发布包 ~236 KB / 67 个测试 / SW 未注册 | 实际 518 KB / **324** 个测试 / `pwa.ts:92` **确实注册了 SW** → 三项全部失真 |

### 3.4 数据质量：模型字段"存在但空置"

| 发现 | 实测 | 影响 |
|---|---|---|
| `parent_genres` 在 **159/159** 个曲风中都是 `[]` | 正则全量扫描 | 谱系/父子关系模型是死字段，但 `GlobalSearch.tsx:92`、`nebulaClusters.ts:350` 仍在分支判断 |
| 曲风介绍文本是模板占位：**159/159** 条都含 `"<Genre> signature kick character."` | 正则全量扫描 | `genres.test.ts:20-37` 只断言 `.en` 非空 → 假内容质量通过 |
| `schema.ts` 只校验 `Genre` 30 个字段中的 **8 个** | `schema.ts:37-118` | `aliases`/`subgenres`/`related_genres`/`common_chords`/`structure`/`representative_artists`/`sources` 全部无校验 |
| `build_all.py:72-73` 的"每曲风 ≥ 2 个来源"检查是 `pass` 空操作 | `scripts/build_all.py:68-73` | BACKLOG P4-09 声称已验收，实际未被强制 |
| 5 个测试文件硬编码 `159` | `schema.test.ts:33`、`loader.test.ts:5`、`explore.test.tsx:15-16`、`trackUtils.test.ts:74` | 新增任一曲风即破坏 5 个测试 |

**另一方面（本次验证为正）**：`relations.ts` 300 条关系 0 断链、0 重复、0 自环，无孤立曲风；nebula 的 `genreIds`/`anchorGenreId` 与 timeline 的 `genre_ids` 全部命中；14 条和弦走向的 `roman`/`chords` 长度一致、根音与和弦性质合法。

---

## 4. 缺陷清单（按严重度）

> 以下 `file:line` 均已抽样复核。

### 4.1 P0 · Critical —— 会直接导致"没声音 / 丢数据 / 安全问题"

| ID | 缺陷 | 证据 | 一句话修复 |
|---|---|---|---|
| **C-01** | **零音量永久卡死走带**：`normalizedVel = (velVal/127) * state.volume` 可为 0（推子 `min="0"`），把 0 传给 `exponentialRampToValueAtTime` 抛 `RangeError`；`schedulerLoop` 无 try/catch 且在 `scheduleStep` **之后**才推进 `nextStepTime`，于是每个 20ms tick + 25ms 看门狗重复抛同一异常 | `AudioEngine.ts:955,909-919`；`TrackRow.tsx:186`；`DrumKitModels.ts:68-69,110-114,293-294`；`PolySynth.ts:150-152`；`AnatomyKickEngine.ts:762,817,849` | 所有合成器入口 `Math.max(1e-4, vel)`；`scheduleStep` 包 try/catch 并**无条件推进格点** |
| **C-02** | **追赶式齐响风暴**：`actualStepTime = Math.max(ctx.currentTime, …)` 在 `while (nextStepTime < currentTime + 0.2)` 内，任何停顿（切后台、GC、iOS 挂起恢复——`iosAudioUnlock.ts:176-178`）后把所有错过的步全部钳到"现在"同时发声；300 BPM/1-32 下停 5 秒 ≈ 200 个并发 voice | `AudioEngine.ts:889,902`；`MasterclassAudioEngine.ts:355-362` | 若 `nextStepTime < currentTime - stepDur` 则重同步为 `currentTime + stepDur` |
| **C-03** | **撤销/重做记录重复脏快照，第二次撤销空转**：`commit` 从当前 render 闭包取 `state`，多处一次 tick 内调 2–5 次 → 压入同一份"操作前状态"；`canUndo/canRedo` 从 ref 读取不触发重渲染，工具栏按钮状态陈旧；`RESTORE_SNAPSHOT` 只还原 pattern/bpm/swing/ts/resolution/slot，`songMode`/`songChain`/`loopRange`/节拍器/预备拍"占用了历史却不还原" | `useSequencerStore.ts:862-894,896-910,912-913,807-827`；`StudioView.tsx:1112-1113,1118-1119,659-664`；`Toolbar.tsx:686,700` | 快照改从 live ref / 函数式 dispatch 取；history 进 reducer state 并输出 `canUndo/canRedo`；no-op commit 直接忽略 |
| **C-04** | **跨工程数据覆写（静默丢工程）**：启动只读 localStorage 单键 `groove_project_v1`（按 `genreId` 命中即恢复），而写入会镜像进"当前 active 工程"；`ProjectHubModal` 切换工程时不清理该键 → A→B 切换后刷新，**恢复了 A 的 pattern，500ms 后又把它写进 B 的记录** | `useSequencerStore.ts:151,155-181`；`projectStorage.ts:61-86,95-115`；`ProjectHubModal.tsx:212-218`；`StudioView.tsx:1322-1348` | 让 `groove_active_project_id` 成为唯一真相源；每次切工程同步重写/清理 legacy 键 |
| **C-05** | **IndexedDB 写入"假成功"**：在 `req.onsuccess` 就 resolve（早于事务提交），从不处理 `tx.onabort/onerror` → 配额溢出被当成成功；失败后落进模块级 `memoryStore` 掩盖问题；`getAllProjects/getProjectCount` 吞异常回退空 Map → 坏掉的 IndexedDB 显示"0 个工程"，诱导用户重新保存覆盖；迁移标志在"永远成功"的保存后设置 | `projectDb.ts:170-184,100-115,280-292,21-22,525-527`；`customGenreDb.ts:139-151` | 从 `tx.oncomplete` resolve、`onabort` reject；失败上抛"降级横幅"；迁移成功校验后再落标志 |
| **C-06** | **不可信载荷零校验（安全）**：`JSON.parse(...) as T` + 真值检查即使用；`/#/maker?share=` 可控，`n/cat` 传对象会让 React 抛错，`steps` 可传百万长数组，`bpm: 1e999 → Infinity`，`c.` deflate-raw 解压无上限（解压炸弹）；`.groove` 导入同样只查 `patterns.A` 后强转，`__proto__`/NaN 直接展开进存储 | `customGenreCodec.ts:99-101,113-138,157-158`；`projectDb.ts:384-395,456-465`；可复用却未被使用的 `src/data/schema.ts:39 validateGenre` | 逐字段运行时校验 + 载荷/文件大小上限 + 白名单拷贝构造 |
| **C-07** | **每次指针事件都 commit，摧毁 50 条撤销栈**：力度条 `pointerenter`/`touchmove` 每移动一格压一次快照（每次含 2+ 次全量 `clonePattern`），swing 滑杆与 BPM 输入同理 | `VelocityLane.tsx:105-150,396-420` → `StudioView.tsx:1886-1888`；`Toolbar.tsx:1013-1018,283` | 手势期间本地缓冲，`pointerup` 提交一次 `BATCH_SET_*`，值未变则跳过 |
| **C-08** | **全局 0 处设计化焦点指示**：379 个按钮/链接中只有 `ui/Button.tsx:45`、`ui/IconButton.tsx:48` 有 `focus-visible` 环——**而这两个组件在生产代码里无人 import**；`index.css` 全篇无 `focus` 规则 | 全仓 grep；`index.css` | `@layer base { :focus-visible { ring-2 ring-accent/60 ring-offset-2 ring-offset-bg } }` |
| **C-09** | **4 个 i18n key 缺失，直接把 key 名渲染给用户**：`drums_only`、`full_band`、`chords_bar_prefix`（读屏标签）、`shortcuts_guide_title`；`LanguageContext.tsx:94` 未命中即返回 key；`Header.tsx:357` 用 `as any` 压制了类型检查正是这类 bug | `CompareView.tsx:754,1279,1307`；`ChordProgressionsView.tsx:943`；`Header.tsx:357` | 补 4 条词条 + 增加"所有字面量 `t()` key 均可解析"的单测 |
| **C-10** | **AudioContext 泄漏**：`useGenreAudition` 卸载只 `stop()` 不 `destroy()`，而它支撑横/竖时间线两个视图 → 每次试听挂载泄漏一个未关闭的 AudioContext，浏览器上限一到音频静默失效 | `useGenreAudition.ts:26-34`；`HorizontalTimelineView.tsx:436`；`VerticalTimelineView.tsx:195` | cleanup 调 `engineRef.current.destroy()` |
| **C-11** | **WAV 编码器遇单声道必崩**：缓冲区按 `numChannels` 分配，写入循环恒写 2 声道 → 越界 `RangeError`（当前因渲染器恒建 2 声道而未暴露） | `WavExporter.ts:48,53,87-99,137` | 单声道时只写一个采样 |

### 4.2 P1 · High

| ID | 缺陷 | 证据 |
|---|---|---|
| H-01 | 轨道音量被应用两次（strip gain × velocity 缩放）→ 响度 ∝ volume²，而离线渲染只应用一次 | `AudioEngine.ts:414,955` vs `WavExporter.ts:167` |
| H-02 | 离线 WAV 断链 `probability` 与 per-track `swing`，与实时听感/其他导出器不一致 | `WavExporter.ts:183` |
| H-03 | `stepQueue` 无界：只有 rAF 消费，后台标签页 rAF 停摆但 worker 时钟继续推入 ~50 条/秒 | `AudioEngine.ts:910,846-853` |
| H-04 | `MasterclassAudioEngine.stop()` 不停声（无 voice registry/panic，`AudioEngine` 有）；`destroy()` 的 `ctx.close()` 无 `.catch()` | `MasterclassAudioEngine.ts:369-376,456` |
| H-05 | `EffectsRack` 旁通是假的：关闭非 lowpass 滤波器只是把 `frequency` 设为 20（bandpass/highpass 直接废掉），`filterEnabled` 未参与路由；`destroy()` 漏断 chorus 的 6 个节点 | `EffectsRack.ts:205,131,235-248,139-149` |
| H-06 | 60fps 内分配：`Header` rAF 内 `new Uint8Array(binCount)`；kick 瀑布图每帧 `new Uint8Array(128)` + `unshift` | `Header.tsx:102`；`kick/WaterfallSpectrogram.tsx:48-53` |
| H-07 | MIDI note-off 丢失 track 归属（note-on 把 ch10 鼓映射到 0–3 轨，note-off 只传 note）→ 挂音/错轨；`startKeyboardListener` 重复调用返回 no-op 且冻结首次的 `selectedTrackIndex`；`key in MAP` 命中 `Object.prototype` | `MidiInputManager.ts:119-129,192-194,208-217` |
| H-08 | 撤销历史静默 50 条上限 + 深拷贝快照（3 pattern × 轨 × 6 数组）≈ 10 MB 常驻 | `useSequencerStore.ts:886-888` |
| H-09 | 实时录音走 `dispatch` 不入历史且不清 `futureRef` → 之后 Redo 会用陈旧快照覆盖录音 | `StudioView.tsx:407-428` |
| H-10 | `TrackRow` 不向 `StepCell` 传任何 handler → 格子可聚焦但 Space/Enter 激活是死代码；方向键导航无边界钳制且会静默丢焦点 | `TrackRow.tsx:297-316`；`StepCell.tsx:65,73,91-95` |
| H-11 | **6 个记忆化组件（StepCell/Ruler/TrackRow/GenreRail/InfoDossier/Toolbar）全部被内联箭头 + 每次新建的 track 对象击穿**，等价于未记忆化 → 每次 store 变更重渲染 8×32 = 256+ 个格子与 1194 行 Toolbar | `grep -rn "memo<" src/components/sequencer` 命中 6 处（`StepCell.tsx:30`、`Ruler.tsx:17`、`TrackRow.tsx:44`、`GenreRail.tsx:33`、`InfoDossier.tsx:17`、`Toolbar.tsx:117`）；击穿点见 `TrackRow.tsx:281-318`、`StudioView.tsx` 内联 handler |
| H-12 | Euclidean 应用只替换 `steps`，`velocity/pitch/gate/ratchet` 全部错位；reducer 里已有且被测过的 `APPLY_EUCLIDEAN` 从未被 dispatch | `StudioView.tsx:1963-1970` vs `useSequencerStore.ts` |
| H-13 | `PitchPickerModal` 的 `octave`/`selectedNote` 只在首次 lazy init，组件无 `key` → 打开第二个步进时显示并编辑上一个步进的音高 | `PitchPickerModal.tsx:75-82` |
| H-14 | 点击当前已选曲风 chip 会 `switchGenre(g, true)` 静默重置用户已编辑的 pattern | `GenreRail.tsx:54-56` |
| H-15 | 自定义曲风 ID 用 `Date.now().slice(-4)`（10 秒内碰撞）+ `put` 静默覆盖；读取端不做归一化，缺 `radar_metrics` 的历史记录会渲染崩溃 | `customGenreDb.ts:190,209,246,77-78,108` |
| H-16 | `ExploreScaffold` 仅被测试 import，三个探索视图各自手抄了一份逐字相同的头部/分类下拉（同一 class 串重复 3 次） | `ExploreScaffold.tsx`；`HorizontalTimelineView.tsx:594,648`；`VerticalTimelineView.tsx:313` |
| H-17 | 3 个弹层无焦点陷阱/初始焦点/焦点归还（`ChallengeCertificateModal`、`CustomGenreMakerView` 内两处），`ProjectHubModal` 有 Esc 但无 Tab 陷阱；`ui/Drawer.tsx` 同样缺失（且它是死代码） | `ChallengeCertificateModal.tsx:66-77`；`CustomGenreMakerView.tsx:871,952`；`ProjectHubModal.tsx:124-137`；`Drawer.tsx:27-38` |
| H-18 | `CompareView` 驱动异步试听却**零 loading / 零 disabled / 零空态错误态**，存在重复点击与并发音频风险；`StudioView`、时间线视图同样缺空/错/载态 | `CompareView.tsx`（grep `isLoading\|EmptyState\|ErrorState` = 0） |
| H-19 | `StudioView.tsx:857-869` 的全局 keydown 守卫遇到任何 `INPUT` 就退出（碰过滑杆后 Space/D/V/E/O 走带快捷键全部失效），且不检查 `e.defaultPrevented`（网格内方向键会驱动应用级快捷键） | 同上 |
| H-20 | 分享链接/工程包/路由状态存在 3 套互不复用的重复模型（`PersistedProject` vs `GrooveProject`、`SequencerUrlShare` 内部结构 vs `SequencerTrack`） | `projectStorage.ts:11-30`；`SequencerUrlShare.ts:8-35` |
| H-21 | 数据 schema 只校验 8/30 字段，分类学数组（`parent_genres`/`subgenres`/`related_genres`）**159/159 全空**却仍被 UI 分支引用；内容模板化被测试放行 | `schema.ts:37-118`；`GlobalSearch.tsx:92`；`nebulaClusters.ts:350`；`genres.test.ts:20-37` |
| H-22 | **`npm run verify` 无法在本机之外的机器上运行**：`playwright` 不在 `devDependencies`，脚本回退到硬编码个人路径 `/home/crow/.hermes/node/lib/node_modules/playwright`；而 `verify` 是 `package`/`deploy` 的前置门禁 → 发布门禁"本机能过、换机必挂" | `package.json:19-22`；`scripts/test_matrix.js:9-19` |
| H-23 | 体积预算门禁只覆盖 4 项且**不含总首屏与回归基线**：CSS 22.3 KB gz、初始总量、14 个懒加载曲风 chunk（213 KB gz）均在预算之外 | `scripts/check_budgets.js:5-10` |

### 4.3 P2 · Medium（摘要）

- **MIDI 导出**：导出后同步 revoke Blob URL（其他导出器延迟 1s）→ Safari 偶发下载失败（`MidiExporter.ts:318,463`）；meta 事件比较两向返回 −1（`:243-246`）。
- **WAV 导出**：负 BPM → 负 `lengthInSamples`；`bars` 无上限；离线 swing 不钳制（`WavExporter.ts:117-120,136,183`）。
- **`ChordAudioEngine.playGuitarNote`** 创建并配置了 `bodyFilter` 却从不 connect → 每个吉他音符泄漏一个 BiquadFilter（`:308-311` vs `:325-327`）。
- **`AudioEngine.destroy()`** 不清 `reverbBus/delayBus/noiseBuffer/trackStrips`，不调 `IosAudioUnlocker.dispose()`（`AudioEngine.ts:1189-1210`；`iosAudioUnlock.ts:187`）；`AudioWorkletClock.destroy()` 遗留 `isUsingWorklet = true`。
- **`AudioEngine.workerBridge`** 构造后从不 start，只被 destroy → 每个引擎白养一个 Worker（`AudioEngine.ts:82,142,1194`）；`startScheduler` 同时跑 worklet 时钟与 25ms `setInterval` 看门狗 → `schedulerLoop` 双倍调用（`:817-824`）。
- **`getTrackDestination`** 对 track > 15 静默回退到 `masterGain`，绕过音量/静音/声像/发送（`:353-355`）。
- **`SHIFT_TRACK`** 用 `steps.length` 索引全部数组，短于它的 `velocity/pitch` 会移入 `undefined`；`SET_TIME_SIGNATURE`/`SET_STEP_COUNT` 截断步进后 `totalSteps` 陈旧（`MidiExporter.ts:101`）；`loopRange` 从不钳制（`Ruler.tsx:71-73` 会画出界）。
- **`ProjectHubModal`** 的增删改查全部无 try/catch（未处理 rejection、无 toast）；`103-121` 列表加载乱序；`290-303` 拖入任意文件即导入、无类型/大小校验。
- **无障碍/视觉**：447 处 < 12px 文本（229×10px、136×11px、48×9px、24×8px、10×7px）；两个对比度不达标的 token（`#636875` = 3.33:1、`#737887` = 4.21:1）；53 个控件 `p-0.5/p-1` 远低于 44px 触控目标；5 处 hover-only 交互在触屏不可达；`GalaxyView.tsx:1570` 用 `100vh`（移动端浏览器 UI 遮挡），应为 `dvh`；`ShortcutsModal.tsx:50` 与 `Modal` 默认 `max-w-lg` 冲突；`Toast.tsx:121` 错误提示用 polite 区域；全仓 0 个 `aria-controls`（5 个 `aria-expanded` 无对应面板 id）；`ErrorBoundary.tsx:110,128,140` 硬编码"重试 / Retry"双语同显。
- **i18n**：556 处内联 `isZh ?` 三元（`Toolbar.tsx` 独占 125 处）；20 处硬编码英文 JSX 文本；25 处硬编码英文 `aria-label`；216 个定义却从未被字面量 `t()` 使用的 key。
- **响应式**：`HorizontalTimelineView.tsx:768` `min-w-[1500px]`、`GenreDetailView.tsx:619` `min-w-[620px]`、`PianoKeyboardVisualizer.tsx:71` `min-w-[560px]` 等，仅有 19 个 `overflow-x-auto` 包裹。
- **`window.confirm`** 2 处；`select-none` 在 57 个交互面上阻止文本选择。

### 4.4 P3 · Low / 死代码与清理

- **`src/ui` 设计系统大部分是死代码**：`Button`、`IconButton`、`Chip`、`Card`、`Slider`、`Select`、`Tooltip`、`EmptyState`、`ErrorState`、`GenreCard`、`Drawer` **零生产 import**；只有 `Modal`、`Toast`、`Skeleton`、`AriaLiveRegion`、`announcer`、`RadarChart` 被使用。视图各自内联了等价实现。
- **`hooks/useGenreGraph.ts` 导出后无人调用**，却静态 import 了全部曲风桶文件；`useReducedMotion` 同为死代码（`GalaxyView` 自己内联 `matchMedia` 两次），且 CSS 只中和 CSS 动画，5 个 rAF 渲染循环在"减少动态效果"下仍全速运跑。
- **`scripts/lint_genres.ts`（含关系/时间线校验）与 `scripts/build_genre_index.ts` 均为孤儿脚本**：`package.json`、CI、`build_all.py` 都没有引用，`node_modules` 里也没有 `tsx`/`ts-node` 可执行它们 → `lint:data` 实际只跑 `src/test/schema.test.ts`。
- 201 处源码里出现 `P0-xx`/`P7-03` 之类任务 ID，其中部分进入**用户可见文案**（`Header.tsx:298` tooltip 带 `(P6-05)`、`CustomGenreMakerView.tsx:382` 徽章直接显示 `P7-03 V1.15.3`）。
- `src/utils/telemetry.ts` 的 `trackEvent` 无任何生产调用，且没有上报出口（无 `sendBeacon`/endpoint）——"可观测性 P4-10"实际是本地数组。
- **仓库卫生**：`scripts/__pycache__/gen_p1.cpython-314.pyc` 被 git 跟踪（`.gitignore:29-30` 已写 `__pycache__/` 却仍被早期提交带入）；`.gitignore` 漏掉 `.wrangler/`、`.env`、`.dev.vars`（`git check-ignore` 全部返回"未忽略"）；工作区残留 `release/`（39 MB / 22 个条目）与 `scratch/`。
- **30+ 个一次性 Python 生成器**（`gen_*.py`/`data_*.py`，约 350 KB）无任何 npm script 入口，属死代码。
- **测试配置缺失**：`vitest.config.ts` 没有 `setupFiles`，因此 `@testing-library/jest-dom` 装了却从未加载（117 个 `toBeTruthy()` vs 1180 个 `expect()`）。
- **`scripts/**` 与 `*.js` 既不被 eslint（`.eslintrc.cjs:29` 排除）也不被 tsc（`tsconfig.json:23` 只 include `src`）覆盖** → 构建脚本、e2e 脚本、预算脚本全是静默盲区。
- 曲风数据里 `subgenres`/`parent_genres` 全空（见 §3.4），却仍有 3 处 UI/算法分支引用。

---

## 5. UI / 交互 / 无障碍专项

### 5.1 量化基线

| 指标 | 实测 |
|---|---:|
| `<button>`/`<a>` 总数 | 379 |
| 纯图标按钮缺可访问名 | 22 |
| 无 `aria-label` 或无 `<label htmlFor>` 的表单控件 | 44 |
| 全仓 `htmlFor` | **0** |
| `<canvas>` / 有文本替代 | 9 / **0** |
| 全仓 `aria-hidden` | 1 |
| `focus-visible` 覆盖的按钮（且在生产代码中） | **0** |
| 字号 < 12px 的文本节点 | 447 |
| 内联 `isZh ?` 三元 / `t()` 调用 | 556 / 723 |
| 硬编码十六进制色值出现次数 / 唯一色值 | 1,220 / 357 |
| 任意值 `shadow-[…]` | 194 |
| `React.memo` 使用 | 6（但全部被内联 props 击穿，等效为 0） |
| `key={index}` | 18 |

### 5.2 交互一致性

1. **探索类视图三套皮**：`GalaxyView` / `HorizontalTimelineView` / `VerticalTimelineView` 手写同一套头部+分类选择器，而唯一抽象 `ExploreScaffold` 只服务测试。→ 统一到一个 scaffold，同时天然解决 H-16 与响应式问题。
2. **弹层四套实现**：只有 `ui/Modal` 正确（陷阱+初始焦点+归还+Esc+遮罩）。其余三处野生实现要么无 Esc、要么无陷阱。→ 全部改走 `ui/Modal`。
3. **状态表达不统一**：`StudioView`/`detail` 有骨架屏；`CompareView`/时间线/`ExploreListView` 无载入-空-错三态；`ChallengeView` 有完整反馈。→ 建立统一 `AsyncState` 契约。
4. **原生弹窗与自研弹窗并存**：`window.confirm` 2 处。→ 统一 `ConfirmDialog`（`Modal` 之上 30 行）。
5. **快捷键无"弹窗开启"门禁**：`g`/`?`/`D` 在模态打开时依然触发导航或切换。→ 全局快捷键入口加 `[aria-modal="true"]` 早退。

### 5.3 无障碍（对照 WCAG 2.1 AA）

| 准则 | 现状 | 主要缺口 |
|---|---|---|
| 2.4.7 焦点可见 | ❌ | C-08，无任何全局 focus 样式 |
| 4.1.2 名称/角色/值 | ❌ | 22 个图标按钮 + 44 个表单控件无名；0 个 `htmlFor` |
| 1.1.1 非文本内容 | ❌ | 9 个 canvas 无替代文本，包括承载 159 曲风浏览的 `GalaxyView` |
| 1.4.3 对比度 | ⚠️ | 2 个 token 不达标（3.33:1 / 4.21:1） |
| 1.4.4 文本缩放 | ⚠️ | 447 处 < 12px |
| 2.1.1 键盘可达 | ⚠️ | 步进格可聚焦但不可激活（H-10）；loop 单元格是无焦点 `div` |
| 2.4.3 焦点顺序 | ⚠️ | 3 个弹层无陷阱（H-17） |
| 2.3.3 动画 | ⚠️ | CSS 层已处理；5 个 JS rAF 循环未接入 reduced-motion |
| 2.5.5 目标尺寸 | ⚠️ | 53 个控件 < 44px |

**结论：`BACKLOG.md` 中"Phase 2 无障碍 100% 验收（WCAG 2.1 AA 达标）"与实测不符**，实际大致处于"部分 AA"。这是本次审查中最重要的"文档-实现"偏差之一。

---

## 6. 工程化 / 测试 / 性能

### 6.1 测试是"绿灯但无牙"

- **规模**：41 文件 / 324 用例 / 5,796 行，逻辑面覆盖尚可（路由 18、曲风库 8、乐理多套）。
- **假测试（必须替换）**：
  - `sequencerMeter.test.ts:4-27` **测的是自己在本文件里重新实现的三个 helper**——`calculateStepsPerBar`/`isSnareBackbeat`/`isKickHit` 在整个 `src/` 中不存在（已 grep 验证），且其 3/4 期望值与生产代码 `StudioView.tsx:1150-1153` 矛盾。整个文件对已交付代码零断言。
  - `audio.test.ts:548-605` 的限幅/swing/gate 三例**内联重算引擎算术**；gate 断言了一个 `playBass`/`playChord` 从未施加的钳制 → 假信心。
  - `AnatomyKickEngine.test.ts:111-118` **零 `expect()`**。
- **结构性盲区**：jsdom 无 `AudioContext`（已验证 `'AudioContext' in window === false`），**没有任何测试调用过 `play()`/`pause()`/`schedulerLoop()`** → look-ahead 调度、loop、swing、panic、voice registry、音频图 **0% 真实覆盖**。`wavExport.test.ts` 只测字节编码器，从不调用 `exportMasterWav`；`AbletonExporter.test.ts` 只做 `toContain` 字符串匹配。
- **无测试模块 54 个**，含全部 8 个音序器子组件（Toolbar/Ruler/StepCell/TrackRow/VelocityLane/GenreRail/InfoDossier/EuclideanModal/PitchPickerModal）、`projectStorage.ts`、5 个视图、`GlobalSearch`。
- **测试隔离缺陷**：`ProjectHubModal.test.tsx` 的 `beforeEach` 只清 localStorage，**不重置 fake-indexeddb**；`customGenreDb.test.ts` 干脆不 import `fake-indexeddb`，因此其"数据库"测试全部只命中内存 Map。
- **Flaky（当前 CI 红）**：在覆盖率插桩下 `CustomGenreMakerView`（15s 超时边界）与 `ProjectHubModal`（依赖 seed 工程存在）稳定失败，裸跑通过 → 时间敏感 + 状态污染。**注意：vitest 在用例失败时完全不产出覆盖率报告**（本次两次实测均无 `coverage/` 目录、无表格），所以"覆盖率门禁"当前处于"要么不跑、要么跑不出数"的状态。
- **覆盖率分布（唯一一次成功运行实测）**：整体行 **82.3%** / 函数 **61.1%**，但分布极度倾斜——`src/views` **13.8%**、`src/components` **24.1%**，其中 **9 个视图 0%**（StudioView、GalaxyView、GenreDetailView、CompareView、ChordProgressionsView、ExploreListView、HorizontalTimelineView、VerticalTimelineView、KickAnatomyView），`pwa.ts`、`useGenreAudition.ts`、`useReducedMotion.ts` 亦为 0%。`vitest.config.ts:15-21` **没有任何 thresholds**，`npm run verify` 也**不含 coverage** → 高总覆盖率是分母效应，不具备保护力。

### 6.2 构建与体积

| 项 | 实测 |
|---|---|
| `vite build` | 65s |
| `dist` 原始总量 | 2.89 MB |
| 首屏（默认 `/`）JS gzip | **≈336 KB**：entry 49.3 + react 44.8 + icons 9.3 + StudioView 59.8 + 14 个 genre chunk **172.0** + 共享桶 0.5 |
| CSS gzip | 22.0 KB |
| 最大单 chunk | `vendor-three` 127 KB gzip（仅 Galaxy 需要，未进入首屏 ✅） |
| 预算门禁 | 仅 4 项，`vendor-three` 阈值 145 KB（余量 20 KB）易被静默吃掉 |

**关键结论**：`src/data/index/loader.ts` 精心设计的按需加载（P1-13）被 `StudioView.tsx:4` 等 8 处静态桶导入完全抵消。修掉后首屏 gzip 有望从 ≈358 KB 降到 **≈185 KB**（-48%）。

### 6.3 CI 与发布门禁

| 问题 | 证据 |
|---|---|
| **CI 事实上从未运行过**：只监听 `main`/PR→`main`，而 `main` 停在 v1.14.1（落后 `next` **17 个 commit**），且**仓库没有任何 git remote** → v1.15–v1.16 的全部工作零 CI 覆盖 | `.github/workflows/ci.yml:5,7`；`git rev-list --count main..next` = 17；`git remote -v` 为空 |
| CI **缺少** `test:e2e`（而 `npm run verify` 有） | `ci.yml` vs `package.json` scripts |
| CI 无覆盖率门槛、不上传覆盖率产物 → `test:coverage` 失败也只体现在退出码 | `vitest.config.ts:15-21`；`ci.yml:33-34` |
| Playwright **不在 devDependencies**，脚本回退到硬编码的 `/home/crow/.hermes/node/...` → `verify`/`package`/`deploy` 换机即挂 | `scripts/test_matrix.js:9-19`；`package.json:19-22` |
| `test:coverage` 当前失败 → CI 若跑 `next` 会红 | 本次实测 |
| 无版本单一来源；无"生成物 == 仓库数据"校验 | §3.3 |
| `lint_genres.ts`（关系/时间线完整性）未接入任何门禁 | §4.4 |
| `scripts/**` 与 `*.js` 不在 eslint / tsc 覆盖范围内 | `.eslintrc.cjs:29`；`tsconfig.json:23` |
| 无 Lighthouse / axe / 视觉回归 / 真实性能（LCP）门禁 | 全仓 |

### 6.4 文档漂移

| 文档 | 声称 | 实际 |
|---|---|---|
| v1.0 基线规划文档（开源整理时删除） | 基线 v1.0 / `3e188c9` / 54 文件 / 95,047 行 | 现为 194 文件 / 134,892 行 —— 文档已过期约 40% |
| `ROADMAP_V2.md` | "当前基线 v1.13.0" | 实际 v1.16.0；Phase 6/7/8 多数已交付但文档头部未更新 |
| `BACKLOG.md` | "Phase 2 无障碍 100% 验收（WCAG AA 达标）" | 实测未达标（§5.3） |
| `BACKLOG.md` | "P4-08 数据生成管线治理：CI 校验生成结果 == 仓库数据" | 无该 CI 步骤，生成脚本本身是孤儿 |
| `DEPLOY.md` | 发布包 ~236 KB、67 个测试、SW 未注册 | 实际 518 KB、**324** 个测试、`pwa.ts:92` 确实注册 SW —— 三项全错 |
| `BACKLOG.md` | "P4-09 内容质量补强：每曲风 ≥2 真实来源、关系覆盖 159 源" | `build_all.py:72-73` 的检查是 `pass` 空操作；关系覆盖已达标（159/159）但来源未被强制 |
| 版本号 | 单一 | 5 处散落，2 处漂移 |

### 6.5 端口与本地并行开发（按你的要求专项核对）

- **已做好**：`scripts/test_matrix.js:45-47`、`capture_*.js` 均用 `server.listen(0)`（内核分配临时端口），本次实测拿到 `127.0.0.1:41429`——**跨端矩阵与截图脚本天然不会和本机其他开发/测试抢端口**。
- **有风险**：`vite.config.ts:10-12` 把 dev server 硬编码为 `port: 3000, host: true`，**没有 `strictPort`，也没有读取 `PORT`/`VITE_PORT` 环境变量**。本机 `8080`、`3080`、`80` 已被其他进程占用；当 3000 被占用时 Vite 会静默换端口，脚本/文档/书签仍指向 3000，容易出现"我看的是旧实例"的误判。`preview` 使用默认 4173 同样不可配。
- **本次审查已遵守**：所有服务只使用临时端口，未占用 3000/8080/3080/80。
- **建议**：见规划 E-06。

---

## 7. 改进与完善规划

> 组织方式：四个冲刺（S0–S3）+ 一个功能深化轨道（S4）。
> 工时单位：人日（含自测与文档）。ID 可直接用于 commit message。
> 每项均给出**可量化验收标准**。

### S0 · 正确性与数据安全（P0 止血，建议 5–7 人日，最高优先）

| ID | 任务 | 涉及文件 | 验收标准 |
|---|---|---|---|
| **F-01** | 音频零值钳制 + 调度器异常隔离 | `AudioEngine.ts:955,909-919`、`DrumKitModels.ts`、`PolySynth.ts`、`AnatomyKickEngine.ts` | 新增单测：velocity=0 / volume=0 / pitch=-5 下 `play()` 不抛错、`currentStep` 持续前进；`exponentialRampToValueAtTime` 入参永不 ≤0 |
| **F-02** | 追赶风暴重同步 | `AudioEngine.ts:889-902`、`MasterclassAudioEngine.ts:355-362` | 模拟 5s 停顿后，下一步时间 ∈ `[now, now+stepDur]`，且单 tick 排程 voice 数 ≤ 1 步 |
| **F-03** | WAV 导出接入混音器 | `StudioView.tsx:1360-1384`、`WavExporter.ts:165,183,192-194` | 母带/分轨导出同时静音 A 轨并对比：导出波形 RMS 变化符合预期；probability/swing 与实时一致；补 3 条导出单测 |
| **F-04** | 撤销/重做语义重建（含 `canUndo/canRedo` 进 state、no-op 忽略、快照补齐 song/loop/metronome 字段） | `useSequencerStore.ts:807-913`、`Toolbar.tsx:686,700` | 新增 hook 级测试：一次 tick 多次 commit 只压 1 条；连续 3 次 undo 回退 3 个不同状态；`songMode` 等字段可被撤销还原 |
| **F-05** | 手势批量提交（力度、swing、BPM） | `VelocityLane.tsx:105-150,396-420`、`Toolbar.tsx:283,1013-1018` | 拖拽一整行力度后历史仅 +1；值未变不产生快照 |
| **F-06** | 工程切换单一真相源 + legacy 键同步 | `projectStorage.ts:61-115`、`useSequencerStore.ts:151-181`、`ProjectHubModal.tsx:212-218` | 切换 A→B→刷新，载入的必须是 B；新增回归测试（无测试文件 → 新建 `projectStorage.test.ts`） |
| **F-07** | IndexedDB 事务语义与降级提示 | `projectDb.ts:21-22,100-115,170-184,280-292,525-527`、`customGenreDb.ts:139-151` | 用 `fake-indexeddb` 模拟 `abort`：写入必须 reject；`getAllProjects` 失败必须抛错而非返回空；删除失败必须报错 |
| **F-08** | 分享/导入载荷运行时校验 + 大小上限 | `customGenreCodec.ts:99-138`、`projectDb.ts:384-465` | 恶意样本（`__proto__`/对象 `n`/百万长数组/`1e999`/解压炸弹）全部被拒且不崩；新增 ≥10 条安全测试 |
| **F-09** | 分享编码/解码上限对齐 | `SequencerUrlShare.ts:177` + 编码端 | 16 轨 × 64 步满载荷 round-trip 成功；超限时编码端明确降级或报错 |
| **F-10** | 单声道 WAV 修复 + 导出参数钳制 | `WavExporter.ts:48-99,117-136,183` | 单声道 buffer 编码不抛错；bpm<20 / bars>1024 / swing 越界均被钳制；断言 WAV 头 offset 4/28/32 |

**S0 出口标准**：`npm run test` 与 `npx vitest run --coverage` 双绿；上述 10 项均带回归测试；`AudioEngine` 首次具备"真正调用 `play()`"的 fake-AudioContext 测试夹具。

### S1 · 体验与无障碍（建议 6–8 人日）

| ID | 任务 | 验收标准 |
|---|---|---|
| **U-01** | 全局 `:focus-visible` 设计化焦点环 | 全站 Tab 遍历截图检查；axe 无"focus not visible"；`index.css` 新增 base 规则 |
| **U-02** | 3 个野生弹层 + `ProjectHubModal` 收敛到 `ui/Modal`（含 Esc/陷阱/初始焦点/归还） | 每个弹层：Tab 循环不逃逸、Esc 关闭、关闭后焦点回到触发按钮（新增 4 条 RTL 测试） |
| **U-03** | 补齐 4 个缺失 i18n key + 新增"所有字面量 `t()` 可解析"测试 + 移除 `as any` | `drums_only`/`full_band`/`chords_bar_prefix`/`shortcuts_guide_title` 中英均正确渲染；测试对 `src/**` 扫描 `t("…")` 断言 100% 命中 |
| **U-04** | 9 个 canvas 加 `role="img"` + 动态 `aria-label` + sr-only 数据镜像（Galaxy 提供等价列表入口） | Galaxy 在屏幕阅读器下可遍历 159 曲风（非 WebGL 失败也可见）；axe 无 canvas 违规 |
| **U-05** | 对比度与大字号：替换 2 个不达标 token；`< 12px` 文本收敛到 `text-xs` | 对比度全部 ≥ 4.5:1；`grep 'text-\[\(7\|8\|9\|10\|11\)px\]'` 在 `sm:` 以下为 0 |
| **U-06** | 触控目标与 hover-only：53 个 `p-0.5/p-1` 控件补 ≥44px 命中区；5 处 hover-only 改为常显或 `@media (hover:hover)` 门禁 | 移动端点击成功率人工验收；`touch-hit-44` 覆盖所有图标按钮 |
| **U-07** | 表单可访问名：44 个控件补 `aria-label` 或 `id`+`htmlFor` | `htmlFor` 从 0 提升到覆盖所有可见 label；axe 表单违规 0 |
| **U-08** | 统一异步三态：`CompareView`/时间线/`ExploreListView` 加 loading/empty/error + 按钮 `disabled` | 试听按钮连点只触发一次；无数据时显示 `EmptyState` 而非空白 |
| **U-09** | 弹窗开启时全局快捷键早退 + `e.defaultPrevented` 检查 | 模态内按 `g`/`?` 不导航；网格方向键不触发应用级快捷键 |
| **U-10** | 交互一致性收敛：`ExploreScaffold` 落地到三个探索视图；`window.confirm` → `ConfirmDialog`；步进格键盘激活打通 | 三个视图共用 scaffold；方向键不越界；Space 可切换格子 |
| **U-11** | i18n 债务：`Toolbar.tsx`（125 处）优先迁移出内联三元，其次 `StudioView`(42)/`SomaticControls`(32)/`Galaxy`(27)/`ShortcutsModal`(26)/`ProjectHubModal`(26) | 内联 `isZh ?` 从 556 降到 < 100；`t()` 使用率 > 95% |

**S1 出口标准**：Lighthouse Accessibility ≥ 95；axe critical/serious = 0；移动端 390×844 全视图无横向溢出且无 < 12px 正文。

### S2 · 性能与架构收敛（建议 8–10 人日）

| ID | 任务 | 验收标准 |
|---|---|---|
| **A-01** | 打断曲风静态导入链：8 处 `from "../data/genres"` 改为按需 `loadGenre`/index 元数据 | 首屏 gzip JS ≤ **200 KB**（现 ≈336）；`/studio` 初次进入不加载任何 `genre-*` chunk |
| **A-02** | 消除 `StudioView` 巨型文件：拆出 transport / mixer / pattern-actions / export 4 个 hook + 3 个子组件 | 单文件 ≤ 700 行；行为零回归（现有 324 用例 + e2e 全绿） |
| **A-03** | 音序器渲染优化：`useCallback` 化 handler、track/step 级 `memo`、selector 化订阅 | 播放中单帧重渲染 ≤ 8 行（用 React Profiler 断言）；256 格全量重渲染消失 |
| **A-04** | 撤销历史改为按字节上限 + patch 存储 | 常驻内存 < 2 MB；50 次编辑后 undo 仍精确 |
| **A-05** | 音频层架构收敛：抽出共享 `Scheduler` 基类与 `VoiceRegistry`；`ChordAudioEngine`/`MasterclassAudioEngine` 复用；删除死 `workerBridge` 与双时钟 | 三套调度器收敛为 1 套 + 2 个适配器；重复代码行数下降 ≥ 400 |
| **A-06** | 启用或删除 `src/ui` 设计系统（Button/Chip/Slider/Select/Tooltip/Card/EmptyState/ErrorState/GenreCard/Drawer） | 每个组件二选一：生产 import ≥ 1 处，或删除；`useReducedMotion` 接入全部 5 个 rAF 循环 |
| **A-07** | 画布性能：`Uint8Array` 移入 ref；`stepQueue` 有界 + `document.hidden` 跳过；`100vh` → `dvh` | 长跑 10 分钟内存曲线平稳；后台标签页 `stepQueue.length ≤ 32` |
| **A-08** | 数据层：`version.json` 拆分（只取最新 N 条 + 按需加载历史） | 首屏不请求 `version.json`；检查更新请求体 ≤ 8 KB |

**S2 出口标准**：首屏 gzip ≤ 200 KB；LCP（中端安卓 4G 模拟）≤ 2.0s；播放期单帧重渲染 ≤ 8 行。

### S3 · 工程化与质量门禁（建议 7–8 人日）

| ID | 任务 | 验收标准 |
|---|---|---|
| **E-01** | 消除 flaky：`ProjectHubModal.test.tsx` 每例重置 IndexedDB；`CustomGenreMakerView.test.tsx` 依赖真实异步而非固定超时（或拆分为可注入的 storage 边界） | `npx vitest run --coverage` 连续 5 次全绿；`--sequence.shuffle` 下仍全绿 |
| **E-02** | 替换假测试：删除 `sequencerMeter.test.ts` 的自造 helper，改为 import 生产函数；`AnatomyKickEngine.test.ts` 补 `expect`；`audio.test.ts` 三例改为调用真实引擎 | 生产代码函数覆盖率从"间接"变为直接；`test:coverage` 能产出报告（当前因失败不产出） |
| **E-03** | 新建 fake-`AudioContext` 夹具，补齐 `play()`/`pause()`/`schedulerLoop()`/`panic()`/`loopRange`/swing 单测 | 音频调度核心路径 ≥ 70% 语句覆盖；至少 1 条"零值不卡死"回归测试 |
| **E-04** | CI 加固：触发分支加 `next`（并配置 git remote）；补 `test:e2e` 步骤（Playwright 入 devDependencies + 版本锁定 + 删除硬编码个人路径）；覆盖率设 thresholds 并上传产物；失败必须红灯 | 故意引入一个失败测试，CI 必须失败；`next` push 触发完整门禁；在非本机路径（CI 容器）下 `npm run verify` 可完整跑通 |
| **E-05** | 版本单一来源：`package.json` → 生成 `CURRENT_CLIENT_VERSION`/`APP_VERSION`/`sw.js CACHE_VERSION`/`.groove appVersion`；修正 `sw.js` 的 `skipWaiting` 与更新提示流程 | 全仓版本号只有 1 处可手改；`grep 1.13.0` 为 0；改版本后 SW 提示更新且不静默接管 |
| **E-06** | **开发/测试端口隔离**（对应你的要求）：`vite.config.ts` 读取 `process.env.PORT`/`VITE_PORT`，默认 3000 但 `strictPort: false`；`preview` 同样可配；启动日志打印最终实际 URL；文档与书签改用变量 | 同时启动两个实例不冲突；`PORT=5273 npm run dev` 生效；e2e/截图脚本继续使用临时端口（保持现状）；CI 与本地并行开发互不抢占 3000/8080/3080 |
| **E-07** | 数据管线接入门禁：把 `lint_genres.ts` / `build_genre_index.ts` 用 `tsx` 跑起来并接入 `lint:data` 与 CI（校验"生成结果 == 仓库数据"） | 手动改坏一条 relation，CI 必须报错；`genresIndex` 漂移被自动发现 |
| **E-08** | 可观测性落地：`trackEvent` 接真实出口（或删除）；错误报告带正确版本号；错误 Toast 改用 assertive | 错误上报含正确版本与堆栈；`telemetry` 无死导出 |
| **E-09** | 文档同步：刷新 `ROADMAP_V2.md` 头部、`BACKLOG.md` 无障碍章节的真实状态；建立"文档声称 = 实测证据"的复核约定 | 三份文档的基线与版本号与 `package.json` 一致；每条 ✅ 附可复现命令 |
| **E-10** | 前端可观测门禁（可选）：接 Lighthouse CI（性能/无障碍/SEO 预算） | PR 上产出 Lighthouse 报告并对预算漂移报警 |
| **E-11** | 数据 schema 全字段校验：`validateGenre` 从 8 字段扩到全部 30 字段；`build_all.py:72-73` 的 `pass` 换成真实校验；内容模板占位检测（禁止 159/159 雷同句） | 故意清空一个 `subgenres`、注入一条模板文案，门禁必须报错；测试不再硬编码 `159` |
| **E-12** | 仓库卫生：`git rm --cached` 那个 `.pyc`；`.gitignore` 补 `.wrangler/`、`.env`、`.dev.vars`；清理 `release/`（39 MB / 22 个条目）与 `scratch/`（16 KB）；删除无入口的 30+ 个一次性 Python 生成器 | `git ls-files \| grep pyc` 为空；`git check-ignore .env` 生效；仓库体积下降 ≥ 39 MB |
| **E-13** | 测试基建补全：`vitest.config.ts` 加 `setupFiles`（启用 jest-dom）；e2e 从 329 行 smoke 脚本升级为 `@playwright/test` spec（断言音频/网络/离线，禁 `waitForTimeout` 兜底） | jest-dom 断言生效；e2e 中 `waitForTimeout` 从 12 处降到 0 |

**S3 出口标准**：`npm run verify` 成为唯一可信的"绿灯"来源；`next` 分支受 CI 保护；任意一次 `verify` 失败都能定位到具体门禁。

### S4 · 功能补全与深化（建议 10–14 人日）

| ID | 任务 | 说明 | 验收标准 |
|---|---|---|---|
| **N-01** | **P8-02 硬件调音台视窗**（路线图剩余项，2.5d） | 8 根 100mm 推子 + Pan/Send + 立体声峰值表 + Solo/Mute/反相，与音序器双向同步 | 推子与 store 双向同步无抖动；峰值表 60fps 不掉帧 |
| **N-02** | **P8-03 HRTF 3D 空间音频**（2.5d） | `PannerNode(panningModel: "HRTF")` 环形声场；Galaxy 漫游时按距离/方位融合试听 | 耳机下可辨前后左右；无相位抵消（单声道兼容性检查） |
| **N-03** | **P7-04 WebRTC 局域网锁相合奏**（3.5d） | Master 时钟 + 二维码加入 + 分轨分工 | 局域网对齐误差 < 5ms（用 `AudioContext.getOutputTimestamp` 实测） |
| **N-04** | 导出器一致性套件 | 统一 MIDI/ALS/WAV 三种导出走同一 render IR，消除"三份不同的音符集" | 同一 pattern 三种导出的音符集合完全一致（自动化断言） |
| **N-05** | 分享体验升级 | 分享前预估 URL 长度并给出降级选项（短链服务或本地文件分享）；工程包支持二维码 | 满载荷分享有明确提示且可用 |
| **N-06** | 内容深化（差异化） | 把 159 曲风中的关系图谱、代表性曲目升级为可校验链接；新增"同源对比"教学模式 | 关系覆盖 159/159 source；外链可校验 |
| **N-07** | SEO / 分享卡片 | `index.html` 补 `description`/OG/Twitter/canonical；曲风详情页动态 `document.title` + meta | 分享到社交平台有富卡片；曲风页标题唯一 |
| **N-08** | 自托管字体 | 现依赖 Google Fonts（国内可用性与首屏阻塞风险），改为自托管子集 | 移除 render-blocking 外链；首屏字体请求 ≤ 2 个文件 |

---

## 8. 里程碑与排期建议

| 冲刺 | 主题 | 任务数 | 工时 | 出口（可量化） |
|---|---|---:|---:|---|
| **S0** | 正确性与数据安全 | 10 | 5–7d | 双测试门禁绿；10 项 P0 全部带回归测试 |
| **S1** | 体验与无障碍 | 11 | 6–8d | Lighthouse a11y ≥ 95；axe serious = 0 |
| **S2** | 性能与架构 | 8 | 8–10d | 首屏 JS gzip ≤ 200 KB（含 CSS ≤ 220 KB）；单帧重渲染 ≤ 8 行 |
| **S3** | 工程化与门禁 | 13 | 7–8d | `next` 受 CI 保护（含 remote）；版本单一来源；端口可配；数据 schema 全字段校验 |
| **S4** | 功能补全深化 | 8 | 10–14d | P7-04/P8-02/P8-03 交付；导出器一致 |
| **合计** | | **50** | **≈36–47d** | v2.0.0 里程碑 |

建议按 **S0 → S1 → S3 → S2 → S4** 顺序执行：先止血与可验证性，再体验，再建立门禁（使后续性能优化不会重新腐化），最后做性能与功能。

### 9. 度量目标（current → target）

| 指标 | 当前 | 目标 |
|---|---|---|
| 首屏 gzip（JS+CSS） | ≈358 KB | **≤ 220 KB** |
| 首屏曲风数据占比 | 172 KB（48%） | **0 KB（按需）** |
| `vitest run --coverage` | **红（2 failed）** | 绿且报告产出；核心音频路径 ≥ 70% |
| 视图层覆盖率 | 13.8%（9 个视图 0%） | ≥ 50%（每个视图至少一条冒烟测试） |
| CI 实际覆盖面 | **0（从未运行）** | `next` + `main` 双分支，含 e2e 与覆盖率门槛 |
| 假测试文件 | 3 个 | 0 |
| 无测试引用模块 | 54 | ≤ 20 |
| 数据 schema 校验字段 | 8 / 30 | 30 / 30 |
| 硬编码 `159` 的测试 | 5 个文件 | 0（改为从数据源推导） |
| 仓库被跟踪的二进制垃圾 | 1 个 `.pyc` + 39 MB `release/` | 0 |
| `--quiet` 掩盖的 lint warning | 179 | ≤ 20（且不静默） |
| 缺失 i18n key | 4 | 0（并有测试守护） |
| 内联 `isZh ?`（硬编码文案，AST 口径） | 259 | **97** |
| 有设计化焦点的生产按钮 | 0 / 379 | 100% |
| canvas 有文本替代 | 0 / 9 | 9 / 9 |
| 对比度不达标 token | 2 | 0 |
| < 12px 文本节点 | 447 | < 50 |
| 版本号手改点 | 5（2 处漂移） | **1** |
| 开发端口 | 硬编码 3000 | 环境变量可配 + 临时端口脚本 |

---

## 9.5 实施进度（滚动更新，截至 v1.16.19）

> 图例：✅ 已交付并部署 ｜ ◐ 部分交付 ｜ ⏳ 进行中 ｜ ❌ 未完成 ｜ ⊘ 按需求排除（无障碍与 WebRTC）

### S0 · 正确性与数据安全 —— ✅ 11/11

| ID | 状态 | 版本 | 关键证据 |
|---|---|---|---|
| F-01/F-02 | ✅ | 1.16.1 | 零值钳制 + 调度异常隔离 + 停顿重同步；`src/test/audioDspGuards.test.ts` 19 例 |
| F-03/F-10 | ✅ | 1.16.1 | WAV 接入混音器、单声道越界与参数钳制；`wavMixerParity.test.ts` 8 例 |
| F-04/F-05 | ✅ | 1.16.1 | 撤销语义重建 + 手势合并；`sequencerHistory.test.tsx` 13 例 |
| F-06/F-07 | ✅ | 1.16.1 | 工程快照按 id 隔离、IndexedDB 真实事务语义；`projectStorage.test.ts` 6 例 |
| F-08/F-09 | ✅ | 1.16.1 | 载荷校验与分享链接自兼容；`sharePayloadSecurity.test.ts` 16 例 |
| F-11 | ✅ | 1.16.1 | 拍号分子回归修复；`sequencerMeter.test.ts` 33 例 |
| C-01（用户报告） | ✅ | 1.16.3 | Compare 经典预设 id 修正 + 静默失败改为显式报错；`CompareViewPresets.test.tsx` 4 例 |

### S1 · 体验与国际化（非无障碍）—— ✅ 4/4 完成 1 项部分

| ID | 状态 | 版本 | 说明 |
|---|---|---|---|
| U-03 | ✅ | 1.16.1 | 4 个缺失词条 + 词条完整性守卫测试 |
| U-08 | ✅ | 1.16.1 | Compare 三态与试听防重入 |
| U-09 | ✅ | 1.16.1 | 弹窗打开时禁用全局快捷键 + 尊重 defaultPrevented |
| U-10 | ✅ | 1.16.1 | 自研确认弹窗替换 `window.confirm` |
| U-11 | ✅ | 1.16.1~1.16.12 | 硬编码文案型内联三元 **AST 口径 259 → 97（达标 <100）**；剩余 72 处为数据驱动的字段选择（`isZh ? x.name : x.en`），不属于 i18n 债务。累计迁移 12 个文件、229 处文案、新增 229 个词条，全部逐字节校验。 |
| U-01/02/04/05/06/07 | ⊘ | — | 无障碍专项，按需求排除 |

### S2 · 性能与架构 —— ✅ 7/8 完成

| ID | 状态 | 版本 | 实测 |
|---|---|---|---|
| A-01 | ✅ | 1.16.2 | 首屏 JS 336 → 164KB gzip（-51%）；`redlines` R8 锁定 |
| A-02 | ✅ | 1.16.5~1.16.8 | `StudioView.tsx` 2000+ 行 → **658 行**（≤700 达标）；拆出 16 个 `features/sequencer/hooks/*` 与 7 个 `components/sequencer/*` 子组件，行为零回归 |
| A-03 | ✅ | 1.16.5 | 记忆化修复 + Toolbar 分片；`sequencerMemo.test.tsx` 探针可判别 |
| A-04 | ✅ | 1.16.3 | 撤销历史 ≤4MB 字节预算 |
| A-05 | ✅ | 1.16.7 | 三引擎共用 VoiceRegistry/限幅器/上下文/总线静音；`voiceRegistry.test.ts` 11 例 |
| A-06 | ✅ | 1.16.5 | 删除 9 个零引用组件与失效 hook |
| A-07 | ✅ | 1.16.2~1.16.9 | 播放队列有界 + 后台不累积 + 画布缓冲复用；`100vh → dvh` 已在 `GalaxyView.tsx` 落地（`h-[calc(100dvh-64px)]`），并与 CLS 归零同批验收 |
| A-08 | ✅ | 1.16.2 | 版本检查载荷 91KB → 3KB，变更日志按需加载 |

### S3 · 工程化与质量门禁 —— ✅ 13/14 完成

| ID | 状态 | 版本 | 说明 |
|---|---|---|---|
| E-01/E-02/E-13 | ✅ | 1.16.1~1.16.5 | flaky 消除、假测试替换、jest-dom 启用 |
| E-03 | ✅ | 1.16.3 | 假 AudioContext 真跑 `play()`；`audioScheduler.test.ts` 9 例 |
| E-04 | ✅ | 1.16.2~1.16.3 | CI 覆盖 next + e2e job + 覆盖率阈值 + 产物上传 |
| E-05 | ✅ | 1.16.1 | 版本单一来源（含三份规划文档基线自动同步） |
| E-06 | ✅ | 1.16.1 | 端口可配置 + worktree 隔离约定 |
| E-07 | ✅ | 1.16.5 | 索引漂移 + 曲风 id 守卫纳入 `lint:data` |
| E-08 | ✅ | 1.16.2 | 移除无出口埋点 API，明确诊断边界 |
| E-09 | ✅ | 1.16.5 | 三份文档基线刷新 + `docs:check` 纳入 CI 与慢轨 |
| E-11 | ✅ | 1.16.1 | schema 全字段校验 + 内容审计 |
| E-12 | ✅ | 1.16.2 | 仓库卫生与端口约定文档 |
| E-14 | ✅ | 1.16.2 | 首屏总量预算 + 曲风分包红线（红线总数 22） |
| E-10 | ❌ | — | Lighthouse CI：**本机无法安装 lighthouse（npm 只读且离线）**，未添加无法验证的门禁；改用 `scripts/measure_live_perf.mjs` 做真实浏览器测量 |

### S4 · 功能补全 —— ✅ 5/7 完成

| ID | 状态 | 版本 | 说明 |
|---|---|---|---|
| N-01 | ✅ | 1.16.7 | 硬件调音台视窗（P8-02）；母带表取自真实分析器，通道表由真实触发回调驱动 |
| N-02 | ✅ | 1.16.7 | HRTF 双耳空间监听（P8-03），默认关闭 + 调音台开关 |
| N-03 | ⊘ | — | WebRTC 局域网合奏，按需求排除 |
| N-04 | ✅ | 1.16.4 | 三种导出器共用确定性概率判定，音符集合一致且可复现 |
| N-05 | ✅ | 1.16.7 | 工程分享链接 + 二维码，超限引导改用工程包 |
| N-06 | ✅ | 1.16.10/1.16.11 | **同源对比教学入口**（关系图谱解析为源自/衍生/相关三组，一键加入对比）+ **外链可校验门禁**（795/795 为 https 且主机可信、元数据完整、来源数达标）。关系覆盖 159/159 由红线 R3c 守住。逐曲目的"规范链接"仍需人工考证，未凭空生成。 |
| N-07 | ✅ | 1.16.2 | SEO/社交卡片/运行时 canonical/PNG 图标 |
| N-08 | ◐ | 1.16.6 | 未自托管字体，但移除了每页 92KB 的中文 webfont CSS，中文改用系统字体 |

### S5 · 用户反馈回归与音色/联动补完（v1.16.16 →，滚动更新）

> 本节记录 v1.16.0 规划交付完毕后，由用户实测反馈驱动的修复与补完项。ID 与 S0–S4 沿用同一命名空间。

| ID | 状态 | 版本 | 关键证据 |
|---|---|---|---|
| B-01（用户报告） | ✅ | 1.16.16 | **底鼓设计 `INITIATE PULSE` 首次点击无声**：音频上下文原先只由同页另一个按钮创建，先点播放即在静音上下文里调度。改为 `AnatomyKickEngine.ensureContext()` 惰性建上下文，`trigger()` 缺 `ctx`/DC 阻断时自愈；`GravitationalSequencer` 新增 `onEnsureAudio` 回调，视图在建上下文后重挂分析器。`trackPolarity.test.ts` 两条惰性初始化回归；浏览器实测首次点击 oscillator 启动数 0 → 16。 |
| B-02（用户报告） | ✅ | 1.16.16 | **`.groove` 工程包版本戳写死 `1.15.2`**：`exportProjectToGrooveFile` 的 `appVersion` 参数默认值是硬编码字面量，落后两个小版本（审查文档 §4 那条"版本号漂移"实际未清净）。改为默认取 `src/version.ts`。**新增红线 R1b**：`src/` 下（除 `version.ts` 与测试）不得出现 semver 形状的字符串字面量——R1 只证明四个生成物与 `package.json` 一致，挡不住应用代码里新冒出的陈旧字面量，这正是本次的漏网方式。反向验证：放回 `"1.15.2"` → R1b 失败并定位 `projectDb.ts:515`。红线总数 19 → 20。 |
| N-09（用户需求） | ✅ | 1.16.16 | **曲风音色真正落地**：曲风数据一直为 8 轨声明 `instrument`（`flute_lead`/`rhodes_ep`/`808_bass`/`sub_bass` …），引擎从前忽略它、按轨道角色套同一固定预设（长笛主导曲风响成锯齿主音）。新增 `src/audio/instrumentPresets.ts` 四级回退链（精确预设名 → 别名表 → 轨道角色默认 → 全局默认）+ 补齐 17 件乐器合成器预设；实时引擎与离线 WAV 渲染器解析**同一个 preset**（导出与试听不再两套音色）。**数据文件零改动**。测试直接扫描 `src/data/genres/**` 的全部 159×8 个 `(track_id, instrument)` 组合并与类型化导出交叉比对，断言无一组落到全局默认、各音色可区分；引擎与离线各用 FakeAudioContext 对比新建节点证明"真的取用了这条映射"。 |
| N-10（用户需求） | ✅ | 1.16.16 | **声谱仪仪器级信号发生器**：`MasterAnalyzerSuite` 新增可选 `signalGenerator` 控件（电源开关 + 内置信号下拉框），与下方原有参考信号区块共用 `AnalyzerView` 里同一个 `generatorRef` 与状态源；旧区块 JSX/文案/播放停止**逐字节未改**，工作台侧边栏不传该 prop 渲染与之前完全一致。6 条交互测试 + 390px 实测无横向溢出。 |
| P-01（规划） | ✅ | — | **工作台重构规划文档**（618 行，开源整理时删除，原文件名 `STUDIO_REFACTOR_PLAN_v1.17.0.md`，目标里程碑由 v1.17.x 改为 **v2.0.0–v2.0.12**）：四档视口实测量测（1440×900 工具栏 173px / 手机 395px 占视口 47% / 常显控件 33 个 / 首屏仅剩 2–5 条轨）、5 个冲刺 29 项任务、v2.0.0–v2.0.12 里程碑。主张**推广已有的 `showAdvancedControls` 渐进披露范式**，而非重写；ID 命名空间 `D-/C-/L-/X-/G-` 与本文 `F-/A-/E-/U-/N-` 不重叠。 |
| N-11（用户需求） | ✅ | 1.16.17 | **工作台内浮出调音台**：抽出纯展示 `ConsolePanel`（引擎与音序状态全部注入），`/console` 路由退化为持有引擎+状态的 55 行薄包装，工作台把自己的 `engineRef`+store 交给浮层复用。**浏览器实测 `AudioContext` 构造数恒为 1**（打开浮层前后），浮层内推子改的就是工作台同一条轨道；四种关闭路径 + 关着时渲染 `null` 均有测试与反向验证。顺带修掉母带条在 1440px 下需横向滚动才能碰到的缺陷（改为滚动容器内 `sticky right-0`）。 |
| N-12（N-09 后续，本轮审查发现） | ✅ | 1.16.18 | **数据侧已补齐**：159 曲风逐一改用本命音色，`instrumentation` 从「159 次重复的同一句占位串」改为**159 种互不相同**的真实配器清单。实测对比：`lead` 5 种→**27 种**（`saw_lead` **92→28**）、`fx` 1 种→**9 种**（`noise_sweep` **159→54**，新增黑胶底噪/激光/上升噪/铜管重击/磁带停转/低频下坠/反向镲/下扫）、`bass` 9→14 种、`chords` 6→11 种；合成器预设库 **20→49 件**（新增 30 件真实参数预设，非改名）。我点名的那处已修：`bebop`/`hard-bop`/`cool-jazz`/`modal-jazz`/`free-jazz`/`traditional-jazz` 的主音从锯齿合成音改为 sax ×4 / trumpet ×2 / muted_trumpet ×1 / harmonica ×1 / brass_section ×1；拉丁世界改用铜管组/长笛/手风琴；摇滚金属保持 `guitar_lead` 16/17（本就正确，未动）。新增 `src/test/genreInstrumentation.test.ts` 八条数据门禁（配器条目数、互异度、占位词、轨道乐器须被配器清单点名、fx 与 lead 不得单值化）防止再次同质化，逐条反向验证过。仅改 `instrument` 与 `instrumentation`，`steps/velocity/pitch/gate/ratchet/probability/BPM` 逐字段核对未动。 |
| B-03（本轮审查发现） | ✅ | 1.16.18 | **工具栏分享链接丢掉 8 个逐轨字段**：分享编解码器一直支持 `pan`/`sendA`/`sendB`/`gate`/`ratchet`/`probability`/`trackLength`/`swing`，工程中心（`ProjectHubModal`）也逐字段映射了，但工具栏的分享按钮（`useExportActions.handleShare`）是内联拼装的、只传了 `volume` —— 于是**从工作台分享出去的链接声相被抹平、送出全部归零、门限/连击/概率/轨道长度/摇摆全部退回默认值**，接收方听到的是居中、干声且丢失编辑的版本（恰好抹掉 N-13 刚做的按曲风编排的声相与送出）。修法是收敛成 `SequencerUrlShare.toSharedTrack` 单一实现、两处入口共用（而非补那 8 个字段了事）。新增 `src/test/shareTrackFidelity.test.ts` 三条（映射键集合须与 payload 声明一致 / 满字段 encode→decode 全等 / 直接对最终 URL 断言 pan、sendA、sendB、swing 仍在），反向验证：从 `toSharedTrack` 删掉 `pan` → 三条全红，恢复后全绿。 |
| P-02（集成方独立复核，证据留档） | ✅ | 1.16.19 | **用真实模块（`vite-node` 导入 `GENRE_MIX_RESOLVED`）独立复核混音的「按曲风编排」是否成立**，不采信工作流自述：**159/159** 曲风都在表内；`(volume, pan)` 组合 **157 种互不相同 / 159**（修前是 **1 种重复 159 次**）；含送出后仍是 157 种。逐轨分布：kick 音量 24 档、snare 26 档、percussion 25 档、lead 20 档、fx 21 档；并且**专业约定没有被「多样性」破坏**——kick 与 bass 在全部 159 个曲风里 pan **恰好为 0**（低频保持单声道）、snare |pan| ≤ 0.08（保持居中），而 hihat 全在左侧（−0.42..−0.22）、percussion 对称展开（−0.45..+0.45）、chords 21 档、lead 18 档。**送出总线全部复活**：0 个曲风的两条送出仍为 0（修前 1272 条轨道 0 条声明）。trim：144 个不同取值，−4.43..+5.53 dB。复核脚本 `scratch/audit_mix_distinct.ts`。 |
| B-04（集成方独立复核的「修前」证据） | ✅ | 1.16.18 实测 | **用用户自己的界面复现了用户的原话**：起工作室 → 浮出调音台 → 直接从 DOM 读 8 条通道的推子/声相/两条送出。抽样 6 个曲风（bebop / ambient / death-metal / salsa / chicago-house / trap-rap）在**线上 v1.16.18** 上的实测结果：六个曲风**完全相同** —— kick 0.90/0、snare 0.85/0、hihat 0.70/−0.20、percussion 0.65/+0.25、bass 0.90/0、chords 0.75/0、lead 0.80/+0.10、fx 0.60/0，且**两条送出全部 0.00**（混响/延迟总线在界面上可见地是死的）。即用户所说「默认值不是按曲风编排的」在**用户可见层**成立，而非仅数据层。工具 `scripts/measure_genre_mix_ui.mjs`（含逐项断言：跨曲风混音不得相同、kick/bass 声相必须为 0、snare 居中、ambient 和弦高于底鼓、salsa 打击乐不弱于军鼓），修后可对同一命令复跑对比。 |
| P-03（集成方线上验收，证据留档） | ✅ | 1.16.19 线上实测 | **两条独立探针在部署后的 v1.16.19 上验收通过**。① **用户可见混音**（`scripts/measure_genre_mix_ui.mjs`，从真实 DOM 读通道）：抽样 6 曲风得到 **6 种互不相同的混音**（修前是 1 种重复 6 次），且送出全部复活（修前两条送出全 0.00）——bebop 低音 0.98/送出 0.08–0.10、ambient 和弦 0.92 且 sendA 0.38、death-metal 和弦 −0.50/主音 +0.50、salsa 打击乐 1.00 且声相 −0.42、trap-rap 底鼓 0.98/低音 0.99/踩镲 −0.42；断言 kick/bass 声相为 0、snare 居中、ambient 和弦高于底鼓、salsa 打击乐不弱于军鼓全过。② **实时响度**（`scripts/measure_live_loudness.mjs --all`，159/159 全部出声）：RMS 视角的 p90−p10 由 **5.30 dB 收到 2.13 dB**、极差由 **15.03 dB 收到 7.92 dB**；**68 个曲风被抬升、52 个被压低、39 个基本不动**——方向完全正确（最静 ambient +4.6 dB，最响 breakcore −4.0 dB）。离线 LUFS 主口径为 p90−p10 4.69 → **0.51 LU**、全距 9.96 → **1.25 LU**。③ **曲风比对 A/B**（同一条探针的 --compare）：同类配对 chicago-house vs punk-rock 由修前 **1.1 dB** 收到 **0.1 dB**；但把 trim 区间的两端拉出来比（ambient +5.53 vs breakcore −4.43）时 RMS 视角仍有 **7.4 dB** 差距——**这是度量属性而非未修复项**：两者 LUFS 已被配到同一目标（离线全量残差 1.25 LU），而 RMS 会把 ambient 音符间的静音平均进去，故稀疏曲风在 RMS 口径上必然偏低。按 RMS 强行拉平会让 ambient 的单音头响过 breakcore，正是先前明确否决的做法。 实时 RMS 残差（2.13 dB）大于离线 LUFS（0.51 LU）属预期并与已登记项一致：RMS 会把音符间静音平均进去、离线渲染不含送出总线与主 FX 机架、限幅器实时行为不同（N-16）。 |
| N-13（用户需求 6，本轮审查发现） | ✅ | 1.16.19 | **逐曲风混音与响度配平已落地**。新增 `src/data/genreMix.ts` 作为唯一来源：6 个 category profile + 156/159 逐曲风 override（含 `sendA`/`sendB`，整库送出 0–0.38；kick 与 bass 全库保持单声道中心；1272 条解析值里有 278 个不同的 volume/pan 组合）。合并 `feat/genre-instrument-curation` 后全量离线实测（BS.1770-4 门控积分响度，`scripts/measure_genre_loudness.mjs`，报告 `scripts/loudness.baseline.json`）：旧占位混音 p90−p10 **4.55 dB** / 全距 9.23；已编排混音 **4.69** / 9.96；回填 `loudnessTrimDb` 后 **0.51** / **1.25 dB**。target 取全库中位数 −15.797 LUFS，clamp [−9,+6] 命中 **0/159**（极值 ambient +5.53、breakcore −4.43；改用 RMS 视角则需 +10.6 dB，会让稀疏曲风音头过响，故以 LUFS 为准）。trim 是 masterGain 之后的独立母带级（FX 机架与 limiter 之前），同时作用于实时播放、各试听路径、比对视图（solo 一侧时按该曲风自身 trim 重算）与离线导出。旧会话快照里的占位混音按轨迁移（用户动过的通道优先、含 send）；IndexedDB 工程与 `.groove` 包故意不迁移。门禁：红线 R9a/R9b + `scripts/check_loudness_spread.mjs`（接 slow 轨，除阈值还校验报告↔表 159 条一致与「表全 0 而报告非 0」的假接线特征）。细节与取舍见 `MIX_LOUDNESS_NOTES.md`。 |
| N-14（用户需求 6 的邻接项，待决策） | ⏳ | — | **母带 FX 机架也没有曲风默认值**：`DEFAULT_FX_STATE`（`src/audio/EffectsRack.ts:28-43`）是全库唯一的一套，且四个效果（滤波/饱和/合唱/降比特）**全部默认关闭**，159 个曲风没有任何一个声明过 FX 机架（`src/data/genres/*.ts` 中 0 处）。因此「混音按曲风特色」在母带效果这一层同样不存在——但它与 N-13 性质不同：这些效果默认是关的，不存在「默认音色是错的」，只是缺少逐曲风的创作性默认值（例如 dub 应有长延迟、ambient 应有长混响、metal 应有饱和）。**这是一项功能新增而非缺陷修复，需要产品决策**，故本轮不擅自实施：N-13 的混音表已覆盖逐轨音量/声相/送出（混响与延迟送出是「混音」层面的曲风特色），母带 FX 预设留待确认后再做。 |
| N-15（本轮审查发现，既有缺陷，待决策） | ⏳ | — | **母带「限幅器」不是砖墙限幅器，多曲风渲染出超 0 dBFS 的采样峰值**：`MASTER_LIMITER_SETTINGS`（`src/audio/voiceRegistry.ts:82-88`）是 `DynamicsCompressorNode`，threshold −1 dB / ratio 20:1 / **attack 3 ms** —— 3 ms 起攻意味着底鼓、军鼓的瞬态在增益衰减介入前就已通过，无法保证天花板。在响度工作流的全量离线报告里逐曲风实测（`scripts/loudness.baseline.json`，159 曲风，重复渲染离散度 **0.000 dB**）：**原样 104/159** 峰值超 0 dBFS（最差 chiptune +1.31）、换上按曲风编排的混音后 **116/159**（+1.78）、套用响度微调后 **121/159**（最差 riddim +1.63）——即 trim 对超限曲风的影响是**双向**的——正补偿的稀疏曲风变差、负补偿的密集曲风变好，净增 17 个曲风，属本轮的已知副作用（工作流已在 `MIX_LOUDNESS_NOTES.md` §5.4 记录）。`WavExporter` 在写 16-bit PCM 时做 `Math.max(-1, Math.min(1, s))` 硬削波（`WavExporter.ts:91,100`），故导出母带里这些瞬态被削平。真修需要前瞻式砖墙限幅（lookahead / AudioWorklet）或给母带加真实天花板，属会改变所有曲风听感的功能改动，**需产品决策**，本轮不动。 |
| N-16（N-13 后续，本轮发现） | ⏳ | — | **离线导出与实时链路仍有两处不一致**：① `renderPatternOffline` 不含送出总线（混响/延迟只在实时引擎里），因此响度 trim 是按**干信号**匹配的——送出值刻意保守（≤0.38），实时听感残余会略大于报告里的 0.51 dB；② 离线渲染不含主 FX 机架（`DEFAULT_FX_STATE` 默认四项全 bypass，故默认状态一致；用户一旦开启主 FX，导出不含，且 trim 的绝对电平比实时默认推子高约 0.5 dB，因为离线基线用 masterGain 0.85）。另：比对视图 `drums_only` 仍用可听集合均值，只留鼓组时响度平衡与整套配器本就不同，残余属预期，不另建第二张 trim 表。真正修法是让离线渲染器复用实时的送出/FX 图，属会改变导出听感的改动，需产品决策，本轮不动。 |

### 本轮新发现的遗留问题（需后续处理）

| 问题 | 实测 | 说明 |
|---|---|---|
| ~~移动端 CLS 偏高~~ | **已修复（v1.16.9）**：0.191 → **0.000** | 逐条 `layout-shift` 记录定位到**页脚**：懒加载视图挂载前文档恰好一屏高、页脚 top=683px 可见；挂载后文档 2607px、页脚 top=2446px，被推走 1763px。修复方式是把三处加载占位的最小高度提到 `100dvh`，使页脚在位移前后都不可见（CLS 只统计至少一帧可见的元素）。 |
| E-10 Lighthouse CI | ◐ 替代方案已落地 | 本机 npm 只读且离线，无法安装 lighthouse。已改造成 CI 与慢轨中的**真实浏览器性能门禁**（`npm run perf:check`）：临时端口 + Playwright 加载构建产物，硬断言首屏曲风分包 ≤1，并打印 FCP/LCP/CLS。结构性断言确定性可复现；Lighthouse 的完整审计仍未接入。 |
| ~~N-06 内容深化~~ | **已交付（1.16.10/1.16.11）** | 见上表：同源对比教学 + 外链可校验门禁。 |
| A-07 剩余 | **已补齐** | `100vh → dvh` 已落地（`GalaxyView.tsx`，`h-[calc(100dvh-64px)]`）。 |
| ~~U-11 剩余~~ | **已完成（1.16.12）** | 硬编码文案型内联三元已降到 97 处（目标 <100）；剩余 72 处为数据字段选择。**度量教训**：行级 `grep -c 'isZh ?'` 会漏掉跨行三元与一行两处，比 AST 口径少 20–30%，首轮审计的 556/259 都是行级数字。 |

### 关键指标（实测，截至 v1.16.19）

| 指标 | 审查基线 | 现在 |
|---|---|---|
| 首屏 JS gzip | 336 KB | 164 KB |
| 首屏总传输（线上实测） | 339 KB | 248.7 KB |
| 其中 CSS | 113.6 KB | 23.2 KB |
| 移动端 LCP（4G + 4×CPU） | 2700 ms | 3028 ms（单次测量噪声较大，多次落在 1.9–3.0s） |
| 移动端 CLS | 0.191 | **0.000** |
| 测试用例 | 324 | 649 |
| 红线 | 14 | 22 |
| CI 覆盖面 | 从未运行 | main + next，含 e2e/覆盖率/文档自检 |

## 10. 附：本次审查的原始实测证据

```
$ npm run typecheck            → 0 error
$ npm run lint                 → exit 0（--quiet）
$ npx eslint 'src/**/*.{ts,tsx}' → ✖ 179 problems (0 errors, 179 warnings)
                                 171 @typescript-eslint/no-unused-vars + 8 prefer-const
$ npm run test                 → Test Files 41 passed | Tests 324 passed | 49.52s
$ npx vitest run --coverage    → Test Files 2 failed | 39 passed
                                 × ProjectHubModal > lists saved projects and filters by search query
                                 × CustomGenreMakerView > modifies genre name and marks as unsaved until saved
                                 EXIT=1（覆盖率报告未产出）
$ npm run build                → ✓ built in 1m 5s
$ npm run check:budget         → ✅ index.html 1.12KB/10 ✅ vendor-three 124.32/145 ✅ vendor-react 44.71/60
$ node scripts/test_matrix.js  → 7/7 PASS（Chromium 28s / Firefox 50s / WebKit 20s /
                                 iPhone 竖 18s / iPhone 横 16s / iPad 竖 28s / iPad 横 30s）EXIT=0
                                 静态服务端口 = 内核分配 127.0.0.1:41429（无端口冲突）
$ 产物统计                      → genre chunks 14 个 = 810 KB 原始 / 172.0 KB gzip
                                 StudioView 59.8 / index 49.3 / react 44.8 / icons 9.3 / three 127.3（懒）
$ 行数统计                      → src 非测试 129,096 行；测试 5,796 行（4.3%）
$ 模块覆盖统计                  → 54 个模块在 src/test 中零引用
$ i18n 统计                     → 646 keys，0 重复；4 个 key 缺失（drums_only 等）
$ a11y 统计                     → htmlFor 0；aria-label 108；aria-modal 4；focus-trap 0；
                                 prefers-reduced-motion 6；useReducedMotion 消费者 0
$ 本机端口占用                  → 8080 / 3080 / 80 / 22 / 631 已被占用；3000 空闲
$ git rev-list --count main..next → 17（main 停在 v1.14.1）
$ git remote -v                 → 空（无任何远端，CI 无法触发）
$ 覆盖率（成功运行）             → 行 82.3% / 函数 61.1%；views 13.8%、components 24.1%、9 个视图 0%
$ 数据质量扫描                   → parent_genres 空 159/159；模板化 kick 文案 159/159；
                                 relations 300 条 0 断链；159/159 被关系覆盖；index↔data id 双向零差异
$ 仓库卫生                       → git ls-files | grep pyc → scripts/__pycache__/gen_p1.cpython-314.pyc
                                 git check-ignore .wrangler/.env/.dev.vars → 均未忽略
                                 release/ = 39 MB / 22 个条目
```

---

*报告生成于 2026-09-14，基于 `next` @ `390a764`（v1.16.0）。所有结论均可通过上述命令与 `file:line` 复核。*

---

## 勘误（2026-09-14，v1.16.3 期间修订）

- **§4.2 H-11 与 §5.1 的 `React.memo` 计数有误。** 初版用 `grep -rn "memo(" src` 判定为 0，但实际写法是 `memo<Props>(function ...)`，`memo(` 无法匹配 `memo<`。
  实际情况：`StepCell`、`Ruler`、`TrackRow`、`GenreRail`、`InfoDossier`、`Toolbar` **共 6 个组件已使用 `React.memo`**，但它们被 StudioView 每次渲染新建的内联箭头函数与 track 对象击穿，**等效于没有记忆化**——结论（整格重渲染）不变，原因描述已更正为"记忆化被击穿"。
  教训：对"某 API 未被使用"这类否定性结论，grep 模式必须覆盖泛型调用等写法（本例应为 `memo<\|memo(`），否则会得出与事实相反的结论。
