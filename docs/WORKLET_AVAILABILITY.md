# 这台 Linux 上的 Chromium 没有 `audioWorklet`（2026-10-01，三方独立测量）

## 事实

在离线上下文里，`OfflineAudioContext` 存在，但 **`ctx.audioWorklet` 是 `undefined`** ✗：

```
headless-shell:   offlineCtx="function"   audioWorklet="undefined"   addModule 不可达
chromium-channel: offlineCtx="function"   audioWorklet="undefined"   addModule 不可达
```

三次独立测量一致 ✓：一位 agent 在 `chrome-headless-shell` 与完整 `channel: chromium` 两处各测一次 ✓；我在同一台机器上用另写的最小页面复测一次 ✓（两次运行都是 `audioWorklet === "undefined"` ✓，UA 为 Linux x86_64 ✓）。**没有**在任何一次测量里看到 worklet 可用 ✓。

## 它意味着什么（两条后果，都是正确性而不只是性能）

1. **GS-1 从不装配 WASM host** ✗。`src/audio/WavExporter.ts` 的门是
   `gs1Available && typeof ctx.audioWorklet?.addModule === "function"` ✓ —— 在这台机器上第二项为假 ✗，于是 **chords / lead 由原生引擎发声** ✓，而不是 GS-1 ✗。**本服务器在 Linux 上产出的每一次渲染都如此** ✗。
2. **限幅器永远走 `DynamicsCompressor` 回退** ✗ —— 没有真峰值上限 ✓、没有前瞻 ✓。也就是说交付文件里的 ceiling 不是我们在别处声称的那个 ✓。

**并且是静默的** ✗✓：回复里没有任何字段说"这次没有 worklet" ✓。这正是本项目最忌讳的形状 ✓（**"ok 却做了另一件事"** ✗）。

## 它顺带解释了两件旧事

* **渲染 SLO / "worker hang"**（用户报告 P0-2 ✗）：同一位 agent 实测 1 小节 8 轨的 `renderPatternOffline` 渲染 **17.18 s 音频用了 ~18–28 s 墙钟 = 0.6–0.9× 实时** ✗；**同一浏览器里不含应用代码的对照图**（4 个振荡器）**0.23 s = 75× 实时** ✓ → **瓶颈不是浏览器，是这张图** ✓。真实离线图 1 小节就有 **196 个节点** ✓（123 Gain / 36 Biquad / 13 DynamicsCompressor / 10 WaveShaper / 8 Panner / 3 Delay / 1 Convolver ✓）；同规模合成图 3.3 s ✓、1000 个 gain 14.1 s ✓，而 **1.8 秒卷积混响单独只要 0.045 s** ✓ → **"卷积混响是主因"被实测否定** ✗✓。
* **"两个宿主不是同一个声音"** ✗（headless parity 探针的最差频段 1.34 dB / 响度 1.89 LU ✓）：若浏览器侧**根本没有 worklet** ✗，那它比的是**两张不同的图** ✗（限幅器回退 ✓ + 每条 GS-1 轨走原生 ✓），而不是同一个图在两个宿主里 ✓。探针那位已被要求**先自验这条** ✓，再决定是重新界定判据（无 worklet 对无 worklet ✓），还是先让浏览器能有 worklet ✓（换 channel / 换 flag / 换版本，都要说明）✓。

## 必须做、但还没做的一步（排队中，附理由）

**渲染器要报告"本次没有 worklet"** ✗✓——理由是它现在**静默地**换掉了合成器层与限幅器 ✓。判据应当是：回复里带一个明确的字段/问题（例如 worklet 不可用、因此限幅器为回退、GS-1 未装配 ✓），并且调用方能据此区分"我听到的是 GS-1"与"我听到的是原生回退" ✓✓。

**为什么此刻没做** ✗：`fix-headless-silence` 正在改 `src/audio/*` 与 `mcp/render/worker.ts` ✓，而本项目已经因为两个写者同改一个文件返工过不止一次 ✓。**排队，等它落地** ✓。

**为什么值得单独立档** ✓：这条事实会被反复需要 ✓（渲染 SLO 的成因 ✓、parity 判据的前提 ✓、以及调用方对"我听到的是什么"的知情权 ✓），而它此前不在任何文档里 ✗。

---

## 附：同一台机器上的另一处泄漏——已完工的 MCP server 不回收它的浏览器（2026-10-01）

**实测** ✗：清理工作树时发现 **50 个**进程的 `cwd` 指向**已删除**的目录 ✓（`/proc/<pid>/cwd` 显示 `… (deleted)` ✓），其中包含一棵**已运行 3 小时 01 分**的 Chromium ✗✓。父进程是 `node …/groove-wt25/dist-mcp…` ✓ ——**一个几小时前就干完活、工作树已被删掉的 agent 留下的 MCP server** ✓。

**它为什么值得单独记** ✓：
* 这是**资源泄漏** ✓（笔记本上白耗 3 小时浏览器 ✓），也解释了这半天机器负载的一部分 ✓；
* 它和用户报告的 **P0-2「worker hang」** ✗ 是**同一族**问题 ✓：**渲染器起了浏览器，却没有任何一条路径保证把它关掉** ✗（agent 结束 ✓、worktree 被删 ✓、进程收到信号 ✓，都不回收 ✓）；
* **清理方式也要记** ✓：我第一版按 `pgrep -f chromium_headless` 取样 ✗，**只看到 4 个**（实际 50 个 ✗✓）；正确做法是**按 `/proc/*/cwd` 精确枚举**"指向已删目录"的进程 ✓✓——并且**绝不按 `chromium` 通配** ✗，否则会误伤正在干活的 agent 的浏览器 ✓。

**应采取的第一步**（排队 ✓，理由同下）：渲染 worker 在**退出/信号**时关闭浏览器 ✓，并且探针脚本**自带超时** ✓；判据 = 启动一次渲染、杀掉父进程后，**不残留**浏览器进程 ✓（本会话已经证明这条现在是假的 ✗）。

**为什么此刻不改** ✗：`fix-headless-silence` 正在改 `mcp/render/worker.ts` 与 `src/audio/*` ✓；**两个写者同改一个文件**在本项目已经返工过不止一次 ✓✓。**排队，等它落地** ✓。

---

## 交叉含义：这份事实让"只要 GS-1 专用 server"从备选变成**需要的**（2026-10-01）

`docs/RUST_DECISION.md §七` 写过：Rust 路线**继续推后**，它变正确的条件是"**只要 GS-1 专用 server**"或"**决定整引擎移植**" ✓。当时把前者当作**备选** ✓。

**这份笔记的事实把它变成了后者的替代品** ✓：

* 浏览器侧**没有 `audioWorklet`** ✗ → **GS-1 在任何一次 Linux 渲染里都没有装配** ✗（原生引擎顶替 ✓）；
* `crates/synth-core` **就是 wasm 的同一份源码** ✓（`examples/probe.rs` 能离线渲染、不需要音频设备 ✓，`cargo build --release --frozen` 实测 **8.22 s** ✓）→ 一个**只做 GS-1 的 Rust server** 与浏览器共享**同一份 DSP** ✓✓，满足 §四/§八 的"**共享物唯一**" ✓；
* 而"**整引擎移植**"这条**不需要**走 ✓——它撞在"Rust 渲染不了整 pattern"✗（`GS1_ROUTED_ROLES` 只有 chords/lead，pattern 有 8 条轨 ✓）上，会迫使我们把 kick/bass/效果/母带**用 Rust 再写一遍** ✗，那正是要避免的 ✓。

**于是"GS-1 专用 server"的形状是** ✓：输入是**一条轨的 patch code + 音符**（不是整 pattern ✓）→ 用 `synth-core` 离线渲染出该轨的音频 ✓ → 由现有渲染器把它当作一条 lane 的元素混入 ✓。**边界窄** ✓（一个 server、一种输入 ✓）、**判据现成** ✓（与浏览器图里 GS-1 应产生的输出**逐样本一致** ✓；若浏览器在这台机器上给不出 GS-1 ✓，则判据改为与 **synth 项目自己的参考渲染**一致 ✓，并把"浏览器早已无法产生 GS-1"这一条同时记录 ✓）。

**排队，不现在做** ✗，理由有二 ✓：① 渲染剖析（`measure-render-profile` ✓）正在给"整图成本"而不是"GS-1 成本"的答案 ✓，它决定该优化的是**节点数**还是这条支路 ✓；② `mcp/render/worker.ts` 正被 `fix-headless-silence` 占用 ✓（同文件不并发 ✓）。
