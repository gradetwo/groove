# 三端架构约定（PC / iPad / 手机）

> **背景**：手机端 UI、交互与功能设计将重做，底层功能复用 PC 与 iPad 版本。
> 三端将来会有**不同的 UI、不同的交互、甚至不同的功能集合**（PC 功能最全）。
> 因此需要一条明确的分界线：**功能逻辑不得依赖任何一种界面的形状**。
>
> **现状（已实测）**：`src/features/` 与 `src/hooks/` 里**已经没有任何文件 import React 组件**
> （除下面登记的一处债务）。这不是目标，是已经成立的事实——本文把它固定下来，
> 并给出新增代码该怎么写。

---

## 1. 分层

| 层 | 目录 | 可以做什么 | 不可以做什么 |
|---|---|---|---|
| **domain** | `src/audio` `src/data` `src/types` `src/i18n` | 纯行为与数据。`src/audio` 是 Web Audio 层，`src/i18n` 读平台语言，**天然接触 DOM 全局** | 不得 import logic / ui |
| **util** | `src/utils` | 浏览器 API 的薄包装（触感、PWA、遥测） | 不得 import ui |
| **platform** | `src/platform` | 回答「我在哪种界面上」的**唯一**地方，以及平台服务（`announcer`） | — |
| **logic** | `src/features` `src/hooks` `src/app` | 应用行为与状态。可以用 React（hook）、可以按设计写 DOM 样式（播放头就是这么做） | **不得 import 组件**；**不得自己判断设备类型**——要作为参数传入 |
| **ui** | `src/components` `src/views` `src/ui` `src/App.tsx` | 布局、样式、按端组合。三端的差异**只**应该在这里 | — |

依赖方向单向向下：`ui → logic → platform → domain`。
`ui` 可以 import 下面任何一层；下面任何一层都不许 import `ui`。

## 2. 门禁

```
npm run check:layers          # 违规即失败（已接入 verify）
node scripts/check_layers.mjs --report   # 只报告，永远退出 0
```

它检查两件事：

1. **import 图**：按上表判定每一对 import，报出违规；
2. **DOM 全局**：`domain` 层里除 `src/audio` `src/i18n` 外，不得出现
   `document / window / navigator / localStorage / requestAnimationFrame`。

**为什么要有门禁而不是靠自觉**：这条边界一旦破一点就会迅速破完——
一个 hook import 了组件，那个组件就成了 hook 的一部分，改界面就会改行为，
三端就退化成一个程序加三套皮肤，每个功能都要写三遍。

**容错设计**：`ALLOW` 表登记**已存在**的违规并写明原因，门禁只对**新增**违规失败。
目前表里只有 1 条（见 §5）。表只应缩短。

## 3. 新增代码该怎么写

### 3.1 想知道「这是手机还是 PC」怎么办

**不要**在 logic 层读：

```ts
// ❌ 在 src/features/** 或 src/hooks/** 里
import { useDeviceCapabilities } from "../../hooks/useDeviceCapabilities";
const { isPhone } = useDeviceCapabilities();
if (isPhone) { /* 行为不同 */ }
```

**要**由 UI 层决定，把结果作为参数传下来：

```ts
// ✅ UI 层（src/views/**）决定渲染什么
const { isPhone } = useDeviceCapabilities();
return isPhone ? <PhoneSequencer ... /> : <DesktopSequencer ... />;

// ✅ logic 层只接受已经决定好的事实
function useTransportControls({ announceScope }: { announceScope: "full" | "minimal" }) { ... }
```

判断的理由：**「在手机上该少一个按钮」是产品决策，属于界面**；
「按播放要先解锁音频」是行为，属于 logic 且与设备无关。
把前者放进 logic，等于让手机的产品决策污染 PC 的行为。

**注意 `announcer` 不是能力判断**，它是平台**服务**：logic 层**应当**向它发布播报
（这也是它从 `src/ui/AriaLiveRegion.tsx` 移到 `src/platform/announcer.ts` 的原因——
原先 logic 为了播报一句话要 import 一个 `.tsx`，三端就无法各自决定怎么显示播报了）。

### 3.2 需要一个「只属于某个组件」的类型怎么办

类型的归属看**它描述什么**，不看谁先用它：

| 类型 | 原先在哪 | 现在在哪 | 为什么 |
|---|---|---|---|
| `NavTab` | `components/Header.tsx` | `app/navigation.ts` | 它是「应用有哪些目的地」，不是 Header 的 props 形状 |
| `ParameterDimension` | `components/sequencer/VelocityLane.tsx` | `features/sequencer/stepParameters.ts` | reducer 的 `SET_PARAMETER_DIMENSION` 存的就是它 |
| `GenreRailItem` | `components/sequencer/GenreRail.tsx` | `features/sequencer/genreRail.ts` | 「列表用的轻量曲风形状」是数据决策（A-01 的分包优化） |
| `UnsavedDecision` | `components/sequencer/UnsavedChangesDialog.tsx` | `features/sequencer/unsavedDecision.ts` | guard hook 用它 resolve promise；对话框只是产生它的一种方式 |

组件为了兼容既有引用仍**re-export** 这些类型，但新代码应从上面的归属地 import。
`logic` 里出现 `from ".../components/..."` 一律视为违规。

### 3.3 增加一个端（或一个端上差异很大的界面）

1. 在 `src/views/`（或 `src/surfaces/<name>/`）下新建该端的入口组件；
2. 在 `src/App.tsx` 里依据 `useDeviceCapabilities()` 选择渲染哪一个；
3. **不要**在 `src/features/**` 里加 `if (isPhone)`；
4. 该端不需要的功能就是不渲染——功能是否可达由界面决定，不由 logic 打标记。

一条经验判据：**如果删掉某一端的整个目录，`src/features` 与 `src/audio` 应该仍然能编译通过。**
目前这条判据已经成立（`verify` 里的 `typecheck` 覆盖不到「删除后」，但分层门禁覆盖了它的实质）。

## 4. 三端功能的默认取向

| | PC | iPad | 手机 |
|---|---|---|---|
| 功能完整度 | 最全（基准） | 接近 PC，按触摸调整命中区 | 最少，**做不好用的功能直接不提供** |
| 交互 | 鼠标键盘 + 快捷键 | 触摸 + 键盘（可选） | 纯触摸、手势优先 |
| 布局 | 多栏并置 | 折中 | 单栏、底部导航 |

「手机上不提供」不等于「logic 里不存在」——功能仍然在 `src/features` 里，
只是手机端的界面不渲染它的入口，并且在需要时**明确告知省略**而不是静默消失。

## 4b. 功能层已有的可复用基元

解耦不只是「不许 import 组件」，还要**把重复的接线收敛成基元**，否则每套界面都要重写一遍。
目前已抽出并测试的：

| 基元 | 位置 | 职责 |
|---|---|---|
| `usePanelVisibility` | `features/sequencer/hooks/` | 面板可见性 + 布局持久化（含 D-06 规则） |
| `useAudioEngineInstance` | `features/sequencer/hooks/` | 一个组件一个引擎：创建、回调保鲜、卸载时 `stop()` 后 `destroy()` |

**`useAudioEngineInstance` 存在的理由**：五个视图此前各自手写同三行（构造、挂到 ref、cleanup 里销毁），
其中几个还必须小心保持 effect 依赖稳定——因为 `onStep` **只能在构造函数里设置**
（`onPlay` / `onStop` 早就有 setter）。于是「回调捕获了会变的状态」就会逼出**整个引擎重建**，
而重建会丢掉所有已排期的声部并在会话中途重新分配音频图。
为此给 `AudioEngine` 补了 `setOnStep`，让回调可以保鲜而不重建引擎。

**刻意未迁移的一处**：`ChallengeView` **每换一题就销毁并新建引擎**，且 `play()` 前不主动初始化音频上下文
（依赖播放路径自身的惰性解锁）。改成复用单实例会改变它的音频行为，因此保留原样并在此登记，
而不是为了「统一」去动它。

## 5. 已知债务（门禁登记在案，只应减少）

| 违规 | 原因 | 正确修法 |
|---|---|---|
| `data/index/loader.ts → features/customGenre/customGenreDb` | domain 的曲风加载器要解析自定义曲风，而自定义曲风由 features 存储 | **反转依赖**：loader 接受一个 resolver 参数，由 `src/app` 注入；这样 `src/data` 不再指名任何 feature |

已还清：`data/tutorialCourses.ts` 曾从 `components/Header` import `NavTab`（一行改动）；
`useTransportControls` / `useAppShortcuts` / `useGenreAudition` 曾从 `src/ui` import `announcer`。

## 6. 门禁与测试的临时范围（**重要，且是刻意缩小**）

手机与 iPad 界面即将重做，因此它们的 E2E 目标暂时不在门禁里跑：

| 命令 | 跑什么 |
|---|---|
| `npm run test:e2e`（`verify` 用的就是这个） | **PC 三个浏览器**（Chromium / Firefox / WebKit） |
| `npm run test:e2e:all` | 全部 7 个目标（含手机 2 + iPad 2） |
| `npm run test:e2e:mobile` | 仅手机与 iPad 4 个目标 |
| `E2E_ONLY=iPhone npm run test:e2e:all` | 单个目标，便于迭代 |

**这不是把手机测试删掉**，而是换一个profile跑：矩阵定义（7 个目标与各自断言）**完整保留**，
并且由红线 **R6c** 守住——一旦有人删掉手机/iPad 目标、或把 `test:e2e:all` 改掉，红线条即失败。
新界面落地后把 `test:e2e` 改回 `E2E_PROFILE=all` 即可恢复全量门禁。

同时修正了一处既有缺陷：跑部分目标时汇总信息原本**硬编码**「ALL 7 ... PASSED」，
也就是只跑了 3 个却宣称 7 个全过。现在按实际跑的数目报，并提示全量命令。

## 7. 手机端相关代码的临时状态

手机端将由你重新设计，因此**现有手机相关代码保持能用、但不再是架构上的约束**：

- 平台判断集中在 `useDeviceCapabilities`（`isPhone` / `isMobile` / `isShortLandscape`）；
- 手机专属组件在 `components/MobileTabBar.tsx`、`components/MobileMoreSheet.tsx`、
  `components/sequencer/MobileTransportBar.tsx`、`components/sequencer/MobileStudioSheet.tsx`；
- `SequencerPanel` 目前仍带 `isPhone` / `isShortLandscape` 两个 prop 来切换排布。
  这是**过渡状态**：新手机界面落地时，应当由 `src/App.tsx` 在更高层选择渲染哪个 sequencer 外壳，
  而不是让 `SequencerPanel` 继续长条件分支。
