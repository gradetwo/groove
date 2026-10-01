# 无头核心（headless core）：三条路径的实测与决定

本文回答一个问题：能不能在浏览器之外，用同一份引擎渲染 groove 的 pattern。结论先行。

## 结论

1. 业主推翻 Phase 0 的"不做"决定，成立。原来的理由只对"在 Node 里重写一个渲染器"成立；对"跑同一份代码，只换 Web Audio 宿主"不成立。这两件事被原裁定当成了一件。
2. 实测可行：`node-web-audio-api@2.2.0` 在 Node 里跑起了真的 `renderPatternOffline`、真的 AudioWorklet（GS-1 处理器、母带限幅器、glue 压缩）、真的 vendored GS-1 wasm，并渲染出音频。
3. 但今天它还不是"同一个声音"。同一 fixture、两个宿主、各自都完全可复现（逐次 0.000 dB），44.1 kHz 立体声下仍有最差频段 1.34 dB、整体响度 1.89 LU 的差。差异在声部/轨道图里，不在 GS-1，也不在母带链。
4. 因此分期：第一步是把这点差定位到一个具名的宿主原语并处理。这一步已经做完，见第 6 节：差落在 kick 轨道，具名原语是 DynamicsCompressorNode（关掉 kick 的默认压缩后，整混响度差从 1.886 LU 降到 0.495 LU）与 OscillatorNode 的 saw/square 带限（Node 宿主高 1.40 dB）。同时发现一个阻断性缺陷：Node 宿主会间歇性返回整段静音（约每 8 次 1 次），所以判据探针现在拒绝给静音渲染打分。
5. 在这条判据通过之前，不把 MCP 的渲染路径切到无头。Rust 本地方案不是这条路上的捷径，理由见第 1 节。

## 1. 三条路径，同一组判据

| | (a) 今天的浏览器 worker | (b) 同一份 TS 引擎跑在 Node 宿主 | (c) Rust 本地 server（`synth-core`） |
| --- | --- | --- | --- |
| 离开浏览器 | 否 | 是 | 是 |
| 渲染进度 | 无（`startRendering()` 无回调） | 有：`OfflineAudioContext.suspend(t)` 实测在 `currentTime=0.253` 处返回 | 有（自己控块循环） |
| 内存 | 6 min × 8 立体声 ≈ 1.1 GB（`docs/RUST_DECISION.md`） | 同一量级（仍是整段 buffer 在进程内）；少一个 Chromium 进程 | 可预测，可流式 |
| 构建/CI 成本 | 需 Chromium | 一个预编译 npm 包，无工具链 | 需 Rust 工具链 + clang，并把 `crates/synth-core` 连同 vendored DaisySP/Soundpipe 做成固定副本 |
| 同一份 DSP 的实现份数 | 1（浏览器） | 1：`src/audio/**` 与 `public/*Worklet.js` 原样执行 | GS-1 是 1；其余 6 条原生轨 + 效果 + 母带是第二套实现 |

关于 (c) 的一句要写清楚的话：`GS1_ROUTED_ROLES` 是 `["chords","lead"]`（`src/audio/gs1/gs1Tracks.ts:36`），一个 pattern 有 8 条轨。`crates/synth-core` 只等于 GS-1 那一块 DSP，所以一个只调 `synth-core` 的 Rust server 渲染不了 groove 的 pattern，除非把 kick/bass/percussion/效果/母带也用 Rust 再写一遍——那正是要避免的"两处算同一件事"。Rust 在 `docs/RUST_DECISION.md` 里真正的理由是 SFZ 解析、磁盘流式、共享内存环，不是渲染循环（渲染已经约 10× 实时）。

`crates/synth-core` 的构建成本本身不高：本机清空 target 后 `cargo build --release --frozen` 实测 8.22 s（vendored C/C++ 只有 13 个文件）。所以 (c) 的障碍不是编译，是范围。groove 的 CI 里目前没有任何 Rust/cargo/clang。

## 2. 实测证据

以下每一条都跑过，命令与输出照抄。

可选依赖装在临时目录，没有进仓库、没有进 `package.json`（worktree 的 `node_modules` 是指向主 checkout 的符号链接，装进去会改到主 checkout）：

```
$ mkdir -p /tmp/wa-probe && cd /tmp/wa-probe && npm install node-web-audio-api
added 9 packages, and audited 10 packages in 5s
$ node -e "console.log(require('node-web-audio-api/package.json').version)"
2.2.0
```

宿主能力（`OfflineAudioContext` 上逐项探测）：`createGain / createStereoPanner / createPanner / createBiquadFilter / createDynamicsCompressor / createDelay / createConvolver / createWaveShaper / createBufferSource / createOscillator / createChannelSplitter / createChannelMerger / createAnalyser / createPeriodicWave / createConstantSource / createIIRFilter` 全部存在；`AudioWorkletNode` 与 `ctx.audioWorklet.addModule` 存在；`startRendering`、`suspend`、`resume` 存在；`decodeAudioData`、`ConvolverNode.buffer`、HRTF `PannerNode`、`AnalyserNode.getFloatFrequencyData` 都可用。

真的 GS-1 worklet + vendored wasm，在 Node 里：

```
[scalar] addModule ok
[scalar] ready: {"type":"ready","abi":9,"scheduledNoteLatencyFrames":128}
[scalar] RENDERED: frames=24000 peak=0.056113 rms=0.021930 nonFinite=0
[simd]   ready: {"type":"ready","abi":9,"scheduledNoteLatencyFrames":128}
[simd]   RENDERED: frames=24000 peak=0.056113 rms=0.021930 nonFinite=0
```

真的 `renderPatternOffline`，1 bar，8 kHz 单声道：

```
  [fetch] /gs1/synth_core.wasm -> .../public/gs1/synth_core.wasm (217263 bytes)
  [addModule] /gs1/workletProcessor.js -> .../public/gs1/workletProcessor.js
  [addModule] /limiterWorklet.js -> .../public/limiterWorklet.js
RENDERED frames=30000 rate=8000 channels=1
peak=0.856885 rms=0.181594 nonFinite=0 limiter=worklet wallMs=699
```

GS-1 在无头路径里确实发声（把路由关掉再看同一个 fixture）：

```
headless GS-1 ON : peak=0.86075 centroid=87.9 bands=[-9.1,-3.6,-6.0,-9.4,...]
headless GS-1 OFF: peak=0.86026 centroid=111.6 bands=[-9.2,-3.6,-6.4,-9.5,...]
GS-1 ON vs OFF worst band delta: 8.29 dB (band 10)
```

真的 genre fixture（chicago-house，1 bar，44.1 kHz 立体声，8 轨），浏览器渲染的文件与无头渲染的文件，用仓库自己的度量：

```
frames: browser=757525 headless=757525 rate: 44100/44100
truePeakDb: browser=-1.300 headless=-1.300 delta=0.000
integratedLufs: browser=-12.693 headless=-13.095 delta=0.402
centroidHz: browser=85.2 headless=90.1
13-band worst delta: 0.92 dB (band 3)
```

这就是分歧所在：同一份代码、不同宿主，在一个 fixture 上差 0.40 LU / 0.92 dB，在另一个上差 1.89 LU / 1.34 dB。所以判据必须是测出来的、带容差的，而且容差要按 fixture 说明。

判据探针 `scripts/probe_headless_parity.ts` 的四次渲染（3 轨 fixture，kick + bass + chords，chords 走 GS-1），44.1 kHz 立体声：

```
browser  GS-1 ON       frames= 165375 truePeak= -1.30 dB  LUFS=-13.56  centroid=  84.6 Hz
browser  GS-1 OFF      frames= 165375 truePeak= -1.30 dB  LUFS=-13.05  centroid= 102.3 Hz
headless GS-1 ON       frames= 165375 truePeak= -1.30 dB  LUFS=-15.45  centroid=  94.3 Hz
headless GS-1 OFF      frames= 165375 truePeak= -1.30 dB  LUFS=-14.78  centroid= 111.1 Hz
limiter: browser=worklet  headless=worklet  (same path)
self-determinism (worst band): browser 0.000 dB, headless 0.000 dB
same voice  (browser ON vs headless ON):  worst 1.34 dB (band 6)
same native (browser OFF vs headless OFF): worst 1.11 dB (band 3)
```

两个宿主各自逐次完全一致（0.000 dB），限幅器走的是同一条 worklet 路径，真峰值完全相同，但整体响度差 1.89 LU。8 kHz 单声道下同一个 fixture 的频段差更大（band 10 是 4.53 dB），说明这个差值与采样率、与 fixture 都有关。

把差值往上游定位（同一探针的 bisect 开关，两边同时生效）：

```
--no-bus-comp   LUFS Δ 1.842      worst band 6.44 dB
--direct-out    LUFS Δ 1.860      worst band 4.66 dB   （绕过整个母带图，真峰值随之不再相同）
```

`directOut` 绕开母带链之后差值原样还在，所以它不在母带、限幅器、总线压缩里，而在声部/轨道图。剩下的具名候选：`WaveShaperNode.curve = null` 在 Node 宿主里是空操作（实测：设过 `[-1,0,1]` 再设 `null`，`curve` 仍是长度 3；浏览器的语义是直通），以及各轨用的 `OscillatorNode`/`BiquadFilterNode`/`DynamicsCompressorNode` 原语实现不同。根因尚未二分到底，这正是第一步。

## 3. 两条路径共享的那一个物件

不是副本，不是移植，是引擎源码本身：

- `src/audio/**`（全部图、调度、母带、导出）
- `public/gs1/workletProcessor.js`、`public/limiterWorklet.js`、`public/glueCompressorWorklet.js`
- `vendor/gs1/`（`synth_core.wasm`、`synth_core_scalar.wasm`；由 `scripts/sync-gs1.mjs` 单向同步、`scripts/check-gs1.mjs` 按哈希钉住）

两条路径 `import` 的是同一批文件。因此"一边改了、另一边没跟上"这种漂移在构造上不存在。剩下的漂移只有一种，就是宿主：两个 Web Audio 实现的内建 DSP 不同。这不是靠约定能保证的，只能靠测量，这就是下面的判据。

对比之下，(c) 若只调 `synth-core`，共享的物件只有 `crates/synth-core`（它确实是 wasm 的同一份源码，这是它最大的优点），但 Groove 的其余部分会是一份新实现——共享面比 (b) 小得多。

## 4. 判据与容差

`scripts/probe_headless_parity.ts` 做四次渲染，三组断言展开成六条检查：

1. 同一个声音：`browser ON` 与 `headless ON` 在容差内（13 段指纹、LUFS、真峰值）。
2. 同样的原生轨：`browser OFF` 与 `headless OFF` 在同一容差内。只在前一条上通过的宿主，可能是"GS-1 都没了所以两边一样"。
3. GS-1 真的在发声：两个宿主各自 `ON − OFF` 的 13 段差值绝对值之和（L1）都远大于 guard。这一条必须有，因为单靠频段容差抓不到静默回退——导出路径自己的注释记着，一个 GS-1 host 失败会让 band 6 动 0.71 dB、band 9 动 3.66 dB（`src/audio/WavExporter.ts:544-547`），落在 1 dB 的频段容差之内。guard 用 L1 而不是"最差频段"是实测定的：8 kHz fixture 上关掉 GS-1，最差单段只动 2.66 dB，但七段一起动、L1 约 10 dB；用最差单段会把"明显在发声"判成"没发声"。

容差与理由：

| 项 | 默认 | 理由 |
| --- | --- | --- |
| 13 段指纹，每段 | 1.0 dB | `scripts/probe_engine_parity.mjs` 实测 Chromium 与 WebKit 在原生轨上一致到 0.0–0.9 dB rms。这就是本仓库已有的"两个宿主、同一个引擎"的定义。 |
| 整体响度 | 0.5 LU | 与上一条同量级。 |
| 真峰值 | 0.1 dB | 母带限幅器的天花板是同一个数字，实测两个宿主都落在 −1.30 dBTP。 |
| GS-1 在场 guard | 5 dB（13 段差值 L1 之和） | 见第 3 条断言的 0.71/3.66 dB 实测：静默回退可能在单段上很小，所以按整条指纹的 L1 判。实测 GS-1 在场时 L1 约 10 dB。 |

0.005 dB 那个同运行时确定性数字不能用作跨宿主容差：它是同一实现的逐次复现，本探针实测两个宿主各自的逐次差都是 0.000 dB，而宿主之间的差是另一个量级的问题。

探针有两条防线，都在打分之前，退出码 2。第一条是静音渲染不打分：Node 宿主会间歇性返回整段静音（第 6 节），把它当测量会印出一个约 116 dB 的"宿主差"，那是这个探针能印出的最误导人的数字，所以遇到 `LUFS = -Infinity` 它拒绝打分。第二条是自一致性闸门：任一宿主对自身两次渲染的差超过 0.01 dB 就判仪器不稳、拒绝比较。阈值取 0.01 dB 是因为仓库自己的同运行时确定性线是 0.005 dB，而稳定运行实测 0.000 dB。这不是容差，是仪器有效性：一个不能复现自己的宿主没有资格与另一个宿主比较。

当前判定：探针不通过（44.1 kHz 立体声：最差频段 1.34 dB > 1.0，响度 1.89 LU > 0.5）。这是探针该说的话，不是它的缺陷。

## 5. 分期计划

第一步：把宿主差二分到一个具名原语。已做，见第 6 节。结论是它不止一个原语：DynamicsCompressorNode（主要，kick 轨）与 OscillatorNode 的 saw/square 带限（次要，打击乐轨）。同时发现一个阻断项：Node 宿主间歇性返回整段静音。
判据：探针六条检查全过。今天仍不过（残项 0.495 LU 已满足 0.5 LU，但最差频段 1.34 dB 未收敛），所以下一步不是放宽容差，而是先修静音缺陷，再裁定压缩器差与振荡器差是否可接受。
成本：仓库不加依赖（两个探针都用 `createRequire` 可选加载，缺包时打印 skip 并退出 0，与 `src/test/sfizzAgreement.test.ts` 缺 `sfizz_render` 时同形）。

第二步：把 `node-web-audio-api` 写进 `devDependencies` 并加 `probe:headless` 脚本；给 MCP 渲染加一个 `GROOVE_MCP_HEADLESS=1` 开关，在探针通过的前提下在进程内渲染。
判据：`render_audio` / `render_arrangement` 在 fixture 上与浏览器路径落在同一容差内，`check:mcp` 不变。

第三步：只有当第二步稳定之后才谈默认切换。到那时 Phase 0 的另一项 RenderTarget 抽象才有意义——两个宿主在一个接口后面，探针就是那道闸门。

Rust（c）继续推后。它变成正确答案的条件是二选一：要么只需要一个 GS-1 专用 server，要么决定把整个引擎移植过去。真到那一步，共享物件是 `crates/synth-core`，判据是 `docs/RUST_DECISION.md:53` 那句"Rust 核心与浏览器图逐样本一致"。

## 6. 第一步：宿主差的二分（已做）

工具：`scripts/probe_host_primitives.ts`（最小图 A/B：同一份 builder 源码在两个宿主里各跑一次，样本逐点比较；浏览器侧用 `about:blank`，不需要 Vite）与 `scripts/probe_headless_parity.ts` 的 bisect 开关。基准全部是 44.1 kHz 立体声、1 bar、3 轨 fixture（kick / bass / chords，chords 走 GS-1）。

基准（两次独立运行复现同一组数字）：同一声音最差频段 1.34 dB（band 6），同一原生轨 1.11 dB（band 3），响度差 1.886 LU，真峰值差 0.000 dB，两个宿主各自逐次都是 0.000 dB。

### 候选 1：WaveShaper 的 `curve = null` 空操作。排除。

不改音频，只在 Node 宿主上数图上真正发生的赋值：

```
nodes=36 setCurve=20 setNull=24
null->null=24 null->curve=20 curve->null=0 curve->curve=0
```

`curve->null = 0`。24 次 `null` 全部落在从未有过曲线的节点上，没有旧曲线可留，所以这个宿主差异在这张图上不可能起作用。差值不变（仍是 1.34 dB / 1.886 LU）。写在这里是为了下一个读者不必再试它。

### 候选 2：逐轨隔离。差跟着 kick 轨。

`--per-track`（GS-1 开，每轨单独渲染，两个宿主各一次）：

| 轨 | 浏览器 LUFS | 无头 LUFS | dLUFS | 最差频段 | 13 段 L1 |
| --- | --- | --- | --- | --- | --- |
| kick | -13.29 | -15.85 | +2.56 | 1.63 (band 9) | 12.33 |
| bass | -21.33 | -20.96 | -0.37 | 1.55 (band 0) | 9.49 |
| chords (GS-1) | -23.14 | -24.07 | +0.93 | 0.28 (band 10) | 1.86 |

两个读法。GS-1 那条轨最紧（最差 0.28 dB），这是一份共享 wasm 该有的样子。整混的响度差主要来自 kick：它是最响的一条轨，也是单轨偏差最大的那条。

### 候选 3：原语级 A/B。具名两个，排除九个。

同一份 builder 源码在两个宿主里跑，逐样本比较（括号内是最大样本差相对峰值的 dB）。发散的原语：

| 原语 | 实测 |
| --- | --- |
| `osc-saw` / `osc-square` | Node 宿主 RMS 高 1.40 / 1.41 dB（相对差 -12.8 dB）：非正弦波形的带限（抗混叠）实现不同 |
| `osc-triangle` | 电平一致，波形形状差 -46.9 dB：同一件事的轻微版本 |
| `DynamicsCompressorNode` | saw 输入 2.4 dB、sine 输入 2.5 dB、noise 输入 3.8 dB 的相对差；RMS 最多 +1.07 dB |

逐一排除（位级相等，或低于 -88 dB）：

| 原语 | 相对差 |
| --- | --- |
| `osc-sine` | -98.2 dB |
| GainNode 线性斜坡 / 指数斜坡 | -109.0 / -112.5 dB |
| 频率指数扫频 | -99.8 dB |
| BiquadFilter lowpass（噪声输入） | -125.7 dB |
| BiquadFilter highpass Q8（噪声输入） | -113.1 dB |
| WaveShaper 带曲线 | -88.6 dB |
| AudioBufferSource 噪声缓冲 | 0.00e+0 |
| ConvolverNode 带 IR | -99.4 dB |
| StereoPanner（正弦输入） | -91.7 dB |

一个必须写下来的陷阱：`biquad-*` 与 `stereo-panner` 在锯齿波输入下看起来也差 1.4 dB，而那个差完全是从振荡器继承的。换成宿主一致的输入（正弦，或那个逐位相同的噪声缓冲）它们就一致。所以滤波器、声像、卷积、整形、包络都不是原因，根因收敛到振荡器的带限与压缩器两处。

第二处有出处：`src/audio/DrumKitModels.ts:1330-1345` 的 808 cowbell 用 `osc.type = "square"`，所以振荡器那一项落在打击乐轨上。

### 候选 4：kick 压缩器的占比。它是整混响度差的主要来源。

kick 的默认 insert 就带压缩（`src/data/trackInsert.ts:162-180`：`compEnabled: true`、threshold -12 dB、ratio 4、attack 0.012 s、release 0.12 s、makeup 3 dB）。受控对照，同一条 kick 形状的链（正弦 + 指数频率扫频 + 指数增益衰减 + 波形整形）：

- 不带压缩器：相对差 -118.4 dB，RMS 差 -0.00 dB，整条链位级一致；
- 加上一个 `DynamicsCompressorNode`：相对差 4.5 dB，RMS 差 -0.43 dB。

差是那一个节点加进去的。把 kick 的压缩关掉再渲染整混（两个宿主同样关）：

| 指标 | 基准 | kick 压缩关 |
| --- | --- | --- |
| 响度差 | 1.886 LU | 0.495 LU |
| band 3 | 1.21 dB | 0.80 dB |
| band 6 | 1.34 dB | 0.75 dB |
| 同一原生轨最差频段 | 1.11 dB | 0.83 dB |

所以 1.886 LU 里约 1.4 LU 是 kick 那条轨的压缩器，剩下约 0.5 LU 与约 0.8 dB/段是残项。

### 候选 5：不是原语，是宿主缺陷。Node 宿主会间歇性返回整段静音。

逐次一致性检查抓到的不是小差，而是整段静音：帧数正确（165375）、`limiter=worklet`、`LUFS = -Infinity`、13 段全部落在 -120 底。它不是"差一点"，是一次失败的渲染。计数：

| 配置 | 静音次数 |
| --- | --- |
| GS-1 关，44.1 kHz 立体声，N=6（第一次） | 1 |
| GS-1 关，44.1 kHz 立体声，N=6（第二次） | 3 |
| GS-1 关，44.1 kHz 立体声，N=8 | 1 |
| GS-1 关，8 kHz 单声道，N=8 | 2 |
| GS-1 开，8 kHz 单声道，N=8 | 0 |
| GS-1 开，44.1 kHz 立体声，N=8 | 0 |

它偏爱 GS-1 关的那条路，与采样率无关，帧数总是对的。两个弱线索（各只跑了一次，不能当结论）：`directOut`（绕开整个母带图）0/8，`masterBusCompEnabled: false` 0/8。另外看到过一次非静音的小不确定：同一对渲染差 0.184 dB（band 5）、0.076 LU。

除整段静音之外，还观察到更小的不确定：8 kHz 单声道下有一次浏览器 GS-1 开 1.076 dB、无头 GS-1 关 1.568 dB 的自差，而同一配置在别的运行里是 0.000 dB。所以不确定有两种强度：整段静音，与几分之一 dB 到几 dB 的差。两者都让单次渲染之间的比较失去意义。

这条缺陷是采用无头路径的阻断项，也是判据探针必须先拒绝静音渲染、并且要求每个宿主先复现自己的原因。

### 仍然没有具名的

1. kick 压缩关掉之后剩下的约 0.495 LU / 约 0.8 dB/段。候选是振荡器带限那一项的贡献、其它轨各自的压缩器、以及母带 glue 与限幅器。
2. 静音渲染的成因。目前只知道：偏爱 GS-1 关、与帧数无关、限幅器报 worklet。
3. 浏览器侧 GS-1 开启时偶发的顶层频段差异（约 3.9 dB，三次运行里出现）。GS-1 worklet 里唯一读墙上时钟的分支是负载监视器（`OVER_LOAD` / `OVER_BLOCKS`，见 `public/gs1/workletProcessor.js`），它在离线上下文里用 `performance.now()` 估 DSP 成本并可能降声部数；这是最像的解释，但没有证明。

## 为什么分期而不是现在就做

引擎今天已经能在 Node 里跑，但两个宿主之间测出来的差高于本仓库自己用来判定"两个引擎、同一个声音"的量级。现在切过去，就是原裁定担心的那个"第二个声音"，只是换了条路到达。先把它测小、或者把它指名为一个原语并重新标定容差，再切。
