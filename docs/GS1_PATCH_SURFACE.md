# GS-1 音色设计能不能从 MCP 写？（裁定：**已闭合** —— 复用 synth 自己的 share code）

> 前一份调查（分支 `feat-gs1-assessment`，同一文件）对着代码验过一条作曲者的报告，结论是"缺口真实，但已裁定过"，并给了 §6「不实施」和 §7「第一步」。
> 随后业主说：**"GS-1 暴露这块，synth 原本库会有 mcp 功能，看看能不能复用或者拿过来改造下"** —— synth 自己有完整的 patch MCP。本次就是回答这句话，并且已经落地。
>
> **旧结论被取代的部分**：§6 曾列出的两条成本理由——"需要一个新的补丁模型字段"与"需要在我们的模型与 GS-1 参数空间之间做语义映射"——都因为**复用 synth 自己的 share code** 而不存在了。补丁是**一个不透明字符串**（不是我们发明的结构），字段是 `SequencerTrack.gs1Patch`（不是新模型），校验用 synth 自己的可解码性（不是第二套规则）。剩下的一条——**双解析缝**——是真的，也是本次的主要工作，现在已被单一缝取代。

## 一句话结论

引擎**确实**是一台可打补丁的 GS-1；补丁现在**可以从调用者一路走到渲染出的音频**：synth 的 `gs1.patch.get` 产出 `gs1.1.…` **share code**，`apply_gs1_patch` 把它存在**轨道**上，`resolveGs1Lane`（唯一解析点）把它变成参数与路由，离线渲染、实时播放、`validate_pattern` 三处**读同一个决议**。读不懂的 code **报错并指名轨道**，绝不静默换音色。

## 1. 引擎这一半（与前一份一致，仍然为真）

| 事实 | 证据 |
| --- | --- |
| MCP 渲染驱动的是应用自己的 `renderPatternOffline`，没有第二个渲染器 | `mcp/render/worker.ts:4`、`:274` |
| host 有单参数与整补丁写入 | `src/audio/gs1/Gs1Host.ts:184`（`setParam`）、`:188`（`setPatch`） |
| 参数面是声明式的：id、范围、默认值 | `vendor/gs1/src/audio/params.ts:1092`（`DEFAULT_PARAMS`，224 项）、`:1453`（`PARAM_SPECS`，84 项带标签）、worklet 的 `PARAMS`（224 项，**浏览器真正服务的范围**） |

## 2. 补丁从哪来（本次改变的地方）

| 事实 | 证据 |
| --- | --- |
| 具名预设仍是一张手写固定表，**默认路径不变** | `src/data/gs1Patches.ts:100`（`GS1_PATCHES`）、`:816`（`resolveGs1Patch`） |
| **新增**：一条轨道可以带自己的 GS-1 补丁，形式是 synth 的 share code | `src/types/genre.ts`（`SequencerTrack.gs1Patch?: string`） |
| 调用者用它：`apply_gs1_patch` 存/清，校验后才写入 | `mcp/registry.ts`（工具 `apply_gs1_patch`），`mcp/pattern.ts:validatePattern` |
| 协议边界把它当**字符串**检查，内容留给解析点 | `mcp/registry.ts`（`patternSchema.tracks[].gs1Patch`） |

**为什么是 share code 而不是结构化的补丁对象。** synth 的 `gs1.patch.get` 返回的就是这个字符串（"a share code plus the decoded payload"），`gs1.patch.set` / `gs1.render` 也接受它（`mcp/tools/patch.mjs`、`mcp/tools/patch-set.mjs`）。它的负载是 `gs1.1.` + base64url(JSON `{s, v, r, p2?}`)，`v` 按参数 id 升序逐项存值——**格式是 synth 定义的**。我们做的是**读**它，不是再定义一遍。

**为什么没有直接 vendor `src/state/share.ts`。** 它 import `src/state/persist.ts`（取 `SCHEMA_VERSION`）与 `src/midi/takes.ts`，把它加进 `scripts/sync-gs1.mjs` 的 `VENDORED_FILES` 会把 synth 应用的另外半棵子树拖进 `vendor/gs1/`，并破坏"一文件一哈希"的 pin。可复用的是**格式**，而参数表已经逐字节 vendored（`vendor/gs1/UPSTREAM.json`，`params.ts` 与 synth HEAD 逐字节相同）。所以读取器是 `src/audio/gs1/gs1PatchCode.ts`：它逐条对齐 `share.ts` 的 `parsePayload`。

## 3. 单点解析缝（本次的核心工作）

旧文指出的真问题：导出侧解析**两次**——`WavExporter.ts:537` 建 host 用一次，`planGs1Notes` 内部再解析一次。只到达一处覆盖值时，写出的文件会与 `setPatch` 收到的补丁不一致（"第二个声音"）。

现在的形状：

| 位置 | 作用 |
| --- | --- |
| `src/audio/gs1/gs1Tracks.ts` 的 `resolveGs1Lane(role, instrument, genreId, patchCode)` | **唯一**把"一条轨道 + 可选 share code"变成 `Gs1Voice`（`params` / `routes` / `velToCutoff` / `code`）或 `problem` 的函数 |
| `planGs1Notes({…, voice})` | 接受**已经解析好的 `Gs1Voice` 对象**；导出器把建 host 用的**同一个对象**交给它（`WavExporter.ts` 的 `gs1Voices` Map），所以两者在构造上不可能分叉 |
| `Gs1VoicePool.tryPlay(…, patchCode)` | 实时播放也走 `resolveGs1Lane`；`AudioEngine.ts` 三处调用把 `track.gs1Patch` 传进来 |
| `applyGs1VoiceRoutes(host, voice)` | code 自带的路由（`r`）与表补丁的 velocity 响应，只有一个写入点 |

判据：`src/test/gs1PatchPassthrough.test.ts` ——

* 一条带合法 code 的轨道**渲染**，且**实测**与同一轨道用表补丁的结果不同：把导出器交给 host 的参数喂给**vendored WASM core 本体**，用仓库自己的 13 段 timbre 指纹量。实测 **fingerprint distance 4.78 dB、centroid 869 → 1287 Hz（×1.48）**，阈值取 3 dB / ×1.25；两个参数集都非静音。
* **第二条**判据（单点缝）：`planned.params` 与 host 用的 `voice.params` 是**同一个对象**（`toBe`，不是 `toEqual`），而**不带 code 的独立解析**会得到 `warmPad` 这个**不同**的 record；同一文件还断言"房间与文件为同一条带 code 的轨道压入**完全相同**的 `setPatch` 负载"。
* 若哪天导出器只把 code 给了建 host、没把 `voice` 交给 planner，第二条测试就会红——注释里写明了这一点。

## 4. 校验不撒谎（本次的另一半）

旧文点名：`resolveGs1Patch` 是全函数，未知乐器名**静默回落到原生引擎**（`gs1Patches.ts:816-843` 的注释还称其为 "the safe answer"），所以打错一个字得到的是另一台合成器。现在：

* `decodeGs1PatchCode` 对**读不懂的** code 给出具体原因：前缀不是 `gs1.1.`、base64url 非法、JSON 非法、缺 `v`、schema 比本构建新、**带第二层（`p2`）**。
* `resolveGs1Lane` 对**带 code 但无法播放**的轨道返回 `problem`：code 读不懂，或该轨道的角色（kick/bass/audio…）根本不被 GS-1 调度——一个"有补丁但永远不会响"的轨道也是问题，不是静音。
* 三处**都报**：
  * `validate_pattern` → `problems` 里一条**指名轨道**的条目（`track "chords" carries a GS-1 patch that cannot be played: …`）；
  * `render_audio` → 结果里的 `gs1PatchProblems`（`mcp/render/worker.ts` 的 `RenderResult`），同时 `console.warn`；
  * 实时 → `Gs1VoicePool.status()` 的 `patchProblems` 与一次 `console.warn`。
* `apply_gs1_patch` **拒绝写入**读不懂的 code（`isError`，消息含轨道名），所以坏 code 到不了渲染阶段。

**故意不校验的东西，以及支持这个决定的测量。** 不按 `PARAM_SPECS` 检查取值范围。`PARAM_SPECS` 只覆盖 224 个参数中的 **84** 个，而且在重叠处它比 worklet 实际服务的范围**更窄**。把全部 91 个工厂预设用 synth 自己的 `presetShareCode` 编码再解码后统计：恰好有一个值越界——`phonk` 的 `osc2Pitch = 31`，而 `PARAM_SPECS` 声明 ±24、worklet 实际服务 ±48。也就是说，对着 `PARAM_SPECS` 写范围校验会**拒掉 synth 自己产出的工厂预设**。浏览器 `AudioParam` 的钳制与 synth 内部一致，所以诚实的校验就是 upstream 做的那一种：**这段 code 能不能解码**。

## 5. 旧文 §5 的假声明（仍在，未改）

帮助文案仍声称可以导出 "GS1 patch"（`src/i18n/locales/help.ts:74`、`src/data/tutorialCourses.ts:200`、`src/components/help/HelpCenterModal.tsx:308`），而导出菜单里没有第七项。**本次仍未改**：改为哪种表述是产品决定。现在这句话**更接近可行**了（code 可以在 synth 里生成、在 groove 里落到轨道上），但"从 groove 导出 `.gs1.json` 补丁文件"这个动作仍然不存在。

## 6. 本次的决定

**实施**（与旧文的「不实施」相反），范围是"**一个不透明的 share code，一个解析缝**"。旧文 §6 的两条理由被取代：

| 旧理由 | 现在 |
| --- | --- |
| "需要一个新的补丁模型 + 它住在哪" | 不需要新模型：`SequencerTrack.gs1Patch` 是附加字段，`instrument` 旁边，随现有 JSON 路径走 |
| "需要语义映射（哪些参数属于哪一族、什么默认值安全）" | 不需要映射：code 是 synth 自己的格式，我们不解释它的语义，只在**一个**地方解码成 `setPatch` 要的 record |
| "需要一个单点解析缝" | **这条成立，并且是本次的工作** —— 见 §3 |
| "需要一个应用界面"（tool-only feature 的镜像） | **仍未解决，见 §7** |
| "持久化（`instrument` 所在的 v1 pattern 是版本化模型）" | 字段是附加的：没有版本号跳变，旧文件照读；新文件里没有该字段就是"用表补丁"。**工程存档（`GrooveProject.patterns`，`projectDb.ts`）存的是完整 pattern，所以补丁随项目保存/复制**；唯一丢字段的是分享链接，见 §7.1 |
| "参数校验" | 不按 `PARAM_SPECS` 做范围校验，理由与测量见 §4 |

**仍然不做的**：**逐参数编辑器**。业主现在有一条更短的路径拿到精细音色——在 synth 里用 `gs1.patch.set` 调好、`gs1.patch.get` 拿码、`apply_gs1_patch` 存到轨道。groove 侧不重复实现振荡器/滤波/包络的 UI 或参数模型。

## 7. 还没有做 / 还需要业主决定的（staged，说清楚）

1. **share link / QR 不携带 `gs1Patch`。** `src/audio/SequencerUrlShare.ts:65` 的 `toSharedTrack` 是显式白名单，`SharedSequencerState.tracks[]` 也没有这个字段；`ProjectHubModal.tsx` 与 `useExportActions.ts` 两个分享入口都经过它。后果：**一条带自定义补丁的轨道分享出去，对方听到的是表补丁**——正是这个仓库最讨厌的那类静默差异。没有顺手加的原因：这是**另一个有损编解码面**，有自己的体积上限、"字段要进紧凑 payload"的规则与 `shareTrackFidelity.test.ts` 的白名单断言；它值得一个独立的小改动（加字段、加编码、加一条"带 code 的轨道往返"判据），而不是塞进本次的解析缝改动里。**决定：记录，不半接。**
2. **没有 UI 能看到/编辑 `gs1Patch`。** MCP 会写一份界面上不可见的状态，这是跨阶段原则 1（No UI-only Features）的镜像（tool-only feature）。是否值得给轨道加一个只读的 "GS-1 patch" 徽章/输入框，是产品决定。
3. **`TrackV2`（编排模型）没有补丁字段。** 补丁住在**pattern 的 tracks** 上（`arrangementCompile` 从 clip 的 pattern 编译），所以 `render_audio`、`create_song` 的 clip、`render_song` 的 flatten 都能拿到它；但"在编排轨道列表上直接指定一个补丁"还没有入口。
4. **`gs1.2.`（deflate）code 不支持**，并明确报错；工厂补丁码不会用它（只有带整曲的 code 才会）。
5. **带第二层（`p2`）的 code 被拒绝**：`Gs1Host` 是一个实例，第二层会被静默丢弃，所以拒绝才是诚实的。

## 8. `apply_gs1_patch` 今天到底接受哪些参数（逐条清单，不是概述）

**一句话**：它接受**一个不透明的 `gs1.1.` share code**（或 `null` 清除），**不接受任何单个参数**。所以"逐参数写入未暴露"这条报告**成立**，而且这个缺口是**已被裁定**的（§7「仍然不做的：逐参数编辑器」）；本节把"到底有多少、是哪些"变成清单。

**工具今天接受的东西，就这些**（`mcp/registry.ts:1284-1295`）：

| 入参 | 是什么 | 与音色参数的关系 |
| --- | --- | --- |
| `genreId` / `pattern` | 起点（二选一） | 无 |
| `track` | 轨道（laneId 优先，其次 kind） | 无 |
| `patch` | `"gs1.1.…"` 字符串，或 `null` | **唯一**的音色入口：整个参数向量 + 路由，装在一个字符串里 |

**一个 code 里能装多少参数**（`src/audio/gs1/gs1PatchCode.ts`）：

| 事实 | 数字 | 位置 |
| --- | --- | --- |
| share code 的 `v` 向量按 id 升序覆盖 `DEFAULT_PARAMS` 的**全部**参数 | **224** | `gs1PatchCode.ts:76`（`PARAM_IDS`）、`:143-155`（逐项填入） |
| 这些参数里有 `PARAM_SPECS` 定义（标签 + 范围 + 默认 + 单位）的 | **84** | `vendor/gs1/src/audio/params.ts:1453` |
| 只有 `Param` 枚举名与默认值、**没有声明范围**的 | **140** | `vendor/gs1/src/audio/params.ts:1137` 减去上面那 84 |
| code 自带的调制路由 `r`（`src`/`dst`/`amount`/`enabled`） | 单独一段，只有整码能写 | `gs1PatchCode.ts:157-172` |
| 读不懂就拒绝的形状 | 前缀非 `gs1.1.`、`gs1.2.`、base64url/JSON 非法、缺 `v`、schema > 4、带第二层 `p2`、值非有限、路由畸形 | `gs1PatchCode.ts:101-141` |

**引擎那一侧本来就有逐参数写入**（所以缺的是"暴露"，不是能力）：

| 层 | 逐参数 API | 位置 |
| --- | --- | --- |
| 本仓库的 host 包装 | `setParam(id, value)`、`setPatch(values)`、`setModRoute(index, src, dst, amount, enabled)` | `src/audio/gs1/Gs1Host.ts:184`、`:188`、`:196` |
| vendored 引擎 | `setParam(id, value, immediate?)`、`setParamsB`、`setRoute(index, route)` | `vendor/gs1/src/audio/engine.ts:496`、`:651`、`:661` |
| 本仓库的具名预设 | `GS1_PATCHES`，**19** 个名字（`warmPad`…`sampleSurface`） | `src/data/gs1Patches.ts:67`、`:100` |
| 具名预设怎么到达轨道 | **只能**经乐器名映射 `resolveGs1Patch`，MCP 里没有任何工具按预设名写入 | `src/data/gs1Patches.ts:816` |

**缺口清单（这就是"missing list"）**：

1. **逐参数写入：224 个里 0 个可单独写**，224 个都只能随整码写入。没有任何参数名、参数 id、取值或单条路由是工具入参。
2. **可命名的只有 84 个**（有标签与声明范围）；另外 **140 个**（开关、波形/类型选择、LFO 目标、`TEMPO`、FX 链序、6 槽 graph 路由、4 槽调制矩阵 `FX_MOD1..4`、过采样覆盖 `FX_OVR*`）在 vendored 表里**只有枚举名与默认值，没有范围**。一个按名字写的工具对这 140 个没有可依据的范围。
3. **调制路由：0 条可单独写**（只有整码的 `r`）。
4. **19 个具名预设：0 个可按名写**（只能间接经 `instrument` 名）。

**下面这 224 行是生成的**，命令：

```bash
npx vite-node scripts/report_gs1_params.ts   # 读 vendor/gs1/src/audio/params.ts，逐条打印
```

| id | `Param` 枚举名 | PARAM_SPECS | label | min | max | default |
| ---: | --- | :---: | --- | ---: | ---: | ---: |
| 0 | `MASTER_VOLUME` | ✅ | VOLUME | 0 | 1 | 0.75 |
| 1 | `OSC1_ON` | — | | | | 1 |
| 2 | `OSC1_WAVE` | — | | | | 2 |
| 3 | `OSC1_PITCH` | ✅ | PITCH | -24 | 24 | 0 |
| 4 | `OSC1_DETUNE` | ✅ | DETUNE | -50 | 50 | 0 |
| 5 | `OSC1_LEVEL` | ✅ | LEVEL | 0 | 1 | 0.65 |
| 6 | `OSC1_PW` | ✅ | PW | 0.05 | 0.95 | 0.5 |
| 7 | `OSC2_ON` | — | | | | 1 |
| 8 | `OSC2_WAVE` | — | | | | 2 |
| 9 | `OSC2_PITCH` | ✅ | PITCH | -24 | 24 | 0 |
| 10 | `OSC2_DETUNE` | ✅ | DETUNE | -50 | 50 | 0 |
| 11 | `OSC2_LEVEL` | ✅ | LEVEL | 0 | 1 | 0.55 |
| 12 | `OSC2_PW` | ✅ | PW | 0.05 | 0.95 | 0.5 |
| 13 | `FILTER_TYPE` | — | | | | 0 |
| 14 | `FILTER_CUTOFF` | ✅ | CUTOFF | 40 | 18000 | 9000 |
| 15 | `FILTER_RES` | ✅ | RES | 0 | 1 | 0.25 |
| 16 | `FILTER_DRIVE` | ✅ | DRIVE | 0 | 1 | 0.15 |
| 17 | `FILTER_ENV_AMT` | ✅ | ENV AMT | 0 | 1 | 0.5 |
| 18 | `FILTER_KBD` | — | | | | 1 |
| 19 | `ENV_ATTACK` | ✅ | ATTACK | 0.0005 | 8 | 0.003 |
| 20 | `ENV_DECAY` | ✅ | DECAY | 0.001 | 12 | 0.16 |
| 21 | `ENV_SUSTAIN` | ✅ | SUSTAIN | 0 | 1 | 0.55 |
| 22 | `ENV_RELEASE` | ✅ | RELEASE | 0.005 | 16 | 0.28 |
| 23 | `LFO_ON` | — | | | | 1 |
| 24 | `LFO_WAVE` | — | | | | 0 |
| 25 | `LFO_RATE` | ✅ | RATE | 0.02 | 40 | 4.6 |
| 26 | `LFO_DEPTH` | ✅ | DEPTH | 0 | 1 | 0.32 |
| 27 | `LFO_TARGET` | — | | | | 0 |
| 28 | `LFO_SYNC` | — | | | | 0 |
| 29 | `FX_REVERB_ON` | — | | | | 1 |
| 30 | `FX_REVERB_SIZE` | ✅ | SIZE | 0 | 1 | 0.45 |
| 31 | `FX_REVERB_MIX` | ✅ | MIX | 0 | 1 | 0.25 |
| 32 | `FX_DELAY_ON` | — | | | | 0 |
| 33 | `FX_DELAY_SYNC` | — | | | | 2 |
| 34 | `FX_DELAY_FB` | ✅ | FDBK | 0 | 0.9 | 0.35 |
| 35 | `FX_DELAY_MIX` | ✅ | MIX | 0 | 1 | 0.22 |
| 36 | `GLIDE` | ✅ | GLIDE | 0 | 1 | 0 |
| 37 | `TEMPO` | — | | | | 120 |
| 38 | `PITCH_BEND_RANGE` | — | | | | 2 |
| 39 | `OSC1_PAN` | ✅ | PAN | -1 | 1 | 0 |
| 40 | `OSC2_PAN` | ✅ | PAN | -1 | 1 | 0 |
| 41 | `MASTER_TUNE` | — | | | | 0 |
| 42 | `VOICE_MODE` | — | | | | 0 |
| 43 | `FX_CHORUS_ON` | — | | | | 0 |
| 44 | `FX_CHORUS_DEPTH` | ✅ | DEPTH | 0 | 1 | 0.5 |
| 45 | `FX_CHORUS_RATE` | ✅ | RATE | 0.02 | 10 | 0.6 |
| 46 | `FX_CHORUS_MIX` | ✅ | MIX | 0 | 1 | 0.4 |
| 47 | `FX_FLANGER_ON` | — | | | | 0 |
| 48 | `FX_FLANGER_RATE` | ✅ | RATE | 0.02 | 10 | 0.3 |
| 49 | `FX_FLANGER_FB` | ✅ | FDBK | 0 | 0.95 | 0.5 |
| 50 | `FX_FLANGER_MIX` | ✅ | MIX | 0 | 1 | 0.4 |
| 51 | `FX_PHASER_ON` | — | | | | 0 |
| 52 | `FX_PHASER_RATE` | ✅ | RATE | 0.02 | 10 | 0.4 |
| 53 | `FX_PHASER_FB` | ✅ | FDBK | 0 | 0.95 | 0.6 |
| 54 | `FX_PHASER_MIX` | ✅ | MIX | 0 | 1 | 0.5 |
| 55 | `FX_DRIVE_ON` | — | | | | 0 |
| 56 | `FX_DRIVE_AMT` | ✅ | DRIVE | 0 | 1 | 0.4 |
| 57 | `FX_DRIVE_MIX` | ✅ | MIX | 0 | 1 | 0.6 |
| 58 | `FILTER_ENV_ATTACK` | ✅ | ATTACK | 0.0005 | 8 | 0.01 |
| 59 | `FILTER_ENV_DECAY` | ✅ | DECAY | 0.001 | 12 | 0.3 |
| 60 | `FILTER_ENV_SUSTAIN` | ✅ | SUSTAIN | 0 | 1 | 0.5 |
| 61 | `FILTER_ENV_RELEASE` | ✅ | RELEASE | 0.005 | 16 | 0.3 |
| 62 | `LFO2_ON` | — | | | | 0 |
| 63 | `LFO2_WAVE` | — | | | | 1 |
| 64 | `LFO2_RATE` | ✅ | RATE | 0.02 | 40 | 0.5 |
| 65 | `LFO2_DEPTH` | ✅ | DEPTH | 0 | 1 | 0.3 |
| 66 | `LFO2_TARGET` | — | | | | 0 |
| 67 | `FX_REVERB_DAMP` | ✅ | DAMP | 0 | 1 | 0.35 |
| 68 | `FX_REVERB_WIDTH` | ✅ | WIDTH | 0 | 1 | 0.8 |
| 69 | `FX_REVERB_PREDELAY` | ✅ | PRE | 0 | 0.1 | 0.012 |
| 70 | `OSC1_UNISON` | ✅ | UNI | 1 | 7 | 1 |
| 71 | `OSC1_SPREAD` | ✅ | SPREAD | 0 | 1 | 0.35 |
| 72 | `OSC2_UNISON` | ✅ | UNI | 1 | 7 | 1 |
| 73 | `OSC2_SPREAD` | ✅ | SPREAD | 0 | 1 | 0.35 |
| 74 | `LFO_RETRIG` | — | | | | 0 |
| 75 | `LFO_ONESHOT` | — | | | | 0 |
| 76 | `LFO2_RETRIG` | — | | | | 0 |
| 77 | `LFO2_ONESHOT` | — | | | | 0 |
| 78 | `PATCH_GAIN` | — | | | | 1 |
| 79 | `WT_USER` | — | | | | 0 |
| 80 | `FX_DELAY_DAMP` | ✅ | DAMP | 0 | 1 | 0.35 |
| 81 | `FX_DELAY_PINGPONG` | — | | | | 0 |
| 82 | `FX_CHAIN1` | — | | | | 1 |
| 83 | `FX_CHAIN2` | — | | | | 2 |
| 84 | `FX_CHAIN3` | — | | | | 3 |
| 85 | `FX_CHAIN4` | — | | | | 4 |
| 86 | `FX_CHAIN5` | — | | | | 5 |
| 87 | `FX_CHAIN6` | — | | | | 6 |
| 88 | `FX_PARALLEL1` | — | | | | 0 |
| 89 | `FX_PARALLEL2` | — | | | | 0 |
| 90 | `FX_PARALLEL3` | — | | | | 0 |
| 91 | `FX_PARALLEL4` | — | | | | 0 |
| 92 | `FX_PARALLEL5` | — | | | | 0 |
| 93 | `FX_PARALLEL6` | — | | | | 0 |
| 94 | `FX_REVERB_MODE` | — | | | | 0 |
| 95 | `FX_CONV_TRIM` | ✅ | TRIM | 0 | 4 | 1 |
| 96 | `SMP_ROOT` | ✅ | ROOT | 0 | 127 | 60 |
| 97 | `SMP_MODE` | — | | | | 0 |
| 98 | `SMP_LOOP_START` | ✅ | LOOP A | 0 | 1 | 0 |
| 99 | `SMP_LOOP_END` | ✅ | LOOP B | 0 | 1 | 1 |
| 100 | `FX_GRAPH` | — | | | | 0 |
| 101 | `FX_NODE1_IN1` | — | | | | 1 |
| 102 | `FX_NODE2_IN1` | — | | | | 2 |
| 103 | `FX_NODE3_IN1` | — | | | | 3 |
| 104 | `FX_NODE4_IN1` | — | | | | 4 |
| 105 | `FX_NODE5_IN1` | — | | | | 5 |
| 106 | `FX_NODE6_IN1` | — | | | | 6 |
| 107 | `FX_NODE1_IN1_GAIN` | — | | | | 1 |
| 108 | `FX_NODE2_IN1_GAIN` | — | | | | 1 |
| 109 | `FX_NODE3_IN1_GAIN` | — | | | | 1 |
| 110 | `FX_NODE4_IN1_GAIN` | — | | | | 1 |
| 111 | `FX_NODE5_IN1_GAIN` | — | | | | 1 |
| 112 | `FX_NODE6_IN1_GAIN` | — | | | | 1 |
| 113 | `FX_NODE1_IN2` | — | | | | 0 |
| 114 | `FX_NODE2_IN2` | — | | | | 0 |
| 115 | `FX_NODE3_IN2` | — | | | | 0 |
| 116 | `FX_NODE4_IN2` | — | | | | 0 |
| 117 | `FX_NODE5_IN2` | — | | | | 0 |
| 118 | `FX_NODE6_IN2` | — | | | | 0 |
| 119 | `FX_NODE1_IN2_GAIN` | — | | | | 1 |
| 120 | `FX_NODE2_IN2_GAIN` | — | | | | 1 |
| 121 | `FX_NODE3_IN2_GAIN` | — | | | | 1 |
| 122 | `FX_NODE4_IN2_GAIN` | — | | | | 1 |
| 123 | `FX_NODE5_IN2_GAIN` | — | | | | 1 |
| 124 | `FX_NODE6_IN2_GAIN` | — | | | | 1 |
| 125 | `FX_NODE1_TO_OUT` | — | | | | 0 |
| 126 | `FX_NODE2_TO_OUT` | — | | | | 0 |
| 127 | `FX_NODE3_TO_OUT` | — | | | | 0 |
| 128 | `FX_NODE4_TO_OUT` | — | | | | 0 |
| 129 | `FX_NODE5_TO_OUT` | — | | | | 0 |
| 130 | `FX_NODE6_TO_OUT` | — | | | | 1 |
| 131 | `FX_NODE1_OUT_GAIN` | — | | | | 1 |
| 132 | `FX_NODE2_OUT_GAIN` | — | | | | 1 |
| 133 | `FX_NODE3_OUT_GAIN` | — | | | | 1 |
| 134 | `FX_NODE4_OUT_GAIN` | — | | | | 1 |
| 135 | `FX_NODE5_OUT_GAIN` | — | | | | 1 |
| 136 | `FX_NODE6_OUT_GAIN` | — | | | | 1 |
| 137 | `OSC_FM` | ✅ | FM | 0 | 1 | 0 |
| 138 | `OSC_RING` | ✅ | RING | 0 | 1 | 0 |
| 139 | `OSC1_SYNC` | ✅ | SYNC | 0 | 1 | 0 |
| 140 | `OSC1_SUB` | ✅ | SUB | 0 | 2 | 0 |
| 141 | `OSC1_SUB_LEVEL` | ✅ | SUB LVL | 0 | 1 | 0.4 |
| 142 | `OSC2_SUB` | ✅ | SUB | 0 | 2 | 0 |
| 143 | `OSC2_SUB_LEVEL` | ✅ | SUB LVL | 0 | 1 | 0.4 |
| 144 | `NOISE_MIX` | ✅ | NOISE | 0 | 1 | 0 |
| 145 | `FILTER_MORPH` | ✅ | MORPH | 0 | 1 | 0 |
| 146 | `FILTER_ROUTING` | — | | | | 0 |
| 147 | `FILTER2_TYPE` | — | | | | 0 |
| 148 | `FILTER2_CUTOFF` | ✅ | CUTOFF 2 | 40 | 18000 | 9000 |
| 149 | `FILTER2_RES` | ✅ | RES 2 | 0 | 1 | 0.25 |
| 150 | `FILTER2_DRIVE` | ✅ | DRIVE 2 | 0 | 1 | 0.15 |
| 151 | `FILTER_BLEND` | ✅ | BLEND | 0 | 1 | 0.5 |
| 152 | `FX_CRUSH_ON` | — | | | | 0 |
| 153 | `FX_CRUSH_BITS` | ✅ | BITS | 4 | 16 | 8 |
| 154 | `FX_CRUSH_DOWN` | ✅ | DOWN | 1 | 64 | 4 |
| 155 | `FX_CRUSH_AA` | ✅ | AA | 0 | 1 | 0.5 |
| 156 | `FX_CRUSH_MIX` | ✅ | MIX | 0 | 1 | 1 |
| 157 | `FX_EQ_ON` | — | | | | 0 |
| 158 | `FX_EQ_LOW_GAIN` | ✅ | LOW | -18 | 18 | 0 |
| 159 | `FX_EQ_LOW_FREQ` | ✅ | LOW F | 40 | 1000 | 200 |
| 160 | `FX_EQ_MID_GAIN` | ✅ | MID | -18 | 18 | 0 |
| 161 | `FX_EQ_MID_FREQ` | ✅ | MID F | 200 | 8000 | 1000 |
| 162 | `FX_EQ_MID_Q` | ✅ | MID Q | 0.3 | 6 | 0.9 |
| 163 | `FX_EQ_HIGH_GAIN` | ✅ | HIGH | -18 | 18 | 0 |
| 164 | `FX_EQ_HIGH_FREQ` | ✅ | HIGH F | 1000 | 16000 | 4000 |
| 165 | `FX_EQ_MIX` | ✅ | MIX | 0 | 1 | 1 |
| 166 | `OVERSAMPLE` | ✅ | 2× | 0 | 1 | 0 |
| 167 | `FX_MOD1_SRC` | — | | | | 0 |
| 168 | `FX_MOD1_DST` | — | | | | 0 |
| 169 | `FX_MOD1_DEPTH` | — | | | | 0 |
| 170 | `FX_MOD2_SRC` | — | | | | 0 |
| 171 | `FX_MOD2_DST` | — | | | | 0 |
| 172 | `FX_MOD2_DEPTH` | — | | | | 0 |
| 173 | `FX_MOD3_SRC` | — | | | | 0 |
| 174 | `FX_MOD3_DST` | — | | | | 0 |
| 175 | `FX_MOD3_DEPTH` | — | | | | 0 |
| 176 | `FX_MOD4_SRC` | — | | | | 0 |
| 177 | `FX_MOD4_DST` | — | | | | 0 |
| 178 | `FX_MOD4_DEPTH` | — | | | | 0 |
| 179 | `FX_TRANSIENT_ON` | — | | | | 0 |
| 180 | `FX_TRANSIENT_ATTACK` | ✅ | ATTACK | -1 | 1 | 0 |
| 181 | `FX_TRANSIENT_SUSTAIN` | ✅ | SUSTAIN | -1 | 1 | 0 |
| 182 | `FX_TRANSIENT_MIX` | ✅ | MIX | 0 | 1 | 1 |
| 183 | `FX_OVR1_1` | — | | | | -2 |
| 184 | `FX_OVR1_2` | — | | | | -2 |
| 185 | `FX_OVR1_3` | — | | | | -2 |
| 186 | `FX_OVR1_4` | — | | | | -2 |
| 187 | `FX_OVR2_1` | — | | | | -2 |
| 188 | `FX_OVR2_2` | — | | | | -2 |
| 189 | `FX_OVR2_3` | — | | | | -2 |
| 190 | `FX_OVR2_4` | — | | | | -2 |
| 191 | `FX_OVR3_1` | — | | | | -2 |
| 192 | `FX_OVR3_2` | — | | | | -2 |
| 193 | `FX_OVR3_3` | — | | | | -2 |
| 194 | `FX_OVR3_4` | — | | | | -2 |
| 195 | `FX_OVR4_1` | — | | | | -2 |
| 196 | `FX_OVR4_2` | — | | | | -2 |
| 197 | `FX_OVR4_3` | — | | | | -2 |
| 198 | `FX_OVR4_4` | — | | | | -2 |
| 199 | `FX_OVR5_1` | — | | | | -2 |
| 200 | `FX_OVR5_2` | — | | | | -2 |
| 201 | `FX_OVR5_3` | — | | | | -2 |
| 202 | `FX_OVR5_4` | — | | | | -2 |
| 203 | `FX_OVR6_1` | — | | | | -2 |
| 204 | `FX_OVR6_2` | — | | | | -2 |
| 205 | `FX_OVR6_3` | — | | | | -2 |
| 206 | `FX_OVR6_4` | — | | | | -2 |
| 207 | `FX_OVR_TARGET1` | — | | | | 0 |
| 208 | `FX_OVR_TARGET2` | — | | | | 0 |
| 209 | `FX_OVR_TARGET3` | — | | | | 0 |
| 210 | `FX_OVR_TARGET4` | — | | | | 0 |
| 211 | `FX_OVR_TARGET5` | — | | | | 0 |
| 212 | `FX_OVR_TARGET6` | — | | | | 0 |
| 213 | `FX_OVR_TARGET7` | — | | | | 0 |
| 214 | `FX_OVR_TARGET8` | — | | | | 0 |
| 215 | `FX_OVR_DEPTH1` | — | | | | 0 |
| 216 | `FX_OVR_DEPTH2` | — | | | | 0 |
| 217 | `FX_OVR_DEPTH3` | — | | | | 0 |
| 218 | `FX_OVR_DEPTH4` | — | | | | 0 |
| 219 | `FX_OVR_DEPTH5` | — | | | | 0 |
| 220 | `FX_OVR_DEPTH6` | — | | | | 0 |
| 221 | `FX_OVR_DEPTH7` | — | | | | 0 |
| 222 | `FX_OVR_DEPTH8` | — | | | | 0 |
| 223 | `FX_OVR_SRC` | — | | | | 0 |

**为什么本次仍然只记录、不实现（理由，以及第一步）**

* **写侧的第一步不是加工具，是决定编码器归谁。** 唯一诚实的编码器是 synth 自己的 `buildPayload`（`/home/crow/music/synth/src/state/share.ts`），它**没有被 vendored**，而且 import `persist.ts`（`SCHEMA_VERSION`）与 `midi/takes.ts`——§2 记过，把这半棵子树拖进来会破坏"一文件一哈希"的 pin。**在这里手写一个编码器，就是给同一个格式写第二份实现**：本仓库自己的读+写会互相自洽，却可能和 synth 不一致——正是 `gs1PatchPassthrough.test.ts` 用 synth 自己的编码器产物做 fixture 要防的那件事。所以第一步是一次**决定**：(a) 把上游 `share.ts` 的编码器按哈希 pin 进 `vendor/gs1/`，或 (b) 不加编码器，改为在 `SequencerTrack` 上放一个独立的逐参数覆盖字段，并把它并进**唯一**解析缝 `resolveGs1Lane`（`src/audio/gs1/gs1Tracks.ts:324`），同时保证导出、实时、`validate_pattern` 三处读同一个决议。
* **读侧的第一步可以立刻做，且不需要编码器**：一个 `get_gs1_patch`，把某条轨道 code 里的 224 个值（84 个带标签/范围）与路由读回来。它只用已存在的 `decodeGs1PatchCode`，能让调用者先看见"我的码到底设了什么"，是加写侧之前该有的那半。判据两个方向：对一个已知 code 断言读回的已知值；把解码器对 `v` 的读取去掉即红。
* **范围校验不能照抄 `PARAM_SPECS`**，理由与测量已在 §4：它只覆盖 84 个，且在重叠处比 worklet 实际服务的范围更窄（`phonk` 的 `osc2Pitch = 31` 会被它拒掉）。逐参数工具必须先决定"按什么校验"，否则就是把一个工厂预设拒之门外。

## 复现本次结论的命令

```bash
# 生成测试用的真实 share code（fixture 的来源，synth 自己的编码器）
cd /home/crow/music/synth
node -e "import('./mcp/lib/data.mjs').then(async ({loadData}) => {
  const d = await loadData();
  const { presetShareCode } = await import('./mcp/lib/patch.mjs');
  console.log(presetShareCode(d, 'acid').code);
})"

# 本次的判据（离线渲染 + vendored WASM core 实测 + 单点缝）
npx vitest run src/test/gs1PatchPassthrough.test.ts      # 11 passed

# 受影响的既有 GS-1 判据
npx vitest run src/test/gs1Tracks.test.ts src/test/gs1ExportParity.test.ts \
  src/test/gs1VoicePool.test.ts src/test/gs1StemHosts.test.ts \
  src/test/gs1Patches.test.ts src/test/gs1SampleTexture.test.ts src/test/mcpTools.test.ts

npm run typecheck                                        # clean
npm run check:mcp                                        # 85 tools, 93 checks passed
```

## 同类先例（本项目第三次，本次已闭合）

| 报告/评估的说法 | 实际 | 位置 |
| --- | --- | --- |
| `get_energy_curve` 缺失 | **已有决定**：曲线随渲染指标一起返回 | `docs/Z2_ADJUDICATION.md:160` |
| 编排侧 tempo map 缺失 | **一处 pass-through**，已闭合 | `docs/Z2_ADJUDICATION.md:181` |
| `sound` 命名空间（写音色）完全缺失 | 缺口真实；第一步曾是"有限预设集合"。**本次以"一条不透明 share code + 一个解析缝"闭合了它** | 本文件；`docs/Z2_ADJUDICATION.md:144` |

---

## 9. 逐参数写入：**工具的产物是"模式里的 share code 字符串"，而引擎的逐参数 API 在渲染时才活着** ✗✓（2026-10-01，读代码后更正我自己的判断）

**先更正我自己的一个判断** ✗✓：我先看到 `Gs1Host` 已暴露 `setParam(id,value)` ✓ / `getParam(id)` ✓ / `setPatch(values)` ✓ / `setModRoute(...)` ✓（`src/audio/gs1/Gs1Host.ts:184-196` ✓）就写下"逐参数写入不需要编码器" ✗——**错了** ✗✓，因为：

* `apply_gs1_patch` **不驱动活的引擎** ✓：它把 **`track.gs1Patch`（一个字符串）** 写进 pattern ✓、`readOnly: true` ✓、**返回 pattern** ✓；**引擎是在渲染时解码那个字符串的** ✓✓。
* 所以"给我这个 lane 的第 42 号参数改成 X"**必须让产物里的 code 反映 X** ✗✓ → **需要重新编码** ✗ → **而 groove 只有 `decodeGs1PatchCode`** ✓（`src/audio/gs1/gs1PatchCode.ts:97` ✓），**没有编码器** ✗✓。

**两条路线，与各自的代价** ✓✓：

| | 做法 | 代价 |
| --- | --- | --- |
| **① 重编码** | 把上游 `src/state/share.ts`（`buildPayload`:107 / `encodePatch`:182 ✓）纳入 vendor，用**上游那一份**编码 ✓ | 要动 **vendor 列表**（我们现在只搬 `src/audio/*` ✓）与 `sync-gs1.mjs` ✓；**若顺手同步就会跨 2.1.6 → 2.1.8** ✗✓（必须**单独**验证 ✓） |
| **② 覆盖层** ✓✓ | `patch`（基数 code）**不动** ✓；`set:{参数:值}` 与其路由另存 ✓；在**唯一那道缝** `resolveGs1Lane` 处经 **`Gs1Host.setParam` / `setModRoute`** 应用 ✓ | **不碰格式、不搬编码器、不跨版本** ✓✓ |

**为什么 ② 不违反"不写第二份"** ✓✓：那条规则保护的是 **"不要重写 synth 的 payload 格式"** ✓✓——而 ② **根本不构造 payload** ✓；**DSP 仍只有引擎那一份** ✓，用的还是**引擎自己的参数入口** ✓。**代价**是"基数 + 覆盖"是**两个表示** ✗✓，所以必须**同一处解析、且读回要能看见最终值** ✓✓（`getParam` ✓）。

**判据（两条路线共用）** ✓✓：`setParam` 之后 **`getParam` 读回该值** ✓✓（**证明值真的到了引擎** ✓）、**其余参数不变** ✓、**渲染出的音频随之改变** ✓、**删掉应用那一步即红** ✗✓。
