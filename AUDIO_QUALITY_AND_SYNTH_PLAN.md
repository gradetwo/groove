# GROOVE LAB 音频质量、逐曲风默认值与 SYNTH 整合规划

> **当前基线**：v1.16.19（`package.json` / `public/version.json` 实测）
> **本轮范围**：用户需求 7–11（缓存机制 / 母带 FX 逐曲风默认 / 默认听感 / 整体音色质量 / SYNTH 整合）
> **关联登记项**：`BACKLOG.md` / `CODE_REVIEW_AND_PLAN_v1.16.0.md` 的 **N-14**（逐曲风母带 FX，待决策）、**N-15**（限幅器非砖墙）、**N-16**（离线导出缺送出与主 FX）
> **交付状态**：需求 7 **已修复并交付**（含回归测试）；需求 8–11 为**方案文档**，按用户指示本轮不改代码。

---

## 0. 结论速览

| # | 用户需求 | 结论 | 状态 | 规模 |
|---|---|---|---|---|
| 7 | 老版本更新后看不到最新更新记录，检查缓存机制 | **确认是真实缺陷，三层根因已定位并修复**：① `/changelog.json` 被浏览器/边缘缓存 1 小时；② Service Worker 对它走 stale-while-revalidate，先返回旧副本且回填后不重渲染；③ **弹窗把「归档」的优先级放在「刚校验过的 `latest`」之上**，于是旧归档直接顶掉了最新一条 | ✅ 已交付 | 小 |
| 8 | 母带 FX 机架需要逐曲风默认值 | 可行，且正是登记项 N-14。**但当前机架物理上做不到 dub 长延迟 / ambient 长混响**：延迟硬编码 0.25 s 且 `createDelay(1.0)` 上限 1 s、反馈无滤波；混响是固定的 1.5 s 白噪声 IR。因此需求 8 必须**同时扩总线**，否则只能给滤波器/饱和/合唱/降比特四件套配默认值 | 📋 方案 | 中 |
| 9 | 学习 Logic Pro，每个曲风默认听感就好 | 方向正确，但**不能只靠内容层实现**。当前引擎里没有承载「默认效果链」的位置：逐轨 EQ/压缩/插入不存在、总线固定、和弦轨是单音（159/159 曲风实际上没有和声）。必须先补引擎能力，内容层（逐曲风默认）才有表达力 | 📋 方案 | 大 |
| 10 | 整体音色质量与效果提升规划 | 给出 E-01…E-24 分级路线图（按 收益÷成本 排序）+ V-01…V-14 客观度量门禁。**Tier 1 有 8 项小改动即可拿到大部分听感收益** | 📋 方案 | 大 |
| 11 | 整合上级目录 synth 项目，含后续上游合并 | GS-1（v2.1.3，MIT，Rust+WASM，**不需要 SharedArrayBuffer/COOP-COEP**）可嵌入。但它是**一件乐器**而非通用引擎（16 复音实例占单音频线程 33–61%），**不建议整体替换**。推荐：先移植廉价高收益的 DSP 思路，再仅对 `chords`/`lead` 两个角色定点接入；上游用 vendor + 哈希锁定 + 同步脚本 | 📋 方案 | 大 |

---

## 1. 需求 7：更新记录看不到最新版 —— 缓存机制诊断与修复（已交付）

### 1.1 复现路径

用户停留在旧版本 → 部署新版本 → 打开 App → 弹窗提示「发现新版本 v1.16.20」→ **但更新记录列表里最高只到 v1.16.19**，也就是刚装上的那一版没有条目。

关键在于：**版本号是对的，只有记录是旧的**。这排除了「检查更新整体失效」，把问题精确锁定在 `/changelog.json` 这一条链路上。

### 1.2 根因（三层，缺一不可）

**① 服务端把归档当成可长缓存资源。** `public/_headers` 给 `/version.json` 是 `no-cache, must-revalidate`，却给 `/changelog.json` 是 `public, max-age=3600`：

```
/version.json     Cache-Control: no-cache, must-revalidate
/changelog.json   Cache-Control: public, max-age=3600      ← 最长 1 小时的旧副本
```

**② Service Worker 对归档走 stale-while-revalidate。** 旧 `public/sw.js` 的 fetch 分支里，`/changelog.json` 既不是 `/assets/*` 也不是导航请求，于是落到最后一条兜底规则：

```js
return cachedResponse || fetchPromise;   // 先给缓存，再在后台revalidate
```

后果有两层：先**必然**返回旧副本；后台回填成功也**没有任何机制让 UI 重渲染**。顺带还有一个小缺陷——`/version.json` 也走这条规则，而弹窗用 `?t=${Date.now()}` 缓存穿透，于是**每次「检查更新」都会往 Cache Storage 塞一个永不命中的新条目**，缓存无界增长。

**③ 弹窗的渲染优先级是反的（决定性的一层）。** 这是三层里唯一纯前端的逻辑错误，也是让缓存问题变成「用户可见」的那一层：

```tsx
// 旧 src/components/UpdatesModal.tsx:94
const latestEntries = data.latest ? [data.latest] : (data.changelog || []);

// 旧 src/components/UpdatesModal.tsx:280 —— 归档优先！
{(changelog || versionData?.changelog || []).map(...)}
```

`versionData.changelog` 里装着的正是**刚从 `no-store` 拉回来、绝不可能过期**的 `latest` 条目，但渲染时 `changelog`（归档）优先。归档一旦是旧的就直接顶掉最新一条——**即使服务端返回的版本号完全正确**。

叠加旧代码另外两处：归档用 `fetch("/changelog.json")`（**没有任何 cache buster**，是全链路唯一不做失效的资源），并且 `if (!isOpen || changelog !== null) return;` —— 一个页面生命周期内**只取一次、永不重取**。

### 1.3 修复（四层防御，已实现）

| 层 | 改动 | 作用 |
|---|---|---|
| 渲染 | 新增 `src/utils/changelog.ts#mergeChangelog`：把归档与 `latest` **并集去重后按 semver 降序** | **这是让旧缓存不再致命的一层**：归档再旧，最新一条也一定在列表首位 |
| 取数 | `changelogArchiveUrl(version)` → `/changelog.json?v=<version>` | 版本即缓存键：新版本天然是新 URL，旧副本**不可能**被命中；同一版本内重复打开仍走缓存，不牺牲速度 |
| 取数 | 归档按「服务端报告的版本」重新拉取，且旧载荷不得覆盖新归档 | 修掉「一个页面生命周期只取一次」 |
| SW | `/version.json` + `/changelog.json` 改为 **Network First**；`version.json` **永不写入缓存** | 对**已经部署在用户手上的旧前端**也生效（SW 会更新），并止住缓存无界增长 |

另外把 `data.version !== CURRENT_CLIENT_VERSION` 换成 `isNewerVersion(data.version, CURRENT_CLIENT_VERSION)`：回滚或边缘旧副本时不再把「降级」播报成「可更新」，避免用户陷入刷新循环。

### 1.4 验证

新增 `src/test/changelogUpdate.test.ts`（13 条），直接钉住失败语义而不只是钉住实现：

- **归档停在上一版时，最新一条仍出现在首位** —— 正是本次线上现象的最小复现；
- 版本相同的条目不重复；冲突时以重新校验过的 `latest` 为准；
- 归档 404 / 离线时，仅凭 `version.json` 也能显示最新一条；
- 乱序归档被排成最新在前；`1.10.0 > 1.9.0` 按数值而非字典序；
- 降级不得被判为「可更新」。

回归结果：`vitest` **74 文件 / 662 测试全绿**；`redlines` **22 条红线全过**（含 R5b「Service Worker 不被缓存」、R5c「安装时不自 skipWaiting」，即本次 SW 改动未破坏「更新由用户驱动」的既有契约）；`typecheck` / `lint` / `lint:data` / `docs:check` / `version:check` / `check:budget`（初始路由 146.9 KB / 220 KB 上限）全部通过。

### 1.5 对照：GS-1 为什么没有这个问题

同级目录的 GS-1 把更新记录**编译进 bundle**（`src/changelog-head.ts` 被 `App.tsx` 静态引入，历史留在 `changelog-archive.ts`）。于是「记录」与「代码」同哈希、同版本，**结构上不可能不一致**，代价是包体（GS-1 为此只保留最近 30 条，省下约 79 KB）。

Groove Lab 现在是「记录作为独立运行时资源」，所以必须自己维护一致性。**后续可选方向**：把最近 N 条随构建打包（`latest` 已在做的事），只把完整归档留在远端——既拿到 GS-1 的结构性一致，又保留无限历史。本轮先用第 1.3 节的并集方案，成本最低且立即生效。

---

## 2. 需求 8：母带 FX 机架逐曲风默认值（N-14）

### 2.1 现状

- `src/audio/EffectsRack.ts:28-43` 的 `DEFAULT_FX_STATE` 是**全库唯一一套**机架参数，且四个效果**全部默认关闭**。
- 159 个曲风文件里 **0 处**声明过 FX 机架（`src/data/genres/*.ts`）。
- `effectsRackState` 是 `src/views/StudioView.tsx:146` 的单个 `useState(DEFAULT_FX_STATE)`，经 `useAudioEngineLifecycle.ts:238-261` 同步到引擎，随工程持久化（`projectDb.ts:450/560/609`）。

这正是登记项 **N-14** 描述的状态。它与 N-13（混音）性质不同：这些效果默认是**关**的，不存在「默认音色是错的」，只是**缺少逐曲风的创作性默认值**——所以当时被标为「需产品决策」。本轮用户明确要求实施，决策已作出。

### 2.2 关键约束：现在的机架做不到 dub / ambient

这是本节最重要的事实。用户举的三个例子里有两个**不在** `EffectsRack` 的能力范围内，而在送出总线上，而总线目前是硬编码的：

```ts
// src/audio/AudioEngine.ts:363-390
this.reverbBus = this.ctx.createConvolver();
const impulse = this.createReverbImpulse(1.5, 2.2);   // 固定 1.5 s 白噪声 IR
if (impulse) this.reverbBus.buffer = impulse;
this.reverbGain.gain.setValueAtTime(0.35, ...);        // 返回量硬编码，无 setter

this.delayBus = this.ctx.createDelay(1.0);             // ← 上限 1 秒
this.delayBus.delayTime.setValueAtTime(0.25, ...);     // 固定 250 ms
this.delayFeedback.gain.setValueAtTime(0.32, ...);
this.delayFeedback.connect(this.delayBus);             // ← 反馈环里没有滤波
this.delayGain.gain.setValueAtTime(0.25, ...);
```

| 需求 | 现状 | 结论 |
|---|---|---|
| **dub 长延迟** | 延迟固定 250 ms、上限 1 s、反馈无滤波（每一次重复都是全带宽，越重复越刺耳）、非立体声、不与速度同步 | **做不到**。dub 的标志是「附点八分/三连音级的长延迟 + 高反馈 + 反馈环路内低通使每次重复变暗」 |
| **ambient 长混响** | 固定 1.5 s 指数衰减**白噪声**，无预延迟、无早期反射、无频率相关阻尼、`Math.random()` 非确定 | **做不到**。ambient 需要 6–12 s RT60 且高频先衰减 |
| **metal 饱和** | ✅ 机架内已有 tanh 饱和 | **可直接做**（但需修增益补偿，见 §4.2） |

此外还有两点必须先处理，否则逐曲风默认值会「配了但听不出来」：

- **送出取自声相之前**（`AudioEngine.ts:549` `stripOut.connect(sendA)`，而 `stripOut` 是 panner 之前），所以混响永远居中，与逐曲风声相编排（N-13 的成果）脱节；
- **返回量没有 setter**（0.35 / 0.25 硬编码），数据层无法表达「这个曲风混响送多一点」。

### 2.3 数据模型

沿用 N-13 已验证的三层结构（category profile + 逐曲风 override + 解析结果表），新增 `src/data/genreFx.ts`：

```ts
/** 机架四件套沿用现有 EffectsRackState，新增总线两项。 */
export interface GenreReverb {  enabled: boolean;
  /** RT60，秒。0.6 = 小房间，2.5 = 大厅，8+ = ambient。 */
  decaySec: number;
  /** 高频阻尼：越大高频衰减越快（0 = 不衰减，即现状）。 */
  damping: number;
  /** 预延迟，毫秒。0 = 现状。 */
  preDelayMs: number;
  /** 立体声宽度 0..1。 */
  width: number;
  /** 返回量 0..1（现在硬编码 0.35 无可达入口）。 */
  returnLevel: number;
}

export interface GenreDelay {
  enabled: boolean;
  /** 与 BPM 同步；null 表示用 timeMs 固定值。 */
  division: "1/4" | "1/8d" | "1/8t" | "1/8" | "1/16" | null;
  timeMs: number;
  /** 反馈量 0..0.85。 */
  feedback: number;
  /** 反馈环路低通截止（Hz）。dub 靠它让每次重复变暗。 */
  dampHz: number;
  pingPong: boolean;
  returnLevel: number;
}

export interface GenreFx {
  rack: EffectsRackState;
  reverb: GenreReverb;
  delay: GenreDelay;
}
```

解析入口与 N-13 完全同构，便于复用红线：

```ts
export const CATEGORY_FX_PROFILES: Record<GenreCategory, GenreFx>;
export const GENRE_FX: Record<string, { overrides: DeepPartial<GenreFx>; reason: string }>;
export function resolveGenreFx(genreId: string): GenreFx | null;
export const GENRE_FX_RESOLVED: Record<string, GenreFx>;   // 159 条展开结果
```

**为什么不塞进 `genreMix.ts`**：`genreMix.ts` 的职责是「逐轨音量/声相/送出」，已被 `R9a/R9b` 红线与 `check_loudness_spread.mjs` 的 159 条一致性校验锁定。混入母带效果会让那套门禁的语义变浑；且 N-13 明确把 FX 留作独立工作面。

**延迟同步必须用「演奏速度」，不是元数据速度。** 实测：**159 个曲风里有 87 个**的 `sequencer_pattern.bpm` 与顶层 `default_bpm` **不相等**（例：`dnb` 的 `160 → 165`、`168 → 170`；`dubstep` 的 `130 → 132`）。`default_bpm` 只是条目元数据，真正播放的是 `sequencer_pattern.bpm`。因此 `delay.division` 的换算必须取当前 pattern 的速度，否则 55% 的曲风上「附点八分」会对错拍——这类错误在 dub 上尤其致命，因为长延迟的每一次重复都必须落在拍点上。

**另一条与需求 11 相通的约束**：曲风数据里**没有任何机器可读的节奏表示**——没有 `rhythm_dna` 字段（它只作为过时注释残留在 `genreMix.ts:19`，`types/genre.ts` 里 0 处命中），节奏只以双语散文（`drum_pattern`、`rhythm_features`）+ `steps[]` 四级重音网格（分布 `{0:15744, 1:4349, 2:161, 3:98}`）+ `radar_metrics.rhythmDensity` 存在；`time_signature` 全库都是 `"4/4"`。所以延迟/LFO 的**速度同步**只能由引擎自己从 BPM 推导，无法从数据里读出一个现成的节奏结构。

### 2.4 应用时机与覆盖语义

引擎侧已有现成的、证明可行的挂载点——响度 trim 就是这么做且已上线：

```ts
// src/audio/AudioEngine.ts:569 setPattern(...)
this.applyLoudnessTrimForPattern(pattern);   // ← 同一位置追加 applyGenreFxForPattern(pattern)
```

配套还需要（镜像 `loudnessTrimOverrideDb` 的既有做法）：

- `applyGenreFxForPattern(pattern)`：按 `pattern.genre_id` 解析 → 写入机架；
- `setGenreFxOverride(fx | null)`：比对视图这类合成 pattern 需要显式覆盖（对照 `setLoudnessTrimOverride`，`AudioEngine.ts:841-866`）；
- 切换曲风时 `useGenreSwitching.switchGenre` 已走 `setPattern`，**因此无需新增调用点**——这正是该挂载点的价值。

**覆盖语义（用户已确认）**：**切曲风 = 载入该曲风默认，覆盖手动改动**，与 Logic Pro 换 patch 的行为一致。手动修改只在当前曲风内保留。

这带来一个持久化要求：工程里必须能区分「这份 FX 是曲风默认还是用户改的」。否则重新打开一个旧工程时，无法判断该不该用曲风默认覆盖它。

```ts
// projectDb.ts 的 Project 增加：
fxSource: "genre" | "user";   // genre = 跟随曲风，user = 用户改过
fxGenreId: string | null;     // 来源曲风，用于校验/迁移
```

**向后兼容成本很低**：现存工程里的 `effectsRack` 全是 `DEFAULT_FX_STATE`（四项全关），所以旧工程迁移为 `fxSource: "genre"` 不会改变任何人的听感——反而是他们第一次拿到逐曲风默认值。分享链接（`SequencerUrlShare`）只带逐轨字段，不含机架，故不受影响。

### 2.5 实施步骤

| 步 | 内容 | 文件 |
|---|---|---|
| S1 | 扩展总线能力：延迟可变速/可同步、反馈环加低通、可选 ping-pong、混响可换 IR（带阻尼与预延迟）、返回量开放 setter | `AudioEngine.ts:348-390`、新增 `Reverb.ts`/`Delay.ts` |
| S2 | 送出改为取自声相**之后**（或在 panner 后并联一条送出），使混响跟随逐曲风声相 | `AudioEngine.ts:497-563` |
| S3 | 建立 `src/data/genreFx.ts`：6 个 category profile + 逐曲风 override + 159 条解析表 | 新文件 |
| S4 | 引擎接线 `applyGenreFxForPattern` / `setGenreFxOverride`；把总线参数纳入 `EffectsRack` 或并列的 `MasterBuses` 门面 | `AudioEngine.ts:569-604`、`EffectsRack.ts` |
| S5 | 把 `effectsRackState` 从 `StudioView` 的裸 `useState` 提升为「曲风默认 + 用户覆盖」的可寻址状态 | `StudioView.tsx:146`、`useAudioEngineLifecycle.ts`、`useToolbarControls.ts` |
| S6 | 工程持久化加 `fxSource` / `fxGenreId` + 迁移 | `projectDb.ts:327/450/508/560/609` |
| S7 | 调音台暴露总线返回量与机架开关（否则用户无法「接管」默认值） | `src/components/console/*` |
| S8 | 数据门禁：新增红线 **R10**——每个曲风 id 必须解析出 `GENRE_FX`，且解析结果不得退化为全默认；新增 `genreFx.test.ts` | `scripts/redlines.mjs`、`src/test/` |
| S9 | 全量离线重测响度并回填 trim（任何改变电平的改动都必须走这一步） | `scripts/measure_genre_loudness.mjs` 等 |

### 2.6 验收标准（可量化）

| 项 | 门槛 |
|---|---|
| 覆盖率 | 159/159 曲风解析出 `GENRE_FX`；解析结果的 `rack` 互异组合数 ≥ 40（对齐 N-13「157/159 互异」的同类标准） |
| dub / dub-techno / reggae | `delay.enabled`、`feedback ≥ 0.55`、`dampHz ≤ 3000`、延迟时间 ≥ 附点八分（不与 250 ms 相等） |
| ambient / drone | `reverb.decaySec ≥ 6`、`damping > 0`（实测 RT60(4k)/RT60(630) ≤ 0.6） |
| metal / 硬派摇滚 | `rack.saturationEnabled`、`saturationDrive ≥ 3`；短混响（`decaySec ≤ 1.2`） |
| 不得回归 | `check_loudness_spread.mjs` 保持绿（p90−p10 ≤ 1.5 LU）；`R9a/R9b` 不动；初始路由预算仍在 220 KB 内 |
| 覆盖语义 | 「切曲风 → 机架 = 曲风默认」；「手动改 → 切走再切回 → 回到曲风默认」；「保存/重开工程 → 用户改过的保留」 |

---

## 3. 需求 9：每个曲风默认听感就好（Logic Pro 取向）

### 3.1 Logic Pro 到底做了什么

拆开来看，Logic 的「一打开就好听」不是单一功能，而是三件事的叠加：

1. **Patch 是「音源 + 通道条」的捆绑**：从 Library 选一个 patch，拿到的不只是音色，还有 EQ、压缩、插入效果与**送往共享混响/延迟总线的送出量**；
2. **总线是共享且已配好的**：所有 patch 的送出都指向同一套已调好的空间，所以任何两个 patch 叠在一起都「像在同一个房间里」；
3. **默认值本身就是创作决定**：工厂 patch 的作者已经把「这个音色该有的空间与动态」写进去了，用户不调也已经成立。

对照 Groove Lab：**第 1 件完全不存在**（无逐轨 EQ/压缩/插入），**第 2 件存在但是死的**（总线固定、返回量硬编码、送出取在声相之前），**第 3 件从未存在**（机架全关、159 曲风零声明）。所以需求 9 的本质不是「多写点默认值」，而是**先把承载默认值的链路建起来**。

### 3.2 差距：默认链路缺什么

| 层 | Logic 有 | Groove Lab 现状 | 缺口 |
|---|---|---|---|
| 音源 | 多样本/物理建模/合成 | 2 振荡器 → 1 个 12 dB/oct 低通 → 1 个指数 ADSR；50 个「乐器」是同一 7 维参数空间的 50 个点 | 无滤波器包络、无力度→音色、无 unison/子振荡器、无 LFO/调制矩阵 |
| 演奏 | 力度→音色、滑音、MPE | 力度**只映射到音量**（线性）；无滑音；无触后 | 力度不改音色是「像鼓机不像鼓手」的第一号特征 |
| 通道条 | EQ + 压缩 + 插入 | **完全没有**。全项目只有 3 处 `createDynamicsCompressor`，三处都是母带限幅器 | 需要逐轨 HPF/EQ/压缩/饱和 + 按角色的默认值 |
| 总线 | 共享混响/延迟 + 总线压缩 | 固定 IR 混响 + 固定 250 ms 延迟，返回量硬编码，送出取在声相前 | 需要可参数化总线 + 鼓组/音乐双总线 + 胶水压缩 |
| 母带 | 真峰值限幅 + 抖动 | `DynamicsCompressor` 3 ms 起攻，**121/159 曲风导出峰值超 0 dBFS** | 需要前瞻式真峰值限幅（N-15） |
| 一致性 | 同一张图 | **实时与离线导出是两张不同的图**（导出无送出、无机架，N-16） | 需要共享的渲染图构建器 |

### 3.3 目标默认链路

```
voice（含滤波器包络 / 力度→音色 / unison）
  └─ 逐轨插入：HPF → 3-4 段 EQ → 压缩 → 饱和        ← 新增（按角色默认值）
       ├─ 鼓组总线 → 胶水压缩 ┐
       └─ 音乐总线 → 胶水压缩 ┤
                              ├─ 混响总线（逐曲风 RT60/阻尼/预延迟/宽度）
                              ├─ 延迟总线（逐曲风 同步分割/反馈/反馈低通/ping-pong）
                              └─ masterGain → 响度 trim → 逐曲风 FX 机架 → 真峰值限幅 → 输出
```

**关键顺序**：能力层（引擎）必须先于内容层（默认值）。给一个不存在的链路写默认值没有意义——这正是 §4 的 E 级项要排在 C 级项前面的原因。

### 3.4 逐曲风创作性默认示例（指标化，可直接作为验收）

| 曲风 | 混响 | 延迟 | 饱和 | 其他 |
|---|---|---|---|---|
| **dub / dub-techno / reggae** | 弹簧感短混响，`decay 1.2 s`、`damping 高` | **附点八分或 3/4 音符**、`feedback 0.65`、**`dampHz 2 kHz`**（每次重复变暗）、ping-pong | 轻（`drive 1.6`） | 军鼓/电钢送出拉满；贝斯干声居中且重 |
| **ambient / drone / 氛围** | **`decay 8–10 s`、`preDelay 60 ms`、`width 1.0`、高频阻尼强** | 长反馈八分、`feedback 0.4`、暗 | 极轻或关 | 鼓组几乎退场；垫子挑大梁；起音慢 |
| **metal / death-metal / 金属核** | 短促房间 `decay 0.8 s`、`damping 高`、`preDelay 0` | 关或极短（`1/16`、`feedback 0.15`） | **开，`drive 4–5`** | 双轨吉他硬左硬右（N-13 已做）；鼓组总线压缩重；噪声门收紧 |
| **house / techno** | 中等 `decay 1.8 s`、`width 0.9` | 八分 `feedback 0.35`、明亮 | 轻（`drive 1.4`） | 底鼓与贝斯单声道；踩镲铺宽 |
| **jazz / bebop** | 小房间 `decay 1.0 s`、`damping 中` | 关 | 关（或磁带感 `drive 1.2`） | 立式贝斯靠前；鼓组后撤 |
| **latin / salsa** | 活泼短混响 `decay 1.1 s` | 关 | 轻 | 打击乐推满并铺开 |
| **lo-fi / chiptune** | 关或极短 | 八分 `feedback 0.3`、**`dampHz 3 kHz`** | 开 | 降比特开（注意 §4.2 的降比特缺陷需先修） |

### 3.5 分期

- **阶段 A（先决）**：§4 的 Tier 1 引擎项——修和弦轨单音、修包络断点、修常开 16 kHz 低通、修降比特、力度→音色、总线可参数化。**没有这些，默认值写了也听不出来。**
- **阶段 B**：需求 8 的逐曲风机架 + 总线默认值（`genreFx.ts`）。
- **阶段 C**：逐轨插入链 + 按角色默认值（§4 的 E-10/E-11）——这一步才真正等价于「Logic 的通道条 patch」。
- **阶段 D**：逐曲风微调 + 全量听感复核 + 响度重配平。

---

## 4. 需求 10：整体音色质量与效果提升规划

### 4.1 能力盘点（现状）

| 能力 | 现状 |
|---|---|
| 振荡器波形 | 4 个（sine/square/saw/tri），2 个/voice |
| 波表 / FM / 加性 / 物理建模 | **全无**（`fmLead` 是固定 +1207 音分失谐的假 FM） |
| Unison / 子振荡器 / 立体声展开 | **全无** |
| 滤波器 | 1 个 `lowpass`，固定 12 dB/oct，无键盘跟踪 |
| 滤波器包络 | 硬编码「起音 ×2.5、衰减回原位」，无法关闭或塑形 |
| LFO / 调制矩阵 | 全无（全项目唯一 LFO 是母带合唱） |
| 包络 | 单 ADSR，仅指数曲线 |
| 力度 | **只映射到音量**（线性） |
| 滑音 / 连奏 | 无 |
| 复音上限 / 抢音 | **无上限**（文件头宣称「4 复音 + 抢音」与实现不符） |
| 鼓 | 4 套 × 4 件；打击乐轨实际只有「牛铃」或「拍手」两种声音 |
| 逐轨 EQ / 压缩 / 插入 | **全无** |
| 总线 | 固定混响 + 固定延迟，返回量硬编码 |
| 母带 | `DynamicsCompressor` 当砖墙限幅用 |
| 离线导出 | **无送出、无机架**（与实时不一致） |

### 4.2 四个高可听度缺陷（优先级高于任何新增功能）

| ID | 缺陷 | 证据 | 听感后果 |
|---|---|---|---|
| **E-01** | **和弦轨是单音的**——`AudioEngine.playChord` 只触发一个音；159/159 曲风的 `chords` 轨每步只有一个 `pitch`；`common_chords` 只活在 UI 里 | `AudioEngine.ts:1505-1521`；`house.ts` 和弦 pitch 为 `60,null,…,63,…` | **全部 159 个曲风没有和声**，垫子只是「带 pad 音色的单音旋律」 |
| **E-02** | 包络存在硬跳变：无条件 `setValueAtTime(sustainLevel, noteReleaseStart)`，当 `decay` 长于音符时值就在衰减途中**跳变** | `PolySynth.ts:806-818`；`bass808` 在 1/16 音符上约 **−4.6 dB 阶跃** | 808 贝斯、钢琴、Rhodes、颤音琴、钟琴、西塔琴**每个音都有咔哒声** |
| **E-03** | 「bypass」的主滤波其实**常开 16 kHz 低通**（构造时用 `state.filterCutoff` 而非旁通值），且非 lowpass 类型的旁通值错误 | `EffectsRack.ts:100-107`、`:205` | 实时母带永远少一截空气感；实时与离线不parity |
| **E-04** | 降比特器 **bits ≥ 11 时失效**（2048 点表 vs 65536 级量化）且**无过采样**（只有饱和节点设了 `2x`） | `EffectsRack.ts:62-70,115` | 默认 `bitDepth:12` 已在失效区；同时产生折叠失真 |

另有两项已登记、影响面更大的：**N-15**（限幅器 3 ms 起攻 → **121/159 曲风导出超 0 dBFS**，`WavExporter` 硬削波）与 **N-16**（离线导出无送出/无机架，实测与导出不是同一个声音）。

### 4.3 路线图（按 收益 ÷ 成本 排序）

**Tier 1 —— 先做（小改动、大收益）**

| ID | 内容 | 手法 | 文件 | 规模 |
|---|---|---|---|---|
| E-01 | 和弦轨真正出和声 | 用 `common_chords` + `pattern.scale` 展开 voicing；复用已有的 `utils/chordTheory.ts` / `ChordAudioEngine` 声部逻辑，各声部错开 2–4 ms | `AudioEngine.ts:1505-1521` | M |
| E-02 | 修包络断点 | 删掉无条件 hold；改用 `cancelAndHoldAtTime(releaseStart)` 或在 `max(decayEnd, releaseStart)` 处再落 sustain | `PolySynth.ts:806-818` | S |
| E-03 | 修常开低通与错误旁通 | 关闭时直接**断开**滤波器而非改频率；补实时↔离线 parity 断言 | `EffectsRack.ts:100-107,198-207` | S |
| E-04 | 修降比特 | 提高表分辨率（或按 bits 生成）、加 `oversample:"4x"`、补采样率降采样 | `EffectsRack.ts:62-70,115` | S |
| E-05 | 消除 zipper 噪声 | pan / sendA / sendB 改用 `setTargetAtTime`，目标未变则跳过写入 | `AudioEngine.ts:654-685` | S |
| E-06 | 噪声可复现 + 每次不同 | 用 `PolySynth` 已有的种子 LCG；每次触发传确定性 offset | `AudioEngine.ts:337-346`、`DrumKitModels.ts` | S |
| E-07 | 鼓失真曲线缓存 + 过采样 | 曲线提到模块级缓存，节点复用，`oversample:"4x"` | `AnatomyKickEngine.ts:246-255,760-770` | S |
| E-08 | 复音上限 + 平滑抢音 | 每引擎 voice 上限（如 24），溢出时 5 ms 释放抢最旧 | `PolySynth.ts`、`voiceRegistry.ts` | M |

**Tier 2 —— 音质核心**

| ID | 内容 | 规模 |
|---|---|---|
| E-09 | **真混响与真延迟**（阻尼/预延迟/早期反射/确定性 IR；延迟同步/反馈低通/ping-pong/立体声） | M–L |
| E-10 | 逐轨插入链（HPF + 3-4 段 EQ + 压缩 + 饱和）+ 按角色默认值 | L |
| E-11 | 鼓组总线 + 音乐总线 + 胶水压缩（+ 并联压缩） | M |
| E-12 | **真峰值前瞻限幅**（解 N-15） | M |
| E-13 | **力度→音色**（cutoff/attack/decay/鼓的 click 量）+ 力度曲线 | M |
| E-14 | 逐预设滤波器包络 + 谐振增益补偿 + 可选 24 dB | M |
| E-15 | 打击乐模型库（康加/天巴鼓/邦戈/沙锤/铃鼓/边击/通鼓/吊镲…） | M |
| E-16 | 逐 voice unison + 立体声展开（supersaw 真 7 振荡器） | M |
| E-17 | **离线渲染复用实时图**（解 N-16） | M |
| E-18 | 真 FM + 波表（`PeriodicWave`）声部 | L |
| E-19 | 逐 voice LFO + 调制矩阵 | L |

**Tier 3 —— 内容与默认值**（必须在引擎之后）：C-01 逐曲风鼓组、**C-02 逐曲风机架/总线预设（= 需求 8）**、C-03 按角色插入默认值、C-04 逐曲风打击乐器、C-05 逐曲风和声配置、C-06 逐曲风力度/人性化、C-07 每次改动后重测响度。

**Tier 4 —— 基建与打磨**：E-20 增益结构标准化、E-21 16-bit TPDF 抖动、E-22 收敛到单一 AudioContext、E-23 表头说真话（RMS/真峰值）、E-24 暴露滤波器类型。

### 4.4 度量与门禁（现状缺口 + 方案）

**必须先补的前置**：所有离线单测目前是**图结构测试而非音频测试**——`FakeOfflineAudioContext` 返回**全零缓冲**（`src/test/helpers/fakeAudio.ts:273-275`），所以既有 parity 测试只断言 `type` 字符串与 `.value`。且因为噪声用 `Math.random()`，**同一输入两次渲染都不可复现**，任何采样级门禁都无从谈起。

| ID | 度量 | 手法 | 门禁 |
|---|---|---|---|
| V-01 | **确定性** | 固定种子后同输入两次渲染逐字节比较 | 两次完全一致（**E-06 是其他所有采样级门禁的前提**） |
| V-02 | 真实 PCM 单测宿主 | Node 侧 `OfflineAudioContext` | 使 V-03…V-08 可进 CI |
| V-03 | 真峰值（dBTP） | 4× 过采样 sinc 插值 | **0/159 超过 −1.0 dBTP**（现状 121/159） |
| V-04 | 混叠底 | 单音 FFT，非谐波 bin 能量/基频 | voice ≤ −60 dB；波形成形路径 ≤ −45 dB |
| V-05 | **包络连续性（咔哒检测）** | 长衰减预设单音的二阶差分峰值/中位数 | 起音窗外无跳变尖峰（E-02 的客观判据） |
| V-06 | 混响/延迟表征 | 脉冲响应：分频段 RT60、预延迟、频谱质心随时间 | RT60(4k)/RT60(630) ≤ 0.6（证明有阻尼）；延迟反馈带宽比 ≤ 0.5 |
| V-07 | 立体声宽度 + 单声道兼容 | 中侧能量比、L/R 相关系数 | −0.2 ≤ r ≤ 0.95 且单声道折叠损失 ≤ 3 dB |
| V-08 | 逐轨频谱分离 | 分轨渲染的 1/3 倍频程重叠 | 底鼓与贝斯各自在自身频段占优 ≥ 6 dB |
| V-09 | 峰均比 | `truePeakDb − integratedLufs` | 不得因限幅/总线压缩而低于下限（防「更响但更平」） |
| V-10 | 逐曲风音色指纹 | 13 段对数能量 + 质心 + 滚降 + 相关度 | 建立 `timbre.baseline.json`，参考集 20–30 曲风超差即失败 |
| V-11 | 响度回归 | 沿用 `check_loudness_spread.mjs` | 始终保持 p90−p10 ≤ 1.5 LU |
| V-12 | 削波回归 | 统计裁剪样本数与真峰值 | 16-bit 导出 0 个裁剪样本 |
| V-13 | 主链路空测（null test） | 与反相、增益匹配的 FX 前信号求和 | FX 全关时残余 ≤ −90 dBFS（E-03 的验证手段） |
| V-14 | CPU / 丢步预算 | 统计每步活跃 voice 与节点数、丢步计数 | 峰值并发 voice ≤ 上限；`droppedSteps === 0` |

### 4.5 已经做对、不要回退

`dspGuards.ts` 的指数斜坡护栏（单一收口，曾修掉 F-01 调度卡死）；基于 `OscillatorNode` 的合成天然抗混叠（真正需要过采样的只有 3 处波形成形）；`AnatomyKickEngine` 的三层踢鼓建模（22 Hz 隔直 + 2× 过采样 + 真实音高包络，但**目前不是任何曲风的默认**）；`VoiceRegistry` 的有界登记与无咔哒 panic；`instrumentPresets` 的全回退链；以及 **N-13 的逐曲风混音表**（156/159 有注释化 override、1272 条解析值中 278 种互异组合）。P1 交付后重新配平，全库 p90−p10 由 0.51 LU 进一步收到 **0.32 LU**（全距 1.11 LU，clamp 命中 0/159）——这是本项目最扎实的资产之一，Tier 2 的改动都必须绕开它而不是重做它。

---

## 4.6 P1 交付记录（v1.16.20）

按 §6 排期完成的 P1 内容。**测试 736 / 79 文件全绿，22 条红线全过，响度门禁全过。**

| ID | 交付内容 | 关键证据 |
|---|---|---|
| **E-01** | `chords` 轨由单音改为真实的**自然音阶和声**。新增纯函数模块 `src/audio/chordVoicing.ts`：按 pattern 的 `scale` 解析调式，找到该和弦根音所处的**音级**，再叠置 1-3-5(-7)。实时引擎与离线导出器**调用同一个模块**（exporter parity）。零曲风文件改动 | `bebop`/`funk`/`acid-jazz` 等和弦密集曲风出现了真实和声；`chordVoicing.test.ts` 含「Eb 在 C 小调上必须得到**大三和弦**而非又一个小三和弦」这类不能靠"总是小三"蒙混的用例 |
| **E-02** | 修掉 ADSR 包络的**硬跳变**（长衰减预设每个音都咔哒）。改为解析求值：指数斜坡在 gate 结束点的真实值 = `v0·(v1/v0)^((t−t0)/(t1−t0))`，再从该值开始释放。同时覆盖「gate 落在起音段内」的第二种情形 | `bass808` 在 1/16 音符上原本约 **−4.6 dB 阶跃**；测试对**整个预设表**泛化断言，未来的长衰减预设不会再悄悄复现 |
| **E-03** | 主滤波**真旁通**：不再靠「把频率停到 20 kHz」假装旁通（BiquadFilter 没有透明类型），而是**改接线**——关闭时 `inputNode` 直连饱和级。同时修掉「非 lowpass 类型旁通值错误」 | 此前实时母带**常开一个 16 kHz 双极点低通**，而离线导出器整条机架都不存在——实时与导出并不一致；现已在拓扑上真正旁通 |
| **E-04** | 降比特器：表长按 `stepCount×4` 自适应，使请求的位深**真的可分辨**（原 2048 点表在 `bits≥11` 时比量化还粗，而**出厂默认就是 12**）；补 `oversample:"4x"` 消除折叠失真。**并在注释中明确记录未实现的采样率抽取**（WaveShaper 无记忆，做不到） | 新增测试断言 3/12/16 bit 的实际电平数 |
| **E-05** | 消除调音台 **zipper 噪声**：pan / sendA / sendB 由 `setValueAtTime` 改为 `setTargetAtTime`，且目标未变时跳过写入（拖拽时每帧只做一次比较） | 此前拖声相/送出推子会听到阶梯噪声 |
| **E-06** | **确定性 + 逐击变化**。新增 `src/audio/noise.ts`：种子 LCG（与 PolySynth 同一条递推）+ `noisePositionFor`/`noiseOffsetForHit`。实时与离线共用同一公式。此前每个鼓点都从 buffer 的 offset 0 读起，16 分踩镲是**逐字节相同**的同一段采样 | 测试断言 8 轨×64 步×8 连击**无碰撞**、两次渲染逐值一致，并有源码级守卫防止 `Math.random()` 回归 |
| **E-07** | 逐 voice 踢鼓饱和：补 `oversample:"4x"`（class 路径本来就有，sequencer 可达的这条没有）；`makeDistortionCurve` 提为**按量化 amount 的 LRU 缓存**（上限 32 条），消除每次踩击分配 4096 个 float | 此前 175 BPM 四踩约 **700k float/秒** 的 GC 抖动 |
| **E-08** | **复音上限 + 无咔哒抢音**，收口在 `VoiceRegistry.register` 单一入口。上限按**跟踪的源节点**计（默认 128，约 32 个同时发声的 PolySynth 音符），抢音优先选**最接近自然结束**的那个 voice，并以 5 ms 线性斜坡释放 | 测试断言「不该在有余额时抢音」「不抢已结束的 voice」「从当前电平淡出而非跳到 0」 |
| **V-01** | 确定性前置：噪声床、混响 IR、离线噪声全部改种子生成 + 上述源码级回归守卫 | 这是所有采样级门禁（真峰值/混叠底/包络连续性）的前提 |

**E-01 带来的一个必须记录的真实副作用**：三音和弦的峰值更高，会**更狠地触发母带限幅器**，从而把整个混音压下去——全量 159 曲风重测显示 arranged LUFS 平均 **−1.42 dB**（最差 `techstep` −4.98、`wave` −4.86、`ambient-techno` −3.33）。这正是 **N-15**（限幅器不是砖墙）的又一次实证：它没有在峰值处干净地限幅，而是把整个混音泵低。按门禁第 3 条走了正规流程——重新实测并回填 159 条 trim，配平后 p90−p10 **0.32 LU**（比 P1 前的 0.51 更好）。同时这也说明 **E-12 应提前**：只有当限幅器不再泵动整个混音，逐曲风默认效果链的电平才是可预测的。

**一个被证伪并如实记录的假设**：最初用「给和弦各音 3 ms 起始错开」试图通过去相关来减轻限幅器泵动，全量重测证明**无效**（目标 −16.95 → −17.09 LUFS，反而差 0.14 dB，属噪声量级）——常数时间偏移只是常数相位偏移，持续音之间仍然相干。`CHORD_STRUM_SEC` 因此**保留但改注释**：它只作为起始手感（真实演奏的和弦本就不是一声齐响），不再声称解决电平问题。

**仍未完成、留给下一轮**：`E-14`（逐预设滤波器包络）、`V-02`（Node 侧真实 PCM 单测宿主）、`V-03`/`V-10`（真峰值与音色基线）。`E-13`（力度→音色）与 `E-09`（真混响/延迟）属 Tier 2，按 §6 排在 P2。

---

## 5. 需求 11：SYNTH（GS-1）整合规划

### 5.1 GS-1 事实清单（已实测核对）

| 项 | 事实 |
|---|---|
| 架构 | Rust DSP 核心 → C ABI（**61 个 `gs_*` 导出，`ABI_VERSION = 8`**）→ AudioWorklet → TS `AudioEngine` |
| **跨源隔离** | **不需要** SharedArrayBuffer / COOP-COEP（参数走 224 个 k-rate `AudioParam`，事件走可转移 MessagePort）。这是最关键的结论：嵌入不会改变现有 Cloudflare 托管模型 |
| 许可 | **MIT**，且 WASM 内只链接 MIT 的 DaisySP (`599511b7`) 与 Soundpipe 1.8.1；**无 copyleft，无开源义务**，只需署名 |
| 能力 | 32 复音、10 波形、polyBLEP/BLEP 限带、硬同步、FM/环形调制、unison（1–7，±35 音分，1/√n）、子振荡器、波表（2048×9 层）、采样器、7 类滤波器（ZDF 梯形/SVF/SEM/梳状/**共振峰**）、双滤波器串并联、独立滤波器包络、2 LFO、8 路由调制矩阵、**6 槽自由路由 FX 图（含 Freeverb + 卷积混响）**、真峰值限幅、2× 过采样 |
| 预设 | **91 个工厂预设**，TS 源内联、按数字参数 id 稀疏覆盖，指纹门禁（`verify-presets.mjs`，改声音必须写 `--reason`） |
| 离线渲染 | 支持，且**复用同一个 worklet + WASM**（`src/audio/render.ts:48-161`） |
| **成本** | **16 复音 + 完整效果链 = 每 128 帧 884–1621 µs（量子 2667 µs）＝单音频线程的 33–61%**（`docs/notes/performance.md:173`） |
| **两个「看着有、其实没有」的功能** | **MPE 逐音弯音与 Scala 微分音在 ABI 8 下静默失效**——TS 层完整接线，但 WASM 未导出 `gs_note_bend` / `gs_set_tuning_note`（实测 `undefined`）。任何「GS-1 能给我们微分音」的说法目前都是错的 |
| 仓库关系 | **两个仓库历史完全独立**：零共享提交、双方**都没有 remote**、无共同祖先。GS-1 的 `master` 应视为引擎的规范上游 |

### 5.2 三种整合方案对比

| 维度 | (a) 整体替换 | (b) 抽公共包 | (c) 选择性移植思路 |
|---|---|---|---|
| 产物增量 | +74 KB gzip（SIMD 核）或 +146 KB（含标量回退） | 同 (a) + 包管理管线 | **≈0** |
| 运行成本 | **单实例占音频线程 33–61%** | 同 (a) | 近零（Web Audio 节点是原生实现） |
| SAB / COOP-COEP | 不需要 | 不需要 | 不需要 |
| 曲风数据改动 | **零**（只需重映射 1 张 114 键别名表） | 零 | 零 |
| 复杂度 | 中高（新引擎 + 224 参数 + 新失效模式） | **高**：GS-1 是 `private`，**没有库入口、没有 exports、WASM 被 gitignore**，无可依赖的产物；且其自身工作守则明确「绝不碰 groove」 | **低**，可增量、可独立回滚 |
| 结论 | 不建议整体替换 | 现状不可行 | **先做** |

**推荐：先做 (c)，再对 `chords` / `lead` 两个角色做定点 (a)。**

理由：两个项目解决的问题不同——Groove Lab 的价值在 159 曲风库与**编曲**，GS-1 的价值是**一件深加工的乐器**。用一个占单线程 33–61% 的 WASM 引擎去替换一套近乎免费的 8 轨原生图，对整机是错的交易；但对 `chords`/`lead` 这两个「真正复音、真正持续、且当前最将就」的角色，GS-1 的 32 复音、独立滤波器包络、LFO/调制矩阵、unison 与真混响正好对症。

**分期**：Phase 0 先量化预算（半天）→ Phase 1 移植廉价高收益思路（1–2 周，**不需要任何 GS-1 代码**，只是「学习了它的设计」）→ Phase 2 仅对 `chords`/`lead` 定点接入（2–4 周，走已有的 `resolveInstrumentPreset` 接缝，**零曲风文件改动**）→ Phase 3 用实测决定是否扩到 `bass`，**不假设**。

**「零曲风文件改动」的准确边界**：14 个曲风数据文件（约 7.7 万行）**一行都不用改**——这是已独立核实的事实：`src/data/` 里**不存在任何机器可读的合成器参数**（无 `filter`/`cutoff`/`adsr`/`osc` 键，这些词只出现在双语说明文案里），音色唯一句柄就是 `track.instrument` 这个不透明字符串；`genre.instrumentation[]` 只被 UI 读取，从不进引擎。但**生产代码的改动面不是零**，必须成对修改：

- `src/audio/PolySynth.ts`（`SynthPreset` 接口 `:21-43`、50 个预设表 `:56-676`、声部实现）——震中；
- `src/audio/AudioEngine.ts`（`resolveInstrumentPreset` 调用 `:1389`、四个角色默认签名 `:1487-1548`）；
- **`src/audio/WavExporter.ts`（调用 `:266`、复制的角色分发 `:277-306`、`synthFX` 重实现 `:314`）**——这是最容易漏的一处。项目把「导出 parity」当作硬约束，在**四处**显式声明并测试（`AudioEngine.ts:1299-1301`、`PolySynth.ts:694-695`、`WavExporter.ts:165-167`、`:263-265`）；
- 约 6–7 个测试文件编码了当前参数：`polySynth` / `audioScheduler` / `wavMixerParity` / `instrumentPresets` / `audioDspGuards` / `effectsRack` / `exporterParity`。

`lead` 角色有 **27 个不同乐器名**（kick 5 / snare 6 / hihat 1 / percussion 1 / bass 14 / chords 11 / **lead 27** / fx 9），是映射设计工作量最集中的地方，其中约 8 个是 GS-1 无法建模的原声乐器——**这张映射表本身是 Phase 2 最大的一块工作，不是一次查表**。

注意也**不要假设 50 个预设都有曲风消费者**：例如 `deepPluck`（`PolySynth.ts:78`）在曲风数据与所有角色回退表里都不可达，只被 `polySynth.test.ts` 钉住。设计 GS-1 patch 映射时应按**实际被引用的 60 个乐器名**去设计，而不是按预设表 1:1 铺开。

**Phase 2 还有一项容易被低估的固定成本：覆盖率门禁。** 本仓库 `vitest` 已有硬性下限（lines 78 / statements 78 / branches 60 / functions 58），且 CI 除了单测还跑 **chromium + firefox + webkit 三浏览器 e2e 矩阵**（`scripts/test_matrix.js`，7 个目标）。好消息是 Safari/iOS 风险已被既有门禁覆盖、不需要新建基建；代价是新增的引擎适配层必须一并把覆盖率补上，否则门禁会红。

### 5.3 替换哪些音色（8 个角色）

| 角色 | 结论 | 理由 |
|---|---|---|
| **chords** | ✅ **值得换** | 当前最弱、GS-1 最强的一环：真复音 + 持续音，32 复音池、独立滤波器包络、unison、真混响全都用得上 |
| **lead** | ✅ **值得换** | 同上，且最受益于 unison 展开、滑音、弯音与调制矩阵。**例外**：`flute_lead`/`sax_lead`/`trumpet_lead`/`sitar_lead` 等原声乐器，两个引擎都不对，GS-1 未必更好 |
| **bass** | ⚠️ **移植思路，不换引擎** | 贝斯多为单音，32 复音与调制矩阵用不上；但它缺的三样正好可移植：**子振荡器**、**键盘跟踪**、**滤波器内逐 voice 饱和**（acid 的嘶吼） |
| kick / snare / hihat / percussion | ❌ **不要换** | GS-1 是减法合成器，没有「音高包络 + 点击」的踢鼓模型、没有噪声+腔体的军鼓模型，且逐 voice 滤波是它最贵的路径。踢鼓是 60 ms 瞬态，为它付 32 复音引擎的固定成本严格更差；踩镲还是密度最高的声部（16 分音符每小节 16 次）。**另有一个反向理由**：`AnatomyKickEngine` 内部**已经有四份彼此分叉的踢鼓实现**（类 `trigger()` `:418-567`、模块 `synthesizeAnatomyKickVoice` `:730-737` 无隔直、离线 `exportWav` `:599-653` 且**少了 rumble 层**、以及两处 waveshaper 位置不一致），今天就已经是一条 parity 风险面。把鼓组改道 GS-1 会**再加一条** parity 面，而不是减少一条 |
| fx | ❌ **不要换** | 159/159 曲风都声明 `noise_sweep`，现实现已与离线导出器**逐字节对齐**（导出 parity 是有意设计的）。换成 GS-1 patch 会破坏该保证且无听感收益 |

### 5.4 上游合并策略：vendor + 哈希锁定 + 单向同步脚本

**为什么不用 submodule / subtree / npm 依赖**：

- **submodule**：双方都没有 remote，只能写本地路径 → 换机器/CI 立刻失效；且 GS-1 的 WASM 被 gitignore，fresh clone 没有 .wasm，而 Groove Lab 的 CI 没有 Rust/clang 工具链，拿到源码也构建不出来。
- **subtree**：会把 GS-1 的**全部 542 个提交**（含它自己的 Vite 应用外壳、Playwright 套件、300 KB DSP 手册、MCP server、544 文件的 `release/`）永久拼进 Groove Lab 历史，而真正需要的只有约 5 个文件；会污染 `git log`/`blame`，并与 `version:check`、`redlines` 等基于干净历史的工具冲突。
- **npm 依赖**：**现在根本没有可依赖的东西**（`private: true`、无库入口、产物是整站而非引擎、WASM 未提交）。

**采用 vendor 目录 + 清单 + 同步脚本**：

```
vendor/gs1/
  UPSTREAM.json          # { version, commit, abi, files:{path:sha256}, wasm:{...:sha256} }
  LICENSE                # GS-1 的 MIT 文本
  THIRD_PARTY_NOTICES.md # DaisySP + Soundpipe 的 MIT 署名（GS-1 自己的 dist 里没有，必须我们补）
  worklet-processor.js   # 逐字节取自上游
  params.ts              # 224 项参数表（或所用子集）
  engine.gs1.ts          # 手写的薄适配层（见下）
  synth_core.wasm        # 构建产物，**在 Groove Lab 里必须提交**
  synth_core_scalar.wasm # 仅当要支持 Safari < 16.4
```

**冻结三样东西作为契约**（由门禁断言，而不是靠约定）：

1. **ABI 版本**：`gs_abi_version()` 必须等于 `UPSTREAM.json.abi`。ABI 变动＝线格式变了，应**让门禁失败**而非被静默吸收。
2. **WASM 内容哈希**：每个 `.wasm` 的 SHA-256 记入清单并由门禁校验——这能抓住「ABI 没变但行为变了」的重构建。
3. **消息协议面**：入站 `type` 字符串清单 + 从 WASM 实际读出（而非硬编码）的 `MAX_VOICES=32`、`MAX_BLOCK_SIZE=1024`、`SPECTRUM_BINS=36`。

**适配层要手写一个 9 方法的窄接口**，而不是直接复用 GS-1 的 `AudioEngine`（它有 40+ 公开方法，其中 `noteBend`/`setTuning` 在 ABI 8 下是死的）：`init / noteOn / noteOff / allNotesOff / setPatch / setParam / onAnalysis / onPolyphony / dispose`。冻结窄面意味着上游重构其余 31 个方法不会波及我们。

**「上游发了新版本」标准流程**：读上游 changelog 并**先看 ABI 是否变了**（变了就停，这属于契约破坏）→ 在上游构建并跑它的 5 道门禁（`test:wasm` / `verify:presets` / `verify:presets:2x` / `test:dsp` / `verify:dsp:2x`）确保拿到的是被上游认可的那个产物 → `node scripts/sync-gs1.mjs --from ../synth --commit <sha>` 单向同步（**永不写入 synth 目录**）→ 重点 review `params.ts` 与 `worklet-processor.js` 的 diff → `version:sync` + 补一行 changelog（`GS-1 engine: 2.1.3 → 2.1.4 (ABI 8)`）→ 本地 `verify`。

### 5.5 需要新增的门禁

| 门禁 | 内容 |
|---|---|
| `scripts/check_gs1.mjs` | WASM 可校验；清单内每个文件 sha256 匹配；ABI === 8；`max_voices/max_block/spectrum_bins` 与契约一致；参数表无重复 id 且不越界 |
| **扩展 `scripts/check_budgets.js`** | **当前预算脚本对 `.wasm` 完全盲**（逐 chunk 循环只筛 `.js`，初始路由只统计 `index.html` 引用）。不加这一行，未来 WASM 涨 40% 也会静默通过 |
| `version.json` 增 `dependencies.gs1` | `{version, abi, wasmSha256}`，由 `version.mjs` 的 check 模式断言与清单一致 |
| 契约测试 | vitest 里加载 vendored WASM，断言 ABI/上限、渲染一个音非静音、`gs_alloc_violations() === 0` |
| 署名审计 | 任何含 GS-1 代码的构建，必须在 `public/` 提供 `LICENSE` + `THIRD_PARTY_NOTICES.md`（GS-1 自身产物里没有，这是必须我们补的合规缺口） |

**一个治理事实值得明确**：Groove Lab 目前**没有任何第三方依赖追踪**——无 SBOM、无许可证清单、无 `npm audit` 步骤、无 Dependabot/Renovate（`.github/` 下只有 `workflows/ci.yml`），最接近的机制只有包体预算门禁与红线 R1b。因此 `version.json` 的 `gs1` 区块 + `check_gs1.mjs` 会成为本仓库**第一套依赖锁定机制**。这应当被当作一次有意的工程决定来做，而不是顺手加的一个脚本——否则未来的引擎升级会缺少可追溯的锚点。可参照的既有先例是红线 **R9**（强制每个曲风入口都走 `patternFromGenre`/`applyGenreMixDefaults`）：同样是「用一条红线把易漏的接线收敛到单一通道」。

### 5.6 风险与待验证实验

| # | 风险 | 说明 |
|---|---|---|
| R1 | **多轨 CPU 是成败未知数** | GS-1 自测 16 复音+全 FX 占单线程 33–61%，而 `chords`/`lead` 恰恰是**同时且持续**发声的两个角色。必须实测 |
| R2 | `gs_init` **不重置参数块/调制矩阵/相位** | 换采样率重新 init 会带过旧状态；且核心**不导出参数枚举**，宿主必须自备完整默认表 |
| R3 | **上游已记录但未修的参数 id 冲突** | FX 图节点参数范围与普通参数**重叠**（如 `FX_NODE_OUT_GAIN+1 == FX_DELAY_MIX`），会导致「节点 2 读到节点 1」并双重驱动。上游称之为「兼容性红线」而**选择不修**。若我们用它的 FX 图就会撞上 |
| R4 | **参数表在 Rust 与 TS 里各写一份** | 上游靠自己的 `param-range.test.ts` 兜住（该测试曾抓到 3 个真实上线缺陷）。**vendor 子集若丢掉这个测试就丢掉了护栏**——必须一并 vendor 或重写 |
| R5 | `gs_set_param` 越界会**静默换算法** | 浏览器按描述符 min/max 夹紧，Rust 解码把夹紧值映射到**另一个枚举分支**而非报错。绝不能写未经范围检查的值 |
| R6 | 多 AudioContext | 必须把 GS-1 节点建在**现有** context 上（`AudioWorkletClock.ts` 已证明可行），否则 iOS 上两个 `audioSession` 互相打架、设备争用。**准确说法**：本应用**今天已经在创建最多 5 个 context**（`AudioEngine.ts:226`、`voiceRegistry.ts:105` 的工厂被 Chord/Masterclass 共用、`AnatomyKickEngine.ts:319-323`、`AnalyzerSignalGenerator.ts:37`）。所以这**不是**「新增第二 context 的风险」，而是「不要把这个既有的坏味道再复制一遍」——多 context 意味着多份延迟与时钟。顺带一个白拿的改进：全仓库 **`latencyHint` 出现 0 次**，移植 GS-1 的 `new AudioContext({ latencyHint: 'interactive' })` 是零成本的延迟收益 |
| R7 | 离线首装缺口 | Groove Lab 的 SW 对 `/assets/*` 是运行时缓存而非预缓存，装了却从没联网加载过引擎的用户会没有引擎 |
| R8 | `wasm-opt` 可选且静默降级 | 上游缺 binaryen 时会发未优化核（约 +35%）。我们提交的是**构建产物**，同步脚本应记录体积并对突增告警 |

**待跑实验**：**E1** WASM 能否加载渲染（已实测通过：两个核都 `validate:true`、61 个导出、ABI 8、`peakL 0.1408`、`allocViol 0`）→ **E2** worklet 能否在 Groove Lab 的 Vite 构建与**现有 context** 上加载 → **E3（决定性）** 在 Groove Lab 满 8 轨时再加一个 GS-1 实例，读它的 `analysis.load`：**若超 35%（它自己的 `OVER_LOAD` 阈值）就把接入限制为 `lead` 单声部** → **E4** 对拟 vendor 的那个产物跑上游 5 道门禁 → **E5** 署名审计 → **E6** PWA 离线检查。

---

## 6. 建议排期

| 阶段 | 内容 | 依赖 | 规模 |
|---|---|---|---|
| ✅ 已完成 | 需求 7 缓存修复 + 回归测试 + 全门禁复验 | — | 小 |
| P1 | §4 Tier 1 八项（E-01…E-08）+ V-01 确定性 + 音色基线 | — | M |
| P2 | E-09 真混响/真延迟、E-12 真峰值限幅（N-15）、E-17 实时/离线同图（N-16） | P1 | M–L |
| P3 | **需求 8**：`genreFx.ts` + 引擎接线 + 工程迁移 + R10 红线 | P2（总线可参数化） | M |
| P4 | **需求 9**：逐曲风创作性默认值 + 全量听感复核 + 响度重配平 | P3 | M |
| P5 | E-10/E-11/E-13/E-14 逐轨插入与力度→音色；C-03 按角色默认值 | P2 | L |
| P6 | **需求 11**：Phase 0 预算实测 → E3 决策 → 定点接入 `chords`/`lead` + vendor 管线与门禁 | P2 | L |

---

## 7. 验收与回归门禁汇总

任何一项音频改动合入前必须同时满足：

1. `npm run verify` 全绿（typecheck / lint / lint:data / test / build / check:budget / test:e2e）；
2. `npm run redlines` 22 条（新增 R10 后 23 条）全过；
3. `check_loudness_spread.mjs` 保持绿（p90−p10 ≤ 1.5 LU，全距 ≤ 4 dB）——**任何改变电平的改动都必须重跑 `measure_genre_loudness.mjs` 并回填 trim**；
4. V-01 确定性成立（否则采样级门禁无意义）；
5. 涉及混响/延迟的改动，V-06 的阻尼与反馈带宽比达标；
6. 涉及母带的改动，V-03 真峰值 0/159 超 −1.0 dBTP；
7. **不靠听感结论合入**——每项改动都要在 PR 里给出上表对应的数字。

---

## 8. 相关文件索引

**需求 7（已交付）**：`src/utils/changelog.ts`（新增）、`src/components/UpdatesModal.tsx`、`public/sw.js`、`public/_headers`、`src/test/changelogUpdate.test.ts`（新增）

**需求 8 待改**：`src/data/genreFx.ts`（新增）、`src/audio/AudioEngine.ts:348-390/497-563/569-604`、`src/audio/EffectsRack.ts`、`src/views/StudioView.tsx:146`、`src/features/sequencer/hooks/useAudioEngineLifecycle.ts:238-261`、`src/features/sequencer/projectDb.ts`、`src/components/console/*`、`scripts/redlines.mjs`

**需求 10 待改**：`src/audio/PolySynth.ts`、`src/audio/DrumKitModels.ts`、`src/audio/AnatomyKickEngine.ts`、`src/audio/voiceRegistry.ts:82-88`、`src/audio/WavExporter.ts`、`src/test/helpers/{fakeAudio,loudness}.ts`、`scripts/check_loudness_spread.mjs`

**需求 11 待改**：`vendor/gs1/*`（新增）、`scripts/sync-gs1.mjs`（新增）、`scripts/check_gs1.mjs`（新增）、`scripts/check_budgets.js`、`scripts/version.mjs`、`src/audio/instrumentPresets.ts:224`

**既有设计记录**：`MIX_LOUDNESS_NOTES.md`（N-13 混音与响度）、`TIMBRE_NOTES.md`（预设策展）、`ROADMAP_V2.md`（Phase 5–8）、`BACKLOG.md`、`CODE_REVIEW_AND_PLAN_v1.16.0.md`（N-13…N-16 原始登记）
