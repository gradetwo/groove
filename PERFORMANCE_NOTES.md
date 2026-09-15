# Groove 性能记录

## A-03 渲染性能

### 背景更正（重要）

任务简报称仓库「零 `React.memo`」。实测并非如此：`src/components/sequencer` 下
`StepCell`（v1.3.5 起）、`TrackRow`、`Ruler`、`GenreRail`、`InfoDossier`、`Toolbar`
**早已**是 `memo<Props>(...)` 写法（`grep -rn "memo<" src/components/sequencer` 命中 6 处）。
之前的判断来自 `memo(` 这一无法匹配 `memo<Props>(` 的检索式。

因此 A-03 的真实瓶颈不是「缺少 memo」，而是 **StudioView 每次渲染都新建内联箭头函数与
内联对象，令所有 memo 浅比较必然失败**：任意一次 store dispatch（例如单个步进开关）都会
重渲染整张 8×N 网格与整个 Toolbar。

### 改了什么

- **Task 1（`c8b0604`）**
  - `VelocityLane` 是全仓唯一未 memo 的叶子，补上 `React.memo`（公共 props 类型不变）。
  - `StudioView` 中传给 `TrackRow` / `Ruler` / `GenreRail` / `InfoDossier` / `VelocityLane`
    的内联箭头全部提升为 `useCallback`；`TrackRow` 的处理器改为「父传一个稳定引用、子组件
    回传 `trackIdx`」；轨道数据改从 `patternRef` 读取，使一次步进编辑不再改变其它行的回调标识。
- **Task 2（`effcc12`）**
  - `Toolbar` 拆出三个 `memo` 子组件：`MeterControls`（拍号/量化/步长/工具模式）、
    `PatternSlotControls`（Pattern A/B、Song、Blind）、`ExportMenu`（导出下拉，自带
    `exportOpen` 状态与外部点击监听）。
  - `StudioView` 传给 Toolbar 的 24 个内联箭头全部 `useCallback` 化；依赖 `pattern` /
    `seqState` 的回调（快捷操作、分享、Inspire Me、各导出、切槽、节拍器/预备拍）改读
    `patternRef` / `seqStateRef`。
- 安全校验：把 `Toolbar.tsx` 去掉缩进后做标记 token 多重集比对，225 个
  `className` / `t(...)` / `aria-*` / `title` / `data-*` 标记前后完全一致；`StudioView.tsx`
  同样比对无差异。未改动任何文案、i18n key、布局 class、ARIA 或控件行为。

### 效果如何被证明

新增 `src/test/sequencerMemo.test.tsx`（6 个用例，全部通过）。

**为什么不能只比较 DOM 节点引用**：React 在普通重渲染时也会复用宿主 DOM 节点，所以
`before === after` 即使 `memo` 被击穿也成立（本仓库实测确认）；`React.Profiler.onRender`
同样会在 memo 回退时触发。两者都无法区分「重渲染」与「跳过」。

因此测试使用**会失败的渲染探针**：

- 在 `TrackRow` 内无条件渲染的 `lucide` 图标 `<Sliders/>` 被 mock 成计数组件，探针只在
  `TrackRow` 函数体真正执行时自增。
- `StepCell` 在「已点亮 + 旋律轨」时调用 `midiToNoteName`，用 spy 计其函数体执行次数。
- DOM 节点引用相等仅作为**次要**断言（用于捕获不应发生的重挂载）。

关键用例：

1. 相同 props 触发父级重渲染 → `TrackRow` 探针 **0 次**、`StepCell` spy **0 次**，且 DOM 节点引用不变。
2. 改变一个真实 prop（`isMute` / `stepVal`）→ 探针自增、DOM 值翻转，证明 memo 比较并非恒真。
3. 三个 `TrackRow` 中只替换第 0 行的 track 对象 → 探针只自增 **1**，即一次 store 式编辑只
   重渲染受影响的那一行，其余行全部回退。
4. 反向用例：把内联箭头传给 `TrackRow` 时探针自增 → 复现被修复的失败模式。

判别力验证：临时把 `TrackRow` 的 memo 比较器改成恒真 `() => true`，测试立即出现 3 个失败；
恢复后全绿。故该测试在 memo 被击穿时**确实会失败**，不是恒真的空断言。

### 实测产物体积（`npm run build`）

| 产物 | raw | gzip |
| --- | --- | --- |
| 改前 `StudioView-AotFHrIv.js` | 212.66 kB | 58.42 kB |
| 改后 `StudioView-Dhq6o94k.js` | 215.21 kB | 58.92 kB |
| 差值 | +2.55 kB | **+0.50 kB** |

体积略增（memo 包装、`useCallback` 包装与三个子组件定义），这是预期代价；A-03 的目标是
减少重渲染而非减小包体，且预算门禁仍通过：`node scripts/check_budgets.js` 显示
initial route gzip 134.6 KB / 220 KB、单块最大 124.32 KB / 150 KB。

### 关于「播放头步进不得重渲染所有行」

**可行性结论：当前 store 形态下无法用它写一个真实的断言，因此没有编造断言。**

播放头本身已经是 DOM 解耦的（P2-03）：`AudioEngine.onStep` 只调用 `updatePlayhead(step)`，
其内部仅对 `[data-ruler-step-idx]` 元素做 `classList.add/remove` 并改写
`playheadBeamRef.current.style.transform/width`，**从不 setState、不 dispatch**。也就是说
播放头步进根本不触发任何 React 渲染，无需 memo 即成立。

要在单测里端到端断言这一点，必须真实挂载整个 `StudioView` + `AudioEngine`（jsdom 下无音频
时钟），成本高且脆弱。作为等价覆盖，测试用例 3 断言了「一次 store 式单轨编辑只重渲染 1 行」
——这正是播放头若走 state 时最容易退化的路径。若要进一步加固，建议后续在 StudioView 上做
基于 `renderHook`/组件级 render-counter 的集成测试，而不是在此硬写一个通过的空断言。

### 仍存在的热点（未处理，附原因）

- **StudioView 本体仍是 2400+ 行单组件**：任何 store 变更都会重跑其函数体（子级虽已回退，
  父级 diff 成本仍在）。彻底解法是拆分容器/视图，超出 A-03 的允许文件与「纯 memo 化」范围。
  → **A-02 已完成**：`StudioView.tsx` 拆为 18 个 hook + 4 个子组件，**2440 → 658 行**，
  零行为变更（AST 标记集 0 丢失 / 0 新增、jsdom DOM 逐字节一致、55 文件 432 用例全绿、
  7 目标 E2E 全过）。详情见 [REFACTOR_NOTES.md](./REFACTOR_NOTES.md)。
- **`pattern.tracks` 数组标识每次编辑都变**：reducer 的 `updateTrack` 用 `map` 生成新数组。
  因此单轨编辑仍会让 `anySolo` 重算、StudioView 重渲染；这是数据模型层面的事，改动会触及
  禁止修改的 `useSequencerStore.ts`。
- **`TrackRow` 以整个 `track` 对象为 prop**：编辑某一行会重渲染该行全部 `StepCell`（因
  `track` 标识变化），未受影响的行不受影响。`StepCell` 的 props 全为原始值，故行内未变化
  的格子会回退，但行级粒度仍偏粗。
- **Toolbar 在 `bpm`/`swing` 拖动、`viewedBar` 滚动时仍会重渲染**（这些值确实在变）；但
  `MeterControls` / `PatternSlotControls` / `ExportMenu` 会因 props 不变而跳过。
- **`VelocityLane` 打开时随每次 pattern 编辑重渲染**：其 `tracks` prop 是完整轨道数组，
  属结构性依赖，未再细分。
- **来自 App 的 `onOpenGenreMaker` / `onViewDetail` / `onAddToCompare`**：若上层传入新的
  箭头函数，仍会击穿 `InfoDossier` 等的 memo；`App.tsx` 不在本次允许改动范围内。

### 如何验证

```
npx tsc --noEmit
npx vitest run src/test/sequencerMemo.test.tsx src/test/sequencerStore.test.ts src/test/sequencerMeter.test.ts --reporter=dot
node scripts/track.mjs fast        # FAST TRACK PASSED（含 20 条红线）
npm run build && node scripts/check_budgets.js
```
