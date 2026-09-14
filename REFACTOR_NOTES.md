# StudioView 拆分记录（A-02）

## 结论

`src/views/StudioView.tsx` 从 **2440 行** 降到 **658 行**（目标 ≤ 700），
新增 18 个 hook 文件与 5 个子组件/配置文件。**零行为变更**：文案、class、ARIA、
`data-*`、i18n key、事件顺序均未改动，单测 / 构建 / 预算门禁 / 7 目标 E2E 全绿。

| 指标 | 改前 | 改后 |
| --- | --- | --- |
| `src/views/StudioView.tsx` | 2440 行 | **658 行** |
| `useState` 数量 | ~26 | 19（容器只保留 UI 开关 + 配置状态） |
| `useEffect` 数量 | ~28 | 0（全部迁入 hook） |
| 新增文件 | — | 18 hooks + 4 tsx + 1 ts |

## 提交

| SHA | 主题 |
| --- | --- |
| `ad50b21` | 抽出 useToast 管理本地轻提示（第 1 步） |
| `0119da6` | 抽出 useGenreSwitching 管理风格轨（第 2 步） |
| `77b7178` | 抽出 useUrlShareLoad 处理分享链接启动加载（第 3 步） |
| `a4380a0` | 抽出 AudioEngine 生命周期与实时录制桥（第 4 步） |
| `ce5daa9` | 抽出 useTransportShortcuts 管理全局快捷键（第 5 步） |
| `4adfc4b` | 抽出 useExportActions 统一导出与分享（第 6 步） |
| `d7cb100` | 抽出外部载入 / MIDI / 矩阵滚动 / 工程中枢四个 hook（第 7 步） |
| `2e59bba` | 抽出输入 / 动作 / 轨控 / 力度 / 传输 / 工具条 / 面板七个 hook（第 8 步） |
| `5f668f7` | 抽出面板 / 弹窗 / 右键菜单 / Toast 子组件（第 9 步） |

注：第 7、8 步各为一批同域 hook，共用一个提交（每批内部文件互相独立，逐一可读）。
后续如需更细粒度历史，可按文件 `git log -- <hook>` 追。

## 模块地图

### hooks（`src/features/sequencer/hooks/`）

| 文件 | 负责什么 | 主要入参 → 出参 |
| --- | --- | --- |
| `useToast.ts` | 本地轻提示状态 + 2400ms 定时器与卸载清理 | — → `toastMessage` / `showToast` |
| `useGenreSwitching.ts` | 大类筛选、chip 列表、`genreAccent`、`getGenreAccent/getGenreChipTag`、按需 `loadGenre` 切换、骰子随机、chip 选择；外部 genre 同步 + 换风格默认鼓机同步；`useCustomGenres` | genre / engineRef / isPlaying / setDrumKit / clearPlayhead / commit → 列表 + 回调 |
| `useUrlShareLoad.ts` | `?groove=` 分享码解码写回、`?genre=` 直接选风格（mount 时一次） | commit / engineRef / currentGenre / showToast → void |
| `useLiveRecordingBridge.ts` | P5-05 量化步进回调（`SET_STEP` / `SET_VELOCITY` / `SET_PITCH` + `invalidateRedo` + 触感） | invalidateRedo / dispatch → `handleQuantizedStep` |
| `useAudioEngineLifecycle.ts` | `updatePlayhead` / `clearPlayhead` / `triggerTrackMeters`；AudioEngine 创建销毁；全部 engine 同步 effect（loopRange、节拍器、预备拍、鼓机、只听鼓组、录制待命、MIDI 音阶过滤、效果器机架、pattern/bpm/swing/拍号/量化）；内部持有 `lastStepRef` | 各 ref + 状态 → `clearPlayhead`(+`updatePlayhead`) |
| `useTransportShortcuts.ts` | window keydown（Space/Esc/P/D/V/E/O/Cmd-Ctrl+Z/Y）+ click-away；导出 `StepContextMenuState` / `PitchPickerState` 类型 | 浮层开关 + 传输回调 → void |
| `useExportActions.ts` | MIDI / ALS / .groove / WAV / Stems 导出 + 分享链接 + `isExportingAudio` | refs + transport 参数 + activeProject 等 → 7 个回调/状态 |
| `useInitialPatternLoad.ts` | 和弦 / 琶音 / Masterclass 三条「他页传入」effect（保持原顺序） | 各 initial* + clear 回调 → void |
| `useMidiInput.ts` | Web MIDI 设备列表、`onDevicesChanged` / `onNoteOn` 预览、电脑键盘演奏监听 | pattern / engineRef / isKeyboardMode → `midiDevices` |
| `useMatrixScroll.ts` | Shift+滚轮平移、标尺拖拽滚动、loopRange 选择、`scrollToBar` / `scrollByPixels`；持有 `isRulerDragging` 与拖拽 ref | matrixContainerRef / stepsPerBar / setViewedBar → 7 个输出 |
| `useProjectHub.ts` | activeProject 状态、启动恢复、`handleLoadProject`（含 F-06 重新播种 localStorage） | commit / currentGenre / setters → `activeProject` / loader |
| `useGridInteraction.ts` | 网格事件委托、拖拽涂抹批量提交、长按 P-Locks、右键坐标、移动端工具模式点按；持有 `isTouchDevice` 与拖拽/长按 ref | pattern / refs / mobileEditMode / setters → 5 个处理器 + `isTouchDevice` |
| `usePatternActions.ts` | 快捷操作、MIDI 导入、Inspire Me、试听、循环轨道长度 | refs + stepsPerBar/stepCount/... → 5 个回调 |
| `useTrackControls.ts` | TrackRow 的 11 个 memo 稳定回调（静音/独奏/音量/声像/swing/开力度抽屉/移位/填充/清空/上下移） | patternRef / engineRef / commit / setters → 11 个回调 |
| `useVelocityLaneEditing.ts` | 力度抽屉维度/轨道选择与 velocity / probability / ratchet / gate 的单点与批量 dispatch | commit / commitCoalesced / setters → 11 个回调 |
| `useTransportControls.ts` | 播放/停止、只听鼓组、撤销/重做、测速、Pattern A/B 切换/复制、Song、盲测、节拍器、预备拍；持有 tap 时间戳 ref | engineRef / seqStateRef / commit / undo / redo → 11 个回调 |
| `useToolbarControls.ts` | 鼓机、录制待命、总线效果器、BPM/Swing/拍号/量化/步长、增减步长、键盘演奏模式 | setters / commit / commitCoalesced → 11 个回调 |
| `usePanelToggles.ts` | 侧栏折叠、最大化、高级控制、力度/欧几里得/分析仪/工程中枢浮层开关 | 7 个 setter → 8 个回调 |

### components（`src/components/sequencer/`）

| 文件 | 负责什么 |
| --- | --- |
| `trackConfig.ts` | `DEMO_TRACKS_CONFIG`（8 轨名称/配色）。`StudioView.tsx` 以 `export { DEMO_TRACKS_CONFIG } from ...` 原样再导出，模块公开面不变 |
| `ToastBanner.tsx` | 底部轻提示浮层；`message` 为空时返回 `null`，等价于原 `{toastMessage && (...)}` |
| `StepContextMenu.tsx` | P-Locks 右键/长按菜单（ratchet / probability / 打开音高键盘），坐标钳制原样 |
| `SequencerModals.tsx` | EuclideanModal / PitchPickerModal / ProjectHubModal 三个浮层及回调 |
| `SequencerPanel.tsx` | 右列整块：Toolbar、MasterAnalyzerSuite 停靠区、8 轨矩阵 + Ruler、力度抽屉、底部快捷键提示。显式 props，无内部状态 |

## 有意留在 `StudioView.tsx` 的内容

- **19 个 UI 开关 / 配置状态**（`isPlaying`、`viewedBar`、浮层开关、`mobileEditMode`、
  `drumKit`、`isDrumsOnly`、`isRecordArmed`、`effectsRackState` 等）：它们同时被多个
  hook 读写，放在容器里作为「单一事实来源」最清晰；再下移会变成跨 hook 状态同步。
- **三个 DOM ref**（`matrixContainerRef`、`playheadBeamRef`、`lastActiveRulerStepRef`）
  与 `engineRef` / `patternRef` / `seqStateRef`：前三个必须由渲染树持有（ref 绑定在
  `SequencerPanel` 上，同时被 `useAudioEngineLifecycle` / `useMatrixScroll` 使用）；
  后三个是「避免 stale closure」的镜像 ref，必须紧跟 store 状态更新。
- **hook 编排**（18 次 hook 调用与显式入参）：没有再造一个「组合 god-hook」，
  每个 hook 的依赖关系在容器的调用点一眼可见。
- **布局骨架**（根 div、`GenreRail`、`<main>`、`InfoDossier` 条件渲染、
  `SequencerPanel` / `SequencerModals` / `StepContextMenu` 装配）：这是本组件的
  「视图」职责，不再含业务分支。
- **`DEMO_TRACKS_CONFIG` 的再导出**：保留模块公开 API（虽然当前无外部引用）。
- 未改动 `useSequencerStore.ts`、`src/audio/**`、`CompareView.tsx`、`Toolbar.tsx`
  的公共 props（`Toolbar` 只被 `SequencerPanel` 调用，props 集合与改前一致）。

## 行为不变如何被证明

1. **AST 字符串集合比对**（源码级标记多重集）
   - 旧：`git show <baseline>:src/views/StudioView.tsx` 单文件。
   - 新：`StudioView.tsx` + 全部 18 个新 hook + 4 个新 tsx + `trackConfig.ts`。
   - 排除 import specifier 后：**丢失 0 条、新增 0 条**（394 → 394 条不同字符串）。
   - 说明 `className`、`t(...)` 之外的文案、`aria-*`、`title`、`data-*`、
     provider/选项常量等全部原样保留。
2. **运行时 DOM 逐字节比对**（临时 jsdom 用例，验证后删除）
   - 同一测试内同时挂载「改前 StudioView」与「改后 StudioView」，比较
     `container.innerHTML`：初始态、`V` 力度抽屉、`E` 欧几里得弹窗、`P` 工程中枢、
     步进点击 + P-Locks 右键菜单共 5 个状态 **全部完全一致**。
3. **单元测试**：`npx vitest run --reporter=dot` → 55 文件 / 432 用例全绿。
4. **类型 / 静态检查**：`npx tsc --noEmit` 通过；`npx eslint --quiet` 全部改动文件通过；
   新增文件 `npx prettier --check` 通过。
5. **产物门禁**：`npm run build && node scripts/check_budgets.js` 通过
   （initial route gzip 134.3 KB / 220 KB）。
6. **E2E 矩阵**：`PLAYWRIGHT_MODULE_PATH=/home/crow/.hermes/node/lib/node_modules node scripts/test_matrix.js`
   → 7/7 PASS（Chromium、Firefox、WebKit、iPhone 14 竖/横、iPad Pro 11 竖/横）。

### 有意的等价调整（非用户可见）

- **effect 声明顺序位移**：为让 `useGenreSwitching` 拿到
  `useAudioEngineLifecycle` 的 `clearPlayhead`，engine 同步 effect 的注册位置前移、
  genre 两条 effect 后移。两者只写互不相干的 engine 属性/状态，无可观测差异。
- **`useGridInteraction` / `usePatternActions` 的处理器保持「每次渲染重建」**：
  与原实现一致（这两个 hook 的处理器原本就不是 `useCallback`）；只有传给 memo 叶子的
  回调继续保持 `useCallback` 与原有依赖数组，保证 `Toolbar` / `TrackRow` / `Ruler` /
  `GenreRail` / `VelocityLane` / `InfoDossier` 的 props 标识稳定性不变。
- **`DEMO_TRACKS_CONFIG` 显式标注 `TrackMetaConfig[]`**：仅为类型收敛，运行时数组内容
  与顺序完全相同。

## 如何复跑验证

```bash
npx tsc --noEmit
npx eslint --quiet src/views/StudioView.tsx src/features/sequencer/hooks/*.ts \
  src/components/sequencer/{SequencerPanel,SequencerModals,StepContextMenu,ToastBanner}.tsx \
  src/components/sequencer/trackConfig.ts
npx vitest run --reporter=dot
npm run build && node scripts/check_budgets.js
PLAYWRIGHT_MODULE_PATH=/home/crow/.hermes/node/lib/node_modules node scripts/test_matrix.js
```
