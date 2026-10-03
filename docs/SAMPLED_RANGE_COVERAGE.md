# 调色板映射的音域覆盖普查：哪些声部写出的音，库一个音都发不出来

**普查日期**：2026-10-03 ｜ **基线**：`origin/dev` @ `44321b8`（`fix(samples): one base for #include, ready-then-play, and one loader per session`）
**样本清单**：`public/samples/manifest.json`（32 条库，程序级 322 个资产）
**判据**：`src/test/sampledRangeCensus.test.ts`（34 例：离线 9 例 ＋ 联网 pin 25 例）

> ⚠️ **§2–§6 记录的是"修复前"这一次普查（2026-10-03）。** 普查之后，业主授权把**实测越出乐器本身音域**的曲风写得音修回域内：
> 5 条静音声部里有 **4 条**属于这一类（3 条 `sax_lead` ＋ 1 条 `bell_lead`），已按**整条八度折回（保音级）**修好；
> 剩 **1 条**（`post-punk` 的 bass）判为**库窄而非曲风错**，**故意的没改**。
> ⇒ **本节之后所有"168／25／5"的数都是修复前的数**；**修复后的数、逐条定性依据与"库窄"声部的替代音源调查，全部在 §8**（§8.4 给出新的三类计数与判据）。

---

## §0 一句话结论

在 **159 个曲风 / 202 条"调色板有行、且曲风真的写了音"的声部**里：

* **168 条正常发声**；
* **25 条部分静音**（写出的音有一部分落在录音音域之外，同一轨里其余的音照常出声）；
* **5 条一个音都不发**——它们**不是**加载失败、不是 404、不是没就绪，而是**写出的音高全部落在该声部所映射资产的可发按键之外**（`/genre/bebop` 的 lead 就是其中一条：44 条 note，写 82–91，而 `sax_lead` 映射的 `mtg-solo-sax:MTG-Tenor-Sax` 只发 39–76）；
* 另有 **4 条**声部调色板有行、但曲风这一版没写任何音（本报告单列，不计入上面三类）。

⇒ **业主最关心的数：159 个曲风里，有 5 个曲风各自有 1 条"本该有录音、却一个音都不发"的声部**（`bebop`／`chicago-drill`／`free-jazz`／`post-punk`／`smooth-jazz`）。

---

## §1 方法（怎么取曲风音高、怎么算库的覆盖、怎么判定）

### 1.1 取"曲风写出的音高"

**用引擎自己的渲染入口 `patternFromGenre`**（`src/data/genreMix.ts`），对 `src/data/genres/**` 里的 `ALL_GENRES`（159 个）逐个渲染出**真正会播的 pattern**，而不是读作者手写的骨架：曲风数据里 `sequencer_pattern.tracks[].pitch` 只是**每步根音**，和弦声部、乐句与长度都是 `patternFromGenre` 展开出来的，所以只有渲染后的 pattern 才是"写出的音高"。

每个声部的音高按**调度器自己的读法**取（`src/audio/samplerSteps.ts` 的 `planSamplerSteps`，逐行对齐）：

1. `steps[step] !== 0` 才算一个 note；
2. 有 `pitches[step]` 堆叠就**整叠取**（和弦），否则退回单数 `pitch[step]`；
3. 只取 `> 0` 的值（引擎把 `0`/`null` 当作"这一步没有音"，不默认成中央 C）；
4. 力度取该步自己的 `velocity[step]`（缺省 100），用于逐音判定。

取到的音：**全库 1272 条轨**，其中 `sampledAssetForLane` 返回资产的 660 条（含 458 条鼓轨）；本普查只算 `bass`/`chords`/`lead` 三个旋律声部（**202 条**），因为鼓声部由**另一张表**（`src/audio/drumRoles.ts` 的角色→GM 音符映射）决定，且鼓轨不写音高。

### 1.2 映射：不问第二遍，用引擎的 `sampledAssetForLane`

声部→资产**不再自己写一份映射**，一律问 `src/data/sampledInstruments.ts` 的 `sampledAssetForLane({track_id, instrument})`（它按顺序看 lane 自己的 `sample.assetId`、鼓角色表、`instrument` 精确匹配的名字表，且只对 `bass`/`chords`/`lead` 生效）。

### 1.3 算"库实际覆盖的按键范围"

**取哪些文件**：22 个被用到的资产，各自的 SFZ 程序**从 manifest 的 pin 取原文**——地址来自 `catalogueFromManifestText` 给出的 `asset.sfz.url`（源优先 `https://raw.githubusercontent.com/<repo>/<pin>/<path>`，`fallbackUrl` 为镜像）；`#include` 用 `src/audio/sfz/remoteIncludes.ts` 的 `expandRemoteIncludes` 展开，**include base 用运行时自己的算法**（`src/audio/sampleLoader.ts`：`url.slice(0, url.length - path.length)`，即库根目录）。每一个取到的程序都核对了 `public/samples/manifest.json` 里该路径的 `sha256`，**22/22 全部一致**（联网判据每次重跑都会再核一遍）。

**怎么算"覆盖"**：把展开后的 SFZ 交给引擎的 `resolveInstrumentNote(asset, text, note, { velocity })`，**对 0–127 每个键各问一次**，能答出 region 的键即"可发"。这样下面这些都在引擎里被处理，而不是本报告另写一遍：

| 需要考虑的东西 | 引擎在哪处理 |
| --- | --- |
| `lokey`/`hikey` 区间、`key`（= lokey=hikey=pitch_keycenter） | `parseSfz` → `regionsForNote` |
| `pitch_keycenter`（根音，缺省不移调） | `playbackForNote` 的 `semitones/ratio` |
| `trigger`（release/legato/first 不能答 note-on） | `noteOnTrigger` 过滤；引擎对"整文件只有非 note-on region"给出具名原因 |
| `sw_last`/`sw_lokey`/`sw_hikey`/`sw_default` 门控 | `declaredSwitchDefault` ＋ `regionsForNote` 的 switch gate |
| `loccN`/`hiccN` 控制器门控 | `regionsAtCc` ＋ `readControlDefaults` |
| 力度分层 `lovel`/`hivel` | `regionsForNote(regions, note, velocity, …)` |

**"覆盖范围"就是"能答的键集"，不是 `min`–`max`**：本普查里就有中间被挖空的实例——`dsmolken-double-bass:d-smolken-rubner-bass-pizz` 可发 12–120 但 **61–71 与 90–95 无样本**；`mtg-solo-sax:MTG-Tenor-Sax` 可发 39–76 但 **41/42/43 无样本**。所以报告里的覆盖一律带"缺键"，判定也逐键比。

### 1.4 判定"能发 / 部分能发 / 一个都不发"

**逐音用引擎判**：对每一条声部写出的**每一个音（带该步力度）**调用 `resolveInstrumentNote`；按声部聚合：

* **能发** = 该声部每一个写出的音都能答出 region；
* **部分能发** = 有音能答、有音答不出；
* **一个都不发** = 该声部**零个**音能答出 region（本报告口径：`ok === false` 且原因形如 `note N has no playback: the file's regions cover keys A–B`）。

**力度这一维已核**：对**任何静音/部分静音声部用到的 10 个资产**，可发键集在力度 **1 / 64 / 127** 三档下**完全相同**（`resolutionCache` 之外单独跑的一轮，见 `velocity.json`），所以"某键只在某力度下出声"在本普查里不存在；离线判定（用 100 力度的测量表）与联网判定（用每音自己的力度）结论一致。

### 1.5 本报告与判据用到的文件（全部为仓内既有文件，未改动其中任何一个）

| 用途 | 文件 |
| --- | --- |
| 曲风数据（15 个文件） | `src/data/genres/index.ts` 及其引用的 14 个 `src/data/genres/*.ts` |
| 曲风渲染入口 | `src/data/genreMix.ts`（`patternFromGenre`） |
| 声部→资产映射（调色板） | `src/data/sampledInstruments.ts`（`sampledAssetForLane`；`SAMPLED_INSTRUMENTS` 22 行 ＋ `SAMPLED_TECHNIQUE_INSTRUMENTS` 26 行） |
| 引擎的逐音判定 | `src/audio/sfz/instrument.ts`（`resolveInstrumentNote`）、`src/audio/sfz/regionPlayback.ts`（`playbackForNote`）、`src/audio/sfz/parse.ts`（`parseSfz`/`regionsForNote`/`noteOnTrigger`/`readControlDefaults`/`declaredSwitchDefault`）、`src/audio/sfz/ccGate.ts`（`regionsAtCc`） |
| 取 pin 原文＋展开 include | `src/data/sampleManifest.ts`（`sourceSfzUrl`/`sampleAssetsFromManifest`）、`src/audio/sfz/remoteIncludes.ts`、`src/audio/sampleLoader.ts`（include base 的算法） |
| 采样清单 | `public/samples/manifest.json` |
| 判据 | `src/test/sampledRangeCensus.test.ts`（新增） |

---

## §2 量

### 2.1 22 个被用到的资产，引擎实测的可发按键

（"缺"= 区间内有键但引擎答不出 region；sha256 为从 pin 取到的程序原文，与 manifest 一致。）

| 资产 assetId | 写出的乐器名 | 引擎实测可发按键 | 可发键数 | SFZ sha256（前 12） | 用它的声部数 |
| --- | --- | --- | --- | --- | --- |
| `discord-gm-sitar:105-Sitar` | sitar_lead | 12–96 | 85 | `58423ce227b1` | 1 |
| `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | walking_upright | 12–120 (61–71, 90–95 缺) | 92 | `0aea1def5675` | 18 |
| `freepats-button-accordion-hn` | accordion_lead | 0–127 | 128 | `1f273b331061` | 3 |
| `freepats-drawbar-organ` | m1_organ | 33–98 | 66 | `d3fbbf3d9683` | 7 |
| `freepats-electric-bass-yr:PickedBassYR-20190930` | pick_bass | 26–46 | 21 | `08e69035ccd7` | 16 |
| `freepats-fsbs-dist2` | distorted_guitar | 35–86 | 52 | `746b36690f1d` | 9 |
| `freepats-percussive-organ` | organ_lead | 31–108 | 78 | `ac09175af24d` | 1 |
| `freepats-spanish-classical-guitar` | pluck_string | 29–88 | 60 | `7edec559c98c` | 1 |
| `jlearman-jrhodes3c:jRhodes-both-looped` | rhodes_ep | 24–103 | 80 | `d689a1884b4c` | 34 |
| `karoryfer-black-and-blue-basses:05-darkblack-pluck` | finger_bass | 35–76 | 42 | `9584c30da4ad` | 18 |
| `karoryfer-emilyguitar:emily-clean` | guitar_lead | 33–96 | 64 | `e4e0fb4938db` | 42 |
| `mtg-solo-sax:MTG-Tenor-Sax` | sax_lead | 39–76 (41–43 缺) | 35 | `28e25102e99a` | 4 |
| `salamander-grand` | piano_lead | 21–108 | 88 | `c8b282f03fdb` | 15 |
| `sonatina-brass:All-Brass-Sustain` | brass_section | 28–88 | 61 | `3f9eeabf8421` | 8 |
| `vcsl:Harmonica-Hohner-Special20-C-Keyswitch` | harmonica_lead | 60–97 | 38 | `ddae7215822c` | 2 |
| `vcsl:Marimba` | marimba_lead | 41–97 | 57 | `8d13762fc616` | 1 |
| `vcsl:Tubular-Bells-1` | bell_lead | 60–77 | 18 | `63d9d4949f54` | 6 |
| `vcsl:Vibraphone-Keyswitch` | vibraphone | 57–89 | 33 | `63d7aee8de84` | 3 |
| `vsco2ce:FluteSusVib` | flute_lead | 60–96 | 37 | `26b0dedaa483` | 2 |
| `vsco2ce:TrumpetHarmonMuteSus` | muted_trumpet | 58–84 | 27 | `91432a71a4a1` | 1 |
| `vsco2ce:TrumpetSus` | trumpet_lead | 52–84 | 33 | `8dc5eca44087` | 3 |
| `vsco2ce:ViolinEnsSusVib` | strings_lead | 55–86 | 32 | `4591e212cccf` | 7 |

### 2.2 每个曲风一行：三类计数 ＋ "本该有录音却一个音都不发"

（159 个曲风全列；"无声部内容"＝调色板有行但曲风本版没写音，不计入三类。⭐ 列即业主最关心的数。）

| 曲风 genre id | 有调色板行的声部 | 能发 | 部分能发 | 一个都不发 | 无声部内容 | ⭐ 本该有录音却一个音都不发 |
| --- | --- | --- | --- | --- | --- | --- |
| `chicago-house` | 1 | 1 | 0 | 0 | 0 | **0** |
| `deep-house` | 1 | 1 | 0 | 0 | 0 | **0** |
| `tech-house` | 0 | 0 | 0 | 0 | 0 | **0** |
| `future-house` | 0 | 0 | 0 | 0 | 0 | **0** |
| `progressive-house` | 0 | 0 | 0 | 0 | 0 | **0** |
| `electro-house` | 0 | 0 | 0 | 0 | 0 | **0** |
| `bass-house` | 0 | 0 | 0 | 0 | 0 | **0** |
| `ghetto-house` | 0 | 0 | 0 | 0 | 0 | **0** |
| `tropical-house` | 1 | 1 | 0 | 0 | 0 | **0** |
| `acid-house` | 0 | 0 | 0 | 0 | 0 | **0** |
| `french-house` | 1 | 1 | 0 | 0 | 0 | **0** |
| `melodic-house` | 0 | 0 | 0 | 0 | 0 | **0** |
| `afro-house` | 1 | 1 | 0 | 0 | 0 | **0** |
| `nu-disco-house` | 2 | 1 | 1 | 0 | 0 | **0** |
| `microhouse` | 3 | 1 | 2 | 0 | 0 | **0** |
| `detroit-techno` | 0 | 0 | 0 | 0 | 0 | **0** |
| `minimal-techno` | 0 | 0 | 0 | 0 | 0 | **0** |
| `acid-techno` | 0 | 0 | 0 | 0 | 0 | **0** |
| `dub-techno` | 0 | 0 | 0 | 0 | 0 | **0** |
| `industrial-techno` | 0 | 0 | 0 | 0 | 0 | **0** |
| `peak-time-techno` | 0 | 0 | 0 | 0 | 0 | **0** |
| `hard-techno` | 0 | 0 | 0 | 0 | 0 | **0** |
| `ambient-techno` | 1 | 1 | 0 | 0 | 0 | **0** |
| `raw-techno` | 0 | 0 | 0 | 0 | 0 | **0** |
| `schranz` | 0 | 0 | 0 | 0 | 0 | **0** |
| `uplifting-trance` | 0 | 0 | 0 | 0 | 0 | **0** |
| `progressive-trance` | 0 | 0 | 0 | 0 | 0 | **0** |
| `psytrance` | 0 | 0 | 0 | 0 | 0 | **0** |
| `goa-trance` | 1 | 1 | 0 | 0 | 0 | **0** |
| `tech-trance` | 0 | 0 | 0 | 0 | 0 | **0** |
| `hard-trance` | 0 | 0 | 0 | 0 | 0 | **0** |
| `vocal-trance` | 1 | 1 | 0 | 0 | 0 | **0** |
| `euro-trance` | 0 | 0 | 0 | 0 | 0 | **0** |
| `dream-trance` | 1 | 1 | 0 | 0 | 0 | **0** |
| `dubstep` | 0 | 0 | 0 | 0 | 0 | **0** |
| `brostep` | 0 | 0 | 0 | 0 | 0 | **0** |
| `riddim` | 0 | 0 | 0 | 0 | 0 | **0** |
| `melodic-dubstep` | 0 | 0 | 0 | 0 | 0 | **0** |
| `future-garage` | 1 | 1 | 0 | 0 | 0 | **0** |
| `post-dubstep` | 1 | 1 | 0 | 0 | 0 | **0** |
| `tearout-dubstep` | 0 | 0 | 0 | 0 | 0 | **0** |
| `chillstep` | 1 | 1 | 0 | 0 | 0 | **0** |
| `deathstep` | 2 | 2 | 0 | 0 | 0 | **0** |
| `jungle` | 0 | 0 | 0 | 0 | 0 | **0** |
| `liquid-dnb` | 1 | 1 | 0 | 0 | 0 | **0** |
| `neurofunk` | 0 | 0 | 0 | 0 | 0 | **0** |
| `jump-up` | 0 | 0 | 0 | 0 | 0 | **0** |
| `techstep` | 0 | 0 | 0 | 0 | 0 | **0** |
| `halftime` | 0 | 0 | 0 | 0 | 0 | **0** |
| `breakcore` | 0 | 0 | 0 | 0 | 0 | **0** |
| `ragga-jungle` | 0 | 0 | 0 | 0 | 0 | **0** |
| `sambass` | 3 | 2 | 1 | 0 | 0 | **0** |
| `uk-garage` | 2 | 2 | 0 | 0 | 0 | **0** |
| `2-step-garage` | 1 | 1 | 0 | 0 | 0 | **0** |
| `speed-garage` | 0 | 0 | 0 | 0 | 0 | **0** |
| `grime` | 0 | 0 | 0 | 0 | 0 | **0** |
| `bassline` | 0 | 0 | 0 | 0 | 0 | **0** |
| `uk-funky` | 2 | 2 | 0 | 0 | 0 | **0** |
| `dub` | 3 | 3 | 0 | 0 | 0 | **0** |
| `speedbass` | 0 | 0 | 0 | 0 | 0 | **0** |
| `edm-trap` | 0 | 0 | 0 | 0 | 0 | **0** |
| `hard-trap` | 0 | 0 | 0 | 0 | 0 | **0** |
| `hybrid-trap` | 0 | 0 | 0 | 0 | 0 | **0** |
| `wave` | 0 | 0 | 0 | 0 | 0 | **0** |
| `chicago-drill` | 2 | 1 | 0 | 1 | 0 | **1** |
| `uk-drill` | 1 | 1 | 0 | 0 | 0 | **0** |
| `brooklyn-drill` | 2 | 1 | 1 | 0 | 0 | **0** |
| `jersey-drill` | 0 | 0 | 0 | 0 | 0 | **0** |
| `future-bass` | 0 | 0 | 0 | 0 | 0 | **0** |
| `kawaii-future-bass` | 1 | 0 | 1 | 0 | 0 | **0** |
| `synthwave` | 0 | 0 | 0 | 0 | 0 | **0** |
| `vaporwave` | 1 | 1 | 0 | 0 | 0 | **0** |
| `chillwave` | 0 | 0 | 0 | 0 | 0 | **0** |
| `downtempo` | 3 | 3 | 0 | 0 | 0 | **0** |
| `trip-hop` | 1 | 1 | 0 | 0 | 0 | **0** |
| `glitch-hop` | 0 | 0 | 0 | 0 | 0 | **0** |
| `idm` | 1 | 0 | 1 | 0 | 0 | **0** |
| `ambient` | 1 | 1 | 0 | 0 | 0 | **0** |
| `ambient-dub` | 0 | 0 | 0 | 0 | 0 | **0** |
| `lofi-house` | 1 | 1 | 0 | 0 | 0 | **0** |
| `chiptune` | 0 | 0 | 0 | 0 | 0 | **0** |
| `hardstyle` | 0 | 0 | 0 | 0 | 0 | **0** |
| `hardcore-gabber` | 0 | 0 | 0 | 0 | 0 | **0** |
| `frenchcore` | 1 | 1 | 0 | 0 | 0 | **0** |
| `happy-hardcore` | 1 | 1 | 0 | 0 | 0 | **0** |
| `moombahton` | 0 | 0 | 0 | 0 | 0 | **0** |
| `jersey-club` | 1 | 1 | 0 | 0 | 0 | **0** |
| `footwork` | 0 | 0 | 0 | 0 | 0 | **0** |
| `phonk` | 1 | 1 | 0 | 0 | 0 | **0** |
| `drift-phonk` | 0 | 0 | 0 | 0 | 0 | **0** |
| `electro` | 0 | 0 | 0 | 0 | 0 | **0** |
| `breakbeat` | 0 | 0 | 0 | 0 | 0 | **0** |
| `big-beat` | 1 | 1 | 0 | 0 | 0 | **0** |
| `rock-and-roll` | 3 | 3 | 0 | 0 | 0 | **0** |
| `blues-rock` | 3 | 2 | 1 | 0 | 0 | **0** |
| `hard-rock` | 3 | 2 | 1 | 0 | 0 | **0** |
| `punk-rock` | 3 | 3 | 0 | 0 | 0 | **0** |
| `post-punk` | 3 | 2 | 0 | 1 | 0 | **1** |
| `new-wave` | 0 | 0 | 0 | 0 | 0 | **0** |
| `heavy-metal` | 3 | 2 | 1 | 0 | 0 | **0** |
| `thrash-metal` | 3 | 3 | 0 | 0 | 0 | **0** |
| `death-metal` | 3 | 2 | 0 | 0 | 1 | **0** |
| `black-metal` | 3 | 1 | 1 | 0 | 1 | **0** |
| `doom-metal` | 3 | 2 | 1 | 0 | 0 | **0** |
| `metalcore` | 3 | 2 | 0 | 0 | 1 | **0** |
| `grunge` | 3 | 2 | 1 | 0 | 0 | **0** |
| `alternative-rock` | 3 | 2 | 1 | 0 | 0 | **0** |
| `progressive-rock` | 3 | 3 | 0 | 0 | 0 | **0** |
| `math-rock` | 3 | 2 | 1 | 0 | 0 | **0** |
| `shoe-gaze` | 3 | 1 | 2 | 0 | 0 | **0** |
| `old-school-hip-hop` | 1 | 1 | 0 | 0 | 0 | **0** |
| `boom-bap` | 3 | 3 | 0 | 0 | 0 | **0** |
| `g-funk` | 2 | 2 | 0 | 0 | 0 | **0** |
| `trap-rap` | 1 | 0 | 1 | 0 | 0 | **0** |
| `conscious-hip-hop` | 3 | 3 | 0 | 0 | 0 | **0** |
| `emo-rap` | 1 | 1 | 0 | 0 | 0 | **0** |
| `lofi-hip-hop` | 1 | 1 | 0 | 0 | 0 | **0** |
| `east-coast-hip-hop` | 3 | 3 | 0 | 0 | 0 | **0** |
| `west-coast-hip-hop` | 1 | 0 | 0 | 0 | 1 | **0** |
| `southern-hip-hop` | 1 | 1 | 0 | 0 | 0 | **0** |
| `cloud-rap` | 0 | 0 | 0 | 0 | 0 | **0** |
| `delta-blues` | 3 | 3 | 0 | 0 | 0 | **0** |
| `chicago-blues` | 3 | 3 | 0 | 0 | 0 | **0** |
| `texas-blues` | 3 | 3 | 0 | 0 | 0 | **0** |
| `electric-blues` | 3 | 3 | 0 | 0 | 0 | **0** |
| `traditional-jazz` | 3 | 3 | 0 | 0 | 0 | **0** |
| `bebop` | 3 | 2 | 0 | 1 | 0 | **1** |
| `hard-bop` | 3 | 2 | 1 | 0 | 0 | **0** |
| `cool-jazz` | 3 | 3 | 0 | 0 | 0 | **0** |
| `modal-jazz` | 3 | 2 | 1 | 0 | 0 | **0** |
| `free-jazz` | 3 | 2 | 0 | 1 | 0 | **1** |
| `jazz-fusion` | 2 | 2 | 0 | 0 | 0 | **0** |
| `smooth-jazz` | 3 | 2 | 0 | 1 | 0 | **1** |
| `acid-jazz` | 2 | 2 | 0 | 0 | 0 | **0** |
| `gypsy-jazz` | 3 | 2 | 1 | 0 | 0 | **0** |
| `traditional-pop` | 3 | 3 | 0 | 0 | 0 | **0** |
| `synth-pop` | 0 | 0 | 0 | 0 | 0 | **0** |
| `disco` | 2 | 2 | 0 | 0 | 0 | **0** |
| `eurodance` | 1 | 1 | 0 | 0 | 0 | **0** |
| `funk` | 2 | 1 | 1 | 0 | 0 | **0** |
| `soul` | 3 | 3 | 0 | 0 | 0 | **0** |
| `neo-soul` | 2 | 2 | 0 | 0 | 0 | **0** |
| `contemporary-rnb` | 1 | 1 | 0 | 0 | 0 | **0** |
| `alternative-rnb` | 0 | 0 | 0 | 0 | 0 | **0** |
| `motown` | 3 | 3 | 0 | 0 | 0 | **0** |
| `city-pop` | 2 | 2 | 0 | 0 | 0 | **0** |
| `k-pop` | 0 | 0 | 0 | 0 | 0 | **0** |
| `j-pop` | 3 | 2 | 1 | 0 | 0 | **0** |
| `salsa` | 3 | 3 | 0 | 0 | 0 | **0** |
| `bachata` | 3 | 2 | 1 | 0 | 0 | **0** |
| `reggae` | 3 | 3 | 0 | 0 | 0 | **0** |
| `dancehall` | 1 | 1 | 0 | 0 | 0 | **0** |
| `reggaeton` | 1 | 1 | 0 | 0 | 0 | **0** |
| `afrobeat` | 3 | 3 | 0 | 0 | 0 | **0** |
| `amapiano` | 2 | 2 | 0 | 0 | 0 | **0** |
| `bossa-nova` | 3 | 3 | 0 | 0 | 0 | **0** |
| `samba` | 3 | 2 | 1 | 0 | 0 | **0** |
| `cumbia` | 3 | 3 | 0 | 0 | 0 | **0** |
| `kuduro` | 0 | 0 | 0 | 0 | 0 | **0** |
| **全库合计（159 个曲风）** | **202** | **168** | **25** | **5** | **4** | **5** |

### 2.3 全库合计与三类计数

| 类别 | 声部数 |
| --- | --- |
| 能发 | **168** |
| 部分能发 | **25** |
| **一个都不发** | **5** |
| （调色板有行但曲风未写音，另计） | 4 |
| 合计（有调色板行的旋律声部） | 202 |

**全库合计（159 曲风 × 每曲风一行）**：有调色板行的旋律声部 **202**，能发 **168**，部分能发 **25**，一个都不发 **5**，无声部内容 **4**；⭐ **"本该有录音、却一个音都不发"的声部 = 5**（分布见 §2.2 与下表）。

**⭐ 创作者能感知的数（每个曲风里完全静音的声部数）**

| 曲风 | 完全静音的声部数 | 是哪条声部 |
| --- | --- | --- |
| `bebop` | **1** | lead |
| `chicago-drill` | **1** | lead |
| `free-jazz` | **1** | lead |
| `post-punk` | **1** | bass |
| `smooth-jazz` | **1** | lead |
| 其余 154 个曲风 | **0** | — |
| **合计** | **5** | — |

### 2.4 5 条"一个都不发"的明细（含引擎给出的逐字原因）

| 曲风 | 声部 | 乐器名 | 资产 | 写出范围 | 音符数 | 覆盖范围（引擎） | 引擎给出的原因（逐字） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `chicago-drill` | lead | `bell_lead` | `vcsl:Tubular-Bells-1` | 79, 82, 84 | 32 | 60–77 | note 79 has no playback: the file's regions cover keys 60–77 |
| `post-punk` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 50, 53, 55 | 12 | 26–46 | note 50 has no playback: the file's regions cover keys 26–46 |
| `bebop` | lead | `sax_lead` | `mtg-solo-sax:MTG-Tenor-Sax` | 82, 85–86, 89, 91 | 44 | 39–76 (41–43 缺) | note 82 has no playback: the file's regions cover keys 39–76 |
| `free-jazz` | lead | `sax_lead` | `mtg-solo-sax:MTG-Tenor-Sax` | 81–82, 84–85, 87–88, 90 | 32 | 39–76 (41–43 缺) | note 81 has no playback: the file's regions cover keys 39–76 |
| `smooth-jazz` | lead | `sax_lead` | `mtg-solo-sax:MTG-Tenor-Sax` | 77, 81–82 | 12 | 39–76 (41–43 缺) | note 77 has no playback: the file's regions cover keys 39–76 |

### 2.5 25 条"部分能发"的明细（列出**发不出的音**）

| 曲风 | 声部 | 乐器名 | 资产 | 写出范围 | 音符数 | 覆盖范围 | 发不出的音 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `nu-disco-house` | chords | `m1_organ` | `freepats-drawbar-organ` | 81, 84, 88, 91, 93, 96, 100, 103 | 32 | 33–98 | 100, 103 |
| `microhouse` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 34, 36, 39, 44 | 8 | 35–76 | 34 |
| `microhouse` | chords | `vibraphone` | `vcsl:Vibraphone-Keyswitch` | 48, 51, 55–56, 58, 60, 62–63, 65, 67–68, 70, 74, 79–80 | 40 | 57–89 | 48, 51, 55–56 |
| `sambass` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 74, 78, 81, 85–86, 90, 93, 97 | 48 | 33–96 | 97 |
| `brooklyn-drill` | lead | `bell_lead` | `vcsl:Tubular-Bells-1` | 77, 79–80 | 12 | 60–77 | 79–80 |
| `kawaii-future-bass` | lead | `bell_lead` | `vcsl:Tubular-Bells-1` | 72, 76, 79, 83–84 | 20 | 60–77 | 79, 83–84 |
| `idm` | lead | `bell_lead` | `vcsl:Tubular-Bells-1` | 74, 77, 79, 81 | 16 | 60–77 | 79, 81 |
| `blues-rock` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 40, 45, 47, 52 | 12 | 26–46 | 47, 52 |
| `hard-rock` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 45, 52 | 6 | 26–46 | 52 |
| `heavy-metal` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 40, 47, 52 | 20 | 26–46 | 47, 52 |
| `black-metal` | chords | `distorted_guitar` | `freepats-fsbs-dist2` | 64, 71, 76, 83, 88 | 96 | 35–86 | 88 |
| `doom-metal` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 36, 43, 48 | 4 | 26–46 | 48 |
| `grunge` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 40, 47 | 6 | 26–46 | 47 |
| `alternative-rock` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 43, 50 | 6 | 26–46 | 50 |
| `math-rock` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 41, 45, 48 | 20 | 26–46 | 48 |
| `shoe-gaze` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 45, 49, 52 | 16 | 26–46 | 49, 52 |
| `shoe-gaze` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 81, 85, 88, 92–93, 97, 100, 104 | 32 | 33–96 | 97, 100, 104 |
| `trap-rap` | lead | `bell_lead` | `vcsl:Tubular-Bells-1` | 77, 80 | 4 | 60–77 | 80 |
| `hard-bop` | lead | `sax_lead` | `mtg-solo-sax:MTG-Tenor-Sax` | 72, 75, 77 | 16 | 39–76 (41–43 缺) | 77 |
| `modal-jazz` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 33, 38, 40, 45, 47, 50, 52, 57, 62 | 16 | 12–120 (61–71, 90–95 缺) | 62 |
| `gypsy-jazz` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 79, 83, 86, 90–91, 95, 98, 102 | 64 | 33–96 | 98, 102 |
| `funk` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 76, 79, 83, 86, 88, 91, 95, 98 | 32 | 33–96 | 98 |
| `j-pop` | chords | `strings_lead` | `vsco2ce:ViolinEnsSusVib` | 77, 81, 84, 88–89, 93, 96, 100 | 32 | 55–86 | 88–89, 93, 96, 100 |
| `bachata` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 81, 84, 88, 91, 93, 96, 100, 103 | 64 | 33–96 | 100, 103 |
| `samba` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 79, 83, 86, 90–91, 95, 98, 102 | 24 | 33–96 | 98, 102 |

### 2.6 全量声部表（202 条）

（按判定排序：一个都不发 → 部分能发 → 无声部内容 → 能发；同判定内按曲风。）

| 曲风 | 声部 | 写出的乐器名 | 资产 | 写出范围（不同音高） | 音符数 | 覆盖范围 | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `bebop` | lead | `sax_lead` | `mtg-solo-sax:MTG-Tenor-Sax` | 82, 85–86, 89, 91 | 44 | 39–76 (41–43 缺) | **一个都不发** |
| `chicago-drill` | lead | `bell_lead` | `vcsl:Tubular-Bells-1` | 79, 82, 84 | 32 | 60–77 | **一个都不发** |
| `free-jazz` | lead | `sax_lead` | `mtg-solo-sax:MTG-Tenor-Sax` | 81–82, 84–85, 87–88, 90 | 32 | 39–76 (41–43 缺) | **一个都不发** |
| `post-punk` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 50, 53, 55 | 12 | 26–46 | **一个都不发** |
| `smooth-jazz` | lead | `sax_lead` | `mtg-solo-sax:MTG-Tenor-Sax` | 77, 81–82 | 12 | 39–76 (41–43 缺) | **一个都不发** |
| `alternative-rock` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 43, 50 | 6 | 26–46 | 部分能发 |
| `bachata` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 81, 84, 88, 91, 93, 96, 100, 103 | 64 | 33–96 | 部分能发 |
| `black-metal` | chords | `distorted_guitar` | `freepats-fsbs-dist2` | 64, 71, 76, 83, 88 | 96 | 35–86 | 部分能发 |
| `blues-rock` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 40, 45, 47, 52 | 12 | 26–46 | 部分能发 |
| `brooklyn-drill` | lead | `bell_lead` | `vcsl:Tubular-Bells-1` | 77, 79–80 | 12 | 60–77 | 部分能发 |
| `doom-metal` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 36, 43, 48 | 4 | 26–46 | 部分能发 |
| `funk` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 76, 79, 83, 86, 88, 91, 95, 98 | 32 | 33–96 | 部分能发 |
| `grunge` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 40, 47 | 6 | 26–46 | 部分能发 |
| `gypsy-jazz` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 79, 83, 86, 90–91, 95, 98, 102 | 64 | 33–96 | 部分能发 |
| `hard-bop` | lead | `sax_lead` | `mtg-solo-sax:MTG-Tenor-Sax` | 72, 75, 77 | 16 | 39–76 (41–43 缺) | 部分能发 |
| `hard-rock` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 45, 52 | 6 | 26–46 | 部分能发 |
| `heavy-metal` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 40, 47, 52 | 20 | 26–46 | 部分能发 |
| `idm` | lead | `bell_lead` | `vcsl:Tubular-Bells-1` | 74, 77, 79, 81 | 16 | 60–77 | 部分能发 |
| `j-pop` | chords | `strings_lead` | `vsco2ce:ViolinEnsSusVib` | 77, 81, 84, 88–89, 93, 96, 100 | 32 | 55–86 | 部分能发 |
| `kawaii-future-bass` | lead | `bell_lead` | `vcsl:Tubular-Bells-1` | 72, 76, 79, 83–84 | 20 | 60–77 | 部分能发 |
| `math-rock` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 41, 45, 48 | 20 | 26–46 | 部分能发 |
| `microhouse` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 34, 36, 39, 44 | 8 | 35–76 | 部分能发 |
| `microhouse` | chords | `vibraphone` | `vcsl:Vibraphone-Keyswitch` | 48, 51, 55–56, 58, 60, 62–63, 65, 67–68, 70, 74, 79–80 | 40 | 57–89 | 部分能发 |
| `modal-jazz` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 33, 38, 40, 45, 47, 50, 52, 57, 62 | 16 | 12–120 (61–71, 90–95 缺) | 部分能发 |
| `nu-disco-house` | chords | `m1_organ` | `freepats-drawbar-organ` | 81, 84, 88, 91, 93, 96, 100, 103 | 32 | 33–98 | 部分能发 |
| `samba` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 79, 83, 86, 90–91, 95, 98, 102 | 24 | 33–96 | 部分能发 |
| `sambass` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 74, 78, 81, 85–86, 90, 93, 97 | 48 | 33–96 | 部分能发 |
| `shoe-gaze` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 45, 49, 52 | 16 | 26–46 | 部分能发 |
| `shoe-gaze` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 81, 85, 88, 92–93, 97, 100, 104 | 32 | 33–96 | 部分能发 |
| `trap-rap` | lead | `bell_lead` | `vcsl:Tubular-Bells-1` | 77, 80 | 4 | 60–77 | 部分能发 |
| `black-metal` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | — | 0 | 33–96 | 无声部内容 |
| `death-metal` | chords | `distorted_guitar` | `freepats-fsbs-dist2` | — | 0 | 35–86 | 无声部内容 |
| `metalcore` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | — | 0 | 33–96 | 无声部内容 |
| `west-coast-hip-hop` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | — | 0 | 24–103 | 无声部内容 |
| `2-step-garage` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 65, 68, 72, 75, 77, 80, 84, 87 | 16 | 24–103 | 能发 |
| `acid-jazz` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 62, 65, 69, 72, 74, 77, 81, 84 | 32 | 33–96 | 能发 |
| `acid-jazz` | lead | `brass_section` | `sonatina-brass:All-Brass-Sustain` | 74, 77 | 8 | 28–88 | 能发 |
| `afro-house` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 67, 70, 74, 77, 79, 82, 86, 89 | 32 | 24–103 | 能发 |
| `afrobeat` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 45, 48, 50 | 16 | 35–76 | 能发 |
| `afrobeat` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 81, 84, 88, 91, 93, 96, 100, 103 | 32 | 24–103 | 能发 |
| `afrobeat` | lead | `brass_section` | `sonatina-brass:All-Brass-Sustain` | 81, 84 | 8 | 28–88 | 能发 |
| `alternative-rock` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 55, 59, 62, 67, 71, 74 | 14 | 33–96 | 能发 |
| `alternative-rock` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 79, 83–84 | 8 | 33–96 | 能发 |
| `amapiano` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 52, 55, 62, 64, 66–67, 74, 78 | 36 | 24–103 | 能发 |
| `amapiano` | lead | `piano_lead` | `salamander-grand` | 76, 79 | 8 | 21–108 | 能发 |
| `ambient` | lead | `strings_lead` | `vsco2ce:ViolinEnsSusVib` | 72 | 8 | 55–86 | 能发 |
| `ambient-techno` | lead | `strings_lead` | `vsco2ce:ViolinEnsSusVib` | 74, 77 | 16 | 55–86 | 能发 |
| `bachata` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 45, 48, 50 | 8 | 35–76 | 能发 |
| `bachata` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 81, 84, 86 | 8 | 33–96 | 能发 |
| `bebop` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 46, 50, 53, 55 | 16 | 12–120 (61–71, 90–95 缺) | 能发 |
| `bebop` | chords | `piano_lead` | `salamander-grand` | 72, 76, 83–84, 86, 88, 95, 98 | 32 | 21–108 | 能发 |
| `big-beat` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 76, 79 | 4 | 33–96 | 能发 |
| `black-metal` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 40, 43–44 | 32 | 26–46 | 能发 |
| `blues-rock` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 52, 55, 57, 59–60, 62, 64, 67, 74, 79 | 40 | 33–96 | 能发 |
| `blues-rock` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 76, 79, 81 | 16 | 33–96 | 能发 |
| `boom-bap` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 36, 41, 43, 48, 53 | 6 | 12–120 (61–71, 90–95 缺) | 能发 |
| `boom-bap` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 72, 75, 77, 79–80, 82, 84, 87 | 8 | 24–103 | 能发 |
| `boom-bap` | lead | `brass_section` | `sonatina-brass:All-Brass-Sustain` | 72, 74–75 | 6 | 28–88 | 能发 |
| `bossa-nova` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 38, 50 | 8 | 12–120 (61–71, 90–95 缺) | 能发 |
| `bossa-nova` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 62, 65, 69, 72, 74, 77, 81, 84 | 80 | 33–96 | 能发 |
| `bossa-nova` | lead | `flute_lead` | `vsco2ce:FluteSusVib` | 74, 77, 79 | 16 | 60–96 | 能发 |
| `brooklyn-drill` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 53, 56, 60–61, 63, 65, 67–68, 70, 72, 75, 80, 82 | 16 | 24–103 | 能发 |
| `chicago-blues` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 45, 49, 52, 54 | 16 | 12–120 (61–71, 90–95 缺) | 能发 |
| `chicago-blues` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 69, 73–74, 76, 78, 80–81, 85 | 32 | 33–96 | 能发 |
| `chicago-blues` | lead | `harmonica_lead` | `vcsl:Harmonica-Hohner-Special20-C-Keyswitch` | 81, 84, 86 | 16 | 60–97 | 能发 |
| `chicago-drill` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 43, 46–48, 50–52, 54–56, 59, 62, 66–67, 71 | 16 | 24–103 | 能发 |
| `chicago-house` | chords | `m1_organ` | `freepats-drawbar-organ` | 60, 63, 67, 70, 72, 75, 79, 82 | 104 | 33–98 | 能发 |
| `chillstep` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 74, 77, 79, 81–82, 84, 86, 88–89, 91, 93 | 16 | 24–103 | 能发 |
| `city-pop` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 74, 78, 81, 85–86, 90, 93, 97 | 32 | 24–103 | 能发 |
| `city-pop` | lead | `brass_section` | `sonatina-brass:All-Brass-Sustain` | 74, 78 | 8 | 28–88 | 能发 |
| `conscious-hip-hop` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 40, 47 | 12 | 12–120 (61–71, 90–95 缺) | 能发 |
| `conscious-hip-hop` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 76, 79, 86, 88, 90–91, 98, 102 | 32 | 24–103 | 能发 |
| `conscious-hip-hop` | lead | `brass_section` | `sonatina-brass:All-Brass-Sustain` | 76, 79, 81 | 12 | 28–88 | 能发 |
| `contemporary-rnb` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 72, 75–77, 80–82, 85–87, 90–92, 95 | 32 | 24–103 | 能发 |
| `cool-jazz` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 38, 41, 45, 47 | 16 | 12–120 (61–71, 90–95 缺) | 能发 |
| `cool-jazz` | chords | `vibraphone` | `vcsl:Vibraphone-Keyswitch` | 62, 64–65, 67, 69, 72, 74, 76–77, 79, 82 | 16 | 57–89 | 能发 |
| `cool-jazz` | lead | `muted_trumpet` | `vsco2ce:TrumpetHarmonMuteSus` | 74, 77 | 8 | 58–84 | 能发 |
| `cumbia` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 45, 48, 52 | 8 | 35–76 | 能发 |
| `cumbia` | chords | `accordion_lead` | `freepats-button-accordion-hn` | 81, 84, 88, 93, 96, 100 | 12 | 0–127 | 能发 |
| `cumbia` | lead | `accordion_lead` | `freepats-button-accordion-hn` | 81, 84, 86 | 8 | 0–127 | 能发 |
| `dancehall` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 65, 68, 72, 77, 80, 84 | 12 | 24–103 | 能发 |
| `death-metal` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 36, 39, 41–42 | 32 | 26–46 | 能发 |
| `death-metal` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 72, 75, 78 | 8 | 33–96 | 能发 |
| `deathstep` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 40, 43, 46 | 8 | 26–46 | 能发 |
| `deathstep` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 76, 79 | 2 | 33–96 | 能发 |
| `deep-house` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 69, 72, 79, 81, 83–84, 91, 95 | 48 | 24–103 | 能发 |
| `delta-blues` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 40, 52 | 8 | 12–120 (61–71, 90–95 缺) | 能发 |
| `delta-blues` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 64, 68, 71, 75–76, 80, 83, 87 | 64 | 33–96 | 能发 |
| `delta-blues` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 76, 79, 81 | 16 | 33–96 | 能发 |
| `disco` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 74, 77, 81, 84, 86, 89, 93, 96 | 32 | 24–103 | 能发 |
| `disco` | lead | `strings_lead` | `vsco2ce:ViolinEnsSusVib` | 74, 77 | 8 | 55–86 | 能发 |
| `doom-metal` | chords | `distorted_guitar` | `freepats-fsbs-dist2` | 36, 43, 48, 60 | 4 | 35–86 | 能发 |
| `doom-metal` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 72 | 2 | 33–96 | 能发 |
| `downtempo` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 33, 40, 47, 52, 57 | 6 | 12–120 (61–71, 90–95 缺) | 能发 |
| `downtempo` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 64, 67, 69–70, 72, 74, 76, 79 | 8 | 24–103 | 能发 |
| `downtempo` | lead | `strings_lead` | `vsco2ce:ViolinEnsSusVib` | 74, 77, 79 | 6 | 55–86 | 能发 |
| `dream-trance` | lead | `piano_lead` | `salamander-grand` | 77, 80, 82, 84 | 64 | 21–108 | 能发 |
| `dub` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 43, 50 | 6 | 35–76 | 能发 |
| `dub` | chords | `m1_organ` | `freepats-drawbar-organ` | 67, 70, 74, 77, 79, 82, 86, 89 | 16 | 33–98 | 能发 |
| `dub` | lead | `harmonica_lead` | `vcsl:Harmonica-Hohner-Special20-C-Keyswitch` | 79 | 2 | 60–97 | 能发 |
| `east-coast-hip-hop` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 38, 45, 50 | 12 | 35–76 | 能发 |
| `east-coast-hip-hop` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 74, 77, 81, 84, 86, 89, 93, 96 | 32 | 24–103 | 能发 |
| `east-coast-hip-hop` | lead | `piano_lead` | `salamander-grand` | 74, 77 | 8 | 21–108 | 能发 |
| `electric-blues` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 47, 52, 54, 59 | 12 | 35–76 | 能发 |
| `electric-blues` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 71, 75–76, 78, 80, 82–83, 87 | 32 | 33–96 | 能发 |
| `electric-blues` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 83, 86 | 8 | 33–96 | 能发 |
| `emo-rap` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 72, 75, 77 | 16 | 33–96 | 能发 |
| `eurodance` | chords | `piano_lead` | `salamander-grand` | 72, 75, 79, 82, 84, 87, 91, 94 | 32 | 21–108 | 能发 |
| `free-jazz` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 45, 48, 51, 54 | 16 | 12–120 (61–71, 90–95 缺) | 能发 |
| `free-jazz` | chords | `piano_lead` | `salamander-grand` | 72, 77, 82 | 36 | 21–108 | 能发 |
| `french-house` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 69, 72, 76, 79, 81, 84, 88, 91 | 64 | 24–103 | 能发 |
| `frenchcore` | lead | `accordion_lead` | `freepats-button-accordion-hn` | 74, 77, 79 | 16 | 0–127 | 能发 |
| `funk` | lead | `brass_section` | `sonatina-brass:All-Brass-Sustain` | 76, 79 | 8 | 28–88 | 能发 |
| `future-garage` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 71, 74, 78, 81 | 16 | 24–103 | 能发 |
| `g-funk` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 45, 48, 50 | 16 | 35–76 | 能发 |
| `g-funk` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 81, 84, 86, 89, 91, 95–96, 100 | 16 | 24–103 | 能发 |
| `goa-trance` | lead | `sitar_lead` | `discord-gm-sitar:105-Sitar` | 74–75, 77–78 | 48 | 12–96 | 能发 |
| `grunge` | chords | `distorted_guitar` | `freepats-fsbs-dist2` | 52, 55, 59, 64, 67, 71, 83 | 16 | 35–86 | 能发 |
| `grunge` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 76, 79, 81 | 6 | 33–96 | 能发 |
| `gypsy-jazz` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 43, 47, 50, 52 | 16 | 12–120 (61–71, 90–95 缺) | 能发 |
| `gypsy-jazz` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 79, 83–84, 86, 88 | 32 | 33–96 | 能发 |
| `happy-hardcore` | chords | `piano_lead` | `salamander-grand` | 84, 88, 91, 96, 100, 103 | 24 | 21–108 | 能发 |
| `hard-bop` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 36, 40, 43, 45 | 16 | 12–120 (61–71, 90–95 缺) | 能发 |
| `hard-bop` | chords | `piano_lead` | `salamander-grand` | 60, 63, 70, 72, 74–75, 82, 86 | 32 | 21–108 | 能发 |
| `hard-rock` | chords | `distorted_guitar` | `freepats-fsbs-dist2` | 57, 64, 69, 81 | 16 | 35–86 | 能发 |
| `hard-rock` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 81, 84, 86 | 8 | 33–96 | 能发 |
| `heavy-metal` | chords | `distorted_guitar` | `freepats-fsbs-dist2` | 52, 59, 64, 71, 76 | 14 | 35–86 | 能发 |
| `heavy-metal` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 76, 79, 81 | 8 | 33–96 | 能发 |
| `j-pop` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 41, 45, 48 | 24 | 35–76 | 能发 |
| `j-pop` | lead | `piano_lead` | `salamander-grand` | 77, 81–82 | 16 | 21–108 | 能发 |
| `jazz-fusion` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 40, 43, 45 | 24 | 35–76 | 能发 |
| `jazz-fusion` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 76, 79, 86, 88, 90–91, 98, 102 | 32 | 24–103 | 能发 |
| `jersey-club` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 72, 75, 79–80, 82, 84, 86–87, 89, 91–92 | 32 | 24–103 | 能发 |
| `liquid-dnb` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 65, 68, 72, 75, 77, 80, 84, 87 | 48 | 24–103 | 能发 |
| `lofi-hip-hop` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 77, 79–80, 82, 84, 86–87, 89–92, 94, 97, 100 | 16 | 24–103 | 能发 |
| `lofi-house` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 57, 60, 64, 67, 69, 72, 76, 79 | 52 | 24–103 | 能发 |
| `math-rock` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 65, 70, 72–73, 75, 78, 80, 82 | 15 | 33–96 | 能发 |
| `math-rock` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 77, 81–82, 84, 86 | 32 | 33–96 | 能发 |
| `metalcore` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 38 | 12 | 26–46 | 能发 |
| `metalcore` | chords | `distorted_guitar` | `freepats-fsbs-dist2` | 50, 57, 62, 69, 74 | 44 | 35–86 | 能发 |
| `microhouse` | lead | `bell_lead` | `vcsl:Tubular-Bells-1` | 72, 75 | 8 | 60–77 | 能发 |
| `modal-jazz` | chords | `piano_lead` | `salamander-grand` | 62, 64, 67, 69, 72, 74, 79 | 12 | 21–108 | 能发 |
| `modal-jazz` | lead | `trumpet_lead` | `vsco2ce:TrumpetSus` | 74, 77, 81, 83 | 16 | 52–84 | 能发 |
| `motown` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 43, 47, 50 | 24 | 35–76 | 能发 |
| `motown` | chords | `vibraphone` | `vcsl:Vibraphone-Keyswitch` | 67, 71–72, 74, 76, 78–79, 81, 83–84, 86 | 32 | 57–89 | 能发 |
| `motown` | lead | `piano_lead` | `salamander-grand` | 79, 83 | 8 | 21–108 | 能发 |
| `neo-soul` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 41, 48 | 12 | 35–76 | 能发 |
| `neo-soul` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 53, 56, 63, 65, 67–68, 75, 79 | 36 | 24–103 | 能发 |
| `nu-disco-house` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 45, 48, 50 | 24 | 35–76 | 能发 |
| `old-school-hip-hop` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 43, 46 | 6 | 35–76 | 能发 |
| `phonk` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 53, 56, 60–61, 63, 65, 67–68, 70, 72, 75, 80, 82 | 32 | 24–103 | 能发 |
| `post-dubstep` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 65, 68, 72, 75, 79 | 8 | 24–103 | 能发 |
| `post-punk` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 74, 77, 81, 84, 88, 91 | 6 | 33–96 | 能发 |
| `post-punk` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 74, 77, 79 | 8 | 33–96 | 能发 |
| `progressive-rock` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 38, 41, 43 | 16 | 26–46 | 能发 |
| `progressive-rock` | chords | `m1_organ` | `freepats-drawbar-organ` | 62, 65, 72, 74, 76–77, 84, 88 | 32 | 33–98 | 能发 |
| `progressive-rock` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 74, 77, 79, 81 | 16 | 33–96 | 能发 |
| `punk-rock` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 40, 43, 45 | 16 | 26–46 | 能发 |
| `punk-rock` | chords | `distorted_guitar` | `freepats-fsbs-dist2` | 52, 59, 64, 71, 76 | 56 | 35–86 | 能发 |
| `punk-rock` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 76, 79 | 4 | 33–96 | 能发 |
| `reggae` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 43, 50 | 6 | 35–76 | 能发 |
| `reggae` | chords | `m1_organ` | `freepats-drawbar-organ` | 67, 70, 74, 79, 82, 86 | 12 | 33–98 | 能发 |
| `reggae` | lead | `brass_section` | `sonatina-brass:All-Brass-Sustain` | 79 | 2 | 28–88 | 能发 |
| `reggaeton` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 60, 63, 65, 67–68, 70, 72, 74–75, 79 | 26 | 24–103 | 能发 |
| `rock-and-roll` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 45, 49, 52, 54 | 16 | 12–120 (61–71, 90–95 缺) | 能发 |
| `rock-and-roll` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 57, 61–62, 64, 66, 68–69, 71, 73–74, 76, 80 | 17 | 33–96 | 能发 |
| `rock-and-roll` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 81, 84, 86 | 16 | 33–96 | 能发 |
| `salsa` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 36, 48 | 4 | 12–120 (61–71, 90–95 缺) | 能发 |
| `salsa` | chords | `piano_lead` | `salamander-grand` | 72, 75, 79, 82, 84, 87, 91, 94 | 40 | 21–108 | 能发 |
| `salsa` | lead | `trumpet_lead` | `vsco2ce:TrumpetSus` | 72, 75, 77 | 8 | 52–84 | 能发 |
| `samba` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 43, 47, 50 | 8 | 12–120 (61–71, 90–95 缺) | 能发 |
| `samba` | lead | `flute_lead` | `vsco2ce:FluteSusVib` | 79, 83–84 | 8 | 60–96 | 能发 |
| `sambass` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 38, 43, 45 | 16 | 12–120 (61–71, 90–95 缺) | 能发 |
| `sambass` | lead | `pluck_string` | `freepats-spanish-classical-guitar` | 74, 78, 81, 83 | 16 | 29–88 | 能发 |
| `shoe-gaze` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 81, 85 | 8 | 33–96 | 能发 |
| `smooth-jazz` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 41, 45, 48 | 12 | 35–76 | 能发 |
| `smooth-jazz` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 77, 79, 81–82, 84, 88–89, 91, 93–94, 98 | 16 | 24–103 | 能发 |
| `soul` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 40, 43, 47–48, 55, 59 | 12 | 35–76 | 能发 |
| `soul` | chords | `m1_organ` | `freepats-drawbar-organ` | 67, 71–72, 74, 76, 78–79, 81, 83, 86 | 32 | 33–98 | 能发 |
| `soul` | lead | `organ_lead` | `freepats-percussive-organ` | 79, 83–84 | 16 | 31–108 | 能发 |
| `southern-hip-hop` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 77, 80, 82, 84–85, 89 | 12 | 24–103 | 能发 |
| `texas-blues` | bass | `finger_bass` | `karoryfer-black-and-blue-basses:05-darkblack-pluck` | 40, 44, 47, 49 | 16 | 35–76 | 能发 |
| `texas-blues` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 64, 68–69, 71, 73, 75–76, 80 | 32 | 33–96 | 能发 |
| `texas-blues` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 76, 79, 81 | 16 | 33–96 | 能发 |
| `thrash-metal` | bass | `pick_bass` | `freepats-electric-bass-yr:PickedBassYR-20190930` | 40, 43, 45–46 | 32 | 26–46 | 能发 |
| `thrash-metal` | chords | `distorted_guitar` | `freepats-fsbs-dist2` | 52, 59, 64, 71, 76 | 14 | 35–86 | 能发 |
| `thrash-metal` | lead | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 76, 79, 82 | 8 | 33–96 | 能发 |
| `traditional-jazz` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 41, 45, 48, 50 | 16 | 12–120 (61–71, 90–95 缺) | 能发 |
| `traditional-jazz` | chords | `guitar_lead` | `karoryfer-emilyguitar:emily-clean` | 65, 69, 72, 76–77, 81, 84, 88 | 32 | 33–96 | 能发 |
| `traditional-jazz` | lead | `trumpet_lead` | `vsco2ce:TrumpetSus` | 77, 81–82 | 16 | 52–84 | 能发 |
| `traditional-pop` | bass | `walking_upright` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` | 36, 40, 43, 45 | 16 | 12–120 (61–71, 90–95 缺) | 能发 |
| `traditional-pop` | chords | `strings_lead` | `vsco2ce:ViolinEnsSusVib` | 60, 64–65, 67, 69, 71–72, 74, 76–77, 79, 83 | 34 | 55–86 | 能发 |
| `traditional-pop` | lead | `brass_section` | `sonatina-brass:All-Brass-Sustain` | 72, 76, 79 | 16 | 28–88 | 能发 |
| `trip-hop` | lead | `strings_lead` | `vsco2ce:ViolinEnsSusVib` | 72, 75 | 4 | 55–86 | 能发 |
| `tropical-house` | chords | `marimba_lead` | `vcsl:Marimba` | 72, 76, 79, 83–84, 88, 91, 95 | 48 | 41–97 | 能发 |
| `uk-drill` | lead | `piano_lead` | `salamander-grand` | 72, 74–75 | 12 | 21–108 | 能发 |
| `uk-funky` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 69, 72, 76, 79, 81, 84, 88, 91 | 32 | 24–103 | 能发 |
| `uk-funky` | lead | `piano_lead` | `salamander-grand` | 81, 84 | 8 | 21–108 | 能发 |
| `uk-garage` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 60, 63, 67, 70, 72, 75, 79, 82 | 18 | 24–103 | 能发 |
| `uk-garage` | lead | `m1_organ` | `freepats-drawbar-organ` | 72, 74–75 | 6 | 33–98 | 能发 |
| `vaporwave` | chords | `rhodes_ep` | `jlearman-jrhodes3c:jRhodes-both-looped` | 41, 43, 45–46, 48, 50, 52–53, 55, 57–58, 60, 64–65, 70, 72 | 20 | 24–103 | 能发 |
| `vocal-trance` | lead | `piano_lead` | `salamander-grand` | 81, 84, 86 | 32 | 21–108 | 能发 |

---

## §3 每条静音声部的 A/B/C 归类与依据

**候选定义**（业主给的三种）：**A** = 换成库里已有、音域盖得住的录音；**B** = 曲风内容（音高）本身越界，是内容决策；**C** = 该资产在 pin 处取不到。

**先给结论**：**5 条静音声部没有一条是 C**——22 个被用到的资产全部取到、sha256 全部与 manifest 一致（`karoryfer-emilyguitar:emily-clean` 的**源地址确实 404**，但引擎按设计退到镜像取到了，见 §3.4）。它们是 **A 能部分或完全解决**，**另有 B 的一半**。

候选资产的覆盖**同样是引擎实测**（同一套 `resolveInstrumentNote` 扫描，`shaMatches=true`），见下表：

| 候选资产 | 名称 | 分类 | 引擎实测可发按键 | 可发键数 |
| --- | --- | --- | --- | --- |
| `mtg-solo-sax:MTG-Soprano-Sax` | Soprano saxophone | Winds | 51–88 (53–55 缺) | 35 |
| `mtg-solo-sax:MTG-Alto-Sax` | Alto saxophone | Winds | 44–81 (46–48 缺) | 35 |
| `mtg-solo-sax:MTG-Baritone-Sax` | Baritone saxophone | Winds | 32–69 (34–35 缺) | 36 |
| `mtg-solo-sax:MTG-Soprano-Sax-NL` | Soprano saxophone (no legato) | Winds | 51–88 (53–55 缺) | 35 |
| `mtg-solo-sax:MTG-Alto-Sax-NL` | Alto saxophone (no legato) | Winds | 44–81 (46–48 缺) | 35 |
| `mtg-solo-sax:MTG-Tenor-Sax-NL` | Tenor saxophone (no legato) | Winds | 39–76 (41–43 缺) | 35 |
| `mtg-solo-sax:MTG-Baritone-Sax-NL` | Baritone saxophone (no legato) | Winds | 32–69 (34–35 缺) | 36 |
| `karoryfer-bear-sax:1-solo-mono` | Baritone sax, solo (monophonic) | Winds | 36–68 | 33 |
| `vcsl:Tenor-Saxophone-Keyswitch` | Tenor Saxophone | Winds | 44–89 | 46 |
| `vcsl:Saxello-Keyswitch` | Saxello | Winds | 58–89 | 32 |
| `vcsl:Tubular-Bells-2` | Tubular Bells 2 | Mallets & Bells | 60–79 | 20 |
| `vcsl:Tubular-Bells-3-Legacy` | Tubular Bells 3 | Mallets & Bells | 60–78 | 19 |
| `vcsl:Glockenspiel` | Glockenspiel | Mallets & Bells | 67–97 | 31 |
| `vcsl:Tubular-Glockenspiel` | Tubular Glockenspiel | Mallets & Bells | 79–94 | 16 |
| `vcsl:Vibraphone-Keyswitch` | Vibraphone | Mallets & Bells | 57–89 | 33 |
| `vcsl:Xylophone-Keyswitch` | Xylophone | Mallets & Bells | 55–97 | 43 |
| `vcsl:Hand-Chimes` | Hand Chimes | Mallets & Bells | 60–97 | 38 |
| `vcsl:Bell-Tree-Keyswitch` | Bell Tree | Mallets & Bells | 60–64 | 5 |
| `vcsl:Sleigh-Bells` | Sleigh Bells | Mallets & Bells | 60–64 | 5 |
| `vcsl:Marimba` | Marimba | Mallets & Bells | 41–97 | 57 |
| `vcsl:Kalimba-Kenya` | Kalimba, Kenya | Mallets & Bells | 59–84 | 26 |
| `vcsl:Crotales` | — | — | 取不到（not in catalogue） | 0 |
| `freepats-electric-bass-yr:FingerBassYR-20190930` | Finger Bass YR | Bass | 26–45 | 20 |
| `karoryfer-black-and-blue-basses:06-darkblack-pluck-warm` | darkblack pluck warm | Bass | 35–76 | 42 |
| `karoryfer-black-and-blue-basses:09-darkblack-stac` | darkblack stac | Bass | 35–76 | 42 |
| `karoryfer-black-and-blue-basses:10-darkblack-btb` | darkblack btb | Bass | 35–76 | 42 |
| `karoryfer-meatbass:pizz-basic` | pizz basic | Bass | 12–79 (66–71 缺) | 62 |
| `karoryfer-meatbass:04-pizz` | pizz | Bass | 12–79 (66–71 缺) | 62 |
| `karoryfer-meatbass:pizz-six` | pizz six | Bass | 12–65 | 54 |
| `freepats-electric-bass-yr:PickedBassYR-20190930` | Picked Bass YR | Bass | 26–46 | 21 |

### 3.1 `bebop` / `free-jazz` / `smooth-jazz` 的 lead：`sax_lead` → `mtg-solo-sax:MTG-Tenor-Sax`（39–76，缺 41–43）

三条声部是同一条映射，写出范围不同：

| 声部 | 写出（不同音高） | 音符数 | 现状 | 判定 |
| --- | --- | --- | --- | --- |
| `bebop` lead | 82, 85, 86, 89, 91 | 44 | 39–76 | **一个都不发** |
| `free-jazz` lead | 81, 82, 84, 85, 87, 88, 90 | 32 | 39–76 | **一个都不发** |
| `smooth-jazz` lead | 77, 81, 82 | 12 | 39–76 | **一个都不发** |

* **候选 A（可换的、盖得住的库内萨克斯）**：**`vcsl:Tenor-Saxophone-Keyswitch` 实测 44–89**（无缺键）。它把三条声部全部救活：
  * `smooth-jazz`（77–82）→ **完全能发**（纯 A）；
  * `bebop`（82–91）→ 只剩 **91** 发不出（82/85/86/89 都能发）；
  * `free-jazz`（81–90）→ 只剩 **90** 发不出。
  其它实测候选：`vcsl:Saxello-Keyswitch` 58–89（同上，且不是 tenor）；`karoryfer-bear-sax:1-solo-mono` 36–68（上界更低，救不了）；`mtg-solo-sax:MTG-Soprano-Sax` 51–88（缺 53–55；救得了 82–88，救不了 89–91）；`MTG-Alto-Sax` 44–81（缺 46–48；救不了 82 以上）。**没有任何一个镜像里的萨克斯程序能发到 89 以上（最高的上界就是 89）。**
  * ⚠️ **A 的代价要写明**：`vcsl:Tenor-Saxophone-Keyswitch` 正是这行映射**换掉的上一个答案**（见 `docs/OPEN_WORK.md` 关于 `sax_lead` 的替换记录）——换回去的理由（"tenor 才是这条线通常写给"）仍成立，但当时把它换掉的原因也仍成立：它是 **`-KS` 键位切换包装**，其 Vibrato / Non-Vibrato / Staccato 由 `sw_*` 决定，而本仓的解析路径对这类文件的音色选择是**按 region 几何**而不是按键位开关（`docs/OPEN_WORK.md` 的同节与 `src/data/stringTechniques.ts` 都记录了这件事）。⇒ **A 是"能出声"的解，不是"音色也对"的解**，两条要分开决定。
* **候选 B（内容越界）**：**bebop 的 91 与 free-jazz 的 90 高于所有镜像萨克斯的上界（89）**。要让这两条**完全**能发，只能把这两条线**写低**（bebop 至少 91→≤89，free-jazz 至少 90→≤89），或接受它们落在 A 之后的"部分静音"。⇒ **这两条声部是 A＋B 的合成**：A 解决 82–89，B 解决 ≥90。
* **候选 C**：不适用（资产取到，sha 一致）。

**建议的归类**：`smooth-jazz` = **A**（换 `vcsl:Tenor-Saxophone-Keyswitch` 即可全部发声）；`bebop`/`free-jazz` = **A ＋ B**（A 救 82–89/81–89，B 是 91/90 这两个音的内容决策）。

### 3.2 `chicago-drill` 的 lead：`bell_lead` → `vcsl:Tubular-Bells-1`（60–77）

写出 79, 82, 84（32 条 note），**全部高于 77**。

* **候选 A（盖得住的"钟/铃"类录音，全部实测）**：`vcsl:Vibraphone-Keyswitch` 57–89、`vcsl:Glockenspiel` 67–97、`vcsl:Tubular-Glockenspiel` 79–94、`vcsl:Xylophone-Keyswitch` 55–97、`vcsl:Marimba` 41–97、`vcsl:Kalimba-Kenya` 59–84（恰好盖住 79–84）。**都能让这条声部完全发声，但都换了乐器**（颤音琴/钟琴/木琴/马林巴/卡林巴，不是管钟）。
* **候选 B（内容越界，且是"同一乐器"的硬边界）**：同族的 `vcsl:Tubular-Bells-2` 实测 **60–79**、`vcsl:Tubular-Bells-3-Legacy` **60–78**——**管钟这一族没有任何程序能发 82/84**。所以"就要管钟，且写 79–84"这件事在镜像内**无解**；要么把 82/84 写低（内容决策），要么承认要换乐器族（A）。
* **候选 C**：不适用。

**建议的归类**：`chicago-drill` lead = **A（换乐器族，候选与覆盖见上）或 B（把这条铃线写低 2 个半音以内）**——**这不是"库缺件"**，是"这一族乐器的音域就到 77/79"。

### 3.3 `post-punk` 的 bass：`pick_bass` → `freepats-electric-bass-yr:PickedBassYR-20190930`（26–46）

写出 50, 53, 55（12 条 note），**全部高于 46**。

* **候选 A（盖得住、且仍是电贝斯）**：`karoryfer-black-and-blue-basses:05-darkblack-pluck`（**35–76**，无缺键）、`:06-darkblack-pluck-warm`、`:09-darkblack-stac`、`:10-darkblack-btb`（均 35–76）；`karoryfer-meatbass:pizz-basic` / `:04-pizz`（12–79，缺 66–71，但盖得住 50–55）；`karoryfer-meatbass:pizz-six`（12–65）；`dsmolken-double-bass:d-smolken-rubner-bass-pizz`（12–120，缺 61–71 与 90–95，盖得住 50–55）。**⇒ 纯 A 可解**。
  * ⚠️ 代价：`05-darkblack-pluck` 已经是 `finger_bass` 的映射，`pick_bass` 用它会让"拨片/手指"的区别消失；要保留"picked"性格，现成的替代里**没有**一个更宽的 picked 电贝斯（同库的 `FingerBassYR` 实测只有 26–45，更窄）。⇒ A 是"能出声、音色略偏"的解。
* **候选 B**：也可以把这条线写低到 ≤46（内容决策），但 50–55 对电贝斯是**正常音区**，把内容让位于库的窄音域并不划算。
* **候选 C**：不适用。

**建议的归类**：`post-punk` bass = **纯 A**（换 `karoryfer-black-and-blue-basses:05-darkblack-pluck` 或其它实测 35–76 的黑蓝贝斯程序）。

### 3.4 关于 C：本普查里 C 不成立，但发现三处 C 形状的事实（记录在此，供业主判断）

* `karoryfer-emilyguitar:emily-clean`：**pinned 源地址 404**（`https://raw.githubusercontent.com/sfzinstruments/karoryfer.emilyguitar/<pin>/Emilyguitar/emily_clean.sfz`），引擎按"源优先、镜像兜底"退到镜像取到（sha 与 manifest 一致）⇒ **今天能出声**，但"源优先"这条设计对这个库实际只走了兜底；这正是业主提到的"入口 404"那条线报的同一件事。
* `freepats-drawbar-organ`、`freepats-percussive-organ`：manifest 条目**没有 repo/pin**，`asset.sfz.url` 是**镜像相对路径**（`/freepats-…/….sfz`）。⇒ **没有配置镜像（`VITE_SAMPLE_ROOT`）时，它们就是 C**；本报告在配了镜像的机器上测到 33–98 / 31–108。判据把这三个资产显式列为"镜像才是唯一地址"，无镜像时**跳过而不是假装绿**（见 `src/test/sampledRangeCensus.test.ts` 的 `MIRROR_ONLY`）。
* **5 条静音声部本身都不是 C**。

---

## §4 §106：成熟产品怎么保证"映射过去的库，音域对得上"

**问题拆成两问**：① 采样器/DAW 的**音色浏览**会不会**按音域过滤**？② 它们怎么**表达/显示覆盖范围**，以及一个**超出所有区域的音**会怎样？

**逐字出处表**（每条给 URL ＋ 原句；查不到的写"未找到"）：

| 产品／规范 | URL（本次抓取） | 逐字原句 | 按音域过滤？ | 显示/表达覆盖？ |
| --- | --- | --- | --- | --- |
| **SFZ 规范** `lokey`/`hikey` | <https://sfzformat.com/opcodes/hikey/> | "Determine the high boundary of a certain **region**." ／ "These opcodes, as well as **key**, can use either MIDI note numbers (0 to 127) or MIDI note names (e.g. c3 or D#4)." ／ 属性表："hikey … Default **127** … Range 0 to 127" | 不适用（格式层） | **是**：region 用 `lokey`/`hikey` 表达覆盖；`hikey` 默认 **127**（不写就等于"整个键盘"） |
| **SFZ 规范** `key` | <https://sfzformat.com/opcodes/key/> | "Equivalent to using lokey, hikey and pitch_keycenter and setting them all to the same note value." ／ "Both are also equivalent to: `lokey=72 hikey=72 pitch_keycenter=72`" | 不适用 | **是**：单音覆盖＝`lokey=hikey=pitch_keycenter` |
| **SFZ 规范** `pitch_keycenter` | <https://sfzformat.com/opcodes/pitch_keycenter/> | "Root key for the sample." ／ 属性表："pitch_keycenter … Default **60** … Range 0 to 127" | 不适用 | **是**：根音（决定移调量） |
| **SFZ 规范** `trigger` | <https://sfzformat.com/opcodes/trigger/> | "Sets the trigger which will be used for the sample to play." ／ "**attack** : (Default): Region will play on note-on." ／ "**release**: Region will play on note-off or sustain pedal off." ／ "`on_loccN / on_hiccN` effectively replace the default trigger=attack, as it is used for regions which are to be triggered by MIDI CC messages and not MIDI note messages." | 不适用 | **是**：一个 region 能不能答 note-on 由 `trigger` 决定（非 attack/first/legato 的 region 对 note-on 等于不存在） |
| **SFZ 规范** `sw_last` | <https://sfzformat.com/opcodes/sw_last/> | "Enables the region to play if the last key pressed in the range specified by sw_lokey and sw_hikey is equal to the `sw_last` value." ／ "With the SFZ 1 or SFZ 2 spec, an instrument which uses `sw_last` to select articulations will not have a default articulation preselected, meaning when loaded, **it will play no sound until one of the keyswitches is pressed**" | 不适用 | **是**：覆盖还取决于 `sw_*` 门控；`sw_default` 是 ARIA 给"载入即有声"的补丁 |
| **Kontakt**（Native Instruments）Mapping Editor | <https://www.native-instruments.com/fileadmin/ni_media/downloads/manuals/kontakt/Kontakt_8_6_User_Guide_English.pdf>（Kontakt 8.6 User Guide，第 158–163 页；`pdftotext` 抽取） | "A Zone is a kind of container that holds information in order to tell Kontakt which Sample to play when a specific note is received. **A Zone needs to specify a range of note and velocity values that it should respond to.**" | **未找到**：Browser 章节列的过滤是 **Sound Type tags**（"Click Sound Type in the Filter section on the left pane of the Browser."）、Character tags、文本 Search、"User Content: Filters by user content."、Preset types；**没有 key-range 过滤** | **是（可视且可编辑）**："The largest space is taken up by the **Zone grid**, a two-dimensional panel with a keyboard at its bottom. It **displays and lets you change the key range (horizontal axis)** and velocity range (vertical axis) of each Zone" ／ "…will adjust the **high key limit of the selected Zone's key range**." ／ "Auto-Spread Zone Key Ranges: This function automatically fills "holes" in your key mapping…" |
| **Decent Sampler** `<sample>` | <https://decentsampler-developers-guide.readthedocs.io/_/downloads/en/1.11.1/pdf/>（DecentSampler 1.11 开发者指南） | "**loNote** (optional): The MIDI note number (from 1 to 127) of the lowest note for which the zone should be triggered. Default: **0**." ／ "**hiNote** (optional): The MIDI note number (from 1 to 127) of the highest note for which the zone should be triggered. Default: **127**." | **未找到**（该指南没有"浏览器"章节） | **是**：`<ui><keyboard>` 里 `<color loNote="74" hiNote="84" … />` —— "The bottom of the range for which this color should be displayed. Format: MIDI Note number." ／ "The top of the range…" |
| **smplr**（JS/WASM 采样器库） | <https://raw.githubusercontent.com/danigb/smplr/main/README.md> | 预设 region："`{ sample: "kick", keyRange: [60, 60], pitch: 60 }`" ／ "**fallback**: what to play for a note that wasn't loaded. **`"none"` (the default**, except for `SplendidGrandPiano`) **plays nothing**; `"nearest"` plays the nearest loaded note, pitch-shifted." ／ "`notes`: … **Every sample that covers one of them is loaded.** Omit it to load all notes; an empty list loads none. Entries that match nothing are ignored with a console warning." | **不适用**：smplr 没有音色浏览器 | **是**：每个 region 显式 `keyRange`；**超范围默认什么都不发**（`fallback:"none"`），要"就近顶替"必须显式写 `"nearest"` |
| **Logic Pro**（Key Limit） | <https://help.apple.com/pdf/logicpro/en_US/logic-pro-user-guide.pdf>（Logic Pro 用户指南 PDF） | "**Key Limit value slider**: … The two values together define the key range; **any notes outside this range are not played.**" | **未找到**（未逐页读完 Logic 的浏览器章节） | 部分：track 级 Key Limit 有上下限；**Sampler 的 "Key Mapping Editor" 页面**（<https://support.apple.com/guide/logicpro/use-the-key-mapping-editor-lgsifc861598/mac>）本次抓取**只得到标题**（JS 渲染页面），**该页逐字原句 ⇒ 未找到** |
| **Ableton Live 12**（Key Zones） | <https://www.ableton.com/en/live-manual/12/instrument-drum-and-effect-racks/> | "Zones are sets of data filters that reside at the input of every chain in an Instrument or Effect Rack. Together, they determine the range of values that can pass through to the device chain." ／ "When the Key button is selected, the **Key Zone Editor** appears to the right of the Chain List, **illustrating how each chain maps to the full MIDI note range (nearly 11 octaves). Chains will only respond to MIDI notes that lie within their key zone.**" ／ "An incoming MIDI note gets compared to a chain's key zone. If the MIDI note lies within the key zone, it is passed to the next zone for comparison; **if it does not, then we already know that the note will not be passed to that chain's devices.**" | **未找到**：§4 Working with the Browser 的目录是 Content Pane / Search Bar / Filters and Tags / Collections / Library / Places，**没有 key range 过滤**；未逐页读完 ⇒ 记为未找到 | **是（可视）**：Key Zone Editor "illustrating how each chain maps to the full MIDI note range" |
| **HALion**（Steinberg，次要来源） | <https://archive.steinberg.help/halion/v6/en/HALion_6_Operation_Manual_en.pdf> | "With the Low Key and High Key value fields, you can set up the key range for the selected zone"（**来自搜索摘要，未逐字核对原页** ⇒ 记为**未核实**） | 未核实 | 未核实 |

### 4.1 这张表的结论（决定我们"改内容"还是"在界面上暴露覆盖范围"）

1. **没有一个成熟产品用"乐器名"去自动保证音域对得上。** 音域是**映射数据本身的一部分**（SFZ 的 region、Kontakt 的 Zone、Decent Sampler 的 `<sample loNote/hiNote>`、smplr 的 `keyRange`、Logic/Ableton 的 zone/key range），映射者放多少、覆盖多少，就是多少。
2. **它们都让覆盖范围"看得见、可编辑"**：Kontakt 的 Zone grid "with a keyboard at its bottom … displays and lets you change the key range"；Ableton 的 Key Zone Editor "illustrating how each chain maps to the full MIDI note range (nearly 11 octaves)"；Decent Sampler 给键盘配 `<color loNote hiNote>`。
3. **超范围的音，成熟产品的默认是"什么都不发"，不是"就近顶替"**：Ableton"if it does not, then we already know that the note will not be passed to that chain's devices"；smplr 的 `fallback` 默认 `"none"`，原文说 **plays nothing**；Logic 的 Key Limit "any notes outside this range are not played"；SFZ 侧 `trigger` 的默认 `attack` 与 `sw_last` 的"未按切换键就不出声"都把"没覆盖＝静音"写进格式默认里。
   ⇒ **本仓现在遇到的现象（44 条 note 全 `no playback`）与成熟产品的默认行为一致**；差别不在"会不会静音"，而在**我们没有任何界面把"这条 lane 的库覆盖 39–76、这条线写到 91"显示出来**。
4. **浏览器的音域过滤**：在查到的官方文档里，**Kontakt 与 Ableton 的浏览器章节都没有"按音域过滤"这一项**（Kontakt 是 Sound Type/Character/搜索/用户内容/预设类型；Ableton 是 Filters and Tags/搜索）。⇒ **"让浏览器按音域过滤"不是行业既有能力**，也没有可抄的先例（**这条是"未找到"，不是"有证据说没有"**）。
   ⇒ **本报告的建议据此是"暴露覆盖范围"，不是"改内容"**：曲风内容（音高）是创作者/内容决策，不该为了迁就某个库的录音音域而自动改写；该做的是在**选音色／看 lane**的地方把"该资产可发 A–B（缺 C…）"与"本 lane 写到 min–max"并排显示，并在越界时**出声地报告**（引擎已经有 `sampledInstrumentProblems` 这套报告机制，缺的是"音域"这一项与界面入口）。

---

## §5 判据与证红

**判据文件**：`src/test/sampledRangeCensus.test.ts`（新增；不改既有判据）。

### 5.1 钉住的数

| 判据 | 钉住的内容 |
| --- | --- |
| 分母 | 159 曲风；96 曲风有调色板声部；202 条声部；22 个资产 |
| **三类计数** | `{能发:168, 部分:25, 静音:5, 无声部内容:4}`（数字一变即红） |
| **每个曲风的静音声部数** | `{bebop:1, chicago-drill:1, free-jazz:1, post-punk:1, smooth-jazz:1}`，其余 0（用 map 钉，防止"换个曲风静音也算 5"） |
| 5 条静音声部 | 逐条钉 `曲风/声部:乐器→资产(音符数, 写出音高)` ＋ 各自的覆盖区间 |
| 25 条部分静音声部 | 逐条钉名字、音符数、**丢失几个音** |
| 4 条无声部内容 | 逐条钉名字（将来某轮内容填进来即红） |
| **`/genre/bebop` lead 具名判据** | `sax_lead` → `mtg-solo-sax:MTG-Tenor-Sax`；**44 条 note**；不同音高 `[82,85,86,89,91]`；**可发音符数 = 0**；该资产实测 `39–76`（缺 `41,42,43`），且每个写出音高 `> 76` |
| 测量可达 | 每个被映射的资产都在测量表里；每条 sha256 是 64 位十六进制；**unmeasured 必须为空**（调色板换到一个没量过的资产会具名变红） |
| 联网复核 | 22 个程序逐个从 pin 取原文、核 manifest sha256、展开、**用 `resolveInstrumentNote` 重扫 0–127**，与测量表逐键比对；5 条静音声部的**每一个写出音**在**本声部自己的力度**下被引擎拒绝（`no playback`） |

> ⚠️ **本表是修复前的版本（`{168,25,5,4}` / 5 个静音曲风 / 5 条静音声部 / bebop 写 `[82,85,86,89,91]`）。**
> 修复后的判据（`{172,25,1,4}`、只剩 `post-punk`、bebop 写 `[58,61,62,65,67]`）与新增的"只有这 4 条 lane 变了"判据见 **§8.4**。

### 5.2 证红实跑（两次突变，跑完立刻还原，`git diff` 为空）

**突变 A — 只改调色板一行**：`src/data/sampledInstruments.ts` 第 83 行 `mtg-solo-sax:MTG-Tenor-Sax` → `mtg-solo-sax:MTG-Soprano-Sax`：

```
AssertionError: expected { sounding: 168, partial: 24, …(2) } to deeply equal { sounding: 168, partial: 25, …(2) }
AssertionError: expected { 'chicago-drill': 1, 'post-punk': 1 } to deeply equal { bebop: 1, 'chicago-drill': 1, …(3) }
AssertionError: expected 'mtg-solo-sax:MTG-Soprano-Sax' to be 'mtg-solo-sax:MTG-Tenor-Sax' // Object.is equality
AssertionError: expected [ …(4) ] to deeply equal []          ← unmeasured 钉住（新资产没有测量行）
...
 Test Files  1 failed (1)      Tests  7 failed | 26 passed (33)
```

**突变 B — 只改曲风内容**：`src/data/genres/jazz_blues.ts` 里 `bebop` lead 的 `pitch` 数组整体 −12（82→70, 85→73, 89→77, 86→74, 91→79）：

```
AssertionError: expected { sounding: 168, partial: 26, …(2) } to deeply equal { sounding: 168, partial: 25, …(2) }
AssertionError: expected { 'chicago-drill': 1, …(3) } to deeply equal { bebop: 1, 'chicago-drill': 1, …(3) }
AssertionError: expected [ 70, 73, 74, 77, 79 ] to deeply equal [ 82, 85, 86, 89, 91 ]
...
 Test Files  1 failed (1)      Tests  6 failed | 27 passed (33)
```

⇒ **调色板改动**与**曲风内容改动**两个方向都能让判据变红；两次都还原（`git diff --stat` 无输出）。

### 5.3 反向（未改动的既有判据）

`src/data/genres/**`、`src/data/sampledInstruments.ts`、`public/samples/manifest.json`、`mcp/**`、`docs/OPEN_WORK.md`、`src/mobile/**`、版本号、`.github/**`、`scripts/push_dev.sh`、任何 `.env*`／`wrangler.toml`：**本次提交一律未改**（`git show --stat` 见提交）。既有五个数（`sampledInstruments` / `sampledInstrumentPaletteWiring` / `ownerProjectAcceptance` 的 57→25、3→1、60→28）**一字未动**。

---

## §6 判不了 / 未核实

1. **"浏览器按音域过滤"没有找到正面证据**（Kontakt/Ableton 的浏览器章节里没有这一项；Logic 的浏览器章节没有逐页读完）。⇒ §4.1#4 的结论按"未找到"读，不按"不存在"读。
2. **Logic 的 Sampler "Key Mapping Editor" 的原句未取到**：`support.apple.com/guide/logicpro/use-the-key-mapping-editor-lgsifc861598/mac` 抓取只得到标题（页面为 JS 渲染）；本报告引用的是 Logic 用户指南 PDF 里 **track Key Limit** 的原句，不是该 mapping editor 页面的原句（该页原句 ⇒ **未找到**）。
3. **Decent Sampler 的"浏览器按音域过滤"未找到**；只找到它的 `<sample loNote/hiNote>` 与 UI `<color loNote hiNote>`（后者是给键盘涂色，不宣称是"浏览过滤"）。
4. **smplr 没有音色浏览器**（它是采样器库），所以"smplr 的浏览器是否按音域过滤"**不适用**；它的 `keyRange` 与 `fallback:"none"` 是映射与播放层的证据。
5. **力度维度**只在"任何静音/部分静音声部用到的 10 个资产"上核到 1/64/127 三档一致；其余 12 个资产**未逐档扫**（它们没有静音/部分静音的声部，结论不受影响）。
6. **鼓声部（458 条调色板声部）不在本普查里**：鼓没有音高，音域问题不适用；它们的映射由 `src/audio/drumRoles.ts` 的角色→GM 音符表决定。
7. **`SAMPLED_TECHNIQUE_INSTRUMENTS`（26 行弦乐技法名）在曲风数据里 0 次出现**：本普查 202 条声部的 `instrument` 全是名字表那 22 行覆盖的名字，所以那 26 行没有被本判据覆盖到（它们由 `src/test/stringTechniques.test.ts` 等管）。
8. **`/genre/bebop` 的 lead 是"44 条 note 全 no playback"**：本报告在引擎上复现了这一点（§5.1），但**没有**在浏览器里跑一遍 `/genre/bebop` 听感确认（离线/在线判定已覆盖同一函数路径）。

---

## §7 把覆盖显式化：运行时读数、显示位置、超范围判定（本轮改动）

§4.1 的结论是"**暴露覆盖范围，不自动改内容**"；本节记录这句话是怎么落地的：覆盖在**运行时**从哪里取、显示在**哪两个界面**、超范围由**哪条引擎路径**判。曲风内容、调色板、manifest **仍然一字未改**。

### 7.1 覆盖在运行时从哪来（读数，逐条给文件:行）

| # | 读数 | 证据 |
| --- | --- | --- |
| 1 | **加载器持有的是"展开后的程序文本"，不是 regions。** 它把 `Promise<{text}>` 按 assetId 缓存；regions 是 `resolveInstrumentNote` **每次调用现解析**出来的 | `src/audio/sampleLoader.ts:274`（`programs: Map<string, Promise<{ text: string }>>`）、`:275-302`（`expandedProgram`：源→镜像、`expandRemoteIncludes`）、`src/audio/sfz/instrument.ts:210`（`parseSfz(sfzText, …)`）；`src/audio/sfz/keyswitch.ts:193` 的注释也直说 "re-parses the program on every note" |
| 2 | **没有任何 UI 可达的口子能拿到那段文本或 regions。** `SampleLoader` 只暴露 `load` / `loadNote` / `decodes` | `src/audio/sampleLoader.ts:57-83`。`loadNote` 内部确实调 `resolveInstrumentNote`（`:340`），但它随后就 `decodeAsset`（`:366`）——用它扫 0–127 等于把整台琴的采样 decode 一遍，只为回答一个映射问题 |
| 3 | **UI 侧唯一"从引擎算"的入口**是纯函数 `resolveInstrumentNote`，加引擎自己的 `#include` 展开器 `expandRemoteIncludes` | `src/audio/sfz/instrument.ts:178`、`src/audio/sfz/remoteIncludes.ts:51` |
| 4 | ⇒ 本轮做法：**取一次程序文本，问引擎 128 次**。`sampledCoverage/programText.ts` 按 `sampleLoader.ts:279-298` 的**同一地址规则**（源先、镜像后；include base = 从源 url 减去 program path）取一次文本并用 `cachedProgramText` 做单飞缓存；`sampledKeyCoverage` 再对 0–127 每键调 `resolveInstrumentNote`（与 §1.3 同一判据，不新增第二份表） | `src/features/sampledCoverage/programText.ts`、`src/features/sampledCoverage/sampledKeyCoverage.ts` |
| 5 | **未加载时怎么显示：说"尚未加载"，绝不猜数字。** `coverageOf()` 在引擎回答前返回 `undefined`，只有 `ready` 才可能给出范围；`ready` 且 `null`（引擎一个键都不答）说的是"这段录音一个键都发不出"，与"尚未加载"是两句不同的话 | `src/hooks/useSampledCoverage.ts:70`（`statusOf`/`coverageOf`）、`src/components/arrangement/coverageLabel.ts`（`describeCoverage`） |

⚠️ **记录在案的代价**：若该 lane 已经播放过，`sampleLoader` 自己也持有同一段展开文本，本轮会**再读一次**程序（UI 拿不到 loader 的私有缓存）。修法是给 `SampleLoader` 加一个文本/regions 取用口，属于 `src/audio/**`——本轮明令只许读，故不在本次改动内。

### 7.2 显示在哪（文件:行）

| 位置 | 显示什么 | 文件:行 |
| --- | --- | --- |
| **挑选器**（inspector 的录音挑选器） | 该录音"可发 A–B（缺 …）"；未加载＝"尚未加载" | `src/components/arrangement/CatalogueRecordingPicker.tsx:237`（`data-testid="lane-recording-coverage"`） |
| **这条轨**（同一挑选器内） | 本轨写出的音 min–max（`本轨写出 82–91（5 个音高，共 44 个音）`） | `CatalogueRecordingPicker.tsx:250`（`lane-written-range`） |
| **超范围报告** | `这条轨有 N 个音超出该录音的音域：可发 A–B（缺 …）`，`role="status"` | `CatalogueRecordingPicker.tsx:257`（`lane-range-report`） |
| **挑选器列表的每一行** | 指向/聚焦该行时读它的覆盖；未读完显示"尚未加载"，从未请求则不显示数字 | `src/components/arrangement/InstrumentLibraryV2.tsx:181-182`（`onMouseEnter`/`onFocus` → `request`）、`:189`（`instrument-coverage-<assetId>`） |
| 轨道→挑选器的接线 | 访问目录的**资产数组**（地址簿）与 inspector 的**那条 lane** | `src/views/StudioView.tsx:942`、`:1352`（`assets`）、`:1353`（`lane`） |

**为什么列表行按需读而不是打开就全读**：目录里有 ~300 个程序资产，每个都要抓文件＋展开 `#include`；打开列表就全读是一次踩踏，不是功能。所以"意图"（hover/focus）才是触发，没请求过的行**不显示数字**（"或等加载完再显示"）。

### 7.3 超范围判定用哪条引擎路径

* **逐音问引擎**：`notesOutsideCoverage(asset, text, notes)` 对每个写出音调 `resolveInstrumentNote(asset, text, pitch, { velocity })`，力度取**该步自己的**力度（`stepVelocity`，`src/data/noteLayer.ts:54`）。所以"某键只在某力度层出声"也算得对。
* **中间被挖空也算超范围**：`sampledKeyCoverage` 的 `holes` 是引擎逐键拒答的差集；`notesOutsideCoverage` **不看 min/max**，只看引擎答不答。MTG 的 41–43 写进去照样报超出（证红 C 证明：换成 min/max 即红，见 §7.5）。
* **跨度只用于标签**：`first`/`last`/`holes` 只喂 `coverageLabel.ts` 的文字，没有任何判定读它们。

### 7.4 §106 补两条（普查表之外，逐字＋URL）

**问一：有没有产品在浏览器里显示采样的按键范围？**

| 产品／工具 | URL（本次抓取） | 逐字原句 | 判定 |
| --- | --- | --- | --- |
| Kontakt 8.6 Browser | <https://www.native-instruments.com/fileadmin/ni_media/downloads/manuals/kontakt/Kontakt_8_6_User_Guide_English.pdf>（§4 已引） | Browser 的过滤是 Sound Type tags／Character tags／文本 Search／"User Content"／Preset types；Zone grid "displays and lets you change the key range" | **浏览器内显示范围：未找到**（范围画在 Zone grid，即 mapping 视图） |
| Ableton Live 12 Browser | <https://www.ableton.com/en/live-manual/12/instrument-drum-and-effect-racks/> | Browser 章节目录为 Content Pane／Search Bar／Filters and Tags／Collections／Library／Places；Key Zone Editor "illustrating how each chain maps to the full MIDI note range" | **浏览器内显示范围：未找到**（范围画在 Key Zone Editor） |
| HALion 6.4 | <https://archive.steinberg.help/halion/v6/en/halion/topics/mapping_zones/mapping_editor_key_range_and_velocity_range_setting_t.html> | "To set the key range, move the mouse to one of the borders of a zone and drag to the left or the right, or enter the values manually in the **Low Key** and **High Key** value fields." | **浏览器内：未找到**；范围在 Mapping Editor 里可读可改 |
| sfizz（SFZ 播放器 UI，一手 issue） | <https://github.com/sfztools/sfizz/issues/900> | 标题 "max keyranges not showing color on the keyboard"；正文 "not showing the color range on the keyboard ui" ／ "Change it to : lokey=1 hikey=127 … does shown the color range" | **有产品把 region 覆盖画在键盘 UI 上**（mapping 视图，不是浏览器列表）；sfizz-ui 没有音色浏览器 |
| UVI Workstation／Omnisphere 2／VSL Synchron Player／Steinberg MediaBay | 抓到的都是 `application/pdf`，本次工具不支持解析；VSL 手册页跨域跳转未跟随 | —— | **未核实／未找到** |

**问二：有没有产品会警告"这段 MIDI 超出该乐器音域"？**

| 产品 | URL（本次抓取） | 逐字原句 | 判定 |
| --- | --- | --- | --- |
| Dorico（Elements 3.0 手册） | <https://archive.steinberg.help/dorico_elements/v3/ru/dorico/topics/notation_reference/notation_reference_notes_out_of_range_colors_showing_t.html> | "You can show colors for notes that are considered out of range, such as **notes too high/low for the instrument to play** or the voice type to sing…" ／ "**Notes out of range appear red** when a tick appears beside Notes Out Of Range in the menu, and black when no tick appears." | **是（可视警告，可开关）** |
| Finale（官方手册） | <https://usermanuals.finalemusic.com/FinaleMac/Content/Finale/Ranges.htm> | "Finale **can identify pitches that are out of range for any instrument**…" ／ "Finale automatically analyzes all pitches and **identifies notes that are out of range by displaying them with onscreen-only orange or yellow noteheads**." | **是（可视警告）** |
| Logic Pro Key Limit | （§4.1 已引） | "any notes outside this range are **not played**." | **否：只是限制/过滤，不警告** |
| Ableton Live Key Zone | （§4.1 已引） | "if it does not, then we already know that **the note will not be passed**" | **否：静默不通过** |
| MuseScore | 只找到社区帖（<https://musescore.org/en/node/362035>、<https://musescore.org/en/node/388194>），官方手册（handbook.musescore.org）本次未定位到"out of range"的逐字页 | —— | **未找到** |
| Sibelius／Cubase／FL Studio／Studio One／Reaper／Bitwig／Pro Tools | 本次未取到逐字 | —— | **未找到** |

**两条问题的小结**：①"浏览器列表里显示按键范围"在本轮查到的官方文档里**未找到**；显示覆盖的产品都把它画在 **mapping／keyboard／zone 视图**里（Kontakt Zone grid、Ableton Key Zone Editor、HALion Mapping Editor、sfizz 键盘）。②**记谱软件会警告**（Dorico 红音头、Finale 橙/黄音头），**DAW 只做过滤**（Logic "not played"、Ableton "not passed"）——没有查到 DAW 对"MIDI 超出乐器音域"给出警告的先例。所以本节采纳的界面形状是**并排显示覆盖与写出范围 ＋ 越界出声报告**，这两件事各自有先例（前者＝mapping 视图的显示，后者＝记谱软件的警告；见 §4.1）。

### 7.5 新增判据与证红实跑

**判据文件（新增，不改既有判据）**：

| 文件 | 钉住的内容 |
| --- | --- |
| `src/test/sampledKeyCoverage.test.ts`（8 例） | 同一 assetId ＋ 两份夹具 regions ⇒ 两个答案（硬编码表即红）；MTG 夹具 39–76 缺 41–43、dsmolken 夹具 12–120 缺 61–71/90–95；`notesOutsideCoverage` 逐音（含"洞里的音"与"只在某力度层出声的音"）；`writtenNotesOf` 按模型的读法取堆叠与力度 |
| `src/test/sampledRangeCoverageUi.test.tsx`（8 例） | 挑选器/列表的显示来自引擎且跟着夹具变；未加载＝"尚未加载"且**无数字**；`bebop` lead（写 82–91）⇒"有 44 个音超出…可发 39–76（缺 41–43）"；写 41–43 ⇒"有 3 个音超出"；全部覆盖时**不**报告；没有目录时**不显示**任何覆盖；**目录晚到时"不在本目录"不是永久失败**（同一 reader、只换地址簿，仍能读出范围） |

**证红实跑（四次突变，跑完立刻还原，`diff` 为空）**：

| 突变 | 改哪 | 读数 |
| --- | --- | --- |
| A 硬编码表 | `sampledKeyCoverage` 对 `mtg-solo-sax:MTG-Tenor-Sax` 直接返回 `39–76 缺 41–43` | `sampledRangeCoverageUi`「跟着夹具变」**红**：换夹具后仍是 39–76，`可发 20–30` 永不到达（1 failed / 6 skipped） |
| B 去掉报告 | 把 `lane-range-report` 的渲染条件置为 `false` | 「44 notes of bebop」**红**：`findByTestId("lane-range-report")` 超时（1 failed / 6 skipped） |
| C min/max 比较 | `notesOutsideCoverage` 改成"取 min/max 后比跨度" | 「written into the recording's hole」**红**：41–43 落在 39–76 内 ⇒ 不报告（1 failed / 6 skipped） |
| D 未加载给假数字 | `describeCoverage` 的 loading 分支返回 `可发 0–127` | 「shows no number before the engine has answered」**红**：`textContent` 不含"尚未加载"（1 failed / 6 skipped） |

读数为绿（还原后）：`sampledKeyCoverage` 8/8、`sampledRangeCoverageUi` 8/8。

### 7.6 反向（未改动的既有判据）

* `src/test/sampledRangeCensus.test.ts`：**33/33 绿**（含联网复核 22 个 pin 的 sha256），三类计数仍是 `{能发:168, 部分:25, 静音:5, 无声部内容:4}`；
* `src/test/ownerProjectAcceptance.test.ts`：**8/8 绿**，五个数（57→25、3→1、60→28）未变；
* `src/test/sampledInstruments.test.ts` 7/7、`src/test/sampledInstrumentPaletteWiring.test.ts` 6/6：调色板 22 行、0 处不存在，未动；
* 既有 `src/test/catalogueRecordingPicker.test.tsx` 14/14、`src/test/instrumentLibrary.test.tsx` 7/7、`src/test/instrumentCategories.test.ts` 6/6、`src/test/i18nKeys.test.ts` 4/4：**绿**（没有 `assets` 的调用方行为与改动前一致）。

**未改动**：`src/audio/**`、`mcp/**`、`src/data/genres/**`、`src/data/sampledInstruments.ts`、`public/samples/manifest.json`、`docs/OPEN_WORK.md`、`src/mobile/**`、版本号、`.github/**`、`scripts/push_dev.sh`、任何 `.env*`／`wrangler.toml`。


> ⚠️ **与 §7 的关系**：§7 说的是「把覆盖**显示**出来、不自动改内容」（那条线的 UI 工作，`src/data/genres/**` 当时**未改动**）；
> 本节说的是**之后**业主授权的那一次**内容修复**——它**改了 4 条曲风线的音高**，因此 §7.6 里「三类计数仍是 `{168,25,5,4}`」、
>「`src/data/genres/**` 未改动」这两句**在本节之后已不再成立**：新计数是 `{172,25,1,4}`（§8.4）。§7 本身描述的功能与判据没有变。

## §8 修复：把"曲风写超出乐器本身音域"的音修回域内（2026-10-03，业主授权改曲风）

### 8.0 摘要

普查把 5 条"一个音都不发"的声部摆出来之后，问题被拆成两类，**只有第一类改了曲风**：

| 类别 | 判据 | 条数 | 处理 |
| --- | --- | --- | --- |
| **曲风越界** | 写出的音高**超出该乐器本身的可奏音域**（与录音无关） | **4** | ✅ **把整条线按八度折回域内**（保音级、保音程、保旋律形状） |
| **库窄** | 写出的音高**在乐器域内**，只是**那个录音**没录到那么高 | **1** | ❌ **不改曲风**（改了就"内容让位于库"），改的是**音源**——见 §8.6 的提案 |
| 映射错 | 这条 lane 该用别的乐器名 | **0** | — |

**三类计数（修复前 → 修复后）**：

```
能发 168 → 172      （+4：4 条折回域内的 lane 整条开始发声）
部分 25 → 25        （不变）
静音 5  → 1         （−4：只剩 post-punk 的 bass，判为库窄，故意不改）
无声部内容 4 → 4    （不变）
合计 202 → 202      ✓
静音曲风 {bebop, chicago-drill, free-jazz, post-punk, smooth-jazz} → {post-punk}
```

### 8.1 §106：有据的乐器音域（每条给逐字原句 ＋ URL）

| 乐器 | 断言 | 音名（MIDI） | 逐字原句（本次抓取） | URL |
| --- | --- | --- | --- | --- |
| **次中音萨克斯**（tenor saxophone） | 发声（concert）音域 | **A♭2–E5 = 44–76** | "The tenor saxophone in B♭ sounds an octave and a major second lower than written. Many models have a high F♯ key, and higher pitches are possible using altissimo fingerings." ／ **"Modern tenor saxophones that have a high F♯ key have a range from A♭2 to E5 (concert) and are therefore pitched one octave below the soprano saxophone."** | <https://en.wikipedia.org/wiki/Tenor_saxophone> |
| **次中音萨克斯** | 写谱音域（对照用；本仓的 MIDI 是**发声**音高） | 写谱 B♭3–F♯6 | 同上一行："sounds an octave and a major second lower than written"（⇒ 写谱音域 = 44–76 上行大九度 = 58–90） | 同上 |
| **管钟**（tubular bells / chimes） | 写谱音域 | **C4–F5 = 60–77**（个别专业型号到 G5 = 79） | **"The written range of chimes is usually seen as C4 to F5, though some professional models reach G5."** ／ "Standard tubular bells have a range of either 1.5 or 1.6 octaves. Specialty sets of chimes, such as bass chimes, may extend higher or lower." | <https://en.wikipedia.org/wiki/Tubular_bells> |
| **电贝斯**（4 弦 picked electric bass） | **定弦** | 空弦 **E1–A1–D2–G2 = 28/33/38/43** | New Grove（经 Wikipedia 转引）：**"Electric bass guitar, usually with four heavy strings tuned E1'–A1'–D2–G2."** ／ "The electric bass guitar is usually tuned the same as the double bass, corresponding to pitches one octave lower than the four lowest-pitched strings of a guitar, typically E, A, D, and G (5-string models typically add a low B, and 6-string models typically add a high C)." ／ 信息框图注："Range of a standard tuned 4-string bass guitar (brackets: 5-string)" | <https://en.wikipedia.org/wiki/Bass_guitar> |
| **电贝斯** | **最高音**（一个可引的数字） | **未找到** | 本次抓到的页面（Wikipedia／VSL `https://www.vsl.co.at/en/Plucked_Strings/Electric_Bass`——该页为 JS 渲染，**返回空**）**都没有**给出"4 弦电贝斯最高到哪个音"的逐字句 | **未找到** |

**由 §106 得出的算术**（不是引用，是本报告自己算的，方法写明）：

* 次中音萨克斯发声域 **44–76**。`bebop` lead 写 82–91、`free-jazz` 写 81–90、`smooth-jazz` 写 77–82 ⇒ **全部（或除 76 以外全部）在 76 之上**。**注意库这一侧是对的**：`mtg-solo-sax:MTG-Tenor-Sax` 实测 **39–76**，其**上界 76 恰好等于乐器本身的 E5**——它不缺件，它是准的。
* 管钟 C4–F5（60–77），专业型号到 G5（79）。`chicago-drill` lead 写 **79/82/84** ⇒ **82（B♭5）与 84（C6）超出任何型号**；79（G5）只落在"个别专业型号"的顶边上。库这一侧同样是准的：`vcsl:Tubular-Bells-1` 实测 **60–77**，同族 `Tubular-Bells-2` **60–79**、`Tubular-Bells-3` **60–78**——**这一族没有任何程序能发 82/84**。
* 电贝斯空弦 28/33/38/43。`post-punk` bass 写 **50 (D3) / 53 (F3) / 55 (G3)** ⇒ 分别是 D 弦第 12 品、D 弦第 15 品、G 弦第 12 品。**这是电贝斯最普通的音区**（常见 4 弦贝斯 20–24 品，G 弦 20 品即到 D♯4 = 63）。⇒ **不是曲风越界**。

### 8.2 逐条定性（5 条静音声部）

| 曲风／声部 | 乐器 → 资产（实测覆盖） | 写出音高 | **定性** | 依据 |
| --- | --- | --- | --- | --- |
| `smooth-jazz` lead | `sax_lead` → `mtg-solo-sax:MTG-Tenor-Sax`（39–76） | 77, 81, 82 | **曲风越界** | 次中音萨克斯发声域 44–76（§8.1 逐字）；77–82 全在其上 ⇒ 与录音无关 |
| `bebop` lead | 同上 | 82, 85, 86, 89, 91 | **曲风越界** | 同上；最高 91 = G6，比乐器上界高 15 个半音 |
| `free-jazz` lead | 同上 | 81, 82, 84, 85, 87, 88, 90 | **曲风越界** | 同上 |
| `chicago-drill` lead | `bell_lead` → `vcsl:Tubular-Bells-1`（60–77） | 79, 82, 84 | **曲风越界** | 管钟写谱域 C4–F5，专业型号到 G5（§8.1 逐字）；82/84 超出所有型号 |
| `post-punk` bass | `pick_bass` → `freepats-electric-bass-yr:PickedBassYR-20190930`（26–46） | 50, 53, 55 | **库窄**（**不是**曲风错；**不是**映射错） | 50/53/55 是电贝斯最普通的音区（§8.1）；该录音**录到的最高音就是 E2 = 40**（SFZ 原文：`lokey=40 hikey=46 pitch_keycenter=40 sample=samples/pick/E2.flac`——40–46 是拿 E2 那一个采样往上拉了 6 个半音），一个更宽的 picked 源见 §8.6 |

**没有一条是"映射错"**：三条 `sax_lead` 映射到 tenor sax 是对的（`sax_lead` 在这三条曲风里就是爵士萨克斯 lead）；`bell_lead` → 管钟是对的；`pick_bass` → picked 电贝斯也是对的。错的是**写出来的音高**（前 4 条）与**那个录音的覆盖**（第 5 条）。

### 8.3 改了什么、为什么这样改

**选用的折法：整条线按"最小整八度"折回**（`pitch − 12k`，取能把这**一条线全文**放回域内的最小 `k`）。

三种候选与取舍：

| 方案 | 结果 | 为什么不用 |
| --- | --- | --- |
| **整体移调** | 会改调性 | 除非"本来就差一个八度"，否则改调性 ✗ |
| **逐音最小八度折回** | 每个越界音各自降最少的八度 | **会重塑旋律**：`bebop` 的 89/91 要降两个八度、82/85/86 只降一个 ⇒ 原先行进的顶点（89、91）变成全曲最低音，乐句形状被破坏 ✗ |
| ⭐ **整条线最小整八度折回** | 一条线用**同一个** `k` | ✅ **保留音级、保留全部音程、保留旋律形状**（整条线原样移低），是"最保守"的一种；代价是 `bebop`/`free-jazz` 要降两个八度（因为 91 必须 ≤ 76） |

**逐处改动（before → after，音级不变）**：

| # | 文件:行 | 曲风／声部 | 折 | 写出音高 before | after | 依据 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `src/data/genres/jazz_blues.ts:2864-2881` | `bebop` lead | **−24** | 82, 85, 86, 89, 91（B♭5,C♯6,D6,F6,G6） | **58, 61, 62, 65, 67**（B♭3,C♯4,D4,F4,G4） | 91 − 12 = 79 > 76 ⇒ 最少要两个八度；折后 58–67 全在 39–76 内（且避开缺键 41–43） |
| 2 | `src/data/genres/jazz_blues.ts:4803-4820` | `free-jazz` lead | **−24** | 81, 82, 84, 85, 87, 88, 90 | **57, 58, 60, 61, 63, 64, 66** | 90 − 12 = 78 > 76 ⇒ 两个八度 |
| 3 | `src/data/genres/jazz_blues.ts:5775-5792` | `smooth-jazz` lead | **−12** | 77, 81, 82 | **65, 69, 70** | 82 − 12 = 70 ≤ 76 ⇒ 一个八度够 |
| 4 | `src/data/genres/trap_drill.ts:2379-2396` | `chicago-drill` lead | **−12** | 79, 82, 84（G5,B♭5,C6） | **67, 70, 72**（G4,B♭4,C5） | 82/84 超出乐器；79 也在专业型号顶边。整条降一个八度 ⇒ 67–72 落在 **C4–F5 的正中间**，且形状不变 |

**没有改的东西（逐字相同）**：其余 **155 个曲风**的所有 lane；这 **4 个曲风**的**其它 lane**（`bebop` 的 bass/chords、`free-jazz` 的 bass/chords、`smooth-jazz` 的 bass/chords、`chicago-drill` 的 chords/drums）；`src/data/sampledInstruments.ts`（调色板）；`public/samples/manifest.json`；`src/audio/**`；`mcp/**`；`docs/OPEN_WORK.md`；`src/mobile/**`；版本号；`.github/**`；`scripts/push_dev.sh`；任何 `.env*`／`wrangler.toml`。

### 8.4 判据与新的数（`src/test/sampledRangeCensus.test.ts`，34 例全绿）

改动都写在判据文件自己的注释里（"因为修了 4 条曲风越界"），**数字没有被悄悄改**：

1. **三类计数** `{能发:168, 部分:25, 静音:5, 无声部内容:4}` → **`{172, 25, 1, 4}`**，注释写明这 4 条的来龙去脉。
2. **静音曲风的 map** `{bebop:1, chicago-drill:1, free-jazz:1, post-punk:1, smooth-jazz:1}` → **`{post-punk:1}`**。它仍然是**按名字钉的 map**，所以**将来任何一条新静音 lane 依旧红**——守卫作用保留（不是"总数一样就算过"）。
3. **新增** ⭐ "这 4 条折回的 lane 现在发声、音级不变、且**只有它们动了**"：
   * 每条 lane 的 `verdict === "sounding"`（**逐音**对着测量键集判，不是 min/max）；
   * `after.map(%12)` 与 `before.map(%12)` 逐字相同，且 `after = before + (−12k)`（**改了音级 ⇒ 红**）；
   * ⭐ **"只动了该动的"**：把 202 条 lane 的 `summary(...)` 行拼起来取 `sha256`，先把这 4 行**换回修复前的文本**，结果必须等于**修复前那棵树上的同一个 sha256**：
     `7b9d4bc4caadb7b888fb868e37c48a96f247f59567a16b8064fba7a86ccba761`
     （该值由同一个 `summary` 在同一基线的未修版本上独立算出，方法：`vitest` 跑一个临时脚本打印 `sha256(sorted(rows))`；修复后同一脚本给出 `93bad8889db5cd2a3e54889b0dd63752acb31327065eccfc35b5e949180a1d8d`。判据里两个值都在，且断言"换回 4 行后 = 修复前"、"当前 ≠ 修复前"、"恰好 4 行不同"。）
4. **其余既有判据一字未动**：`/genre/bebop` 具名判据保留（资产、44 条 note、实测 39–76 缺 41–43、每个折前音 > 76、折后音 ≤ 76），在线 half 仍逐个从 pin 复核 22 个程序（本次 22/22 通过，包含 `karoryfer-black-and-blue-basses:05-darkblack-pluck` 实测 **35–76**，是 §8.6 的独立复核）。
5. **反向判据**不变：`ownerProjectAcceptance` 的 57→25／3→1／60→28、调色板 22 行／0 处不存在、`sampledInstruments` 判据。
6. ⚠️ **一处必须跟着改的「别人的判据」**：`src/test/sampledRangeCoverageUi.test.tsx`（§7 那条线的 UI 判据）的第 3 条**原来拿 `bebop` 的 lead 当夹具**（断言「超出 44 个」、写出 82–91）。这次把 `bebop` 折回域内之后，那条 lane 不再有任何音超出，该断言的前提消失了。改法：**把夹具换成 `hard-bop` 的 lead**（写 72–77，其中 77 比录音的 76 高一个半音 ⇒ **仍超出 4 个**），**判据本身（超范围报告必须出现、且由引擎逐音判）一字未改**，只换了主体并在文件头注释里写明为什么换。

### 8.5 25 条"部分静音"的定性（**本次只报结论，不改**）

同法定性（写出的音高 vs **乐器本身**的音域，§8.1）。⚠️ **本节用到的「电吉他 24 品最高 E6 = 88」「61 键风琴上界 C7 = 96」「颤音琴标准下界 F3 = 53」「小提琴合奏上界约 E7 = 100」是常见规格，本次没有逐条找引用** ⇒ 按**未核实**读（见 §8.7#5）；只有 §8.1 表里那三条（次中音萨克斯／管钟／电贝斯定弦）是逐字引用。**结论：25 条里有"曲风越界"的**，但它们与这次修的 4 条不同——它们是**同一条线里只有几个顶端音越界**，所以现状是"部分能发"而不是"全静音"。**本次一条都没改**（业主指示）。分三类：

**（a）明确的曲风越界**（写出的音高超出乐器上界）：

| 乐器 | 条数 | 曲风／声部 | 越界的音（MIDI → 音名） |
| --- | --- | --- | --- |
| 电吉他（24 品最高 E6 = 88） | 6 | `sambass` chords (97)、`funk` chords (98)、`gypsy-jazz` chords (98,102)、`samba` chords (98,102)、`bachata` chords (100,103)、`shoe-gaze` chords (97,100,104) | 97 = C7、98 = D7、100 = E7、102 = F♯7、103 = G7、104 = G♯7 —— **比 24 品最高音高一个九度以上** |
| 管钟（C4–F5 = 60–77；专业型号到 G5 = 79） | 4 | `brooklyn-drill` lead (79,80)、`kawaii-future-bass` lead (79,83,84)、`idm` lead (79,81)、`trap-rap` lead (80) | 79 = G5（专业型号顶边）、80 = G♯5、81 = A5、83 = B5、84 = C6 —— **80 以上超出任何型号** |
| 61 键风琴（上界 C7 = 96） | 1 | `nu-disco-house` chords `m1_organ` (100,103) | 100 = E7、103 = G7 |

**（b）库窄**（音高在乐器域内，只是那个录音没录到／有洞）：

| 条数 | 曲风／声部 | 说明 |
| --- | --- | --- |
| 8 | `alternative-rock`/`blues-rock`/`doom-metal`/`grunge`/`hard-rock`/`heavy-metal`/`math-rock`/`shoe-gaze` 的 `pick_bass` (47,48,49,50,52) | **与 `post-punk` 同一个根因**：`PickedBassYR` 录音只到 E2(40)、程序拉到 46。电贝斯上这些音完全正常 ⇒ §8.6 的提案一次覆盖 |
| 1 | `microhouse` bass `finger_bass` (34) | 录音从 35 起 |
| 1 | `modal-jazz` bass `walking_upright` (62) | **不是越界，是采样表 61–71 整段有洞**（低音提琴发 62 毫无问题） |
| 1 | `black-metal` chords `distorted_guitar` (88) | 88 = E6 正好是 24 品吉他上界，录音到 86 |

**（c）边界／需人耳定**（不做结论，留档）：

* `hard-bop` lead (77)：超次中音上界 **1 个半音**（76 = E5，77 = F5）；
* `j-pop` chords `strings_lead` (88,89,93,96,100)：小提琴合奏上界约 E7 = 100，100 是边界、88–96 偏高但可奏；
* `microhouse` chords `vibraphone` (48,51,55,56)：颤音琴标准下界 F3 = 53（3 个八度的琴可到 C3 = 48）；
* 上表 (a) 之外、`guitar_lead` 里 91–96 的几个音：在 24 品上界之上、但在录音覆盖（96）之内。

### 8.6 "库窄"声部的替代音源调查（只出提案；**调色板与 manifest 均未动**）

#### 8.6.1 先在**已有目录**里找："picked 电贝斯没有更宽的"——**复核结论**

方法：从 `public/samples/manifest.json` 枚举**全部 322 个 SFZ 程序**（程序名／资产名／条目名匹配 `pick|plectr` 判"是不是 picked"），并列出 `category = "Bass"` 的**全部程序**。

| 检查 | 结果 |
| --- | --- |
| 全目录 322 个程序里，名字含 `pick`／`plectrum` 的 | **2 个**：`freepats-electric-bass-yr :: PickedBassYR 20190930.sfz`（就是现在这条）＋ **一个假阳性** `jlearman-jrhodes3c` 的程序名 "Rhodes Mark I — both **pick**ups"（电钢琴，非贝斯） |
| `category = "Bass"` 的条目 | **3 条 / 52 个程序**：`karoryfer-meatbass`（39 个，**低音提琴** arco/pizz）、`freepats-electric-bass-yr`（2 个：`FingerBassYR` **26–45**、`PickedBassYR` **26–46**）、`karoryfer-black-and-blue-basses`（11 个，**电贝斯吉他**，实测 **35–76**） |
| `karoryfer-black-and-blue-basses` 是 picked 吗？ | **不是**。它的全部技法由 `Programs/01-darkblack_keysw.sfz` 自己的 `sw_label` 写死：**`Pluck` / `Ghost` / `Staccato` / `Behind the bridge` / `Behind the bridge open`**——**没有任何一个叫 pick / plectrum**。（库文档里它的采样名是 `darkblack_<音名>_<力度>_rr<n>.wav`，也不区分拨片／手指。） |

⇒ **"目录里没有更宽的 picked 电贝斯"这条普查结论，在目录范围内成立** ✓（目录里唯一的 picked 程序就是 `PickedBassYR` 26–46；更宽的 `35–76` 那族不是 picked）。

#### 8.6.2 再看**外部**：确实存在更宽的 picked 电贝斯 ⇒ **目录级的结论被"生态级"的事实推翻**

| # | 候选（来源 URL） | 是不是 picked | **实测覆盖**（方法见下） | 许可（逐字） | 大小 |
| --- | --- | --- | --- | --- | --- |
| ⭐ **A** | `sfzinstruments/Project16Rickenbacker4001` → `Fingered and Picked/Picked1.sfz`（同 `Picked2.sfz`）<br><https://github.com/sfzinstruments/Project16Rickenbacker4001> | ✅ **名字就是 Picked**（目录里并列 `Fingered1/2`、`Picked1/2`、`Slapped`、`Muted`） | **24–63（40 键，无洞）**，**覆盖 50/53/55 ✓** | README 逐字：<br>"License: Attribution-NonCommercial-ShareAlike 3.0 Unported (CC BY-NC-SA 3.0), **modified**"<br>"You may use this sound in a commercial music production for free! **You are not allowed to use this product in a sampling library or in a related product (like sampling CD's) !**"<br>另有 "Permission to share from the author: June 2020 via e-mail correspondence"<br>⇒ **CC-BY-NC 家族，符合业主"CC-BY-NC 可接受"，但那句 "modified" 限制与"镜像进我们的采样库"有张力 ⇒ 需业主裁定** | Picked1 用到的 **105 个 wav = 74.6 MiB**（整个 `Fingered and Picked/Samples` 421 文件 304.6 MiB） |
| ⭐ **B** | `sfzinstruments/karoryfer.pastabass` → `linguine.sfz`（**picked**, flatwound, bridge）／`tagliatelle.sfz`（**picked**, muted）<br><https://github.com/sfzinstruments/karoryfer.pastabass> | ✅ readme 逐字："linguine - flatwound strings, **picked**, bridge pickup" ／ "tagliatelle - flatwound strings, **picked**, muted, pickup combo" | **33–101（69 键，无洞）**，**覆盖 50/53/55 ✓**；⚠️ 录到的最高采样是 **key 85（D♭6）**，84–101 是把 D♭6 往上拉（`lokey=84 hikey=101 pitch_keycenter=85`） | readme 逐字：**"Free download, open source and royalty-free for all commercial and non-commercial use, including conversion into other sampler formats and redistribution as part of larger sample libraries."** ＋ 仓库 LICENSE = **CC0-1.0** ⇒ **许可最干净** | `linguine` **204 文件 = 120.1 MiB**；`tagliatelle` **153 文件 = 53.5 MiB** |
| C | `sfzinstruments/Discord-SFZ-GM-Bank` → `Discord GM/Melodic/035-Electric Bass (pick).sfz`<br><https://github.com/sfzinstruments/Discord-SFZ-GM-Bank> | 名字是 pick | **不能用**：该文件全文 30 字节 —— `//dummy` ＋ 一个 `sample=*sine` 的占位 region ⇒ **GM 的"pick bass"在这个库里是空壳** | （该库其余条目在本仓已用：`discord-gm-sitar`） | 30 B |
| D | `karoryfer.growlybass`（Squier Jazz Bass，EADG 定弦） | ❓ readme 只写"pick **scrapes**"（拨片刮弦音效），**没写音符是 picked 还是 fingered** | 未测（未列入提案：不能确认是 picked） | CC0-1.0 | — |
| E | `karoryfer.swagbass`（Ibanez BTB，五度定弦 CGDA）／`karoryfer.fashionbass`（KBS，五度定弦） | ❌ 五度定弦、readme 无 pick 字样 | 未测 | CC0-1.0 | — |
| F | `karoryfer.ergo`（电**立式**低音提琴） | ❌ 不是电贝斯吉他 | 未测 | CC0-1.0 | — |

**实测覆盖的方法（可核）**：把候选程序的 SFZ 原文取到本地，**用本仓引擎自己的 `resolveInstrumentNote(asset, text, note)` 对 `note = 0…127` 逐个问一遍**，取 `ok` 的键集合（与普查 §1.3、判据文件完全同一个函数、同一条路径）。本报告对 A 的两个程序、B 的两个程序各问了一遍 128 个音，得到上表的区间与"无洞"。

**格式**：A、B **都是 SFZ ＋ WAV**，符合"格式优先 SFZ＋WAV"，**不需要"自产 SFZ"通道**。⇒ **`.sf2`／soundfont 那条待决事项本次没有新候选**（FreePats 的 `BassYR` 同时发布 SFZ 与 SF2，但 SF2 那一份的覆盖与 SFZ 相同、不解决问题；其余外部候选未见更宽的 picked SF2）。

#### 8.6.3 提案（**给业主决定，本报告没有改调色板、没有改 manifest、没有下载任何音频**）

* **提案 1（许可最干净）**：把 `pick_bass` 的映射从 `freepats-electric-bass-yr:PickedBassYR-20190930`（26–46）换到 **`karoryfer.pastabass:tagliatelle`**（picked、muted、**33–101**、**CC0**、53.5 MiB）或 `linguine`（picked、120.1 MiB）。
  改哪一行：`src/data/sampledInstruments.ts` 里 `pick_bass` 那一行（**本次未动**）。
  ⇒ 一次覆盖 `post-punk`（50/53/55）＋ §8.5 里 8 条 `pick_bass` 部分静音 lane 里所有 ≤ 101 的音（47/48/49/50/52/55…）。
  ⚠️ 代价：`tagliatelle` 是 **muted**（闷音）性格，`linguine` 是 bridge pickup；两者都比现在的 `PickedBassYR` 更"闷/更冲"，需要试听确认。
* **提案 2（音色最"picked"）**：换到 **Rickenbacker 4001 `Fingered and Picked/Picked1`**（**24–63**、74.6 MiB）。
  ⚠️ **两个待决点**：① 许可是 **CC BY-NC-SA 3.0 "modified"**，且 README 明确"**不得用在采样库里**"——按本仓"明确禁止的排除"这条规矩，**需要业主先裁定**；② 它的 `sample=` 用 Windows 反斜杠路径（`Samples\Picked1#E1_1.wav`）且文件名带 `#`，**本仓解析路径可能需要先规范化**（本次未验）。
* **不提案**：改曲风把 `post-punk` 的 50/53/55 写低（那正是"内容让位于库"，与本次修复的判据相反）。

### 8.7 §8 新增的"判不了／未核实"

1. **电贝斯的"最高音"没有一个可引的逐字数字**（§8.1 末行，**未找到**）：本报告用的是"空弦定弦 ＋ 品位数"的算术，不是引用。若业主需要引用级的依据，需要另找（VSL 的电贝斯页本次返回空）。
2. **Rickenbacker 4001 的许可**（CC BY-NC-SA 3.0 **modified** 里的"不得用于采样库"那句）**是否允许本仓镜像**，**未裁定**（见 §8.6.2 A 与提案 2）。
3. **`Fingered and Picked/Picked1.sfz` 在本仓解析器下能否直接播**（反斜杠路径 ＋ 文件名里的 `#`）**未验**。
4. **§8.5 的定性是按 §8.1 的音域做的静态度量**，**没有**逐条在浏览器里试听；其中 `hard-bop` lead 的 77（超上界 1 个半音）与 `j-pop` strings 的 100（约在小提琴上界）属**边界**，需要人耳／业主定。
5. **§8.5 用到的电吉他／风琴／颤音琴／小提琴的域界没有逐字引用**（24 品 E6 = 88、61 键 C7 = 96、颤音琴 F3–F6、小提琴 E7 = 100 都是常见规格，本次未找源） ⇒ §8.5 的 (a) 类里，**吉他 97–104、管钟 80–84、风琴 100–103 是稳的**（远超任何常见规格），其余按未核实读。**§8.5 全程没有试听、也没有逐条跑引擎**（只比了写出的音高与这些域界）。
6. **§8.6 的候选只在"覆盖"这一个维度上比过**（能不能发 50/53/55）；**音色、动态、与现有 `pick_bass` 的性格差异没有试听**，也没有核 manifest 级的 sha256／字节数（只核了文件大小）。
