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
