# 重叠 → 连奏：接到**实时那两条路**与 **MCP 回复**上 —— 读数、复用、判据

> 承接 `docs/LEGATO_OVERLAP.md` §7 的未做第 ④ 与第 ⑤ 条（那份文档的原话就是本文的任务）：
> **④ 实时那两条路没标记交接**；**⑤ MCP 回复里读不到这个读数**。
> 机制（`decideLegatoJoin` 的四问、`createLegatoVoiceLedger` 的 voice 账本、`takeOver()` 的"录音不重启"）由 `5bb7c7b` 落地并且**只走离线那条路**；
> 本文把那两个计划器接上同一条规则、让实时 sink 复用**同一个** ledger，并把读数挑进 MCP 回复。
>
> 本文**不改** `docs/OPEN_WORK.md`（业主的）、版本号、`src/mobile/**`、`scripts/**`、`.github/workflows/*`、`docs/STRING_TECHNIQUES.md`（Part 2 那条线要碰它）。
> 只读复用 `src/audio/legatoVoices.ts` 与 `src/audio/legatoJoin.ts` 的既有机制，**释放斜坡／`releaseSeconds`／循环语义／`off_by` 一条未改**（见 §3.3）。

## 0. 一句话结论

**规则只有一处实现（`planLegatoJoins`／`decideLegatoJoin`），现在有三个调用者**（离线渲染、`audioLanePlan` 的播放计划、`samplerSteps` 的编曲播放）；
**声部账本只有一处实现（`createLegatoVoiceLedger`），现在有三个 sink 复用**（离线 sink、`browserSampleSink`、`scheduleSamplerSteps`）。
在业主那份 `fate-echoes.mid` 的弦乐声部上，**实时那条路（业主按播放听到的那条）**从 **57 次落在还在响的和弦上的新起音 → 25 次**、
beat 48 = 24.0000 s 从 **3 → 1**、实际启动的录音从 **60 → 28** —— 与离线那笔**逐项相同**；而**离线那笔数字一条未变**。

⚠️ **这不是听感判断。** 本文给的是**行为改变与读数**（起音次数、录音启动次数、拒绝原因）。**好不好听只有业主能判**，§9 把这条边界写清楚。

---

## 1. ⭐ 先量后改：实时那条路的**改前**读数

**方法**：不先动代码，先在那两个计划器上量同一件事。用业主那份 `fate-echoes.mid` 的弦乐声部（20 个三音和弦、每 8 beats 一个、每音 8.5 beats），
走**实时路 B**（`fromMidi` → `compileArrangementToLanes` → `planSamplerSteps` → `scheduleSamplerSteps`），音符解析用仓库里的真 SFZ
（`src/test/fixtures/sfz/vsco2ce/ViolinEnsSusVib.sfz`）、录音时长用 `docs/STRING_TECHNIQUES.md` §8 从 RIFF 头读出的 5 个实测值，
`sink` 用 `FakeAudioContext`（它记下每一次 `createBufferSource()`）。

| 读数 | 改前 |
| --- | --- |
| 计划事件 / onset | 60 个事件、20 个 onset |
| 重叠的 onset（前和弦未释放） | **19** |
| **落在还在响的和弦上的新起音** | **57** |
| 其中 beat 48 = 24.0000 s 那一下 | **3** |
| **实际启动的录音（`AudioBufferSourceNode`）** | **60** |
| 计划器写下的 `legato` 标记 | **0** |

⇒ **实时路上，57 个新起音一个都没被接手**：规则在离线那条路上生效，在业主按播放听到的这条路上完全不生效——这正是 `LEGATO_OVERLAP.md` §7 第 ④ 条写的"缺的是那两处的计划"。

**路 A 的改前读数**（`planAudioLaneEvents` → `scheduleAudioLaneSamples` → `browserSampleSink`）：一个 1 小节、两个音高不同、
各持续 3 s 的持续弦乐音（第二个音在 1.0 s 起，第一个到 3.0 s 才结束 ⇒ 重叠 2.0 s）：

| 读数 | 改前 |
| --- | --- |
| 计划事件 / `legato` 标记 | 2 / **0** |
| **落在还在响的音上的新起音** | **1**（第二个音） |
| 实际启动的录音 | **2** |

## 2. 逐处改动（文件:行）

| 文件 | 改了什么 |
| --- | --- |
| `src/audio/legatoJoin.ts` | `LegatoJoinCandidate`:195 **新增**——规则读的事件形状（`trackIndex`／`name`／`assetId`／`pitch`／`atSeconds`／`seconds`／`voiceRank`／`legato`／`handedOn`），让三个计划器各自的类型都能满足它；`LegatoJoinPass<T>`:263 与 `planLegatoJoins<T>`:292 **改成泛型**（同一条规则，三种事件类型，返回**它们自己的**事件）；`out[predecessorIndex].handedOn = true`:451 **新增**——把"这条 voice 稍后会被接手"写在交接的**来源**音上（见 §3.3，实时 sink 靠它把 voice 起成**可移动终点**）。**四问本身（`decideLegatoJoin`）一字未改** |
| `src/audio/samplerSteps.ts` | `SamplerStepEvent.trackIndex`:31（lane 序数，规则分组与账本键都用它）／`.voiceRank`:67／`.legato`:76／`.handedOn`:85 **新增**；`planSamplerSteps(lanes, {bpm})`:153 —— 事件建完后调用 `planLegatoJoins<LegatoJoinCandidate>`:212，把 `voiceRank`／`legato`／`handedOn` 写回事件:222；`scheduleSamplerSteps` 建 `createLegatoVoiceLedger()`:244，每个音走 `ledger.play({…})`:304，`report.legato` 交出声部层读数:126 |
| `src/audio/audioLanePlan.ts` | `AudioLaneEvent.trackIndex`:35／`.atSeconds`:66／`.voiceRank`:74／`.legato`:82／`.handedOn`:91 **新增**；`PlanInput` 增可选 `bpm`／`tempoTrack`／`totalSteps`（规则要按秒量重叠）；`audioLaneTotalSteps`:128 **新增**（时间线长度的**唯一**读法，计划器与调度器共用）；`planAudioLaneEvents` 给每条 lane 发一个 `slot × track` 的序数并在计划跑完后调用 `planLegatoJoins<LegatoJoinCandidate>`:271、写回三个字段:281 |
| `src/audio/audioLaneScheduler.ts` | 消费而不是重算：`event.atSeconds`／`event.seconds` 优先:84，只有计划没带秒数时才回落到 `audioLaneInstrumentSeconds`——"这个音什么时候响、响多久"因此**只有一处**答案 |
| `src/audio/browserSampleGraph.ts` | `browserSampleSink(context, destination, ledger?)`:73 —— 第三个参数就是**同一个** `createLegatoVoiceLedger`（默认每个 sink 建一个）；pitched 事件走 `laneLedger.play(…)`:130，`handedOn` 的音给可移动终点:109。**plain sample 分支一字未改** |
| `src/audio/playerFromEngine.ts` | `planSamplerSteps(samplerLanes, { bpm })`:445 —— 把编曲自己的速度交给计划器（规则按秒量，没速度就没法量） |
| `src/audio/offlineAudioLanes.ts` | `OfflineAudioLaneEvent.handedOn?: boolean` **新增声明**（规则在**每个**计划器的事件上写这个字段，形状要说得出来）。离线 sink **不看它**——它按自己的量法给每个被切短的音配可移动终点；**离线行为一个数字都没动** |
| `mcp/pattern.ts` | `audioLaneReplyFields` 挑出 `report.legato`：`audioLaneLegato`:155 与 `audioLaneLegatoNote`:175 **新增**（§6） |
| `src/test/legatoLiveJoin.test.ts` | **新增** 6 条：业主那份文件的实时读数（32 接／25 拒／28 录音／beat 48 由 3 变 1）；MCP 回复带同一读数；路 A 由 2 个录音变 1 个；同音重复与无速度**不动**；**一处规则三处调用**（三边对同一输入给出同一句 `because`，见 §5） |
| `src/test/skippedLanes.test.ts` | **新增** 3 条：`audioLaneLegato` 的读数分开、原因计数、以及"没有声部层读数时全部算起音"的地板；没有重叠的回复**不长新键**（加法承诺） |
| `docs/LEGATO_LIVE.md` | **新增**：本文 |
| `docs/LEGATO_OVERLAP.md` | §7 表下与 §10 各加**一行**指向本文（**原表与原文一字未删**） |

⚠️ **明确没有动的**：`docs/OPEN_WORK.md`、版本号、`src/mobile/**`、`scripts/**`、`.github/workflows/*`、`docs/STRING_TECHNIQUES.md`、
以及三条在飞线的文件（`public/samples/manifest.json`／`src/data/sampledInstruments.ts`／`src/data/stringTechniques.ts`／`src/data/**` 里起始内容相关的文件）。
**`docs/LEGATO_OVERLAP.md` 的行号引用与判据一条未改**（只加了两行指向本文的说明）。

### 2.1 ⭐ 为什么是"泛型"而不是复制一份判断

三个计划器的事件类型三种样子：离线的 `OfflineAudioLaneEvent`（有 `atSeconds`／`seconds`）、
播放计划的 `AudioLaneEvent`（有 `atStep`／`gateSteps`／`atBar`）、编曲播放的 `SamplerStepEvent`（有 `step`／`gateSteps`／`sourceTrackId`）。
把 `planLegatoJoins` 写成泛型之后，**四问、onset 分组、按音高排名、机械性拒绝**这四件事仍然只在 `legatoJoin.ts` 里写了一次，
三个调用者各自把事件**喂进去**、把两个字段**取回来**——判据断言的就是这一点（§5）。

## 3. ⭐ 改前／改后读数

### 3.1 实时路 B（`playerFromEngine`＋`samplerSteps`，**业主按播放听到的那条**）

| 读数 | 改前 | 改后 | 谁数的 |
| --- | --- | --- | --- |
| 重叠的 onset | 19 | **19**（不变——重叠是写作的事实） | 计划器自己的 `step × stepSeconds` 与 `gateSteps` |
| **落在还在响的和弦上的新起音** | **57** | **25** | `notesAtOverlaps − voices.joins` |
| 其中 beat 48 = 24.0000 s 那一下 | **3** | **1** | 该 onset 的拒绝数（`fromPitch` = 67） |
| **实际启动的录音** | **60** | **28** | `FakeAudioContext.createdBufferSources` |
| 规则要求交接的音数 | 0（没标） | **57**（全部） | `event.legato` 的条数 |
| 被点名为"稍后接手来源"的 voice | 0 | **57** | `event.handedOn` 的条数 |
| 声部层：接手 / 拒绝 | — / — | **32 / 25**，原因全是 `recording-would-run-out` | `report.legato` |

⇒ **25 + 32 = 57**，**28 + 32 = 60**：每一处都有主，没有音被丢掉，也没有哪个"接管"偷偷多起一个录音。

### 3.2 实时路 A（`audioLanePlan`＋`browserSampleGraph`）

| 读数 | 改前 | 改后 |
| --- | --- | --- |
| 计划事件 / `legato` 标记 / `handedOn` | 2 / 0 / 0 | 2 / **1** / **1** |
| 第二个音的标记 | — | `{ rank: 0, fromPitch: 57, fromSeconds: 0, overlapSeconds: 2 }` |
| **实际启动的录音** | **2** | **1** |
| 声部层：接手 / 拒绝 | — | **1 / 0** |

### 3.3 ⚠️ 一个必须写明的机制细节：可移动终点，以及"只改这一支"

`takeOver()` 的**第一条**是 `if (!extendable || voice.ended) return false`，而 `extendable = looping || releaseWindow !== undefined || seconds === undefined`。
Web Audio 的 `start(when, 0, seconds)` 把终点**写死在节点里**（规范的 `duration` 是"要输出的缓冲内容秒数"，不是 `stop()` 时间），
所以一个**没有释放斜坡的一次性录音**是接不动的——这正是离线 sink 给"被切短的音"配 `releaseSeconds` 的原因。

**实时那两条路今天不给这个斜坡**，于是直接复用 ledger 只会得到 57 条 `voice-cannot-be-extended`：账本是绿的，音却没接上。
本文的做法是**只给"规则点名为接手来源（`handedOn`）"的 voice** 配同一个斜坡，条件与离线 sink 的量法完全一样
（`seconds < buffer.duration / ratio`，即"这个音在录音还有声音的时候被切断了"）：

* **只有重叠这一支的音改变结束形状**（它们本来就要改成"不重新起音"，这是本文的目的）；
* **不被接手的音一个都没变**——`samplerSteps.test.ts` 的三条判据（每个音都有终点、默认 0.8 步、连续同音不合并）**逐条原样全绿**，
  这就是"不碰释放斜坡／`releaseSeconds`"的**判据化**形式：如果本文把斜坡无条件接进实时路，那三条会立刻变红；
* ⚠️ **离线 sink 仍然给每一个被切短的音配斜坡**（那是 `5bb7c7b` 之前业主裁定的"给终点而不是硬切"），本文**没有**把实时路对齐到这个更宽的范围——
  那是一次**业主裁定级别的**行为改变，不是本文的授权范围。这条差别**写明在这里**，不假装不存在。

## 4. 反向：离线那笔数字**逐项不变**

| 读数（业主那份文件） | `5bb7c7b` 落地时 | 本文之后 |
| --- | --- | --- |
| 规则要求交接的音数 | 57 | **57** |
| 落在还在响的和弦上的新起音 | 25 | **25** |
| beat 48 = 24.0000 s 那一下 | 1 | **1** |
| 实际启动的录音 | 28 | **28** |
| 声部层：接手 / 拒绝 | 32 / 25 | **32 / 25** |

判据：`src/test/ownerProjectAcceptance.test.ts` 那条 **"⭐ carries the strings at every change the recording can reach"** 的期望值**一条未改**，
实跑原样打印：

```
弦乐 legato : 19 overlapping chord change(s), 57 note(s) on them, 57 handed over by the rule;
at the voice: 32 carried, 25 refused (recording-would-run-out); 28 recording(s) started for 60 notes;
at beat 48 = 24 s: 3 attacks before, 1 after
```

`src/test/legatoJoin.test.ts`（12 条）与 `src/test/legatoVoices.test.ts`（8 条）的期望值同样**一条未改**、全绿。

## 5. ⭐ "一处规则、三处调用"的判据

`src/test/legatoLiveJoin.test.ts` 的最后一个 describe 块不是断言一个数字，而是断言**同一条规则被三边调用**：

* 同一个重叠（前音 1.5 s 长、在 1.0 s 处新音起、音高 60 → 64、持续弓奏法）写成**三种形状**：
  ① 离线的 `OfflineAudioLaneEvent[]`；② `planSamplerSteps` 的一小节 lane（step 0 / 8，gate 12）；③ `planAudioLaneEvents` 的同一小节 song；
* 三边各自产出的 `legato` 标记必须与 **`decideLegatoJoin` 对同一对音自己给出的** `because` **逐字符相同**，
  且 `rank`／`fromPitch`／`fromSeconds`／`overlapSeconds` 也相同；
* 三边都必须把**同一个** voice 写成 `handedOn`；
* 反向：同音重复时，`decideLegatoJoin` 给出 `repeated-pitch` 及其 `because`，而三个计划器**都不写标记**（`refusal` 的句子在离线的 reading 里可取到并与规则逐字符相同）。

`because` 这句话只在 `decideLegatoJoin` 里生成。**如果哪一条路自己写了一份判断，它必须把那句话复述得一模一样才能通过**——这就是"两处调用同一函数"的可判形式。

## 6. MCP 回复的新读数

`report.legato` 上本来就有两个读数（`planned` 与 `voices`），只是 `audioLaneReplyFields` 没挑。现在挑出来，照既有风格：**每个数都是具名的、可判的，
不是一个生对象**。

```jsonc
"audioLaneLegato": {
  "overlappingChordChanges": 19,   // 落在"前一个和弦还没释放"上的 onset 数（写作的事实）
  "notesOnThem": 57,               // 这些 onset 上的音数 = 改前的新起音数
  "handedOverByTheRule": 57,       // 规则要求交接的音数（不重新起音）
  "refusedByTheRule": 0,           // 规则自己拒的（同音重复 / 断奏类 / 无对应声部）
  "carriedByTheVoice": 32,         // 声部层真的接过去的
  "refusedByTheVoice": 25,         // 声部层做不到的
  "refusedBecause": { "recording-would-run-out": 25 },  // 按原因计数
  "attacksOnSoundingChords": 25,   // ⭐ 标题数：仍然落在还在响的和弦上的新起音
  "lanes": [ { "track_index": 0, "name": "弦乐", "assetId": "vsco2ce:ViolinEnsSusVib",
               "technique": "sustain", "legatoCapable": true,
               "overlappingChordChanges": 19, "notesOnThem": 57, "handedOver": 57, "refused": 0 } ]
},
"audioLaneLegatoNote": "an overlap the bow never stopped is a legato: …"
```

三条设计上的决定，都有理由：

* **`attacksOnSoundingChords` 是导出的，不是第三个计数器**：`规则的拒绝数 + 声部层做不到的数`；
  而**当报告里没有声部层读数时，它等于 `notesOnThem`**（每一个被要求的交接都仍然是起音）——
  所以"没人执行交接"**不会**被读成"做成了"；
* **`refusedByTheRule` 与 `refusedByTheVoice` 分开**：前者是规则的问题（同音重复是重新起音，这是对的），后者是**录音长度**的问题（下一步是换库，不是改规则）；
* **没有重叠就不长这个键**：`planLegatoJoins` 只对"真的被迫做了决定"的 lane 出报告，所以一条缝都没有的渲染回复**一个字节都没变**（加法承诺，判据在 `src/test/skippedLanes.test.ts`）。

`report.legato` 只由**离线渲染**产出（实时那条路不在 MCP 的 `render_*` 工具上），所以这个字段读的是导出那条路；
**实时那条路的同一读数**在 `report.legato`（`scheduleSamplerSteps`）上，判据在 `src/test/legatoLiveJoin.test.ts`。

## 7. 判据结果（实跑）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npm run typecheck` | ✓ 0 错 |
| 静态 | `npm run lint`（改动文件定向 `--quiet`） | ✓ 0 错 |
| **MCP**（碰了 `mcp/**` ⇒ 必跑） | `npm run check:mcp` | ✓ **123 checks passed, 0 failed**；surface 91 tools / 7 resources / 4 prompts |
| 新增定向 | `npx vitest run src/test/legatoLiveJoin.test.ts src/test/skippedLanes.test.ts` | ✓ 14 条（6＋8） |
| 反向（离线不变） | `npx vitest run src/test/ownerProjectAcceptance.test.ts src/test/legatoJoin.test.ts src/test/legatoVoices.test.ts` | ✓ 全绿，期望值一条未改，打印 57/32/25/28 不变 |
| **受影响面**（凡 import 到改动模块或 `mcp/**` 的测试） | `npx vitest run <85 个文件>` | ✓ **85 文件 / 718 条全绿** |
| 文档 | `npm run docs:check`、`npm run check:docs:refs` | ✓（§8） |

## 8. sha／推送／CI

| 项 | 值 |
| --- | --- |
| 分支／工作树 | `legato-live` @ `/home/crow/music/groove-legato-live`（`git worktree add … -b legato-live origin/dev`，`node_modules` 软链 `groove-int/node_modules`） |
| 代码提交 | `2e3510b`（`feat(audio): the overlap rule reaches the two live paths, and the reply carries its reading`，rebase 到 `dd183d9` 之后；**rebase 后重跑**见 §7） |
| 文档提交 | `docs(legato-live): …`，紧随代码提交、同一个分支、同一条推送路径 |
| 推送 | `SKIP_LOCAL_GATE=1 npm run push:dev`（`git fetch` → `git rebase origin/dev` → **rebase 后重跑** → `git push origin HEAD:dev`；**被拒不强推**） |
| CI | 推送后由 GitHub 的 `CI` / `dev` 判定；`gh run list` 读到的运行与结论记在交接里，不在本文里假装已读 |

## 9. 判不了／未核实

* **听感**：判不了。本文给的是起音次数与录音启动次数的读数，**没有**业主那份导出音频（`/tmp/groove-fx/` 只有 `.mid`），所以不贴频谱、不做"更顺了"这类主张。
* **"被接手的音色有多像"**：未量。接过去的是前一条录音**变调**（库里没有转接采样），离线那份文档 §7 已记同一件事。
* **实时路 A 的"跨小节重叠"**：判据只覆盖了**同一小节内**的两个音（§3.2）。一个小节的音长超过小节、与小节重复的同一个音重叠的场合**未判**。
* **实时路的 `report.legato` 没有进任何界面**：本文只把它交到 `SamplerStepReport` 上（判据可读）；界面上**没有**显示它，这是**未做**，不是"已排除"。
* **实时 sink 的释放斜坡只给 `handedOn` 的 voice**（§3.3）：与离线 sink"给每个被切短的音"的范围**不同**，这条差别是**有意的**，但**没有**做听感或包络测量。
* **`samplerSteps.test.ts` 的三条既有判据**：期望值**一条未改**（本文正是靠它们证明"不被接手的音没变"）。
* **本文不改** `docs/OPEN_WORK.md`、版本号、`src/mobile/**`、`scripts/**`、`.github/workflows/*`、`docs/STRING_TECHNIQUES.md`。
