# I18N 迁移 C 区记录（Kick Dossier + 三个 Sequencer Hook）

分支：`refactor/i18n-c`　基线：`577b438`（merge: 并入 i18n 迁移 B 区）
本轮把 4 个文件里剩余的 51 处硬编码双语三元（`isZh ? "中文" : "English"`）
迁移到 `t("...")`，字典全部落在 `src/i18n/locales/studio.ts`。

## 1. 提交清单

| SHA | subject |
|---|---|
| `e12c59d` | refactor(i18n): KickPhilosophyDossier 内联双语文案迁移到 t() |
| `b079659` | refactor(i18n): useExportActions 导出/分享提示文案迁移到 t() |
| `d6a2dc0` | refactor(i18n): useTransportControls 提示与播报文案迁移到 t() |
| `121af5a` | refactor(i18n): usePatternActions 快捷操作/MIDI 导入提示迁移到 t() |
| （本文件提交） | docs(i18n): 记录 i18n 迁移 C 区清单与逐字节校验结论 (I18N_NOTES_C.md) |

一个文件一个提交，每个提交只动该文件 + `src/i18n/locales/studio.ts`。

## 2. 计数口径（重要）

- **行级**：`grep -c 'isZh ?'`（BRE，逐行统计包含字面量 `isZh ?` 的行数）。
  会漏掉「`isZh` 与 `?` 分行」的写法，也会把「一行两个三元」只算 1。
- **AST**：TypeScript 5.9.3 compiler API，遍历全部 `ConditionalExpression`：
  - `test` 为 `isZh`（或 `!isZh`）标识符，且 `whenTrue`/`whenFalse` **都是**
    字符串字面量 / 无插值模板 / 模板表达式 → 计为**字面量双语三元**；
  - 两分支不是字符串（如 `isZh ? item.zh : item.en`）→ 计为**数据驱动三元**。
  - 扫描 `src/**/*.{ts,tsx}`，排除 `src/test`（与 `i18nKeys` 门禁口径一致）。

行级 23 处 vs AST 51 处，说明这四个文件里绝大多数三元是跨行写的，
行级 `grep` 严重低估——这也是本轮必须用 AST 复核的原因。

## 3. 逐文件 before / after

| 文件 | 行级 before | 行级 after | AST 字面量 before | AST 字面量 after | AST 数据 before | AST 数据 after |
|---|---:|---:|---:|---:|---:|---:|
| `src/components/kick/KickPhilosophyDossier.tsx` | 6 | 0 | 18 | 0 | 0 | 0 |
| `src/features/sequencer/hooks/useExportActions.ts` | 5 | 0 | 15 | 0 | 0 | 0 |
| `src/features/sequencer/hooks/useTransportControls.ts` | 6 | 0 | 10 | 0 | 0 | 0 |
| `src/features/sequencer/hooks/usePatternActions.ts` | 6 | 0 | 8 | 0 | 0 | 0 |
| **合计** | **23** | **0** | **51** | **0** | **0** | **0** |

### 仓库级（`src/`，排除 `src/test`）

| 口径 | before (577b438) | after (121af5a) |
|---|---:|---:|
| 行级 `isZh ?` 行数 | 171 | 148 |
| AST 字面量双语三元 | 148 | 97 |
| AST 数据驱动三元 | 72 | 72 |

任务给出的「约 148 处」与基线 AST 字面量计数 148 完全吻合。
迁移后剩余 97 处分布在 24 个文件（本轮的 4 个文件已归零）。

## 4. 新增键 vs 复用键

- 新增 **51** 个键（全部在 `src/i18n/locales/studio.ts`）；
- 复用 **0** 个——把 51 组 zh/en 与改动前 1118 个既有键逐字节比对，
  没有任何既有键的 `en`/`zh` 同时相等（含标点、空格、emoji、`{占位符}`）。
- 合并字典键数 1118 → 1169，`Object.keys` 无重名；
  `tsc --noEmit` 无 TS1117（同文件重复键），也不存在跨文件 spread 覆盖。

按分区：

| 分区（studio.ts） | 数量 | 键 |
|---|---:|---|
| `// Sequencer Action Toasts` | 15 | `export_midi_done`, `export_als_generating`, `export_als_done`, `export_als_failed`, `export_groove_done`, `export_wav_rendering`, `export_wav_done`, `export_wav_failed`, `export_stems_rendering`, `export_stems_done`, `export_stems_failed`, `export_share_too_large`, `export_share_encode_failed`, `export_share_copied_degraded`, `export_share_copied` |
| `// Sequencer Transport Toasts & Announcements` | 10 | `transport_tap_bpm`, `transport_drums_only_on`, `transport_full_band_on`, `transport_announce_drums_only_on`, `transport_announce_drums_only_off`, `transport_playback_stopped`, `transport_playback_started`, `transport_undo_done`, `transport_redo_done`, `transport_slot_copied` |
| `// Sequencer Pattern Action Toasts` | 8 | `pattern_dup_bar1_done`, `pattern_humanize_done`, `pattern_clear_all_done`, `pattern_reset_done`, `pattern_clear_saved_done`, `pattern_import_done`, `pattern_import_failed`, `pattern_inspire_done` |
| `// Kick Philosophy Dossier` | 18 | `kick_dossier_title`, `kick_dossier_ch0_title`, `kick_dossier_ch0_quote`, `kick_dossier_ch0_body`, `kick_dossier_ch1_title`, `kick_dossier_ch1_sub_body`, `kick_dossier_ch1_thump_body`, `kick_dossier_ch1_click_body`, `kick_dossier_ch2_title`, `kick_dossier_ch2_body_1`, `kick_dossier_ch2_body_2`, `kick_dossier_ch3_title`, `kick_dossier_ch3_quote`, `kick_dossier_ch3_body_1`, `kick_dossier_ch3_body_2`, `kick_dossier_ch4_title`, `kick_dossier_ch4_intro`, `kick_dossier_ch4_tip` |

**重名规避**：既有 `share_copied` / `share_failed` / `undo_done` / `redo_done` /
`restore` / `export_midi` 已占用短名，故导出/分享相关新键统一加 `export_`、
transport 相关加 `transport_`、pattern 相关加 `pattern_`，避免 TS1117 与
spread 覆盖。`kick_*` / `somatic_*` 既有键就在 `studio.ts`，故 Kick 档案也放
`studio.ts`（未使用 `common.ts`）。

**命名约定**：本轮 4 个文件没有 `title=` / `aria-label=` 属性，未新增
`_title` / `_aria` 后缀键；按功能语义命名（`*_done` / `*_failed` / `*_on` /
`*_off` / `*_body` / `*_quote`）。

## 5. 插值迁移（11 处）

| 文件 | 原文 | 迁移后 | 字典 zh / en |
|---|---|---|---|
| useExportActions | `` `已导出 MIDI: ${currentGenre.name}.mid ✓` `` | `t("export_midi_done", { name: currentGenre.name })` | `已导出 MIDI: {name}.mid ✓` / `Exported {name}.mid ✓` |
| useExportActions | `` `已导出 Ableton Live 工程: ${result.filename} ✓ (...)`` | `t("export_als_done", { filename: result.filename })` | `已导出 Ableton Live 工程: {filename} ✓ (...)` / `Exported Ableton Live Set: {filename} ✓ (...)` |
| useExportActions | `` `Ableton 工程导出失败: ${err?.message \|\| err}` `` | `t("export_als_failed", { error: err?.message \|\| err })` | `Ableton 工程导出失败: {error}` / `Ableton export failed: {error}` |
| useExportActions | `` `已导出 .groove 工程包: ${projToExport.name} ✓` `` | `t("export_groove_done", { name: projToExport.name })` | `已导出 .groove 工程包: {name} ✓` / `Exported .groove: {name} ✓` |
| useExportActions | `` `母带 WAV 导出完成: ${result.filename} ✓` `` | `t("export_wav_done", { filename: result.filename })` | `母带 WAV 导出完成: {filename} ✓` / `Exported Master WAV: {filename} ✓` |
| useExportActions | `` `WAV 导出失败: ${err?.message \|\| err}` `` | `t("export_wav_failed", { error: err?.message \|\| err })` | `WAV 导出失败: {error}` / `WAV export failed: {error}` |
| useExportActions | `` `分轨打包导出完成: ${result.filename} ✓` `` | `t("export_stems_done", { filename: result.filename })` | `分轨打包导出完成: {filename} ✓` / `Exported Stems ZIP: {filename} ✓` |
| useExportActions | `` `分轨导出失败: ${err?.message \|\| err}` `` | `t("export_stems_failed", { error: err?.message \|\| err })` | `分轨导出失败: {error}` / `Stems export failed: {error}` |
| useTransportControls | `` `已将 Pattern ${from} 复制至 ${to} ✓` `` | `t("transport_slot_copied", { from, to })` | `已将 Pattern {from} 复制至 {to} ✓` / `Copied Pattern {from} to {to} ✓` |
| usePatternActions | `` `已成功导入 MIDI: 识别到 ${result.notesFound} 个音符 ✓` `` | `t("pattern_import_done", { count: result.notesFound })` | `已成功导入 MIDI: 识别到 {count} 个音符 ✓` / `Imported MIDI: parsed {count} notes ✓` |
| usePatternActions | `` `MIDI 导入失败: ${err?.message \|\| err}` `` | `t("pattern_import_failed", { error: err?.message \|\| err })` | `MIDI 导入失败: {error}` / `MIDI import failed: {error}` |

形态约定：`isZh ? \`…${n}…\` : \`…${n}…\`` → `t("key", { n })`，两语言字典
内均写 `{n}`；实参名取语义名（`name`/`filename`/`error`/`from`/`to`/`count`），
实参表达式保持与原文 `${...}` **逐字相同**（校验脚本逐条断言）。

`useTransportControls` 的 tap tempo 是「模板里嵌三元」：
`` `${isZh ? "测速 BPM" : "Tap BPM"}: ${calculatedBpm}` `` → 只替换双语分支为
`` `${t("transport_tap_bpm")}: ${calculatedBpm}` ``，非双语的 `${calculatedBpm}`
保持原模板，不合并成新键。

### 已知边界（0 个词典条目不可逐字节一致）

8 处 `{error}` 的实参是 `err?.message || err`。`formatMessage` 的语义是
`vars[key] !== undefined ? String(vars[key]) : 保留占位符`，因此当实参恰为
`undefined` 时输出 `{error}` 字面量，而模板字符串会输出 `undefined`。该分支只在
`throw undefined` 的极端路径出现；正常 `Error` / 字符串下输出逐字节一致。
沿用此前批次（`TrackRow` / `ProjectHubModal` 等）的约定，未额外包裹 `String()`，
在此明确记录。**51 个词典条目本身全部逐字节一致，0 个无法一致。**

## 6. 未迁移项与理由

1. **数据驱动三元组：0 处。** 这四个文件在改动前 AST-data 即为 0，不存在
   `isZh ? item.zh : item.en` / 语言标签 / 对象字段选择，无需保留说明。
2. **`isZh` 公共字段保留但不再消费（4 处）**：
   `KickPhilosophyDossierProps.isZh`、`UseExportActionsOptions.isZh`、
   `UseTransportControlsOptions.isZh`、`UsePatternActionsOptions.isZh`。
   原因：调用方 `src/views/KickAnatomyView.tsx` 与 `src/views/StudioView.tsx`
   不在允许改动文件清单内，删字段会造成传参 TS 报错；因此保留接口字段、
   仅从解构中移除。返回形状（`Use*Result`）完全未动。
3. **依赖数组**：原来 6+6+3 = 15 处 `useCallback` 依赖里的 `isZh` 改为 `t`
   （共 15 处）。原因：`t` 的闭包持有当前语言，若既不依赖 `isZh` 也不依赖 `t`，
   语言切换后回调会持有旧 `t`（陈旧闭包）。`t` 随 Provider 重渲染而变，
   加入依赖后与原先「`isZh` 变化即重建」行为一致。
4. **非双语的硬编码文案（不在本任务范围，保留）**：
   - `KickPhilosophyDossier`：`BAHADIRHAN KOÇER · DUB TECHNO: … PHENOMENOLOGY`、
     `ACADEMIC ARCHIVE`、三层标签 `1. Sub (超低频 30–60 Hz) — 躯体与内脏 …` /
     `2. Thump …` / `3. Click …`、`ALGORITHM: PARALLEL 4-OSC …` 与
     `OSC A/B/C`、`MASTER BUS` 说明。它们不是 `isZh ?` 分支，两种语言下渲染
     相同；迁移需要新造翻译、会改变渲染文本，违反纯字符串抽取约束。
   - hooks：`"synth"` 乐器兜底、`"A"/"B"` slot、`"1/8"|"1/16"|"1/32"`、
     `"too-large"`/`"degraded"` 判别码、`_Groove` / `proj_` 文件名模板等
     技术字面量，与语言无关。
5. **局部变量遮蔽说明**：`useTransportControls` 的
   `filter((t) => …)`、`usePatternActions` 的 `forEach((t) => …)` 中局部参数
   `t` 会遮蔽 i18n 的 `t`，但遮蔽仅限这些回调内部；所有 `t("...")` 调用都在
   回调之外，`tsc` / `eslint --quiet` 均通过，渲染与行为不变。

## 7. 硬约束遵守

- 改动文件仅：4 个目标源文件 + `src/i18n/locales/studio.ts` + 本文件。
  `common.ts` 未改动（Kick 键的既有 `kick_*`/`somatic_*` 都在 `studio.ts`）。
- 未改动任何渲染文本、`className`、ARIA 属性、canvas/WebGL 代码或交互行为；
  所有替换都是纯字符串抽取（AST 按节点 span 替换，字典由 `JSON.stringify`
  从原文序列化）。
- 未削弱或删除测试；`src/test/i18nKeys.test.ts` 原样保留。
- 未运行 `npm run slow` / `test:e2e` / `deploy`；未 push / merge / deploy；
  未触碰主检出、其它 worktree 或 `next` 分支。
- 迁移脚本以 heredoc 形式内联执行，未在仓库内落任何临时文件。

## 8. 验证记录

每个文件提交前均执行：

- `npx tsc --noEmit` → exit 0（4/4 文件）。
- `npx eslint --quiet <改动文件> src/i18n/locales/studio.ts` → exit 0（4/4）。
- 独立校验脚本（TypeScript AST，独立于写入用的 `JSON.stringify`）：
  - 调用点：逐个断言新 `t("key", { ... })` 的实参表达式与改动前模板
    `${...}` 逐字相同，键集合与映射一一对应 → Kick 18/18、Export 15/15、
    Transport 10/10、Pattern 8/8，合计 **51/51 通过**；
  - 词典：从磁盘上的 locale 文件重新解析出 cooked 字符串，与改动前
    `git show HEAD:<file>` 的 zh / en 分支逐字节比对 → **51/51 通过**；
  - 每个文件迁移后 `isZh` 引用只剩接口声明 1 处。

提交后执行 `npx vitest run src/test/i18nKeys.test.ts src/test/i18n.test.ts --reporter=dot`
→ 4/4 次均 `2 passed`。

最终验证：

- `npx vitest run --reporter=dot` → **60 文件 / 471 例全绿**（exit 0），
  与基线一致。
- `node scripts/track.mjs fast` → exit 0（base=HEAD、0 changed：
  typecheck + 18 条红线）。
- `node scripts/track.mjs fast --base 577b438` → exit 0：
  typecheck + changed-files ESLint（4 源文件 + studio.ts）+
  14 文件 / 71 例受影响单测 + 18 条红线全部通过。
- 仓库级事后复核（AST 同口径）：行级 171 → 148，AST 字面量 148 → 97，
  AST 数据 72 → 72；本轮 4 文件全部 0/0。
