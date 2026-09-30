# 谱面与 MusicXML：决定与理由

业主的要求（2026-09-30）：Logic 那样的 MIDI 轨道显示与 **Score** 界面我们都需要，去找可复用的开源代码学习或改造，并把 **MusicXML 的导入导出**一起考虑。

调研报告在 [`research/staff-notation-and-musicxml-survey.md`](research/staff-notation-and-musicxml-survey.md)：里面每一行**都是本机实测**（esbuild 打包后 gzip），许可证是从仓库的 `LICENSE`／`package.json` 里读的，不是凭记忆写的。

## 决定

| 事项 | 选择 | 为什么 |
| --- | --- | --- |
| 谱面显示 | **VexFlow 5**，懒加载，字体自托管 | 唯一一个**能从我们自己的模型直接画**的库（`StaveNote`／`Voice`／`Beam`），不必为了显示而绕一圈 MusicXML。MIT。core 单独打包 **89 KB gzip**，在 150 KB 单块上限之内 |
| 字体 | 把 Bravura 的 woff2 **自托管**并设 `Font.HOST_URL` | 默认从 CDN 取字体（源码注释里就标了 GDPR 相关的顾虑），而且内嵌 base64 会把块从 89 KB 撑到 378 KB。体积门只量 `.js`／`.wasm`，字体资产不占预算 |
| MusicXML 写 | **自己写**（`src/data/musicxml.ts`，已完成） | 导出是产品的关键路径，而且它只是 XML 生成：规范清楚、判据能独立验证。少一个 0.x、单人维护的依赖 |
| MusicXML 读 | 自己写，基于 **`fast-xml-parser`**（MIT，活跃） | 同理。边界保持薄、可替换，将来若保真度要求变高再换实现 |
| 不采用 | Verovio、OSMD、alphaTab、`musicxml-interfaces` | 见下 |

## 明确不选的理由

- **Verovio**：LGPL-3.0-or-later（copyleft），且 `verovio-toolkit-wasm.js` 单独就 **2 283 KB gzip**——远超单块 150 KB 上限。两条都足以否决。
- **OpenSheetMusicDisplay**：许可证没问题（BSD-3），但它**把 VexFlow 锁在 1.2.93 并给 VexFlow 打补丁**（`prebuildVexflow` 直接覆盖 `node_modules/vexflow/src/`），因此无法与 VexFlow 5 共存；它也只读不写 MusicXML。它更适合当**判据的对照实现**，不适合当依赖。
- **alphaTab**：MPL-2.0（文件级 copyleft），**不能导出 MusicXML**（只有 `AlphaTexExporter` 与 `Gp7Exporter`），且运行时需要 306 KB 的 Bravura woff2。
- **`musicxml-interfaces`**：AGPL-3.0，直接排除。

## 自己写 MusicXML 的第一个成果

`src/data/musicxml.ts` 已经能写出 **`score-partwise` 4.0** 文档，判据用 **jsdom 自带的 XML 解析器读回**（不是比字符串），10 条全过。四个决定写在代码里：

1. **跨小节的音符在小节线处切开并加连音线**——MusicXML 无法表达跨小节的单个音符，写成六拍的东西在每个阅读器里都是乱的。
2. **空隙写成休止符**——记谱里没有"洞"，小节缺的部分就是休止符，而且长度要与空隙完全相等。
3. **`divisions` 是每四分音符的计数**（这里取 4，与编排的十六分网格一致），所有时值都是它的整数倍，因此不会因取整丢位置。
4. **同一时刻的音写成和弦**（`<chord/>`），因为一条轨道就是一个声部。

**暂不写、而不是悄悄近似的**：力度到力度记号、奏法、连音线（slur）、三连音、C 大调以外的调号、多于一个声部。每一项都是真功能，将来都会是真实的改动；一个声称有却没有的文件，比一个老实写着 C 大调的文件更糟。

## 我们无论如何都要自己实现的部分

时值→记号（含附点与连音线链）、**符杠规则**、跨小节连音、**等音拼写**（MIDI→step/alter，这是"合法但音乐上错误"的最大风险）、调号与临时记号状态、休止符、谱面换行与分页、三连音的 `time-modification`、从 MusicXML 回来的有损导入，以及谱面与卷帘之间的选中同步。

**VexFlow 负责一个谱表与一个声部的排布，不负责系统换行与分页**——"大谱表加小节号"是几百行的事，"看起来像 MuseScore"是一个项目，这一点在动工前就写清楚。

## 已知的未验证项（照调研报告）

1. MuseScore／Sibelius／Dorico／Logic 各自对 MusicXML 4.0 的接受度——没有读到厂商发布说明，**必须用真实导出实测**。
2. 厂商公布的"必需元素"清单不存在；报告里那份清单是从规范推导的。
3. OSMD 的 327 KB 里是否内联了 VexFlow 1.2.93。
4. Verovio 的 npm 产物究竟受 GPL 还是 LGPL 约束。
5. `webmscore`（MuseScore 的 WASM 版）未评估——若保真度成为硬要求，值得回头看。
