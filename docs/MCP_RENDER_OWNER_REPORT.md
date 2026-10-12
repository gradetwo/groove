# MCP 渲染：业主报的三条，实测、根因与改动

本文回答业主对 `dev`（`ace77d7`）实测报出的三条，一条一条先量后改。**每一条都带方法、读数与时点**；没量到的写"没量到"，不写猜的。

跑本文所有读数的机器（`scripts/probe_headless_phase_split.ts` 自己印在开头）：

```
when      : 2026-10-03T03:12Z … 03:24Z（本机 CST 11:12 … 11:24）
host      : apple2011 · node v22.22.3 · 8 cpus · Intel(R) Core(TM) i7-2635QM CPU @ 2.00GHz
load avg  : 2.6 / 2.0 / 1.5（三条测量各自印了当时的值）
worktree  : /home/crow/music/groove-mcprend（origin/dev @ ace77d7）
```

---

## ① `render_song` 不加 `headless`：**不是挂住，是慢，而且没有 worker 时的拒绝语不是本仓的话**

### 怎么测

`scripts/probe_mcp_render_scratch.mjs`（新建的临时驱动，非判据）用真 stdio 起 `dist-mcp/groove-mcp.mjs`，`create_song {genreId: "chicago-house", bars: 2}` → `render_song {format: "wav", maxDurationSec: 1800}`，**每次都带 `_meta.progressToken`**，分别给 60/120/180 秒的客户端上限。每个上限一次独立进程。

歌曲形状：`totalSteps 256`，`durationSec 32.661`，44.1 kHz 立体声，`limiterKind=worklet`。

### 读数

| 客户端上限 | 是否返回 | 返回什么 | 服务端日志 |
| ---: | --- | --- | --- |
| **60 s** | **不返回** | 客户端在 60 000 ms 放弃 | `0.78s 0/900000 starting the renderer (Vite + Chromium)` → `29.8s 15000/900000` → `44.8s 30000/900000` → `59.9s 45065/900000`，**每一条都是 "still working"** |
| **120 s** | **81 000 ms 返回** | `engine: "browser"`，`durationSec 32.661`，`bytes 5761496`，`truePeakDb −1.27`，`integratedLufs −15.43` | 进度 0 → 15005 → 30008 → 45082 → 60128 → `900000/900000 render finished; writing the file` |
| **180 s** | **87 400 ms 返回** | 同上，逐位一致的文件 | 同上 |

**所以 60 s 那次的"无响应"是客户端的上限先到**，不是服务端卡死：60 s 那一行里显示的 `render failed: page.evaluate: Target page, context or browser has been closed` 是**驱动超时后 SIGTERM 服务端**、页面随之消失造成的，时间戳 `60.8 s` 排在 `NO REPLY` 之后。

### 根因：**worker 在，而且 1.2 秒就绪**

业主怀疑的是"P0-2 worker hang"或"浏览器 worker 未就绪"。实测都不是：

* `starting the renderer (Vite + Chromium)` 这条进度通知在**第一次调用后 0.78–1.26 秒**发出，也就是 Vite 与 Chromium 都起来了；
* 之后每 15 秒一条 `rendering 1 bar(s) of chicago-house — still working`，分母 `900000` 是 `RENDER_BUDGET_MS`（15 分钟）；
* 同一份工作在 120 s 与 180 s 两次都**真的产出了文件**（5 761 496 字节，两次的 `truePeakDb` 差 1.6e-6 dB）。

**⇒ "挂住"不成立**：默认路径能跑，只是这条编曲（32.66 s 音频、44.1 kHz 立体声）在这台机器上要 **81–87 秒**，即 **0.37–0.40× 实时**，超过业主（以及默认 30 s 级的 MCP 客户端）的耐心上限。**它是慢，不是死。**

### 顺带核的第二个问题：**无 worker 时到底发生什么**

把 `PLAYWRIGHT_BROWSERS_PATH` 指到一个不存在的目录（真有浏览器时不触发，只有"这台机器没有浏览器"才走这条路）：

| | 结果 |
| --- | --- |
| **改前**（`ace77d7`） | **1 223 ms 返回**，拒绝是**快**的 —— 但话不是本仓的话：`browserType.launch: Executable doesn't exist at /nonexistent-playwright/…` 加一个方框 `Please run the following command to download new browsers: **pnpm exec playwright install**` |
| **改后** | 同一条路，`src/test/mcpRenderNoBrowser.test.ts` 实测 **1 157 ms**，消息指明 `npx playwright install --with-deps chromium`（本仓 CI、`DEPLOY.md`、README 用的就是这个命令）、`npm ci`、以及 `headless: true` 这条不需要浏览器的替代路，并单独一句写明**没有偷偷换成无头** |

### 形状选择：**"快速拒绝 + 可执行指引"，不是"改成真能跑"**

判据是量出来的，两边都写：

* **"真能跑"这一半今天已经成立**（81–87 s 出文件、`engine: "browser"`），所以**不该**把默认路径改成别的引擎 —— 那正是本仓禁止的静默回退（`headlessParameterDescription()` 里写着 never falls back）；
* **"无 worker"这一半**原来就是快速拒绝（1.2 s），缺的只是**可执行的下一步**。按本仓既有先例补齐：`headlessUnavailableMessage()` 会点名包与 `npm i -D`，deploy preflight 会点名要建哪个文件；
* **判据能红**：删掉 `ensurePage` 里 `browserUnavailableMessage()` 那层包装，Playwright 原文回来，`src/test/mcpRenderNoBrowser.test.ts` 的安装命令断言与"不许出现 `pnpm exec`"断言同时红（实跑见 §⑤）。

### 没修的一条，如实记

**没有 `progressToken` 的调用全程一声不响**（本仓既有设计：`createRenderProgress` 没有 token 就什么都不发）。业主要是"3 分钟无响应"的印象来自这一点，那它**不是** ① 里那个 worker 问题，而是"慢 + 无叙述"。改它要动 MCP 通知面（`notifications/message` 一类），会牵动 `check:mcp` 的线上契约，**没有做**，留在这里当一条具名的未决。

---

## ② headless 的速度：**0.30–0.43× 实时，不是无头特有的代价，而是这台机器上这条编曲本来就慢**

### 怎么测

新建 `scripts/probe_headless_phase_split.ts`，直接用渲染器**自己**的惰性相位表（`globalThis.__grooveRenderTimings`，`src/audio/WavExporter.ts` 里那套）加两个 `performance.now()` 括号，所以时间切分来自被测代码，不是第二只秒表。

```
npx vite-node scripts/probe_headless_phase_split.ts -- --genre=chicago-house --bars=2 --bars=8 --runs=2
npx vite-node scripts/probe_headless_phase_split.ts -- --genre=chicago-house --bars=2 --runs=1 --rate=8000 --channels=1
```

### 读数（同一台机、同一份编曲、同一时段）

| 配置 | 总墙钟 | 音频 | 折合 | `offline:startRendering` | `audioLanes:loadDecodeSchedule` | headless.ts 自身 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 小节 44.1k 立体声（**冷**，进程内第一次） | **76 227 ms** | 32.66 s | **0.43×** | 49 203 ms | 23 565 ms | 2 694 ms |
| 2 小节 44.1k 立体声（暖，第 2 次） | **77 552 ms** | 32.66 s | **0.42×** | 50 956 ms | 23 396 ms | 2 847 ms |
| **8 小节 44.1k 立体声** | **415 992 ms** | 125.56 s | **0.30×** | **384 275 ms** | **23 339 ms** | 7 003 ms |
| 2 小节 8 kHz **单声道**（冷） | **39 770 ms** | 32.66 s | **0.82×** | 14 766 ms | **23 189 ms** | 1 219 ms |

（`gs1:capabilityProbe` 冷 299 ms / 暖 16 ms，是进程内一次性的；`schedule:voices` 2 小节 95–137 ms、8 小节 952 ms。）

### 固定开销 vs 每小节线性

* **进程内一次性开销 ≈ 0**：冷 76 227 ms 对暖 77 552 ms，**冷的那次还略快**；真正一次性的是 `gs1:capabilityProbe`（299 → 16 ms）。所以 90 秒里**不是**启动/初始化占大头。
* **`audioLanes:loadDecodeSchedule` 是"每次渲染的固定开销"**：2 小节 23 565 / 23 396 ms，8 小节 **23 339 ms**（音频长 3.84 倍，它一分不涨），8 kHz 单声道 **23 189 ms**（采样数掉到 1/11，它也一分不涨）⇒ **与小节数、采样率、声道数都无关**。
* **`offline:startRendering` 是超线性的**：49 203 → 384 275 ms，音频只长 3.84 倍，它长 **7.8 倍**。这与 `docs/RENDER_PROFILE.md` 记的浏览器路径同形（"音频长 7.3 倍 ⇒ 墙钟长 18–28 倍"）。
* **headless.ts 自己的那一段**（动态 import、manifest 解析、WAV 编码、base64、真峰值/响度测量）2 694 → 7 003 ms，随输出大小走，占 2 小节的 **3.5%**。

**⇒ 不是无头宿主的固定开销**。瓶颈是两个：`offline:startRendering`（引擎本身，超线性）与 `audioLanes:loadDecodeSchedule`（每次渲染重新取/解一次这条编曲用到的采样）。

### 与既有记录的条件对照：**那个 4.2× 在仓库里找不到**

`git grep` 全树 + `git log --all -S` 查 `4.2×` / `4.2 倍` / `4.2x`，**零命中**。最近的既有读数是：

| 记录 | 值 | 条件 |
| --- | --- | --- |
| `docs/RENDER_PROFILE.md` §采样率与声道表 | **3.89×**（8 kHz 2ch 完整）／**5.86×**（8 kHz 1ch 完整） | **浏览器路径**，同一受控夹具，**1 小节 = 17.18 s 音频**，2 轮取中位，负载 1.5–3.0，消融探针（无采样车道取/解码这一项） |
| 同上 | **1.15×**（44.1 kHz 2ch）／**0.96×**（44.1 kHz 1ch） | 同上 |
| `docs/HEADLESS_CORE_PLAN.md` §8.13 | headless 1 小节 **8 kHz 单声道 1 090 ms** | Node 宿主，奇偶校验探针自己的三车道夹具 |

**⇒ 两个数不是一个条件**：记录里的 4–6× 是 **8 kHz（分析档）**、**浏览器路径**、且夹具里没有"每次渲染重新取采样"这一项；业主的 0.55× 与我复现的 0.42–0.43× 是 **44.1 kHz 立体声**、**带采样车道**的整曲渲染。**不能把这两个数放在一起算"慢了 8 倍"。**

去条件化地比一比：8 kHz 单声道下我的 2 小节是 **0.82× 实时**（总 39.77 s，其中 **23.2 s 是采样取/解码**）；扣掉那 23.2 s，引擎部分是 16.6 s / 32.66 s 音频 = **1.97× 实时**，而记录是 5.86×。这条差距我没有定位到根因（候选：夹具不同、这台机当时负载 2.9、以及本夹具 8 轨含 GS-1 与混响）——**如实标为未核实**。

### 可修的热点：**在我地盘里没有**

* `offline:startRendering` 与 `audioLanes:loadDecodeSchedule` 都在 `src/audio/WavExporter.ts` 与 `src/audio/offlineAudioLanes.ts`／`src/audio/sampleLoader.ts` 里，**不在本任务的改动范围**（本轮地盘只有 `mcp/**`、探针脚本、新建判据、`docs/**`）。按规矩**没有改数字、也没有为了让数好看去动它们**。
* 我地盘里能省的只有"每次渲染重解析 5 196 KB 的 `public/samples/manifest.json`"，实测占 2 小节总时间的 **0.4% 以下**（`headless.ts outside` 整段才 2.7 s，还包含 WAV 编码与 base64），**不值得为此加一个缓存**，所以没加。

**⇒ 一句话**：这条是"这台机器 + 这份编曲 + 带采样的整曲渲染"的正常代价，不是无头宿主的缺陷；`audioLanes` 那 23 s 每次渲染都付，是引擎侧可攻的点，已具名留档。

---

## ③ `inspect_instrument_sfz` 的参数：**schema 指的那条路根本不存在**

### 复现

`list_sample_libraries`（真跑，126 ms）返回 10 个库，字段是 `id / name / licence / source / sourceUrl / repo / pin / instruments / durationSeconds`。对它整个回复递归找 `/\.sfz(\?|$)/i`：**命中 0 条**。它报的是**出处**（一个 GitHub 仓库页），不是任何乐器 `.sfz` 的地址 —— 而 `inspect_instrument_sfz` 的 `url` 参数当时写着"the SFZ's address; `list_sample_libraries` reports one per instrument"。

把乐器名当 URL 喂进去（业主本来会做的下一步）：

```
{"raw":"Failed to parse URL from vsco2ce-violin"}
```

—— 一个 `TypeError` 的原文，没有一个字说该怎么办。

### 端到端（改后，走 catalog）

| 路 | 调用 | 读数 |
| --- | --- | --- |
| **名字** | `inspect_instrument_sfz {assetId: "vcsl:Vibraphone-Keyswitch"}` | **1 393 ms**，`servedFrom` = `https://raw.githubusercontent.com/sgossner/VCSL/dfcf4a49…/Idiophones/Struck Idiophones/Vibraphone - Keyswitch.sfz`，`regions 50`，`missing []` |
| **URL** | 同一条地址直接给 `url` | **762 ms**，`servedFrom`、`regions`、`rows` 与名字那条逐字相同 |

那条 URL 指到的库**有 `sw_*`**，改后的 `rows` 原文：

```
sw_default=36   regions=50
sw_hikey=39     regions=50
sw_lokey=36     regions=50
sw_label=Hard Mallets  regions=22
sw_label=Soft Mallets  regions=22
sw_last=37      regions=22
sw_last=38      regions=22
sw_label=Bowed  regions=6
sw_last=36      regions=6
```

**改之前这份表里只有 `sw_last=37/38/36` 三行** —— `sw_label` 与 `sw_default` 被 `INTERESTING` 的表漏掉了。也就是说：业主想核的"这个库到底有哪几个键位、各叫什么"，工具当时能说"有个门"，说不出"门后是什么"。

### 键位读数（`1efe6ba` 的能力，经 MCP）

先是用 `scripts/probe_sfz_keyswitch_mcp.ts`（新建，**不解码**，直接跑 `resolveInstrumentNote`）找到一条**可达且能在 Node 宿主解码**的夹具：

```
SWITCH karoryfer-black-and-blue-basses:01-darkblack-keysw
  note 40: switchState=31 switchLabel="Pluck" sample=..\Samples\darkblack\reg\darkblack_e2_f_rr1.wav
SWITCH vcsl:Vibraphone-Keyswitch
  note 60: switchState=36 switchLabel="Bowed" sample=Vibraphone/Bowed/Vibes_bowed_A2_rr1_Main.wav
```

再经 MCP 的 `render_instrument_note`：

| | 输出里的 `resolved` |
| --- | --- |
| **改前** | `{"samplePath":"../Samples/darkblack/reg/darkblack_e2_f_rr1.wav","ratio":1,"rootKey":40}` |
| **改后** | `{"samplePath":"../Samples/darkblack/reg/darkblack_e2_f_rr1.wav","ratio":1,"rootKey":40,"switchState":31,"switchLabel":"Pluck"}` |

`loadNote` 从 `1efe6ba` 起就一直带着这两个字段（`src/audio/sampleLoader.ts` 把它们放进 `noteInfo`），是 MCP 这一层在拼 `resolved` 时把它们丢了 —— 两个宿主各拼一份，两份都没有。

---

## ④ 改动清单

| 文件 | 改了什么 |
| --- | --- |
| `mcp/render/worker.ts` | 新增 `browserUnavailableMessage()`（并过滤掉 Playwright 自己的 `pnpm` 建议方框）；`ensurePage()` 的 `chromium.launch()` 失败改抛这句话；`AuditionResult["resolved"]` 加 `switchState`/`switchLabel` 两个可选字段，页路径的 `resolved` 里补上这两条转发 |
| `mcp/render/headless.ts` | `HeadlessNoteResolution` 加同样两个字段；新增导出 `headlessNoteResolution()` 并让 `renderInstrumentNoteHeadless` 走它（无头侧那一份，可判据） |
| `mcp/sfzInspect.ts` | `INTERESTING` 里 `sw_last` 换成 **`sw_`** 前缀，`sw_label`/`sw_default`/`sw_lokey`/`sw_hikey`/`sw_previous`… 全部出现 |
| `mcp/instruments.ts` | 导出 `catalogueAssetById()`（与 `list_sample_libraries` 同一份**合并后**的目录，用户注册的库也查得到）与 `nearestCatalogueAssetIds()`（按命中 token 数排序，不会因为库名前缀相同就答出无关 id） |
| `mcp/registry.ts` | `inspect_instrument_sfz`：`assetId` 与 `url` 变为二选一，`fallbackUrl` 只在 `url` 下有意义；两者都给、都不给、`fallbackUrl` 配 `assetId`、乐器名当 URL、id 不存在——五种都**明确拒绝并指路**；描述改写（不再声称 `list_sample_libraries` 报 URL） |
| `scripts/probe_headless_phase_split.ts` | 新建：相位切分读数器 |
| `scripts/probe_sfz_keyswitch_mcp.ts` | 新建：不解码地找"哪个可达乐器真的报 `switchState`" |
| `scripts/probe_mcp_render_scratch.mjs` | 新建：真 stdio 驱动，做 ① 与 ③ 的复现 |
| `src/test/mcpRenderNoBrowser.test.ts` | 新建判据（①） |
| `src/test/mcpSfzInspectInputs.test.ts` | 新建判据（③ + ④ 的 `sw_*` 可见） |
| `src/test/mcpKeyswitchReading.test.ts` | 新建判据（④ + headless never falls back 的措辞） |

---

## ⑤ 判据，以及每条"怎么证明能红"（**都实跑了**）

绿：`npx vitest run` 三个新文件，**14 passed**（2 + 8 + 4），其中 `mcpRenderNoBrowser` 那例的真拒绝 **1 324 ms**、`mcpKeyswitchReading` 那例的真渲染 **5 806 ms**。

红（每一条都是"改坏一处 ⇒ 跑一次 ⇒ 看它红 ⇒ 改回来"，源码里没有留下反向改动，`diff -q` 逐个核对过）：

| # | 判据 | 改坏什么 | 实跑结果 |
| --- | --- | --- | --- |
| 1 | `src/test/mcpRenderNoBrowser.test.ts` | 删掉 `ensurePage` 里 `browserUnavailableMessage()` 那层 try/catch | **1 failed / 1 passed**：`expected 'browserType.launch: Executable doesn\…' to contain 'npx playwright install --with-deps ch…'` |
| 2 | `src/test/mcpSfzInspectInputs.test.ts` | `INTERESTING` 里 `"sw_"` 换回 `"sw_last"` | **1 failed / 7 passed**：`reports every switch opcode…` 红（`sw_label`/`sw_default` 又不在了） |
| 3 | 同上 | 删掉 `assetId` 分支（`if (assetId !== undefined)` → `if (false)`） | **2 failed / 6 passed**：按 id 读那例与"id 不存在要指路"那例红 |
| 4 | 同上 | 删掉 `url` 分支 | **3 failed / 5 passed**：按 URL 读、`sw_*` 表、"乐器名当 URL"三例红 |
| 5 | `src/test/mcpKeyswitchReading.test.ts` | 删掉 `headlessNoteResolution()` 里 `switchState`/`switchLabel` 两条 spread | **2 failed / 2 passed**，**包括真渲染那一例**：`switchState missing from {"samplePath":"../Samples/darkblack/reg/darkblack_e2_f_rr1.wav","ratio":1,"rootKey":40}` |
| 6 | 同上 | 把 `headlessUnavailableMessage()` 缩成一句 `headless rendering is unavailable (…)` | **1 failed**：`expected 'headless rendering is unavailable (Ca…' to contain 'npm i -D node-web-audio-api'` |

第 6 条就是"缺 addon 必须抛出并指名包与安装命令"的反向：这条断言存在时，任何把 never-falls-back 措辞删掉/改软的改动都会红。（**未做过**的一件事：真把 `node_modules/node-web-audio-api` 拿掉跑一次端到端 —— 它是指向主 checkout 的符号链接，动它会波及主树；本条因此是"纯函数 + 措辞"级别，路由那一半由既有的 `src/test/mcpHeadlessRouting.test.ts` 28 例持有。**如实标注为未端到端核实**。）

---

## ⑥ 反向判据（不许变的一字）

| 判据 | 读数 | 是否变 |
| --- | --- | --- |
| `npm run check:mcp` | **92 tools, 7 resources, 4 prompts；123 checks passed, 0 failed** | 工具面与判据条数**未变**（本轮没有加/删工具；`dev` 的基线本就是 92 工具 / 123 条） |
| `src/test/mcpCoverage.test.ts` | 5 passed | 未变 |
| `src/test/mcpOpSchemaCoverage.test.ts` | 2 passed | 未变 |
| `src/test/mcpTools.test.ts` | 22 passed | 未变 |
| `src/test/mcpHeadlessRouting.test.ts` | **32 passed**（"never falls back" 两处措辞断言仍在） | 未变 |
| `src/test/mcpHeadlessRender.test.ts` | **8 passed，68.7 s** | 未变 |
| `src/test/mcpAudition.test.ts` / `mcpSfzInspect*.test.ts` / `sampleLibraryListing.test.ts` | 4 / 5 / 5 / 4 passed | 未变 |
| `src/test/ownerProjectAcceptance.test.ts` | **8 passed**，五个数原样：`57 note(s)` / `25 refused` / `3 attacks before, 1 after` / `60 notes` / `28 recording(s) started` | 未变 |

---

## ⑦ 门禁

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npx tsc --noEmit` | ✅ 0 |
| 风格 | `npx eslint . --quiet` | ✅ 0 |
| MCP | `npm run check:mcp` | ✅ 92 tools / 123 checks, 0 failed |
| 文档基线 | `npm run docs:check` | ✅ 3 条成立 |
| 文档引用 | `npm run check:docs:refs` | ✅ every file the docs claim exists does exist |
| 定向 vitest | 见 §⑤ / §⑥ | ✅ 全绿 |


`npm run probe:headless`（`scripts/probe_headless_parity.ts`）本轮实跑 **8/8 ok，PASS，exit 0**：`browser=165375 headless=165375` 帧、band 3 差 **1.03 dB**、band 7 差 **1.04 dB**、真峰值 **Δ 0.000 dB**、响度 **1.612 LU**、GS-1 在两宿主都参与（12.08 / 13.94 dB L1）、两宿主 `limiterKind=worklet`。与 `docs/HEADLESS_CORE_PLAN.md` §8.13 记的读数**逐位一致**。

---

## ⑧ 判不了 / 未核实（如实列）

（sha、推送行与 CI 属于交付记录，写在推送时的回报里，不写进本文——本文写进 commit 就再也改不动自己那一行。）

1. **业主引的那个 4.2×，仓库里没有。** 全树 `git grep` 与 `git log --all -S`（`4.2×` / `4.2 倍` / `4.2x`）零命中。本文因此只并列**能找到条件的**两个数（`docs/RENDER_PROFILE.md` 的 8 kHz 浏览器档、`docs/HEADLESS_CORE_PLAN.md` §8.13 的 1 小节 8 kHz 单声道），**没有**去凑一个 4.2×。
2. **8 kHz 单声道下 1.97× vs 记录 5.86× 的差距没有定位。** 扣掉每次渲染那 23.2 s 采样取/解码后，本夹具 32.66 s 音频要点 16.6 s（1.97×），而记录是 5.86×。候选（**都没测**）：夹具不同（本夹具 8 轨含 GS-1 + 混响 + 采样鼓组）、当时负载 2.9、以及记录那次是浏览器路径的消融探针。
3. **`audioLanes:loadDecodeSchedule` 那 ~23 s 里，网络取字节与解码各占多少，没有测。** 能说的是它对**小节数（2→8）、采样率（44.1k→8k）、声道数（2→1）三项全部不敏感**，这更像是取字节而不是解码（解码量随上下文采样率下降）；但这是推断，不是读数。
4. **`headless` 缺包那条路没有真端到端跑。** `node_modules/node-web-audio-api` 在 worktree 里是指向主 checkout 的符号链接，动它会波及主树，所以"缺 addon 必须抛"只做了纯函数/措辞级判据，路由那一半靠既有 `src/test/mcpHeadlessRouting.test.ts` 的 28 例。**没做到**：在一个真没有这个包的 checkout 上跑一次 `render_song {headless:true}`。
5. **无 `progressToken` 时全程无叙述**这件事**没有改**。它是本仓既有设计（`createRenderProgress` 无 token 即静默），改它要动 MCP 通知面并牵动 `check:mcp` 的线上契约 —— 留作具名未决，不假装修了。
6. **"无 worker"只用 `PLAYWRIGHT_BROWSERS_PATH` 模拟过。** 没试过被 sandbox 拒绝、`playwright` 包缺失、或共享库缺失这几种真形态；它们走同一个 `chromium.launch()` catch，但**只有不存在可执行文件这一种真的跑过**。
