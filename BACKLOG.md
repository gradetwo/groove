# GROOVE LAB 改进任务清单（BACKLOG）

> 配套文档：`CODE_REVIEW_AND_PLAN_v1.16.0.md`（历史审阅与 N-xx 登记）、`PRODUCT_PLAN_v2.1.0.md`（当前规划）
> 当前基线：**v2.9.1**（`package.json` / `public/version.json` 实测；基线 commit `d480684`）
> 优先级：**P0** 正确性/安全 ｜ **P1** 体验/性能/可维护 ｜ **P2** 增强
> 工时单位：人·天（含自测）
> 使用方式：每个任务一条 PR；`ID` 可直接用于 commit message，如 `fix(P0-01): correct Bjorklund euclidean generator`

---

## Phase 0 · 止血（P0 全部 + 部分 P1）

### 音频正确性

- [x] **P0-01** 修复 Euclidean Bjorklund 算法 ｜ 0.5d ｜ `src/audio/Euclidean.ts:23-45`
  验收：`generateEuclidean(8,3) === [1,0,0,1,0,0,1,0]`、`(16,4)`、`(5,2)`、8 个预置节奏全部精确断言；`audio.test.ts` 从"只数 1 的个数"升级为逐元素比较。

- [x] **P0-02** master 总线加入限幅与安全上限 ｜ 0.5d ｜ `src/audio/AudioEngine.ts:100,217`
  验收：`track gain → bus → DynamicsCompressor → master gain → analyser → destination`；`setMasterVolume` 上限收敛为 1.0；OfflineAudioContext 渲染 8 轨齐响，峰值 ≤ 1.0 无削波。

- [x] **P0-03** stop/pause 时 panic（取消已排程 voice） ｜ 1d ｜ `src/audio/AudioEngine.ts:253-263`、`ChordAudioEngine.ts:387-398,462-468`
  验收：建立 voice registry；`stop()` 对所有活跃源做 5ms gain ramp + `source.stop()`；停止后 50ms 内无输出；ChordAudioEngine ballad 预排音符可被取消。

- [x] **P0-04** 音频时钟单一来源 + 移除伪造 API ｜ 0.5d ｜ `AudioEngine.ts:285-290,31-39`、`audioClockWorker.ts:76-126`、`AudioWorkerBridge.ts:59,84`
  验收：删除与 worker 同频的 `setInterval` 与从未调用的 `CALCULATE_TRANSPORT_STEP`；删除 `ToneTransport` 伪造对象；worker 的 tick 时间戳被使用。

- [x] **P0-05** AudioContext 生命周期与 iOS 解锁加固 ｜ 0.5d ｜ `AudioEngine.ts:92-131,751-757`、`ChordAudioEngine.ts:51-57,63,322,412`
  验收：创建包 try/catch；所有 `resume()` `await` + catch；`destroy()` 移除 window unlock 监听、置空引用、`await close()`。

### Studio 正确性

- [x] **P0-06** 修复 App↔Studio 定时器泄漏 ｜ 0.25d ｜ `src/App.tsx:78-86`、`src/views/StudioView.tsx:363-365`
  验收：`onAudioEngineReady` 的返回值被 effect 消费；进出 studio 10 次，`setInterval` 活跃数不增长；不再对已销毁引擎 setState。

- [x] **P0-07** 键盘快捷键修正 ｜ 0.5d ｜ `src/views/StudioView.tsx:562-615` (v1.4.2)
  验收：`Space/V/E` 在 `input/textarea/select/button/[contenteditable]` 聚焦时不拦截；`onKeyDown` 依赖数组收为 `[]`（回调 ref 化），编辑步进时不再 remove/add 监听。

- [x] **P0-08** 撤销/重做覆盖与快照语义 ｜ 1d ｜ `StudioView.tsx:299-333,689,919,1006,1353,1381,1398,1422` (v1.2.0)
  验收：抽 `commitPattern(mutator,{snapshot})` 单一入口；力度绘制、P-Lock、Euclidean、轨音量、polymeter、M/S、拍号/精度/步长全部入栈；快照包含 `bpm/swing/meter/resolution/mutes/solos`；撤销后引擎 `trackStates` 同步。

- [x] **P0-09** Polymeter 播放头对齐 ｜ 0.25d ｜ `StudioView.tsx:2519`、`VelocityLane.tsx:237`
  验收：高亮公式改为 `currentStep % (trackLength ?? stepCount) === stepIdx`；L:5/L:7 轨道灯板与听感一致。

- [x] **P0-10** 拍号与步数计算修正 ｜ 0.5d ｜ `StudioView.tsx:1083-1110,1454-1471` (v1.3.5)
  验收：删除 `:1095` 死分支；`stepsPerBar = groupSize × (16 / denominator)`；3/8 在 1/16 下 = 6 步/小节；5/4、7/8 下 `smartFill` 的 backbeat 落点正确。

- [x] **P0-11** 小节跳转 select 独立状态 ｜ 0.25d ｜ `StudioView.tsx:1990-1991` (v1.3.7)
  验收：播放中不再被 `currentStep` 覆盖；暂停时显示当前小节而非恒为 Bar 1。

- [x] **P0-12** 计时器与卸载清理 ｜ 0.5d ｜ `StudioView.tsx:283-286,1277,1338,630-640`, `VelocityLane.tsx` (v1.3.7)
  验收：`showToast` 保存并清理旧 timer；`longPressTimerRef` 卸载时 clear；`setTimeout(...,60)` 全部可取消。

- [x] **P0-13** 触摸双触发去重 ｜ 0.5d ｜ `StudioView.tsx:2529-2532`、`VelocityLane.tsx:247-249`
  验收：cell 与力度条只保留 Pointer Events；触摸一次只写一次值、只触发一次触感。

- [x] **P0-14** 死代码清理 ｜ 0.5d ｜ `StudioView.tsx:1-34`、`components/Breadcrumbs.tsx`、`GalaxyView.tsx` `searchQuery`、`SoundBankManager.ts:82-110`、`ChordProgressionsView.tsx:799,816` (v1.4.2)
  验收：删除 14 个未使用 lucide 导入、恒 null 的 `Breadcrumbs`、死 state、无调用者的采样合成、伪造的 `ToneTransport`；`duration || 4` 改为 `?? 4`。

### 全局正确性

- [x] **P0-15** i18n 缺失 key 补全 + `t()` 开发期警告 ｜ 0.5d ｜ `StudioView.tsx:1022,1641-1806,2131`、`i18n/LanguageContext.tsx:184-188`
  验收：`era/place/range/keyLabel/time/dna/harm/tips/refs/compare/export` 全部补齐；`t()` 未命中时 `console.warn`（仅 dev）；界面无字面量 key 渲染。

- [x] **P0-16** `parseBpmRange()` 抽离并修复解析 ｜ 0.5d ｜ `GlobalSearch.tsx:69,175`、`CompareView.tsx:203-206`、新增 `src/utils/bpm.ts`
  验收：支持 en-dash `–`/连字符/单值/非数值特例（ambient、free-jazz、progressive-rock、math-rock、grime）；BPM 数字搜索恢复；`120–128 BPM` 正确渲染；相似度 BPM 判定恢复；≥8 条单测。

- [x] **P0-17** 分享链接白名单与上限校验 ｜ 0.5d ｜ `src/audio/SequencerUrlShare.ts:82-135` (v1.3.8)
  验收：tracks ≤16、steps 长度 ∈{16,24,32}、bpm 20–300、swing 0–100、step ∈0..3、totalSteps ≤64；恶意 payload（超长 `t`、`stLen=1e9`、`step=-5`）全部被拒；`catch` 不再返回空字符串导致 `?groove=` 空链接。

- [x] **P0-18** ErrorBoundary 全站接入 ｜ 0.5d ｜ 新增 `src/components/ErrorBoundary.tsx`、`src/main.tsx`、`src/App.tsx` (v1.4.2)
  验收：App 级 + 每个 lazy 视图级边界；人为抛错显示可恢复错误页（重试 + 返回工作台）；GalaxyView WebGL 不可用时降级到时间线/工作台引导视图。

- [x] **P0-19** ChallengeView 引擎泄漏与难度双触发 ｜ 0.5d ｜ `ChallengeView.tsx:104-131,165-168` (v1.3.2)
  验收：难度切换 10 次后仅存在 1 个 AudioContext；旧引擎必 destroy。

- [x] **P0-20** ChallengeView 泄题修复 ｜ 0.5d ｜ `ChallengeView.tsx:270-274,332-333` (v1.3.2)
  验收：默认隐藏 TEMPO CLUE 与选项的 category/BPM，答后解锁；盲听有效性恢复。

- [x] **P0-21** ChallengeView 手势启动播放 ｜ 0.5d ｜ `ChallengeView.tsx:118,124-127` (v1.3.2)
  验收：iOS Safari 首题有声；未手势前不调用 `play()`；`isPlaying` 与实际一致。

- [x] **P0-22** 和弦 → 工作台交接实现 ｜ 1d ｜ `App.tsx:137-139`、`ChordProgressionsView.tsx:50,54,205-231`、`StudioView.tsx:177-191`
  验收：`pendingChords` 状态提升；StudioView 接收 `initialChords` 并写入 chord 轨；类型由 `string[]` 改为 `ChordDefinition[]`；从和弦页点击"载入工作台"后能在 Studio 听到该走向。

- [x] **P0-23** Cmd/Ctrl+K 全局搜索快捷键 ｜ 0.25d ｜ `GlobalSearch.tsx:33-46`、`App.tsx` (v1.3.1)
  验收：任意页面按 `⌘/Ctrl+K` 打开搜索，`Esc` 关闭；Header 提示按平台显示 `⌘K` / `Ctrl K`。

- [x] **P0-24** 水平时间线分桶修复 ｜ 0.25d ｜ `HorizontalTimelineView.tsx:408`
  验收：区间按 `[start, end)`；1900–1950 曲风不再重复渲染；补 1950s 列。

- [x] **P0-25** Galaxy 投影/拾取坐标系修正 ｜ 0.5d ｜ `GalaxyView.tsx:329-335,966-975` (v1.1.1)
  验收：`project()` 以 `canvas.getBoundingClientRect()` 为基准；标签与星点像素对齐；滚动后不产生偏移。

- [x] **P0-26** 详情页 BPM 状态与输入校验 ｜ 0.5d ｜ `GenreDetailView.tsx:78,82-98,293-300` (v1.3.1)
  验收：BPM 显示值随 genre 重置并与引擎一致；空输入不提交、不显示空白与 40 不一致；非法输入有行内提示。

- [x] **P0-27** 文档与实现对齐 ｜ 0.25d ｜ `DEPLOY.md`、`prd.md`
  验收：修正"12 项测试"→实际数量；标注 PWA 现状（见 D1 决策后更新）。

- [x] **P0-28** 最小 CI 骨架 ｜ 0.5d ｜ 新增 `.github/workflows/ci.yml`、`package.json` scripts (v1.4.2)
  验收：`typecheck` + `test` 两个必过检查；`lint` 待 Phase 1 接入。

**Phase 0 出口**：P0-01 ~ P0-28 全部完成；`npm test` ≥30 用例；确认无白屏路径。

---

## Phase 1 · 打地基（P1 架构 + 设计系统）

### 设计系统

- [x] **P1-01** Tailwind 设计令牌落地 ｜ 1d ｜ `tailwind.config.js` (v1.5.0)
  验收：色板（bg/panel/line/text/accent/track/cat）、字阶（display/title/body/label/micro）、圆角 3 档、间距、动效时长全部进配置。

- [x] **P1-02** codemod 替换 1,707 处硬编码 hex ｜ 1d ｜ 全 `src/**/*.tsx` (v1.5.0)
  验收：`grep -c '#[0-9a-f]\{6\}' src --include=*.tsx` 降至 <200（仅剩 shader/特殊场景）；CI 加上限门禁。

- [x] **P1-03** 修复不存在的 Tailwind 类名 ｜ 0.25d ｜ `GalaxyView.tsx:1617,1638,1827`、`VerticalTimelineView.tsx:297` (v1.3.4)
  验收：`animate-fade-in`、`animate-slide-up`、`animate-slide-left`、`no-scrollbar`、`scrollbar-none`、`custom-scroll` 要么在 config 中定义、要么替换为已存在的 `.touch-action-none` 等；入场动画真实生效。

- [x] **P1-04** 字体策略落地（决策 D6） ｜ 1d ｜ `index.html`、`index.css`、`tailwind.config.js` (v1.5.0)
  验收：自托管字体子集或明确移除外链；`font-sans` 与实际字体一致；`font-display: swap`。

- [x] **P1-05** `src/ui/` 组件库（第一批） ｜ 2d (v1.5.0)
  验收：`Modal`（role=dialog/aria-modal/焦点陷阱/Esc/焦点归还/遮罩点击）、`Drawer`、`Button`、`IconButton`（强制 aria-label）、`Chip`、`Card`、`EmptyState`、`Toast`（单例）。
  依赖：P1-01。

- [x] **P1-06** 5 处自研遮罩迁移到 `<Modal>` ｜ 1d ｜ `GlobalSearch.tsx:99`、`StudioView.tsx:1818,2706`、`EuclideanModal.tsx:71`、`PitchPickerModal.tsx:77` (v1.5.0)
  验收：行为一致（Esc/焦点/ARIA）；新增组件测试覆盖焦点陷阱。

- [x] **P1-07** `src/ui/` 第二批：`Slider`（44px 热区 + 键盘步进）、`Select`、`Tooltip`、`Skeleton`、`ErrorState`、`GenreCard`、`RadarChart`（role=img + 数据表） ｜ 2d (v1.6.0)

### 路由与深链

- [x] **P1-08** 路由方案落地（决策 D3） ｜ 1.5d ｜ 新增 `src/app/router.tsx` (v1.6.0)
  验收：`/studio?genre=`、`/genre/:id`、`/compare?ids=`、`/challenge?difficulty=`、`/explore/galaxy?genre=`、`/explore/timeline?decade=&category=`、`/chords?progression=&key=`、`/s/:payload`；首屏解析 URL；导航写入 URL。

### 导航与信息架构

- [x] **P1-09** 导航 IA 重组 ｜ 0.5d ｜ `Header.tsx:85-93` (v1.4.5)
  验收：`工作台 / 和弦 / 探索▾ / 对比 / 挑战`；移动端菜单同步；`aria-expanded`。

### i18n

- [x] **P1-10** i18n 类型安全重构 ｜ 1d ｜ `src/i18n/` (v1.5.0)
  验收：`MessageKey = keyof typeof zh`；`t(key: MessageKey, vars?)`；消息按 feature 分文件；缺失 key 编译期报错。

- [x] **P1-11** 迁移 321 处内联语言三元 ｜ 2d ｜ 全 `src/**/*.tsx` (v1.7.0)
  验收：`grep -rc 'language === "zh"' src` 仅剩 `LanguageContext` 内部；518 行硬编码 CJK 迁移为 `t()`。全站 17 个文件彻底清零。

- [x] **P1-12** 首帧语言与语言持久化修正 ｜ 0.5d ｜ `LanguageContext.tsx:147-163`、`main.tsx`、`index.html` (v1.3.6)
  验收：渲染前同步解析语言，消除英文用户首帧闪中文；检测结果回写 `localStorage`；`index.html` title/manifest 随语言。

### 数据层

- [x] **P1-13** 轻量索引层 + 按需加载 ｜ 1.5d ｜ 新增 `src/data/index/` (v1.6.0)
  验收：首屏只加载 `{id,name,category,origin_decade,bpm_range,aliases,radar}`；`ALL_GENRES` 全量语义改异步；`dist/index.html` 的 modulepreload 中不再出现 14 个 `genre-*`；首屏 gzip ≤90KB。

- [x] **P1-14** 运行时 Schema 校验 ｜ 1d ｜ 新增 `src/data/schema.ts` (v1.4.3)
  验收：`validateGenre` 覆盖 id 唯一、`steps∈{0,1,2,3}`、`velocity.length===steps.length`、`default_bpm` 落在 `bpm_range`、`radar∈1..10` 整数、`origin_year≤当前年`、`representative_tracks.length≥5`；`GENRES_MAP` 构建检测重复 id 抛错。

- [x] **P1-15** CI 数据 lint ｜ 0.5d ｜ 新增 `scripts/lint_genres.ts` (v1.4.3)
  验收：把已知 77 条数据问题规则化并可失败；CI 接入。

### 工具链

- [x] **P1-16** ESLint + Prettier + CI 自动化配置 ｜ 0.5d (v1.6.0)
- [x] **P1-17** 测试基建升级：`jsdom` + `@testing-library/react` + `@vitest/coverage-v8` ｜ 0.5d ｜ `vitest.config.ts` (v1.6.0)
  验收：`environment: jsdom`；`npm run test:coverage`；删除无价值的 `sanity.test.ts`。
- [x] **P1-18** 体积预算与 CI 门禁 ｜ 0.5d (v1.5.0)
  验收：首屏 gzip、单 chunk、`vendor-three` 三项预算断言；超出即失败。
- [x] **P1-19** CI 完整门禁 ｜ 0.5d (v1.5.0)
  验收：`typecheck + lint + format + test + coverage + data lint + build + budget` 全绿。

**Phase 1 出口**：首屏 ≤90KB gzip；无内联语言三元；URL 深链可用；CI 全绿。

---

## Phase 2 · 性能与无障碍

### Studio 性能

- [x] **P2-01** Studio 组件拆分 ｜ 2d ｜ `StudioView.tsx` (v1.8.0)
  验收：拆出 `<TrackRow>`、`<StepCell>`、`<Ruler>`、`<Toolbar>`、`<GenreRail>`、`<InfoDossier>`，全部 `React.memo`，props 仅 primitive + 稳定回调。
- [x] **P2-02** 事件委托消除 3,500 闭包/帧 ｜ 1d (v1.8.0)
  验收：容器一个 `pointerdown` + `data-track/data-step` 定位；选中单步时仅该行重渲染（React DevTools Profiler 验证 ≤8 行）。
- [x] **P2-03** 播放头脱离 React 状态 ｜ 1.5d (v1.8.0)
  验收：`currentStep` 不再触发组件树重渲染；播放头由 rAF 直接更新 DOM transform；`trackFlashTimes` 改为 ref + DOM class；删除渲染期 `Date.now()`。
- [x] **P2-04** Studio 状态收敛 ｜ 3d (v1.8.0)
  验收：`useSequencerStore`（reducer）；`mutes/solos` 写回 `track.mute/solo`；`commit()` 为唯一变更出口；删除 36 处 `JSON.parse(JSON.stringify())`；消除 updater 内副作用；StrictMode 下无双引擎。
- [x] **P2-05** 拖拽涂抹 rAF 批量提交 ｜ 0.5d (v1.8.0)
  验收：拖拽期间不逐格 `setPattern`，抬手一次提交 + 一次引擎 patch。

### Galaxy

- [x] **P2-06** 逐帧上传优化 ｜ 1.5d ｜ `GalaxyView.tsx:1149-1165` (v1.9.0)
  验收：用 `updateRanges` 或拆分独立 geometry；每帧上传 ≤64KB（实测 ~8.4KB/帧）。
- [x] **P2-07** 每帧分配与 DOM 查询清理 ｜ 1d ｜ `GalaxyView.tsx` (v1.9.0)
  验收：`project()` 无 `Vector3.clone`；`querySelectorAll` 移出渲染循环；`currentYear` 移出 React state 直接驱动 DOM。
- [x] **P2-08** 拾取入 rAF ｜ 0.5d ｜ `GalaxyView.tsx` (v1.9.0)
  验收：pointermove 不直接跑 174 节点投影；拖拽期跳过拾取；仅节点改变触发状态更新。
- [x] **P2-09** 质量档与移动端 ｜ 1d ｜ `GalaxyView.tsx` (v1.9.0)
  验收：质量档覆盖边密度与 DPR；移动端粒子数 ≤50% 桌面（45%）；dt > 40ms 自动降级 DPR 至 1.0。
- [x] **P2-10** 上下文与暂停容错 ｜ 1d ｜ `GalaxyView.tsx` (v1.9.0)
  验收：`webglcontextlost/restored` 处理；`visibilitychange` 暂停渲染；`ResizeObserver` 按容器尺寸；WebGL 不可用降级完整列表视图。
- [x] **P2-11** 标签渲染优化 ｜ 0.5d ｜ `GalaxyView.tsx` (v1.9.0)
  验收：`.nlab-sub` 的 `transition-all` 改为 `transition-opacity`（消除拖影）；移除子标签 `backdrop-blur`；标签改 `transform: translate3d`。

### 时间线

- [x] **P2-12** 水平时间线虚拟化或 canvas 重写 ｜ 2d ｜ `HorizontalTimelineView.tsx` (v1.10.0)
  验收：首屏 DOM ≤800（实测 793，容器 581）；159 个常驻 tooltip 改单例浮层；`overflow-y-hidden` 不再裁切 tooltip；泳道标题 sticky；列宽按曲风数计算。
- [x] **P2-13** 垂直时间轴优化 ｜ 1d ｜ `VerticalTimelineView.tsx` (v1.10.0)
  验收：`storyGenres` 结果 memo；每卡大模糊层减少；滚动流畅；`scrollToStory` 不依赖全局 id（useRef Map 驱动）。
- [x] **P2-14** 探索视图共享抽取 ｜ 2d ｜ `useGenreAudition.ts`, `useGenreGraph.ts`, `ExploreScaffold.tsx` (v1.10.0)
  验收：`useGenreAudition()`（替换 6 处重复引擎生命周期）、`useGenreGraph()`（统一三套分类法）、`<ExploreScaffold>`（筛选栏 + 空/载/错态）。
  ⚠️ **A-06 复核（v1.16.x）**：`useGenreGraph.ts` 与 `ExploreScaffold.tsx` 已无任何生产引用并被删除（`useGenreGraph` 仅剩测试引用且静态导入整个曲风 barrel）；`useGenreAudition.ts` 仍被时间线视图使用，保留。

### 无障碍

- [x] **P2-15** 交互元素语义化 ｜ 1.5d (v1.11.0)
  验收：删除所有 `div onClick`（Header logo、搜索结果行、和弦块、星系子标签、时间线 chip、曲风卡）→ `<button>`/`<a>`；全部图标按钮有 `aria-label`。
- [x] **P2-16** 模态与焦点管理 ｜ 0.5d (v1.11.0)
  验收：焦点陷阱 + Esc + 焦点归还 + 背景 `aria-hidden`；星系抽屉支持 Esc。
- [x] **P2-17** `aria-live` 状态播报 ｜ 0.5d (v1.11.0)
  验收：曲风切换、播放/停止、答题对错有播报。
- [x] **P2-18** 对比度审计与修复 ｜ 1d (v1.11.0)
  验收：`#5a5e68` 用于正文处替换；所有文本对比度 ≥4.5:1（大字 ≥3:1）；`axe` 0 critical。
- [x] **P2-19** reduced-motion 支持 ｜ 0.5d (v1.11.0)
  验收：`@media (prefers-reduced-motion: reduce)` 停止相机漂移/shader 呼吸/自动回放/`animate-pulse-play`；用户可在偏好中覆盖。
- [x] **P2-20** 键盘全流程 ｜ 1.5d (v1.11.0)
  验收：网格 `role="grid"` + 方向键导航；`g`+字母 视图跳转；快捷键面板 `?`；探索视图列表兜底可键盘遍历。

> ⚠️ **E-09 复核修正（基线 v1.16.3）**：本节 `[x]` 仅表示"当轮已实现并自测"，**不等于 WCAG 2.1 AA 达标**。
> 实测结论：**无障碍并未达到 WCAG 2.1 AA**。三个可复现的硬缺口：
> 1. **表单标签未绑定控件**：`grep -rn "htmlFor" src --include=*.tsx | wc -l` → **0**（全仓无 `htmlFor`）。
> 2. **图标按钮缺可访问名**：静态扫描 `<button>` 开标签，无 `aria-label`/`aria-labelledby`/`title` 且元素内无文本 → **32 / 368** 个按钮没有可访问名（审计原文另一口径计 22）。复现命令（项目根执行）：
>    ```bash
>    node -e "const fs=require('fs'),p=require('path');let t=0,n=0;const w=d=>fs.readdirSync(d,{withFileTypes:true}).forEach(e=>{const f=p.join(d,e.name);if(e.isDirectory())return w(f);if(!f.endsWith('.tsx'))return;const s=fs.readFileSync(f,'utf8');let m;const re=/<button\b([^>]*)>/g;while(m=re.exec(s)){t++;if(/aria-label|aria-labelledby|\btitle=/.test(m[1])){n++;continue}const e2=s.indexOf('</button>',re.lastIndex);const b=e2<0?'':s.slice(re.lastIndex,e2);if(b.replace(/\{[^{}]*\}/g,' ').replace(/<[^>]*>/g,' ').trim())n++}});w('src');console.log('total',t,'named',n,'unnamed',t-n)"
>    ```
> 3. **canvas 缺文本替代**：`grep -rn "<canvas" src --include=*.tsx | wc -l` → **9**；这 9 个所在文件中 `role="img"` 命中数为 **0**。
>
> 因此下文"Phase 2 出口：Lighthouse a11y ≥95 / 100% 验收收官"的表述需降级看待；对应 `CODE_REVIEW_AND_PLAN_v1.16.0.md` 的 U-01 / U-04 / U-06 / U-07 仍属未完成项（详见该文档 §5.3）。

### 移动端

- [x] **P2-21** 真实 44px 命中区 ｜ 1d (v1.11.0)
  验收：废弃 `::after` 伪元素方案；cell 与滑条真实尺寸 ≥44px（或提供放大网格模式）；无热区重叠抢点击。
- [x] **P2-22** iOS 视口与安全区 ｜ 0.5d (v1.11.0)
  验收：`viewport-fit=cover` + `env(safe-area-inset-*)`（toast/全屏编辑器/底部工具栏）；`touch-action` 分级。
- [x] **P2-23** 横屏布局 ｜ 1d (v1.11.0)
  验收：Studio 工具栏与全屏编辑器在横屏下不依赖 `overflow-x-auto` 把控件推出视野。

**Phase 2 出口**：首屏 DOM ≤800（实测 793，容器 581）；Studio 播放期无 >50ms 长任务；Galaxy 帧上传 ≤64KB（实测 ~8.4KB）；Phase 2 全量 23 项任务"当轮实现"100% 收官。⚠️ **其中"Lighthouse a11y ≥95 / WCAG 2.1 AA"一项经 E-09 复核不成立**（见上方§无障碍修正），本节不再据此宣称无障碍达标。

---

## Phase 3 · 功能补全

### 音序器

- [x] **P3-01** Gate（步长）全链路 ｜ 2d
  验收：每步 gate 编辑 UI；引擎读 gate 控制发声时长；MIDI 导出与分享链接携带 gate。
- [x] **P3-02** Pattern A/B 与链式 Song Mode ｜ 4d
  验收：`patterns: {A,B}` + 序列编辑（A→B→A→…）；切换/复制 pattern；A/B 盲比模式。
- [x] **P3-03** 力度/概率/Ratchet 画布化 Lane ｜ 3d
  验收：现有 VelocityLane 泛化为可切维度 lane，支持画笔/曲线/缩放；数值可视化与网格联动。
- [x] **P3-04** 自动保存与工程持久化 ｜ 1.5d
  验收：`groove_project_v1` + 版本迁移；刷新后恢复当前工程；提供"清除本地数据"。
- [x] **P3-05** MIDI 导出与听感一致 ｜ 1d
  验收：导出含 swing 偏移、gate、ratchet、probability、trackLength（polymeter）、mute/solo；pitch 语义与引擎统一。
- [x] **P3-06** 分享无损化 ｜ 1d
  验收：payload 携带 ratchet/probability/gate/trackLength；位打包压缩长度；往返测试属性化。
- [x] **P3-07** 节拍器 / 预备拍 / Tap Tempo / 循环区间 ｜ 1.5d
  验收：四项均可开关；预备拍不录音只计数；循环区间可在 ruler 上拖拽。
- [x] **P3-08** Track 拖拽排序 / 乐器选择 / 每轨 Swing ｜ 2d
  验收：拖拽重排轨道；每轨可选音色；每轨 swing 偏移独立。

### 音频

- [x] **P3-09** per-track gain/pan 总线 ｜ 1.5d
  验收：引入 `StereoPannerNode`（`pan` 不再是死状态）；每轨 gain 节点；混音结果与 UI 一致。
- [x] **P3-10** send bus（Reverb / Delay） ｜ 1.5d
  验收：`sendA/sendB` 两条发送总线；每轨发送量可调；ConvolverNode 脉冲合成。
- [x] **P3-11** 音频测试真实化 ｜ 1d
  验收：`OfflineAudioContext` 渲染快照 + 8 轨齐响不削波回归 + swing 时序断言。

### 视图

- [x] **P3-12** Compare 真·同步播放 ｜ 3d ｜ `CompareView.tsx:139-152`
  验收：每列独立引擎 + 共享 transport 时钟；支持 A/B 同步播放与逐列 solo/静音；PRD 5.7.2.3 达标。
- [x] **P3-13** Compare 相似度矩阵 + 字段补全 ｜ 1.5d ｜ `CompareView.tsx:189-217,493-498`
  验收：全列两两相似度 + 整体一致性；补齐结构/配器/代表艺术家；算法口径在 UI 标注。
- [x] **P3-14** 详情页字段补齐 ｜ 1.5d ｜ `GenreDetailView.tsx`
  验收：渲染 `instrumentation / chord_inversions / sound_design / rhythm_features / structure / representative_artists / drum_pattern.swing / drum_pattern.tempo`。
- [x] **P3-15** 详情页关系区 + 关系图 ｜ 1.5d ｜ `GenreDetailView.tsx:614-684`
  验收：由 `GENRE_RELATIONS` 反查父/子/相关（决策 D2 选 A）；小型关系图可点击跳转。
- [x] **P3-16** 详情页内嵌迷你音序器 ｜ 1d
  验收：只读播放该曲风鼓组/贝斯/和弦 pattern；"在完整音序器中打开"跳转并携带曲风。
- [x] **P3-17** Challenge 难度分层与成绩持久化 ｜ 1.5d
  验收：三难度池真正分层（medium ≠ hard）；anti-repeat（最近 N 题排除）；`localStorage` 存分数/连胜/正确率；排位阈值按难度归一。
- [x] **P3-18** GlobalSearch 增强 ｜ 1d
  验收：结果 >15 条提示"还有 N 条"；最近搜索；结果行可键盘操作；"在星图中定位"「加入对比」动作。
- [x] **P3-19** 和弦页交互修复 ｜ 1d
  验收：`selectedChordIdx` 无竞态；`duration ?? 4`；音阶提示随 `keyRoot`；琴键/琴弦按传入 midi 发音；钢琴标题与实际音域一致；和弦块可键盘操作。
- [x] **P3-20** Explore 列表/筛选视图（兜底 + 无障碍入口 + 聚类） ｜ 2d
  验收：可作为 WebGL 与大 DOM 的降级视图；支持年代/地域/大类/子曲风数筛选；键盘可达。

**Phase 3 出口**：PRD 第 5 章功能矩阵全绿；导出/分享/播放三者一致；Phase 3 全量 20 项任务 100% 验收收官（v1.12.0）。

---

## Phase 4 · 差异化进阶

- [x] **P4-01** 离线渲染 WAV 导出 ｜ 2d (v1.13.0)
  验收：`OfflineAudioContext` 渲染当前 pattern 为 WAV 下载；与实时听感一致。
- [x] **P4-02** 分轨 stem 导出 ｜ 2d (v1.13.0)
  验收：逐轨渲染并打包（zip）或逐轨下载；命名规范含曲风/轨名/BPM。
- [x] **P4-03** MIDI 导入 ｜ 2d (v1.13.0)
  验收：`.mid` 解析为 pattern；轨道映射与量化选项。
- [x] **P4-04** Web MIDI in + 键盘/Pad 演奏 ｜ 2.5d (v1.13.0)
  验收：外接 MIDI 键盘可实时触发当前轨音色；电脑键盘演奏模式；设备热插拔。
- [x] **P4-05** 延迟校准与听力保护 ｜ 1d (v1.13.0)
  验收：测量 `outputLatency` 并提供补偿；最大音量保护 + 渐入；设置持久化。
- [x] **P4-06** Inspire Me 受控变异 ｜ 3d (v1.13.0)
  验收：按曲风特征对 seed pattern 做受控随机（保留 kick 骨架，变奏 hat/perc）；一键生成并 A/B 试听。
- [x] **P4-07** 真 PWA（决策 D1A） ｜ 2.5d (v1.13.0)
  验收：版本化 SW + `skipWaiting` + 更新提示；App Shell Cache First；核心数据 Stale While Revalidate；断网可用；可安装；修正图标为 PNG 192/512 + maskable。
- [x] **P4-08** 数据生成管线治理 ｜ 2d (v1.13.0)
  验收：单一入口 `python3 -m scripts.build_all`；修复 `sys.path`；删除空壳 Node 脚本；**废弃 `scripts/update_studio.py`（决策 D7）**；CI 校验生成结果 == 仓库数据。
- [x] **P4-09** 内容质量补强 ｜ 3d (v1.13.0)
  验收：`representative_tracks.link` 升级为可校验链接或明确标注；`sources` 扩展为真实来源（每曲风 ≥2）；关系图谱覆盖 159 个 source（现仅 65）。
  ⚠️ **E-09 复核修正（基线 v1.16.3）**：`scripts/build_all.py:69-73` 的"每曲风 ≥2 来源"检查**至今仍是空实现（`pass`）**，不能作为该验收的证据。真正生效的校验是 E-11b 引入的 `src/data/schema.ts#auditGenreContent` + `src/test/genreContentAudit.test.ts`（`MIN_GENRE_SOURCES = 2`，对全库断言 `insufficientSources.count === 0`），门禁命令 `npm run lint:data`（实测 3 文件 / 24 用例全绿）。
  ⚠️ 该门禁只校验"每曲风 ≥2 条非空来源"，**不校验来源的真实性、权威性或可达性**，因此"真实来源"仍属未验证声明。
- [x] **P4-10** 可观测性 ｜ 1.5d (v1.13.0)
  验收：ErrorBoundary + 全局异常上报（仅堆栈/版本，无用户数据）；版本号注入 + "检查更新"；可选匿名埋点。
- [x] **P4-11** `_headers` 与缓存策略 ｜ 0.5d (v1.13.0)
  验收：hashed 资源 `immutable`；`index.html` 短缓存；`sw.js` 不缓存。

---

## Phase 5 · 硬核音频与 DSP 引擎（Pro Audio & Synthesis Engine）

- [x] **P5-01** AudioWorklet 零抖动时序架构 ｜ 2.5d (v1.14.0)
  验收：自研原生 `AudioWorkletProcessor` 采样计数器 (`public/audioClockWorklet.js` & `AudioWorkletClock.ts`)，主线程重绘或 CPU 密集时走带零抖动，优雅降级至专用定时 Worker。
- [x] **P5-02** 经典硬件鼓机物理建模（808 / 909 / Acoustic / Cyber） ｜ 3d (v1.14.0)
  验收：`DrumKitModels.ts` 纯原生模拟电路建模；TR-808 (桥式 T 型网络与六振荡器铜钹)、TR-909 (冲头打击瞬态与双脉冲拍手)、Vintage Acoustic (天然木质共鸣箱体)、Cyber Wave；工具栏一键切换；离线导出完美对齐。
- [x] **P5-03** 合成器 4 复音与 ADSR 包络引擎 ｜ 2.5d (v1.14.0)
  验收：`PolySynth.ts` 4 复音并发合成、双振荡器自由混合、音分微失谐、4 阶 ADSR 振幅包络与动态谐振低通滤波扫频；无爆音切音。
- [x] **P5-04** 母带级专业 DSP 效果机架（Effects Rack） ｜ 3d (v1.14.0)
  验收：`EffectsRack.ts` 谐振滤波器 (FLT)、Tanh 磁带饱和温暖感 (DRIVE)、多级正交调制立体声合唱 (CHORUS)、阶梯量化数字降比特 (LO-FI)；工具栏抽屉实时开关，输出受控于 Master Limiter。
- [x] **P5-05** 实时录音与自适应量化（Live Sequencer Recording） ｜ 2d (v1.14.0)
  验收：`LiveRecorder.ts` 接入音序器全局调度；一键开启 `[REC]`，播放中打击垫或键盘弹奏实时量化（1/16、1/8、1/32）录入步进矩阵并生成可撤销快照。

---

## 决策待办（阻塞 Phase 1 排期）

- [x] **D1** PWA 恢复还是移除？→ **决策 D1A：恢复真 PWA 规范（v1.13.0 完成）**
- [x] **D2** 三个恒空关联字段：反查回填 or 删除？→ **决策 D2A：通过 GENRE_RELATIONS 反查双向回填（v1.12.0/v1.13.0 完成）**
- [x] **D3** 路由：`react-router` or 自研？→ **决策 D3B：自研 ~1KB 极轻量客户端深链 Router（v1.6.0 完成）**
- [x] **D4** 状态库：`useReducer`+Context or `zustand`？→ **决策 D4A：原生 useReducer + Context 零外部依赖（v1.8.0 完成）**
- [x] **D5** 数据形态：TS 字面量懒加载 or JSON + 校验？→ **决策 D5A：TS 字面量按需懒加载分包（v1.6.0 完成）**
- [x] **D6** 字体：自托管 or 保留 Google Fonts？→ **决策 D6B：保留 Google Fonts 现代几何无衬线规范（v1.4.0 完成）**
- [x] **D7** `scripts/update_studio.py`：废弃 or 保留？→ **决策 D7A：彻底废弃该脚本，统一至 build_all.py（v1.13.0 完成）**

---

## 进度看板（建议）

| 阶段 | 任务数 | 工时 | 状态 |
|---|---|---|---|
| Phase 0 止血 | 28 | ≈13d | ✅ 100% 已验收 (v1.4.5) |
| Phase 1 打地基 | 19 | ≈17d | ✅ 100% 已验收 (v1.7.0) |
| Phase 2 性能与无障碍 | 23 | ≈24d | ✅ 100% 已验收 (v1.11.0) |
| Phase 3 功能补全 | 20 | ≈33d | ✅ 100% 已验收 (v1.12.0) |
| Phase 4 进阶 | 11 | ≈21d | ✅ 100% 已验收 (v1.13.0) |
| Phase 5 声音引擎重构 | 5 | ≈13d | ✅ 100% 已验收 (v1.14.0) |
| **合计** | **106** | **≈121 人日** | **🎉 全量 106/106 项任务 100% 验收收官，跨端 7 平台自动化矩阵与性能预算门禁 100% 全绿，已线上部署交付** |

> ⚠️ 上表停留在 Phase 0–5（截至 v1.14.0）的口径，未包含 v1.16.x 批次。v1.16.x 的交付明细见下节。

---

## Phase 6 · v1.16.x 实施批次（本轮）

> **基线**：v1.16.3（`package.json` / `public/version.json` 实测，基线 commit `d480684`）。
> **来源**：ID → 任务名映射取自 `CODE_REVIEW_AND_PLAN_v1.16.0.md` §7（S0–S4）；发布版本取自包含该 ID 提交的 release commit（`390a764` v1.16.0 / `87d6bad` v1.16.1 / `206599c` v1.16.2 / `d480684` v1.16.3），由 `git log <prev>..<release>` 提取。
> **说明**：`E-14` / `F-11` 不在 v1.16.0 审阅文档 §7 中，任务名取自对应 commit subject；`A-06` 与 `E-09` 在本分支（`docs/baseline-refresh`）完成，尚未随版本发布。

| 任务 ID | 任务名称 | 发布版本 | 验证命令 |
|---|---|---|---|
| **P8-01** | Web 触觉震颤力反馈（Vibration API + 全局开关） | v1.16.0 | `npx vitest run src/test/haptics.test.ts` |
| **F-01** | 音频零值钳制 + 调度器异常隔离 | v1.16.1 | `npx vitest run src/test/audio.test.ts` |
| **F-02** | 停顿后追赶风暴重同步 | v1.16.1 | `npx vitest run src/test/audioScheduler.test.ts` |
| **F-03** | WAV 导出接入混音器并对齐实时行为 | v1.16.1 | `npx vitest run src/test/wavMixerParity.test.ts` |
| **F-04** | 撤销/重做语义重建 | v1.16.1 | `npx vitest run src/test/sequencerHistory.test.tsx` |
| **F-05** | 手势批量提交（力度 / swing / BPM） | v1.16.1 | `npx vitest run src/test/sequencerHistory.test.tsx` |
| **F-06** | 工程切换单一真相源 + legacy 键同步 | v1.16.1 | `npx vitest run src/test/projectStorage.test.ts` |
| **F-07** | IndexedDB 事务语义与降级提示 | v1.16.1 | `npx vitest run src/test/projectDb.test.ts` |
| **F-08** | 分享/导入载荷运行时校验 + 大小上限 | v1.16.1 | `npx vitest run src/test/sharePayloadSecurity.test.ts` |
| **F-09** | 分享编码/解码上限对齐 | v1.16.1 | `npx vitest run src/test/sharePayloadSecurity.test.ts` |
| **F-10** | 单声道 WAV 修复 + 导出参数钳制 | v1.16.1 | `npx vitest run src/test/wavExport.test.ts` |
| **F-11** | 恢复拍号分子参与小节步数计算 | v1.16.1 | `npx vitest run src/test/sequencerMeter.test.ts` |
| **U-03** | 补齐 4 个缺失 i18n key + 词条守卫测试 | v1.16.1 | `npx vitest run src/test/i18nKeys.test.ts` |
| **U-08** | Compare 载入/空/错三态 + 试听防重入 | v1.16.1 | `git log --oneline --grep=U-08` |
| **U-09** | 弹窗打开时禁用全局快捷键并尊重 defaultPrevented | v1.16.1 | `npx vitest run src/test/shortcuts.test.ts` |
| **U-10** | `window.confirm` → 自研 ConfirmDialog | v1.16.1 | `grep -rn "window.confirm(" src`（应为 0 命中） |
| **E-01** | 消除 ProjectHubModal / CustomGenreMaker 用例抖动 | v1.16.1 / v1.16.2 收尾 | `npx vitest run src/test/ProjectHubModal.test.tsx src/test/CustomGenreMakerView.test.tsx` |
| **E-02** | 用真实实现替换自造 helper 与空断言 | v1.16.1 | `npx vitest run src/test/audio.test.ts src/test/sequencerMeter.test.ts` |
| **E-05** | 版本单一来源（消除 3 处漂移与 SW 静默接管） | v1.16.1 | `npm run version:check` |
| **E-06** | 开发/测试端口隔离（PORT / VITE_PORT） | v1.16.1 | `grep -c VITE_PORT vite.config.ts`（应为 2） |
| **E-11** | Genre schema 全字段校验 + 内容审计门禁 | v1.16.1 | `npm run lint:data` |
| **E-13** | 测试基建补全（jest-dom + 自动 cleanup） | v1.16.1 | `grep -c setupFiles vitest.config.ts`（应为 1） |
| **E-14** | 体积门禁纳入首屏总量 + 曲风分包红线 | v1.16.2 | `node scripts/redlines.mjs` |
| **A-01** | 打断曲风数据静态导入（首屏 JS -51%） | v1.16.2 | `git log --oneline --grep=A-01` |
| **A-08** | `version.json` 拆分 + 变更日志按需加载 | v1.16.2 | `node scripts/redlines.mjs`（R7a/R7b/R7c） |
| **U-11** | i18n 债务：迁移内联双语三元至词表 | v1.16.2 | `node scripts/analyze_ternaries.js` |
| **E-04** | CI 加固（覆盖 next + e2e + 覆盖率门槛） | v1.16.2 | `grep -c next .github/workflows/ci.yml`（应为 2） |
| **E-08** | 可观测性落地（移除无出口埋点 API） | v1.16.2 | `npx vitest run src/test/telemetry.test.ts` |
| **E-12** | 仓库卫生（.gitignore / 清理本地产物） | v1.16.2 | `git ls-files '*.pyc'`（应为空） |
| **N-07** | SEO / 社交分享卡片与元数据 | v1.16.2 | `grep -c "og:" index.html`（应为 9） |
| **E-03** | fake-AudioContext 夹具 + 音频调度单测 | v1.16.3 | `npx vitest run src/test/audioScheduler.test.ts` |
| **A-04** | 撤销历史按字节预算裁剪 | v1.16.3 | `npx vitest run src/test/sequencerHistory.test.tsx` |
| **A-07** | 播放队列有界 + 画布缓冲复用 | v1.16.3 | `git log --oneline --grep=A-07` |
| **A-06** | 删除零引用设计系统组件与失效 hook | 本分支未发布（`f6b6ed0`） | `npx vitest run src/test/ui.test.ts` |
| **E-09** | 文档基线刷新与自检脚本 | 本分支未发布（本轮） | `node scripts/check_docs.mjs` |
| **P7-05** | 走带绝对同步与卡顿根除（IPC 震动移除 + 布局重排缓存） | v2.0.45 | `npm run test` |
| **P1-19** | 桌面端虚拟键盘 100% 全宽与人机工学双八度设计 | v2.0.45 | `npx vitest run src/test/musicalTyping.test.tsx` |
| **P8-04** | 移动端防选中与触控锁（全域 CSS 触控保护与交互隔离） | v2.0.45 | `npm run test` |
| **P1-20** | 移动端工作区净化与四组功能胶囊单行流线优化 | v2.0.45 | `npx vitest run src/test/mobileBottomControlBar.test.tsx` |
| **U-12** | 全界面 49 项功能按键与图标深度图解词典与实操要领 | v2.0.45 | `npx vitest run src/test/helpCenterModal.test.tsx` |

> 本批次的已知回归：`src/test/CompareViewPresets.test.tsx` 的 2 条用例计时超时（5000ms），在 v1.16.3 基线上即为红色（见 E-03 之后并入的 compare 用例）；`npx vitest run` 当前为 **407 passed / 2 failed（共 409）**。
