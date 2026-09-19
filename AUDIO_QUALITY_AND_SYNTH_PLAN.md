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

同级目录的 GS-1 把更新记录**编译进 bundle**（当时的做法：一个由构建生成的头部模块被 `App.tsx` 静态引入，完整历史留在另一个模块里）。于是「记录」与「代码」同哈希、同版本，**结构上不可能不一致**，代价是包体。

**这一条已经被取代**：更新记录现在走**网络**——`/version.json`（小、`no-store`、带 `?t=` 破坏缓存）与 `/changelog.json`（完整、可缓存、按版本号取 URL）。取代它的原因记在 `src/utils/changelog.ts` 的文件头：客户端缓存里的归档会比 `latest` 慢一版，于是「更新了却看不到这次更新的记录」。

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

按 §6 排期完成的 P1 内容。**736 测试 / 79 文件全绿；slow 轨全过（typecheck、全量 lint、data lint、docs、覆盖率、build、budget、3 浏览器 7 目标 e2e、性能门禁）；22 条红线全过；响度门禁全过。已提交 `f72a95f` 并部署上线。**

> **线上验收（部署后实测，2026-09-15）**：`https://silent-river-9229.gradetwo.workers.dev`
> - `/version.json` → `1.16.20`，`changelogCount: 62`，`latest` 为该版且含 8 条双语要点；
> - `/changelog.json?v=1.16.20` → 62 条，**最新三条依次为 1.16.20 / 1.16.19 / 1.16.18** —— 即需求 7 的修复在线上成立（版本键使新版本不可能命中旧副本，且渲染取并集后最新一条不可能被顶掉）；
> - 部署：`Uploaded 26 files (33 already uploaded)`，`dist` 内 `version.json` / `changelog.json` / `sw.js` 的 CACHE_VERSION 均为 `1.16.20`。

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

**仍未完成、留给下一轮**：`E-14`（逐预设滤波器包络）、`V-02`（Node 侧真实 PCM 单测宿主）、`V-10`（音色基线）。`E-13`（力度→音色）与 `E-09`（真混响/延迟）属 Tier 2，按 §6 排在 P2。

---

## 4.7 P2 首项交付记录（v1.16.21）：E-12 真峰值前瞻限幅器 + V-03 真峰值表

**N-15 关闭。** 这是 P2 被提前的一项——P1 的实测已经证明限幅器会**泵低整个混音**（E-01 加和声时全库平均掉 1.42 dB），只要它还这样，逐曲风默认效果链的电平就不可预测，P3 无从谈起。

| ID | 交付内容 | 证据 |
|---|---|---|
| **E-12** | 新增 `src/audio/MasterLimiter.ts` + `public/limiterWorklet.js`：**3 ms 前瞻**的滑动窗口最小值（增益在瞬态到达输出**之前**已经压低）、**4× 过采样真峰值检测**（BS.1770-4 Annex 2 同款 12-tap/相位多相插值）、**−1.0 dBTP 硬天花板**、**立体声联动**（硬声相瞬态不会移动声像）、分级释放（浅压缩 80 ms / 深压缩 400 ms）、逐样本计算无阶梯写入、完全确定性 | 三个消费点（实时 `AudioEngine`、离线 `WavExporter`、和弦工作站 `ChordAudioEngine`）都改为 `createMasterLimiter`；句柄的 `input`/`output` 节点**身份不变**，因此图可以在同步构造期一次接好，worklet 异步换入 |
| **V-03** | `src/test/helpers/loudness.ts` 补真峰值：4× 过采样、Kaiser-β=8.0 的 48-tap 原型插值器；`LoudnessResult` 新增 `truePeakDb`（并保留 `samplePeakDb`，因已提交基线依赖它） | 单测用**样本峰值低于满刻度但真峰值超过满刻度**的信号证明两者确实不同——这正是真峰值存在的理由 |
| **门禁** | `check_loudness_spread.mjs` 新增两条**会失败**的断言：① 0 个曲风样本峰值超 0 dBFS；② 无曲风超出 −1 dBTP 天花板（容差 0.02 dB） | 只有真峰值能看见**采样间过冲**，只看样本峰值的门禁恰好漏掉限幅器存在的意义 |
| **降级** | AudioWorklet 不可用时（旧引擎、jsdom、测试替身）回落到原 `DynamicsCompressorNode`，并把 `kind` 报为 `"fallback"`，**不假装**有真峰值保证 | 离线路径在 `startRendering()` 前 `await handle.ready`——`OfflineAudioContext` 是一次性渲染，worklet 若在渲染后才装好，整个导出会静默落在回落路径上 |

**实测结果（全量 159 曲风离线渲染，`--bars=3 --repeats=1`，与已提交基线同口径）**：

| 指标 | E-12 之前 | E-12 之后 |
|---|---|---|
| **样本峰值超 0 dBFS** | **121/159**（最差 riddim +1.63 dBFS，被 16-bit 编码器硬削） | **0/159** |
| 最差真峰值 | 未度量（无真峰值表） | **−0.996 dBTP**（`disco`），天花板 −1.0 dBTP |
| 配平后 LUFS p90−p10 | 0.32 LU | 0.80 LU（上限 1.5） |
| 配平后全距 | 1.11 LU | 2.53 LU（上限 4） |
| trim clamp 命中 | 0/159 | 0/159 |

那 4 个「超出」天花板 0.004 dB 以内的曲风（`disco` −0.996、`dubstep` −0.998、`big-beat` −0.998、`boom-bap` −0.999）是**限幅器检测器与本表两个独立估计器之间的数值差异**，不是可听过的过冲——容差 0.02 dB 就是为此设的，而不是把门禁调到刚好通过。

**库整体电平下降约 0.7 dB**（中位数 arranged −17.09 → −17.80 LUFS）：真峰值天花板比原来那个"20:1、3 ms 起攻、实际放行 1/20 超量"的压缩器更严格，这是**预期且正确**的方向。已按流程重测并回填 159 条 trim。

---

## 4.8 E-01 后续：和弦按曲风选声部形态（用户反馈）

**用户反馈**：和弦要用曲风对应的用法——摇滚喜欢 power 和弦、jazz 变化更多，不能就是简单 135。

**属实，且根因在数据侧**：`common_chords` 在 **159 个曲风里只有 2 个互不相同的字符串**（`i–VI–III–VII` / `i–v–VI–VII`），**连 Jazz/Blues 与 Rock/Metal 都完全相同**。所以「爵士和声更有变化」**不可能**从曲风数据里读出来。这与 `instrumentation` 在 N-12 之前的状态同类；`common_chords` 仍是旧状态，**登记为后续数据项**。

| 交付 | 内容 |
|---|---|
| 9 种声部形态 | **音程型**（与调式无关）：`power` = 根音+纯五+八度（**无三度**）、`open` = 根音+五+八+十二。**音阶级数型**（随调式）：`triad`/`add9`/`sus`/`shell`(1-3-7 无五度)/`seventh`/`extended`(1-3-7-9)/`quartal`(叠四度)。每种自带 span 与注释里的音乐理由 |
| 为什么 power 必须是音程型 | 用音阶级数叠置会在某些级数上得到**减五度**，那就不是 power chord 了。断言直接写成「`power` 在任何音级上都不含三度」 |
| `src/data/genreVoicing.ts` | 6 个 category 默认 + 约 80 条逐曲风 override（每条必带 reason）+ 乐器回退（自定义曲风按 chords 轨音色推断）。`death-metal`/`black-metal`/`metalcore`/`grunge`/`punk-rock` → power；`bebop`/`hard-bop`/`bossa-nova`/`neo-soul` → extended；`modal-jazz`/`free-jazz` → quartal；`funk`/`soul`/`disco`/`boom-bap`/`deep-house` → seventh；`ambient`/`ambient-dub` → sus；`shoe-gaze`/`wave` → open；`city-pop`/`j-pop` → add9 |
| 兼容 | 旧 `density: "triad"|"seventh"` 保留为别名，既有调用方与测试不受影响 |
| 端到端 parity | 测试直接断言**渲染出来的音**：`death-metal` → `[0,7,12]`、`bebop` → `[0,3,10,14]`（C-Eb-Bb-D）、`ambient` 无三度、且实时与离线对 5 个曲风给出同一组音 |

**表完整性门禁当场抓到 3 个真实错误**：我虚构了不存在的曲风 `acid-jazz-electronic`；`shell` 的测试期望值写错（实现给的 C-Eb-Bb = `[0,3,10]` 是对的，我却写成 `[0,3,7]`，那其实是三和弦）；11 条 reason 只是「As UK garage.」这类交叉引用而非自证。均已修正，门禁保持严格。


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
| `scripts/check-gs1.mjs` | WASM 可校验；清单内每个文件 sha256 匹配；ABI === 8；`max_voices/max_block/spectrum_bins` 与契约一致；参数表无重复 id 且不越界 |
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

| 阶段 | 内容 | 依赖 | 规模 | 状态 |
|---|---|---|---|---|
| ✅ 已完成 | 需求 7 缓存修复 + 回归测试 + 全门禁复验 | — | 小 | ✅ v1.16.20 |
| P1 | §4 Tier 1 八项（E-01…E-08）+ V-01 确定性 + 音色基线 | — | M | ✅ v1.16.20–v2.0.5（音色基线 V-10 于 v2.0.5 补齐） |
| P2 | E-09 真混响/真延迟、E-12 真峰值限幅（N-15）、E-17 实时/离线同图（N-16） | P1 | M–L | ✅ v2.0.2 |
| P3 | **需求 8**：`genreFx.ts` + 引擎接线 + 工程迁移 + R10 红线 | P2（总线可参数化） | M | ✅ v2.0.2 |
| P4 | **需求 9**：逐曲风创作性默认值 + 全量听感复核 + 响度重配平 | P3 | M | ✅ v2.0.5（§4.13、§4.14） |
| P5 | E-10/E-11/E-13/E-14 逐轨插入与力度→音色；C-03 按角色默认值 | P2 | L | ✅ v2.0.2（E-10/E-13/C-03）、v2.0.10（E-11）、v2.0.11（E-14）；另完成 E-15 |
| P6 | **需求 11**：Phase 0 预算实测 → E3 决策 → 定点接入 `chords`/`lead` + vendor 管线与门禁 | P2 | L | ✅ vendor 管线 v2.0.2；Phase 0/E2/E3 v2.0.6；署名合规与路由表 v2.0.7；E7 时序 v2.0.9/v2.0.12；调度核心 v2.0.14；双侧接线+parity v2.0.15；**默认开启并重测重配平 v2.0.16** |

**六个阶段全部交付。** 每个版本都走 fast 轨迭代，发布前 slow 轨与 redlines / docs / version /
budget / 四个证据门禁（响度、音色、GS-1 预算、GS-1 时序）全绿，并逐版本更新 changelog
（当前 80 条）。**唯一剩下的、不属于本计划的后续项**：把已实现却一直没有 UI 的音频设置
（延迟补偿 / 听力保护 / 音量上限）与 GS-1 开关收进一个正式设置面板——GS-1 开关本身已在
工具栏可用（v2.0.16）。

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

**需求 11 待改**：`vendor/gs1/*`（新增）、`scripts/sync-gs1.mjs`（新增）、`scripts/check-gs1.mjs`（新增）、`scripts/check_budgets.js`、`scripts/version.mjs`、`src/audio/instrumentPresets.ts:224`

**既有设计记录**：`MIX_LOUDNESS_NOTES.md`（N-13 混音与响度）、`TIMBRE_NOTES.md`（预设策展）、`ROADMAP_V2.md`（Phase 5–8）、`BACKLOG.md`、`CODE_REVIEW_AND_PLAN_v1.16.0.md`（N-13…N-16 原始登记）

---

## 4.9 和弦的「指法」与乐器（用户反馈第二轮，v2.0.1）

**用户反馈**：和弦的音色和乐器也要按曲风常用的来设计，和弦指法例如连音、柱式，音长也是。

**两半都是真问题，且各有各的根因。**

### 4.9.1 指法与音长：此前 159 个曲风共用一套奏法

旧引擎对所有曲风给同一个答案：所有音一律 `stepDur · gate · 1.5` 长、起始错开固定 3 ms。于是**雷鬼的 skank 像垫子一样长鸣、funk 的短促和弦糊成一片、金属的闷音却在延音**。

新增 6 种**奏法（articulation）**，每种是「音长倍率 + 起始展开」：

| 奏法 | gateScale | 起始展开 | 用于 |
|---|---|---|---|
| `stab` | **0.30** | 1 ms | house/techno 短促和弦、funk 和弦、雷鬼 skank、蒙图诺、金属闷音 power chord |
| `comp` | 0.55 | 8 ms | 爵士伴奏——短而留白，否则压死独奏 |
| `strum` | 0.80 | 22 ms | 吉他扫弦（约等于一次真实下扫的时长） |
| `block` | 1.00 | 3 ms | **历史行为**，键盘/垫子的柱式和弦 |
| `roll` | 1.30 | 90 ms | 琶音滚奏（钢琴/harp 手势） |
| `sustain` | **3.00** | 12 ms | 垫子、弦乐、ambient/shoegaze 音墙、黑金属颤音拨弦 |

判定规则只写一次（表内不再重复）：**和弦是在承担节奏还是在承担和声？**承担节奏（funk/雷鬼/techno stab/金属 riff/蒙图诺）就短而紧；承担和声（pad/弦乐/ambient）就鸣响超过一步；吉他语汇用扫弦；爵士语汇用伴奏。`GENRE_ARTICULATION` 约 110 条逐曲风 override，每条带理由。

### 4.9.2 乐器：数据早已写明每把琴的音色，轨道却一律用同一把

N-12 的策展给每个金属曲风写了**具体的音箱描述**——`death-metal` 是「HM-2 Buzzsaw Guitar」、`metalcore` 是「High-Gain 5150 Guitar」、`thrash-metal` 是「Scooped-Mid High-Gain Guitar」——但它们的 chords 轨**全部**指向通用的 `guitar_lead`（一个主音吉他预设）。数据里的意图没有落到轨道上。

- 新增 `distortedGuitar` 预设（**高增益节奏吉他**，明确不是「更响的 lead」）：截止频率 **1500 Hz**（远低于 lead 的 2700，因为 power chord 活在低中频，这是它不刺耳的原因）、Q **6.5**（远高于 lead 的 3.5，那个中频「鼻音」才让它切得出来）、双锯齿 + `osc2Mix 0.85`（厚实的双轨墙）、快起音 + 短释放（闷音要的就是紧）。
- 别名与门禁：`distorted_guitar` 加入别名表与 `INSTRUMENT_TOKENS`；token 直接取策展文案里已有的词（`distorted guitar` / `high-gain` / `overdriven guitar` / `fuzz` / `buzzsaw` / `tremolo-picked` / `down-tuned`），于是「轨道乐器必须被该曲风的配器清单点名」这条既有门禁把器材意图与轨道绑在了一起。
- **定点改动 9 个高增益曲风**的 chords 轨：`hard-rock`/`punk-rock`/`heavy-metal`/`thrash-metal`/`death-metal`/`black-metal`/`doom-metal`/`metalcore`/`grunge`。非高增益的吉他曲风（`rock-and-roll`/`blues-rock`/`post-punk`/`alternative-rock`/`math-rock`/`shoe-gaze`）**保持 `guitar_lead`**。lead 轨一律不动——主音吉他就该是主音吉他。
- 一次自我纠错：我最初把 `new-wave`/`progressive-rock` 也算作「吉他曲风」，测试显示前者用 pad、后者用 organ（本就如此）。断言已改成「这些曲风**不得**被误改成失真吉他」，而不是我猜的乐器名。

`instrumentPresets.test.ts` 的**钉死清单**如期拦下了新乐器，要求显式更新——这正是它存在的意义。

### 4.9.3 实测

奏法改动显著改变能量分布（stab 只有原来的 30% 长度，sustain 是 300%），因此按门禁第 3 条重新实测 159 曲风并回填 trim：

| 指标 | v2.0.0（上一版） | 本版 |
|---|---|---|
| 配平后 LUFS p90−p10 | 0.80 LU | **0.69 LU**（上限 1.5） |
| 配平后全距 | 2.53 LU | **2.77 LU**（上限 4） |
| 样本峰值超 0 dBFS | 0/159 | **0/159** |
| 最差真峰值 | −0.996 dBTP | **−0.983 dBTP**（天花板 −1.0） |
| trim clamp 命中 | 0/159 | 0/159 |

**测试**：`genreVoicing.test.ts` 现覆盖声部形态、奏法、乐器三层。关键断言包括——奏法按音长正确排序（stab < comp < strum < block < sustain）、funk/雷鬼/salsa/techno/金属的 gateScale ≤ 0.6 而 ambient/trance/shoegaze/doom/black 的 ≥ 1.5、**端到端**渲染出的音长与起始展开与解析器一致（含「同乐器对比以隔离奏法」这一更锐利的对照），以及失真吉他**可测地更重**（更暗、更冲、更厚、更紧）而不只是改了标签。

**过程中修掉一个自己写的 bug**：真峰值汇总块用 `arrangedTruePeakDb` 过滤，但序列化报告里只写了 `trimmedTruePeakDb`，导致整块被静默跳过（`Math.random` 那类「静默失效」的同一模式）。已修，并把 `arrangedTruePeakDb` 也序列化出来。

---

## 4.10 P2 续：E-09 真混响/真延迟 + E-17 实时离线同图（v2.0.2）

### E-17 · 实时与离线共用一张渲染图（关闭 N-16）

**问题**：实时引擎与离线导出器各建一张母带图，且已经分叉到**用户能听出来**：

- **导出根本没有送出总线**。`sendA`/`sendB` 是逐曲风数据（159 个曲风都编排过混响/延迟送出），但导出器里**连混响和延迟都没有**，所以混响密集的曲风导出是干的。
- **导出没有主 FX 机架**：用户在 FLT/DRIVE/CHORUS/LO-FI 里拧的一切都不在成品里。
- **导出用 masterGain 0.85，实时用 0.8**：与效果无关的 ~0.5 dB 电平差。

**修法是结构性的**：新增 `src/audio/masterGraph.ts`，一个 `buildMasterGraph(ctx, opts)` 供两边共用（实时多装一组表头分析器，离线不装）。链路与实时引擎既有链路逐节点一致：

```
轨道 + 总线返回 ─► masterGain（用户推子）─► loudnessTrimGain（逐曲风配平）
                    ─► fxRack ─► true-peak limiter ─► 表头/输出
```

trim 仍在限幅器**之前**（限幅器保持绝对天花板）；总线返回仍汇入推子（推子移动湿声，与真实调音台一致）。

**顺带发现并修掉的两处浪费**：E-17 让导出器第一次用上 FX 机架后，测试里冒出多余的振荡器与双二阶——**合唱 LFO 与滤波节点在效果关闭时也被创建**。合唱 LFO 改为懒创建/关闭即释放（`ensureChorusLfo`/`releaseChorusLfo`）；滤波节点则保留（其旁通测试断言"参数仍跟随设定值"，有价值，且单个 biquad 成本可忽略），改为让导出器的测试按**截止频率集合**断言而不是按下标。

### E-09 · 真正的混响与延迟总线

旧混响是 `ConvolverNode` + 合成白噪声 IR：**无频率相关衰减**（尾巴一直是亮的、像加噪不像空间）、无预延迟、无早期反射、固定 1.5 秒、返回量 0.35 硬编码。旧延迟是固定 250 ms、反馈 0.32、**反馈环里没有滤波**（每次重复都全带宽、越来越刺耳）、单声道、返回量 0.25 硬编码。

新增 `src/audio/ReverbBus.ts` 与 `src/audio/DelayBus.ts`（各带独立测试，共 50 条）：

| | 现在 |
|---|---|
| 混响 | 预延迟 + **5 个离散早期反射** + 扩散尾；**分频段衰减**（800 Hz 交叉，高频 RT60 = `decaySec·(1−0.75·damping)`）——这才是"尾巴随时间变暗"；`width` 控制立体声去相关；显式套用 Web Audio 的卷积等功率归一化并 `normalize=false`，使返回量成为唯一的湿声电平；确定性种子（无 `Math.random`） |
| 延迟 | 可设时间（0.02–4 s）与**音乐分割**（1/4、附点八分、三连八分…）；**反馈环内置低通**（`dampHz`）使每次重复变暗；可选 ping-pong（先分轨再合并，绝不把多声道信号塞进 merger 输入而丢立体声）；反馈钳到 0.9；返回量唯一的湿声电平；`enabled=false` 用斜坡而非阶跃 |

实测 RT60：`decaySec` 0.6→0.599 s、1.8→1.799、4→4.008、10→9.988（误差 ~0.2%）。阻尼扫描（`decaySec=2`，rt630/rt4k）：0→2.03/2.00、0.5→2.12/1.24、1.0→2.07/0.51。

**一个值得留档的失败尝试**：先用"低通截止随时间下降"实现阻尼，实测 RT60(4 kHz) 只从 2.0 缩到 1.44 s（28%）——下降的截止只是让局部斜率变陡，截止饱和后高频又回到基础衰减率。改成分频段衰减才给出 2.0→0.51 s。**不要回退到下降截止的做法。**

---

## 4.11 P3：逐曲风母带 FX 默认值（N-14 / v2.0.2）

**这是用户最初的需求 2**：「母带 FX 机架需要逐曲风默认值，需要 dub 长延迟、ambient 长混响、metal 饱和这类创作性默认」。此前 `DEFAULT_FX_STATE` 是全库唯一一套且四项全关，159 个曲风**零声明**——这就是登记项 N-14 描述的状态。

新增 `src/data/genreFx.ts`：6 个 category profile + **55 条逐曲风 override**（每条带 reason），解析方式与 `genreMix`/`genreVoicing` 完全同构。三个点名案例：

- **`dub`**：延迟 `1/4` 音符、反馈 **0.68**、反馈低通 **2 kHz**（重复逐次变暗）、ping-pong、返回 0.40。
- **`ambient`**：混响 **9 秒**、阻尼 0.55、预延迟 70 ms、返回 0.50。
- **`death-metal`/`thrash`/`heavy`/`black`/`metalcore`**：**饱和开**（`drive` 4.5–6）+ 极小房间（0.7–2.4 s）。

**速度同步用「演奏速度」**：`delayDivision` 在应用时用 `pattern.bpm`（即 `sequencer_pattern.bpm`）换算，绝不用元数据 `default_bpm`——全库实测 **87/159** 个曲风两者不同，用错会让过半曲风的重复落不到拍上。`setBpm` 也会重算，用户改速度时延迟跟着走。

**一处共享**：`applyGenreFxToGraph(graph, fx, playingBpm)` 是被实时与离线**共同调用**的唯一应用点，避免"播放一套、导出另一套"。

**与 UI 的一致性**：`useGenreSwitching` 在切曲风时把解析出的 rack 写入抽屉状态（`setEffectsRackState`）——否则会出现"UI 显示全关、引擎却开着效果"这种比不做更糟的谎。自定义曲风解析为 `null`，保留用户设置。

**门禁**：新增红线 **R10**（FX 表不得含不存在的曲风 id），红线总数 22 → **23**。数据完整性门禁在本轮再次抓到我自己写的 7 个**虚构曲风 id**（`drill`/`drone`/`drum-and-bass`/`dub_reggae`/`dub_version`/`lo-fi`/`post-rock`）——已改为真实 id 或删除；这正是这条红线存在的意义。

---

## 4.12 多线并行交付（v2.0.2）：E-13 力度→音色、E-15 打击乐模型库、D-05/D-03/G-02、GS-1 vendor 管线

本轮按「异步多线推进」并行开了 4 条互不重叠文件域的工作线。

### E-13 · 力度 → 音色（P5）

**缺陷**：力度只映射到音量，且是线性（`safeVel * 0.8`）。真实乐器弹重了会更亮、更有冲击力；这里重音与弱音只是响度不同。线性还使 MIDI 上端压缩：力度 64 是 −6 dB、32 是 −12 dB。

**实现**：`velocityCurve(v) = v²`（等功率/感知映射；力度 64 → −12 dB 而非 −6 dB；`v=1` 恰为 1）。`SynthPreset` 新增 4 个**可选**字段（默认 0）：`velocityToCutoff`（弱奏时低通关几档）、`velocityToFilterEnv`、`velocityToAttack`、`velocityToDecay`。**21 个拟真类预设**被标注；其余保持原样。

**满力度逐字节不变**：不是靠推理——把 `git show HEAD:src/audio/PolySynth.ts` 的旧实现与新实现同时加载，对 51 预设 × 3 音高 × 4 时值在 `v=1` 比较**全部**调度参数事件：**612/612 完全一致**。

### E-15 · 打击乐模型库（P5）

**缺陷**：`synthesizePercussion` 只有两个声音——808 牛铃、其余拍手。而拉丁/世界、爵士、Afrobeat 等曲风**就是**由康加、天巴鼓、沙锤、Clave、Agogo 构成的。数据侧核实：159 个曲风的 percussion 轨一律 `rim_shaker`，`instrumentation` 散文中写着 Timbales/Congas/Guiro/Clave/Surdo/Pandeiro/Agogo。

**实现**：**16 个模型**，按轨道的 `instrument` 名（含散文名）做子串解析——`rim_shaker` 复合模型（900 Hz rim click + 4200 Hz 沙锤层）、膜类（康加/邦戈/天巴/通鼓：两个失谐模态 + 快速音高下坠 + 接触噪声）、金属类（Agogo/三角铁）、木质类（Clave/边击/木鱼：噪声激励进高 Q 短带通）、沙锤类（沙锤/Cabasa/Guiro/铃鼓）、以及保留原样的拍手与 808 牛铃。未知名字保持**原有回退**（808→牛铃，其余→拍手）。同时加入鼓的力度→音色（亮度、衰减、瞬态），**`v=1` 时三个系数恰为 1**，并用与 E-13 相同的手法和旧模块逐参数对比验证 18 个 fixture **0 差异**。

**顺带修掉一处 exporter parity 缺口**：`WavExporter` 之前**不转发** `track.instrument`，离线导出仍渲染旧的牛铃/拍手，而实时已经用新模型——这条已由我补上（2 处调用点），否则「导出与试听一致」这条硬规则会被打破。

### D-05 / D-03 / G-02 · 工作台（v2.0.x 里程碑）

- **G-02 先写会红的测试**：`src/test/fxParamReachability.test.ts` 断言 7 个 FX 参数各有 ≥1 个 `.tsx` 写入点。修改前 **0/7**（正是登记缺陷 S-P1-4「有壳无芯」），实现后 7/7。匹配规则刻意严格：字段必须作为 FX setter 调用实参对象里的**非引号键或简写**出现，且排除「自己读自己」；字符串、注释、类型声明、`.ts` 里的写入都不算——并在报告里给出红/绿两次原始输出。另有两条**反空过**守卫（证明扫描器能认出现有的 `filterEnabled` 写入、证明确实扫到了 `.tsx`）。
- **D-05**：抽屉内为 4 个效果各接出主参数——**对数**截止频率滑条（线性 20–20000 Hz 是没法用的）、滤波类型下拉、饱和驱动、合唱混合、比特深度；`filterQ`/`chorusRate` 收进新的 ADV 次级区。全部带 `aria-label`（滑条另有 `aria-valuetext`）与 `data-fx-param` 测试钩子。**默认值一字未改**。
- **D-03**：FX 进撤销栈。子代理完成 store 侧（`effectsRack` 进 `SequencerState` 与快照、新增 `SET_EFFECTS_RACK`）并证明「一次 commit 只占 1 条历史、一次 undo 同时回退 FX 与 pattern」；但 store 侧单独是**惰性**的，因为 `effectsRackState` 原本是 `StudioView` 的局部 `useState`。我补上了端到端接线：局部 state 保留为 UI 的真相源（所有既有消费者都接 React setter），每次改动**镜像**进 store 参与历史，并在历史恢复时回灌局部 state；滑条拖动用 `commitCoalesced` 合并为一条。
- 8 个新 i18n 键已补进 `src/i18n/locales/studio.ts`（`i18nKeys.test.ts` 会校验字面量 `t()` 键）。

### P6 第一步 · GS-1 vendor 管线与契约门禁

- **vendor 子集已落地**并钉死：`groove-synth-gs1 v2.1.4 @ 2b5b3550`、**ABI 8**，含 worklet processor、参数表、host engine、两个 wasm（SIMD 217,049 B / scalar 203,046 B）与 MIT LICENSE。**wasm 必须提交**——本仓 CI 没有 Rust 工具链，无法重建。
- `scripts/sync-gs1.mjs` 是**单向**的：上游字节只经 `readUpstream()` 读，所有写入经 `writeVendored()`，后者拒绝 `vendor/gs1` 之外的目标、也拒绝把目标放在上游树内。上游缺 wasm 时**不做任何 vendoring**，只打印确切的 `npm run build:wasm` 指令。
- `scripts/check-gs1.mjs` **22 项断言**：6 个哈希、两个核 validate + 实例化、**从模块里读** `gs_abi_version()=8`/`max_voices=32`/`max_block_size=1024`/`spectrum_bins=36`、224 个参数 id 无重复、渲染非静音、`gs_alloc_violations()=0`。无清单时明确 SKIP；有清单则严格失败（清单只在全部文件成功后写出，所以"有清单缺文件"正是要抓的坏状态）。已接入 `check:budget` 与 `verify`。
- **包体门禁补上 wasm 行**：此前 `check_budgets.js` 只看 `.js`，几百 KB 的 wasm 对它**完全不可见**。新增单件 96 KB / 合计 170 KB 上限，实测 74.98 + 72.22 = **147.2 KB**（40% 增长会失败，已用合成的 195 KB 验证）。

**未做（P6 的下一步，需实测决策）**：真正的引擎接入（把 `chords`/`lead` 路由到 GS-1）尚未开始——按计划要先做 E3 的多轨 CPU 实测再决定范围。此外 vendored `engine.ts` 有 4 个非 vendored 的 host 依赖（`settle`/`wasmFetch`/`@/pwa/register`/`@/i18n`），运行时（`worklet-processor.js`）自包含，但接入时需要适配或重映射。

## 4.13 曲风和声数据修复：159 个曲风的「经典走向」此前是同一对（随 v2.0.4 发布）

**来源**：用户第二轮反馈「和弦要用曲风对应的用法，例如摇滚喜欢 power 和谐，而 jazz 和弦就更多变化，不能就简单 135」。4.9 解决的是**引擎生成**的和弦（奏法 / 乐器 / 声部形态），这一节解决**数据库里写给用户看的那一份**——`InfoDossier` 的「经典走向」行。

### 实测到的缺陷

| 事实 | 数值 |
|---|---|
| `common_chords` 数组总数 | 159（每个曲风一个） |
| **不同的取值集合数** | **1** |
| 唯一内容 | `i–VI–III–VII` / `i–v–VI–VII` |

也就是说：**bebop、salsa、K-pop、black metal、ambient 全都写着同一条小调进行**。这是"模板化文案"里最容易被用户抓到的一种——因为它不是散文，是**结构化数据**，一眼就能看出是复制粘贴。`genreContentAudit` 早已把整库的模板化文案记为 *warning*（文档化基线），但没有任何检查盯住这种"结构化字段全库同值"的退化。

### 修法（不改引擎，纯数据）

- 逐曲风给出 2–3 条**该曲风真实使用的**罗马数字进行，共 **159 条**，全部改写进 `src/data/genres/*.ts`（15 个文件）。不再引入 overlay 模块：字段本来就在每个曲风里，正确的做法是把它**填对**，而不是再加一层间接。
- 用法约定：小写=小三和弦、大写=大三和弦、`♭` 前缀=降号级数（`i–♭VI–♭VII–i`），与既有 `–`（en dash）连接格式一致。
- 抽样说明意图：`bebop`/`smooth-jazz` → `ii–V–I`（爵士的Ⅱ-Ⅴ-Ⅰ）；`chicago-blues` → `I–IV–V–IV`（blues 的Ⅰ-Ⅳ-Ⅴ）；`black-metal` → `i–♭II–♭VII–i`（弗里吉亚）；`j-pop` → `IV–V–iii–vi`（王道进行）；`uk-drill` → `i–VI–iv–v`（drill 的标志性 6-4 下滑）；`ambient` → `I–IV–I` / `i–VI–i`（长音持续，进行极简）。

### 结果与守护

| 指标 | 修前 | 修后 |
|---|---|---|
| 不同取值集合数 | **1** | **110** |
| 单一集合最多被多少曲风共用 | 159 | **7** |
| 空数组 / 少于 2 条 | 0 | 0 |

新增 `src/test/genreHarmony.test.ts`（7 条）并**接入 `npm run lint:data`**：① 每个曲风非空；② 恰好 2–3 条；③ 语法必须是罗马数字（正则允许 `♭` 前缀、拒绝 `1-4-5`/`i VI` 这类写法）；④ 同一曲风内不重复；⑤ **不同集合数 > 40 且没有任何集合被超过 10 个曲风共用**——这条才是真正防止退回"全库一个默认值"的哨兵；⑥ 点名断言 idom 正确性（`bebop` 必含 `ii–V–I`、`black-metal` 必含 `♭II`、`bebop` 不得含旧的 `i–VI–III–VII`、Jazz/Blues 全类不得出现降号级数）；⑦ 正则本身的**变异守卫**（喂给它 `1-4-5`、`i VI`、`i–` 必须判错），保证"绿"是有意义的绿。

### 诚实说明（未做 / 未验证）

- **纯展示字段，不经过音频**：引擎的和声来自曲风的音阶与 `genreVoicing.ts`，`common_chords` 不被 `AudioEngine`/`WavExporter` 读取（`chordVoicing.test.ts` 的文件头注释已说明这一点）。因此本次改动**不需要重测响度**，159 曲风的 trim 基线一字未动——但反过来说，**改这些字符串不会让任何曲风听起来更对**，它修的是"应用在教用户什么"。
- 曲风数量多、我无法对每一条进行文献级考证：惯例取自各曲风被广泛引用的和声套路（Ⅱ-Ⅴ-Ⅰ、Ⅰ-Ⅳ-Ⅴ、弗里吉亚、王道进行、drill 6-4 等），属**音乐常识级**而非"引用级"证据。`genreContentAudit` 的 `sources` 规则管的是别的字段，这 159 条字符串**没有引用来源**。
- 有几处刻意保留了大小调混写（如 `funk` 的 `i–iv–i` 与 `i–IV–i`、`disco` 的小调主歌/大调副歌），因为真实音乐就是混的；守卫只要求"不是全库同值 + 语法合法"，不强制调式统一。
- 浏览器内的视觉效果（`♭` 在 `JetBrains Mono` 下的字形回退、三行进行在窄屏的换行）**未做截图验收**，属慢轨 e2e 范畴。

## 4.14 P4 交付记录（v2.0.5）：逐曲风创作性默认值 + V-10 音色基线 + 响度重配平

**含项**：需求 9 阶段 D。三个交付物，外加过程中查出的两个真实链路缺陷。

### (1) 逐轨插入链的逐曲风层（`src/data/genreInsert.ts`）

`trackInsert.ts` 只回答「一条 *bass* 通道该是什么样」，回答不了「一条 *dub* 的 bass 该是什么样」——
而这两者的差别正是曲风的辨识度来源。该模块此前**有意搁置**这一层，理由写得很清楚：
"在角色默认值被听过之前就加 159 条，是在猜测之上再猜测"。P4 的条件就是把这个搁置条件补上。

- **159 个曲风逐一手写**（无 family 分组：曲风家族互相重叠——`dub-techno` 既是 dub 也是 techno——
  用代码消歧会把决定藏起来）。每条带一行理由，共 14 个命名 patch 复用（`SATURATED_GUITAR`
  `CRUNCH_GUITAR` `DRIVEN_BASS` `DUB_BASS` `DUB_SNARE` `TRAP_808` `CLUB_KICK` `WARM_DRIVE`
  `JAZZ_CLEAN` `JAZZ_BASS` `AMBIENT_PAD` `LOFI_TAPE` `LATIN_PERC` `POP_LEAD` `ACID_LEAD`
  `DRIVEN_KICK` `DARK_TOP`）。
- **驱动是主杠杆**：所有角色默认 `driveEnabled: false`，因为"该不该驱动、驱动多少"是**曲风**属性而非
  角色属性——金属节奏吉他 4.5、爵士伴奏 0、dub bass 2.2（当音色而不是当失真）。`driveMix` 一律 ≤ 0.6，
  避免把"音色变化"做成"电平跳变"。
- **接法**：新增 `resolveTrackInsertForGenre(role, genreId)`（角色默认 ← 该曲风 patch），
  4 个调用点全部改用它：`AudioEngine`（两条路径）、`WavExporter`、`useSequencerStore`、`StudioView`。
  用户存过的逐轨 `insert` 仍然优先。
- **测试**：`genreInsert.test.ts`（覆盖：159 个 id 与 `ALL_GENRES` 完全相等——R10 式哨兵、
  只碰真实字段、1272 条解析结果全部落在 DSP 的 clamp 范围内、不污染角色默认值、变异守卫）
  + `genreInsertWiring.test.ts`（真实引擎读回 + **源码级接线断言**：4 个调用点必须调用
  `resolveTrackInsertForGenre(` 且不得残留 `resolveTrackInsert(`——后者意味着某处悄悄丢掉了 genre 参数）。

### (2) V-10 音色基线（P1 的"音色基线"，此前一直缺）

- `src/test/helpers/timbre.ts`：**13 段 2/3 倍频程 RBJ 带通滤波器组**（不是 FFT——仓库里没有 FFT，
  且不为此新增），输出电平无关的 `bandDb` 形状向量 + 质心 + 滚降 + L/R 相关度 + `rmsDb`。
  纯函数、零依赖、无 `Math.random`/`Date`。诚实边界写在模块头：质心/滚降的分辨率是**一个频带**而非 FFT bin。
- `scripts/measure_genre_timbre.mjs`：真实浏览器离线渲染 159 曲风（复用响度测量的 Vite dev server
  + Playwright 架构，端口 3160 以免与响度脚本冲突），写出 `scripts/timbre.baseline.json`。
- `scripts/check_timbre_spread.mjs` + `scripts/timbreSource.mjs`：**离线、不渲染**的门禁，
  已接入慢轨（`scripts/track.mjs`）。除了数值合法性，它还核对
  「录音时的插入链源码摘要 + 每个曲风的 patch 摘要 + 每个曲风的乐器清单」——插入默认值被改动时
  它会指名到曲风，而不是默默放过。
- **实测**：**159/159 形状互异**（0.01 dB 量化）；最近一对 `brostep ↔ glitch-hop` **0.4552 dB**
  （地板 0.25）；平均对距 3.49 dB、最大 13.16 dB；重复渲染极差 ≤ 1e-4 dB；
  质心跨度 100.2 Hz（schranz）→ 1022 Hz（free-jazz）。
  这就是"全量听感复核"的**客观替身**：如果 159 个曲风的默认值退化成一个样子，这个门禁会红。

### (3) 响度重配平（顺带查出两个真实缺陷）

详见 `MIX_LOUDNESS_NOTES.md` §7。要点：

| 缺陷 | 证据 | 修法 |
|---|---|---|
| **响度 trim 站在非线性级之前**，补偿被机架饱和吃掉 | 需要 +7.07 dB 的 dubstep 实测只涨 **1.74 dB**；旧 trim 直接套用后实测 p90−p10 = **3.14 dB**（门禁 1.5） | 链路改为 `fader → fxRack → loudnessTrimGain → limiter`，trim 成为最后一个线性级；同时让音色不再依赖 trim，使 V-10 基线对每个曲风都成立 |
| **限幅器检测器比验收表低读约 0.12 dB** | 实测最差真峰值 **−0.88 dBTP**（afrobeat），超出承诺的 −1.0 dBTP | 新增 `MASTER_LIMITER_DETECTOR_MARGIN_DB = 0.15`，内部目标 −1.15 dBTP；承诺由测量兑现 |
| **测量脚本两个自身缺陷** | `--genres=` 子集会覆盖提交基线；trim 求解假设响度对增益线性（BS.1770 相对门使其非线性），单次相减后残留 1.97 dB | 任何收窄参数都改写到 partial；改为**迭代求解**（每轮只重渲越界曲风、按实测残差修正、最多 5 轮），并保证每个 trim 都有实测值 |

**重配平结果（159 曲风）**：trim 后 p90−p10 **0.40 dB**（门禁 1.5；上一份基线 0.59）、
全距 **2.68 dB**（门禁 4）、clamp **0/159**、采样峰值 >0 dBFS **0/159**、
最差真峰值 **−1.027 dBTP**（0/159 超 −1.0）。绝对电平回到本文第 4 节最初记录的 −15.80 LUFS 附近。

### 诚实说明（未做 / 未验证）

- **门禁盲区（重要）**：`check_loudness_spread.mjs` 与 `check_timbre_spread.mjs` 都**只读已提交的报告**，
  从不重渲染。它们能保证"报告自洽 + 拓扑正确 + 源码未漂移"，**不能**发现"代码改动让实际响度/音色变了"。
  上一份响度基线就是这样在门禁全绿的情况下过期了 5.7 dB。已把这句话写进两个门禁和本节。
- **20 个曲风没有收敛到 ±0.2 dB**（最差 2.43 dB，microhouse 偏轻），但都在门禁口径内；
  这是迭代轮次上限的结果，不是已知错误。已作为 `trimConvergence.stillOutside` 记录在报告里。
- **逐曲风插入的取值是音乐常识级判断**，没有听感 AB 测试，也没有引用级考证；§3.4 的点名案例
  （metal drive 4–5、jazz 关闭、dub 1.6、house 1.4）是唯一有文档依据的部分。
- **V-10 是整段描述子**，不做分帧/时窗分析：编曲密度变化若各乐器频谱相近，形状几乎不动。
  它是音色门禁，不是编曲门禁。
- `scripts/loudness_live_baseline.json`（实时路径探针）**未重测**，因此它描述的是旧链路的实时响度；
  没有门禁读它，仅供参考。实时/离线的一致性由共享的 `buildMasterGraph` 与两侧的拓扑测试保证
  （`masterLoudnessTrim.test.ts` / `wavLoudnessTrim.test.ts`）。
- Tier 4 的 **E-20 增益结构标准化**只做了本文这一处（trim 归位 + 限幅器余量）；
  母线级（鼓组/音乐双总线 + 胶水压缩，E-11）仍未做。

## 5.7 P6 Phase 0 实测（v2.0.6）：E2 通过，E3 给出接入上限

**用户要求的「Phase 0 预算实测 → E3 决策」已执行完**，结论不是"能不能接"，而是"接到多少复音"。

### E2 · 能不能在 Groove Lab 自己的构建与 context 上跑起来 —— **通过**

| 检查 | 结果 |
|---|---|
| 走 Vite dev server（与响度/音色测量同一套架构）加载 vendored worklet | ✅ |
| 建在**应用自己的 AudioContext** 上（不新建 context，R6） | ✅ 实测页面里 2 个 context，测量用的是 state=running 的那个 @44.1 kHz |
| WASM 变体 | ✅ **SIMD 核**（先验证字节再信任特性探测，未回退标量） |
| ABI | ✅ 8（与 `UPSTREAM.json` 一致） |
| 真的出声 | ✅ 每个配置 peak 0.22–0.44、`voices seen` 与请求一致 |
| 分配器违规 | ✅ **0**（全部 4 个配置） |
| 页面错误 | ✅ 0 |

### E3 · 满 8 轨时再加一个 GS-1 实例的实测负载（决定性）

测试条件：`heavy-metal`（8 个角色全开、母带机架带饱和、chords/lead/bass 带驱动插入，是原生图最重的曲风），应用引擎**正在播放**，再在同一个 context 上加一个 GS-1 实例按住一个持续和弦。**`load` 是 GS-1 自己报告的"占 128 帧量子的比例"**。

| 请求复音 | 实际发声 | load 中位数 | load p90 | 实时比 | 分配违规 | 处理器自身告警 |
|---|---|---|---|---|---|---|
| 4 | 4 | 0.010 | **0.028** | 1.00 | 0 | 无 |
| 8 | 8 | 0.026 | **0.054** | 1.00 | 0 | 无 |
| 12 | 12 | 0.062 | 0.124 | 0.95 | 0 | 无 |
| 16 | 16 | 0.205 | **0.336** | **0.58** | 0 | 无（但已掉出实时） |

（另一次含 24 复音的扫描中，请求 24 与 32 都只发出 **16** 个音——见下"未解决"。）

**决策（按计划的 0.35 阈值，但表述为复音上限而不是"接/不接"）**：**把 GS-1 的复音上限定在 8，最多 12**。
理由是 8 复音已足够覆盖 `chords`（3–5 音声部）+ `lead`（1 音），而 p90 仅 0.054、实时比 1.00；
16 复音虽然 `load` 中位数 0.205 看着还行，但 p90 已 0.336 且**实时比掉到 0.58——音频线程已经跑不动**，
这正是"看着有余量、实际在丢帧"的典型误判。计划原文的二元规则（超 0.35 就只做单声部 lead）在实测面前
可以放宽成"chords+lead 共用一个 8 复音实例"，但仍**不**做 16 复音持续和弦。

**两个只有实测才能发现的坑（都已写进门禁）**：
1. **处理器在前 2000 ms 渲染音频里故意把 `load` 报成 0**（`WARMUP_MS`），且它的开销估计是非对称跟随器
   （上升 alpha 0.05）。用 1.5 s 的测量窗口会得到"全程 0.000"——第一版脚本正是这样，等于"证明了 GS-1 免费"。
   现在测量强制要求 hold−postWarmup ≥ 2 s，门禁也会拒绝窗口不足的报告。
2. **源节点不连到 destination 就永远不会被拉取**：worklet 不跑，分析帧全缺，`load` 是 NaN。第一版宿主适配器
   就踩了这个（连接的是自己内部的 gain，没有接到 destination）。

### 交付物（v2.0.6）

- `src/audio/gs1/Gs1Host.ts`：**手写的九方法窄接口**（`createGs1Host`/`noteOn`/`noteOff`/`allNotesOff`/
  `setPatch`/`setParam`/`onAnalysis`/`onPolyphony`/`dispose`）。**不 import 上游 `engine.ts`**，因此那 4 个
  非 vendored 的 host 依赖（`./settle`、`./wasmFetch`、`@/pwa/register`、`@/i18n`）从根上不存在；
  也**不创建 AudioContext**。参数 id→AudioParam 名称的映射直接读 vendored `PARAM_NAMES`，
  不再手写第二份参数表（计划风险 R4）。SIMD→标量回退以 `WebAssembly.validate` 为准。
  **不暴露 `noteBend`/微分音**——ABI 8 没导出，暴露它们就是撒谎。
- `scripts/measure_gs1_load.mjs`（E2/E3 测量，写 `scripts/gs1.load.baseline.json`）
  + `scripts/check_gs1_load.mjs`（离线证据门禁，已接入慢轨）。
  门禁检查的是"证据是否还有资格说话"：窗口是否够长、warmup 常量是否与处理器一致、
  每个配置是否真的出声/零违规/有 settled 帧，以及**文档化复音上限处**的 p90 与实时比。
  它**不**检测"GS-1 变慢了"——那需要重跑测量。
- `src/test/gs1Host.test.ts`：16 条，用假 `AudioWorkletNode`/假 context/假 fetch 覆盖消息协议、
  参数映射与全部失败路径（ABI 不符、处理器报错、fetch 失败、无 AudioWorklet、dispose 后不再发消息）。

### 未解决 / 未验证（诚实说明）

- **请求 24/32 复音只发出 16 个音**：即使显式发送 `setPolyphony` 也是如此。`gs_max_voices()` 报 32，
  但实际声部数停在 16。**无法从本次测量判断是核心内部上限还是 worklet 的 `maxPoly` 夹取**——
  Phase 2 若要超过 8 复音必须先查清这一点。
- **本次数据来自一台 8 核桌面 + 无头 Chromium**，不是手机。计划的 33–61% 出自 GS-1 自己的文档；
  本次同口径（16 复音、满 8 轨同时播放）测得 p90 0.336 / 实时比 0.58。**移动端未测**，
  因此在移动端把上限从 8 再往上调是没有依据的。
- **Phase 2 的引擎接线尚未开始**：本版只交付适配器与实测结论，`chords`/`lead` 仍由原生引擎发声。
  接线前还缺两件事：① `lead` 的 27 个乐器名到 GS-1 patch 的映射表（计划 §5.2 已指出这是最大的一块工作）；
  ② **署名合规**——`vendor/gs1/THIRD_PARTY_NOTICES.md`（DaisySP + Soundpipe 的 MIT 署名）**目前不存在**，
  上游产物里也没有，必须我们补；在补上之前不得发布任何让 GS-1 发声的构建。

## 5.8 P6 Phase 2 前置（v2.0.7）：署名合规落地 + 逐乐器路由表

Phase 2 的引擎接线还没开始，但它的两个**前置条件**这一版做完了。两者都是"不做完就不能接线"的。

### (1) 署名合规（E5）——这是发布阻断项

GS-1 的 WASM 把 **DaisySP**（含 Plaits 来源）与 **Soundpipe** 直接链进二进制，而上游产物**只带自己的 MIT LICENSE，不带这两家的notice**。因此重新分发这个 wasm 是**我们必须自己补的许可义务**——而且它天然隐形：wasm 照样加载、门禁照样全绿、仓库里没有任何东西提示缺了什么。

- 新增 `vendor/gs1/THIRD_PARTY_NOTICES.md`：**逐字**复制四段 MIT 正文（GS-1、DaisySP、Plaits、Soundpipe），版权行取自上游各自的 LICENSE 文件而非记忆；并说明了**为什么这个文件必须存在**（上游缺口），免得后来者把它当冗余删掉。
- `public/THIRD_PARTY_NOTICES.md`：与 vendor 版**逐字节相同**（用户能真正取到的那一份）。两份手写的法律文本迟早会有一份过期，所以用测试强制相等。
- 新文件在两个"vendor 目录不允许有未登记文件"的检查里加入白名单（`scripts/check-gs1.mjs` 与 `src/test/gs1Contract.test.ts`）——它们是**我们自己的**文件，不是上游 pin，因此不进哈希清单。
- 新增 `src/test/gs1Attribution.test.ts`（5 条）：文件存在、四段版权行齐全、MIT 授权句与免责句齐全、public 与 vendor 逐字节相同、**"适配器存在 ⇒ notice 必须存在"**（即计划里"不得发布任何让 GS-1 发声的构建"那条规则的可检查形式）。

### (2) 逐乐器路由表（Phase 2 最大的一块工作）

实测统计了 `chords` / `lead` 两个角色在 159 曲风里**真正出现**的乐器名：**chords 12 个、lead 27 个**（计划预估 11/27，chords 实际 12）。

- 新增 `src/data/gs1Patches.ts`：**10 个手写 patch**（`warmPad` / `electricPiano` / `sustainedStrings` /
  `cleanPluck` / `supersawStack` / `drivenGuitar` / `analogLead` / `squareLead` / `acidLead` /
  `bellMallet` / `organStack`），每个是 GS-1 自己格式的稀疏 `Record<paramId, value>`，
  参数 id 与取值域全部取自 vendored `params.ts` 与 worklet 的 `PARAMS` 表。
- 路由决策**分两类并各自给理由**：合成器本就是对的工具 → 上 GS-1（chords 8/12、lead 17/27）；
  身份来自**声学琴体或木质/槌击瞬态**的 → **保留原生**（piano / vibraphone / marimba / accordion /
  brass_section / sax / trumpet / muted trumpet / harmonica / flute / pan flute / sitar）。
  `sax_lead` 这类"减法合成没有诚实对应物"的，宁可留在原生也不硬塞一个 patch。
- **不 vendor 上游 91 个工厂预设**：它们是为 GS-1 自己的 UI 写的、是它树里最大的单个文件，
  且每次上游同步都要重新 review。10 个一屏可读完、每个都写了它在追求什么音色的 patch，
  是更小也更诚实的依赖。参数格式与预设完全相同。
- 新增 `src/test/gs1Patches.test.ts`（14 条）：**从 `ALL_GENRES` 反查**两个角色的乐器名并要求
  **零遗漏、零孤儿**（新曲风带一个新乐器名进来时必然变红）；每个 native 决策必须有真实理由；
  每个 patch 的每个取值必须落在 **worklet `PARAMS` 表**声明的 min/max 内（计划风险 R5：
  越界会被核心映射到**另一个算法**而不是报错）；每个 patch 必须真的构成一个声音
  （osc + filter + env + ≥12 个参数）；`PATCH_GAIN ≤ 0.6` 给母带留余量。

### 仍未做（诚实说明）

- **引擎接线尚未开始**：本版交付的是"可以接线"的全部前置物（适配器、实测上限、合规、路由表），
  `chords`/`lead` 仍由原生引擎发声。**没有任何一轨的声音在本版发生变化。**
- 这 10 个 patch 是**按参数语义写的，不是靠听感调出来的**：`src/data/gs1Patches.ts` 是死代码
  （无消费方），并且它**不在** `scripts/timbre.baseline.json` 的描述范围内——那份基线指纹的是原生链路。
  "GS-1 的 pad 是否比原生预设更好听"这个问题，本仓库目前**没有能力测量**，这也是接线要带
  per-role 开关、原生引擎作回退的原因（回退是一个常量，不是一次 revert）。
- 路由表按**乐器名**决策，不区分曲风：同一个 `warm_pad` 在 ambient 与在 house 里拿到同一个 patch。
  逐曲风的 patch 微调（若需要）属于后续工作。

## 5.9 P6 Phase 2 的阻塞点（v2.0.8）：vendored ABI 8 的 note 消息**无法定点调度**

按计划 §5.2 的推荐路线，Phase 2 应该"走已有的 `resolveInstrumentPreset` 接缝，把 `chords`/`lead` 定点接到 GS-1"。
适配器、实测上限（8 复音）、署名合规、39 个乐器名的路由表都已就绪（§5.7、§5.8）。
**但接线本身卡在一个协议层面的事实上，而这条事实会让接线直接违反本仓库的硬性 parity 规则。**

### 事实（全部可复验，不是推断）

| # | 事实 | 出处 |
|---|---|---|
| 1 | Groove Lab 的调度是**采样精确**的：每个音都带确切的 `AudioContext` 时间入队，**前瞻 200 ms**（`scheduleAheadSec = 0.20`） | `src/audio/AudioEngine.ts:201`、`:1296` |
| 2 | vendored worklet 的**每一条入站消息都是"到达即生效"**，没有任何一条带时间/帧字段。把 `handleMessage` 的 `case` 标签逐个解析出来，得到 `noteOn`/`noteOnPan`/`noteOff`/`allNotesOff`/`panic`/`pitchBend`/`aftertouch`/`modWheel`/`modRoute`/`noteBend`/`tuning`/`setPolyphony`/`downgrade`/`wavetable`/…，**没有一条**能表达"在第 N 帧发声" | `vendor/gs1/src/audio/worklet-processor.js`（由 `src/test/gs1Scheduling.test.ts` **解析**验证，不是靠读注释） |
| 3 | 因此：在调度时刻发 `noteOn` → 早最多 **200 ms**；推迟到临响再发 → 晚一个量子加主线程定时器抖动（该 200 ms 前瞻存在的理由正是"拖动 UI 时不能掉音"，抖动可达数十毫秒） | 1 + 2 |
| 4 | **唯一能精确指定渲染时刻的机制是 `OfflineAudioContext.suspend(t)`**，而上游自己的离线渲染器正是这么做的（在 suspend 回调里 `postMessage({type:'noteOn'})`）。`suspend` **没有实时对应物** | 姊妹仓库 `src/audio/render.ts:145`（上游代码，非本仓） |

结论：给 `chords`/`lead` 接上 GS-1，**播放与导出必然在时间上不一致**——而"实时与离线逐样本一致"
是本项目写在四处并在测试里强制的硬规则（`AudioEngine`、`PolySynth`、`WavExporter` ×2）。
这不是"音色好不好听"的取舍，是**节奏准确性**的取舍：在一个步进音序器里，`chords`/`lead` 恰恰是
两个持续发声、最依赖准时入拍的角色。

### 处理方式：不接线，但把前置条件做成**可检查且会自我解除**的

新增 `src/test/gs1Scheduling.test.ts`（5 条）：

1. 解析 worklet 的入站消息类型（>8 条，含 `noteOn`/`noteOff`）——先证明解析器活着；
2. 断言**没有任何入站 note 消息读取 `data.at`/`data.frame`/`data.time` 之类的字段**；
3. 从 `AudioEngine` 读出真实的前瞻秒数并要求 ≥0.1 s（把结论钉在一个数字上）；
4. **自我解除的守卫**：当协议里**没有**定时消息时，两个引擎**不得**引用 GS-1 host；
   一旦上游加了定时消息（`noteAt`/`noteOnAt`/`noteOffAt`/`scheduleNote`/`eventsAt`），
   同一条测试**自动转为允许并期待接线**——所以它不是一道永久围栏，而是一张待办清单；
5. 要求导出器里仍写着 parity 主张（否则这条守卫的理由本身需要重写，而不是默默过期）。

### 给上游的提案（worklet-only，不需要动 ABI）

在 `handleMessage` 里新增一对消息，并在 `process()` 里按帧消费一个队列：

```js
// 入站（宿主把 AudioContext 时间换算成绝对帧）
{ type: 'noteAt',    note, velocity, pan?, atFrame }   // atFrame = Math.round(atTime * sampleRate)
{ type: 'noteOffAt', note, atFrame }
// 处理器：维护 this.frame（每个 process 累加 block），在每块开头把 atFrame <= 本块末帧 的事件
// 依次 gs_note_on/gs_note_off；跨块的事件留在队列里。宿主仍可按现有方式批量预排 200 ms。
```

要点：**这是处理器层的排队，不新增 `gs_*` 导出，因此 ABI 可以仍是 8**；但 `worklet-processor.js`
的哈希会变，`check-gs1.mjs` 会**如实报出上游文件变化**——这正是 vendor 纪律想要的行为。
上游落地后走既有单向同步流程（`scripts/sync-gs1.mjs`）并在 changelog 记一行即可解除本阻塞。

### 诚实说明

- **本版没有接线，也没有改任何一轨的声音。** 交付的是"接线被什么挡住、怎么解"的确证结论 + 一条会自我解除的守卫。
- 上述第 4 条事实来自**姊妹仓库**（上游源码），本仓的测试**无法**断言它；本条已在测试注释与本节标注为
  "上游代码事实、非本仓可验证"。前三条事实全部可在本仓复验。
- 我**没有**实测"用 `setTimeout` 抢在临响前发消息"的实际抖动分布——那需要一套新的实时抖动测量。
  所以"晚一个量子加抖动"是**从代码结构推出的量级估计**，不是实测值；要把它变成数字，得先做 E7
  （实时时序抖动测量），这是接线前的第二项前置实验。
- 因此 Phase 2 的正确下一步顺序是：**① 上游加定时 note 消息 → ② E7 实测实时时序抖动 → ③ 接线 + parity 测试**，
  而不是先接线再解释为什么导出和播放对不齐。

## 5.10 E7 实测（v2.0.9）：消息投递型 note 的实时时序误差是**可测量**的

§5.9 说"在调度时刻发消息会早最多 200 ms、临响再发则晚一个量子加抖动"——当时第 3 条是**从代码结构推出的量级估计**，
不是实测值。本节把它变成数字。

### 方法（可复验）

- **onset 必须由音频线程打时间戳**：主线程 `requestAnimationFrame` 轮询的分辨率约 16 ms，而我们要测的效应就是这个量级。
  为此新增 `public/gs1OnsetProbe.js`——一个极小的 AudioWorklet 处理器，被 `arm` 后在音频线程上用 `currentFrame`
  报告第一个越过阈值的样本的**绝对帧号**。分辨率为**一个 128 帧块（2.90 ms）**，并且这个界**随每个数字一起报告**，
  不四舍五入掉。
- `scripts/measure_gs1_jitter.mjs`：真实浏览器（Playwright + headless Chromium）+ Vite dev server，加载 vendored GS-1，
  以 8 复音上限建实例，把输出接进探针（末端 gain=0，静音但探针仍看得到信号）。两种宿主策略各测 40 次，
  每次之间留 420 ms 让上个音的尾巴完全衰减：
  - **schedule-ahead**：一决定就发消息（引擎 200 ms 前瞻的自然做法）；
  - **last-moment**：用 `setTimeout` 在目标时刻前 20 ms 发消息（无定时协议时唯一能"瞄准未来"的办法）。

### 结果（40 次/策略，idle 页，headless Chromium，44.1 kHz）

| 策略 | 检出 | 误差中位数 | p90 \|误差\| | 极差 | 范围 |
|---|---|---|---|---|---|
| **schedule-ahead** | 40/40 | **−198.6 ms**（早） | 199.1 ms | 11.8 ms | −199.1 … −187.3 ms |
| **last-moment**（lead 20 ms） | 40/40 | −19.6 ms | 20.1 ms | **11.8 ms** | −20.1 … −8.3 ms |

两条结论：

1. **schedule-ahead 与前瞻量级完全吻合**：中位数 −198.6 ms 对引擎的 200 ms 前瞻——"一决定就发"等于每个音早 200 ms 发声，
   在一个 16 分音符只有 94–125 ms 的音序器里是灾难性的，而不是"略有偏差"。
2. **last-moment 可以把误差"调中"，但不能变准**：40 次里绝大多数落在 lead 的 1 ms 内（消息投递本身极快），
   但有一条尾巴——一次主线程定时器晚了约 11 ms。**极差 11.8 ms，而 onset 分辨率只有 2.90 ms**，
   即分散度实测上就是"非采样精确"。而这还是在**空闲页面**上测的：那 200 ms 前瞻存在的理由正是
   "拖动 UI 时主线程会卡"，所以真实使用下的尾巴只会更长，本次数字应视为**下界**。

### 门禁与结论

- `scripts/check_gs1_jitter.mjs`（已接入慢轨）：检查是完整运行、**两种策略都在**（只报对自己有利的那一种是显而易见的作弊）、
  **每一次都真的要到了 onset**（漏检会静默地砍掉最差的尾巴）、schedule-ahead 的中位数确实≈前瞻（§5.9 的机制仍成立）、
  last-moment 的极差在 60 ms 内（这是**定时器健康度**检查，不是产品阈值，5× 余量给共享 CI 机器），
  以及——**这条最重要**——last-moment 的极差**大于** onset 分辨率，即"这个变通办法实测上不是采样精确的"。
- 于是 Phase 2 的顺序被实测钉住：**上游加定时 note 消息 → （已完成：E7）→ 接线 + parity 测试**。
  在协议能表达"第 N 帧发声"之前，把 `chords`/`lead` 接到 GS-1 就意味着这两个角色的时序比现在差
  （现在它们是采样精确的），而且播放与导出对不齐。这不是音色判断，是**可测量的时序退化**。

### 诚实说明

- 数字来自**一台 8 核桌面 + headless Chromium 的空闲页面**，不是手机，也不是 UI 繁忙时的状态；
  如上所述应视为**下界**。"主线程繁忙时尾巴有多长"需要一个**在负载下**的专门测量（可在同一脚本里加 `--load` 模式）。
- onset 探针的分辨率是一个 128 帧块，所以**小于 2.9 ms 的差异测不出来**；本节所有"晚/早"的数字都带这个界。
- 探针阈值固定为 0.01（两次连续采样确认），对本次使用的快起音短音足够；换成慢起音 pad 需要重新标定阈值，
  否则 onset 会被判晚。这一点写在探针文件里，没有偷偷假设。

## 5.11 P5 状态校正（记账，2026-09-16）

为了让"哪些做完了"这件事在文档里没有歧义，这里明确校正一次 §6 排期表的完成状态——
此前的 changelog 在描述 P5 时把重点放在 E-10/E-13/E-15 上，容易让人以为 P5 整行已完成。

| 阶段 | 计划内容 | 实际状态 |
|---|---|---|
| P1 | E-01…E-08 + V-01 + 音色基线 | ✅ 全部完成（音色基线 V-10 于 v2.0.5 补齐） |
| P2 | E-09 / E-12 / E-17 | ✅ 完成（v2.0.2） |
| P3 | genreFx + 引擎接线 + R10 | ✅ 完成（v2.0.2） |
| P4 | 逐曲风创作性默认值 + 全量听感复核 + 响度重配平 | ✅ 完成（v2.0.5：逐曲风插入 + V-10 基线 + 响度重配平） |
| P5 | **E-10 / E-11 / E-13 / E-14** + C-03 | ✅ **完成（v2.0.11）**：E-10（逐轨插入链）✅ v2.0.2、E-13（力度→音色）✅ v2.0.2、C-03（按角色默认值）✅ v2.0.2、额外完成 E-15（打击乐模型库）✅；**E-11（鼓组/音乐双总线 + 胶水压缩）✅ v2.0.10（含并联鼓组压缩）**、**E-14（逐预设滤波器包络 + 谐振增益补偿 + 可选 24 dB）✅ v2.0.11** |
| P6 | 定点接入 chords/lead + vendor 管线 | ⚠️ **vendor 管线与门禁 ✅（v2.0.2）；Phase 0 实测 ✅（v2.0.6）；署名合规 ✅ + 路由表 ✅（v2.0.7）；接线本身被上游协议阻塞**（§5.9 已确证 + §5.10 已量化）。接线**不依赖本仓任何未完成项**，只等上游的定时 note 消息 |

**P5 至此全部交付**（E-10/E-11/E-13/E-14/E-15/C-03）。**唯一剩余的、不依赖上游的工作已不存在**；P6 的接线仍等上游协议（§5.9）。
P6 的接线则是一个**外部依赖**：它需要上游在 `worklet-processor.js` 里加入按帧排队的 note 消息（提案见 §5.9）。

## 4.15 E-11 分组总线与胶水压缩（v2.0.10）

**缺陷**：每一轨都**直接**汇入母带推子，没有任何东西把鼓组粘在一起，也没有东西阻止垫子、贝斯、旋律各占一个峰值。
全项目唯一的一级动态处理是总线上那个真峰值限幅器——一个安全装置被迫干混音的活。

### 实现（`src/audio/masterGraph.ts` + `src/audio/trackBuses.ts`）

```
轨 → [insert → gain → polarity → panner] ─┬─ 鼓组总线(glue 3:1 / 12 ms)─┬─┐
                                          │   └ 并联(8:1, blend 0.22)─┘ │
                                          └─ 音乐总线(glue 2:1 / 30 ms)──┤
送出返回(混响/延迟) ──────────────────────────────────────────────────────┤
节拍器 ───────────────────────────────────────────────────────────────────┤
                                                                          └→ 推子 → FX 机架 → 响度 trim → 真峰值限幅器
```

- **两条总线都是"胶水"而不是限制器**：鼓组 3:1 / 12 ms 起攻（**慢起攻是刻意的**——快起攻会把鼓组最该保留的瞬态压平），音乐 2:1 / 30 ms。
  代码里有测试断言"比率低、起攻慢、音乐比鼓更温和"，以及"总线不得自称天花板"。
- **鼓组另有并联路径**（阈值 −34、8:1、blend 0.22）：用被压扁的信号给鼓组增加密度而不牺牲起攻。
- **角色→总线的判定只有一处**（`trackBuses.ts`），两个引擎都调它；测试断言**实时引擎的三条 strip 路径全部经由总线**、
  导出器不再有 `tPan.connect(masterGain)`、并且**节拍器不进总线**（它是监听辅助，像控制室的 talkback）。
- 送出返回**不经过总线**，直接进推子——这正是真实调音台对 FX 返回的做法。

### 电平后果：重测 + 重配平（硬规则）

- **响度**：重测 159 曲风（迭代求解），**trim 后 p90−p10 0.35 dB**（门禁 1.5）、全距 **3.05 dB**（门禁 4）、clamp **0/159**、
  采样峰值超 0 dBFS **0/159**、**最差真峰值 −1.105 dBTP（0/159 超 −1.0）**。目标电平 −15.575 LUFS。
- **顺带发现并修掉一个真实缺陷**：总线落地后同一次测量里最差真峰值从 −1.027 变成 **−0.95 dBTP（1/159 超承诺）**——
  鼓组并联路径让限幅器前的波形更密、瞬态更多，检测器的低读从 0.12 dB 涨到 **0.20 dB**。
  修法是把 `MASTER_LIMITER_DETECTOR_MARGIN_DB` 从 0.15 提到 **0.30**（内部目标 −1.30 dBTP），
  依据是这次测量加 0.1 dB 余量，不是口味。改完重测：最差 −1.105 dBTP，0/159 超标。
  **一次改动动了限幅器，就必须把响度与音色两份基线一起重录**——两份都已重录。
- **音色**：重测后 **159/159 形状互异**，最近一对 `alternative-rock ↔ math-rock` **0.3599 dB**（地板 0.25）。
  诚实备注：平均对距从 3.49 降到 **3.22 dB**——胶水压缩的本意就是让全库**更凝聚**，代价就是**更相似**；
  仍在门禁内，但余量从 1.8× 收到 **1.44×**，这是"凝聚 vs 可辨识"的直接体现，记录下来而不是藏起来。

### 诚实说明

- 总线参数（阈值/比率/起攻释放/blend）是**按混音常识与代码语义取的**，没有做听感 AB；它们是"合理起点"而不是"调好的终点"。
- 并联鼓组路径的 blend 0.22 是**保守猜测**：它能增加密度，但"多少最好"需要听感判断，本仓库无法测量。
- `microhouse` 等 15 个曲风在 5 轮迭代后仍未收敛到内部 ±0.2 dB（最差 2.85 dB，偏轻），都在门禁口径内，已记入报告的 `trimConvergence.stillOutside`。

## 4.16 E-14 逐预设滤波器包络 + 谐振增益补偿 + 可选 24 dB（v2.0.11）

**缺陷**：滤波器包络是**硬编码**的 `cutoff · 2.5` 扫描，且与放大器 ADSR 死绑——于是垫子像拨弦一样"bloom"，303 无法"咬"。
另外没有任何东西补偿"谐振双二阶滤波器在 Q 升高时峰值增益也升高"这件事：**把谐振拧大，听到的主要是"更响"**，这是错误的控制映射。

### 三项交付

1. **逐预设包络**：`filterEnvOctaves`（深度，`0` = 不扫描）、`filterEnvAttackScale` / `filterEnvDecayScale`（独立于放大器时序）。
   **不写这些字段的预设渲染结果逐比特不变**——这一点由测试钉死，因为全库的响度与音色基线描述的是那 159 个曲风，
   一个"全库预设都变了"的改动会静默作废它们。
2. **谐振增益补偿**：`resonanceCompensationGainDb(Q, perQ)`——Q 每高于 1 一个单位扣 0.6 dB，上限 6 dB，
   作为**滤波器前**的增益（峰值是随 Q 升的部分，因此在进入滤波器前修正；放在滤波器后就只是推子了）。
   0.6 dB/单位是**刻意取部分补偿**（Q 的 dB 值并不精确等于双二阶对宽带素材的作用），过度补偿会让"加谐振"感觉像"减厚度"。
   预设可用 `resonanceCompDbPerQ: 0` 退出。
3. **可选 24 dB**：`filterSlope24` 是**再串一个同样的 12 dB 双二阶**，不是另一种滤波器设计——同一颗滤波器，
   所以实时与导出的 parity 是结构性的，代价恰好是每声部多一个节点。**谐振只留在第二级**（第一级 Q 减半），
   避免两个谐振峰叠加。噪声床也走完整链路。

### 刻意的重新配声（4 个预设）

| 预设 | 改动 | 理由 |
|---|---|---|
| `acidBass` | `filterSlope24` + 深度 2.2 音分（≈4.6×）+ 起攻 0.25× + 衰减 0.45× | 303 是 24 dB 梯形滤波器，其性格就是**快而深的包络回落** |
| `brassSynth` | 起攻 2.4× + 衰减 1.3× | 铜管的"bloom"**就是**滤波器比放大器起攻更慢地打开 |
| `warmPad` | 深度 0.55 音分 + 起攻 2.0× | 垫子不"咬"；浅而慢的开口才让它仍是垫子 |
| `supersaw` | 深度 0.7 音分 | 锯齿墙是**静态亮度**，2.5× 扫描在和 unison 失谐打架 |

### 重测与重配平

- 响度：**trim 后 p90−p10 0.34 dB**（门禁 1.5）、全距 3.13 dB（门禁 4）、clamp **0/159**、削波 **0/159**、
  最差真峰值 **−1.094 dBTP**（0/159 超 −1.0）。目标 −15.641 LUFS。
- 音色：**159/159 形状互异**，最近一对 `grunge ↔ progressive-rock` **0.3535 dB**（地板 0.25），平均对距 3.27 dB。

### 诚实说明

- 补偿系数 0.6 dB/单位与上限 6 dB 是**近似 + 保守**的取舍，不是解析解；"多少最好"需要听感判断。
- 只有 4 个预设置被重新配声；其余 46 个预设**仍用历史 `·2.5` 扫描**——也就是说 E-14 提供的是**能力**，
  而"每个预设都该有自己的包络"这件事只完成了最明显的 4 个。
- `filterSlope24` 只有 `acidBass` 在用，所以"24 dB 在其他音色上是否更好"没有证据。
- 4 个预设的改动**改变了它们的音色与电平**，已通过重测覆盖；但这也意味着 v2.0.11 之前录制的任何
  逐曲风听感结论对新版本不再逐比特成立。

## 5.12 E7 第二轮（v2.0.12）：**主线程繁忙时**的抖动尾巴

§5.10 的结论里有一条自我批评：数字来自**空闲页面**，而 200 ms 前瞻存在的理由正是「拖动 UI 时主线程会卡」，
所以那个 11.8 ms 应视为**下界**。本轮把「下界」变成实测。

测量方式：同一个脚本新增 `last-moment-loaded` 策略——在等待目标时刻的循环里**故意阻塞主线程**
（`--load-ms` 毫秒一轮、每 `--load-period` 毫秒一次），其余与 `last-moment` 完全相同。

| 主线程负载 | 空闲时极差 | 加载后极差 | 加载后范围 |
|---|---|---|---|
| 25 ms / 50 ms | 11.6 ms | **13.5 ms** | −20.1 … −6.6 ms |
| 80 ms / 100 ms | 3.9 ms | **12.2 ms** | −20.1 … −7.9 ms |

**结论**：尾巴**确实随负载变长，但在本实验里是有界的（约 12–14 ms 并饱和）**，而不是我上一轮推测的「只会更长」。
原因也清楚：抖动循环在每轮之间 `await` 让出，音符的定时器总能在间隙里触发，因此延迟由「一次阻塞有多长」决定，
而不是累积。**但这仍然约为 onset 分辨率（2.90 ms）的 4–5 倍**，与"采样精确"是类别差异，不是程度差异。

**这个实验不能证明什么**：它只模拟了**协作式**的周期性阻塞。真实的长时间停顿（一次大布局、一次 GC）
可能落在同一个 burst 内且更长，本实验无法给出那种情况的上界。所以正确的读法是：
**已知尾巴在有界负载下约 12–14 ms；未知的是非协作式长停顿下的最坏情况。**
E7 的证据门禁现在**要求三种策略都在**（只报空闲那一种会低估尾巴），并继续断言「加载后极差 > onset 分辨率」。

## 5.13 阻塞点已解除：上游落地定时 note 事件（v2.0.13）

§5.9 的提案由用户在姊妹仓库执行授权后**在上游实现并提交**（GS-1 **v2.1.5 @ `e073df5`**，ABI 仍为 8，**未改 ABI**）：

- `worklet-processor.js` 新增 `noteAt` / `noteOnAt` / `noteOffAt`，携带**绝对帧号** `atFrame`；
  处理器维护一个按帧排序、**上限 1024 条**的队列，并在 `process()` 里**按事件切分渲染块**
  （`gs_process(chunk)` 逐段推进），因此事件落在它指定的那一帧，而不是下一个 128 帧边界。
- 队列在 `panic` / `allNotesOff` 时清空（panic 的语义就是"立刻安静"）；非法 `atFrame` 被忽略而不是当作 0；
  静音期间 `renderedFrames` 仍然推进，否则静音结束后所有事件都会整体迟到。
- **实测的契约（写进上游测试）**：声部起点恒为 `atFrame + 128`（一个渲染量子的**常数**延迟），
  **与事件落在块内哪个位置无关**（`atFrame` = 0/100/128/200/384/500 全部如此）；块内位置被逐样本保留。
  该常数由 `ready` 消息的 `scheduledNoteLatencyFrames` **报告给宿主**，宿主据此提前寻址即可与采样精确的
  原生声部对齐——而不必把这个数字硬编码在客户端。
- 上游新增 7 条测试（含**"早发/晚发消息产生逐样本相同的输出"**——这正是导出 parity 成立的前提）。

**本仓侧**：`scripts/sync-gs1.mjs --from ../synth` 已单向同步到 `vendor/gs1`（6 个文件重新哈希，22 项契约断言全绿）；
`Gs1Host` 增加 `noteOnAt/noteOffAt` 与 `scheduledNoteLatencyFrames`；`gs1Scheduling.test.ts` 的守卫
**按设计自动翻转**——从"协议必须没有时间字段"变为"协议必须有定时事件对"（它上一轮就是为此写的）。

**顺带修掉一个真实缺陷**：同步脚本的 `pruneToManagedSet` 会把不在清单里的文件删掉，
于是它**静默删除了 `vendor/gs1/THIRD_PARTY_NOTICES.md`**——正是那份用来补上游许可缺口的文件。
现在 `KEEP_FILES` 显式列出我们自己的两份文档，并在注释里说明为什么它们必须存活。

## 5.14 P6 Phase 2 接线第一块：调度核心（v2.0.14）

接线分两步落地，这是第一步——**纯调度核心**，不带任何引擎行为改变：

`src/audio/gs1/gs1Tracks.ts`
- **`planGs1Notes(...)`**：把「音高 + 时间（秒） + 时长 + 力度」翻译成**按帧寻址**的
  `noteAt` / `noteOffAt`，并**减去 worklet 报告的 `scheduledNoteLatencyFrames`**——
  这一步就是「在拍上」与「每个音晚 2.7 ms」的全部差别，而且它对实时与离线必须**完全一致**，
  所以它被放在一个纯函数里，由 13 条测试覆盖。
- **`capPlanPolyphony(...)`**：超过 **8 复音**（E3 实测的可持续上限）时**丢最旧的音**——
  丢尾巴听起来是变薄，丢新音听起来是和弦卡住。
- **`isGs1RoutingEnabled()` / `setGs1RoutingEnabled()`**：**默认关闭**。理由写在模块头：
  打开它会**改变绝大多数曲风的听感**（换合成器、换 patch），而这些 patch 从未做过听感对比，
  本仓库也无法测量"更好听"；默认开启等于用一次没人验证过的判断改动 159 个曲风，
  并让音色基线作废。开关是**有意的动作**，代价（重测响度 + 音色 + 重配 trim）写在文档里。
- 全部失败路径都返回 `null`（= 用原生引擎）：未接线的角色、没有 GS-1 patch 的乐器
  （钢琴/西塔琴/长笛/颤音琴这些**有意保留原生**的原声乐器）、非法采样率、空音列表、全零力度。

**尚未做**：两个引擎的接线本身（`AudioEngine` 的 `playChord`/`playLead` 与 `WavExporter` 的
对等路径）。核心已就绪，下一步是把它接进两侧并加「实时 vs 离线逐样本一致」的 parity 测试。

## 5.15 P6 接线完成（v2.0.15，默认关闭）

三块拼齐，代码路径完整：

| 块 | 内容 |
|---|---|
| 上游协议 | GS-1 v2.1.5 `noteAt`/`noteOffAt` 按帧寻址 + `scheduledNoteLatencyFrames`（本仓已同步、门禁 25 项） |
| 调度核心 | `gs1Tracks.ts`：`planGs1Notes`（秒→帧、延迟补偿、顺序确定）+ `capPlanPolyphony`（8 复音） |
| 实时接线 | `Gs1VoicePool` + `AudioEngine.playChord/playLead` 命中即 return（不双重发声） |
| 离线接线 | `WavExporter` 在 `startRendering` 前建/接 host，循环内同步按帧寻址，命中即 return |
| parity | `gs1ExportParity.test.ts`：离线帧 === 共享 planner 帧 === 实时 pool 帧；GS-1 轨道不再产生原生振荡器 |

**仍默认关闭**，这是本版**唯一**的有意留白，理由与代价见 §5.14：开启会改变 159 曲风的
`chords`/`lead` 听感，而这些 patch 从未做过听感 A/B，且开启必须重测响度 + 音色基线并重配 trim。
开启是一行开关（`setGs1RoutingEnabled(true)`），但**不是一个应该由我单方面做的决定**。

## 5.16 GS-1 默认开启后的重测与重配平（v2.0.16）

开启 GS-1 让 159 曲风的 `chords`/`lead` 换了合成器与 patch，按硬规则重测两份基线并重配 trim。

| 门禁 | 结果 |
|---|---|
| 响度 trim 后 p90−p10 | **0.319 dB**（门禁 1.5） |
| 响度全距 | **2.82 dB**（门禁 4） |
| trim clamp / 削波 | **0/159** / **0/159** |
| 最差真峰值 | **−1.094 dBTP**（0/159 超 −1.0） |
| 目标电平 | −15.716 LUFS |
| 音色互异 | **159/159**；最近一对 0.2759 dB（地板 0.25） |

**一个值得记住的代价**：音色最近一对距离从 GS-1 之前的 **0.3535 → 0.2759 dB**，相对地板的余量从
1.41× 收到 **1.10×**。10 个 patch 覆盖 39 个乐器名，让全库在这两个声部上更趋同——这正是
「统一乐器换一致性」的代价。要恢复辨识度，方向是给 patch 加分化，**不是**放宽 0.25 dB 地板。

**流程教训**：第一次重测被我自己的 2 小时 `timeout`
在 trim 迭代轮中途切断，并写出一份不完整报告（p90−p10 1.65、部分曲风 null）。我没有拿它配 trim，
而是还原已提交的报告、把预算提到 4 小时重跑，并让脚本每 5 个曲风 flush `<out>.progress.json`。

## 5.17 音频设置面板与慢轨交接打包器（v2.0.17）

### 5.17.1 面板：把已经存在的能力接出来

用户的要求是「GS-1 默认开启，用户可以手动关（**加到音频设置里**）」。当时的情况是：GS-1 开关只
落在工具栏抽屉，而引擎里另有三个**早已实现、早已持久化、却没有任何 UI** 的设置——想改只能开控制台。

| 设置 | 引擎位置 | 本版之前可达性 |
|---|---|---|
| `latencyCompensationMs` | `AudioEngine`（P4-05 起） | **无 UI** |
| `hearingProtection` | 同上 | **无 UI** |
| `maxVolumeLimit` | 同上 | **无 UI** |
| GS-1 路由 | `gs1Tracks`（P6） | 仅工具栏抽屉快捷开关 |

新增 `src/components/sequencer/AudioSettingsModal.tsx`：四个设置集中一处；工具栏保留齿轮入口与
GS-1 快捷开关。三条设计约束写进组件注释并被测试钉住：

1. **显示引擎的值，不是面板自己的猜测**——每次打开从引擎重读（工具栏/调音台可能刚改过），
   每次写入后**重读**，因此显示的是引擎**夹取后**的结果（上限 0.1–1.0、补偿 ±100 ms）；
2. **听力保护关闭时上限滑条禁用**——那个上限此时真的不生效，可拖就是在骗人；
3. **GS-1 只有一条写入路径**（由视图持有，工具栏与面板共用），两处显示不可能不一致。

**本版没有给引擎加任何能力**，因此测试断言的是接线：引擎值渲染、写入走 setter、夹取后回显、
上限随保护开关禁用、限幅器状态如实显示（worklet 真峰值 / 压缩器降级）、GS-1 只委托不改引擎，
以及用**真实 `AudioEngine`** 跑一遍端到端夹取（上限 0.5 + 总音量 1.0 → 面板必须显示 50%）。
该面板的接线由 `src/test/audioSettings.test.ts` 与 `src/test/settingsModal.test.tsx` 覆盖。

### 5.17.2 慢轨交接打包器（`scripts/slow_pack.mjs`）

`npm run slow` 有两个不适合长跑的性质：**fail-fast**（第一个红门禁直接退出，拿不到「还坏了哪些」）
与**证据只存在于会滚掉的终端**。新脚本把慢轨变成可交接的产物：

| 模式 | 作用 |
|---|---|
| `export` | 打包**当前这棵树**（仓库**没有 remote**，快机器只能靠 tar 带走） |
| `run` | **每个门禁都跑**，逐门禁日志 + 抽关键数字的 `SUMMARY.md` + 精确 git 状态（含未提交 patch）+ 逐文件 SHA-256 + tarball 与 `.sha256` |
| `verify` | 校验回来的包：容器摘要、逐文件哈希、门禁完整性、**能否归属到某个提交**（正向/反向应用分别判定） |
| `list` | 打印计划，无副作用 |

退出码：**0** 全绿 · **3** 有红门禁但包可用 · **4** 打包器自身出错。

`--measure` 用 `--out` 把四个小时级测量写进包里（`artifacts/*.measured.json`），
**已提交的 `scripts/*.baseline.json` 在整个流程中不会被覆盖**；包回来时 `SUMMARY.md` 会给出
「新测量 vs 已提交基线」的逐曲风对比（比较数、最大/平均 |Δ|、差得最远的五个）。这是第二台机器
**唯一**能回答的问题：我们提交的基线是代码的性质，还是那台机器的怪癖。操作细节见 `scripts/slow_pack.mjs`。

**自检抓出的五个真实缺陷**（全部在交付前修掉，这是「打包器自己被测过」的证据）：
`git diff` 被通用 `trim()` 去掉尾换行 → `git apply` 判为 **corrupt patch**、包无法归属；
`SUMMARY.md` 在生成哈希清单后才写 → **唯一被人读的文件恰好是唯一没有哈希担保的文件**；
`--only` 子集包被当成「缺门禁」判为完整性失败（**诚实的子集不是缺陷**，现标 PARTIAL）；
反向可应用的 patch（= 这棵树本就含这份改动，本地核对的**正常**情形）被误判为不可归属；
**`export` 用 `git archive` 打包，快机器上的树里根本没有 `.git`**，于是结果包带着空的 commit sha
回来——同样等于无法归属。现在无 `.git` 时从 `export` 写下的 `COMMIT.txt` 读取提交信息，
并在 MANIFEST/SUMMARY/终端里写明归属来源；两者都没有时打印明确警告。

### 5.17.3 诚实说明（未做 / 未验证）

- `scripts/slow_pack.mjs` **没有单元测试**；其正确性目前由 `--selftest`（一绿一红两条假门禁，
  覆盖失败路径与退出码 3）、一次真实 `run --only docs,redlines`、以及 `verify` 对这两个包的校验证明。
  `verify` 能证明包**没被改动**，**不能**证明包里的门禁判断正确。
- 面板只有 jsdom 级测试，**没有浏览器级断言**；弹窗自身的开关/焦点陷阱/Esc/遮罩由共享的 `Modal`
  组件负责，本仓库的 7 端 E2E 矩阵**没有**音频设置面板的用例。
- 打包器**不会让门禁变快**，它只去掉 fail-fast 与证据丢失；把慢轨搬到快机器仍是人工动作。
- 跨机对比只**报告**差异，**不判断**差异算不算 bug（换浏览器/CPU 本来就会动数字）。
- 既有未验证项未变：移动端未实测、`loudness_live_baseline.json` 未重测、GS-1 请求 24/32 复音
  只出 16 个音的成因仍未查明。

## 5.18 快机器慢轨包读回 + 用户报告的 8 项（v2.0.18）

### 5.18.1 慢轨包读回（用户在本机跑，包校验通过）

包：`slowpack-v2.0.17.tar.gz`（MacBook Pro M2 Max ×12，Node **v26.8.2**，36 个文件哈希全部校验通过）。
**15 个门禁过、1 个红、四个小时级测量全部跑完**。红的那一个是全量测试套件，**167 个失败全部是
存储类测试**，报 `localStorage` 为 undefined。真因不在本仓库代码：较新的 Node 暴露了自己的全局
`localStorage`，而 Vitest 的 jsdom 环境只为「globalThis 上尚不存在」的键安装 jsdom 全局。已修
（`src/test/webStorage.ts`，见 §5.18.2 ①）。

四个小时级测量跨机对比（本机 i7-2635QM 基线 vs M2 Max 实测）：

| 测量 | 跨机差异 | 结论 |
|---|---|---|
| 响度（159 曲风，trim 后） | max \|Δ\| **0.115 dB**，mean 0.002 | 基线是代码的性质 |
| 音色（159 指纹，13 段形状距离） | max **0.14 dB**，mean 0.003；最近一对**完全相同**（future-house ↔ acid-techno 0.2759） | V-10 基线跨机复现 |
| GS-1 负载 16 复音 | p90 0.336 → **0.035**；实时比 0.578 → **0.998** | **「8 复音上限」是本机 CPU 的上限，不是代码的上限** |
| GS-1 时序 | 中位 −198.6 → −198.7 ms | 时序证据复现 |

**这是本次交接最有价值的一条**：E3 得出的 8 复音上限是**硬件相关的**，在现代机器上 16 复音仍有
10 倍余量。上限可以按设备分档，但**需要移动端数据**才能定第二个数字。

### 5.18.2 八项

| # | 报告 | 真因 | 修复 | 证据 |
|---|---|---|---|---|
| ① | 慢轨包两个工具缺陷 | Node 26 下 jsdom 的 `localStorage` 未落地；基线对比在**猜报告结构** | `src/test/webStorage.ts` 显式安装（优先 jsdom、否则 Map 实现，语义完整）；四个报告各写一个显式适配器，无法识别就报不可比；`verify` 会用本仓库基线**重算**一遍 | `webStorage.test.ts` 6 条（含复现 Node 26 形态）；真实数据上四项对比全部给出数字 |
| ② | 检查器应浮动/停靠 + 音色要分类过滤 | 检查器在文档流里、渲染在音序器**之后**；音色是 115 项扁平 `<select>` | 手机=贴底满宽底部抽屉（遮罩/Esc/× 可关）、桌面=左侧全高停靠（不加遮罩，因为要边看边改）；`InstrumentPicker`=搜索+分类标签+GS-1 徽章；`instrumentCategories.ts` 用「规则+例外」并配完整性测试 | 单测 66+6 条；E2E 按 **CSS 断点**判定几何（iPhone/iPad 竖屏=抽屉，桌面/iPad 横屏 1194px=左停靠） |
| ③ | 轨道头试听有延迟或不响 | 试听走 master、播放走轨道通道条，pool 把「目标节点不同」当成「重建 slot」→ 试听与播放互拆 host，形成抖动循环 | host 输出只连一次，目标节点不再作为重建理由；试听改走轨道通道条（预览本就该是「混音里的声音」） | `gs1ChordTiming` 的试听目标断言；pool 用例改写为「目标不同必须保留 host、换乐器才重建」 |
| ④ | 播放时与鼓点不对齐、停止后仍有音 | ①GS-1 和弦时值被**平方**（`chordNoteDuration` 已含 gateScale，GS-1 又乘一次）→ 现场与导出不再对等；②GS-1 声部在 worklet 自己的分配器里，`panic()` 从没碰过它们 | 两条路共用 `chordNoteDuration`/`chordVoiceOnset`；`panic()` 一并 `releaseAll()`（不拆 host，可立即续播） | `gs1ChordTiming.test.ts` 7 条：三种发音法时值必须等于原生、显式证明平方值不同、panic/stop 会静音 |
| ⑤ | 找不到新架构总开关 | 开关只在工具栏**收起的**高级抽屉里；另有三个设置只有实现没有 UI | `SettingsModal` 四类 tab（音频/演奏/界面/关于），入口在**语言切换与版本号之间**；GS-1 一个值多处显示改为订阅调度器真正读取的模块状态 | 单测 13 条 + 同步 4 条；E2E 断言入口**位置顺序**并真的做「面板关掉→工具栏芯片必须变 OFF→复原」 |
| ⑥ | 各曲风和弦长度都一样 | 数据差 10 倍（56 stab/44 sustain/27 comp/23 block/8 strum/1 roll），引擎也照此演奏，但**界面完全看不到**：时值条画的是原始 `gate`（默认全 0.8）且 0.8 时整条隐藏 | StepCell 显示引擎真正使用的 `gate × 1.5 × 发音法`；超过一步改成琥珀色 `step-length-tail`；tooltip 写明倍数 | 单测 5 条（六种发音法显示签名两两不同）；全库分布测试（≥4 种发音法、0.3×–3.0× 不能被压平） |
| ⑦ | 借鉴 synth 的钢琴卷帘并与工作台同一份数据 | — | `rollModel.ts`（纯模型：音符↔step/pitch/gate）+ `PianoRollLane.tsx`（画/移/改长/删/力度/移调/八度/缩放/循环边界） | 模型 14 条 + 组件 8 条；E2E **跨视图**断言：在卷帘里画一个音，**步进网格必须出现该步** |
| ⑧ | 切曲风要问丢弃/保存 + 不再提醒 | `SET_GENRE` 替换 A/B **两个**槽位、静默丢弃 | `unsavedGuard`（**重新生成默认值再比对**，无状态避免脏标记漏置）+ 三选对话框 + 持久化「不再提醒」；同类动作（载入工程/Inspire/导入 MIDI/重置预设）一并纳入；**守卫下沉到 `switchGenre` 这个唯一收口**，因此轨道栏、骰子随机、以及**导航路径**（从探索/搜索/随机曲风进工作台）全都被问到 | 单测 11 条 + 收口 5 条（不 proceed 就什么都不发生、三条入口都过守卫、重复点当前曲风不重置）；**159 曲风 0 误报**、单步改动可检出、保存失败则保留 |

### 5.18.3 关于钢琴卷帘：为什么是「借鉴思路、重写实现」而不是移植

调研了姊妹项目 `synth`（MIT）：它的卷帘是 `PianoRoll.tsx`（1545 行）+ `midi/roll.ts`（335）+ 
`midi/selection.ts`（411）+ `state/roll.ts`（626），其中两个纯模块可近乎原样移植，但**数据模型不兼容**：
它是绝对节拍的自由音符（可重叠、可任意起点），本仓库是**每步单音网格**（`steps[i]`、`pitch[i]`、
`gate[i]` 为一步的倍数）。忠实移植约 2200–2800 行，且要把两种模型做双向映射——那等于同时维护两套
真相。因此本版的做法是：移植**代价为零的部分不移植、写 450 行贴合本仓库模型的实现**，并让卷帘直接
编辑工作台那份数据（`COMMIT_PATTERN` 整体提交，一次手势一条撤销）。限制在 UI 上明说而不是隐藏：
音符起点对齐网格、音长以「步」为单位、每轨单音。

**排查同类场景时发现的第二件事**：导航路径（`useGenreSwitching` 的外部同步 effect）此前
**只**做 `commit({ type: "SET_GENRE" })`——既不询问，**也不应用该曲风的鼓组与 FX 默认值**，于是
从探索页进工作台会得到「新曲风的 pattern + 上一个曲风的鼓组和机架」。现在这条路径与其它入口共用
`performSwitch`，行为一致；代价是取消切换后 App 的 `selectedGenre` 与 store 的 `currentGenre` 会
不一致（轨道栏高亮跟随 store），这一点写在这里而不是藏起来：下一次导航会重新询问。

### 5.18.5 慢轨结果：快机器上 16/16 全绿（v2.0.18）

包 `slowpack-v2.0.18-final.tar.gz`（MacBook Pro M2 Max ×12，**Node v26.8.2**，提交 `f6ef0d9`），
`verify` 判 **INTEGRITY OK**（24 个文件哈希全对，attribution = `COMMIT.txt`）。

| 门禁 | 结果 | 说明 |
|---|---|---|
| typecheck / lint / data-lint / genre-audit / docs | ✅ | |
| **suite** | ✅ | **120 文件 / 1424 用例全过**（v2.0.17 时是 167 个存储类失败、第二次是 120 文件全部无法 collect） |
| build / budget / gs1-contract | ✅ | GS-1 契约 25 项 |
| **e2e** | ✅ | **7 端全部通过**（Chromium/Firefox/WebKit + iPhone 14 竖横 + iPad Pro 11 竖横） |
| perf | ✅ | 真实浏览器性能门禁 |
| **redlines** | ✅ | **23/23**（此前因为导出树没有 `.git` 而红） |
| 四个证据门禁 | ✅ | 响度 spread / 音色 spread / GS-1 负载 / GS-1 时序 |

**这意味着 §5.18.2 ① 的两个工具缺陷在当初出问题的那台机器上被验证修好了**：套件不但能 collect，
而且 1424 条全过；`redlines` 那条「工具自相矛盾」（让用户解到 git 检出之外，却要求 `git ls-files`）
也修好并复验。

本次**未带 `--measure`**，所以没有新的跨机测量，§5.18.1 的 v2.0.17 跨机对比仍然有效。
该提交包含 v2.0.18 发布、一个应用跟进（⑧ 的守卫下沉到 `switchGenre`，导航路径也应用鼓组/FX）
与工具/测试基建修复（`vitest.config.ts` 的 `setupFiles` 绝对路径、`slow_pack.mjs` 加固）；
这之后 `src/` 无改动。

### 5.18.4 诚实说明

- ③④⑥ 的修复在**无头浏览器里可验证的是「引擎被要求演奏什么」**（帧、时值、目标节点、静音调用），
  **不是听感**。「听起来对齐了/不响了」仍需人耳确认。
- ⑦ 是**最小可用版**：无框选、无复制粘贴、无量化菜单、无多轨叠显。姊妹项目那两个纯模块
  （`roll.ts`/`selection.ts`）已确认可移植，是下一版加这些能力的低成本路径。
- ② 的桌面停靠**没有**做「收起成侧边标签」的折叠态：关闭靠 X/Esc/点遮罩，重开靠点轨道头或工具栏。
- ⑤ 的「布局默认值」写入的是**下次启动**的偏好（本次会话仍以工作台里的开关为准），界面上写明了。
- 慢轨仍未在本机跑（按约定交给快机器）；本版发布前的门禁证据见 changelog v2.0.18 与提交信息。

## 5.19 v2.0.18 上线后的三项使用反馈（v2.0.19）

线上版用了之后报回来的三件事，全都不是「再加个功能」，而是**已经交付的东西在实际使用里有问题**。

### 5.19.1 ① 电脑端钢琴卷帘只有屏幕 1/3 宽

**根因**：格子宽度是写死的像素。第一版 `ZOOMS = [14, 20, 26, …]` 直接当格子宽度用，于是音符网格
永远等于 `步数 × 26px`——16 步 416px，在 1440px 屏幕上正好约三分之一，抽屉剩下的大片区域是空的。

**修法**：缩放改成**相对容器宽度的倍数**，容器宽度用 `ResizeObserver` 量；默认 1× 即铺满，
缩放按钮在 0.5×–2× 之间放大缩小，格子宽下限 10px。同时补上用户点名的两个状态：
**全屏**（`fixed inset-0` + 安全区内边距，Esc 先退全屏再关面板）与**收起**（只留工具栏：
轨选择、缩放、移调、关闭都还在，编辑区卸载）；关闭沿用原有 ×。

**证据**：E2E 量几何——网格宽度 ≥ 抽屉宽度 − 60px、全屏盒子覆盖视口、收起后编辑区消失而
工具栏仍在；单测断言默认缩放因子、两个状态属性、以及「收起保留工具栏」。

### 5.19.2 ② 开关 GS-1 / 播放中换音色的卡顿

**三个根因，都在主线程的生命周期上**（不是合成器、不是音频线程）：

| # | 机制 | 后果 | 修法 |
|---|---|---|---|
| 1 | `ensureTrack`/`tryPlay` 把「乐器名不同」当成「重建 slot」 | 换音色时销毁可用 worklet → 接下来几个音**回退原生** → 新 host 编译完再切回；听感是「没反应，过一会儿才变」 | host 与乐器无关，**就地把新 patch 推给同一个 host**；新乐器没有 patch 就只是不用它发声，host 留着 |
| 2 | `setGs1Enabled(false)` 在点击处理里**同步** `releaseAll()` + `dispose()` | 播放中在主线程拆 worklet、释放 WASM = 「像卡住」 | **先静音后释放**：`releaseAll()` 立即，`dispose()` 延后 3 秒；期间切回来**取消销毁** |
| 3 | `setPattern` 每次提交都重推 8 条插入链 | 每切一步/换一次音色/拖完一次力度都在做重复工作 | 只重推**变了**的轨；`resolveTrackInsertForGenre` 按「曲风\|角色」记忆化；新增诊断计数供断言 |

**证据（同一台机器、同一脚本、同一条件）**：

| 交互 | 修复前 | 修复后 |
|---|---|---|
| GS-1 关 | 119.5 ms | **38.8 ms** |
| GS-1 开 | 71.5 ms | **23.9 ms** |
| 换音色（4 次） | 81 / 160 / 215 / 108 ms | **89 / 81 / 63 / 59 ms** |
| 切一步 | 59.6 ms | **45.1 ms** |
| long task（>50ms 阻塞） | 0 | 0 |

单测断言的是**不再做的工作**：换音色不重建 host（`createHost` 仍只调用一次）且一定推新 patch、
无 patch 的乐器仍保留 host、关闭时 `releaseAll` 立即而 `dispose` 延后且 3 秒内切回来会取消、
只重推变化的插入链（改一轨 = 1 次而不是 8 次）。

**诚实说明**：**开发机上没有复现出用户描述的那种卡顿**（前后 long task 都是 0），所以这次修的是
**会产生该卡顿的机制**，而不是「我看到了同一个现象」。为此新增
`scripts/measure_interaction_latency.mjs`（`npm run probe:latency`）：真实浏览器里量
**点击→DOM 反映变化**的延迟与期间的 long task，可以直接对着线上地址跑
（`--url https://silent-river-9229.gradetwo.workers.dev`）在出问题的那台机器上取证。
它本身也踩过一个坑：第一版把固定 `setTimeout` 当作 settle，于是把一个几毫秒的状态翻转量成了
8 秒——现在等的是可观测状态。

### 5.19.3 ③ 轨道检查器太长

改成三个 tab（音色 / 混音 / 效果），并按「切换要即时、状态不能丢」实现：三个分组**始终挂载**，
用 `hidden` 属性切可见性，所以切 tab 不重新挂载（滑条位置、音色搜索关键词、拖动中的状态都还在）。
**M/S 移到头部**：静音/独奏随时要按，不该藏在某个 tab 后面（E2E 断言它们不在任何 `[hidden]`
祖先里）。标签复用已有的 `track_inspector_section_*` 文案。

### 5.19.3b 线上实测（v2.0.19 部署后）

| 检查（对 https://silent-river-9229.gradetwo.workers.dev） | 结果 |
|---|---|
| `/version.json` | **2.0.19**，changelogCount 83 |
| `/sw.js` 缓存版本 | **groove-v2.0.19** |
| 卷帘填充 | 抽屉 951px / 网格 899px，差的正是 52px 的音高标尺栏（此前固定 416px ≈ 44%） |
| 全屏 | 1440×900，等于视口；Esc 退出全屏而不关面板 |
| 收起 | 编辑区卸载、工具栏保留 |
| 检查器 | 三个 tab、同时只有一个分组可见、M/S 不被任何 `[hidden]` 祖先隐藏 |
| GS-1 开关 | true → false 正常翻转；**无页面错误** |

**线上交互延迟（本机经公网，headless Chromium）**：GS-1 关 110ms / 开 48.5ms、换音色
149–231ms、切一步 154ms，baseline（播放中无输入）出现 **2 个 long task（125ms）**。
这里的数字**高于**本机安静时的 38.8/23.9 与 59–89ms，原因在路径上：线上首次用 GS-1 需要
**经公网取回并编译 WASM**，而 baseline 那两个 long task 是资源加载，与开关本身无关。
因此线上数字**不能**与本地安静时的数字直接比较（也正是 §6.1 记的那条规则）；
真正要看的是**你自己那台机器**上的读数：`npm run probe:latency -- --url <线上地址>`。

### 5.19.4 诚实说明

- ② 的三条修复**都不是靠听感确认的**：单测断言「不再做的工作」，浏览器量几何与 long task；
  「听起来不卡了」需要在你那台机器上确认。
- 本机测的是**点击到 DOM 变化**，不是音频故障（爆音/丢步需要音频线程侧测量，本版没做）。
- 卷帘的全屏与收起状态**不持久化**（一次会话内保持）；检查器**不记忆**上次的 tab（每次回到音色）。
- GS-1 关闭后的 3 秒宽限期是取舍：切回来免费，代价是关掉后最多 3 秒才释放内存。

## 5.20 播放中切曲风：老/新曲风来回交换与显示闪烁（v2.0.20）

**用户报告**：播放中切曲风，第一次有时成功有时失败，第二三次很容易失败，**新老曲风都在闪**，
声音也不正常；在 **Safari** 上表现为两个曲风不停交换。

### 5.20.1 根因（浏览器内实测，不是读代码猜的）

`useGenreSwitching` 的「外部曲风同步」effect 把 **每次渲染都会新建的回调**放进了依赖数组：
`performSwitch` 与 `requestGenreGuard`。而 `performSwitch` 闭包里的 `onSelectGenre` 是 App 传的
**内联箭头**（`onSelectGenre={(g) => handleSelectGenre(g, "studio")}`），App 每次重渲染都是新函数。

于是一次点击变成闭环：

```
切换 → onSelectGenre → navigate → App 重渲染 → 新回调身份 → effect 再跑 → 再切一次 → …
```

浏览器实测（transport 播放中，连续点三个曲风）：

| 点击 | 曲风 | `pushState` 次数 | 步进网格签名翻转 | 出现过的不同 pattern |
|---|---|---|---|---|
| 1 | EDM Trap | **5** | 1 | 2 |
| 2 | UK Drill | **11** | **8** | 3 |
| 3 | Future Bass | **13** | **9** | 2 |

每个来回都会执行 `SET_GENRE` + `engine.setPattern(..., resetStates=true)` + 重套该曲风的**鼓组与
FX 默认值**，所以不只是画面闪，声音也乱。Chromium 上就能复现（我用 Chromium 定位的），Safari 上
路由/状态落点不同，表现为「不停交换」。

### 5.20.2 修法（两层）

1. **同步 effect 改成边沿触发、完全不看回调身份**：`performSwitch`/guard 通过 ref 读取，依赖只剩
   「请求的曲风」与 store 的当前曲风，并记住「这次请求已同步」，所以同一请求只落一次。
2. **App 侧稳定引用**：`onSelectGenre`（studio 与 detail 两个去向）改为 `useCallback`，从源头
   消掉这类抖动。

**修复后实测**（同一套测量、双引擎）：

| 引擎 | 每次点击导航 | 每次点击 pattern 翻转 |
|---|---|---|
| Chromium | **1** | **1** |
| WebKit | **1** | **1** |

### 5.20.3 为什么 7 端矩阵没抓到，以及补上的检查

矩阵从未**在播放中切换曲风**——它覆盖了视图渲染、控制台、调音台、设置面板、检查器、卷帘，
唯独漏了这条路径。新检查用**应用自己的活动量**作判据（`pushState` 次数 + 网格签名翻转次数），
**先打印后断言**（运行被中断也留下数字）。

这个检查自己踩了两个坑，都写进了注释：
- **点击落空**：rail 在之前的步骤里已被滚出视口，WebKit 上 `force: true` 的坐标点击什么都没发生
  → 改用 `clickVerified` 做投递验证；
- **空转通过**：第一版 0 导航 0 翻转却判绿（「没判」被当成「通过」）→ 现在「点击后什么都没变」
  直接判失败。

### 5.20.4 一个会造成「切换失败」错觉的真实交互

若切换前编辑过 pattern，守卫会先弹「有未保存的修改」，**此时不会切换**——用户感觉「点了没反应」。
矩阵里这个对话框让新检查连续两次空转。记在这里是为了区分两种成因：
**循环**（本次已修：画面来回闪 + 声音乱）与**守卫在问**（画面稳定、弹窗在等回答）。

### 5.20.5b 线上验证（v2.0.20 部署后）

对 https://silent-river-9229.gradetwo.workers.dev 直接跑同一套活动量测量（播放中连续切三次曲风）：

| 引擎 | 第 1 次 | 第 2 次 | 第 3 次 | 页面错误 |
|---|---|---|---|---|
| Chromium | 1 导航 / 1 翻转 | 1 / 1 | 1 / 1 | 无 |
| WebKit | 1 导航 / 1 翻转 | 1 / 1 | 1 / 1 | 无 |

线上 `/version.json` = **2.0.20**（changelogCount 84）。7 端矩阵在本地同一提交上也是每端
`navigations=1 patternFlips=1`。

### 5.20.5 诚实说明

- 根因与修复都由**浏览器内活动量测量**确认（导航/翻转次数、双引擎），不是「看起来好了」；
  但「听起来不再乱」仍需在**真 Safari** 上确认——本机的 WebKit 是 Linux 的 WebKitGTK，不等于 macOS。
- 新检查依赖应用自己的活动量：将来路由若不再用 `pushState`，导航计数会变 0 并（正确地）判失败，
  判据要同步更新。
- 本版未重跑慢轨（约定交给快机器）；本版改动 = 3 个源文件 + 1 个 E2E 检查，
  fast 轨 / 7 端 E2E / redlines / docs / version / budget / 四个证据门禁已全绿。

## 5.21 效果检查器重做（v2.0.21）

### 5.21.1 问题

原效果页把 6 个处理级堆成一列滑条（各自带开关）：看不出**顺序**，也看不出每级在做什么；更别扭的是
EQ 挂在「混音」页、压缩与驱动挂在「效果」页，而它们是**同一条串联插入链**。

### 5.21.2 做法

- **信号链**：页首 `HP → EQ → Comp → Drive`，顺序 = `ChannelStripDsp` 的实际接线顺序。每级有电源
  圆点（真开关）、名称、当前值摘要。点某级切换编辑区；选中的展开，其余**保持挂载**（`hidden`），
  所以切换即时、控件状态不丢。
- **三条真实曲线**（`src/audio/insertCurves.ts`，逐项对齐 `ChannelStripDsp`，不近似）：
  | 曲线 | 依据 | 关键点 |
  |---|---|---|
  | EQ 频响 | 浏览器同一套 RBJ 系数；高通用 `INSERT_HPF_Q`，谐振级用该带 Q | 关闭的级**不参与**（DSP 是摘掉它，不是停在中间值）|
  | 压缩传输 | Web Audio 软拐点公式 | 拐点 = 链路固定的 6 dB（`INSERT_COMP_KNEE_DB`），所以不是用户参数 |
  | 驱动波形 | **整形器自己的查表**（`makeSaturationCurve`）| 画的和听的不可能漂移；含 dry/wet 混合 |
- **可直接拖**：EQ 曲线的四个手柄改频率/增益，拖动期间本地草稿、**松手提交一次**（一次手势一条撤销）。
- **实时增益衰减**：读运行中节点的 `reduction`（不是二次估算），在表组件内部 ~20 Hz 轮询，
  因此不会让工作台整体重渲染。

### 5.21.3 证据

- **18 条纯数学单测**断言传输函数的已知性质（不是快照）：巴特沃斯高通拐点 −3.01 dB、搁架两端到增益、
  谐振级中心到增益且 Q 越大越窄、压缩拐点下单位增益 / 拐点上严格 1/ratio / 跨拐点连续 / 永不提升、
  各级响应可加、频轴对数映射可往返、驱动曲线取自查表且 dry/wet 混合正确。
- **组件测试**：信号链四槽位顺序与摘要、电源圆点改真实参数（EQ 圆点同时开关三带）、按级切换
  （选中可见、其余 hidden 但仍挂载）、曲线路径随参数变化、手柄在有/无启用时区分、增益衰减表
  按传入 getter 显示（−12 dB → 50% 宽度）。
- **E2E（7 端）**：断言链顺序、按级切换、三条曲线存在，并**真的拖手柄 24px 要求数值跟随**
  （实测 mid 增益 `-3 → 5.5`）。

### 5.21.3b 线上验证（v2.0.21 部署后）

对 https://silent-river-9229.gradetwo.workers.dev 直接驱动页面：

| 检查 | 结果 |
|---|---|
| 线上版本 | **2.0.21**（changelogCount 85）|
| 信号链槽位顺序 | `hpf, eq, comp, drive`（= DSP 接线顺序）|
| 拖 EQ 中频手柄 | mid 增益 **−3 → 4.9**，且曲线 `d` 同步改变 |
| 页面错误 | 无 |

本机 7 端矩阵对同一提交同样全绿（各端拖动 `-3 → 4.2…5.6`）。

### 5.21.4 诚实说明

- 曲线是**参数所要求的传输函数**，不是对运行中滤波器的实测响应（浏览器实现同一套公式，但不会逐点相同）。
- 手柄只改频率与增益，**不改 Q**（Q 仍由滑条控制）。
- 本版只做效果页；**钢琴卷帘重做（本目标第二项）尚未开始**，下一轮继续。

## 5.22 钢琴卷帘按 Logic 重做（v2.0.22）

### 5.22.1 做了什么

| 能力 | 说明 |
|---|---|
| **力度泳道** | 每音符一根竖条（高=力度）；拖一根改该音符，若该条属于选区则**整段选区偏移**；音符颜色随力度（暗石板→亮琥珀）|
| **五种工具** | 铅笔（默认）、指针、橡皮、剪刀、框选；按钮 + 键盘 `1`–`5`；铅笔可**涂画**（整笔一次撤销）|
| **框选与成组编辑** | 拖框选中、成组移动（时间+音高）、**⌥ 复制**、Delete、方向键微移、⌘A 全选；**一次手势一次提交** |
| **检视器** | 音高 / 起点 / 时长 / 力度 数值输入，改即提交 |
| **量化与连音** | **量化长度**（吸附到 `自由/1/4/1/8/1/16/1/32`）与**连音**（延到下一个音符起点，封顶引擎的两步上限）|
| **视觉** | 键盘式音高栏 + 调式高亮（根音/调内/调外）、行着色、小节线加重带号、**音符名**（按格子宽度决定）、循环区压暗、右缘改时长拖柄、三档行高 |
| **播放头** | 新增 `playheadBus`（**DOM 总线，不重渲染**），卷帘订阅后移动自己的线与滚动容器；「跟随」默认开 |

### 5.22.2 与 Logic 的差异（刻意，不是遗漏）

1. **默认工具是铅笔**而非指针：这个编辑器的第一动作是往空网格画（重建前也只有这一种行为），
   而 Logic 的钢琴卷帘主要编辑已有片段。
2. **没有「量化起点」**：步进网格的起点本来就是整数步，放一个按了没反应的按钮不如换成
   **量化长度**与**连音**——那是真正会漂移的两个量。
3. **剪刀需要右侧空位**：单声部网格没有地方放重叠音符；切不了时**弹提示说明原因**。
4. **结构性的差距**（不是没做）：音符不能重叠、起点不能落在网格之间、长度是步长倍数，
   也没有 Logic 的折叠/智能量化/片段级操作。

### 5.22.3b 线上验证（v2.0.22 部署后）

对 https://silent-river-9229.gradetwo.workers.dev 直接驱动页面：

| 检查 | 结果 |
|---|---|
| 线上版本 | **2.0.22**（changelogCount 86）|
| 卷帘几何 | 16 步 / 13 行 / 格子 56.19px / 行高 18px，默认工具 `pencil` |
| 力度泳道 | 6 个音符对应 6 根条 |
| 键盘 `5` | `data-tool` → `marquee` |
| 框选 | 矩形出现，选中 3（矩形覆盖 3 个音符中心，正确）|
| ⌘/Ctrl+A | 选中 **6/6** |
| 拖力度条 | **100 → 127** |
| 音阶高亮 | 根音 1 行、调内 6 行、调外 6 行 |
| 页面错误 | 无 |

顺带发现并修掉一个**选择器陷阱**：工具栏的「行高」按钮原本叫 `piano-roll-row-height`，会被
`[data-testid^='piano-roll-row-']`（音高行）一起选中——线上诊断时它表现为「有一行的 data-scale 是
undefined」。已改名为 `piano-roll-row-height-toggle`，让前缀空间干净。

### 5.22.3 证据

- **30 条模型单测** + **18 条组件测试**（见 changelog 列表）。
- **7 端 E2E 真手势**：键盘切工具、拖框必须选中**全部**音符、拖力度条（100 → 127）、
  点连音后音符变宽（39.6 → 44.2px）。
- 过程中测试抓到**两个真问题**：① 铅笔涂画时用（可能尚未更新的）prop 重建草稿，松手会**丢掉第一格**
  → 改为手势自带 `base`；② 「适配宽度」测量的节点被我放进了滚动容器内，会把网格自身宽度反馈回
  计算 → 测量点移回外层可用宽度。

## 5.23 和弦与各轨技巧按曲风真实落地（v2.0.23）

### 5.23.1 问题的性质（先查清楚，再动手）

用户报告：「和弦轨道在钢琴卷帘里看到的是单音，不是和弦」。**根因不是和弦没被合成**——
`chordVoicing` 早就会在播放时按曲风展开 voicing（triad/power/seventh/quartal/extended）——
而是 **数据模型每步只能存一个音高**（`pitch?: (number|null)[]`）。和弦只存在于播放的那一瞬间，
不落进 pattern，所以：

- 钢琴卷帘只能画出单音（它渲染的就是 pattern）；
- 你看不见、也改不了和弦；
- 「音长按曲风不同」「演奏法不同」同样**没有位置可放**。

另外查出一个隐藏的硬约束：`gate` 被**四处各自**夹在 2 步（卷帘模型、卷帘 UI、MIDI/Ableton 导出、
分享链接写入器），而引擎只是 `stepDur * gate`。于是「一个和弦撑一小节」在数据层就不存在。

### 5.23.2 三步地基

| 步 | 改动 | 保证 |
|---|---|---|
| ① | `SequencerTrack.pitches?: (number[]\|null)[]`，`pitch` 保留为**根音** | 旧工程/分享链接/旧读法照旧；没有 `pitches` 的轨道就是单音 |
| ② | 共享 `chordNotesForStep()`：**有存就照存的弹**，没有才自动 voicing；实时与导出都调它 | 「卷帘所见 = 耳朵所听」是结构保证，不是约定 |
| ③ | 卷帘音符标识 `stepIdx` → **(step, midi)** | 和弦可显示、可逐音编辑、可整体拖动/复制 |

顺带把时值上限统一为 `MAX_NOTE_GATE_STEPS = 16`（1/16 下一小节），四处字面量 2.0 全部改用它。

### 5.23.3 规则与内容

- **规则表**（`src/data/genreExpression.ts`）：和弦性质/演奏法/按拍音长/走向小节数/音域/琶音速率 +
  各轨乐句规则（连音/断奏/延音/幽灵音/ratchet）。写法沿用本仓库惯例：
  **6 类别档 + 逐曲风覆盖 + 必填理由**，未知曲风只继承类别档。
- **内容**：**156 条逐曲风覆盖**，八个并行作者按类别编写后由
  `scripts/merge_expression_parts.mjs` 逐条校验（id 存在、理由、数值区间、琶音速率、role/ratchet、
  跨文件重复、progressionId 存在）。校验器当场抓出我编造的两个 id（`trap`/`gospel`）。
- **生成器**（纯函数、幂等）：把「根音 + 和弦落点」展开成真音符。琶音/分解按用户决定写成**真音符**；
  循环轨拿 `trackLength` 在更长走向下复行。
- **两条保护**（都被测试抓出过）：和弦时值以「到下一个和弦的距离」为上限（否则糊在一起）；
  已展开或用户改过的和弦轨原样返回（否则会冲掉用户编辑）。

### 5.23.4 用户两条规矩，由测试守住

1. **没内容的轨道保持空**：作者没写和弦的 **21 个曲风**一根音都不加（第一版生成器把它们填满了）；
   `fx` 等轨道从不被发明。
2. **和弦必须真的是和弦**：柱式/短促/延音类要求 ≥3 音的**纵向**音堆；琶音/分解类是**横向**陈述
   （**32 个曲风**属此类），判据是「≥3 个不同音高」（第一版测试判据用错，冤枉了琶音曲风）。

### 5.23.5 pattern 长度

长度由走向需要决定：4 小节 = 64 步、8 小节 = 128 步；上限相应从 64 提到 **128**（工具栏新增 128 选项，
分享链接上限同步）。全库检查确认长度**确实不唯一**，且每轨长度与 pattern 长度一致。

### 5.23.6 证据

- `genreExpression.test.ts`：**23 条**（长度策略与 3/4、6/8 换算、罗马数字与调内定位、音堆/琶音/分解/
  stab 写法、性质决定堆叠宽度、时值上限、和弦不越过后继、循环轨 trackLength、空轨恒空、乐句规则、
  确定性、幂等、全库规则可用性与理由完整性）。
- `genreChordsLibrary.test.ts`：**跑全部 159 个曲风**（经真实加载路径）——每个有和弦的曲风都产出真和弦
  （纵向或横向）、长度受支持且不唯一、无时值越界、空轨恒空、加载确定。
- `rollModel` 46 条 + 卷帘组件 35 条（和弦可见可改、画在已发声的步上加和弦、橡皮删单音、⌥ 清步、
  只移动一个和弦音、力度泳道每步一根条）。
- **7 端 E2E**：和弦检查（往已发声的步再画一个音 → 出音堆且**步进网格步数不变**）。

### 5.23.7 E2E 自身修掉的三处判据问题

1. marquee 矩形改为**锚定真实音符**（pattern 变长后，固定视口比例的矩形可能一个音都框不到）；
2. 拖动限制在**同一行内**（marquee 按格选择，越一行就会多选）；
3. 连音改用**音符自身的 `data-gate`** 判断（64/128 步时一格约 8px，用像素宽度等于在测缩放级别）。

### 5.23.7b 基线重录结果（发布前硬规矩）

内容改变电平与频谱，因此按规矩**重测并重录两条基线、重配 159 条响度 trim**：

| 指标 | 结果 |
|---|---|
| 重测曲风数 | **159 / 159** |
| 目标（中位 arranged LUFS） | −15.716 |
| 应用 trim 后 spread（p90−p10） | **0.32 dB**（门禁上限 1.5 dB）|
| trim 落点 | 159 条写入 `genreMix.ts`，158 条非零，范围 −5.1 … +9 dB |
| 削波/夹取 | clamp hits **0**；真峰值最差 **−1.09 dBTP**，无一超过 −1 dBTP |
| 未收敛到 ±0.2 dB | 9 个（最差 2.63 dB，microhouse——1 步分解和弦极稀疏，trim 无法再收敛；门禁看的是整体 spread，仍是 0.32 dB）|
| 音色指纹 | **159/159 互不相同**，最近一对 future-house ↔ acid-techno **0.2759 dB**（下限 0.25）|
| 四个证据门禁 | loudness spread / timbre spread / GS-1 load / GS-1 jitter **全部 PASS** |

### 5.23.7c 线上验证（v2.0.23 部署后）

| 检查（对 https://silent-river-9229.gradetwo.workers.dev） | 结果 |
|---|---|
| 线上版本 | **2.0.23**（changelogCount 87）|
| 卷帘轨道选择器 | `Bassline \| Chords / Pad \| Lead Synth` |
| 默认曲风的和弦轨 | **128 步**（8 小节走向）、10 个发声步、**4 个不同音高**、横向陈述（琶音/分解类）|
| `synthwave` 的和弦轨 | **64 步**（4 小节）、**音堆 4 个音** `[81,84,88,91]`（七和弦 voicing）、8 个不同音高 |
| 步进网格 | 同一 pattern：和弦步在网格里仍是**一格**（两个视图共享数据）|
| 页面错误 | 无 |

用户最初的抱怨（「卷帘里看到的是单音」）在线上已经消失：和弦轨既可能以**纵向音堆**呈现（柱式/延音类），
也可能以**横向音高序列**呈现（琶音/分解类），两种都是真数据、可逐音编辑。

### 5.23.8 诚实说明

- 和弦**位置与音域**由规则决定（根音来自作者写的落点与调式），不是逐曲风手写的音符表；
  逐音微调可在卷帘里做，改过后生成器不再覆盖。
- **strum 仍是引擎的起音错开**（和弦音在同一格），因为模型没有子步位置；琶音/分解才是真音符。
- 音长按拍换算依赖 resolution 与拍号（3/4、6/8 已覆盖）。
- 内容改变电平与频谱，必须**重配响度 trim 并重录 loudness/timbre 基线**——这是发布前的硬规矩。
