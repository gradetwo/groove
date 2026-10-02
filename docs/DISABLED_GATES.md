# 暂时禁用的门禁（可见、可逆、不会忘）

**业主裁定 ②（2026-10-02，原话）**：

> **「暂时禁用这些门禁，等版本稳定后传 catalogue 并重录基线」**

配套的是同一天的裁定 ①：采样的**「给终点而不是硬切」**接线进导出路径。两件事是同一次改动的两半 ——
接线让采样路径的响度/尾巴真的变了，而**没有任何门禁看得见它**，所以那些门禁必须先明确地关掉，
而不是留着亮绿灯假装它们还在judge。

---

## 1. 为什么它们"看不见现实"

这三条门禁都要经过**离线渲染**，而它们调用 `renderPatternOffline` 时**不传
`RenderWavOptions.audioLaneCatalogue`**（`src/audio/offlineAudioLanes.ts` 的 `planOfflineAudioLanes`）。
于是 `src/data/sampledInstruments.ts` 表里映射到录音的每一条轨，都回落到**内置合成器**：

* 采样路径在它们的渲染里**一根音都没有**；
* 它们记录的基线（`scripts/loudness.baseline.json`、`scripts/timbre.baseline.json`）也是这么录的；
* ⇒ 采样一接线，响度/音色变化**没有任何门禁能看见**，绿灯是"没看"而不是"没问题"。

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
| `check:groove`（nightly 的 `groove-shards`＋`groove-gate`，经 `scripts/analyze_export_audio.mjs`） | 未在本机跑（nightly） | 否 | **是（同样盲）** | **不在禁用清单**，见 §5 的"观察名单" |
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

清单是**唯一来源**：`scripts/disabledGates.mjs` 的 `DISABLED_GATES`。三条，逐条：

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

---

## 4. "可见、可逆、不会忘"是怎么做到的

1. **单一来源**：`scripts/disabledGates.mjs` 的 `DISABLED_GATES`（加上决不能被禁的 `NEVER_DISABLED`）。
   **门禁文件与逻辑一行未删**（`scripts/check_loudness_spread.mjs` 等原样保留，`src/test/loudnessTrimWiring.test.ts`
   仍然直接跑它）。
2. **入口处生效，CI 与本地两条都算**：
   * npm 入口：`npm run check:loudness` ＝
     `node scripts/disabled_gate_guard.mjs check:loudness -- node scripts/check_loudness_spread.mjs`；
   * 本地 `scripts/track.mjs`（`npm run slow`）走同一个 guard；
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
   另外单元判据把**这三个 id 手写在测试里**，所以将来往清单里加第四个，必须有人来改这行期待并读理由。

---

## 5. 其余门禁照跑 —— 证据

* `npm run check:disabled-gates` 的输出逐条列出：`disabled (3)`、`wired through the guard: check:loudness, check:timbre, check:loudness:fresh`、
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

### 观察名单（**没有**被禁用，原因写在明处）

`check:groove`（nightly 的 `groove-shards` ＋ `groove-gate`）经过 `scripts/analyze_export_audio.mjs` 渲染，
同样不传 catalogue，所以它**今天也一样盲**。它**不在**禁用清单，因为：它不是响度/音色基线，判的是十二条结构性主张
（velocity 分布、sidechain 是否动、立体声宽度、中频占比、和声是否移动、尾巴是否被切），而且它在 **nightly**、不在推送上。
**这需要业主裁一下**：一旦 catalogue 进 render，它的预算数字也会动。本文件如实记下来，不替业主决定。

---

## 6. 同一天的另一半（裁定 ①）读数在哪

接线本身、以及"限幅器接不接得住"的改前/改后读数（lane energy `38609.47 → 34069.43`、integrated `−12.7039 → −12.9245 LUFS`、
true peak 两次都 `−1.299999 dBTP`（≤ 0 dBFS）、限幅器 `worklet` 介入且两次都减少 `1.825 dB`、换和弦点不连续度 `1.3995× → 0.5952×`）
写在 `docs/STRING_TECHNIQUES.md` §10.2.1；机制与钳位在 `src/audio/samplerVoice.ts`，接线在 `src/audio/WavExporter.ts` 的 sampler sink。
