# 编曲页「按下卷帘格子 ⇒ 窗口同步滚动 226 px ⇒ 点击被吞」

**状态**：机制已定；**修复未定**（四次产品试探均无效并已回退，产品代码与 HEAD 净零）。
**发现方式**：`npm run probe:arrangement-undo` 确定性失败（两次同结果）。该探针**没有任何 CI 覆盖**。
**时间**：2026-10-05 15:28–16:39（+08）。

## 一句话

> 在编曲页**按下**钢琴卷帘的一个格子时，**窗口在同一瞬间向下滚 226 px**（1440×1000 视口），
> 于是**抬起**落在**另一个格子**上（pitch 84 → 70，坐标不变）；该编辑器要求"按下与抬起同一格"，
> 于是**正确地拒绝写入** ⇒ ⭐ **真人看到的是：点一下格子，页面跳一下，什么也没发生**。

## 精确复现（探针侧，一行）

1. `npm run build`（`probe:arrangement-undo` 要求 `dist/index.html` 存在）；
2. `npm run probe:arrangement-undo`；
3. 读它打印的三行：
   - `real pointerdown landed on` ⇒ `[{…"testid":"roll-cell-84-0","windowScrollY":0,…},{"kind":"pointerup","testid":"roll-cell-70-0","windowScrollY":226}]`
   - `window scroll events` ⇒ `[{"y":226,"active":"roll-cell-84-0"}]`
   - `scrollY samples while held` ⇒ `[226,226,226,226,226,226,226,226]`（按下后立刻就是终值）

## 已确立的读数（方法与口径）

| 读数 | 值 | 方法 |
|---|---|---|
| 按下时的窗口滚动 | `windowScrollY = 0` | 原生捕获监听读 `window.scrollY` |
| 抬起时的窗口滚动 | `windowScrollY = 226` | 同上 |
| 按下命中的格子 | `roll-cell-84-0`（x 88, y 629） | 捕获监听读 `e.target` ＋ `elementFromPoint` |
| 抬起命中的格子 | `roll-cell-70-0`（**同一坐标**） | 同上 |
| 滚动的时序 | **同步发生在这次 pointerdown 派发之内** | 按住不放，每 100 ms 采样：首样即 226 |
| 焦点的时序 | 两次 `focusin` **都已是 y=226** | 原生 `focusin` 捕获监听 |
| 手动 `cell.focus()` | `0 → 0`（**不滚**） | `page.evaluate` 手动聚焦前后读 `scrollY` |
| 内层滚动容器 | `scrollTop = null`／未变 | 捕获监听读最近可滚动祖先 |

## 已排除的解释（13 支，每支都便宜地量过）

几何／尺寸 ✗（格子 12×16）｜遮挡 ✗（中心最上层即它自己）｜视口之外 ✗（box 在 1440×1000 内，`scrollIntoViewIfNeeded` 前后不变）｜
`locator.hover()` 的可操作性滚动 ✗（换成 `mouse.move()` 仍滚）｜同帧 vs 跨帧 down/up ✗｜跨任务 down/up ✗｜
选中轨 ✗（前后同为 `Synth`）｜车道类型 ✗（`sampler` 与 `Synth` 都试）｜portal ✗（全仓无 `createPortal`）｜
`panel.current?.focus()` ✗（整段移除仍滚）｜`focus({ preventScroll: true })` ✗｜`onPointerDown` 的 `preventDefault()` ✗｜
`onMouseDown` 的 `preventDefault()` ✗｜"聚焦该格滚入视野" ✗（手动 focus 不滚）

## 关键推断（并说明它为何自洽）

- 只读取证显示 **`onPointerUp` 一次都没有执行**（`window.__rollLog` 为 `null`）；
- 四次 `preventDefault`／移除 focus **都无效**；
- 二者互相印证：⭐ **React 的处理链没有收到这次可信输入**，因此任何 `preventDefault` 都不可能生效；
- 而滚动**与焦点无关**（手动 focus 不滚），却**紧跟按下**（同步、首样即终值）；
- ⭐ 结论：**滚动属于"按下"这一动作本身**（浏览器级），而**不是**应用里某次 `focus()` 的结果。

## 建议的下一步（都很便宜，仍未做）

1. **换一个格子做对照**（不同 pitch）：只有 `84-0` 会滚 ⇒ 与格子位置有关；都滚 ⇒ 与页面状态有关。
2. **原生捕获阶段**对 `pointerdown` 调 `stopPropagation()` 并读 `defaultPrevented` ⇒ 分清"浏览器默认 ✗"与"应用的同步处理器 ✗"。
3. 读 `document.scrollingElement`、`getComputedStyle(document.documentElement).overflowAnchor` 与 `scroll-behavior`。

## 为什么不建议现在修

- 产品**按自己的规则是对的**（拒绝非同格的写入）；要修的只是"**页面在手势中移动**"这一件事；
- 但**尚未确定是谁移动的**（候选只剩浏览器默认与应用某处同步处理器两支）⇒ ⭐ 按"先量后改"，**不猜着改** ✗；
- 该探针**不要**先进 CI：在机制未定前接进去，要么产生**假红**，要么把真回归变成**常态噪声**。

## 附：本线对产品代码的改动记录（全部已回退）

| 试过的改法 | 结果 | 处置 |
|---|---|---|
| 3 处 `panel.focus()` ⇒ `focus({ preventScroll: true })` | 仍红 | 已回退 |
| 单元格 `onPointerDown` 加 `preventDefault()` | 仍红 | 已回退 |
| 再加 `onMouseDown` 的 `preventDefault()` | 仍红 | 已回退 |
| **整段移除**单元格的 `panel.current?.focus()` | 仍红 | 已回退 |

⭐ 当前 `src/` 与 HEAD **零差异**、`tsc=0`、dev 全绿。
