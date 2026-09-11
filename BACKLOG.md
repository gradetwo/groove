# GROOVE LAB 改进任务清单（BACKLOG）

> 配套文档：`IMPROVEMENT_PLAN.md`
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

### 移动端

- [x] **P2-21** 真实 44px 命中区 ｜ 1d (v1.11.0)
  验收：废弃 `::after` 伪元素方案；cell 与滑条真实尺寸 ≥44px（或提供放大网格模式）；无热区重叠抢点击。
- [x] **P2-22** iOS 视口与安全区 ｜ 0.5d (v1.11.0)
  验收：`viewport-fit=cover` + `env(safe-area-inset-*)`（toast/全屏编辑器/底部工具栏）；`touch-action` 分级。
- [x] **P2-23** 横屏布局 ｜ 1d (v1.11.0)
  验收：Studio 工具栏与全屏编辑器在横屏下不依赖 `overflow-x-auto` 把控件推出视野。

**Phase 2 出口**：首屏 DOM ≤800（实测 793，容器 581）；Studio 播放期无 >50ms 长任务；Galaxy 帧上传 ≤64KB（实测 ~8.4KB）；Lighthouse a11y ≥95；Phase 2 全量 23 项任务 100% 验收收官。

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

- [ ] **P4-01** 离线渲染 WAV 导出 ｜ 2d
  验收：`OfflineAudioContext` 渲染当前 pattern 为 WAV 下载；与实时听感一致。
- [ ] **P4-02** 分轨 stem 导出 ｜ 2d
  验收：逐轨渲染并打包（zip）或逐轨下载；命名规范含曲风/轨名/BPM。
- [ ] **P4-03** MIDI 导入 ｜ 2d
  验收：`.mid` 解析为 pattern；轨道映射与量化选项。
- [ ] **P4-04** Web MIDI in + 键盘/Pad 演奏 ｜ 2.5d
  验收：外接 MIDI 键盘可实时触发当前轨音色；电脑键盘演奏模式；设备热插拔。
- [ ] **P4-05** 延迟校准与听力保护 ｜ 1d
  验收：测量 `outputLatency` 并提供补偿；最大音量保护 + 渐入；设置持久化。
- [ ] **P4-06** Inspire Me 受控变异 ｜ 3d
  验收：按曲风特征对 seed pattern 做受控随机（保留 kick 骨架，变奏 hat/perc）；一键生成并 A/B 试听。
- [ ] **P4-07** 真 PWA（决策 D1A） ｜ 2.5d
  验收：版本化 SW + `skipWaiting` + 更新提示；App Shell Cache First；核心数据 Stale While Revalidate；断网可用；可安装；修正图标为 PNG 192/512 + maskable。
- [ ] **P4-08** 数据生成管线治理 ｜ 2d
  验收：单一入口 `python3 -m scripts.build_all`；修复 `sys.path`；删除空壳 Node 脚本；**废弃 `scripts/update_studio.py`（决策 D7）**；CI 校验生成结果 == 仓库数据。
- [ ] **P4-09** 内容质量补强 ｜ 3d
  验收：`representative_tracks.link` 升级为可校验链接或明确标注；`sources` 扩展为真实来源（每曲风 ≥2）；关系图谱覆盖 159 个 source（现仅 65）。
- [ ] **P4-10** 可观测性 ｜ 1.5d
  验收：ErrorBoundary + 全局异常上报（仅堆栈/版本，无用户数据）；版本号注入 + "检查更新"；可选匿名埋点。
- [ ] **P4-11** `_headers` 与缓存策略 ｜ 0.5d
  验收：hashed 资源 `immutable`；`index.html` 短缓存；`sw.js` 不缓存。

---

## 决策待办（阻塞 Phase 1 排期）

- [ ] **D1** PWA 恢复还是移除？
- [ ] **D2** 三个恒空关联字段：反查回填 or 删除？
- [ ] **D3** 路由：`react-router` or 自研？
- [ ] **D4** 状态库：`useReducer`+Context or `zustand`？
- [ ] **D5** 数据形态：TS 字面量懒加载 or JSON + 校验？
- [ ] **D6** 字体：自托管 or 保留 Google Fonts？
- [ ] **D7** `scripts/update_studio.py`：废弃 or 保留？

---

## 进度看板（建议）

| 阶段 | 任务数 | 工时 | 状态 |
|---|---|---|---|
| Phase 0 止血 | 28 | ≈13d | ✅ 100% 已验收 (v1.4.5) |
| Phase 1 打地基 | 19 | ≈17d | ✅ 100% 已验收 (v1.7.0) |
| Phase 2 性能与无障碍 | 23 | ≈24d | ✅ 100% 已验收 (v1.11.0) |
| Phase 3 功能补全 | 20 | ≈33d | ✅ 100% 已验收 (v1.12.0) |
| Phase 4 进阶 | 11 | ≈21d | 待排期 |
| **合计** | **101** | **≈108 人日** | **已完成 90/101 项任务 (89.1%)，跨端 7 平台自动化矩阵与性能预算门禁 100% 全绿** |
