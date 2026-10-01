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

**从非 secure origin 打开的页面会静默失去真峰值限幅与 GS-1** ✗✓：用 `http://<局域网 IP>:3000` ✓ 或任何非 HTTPS 主机名打开本应用 ✓，`chords`/`lead` 落到原生引擎 ✓、母带落到 `DynamicsCompressor` 回退 ✓，而**界面与导出都不说** ✗。**MCP 服务器不受影响** ✓（它跑在 `127.0.0.1` ✓）。

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
