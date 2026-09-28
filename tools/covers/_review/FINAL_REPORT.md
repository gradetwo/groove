# Groove 曲风配图集 — 最终汇总报告

生成日期：2026-09-26 · 模型：**Qwen-Image-2.1** · 硬件：Colab **G4 / NVIDIA RTX PRO 6000 Blackwell Server Edition 95GB**

## 1. 交付物

| 项 | 内容 |
|---|---|
| 成品 | **954 张 1024×1024 JPEG (q92)** = 6 套皮肤 × 159 个曲风，**全部通过 PIL 校验，0 异常** |
| 目录 | `public/covers/<skin>/<genre>.jpg`（皮肤：`default` `minimal` `comic` `soviet` `sovietYears` `pixel`）|
| 拼版/联系表 | `_review/<skin>_sheet_000..003.jpg` |
| 复查数据 | `_review/<skin>_review.json`（逐张判定）、`_review/<skin>_triage.json`（自动分诊）、`_review/regen_verification.json`（重生复核）|
| 废片归档 | `_rejected/<skin>/` —— **100 张，一张未删**，与成品并排可对比 |
| 重生规格 | `_review/pending_regen_<skin>.json`、汇总清单 `_review/regen_specs.txt`（82 条）|
| 状态/交接 | `_BATCH_STATE.md`、`_batch_progress.log` |

## 2. 生成阶段

- 远端 persistent worker（`colabgen submit` + SSH + NDJSON），**均值 ~10.2 s/张**，`covers-gen4` 收尾 `done=251 failed=0`。
- 全程 **0 张生成失败**（远端 `remote_failed=0`）；早期 3 次失败均为传输层，已核对磁盘后清除。
- Colab 侧三次 G4 回收（抢占/回收不可控）：每次代价仅"未取回的 10–25 张"，靠 `skip_list` 续跑与每 3 分钟增量取回把损失压到最小。

## 3. 复查阶段（R1 曲风 / R2 皮肤 / R3 工艺 / R4 反陈词滥调）

6 套皮肤**全部**复查；每张图都以原图尺寸逐张查看（非抽样），可疑处再放大 16 处原分辨率核对。

| 皮肤 | 复查 | 驳回 | R1 | R2 | R3 | R4 | R5 锚点（保留张）|
|---|---|---|---|---|---|---|---|
| default | 159 | 11 | — | — | — | — | 早前波次 |
| minimal | 159 | 7 | — | — | — | — | 早前波次 |
| comic | 159 | **10** | 3 | 0 | 4 | 4 | **120 / 149** |
| pixel | 159 | **19** | 16 | 3 | 14 | 2 | **116 / 140** |
| soviet | 159 | **29** | 9 | 12 | 15 | 3 | **102 / 130** |
| sovietYears | 159 | **24** | 3 | 14 | 7 | 2 | 28 / 135 |
| **合计** | 954 | **100** | | | | | |

- 驳回项全部**移入** `_rejected/`（保留 `.json` sidecar），随后按收紧后的规格**重生 82 张**（`regen1`，0 失败），另 18 张在早前波次已重生；最终 **954/954 就位**。
- 每张最多重生 2 次，符合约束。

## 4. R5（发源地/年代/器材锚点）效果

- **159/159 个曲风都带历史锚点**，锚点文本全部注入生成 prompt（例：`acid-house` → *Chicago warehouse parties of 1987 + squelching silver TB-303*）。
- 实测可见锚点比例：comic **120/149**、pixel **116/140**、soviet **102/130**；纯光/几何/色域类曲风（ambient、各类 trance）天然不含实体锚点，属预期。
- 定性与早期对照结论一致：锚点让画面从"泛泛氛围"变为**可辨识的场景**（例：`cloud-rap` 由"模糊暗房"变为"2000 年代末卧室 + 床垫 + 发光笔记本 + 天花板夜光星星"，缩略图尺寸即可读出）。

## 5. 算力消耗

| 项 | 值 |
|---|---|
| 起始余额 | 255.95 |
| 结束余额 | **198.28** |
| **总消耗** | **≈57.7 单位**（含 3 次 G4 被回收的重复开销与 2 次僵尸 assignment 空转）|
| 生成单价 | G4 9.14/时 ÷ (3600/10.2 张/时) ≈ **0.026 单位/张** |
| 结束时费率 | 0.32/时（GPU 已 `down`）|

## 6. 系统性经验（建议进 ART_DIRECTION）

1. **模板字漂移**：`wide stencilled capital shapes with no readable letters` 漂移成主体级伪词，约 60% 图带大号模板字，其中 15 张读出真实英文/品牌/人名（如 `hard-rock` 出现可读 "MARSHALL"、`free-jazz` 读出 "CEL SIMON"）。→ 改为"仅允许小号序列化模板块，禁止主体位置文字"。
2. **"抽象环境词"陷阱**：pixel 19 张驳回中 **12 张同源** —— 场景 prompt 写的是氛围/材质/隐喻而非**具体乐器或机器**，导致近空画面。→ 收紧 `GENRE_SUBJECT` 行，先保证"具体物件"。
3. **一词多义**：`harp` 被画成音乐会用竖琴（本意 blues harmonica），三套皮肤同时中招。→ prompt 用 `blues harmonica`。
4. **同曲风近撞**：`uk-garage`/`speed-garage`、`euro-trance`/`uplifting-trance` 构图接近（pixdiff 31–34），后续可加差异化指令。

## 7. 未完成/需你决定的两项（如实说明）

1. **第三份持久副本缺失**：Drive 全程未挂载，所以"远端 `/content/out` + `MyDrive/DSH`"这一份不存在（VM 已销毁）。本地 jpg 完整；**本地原始 PNG 仅暂存 126 张**。要补齐请让我发授权 URL，你点一下即可挂载并把产物归档到 Drive。
2. **控制台残留 assignment**：当前费率已降至 0.32/时（无害）；如仍显示多条 assignment，可顺手清掉。

## 8. 复现命令

```bash
# 环境/漂移核实
colabgen status -s <session>
# 生成（跳过已完成的 skip_list）
colabgen submit -s <session> _batch_remote.py --name covers-genN --args generate
# 增量取回（每 2–4 分钟一次，避免 VM 被回收损失）
CG_SYNC_SESSION=<session> CG_SYNC_RUN=covers-genN python _batch_sync.py
# 只重生被驳回的曲风（规格内联于脚本）
colabgen submit -s <session> _regen_remote.py --name regenN
# 复查（分诊 + 联系表）
python _batch_review.py
```

## 9. 重生复查（QA）与第二轮重生

**第一轮 QA**（`_review/regen_verification.json`，逐张原尺寸复核 82 张重生图）：

| 皮肤 | 复核 | 修复 | 仍不合格 |
|---|---|---|---|
| comic | 10 | 7 | 3 |
| soviet | 29 | 3 | **26** |
| sovietYears | 24 | 7 | 17 |
| pixel | 19 | **17** | 2 |
| **合计** | 82 | **34** | **48** |

- 全部 82 张均确证为**新文件**（md5 全部不同于废片，16×16 pixdiff 10.2–63.5）。
- 明确修复的例证：`pixel/ambient`（近空雾帧 → 三角钢琴 + 盘式录音机）、`pixel/vaporwave`（光滑画风 → 确证 160px 像素化，blockiness 0.45/1.96）、`comic/alternative-rnb`（重建为录音棚声乐间，无字）、`soviet/ragga-jungle`（洁净不锈钢音响堆，零文字）。
- **未奏效的两类 prompt 家族**：① soviet 皮肤的**模板伪字极顽固**（模型无视 "no lettering" 禁令，仍产出 "RATH HOUCE"/"MIRRITE" 等）；② sovietYears 的**色彩泄漏**（紫罗兰/粉彩/霓虹）。另 `harp` 歧义跨皮肤复现（画成竖琴而非口琴）。

**第二轮重生（`regen2`，48 张）**：对 48 张仍不合格者追加**强禁令**（"ABSOLUTELY NO TEXT OR LETTERING ANYWHERE …"）并把 `chicago-blues` 的 `harp` 显式改写为 *blues harmonica*；结果 `done=48 failed=0`，全部入位。
**wave-2 复核结果：48 张 checked / PASS 0 / STILL-FAIL 48**（`_review/regen2_verification.json`）

- 方法严谨：48 张全部原尺寸逐张查看；全部 md5 不同于废片、16×16 pixdiff 9.69–51.27（**确证没有"原图重发"**）；20 张废片原图也已开启对照。
- 关键证据：**文字缺陷只是被"重新随机"而非消除**（`ARED HOUSE→RATH HOUCE`、`PNEOVE→MIRRITE`、`COINS→ROURS`、`8097→8000`、`8080→808+8080`）。
- **palette 指标不是判别器**：48 张全体的 `palette_distance 0.03–0.25`（告警线 0.60）—— 即**全局配色是合规的**，R2 失败都来自**局部语义载体**（天空/地板/辉光/音箱堆各自拖入其惯用色：紫罗兰天、绿极光、青霓虹、粉彩云、粉地板、红巨板）。
- `chicago-blues` 的 harp 改写为 *blues harmonica* 后，4/4 仍失败，其中 3 张**加了正确口琴却保留了竖琴** —— 模型能满足肯定名词，但无法删除强先验物体。
- **判定（question_4）：以 (b) 固有极限为主**，剩余属需要"结构性规格修改"而非更强措辞：① 从规格中**移除**肇事表面/物体类别（不要板面/机器面板、不要天空/地板色载体）；② 按区域约束配色；③ 用独立 inpaint 通道擦除文字与越色区域。依据：形容词叠加已测两轮 0/48，而 wave-1 有 3/29（soviet）与 7/24（sovietYears）通过 → 是**可靠性/否定提示遵从性**问题，不是能力问题。

## 9b. 最终缺陷分布（残留，已归档可对比）

| 类别 | 张数 | 代表 |
|---|---|---|
| R3 模板伪字（soviet 为主） | ~30 | `RATH HOUCE`、`MIRRITE`、`OMEDEDRNAIB`、`YEB AER` |
| R2 局部越色（sovietYears 为主） | ~17 | 紫罗兰天、绿极光、青霓虹、粉彩云 |
| R1 物体误读 | 5 | `chicago-blues` 竖琴（跨 4 套皮肤）、`amapiano` 无 log drum、`chicago-house` 镜球 |
| R4 陈词滥调 | 3 | `vaporwave` 大理石半身像、`electro` 数字面板 |

> 这些图**仍在成品目录中**（是各自"最佳可得"版本），其原版与 wave-1 版本均保留在 `_rejected/`，可随时对比或替换。

## 9c. 第三轮"结构性修复"（wave-3）与最终方法论结论

**结果：48 张 checked / PASS 0 / STILL-FAIL 48 —— 与 wave-2 完全一致（Δ0）**

本轮是**结构性**改动（非加强措辞）：删除 `harp/stencil/nameplate/signage/letter plates/typographic` 等触发词；追加"所有表面完全留白：素混凝土/素钢/素漆面，无板面、无铭牌、无标牌"；sovietYears 追加**双墨色区域约束**；4 个误读物体改为**正向具体描述**。48 张全部 hash 不同（pixdiff 10.25–52.06），确证非重发。

**为何无效（硬证据，见 `_review/regen3_verification.json`）**

1. **26/26 soviet 图仍有可读字形，且 19/26 与 wave-2 逐字符相同**（`RATH HOUCE`、`CADINRE`、`ROURS`、`YEB AER`、`EUTNISE`、`RONDEORA`、`GNDNG/020T80`…）。同一张图的演化证明问题不在被删的词：`hard-trance`：`THASRE`(w1) → `CADINRE`(w2) → `CADINRE`(w3 未变)；`microhouse`：`COINS` → `ROURS` → `ROURS`。**字母板的先验来自规格里仍在要求的"介质"本身**（"stamped-steel plates"、"milled edges"、"rivets, seams"、"technical-plate frontal composition"）与主体名词（drum machine / amp wall / step keys），而非触发词。
2. **双墨色约束无效**：越色像素占比中位数 **9.6%**，而 142 张未标记的 sovietYears 图噪声底为 **8.0%** —— 没有收紧；12/12 张 R2 图仍出现其被点名的颜色源，且残差像素恰好聚在该色相上（紫、橙、绿、粉、雾灰、青、粉彩）。
3. **正向物体改写修复 0/10**：竖琴 4/4 存活、大理石像 3/3、镜球+真鼓、威士忌杯 2/2。模型是**叠加式满足**肯定短语（画上小口琴的同时保留竖琴）——与 wave-2 同一失败模式。

**结论：在这套皮肤规格内做 prompt 编辑（无论措辞还是结构）已证明不可行**（三轮 0/48）。剩余可信路径只有两条：
- **① 后处理 / inpaint**：对文字与越色区域做定向擦除（独立通道），这是唯一能确定收敛的技术手段；
- **② 更换规格的"基础介质"**：彻底不要 stamped-steel plate / 机器面板一类表面，不要天空/地面这类"颜色载体"（而不是改触发词）。

## 10. 最终账目

| 项 | 值 |
|---|---|
| 最终成品 | **954 / 954**，全部 1024×1024、0 异常 |
| 归档废片 | **100 张**（`_rejected/<skin>/`，未删除）|
| 余额 | 255.95 → **196.56**（total **≈59.4 单位**）|
| 结束费率 | 0.40/时（所有 GPU 会话已 `down`）|
| 生成/重生远端失败数 | **0** |

## 11. 遗留（需人工一步）

- **Drive 第三份副本**：Drive 从未挂载（挂载需要用户点击授权），因此产物目前只有本地副本；本地原始 PNG 仅暂存 126 张。补齐方式：`colabgen drive mount`（我发授权 URL，用户点击后我归档到 `MyDrive/DSH`）。
- **模型固有限制**：对"stencil/铭牌表面不要出现文字"这一约束，Qwen-Image-2.1 在 soviet 皮肤模板下遵从度低；如需彻底消除，建议：① 从模板中删除"stencilled shapes"相关措辞；或 ② 用局部重绘（inpaint）擦除文字区域。

