# 主流 DAW 的编排／编辑／交互调研 —— 逐条对照本仓的差距与优先级（创作者视角）

**状态**：研究文档，新建。**没有改任何代码、没有改 `docs/OPEN_WORK.md`、没有推 `dev`。**
**工作树**：`/home/crow/music/groove-dawarr`，分支 `daw-arrangement`（基线 `origin/dev` @ `d036619`）。
**取证日期**：2026-10-02／03（UTC，各来源抓取时间见 §1.3）。
**本仓侧读过的**：`docs/research/` 全目录、`docs/ARRANGEMENT_UI_DESIGN.md`、`docs/ARRANGEMENT_PLAN.md`、`docs/PRO_EDITOR_PLAN.md`、`docs/V4_REVIEW_PLAN.md`、`docs/ARRANGEMENT_V2.md`、`docs/TRACK_ARRANGEMENT_PLAN.md`，以及 `src/components/arrangement/` 全部 19 个文件、`src/components/ShortcutsModal.tsx`、`src/types/arrangementV2.ts`、`src/data/arrangementHistory.ts`、`src/data/arrangementEdits.ts`、`src/data/logicToArrangement.ts`。

---

## ① 方法与来源

### 1.1 取证规则（本报告自己受的约束）

1. **只以官方手册／官方帮助为来源**。一句结论 = 一个 URL + 一句**逐字**原句。第三方教程、论坛、二手转述一律不作为功能依据。
2. **查不到就写"未找到"**。本报告没有任何一条"凭印象的功能"。凡是手册只给出目录标题而没有正文的，我写明"仅手册目录记载"。
3. **不做听感判断**。只写交互与功能的可核事实。
4. **每条结论落到三态**：本仓 **有 ✓／半有 ⚠️／没有 ✗**，并给本仓文件依据（`文件:行` 或组件名）。
5. **步数怎么数**：1 步 = 一次用户动作（一次点击、一次按键、一次下拉选择）。**手册直接编号的**标注"手册明文"；**由手册条文串出来的**标注"**推算**（依据如下）"，并列出所依据的条文；**手册不足以串出**的写"未找到"。

### 1.2 本仓侧证据的读法

- `docs/ARRANGEMENT_UI_DESIGN.md` §5 是本仓**自己写下的"有意不抄"清单**（comping/take 通道、自动化通道、follow action、warp 标记、clip 包络），§8 是落地顺序；它是本报告判断"✗ 没有"时最直接的仓库自述证据。
- `docs/V4_REVIEW_PLAN.md:492` 自述"**no continuous automation across sections**"为 true；`:505` 把"automation lanes"排在优先级第 4。
- 组件行为以代码为准：`ArrangementViewV2.tsx`（1182 行，编排主视图）、`ArrangementLaneV2.tsx`、`PianoRollV2.tsx`、`ArrangementRulerV2.tsx`、`LoopBraceV2.tsx`、`TakeSelectorV2.tsx`、`NewProjectPanelV2.tsx`、`TrackHeaderV2.tsx`、`TrackListV2.tsx`、`ArrangementKeyboardV2.tsx`、`ScoreV2.tsx`、`RecordButtonV2.tsx`、`InstrumentLibraryV2.tsx`、`InstrumentBrowserV2.tsx`、`ArrangementFileEntriesV2.tsx`、`ImportInstrumentMappingV2.tsx`、`ArrangementPanel.tsx`、`percussionStaff.ts`、`kindLabels.ts`、`TrackRows.tsx`。

### 1.3 来源清单（产品／版本／来源／抓取日期）

| # | 产品 | 版本（来源自述） | 一手来源 | 抓取 |
|---|---|---|---|---|
| A | Ableton Live | Reference Manual **Version 12** | `https://www.ableton.com/en/live-manual/12/<chapter>/`、`https://www.ableton.com/en/live-manual/12/` | 2026-10-02 |
| B | Bitwig Studio | 用户指南自述 **v5.3**；完整性另脚注 PDF `Bitwig_Studio_User_Guide_English_XfuP7Nz.pdf` | `https://www.bitwig.com/userguide/latest/<chapter>`、PDF（经 `https://www.bitwig.com/userguide/latest/` 的 Download PDF） | 2026-10-02 |
| C | Logic Pro | 官方 PDF：**Logic Pro User Guide for Mac**（Apple 指南网站当前列出的最新版为 **12.3**） | `https://help.apple.com/pdf/logicpromac/en_US/logic-pro-mac-user-guide.pdf`；站点话题页 `https://support.apple.com/guide/logicpro/<slug>/mac` | 2026-10-02 |
| D | GarageBand | 官方指南自述 **GarageBand 10.4.14** | `https://support.apple.com/guide/garageband/<slug>/mac`、`.../welcome/mac` | 2026-10-02 |
| E | FL Studio | 官方在线手册（image-line.com，2024/2025 版手册本体） | `https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/<page>.htm` | 2026-10-02 |
| F | Studio One → **Fender Studio Pro** | 手册站点现名 **Fender Studio Pro**（Presonus `s1manual.presonus.com` 现 301 重定向到 `fenderstudiopromanual.fender.com`） | `https://fenderstudiopromanual.fender.com/en/Content/...`、`https://s1manual.presonus.com/`（重定向链） | 2026-10-02 |
| G | Cubase | 官方帮助映射自述 **Cubase Pro 14.0 Operation Manual**（元数据 `version: 14.0.30`） | Steinberg Fluid Topics：`https://www.steinberg.help/api/khub/maps/9_A2jNxlDJdZgViRgyezjA/topics`（正文经 `contentApiEndpoint` 取）＋读者 URL `https://www.steinberg.help/r/cubase-pro/14.0/en/...` | 2026-10-02 |
| H | REAPER | 官方用户指南自述 **v 7.81**（2026-09-28） | `https://www.reaper.fm/userguide.php` → `https://dlx.reaper.fm/userguide/ReaperUserGuide781c.pdf` | 2026-10-02 |

**委托方点名的"有余力再看"**：Reason／Luna／Digital Performer —— **本次未做**，原因写在 §1.4，不以印象补写。

### 1.4 覆盖与不覆盖

- **覆盖**：A–H 八款，每款都回答 §三 的五个维度；能取到的一手来源如上表。
- **不覆盖**：Reason／Luna／Digital Performer（本次预算全部用于前八款）；BandLab／Soundtrap／Splice 等浏览器产品（不是本次点名对象）。
- **本仓未实现的 DAW 级能力**（如 warp、自动化通道）在 §③ 一律记 **✗**，不因为"设计文档写进计划"而记 ⚠️；计划与实现的区别见 `docs/ARRANGEMENT_UI_DESIGN.md` §8 与代码本身。

### 1.5 对仓库旧结论的**作废声明**（"取不到"是有保质期的）

- ⚠️ **作废**：`docs/ARRANGEMENT_UI_DESIGN.md` §9 记「**Studio One**：一手手册没取到（DNS/404/403 都遇到）」。**该结论自本次取证起作废**，原因是**站点 301 重定向**：`https://s1manual.presonus.com/` → `https://fenderstudiopromanual.fender.com/en/Studio-Pro-User-Manual.htm`（本报告 2026-10-02 实测的 `curl -L` 有效 URL 正是后者），且产品线在手册上以 **Fender Studio Pro** 呈现。⇒ 读旧文档的人应当把那条当作**当时**的事实，而不是现状；本次已据此在 §② F 补上四条正文证据（Comping／Arrange View Mouse Tools／Timestretching／Patterns）。
- ⚠️ **自纠（两处）**：① 本报告 v1 稿的"编排命令表 21 个"是错的，正确的数法与数字见 §3.6（**17 个面向用户的命令工厂**，另有 3 个基础设施函数）；② v2 稿把"片段不可拖"说成了全仓范围，**太强**——`ArrangementPanel`（Studio 编辑器）已有按小节量化的 move／resize 拖动，更正与由此下调的成本见 **§6.2**。

---

## ② 逐 DAW 事实卡

每条格式：**事实**（逐字原句 + URL）→ **创作者角度**（这件事让谁更快／更少挫败）。每张卡末尾是"从零到有声"。

### A. Ableton Live 12

**A1 时间线交互**

- **工具集与切换**：Live 的编排视图**无模态工具面板**是它的公开立场；编辑靠三种模式与修饰键完成——手册记 Draw Mode 的进入方式：`"To use Draw Mode, select the Draw Mode option from the Options menu, or press B."`（`https://www.ableton.com/en/live-manual/12/editing-midi/`）。*创作者角度：把"画"做成一个可开关的状态而不是一个得先找的工具，少一次工具切换。*
- **吸附与网格**：`"Clips snap to the editing grid, as well as various objects in the Arrangement including the edges of other clips, locators and time signature changes."` / `"To bypass grid snapping, hold down Ctrl Alt Shift (Win) / Cmd Option Shift (Mac) while dragging the clip's contents."`（`https://www.ableton.com/en/live-manual/12/arrangement-view/`）。MIDI 侧另有一条全局旁路键：`"You can bypass grid snapping by turning off the grid using the Grid Settings button, by deactivating the Snap to Grid option in the Options menu, or by pressing the Ctrl 4 (Win) / Cmd 4 (Mac) key combination."`（`.../editing-midi/`）。*创作者角度：旁路键让"这一次不要吸"不用去改设置再改回来。*
- **缩放／导航**：Live 的 `Z`（缩放到选区）／`X`（退回）与标尺手势由本仓 `docs/ARRANGEMENT_UI_DESIGN.md` §3 转引（其来源是 Live 手册的对应节），**本次没有重新取到逐字原句** → 本报告按"未找到（本次）"处理，不把转引当一手证据。
- **片段增益与淡入淡出**：`"The beginning and end of audio clips in the Arrangement View have adjustable volume fades. Additionally, adjacent clips on the same audio track can be crossfaded."`；淡入淡出的**手柄在片段边缘**，轨道太矮时手柄不可见（手册要求把轨道拉高）——`"Fade controls are located at the edges of audio clips, provided that the tracks are expanded enough for the fade handles to be visible."`（`.../arrangement-view/`）。*创作者角度：淡入淡出是"在片段上直接拖"，不是打开另一个面板。*
- **warp／time-stretch／音频量化**：`"Warp Markers let you lock a specific point in a sample, such as a transient, to a particular place in the timeline."`；音频量化：`"To quantize audio, click anywhere in the Sample Editor to bring it into focus, and then use the Quantize command from the Edit menu or the shortcut Ctrl U (Win) / Cmd U (Mac)."`，且有 Amount 百分比让它"别太死"（`.../audio-clips-tempo-and-warping/`）。*创作者角度：量化音频前先让音频可 warp——两件事在同一份手册的同一章，说明它们是同一条工作流。*
- **take lanes／comping**：`"Live can create take lanes in a track as you record material, which you can use to piece your favorite parts together."`；也能手动插入：`"You can manually insert a take lane into one or multiple selected tracks by choosing the Insert Take Lane command from the Create menu."`（`.../comping/`）。
- **automation 车道与曲线**：`"in Arrangement View you can view them in automation lanes"`；曲线：`"You can add a curve a line segment by holding Alt (Win) / Option (Mac) and dragging the segment."`；还有拉伸／斜切：`"When hovering over a time selection, handles appear around the outer edges of the selection."`（`.../automation/`）。
- **层级（group／folder／bounce）**：`"You can combine any number of individual audio or MIDI tracks into a special kind of summing container called a Group Track."`（Edit 菜单 Group Tracks 命令，`.../mixing/`）；提交成音频：`"Bouncing allows you to commit tracks, clips, or time selections into audio on new audio tracks."`（`.../bounce-to-audio/`）。

**A2 键盘与鼠标工效**
- 修饰键语义密集且有文档：拖片段内容 `Ctrl Shift`／旁路吸附 `Ctrl Alt Shift`／曲线 `Alt`＋拖（同 A1 三条 URL）。
- 右键与上下文动作：吸附旁路、参数值精确输入都挂在**片段或断点的上下文菜单**上：`"To set an exact value for a breakpoint or segment, choose the Edit Value option from the breakpoint's or segment's context menu, then type in the value with your computer keyboard."`（`.../automation/`）。*创作者角度：右键="对这一个对象能做的事"，不用先选中再去顶部找。*

**A3 撤销与历史**
- `"The Undo History lists all the actions taken since opening a Set and lets you revert or reapply them up to a specific point."`（`.../managing-files-and-sets/`）
- 打开方式与**可跳转**：`"To open the Undo History, select the Undo History entry from the View menu or use the shortcut Ctrl Alt Z (Win) / Cmd Option Z (Mac)."`；`"To restore the Set to a particular action in its history, select that action by either clicking it or navigating to it with the up and down arrow keys and pressing Enter."`（同页）
- 两条边界（对创作者很重要）：`"Note that the Undo History is not saved with a Set once it is closed and is refreshed each time the Set is opened. Creating or opening a Set is treated as the first action in the Undo History and therefore cannot be undone."`（同页）
- A/B 快照：`"Every built-in Live device includes two device states, A and B, which can store separate parameter values."`（`.../working-with-instruments-and-effects/`）

**A4 从零到有声**
- 手册**没有**给出逐步计数 → 计数记"**未找到（仅有以下依据）**"。可核依据：`"Use the File menu's New Live Set command to create new Live Sets"`；`"Use the File menu's Save Live Set As Default Set… command to save the current Live Set as the default template. Live will use these settings as the initialized, default state for new Live Sets."`（`.../managing-files-and-sets/`）。**推论（标注为推算）**：若把默认模板预配置成"一轨＋乐器"，则"启动 → 空格"= **2 步**；不改模板则是"New Live Set → 建 MIDI 轨 → 浏览器拖入乐器 → 空格"= **4 步**。

**A5 改一个已有想法的成本**
- 改速度：Tempo 在 Control Bar，且在 Warp 语境下由"Leader/Follower"决定谁听谁：`"When a clip is set to Lead, the Set plays back at the tempo determined by the clip's Warp Markers."`（`.../audio-clips-tempo-and-warping/`）。*创作者角度：改 BPM 只对"跟随"的素材生效，这既省事也容易困惑——手册把它写在明面上。*
- 换乐器／换片段：Live 的装置可 A/B 对比（A3 引用），素材换法在手册中以浏览器替换／hot-swap 承担（hot-swap 章节存在于目录：`23.2.4 Hot-Swapping Presets`）。

---

### B. Bitwig Studio 5.3

**B1 时间线交互**
- **工具集与切换（本报告里工具语义最完整的一家）**：`"Tool Palette menu: This menu allows you to toggle between Bitwig Studio's various editing tools."`；**每个面板各有自己的工具**：`"each timeline-based panel has its own tool palette. This allows us to have a different tool selected for each individual panel."`；单键并且**可按住临时用**：`"Pointer tool is for selecting and moving objects… You can switch to this tool by pressing [1], or you can temporarily use the tool by holding [1]."`；`"Time Selection tool … You can also explicitly switch to this tool by pressing [2], or you can temporarily use the tool by holding [2]."`；右键也能切：`"right-clicking within any timeline-based panel will give you the option to switch tools at the top of the context menu."`（均可核于 `https://www.bitwig.com/userguide/latest/the_arrange_view_and_tracks`）。*创作者角度：`[1]`/`[2]`＋按住临时用 = 不必来回切模式；右键顶部＝切工具的第二个入口。*
- **吸附**：`"The second option is new and indicates that SHIFT temporarily inverts the snapping behavior, offering to Disable it when it is currently enabled, and vice versa."`；状态显示在编辑器右下角：`"Most of these options live on the bottom right of any timeline editor."`（`https://www.bitwig.com/userguide/latest/arranger_clips_and_the_browser_panel`）。
- **comping／take 通道**：`"Comping in Bitwig Studio is based on the idea of defining comp regions, and then selecting which of the available take lanes (if any) is played within that region."`；它是 clip 编辑模式里的一个**视图**：`"When in clip editing mode, a Comping expression view is available second."`（`https://www.bitwig.com/userguide/latest/working_with_audio_events`）。*创作者角度：comping 不是新面板，是同一个 clip 的第二种读法。*
- **bounce in place**：官方 What's New 记 `"The Bounce function now has an In-Place toggle, allowing full configuration of the Bounce In Place function"`，并有 Pre-FX／Pre-Fader／Post-Fader 三种（`https://www.bitwig.com/userguide/latest/`）；PDF 正文：`"The Bounce In Place function is similar to the Bounce function with two …"`、`"Since Bounce In Place deletes your source clip, it is a good practice …"`（PDF 第 375 页附近，来源同 §1.3 B）。

**B2 键盘与鼠标工效**
- 快捷键**可自定义**并明说手册可能因此过时：`"When this manual refers to keyboard shortcuts, it is referencing the program's default shortcuts. Once you begin using your own shortcuts, the shortcuts in this document may be inaccurate for your use."`（PDF §0.2；同章网页 `https://www.bitwig.com/userguide/latest/anatomy_of_the_bitwig_studio_window`）。*创作者角度：官方直言"手册会因你的自定义而失效"，等于承认快捷键是用户资产。*

**B3 撤销与历史**
- 官方指南中"undo"**只有一处**：Dashboard 的 Edit 菜单 `"It provides standard "edit" commands for your current selection (like cut, copy, paste, duplicate, and delete), as well as to undo (or redo) recent actions taken across the program."`（PDF §2；网页同上）。
- **Undo History／深度／是否覆盖混音器与插件参数：未找到**。取证方式：对官方 v5.3 用户指南 PDF 全文（27 481 行）检索 `undo` 只有上述 1 处、`Undo` 0 处、`History` 0 处、`Ctrl+Z` 0 处。**这不是"Bitwig 没有"，而是"官方指南没有写"** —— 本报告只记后者。

**B4 从零到有声**
- 手册未给逐步计数 → **未找到（仅有以下依据）**：Dashboard `"The Add menu is always present. It allows you to create new tracks and scenes."`（同 B3 出处）。*创作者角度：Add 菜单常驻＝建轨不必先找菜单层级。*

**B5 改一个已有想法**
- 音频的"不对齐"有独立入口：`"hold SHIFT + ALT and click, to initiate Quick Slice mode without quantization"`（`.../arranger_clips_and_the_browser_panel`）。*创作者角度：一次修饰键组合就得到"不量化"的切片，避免先关量化再切再打开。*

---

### C. Logic Pro（11 系机器／官方指南现为 12.3）

来源：官方 PDF `https://help.apple.com/pdf/logicpromac/en_US/logic-pro-mac-user-guide.pdf`（页码按 PDF 内标注），话题 URL 为 `https://support.apple.com/guide/logicpro/<slug>/mac`。

**C1 时间线交互**
- **工具集**：Logic 的工具是一个**工具清单**（Pointer、Marquee、Flex、Slip、Automation Select、Automation Curve…）：`"Use the crosshair-shaped Marquee tool to select and edit parts of regions."`；`"Click and hold a region with the Slip tool to slip the region, which moves the content of the region left or right by the Snap value without moving the boundaries of the region."`；`"Use to Automation Curve tool to bend or reshape the curve between two automation points, creating a nonlinear transition between the points."`（PDF「Work with tools」节，p.54 起）。
- **take folder（comping 的载体）**：`"When you record multiple takes, a take folder is created on the track, containing the take …"`（PDF p.≈? 「take folder」节；本句为逐字截取）。
- **bounce in place**：`"Using the Bounce in Place commands, you can process audio and software instrument …"`（PDF「Logic Pro for Mac bounce in place overview」节）。
- **Flex**：目录记 `Flex Time and Pitch overview`（PDF 目录 p.436）——**仅有条目级证据**，正文未逐句取证。
- **project key**：目录与正文均有 `Set the project key signature`（PDF 目录 p.1033 区、正文 `9974` 行附近有 `Project key command`）——**条目级证据**。

**C2 键盘与鼠标工效**
- Logic 的键命令是**可自定义的一张表**：官方指南有独立「Key commands」章（PDF 目录 p.1121）。

**C3 撤销与历史（本报告在"历史"维度取证最完整的一家之一）**
- `"Logic Pro for Mac includes an Undo History window with a time-ordered list of all edits that can be undone. You can also change the number of steps that can be undone (up to 200) in Logic Pro > Settings > General > Editing."`（PDF p.60；同话题 `https://support.apple.com/guide/logicpro/lgcp1dbd67ab/mac`）
- **范围**：`"You can undo virtually any edit, including moves, deletions, renaming, and parameter changes; and the creation of new events, regions, channel strips, and more."`（同页）
- **开窗**：`"In Logic Pro, choose Edit > Undo History (or press Option-Command-Z)."`（同页）
- **覆盖混音器与插件**（Apple 官方支持文章）：`"In Logic Pro 10.4, you can undo and redo adjustments to the Mixer, to all plug-ins included with Logic Pro and to some third-party plug-ins. You can also access Mixer and plug-in adjustments in the current project in the Undo History window."`（`https://support.apple.com/en-za/101876`）

**C4 从零到有声**
- 手册未给逐步计数 → **未找到**；依据：`"You start working in Logic Pro for Mac by creating a new project. In the Project Chooser, you can choose a template to use as the starting point for a new project."`；`"To create a new, empty project: Click New Project."`；建轨走 New Tracks 对话框：`"When you create a new track using the New Tracks dialog, a new channel strip for the track is also created."`（PDF「Logic Pro project basics」节）。**推算**：空工程路径 = New Project → New Tracks → 选 Software Instrument → Create → 空格 = **5 步**；模板路径更短（模板即"已建好轨与乐器"）。

**C5 改一个已有想法**
- 改调性有**工程级 key**（`Set the project key signature`，Apple Loops 会跟着变）：`"Once the project key signature is determined, loops in the Loop Browser play in the project key."`（PDF 行 11544 附近）。*创作者角度：调性一次设定，素材自动跟随——不需要逐个片段转调。*

---

### D. GarageBand 10.4（Mac）

来源：`https://support.apple.com/guide/garageband/<slug>/mac`。

**D1 时间线交互**
- 建轨：`"You add tracks to a project to hold your recordings, loops, and other material."`；`"Choose Track > New Track (or press Option-Command-N)."`；`"You can create a software instrument track, a Drummer track, or an audio track (using either the "Mic or Line" or "Guitar or Bass" option)."`（`.../create-tracks-gbnd22a07333/mac`）
- **take（take folder）**：`"When you're recording, you can record multiple versions, or takes, in quick succession—both for audio and MIDI. Later, you can choose the take you want to use in the project."`；`"click the number in the upper-left corner of the take folder, then choose a take from the pop-up menu."`（`.../choose-and-delete-takes-gbnd5fa82adf/mac`）——**是"选一条 take"，不是"跨 take 拼一个 comp"**，本报告按此记。
- **音频量化**：`"You can quantize, or automatically correct, the timing of regions on an audio track."`（`.../quantize-the-timing-of-audio-regions-gbnd221a8f4a/mac`）；Flex 标记另有话题 `Set and move flex markers`。
- **吸附**：话题 `Snap items to the grid`（`.../snap-items-to-the-grid-gbnd18b085e9/mac`）——**条目级证据**。

**D2 键盘与鼠标工效**：无独立"工具"面板文档；编辑在 Tracks area 与各 Editor 内完成（`Intro to the Editor` 等话题）。**未找到**单键工具切换的条文。

**D3 撤销与历史（全报告最薄的一家）**
- `"You can undo your last edit operation if you change your mind, and redo an edit you have undone."`；`"In GarageBand on Mac, choose Edit > Undo (or press Command-Z)."`；`"In GarageBand on Mac, choose Edit > Redo (or press Shift-Command-Z)."`（`.../undo-and-redo-edits-in-garageband-gbnd674b44b9/mac`）
- **历史列表／深度／是否覆盖混音器与插件参数：未找到**。

**D4 从零到有声**：手册未给逐步计数 → **未找到**；依据 D1 的建轨条文。**推算**：New Project（空）→ New Track → 选 Software Instrument → Create → 空格 = **5 步**。

**D5 改一个已有想法**：`Set the tempo`（`.../set-the-tempo-gbnd8eff7615/mac`）为话题级证据；`Control timing with the groove track` 提供"跟着另一轨的感觉走"（话题级）。

---

### E. FL Studio（在线手册，2024/2025 版）

来源：`https://www.image-line.com/fl-studio-learning-content/fl-studio-online-manual/html/<page>.htm`。

**E1 时间线交互**
- **Playlist 的吸附与 Alt 旁路**：`"Playlist Snap - Snap determines how Clips will move and quantization aligns events relative to the background grid."`；`"Holding the Alt key temporarily sets snap to 'none'."`；`"If items are placing off-grid after changing snap, select them and use the Quantize command (Alt/Opt+Q)."`（`.../playlist.htm`）
- **画与刷是两种模式**：`"Add clips by Draw mode ( P ) - Left-click to add the currently selected Clip."`；`"Add clips by Paint mode ( B ) - Left-click to adds the currently selected Clip. Click-and-drag to paint multiple clips."`；切片：`"Slice ( C ). Click and drag to make vertical slices through Clip OR use ( Left-Shift ) to Slice diagonally."`（同页）。*创作者角度：画/刷分开＝"放一个"与"铺一排"是两次不同的意图，各自一键。*
- **automation clip**：手册有独立页 `playlist_automationclip.htm` 与 `automation_eventeditor.htm`（页面级证据）。

**E2 键盘与鼠标工效（本报告里单键工具最密的一家）**
- `.../basics_shortcuts.htm` 的 Playlist 工具键逐条可核：`B Paint tool`、`C Slice tool`、`D Delete tool`、`E Select tool`、`P Draw tool (pencil)`、`S Slip edit tool`、`T Mute tool`、`Y Playback tool`、`Z Zoom tool`；旁路与全局：`Alt Bypass snap`、`Backspace Toggle Global Snap`。
- **右键即是工具**：`Right-Click Activates the Delete tool`、`Double Right-Click Activates the Mute tool`（同页）。*创作者角度：右键=删除工具，省掉"先按 D 再点，再按回 P"。*

**E3 撤销与历史（深度与覆盖都可核，且是"选择加入"）**
- **可跳转的历史**：`"These two commands allow you to step through the edit history of FL Studio (to see a list of the actions currently stored in the history, open the Project Browser / History folder)."`（`.../menu_edit.htm`）；`"Jump to an undo point – Left-click the item in the list."`（`.../browser.htm`）
- **深度可设**：`"Maximum undo levels - Sets the maximum undo steps kept in the edit history."`（`.../envsettings_general.htm`）
- **是否覆盖旋钮与插件参数**：`"Undo knob tweaks - Enables undo of all automatable controls (sliders, knobs and check boxes) in the edit history. It can cause some performance problems with certain plugins … so the default value of this option is off."`（同页）。*创作者角度：默认**不**把旋钮动作塞进历史——历史是"结构编辑"的列表；要混音也能撤必须显式打开。这是明确取舍，不是缺陷。*

**E4 从零到有声（本报告里最短的一家之一）**
- `"Startup project - Choose from Empty project, Default template or Last used project."`；`"Default template - Choose the default Project Template to use when opening new projects."`（`.../envsettings_general.htm`）
- **默认模板里到底有什么：未找到**（手册未在该页列出内容）。**推算**：若 Startup = Default template 且其中已含乐器通道，则"启动 → 空格/点通道"= **1–2 步**；否则与别家相同。

**E5 改一个已有想法**：`Project Timebase (PPQ)` 影响缩放／吸附分辨率：`"Maximum Zoom/Snap resolution may be increased by changing the Project Timebase (PPQ) setting ( F11 )"`（`.../playlist.htm`）。*创作者角度：精细度是工程设置，不是每次操作的选择。*

---

### F. Studio One 6/7 → Fender Studio Pro（官方手册）

来源：`https://fenderstudiopromanual.fender.com/en/Content/...`。**注意**：Presonus 的 `s1manual.presonus.com` 现在 301 → `fenderstudiopromanual.fender.com`（本报告实测），品牌名为 **Fender Studio Pro**。本仓 `docs/ARRANGEMENT_UI_DESIGN.md` §9 曾记"Studio One 一手手册没取到"——**本次取到了**，以下为新增事实；**那条旧结论已作废，作废声明见 §1.5**。

**F1 时间线交互**
- **comping（Range 工具"刷"过 take 即上轨）**：`"Fender Studio Pro makes the comping process very simple. With the Arrow tool selected, floating the mouse over any layer switches to a special Range tool, indicated with the Range cursor icon. Click-and-drag with this tool to instantly promote any range of a take to the Track."`（`.../Content/Editing_Topics/Comping.htm`）。*创作者角度：悬停即换工具＝"在 take 上划一下"就是一个 comp 段，不需要先选工具再做选段再粘贴。*
- **take 与 layer 的区别被文档化**：`"Select Layer Content lists the Layers that contain any Events in the range of the currently-selected Event."`／`"Select Take lists the Takes (loop recording passes) of the Event on the Track."`（同页）
- **时间伸缩**：`"It is possible to stretch an Audio Event to fit a tempo other than its original tempo, without changing the pitch."`；且**非破坏、可撤销、可切模式回退**：`"Timestretching and defining a file tempo are nondestructive, so they can be undone and redone."`（`.../Content/Editing_Topics/Timestretching.htm`）

**F2 键盘与鼠标工效**
- 单键工具切换可核：`"Click on the Arrow tool button or press [1] on the keyboard to select the Arrow tool."`、`press [number 2] … Range tool`、`[number 3] … Split tool`、`[number 4] … Eraser tool`、`[number 5] … Paint tool`、`[number 6] … Mute tool`；`"The bracket-shaped button on the left side of the toolbar is the Link button. Click it to combine the Arrow and Range tools."`；右键列工具：`"[Right]/[Ctrl]-click in any open space in the Arrange or Edit views to open a list of mouse tools and editing commands."`（`.../Content/Editing_Topics/Arrange_View_Mouse_Tools.htm`）。*创作者角度：Link 把"箭头/范围"合成一个随高度切换的双面工具，少一次切换。*
- 工具页明说**可撤销**，鼓励试：`"It is helpful to remember that the mouse tool actions can be undone at any time, so feel free to explore them."`（同页）

**F3 撤销与历史（本次未取到正文）**
- 手册目录结构可猜但**未能取到** Undo／History 正文页 → **未找到**。Fender 手册是 JS 应用，本报告只拿到了 Comping／Arrange View Mouse Tools／Timestretching／Patterns 四页正文（见 §⑤）。

**F4 从零到有声**：**未找到**。
**F5 改一个已有想法的成本**：改 tempo 的后果写在 Timestretching 页（Follow／Don't Follow 决定素材跟不跟，同 F1 引用）。其余 **未找到**。

---

### G. Cubase Pro 14（Steinberg 官方帮助 14.0.30）

来源：`https://www.steinberg.help/r/cubase-pro/14.0/en/...`（正文经 Fluid Topics `contentApiEndpoint` 逐 topic 取得，与读者 URL 一一对应）。

**G1 时间线交互**
- **吸附**：`"The Snap function helps you to find exact positions when editing in the Project window. It does this by restricting horizontal movement and positioning to certain positions. Operations affected by Snap include moving, copying, drawing, sizing, splitting, range selection, etc."`（`.../project_window/project_window_snap_function_c.html`）
- **lanes／takes**：`"The Show Lanes mode gives you a good overview of all your takes. If you activate the Show Lanes button, the recorded takes are shown on separate lanes."`（`.../track_handling/track_handling_lanes_working_with_c.html`）
- **automation 曲线**：`"Within a Cubase project, the changes affecting parameter values over time are represented by curves on automation tracks."`；并有 `Ramp curves`／`Step curves` 两类（`.../automation/automation_automation_curves_c.html`）；平滑过渡是独立条目：`Creating Smooth Transitions Between Automation Events (Bézier Automation Curves)`（`.../automation/automation_creating_smooth_transitions_between_automation_events_t.html`，条目级）
- **crossfade**：`"Crossfades allow you to create smooth transitions for consecutive audio events on the same track. Crossfades are always event-based."`（`.../fades_crossfades_and_envelopes/fades_crossfades_c.html`）
- **音频量化/Warp**：条目级证据（官方 TOC 标题）：`Quantizing Audio Event Starts`、`Quantizing Audio Event Lengths (AudioWarp Quantizing)`、`Creating Warp Markers`、`Free Warp`（`.../quantizing_midi_audio/...`、`.../sample_editor_hitpoints/...`、`.../sample_editor_tempo_matching_audio/...`）

**G2 键盘与鼠标工效（单键工具集的明文清单）**
- Tool Category 表（逐字）：`Object Selection Tool 1`、`Range Selection Tool 2`、`Split Tool 3`、`Glue Tool 4`、`Erase Tool 5`、`Zoom Tool 6`、`Mute Tool 7`、`Draw Tool 8`、`Play Tool 9`、`Drumstick Tool 0`、`Next Tool F10`、`Previous Tool F9`、`Combine Selection Tools On/Off Alt/Opt - Shift - 1`（`.../key_commands/key_commands_tool_category_c.html`）
- **右键即工具箱**：`"The toolbox makes the editing tools from the toolbar available at the mouse pointer position. It can be opened instead of the standard context menus in the event display and editors."`（`.../project_window/project_window_toolbox_c.html`）
- **键命令可改**：`"The Key Commands dialog allows you to view and edit key commands for the main menus and functions in Cubase."`（`.../key_commands/key_commands_dialog_r.html`）

**G3 撤销与历史（分两套历史 + 快照，本报告里分层最细的一家）**
- 工程历史：`"The Edit History dialog lists all your edits. This allows you to undo any actions in the Project window as well as in the editors."`；`"You can also undo applied plug-in effects or audio processes."`（`.../project_window/project_window_edit_history_dialog_r.html`）
- 深度可设（条目级）：`Setting the Number of Maximum Undo Steps`（`.../project_window/project_window_edit_history_maximum_undo_steps_number_setting_t.html`）
- **混音器是另一套历史**：`"The History tab lists all parameter changes that you performed in the MixConsole, including changes on Modulators, and allows you to undo/redo specific actions."`（`.../mixconsole/mixconsole_history_c.html`）；快捷键 `"Press Alt/Opt - Z to undo MixConsole parameter changes or press Alt/Opt - Shift - Z to redo parameter changes."`，覆盖 `Volume changes`／`Panorama changes`／`Plug-in changes in the Inserts section`／`EQ changes` 等（`.../mixconsole/mixconsole_undo_redo_parameter_c.html`）。*创作者角度：编排编辑与混音调整分属两套撤销，改混音时按 Alt+Z 不会把编排的编辑一起撤掉。*
- **A/B（快照）有限额**：`"In Cubase, you can save up to 10 snapshots for audio-related channels. These snapshots save settings for input/output, audio, VST instrument, drum track, sampler track, group, effect, and VCA fader channels. Snapshots are saved with the project."`；`"Recalling a snapshot can be undone/redone in the MixConsole history."`（`.../mixconsole/mixconsole_snapshots_c.html`）

**G4 从零到有声**
- 手册未给逐步计数 → **未找到**；建乐器轨的**动作**可核：`"Click Add Track in the global track control area of the track list, and click Instrument. This opens the global Add Track dialog on the Instrument page."`（`.../tracks_about/tracks_about_add_track_dialog_instrument_r.html`）。**推算**：启动 → New Project（模板）→ Add Track → Instrument → 选乐器 → OK → 弹奏 = **6 步**；模板路径更短。Cubase 的 New Project 对话框本次**未取证** → 该步按未找到计入。

**G5 改一个已有想法**：Tempo 走 Tempo Track（条目级：`Tempo Track`／`Tempo Track Editor`，`.../editing_tempo_and_signature/...`）；改变速度后音频如何跟随 → **未找到**逐句条文。

---

### H. REAPER 7.81

来源：官方用户指南 PDF `https://dlx.reaper.fm/userguide/ReaperUserGuide781c.pdf`（页脚自述 "Up and Running: A REAPER User Guide v 7.81"）。

**H1 时间线交互**
- **吸附**：`"The shortcut keys Alt S toggle snapping on and off."`（手册「Loop selection」节的小注）
- **take 与 comping**：REAPER 7 的 **fixed lane comping** 出现在官方鼠标修饰键对照表里：`Shift Ctrl → Create fixed lane comp area`、`Alt → Remove one area`（第 7 章修饰键表）；正文另有 `"or clicking in fixed lane comping areas."` 与 `"Check out your Fixed Lane Default options at Preferences, Project, Track/Send Defaults). These include …"`；经典 take 仍有 `Show All Takes in Lane`（索引 p.162）。*创作者角度：comping 区是"用修饰键拖出来的一块区域"，不是先选工具再划。*
- **stretch marker**：有独立小节 `10.7 Stretch Markers`（目录 p.196）与 `"Stretch markers can be snapped to grid by choosing Snap to grid from the Stretch markers in selected …"`（正文）。
- **提交**：条目级（索引）`Apply track FX to items as new take` 类操作见 `takes, editing ... 161` 区。

**H2 键盘与鼠标工效（无模态工具，但有可编程鼠标）**
- `"REAPER's mouse modifiers have to handle so many diverse tasks beyond just razor editing that finding your way around them can be a clumsy process. A solution to this is to be able to create your own alternative set of modifiers all relevant to a particular task (in this case razor editing), so that you can focus on that task alone."`（§7.3）
- `"By clicking on the razor edit toolbar icon (shown above) you are able to activate an alternative set of arrange view modifiers dedicated specifically to razor editing, all using the left mouse button."`（同节）
- **动作表**：`15.3 The Action List Editor Environment`、`15.4 The Actions List Context Menu`、`15.19 Mouse Modifiers`、`15.21 Saving and Restoring Mouse Modifier Settings`（目录）。
- *说明*：本报告**未找到**"REAPER 没有模态工具面板"的直接条文（正文检索 `no need to switch tools` 等无命中）→ 该结论按未找到处理，只保留上面两条可核事实。

**H3 撤销与历史**
- `"REAPER's Undo feature is very powerful. The Edit, Undo History command (or use Ctrl Alt Z) toggles open and closed the Undo History Window."`（§2.28）
- **深度＝内存上限（不是步数）**：`"Specify the maximum amount of memory to be allocated to Undo."`；**可随工程保存**：`"Save your Undo History with the Project File to ensure that this file is loaded with the project. Even at some later date, you will still be able to revert the project to an earlier state if you wish."`；**多分支**：`"Store multiple undo/redo paths. You can even store alternate sequences of commands and actions…"`（同节）。*创作者角度：把撤销历史随工程存下来，等于"昨天的探索也能回去"。*

**H4 从零到有声（手册给了编号步骤）**
- 手册明文（编号 1）：`"From REAPER's main menu, choose Insert, Virtual Instrument on new track. Select your instrument and click OK. The track will be inserted armed for recording, with input monitoring on."`（§13.26 步骤 1）
- 也可手工：`"Add a new track and insert a virtual instrument or synthesizer into that track's FX chain. If you wish, name …"`（正文）
- **推算**：启动（空工程已开）→ Insert 菜单 → Virtual Instrument on new track → 选乐器 → OK → 弹键盘 = **5 步**，其中"立即 armed 且 input monitoring on"是手册明说的结果——**弹下去就响**。

**H5 改一个已有想法**：Tempo 可用 tempo envelope（目录与「Automating the Tempo」对应条目见 Cubase 侧同类；REAPER 侧为 `Tempo envelope`，本次**未逐句取证** → 未找到）。

---

## ③ 差距三态表（本仓 有 ✓／半有 ⚠️／没有 ✗）

**读法**：`业界事实` 的编号指向 §② 的条目；`本仓依据` 要么是 `文件:行`，要么是组件名，要么是仓库自述文档的节号。

### 3.1 时间线交互

| 能力 | 业界事实（可核） | 本仓 | 本仓依据 | 创作者会因此少做什么（若补上） |
|---|---|---|---|---|
| 编辑工具集与切换 | Bitwig `[1]`/`[2]`＋按住临时用（B1）；Cubase 1–9/0＋F9/F10（G2）；FL 单键 9 个工具（E2）；Fender `[1]–[6]`（F2）；Logic 工具清单（C1） | **✗ 没有（有意）** | `ArrangementViewV2.tsx` 无 tool 状态；`docs/ARRANGEMENT_UI_DESIGN.md` §5 明写"模态工具面板…五个隐藏模式"为有意不抄 | ——（本仓走的是无模态路线：见下两行的"半有"） |
| 吸附值与开关可见 | Live 把网格间距画在标尺角（A1）；Bitwig 状态在编辑器右下角（B1） | **✓ 有**（显示与开关） | `ArrangementViewV2.tsx:80`（`SNAP_VALUES` 1/4–1/32）、`:202-203`（`snap`/`snapOn` 两个状态）、`:755-774`（循环值与开关两个按钮）、`ArrangementRulerV2.tsx:109`（标尺上画当前值） | 看得见才敢信 |
| **吸附真正作用于编辑** | Live `Ctrl 4`／`Alt` 临时旁路（A1）；Bitwig `SHIFT` 反转（B1）；FL `Alt` 临时设 none（E1）；Cubase Snap 限制移动/复制/绘制/裁剪（G1） | **✗ 没有** | `snapOn`／`snap` 的**唯一去处是刻度尺上的一行字**：`ArrangementViewV2.tsx:930` `snapLabel={snapOn ? snap : undefined}`（定义 `:80`／状态 `:202-203`／工具栏 `:755-774`）。**没有任何编辑路径消费它**；`PianoRollV2.tsx` 的落点是 `step * STEP_BEATS` 固定格，无旁路分支。⚠️ **这与 `20664ac` 是同一类问题**：要么让它真正决定量化单位，要么删掉它 | 少一次"画完再对齐"；吸附能真的关掉 |
| 修饰键语义（拖拽时） | Live `Ctrl Shift`（滑内容）/`Ctrl Alt Shift`（旁路）（A1）；Bitwig `SHIFT` 反转（B1）；Cubase 工具修饰键偏好页＋`Alt/Opt-Shift-1`（G2）；REAPER 整张鼠标修饰键表（H2） | **✗ 没有** | `grep altKey/shiftKey` 在 `src/components/arrangement/` 只命中 `ArrangementViewV2.tsx:430,434`（撤销）与 `LoopBraceV2.tsx:49`（循环键盘微调），**没有任何拖拽语义** | 少一次"用菜单完成本该用修饰键完成的事" |
| 缩放层级／导航 | Bitwig 标尺上下拖＋`+/-`＋捏合，标签随缩放细分（B1、`docs/ARRANGEMENT_UI_DESIGN.md` §3）；Live `+/-`、`Ctrl+wheel`（§3 已引） | **⚠️ 半有** | `ArrangementViewV2.tsx:200`（`pixelsPerBar`）、`:789-811`（−/＋，步进 1.5）、`ArrangementRulerV2.tsx:45`（`rulerLabelFor` 随缩放从"小节"变"小节.拍"）；**没有**缩放到选区（Z/X）、没有键盘滚动、没有"适配全部" | 少一大段看不到自己刚写的那两小节 |
| 片段增益与淡入淡出 | Live 片段首尾可调音量淡变、相邻片段可交叉淡变、有 Fade Curve 手柄（A1）；Cubase 事件式交叉淡变（G1） | **✗ 没有**（轨道增益有，片段增益/淡变没有） | 只有轨道级：`setTrackGainCommand`（`arrangementHistory.ts:254`）＋`TrackHeaderV2.tsx:156` 增益、`TrackListV2.tsx:191` 声像；`ArrangementLaneV2.tsx` 无淡变手柄，全仓无 fade 命令 | 少一次"为了一个渐弱去开混音器画自动化" |
| warp／time-stretch | Live Warp 标记（A1）；Fender Timestretching 非破坏可撤（F1）；Cubase AudioWarp/Free Warp（G1）；REAPER stretch marker（H1） | **✗ 没有** | `grep -i "warp\|stretch"` 在 `src/data/arrangement*.ts`、`src/audio/playArrangementV2.ts` **零命中**；`docs/ARRANGEMENT_UI_DESIGN.md` §5 明列为"需要原生级引擎"而有意不抄 | 少一次"素材不合拍就只能重录/重找" |
| 音频量化 | Live `Ctrl U`＋Amount 百分比（A1）；GarageBand 可量化音频区（D1）；Cubase AudioWarp quantize（G1） | **✗ 没有** | 同上：编排数据里没有音频事件类型（`types/arrangementV2.ts:30` 的 kind 只有 `drumkit/synth/sampler/fx/folder`，**没有 audio**） | ——（无音频轨，此条对当前形态不适用；补音频轨时它才成为成本） |
| take lanes／comping | Live take lanes＋comping（A1）；Bitwig comp regions＋take lanes（B1）；Cubase lanes/comping（G1）；REAPER fixed lane comping（H1）；Fender 悬停 Range 刷 comp（F1） | **⚠️ 半有**（有 take，无 lane/comp） | 有：`addTakeCommand`（`arrangementHistory.ts:356`）、`TakeRegion`（`types/arrangementV2.ts:100`）、`takeRegions`（`:88`）、`TakeSelectorV2.tsx`（选一条 take）、`RecordButtonV2.tsx:33`。没有：无 lane 视图、无跨 take 逐段拼合、无"悬停即范围" | 少一次"重录整条只为了第二小节那个音" |
| automation 车道与曲线 | Live automation lanes＋Alt 拖出曲线＋拉伸斜切（A1）；Cubase ramp/step 曲线＋Bézier（G1）；FL automation clip（E1） | **✗ 没有** | 设计文档 §5 明列"自动化通道"为有意不抄；`docs/V4_REVIEW_PLAN.md:492` 自述 "**no continuous automation across sections**" 为 true；`src/data/logicToArrangement.ts:27-28` 明确写着自动化"**no counterpart** … so they are **reported, never dropped quietly**" | 少一次"把渐强留给人工分步或干脆不做" |
| group／folder 层级 | Live Group Track（Edit 菜单一条命令，A1）；Cubase Folder Track＋Track Versions（G1）；Bitwig group track（B5 之 bounce 条文提到 group track） | **✓ 有**（folder 轨） | `types/arrangementV2.ts:30`（`"folder"` 是 kind）、`:53`（`parentId`）、`TrackListV2.tsx:124`（按深度缩进）、`setCollapsedCommand`（折叠，`arrangementHistory.ts:250`）、`ArrangementViewV2.tsx:1177-1182`（`depthOf`）；`docs/ARRANGEMENT_V2.md:57` 记 folder"不发声、只收纳、可整体静音/独奏" | 少一次"十来条轨滚不到底" |
| bounce in place | Live Bounce to Audio（A1）；Bitwig In-Place＋Pre/Post-Fader 三档（B1）；Logic Bounce in Place（C1）；Cubase 渲染（G1 条目级） | **✗ 没有** | 编排命令表里没有 bounce/consolidate（**数法见 §3.6**：`arrangementHistory.ts` 有 **17 个面向用户的命令工厂**、对应 **17 个 `action` 标签**，`:206-356`）；工具栏只有**文件级**导出（`ArrangementFileEntriesV2.tsx:66-129`：MIDI/ALS/GROOVE/WAV/MP3/stems） | 少一次"想把一段定死再继续改" |

### 3.2 键盘与鼠标工效

| 能力 | 业界事实 | 本仓 | 本仓依据 | 创作者会因此少做什么 |
|---|---|---|---|---|
| 单键工具切换 | Bitwig `[1]`/`[2]`（B1）；Cubase 1–9/0、F9/F10（G2）；FL 9 个工具单键（E2）；Fender `[1]–[6]`（F2） | **✗ 没有** | 无工具状态；`ShortcutsModal.tsx:88-92` 编排段只有 3 行（撤销/重做/重做别名） | ——（前提是真有工具可切） |
| 修饰键语义 | 见 3.1 第 4 行 | **✗ 没有** | 同上 | 同 3.1 |
| 快捷键密度 | FL 手册有整页 Playlist 快捷键表（E2）；Cubase 有 Key Commands 对话框与 Default Key Commands 类目（G2）；REAPER 有 Action List（H2） | **⚠️ 半有** | 全仓 27 条：`ShortcutsModal.tsx:45-59`（导航 13）＋`:61-73`（Studio 11）＋`:88-92`（编排 3）；编排实际监听器只有 Ctrl/Cmd+Z、Shift+Z、Y（`ArrangementViewV2.tsx:407-444`），**其余 24 条在 `/new` 上不承诺**（`ShortcutsModal.tsx:30` 的 `scope` 机制） | 少一次"键盘在这儿失灵"的不信任 |
| 快捷键可自定义 | Cubase 键命令对话框（G2）；Bitwig 明说"自定义后手册可能失效"（B2） | **✗ 没有** | `ShortcutsModal.tsx` 是静态数组，无需用户映射层 | 少一次"换台机器肌肉记忆作废" |
| 右键／上下文菜单 | Cubase 右键工具箱（G2）；FL 右键=删除工具、双击右键=静音工具（E2）；Fender 右键列工具（F2）；Live 断点右键 Edit Value（A2） | **✗ 没有** | `grep onContextMenu` 在 `src/components/arrangement/*.tsx` **零命中** | 少一次"跑到顶部工具栏找那个动作" |
| 拖放的落点语义 | Live 片段拖到轨道/时间线有明确吸附对象（A1）；Bitwig 拖放"落到什么上吸什么"（B1） | **⚠️ 半有**（钢琴卷有；**Studio 编辑器有；只有新编辑器没有**） | 钢琴卷：`PianoRollV2.tsx:161-200`（指针落到格子即移动）＋`:213-256`（4 px 右侧手柄改时值）。**Studio 编辑器（`ArrangementPanel`，`/studio` 渲染，`StudioView.tsx:1283`）已有按小节量化的 move／resize 拖动**：`beginDrag(…,"move")` `ArrangementPanel.tsx:374`／`(…,"resize")` `:432`＋`continueDrag` `:163` 里 `const barsMoved = Math.round((event.clientX - drag.startX) / ARRANGEMENT_BAR_WIDTH)` `:166`。**新编辑器（`ArrangementLaneV2`，`/new` 渲染，`ArrangementViewV2.tsx:65,1016`）的 region 只有 `onClick`**（`:52`），且两处都没有 HTML 拖放（无 `onDrop`/`draggable`） | 少一次"把音符拖到看不见的地方就丢" |
| 落点不许骗人（键盘可达） | 无明显条文 | **✓ 有** | `LoopBraceV2.tsx:48-64`（循环括号可键盘移动/改长，满足 WCAG 2.5.7）、`ArrangementRulerV2.tsx`（标尺按栏可点）、`ArrangementViewV2.tsx:377`（undo 结果用 announcer 播报） | 少一次"只能用鼠标" |

### 3.3 撤销与历史

| 能力 | 业界事实 | 本仓 | 本仓依据 | 创作者会因此少做什么 |
|---|---|---|---|---|
| 撤销深度 | Logic 可设**最多 200 步**（C3）；FL `Maximum undo levels` 可设（E3）；REAPER 按**内存上限**并可随工程保存、可多分支（H3）；Cubase 有"最大撤销步数"设置页（G3） | **⚠️ 半有**（无上限，但也不可设） | `arrangementHistory.ts:80` 起是 `past`/`future` 两个数组，**没有上限常量、没有裁剪**（检索 `MAX`/`slice(-`/`limit` 零命中）；`useArrangementHistory.ts`（135 行）只管 React 绑定 | 大工程的撤销不会因为"超了 200 步"而失忆——但也无法用"限制深度"换内存 |
| 是否覆盖混音器与插件参数 | Logic 明确覆盖 Mixer 与（部分）插件，并在 Undo History 里可见（C3）；Cubase 有**独立的 MixConsole history**，Alt/Opt+Z（G3）；FL 的"旋钮动作"**默认不进**历史，要显式开（E3） | **✗ 没有**（本仓编排没有插件参数模型） | 命令表只有轨道/音符/take/速度/小节（`arrangementHistory.ts:206-356`，数法见 §3.6）；`types/arrangementV2.ts` 无插件图（`logicToArrangement.ts:27-28` 也自述"no plugin graph"） | ——（等有插件参数，这条才会变成真实缺口） |
| 历史列表可跳转 | Live Undo History 点条目/上下键+Enter 跳到某点（A3）；Logic Undo History 窗口列表（C3）；Cubase Edit History 对话框（列表＋Time/State/Details 列）（G3）；FL Project Browser → History，左键跳到撤销点（E3）；REAPER Undo History Window（H3） | **⚠️ 半有**（有"下一步是什么"的播报，无列表） | `ArrangementViewV2.tsx:698`（`data-undo-action`）＋`:710`（`data-redo-action`）把**下一个**动作名写进 DOM；`undoAction` 来自 `useArrangementHistory`；**没有历史面板**、没有跳转 | 少一次"往回撤十步看看，再想怎么回到刚才" |
| A/B 快照 | Live 每个内置装置有 A/B 两套参数（A3）；Cubase MixConsole 快照**上限 10 个**且随工程保存、召回本身也可撤销（G3） | **✗ 没有** | 全仓无 snapshot 概念 | 少一次"混音改坏了只能靠撤销一步步退" |
| 撤销的边界要说清 | Live 明说"新建/打开 Set 不可撤销"（A3） | **✓ 有** | `ArrangementViewV2.tsx:178-182` 明写两个例外（选板的 Create 与文件导入是"第一个动作"，引 Live 原句），并说明它们仍走 `setArrangement` | 少一次"以为能撤，其实撤不回" |

### 3.4 ⭐ 从零到有声（核心一条）

**这条是本次调研里最需要诚实的**：**没有任何一家官方手册给出"新建工程 → 听到第一个音"的逐步计数**。因此下表分三列：手册明文给出的动作、本报告按条文**推算**的步数（标注推算）、以及**未找到**的部分。

| DAW | 手册明文（逐字，见 §② 对应条） | 推算步数 | 未找到的部分 |
|---|---|---|---|
| **REAPER 7.81** | `"From REAPER's main menu, choose Insert, Virtual Instrument on new track. Select your instrument and click OK. The track will be inserted armed for recording, with input monitoring on."`（H4，手册编号步骤 1） | **5 步**：启动 → Insert 菜单 → Virtual Instrument on new track → 选乐器 → OK（此后按键即响） | 手册未把"启动到空工程"计入 |
| **FL Studio** | `"Startup project - Choose from Empty project, Default template or Last used project."`（E4） | **1–2 步**（若默认模板已含乐器通道：启动 → 空格） | **默认模板的内容未找到** → 这个"若"成立与否无法核实 |
| **Ableton Live 12** | `"Use the File menu's New Live Set command to create new Live Sets"`＋默认模板可预配置（A4） | **2 步**（预配置模板时）／**4 步**（空工程：建 MIDI 轨→拖乐器→空格） | 手册无逐步计数；默认 Set 里有什么**未找到** |
| **Logic Pro** | `"To create a new, empty project: Click New Project."`＋New Tracks 对话框建轨（C4） | **5 步**（空工程）／更短（模板） | 手册无逐步计数 |
| **GarageBand 10.4** | `"Choose Track > New Track (or press Option-Command-N)."`＋三选一的轨类型（D1） | **5 步**（New Project → New Track → 选类型 → Create → 空格） | 手册无逐步计数；"空工程是否自带轨"未找到 |
| **Cubase Pro 14** | `"Click Add Track in the global track control area of the track list, and click Instrument."`（G4） | **6 步** | **New Project 对话框未取证** → 该步未找到 |
| **Bitwig 5.3** | `"The Add menu is always present. It allows you to create new tracks and scenes."`（B4） | **未找到** | 建工程与建轨的完整动作链未找到 |
| **Fender Studio Pro** | —— | **未找到** | 本次只取到 4 个正文页（§⑤） |

**创作者角度的结论**：**"从零到有声"的步数差异，几乎全部来自"默认模板里有没有乐器"**——REAPER 的 5 步里有 3 步是"选乐器"，FL 的 1–2 步则把这件事预先放进模板。**本仓今天是几？**

- 本仓路径（可核）：`/new` → 若没有已存工程，先看到 **New Project 选板**（`ArrangementViewV2.tsx:167`、`:501-535`；`NewProjectPanelV2.tsx:80-168`：模板卡＋Details 折叠＋Create）→ 进入编排 → **空格**（播放）或**点轨道头乐器 chip** 打开乐器库（`TrackHeaderV2`＋`InstrumentLibraryV2.tsx:85-163`）→ 弹键盘（`ArrangementKeyboardV2`）。
- **三态**：**⚠️ 半有**。理由两条：(1) 选板有模板卡与"Blank 也带一条默认轨"（`NewProjectPanelV2.tsx:8` 注释），这一步比 Live/Logic 的空工程路径短；(2) 但 **Details 里的 Tempo 与 Key 是 `defaultValue`，没有 `onChange`**（`NewProjectPanelV2.tsx:134、137`）——**填了不生效**；而且**没有"模板自带乐器"的证据**（`createArrangementFromTemplate` 的默认轨是否带 sampler/instrument 需另核，见 §⑤）。
- *创作者角度：如果 Create 之后第一次按空格能有声，本仓就与 FL 同级（1–2 步）；今天这条链上最可能让人白按一次的是"填了速度/调性却没生效"。*

### 3.5 改一个已有想法的成本

| 改动 | 业界（可核） | 本仓 | 依据 | 创作者少做什么 |
|---|---|---|---|---|
| 改速度 | Live：Tempo 在 Control Bar，但素材是否跟随由 Leader/Follower 决定（A5）；Fender：Timestretch 非破坏可撤，Follow/Don't Follow 可随时切（F1）；Cubase：Tempo Track（G5 条目级）；GarageBand：`Set the tempo` 话题（D5） | **✓ 有（但只是数值）** | `ArrangementViewV2.tsx:722-734`（tempo number input，`commit(setArrangementTempoCommand(...))`，20–300） | 少一次"改完 BPM 发现某条素材对不上却不知道该怪谁" |
| 改调性 | Logic：工程级 key，Loop 浏览器自动跟调（C5） | **⚠️ 半有（只有新建面板的输入框）** | `NewProjectPanelV2.tsx:137`：`Key` 是 `defaultValue="C Major"`，**不受控、不写模型**；编排模型里**没有 key/scale 字段**（`types/arrangementV2.ts` 无） | 少一次"填了 C 大调，之后找不到它在哪" |
| 换乐器 | Live：装置 A/B＋hot-swap（A3、A1）；本仓设计文档记 FL 的 Track Mode 绑定乐器（§2） | **✓ 有** | 轨道头乐器 chip（`TrackHeaderV2`）、`InstrumentLibraryV2.tsx:85-163`（搜索框 `:89`、分类 `:97`、子类 `:126`、选项 `:163`）、`setTrackSampleCommand`（`arrangementHistory.ts:262`）、`InstrumentBrowserV2.tsx` | 少一次"换乐器要重建轨道" |
| 换片段 | Fender：Select Layer Content / Select Take 两条独立入口（F1）；Live：take lanes 拼 comp（A1） | **⚠️ 半有** | take 可换：`TakeSelectorV2.tsx:40`、`selectTrackTakeCommand`（`arrangementHistory.ts:343`）。**片段操作按编辑器分**：**新编辑器**（`ArrangementLaneV2`，`/new`）的 region **只有 `onClick`**（`:52`）⇒ 不可拖、不可切、不可复制；**Studio 编辑器**（`ArrangementPanel`，`/studio`）**已有按小节量化的 move／resize 拖动**（`:374`／`:432`／`continueDrag` `:163`，量化在 `:166`）。两处命令表都没有 split/duplicate | 少一次"想把这 4 小节挪到后面，只能重写" |
| 试不同的 take | Bitwig comp regions（B1）；Fender 悬停 Range 刷（F1）；GarageBand 从 take folder 下拉选（D1） | **⚠️ 半有** | 有 take 选择（`TakeSelectorV2`）、有录制入栈（`ArrangementViewV2.tsx:637` `commit(addTakeCommand(...))`）；**没有跨 take 逐段拼合** | 少一次"两个 take 各有一半好，只能二选一" |

---

### 3.6 "命令表有多少条"的数法（读者会去核的那个数）

本报告 **v1 稿写"21 个命令"是错的**，按下面三种数法都数不出 21。正确的三种数法与结果：

| 数法（命令） | 结果 |
|---|---|
| `grep -c "^export function .*Command" src/data/arrangementHistory.ts` | **20**，其中 **3 个是基础设施**：`recordCommand`（把命令压入历史栈，:117）、`command`（通用构造器，:169）、`setterCommand`（"一个纯 setter + 前后值"的通用形状，:180） |
| **面向用户的命令工厂** = 20 − 3 | **17**：`addTrack`／`removeTrack`／`setTrackFlag`／`setCollapsed`／`setTrackGain`／`setTrackPan`／`setTrackSample`／`setArrangementTempo`／`setArrangementBars`／`changeTrackKind`／`toggleStep`／`addTrackNote`／`removeTrackNote`／`moveTrackNote`／`setTrackNoteLength`／`selectTrackTake`／`addTake`（:206–356） |
| **`action` 标签**（`setterCommand("…")` 的 8 个 + 对象字面量 `action: "…"` 的 9 个，去重） | **17**：`bars`／`collapse`／`gain`／`instrument`／`pan`／`take`／`tempo`／`track-flag`／`add-track`／`remove-track`／`track-kind`／`step`／`add-note`／`remove-note`／`move-note`／`note-length`／`record` |

**为什么容易数歪**：这个文件不用 `kind: "…"` 那种写法，而是"`action` 标签 + `redo`/`undo` 函数对"；所以

- 数 `action:` 的**行**会得到 **16**（其中 7 行是 `command.action` 之类的转引，不是命令定义）；
- 数 `action: "…"` 的**双引号字面量**会得到 **9**（漏掉 8 个经 `setterCommand` 传入的标签）；
- 数 `undo:` 会得到 **12**（有些命令显式写 `redo`/`undo`，有些由 `setterCommand` 生成，**不是**命令条数）。

**本报告此后一律用"17 个面向用户的命令工厂"这个数**，并在 §3.1／§3.3 两处注明了数法。结论不受影响：这 17 个里没有 split／duplicate／move-region／fade／clip-gain／automation／bounce，所以那几行仍然是 **✗**。⚠️ **但"没有命令"不等于"没有交互"**：`ArrangementPanel`（Studio 编辑器）的 move／resize 拖动**不经这套命令表**（它走 `sections` 与 `onChange({gesture, continuous})`），所以"新编辑器缺拖动"是一条**独立的、范围更窄**的差距——见 §3.2 与 §④ 第 3 条。

---

## ④ 优先级表（按"创作者收益 × 实现成本"排序，前 8）

排序口径：**收益 = 上面表格里"创作者会因此少做什么"的频次**（每次编辑都会遇到 > 偶尔遇到）；**成本 = 本仓已有多少可复用**（历史栈、纯编辑函数、DOM 结构都算可复用）。每条一句话说清"少做什么"。

| # | 优先级 | 为什么排这里（依据） | 一句话：创作者少做什么 | 成本 |
|---|---|---|---|---|
| 1 | **先让吸附有东西可吸：把拖动移植过来，再让吸附生效** | ⚠️ **顺序依赖**：今天唯一"可拖"的是钢琴卷；新编辑器的 region 连 `onClick` 之外的交互都没有（`ArrangementLaneV2.tsx:52`）⇒ **先加吸附会出现"加了吸附却没有东西可吸"**。吸附值已可见却无一处消费（`ArrangementViewV2.tsx:80,930,755-774`）；业界是四家共有事实（A1/B1/E1/G1） | 少一次"画完再手动对齐"，也少一次"我想临时不吸，只能先关掉再打开" | **S–M**（先移植 Studio 编辑器的拖动，再把量化单位接到 `snap`／旁路读 `event.altKey`） |
| 2 | **撤销面板：列出历史并可跳转** | 历史栈与"下一个动作名"已经在（`arrangementHistory.ts`＋`ArrangementViewV2.tsx:698,710`），缺的只是列表 UI；业界五家都有（A3/C3/E3/G3/H3） | 少一次"撤过头了只能靠记忆重做" | **S–M**（`past` 数组已带 `action` 名，渲染列表＋点击裁栈） |
| 3 | **把 Studio 编辑器的 region 拖动移植到新编辑器；再补切／复制** | **范围要说准**：`ArrangementPanel`（Studio）**已有按小节量化的 move／resize 拖动**（`:374`／`:432`／`continueDrag` `:163`，量化 `:166`），**新编辑器**（`ArrangementLaneV2`）的 region 只有 `onClick`（`:52`）；split/duplicate 两处都没有，且这是"编排"最低门槛（`docs/ARRANGEMENT_UI_DESIGN.md` §8 第 10 项自列为底线） | 少一次"想把一段挪走/复制，只能改模型之外的东西" | **S–M**（**不是从零做拖动**：本仓已有这条交互可参照、可复用；新增的只是切/复制两个纯命令与把拖动接到 `ArrangementLaneV2`） |
| 4 | **自动化车道（先做"一条轨一个参数"的连续包络）** | `docs/V4_REVIEW_PLAN.md:492` 自述为真缺口；五家有车道/曲线（A1/G1/E1/B5）；本仓已有"每轨扁平事件列表"的形状可借用 `notesByTrack` | 少一次"渐强只能靠分段或不做" | **M–L**（新 event 类型＋车道渲染＋编译期展开；`types/arrangementV2.ts:148` 的 `notesByTrack` 是形状先例） |
| 5 | **take lanes 与逐段 comping（把 TakeSelector 升级成通道）** | take 数据模型已经在（`types/arrangementV2.ts:88,100`、`addTakeCommand`），只缺 lane 视图与"划一段换一条"；四家有（A1/B1/G1/H1/F1） | 少一次"为了第二小节那个音重录整条" | **M–L**（复用 `takeRegions` 的分裂规则；`ArrangementLaneV2.tsx` 之上加行） |
| 6 | **片段增益与淡入淡出（含交叉淡变）** | 完全空白（3.1 表）；两家明确（A1/G1）且成本低于自动化（不需要时间轴事件，只需片段头尾两个数） | 少一次"为了一个渐弱去开混音器画自动化" | **M**（片段级 `gainDb`＋`fadeIn/Out` 三字段＋两个手柄；播放路径已有轨道增益可参照 `arrangementCompile.ts:211`） |
| 7 | **撤销深度设置 + "历史随工程保存"** | 现在无上限也无设置（`arrangementHistory.ts:80` 起无裁剪）；REAPER 的"历史随工程保存/多分支"是差异点（H3） | 少一次"关掉工程再打开，昨天试过的那条路就没了" | **S–M**（AUTOSAVE 已经在 `arrangementStore.ts:37`，历史序列化可挂同一条写路径） |
| 8 | **新建面板的 Tempo／Key 真正生效（或先删掉这两个输入框）** | `NewProjectPanelV2.tsx:134、137` 是 `defaultValue`，填了不起作用；这正是 repo 自己反复记的 U7"控件不许骗人" | 少一次"填了速度/调性，之后发现它从来没被保存" | **S**（接 `setArrangementTempoCommand`；Key 需要模型先有字段——若无字段，**先删输入框**比留着更诚实） |

**明确不进前 8（成本或前提不成立）**：warp/time-stretch、音频量化（本仓没有音频轨，`types/arrangementV2.ts:30`；先有音频轨它们才成为需求）；bounce in place（需要离线渲染路径）；单键工具切换与模态工具箱（本仓 `docs/ARRANGEMENT_UI_DESIGN.md` §5 已作为**有意不抄**的有记录决定，且与触摸目标冲突——**要改先改那份文档的理由，而不是先写代码**）。

---

## ⑤ 未找到清单（不假装核实了）

**产品侧**
1. **Reason／Luna／Digital Performer**：本次未做（§1.4）。
2. **Bitwig 的 Undo History／深度／是否覆盖混音器与插件参数**：官方 v5.3 用户指南 PDF（27 481 行）中 `undo` 仅 1 处、`Undo`/`History`/`Ctrl+Z` 各 0 处。**只能记"官方指南未写"**。
3. **Bitwig "从零到有声"**：完整动作链未找到（只有 Add 菜单常驻一条）。
4. **Ableton Live 的 New Set 里默认有什么**、以及 `Z`/`X` 缩放到选区：本次未在手册正文取证（本仓 `docs/ARRANGEMENT_UI_DESIGN.md` §3 曾引，本次未复核）。
5. **FL Studio 默认模板的内容**：手册未列 → 因此"1–2 步"的前提无法核实。
6. **Cubase 的 New Project 对话框**、以及"改速度后音频如何跟随"：未取证（Tempo Track 只有条目级证据）。
7. **Logic 的 Flex 正文、project key 正文、take folder 与 Bounce in Place 的完整句**：本次只取到句首（PDF 抽取里被目录行截断）；按"未找到完整原句"处理。
8. **GarageBand 的撤销深度／历史列表／单键工具**：官方指南未写。
9. **Fender Studio Pro（Studio One）**：手册是 JS 应用，本次只取到 **4 个正文页**（`Comping`、`Arrange_View_Mouse_Tools`、`Timestretching`、`Patterns`）＋其 TOC 之外的页面需搜索引擎索引才能发现 → **Undo／History／Snap／从零到有声全部未找到**。
10. **REAPER "没有模态工具面板"的直接条文**：正文检索无命中 → 未找到（只保留鼠标修饰键与 Action List 两条可核事实）。
11. **REAPER tempo envelope 的逐句条文**：未找到。
12. **Cubase "Render in Place"**：14.0 手册的 TOC 中未见该标题（有 `Rendering Tracks`／`Rendering Audio and MIDI`／`Render Tracks Dialog`）→ 版本差异，未逐条核对。

**本仓侧（写报告时明确"需要另核"的）**
13. `createArrangementFromTemplate` 的默认轨是否真的带乐器（决定 §3.4 的"Create 后按空格是否立刻有声"）——**本次未读 `src/data/arrangementEdits.ts` 的模板函数体**，故 §3.4 只写到"⚠️ 半有"而没有断言步数。
14. folder 轨的 mute/solo **级联**是否在编译/播放路径实现（`docs/ARRANGEMENT_V2.md:57` 声称可整体静音/独奏；`arrangementCompile.ts:211` 只看到单轨 mute/solo 传递）——**未核实**。
15. 本仓"**区域条是拖动/选择/切分的把手**"这句设计意图（`ArrangementLaneV2.tsx:1-16`、`docs/ARRANGEMENT_UI_DESIGN.md` §4）在代码里目前**只有"选择"**一半；"拖动/切分"未见实现——按 **✗** 记入 §3.1，并在此标明它与设计文档的差别，供后续对齐。

---

---

## 附：本报告引用的本仓文件清单（便于复核）

`src/components/arrangement/ArrangementViewV2.tsx`（65、167、178-182、184、200、202-203、279-283、377、407-444、449、501-535、518、628-638、637、694-719、722-747、755-774、789-811、850-859、878-891、913、920-948、930、1016、1029-1036、1053、1070-1073、1075-1091、1101、1177-1182）、`ArrangementLaneV2.tsx`（1-16、52、84、107）、`ArrangementPanel.tsx`（163、166、200、374、432）、`PianoRollV2.tsx`（60、144-256）、`ArrangementRulerV2.tsx`（45、71、109）、`LoopBraceV2.tsx`（38、48-64、66-70、97-142）、`TakeSelectorV2.tsx`（23、40）、`RecordButtonV2.tsx`（33）、`NewProjectPanelV2.tsx`（8、30、55、72、80-168、110-131、133-146、171）、`TrackHeaderV2.tsx`（65、102、108、121、135、142、156、177）、`TrackListV2.tsx`（99、124、172-191）、`ArrangementKeyboardV2.tsx`（13、32-93）、`ScoreV2.tsx`、`InstrumentLibraryV2.tsx`（40、85-163）、`InstrumentBrowserV2.tsx`、`ArrangementFileEntriesV2.tsx`（66-129、147-159）、`ImportInstrumentMappingV2.tsx`、`percussionStaff.ts`、`kindLabels.ts`、`TrackRows.tsx`；`src/views/StudioView.tsx`（1283）；`src/components/ShortcutsModal.tsx`（30、45-59、61-73、88-92）；`src/types/arrangementV2.ts`（30、53、59-66、88、100、148）；`src/data/arrangementHistory.ts`（80、169-356）；`src/data/arrangementEdits.ts`（238-280、426、548）；`src/data/arrangementCompile.ts`（211）；`src/data/logicToArrangement.ts`（27-28）；`src/features/arrangement/useArrangementHistory.ts`；`src/features/arrangement/arrangementStore.ts`（37）；`src/test/newProjectPanelControls.test.ts`（45、49、54、60）；`docs/ARRANGEMENT_UI_DESIGN.md`（§3、§4、§5、§7、§8、§9）；`docs/ARRANGEMENT_V2.md`（57）；`docs/V4_REVIEW_PLAN.md`（43、492、505、971）；`docs/PRO_EDITOR_PLAN.md`。

---

## ⑥ Postscript（两条处置／更正记录）

写这一节的理由：**读者照着一句已经过时的判断去查，会查到一个不存在的问题**。下面两条都写明"当时怎么写、现在是什么、依据在哪"。

### 6.1 新项目面板的两个控件（`20664ac`，删掉而非接上）

§3.5「改调性」行与 §④ 第 8 条报的那两个控件（Tempo／Key 的 `defaultValue` 无 `onChange`）已经处理 —— **是删掉，不是接上**（短 sha `20664ac`「arrangement: the new-project panel stops showing two controls that reported nothing」）。

**为什么不能接上（两条各自独立，都要成立）**
1. **面板没有把速度交给模型的通道**：它的创建回调契约是 `(templateId, blankKind, name)`——`NewProjectPanelV2.tsx:30`（调用点 `:171`，宿主接收点 `ArrangementViewV2.tsx:518`）；而**编排的速度已经在它被编辑的地方设置**：`ArrangementViewV2.tsx:722-734` 的速度输入框（`commit(setArrangementTempoCommand(...))`）。再接一个就是**同一间屋子的第二扇死门**。
2. **模型里没有工程级调性**：`arrangementV2.ts:59-66` 的 `key` 是**录乐器表的字典键**（"the **key of the recorded-instrument table** (`src/data/sampledInstruments.ts`)"），不是乐理调号 ⇒ Key 字段要存在，得**先发明一个概念来存它**。

**现在有判据拦着（可核）**：`src/test/newProjectPanelControls.test.ts`（78 行）4 条 —— `:45` 至少得有一个控件（避免"没有东西可查"也算过）；`:49` **不许** `defaultValue`／`defaultChecked`（"撒谎控件的机制"）；`:54` 每个 `input`／`select` **必须**带 `onChange`；`:60` **删掉的理由要留在原地**（不许被无声加回）。⇒ 按判据条文，插回一个带 `defaultValue` 且无 `onChange` 的控件会让 **第 2、3 条同时红**（`:50` 与 `:56`）；处置提交自己也记了这是"putting one in and taking it out again"实跑过的。**本报告 2026-10-03 实跑**：`npx vitest run src/test/newProjectPanelControls.test.ts` → `4 passed (4)`（22 ms）。

### 6.2 "新编辑器没有片段拖动"——范围与成本的更正

本报告 v2 稿把"片段不可拖"说成全仓范围，**太强**。按"哪一份实现是现在渲染的那份"复核后更正如下（三处都可核）：

| 实现 | 由谁渲染 | region 拖动 | 依据 |
|---|---|---|---|
| **新编辑器** `ArrangementLaneV2` | `/new`（`ArrangementViewV2.tsx:65` import、`:1016` 使用） | **只有 `onClick={onSelect}`** ⇒ 没有拖动 | `ArrangementLaneV2.tsx:52` |
| **Studio 编辑器** `ArrangementPanel` | `/studio`（`StudioView.tsx:1283`） | **已有按小节量化的 move／resize 拖动** | `beginDrag(…,"move")` `:374`／`(…,"resize")` `:432`＋`continueDrag` `:163`，量化式 `const barsMoved = Math.round((event.clientX - drag.startX) / ARRANGEMENT_BAR_WIDTH)` `:166` |
| **循环括号** `LoopBraceV2` | 新编辑器标尺内 | **本来就按小节量化**（注释：`"Bars, rounded: the model is in bars, and a loop at bar 2.5 is not something the ruler can show."`） | `LoopBraceV2.tsx:66-70`（`Math.round((event.clientX - current.x) / pixelsPerBar)`） |

⇒ **因此"编排层什么都没有"不成立**：循环括号会吸附、Studio 编辑器会吸附，**只有新编辑器不会**。相应地：

- **§3.2「拖放的落点语义」与 §3.5「换片段」已改成按编辑器分区的说法**（并补了三处 `文件:行`）。
- **§④ 第 3 条的成本从 M 改为 S–M**：**不是"从零做拖动"，而是"把 Studio 编辑器的拖动移植到新编辑器"**——本仓已有这条交互，可参照、可复用；新增的只是切／复制两个纯命令，以及把拖动接到 `ArrangementLaneV2`。
- **§④ 第 1 条（吸附）补了顺序依赖**：`snap` 今天**只是传给刻度尺的标签**（`ArrangementViewV2.tsx:930` `snapLabel={snapOn ? snap : undefined}`）⇒ 顺序应当是**先把拖动移植过来，再让吸附生效**；否则会出现"加了吸附却没有东西可吸"。并与 `20664ac` 同类：**要么让它真正决定量化单位，要么删掉它**（本仓原则：控件不许骗人）。

### 6.3 对本报告两张表的现状更正

- §3.5「改调性」：当时记 **⚠️ 半有**（只有面板上一个不受控输入框）。**现状应按 ✗ 没有读**——面板上已无 Key 字段，模型里也没有工程级调性。**这比原来好，但仍是缺口**（原行的"创作者少做什么"不变）。
- §3.5「改速度」：**仍是 ✓ 有**，速度输入框在编排工具栏上（`ArrangementViewV2.tsx:722-734`），与这次删除无关。
- §4 第 8 条（"接上或删掉"）：**已按"删掉"结案**，不再需要排期；将来模型若有了工程级调性，字段应当**带着模型字段和 `onChange` 一起回来**，而不是先回来。
- 其余 6 条优先级与 §③ 的全部 ✗／⚠️ 结论**不受影响**（第 3 条的成本估计已按 6.2 下调）。
