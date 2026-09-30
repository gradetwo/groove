# 对 `z2.md` 的逐节裁定（进行中）

`z2.md`（深度评估与重构指南，1167 行）是业主交给本项目的一份外部评估。这份文件是它的**逐节裁定**：每一节要么有**已实现的判据与验证证据**，要么有一条**明确的"不做/分期 + 理由"**。

**状态标记**：✅ 已有判据 + 证据 · 🟡 部分实现，缺口已指名 · ⬜ 尚未裁定

**为什么要有这份文件**：那份评估里混着三类东西——**已经做到的**、**它以为没做到但其实做到了的**、以及**真的缺的**。不区分这三类，就会去做已经存在的工作，也会把"缺的"当成"坏了的"。所以每一行都要落到证据或落到一个决定。

---

## §5 AI 原生核心（MCP 设计）

| 小节 | 它的要求 | 现状 | 证据 / 决定 |
| --- | --- | --- | --- |
| §5.2 三原语布局 | tools / resources / prompts 都要有 | ✅ | 79 个工具、7 个资源、4 个 prompts；`npm run check:mcp` = **90 项检查，0 失败** |
| §5.2.1 读写不对称铁律 | 紧凑记谱供读，结构化参数供写 | 🟡 | 读取侧返回紧凑记谱（`steps`/`pitch`/`gate` 数组）✓；写入侧有 `apply_pattern_ops`、`apply_chord_progression` 接受结构化参数 ✓。**尚缺**：一份把该铁律写成判据的检查（例如"每个读工具的返回都能不出错地喂回对应的写工具"） |
| §5.4 工具矩阵 v3 | 一份提案的完整工具矩阵 | 🟡 | 已按实际使用补齐若干（`apply_chord_progression`、`render_instrument_note`、`import_arrangement_midi`…）。**缺口见 §6 与能力缺口一节** |
| §5.5 闭环（让 Agent 有耳朵） | 渲染 → 听 → 修正 | 🟡 | `analyze_audio`（8kHz 单声道分析通道）、`render_stems`、`render_instrument_note` 已具备；**尚缺**渲染**进度**回调（Muse 在 8 分钟渲染里无法区分"在工作"与"卡住"，已由超时消息部分缓解） |
| §5.9.1 三族指标 | 服从性 / 赋能性 / 质量 + 表达力比 | ⬜ | 未实现。**决定待定**：这是一套评测基座，需要先有稳定的评测集（示例作品）才有意义，见 §4 与"示例作品" |

## §6 演进路线图

| 里程碑 | 它的要求 | 现状 | 证据 / 决定 |
| --- | --- | --- | --- |
| M1 #1 契约版本化 + `groove://changelog` | 元数据 | ✅ | `groove://changelog` 资源存在，`check:mcp` 覆盖 |
| M1 #2 `undo` / opId | 轻量事务日志 | 🟡 | `undo_song` 存在；**opId 未实现** |
| M1 #3 `get_energy_curve` 粗粒度版 | 让 Agent 听见结构 | **不做（已有决定 + 理由）** | **这一条我判错过两次，记录在此。** 先当成缺口、又写了七步实施方案；读到实现才发现**项目早已决定不给它独立工具**，理由写在代码里：*"The curve lives with the metrics rather than behind its own tool: an agent that has rendered a song already has the metrics; one more call to read a curve it could have had for free would be the token economy this project keeps refusing"*（`mcp/render/worker.ts`，`energyCurveDb` 调用点旁）。曲线**随渲染指标返回**（`mcp/registry.ts:1235` 组装 `analysis` 并交给 `renderAudio`），`sampleRate: 8000` 的分析通道把开销压到约五分之一。另：窗口是**一秒**且刻意与 bpm 无关（`perWindow = Math.floor(sampleRate)`），这否掉了我方案里"默认 50 ms"的假设。 |
| M1 #4 `style_ref` + 示例库 | 每曲风 2–4 个核心角色示例 | 🟡 | `compose_with_examples` / `get_example` 存在（`check_mcp` 校验示例 pattern 能通过 `validate_pattern`）；**示例库规模未核** |
| M1 #5 和声层最小集 | `set_chord_progression` + `suggest_progression` | ✅ | `suggest_progression`（读取）+ **`apply_chord_progression`**（写入，本会话实现，10 条判据 + 协议级检查）。命名用 `apply_` 而非 `set_`：本仓库要求以写入动词开头的工具声明 `readOnly: false`，而它是纯变换 |
| M1 #6 旋律 + 声律校验 | `generate_melody` + `validate_prosody` | ✅ | 两者都在；`check_mcp` 的 90 项里覆盖，含"给了声调必须真的用上"（曾漏传 `tones`，已修） |
| M1 关键技巧：分析专用降采样 | 8kHz 单声道 | ✅ | `RenderOptions.sampleRate/channels` 已实现并用于分析 |
| M1 验收：一分钟闭环 ≤90s | 生成→自检→修正→导出 | ⬜ | 未建立基准测量。**决定**：等 §5.9.1 的评测集落地后再立基准，否则测的是空场景 |
| 渲染 SLO 表 | 能量曲线 ≤1s / 段落 ≤5s / 全曲 ≤20s | ⬜ | 未测。**注**：本会话实测到的是**反向**证据——一次九乐章制作里单乐章（456–2822 音符）渲染需 3–8 分钟，远超声称的 20s。**决定**：SLO 需要重定，或先明确"全曲 ≤20s"针对的规模 |
| Phase 0 引擎下沉 | headless core、Schema v2、RenderTarget 抽象、golden render | 🟡 | 渲染已在 headless 路径上运行（`mcp/render/worker.ts` 通过 Vite + Chromium 驱动真实 `renderPatternOffline`），`RenderOptions` 已能切采样率/声道；**Schema v2 与 golden render 未做** |

## §2 对标 Logic Pro（多轨编辑）

| 小节 | 现状 | 证据 / 决定 |
| --- | --- | --- |
| §2.1 轨道架构 | 🟡 | 编排支持 instrument / sampler / drumkit / fx / folder 与第九种 `audio`；`add_lane` 的合法类型清单已改为**从别名表派生** |
| §2.2 时间线与片段 | 🟡 | 有 section / take / lane / region；`add_section`/`duplicate_section` 的长度上限已改为**从 `MAX_BARS`(128) 派生**（此前写死 64） |
| §2.3 音频编辑与弹性处理 | ⬜ | 未做。**决定**：分期——它依赖音频轨的真实渲染，见下 |
| §2.4 全局轨道与宏观控制 | ⬜ | 未裁定 |
| §2.5 混音台与信号路由 | 🟡 | 有每轨增益/声像与 master；**缺**完整的 Mixer 视图（Phase 2） |
| §2.6 自动化控制 | ⬜ | 未裁定 |
| §2.7 MIDI 效果与表现力 | 🟡 | 力度、时值、`note_polyphony`、`amplitude_onccN` 均已实测；**缺**琶音器/量化等 MIDI 效果 |
| §2.8 调度、延迟与渲染质量 | 🟡 | 有延迟表与 PDC 双域策略记录 |
| §2.8.1 PDC 落地 | 🟡 | 策略已文档化；端到端验证未做 |

## §3 专业 DAW 视角（功能缺口）

| 小节 | 现状 | 证据 / 决定 |
| --- | --- | --- |
| §3.1 音频处理层 | ⬜ | 未裁定 |
| §3.2 效果器生态 | 🟡 | 有 fx 轨与内置效果；**缺**第三方/插件式扩展 |
| §3.3 外部硬件与 I/O | ⬜ | **决定：不做**——纯浏览器产品，MIDI 输入设备的真实世界差异无法在 CI 中验证；已有的键盘/钢琴卷帘输入已覆盖测试路径 |
| §3.4 工程管理与协作 | 🟡 | `.groove` 导入导出、版本化、mirror；**缺**多人协作（**决定：不做**，与"零安装单机创作"的定位冲突） |

## §4 完整歌曲工业化流程

| 小节 | 现状 | 证据 / 决定 |
| --- | --- | --- |
| §4.1 词曲与和声层 | 🟡 | 和声读取 + 写入已闭环（见 M1 #5）；**缺**歌词层工具 |
| §4.1.1 旋律写作与声律校验 | ✅ | `generate_melody`（含声调修正）+ `validate_prosody`，判据覆盖"声调必须被使用" |
| §4.2 编曲 | 🟡 | 编排/段落/片段已具备；**缺** tempo map 的**编排侧**支持（Muse 因九个乐章 BPM 不同而被迫分九个编排渲染）与拍号 |
| §4.3 录音与人声（双路径） | 🟡 | 有 `synthesize_vocal`；**缺**真实录音路径与 SVS 桥接（§4.3.1 的数据交换标准未做） |
| §4.4 混音 | 🟡 | 见 §2.5 |
| §4.5 母带处理 | 🟡 | 有响度归一与真峰值测量（`measureLoudness`、`truePeakDbChannels`）；**缺**完整母带链 |
| §4.6 发行与导出 | 🟡 | WAV/MP3/stems/`.groove`/Ableton 导出齐备；**缺** MIDI 导出（只有 `import_arrangement_midi`）——Muse 不得不自写 MIDI 生成器 |

---

## 一条被撤回的方案（留作示范）

上一版这里写着 `get_energy_curve` 的**七步实施方案**，钉好了行号与判据，看起来正是"可直接执行"。**它已删除，因为读实现时发现这条本来就不该做**：曲线随渲染指标返回是项目**已经做过的决定**，理由（再多一次往返就是浪费 token）就写在调用点旁边。

留这一段而不是悄悄删掉，是因为这个错误比它看起来更有教益：**我连续两轮把"文档说缺"当成"确实缺"**，还为一个不该存在的工具写了详尽的落地步骤——**方案写得越具体，越容易让人不去问"这件事该不该做"**。裁定文件要区分的第四类东西就是这个：**不该做的，且已有理由**。

## 能力缺口（Muse 一手使用中点名，按价值排序）

1. **编排侧 tempo map** —— 九个乐章 BPM 各异（66–168），当前只能拆成九个编排分别渲染再外部拼接；一个 `set_tempo_map` 即可省掉整条绕路（`set_tempo` 只作用于 song 层）。
2. **拍号（time signature）** —— 3/4、6/8 现在只能按拍手工换算（`ceil(bars × beatsPerBar / 4)`）。
3. **MIDI 导出** —— 只有导入。外部 DAW 协作需要它。
4. **采样器轨的真实渲染** —— `render_arrangement` 对 audio/sampler 轨直接 `skippedTracks`（"an audio lane has no notes to schedule"），真实 SFZ 采样必须绕浏览器自研链路再外部混音。
5. **SFZ 参数诊断工具** —— `note_polyphony`、`amplitude_onccN`、`one_shot`、choke、`tune_cc` 已实测但**无法从 MCP 查看**某个 SFZ 的这些取值。
6. **渲染进度回调** —— 8 分钟渲染无输出；超时消息只解决了"最终会报错"，没解决"过程中可观测"。
7. **批量加音符** —— 2822 个音符逐个 `add_arrangement_note` 需 10+ 分钟，并触发 `MaxListenersExceededWarning`。

## 示例作品

Muse 的九乐章作品（9/9 真实 SFZ 分轨渲染，动态范围 22 dB；5/9 MCP synth 层因上述渲染 worker 缺陷缺失）位于 `~/workspace/song_build/devtest-20260930-2/`，**尚未收拢进仓库**。

**决定**：收拢 `.groove`（文本、体积小）与一份制作说明；音频产物不入库（仓库不用二进制堆体积，与 R2 分工一致）。
