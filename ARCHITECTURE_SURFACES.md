# 界面架构约定（今天只有一套：PC、iPad 与手机共用的桌面界面）

> **背景（2026-10-02 更正）**：手机版**已被砍除**——`src/mobile/` 一整棵、手机外壳 chrome
> （`MobileTabBar`／`MobileMoreSheet`／`MobileTransportBar`／`MobileStudioSheet`）、
> `/m/<module>` 路由空间与 13 条手机外壳判据都不在了（`4dffdf0`）；业主裁定开发分支上的手机版支持
> 连同测试、门禁、CI/CD 一并砍掉，只留 `mobile-preserved`（`docs/OPEN_WORK.md` §十三／§十四）。
> **今天只有一套界面（`desktop`）**：PC、iPad 与手机浏览器渲染的都是它——
> 「三端将来会有**不同的 UI、不同的交互、甚至不同的功能集合**」这个前提已随之取消。
>
> 但下面这条分界线照旧是**现行规范**：**功能逻辑不得依赖任何一种界面的形状**——
> 正因为它还在，"再加一套界面"才不必把每个功能重写一遍。
>
> **现状（已实测）**：`src/features/` 与 `src/hooks/` 里**已经没有任何文件 import React 组件**，
> 本文所描述的边界**今天没有登记在案的例外**（§5）。这不是目标，是已经成立的事实——
> 本文把它固定下来，并给出新增代码该怎么写。

---

## 1. 分层

| 层 | 目录 | 可以做什么 | 不可以做什么 |
|---|---|---|---|
| **domain** | `src/audio` `src/data` `src/types` `src/i18n` | 纯行为与数据。`src/audio` 是 Web Audio 层，`src/i18n` 读平台语言，**天然接触 DOM 全局** | 不得 import logic / ui |
| **util** | `src/utils` | 浏览器 API 的薄包装（触感、PWA、遥测） | 不得 import ui |
| **platform** | `src/platform` | 平台服务与平台声明（`announcer`、`audioCapture`、`diagnostics`、`layoutTokens`、`surfaceCapabilities`） | — |
| **logic** | `src/features` `src/hooks` `src/app` | 应用行为与状态。可以用 React（hook）、可以按设计写 DOM 样式（播放头就是这么做） | **不得 import 组件**；**不得自己判断设备类型**——要作为参数传入 |
| **ui** | `src/components` `src/views` `src/ui` `src/App.tsx` | 布局、样式、按界面组合。**界面的差异只应该在这里** | — |

依赖方向单向向下：`ui → logic → platform → domain`。
`ui` 可以 import 下面任何一层；下面任何一层都不许 import `ui`。

**规定的能力入口是 `src/hooks/useDeviceCapabilities.ts`**（`isTouch` / `isPhone` / `isMobile` /
`isShortLandscape` / `prefersReducedMotion`）——它逻辑上属于**平台**（§7），只是文件住在 `src/hooks` 下；
门禁把它当**能力模块**，**logic 里 import 它就是 R3 违规**，读它的地方应该是 UI 层，且只用来决定
长什么样（§3.1）。R3 判的是 import 图，所以它管的是"有没有走这个入口"，不是"文件里有没有出现 `matchMedia`"。

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
一个 hook import 了组件，那个组件就成了 hook 的一部分，改界面就会改行为；
**每一处这样的耦合，都让"多一套界面"变成"多写一遍每个功能"**。

**容错设计**：`ALLOW` 表登记**已存在**的违规并写明原因，门禁只对**新增**违规失败。
**目前表是空的**（见 §5），红线 **R6f** 要求它保持空。表只应缩短——还清了就删掉，不留到下一轮。

## 3. 新增代码该怎么写

### 3.1 logic 想知道「界面长什么样」怎么办

**不要**在 logic 层读：

```ts
// ❌ 在 src/features/** 或 src/hooks/** 里
import { useDeviceCapabilities } from "../../hooks/useDeviceCapabilities";
const { isPhone } = useDeviceCapabilities();
if (isPhone) { /* 行为不同 */ }
```

**要**由 UI 层决定，把结果作为参数传下来：

```ts
// ✅ UI 层（src/components/**）读能力，只用来决定长什么样——TrackRow 就是这么做的
const { isMobile } = useDeviceCapabilities();
className={`... ${isMobile ? "min-h-11" : ""}`}   // 触屏上的 44 px 命中区

// ✅ logic 层只接受已经决定好的事实：界面决定 inspector 显示哪条轨，hook 收下这个事实
function useAuditionPreview({ inspectorTrackIdx }: { inspectorTrackIdx: number | null }) { ... }
```

判断的理由：**「触屏上按钮要有 44 px 命中区」是界面决策**（`TrackRow` 里 `isMobile` 只改样式、不改行为）；
「按播放要先解锁音频」是行为，属于 logic 且与设备无关。
把前者放进 logic，等于让界面的呈现决策污染行为。

**注意 `announcer` 不是能力判断**，它是平台**服务**：logic 层**应当**向它发布播报
（这也是它从 `src/ui/AriaLiveRegion.tsx` 移到 `src/platform/announcer.ts` 的原因——
原先 logic 为了播报一句话要 import 一个 `.tsx`，界面就无法自己决定怎么显示播报了）。

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

## 4. 功能的归属：界面决定可见性，logic 决定存在

原来那张按 PC / iPad / 手机三列分功能完整度与交互的表（PC 最全、手机最少、做不好用的直接不提供），
**随手机壳一起作废**（`4dffdf0`，2026-10-02）：今天只有一套界面，没有任何功能被哪套界面扣下。
`src/platform/surfaceCapabilities.ts` 里 `phone` 那一列留的是**砍除前那次取舍的记录**
（每个能力当时为什么被扣下），不是今天的取向——那个文件的头部也是这么写的。

留下的规则与设备无关：**「这个界面不提供」不等于「logic 里不存在」**——
功能仍然在 `src/features` 里，界面只是不渲染它的入口，并且在需要时**明确告知省略**而不是静默消失。
今天没有界面在扣功能，但这条规则留着：将来哪套界面要扣，也不许静默消失。

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

## 5. 已知债务：**无**（`ALLOW` 为空，R6f 要求保持为空）

`check_layers.mjs` 的 `ALLOW` 一条也没有，红线 **R6f** 要求它保持空。
这张表是"真的还不上、且写明了修法"的停车位，不是违规的墓地——还清了就删掉，不留到下一轮。

`ALLOW` 表最后的两条都已经还清：

| 曾经的违规 | 原因 | 修法（已落地） |
|---|---|---|
| `data/index/loader.ts → features/customGenre/customGenreDb` | domain 的曲风加载器要解析自定义曲风，而自定义曲风由 features 存储 | **反转依赖**：loader 接受一个 resolver 参数，由 `src/app/installCustomGenreResolver.ts` 注入；这样 `src/data` 不再指名任何 feature |
| `useAppShortcuts.ts` → `components/Header` 的 `NavTab` | 一个 hook 用了组件的 props 类型 | 类型移到 `src/app/navigation.ts`，hook 从那里 import |

更早还清：`data/tutorialCourses.ts` 曾从 `components/Header` import `NavTab`（一行改动）；
`useTransportControls` / `useAppShortcuts` / `useGenreAudition` 曾从 `src/ui` import `announcer`。

## 6. 门禁与测试的范围（**E2E 全量在跑**）

手机与 iPad 目标随手机版一起砍除（`4dffdf0`，2026-10-02，见 `docs/OPEN_WORK.md` §十三），
矩阵里只剩桌面三个浏览器——`scripts/test_matrix.js` 里两个 profile 现在是同一个集合：

| 命令 | 跑什么 |
|---|---|
| `npm run test:e2e`（`verify` 用的就是这个） | **桌面三个浏览器**（Chromium / Firefox / WebKit） |
| `npm run test:e2e:all`（CI 每次 push / PR 跑的就是这个） | **同一组三目标**（`pc` 与 `all` 已是同一个集合） |
| `E2E_ONLY=<名字片段> npm run test:e2e:all` | 只跑名字匹配的目标，便于迭代（如 `E2E_ONLY=Firefox`） |

**红线 R6c 守的是"门禁不许静默少一个目标"**：三个桌面浏览器必须都还在矩阵里、
不许有手机或平板目标半途重新出现、`test:e2e:all` 必须仍然是"一条命令跑全量"。
它原来的对象（手机/iPad 目标必须还在）正是 `4dffdf0` 砍掉的东西，所以规定跟着换了对象，而没有消失。

**这条红线为什么值得留**：当初缩减门禁的理由是"手机界面正在重做、断言会被重做作废"——
`pc` 档因此跳过三分之二目标，而**iPad 专属回归只会在被跳过的那一档里现形——跳过目标的门禁，正是它活到线上的原因**。
那个理由今天不存在了，但"少一个目标"仍是最容易发生的静默退化。

同时保留了当初修的一处缺陷：跑部分目标时汇总信息原本**硬编码**「ALL 7 ... PASSED」，
也就是只跑了 3 个却宣称 7 个全过。现在按实际跑的数目报，并提示全量命令。

## 7. 手机端相关代码：**已砍除**（2026-10-02）

手机版由业主裁定砍除（`4dffdf0`，2026-10-02）：业主的原话是"其它分支都可以砍掉原来这个手机版支持，
包括测试和门禁也都是，CI/CD 也同理"（`docs/OPEN_WORK.md` §十三／§十四）。`src/mobile/` 一整棵、`MobileTabBar`、
`MobileMoreSheet`、`MobileTransportBar`、`MobileStudioSheet`、手机版 `Header` 变体、`/m/<module>`
路由空间与 13 条手机外壳判据都不在了，手机浏览器现在渲染桌面界面。唯一保留手机版的分支是
`mobile-preserved`。**这一节以下的内容是砍除前的过渡状态记录**，不是现状。

- 平台判断集中在 `useDeviceCapabilities`（`isPhone` / `isMobile` / `isShortLandscape`）——**这一条仍然成立**，
  它属于**平台**（触屏、设备分类、缩放手势护栏）而不是外壳；
- 手机专属组件曾经在 `components/MobileTabBar.tsx`、`components/MobileMoreSheet.tsx`、
  `components/sequencer/MobileTransportBar.tsx`、`components/sequencer/MobileStudioSheet.tsx`；
- `SequencerPanel` 曾带 `isPhone` / `isShortLandscape` 两个 prop 来切换排布；现在它只有一个排布，
  桌面工具栏在所有设备上渲染。
