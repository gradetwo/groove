# GROOVE 开发期 AI 生产线（生图 / 图像编辑 / 其它模型）

> **定位**：这份文档讲的是**用 AI 来开发 groove**（做资产、做素材、做测试基准、做文档与演示），
> **不是**往 groove 里加 AI 功能。所有产出都落在仓库的开发资产里，随仓库分发的是文件本身，
> 不是模型调用。
>
> 工具：`colabgen`（本机 CLI，租 Colab GPU 跑 Qwen-Image-2.1 / Qwen3-TTS / Qwen3-ASR /
> YuE2 等；用法见 `~/skills/colabgen/SKILL.md`）。相关：`docs/COLAB.md`。

---

## 0. 一句话结论

groove 目前有 **160 个曲风**、**7 套皮肤**、PWA 图标族、`docs/screenshots`、e2e 音频/视觉基准，
这些地方**现在就能用生图/编辑/语音/音乐模型显著提高质量或省掉外包**。其中优先级最高的是三件：

| 优先级 | 事项 | 收益 | 规模 |
| --- | --- | --- | --- |
| **P0** | 曲风配图 × 皮肤（替换现在爬来的图） | 直接决定第一眼质感；皮肤一致性 | 160 × 7 = 1120 张（可分批） |
| **P0** | e2e / 单测音频 fixture（YuE2 生成，免版权） | 测试不再依赖授权音频；可复现 | 每曲风 1 个 8–16s loop |
| **P1** | 演示视频 / 商店截图的旁白 + 字幕（TTS + ASR） | 商店与 README 的门面 | 每皮肤 1 条 |

---

## 1. 现状盘点（我实际读过的）

| 位置 | 现状 | 与 AI 生产线的接口 |
| --- | --- | --- |
| `public/covers/*.jpg` | 160 张爬来的实拍图 + `CREDITS.md` | 直接替换；`genreCoverUrl()` 是唯一解析点 |
| `src/mobile/genreArt.ts` | `genreCoverUrl(id)` **只有曲风维度、没有皮肤维度** | 需要加 `<skin>/<genre>.jpg` 一层 + 回退 + 单测 |
| `src/data/skins.ts` | 7 套皮肤，每套有 ground/ink/accent | 皮肤调色板 = 每个皮肤的生图风格锚点 |
| `src/skins/*.css`（注释指向） | 皮肤样式与 CSS 变量 | 提取真实色值写进 prompt / 后期校色 |
| `public/icons/*` | PWA 192/512/maskable + svg | 图标建议"生成母版 → 手工/矢量化"，不要直接出图标 |
| `docs/screenshots/` | 现有截图 | 可合成设备框、加旁白、做商店素材 |
| `src/views/*`（14 个）+ `src/components/*`（含 onboarding/help/masterclass/kick/console） | 大量"需要插画/纹理"的界面 | 空状态、帮助图、教程配图、硬件面板纹理 |
| `package.json` scripts | `skins:gen`、`check:skins`、`check:skin-roles`、`docs:check`、`test:e2e*` | 生成资产后用这些既有门禁校验 |
| `e2e-out/*` | e2e 产物快照 | 可做视觉回归 baseline（生成"标准图"） |
| `mcp/` | 有 MCP server 与工具注册 | 未来可把资产生成注册成 MCP 工具（见 §5.6） |

---

## 2. 图片生成：可用清单

> 通用参数：`--size 1:1|16:9|9:16|WxH`、`--steps`、`--seed`、`--preset`、`-n`。
> **默认 `--preset quality`（保精度）**；`draft` 只用于试构图。
> 2048² 直出（模型原生），RGBA 透明直出。

### 2.1 曲风配图 × 皮肤（P0，主战场）

- **目标**：每个皮肤里，160 个曲风的配图都符合该皮肤的艺术风格，且与曲风贴切。
- **做法**：一个"风格母版 prompt 模板"（每皮肤一份）+ 一个"曲风语义片段"（每曲风一句）。
  例：`<皮肤媒介与配色> + <曲风场景/乐器/材质> + <构图与光> + <禁止项>`。
- **落地路径**：`public/covers/<skin-id>/<genre-id>.jpg`，回退到 `public/covers/<genre-id>.jpg`。
- **规模/成本**：见 §6；建议按皮肤分批（一次一个皮肤，160 张），便于中途调整风格。
- **验收**：`check:skins` 通过 + 新增"每个 skin×genre 都存在"的门禁 + 人工看 contact sheet。

### 2.2 图标与 PWA 资产（P1）

- **可做**：图标母版（同一视觉语言的 3–5 个候选）、maskable 安全区版本、splash、`apple-touch-icon`、
  favicon 的多尺寸派生。
- **注意**：图标是**几何精确 + 小尺寸可辨识**的东西，直接生图容易糊、容易不对称。
  推荐流程：生成母版概念图 → 手工/矢量化 → 用脚本派生尺寸（不要用生图直接出 192/512）。
- **RGBA 有用**：母版透明底便于叠到底色上做 maskable 版本。

### 2.3 商店 / README / 社交预览（P1）

- **OG image / 社交卡片**：每个皮肤一张 1200×630，用该皮肤的配色与字体氛围。
- **商店截图**：`views/*` 的真实截图 → 图像编辑合成设备框（见 §3.4），再配旁白字幕（见 §4.1/4.2）。
- **README hero**：一张能代表"7 套皮肤"的风格拼贴（可用同一构图 × 7 风格，见 §3.1）。

### 2.4 界面插画与纹理（P1–P2）

| 用途 | 具体位置 | 提示 |
| --- | --- | --- |
| 空状态 / 错误页插画 | `views/ExploreListView`、`ErrorBoundary` | 每皮肤一套，风格随皮肤 |
| 帮助 / 教程配图 | `components/help`、`views/MasterclassView`、`views/KickAnatomyView` | **最有价值**：kick 包络、频谱、和弦图这类"示意插画"用图比 CSS 更好懂 |
| onboarding 步骤图 | `components/onboarding` | 3–5 步，确保与真实 UI 一致（先截图再风格化） |
| 硬件面板纹理 | `components/console`、`HardwareConsoleView` | 木纹/拉丝金属/塑料；**RGBA 直出**当叠层 |
| 唱机/磁带/贴纸装饰 | Galaxy/Studio/Compare 视图 | 透明 PNG，便于任意底色 |
| 皮肤预览缩略图 | 设置里的皮肤选择器 | 可用真实截图 + 该皮肤风格化 |

### 2.5 测试与视觉回归用图（P2，但很实用）

- **极端素材**：超大（4096×4096）、极端宽高比（1:4 / 4:1）、单色、高噪点、RGBA 全透明——
  用来压 `genreArt` / 画布组件的边界。
- **视觉 baseline**：给关键视图生成"标准图"，配合 e2e 做像素级回归（注意：生成式资产不适合做
  严格像素 diff，只适合做"结构/亮度"这类容差断言）。

---

## 3. 图像编辑：可用清单

> `colabgen edit <图...> -p "<指令>" [-r 参考图] [--mask 遮罩] -o out`
> 同一模型，**保持构图与主体**，只改风格/局部。

### 3.1 一图多皮肤（最省钱的风格矩阵做法）
先生成**一张**高质量的"内容母版"（构图、主体、信息量最好），再对每套皮肤做一次风格迁移：
`-p "restyle to <皮肤视觉语言>; keep composition, subject and framing identical; palette <hex...>"`。
好处：7 个皮肤之间**构图一致**，切换皮肤时不会"跳"，而且只付 1 次高质量生成的代价。

### 3.2 局部修复与清洗
`--mask` 修掉生成瑕疵（多余手指/文字乱码/水印残留）、去掉爬图里的水印与杂物、
把不想要的元素抹掉。**这是把"爬来的图"变成可用资产的关键一步**。

### 3.3 抠图 / 透明化
把实拍乐器、贴纸、面板做成 RGBA 直出，用于任意皮肤底色；也可"提取主体 + 透明背景"做图标母版。

### 3.4 放大与合成
- 超分/放大：1024² 母版 → 2048²/4K（大屏、印刷、商店大图）。
- 合成：把 `views/*` 截图放进设备框（手机/平板/笔电）做商店截图；
  把 UI 截图与生成的背景/纹理合成出"氛围图"。
- 精确校色：`-p "recolor strictly to these hex values: #xxxxxx, #yyyyyy; keep everything else"`，
  让配图与皮肤 CSS 变量完全一致（比后期手动调色更省事）。

### 3.5 多参考图
最多 10 张参考图：可用于"同一角色的不同姿势/不同曲风场景"、"同一场景不同皮肤"、
"把我的 UI 截图风格迁移成某皮肤"。

---

## 4. 其它模型（同样只用于开发）

### 4.1 TTS —— 旁白、字幕稿、i18n 试听
- **演示视频旁白**：为 store/README 的 60–90s 演示配音（`colabgen tts --model qwen3-tts-customvoice --speaker ...`），
  多语言各一版（`--language`）。
- **教程语音版**：把 `docs/*.md` 的要点转成可听的 walkthrough。
- **i18n 发音/语气试听**：把 `src/i18n` 里的关键文案念出来，检查长度与语气是否合适
  （尤其商店描述、按钮文案）。
- **语音编辑**（AuK 的能力，本地引擎）：旁白念错一句，不用整段重录，直接编辑那一句。
- **验收**：音频进 `docs/audio/`；脚本化生成，不进应用运行时。

### 4.2 ASR —— 把"说话"变成 issue 与字幕
- **语音备忘 → backlog**：录一段想法，转写成 `BACKLOG.md` 条目草稿（Qwen3-ASR 中英混说效果好）。
- **演示视频字幕**：给录屏自动出 SRT（同时服务于 A11y 与商店字幕），
  长音频用 Whisper / Qwen3-ASR，实时低延迟用 Confucius4-R2T2。
- **参考曲目打标签**：把参考曲/采样转写后做关键词提取，辅助 `src/data` 里曲风与标签的完善。
- **验收**：转写文本进 `docs/transcripts/`；字幕与视频同目录。

### 4.3 音乐生成（YuE2）—— **仅开发用**
- **测试 fixture**：为 e2e / 单测生成一批**免版权**音频（每曲风 8–16s loop），
  解决"测试依赖授权音频"的隐患。放在 `src/test/fixtures/audio/`（或你现有的 fixture 目录）。
- **参考质感**：给鼓机/合成器/混音工作提供"这个曲风大概应该长这样"的参照，用于 A/B 与听感校准
  （配合已有的 `check:loudness`、`check:timbre`、`AUDIO_REVIEW.md`）。
- **演示音轨**：给 README/商店做 demo 片段。
- **注意**：纯器乐生成上游不可靠（多份 issue 反映人声难完全去掉），器乐 fixture 建议先生成再多听几条挑。

### 4.4 预留接口（现在不做，但值得留位置）
- 和弦/节拍/melody 识别类模型 → 未来可做"导入音频自动填 pattern"的**开发工具**（批量造测试用例）。
- 人声分离 → 给测试准备"只有鼓/只有贝斯"的 stem fixture。
- 这些都可以挂在 `mcp/` 的工具注册里，作为开发者工具暴露给 agent，而不是应用功能。

---

## 5. 工程化：让生成变成可重复的流水线（关键）

一次性手工生图会烂尾；要当成**构建资产**来做。

### 5.1 元数据与 provenance
每张生成图旁边写一个同名 `.json`：
```json
{ "model": "qwen-image-2.1", "preset": "quality", "size": "2048x2048",
  "steps": 40, "seed": 12345, "skin": "comic", "genre": "deep-house",
  "prompt": "...", "generated_at": "2026-09-25T…", "tool": "colabgen 0.1.0" }
```
用途：可重建、可对比、可审计许可、皮肤调色板变了能精确重跑。

### 5.2 批量脚本（建议新增 `scripts/gen-covers.sh`）
```
按 skin 循环 → 复用一次热会话（colabgen up --warm qwen-image-2.1）
 → 逐曲风生成（已存在且 .json 里 prompt 未变则跳过）
 → 全部完成后 colabgen down
```
要点：**一个会话跑完一批**（模型只加载一次）；失败单张记入 `failed.txt` 继续；
结束时打印耗时与单位消耗（对比 `colabgen usage`）。

### 5.3 审阅用 contact sheet
生成一个 HTML 网格（160 张缩略图 + 曲风名 + 皮肤），一次看完而不是翻 1120 个文件。
建议放 `docs/asset-review/<skin>.html`（`docs:check` 不检查它的话就放 `e2e-out/`）。

### 5.4 门禁（复用你已有的结构）
- 扩展 `src/test/genreCovers.test.ts`：**每个 skin × genre 都要有文件**（先允许"某皮肤回退到公共图"的白名单，逐步收紧）。
- `src/test/genreArt.test.ts`：`genreCoverUrl(id, skin)` 的路径与回退规则。
- `check:skin-roles` / `check:skins`：皮肤集合变化时提醒配图矩阵需要重建。
- 资产体积：图片进仓库要考虑仓库体积（见 §5.5）。

### 5.5 体积与格式
2048² PNG 约 3–4MB/张 → 1120 张就是 3–4GB，**不能这么塞仓库**。
建议：生成 2048² 母版存档（仓库外或 Git LFS），**入库的是压缩后的 JPEG/WebP**
（1600px 长边、质量 82 ≈ 150–300KB/张），或放进已有的 dist/静态资源流程。

### 5.6 与 MCP 的结合（可选）
把"生成一张曲风配图"做成 `mcp/` 里的开发者工具，agent 就能在对话里直接补图；
本 CLI 已经是 JSON 接口（`--json`），包一层很薄。

---

## 6. 成本与档位（基于实测）

实测（A100 80GB，费率 6.77 单位/时）：2048²/40 步 = **85s/张**；25 步 = 53s；编辑 92s。
A100 40GB 5.30/时（更慢一点，可用 CPU offload）；G4（RTX PRO 6000 95GB）8.98/时。

| 方案 | 单张 | 1120 张总时长 | 约合单位（A100-80） |
| --- | --- | --- | --- |
| `quality` 2048²/40 步 | ~85s | ~26 h | ~180 |
| `quality` 2048²/25 步 | ~53s | ~16 h | ~110 |
| `draft`（6 步蒸馏，试构图） | ~15–20s | ~5–6 h | ~35–40 |

**建议的分批策略**（把风险切成小步）：
1. **试点**：7 皮肤 × 3 曲风 = 21 张，`quality`，≈25 分钟 ≈ 2.8 单位 → 定风格。
2. **单皮肤全量**：1 皮肤 × 160 张，`quality` 25–40 步，≈2.5–4 h ≈ 17–27 单位 → 定流程。
3. **剩余 6 皮肤**：按皮肤分批跑，随时可停。
4. 便宜路径：**一张内容母版 + 6 次风格迁移**（§3.1）替代 7 次完整生成 → 约省 40%。

---

## 7. 出处记录（轻量，非合规章节）

本项目为非商业开源，模型权重许可（Qwen-Image qwen-research、YuE2 CC BY-NC、AuK 的编码器等）
不作为约束条件。只保留一条**工程性**的习惯，目的是可追溯而不是合规：

1. 每张生成图旁边存 §5.1 的 `.json`（模型、preset、seed、prompt、皮肤、日期），
   皮肤调色板变了能精确重跑，出问题能定位是哪一批。
2. `public/covers/CREDITS.md` 加一节"AI 生成资产"，一句话列模型与日期，方便日后回看。
3. 模型**运行时**不进产品（产出都是静态文件），这条与许可无关，是体积和依赖问题。

## 8. 路线图（建议按此顺序）

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P0-a | 皮肤感知的封面解析（`genreCoverUrl(id, skin)`）+ 回退 + 单测 | 测试通过，未生成图的皮肤自动回退到现状 |
| P0-b | 风格规范 `public/covers/ART_DIRECTION.md` + 21 张试点 | 你确认 7 套风格方向 |
| P0-c | 逐皮肤全量生成（quality 25–40 步）+ contact sheet | `check:skins`/新门禁通过，仓库体积可控 |
| P1-a | 音频 fixture（YuE2，每曲风 1 个 loop） | e2e 不再依赖外部音频 |
| P1-b | 演示视频：TTS 旁白（多语言）+ ASR 字幕 | 商店/README 素材齐 |
| P1-c | 图标母版 + maskable/splash 派生 | 图标族一致、小尺寸可辨识 |
| P2 | 界面插画/纹理/教程配图（按视图逐个补） | 空状态与帮助页不再空白 |
| P2 | 视觉 baseline 与 MCP 工具化 | 可自动补图、可回归 |

---

## 9. 命令速查

```bash
# 会话（一次热会话跑一批，结束务必 down）
colabgen up --gpu a100-80 --warm qwen-image-2.1
colabgen usage                      # 看费率与余额
colabgen down

# 生成（默认保精度；draft 只用来试构图）
colabgen gen "<皮肤风格模板> + <曲风语义>" --size 1:1 --steps 40 --seed 12345 -o deep-house
colabgen gen "..." --size 16:9 --n 4 --preset draft        # 试 4 张构图

# 编辑
colabgen edit public/covers/hero.png -p "restyle to <skin>; keep composition identical" -o hero_comic
colabgen edit crop.jpg --mask repair.png -p "remove the watermark" -o clean
colabgen edit 1024.png -p "upscale to 4K, keep details" -o 4k

# 语音
colabgen tts --model qwen3-tts-customvoice --speaker Ryan --language English --text "…" -o demo_en.wav
colabgen asr --audio recording.m4a --json

# 音乐（仅开发 fixture）
colabgen serve yue2 && colabgen call --engine yue2 --path /run --body '{"action":"run","style":"deep house","lyrics":"…"}'

# 三档 preset 与模型清单
colabgen presets && colabgen engines && colabgen models
```
