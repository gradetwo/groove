# 手机版接回 v2 的评估（2026-10-10）

> 本文只写**量得到的东西**，以及**还没量、但知道怎么量**的东西。凡是我没验证的，都标"未验证"。

## 一、那份封存的东西在哪、有多大

| 项 | 读数 | 怎么量的 |
| --- | --- | --- |
| 分支 | **`origin/mobile-preserved`**（HEAD `29e37f6`，2026-10-02） | `git branch -r` |
| 它的 HEAD 与 `dev` 的关系 | **就是 `dev` 的祖先**（`merge-base` = 它自己）：代码是**后来从 dev 删掉的**，不是另一条线 | `git merge-base`、`git diff --stat` 为空 |
| 手机版文件数 | **35 个** | `git ls-tree` + 路径过滤 |
| 体积 | **约 876 KB**（含 5 套手机皮肤 CSS） | `git ls-tree -r -l` 汇总 |
| 在 dev 里还在吗 | **全部不在**（`src/mobile/**`、`Mobile*.tsx`、`locales/mobile.ts` 等一个不剩） | 逐个 `git cat-file -e dev:<path>` |
| 为什么被切掉 | `scripts/test_matrix.js` 自己记着：**2026-10-02 手机/平板目标被移除**，原因是店主 2026-09-30 的指示"与 iphone 有关的各种 CI/CD 都可以先关掉"，此前它在 worker fetch 与 44 px 触控上失败 | 读 `test_matrix.js` 注释 |

结构（都是**手机专用**，与编曲台并列的一套壳）：

```
src/mobile/
  MobileApp.tsx            壳与路由
  screens/                 7 屏：Home / Explore / GenreDetail / Player / Jam / Challenge / More
  MobilePlayerBar.tsx      播放条        MobileGenrePicker.tsx  曲风选择
  MobileModuleTabBar.tsx   模块页签      SkinPicker.tsx         皮肤
  genreArt.ts mobileGenreData.ts mobileModules.ts genreQuery.ts
  mobile.css legacyViews.css
  skins/{minimal,panelSkin,pixel,comic,legacySkin}.css   5 套手机皮肤
  vinyl/*                  黑胶可视化
src/components/MobileTabBar.tsx  MobileMoreSheet.tsx
src/components/sequencer/MobileStudioSheet.tsx  MobileTransportBar.tsx
src/i18n/locales/mobile.ts
```

## 二、接回 v2 的**依赖面**（这是工作量的决定因素）

我把 21 个 `src/mobile/**` 源文件的 import 全抓出来统计，结果**出乎意料地浅**：

| 它依赖的 app 侧模块 | 在今天的 `dev` 里 | 说明 |
| --- | --- | --- |
| `react` / `lucide-react` | ✅ | |
| `i18n/LanguageContext` | ✅ **在** | 手机文案表 `locales/mobile.ts` 要重新挂进 v2 的 i18n |
| `types/genre`、`types/genreIndex` | ✅ **在** | 曲风数据模型没被 v2 推翻 |
| `components/GenreCover`、`hooks/useCoverWarmup` | ✅ **在** | 封面与预热 |
| `data/genreMix`、`data/timeline_stories` | ✅ **在** | 曲风混音与介绍 |
| `hooks/useSkin` | ✅ **在** | 皮肤系统 v2 仍在（`check:skins` 门禁在跑） |
| **v1 的 pattern/sequencer store** | **没有 import** ✅ | ⭐ **最要紧的一条**：手机壳是"**逛曲风 + 播放**"的面，不碰 v2 大改的那套编曲模型 |

**结论**：这不是"重写"，而是"**把一套自洽的壳装回来**"。真正的难点集中在三处（下节），而不是全盘重做。

## 三、难点（按我的判断排序，附怎么先量）

1. **入口与路由的合并方式**（中等，未验证细节）
   封存树里是**单入口**（`index.html` + `src/main.tsx`），说明手机壳当年是**同一应用里按设备切换**，不是第二个构建。`dev` 今天的 `main.tsx`/`App.tsx` 里**没有** `matchMedia`/手机判断（我 grep 过）⇒ 需要决定：
   **A** 同域按 UA/宽度切壳（URL 不变，需处理"手机用户误入桌面版"与 SEO/分享链接）；**B** 独立路由/子路径（`/m`），互不干扰、可直接分享。**我倾向 B**（可分享、可灰度、桌面端零风险）。
2. **皮肤与样式体系的对齐**（中等）
   手机自带 **5 套 CSS 皮肤**（`src/mobile/skins/*.css`）与 `mobile.css`；v2 的皮肤是 token 体系（`check:skins`/`check:skin-roles` 门禁）。要么把手机皮肤改写成 token（工作量在上面那 876 KB 的 CSS 部分），要么让手机壳**独立样式域**、不参与 v2 皮肤门禁（便宜，但要写清"为什么它是例外"）。**未验证**：`mobile.css` 与 v2 的 Tailwind 是否已有类名冲突——需要一次真实的 `build` 才知道。
3. **文案与门禁的重新登记**（小但琐碎）
   `locales/mobile.ts` 要挂进 v2 i18n（`docs:check`、i18n 键覆盖判据会跑）；手机壳相关的脚本（`scripts/diagnose_mobile_*.mjs`、`measure_phone_*.mjs`、`probe_mobile_audition_soak.mjs`）要么一起接回、要么明确弃置并写理由（本项目的台账规矩）。
4. **播放引擎仍要进客户端**（大，且**正是"预生成"要解决的**）
   封存版当年在手机上跑的是**同一套采样/合成引擎**（这正是它踩到 worker fetch 失败与卡顿的原因）。若照旧接回，就要在手机上继续承担：GS-1/SFZ 加载、AudioWorklet、44 px 触控与长列表性能。

## 四、"能用预生成就用预生成"——这条我完全同意，下面是它需要什么

### 现状（读数）

- **导出 MP3 的能力已经有了**：Web 导出菜单里有 `Export MP3 (192 kbps)`（报告实测），MCP 侧 `render_arrangement` 也支持 `format`。
- **但 `public/` 里现在一个预生成音频都没有**（只有 worklet、字体、封面、SFZ 采样、gs1）。也就是说：**预生成是新基础设施**，不是打开开关。
- 已有的"离线渲染"范式可复用：`check:loudness` 就是**在 Node 侧把每个曲风渲一遍**并提交基线（`mcp/exporting.ts` 读的 `BASELINE` 就是它产出的）⇒ **同一条管线加一个 `--mp3` 输出**即可，不必从零建。

### 需要的四件事

| 事 | 具体 | 代价 |
| --- | --- | --- |
| **生成** | 在现有离线渲染管线上加一步：每个曲风（× 若干变体）× 每种需要的速度 ⇒ MP3 192 kbps | 脚本改动小；**机器时间**随"曲风数 × 变体数"线性增长（`check:loudness` 的既有读数可直接外推） |
| **存放** | 产物进 CDN/对象存储（本仓已有 `r2mirror` 的用法可参照），`public/` 里只放**清单**（曲风 → URL + 版本 + 时长 + 响度） | 存储成本低（192 kbps ≈ 1.4 MB/分钟） |
| **新鲜度** | 清单里带**引擎/曲风内容版本**；版本变了就重生成。`check:loudness:fresh` 已经在管"基线是否过期"，**同一套判据可以扩展到音频清单** | 这是**最容易出错的**一环，需要判据钉住 |
| **播放** | 手机端 `<audio>` ＋ `playbackRate`（变速＝变调，就是老式磁带机） | 极简；**但必须诚实标注"变速会变调"**，否则用户以为是 bug |

### 这样做之后，手机端**不再需要**什么（这才是最大收益）

- 不需要在手机上加载 SFZ/采样库、不需要 GS-1/AudioWorklet、不需要在手机上做混音与限幅；
- 手机端只剩：**列表（曲风/封面/文字）＋ 一个 `<audio>` 播放器 ＋ 皮肤** ⇒ 那 35 个文件里"重"的部分（音频链路）几乎可以整段不要，**移植面反而缩小**。
- 曲风对比也因此变成"两个 `<audio>` 交替/对齐播放"（对齐可以用 `currentTime` 直接设，不需要 DSP）。

### 代价与风险（必须摆明）

1. **曲风播放将不再"实时反映当前引擎"**：预生成的是**某个版本**的声音。这与我这几轮在 MCP 上坚持的"响度报告要自称是已提交基线"是**同一类诚实问题** ⇒ 清单里必须写明版本与生成时间。
2. **版权/署名**：把音频**发到线上**与"仓库只存 manifest、不存音频"的既定决定（`sampleManifest.ts` 注释）**方向相反**。若预生成音频里含 CC-BY 采样，必须随包保留署名；这点要在做之前定清（我**不会**替你做这个决定）。
3. **体积/流量**：手机端下载 MP3 是"用带宽换算力"，通常划算；但 192 kbps 全曲在弱网仍明显 ⇒ 建议**分段/短样本**（例如 15–30 秒主题片段）而不是整曲，这与"曲风试听"的用途也更匹配。
4. **变速播放的产物**：`playbackRate` 变调，若要"变速不变调"就得引入客户端时间伸缩（回到重活）⇒ 按你说的"变速播放 mp3 就可以"，我按**磁带机式变速**设计，并在 UI 上写明。

## 五、工作量分级（我的估计，含不确定性）

| 工作包 | 内容 | 我的估计 | 不确定性来源 |
| --- | --- | --- | --- |
| **P0 试装**（1 轮） | 从 `origin/mobile-preserved` 取 35 个文件放进 dev 的一个临时分支，跑 `typecheck` ＋ `build` | **小**，但能产出**精确的报错清单** ⇒ 后面所有估计都应基于它 | 未验证：可能与 v2 有若干类型/入口改动 |
| **P1 入口与路由** | 定 A/B 方案、加 `/m` 路由或设备切换、让桌面端零影响 | 中 | 方案定了就直 |
| **P2 样式与皮肤** | 手机 CSS 与 v2 皮肤的关系（改写 token 或声明独立域） | 中～大（取决于 CSS 的真实体量） | 未验证：876 KB 里 CSS 占多少、有无类名冲突 |
| **P3 文案与门禁** | `locales/mobile.ts` 接入、判据/台账登记、脚本取舍 | 小但琐碎 | 低 |
| **P4 预生成管线** | 离线渲染 → MP3 → 上 CDN → 清单 ＋ 新鲜度判据 | 中 | 机器时间与存储/版权决定 |
| **P5 手机播放器** | `<audio>` ＋ 变速 ＋ 曲风对比 ＋ 封面/文字 | 小～中 | 低 |
| **P6 触控与性能复验** | 44 px 目标、长列表、首屏 | 中 | 低（有现成探针脚本） |

**总体判断**：**不是重写**（依赖面浅、v2 数据模型仍兼容），但也不是"合并分支"（入口/皮肤/文案/预生成四件事都要做）。若 P0 试装的报错清单不吓人，我倾向**先做 P4 预生成**——因为它**同时缩小 P6 和手机端的音频负担**，是这条路上收益最大的一步；反之如果 P0 就爆出大量类型错误，先修壳再谈音频。

## 六、需要你拍板的（我列出来，不替你决定）

1. **路由方案 A（同域切壳）还是 B（`/m` 子路径）**？我推荐 **B**。
2. **预生成音频的粒度**：整曲、还是 15–30 秒主题片段？我推荐**片段**（省流量、更像"试听"）。
3. **预生成音频是否上线**（涉及 CC-BY 署名与"仓库只存 manifest"的既定原则）？这条我必须问你。
4. **手机皮肤**：改写成 v2 token，还是让手机壳独立样式域（并在台账写明理由）？我倾向**独立域**（便宜、风险低）。
5. **先做哪一步**：P0 试装（拿到精确工作量）→ 还是直接先做 P4 预生成？
