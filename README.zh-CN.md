# Groove Lab

一个完全在浏览器里运行的律动工作站与曲风资料库。内置 159 种曲风，每种都有一份简短的制作说明
和一段可播放、可编辑的 8 轨模板。

**在线体验：<https://groove.wangda.today/>** · [English](README.md)

## 快速开始

**环境要求** —— Node.js **22.22.2 或更高**（`^22.22.2 || ^24.15.0 || >=26.0.0`，见 `package.json` 的
`engines` 与 `.nvmrc`）；`.npmrc` 设了 `engine-strict`，所以 `npm ci` 在版本不符时会**直接拒绝并给出一句
清楚的提示**，而不是抛一堆失败。Node **只用于构建**：运行应用只需要浏览器 —— 无后端、无数据库、无需 API key。

```bash
npm install          # 只需一次
npm run dev          # http://localhost:3000
```

```bash
npm run build        # 静态产物在 dist/
npm run preview      # 本地预览该产物
```

质量门：`npm test`（Vitest）与 `npm run verify`（改动必须过的门）。端到端测试首次需要装浏览器：
`npx playwright install --with-deps chromium firefox webkit`。

<p align="center">
  <img src="docs/screenshots/pc-studio.jpg" alt="工作台：8 轨步进音序器，左侧是该曲风的中英双语制作说明" width="880">
</p>

## 六套皮肤

桌面端是一台完整的工作站，也是唯一的一套界面：那套为拇指单独设计的手机外壳已经砍掉，所以手机浏览器
拿到的就是这套界面。六套皮肤换装的就是它，而桌面端的色板由六份皮肤色板生成
（`scripts/desktop_skins.mjs`）。在 **设置 → 界面 → 外观** 里切换：

| | | |
|---|---|---|
| <img src="docs/screenshots/skin-default.jpg" width="150"><br>**极光冷色**<br>冷调深底，每模块一个强调色 | <img src="docs/screenshots/skin-minimal.jpg" width="150"><br>**现代极简主义**<br>纸白底、Inter、发丝细线 | <img src="docs/screenshots/skin-comic.jpg" width="150"><br>**复古漫画**<br>新闻纸、网点、套印偏移 |
| <img src="docs/screenshots/skin-soviet.jpg" width="150"><br>**苏联重工业**<br>冲压钢板、铆钉、信号灯 | <img src="docs/screenshots/skin-sovietYears.jpg" width="150"><br>**苏联岁月**<br>构成主义宣传画、国旗红、硬投影 | <img src="docs/screenshots/skin-pixel.jpg" width="150"><br>**8-bit 像素**<br>扫描线、阶梯边框、像素字体 |

## 更多截图

| | |
|---|---|
| <img src="docs/screenshots/pc-galaxy.jpg" width="420"><br>**曲风星系** —— 把资料库摊成一张 3D 星图 | <img src="docs/screenshots/pc-chords.jpg" width="420"><br>**和弦工坊** —— 进行、声位与试听 |
| <img src="docs/screenshots/pc-masterclass.jpg" width="420"><br>**大师课** —— 律动解构与实时碰撞器 | |

## 里面有什么

- **159 种曲风** —— house、techno、hip-hop、trap、bebop、cumbia、afrobeat 等等，每种都配中英双语
  制作说明（配器、曲式、律动、和弦走向、代表音乐人）和一段可播放的模板。
- **音序器** —— 8 轨，16 到 128 步（1 到 8 小节），支持力度、连击（ratchet）、概率、参数锁、
  摇摆（swing）、歌曲模式与 A/B 段落槽。
- **钢琴卷帘** —— 逐轨编辑音符、和弦进行、量化、连奏、力度塑形，以及**只播放这一条轨道**的单独试听。
- **声音以合成为主，采样乐器按需下载。** 鼓、贝斯、pad、主音都由 Web Audio 的振荡器与缓冲区实时生成，
  包括建模鼓组（TR-808、TR-909、原声、赛博波表），这些不需要网络。采样的钢琴与管弦乐音色库会按乐器
  从项目的采样镜像下载，用到它们的曲风需要联网。
- **导出** —— WAV 母带、**MP3（192 kbps）**、分轨 ZIP、标准 MIDI，以及 Ableton Live `.als` 工程文件。
  MP3 编码器只在你点「导出 MP3」时才加载（单独一个约 67 KB gzip 的分块），不用它的人不付这份代价；
  它是 LGPL 授权，许可证随应用一起发布（[public/THIRD_PARTY_NOTICES.md](public/THIRD_PARTY_NOTICES.md)）。
  一段编曲也可以
  直接生成分享链接。
- **工作台之外** —— 3D 曲风星系、A/B 对比试听、盲听听力训练。
- **中英双语界面**，可作为 PWA 安装到桌面或手机主屏。

## 环境要求

开发需要 **Node.js 22.22.2 或更新版本**（见 `package.json` 的 `engines` 与 `.nvmrc`）。应用本身只需要
一个浏览器：没有后端、没有数据库、不需要任何 API key。

版本要求来自一个依赖：单测用的 DOM 环境 `jsdom` 30 内置了 `undici` 8，后者会调用
`worker_threads.markAsUncloneable`——这个导出在 Node 20 里不存在，于是 jsdom 环境根本建立不起来，
每个测试文件都在跑第一条用例之前就报错。`npm ci` 现在会在不支持的 Node 上直接拒绝安装
（`.npmrc` 开了 `engine-strict`），把那 190 条莫名其妙的未处理错误换成一句清楚的提示。

## 跑起来

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build        # 产物在 dist/
npm run preview      # 本地预览构建结果
```

## 测试

```bash
npm test             # 单元与组件测试（Vitest）
npm run verify       # 一次改动必须通过的门禁
npm run test:e2e:all # 完整的桌面端 Playwright 矩阵（三个引擎）
```

`npm run verify` 会依次检查版本与文档一致性、分层依赖、CSS 用法、类型、lint、数据 schema、
测试、生产构建、七个实测探针（`probe:boot`、`probe:toolbar`、`probe:grid-gutter`、
`probe:arrangement`、`probe:live-arrangement`、`probe:continuity`、`probe:skins`）和端到端矩阵。
端到端测试需要先装一次浏览器：`npx playwright install --with-deps chromium firefox webkit`。

## 部署

构建产物是纯静态文件，任何静态托管都可以。本仓库用 `npm run deploy` 部署到 Cloudflare
Workers，步骤见 [DEPLOY.md](DEPLOY.md)。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/audio/` | Web Audio 引擎、鼓机与合成器模型、离线渲染与导出 |
| `src/data/` | 159 种曲风定义、预设与乐理表 |
| `src/features/` | 音序器状态、编辑操作、撤销历史 |
| `src/components/`、`src/views/` | 工作台、音序器、星系、对比、听力训练、曲风详情 |
| `scripts/` | 门禁、实测探针与端到端矩阵 |

代码背后的设计记录也留在仓库里（中文）：`PRODUCT_PLAN_v2.1.0.md`（当前计划与技术附录）、
`BACKLOG.md`、`docs/OPEN_WORK.md`（交接台账）、`ARCHITECTURE_SURFACES.md`。

## MCP 服务（给其它 LLM 与 agent 用）

曲风库、音序器、导出器与测量能力通过 [Model Context Protocol](https://modelcontextprotocol.io) 暴露出去：
agent 可以检索 159 个曲风、读取曲风的**已记录事实**、据此写 pattern、导出 MIDI/Ableton、生成分享链接，
并用 App 自己的引擎渲染真实 WAV/MP3。

```bash
npm run mcp:build        # → dist-mcp/groove-mcp.mjs
GROOVE_MCP_OUT=/tmp/groove npm run mcp
npm run check:mcp        # 门禁：用 stdio 启动它并真调用各个工具
```

把任意 stdio MCP 客户端指向 `dist-mcp/groove-mcp.mjs` 即可。完整契约（每个工具、resource、prompt，以及**故意
不暴露**的部分）见 [docs/MCP.md](docs/MCP.md)，客户端配置见 [mcp/README.md](mcp/README.md)。

## 已知限制

- 同一段编曲重复导出**不是逐位相同**的。调度本身是确定性的，但 Chrome 自己的 DSP 在两次渲染之间
  有细微差异，所以这里承诺的是误差范围，不是完全相等。
- 浏览器要求先有一次用户操作才能出声，因此进入页面后需要点一下播放或按键。
- 界面只有一套，即桌面端；手机与平板浏览器渲染的都是同一套界面。

## 致谢

**规则只说一次，免得靠记性**：本项目**打包或再分发**的声音库，都在加入的那一刻写进**第一张表**，并把其许可证要求的署名写全。
有判据守着它：清单里凡许可证**要求署名**的条目，都必须出现署名方**许可证所要求的名字**。

两张表**故意分开**，且判据依赖这种分开：第二张表里的条目只是**计划**；"打算给某人署名"不等于已经给了。
把两者混为一谈，正是许可证义务悄悄落空、而文件看起来还很完整的方式。

⚠️ **以英文为准** ✓：以下表格的**条目名与许可证名原样保留** ✓；条款与署名的**准确措辞**见
[README.md 的 `## Credits`](README.md#credits) ✓（本节的目的是让中文读者在同一位置看到**同一份署名事实** ✓）。

### 本项目再分发的库

| 库 | 许可证 | 要求的署名 |
|---|---|---|
| **Salamander Grand Piano**（`salamander-grand`） | **CC BY** | **Chisato Yamauchi**（重制）与 **Alexander Holm**（原始采样） |
| **VSCO 2 CE** — Versilian Studios Chamber Orchestra: Community Edition（`vsco2ce`） | **CC0** | 无强制要求；**Sam Gossner / Versilian Studios** 为礼节署名 |
| **MTG Solo Saxophones**（`mtg-solo-sax`） | **CC BY** | 萨克斯采样来自 Music Technology Group（Universitat Pompeu Fabra, Barcelona） |
| **Greg Sullivan's E-Pianos**（`gregsullivan-e-pianos`） | **CC BY** | 录音：Greg Sullivan（<http://www.sullivang.net/>）；SFZ 映射：kinwie |
| **Ixox Flute**（`ixox-flute`） | **CC BY** | Ixox Flute：Xavier Hosxe（<http://xhosxe.free.fr/ixoxflute.html>）；SFZ 转换：Lars Ekman / the sfz 社区 |

2026-10-03 那一轮又加了十四个库 —— 十三个 **CC0**、一个 **Unlicense** —— 都**不要求署名**；
上表三行是该轮**仅有的 CC BY** 条目。

署名是"先计划、后镜像"的；两张表并存，就是为了**字节上传之后署名不会落在计划里**。
每加一个库，就把它的行写到这里，并写明**其许可证要求的那些名字** —— 对 CC BY 库而言，是**作者，而不只是库**。

**VSCO 2 CE 的许可证是读它自己的文件得出的，不是凭名声。** 早先这里曾写"CC Sampling Plus 1.0 — 不可再分发"，
后来按其自带 LICENSE 更正。

### 已计划、尚未包含

本表**不主张任何一条已被包含**；每行写的是它**到来时**将会被要求的署名。

| 库 | 许可证 | 届时将要求的署名 |
|---|---|---|
| **VCSL** — Versilian Community Sample Library | CC0 | 无强制要求；礼节署名 |
| **Virtuosity Drums** — Versilian Studios / Karoryfer | CC0 | 无强制要求；礼节署名 |
| **Karoryfer** 免费乐器 | CC0（视发行版而定） | CC0 发行版无要求；**部分旧发行版为 CC-BY-4.0**，故每个版本都要单独确认 |

代码依赖的署名单列于 [public/THIRD_PARTY_NOTICES.md](public/THIRD_PARTY_NOTICES.md)，因为它们的义务不同、读者也不同。


## 许可

MIT，见 [LICENSE](LICENSE)。随仓库一起打包的 GS-1 合成器内核，以及编译进它二进制里的几个 DSP
库同样是 MIT；授权声明与完整许可证文本见
[public/THIRD_PARTY_NOTICES.md](public/THIRD_PARTY_NOTICES.md)。
