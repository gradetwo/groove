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

---

## 十三、✗✓✓ **我的 IR 读数被纠正：应用的脉冲是 1.695 秒，不是 2.092 秒**（2026-10-01，由分块 agent 实测纠正）

我在 `docs/HEADLESS_CORE_PLAN.md` 的"② 分块：代价已量"里写：**尾巴要 2.092 秒**才落到 −60 dB ✓，并据此判断分块的**前卷至少要 2 秒** ✗✓。**分块 agent 纠正了我** ✓✓：

* `ReverbBus.buildImpulse` = **pre-delay + 30 ms 早期反射 + decaySec + 50 ms pad** ✓ → **应用自己的脉冲是 1.695 秒** ✓✓；
* 我量到的 **2.092 秒，是"那段脉冲卷积了我喂进去的 0.5 秒信号"** ✗✓（1.695 + 0.5 ≈ 2.2 ✓）；
* ⇒ **前卷的下限是 IR 长度（1.695 秒）** ✓✓，**不是 2.09 秒** ✗；而它的默认（`resolveRenderTailSec`，此处 **1.75 秒** ✓）**已经到位** ✓✓。

**这条纠正的实际后果相反于我原来的判断** ✓✓：我原以为"它的 0.8 秒前卷太短、需要 2 秒" ✓——**前半对（0.8 秒确实太短 ✓），后半错（不需要 2 秒，1.7 秒就到底 ✓）** ✗✓。**所以 2.5 秒相对 1.7 秒不该有额外收益** ✓——**这使那轮扫描从"找一个数"变成"检验一个断言"** ✓✓，**而后者才是它该做的** ✓。

**我错在哪** ✗✓：**我把"信号 + IR 的卷积结果"当成了"IR 的长度"** ✓——**测的是一个复合量，却当成单一量引用** ✓✗。这与今天另外三次**同源** ✓：**`grep` 的模式 vs 仓库** ✓、**消费端 vs 生产端** ✓、**视图 vs 数据源** ✓、现在**复合量 vs 单一量** ✓——**都是"把一层的东西当成另一层的东西"** ✓✓。

---

## 十四、⭐ 报告的 P0-1（小提琴高八度）**两条路都不复现**，而且她的归因不成立 ✗✓✓（2026-10-01）

**她的报告** ✗：`render_instrument_note({assetId:"vsco2ce:ViolinEnsSusVib", midi:60, seconds:2.0})` → **主峰 523.8 Hz** ✗，归因为 **VSCO-2-CE 上游数据错位**（文件名 `VlnEns_susVib_B2_v2.wav` ✓、SFZ `pitch_keycenter=59` ✓、实际音频 B4 ✗），并建议**给该 SFZ 加音高偏移校正** ✗。

**我的实测（同资产、`render_instrument_note`、自相关求基频 ✓）**：

| 资产 | midi | 实测 | 应为 | 偏差 |
| --- | --- | --- | --- | --- |
| `vsco2ce:ViolinEnsSusVib` | 59 | **246.4 Hz** | 246.94 | **−4 音分** ✓ |
| `vsco2ce:ViolinEnsSusVib` | **60** | **260.9 Hz** | 261.63 | **−4 音分** ✓✓ |
| `vsco2ce:ViolinEnsSusVib` | 62 | **294.0 Hz** | 293.66 | **+2 音分** ✓ |
| `vsco2ce:CelloEnsSusVib` | 60 | **260.9 Hz** | 261.63 | −4 音分 ✓ |

**⇒ 与我自己经 `render_arrangement` 采样 lane 的实测一致** ✓✓（同一个资产 midi 60 → **260.9–262.5 Hz** ✓）→ **两条工具一致、音高正确** ✓✓ → **"上游数据错位"不成立** ✗✓。

**523.8 恰好是 261.9 的二次谐波** ✓✓——**谱峰法取到的是第二谐波而不是基频** ✓，这是持续弦乐最常见的读数陷阱 ✓（基频能量常常不是最大峰 ✓）；**而反证就在她自己的报告里** ✓✓：**同一乐器 midi 64 → 330.0 Hz** ✓（E4 正确 ✓）——若真是系统性八度错位 ✗，那一条也该错 ✓。

**⚠️ 这条的重要性在于修复方向** ✗✗✓：若照报告给该 SFZ 加"音高偏移校正" ✗，**会把一个本来就正确的乐器改坏** ✗✗——**判据应当立刻把这件事钉住** ✓✓（见下 ✓）。

**我未能核实的部分（写明 ✗✓）**：她的那一次调用**落到 SFZ 的哪个 `.wav` 区域** ✗——若某个**特定区域**的录音确实标错 ✓，我的 midi 59/60/62 可能没走到它 ✓。**所以正确的表述是**："**在这三个音符上，两条路都正确**" ✓，而**不是**"整个乐器一定没有坏区域" ✗✓。**要证伪后者需要**：让她给出那一次的**逐字调用**与**命中的采样文件名** ✓，或按 SFZ 的 keyzone 边界逐个区域测 ✓。

**判据（下一步，明确）** ✗✓：把"**midi 60 → ~261.6 Hz**"钉死 ✓，**并且删掉/加上偏移即红** ✗✓——**这条判据的价值正是防止照报告去改坏它** ✓✓。

### 附：这条判据落地了，而**删除测试纠正了我对代码路径的判断** ✓✓

**判据** ✓：`scripts/probe_instrument_pitch.mjs` ✓——经 `render_instrument_note` 播 midi 59/60/62（小提琴）与 midi 60（大提琴对照）✓，**自己读回 WAV 用自相关求基频** ✓（不用 `analyze_audio`：它不报基频 ✗；不用谱峰：持续弦乐的第二谐波常常强于基频 ✗✓——**那正是这份报告踩的坑** ✓）。断言 ±25 音分 ✓。

**结果** ✓✓：**全部通过**（−4 / −4 / +2 / −4 音分 ✓）；**真实退出码**：绿 → **0** ✓、故意收紧到 ±1 音分 → **1** ✓✓。

**⭐ 删除测试教了我两件事** ✗✓✓：
1. **加偏移必须改对地方** ✓：我先在 `src/audio/samplerVoice.ts` 的 `playbackRate` 上加了 +1 半音 ✗ → **判据仍然全绿** ✗✓——因为 **`render_instrument_note` 根本不走那条路** ✗✓：它的 handler 调的是 **`auditionInstrumentNote`** ✓，实现在 **`mcp/render/worker.ts:1109`** ✓，速率在它的 `page.evaluate` 里设 ✓（≈1148 行 ✓）。**改那处之后，四条全红（96–101 音分）** ✗✓，还原即绿 ✓✓。**若跳过删除测试，我会交出一条"改什么都绿"的判据** ✗✗。
2. **我读退出码读错了对象** ✗✓：`node probe | tail -2; echo $?` 报的是 **`tail` 的**退出码 ✗✓，不是探针的 ✓。**改成重定向到文件再读 `$?`** ✓✓ 才得到 0 / 1 ✓。**同一天第 N 次"读数测错了对象"** ✗✓。

### P0-3（采样 lane 在 `render_arrangement` 里被 skip）**不复现** ✓✓（2026-10-01，实测）

**做法** ✓：经真实 MCP ✓——`create_arrangement{blankKind:"sampler"}` ✓ → `set_arrangement_track_instrument{trackId:"sampler-1", assetId:"vsco2ce:ViolinEnsSusVib"}` ✓ → `add_arrangement_notes`（C4/E4/G4 各 0.9 拍 ✓）→ `render_arrangement{bars:1}` ✓。

```
设乐器 OK ✓ · 加音符 OK ✓ · 渲染 OK ✓
skippedLanes = null            ← 没有被 skip ✓✓
path = 有 ✓ · durationSec = 16.600022675736962
```

**结论** ✓：**采样 lane 参与渲染、没有被 skip** ✓✓。这与此前那条 note-off 修复的现场一致 ✓（`skip` 机制今天也变了 ✓：不可安置的音会进 `skippedLanes[].reason` 说清原因 ✓，而不是静默消失 ✓）。

**⚠️ 但这一跑露出一个我解释不了的数** ✗✓：**`render_arrangement` 的 `bars: 1` 产出 16.6 秒** ✗，而 `render_audio` 在同一 bpm 下是 **1.937 秒/小节 + 1.693 秒尾巴**（本文件 §十四 的算术 ✓）✗✓ → **同一个参数名在两条工具上不是同一个量** ✗✓。**未解释，记为开放线索** ✗✓——**不许**用"大概是默认 clip 长度"糊过去 ✗，要量就量排列自己的 clip 长度 ✓。

---

## 附 A（`fix-arrangement-hang`）：`render_arrangement` 大 arrangement 挂起：**在本机未复现**，而"响亮失败"这一半是实测的（分支 `fix-arrangement-hang`）

> 报告的 P0「大 arrangement `render_arrangement` browser worker hang」此前**无人复现**。本次先做的不是修，而是**量**：经**真 MCP**把夹具从 1 轨 1 小节一路推到 **32 轨 128 小节 2144 音符**，看它是完成、是响亮失败、还是静默挂起。

**做法** ✓：新探针 `scripts/probe_arrangement_scale.mjs`，经真 MCP 建夹具（`create_arrangement` → `add_arrangement_track` → `set_arrangement_track_instrument`（字段 `arrangementId`/`trackId`/`assetId`）→ `add_arrangement_notes`（字段恰为 `pitch`/`startBeats`/`lengthBeats`/`velocity`）→ `set_arrangement_bars` → `render_arrangement`），带 `progressToken`，并同时记墙钟、进度通知、回复字段（`renderedAudioLanes` / `skippedLanes[].reason` / `problems`）与**本 server 自己的** Chromium 进程树峰值 RSS。命令与结果逐字：

```bash
npm run mcp:build
node scripts/probe_arrangement_scale.mjs --samplers=N --bars=B --notes=K [--watchdog=S] [--killAfterChromium=S] [--rerender=1]
```

| 夹具（sampler 轨 × 小节 × 每轨音符） | 墙钟 | 音频 | 结果 | Chromium 峰值 RSS |
| --- | ---: | ---: | --- | ---: |
| 1 × 1 × 2（当时新轨还带 3 个 starter 音） | 45.7 s | **2.600 s** | 完成 ✓ | 665 MB / 6 进程 |
| 8 × 8 × 16 | 49.3 s | **16.600 s** | 完成 ✓ | 1123 MB / 7 进程 |
| 16 × 32 × 32（560 音符） | 79.7 s | **64.600 s** | 完成 ✓ | 961 MB / 7 进程 |
| **32 × 128 × 64（2144 音符，`MAX_BARS`）** | **394.9 s** | **256.600 s** | **完成 ✓，`renderedAudioLanes=32`、`skippedLanes=none`、`problems=0`** | 1564 MB / 7 进程 |

**音频长度是排列自己的**（`set_arrangement_bars`；默认 8 小节）：`durationSec = 小节 × 2.0 s + 0.6 s`尾巴，120 BPM（`arrangementCompile.ts:256` 的 `DEFAULT_ARRANGEMENT_BPM = 120`、`arrangementEdits.ts:49` 的 `DEFAULT_BARS = 8`）✓✓ → 这**就是**上面那条"16.6 秒解释不了"的答案：**默认 8 小节**（8×2.0+0.6），不是 clip 长度 ✗✓。

**⇒ 结论** ✓✓：**在这四个尺寸上，大 arrangement 都完成了，没有一次静默挂起；最大的那次 395 秒 / 256.6 秒音频，远在 900 秒预算内。** 所以本机**不能**说"挂起已修"，只能说**未复现**（**not reproduced here**）——**约束是墙钟而非内存**（峰值 1.56 GB，机器 15 GB）；也没有撞到进程寿命（同一 server 内每次新起页面，收尾都回到 0 个 Chromium）。

### 15.1 它现在**确实**以响亮失败示人（预算、存活检查）

**预算那一半**（本次新增判据）✓：`src/test/renderWorkerResilience.test.ts` 原本只钉住**句子**（`renderTimeoutMessage`），没有钉住**产生它的 race**。现在 `withRenderTimeout` 被导出，判据三个方向：慢但在预算内的工作仍 resolve ✓、**永不结算的渲染 reject 并指名内容与秒数** ✓、渲染**自己的**失败（`no sample …`）不被改写成超时 ✓。实测 `npx vitest run src/test/renderWorkerResilience.test.ts` → **7 passed**。

**删除测试** ✗✓（逐字）：把 `withRenderTimeout` 的 race 换成 `return await work;` 后，同一条判据**不是断言失败，而是超时**——那正是"静默挂起"的形状：

```
× the render budget > rejects a render that stops answering, instead of leaving the caller pending 5039ms
  → Test timed out in 5000ms.
```

还原后 **7 passed** ✓✓。

**存活那一半**（实测）✓：`--killAfterChromium=8|30` 杀掉**本 server 自己的** 6–7 个 Chromium（按 `/proc/<pid>/stat` 的父子关系找，不用进程名——按名会杀到别的工作树）。两次都得到**可读的失败**而不是挂起：

```
kill 浏览器出现后 30s（渲染中）：失败  墙钟 32.7 s，进度通知 3 条
  → page.evaluate: Target page, context or browser has been closed
kill 浏览器出现后 8s（导航中）：失败  墙钟 9.6 s
  → page.goto: Target page, context or browser has been closed
  第二次渲染（--rerender=1）：完成 ✓ 墙钟 66.7 s，durationSec=128.6
  ⇒ 存活检查重建了浏览器，会话继续 ✓
```

**⇒ "要么完成、要么带原因失败、绝不静默挂起"**：在本机**四个尺寸 + 三次杀页**上都成立 ✓✓。**没证明的** ✗：这不是"挂起不存在"，而是"**在这台机器、这些尺寸上没复现**"；也**没有**触发过 900 秒预算本身（最大 395 秒），预算只由单元判据与句子钉住，未端到端撞到过 ✗✓。

**`skippedLanes[].reason` 这一半本次没有端到端造出来，原因已量** ✗✓：把 `GROOVE_SAMPLE_ROOT` 指向一个不可达的根（`http://127.0.0.1:9`）重跑，2 条 vsco2ce 采样 lane **照常渲染、`skippedLanes=none`、`durationSec=2.6`**——因为这些资产的地址来自 manifest 自己的 `repo`/`pin` 拼出的**绝对** `raw.githubusercontent` URL（`src/data/sampleManifest.ts:270`），`sampleMirrorRoot()` 管不到它们。所以"lane 为什么没出声"这半的现场证据仍是**已有的判据与报告本身**（`src/test/skippedLanes.test.ts`、`src/test/audioLaneOfflineRender.test.ts`，以及本文件 §十四 里实测到的 `note 60 has no playback…`）✓，而不是本次新造的 ✗。

### 15.2 探针自己犯的两个错（记下来，免得下一个人重犯）

1. **固定延迟的杀页什么也没杀** ✗✓：45 秒的计时器在一个 29 秒就结束的渲染之后才到，`clearTimeout` 先把它取消了——日志里**没有** `✂` 那一行就是证据 ✓。改成 `--killAfterChromium`（等浏览器出现再倒数）后杀到 6/6、7/7 ✓。
2. **完成的探针不退出** ✗✓：被 SIGKILL 的 MCP server 的 stdout 管道可能被孙进程（Vite）持有，探针的 `data` 监听于是让它一直停在 `epoll_wait`——实测一次 16 轨运行**结束后仍活了 12 分钟**，还得手杀。现在收尾显式 `process.exit()` ✓。

## 附 B（`fix-arrangement-hang`）：`apply_gs1_patch` 今天接受的参数面——**逐条清单**

报告 P1「GS-1 逐参数写入未暴露」**成立**，而且已有裁定（`docs/GS1_PATCH_SURFACE.md` §7「仍然不做的：逐参数编辑器」）。本次把它从"概述"变成**清单**，落在同一文档新增的 **§8**，全文 224 行逐条可查。要点与可复现命令：

* **工具今天的音色入参只有一个** `patch`：一个 `gs1.1.` share code（或 `null` 清除）；`genreId`/`pattern`/`track` 与音色无关（`mcp/registry.ts:1284-1295`）。
* **一个 code 能装 224 个参数**（`DEFAULT_PARAMS`，`gs1PatchCode.ts:76` 按 id 升序），外加路由 `r`；其中**只有 84 个**在 vendored 表里有标签 + 声明范围（`PARAM_SPECS`），另外 **140 个**只有枚举名与默认值（开关、波形/类型、LFO 目标、`TEMPO`、FX 链序、6 槽 graph、4 槽调制矩阵、过采样覆盖）。
* **缺口清单**：逐参数写入 **224 个里 0 个可单独写**；调制路由 **0 条可单独写**；**19 个具名预设**（`GS1_PATCHES`）**0 个可按名写**（只能间接经 `instrument` 名映射）。
* **引擎侧本来就有** `Gs1Host.setParam/setPatch/setModRoute`（`Gs1Host.ts:184/188/196`）→ 缺的是**暴露**，不是能力。
* **为什么本次仍只记录**：写侧第一步是一次**决定**（把上游 `buildPayload` 编码器按哈希 pin 进 `vendor/gs1/`，还是加一个并入唯一解析缝 `resolveGs1Lane` 的覆盖字段）；在这仓库里手写编码器就是给同一格式写第二份实现，正是 `gs1PatchPassthrough.test.ts` 用 synth 自己的编码器产物做 fixture 要防的。**读侧的第一步不需要编码器**：一个 `get_gs1_patch`，用已有的 `decodeGs1PatchCode` 把某轨 code 的 224 个值与路由读回来。范围校验也不能照抄 `PARAM_SPECS`（§4 的测量：`phonk` 的 `osc2Pitch = 31` 会被它拒掉）。

**复现清单**：`npx vite-node scripts/report_gs1_params.ts`（本次新增，读 vendored 表逐条打印；224 行与 §8 的表逐字一致）。

## 附 C（`fix-arrangement-hang`）：MCP 创建不再播种 starter notes，并在仍在时具名

**已按业主决定实施** ✓：`createMcpArrangement` 与 `addMcpTrack` 不再把 `defaultContentFor` 的 4 个 pitch 60 音符带给调用者（`mcp/arrangement.ts`），但**保留** sampler 轨的默认 asset——那是身份（没有它 lane 解析不到东西），不是内容。app 的 starter 体验不变（`createArrangement` 原样）。

**"仍在播种时要具名"** ✓：`summariseArrangement` 用新 `carriesStarterNotes`（`src/data/arrangementEdits.ts`）逐音符比对"未被碰过的 starter 内容"，命中即进 `problems`；`render_arrangement` 的回复新增 `arrangementProblems`（`mcp/registry.ts`），所以"这条轨道还带着你没写的 4 个 starter 音"在**渲染的回复**里也看得见，而不只在 `get_arrangement` 里。

**实测与判据**（`npx vitest run src/test/mcpArrangement.test.ts` → 29 passed）：
* 新判据：blank / template / `addMcpTrack` 三条路的每条轨道 `notes` 都是 `[]`，且 sampler 的 `sampleAssetId` 仍是 `virtuosity-drums-basic`；
* 新判据：`createArrangement` 播下的 starter 内容被 `problems` 具名，**加一个音符后就不再具名**（两个方向）；
* **删除测试**：把 `createMcpArrangement` 的 `notesByTrack: {}` 还原成 `seeded`，第一条判据**当场变红**（`expected [ { pitch: 60, …(3) } ] to deeply equal []`），还原即绿 ✓✓；
* 受影响的旧判据已按新行为改正、**不是放宽**："flattens to something the renderer can bounce" 现在**由调用者先写一个音符**再 flatten（旧版测的其实是 starter 内容，正是本次要移除的东西）。

## 附 D（`fix-arrangement-hang`）：一步一格的**和弦列损失**被具名，不改和弦的听感

**业主决定（不把整叠音弹出来）已遵守** ✓：`stepsFromNotes` 的"每列保留最低音"原样不动，`Math.min` 不动。新增的是**报告**：`collapsedNoteColumns`（`src/data/noteEvents.ts`）镜像同一套取整与 `Math.min`，返回每个"两个以上音符起始"的列、保留音高与被丢音高；`summariseArrangement` 把它写进 `problems`（也因此进入 `render_arrangement` 的 `arrangementProblems`）。

**实测与判据**（同上 29 passed）：
* 三个音（60/64/67）同在第 0 步 → `problems` 出现 `puts 3 notes in step 0 and a step column keeps one pitch (keeps 60, drops 64, 67)`，且该轨 `notes` 仍是 **3** 个（报告不改数据）；
* 一列一个音 → **不报告**（反方向）；
* **删除测试**：删掉 `summariseArrangement` 里这一段，第一条断言变红。

**未做且不建议顺手做的**：把整叠音送出（`pitches` 多值）会改变所有既有和弦的听感，是产品决定；本次只把沉默变成一句可读的话。

## 附 E（`fix-arrangement-hang`）：`render_arrangement.bars` 现在是"重复次数"，与描述一致

**已按"两个方向都量过"的做法修掉** ✓：handler 原来写死 `bars: 1`（`mcp/registry.ts`），而 schema 与描述都承诺 "raising it repeats the arrangement … it drives the duration"。现在传 `passes = args.bars ?? 1`，回复里同时给三个数：

* `bars`：排列自己的长度——取自**模型的 summary**，不再取 `flattenMcpArrangement().bars`（后者在**没有音符**的排列上是 1，而它的 `totalSteps` 仍是 128；移除 starter notes 之后，这恰好是 MCP 调用者的起点 ✗✓）；
* `passes`：这次渲染了几遍（就是 `bars` 问的那个数）；
* `totalSteps`：一遍的步数（原样）。

判据 `src/test/mcpRenderArrangementBars.test.ts`（mock 掉 `renderAudio`，不花浏览器）：`bars:3` → 渲染器收到 `bars:3`、回复 `passes:3`、`bars:8`；省略 → `bars:1`、`passes:1`；`bars:2` 不改写排列自己的 `bars:8` / `totalSteps:128`。**删除测试**：把 `bars: passes` 还原成 `bars: 1` → 第一条判据 `expected 1 to be 3` 当场变红，还原即绿 ✓✓。工具描述与 `docs/MCP.md` 两处 `render_arrangement` 行已一并改到与代码一致（不再说 "An arrangement is one bar of sixteen steps"）✓。
