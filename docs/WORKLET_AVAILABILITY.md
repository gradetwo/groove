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
