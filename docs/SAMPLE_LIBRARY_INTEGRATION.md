# 音色库的支持、选择与集成 —— 讨论稿

> 起因：业主给出五套免费 SFZ 音色库的调研（Accurate-Salamander ✓ Virtuosity Drums ✓ Karoryfer ✓ VCSL ✓ VSCO 2 CE ✓），并指出"**音色库支持和选择，怎么集成也需要讨论**"。
> 本文把它拆成五个必须各自回答的问题 ✓，每条结论都对着**本仓库已确立的事实** ✓。日期 2026-09-28，基线 v2.34.18。

## 已确立、且直接决定答案的四个事实

| 事实 | 出处 / 数值 | 它禁掉了什么 |
|---|---|---|
| Web 包体预算 | **222.8 / 223 KB**（`check:budget` ✓） | ⭐ **任何音色库都不可能进包体** ✗✓ |
| `.groove` 与分享格式只带 **id** | 第九种 kind 的决定 ✓ | 音色库**不能**是格式的一部分 ✗ |
| 目录（`SAMPLE_CATALOGUE`）**发布为空** ✓ | `src/data/sampleCatalogue.ts` ✓ | 引用不存在的素材 ⇒ **报错**，不是静音 ✓ |
| 封面已经在用 **R2/CDN** ✓、SW 对 `/assets/*` 是**缓存优先** ✓ | `public/sw.js` ✓ | 采样需要**自己的 SW 规则** ✗（否则 GB 级资源会走错分支 ✓） |

## Q1. 字节放在哪？（这是唯一真正重要的决定）

| 方案 | 判断 |
|---|---|
| (a) 进 git 仓库 ✗ | 1.6 GB 钢琴 ✗✗ —— **不可行** ✓ |
| (b) 运行时从**音色库原站**下载 ✗ | 链接会烂 ✓、CORS 不可控 ✓、许可证与署名难保证 ✓ —— **不可靠** ✗ |
| ⭐ **(c) 镜像到项目自己的 R2/CDN** ✓✓ | 项目**已经在为封面这么做** ✓ → 加一个 `samples/` 前缀 ✓ + 仓库里放**清单** ✓ + **按乐器按需下载** ✓✓ |
| ⭐ **(d) 用户自备**（本地文件 / OPFS ✓） ✓ | ⭐ **不需任何托管** ✓，而且是 **CC Sampling Plus 1.0 那类模糊许可证的唯一安全出路** ✓✓ |

⭐ **建议：(c) 作为分发路径 ✓ + (d) 作为逃生门 ✓✓** —— 两者**共用同一个接口** ✓："**把一个 id 解析成字节**" ✓（今天 `SampleAsset.url` 已经是这个形状 ✓✓）。

## Q1b. **歌曲怎么引用一件 SFZ 乐器**（A3 的第二半，决定了就能直接写代码）

⭐ 采纳 **方案 B**：**让目录条目本身可以是一件由 SFZ 定义的资产** ✓✓ —— 于是**歌曲格式与 `.groove` 一行都不用改** ✓，而那正是业主给的约束（"在 groove 内部、加法式" ✓）。

**两个类型决定（必须先定，再写实现 ✓ —— 这是调度器一次通过的同一个做法 ✓）：**

1. **`SampleAsset` 增加一个可选字段** ✓，而不是新增一种 `kind` ✗：
   ```ts
   /** 一件由 SFZ 定义的乐器：一个 URL + 它需要的采样。存在时，`url` 指的是 **SFZ**，而不是单个 WAV。 */
   sfz?: { url: string; };
   ```
   理由 ✓：现有的 `kind: "loop" | "one-shot"` 描述的是**素材的时间形态** ✓，而"由 SFZ 定义"描述的是**它如何被解析** ✓ —— ⭐ 两件事不要挤进同一个字段 ✗✓（这就是本仓库反复吃亏的那类合并 ✓）。

2. **解析器是一个纯函数** ✓，签名固定下来 ✓：
   ```ts
   /** 一个音符 → 该乐器应该播的采样与比率；乐器不覆盖该音符时返回 null + 理由。 */
   function resolveInstrumentNote(
     asset: SampleAsset,      // 带 sfz 的那一条
     sfzText: string,         // 已取到的 SFZ 正文（取字节是 I/O，不属于纯函数 ✓）
     note: number,
     options?: { velocity?: number; nth?: number }
   ): { samplePath: string; ratio: number; rootKey: number; seqPosition: number } | null;
   ```
   它内部**只做两件已受测的事** ✓：`parseSfz` ✓ + `playbackForNote` ✓✓ —— ⭐ **不新增任何算术** ✓（"一个事实只在一处" ✓）。

**五条判据（写代码前就定好 ✓）：**

1. ⭐ **没有 `sfz` 字段的目录条目，行为逐字节不变** ✓✓（目标里那条"无音频轨的歌不变"的同族 ✓）；
2. 一件乐器的某个音符 ⇒ 返回**与 `playbackForNote` 完全相同的** `samplePath` ✓ `ratio` ✓ `rootKey` ✓（**同一处算术** ✓）；
3. 音符不被覆盖 ⇒ **null + 点名音域的理由** ✓（不返回一个"最近的"采样 ✗）；
4. `nth` 递增 ⇒ round-robin **按文件顺序循环** ✓；
5. SFZ 文本取不到 / 解析为空 ⇒ **报错而不是静音** ✓（第九种 kind 一路守的那条 ✓）。

⭐ 这样 A3 的第二半就只剩**机械工作** ✓：加字段 ✓ → 写这个纯函数 ✓ → 五条判据 ✓ → 接进 `createSampleLoader`（它的 `url` 现在指向 SFZ ✓，所以 loader 要知道"先取 SFZ、再取它引用的采样" ✓✓）。

## ⭐ 业主决定（2026-09-28）：**R2 镜像 + 仓库清单 + 用户自备逃生门**

**已定** ✓✓：

1. **字节由项目自己的 R2/CDN 镜像** ✓ —— 加一个 `samples/` 前缀 ✓，按乐器**按需下载** ✓（与封面同一条既有链路 ✓）；
2. **仓库里只放清单** ✓ —— `id` ✓ 乐器名 ✓ **许可证 + 署名文本** ✓ 文件列表 + **哈希** ✓ 体积 ✓ 兼容性字段 ✓；
3. **用户自备是逃生门** ✓ —— 本地文件 / OPFS ✓，**不需要任何托管** ✓，并且是**条款模糊的许可证（如 CC Sampling Plus 1.0）的唯一安全出路** ✓✓（因为"再分发"这件事根本不存在 ✓）。

**下一步的第一件东西因此是清单本身** ✓✓ —— 它的类型与校验在 `src/data/sampleManifest.ts` ✓（含一条来自本节的规则 ✓：**CC BY ⇒ 署名必填** ✓，缺了就是错误 ✓，而不是警告 ✗✓）。

## ⭐ 下载路径：核对结果（2026-09-28，业主给出、并说明"我没有验证过"）

⭐ **那就测** ✓。九条路径**全部返回 200** ✓✓ —— ⚠️ 但 **200 只说明页面存在** ✗，**不说明它还在托管那个文件** ✓。再深一层，得到三条**改变计划**的事实 ✓：

| 核对 | 结果 |
|---|---|
| Accurate-Salamander 页面上**真实存在**的文件名 | ⚠️ **业主列的那个不存在** ✗✓：页面提供的是 **`V5.2f`** ✓、**`V6.1a`** ✓、**`V6.2RC4`** ✓（是 **RC4**，不是 "V6.2beta2" ✗）→ 用哪一个需要**重新确认** ✓ |
| **VCSL** 仓库里的 `.sfz` 文件数 | ⛔ **0** ✓✓（`master` ✓，3.97 GB ✓）→ ⭐ **它不以 SFZ 分发** ✗：是**成堆的 WAV** ✓ → **要用它就得我们自己写 SFZ 映射** ✗✓ |
| **Virtuosity Drums** | ✅ **419 个 `.sfz`** ✓✓（1.2 GB ✓，CC0 ✓）→ **开箱即用** ✓ |
| **SalamanderGrandPiano** | ✅ **1 个 `.sfz`** ✓（731 MB ✓）→ 可用 ✓（这个是 CC BY 那条线 ✓） |

### ⭐ 因此"第一件乐器"的推荐必须改

我原先推荐 **VCSL** ✓，理由是"小 ✓ CC0 ✓ **今天的子集就覆盖** ✓" —— ⭐ **最后那条是错的** ✗✓，而**只有当我去核对它到底带不带 SFZ 时才发现** ✓✓。VCSL 给的是**原始 WAV** ✓，**没有映射** ✗ → 用它意味着**先写一套 SFZ** ✗（那是**内容工作** ✓，不是我们这条链路的验证 ✓）。

**改荐：第一件乐器用 `virtuosity_drums`** ✓✓ —— **419 个现成 SFZ** ✓、**CC0** ✓、而且它**恰好压在我们的子集边界上** ✓（多力度层 ✓ round robin ✓ —— 见 §Q3 ✓，`group`/`off_by` 与多麦克风路由会立刻暴露缺口 ✓✓）。**第二件**再用 **SalamanderGrandPiano** ✓（CC BY ✓ → 顺带把**署名链路**在真实数据上走一遍 ✓✓）。

⭐ **这条改动的价值不在于换了哪个库** ✓，而在于：**一个"看起来合理"的推荐，在核对它到底带不带我们需要的文件之前，就只是一个猜测** ✗✓ —— 而这次核对花了**一次网络请求** ✓。

## Q2. 仓库里放什么？—— ⭐ **放清单，不放音频** ✓

清单每条至少要有：`id` ✓、乐器名 ✓、**许可证 + 署名文本** ✓、文件列表 + **哈希** ✓、**体积** ✓、以及 ⭐ **它需要哪些 SFZ 特性** ✓✓。

最后一项是**从这份调研里直接读出来的需求** ✓：调研自己就写了"部分 Karoryfer 库在 sfizz 中可能需要手动替换 **ARIA 特有功能**" ✗ —— 所以"**兼容性**"必须是**每个音色库一个字段** ✓，而且是**测出来的**（对 sfizz 交叉验证 ✓，A4 那条判据正好干这个 ✓✓），不是猜的 ✗。

## ⭐ Q3b. 真实缺口的**实测**（2026-09-28，对钉住的库真跑一次）

拿真实的 `Programs/01-basic-kit.sfz`（`sfzinstruments/virtuosity_drums` @ `9f04cf9a7345`，76 行 ✓）去量 ✓，结果**推翻了两条我原先的假设** ✗✓：

| 实测 | 我原先以为 |
|---|---|
| ⚠️ **`<region>` 出现 0 次** ✓ | "它会给我一堆 region 让我们解析" ✗ |
| ⭐ 真实原因是 **`#include "keymaps/keymap_basic.sfz"`** ✓✓ | 我一度以为"它用了另一种头形式" ✗✓ |
| opcode 大量是 **CC/曲线驱动** ✓（`set_cc90` ✓ `tune_cc90` ✓ `tune_curvecc90` ✓ `width_cc106` ✓ `off_mode` ✓ `note_polyphony` ✓ `loop_mode` ✓ `group` ✓） | "`lokey`/`hivel`/`seq_length` 这些就够" ✗ |

### 已实现并**对真实库跑过一次**（结果见下 ✓）

`#include` 已实现（`src/audio/sfz/includes.ts` ✓，**5 条判据** ✓：展开 ✓ 嵌套 ✓ **循环报错** ✓ 缺失点名 ✓ **无 include 时逐字符不变** ✓✓），**I/O 注入** ✓ 所以循环/缺失/深度都能在无网络下测 ✓。

**⭐ 然后拿真实库真跑了一次，得到这一轮最有价值的读数** ✓✓：

```
includes=1  problems=6  →  regions=0  →  playable(36/38/42/46)=0
problems: included file "mappings/kickmic_basic.sfz" was not found
          included file "mappings/snaremic_basic.sfz" was not found
          included file "mappings/closemic_perc.sfz" was not found …
```

⭐ **include 链是三级** ✓✓：`01-basic-kit.sfz` → `keymaps/keymap_basic.sfz` → **`mappings/*.sfz`** ✓ —— 我只取了两级 ✗，于是展开器**逐个点名**了缺什么 ✓✓。

**所以"SFZ 支持做到哪"此刻的诚实答案是：一个真实库的 region，今天一个都解析不出来** ✗ —— 而**原因不是 opcode，是文件链还没取全** ✓。⭐ **这正是"用真实文件测"而不是"在文档里预测"的价值** ✓：仪器**直接给出了下一步要取哪些文件** ✓✓（`mappings/kickmic_basic.sfz` ✓ `mappings/snaremic_basic.sfz` ✓ `mappings/closemic_perc.sfz` ✓ …），不需要猜 ✓。

### ⭐⭐ 修好之后：**一个真实音色库第一次完整解析成功** ✓✓（2026-09-28）

修的是**解析基点的 bug** ✓（见 `includes.ts` 的注释）：真实库的 include **不是**相对"提出它的文件" ✗✓，而是相对**入口程序** ✓（`keymaps/kickmic_basic.sfz` 里写 `mappings/kick_dampen.sfz` ✓，而文件在 `Programs/mappings/` ✓）。现在**两个基点都试** ✓（提出者优先 ✓，保持 SFZ 的记载行为 ✓；根作为回退 ✓），并把**为什么需要回退**写在那里 ✓（因为**一个真实的、钉住的库需要它** ✓）。

而那个 bug 是**被一条写成"真实嵌套链"形状的判据抓住的** ✓✓ —— 写成平铺版本的同一判据**抓不到它** ✗（根与提出者同目录 ⇒ 两个候选相同 ⇒ 回退永不触发 ✓✓）。

**然后拿真实库复测** ✓✓：

```
includes=126   problems=0
regions=1676   withSample=1667   distinctSamples=1659
playable 36/38/42/46/49/51 → 6 / 6
note 38 → sample=../Samples/kickmic/kick/kickmic_kick_snoff_vl4_rr1.flac
          rootKey=60  semitones=-22  ratio=0.2806
```

⭐ **126 个 include、零问题、1676 个 region、1659 个不重复采样，六个鼓音符全部解析** ✓✓ —— 这是本项目第一次让一个**真实音色库**跑通解析 ✓。

### ⭐⭐ 追问到底：为什么 sfizz 对 note 38 **一个声部都不触发**（2026-09-28）

日志说 `NumVoices: 0` ✓ 而 `NumSamples: 1024` ✓ —— 采样全在 ✓、声部为零 ✓。逐层读下去，答案在库自己的文件里 ✓：

```
<master>                          ← SFZ v2 的头，我们的子集不认识
#include "mappings/kick_dampen.sfz"
tune_cc72=1200
<group>
key=$KICK_SNWRONG_KEY             ← ⭐ 变量替换
key=$KICK_SNRIGHT_KEY
```

```
Programs/keymaps/keymap_basic.sfz:1: #define $KICK_SNWRONG_KEY 35
Programs/keymaps/keymap_basic.sfz:2: #define $KICK_SNRIGHT_KEY 36
```

⭐ **这个库把底鼓映射到 35/36** ✓，而我打的是 **38** ✗ → **sfizz 的 0 个声部是正确行为** ✓✓。

### 已修的两层，以及它们暴露的第三、第四层（2026-09-28）

**第一层 `#define` + `$VAR`：已实现** ✓（`expandIncludes` 同层 ✓，**5 条判据** ✓）。作用域规则**由测量决定** ✓：那个库在 `keymaps/keymap_basic.sfz` 里 define ✓，而**更深处的文件**用它们 ✓ → 所以定义是**全局且按出现顺序生效**的 ✓✓（每文件作用域**无法**复现这个库 ✓）。

**第二层 `key=`：已实现** ✓（**2 条判据** ✓）。⭐ `key` 是 **`lokey` + `hikey` 的简写** ✓，而我们**只读了后两者** ✗ → 于是 `key=36` 被忽略 ⇒ 音域又回落到 **0–127** ✓✓ —— ⭐ **这是同一个"静默放宽音域"的缺陷第二次出现** ✓（第一次是未解析变量 ✓）。

**修好之后的实测** ✓：

```
REAL regions=1676  unresolvedRegions=0
REAL note 35 → no playback      ⚠️ 而库里 $KICK_SNWRONG_KEY 就是 35
REAL note 36 → no playback      ⚠️ 而 $KICK_SNRIGHT_KEY 就是 36
REAL note 38 → no playback      ✅ 与 sfizz 一致（它确实 0 个声部）
REAL note 42 →  ratio 1.0000     ⚠️ 采样名是空的
```

⭐⭐ **`note 38` 现在与 sfizz 一致了** ✓✓ —— 而**同一个修复让 35/36 也变成了"无播放"** ✗，所以还有一层没读到 ✓；另有一个 **`sample=` 为空的 region** ✗（解析产物 ✓，按本工作流的规矩**它不该可被选中** ✓）。

### ⭐⭐⭐⭐ 第三层：**继承必须是"该 region 自己所在的 group"** —— 以及最终结果（2026-09-28）

那个 bug 就在我自己的代码里 ✓✓：解析器在**最后**用**最终的** `global`/`group` 合并**每一个** region ✗ → 于是一个有两个 `<group>` 的文件，会让**所有** region 拿到**最后一个** group 的值 ✗✓ —— ⭐ **而它的注释还声称了相反的性质** ✗（"region 不会受它在文件里相对 group 的位置影响" ✓）→ **又一条"断言了代码没有的性质"的注释** ✓✓。

**修法是快照** ✓：在 region **被创建的那一刻**记下当时的 `global`/`group` ✓✓ —— 于是它继承的是**它所在的那个 group** ✓。**判据**就是那条本该早就存在的 ✓：两个 `<group>` 各自 `key=` ⇒ **各自的 region 拿各自的值** ✓✓。

**修好后的实测（真实库，一条题外话都不加）** ✓✓：

```
REAL regions=1676  unresolvedRegions=48  emptySamples=0
REAL note 35 → kickmic_kick_snoff_vl4_rr1.flac      （$KICK_SNWRONG_KEY = 35，"错"底鼓）
REAL note 36 → kickmic_kick_snon_vl4_rr1.flac       （$KICK_SNRIGHT_KEY = 36，"对"底鼓）
REAL note 38 → kickmic_snare_center_vl29.flac       （军鼓）
REAL note 42 → kickmic_hh_closed_vl4_rr1.flac       （闭镲）
REAL note 46 → kickmic_hh_open_vl4_rr1.flac         （开镲）
```

⭐⭐ **与我们先前"sfizz 对 38 一个声部都不触发"并不矛盾** ✓：我本地**只取了一个采样的文件** ✓ —— 军鼓与镲的文件不在 ✓ → sfizz 找不到文件 ⇒ 没有声部 ✓✓。**而我们的映射现在与原库自己的定义逐条吻合** ✓✓（35/36 正是它 define 的那一对 ✓，38/42/46 是标准鼓位 ✓）。

### ⭐⭐⭐⭐ 第四层：**带行尾注释的 `#define` 被静默忽略**（2026-09-28）

仍然是**我自己的 bug** ✓，而且是**最初那个格式 bug 的同一类** ✓✓：真实的 define 长这样 ✓

```
23:#define $FLATRIDE_CRASH_KEY 55 //GM splash cymbal key
68:#define $HH_PPREROLL 1000 //Was effectively 0 up to version 0.925
```

⭐ 而我读 define 的正则用 `\s*$` **锚定行尾** ✗ → **每一行带注释的 define 都被静默忽略** ✗✓。**`parseSfz` 从第一版起就会剥掉 `//`** ✓ —— **而预处理器没有** ✗✓，也就是**同一处"行语法被假设而不是被读"的错，往下挪了一层** ✓✓。

**修好之后的实测** ✓：`unresolvedRegions` 从 **48 → 12** ✓✓，`$HH_PPREROLL` 完全解决 ✓，而 **crash（note 49）也正确映射** ✓✓。

### ⭐⭐⭐⭐⭐ 第五层：**真实库用的是 Windows 行尾（`\r\n`）** —— 以及全清的最终读数（2026-09-28）

⭐ 决定性的一步不是猜正则 ✗，而是**把那 8 个不匹配的 define 行原样打印出来** ✓✓：

```
未命中的 define 行: 8
'#define $FLATRIDE_CRASH_KEY 55 //GM splash cymbal key\r'      ← ⭐ CR
```

**它们全部同时含 `//` 与 `\r`** ✓ —— 即**真实库的文件是 CRLF** ✗✓。⭐ 修法不是打补丁 ✓，而是**读取前先归一化行尾** ✓✓（**一条独立成立的理由**：一个只认自己机器行尾的解析器，并没有在**读文件** ✓）。

⭐ 而诊断顺带说明了责任划分 ✓：**`parseSfz` 早就按 `/\r?\n/` 切分** ✓✓ —— **只有预处理器不是** ✗。

**修好之后的最终读数（一个真实音色库，整条链）** ✓✓✓：

```
includes=126  problems=0  regions=1676
unresolvedRegions=0  variables=none  emptySamples=0

note 35 → kickmic_kick_snoff_vl4_rr1     （"错"底鼓）
note 36 → kickmic_kick_snon_vl4_rr1      （"对"底鼓）
note 38 → kickmic_snare_center_vl29      （军鼓）
note 42 → kickmic_hh_closed_vl4_rr1      （闭镲）
note 46 → kickmic_hh_open_vl4_rr1        （开镲）
note 49 → kickmic_crash_crash_vl3_rr1    （吊镲）
note 55 → kickmic_flatride_crash_vl4     ⭐ 就是先前坏掉的那个；而库里那行注释正写着 "GM splash cymbal key" ✓✓
note 57 → kickmic_crash_sizzle_vl3_rr1   （镲 sizzle）
```

⭐⭐ **于是"SFZ 支持做到哪"这条线，第一次有了一个真实音色库的完整答案** ✓✓：**126 个 include、1676 个 region、零问题、零未解析变量、八个鼓位全部映射到该库自己意图的采样** ✓✓ —— ⭐ **而且 note 55 由该库自己的注释佐证** ✓✓。

⚠️ ### ⭐ `<master>`：已支持（2026-09-28）

真实库用它装 `ampeg_release` / `tune_cc*` / bleed 那些 opcode ✓ —— 而在此之前 **`<master>` 是"未知头"** ✗ → `current = null` ⇒ **它里面的每一个 opcode 都被丢弃** ✗✓（原则上包括音域 ✓）。

采用的规则是**最小且诚实**的那条 ✓：**与 `<global>` 同族** ✓ —— 它作用于**其后的** region ✓（SFZ 对两者的区分在**复位点** ✓，而在没有消费者的情况下建模那一点**等于发明没人要求过的行为** ✓）。**立即可见的好处是那些 opcode 被保留下来** ✓✓，所以写在那里的一条音域或调音**不可能被静默丢掉** ✓。

⭐ 而**真实库判据当场证明了没有回归** ✓✓：读数仍是 **126 includes / 1676 regions / 0 unresolved** ✓，八个鼓位仍映射到该库意图的采样 ✓ —— ⭐ **这就是"先有判据、再改行为"的兑现** ✓。

### ⭐⭐⭐ CC / 曲线层：**实测不承重** —— TRACK A 的最后一项有了答案（2026-09-28）

**先纠正一件事** ✓：我先前那次"CC 不承重"的否证**是无效的** ✗✓ —— 当时 sfizz 缺军鼓的采样文件 ✓（`maxVoices=0` ✓，静音 ✓），**静音什么也证明不了** ✓✓。

现在路径是**从解析器打印出来的** ✓（`../Samples/kickmic/snare/kickmic_snare_center_vl29.flac` ✓ —— 而我自己猜的那条漏了 `kickmic_` 前缀 ✗✓），于是对照**有效** ✓：

| 渲染 | 帧数 | peak | rms | maxVoices |
|---|---|---|---|---|
| **不带 CC** | 88064 | **0.0242** | 0.0012 | **1** |
| **带 CC**（该库自己的 12 个 `set_cc*` ✓） | 88064 | **0.0242** | 0.0012 | **1** |

⭐⭐ **四项完全相同** ✓✓ → ⭐ **CC 层对这个库不承重** ✓：那些 `set_cc*` 是**默认值已经很合理的修饰性控制** ✓（麦克风音量 ✓ 调音 ✓），而**我们现有的子集已经能让这个鼓组出声** ✓✓。

**所以"SFZ 支持做到哪"这条线可以结一个账了** ✓：**这个真实库所需的一切——include ✓ define ✓ 变量 ✓ key 简写 ✓ per-region 继承 ✓ CRLF ✓ `<master>` ✓——都已实现并受判据保护** ✓✓；**而 CC/曲线那一层，实测不是"能不能出声"的前提** ✓。它若将来值得做 ✓，理由会是**控制与表现**（麦克风混合 ✓ 调音 ✓），而**不是"否则没声音"** ✓。

### ⭐⭐ `durationSeconds` 怎么测：**用已经知道答案的工具**（2026-09-28）

清单的每个条目需要一个 `durationSeconds` ✓，而它**必须实测** ✓（编一个 `0` 就是"看起来像测量"的东西 ✓）。这一轮试了**三种方法** ✓，前两种都错 ✗，而它们错的方式值得记：

| 方法 | 结果 |
|---|---|
| ⭐ **用 sfizz 渲染再读输出长度** ✗ | 输出 = **音符长度**（30.0002 s ✓）✓ —— **渲染长度不透露采样长度** ✗✓ |
| 自己解析 FLAC 的 `STREAMINFO` ✗ | **猜了三次位布局**（偏移 8 ✗、偏移 12 ✗、字段顺序 ✗）→ 读出 `6266812 s` ✗✓ 与 `48000 Hz · 1 ch` ✗ |
| ⭐⭐ **`metaflac` / `ffprobe`** ✓✓ | **正确，且两个工具互相印证** ✓✓ |

```
kickmic_snare_center_vl29.flac : 48000 Hz · 92832 samples = 1.9340 s   （ffprobe: 1.934000 ✓）
kickmic_kick_snoff_vl4_rr1.flac: 48000 Hz · 148113 samples = 3.0857 s
```

> ⭐⭐ **在我自己去解析一个二进制格式之前，先查这台机器是否已经有一个被百万个文件检验过的工具** ✓✓ —— **我对 FLAC 的位布局猜了三次，而 `metaflac` 就在 `/usr/bin`** ✗✓。

**所以 `durationSeconds` 的测法是** ✓：对库里的样本跑 `metaflac --show-total-samples --show-sample-rate` ✓（**无需解码** ✓，1660 个文件也很便宜 ✓），并用 `ffprobe` 交叉核对 ✓✓。⭐ 而"**把整库的时长普查一遍**"是**重活** ✓ → 按业主要求**放 CI** ✓。

### ⭐ 时长普查**不该放进每次 CI 运行** —— 它属于镜像搬运（2026-09-28）

我原本打算"把整库的时长普查接进 CI" ✓，而**算一下就知道不对** ✗✓：这个库的样本共 **1.2 GB** ✓（1660 个文件 ✓）→ **在每个 CI 运行里下载一遍并测量，是不可接受的** ✗✓。

**所以它落在镜像搬运那一步** ✓✓ —— 那一步**本来就要下载全部字节** ✓（为了上传到 R2 ✓），而**时长是那次下载的副产品** ✓：`mirrorFiles` 取到字节 ✓ → `audioDurationSeconds` 问 `metaflac` ✓ → **清单条目被填实** ✓✓。**一次每个库版本一次** ✓，**不是每次 CI** ✓。

⭐ 而 CI 那边**只需要"核对已经存在的清单"** ✓（不下载 ✓）：哈希与体积在清单里 ✓ —— 这正是**清单存在的意义** ✓✓。

⚠️ 而 `metaflac` **不在 ubuntu 默认镜像里** ✓ → `sfizz` scope 的依赖行补上了 **`flac`** 包 ✓✓（替代方案是手解 FLAC 头 ✗ —— 那已经用**三次错猜**证明过不值得 ✓）。

### ⭐ 剩下的**不是一根线，而是一个功能** —— 以及为什么不写死代码（2026-09-28）

我上一轮说"只差应用侧取清单（机械的）" ✓。**查过之后，那句话是错的** ✗✓ —— 而它错得值得记 ✓。

`SAMPLE_CATALOGUE` 现在的消费者**只有三个** ✓，而且**全在这个切片内部** ✓：

```
src/audio/sampleLoader.ts      — 默认注入 SAMPLE_CATALOGUE ✓
src/audio/audioLanePlan.ts     — 默认注入 SAMPLE_CATALOGUE ✓
src/audio/audioLaneScheduler.ts — 默认注入 SAMPLE_CATALOGUE ✓
```

⭐ **应用侧一个消费者都没有** ✗✓ —— 因为"**只读切片**"这条自我约束（**不接进交付物** ✓）是**我自己定的** ✓✓。所以在今天写一个"应用侧取清单"的函数 ✓，**就是写死代码** ✗ —— ⭐ **而用死代码去显得"完成了"，正是这条工作流一路在避免的事** ✓✓。

**所以剩下的是一件功能，不是一根线** ✓：**应用里得有一条"播放这条音频车道/这件乐器"的路径** ✗ —— 那包括：谁在什么时机取清单 ✓、状态放在哪 ✓、UI 里那个开关长什么样 ✓、以及它和已有的实时图怎么接 ✓✓。**这些都不是"接线"** ✓，而是**一个新功能的范围** ✓ —— 而它与 TRACK A 的关系是：**TRACK A 把它的地基和判据都准备好了** ✓✓（解析 ✓ 映射 ✓ 加载 ✓ 调度 ✓ 清单 ✓），**而功能本身从未被承诺过** ✓。

**这就是我要如实停下的地方** ✓：**逻辑上，一件真实乐器已经可以从清单走到播放路径的入口** ✓✓（`catalogueFromManifestText` ✓ → `resolveInstrumentNote` ✓ → `loadNote` ✓ → `SampleSink` ✓，**每一环都有判据** ✓）；**物理上，它一次都还没有响过** ✗✓ —— 因为**字节还没上传到镜像** ✓（需要凭据 ✓），**而且应用里还没有调用它的地方** ✓。

**仍未做的**（都已具名 ✓）：~~**`<master>`** 头~~ ✓ **已完成** ✓；、**CC/曲线调制层** ✓（仍未测出是否承重 ✓ —— 先测再建 ✓）、以及**把这条真实库判据搬进 CI** ✓（`/tmp/vd` 是本地下载 ✓ —— 它属于"重活" ✓，按业主要求应放 CI ✓✓）。

### ⏳ 历史记录：剩下的 12 个：`$FLATRIDE_CRASH_KEY`

它**确实被定义**（`keymap_basic.sfz:23` = **55** ✓），而 note 55 却"无播放" ✗ → ⭐ 所以这**不是缺定义**，而是**那 12 个 region 走到的链路里，定义尚未生效** ✓（它们位于 `room_epic_all.sfz` / `oh_epic_all.sfz` 这类"**全量/Epic**"文件里 ✓ —— 而 `01-basic-kit.sfz` 并不包含它们 ✓✓，所以它们是从**别的入口**进来的 ✗✓，那个入口的 include 顺序就是下一轮要读的东西 ✓）。

⚠️ 以及 **48 个 region 曾带未解析变量** ✓ —— 那是**诚实且安全**的 ✓✓：它们**不可被选中** ✓，而不是拿一个回退音域去应答 ✓（这正是上一轮修的那条 ✓）。

**下一轮要追的两件事（都已具名 ✓）**：为什么 `key=35/36` 的 region 匹配不到 35/36 ✓（怀疑在 `<group>` 的 `key` 与 `locc`/`hikey` 继承 ✓），以及那个空采样 region 从哪来 ✓。

### ⭐⭐⭐ 而我们的解析器却"成功"匹配了 note 38 —— 这是一个真缺陷

因为 `$KICK_SNRIGHT_KEY` **没有被替换** ✓，`num()` 就把 `key=` 的值当成**不可解析** ✓ → 回退到默认 **0–127** ✗✓ → 于是**每一个 region 都匹配每一个音符** ✓✓。

> ⭐ **一个未解析的变量，静默地变成了"匹配一切"** ✗ —— 这正是本工作流一路在防的那种失败 ✓✓：**不是报错，而是"拿到一个错采样却没有任何错误可看"** ✓。

**所以"SFZ 支持做到哪"现在有了一个具体的、被测出来的答案** ✓✓（而不是一张预测表 ✗）：这个库需要 **`#define` + `$VAR` 替换** ✓、**`<master>`** ✓、以及它那套 CC/曲线调制 ✓ —— **而第一件必须做的是让"未解析的变量"变成错误，而不是默认值** ✓✓。

### ⚠️ 以及那个必须用 sfizz 裁决的疑点

`rootKey=60` 是 SFZ 的**默认值** ✓ —— 也就是说这个库**没有**为这些 region 设置 `pitch_keycenter` ✗✓ → 于是底鼓被判成 **0.28×**（降 22 个半音 ✗）。**这对鼓组很可疑** ✓：鼓采样通常按**它自己的音高**录制 ✓，而"未设置即 60"会把它们全部移调 ✗。

⭐ **裁决方式已经现成** ✓✓：**让 sfizz 渲染同一个 SFZ 的同一个音符** ✓，再量输出音高/频谱 ✓✓ —— 正是 **A4 的形状**，只不过这次的对象是**真实音色库**而不是自制夹具 ✓。**在拿到那个对照之前，我不改任何映射** ✗✓（否则就是拿猜测去覆盖一个未测量的行为 ✓）。

**下一步因此是机械的** ✓：把 `mappings/*.sfz` 也取到 ✓ → 重跑同一个测量 ✓ → region 会出现 ✓ → **那时才知道 opcode 那一层真正的缺口** ✓。

### 决定（自治，已记理由 ✓）：**先做 `#include`**

⭐ 理由 ✓：它**不是**可选项 ✓ —— 真实库**普遍**用它把"程序"与"键位映射"分开 ✓✓；而它**小而可判** ✓：在包含文件里按**相对路径**解析 ✓、**递归** ✓、带**循环与深度守卫** ✓（include 可以互相引用 ✓，那是经典陷阱 ✓）。

**形状**（类型先定 ✓，与调度器/乐器解析同一做法 ✓）：`parseSfz` **不**碰 I/O ✓；另加一个**纯函数** `expandIncludes(text, { read, path })` ✓ —— `read` 注入 ✓，于是**循环、缺失文件、嵌套深度**都能在没有网络的情况下测 ✓✓。

**判据**：① 一个 include 被展开 ✓；② 嵌套 include ✓；③ **循环 include 报错而不是无限递归** ✓✓；④ 缺失文件**报出是哪一个** ✓；⑤ 没有 `#include` 的文本**逐字符不变** ✓✓（与本工作流对每一步的要求一致 ✓）。

**而 CC/曲线那一层** ⚠️：**暂不承诺** ✓ —— 它是**调制系统** ✓（`*_cc*` / `*_curvecc*` ✓），不是"多几个 opcode" ✓✓。先让真实库**能被解析** ✓，再看**哪些音符真的落在我们支持的路径上** ✓ —— 到那时缺口是**测出来的** ✓，不是猜的 ✓。

## Q3. SFZ 子集要支持到哪？—— 调研就是需求表

| 音色库 | 它要求什么 | 我们的子集今天够吗 |
|---|---|---|
| **Accurate-Salamander** ✓ | 16 个力度层 ✓、480 采样 ✓、逐键调音（`tune` ✓） | ⭐ **够了** ✓（`lovel/hivel` ✓ + `tune` ✓ + `pitch_keycenter` ✓ 都已实现并受测 ✓） |
| **Virtuosity Drums** ✓ | **36 动态层** ✓、4 round robins ✓、**6 支麦克风可混** ✗ | ⚠️ **不够** ✓：需要 `group`/`off_by`（choke ✓）与**麦克风 = 多输出或分组选择** ✓ |
| **Karoryfer** ✓ | **keyswitch** ✗、参数化控制 ✗ | ❌ **这是 ARIA 扩展** ✗ —— 应当**响亮地声明不支持** ✓，**绝不静默** ✓✓ |
| **VCSL** ✓ | 全音采样 ✓、2–3 个力度层 ✓、单个 round robin ✓ | ⭐ **够了** ✓✓ |
| **VSCO 2 CE** ✓ | 与 VCSL 同类 ✓ | 够 ✓（但许可证模糊 ✗） |

### ⭐ 两处自我更正（都是「读它的实际布局」换来的 ✓）

1. **第一件乐器不是 VCSL** ✗✓（见上面的核对：VCSL **不含任何 `.sfz`** ✓）→ 改为 **`virtuosity_drums`** ✓（419 个现成 SFZ ✓ CC0 ✓）；
2. ⭐ **「6 支麦克风」不是多输出路由** ✗✓ —— 实际布局是 **`Programs/03-kick-mic.sfz` … `08-vintage-mic.sfz`** ✓✓，即**每支麦克风一个独立程序** ✓ → ⭐ **麦克风选择 = 换一个 SFZ** ✓，**不需要新 opcode** ✓✓。我原先预测「需要 `group`/`off_by` 与多麦克风路由」 ✗ —— **错在有依据之前就下了结论** ✓。

**所以真正的子集缺口，要等 `01-basic-kit.sfz` 真的被解析一次才会知道** ✓✓ —— 那才是「SFZ 支持做到哪」的**真实答案** ✓，而不是我在文档里预测的答案 ✗。

**（原推荐保留在下面，作为被更正前的判断 ✓）**

⭐ **结论：第一个目标应当是 VCSL** ✓✓ —— 它**小**（20–75 MB/乐器 ✓）、**CC0** ✓、**简单** ✓，而且**今天的子集就已经够** ✓✓ → 于是 A4 的"逐样本对照"可以**立刻**用一件真实乐器做 ✓，而不是等着一套庞大的引擎 ✓。

## Q4. 许可证怎么落（对一个 MIT 项目）

| 许可证 | 判断 |
|---|---|
| **CC0**（Virtuosity ✓ Karoryfer 免费库 ✓ VCSL ✓） | ✅ 与 MIT 完全相容 ✓ —— 可以直接镜像到 R2 并随应用分发 ✓ |
| **CC BY**（Accurate-Salamander ✓） | ✅ 可用 ✓，**但必须有署名** ✓ → 署名文本进清单 ✓ + **界面上要有 Credits 一处** ✓（不能只写在仓库里 ✗） |
| **CC Sampling Plus 1.0**（VSCO 2 CE ✗） | ⚠️ **条款模糊** ✗ → ⭐ **不要由我们再分发** ✗✓；若要用，走 **(d) 用户自备** ✓✓ —— 这样"再分发"这件事根本不存在 ✓ |

⭐ 这一条是**法律风险**而不是偏好 ✓：在一个 MIT 项目里**再分发**一个条款模糊的采样库，风险落在**你**身上 ✗✓；而 (d) 路径把它变成用户自己的选择 ✓✓。

## Q5. 与 PWA / Service Worker 的集成（一个具体的、已知的坑）

- ⭐ **不能预缓存 GB 级音色** ✗ —— PWA 预缓存是"应用能离线打开"的机制 ✓，不是素材仓库 ✗；
- 所以：**每件乐器需要用户显式同意**（"安装这台钢琴：1.6 GB" ✓）→ 存 **OPFS** ✓ → 清单校验哈希 ✓；
- ⚠️ 而 `public/sw.js` 现在只有三类分支（`/assets/*` 缓存优先 ✓、导航网络优先 ✓、元数据网络优先 ✓）→ 采样需要一个**自己的规则** ✗✓（**缓存优先但按需写入、永不预缓存** ✓✓），否则它们会落进错误的分支 ✓；
- 包体**不受影响** ✓✓（223 KB 那条门禁继续守得住 ✓）。

## 建议的落地顺序（每一步都能单独验证 ✓）

1. ⭐ **先做 VCSL 的一件小乐器** ✓✓（CC0 ✓ 子集够 ✓ 20–75 MB ✓）→ 用 **A4 的判据**（与 sfizz 逐样本 epsilon 内 ✓）证明**整条链路** ✓：清单 → 下载 → SFZ → 区域选择 → 播放比率 → 输出一致 ✓；
2. **把清单机制做出来** ✓（许可证 ✓ 署名 ✓ 哈希 ✓ 兼容性字段 ✓）—— 它是 (c) 与 (d) **共用**的那一层 ✓；
3. **再取 Accurate-Salamander** ✓（对"逐键调音 + 16 层"的**真实压力测试** ✓，而且它只需要我们已有的 opcode ✓✓）→ 此时 Credits 界面必须已经存在 ✓；
4. **最后才谈 Virtuosity Drums** ✓（36 层 ✓ + 麦克风 ✓ + choke ✓ = 需要新 opcode ✓ 与新路由 ✓）；
5. ⛔ **Karoryfer 的 ARIA 依赖**与 **VSCO 2 CE 的许可证**都被**显式记录**为"暂不支持及其原因" ✓✓ —— 而不是被默默跳过 ✗。

## 一句话

**技术上真正的决定只有一个：字节放哪** ✓ —— 建议 **R2 镜像 + 仓库只放清单 + 用户自备作为逃生门** ✓✓；
**而集成上的第一件该做的事，是用 VCSL 的一件小乐器把 A4 的"逐样本一致"跑通** ✓✓ —— 因为它今天**就已经在我们的 SFZ 子集覆盖范围内** ✓，所以它能一次性证明整条链路 ✓，而不是先造一座引擎再去找乐器 ✓。

## 播放功能：第 3 刀之前查出的实情 —— **应用里没有这条路径**（2026-09-28，业主已决定要做 ✓）

第 2 刀的结论是"把运行时目录接进实时引擎与离线渲染" ✓。**动手前先查了一遍谁在构造那条路径** ✓：

```
grep -rn "planAudioLaneEvents|createSampleLoader|scheduleAudioLane|browserSampleGraph|SampleSink" src --include=*.ts --include=*.tsx | grep -v "^src/(audio|test)/"
→ 空
```

⭐ **应用侧一次都没调用过** ✗✓ —— 而 `'audio'` 在全应用里只命中两处 ✓，**都是类型定义** ✓（`src/types/genre.ts` ✓、`src/types/customGenre.ts` ✓）。

### 所以计划要改形状：不是"接线"，是"建路径"

| 原计划（错的 ✗） | 实情 ✓ |
|---|---|
| 把目录接进实时引擎 ✓ | ⭐ **实时引擎里没有可以接的东西** ✗✓ |
| 让那三个"默认注入空目录"的消费者读到运行时目录 ✓ | ⭐ 那三个消费者**只有测试在调用** ✓ |

**修正后的刀（依赖顺序 ✓）**：

1. ⭐ **构造**：当唱段里出现 `track_id: "audio"` 的轨时，把音频车道**建进实时图** ✓（`browserSampleGraph` ✓ 已有 ✓）—— **这是这条路径第一次在应用里存在** ✓；
2. **喂目录**：用 `createCatalogueRuntime` ✓（已建 ✓）的资产 ✓ → `resolveInstrumentNote` ✓ → `loadNote` ✓ → **出声** ✓；
3. **开关**：UI 上能看出它在加载 / 失败 / 就绪 ✓（**空 root = 保持今天的行为** ✓，这条保险已经在运行时目录里 ✓）。

⭐ **而第 1 刀之前的诚实判断** ✓：**这是一条从未被走通的路** ✓ —— 所以它**必然会在第一次跑真实数据时暴露若干"只在测试里成立"的假设** ✓✓（这正是本工作流从 SFZ 的 `#include` 到 `ffprobe` 反复经历的那件事 ✓）。

## 第 2 刀的挂钩点：已定位、已读、**尚未动手**（2026-09-28）

`AudioEngine.play()`（`src/audio/AudioEngine.ts:1531`）的结构已读清 ✓：

| 行 | 内容 |
|---|---|
| 1532–1546 | GS1 能力探测（**不 await**，且**吞掉异常** —— 单元套件抓到过 12 个未处理拒绝 ✓） |
| 1547–1559 | preview scope 的清理（**那次"只播和弦"的报告就是它** ✓） |
| 1560–1563 | `initIosAudioUnlock` ✓ → `ctx.resume()` ✓ |
| 1564–1569 | `isPlaying` 守卫 ✓ → `onPlayCallback()` ✓ → `publishClockStart` ✓ |
| 1573–1600 | `currentStep` ✓ · `now` ✓ · 延迟补偿（**钳到 35 ms** ✓） |
| 1601+ | 数拍 ✓ → 调度器起步 ✓ |

⭐ **挂钩点**：**`:1566–1578`** ✓ —— context 已活 ✓、`isPlaying` 已置 ✓、**而调度器尚未起步** ✓✓。

### ⭐ 而它落地前**必须先读**的一件事

**"歌"在引擎里从哪来** ✗ —— `playAudioLanes` 需要 `clips` ✓、`sections` ✓、`boundaries` ✓、`bpm` ✓，而**引擎持有的可能是另一种形状**（单 pattern ✓ / 编排态 ✓ / preview scope ✓ 三种状态都存在 ✓）。⭐ **在没读清它之前插进去，就是本工作流已经栽过的那种猜测** ✓✓（`catalogue` 选项那次 ✓）。

### ⭐⭐ 而必读的那件事读完了，结论是：**挂钩不该在引擎里**（2026-09-28）

上一轮写下"必须读清 song 在引擎里从哪来"。读完了 ✓：

| 事实 | 证据 |
|---|---|
| `AudioEngine` 只持有**单个 pattern** | `:296` `private pattern: SequencerPattern \| null = null` ✓；写入只有 `setPattern` ✓（`:739` ✓） |
| 而 **`engine.play()` 被多处调用** | `ConsolePanel.tsx:319` ✓ · `ChallengeView.tsx:218/241/249` ✓ · `CompareView.tsx:295` ✓ |
| **song / sections 在 app 层** | ⭐ `src/views/StudioView.tsx` ✓ · `src/hooks/useGenreAudition.ts` ✓ |

⭐ **所以引擎不知道 song** ✗✓ —— **在 `play()` 里插一个需要 clips/sections/boundaries 的调用，就必须先让引擎知道 song** ✓，而那是**一个比这个功能大得多的改动** ✗✓（引擎当前"只懂 pattern"是它的一个清晰边界 ✓）。

**决定：挂钩放在持有 song 的那个调用者身上** ✓✓ —— `playAudioLanes` 由**启动播放的那一处**（`StudioView` ✓，编排播放的所在 ✓）与 `engine.play()` **并排调用** ✓：

* ⭐ **一行也不动那个 1700 行的引擎文件** ✓✓ —— 风险与它的体量成比例地小 ✓；
* ⭐ **引擎的边界不变** ✓：它继续只懂 pattern ✓，音频车道是"谁拥有编排、谁负责启动"✓；
* ⭐ 而**"只在有音频车道时才动"仍然由 `playAudioLanes` 自己保证** ✓（空计划 ⇒ 空报告 ✓ 不是失败 ✓）。

### ⭐⭐ 落点已经读到底了：`arrangementSong` + `useTransportControls`（2026-09-28）

按上一轮的决定（挂钩在持有 song 的那一层 ✓）继续读，落点两处都找到了 ✓：

| 需要的东西 | 在哪 | 证据 |
|---|---|---|
| ⭐ **song 形状的对象** | `src/views/StudioView.tsx:266` | `const arrangementSong = useMemo(...)` ✓ —— 正是 `clips`/`sections`/`boundaries`/`bpm` 那种形状 ✓ |
| ⭐ **编排真正开始播放的那一处** | `src/features/sequencer/hooks/useTransportControls.ts` | `StudioView:536` 从它解构出 `handleTogglePlay` ✓，并传给它 `engineRef` ✓ 与 `seqStateRef` ✓ |

**所以第 2 刀的形状是** ✓：

1. `useTransportControls` 多收一个 **`arrangementSong`** ✓（或一个取值函数 ✓，以免每次渲染都换新对象 ✓）；
2. 在它调用 `engine.play()` / `playScoped()` 的那一处**并排调用 `playAudioLanes`** ✓；
3. **context 与 destination 从引擎取** ✓ —— 引擎自己持有 `ctx` ✓（`AudioEngine.play()` 里就能看到 ✓），**不需要新拉管道** ✓；
4. **失败不阻塞** ✓：`playAudioLanes` 的 promise 被 **catch 并具名报告** ✓ —— 与引擎对 GS1 探测的取舍相同 ✓（`void this.probeLiveGs1().catch(() => undefined)` ✓）。

### ⭐⭐ 精确到行的落刀位置（2026-09-28）

`useTransportControls` 的路径与行号都读到了 ✓：

| 处 | 内容 |
|---|---|
| 文件 | ⭐ **`src/features/sequencer/hooks/useTransportControls.ts`** ✓（**不在 `src/hooks`** —— 我第一次找错了目录 ✓） |
| 选项类型 | `:10` `UseTransportControlsOptions` ✓ · `engineRef` `:11` ✓ |
| ⭐ **落刀处** | ⭐ **`:159` `await engine.play();`** ✓ —— `const engine = engineRef.current;` 在 `:137` ✓ |
| 另一处播放 | `:194` 附近还有一次（preview/作用域路径 ✓），**也要并排调用** ✓，否则"预览时车道不响、播放时才响"✓ |

**落刀时仍然缺的一项**（也已具名 ✓）：**引擎暴露 context 与 destination 的方式** ✗ —— `playAudioLanes` 需要两者 ✓，而引擎自己持有 `ctx` ✓（`AudioEngine.play()` 里可见 ✓）。⭐ **先读它的公开访问器**（或 `sink` 的接法 ✓），**再落刀** ✓ —— **这是本功能第四次"先读再动"** ✓，而前三次每次都改变了计划 ✓。

⭐ 而**落刀时的判据**已经在手边 ✓：`playAudioLanes` 的 3 条 ✓（无车道 ⇒ 空报告 ✓、能解析的资产 ⇒ 进入加载器 ✓、解析不到的资产 ⇒ **具名报出** ✓）+ 目录运行时的 2 条 ✓ —— ⭐ **所以这一刀要新增的判据只有一条** ✓：**"播放开始时，编排的歌被交给了音频车道"** ✓（用一个假的 transport 依赖去断言调用 ✓，不需要浏览器 ✓）。

### 挂钩要做的三件事（已在文档里定形 ✓）

1. ⭐ **只在有音频车道时才动** ✓ —— 由 `playAudioLanes` 自己保证（**空计划返回空报告 ✓ 不是失败 ✓**）；
2. **目录用 `appCatalogueRuntime`** ✓（第 1.5 刀 ✓）—— **一个实例，于是引擎、离线渲染与 UI 不可能对"存在哪些资产"产生分歧** ✓；
3. **失败不阻塞播放** ✓ —— 音频车道加载不了时，**其余轨道照常播** ✓，并把问题**具名报出** ✓（这条与引擎既有的 `probeLiveGs1`"吞掉异常"是同一种取舍 ✓）。

## ⭐⭐⭐ 端到端探针（2026-09-28）：第一次真的跑真实字节，而它抓到两个

`scripts/probe_sfz_end_to_end.mjs` ✓ —— 复用编排探针的启动样板 ✓（**逐行复用，不重写** ✓），然后在真实页面里走**应用走的那条路** ✓：线上清单（**在 Node 里取、传进页面** ✓，因为探针在 `localhost` ✓ 而清单在生产域 ✓）→ 目录 ✓ → **源优先取 SFZ** ✓ → 解析 ✓ → 取采样 ✓ → 解码 ✓ → **断言峰值非零** ✓。

### ① 源地址**多了一层 `prefix`** ✗✓ —— 已修 ✓

```
旧: https://raw.githubusercontent.com/<repo>/<pin>/virtuosity-drums/Programs/…   ✗ 14 字节 "404: Not Found"
新: https://raw.githubusercontent.com/<repo>/<pin>/Programs/…                    ✓ 1205 字节
```

⭐ **`prefix` 描述的是镜像的布局** ✓（**库之间靠一层目录分开** ✓），**而源仓库没有这一层** ✓✓ —— ⭐ **两个布局，两个地址** ✓：**源是 `repo/pin/sfz`** ✓、**镜像是 `root/prefix/sfz`** ✓。

⚠️ 而这个错**伪装得很像"这个库没有乐器"** ✗✓：14 字节的 404 正文被当作 SFZ 解析 ✓ → **`defines no regions`** ✓ —— ⭐ **一个路由失败，被读成了一个内容失败** ✓。

### ② ⭐ 加载器**不展开 include** ✗✓ —— **这是"能响"的最后一个拦路石**

```
sfz text: 1205 bytes from the source       ✓ 文件本身对了
resolve note 38: ok=false … defines no regions
```

⭐ 因为**入口程序里有 0 个 `<region>`** ✓ —— **它只有 `#include`** ✓✓（**这正是本工作流从一开始就测出来的那条** ✓）。

**所以加载器必须** ✓：取到程序文本后 ✓ → **用 `IncludeReader` 展开** ✓（`expandIncludes` ✓ 已建、已测、已用于镜像侧 ✓✓）→ **再解析** ✓。⭐ 而 include 的取法要**相对于写下它的那个文件的地址** ✓（源优先 ✓、镜像回退 ✓ —— **同一套两地址规则** ✓）。

⭐ 而修好之后，`resolveInstrumentNote` 才会看到真实的 1676 个 region ✓✓ —— ⭐ **那才是"能响"的最后一步** ✓。

## ⭐⭐ 最后一个拦路石的设计：**同步的 include 读取器 vs 异步的浏览器**（2026-09-28）

端到端探针查明：**加载器不展开 include** ✗，而**入口程序里 0 个 `<region>`** ✓ → **任何真实库都解析不出 region** ✗✓。⭐ 而我一读才发现，**它不是一行能改的** ✓：

```
export interface IncludeReader {
  /** Returns the file's text, or `undefined` when there is no such file. */
  (path: string): string | undefined;     ← ⭐ 同步 ✓
}
```

⭐ **而浏览器取文件是异步的** ✓ → ⭐ **所以加载器不能把 `fetchSfzText` 直接当作 reader 传进去** ✗✓（**镜像侧的测试能这么做，是因为它用 `readFileSync`** ✓ —— **在 Node 里同步是免费的** ✓）。

### 而修法必须**不把 include 的语义复制第二份** ✓

**三个候选** ✓：

| 方案 | 判断 |
|---|---|
| ⭐ **异步版展开器** | ✗ **同一套语义的第二份实现** ✓ —— **本工作流已经在"两处一指"上栽过五次** ✓✗ |
| **预取整棵程序树** | ⚠️ 可行 ✓（419 个文件、648 KiB ✓）但**得先知道有哪些** ✓ → 循环依赖 ✗ |
| ⭐⭐ **波次式：让展开器报出"读不到的路径"，异步调用者补取后重跑** | ✅ **include 语义仍然只在一处** ✓✓ |

**波次式的形状** ✓：

1. `ExpandIncludesResult` 增加 **`missing: string[]`** ✓ —— 那些 **reader 返回 `undefined` 的路径** ✓（**现在只体现在 `problems` 的字符串里** ✓，而**调用者需要的是路径本身** ✓）；
2. 异步调用者循环：**展开** ✓ → **取 `missing` 中的路径**（**同一套两地址规则：源优先 ✓ 镜像回退 ✓**）→ **再展开** ✓ → ⭐ **直到 `missing` 为空或不再变化** ✓（后者意味着**某些 include 在两个地址都不存在** ✓ → **如实报出** ✓）；
3. ⭐ **而每一轮都是同一个 `expandIncludes`** ✓ → **语义只有一份** ✓✓。

⚠️ **而波次式有一个必须防的** ✗：**include 循环** ✓ —— ⭐ 展开器**已经有 cycle/depth 守卫** ✓✓（本工作流早先就被一个循环 include 教过 ✓），**所以波次循环的终止条件是"`missing` 不再变化"** ✓，而**不是"取到一个固定的轮数"** ✓。

## ⭐⭐ 最后一层：采样路径要变成**地址**，而不是查表键（2026-09-28，端到端探针点名）

端到端探针在 include 打通之后给出的下一条 ✓：

```
loadNote threw: no sample "../Samples/kickmic/snare/kickmic_snare_center_vl29.flac"
                — the catalogue holds virtuosity-drums-basic
```

⭐ **加载器把 region 的 `sample=` 当作"目录里的 `assetId`"去查** ✗✓ —— **而目录里装的是乐器，不是文件** ✗✓（**清单列的是文件 ✓，但目录是乐器级的** ✓）。

### ⭐⭐ 而修法是一行 URL 语义，不是一套新的基准算术

```ts
const primary  = new URL(region.sample, asset.sfz.url).toString();
const fallback = asset.sfz.fallbackUrl ? new URL(region.sample, asset.sfz.fallbackUrl).toString() : undefined;
```

⭐ **`../Samples/kickmic/snare/x.flac` 相对 `…/Programs/01-basic-kit.sfz`** → ⭐ **`…/Samples/kickmic/snare/x.flac`** ✓✓ —— **一步就对了** ✓。

⚠️ 而这**正是我先前栽过两次的地方** ✗✓：① 源地址多拼了一层 `prefix` ✓；② include 用 `new URL(path, programUrl)` 相对**程序目录**解析、而路径已经是根相对 ✗✓。

### ⭐ 为什么这次不会再栽：**这次的两个地址都是"程序自己的地址"**

| 处 | 基准 | 对不对 |
|---|---|---|
| **include** | 库根（**路径是根相对的** ✓） | ⭐ 需要把库根**显式算出来** ✓（`url` 去掉 `sfz.path` ✓）—— 因为路径不是相对程序的 ✗ |
| ⭐ **采样** | ⭐ **程序自己的 URL** ✓ | ✅ **因为 `sample=` 就是相对程序文件的** ✓（`../Samples/…` ✓）—— ⭐ **所以一行 `new URL` 就够，而任何"基准算术"都会再次引入同一类错** ✓✓ |

⭐ **两个地址、两种相对关系** ✓ —— ⭐ 而它们**各自都有真实数据可以对照** ✓（`included 126 · regions 1676` ✓ 与 1659 个采样文件 ✓），**所以错了会立刻显形** ✓。

### ⚠️ 而它要改的地方（已定位 ✓）

`sampleLoader.loadNote`（`src/audio/sampleLoader.ts:85`）✓：region 解析出 `sample` 之后 ✓，**不再走 `load(assetId)` 的目录查找** ✓，而是**按上面两条地址解码** ✓ —— ⭐ 而**回退判据仍然是"任何失败"** ✓（源优先 ✓ 镜像回退 ✓），**与 SFZ 程序本身同一套规则** ✓✓。

## ⭐⭐ "在界面里按播放"不是最后一格验证，而是一个**尚未实现的功能**（2026-09-28）

写完端到端判据之后 ✓，我说下一格是"在应用界面里按播放" ✓。**动手前查了一遍** ✓：

```
grep -rnE 'track_id: *"audio"|addAudioLane|importSample' src/components src/views src/features
→ 空 ✗
grep -rln '"audio"' src/data
→ genreMix.ts · sampleCatalogue.ts   （类型与目录，不是数据 ✓）
```

⭐⭐ **结论：应用里没有任何地方能造出一条音频车道** ✗✓ —— **没有 UI ✓、没有导入 ✓、没有任何 genre 的数据里带它** ✗✓。

### ⭐ 所以按播放**碰不到这条路** ✓

⭐ 没有一首歌含 `track_id: "audio"` ✓ → **transport 的音频车道分支永远不会被走到** ✗✓ → ⭐ **按播放只会再次证明"合成音轨还在响"** ✓，而**对采样那条路一无所知** ✗✓。

### 而这是**同一形状的第二次** ✓✓

| 次 | 发现 |
|---|---|
| **第 78 轮** | ⭐ **应用里根本没有那条音频路径** ✗（三个消费者只有测试在调用 ✓） |
| **本轮** | ⭐ **路径建好了、也证明能响了，而产品里没有任何东西能把一条车道放进一首歌** ✗✓ |

⭐ 两次都不是"还差一根线" ✓，**而是"还差一个功能"** ✓✓ —— ⭐ 而**这个区分在本工作流里已经被证明很重要** ✓：**把它当成接线去估，就会在错误的地方找缺口** ✗。

### ⭐ 而现在这条路**已经全部可验证** ✓

| 层 | 判据在哪 |
|---|---|
| 清单 → 目录 → 源优先 → **126 include** → **1676 region** → 采样地址 → **解码出声** | ⭐ **CI 的 `audio` scope**（端到端探针 ✓✓） |
| ⚠️ **一条音频车道进入一首歌**（UI / 导入 / genre 数据） | ❌ **不存在** ✗ —— ⭐ **这是下一个功能，不是下一个验证** ✓ |

⭐ 而它**与业主的决定一致** ✓：**采样支持已经做到"能响且可重复验证"** ✓ —— **把它做成一个用户可触发的功能，是另一个范围内的决定** ✓（**要不要做、什么时候做，由业主** ✓ —— 而**在那之前，"能响"这句话的准确说法是"在 CI 里、由端到端判据证明能响"** ✓✓）。


## VCSL 暴露的模型缺口：一条条目只能是一件乐器（2026-09-29）

准备把 VCSL 的四族（Aerophones、Idiophones、Membranophones、Electrophones，2408.5 MB、2651 个文件、155 个 sfz）写进清单时发现，清单的模型不支持这一件事：

- `sampleAssetsFromManifest` 对每条条目产出一个资产，`assetId` 就是条目的 id；
- 条目里的 `sfz` 是单个字符串，指一个程序文件；
- 所以一条条目等于一件乐器。

VCSL 的四族是一个库，里面有几十件乐器，每件还带 Keyswitch / Staccato / Sustain 之类的变体。写成一条，结果是传了 155 件乐器的字节，而目录里只出现一件，其余的没人能选。这不对。

## 决定：条目可以声明多件乐器

改 `sfz: string` 为 `instruments: { sfz: string; name: string }[]`（保留 `sfz: string` 作为单件乐器的简写，已发布的两条不动）。然后：

- `sampleAssetsFromManifest` 对每件乐器产出一个资产，id 用 `<entry.id>:<乐器序号或名字>`，名字用声明的 `name`；
- 上传器按 `instruments` 里的每个 sfz 校验它在文件列表里，而不是只看一个；
- 可达性核对逐个乐器各验一次，和现在逐条验一样；
- 判据是：一条条目声明三件乐器，目录里就出现三个可选乐器，且各自指向自己的 sfz。

理由是这个模型本来就在描述现实：一个采样库有很多程序文件，用户选的是乐器而不是库。把它压成"一条 = 一件"会让每个多乐器库都要拆成几十条，而拆出来的条目会重复声明同一批文件。

另外这也解释了为什么 VSCO 2 CE 那件事没有可比性：它不能上传的原因是许可，不是模型。


## 一个库里有几十件乐器时，声明哪些（2026-09-29）

VCSL 四族里 155 个 sfz，而它们不是 155 件乐器：文件按奏法分，同一件乐器有 Keyswitch、Staccato、Sustain、SusVib 之类的变体。实测按目录加基名归组（去掉 ` - <奏法>` 后缀）：

```
sfz 总数              155
按基名归组后的乐器数   88
每组留一个后的 sfz 数  88
```

变体最多的是 Harmonica-Hohner-Special20-F（6 个）、Pipe Organ（5 个）、Renaissance Organ（5 个）、Legacy Snares（5 个）。

所以条目里的 `instruments` 声明的规则是：**按目录与基名归组，每组留一个程序，有 `- Keyswitch` 就留它，否则按路径排序取第一个。** Keyswitch 优先是因为这类文件的设计就是用键位切换奏法，它本身覆盖了其余变体；其余变体是同一件乐器的不同奏法，单列出来会让乐器列表变成奏法列表。

88 件乐器仍然不少，但那是这个库的真实结构：它是一件件乐器，不是一件。把它们压成一条会让 87 件无法选择，把它们全部展开会让 155 个奏法各占一行。

同理适用于 Karoryfer 那两个已经镜像的条目：meatbass 的 zip 里有 39 个 sfz，而现在只声明了一个（`Meatbass/Programs/04_pizz.sfz`，拨奏贝斯）。按同一规则重跑会声明出它的乐器列表，而字节已经在桶里，所以那是一件只改清单的事。


## 真库到底长什么样：量出来的答案（2026-09-29）

`Programs/01-basic-kit.sfz`（76 行）里的 `<region>` 是**零个，而这是设计如此**：它是一份路由文档。真实的四层结构是

```
01-basic-kit.sfz      <control>（set_ccN 默认值与标签）+ 三个 <global> + 7 条 #include
  └ mappings/kickmic_basic.sfz        <master>（ampeg_release、tune_cc72、amp_veltrack、locc102）
      └ <group key=$KICK_SNWRONG_KEY> + #include
          └ mappings/kickmic/kick_snoff_map.sfz    16 个 <region>（sample、hivel、seq_length、amp_velcurve_N）
```

键位名来自 `keymaps/default/keymap_basic.sfz`，那是 67 行 `#define $名字 值`。

实测（夹具就是这四份真文件，判据在 `src/test/realLibraryParse.test.ts`）：include 链进得去，那个最底层的文件解出 **16 个 region**，16 个样本路径互不相同。已经能用的东西比预想的多：`<global>`/`<master>`/`<group>`/`<region>` 的作用域继承、头部与 opcode 同行、`#define` 的收集、轮转字段、未知头部跳过而不报错。

## 更正：那"两个缺口"是我量错了（2026-09-29）

上一版这里写着两个缺口——include 要能从库根解析、`$名字` 要代入——**两条都是错的**。`includes.ts` 早就实现了这两件事：`resolveCandidates` 先试包含文件所在目录、再试程序根目录，`substitute` 做 `$VAR` 代入（全局、按顺序）。

错在夹具不全：程序 include 的是 `keymaps/keymap_basic.sfz`，而我只放了名字相近的另一份 `keymaps/default/keymap_basic.sfz`。定义文件不在链上，于是十六个 region 全部留着字面量 `$KICK_SNWRONG_KEY`，而我把这个结果归因给了"解析器不代入"，而不是"我的夹具缺文件"。

补上定义文件与 `mappings/kick_dampen.sfz` 之后，实测是：

```
included: 4  ["keymaps/keymap_basic.sfz", "mappings/kickmic_basic.sfz",
              "mappings/kick_dampen.sfz", "mappings/kickmic/kick_snoff_map.sfz"]
problems: 26    （夹具只有这四份，其余 include 如实报缺）
regions: 16
lokey/hikey: 35/35        ← 变量已代入成音符号
hivel: 31, 63, 95, 127    ← 四个力度层，一层不缺
seq_length: 4             ← 轮转
unresolved: 0
```

`mappings/kick_dampen.sfz` 出现在 `included` 里这件事本身，就是库根回退在工作的证据：那份 include 写在 `mappings/kickmic_basic.sfz` 里，按包含文件所在目录解析会得到 `mappings/mappings/...`，是第二个候选（库根）命中的。

## `<master>` 该不该清空外层 `<global>`：sfizz 判了（2026-09-29）

程序最外层的 `<global>` 给底鼓那组声明了 `locc101=1`、`tune_cc90=1200`、`note_polyphony=3`、`group=501`，而底鼓的 region 一个都没带上——因为被 include 的 `mappings/kickmic_basic.sfz` 打开了自己的 `<master>`，解析器在那里把全局域清空了。它在静止时看不出来（两个 opcode 在默认 CC 下都是空操作），所以一份能用的文件判不了对错。

**判据是 sfizz 在非默认 CC 下的输出。** 做法：一个 440 Hz 的单音样本，`tune_cc90=1200` 是信号源——它在 CC90 从 0 移到 127 时把一个八度的变调加上去（比值 ≈ 2 表示生效，≈ 1 表示那个值已经没了）。同一个音渲染两次，只改 CC90。

```
  tune 写在 region 上                     比值 2.005   ← 正对照，本来就会生效
  global(tune) → master → region          1.988   ← 穿过 master，值活着
  master(tune) → region                   2.005
  global(tune) → global(other) → region   1.000   ← 第二个 global 清掉了第一个
  global(tune) → group → region           2.005
  region 覆盖 global                      1.000
```

结论是一处**不对称**：**`<global>` 重置全局域，`<master>` 累积**。解析器原来两边都重置，于是 `virtuosity_drums` 写在程序文件里的 `locc101` 与 `tune_cc90` 被悄悄丢掉了。

已按实测改成"`<global>` 重置、`<master>` 累积"，`<group>` 与 region 的行为本来就是对的。判据两条：真实的底鼓 region 现在带上了 `locc101=1` 与 `tune_cc90=1200`；以及那条不对称本身（第二个 `<global>` 仍然重置）。

这个实验也回答了 A4 那套机制的用途：它不只是"音符对不对"，它能在**参数一动就错**的地方判定语义。


## `tune_ccN` 的语义：sfizz 判的（2026-09-29）

范围表把 `tune_ccN` 放进来了，但它的语义只能靠问。做法和之前一样：一个 440 Hz 单音，`tune_cc90=1200`，把 CC90 送到不同值，测实际音高。

```
  无 tune_cc90（基准）              +11 音分   ← 过零估计法的偏差
  tune_cc90=1200，CC 未送           +11 音分   ← 即 0，未设的控制器是 0
  tune_cc90=1200 + set_cc90=63.5   +625 音分
  CC 送 63                          +608 音分
  CC 送 95                          +909 音分
  CC 送 127                        +1215 音分
```

结论：**从 0 线性**，偏移 = `span × cc / 127`，**没有中心点**。所以 `virtuosity_drums` 里那句 `set_cc90=63.5` 不是"中立"，而是**默认 +600 音分**；忽略这个 opcode 会让这套鼓在静止时和 sfizz 差一个三全音。

已实现：解析器读文件自己的 `<control>` 默认值，把 `tune_ccN × cc / 127` 加进每个 region 的 `tuneCents`（与固定的 `tune` 相加而不是替换）。`readControlDefaults` 因此搬进 `parse.ts`——解析器是第二个消费者，而门禁那份副本会成为第二处需要同步的东西；`ccGate.ts` 再导出它，调用方照旧。

`tune_curveccN` 仍然忽略。对默认的线性曲线这是精确的，对其他曲线只是近似，这条限制写明而不留白。

## 一次过程失败：CI 红了四十次而没人看（2026-09-29）

`gh run list --workflow=ci.yml` 显示连续四十次失败，全部失败在同一步：bundle budget。本地门禁不构建，看不见它；也没有别的地方在看它。于是"本地门禁通过"被读成了"这样就行"。

改动两条：

1. **预算检查进了发布路径**（`build` 之后、`deploy` 之前）。它原来只在 CI 里，而 CI 的失败并不阻止部署——在"反正会部署"的流程里只做标注的检查是注释，不是门禁。
2. **`npm run ci:status` / `npm run ci:watch`**：推完之后问 CI，退出码就是 CI 的结论。

上限从 223 调到 226 KB，理由与实测写在 `scripts/check_budgets.js` 里，并按这个文件既有的惯例：每次上调都带测量和"是什么长大了"。


## 那个"开放问题"其实是读错了曲线（2026-09-29）

上一版这里记着一个开放问题：底鼓在静止时被推高一个八度，怀疑 sfizz 与 ARIA 对 `tune_ccN` 的处理不同。**不是。答案在 `tune_curveccN` 上，而且用 sfizz 就能量出来。**

`virtuosity_drums` 的每一处调音都写着 `tune_curvecc90=1`／`tune_curvecc72=1`。曲线索引不是装饰，它换的是整条映射：

```
  tune_cc90=1200，不带 curve（或 0）   CC 0 → 0 音分      64 → +600   127 → +1200   从 0 线性
  tune_cc90=1200，tune_curvecc90=1     CC 0 → −1200 音分  64 → 0      127 → +1200   以 64 为中心的双极
```

曲线 1 逐点实测（440 Hz 单音，扣掉约 10 音分的估计偏差）：0 → −1169，32 → −564，64 → +31，96 → +625，112 → +923，127 → +1215。所以它的中立点在 64，而库在 `<control>` 里写的 63.5 正好是"不偏"——标签 "Master tune"、"Kick tune" 说的就是这件事。

**上一版的实现因此是错的**：它忽略曲线、对所有情况套线性规则，于是这套鼓在静止时比 sfizz 高一个八度。现在曲线 1 按双极实现，并且由 sfizz 判定：CC=32 时本项目算 311.98 Hz，sfizz 渲染 312.02 Hz。

其它曲线索引确实存在且形状不同（CC=32 时索引 2 是 +909 音分、索引 4 是 +90），**没有实现**，按线性处理。这条限制写在 `ccTuneCents` 的注释里，而不是留白——本项目镜像的所有库只用这两种形状。

教训与前面几次同类：一个 opcode 的名字不足以说明它的语义，而"我没实现它"和"它不影响结果"是两句不同的话。上一版把后者写进了注释，这一版把它交给了 sfizz。


## `set_ccN` 只在 `<control>` 里有效（2026-09-29）

读取器的范围原本只是"看起来对"，所以用同一个 440 Hz 单音在四种位置各测一次——信号是"发不发声"，因为带 `locc1=64` 的 region 只有在控制器不小于 64 时才会响：

```
  完全不写 set_cc        无声
  <control> set_cc1=127  发声
  <global>  set_cc1=127  无声
  <master>  set_cc1=127  无声
  写在 region 上          无声
```

所以"只认 `<control>`"不是简化，而是参考引擎的行为：写在别处的 `set_ccN` 是空操作，把它当成初值会让 sfizz 判为无声的 region 在这里发声。判据写进 `sfzCcGate.test.ts`，把这条范围规则钉住。

## 乐器分类：清单里声明，代码里推导（2026-09-30）

135 件乐器平铺成一个列表是个问题而不是选择，所以清单的条目多了两个字段，而且**都是声明**：

| 字段 | 是什么 | 为什么在这里 |
| --- | --- | --- |
| `category` | 一件乐器的种类："Acoustic Drums"、"Bass"、"Winds" | 这是人对一个库的判断（Mellotron 算键盘还是自成一类，文件里没有答案），所以由人写、由评审看 |
| `categoryByPath` | 多乐器库里按 **SFZ 路径首段**取分类 | VCSL 的四族不是同一种乐器，而它是一条条目：一个 `category` 会把 88 件乐器归到一个词下，而路径本来就说了每件属于哪一族 |
| `subcategoryFrom` | 第二级从哪儿来：`"path"` 或 `"filename"` | 分类后仍然很长时才需要第二级（业主的要求）。`"path"` 取路径的第二段（VCSL 自己的结构），`"filename"` 取程序文件名里第一个有意义的词（Karoryfer 把奏法写进名字里：`01_arco_modwheel`） |

推导规则只实现一次（`src/data/sampleManifest.ts`），实测结果是：

```
  Bass (39)            → arco:27 pizz:12
  Mallets & Bells (52) → Struck Idiophones:46  Plucked Idiophones:5  Friction Idiophones:1
  Winds (17)           → Edge-blown Aerophones:10  Free Aerophones:4  Reed Aerophones:2  Lip Aerophones:1
  Percussion (18)      → Struck Membranophones:17  Other Membranophones:1
  Guitar (6)           → （无第二级）
```

最后一行是一条规则的结果，而不是省略：**分不出东西的第二级会被丢掉**。吉他库的六个程序都叫 `emily_*`，文件名规则会给它们同一个词——六个一组挂在一个等于库名的词下面，那不是分类，是重复。

分类与资产一起流到目录（`SampleAsset.category` / `.subcategory`），所以**面板与 MCP 读的是同一份答案**：MCP 的 `list_arrangement_instruments` 返回带计数的树（`categories[].subcategories[]`），并可按 `category`、`subcategory` 与 `query` 筛选。

## `loop_mode=one_shot`：鼓点要响完（2026-09-30）

钉住的那套 `virtuosity_drums` 在音区里写了 `loop_mode=one_shot`。我们此前**松键即停**，于是**敲一下鼓就被截断**——这是"能用手弹的鼓"和"听起来坏了的鼓"的区别。

语义是**用 sfizz 实测**得到的，不是从操作码名字推断的：

```
同一个 0.1 秒的音，采样 1 秒：
  loop_mode=one_shot   → 输出 2.091 秒，松键后 0.2–0.6 秒仍有能量（峰值 1978）
  默认（continuous 等） → 输出 0.341 秒，松键后只剩很短的收尾
```

所以 `one_shot` 的含义是**忽略松键**，其余取值保持本项目一直以来的行为。

**微妙的一半，也是为什么这不是"一个地方一个布尔值"**：**掐断仍然会停掉 one-shot 的声音**。`loop_mode` 回答的是松键，`off_by` 回答的是掐断，两者问的不是同一件事——闭镲必须掐断开镲，哪怕开镲是 one-shot。所以松键路径与掐断路径是分开的，两条各有一条判据，还包括"同一个文件里两个音区不一致"的情况，因为**这个行为属于回答了那个音符的音区，而不是属于那个键**。

另外，松键现在会报告**实际停掉了几个声音**——这正是让这个区别从外部可见的东西：one-shot 回答零。
||||||| 6d22cc0
## 真实库用到的操作码：支持到什么程度（2026-09-30）

目标里那句话现在有文件可以回答，而不是靠预测：**"我们支持多少 SFZ"由钉住的那套库决定**。下面是 `virtuosity_drums` 实际用到的操作码，逐条标注状态与理由。**没实现的必须写明为什么**，"暂时没做"不是理由。

| 操作码 | 状态 | 依据 / 理由 |
| --- | --- | --- |
| `sample` `lokey` `hikey` `lovel` `hivel` `pitch_keycenter` `tune` | 已实现 | 选样本、定根音、算比率的公式只写一处；sfizz 判据逐音比对（40/52/60/72） |
| `#include`、`#define`、`$VAR` | 已实现 | 真实库的入口文件里 `<region>` 出现次数为 **0**，全部经 include 与变量展开；Salamander 的变量还出现在**键名**里 |
| `set_ccN` | 已实现 | 仅在 `<control>` 内生效——四处放置法实测得到 |
| `loccN` / `hiccN` | 已实现 | 是**门控**不是调制：区间外的音区不是变轻，而是**不存在**。实测表在 `src/audio/sfz/ccGate.ts` 顶部 |
| `tune_ccN` | 已实现 | 实测线性：0→0、64→+605、127→+1200 音分 |
| `tune_curveccN=1` | 已实现 | **双极**：0→−1200、64→0、127→+1200。忽略它会让整套鼓高一个八度（实测 311.98 对 sfizz 312.02 Hz） |
| `group` / `off_by` | 已实现 | 闭镲掐断开镲；`off_by` 与 `loop_mode` 是**两条不同的规则**（后者管松键、前者管掐断） |
| `loop_mode=one_shot` | 已实现 | 实测：同一 0.1 秒音，one_shot 输出 2.091 秒、默认 0.341 秒。套鼓写的就是它，不实现则敲一下就被截断 |
| `seq_length` / `seq_position` | 已实现 | 轮转选择，判据在解析层 |
| `label_ccN` | 不做 | 它只是给 CC 起个**显示名**，对声音没有任何影响。这是一条按性质排除的项，不是缺口 |
| `width=` / `width_oncc106=` | 不做 | 立体声宽度。我们的声音是单声道源进总线，而宽度是**立体声像**上的控制；要做得先有立体声成像模型，那是另一件事 |
| `amplitude_onccN` | 已实现 | 实测：增益是**线性的** `(CC ÷ 127) × (N ÷ 100)`——CC 32 → −11.9 dB、64 → −5.9 dB（正是 `20·log10(32/127)` 与 `20·log10(64/127)`），`N=50` → −6.0 dB、`N=200` → +6.0 dB。控制器的值取自文件自己的 `<control>` 块（与 `locc/hicc` 门控同一条规则），没设定的控制器就是 0，而实测说 0 就是静音。见下一节 |
| `note_polyphony=N` | 已实现 | 实测：四击同音下不写 → 4.04 个声音的电平，`=1` → 1.01，`=2` → 2.02，`=3` → 3.03，即**限制同名音的并发数**；并且**先响的被保留、新音被拒绝**（力度 127 后接三个 20 时电平停在 0.0831，单独 127 的参考是 0.0811）。见下一节 |
| `off_mode=fast\|normal` | 不做 | 实测：`fast`、`normal`、不写三者在八个小窗口上**读数完全一致**——这个版本里没有可实现的差别。掐断本身是约 50 毫秒的淡出，已实现（原来我们是瞬停，那是咔哒声的来源） |

**结论**：真实库里有声音意义、且我们已经用 sfizz 实测过的部分全部实现；没实现的**两项**（立体声宽度、`off_mode` 的释放形状）——`amplitude_onccN` 与 `note_polyphony` 在本页后文已按 sfizz 实测实现，这一行是它们落地前的旧结论各有明确理由，而且都不是"解析不出来"——`opcodes` 字典把它们原样留着，判断随时可以改。

## `group` / `off_by` 的方向：实测推翻了我们的读法（2026-09-30）

我们原本按"触发者指认受害者"实现：起音时停掉 `off_by` 所指的那一组。**用 sfizz 测量后发现方向是反的。**

测量方法：两个正弦采样，440 Hz 代表"应当被停掉的那个"，1500 Hz 代表"触发掐断的那个"；对渲染结果做**频率选择性**能量测量（不是看包络峰值——两个音叠加时峰值分不出谁在响）。

| SFZ 写法 | 掐断后 440 Hz | 掐断后 1500 Hz | 结论 |
| --- | --- | --- | --- |
| 440 Hz 音区写 `off_by=2`，1500 Hz 音区写 `group=2` | **0.0002**（消失） | 0.0503（在响） | ✅ 被掐断 |
| 1500 Hz 音区写 `off_by=1`，440 Hz 音区写 `group=1` | **0.0502**（还在响） | 0.0503 | ❌ 没有任何东西被掐断 |

**结论：`off_by=N` 写在被停掉的那个音区上，意思是"当 N 组发声时，停掉我"——受害者指认凶手。** 这也正是真实库那条链的读法：`group=42 off_by=41`、`group=41 off_by=40`，每一级掐断前一级。

代码因此改成：起音时 `choke(音区的 group)`，登记时把声音挂在**它的 `off_by`** 之下。**判据也跟着改**——它们此前编码的是错误方向，所以一直是绿的。把错方向放回去，3 条判据会红，改回来 8 条全绿。

**这条值得记下的原因**：它是一个"绿着的错误"。判据、实现、注释三者自洽，只有拿真实引擎去量才暴露。同类问题（`one_shot`、双极曲线）也都是这么发现的——**语义要量，不要读操作码的名字。**

## 掐断的形状，以及 `off_mode` 测不出区别（2026-09-30）

方向修正之后（受害者指认凶手），下一个问题是**掐断是瞬停还是淡出**。同样用频率选择性测量：开镲 440 Hz、闭镲 1500 Hz，掐断发生在 0.2 秒，八个小窗口看 440 Hz 的幅度。

```
off_mode    掐断前    .200   .205   .210   .215   .220   .230   .240   .260
fast       0.0500   0.0088 0.0038 0.0038 0.0037 0.0022 0.0022 0.0007 0.0006
normal     0.0500   0.0088 0.0038 0.0038 0.0037 0.0022 0.0022 0.0007 0.0006
（未写）    0.0500   0.0088 0.0038 0.0038 0.0037 0.0022 0.0022 0.0007 0.0006
```

两件事，都是结论而不是猜测：

1. **掐断是大约 50–60 毫秒的快速淡出**，不是瞬停：0.0500 → 0.0088（头 5 毫秒内就掉了约 15 dB）→ 之后继续衰减，到 0.26 秒约 0.0006（约 1%）。**我们此前是瞬停**，而波形上的一步就是咔哒声——闭镲掐断开镲时最容易被听出来。现在改为在 50 毫秒内线性斜坡到零，**停止时刻排在斜坡之后**（否则等于把刚要求的淡出又切掉）。
2. **`off_mode` 在这个版本里没有任何可测量的区别**：`fast`、`normal`、不写，八个小窗口读数完全一致。所以这个操作码**没有东西可以实现**——不是"暂时没做"，是"量了，没有差别"。这一条与之前表格里写的"我们掐断等价于 fast"并不冲突：真实库写的 `normal` 在这里与 `fast` 同形。

**判据**（`sfzChokeGroups.test.ts`）：掐断必须给某个增益安排**到零**的斜坡；停止时刻必须**晚于**斜坡结束；而**松键不是掐断**——松键不得产生斜坡，否则钢琴每个音都会多出五十毫秒。改回瞬停，两条判据会红。

## `note_polyphony`：上限怎么数，谁被拒绝（2026-09-30）

真实库写了 `note_polyphony=3`，而我们是固定上限 8——**而且旧实现是"截断列表"而不是"拒绝新音"**：列表截到 8 之后，被截掉的声音**还在响**，却已经不在任何列表里，于是松键和掐断都停不掉它。那不是策略差异，是泄漏。

实测（四击同音、`loop_mode=one_shot` 让采样持续，之后用频率选择性读电平）：

```
note_polyphony   四击之后的电平（折合"几个声音"）
不写              4.04
1                 1.01
2                 2.02
3                 3.03
8                 4.04   （只发了四击，没到上限）
```

**上限按 N 精确生效。** 但"上限 N"有两种读法——拒绝新音，还是顶掉最旧的？用**力度**分辨：第一击力度 127、随后三击 20，`note_polyphony=1` 时 0.30–0.40 秒的电平是 **0.0831**，而单独一击的参考值是 **0.0811（力度 127）** 与 **0.0020（力度 20）**。停在响的那一击上 ⇒ **新音被拒绝**，不是替换最旧的。

实现：`cap = 文件的值 ?? 8`；计数只数**仍在发声**的声音（`onended` 之后不再计入——one-shot 的鼓点是自己结束的，没人按键去停一个镲）；达到上限时**直接拒绝新音**并在返回值里说明原因。

**判据**（`sfzNotePolyphony.test.ts`，6 条）：操作码被读到、且 `0` 视为"无上限"（而不是零上限）；达到上限时新音被**拒绝且没有启动任何声音**；上限精确等于文件所写；**已结束的声音不占额度**；文件不写时仍兜底 8；**每个音各算各的**。把旧行为放回去，4 条判据会红。

## `amplitude_onccN`：线性百分比，不是分贝（2026-09-30）

真实库用它做**麦克风比例**（`amplitude_oncc101`、`_oncc103`、`_oncc105`），所以忽略它等于把每一路麦克风都按满电平播出来。

实测（同一个 440 Hz 采样，`loop_mode=one_shot`，在采样稳定段做频率选择性幅度测量，以"无 opcode、CC=127"为 0 dB 基准）：

| 写法 | 实测 | `20·log10(CC/127 × N/100)` |
| --- | --- | --- |
| `amplitude_oncc1=100`，CC=0 | 静音（−88 dB） | −∞ |
| `amplitude_oncc1=100`，CC=32 | −11.9 dB | −12.0 |
| `amplitude_oncc1=100`，CC=64 | −5.9 dB | −6.0 |
| `amplitude_oncc1=100`，CC=127 | 0.0 dB | 0.0 |
| `amplitude_oncc1=50`，CC=127 | −6.0 dB | −6.0 |
| `amplitude_oncc1=200`，CC=127 | +6.0 dB | +6.0 |

**公式成立**：控制器是**线性**缩放（是电平的百分比，不是分贝数），`N` 是在此之上的又一个百分比——所以 `N=100` 意为"不变"。

控制器的值来自**文件自己的 `<control>` 块**，与 `locc/hicc` 门控完全同一条规则：没送过的控制器就是 0，而实测说 0 是静音。多个 `amplitude_onccN` **相乘**，不是取最后一个。

**判据**（`sfzAmplitudeOnCc.test.ts`，7 条）：公式的三点（CC 127/64/32）；`N` 作为百分比（50 与 200）；控制器未设定时为静音；多个控制器相乘；**没有该操作码的音符与从前完全一样**；以及最后一条最重要——**判据读的是声音实际拿到的增益**（`20·log10` 之后的 dB），不是中途算出来的那个数。

## 镜像步骤的两处修复：一条坏掉的路，一个焊死的动作（2026-09-30）

**一、按 SHA 取提交在 GitHub 上已经失效。** 脚本原本用 `git fetch --depth 1 origin <sha>` 把钉住的提交取下来，现在的答案是：

```
fatal: couldn't find remote ref 9f04cf9a7345
```

后果比报错更隐蔽：稀疏检出那条路抛错后**回退到整棵树**，鼓库于是下了 **2.6 GB**——而"只取清单列出的文件"正是那条分支存在的理由（VCSL 整棵树 5.74 GB，本项目要的四个家族是 2.41 GB）。

修法是**按 ref 取、按 SHA 检出**：blobless 取远端默认分支（只有历史，没有文件内容），再检出钉住的提交，blob 按稀疏路径惰性拉取。`--depth 1` 去掉了——正是它让"检出较早的提交"不可能；让这件事便宜的是 **filter**，不是 depth。

**二、测量与上传被焊在一起。** 脚本在检查 `--upload` **之前**就去读桶的大小做预算检查，所以没有 R2 凭据时它一步都不做——而测量就在同一条路的更下方。于是"测一个时长"需要"写桶的权限"。

新增 `--measure`：**取回、哈希、`ffprobe`、写清单，然后停下**。这三件事只需要网络和磁盘。上传仍是需要凭据的独立动作。

**一处更正，因为这条注释的第一版说多了**：它说清单里所有库都没有时长。**五个里有四个有**——`salamander-grand`、`karoryfer-meatbass`、`karoryfer-emilyguitar`、`vcsl` 都标着 `mirroredAt: 2026-09-29`，大部分文件带逐文件时长。缺的是 `virtuosity-drums-basic`：有一个条目级时长，**2078 个文件一个都没测**，也没有 `mirroredAt`——那正是"从未被这个脚本处理过"的样子。所以 `--measure` 不是"有没有数字"的区别，而是"**只有持有桶凭据的人能拿到数字**"与"有网络的人都能拿到"的区别。

### 鼓库补齐之后的实际状态（2026-09-30）

`--measure` 跑完之后，`virtuosity-drums-basic` 的清单是完整的：**2078 个文件全部有 `sha256`**，其中 **1659 个音频文件有实测时长**（0.348–14.530 秒），`mirroredAt: 2026-09-30`。差额 419 个是 `.sfz`、文本与图片——本来就没有时长，这不是缺口。

而它的字节**早就在 CDN 上**：可达性检查自己记录的上传核对是 **1659 个对象 / 442,411,669 字节**，与刚测出的 1659 个音频文件一一对应。`node scripts/check_mirror_reachability.mjs` 对五个库全部 ✅，其中一条就是 `virtuosity-drums/` 的地址。

所以这条记录的意义在于：**清单一度缺的是"每个文件有多长"，不是"字节在不在"**——而缺它的原因不是没人量过，是**测量需要写桶的权限**（见上一节）。

## `set_hdccN`：一架整琴栽在这上面（2026-09-30）

业主的截图：编排的走带区一遍遍打印

```
instrument "salamander-grand" has 161 region(s) and none of them sound at the controller values the file declares
```

**根因**：Salamander 的**每一个**音区都门控在 `locc20=1` / `locc21=1` / `locc22=1`（弦共振、槌噪、踏板噪声——"该控制器 ≥ 1 时发声"），而它把这些控制器抬起来用的是 **`set_hdcc20=0.5`**，也就是**归一化（0–1）**的那种写法。我们只读 `set_ccN`，于是这些控制器看起来"没人设过"，而没人设过就是 0，`0 >= 1` 不成立 → **161 个音区全部被门控掉**。库说的是真话，读的人读漏了。

**修法**：`readControlDefaults` 同时读 `set_hdccN`（按 0–127 折算，因为门控就是在那个域里比较）与 `set_ccN`，**按出现顺序、后者覆盖**；归一化值超出 0–1 时**夹紧**，而不是让它变成 254 去否掉所有 `hicc`。

**用真实文件端到端验证**（拉取镜像上的程序与它 `#include` 的 7 个文件）：

```
展开：包含 7 个文件 · 缺失 0 · 问题 0
控制器默认值：CC20=64 CC21=64 CC22=64
音区 161 · 默认可发声 159
解析 60 号音: ok · rel40.flac
```

修好前是 `0 / 161` 且整件乐器**拒绝解析**。剩下 2 个默认不发声是踏板门控（需要 CC64），那是**正确**行为。

**判据**（`sfzCcGate.test.ts`）：`set_hdcc20=0.5` 读成 64、`=0` 读成 0、`=1` 读成 127；**正是报告里那个组合必须让音区发声**（这条判据就是当初那条报错信息的反面）；归一化为 0 时仍然静音；两种写法**按顺序取后者**；越界值夹紧。

## 管弦乐器的缺口：实测（2026-10-01）

结论：业主点名的十四件管弦乐器里，镜像里只有 timpani 一件，上游 VCSL 里只有 timpani 和 harp 两件。剩下十二件（弦乐四件、铜管四件、木管四件中的 flute/oboe/clarinet/bassoon）在钉住的 VCSL 里一个字节都没有，因此这不是"登记漏了"，是"库没有"。

这一节同时更正两处先前的说法：上一版与工单里写着"笛与簧片的字节已在镜像里、只是没暴露"，实测不成立；`scripts/build_sample_manifest.mjs` 的注释里写着 VCSL 的 `Chordophones` 是"独奏弦乐"，实测也不成立，它是竖琴、钢琴与大键琴。

### 镜像现状（`vcsl` 条目）

复现：`node scripts/build_sample_manifest.mjs vcsl`（只报告，不写清单）。

```
vcsl @ dfcf4a4918771eee884b96ad4493de82ef84daf6
  files 2651 · bytes 2525491354 (2408.5 MB) · .sfz 155 · audio 2488
  limited to: Aerophones, Idiophones, Membranophones, Electrophones
```

按路径第二级统计文件数（清单自身的 `files` 列表）：

| 路径 | 文件 |
|---|---|
| Idiophones/Struck Idiophones | 764 |
| Membranophones/Struck Membranophones | 743 |
| Aerophones/Edge-blown Aerophones | 394 |
| Aerophones/Free Aerophones | 253 |
| Electrophones/TX81Z | 191（另有 4 个 sfz 在族根） |
| Aerophones/Reed Aerophones | 152 |
| Idiophones/Plucked Idiophones | 114 |
| Idiophones/Friction Idiophones | 19 |
| Aerophones/Lip Aerophones | 13 |
| Membranophones/Other Membranophones | 4 |

### 暴露现状

复现：`node scripts/mcp_call.mjs list_arrangement_instruments '{"library":"vcsl"}'`。结果是 88 件，与 `programsFrom` 对同样的 155 个 sfz 的分组逐条相同，只有 67 个 sfz 作为奏法变体被折进这 88 组（Keyswitch 优先）。也就是说没有漏登记：`Winds` 少不是折叠规则吃掉了乐器，而是这个族里本来就只有这些乐器。

按乐器名核对十四件（"字节"一列是对清单里 2651 个文件路径做子串匹配，"暴露"一列是对 88 件乐器的名字与 sfz 路径匹配）：

| 乐器 | 镜像里有字节 | 已暴露 | 上游 VCSL 有 |
|---|---|---|---|
| timpani | 有，250 个文件 | 有：`vcsl:Timpani-1-Keyswitch`、`vcsl:Timpani-2-Keyswitch` | 有 |
| harp | 无 | 无 | 有：`Chordophones/Composite Chordophones/Concert Harp.sfz`、`Folk Harp.sfz` |
| violin / viola / cello / contrabass | 无 | 无 | 无 |
| horn / trumpet / trombone / tuba | 无 | 无 | 无（`Lip Aerophones` 13 个文件，只有 Didgeridoo） |
| flute / oboe / clarinet / bassoon | 无 | 无 | 无（`Edge-blown` 是竖笛、陶笛、管风琴、哨子；`Reed` 是 Saxello 与 Tenor Saxophone） |

判据在 `src/test/orchestralCoverage.test.ts`：声称被服务的乐器必须从钉住的源取回、展开 include、解析出音区，并且解析出的 sample 必须是清单里真实存在的文件；声称缺失的乐器则是强断言——清单里没有任何文件的路径含有那个词。将来某个词出现字节时，这条会红，直到它被移进 `servedBy` 并证明能发声。

### 顺带修掉的一个缺陷：镜像里唯一那件管弦乐器此前发不出声

VCSL 的 sample 路径不加引号且含空格（`sample=Timpani 1/Hit/Timpani1_Hit_v2_rr1_Sum.wav`），而解析器在第一个空格处截断，于是 `Timpani 1/Hit/…` 变成 `Timpani`：一个目录名。音区在、解析 ok，但那个文件不存在。

上一版的做法是把截断报告在音区上，依据是"未加引号的值到空格为止，含空格的名字必须加引号"。用 sfizz 量了这条依据，结果是反的：

```
440 Hz 单音，同样一个音，只改 sample= 的写法
  sample=space dir/tone.wav      峰值 0.0824   有声音
  sample="space dir/tone.wav"    峰值 0.000031 静音
```

sfizz 读空格、拒绝引号，所以"必须加引号"这条建议恰好是唯一不发声的写法。解析器已改为：`sample=` 的值取到行尾，行内后面还有 `名字=` 时取到那里（`sample=space dir/tone.wav pitch_keycenter=60` 两者都读对）。修好之后 `vcsl:Timpani-1-Keyswitch` 的 42 号音解析到 `Timpani 1/Hit/Timpani1_Hit_v4_rr1_Sum.wav`，是清单里真实存在的文件。判据在 `src/test/sfzParse.test.ts`（含一条负对照：把旧规则放回去，5 条判据会红）。

### 补齐剩下的要多少钱

先说结论：弦乐、铜管、木管在 VCSL 里买不到，花多少钱都买不到；只有 harp 能从这个库补，代价是一层力度约 74 MiB。真正有这些乐器的是 VSCO 2 CE。

⚠️ **下面这句原来写的是错的，已保留原文并在此更正**：原文说"VSCO 2 CE 的许可为 CC Sampling Plus 1.0，本项目不再分发它，所以那部分只能是用户自备"。**实测上游自己的 `LICENSE` 是 CC0 1.0 Universal**，可以分发；详细证据见本文最后新增的一节「VSCO 2 CE 已入库（2026-10-01）」。本节后面所有"本仓库不能分发的库"的措辞都按此更正理解。

VCSL 上游钉住提交的完整树元数据（GitHub trees API，未下载任何音频）：

```
sgossner/VCSL @ dfcf4a4918771eee884b96ad4493de82ef84daf6
  Aerophones      812 files   793.0 MB
  Chordophones   1802 files  3462.0 MB
  Electrophones   195 files   128.3 MB
  Idiophones      897 files   878.8 MB
  Membranophones  747 files   608.3 MB
Chordophones 的两个子树：
  Composite Chordophones   163 files   237.9 MB   Concert Harp, Folk Harp, Strumstick
  Zithers                 1639 files  3224.1 MB   Dan Tranh、3 架三角钢琴、2 架立式钢琴、5 架大键琴、Psaltery
```

`Chordophones` 里没有任何一件弓弦乐器，所以给 `paths` 加它只会多出竖琴与键盘。竖琴按"每个乐器一层力度"估：

| 乐器 | 整个程序 | 一层力度 |
|---|---|---|
| Concert Harp | 45 个采样，73.1 MiB | `_f1` 22 个文件 40.6 MiB；`_mf1` 18 个 26.5 MiB |
| Folk Harp | 58 个采样，79.3 MiB | `v2` 29 个 33.5 MiB；`v3` 29 个 45.8 MiB |

两件各取较轻的一层，连 sfz 正文（15 KB）合计约 74 MiB，而 `Chordophones/Composite Chordophones` 整个前缀是 237.9 MiB（多出来的主要是 Strumstick）。

其余十二件只能换库。VSCO 2 CE（`schollz/VSCO-2-CE`，`SFZ` 分支，钉住 `6dd651d55dde97fd4028699be9d4481f26917891`，3273 个文件、3088.1 MiB、75 个 sfz）全都有。按"每个乐器每个键至少一个采样"（业主要的是先让每件乐器出声，再谈表情）从钉住的树元数据加那 75 个 sfz 正文算出：

| 乐器 | 一层（每个音区一个采样） | 持续音程序全部 |
|---|---|---|
| violin | 20.7 MiB | 43.8 MiB |
| viola | 29.9 | 68.4 |
| cello | 28.1 | 69.2 |
| contrabass | 19.8 | 45.7 |
| horn | 13.5 | 48.3 |
| trumpet | 13.3 | 38.7 |
| trombone | 11.5 | 57.4 |
| tuba | 7.1 | 29.8 |
| flute | 18.1 | 24.0 |
| oboe | 10.8 | 22.9 |
| clarinet | 17.0 | 56.6 |
| bassoon | 12.9 | 28.3 |
| harp | 33.7 | 33.7 |
| timpani | 3.5 | 34.4 |
| 合计 | 240.0 MiB | 601.2 MiB |

去掉已经能拿到的 harp 与 timpani，剩下十二件是一层约 202.8 MiB，或持续音程序全部约 533.1 MiB。这组数字只是树的元数据与 sfz 正文，音频一个字节都没下。

一句话：在只允许分发 CC0 的前提下，VCSL 只能再给一件（harp，约 74 MiB 一层）；其余十二件在 VCSL 里不存在，必须换库。而这个"换库"在 2026-10-01 已经发生：**VSCO 2 CE 的许可实测是 CC0，十四件全部按下面这一节入了镜像。**

---

## ⭐⭐⭐ VSCO 2 CE 已入库（2026-10-01）：十四件管弦乐器第一次全部能响

### ① 许可证：CC0，来自上游自己的文件（这是整件事唯一可能被叫停的地方）

上一节把 VSCO 2 CE 记为 **"CC Sampling Plus 1.0，本项目不能分发"**，业主指出这是错的。**实测业主是对的**，原记录已在上文更正。证据是上游钉住提交自己带的文件，逐条如下：

| 位置 | 原文 / 结果 |
|---|---|
| `https://github.com/schollz/VSCO-2-CE/blob/6dd651d55dde97fd4028699be9d4481f26917891/LICENSE`（同 `raw.githubusercontent.com/schollz/VSCO-2-CE/6dd651d55dde97fd4028699be9d4481f26917891/LICENSE`） | 第一行 **`CC0 1.0 Universal`**，正文是完整的 CC0 法律文本（`Statement of Purpose` … `http://creativecommons.org/publicdomain/zero/1.0/`）。`sha256 = 36ffd9dc085d529a7e60e1276d73ae5a030b020313e6c5408593a6ae2af39673`，6555 字节 |
| `https://api.github.com/repos/schollz/VSCO-2-CE` 与上游 `https://api.github.com/repos/sgossner/VSCO-2-CE` | 两个仓库的 `license` 都是 `{"key": "cc0-1.0", "spdx_id": "CC0-1.0"}` |
| `Readme.txt`（同一仓库，master 与 `SFZ` 分支根目录） | `You are permitted to use these samples for ANY purpose. We ask that you do not sell the samples directly` —— **是请求，不是许可限制**，所以按 CC0 分发，并按该请求致谢 |

`schollz/VSCO-2-CE` 是 `sgossner/VSCO-2-CE` 的 fork，`SFZ` 分支在 fork 上（`master` 没有 `.sfz`）。README 的 "Planned, not yet included" 一行已移到 "Redistributed by this project"，理由与证据写在那一行下面。

### ② 镜像了什么、怎么镜像的：走现有管线，没有手工搬字节

**决定：每件乐器取它的"持续音"程序（14 个），该程序声明的采样全部镜像。** 为什么不是"每件一层力度"，见 ④。

复现（两步都是仓库自带脚本，未改一行上传逻辑）：

```
node scripts/build_sample_manifest.mjs vsco2ce            # 只报告，不写清单
node scripts/build_sample_manifest.mjs vsco2ce --write    # 枚举 372 个文件进清单
TMPDIR=/var/tmp node scripts/upload_samples.mjs vsco2ce --upload   # 量时长、算 sha256、rclone 上传
```

`paths` 列的是 14 个采样目录 + 14 个 sfz 正文 + `LICENSE`/`README.md`/`Readme.txt`/`How To Install.txt`，于是 `sparse-checkout` 只 fetch 这些，GitHub trees API 也只枚举这些（`.git` 与另外 61 个程序一个字节都没下）：

```
vsco2ce @ 6dd651d55dde97fd4028699be9d4481f26917891
  files 372 · bytes 675102035 (643.8 MB) · .sfz 14 · audio 354
  limited to: Strings/Violin Section/susVib, Strings/Viola Section/susvib, Strings/Cello Section/susvib,
              Strings/Solo Contrabass/SusVib, Brass/F Horn/sus, Brass/Trumpet/sus, Brass/Tenor Trombone/sus,
              Brass/Tuba/sus, Woodwinds/Flute/susvib, Woodwinds/Oboe/Vib, Woodwinds/Clarinet/susLong,
              Woodwinds/Bassoon/sus, Strings/Harp, Percussion/Timpani, <14 个 sfz>, LICENSE, README.md, Readme.txt, How To Install.txt
```

| 请求的词 | 暴露名 | assetId | 程序 | MiB |
|---|---|---|---|---|
| violin | Violin Section, sustained | `vsco2ce:ViolinEnsSusVib` | `ViolinEnsSusVib.sfz` | 43.8 |
| viola | Viola Section, sustained | `vsco2ce:ViolaEnsSusVib` | `ViolaEnsSusVib.sfz` | 68.4 |
| cello | Cello Section, sustained | `vsco2ce:CelloEnsSusVib` | `CelloEnsSusVib.sfz` | 69.2 |
| contrabass | Solo Contrabass, sustained | `vsco2ce:ContrabassSusVB` | `ContrabassSusVB.sfz` | 45.7 |
| horn | Horn in F, sustained | `vsco2ce:FHornSus` | `FHornSus.sfz` | 48.3 |
| trumpet | Trumpet, sustained | `vsco2ce:TrumpetSus` | `TrumpetSus.sfz` | 38.7 |
| trombone | Tenor Trombone, sustained | `vsco2ce:TromboneSus` | `TromboneSus.sfz` | 57.4 |
| tuba | Tuba, sustained | `vsco2ce:TubaSus` | `TubaSus.sfz` | 29.8 |
| flute | Flute, sustained | `vsco2ce:FluteSusVib` | `FluteSusVib.sfz` | 24.0 |
| oboe | Oboe, sustained | `vsco2ce:OboeSusVib` | `OboeSusVib.sfz` | 22.9 |
| clarinet | Clarinet, sustained | `vsco2ce:ClarinetSus` | `ClarinetSus.sfz` | 56.6 |
| bassoon | Bassoon, sustained | `vsco2ce:BassoonSus` | `BassoonSus.sfz` | 33.6 |
| harp | Harp | `vsco2ce:Harp` | `Harp.sfz` | 33.7 |
| timpani | Timpani | `vsco2ce:Timpani` | `Timpani.sfz` | 71.7 |
| | | | **合计** | **643.8** |

`durationSeconds = 29.458163`（ffprobe 量出来的最长采样），372 个文件全部带 sha256，354 个音频全部带时长。R2 用量：上传前 3.85 GB，计划 643.8 MB，`4.48 GB of 12.00 GB`，上限 12 GB。

### ③ 顺带修掉的一个缺陷：SFZ 的反斜杠分隔符

VSCO 的 75 个 sfz **全部**用 Windows 分隔符写 `default_path`，例如 `ViolinEnsSusVib.sfz` 的 `default_path=Strings\Violin Section\susVib\`。原来的 `resolveSamplePath` 只在末尾补 `/`，于是拼出来是

```
Strings\Violin Section\susVib\/VlnEns_susVib_A2_v1.wav      ← 左边反斜杠，中间两个分隔符
```

不是报错，是每个采样 404 —— 整个库一件都不响。SFZ 规范里 `/` 与 `\` 都是分隔符，所以 `src/audio/sfz/defaultPath.ts` 现在按规范读：两半都归一成 `/`，再去掉重复分隔符。判据在 `src/test/sfzDefaultPath.test.ts`（含真实字符串 `Strings\Violin Section\susVib\` 那一条）。

### ④ 为什么镜像了**所有**力度层，而不是"每件一层"（一处与工单估算的出入）

工单里的估算是"每件一层力度约 240 MiB"，并说"先让每件乐器出声"。**量了之后这个做法不成立**：那 14 个程序一共声明了 1–8 层力度（`lovel`/`hivel`），而 `playbackForNote` 的默认力度是 **100**。只镜像"最响那一层"的结果是：

* 力度 100 以上响，力度 40 的同一个音解析到一个**没有上传的文件** → 404 → 静音；
* 也就是说"能响"只在默认力度下成立，用户一弹轻音就出现"少音"，而且不会报错。

所以采用的门槛改成"**该程序声明的每个音区、每个力度层的采样都在镜像里**"，代价是 643.8 MiB 而不是约 252 MiB（实测"最响一层"是 252.3 MiB，工单估的 240.0 MiB 与我的差在 viola：工单按 29.9 MiB 算，我量到 38.5 MiB）。判据 `src/test/orchestralCoverage.test.ts` 对每个程序在力度 1/32/64/96/127 上各解析一遍，任何一个解析出的文件不在清单里就红——这正是"每件一层"会踩的那个坑。

### ⑤ 还缺什么

* **表情（articulation）没有**：镜像的是 14 个"持续音"程序。同一批乐器还有拨弦（`*Pizz`）、断奏（`*Stac`/`*Spic`）、震音（`*Trem`）、弱音器（`FHornMute`、`Trumpet*Mute*`）以及把上述合成一个键位的 `*-KS` 程序——VSCO 一共 75 个 sfz，入了 14 个。
* **其余 61 个程序整族未入**：管风琴、立式钢琴、`Upright Nr1`、马林巴、钟琴、木琴、管钟、短笛、`GM-StylePerc`、VSCO 1 打击乐（drums/varMetal/varWood）、`Miscellania Raw`。这些不是这次点名的十四件。
* **VCSL 的 `Chordophones`（竖琴与键盘）仍然没镜像**，现在也不必了：harp 由 VSCO 的 `Strings/Harp` 提供。
* **timpani 多镜像了 10 个文件（37.4 MiB）**：`Percussion/Timpani` 整个目录里有 `Timpani.sfz` 没引用、但 `TimpaniRolls.sfz` 引用的滚奏采样。目录是天然前缀，留着比精确剔除更不容易错；`TimpaniRolls.sfz` 本身没入。

### ⑥ 表情程序值不值得镜像：量出来的数字（2026-10-01）

**每件乐器加一个表情程序 = 162.7 MiB**（12 件；`Harp` 与 `Timpani` 在 VSCO 里**没有**表情程序）。相对于已镜像的持续音集 **643.8 MiB**，这是 **+25%**，存储量级几乎不变。

| 乐器 | 表情程序 | 采样 | MiB |
| --- | --- | ---: | ---: |
| Cello Section | `CelloEnsPizz`（pizzT） | 52 | 33.2 |
| Contrabass | `ContrabassPizz` | 40 | 19.8 |
| F Horn | `FHornMute` | 17 | 19.3 |
| Trumpet | `TrumpetHarmonMuteSus` | 16 | 17.6 |
| Viola Section | `ViolaEnsPizz` | 46 | 14.3 |
| Trombone | `TromboneStac` | 55 | 12.5 |
| Flute / Tuba | `FluteStac` / `TubaStac` | 48 / 64 | 9.7 / 8.9 |
| Violin Section | `ViolinEnsPizz` | 44 | 8.6 |
| Oboe / Clarinet / Bassoon | `*Stac` | 51 / 64 / 46 | 6.8 / 6.4 / 5.5 |

**怎么量的**（复现方法，不下载任何音频）：查 GitHub 树元数据拿 3273 个 blob 的体积表 → 75 个 `.sfz` 全在**仓库根目录** → 按同族前缀配对（`CelloEnsSusVib` 已镜像 ⇒ 同族的 `CelloEnsPizz`）→ 取该 sfz 的 `default_path` → 把 `sample=` 引用的每一个采样按 `default_path + 路径` 去体积表里求和。

**⚠️ 一处必须先纠正我自己**：我第一次量的结果是"约 383 MiB"，**那是错的，高估了 2.4 倍**。两个原因都值得记：它累加的是"整个表情**目录**"而不是一个程序；并且它用子串匹配乐器名，把 **`Solo Violin` 与 `Violin Section` 混同**了——在 VSCO 里这是两件不同的乐器。**按程序实际引用的采样求和**才得到上表的 162.7 MiB。

**顺带，同一个坑第三次出现**：测量脚本连错三次，而最后一次的错法与整个项目此前修过的两个缺陷**是同一个**——`default_path` 与 `sample=` 一样，**未加引号且含空格时必须在行尾结束**（`default_path=Strings\Violin Section\Pizz\`）。按空白截断会得到 `Strings/Violin`，于是 12 件里有 6 件的采样全部"找不到"。这条规则在 `src/audio/sfz/parse.ts` 里已经被 sfizz 实测钉过一次（见 ④ 与 `sfzDefaultPath.test.ts`），这里再钉一次的原因是：**它不只出现在解析器里，也出现在每一次临时测量里**。

**决定**：按既定次序（先让每件乐器都能出声，再谈表现力），表情属于下一阶段，**本轮不下载**。现在有了精确成本，是否推进只取决于业主对"+25% 存储换 pizz/staccato/tremolo/弱音器"的判断。

> ⭐ **业主已决定（2026-10-01）：镜像。** 本节的 162.7 MiB 因此从估算变成实际支出，执行与核对见下一节。

---

## ⭐⭐⭐⭐ VSCO 2 CE 的表情已入库（2026-10-01）：十二件乐器第一次会拨弦、断奏、弱音

业主的决定是**镜像**（"决定 VSCO 表情是否镜像: 镜像"）。§⑥ 量出的是 **162.7 MiB / 12 个程序**，实际搬进镜像的是 **163.0 MiB**，差 **0.3 MiB**，差值有据：清单按**目录前缀**取文件，而 `Brass/Tenor Trombone/stac/` 里有一个 `TromboneStac.sfz` 没引用的文件（276 676 字节），加上 12 个 sfz 正文（63 396 字节）。

### ① 镜像了什么、怎么镜像的：同一条管线，没有手工搬字节

复现（两步都是仓库自带脚本，upload 一步与持续音集 §② 完全相同，未改一行上传逻辑）：

```
node scripts/build_sample_manifest.mjs vsco2ce --write
TMPDIR=/var/tmp node scripts/upload_samples.mjs vsco2ce --upload
```

`paths` 新增 **12 个采样目录 + 12 个 sfz 正文**，`instruments` 新增 **12 条手写名字**（按 §② 里"重新枚举不得静默改掉已声明的名字"那条规则保留：`CelloEnsPizz.sfz` → "Cello Section, pizzicato"，而不是退回文件名）。

| 乐器 | 表情程序 | 解析出的采样 | 引用字节 MiB |
| --- | --- | ---: | ---: |
| Cello Section | `CelloEnsPizz` | 52 | 33.2 |
| Contrabass | `ContrabassPizz` | 40 | 19.8 |
| F Horn | `FHornMute` | 17 | 19.3 |
| Trumpet | `TrumpetHarmonMuteSus` | 16 | 17.6 |
| Viola Section | `ViolaEnsPizz` | 46 | 14.3 |
| Trombone | `TromboneStac` | 55 | 12.5 |
| Flute | `FluteStac` | 48 | 9.7 |
| Tuba | `TubaStac` | 64 | 8.9 |
| Violin Section | `ViolinEnsPizz` | 44 | 8.6 |
| Oboe | `OboeStac` | 51 | 6.8 |
| Clarinet | `ClarinetStac` | 64 | 6.4 |
| Bassoon | `BassoonStac` | 46 | 5.5 |
| | | **543** | **162.7** |

⭐ **上表逐行重算过，与 §⑥ 完全一致**（量法：用仓库自己的 `parseSfz` + `readDefaultPath` + `resolveSamplePath`，而不是临时正则；`sample=` 与 `default_path` 的未加引号含空格规则因此不会再被踩第三次）。

清单层面的实际读数（`node scripts/build_sample_manifest.mjs vsco2ce`，只报告）：

```
vsco2ce @ 6dd651d55dde97fd4028699be9d4481f26917891
  files 928 · bytes 846035313 (806.8 MB) · .sfz 26 · audio 898
```

| | 文件 | 字节 |
| --- | ---: | ---: |
| 持续音集（§②） | 372 | 675 102 035 |
| 本次表情 | **556**（544 音频 + 12 sfz） | **170 933 278** |
| 合计 | 928 | 846 035 313 |

⭐ **+163.0 MiB，是持续音集的 +25.3%**（§⑥ 估的 +25% 由此兑现）。928 个文件全部由 `upload_samples.mjs` 重新量过：**928 个 sha256、898 个 `durationSeconds`**；最长采样仍是 `29.458163 s`（表情采样都比它短，所以条目级时长不变）。

### ② 为什么只取"每件一件"，而不是"这些乐器的全部表情"：量的数字

工单允许"若取全部同样容易，就把代价说出来"。量了：把上面 12 件乐器在 VSCO 里的**全部程序**（含 `*Spic`、`*Trem`、`*Vib`、`*SusNV`、`*-KS` 键位切换）按各自 `default_path` 解析后取并集，是 **1 378 个采样 / 1 178.7 MiB**；比"每件一件"的 543 个文件 / 162.7 MiB **多出 835 个文件 / 1 016.1 MiB**——**是本轮实际搬运的 163.0 MiB 的 6.2 倍**，不是"差不多"，所以按工单的默认选择只取每件一件。

> ⚠️ `*-KS` 程序（`ViolinEns-KS` 等 8 个）**每个文件里有 2–5 个 `default_path`**——键位切换的每一段用一个。仓库的 `readDefaultPath` 只返回**第一个**（它的消费者是加载器，按文件级语义设计的），所以对 `-KS` 直接测量会把 Trem/Spic/Pizz 段的采样解析到 susVib 目录下、全部"找不到"。上面的并集因此**排除了 8 个 `-KS` 程序**（它们引用的正是各自独立程序引用过的同一批采样），这个排除不影响字节数，但**加载器真要支持 `-KS` 键位切换，得先按 `<control>` 分段读 `default_path`** —— 记在这里，是缺口不是结论。

### ③ 一处更正：Timpani 不是"没有表情程序"

§⑥ 的表头写着"`Harp` 与 `Timpani` 在 VSCO 里**没有**表情程序"。**实测对 Harp 成立，对 Timpani 不成立**：钉住的树里还有 `TimpaniRolls.sfz`（1 336 字节，`default_path=Percussion\Timpani\Rolls\`），而它引用的 **10 个滚奏采样（37.4 MiB）早就在镜像里**——§⑤ 说过，`Percussion/Timpani` 整个目录是作为持续音集的前缀被取走的，目录里"没被 `Timpani.sfz` 引用"的那 10 个文件正属于 `TimpaniRolls.sfz`。所以诚实的说法是：**镜像里 timpani 的滚奏字节已经在，缺的只是那个程序文件本身**；本轮按"每件一件"的十二件清单执行，**没有**把 `TimpaniRolls.sfz` 入库，`Harp` 则确实连第二个程序都没有。判据因此写在**声明的程序文件**上（不是采样字节上），哪天有人把 `TimpaniRolls.sfz` 入库，`orchestralCoverage.test.ts` 会红并要求把它登记进 roster。

### ④ R2 核对（与 §② 同法：对象数与总字节，对远程读，不信上传器的自述）

```
rclone size :s3:groove          --json   →  {"count":7242,"bytes":4984997091,"sizeless":0}
rclone size :s3:groove/vsco2ce  --json   →  {"count":928,"bytes":846035313,"sizeless":0}
```

⭐ `vsco2ce` 前缀 **928 个对象 / 846 035 313 字节**，与清单的 928 / 846 035 313 **逐字节闭合**；上传前桶是 4 814 063 813 字节（脚本报的 4.48 GB），本次增量 = **170 933 278 字节**，正是上表的表情集。另取两个**新增**对象的可达性与内容（不是只数数）：

```
GET https://r2mirror.groove.wangda.today/vsco2ce/ViolinEnsPizz.sfz                          → 200 · 5069 字节 · sha256 与清单相符
GET https://r2mirror.groove.wangda.today/vsco2ce/Strings/Violin Section/Pizz/VlnEns_Pizz_A2_v1_rr1.wav → 200 · 220926 字节 · 与清单相符
```

### ⑤ 还没镜像的

* **同一批乐器的其余表情**：上面 ② 的 835 个文件 / 1 016.1 MiB（`*Spic`、`*Trem`、`*Vib`、`*SusNV`、8 个 `*-KS`、`SViolin*`、`ContrabassSusVB-Quiet` 等）。
* **`TimpaniRolls.sfz`**：1 336 字节的程序文件；它的 10 个采样（37.4 MiB）已在镜像里（见 ③）。
* **其余程序整族仍未入**：上游 75 个 sfz，入库 26 个，**还剩 49 个**——管风琴、立式钢琴（`UprightPiano`、`VSUpright1`）、马林巴、钟琴、木琴、管钟、短笛、`GM-StylePerc`、VSCO 1 打击乐、`Miscellania Raw`、`Solo Violin` 一族。这些不是这次点名的十四件，也没有被任何判据声称服务。
* **`needs` 新增两项**：表情程序用了 `lorand` / `hirand`（把一层力度随机劈成两半），**解析器不读它们**，因此两个半层里总是第一个被选中——乐器仍然发声，但它不是 VSCO 写这段时的随机行为。已写进 `vsco2ce` 的 `needs`，是"支持到什么程度"那张表的一条新缺口，不是静默通过。
||||||| parent of 4fcaed4 (fix(sfz): read default_path per <control> section, not per file)
## `default_path` 属于 `<control>` 段，不属于文件（2026-10-01）

⑤ 里说八个 `*-KS` 程序"不在镜像里"，当时的原因不是成本，而是一个解析器缺陷：**`readDefaultPath` 按文件读一个值，取的是文件里第一条声明**。键位程序把几套奏法折进同一个文件，**每套奏法各自开一个 `<control>` 段并声明自己的 `default_path`**，所以同一个文件指向好几个采样目录，而旧实现给每个 region 都用了第一个。

### 语义：顺序状态，从声明处向后生效

`default_path` 是**顺序状态**：从它所在的那一行起生效，下一个 `<control>` 段替换它，中间夹着的 `<group>`/`<global>` 不会重置它。所以一个 region 适用的路径，是写入它时在生效的那一条。

**这是量出来的，不是从 opcode 名字读出来的**，量法是拿钉住的上游文件本身对账：`schollz/VSCO-2-CE@6dd651d55dde97fd4028699be9d4481f26917891` 的 75 个程序共 3163 个 region，其中八个 `-KS` 程序各声明 2、4 或 5 条路径。按"每段自己的路径"解析，八个程序的 region 无一例外都指向上游确实存在的文件；按"文件第一条路径"解析，每个程序里有 64 到 131 个 region 指向**不存在的文件**：

| 程序 | 路径条数 | region | 各段自己的路径：存在/缺失 | 文件第一条路径：存在/缺失 |
| --- | ---: | ---: | --- | --- |
| `CelloEns-KS` | 4（susvib/trem/spic/pizzT） | 156 | 156 / 0 | 27 / **129** |
| `Contrabass-KS` | 5 | 152 | 152 / 0 | 28 / **124** |
| `SViolin-KS` | 4 | 161 | 161 / 0 | 30 / **131** |
| `ViolaEns-KS` | 4 | 144 | 144 / 0 | 26 / **118** |
| `ViolinEns-KS` | 4 | 131 | 131 / 0 | 22 / **109** |
| `Clarinet-KS` | 2 | 97 | 97 / 0 | 33 / **64** |
| `Tuba-KS` | 2 | 87 | 87 / 0 | 23 / **64** |
| `Flute-KS` | 4 | 94 | 94 / 0 | 19 / **75** |

（八件合计 1022 个 region；"存在/缺失"是拿 `sample=` 按该路径拼出来的字符串，去钉住那棵树的 3273 个 blob 里查。另外 `FHorn-KS.sfz` **不存在**——VSCO 的 75 个程序里带 `-KS` 的就是这八个。）

另有两条旁证：

* 这些 `-KS` 文件**就是**对应单奏法程序的拼接：`Clarinet-KS.sfz` 的 97 个采样名与 `ClarinetSus.sfz` + `ClarinetStac.sfz` 的并集逐个相同，`CelloEns-KS` 与它的四件单奏法程序同理（`SViolin-KS` 对应 `SViolinVib`，不是 `SViolinSusVib`——这个名字不存在）。拼接时唯一被加回去的信息就是每段前面那条 `default_path`：单奏法文件里路径写在程序旁边，折进一个文件后就必须按段声明。
* **`sfizz_render` 判不了这件事，因为它根本不认 `default_path`。** 实测：令 `<control>` 声明 `default_path=tone/`、把文件只放在 `tone/` 里，渲染峰值是 **1**（静音）；把同一个文件放在程序旁边再渲染，峰值是 **2700**。也就是说参考引擎把 `default_path` 当无效 opcode，采样一律相对程序解析。这一点必须写下来：这些键位程序的作者是 ARIA 一系的引擎，本项目要"贴文件意图"，依据只能是文件本身，不能拿 sfizz 当裁判。

### 改了什么

* `SfzRegion` 新增 `defaultPath`：写入该 region 时适用的那一条，在读到 region 那一行时就捕获（与 `inherited` 同一个理由——事后读一个文件级的值，就是把同一个答案给所有 region）。优先顺序是 region 自己的 opcode、它所在 `<global>`/`<group>` 的（老文件把声明写在这里）、最后是当时生效的 `<control>`。`<control>` 块现在在解析循环里被认作顺序状态，块内每一行都参与，不再被当作"不认识的头"整块跳过。
* `SfzRegion` 新增 `defaultPathProblem`：文件里确实声明了路径，但某个 region 写在第一条声明**之前**——此时它适用哪条是**不可知**的，既不是后来的那条，也不是没有。这种情况按问题上报（带 region 序号与采样名），不猜；loader 遇到它会拒绝加载而不是解析到一个错的目录。
* `readDefaultPath` **删除**。它就是这个项目一直在清理的"第二处缓存同一个事实"，而且两处对同一个文件给出的答案不同：一处按段，一处按文件。`src/audio/sampleLoader.ts` 现在用解析结果里 region 自己的 `defaultPath`；`orchestralCoverage.test.ts` 也改成从解析结果取，而不是再读一遍文件。
* `resolveInstrumentNote` 把 `defaultPath`（以及不可知时的 `defaultPathProblem`）随笔记一起带出来——和 choke group 一样，只有解析器知道是哪个 region 应了这一个音，路径也是那个 region 的属性。**应了这个音的那个 region 若路径不可知，解析本身就返回失败**（带 region 与采样名），`loadNote` 再拒绝一次：两层都挡，因为错了就是解析到一个不存在的目录、静音且无声可查。
* 判据在 `src/test/sfzKeyswitchPaths.test.ts`：合成文件（两条 `<control>`、两条不同的 `default_path`、采样名用上游真名）逐段解析；单路径文件行为不变（含 `<global>` 声明与写在 region 行上的声明两种老写法）；不可知的那种必须报出 region 与采样名，且 loader 拒绝加载而不是猜一个目录。**对旧实现必然红的那一条**是 `trem` 段的断言：旧实现给它的路径是 `Strings\Cello Section\susvib\`，与期望的 `trem\` 不等。同文件里还有一条对钉住上游的判据：八个 `-KS` 程序的每个音、每层力度都解析一遍，全部必须落在上游树里真有的文件上。

### 现在能测什么，量到什么

能测了。八个 `-KS` 程序的每一个 region 现在都解析到一个上游确实存在的文件。抽 `CelloEns-KS.sfz` 量：

* 156 个 region 解析出 **156 个互不相同的文件**，分在四个目录：`susvib` 27、`trem` 25、`spic` 52、`pizzT` 52。旧实现给全部 156 个都拼 `susvib` 目录，其中 129 个文件不存在。
* 与**现有镜像**对账：镜像里这个库共 372 个文件，其中 **27 个**正好是 `susvib` 那一段（它和已镜像的 `CelloEnsSusVib.sfz` 共用采样），另外 **129 个不在镜像里**。所以这八个程序现在**测得准、载不动**——不是解析问题，是镜像里没有它们的字节。

### 还不知道什么

* **键位选择本身没实现。** `sw_last`/`sw_lokey`/`sw_hikey`/`sw_default` 只是被当作普通 opcode 保留：`sw_default=c2` 不会让 `c2` 选中"持续音"那一段，`regionsForNote` 也不看它们。所以在同一音区折叠了多套奏法的 `-KS` 文件里，**同一音高会同时命中每套奏法**，实际响的是文件顺序里的第一条。这是下一步的事，且它有自己的测量问题（`sw_default` 与"没送过键位"的关系、`sw_last` 的默认值、`sw_previous`），本轮没有碰；上面的合成判据因此把两段的音区与力度层错开，只测 `default_path`。
* **不可知那种情况只按"声明在该 region 之后"判定。** 声明若来自 include 进来的文件，判定发生在 `expandRemoteIncludes` 拼好的文本上，与加载看到的一致；但 `<control>` 里的 `default_path` 是否在 include 边界上重置，没有量过——上游 75 个程序都没有这种写法，所以没有实现。
* **没有镜像任何新东西。** 八个 `-KS` 程序要进镜像，代价是它们引用的全部采样（1022 个 region 指向的文件，含与已镜像 `susvib`/`sus` 段重叠的部分），这与 ⑥ 那份"表情程序 = 162.7 MiB"是**不同的账**（那份只是 12 件各加一个单奏法程序），需要单独量、单独决定。

