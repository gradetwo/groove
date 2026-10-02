# 重叠什么时候是连奏、什么时候是换弓 —— 规则、接线、读数

> 起因是业主的两句话：**「听起来有时候会断一下」**、以及他把断点指到 `23.98 s`。
> `docs/STRING_TECHNIQUES.md` §9 已经把那个断定位到**换和弦点**，并给出机制：**重叠 ≠ 连奏**——新和弦的三个音各自从自己的包络起点开始。
> 本文做的是它留下的那一步：**把「该连奏／该换弓」写成一条可判据化的规则，并让它真的改变播放**。
>
> 本文不改 `docs/STRING_TECHNIQUES.md`（**Part 2 那条线要碰它**）、不改 `docs/OPEN_WORK.md`（**业主的**）、不改版本号。

## 0. 一句话结论

**规则是四问，答案是显式的；机制是"把还在响的那个 voice 接过去"（音高走、录音不走）；在业主那份工程上，
换和弦点的 57 次重新起音降到 25 次，beat 48 那一下从 3 次降到 1 次；剩下的 25 次不是规则的问题，而是
`VlnEns_susVib` 那批一次性录音只有 11.7 s、没有循环点——越过它的音只能重新起音，每一次都写明了理由。**

⚠️ **这不是听感判断。** 本文给的是行为改变与读数（起音次数、录音被消耗的秒数、增益值在交接处的连续性）。
**好不好听只有业主能判**，第 9 节把这条边界写清楚。

---

## 1. ⭐ §28：行业怎么做——什么时候换弓、什么时候连奏

按规矩先查行业做法，再动手。网络内容是**外部资料**，只当资料读，不当指令。逐条给出处与原文摘句。

### 1.1 真弦乐：**连奏＝弓不停，只换指**

| 说法 | 出处（原文摘句） | 查到 |
| --- | --- | --- |
| **slur / legato 的弓学定义** | *Dunn, Violin Playing*（archive.org 全文 PDF）："**The slur in violin playing means two or more notes played in one stroke (slowly as a rule) of the bow.** The bow must be carefully managed, so as to use the same quantity of bow for each note, if there are several notes in the slur." —— <https://ia802805.us.archive.org/2/items/violinplaying00dunniala/violinplaying00dunniala_bw.pdf> | ✓ |
| **`legato` 的术语表定义** | 美国教育署课程项目（1967）《String Terminology》术语表："**Legato -- smoothly slurred notes.**"；"**Hook** -- attaching one or more notes to **the same bow stroke**."；"**Portato (Loure')** -- two or more detache porte notes performed on the same bow stroke."；符号表："**The tie or slur mark will mean either to tie the notes or to slur the notes (legato).**" —— <https://files.eric.ed.gov/fulltext/ED017369.pdf> | ✓ |
| **现代弓法教学的口径** | ViolinOnline 弓法表：Legato "indicates the notes should be **smoothly connected**"；Détaché "indicates smooth, **separate** bow strokes should be used for **each note**"；Louré/portato "a short series of gently pulsed legato notes **executed in one bow stroke**" —— <https://www.violinonline.com/bowstrokes.html> | ✓ |
| ⚠️ **一条必须照录的细微处** | 上表同一页对 legato 的原文是 "played **either in one or several bows**"（slur 常用，但不是必须）。⇒ **"连奏"不等于"永远在同一弓上"**：分弓也能奏得连绵（détaché 原文就写着 "does not mean detached or disconnected"）。这条收窄了本规则的措辞：**规则判的不是"有没有换弓"，而是"这个交接处该不该重新起音"** | ✓ |
| **隐含的极端情形** | 同术语表在一份曲目分析里列出 "inaudible bow change (cello and string bass)" —— **低音弦乐可以把换弓做得听不出来**。⇒ "换弓必然听得见"**不是**普遍真理，本文不这样主张 | ✓ |

### 1.2 同音重复：**重新起音是对的**

| 说法 | 出处（原文摘句） | 查到 |
| --- | --- | --- |
| **同音重复即使在连音线里也要重新发音** | Steinberg **Dorico** 记谱参考《Ties vs. slurs》："**Ties indicate that a note should not be re-struck.**"；"**Slurs** indicate articulation, such as bowing or breathing, and **normally group notes of different pitches together**."；"**staccato articulations on repeated notes of the same pitch within a slur indicate that notes should be played on a stringed instrument using the same bow direction, but stopping the bow between each note**." —— <https://archive.steinberg.help/dorico/v3.5/en/dorico/topics/notation_reference/notation_reference_ties/notation_reference_ties_versus_slurs_c.html> | ✓ |
| **换弓是一种可点名的演奏法，与 legato 并列** | Audio Modeling **SWAM Solo Strings** 手册："**Staccato, legato, portamento and bow-change articulations are managed by a special algorithm** which takes into account: Note velocity, **Interval between the notes (semitones)**, Time between Note-Off and subsequent Note-On"；"**Bow.Ch**: K.S. is set to 'Bow Change', **a bow change is performed just on note-on**; the velocity of the Key Switch influences the accent of the bow stroke." —— <https://support.audiomodeling.com/guides/strings203/SWAM%20Strings%20v2.0.3%20-%20User%20Manual.pdf> | ✓ |

### 1.3 断奏类：**按定义不能连奏**

| 说法 | 出处（原文摘句） | 查到 |
| --- | --- | --- |
| **短奏法用不了 legato** | Orchestral Tools SINEplayer 帮助《Legato Handling》："**You can not use legato transitions for short articulations like staccato, simply because it makes no sense to do so.**"；"**When Legato is enabled, articulations will be monophonic.**" | ✓ |
| **为什么这句话对 OT 自己成立** | 同页："Most sample libraries, when they say 'legato' actually mean 'sustains with connected notes'. Generally, those transitions between notes will be recorded ('true legato'), **but they are only used for sustained articulations**." —— <https://orchestraltools.helpscoutdocs.com/article/324-legato-handling> | ✓ |
| **每个断奏词自己就是一次发音** | 术语表：**Spiccato** "the bow is dropped from above the string and rebounds into the air"；**Staccato** "a series of small martele strokes are to be executed on one and the same bow stroke"；**Martele** "a staccato producing type of bow stroke… **Each note must be separated from the others.**"；ViolinOnline 同向（Martelé "Each note is percussive"）。出处同 1.1 | ✓ |

### 1.4 采样器/建模器里怎么实现

| 做法 | 出处（原文摘句） | 我们照哪条 |
| --- | --- | --- |
| ⭐ **把播放位置带过去，不重播起音** | **KONTAKT 8.6 用户手册**（The Source Module，Time Machine）："**Legato**: If this button is activated and you play multiple notes in a legato fashion, Kontakt will **carry its current playback position over to each following note, rather than playing each Sample from the beginning**." —— <https://www.native-instruments.com/fileadmin/ni_media/downloads/manuals/kontakt/Kontakt_8_6_User_Guide_English.pdf> | ⭐ **照这条**：`samplerVoice.takeOver()` 不重启录音，只把速率与终点移过去 |
| ⭐ **"前一支还在响"是这条规则的前提** | 同手册（Melody 引擎）："**Legato** (Melody engine only): When Legato is on, **if a previous sample is still playing** the playback will not start from the sample's start marker, but instead it will follow the play position of the previous sample. **If no other sample is playing, the playback will start as usual from the sample's start marker.**"；同手册（乐句 Retrigger）："**Legato**: The new phrase takes over from the playback position of the previous phrase **only if you are still pressing the previous key**." | ⭐ **照这条**：`previous-released` 排在第一问 |
| **音高怎么走：滑音是可选项** | 同手册（Glide）："adds a **sliding** transition between the pitches of two consecutive notes when they are played in a legato fashion"；SFZ 教程："**With the portamento time at zero, this is effectively the same as non-portamento legato**" | ⭐ 默认**不滑**（`glideSeconds = 0`），要滑得显式要 |
| **没有转接采样时怎么补起音** | SFZ 规范教程《Legato》："it makes sense to treat the legato notes differently than the notes which **start a phrase when no other note is playing**"；"**For sustained sounds, it can make sense to use the `offset` opcode to skip the start of the sample for legato regions.** It's also probably a good idea to use `offset_attack` in these cases…"；真 legato 用 `sw_previous` 选**录下来的那一段转接** —— <https://sfzformat.com/tutorials/legato/> | ✗ **我们做不到这条的完整形态**：见 §7（库里没有转接采样，解析器也不读 `offset`） |
| **换音之间的交叉淡化** | 同上："The above will allow only one note to sound at a time, with a **quick crossfade between the old and new note**."；SFZ 规范的 `off_mode=normal` + `ampeg_release`（`src/data/stringTechniques.ts` 的注释与 `docs/STRING_TECHNIQUES.md` §10 已引） | ✓ **已经在飞**：旧音的释放斜坡是上一条线落的，本文**不碰** |
| **旧音没释放＝分弓；重叠＝连奏** | SWAM 手册："**Detaché** are performed by separating the notes while pressing the Sustain pedal: **the note-off of the first note must happen before the note-on of the second note**. A **Slurred Legato** is performed when the notes are **overlapped** while pressing the Sustain pedal." | ⭐ **照这条**：`previousEndSeconds > startSeconds` 才谈得上连奏 |
| ⚠️ **复音乐器必须自己判断"这是连奏还是和弦"** | Audio Modeling 知识库《How is legato executed in PolySWAM?》："**PolySWAM is a polyphonic instrument. If we used the same approach as solo instruments, overlapping notes would cause the engine to struggle between playing a legato melody or triggering multiple notes simultaneously (a chord).**" —— <https://kb.audiomodeling.com/support/solutions/articles/206000082862-how-is-legato-executed-in-polyswam-> | ⚠️ **这条决定了 §4 要自己写**：按声部配对是**我们的决定**，不是任何厂商的手册写的 |
| **Web Audio 的两条硬事实** | W3C 规范 `AudioScheduledSourceNode.stop`："**If stop is called again after already having been called, the last invocation will be the only one applied**; stop times set by previous calls will not be applied, unless the buffer has already stopped prior to any subsequent calls."；`start(when, offset, duration)` 的 `duration`："**the duration of sound to be played, expressed as seconds of total buffer content to be output**" ⇒ **`duration` 是节点内部的界，不是 `stop()` 时间，后来的 `stop()` 移不动它** —— <https://www.w3.org/TR/webaudio/> | ⭐ 前者用来**移动终点**，后者用来判**这个 voice 能不能被接**（`voice-cannot-be-extended`） |

### 1.5 未找到

* **Spitfire Audio**《What is Legato in Virtual Instruments?》—— 抓取只得到导航外壳（正文由 JS 渲染），**未取得可引用正文**；链接留作线索 <https://support.spitfireaudio.com/en/articles/11816088-what-is-legato-in-virtual-instruments>。
* **Vienna Symphonic Library** 的 Synchron Player legato／interval 官方文档 —— 本轮**未取到可引用正文** ⇒ **未找到**。本仓库已有的同类调研（`docs/research/string-sustain-and-legato-in-mature-samplers.md` §6）也是这个结论。
* **"真实弦乐里同音重复在连音线下怎么处理"的厂商手册级原文** —— 只找到记谱软件（Dorico）的官方口径（§1.2），**没有**找到"弦乐教学/厂商手册"级别的第二条独立出处。**按一条用，并标明它来自记谱侧的官方文档，而不是演奏法手册。**

### 1.6 照哪条做，以及为什么

**照 §1.4 的 KONTAKT "carry its current playback position" 那条**，理由不是它最有名，而是它是唯一一条**在"库里没有转接采样"时仍然成立**的机制：
它要求的东西我们全都有（一个正在播的 `AudioBufferSourceNode`、一个可自动化的 `playbackRate`、一个可重排的 `stop`），
而 `sw_previous` 那条要求的东西我们**没有**（§7）。判定条件照 §1.1–§1.3（弓没停 / 音高变了 / 不是断奏 / 前一音没释放），
"是否复音、按声部配对"这一条**没有厂商口径可照**，因此单独写在 §4 并标注为本仓库的决定。

---

## 2. ⭐ 判定规则：四问，逐条

规则在 `src/audio/legatoJoin.ts`，是**纯函数**（不加载、不出声），入口 `decideLegatoJoin`，按**顺序**问四件事：

| # | 问 | 答"换弓"的理由名 | 依据 |
| --- | --- | --- | --- |
| ① | **前音已经释放了吗？**（`previousEndSeconds > startSeconds` 才算重叠） | `previous-already-released` | SWAM：détaché 的定义就是"note-off 在下一个 note-on 之前"；有缝的场合属于 `legatoGapsFor`，不是本文 |
| ② | **音高相同吗？**（同音重复） | `repeated-pitch` | Dorico：连音线里的同音重复"同一弓向、但音与音之间把弓停住" |
| ③ | **演奏法是持续弓吗？**（`sustain` / `non-vibrato` / `quiet` 之外一律不连） | `technique-is-not-sustained` | Orchestral Tools："短奏法用不了 legato"；每个断奏词的定义本身就是一次发音 |
| ④ | 四问全过 ⇒ **连奏** | — | KONTAKT Time Machine Legato 的"把播放位置带过去" |

**这三条"不连"的先决条件之外，还有三条机械性拒绝**（同样有名字、同样上报）：

| 名字 | 什么时候 | 为什么 |
| --- | --- | --- |
| `no-voice-to-continue` | 新和弦的某个声部在上一个和弦里没有对应（例如 2 音和弦 → 3 音和弦的第 3 条线），或两条音之间**换了程序** | 硬配一个最近的音高就是"重配声部"，不是交接 |
| `previous-length-unknown` | 前一个音的 `seconds` 没写下来 | 规则整条建立在"它还在响"上；**没量到不等于还在响** |
| `recording-would-run-out` | **voice 层**：把这条录音接到新音的终点会越过录音自己的长度 | `VlnEns_susVib` 是一次性录音、无循环点；接过去会让音**消失**，那比重新起音更糟 |
| `voice-cannot-be-extended` | **voice 层**：这个 voice 的终点已经写进节点里（`start(when, 0, seconds)`），后来的 `stop()` 移不动 | W3C 规范：`duration` 是"要输出的缓冲内容秒数"，不是 `stop()` 时间 |

⚠️ **"做不到"必须是拒绝并重新起音，不是安静掉下去**：`recording-would-run-out` 的每一次都带着那句量出来的话
（`carrying this voice to 65 would need 4.25 s of "弦乐"'s recording and only 1.795 s is left`），
所以"规则要了、voice 层没做"永远不会被读成"做成了"。

## 3. 逐处改动（文件:行）

| 文件 | 改了什么 |
| --- | --- |
| `src/audio/legatoJoin.ts` | **新增**。`LEGATO_TECHNIQUES`:61（持续弓的三种奏法，正向枚举）、`techniqueOfAsset`:93（按**录音的 catalogue id** 查奏法，不按名字猜）、`decideLegatoJoin`:104（四问）、`planLegatoJoins`:255（对一条 lane 的**计划事件**跑一遍：按 onset 分组、按音高排名成"声部"、逐声部判、把 `voiceRank` 与 `legato` 写在事件上）、`LegatoJoinReading`:222／`LegatoJoinMark`:171 |
| `src/audio/legatoVoices.ts` | **新增**。`createLegatoVoiceLedger`:123：记住"哪条 lane 的哪个声部还在响、已经消耗了多少秒录音"；`play()` 要么**接管**（`takeOver`），要么**拒绝并按名字启动一个新起音**；`reading()` 报 `joins` 与 `refusals` |
| `src/audio/samplerVoice.ts` | `SamplerVoice.takeOver()`:371 **新增**（声明 :159；录音不重启，只移动 `playbackRate` 与终点；增益回到**斜坡当时的那个值**而不是"当前值"；拒绝长度写死在节点里的 voice）；`SamplerVoiceTakeOverInput`:189；`currentRatio`:173／:359 **新增**（读回"现在在什么速率上"）；`:310` 的 `levelGain`/`releaseShape`/`levelAt` 把"斜坡走到哪了"变成算术 |
| `src/audio/samplerLaneSink.ts` | **新增**。把原来内联在 `WavExporter` 里的那个 sink 抽成一个可判据的工厂 `createOfflineSamplerSink`:45（释放规则、`loop_mode` 透传一字未改），并在这里调用 ledger；`legatoReading()` 把 voice 层的读数交出去 |
| `src/audio/offlineAudioLanes.ts` | `OfflineAudioLaneEvent.voiceRank`:96／`.legato`:107 **新增**；`OfflineAudioLanePlan.legato`:128；计划跑完后调用 `planLegatoJoins`:422；`OfflineAudioLaneSink.legatoReading?()`:458；`OfflineAudioLaneReport.legato`:489（`planned` ＋ `voices` 两个读数分开），组装在 :571–:576 |
| `src/audio/WavExporter.ts` | 内联 sink 换成 `createOfflineSamplerSink`:1777（规则一字未改，只是从 2450 行里搬出来） |
| `src/audio/sfz/regionPlayback.ts` | `shiftedRatio(ratio, semitones)`:74 **新增**：一个**已经在播**的 voice 换音时用的比率，指数仍只写在这一处 |
| `src/test/samplerVoice.test.ts` | **新增** 5 条：接管不新建 source／增益不跳／长度写死的 voice 被拒／已结束的 voice 被拒／要滑才滑 |
| `src/test/legatoJoin.test.ts` | **新增** 12 条：业主形状正例；同音重复、断奏类、有缝、非弦乐、无对应声部、换程序、长度未知、跨轨不串——每条都断原因名；四问单测 |
| `src/test/legatoVoices.test.ts` | **新增** 8 条：真编译＋真计划＋真 sink 上跑业主形状（57 求、32 接、25 拒、28 个录音、60 个音全有主）；同音重复与录音越界两种拒绝同框；断奏轨全起音；有缝时读数整个不存在；ledger 的四条拒绝 |
| `src/test/ownerProjectAcceptance.test.ts` | **新增** 1 条（**原判据一条未删**）：业主那份 MIDI 走完整路径的**改前／改后**读数（见 §4） |
| `docs/LEGATO_OVERLAP.md` | **新增**：本文 |

⚠️ **明确没有动的**：`docs/OPEN_WORK.md`、版本号、`src/mobile/**`、`scripts/**`、`.github/workflows/*`、
`docs/STRING_TECHNIQUES.md`、以及三条在飞线的文件（`ArrangementViewV2.tsx`／`ScoreV2.tsx`／`percussionStaff.ts`／
`ImportInstrumentMappingV2.tsx`／`arrangementFiles.ts`／`public/samples/manifest.json`／`src/data/sampledInstruments.ts`／
`src/data/stringTechniques.ts`）——那些文件**只被读、只被 import**。
**释放斜坡、`releaseSeconds`、循环语义、`off_by` 一条未改**（它们是已落地且有各自判据的东西）。

## 4. ⭐ 那个案例的改前／改后读数

复现物：`/tmp/groove-fx/fate-echoes.mid`（1902 字节，sha256 `35d7f3e5c9fa…`，业主那份），`弦乐` part 60 个音、20 个和弦 × 3 音、
每 8 beats 一个、每音 8.5 beats。加载器用**真 SFZ**（`src/test/fixtures/sfz/vsco2ce/ViolinEnsSusVib.sfz`）解析每音的
采样与播放比率，采样时长用**实测的** 5 个值（`docs/STRING_TECHNIQUES.md` §8 从 RIFF 头读出来的）。

### 4.1 分析器输出（`src/test/ownerProjectAcceptance.test.ts` 原样打印）

```
弦乐 legato : 19 overlapping chord change(s), 57 note(s) on them, 57 handed over by the rule;
at the voice: 32 carried, 25 refused (recording-would-run-out); 28 recording(s) started for 60 notes;
at beat 48 = 24 s: 3 attacks before, 1 after
```

### 4.2 同一件事，分成三个读数

| 读数 | 改前 | 改后 | 谁数的 |
| --- | --- | --- | --- |
| **重叠的换和弦点** | 19 | **19**（不变——重叠是写作的事实） | `chordChangeReattacks`（已有） |
| **落在还在响的和弦上的新起音** | **57** | **25** | `planLegatoJoins` 的 `notesAtOverlaps − joins`，再由 voice 层的 `refusals` 证实 |
| **beat 48 = 24.0000 s 那一下的起音** | **3** | **1** | 同上，`atSeconds === 24` 的拒绝数 |
| **实际启动的录音（`AudioBufferSourceNode`）** | 60 | **28** | `FakeAudioContext.createdBufferSources` |
| **规则要求交接的音数** | — | 57（全部） | `planLegatoJoins` |

⇒ **25 + 32 = 57**，**28 + 32 = 60**：每一处都有主，没有音被丢掉，也没有哪个"接管"偷偷多起一个录音。

### 4.3 为什么不是 0 （⚠️ 这不是规则没生效）

`VlnEns_susVib_*` 是**一次性录音**：75 个程序 0 处 `loop`、镜像的 `.wav` 0 个 `smpl` chunk
（`docs/STRING_TECHNIQUES.md` §3 已量）。11.7 s 的录音对上每 4 s 一个和弦，**一条 voice 只能连续接三个和弦左右**，
再往下录音就没了。所以第 4 个和弦上那条线**必须**重新起音——否则音会消失。
每一次这样的拒绝都带着那句话：

```
carrying this voice to 65 would need 4.25 s of "弦乐"'s recording and only 1.795 s is left,
so the note would go silent instead of joining
```

⇒ **改后的 25 次里，25 次都是这一个原因**（判据断言 `new Set(reasons) === {"recording-would-run-out"}`）。
**没有一次是"规则说该连、代码没做"**。

### 4.4 听感类读数：**给不出频谱，本文只给行为与形状**

⚠️ **本地没有业主那份导出的音频**（`docs/STRING_TECHNIQUES.md` §9.5 记过同一件事：`/tmp/groove-fx/` 里只有 `.mid`）。
所以**不贴频谱、不贴包络谷**。能给的是**节点层的确定性读数**，它们是"起音有没有发生"的直接证据：

* **一个录音只 `start()` 一次**：`context.createdBufferSources.filter(s => s.started.length > 1)` 为 **0**；
* **被接管的 voice 有 3 个 `stop()`**（自己那个音的、以及两次交接后的新终点），这正是规范里"最后一次调用生效"在移动终点；
* **交接处的增益不跳**：斜坡在飞的场合，写进去的值等于斜坡**当时**的值（判据用线性插值求值，误差 < 1e-6）。

**这些是"重新起音的次数"的证据，不是"好不好听"的证据。** 好不好听由业主判。

## 5. 反向判据（每条都能红）

| 反向 | 判据 | 文件 |
| --- | --- | --- |
| **同音重复仍重新起音** | 同音高、同重叠、同乐器 ⇒ `joins = 0`、`reattacks = 1`、原因名 `repeated-pitch`；再在整段上验：中间那条持续 60 的线在 3 个换和弦点**每次都拒**，另两条线照接 | `src/test/legatoJoin.test.ts`、`src/test/legatoVoices.test.ts` |
| **断奏类仍不连奏** | 同样的音换成 `violin_section_pizzicato`（`vsco2ce:ViolinEnsPizz`）⇒ `legatoCapable = false`、`joins = 0`、60 个音 = 60 个录音 | `src/test/legatoJoin.test.ts`、`src/test/legatoVoices.test.ts` |
| **有缝隙的场合行为不变** | 每音 7 beats（对 8 beats 的间距）⇒ 重叠为 0 ⇒ `plan.legato === undefined`、`report.legato === undefined`、60 个录音一个不少 | `src/test/legatoJoin.test.ts`、`src/test/legatoVoices.test.ts` |
| **非弦乐（钢琴）不被"连奏"** | `salamander-grand` ⇒ 奏法 `undefined`、原因名 `technique-is-not-sustained` | `src/test/legatoJoin.test.ts` |
| **跨轨/跨声部不串** | 另一条轨的同一个音高不参与这条轨的决定；新和弦多出来的声部走 `no-voice-to-continue` | `src/test/legatoJoin.test.ts` |
| **换程序不接** | 前音 `ViolinEnsSusVib`、新音 `ViolinEnsPizz` ⇒ `no-voice-to-continue` | `src/test/legatoJoin.test.ts` |
| **"做不到"必须是拒绝而不是静音** | 录音不够 ⇒ 新起一个录音，且 `refusals` 里有那条量化过的句子 | `src/test/legatoVoices.test.ts` |
| **接管不能缩短一个节点已定长的 voice** | `start(when, 0, seconds)` 的 voice ⇒ `takeOver()` 返回 `false`，且**一个事件都没写** | `src/test/samplerVoice.test.ts` |

## 6. `ownerProjectAcceptance` 那一条怎么处置

**原判据（`⭐ locates the owner's break at a chord change: beat 48 = 24.00 s, 0.02 s from the cursor`）**：
**一条未删、一个期望值未改**——它数的是**写作层的事实**：和弦在 19 处重叠、beat 48 那处有 3 个新起音、
`legatoGapsFor` 对弦乐报空。这次改动**不改变这些事实**，所以它仍然逐条绿（实跑见 §8）。

**新增的那一条**（`⭐ carries the strings at every change the recording can reach, and says where it cannot`）与它并排，
数的是**播放层的另一件事**：规则要求交接多少、voice 层做到多少、实际启动了几个录音。两条数字不一样而**互为对照**：
一条说"这里有 57 次重新起音的机会"，另一条说"其中 32 次变成了不重新起音"。

⚠️ **若将来有人把起音数改成 0 的期望**：那需要先有**带循环点或带转接采样**的弦乐库（§7），
不是改这条判据能做到的。

## 7. ⚠️ 做不到的部分 ＋ 为什么 ＋ 下一步

| 做不到的 | 为什么（可复核） | 下一步（可执行） |
| --- | --- | --- |
| **每一个重叠都变成连奏**（57 → 0） | 被接管的 voice 播的是**同一条一次性录音**，`VlnEns_susVib_*` 8.988–13.120 s、**0 个循环点**；接过去超过录音长度，音就没了 | **换库或补录**：要一条**带循环点**（`loop_mode`/`smpl`）的持续弦乐。仓库里已有能循环的库（`karoryfer-meatbass` 的 `loop_mode=loop_sustain`），本文的机制**不需要改一行**就能用上 |
| **接过去之后音色还是前一个音的音色** | 库里**没有**录下来的音程转接采样（SFZ `sw_previous`），也没有任何 `trigger=legato` 分区；接过去的只能是把上一条录音**变调** | **补录转接采样**并让解析器读 `sw_previous`／`trigger=legato`（仓库今天都不读）。SFZ 教程自己给了代价刻度："音程不超过三度或四度时才有说服力" |
| **"跳过新音起音"的另一种做法（`offset`）** | SFZ 教程的正道是 `offset` 跳过采样开头 + `ampeg_attack` 淡入；本仓解析器**不读 `offset`**，而且 VSCO 的程序里**根本没有**这个 opcode ⇒ 没有数据可读 | 要么解析 `offset`（对**有**这个 opcode 的库立刻生效），要么在读者层发明一个偏移量——**后者是猜，不做** |
| **播放时（不是导出时）也享受这条规则** | 规则接在**离线**那条路上（`offlineAudioLanes` → `createOfflineSamplerSink`）。实时那两条路（`playerFromEngine`＋`samplerSteps`、以及 `audioLanePlan`＋`browserSampleGraph`）**没有标记交接**——`browserSampleSink` 拿到的 `AudioLaneEvent` 里今天没有 `legato`／`voiceRank` 字段 | 在那两个计划器里产出同样的两个字段，然后 `browserSampleGraph` 的 sink 复用**同一个** `createLegatoVoiceLedger`。机制已经有了，缺的是那两处的计划 |
| **业主能在 MCP 回复里读到这个读数** | `OfflineAudioLaneReport.legato` 是**报告里的新字段**，而 MCP 那条回复的字段由 `mcp/pattern.ts` 的 `audioLaneReplyFields` 挑选，**今天没有挑它**（`mcp/**` 不在本线范围内） | 在 `audioLaneReplyFields` 里加一个 `legato` 字段（数据已经在 `report` 上，不需要新计算） |
| **听感结论** | **判不了，也不该由本文判** | 业主听 |

⭐ **上表第 4、5 行「实时两条路」与「MCP 回复」已经落地**（2026-10-02）：规则改为泛型后由三个计划器共用，实时 sink 复用同一个
`createLegatoVoiceLedger`，`audioLaneReplyFields` 挑出 `report.legato`。**业主那份文件上实时路的读数与离线逐项相同**（57 → 25、beat 48 的 3 → 1、录音 60 → 28），
而**本文上面的离线数字一条未变**。落点、逐处改动、判据与"只改这一支"的机制细节写在 `docs/LEGATO_LIVE.md`。

## 7.1 ⚠️ 一处必须记下的**跨文档更正**（`docs/STRING_TECHNIQUES.md` §10.3 的 (2)(3) 条）

`docs/STRING_TECHNIQUES.md` §10.3 当时写着：**"第 (2)(3) 步（`trigger=legato` + `offset`、Kontakt 式的播放位置延续）被那座桥挡住"**。
**本文不改那份文档**（Part 2 那条线要碰它），但事实已经变了，写在这里免得读的人以为还挡着：

* **桥已经通了**（§11 已记：`TrackV2.instrument` ＋ `src/data/sampledInstruments.ts`），所以"换音时还有别的音在响"这个上下文
  **在真采样轨上确实存在**——业主那份工程导入时给 `strings_lead` 就落在它上面；
* **Kontakt 式的"播放位置延续"已经实现了**：`src/audio/samplerVoice.ts` 的 `takeOver()` ＋ `src/audio/legatoVoices.ts` 的 ledger，
  判据与读数在本文 §4／§5；
* **仍然挡着的是另一半**：`trigger=legato` ＋ `offset` 那条**没做**，因为这条库里既没有 `trigger=legato` 分区，
  解析器也不读 `offset`（§7 上表第 3 行）。

⇒ 正确的读法是：**"(3) 已落地；(2) 仍缺，缺的是数据不是桥"**。

## 8. 判据结果（实跑）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npx tsc --noEmit` | ✓ 0 错 |
| 静态 | `npx eslint <改动的 7 个文件> --quiet` | ✓ 0 错 |
| 定向测试 | `npx vitest run src/test/samplerVoice.test.ts src/test/legatoJoin.test.ts src/test/legatoVoices.test.ts src/test/ownerProjectAcceptance.test.ts` | ✓ 41 条（13＋12＋8＋8） |
| **受影响面**（凡 import 到改动模块的测试） | `npx vitest run <54 个文件>` | ✓ **54 文件 / 533 条全绿** |
| 文档 | `npm run docs:check`、`npm run check:docs:refs` | ✓（§9） |

## 9. sha／推送／CI

| 项 | 值 |
| --- | --- |
| 分支／工作树 | `legato` @ `/home/crow/music/groove-legato`（`git worktree add … -b legato origin/dev`，`node_modules` 软链 `groove-int/node_modules`） |
| 提交 | `5bb7c7bf83279f62e034e9470a8ee2317629c67b`（rebase 到 `d5add2f` 之后） |
| 推送 | `git push origin HEAD:dev` → `d5add2f..5bb7c7b  HEAD -> dev`（`SKIP_LOCAL_GATE=1 npm run push:dev`，本地门禁按 `docs/OPEN_WORK.md` §五 的约定跳过；**没有被拒，没有强推**） |
| CI | run `37049851807`（`CI` / `dev` / push）—— **completed / success**，9m37s；`ESLint Code Quality`、`Unit Tests & Coverage`、`Production Build`、`Bundle Budget & Performance Gate`、`Red-Line Gate` 全绿 |
| 本文自身 | 由紧随其后的 `docs(legato):` 提交带上 `dev`（同一个分支、同一条推送路径） |
| rebase 后重跑 | `npx tsc --noEmit` ✓；`npm run lint` ✓；**受影响面 54 个测试文件 / 533 条** ✓；`npm run docs:check` ✓；`npm run check:docs:refs` ✓ |

## 10. 判不了／未核实

* **听感**：判不了。本文没有业主那份导出音频（`/tmp/groove-fx/` 只有 `.mid`），所以没有频谱／包络谷，也**不做**"更顺了"这类主张。
* **被接管的音色到底有多像**：未量。接过去的是前一条录音变调，音色差异的真实大小需要渲染＋频谱，未做。
* **`refusals` 里的秒数是解析器的算术**，不是听出来的：`(recordingSeconds − consumed) / ratio`。
* **复数位置的"复音 legato 按声部配对"**：**没有厂商手册依据**（Kontakt 手册无 poly legato 专节；Orchestral Tools 的 legato 是单音）。这是本仓库的决定，写在 §2 与 `src/audio/legatoJoin.ts` 的注释里，**不冒充行业做法**。
* **Spitfire／VSL 的正文未取得**（§1.5），因此这两家的做法在本文里**不作主张**。
* **实时两条路今天不享受这条规则**（§7），这一点是**未做**，不是"已排除"。⇒ **后续已做**：实时路的接线、读数与判据见 `docs/LEGATO_LIVE.md`（2026-10-02）。
* **本文不改** `docs/OPEN_WORK.md`、版本号、`src/mobile/**`、`scripts/**`、`.github/workflows/*`、`docs/STRING_TECHNIQUES.md`。

## 11. ⭐⭐ 那条例外的裁定：**带循环点的录音，不再算"会跑完"**

这是本轮**刻意裁定**的一件事，单独记在这里，因为它是"规则要不要为一种新数据让路"的决定，而不是一处实现细节。

### 11.1 谁决定、决定什么

**决定人**：这条线（`smpl-loops` 工作树）在做到"让采样器读 WAV 的 `smpl` 块"时，必须回答一个问题——
`recording-would-run-out` 这条拒绝（`src/audio/legatoVoices.ts`）今天只用 `recordingSeconds`（解码后 buffer 的长度，
`buffer.duration`），**与 `loopMode` 无关**。现在录音会循环了，它还该不该照旧拒绝？

**决定**：**不该。循环的 voice 不参与这条拒绝。** 判据在 `src/test/legatoLoopCarry.test.ts`。

### 11.2 为什么是这一边：依据三条，都不是口味

**① 规范原文（§28）。** `loop_continuous` 的定义就是"到音符结束为止"：

> "**loop_continuous**: once the player reaches sample loop point, the loop will play until note expiration. This includes looping during the release phase."
> —— <https://sfzformat.com/opcodes/loopmode/>

"note expiration"是音符的终点，不是录音的终点。而"SFZ 不写 `loop_mode` 时按录音自带的循环来"也是同一页的原话：

> "If `loop_mode` is not specified, each sample will play according to its predefined loop mode according to the loop metadata in the audio file. That is, the player will play the sample looped using the first defined loop, if available."
> 默认值一栏：**"no_loop for samples without a loop defined, loop_continuous for samples with defined loop(s)"**

所以"这条录音会循环"本身就是规范给的答案：它**没有**"用完"这个状态。

**② 改前／改后实测（真 `karoryfer-bigcat-cello` 字节，程序里 0 个 `loop_*`）。** 走生产路径
（`createSampleLoader` → `scheduleOfflineAudioLanes` → `createOfflineSamplerSink` → `startSamplerNote`），
一条 6 个和弦、每音 4.25 s、重叠 0.25 s 的 lane，录音 5.220–6.345 s：

| 读数 | 改前 | 改后 |
| --- | --- | --- |
| legato 规则要求的交接 | 15 | 15 |
| **voice 层真的接过去** | **0** | **15** |
| `recording-would-run-out` 拒绝 | **15** | **0** |
| 启动的录音数（18 个音） | 18 | 3 |
| 12 s 长音（5.220 s 录音）最后 100 ms | RMS **0.000000** / peak **0.000000** | RMS **0.482517** / peak **0.999847** |
| 12 s 长音最后一个非零帧 | 9.220 s（之后 6.78 s 全静音） | 16.000 s（到渲染末尾） |

改前那句被拒的话是量出来的：`carrying this voice to 58 would need 4.25 s of "cello"'s recording and only 1.861 s is left` ——
而那条录音的 `smpl` 循环是 `1.234…4.725 s`。**"只剩 1.861 s"对一个会回卷的录音是句假话。**

**③ 听感（§26）为什么这一边更对。** 拒绝的后果不是"安静"，而是**重新起音**：在换和弦的那一瞬间，
演奏层本来是要"弓不停、只换指"，拒绝把它变回"新的一弓压在还在响的和弦上"——这正是
`docs/LEGATO_OVERLAP.md` §1 与 §4 花了整节在描述的那个"断"。**在能循环的库上拒绝，等于主动把已经能修的那个缺陷留在原地。**
反过来，接过去之后音色仍是前一条录音变调（§7 第 2 行那条限制**没有变**），但**起音**这一半是真的被修掉了。

### 11.3 实现放在哪，以及为什么不是请求上的一个字段

`src/audio/legatoVoices.ts`：`remainingWallSeconds` 在 `sounding.voice.looping` 为真时取 `Number.POSITIVE_INFINITY`。

**为什么读 voice 自己的 `looping` 而不是在 `LegatoVoiceRequest` 上加一个 `loops` 字段**：因为那**就是事实本身**。
`request.recordingSeconds` 是 buffer 的长度；"这个长度是不是一堵墙"是**已启动的那个节点**的属性，而
`SamplerVoice` 已经在报它（`voice.looping`，由 region 的 `loop_mode` **或** 录音的 `smpl` 块设置，见 `src/audio/sampleLoader.ts`）。
再抄一份到请求上就可能和它描述的那个 voice 不一致——"账本以为在循环、voice 其实不在"就是"接过去之后还是没声"。

### 11.4 反向：业主那份工程一个字没变（同一次修改，同一次实跑）

`src/test/ownerProjectAcceptance.test.ts`，期望值**一条未改**：

```
弦乐 legato : 19 overlapping chord change(s), 57 note(s) on them, 57 handed over by the rule;
at the voice: 32 carried, 25 refused (recording-would-run-out); 28 recording(s) started for 60 notes;
at beat 48 = 24 s: 3 attacks before, 1 after
```

**为什么不变**：`VlnEns_susVib_*` 不写 `loop_*`，而它们**也真的不带 `smpl`**（本轮实测：`vsco2ce` 1830 个 WAV 里只有 6 个带，
全是 `Keys/Upright Nr1/UR1_*_pp_RR*.wav`）⇒ `voice.looping` 为假 ⇒ 走的老路，一个字节都没动。

### 11.5 ⚠️ 何时回来重看这一节

| 触发条件 | 为什么它会让这个裁定需要重看 |
| --- | --- |
| **业主对"带循环点的库"给出听感结论** | 这条裁定只主张"起音次数变少、末尾不再静音"，**好不好听不由本文判**。业主说不好听，就得回来改这条裁定而不是改判据 |
| **`loop_sustain` 的 release 语义落地** | `loop_sustain` 在**释放阶段退出循环**（规范原话："During the release phase, there's no looping"）。今天离线这条路上，循环 voice 的终点是 `stop()` 排好的，release 阶段与循环的关系没有被分开实现；一旦分开，"release 阶段还剩多少录音"就重新变成一个真问题 |
| **解析器能力那条线让 `no_loop` 显式可见** | 现在为分辨"写了 `no_loop`"和"什么都没写"，`sampleLoader` 去读 SFZ 文本里**任何**命名了该采样的 region 的 `loop_*` opcode——这是保守近似（同一采样被两个 region 命名、只有一个写了循环时，两个都不循环）。`ResolvedInstrumentNote` 一旦带上"显式不循环"这个事实，这个近似就该删掉 |
| **实时那条路也接上 WAV 循环** | 本轮只把离线导出那条路（`WavExporter`）接上了 `createWaveLoopReader()`；实时两条路的入口在 `src/audio/browserSampleGraph.ts`（**不在本轮范围内**）。那两处接上之前，`voice.looping` 在实时路上**只可能**来自 SFZ，本节第 11.2 ② 的读数在实时路上还不成立 |
| **`smpl` 之外出现别的循环来源**（如 FLAC 的 APPLICATION 块） | 本轮 7 个 freepats 库里 5 个只有 `.flac`（无 `smpl` 可读），裁定里"录音自带循环"的证据全来自 RIFF `smpl` |

⭐ **一句话**：**循环的是录音，判断的是 voice；规则问"这一音要持续多久"，答案现在从"录音还剩多久"换成了"录音会不会回卷"。**
