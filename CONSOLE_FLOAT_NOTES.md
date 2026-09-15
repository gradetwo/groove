# 浮动调音台（Studio Console Overlay）实现与验证记录

> 归属：`CODE_REVIEW_AND_PLAN_v1.16.0.md` §9.5 S5 的 **N-11**（用户需求 2「调音台页面需要和律动工作台联动，在律动工作台中点击按钮可以浮出『调音台』」）。
> 交付版本：v1.16.17。

## 1. 为什么不能直接把 `/console` 页面嵌进工作台

`HardwareConsoleView` 原先自己 `new AudioEngine()`、自己 `useSequencerStore()`。若把该视图（或它的朴素副本）作为浮层挂进 `StudioView`，会得到**两个音频图**与**两份音序状态**：

- 两个引擎 → 同一 pattern 被两套 bus 各播一遍，声音叠加；电平表读数对不上任何一条总线。
- 两份 store → 在浮层里推进去的推子只改浮层自己那份 pattern；关掉浮层，工作台里的编辑凭空消失。

## 2. 实际做法：把「展示」与「持有」拆开

| 文件 | 角色 |
|---|---|
| `src/components/console/ConsolePanel.tsx` | **纯展示**。`engine` / `store` 全部由宿主注入，内部**不出现** `new AudioEngine()`，也不调用 `useSequencerStore()`。 |
| `src/views/HardwareConsoleView.tsx` | `/console` 独立路由。仍然持有引擎与 store，然后渲染 `ConsolePanel`（55 行）。 |
| `src/components/console/ConsoleOverlay.tsx` | 工作台里的浮层壳：遮罩 + 抽屉 + 关闭。`isOpen === false` 或引擎尚未就绪时**渲染 `null`**，所以关着的时候完全不挡工作台的走带与网格。 |
| `src/views/StudioView.tsx` | 把**自己**的 `engineRef.current` 与 `useSequencerStore` 实例交给浮层。 |

`ConsolePanel` 的公开 props：

```ts
engine: AudioEngine;                 // 必需，注入，绝不在此构造
store: ConsolePanelStore;            // Pick<ReturnType<typeof useSequencerStore>, "state" | "commit" | "commitCoalesced">
drumKit?: DrumKitType;               // 工作台传当前鼓机；独立路由由曲风推导
isPlaying?: boolean;                 // 由宿主控制
onToggleTransport?: () => void;      // 走带交给宿主，两个播放键不可能漂移
onOpenStudio?: () => void;           // 仅独立路由的「回到工作台」
onClose?: () => void;                // 浮层关闭
variant?: "page" | "overlay";
```

`selectedGenre` 被**刻意省略**：`store.state.currentGenre` 已经是唯一活源，再加一个 genre prop 就是第二份状态。

## 3. 几个必须做对的细节

- **电平表**：通道表由引擎真实的每轨分析器驱动。`enableTrackAnalysers(true)` 在挂载时开、卸载时关；原先那条「用触发回调近似包络」的退路已删除——它除了不准，还会覆盖工作台自己的行电平回调。
- **分析器归属**：`enableTrackAnalysers` 的**唯一**生产调用点就是 `ConsolePanel`。工作台侧边栏的 `MasterAnalyzerSuite` 走 `getMasterAnalyser()`，与开关无关，因此开关浮层不会误伤工作台的分析仪。
- **反相**：`setTrackState` 同步时补上了 `phaseInvert`（此前该字段根本到不了引擎）。
- **空间监听（HRTF）**：浮层挂载时按自己的开关下发，关闭时强制复位为关闭，避免把共享引擎留在隐形的 HRTF 模式里。
- **键盘**：`Escape` 与 `C` 由工作台唯一的键盘所有者 `useTransportShortcuts` 处理，并排在其它分支之前，浮层不会和别的浮层抢键。

## 4. 真实浏览器验证（`scratch/console-float-smoke.mjs`）

在 `dist` 上起临时端口、Playwright Chromium 1440×900，并在应用启动前包装 `AudioContext` 构造函数计数。15 项断言全过：

| 断言 | 结果 |
|---|---|
| 工作台工具栏出现调音台按钮；点击后浮层出现 | ✅ |
| 浮层渲染 8 条通道 + 母带条（33 个 range 控件） | ✅ |
| **打开浮层后 `AudioContext` 构造数 = 1** | ✅（这条是「没有双引擎」的直接证据） |
| 浮层内走带按钮可点且不抛错 | ✅ |
| 母带条在通道溢出时**吸附在右缘**（`right=1420 ≤ 1440`，横向溢出 `176px`） | ✅ |
| `Escape` 关闭；关闭后再按 `C` 打开；关闭按钮关闭；点遮罩关闭 | ✅ |
| 关闭后 `AudioContext` 构造数仍 = 1 | ✅ |
| `/console` 独立路由仍渲染 8 条通道，且不出现浮层副本 | ✅ |
| 全程无未捕获页面错误 | ✅ |

**顺带修掉的真实可用性缺陷**：1440px 下 9 条通道（8 × 166px + 母带 168px）横向溢出约 176px，母带推子与走带按钮本来要被横向滚动才能碰到。已把母带条改为滚动容器内 `sticky right-0`（并加左侧投影边缘），现在无论通道滚到哪里，母带推子与播放/停止都在原地。

## 5. 单元测试与反向验证

- `src/test/ConsolePanel.test.tsx`（7 例）：面板不构造引擎；外部 store 的 `commit` 能到推子；面板编辑能到注入引擎的 `setTrackState`；挂载/卸载开关分析器；关闭或引擎为空时渲染 `null`；关闭按钮；遮罩点击。
- `src/test/StudioConsoleFloat.test.tsx`（5 例）：工作台按钮挂载浮层；关闭卸载；引擎构造数保持 1；分析器开关；浮层推子改动出现在工作台同一 store（KICK 行）；`Esc` 关闭；`C` 切换；独立路由恰好 1 个引擎且复用同一个面板。
- 每个新测试都做过**反向验证**：把被测行为改坏（面板内 `new AudioEngine()`、推子写死、commit 空转、关掉 `Esc`/`C` 分支、关掉遮罩点击）→ 对应用例确实转红，然后恢复。

## 6. 已知取舍

- 打开/关闭浮层会重建引擎的通道条（`enableTrackAnalysers` 的既有语义），**正在发声的音可能被短暂切断**。这是既有引擎行为，本次未改；如果用户在意，应在引擎里把「分析器开关」与「通道条重建」解耦（已记入后续工作）。
- 浮层的 HRTF 开关是浮层本地状态，不复用独立路由上的选择。
