# 弦乐演奏法：量出来的清单、够不到的缺口、以及写下来的规则

> 业主的两句话是这份文档的起因：**「弦乐类乐器是要特别注意」**、**「弦乐的各种演奏技巧还是很重要的」**。
> 本文回答三个问题：**素材里到底有哪些演奏法**（量，不是猜）、**哪些今天够不到以及为什么**、
> **什么音乐情形该用什么演奏法**（规则，按名字猜字符串是被替换掉的那个做法）。

## 0. 一句话结论

**今天能拿到的弦乐演奏法有 2 种：`sustain`（持续，含录音里的揉弦）与 `pizzicato`（拨弦）；
够不到的有 3 种：`spiccato`（跳弓）、`tremolo`（震音）、以及 `-Quiet` 那一组单独的弱奏录音。**

按程序数：**25 行里 8 行有声，17 行只有文件、没有镜像字节**；其中 **solo violin 五种演奏法一行都不可用**。
另外 `col legno` 与 `harmonics`（泛音）**在上游库里根本没有程序**——表里有词、库里无物，请求它们会被按名字拒绝，
而不是悄悄落回一个 sustain。

## 1. 量法（可复核，不需要下载任何音频以外的推理）

| 对象 | 来源 |
| --- | --- |
| 75 个上游程序的正文 | `schollz/VSCO-2-CE` 钉住 `6dd651d55dde97fd4028699be9d4481f26917891`，`SFZ` 分支 |
| 镜像里 26 个程序的 WAV 字节 | `public/samples/manifest.json` 列出的文件，本地镜像树 |
| 解析 | 仓库自己的 `parseSfz`（`src/audio/sfz/parse.ts`），`sample=` 按该 region 自己的 `default_path` 解析 |
| 时长 / 峰值 / `smpl` | 直接读 RIFF，不是 `ffprobe` 的转述 |

⚠️ **一条踩过三次的坑，第四次出现在本文的量法里**：`default_path` 未加引号且含空格时必须在行尾结束
（`default_path=Strings\Violin Section\susVib\`）。按空白截断会得到 `Strings/Violin`，于是六件乐器的采样全部"找不到"。
本文的每个数字都走 `parseSfz` + region 自己的 `default_path`，所以这条规则不会再被踩。

## 2. 演奏法清单（按 program 逐条列）

下表是**弦乐类**的全部程序。`镜像` 一列是"字节在不在"，不是"演奏法存在不存在"。

| 乐器 | program | 演奏法 | 力度层 | 音域 | 采样数 | 采样时长（最短–最长） | `smpl` 循环点 | 镜像 |
| --- | --- | --- | --- | --- | ---: | --- | --- | --- |
| Violin Section | `ViolinEnsSusVib.sfz` | 持续（录音带揉弦） | 0–62 / 63–127 | 55–86 | 22 | 8.988–15.200 s | 无 | ✓ |
| Violin Section | `ViolinEnsPizz.sfz` | 拨弦 | 0–62 / 63–127 | 55–86 | 44 | 0.440–3.016 s | 无 | ✓ |
| Violin Section | `ViolinEnsSpic.sfz` | 跳弓（`seq_length=2` 轮替） | 0–62 / 63–127 | 55–86 | 44 | 未镜像 | 无 | ✗ |
| Violin Section | `ViolinEnsTrem.sfz` | 震音 | 0–62 / 0–127 / 63–127 | 55–86 | 21 | 未镜像 | 无 | ✗ |
| Violin Section | `ViolinEnsSusVib-Quiet.sfz` | 持续·单独弱奏 | 0–127（单层） | 55–86 | 11 | 未镜像 | 无 | ✗ |
| Viola Section | `ViolaEnsSusVib.sfz` | 持续 | 0–62 / 63–127 | 48–86 | 26 | 7.565–13.746 s | 无 | ✓ |
| Viola Section | `ViolaEnsPizz.sfz` | 拨弦 | 0–62 / 0–127 / 63–127 | 48–86 | 46 | 0.282–3.366 s | 无 | ✓ |
| Viola Section | `ViolaEnsSpic.sfz` | 跳弓 | 0–62 / 63–127 | 48–86 | 48 | 未镜像 | 无 | ✗ |
| Viola Section | `ViolaEnsTrem.sfz` | 震音 | 0–62 / 63–127 | 48–86 | 24 | 未镜像 | 无 | ✗ |
| Viola Section | `ViolaEnsSusVib-Quiet.sfz` | 持续·单独弱奏 | 0–127 | 48–86 | 13 | 未镜像 | 无 | ✗ |
| Cello Section | `CelloEnsSusVib.sfz` | 持续 | 0–41 / 0–62 / 42–62 / 63–127 | 36–77 | 27 | 6.387–12.747 s | 无 | ✓ |
| Cello Section | `CelloEnsPizz.sfz` | 拨弦（`seq_length=2`） | 0–62 / 63–127 | 36–77 | 52 | 0.873–3.999 s | 无 | ✓ |
| Cello Section | `CelloEnsSpic.sfz` | 跳弓 | 0–62 / 63–127 | 36–77 | 52 | 未镜像 | 无 | ✗ |
| Cello Section | `CelloEnsTrem.sfz` | 震音 | 0–62 / 0–127 / 63–127 | 36–77 | 25 | 未镜像 | 无 | ✗ |
| Cello Section | `CelloEnsSusVib-Quiet.sfz` | 持续·单独弱奏 | 0–41 / 0–127 / 42–127 | 36–77 | 14 | 未镜像 | 无 | ✗ |
| Solo Contrabass | `ContrabassSusVB.sfz` | 持续（注意拼写是 `SusVB`） | 0–62 / 63–127 | 24–60 | 26 | 6.539–17.332 s | 无 | ✓ |
| Solo Contrabass | `ContrabassPizz.sfz` | 拨弦 | 0–62 / 0–127 / 63–127 | 24–60 | 40 | 0.961–6.024 s | 无 | ✓ |
| Solo Contrabass | `ContrabassSpic.sfz` | 跳弓 | 0–62 / 0–127 / 63–127 | 24–60 | 42 | 未镜像 | 无 | ✗ |
| Solo Contrabass | `ContrabassTrem.sfz` | 震音 | 0–62 / 63–127 | 24–60 | 16 | 未镜像 | 无 | ✗ |
| Solo Contrabass | `ContrabassSusVB-Quiet.sfz` | 持续·单独弱奏 | 0–127 | 24–60 | 13 | 未镜像 | 无 | ✗ |
| Solo Violin | `SViolinVib.sfz` | 持续 | 0–62 / 63–127 | 55–96 | 30 | 未镜像 | 无 | ✗ |
| Solo Violin | `SViolinPizz.sfz` | 拨弦 | 0–62 / 0–127 / 63–127 | 55–96 | 44 | 未镜像 | 无 | ✗ |
| Solo Violin | `SViolinSpic.sfz` | 跳弓 | 0–62 / 63–127 | 55–96 | 60 | 未镜像 | 无 | ✗ |
| Solo Violin | `SViolinTrem.sfz` | 震音 | 0–62 / 0–127 / 63–127 | 55–96 | 27 | 未镜像 | 无 | ✗ |
| Solo Violin | `SViolinVib-Quiet.sfz` | 持续·单独弱奏 | 0–127 | 55–96 | 15 | 未镜像 | 无 | ✗ |

上游另有 8 个 `-KS` 键位切换程序（`ViolinEns-KS`、`CelloEns-KS`、`SViolin-KS` …），每个文件把 2–5 套奏法
折进一个文件、**每套各自开一个 `<control>` 段声明自己的 `default_path`**（`CelloEns-KS` 的 156 个 region 分别指向
`susvib`/`trem`/`spic`/`pizzT`）。它们**都不是独立演奏法**，因此不进上表；解析器已按 `<control>` 段读路径。

### 2.1 没有的东西，也要有名字

| 演奏法 | 上游有没有程序 | 说明 |
| --- | --- | --- |
| `col legno`（弓杆击弦） | **没有** | 整个库里不存在；请求它必须被按名字拒绝 |
| `harmonics`（泛音） | **没有** | 同上 |
| `non-vibrato`（不揉弦长音） | **没有独立程序** | 只有 `*-Quiet` 是另一种录音；`susVib` 的揉弦是录进去的，去不掉 |
| `sordino`（弱音器弦乐） | **没有** | 弱音器只给了 F Horn 与 Trumpet |

## 3. 长度约束：这是硬约束，不是播放器的问题

**75 个程序里声明 `loop` 的：0 个。镜像的 36 个程序对应的 `.wav` 里带 `smpl` chunk 的：0 个。**
⇒ 弦乐的持续音是**一次性录音**，录到哪停到哪，任何 player 语义都改不了这一点。

每个 program 因此有两个数（都在 `src/data/stringTechniques.ts` 的 `maxSampleSeconds` / `safeSeconds`）：

* `maxSampleSeconds` = 该程序**最长**的采样：写比它长的音，一定收不全；
* `safeSeconds` = 该程序**最短**的采样：写比它短的音，一定够用；**两者之间是"要看是哪个音"**——哪个采样应这个音取决于音高。

超了怎么办：`LENGTH_REMEDIES` 写了**三条**出路和各自的代价，而不是悄悄截断：

| 出路 | 代价 |
| --- | --- |
| `truncate` | 音在采样尽头停住。如果这个音本来是要拖着的，收尾会不自然——结束它的是录音自己的衰减，不是作曲者写的 note-off。不用做任何事，所以这是最便宜的一条。 |
| `switch-technique` | 换一个更长的 program，音就拖住了——但**奏法跟着变了**：用拨弦去演一条 sostenuto 是另一个手势，而不是同一个音拖得更久。 |
| `retrigger` | 同音高写两个（或更多）互相交叠、各自不超采样长度的音，让第二次起音落在第一个的尾巴底下。保住奏法与长度；代价是多了一次录音里没有的起音——对单根长音是错的（听成换弓），对重复弓法是正的。 |

## 4. 力度：velocity 是**选层**，不是**塑形**

| program | 层 | `velocity` |
| --- | --- | --- |
| `ViolinEnsSusVib` / `ViolaEnsSusVib` / `ContrabassSusVB` | 2 层 | 0–62（软）／63–127（响） |
| `CelloEnsSusVib` | 4 段 | 0–41 / 0–62 / 42–62 / 63–127 |
| 四个 `*Pizz` | 2–3 层 | 取决于 program |
| `*-Quiet` | 1 层 | 0–127（**整首曲子弱奏**，不是"写个低力度"） |

**这张表就是全部。** 写一条 velocity 渐变（40→50→60）在这四个持续音 program 上**只得到一层**，因为 40 与 62 是
**同一份录音、同一个增益**；而 62→63 是**两份不同的录音**，一步跨过几个 dB。
文件自己用 `volume=` 补偿了这个落差（软层 `volume=20`、响层 `volume=7`），所以响度差是**录音的属性**，不是播放器做的。
⇒ 想要更多层次，**只能靠换 program**（`-Quiet` 那组），而它们**没有被镜像**。

## 5. 规则：什么音乐情形该用什么演奏法

规则表在 `src/data/stringTechniques.ts` 的 `STRING_SITUATION_RULES`；下面是同一张表的可读版。
**没有一条规则按名字字符串猜**——每条都在表里查"奏法 / 字节在不在 / 音域 / 长度"。

| 情形 | 首选（按序） | 为什么 | 模型里怎么认出来 |
| --- | --- | --- | --- |
| **持续铺底**（长和弦） | `sustain` → `quiet` → `non-vibrato` | 录音里的揉弦是暖的默认；要垫在everything底下时才用单独弱奏那一版；不揉弦是备选，但库里没有独立程序 | 多个音同时起音、`lengthBeats` 够到下一个和弦（`src/data/legatoGaps.ts` 读的就是这件事） |
| **连奏** | `sustain` → `quiet` | 要连的音是**写法**问题：每个音的 release 必须压过下一个的起音。奏法和铺底一样，差别在 `legatoGaps` 报的那个 seam | 单声部、相邻音相接、平均长度不到一小节 |
| **短促/重复**（跳音、节奏型） | `spiccato` → `pizzicato` | 跳弓才是"重复的短弓"，而且 `seq_length=2` 让重复音轮替采样、不会机关枪一样一个音。**它的字节没镜像，所以今天落在拨弦上**——那是另一种声音（拨 vs 弓），如实上报 | 一串同音高，或音长只是到下一个起音间距的一小部分 |
| **拨弦/低音走动** | `pizzicato`（**限 24–60**） | 低音提琴的拨弦就是 walking bass，它 6.024 s 的最长采样是低音线条"成线不成点"的原因。**"走动"是低音区**，所以这条规则带音域：中提琴的拨弦是拨弦，但不是 walking bass | 低音区（24–60）、短而分明的音 |
| **震音/紧张** | `tremolo` → `sustain` | 震音是唯一说"紧张"而不说"温暖"的织体。**字节没镜像**，今天落回 sustain，紧张感拿不到——这是要报的缺口，不是拿一个持续音假装 | 一个音写得比邻居长很多且音高不变 |
| **重音/突强** | `pizzicato` → `spiccato` | sforzando 要的是**起音**，而软起音的持续弓没有起音——**没有任何 velocity 能加上它**，因为 velocity 是选层不是塑形。拨弦提供起音；若这个音还得拖住，诚实的回答是这个库做不到两头兼顾 | 某个音的 velocity 远高于同声部的中位数 |

## 6. 竖片：改了什么

| 文件 | 改了什么 |
| --- | --- |
| `src/data/stringTechniques.ts` | **新增**。25 行显式数据（乐器 / 奏法 / `assetId` / program / 音域 / 力度层 / 采样时长 / 镜像与否 / 理由）、`STRING_SITUATION_RULES` 规则表、`chooseTechnique`、`velocityLayerFor`、`resolveLengthConstraint`、`LENGTH_REMEDIES` |
| `src/test/stringTechniques.test.ts` | **新增**，32 条判据：表 ↔ 目录（离线）、表内部一致、力度选层、长度三分、规则与回落 |
| `mcp/instruments.ts` | 乐器列表新增 `stringInstrument` / `technique` / `situations` / `maxHeldSeconds` / `dynamicLayers` 五个字段，并新增 `situation` 过滤（音域随规则走） |
| `mcp/registry.ts` | `list_arrangement_instruments` 新增 `situation` 入参（enum 由规则表派生），描述里写明"字符串不循环、长音会停"；`render_stems` 新增 `chordChangeReattacks` ＋ `chordChangeReattackNote`（与 `legatoGaps` 并列） |
| `src/test/stringTechniques.test.ts` | **新增** 6 条判据，把"表里的奏法"与"列表报出来的奏法"两端扣住 |
| `src/test/ownerProjectAcceptance.test.ts` | **新增** 1 条：把业主的"断"定位到 **beat 48 = 24.0000 s**，并同条断言 `legatoGapsFor` 对弦乐报空（见 §9） |
| `docs/STRING_TECHNIQUES.md` | **新增**：本文，量法与全部读数 |
| `src/audio/samplerVoice.ts` | 新增 `releaseSeconds` / `MIN_RELEASE_SECONDS` / `DEFAULT_SAMPLER_RELEASE_SECONDS`（**故意未接线**，见 §10.2） |
| `src/test/samplerVoice.test.ts` | **新增** 3 条判据：释放斜坡的形状、释放比音长时缩释放、已排终点不被 `stop` 硬切 |
| `src/test/vscoSamplerLane.test.ts` | 该测试自己的混音器原先用 `gain.value` 当**常数**读增益，于是"排了斜坡"读回来是 0（整轨静音）；改成**逐帧**求值调度（`gainAt`），这是 Web Audio 的语义 |
| `mcp/arrangement.ts` | `ImportMcpMusicXmlOptions.instruments` ＋ `addImportedParts` 建轨时写身份（**见 §11**） |
| `mcp/registry.ts` | `import_arrangement_midi` 新增 `instruments` 入参 |
| `src/data/arrangementImport.ts` | 同一个可选 `instruments` 参数（默认行为不变） |
| `src/test/midiArrangementImport.test.ts` | **新增** 6 条判据：不写身份＝合成器、写了就解析到真采样、服务不了的名字报出且不写、合成器名字被接受、索引指向不存在的 part 要报 |

## 7. 被桥挡住的那一步（没有动）

## 7. 被桥挡住的那一步（**当时**没有动 —— 已于 §11 补上）

> ⚠️ **本节记录的是当时的状态。桥随后由另一条线落地（`TrackV2.instrument` ＋ `sampledInstruments.ts`），
> 本线在 §11 补上了导入侧那一步。读本节请连着 §11 一起读。**

**导入 MIDI / MusicXML 时，每个 part 都被建成 `kind:"synth"`、没有 `sample`**，因此上面选出来的
`assetId` 无处安放：

* `src/data/arrangementImport.ts:64` — `addTrack(next, "synth", part.name.slice(0, 40) || "Imported")`（应用里选文件那条路）
* `mcp/arrangement.ts:849` — `addTrack(next, "synth", candidate.part.name.slice(0, 40) || "Imported")`（`import_arrangement_midi` 那条路）

`mcp/arrangement.ts:272` 对每一轨都会说这句话：
> *"…is a synth track and sounds through the built-in preset …: a synth's timbre cannot be pointed at a recorded instrument. For a real piano, strings or bass, add a track with kind:"sampler" and give it an asset…"*

`TrackV2`（`src/types/arrangementV2.ts:32`）里**没有 `instrument` 字段**，录音乐器只能通过 `sample?: { assetId: string }` 表达。
⇒ **"让 synth 角色能载真采样"这座桥**是业主另派的 `cd46f144`，本文与竖片都停在它前面，只把
「选哪个 `assetId`」这件事做完并做对。

## 8. 真验收件上的读数（改前／改后）

验收件 = `/tmp/groove-fx/fate-echoes.mid`（1902 字节，198 个音符，3 个 part）。

| | 改前（现在的导入路径） | 改后（演奏法表给出的答案） |
| --- | --- | --- |
| 弦乐 part | 60 个音，pitch 57–69，时长 8.5 beats，velocity 50 | 同左 |
| 轨道 kind | `synth` | （被桥挡住，仍是 `synth`） |
| 乐器身份 | `sample = null` | `vsco2ce:ViolinEnsSusVib`，首选、无回落 |
| 力度落层 | 无层可选（走内置预设） | velocity 50 → 层 `[0, 62]`（软奏层） |
| 命中 region | 无 | 5 个 region，60 个音**0 个被拒** |
| 长度判定 | 无 | `fits`：4.250 s < 选中采样的 8.988 s |
| 三轨合计 | 3 个 part 全部 `synth`／`sample=null` | 60+58+80 个音全部落在各自乐器音域内，0 个出界 |

选中 region 与采样时长（读 RIFF 得到，不是听感）：

| 采样 | 键域 | 命中音数 | 时长 | 峰值 | 8 窗 RMS |
| --- | --- | ---: | --- | --- | --- |
| `VlnEns_susVib_A2_v1.wav` | 56–57 | 5 | 11.220 s | 0.072 | 0.0054 … 0.0212 … 0.0083 |
| `VlnEns_susVib_B2_v1.wav` | 58–60 | 10 | 13.120 s | 0.066 | 0.0045 … 0.0190 … 0.0094 |
| `VlnEns_susVib_D3_v1.wav` | 61–63 | 15 | 11.688 s | 0.066 | 0.0047 … 0.0172 … 0.0061 |
| `VlnEns_susVib_F#3_v1.wav` | 64–67 | 25 | 8.988 s | 0.066 | 0.0060 … 0.0195 … 0.0061 |
| `VlnEns_susVib_A3_v1.wav` | 68–70 | 5 | 10.716 s | 0.108 | 0.0079 … 0.0261 … 0.0089 |

⚠️ **这不是听感判断**：上表是帧数 / 采样率、RIFF 峰值与分窗 RMS，以及对音符的解析结果。
每个采样都在**最后一窗掉下去**（0.0190→0.0094 之类），即录音自带收尾淡出，尾部不是静音。

## 9. ⭐⭐ 追加：业主的"断"定位到**换和弦点**——`重叠 ≠ 连奏`

业主后来给了一张波形截图，并确认了两件事：**① 那份音频是 Groove 自己导出的弦乐轨**；**② 听到断的时刻＝图上游标＝`23.98 s`**。

### 9.1 先证伪"采样播了两遍"

| 候选解释 | 算术 | 判定 |
| --- | --- | --- |
| `11.697 × 2 = 23.394 s` | 23.394 s 对应 **beat 46.788**——那里**既没有和弦起点、也没有任何音的 release** | ✗ **证伪** |
| **换和弦点 beat 48** | **24.0000 s**，与游标 **23.98 s 差 0.0200 s** | ✓ **成立** |

而且弦乐 part 的第一个和弦在 **beat 32 = 16.00 s**、之后每 8 beats 一个，所以 23.98 s 附近唯一的事件就是 **beat 48**。

**"播两遍"这条路在代码上也是不存在的**：`src/audio/samplerVoice.ts:161` 每个音只建**一个** `AudioBufferSourceNode`，
`source.start(startedAt, 0, seconds)` 调**一次**；全仓库检索 `retrigger` / `stitch` / `splice` / `loop count` 在采样播放路径上
**没有任何命中**。⇒ **第二遍没有来源，它不存在。**

### 9.2 成立的机制：**重叠了，但没有连奏**

工程数据：20 个和弦 × 3 音，**每 8 beats 一个**，每音 **`lengthBeats = 8.5`** ⇒

```text
旧和弦 end = 8k + 8.5 ｜ 新和弦 start = 8k + 8
⇒ 新和弦起音时，旧和弦还有 0.5 beat = 0.2500 s 在响  ← 这是"重叠"
```

**但重叠不等于连奏**：新和弦的三个音是**三个新 voice**，各自从**自己的包络起点**开始——
`src/audio/noteEnvelope.ts:105`（`scheduleNoteEnvelope` 的第一行）是 `param.setValueAtTime(0.0001, now)`，
即每个音的增益都从 **−80 dBFS 爬到峰值（6 ms attack）**。所以在每个换和弦点上，**三个新起音落在还在延音的和弦上**。
→ **听起来就是"持续的弦乐里被打断了一下"** —— 正是业主描述的"断"。业主的耳朵是对的。

### 9.3 两个检测器问的是**不同的问题**，只有一个看得见这件事

| 检测器 | 问的问题 | 在这个工程上的结果 |
| --- | --- | --- |
| `legatoGapsFor`（`src/data/legatoGaps.ts`，已有） | 和弦**够不到**下一个吗？（有缝 ✗） | 弦乐 **什么都不报** —— 每个和弦都够到了 |
| `chordChangeReattacks`（**本次新增**，`src/data/stringTechniques.ts`） | 和弦**重叠了却仍然重新起音**吗？ | 弦乐 **19 个换和弦点**，第一个 beat 40 = 20 s，**beat 48 = 24 s** 在其中 |

⇒ **这就是那个真实的"断"能躲过已有检查的原因**：那个检查看起来覆盖了这件事，但它问的是另一个问题。

### 9.4 判据

* `src/test/ownerProjectAcceptance.test.ts` 新增一条：**beat 48 = 24.0000 s、与 23.98 s 差 < 0.05 s、重叠 0.25 s、3 个新起音、共 19 处**，
  并同条断言 `legatoGapsFor` 对弦乐**报空**——两个事实钉在一起，不能再被合并。
* `src/test/stringTechniques.test.ts` 新增 6 条：重叠必报、**不重叠必不报（反向）**、单音不报、非持续织体不报、
  只数真正重叠的那些、每轨分开报。
* `render_stems`（`mcp/registry.ts`）现在把 `chordChangeReattacks` ＋ `chordChangeReattackNote` 与 `legatoGaps` 并列返回。

### 9.5 一条**没有**做的测量，如实说明

**不连续性检测器写好了、在对照件上验过，但没有跑在业主这份音频上**——因为**本地没有那份渲染文件**
（`/tmp/groove-fx/` 里只有 `.mid`；全盘找过 2026-10-01 之后的 `.wav`，只有其它测试的产物）。
业主提供的是一张**截图**，不是音频。⇒ 截图只能读几何，读不出相位／谱变化。
**要跑这个检测器，需要那份导出的音频文件。** 检测器在 `/tmp/strings-recon/measure_discontinuity.ts`：
它报"最大相邻样本差分 / 细粒度包络 / 谱通量 / 过零率"，在 24 s 连续正弦的对照件上**零假阳**。

---

## 10. ⭐⭐ 追加二：成熟做法调研的三条结论，落进本线的状态

调研文档：`docs/research/string-sustain-and-legato-in-mature-samplers.md`（另一条线产出，已随 `dev` 入库）。

### 10.1 缺陷 A 的机制，**SFZ 规范自己写着**（本线原先的说法要收窄）

规范在 `sustain_note_basics` 里对"被抢占的音"的说法是：只用 `group`/`off_by` 而**不带** `off_mode` ＋ `ampeg_release` 时，
被抢占的音 *"drops off extremely quickly, which will probably leave an **audible drop in levels during the transition**"*。
⇒ **这就是那个"断"，规范里有名字。** §9.2 写的机制（新起音落在还在响的旧音上）方向对，但要收窄成：
**交接处缺的是"旧音的淡出 × 新音的淡入"这条交叉淡化，而不只是新音有 attack。**

### 10.2 ⭐ 第 (1) 步已实现：`releaseSeconds`（**机制已就位，故意未接线**）

`src/audio/samplerVoice.ts` 新增 `releaseSeconds`：今天 `seconds` 走的是 `source.start(when, 0, seconds)`，
Web Audio 规范说播放**就在那一刻结束** —— 波形被从半周期切断，是一个阶跃，而阶跃就是咔哒声。给了 `releaseSeconds` 之后，
改用"**不给长度、给一个终点**"：`source.start(when)` ＋ 增益在音符结束前 `releaseWindow` 内线性降到 0，
**在同一个秒数到达静音**，并在斜坡之后一点点才 `stop()`。同时 `stop()` 对"已经排好终点"的音**不再硬切**
（否则会在斜坡内部切一刀，正是要移除的那个咔哒）。

**实测（真字节，`VlnEns_susVib_D3_v1.wav`，4.25 s 的音，用忠实的调度求值，不是 fake）：**

| | 音符末尾 60 ms 内最大相邻样本差分 | 相对该信号自身的中位差分 |
| --- | --- | --- |
| 今天（硬切） | `1.779e-2` | **3.4×** |
| `releaseSeconds = 0.25` | `3.631e-3` | **0.7×** |

而且**音符长度不变**（都在 4.25 s 结束），末尾 100 ms 的 RMS 两种都是 0。

⚠️ **但它故意没有接到导出路径上**（`WavExporter` 的 sampler sink 不传这个参数）。理由是一个**读数**，不是判断：
一传，**每一个导出的采样音轨响度都会变**，而业主把这一类改动留给了自己。在仓库自己的 `vscoSamplerLane` fixture 上
（三个 0.125 s 的音），只改这一件事：

| | `laneEnergy` | `lanePeakDb` |
| --- | --- | --- |
| 不传 | `1.3227e+4` | `-2.16 dB` |
| 传 0.25 s | `5.9296e+3` | `-1.30 dB` |

⇒ **「哪个乐器该拿这条释放」是要业主定的决定**，不是本线顺手打开的开关。机制＋判据已经在了
（`src/test/samplerVoice.test.ts` 新增 3 条：斜坡形状、释放比音长时缩释放而不缩音、已排终点不被 `stop` 硬切），接线是一行。

### 10.3 三条**不许夸大**的边界（调研写得很准，照录）

* **`loop_crossfade` 救不了业主工程里的 VSCO 持续音程序。** 它作用于**已经存在的循环**，而 VSCO 的弦乐字节里
  **没有循环点**（§3 已量：75 个程序 0 处 `loop`、镜像 `.wav` 0 个 `smpl`）。⇒ 它只能让"已经有循环点的库"
  （例如已镜像的 `karoryfer-meatbass`）更顺。**对业主那条弦乐，唯一的答案仍然是内容/作曲层的长度约束** —— 与
  Orchestral Tools 自己的提醒同向。⇒ **B 若要做，必须先把这句话说清楚**，不能让业主以为它会治好那条弦乐。
* **第 (2)(3) 步（`trigger=legato` + `offset`、Kontakt 式的播放位置延续）被那座桥挡住。** 它们要求"换音时还有别的音在响"
  这个上下文，而曲风角色今天走的是合成/物理模型，真采样只经"显式 sampler 轨的 `assetId`"到达播放。⇒ 停在边界，不动桥。
* **`legatoGaps` 只报写作层的缝，测不到播放层的重新起音** —— 这正是缺陷 A 能躲过它的原因；补上的播放层判据见 §9.3 与 §9.4。

⚠️ **一条必须说清的前提**：业主截图的音频里，弦乐轨走的是**内置预设**（导入把每个 part 建成 `kind:"synth"`、`sample=null`），
**不是** VSCO 采样。所以 §10.2 的采样释放对他今天听到的那一轨**还不生效**：它要等那座桥，或等他显式用一条 sampler 轨。

---

## 11. ⭐⭐ 追加三：桥已通，洞已补——**导入的 part 现在能指定乐器身份**

### 11.1 桥（别人做的）已经落地，`§7` 那条边界不再成立

`dev` 上已有 `TrackV2.instrument`（`src/types/arrangementV2.ts:71`）与 `src/data/sampledInstruments.ts`：
**一条 `kind:"synth"` 的轨道，只要 `instrument` 是表里的名字，lane 就走 `sampledAssetForLane` 解析到真采样。**
本线实测（不是读代码）：

```
kind:"synth" + instrument:"strings_lead"  → role=lead → sampledAssetForLane = vsco2ce:ViolinEnsSusVib
kind:"synth" + instrument:"piano_lead"    → salamander-grand
kind:"synth" + instrument:"walking_upright" → karoryfer-meatbass:pizz-basic
kind:"synth" + instrument:"warm_pad"      → (无采样，保持合成器 ← 这是正确答案)
```

⇒ **本线原先选出来的 `assetId` 现在有地方安放了。**

### 11.2 ⚠️ 但**文件本身说不出身份**，这是量出来的

* **业主那份工程里 `0` 个 program change 事件**——四个 `MTrk` chunk 全扫过，一个都没有；
* `ImportedPart` 只有 `name` 与 `notes`（`fromMidi` 实测暴露的字段就是这两个），**没有 channel、没有 program**；
* `src/audio/MidiImporter.ts:331` 目前**读到 0xc0 program change 直接 `readUint8()` 丢掉**。

⇒ 而且**不许从 part 名字猜**：对 `弦乐` 做子串/词典匹配会"自信地给出错答案"，本仓的规矩是**错的乐器比合成器更糟**
（那是对作曲者音乐的一个没人做过的断言）。`AI 图片` 里那句"part 名叫 `弦乐` 是名字，不是乐器"就是这个意思。

### 11.3 补的洞：**调用者显式指定**，不猜

| 位置 | 改了什么 |
| --- | --- |
| `mcp/arrangement.ts`（`ImportMcpMusicXmlOptions`） | 新增 `instruments?: Record<number, string>`，**按 part 索引**（不是位置数组：空 part 被跳过时数组会整体滑动，"小提琴跑到贝斯上"没人会及时发现） |
| `mcp/arrangement.ts`（`addImportedParts`） | 建轨时把身份**在创建那一刻**写上（`addTrack(..., { instrument })`），不是在轨存在之后再补一次 |
| `mcp/registry.ts`（`import_arrangement_midi`） | 新增 `instruments` 入参，线格式是 `[{partIndex, instrument}]`，内部转成按索引的 record |
| `src/data/arrangementImport.ts` | 同一个可选参数也给了应用侧，**默认行为完全不变** |

两条判据性的行为：

* **名字服务不了 ⇒ 报出来，并且不写**：`banjo_lead` → `problems` 里一句
  *"part 2 "弦乐" was named instrument "banjo_lead", which no recorded instrument or built-in voice serves … the track keeps its built-in voice"*，轨道**不写**这个名字（否则会变成"轨道声称有乐器、实际放预设"）；
* **索引指向不存在的 part ⇒ 报出来**（这是写判据时量到的一个真缺陷）：调用者按 chunk 数而不是 part 数写 `{"2": …}` 时，
  从前会**静默不生效**——贝斯保持合成器而回复一声不吭；现在会说明"文件有 N 个 part，分别是…"。

### 11.4 业主那份真文件上的读数（真代码，无 stub）

| part | 改前 | 改后 |
| --- | --- | --- |
| 钢琴（58 音） | `instrument=(none)` → SYNTH | `piano_lead` → **salamander-grand** |
| **弦乐（60 音）** | `instrument=(none)` → SYNTH | **`strings_lead` → `vsco2ce:ViolinEnsSusVib`** |
| 贝斯（80 音） | `instrument=(none)` → SYNTH | `walking_upright` → **karoryfer-meatbass:pizz-basic** |

⇒ **业主最初那句抱怨（弦乐 60 个音解析得对、却在内置预设里响）到这里才真正闭合**：一条 MCP 导入调用就能让那 60 个音走 VSCO。

### 11.5 仍然没做的一步，如实说

**应用里的文件选择器没有地方让人指定乐器**（`importMidiIntoArrangement` 是一个 `File` 入口，没有 UI 收集身份）。
⇒ 数据层不再是障碍，**入口是**；这需要界面，不在本线范围。MCP 那条路今天就能用。

---

## 12. 判不了 / 未核实



* **「sustain 与 pizzicato 哪个好听」判不了**，也不该由本文判。本文只给奏法、字节、时长与命中区域。
* **`-Quiet` 那三组的听感没量**：字节不在镜像里，只有上游文件，所以上表里它们是"未镜像"而不是"不好"。
* **未渲染整轨音频**：验收件在真机上的渲染会走 mirror 的网络地址；本文的读数是**离线**的字节读数。
  渲染级别的判据是 `src/test/vscoSamplerLane.test.ts` 那条路，它自己带本地 HTTP 镜像。
  **业主那份导出的弦乐轨本地没有**，所以 §9.5 的不连续性检测器没有跑在它上面——这是"未核实"，不是"已排除"。
* **`spiccato` / `tremolo` 的实际时长未量**：字节不在镜像里，所以表里它们的长度是 `0`（"没量过"）而不是编一个数。
* **本文不改版本号、不碰 `docs/OPEN_WORK.md`、不碰 `src/mobile/**`。**
