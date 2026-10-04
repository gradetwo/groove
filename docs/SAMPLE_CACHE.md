# 采样：下载、持久化，以及"渲染前用到的音源都下载完毕"

本文回答业主的一句要求 —— **「音源需要下载和持久化，渲染前应该用到的音源都下载完毕。」** —— 以及审计实测到的两条缺陷（P0-2
`render_song {headless:true}`、P2 采样缓存不跨渲染复用）。**每一条都先量后改**，读数、方法、时点都在下面；没量到的写明"没量到"。

跑本文读数的机器与工作树：

```
when      : 2026-10-03T16:0xZ（本机 CST 次日 00:0x）
host      : apple2011 · node v22.22.3 · Intel(R) Core(TM) i7-2635QM CPU @ 2.00GHz
worktree  : /home/crow/music/groove-samplecache（origin/dev @ 2b6dae3）
bundle    : dist-mcp/groove-mcp.mjs v2.34.42（92 tools）
measure   : scripts/sample_cache.mjs（缓存统计）＋ 临时 stdio 驱动（非判据，放 /var/tmp）
fetch tap : `node --import` 包住 `globalThis.fetch`，逐条记 URL / 状态 / 字节 / 首字节 ms / body ms
```

---

## ① P0-2：`render_song {headless:true}` 到底怎么"卡死"

### 复现（三个上限，各一次独立进程）

`create_song {genreId:"chicago-house", bpm:120, name:"p02"}` → `add_section {slot:"A", bars:2}` →
`render_song {headless:true}`。**总分步数 384（3 小节），44.1 kHz 立体声**。

| 客户端上限 | 是否返回 | 返回什么 | WAV | 抓到的请求 |
| ---: | --- | --- | --- | ---: |
| **60 s** | **不返回** | 客户端放弃，**无输出** | **无** | 134 |
| **300 s** | **135 937 ms 返回** | `engine:"node-web-audio-api"`, `durationSec 49.75`, `bytes 8 775 944`, `truePeakDb −1.30`, `integratedLufs −15.54` | 有（8.4 MB） | 134 |

**读数说的事**：这条路径**不是永不返回，是慢** —— 49.75 s 音频用 135.9 s，**2.7× 实时**。60 s 那次的"无输出"是**调用方上限先到**，
不是服务端卡死；但**服务端当时没有任何上限**，所以调用方**只能**靠自己的超时来判断，而它无法区分"慢"与"挂" —— 这正是业主的
"300 秒超时、无输出"。**审计的结论"旧 song API 的渲染路径不可用"在这一层上是对的**：它以 2.7× 实时跑，任何合理客户端上限
都可能在它前面。

### 与 `render_arrangement` 的对照：**差在"同一层，不同输入"，不在渲染路径**

两条工具**到渲染器的最后一层是同一个函数、同一份代码**：

| 层 | `render_song` | `render_arrangement` |
| :--- | :--- | :--- |
| 取模型 | `flattenMcpSong(songId)` → `flattened.pattern`（`mcp/song.ts:584`） | `flattenMcpArrangement(id, range)` → `flattened.pattern`（`mcp/arrangement.ts:1270`） |
| 渲染入口 | `renderAudio(pattern, {...})`（`mcp/registryRender.ts`） | `renderAudio(pattern, {...})`（`mcp/registryArrangement.ts`） |
| Node 分支 | `renderPatternHeadless`（`mcp/render/worker.ts:676`） | **同一个** `renderPatternHeadless`（`mcp/render/worker.ts:676`） |
| 离线渲染 | `renderPatternOffline`（`src/audio/WavExporter.ts:698`） | **同一个** `renderPatternOffline` |

**所以"卡在哪一层"的答案是：卡在 `startRendering()` 那一次调用里，两条路径共用它** —— 差的是**喂给它的 pattern**：

* `render_song` 的 `bars: 1` 而 pattern 的 `totalSteps` 是整首歌（本例 384 步 = 3 小节 = 49.75 s 音频），**一次算完**；
* 业主对照的 `render_arrangement` 是 2 小节（≈86 s 出 WAV），同一台机上按每小节折算与 135.9 s / 3 小节一致（45.3 s/小节 vs 43 s/小节）。

**没有"song→arrangement 转换卡住"这回事**：`flattenMcpSong` 是纯函数，在 20 ms 内返回（`create_song` 读数）。旧报告里那条
"`render_song` 不加 `headless` 很慢"的结论**不适用于本案**：那次是浏览器路径、`page.evaluate`，并且被证明是"慢＋调用方上限先到"；
**这次是 `headless: true`**，走的是进程内 Node host，两者唯一的共同点是"都很慢"。（`docs/MCP_RENDER_OWNER_REPORT.md` 的
§① 是浏览器路径，本文 §① 是 Node 路径，两案分开记。）

### 改了什么

**给它一个明确上限，并把话说清楚**（§27：不静默降级；本仓一贯"失败要可见"）：

* `mcp/render/worker.ts` 新增 `withNodeHostBudget()` —— 与浏览器路径**同一个** `RENDER_BUDGET_MS`（900 s，来自
  `mcp/render/budget.json`，两套上限会造成 `budget.json` 存在意义所要防的漂移），**但不调用 `resetRenderer()`**：进程内渲染
  没有 page 可重置；
* 超时语是 `NODE_HOST_BUDGET_CLAUSE`，说明**这次渲染真的还在跑**，并给出可执行的杠杆（少几小节 / 降 `sampleRate` / 单声道 /
  `startBar`/`endBar` 区间 / 抬高自己的客户端上限）；
* 上限可被 `GROOVE_MCP_RENDER_TIMEOUT_MS` 覆盖（进程级，模型看不到）—— 运维给批处理设上限，判据也靠它把 900 s 压到 150 ms
  来**观察**这条语真的会出现。

**端到端实测这句（真 bundle，`GROOVE_MCP_RENDER_TIMEOUT_MS=30000`）**：

```
"the render of chicago-house — 48.0s of audio, 1 pass(es) of a 384-step pattern at 120 bpm — did not answer
 within 30s — the Node host render did not finish in that time; render fewer bars, a lower `sampleRate`, mono
 `channels`, a `startBar`/`endBar` span, or raise your own client timeout — which is the other ceiling and not
 this server's to set"
```

调用在 **30 164 ms** 返回（上限 30 000 ms）。⚠️ **多出的 164 ms 是量到的边界**：`setTimeout` 只能在事件循环空出来时触发，
而渲染是同步的，所以"上限内"是**近似**的 —— 上限是起点，不是硬墙。这一点写在这里而不是留给读者自己发现。

⭐ **另外**：`render_song {headless:true}` 现在**带 `progressToken` 时不再沉默** —— `prepareOfflineAudioLanes` 先报
"recordings ready: n of N"（换算到 render 自己的帧数区间，前 1/10），`startRendering` 再报帧；无 token 则一如既往地安静。

⚠️ **没做到的**：**没有任何东西能真正中断已经在跑的 `startRendering()`**。超时保证的是**调用方拿到答案**，不是渲染被取消；
超时之后那次渲染会自己跑完。这不是"修好了 135.9 s"，而是"不再无输出地挂住"。

---

## ② 重复下载：同一进程里两次渲染 = 两遍全量

### 同一首歌，同一进程，连续两次（`render_song {headless:true}` ×2）

| | 第 1 次 | 第 2 次 | 合计 |
| :--- | ---: | ---: | ---: |
| 墙钟 | **56 331 ms** | **37 327 ms** | 93.7 s |
| 网络请求 | 134 | **134** | **268** |
| 去重 URL | 134 | 134 | **134** |
| 每个 URL 被下载几次 | 1 | 2 | **2** |
| 下载字节 | 3 205 896 | 3 205 896 | 6 411 792 |

**修前**：`fetch-r2.log`（同条件，缓存关闭），**268 请求 / 134 URL / 每个 2 次 / 6 411 792 字节**。取样方法：`--import` 的 fetch tap
逐条落盘，`Map<url,count>` 统计。

**根因（审计已指出的两处，本文复核为真）**：

* `src/audio/sampleLoader.ts:182` 的 `const cache = new Map<string, Promise<DecodedSample>>()` 是**函数内局部变量** —— 随
  loader 生灭；
* 每次渲染都新建 loader：`mcp/render/worker.ts:1491`（页面路径的 audition）、`mcp/render/headless.ts:486`（Node host 的
  audition）、`src/audio/WavExporter.ts`（`renderPatternOffline` 自建，本文改动前在音频车道块内 inline）；
* 因此 `renderPatternOffline` 的每一次调用都从空缓存开始 —— 而 **`render_arrangement_stems` 每轨调用它一次**。

### `render_arrangement_stems`：N 轨 = N 遍（3 轨夹具，`freepats-drawbar-organ`，每轨 4 个音）

| | 缓存关（修前形状） | 缓存开（修后） |
| :--- | ---: | ---: |
| 墙钟（3 轨） | **25 483 ms** | **16 576 ms**（⚠️ 两者 DSP 工作量相同，这个差额在单次读数里分不清是缓存收益还是负载漂移，只当参考） |
| 请求总数 | **15** | **5** |
| 去重 URL | 5 | 5 |
| **每个采样被下载几次** | **3**（= 轨数） | **1** |
| 下载字节 | 4 624 932 | 1 541 644 |
| 逐 URL 重复 | `…Emulation-20190712.sfz` ×3，`samples/C4.wav` ×3，`E4.wav` ×3，`G#4.wav` ×3，`C5.wav` ×3 | 无 |

业主报的 "西班牙吉他 ~60 文件被重复下载 5 次" 是**同一机制在 60 文件 / 5 轨上的放大**：夹具小，所以读数是 5×3，形状一致。

### ⭐ 下载 vs 解码：分开量

**方法**：`mcp/render/sampleCache.ts` 在**取字节**和**解码**两侧各埋一个 `performance.now()` 括号，分别累加
`networkMs` / `decodeMs`，`decoded` 记调用次数。用真渲染器（Node host，夹具见上）跑两遍，同一进程：

| 运行 | 墙钟 | 下载 ms | 解码 ms | 请求 | 磁盘命中 | 解码次数 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 第 1 次（冷） | 580 | **11** | **2** | 3 | 0 | 2 |
| 第 2 次（暖） | 274 | **0** | 1 | **0** | 3 | 2 |

**结论**（含边界）：在这个小夹具上**下载与解码都只有毫秒级，墙钟由 DSP 主导**；真实歌曲上，第一次渲染的 134 条请求合计
**62 028 ms**（首字节＋body，并发下含排队）**≈ 第一次 56.3 s 墙钟的全部**，第二次 **0 ms** 网络、墙钟 37.3 s —— 也就是说
**网络是第一次渲染里最大的一块，而它就是"重复下载"那一块**。⚠️ 本机没有把"解码"单列到能分辨的程度（每采样约 1 ms，
134 个约 0.1 s 级），**所以"解码占多少"这条我给不出可靠读数，如实记**。

---

## ③ §106 出处表（行业主流与优秀开源怎么做）

**查得到的**：

| 题目 | 出处（URL） | 逐字原句 |
| :--- | :--- | :--- |
| 网页采样器的持久缓存 | <https://raw.githubusercontent.com/danigb/smplr/main/README.md>（"Caching samples"） | *"To cache samples in the browser, use a `CacheStorage` object: … `const storage = CacheStorage();` // First time the instrument loads, will fetch the samples from http. Subsequent times from cache."* ／ *"⚠️ `CacheStorage` is based on the [Cache API] and only works in secure environments that run over `https`."* |
| 缓存**怎么持久化**（键） | 同上 | 该实现绑定 **Cache API**：请求 URL 即键（浏览器的 HTTP 缓存语义），**不写内容 hash**；smplr 没有给出上限或淘汰策略 |
| **预热 + 进度 + 就绪门** | 同上（"Wait for audio loading" / "Load progress"） | *"You can start playing notes as soon as one sample is loaded. To wait for all of them, await either: `piano.ready`"* ／ *"Track how many samples have loaded via the `onLoadProgress` option or the `loadProgress` getter: … `total` is known before loading starts, so you can display a determinate progress bar."* |
| **只下载这次要用的**（"用到的"这件事的形状） | 同上（"Load only the notes you need"） | *"Every instrument accepts a `notesToLoad` option to load only the samples needed to play some notes and velocities … `notes`: MIDI numbers, note names or the instrument's sample names … Every sample that covers one of them is loaded."* ／ *"`fallback`: what to play for a note that wasn't loaded. `"none"` (the default …) plays nothing"* |
| **离线渲染是否共享缓存** | 同上（"Buffer reuse"） | *"If you already have an instrument loaded, pass the same `SampleLoader` to avoid re-fetching samples: … // Offline render reuses cached buffers — no re-fetch"* ／ 共享 loader：*"`loader`: a shared `SampleLoader` instance. Pass the same loader to multiple instruments to cache buffers across them."* |
| Tone.js 是否缓存解码结果 | <https://tonejs.github.io/docs/14.4.79/ToneAudioBuffer> ／ <https://tonejs.github.io/docs/15.0.4/classes/ToneAudioBuffers.html> | 文档只声明 `ToneAudioBuffer.load(url)` 与 `ToneAudioBuffers` 的键值容器语义，**没有**写"落盘缓存/上限/淘汰"——**未找到** |

**未找到（明确记录）**：

* **sfizz 的 `FilePool` 有没有磁盘缓存／容量上限** —— `man sfizz_jack(1)`（<https://man.archlinux.org/man/sfizz_jack.1.en.raw>）与本次检索到的一手材料里**未找到**关于"磁盘缓存位置/上限/淘汰"的说明；仓库里既有的对照引用（`src/audio/sfz/defaultPath.ts` 引 `Region::parseOpcode` / `FilePool`）讲的是**路径解析**，不是缓存。
* **Kontakt 的磁盘缓存位置与上限** —— 检索到的只有手册 PDF（西语版等）与论坛帖，**未找到**可逐字引用的官方定义（DFD 是"从磁盘流式读"，与"缓存"不是一回事）。
* **Ableton Live 的 `.asd` 分析缓存** —— 官方手册章节 *"5. Managing Files and Sets"*（<https://www.ableton.com/en/live-manual/12/managing-files-and-sets/>）讲的是文件管理；**未找到**"解码后 AudioBuffer 落盘缓存 + LRU"的逐字说明。
* **Decent Sampler 用 IndexedDB 的官方说法** —— 检索到的是开发者指南 PDF，**未找到**"IndexedDB 缓存"这一句。
* **"离线渲染器先取齐再算"是否算标准做法** —— 只找到 smplr 的 "Buffer reuse / no re-fetch" 一条旁证；**没有找到**任何一份把"预取门"写进离线渲染契约的一手材料，所以本仓的做法是**按 smplr 的在位形状复用**，不是"行业标准"。

---

## ④ 选的形状与理由

### 键：**库 + 库内相对路径**，不是 URL

* **凭据**：`GROOVE_SAMPLE_ROOT` 与每库的 source/mirror 是 **base**；`sampleManifest.ts` 用
  `mirrorSfzUrl(manifest, entryId, root, programSfz)` 拼 mirror，而 `sampleAssetForPath` 把 region 的 `sample=` 解析**相对 program
  URL** —— 所以换 base 只改 URL，不改"是哪个文件"。用 URL 当键 ⇒ 换镜像 = 100% miss = 重下全部，**正是这次要消掉的重复**。
* **pin 在键里**：键取 URL 的 `pathname + search`、**丢掉 origin**；`sfz.path` 从尾部减掉就得到**库根**，而这个根**含 commit**
  （本仓自己的 manifest 里长这样：`https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/9f04cf9a7345/Programs/01-basic-kit.sfz`）。
  同一库换 host ⇒ 键相同（命中）；同一路径换 revision ⇒ 键不同（不命中）。**两个不同的库在同一 host 上不会撞**（路径不同）。
* 实现：`src/audio/sampleCacheKey.ts`（纯函数，无 fs / 无 fetch / 无时钟，浏览器侧也能 import）。文件名为
  `sha256(key).bin`，键版本写进键（`v1`），改键即天然 miss。
* 程序的文本（`.sfz` + `#include`）用另一个键：`programCacheKey(url)`，**保留 host** —— 程序的 URL 本身**就是 pin**，
  这里没有"换 base 仍应命中"的需求，而"不命中"是安全方向。

### 存什么：**原始字节**，不是解码结果

`decodeAudioData` 产出的 `AudioBuffer` **属于产生它的 `BaseAudioContext`**（每次渲染都新建 context），所以解码结果**跨渲染不可移植**；
字节可以。解码仍是本机 CPU 一步，并在 §② 里被单独计量。

### 位置与上限

* 目录：`GROOVE_SAMPLE_CACHE`，否则 **OS 自己的每用户缓存目录**（`%LOCALAPPDATA%` / `~/Library/Caches` / `$XDG_CACHE_HOME` 或
  `~/.cache`）下的 `groove-samples`。**任何平台上都不看 `os.tmpdir()`** —— `/tmp` 在本机是 7.8 GB 内存盘且被写满过一次；
  重启即失的缓存不叫持久缓存。`off` 关闭。
* 上限：`GROOVE_SAMPLE_CACHE_BYTES`，默认 **512 MB**。**整文件 LRU**：读命中 `utimes` 触碰，写在**之后**扫一遍，
  从最久未用的开始删到上限以下。`0` = 不设限（显式选择，不是默认）。
* 清缓存：`npm run cache:clear`（`vite-node scripts/sample_cache.mjs --clear`），看状态：`npm run cache:stats`。**不做成 MCP
  工具** —— 缓存是服务器基础设施，不是作曲工具，工具面上的每一个名字都是模型可以误调的。
* **失败绝不缓存**：只有 2xx 且 body 非空才写盘，`sampleLoader` 的两条内存缓存规则（single-flight、失败不留）在磁盘层继续成立 ——
  磁盘正是"把一次 502 变成永久故障"的地方。

### 跨渲染共享

`mcp/render/sampleCache.ts` 里 `processSampleStore()` 用一个模块级 `Map<directory, SampleByteCache>` 持有**每进程一份**字节仓；
每个渲染各自建 `decoderFor(context, decode)`（decoder 属于 context），但**都读同一个仓**。这是业主"至少在同一 MCP server 进程内
共享"的最小可用一半，另一半（跨进程）由磁盘给出。

### 预热门

`src/audio/offlineAudioLanes.ts` 的 `prepareOfflineAudioLanes()`：用渲染器**自己的** `planOfflineAudioLanes` 拿到这次要用的
recordings，**按 recording 去重**，逐个 `load`/`loadNote` 填缓存，报 `loaded/total` 进度与 `problems`。形状**照抄**
`src/audio/samplerLanePrepare.ts`（Web 侧刚按 smplr 做过的那套），**没有造第二套**。渲染器在
`src/audio/WavExporter.ts` 的音频车道块里、`startRendering()` 之前调用它，报告走 `onAudioLanePreparation`，
问题句进 `audioLaneProblems`（`reportSampledLaneProblems` 的形状）。

---

## ⑤ 判据与证红

六条判据（`src/test/mcpSampleCache.test.ts`、`src/test/mcpHeadlessTimeout.test.ts`）与"把修复去掉即红"的实跑：

| 判据 | 绿 | 去掉什么 ⇒ 红 | 红读数 |
| :--- | :--- | :--- | :--- |
| ① 第二次渲染 0 新下载、0 新解码（同进程） | 15+2 通过 | `processSampleStore()` 每次返回新仓 | **1 failed**（"shares one store between two wirings built with no store of their own"）；早期形态的变异同时打红 8 条 |
| ② `render_arrangement_stems` N 轨每采样只下 1 次 | 通过 | 同上 | 打红；另用真实 bundle 前后对照：**15 → 5 请求，每 URL 3 → 1** |
| ③ 新进程仍 0 新下载 | 通过 | 去掉 `store.writeKeyed(key, bytes)` | **8 failed**（"is a hit from a brand-new store over the same directory, with zero requests" 等） |
| ③b 换 base URL 仍命中（键非 URL） | 通过 | `sampleCacheKey` 改成返回 `asset.url` | **2 failed**（"keys one pinned library identically when it is served from two hosts"、"answers a download made under one address from the other, with nothing on the wire"） |
| ④ 预热门：渲染前所有需要的采样已在缓存 | 通过 | 去掉 `prepareOfflineAudioLanes` 调用 | **1 failed**（真渲染器那条："fetches every recording before the render starts" → `expected +0 to be 2`）；纯单元侧两条同时打红 |
| ⑤ P0-2：上限内出 WAV，或上限内失败并给理由 | 通过 | 去掉 `withNodeHostBudget` 包住 Node 分支 | **1 failed**（"rejects with a reason and the levers, rather than staying silent"，elapsed 4073 ms > 上限） |

"无输出地挂住"这条的证红方式是把上限拿掉：mock 的 `renderPatternHeadless` 4 s 才回，而没有上限时**调用就跟着它走** ——
4 s 后返回、落在 `elapsed < 2 s` 上失败。这就是业主看到的形状（只是他那里是 300 s）。

---

## ⑥ 未核实 / 判不了（如实列）

1. **解码占多少**：本机夹具下每采样约 1 ms，分辨不出来（§② 已写）。真实歌曲的"解码总时长"**未测**。
2. **`render_song {headless:true}` 的 135.9 s 有没有被这次改动改短**：§② 显示第二次渲染 56.3 s → 37.3 s（省掉网络），
   但没有做过"改动前后同一首歌的严格对照"（环境有负载漂移）。**没测**。
3. **`GROOVE_SAMPLE_ROOT` 换到另一个镜像后仍命中**：键的构造保证（同 path、同 pin），单测覆盖；**没有**用第二个真实镜像端到端跑过。
4. **并发两个渲染同时冷启同一采样**：写盘是 `tmp + rename` 的原子写，逻辑上安全；**没有**并发压测过。
5. **浏览器路径是否受益**：`renderPatternOffline` 的 decoder 已是可注入的，浏览器调用方（`WavExporter` 的默认）**仍然不带**磁盘缓存
   —— Node 侧有 `node:fs` 才谈得上"磁盘"，浏览器侧要落盘得用 Cache API/IndexedDB，**这次没做**（smplr 用的是 Cache API，见 §③）。
6. **缓存是否正确处理 range 请求 / `smpl` 头**：`createWaveLoopReader` 仍走 `Range`（206）请求，**不经过**字节缓存；
   也就是说带 `smpl` 循环的录音在第二次渲染里**仍可能发 Range 请求**。本次夹具的录音没有循环，**没测到**。
