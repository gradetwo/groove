# I18N 迁移笔记 — i18n-a 工作树（ExploreListView / CustomGenreMakerView / ChordProgressionsView / GalaxyView / ChallengeCertificateModal / TrackRow）

分支：`refactor/i18n-a`　基线 commit：`8f1319ca0d72becf7454a5f77f97b0252af73ca5`

本文件记录本轮把六个文件里的**内联双语 `isZh ? ... : ...` 文案**迁移到 `t("...")` 字典的结果、
方法、逐文件前后计数、新增 key，以及所有**有意保留原地**的内容与原因。

---

## 1. 结论速览

| 文件 | 迁移前 `grep -c 'isZh ?'` | 迁移后 | 实际迁移的硬编码文案三元 | 字典文件 | 新增 key |
|---|---|---|---|---|---|
| `src/views/ExploreListView.tsx` | 23 | **1** | 23 | `src/i18n/locales/explore.ts` | 23 |
| `src/views/CustomGenreMakerView.tsx` | 17 | **3** | 16 | `src/i18n/locales/maker.ts` | 16 |
| `src/views/ChordProgressionsView.tsx` | 20 | **7** | 15 | `src/i18n/locales/chords.ts` | 15 |
| `src/views/GalaxyView.tsx` | 14 | **14** | **0** | `src/i18n/locales/explore.ts` | 0 |
| `src/components/ChallengeCertificateModal.tsx` | 12 | **2** | 12 | `src/i18n/locales/common.ts` | 12 |
| `src/components/sequencer/TrackRow.tsx` | 15 | **1** | 15 | `src/i18n/locales/studio.ts` | 19 |

- 合计迁移硬编码文案三元 **81 处**，新增字典 key **85 个**（TrackRow 的 title/aria 成对建 key，故 key 数多于三元数）。
- 剩余 `isZh ?` 全部是**数据字段/键名选择**，按规则 3 保留。
- **没有无法做到逐字节一致的字符串**：85 个字典条目全部与变更前分支字符串逐字节相同。

### ⚠️ 与任务表格的偏差（重要）

任务表格给出 GalaxyView「14 处 literal-copy 三元」，但用 TypeScript AST 逐节点分类后：

- GalaxyView 共 **15 个 `isZh ? ... : ...`**（`grep -c 'isZh ?'` 只数到 14 行，因为有 1 处三元跨行：L2137），
- 其中 **15/15 全部是数据字段选择**（`isZh ? x.name : x.en` 形态），**硬编码字面量分支为 0**。
- 旧审计很可能把 `isZh ? c.name : c.en` 这类字段选择误判为 copy。按规则 3，这些必须**原样保留**。
- GalaxyView 内唯一的 CJK 字面量是 GLSL 着色器源码（L52、L195 的 shader 字符串），按规则 4 严禁触碰。

因此 GalaxyView **没有产生提交**，也没有新增 key。

另外，任务表格合计 86 处，与本次基于 AST 的 81 处不同，差异来自审计启发式：

- ExploreListView L206 一行内有两个 `isZh` 三元（fallback / catalog 徽标）——按行统计会少算 1；
- CustomGenreMakerView L864 一行内有两个 `isZh` 三元（"分叉自" / "独立原创"）——同理；
- CustomGenreMakerView L630 `[isZh ? "zh" : "en"]: val` 两分支都是字符串字面量，会被审计误判为 copy，
  但它其实是**计算属性键（locale tag）**，按规则 3 必须保留，因此未迁移（这就是该文件 AST 判定 copy=17、实际迁移 16 的原因）；
- ChordProgressionsView L338 的分支模板含不同表达式，审计可能排除。

---

## 2. 迁移方法（可复现）

为保证逐字节一致，所有 en/zh 文案**不是手抄的**，而是程序化提取：

1. 用 `git show <base>:<file>` 把六个变更前文件快照到 gitignore 的 `scratch/orig/`。
2. 用 TypeScript 编译器 API 解析快照，遍历 AST 找出所有 `condition` 为 `isZh` 的 `ConditionalExpression`，
   按「分支是否为字符串/模板字面量（含嵌套三元）」分类为 copy 或 data。
3. 以**行号 + 同一行内出现序号**定位每个目标三元，用 AST 节点的 `getStart()/getEnd()` 精确替换：
   - 简单字符串：`t("key")`，字典值直接取 `whenTrue.text` / `whenFalse.text`；
   - 模板插值：把每个 `${expr}` 位置映射为 `{var}`，生成 `t("key", { var: expr })`，字典两侧占位符一致；
   - 嵌套三元（TrackRow 静音/独奏的 title+aria）：收敛为 `test ? t("keyA") : t("keyB")`，彻底去掉 isZh；
   - 混合形态（ChordProgressions 烘焙标签后缀、Certificate 分享战报）：只抽取文案骨架，
     语言相关的**数据取值**继续用 `isZh ? ... : ...` 作为插值入参。
4. 生成字典分区并追加到对应 locale 文件末尾。
5. 独立复核：
   - 结构复核：重新从快照 AST 推导期望值，与生成的字典逐字节比较（85/85 通过）；
   - 运行期复核：对 7 个插值条目用哨兵值重建原模板，与 `formatMessage(字典值, 哨兵)` 比较（全部一致）；
   - 冲突扫描：与 HEAD 的全部 940 个字典 key 比对，确保无同文件重复、无跨文件静默覆盖。

> 过程中曾出现 `chords_arp_up/down/up_down/converge/random` 与既有 key 重名（tsc TS1117），
> 已把新增短标签改名为 `chords_arp_short_*` 后消除。既有 key 的 zh 带英文后缀（如 `上行 Up ↗`），
> 与本次控件短标签（`上行`）文案不同，不能复用。

---

## 3. 新增 key 清单

### `src/i18n/locales/explore.ts` — `// Explore List View (filter deck & results)`（23）

```
explore_list_group_all, explore_list_fallback_badge, explore_list_catalog_badge,
explore_list_filters_title, explore_list_reset, explore_list_search_placeholder,
explore_list_all_categories, explore_list_all_decades, explore_list_all_nodes,
explore_list_min_subgenres, explore_list_min_high_derivative, explore_list_min_major_root,
explore_list_group_by, explore_list_group_flat, explore_list_sort_by,
explore_list_sort_year_asc, explore_list_sort_year_desc, explore_list_sort_name_asc,
explore_list_sort_subgenres, explore_list_empty_title, explore_list_empty_hint,
explore_list_empty_reset, explore_list_branches
```

### `src/i18n/locales/studio.ts` — `// Sequencer Track Row (lane header controls)`（19）

```
track_audition_title, track_polymeter_title,
track_unmute_title, track_mute_title, track_unmute_aria, track_mute_aria,
track_unsolo_title, track_solo_title, track_unsolo_aria, track_solo_aria,
track_move_up, track_move_up_aria, track_move_down, track_move_down_aria,
track_edit_drawer, track_shift_left, track_shift_right, track_smart_fill, track_clear
```

`title=` 用 `_title`，`aria-label=` 用 `_aria`；`track_polymeter_title` 含 `{steps}` 占位符。

### `src/i18n/locales/chords.ts` — `// Chord Progressions View — Arp / Strum Controls`（15）

```
chords_arp_label,
chords_arp_short_up, chords_arp_short_down, chords_arp_short_up_down,
chords_arp_short_converge, chords_arp_short_random,
chords_gate_stacc, chords_gate_nat, chords_gate_leg,
chords_strum_micro, chords_strum_dir_down, chords_strum_dir_up, chords_strum_dir_alt,
chords_strum_fast, chords_strum_slow
```

`chords_arp_label` 含 `{pattern}` 占位符。

### `src/i18n/locales/maker.ts` — `// Custom Genre Maker View (toasts, labels & previews)`（16）

```
maker_save_failed, maker_fork_success, maker_default_name, maker_blank_created,
maker_duplicate_success, maker_deleted, maker_copy_failed, maker_poster_started,
maker_import_success, maker_unsaved, maker_fork_action, maker_sec_pattern_desc,
maker_forked_from, maker_original, maker_poster_preview, maker_author
```

占位符：`maker_fork_success {name}`、`maker_default_name {n}`、`maker_duplicate_success {name}`、`maker_import_success {name}`。

### `src/i18n/locales/common.ts` — `// Challenge Certificate Modal (shared global modal)`（12）

```
cert_share_text, cert_close_aria, cert_title, cert_subtitle, cert_current_tier,
cert_accuracy, cert_best_streak, cert_answered, cert_issued, cert_copied,
cert_copy, cert_close
```

`cert_share_text` 占位符：`{tier} {elo} {accuracy} {streak} {mastered}`（zh/en 占位符集合一致，
但两侧句子结构与单位词——`局` / `种`——不同，属各自字典字符串的一部分）。
`cert_issued` 的 zh/en 均保留尾随空格（`评定日期: ` / `Issued: `），与原始拼接完全一致。

---

## 4. 有意保留原地（未迁移）的内容

### 4.1 数据字段/键名选择（规则 3，共 29 个 `isZh` 三元节点；`grep -c` 计 28 行，GalaxyView L2137 跨行）

| 文件:行（迁移后） | 形态 | 原因 |
|---|---|---|
| `ExploreListView.tsx:320` | `isZh ? r.labelZh : r.labelEn` | `REGION_TAGS` 数据表字段选择 |
| `CustomGenreMakerView.tsx:624` | `isZh ? (cultural_context?.zh \|\| "") : (...?.en \|\| "")` | 对象字段选择 |
| `CustomGenreMakerView.tsx:630` | `[isZh ? "zh" : "en"]: val` | 计算属性键（locale tag），非 UI 文案 |
| `CustomGenreMakerView.tsx:631` | `isZh ? { en: ... } : { zh: ... }` | 对象字段选择 |
| `ChordProgressionsView.tsx:338` | `pattern: isZh ? patternNameZh[...] : pattern.toUpperCase()` | 插值**入参**按语言取数据；文案骨架已抽为 `chords_arp_label` |
| `ChordProgressionsView.tsx:1005/1141/1172/1203` | `CHORD_QUALITY_META[q].nameZh/nameEn` | 和弦质量数据表字段 |
| `ChordProgressionsView.tsx:1359` | `cat.nameZh/nameEn` | 分类数据表字段 |
| `ChordProgressionsView.tsx:1392` | `prog.name.zh/en` | 走向数据对象字段 |
| `ChallengeCertificateModal.tsx:52` | `tier: isZh ? tier.nameZh : tier.nameEn` | 分享战报插值入参的数据字段 |
| `ChallengeCertificateModal.tsx:122` | `isZh ? tier.nameZh : tier.nameEn` | 段位数据字段 |
| `TrackRow.tsx:125` | `isZh ? meta.sub.zh : meta.sub.en` | `TrackMetaConfig.sub` 字段选择 |
| `GalaxyView.tsx`（15 处） | `isZh ? x.name : x.en` 等 | 星云/流派数据字段；L2137 为跨行三元 |

### 4.2 非三元形态的硬编码双语/单语字面量（不在本轮 `isZh ?` 三元范围内）

这些是**单个字面量同时含中英文**或纯英文的字符串，迁移会改变渲染文本（违反「不得改变渲染文本」），
或属于数据表，故保留：

| 位置 | 内容 | 原因 |
|---|---|---|
| `ExploreListView.tsx:282-287` | `<option>Electronic (电子舞曲)</option>` 等 6 条 | 单一字面量含双语；拆分会让英文界面文案变化 |
| `ExploreListView.tsx:41-49` | `REGION_TAGS` 的 `labelZh/labelEn` | 数据表（已由 4.1 的字段选择消费） |
| `ExploreListView.tsx:249` | `title="Reset all filters"` | 纯英文（非双语三元），超出本轮范围 |
| `CustomGenreMakerView.tsx:69-78` | `TRACK_THEMES[].label = "Kick (底鼓)"` 等 8 条 | 数据表，单一字面量含双语；拆分改变英文界面 |
| `ChordProgressionsView.tsx:331-337` | `patternNameZh` 本地映射 | 供 4.1 数据选择使用的数据 |
| `TrackRow.tsx:108` | `title="Audio Activity Peak"` | 纯英文，非双语 |
| `TrackRow.tsx:183/192/204` | `Volume: …%` / `Vol: …%` / `Pan: …` 动态英文 title | 纯英文动态串，非双语 |
| `ChallengeCertificateModal.tsx:96/113/125` | `Groove Acoustic Board` / `VERIFIED` / `ELO RATING` | 品牌与纯英文技术标签，非双语 |

### 4.3 关于 `t()` 插值的一个理论边界

`formatMessage` 在变量值为 `undefined` 时会保留 `{name}` 字面量，而原模板字面量会输出 `"undefined"`。
本次所有插值入参（`base.name`、`copy.name`、`pendingImportGenre.name`、`tier.nameZh/nameEn`、
`elo`、`accuracy`、`stats.bestStreak`、`masteredCount`、`track.trackLength || stepCount`、
`patternNameZh[arpConfig.pattern]`）在当前类型与调用路径下**均有定义**，因此实际输出逐字节一致；
此边界不影响本轮结果，仅作记录。

---

## 5. 验证证据（全部实测）

| 验证项 | 命令 | 结果 |
|---|---|---|
| 逐文件 typecheck | `npx tsc --noEmit` | 5 次提交后均 `0`（通过） |
| 逐文件 lint | `npx eslint --quiet <改动文件>` | 5 次提交后均 `0`（通过） |
| 逐提交守卫测试 | `npx vitest run src/test/i18nKeys.test.ts src/test/i18n.test.ts --reporter=dot` | 5 次提交后均 `0` |
| 全量测试 | `npx vitest run --reporter=dot` | **60 files / 471 tests 全绿**（基线 58+ 文件 / 460+ 测试） |
| 快速门禁（默认 base=HEAD） | `node scripts/track.mjs fast` | PASSED，18 条红线全过 |
| 快速门禁（覆盖整个改动集） | `node scripts/track.mjs fast --base 8f1319c…` | PASSED：tsc + eslint(10 文件) + affected tests（14 files / 71 tests）+ 红线全过 |
| 字典字节一致 | AST 复核脚本 | 85/85 逐字节一致 |
| 插值运行期等价 | 哨兵值复核脚本 | 7/7 一致 |
| key 冲突扫描 | 与 HEAD 940 key 对比 | 无冲突 |

未运行：`npm run slow`、`npm run test:e2e`、`npm run deploy`（按要求禁止）。

---

## 6. 提交记录

| SHA | 主题 |
|---|---|
| `ee009d5796c76caf065dece680ce72dc2b655080` | refactor(i18n): ExploreListView 内联双语文案迁移至 t() 字典 |
| `ca0ff3d3fd6aff161aba3483d7d5abc31c839140` | refactor(i18n): CustomGenreMakerView 内联双语文案迁移至 t() 字典 |
| `8c85b71dbcdd088267a0848a405e0db4ab4fe73d` | refactor(i18n): ChordProgressionsView 琶音/扫弦控件文案迁移至 t() 字典 |
| `9b06ae86723b8972a1bd6b2b590d9738cdf08408` | refactor(i18n): ChallengeCertificateModal 证书文案迁移至 t() 字典 |
| `a3f52409b192afdb3b9af86f5e45f035a1219083` | refactor(i18n): TrackRow 轨道控件 title/aria 文案迁移至 t() 字典 |
| 本文件即最终提交 | docs(i18n): 新增 I18N_NOTES.md 迁移记录 |

GalaxyView 无改动，无提交。

---

## 7. 改动边界确认

- 只改动允许清单内的文件：六个目标文件中的五个（GalaxyView 无改动）、
  `src/i18n/locales/{explore,maker,chords,studio,common}.ts`、以及本文件。
- 未触碰 `main` 检出、`.worktrees/i18n-b`、`next` 分支；未 push / 未 merge。
- 未改任何 `className`、ARIA 结构、行为逻辑、着色器/GLSL 与几何计算。
- 未削弱或删除任何测试；未运行被禁止的脚本。
- `TrackRow` / `ChallengeCertificateModal` 原先通过 props 接收 `isZh`、没有 `t`，
  本轮新增 `useLanguage()`（其中 `t` 调用位于组件顶部、早退 `return` 之前，满足 Hooks 规则）；
  两者的 `isZh` prop 仍被数据字段选择使用，未删除。
