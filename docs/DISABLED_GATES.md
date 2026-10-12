# 暂时禁用的门禁（可见、可逆、不会忘）

**业主裁定 ②（2026-10-02，原话）**：

> **「暂时禁用这些门禁，等版本稳定后传 catalogue 并重录基线」**

**同日追加（原话）**：

> **「`check:groove` 一起禁」**

配套的是同一天的裁定 ①：采样的**「给终点而不是硬切」**接线进导出路径。两件事是同一次改动的两半 ——
接线让采样路径的响度/尾巴真的变了，而**没有任何门禁看得见它**，所以那些门禁必须先明确地关掉，
而不是留着亮绿灯假装它们还在judge。

---

## 1. 为什么它们"看不见现实"

这四条门禁都要经过**离线渲染**，而它们调用 `renderPatternOffline` 时**不传
`RenderWavOptions.audioLaneCatalogue`**（`src/audio/offlineAudioLanes.ts` 的 `planOfflineAudioLanes`；
`check:groove` 走 `scripts/analyze_export_audio.mjs`，同样不传）。
于是 `src/data/sampledInstruments.ts` 表里映射到录音的每一条轨，都回落到**内置合成器**：

* 采样路径在它们的渲染里**一根音都没有**；
* 它们记录的基线（`scripts/loudness.baseline.json`、`scripts/timbre.baseline.json`，以及 `check:groove` 里那份"今天的数字"预算）也是这么录的；
* ⇒ 采样一接线，响度/音色/混音变化**没有任何门禁能看见**，绿灯是"没看"而不是"没问题"。

反面证据（别人实测、本次复核一致）：`npm run check:loudness:fresh` 在**改动之前的 `origin/dev`（d8ec77a）上就已经是红的**，
3/3 全部对不上，Δ `−0.67 / −1.05 / −1.31 dB`。它红，正是因为它量的东西和现实已经分开了。

---

## 2. 盘清：每一条门禁｜今天红不红｜传不传 catalogue｜受不受采样路径影响

"传 catalogue"＝调用 `renderPatternOffline` / `renderSongOffline` / `exportMasterWav` 时传
`audioLaneCatalogue`（应用的导出路径传，见 `src/features/sequencer/hooks/audioLaneExport.ts`）。

| 门禁 | 今天红不红（本次实测） | 向 render 传 catalogue？ | 受采样路径影响？ | 结论 |
| --- | --- | --- | --- | --- |
| `check:loudness:fresh` | **红**（3/3，Δ −0.67/−1.05/−1.31 dB；**改动前就红**） | 否 | **是**（绝对响度基线） | **禁用** |
| `check:loudness` | 绿 | 否（只读基线文件） | **是**（读的就是上面那份基线） | **禁用** |
| `check:timbre` | 绿 | 否（只读基线文件） | **是**（`measure_genre_timbre.mjs` 同样不传 catalogue） | **禁用** |
| `check:groove`（nightly 的 `groove-shards`＋`groove-gate`，经 `scripts/analyze_export_audio.mjs`） | 推送时不跑（nightly）；本次 `DISABLED_GATES_IGNORE=1` 真跑见 §5 | 否 | **是**（`thinMids`／`narrowStereo`／`cutTail` 是渲染出来的混音数字） | **禁用**（业主同日追加："check:groove 一起禁"） |
| `check:budget` | 绿 | 不渲染（gzip 字节） | 否 | 照跑 |
| `check:actions` / `version:check` / `docs:check` / `check:docs:refs` / `redlines` | 绿 | 不渲染 | 否 | 照跑 |
| `check:layers` / `check:isolation` / `check:css` / `check:skins` / `check:skin-roles` / `check:layout` | 绿 | 不渲染 | 否 | 照跑 |
| `typecheck` / `lint` / `lint:data` / `data:lint` / `test` / `build` | 绿 | 不渲染（单测用 fake，不是基线门禁） | 否 | 照跑 |
| `check:gs1` / `check:mcp:build` / `check:mcp` | 绿 | MCP 的 `render_audio` 没被调用（协议面） | 否 | 照跑 |
| `probe:boot` / `probe:toolbar` / `probe:grid-gutter` / `probe:arrangement` / `probe:live-arrangement` / `probe:continuity` / `probe:skins` | 绿 | 不渲染音频（DOM/几何/时序/连续性） | 否 | 照跑 |
| `record:loudness`（`scripts/run_loudness_sweep.mjs`） | 不是门禁 | —— | （它就是"回来"那条路） | **故意不拦** |
| `scripts/measure_genre_loudness.mjs` 直接调用 | 不是门禁 | —— | —— | **故意不拦**（重录基线要用） |

---

## 3. 禁用了哪几个，逐条

清单是**唯一来源**：`scripts/disabledGates.mjs` 的 `DISABLED_GATES`。四条，逐条：

### 3.1 `check:loudness:fresh` → `scripts/measure_genre_loudness.mjs`

* **为什么**：它重新渲染三个采样 genre 并和 `scripts/loudness.baseline.json` 比。它不向 render 传
  `audioLaneCatalogue`，所以映射轨全部回落合成器 —— 它对采样路径**惰性**，2026-10-02 接线的
  `releaseSeconds` 动不了它看得见的任何数字。
* **今天**：**红，而且改动前就红**（`origin/dev` d8ec77a，3/3）。
* **什么时候回来**：版本稳定后 —— **给 render 传 catalogue**（`--sample` 这条路按应用导出路径的做法读它）
  **并重录** `scripts/loudness.baseline.json`。
* **谁决定**：业主，2026-10-02（裁定 ②）。

### 3.2 `check:loudness` → `scripts/check_loudness_spread.mjs`

* **为什么**：它是上面那次渲染的"读取半边"，所以只能和那次渲染一样瞎：它检查的基线是**不传 catalogue 时录的**，
  报告和 `src/data/genreMix.ts` 互相一致，但两者都没见过一条采样轨。
* **今天**：绿。**它的绿不是因为音频没问题**，而是因为两份文件互相一致。
* **什么时候回来**：版本稳定后，**重录** `scripts/loudness.baseline.json`（渲染时带 catalogue），它读新数。
* **谁决定**：业主，2026-10-02（裁定 ②）。

### 3.3 `check:timbre` → `scripts/check_timbre_spread.mjs`

* **为什么**：和响度基线一样的方式录的（`scripts/measure_genre_timbre.mjs` 也不传 `audioLaneCatalogue`），
  所以指纹描述的是合成器轨。释放改变导出采样的尾巴，它看不见；一旦 catalogue 进 render，指纹会动。
* **今天**：绿，同样对采样路径惰性。
* **什么时候回来**：版本稳定后，给 render 传 catalogue 并重录 `scripts/timbre.baseline.json`。
* **谁决定**：业主，2026-10-02（裁定 ②）。

### 3.4 `check:groove` → `scripts/check_groove.mjs`（nightly 的 `groove-shards`＋`groove-gate`）

* **为什么**：它经 `scripts/analyze_export_audio.mjs` 渲染十二条结构性主张（velocity 分布、sidechain 是否动、
  立体声宽度、中频占比、和声是否移动、尾巴是否被切）并和"今天的数字"预算比。`analyze_export_audio.mjs`
  **同样不传 `audioLaneCatalogue`** ⇒ 映射轨全部回落合成器 ⇒ 其中**来自渲染的那几条**（`thinMids` 的
  中频占比、`narrowStereo` 的立体声宽度、`cutTail` 的尾巴）是**关于一次从未含采样轨的混音**的数字，
  一旦 catalogue 进 render 它们会动。它**不是**响度/音色基线，所以它是**第四条**、也是最后一条被单独点名的。
* **今天**：推送时不跑（只在 nightly）；本文件的记录分两行 —— nightly 上**未判**，
  而本机 `DISABLED_GATES_IGNORE=1` 的真跑结果见 §5（**如实记，包括它自己的 flake**）。
* **什么时候回来**：版本稳定后，给 render 传 catalogue 并**重录 ratchet 的预算**
  （`docs/GROOVE_QUALITY_PLAN.md` 里那些数字就是"今天的测量"）。
* **谁决定**：业主，2026-10-02（裁定 ② ＋ 同日追加点名：「`check:groove` 一起禁」）。

---

## 4. "可见、可逆、不会忘"是怎么做到的

1. **单一来源**：`scripts/disabledGates.mjs` 的 `DISABLED_GATES`（加上决不能被禁的 `NEVER_DISABLED`）。
   **门禁文件与逻辑一行未删**（`scripts/check_loudness_spread.mjs` 等原样保留，`src/test/loudnessTrimWiring.test.ts`
   仍然直接跑它）。
2. **入口处生效，CI 与本地两条都算**：
   * npm 入口：`npm run check:loudness` ＝
     `node scripts/disabled_gate_guard.mjs check:loudness -- node scripts/check_loudness_spread.mjs`；
   * 本地 `scripts/track.mjs`（`npm run slow`）走同一个 guard；
   * npm 入口（第四条同理）：`npm run check:groove` ＝
     `node scripts/disabled_gate_guard.mjs check:groove -- node scripts/check_groove.mjs`，
     所以 nightly 的 `--shard=i/4` 与 `--merge-dir` 两种调用都被拦住；
   * CI（`.github/workflows/ci.yml`、`.github/workflows/manual-verify.yml`）里**步骤还在**，跑的就是这些 npm 脚本，
     所以 CI 日志里会打印下面这段说明并 **exit 0**，改名后的步骤名也带着 `[disabled — …]`。
3. **禁用点旁边的说明**（guard 打印，原文）：

   ```text
   ⏸  DISABLED GATE — check:loudness
      what        : Reads the committed loudness baseline and holds it against src/data/genreMix.ts …
      why         : It is the reading half of the render above … the baseline it checks was recorded without a catalogue …
      today       : No — green today. It is green for a reason that is not about the audio …
      comes back  : The version is stable: re-record scripts/loudness.baseline.json …
      decided by  : the owner, 2026-10-02 (rider 2: 暂时禁用这些门禁，等版本稳定后传 catalogue 并重录基线)
      ledger      : scripts/disabledGates.mjs   (the only place that may disable a gate)
      long form   : docs/DISABLED_GATES.md
      run it anyway: DISABLED_GATES_IGNORE=1 (the file and its logic are untouched: scripts/check_loudness_spread.mjs)
   ```

4. **可逆，不用改代码**：`DISABLED_GATES_IGNORE=1 npm run check:loudness` 直接跑真门禁。
   `npm run record:loudness` 与直接跑 `scripts/measure_genre_loudness.mjs` **没有被拦** —— 重录基线正是"回来"那一步。
5. **不会忘 —— "被禁用的门禁恰好是清单里那几个"的判据**：
   `scripts/check_disabled_gates.mjs`（`npm run check:disabled-gates`，已进 CI 的 validate 与 `verify` 链）
   与 `src/test/disabledGates.test.ts` 调**同一个** `auditDisabledGates()`：
   * 清单里列了、但入口没走 guard（或门禁文件被删、或三个事实缺一个）⇒ **红**；
   * 某个门禁走了 guard 却**不在清单里** ⇒ **红**（"偷偷多禁一个"当场失败），而且 guard 本身**照跑**它（fail-safe）；
   * `NEVER_DISABLED` 里的门禁被禁/被删/掉出 `verify` 链 ⇒ **红**；
   * 清单里的门禁**没有任何 workflow 再调用它** ⇒ **红**（步骤不许悄悄消失）。
   另外单元判据把**这四个 id 手写在测试里**，所以将来往清单里加第五个，必须有人来改这行期待并读理由 ——
   **第四个就是这么进来的**：业主点名后，改的是 `EXPECTED_DISABLED` 那一行，注释里写着是谁、什么时候说的。

---

## 5. 其余门禁照跑 —— 证据

* `npm run check:disabled-gates` 的输出逐条列出：`disabled (4)`、`wired through the guard: check:loudness, check:timbre, check:loudness:fresh, check:groove`、
  `protected from disablement (17): check:actions, check:budget, check:docs:refs, check:gs1, check:isolation, check:layers, check:layout, check:mcp, check:covers, data:lint, docs:check, lint, lint:data, redlines, test, typecheck, version:check`，
  并断言这 17 条**仍然存在、仍然在 `verify` 链或 CI 步骤里**。
* CI 的 `validate` 作业步骤（改后）：`Install measurement dependencies` → `Checkout` → `Setup Node` → `Node & npm versions` →
  `Install dependencies` → **`Actions Runtime Gate`** → **`Disabled Gates Ledger`（新增）** → `Version Single-Source Check` →
  `Documentation Baseline Check` → `TypeScript Typecheck` → `ESLint Code Quality` → `Red-Line Gate` → `Unit Tests & Coverage` →
  `Genre Database Schema Lint` → `Genre Database Audit` → `Loudness Trim Gate (report vs table) [disabled — …]` →
  `Production Build` → `Install Playwright Chromium` → `The built app starts` → `No step at the note events` → `Bundle Budget & Performance Gate`。
  与清单对照：**只有 `check:loudness` 那一步被关**（它自己打印 notice 并 exit 0），别的都在。
* `check:timbre` / `check:loudness:fresh` 只在 `manual-verify.yml`（`scope=audio`）与 nightly 里出现，
  同样是**步骤保留**、脚本自己 skip。
* nightly 的 groove 作业：`Groove shard ${{ matrix.shard }}/4 [disabled — see scripts/disabledGates.mjs]`
  （四条并行的 `npm run check:groove -- --shard=i/4 --rows-out=…`）与
  `Judge the union of the shards [disabled — see scripts/disabledGates.mjs]`
  （`npm run check:groove -- --merge-dir=groove-rows`）—— **步骤保留、步骤名标注、脚本自 skip**；
  `Upload shard rows` 仍是 `if: always()`（它上传的是空目录，`if-no-files-found: warn`），
  所以作业图与清单对照后**只有这四条被关**，没有别的作业被顺手拿掉。

### 曾经是"观察名单"，现已按业主裁定转入禁用

本文件第一版把 `check:groove` 列为"观察名单"（同样盲、但未禁），并把决定权交回业主。
**业主 2026-10-02 裁定：`check:groove` 一起禁** —— 于是它成了 §3.4 的第四条，
禁止的理由、回来的条件、决定人三件都写在清单和 guard 的 notice 里。观察名单已清空。

### `DISABLED_GATES_IGNORE=1 npm run check:groove` 的真跑结果（如实记）

* **跑得动**：override 确实穿过 guard 跑起了真门禁（日志第一行
  `▶ check:groove is DISABLED … but DISABLED_GATES_IGNORE=1 — running the real gate.`），
  Vite dev server 与 Chromium 都起来了，渲染开始。
* **两次整轮（12 个 genre）都没跑完，都崩在 analyser 自己的 `reloadPage` 上**（`scripts/analyze_export_audio.mjs:1116`）：
  * 第 1 次 `page.goto: Navigation to "http://127.0.0.1:5321/" is interrupted by another navigation`；
  * 第 2 次 `page.goto: Target page, context or browser has been closed`；
  * 两次都跑到了页码 reload（Vite ＋ Chromium 都起来了、渲染进行中，约 20–25 分钟），
    退出码 `1`。**这与本次 ledger 改动无关**：`scripts/check_groove.mjs` 与 `scripts/analyze_export_audio.mjs` 一个字未改，
    崩的是它们自己的周期性 reload；本机同时有其它 worktree 的 Vite/Chromium 在跑，CPU 争用会放大这个竞态。
  * ⇒ **整轮的绿/红结论：判不了，如实报"未得出"，不替门禁说绿。**
* **分片也没跑完**：`--shard=1/4`（3 个 genre）与 `--shard=1/12`（1 个 genre，按 `RELOAD_EVERY = 1` 它连一次 reload 都不需要）
  各试一次，都没在本机完成。最后一次的读数说明原因是**机器被别的 worktree 挤死**，不是门禁不动：
  那个 analyser 进程 **18 分钟里只用了 6 秒 CPU（0.5%）**，而 `uptime` 的 load average 是 **15–17**，
  同一时刻机器上有 **14 个 Chromium、15 个 Vite**（其它 worktree 的）。
* **对"跑不跑得动、绿不绿"的结论，如实说**：
  * **跑得动 —— 是的，每一次都真的跑起来了**：guard 的 override 生效、Vite dev server 与 Chromium 起来、
    `analyze_export_audio.mjs` 真的开始渲染（第一次整轮还走过了好几个 genre）。
  * **绿/红 —— 判不了**：在这台被挤满的机器上没有一次完整跑完，所以**没有** `check:groove` 的绿/红结论。
    这不影响本次裁定的执行（门禁已按业主的话关掉），但**不许把它说成"check:groove 是绿的"**。
  * 分片按设计**不判预算**（只写行、aggregate 才判），所以即使分片跑完也替代不了绿/红。

---

## 6. 同一天的另一半（裁定 ①）读数在哪

接线本身、以及"限幅器接不接得住"的改前/改后读数（lane energy `38609.47 → 34069.43`、integrated `−12.7039 → −12.9245 LUFS`、
true peak 两次都 `−1.299999 dBTP`（≤ 0 dBFS）、限幅器 `worklet` 介入且两次都减少 `1.825 dB`、换和弦点不连续度 `1.3995× → 0.5952×`）
写在 `docs/STRING_TECHNIQUES.md` §10.2.1；机制与钳位在 `src/audio/samplerVoice.ts`，接线在 `src/audio/WavExporter.ts` 的 sampler sink。
