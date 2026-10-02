# 外部审计（基准 `1b535ec`）**逐条核定** — 2026-10-02

**报告位置**：`/home/crow/music/1b535ec6114db4635e228c5cafdddd0b6b33a925_report/`（7 份 ✓）
**基准**：GitHub `dev` 的 `1b535ec` ✓；**本树已在其前 8 个提交** ✓（**所以部分结论可能已被后续提交改变 ✓，每条都在**当前树**上重核 ✓**）

**规矩（不变）** ✓：**逐条给 file:line 或实测 ✓；外部意见里有真成立的、也有被测量推翻的 ✓**。

---

## 一、已核定：**四条 P0／P1 全部成立** ✓✓

### ❌→✅ P0-1（音频阻断）：**采样轨只在第一遍发声** ✓ **成立**

* **机制**：`src/audio/samplerSteps.ts:14` 的注释写明 —— **"Every event is scheduled at once, ahead of time. The browser's audio clock is what plays them"** ✓——**即一次把**一整遍**排给音频时钟 ✓**；
* **调用次数**：`scheduleSamplerSteps` 全仓只被 `src/audio/playerFromEngine.ts:262` 调用**一次**（在 `play()` 里 ✓），**没有任何按遍重排** ✗；
* **而合成器轨会重触发**：走带在 `AudioEngine.ts:1892-1898` 按 `loopRange` wrap ✓（`:238` 字段 ✓、`:1367` 设置 ✓）；
* **⇒ 于是第二遍起**：合成器继续响 ✓、采样轨无人再排 → **永久静音** ✗✓✓——**与报告描述一致 ✓**。

### ❌→✅ P0-2（数据损坏）：**任一 clip 缺字段 → 全曲丢该数组** ✓ **成立**

* **出处**：`src/data/songFlatten.ts:174-181` ✓：
  ```ts
  const arrays = OPTIONAL_STEP_ARRAYS.filter(
    (name) => playable.every((bar) => { const track = ...; return Array.isArray(track?.[name]); }) || (name === "velocity" && filled)
  );
  ```
* **后果**：**只要有一个可播小节的 clip 没有 `pitch`，整首歌就不建 `pitch`** ✗✓✓（`gate`／`pitches` 同理 ✓）→ **旋律与发音时长在**全曲**范围丢失 ✓**；
* **它是**有意的**（`:168` 注释 ✓）**，**而报告指出的要害成立** ✓：**这是"静默丢弃" ✓，且已有 `velocity` 作为**例外**先例 ✓**（`:180` ✓）——**⇒ 兜底改成 per-track／per-step 是可行方向 ✓**。

### ❌→✅ P0-3（功能可用性）：**编排无任何持久化** ✓ **成立**

* `src/components/arrangement/ArrangementViewV2.tsx:98` ✓：**`useState<ArrangementV2>(() => createArrangementFromTemplate(songId, undefined, "instrum…"))`** ✓；
* **全仓无持久化通路** ✓：`saveArrangement`／`loadArrangement`／`indexedDB + arrangement` **均 0 命中** ✓；
* **⇒ 刷新即回模板 ✓，编曲全丢 ✓**——**而 `:25-29` 的注释只承认"loop range 与 arm 未持久化" ✓，实际范围更大 ✗**。

### ❌→✅ P1-1（导航）：**Header 用 `<a href="/new">` 整页跳转** ✓ **成立**

* **出处精确** ✓：`src/components/Header.tsx:249-256` ✓（**报告的行号对 ✓，只把目录写成 `components/layout/` ✗**）；
* **而它有明确的设计理由** ✗✓：注释写着 **"an **anchor**, not a tab button: 'new project' is a route of its own (`/new`)"** ✓——**⇒ 报告"改成客户端路由"这条**不是无争议的** ✓：**要么改路由架构 ✓，要么承认这条跳转是有意为之但代价是销毁 AudioContext ✗**，**得由业主定 ✓**。

---

## 二、⚠️ 报告抓到的一件**我的错**（本会话自身更正）✓

报告称 **"标尺循环框为纯 UI 假象"** ✓——**成立，而且出处是代码自己的注释** ✓✓：

* `src/components/arrangement/ArrangementViewV2.tsx:25-29`：**"the loop range and the record-arm flag… Neither is persisted yet, and neither changes what the engine plays — **the loop brace is a ruler-level loop that no audio path reads**. That is stated here rather than implied."** ✓✓

**⇒ 而我在本会话的试听审计里写过** ✗：**"web 有 loop range（`arrangementLoop.ts`／`ArrangementViewV2.tsx:122/441`／`LoopBraceV2`）"** ✓，**并据此说"MCP 缺某一段、而 web 有" ✗✓✓**——**那句话把**引擎具备 loopRange 的能力**与**编排界面的循环框已接线**混为一谈 ✗**。**事实：循环框不接任何音频路径 ✓；引擎的 `loopRange` 是另一条线 ✓。**⇒ **`docs/AUDITION_AUDIT.md` §2 的那一格需要更正 ✓**。

---

## 三、尚未核定（**明说，不假装** ✗✓）

* **P1-2**（`PianoRollV2` 无试听／无快捷键）：**未核** ✓——**报告称无单击试听、无空格／Delete／Cmd+Z ✓**；
* **P1-3**（上万个 DOM `<button>` 导致卡顿 ✓）：**未核** ✓——**需数节点或量帧 ✓**；
* **P1-4**（编排无导出／无分享 URL ✓）：**未核** ✓——**与本会话已做的 `render_arrangement` 小节范围有关但不同 ✓**；
* **第 03 与 04 份的技能类结论**（200ms lookahead ✓、4 复音截断 ✓、GC 爆音 ✓、iOS 兼容 ✓）：**均未核** ✓；
* **第 06 份的路线图**：**属建议 ✓，不是可判事实 ✓**。

---

## 四、建议顺序（**影响 × 可判**）✓

1. **P0-1 采样循环静音** ✓✓——**唯一一条"听不到声音"的 ✓，且机制已定位到 `playerFromEngine.ts:262` 的单次排程 ✓；
2. **P0-2 全曲丢数组** ✓✓——**数据损坏 ✓，且`velocity` 例外已经给出改成 per-track 兜底的先例 ✓；
3. **P0-3 编排持久化** ✓——**工程量最大 ✓（要接 IndexedDB 与工程包 ✓），但它决定"人类能否不丢心血" ✓；
4. **P1-1 导航** ✓——**先要业主在"改路由"与"接受代价"之间选 ✓**（**见上 ✓**）。

---

## 五、P0-1 的**修法设计**（已读到可以直接动手，尚未实现 ✓）

**为什么这轮只写到设计** ✗✓：**它是一条**多文件的实时音频**改动 ✓**（引擎 ✓ → 播放器 ✓ → 判据 ✓），**而本轮上下文已接近极限 ✓**；**本会话的教训是"做一半比不做更糟"** ✓（**留红树不可接受 ✓**）。**而下面的每一步都有**已量到的出处**，所以下一次不必重新勘探 ✓✓。**

### 已量到的**四个使能事实** ✓✓

1. **`scheduleSamplerSteps` 本来就接受起播时刻** ✓✓：**`samplerSteps.ts:109`** `const startSeconds = input.startSeconds ?? input.context.currentTime;` ✓、**`:122`** `whenSeconds: startSeconds + event.step * stepSeconds` ✓ —— **⇒ "把下一遍排在未来某刻"不需要新能力 ✓，只需要把时刻传进去 ✓**；
2. **引擎已有回调这套缝** ✓：**`AudioEngine.ts:321`** `private onDroppedStepsCallback?: …` ✓、**`:353`** 由构造选项设 ✓、**`:1884`** 在事件处调 ✓ —— **照它加一个即可 ✓**；
3. **wrap 发生在调度循环里、且**静默**** ✗✓：**`AudioEngine.ts:1898-1903`** ✓
   ```ts
   } else if (this.loopRange) {
     const [lStart, lEnd] = this.loopRange;
     if (step < lStart || step >= lEnd) { step = lStart; this.currentStep = lStart; }   // ← 无任何通知 ✗
   ```
   **⇒ 这里的 `this.nextStepTime` **就是**下一遍第一步将被排到的时刻 ✓**——**所以它正是要传给采样调度器的 `startSeconds` ✓✓**；
4. **采样排程只有一次调用** ✓：**`playerFromEngine.ts:249`**（`planSamplerSteps` ✓）与 **`:262`**（`scheduleSamplerSteps` ✓），**都在 `play()` 内 ✓**；**而 `:261` 的 `sampler` loader 是**局部变量** ✗** → **⇒ 要重排，必须把它留到闭包里 ✓**（**它已经在闭包作用域内 ✓，只是出了 `if` 就没人持有 ✓**）。

### 要改的三处（**按依赖顺序** ✓）

1. **`AudioEngine`** ✓：**加 `private onLoopWrapCallback?: (wrapTimeSeconds: number) => void;`** ✓ + **一个公开 setter** ✓（**`playerFromEngine` 拿到的是**已构造的** engine ✗，构造选项到不了它 ✓**）+ **在上面的 wrap 分支里 `this.onLoopWrapCallback?.(this.nextStepTime)`** ✓（**只对 `loopRange` 那条触发 ✓；预览作用域那条是另一个功能 ✓，不动 ✓**）；
2. **`playerFromEngine`** ✓：**`EngineAudioTap` 加 `setLoopWrapHandler?: (handler: ((t: number) => void) | null) => void;`** ✓（**与 `setPattern?`／`setBpm?` 同为可选 ✓**）；**在 `play()` 里把 `sampler` 与 `samplerSteps` 提到 `if` 之外持有 ✓**，**首遍排完后注册处理器 ✓**：**收到 wrap 时刻就以 `startSeconds: t` 重排一遍 ✓**（**并把新 voices 推进 `scheduled` ✓，`stopScheduled()` 才能一起静音 ✓**）；**`stop` 时把处理器置空 ✓**；
3. **判据** ✓：**台架已经是干净的 `vi.fn()` 集合** ✓（`playerFromEngine.test.ts:16-21` ✓）——**加 `setLoopWrapHandler: vi.fn()` ✓，从 mock 里取出处理器 ✓，调用它并断言**第二次** `loadNote`／调度发生 ✓，**且用的是传入的那个时刻** ✓**。**反向**：**不注册处理器（或引擎不调它）时，第二遍不得发生 ✓** ✓✓。

### 一条诚实的保留 ✗✓

**引擎在排序时会再加 `swingOffset` 与 `latencyCompensationMs`** ✓（`AudioEngine.ts:1908-1910` ✓），**而第一遍的采样排程**没加**这两项 ✓**（`:109` 只看 `currentTime` ✓）**。**⇒ 所以"采样与合成器在同一格上"这件事，第一遍就已经是**近似**的 ✗**——**本修法**不改变**这个既有近似 ✓，**但也不该假装它不存在 ✓**：**要么下一遍与第一遍保持同一套近似（一致 ✓），要么把两者一起对准（更大的改动 ✓，需单独量 ✓）。**

---

## 六、P1-1 的**实测结论与可行方案**（改动已回退，原因写在下面 ✓）

### 量到的四件事 ✓✓

1. **`useRouter()` **无 Provider 就抛异常**** ✗✓：**`Error: useRouter must be used within a RouterProvider`** ✓——**而 header 的判据只包了 `LanguageProvider`** ✓（`headerNav.test.tsx:10` 的 `renderWithLanguage` ✓）→ **⇒ 在 `Header` 里直接用 `useRouter()` 会让一批 header 判据**在 `LanguageProvider` 处炸掉**** ✗✓✓；
2. **`App.tsx:75` 本来就有 `const { route, navigate } = useRouter()`** ✓✓——**⇒ 路由能力**在 App 层是现成的**** ✓；
3. **Provider **监听 `popstate` 与 `hashchange`** ✓（`router.tsx:326-327` ✓）**——**⇒ 存在一条**不需要 hook**的路由切换通路 ✓；
4. **`projectDb` 是**手动保存**** ✗✓：`saveProject` 的调用者是 `useProjectHub` 与 `useExportActions` ✓，**没有"每次改动自动存"** ✓ —— **⇒ 整页重载**连工作室未保存的改动也会丢**** ✓，**P1-1 的严重性高于报告原文 ✓**。

### 三条可行路线（按我推荐的次序 ✓）

| | 做法 | 利 | 弊 |
| --- | --- | --- | --- |
| **A′（推荐）** | **`Header` 加一个可选 prop `onNewProject?: () => void`** ✓；**由 `App` 传入 `() => navigate({ tab: "studio", newProject: true })`** ✓（**`App` 已有 `navigate` ✓**）；**没有 prop 时锚点保持原生行为** ✓ | **组件不依赖 router ✓ → header 判据一行不用改 ✓✓**；**有 prop 时零重载 ✓**；**语义与可测性都干净 ✓** | **要找到 App 里渲染 `<Header>` 的那一处并接线 ✓**（**我未核实它是否直接在 `App.tsx` 里 ✗**） |
| **A″** | **`Header` 不取 hook ✓，改用 `formatRouteToUrl`（`router.tsx:236` ✓）＋ `history.pushState` ＋ 派发 `popstate`** ✓ | **无需 Provider、无需 prop ✓**；**复用路由自己的 URL 格式化 ✓**；**走的是 Provider 已在监听的那条通路 ✓** | **⚠️ 手写"导航"这一步 ✗**——**与 Provider 内部那套有**两处定义**的风险 ✓**；**`RouteState` 的必填字段要凑齐 ✗** |
| **A‴** | **保留 `useRouter()`，并把各 header 判据包上 `RouterProvider`** ✓ | **组件写法最直白 ✓**；**判据更贴近真实挂载 ✓** | **要改的不止两个文件 ✗**（**我只核实了 `headerNav` 与 `headerPhoneSurface` ✓，而后者用的是**另一种包裹写法** ✗**）——**⇒ 波及面未知 ✓，而我上一轮就是在"波及面未知"时动手，结果把树弄红了 ✗✓** |

### 我做了什么、没做什么（诚实记录 ✓）

* **我按 A‴ 动了手** ✗：**`Header` 接 `useRouter()` ✓、加拦截 ✓、写判据 ✓、修 `headerNav.test.tsx` 的包裹 ✓**——**而 `headerPhoneSurface.test.tsx` 的包裹写法不同 ✓，`useRouter` 仍在那里抛 ✓**，**树变红 ✗**；
* **⇒ 我**整体回退了**（`Header.tsx` ✓、`headerNav.test.tsx` ✓、删掉那条判据 ✓）** ✓✓——**理由是本会话那条规矩：留一棵红树不可接受 ✓**；**判据内容已写进本文档 ✓，下次直接取用 ✓**；
* **⚠️ 而这次失败本身是一条可复用的教训** ✓✓：**"组件新增一个上下文依赖"从来不是一行改动 ✓——它会把**所有**渲染该组件、只包了旧上下文的判据一起拖下水 ✓**；**A′ 之所以是我现在的首选，正是因为它让组件**不新增依赖** ✓✓（**能力从上层注入 ✓，而不是从上下文索取 ✓**）。

---

## 七、P0-2 的**修法已被确定**（含一处语义，量过才敢写 ✓）

**缺陷** ✓：`songFlatten.ts:174-181` 用 **`playable.every(bar => Array.isArray(track?.[name]))`** ✓——**任一可播小节的 clip 缺该数组，**整首歌都不建它**** ✗。

**⚠️ 而"缺的那个小节该填什么"是必须先量的语义** ✗✓——**填错就是另一种静音／错音 ✓**：

* **渲染器只认 `undefined`／`null` 为"用默认"** ✓✓：**`WavExporter.ts:1386`** —— `track.pitch[stepIdx] !== undefined && !== null ? … : <默认>` ✓；
* **⇒ `0` **不是**"无音高"** ✗——**它会被当成一个真实值用掉 ✓**（**`:2002` 的 `pitchOffset` 语义会把它变成一个怪音 ✓**）；
* **⭐ 而正确的形状**代码里已经有先例** ✓✓：**`songFlatten.ts:248`**（**`velocity` 那个例外**）—— **`(built.velocity as unknown[]).push(filled ? 100 : undefined);`** ✓✓。

**⇒ 因此修法是** ✓✓：

1. **`playable.every(…)` → `playable.some(…)`** ✓——**只要**有**一个小节提供该数组，就建它 ✓**；
2. **对**不提供**的小节，逐步填 `undefined`** ✓（**与 `velocity` 例外同形 ✓**），**而不是 0 ✗、也不是跳过该小节 ✗**；
3. **`velocity` 那条例外保持** ✓（**它另有 `filled` 的理由 ✓**），**并可顺带把 `every` 与 `filled` 两条路径统一成"some ＋ 逐步兜底"** ✓。

**判据（两个方向 ✓）**：**构造一首歌，第 1 小节的 clip 有 `pitch`、第 2 小节没有** ✓——
* **正向**：**展平后的轨道**必须有 `pitch` 数组** ✓，**且第 1 小节的音高**原样保留**** ✓、**第 2 小节对应步是 `undefined`** ✓；
* **反向**：**把 `some` 改回 `every`，它必须红** ✓（**且红的方式就是"数组整个没了" ✓——正是报告的缺陷 ✓**）。

**⚠️ 而这轮**没有实现** ✗✓**：**上面每一步都要改一处表达式 ＋ 写判据 ＋ 反向 ＋ 跑全套 ✓，而本轮上下文已尽 ✓**；**本会话的教训是"中途断掉留红树比不做更糟"** ✓。**⇒ 修法与语义都已量到，下一次直接照做 ✓✓。**

---

## 八、⚠️ P0-2 **不是纯 bug，而是设计意图之争**（本轮实测推翻了我上一轮的定性 ✓）

**上一轮我把它定性为"数据损坏"** ✗✓——**本轮动手时门禁给出了反证** ✓✓：**既有的 `songRender.test.ts:142` 就是**为这条行为写的判据** ✓**：

```ts
it("keeps an optional lane only when every contributing clip has it", () => {
  const withRatchet = clip(4, 4); (withRatchet.tracks[0] as …).ratchet = [2, 1, 1, 1];
  const withoutRatchet = clip(4, 4);
  … 两个各一小节的 section，一个带 ratchet、一个不带 …
```

**⇒ 三条推论** ✓✓：

1. **"缺一个就不建该数组"是**有意为之**** ✓，**而且**有判据守着**** ✓✓——**它并非无人看守的意外 ✓**；
2. **⇒ 因此把 `every` 改成 `some` **不是修 bug，是改设计**** ✗✓：**它会让那条既有判据变红 ✓（**这正是本轮发生的 ✓**）**，**而"翻掉一条陈述了设计意图的判据"必须由业主定 ✓✓**；
3. **⚠️ 而报告与代码的分歧其实是**语义**之争** ✓：**报告认为"一个小节缺字段就丢全曲"是数据损坏 ✓；代码认为"这个数组要么整首可信、要么整首不建" ✓**——**两者都说得通 ✓，而**选哪边是产品决定** ✓✓**（**例如：`ratchet` 丢掉可能无害 ✓，而 `pitch` 丢掉会毁掉旋律 ✗——**所以答案甚至可能**逐数组不同**** ✓✓）**。

### 本轮实测到的三条红（**门禁挡住了提交 ✓✓**）

| 判据 | 性质 |
| --- | --- |
| **`songRender.test.ts:142`** "keeps an optional lane only when every contributing clip has it" | ⭐ **它陈述的就是当前设计意图 ✓**——**改行为必须同时改它 ✓，而那要业主点头 ✓** |
| **`mobileApp.test.tsx` ×2**（"renders the requested module and not the previous one" ✓、"keeps naming the last genre after the transport stops" ✓） | ⚠️ **未解释的反向耦合 ✗✓**——**它们在本轮之前是绿的 ✓**（`8f1e89d` 那次全套 4319 通过 ✓）**，所以改 `songFlatten` 会经由**手机壳**的渲染显现出来 ✓**；**⇒ 动 P0-2 之前必须先诊断这两条 ✓** |

**⇒ 处置** ✓✓：**代码**整体回退** ✓（**树回到与 `dev` 一致 ✓**），**判据的两条内容（正向与反向）都记在上面 ✓**——**下次不必重新发现 ✓**。

**⚠️ 而本轮**唯一**产出的可交付物是这条定性更正** ✓✓：**外部审计的 P0-2 里有**一半**成立 ✓（**缺陷描述与行为一致 ✓**）**、**另一半不成立**** ✗（**它不是无人看守的 bug ✓，而是有判据的设计 ✓**）**——**这正是本会话那条规矩的价值：**先核后做 ✓；"外部意见里也有被测量推翻的 ✓"** ✓。

---

## 九、业主指令：**砍掉手机版本**（2026-10-02，逐字 ✓）

> **"全部砍掉手机版本可以新建一个分支，以后手机版本要更新和维护就在那边做好了。然后其它库直接砍掉手机版本"** ✓

### 已做（**先保后砍 ✓**）

* **保全分支已建并推到远端** ✓✓：**`mobile-preserved` @ `29e37f6`** ✓——`git ls-remote` 已核验 ✓（`refs/heads/mobile-preserved` ✓）。**⇒ 手机版本从此在那边可查、可维护 ✓**；**这是整件事里唯一不可逆的一步，所以先做 ✓**。

### 待做：**砍法要先定，因为它不是删一个目录 ✗**

**手机专属的文件（初判 ✓）**：`src/components/MobileTabBar.tsx` ✓、`src/components/MobileMoreSheet.tsx` ✓、`src/components/MobileStudioSheet.tsx` ✓（**另有 `MobileJamScreen` 待确认 ✓**）。

**而它是**横切**的（这是难处 ✓）**：

| 牵连处 | 为什么难 |
| --- | --- |
| **`src/App.tsx`** | **手机外壳、`mobileSheetOpen`、`<MobileMoreSheet>`、短路横屏分支 ✓** |
| **`src/components/Header.tsx`** | **`isMobile` 分支 ＋ 手机专用的"sections"入口 ✓**（**`:51-59` 的注释解释了它为何存在 ✓**） |
| **`src/hooks/useDeviceCapabilities.ts`** | **`isMobile` 的来源 ✓**——**它同时被非手机逻辑用吗 ✗（待查 ✓）** |
| **≥10 个判据** | **`mobileApp.test.tsx`（60 条 ✓）、`mobileBottomControlBar` ✓、`mobileChallenge` ✓、`mobileExplore` ✓、`mobileGenrePicker` ✓、`headerPhoneSurface` ✓、`iosAudioUnlock` ✓、`audioStartGate` ✓…** |

**⇒ 砍法有三种，先定哪一种** ✓：

1. **删净** ✓：**删组件 ＋ 删判据 ＋ 拆 `isMobile` 分支**——**最彻底 ✓，但改动面最大 ✓**；
2. **只砍入口** ✓：**保留组件与能力，去掉手机外壳／入口**——**改动小 ✓，但会留下无人的代码 ✗**（**本项目不喜欢死代码 ✓**）；
3. **编译期剔除** ✗：**留一份手机代码、按构建目标剔除**——**维护成本最高 ✓，与"以后在分支上维护"矛盾 ✗**。

**⇒ 我倾向 (1) 删净** ✓——**理由正是业主那句"以后手机版本要更新和维护就在那边做" ✓：主线上不该再留手机的分叉 ✗，否则两边会漂移 ✓✓**；**而执行前必须先读 `ARCHITECTURE_SURFACES.md` ✓，因为那是本项目定义"面"的地方 ✓**。

### ⚠️ **"其它库"这句我没有执行** ✗✓✓——**我按猜的做会毁掉别人的工作 ✓**

**同级目录** ✓：`groove/` ✓、`groove-wt25/` ✓、`groove-wt44/` ✓、`groove-wt45/` ✓、`groove-wt46/` ✓、`groove-wt47/` ✓、`synth/`（**GS-1 自己的库 ✓**）、`midi-corpus/` ✓、`void/` ✓、`release/` ✓。**它们各自有独立历史与可能未合并的工作 ✓** ⇒ **"直接砍掉"在这句里指的是**哪几个**、**是否也要先各建保全分支** ✗，**我没有凭猜执行 ✓**；**这一步需要一句明确的范围 ✓✓**。

### 九之二、**删净手机的精确清单**（量到可直接执行 ✓）

**关键发现** ✓✓：**手机版本有自己的家 —— `src/mobile/`** ✓，**入口是**懒加载**的** ✓（`App.tsx:66` `React.lazy(() => import("./mobile/MobileApp"))` ✓）**——所以它不是散落的 ✓，而是一棵树 ＋ 若干接线点 ✓✓**。

**要删的树** ✓：`src/mobile/`（**`MobileApp.tsx` ✓、`MobileModuleTabBar.tsx` ✓、`MobileGenrePicker.tsx` ✓、`MobilePlayerBar.tsx` ✓、`LightPlayerToggle.tsx` ✓、`screens/` ✓、`mobileModules.ts` ✓、`genreArt.ts` ✓、`genreQuery.ts` ✓、`mobileGenreData.ts` ✓、`mobile.css` ✓、`legacyViews.css` ✓、`SkinPic…` ✓**）。

**要拆的接线点** ✓（**每条都有行号 ✓**）：

| 文件 | 位置 | 处理 |
| --- | --- | --- |
| **`src/App.tsx`** | `:31-33` 三个 import ✓、`:66` 懒加载 MobileApp ✓、`:68` `shouldEnterPhoneShell` ✓、`:86` `isMobile/isShortLandscape` ✓、`:130` 依赖 ✓、`:222` `mobileSheetOpen` ✓、`:233` `hasFixedTabBar` ✓、`:248` `mobileTabBar` ✓ | **删分支与状态 ✓，保留桌面路径 ✓** |
| **`src/app/router.tsx`** | **引用了 `mobile/`** ✓（**`route.mobile` ✓**） | **决定 `route.mobile` 是留还是删 ✗（`shouldEnterPhoneShell` 的输入 ✓）** |
| **`src/components/GenreCover.tsx`** | **引用了 `mobile/genreArt` 等** ✓ | **把共用部分上移或保留 ✓——⚠️ 它不是手机专属 ✗** |
| **`src/components/arrangement/ArrangementPanel.tsx`** | 同上 ✓ | ⚠️ **同样不是手机专属 ✗** |
| **`src/platform/surf…`** | **引用了 `mobile/`** ✓ | **与"面"有关 ✓——**⚠️ 但 `ARCHITECTURE_SURFACES.md` 里**没有**手机字样 ✓**，**所以以代码为准 ✓** |

**要删的判据** ✓（**17 个 ✓**）：`mobileApp` ✓、`mobileBottomControlBar` ✓、`mobileChallenge` ✓、`mobileExplore` ✓、`mobileGenrePicker` ✓、`mobileIndexGuard` ✓、`mobileJam` ✓、`mobileMore` ✓、`mobilePlayerPort` ✓、`mobileSharedBottomRow` ✓、`mobileShell` ✓、`mobileTransportBar` ✓、`headerPhoneSurface` ✓、`iosAudioUnlock` ✓、**以及需逐条判断的 `audioScheduler` ✓、`audioSettings` ✓、`audioStartGate` ✓、`studioSession` ✓**（**⚠️ 后四个名字里没有手机，可能同时覆盖桌面 ✗——**删之前必须逐个看它测的是不是手机独有的东西 ✓**）。

**⇒ 执行顺序（下一次照做 ✓）**：**① 删 `src/mobile/` ✓ → ② 拆 `App.tsx` 的分支与状态 ✓ → ③ 处理三个引用了 `mobile/` 的**非手机**文件 ✓（**共用逻辑上移 ✓**）→ ④ 逐个判据：手机专属删 ✓、共用的改写 ✓ → ⑤ `npm run typecheck` ＋ `lint` ＋ 全套门禁 ✓ → ⑥ 提交 ✓**。

**⚠️ 而本轮**没有动手** ✗✓**：**这是一棵目录树 ＋ 八个接线点 ＋ 十七个判据 ✓，而本轮上下文已尽 ✓**；**"半个删除"必然留下**编译不过**的树 ✗——比不做更糟 ✓。**清单已量到可直接执行 ✓✓。**

### 九之三、⚠️ **更正上一节的判据清单**（我上一轮把它列宽了 ✗✓✓）

**上一节写"以及需逐条判断的 `audioScheduler`／`audioSettings`／`audioStartGate`／`studioSession`"** ✓——**逐一量过之后** ✓：

| 判据 | 对 `mobile` 的引用 | 结论 |
| --- | --- | --- |
| **`audioScheduler`** | **0** ✓ | **不得删** ✗✓——**它不是手机的 ✓** |
| **`audioSettings`** | **0** ✓ | **不得删** ✗✓ |
| **`audioStartGate`** | **0** ✓ | **不得删** ✗✓ |
| **`studioSession`** | **1**（待细看 ✓） | **需看那一处是不是手机专属 ✓** |

**⇒ 这三个是我上一轮用**文件名**筛出来的**误收**** ✗✓✓（`ls | grep -iE "mobile|phone|touch|ios"` ✓）**——**而"误收进删除清单"正是我上一节自己警告过的危险：**删掉一个覆盖两面的判据会静默丢掉桌面侧的覆盖 ✓**。**⇒ 更正：删净的判据是**13 个真正手机命名的** ✓**（`mobileApp` ✓、`mobileBottomControlBar` ✓、`mobileChallenge` ✓、`mobileExplore` ✓、`mobileGenrePicker` ✓、`mobileIndexGuard` ✓、`mobileJam` ✓、`mobileMore` ✓、`mobilePlayerPort` ✓、`mobileSharedBottomRow` ✓、`mobileShell` ✓、`mobileTransportBar` ✓、`headerPhoneSurface` ✓、`iosAudioUnlock` ✓——**共 14 个，其中 `iosAudioUnlock` 需确认它测的是不是仅 iOS 解锁 ✓**），**而 `audioScheduler`／`audioSettings`／`audioStartGate` **留下** ✓✓**。

**⚠️ 而这正是"清单也要被测量"的又一例** ✓：**一条靠名字生成的清单，会**多删**（本节 ✓）也会**少删**（无处可查 ✗）——**⇒ 删之前逐条量引用，而不是逐条看名字 ✓✓**。
