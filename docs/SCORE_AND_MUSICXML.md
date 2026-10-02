# 谱面与 MusicXML：决定与理由

业主的要求（2026-09-30）：Logic 那样的 MIDI 轨道显示与 **Score** 界面我们都需要，去找可复用的开源代码学习或改造，并把 **MusicXML 的导入导出**一起考虑。

调研报告在 [`research/staff-notation-and-musicxml-survey.md`](research/staff-notation-and-musicxml-survey.md)：里面每一行**都是本机实测**（esbuild 打包后 gzip），许可证是从仓库的 `LICENSE`／`package.json` 里读的，不是凭记忆写的。

## 决定

| 事项 | 选择 | 为什么 |
| --- | --- | --- |
| 谱面显示 | **VexFlow 5**，懒加载，字体自托管 | 唯一一个**能从我们自己的模型直接画**的库（`StaveNote`／`Voice`／`Beam`），不必为了显示而绕一圈 MusicXML。MIT。core 单独打包 **89 KB gzip**，在 150 KB 单块上限之内 |
| 字体 | 把 Bravura 的 woff2 **自托管**并设 `Font.HOST_URL` | 默认从 CDN 取字体（源码注释里就标了 GDPR 相关的顾虑），而且内嵌 base64 会把块从 89 KB 撑到 378 KB。体积门只量 `.js`／`.wasm`，字体资产不占预算 |
| MusicXML 写 | **自己写**（`src/data/musicxml.ts`，已完成） | 导出是产品的关键路径，而且它只是 XML 生成：规范清楚、判据能独立验证。少一个 0.x、单人维护的依赖 |
| MusicXML 读 | 自己写，基于 **`saxes`**（ISC，活跃） | 同理。边界保持薄、可替换，将来若保真度要求变高再换实现 |
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

## 导入的深度（2026-09-30，第二轮）

上一轮把读的一侧做成了"单声部、能读回来"。这一轮把它扩到真实文件的样子，判据在 `src/test/musicXmlImport.test.ts`（25 条）；写的一侧只改了两处必须一起改的地方，判据在 `src/test/musicXmlExport.test.ts`（13 条）；读取器脚下的 `src/data/xml.ts` 另有 10 条。**下面每一条都用一条判据证明过，没有一条是"应该可以"。**

**读到了什么。**

- **多声部（part）全读**。`fromMusicXml` 一直返回 `parts`，只是没人用它读多个；现在一个两声部的文件回来是两条带名字、各自音符的 part。MCP 一侧的 `import_arrangement_musicxml` 加了 `partIndex`，取数字是"第几个"，取 `"all"` 是"每个 part 一条轨道"，**不传就是第一个**——旧的调用一个字都不用改。用联合类型而不是"再给一个 `allParts: true`"：`partIndex: 3` 加 `allParts: true` 是"第三个还是全部"这种没有答案的状态，联合类型让它写不出来。返回值多了 `trackIds`：调用方接下来要往刚导入的轨道写音符，得知道它叫什么。
- **文件说的速度与拍号**。`tempoBpm` 读 `<direction><metronome><per-minute>`，没有它再读 `<sound tempo>`（播放跟的是后者）；`beatsPerMeasure`／`beatType` 是第一个拍号。文件没说就不报，不替它编一个数。中途变拍号会写成一条 `problems`——**只报第一个拍号是缺陷**，所以它被说出来而不是藏起来。
- **压缩的 `.mxl`**。这是真的读，不是识别后拒绝：zip 由 `fflate`（MIT，无依赖）解开，`META-INF/container.xml` 指哪个文件就读哪个，不是"取第一个 xml"；`mimetype` 说的不是 MusicXML 就拒绝并重复它声明的内容。判据里的 zip 是**测试自己构造的真实 zip**（`fflate.zipSync`），而且和 `check:mcp` 里那个是同一个构造器，不是签入的二进制也不是第二份实现。
- **更宽的真实文件形状**：`<part-name>` 写在 `<score-part>` 之前（第一版的选择器在这种拼法下把每个 part 都叫 "Part 1"）、`<attributes>` 出现在小节中间（拍号在它生效的地方写，那里不一定是小节头）、没有 `<type>` 的音符（时值以 `<duration>` 为准）、`<duration>0</duration>` 的装饰音、`<voice>`／`<staff>` 编号、`<forward>` 出现在声部内部。这些都在测试里手工构造并跑过。

**为此改的两处写的一侧（和读的一侧必须一起改）。**

`<voice>` 是**身份**，不是每小节一个槽位：后面小节用 `<backup>` 把光标倒回该小节开头，声部号是阅读器画出来的线。原来的写法在整首曲子里挑"第一个空出来的声部"，于是声部可以在两小节之间**倒退**——四个音符重叠的一小节里它连写了两个 `<backup>`，光标落到 −16 divisions，那不是能给人读的文档。改成按小节分配后又出现相反的问题：一个声部的连音还在穿过小节线，另一个音就占用了这个号，两条独立的线挤进同一个 `<voice>`。现在的规则是：一个声部只有在"它上一个音**在这一小节开始前**已经结束，或者在这一小节里、在这个音开始前结束"时才可复用；`<tied>` 跨过小节线的那些音把声部占住。判据走文档的光标，要求每个声部都正好在小节线结束，并把同样的音符再读回来一次。

**每个声部都要补休止符，不只是第一个声部**——一个只是从上一小节接着延音线的声部在本小节没有自己的事件，少了它的休止符，这个声部的记谱就不满一小节。这是上面那条光标判据找出来的。

**明确不做的，以及为什么。**

- **三连音、slur、力度、奏法、C 大调以外的调号**：和上一轮一样，一个声称有却没有的文件比一个老实说没有的更糟。导入遇到时按写出来的时值读，并在 `problems` 里说明。
- **`<part-name>` 之外的 part 元数据**（乐器、谱号、移调乐器）：模型里没有对应的地方，读进来只会被丢掉。移调乐器尤其是"合法但音乐上错误"的来源，宁可现在不碰。
- **一个 part 里多个谱表（`<staves>`）的语义**：`<staff>` 编号被忽略，音符按文档顺序与光标定位。这与模型（一条轨道一个声部）一致；把大谱表拆成两条轨道是另一个决定。
- **时间签名变化的完整列表**：只报第一个，变化本身写成 `problems`。要报全部就得给模型加"节拍地图"，那是另一件事。
- **zip64**：`.mxl` 用不到；真遇到会由 `fflate` 报错而不是猜。

## 读的一侧不再依赖浏览器（2026-09-30，同轮）

**这一条修的是一个已经发出去的坏工具。** `import_arrangement_musicxml` 从加上那天起就不可用：它走到的读取器用 `new DOMParser()`，而 **Node 没有 `DOMParser`**，所以真实 MCP 客户端拿到的是 `{"raw":"DOMParser is not defined"}`。单元判据跑在 `jsdom` 里，那里有 `DOMParser`；全部门禁里没有任何一处**按客户端的方式调用过这个工具**，所以它坏了很久没人看见。一个这样回答的工具，比一个不存在的工具更糟。

修法是让读取器**与环境无关**：`src/data/xml.ts` 用 `saxes`（ISC，一个依赖 `xmlchars`，MIT）解析，提供读取器真正用到的那一小块 DOM——元素名、文本、属性，以及四种选择器写法（`a`、`a b`、`a > b`、逗号并集）。压缩包改用 `fflate`（MIT，无依赖），于是 `node:zlib` 也不再需要。**两个依赖都只为这一件事引入**，浏览器包不受影响：这些模块只被 MCP 一侧引入，`npm run build` 的产物里既没有 `score-partwise` 也没有 `inflateRawSync`。

`src/test/xml.test.ts` 的判据是**两个环境必须给出同样的答案**：同一份文档、同一组选择器，交给 `jsdom` 的 `DOMParser` 和这个读取器，逐项比对（元素、文本、属性、并集的顺序）。这是这个模块唯一能自证的命题。

`scripts/check_mcp.mjs` 现在**真的调用** `import_arrangement_musicxml` 和 `import_arrangement_musicxml_file`（多声部与 `.mxl` 各一条），这就是"服务器自己环境里也能用"的证据。同一个门禁里，需要 Chromium 的工具（`render_audio`、`render_song`、`render_preview_clip`、`analyze_audio`）仍然只断言声明与 schema，不启动浏览器；文件系统由已经真实调用的 `export_groove`／`import_groove` 覆盖。

## 我们无论如何都要自己实现的部分

时值→记号（含附点与连音线链）、**符杠规则**、跨小节连音、**等音拼写**（MIDI→step/alter，这是"合法但音乐上错误"的最大风险）、调号与临时记号状态、休止符、谱面换行与分页、三连音的 `time-modification`、从 MusicXML 回来的有损导入，以及谱面与卷帘之间的选中同步。

**VexFlow 负责一个谱表与一个声部的排布，不负责系统换行与分页**——"大谱表加小节号"是几百行的事，"看起来像 MuseScore"是一个项目，这一点在动工前就写清楚。

## 已知的未验证项（照调研报告）

1. MuseScore／Sibelius／Dorico／Logic 各自对 MusicXML 4.0 的接受度——没有读到厂商发布说明，**必须用真实导出实测**。
2. 厂商公布的"必需元素"清单不存在；报告里那份清单是从规范推导的。
3. OSMD 的 327 KB 里是否内联了 VexFlow 1.2.93。
4. Verovio 的 npm 产物究竟受 GPL 还是 LGPL 约束。
5. `webmscore`（MuseScore 的 WASM 版）未评估——若保真度成为硬要求，值得回头看。
