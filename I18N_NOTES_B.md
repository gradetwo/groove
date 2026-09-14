# I18N_NOTES_B — 内联双语三元组迁移（i18n-b 分支）

范围：`refactor/i18n-b` 分支上的 7 个文件（本 agent 负责的一半）。
基线 commit：`8f1319c`（chore(release): v1.16.11）。

## 1. 结论摘要

| 指标 | 数值 |
|---|---|
| 迁移的硬编码双语三元组 | **98 处**（审计表口径为 86，见 §5） |
| 新增词典键 | **93 个** |
| 复用既有且逐字节相同的键 | **5 个** |
| 刻意保留的数据驱动三元组 | **19 处** |
| 迁移后 7 文件残留的 `isZh ?` 条件表达式 | **19 处，全部为数据字段选择** |
| 逐字节一致性校验 | 98/98 通过（zh 与 en 两分支均通过） |
| 无法做到逐字节一致的字符串 | **0 个** |

方法：所有 zh/en 文案均由 TypeScript AST 从改动前的 `git show <base>:<file>`
中**程序化提取**（`scratch/i18nb/analyze.cjs` / `migrate.cjs`），从未手工重打；
迁移后用独立校验器（`scratch/i18nb/verify.cjs`）按源码顺序 1:1 对齐
「原三元组 ↔ 新 `t()` 调用」，逐一断言词典条目与原分支逐字节相等，并用新调用
文本回写基线源码后与磁盘文件比对，证明除替换本身外没有任何其它改动。

## 2. 提交清单

| SHA | 主题 |
|---|---|
| `9569109` | refactor(i18n): PolyrhythmCollider 内联双语文案迁移到 t() |
| `4dad571` | refactor(i18n): MasterAnalyzerSuite 内联双语文案迁移到 t() |
| `a18f0f9` | refactor(i18n): DillaMicrotiming 内联双语文案迁移到 t() |
| `3061fe5` | refactor(i18n): AnalyzerView 内联双语文案迁移到 t() |
| `7258fd1` | refactor(i18n): MasterclassView 内联双语文案迁移到 t() |
| `28391bd` | refactor(i18n): DownbeatOmissionLab 内联双语文案迁移到 t() |
| `10e89ee` | refactor(i18n): BalkanOddMeters 内联双语文案迁移到 t() |

每个提交只含「该组件源文件 + 对应词典文件」，failing-fast 门禁见 §6。

## 3. 逐文件 before / after

`isZh ?` 计数给出两个口径：`grep -c` 行数（审计表所用口径）与 AST 条件表达式
个数（真实数量，一行可含多个、也可跨行书写）。第三列是迁移后残留数。

| 文件 | before `grep -c` | before AST 表达式 | after AST（保留） | 迁移 | 新增键 | 复用键 |
|---|---|---|---|---|---|---|
| `src/components/masterclass/PolyrhythmCollider.tsx` | 16 | 18 | 0 | 18 | 18 | 0 |
| `src/components/analyzer/MasterAnalyzerSuite.tsx` | 14 | 16 | 0 | 16 | 14 | 2 |
| `src/components/masterclass/DillaMicrotiming.tsx` | 13 | 14 | 0 | 14 | 13 | 1 |
| `src/views/AnalyzerView.tsx` | 15 | 20 | 3 | 17 | 16 | 1 |
| `src/views/MasterclassView.tsx` | 20 | 21 | 9 | 12 | 11 | 1 |
| `src/components/masterclass/DownbeatOmissionLab.tsx` | 13 | 13 | 3 | 10 | 10 | 0 |
| `src/components/masterclass/BalkanOddMeters.tsx` | 14 | 15 | 4 | 11 | 11 | 0 |
| **合计** | **105** | **117** | **19** | **98** | **93** | **5** |

迁移后残留的 19 处即 §4 的数据驱动三元组；`grep -c` 残留数与上表 after 列一致
（AnalyzerView 3、MasterclassView 9、DownbeatOmissionLab 3、BalkanOddMeters 4，
其余 4 个文件均为 0）。

## 4. 刻意保留的内联项及原因

### 4.1 数据驱动三元组（19 处，规则 3 要求保留）

这些三元组的两个分支是**对象字段**而非字面量文案，属于"按语言选字段"，
必须原样保留：

`src/views/AnalyzerView.tsx`（3）
- L309 `isZh ? sig.labelZh : sig.labelEn`
- L313 `isZh ? sig.descZh : sig.descEn`
- L322 `isZh ? sig.expectedZh : sig.expectedEn`
  理由：`TEST_SIGNALS: TestSignalConfig[]` 数据表的字段选择。

`src/views/MasterclassView.tsx`（9）
- L79 / L152 / L173 `…title.zh : …title.en`
- L155 / L170 `…tag.zh : …tag.en`
- L176 `lesson.subtitle.zh : lesson.subtitle.en`
- L256 `lesson.originPlace.zh : lesson.originPlace.en`
- L260 `lesson.culturalContext.zh : lesson.culturalContext.en`
- L277 `lesson.acousticPrinciple.zh : lesson.acousticPrinciple.en`
  理由：`MASTERCLASSES` 课程内容对象的本地化字段选择。

`src/components/masterclass/DownbeatOmissionLab.tsx`（3）
- L176 `p.nameZh.split(" ")[0] : p.nameEn`
- L226 `preset.nameZh : preset.nameEn`
- L232 `preset.explanationZh : preset.explanationEn`
  理由：`DOWNBEAT_PRESETS` 预设数据字段选择；L176 还带有 `.split(" ")[0]`
  变换，不适合抽成词典键。

`src/components/masterclass/BalkanOddMeters.tsx`（4）
- L185 `m.nameZh.split(" ")[1] : m.nameEn.split(" ")[1]`
- L235 `meter.nameZh : meter.nameEn`
- L241 `meter.danceDescriptionZh : meter.danceDescriptionEn`
- L265 `meter.mnemonicZh : meter.mnemonicEn`
  理由：`BALKAN_METERS` 节拍数据字段选择。

### 4.2 非三元组的其它内联文案（超出本次审计口径，未改动）

审计口径只覆盖 `isZh ? … : …`。以下硬编码/单语字符串**不是三元组**，
按"纯字符串抽取、不改变渲染文本"的约束未做改动，仅记录以便后续排期：

- `MasterAnalyzerSuite.tsx`：L142 `title={`Theme: ${th}`}`、L144–150 主题短名
  `Gold` / `Neon` / `Heat` / `CRT`、L181 `PEAK`、L63 `P6-05 · 60 FPS`。
- `AnalyzerView.tsx`：L208 `Phase 6 · P6-05`、L345/L361 公式代码块（单语学术
  记号）、L377–379 相关系数阈值说明（当前**恒为中文**，英文模式下也显示中文）、
  L393 `{b.nameEn}`、L394 `{b.rangeZh}`（`FREQUENCY_BANDS` 字段，其中
  `rangeZh` 未按语言切换）、`TEST_SIGNALS` 的 `badge` 字段（恒为中文）。
- `DillaMicrotiming.tsx`：L293–295 `50% 直拍` / `62% BoomBap` / `75% 三连音`
  （恒为中文）。
- `DownbeatOmissionLab.tsx`：L276 `Beat {bIdx + 1}`、L228 `{preset.origin}`。
- `BalkanOddMeters.tsx`：L269 `{meter.subdivisions.join(" + ")}`、L237
  `{meter.region}`、L277 `{meter.timeSignature}`。
- `PolyrhythmCollider.tsx`：L188–191 预设标签 `4:3 (Spinach)` 等（单语专名）。
- `MasterclassView.tsx`：L145 `0{item.index}`、L148/L272 `BPM`、L169 `·`、
  L250 `{lesson.originEra}`。

> 注：L377–379 与 `rangeZh` / `badge` 属于"恒中文"的真实 i18n 缺陷（英文模式
> 下仍显示中文）。把它们改成双语会**改变英文模式的渲染文本**，违反本次
> 「不改变渲染文本」的硬约束，故留待后续单独迁移。

## 5. 审计口径差异：86 → 98（重要）

任务给的表中，本半区合计 **86** 处"literal-copy ternaries"，但 AST 实际为
**98** 处。差额 12 处全部是**行级正则审计漏检**的项，本次已一并迁移：

| 文件 | 审计 | 实际 | 差额来源 |
|---|---|---|---|
| PolyrhythmCollider | 16 | 18 | 1 处跨行三元组（L482 `isZh` 换行后才是 `?`）+ 1 处同行第二个三元组（L509） |
| MasterAnalyzerSuite | 14 | 16 | 2 处同行第二个三元组（L167、L189） |
| DillaMicrotiming | 13 | 14 | 1 处跨行三元组（L210） |
| AnalyzerView | 12 | 17 | 5 处跨行三元组（L221、L340、L356、L372、L399） |
| MasterclassView | 11 | 12 | 1 处跨行三元组（L122） |
| DownbeatOmissionLab | 10 | 10 | — |
| BalkanOddMeters | 10 | 11 | 1 处同行第二个三元组（L306） |

两类漏检原因：
1. **跨行写法**：`{isZh\n  ? "中文…"\n  : "English…"}` —— `grep 'isZh ?'` 与
   行级正则会漏掉（共 9 处）。
2. **一行多个三元组**：如
   `{isFrozen ? (isZh ? A : B) : (isZh ? C : D)}` —— 行级正则只记 1 个（共 3 处）。

因此本半区的**真实迁移量是 98，而不是 86**。若其它分支/agent 也按行级正则
统计，建议同样用 AST 复核，避免遗漏。

## 6. 新增 / 复用的词典键

词典落位（规则 5）：masterclass 相关 → `src/i18n/locales/masterclasses.ts`；
analyzer 相关 → `src/i18n/locales/analyzer.ts`。每个组件一个
`// ---…---` 分区注释。

### 6.1 复用（5 个，均验证逐字节相同）

| 键 | zh / en | 位置 | 复用理由 |
|---|---|---|---|
| `masterclass_dilla_kick_shift` | 底鼓抢拍 / 拖后偏移 · Kick Micro-Shift | DillaMicrotiming L236 | 键名与该组件底鼓滑块语义完全一致，此前未被引用 |
| `masterclass_hero_title` | 世界节奏沉浸工作坊 · World Rhythm Masterclasses | MasterclassView L110 | 同域 hero 徽标，此前未被引用 |
| `analyzer_title` | 全景声谱分析仪与李萨如图示波器 · Panoramic Spectrogram & Lissajous Phase Scope | AnalyzerView L218 | 该页 h1，此前未被引用 |
| `analyzer_frozen` | 定格中 · Frozen | MasterAnalyzerSuite L167 | 冻结态按钮，此前未被引用 |
| `analyzer_freeze` | 定格 · Freeze | MasterAnalyzerSuite L167 | 冻结按钮，此前未被引用 |

对 `"停止" / "Stop"`（出现在 4 个组件）**没有**复用
`timeline_stop_preview`：该键被 `HorizontalTimelineView` / `VerticalTimelineView`
实际使用，跨模块复用会让时间轴文案的后续修改意外影响 masterclass 组件，
故按组件分区新建 `poly_stop` / `dilla_stop` / `downbeat_stop` / `balkan_stop`。

### 6.2 新增（93 个）

`masterclasses.ts` — 分区 `PolyrhythmCollider.tsx`（18）
`poly_ratios_label`, `poly_stop`, `poly_start`, `poly_voice_a`, `poly_voice_b`,
`poly_tap_title`, `poly_streak`, `poly_tap_desc`, `poly_tap_btn`,
`poly_tap_ready`, `poly_tap_disabled`, `poly_rating`, `poly_rating_perfect`,
`poly_rating_great`, `poly_rating_good`, `poly_rating_miss`,
`poly_delta_offset`, `poly_best_streak`

`masterclasses.ts` — 分区 `DillaMicrotiming.tsx`（13）
`dilla_presets_label`, `dilla_stop`, `dilla_play`, `dilla_engine_title`,
`dilla_engine_desc`, `dilla_tap_btn`, `dilla_kick_minus50`,
`dilla_kick_plus50`, `dilla_snare_title`, `dilla_snare_plus50`,
`dilla_swing_label`, `dilla_visualizer_title`, `dilla_visualizer_legend`

`masterclasses.ts` — 分区 `MasterclassView.tsx`（11）
`masterclass_page_title`, `masterclass_page_desc`, `masterclass_lesson_index`,
`masterclass_bake_btn`, `masterclass_cultural_title`,
`masterclass_origins_label`, `masterclass_acoustic_title`,
`masterclass_tap_stats_title`, `masterclass_tap_stats_total`,
`masterclass_tap_stats_perfect`, `masterclass_tap_stats_streak`

`masterclasses.ts` — 分区 `DownbeatOmissionLab.tsx`（10）
`downbeat_mode_label`, `downbeat_stop`, `downbeat_play`, `downbeat_tap_btn`,
`downbeat_curve_title`, `downbeat_curve_subtitle`, `downbeat_omitted_rest`,
`downbeat_one_drop`, `downbeat_propulsion`, `downbeat_track`

`masterclasses.ts` — 分区 `BalkanOddMeters.tsx`（11）
`balkan_meter_label`, `balkan_stop`, `balkan_play`, `balkan_tap_btn`,
`balkan_mnemonic_label`, `balkan_blocks_title`, `balkan_long`, `balkan_short`,
`balkan_davul`, `balkan_lift`, `balkan_step`

`analyzer.ts` — 分区 `MasterAnalyzerSuite.tsx`（14）
`analyzer_suite_badge`, `analyzer_suite_split_title`, `analyzer_suite_split`,
`analyzer_suite_spectrogram_title`, `analyzer_suite_spectrogram`,
`analyzer_suite_lissajous_title`, `analyzer_suite_lissajous`,
`analyzer_suite_oscilloscope_title`, `analyzer_suite_oscilloscope`,
`analyzer_suite_freeze_title`, `analyzer_suite_peak_title`,
`analyzer_suite_restore`, `analyzer_suite_maximize`,
`analyzer_suite_close_title`

`analyzer.ts` — 分区 `AnalyzerView.tsx`（16）
`analyzer_badge_workstation`, `analyzer_monitoring_studio`,
`analyzer_page_desc`, `analyzer_open_studio_monitor`,
`analyzer_signal_gen_heading`, `analyzer_signal_gen_hint`,
`analyzer_stop_signal`, `analyzer_observation_label`,
`analyzer_card_fft_title`, `analyzer_card_fft_desc`,
`analyzer_card_lissajous_title`, `analyzer_card_lissajous_desc`,
`analyzer_card_phase_title`, `analyzer_card_phase_desc`,
`analyzer_card_bands_title`, `analyzer_card_bands_desc`

后缀约定：`title=` 属性使用 `_title`（如 `analyzer_suite_split_title`、
`analyzer_suite_freeze_title`、`analyzer_suite_peak_title`、
`analyzer_suite_close_title`、`dilla_engine_title`、`analyzer_card_*_title`）；
本次 7 个文件中**没有** `aria-label=` 属性，故未新增 `_aria` 键。

### 6.3 插值迁移（2 处）

| 原文 | 迁移后 | 词典 |
|---|---|---|
| `` isZh ? `声部 A (${ratioA} 拍)` : `Voice A (${ratioA})` `` | `t("poly_voice_a", { ratioA })` | `"声部 A ({ratioA} 拍)"` / `"Voice A ({ratioA})"` |
| `` isZh ? `声部 B (${ratioB} 拍)` : `Voice B (${ratioB})` `` | `t("poly_voice_b", { ratioB })` | `"声部 B ({ratioB} 拍)"` / `"Voice B ({ratioB})"` |
| `` isZh ? `课程 0${lesson.index}` : `Lesson 0${lesson.index}` `` | `t("masterclass_lesson_index", { index: lesson.index })` | `"课程 0{index}"` / `"Lesson 0{index}"` |

`lesson.index` 不是合法标识符，故占位符名取 `index`，实参写作
`{ index: lesson.index }`；`formatMessage` 的 `String()` 转换保证与模板字符串
输出一致。

## 7. 硬约束遵守情况

- 改动文件仅限：7 个目标源文件 + `src/i18n/locales/masterclasses.ts` +
  `src/i18n/locales/analyzer.ts` + 本文件（`I18N_NOTES_B.md`）。
- 未改动任何 className、ARIA 属性、canvas/SVG 绘制常量、WebGL/着色器源码、
  时序与音频节点逻辑、组件 props 或状态机。
- 未削弱或删除任何测试；`src/test/i18nKeys.test.ts` 原样保留。
- 未触碰主检出目录、`.worktrees/i18n-a`、`next` 分支；未 push / merge / deploy；
  未运行 `npm run slow` / `test:e2e` / `deploy`。
- 迁移辅助脚本放在 worktree 内已被 `.gitignore` 忽略的 `scratch/`，
  不进入版本库。

## 8. 验证记录

每个文件提交前均执行：

- `npx tsc --noEmit` → exit 0（7/7 次）。
- `npx eslint --quiet <源文件> <词典文件>` → exit 0（7/7 次）。
- `npx vitest run src/test/i18nKeys.test.ts src/test/i18n.test.ts \
  src/test/Masterclass.test.tsx src/test/AnalyzerView.test.tsx --reporter=dot`
  → 4 文件 / 17 例全绿（7/7 次），其中
  `i18nKeys.test.ts > resolves every literal t("...") usage found under src/`
  确认全部 93 个新键均可解析。
- 独立校验器（§1 方法）→ 98/98 站点通过，19 处数据三元组确认保留。

最终提交前：

- `npx vitest run --reporter=dot`（全量）→ 见下节记录。
- `node scripts/track.mjs fast` → 见下节记录。
- 全词典重复键检查：1033 个条目、1033 个唯一键、0 重复键。

### 全量结果

```
npx vitest run --reporter=dot
→  Test Files  60 passed (60)
    Tests  471 passed (471)
    Duration  50.47s
    FULL_SUITE_EXIT=0
```

60 文件 / 471 例全绿，高于基线（58+ 文件 / 460+ 例）；其中与本次相关的
`i18nKeys.test.ts`、`i18n.test.ts`、`Masterclass.test.tsx`、
`MasterAnalyzer.test.tsx`、`AnalyzerView.test.tsx` 均通过。

### track.mjs fast 结果

```
node scripts/track.mjs fast
→  changed: 1 file(s), 0 source file(s)
    ✅ TypeScript typecheck (17.2s)
    ⏭  ESLint skipped (no lintable changes)
    ⏭  Unit tests skipped (no source changes)
    ✅ Red-line checks — All 18 red lines hold.
    🎉 FAST TRACK PASSED   (TRACK_FAST_EXIT=0)
```

该次调用只看到未提交的 `I18N_NOTES_B.md`，故按脚本设计跳过了 lint 与单测。
为让门禁真正覆盖本次源码改动，另按基线 ref 重跑：

```
node scripts/track.mjs fast --base 8f1319ca0d72becf7454a5f77f97b0252af73ca5
→  changed: 10 file(s), 9 source file(s)
    ✅ TypeScript typecheck (18.7s)
    ✅ ESLint (changed files) (2.4s)
    ✅ Affected unit tests — 14 files / 71 tests passed (17.2s)
    ✅ Red-line checks — All 18 red lines hold.
    🎉 FAST TRACK PASSED   (TRACK_FAST_BASE_EXIT=0)
```

两次均为 exit 0。
