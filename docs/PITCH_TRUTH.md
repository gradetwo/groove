# 音高真相：一个真相、处处显式、随时可撤

**业主定的方向（2026-10-01，逐字）**：

> 不要试图"保证用户永不搞错"，而是让系统内部**只有一个音高真相**，**所有可能移调的地方都显式、可见、可撤销**。

> MIDI 文件本身只存 MIDI Note Number 0–127，并不存"C3/C4/C5"这种名称。**导入时天然差八度，通常不是 MIDI 文件错，而是软件显示、音源根音、自动移调、鼓轨处理等环节出了问题。**

这份文档是同名目标的**第一步：对着业主要求逐条审计**（§1），然后才是交付（§2 起）。

---

## §1 审计：十一条现状（每条带出处，不写"大概有"）

### 1. 内部只用 Note Number + cents —— **✓ 已成立**

**不是"要实现"，而是"要暴露"** ✓。实测：`render_instrument_note({assetId:"vsco2ce:ViolinEnsSusVib", midi:60, seconds:1})` 的 `resolved` 返回

```
{ samplePath: "Strings/Violin Section/susVib/VlnEns_susVib_B2_v2.wav", rootKey: 59, ratio: 1.0594630943592953 }
```

**`ratio` 恰为 `2^(1/12)`（`rootKey 59` → note 60 的一个半音）** ✓，且**两条路（`render_instrument_note` 与 `render_arrangement` 采样 lane）在同资产同音符上实测相差 ≤12 音分**（`scripts/probe_instrument_pitch.mjs`，九条用例、真实退出码 ✓）。

### 2. 默认 C4 = 60、可切 C3/C4/C5 —— **✗ 不成立，而且项目里两种约定同时存在**

| 位置 | 约定 |
| --- | --- |
| `src/data/musicxml.ts:41` | "**MIDI 60 is C4**" |
| `src/data/musicxmlImport.ts:86` | "**the same C4 = middle C convention as the writer**" |
| `src/audio/MidiInputManager.ts:34` | `",": 60, // C4` |
| `src/audio/PolySynth.ts:1238` | "**Middle C … a preset that says "2.6 kHz" means 2.6 kHz at C4**"（key tracking 的锚） |
| **`src/audio/AbletonExporter.ts:65`** | **`baseNote: 60 … // C3`** ✗ |
| **`src/audio/AbletonExporter.ts:66`** | **`baseNote: 72 … // C4`** ✗ |

⇒ **同一份代码里 MIDI 60 既是 C4 又是 C3** ✓。导出器跟随 Ableton 自己的约定**可以是有意的** ✓，**但它必须被标明，并且必须有一个全项目唯一的默认** ✓。**没有找到任何可切换的设置** ✗。

### 3. 导入默认原样、不静默移调 —— **~ 部分成立**

* **没有自动移调** ✓：`src/data/midiToArrangement.ts` 按**轨道块**分组（`format 0` 才按通道拆，`:49-65` ✓）；Logic 导入的 `readNotes` 直接读 `payload[at+0x0c]` ✓（删除测试为"pitch +1 → 红" ✓）。
* **但没有"超出音域只警告、并给试听原样/试听移调/取消"的流程** ✗。

### 4. 音源侧根音/移调/八度/微调可见 + 校准 —— **~ 部分**

* **`resolved` 只在 `render_instrument_note` 上** ✓✓（实测有效 ✓）；**`render_audio` / `render_song` / `get_arrangement` / `import_arrangement_midi` 都没有** ✗（逐工具 grep ✓）。
* **校准仪器已经存在** ✓✓：`scripts/probe_instrument_pitch.mjs`（同资产同音符**两路并测**、自相关求基频、±25 音分、**退出码 0/1** ✓），以及 `scripts/probe_gs1_calibration.mjs` ✓。
* SFZ 侧**本来就解析** `tuneCents`（`src/audio/sfz/parse.ts:320`，含 `tune_ccN` 曲线 `:163-170` ✓）与 `pitchKeycenter`（`:318`，**未设置即 `undefined`，无默认移调** ✓）。

### 5. 所有移调集中管理、显示总偏移 —— **✗ 不成立：六处来源，没有统一报告**

| # | 来源 | 出处 | 量纲 |
| --- | --- | --- | --- |
| 1 | **轨道 `transpose`** | `src/types/song.ts:90`（注释写明 **±24**，并逐音夹回 MIDI 范围） | 半音 |
| 2 | **段落 `transpose`** | `src/types/song.ts:186`；取值点 `sectionTranspose()` `:210`；应用点 `:298-310` | 半音 |
| 3 | **SFZ `tune` + `tune_ccN`** | `src/audio/sfz/parse.ts:37/88/320` | 音分 |
| 4 | **SFZ `pitch_keycenter`** | `src/audio/sfz/parse.ts:318` | 半音（区域根音） |
| 5 | **GS-1 `OSC1_PITCH` 等** | `SequencerTrack.gs1PatchOverrides`（2026-10-01 落地） | 引擎原值 |
| 6 | **和弦音区偏移** | `src/data/genreExpression.ts:74`（写进音高，**非破坏性** ✓） | 八度 |

**另外**：`pitch bend` / 自动化移调**没有查到**（未测，见 §1.11 的诚实边界）；**鼓轨没有任何特判** ✗；**记谱移调乐器没有任何处理** ✗。

### 6. 导入向导七步 —— **✗ 不成立**

导入是 MCP 工具调用，不是向导 ✓。**MCP 的对应物应当是回复里的"音高计划"** ✓：解析摘要（格式/PPQ/轨数/通道/音高范围/疑似鼓轨 ✓）、映射 ✓、音高检查 ✓、警告 ✓、**用内置参考音源试听** ✓。

### 7. 音高检查器 —— **✗ 不成立 ⇒ 本目标的主交付**

**没有任何 MCP 工具能回答**："这个音是什么编号、显示成什么名、多少 Hz、落在哪个采样的哪个根音上、比率多少、偏差多少音分、被谁移调" ✗✓。

### 8. 导出必须问"原始音高 / 当前听到的音高" —— **✗ 不成立**

`src/audio/MidiExporter.ts` 与 `src/audio/AbletonExporter.ts` 里**既没有 `transpose` 也没有 original/heard 选项** ✓（grep 为零）。**与导入文件的往返对比**也没有 ✗。

### 9. 移调乐器单独处理、默认关闭；通道 10 默认鼓 —— **✗ 不成立**

`src/data/midiToArrangement.ts:49-65` 只按轨道块分组，**通道 10 与鼓没有任何特判** ✗；**记谱移调乐器（短笛 +12、低音提琴 −12…）没有处理** ✗。

### 10. 文档与默认值、工程记录约定 —— **✗ 不成立**

工程/分享链接里**没有记录中央 C 约定的字段** ✗；也没有"旧工程迁移提示" ✗。

### 11. 测试清单 —— **~ 部分**

**已覆盖** ✓✓：`Note 60 → 261.63 Hz`、`Note 69（A4）→ 440 Hz`、**根音设错时能被测出**（`probe_instrument_pitch.mjs` 的九条用例 ✓）。
**未覆盖** ✗：导入→导出往返 Note Number 不变；切换 C3/C4/C5 显示而声音不变；**通道 10 不被移调**；全局 +12 后"导出原始 / 导出当前"两种结果；第三方音源移调时检查器能显示实际输出偏差。

### 诚实边界（未测到的，写明试过什么）

* **`pitch bend` 与自动化移调**：只在 `src/types/song.ts` 的类型面与 `src/audio/*.ts` 里搜过 `transpose|octave|detune|pitchOffset|tune|semitone|keycenter` ✓，**没有搜到"自动化驱动移调"的路径** ✗✓——**但这是"没搜到"，不是"不存在"** ✗；要确认得读自动化轨道的数据结构与它在渲染时的取值点 ✓。
* **`render_arrangement` 是否真的返回 `resolved`**：grep 在它名字后 80 行内数到 1 次 ✓，**而那段窗口可能含散文** ✗✓——**未做实测**，要判它得真调一次并看回复字段 ✓。
