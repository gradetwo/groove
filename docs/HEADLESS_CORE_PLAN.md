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

#### 候选 5b：复现、计数与成因（追加）

工具：`scripts/probe_render_repeats.ts`（同一进程内重复跑真的 `renderPatternOffline`，给出分母与耗时）。

**触发条件是并发，不是渲染序列。** 同一进程内**串行**渲染 64 次（24 次 44.1 kHz 立体声 + 32 次 8 kHz 单声道 + 8 次），**0 次静音**。把 8 次渲染同时放进一个进程（`Promise.all`）后，48 次里 **2 次静音（2/48，4.2%）**，两次都落在**每个进程的 round 0**，即那个既跑 GS-1 离线能力探针（一个一次性的 0.25 s 渲染）又跑其余 7 个渲染的一轮。另一组 6 路并发 24 次里 1 次静音（1/24），同样是 round 0。结论：**静音与"同时有多少渲染在飞"相关，与采样率、通道数、GS-1 开关无关**——它偏爱 GS-1 关只是因为 GS-1 关时图上仍有 2 个 worklet（limiter + bus comp）而 GS-1 开时多出的 GS-1 worklet 让竞争更慢，不是 GS-1 本身。

**具名到哪里：母带链里那两个异步换装的 worklet。** 用 `AudioWorkletNode` 包装器给每次渲染记下真正用上的限幅器（`onLimiterKind`），静音那次报 `limiter=worklet`，同时 `processorerror` 一次都没有。也就是说：限幅器 worklet **已经装好并自报在位**，音频仍然全零。这与 `createMasterLimiter` / `createBusCompressor` 的换装方式一致——两者都先在 `input`/`output` 之间挂 `DynamicsCompressor`，worklet 模块加载完成后再 `disconnect` 它、把 worklet 接进去，而 `renderPatternOffline` 只 `await graph.limiter.ready`，**从未 await `busComp.ready`**（那条 `ready` 没有被 `MasterGraph` 接口暴露出来）。并发下两条 `addModule`/换装彼此错开，图上就存在一个"信号要经过的那个节点还没被换好"的窗口。

**根因尚未二次确认到单一原语，但不再需要在探针里复现它**：静音是宿主的失败渲染，渲染器自己必须能识别。

**排除（下一个读者不必再试）：**

| 候选 | 实测 |
| --- | --- |
| 裸宿主（无项目代码）：1 个振荡器 → gain → destination，60 次 | 0/60 静音，14.3 ms/次 |
| 同一个真实 `limiterWorklet.js` 挂进裸图（无换装），30 次 | 0/30 静音，3504 ms/次 |
| 两个上下文同时渲染（裸图 + 真 worklet） | 0/12 静音 |
| 真 worklet 的 `processorerror` | 静音那次 0 次触发 |
| 限幅器模块加载失败导致回退 | 静音那次 `limiter=worklet`，不是回退；回退另有一次独立出现，非静音 |
| 顺序渲染序列（同进程 64 次） | 0/64 静音 |

**产品级处置（本次改动）**：`src/audio/renderSilence.ts` 的 `bufferHasAudio` 按 −120 dBFS 判"整段无声"；`renderPatternOffline` 现在是 `renderPatternOfflineGuarded` 的包装：静音即重试（`RENDER_SILENCE_ATTEMPTS = 4`），重试恢复时把问题写进 `RenderWavOptions.onProblems`；四次都静音就**抛错**而不是把零缓冲当成功交出去。`mcp/render/worker.ts` 把 `problems` 带到 `render_audio` 的回复里。探针的"拒给静音打分/退出码 2"与"自一致性 0.01 dB 闸门"原样保留——那是仪器有效性，这里是产品答复。

**判据是三态，不是二态**（与 `13da133` 的音频 lane 合并时被迫想清楚的）：有声；**有解释的静音**（pattern 里没有任何会发声的东西，或每个音频 lane 都已被具名为不可播放——渲染器自己记下这个判定，理由已经在 `OfflineAudioLaneReport.problems` 里）；**没人解释的静音**（有内容被排入却整段无声，这才是宿主缺陷，才重试并最终抛错）。第三态是这次修复的对象；第二态如果也抛错，就会用一个更差的答案（"宿主返回了静音渲染"）替换掉一个具名的、可行动的理由（`no sample "probe-impulse"`），所以必须分开。判定用的是**渲染器观测到的事实**（是否有任何一条轨在这一步排入了发声），不是对 pattern 的推断。



### 仍然没有具名的

1. kick 压缩关掉之后剩下的约 0.495 LU / 约 0.8 dB/段。候选是振荡器带限那一项的贡献、其它轨各自的压缩器、以及母带 glue 与限幅器。
2. 静音渲染的成因。目前只知道：偏爱 GS-1 关、与帧数无关、限幅器报 worklet。
3. 浏览器侧 GS-1 开启时偶发的顶层频段差异（约 3.9 dB，三次运行里出现）。GS-1 worklet 里唯一读墙上时钟的分支是负载监视器（`OVER_LOAD` / `OVER_BLOCKS`，见 `public/gs1/workletProcessor.js`），它在离线上下文里用 `performance.now()` 估 DSP 成本并可能降声部数；这是最像的解释，但没有证明。

## 7. AudioWorklet 的可用性取决于 origin，不取决于 Chromium 版本

有一条外部结论需要在这里对账：据报告，本机 Chromium（Chrome 153 Linux，`chrome-headless-shell` 与 `channel: chromium` 两个构建）没有 `OfflineAudioContext.audioWorklet`，因此母带限幅器永远走 `DynamicsCompressor` 回退、GS-1 轨永远拿不到 wasm host。如果成立，那么本文件前面所有的"浏览器 vs 无头"比较就是两个不同的图在比，而不是两个宿主在比。

在本机同一批 Playwright Chromium（`chromium-1243`，HeadlessChrome/153.0.8010.12）上实测，用 `ctx.audioWorklet`、`addModule` 与一次真实的 blob worklet 渲染来判断：

| origin | isSecureContext | ctx.audioWorklet | addModule | 真实 worklet 渲染 |
| --- | --- | --- | --- | --- |
| `about:blank` | false | undefined | 无 | 不可用 |
| `http://127.0.0.1:<port>` | true | object | function | ok，渲染 1280 帧 |
| `http://192.168.100.207:<port>`（同一台服务器，局域网 IP） | false | undefined | 无 | 不可用 |

所以那条结论对 `about:blank` 成立，对渲染器真正驱动的 origin 不成立。原因是 `AudioWorklet` 只在 secure context 暴露：`localhost` 与 `127.0.0.1` 被视为 potentially trustworthy，而纯 HTTP 的局域网 IP 不是。这不是 Chromium 缺功能，是 origin 的属性。`mcp/render/worker.ts` 起的是 `http://127.0.0.1:<free port>`，因此这个服务器至今产出的渲染确实有 worklet。

它对本文件的结论是：前面的二分比较的是两边都有 worklet 的图，这一点现在由探针自己断言，而不是假设。探针每次运行都会打印

```
browser context: origin=http://127.0.0.1:42153 secure=true baseProtoAudioWorklet=present ctx.audioWorklet=object addModule=function AudioWorkletNode=function
browser worklet evidence: limiterKind=worklet
```

并新增两条检查：两边都必须有 `offline context` 上的 AudioWorklet（同图形状），且 limiter 路径必须一致。任何一个不成立，比较就没有意义，探针会以 `FAIL` 说出来。浏览器侧不摆回退的证据是它自己报的 `limiterKind=worklet`（只有模块加载并建成 `AudioWorkletNode` 才可能是 worklet），加上 GS-1 在场 guard 在浏览器里是 11.04 dB（若没有 host，ON 渲染就等于 OFF 渲染，不可能是 11 dB）。

### 这是产品事实，不只是笔记

同一条规则有一个真实的部署危险：从非 secure origin 打开的页面会静默地失去真峰值限幅与 GS-1。也就是说，用 `http://<局域网 IP>:3000` 或任何非 HTTPS 主机名打开这个应用，`chords`/`lead` 会落到原生引擎、母带会落到 DynamicsCompressor 回退，而界面**此前说的是另一个故事** ✗：它只在 `limiterKind === "fallback"` 时弹"限幅器未能加载，再导出一次/新标签页" ✓——那对一个**非 secure origin** 是**重试也修不好**的建议 ✗✓。**现已改正** ✓：导出面新增 `workletsUnavailable` 与 i18n `export_wav_no_worklets` ✓，排在 GS-1/limiter 消息**之前** ✓，直接说明是 origin 不安全 ✓✓（判据 `src/test/workletsUnavailable.test.ts` 4 条 ✓；真实浏览器双侧实测见 `scripts/probe_worklet_surfaces.mjs` ✓）。MCP 服务器的渲染不受影响（它用 127.0.0.1），但"这个渲染用了哪个限幅器、GS-1 有没有生效"是调用方有权知道的事实。按业主的划分，把这个事实报给用户是产品侧的事，本文只负责把它测出来并写下来。

### 一处自我更正

为了记录"浏览器到底加载了哪些 worklet 模块"，我曾给 `window.OfflineAudioContext` 装了一个构造器包装（记录 `addModule` 调用）。装它的那两次运行里，浏览器的一次 GS-1 关渲染返回整段静音；把它去掉之后的运行都是干净的。我因此撤回报"静音缺陷也出现在浏览器侧"这句话：目前所有干净的观察里，整段静音只出现在 Node 宿主，而且是由没有装任何包装的 `repeat.ts` 测出来的（第 6 节候选 5 的计数）。探针也不再做任何会改动图的插桩，只做只读的探测。

## 为什么分期而不是现在就做

引擎今天已经能在 Node 里跑，但两个宿主之间测出来的差高于本仓库自己用来判定"两个引擎、同一个声音"的量级。现在切过去，就是原裁定担心的那个"第二个声音"，只是换了条路到达。先把它测小、或者把它指名为一个原语并重新标定容差，再切。
