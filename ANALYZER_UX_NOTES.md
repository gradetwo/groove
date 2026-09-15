# 分析仪信号发生器交互变更说明（ANALYZER_UX_NOTES）

分支：`feat/analyzer-signal-gen`
提交：

| SHA | 主题 |
| --- | --- |
| `f668207` | feat(analyzer): 分析仪本体新增信号发生器开关与内置信号下拉框 |
| `d2c4a1b` | refactor(analyzer): 仪器开关与旧信号卡片共用同一个发生器状态源 |
| `657bafb` | test(analyzer): 覆盖仪器级信号发生器控制与旧区块单源联动 |
| 本文档所在提交 | docs(analyzer): 记录分析仪信号发生器交互变更与截图证据 |

## 1. 新交互（用户视角）

原来要滚到页面下方点卡片播放，再滚回顶部看瀑布流/李萨如。现在分析仪这台仪器
的本体头部下方多了一条控制带（顺序：仪器标题栏 → 信号发生器控制带 → 示波视图）：

- **电源开关**：一个真实的 `<button>`，带 `aria-pressed` 与说明性 tooltip。关闭态
  为暗色，打开态为金色高亮，表示"发生器正在发声"。
- **内置发生器下拉框**：一个真实的 `<select>`，列出全部 6 个内置信号（全频扫频、
  808 极深低音、立体声合唱垫乐、180° 反相信号、粉红噪声、白噪声），与页面下方
  卡片使用同一份 `TEST_SIGNALS` 标签，中英随站点语言切换。
- **行为**：
  - 点开关 → 用下拉框当前所选信号开始发声（默认 `sweep`）；示波视图立即出现波形。
  - 播放中改下拉框 → 直接切换到新信号，**不经过停止**（`playSignal()` 内部自行拆除
    上一条声部，无 stop/start 空档）。
  - 再点开关 → 停止发声。
  - 下拉框在关闭态为 `disabled`（对应"按钮启用就边上有个下拉框"）。
- **响应式**：390px 宽下控制带不换行溢出；下拉框高 44px（触屏目标）。

## 2. 保持不变的部分

- 页面下方的"内置声学参考测试信号发生器"区块**渲染与行为逐字未改**：同样的 6 张
  卡片、同样的中英标题/描述/观测预期、同样的点击卡片播放、同样的"停止发声"按钮。
  `git show d2c4a1b -- src/views/AnalyzerView.tsx` 中该区块没有任何删除行。
- 发生器信号定义（6 种信号的合成方式）未改。
- 分析仪 DSP / 可视化逻辑未改；Studio 分析仪坞（`SequencerPanel`）不传
  `signalGenerator`，因此不渲染控制带，输出与外观完全不变。
- 旧卡片点播放时会把仪器下拉框同步到真正在响的信号——这是新增的状态联动，
  不改变旧区块的渲染或交互。

## 3. 实现要点

- `MasterAnalyzerSuite` 新增可选 prop `signalGenerator`（`enabled` / `selected` /
  `options` / `onToggle` / `onSelect`），控制带只在该 prop 存在时渲染。
- 单一真值源仍在 `AnalyzerView`：一个 `AnalyzerSignalGenerator` 实例
  （`generatorRef`）+ `activeSignal` / `isPlayingSignal` / `selectedSignal` 三个状态。
  仪器控制带与旧卡片都只通过这组状态驱动同一个实例，没有第二条音频图。
- 新增 i18n 键 4 个（`analyzer_suite_signal_label` / `_toggle` / `_toggle_title` /
  `_select`），中英齐全，通过 `i18nKeys` 字面量守卫。

## 4. 截图证据

脚本：`scratch/screenshot-check.mjs`（`scratch/` 被 gitignore，仅用于验证）。
它 `server.listen(0)` 起临时静态服务（SPA 回退到 `index.html`），用 Playwright
Chromium 打开 `/analyzer`，视口 390×844、`isMobile`、`hasTouch`、`locale=zh-CN`。

结果（全部 PASS）：

```
serving dist at http://127.0.0.1:40327 (ephemeral port 40327)
innerWidth=390  docScrollWidth=390  bodyScrollWidth=390
cluster: left=17.0  right=373.0  width=356  height=61
selectHeight=44  selectWidth=222  selectDisabled=true(关闭态)
optionValues = sweep,sub_808,stereo_chorus,anti_phase,pink_noise,white_noise
启用后: {"selectDisabled":false,"selected":"anti_phase","pressed":"true"}
PASS  new cluster visible on the analyzer instrument
PASS  cluster fits inside the 390px viewport
PASS  no document-level horizontal overflow
PASS  select is at least 44px tall on touch
PASS  select lists all 6 built-in generators
PASS  dropdown is disabled while the generator is off
PASS  enabling re-enables the dropdown
PASS  selecting anti_phase updates the dropdown
PASS  toggle reports pressed while sounding
PASS  no uncaught page errors
```

截图：

- `scratch/analyzer-signal-gen-390-off.png`（780×1688 物理像素）：关闭态。仪器头部
  下方可见暗色"⏻ 信号发生器"按钮与灰显下拉框"20Hz - 20kHz 全频扫频"，页面右侧
  无横向滚动条，控制带左右都落在 390px 视口内。
- `scratch/analyzer-signal-gen-390-on.png`：点开开关并把下拉框切到
  `180° 反相信号 (Anti-Phase)` 后，按钮变金色高亮、下拉框可用并显示所选信号，
  下方瀑布流随即出现该信号的频谱包络与"峰值: 21.7 Hz | F0 (-7¢) -80.5 dB"读数
  ——证明仪器控制带确实驱动了分析仪显示。
- `scratch/analyzer-signal-gen-cluster-off.png` / `-on.png`：控制带局部特写。

## 5. 验证记录（本分支实测）

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint --quiet`（全部 6 个改动文件） | exit 0，无输出 |
| `npx vitest run src/test/AnalyzerView.test.tsx src/test/MasterAnalyzer.test.tsx src/test/i18nKeys.test.ts src/test/AnalyzerSignalGeneratorControl.test.tsx --reporter=dot` | 4 文件 / 17 用例全过 |
| `npx vitest run --reporter=dot` | 62 文件 / 496 用例全过（基线 61 / 489，新增 1 文件 7 用例） |
| `node scripts/track.mjs fast` | 🎉 FAST TRACK PASSED（18 条红线全过；因工作树干净，改动文件 lint/测试按设计跳过） |
| `node scripts/track.mjs fast --base HEAD~3` | 🎉 FAST TRACK PASSED（6 个改动文件 lint 通过；受影响 15 文件 / 80 用例全过） |
| `npm run build` | exit 0，`✓ built in 22.12s` |
| `node scripts/check_budgets.js` | 全部达标（初始路由 146.6 KB / 220 KB） |
| `node scratch/screenshot-check.mjs` | 全部 PASS（见上） |

## 6. 备注 / 猜测

- 需求写"按钮启用就边上有个下拉框"，因此下拉框采用"关闭即 disabled"而非隐藏，
  这样用户始终能看到可选信号列表；若产品更希望隐藏，改一行 `disabled` 即可。
- 下拉框选项文本沿用旧卡片的 `TEST_SIGNALS` 中英标签（在 `AnalyzerView` 中按
  `isZh` 解析后传入），而不是新建 6 个词条：这样两处标签天然不会漂移。若后续要求
  下拉框也走字典，可再加 6 个键并让两处都引用它们。
- 控制带上未加"LIVE/STANDBY"字样，避免新增不必要文案；开关的高亮/`aria-pressed`
  已足够表达状态。
- 截图脚本放在被 gitignore 的 `scratch/`，未纳入提交，避免引入 `scripts/` 下的
  常驻依赖；如需长期门禁可后续移到 `scripts/`。
