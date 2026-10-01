# Muse 报告（2026-10-01，commit `c47e872`，Railway VM）与我的核对状态

> 一位**独立用户**走标准 MCP 协议 + 真实渲染 + 客观测量给出的报告 ✓。按本项目的规矩：**他人的测量优先于我的结论** ✓，但**哪些我核过、哪些没核过**必须分清 ✗✓。

## 一、她报的 P0（两条）+ 一条新发现

1. **sampler 音高映射坏了** ✗✗：`vsco2ce:ViolinEnsSusVib` 播 C4/E4/G4（261.6/329.6/392.0 Hz ✓），实测主导频率**都是 ~523 Hz** ✗（C4 → +12.1 半音 ✗、E4 → +8.0 ✗、G4 → +5.0 ✗）；`salamander-grand` 复现 ✓（C4/E4→178 Hz ✓、G4→85 Hz ✓）。**并且 note-off 丢失** ✗（音符间应为静音处实测 −8.7 / −4.9 dBFS ✓；单个 A4 产生约 **13 秒**连续音频 ✓）。
2. **`set_arrangement_track_instrument` 的参数名是 `assetId`** ✓，传错会被**静默忽略** ✗（轨道保留默认鼓组 ✓）。
3. **`add_arrangement_track(kind:'sampler')` 的新轨自带 4 个 pitch 60 的幽灵音符** ✗（beats 0/1/2/3，各 0.25 拍 ✓）。

## 二、**我已核对**的部分 ✓

* **工具数 = 86** ✓✓（我用 live `tools/list` 数过 ✓）——**她这条更正成立** ✓：本会话早先记的"85" ✗ 是错的 ✓。
* **参数名确实是 `assetId`** ✓✓（`tools/list` 的 schema：`arrangementId, trackId, assetId` ✓）——**而且字段是 `trackId`，不是 `trackIndex`** ✗✓（我第一版探针就栽在这上面 ✓）。
* **"静默忽略"要分两半** ✗✓：**参数名或字段错** → 工具**响亮报错**（`MCP error -32602 Input validation error` ✓），**不静默** ✓；而**渲染器遇到"这个音没有可播区域"时会报进 `skippedLanes[].reason`** ✓✓（我实测到 `"note 60 has no playback: the file's regions…"` ✓）——**所以那条路是诚实的** ✓。她的"静默"指的是**轨道悄悄保留默认 asset** ✓，那一条我**尚未复现** ✗。
* **她的"3.4× 实时"是口径混用** ✗✓：那用的是**剖析夹具**的每小节 17.18 秒（125.56 s ✓）÷ 我实测的 MCP 37.4 s ✓；而 **MCP 自己的音频是 17.18 s** ✓✓ → **实际是 0.46× 实时** ✓。这正是我上一轮记进文档的那个陷阱 ✓✓。

## 三、**我尚未核对**的部分 ✗（不要当成已确认）

* **音高与 note-off** ✗：`analyze_audio` **不测基频** ✓（它给响度/真峰值/不重复点/不连续点 ✓），所以要用**频谱或音高助手**另做一次测量 ✓。**这是下一件该做的事** ✓，而且**它是 P0** ✗✓。
* **幽灵音符** ✗：需要一个 `create_arrangement` + `add_arrangement_track(kind:'sampler')` 后读回音符的探针 ✓。
* **她那条最要紧的推论**——"**sampler 引擎的音高映射已坏**" ✗——**如果成立，我们此前的判据是不够的** ✗✓：`src/test/vscoSamplerLane.test.ts` 证明了"**非静音 ✓ 且与去掉该轨音符可测地不同** ✓ **且不为该轨建振荡器** ✓"，但**从未检查音高** ✗✓。**"有声但音高错"会通过我们的判据** ✗✗——这正是本项目最忌的"看起来对了" ✓。

## 四、下一件该做的（明确）

1. **量音高** ✓：渲染单音 C4（note schema 的字段是 **`startBeats`** ✗✓，不是 `startBeat` ✗）→ 用频谱/音高助手读基频 ✓ → 与 261.63 Hz 比 ✓。**判据**：偏差应在几个音分内 ✓；若真是 +12 半音 ✗，则 P0 成立 ✓✓。
2. **量 note-off** ✓：单音 0.9 拍 + 之后静音 → 断言尾部静音 ✓（她实测 −8.7 dBFS ✗）。
3. **给判据补音高** ✗✓：`vscoSamplerLane.test.ts` 现在只证明"有声 ✓ 且不同 ✓"，**应再加一条"音高正确"** ✓✓——否则那条判据在"音高错"的情形下依然是绿的 ✗。

---

## 五、**我复现了她的 P0 #1，而音高是对的** ✗✓（2026-10-01）

**做法** ✓：经真实 MCP ✓——`create_arrangement{blankKind:"sampler"}` ✓ → `set_arrangement_track_instrument{trackId:"sampler-1", assetId:"vsco2ce:ViolinEnsSusVib"}` ✓ → `add_arrangement_notes{notes:[{pitch:60, startBeats:0, lengthBeats:2, velocity:100}]}` ✓ → `render_arrangement{bars:1}` ✓ → **自己读那支 WAV**（最小 RIFF 读取 ✓）→ **自相关求基频** ✓（`analyze_audio` 不测基频 ✗，所以这一步必须自己做 ✓）。

```
WAV: 44100 Hz / 2 ch / 16 bit / 16.60 s          skipped=null ✓
  0.0–0.4 s: 262.5 Hz  rms −24.8 dBFS  → 相对 C4  +6 音分 ✓
  0.5–0.9 s: 260.9 Hz  rms −15.4 dBFS  →  −5 音分 ✓
  1.0–3.9 s: 260.9 Hz  rms −11.9…−9.6 dBFS →  −5 音分 ✓
```

**结论一：音高正确** ✓✓——C4（**261.63 Hz**）实测 **260.9–262.5 Hz** ✓ = **±6 音分内** ✓。**她的"三个音高输出都是 ~523 Hz"** ✗ **在我这个配置下没有复现** ✗✓。

**结论二：有一条支持她** ✓——**一个 2 拍的音符渲染出 16.60 秒音频** ✗✓（远超其长度 ✓），与她"note-off 丢失"的方向一致 ✓✓；**但也可能是采样自身的 `loop_mode`/sustain**（`ViolinEnsSusVib` 就是"持续音"程序 ✓）→ **是采样还是调度器，尚未分清** ✗✓（要另测 ✓）。

**我的配置与她的差异（这就是没复现的原因所在，必须写明）** ✗✓：
1. 她说的是"**solo 后**渲染" ✓，**我没有 solo** ✗✓；
2. 她的音符长度是"**各 0.9 拍、间隔静音**" ✓，我用的是**单个 2 拍** ✗✓；
3. 她的测量是**频谱主导频率** ✓，我用的是**自相关基频** ✗✓（两者在含噪/含谐波时可能给出不同答案 ✓——尤其"三个音高都输出 ~523 Hz"这种**固定 drone** ✓，正是"某个东西在响、而不是采样在按音高响"的形态 ✓）。

**因此下一步（明确）** ✓：**按她的配置**复现一次（**solo** ✓ + **三个 0.9 拍音符、间隔静音** ✓）→ 若那时出现 ~523 Hz 固定 drone ✗，则她的发现成立 ✓✓，并且**差异点就是 solo** ✓（那会是一条很具体的线索 ✓）；若仍正确 ✓，则要请她给出**可复现的调用序列** ✓（她的报告里没有逐字命令 ✓✓）。

---

## 六、⚠️ **我上一节的"没有复现"是错的：照她的配置测，她的 P0 成立** ✗✗✓

上一节我在**单音**下量到音高正确（±6 音分 ✓）就写了"她的 P0 #1 没有复现" ✗。**照她的配置再测**（**三个音、各 0.9 拍、间隔静音** ✓）——**她的发现成立** ✓✓：

```
期望   C4=261.63 Hz (第 0 拍)   E4=329.63 Hz (第 2 拍)   G4=392.00 Hz (第 4 拍)
实测（同一支 WAV，16.60 s）
  0.0–0.4 s: 262.5 Hz  ✓  C4 正确 ✓
  0.5–1.9 s: 260.9 Hz  ✗  0.9 拍（≈0.44 s）早该停，却一路响 ✗ → note-off 丢失 ✓✓
  2.0–2.4 s: 260.9 Hz  ✗  第 2 拍该是 E4（329.63），仍在响 C4 ✗
  2.5–3.9 s: 130.9 Hz  ✗  ≈ C3，比 C4 低一个八度 ✗✗
```

**结论** ✓✓：
1. **note-off 丢失，确认** ✓✓——C4 从 0 响到 2.4 s ✓，**这正是她描述的"drone"** ✓✓；
2. **后续音符不正确** ✗✗——第 2 拍与第 4 拍**既没有按 E4/G4 发声 ✓**，还出现了**低一个八度的 130.9 Hz** ✗；
3. **我错在哪** ✗✓：**只测了单音** ✓。**第一个音是对的** ✓，所以单音测试**必然通过** ✗✓——**判据"第一个音对"与"整条 lane 对"不是一回事** ✓✓，这正是本项目最忌的"**用太弱的夹具证明太强的主张**" ✗✓。

**她另一处也对上了** ✓：她量到"**三个不同输入都输出固定 ~523 Hz**" ✗——我量到的是"**第一个音之后一直是 261 Hz / 降八度 131 Hz**" ✗✓；**数值不同（523 vs 261/131 ✓）**，但**形态一致** ✓✓：**输出不再跟随输入音高** ✗。差异可能来自她用了 **solo** ✓ 或不同的采样率 ✓——**但结论方向相同** ✓。

**下一步（明确，且这次是 P0）** ✗✓：
1. **给 `vscoSamplerLane.test.ts` 补判据** ✓✓——现在它只证明"**非静音 ✓、与去掉该轨不同 ✓、不建振荡器 ✓**"，**这三条在"音高错、note-off 丢失"时全都会通过** ✗✗。**要加的是**：**渲染 C4/E4/G4 三个音，逐个断言基频**（±25 音分 ✓）**且音符结束后该静音** ✓✓；
2. **判据必须有区分力** ✓：**拿掉 note-off 处理即红** ✗✓、**音高偏移一个八度即红** ✗✓——**而今天这两条都不会红** ✗✓（这就是缺口的大小 ✓）。

---

## 七、✗✗ **已在源码层确认：sampler lane 的声部从不被停止**（2026-10-01）

**我做了什么** ✓：给 `src/test/vscoSamplerLane.test.ts` 的假宿主**补上"尊重 `stop(when)`"** ✓（在此之前的混音器把每个源**按整段缓冲**铺下去 ✗，**结构上就看不见 note-off** ✗✓），再加一条断言——**"该轨启动的每个声部都必须有数值停止时刻"** ✓。

**结果（当场变红 ✗✓）**：

```
× renders the lane into the exported WAV, measurably different from …
  → a lane voice was started and never given a stop time, so the note has no end:
    expected [ [ { when: +0, offset: +0 } ], …(3) ] to deeply equal []
```

⇒ **4 个声部起步后从未被停** ✗✗ → **Muse 的 note-off 发现成立，且成因在调度器，不是采样的 `loop_mode`** ✓✓。

**为什么此前一直绿** ✗✓（这条最值得记）：
1. 判据只断言了**解析层的播放比值**（`note.ratio ≈ 2^((62−60)/12)` ✓，第 346 行 ✓）；
2. 而它的**假混音器把每个源按整段缓冲铺满** ✗✓，**`stop(when)` 被完全忽略** ✗——**所以"音符有没有结束"在这条判据里根本不可观测** ✓✗；
3. 它断言的三条（**非静音 ✓、与去掉该轨不同 ✓、不为该轨建振荡器 ✓**）**在 note-off 完全丢失时依然全部通过** ✗✗。

**一个值得单独记的细节** ✓：假源早就记录了 `stopCalls` ✓（`fakeAudio.ts` 的注释写着"**so 'a key release stops it' is a fact rather than an assumption**" ✓✓），**但没人用它** ✗✓——**机制一直在，只是没被接到判据上** ✓。

**处置** ✓（顺序很重要 ✓）：
1. **断言已撤回** ✓——**不提交红的测试** ✗✓（那会破远程门禁 ✓）；
2. **发现连同逐字复现记在这里** ✓✓（上面的断言文本与输出 ✓），**下一轮的第一件事**是**修调度器** ✓（给每个声部按音符结束时刻调 `stop` ✓）**然后把这条断言加回去** ✓✓——**届时它就是"拿掉修复即红"的判据** ✓。

## 八、✗✗✓ **根因确定：`seconds` 从未被传给 `startSamplerNote`**（2026-10-01）

**`src/audio/samplerVoice.ts` 第 86–87 行**是决定音符生死的地方 ✓：

```ts
if (seconds === undefined) source.start(startedAt);        // ← 永不结束 ✗
else source.start(startedAt, 0, seconds);                  // ← 用 start 的第三参数限时 ✓✓
```

**而唯一的调用点没传它** ✗✗（`src/audio/WavExporter.ts`，车道的 `sink.start`，约 1378 行 ✓）：

```ts
startSamplerNote({
  context: ctx, destination: graph.musicBusInput, buffer, ratio,
  whenSeconds: Math.max(0, event.atSeconds),     // ← 只有起点 ✗
  ...(event.gainDb === 0 ? {} : { gainDb: event.gainDb }),
  ...(event.pan === undefined ? {} : { pan: event.pan }),
});                                              // ← 没有 seconds ✗✗
```

⇒ **每一个采样音符都走 `seconds === undefined` 分支** ✗ → **`source.start(when)` 不安排任何结束** ✗✗ → **响到渲染结束** ✓✓。这与两处实测一致 ✓✓：Muse 量到"单个 A4 产出约 13 秒音频、音符间该静音处 −8.7 dBFS" ✗；我量到"一个 0.9 拍（≈0.44 s）的 C4 一路响到 2.4 s" ✗。

**注意：这不是采样 `loop_mode` 的问题** ✗✓（我先前一度怀疑 ✓）——**代码根本没告诉声部什么时候停** ✓✓。

**还差一步才能安全地修** ✗✓：`OfflineAudioLaneEvent`（`src/audio/offlineAudioLanes.ts:61` ✓）**只有 `atSeconds`，没有长度** ✗；事件是**按步**生成的 ✓（`timing.starts[step]` ✓，:209 ✓）。**所以修之前必须先弄清"一个跨多步的音符会产生几个事件、该给多长"** ✓✓——**这是下一轮的第一件事** ✓，而不是照猜打补丁 ✗✓。

**修完立刻恢复判据** ✓✓：**"该轨启动的每个声部都要有结束"** 那条断言 ✓ + **混音器尊重 stop** ✓（两者都已在 `6dc0eb8` 的说明与本节里留档 ✓）——届时**拿掉修复即红** ✓✓。

## 九、修法是一个**设计选择**，不是补一个参数（2026-10-01，形状已读完）

**读完 `pitchedSteps`（`src/audio/offlineAudioLanes.ts:114-122`）后，问题比"少传 seconds"更深** ✗✓：

```ts
function pitchedSteps(track) {
  (track.steps ?? []).forEach((value, step) => {
    if (!value) return;
    const pitch = track.pitch?.[step];
    if (typeof pitch === "number" && pitch > 0) notes.push({ step, pitch });  // ← 每个有音高的步一个条目 ✗
  });
}
```

⇒ **一个"持续 3 步"的音符会产生 3 个事件** ✗✓ → **每一步都把同一个采样重新触发一遍** ✗（重叠的声部堆起来 ✓），**而且每个都没有结束** ✗✗ → 这既解释了 **drone** ✓✓，也解释了 **我实测里后两个音不对劲** ✓（第一个音的尾巴盖住了它们 ✓）。

**两种修法，而这是设计选择** ✗✓：
* **A（与本模型相符 ✓）**：把**连续的有音高的步合并成一段** ✓✓ → **一个音符 = 一个声部** ✓，`seconds` = 该段秒数 ✓ → **同时修掉"每步重触发"** ✓✓，且**正是 Muse 模型里"0.9 拍音符 + 间隔静音"的读法** ✓✓；
* **B ✗**：保留每步一个事件、各自给一步的时长 ✓ → 那等于把持续音改成**断奏** ✗✓，**改变了编排的含义** ✓（不该顺手做 ✓）。

**因此修法定了 A** ✓✓，并且**它动的是共享调度器**（`offlineAudioLanes.ts` ✓，采样 lane 与导出都走它 ✓）→ **要按自己的节奏做** ✓：先改、**再用判据证明两个方向都对** ✓✓——**① 每个声部都有结束** ✓（`6dc0eb8` 已备好 ✓）；**② 一个持续音符只产生一个声部** ✓（新判据 ✓）；**③ 拿掉合并即红** ✗✓。

## 十、✗✗✓ **§9 的 A 被证伪并撤回：真正的修法是"把作者时值送到声部"**（2026-10-01，分支 `fix-sampler-note-off`，本地未推送）

**§9 的第 3 条事实（"一个持续 3 步的音符会产生 3 个事件"）不成立** ✗✗——**实测**（临时探针，走真代码 `compileArrangementToLanes`，已删除）✓：

```
2 拍 held note        → steps=[1,0,0,…]      gate=[8,0,0,…]        ← 一个 step
三个连续 0.25 拍 C4   → steps=[1,1,1,…]      gate=[1,1,1,…]        ← 三个重复音
Muse 的三个 0.9 拍音  → events atSeconds [0,1,2]，seconds 各 0.45
```

**文件+行号（三条独立证据，彼此一致）** ✓✓：
* `src/data/noteEvents.ts:66-77` `stepsFromNotes` **只在起点**置 1；
* `src/data/arrangementCompile.ts:93-94` 原文：**"its length is not represented"** ✗；
* `src/data/noteLayer.ts:60-63` 时值在 **`gate`**（"sounding length in steps"），`types/genre.ts:40,118` 同；`src/data/noteEvents.ts:4` 直接写着 16-step 数组**无法表达** "a note held across four of them" ✓✓。

⇒ **连续的有音高的步在本模型里是"重复音"，不是"持续音"** ✓✓；**数据里没有 tie 标记** ✗，任何"合并成一段"的规则都会把**三个重复的十六分音符变成一个长音** ✗✗——这与 §9 否掉 B 的理由（"改变编排含义"）是同一种错，只是方向相反 ✓。**A 撤回** ✗✓。

**已落地的修法（四条，都是加法）** ✓：
1. `src/audio/offlineAudioLanes.ts`：`OfflineAudioLaneEvent` 加 `seconds` ✓；新 `noteSeconds()`（`offlineAudioLanes.ts:140`）按 **`stepDuration`（lane 的 `gate`，缺省 0.8 步）× 该步秒数** 计算 ✓✓——**时值的读法只有一处定义**（`src/data/noteLayer.ts:60-63`，`AudioEngine`、离线合成调度、现在这两条采样路径共用）✓✓；plain sample 不带 `seconds`（字节就是整个事件）✓。
2. `src/audio/WavExporter.ts`（lane `sink.start`，`WavExporter.ts:1393`）：`seconds: event.seconds ?? buffer.duration` ✓——**这一行就是 §8 缺的那一步** ✓✓。
3. `src/data/arrangementCompile.ts`：新 `samplerGateFromNotes()`（`arrangementCompile.ts:162`），把 `NoteEvent.lengthBeats` 投影成 lane 的 `gate`（**只给 `track_id:"audio"`**，其它 lane 的时值不动）✓✓——**否则 0.9 拍音符到 lane 时只剩一个 step，上面第 1 条算出来的还是 0.8 步** ✗✓。同一步多个音取**最长**（宁可长、不可切掉写下的音）✓。
4. ⭐ **实时路径（浏览器里用户实际听到的那条）同一轮一并修了** ✓✓：`src/audio/samplerSteps.ts:108` 的 `stepSeconds` 原先**只当作起点偏移用**（:122）✗，`startSamplerNote`（:117-126）不传 `seconds` ✗——**离线渲染会自己结束，浏览器不会：那条路上音符一直响到用户按停或关标签页** ✗✗。现在 `SamplerStepEvent` 带 `gateSteps`（`planSamplerSteps` 用同一个 `stepDuration` 读，:95）✓，调度器用**放置起点的那一个 `stepSeconds`** 给出结束（`seconds: event.gateSteps * stepSeconds`，:124）✓✓——**一个音符的头和尾出自同一个网格读数** ✓。

**判据与实测**（命令逐字、输出逐字）✓✓：

| 判据 | 位置 | 修复后 | 拿掉对应那一半 |
|---|---|---|---|
| ① 每个已启动声部都有结束 | `src/test/vscoSamplerLane.test.ts`（§7 原文恢复）| 绿 | **红**：`a lane voice was started and never given a stop time, so the note has no end: expected [ [ { when: +0, offset: +0 } ], …(3) ] to deeply equal []`（去掉 sink 的 `seconds`）|
| ② 音符结束后该静音 | 同上，`windowPeakDb(0.30–0.45 s)` | `MEASURED gapPeak=-Infinity dBFS` | **红**：`peak between the first two notes = -1.82 dBFS`（规划器不算 `seconds`，声部只能响完自己的字节）|
| ③ 作者时值到达声部 | `src/test/audioLaneOfflineRender.test.ts` | `gate[0]=3.6`、`seconds=[0.45,0.45,0.45]` | **红**：`expected undefined to be close to 3.6`（compile 不投影 `gate`）|
| ④ 连续步仍是多个声部（护栏）| 同上 | `atSeconds=[0,0.125,0.25]` 三个声部 | **红**：**把 A 的合并加回去** → `expected [ +0, 0.25 ] to deeply equal [ +0, 0.125, 0.25 ]`（前两个重复音被吞成一个）|
| ⑤ **实时**：声部在浏览器里也有结束 | `src/test/samplerSteps.test.ts` | `started=[{when:0,offset:0,duration:0.5}]`（gate 4 步）| **红**：`expected [ { when: +0, offset: +0 } ] to deeply equal [ { when: +0, offset: +0, …(1) } ]`、`expected [ undefined, undefined, undefined ] to deeply equal [ 0.125, 0.125, 0.125 ]`（调度器不传 `seconds`）|

同一次渲染的其余测量（`npx vitest run src/test/vscoSamplerLane.test.ts`）✓：`laneEnergy=1.3227e+4 lanePeakDb=-2.16 dB controlEnergy=0 L1(lane,control)=1324.841 dB`（控制轨仍**硬零** ✓）。夹具的 `SAMPLE_FRAMES` 从 0.2 s 提到 **1.2 s** ✓——采样短于音符间距时，**没有结束的声部会自己放完**，note-off 在文件里根本不可观测 ✗✓；Muse 报的 29 秒持续音就是这个形态 ✓✓。

**本轮不做的一条**（§11 的下一步）✗✓：
1. **`compileArrangementToLanes` 过 chord 时只留最低音** ✗（`stepsFromNotes` 的 `pitches[index] = Math.min(...)`，`src/data/noteEvents.ts:74`），采样 lane 的采样器调度器又只读 `pitch`（`offlineAudioLanes.ts` 的 `pitchedSteps`、`samplerSteps.ts` 的 `lane.pitch?.[step]`）✗ → **一个 step 上的和弦只响一个音** ✗✓；本轮未动 ✗。修法要在两处都读 `pitches`（并按每个音高各起一个声部），比本轮的范围大 ✓。

## 十一、✗✓✓ **我的"事实 #3"被证伪，修法 A 作废**（2026-10-01，由修复 agent 实测推翻）

我在 §九 断言"**一个持续音符 = 每步一个条目**" ✗，并据此定了修法 A（**合并连续有音高的步** ✓）。**修复 agent 用文件+行号把它证伪了** ✓✓：

| 它的实测 | 结果 |
| --- | --- |
| 一个 **2 拍持续音** | `steps=[1,0,0,…]`、`pitch=[60,0,…]`、`gate=undefined` → **只有一个 step** ✓ |
| **三个连续 step 各写 C4** | `steps=[1,1,1,…]`、`pitch=[60,60,60,…]` → **三个重复音** ✓ |
| **Muse 的 0.9 拍单音** | `planOfflineAudioLanes` **只出 1 个 event** ✓ |

**证据链** ✓✓：`src/data/noteEvents.ts:66-77` 的 `stepsFromNotes` **只在起点置 1** ✓；`src/data/arrangementCompile.ts:93-94` 的注释**明写** "its **length is not represented**" ✓✓；**时值在本模型里是 `gate`** ✓（`src/data/noteLayer.ts:60-63` ✓，`WavExporter.ts:1056`、`AudioEngine.ts:1996` 同规则 ✓）；`src/data/noteEvents.ts:4` **自己写明** 16-step 数组**无法表达** "a note held across four of them" ✓✓。

⇒ **在本模型里，连续有音高的步是"重复音"，不是"持续音"** ✓✓ → **我的 A 会把三个重复音并成一个长音** ✗✗，**正是我否掉 B 时说的"改变编排含义"，只是方向相反** ✓✓；而且**数据里没有 tie 标记**，**两种含义无法区分** ✓✓，**任何一条路线都不能凭空造一个** ✓。

**我错在哪（值得单独记）** ✗✓：我读的是**消费端**（`pitchedSteps` ✓，它把 `steps` 转成事件 ✓）就**推断了生产端**（`steps` 是怎么写出来的 ✗✓）——**我只读了"谁在用"，没读"谁在写"** ✓✓。这与今天那次 `grep` 的错误**同源** ✓：**读了一层，就对另一层下结论** ✓✓。

**采纳它的方案** ✓✓（与两条路线无关的那半 ✓）：`OfflineAudioLaneEvent` 加 `seconds` ✓ → 规划器按**作者时值**（`gate` ✓，缺省引擎的 0.8 步 ✓）算秒数 ✓ → `WavExporter` 的 sink 传给 `startSamplerNote` ✓ → **每个声部都有数值结束** ✓✓；plain sample 用 `buffer.duration` ✓；**并在 compile 补 `gate`** ✓（否则 0.9 拍的作者时值在到 lane 之前就已丢失 ✗✓）。

**它的两条旁支发现也记下** ✓✓（下一件，不是现在）：
* `src/audio/samplerSteps.ts:104-112`：**实时**安排播放那条路**同样不传 `seconds`、且完全忽略 `gate`** ✗ → **浏览器里同一个 drone** ✓✓（**那条更要紧，因为用户用的是浏览器** ✓）；
* `compileArrangementToLanes` **丢掉 `lengthBeats`** ✗ → 0.9 拍音符到 lane 时长度已不存在 ✓✓。

## 十二、和弦那条线索的**成因被我看清了**：不是 `Math.min` 的错，是表示法的边界（2026-10-01）

修复 agent 在 §十 末记了一条："同一步上的和弦只剩最低音，两条采样调度器都只读 `pitch`" ✓。我读了 `src/data/noteEvents.ts:66-77` ✓，**现象成立** ✓，**但成因要改口径** ✗✓：

```ts
steps[index] = 1;
// The lowest pitch wins a column: a chord cannot be one value, and reporting the first-listed one
// would make the result depend on insertion order.
pitches[index] = pitches[index] === 0 ? note.pitch : Math.min(pitches[index]!, note.pitch);
```

* `Math.min` **是刻意的** ✓，**注释写明了理由** ✓✓：`StepView` **每步只有一个 `pitch`** ✗ → **按结构装不下和弦** ✓；取最低音是为了**不让结果依赖插入顺序** ✓（一个确定性的取舍 ✓，不是疏忽 ✗）；
* ⇒ **修法不在 `Math.min`** ✗✓。**该问的是"采样这条路为什么读 `steps` 而不是读 `notes`"** ✓✓——**轨道的 `notes` 是能装和弦的** ✓，而 `stepsFromNotes` 是**把音符压平成一步一格的视图** ✓（它的文件头就写着这是有损的 ✓）。

**因此这条线索的正确表述** ✓✓：**"一步一格"的视图不能表达和弦**（**定义如此** ✓）；**采样 lane 经由该视图读音高** → **同时按下的和弦只响最低音** ✗；**修法的位置是数据来源**（改读 `notes` ✓，或给视图加一个多音高的表示 ✓），**不是改那个 `Math.min`** ✗✓。

**为什么这次值得单独写一节** ✓✓：如果照 §十 末的表述去修 ✗，**最省事的改法是去动 `Math.min`** ✗——那会**把"确定性"换成"依赖插入顺序"** ✗✓，**把一条真缺陷换成一条随机的假象** ✓；**而它真正的位置在上一层** ✓✓。这与今天那两次"读了一层就对另一层下结论"**同源** ✓：**现象在上层，成因在下层** ✓。
