# 添加自己的音源（web 与 MCP）

> **历史审计（2026-10-01）**：本文是「添加自己的音源」的第一步审计，其 §1 记录的是当时「还缺什么」的快照；该功能已于 2026-10-01 当晚落地（`src/data/userLibraries.ts`、`src/components/settings/SampleLibrariesPanel.tsx`、MCP 工具 `add_sample_library`）。§2 的设计与 §3 的两项实测结论仍然成立，并已成为现行实现；§1 中「今天不能」「web 侧没有界面」等句仅作历史记录，不再描述现状。

**业主指令（2026-10-01，逐字）**："考虑增加功能 **web 和 mcp 都支持添加自己的音源**，例如自己觉得更好的管弦"

这份文档是**第一步：审计"今天要跨过哪几道坎"** ✓✓——**每条带 file:line 或实测** ✓，**不写"大概有"** ✗。审计之后才是交付顺序。

---

## §1 审计：七个问题，逐条有出处

### 1. 采样清单从哪来、怎么组装 —— **已具备，且入口是可注入的** ✓✓

* `src/data/sampleCatalogueRuntime.ts:39` `createCatalogueRuntime(options)` ✓；
* **`:31` `CatalogueRuntimeOptions = { root?, manifestUrl?, fetchImpl? }`** ✓✓——**三样都可注入** ✓；
* **`:41` `manifestUrl ?? "/samples/manifest.json"`** ✓；**`:42` `fetchImpl ?? ((url) => fetch(url))`** ✓；
* **`:62` `catalogueFromManifestText(await response.text(), root)`** ✓ → `src/data/sampleCatalogue.ts:128` ✓ → `parseManifest` / `sampleAssetsFromManifest`（`src/data/sampleManifest.ts` ✓）。

**两处诚实护栏（值得保留为规范）** ✓✓：
* **`:50-51`：`root` 为空 ⇒ 直接返回空清单**，"**rather than a fetch that cannot work**" ✓；
* **`:57-60`：manifest 失败被报告且不缓存** ——"**a 404 from a mistyped root must not become permanent**" ✓✓；
* **`:70-72`：`inFlight` 在 `finally` 清空**，"**which is what makes a retry possible**" ✓。

### 2. 清单能不能被"加一条" —— **今天不能，但挂点很清楚** ✗✓

* 清单是**取来的文档**，被渲染成内存里的 `assets` 数组（`:44` ✓），**没有写入路径** ✗；
* **但 `manifestUrl` 与 `fetchImpl` 都可注入** ✓✓，所以"换一份清单"是现成的；"**在主清单之外再加几条**"**需要在解析后、`withProgramIds` 之前合并** ✓（**见 §2 的设计**）；
* **可写存储的先例已有** ✓✓：`localStorage` 用于 `groove_audio_settings_v1`（`src/audio/AudioEngine.ts:1039/1073` ✓）与 onboarding（`src/App.tsx:174` ✓）。

### 3. 取字节的路径 —— **两处 `fetch`，都能吃 blob:/data:** ✓✓

* `src/audio/browserSampleGraph.ts:32` `fetch(asset.url)` → `:35` `decodeAudioData(await response.arrayBuffer())` ✓；
* **`:43` `fetch(asset.fallbackUrl)`** ——**镜像兜底** ✓✓（`SampleAsset` 的注释写明"`url` is the **pinned source**, `fallbackUrl` the mirror — **tried only when the source fails**"，`src/data/sampleCatalogue.ts:50` ✓）；
* `src/audio/sampleLoader.ts:86` `fetch(url)` ✓（第二处，**同为 `fetch`，所以同样支持 `blob:`／`data:`** ✓）；
* **跨域要 CORS** ✓——`raw.githubusercontent.com` 会给 ✓，**而这正是镜像机制存在的理由** ✓。

### 4. 镜像机制 —— **`root` + `prefix`，与源是两套地址** ✓✓

* `sampleManifest.ts:260` 起：**`sourceSfzUrl` → `repo/pin/sfz`** ✓；**`mirrorSfzUrl` → `root/prefix/sfz`** ✓；
* 它自己的注释记着这条坑："**Two layouts, two addresses: the source is `repo/pin/sfz`, the mirror is `root/prefix/sfz`**" ✓✓，**且 `prefix` 只属于镜像布局** ✗✓。

### 5. 许可与出处 —— **本来就是一等公民** ✓✓

* `list_sample_libraries` 的描述即"**the libraries this project has pinned, with the licence and the provenance of each**" ✓——**所以"用户自己的库要报许可与出处"是既有形状** ✓；
* **⇒ 但用户库必须允许"许可未知"这个答案** ✗✓：**不许默认成某个许可** ✗（**那比不说更糟** ✓）。

### 6. 两个面 —— **MCP 有半个，web 一个都没有** ✗✓

* MCP 侧最接近的：`list_sample_libraries` ✓、`inspect_instrument_sfz` ✓（**按 URL 检查 SFZ** ✓）；
* **web 侧没有任何"采样库管理"界面** ✗✓：`src/components/` 下是 analyzer／arrangement／chords／console 等 ✓，**没有 samples** ✗。

### 7. 不许出现第二条路 —— **只要在清单层合并，就仍然只有一条** ✓✓

* 解析入口唯一：`resolveInstrumentNote` → `playbackForNote`（`src/audio/sfz/instrument.ts:77` ✓）；
* 资产 id 唯一来源：`withProgramIds`（`sampleManifest.ts:37-44` ✓，`assetId = ${entryId}:${slug(basename(sfz))}` ✓）；
* **⇒ 合并必须发生在 `withProgramIds` 之前** ✓✓，**否则会出现"同一个 SFZ 两个 id"或"两条加载路"** ✗。

---

## §2 代码定下来的设计（不是我想出来的，是读出来的）

**用户音源 = 往清单里多一条条目** ✓✓，形状与内置条目一致（`repo`／`pin`／`prefix`／`sfz`／`licence`／`sourceUrl` ✓）：

1. **登记**：一条小记录（**id、`repo`/`pin` 或 `root`/`prefix`、`sfz` 路径、`licence`、`sourceUrl`** ✓）——**存 `localStorage`** ✓（照 `groove_audio_settings_v1` 的先例 ✓）；
2. **合并**：在 `createCatalogueRuntime` 拿到 manifest 之后、`withProgramIds` 之前，**把用户条目并进 `entries`** ✓✓；
3. **取件**：**沿用 `url`/`fallbackUrl`** ✓——用户库**给什么用哪个** ✓（源可用则源 ✓，否则镜像 ✓）；
4. **两个面共用同一段核心** ✓✓：MCP 工具（如 `add_sample_library` ✓）与 web 界面**写同一份登记** ✓；
5. **音高检测必须跟上** ✓✓：用户库**正是最可能标注有问题的** ——**`get_pitch_report`（`assetId` + `midi` ✓）与 `scripts/probe_instrument_pitch.mjs` 已经在了** ✓，**登记后要能直接对它跑** ✓。

**⇒ 之所以这是"较优方案"** ✓✓：**它没有新增任何加载路径、没有新增第二个解析器、没有动 `assetId` 的生成** ✓——**只是在清单进入系统之前，多了一条来自用户的条目** ✓。

---

## §3 两件实测：一处**未能复现**，一处**决定了下一步怎么做** ✓✓（2026-10-01）

### ① "标签高亮不对" —— **未能复现，而且原说法是我的错** ✗✓✓

**我上一轮报告说**：面板内容是对的，但被画成"活动"的标签是 `Audio` ✗。**我没有直接去修，而是先量** ✓——**结论是我看错了那张 PNG** ✗✓。

**测法与结果** ✓✓：用 Playwright 打开设置、点 `settings-tab-sound`，**读六个标签的 `aria-selected`（它绑在真实状态 `tab === id` 上 ✓）以及实际的活动 class** ✓：

```
打开设置后:  audio selected=true  activeStyle ✓ · sound selected=false plain ✓
点 Sound 后: audio selected=FALSE plain ✓ · sound selected=TRUE activeStyle ✓
```

**新截图也一致** ✓（`Sound libraries` 是唯一的强调色胶囊 ✓，面板内容也对 ✓）。

**⇒ 记下来而不是抹掉** ✓：**这是本项目那条规矩的正面例子——先测，测出来不是 bug 就如实说"未能复现 + 试过什么"，而不是去"修"一个不存在的问题** ✓✓。

### ② `durationSeconds` 到底被用来干什么 —— **决定"量一个音"够不够** ✓✓

**查法**：把 `durationSeconds` 与 `asset.seconds` 的所有消费方都读一遍 ✓。**结论** ✓✓：

* **它变成资产的 `seconds`**（`sampleManifest.ts:377` ✓）；
* **而唯一消费它的地方是 `mcp/instruments.ts:83`，只把它列出来** ✓——**其余所有 `seconds` 都是**音符时长**（`offlineAudioLanes.ts:356`：**"`event.seconds` is the note's length"** ✓）或别的模块的同名参数 ✗✓；
* **⇒ 唯一的硬要求是"它必须是个正数"**（`sampleManifest.ts:318` ✓）；
* **⇒ 而清单自己的注释已经写明这个数字的立场** ✓✓：**"A catalogue entry with an invented duration would be a wrong number where a missing one is honest, and this project has spent enough on numbers that came from nowhere."**（`sampleManifest.ts:309` ✓）。

**⇒ 下一步的设计由此确定** ✓✓：**量一个音可以解开"用户库进不了目录"这个死结 ✓，但要把数字的来路写明** ✓——**一个音渲染出来的长度是下界，不是整库时长** ✗✓——**这与 `get_pitch_report` 里 `claimOnly: true` 是同一个做法** ✓✓：**承认测量方法的边界，而不是把下界当总量报出去** ✓。
