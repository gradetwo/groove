# Groove Lab

一个完全在浏览器里运行的律动工作站与曲风资料库。内置 159 种曲风，每种都有一份简短的制作说明
和一段可播放、可编辑的 8 轨模板。

**在线体验：<https://groove.wangda.today/>** · [English](README.md)

<p align="center">
  <img src="docs/screenshots/pc-studio.jpg" alt="工作台：8 轨步进音序器，左侧是该曲风的中英双语制作说明" width="880">
</p>

<p align="center">
  <img src="docs/screenshots/phone-player.jpg" alt="手机播放器：可以按住拖动搓盘的黑胶，唱臂落在唱片上" width="178">
  <img src="docs/screenshots/phone-library.jpg" alt="曲风库：每个曲风自己的封面图，以及垂直的百年时间轴" width="178">
  <img src="docs/screenshots/phone-jam.jpg" alt="即兴：按乐器分色的步进网格与可敲击的打击垫" width="178">
  <img src="docs/screenshots/phone-challenge.jpg" alt="挑战：盲听训练，判定固定在屏幕内" width="178">
</p>

## 两个界面，六套皮肤

桌面端是一台完整的工作站；手机端是另一套为拇指设计、位于 `/m/…` 的独立应用，有自己的导航、播放器和
16 步「即兴」编辑器。六套皮肤会同时换装**两个界面**——两边用同一套配色，因为桌面端的色板是由手机端自己的
token 生成的（`scripts/desktop_skins.mjs`）。在桌面端 **设置 → 界面 → 外观**，或手机端 **更多 → 外观** 里
切换；选择是共享的，两边不会各说各话：

| | | |
|---|---|---|
| <img src="docs/screenshots/skin-default.jpg" width="150"><br>**极光冷色**<br>冷调深底，每模块一个强调色 | <img src="docs/screenshots/skin-minimal.jpg" width="150"><br>**现代极简主义**<br>纸白底、Inter、发丝细线 | <img src="docs/screenshots/skin-comic.jpg" width="150"><br>**复古漫画**<br>新闻纸、网点、套印偏移 |
| <img src="docs/screenshots/skin-soviet.jpg" width="150"><br>**苏联重工业**<br>冲压钢板、铆钉、信号灯 | <img src="docs/screenshots/skin-sovietYears.jpg" width="150"><br>**苏联岁月**<br>构成主义宣传画、国旗红、硬投影 | <img src="docs/screenshots/skin-pixel.jpg" width="150"><br>**8-bit 像素**<br>扫描线、阶梯边框、像素字体 |

## 更多截图

| | |
|---|---|
| <img src="docs/screenshots/pc-galaxy.jpg" width="420"><br>**曲风星系** —— 把资料库摊成一张 3D 星图 | <img src="docs/screenshots/pc-chords.jpg" width="420"><br>**和弦工坊** —— 进行、声位与试听 |
| <img src="docs/screenshots/pc-masterclass.jpg" width="420"><br>**大师课** —— 律动解构与实时碰撞器 | <img src="docs/screenshots/phone-detail.jpg" width="420"><br>**曲风详情（手机）** —— 传承与演变画成一张图 |

## 里面有什么

- **159 种曲风** —— house、techno、hip-hop、trap、bebop、cumbia、afrobeat 等等，每种都配中英双语
  制作说明（配器、曲式、律动、和弦走向、代表音乐人）和一段可播放的模板。
- **音序器** —— 8 轨，16 到 128 步（1 到 8 小节），支持力度、连击（ratchet）、概率、参数锁、
  摇摆（swing）、歌曲模式与 A/B 段落槽。
- **钢琴卷帘** —— 逐轨编辑音符、和弦进行、量化、连奏、力度塑形，以及**只播放这一条轨道**的单独试听。
- **声音是合成的，不用采样。** 鼓、贝斯、pad、主音都由 Web Audio 的振荡器与缓冲区实时生成，
  包括建模鼓组（TR-808、TR-909、原声、赛博波表）。运行时不下载任何音频，因此离线也能用。
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
npm run test:e2e:all # 完整的 7 端 Playwright 矩阵
```

`npm run verify` 会依次检查版本与文档一致性、分层依赖、CSS 用法、类型、lint、数据 schema、
测试、生产构建、两个实测探针和端到端矩阵。端到端测试需要先装一次浏览器：
`npx playwright install --with-deps chromium firefox webkit`。

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
`ROADMAP_V2.md`、`BACKLOG.md`、`ARCHITECTURE_SURFACES.md`。

## 已知限制

- 同一段编曲重复导出**不是逐位相同**的。调度本身是确定性的，但 Chrome 自己的 DSP 在两次渲染之间
  有细微差异，所以这里承诺的是误差范围，不是完全相等。
- 浏览器要求先有一次用户操作才能出声，因此进入页面后需要点一下播放或按键。
- 手机端界面正在重新设计，目前桌面端功能最完整。

## 许可

MIT，见 [LICENSE](LICENSE)。随仓库一起打包的 GS-1 合成器内核，以及编译进它二进制里的几个 DSP
库同样是 MIT；授权声明与完整许可证文本见
[public/THIRD_PARTY_NOTICES.md](public/THIRD_PARTY_NOTICES.md)。
