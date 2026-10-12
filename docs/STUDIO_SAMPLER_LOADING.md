# `/studio` 的采样声部：点播放既不等待、也不发声（以及 `?diag=1` 怎么看它）

**日期**：2026-10-03 ｜ **基线**：`origin/dev` ｜ 读数量于 **v2.34.42**，改动随 **v2.34.44** 发布到 `dev` 与 `main`

---

## §0 一句话结论

业主原话：**「我播放时候，没有 cache 模式，直接点播放，没看到哪里会提示下载音源」**。

可见性只是这件事**较小的那一半**。在 `/studio` 按下播放时，被映射到录音的声部会**被从合成器上撤下来**（`AudioEngine.prepareSampledLanes`），而**没有任何东西用采样把它们发出来**，**也没有一个字节被请求**——所以它们是**静音**的，而不是"下载慢"。

```
order                       ["engine.play"]   ← 按下即起，之前没有任何等待
loadNote calls              0                 ← 12 个 distinct note / 2 个资产：一次请求都没有
scheduleSamplerSteps calls  0                 ← 没有任何调度器把录音放上时钟
prepareSampledLanes calls   2                 ← 引擎**确实**被要求把这些声部的合成器关掉
sampler-loading present     false
```

这正是 `src/hooks/useRecordedLanes.ts` 自己写下的那句判词：

> Calling only the first is **worse than the defect**: a lane that played the wrong instrument becomes a lane that plays nothing.

---

## §1 怎么量到的（可复现）

单文件、真实 `StudioView`、引擎双桩 ＋ 门控的 `sharedSamplerLoader`、真实 `public/samples/manifest.json`（322 个资产）、`delta-blues`：

```
npx vitest run src/test/studioSamplerLoading.test.tsx
```

判据文件 `src/test/studioSamplerLoading.test.tsx` 的第一条就是"未缓存时出现'正在获取音源'，且准备完成之后才 `play()`"——**在改动之前它是红的**（`sampler-loading` 从不出现），而"被映射的采样声部真的请求了音源"那条断言的是 `loadNote` 调用数 **> 0**（改动前是 0）。

---

## §2 各入口"有没有可见的准备/等待"（改动前）

| 入口 | 播放前 `prepareSamplerLanes` | 进度可见 | 就绪后才 `play()` | 有没有采样调度器 |
| --- | --- | --- | --- | --- |
| `GenreDetailView`（`/genre/:id`） | ✅ `GenreDetailView.tsx:242` | ✅ `:635` `sampler-loading`、`:659` `sampler-problems` | ✅ | ✅ `useAudioEngineInstance` → `useRecordedLanes` |
| `useGenreAudition`（时间线试听） | ✅ `useGenreAudition.ts:405` | ⚠️ **状态有、没人画**：`samplerPreparation` 在 `:543` 返回，`HorizontalTimelineView`／`VerticalTimelineView` **都不引用** | ✅ `:430` | ✅ `:368` |
| **`StudioView` ＋ `useTransportControls`** | ❌ **0 处** | ❌ | ❌ `:405` `await engine.play()` 在最前 | ❌ **完全没有** |
| V2 编排（`playerFromEngine.play`） | ❌ | ❌ | ❌ `:484` `await engine.play()` 在 catalogue 之前（**注释写明是刻意的**："The transport starts before the samples are resolved") | ✅ `:518` |
| `CustomGenreMakerView` | ❌ | ❌ | ❌ `:215` | ✅ `useRecordedLanes` |
| `ChallengeView` | ❌ | ❌ | ❌ `:233`／`:264`／`:275` | ✅ `useRecordedLanes` |
| `CompareView` | ❌ | ❌ | ❌ `:315`／`:426` | ✅ `useRecordedLanes` |

⇒ **`StudioView` 是唯一"两半都缺"的入口**；那 4 处（V2／maker／challenge／compare）只缺"等待"（其中 3 处缺准备），本条线**只列不做**。

---

## §3 改动的形状（**复用既有那套，没造第二套**）

```
prepareSamplerLanes  (src/audio/samplerLanePrepare.ts:142)   ← 只读，直接调用
standDownSamplerLanes                                        ← 同一文件的"要等哪些声部"
sharedSamplerLoader  (src/audio/sharedSamplerLoader.ts:58)    ← 按 AudioContext ＋ catalogue 身份缓存
useRecordedLanes     (src/hooks/useRecordedLanes.ts)          ← 既有"撤下合成器 ＋ 用采样播出"的唯一配对
detail_sampling_*    (src/i18n/locales/explore.ts:123-125)    ← 曲风页已有的三句文案
```

顺序抄自 `GenreDetailView.handlePlayMode`（业主已接受的形状）：**准备 → `engine.play()` → 调度器**。

* `useTransportControls` 新增可选 `recordedLanes: { start, stop }`（`useRecordedLanes` 的两个回调）。
  **不传它时，这个 hook 的行为与改动前逐字相同**——这是既有判据（`transportPlaybackTruth.test.ts` 等）能保持不动的原因。
* `StudioView` 用 `useRecordedLanes(() => engineRef.current, { loaderFor: sharedLoaderFor })` 拿到两半，
  并把 `sharedLoaderFor` 同时交给准备与调度器 ⇒ **第二次播放是缓存命中**。
* 等待画在 `SamplerLaneStatus`（`src/components/sequencer/SamplerLaneStatus.tsx`），
  **无条件在树里、内容才有条件**——`SequencerPanel` 的兄弟节点数量一变它会整体重挂（该视图自己的注释记着这件事）。
* 失败：`prepareSamplerLanes` 的 `problems` 走 `reportSampledLaneProblems` 进 `sampler-problems`；
  "有东西要准备却一个都没成"⇒ **不启动**。**没有静默降级**。

---

## §4 §106 对照（逐字原句 ＋ 出处）

### 4.1 主流 DAW／网页采样器在走带播放这条路上怎么表示"音源正在载入"

* **smplr** — *"#### Wait for audio loading — You can start playing notes as soon as one sample is loaded. To wait for all of them, await either: `piano.ready` — resolves to `void` (preferred for new code)."* — <https://raw.githubusercontent.com/danigb/smplr/main/README.md>
* **smplr** — *"#### Load progress — Track how many samples have loaded via the `onLoadProgress` option or the `loadProgress` getter: … `total` is known before loading starts, so you can display a determinate progress bar."* — 同上
* **smplr** — *"`fallback`: what to play for a note that wasn't loaded. `"none"` (the default, except for `SplendidGrandPiano`) plays nothing"* — 同上（**失败是一个被报告的状态，不是无限等待**）
* **Tone.js** — 判据级出处是 issue 标题本身：*"[React] Error: buffer is either not set or not loaded"* — <https://github.com/Tonejs/Tone.js/issues/528>（该页正文由 JS 渲染，抓取只拿到标题 ⇒ **只作间接证据**）
* **Tone.js** — 同一条的另一个实例：*"Tone.Sampler onload doesn't fire on successful load - if you attempted an action before load."* — <https://github.com/Tonejs/Tone.js/issues/1327>（同上，仅标题）
* **Ableton Live／Bitwig／Logic／FL／Reaper 的官方手册里"走带处显示采样载入进度"的逐字表述** — **未找到**。
  官方手册能查到的只有 RAM 模式的说明（*"If the RAM Mode switch is on, Live is loading the audio referenced by the clip into the computer's memory rather than reading it…"* — <https://manualzz.com/doc/o/1wngmj/ableton-live-11.0-reference-manual-clip-view#page131#2>），
  而"走带下方那条白色载入条是什么"只有**论坛**在问（<https://www.logicprohelp.com/forums/topic/146759-what-does-the-white-loading-bar-beneath-transport-mean/>）⇒ **间接证据，不作为形状依据**。

### 4.2 "播放中才补齐" vs "先等齐"：主流取舍与已知失败模式

**"先等齐"的失败模式（正是本改动要防的那一侧）**

* MDN，`AudioBufferSourceNode.start()` — *"If `when` is less than `AudioContext.currentTime`, or if it's 0, the sound begins to play at once. **The default value is 0.**"* — <https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start>
  ⇒ 走带先起、字节后到，那些**时间已过**的 onset 会**一起立刻响**（本仓 `samplerLanePrepare.ts` 描述的"先静音后补"突发，机制就是这一行）。

**"先等齐"的相反风险（本改动必须承认的那一侧）**

* Chrome for Developers，Autoplay policy — *"**Note:** If an `AudioContext` is created before the document receives a user gesture, it will be created in the "suspended" state, and you will need to call `resume()` after the user gesture."* — <https://developer.chrome.com/blog/autoplay/>
* 同页 — *"First, it is good practice to wait for a user interaction before starting audio playback so that users are aware of something happening."* — 同上
  ⇒ 在 `resume()` 之前 `await` 一次网络下载，是在"用户手势"与"恢复音频"之间插入了等待；本仓因此保留了 `activeEngine`／`primeAudioContext` 在入口页自己的 tap 里先建上下文的做法。

**本仓自己的取舍记录**（与上述一致，可复核）

* `src/audio/samplerLanePrepare.ts:16` — *"So the order has to be **ready, then start**."*
* `src/audio/playerFromEngine.ts:480` — *"**The transport starts before the samples are resolved.** … Starting after would offset the whole sampler lane by however long the catalogue took to answer"* —— **V2 编排选了相反的一侧**，并写明了理由；本条线**不改它**（`src/audio/**` 只读）。

---

## §5 `?diag=1`：把这两件事做成看得见的面板

`?diag=1` **早已存在**（`src/platform/diagnostics.ts` `installDiagnostics`；`src/platform/debugMode.ts` `debugModeForcedByUrl`），
本改动**扩展**它，加一个 `data-testid="diag-sampler"` 区块：

| 面板项 | 来源 |
| --- | --- |
| 本次播放的入口 ＋ 曲风 | `src/hooks/samplerPlayLedger.ts`（播放时写下的账本） |
| 有采样声部的 lane 清单（lane → 乐器名 → assetId） | `ledgerLanesOf` ＝ `standDownSamplerLanes` ＋ `stepPitches`/`stepVelocity` |
| 每个资产的**源站 URL 与镜像 URL 并排** | 资产自己的 `sfz.url` / `sfz.fallbackUrl` |
| 实际请求结果（200／404）＋ 是否回退到镜像 | ⚠️ **成功路径 loader 不报告是哪个主机答的** ⇒ 面板如实说"未知"，并提供一个**面板自己的**探测按钮（`探测地址`，按需、不随刷新发请求） |

⭐ **这两行并排就是业主那条"源站地址多一层目录"的答案，而且现在能看出修好了**：`karoryfer-emilyguitar` 的字节来自一个顶层是库名的 release zip，
所以**镜像**带那一层（`…/karoryfer-emilyguitar/Emilyguitar/emily_clean.sfz`）而**源站仓库根部是平的**。
源站地址原先照抄了归档的那一层，在自己的 pin 上 404；`a522f1e`（另一条线）让条目声明 `sourcePrefix` 并**只**剥掉这一层
⇒ 面板上两个地址现在**故意不同**：源站不含 `/Emilyguitar/`，镜像含。判据断言的正是这个差异
（`src/test/samplerDiagnostics.test.tsx`："the source address carries the mirror's archive layer, which is the reported 404"）。
| 准备进度 `loaded/total`、`ready`、`problems` | `prepareSamplerLanes` 的返回 |
| 缓存：loader 构建次数／本次解码次数 | `sharedSamplerLoaderBuilds()`、`loader.decodes()` 的前后差 |
| 覆盖：可发按键范围 ＋ 该轨写出范围／超出几个音 | `sampledKeyCoverage` ＋ `notesOutsideCoverage`（引擎逐音判定，不另写一张表） |

**两条铁律**：默认不显示（面板本身只在 `diag=1`／设置开关时安装；没有 reader 时该区块在 DOM 里但一个字都没有）；
**绝不出密钥**（一切字符串来自 catalogue entry 或 loader 自己的消息；面板与账本源码**不读任何环境变量**，判据用 TypeScript 语法树而不是文本扫描来证明）。

### 5.1 ⭐ 两种计数口径，都对，但**不是同一个数**

`docs/SAMPLED_RANGE_COVERAGE.md` §1.1 逐字：

> 本普查只算 `bass`/`chords`/`lead` 三个旋律声部（**202 条**），因为鼓声部由**另一张表**（`src/audio/drumRoles.ts`）决定，且鼓轨不写音高。

⇒ 普查的 `edm-trap = 0`、`delta-blues = 3` 是**旋律声部**口径。**下载集**是**全部被映射的声部**（含鼓）。面板**两个数都显示**：

| 曲风 | 旋律声部（普查口径） | 被映射声部（下载集） | `planSamplerSteps` 计划 | 结论 |
| --- | --- | --- | --- | --- |
| `edm-trap` | **0** | 2（Hi-Hats、Percussion → `virtuosity-drums-basic`） | **0 event**（两轨都不写音高） | **没有要下载的东西（全部走内置合成器）** |
| `delta-blues` | **3**（bass→`dsmolken-double-bass:d-smolken-rubner-bass-pizz`；chords／lead→`karoryfer-emilyguitar:emily-clean`） | 7 | 88 event / 12 distinct note | 有东西要下载，且**它有地址** |
| `bebop` | 3 | 7 | — | ⚠️ 普查当时 lead → `mtg-solo-sax:MTG-Tenor-Sax` 可发 39–76 而 lead 写 82–91（**超出 44 个音**）；rebase 后 `cd8ac53`（另一条线）已把这四行**折回音域内**（bebop lead 现写 58–67）⇒ 面板的覆盖判据改为**用普查那条实例的形状**做夹具（真实资产与地址、fixture 程序 39–76），真实数据由 `src/test/sampledRangeCensus.test.ts` 守 |

---

## §6 判据

* `src/test/studioSamplerLoading.test.tsx`（5 例）—— 可见等待／顺序／`loadNote > 0`／调度器／两个 loader 同一对象＋第二次缓存命中／失败可见不启动／`edm-trap` 不显示等待。
  四条**证红实跑**（改动接线即红）：去掉准备 ⇒ `sampler-loading` 找不到；去掉 `recordedLanes.start` ⇒ 调度器 0 次；去掉 `loaderFor: sharedLoaderFor` ⇒ 两个 loader 不是同一对象；去掉"失败不启动" ⇒ `order = ['engine.play']`。
* `src/test/samplerDiagnostics.test.tsx`（8 例）—— 账本读法（`edm-trap` 旋律 0／`delta-blues` 3 条与两个地址／`bebop` 超出）/ 默认不显示 / 探测 200 & 404 / 源码不读环境变量 / 环境取值不出现在面板与可复制报告里。

---

## §7 未核实

* **"成功加载时到底是源站还是镜像答的"**：`SampleLoader.loadNote` 只回 `{buffer, ratio, samplePath}`，两个地址产出同一个相对路径 ⇒ **loader 层面不可知**。面板如实写"未知"，探测按钮给的是**面板自己请求**的状态，不是播放当时的事实。
* **官方 DAW 手册里"走带处显示采样载入进度"的逐字表述**：未找到（见 §4.1），只用论坛与间接材料，未据此定形状。
* **Tone.js**：只拿到 issue **标题**（页面正文 JS 渲染抓不到），作为间接证据。
