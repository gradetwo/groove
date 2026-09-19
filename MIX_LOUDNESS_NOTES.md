# 曲风混音与响度匹配（feat/genre-mix-loudness）实施记录

用户需求：①每个曲风默认的各轨道音量/声相/混音按该曲风特色编排；②不同曲风
切换时总响度尽量一致；③曲风比对视图里响度也差不多。

本文记录实测前提、设计分层、母带链路顺序、响度度量与实测数字，以及明确
**不做**的部分。数字全部来自 `scripts/loudness.baseline.json`（合并
`feat/genre-instrument-curation` 后的 159 曲风全量离线测量）。

## 1. 前提复核（基线为假）

| 事实 | 实测 |
|---|---|
| 曲风数 / 轨道数 | 159 / 1272 |
| 每轨 `volume`、`pan` 的不同取值数 | 各 1 个（kick .90/0、snare .85/0、hihat .70/−.20、percussion .65/+.25、bass .90/0、chords .75/0、lead .80/+.10、fx .60/0） |
| `sendA`/`sendB` 声明数 | 0 / 1272 —— 混响与延迟总线实际是死的 |
| 实际分类 | Electronic 93、Rock/Metal 17、Hip Hop 11、Jazz/Blues 14、Pop/R&B 13、Latin/World 11 |

## 2. 混音数据分层（`src/data/genreMix.ts`）

1. `CATEGORY_MIX_PROFILES`：六个分类的基础混音（Jazz/Blues 立式贝斯最前、
   鼓组退后、FX 近乎不用；Rock/Metal 推底鼓+军鼓、节奏吉他硬左、主音硬右；
   Hip Hop 推底鼓与 808、踩镲拉宽；Electronic 推底鼓/贝斯、踩镲与打击乐拉宽、
   FX 可闻；Latin/World 打击乐 0.92 并拉向左侧；Pop/R&B 主音最响）。
2. `GENRE_MIX[genreId].overrides`：逐曲风偏差。**156/159** 有专属 override，
   逐条注明依据（radar_metrics / sound_design / 轨道乐器 / default_bpm）。
   仅 `2-step-garage`、`acid-house`、`acid-techno` 纯用 Electronic 基础——
   三者的特征（garage 摇摆、303 酸性贝斯推前）已被该基础覆盖。
3. `GENRE_MIX_RESOLVED`：1+2 展平后的每曲风解析值（1272 条中 278 个不同的
   volume/pan 组合，46 个不同 pan 值）。
4. `loudnessTrimDb`：第 4 节实测得到。

取值域：volume 0.2–1.0、pan −0.5–+0.5、sendA/sendB 0–0.38、trim −4.43–+5.53 dB。
kick 与 bass 在所有曲风保持 pan=0（单声道低频是混音决定，不是偷懒）。

唯一入口 `patternFromGenre(genre)` / `applyGenreMixDefaults(pattern, genreId)`，
覆盖 store 初始化、SET_GENRE、RESET_TO_GENRE_DEFAULT、新建工程、切歌、
详情页预览、`useGenreAudition`、听辨挑战、自定义曲风页与比对视图。
`clonePattern` 与 `setPattern` 都不套混音：前者服务槽位复制与 undo（必须保留
用户值），后者每次控制台编辑都会调用（套默认值会覆盖用户编辑）。
`scripts/redlines.mjs` 的 R9a 禁止生产代码把 `.sequencer_pattern` 直接交给
`setPattern`，R9b 校验混音表与曲风库 id 一一对应。

旧数据迁移：`createInitialSequencerState` 恢复 localStorage 会话快照时，
逐轨判断该轨是否仍等于占位元组 `LEGACY_PLACEHOLDER_MIX`（volume/pan 精确相等
且 sendA/sendB 均为 0）：是则按 `GENRE_MIX_RESOLVED` 重播，否则整轨保留用户
保存值。**IndexedDB 工程与 `.groove` 包故意不迁移**：它们是用户主动保存的
成果、混音可能是刻意为之，改写存量工程比迁移每次会话都会被自动重写的临时
快照激进得多。

## 3. 母带链路与听力保护

```
每轨通道条(volume/pan/polarity/sendA/sendB)
  -> masterGain（用户推子，受听力保护钳制，语义不变）
  -> loudnessTrimGain（曲风响度匹配，独立增益级）
  -> masterFxRack -> limiter(DynamicsCompressor) -> 分析器 -> destination
```

微调级放在 limiter **之前**是有意的：limiter 仍是绝对输出上限，需要正补偿的
曲风不会把母带推过阈值；同时它完全独立于 `masterGain`，因此
`getMasterVolume()` / `getEffectiveMasterVolume()` / 控制台推子仍只表示
「用户要的电平」。听力保护的钳制继续只作用于用户推子，两者互不写入。

`setPattern` 末尾按 `pattern.genre_id` 自动套用，未知 id（自定义曲风、导入
pattern、masterclass、比对视图的 `sync_*` composite）一律 0 dB。
`setLoudnessTrimDb(db | null)`：`null` 回到自动（立即按当前 pattern 重推），
数字为显式覆盖（限幅 [−9, +6] dB）。

比对视图的响度匹配按**当前可听集合**计算，而不是进入同步播放时钉死一次：
`applySyncMutesToEngine`（路由矩阵唯一入口，`solo_a` / `solo_b` / 单列
solo / 静音其它列 / 切模式都会再调它）在设置轨道静音的同时重算微调——
恰有一个曲风可听时用该曲风自己的 trim，多个可听时取均值，全部静音时为 0。
否则用户把某一侧 solo 出来对比时，听到的是 composite 均值，最坏相差
`ambient +5.53` 与 `breakcore −4.43` 之差的一半（约 4.98 dB），正好背离
该视图存在的目的。`drums_only` 仍用可听集合均值：只留鼓组时的响度平衡与
整套配器本就不同，残余偏差是预期的，不另建第二张 trim 表。

单曲风试听（两个专用试听按钮）走的是另一个 `AudioEngine` 实例，且开播前
显式 `setLoudnessTrimDb(null)` 清掉覆盖、让引擎按 `genre_id` 自行推导；
「同步 composite 的覆盖值泄漏到下一次单曲风试听」在两条路径上都已被测试
钉死（`CompareViewLoudness.test.tsx`：solo A/B 各自回到本曲风 trim、回到
A+B 恢复均值；单曲风试听先清覆盖）。

离线导出（`WavExporter.renderPatternOffline`）在同样的相对位置插入同一增益，
不传 `loudnessTrimDb` 时同样按 `genre_id` 推导，导出与试听一致。

## 4. 响度度量与实测

度量：**ITU-R BS.1770-4 门控整体响度（LUFS）**，K 加权按标准解析式设计
（44.1 kHz 与 48 kHz 均与标准表 4.6e-15 吻合），400 ms 块 / 75% 重叠，
−70 LUFS 绝对门 + −10 LU 相对门；峰值是**采样峰值**（未做真峰过采样）。
度量脚本把门控算术保持在「无 −0.691 偏移」域，只在报告处加一次偏移。

选 LUFS 而不是 RMS 的理由：门控的意义正是让稀疏曲风不因「音符之间的空白」
被误判为更轻。同一份渲染里，ambient 是 −21.33 LUFS 但 RMS 只有 −18 区间；
若按 RMS 匹配，ambient 需要 +10.6 dB，它每一个音头都会比 death-metal 还响，
音乐上是错的。

测量路径：`scripts/measure_genre_loudness.mjs`。用 **Vite dev server** 起页，
在页面里 `await import("/src/audio/WavExporter.ts")` 等模块后调用
`renderPatternOffline`（3 小节，drumKit 取 `getDefaultDrumKitForGenre`），
响度实现直接用单测覆盖的 `src/test/helpers/loudness.ts`，**不向生产代码加任何
探针/全局变量**。目标 = 全部 159 曲风「已编排混音」实测响度的**中位数**
（−15.80 LUFS），即只做均衡、不移动整体电平。

| 通过 | p10 | p90 | p90−p10 | 全距 | 最轻 | 最响 |
|---|---|---|---|---|---|---|
| 旧占位混音（原始曲风文件） | −18.19 | −13.64 | 4.55 dB | 9.23 dB | ambient −20.75 | breakcore −11.52 |
| 已编排混音，trim=0 | −18.26 | −13.57 | 4.69 dB | 9.96 dB | ambient −21.33 | breakcore −11.37 |
| **已编排混音 + 回填 trim** | **−16.07** | **−15.56** | **0.51 dB** | **1.25 dB** | lofi-hip-hop −16.46 | drift-phonk −15.21 |
| （同一次运行，RMS 视角，仅供参考） | −16.22 | −14.47 | 1.75 dB | 4.75 dB | doom-metal −18.36 | jersey-drill −13.61 |

- 需要补偿的极值：ambient **+5.53 dB**、ambient-dub +3.97、chillwave +3.96；
  breakcore −4.43、chiptune −4.26、synthwave −3.89。
- **clamp 命中 0/159**：[−9, +6] dB 在全量 LUFS 视角下从未生效，因此没有
  因为限幅而无法匹配的曲风。放宽到 ±12 只会让稀疏曲风的音头更响，故不放宽。
- 三个 trim 恰为 0.00：deathstep、moombahton、bachata（正好落在中位数附近）。
- 渲染噪声：6 个代表曲风 ×3 次重复渲染，同曲风内极差 0.00–0.02 dB，因此
  单次渲染（`repeats=1`）即可作为基线。测量全程约 6–8 分钟。
- `--metric=rms` 可切换为按 RMS 推导 trim（同一脚本，报告会记录主度量）；
  提交的基线用 LUFS。

### 与实时路径探针的交叉核对（12 曲风）

实时探针测的是「窗口内母带 RMS」，与本文的「整段 3 小节渲染 RMS」并非同一
窗口，绝对差 −0.03 ～ −3.30 dB（离线整段包含尾部与稀疏段，故普遍更低），
但排序一致：Spearman ρ = **0.755**。

| 曲风 | 旧混音 LUFS | 旧混音 RMS | 已编排 LUFS | trim | trim 后 LUFS | trim 后 RMS | trim 后峰值 |
|---|---|---|---|---|---|---|---|
| chicago-house | −14.31 | −13.34 | −14.10 | −1.70 | −15.62 | −14.64 | +0.51 |
| boom-bap | −18.72 | −17.20 | −19.09 | +3.29 | −16.41 | −14.69 | +1.07 |
| salsa | −17.77 | −17.58 | −17.86 | +2.06 | −15.85 | −15.68 | +0.39 |
| funk | −17.22 | −16.74 | −16.86 | +1.07 | −15.79 | −15.24 | −0.07 |
| detroit-techno | −15.18 | −13.93 | −15.07 | −0.73 | −15.72 | −14.39 | +0.29 |
| trap-rap | −17.44 | −15.87 | −17.26 | +1.47 | −16.13 | −14.28 | +0.47 |
| afrobeat | −17.91 | −17.74 | −18.20 | +2.40 | −15.80 | −15.60 | −0.56 |
| soul | −15.10 | −15.33 | −14.00 | −1.80 | −15.80 | −16.21 | −1.78 |
| delta-blues | −18.16 | −18.27 | −17.68 | +1.89 | −15.80 | −16.00 | +0.03 |
| bebop | −13.10 | −14.42 | −12.79 | −3.01 | −15.73 | −17.10 | −0.96 |
| hard-rock | −17.42 | −17.70 | −16.79 | +0.99 | −15.88 | −16.27 | +0.34 |
| punk-rock | −14.86 | −14.70 | −14.26 | −1.53 | −15.60 | −15.51 | +0.63 |

## 5. 已知取舍与未做

1. **离线渲染不含送出总线**（混响/延迟只在实时引擎里）。因此 trim 是按
   「干信号」匹配的；送出值刻意保守（≤0.38），实时听感的残余差异应略大于
   表中的 0.51 dB。补上离线送出总线是后续项。
2. **离线渲染不含主 FX 机架**（`DEFAULT_FX_STATE` 全 bypass，故默认状态下
   与实时一致；用户一旦开启主 FX，导出同样不含——这是既有缺口，非本次引入）。
3. **峰值是采样峰值，不是真峰**。
4. **trim 后仍有 121/159 曲风的采样峰值 > 0 dBFS**（旧混音 104/159，最差
   riddim +1.63 dBFS）。这是已登记的 N-15（母带 DynamicsCompressor 3 ms
   启动挡不住瞬态）在正补偿下的放大；`encodeAudioBufferToWav` 会在 ±1 处
   硬钳，因此这些曲风导出会削波。真正修法是加砖墙限幅器，不在本次范围。
5. **绝对电平差异**：离线基线用 masterGain 0.85，实时默认推子 0.8 且经主 FX
   机架，故绝对电平约差 0.5 dB；曲风之间的**相对** trim 不受影响。
6. **IndexedDB 工程 / `.groove` 包不迁移**（见第 2 节理由）。
7. 曲风文件的 `instrumentation`/`instrument` 由并行分支负责，本分支不改
   `src/data/genres/**`；合并后重测了一次全量响度并重播 trim。

## 6. 复现与门禁

```bash
node scripts/measure_genre_loudness.mjs                  # 全量 159 曲风，约 6–8 分钟
node scripts/measure_genre_loudness.mjs --limit=8        # 迭代子集（写 partial 文件）
node scripts/measure_genre_loudness.mjs --genres=ambient,death-metal --repeats=3
node scripts/apply_loudness_trims.mjs                    # 把报告里的 trim 写回 genreMix.ts（幂等）
node scripts/apply_loudness_trims.mjs --check            # 只校验两边一致
node scripts/check_loudness_spread.mjs                   # 无浏览器门禁（slow 轨）
```

`check_loudness_spread.mjs` 除了校验报告自身的 p90−p10 ≤ 1.5 dB、全距 ≤ 4 dB，
还会：校验报告与 `genreMix.ts` 的 159 个 trim 一一对应（差值 ≤ 0.01），
在「表里全是 0 而报告非 0」时直接失败（功能假接线特征），并静态断言
`AudioEngine` 的微调级位于 `masterGain` 与 FX 机架之间、`WavExporter` 应用
同一增益、store 走 `patternFromGenre`。失败信息会写明所依据的度量。

---

## 7. 2026-09-16 复测与重配平（v2.0.5 / 音频计划 P4）

### 7.1 为什么必须重测：门禁绿 ≠ 渲染没变

`check_loudness_spread.mjs` 只读**已提交的报告**并核对它与 `genreMix.ts` 是否自洽，
**从不重新渲染**。所以在和弦轨从单音变复音（E-01）、真混响/延迟总线上线（E-09）、
逐曲风母座 FX（P3）与逐轨插入链（P4）陆续落地之后，报告仍然"自洽"、门禁仍然是绿的，
而**实际渲染的响度已经漂移**。重测结果直接证明了这一点：

| 指标 | 已提交基线（旧链路） | 本次实测（当前链路） |
|---|---|---|
| 目标（arranged 中位数） | −20.855 LUFS | **−15.253 LUFS** |
| 直接套用旧 trim 后的 p90−p10 | 0.59 dB（报告值） | **3.14 dB（实测）** |
| 真峰值超 −1 dBTP 的曲风 | 0（报告值） | 6/159（实测，最差 −0.88） |

也就是说：旧报告描述的不是当下的链路。**这是门禁设计的已知盲区**，已写进门禁头部注释；
真正的漂移检测只能靠重跑测量（慢轨）。

### 7.2 顺带查出的两个真实缺陷

**(a) 响度 trim 放错了位置（增益结构错误）。** 旧链路是
`masterGain → loudnessTrimGain → fxRack → limiter`。trim 在 FX 机架**之前**，
而机架里的饱和/降比特是非线性的：一个需要 +7.07 dB 补偿的曲风（dubstep）送到饱和器时
已经热了 7 dB，**实测只涨了 1.74 dB**——补偿被失真吃掉了。这正是「安静且带饱和的曲风
（dubstep / doom-metal / riddim / metalcore）永远追不上目标」而**削减**却几乎精确的原因。
改为 `masterGain → fxRack → loudnessTrimGain → limiter`：trim 成为**最后一个线性级**，
只有真峰值限幅器还能吸收它，而限幅器只对**已经在天花板上的**曲风生效——那些恰好是需要
削减的。附带收益：机架始终看到未 trim 的信号，因此**音色不再依赖于该曲风需要多少响度补偿**，
这也让 V-10 音色基线（在 trim=0 下录制）对每个曲风都如实描述用户听到的声音。

**(b) 限幅器检测器比标准表低读约 0.12 dB。** 限幅器用自己的插值检测器，而验收用的是
`src/test/helpers/loudness.ts` 的 4× 过采样多相真峰值表。两者不一致，实测最差
**−0.88 dBTP**（afrobeat），即**超出了项目承诺的 −1.0 dBTP**。不争论谁更"对"：
新增 `MASTER_LIMITER_DETECTOR_MARGIN_DB = 0.15`，限幅器内部目标取
`−1.0 − 0.15 = −1.15 dBTP`，于是**承诺由测量兑现而非由定义兑现**。代价 0.15 dB 余量。

**(c) 测量脚本自身的两个缺陷（都已修）**：`--genres=` 这种子集运行会**覆盖提交的基线**
（只有 `--limit` 被当成子集）——已改为任何收窄参数都改写到 `loudness.partial.json`；
以及 trim 求解**假设响度对增益是线性的**——BS.1770 的相对门会随电平改变参与门控的块集合，
所以单次 `target − arranged` 不够。现在改为**迭代求解**：每轮只重渲仍然超出 ±0.2 dB 的曲风，
按**实测残差**修正，最多 5 轮；并且遵守「先测量、后决策、只在还有下一轮时才改 trim」，
保证报告里**每个 trim 都有它自己的实测值**（之前有 26 个曲风以「有 trim、无测量」收尾）。

### 7.3 本次结果（159 曲风，3 小节，`repeats=1`）

| 指标 | 旧基线 | 本次 |
|---|---|---|
| 目标（arranged 中位数） | −20.855 LUFS | **−15.253 LUFS** |
| **trim 后 p90−p10** | 0.59 dB | **0.40 dB** |
| trim 后全距 | 3.22 dB | **2.68 dB** |
| trim 前（arranged）p90−p10 | — | 6.07 dB |
| clamp 命中 | 0/159 | **0/159** |
| 采样峰值 > 0 dBFS | 0/159 | **0/159** |
| 最差真峰值 | −1.000 dBTP | **−1.027 dBTP** |
| 真峰值超 −1 dBTP | 0/159 | **0/159** |
| trim 范围 | −9 .. +6（当时上限 +6） | **−7 .. +9** |

- 绝对电平比上一份基线高约 5.7 dB，回到本文第 4 节最初记录的 **−15.80 LUFS** 附近
  （上一份基线是在某个更安静的链路状态下测得的）。**这不是"调响"，是把参考电平拉回
  原始设计点**；跨曲风一致性（本文件真正要保证的东西）从 0.59 → 0.40 dB。
- 迭代 5 轮后仍有 **20 个曲风**落在内部 ±0.2 dB 容差之外，最差 **2.43 dB**（microhouse，
  偏轻）。它们都在门禁口径（p90−p10 ≤ 1.5、全距 ≤ 4）之内，但**没有全部收敛**是事实，
  已作为 `trimConvergence.stillOutside` 写进报告；继续加轮次只是边际收益。
- 限幅器路径实测为 **worklet**（硬前瞻天花板），不是 `DynamicsCompressor` 回退；
  报告新增 `limiter` 字段记录路径、契约天花板与检测器目标，供读者判断真峰值该与谁比。
- 单曲风内重复渲染极差 ≤ 0.0001 dB（timbre 侧）与 0.00–0.02 dB（响度侧），
  故 `repeats=1` 足以作为基线。
