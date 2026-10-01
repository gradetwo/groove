# `audioWorklet` 与 **secure context**：一份更正（2026-10-01）

## 更正先行：我此前写进本文档的结论是**错的** ✗

我在 2026-10-01 写下过"这台 Linux 的 Chromium 没有 `OfflineAudioContext.audioWorklet`，因此**每一次 Linux 渲染都没有 GS-1、限幅器一直走回退**"✗。**这条不成立** ✗✓。

**实测（同一个 Playwright Chromium，chromium-1243，HeadlessChrome/153.0.8010.12；判据是 `ctx.audioWorklet`、`addModule`，以及一次真实的 blob worklet 渲染）** ✓：

| origin | `isSecureContext` | `ctx.audioWorklet` | `addModule` | 真实 worklet 渲染 |
| --- | --- | --- | --- | --- |
| `about:blank` | **false** | `undefined` | 无 | 不可用 |
| **`http://127.0.0.1:<port>`** | **true** | `object` | `function` | **ok，渲染 1280 帧** |
| `http://192.168.100.207:<port>`（同一台服务器，局域网 IP） | false | `undefined` | 无 | 不可用 |

`AudioWorklet` **只在 secure context 暴露** ✓；`localhost` 与 `127.0.0.1` 属于 potentially trustworthy ✓，纯 HTTP 的**局域网 IP 与普通主机名不属于** ✓。而 **`mcp/render/worker.ts` 起的是 `http://127.0.0.1:<free port>`** ✓✓ → **这个服务器的渲染一直有限幅器 worklet 与 GS-1 host** ✓。

## 我的探针为什么会测错（值得记，因为很容易重犯 ✗）

我的复测脚本第一句是 `page.goto("about:blank")` ✗，然后在那个页面里求值 ✓——**`about:blank` 不是 secure context** ✗，于是 `audioWorklet` 是 `undefined` ✓，而我把这个结果**概括成了"这台 Chromium 没有它"** ✗✗。**错在把"某个 origin 的属性"当成了"浏览器的能力"** ✓。

**还有一个会让下一个人看反的细节** ✓✓：在 **secure** origin 上，`OfflineAudioContext.prototype.audioWorklet` **不是 `undefined`**，而是**从 `BaseAudioContext.prototype` 继承来的 accessor** ✓——直接对它求值会抛 `TypeError: Illegal invocation`（getter 的 `this` 是 prototype ✓）。**所以"抛 Illegal invocation"与"undefined"是两种不同的结果** ✗✓：前者说明**存在** ✓，后者才是缺失 ✓。第一版探针正是抛了这个异常 ✓——**那反而是属性存在的证据** ✓。

## 真正的产品事实（修正后）

**从非 secure origin 打开的页面会静默失去真峰值限幅与 GS-1** ✗✓：用 `http://<局域网 IP>:3000` ✓ 或任何非 HTTPS 主机名打开本应用 ✓，`chords`/`lead` 落到原生引擎 ✓、母带落到 `DynamicsCompressor` 回退 ✓，而**界面此前说的是另一个故事** ✗✓（"限幅器未能加载，再导出一次" ✓——对非 secure origin **重试无用** ✗）；**现已改正** ✓✓（导出面新增 `workletsUnavailable` ✓ + i18n `export_wav_no_worklets` ✓，排在 GS-1/limiter 之前 ✓）。**MCP 服务器不受影响** ✓（它跑在 `127.0.0.1` ✓）。

**判据（探针自报，不再靠假设）** ✓：每次运行打印服务页面的能力 ✓（`origin` ✓ `secure` ✓ `baseProtoAudioWorklet=present` ✓ `ctx.audioWorklet=object` ✓ `addModule=function` ✓ `AudioWorkletNode=function` ✓）与 `browser worklet evidence: limiterKind=worklet` ✓；并新增两条检查：**两边都必须有 offline AudioWorklet** ✓、**limiter 路径必须一致** ✓；任一条不成立即 FAIL ✓，比较不再成立 ✓。GS-1 在场 guard 在浏览器里实测 **11.04 dB** ✓（没有 host 时"ON"会等于"OFF" ✓，不可能有 11 dB ✓）。

## 随之**撤回**的两条推论 ✗

1. **"headless parity 的 1.34 dB / 1.89 LU 是配置差而非宿主差"** ✗——**撤回** ✓。既然浏览器侧一直有 worklet ✓，探针比的就是**两张同形的图** ✓，那么宿主的差异仍然真实存在 ✓✓（具名原语不变：`DynamicsCompressorNode` 为主 ✓、`OscillatorNode` 的 saw/square 带限为次 ✓）。
2. **"静音缺陷在浏览器侧也出现"** ✗——**撤回** ✓（由该探针作者自己提出 ✓）：它为了记录"浏览器加载了哪些 worklet 模块"给 `window.OfflineAudioContext` 装过**构造器包装** ✗，装它的一次运行出现了整段静音 ✓，**去掉包装后运行干净** ✓。**干净观察里整段静音只在 Node 宿主出现** ✓，且由**未装任何包装**的 `probe_render_repeats.ts` 测出 ✓（**串行 0/64** ✓、**8 路并发 2/48** ✓、**6 路并发 1/24** ✓，静音都落在每进程第 0 轮 ✓）。探针此后**不再做任何会改动图的插桩** ✓，只做只读探测 ✓。

## 仍然成立的部分 ✓

**Node 宿主间歇性整段静音** ✗ 依旧是采用无头路径的**阻断项** ✓（成因定位到阶段：两条母带 worklet 异步换装 ✗，而渲染只 `await limiter.ready`、**从不 await `busComp.ready`** ✗，`MasterGraph` 也未暴露后者 ✓）；渲染器现在**识别、重试、并在四次都静音时抛错而不是交出零缓冲** ✓，恢复时会写进 `problems` ✓。**产品层仍欠一条**：**渲染器要报告"本次没有 worklet"** ✗（面向非 secure origin 的页面 ✓）——排队中 ✓，理由见下 ✓。

## 附：同一台机器上的另一处泄漏——已完工的 MCP server 不回收它的浏览器（2026-10-01）

**实测** ✗：清理工作树时发现 **50 个**进程的 `cwd` 指向**已删除**的目录 ✓（`/proc/<pid>/cwd` 显示 `… (deleted)` ✓），其中包含一棵**已运行 3 小时 01 分**的 Chromium ✗✓。父进程是 `node …/groove-wt25/dist-mcp…` ✓——**一个几小时前干完活、工作树已被删掉的 agent 留下的 MCP server** ✓。

**它与用户报告的 P0-2「worker hang」同族** ✓：渲染器起了浏览器，**却没有任何一条路径保证把它关掉** ✗（agent 结束 ✓、worktree 被删 ✓、进程收到信号 ✓，都不回收 ✓）。**排队项** ✓：worker 在**退出/信号**时关闭浏览器 ✓ + 探针**自带超时** ✓；判据 = **杀掉父进程后不残留浏览器** ✓（本会话已证明现在是假的 ✗）。

**清理方式也记下来** ✓（因为我的第一版是错的 ✗）：`pgrep -f chromium_headless` **只看到 4 个，实际 50 个** ✗✓；**按 `/proc/*/cwd` 找"指向已删目录"** 才全部找到 ✓，而且**它同时就是安全的过滤器** ✓✓（按名字通配会杀掉正在干活 agent 的浏览器 ✗）。

**两个排队项都不现在做** ✗：`mcp/render/worker.ts` 正被另一条分支占用 ✓（两个写者同改一个文件在本项目已返工多次 ✓）。

## 两个排队项已完工（本次改动，`fix-worker-honesty`）

**1. 渲染器自报"本次没有 worklet"** ✓。检查读的是**渲染真正使用的那个 context** 的 `audioWorklet`（`WavExporter.offlineWorkletsAvailable`），缺它时把 `WORKLETS_UNAVAILABLE_PROBLEM` 放进 `problems` ✓，经 `mcp/render/worker.ts` 已有的 `onProblems` 进入 `RenderResult.problems` ✓；app 的导出（WAV / MP3 / stems）也带出 `workletsUnavailable`，并给出与"模块加载失败"**不同**的提示 ✓（原来的 `limiterKind === "fallback"` 提示会让人重试，而非 secure origin 重试无用 ✓）。**判据是两半，实测** ✓（`node scripts/probe_worklet_surfaces.mjs`）：

```
127.0.0.1        secure=true  ctx.audioWorklet=object    limiterKind=worklet   problems=[]
192.168.100.207  secure=false ctx.audioWorklet=undefined limiterKind=fallback  problems=["the render ran without audio worklets: …"]
```

**2. 浏览器回收** ✓。`installRendererLifecycle()`（`mcp/render/worker.ts`，`mcp/server.ts` 调用）在 **stdin EOF / SIGINT / SIGTERM** 上 `await browser.close()` ✓，`process.on("exit")` 只做同步的那件事——杀 Vite 子进程 ✓（exit 不能 await，浏览器靠 Playwright 管道随进程关闭 ✓）。判据探针 `node scripts/probe_browser_reaping.mjs --mode=stdin|signal|kill` ✓：

```
stdin : server exited, browser processes left behind: 0 (was 7)
signal: server exited, browser processes left behind: 0 (was 7)
kill  : server exited, browser processes left behind: 0 (was 7)
```

把 `installRendererLifecycle()` 临时注释掉后同一条探针复现原缺陷 ✓：**server 30s 后仍活着、7 个 Chromium 全部留下** ✓——本会话第一次证明这条判据此前是假的 ✓。

**仍欠一条**：`render_arrangement_stems` 的 MCP 回复（`mcp/render/worker.ts` 的 `renderStems`）没有 `problems` 字段，因此这条起源事实只到 app 的 stems 导出，不到 stems 的 MCP 回复 ✗。

---

## 业主动作（已尝试，证据充分，需要你的权限）：给 `groove` 桶加 CORS 策略（2026-10-01）

**这是头号阻塞的真正开关** ✓：镜像 `r2mirror.groove.wangda.today` **返回 200 但不发 `access-control-allow-origin`** ✗，所以**任何浏览器**都拿不到它的对象 ✓（`curl` 能拿到 ✓——这正是"Muse 看到 Failed to fetch 而 curl 200"的全部原因 ✓✓）。GitHub 源同一文件**有** `access-control-allow-origin: *` ✓，所以浏览器只认 GitHub 源 ✓。

**我已尝试用现有凭据直接设置** ✓（纯标准库 SigV4 `PUT /groove?cors` ✓），结果：

```
PUT ?cors → HTTP 403 AccessDenied
（不是 SignatureDoesNotMatch —— 即认证通过、授权不足 ✗）
```

→ **当前 API token 有对象读写权限，但没有桶级 Admin 权限** ✗✓（R2 的 CORS 是桶级设置 ✓）。**我没有别的凭据，也不该去找** ✗，所以停在这里交给你 ✓。

**你要做的（任选其一）** ✓：
1. **Cloudflare 面板** ✓：R2 → 桶 `groove` → Settings → CORS Policy → 粘贴下面的策略；
2. **或**给一个 **Admin 权限** 的 R2 token ✓，我用同一条命令设置（命令与验证都已备好 ✓）。

```json
[{"AllowedOrigins":["*"],"AllowedMethods":["GET","HEAD"],"AllowedHeaders":["*"],"ExposeHeaders":["Content-Length","Content-Type"],"MaxAgeSeconds":86400}]
```

**判据（必须用这条，不能用"状态码 200"** ✗✓**）**：

```bash
curl -sI -H "Origin: http://127.0.0.1:3000" \
  https://r2mirror.groove.wangda.today/vsco2ce/BassoonStac.sfz | grep -i access-control
```

**必须打出 `access-control-allow-origin`** ✓——`200` 什么也不能证明 ✓✓（本仓库的 `docs/R2_UPLOAD.md` §2 早就要求这个头 ✓，而 §7 只核对了**数量与字节** ✗；**计数查不出"取不到"** ✗✓）。

**为什么风险低且可逆** ✓：只对 `GET`/`HEAD` 开 `*` ✓（对象本来就是公开的 CC0 采样 ✓、无需凭据 ✓），与 GitHub 源当前的行为一致 ✓；要撤销就是删掉该策略 ✓。

**一个把我自己坑了的小坑，记下来免得下一个人重犯** ✗✓：我第一次读 `.env.local` 用的正则是 `[A-Z_]+` ✓——**不含数字** ✗，于是 `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` **全部匹配失败** ✗✓（而 `VITE_SAMPLE_ROOT` 没有数字 ✓ 所以匹配了 ✓）。我的脚本因此打印"**缺少凭据**" ✗——**它指责的是文件，错的却是它自己的正则** ✓✓。改成 `[A-Z0-9_]+` 后凭据立刻就绪 ✓。

---

## 附：对"宿主静音"下一步的修正——总线压缩器的换装**不是**窗口（2026-10-01）

**背景** ✓：Node 宿主会间歇返回整段静音 ✗，已定位到"**两条母带 worklet 异步换装，而渲染只 `await limiter.ready`、从不 await `busComp.ready`**"这个阶段 ✓，文档里写的下一步就是"**把 `busComp.ready` 暴露出来一起 await**" ✓。我已把句柄**暴露**出来 ✓（无行为变化 ✓），但在写那句 `await` 之前**先测了一下那个窗口到底存不存在** ✗✓：

**测法** ✓（不改任何仓库文件 ✓）：用仓库自己的 `buildMasterGraph` ✓ + Node 宿主 ✓ 建图，**只 await `limiter.ready`**（正是渲染器今天做的事 ✓），然后**立刻**读 `busCompressorKind()` ✓：

```
run 1: limiter.ready=fallback (124 ms) | bus 在 limiter 就绪时=node | bus.ready=node (+0 ms)
run 2: limiter.ready=fallback ( 92 ms) | bus 在 limiter 就绪时=node | bus.ready=node (+0 ms)
run 3: limiter.ready=fallback ( 93 ms) | bus 在 limiter 就绪时=node | bus.ready=node (+0 ms)
```

**结论** ✓✓：**总线压缩器在 `limiter.ready` 返回时已经是 `node`** ✓，`bus.ready` **再花 0 ms** ✓，三次一致 ✓ → **它不构成窗口** ✗✓。因此"await busComp.ready"**很可能不是静音的解** ✗✓——这不是说它错 ✓（它更正确、也更对称 ✓），而是说**别指望它修掉静音** ✗✓。**根因仍在 `node-web-audio-api` 内部** ✓，静音症状已由渲染器**识别/重试/拒绝交零缓冲**兜住 ✓✓。

**我这支探针的局限，必须与上面的数字一起引用** ✗✓：它**没有装宿主 shim** ✓（把 `/limiterWorklet.js` 这类根相对 URL 映射到文件系统 ✓，正是无头计划里那约 60 行 ✓），所以**限幅器每次都回落到 `fallback`** ✗（124/92/93 ms 是它尝试后回落的时间 ✓）→ **本探针无法说明 worklet 限幅器的换装时序** ✗✓。真实探针装了 shim ✓，因此它能报 `limiterKind=worklet` ✓（见 `docs/HEADLESS_CORE_PLAN.md` §7 ✓）。

**顺带复现出库自己的一条宿主限制** ✓✓：`Setting the 'curve' property on 'WaveShaperNode' to 'null' is not supported yet` ✗——**Node 宿主不支持把波形整形曲线清成 null** ✓，而浏览器语义是**直通** ✓✓。另一位 agent 已用计数排除了它是 parity 的成因 ✓（`curve->null = 0` ✓：没有任何节点是"设过曲线再清掉"的 ✓），但它**仍是**一条会咬到"设了曲线又想旁路"的实现的宿主差异 ✓，记在这里备查 ✓。

---

## 附：**页面回收**——测量设备有，渲染器没有（2026-10-01，读代码 + 引已有实测）

**为什么查** ✓：业主的目标要求"长曲**不再先撞超时或进程寿命**" ✓。超时那条已交给 ① ✓；**进程寿命**这条我以为要自己从头量 ✗，查下去发现**本项目早就量过** ✓✓。

**已有的实测（在仓库里，不是我的）** ✓：
* `scripts/probe_render_repeatability.mjs` 的头注释：**"每页确定、页与页之间不同"** ✗——`alternative-rock` 在新页面是 **−12.71 LUFS**，在**渲染过许多其它曲风的页面**里是 **−10.26** ✓✓；
* `scripts/measure_genre_loudness.mjs`：**测量页会回收自己**（`--reload-every` ✓），理由写在旁边 ✓；它记着机制是 **"可回收（约 124 个 GS-1 host）"** ✓、**"新页面里第一次离线渲染不走同一条路"** ✓，以及 **"新页面 −12.711 LUFS、渲染过 75 次后 −10.259"** ✗✓；
* `docs/RENDER_PROFILE.md` 与 `RUST_DECISION.md §九`：一个浏览器进程在 **约 40–124 次渲染后整个消失** ✗。

**渲染器侧的现状（我读的代码）** ✗：`mcp/render/worker.ts` 里**没有**页面回收 ✓——没有 `rendersPerPage` / `MAX_RENDERS` / `recycle` 这类东西 ✓；只有 `ensurePage`（186 ✓）与 `resetRenderer`（254 ✓，会 `browser?.close()` ✓），而它们只在**某些错误路径**上被调用 ✓。

**所以差距是精确的** ✓✓：**测量设备回收，渲染器不回收** ✗✓ → 一个 MCP 客户端渲染约 75–124 次后，**先拿到漂移的音频** ✗（**2.4 LU**，这是**正确性**问题 ✓✓），**再撞上浏览器消失** ✗。**这一条比"寿命"更该修** ✓。

**第一步** ✓（排队，等 ① 放开 `mcp/render/worker.ts` ✓）：**给渲染器加页面回收** ✓——每 N 次渲染后重建页面 ✓，N 取**测量设备已经用过的量级** ✓（它按 `--reload-every` 回收 ✓）；**判据**：连续渲染 N+1 次（含跨过回收点 ✓），断言**响度与 13 段指纹不漂移** ✓✓，**并断言回收确实发生** ✓（否则"没漂移"可能只是因为渲染次数太少 ✗✓）；**删除回收即红** ✗✓——这就是"长曲不再撞进程寿命"的可判定形态 ✓。

### 追加实测（2026-10-01）：真正的异类是**新页面的第一次渲染**，不是页面年龄 ✗✓

上一节写"页面年龄会让音频漂移" ✓。用仓库自己的 `probe_render_repeatability.mjs` 量了一遍（`--genre=alternative-rock --warm=20`），结果**把叙事改了** ✗✓：

```
fresh page, render 1      -10.714 LUFS   -1.30 dBTP
fresh page, render 2      -11.544 LUFS   -1.30 dBTP   ← 同一新页面内，相邻两次差 0.83 LU ✗
fresh page, render 3      -11.546 LUFS   -1.30 dBTP
-- 在此页面渲过 20 个其它曲风之后 --
after 20 genres, 1/2/3    -10.714 / -10.714 / -10.714   ← 稳定 ✓
after reload, 1/2/3       -10.781 / -10.714 / -10.714
```

**结论** ✓✓：**最大的差异是新页面里的第一次渲染**（**0.83 LU** ✗），**而渲过 20 个曲风之后完全稳定** ✓。设备记的"**渲染 75 次后 −10.259**"是**更晚才起**的另一个效应 ✓（与曲风有关 ✓，本次在 20 次时未出现 ✓）。这与设备自己那句"**新页面里第一次离线渲染不走同一条路**"一致 ✓✓。

**对三处的含义** ✓✓：
1. **MCP 一致性** ✗：渲染器**复用**页面 ✓，所以它的**第一次**渲染与后续不同 ✓——调用方两次渲染不一致的原因可能只是"其中一次是第一次" ✓；
2. **parity 探针** ✗✓：它一次做 **4 个渲染** ✓，**第一个可能是异类** ✗——所以"浏览器 vs 无头"的差里，可能混着"两边各自第一次"的效应 ✓✓。**这是下一步该排掉的一个变量** ✓（同页做一次热身再比 ✓）；
3. **页面回收的修法必须加一条** ✗✓：**回收会把页面打回"第一次"的状态** ✓ → 回收后**必须丢弃一次热身渲染** ✓✓——测量设备正是这么做的 ✓（它明写"热身渲染被有意排除" ✓）。所以那条排队项的判据要**同时**覆盖：跨过回收点**不漂移** ✓ **且**回收后的**热身被丢弃** ✓✓。

### 再追加：**MCP 渲染器的第一次渲染也需要一次热身**（2026-10-01，量到 0.83 LU）

上面记了"回收页面后要丢弃一次热身" ✓。**还有一处不是回收带来的** ✗✓：渲染器**自己创建页面的那一次** ✓——因为**新页面的第一次渲染是异类** ✓（实测：同一新页面 `render 1 = −10.714 LUFS` vs `render 2/3 = −11.544 / −11.546` ✗，差 **0.83 LU** ✓）。

**所以今天是这样的** ✗✓：**一个 MCP 客户端的第一次 `render_audio` 与之后每一次的结果不同** ✓✓——**差 0.83 LU** ✓，而**回复里没有任何东西说明它是第一次** ✗。这与"回收后要热身"**是两条** ✓：一条防回收引起的回退 ✓，一条防**页面创建**引起的 ✓✓。

**第一步** ✓（排队，等 ① 放开 `mcp/render/worker.ts` ✓）：**页面创建后先跑一次被丢弃的渲染** ✓（与测量设备做法一致 ✓——它明写"热身渲染被有意排除" ✓）。**判据**：连做两次渲染 ✓，第一次与第二次的**响度与 13 段指纹落在已标定容差内** ✓✓；**删掉热身即红** ✗✓（那正是今天的状态 ✓——今天的差值 **0.83 LU** ✓，远大于 parity 用的 0.5 LU 容差 ✓）。**代价** ✓：每次页面创建多一次渲染（1 小节约 20 秒 ✓，按实测 0.7× 实时 ✗ 折算 ✓）。

### ⚠️ 更正（同小时）：异类是"**某个 pattern 的第一次渲染**"，**不是**"页面的第一次渲染" ✗✓

上一条把它记成"新页面的第一次渲染" ✓，并据此排队"页面创建后加一次热身" ✗。**再读探针的代码，这个修法不成立** ✗✓：

```
  await measure(catalog[0]);                      // ← 热身：先渲【另一个曲风】
  for (let i = 0; i < 3; i++) report(`fresh page, render ${i + 1}`, await measure(genreId));
```

**它早就做过一次热身** ✓✓（而且是在同一个新页面里 ✓），**而那个台阶依然出现** ✗：`fresh page, render 1 = −10.714 LUFS` vs `render 2/3 = −11.544 / −11.546` ✓✓。

**所以正确的说法是** ✓✓：台阶出现在**某个 pattern / 某张图第一次被渲染**的时候 ✓，**不是页面第一次渲染** ✗——热身渲**别的曲风**消不掉它 ✓。

**这把排队项的范围改了** ✗✓：
* 原来写的"**页面创建后热身一次**" ✗ **不够** ✓（探针已证 ✓）；
* 正确的形状要么是"**每个新 pattern 的第一次渲染被丢弃**" ✓✓（即**每次调用都要热身** ✗——那等于**每次渲染成本翻倍** ✗✗，对 8 小节约 +7 分钟 ✓），要么先**量清这个台阶到底是什么** ✗✓（是图构造 ✓？是 GS-1 host 的首次装配 ✓？是某条 worklet 的首次装载 ✓？）再决定怎么付这笔钱 ✓。
* **在没量清之前，不该实现任何一种** ✗✓——否则就是花一倍成本买一个**不生效**的修法 ✓（这正是本项目最忌的"看起来做了" ✗）。

**下一步（明确）** ✓：用探针把三种"第一次"分开量 ✓——**同一 pattern 连渲两次**（同一页 ✓）✓、**同页换 pattern 再渲**✓、**换页渲同一 pattern** ✓——三者谁出台阶，台阶就在谁身上 ✓✓。**判据**：台阶消失 ✓ 即修法对症 ✓；仍是红的 ✓ 就说明修的是错的地方 ✓。

### ✅ 结论（2026-10-01）：那个台阶**没能复现**，热身项因此**降级** ✗✓

上一节把台阶定位成"某个 pattern 的第一次渲染" ✓ 并说"先量清再决定" ✓。**量了** ✓✓——新探针 `scripts/probe_first_render_step.mjs` ✓（**同一页面、四个渲染、两条 pattern** ✓），结果**没有任何台阶** ✗：

```
genre A=alternative-rock B=2-step-garage（同一页面，各 1 小节）
  A 第一次（同页）        -12.748 LUFS
  A 第二次（同页）        -12.748 LUFS
  B 第一次（同页）        -17.704 LUFS
  A 第三次（同页）        -12.748 LUFS
  B 第二次（同页）        -17.704 LUFS
台阶：A 首渲 vs 次渲 = 0.000 LU ｜ B 首渲 vs 次渲 = 0.000 LU
```

**因此诚实的说法是** ✓✓：**"首渲台阶"是一条未复现的观察** ✗（**一次** ✓，出现在 `probe_render_repeatability` 的 **`bars: 3`** 配置下 ✓：`−10.714` vs `−11.544` ✓）；**本探针在 `bars: 1` 下复现不出来** ✓✓（两者电平也不同：`−12.748` ✗ 与 `−10.714` ✗，正是 bars 不同 ✓）。

**这条观察与宿主那族间歇行为同形** ✗：并发下 **4.2% 整段静音** ✓、**0.198 dB 自不洽** ✓、以及这次**一次性的 0.83 LU** ✓——**都是"有时"而不是"总是"** ✓；而**成对的稳定读数**（本探针 0.000 LU ×2 ✓、parity 三次逐位相同 ✓）说明**宿主在稳定态里是稳的** ✓✓。

**所以热身项降级为** ✓✓：**"未复现的观察"** ✗，**不实现**（理由：**在无法复现的台阶上加热身，就是花一倍成本买一个不生效的修法** ✓——上一节自己写的规矩 ✓）。**保留两件东西** ✓：`probe_first_render_step.mjs` ✓（一条命令即可"复现/复现不出" ✓）与本节记录 ✓；**若将来在 `bars: 3` 或其它配置下再看到台阶** ✓，先跑这个探针 ✓，**复现了再谈修法** ✓✓。
