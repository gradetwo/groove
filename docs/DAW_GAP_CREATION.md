# 主流 DAW 的创作流程／音色发现／MIDI 与鼓编程／混音面 —— 逐条对照本仓，以及差距与优先级

> **本文的立场**：全部从**创作者**角度看——每一条事实都要回答"它省掉了创作者的什么动作"。
> **本文的边界**：只写交互与功能的**可核事实**。**不做任何听感判断**（本仓不做听感结论），
> **不凭印象写功能**（查不到就写"未找到"，见 §5），**不把"我没找到"写成"不存在"**。

---

## ① 方法与来源

### 1.1 工作环境（可复核）

* 独立工作树：`/home/crow/music/groove-dawcre`，分支 `daw-creation`，基线 `origin/dev` = **`d036619`**
  （"docs: the two workstreams' corrections and rulings, held for the release window"）；
* 主工作树 `groove-int` **未改动**；本工作树**只新建了本文这一个文件**，未改任何代码、未改 `docs/OPEN_WORK.md`、**未推 `dev`**；
* 所有"本仓"结论都由我在**这个工作树里**跑过命令或读过文件得到，依据写到 `文件:行`。

### 1.2 先读了本仓已有的（不重复劳动）

| 材料 | 它已经建立了什么 | 对本文的作用 |
| --- | --- | --- |
| `docs/research/large-temporary-files-in-mature-tools.md` | 一个**与创作面无关**的调研：scratch 目录该放 `/tmp` 还是 `/var/tmp`，tmpfs 会怎样把机器打死（§28）。全文**不含任何 DAW、乐器、卷帘、混音的内容**，外部出处全是操作系统／语言运行时／数据库／容器／内核文档 | **明确排除**：本文六个维度与它零重叠，不必引用 |
| `docs/research/library-costs-for-the-instrument-gaps.md` | 十三个"曲风写了名字、镜像没有录音"的缺口逐个计价；接受/拒绝的许可证集合；SFZ 加载器支持的 opcode 子集与 `needs` 字段 | 音色来源侧的**既有结论**，本文只在其上谈"人能不能用到" |
| `docs/research/staff-notation-and-musicxml-survey.md` | 记谱渲染与 MusicXML 的选型（推荐 VexFlow 5 + 自写 MusicXML 层；否决 Verovio/OSMD/alphaTab 的理由与体积） | 说明"谱面"这一块的**工具选型**已经做完，本文不重开 |
| `docs/research/string-sustain-and-legato-in-mature-samplers.md` | 成熟采样器怎么处理"sustain 与 legato"（Orchestral Tools、Spitfire、VSL、sfzformat、DecentSampler 的一手原句），以及本仓已有/没有的部分 | 采样器面**已有一手厂商出处**，本文不重复收集 |
| `docs/PRO_EDITOR_PLAN.md` | 目标模型「音符列表是真相、格子是它的视图」；P1 已完成 `noteLayer.ts`；P3 已完成 `noteEdits.ts` 的**纯函数**（量化／摇摆／音阶吸附／移调／统一时值），并明说"**先有定义，再有界面**" | ⭐ 决定了"卷帘深度"一栏里多处是**半有**：定义在、界面不在 |
| `docs/ARRANGEMENT_UI_DESIGN.md` | 编排界面的分区／轨道头／标尺／键盘惯例，逐条带一手手册出处；并**已记下它自己没核实到的**（Studio One 一手手册没取到、Logic 桌面版只有 iPad 版手册、Cubase 读到的是 Elements 13） | 本文的**体例样板**（惯例＋有意不同＋未核实），并提醒"一手材料拿不到就如实写" |
| `docs/AUDIO_TRACKS_AND_SVS_PLAN.md` | 第九种 kind `audio` 的格式半边已完成、播放半边未建；采样目录**发布为空** | 说明"素材工作流"这一栏为什么整体偏空 |
| `docs/GROOVE_QUALITY_PLAN.md` | 音色／响度那一批工作的总计划 | 只在需要时引用，不重复它的听感结论 |
| `docs/OPEN_WORK.md` §82–§90（**只读，未改**） | 调色板的分区、17 个新库零引用、四条可达路径、用量读数、"错的乐器比合成器更糟"的纪律 | ⭐ 音色发现一栏的**本仓基线**；本文对它的**一处更正**见 §3.3 |
| `docs/DAW_GAP_ARRANGEMENT.md`（**是姊妹文档，但不在我的基线上**） | 另一条工作线在**同一基线 `d036619`** 上做的**编排／编辑／交互**调研（时间线交互、键盘工效、撤销、从零到有声、改一个已有想法的成本） | ⚠️ 它**在我 fetch 之后**才落到 `origin/dev`（`2e6de71`／`04c47a9`），所以**我写 §1–§5 时没有读到它**；**边界与那一处重叠见 §6.3** |

### 1.3 本仓有**两条**创作动线，必须分开说

这是全文最重要的一个前提，因为**同一个功能在两个动线上的有无是不同的**：

| 动线 | 路由 | MIDI 编辑面 | 音色选择面 |
| --- | --- | --- | --- |
| **Studio（曲风动线）** | `/studio`（默认；`src/App.tsx:84` 是 `route.genreId \|\| "chicago-house"`） | **`src/components/sequencer/PianoRollLane.tsx`（3240 行，功能最深）** | `src/components/console/InstrumentPicker.tsx`——**乐器名**选择器，不是目录资产 |
| **编排动线** | `/new`（`src/App.tsx:45-46,346`，唯一渲染 `ArrangementViewV2` 的路由） | `src/components/arrangement/PianoRollV2.tsx`（264 行，基础） | `src/components/arrangement/InstrumentLibraryV2.tsx`——**目录资产**选择器 |

⇒ 后文凡是写"本仓有 ✓／半有 ⚠️／没有 ✗"，**都写明是哪条动线**；只说"本仓有"而不说动线，是本文要避免的第一种错。

### 1.4 调研对象与来源分级

* **调研对象**：Ableton Live 12、Logic Pro 11、FL Studio、Bitwig Studio 5、Studio One 6／Pro 7、Cubase 13／14、REAPER 7、GarageBand；**任务书说"有余力再看"的两家也做了**——**Reason 13** 与 **Native Instruments Maschine 3／Komplete Kontrol MK3**（音色发现这块的标杆）。**共 10 张事实卡**，每家六个维度，**每维度都有可引原句或如实写"未找到"**。
* **来源分级**：**一级**＝厂商官方手册／发行说明／产品页；**二级**＝Sound on Sound、MusicRadar 等评论（**已逐条标注**）。每条都带 URL 与**逐字原句**。
* **未拿到一手材料时**：写"未找到"，并在 §5 汇总，**不用二手推测填空**。这与 `docs/ARRANGEMENT_UI_DESIGN.md` §9 的既有做法一致。**§5.1b 专门交代了哪些引文不是"现在的一手页面"**（Studio One 是存档快照、Cubase 有两条是内容 API 地址等）。

### 1.5 这次调研怎么保证"引文是真的"

我没有把这一段做成"信任我"的声明，而是做成一条**可复核的过程**：

1. **一次只做一家**：每家 DAW 一个独立检索任务，六维度都要给 claim＋**逐字原句**＋URL＋"创作者省掉了什么"；找不到就写 `not_found` 并说明。**"未找到"是被允许的答案，编造原句不是**。
2. **引文要回填验证**：写卡的 agent 各自报告把引文**重新取回页面**、按字符验证为**原文子串**（PDF 则按去换行后的文本），并报告不一致数（全部报 0）。这条我采信为**过程说明**，**不当成我自己独立复核的替代**——所以 §2 每一句都仍带 URL，读者可自行打开。
3. **结果落盘、不进上下文**：第一轮我让任务把结果**直接返回**，10 家的结果超出返回上限，**8 家丢了**。第二轮改成**每家把 JSON 写进 `/tmp/dawcre-research/<id>.json`、只返回一行确认**，然后我逐个文件读进来。**这条经验本身值得记**：长调研的产物要落盘，不要指望一次返回。
4. **两次独立检索互相校验**：Logic Pro 11 被检索了两次（第一轮＋第二轮）。第二次补齐了第一轮漏掉的 `Trim > Force Legato`、插件窗口 `Compare`、`Convert Regions to New Sampler Track` —— **其中"插件窗口 A/B"第一轮报的是"未找到"，第二轮找到了**。这件事我写进 §2.2 与 §5.1 作为**更正**，因为"我这次没查到"与"不存在"是两件不同的事。
5. **不做听感判断**：全文没有一句"听起来更好／更暖／更真实"。**一条都没有**。

---

## ② 逐 DAW 事实卡

> 每张卡按六个维度排列：**钢琴卷帘 / 鼓编程 / 音色发现 / 采样器与素材 / 混音面 / 从零到一个想法**。
> 每条格式：**claim（一句可核事实）** → `"逐字原句"`（URL）→ **创作者省掉了什么**。
> `status` 三态：`found`＝拿到了可引原句；`partial`＝只拿到一部分；`not_found`＝没找到（写进 §5）。

### 2.1 Ableton Live 12

**钢琴卷帘 — `found`**

* **折叠到音阶**：`"When a scale is active in a clip, another folding option becomes available: Fold to Scale, toggled by pressing the Scale button in the Clip View header, by pressing the G shortcut key while the MIDI Note Editor is in focus, or via the View menu entry. Activating the Fold to Scale option will immediately hide all key tracks that do not belong to the scale specified for the clip."`（<https://www.ableton.com/en/live-manual/12/editing-midi/>）
  ⇒ 创作者**少了**：自己数音阶里有哪些音、手动隐藏不在调上的行。
* **和弦生成（Stacks MIDI Tool）**：`"Stacks is a MIDI Tool you can use to add individual chords or create chord progressions within a selected scale. The generated chords fill time selection or the length of the loop if there is no time selection."`（<https://www.ableton.com/en/live-manual/12/midi-tools/>）
  ⇒ **少了**：把进行一个个弹进去或画进去。
* **概率（chance）**：`"Play All — all notes are played with the probability value set with a probability marker. Play One — only one note in the group is played at a time, according to the set probability."`（<https://www.ableton.com/en/live-manual/12/editing-midi/>）
  ⇒ **少了**：每一遍亲手挑这一叠音里哪一个响。
* **人性化力度**：`"The Velocity Deviation slider can be used to set a range for each note's velocity. Velocity values are then chosen randomly from within the specified range each time a note is played."`（同上）
  ⇒ **少了**：逐个音改力度。
* **扫弦**：`"The Strum MIDI Tool adjusts the start times of notes in a chord following a shape set by the Strum Low, Strum High and Tension parameters."`（<https://www.ableton.com/en/live-manual/12/midi-tools/>）
  ⇒ **少了**：为了做出扫弦感而逐个音推时间。
* **多片段同时编辑**：`"In the MIDI Note Editor, you can view and access notes in multiple MIDI clips at the same time. This helps you to see melodic and rhythmic relationships between different clips when creating and refining musical ideas, and allows you to edit material across separate tracks and scenes more quickly."`（<https://www.ableton.com/en/live-manual/12/editing-midi/>）
  ⇒ **少了**：一个 clip 一个 clip 打开来对照。

**鼓编程 — `found`**

* **拖到 pad 自动建链**：`"Almost any object from Live's browser — samples, effects, instruments and presets — can be dragged onto a pad, mapping automatically to the pad's note and creating or reconfiguring internal chains and devices as necessary. Dropping a sample onto an empty pad, for example, creates a new chain containing a Simpler, with the dropped sample ready to play from the pad's note."`（<https://www.ableton.com/en/live-manual/12/instrument-drum-and-effect-racks/>）
  ⇒ **少了**：手工把一个音色挂到某个音高上、再建采样器。
* **Choke 组**：`"The Choke chooser allows you to set a chain to one of sixteen choke groups. Any chains that are in the same choke group will silence the others when triggered."`（同上）
  ⇒ **少了**：为了让开镲被闭镲掐断去改音符长度或画静音。
* ⭐ **从音频提取 groove，再套到别处**（本文点名要的那一条）：
  * 提取：`"The timing and volume information from any audio or MIDI clip can be extracted to create a new groove. You can do this by dragging the clip to the Groove Pool or via the Extract Groove command in the clip's context menu."`（<https://www.ableton.com/en/manual/using-grooves/>）
  * 套用：`"The easiest way to work with library grooves is to drag and drop them from the browser directly onto clips in your Set. This immediately applies the timing characteristics of the groove file to the clip."`（同上）
  ⇒ **少了**：把一段录进来的感觉靠耳朵在卷帘里逐个音推回去——**先"取出来"变成一个可复用的文件，再"套"到别的 clip 上**。
* **步进式节奏生成**：`"Use the Steps control to set the number of steps in the pattern, up to 16 steps."`（<https://www.ableton.com/en/live-manual/12/midi-tools/>）
  ⇒ **少了**：一个音一个音画鼓型。
* （`notFoundNote`）**Live 12 桌面版手册里没有 Drum Rack 自己的网格步进器**——步进音序器在 Push 硬件上，不在这本手册范围。

**音色发现 — `found`**（本文最重要的一栏）

* **标签组织 + 厂商元数据进标签**：`"All of Live's factory content (i.e., content from the Core Library and Live Packs that come with each Live edition) is tagged with a set of descriptive tags. Content from the third-party Packs available in the Ableton webshop is tagged with the tags contained within the "Sounds" filter group."` / `"Live also assigns tags based on VST3 meta data to VST3 plug-ins in cases where the plug-ins use a VST Sub Category that maps to one of Live's categories."`（<https://www.ableton.com/en/live-manual/12/working-with-the-browser/>）
  ⇒ **少了**：记住某个音色在哪个文件夹，以及去第三方厂商的目录里翻。
* **收藏**：`"These labels enable you to quickly organize and access particular browser items (for example, your favorite or most-used items)."`（同上）
  ⇒ **少了**：每个工程重新找一遍惯用音色。
* **相似音色搜索**：`"You can also right-click an item and select Show Similar Files or use the Ctrl Shift F (Win) / Cmd Shift F (Mac) shortcut to view this list. The reference file will be shown in the search field and all relevant similar sounding items will be listed below it, ordered from most to least similar."`（<https://www.ableton.com/en/live-manual/12/live-concepts/>）
  ⇒ **少了**：手上已经有一个想要"像它"的音色时，在浏览器里漫无目的地翻。
* ⭐ **试听不打断播放**：`"By default, the Raw button is deactivated, which allows Live to preview files at the beginning of the next bar when transport is running."`（<https://www.ableton.com/en/live-manual/12/working-with-the-browser/>）
  ⇒ **少了**：每试一个候选音色就停一次正在放的工程——**预览落在下一小节上，音乐不停**。
* **拖预设到轨道上会发生什么**：`"You can also double-click a preset in the browser to load it onto a selected track, or drag and drop a preset from the browser onto a track's title bar or device chain."`（<https://www.ableton.com/en/live-manual/12/working-with-instruments-and-effects/>）
  ⇒ **少了**：先建轨、再把音色接进去。
* （同章未逐条引用）Hot-Swap（`Q`）：把轨道上**已有**的设备直接连到浏览器上换音色；用户样本的自动打标（≤60 s 的样本定期分析）；新预设默认存进**当前 Project**。

**采样器与素材 — `found`**

* **切片**：`"Slicing Playback Mode non-destructively slices the sample so that the individual slices can be played back chromatically. You can create and move slices manually, or choose from a number of different options for how Simpler will automatically create slices."`（<https://www.ableton.com/en/live-manual/12/live-instrument-reference/>）
  ⇒ **少了**：把 break 切好再一个个映射到键上。
* **切片直接变鼓组**：`"When working in Slicing Playback Mode, two additional context menu options are available: Slice to Drum Rack replaces the Simpler with a Drum Rack in which each of the current slices is split onto its own pad. Slice to New MIDI Track is similar, but this creates an additional track containing a Drum Rack rather than replacing the current Simpler."`（同上）+ `"A Drum Rack will be added to the newly created track, containing one chain per slice. Each chain will be triggered by one of the notes from the clip, and will contain a Simpler with the corresponding audio slice loaded."`（<https://www.ableton.com/en/live-manual/12/converting-audio-to-midi/>）
  ⇒ **少了**：自己建 rack、建 chain、挂 Simpler、写触发音符。
* **One-Shot 模式**：`"In One-Shot Playback Mode, the left and right flags set the available playback region, as they do in Classic Mode, but there are no Loop or Length controls."`（<https://www.ableton.com/en/live-manual/12/live-instrument-reference/>）
  ⇒ **少了**：为了"只响一次"去裁采样。
* **从音频（或编排里的 clip）直接做乐器**：`"Samples can be dragged into Simpler either directly from the browser, or from the Session or Arrangement View in the form of clips. In the latter case, Simpler will use only the section of the sample demarcated by the clip's start/end or loop markers."`（同上）
  ⇒ **少了**：把音频导出来再导进去。
* （同章未逐条引用）Slice By 选择器（Transient／Beat／Region／Manual）；Loop 开关与 snap-to-zero-crossing；Sampler 的 Zone Editor（Key Zones／Velocity Zones／Sample Select）。

**混音面 — `found`**

* **编排视图内就能开混音台**：`"The mixer can be opened using the Mixer command in the View menu or the shortcut Ctrl Alt M (Win) / Cmd Option M (Mac). You can also show/hide the mixer using the mixer view control in the bottom right corner of Live's window."`（<https://www.ableton.com/en/live-manual/12/arrangement-view/>）
  ⇒ **少了**：为了够到推子和送出而切到 Session View。
* **送出/返回可见性由用户控制**：`"Note that you can hide and show the return tracks using the Return Tracks entry in the Mixer Controls submenu within the View menu."`（<https://www.ableton.com/en/live-manual/12/mixing/>）
  ⇒ **少了**：返回轨不需要时白占屏幕。
* **Metering**：`"The Meter shows both peak and RMS output levels for the track. While monitoring, however, it shows peak and RMS input levels."`（同上）
  ⇒ **少了**：为了看峰值和平均值再挂一个表头插件。
* **FX 链顺序**：`"You can drop audio effects in at any point in an audio track's device chain, keeping in mind that the order of effects determines the resulting sound."`（<https://www.ableton.com/en/live-manual/12/working-with-instruments-and-effects/>）
  ⇒ 明确了一件事：**位置本身**决定结果，不只是挂了哪些。
* **A/B 对比**：`"Every built-in Live device includes two device states, A and B, which can store separate parameter values. This lets you save and compare the changes you make when creating or editing presets."`（同上）
  ⇒ **少了**：为了试一个改动而把调好的设置覆盖掉。
* **自动化**：`"Automation can be recorded in Session clips or in Arrangement tracks. You can also create new automation envelopes without recording, or edit existing ones."`（<https://www.ableton.com/en/live-manual/12/automation/>）
  ⇒ **少了**：非得现场演一遍才能录下参数变化。
* （同章未逐条引用）每个返回轨有 Pre/Post 开关；混音台可拉伸（刻度、数值音量框、可重置峰值指示、dB 刻度）。

**从零到一个想法 — `found`**

* **默认集当模板**：`"Use the File menu's Save Live Set As Default Set… command to save the current Live Set as the default template. Live will use these settings as the initialized, default state for new Live Sets."`（<https://www.ableton.com/en/live-manual/12/managing-files-and-sets/>）
  ⇒ **少了**：每首新歌重新搭一遍轨道布局与设备。
* **一次拖拽建轨并放入内容**：`"Dragging and dropping content from the browser into the space to the right of Session View tracks or below Arrangement View tracks will create a new track and place the new item(s) there."`（<https://www.ableton.com/en/live-manual/12/working-with-the-browser/>）
  ⇒ **少了**：先建轨再想放什么。
* **按键找回刚弹的**：`"To capture the MIDI notes you just played, press the Capture MIDI button."`（<https://www.ableton.com/en/live-manual/12/recording-new-clips/>）
  ⇒ **少了**：因为没按录音键而重弹一遍。
* **生成式音符**：Seed MIDI Tool 在指定音高／长度／力度范围内随机生成音符（<https://www.ableton.com/en/live-manual/12/midi-tools/>）。
  ⇒ **少了**：从白纸开始写一个声部。
* （`notFoundNote`）**手册里没有"空工程→出声"的精确步数**；上面每一条都只描述**一个动作**。

### 2.2 Logic Pro 11

**钢琴卷帘 — `partial`**

* **音阶吸附**：`"In Logic Pro for Mac, you can quantize the pitch of notes in MIDI regions to a particular scale or key."`（<https://support.apple.com/guide/logicpro/quantize-the-pitch-of-notes-lgcpf4f544d2/11.0/mac/13.5>）
  ⇒ **少了**：为了让一个声部入调而重弹或手动移调。
* **和弦轨的"音阶"决定填充音**：`"Each chord has a scale that determines which non-chord tones the Session Player can play over the chord—for example, in fills."`（<https://support.apple.com/guide/logicpro/edit-chords-lgcp5bdc8ead/11.0/mac/13.5>）
  ⇒ **少了**：亲手筛掉经过音与加花音。
* ⭐ **卷帘里能看见自动化**：`"In Logic Pro, click the Show/Hide Automation button in the Piano Roll Editor menu bar."`（<https://support.apple.com/guide/logicpro/automationmidi-area-in-the-piano-roll-editor-lgcpa90a61bf/11.0/mac/13.5>）
  ⇒ **少了**：切到 Tracks 区的自动化车道，凭记忆把曲线和音符对齐。
* **力度工具**：`"Drag over a note vertically with the Velocity tool."`（<https://support.apple.com/guide/logicpro/edit-note-velocity-lgcpa8fee137/11.0/mac/13.5>）
  ⇒ **少了**：去 Event 列表或检查器里改力度。
* **人性化**：MIDI Transform 预设 Humanize：`"Adds a random value to the position, velocity, and length of selected note events."`（<https://support.apple.com/guide/logicpro/midi-transform-window-presets-lgcp215831be/11.0/mac/13.5>）
  ⇒ **少了**：为了去掉量化感而逐个音手工推。
* **多 region 同时编辑**：`"Shows the notes in the MIDI region or regions as bars on a time grid."`（<https://support.apple.com/guide/logicpro/piano-roll-editor-interface-lgcpc788b136/11.0/mac/13.5>）
  ⇒ **少了**：对齐几个声部时一开一关卷帘。
* **Legato 在菜单里（Force Legato）**：`"Note End to Selected Notes (Force Legato): Trim the end of the selected notes to the start of the other notes in the selection."`（<https://support.apple.com/guide/logicpro/lgcpa90a4474/11.0/mac>）
  ⇒ **少了**：为了补上连奏线里的缝而逐个拖音符的尾巴。
* （`notFoundNote`）**没找到**：Logic 11 卷帘的**折叠视图**；卷帘里**音符级概率／条件触发**（概率只记在 Step Sequencer 的 Chance 编辑模式上）。Legato 记在 region 参数 `Gate Time: legato`，另在 Edit > Trim 子菜单里有 Force Legato 命令（上一条）；琶音／和弦生成是**独立的 MIDI 插件**（Arpeggiator、Chord Trigger），不是卷帘内的命令。

**鼓编程 — `found`**

* **每步独立参数**：`"You can adjust a wide range of parameters for individual steps, including velocity, pitch, gate time, and more; and edit pattern and row settings including pattern length, row loop start and end points, playback position, and rotation."`（<https://support.apple.com/guide/logicpro/step-sequencer-overview-lgcp39acefc9/11.0/mac/13.5>）
  ⇒ **少了**：在卷帘里手工做每一击的力度与时长。
* **每步概率（Chance）**：`"Drag vertically in the step to set the Chance percentage. Chance controls the probability that the step plays each time the pattern repeats."`（<https://support.apple.com/guide/logicpro/use-edit-modes-lgcpf8b9a06c/11.0/mac/13.5>）
  ⇒ **少了**：为了让 loop 不每遍都一样而手写变化遍。
* **Choke 组（叫 Exclusive Group）**：`"Choose a group for the pad. You can assign multiple pads to the same group. As soon as one drum sound in the group is triggered, all other sounds in that same group are stopped."`（<https://support.apple.com/guide/logicpro/use-pad-controls-lgcpdcdd1d7a/11.0/mac/13.5>）
  ⇒ **少了**：为了让踩镲互相掐断而去裁音符长度。
* **Swing**：`"The most practical settings fall between 50% and 75%, imparting a swing feel to strictly quantized (or tightly played) audio or MIDI regions."`（<https://support.apple.com/guide/logicpro/midi-region-parameters-lgcpf7c0d270/11.0/mac/13.5>）
  ⇒ **少了**：为了得到摇摆感而重录一遍。
* ⭐ **从音频提取 groove，再套到别处**：
  * 提取＋套用：Region inspector > Quantize > Make Groove Template（**音频源需要 Flex 打开**）：`"You can even take the feel of an audio region and apply it to a MIDI region—helping a MIDI clavinet part to sit well with a funk guitar Apple Loop, for example."`（<https://support.apple.com/guide/logicpro/create-groove-templates-lgcp3fe6a76e/11.0/mac/13.5>）
  * **一条轨当 groove master**：`"You can set a track as a groove track, and match (synchronize) the timing of other tracks in the project to it."`（<https://support.apple.com/guide/logicpro/control-timing-with-the-groove-track-lgcp9a69ce11/11.0/mac/13.5>）
  ⇒ **少了**：靠耳朵把每个 region 推到"跟着鼓走"的位置——**音频的感觉可以射到 MIDI 上，也可以让整条轨跟着一条轨走**。
* （`notFoundNote`）**没找到**："groove pool 预设浏览器"这个形态；也没找到"choke group"这个词——同一个行为记在 Drum Machine Designer 的**共享 Exclusive Group** 上。

**音色发现 — `partial`**

* **Library：左分类、右音色**：`"Categories appear on the left, and patches for the selected category are displayed on the right."`（<https://support.apple.com/guide/logicpro/library-interface-lgcpe9cc40af/11.0/mac/13.5>）
  ⇒ **少了**：在一个长平列表里滚。
* **Loop Browser 的列视图 + 收藏**：`"Click the Column View button to see a standard column file directory that is hierarchically separated into All, Favorites, Genres, Instruments, and Moods search criteria."`（<https://support.apple.com/guide/logicpro/search-for-apple-loops-lgcp07b16ec8/11.0/mac/13.5>）
  ⇒ **少了**：每个工程重新搜同一批 loop。
* **Alchemy 的属性列**（按用途／音色／作者检索）：`"Show the articulation, Genre, Newer Than, Older Than, Sound Designer, Sound Library, Timbre, or User Tags attributes."`（<https://support.apple.com/guide/logicpro/browser-results-list-lgsib5617451/11.0/mac/13.5>）
  ⇒ **少了**：只凭预设名去猜哪个是想要的音色、哪个是某位设计师做的。
* ⭐ **试听不打断**：`"When you listen to a loop, you can hear it by itself (solo), or play it together with the project."`（<https://support.apple.com/guide/logicpro/play-apple-loops-lgcp8bbaa7ea/11.0/mac/13.5>）
  ⇒ **少了**：为了"放在上下文里听"先把 loop 导进工程。
* **音色试听方式**：`"You can audition patches by clicking them, then playing your connected instrument."`（<https://support.apple.com/guide/logicpro/search-for-patches-by-name-lgcp462df305/11.0/mac/13.5>）
  ⇒ **少了**：把 patch 装到轨上再撤销，只为听一下。
* ⭐ **预设与工程的一致性（Patch Merging）**：`"When you choose a different patch from the Library, only those settings corresponding to the selected buttons are changed, while other settings remain unaltered."`（<https://support.apple.com/guide/logicpro/merge-patch-settings-with-the-current-patch-lgcpfba5d289/11.0/mac/13.5>）
  ⇒ **少了**：每换一次音色就重建一遍效果链。
* （`notFoundNote`）**没找到**：Logic 11 Library／Loop Browser 的**相似音色搜索**与**厂商维度浏览**；也**没有任何页面描述"把 patch 拖到轨道上"**——手册里的拖放讲的是内容（音频文件、region、Apple Loop、套鼓件），拖进去会建对应类型的轨或替换套鼓件。

**采样器与素材 — `found`**

* **可视化切片**：`"Slice marker: Shown in Slice mode. Drag any yellow slice marker to set its position. Click between slice markers to create a new slice marker."`（<https://support.apple.com/guide/logicpro/quick-sampler-waveform-display-lgcp4492eed9/11.0/mac/13.5>）
  ⇒ **少了**：在外置编辑器里切完再导回来。
* **循环点可视化＋按住就循环**：`"Loop start and end markers: Drag the yellow loop start or end marker to set loop boundaries. Playback cycles between these markers when you hold a note."`（同上）
  ⇒ **少了**：靠反复播放用耳朵找循环边界。
* **自动映射到键位**：`"Sampler (Zone Per Note) creates a software instrument track with a Sampler instrument plug-in with a zone for each detected note in the audio file."`（<https://support.apple.com/guide/logicpro/create-tracks-using-drag-and-drop-lgcpd1e675e5/11.0/mac/13.5>）
  ⇒ **少了**：把每个采样手工铺到键盘上。
* **从音频直接做乐器**：`"Dragging content to the Drum Machine Designer zone creates a software instrument track with a Drum Machine Designer instrument plug-in using the sliced audio content, and a MIDI region to trigger the slices."`（同上）
  ⇒ **少了**：把 loop 切成一击一击，再手写一条触发它的 MIDI。
* **切片变套鼓**：`"Individual audio slices are automatically mapped to pads in Drum Machine Designer, and you can edit, replace, process, or route these as you like."`（<https://support.apple.com/guide/logicpro/quick-sampler-waveform-display-lgcp4492eed9/11.0/mac/13.5>）
  ⇒ **少了**：一个一个 pad 地搭套鼓。
* **把若干区段自动铺成多重采样**：`"All selected regions are sequentially mapped—in accordance with their timeline positions—to the specified key range, starting with the lowest note."`（<https://support.apple.com/guide/logicpro/lgcp0af84e31/11.0/mac>）——`Convert Regions to New Sampler Track`；单个区段还能按分析出的瞬态位置映射切片。
  ⇒ **少了**：从一堆录下来的区段一个音一个音地搭多重采样映射。
* **拖音频到轨头之间会问要用哪个乐器**：`"You can create a new sample-based software instrument track by dragging an audio file, audio or software instrument region, or Apple Loop to the area below the track headers in the Tracks area, or between two existing tracks."`（<https://support.apple.com/guide/logicpro/lgcpd1e675e5/11.0/mac>）——弹窗给 Quick Sampler／Sample Alchemy／Drum Machine Designer／Sampler 四个选择。
  ⇒ **少了**：当一段音频就该变成一个乐器时，先载入空采样器再手工导入。
* （`notFoundNote`）One Shot／Slice 的标记编辑有据；**循环点编辑**只以"Optimized 导入时自动加上的 loop 与 crossfade 标记"的形式存在，**没有**单列一个专门的循环点／交叉淡化编辑页。

**混音面 — `found`**

* **只显示有送出的通道**：`"In Logic Pro, choose View > Channels with Sends Only in the Mixer menu bar."`（<https://support.apple.com/guide/logicpro/change-the-mixer-view-lgcp583779d6/11.0/mac/13.5>）
  ⇒ **少了**：在大混音台里滚着找"哪条轨在喂这个效果"。
* **FX 链顺序：直接拖**：`"In a Logic Pro channel strip, drag the plug-in up or down in the channel strip, or to another channel strip."`（<https://support.apple.com/guide/logicpro/add-remove-move-and-copy-plug-ins-lgcp7989b5cd/11.0/mac/13.5>）
  ⇒ **少了**：为了换顺序而删掉再重新插入。
* **通道条上的自动化模式**：`"Automation Mode button: Sets how channel strip and plug-in changes are handled during recording and playback."`（<https://support.apple.com/guide/logicpro/channel-strip-controls-lgcpbc219210/11.0/mac/13.5>）
  ⇒ **少了**：去每条轨的轨道头逐一设自动化模式。
* **Metering**：`"Peak level display: Updates during playback to show the highest peak level reached. A red display indicates signal clipping."`（同上）
  ⇒ **少了**：只为了看峰值和削波而插一个表头插件。
* **A/B 对比（两处）**：Smart Controls 的 `Compare`：`"In Logic Pro for Mac, click the Compare button in the Smart Controls menu bar."`（<https://support.apple.com/guide/logicpro/compare-smart-control-edits-saved-settings-lgcp691a47ec/11.0/mac/13.5>）；**插件窗口自己也有一个**：`"Click the Compare button to listen to the setting that was originally saved with the project."`（<https://support.apple.com/guide/logicpro/lgcp4dcb0092/11.0/mac>）
  ⇒ **少了**：为了听改动前后的差别而存一份 patch 再读回来。
* **编排→混音 1 步**：`"Choose View > Show Mixer (or press X)."`（<https://support.apple.com/guide/logicpro/mixer-interface-lgcpe9cc43f6/11.0/mac/13.5>）
  ⇒ **少了**：为了够到电平与送出再开一个混音窗口或 screenset。
* （`notFoundNote`）**⚠️ 一处更正**：我第一遍**没找到**插件窗口内的 A/B 对比，第二遍在另一页找到了上一条那个 `Compare` 按钮 ⇒ **"我这次没查到"不能写成"不存在"**（这正是本文 §5 存在的理由）。仍然**没找到**：在混音台里画自动化曲线的说明。

**从零到一个想法 — `found`**

* **Project Chooser（⌘N）**：`"In the Project Chooser, you can choose a template to use as the starting point for a new project."`（<https://support.apple.com/guide/logicpro/create-projects-lgcpce0f09d9/11.0/mac/13.5>）
  ⇒ **少了**：从空工程开始设速度、建轨、找音色。
* **点一下就有能播的格子**：`"To open a Live Loops starter grid: Click Live Loops Grids."`（同上）
  ⇒ **少了**：在能听到任何东西之前先凑 loop 和场景。
* ⭐ **三步得到一条能播的 Session Player 声部**：`"In the New Tracks dialog, choose Drummer, Bass Player, or Keyboard Player."`（<https://support.apple.com/guide/logicpro/session-players-overview-lgcpbf624405/11.0/mac/13.5>）——`Track > New Tracks`（⌥⌘N）→ 选 Drummer／Bass Player／Keyboard Player → Create，得到一条软件乐器轨与一个 8 小节 region。
  ⇒ **少了**：在听到一个想法之前先写并录一条伴奏。
* ⭐ **没有和弦时自动写入 8 小节默认进行**：`"If there are no chords on the Chord track, a default eight-bar chord progression is added (unless you deselected the Use default chord progression for new regions checkbox)."`（同上）
  ⇒ **少了**：为了能听到第一个音而先写一条和弦进行。
* **从 Loop Browser 拖一条成品演奏**：拖 Session Player loop 到 Tracks 区空白处会新建一条软件乐器轨并把 loop 放进去（同上）。
  ⇒ **少了**：自己写一条能听的声部。

### 2.3 FL Studio

> 来源：Image-Line 官方在线手册（`image-line.com/fl-studio-learning/...`）。

**钢琴卷帘 — `found`**

* **吸附到音阶**：`"Snap to scale (Left-Click) – To select and deselect snap to Key or Scale. (Right-Click) to choose scales as explained here."`（<https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll.htm>）
  ⇒ **少了**：自己去算哪些音在调上。
* **和弦印章**：`"Chord Stamp – The Chord Stamp Tool lets you quickly add chords to the Piano roll without manually constructing them. Choose a chord type from the Stamp menu, then click in the Piano roll to place the chord at the clicked pitch and time position."`（同上）
  ⇒ **少了**：手叠三个以上的音再挪到正确音高。
* **随机化力度／声像／音高**：`"Levels - These wheels lets you select the note properties you want randomized and the amount of randomization (this applies to the note levels only, not automation events!)."`（<https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/pianoroll_random.htm>）
  ⇒ **少了**：一个音一个音画力度和声像来去掉机械感。
* **人性化（含扫弦时间）**：`"Humanize - Note onset and offset variations designed to mimic human playing and strumming."`（<https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll_chordprogression.htm>）
  ⇒ **少了**：逐个音推起点、画力度来伪造人手的扫弦。
* （`notFoundNote`）**没找到**卷帘里的概率／条件触发；**没找到**折叠／多片段卷帘模式——最接近的是 Ghost Notes（`Alt/Opt+V`）显示别的 Channel／Pattern 的音符，以及 Editable ghosts（`Ctrl+Alt/Opt+V`）。

**鼓编程 — `found`**

* **步进格**：`"Each button (step) in the grid represents a 16th note."`（<https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/channelrack.htm>）
  ⇒ **少了**：只想要一个 16 步循环时，还得把鼓写成卷帘里的音符。
* **Choke（Cut / Cut by）**：`"Cut self - Applies only to the Stepsequencer (See NOTE). Cuts the sound of previous notes in the Channel when new one starts. Most commonly used with percussion samples e.g. A closed Hi-Hat cutting an open Hi-Hat sample."`（同上）
  ⇒ **少了**：手工裁开镲，让它在下一个闭镲响的瞬间停住。
* **摇摆（全局＋逐通道）**：`"Set swingmix for selected - Sets the 'Miscellaneous Channel Settings > Time > Swing' for the selected Channel/s. This allows you to quickly and independently adjust the swing for the selected Channel/s, since by default the Swing Mix is set to 100% for all Channels, and so they all respond to the Global Swing setting."`（同上）
  ⇒ **少了**：逐个把反拍上的步推开来做 shuffle，也**少了**"所有鼓通道被迫同样摇摆"。
* **从音频取感觉再套到别处（`.groovepat`）**：`"Load a groove to quantize or shuffle an existing beat, for example."`（<https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/plugins/Newtime.htm>）——在 NewTime 里把标记位置存成 `.groovepat` Groove Pattern，再载到别的音频上，由 Groove 旋钮移动 Groove 类型标记。
  ⇒ **少了**：为了跟上第一段 loop 的摇摆感，把第二段 loop 的每一击重新对时。
* （`notFoundNote`）**没有**别的 DAW 那种具名 "groove pool"：摇摆是 Global Swing／Swing Mix，groove 模板是 NewTime 里存取的 `.groovepat` 文件，**不是一个工程级的 groove 库**；也**没找到**"从音频 clip 提取 groove 套到 MIDI"的独立命令。

**音色发现 — `found`**

* **浏览器分页**：`"There are several (user editable) tabs along the top. By default these include All, Current Project, Plugin Database, Online Content and Starred (Favorites)."`（<https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/browser.htm>）
  ⇒ **少了**：在操作系统文件夹里翻插件数据库、本工程用过的音、以及自己的收藏。
* **标签＋收藏**：`"Favorite - Adds the content to the Starred / Favorite Tab."`（同上）
  ⇒ **少了**：记住一个能用的 kick 来自哪个包。
* ⭐ **试听不打断**：`"Swap samples while the Project is playing."`（同上）——`Shift+↑/↓` 在文件夹里逐个走，并把它们送到选中的通道或插件上。
  ⇒ **少了**：每试一个候选采样就停一次播放、丢掉正在试听的音乐上下文。
* **相似音色搜索**：`"Find similar samples - Shows a list of samples with a similar sound. The similarity search includes both tone and rhythm."`（同上）
  ⇒ **少了**：只有一个模糊想法时在采样库里盲滚。
* （`notFoundNote`）"预设与工程一致"只**部分**有据：手册只说自动 time-stretch／pitch-shift 是**按工程**的、不随采样存在本地；**没有**更宽的"预设跨工程一致"保证。也**没找到**超出"音色／节奏相似 + 标签过滤"的按用途搜索。

**采样器与素材 — `found`**

* **切片**：`"Slicex uses advanced beat detection algorithms to slice song/percussion samples into pieces and make them independently playable from the Piano roll or controller. If the wave file contains slice/region data this will be automatically used instead of the beat-detection algorithm."`（<https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/plugins/Slicex%20Keyboard.htm>）
  ⇒ **少了**：把鼓 loop 手工切成一个个文件才能重排它的击打。
* **切片自动落到键位＋一键写成音符**：`"Dump score - Dumps the current slices to the Piano roll as a note sequence."`（<https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/plugins/Slicex%20Editor.htm>）
  ⇒ **少了**：为了听到"原 loop 用音符演奏一遍"，手工写每个触发音符。
* **可视化拖切片标记**：`"Moving Slice Markers - (Left+Click) the Marker Flags and drag."`（<https://cluster.image-line.com/fl-studio-learning/fl-studio-online-manual/html//plugins/Fruity%20Slicer%202.htm>）
  ⇒ **少了**：只能接受自动检测的切点。
* **循环点可视化**：`"Set loop (Alt+L) - Defines the selected region as a loop. Special red loop markers will appear."`（<https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/plugins/Slicex%20Editor.htm>）
  ⇒ **少了**：只为给一个 one-shot 设循环点就导出到外置编辑器。

**混音面 — `found`**

* **10 个效果槽＋顺序**：`"Each Track has 10 effects slots. NOTE: If you need more than 10 Effects, use the 'Send' feature to route the Output of one Mixer Track to another OR load Patcher in one of the slots."`（<https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/mixer.htm>）
  ⇒ **少了**：猜处理顺序——槽位栈本身就显示谁先碰音频。
* **送出是推子后**：`"The Send switches in FL Studio's Mixer take the audio after the Mixer Track fader, so this is known as a post-fader send."`（同上）
  ⇒ **少了**：猜一个混响返回是不是跟着通道推子，也**少了**为了做推子前送出而自己接线。
* **参数自动化**：`"Automation - Right-Click and select 'Create automation clip or 'Link to controllers'."`（同上）
  ⇒ **少了**：手画一遍推子移动。
* **A／B：一键旁通整条链**：`"Mixer Track FX master switch - Left-click - Enable/disable all effects for the selected Mixer Track."`（同上）
  ⇒ **少了**：为了听干声把一个一个插件依次旁通。
* （`notFoundNote`）混音台上**没有**专门的 A／B 快照或对比预设按钮；对比靠上条的总开关，另外只有 FL Cloud 母带渲染有对比窗口。**没有**记载编排→混音的点击数，只有快捷键：`View` 菜单写 `Mixer (F9)`。

**从零到一个想法 — `found`**

* **模板**：`"New from template - Contains a submenu with a selection of different templates - Genre, Minimal, Other and Utility."`（<https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/menu_file.htm>）
  ⇒ **少了**：每次从空工程搭路由与乐器骨架。
* **Loop Starter ＋ 骰子**：`"Click the Dice Icons - Click the large Dice icon at the top to randomize all loops and one-shots."`（<https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/channelrack.htm>）
  ⇒ **少了**：在听到任何东西之前一个一个地找并加载 kick／snare／hat／loop。
* **一键把想法送进播放列表**：`"Send to Playlist (Toolbar) - Sends the loop to the Playlist. If the Playlist is empty the loop will be sent to the start of the project."`（同上）
  ⇒ **少了**：为了让播放列表能按播放而手工把生成的 loop 摆进时间线。
* **和弦进行工具开箱即有 4 个和弦**：`"When you open the tool you will get a 4 Chord Progression. Press Play to hear it or (Alt/Opt+Right-Click) click on Chords to preview them in any order."`（<https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/pianoroll_chordprogression.htm>）
  ⇒ **少了**：为了听到一个音乐想法而先想出一条和弦进行。
* （`notFoundNote`）手册**没有**给出"空工程→出声"的总步数；记下的入口是模板子菜单、Loop Starter 的"选风格→骰子→Send to Playlist"、以及和弦进行工具的"打开即播放"。

### 2.4 Bitwig Studio 5

> 来源：Bitwig 官方用户指南（`bitwig.com/userguide/latest/`，v5.3）。

**钢琴卷帘 — `found`**

* **Legato 一键**：`"Make Legato adjusts the length of each selected note event so that it (or the chord it is a part of) ends immediately before the next event begins, creating a continuous series of events."`（<https://www.bitwig.com/userguide/latest/event_menu_functions_0>）
  ⇒ **少了**：把每个音的尾巴一个个拖到贴着下一个音。
* **量化里带 Humanize**：`"Humanize: Amount of randomness added to the quantize function, with the intention of mimicking human imperfection."`（同上）
  ⇒ **少了**：把音一个个推离网格来去掉机械感。
* ⭐ **每个音符自带 Chance（概率）**：`"Chance expressions represent the likelihood that any note will be played (see Chance)."`（<https://www.bitwig.com/userguide/latest/working_with_note_events>）
  ⇒ **少了**：为了做出变化，每一遍手删再手画音符。
* **分层编辑（多 clip／多轨一起编辑）**：`"But once we have chosen that mode, entering layered editing mode allows us to view and edit several clips or tracks together."`（同上）
  ⇒ **少了**：在对齐互相咬合的声部时一个 clip 一个 clip 地翻。
* （`notFoundNote`）**没找到**卷帘自身的音阶高亮或和弦检测——调／音阶纠正只作为 `Key Filter` Note FX 设备（"A note transposer, which can correct or remove notes that do not match a set key and mode."），和弦构建是 `Multi-note` 设备。折叠只在一条警告里出现（"Micro-pitch editing mode is not available while the Fold Notes button is enabled."）。**没找到**画在卷帘里的自动化车道——卷帘有 Note Expression 区，轨／设备自动化在**独立的 Automation Editor Panel**。

**鼓编程 — `found`**

* **Stepwise 步进器**：`"A playful, multi-row step sequencer that outputs notes while the global transport is playing."`（<https://www.bitwig.com/userguide/latest/note_fx>）
  ⇒ **少了**：为了听到一个 beat 先把它画成 clip 里的 MIDI 音符。
* **Drum Machine = 一个音高一件乐器**：`"Drum Machine is made to house multiple instruments, each of which will be triggered by a specific note message (for example, C1 for a kick drum, F#1 for closed hi-hat, etc.)."`（<https://www.bitwig.com/userguide/latest/advanced_device_concepts>）
  ⇒ **少了**：为套鼓里的每件乐器各建一条轨与设备链。
* **Choke 组**：`"This allows you to associate related elements into a single choke group, allowing only one of those elements to sound at a time."`（同上）——在 `Choke targets` 与 `Choked by` 右键子菜单里配置。
  ⇒ **少了**：每次闭镲一响就手工把开镲裁短。
* **Swing（Global Groove）**：`"The groove function in Bitwig Studio allows you to apply this idea so that notes which were programmed straight can be swung by a variable amount on playback."`（<https://www.bitwig.com/userguide/latest/the_global_groove>）——Play 菜单里的工程级 Global Groove，`Enable Groove` 打开，Shuffle Rate 1/8 或 1/16，Shuffle 0.00%–100%，另有 Accent Rate／Accent／Phase。
  ⇒ **少了**：为了加摇摆而把每个偶数步重画或推后。
* （`notFoundNote`）⭐ **既没有 groove pool，也没有"从音频 clip 提取时间感觉"**：我找不到任何描述"从音频提取感觉套到别处"的页面；Bitwig 的 groove 是**工程级 Global Groove**，非破坏地作用在"自身 Shuffle 参数已启用"的 clip 上（"When the Enable Groove button is toggled on, the Global Groove settings will be applied to any clip requesting them."）。

**音色发现 — `found`**

* **Tags 过滤**：`"The Tags filter is special, helping narrow your search with various assigned keywords."`（<https://www.bitwig.com/userguide/latest/common_browser_elements>）
  ⇒ **少了**：记住一个能用的音色住在哪个文件夹、哪个设备里。
* **Favorites 集合**：`"This definitely includes Favorites, which contains every item you have marked as a favorite."`（<https://www.bitwig.com/userguide/latest/browsers>）
  ⇒ **少了**：每个会话重跑一遍同样的搜索，只为找那几件真正在用的音色。
* ⭐ **试听不打断（Live Preview / Auto-Preview）**：`"So in the Pop-up Browser with its Live Preview mode, or when going thru samples in either browser with the Auto-Preview option enabled, filing items is as easy and pressing DOWN ARROW, instantly auditioning a preset or sound, pressing a number to send it to a collection (0 to mark it a favorite), and then pressing DOWN ARROW again."`（<https://www.bitwig.com/userguide/latest/common_browser_elements>）
  ⇒ **少了**：为了试一个候选音色而停播放或伸手拿鼠标。
* **拖到设备上即替换**：`"To replace one device with another: drag the desired device or preset from the Browser Panel onto the device to be replaced."`（<https://www.bitwig.com/userguide/latest/working_with_devices>）
  ⇒ **少了**：为了换一个替代品而先删掉当前设备、再打开浏览器。
* （`notFoundNote`）**没有**相似音色搜索或按用途搜索；浏览器按来源、过滤器、标签、作者、类别、设备与文本搜索来收窄，**存在 Vendor 过滤器**（"And a special Vendor filter will appear for Plug-ins and other device-based selections."），但我没找到能同时覆盖"类型＋厂商＋收藏"的单一可引原句。也**没找到**"把预设拖到**轨道**上（而不是拖到已有设备上）会发生什么"的说明。

**采样器与素材 — `found`**

* **Sampler 分区映射编辑**：`"A sampler that can handle single or multiple samples in zones (with resizeable mapping editors) and has multiple play modes, a multimode filter, and numerous modulation opportunities."`（<https://www.bitwig.com/userguide/latest/synth>）
  ⇒ **少了**：每个采样都要开一个乐器实例才能铺到键盘上。
* **三种循环模式**：`"The three choices are the single forward arrow (no looping), the stacked forward arrows (single-direction looping), and the stacked forward and reverse arrows (ping-pong looping)."`（同上）
  ⇒ **少了**：为了得到一个持续音或乒乓循环而把音频切到外置编辑器。
* **切片→多采样乐器**：`"On this new instrument track, a Sampler device has also been created with the corresponding slice of audio assigned to each note seen in the note clip."`（<https://www.bitwig.com/userguide/latest/slicing_to_notes>）
  ⇒ **少了**：手工切 loop，再把每一击一个个铺到键上。
* **切片→Drum Machine**：`"The choice between Sampler and Drum Machine is really one of workflow. While Sampler places all slices in the same signal chain, the Drum Machine gives you independent chains (and a unique Sampler) for each slice."`（同上）
  ⇒ **少了**：一个一个搭鼓格、再手工把切片放进去。
* （`notFoundNote`）**没找到**把"未切片的单个音频"自动映射到键域的功能：切片是通过 `Slice to Multisample...`／`Slice to Drum Machine...` 变成音符的（`Slice at` 提供 Beat Marker／Onset／Audio Event／Bar／1/2 到 1/32 音符），键域、力度域与选择域要在网格／列表编辑器或 Inspector 里**手工**编。

**混音面 — `found`**

* **送出段（每条 FX 轨一个旋钮，Pre/Post/Auto）**：`"The send section provides a level knob for each FX track in your project. Other than the master, this section is available on all tracks and any visible layers."`（<https://www.bitwig.com/userguide/latest/the_mix_view>）
  ⇒ **少了**：自己建一条总线轨、再把每个通道手工接进去。
* **FX 链顺序 = 视觉顺序**：`"In the Device Panel, signal always flows from left (input) to right (output)."`（<https://www.bitwig.com/userguide/latest/introduction_to_devices>）
  ⇒ **少了**：猜某个效果到底在下一个效果之前还是之后。
* **大表**：`"These high-resolution stereo audio meters — aka the big meters — liberates each channel's output level meters from the channel strip section (see Channel Strip Section)."`（<https://www.bitwig.com/userguide/latest/the_mix_view>）
  ⇒ **少了**：在大会话里为了对齐电平而眯着眼看通道条上的小表。
* **一次按键到混音台**：`"The Mixer Panel icon is a series of three wide vertical lines, like the volume faders of a mixing console. When available, you can focus on this panel and toggle its visibility by pressing M or ALT+M."`（<https://www.bitwig.com/userguide/latest/the_window_footer>）——底部还有 `ARRANGE`／`MIX`／`EDIT` 三个视图词。
  ⇒ **少了**：在菜单里找"从编排到推子"的路。
* （`notFoundNote`）**没找到**混音设置或插件设置的 A／B 对比；最接近的是 crossfader 段的 Global Crossfader ＋每轨 Track Mix Selector（Amix／both／B mix）——那是**演出用的两个 mix 交叉淡化**，不是设置 A／B。

**从零到一个想法 — `found`**

* **任意工程可存成模板**：`"Directly beside the Save as… function in the File menu is the Save as Template… option."`（<https://www.bitwig.com/userguide/latest/working_with_projects_and_exporting>）——带 Name／Author／URL／Category／Tags／Description 字段。
  ⇒ **少了**：每首新歌重建同一套轨道布局、路由与设备。
* **两步从模板开新工程**：`"To create a new file from a template: go to the File menu and select New From Template… (directly beside the New… option)."`（同上）
  ⇒ **少了**：每个会话都从空白工程开始、再把惯用设置加回来。
* **把模板设成默认**：`"To set a template as the default for any new project: go to the Dashboard, navigate to the Settings tab, and click the Behavior page. In the Template section, enable the Use a template for new projects option."`（同上）
  ⇒ **少了**：每次开新工程都手工挑一次模板。
* **浏览器里的 Templates 源**：`"Templates is available in the Browser Panel for loading BWTEMPLATE files, either in the Bitwig library or from your chosen sound content locations."`（<https://www.bitwig.com/userguide/latest/browsers>）
  ⇒ **少了**：记住模板文件存在磁盘哪里。
* （`notFoundNote`）**没有**"空工程→出声"的单键功能；记下的快路是模板（`File > New From Template…` 或默认模板）与浏览器的 Templates 源；Stepwise、Multi-note 这类**生成设备仍要自己加到轨上**。

### 2.5 PreSonus Studio One 6 / Studio One Pro 7

> ⚠️ **来源限制**：`s1manual.presonus.com` 的页面我拿到的是 **web.archive.org 快照**，引用的 URL 就是快照 URL。
> 另引 Sound On Sound 与 MusicRadar 的 6／7 评测（二级来源，已标注）。
> Fender 现在的官方手册是 **Fender Studio Pro 8.1**（比 Studio One 6/7 更晚的产品），只用它找过主题文件名，**没有引用**。

**钢琴卷帘 — `partial`**

* **从音频检测和弦**：`"You can also extract chord information from Audio Parts. To do this, select an Audio Part and navigate to Audio/Detect Chords (or [Right]/[Ctrl]-click the Part and navigate to Audio/Detect Chords in the pop-up menu) to analyze the harmonic structure of the Part."`（<https://web.archive.org/web/20221004125854/https://s1manual.presonus.com/Content/Arranging_Topics/Chord%20Track.htm>）
  ⇒ **少了**：靠耳朵听出一段录下来的吉他／钢琴／采样的和声再打进去。
* **琶音器（Note FX，逐乐器轨）**：`"Pattern This is a 32-step pattern sequencer you can use to create repeating patterns of note velocity and gate (length) that are applied to the control output of the Arpeggiator. The Pattern area contains the following controls: Activate Pattern Toggle this on or off to enable or disable the Pattern sequencer."`（<https://web.archive.org/web/20231003072446/https://s1manual.presonus.com/Content/Built-In_Instruments_Topics/Note_FX.htm>）
  ⇒ 让创作者把按住的一个和弦变成走动、有起落的琶音，而**不必**逐个音画。
* ⭐ **卷帘里能看见自动化**：`"Click the Show/hide Automation Lanes button (), and then click the Sound Variation Parameter tab at the top of the lane. This tab is available in the Piano and Drum views, and will display below the Note Editor."`（<https://web.archive.org/web/20221009055253/https://s1manual.presonus.com/Content/Editing_Topics/Sound_Variations.htm>）
  ⇒ **少了**：每次要自动化一个奏法或参数就跑出卷帘、跳到编排区。
* **Studio One 7 的自定义音阶**：`"User scales have been introduced to the piano roll, where you can define exactly what notes you want to use or display."`（<https://www.soundonsound.com/reviews/presonus-studio-one-pro-7>，二级来源）
  ⇒ **少了**：猜哪些音在调上，或事后修不在调上的音。
* （`notFoundNote`）Studio One 6/7 **没找到**：扫弦、legato 工具、卷帘里的折叠／多片段编辑，因此不作断言。逐**步**概率与 humanize 式的 Delay 偏移是 **Pattern（步进）编辑器**的属性，所以引在"鼓编程"一栏；Note Editor 的 Quantize 面板（Start/End/Velocity 百分比）也在那一栏。卷帘内除 Inspector 的轨级 Velocity 之外的力度处理，**在我能读到的页面上没有记载**。

**鼓编程 — `found`**

* **Pattern 的 Drum Mode**：`"Patterns have two modes of operation: One is designed for melodic and harmonic parts, showing available notes on a grid, corresponding to the related keyboard notes. The other is for drums and other percussive parts, and it offers automatic note/instrument naming when used with Impact XT, along with variable phrase lengths and note resolution for each note row."`（<https://web.archive.org/web/20211112001217/https://s1manual.presonus.com/Content/Editing_Topics/Patterns.htm>）
  ⇒ **少了**：放弃鼓机工作流、回手把 kick／snare／hat 画成普通 MIDI 音符。
* **Choke 组（1–32）**：`"Choose a Choke group (1-32) to tie the playback of this pad to all other pads also assigned to that choke group."`（<https://web.archive.org/web/20230924210937/https://s1manual.presonus.com/Content/Built-In_Instruments_Topics/Impact%20XT.htm>）
  ⇒ **少了**：每次闭镲落下就手工切断开镲的尾巴。
* **按住 Shift 拖 loop 到 Impact XT 自动拆到多个 pad**：`"To import a drum loop and automatically split its hits across multiple pads, hold [Shift] while dragging the loop onto Impact XT."`（同上）
  ⇒ **少了**：手工切一段 break、再逐击放到各自的 pad 上。
* ⭐ **从音频提取 groove 再套到别处**：`"To make this happen, open the Quantize panel and switch to Groove mode. Next, drag the kick drum Event into the Groove panel, and then quantize the bass Event."`（<https://web.archive.org/web/20220904230142/https://s1manual.presonus.com/Content/Editing_Topics/Transient_Detection_and.htm>）
  ⇒ **少了**：把贝斯每个音一个个推，直到它跟录下来的鼓的感觉咬合。
* （`notFoundNote`）逐**步**概率、Repeats、Delay 人性化，以及 Patterns 的 Swing／Gate／Accent 也在同一页，但只允许四条。**没找到**专门的 groove 预设／"groove pool" 浏览器；提取是通过 Quantize 面板的 Groove 模式做的。

**音色发现 — `found`**

* **收藏＋最近**：`"The Instruments and Effects tabs in the browser each offer a drop-down list of Favorites (chosen by you), and a Recent plug-ins list, which displays the 10 most recently used instruments or effects."`（<https://web.archive.org/web/20230401162325/https://s1manual.presonus.com/Content/The_Browser_Topics/Instruments_and_Effects_Tabs.htm>）
  ⇒ **少了**：每个工程都在几百个插件里重新找那一小撮。
* ⭐ **试听有独立走带，可与工程同时播**：`"Preview Player playback is independent of the main Song playback; notice the playback-position cursor does not move across the Arrange view while previewing a file."`（<https://web.archive.org/web/20230124205833/https://s1manual.presonus.com/Content/The_Browser_Topics/Files_Tab.htm>）
  ⇒ **少了**：为了确认一个采样合不合就停播放、加载、再重开。
* **拖乐器到已有乐器轨会问 Replace／Combine／Keep**：`"If you drag-and-drop an instrument from the Browser on top of an existing Instrument Track that is routed to another virtual instrument, the previously loaded instrument is replaced by the new one. A pop-up menu appears, giving you the choice to Replace (remove the old instrument from the Instrument panel and replace it with the new) , Combine (place the new and existing instruments into a new Multi Instrument ), or Keep the old instrument (re-route the Track to address the new instrument and retain the old instrument in the Instrument panel)."`（<https://web.archive.org/web/20230401162325/https://s1manual.presonus.com/Content/The_Browser_Topics/Instruments_and_Effects_Tabs.htm>）
  ⇒ **少了**：在同一条轨上试另一个乐器时丢掉当前音色或路由。
* **Studio One 7：Splice 页的 "Search With Sound"**：`"The idea is that you drag a clip or two, a chorus, verse or anything up to eight bars, into the box, and its AI algorithms will go off and retrieve a bunch of loops that fit with what you're doing."`（<https://www.soundonsound.com/reviews/presonus-studio-one-pro-7>，二级来源）
  ⇒ **少了**：在采样文件夹里翻，盼着能找到跟工程调性与感觉相配的东西。
* （`notFoundNote`）"预设与工程一致"由 **Track Presets** 覆盖（其手册页写 `allow you to save and recall frequently-used Track and Channel configurations so you don't need to re-create their inputs, settings, and routing`，<https://web.archive.org/web/20230705220058/https://s1manual.presonus.com/Content/Editing_Topics/Track%20Presets.htm>），但因四条上限未单列。`Flat／Folder／Vendor／Type` 排序与按名搜索也记在同一页。

**采样器与素材 — `found`**

* **Wave view 里做采样与循环编辑**：`"Wave view is where you do the bulk of your sample and loop editing. To select the range of the sample that plays when you trigger it, click-and-drag the blue triangles below the waveform."`（<https://web.archive.org/web/20230130154949/https://s1manual.presonus.com/Content/Built-In_Instruments_Topics/SampleOne%20XT.htm>）
  ⇒ **少了**：在能放进采样器之前先把采样裁到外置音频编辑器里。
* **REX 切片自动铺到键位**：`"When adding a REX file to SampleOne XT from the Browser with the Send to New SampleOne XT command, the REX file's individual slices are mapped across the keymap (starting at C3 by default, dependent on number of slices), with each slice given its own note."`（同上）
  ⇒ **少了**：把 loop 切成一个个 one-shot 再手工映射到键上。
* **`Send To new Impact` 把切片铺到多个 pad**：`"Send To new Impact Sample, loop, or .wav/mp3. Opens the file as a new Impact instrument, sliced across multiple pads."`（<https://web.archive.org/web/20230124205833/https://s1manual.presonus.com/Content/The_Browser_Topics/Files_Tab.htm>）
  ⇒ **少了**：从一个 loop 或采样出发时一个一个 pad 搭套鼓。
* **循环点交叉淡化**：`"X-Fade Click-and-drag or click and type in this field to specify a number of samples of crossfade to apply to the loop points, to assist in removing audible clicks."`（<https://web.archive.org/web/20230130154949/https://s1manual.presonus.com/Content/Built-In_Instruments_Topics/SampleOne%20XT.htm>）
  ⇒ **少了**：靠耳朵找一个不咔哒的循环点，或去外置编辑器清咔哒。

**混音面 — `found`**

* **一次点击／F3 到 Console**：`"Mixing in Studio One is primarily done in the Console. Open the Console by clicking on the [Mix] button or by pressing [F3] on the keyboard."`（<https://web.archive.org/web/20211112010223/https://s1manual.presonus.com/Content/Mixing_Topics/The_Console.htm>）
  ⇒ **少了**：在"编排"和"平衡"之间来回时被打断。
* **FX Channel 就是效果返回通道**：`"FX Channels are what are traditionally known as effects return channels, used to apply effects to multiple signals simultaneously through the use of Sends. Audio can be routed from any Channel through a Send to an FX Channel, which can have any number of effects inserted in its Insert Device Rack."`（同上）
  ⇒ **少了**：在每个通道上复制同一台混响，而不是喂一个共享返回。
* **插入顺序自上而下，可拖动重排**：`"Inserts affect the audio signal path in the top-to-bottom sequential order in which they are inserted. An Insert can be reordered by clicking-and-dragging it above, below, or in between other Inserts."`（<https://web.archive.org/web/20250919110008/https://s1manual.presonus.com/en/Content/Mixing_Topics/Effects_Signal_Routing.htm>）
  ⇒ **少了**：为了让压缩在 EQ 之前而重搭整条链。
* **一键旁通所有插入做对比**：`"In this way, you can instantly compare the sound of your Song with and without all activated Insert effects."`（同上）
  ⇒ **少了**：为了听干混而手动逐个旁通几十个插件。
* （`notFoundNote`）Peak 与 Peak/RMS 表、推子前表、输出通道的 K-System 表记在 Metering 页；每通道的自动化模式显示记在 Console 页；都因四条上限未单列。**没找到**专门的 A/B 快照或混音对比功能；最接近的是全局插入旁通与 Mix Engine FX 旁通。

**从零到一个想法 — `found`**

* **新建歌曲时给预配置模板**：`"On the left side of the New Song creation menu, there is a list of preconfigured Song templates, which are designed to help get you started quickly with various recording tasks."`（<https://web.archive.org/web/20211111211038/https://s1manual.presonus.com/Content/Setup_Topics/Creating_a_New_Song.htm>）
  ⇒ **少了**：每次有想法时从空工程搭轨、I/O 与插件。
* **Studio One 6 的 Smart Templates（按场景）**：`"PreSonus have now replaced these slightly patronising styles with 'Templates' that make a lot more sense. The choices are colourful and inviting with options like Record and Mix, Master and Release, Rehearse and Perform, Play Now, Record Now, Create Content and Produce Beats."`（<https://www.soundonsound.com/reviews/presonus-studio-one-6>，二级来源）
  ⇒ **少了**：对着空白工程发呆、不知道该先设什么。
* **和弦事件拖到乐器轨变成音符事件**：`"Any or all Chord events on the Chord Track can be converted to Note Events in Instrument Tracks by simply dragging the Chord Events from the Chord Track to an Instrument Track. This will create Note Events with the same duration as the Chord Events that created them."`（<https://web.archive.org/web/20221004125854/https://s1manual.presonus.com/Content/Arranging_Topics/Chord%20Track.htm>）
  ⇒ **少了**：在和弦轨上想好进行之后，还得把它弹进／画进卷帘。
* **Studio One 7：与时间线并排的 clip launching 面板**：`"Click a button in the top bar, and a clip launching panel will appear side-by-side with the timeline like a Scratch Pad."`（<https://www.musicradar.com/music-tech/daws/an-upgrade-thats-all-about-creativity-presonus-studio-one-pro-7-review>，二级来源）
  ⇒ **少了**：在一个想法被当成循环场景试听之前就锁定成线性编排。

### 2.6 Steinberg Cubase 13 / 14

> 来源：Cubase Pro 14.0.30 官方英文帮助（`steinberg.help`）。
> ⚠️ 其中两条（鼓的 groove 提取、MediaBay 的 `Wait for Project Play`）引的是 **Cubase AI 13.0.30 官方操作手册 PDF**：
> 因为 Steinberg **已不再提供 Cubase Pro 13 的英文 HTML 帮助**（v13 路由重定向到一个失效的 PDF 路径）。

**钢琴卷帘 — `found`**

* ⭐ **Key Editor 的 Scale Assistant 有音阶高亮**：`"Changes the display background of the note event according to the selected scale. Pitches that do not belong to the selected scale are shown with a darker background."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/midi_editors/midi_editors_scales_in_key_editor_r.html>）
  ⇒ **少了**：靠耳朵判断哪个音出了调——不在音阶上的音在卷帘里就是另一种底色。
* ⭐ **Play Probability 是一条控制器车道（逐音符概率）**：`"You can add Play Probability to note events to change the likelihood of note events being played back in real-time. This can make your MIDI performance sound more organic."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/midi_editors/midi_editors_play_probability_c.html>）
  ⇒ **少了**：手工改音符数据或弹好几遍做变化——概率可以逐音符设，并在车道上拖。
* **Velocity Variance（实时随机力度）**：`"You can add velocity variance to the velocity of note events. This allows you to modify note velocities randomly during real-time playback in order to make your MIDI performance sound more organic."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/midi_editors/midi_editors_velocity_variance_events_c.html>）
  ⇒ **少了**：为了人性化而逐个改力度值——一个方差值在播放时实时生效。
* **Legato 在 MIDI 菜单里**：`"The selected note events are extended to the start of the next notes."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/midi_processing/midi_processing_extending_midi_notes_t.html>）
  ⇒ **少了**：把几百个音符的尾巴一个个拖过去补缝。
* （`notFoundNote`）**没找到** Key Editor 内部的扫弦或琶音命令，也**没找到**"折叠未用音符"的命令。多声部是靠编辑器的 **Visibility** 标签页处理的；自动化记载为工程窗口里**独立的自动化轨**，不是卷帘音符显示里的车道。

**鼓编程 — `found`**

* **Pattern Editor（步进器）**：`"The Pattern Editor allows you to create and tweak drum patterns. The Pattern Editor can have up to 128 step lanes, a maximum step amount of 128 steps, and unlimited pattern variations."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/pattern_editor/pattern_editor_r.html>）
  ⇒ **少了**：把 beat 当卷帘里的 MIDI 音符来编——步是直接在格子上输的，且每条 lane 有自己的控件。
* **Drum Machine 128 pad / 8 个 4×4**：`"It consists of 128 drum pads, divided into eight 4x4 grids. Instruments or drum samples can be assigned to each drum pad."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/drum_machine/drum_machine_c.html>）
  ⇒ **少了**：在另一个采样器里手工搭套鼓——pad 已预先映射，把乐器或采样拖上去即可。
* **Choke = Exclusive Group**：`"Allows you to assign a drum pad to an exclusive group. Drum pads of the same exclusive group can only be played one at a time."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/drum_machine/group_page_r.html>）
  ⇒ **少了**：手工切掉开镲的尾巴。
* ⭐ **从音频提取 groove 再套到别处**：`"The groove is extracted from the audio event and made available in the Quantize Presets pop-up menu on the Project window toolbar."`（<https://www.steinberg.help/api/khub/documents/LtfKfVFqs7_QC2GlnXIWJA/content>，Cubase AI 13.0.30 官方手册 PDF）——通过 Sample Editor 里的 hitpoints。
  ⇒ **少了**：靠耳朵重建一段演奏的律动——录制 clip 的感觉变成一个可复用的量化预设，能套到任何别的声部上。
* （`notFoundNote`）**没有** "Groove Pool" 面板；提取出来的感觉存成 **Quantize Presets**（也能从 Quantize Panel 存出去）。逐**步** Probability、Velocity Variance、Repeats、Offset、Gate 记在 Pattern Editor 的 **Parameter Lane**；独立的 swing 功能只在 Sample Editor 的 tempo-matching 音频主题下有记载。

**音色发现 — `found`**

* **按厂商／类别排序插件集合**：`"Sort By Vendor sorts the collection by vendor. This is available for the Default collection only."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/mediabay/mediabay_vst_instruments_page_r.html>）
  ⇒ **少了**：在几百件乐器的不加区分的长列表里滚——浏览器可以按制造商或类别重排。
* ⭐ **试听锁在走带上（不打断播放）**：`"Synchronizes the play and stop functions from the Transport panel with the play and stop buttons in the Previewer section. To use this option to its full extent, set the left locator to the beginning of a bar, then start playing back the project using the Transport panel."`（<https://www.steinberg.help/api/khub/documents/LtfKfVFqs7_QC2GlnXIWJA/content>，同上 PDF）——MediaBay Previewer 的 `Wait for Project Play`。
  ⇒ **少了**：每次试听一个 loop 或预设都要停一次编排——预览跟着跑着的工程一起起。
* **按属性找同类（右键搜索）**：`"You can search for files that have the same attribute as the selected file."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/mediabay/mediabay_context_menu_search_performing_c.html>）
  ⇒ **少了**：重新敲搜索词找相关素材——一次右键就把结果列表过滤成共享某个属性值的文件。
* **拖 track preset 到轨列表下方 = 新建轨并载入**：`"Drag a track preset below the track list to add a new track with the track preset loaded."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/mediabay/mediabay_applying_track_presets_t.html>）
  ⇒ **少了**：先建轨、再回头找一遍预设。
* （`notFoundNote`）**没找到**按用途搜索或 AI 式"找相似音色"；最接近的是基于属性的 `Search for` 子菜单、逻辑／布尔文本搜索与媒体类型过滤。"工程一致"记在 Previewer 页的 `Link to Project Tempo`（会自动为导入事件打开 Musical Mode）与 `Auto Play New Results Selection` 上。

**采样器与素材 — `found`**

* **音频一键变 Sampler Track**：`"In the MediaBay, right-click an audio file, and select Create Sampler Track."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/sampler_track/sampler_track_creating_sampler_tracks_c.html>）
  ⇒ **少了**：把音频导出再导进另一个采样器乐器。
* **切片自动映射到键盘**：`"You can create slices of a sample. These are automatically mapped to the keyboard, so that each slice can be played back individually."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/sampler_track/sampler_track_section_playback_r.html>）
  ⇒ **少了**：手工把切片分给键——切片检测会替你写好键位映射（还能生成配套的 MIDI 乐句）。
* **循环点可视化拖动**：`"Drag the Set Sustain Loop Start and Set Sustain Loop End handles to adjust the loop start and end points."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/sampler_track/sampler_track_loops_on_audio_samples_setting_up_t.html>）
  ⇒ **少了**：靠数值输入猜循环位置。
* **Loop Mode 决定一次性播放**：`"If this is set to No Loop, the sample is played once."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/sampler_track/sampler_track_sample_control_toolbar_r.html>）
  ⇒ **少了**：在工程外面就把一个采样钉死成"一次性"或"循环"。
* （`notFoundNote`）**没找到** Sampler Control 里字面叫 "one-shot" 的模式（只有 Loop Mode 的 `No Loop`）；`One Shot` 在文档里是采样的**标签**（带该标签的采样不能做时间伸缩）。Sampler Control 另有 `Switch between A/B Settings`，以及把一个采样**连同它的设置**转到乐器上。

**混音面 — `found`**

* **F3 一步到 MixConsole**：`"Press F3."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/mixconsole/mixconsole_mixconsole_window_r.html>）
  ⇒ **少了**：混音中途在菜单里找路——一次按键就把编排视图换成完整混音台。
* **送出默认隐藏，可整体打开**：`"On the MixConsole toolbar, click Set up Window Layout, and activate Sends to show the section above the fader section."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/mixconsole/mixconsole_adding_send_effects_t.html>）
  ⇒ **少了**：离开混音视图去够一个 aux send。
* **插入链上画出推子前／后分界**：`"The number of pre-fader and post-fader slots is adjusted. The color and the separator line show which effect is pre-fader and which effect is post-fader."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/mixconsole/mixconsole_moving_inserts_to_postfader_or_prefader_position_t.html>）
  ⇒ **少了**：在一条长插入链里记推子到底在哪。
* **混音 A/B = MixConsole Snapshots（最多 10 个）**：`"The Snapshots tab lists all snapshots of MixConsole settings and allows you to recall them later. This is useful if you want to compare different versions of a mix."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/mixconsole/mixconsole_snapshots_c.html>）
  ⇒ **少了**：为了试另一个平衡而存整份工程副本。
* （`notFoundNote`）**没找到**有据可依的**逐插件** A/B 对比按钮（唯一见到的 `Switch between A/B Settings` 在 Sampler Control 工具栏上）；混音层面的对比由 MixConsole Snapshots 承担。参数自动化（写 `W`／读 `R` 按钮，Automation Panel 上也有）与通道表（Meter Peak Level 指示）记在 MixConsole 主题里，因四条上限未引。

**从零到一个想法 — `found`**

* **Steinberg Hub 的工厂模板分四类**：`"The available factory templates are sorted into the predefined categories Recording, Scoring, Production, and Mastering."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/project_handling/project_handling_steinberg_hub_r.html>）
  ⇒ **少了**：在能弹一个音之前先搭轨道布局、总线与乐器架。
* **和弦垫（Chord Pads）**：`"Chord pads allow you to play with chords and to change their voicings and tensions. In terms of harmonies and rhythms, they allow for a more playful and spontaneous approach to composition than the chord track functions."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/chord_pads/chord_pads_c.html>）
  ⇒ **少了**：先在卷帘里写一条进行——垫子立刻给出和声，而且演奏可以直接录成 MIDI。
* **双击媒体文件即建轨并载入**：`"Double-click a media file to create a new instrument or an audio track with the loaded file."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/mediabay/mediabay_right_zone_inserting_loops_and_sounds_t.html>）
  ⇒ **少了**：先建轨再导入或拖文件。
* **Pattern Editor 的 Euclidean 生成**：`"Generates rhythmic steps on the selected step lane by distributing them as evenly as possible, based on the step amount and step rotation."`（<https://www.steinberg.help/r/cubase-pro/14.0/en/cubase_nuendo/topics/pattern_editor/step_lane_inspector_r.html>）
  ⇒ **少了**：只想要一个起始节奏想法时手编一个 beat。
* （`notFoundNote`）文档**没有**给出"最快到出声"的点击数；最短的记载路径是 Hub（`File > New Project`）→ 模板类别 → 模板，或从空工程 `Add Track` ＋ 在 MediaBay 双击一个 loop。

### 2.7 REAPER 7

> 来源：Cockos 官方文档——**REAPER 7.81 用户指南 PDF** 与 **ReaEffects Guide PDF**（均在 `reaper.fm`）。
> 这两本是 PDF，引用的是**非排版文本抽取**后的原句。

**钢琴卷帘 — `partial`**

* **音阶／和弦吸附**：`"Scale and Chord: Enabling the key snap option allows you to select a scale and a chord from the two drop down lists. You can also use the chords button (here labelled "Major") to load a REAPER .reascale file."`（<https://www.reaper.fm/userguide/ReaperUserGuide781c.pdf>）
  ⇒ **少了**：画旋律或和弦声部时自己算音阶级数。
* **Humanize**：`"Humanizing can make the exact timing of MIDI generated music sound less "clinical" and more realistic. It does this by allowing you to introduce random small and subtle imprecisions in timing and velocity."`（同上）
  ⇒ **少了**：为了去掉僵硬感而逐个音推位置和力度。
* **Legato（Edit 菜单）**：`"Sets ends of selected notes to start of next notes by adjusting end points of all notes in selected range."`（同上）
  ⇒ **少了**：为了补上连奏线里的缝而一个个拖右边缘。
* **多 MIDI 条目同时编辑**：`"In order to be able to edit different MIDI items at the same time you will first need to select those items that you wish to make available for editing, as explained in the previous section."`（同上）
  ⇒ **少了**：为编排里的每个 MIDI 条目开一个编辑器窗口再来回切。
* （`notFoundNote`）用户指南**没有**记载卷帘里的音符级概率或条件触发，也**没有**扫弦或琶音命令——唯一见到的概率／round-robin 控制在 **ReaSamplOmatic5000** 里，不在卷帘里。也**没找到**"轨道自动化包络显示在 MIDI 编辑器内"的记载——它的下方面板装的是 velocity 之类的 MIDI CC 车道。

**鼓编程 — `partial`**

* **步进录入（step recording）**：`"Step recording is a method of recording a sequence of MIDI notes within REAPER's MIDI Editor, one step at a time. In overview, you start by choosing a step size (such as a quarter or eighth note), then play your notes using a MIDI keyboard or the function keys F1 to F12."`（同上）
  ⇒ **少了**："必须踩着拍子在键盘上把鼓型弹进去"才能有音符。
* **套鼓映射靠每个实例自己的 Note start／Note end**：`"Notice that each instance of ReaSamplOmatic5000 uses different Note start and Note end settings."`（同上）
  ⇒ **少了**：为每件鼓各建一条轨和一个 MIDI 条目，只为把套鼓铺到键盘上。
* **Round-robin ＋ 概率**：`"The round-robin option can be used in conjunction with the probability setting to determine whether any given instance will produce a sound from any given note."`（同上）
  ⇒ **少了**：为了避免同一个采样"机关枪"而手工改重复的击打。
* **从音频拿到可编辑的时间（动态分割＋chromatic MIDI）**：`"Suppose that you have a groove that you have assembled from various items from different sources. You can now create chromatic midi from the items and then load those items into a sample player, each mapped to the next note in sequence."`（同上）
  ⇒ **少了**：想复用一段律动的时间就得靠手重弹——演奏被转成可移动的 MIDI 音符。
* （`notFoundNote`）**没找到** groove pool／groove 库／groove 量化功能，也**没有** MIDI 编辑器 step recording 之外的专门步进格。**没有**记载原生 choke 组控件——指南只提到配合 ReaSamplOmatic5000 用的 `JS: MIDI/midi_choke` 插件。Swing 只作为网格间距类型与量化强度值出现，**没有**记载"提取—套用"的 groove 工作流。

**音色发现 — `found`**

* **FX 浏览器按类型／类别／开发者自动分组**：`"REAPER automatically groups your FX in various ways – by type (VSTi, VST, JS, etc.), by category (Analyzer, Dynamics, EQ, etc.) and by developers (e.g. Melda, Voxengo, Wave Arts). In addition, you can create your own group folders."`（同上）
  ⇒ **少了**：在一个扁平按字母排的插件表里滚，只为找所有混响或某个厂商的所有插件。
* ⭐ **试听对齐小节、工程继续播**：`"Enabling Start on bar will ensure that in auditioning the item during project playback, the item playback will be co-ordinated so as to start on a bar."`（同上）——Media Explorer 的 `Start on bar`。
  ⇒ **少了**：停工程、试听候选音色、再重开播放来判断它合不合。
* **按元数据字段搜索**：`"Search fields (make searchable any or all of: File name, Leading path, Title, Artist, Album, Year, Genre, Comment. Description, BPM, Key, Custom tags)."`（同上）
  ⇒ **少了**：只靠记忆和文件夹名去找一个以前能用的采样。
* **拖 FX 链到轨道／混音台／条目上**：`"In FX Browser, select Chains in left hand panel. Drag and drop required chain to track panel or mixer panel or item."`（同上）
  ⇒ **少了**：在每条轨上手工重建同一套插件组合。
* （`notFoundNote`）**没找到**相似音色或"找相似"搜索：搜索只有文本与元数据字段。指南记了把 FX 与存好的 FX 链从浏览器拖到轨道上，但**没找到**"把裸的插件预设拖到轨道上"的行为记载。预设存储也**不是**按工程的——指南说每个 VST 插件用一个独立文件（`preset-vst-plugname.ini`）保存用户创建或导入的预设。

**采样器与素材 — `found`**

* **`Insert into sample player` 一键建轨并载入采样**：`"Selecting a sample and then choosing Insert into sample player (insert sample player on new track) will cause a new track to be created with ReaSamplomatic5000 inserted into its FX chain, pre loaded with the selected sample."`（同上）
  ⇒ **少了**：加轨、加采样器、再手工找同一个文件一遍。
* **Note start 定义触发键**：`"Note start Defines the MIDI note for which note-on messages will trigger the sample."`（<https://www.reaper.fm/userguide/REAPEREffectsGuide2021.pdf>）
  ⇒ **少了**：为了把每个声音映到一个键而建一堆独立采样器轨。
* **Loop 选项**：`"Loop Allows a properly configured sample to play with its loop section repeating until a note-off message is received."`（同上）
  ⇒ **少了**：为了让一个长音持续而反复重触发同一个采样。
* **切开后可以逐个存成采样**：`"After splitting, you can save any of the individual slices as samples. To save an individual sample, simply right click over it and choose Glue items from the context menu."`（<https://www.reaper.fm/userguide/ReaperUserGuide781c.pdf>）
  ⇒ **少了**：为了把一个切片当 one-shot 用而把每片单独导出。
* （`notFoundNote`）**没找到**自动的多重采样键域映射，也**没有** `Insert into sample player` 之外的一键"从音频做乐器"；`Note start`／`Note end` 是**逐个** ReaSamplOmatic5000 实例手工设的。

**混音面 — `partial`**

* **一次命令切换混音台（Ctrl+M）**：`"Mixer display is toggled on and off using the View, Mixer command (Ctrl M)."`（<https://www.reaper.fm/userguide/ReaperUserGuide781c.pdf>）
  ⇒ **少了**：为了在编排和混音之间移动而重排窗口或到处找。
* **把送出显示到混音台上**：`"Right click anywhere in the empty area of the mixer – for example, to the immediate right of the rightmost track. From the menu, choose Show sends (when size permits)."`（同上）
  ⇒ **少了**：为了看清信号往哪送而逐个打开每一条轨的路由窗口。
* **任意 FX 参数都能加自动化包络**：`"Automation envelopes can be added for any FX parameters."`（同上）
  ⇒ **少了**：为了让一个插件参数在混音过程中变化而现场拧。
* **多声道轨的表**：`"Where a track has more than two channels you have the option of showing the output of all channels on the track's VU meters in the TCP and Mixer."`（同上）
  ⇒ **少了**：为了盯多声道轨的另外几路而插一个独立的表头插件。
* （`notFoundNote`）**没找到**原生 A/B 对比或混音台快照功能。FX 链顺序只在表格条目里记（例如 `Change the order of plug-ins in the FX Chain. Drag and drop up or down the order.`）且默认串行，因此没有单列为一条 fact。

**从零到一个想法 — `found`**

* **`Insert > Virtual Instrument on new track` 顺带录好音与监听**：`"Select your instrument and click OK. The track will be inserted armed for recording, with input monitoring on."`（同上）
  ⇒ **少了**：加轨、插乐器、录好音、开监听这四件分开做的事。
* **从工程模板开新工程**：`"Choose the File, Project Templates command, then click on the name of the required project template."`（同上）
  ⇒ **少了**：每个新想法都重建一遍熟悉的轨道布局与路由。
* **`Tempo match` ＋ 按时间选区插入，loop 一进来就合拍**：`"We make a time selection equal to the first instance of our synth. We set Tempo match on and then Insert at time selection (stretch/loop to fit)."`（同上）
  ⇒ **少了**：手工裁切与伸缩一个 loop，直到它跟小节对上。
* **轨道模板插入**：`"From the REAPER menu, choose the Track, Insert track from template command."`（同上）
  ⇒ **少了**：每个新工程从零重建一条乐器轨、它的 FX 与路由。
* （`notFoundNote`）指南里**没找到**和弦进行生成器或其他生成式想法工具；记载的快路是工程模板与轨道模板、`Insert > Virtual Instrument on new track`、以及从 Media Explorer 拖入已对速的 loop。

### 2.8 GarageBand（macOS）

> 来源：Apple 官方 **GarageBand for Mac 用户指南 10.4.9**（`support.apple.com/en-lamr/guide/garageband/...`）。

**钢琴卷帘 — `partial`**

* **逐音力度滑杆**：`"In GarageBand on Mac, select one or more notes, then drag the Velocity slider in the Piano Roll Editor header left or right."`（<https://support.apple.com/en-lamr/guide/garageband/gbndf2ff0cde/10.4.9/mac/13.5>）
  ⇒ **少了**：为了改力度去开音符事件列表，或在力度车道上逐音画。
* **拖两端改音长**：`"In GarageBand on Mac, drag either the left or right edge of the note horizontally, using the pointer."`（同上）
  ⇒ **少了**：只为了把一个音拉长／缩短就去开谱面视图或事件检查器。
* ⭐ **自动和弦检测**：`"When multiple overlapping notes are selected, the Piano Roll Editor header shows the chord name."`（同上）
  ⇒ **少了**：为了确认自己弹了什么而手工命名或记谱。
* ⭐ **区段自动化就在卷帘里**：`"Region automation appears directly below the note being automated."`（<https://support.apple.com/en-lamr/guide/garageband/gbnd0fa9da54/10.4.9/mac/13.5>）——用卷帘菜单栏的 `Show/Hide Automation` 按钮（或 `A` 键）切换。
  ⇒ **少了**：离开音符视图、去轨道自动化车道里找那条参数曲线。
* （`notFoundNote`）**没找到**：音阶高亮、概率／条件触发、扫弦控制、折叠卷帘模式。最接近的生成式音符帮助是 **Arpeggiator**，它在 Smart Controls 菜单栏里，**不在卷帘里**。因四条上限未单列：多区段编辑（编辑器头显示选中了多少个区段）与逐音符的 **Articulation ID**（部分乐器上有 legato／pizzicato／staccato）。

**鼓编程 — `partial`**

* **按演奏技法铺键位**：`"Performance patches include a small number of related instruments, such as several shakers, with different performance techniques assigned to individual keys."`（<https://support.apple.com/en-lamr/guide/garageband/gbnd1969a9b8/10.4.9/mac/13.5>）
  ⇒ **少了**：为了把同一件打击乐器的几种技法放到手下而自己搭键位图或多重采样。
* **Swing 在 Drummer Editor 里（不是 groove pool）**：`"Adjust the shuffle feel of the currently playing pattern: Drag the Swing knob vertically."`（<https://support.apple.com/en-lamr/guide/garageband/gbndcaf22b29/10.4.9/mac/13.5>）——另有 8th／16th 两个按钮设摇摆分辨率。
  ⇒ **少了**：为了得到 shuffle 感而手工把每一击推离网格。
* ⭐ **让鼓跟着另一条轨（含音频）**：`"You can have the kick and snare portions of a Drummer region follow another track so that the beat Drummer plays is influenced by the rhythm of another instrument's content."`（<https://support.apple.com/en-lamr/guide/garageband/gbnd861ac1f3/10.4.9/mac/13.5>）
  ⇒ **少了**：为了让鼓跟一段已经存在的吉他或贝斯 riff 锁住而手工重编鼓声部。
* ⭐ **groove track**：`"You can set a track as a groove track, and match (synchronize) the timing of other tracks in the project to it. When you play the project, the timing of matched tracks adjusts to match the timing of the groove track."`（<https://support.apple.com/en-lamr/guide/garageband/gbnd30cc2692/10.4.9/mac/13.5>）
  ⇒ **少了**：为了让整个编排共享同一个演奏者的感觉而量化或手工推每一轨。
* （`notFoundNote`）GarageBand for Mac 指南里**没找到**步进音序器／步进输入格，也**没找到** choke 组——Mac 上的鼓编程走 **Drummer**（基于区段与预设）而不是逐击的步。**也没有**逐击独立编辑：指南说 Drummer Editor 里的改动只影响**选中的那个区段**，所以击打不是可独立编辑的对象。groove 提取只限于"Drummer 的 kick 与 snare 跟随另一条轨"（需要源音频轨打开 `Enable Flex`）＋ 工程级 groove track。

**音色发现 — `found`**

* **Loop Browser 的列视图**：`"Click the Column View button to see a standard macOS column file directory that is hierarchically separated into All, Favorites, Genres, Instruments, and Descriptors search criteria."`（<https://support.apple.com/en-lamr/guide/garageband/gbnd3002ab64/10.4.9/mac/13.5>）
  ⇒ **少了**：记 loop 的名字——可以按乐器、风格与描述词收窄，而不是滚一个平的文件列表。
* ⭐ **试听在上下文里、工程不停**：`"If the project is playing, the previewed loop plays back in sync with the project."`（<https://support.apple.com/en-lamr/guide/garageband/gbnd2ba38543/10.4.9/mac/13.5>）
  ⇒ **少了**：每次想测一个 loop 合不合就停播放、导入、再撤销。
* ⭐ **拖 loop 到空白区即自动建对应类型的轨**：`"A new track of the appropriate type (audio, MIDI, or Drummer) is created, and the loop is added to the new track."`（<https://support.apple.com/en-lamr/guide/garageband/gbndc1d3db81/10.4.9/mac/13.5>）
  ⇒ **少了**：在能听到声音之前先决定并创建音频轨／软件乐器轨／Drummer 轨。
* **预设是轨级且全工程稳定**：`"A track can have only one patch for the length of a project, and you can only choose patches that match the track type of the selected track."`（<https://support.apple.com/en-lamr/guide/garageband/gbndbd9d9b33/10.4.9/mac/13.5>）
  ⇒ **少了**：混音中途发现同一轨前面某一段悄悄换成了别的乐器预设。
* （`notFoundNote`）**没找到**相似音色、按用途搜索或"找相似"功能。Library 里的 patch 搜索**只按名字**；loop 搜索按名字、关键词按钮、分类列、声音包、调与 loop 类型。厂商维度只**间接**存在——`Sound Packs` 弹出菜单里有第三方厂商包。loop 有收藏（每个 loop 一个 Favorites 复选框，列视图里也有 Favorites），因四条上限未单列。

**采样器与素材 — `partial`**

* **Audio Editor 里非破坏编辑波形**：`"Edits you make in the Audio Editor are nondestructive, so you can always return to your original recordings."`（<https://support.apple.com/en-lamr/guide/garageband/gbndca7725e3/10.4.9/mac/13.5>）
  ⇒ **少了**：每切一次音频都要留一份安全副本。
* **框选切掉一段**：`"Drag the Marquee pointer over the part of the region you want to split."`（<https://support.apple.com/en-lamr/guide/garageband/gbnd1900dc0c/10.4.9/mac/13.5>）
  ⇒ **少了**：为了从一条 take 里切掉一段而打开外置波形编辑器。
* ⭐ **把音频变成可复用的乐器素材**：`"In GarageBand on Mac, drag an audio, MIDI, or Drummer region from the Tracks area to the Loop Browser."`（<https://support.apple.com/en-lamr/guide/garageband/gbndd0009b98/10.4.9/mac/13.5>）——并可给它打上调、风格、调性、乐器描述与情绪按钮。
  ⇒ **少了**：以后的项目里重录或重新导入同一段 riff——它变成了带标签、可搜索的 loop。
* **导入靠拖放**：`"In GarageBand on Mac, drag the audio file you want to import from the Finder to an audio track or to the empty area below the existing tracks in the Tracks area."`（<https://support.apple.com/en-lamr/guide/garageband/gbndd01649ed/10.4.9/mac/13.5>）
  ⇒ **少了**：在工程里试听自己的素材之前先走一道导入或转换。
* （`notFoundNote`）GarageBand for Mac **没有**内建采样器乐器：**没有**切片成 MIDI、**没有**采样循环点／起点可视化编辑、**没有**把文件切片自动映射到键域、也**没有**记载任何"直接从音频做乐器"的方式。唯一的乐器加载途径是软件乐器轨乐器槽里的 **Audio Units** 乐器插件（会替换原乐器插件）。Audio Editor 的可视化编辑是**波形级**的（移动、裁切、切分、合并、Flex Time），不是采样循环点编辑。

**混音面 — `found`**

* **送出／返回是固定的，不能自定义**：`"Each audio and software instrument track includes a Master Echo and Master Reverb slider, which you use to control the amount of Master Echo and Master Reverb used on the track."`（<https://support.apple.com/en-lamr/guide/garageband/gbnd1985213e/10.4.9/mac/13.5>）
  ⇒ **少了**：为了让几件乐器共享混响或回声而先搭 aux 轨与总线。
* **效果链顺序＝纵向顺序**：`"Reordering plug-ins can change the sound of a patch. Plug-ins work in sequence; the output of a higher plug-in is sent to the input of the plug-in below it."`（<https://support.apple.com/en-lamr/guide/garageband/gbndac55f7f8/10.4.9/mac/13.5>）
  ⇒ **少了**：猜信号路径——Plug-ins 区里的纵向顺序就是实际处理顺序。
* **逐轨自动化在轨头里**：`"An Automation button and an Automation Parameter pop-up menu appear in each track header. You can choose the parameter you want to automate—Volume fader, Pan knob, or any parameters for added effects or available Smart Controls—from the Automation Parameter pop-up menu."`（<https://support.apple.com/en-lamr/guide/garageband/gbnd939b92d8/10.4.9/mac/13.5>）——`Mix > Show Automation` 或 `A` 键。
  ⇒ **少了**：为每个插件学一套独立的自动化界面。
* **表就在轨头的音量滑杆里**：`"The level meter in a track's Volume slider shows the output volume for the track as the project plays."`（<https://support.apple.com/en-lamr/guide/garageband/gbnd79295c4f/10.4.9/mac/13.5>）
  ⇒ **少了**：只为了看哪条轨在削波而切到混音视图。
* （`notFoundNote`）GarageBand for Mac **没有**记载专门的混音窗口或控制台：主窗口区域是 Tracks 区、控制条、Library、Quick Help、Smart Controls、Editors、Note Pad、Loop Browser，音量／声像／插件都在轨头与 Smart Controls 里，所以**没有"编排→混音"的页面切换成本可数**。声音层面**有** A／B 对比（Smart Controls 菜单栏的 `Compare` 按钮，在已编辑与已保存的屏幕控件设置之间切换），因四条上限未单列。工程级削波表在控制条的音量滑杆上（绿→黄→红）。

**从零到一个想法 — `found`**

* **从现成模板开新工程**：`"In the Project Chooser, you can choose a template to use as the starting point for a new project."`（<https://support.apple.com/en-lamr/guide/garageband/gbndd0893c9b/10.4.9/mac/13.5>）——`File > New`（或 `⌘N`）打开 Project Chooser，左侧有 Project Templates 与 Recent。
  ⇒ **少了**：在能听到任何东西之前从空白搭轨道布局与乐器组。
* ⭐ **空工程里一次拖拽就出声**：`"A new track of the appropriate type (audio, MIDI, or Drummer) is created, and the loop is added to the new track."`（<https://support.apple.com/en-lamr/guide/garageband/gbndc1d3db81/10.4.9/mac/13.5>）
  ⇒ **少了**：别的 DAW 在第一个音响起前需要的"建轨／选乐器／导入"整串动作。
* **拖进来的 Apple Loop 自动合拍**：`"The added Apple Loop always matches the project tempo."`（同上）
  ⇒ **少了**：手工时间伸缩或移调一个 loop 来让它合上工程。
* ⭐ **两步得到一个完整鼓演奏**：`"If the project does not have arrangement markers: A Drummer track containing one 8-bar region is created. Two different presets associated with the drummer are loaded to the two regions."`（<https://support.apple.com/en-lamr/guide/garageband/gbnd88c6ef48/10.4.9/mac/13.5>）——`Track > New Track`（或 `⌥⌘N`）→ 选 Drummer。
  ⇒ **少了**：在能跟着自己的想法弹之前先编或先找一条鼓。

### 2.9 Reason（13）

> 来源：Reason Studios 官方 **Reason 13 操作手册**（`docs.reasonstudios.com/reason13/...`）。

**钢琴卷帘 — `found`**

* **Scales & Chords Player**：`"The Scales & Chords device either transposes incoming notes to fit a set scale, or transposes notes and generates chords that fit the desired scale."`（<https://docs.reasonstudios.com/reason13/working-with-players>）
  ⇒ **少了**：为了搭一条进行而必须懂功能和声或手画每个和弦音。
* **力度面板（随机化／加／减／缩放／渐变）**：`""Randomize" will randomize the velocity values by a set percentage value."`（<https://docs.reasonstudios.com/reason13/note-and-automation-editing>）
  ⇒ **少了**：为了去掉机械感而一根一根地推力度柱。
* ⭐ **Length 面板 + Make Legato（可重叠、可留缝）**：`"Click the Make Legato button to apply the overlap/gap."`（同上）——Length 面板可加／减／绝对设置音长，Make Legato 用 Overlap 值让音符延到下一个选中音（0）、压过它（正）或留缝（负），**永不移动起点**。
  ⇒ **少了**：当 pad 或弦乐声部要平滑衔接时，一个个拖右边缘。
* ⭐ **卷帘里就有控制器车道**：`"Any recorded performance controller/parameter automation in the note clip has its own separate Controller Edit Lane."`（同上）——一个 note clip 在 Edit Area 里分成 **Note Edit Lane** 与 **Controller Edit Lane**。
  ⇒ **少了**：在卷帘和另一个自动化视图之间切来切去，才能对着音符塑形力度与调制轮。
* （`notFoundNote`）Reason 13 手册里**没找到**概率／chance 控制与条件触发（"if previous"），也**没有**扫弦功能；琶音是**独立的 Dual Arpeggio** Player 设备，不是卷帘里的控件。多车道"ghosted" clip 编辑记在同一页，因四条上限未列。

**鼓编程 — `found`**

* **Redrum 的 16 步音序器**：`"Indeed, it does have a row of 16 step buttons that are used for step programming patterns, just like the aforementioned classics."`（<https://docs.reasonstudios.com/reason13/redrum-drum-computer>）——32 个 pattern 记忆分四组，pattern 变化可录也可在主音序器里画成 pattern-change 事件。
  ⇒ **少了**：在能听到律动之前，先在主音序器里一个音一个音地画一个基本 beat。
* **Kong 的 Mute Group（choke）**：`"Mute Groups can be used if you want one pad to automatically mute another sound in the same Mute Group."`（<https://docs.reasonstudios.com/reason13/kong-drum-designer>）——16 pad 对 16 个独立鼓通道，三个 Mute Group。
  ⇒ **少了**：每次闭镲一响就手工裁掉或静音开镲。
* **Drum Edit View 里逐击可编辑**：`"In Drum Edit View Mode the keyboard has been replaced by a list showing the corresponding Redrum drum sound channel names."`（<https://docs.reasonstudios.com/reason13/note-and-automation-editing>）——每次击打是一个独立音符盒，位置、长度、力度各自可改。
  ⇒ **少了**：只为了修一个迟到或过响的击打而重录整条鼓 take。
* ⭐ **ReGroove：从音符提取 groove 成可复用 patch 再套到任意轨**：`"This button converts the notes in a selected clip into a groove patch. The patch can then be used right away in the active ReGroove Mixer Channel or saved to disk as a new groove patch."`（<https://docs.reasonstudios.com/reason13/the-regroove-mixer>）——patch 可带时间、力度、部分 patch 还带音长；通过 32 个 groove 通道与 Groove Amount 推子套用。
  ⇒ **少了**：为了让每条轨都带上一个已经弹过或导入过的感觉而手工改时间与力度。
* （`notFoundNote`）手册**没有**记载直接从**音频 clip** 提取 groove 模板：ReGroove 读的是**音符 clip**；从音频出发的记载路径是先把它切成 REX loop，再用 Dr. Octo Rex 的 "Copy Loop To Track" 把音符拉到轨上，然后做 groove patch。另有逐通道 Shuffle（50% 直、66% 三连）与 Slide 旋钮，因四条上限未列。

**音色发现 — `found`**

* **Type／Category／Tags + 工厂 patch 全部手工打过标签**：`"A more subjective description of a sound. All patches and sounds in the Reason Factory Sound library have been manually tagged, to make them easier to search for and filter out."`（<https://docs.reasonstudios.com/reason13/sounds-patches-and-the-browser>）——Info 区列出 Name／File Type／File Location／Author／Categories／Tags。
  ⇒ **少了**：记住上个月听到的那个能用的贝斯在哪个 ReFill 或文件夹里。
* **Favorite Lists**：`"Favorite Lists are custom collections of patches, samples or loops."`（同上）——可以把文件拖进去或从右键菜单加入，并作为 `All Locations`／`User Library`／`Reason Library` 之外的一级位置出现在浏览器里。
  ⇒ **少了**：每个会话开头重跑一遍同样的标签搜索，只为找那几件真正在用的 patch。
* ⭐ **Patch Browse 模式：单击即在后台加载、弹键盘试听、Return 提交、Esc 还原**：`"In Patch Browse mode you can click patches (or use the computer up/down arrow keys) to load them in the background."`（同上）
  ⇒ **少了**：为了知道一个音色是什么样而先提交它、或者先把音乐停下。
* ⭐ **拖浏览器条目到机架／音序器即建目标设备**：`"For example, if you are browsing piano patches for a device and stumble upon a nice bass sound, you can just drag the bass patch into the rack to create a new device."`（同上）——浏览器保持原 Browse Focus，所以换格式的 patch 直接**替换**正在浏览的设备。
  ⇒ **少了**：关掉浏览器、建一个空设备、再把音色载进去这一串第二步。
* （`notFoundNote`）**没找到**"相似音色"或按用途搜索——浏览器的搜索是一个文本 Filter 字段，打字时会提示 Category/Tag 属性。也**没有**专门的厂商过滤按钮：厂商／来源信息只以可编辑的 `Author` 字段出现。"预设与工程一致"只有间接记载：采样器、鼓机与 Dr. Octo Rex 的 patch 引用磁盘上的采样文件，文件被移动／改名／删除时会弹 **Missing Sounds** 窗口。

**采样器与素材 — `found`**

* **Mimic 在瞬态处自动打切片标记**：`"Slices are added automatically at transients according to the Sensitivity knob setting."`（<https://docs.reasonstudios.com/reason13/mimic-creative-sampler>）——标记是黄色的，最多 92 片。
  ⇒ **少了**：把每一个鼓击都找出来并手工剪开。
* **Slice Mode：切片从 C1 起半音触发，且可手动增删移动**：`"In Slice Mode you select one of the eight Slots for playback, and slice a (longer) sample, manually and/or automatically."`（同上）
  ⇒ **少了**：在外置编辑器里把 loop 切好、再导回来才能弹。
* ⭐ **循环长度在波形上画出来**：`"In all modes except for Slice Mode the Loop Length is visually indicated with a transparent red region in the Waveform Display, so you can see exactly where the loop is."`（同上）——反向时显示为蓝色。
  ⇒ **少了**：采样一边播一边靠试错找循环点。
* **Dr. Octo Rex：REX loop 的切片自动从 C1 向上半音分布**：`"The slices are automatically distributed in semitone steps, with the first slice on MIDI note C1, the second slice on C#1 and so on, with one note for each slice."`（<https://docs.reasonstudios.com/reason13/dr-octo-rex-loop-player>）
  ⇒ **少了**：在能把切好的鼓 loop 半音演奏之前先手工搭一张键位图。
* （`notFoundNote`）手册用 **Pitch Mode** 与 **Multi Slot Mode** 表示 one-shot 式播放，而不是字面叫 one-shot 的模式；**没有**记载 Mimic 内部的自动键域映射。NN-XT 则有手工键位图，外加 `Automap Zones`（把选中的 zone 排成基本键位图）与 `Set Root Notes from Pitch Detection`（检测根音）。

**混音面 — `found`**

* **送出／返回是全局的，最多 8 路**：`"Send effects, which are global for all channels in the Main Mixer, are connected to the Master Section rack device. Up to 8 Send effects can be used simultaneously."`（<https://docs.reasonstudios.com/reason13/the-main-mixer>）——每通道的 FX Sends 段有 `On 1-8`、`Level 1-8` 与 `PRE` 按钮，**FX Return 段是主控条上可显隐的一部分**。
  ⇒ **少了**：在每个通道上实例化同一台混响，并靠猜每条通道到它的平衡。
* ⭐ **信号路径按钮重排内部链**：`"If this button is activated, the Insert effects are placed before the Dynamics and EQ sections in the signal path."`（同上）——`Insert Pre` 把插入挪到 Dynamics 与 EQ 之前，`Dyn Post EQ` 把 EQ 挪到 Dynamics 之前；两个都亮则顺序是 Insert→EQ→Dynamics。
  ⇒ **少了**：只为了让压缩在 EQ 之前而重建或烘培一条通道。
* **自动化需要手工建 Mix Channel 轨**：`"Mix Channel tracks are created manually and used for automating channel strip parameters"`（同上）——主控参数由 Master Section 轨覆盖；在 Spectrum EQ 窗口里做的 EQ 移动可在录音时录成音序器自动化。
  ⇒ **少了**：因为混音动作根本没被录下来，所以在每一遍里现场重演一次推子或 EQ。
* **一次按键到混音台（F5）**：`"By pressing [F5] on your keyboard or selecting "View Main Mixer" from the Windows menu."`（同上）——另有 Mixer 头部的 Show/Hide 图标，或 `Ctrl/Cmd+F5` 分离成独立窗口。
  ⇒ **少了**：每次要查一个电平或一路送出就丢掉在编排里的位置。
* （`notFoundNote`）我在 Main Mixer 章节、菜单与对话框参考、以及快捷键列表里**都没找到** A/B 对比功能，因此**没有**记载的方式在主控台两个状态之间做快照切换。通道表记在同一页（跟随 Big Meter VU 偏移的 VU 式表），因四条上限未列。

**从零到一个想法 — `found`**

* **工厂 Template Songs**：`"To create a new song from a Template, select "New from Template" from the File menu and then select one of the Template Songs that appear in the sub-menu."`（<https://docs.reasonstudios.com/reason13/song-file-handling>）——一条命令就把模板作为新的未保存文档打开。
  ⇒ **少了**：在能开始写之前重建惯用的轨、路由与效果骨架。
* ⭐ **`Ctrl/Cmd+I` → 点一个 patch 即在后台建设备**：`"Click a patch in the list to create a new device in the background."`（<https://docs.reasonstudios.com/reason13/sounds-patches-and-the-browser>）——`快捷键 → 点 patch → Return`。
  ⇒ **少了**：先挑合成器、再去找一个配得上脑子里已经听到的想法。
* **Scales & Chords 挂在乐器下，单音变和弦**：`"The Scales & Chords device either transposes incoming notes to fit a set scale, or transposes notes and generates chords that fit the desired scale."`（<https://docs.reasonstudios.com/reason13/working-with-players>）——Notes 旋钮设 1–5 个和弦音；可以在 note clip 里只写单音，让 Player 生成和弦。
  ⇒ **少了**：能哼出旋律却写不出底下和弦时的卡壳。
* **Beat Map 用 XY 图生成鼓型**：`"If you want a taste of what can be done with multiple Beat Maps in combination with other devices, check out the Demos and Song Starters folder."`（同上）——拖动十字准星，另有每鼓的 Density／Lock Pos／Mirror；Reason 还带 `Demos` 与 `Song Starters` 文件夹。
  ⇒ **少了**：对着空编排发呆，而其实只需要一个节奏起点。
* （`notFoundNote`）Reason 13 手册里**没有**内建的和弦进行库设备；播放存好的和弦集与进行型的 **Chord Sequencer Player** 是 Reason+ 的 Rack Extension，另见 <https://docs.reasonstudios.com/plusre/chord-sequencer-player>。

### 2.10 Native Instruments Maschine 3 ＋ Komplete Kontrol MK3（**音色发现的标杆**）

> 来源：NI 官方 **Maschine 3 软件手册**（2024-06-11 版 PDF）、**Komplete Kontrol MK3 手册**（2023-10-17 版 PDF），
> 以及官方 Maschine 3.5 发行说明。原始页面在 `native-instruments.com/fileadmin/ni_media/downloads/manuals/`。

**钢琴卷帘 — `partial`**

* **Chord 引擎按音阶与所按 pad 自动生成和弦**：`"The Chord engine can automatically generate chords depending on the selected scale and the pads you press."`（<https://www.native-instruments.com/fileadmin/ni_media/downloads/manuals/maschine/Maschine_3_software_manual_English_6.11.24.pdf>）
  ⇒ **少了**：自己算哪些和弦音在所选音阶里——按一个 pad 就出和弦。
* ⭐ **正在生效的音阶在卷帘里高亮**（Maschine 3.2.0）：`"The active scale is highlighted in both software and hardware Piano Rolls."`（<https://inmusicsupport.freshdesk.com/en/support/solutions/articles/69000879550-what-s-new-in-maschine-3-5-and-maschine-2-2-0>）
  ⇒ **少了**：手工改 MIDI 时猜哪些行在调上。
* **力度轨道常驻**：`"One MIDI track is always present in the MIDI pane: the Velocity track. This track holds the velocities of all the events/notes for the focused Sound in the Pattern."`（Maschine 3 手册 PDF，同上）
  ⇒ **少了**：每次要调力度就开一个独立编辑器或对话框。
* ⭐ **自动化／调制就在卷帘下方可视可编**：`"The Control Lane provides a visual overview and editing tools for the modulation and the MIDI/host automation of each parameter."`（同上）
  ⇒ **少了**：为了画或修一条参数曲线而切到独立的自动化窗口。
* （`notFoundNote`）Maschine 3 软件手册与 3.0–3.5 发行说明里**没找到**概率／chance 参数、条件触发、humanize 功能或扫弦功能。**没找到**折叠区段命令；多 Sound 编辑靠把 Pattern Editor 在 Group 视图与 Keyboard 视图之间切换，而**音阶本身不能在卷帘里设**：`This update does not yet include full access to set or change scales from within the Maschine 3 software Piano Roll.` 音长编辑只有鼠标拖音符边界（`Drag the left/right border of a note Resizes the selected notes by moving their start/end position according to the Step Grid.`），**没找到**专门的 legato 命令。

**鼓编程 — `partial`**

* **步进编程与实时录制同一个 Pattern Editor**：`"The Pattern Editor features both step programming and real-time recording and is the basis for each Pattern."`（Maschine 3 手册 PDF，同上）
  ⇒ **少了**：在"步进输入"和"现场弹的鼓"之间换工具。
* **每件鼓自成一条混音通道**：`"From an routing point of view, each Sound, each Group, and the Master represents a distinct channel in Maschine."`（同上）
  ⇒ **少了**：为了一件鼓的单独处理而把它烘培或分出来。
* **八组 Choke**：`"Within a Group, each pad can be assigned to one of eight Choke groups."`（同上）
  ⇒ **少了**：每次闭镲响就手工裁或淡出开镲。
* **Swing／groove 是逐通道属性**：`"The groove controls the swing, that is the rhythmic relationship between events in the selected channel (Sound, Group, or Master)."`（同上）——有 Amount／Cycle／Invert，可在 Sound、Group 或 Master 层设。
  ⇒ **少了**：为了得到 shuffle 的感觉而手工推每一击。
* （`notFoundNote`）⭐ **既没有 groove pool，也没有"从音频 clip 提取时间感觉再套到别处"**。Maschine 的 Groove 属性只是**一个 Swing 页**（Amount／Cycle／Invert），而且手册明确说 groove 只影响播放：`The picture above only illustrates how the groove function affects the sound — adjusting the Groove properties will not effectively move events in the Pattern Editor.`

**音色发现 — `found`**（本文的标杆）

* ⭐ **按标签／品牌／产品／库／文本／用户预设／收藏过滤**：`"Sophisticated browser functionality allows you to filter sounds by tags, brand, product, bank, text search, user presets and Favorites, helping you to quickly and intuitively find the right presets for your musical needs."`（<https://www.native-instruments.com/fileadmin/ni_media/downloads/manuals/komplete_kontrol/Komplete_Kontrol_MK3_Manual_English_200525.pdf>）
  ⇒ **少了**：在长预设表里滚——可以把库收窄到想要的品牌、声音类型与性格。
* ⭐ **单击试听而不加载，双击才载入**：`"Click a preset to audition the sound without loading the preset. Double-click a preset to load it into the current slot."`（同上）
  ⇒ **少了**：为了知道一个预设合不合而覆盖掉槽里已有的音色。
* ⭐ **试听走 Cue 总线，不碰主输出**：`"The Audition signal is sent to the Cue bus of Maschine. This allows you to pre-listen to Instrument presets on a distinct output pair (e.g., in your headphones) without affecting Maschine's main output."`（Maschine 3 手册 PDF，同上）
  ⇒ **少了**：为了查一个预设或采样而把正在跑的工程静音或停掉。
* ⭐ **拖 Sound 到槽位即载入并替换原内容**：`"Drag and drop: Select the desired Sound in the Browser or in your operating system and drag it onto the desired Sound slot in the Sound List (or the corresponding cell of the pad grid in Pad view, refer to above) to load it in that Sound slot. Any Sound previously loaded in that slot will be replaced."`（同上）
  ⇒ **少了**：往槽里装新声音之前先清空或重置它。
* （`notFoundNote`）**没找到**专门的相似音色或按用途搜索命令；最接近的是按 **Character** 标签浏览：`This offers an additional flexible level of tagging that allows you to browse Instruments with similar characteristics to find a range of samples that meet your identified criteria.` 收藏在两个产品间共享：`Favorites are automatically shared across Maschine and Komplete Kontrol browser databases on one computer.` 在 Komplete Kontrol 里，**只有第一个插件槽**能载乐器、loop 或 one-shot，其他槽只能载效果。

**采样器与素材 — `found`**

* **切片把 loop 拆成单个 Sound，并可导出到同一个 Sound 的不同音或同一个 Group 的不同 Sound**：`"Slicing allows you to chop up loops to extract single Sounds (the drum sounds of a drum loop for example), but it's also good for preparing a loop to be played back at another tempo without changing its pitch or timing. The resulting Slices can then be exported to different notes of the same Sound or to different Sounds of the same Group."`（Maschine 3 手册 PDF，同上）
  ⇒ **少了**：在使用一个鼓 loop 的各个击打之前，手工把它切成一个个音频文件。
* ⭐ **点 Apply 自动映射到键位并切到键盘模式**：`"If you click Apply, the Slices will be mapped to individual notes of this Sound, the Sample Editor will be replaced by the Pattern Editor in Keyboard view, and the pads of your controller will switch to Keyboard mode so that you can directly play your Slices on the pads."`（同上）
  ⇒ **少了**：切完 loop 之后手工搭键域与 zone 映射。
* **Auto Sampler 把硬件合成器／软件乐器／一整条链采成可演奏的采样器乐器**：`"Auto Sampler makes it easy to create sampler instruments that you can use in Maschine Software. You can create a sampler instrument from a MIDI-capable hardware synthesizer, a software instrument, or a combination of synthesizers, hardware effects, and effect plug-ins."`（同上）
  ⇒ **少了**：把外部合成器的每一个音手工录下来并映射。
* **Maschine 3.5 重做 Sampler 界面（波形、播放范围、循环标记）**：`"The new Sampler UI includes updated Main and FX views, improved waveform display, timeline handling, play range markers, loop markers, and playhead display."`（<https://inmusicsupport.freshdesk.com/en/support/solutions/articles/69000879550-what-s-new-in-maschine-3-5-and-maschine-2-2-0>）
  ⇒ **少了**：为了看和设循环点而离开 Mixer 视图去另一个编辑器里找。

**混音面 — `partial`**

* **Aux 1／2 送出（可选目的地、电平与前／后）**：`"Click the AUX 1 or AUX 2 label to select a destination for this aux output, adjust its level via the little knob on the right, and choose its pre/post tapping point by clicking the Post or Pre label."`（Maschine 3 手册 PDF，同上）
  ⇒ **少了**：为了喂一台共享混响而逐条打开每个 Sound 的 Output 属性页。
* **FX 链顺序靠拖**：`"Drag and drop Plug-ins to move them across the list."`（同上）
  ⇒ **少了**：只为了改处理顺序而删掉再重加效果。
* **电平表＋峰值数值**：`"Additionally, the level meter shows you at any time the level of the channel. The peak level value appears in gray above the level meter and fader."`（同上）
  ⇒ **少了**：为了看一条通道是否削波而开一个独立的表头插件。
* **一次点击切换 Arrange／Mix**：`"Click the Mix View button in the Maschine Header to switch between the Arrange view and the Mix view."`（同上）
  ⇒ **少了**：在编排时为了够到混音台而在菜单里找。
* （`notFoundNote`）Maschine 3 软件手册与 3.0–3.5 发行说明里**没找到** A/B 对比功能。参数自动化在混音台里也**不反映**：`Parameter modulation is not indicated in the Mixer.` 送出效果的做法是把一个效果载进某个 Sound 或 Group 的第一个插件槽，再用 Aux 1／2 把别的通道送过去；**混音台里没有专门的返回通道列表**。

**从零到一个想法 — `found`**

* **`+PATTERNS` 连 Pattern 一起加载 Group**：`"Use the +PATTERNS button to load a Group with its saved Pattern. When +PATTERNS is selected the Sounds and Patterns of the selected Group are loaded."`（Maschine 3 手册 PDF，同上）
  ⇒ **少了**：在听到任何东西之前先编一个 beat——载入的工厂 Group 本身就带 Pattern。
* **模板工程**：`"Any Project file can be used as a template; this can be from the Maschine Library, or you could create a file, for example with your preferred instruments and effects already loaded into the Plug-in slots."`（同上）
  ⇒ **少了**：每个工程开头重建同一套起手乐器与效果。
* **Chord Set 模式把一组和弦映到前 12 个 pad**：`"Chord Set: This special mode maps a set of chords onto the first 12 pads of your controller."`（同上）
  ⇒ **少了**：为了快速记下一条进行而必须知道和弦指型。
* ⭐ **工程在放的时候 Autoload 把选中项装进聚焦槽**：`"When Autoload is activated, any item that you select in the result list of the Library pane or Files pane is automatically loaded into the focused Group or Sound slot or into the selected Plug-in slot, replacing any content currently in that location."`（同上）
  ⇒ **少了**：为了在上下文里试另一个 loop 而停播放、重建编排。

---

## ③ 差距三态表

> 三态定义：**有 ✓** ＝ 创作者今天在界面上能做到，且有文件依据；**半有 ⚠️** ＝ 只做到一部分（引擎有界面没有、只覆盖一条动线、只覆盖一种对象、需要额外条件）；**没有 ✗** ＝ 全仓找不到，我写明搜过什么。
> "主流 DAW 的做法"一栏只引 §② 已逐字引用过的内容，不新增未引用的说法。

### 3.1 钢琴卷帘深度

| 能力 | 主流 DAW 的可核做法 | 本仓 | 本仓文件依据 |
| --- | --- | --- | --- |
| 音阶高亮／折叠到音阶 | **Live 12**：`Fold to Scale`（`G`／Scale 按钮／View 菜单），`immediately hide all key tracks that do not belong to the scale`；**Cubase**：Key Editor 的 Scale Assistant，不在音阶上的音**在卷帘里就是另一种底色**；**FL**：`Snap to scale`（约束音符、吸附进来的 MIDI、并把非音阶音变暗）；**Logic**：`Scale Quantize`（按音阶／调量化音高）；**Studio One 7**：卷帘里可**自定义音阶**；**Reason**：`Scales & Chords` **Player 设备**（转调＋生成和弦）；**Maschine**：3.2.0 起正在生效的音阶在**软件与硬件卷帘里都高亮**，但**不能**在卷帘里设／改音阶；**Bitwig**：**卷帘自身没有**音阶高亮，只有 `Key Filter` Note FX 设备与 `Multi-note` 和弦设备；**REAPER**：`Scale and Chord` 的 key snap ＋可载 **`.reascale`** 文件；**GarageBand**：**没有**音阶高亮 | **有 ✓**（Studio 卷帘） | `src/components/sequencer/PianoRollLane.tsx:1584-1599` 调式选择器；`src/i18n/locales/studio.ts:600` `roll_scale_select_title`"选择用于网格高亮与和弦配置的调式音阶"；`PianoRollLane.tsx:1867-1876` Fold 按钮；`studio.ts:581` `roll_fold_hint`"折叠网格仅显示当前音阶音高" |
| 和弦工具（生成／检测／转位／进行） | **Live 12**：`Stacks` MIDI Tool；**Logic**：Chord track＋Chord Trigger；**FL**：`Chord Stamp`（点一下即在该音高与时间放一个和弦）；**Studio One**：从**音频** `Detect Chords` 分析出和声并显示在区段底边；**Cubase**：Chord Pads；**Reason**：`Scales & Chords` 的 Chords 功能（单音出 1–5 音和弦，且全在音阶内）；**Maschine**：Chord 引擎 ＋ `Chord Set` 模式；**GarageBand**：选中重叠音符即显示和弦名（**自动检测**） | **有 ✓** | `PianoRollLane.tsx:1900-1918` 和弦印章（单音／三和弦／七和弦／九和弦／sus4／五和弦）；`:1921-1952` 转位 ▲▼、Drop-2；`:1999-2043` 进行套件（选择／试听／写入）；独立页 `src/views/ChordProgressionsView.tsx`＋`src/data/popularProgressions.ts` |
| 力度编辑 | **Logic**：`Velocity` 工具（在音符上纵向拖）；**Reason**：Velocity 面板有 Randomize（按百分比）＋加／减／缩放／渐变；**GarageBand**：卷帘头的 Velocity 滑杆；**Maschine**：**常驻**的 Velocity 轨道；**FL**：`Levels` 轮盘随机化力度／声像／音高 | **有 ✓** | `src/components/sequencer/VelocityLane.tsx`；`PianoRollLane.tsx:1646` 力度车道开关；`studio.ts:583-587` 四档预设 + `roll_vel_ramp` 渐强 |
| 人性化 | **Logic**：MIDI Transform 预设 `Humanize`（对位置、力度、音长加随机值）；**Live**：`Velocity Deviation`（力度在范围内**每次播放**随机）；**Bitwig**：Quantize 面板里的 `Humanize` 参数；**Cubase**：`Velocity Variance` 控制器车道（实时随机力度）；**REAPER**：`Humanize` 命令；**FL**：和弦进行工具的 `Humanize`（含 strum timing）；**Studio One**：Pattern 的 `Delay` 式偏移（逐**步**，不是逐音符）；**Maschine**：我**没找到** humanize；**GarageBand**：**没找到** | **有 ✓**（一次性动作，不是每遍随机） | `PianoRollLane.tsx:1977` Humanize 按钮；`src/features/sequencer/hooks/usePatternActions.ts:89` humanize 分支；`studio.ts` `toolbar_quick_humanize` |
| 概率／条件 | **Live**：`Play All`／`Play One` 两种概率组；**Bitwig**：⭐ **每个音符自带 Chance**（`Chance expressions represent the likelihood that any note will be played`）；**Cubase**：⭐ **Play Probability 是一条控制器车道**，逐音符可设并在车道上拖；**Logic**：Chance 只在 **Step Sequencer** 的编辑模式里（不在卷帘）；FL／REAPER／Reason／Maschine／GarageBand 我**都没找到**（FL 只有 note Mute 与 level 随机化） | **半有 ⚠️**：**按"步"**有，**按"音符"**没有 | `VelocityLane.tsx:27` `probability` 维度；`velocity/gate/probability/ratchet` 四维度来自 `src/features/sequencer/stepParameters.ts`；卷帘的音符对象是 `{stepIdx, midi, gate, velocity}`，**不含 probability**（`PianoRollLane.tsx:2704` 的元信息只列 `gate`／`velocity`） |
| Ratchet／音符重复 | **Logic**：Step Sequencer 每步的 `note repeat`；**Cubase**：Pattern Editor 的 Parameter Lane 里有 `Repeats`；**Studio One**：Pattern 的 Repeats。**其余各家我在卷帘里没找到**音符级的 ratchet | **半有 ⚠️**（按步） | `VelocityLane.tsx:28` `ratchet` 维度 |
| Legato／音长编辑 | **Live**：`Changing Note Length`／Fit to Time Range；**Bitwig**：`Make Legato`（`ends immediately before the next event begins`）；**Logic**：`Edit > Trim` 的 **Force Legato**；**Cubase**：`MIDI > Functions > Legato`（`extended to the start of the next notes`）；**REAPER**：Edit 菜单的 `Set note ends to start of next note (legato)`；**Reason**：Length 面板的 **Make Legato**（可用 Overlap 值做重叠或留缝，**永不移动起点**）；**GarageBand**：拖音符两端 | **有 ✓** | `PianoRollLane.tsx:1857` Legato；`studio.ts:542` `roll_legato_hint`"把选中的音符延长到下一个音符的起点（或循环末尾）。它也可能把音符变短"；`:1843` 量化音长；`PianoRollV2.tsx:227-252` 拖右边缘改长 |
| 折叠 | **Live**：Fold／Fold to Scale；**Bitwig**：`Fold Notes` 按钮（`Micro-pitch editing mode is not available while the Fold Notes button is enabled.`）；**Maschine**：**没找到**折叠命令；**Cubase**：**没找到**"折叠未用音符"命令；**Logic**：**没找到**卷帘的折叠视图；**FL**：**没找到**折叠模式 | **有 ✓** | 同"音阶高亮"一行 |
| 扫弦／琶音 | **Live**：`Strum` MIDI Tool（`Strum Low`／`Strum High`／`Tension` 定形状）；**FL**：和弦进行工具的 `Humanize` 含 strum timing，另有独立的 Strum 控制；**Logic**：`Arpeggiator`／`Chord Trigger` **独立 MIDI 插件**；**Studio One**：**Note FX** 的 Arpeggiator（32 步 Pattern 驱动力度与 gate）；**Reason**：独立的 **Dual Arpeggio** Player 设备。**Cubase／REAPER／GarageBand 我都没找到**卷帘内的扫弦或琶音命令（GarageBand 的 Arpeggiator 在 Smart Controls 菜单栏，不在卷帘里） | **有 ✓**（琶音在卷帘内，扫弦在和弦风格层） | `PianoRollLane.tsx:1954-1975` `piano-roll-arp-up`／`arp-down`；`src/audio/ChordAudioEngine.ts:24` `PlayingStyle = "block"｜"strum"｜"arpeggio"｜"ballad"`；`src/audio/chordStyles.ts` 按乐器门控（"piano 永不 strum"） |
| 多片段同时编辑 | Live：多 clip（含跨轨、跨 scene）；Logic：多 region；**Bitwig**：`layered editing mode` 可同时看并编辑多个 clip 或轨；**REAPER**：选中的多个 MIDI 条目可同时编辑；**Cubase**：靠编辑器的 **Visibility 标签页**（不是"同时显示"）；**FL**：只有 Ghost Notes（`Alt/Opt+V`）／Editable ghosts，**不是**多片段编辑模式 | **没有 ✗** | `PianoRollLane.tsx:1564-1580` 卷帘一次只挂一条轨（`piano-roll-track` 下拉选轨）；`PianoRollV2.tsx:26-27` 只收 `notes: readonly NoteEvent[]` 一条轨的音符 |
| 卷帘内可见自动化 | **Logic**：`Show/Hide Automation` 打开 Automation/MIDI 车道；**Studio One**：`Show/hide Automation Lanes`（Piano 与 Drum 视图都有）；**GarageBand**：Region automation `appears directly below the note being automated`（`A` 键）；**Maschine**：Control Lane 就在卷帘 Event 区下方；**Reason**：note clip 分成 Note Edit Lane ＋ **Controller Edit Lane**。反例：**Live** 在 clip 的独立 Envelope Editor 视图模式里（不叠在卷帘上）；**Bitwig** 在独立的 Automation Editor Panel；**REAPER** 下方面板装的是 MIDI CC 车道；**Cubase** 是工程窗口里的独立自动化轨 | **没有 ✗** | 我在 `src/components/` 与 `src/views/` 下 grep `automation` **0 命中**；自动化只存在于数据／导入层（`src/data/arrangementEdits.ts`、`src/data/logicToArrangement.ts`） |
| （注）纯函数已就位但**没有界面** | — | **半有 ⚠️** | `src/data/noteEdits.ts` 有 `quantiseNotes`／`swingNotes`／`snapNotesToScale`／`transposeNotes`／`setNoteLength`，但**唯一引用者是它自己的测试** `src/test/noteEdits.test.ts:2`——`docs/PRO_EDITOR_PLAN.md:82` 自己写着"先有定义，再有界面" |

### 3.2 鼓编程

| 能力 | 主流 DAW 的可核做法 | 本仓 | 本仓文件依据 |
| --- | --- | --- | --- |
| 步进音序器 | **Logic**：Step Sequencer（行上写的是套鼓件名与图标，不是 MIDI 音名）；**FL**：Channel Rack 的步进格（`Each button (step) in the grid represents a 16th note.`）；**Cubase**：Pattern Editor（最多 **128** 条 step lane、**128** 步、无限 pattern 变体）；**Reason**：Redrum 的 16 步音序器（32 个 pattern 记忆分四组）；**Bitwig**：`Stepwise`（多行步进 Note FX 设备）；**Studio One**：Pattern 的 **Drum Mode**（配 Impact XT 时**自动写音符／乐器名**，每行可有自己的短语长度与音符分辨率）；**Maschine**：Pattern Editor 同时支持步进编程与实时录制。**Live 12 桌面版手册里没有** Drum Rack 自身的网格步进器（在 Push 硬件上）；**REAPER 没有**专门步进格，只有 MIDI 编辑器的 **step recording**；**GarageBand 没有**步进器（走 Drummer） | **有 ✓** | `src/components/sequencer/StepCell.tsx`、`TrackRow.tsx`、`SequencerPanel.tsx`；另有一个欧几里得生成器 `src/components/sequencer/EuclideanModal.tsx` |
| 鼓组映射 | **Live**：Drum Rack 的 pad＝MIDI 音，**拖任何浏览器对象到 pad 上自动映到该 pad 的音并建链**；**Logic**：Drum Machine Designer 的 pad；**Cubase**：Drum Machine **128 个 pad**分八个 4×4 网格，任何乐器或鼓采样可指派到每个 pad；**Bitwig**：Drum Machine 的每条链由**一个特定音高**触发（`C1 for a kick drum, F#1 for closed hi-hat`）；**Maschine**：一个 Group 的 16 个 pad 各持一个 Sound，且**每个 Sound 自成一条混音通道**；**REAPER**：靠每个 ReaSamplOmatic5000 实例自己的 `Note start`／`Note end` | **有 ✓**（显式表，非推断） | `src/audio/drumRoles.ts` 把 kick／snare／hihat／percussion 映到 GM 音高 36／38／42／82，并在注释里引 `virtuosity-drums-basic` 自己的 `keymap_basic.sfz`；`DRUM_KIT_ASSET_ID = "virtuosity-drums-basic"`（`src/audio/drumRoles.ts:101`） |
| Choke 组 | **Live**：16 个 Choke 组可指派；**Logic**：DMD 的 `Exclusive Group`；**Bitwig**：`Choke targets`／`Choked by` 右键子菜单；**Cubase**：Drum Machine Group 页的 `exclusive group`；**FL**：`Cut`／`Cut by`；**Studio One**：Impact XT 的 Choke group **1–32**；**Reason**：Kong 的 **Mute Group**（3 组）；**Maschine**：每组 8 个 Choke 组。**GarageBand 没有**（无步进器、无 choke）；**REAPER 没有原生**（指南只提 `JS: MIDI/midi_choke` 配合 ReaSamplOmatic5000） | **半有 ⚠️**：**引擎做了，界面没有** | `src/audio/DrumKitModels.ts:479` 写明"the open hi-hat, choked by the next closed hat"，`:494-508` 有可单测的 choke 锚点；但 `src/components/`＋`src/views/` 下 `choke` **0 命中** ⇒ 创作者**不能指派**哪两件互相掐 |
| 每击独立编辑 | Logic：每步 velocity／pitch／gate time／note repeat；Live：每个 chain 独立设备；Reason：**Drum Edit View** 里每次击打是独立音符盒（位置／长度／力度各自可改）；Maschine：每个 Sound 自成一条混音通道；Cubase：Pattern Editor 的 Parameter Lane。反例：**GarageBand** 明确**没有**——Drummer Editor 的改动只影响选中区段，击打不是可独立编辑的对象 | **有 ✓** | `VelocityLane.tsx` 四维度（velocity／gate／probability／ratchet）逐击可编辑；`PianoRollLane.tsx:2704` 每音符元信息 |
| Swing | Logic `Q-Swing`（50–75% 最实用）；Live Groove Pool；Bitwig **Global Groove**（Shuffle Rate 1/8 或 1/16，0–100%，另有 Accent／Phase）；FL **Global Swing ＋ 逐通道 Swing Mix**；Cubase 只在 Sample Editor 的 tempo-matching 主题下；Reason 逐通道 Shuffle／Slide；Maschine **逐通道** Groove（Amount／Cycle／Invert，只影响播放）；GarageBand 在 **Drummer Editor** 里的 Swing 旋钮 | **有 ✓**（百分比） | `src/components/sequencer/Toolbar.tsx:1778-1784` 全局 swing %；`SequencerPanel.tsx:167` `onChangeTrackSwing` 每轨 swing |
| **从音频提取 groove 再套到别处** | **Live**：拖 clip 进 Groove Pool 或 `Extract Groove` → 得到一个 groove 文件 → **拖到别的 clip 上**立即套用；**Logic**：`Make Groove Template`（音频需 Flex）＋ `Match Groove Track`（一条轨当 master，整工程跟它）；**FL**：在 NewTime 里把标记位置存成 **`.groovepat`**，再载到别的音频上由 Groove 旋钮移动标记；**Cubase**：Sample Editor 里打 hitpoints 提取 → 感觉进 **Quantize Presets** 菜单 → 套到别的素材；**Studio One**：Quantize 面板切 **Groove 模式** → 把 kick 事件**拖进 Groove 面板** → 再量化贝斯事件；**Reason**：ReGroove 把**音符**转成可复用 groove patch（32 个通道 ＋ Groove Amount），**但要从音频出发得先切 REX 再用 Dr. Octo Rex 的 Copy Loop To Track**；**REAPER**：动态分割 ＋ 生成 **chromatic MIDI**（把演奏转成可移动的音符，不是 groove 模板）；**GarageBand**：Drummer 的 kick／snare 可跟随另一条轨（源轨需开 `Enable Flex`）＋ 工程级 **groove track**。**Bitwig** 我**没找到**任何提取；**Maschine** 也**没有**（Groove 只影响播放，`will not effectively move events in the Pattern Editor`） | **没有 ✗** | 全仓 grep `groovePool`／`GroovePool`／`extractGroove` **0 命中**；`src/data/genreGroove.ts` 是**手工写的**曲风鼓纹（ghost note 比例、每小节上限），**不是从音频提取**——它的头注释自己说"the ghosts are placed by a drumming rule … not rolled from a seed" |

### 3.3 音色发现（最重要的一栏）

| 能力 | 主流 DAW 的可核做法 | 本仓 | 本仓文件依据 |
| --- | --- | --- | --- |
| 浏览器按类型／标签／厂商／收藏组织 | **Live**：标签 ＋ Filter View ＋ Collections，且 **VST3 元数据自动进标签**；**Logic**：Library 左分类右音色（可按已安装声音包过滤）、Loop Browser 的 All／Favorites／Genres／Instruments／Moods、Alchemy 的属性列（Genre／Timbre／Sound Designer／User Tags）；**FL**：分页（All／Current Project／Plugin Database／Online Content／**Starred**）＋ **可打标签**；**Bitwig**：Tags 过滤 ＋ Favorites ＋ **Vendor 过滤器**（对插件与设备型选择出现）；**Cubase**：MediaBay 可 **Sort By Vendor** 或按类别；**REAPER**：FX 浏览器按类型／类别／**开发者**自动分组，还可自建分组文件夹；**Reason**：Type／Category／**Tags**（工厂 patch 全部人工打过标签）＋ **Favorite Lists**；**Studio One**：Instruments／Effects 页的 **Favorites ＋ Recent（最近 10 个）**；**Maschine／Komplete Kontrol**：⭐ **按 tags／brand／product／bank／文本／用户预设／Favorites 过滤**，且 Favorites 在两个产品间共享；**GarageBand**：Loop Browser 的 All／Favorites／Genres／Instruments／Descriptors ＋ Sound Packs 菜单（厂商维度只间接存在），**Library 的 patch 搜索只按名字** | **半有 ⚠️**：**有分类与二级分类，有搜索；没有标签、没有厂商维度、没有音色收藏** | **有**：分类＋二级分类（带计数）在 `src/components/arrangement/InstrumentLibraryV2.tsx:96-153`；搜索框在 `:86-93`，规则来自 `src/data/instrumentSearch.ts`（**文本匹配**，不是属性检索）。**没有**：`SampleManifestEntry`（`src/data/sampleManifest.ts:60-138`）与 `SampleAsset`（`src/data/sampleCatalogue.ts:18-74`）的字段表里**都没有 `tags`**，只有 `category`／`subcategory`／`categoryByPath`；收藏见 §5.2 那一行（只做在**工程**上） |
| 试听**不打断**播放 | **Live**：`Raw` 关闭时**在下一小节**预览，transport 继续跑；**Logic**：loop 可 solo，也可**与工程一起**播；**FL**：`Swap samples while the Project is playing`（`Shift+↑/↓` 逐个走并送到选中通道）；**Bitwig**：Pop-up Browser 的 **Live Preview**／两个浏览器的 **Auto-Preview**，按 `↓` 即试听；**Cubase**：MediaBay Previewer 的 `Wait for Project Play`（预览与走带同步）；**REAPER**：Media Explorer 的 `Start on bar`（试听对齐小节，工程继续播）；**Studio One**：Preview Player **有独立于歌曲走带的走带**；**GarageBand**：`If the project is playing, the previewed loop plays back in sync with the project.`；**Maschine**：⭐ 单击试听**不加载**，且试听信号走 **Cue 总线**（可以在耳机里预听而不碰主输出），另有工程播放时自动装载的 `Autoload`；**Reason**：Patch Browse 模式在**后台**载入设备、弹键盘试听，`Return` 提交、`Esc` 还原 | **半有 ⚠️**：只能"单独试听本轨"，会**替代**整段 | `src/i18n/locales/studio.ts:637-643` `roll_preview_start`／`roll_preview_start_hint`"只播放这条轨道的内容，**不启动整段编曲**"；`PianoRollLane.tsx:265-266` `previewBars`（0＝整轨，否则只播某一小节）。音色选择面板 `InstrumentLibraryV2.tsx` **完全没有试听**（组件里无播放调用） |
| 相似音色／按用途搜索 | **Live**：`Show Similar Files`／`Ctrl+Shift+F`，结果按相似度从高到低；**FL**：Sounds 页的 `Find similar samples`，`The similarity search includes both tone and rhythm`；**Studio One 7**：Splice 页的 **Search With Sound**（拖最多 8 小节自己的 clip 进去，AI 找回相配的 loop）；**Cubase**：右键 `Search for files that have the same attribute as the selected file`（按**属性**找同类，不是按声音）；**Maschine**：最接近的是按 **Character 标签**浏览同类性格的乐器。**Logic／Bitwig／REAPER／Reason／GarageBand 我都没找到**相似音色或按用途搜索 | **没有 ✗** | `src/data/instrumentSearch.ts:31-38` 只做"规范化后的多词子串匹配"（id／名称／程序路径）；全仓无相似度、无向量、无属性表。全仓 `similar` 的命中都在别处（`CompareView.tsx` 是曲风对比，`legatoJoin.test.ts` 等） |
| 预设与工程的一致性 | **Logic**：`Enable Patch Merging` 决定换 patch 时**哪些设置允许被替换**，没勾的保持已编辑；**Live**：新预设默认存进当前 Project，可从 `Current Project` 标签拖进浏览器；**FL**：只**部分**有据（自动 time-stretch／pitch-shift 是**按工程**的、不随采样存盘）；**Studio One**：Track Presets 保存／召回轨与通道配置；**GarageBand**：一条轨**全工程只能有一个 patch**，且只能选与轨类型匹配的；**Reason**：间接——patch 引用磁盘上的采样，文件被移走会弹 **Missing Sounds**；**Cubase**：Previewer 的 `Link to Project Tempo`（自动为导入事件打开 Musical Mode）。**Bitwig／REAPER／Maschine 我都没找到**对等机制（REAPER 的 VST 预设是**按插件**存成 `.ini`，**不是按工程**） | **没有 ✗**（没有等价机制） | 工程持久化在 `src/features/arrangement/`（`useArrangementV2Project`）；但"换音色时哪些设置被替换"这件事在 `src/` 与 `mcp/` 里 grep `patch merging`／`patchMerging` **0 命中** |
| 拖预设／素材到轨道上会发生什么 | **Live**：拖到轨道标题栏或设备链即加载到该轨；拖到 Drum Rack 的 pad 上自动映到该 pad 的音并建链；拖内容到轨道区空白处即**新建轨并放入**；**Bitwig**：拖设备或预设到**已有设备上**即替换它；**Studio One**：拖乐器到已有乐器轨会弹 **Replace／Combine／Keep the old instrument** 三选一；**Reason**：拖浏览器条目到机架／音序器即**建目标设备**（不同格式的 patch 直接**替换**正在浏览的设备）；**Maschine**：拖 Sound 到槽位即载入并**替换原内容**；**Cubase**：拖 **track preset** 到轨列表下方＝新建轨并载入；**GarageBand**：拖 **loop** 到轨下方空白区＝**自动建对应类型的轨**并放入；**REAPER**：拖 **FX 链**到轨道／混音台／条目上（**但我没找到拖"裸的插件预设"到轨道上的记载**） | **没有 ✗**（只有点选） | `InstrumentLibraryV2.tsx:159-171` 每个选项只有 `onClick` → `onChoose(assetId)`；`InstrumentBrowserV2.tsx:62-66` 选完即关面板。`src/components/arrangement`／`console`／`sequencer` 下 grep `draggable`／`onDragStart`／`onDrop` 只命中 **2 个文件、都不是音色／素材拖放**：`insertCurveViews.tsx:187`（EQ 曲线段的拖动把手）与 `ProjectHubModal.tsx:407`（**工程文件**拖入） |
| ⭐ **人能不能挑到任意资产**（对任务书原文的一处更正） | — | **半有 ⚠️**（**不是"没有"**） | **能**：`src/views/NewProjectView.tsx:102-126` 在 `/new` 挂载时把运行时目录里**所有带 `sfz` 的资产**喂给浏览器；`src/components/arrangement/InstrumentLibraryV2.tsx` 就是分类＋二级分类＋搜索的浏览器；入口在轨道头的乐器 chip，门控是 `src/components/arrangement/TrackHeaderV2.tsx:84`（`track.kind === "sampler" && onChangeInstrument !== undefined && instruments.length > 0`），而 `kind="sampler"` 的轨人**能自己建**（`ArrangementViewV2.tsx:957` 的 `track-add-${kind}` 按钮遍历 `src/components/arrangement/kindLabels.ts:29` 的 `TRACK_KIND_ORDER`＝synth／**sampler**／drumkit／fx／folder）。**不能**：① 只有 `/new` 渲染编排视图（`src/App.tsx:45-46,346`），**曲风／Studio 路线的轨道没有这个资产选择器**——那里的 `src/components/console/InstrumentPicker.tsx` 走的是**乐器名**（内建合成预设／GS-1 音色），不是目录资产；② `src/data/sampleCatalogueRuntime.ts:123-125` 的 `VITE_SAMPLE_ROOT` **默认为空**，不配镜像则目录为空 ⇒ `instruments.length === 0` ⇒ chip 根本不出现 |
| 调色板（写出的乐器名 → 资产）的可达性 | — | **16 / 34（我这条基线）→ 17 / 34（当前 `origin/dev`）**，两套数都写在下面 | ⚠️ **数字随基线变，必须写明基线**。**我在基线 `d036619` 上自跑**：`SAMPLED_INSTRUMENTS` **22 行** → **15 个不同库**；加 `DRUM_KIT_ASSET_ID`（`virtuosity-drums-basic`）＝ **16**；`public/samples/manifest.json` 共 **34 条** ⇒ **18 条**不经调色板／鼓组常量，其中 **17 条在 `src/`＋`mcp/` 里 0 引用**（⚠️ 这是我当时的**弱代理**，在 `04c47a9` 上已失效，见 §5.4 ② 与 §6.4），第 18 条 `freepats-tubular-bells1` 只在 `src/data/sampledInstruments.ts:178` 的**散文**里被提到一次（不是映射）。**⚠️ 在我写完之后 `origin/dev` 前进了 10 个提交，`c19b416` 把那两处替换落地了** ⇒ 我在新基线上重跑：**22 行 → 16 个不同库**，可达 **17 / 34**，够不到 **17 条**（`sax_lead` 现在指 `mtg-solo-sax:MTG-Tenor-Sax`、`walking_upright` 指 `dsmolken-double-bass:d-smolken-rubner-bass-pizz`，而 `karoryfer-meatbass` 因此掉出可达集）。**详见 §⑥**。程序级算，目录共 **327 个资产 id**（按 `sampleManifest.ts:385-417` 的展开规则跑 manifest 得出，两套基线上都是 327） |

> ⚠️ **对 `docs/OPEN_WORK.md` §84.1 的一处更正**：那一节列了四条路结论是"代理可达、**人的 UI 不可达**"，
> 四条路是 MCP 工具、UI 导入对话框、UI `SampleLibrariesPanel`、代码／工程文件——**漏掉了第三条动线：
> 编排视图里 sampler 轨的乐器浏览器**（`InstrumentBrowserV2` → `InstrumentLibraryV2`）。
> 因此"那 17 个新库对使用应用的人不可达"这句话，准确的形状是：
> **对曲风／Studio 路线不可达；在 `/new` 里新建一条 sampler 轨就能选到**（前提是镜像已配）。

### 3.4 采样器与素材工作流

| 能力 | 主流 DAW 的可核做法 | 本仓 | 本仓文件依据 |
| --- | --- | --- | --- |
| 可视化切片 | **Live**：Simpler `Slicing Playback Mode`／`Slice to Drum Rack`／`Slice to New MIDI Track`；**Logic**：Quick Sampler **黄标记**＋`Create Drum Machine Designer Track`；**FL**：Slicex（beat detection，或直接用 wave 里内嵌的 slice/region 数据）／Fruity Slicer 2（可拖 **Marker Flags**）；**Bitwig**：`Slice to Multisample...`／`Slice to Drum Machine...`；**Cubase**：Sampler Control 的 Slice 页（**自动映射到键盘**，还能生成配套 MIDI 乐句）；**Studio One**：SampleOne XT 的 Wave view ＋ `Send To new Impact`（切片铺到多个 pad）；**Reason**：Mimic 在瞬态自动打切片（Sensitivity 旋钮，最多 **92** 片），Slice Mode 从 C1 起半音触发；**Maschine**：Slicing → 点 `Apply` 即映射到键并切到键盘模式；**REAPER**：切开后逐个 `Glue items` 存成采样。**GarageBand 没有**（无采样器乐器，Audio Editor 只有波形级编辑） | **没有 ✗** | `src/audio/samplerSteps.ts` 只是"按步触发采样"；`src/components/`＋`src/views/` 下无任何切片界面 |
| 循环点可视化编辑 | **Logic**：Quick Sampler 黄标记拖拽，按住键就在两标记间循环；**Cubase**：`Set Sustain Loop Start`／`Set Sustain Loop End` **把手**直接拖在波形上；**Reason**：Mimic 把 Loop Length 画成波形上的**透明红区**（反向时蓝）；**FL**：Slicex 的 `Set loop (Alt+L)` 出现**红色循环标记**；**Studio One**：SampleOne XT 的 **X-Fade** 字段对循环点做交叉淡化去咔哒；**Maschine 3.5**：Sampler 界面有了 play range markers 与 **loop markers**；**REAPER**：ReaSamplOmatic5000 的 `Loop` 选项（配置好的采样循环到 note-off）。**GarageBand 没有** | **没有 ✗**（**解析并生效，但没有编辑器**） | `loop_start`／`loop_end` 已被读进 `src/audio/sampleLoader.ts:80-82` 并在实时／离线路径上传下去（`browserSampleGraph.ts:119-120`、`samplerLaneSink.ts:62-63`）；`docs/OPEN_WORK.md:2797` 记着"改前 15 拒 ⇒ 改后 15 接"。但**没有任何界面**让创作者拖动这两个点 |
| 自动映射到键位 | **Logic**：`Sampler (Zone Per Note)` 为音频里**检测到的每个音**建一个 zone；`Convert Regions to New Sampler Track` 把选中区段按时间线顺序铺到指定键域；**Live**：Sampler 的 **Zone Editor**（Key Zones／Velocity Zones／Sample Select）；**Reason**：Dr. Octo Rex 把 REX 切片**从 C1 起半音**分布；NN-XT 有 `Automap Zones` 与 `Set Root Notes from Pitch Detection`；**FL**：Slicex 的切片按顺序映到键盘，`Dump score` 写成音符序列；**Studio One**：REX 文件的切片映到 keymap（默认从 C3 起）；**Cubase**：切片**自动**映射到键盘。**Bitwig 我找到的是反例**：`Slice to Multisample...` 把切片变成音符，**未切片的单个音频没有自动键域映射**；**REAPER 没有**自动多重采样键域映射（`Note start`／`Note end` 逐实例手工） | **半有 ⚠️**：能读 SFZ 的键位／力度层映射，但**没有"从音频自动检测音高并铺键位"** | `src/audio/sampleLoader.ts` 解析 `lokey`／`hikey`／`pitch_keycenter`／`lovel`／`hivel`；`src/audio/drumRoles.ts` 直接引 `virtuosity-drums-basic` 自己的 `keymap_basic.sfz` 作为映射权威 |
| 单次／循环模式 | **Live**：`One-Shot Playback Mode`（连 Loop／Length 控件都没有）；**Cubase**：Sampler Control 的 `Loop Mode`，`If this is set to No Loop, the sample is played once.`；**Bitwig**：Sampler 三个图标按钮＝不循环／单向循环／乒乓循环；**Reason**：Pitch Mode／Multi Slot Mode 表示 one-shot 式播放 | **半有 ⚠️** | `docs/MUSE_REPORT_2026-10-01.md:704`：`loop_mode` **只被用于判断 `one_shot`**；`docs/OPEN_WORK.md:2813` 及 `:2796` 记着 `loop_start`／`loop_end` 已补齐并生效 |
| 从音频直接做乐器 | **Live**：拖 clip 进 Simpler（只用 clip 起止／循环标记划出的那一段）；**Logic**：拖音频到轨头区／轨之间，弹窗给 Quick Sampler／Sample Alchemy／DMD／Sampler；**Cubase**：MediaBay 里右键音频 `Create Sampler Track`；**REAPER**：`Insert into sample player` 建轨并载入；**Maschine**：`Auto Sampler` 把硬件合成器／软件乐器／整条链采成可演奏的采样器乐器；**GarageBand**：拖区段到 **Loop Browser** 并打标签，把它变成可搜索的 loop 素材 | **没有 ✗** | `src/data/userLibraries.ts:1-25` 的"加你自己的音源"是**给 `repo`+`pin` 或镜像 `root`+`prefix`**（URL 型库），不是音频导入；`src/audio/DrumKitModels.ts` 用**噪声缓冲**建声，从不解码采样（`docs/AUDIO_TRACKS_AND_SVS_PLAN.md:92`） |
| （注）素材播放通路 | — | **半有 ⚠️** | `docs/AUDIO_TRACKS_AND_SVS_PLAN.md:75`：第九种 kind 的**格式半边完成**（类型／分享／校验／混音角色／总线／GS-1／采样目录／跳过并说明），**播放半边未建**；`:115` 目录**发布为空** |

### 3.5 混音面

| 能力 | 主流 DAW 的可核做法 | 本仓 | 本仓文件依据 |
| --- | --- | --- | --- |
| 送出／返回的可见性 | Live：`View > Mixer Controls > Return Tracks` 可隐藏返回轨，每个返回有 Pre/Post 开关；Logic：`View > Channels with Sends Only` 过滤，每通道最多 12 路送出（Post Pan／Post Fader／Pre Fader 三档）；Bitwig：**每条 FX 轨在每个通道上都有一个送出旋钮**，Pre／Post／Auto 可切；Cubase：播出段默认隐藏，`Set up Window Layout > Sends` 一次为所有通道打开；FL：送出开关在轨下方，默认**推子后**，推子前要 `Fruity Send`；Studio One：**FX Channel 就是效果返回通道**，有自己的 Insert Device Rack；Reason：送出是全局的，最多 8 路，主控条上有独立的 **FX Return 段**；GarageBand：**固定**的 Master Echo／Master Reverb 两条 | **半有 ⚠️**：有 SEND A／B，**没有返回通道条** | `src/components/console/ChannelStrip.tsx:203-212` `console_send_a`／`console_send_b`（每个都有 aria-label）；`src/components/console/MasterStrip.tsx` 只有主推子（`console-master-fader`）。`src/audio/ReverbBus.ts` 这个返回总线在引擎里存在，但混音台上没有它的通道条 |
| FX 链与顺序 | Live：音频效果可以放在设备链的任意位置，顺序决定结果；Logic：通道条里上下拖动插件改顺序，**每通道最多 15 个插入**；Bitwig：设备链**左进右出**，顺序就是视觉顺序；Cubase：插入链上有一条**彩色分界线画出推子前／后**；FL：每轨 10 个效果槽，滚轮换序；Studio One：自上而下串行、可拖到任意插入之间重排；REAPER：FX 链里上下拖动；Reason：`Insert Pre`／`Dyn Post EQ` 两个按钮重排内部顺序；GarageBand：Plug-ins 区的纵向顺序就是处理顺序；Maschine：在 Plug-in List 里拖 | **半有 ⚠️：只有固定四段，不可增删、不可重排** | `src/components/console/InsertFlowStrip.tsx:5-16` 自己写着"the four stages the strip actually has — in the order the DSP wires them (… high-pass → low shelf → peaking → high shelf → compressor → makeup → drive): **HP → EQ → Comp → Drive**"；`:35-38` 每段只有"开／关 + 选中"两个能力 |
| 参数自动化 | Logic：通道条上有 Automation Mode 按钮；Live：可以录，也可以不录就画／事后编辑包络 | **没有 ✗**（没有任何自动化界面） | 我在 `src/components/`＋`src/views/` grep `automation` **0 命中**；自动化只出现在数据／导入层（`src/data/arrangementEdits.ts`、`src/data/logicToArrangement.ts`）与引擎参数（`src/audio/PolySynth.ts`） |
| Metering | Live：每轨 peak＋RMS，监听时切到输入电平；Logic：Peak 显示 + 削波变红 | **有 ✓**（接的是引擎的真实分析器，不是假表） | `src/components/console/ConsolePanel.tsx:74-77` 写明主表用引擎真实立体声分析器、每通道用引擎真实 per-track 分析器，且两者都在单一 rAF 循环里写 DOM；`:206-266` 是那条循环；`src/components/console/meterMath.ts` 的 `peakFromTimeDomain` |
| A/B 对比 | ⚠️ **这里必须分清两种 A/B**。**①"两个版本／两段材料互相对比"**：Live 每个内置设备有 A／B 两态、Logic 的 Smart Controls `Compare` **＋插件窗口自己的 `Compare`**、Cubase 的 **MixConsole Snapshots**（最多 10 个混音台状态随工程存取）、FL 的 `Mixer Track FX master switch`（一键旁通整条链）、Studio One 的 `Activate All Inserts`（一键旁通全部插入）、GarageBand 的 Smart Controls `Compare`。**Bitwig／REAPER／Reason／Maschine 四家我都没找到**（Bitwig 只有演出用的 Global Crossfader A／B mix）。**②"材料本身有 A／B 两个槽"**：Live 的 clip、Logic 的 pattern、Reason 的 pattern 等 | **半有 ⚠️（本仓有"对比"，没有"参数两态快照"）** | **有**：`src/components/sequencer/Toolbar.tsx:114,397,464` 的 `blindCompare`（`src/i18n/locales/studio.ts:197` `toolbar_blind_title`"A/B 盲听对比评估模式"）；`src/features/sequencer/useSequencerStore.ts:37,248,256` 的 `activeSlot: "A"｜"B"` pattern 槽；`src/i18n/locales/explore.ts:171,266` `compare_sync_audition`／`sync_play`"A/B 同步试听"与 `src/i18n/locales/common.ts:196` `nav_compare_desc`"A/B two genres"。**没有**：把一台设备／一条通道条的**当前参数**存成两态并来回切（Live 的 device A/B、Logic 的插件 `Compare`、Cubase 的 MixConsole Snapshots 那一类）——全仓找不到对应的状态模型 |
| 编排→混音的页面切换成本 | **几乎人人 1 步**：Live `Ctrl+Alt+M` 或右下角控件（编排视图内）；Logic `View > Show Mixer` 或 `X`；Bitwig `M` 或 `ALT+M`；Cubase `F3`；FL `F9`；Studio One `[Mix]` 按钮或 `F3`；REAPER `Ctrl+M`；Reason `F5`；Maschine 头部 `Mix View` 按钮一键。GarageBand 是唯一例外：**没有独立混音窗口**，音量／声像／插件都在轨头与 Smart Controls 里 | **有 ✓**（1 次开关，不用换页） | `src/components/console/ConsoleOverlay.tsx:20-25`："Floating mixing console … renders the very same `ConsolePanel` the standalone `/console` route renders, but with the studio's engine and store injected"；关闭时**不渲染**，Studio 的走带与网格继续可用；挂载点 `src/views/StudioView.tsx:1271`；另有独立路由 `/console`（`src/app/router.tsx:137-140`） |

### 3.6 从零到一个想法

| 能力 | 主流 DAW 的可核做法 | 本仓 | 本仓文件依据 |
| --- | --- | --- | --- |
| 最快到有声 | **Logic**：Project Chooser 选模板／Live Loops starter grid；Session Player **三步**得到 8 小节；没有和弦时**自动写入 8 小节默认进行**。**Live**：拖浏览器内容即建轨并放入（1 次拖拽）；`Capture MIDI` 找回刚弹的。**GarageBand**：⭐ **从空工程一次拖拽就出声**（自动建对应类型的轨），且 Apple Loop 自动合拍。**FL**：Loop Starter 选风格 → 骰子 → `Send to Playlist`。**Bitwig**：`File > New From Template…`（两步）或设默认模板。**Cubase**：Hub → 模板类别 → 模板；或空工程 `Add Track` ＋ 在 MediaBay **双击**一个 loop。**REAPER**：`Insert > Virtual Instrument on new track` 一次就把轨建好、录好音、开监听。**Studio One**：新建歌曲时给预配置模板（6 里换成按场景的 **Smart Templates**）。**Reason**：`Ctrl/Cmd+I` → 点一个 patch（后台建设备）→ `Return`。**Maschine**：⭐ 开 `+PATTERNS` 载入一个工厂 Group，**连它存好的 Pattern 一起进来** | **有 ✓（1 步）** | `src/App.tsx:84` `route.genreId \|\| "chicago-house"` ⇒ 默认路由**已经是一条完整曲风**；`src/components/onboarding/FirstRunPrompt.tsx:43` 用一个动作说明这件事：`src/i18n/locales/studio.ts:631-635` `first_run_prompt_text`"按播放先听一遍这段律动，再点亮一个格子改它"＋`first_run_prompt_play`"先听一遍" |
| 模板 | **Live**：`Save Live Set As Default Set…`；**Logic**：Project Chooser（New Project／Recent／Live Loops Grids／Tutorials／Demo Projects／Project Templates／My Templates）；**FL**：`New from template`（Genre／Minimal／Other／Utility 四组，可在 General Settings 设默认模板）；**Bitwig**：`Save as Template…`（带 Name／Author／URL／Category／Tags／Description）＋可设默认模板 ＋ 浏览器的 **Templates 源**；**Cubase**：Hub 的工厂模板分 Recording／Scoring／Production／Mastering 四类；**REAPER**：`File > Project Templates` ＋ `Track > Insert track from template`；**Studio One**：New Song 左侧预配置模板列表（6 起为 Smart Templates）；**Reason**：`File > New from Template`；**GarageBand**：Project Chooser 的 Project Templates；**Maschine**：任意 Project 可当模板 | **有 ✓**（3 个模板 + 空白） | `src/data/arrangementEdits.ts:114-119` `TEMPLATES`＝`Drums + Bass`／`Drums + Bass + Chords`／`Samplers`；`src/components/arrangement/NewProjectPanelV2.tsx:72` 把 `Blank` 做成**第四张并列的卡**而不是例外；`src/data/arrangementEdits.ts:107` 写明"deliberately few: a template list long enough to need choosing is the same as no templates" |
| 和弦进行 | **Live**：`Stacks` MIDI Tool 在选定音阶内写进行；**Logic**：和弦轨 ＋ 新增 Session Player 时**自动写入 8 小节默认进行**；**FL**：和弦进行工具**打开即有 4 个和弦**，`Press Play to hear it`；**Studio One**：把 Chord Track 上的和弦事件**拖到乐器轨**即变成同时值的音符事件；**Cubase**：**Chord Pads**（实时触发、可改 voicing 与 tension，可直接录成 MIDI 或录到和弦轨）；**Reason**：`Scales & Chords` Player（Notes 旋钮 1–5 个和弦音）＋ `Beat Map`；**Maschine**：`Chord Set` 模式把一组和弦映到前 12 个 pad；**GarageBand**：**选中重叠音符即在卷帘头显示和弦名** | **有 ✓**（两处入口） | `src/data/popularProgressions.ts`（策展进行库，头注释注明参考 Hooktheory Theorytab）+ `src/views/ChordProgressionsView.tsx`；卷帘内 `PianoRollLane.tsx:1999-2043` 的进行套件有"选择／试听／写入"三个动作 |
| Loops／现成素材库 | **Logic／GarageBand**：Loop Browser（All／Favorites／Genres／Instruments／Moods 或 Descriptors，GarageBand 还能把区段**拖回浏览器**变成带标签的 loop 素材）；**Live**：浏览器里的 loop ＋拖到空白区即建轨；**Cubase**：MediaBay 里**双击**媒体文件即建轨并载入；**FL**：FL Cloud 的 Loop Starter ＋每通道骰子；**Studio One 7**：Splice 页（含按声音搜索）＋ clip launching 面板；**Reason**：`Demos` 与 `Song Starters` 文件夹 | **没有 ✗** | `public/samples/manifest.json` 是**乐器**清单（SFZ 程序），且 `kind` 被**一律写成 `"one-shot"`**（`src/data/sampleManifest.ts:344-349` 自己说明这是刻意的折中）⇒ 没有 Apple-Loop 式"可按风格／情绪试听并落进工程"的循环素材库 |
| 生成式工具 | **Live**：MIDI Tools（`Stacks`／`Seed`／`Euclidean`／`Rhythm`／`Strum`）；**Logic**：Session Player（Drummer／Bass Player／Keyboard Player）；**FL**：Loop Starter 的骰子（整组随机或单通道随机）；**Cubase**：Pattern Editor 的 **Euclidean** 选项（按 step amount 与 rotation 均匀分布）；**Reason**：`Beat Map` 用 XY 图生成鼓型（每鼓 Density／Lock Pos／Mirror）；**Bitwig**：Stepwise 等设备**要自己加到轨上**；**Studio One**：Arpeggiator 的 32 步 Pattern；**REAPER**：我**没找到**和弦进行生成器或其他生成式想法工具 | **半有 ⚠️** | 界面上有欧几里得节奏生成 `src/components/sequencer/EuclideanModal.tsx`；卷帘内的"生成"是**和弦印章／琶音／复制第 1 小节**（`PianoRollLane.tsx:1900,1954,1989`）。通用生成器在 **MCP 侧**：`generate_melody`（`mcp/registry.ts:2762`）、`suggest_progression`（`:2810`）、`transform_pattern`（`:1669`）——**人**在界面上没有这几个入口 |
| （注）"从零到一个想法"在两条动线上的步数 | — | Studio：**1 步**（播放）；编排：**3 步**（`/new` → 选模板卡 → Create） | `src/App.tsx:84`；`src/components/arrangement/NewProjectPanelV2.tsx:55-77,110-121`（选卡即填名字，Create 是主按钮） |

---

## ④ 优先级表（按「创作者收益 × 实现成本」排序，前 8 条）

> 排序依据：**收益**＝它解掉的是不是"每天都在做、且现在必须手工做"的事；**成本**＝S（小而局部，如一个门控／一个组件）／M（一个功能，动一两个模块）／L（要新建通路或改数据模型）。
> 每条最后一栏是**一句话：创作者会因此少做什么**。全部只基于 §③ 的可核事实，不含听感判断。

| # | 要做的 | 收益 | 成本 | 依据（§③ 哪一行） | 创作者会因此**少做什么** |
| --- | --- | --- | --- | --- | --- |
| 1 | **让资产选择器对所有轨开放**（至少让曲风／Studio 的旋律轨也能挑目录资产），并让剩下那 **17 条**（我这条基线上是 18 条，见 §⑥）目录真正被人用到 | 高 | S–M | §3.3 "人能不能挑到任意资产"／"调色板可达性" | **少做**："为了用一个新买的库，只能新建一条 sampler 轨绕过去"——直接在正在编的那条轨上换。 |
| 2 | **浏览器内试听不打断播放**（预览落在下一小节／与工程合播，而不是替代整段） | 高 | M | §3.3 "试听不打断播放" | **少做**："每试一个音色就停一次正在放的段落，听完再回去对位置"。 |
| 3 | **按属性／用途／标签检索音色，并给音色加收藏**（工程侧已有收藏＋标签的先例可搬） | 高 | L | §3.3 "浏览器按类型／标签／厂商／收藏组织" | **少做**："在 327 个程序级资产里靠记名字翻"——用"要一个暗一点的贝斯"这种说法去找。 |
| 4 | **鼓的 choke 组可指派**（引擎已经有 choke 的锚点与单测，缺的是界面） | 中 | S | §3.2 "Choke 组" | **少做**："为了让开镲被闭镲掐断，去裁短音符或画静音"。 |
| 5 | **拖放音色／素材到轨道**（拖到轨头即加载；拖到空白处即建轨） | 中 | S–M | §3.3 "拖预设到轨道上会发生什么" | **少做**："先点轨、再点开 chip、再点选、面板自己关掉"这一串。 |
| 6 | **卷帘内自动化可见 + 多片段同时编辑** | 中高 | M–L | §3.1 "卷帘内可见自动化"／"多片段同时编辑" | **少做**："在编排区和卷帘之间来回切，凭记忆把曲线和音符对齐"以及"一个声部一个声部开卷帘对照"。 |
| 7 | ⭐ **从音频提取 groove，并把它套到任意轨上**（先"取出来"成一个可复用对象，再"套"上去） | 高 | L | §3.2 "从音频提取 groove 再套到别处" | **少做**："把一段录进来的感觉，靠耳朵在卷帘里一个音一个音推回去"。 |
| 8 | **设备／通道条参数的 A/B 两态快照 + 返回通道条**（本仓**已有**盲听 A/B、曲风 A/B 同步试听、pattern A／B 槽这三个先例，形态可搬） | 中 | M | §3.5 "A/B 对比"／"送出、返回的可见性" | **少做**："调坏了没法退回上一个状态，只能凭记忆调回来"以及"送出之后看不见返回在哪"。 |

**紧随其后（不在前 8，但差距同样明确）**：切片与循环点的**可视化编辑**、**从音频直接做乐器**（Live／Logic 都是"拖一下就成"）、可增删重排的 FX 链（现在固定 HP→EQ→Comp→Drive）、loop 素材库（现在是乐器清单，`kind` 一律 `one-shot`）。

---

## ⑤ 未找到清单

**按规矩：查不到的写"未找到"，不凭印象写功能。**

### 5.1 外部：一手材料或功能没拿到

| 对象 | 未找到什么 |
| --- | --- |
| Ableton Live 12 | 桌面版手册里**Drum Rack 自身的网格步进器**（步进音序器在 Push 硬件上，不在这本手册范围内）；"空工程→出声"的**精确步数**（手册每条只描述一个动作） |
| Logic Pro 11 | 卷帘的**折叠视图**；卷帘里**音符级概率／条件触发**（概率只记在 Step Sequencer 的 Chance 编辑模式上）；混音台里**画自动化曲线**；**把 patch 拖到轨道上**的行为（手册里的拖放讲的是内容——音频文件、region、Apple Loop、套鼓件）；Library／Loop Browser 的**相似音色搜索**与**厂商维度浏览**。⚠️ **更正**：我第一遍把"插件窗口内的 A/B 对比"也列在这里，第二遍在 <https://support.apple.com/guide/logicpro/lgcp4dcb0092/11.0/mac> 找到了 `Click the Compare button to listen to the setting that was originally saved with the project.` ⇒ **它不算未找到** |
| Logic Pro 11（形态/用词） | "groove pool 预设浏览器"这一形态（groove 模板经 Region inspector 的 Quantize 菜单创建并存进该菜单）；"choke group"这个词本身（同一行为记在 Drum Machine Designer 的**共享 Exclusive Group** 上） |
| FL Studio | 卷帘里的概率／条件触发；**折叠或多片段卷帘模式**（最接近的是 Ghost Notes `Alt/Opt+V` 与 Editable ghosts `Ctrl+Alt/Opt+V`）；具名 "groove pool"；"空工程→出声"的总步数 |
| Bitwig Studio 5 | **卷帘自身的音阶高亮与和弦检测**（只有 Key Filter Note FX 与 Multi-note 设备）；画在卷帘里的自动化车道（在独立的 Automation Editor Panel）；**groove pool／从音频提取时间感觉**；**混音或插件设置的 A/B 对比**；"把预设拖到**轨道**上（而不是已有设备上）"的行为 |
| Studio One 6/7 | 扫弦；legato 工具；卷帘里的折叠／多片段编辑；专门的 groove 预设或 "groove pool" 浏览器；**专门的 A/B 快照或混音对比功能**（最接近的是全局插入旁通与 Mix Engine FX 旁通）；卷帘内除 Inspector 轨级 Velocity 之外的力度处理 |
| Cubase 13/14 | Key Editor 内的扫弦或琶音命令；"折叠未用音符"命令；**Groove Pool 面板**（提取结果存成 Quantize Presets）；**逐插件** A/B 对比按钮；"最快到出声"的点击数 |
| REAPER 7 | 卷帘里的音符级概率或条件触发；扫弦／琶音命令；**groove pool／groove 库／groove 量化**；原生 choke 组控件（只有 `JS: MIDI/midi_choke`）；**原生 A/B 对比或混音台快照**；自动多重采样键域映射；"把裸的插件预设拖到轨道上"的行为（拖 FX 链有记载） |
| GarageBand | 卷帘里的音阶高亮、概率／条件触发、扫弦、折叠模式；**步进音序器／步进格**；**choke 组**；**逐击独立编辑**（Drummer Editor 的改动只影响选中区段）；**内建采样器乐器**——没有切片成 MIDI、没有采样循环点可视化编辑、没有把切片自动映射到键域、也没有"从音频做乐器"；**相似音色／按用途搜索**；专门的混音窗口（所以没有"编排→混音"的页面切换成本可数） |
| Reason 13 | 概率／chance 控制与条件触发（"if previous"）；扫弦（琶音是独立的 **Dual Arpeggio** Player）；**直接从音频 clip 提取 groove 模板**（ReGroove 读的是**音符 clip**；从音频出发要先切 REX 再用 Dr. Octo Rex 的 `Copy Loop To Track`）；**相似音色／按用途搜索**；专门的厂商过滤按钮（厂商只以可编辑的 `Author` 字段出现）；**A/B 对比**；内建的和弦进行库设备（`Chord Sequencer Player` 是 Reason+ 的 Rack Extension） |
| Maschine／Komplete Kontrol | 概率／chance 参数、条件触发、humanize、扫弦；折叠区段命令；**在卷帘里设或改音阶**（`This update does not yet include full access to set or change scales from within the Maschine 3 software Piano Roll.`）；专门的 legato 命令；**groove pool／从音频提取时间感觉**；**专门的相似音色或按用途搜索命令**（最接近的是 Character 标签）；**A/B 对比** |
| 本仓既有调研已记的两条 | `docs/ARRANGEMENT_UI_DESIGN.md:114-115` 已记：**Studio One 一手手册没取到**（DNS/404/403）；**Logic Pro for Mac 桌面版**只有 iPad 版手册可用 |

### 5.1b 来源质量的如实交代（哪些引文不是"现在的一手页面"）

* **Studio One 6/7**：`s1manual.presonus.com` 我拿到的是 **web.archive.org 快照**；引用的 URL 就是**快照 URL**（形如 `https://web.archive.org/web/20220…/https://s1manual.presonus.com/…`）。另外两条引自 **Sound On Sound** 与 **MusicRadar** 的 6／7 评测，**已逐条标为二级来源**。Fender 现行的官方手册是 **Fender Studio Pro 8.1**（比 Studio One 6/7 更晚的产品），只用它找过主题文件名，**没有引用**。
* **Cubase 13/14**：主体是 Cubase Pro **14.0.30** 官方英文帮助；但**有两条**（鼓的 groove 提取、MediaBay 的 `Wait for Project Play`）引的是 **Cubase AI 13.0.30 官方操作手册 PDF**，URL 形如 `https://www.steinberg.help/api/khub/documents/…/content`——**这是内容 API 地址，不是人可读的页面地址**。原因是 Steinberg **已不再提供 Cubase Pro 13 的英文 HTML 帮助**（v13 路由重定向到一个失效的 PDF 路径）。
* **FL Studio**：部分引文的 URL 在 `image-line.com/fl-studio-learning-content/…` 路径下，另一些在 `image-line.com/fl-studio-learning/…` 下；**两条都是 Image-Line 自己的域名**，我按取到的原样保留。
* **Reason**：agent 报告 `/tmp/dawcre-research/` 被并发的其他 agent 覆写过它用于预校验的临时文件；它**重新独立校验过**最终的 `reason.json`（sha256 `be35d789daa68ca3…`，18579 字节）后确认完好。这一点我如实记下，因为它是**过程风险**，不是结论问题。
* **每一张卡的引文都做过"逐字子串"复核**：写卡的 agent 各自报告把引文重新取回页面、按字符（PDF 的则按去换行后的文本）验证为**原文子串**，并报告 0 处不一致（FL 24/24、Logic 24/24、Bitwig 24/24、Studio One 24/24、Cubase 24/24、REAPER 24/24、GarageBand 24/24、Reason 24/24、Maschine 24/24）。**这份报告我采信为过程说明，不作为我自己独立复核的替代**——§2 的每一句都还带着 URL，读者可自行打开核对。
* **§2.2 Logic** 融合了**两次独立检索**的结果：第一次给出了 Step Sequencer、groove track、Quick Sampler 黄标记、DMD、Patch Merging 等；第二次补齐了 `Trim > Force Legato`、插件窗口 `Compare`、`Convert Regions to New Sampler Track`。**两次在"折叠视图／扫弦／相似搜索"上都报未找到**，这提高了那三条为"未找到"的可信度（但仍是"两次都没找到"，不是"不存在"）。

### 5.2 本仓：这些不是"未找到"，是"我搜过、没有"

写清楚搜过什么，以免把"我没找到"读成"不存在"：

| 结论 | 我搜了什么 | 结果 |
| --- | --- | --- |
| 音色**收藏／标签** | `favourite`／`favorite`（**大小写不敏感**）全仓 | 只有**工程**侧的收藏：`src/components/sequencer/ProjectHubModal.tsx`、`src/features/arrangement/arrangementFiles.ts`、`src/features/sequencer/projectDb.ts`、`src/i18n/locales/projects.ts:22,43`、`src/types/project.ts`。**在音色侧 0**——`src/components/arrangement`／`src/components/console`／`src/data/sampledInstruments.ts`／`src/data/sampleCatalogue.ts`／`src/data/instrumentSearch.ts` 里一个都没有 |
| **相似音色检索** | `similar` 全仓 | 命中都在别处（`src/views/CompareView.tsx` 是曲风对比）；音色侧只有 `src/data/instrumentSearch.ts` 的**文本匹配** |
| **预设合并（patch merging）** | `patch merging`／`patchMerging` | **0 命中** |
| **自动化界面** | `automation` 于 `src/components/`、`src/views/` | **0 命中**（数据／导入层有） |
| 音色／素材拖放 | `draggable`／`onDragStart`／`onDrop` 于 `arrangement`／`console`／`sequencer` | **2 个文件，都不是音色／素材拖放**：`src/components/console/insertCurveViews.tsx:187` 是 **EQ 曲线段的拖动把手**；`src/components/sequencer/ProjectHubModal.tsx:407` 是**工程文件**拖入。**音色／素材侧 0** |
| **"参数两态 A/B 快照"** | `A/B` 于 `src`＋`mcp` | ⚠️ **不是一个可以数成 0 的东西**——见 §3.5 那一行：本仓**有**盲听 A/B、曲风 A/B 同步试听、pattern A／B 槽（`Toolbar.tsx:114` 等），**没有**的是"把当前参数存成两态来回切"。**我第一版把这条写成"0 命中 ⇒ 没有 A/B 对比"，是错的，已更正** |
| **choke 界面** | `choke` 于 `src/components/`、`src/views/` | **0 命中**（引擎侧有，见 §3.2） |
| **groove pool／从音频提取 groove** | `groovePool`／`GroovePool`／`extractGroove` | **0 命中** |
| **切片界面** | `slice` 于 `src/components/`、`src/views/` | 命中都是字符串截断／频谱切片，**无采样切片界面** |

### 5.3 我**没能核实**的（如实记，不当结论用）

* **线上部署是否真的配了 `VITE_SAMPLE_ROOT`**：`docs/R2_UPLOAD.md:96` 说 `.env.local` 里是 `https://r2mirror.groove.wangda.today`，`:157` 又提醒"Vite 在**构建时**内联，运行时秘密到不了产物"。我**没有**去核实线上那份构建产物里到底有没有这个值 ⇒ §3.3 里"sampler 轨能选到全部目录资产"这条，**成立的前提是镜像已配**；这个前提我没有独立证实。
* **本文工作树的 `origin/dev` 基线**：`d036619`。文中所有"本仓"依据都是这个提交下的行号；`docs/OPEN_WORK.md` §82–§90 自己提醒过行号会漂（`docs/AUDIT_2026-10-02_PART2.md:3` 记着"部分行号已偏 1–22 行"）。
* **`ALL_SAMPLED_INSTRUMENTS` 的行数**：`docs/OPEN_WORK.md:2803` 记着是 **48 行**（22 ＋ 26 条 `playableTechniques()` 派生行），并更正了 `:2612` 早先写的 25。我在源码里看到 `sampledInstruments.ts:221-224` 就是这个拼接，且 `:193` 的注释也写 "all 26 rows today" ⇒ 48 与源码一致。**但本文 §3.3 用的是"22 行 → 15 个库"这条**（那是**手写**映射的行数与库数），两者不是同一个数，不要混。
* **像素／触摸尺寸**：没有任何 DAW 手册规定目标尺寸（这一条 `docs/ARRANGEMENT_UI_DESIGN.md:119` 已经记过），本文不重开。

### 5.4 §3 里那几个本仓数字怎么复现（我跑过的命令）

> 全部在工作树 `/home/crow/music/groove-dawcre` 的根目录下跑，基线 `d036619`。**只读，不改任何文件。**

**① 调色板：22 行手写映射 → 15 个不同库 → 加上鼓组常量＝16 / 34 可达（基线 `d036619`）**

```bash
python3 - <<'PY'
import json,re
man=[e['id'] for e in json.load(open('public/samples/manifest.json'))['entries']]
src=open('src/data/sampledInstruments.ts').read()
rows=re.findall(r'instrument:\s*"([^"]+)",\s*\n\s*assetId:\s*"([^"]+)"',src)
libs={a.split(':')[0] for _,a in rows}
reach=libs|{"virtuosity-drums-basic"}          # 鼓组常量 src/audio/drumRoles.ts:101
print("hand rows:",len(rows),"distinct libs:",len(libs))
print("manifest entries:",len(man),"reachable:",len(reach))
print("unreachable:",[m for m in man if m not in reach])
PY
```

⇒ 输出：`hand rows: 22 distinct libs: 15`／`manifest entries: 34 reachable: 16`／`unreachable: 18 条`。
**注**：这里的 22 是**手写**映射的行数；`ALL_SAMPLED_INSTRUMENTS` 是 **48 行**（22 ＋ 26 条派生行，见 §5.3）——两个数不是一回事。

**② 那 17 个新库"在 `src/`＋`mcp/` 里零引用"（⚠️ 这是一个**弱探针**，见下）**

```bash
for id in $(python3 -c "import json;print(' '.join(e['id'] for e in json.load(open('public/samples/manifest.json'))['entries']))"); do
  echo "$(grep -rn "$id" src mcp 2>/dev/null | wc -l) $id"
done | sort -n
```

⇒ **在基线 `d036619` 上**：输出里 **17 条为 0**；第 18 条 `freepats-tubular-bells1` 为 **1**，那一处是 `src/data/sampledInstruments.ts:178` 里 `bell_lead` 的**散文**（提到它是更宽音域的备选），**不是映射**。⇒ "18 条够不到"＝17 条零引用 ＋ 1 条只在散文里被提到。

⚠️ **但这个探针有一个必须写出来的弱点，而且它在下一版就发作了**：**"文本里没出现"只是"调色板没映射它"的一个代理**，一旦有人把库名写进**散文或测试**，代理就失效。**它在 `04c47a9` 上确实失效了**：

```bash
# 在当前 origin/dev 上（不切换工作树，直接查那棵树）
git grep -l <library-id> origin/dev -- src mcp
```

⇒ 34 条里**只剩 `ixox-flute` 一条零引用**，其余 **33 条**都有文本命中。**原因不是"33 条都接上了调色板"**，而是新提交 `c19b416` 带来了 `src/test/sampledInstrumentPaletteWiring.test.ts`，里面有一张 **`FOREIGN_LIBRARIES`** 清单（12 条：`karoryfer-bigcat-cello`、`jlearman-steel-drum`、`cithara-barbarica`、`hungarian-zither`、`ganjo`、`aliexpress-erhu`、`karoryfer-cowsynth`、`karoryfer-squidpipes`、`karoryfer-272-merry-orks`、`karoryfer-bear-sax`、`karoryfer-big-rusty-drums`、`body-percussion`），并**断言这些库不出现在任何调色板行里**——也就是说，**它把这些库名写进了仓库，正是为了证明它们没被接上**。
⇒ **所以正确的探针只有一个**：**从调色板行里抽 `assetId` 的库前缀**（就是 ① 那段脚本），而不是数文本出现次数。**① 给出 16 个库 / 17 条可达**；`FOREIGN_LIBRARIES` 是新基线上把"不许坐进来"这件事**写成数据**的那一半。

**③ 目录的程序级资产数（327）**

```bash
python3 -c "
import json
e=json.load(open('public/samples/manifest.json'))['entries']
n=0;skip=[]
for x in e:
    if x.get('excludedReason'): skip.append((x['id'],'excluded')); continue
    d=x.get('durationSeconds')
    if not isinstance(d,(int,float)) or d<=0: skip.append((x['id'],'no duration')); continue
    n += len(x['instruments']) if x.get('instruments') else 1
print(n, skip)"
```

⇒ 输出 `327 []`——**34 条目录一条都没被跳过**，按 `src/data/sampleManifest.ts:385-417` 的展开规则得到 **327 个程序级资产 id**。
（`src/components/arrangement/InstrumentLibraryV2.tsx:4` 的注释里写的是 **135**，那是个**过时的数**；组件实际收到多少由上面的目录决定。）

**④ "本仓没有"的那几项，我是这么搜的**（都用这个形状，把关键词换掉）

```bash
grep -rln "groovePool\|GroovePool\|extractGroove" src mcp     # → 0
grep -rln "patch merging\|patchMerging"             src mcp     # → 0
grep -rln "automation" src/components src/views                 # → 0
grep -rln "choke"      src/components src/views                 # → 0
grep -rln "draggable\|onDragStart\|onDrop" src/components/arrangement src/components/console src/components/sequencer
#   → 2 个文件：insertCurveViews.tsx:187（EQ 曲线把手）、ProjectHubModal.tsx:407（工程文件拖入）——都不是音色/素材拖放
grep -rln "A/B" src mcp                                        # → 21 个文件，⚠️ 见下
```

⇒ **"0 命中"是"我搜过、没有"，不是"未找到"**——两者的区别写在 §5.2 的表里。

⚠️ **`A/B` 这一条是我自己搜错、又自己抓出来的**：`grep "A/B" src mcp` 返回 **21 个文件**，本仓**真的有** A/B——但它是**盲听 A/B 评估模式**（`Toolbar.tsx:114` 的 `blindCompare`）、**两个曲风的 A/B 同步试听**（`explore.ts:171,266`）、**pattern 的 A／B 两个槽**（`useSequencerStore.ts:37,248,256`）。**缺的是另一种 A/B**：把一台设备或一条通道条的**当前参数**存成两态来回切。**我第一版把这一行写成"0 命中 ⇒ 没有 A/B 对比"，是错的**，已在 §3.5 与 §5.2 更正。⇒ 这就是为什么"grep 0 命中"必须连**搜的是什么词**一起写出来。

**⑤ 线上是否配了镜像**：我**没有**做这项核实（所以它在 §5.3 里）。可复核的接口是线上 `version.json` 与构建时的 `VITE_SAMPLE_ROOT`（`docs/R2_UPLOAD.md:157` 说明它必须在**构建那一刻**的环境里）。

---

## ⑥ Postscript：基线漂移、与姊妹文档的边界、以及我对自己初稿的**三处**更正

### 6.1 ⚠️ 我这条基线，与它写完之后 `origin/dev` 前进的 10 个提交

* **我的基线**：`origin/dev` @ **`d036619`**（按任务要求：`git fetch` 之后 `git worktree add … origin/dev`）。**全文所有"本仓"结论都是这个提交下的**。
* **写完之后**：`origin/dev` **前进了 10 个提交，到 `04c47a9`**（worktree 共享同一份 refs，所以我的 `origin/dev` 也跟着走了）。**我的提交 `0deb3c4` 没有推、也不在任何远端分支上**（`git branch -r --contains 0deb3c4` 为空）。
* **那 10 个提交里有 3 个改了本仓行为/文档，值得读者知道**（我逐条看了标题与差异）：
  1. `c19b416 feat(samples): two of the seventeen new libraries reach the palette, and the rows that must not move are pinned` —— **§85／§86 那两处替换落地了**：`sax_lead → mtg-solo-sax:MTG-Tenor-Sax`（点名 tenor，避开默认的 Soprano）、`walking_upright → dsmolken-double-bass:d-smolken-rubner-bass-pizz`。⇒ **§3.3 的可达性数字因此变了**，见 6.2。
  2. `6a5a8ed feat(sampler): loop the recording's own smpl chunk when the region declares none` —— 采样循环面的一条行为改动；**§3.4 里"循环点解析并生效、只是没有编辑器"这个判断不变**，但那一条的细节基准变了。
  3. `2e6de71 docs: the arrangement gap survey …` 与 `04c47a9 docs: the first half of the creator-facing gap list …` —— **另一条工作线已经产出了 `docs/DAW_GAP_ARRANGEMENT.md`**，见 6.3。

### 6.2 可达性数字：两套基线都写出来（不覆盖旧数，也不让旧数冒充新数）

| 基线 | 手写映射行 | 不同库 | 可达目录条目 | 够不到 | `sax_lead` 指向 | `walking_upright` 指向 |
| --- | --- | --- | --- | --- | --- | --- |
| **`d036619`**（本文的基线） | 22 | **15** | **16 / 34** | **18** | `vcsl:Tenor-Saxophone-Keyswitch` | `karoryfer-meatbass:pizz-basic` |
| **`04c47a9`**（当前 `origin/dev`） | 22 | **16** | **17 / 34** | **17** | `mtg-solo-sax:MTG-Tenor-Sax` | `dsmolken-double-bass:d-smolken-rubner-bass-pizz` |

* 净变化：**+2 个库进可达集**（`mtg-solo-sax`、`dsmolken-double-bass`）、**−1 个库掉出**（`karoryfer-meatbass`，它原来靠 `walking_upright` 进来，替换后就没了别的行指它）⇒ 15 → 16 个库、16 → 17 条可达。
* ⚠️ **不要用"文本零引用"来数"调色板够不到"**——那是个代理，而且它已经废了：新基线上 `git grep` 只剩 `ixox-flute` 一条零引用，因为 `c19b416` 新增的 `src/test/sampledInstrumentPaletteWiring.test.ts` 里有 `FOREIGN_LIBRARIES` 清单，**故意把这些库名写进仓库来断言它们不在任何行里**。**唯一正确的探针是从调色板行抽 `assetId` 的库前缀**（§5.4 ①）。展开见 §6.4 第 3 条。
* **327 个程序级资产 id 两套基线上都是 327**（34 条目录一条都没被跳过）。
* ⇒ **教训（与本文 §5 同一条）**：**报一个"16 / 34"而不写基线，等于报了一个会过期却看不出来的数**。读者要核的时候，先 `git rev-parse HEAD`。

### 6.3 与姊妹文档 `docs/DAW_GAP_ARRANGEMENT.md` 的边界（它已经覆盖了什么）

`origin/dev` 上已有另一份同样体例的调研：**`docs/DAW_GAP_ARRANGEMENT.md`**（工作树 `groove-dawarr`、分支 `daw-arrangement`、**同样基线 `d036619`**）。它的六节是：时间线交互／键盘与鼠标工效／撤销与历史／**从零到有声**／改一个已有想法的成本／"命令表有多少条"。

**⇒ 边界要说清楚，否则两份文档在同一个问题上各说各话**：

* **它管"编排与编辑交互"**（时间线上怎么拖、键盘怎么用、撤销、命令表）；**本文管"创作面"**（音色发现、MIDI／鼓编程、采样素材、混音面、以及"从零到一个想法"里的**素材与生成**）。
* ⚠️ **一处真实重叠**：**"从零到有声"两边都有**。它在 §3.4，本文在 §3.6。**本文的写法有意与它不同**：它数的是**从空工程到第一个音的步数**（含"1 步 = 一次用户动作"的定义与"手册明文／推算"的标注）；本文数的是**素材从哪来**（模板／和弦进行／loop／生成式工具）+ **本仓默认路由本身就是一条完整曲风（1 步）**。⇒ **两者不矛盾，但如果只读一份，会漏掉另一半**；合并时应把"步数"归它、"素材来源"归本文。
* **重叠的第二处**：它 §3.4 与本文 §3.6 都会提到"从零到有声"的**步数**。**本文不重新定义步数**，只引用它已经定好的口径。
* 两份文档的**三态与优先级表是各自独立的**，所以出现同一个能力在两份里各排一次是正常的；**合并时要去重**。

### 6.4 我对自己初稿的三处更正（都被我自己的复核推翻）

按本仓的既有做法（`docs/OPEN_WORK.md` §85／§87 都有"更正我自己"的条目），我把自己初稿里**写错又自己抓出来**的两条记在这里，因为**错法本身有信息量**：

1. **"全仓 grep `A/B` → 0 命中 ⇒ 本仓没有 A/B 对比"** —— **错的**。实际 `grep "A/B" src mcp` 返回 **21 个文件**；本仓**真的有** A/B（盲听 A/B 评估模式 `Toolbar.tsx:114`、两个曲风 A/B 同步试听 `explore.ts:171,266`、pattern 的 A／B 两个槽 `useSequencerStore.ts:37`）。**缺的是另一种**：把设备／通道条的**当前参数**存成两态来回切。⇒ **错因**：我第一遍只在一个**窄目录范围**里搜过，却把结论写成了"全仓"。**教训：搜过的范围必须和结论的范围一致**，这一点现在写进了 §5.2 的表头。
2. **"`draggable`／`onDragStart`／`onDrop` 在三个组件目录下 0 命中"** —— **错的**，实际 **2 个文件**：`insertCurveViews.tsx:187`（EQ 曲线段的拖动把手）与 `ProjectHubModal.tsx:407`（工程文件拖入）。结论本身不变（**都不是音色／素材拖放**），**但"0 命中"这个数字是错的**。⇒ **错因**：我把"全仓 `onDrop` 只有一处"这个较早的观察，直接套成了那个组合 grep 的结果，**没有重跑**。
3. ⭐ **"17 个新库在 `src/`＋`mcp/` 里零引用"是一个弱探针，而它在新基线上已经失效** —— 数字**在我那条基线上是对的**（我跑过），但**"文本零引用"只是"调色板没映射它"的代理**，一旦有人把库名写进散文或测试，代理就不再等价。**它在 `04c47a9` 上真的失效了**：`git grep` 只剩 `ixox-flute` 一条零引用，因为 `c19b416` 新增的 `src/test/sampledInstrumentPaletteWiring.test.ts` 里有一张 **`FOREIGN_LIBRARIES`** 清单，**把 12 个库名写进仓库，正是为了断言它们不出现在任何调色板行里**。⇒ **"数文本出现次数"与"调色板有没有映射它"是两件事**；唯一正确的探针是从调色板行抽 `assetId` 库前缀（§5.4 ①）。**我没有把旧的 17 覆盖掉**，而是在 §5.4 ② 与 §6.2 里写明它是什么、什么时候失效的。

⇒ **三条错法的共同点**：**我报的是我"记得搜过／以为等价"的结果，而不是我"刚刚跑过、且形状对得上"的结果**。这与本文 §1.5 第 3 条（结果要落盘、别靠一次返回）是同一个毛病的不同面。**结论**：**任何"0 命中"都必须连"搜了什么词、在哪个范围、以及在哪个基线上"一起写出来**——本文 §5.2 的表头已经按这条改了。
