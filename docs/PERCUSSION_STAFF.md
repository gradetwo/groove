# 鼓谱小节末尾那个字形：**它是第二声部（鼓族）最后一个音自己的符头**

**问题（原话）**：真 VexFlow dump 显示鼓谱第一小节末尾 x≈414 有一个 `U+E0A4` 字形；有音高谱表在同一位置有同一个字节（是那条轨最后一个音的符头），而鼓谱那个位置**看起来**没有任何音符（该小节最后一个音在 x≈388）。

**结论**：那个字形**是第二声部自己的最后一个音**——鼓族（kick／snare／表外的回落音）的**实音符头**，它**应该在那儿**。所以**没有为了它改动任何绘图代码**。原判"那个位置没有任何音符"是**只看了第一声部（镲族）那一行**得到的：镲族的最后一个音确实在它前面约 26 px。

**⚠️ 但量它的时候，在同一条尾巴上量出了另一件事**（第 4 节）：那个音（以及整个镲／鼓两声部）的**符干方向被库翻反了**——这**已修**，而修的不是那个字形。

本文记录的是**实测**：真 `vexflow/core`（组件里那一条代码路径），同一个音数组，鼓谱按声部分开 dump，有音高谱表作对照。

## 一、复现（真库、真路径、逐声部）

**音数组**（这就是被报告的那一小节的形状——镲在每一条八分上，军鼓在小节最后一个十六分）：

```
42@0  42@0.5  42@1  42@1.5  42@2  42@2.5  42@3  42@3.5      ← hi-hat（voice 1）
36@0                                                        ← kick（voice 2）
38@3.75                                                     ← snare（voice 2，小节最后一个十六分）
```

`ScoreV2` 的鼓谱只画一条五线谱、两个声部；`planPercussionMeasure` 把 `42` 放进声部 1、`36`／`38` 放进声部 2（表见 `percussionStaff.ts` 的 `PERCUSSION_VOICES`）。

### 鼓谱（每声部单独 dump，格式与组件一致：一次 `format`，两声部 `joinVoices`）

| 声部 | 计划里的音符 | 页面上的音符头 | 页面上的休止 |
| --- | --- | --- | --- |
| **voice 1**（镲族，stem 向上） | 8 个 `g/5/x2` | `U+E0A9` ×8：x=17, 71, 124, 178, 231, 285, 338, **392** | `U+E4E7` ×8：x=44, 97, 151, 204, 258, 312, 365, 419 |
| **voice 2**（鼓族，stem 向下） | `f/4` @0、`c/5` @3.75 | `U+E0A4` @ x=17（kick）、**`U+E0A4` @ x=419（snare）** | `U+E4E5` @44, 151, 258；`U+E4E6` @365 |

* **计划里的键 = 10；页面上的音符头 = 10**（8 个 x 符头 ＋ 2 个实心符头）；休止符头数也逐条相等。**没有多出来的音符头。**
* 整个小节最后一个**音符头**是 **x=419 的 `U+E0A4`**——它就是 voice 2 的军鼓，`c/5`。
* voice 1 的最后一个音符头在 x=392；两者相差 **27 px**（浏览器里同样量到 26 px：421 vs 447）。报告里的 388／414 与这里的 392／419 是**同一个形状**：**末尾那个 `U+E0A4`、以及它前面约 26–27 px 处另一声部的最后一个头**。

### 有音高谱表（同一数组，作对照）

| 谱表 | 字节序列 |
| --- | --- |
| treble | 一个全休止 `U+E4E3`（十个音**全部低于** `ScoreV2` 的 `SPLIT_PITCH`=60） |
| bass | `U+E0A4` ×10，最后一个在 x=420，键是 `d/2`——**就是 38 号那个音** |

**⭐ 同一个模型音（38）在两边被画成同一个字节**：鼓谱里它是 `c/5`（军鼓的位置），有音高谱表里它是 `d/2`（把 38 当音高拼出来）。两边的符头都是普通实心符头，所以都是 `U+E0A4`。报告看到"同一个字节、同一个位置"不是巧合，也不是同一份谱被读了两次——**是那个音被两种读法各画了一次**。

### 在真浏览器里跑真组件（Bravura 字体已加载）

同一个音数组，`ScoreV2` 以 `kind="drumkit"` 和不传 `kind` 各挂一次（真组件、真字体、真 `Font.load`）：

```
drum    : U+E0A9 ×8（末位 x=421）｜ U+E0A4 @66(kick)  U+E0A4 @447(snare)   ← 末尾那个字节
pitched : treble 全休止 ｜ bass U+E0A4 ×10（末位 x=420，'d/2'）
```

浏览器里的绝对 x 与上面的 jsdom dump 差一个常数（左边缘／字体度量），但**末尾那个字节是 voice 2 的军鼓**这一点两边一致，且**与报告描述的 26 px 间距完全同形**。

## 二、那个码位的来源：**自有代码 ＋ 库的符头表**，不是库自己补的

`U+E0A4` 是 **`Glyphs.noteheadBlack`**（SMuFL 的实心符头）。它出现在页面上的唯一途径是 **`StaveNote` 自己的 `NoteHead`**，而 `NoteHead` 的码位来自 VexFlow 的 `Tables.codeNoteHead`：

| 输入（键的第三段） | `codeNoteHead` 的答案 | 本表里是谁 |
| --- | --- | --- |
| 无（`f/4`、`c/5`） | `noteheadBlack` = **`U+E0A4`** | 36 kick、38 snare，**以及表外音的回落 `c/5`** |
| `X2`（`g/5/x2`、`a/5/x2`） | `noteheadXBlack` = `U+E0A9` | 42 hi-hat、82 shaker |

⇒ **鼓谱里出现 `U+E0A4` 只可能是鼓族（voice 2）的符头**，绝不可能是一个镲，也绝不可能是一个休止：

* `StaveNote.isRest()` 的定义是**符头码位落在 `U+E4E0`–`U+E4FF`**（SMuFL 的休止区间）——休止永远走不到 `U+E0A4`；
* 而 `U+E0A4` 这一支只由**没有第三段的键**拿到，也就是 `PERCUSSION_VOICES` 里 `notehead` 为空的那两行（36、38），以及回落。

### 三种可能，逐一排除

1. **"真音符头但没有对应的音"** ✗ —— 不成立：页面上的音符头数（10）与计划里的键数（10）**逐条相等**，其中 8 个在 voice 1、2 个在 voice 2；末尾那个 `U+E0A4` 就是 voice 2 计划里的最后一个键 `c/5`（`getAbsoluteX()` 与页面上的 x 相等，判据钉住了这一点）。
2. **"它是正确的——两个声部里其中一支的最后一个音本来就落在那里"** ✅ —— **就是这一条**：末尾那个字形是 **voice 2（鼓族）的最后一个音**（军鼓 @3.75），只是它在**另一行**上；报告把 voice 1（镲族）最后的 x=392 当成了"小节的最后一个音"。
3. **"VexFlow 在单谱表多声部下的已知表现（补隐形音符头对齐）"** ✗ —— 不成立，出处是库源码：
   * VexFlow 5.0.0 里**唯一**一处 `new NoteHead(...)` 在 `StaveNote.buildNoteHeads()` 内；库不会给别人没给它的音符补符头，也没有第二个地方能画出符头；
   * 库确实有一个"对齐用的空音符"——`GhostNote`——但它的 `draw()` **只画注解（annotations），不画任何符头**；判据里真的构造并画了一个 `GhostNote`，页面上的字形**一个都没增加**；
   * 所以页面上任何一个字形，都是**本应用要求画的**那一个 `StaveNote`。

## 三、判据（`src/test/percussionStaffGlyphs.test.ts`，4 条，真 `vexflow/core`）

| 判据 | 钉住的东西 |
| --- | --- |
| `is a U+E0A4 notehead, and it is voice 2's own last note` | voice 1 的音符头**全是** `U+E0A9`、末位 x = 该声部最后一个音的 `getAbsoluteX()`；voice 2 的音符头**全是** `U+E0A4`、末位 = 军鼓 `c/5`；**全小节最靠后的音符头是那个 `U+E0A4`，且它在 voice 1 的最后一个音符头之后** |
| `accounts for every glyph on the page: …` | 每个声部：音符头数 == 计划里非休止键数，休止字形数 == 计划里休止条数；整小节 10 个头（8 个 x ＋ 2 个实心）；鼓谱上只有一个 `U+E069` 打击乐谱号，没有 treble／bass 谱号 |
| `traces the byte to the table and to the library, …` | `StaveNote.getGlyphProps("16","n").codeHead === U+E0A4`、`("16","x2") === U+E0A9`（这是库自己的公有入口）；表里带 `x2` 的正是 42／82，不带的正是 36／38；**每个表行的键在真库里画出来就是那一行的 `notehead`**；`GhostNote` 画完页面上字形不变 |
| `draws the same byte for the same model note on the pitched stave …` | 反向：有音高谱表逐项不变——treble 是全休止，bass 是 10 个音、末位是 38、键 `d/2`、**10 个符头全是 `U+E0A4`** |

## 四、⭐ 同一条尾巴上的第二件事：符干方向被 `Beam.generateBeams` 覆盖——**已修**

**这不是那个字形的成因**（符干不产生符头），但它在同一个尾巴上，**也是 `f361711` 一并带进来的**，而且它同时解释了业主看到的那张图。

`ScoreV2.tsx` 的鼓谱这一支给每个音显式设了 `stemDirection`（镲向上 `1`、鼓向下 `-1`，见 `PERCUSSION_VOICE_ORDER`），随后在 `format` 之后调用：

```
Beam.generateBeams(beamable)                       // 改前：ScoreV2.tsx，鼓谱支
```

而 `Beam.generateBeams(notes, config = {})` 在 **既没有 `maintainStemDirections`、也没有 `config.stemDirection`** 时，会走 `calculateStemDirection(group)`（把组内每个键的 `line - 3` 求和，`>= 0` 就取 **DOWN**），再 `applyStemDirection(...)` → `note.setStemDirection(direction)`——**把我们显式设的声部符干覆盖掉**。

### 改前／改后读数（真 `ScoreV2` 组件 ＋ 真 `vexflow/core`，同一小节）

读数取自 `StaveNote.prototype.setStemDirection`：构造时设一次、`Beam.applyStemDirection` 再设一次，格式记为 `加梁前 → 加梁后`。

```
改前（config 拿掉）                 改后（maintainStemDirections: true）
voice 1 g/5/x2 @x392 [1→-1]        voice 1 g/5/x2 @x392 [1→1]
voice 2 f/4    @x17  [-1→1]        voice 2 f/4    @x17  [-1→-1]
        c/5    @x419 [-1→1]                c/5    @x419 [-1→-1]
末尾那个 x 符头（beat 3.5 的 hat）：1→-1   末尾那个 x 符头：1→1
```

⇒ 改前：镲族（写在高音区）被翻成**向下**、鼓族（写在低音区）被翻成**向上**，两声部的符干正好写在对方那一侧，**与 `percussionStaff.ts` 里"镲向上、鼓向下"的声明相反**——也正是被报告那张图里末尾那个 x 符头带向下符干、还挂了十六分尾的来源。改后：每个音留下的符干就是表给的那一个。

### 处置

* **改法**（`ScoreV2.tsx`，**只动鼓谱支**）：`Beam.generateBeams(beamable, PERCUSSION_BEAM_OPTIONS)`，其中
  `export const PERCUSSION_BEAM_OPTIONS = { maintainStemDirections: true } as const`——库于是保留每个音当前的符干（即表给的那个方向）。
* **有音高谱表一字不动**：那条支仍然调用 `Beam.generateBeams(beamable)`；它的音**没有**显式 `stemDirection`，由库选方向在那里正是想要的。
* ⭐ **补上盲区判据**（`src/test/percussionStems.test.tsx`，驱动**真组件**＋真库＋真加梁）：
  1. 鼓谱：用 `setStemDirection` 上的探针读**加梁之后**的末值——每个镲族音必须 `+1`、每个鼓族音必须 `-1`（含 beat 3.5 那个 x 符头）；
  2. 反向：有音高谱表的音仍由库决定——一个高音加梁组会被库翻成 `-1`；若把鼓谱的选项漏过去，它会停在构造默认的 `+1` ⇒ 变红。
* **两条判据都验证过"能红"**：`PERCUSSION_BEAM_OPTIONS` 清空 ⇒ 判据 1 红（`g/5/x2: expected -1 to be 1`）；把该选项漏到有音高谱表支 ⇒ 判据 2 红（`c/6: expected 1 to be -1`）。
* 现有判据 `percussionStaff.test.ts` 的 "with the stems the table asks for" 保留原样：它管的是"表给了什么"（加梁前），新判据管"画出来是什么"（加梁后）。

## 五、复现方法

* 判据即复现：`npx vitest run src/test/percussionStaffGlyphs.test.ts`（字形，真库逐声部 dump）与 `npx vitest run src/test/percussionStems.test.tsx`（符干，驱动真组件；jsdom 缺 `FontFace` 与 `document.fonts`，文件里那对最小替身就是组件 `Font.load` 真正需要的全部）；
* 浏览器版：一个挂两次 `ScoreV2`（`kind="drumkit"` 与不传）的最小页面，`Font.load` 之后读 `svg text` 的 `x` 与码位；上面的表就是这么量出来的；
* 老的那张证据页（`evidence-drum-score.html`，未跟踪、已删除）**无法复原**，所以这里用的是**重新推导出的同形小节**：绝对 x 随页面宽度与两条谱表各自的 tickable 数变化，本文件复现的是**形状**（末尾一个 `U+E0A4`，它前面约 26–27 px 是另一声部的最后一个头）与**归属**，不是字面上的 388／414。

**相关图**：`docs/screenshots/percussion-staff-drum-kit.png`（打击乐谱面本体）、`docs/screenshots/percussion-staff-app-score.png`（应用里 Score 页）。
