# 对 `z2.md` 的逐节裁定（**已裁定完毕，无未决项**）

`z2.md`（深度评估与重构指南，1168 行）是业主交给本项目的一份外部评估。这份文件是它的**逐节裁定**：每一节要么有**已实现的判据与验证证据**，要么有一条**明确的"不做 / 分期"决定及其理由**。业主的完成判据是"没有任何一行留在未决状态"，这份文件现在满足它：**全文没有一行是"未裁定"。**

**状态标记**（四选一，每行必有其一）：

| 标记 | 含义 |
| --- | --- |
| ✅ | 已实现，且给出判据与验证证据（文件行号 / 测试文件 / 实测数字 / 闸门结果） |
| 🟡 | 部分实现：**缺口已指名**，并已裁定——缺的那一半、以及补它的第一步或"不做"的理由 |
| ⛔ | **明确不做，或明确推后**，理由写在格子里 |
| 🗺 | **分期**：已写明一个足够小、现在就能开始的第一步 |

**这份文件为什么存在**：那份评估里混着三类东西——**已经做到的**、**它以为没做到但其实做到了的**、以及**真的缺的**。不区分这三类，就会去做已经存在的工作，也会把"缺的"当成"坏了的"。裁定文件还要区分第四类：**不该做的，且已有理由**。

---

## 每行是怎么定的（给下一个读者的说明）

**方法**：每一行都**先在仓库里查证，再判**。查到的东西只有四种形态，格子必须落到其中一种：

1. **已经建好** → 给文件:行、测试文件、闸门输出或实测数字；
2. **建了一半** → 指名缺的是哪一半（"有模型字段没有工具"、"有读侧没有写侧"、"有 UI 没有 MCP"是这个仓库反复出现的形态，这一轮又抓到三处：编排层没有 opId、`passBars` 报的是每段 pass 数而不是每 pass 小节数、音频轨能播但不能离线渲染）；
3. **真的没有** → 一条"不做"的决定加理由，或一条分期决定加第一步；
4. **评估说错了** → 指出来，并给出与它相反的证据。这一轮又纠正了四处：Mixer 视图、轨道颜色/图标、Web MIDI 输入、PDC（都已被评估列为缺失）。

**这一轮实际跑过、并写进证据的命令**：

| 命令 | 结果 |
| --- | --- |
| `npm run check:mcp` | `surface : 85 tools, 7 resources, 4 prompts`；`🧩 MCP gate: 95 checks passed, 0 failed` |
| `node scripts/check_docs.mjs` | `✅ 4 doc baseline claim(s) hold.` |
| `npx vitest run`（19 个测试文件，见文末清单） | `19 passed` 文件 / `108 passed` 测试 |
| `node scripts/mcp_call.mjs --script`（一次无浏览器的完整作曲回路：create → export → 读 → 三个写 op → validate → statistics → suggest → melody → prosody） | 三次：**9360 / 8343 / 8707 ms** |
| `node scripts/mcp_call.mjs --script`（渲染 SLO 复测） | 一次冷启动 `render_preview_clip` = **24.98 s**（17.18 s 音频，8 kHz 单声道）；随后两次因本机负载（load average 21 / 8 核）被 Playwright `page.goto: Timeout 30000ms` 挡下 |

**一句诚实的话**：最后一行说明**渲染类数字我没能在本机复测成功**，那一行的证据因此是 `docs/MCP.md` 里由 CI 产出的记录值，而不是我这一轮测出来的；我另外记下了本机在负载下冷启动 24.98 s 这个反例，它说明 SLO 对宿主负载敏感。

---

## §1 项目概述与核心定位

| 小节 | 它的要求 | 现状 | 证据 / 决定 |
| --- | --- | --- | --- |
| §1.2 两个关键判断 + 目标分层 | "核心资产是曲风知识 + 生成逻辑 + 确定性渲染"、"引擎下沉是共同前提" | 🟡 | 两个判断**都是定位陈述**，不是可建的东西；其中唯一可检验的一条——"MCP 必须复用同一个 headless core，不能人机各写一遍"——就是 §6 Phase 0 的第一项。**决定**：不把分层图当需求做；它约束的是 Phase 0 的做法（见 Phase 0 行），MCP 侧确实复用了同一套 `renderPatternOffline` / `flattenSong` / `applyPatternOps`，没有第二个实现 |
| §1.3 核心能力矩阵 | 一张自评表 | ✅ | 表里"MCP 以写为主、读与分析缺失""多轨混音/路由 ★☆☆☆☆"两格**已经过时**：读工具 20+ 个（`mcp/registry.ts` 的 `TOOLS`），buses/sends/insert 都在（`src/test/trackBuses.test.ts`、`src/test/trackSends.test.ts`）。**决定**：以仓库为准，不以自评表为准 |
| §1.4 v2.34.3 关键更新 | 版本说明 | ⛔ | 纯版本叙述，没有可建的条目。**决定**：不做工作项 |
| §1.5 竞争坐标 | 战略定位 | ⛔ | 同上。**决定**：不做工作项 |

---

## §2 对标 Logic Pro（多轨编辑）

| 小节 | 它的要求 | 现状 | 证据 / 决定 |
| --- | --- | --- | --- |
| §2.1 轨道架构 | Track Factory：动态增删/重排、多种轨道类型、层级、颜色图标 | 🟡 | **动态轨道已建**：`TrackKindV2 = "drumkit"\|"instrument"\|"sampler"\|"fx"\|"folder"`（`src/types/arrangementV2.ts:14`），`add_arrangement_track` / `remove_arrangement_track` / `rename…` / `set…kind` / `set…parent`（folder 层级）全套工具，8 轨固定只适用于 v1 song 的 clip 槽，不适用于 arrangement。**评估错了两格**：轨道颜色与图标**都有**（`src/components/console/trackVisuals.ts:11-23` 的每角色色板、`src/components/arrangement/TrackHeaderV2.tsx:55,103` 的 kind 图标）。`audio` **不是** `TrackKindV2`，它是 pattern 层第九种 lane（`src/test/audioKindSchema.test.ts`：`validateGenre` 接受 `audio` lane 且不接受缺角色）与 take 的 `source: "audio"\|"midi"`（`arrangementV2.ts:66`）。**决定**：不做 `Bus`/`VCA` 轨道种类——混音层已经有 group bus 与 send（见 §2.5），再引进一种轨道种类会给出第二条说法；多重性那半已按业主决定 1A 用可选 `laneId` 落地（`add_lane` op，`src/test/addLaneOp.test.ts`） |
| §2.2 时间线与片段 | 线性时间线、Region（裁剪/分离/循环/交叉淡化/别名） | 🟡 | **"Region"在这个模型里就是 SongSection**：`bars` 是**重复次数**、`slot` 是片段、`slots` 是逐轨片段选择、`mute`、`velocityScale`、`label`、`overrides`（`src/types/song.ts:104-127`）。**线性时间线已建**：`src/components/arrangement/` 有 `ArrangementViewV2` / `ArrangementPanel` / `ArrangementRulerV2` / `TrackRows`，命令层是纯函数（`src/features/arrangement/songEdit.ts`），段落边界**交叉淡化**也存在——渲染时在边界处做三角淡化，不改数据（`src/test/boundaryFade.test.ts`）。**缺的一半**：没有 `offset`（左裁剪）、没有独立的 `loopCount`（`bars` 兼任）、没有片段级 gain、没有别名。**决定**：⛔ 不做带裁剪/分离的 Region —— arrangement 的音符本来就以 `startBeats` 自由定位（`arrangementV2.ts:90`），裁剪一个片段能表达的，写一条音符就已经能表达；新增一套 Region 编辑状态会让"同一件事有两种说法"。上限：`MAX_BARS=128`（`src/data/arrangementEdits.ts:52`）、`MAX_SECTION_BARS=256`、`MAX_SONG_BARS=2048`（`src/test/longPatterns.test.ts:85-90`） |
| §2.3 音频编辑与弹性处理 | 音频轨、录制、Flex Time/Pitch、Comping、波形 | 🟡 | **已建的一半**：麦克风录制（`src/audio/captureTake.ts` + `LiveRecorder.ts` + `opfsRecordingStore.ts`，`src/test/captureTake.test.ts`）、take 与 comping（`Take`/`TakeRegion` + `src/data/takeComp.ts`，`src/test/takeComp.test.ts`）、audio lane 播放（`src/audio/audioLanePlayback.ts`，`src/test/audioLanePlayback.test.ts`）。**缺的一半**：用户音频文件导入、波形显示（`ArrangementLaneV2.tsx` 只在注释里提到波形，仓库里没有峰值计算）、Time-stretch/Flex Pitch、De-esser（`grep -ri de-esser src/` 无命中）。**决定**：⛔ 不做 Time-stretch/Flex Pitch —— 评估自己也点了 Rubber Band 的 GPL 风险；真要做，选型已经定了 **Signalsmith Stretch（MIT）**，但它引入一个 WASM 依赖加一个格式决定，优先级低于把 audio lane 接进离线渲染。**分期第一步**：让 `render_arrangement` 渲染 audio lane 而不是把它列进 `skippedLanes`（`mcp/pattern.ts:91-99` 现在报"an audio lane has no notes to schedule"） |
| §2.4 全局轨道与宏观控制 | Tempo Track、Signature Track、Chord Track、Marker Track | 🟡 | **速度**：song 层 `tempoTrack`（`src/types/song.ts`，读侧 `src/data/tempoMap.ts` 的 `stepTiming`/`totalSeconds`）、**编排层 `tempoTrack`**（`src/types/arrangementV2.ts:131`）、工具 `set_tempo` / `set_arrangement_tempo` / **`set_arrangement_tempo_map`**（`mcp/registry.ts:593-613`），且**透传到了建歌处**（`mcp/arrangement.ts:596`）——这一条就是评估点名三次的缺口，现在闭合，判据是"两段不同速度 → 时长等于两段之和"（`src/test/arrangementPlaybackLength.test.ts:70-95`：120 bpm 两小节 4 s + 60 bpm 两小节 8 s = 12 s，忘了传 map 就是 8 s）。**拍号**：`set_arrangement_time_signature`（`mcp/registry.ts:541-552`，**拒绝**而非夹取非法值）+ `ArrangementV2.timeSignature`（`:139`），判据见 `src/test/arrangementPlaybackLength.test.ts` 的下一段。**和弦**：读 `list_chord_progressions`/`get_chord_progression`/`suggest_progression`，写 `apply_chord_progression` 与 `apply_pattern_ops` 的 `set_chord_progression`（`src/test/chordProgressionOp.test.ts`；`check:mcp` 有 "apply_chord_progression writes the suggested progression into the pattern"）；钢琴卷帘把非音阶音变灰（`src/components/sequencer/PianoRollLane.tsx:360`）。**决定**：⛔ 不做全局 Chord Track 对象与独立 Marker Track —— 和弦的机器可读那一半（`chords` lane + 进行 op）已经有了，移调是按段落的（`SectionOverrides.transpose`，`src/types/song.ts:89-101`），而"标记"就是带 `label` 的 section，再加一条轨道等于给同一个位置两种说法 |
| §2.5 混音台与信号路由 | Mixer 视图、Insert FX 机架、Send/Return、Bus/VCA、Sidechain | 🟡 | **评估说"无 Mixer 视图"是错的**：`src/components/console/` 有一整套——`ConsolePanel.tsx`(466 行) / `ChannelStrip.tsx`(269) / `MasterStrip.tsx` / `TrackInspector.tsx`(1041)，每轨推子、声像、**send A/B**（`:11-12`，且确认是 pan **之后**取点，`src/test/trackSends.test.ts`）、每轨 insert 链（HPF + 三档 EQ + 压缩 + drive + 立体声宽度，`src/data/trackInsert.ts:54-74`）、group bus + glue 压缩（`src/test/trackBuses.test.ts`，13 项）、sidechain duck（`src/test/sidechain.test.ts`，12 项）、master 限幅与响度 trim。**缺的一半**：**没有任何混音参数进 MCP** —— `set_send` / `set_fx_param` / `route_sidechain` / `get_fx_latency` 都不在 83 个工具里，而评估自己的关键约束正是"Mixer 必须是 MCP 混音工具集的 GUI 投影"。**决定**：🗺 分期第一步 = `set_track_send`（读写已存在的模型字段，是纯变换）+ `get_fx_latency`（延迟表已在 `docs/MCP.md` 里，把它变成工具）。⛔ 不做插件式 insert 槽位（理由见 §3.2） |
| §2.6 自动化控制 | 连续自动化曲线（贝塞尔）、多参数、Read/Touch/Latch | 🟡 | **已有**：per-step 参数锁（`steps`/`velocity`/`gate`/`pitch` 数组）+ 每段 `velocityRamp: [0.6, 1]`（`src/types/song.ts:73`，按 `velocityScale` **相乘**、夹取 `[0,4]`）+ `riser` 标志（`:82`）+ `fill`；闸门有 "add_section carries a build, a fill and a transposition" 与 "the ramp reaches the timeline as a per-bar velocity scale"。**缺的一半**：非力度参数的连续曲线。**决定**：⛔ 不做通用包络——理由是**结构性且已实测**：`normalize_loudness` 的四次测量证明 master 真峰值限幅器**托住**了输出（trim 上游动 12 dB，峰值始终 −1.3 dBTP），而 `MasterGraphOptions` 暴露的全是限幅器**上游**的整混参数，所以自动化它们"看起来什么都没做"（`docs/MCP.md:271`、`docs/V4_REVIEW_PLAN.md` 的 loudness 四轮记录）。要值得做，得先有一个**限幅器下游**的参数 |
| §2.7 MIDI 效果与演奏表现力 | 琶音器、扫弦、Velocity Processor、Transposer、脚本化 | ✅ | `apply_pattern_ops` 的 op 全集（`mcp/registry.ts:167-203`）：`set_step`/`clear_step`/`set_velocity`/`set_pitch`/`set_gate`/`transpose`/`humanize`(带 seed)/`swing`/`add_lane`/`set_chord_progression`/`clear_track`/`copy_track`/`transform_pattern`。**琶音器与扫弦在应用里存在**（`src/utils/arpeggiatorTheory.ts`：`buildArpeggioPattern`(up/down/up_down/random/converge)、`calculateStrumTiming`(down/up/alternate)、`bakeProgressionToSequencer`，`src/test/arpeggiatorTheory.test.ts`）**且现在从 MCP 可达**（见下）；欧几里得仍不可达（`src/audio/Euclidean.ts` + `EuclideanModal.tsx`，无 op，见 §5.4 第 140 行）。**已建（本行收口）**：`apply_pattern_ops` 的 `{ op: "transform_pattern" }` 复用同一批已测纯函数 —— `variant: "arp"` 走 `buildArpeggioPattern` 与抽出来的 `expandArpeggioVoicing`（实时播放器和 `bakeProgressionToSequencer` 也改用后者，登记处只剩一处），`variant: "strum"` 走 `calculateStrumTiming`；判据见 `src/test/transformPatternOp.test.ts`（13 项：up/converge 音序、八度展开、1/8 间隔、扫弦 onset 展开 + 1.0/0.95/0.9 力度扫掠、`speedMs` 量化，以及 variant/pattern/direction/octaves/gate/speedMs/空轨/未知轨逐条拒绝）与同名协议检查（`scripts/check_mcp.mjs`，92 checks）。`arp` 的 `random` 被拒并说明原因：纯函数返回升序池、随机性在调用方是 `Math.random`，不可复现的操作不暴露。⛔ 不做脚本化（Sandbox 里的用户脚本不进入这个仓库的信任边界） |
| §2.8 调度、延迟与渲染质量 | 分辨率无损、离线=实时一致、AudioWorklet、golden render、PDC | ✅ | MIDI 导出用 `TICKS_PER_QUARTER = 480`（`src/audio/MidiExporter.ts:65`），1/32 网格下每步 120 tick，整数无损（`src/test/midiWriter.test.ts` 6 项，且检查了 MThd 头）。离线/实时一致性有实测：同一页面内多次渲染 RMS −9.053 dBFS、重载后 −9.058（差 **0.005 dB**），探针见 `scripts/probe_render_determinism.mjs`，CI 在 `.github/workflows/manual-verify.yml:156`。新 FX 走 AudioWorklet（master 限幅即 worklet）；PDC 见下一行 |
| §2.8.1 PDC 落地 | 延迟表、离线 pre-roll+trim、实时补偿、stems 公共偏移、梳状探针 | 🟡 | **离线域已建**：`WavExporter.ts` 的 `compensate()` 按 `latencySamples` 裁头补尾（`:1011-1037`），预测 7.408 ms、实测 **7.415 ms**（`docs/MCP.md:286-293`）。**实时域已建**：`AudioEngine` 按限幅器延迟提前调度（`src/test/realtimePdcWiring.test.ts` 以源码契约方式钉住三条调度路径与 ±100 ms 夹取）。**梳状探针已建**：`src/test/pdcCombFilter.test.ts` 同时验证"能看见梳状"与"对齐后看不见"。**缺的一半**：`get_fx_latency` 不是工具（延迟表只写在文档里），`render_arrangement_stems` 的 manifest 没有 `common_latency_samples`。**决定**：🗺 第一步 = 把图上已经存在的 `graph.limiter.latencySamples` 作为 `latencySamples` 字段带进每个 stem 的回复（一行，且不需要新测量）；`get_fx_latency` 并入 §2.5 的同一步 |

---

## §3 专业 DAW 视角（功能缺口）

| 小节 | 它的要求 | 现状 | 证据 / 决定 |
| --- | --- | --- | --- |
| §3.1 音频处理层 | 音频轨、录制、波形裁剪/淡化、Time-stretch、Pitch、量化 | 🟡 | 与 §2.3 同一件事，不重复。**明确**：audio lane **能播**（`audioLanePlayback.test.ts`）、**不能离线渲染**（`lanesWithoutMidi` 把它报成 `skippedLanes`，`mcp/pattern.ts:91-99`）——这个"一半"是这一整块的真实边界。**决定**：见 §2.3 的分期第一步 |
| §3.2 效果器生态 | 一张效果器清单 + 架构 | 🟡 | **已建**：混响总线（`src/audio/ReverbBus.ts`）、延迟总线（`DelayBus.ts`）、失真/饱和/位压（`EffectsRack.ts`）、每轨通道条（HPF/EQ/压缩/drive，`ChannelStripDsp.ts`）、glue 压缩（`GlueCompressor.ts`）、真峰值限幅（`MasterLimiter.ts`）、sidechain duck（`sidechain.ts`）、立体声展宽（`StereoWidth.ts`）、HRTF 空间摆位（`src/test/spatialAudio.test.ts`）。**缺**：flanger / phaser / tremolo / vocoder / formant 这一类。**决定**：⛔ 不做**第三方/插件式**扩展 —— Web Audio 没有插件 ABI，本仓库的规则是"新 FX 一律 AudioWorklet 且必须有判据"，一个插件槽位会引入一条没有判据的代码路径。缺的那几种是"再做几个内置效果"，不是架构问题，按需求排队而不是按清单补齐 |
| §3.3 外部硬件与 I/O | Web MIDI（含检测与兜底）、MIDI Learn、MIDI Clock、多通道输出 | 🟡 | **评估的"未实现"是错的（一半）**：Web MIDI 输入**已建**，且有功能检测 —— `MidiInputManager.ts:71` 明确 `"requestMIDIAccess" in navigator`，`src/test/midiInput.test.ts` 覆盖 Note On 与鼓通道映射；兜底路径也有（屏幕键盘 + `src/test/musicalTyping.test.tsx`、MIDI 文件导入 `import_arrangement_midi`，`src/test/midiArrangementImport.test.ts`）。**缺**：MIDI Learn、MIDI Clock 同步。**决定**：⛔ 不做 MIDI Learn / Clock —— 它们要对着真实硬件才能验证，而本仓库的 CI 里没有物理设备，写了也只能是"测试假对象通过"；多通道硬件输出评估自己已校正为 Web 平台不可行，分轨导出承担该职责（见 §4.6） |
| §3.4 工程管理与协作 | 保存/加载、版本历史（opId）、云同步、协作、模板 | 🟡 | **已建**：`.groove` 导入导出（`export_groove` / `import_groove`，实测导出 `version: 2`、307563 字节、`clips`+`sections` 随包携带）、IndexedDB 自动保存（`src/features/sequencer/projectStorage.ts:103,147,200`）、arrangement 模板（`src/data/arrangementEdits.ts:62-79`，三个：drums-bass / drums-bass-chords / samplers）、MCP song 层的 opId + `undo_song`（`mcp/song.ts:54`、`mcp/registry.ts:2346`）。**缺**：人类 UI 与 MCP **共享同一个** opId 命名空间；云同步与协作。**决定**：⛔ 不做协作/云同步（与"零安装单机创作"的定位冲突，且需要后端），⛔ 不做 File System Access API（仅 Chromium，IndexedDB 是跨平台底线），🟡 opId 命名空间**不合并**——MCP server 是独立进程、不持有 UI 的 store，硬合并会造出一个假的共享；两边各自记录、各自可撤销是诚实的形态 |

---

## §4 完整歌曲工业化流程

| 小节 | 它的要求 | 现状 | 证据 / 决定 |
| --- | --- | --- | --- |
| §4.1 词曲与和声层 | 和弦轨、进行建议、旋律生成、动机发展、音阶锁定、声律 | 🟡 | **歌词层已经存在**（评估说"缺"）：`SequencerTrack.syllables?: (string\|null)[]`（`src/types/genre.ts:83-89`，注释明确"歌词过去是音乐旁边的注解，这个字段把它绑到音符上"），`set_vocal_melody` 把音节与音高**按同一下标**绑定并当场跑声律检查（`mcp/vocal.ts`）。和声读取 + 写入闭环、音阶灰显都有（§2.4）。**缺**：`motif_ops`（`grep -rn motif src mcp` 只命中曲风文案）、独立的 `set_lyrics`（歌词只能与音符一起写）、`harmonize` 工具。**决定**：⛔ 不做独立的歌词文档 —— 一句歌词在这里的意义就是它唱在哪个音上，脱离音符的歌词是注解，而注解已经能存在曲风文案里；🗺 `motif_ops` 的第一步是 `transpose`/`invert`/`retrograde` 三个纯函数 op（与 §2.7 的 arp op 同一条路） |
| §4.1.1 旋律写作与声律校验 | `generate_melody` + `validate_prosody`，声调必须真被用上 | ✅ | 两者都在（`mcp/melody.ts` / `mcp/prosody.ts`），`generate_melody` 接受 `tonic/mode/bars/seed/form/density/contour` 并做倒字修正；`check:mcp` 覆盖两件最容易假实现的事：**"给了声调必须真的用上"**（`:500-520` 的注释记录了曾经的漏洞：schema 说 tones、handler 没传）与**"反向要报、顺着不报"**（`:462-474`，实测 1 条 warning / 0 条 warning）。`src/test/prosody.test.ts`、`src/test/melodyGenerator.test.ts` 均通过 |
| §4.2 编曲 | 琶音、扫弦、过渡生成、全曲能量曲线 | 🟡 | **编排/段落/片段/速度图/拍号都具备**（§2.2、§2.4）。缺的是：琶音与扫弦只到 UI（§2.7）、`make_transition` 不是工具（但 `fill`/`riser` 作为段落标志已经能用，闸门有判据）、能量曲线**有意不做独立工具**（§6 M1 #3）。**决定**：见各行；本行不新增工作项 |
| §4.3 录音与人声（双路径） | 路径 A 真人录音 + Vocal Chain；路径 B SVS 桥 | 🟡 | **路径 A 已建一半**：录制 ✅、take/comping ✅、insert 链提供 HPF/EQ/压缩/drive、send 提供混响/延迟；**缺** De-esser 与离线修音。**路径 B**：⛔ 按业主决定 4 **明确不做**，只留接口——`synthesize_vocal` 的 title 就是 "Sing a lyric (reserved — not implemented)"，调用永远返回 `reserved, not implemented` 并说明替代路径（`mcp/registry.ts` 该工具；`mcp/vocal.ts` 顶部三条决定）。这样 agent 会**发现**缺失而不是猜。**决定**：⛔ 不做离线修音（pYIN + 相位声码器是另一个 DSP 项目）；🗺 人声链的 De-esser 第一步 = 在 insert 链加一档动态 EQ（已有 `ChannelStripDsp` 的位置） |
| §4.3.1 SVS 桥接（数据交换标准） | MIDI+Lyric / MusicXML / UST / `.groove` 四格式、VocalTrack 规范、`vocal.synthesize` 签名 | ✅ | **第一步已落地（2026-10-01）**：`export_midi` 写 Lyric meta `FF 05`（`src/audio/MidiExporter.ts:195-204`、`src/data/arrangementToMidi.ts:131-134,302-303`，UTF-8，**紧贴它标注的那个 note-on**），`toMusicXml` 写 `<lyric number="1"><syllabic>single</syllabic><text>…</text></lyric>`（`src/data/musicxml.ts:313-315`，和弦只写首音、延音线只写头部），并**读回**：`parseMidiFile` 读 `0x05` → `fromMidi` → `NoteEvent.syllable` → `importMidiToPattern` 写回 `track.syllables`；`fromMusicXml` 读 `<lyric><text>`。这一步需要**一次模型增补**（`NoteEvent.syllable?: string`，`src/types/arrangementV2.ts:103`，可选取值、旧工程无损）——所以它**不是**"只改两个 writer"。**判据**：`src/test/lyricExport.test.ts` **12 项**，逐音配对三元组（pitch/start/音节）而非子串包含；`syllables` 第 4 步是 `null`、两侧有字，**按 index 绑歪即红**；导出端按 **lane** 贴歌词（格式 0 所有 lane 同一 chunk，按 tick 绑会把 lead 的字给同刻的 kick），解析端只在**同 tick 且紧邻**时认领——把配对退回按 channel 复测，鼓 lane 判据立刻转红（`expected '哒' to be '咚'`，两条鼓 lane 共用 channel 10），**证明该判据有区分力**。**仍 ⛔**：UST 与 VocalTrack 规范全文（业主决定 4 把 SVS 限定为"留空接口"，`synthesize_vocal` 仍返回 `reserved, not implemented`）；`scripts/lib/midi.mjs` 仍无 syllable（它是 sfizz 探针的 fixture writer，不在导出路径） |
| §4.4 混音 | 增益架构、EQ、动态、空间、声场、侧链、参考、频谱 | 🟡 | 与 §2.5 同一件事：EQ/动态/空间/声场/侧链**都在**（每轨 insert + 两条 send + group bus + duck + StereoWidth）；**频谱分析已建**（`analyze_audio` 的 13 段频谱 + `spectral_balance` + `MasterAnalyzerSuite.tsx`）。**缺**：参考曲目 A/B（`CompareView` 是曲风对比，不是参考轨对比）。**决定**：⛔ 不做参考轨模块 —— 它的实质是"把两条渲染的频谱放在一起看"，而 `spectral_balance` 已经返回可比对的同一指纹（音色基线用的就是它） |
| §4.5 母带处理 | 多段压缩、磁带饱和、立体声增强、真峰值限幅、LUFS 表 | 🟡 | **已建**：BS.1770-4 LUFS 表（`src/test/helpers/loudness.ts`，渲染路径真的用它算 `integratedLufs`）、4× 过采样真峰值检测（`src/audio/MasterLimiter.ts:123`）、master glue 压缩、响度 trim/makeup、以及写侧 `normalize_loudness`（渲染→测量→再渲染→报哪个界决定了 trim，并区分 target / truePeak / **masterLimiter** 三种结局）。**缺**：多段压缩、master 磁带饱和、master 立体声增强（StereoWidth 是每轨的）。**决定**：⛔ 不做固定 Mastering Chain 与多段压缩 —— 实测结论是限幅器托住输出，再往它上游堆处理买不到它看起来能买的东西；多段压缩是一个有自己判据的大型 DSP 项目，应当作为独立需求提出而不是被"母带链"顺带 |
| §4.6 发行与导出 | LUFS 规范化、元数据、stems 命名、通用 DAW 包、视频、DDP | 🟡 | **已建**：WAV/MP3/stems/`.groove`/MusicXML/`.als`/pattern 级 MIDI（`export_midi` 存在——**评估"只有导入"已过时一半**）；**LUFS 规范化导出** ✅=`normalize_loudness`；**stem 命名规范** ✅=`src/data/stemNaming.ts` 的 `01_bass_128bpm.wav`（序号在前，因为一个鼓组常有两轨都叫 Percussion）。**缺**：① **编排级 MIDI 导出**（`export_midi` 只吃 `genreId`/`pattern`，没有 `export_arrangement_midi`）；② 元数据嵌入（WAV/MP3 的 ISRC/BPM/Key：`grep -n ISRC src/audio/WavExporter.ts` 无命中）；③ 通用 DAW 包（stems + 分轨 MIDI + 和弦文本的一键包）。**决定**：⛔ 不做视频导出与 DDP（评估自己给 DDP 判了 P3）；🗺 第一步 = **`export_arrangement_midi`**，照着 `export_arrangement_musicxml` 的"走一条轨"写法即可，纯逻辑可测；元数据的第一步 = 给 WAV 写 `LIST/INFO` 块（BPM/Key/标题），同样是纯字节逻辑 |

---

## §5 AI 原生核心（MCP 设计）

| 小节 | 它的要求 | 现状 | 证据 / 决定 |
| --- | --- | --- | --- |
| §5.1 核心理念（打磨嘴和耳朵） | 不在"手动操作"上竞争；写工具 + 感知工具 + 嘴的校验器 | ✅ | **耳朵**：`analyze_audio`（响度/真峰值/不连续点及其位置/相关性/尾音/13 段频谱）、`spectral_balance`、`estimate_key`、`get_loudness_report`、`render_audio`/`render_song`/`render_preview_clip`。**嘴的校验器**：`validate_pattern`、`pattern_statistics`、`validate_prosody`。**嘴**：见 §5.3/§5.4。唯一的结构性缺口是"写音色"（§5.4 的 `sound` 命名空间），在那里裁定 |
| §5.2 三原语布局 | tools / resources / prompts 都要有 | ✅ | 实测 `npm run check:mcp`：**85 tools、7 resources、4 prompts**，`95 checks passed, 0 failed`。资源：`groove://genres`、`groove://genre/{id}`、`groove://loudness`、`groove://examples/{genre}`、`groove://masterclasses`、`groove://docs`（契约本身）、`groove://changelog`。Prompts：`compose_groove`/`explain_genre`/`practice_plan`/`compose_with_examples`。（旧版这份裁定写的是 79 个工具，已按实测更新；`list_examples` 落地后由 84/91 再更新一次。） |
| §5.2.1 读写不对称铁律 + Few-shot 示例 + 紧凑记谱 | 紧凑记谱供读、结构化参数供写；L1 示例 + L2 引擎级风格迁移 | 🟡 | **铁律的可执行那一半成立**：写工具的输入**没有**任何文本记谱通道，`apply_pattern_ops` 是结构化判别联合（`mcp/registry.ts:165-190`），MCP 的 JSON Schema 就是那道防线——这一半可以 ✅。**示例（L1）成立**：`get_example` + `groove://examples/{genre}` + `compose_with_examples` prompt，且示例是**从曲风库构建的**而不是粘贴的（`mcp/examples.ts:1-8`），`src/test/mcpExamples.test.ts` 要求每个示例都通过 `validatePattern`（与其他任何 pattern 同一道闸门）。**紧凑记谱（那套 ~80 token 的鼓谱）没有实现** —— `grep -rn compact mcp/` 只命中"行内紧凑行"，示例返回的是 JSON pattern。**决定**：⛔ 不做紧凑记谱与它的 `parse_compact` 兜底 —— 读侧省 token 这件事已经由别的形态解决了（`get_song` 的 `includePatterns:false` 摘要、`list_genres` 的紧凑行 + `limit/offset` 分页、示例带的是**配方**即工具调用链而不是要被逐字符模仿的网格），而**为读再造一套记谱就是再造一件要保持为真的东西**；没有写通道，解析器也就没有存在理由。**L2（`style_ref`）没有实现** → 见 §6 M1 #4 |
| §5.3 面向 Agent 的工具设计八原则 | 八条设计原则 | ✅ | 逐条判在下面（附一条：这是本节唯一一张"逐条都要有说法"的表） |
| §5.4 完整工具矩阵 v3 | 一张提案的完整工具清单 | 🟡 | **决定**：⛔ 不把"79 项矩阵"当成一次交付——逐命名空间的现状与裁定见下，机制由 `mcpCoverage.test.ts` 兜底：`src/data` 里**每一个改变模型的导出**都必须有工具，或在 `EXCLUDED` 里带理由（"not done yet"不是理由） |
| §5.5 闭环（让 Agent 有耳朵） | 渲染 → 听 → 修正 | ✅ | 两条通道都在：① `render_*` 返回音频文件路径 + 该文件的响度/真峰值；② `analyze_audio` 返回数值通道。**渲染进度回调**：⛔ **明确不做**，理由是技术事实而不是取舍 —— `OfflineAudioContext.startRendering()` 没有回调，一个 song 到渲染器手里是**一个**扁平 pattern（`mcp/render/chunks.ts:1-15`）。替代方案都已建：渲染**前**给出 `secondsEstimate`、用 `maxDurationSec` **拒绝**而不是挂住（`mcp/registry.ts:2465-2480`，针对"2816 步跑了 15 分钟没有任何结果"）、超时后报告是哪个渲染超了并把渲染器重置（`mcp/render/worker.ts:123-149`，默认 15 分钟，由"九乐章每个 3–8 分钟"这个实测定的）、以及 `planRenderChunks` 把长曲切成按段落边界的块以获得 N/M 可见性 |
| §5.6 端到端场景 A–E | 五段完整调用序列 | 🟡 | 这些是**示例**而不是需求，它们的并集由 §5.4 裁定。逐条点名它用了而当时**不存在**的东西：`list_examples`（**本轮已补上**，见上面 analysis 行）、`set_song_structure`、`get_energy_curve`、`harmonize`、`make_transition`、`export_lufs_target`（真名是 `normalize_loudness`）、`vocal.synthesize`（保留未实现）、`draw_automation`、`render_preview`（真名是 `render_preview_clip`）。**决定**：⛔ 不做 `set_song_structure` —— `src/test/docsWorkflow.test.ts:25-28` 明确禁止文档出现这个名字，理由写在文件头：它是那位作曲者第一个试的名字，**而它不存在**；结构由 `create_song` + `add_section` 表达。场景 E（歌词→旋律→声律→合成/导出）今天可用 `set_vocal_melody` 走通 |
| §5.7 与 Suno/Udio 战略对比 | 三条战略结论 | ⛔ | 定位章节，没有可建条目。**唯一可检验的两条**：确定性（已有实测：同页/重载 0.005 dB）与"零训练数据争议"（规则 + DSP 合成，仓库里没有模型权重）。**决定**：不做工作项 |
| §5.8 与 Ableton 导出的协同 | `.als` + 通用 DAW 包兜底 | ✅ | `export_ableton` 存在且闸门验证产物是 gzip XML（`check:mcp`："export_ableton returns gzipped XML"）；**每段一个 clip**（`AbletonExporter` 的 `clips` 参数，`src/test/AbletonExporter.test.ts`：默认一个 clip 于 t=0、给了 `clips` 则每段一个）。"通用 DAW 包"缺的那一格记在 §4.6 |
| §5.9 MCP 工程化（部署/状态/安全/契约治理） | stdio 优先、单一事实源、路径沙箱/限流/token、semver + changelog | 🟡 | **stdio 已发布**（`mcp/server.ts` 顶部；`mcp/README.md` 有 Claude Desktop/Cursor 配置）。**安全项已具备并写进契约**（`docs/MCP.md:404-414`）：库永不被改（`get_pattern` 返回副本）、**文件系统面只有一个目录**（只有渲染类工具写、只写在 `GROOVE_MCP_OUT` 下、文件名由曲风 id 派生而非模型文本）、浏览器惰性且只起一次（`GROOVE_MCP_NO_BROWSER=1` 可拒绝）、无网络无凭据。**契约治理** ✅：`groove://changelog` + `groove://docs`，且 `check:mcp` 会断言"每个被文档声明的资源都真的注册了"（`:2555-2580` 的注释记录了这条闸门抓到的两次文档/代码不一致）。**缺**：streamable HTTP、token 鉴权、工具白名单、渲染限流。**决定**：⛔ HTTP 传输**分期不做**，理由已经写在 `docs/MCP.md:448-452`：它需要一个部署位置，并且在此之前必须先决定**哪些工具可以在远端跑**（渲染一定不行）与怎么限流，这些"不应该在 stdio server 里悄悄发明"；⛔ 渲染限流不做独立机制 —— `maxDurationSec` + 15 分钟超时 + 超时重置渲染器已经是"防 agent 死循环烧 CPU"的判据化形式 |
| §5.9.1 三族指标体系 | 服从性 Gate + 赋能性看板 + 质量看板 + 表达力比 + L_min | 🗺 | **整套没实现，但不是未决，且第一步已完成（2026-10-01）**。已有的零件：能量曲线（随渲染指标返回）、响度/真峰值/不重复点、13 段频谱指纹、调性估计（质量族的输入）；同页/跨重载确定性探针（接近"确定性双档"）；`check:mcp` 的检查集（服从性的一个子集）。**已完成的第一步**：`L_min` 已写进本文档（文末"§5.9.1 的第一步"一节）——"verse/chorus 听感对比"的最短调用序列 = **6 次**（`create_song` → `add_section` → `apply_chord_progression`×2 → `render_song` → `get_loudness_report`），并写明**让"6"成立的三条前提**（分段渲染 +1~2、频谱指纹 +1、确定性重复 +1）；`L_actual` **故意留空**并写明测量法（`mcp_call.mjs --script` 的步骤数即计数点），因为本会话没做过该任务，拿别的任务的调用数去填就是"看起来像读数"的东西。它是整套指标里唯一"必须由人来定"的那个数，用途是让 `L_actual / L_min` 成为**工具面摩擦**的读数（接近 1 = 表面顺；明显大于 1 = 能力在但要绕路）。**仍没有**：表达力比、绕路分类、自修正率、20 任务评测集。**⛔ 不做**的部分与理由：DTW/BCI 这类质量指标需要先有一个模板库（否则度量的是空场景），且报告自己也把它们降级为看板；而归因规则要跑在"钉死的模型版本"上，这个仓库的 CI 里没有 LLM，硬造一个只会得到"测试假对象通过" |

### §5.3 八原则逐条

| # | 原则 | 判 | 证据 / 决定 |
| --- | --- | --- | --- |
| 1 | 读写对称（感知闭环） | 🟡 | **机制已建，而且比"每类写工具配一个读工具"更强**：`src/test/mcpCoverage.test.ts` 读 `src/data/arrangementEdits.ts` 的源码，找出每一个改变模型的导出，要求它**要么**被某个工具到达（`EXPOSED` 表），**要么**列进 `EXCLUDED` 并给出理由——"还没做"不是理由；`src/test/mcpCapability.test.ts` 再把 `src/views/` 的每个视图映射到工具/资源/prompt 或一条理由（实测输出 19 个能力面）。**缺口**：`sound` 命名空间（`set_synth_params` / `set_track_preset`）完全缺失，混音写侧也缺失。**决定**：🗺 两条都在 §5.4 的 `sound` 行与 §2.5 行给了第一步（`set_track_preset`；`set_track_send`），而不是各加一个只读镜像工具 |
| 2 | 音乐学分层（意图级 vs 外科级） | 🟡 | 外科级齐全（`set_step`/`add_arrangement_note`…）；意图级今天是 **prompts**（`compose_groove`、`compose_with_examples`）加少数高层 op（`set_chord_progression`、`generate_melody`）。**决定**：⛔ 不做 `make_transition` 工具——段落层的 `fill`/`riser` 标志就是它的意图级形态，闸门有判据（"add_section carries a build, a fill and a transposition"）；再造一个工具会让"这段该有过渡"有两种说法 |
| 3 | 事务与撤销（opId） | 🟡 | **song 层已建**：每次变更记 `{opId, op, before, at}`（`mcp/song.ts:54-61`），`undo_song` 回退并报当前形态，`get_song` 列出 `history`；闸门按 `docs/V4_REVIEW_PLAN.md` 的验收线断言"一串调用能回到起点"（`scripts/check_mcp.mjs:411-422`）。**缺的一半：arrangement 层没有任何历史** —— `mcp/arrangement.ts:197-203` 的 `edit()` 直接把新对象写回 Map，不记录 before。**决定**：🗺 第一步 = 在 `edit()` 里照 `song.ts:54` 的形状记一条 `{opId, op, before}` 并在 `get_arrangement` 里列出；这是**一个函数**，而每个 arrangement 工具都走它 |
| 4 | 确定性与种子 | 🟡 | 带随机性的生成器都吃 `seed`：`humanize`（`registry.ts:173`）、`generate_melody`（`:1710`，默认 1）、`set_vocal_melody` 透传；曲风 pattern 的种子由 `patternSeed(genre_id, bpm, totalSteps)` 决定（`src/audio/noteEvents.ts:27`），因此同工程同输出。渲染确定性有实测（同页 RMS 一致到 1e-3 dB，跨重载 0.005 dB）。**缺**：`create_song` / `set_clip` 本身不接受 `seed`。**决定**：⛔ 不加 —— 这两个工具的输入**已经是完全显式的**（一个 pattern 就是它自己的种子），给确定性输入再套一层 seed 只会多一个可以与之矛盾的字段 |
| 5 | 富错误与自修正引导 | ✅ | `failure()` 返回带 `isError` 的文本部件；关键路径的消息**是富的**：未知曲风会说出工具名、库的总数，并在像缩写时点名最接近的 id（`mcp/registry.ts:19-27` 的注释记录了那位作曲者输入 `"techno"` 得到的旧消息），未知 track 会列出该编排的全部 track id（`mcp/arrangement.ts` 的 `unknownTrack`），`set_arrangement_time_signature` 拒绝 `"4/5"` 而不是默默当 4/4。**决定**：⛔ 不做 `{error, message, available_sections, hint}` 那种结构化错误体 —— MCP 的错误就是一个文本部件，客户端展示的就是它；把已经写得够用的散文改成字段，收益是零而成本是每个 handler |
| 6 | 返回值 token 经济 | 🟡 | 有**按用途裁剪**的形态：`get_song` 的 `includePatterns:false` 返回摘要、`list_genres` 有 `limit/offset`、`list_arrangement_instruments` 有 `limit`、`list_genres` 返回的是紧凑行不是整份文档（`mcp/library.ts:47`）。**缺**：通用的 `depth` / `fields` 掩码。**决定**：⛔ 不做通用掩码 —— 返回大负载的那几个工具各自已经有一个"够用的窄形态"，通用掩码是第二套需要保持为真的 schema，而 MCP 客户端本来就能分页。**顺带发现的报告缺陷（不是评估的条目，记在这里因为它属于"返回值要说清楚"）**：`SongSummary.passBars` 的注释说它是"一次 pass 值多少**小节**"（`mcp/song.ts:67`），而它算的是 `timeline.totalBars / totalPasses`（`mcp/song.ts:135`），即"每段多少 pass"。实测两次：`create_song(chicago-house, bars=1)` → `totalSteps 128、totalBars 1、passBars 1、secondsEstimate 15.5`；`bars=90` → `totalSteps 11520、totalBars 90、passBars 1、secondsEstimate 1393.5`。11520 ÷ 90 = 128 步 = **8 小节/次 pass**，而 `passBars` 两次都报 1 —— 两者不可能同时对。本次只记录，不改源码 |
| 7 | 边界校验内建 | ✅ | `patternSchema` 逐字段带范围（`mcp/registry.ts:112` 起），op schema 是判别联合；`MAX_SECTION_BARS`/`MAX_SONG_BARS` 在模型里；`set_tempo` 对**读不出的点整条拒绝**（闸门："set_tempo accepts a map and refuses an unreadable point"）；拍号校验而非夹取（`mcp/arrangement.ts:534-536`）。 |
| 8 | 契约版本化与能力发现 | ✅ | `groove://changelog`（读提交过的 `public/changelog.json`，`mcp/registry.ts:2578-2585`）与 `groove://docs`（契约本身）；`check:mcp` 断言"文档声明的资源必须注册"。**决定**：⛔ 不做 `get_contract_version` 工具 —— 契约已经是一个可读资源，再给一个返回版本字符串的工具只是让同一件事有两条路 |

### §5.4 工具矩阵逐命名空间

| 命名空间 | 提案 | 判 | 现实 / 决定 |
| --- | --- | --- | --- |
| project | `create_project`/`load_project`/`save_project` | 🟡 | 真名是 `create_song`/`create_arrangement` + `export_groove`/`import_groove`。**决定**：不改名——`project` 在 `.groove` 包里是另一层含义，改名会让两个既有概念同名 |
| project | `get_project_state(depth, fields)` | 🟡 | `get_song`（带 `includePatterns`）/`get_arrangement`；没有 `depth`/`fields`，理由见 §5.3 第 6 条 |
| project | `undo`/`redo`/`snapshot`/`restore` | 🟡 | `undo_song` 有（可回退 N 步）；`redo`/`snapshot`/`restore` 没有。**决定**：⛔ 不做 redo —— `history` 里存的是 before 镜像，redo 需要一整套 forward 日志，而 agent 的用法是"试错后回退"，回退后重做可以重新调用工具；`snapshot`/`restore` 由 `export_groove`/`import_groove` 覆盖 |
| project | `get_contract_version` | ⛔ | 见 §5.3 第 8 条（资源即契约） |
| analysis | `list_genres`/`get_genre_notes` | ✅ | `list_genres`/`get_genre`/`search_genres`/`list_categories`/`get_genre_relations` |
| analysis | `list_examples`/`get_example` | ✅ | **两个工具现在都在**：`get_example`（+ `groove://examples/{genre}` 资源）与新增的 `list_examples`（`mcp/registry.ts:1829` / `:1846`），两者调用**同一支** `examplesFor`（`mcp/examples.ts`），索引不另存一份 id 列表，因此不可能各说一套。`list_examples` 返回选一个示例所需的东西——`id`、`genreId`、`index`、`title`、`teaches`、`recipe`（pattern 与 notes 仍留在 `get_example`）——并按 `genreId` 过滤、按 `limit/offset` 分页（默认 50，镜像 `list_genres`）。**判据**：`src/test/mcpExamples.test.ts` 的跨工具一致性用例先对库里**每个** genre 调 `get_example` 得到"它能服务的一切"，再把 `list_examples` 分页取尽，双向比对 id 集合，且每个被列出的 id 必须由它公布的 `genreId`+`index` 取回同一条（实测 159 个 genre / 318 条示例，通过）；`scripts/check_mcp.mjs` 另有一条协议层检查用 chicago-house 做同样的往返。**那一处小缺陷也修了**：schema 描述里不存在的 `list_example_genres` 改为 `list_examples`，失败消息也从"只有这三个曲风"改为指向 `list_examples`/`list_genres`——因为 `examplesFor` 对**库里每个 genre** 都成立（实测 318 条全部通过 `validatePattern`），旧消息在事实上是错的。**注**：`EXAMPLE_GENRES`/`hasExamples` 仍标着 3 个"手工示例"，但 `get_example` 从来就不止服务这 3 个；本行按代码实况判，不按那三行的声明 |
| analysis | `get_arrangement`/`get_section`/`get_track`/`get_pattern` | 🟡 | `get_arrangement` ✅、`get_pattern` ✅、`get_song` 返回 sections ✅；没有单独的 `get_section`/`get_track`。**决定**：⛔ 不拆 —— 一段/一轨脱离整曲读没有意义（段落是可以共享 clip 的引用），拆开只会造出"同一份数据三种读法" |
| analysis | `get_energy_curve`/`estimate_key`/`analyze_loudness`/`analyze_spectral_balance` | ✅ | `estimate_key` ✅、`spectral_balance` ✅、`get_loudness_report` ✅、`analyze_audio` ✅。`get_energy_curve` 与 `analyze_loudness` **有意不做**（曲线随指标返回；响度已经随渲染返回，见 `docs/MCP.md` 的"Loudness needs no analysis tool"） |
| structure | `set_song_structure(template)` | ⛔ | 不做，理由与判据见 §5.6 |
| structure | `create_section`/`duplicate_section`/`reorder_sections`/`set_section_length`/`delete_section` | 🟡 | `add_section`（可带 `bars`/`label`/`mute`/`velocityScale`/`velocityRamp`/`fill`/`riser`/`transpose`）✅、`duplicate_section` ✅、`make_unique` ✅、`set_lane_slots` ✅；**缺** `reorder_sections` 与 `delete_section`。**决定**：🗺 第一步 = 一个 `reorder_sections`/`delete_section`（都是 `sections` 数组上的纯操作，模型无新字段）；`set_section_length` ⛔ 不做（`add_section` 的 `bars` 与视图的拖拽已经表达它） |
| pattern | `generate_pattern(genre, role, density, seed, style_ref?)` | 🟡 | `get_pattern`（曲风自带）+ `apply_pattern_ops`。**`style_ref` 没有实现** → **决定**见 §6 M1 #4：L1 示例库已建并过闸门；L2 的第一步是只读的 `get_example_features` |
| pattern | `mutate_pattern(humanize/vary/density/swing)` | ✅ | 都由 `apply_pattern_ops` 的 op 提供（`humanize` 带 seed、`swing`、`transpose`）；"density" 用 `set_step`/`clear_step` 组合 |
| pattern | `transform_pattern(arp/strum/converge)` | ✅ | `apply_pattern_ops` 的 `{ op: "transform_pattern" }`（见 §2.7）：`variant: "arp"` 复用 `buildArpeggioPattern`（up/down/up_down/converge 都在内）、`variant: "strum"` 复用 `calculateStrumTiming`，判据 `src/test/transformPatternOp.test.ts` + `scripts/check_mcp.mjs`。**`mirror` 不在这条能力里**：全仓库没有 `mirror`/`retrograde`/`invert` 的任何实现（`grep -rnw` 只命中网络镜像与文件镜像的散文），它属于 §4.1 的 `motif_ops` 第一步（`transpose` 已有，`invert`/`retrograde` 未做，见 `melody` 行第 142 行） |
| pattern | `apply_euclidean`/`set_step`/`set_notes`/`set_step_probability`/`set_ratchet`/`clear_pattern`/`duplicate_pattern` | 🟡 | `set_step`/`clear_step`/`set_velocity`/`set_pitch`/`set_gate`/`clear_track`/`copy_track` ✅；**缺** `apply_euclidean`（欧几里得在 `src/audio/Euclidean.ts` + `EuclideanModal.tsx`，**UI-only**）、`set_step_probability`、`set_ratchet`、`duplicate_pattern`。**决定**：🗺 第一步与 arp 合并为"把 UI-only 的确定性变换接进 `apply_pattern_ops`"，欧几里得排第一（它是评估 §1.3 点名的一等功能，且算法是纯函数） |
| harmony | `set_key_scale`/`set_chord_progression`/`suggest_progression`/`transpose_section`/`harmonize` | 🟡 | `suggest_progression` ✅、`apply_chord_progression` ✅、`set_chord_progression` op ✅、段落移调 = `add_section` 的 `transpose` ✅；音阶通过 pattern 的 `scale` 字段（`patternSchema` 允许）但**没有专门的 op**；`harmonize` 没有。**决定**：⛔ 不做 `harmonize`（它的实际内容是"给已有旋律配和声"，而这需要先决定和声规则；`suggest_progression` + `set_chord_progression` 是可解释的替代）；🗺 `set_key_scale` 的第一步 = 一个 `{ op: "set_scale" }`（纯字段写，模型里已有该字段） |
| melody | `generate_melody`/`motif_ops` | 🟡 | `generate_melody` ✅；`motif_ops` 没有。第一步见 §4.1 |
| vocal | `validate_prosody` | ✅ | 存在，闸门覆盖"反向报、顺向不报"与"声调真被用上" |
| sound | `set_synth_params`/`set_track_preset` | 🗺 | **完全没有写音色的 MCP 工具**（83 个里没有）。这是 `mcpCoverage`/`mcpCapability` 两张机制表都抓不到的缺口，因为音色参数不在 `arrangementEdits.ts` 的导出里。**决定**：🗺 第一步 = 一个只读的 `list_arrangement_instruments` 已有的目录之上，加 `set_arrangement_track_instrument`（**已存在**）之外的预设参数读取；写侧的第一步是 `set_track_preset`，因为预设是有限集合而逐个合成器参数不是 |
| mix | `set_volume`/`set_pan`/`set_send`/`set_fx_param`/`route_sidechain`/`get_fx_latency` | 🟡 | 音量/声像 ✅（`set_arrangement_track_gain`/`set_arrangement_track_pan`）；send / fx 参数 / sidechain / 延迟表 ✗。第一步见 §2.5 与 §2.8.1 |
| automation | `draw_automation` | ⛔ | 结构性不做，理由与实测见 §2.6 |
| transition | `make_transition`/`generate_fill`/`generate_riser`/`generate_downlifter` | 🟡 | 段落层的 `fill`/`riser` 标志 ✅（闸门有判据）；`make_transition` ⛔（§5.3 第 2 条）；`generate_downlifter` 没有但 `riser` 的反面可由 `transpose` + `velocityRamp` 表达。**决定**：不再增补 |
| render | `render_preview(scope, format)` | 🟡 | 真名是 `render_preview_clip`（8 kHz 单声道，自带 `seconds` 计时）——**它不返回音频内容**，只返回路径。**决定**：⛔ 不把音频塞进上下文（`docs/V4_REVIEW_PLAN.md` 的"deliberately rejected"：三分钟缓冲进 agent 上下文与 token 经济相反） |
| export | `export_wav`/`export_mp3`/`export_stems`/`export_midi`/`export_als`/`export_lufs_target` | 🟡 | `render_audio`(wav/mp3) ✅、`render_arrangement_stems` ✅、`export_midi` ✅、`export_ableton` ✅、`normalize_loudness` ✅（=LUFS 目标导出）。**决定**：缺口只剩两格，第一步分别写在 §4.6（`export_arrangement_midi`）与 §2.8.1（stems 回复带 `latencySamples`） |
| 前瞻 | `vocal.synthesize`/`audio.*`/`master.render` | 🟡 | `vocal.synthesize` ✅ 保留、诚实地报"未实现"；`audio.*` 与 `master.render` ⛔ 不再单独设命名空间（混音与母带已在 `set_arrangement_track_*` / `normalize_loudness` 名下） |

---

## §6 演进路线图

| 里程碑 | 它的要求 | 现状 | 证据 / 决定 |
| --- | --- | --- | --- |
| M1 #1 契约版本化 + `groove://changelog` | 元数据 | ✅ | `groove://changelog` 与 `groove://docs` 都在（`mcp/registry.ts:2558-2585`），`check:mcp` 断言"文档声明的资源必须注册"，`src/test/changelogSize.test.ts`/`changelogUpdate.test.ts` 另有约束 |
| M1 #2 `undo` / opId | 轻量事务日志 | 🟡 | **song 层已完成**（`mcp/song.ts:54`、`undo_song`、闸门按验收线断言）；**arrangement 层没有历史**（`mcp/arrangement.ts:197`）。第一步见 §5.3 第 3 条 |
| M1 #3 `get_energy_curve` 粗粒度版 | 让 Agent 听见结构 | **不做（已有决定 + 理由）** | 保留原来的记录，因为它仍然是这份文件里最有教益的一条：**这一条被判错过两次。** 先当成缺口、又写了七步实施方案；读到实现才发现**项目早已决定不给它独立工具**，理由写在代码里：*"The curve lives with the metrics rather than behind its own tool: an agent that has rendered a song already has the metrics; one more call to read a curve it could have had for free would be the token economy this project keeps refusing"*（`mcp/render/worker.ts`，`energyCurveDb` 调用点旁）。曲线**随渲染指标返回**，`sampleRate: 8000` 的分析通道把开销压到约五分之一。另：窗口是**一秒**且刻意与 bpm 无关（`perWindow = Math.max(1, Math.floor(sampleRate))`，`worker.ts:409-413`），这否掉了"默认 50 ms"的假设 |
| M1 #4 `style_ref` + 示例库 | 每曲风 2–4 个核心角色示例 | 🟡 | **示例库（L1）已建**：`get_example` + `groove://examples/{genre}` + `compose_with_examples`，示例**从曲风库构建**而非粘贴，每个示例都过 `validatePattern`（`src/test/mcpExamples.test.ts` 3 项，已跑通）。**曲风覆盖的实况（本轮修正）**：`EXAMPLE_GENRES = ["chicago-house","deep-house","hard-techno"]`（`mcp/examples.ts:29`）只标出 3 个手工点名的曲风，但 `examplesFor` 从 `findGenre` + 曲风自带 pattern 构建，因此**对库里每个 genre 都成立**——实测 159 个 genre × 2 = 318 条示例，全部通过 `validatePattern`，`get_example` 与 `list_examples` 服务的都是这 318 条。旧行写的"做的是 3 个，不是 159 个"按 `hasExamples` 判是对的，按两个工具的实际行为判是错的。**`style_ref`（L2 引擎级条件化）没有实现**。**决定**：⛔ 不手工铺满 159×2–4 —— 文件自己的理由是"一对真做过的示例比四十个自动生成的更有价值"（`mcp/examples.ts:28`），而自动生成的示例会把曲风库的现状复制一份、失去"示例"的意义；🗺 `style_ref` 的第一步 = 一个**只读**的 `get_example_features`：对示例做统计特征提取（onset 密度、切分直方图、力度分布、参数锁矩阵），先把 L2 的输入定义出来并让它可被检查；生成侧第二步再挂上去。（这一拆分正是评估自己 §5.2.1 的 L2 定义。） |
| M1 #5 和声层最小集 | `set_chord_progression` + `suggest_progression` | ✅ | `suggest_progression`（读）+ `apply_chord_progression`（写）+ `apply_pattern_ops` 的 `set_chord_progression` op；`romanToChords` 把罗马数字在调用者的调上落成音高（`mcp/library.ts`）。判据：`src/test/chordProgressionOp.test.ts`、`check:mcp` 的 "apply_pattern_ops accepts set_chord_progression" 与 "apply_chord_progression writes the suggested progression into the pattern"。命名用 `apply_` 而非 `set_`：写入动词开头的工具声明 `readOnly: false`，而它是纯变换 |
| M1 #6 旋律 + 声律校验 | `generate_melody` + `validate_prosody` | ✅ | 见 §4.1.1 |
| M1 关键技巧：分析专用降采样 | 8 kHz 单声道 | ✅ | `RenderOptions.sampleRate/channels` 已实现并用于分析（`mcp/render/worker.ts:39,275`）；`docs/MCP.md` 的预算表记了 13.5× 的杠杆 |
| M1 验收：一分钟闭环 ≤90s | 生成→自检→修正→导出 | 🟡 | **这一轮实测了可以测的那一半**：`node scripts/mcp_call.mjs --script`（create → export `.groove` → 读 pattern → humanize+swing+和弦三个 op → validate → statistics → suggest_progression → generate_melody → validate_prosody）三次 = **9.36 / 8.34 / 8.71 s**，含 Node 与 server 启动。渲染那半的证据是记录值：暖启动预览 **1.45 s 渲染 14.4 s 音频**（`docs/MCP.md:313`）。**冷启动是变量**：本机负载 21 时我测到 `render_preview_clip` **24.98 s**（17.18 s 音频，8 kHz 单声道），随即两次被 `page.goto: Timeout 30000ms` 挡下。**决定**：验收线在"无浏览器那半 + 一次预览"上满足（≈10–35 s < 90 s）；**尚未单次测到的**是"整条回路在同一个热会话里"的墙钟——🗺 第一步 = 一个 CI 探针，在**一个进程**里跑完这 9 次调用加一次预览并打印墙钟（`mcp_call.mjs --script` 已经能做这件事，只差把它放进门禁并印时间） |
| 渲染 SLO 表 | 能量曲线 ≤1s / 段落 ≤5s / 全曲 ≤20s | 🟡 | **按记录值逐行裁定，不按承诺**（`docs/MCP.md:303-320`，数字来自 CI）：① 分析渲染 **1.8 s**（8 kHz 单声道，同一首 44.1 kHz 是 24.4 s）→ **未达标**，缺口指名（要从 1.8 s 到 1 s 还得再降一个采样率档或让引擎更快）；② 段落预览 **1.45 s / 14.4 s 音频** → **达标**（目标 ≤5 s，文档自己也记了 ≤3 s）；③ 暖启动全曲渲染 **0–0.4 s**，长编排"tens of seconds" → **达标于短曲、未达标于长曲**，缺口指名。**决定**：SLO 保留为"记录值 + 达/未达"的表而不是愿望；⛔ 不重定 SLO 数值（评估提出"需要重定或明确规模"，而按规模分行正是这张表现在做的事）；本机负载下冷启动 24.98 s 记在 M1 验收行 |
| Phase 0 引擎下沉 | headless core、Schema v2、RenderTarget 抽象、golden render | 🟡 | 逐项：headless core：🗺 业主已推翻原 ⛔ 并要求做（原话"Phase 0 引擎下沉要做：headless core"）。原理由只对"在 Node 里重写第二个渲染器"成立，对"跑同一份代码、只换 Web Audio 宿主"不成立——实测 `node-web-audio-api@2.2.0` 在 Node 里跑起了真的 `renderPatternOffline`、真的 GS-1/限幅器/glue worklet 与 vendored wasm，且两个宿主各自逐次完全一致（0.000 dB）。但两个宿主今天仍有最差频段 1.34 dB、响度 1.89 LU 的差（44.1 kHz 立体声；差值在声部/轨道图，母带链与 GS-1 都已排除，根因未二分到底），所以是分期而不是现在切。第一步、共享物件与判据全文见 [`HEADLESS_CORE_PLAN.md`](HEADLESS_CORE_PLAN.md)；判据探针 `scripts/probe_headless_parity.ts` 已建，当前不通过。**Schema v2** ✅（`.groove` `version: 1 \| 2` + 迁移，`src/types/project.ts:84`；`docs/GROOVE_PACKAGE_FORMAT.md` 是规范），但"含 seed + 引擎版本的 reproducibility manifest"这一半**没有** → 🗺 第一步 = 往包里写 `{seed, engineVersion}`（纯字段，读取方可以忽略）。RenderTarget 抽象：🗺 推后到无头核心第二步之后——两个宿主放在一个接口后面才有意义，而第二个宿主现在还没过判据（见上）。今天只有 `OfflineAudioContext` 一条，而"实时/离线一致"是用实测钉住的（同页/重载 0.005 dB，`scripts/probe_render_determinism.mjs`，CI 在 `.github/workflows/manual-verify.yml:156`）。**golden render** ✅ **以这个项目诚实的形式**：不是 MD5，而是"同页逐次一致、跨重载 ≤0.005 dB"的 epsilon 档——这恰好是评估 §5.9.1 自己论证过的双档制（跨运行时坚持 MD5 必然失败） |
| Phase 1 片段化与时间线 | Region、Timeline 视图、动态轨道、Global Tracks、自动化、MCP 同步 | 🟡 | Region 模型 = SongSection（§2.2）✅（无 offset/裁剪）；Timeline 视图 ✅（`src/components/arrangement/` 全套 + ruler + 纯命令层）；动态轨道 + Folder ✅（`add_arrangement_track` / `set_arrangement_track_parent` / `set_arrangement_track_collapsed`）；Global Tracks 的**速度曲线与拍号** ✅、**和弦轨** ⛔（§2.4）；连续自动化 ⛔（§2.6）；MCP 同步：`track.*` ✅、`region.*` ⛔（没有独立 Region 对象）、`automation.*`/`draw_automation` ⛔。**决定**：本阶段剩下的三项不做，理由分别写在 §2.2（Region 与自由音符重复）、§2.6（自动化被限幅器吸收）与 §2.4（和弦轨由 `chords` lane + 进行 op 承担）；没有留给以后再定的子项 |
| Phase 2 音频破冰与混音台 | Audio Track 导入、WASM 伸缩、Mixer、PDC 三项、sidechain、录音+Comping、MCP 同步 | 🟡 | Mixer ✅（`src/components/console/`）；**PDC 三项全部落地**（离线补偿 / 实时提前调度 / 梳状探针，§2.8.1）✅；sidechain ✅（duck 已接）；麦克风录音 ✅；Comping ✅；**Audio Track 导入 ✗**（能录、能播，不能导入用户文件）；**WASM 伸缩 ✗**（选型 Signalsmith MIT，未做，见 §2.3）；MCP 同步：`analyze_*` ✅、`render_preview` ✅（真名 `render_preview_clip`）、`mix.*`/`get_fx_latency` ✗。**决定**：两个 ✗ 的第一步分别写在 §2.3（先让 audio lane 进离线渲染，再谈导入与伸缩）与 §2.5 / §2.8.1（`set_track_send`、stems 带 `latencySamples`） |
| Phase 3 完整歌曲工具链 | 和声全量、人声双路径、母带链 + LUFS 导出、Web MIDI、工程存取、MCP 同步 | 🟡 | 和声：进行 ✅、音阶灰显 ✅、`transform_pattern(arp/strum)` ✅（op，§2.7）、动机发展 ✗（`mirror`/`invert`/`retrograde` 仍在 §4.1 未做）；人声：A 半 ✅、B 保留 ⛔（业主决定 4）；母带：LUFS 表 + 真峰值限幅 + glue ✅、多段/磁带/立体声增强 ⛔（§4.5）、**LUFS 规范化导出 ✅**；Web MIDI ✅；工程存取 ✅（`.groove` + IndexedDB）；MCP 同步：和声部分 ✅、`vocal.synthesize` 保留 ✅、`export_lufs_target` ✅（=`normalize_loudness`） |
| Phase 4 AI 导演模式 | AI Song Director、闭环全自动、风格迁移、评测基座、社区曲风包 | ⛔ | **明确推后（defer），不排期**：本阶段的每一项都要站在 Phase 0–3 的成果上（Region/Mixer/音频轨/SVS），而其中任意一项都还没有可开始的第一步；唯一的例外是 §5.9.1 的评测基座第一小步（挑一个任务定 `L_min`），它不依赖任何前置，因此被单独列进 §5.9.1 而不是这里。把它们留在路线图里是路线图，不是承诺 |
| 跨阶段原则 1：No UI-only Features | 每个用户可见能力同相位进 MCP | 🟡 | **机制已建**：`mcpCapability.test.ts`（每个 `src/views/` 视图必须有工具/资源/prompt 或一条理由）+ `mcpCoverage.test.ts`（每个改模型的导出必须有工具或理由）。**这一轮抓到两个真实违例**：琶音/扫弦（`src/utils/arpeggiatorTheory.ts`）与欧几里得（`src/audio/Euclidean.ts`、`EuclideanModal.tsx`）都是 UI-only，而两张机制表都没抓到——因为它们找的是 `arrangementEdits.ts` 的导出与 `src/views/` 的视图，而这两个能力住在 `src/components/` 的模态里。**一半已收口**：琶音/扫弦由 `apply_pattern_ops` 的 `{ op: "transform_pattern" }` 接进 MCP（§2.7；判据 `src/test/transformPatternOp.test.ts` 与 `scripts/check_mcp.mjs`）；**欧几里得仍是 UI-only**，是这条原则当前唯一未收口的实例（§5.4 第 140 行）。机制表的扫描面扩到"确定性变换模块"仍未做，这正是欧几里得还能躲过的原因。 |
| 跨阶段原则 2：全员种子化 | 一切生成器接受 seed | 🟡 | 同 §5.3 第 4 条 |
| 跨阶段原则 3：全员 opId 化 | 一切变更进与 UI 共享的操作日志 | 🟡 | 同 §5.3 第 3 条 + §3.4（两套日志各自记录，不合并） |
| 跨阶段原则 4：golden render 双档确定性先行 | 同运行时 MD5、跨运行时 epsilon（float32 WAV） | 🟡 | 已建的是**跨重载 epsilon 档**（0.005 dB，`probe_render_determinism.mjs`）；**同运行时 MD5 没有**。**决定**：🗺 第一步 = 在同页连渲两次、比对两个 WAV 的字节（用 float32 WAV，不用 16-bit PCM——评估自己指出量化噪声会淹没被测差异）；这是探针里加一行，不是新机制 |

---

## 能力缺口（Muse 一手使用中点名，按价值排序）—— 逐条裁定

1. **编排侧 tempo map** —— ✅ **已闭合**。位置与三步（模型字段 → 投影 → 建歌时带上）都在，工具是 `set_arrangement_tempo_map`（`mcp/registry.ts:593-613`，空列表清空 map、读不出的点整条拒绝、按小节排序），判据是"两段不同速度 → 时长等于两段之和"（`src/test/arrangementPlaybackLength.test.ts:70-95`）。剩下的是**表面上的小瑕疵**：`render_arrangement` 的描述仍写着"An arrangement is one bar of sixteen steps"（`mcp/registry.ts:225`），而实现渲染整条编排——这是一处过时描述，不是缺口。
2. **拍号** —— ✅ **已闭合**。`ArrangementV2.timeSignature`（`src/types/arrangementV2.ts:139`）+ `set_arrangement_time_signature`（校验而非夹取）+ 小节长度跟随它的判据（`src/test/arrangementPlaybackLength.test.ts` 下一段）。
3. **MIDI 导出** —— 🟡 **一半闭合**：`export_midi` 存在（"只有导入"已不成立），它吃 `genreId`/`pattern`；**编排级** MIDI 导出没有。第一步见 §4.6。
4. **采样器轨/音频轨的真实渲染** —— ✅ **已落地（2026-10-01），且本行此前是错的**：旧文写"sampler 轨**能**渲染（走 GS-1 采样路径），只有 `audio` lane 被跳过"——**前半句是假的** ✗：`GS1_ROUTED_ROLES` 只有 chords/lead，`resolveGs1Patch("audio","sampler")` 返回 `null`，所以 `audio` lane 在改动前**落到 `synthesizePercussion`**，于是**错的声音** ✗ **同时又被报成 skipped** ✗——**报告与 bug 互相印证**，这也解释了这条缺口为何长期看起来"只是少报一个 lane"。**现在**：`sampler` 轨编译出的 `track_id:"audio"` lane 在 `startRendering()` **之前**混进 music bus（因此仍过 master/trim/limiter），每个 note 在自己的 step、按 lane 自己的增益与音高比解码播放（`src/audio/offlineAudioLanes.ts`；`WavExporter.ts` 的 `audioLaneCatalogue`/`onAudioLanes`）。**诚实的分部报告**：渲染成功的进 `renderedAudioLanes` ✓、没渲染的进 `skippedLanes` 带 `reason` ✓，**一条 lane 可同时出现在两处** ✓（真实 MCP server 实测：超出音域的 note 60 即如此，reason 用库自己的话 "the file's regions cover keys 35–59"）。真机读数：有 note 时 `analyze_audio` 给出 peak **−1.30 dBFS** / **−23.58 LUFS** / 能量曲线，且**无 `skippedLanes`** ✓；去掉 note 则全静音**并报 reason** ✓（不是静默 ✗）。判据：`src/test/audioLaneOfflineRender.test.ts`（7 项）+ 重写的 `src/test/skippedLanes.test.ts`（5 项）。**仍未覆盖**：应用内导出（`useExportActions.ts`）尚未传 catalogue，故**在应用里自建 audio lane 再导出仍静音** ✗——已单独派人修（`fix-app-export-audio-lanes`），不计入本行。
5. **SFZ 参数诊断工具** —— ✅ **已建，比点名时更完整**：`inspect_instrument_sfz` 只读地读源地址（失败退到镜像），报 `note_polyphony` / `amplitude_onccN` / `locc`/`hicc` / `one_shot` / `tune` / `tune_cc` / `loop_mode`，并标注值来自 `<group>` 还是 region，而且**不跑音频**（`mcp/sfzInspect.ts:19-25`、`mcp/registry.ts` 该工具）。
6. **渲染进度回调** —— ⛔ **明确不做**。理由不是取舍而是事实：`OfflineAudioContext.startRendering()` 没有回调，且一个 song 到渲染器手里是一个扁平 pattern。替代判据已建：渲染前 `secondsEstimate`、`maxDurationSec` 先拒绝、15 分钟超时后报告是哪个渲染并重置渲染器、`planRenderChunks` 按段落边界切块。详见 §5.5。
7. **批量加音符** —— ✅ **已建**：`add_arrangement_notes`（一次一条轨的全部音符），且回复**前后报音符数**——因为 `addTrackNote` 对 `fx`/`folder` 轨会**静默拒绝**，只报"ok"会正好掩盖这个错误。原始证据就在实现的注释里：4176 次 `add_arrangement_note`、"hours"、`MaxListenersExceededWarning`（`mcp/arrangement.ts:516-527`）。

---

## 示例作品

Muse 的九乐章作品位于 `~/workspace/song_build/devtest-20260930-2/`，**尚未收拢进仓库**。

**决定**：收拢 `.groove`（文本、体积小）与一份制作说明；音频产物不入库（仓库不用二进制堆体积，与 R2 分工一致）。

**执行状态：没有执行，而且在这台机器上执行不了** —— 实测 `ls ~/workspace` → `No such file or directory`，仓库里也**没有任何 `.groove` 文件**（`find . -name "*.groove"` 无命中）。所以这一行是"决定仍在、但源材料不在本机"：🗺 第一步 = 向业主确认那份作品现在在哪里（或从 `docs/` 里任何一份记录它的报告里取回编排 JSON）；拿不到源材料之前，**这一行不能被写成"已完成"**。

---

## 附：这一轮跑过的验证命令

```
npm run check:mcp
  → surface : 85 tools, 7 resources, 4 prompts
  → 🧩 MCP gate: 95 checks passed, 0 failed

node scripts/check_docs.mjs
  → ✅ 4 doc baseline claim(s) hold.

npx vitest run <8 files>   # tempoMap, arrangementPlaybackLength, pdcCombFilter,
                           # realtimePdcWiring, mcpCoverage, mcpCapability,
                           # mcpExamples, prosody
  → 8 passed (8 files) / 38 passed (38 tests)

npx vitest run <11 files>  # trackBuses, trackSends, sidechain, takeComp,
                           # audioLanePlayback, skippedLanes, midiWriter,
                           # musicXmlExport, docsWorkflow, melodyGenerator,
                           # laneSlotsStore
  → 11 passed (11 files) / 70 passed (70 tests)

node scripts/mcp_call.mjs --script   # 无浏览器回路 ×3
  → 9360 ms / 8343 ms / 8707 ms

node scripts/mcp_call.mjs --script   # 渲染 SLO 复测
  → render_preview_clip: 24.98 s（17.18 s 音频，8000 Hz，1 声道）本机负载下冷启动
  → 随后两次: Playwright `page.goto: Timeout 30000ms`（load average 21 / 8 核）
```

**没有验证到的东西，以及为什么**：渲染类 SLO 我没能在本机复测成功（负载 21，Playwright 页面超时），所以那一行的证据是 `docs/MCP.md` 里由 CI 产出的记录值，并且我把本机冷启动 24.98 s 这个反例一并写下；示例作品的源材料不在本机（`~/workspace` 不存在），所以那一行只能是"决定仍在、第一步是取回材料"。

---

## §5.9.1 的第一步：`L_min`（2026-10-01，由文档里那一行要求）

这一行判为 🗺，第一步被写成"**挑一个任务，把它的最短调用序列写成 `L_min`、把一次真实会话的调用次数记成 `L_actual`**"。任务取报告自己点名的那个：**verse / chorus 的听感对比**。

**`L_min` = 6 次调用**（工具名取自真实工具面 `node scripts/mcp_call.mjs --list`，不是凭记忆写的）：

| # | 工具 | 作用 |
| --- | --- | --- |
| 1 | `create_song` | 建歌（genre + bars + clips），产生第一个段落 |
| 2 | `add_section` | 加出第二个段落（verse 与 chorus 要能分别换和声） |
| 3–4 | `apply_chord_progression` | **每段一次**——这是"verse 与 chorus 不同"的唯一来源 |
| 5 | `render_song` | 渲染整首（响度、真峰值、能量曲线随渲染指标一起回来） |
| 6 | `get_loudness_report` | 取响度对比读数 |

**这个数字带着前提，必须一起写下来**：它假设两段的和声差异**已经由 `apply_chord_progression` 表达**、且**一次渲染就够**。任何一条不成立都会往上走：

* 要**分段**渲染以便逐段比较频谱，则 `render_song` 换成按段渲染，`+1~2`；
* 要**频谱指纹**（13 段）而非只比响度，则加 `analyze_audio`，`+1`（若逐段则 `+2`）；
* 要对齐"同一段反复听"的**确定性**，则加一次重复渲染，`+1`。

**`L_actual`：尚未测量，这一条不假装有数。** 测量方式已经明确、且不需要新基础设施：跑一次上面这个任务的真实会话，数它的工具调用次数即可（`scripts/mcp_call.mjs --script` 的步骤数就是现成的计数点）。之所以没有就地填一个数，是因为本会话没有做过这个任务——用一个别的任务的调用数冒充它，正是这份文档一直在避免的那种"看起来像读数"的东西。

**为什么先要这个数**：它是这套指标里唯一**必须由人来定**的一项，其余（响度、真峰值、不重复点、频谱指纹、调性估计、确定性探针、`check:mcp` 的 90 项）都已经有零件。有了 `L_min`，`L_actual / L_min` 才能成为**工具面摩擦**的读数：比值接近 1 说明表面顺，明显大于 1 说明某个能力虽在、却要绕路才能用上。
