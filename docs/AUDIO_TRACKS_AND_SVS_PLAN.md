# Audio tracks, and an SVS interface that says it is empty — scoping (owner decision 4)

The owner's decision was: **scope audio tracks, and for singing synthesis reserve the interface and leave it empty.** This is the scope, and the stub is
deliberately reachable so the absence is discoverable.

## 1. Audio tracks

**What it means here**: a lane whose steps trigger **samples** rather than a synthesised voice. The library already knows how to hold and play sample data (the
drum kit models are exactly that), so the interesting work is not playback — it is everything else a new lane kind drags with it:

| area | what has to be decided | why it is not small |
|---|---|---|
| the lane model | `track_id` is a closed union of **eight roles** (`src/types/genre.ts:50`); an audio lane is a ninth kind, or an `instrument` mode inside an existing one | owner decision 1A just added `laneId` for **multiplicity**; this is **kind**, which is a different question and touches the same compatibility promise |
| `.groove` | a package would have to reference sample data — by path (not portable), by hash (needs a store), or embedded (size) | the format's promise is that v1 stays readable; samples are the first data that cannot be additive in the same way |
| **PDC** | a sample track has its **own** latency (file offset, any resampling), and PDC's table is the thing that must know it | the comb-filter criterion already exists and the latency table has one measured row; a new source of latency belongs in it, not beside it |
| the delay table | add the audio path's latency as a **measured** row, not a declared one | PDC's own history: the declared limiter latency was never applied until it was measured |
| stems and export | an audio lane in a stem export is a stream copy; in the mix it is a bus | `AbletonExporter` writes one track per lane and would need a rule for a non-MIDI lane |
| the URL share | samples cannot travel in a share link | the codec has a size budget and already refuses what does not fit — this would be a new refusal reason |

**Recommendation**: do it **after** the `laneId` work has settled, because a ninth *kind* and a second *instance* of a kind are the two halves of the same
question, and doing both at once would put two format-affecting changes in one release. The first slice worth building is a **read-only** audio lane: play a
sample in a render, measure its latency into the table, and change no export path — which answers "what does an audio lane cost in PDC" without answering "what
is an audio lane in the format".

## 1b. The owner chose the ninth *kind* — and the blast radius, read from the code

**Decision (2026-09-28): `audio` becomes the ninth `track_id` kind.** So the format question this document was waiting on is answered: an audio lane is a **role**,
not a mode inside an existing one.

Reading it produced one finding worth more than the change itself: **widening the closed union produces exactly one type error** —

```
src/features/customGenre/customGenreCodec.ts(58,5): error TS2322: Type '{ t: "kick" | … | "audio"; … }[]'
  is not assignable to type '{ t: "kick" | … | "fx"; … }[]'
```

— because **the codebase's dispatch sites are mostly not exhaustive**. A closed union is normally the instrument that enumerates its own consequences; here it does
not, so **an audio lane that routes as a drum, or that falls through to silence, fails silently**. The safety has to come from tests, not from `tsc`. The sites
that route by kind, found by **behaviour** rather than by name:

| site | what it decides today | what an audio lane needs |
|---|---|---|
| `src/features/customGenre/customGenreCodec.ts:58` | a hardcoded eight-member union in the **share codec** | the only compiler-visible one: widen it, and carry the sample reference through the compact form |
| `src/data/schema.ts:24` `REQUIRED_TRACK_IDS` | which **roles** a `.groove` package must contain | `audio` must be **allowed** and **not required** — additivity, the same rule as `arrangement`, `slots`, `laneId`, `tempoTrack` |
| `src/data/genreMix.ts:38` `MIX_TRACK_IDS` | per-kind mix defaults from the genre tables | a kind a genre never mentions needs a **defined default**, not `undefined` |
| `src/audio/trackBuses.ts:24` `DRUM_ROLES` | bus routing | a genuine decision: which bus an audio lane belongs to |
| `src/utils/trackUtils.ts:4`, `CompareView.tsx:41`, `GenreDetailView.tsx:72` | three copies of the **drum** set | correct by absence — `audio` is not a drum — and worth a test, because three copies is three chances to drift |
| `src/audio/gs1/gs1Tracks.ts` | GS-1 voice hosts, one per melodic kind | an audio lane plays **no** GS-1 voice; it must be excluded explicitly |
| `mcp/render/worker.ts` and the exporter | one MIDI lane per track | the stated rule: a lane with no MIDI is **skipped and the reply says so** — no export path otherwise changes |
| PDC's latency table | one measured row (the master limiter) | the audio path's own latency as a **measured** row |

### The order this implies

1. **The format half, criterion-first**: the share codec widened, `audio` allowed-but-not-required in `.groove`, a mix default for an unmentioned kind, the bus
   decided, GS-1 exclusion explicit, the exporter's skip-and-say-so rule — each with a test that a song **without** an audio lane is byte-identical;
2. **The sample reference** — the read-only slice: an `assetId` naming an entry in a catalogue that **ships with the app**, so nothing needs a file path, a hash
   store or embedding, and a reference that names nothing is an **error rather than silence**;
3. **Its latency, measured** into PDC's table, and the audio-scope probe as the judge;
4. **No export path changes** beyond the skip-and-say-so rule.

## 1c. 关于"把音频路径的延迟实测进 PDC 表" —— 它是一个**功能**，不是一个测量

第九种 kind 的目标里写着"最后把音频路径的延迟**实测**进 PDC 的延迟表"。读到代码，这句话**预设了一个并不存在的东西** ✗✓：

| 核查 | 结果 |
|---|---|
| 有谁在解码/播放采样？ | 只有 `src/audio/DrumKitModels.ts` ✓ —— 那是**鼓组模型**，不是音频车道 ✓ |
| 导出器里有音频车道的声部吗？ | **没有** ✗ —— 我按 `audio` / `sample` / `voice` 搜过，一无所获 ✓✓ |
| PDC 的离线补偿在吗？ | **在** ✓（`latencySamples` ✓、头部裁剪 + 尾部补零 ✓、`:1011` 的说明 ✓），而表里**已有一行实测**：主限幅器 ✓ |

所以：**音频车道没有播放通路** ✗ → **它的延迟无从测量** ✗ → 这一项**卡在"要先把通路建出来"** ✓，**不是卡在一次测量** ✓✓。

**这正是本文档第 1 节所写的"只读切片"** ✓（播放一个采样 ✓ → **把它的延迟测进表** ✓ → **不改任何导出路径** ✓）—— 也就是说：**第九种 kind 的格式半边已经完成** ✓✓（类型 ✓ 分享 ✓ 校验 ✓ 混音角色 ✓ 总线 ✓ GS-1 ✓ 采样目录 ✓ 跳过并说明 ✓），而**播放半边是一件独立的、有明确第一步的新工作** ✓。

⚠️ 把它写成"待测"而不是"待建"，正是本会话反复纠正的那种**用词把工作量藏起来**的错误 ✓（"待测"听起来像半小时，"建一条采样播放通路并把它接进渲染与 PDC"是另一回事 ✓）。

## 1d. 只读切片的路线与判据（第一块已落地）

**已完成的第一块** ✓：`src/audio/audioLanePlan.ts` 的 `planAudioLaneEvents` ✓ —— **纯的**、**不需要音频图** ✓、**5 条判据全过** ✓✓（无音频轨 → 零事件零问题 ✓；每段一个事件且在该段起始小节 ✓；引用不可播 → **点名段落**的问题 ✓；clip 缺失 → 不造事件 ✓；**发布的空目录 ⇒ 一切引用被拒** ✓）。

**剩下两步，顺序与判据都已写定** ✓：

| 步 | 做什么 | 判据（先写） |
|---|---|---|
| **2. 音频图** | 解码采样并调度 ✓（`decodeAudioData` + `AudioBufferSourceNode` ✓，与 `DrumKitModels.ts` 同一套 ✓），**消费 `planAudioLaneEvents` 的结果** ✓ | ⭐ **消费这份计划** ✓（而不是另算一遍起点 ✗ —— 那是"两处算术会漂移"的老问题 ✓）；**没有音频轨的歌逐字节不变** ✓✓（渲染与播放都要 ✓）；引用不可播 → **报错，不静音** ✓ |
| **3. 延迟入表** | 把音频路径的延迟**实测**进 PDC 的延迟表 ✓（照主限幅器 **7.415 ms** 那条 ✓：**探针先给数字** ✓ → 再写进表 ✓✓） | **实测行**，不是声明行 ✓；且**探针做裁判** ✓ |

**自我约束**（只读切片的定义 ✓）：**不改任何导出路径** ✓ —— 这一步只让采样**能被播放与测量** ✓，不让它改变一个字节的交付物 ✓。

⚠️ **一条刻意的克制** ✓：`planAudioLaneEvents` **不会**先接进 `render_song` 的回复 ✗ —— 因为**今天什么都不会播** ✓，而把一份"计划"放进回复等于**给一个还不存在的功能做广告** ✓。它会和**图**一起出现 ✓，那时它是**事实**而不是愿景 ✓。

## 2. SVS: an interface with no implementation

The owner asked for the interface to be **reserved and left empty**, and the honest way to do that is to expose it and have it **say so**, rather than to leave a
hole an agent will guess at. `synthesize_vocal` is registered, is `readOnly`, and returns `reserved, not implemented` with the reason.

The reason it is written down rather than merely coded: an agent that finds no tool will try to build a vocal from the tools it has and produce something that
sounds like a mistake, whereas an agent told the capability is reserved can plan around it — and the absence becomes a fact about the server rather than a
surprise.

**What "reserved" commits us to**, so the interface is not a decoration:

* the tool's **name and purpose** are fixed, so a future implementation does not move under a caller's feet;
* it takes the arguments such a call would need (a lyric, tones, a target lane) and **validates them**, so the shape is exercised now and the failure message can
  explain what is missing rather than what is malformed;
* a `check:mcp` case asserts that it **says it is reserved**, so the stub cannot be mistaken for a working tool by either a human reading the list or a gate
  watching the surface.

## 3. What is explicitly not in this scope

* **No SVS implementation**, and no partial one: no formant model, no phoneme set, no alignment. The direction, when it is taken up, is the upstream synth
  project (`docs/SYNTH_UPSTREAM_PLAN.md`), not a second synthesizer inside this repository.
* **No audio samples committed to this repository** as part of this scoping.
* **No change to the delay table's existing row** — the audio path's latency is added when there is an audio path to measure.
