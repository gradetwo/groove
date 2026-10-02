# 分支／工作树盘点（2026-10-02）

**这份文件回答一个问题**：**手机版砍除要等"所有开发分支都完成合并"，那还差哪些没合并？**

> **快照**：`origin/dev` = **`9b4910a`**，采集于 **2026-10-02T03:22:27Z**，全部表格出自**同一次采集**。
> ⚠️ **本轮盘点期间 `origin/dev` 被并发会话推了 6 次提交**：`34e56b7` → `148af6e` → `7861983` → `6163f81` → `9b4910a` → `2f1ec50` → **`87de3eb`**。**这 6 笔全是 docs／CI／文档门禁，没有一笔动过 `src/mobile/`。**
> **§1–§5 的表格是 `9b4910a` 那一刻的值**；**§0 与 §6 的结论已在 `87de3eb` 上重新核对过**（核对发现 `audit-verify` 已经落地，见 §0）。重跑这些命令会得到当时的值。
>
> 采集命令都是只读的：`git fetch`、`branch -vv`、`branch -r`、`ls-remote`、`worktree list`、`status`、`rev-list --count`、`merge-base --is-ancestor`、`git cherry`、`cat-file -e`、`git grep`。**本轮没有执行任何 `merge`／`rebase`／`checkout`／`worktree remove`／`branch -D`。**

---

## 0. 一句话结论

**内容层面，只有 3 条分支还有东西没回到 `dev`，而其中没有一条是"该照原样合并的实现"**——1 条是被有意"保住"的 WIP，2 条已被 `dev` 上更新的做法取代：

（快照时是 4 条；第 4 条 `audit-verify` 的 `docs/AUDIT_2026-10-02_PART2.md` **已于本轮期间随 `87de3eb` 落地到 `dev`**——`git rev-list --count audit-verify ^origin/dev` 现在是 **0**，`git cat-file -e origin/dev:docs/AUDIT_2026-10-02_PART2.md` 现在**存在**。这正是本盘点要防的那类变化。）

| 分支 | 领先 | 性质 | 该怎么处理 |
| --- | ---: | --- | --- |
| `feat-graph-split` | 1 | WIP：`5df017b` 自述"preserve an uncommitted workstream before its worktree is retired"，新增的 `src/test/graphSplit.test.ts`、`scripts/measure_graph_split.mjs` **在 dev 里不存在** | **要么合并，要么明确丢弃**——这是唯一"内容真的没进 dev"的实现分支 |
| `feat-criteria` | 1 | 一半已落地（`arrangementEdits` 半边 = dev `8b3f018`）；**另一半被取代**：dev 已不再报"截断"而改为**读得出带空格的路径**（`ade94c6`） | **不要照原样合并**；丢弃或按新语义重写 |
| `feat/genre-mix-loudness` | 1 | 已被取代：dev 的 `ConsolePanel.test.tsx` 改用 `GENRE_MIX_RESOLVED` 断言（更晚的做法） | **丢弃** |
| ~~`audit-verify`~~ | ~~1~~ → **0** | ~~活的：`docs/AUDIT_2026-10-02_PART2.md`~~ | ✅ **本轮期间已落地到 `dev`（`87de3eb`）** |

**其余 22 条"领先 `origin/dev`"的分支，内容已经在 `dev` 里**（`git cherry` 判定为补丁等价，或 dev 上有**同题提交**）。**它们要的是"删掉"，不是"合并"**——真的 `git merge` 它们会把已经被取代的旧版本重新搬回来。

**另外两个与"能不能开工"直接相关的实测事实**：
1. **`groove-int` 的工作树现在是脏的**（本轮快照时 1 处改动）→ `scripts/push_dev.sh` 第 2/3 步**会拒绝推送**（`set -e` + 非零退出），见 §6.3。
2. **`release/groove-github` 已退休**，且它是一个**历史与当前 `origin/dev` 平行的陈旧克隆**（`ed7c6330` 这个对象在 groove 仓库里根本不存在），见 §4。

---

## 1. 本地分支（58 条）对 `origin/dev`

`已包含 ✅` = `git merge-base --is-ancestor <branch> origin/dev`；`推送` 列比较本地 SHA 与 `origin/<同名分支>`；`工作树` 列来自 `git worktree list`。

| 分支 | SHA | 领先 | 落后 | 已包含 | 推送 | 工作树 |
| --- | --- | ---: | ---: | :---: | --- | --- |
| `audit-verify` | `593b253` | 1 | 0 | ❌ | **未推送** | /home/crow/music/groove-audit |
| `backup-fa44717` | `fa44717` | 5 | 230 | ❌ | **未推送** | — |
| `build-retire-mirror` | `e3b4590` | 7 | 230 | ❌ | **未推送** | — |
| `docs-adjudication` | `0ae60eb` | 1 | 255 | ❌ | **未推送** | — |
| `docs-next` | `f2b5b36` | 0 | 357 | ✅ | **未推送** | — |
| `feat-arrangement-layout` | `6d34c94` | 0 | 323 | ✅ | 已推·同SHA | — |
| `feat-arrangement-length` | `8d50927` | 0 | 351 | ✅ | **未推送** | — |
| `feat-arrangement-playback` | `39c83e9` | 0 | 341 | ✅ | 已推·同SHA | — |
| `feat-audio-lane-render` | `9a94a53` | 3 | 241 | ❌ | 已推·同SHA | — |
| `feat-choke-groups` | `ae71307` | 0 | 333 | ✅ | 已推·同SHA | — |
| `feat-criteria` | `b227230` | 1 | 255 | ❌ | **未推送** | — |
| `feat-genre-store` | `547b3c1` | 0 | 343 | ✅ | 已推·同SHA | — |
| `feat-graph-split` | `5df017b` | 1 | 315 | ❌ | **未推送** | — |
| `feat-gs1-assessment` | `9ed1451` | 1 | 241 | ❌ | **未推送** | — |
| `feat-gs1-param-writes` | `434e411` | 0 | 93 | ✅ | **未推送** | /home/crow/music/groove-wt47 |
| `feat-gs1-patch-passthrough` | `d25e534` | 1 | 231 | ❌ | 已推·同SHA | — |
| `feat-list-examples` | `6bb99e2` | 3 | 230 | ❌ | **未推送** | — |
| `feat-logic-import` | `99fe440` | 0 | 116 | ✅ | **未推送** | /home/crow/music/groove-wt44 |
| `feat-lyric-export` | `0138beb` | 1 | 236 | ❌ | 已推·同SHA | — |
| `feat-mcp-midi-import` | `b8aeb74` | 0 | 307 | ✅ | 已推·同SHA | — |
| `feat-midi-export` | `5247c7f` | 1 | 255 | ❌ | **未推送** | — |
| `feat-midi-honesty` | `a9cdbc1` | 0 | 291 | ✅ | **未推送** | — |
| `feat-musicxml-depth` | `e5efdbb` | 0 | 341 | ✅ | 已推·同SHA | — |
| `feat-orchestral` | `8cee4b7` | 3 | 255 | ❌ | **未推送** | — |
| `feat-render-bar-offset` | `7b833a3` | 0 | 170 | ✅ | **未推送** | — |
| `feat-route-split` | `8fa3d38` | 0 | 315 | ✅ | **未推送** | — |
| `feat-ruler` | `2f4a7c8` | 0 | 339 | ✅ | 已推·同SHA | — |
| `feat-schema-passthrough` | `6f8900f` | 0 | 341 | ✅ | 已推·同SHA | — |
| `feat-score` | `3ae0f6d` | 0 | 349 | ✅ | **未推送** | — |
| `feat-sfz-loop` | `8a3717d` | 0 | 309 | ✅ | 已推·**分歧** | — |
| `feat-sfz-paths` | `5101bf7` | 0 | 292 | ✅ | **未推送** | — |
| `feat-stem-export` | `2fb3d6a` | 0 | 301 | ✅ | **未推送** | — |
| `feat-transform-pattern` | `f8871f6` | 2 | 236 | ❌ | 已推·同SHA | — |
| `feat-vsco-articulations` | `7f53b42` | 4 | 230 | ❌ | **未推送** | — |
| `feat-vsco2ce` | `a874bdf` | 4 | 247 | ❌ | **未推送** | — |
| `feat/analyzer-signal-gen` | `84a358b` | 0 | 1722 | ✅ | **未推送** | — |
| `feat/console-float` | `09a210a` | 0 | 1721 | ✅ | **未推送** | — |
| `feat/genre-instrument-curation` | `b9d7979` | 0 | 1697 | ✅ | **未推送** | — |
| `feat/genre-mix-loudness` | `010ddb8` | 1 | 1676 | ❌ | **未推送** | — |
| `feat/genre-timbres` | `9bd02b2` | 0 | 1721 | ✅ | **未推送** | — |
| `fix-app-export-audio-lanes` | `3ebcf25` | 3 | 241 | ❌ | 已推·同SHA | — |
| `fix-arrangement-hang` | `eb828ee` | 0 | 112 | ✅ | **未推送** | /home/crow/music/groove-wt45 |
| `fix-headless-silence` | `c81c8ed` | 1 | 194 | ❌ | **未推送** | — |
| `fix-lane-keyzone-pitch` | `727bfc8` | 0 | 112 | ✅ | **未推送** | /home/crow/music/groove-wt46 |
| `fix-long-render-timeouts` | `c491ef6` | 3 | 176 | ❌ | **未推送** | — |
| `fix-sampler-note-off` | `4cc10fe` | 0 | 143 | ✅ | **未推送** | — |
| `fix-sfz-keyswitch-paths` | `4fcaed4` | 3 | 230 | ❌ | **未推送** | — |
| `fix-sfz-probe` | `57b6f02` | 0 | 319 | ✅ | 已推·同SHA | — |
| `fix-vsco-fetch` | `13da133` | 1 | 203 | ❌ | **未推送** | — |
| `fix-worker-honesty` | `67a3706` | 1 | 187 | ❌ | **未推送** | — |
| `headless-mcp` | `34e56b7` | 0 | 4 | ✅ | **未推送** | /home/crow/music/groove-headless |
| `int` | `9b4910a` | 0 | 0 | ✅ | **未推送** | /home/crow/music/groove-int |
| `int-local` | `6ac1fb9` | 0 | 194 | ✅ | **未推送** | — |
| `main` | `9d930b9` | 0 | 1878 | ✅ | 已推·**分歧** | — |
| `measure-render-profile` | `342376b` | 7 | 208 | ❌ | **未推送** | — |
| `mobile-preserved` | `29e37f6` | 0 | 18 | ✅ | 已推·同SHA | — |
| `next` | `ee5cb9c` | 2 | 230 | ❌ | **未推送** | /home/crow/music/groove |
| `probe-headless-core` | `69985e8` | 5 | 230 | ❌ | **未推送** | — |

**读法上的三个要点**（都由实测得出）：

1. **"领先 N 提交" ≠ "有 N 笔要合并"**。26 条领先分支里，`git cherry` 说有**补丁真的不在 dev** 的有 **12 条**；其中 **8 条**在 dev 上有**同题提交**（见 §1.1），只有 **4 条**既无同题提交也无等价补丁，所以真正的"新内容"还要再少。
2. **`feat-sfz-loop` 与 `main` 是"已推·分歧"**：本地 SHA ≠ `origin/<同名>`，而两者的 tip 都是 `origin/dev` 的祖先（内容在 dev 里）。`main` 本地 `9d930b9` 比 `origin/main` 旧得多（落后 dev **1878**），是一个陈旧的本地引用。
3. **21 条分支从未推送**（`origin` 上根本没有同名分支），其中**只有 4 条**的内容不在 `dev` 里（§0 那张表）。

### 1.1 内容核实：`git cherry` 说有补丁不在 dev，而 dev 上有同题提交

`git cherry origin/dev <branch>` 列出 `+`（补丁不在上游）与 `-`（有等价补丁）。下表把每条 `+` 提交的**提交主题**拿到 `origin/dev` 的历史里找同题提交（`git log origin/dev --grep=<主题> -F`）：

| 分支 | 领先 | `+`（补丁不在 dev） | dev 上的同题提交 | 新增文件缺于 dev |
| --- | ---: | ---: | --- | --- |
| `audit-verify` | 1 | 1 | **✗ 无** | `docs/AUDIT_2026-10-02_PART2.md` |
| `backup-fa44717` | 5 | 1 | `bd5fa6f` | — |
| `build-retire-mirror` | 7 | 2 | `ce2bf08` `51e0e84` | — |
| `docs-adjudication` | 1 | 0 | — | — |
| `feat-audio-lane-render` | 3 | 2 | `c0eead2` `25a2dcd` | — |
| `feat-criteria` | 1 | 1 | **✗ 无** | — |
| `feat-graph-split` | 1 | 1 | **✗ 无** | `scripts/measure_graph_split.mjs`、`src/test/graphSplit.test.ts` |
| `feat-gs1-assessment` | 1 | 0 | — | — |
| `feat-gs1-patch-passthrough` | 1 | 0 | — | — |
| `feat-list-examples` | 3 | 1 | `f38c4ea` | — |
| `feat-lyric-export` | 1 | 0 | — | — |
| `feat-midi-export` | 1 | 0 | — | — |
| `feat-orchestral` | 3 | 1 | `ade94c6` | — |
| `feat-transform-pattern` | 2 | 0 | — | — |
| `feat-vsco-articulations` | 4 | 0 | — | — |
| `feat-vsco2ce` | 4 | 0 | — | — |
| `feat/genre-mix-loudness` | 1 | 1 | **✗ 无** | — |
| `fix-app-export-audio-lanes` | 3 | 1 | `c0eead2` | — |
| `fix-headless-silence` | 1 | 0 | — | — |
| `fix-long-render-timeouts` | 3 | 0 | — | — |
| `fix-sfz-keyswitch-paths` | 3 | 1 | `e6d7fec` | — |
| `fix-vsco-fetch` | 1 | 0 | — | — |
| `fix-worker-honesty` | 1 | 0 | — | — |
| `measure-render-profile` | 7 | 1 | `d29a7bb` | — |
| `next` | 2 | 0 | — | — |
| `probe-headless-core` | 5 | 0 | — | — |

**只有 4 条既没有同题提交、也没有补丁等价**：`audit-verify`、`feat-criteria`、`feat-graph-split`、`feat/genre-mix-loudness`（下一节逐条定性）。

### 1.2 那 4 条的逐条定性

**`feat-criteria`（`b227230`，1 提交）——一半已落地、一半被取代。**
- `src/data/arrangementEdits.ts` 与 `src/test/arrangementEdits.test.ts`：`b227230` **新增的 13 行 / 120 行全部能在 dev 的同名文件里逐字找到**（`not_in_dev=0`）→ 这一半已以 dev `8b3f018`（同题改写："pin the batch add and the tempo-map validation, and re-measure the spaced sample path"）落地。
- `src/audio/sfz/parse.ts` 与 `src/test/sfzParse.test.ts`：dev **没有** `SfzRegion.problems` 这个字段（`git grep -n problems origin/dev -- src/audio` 在 parse.ts 里为 0），也没有 `truncatedSample`。原因是语义被**反向取代**了：dev 现在按 `b2ac664`／`ade94c6`「**带空格的 `sample=` 路径要被读出来**」而不是「报告它被截断」，dev 的 `sfzParse.test.ts` 里是 `describe("reading a sample path that contains spaces")` / `describe("a sample path containing spaces")`，而**不是** `b227230` 的 `describe("a truncated sample path")`。
- ⇒ **照原样合并会与 dev 已定的语义冲突**。这是一笔"决定丢弃/重写"，不是"一笔待合并"。

**`feat/genre-mix-loudness`（`010ddb8`，1 提交，2026-09-15）——已被更晚的做法取代。**
- 它把两处断言改为读 `patternFromGenre(genre)`；dev 的 `src/test/ConsolePanel.test.tsx` 现在读的是 `GENRE_MIX_RESOLVED`，注释写着"`patternFromGenre` seeds the store from `GENRE_MIX_RESOLVED`. Assert against that table rather than a hard-coded number"。**同一处问题、更新的解法，已在 dev 上。**⇒ 丢弃。

**`feat-graph-split`（`5df017b`，1 提交）——唯一"内容真的没进 dev"的实现分支。**
- 新增的 `src/test/graphSplit.test.ts`（220 行）、`scripts/measure_graph_split.mjs`（162 行）**在 dev 里不存在**；`src/audio/masterGraph.ts` 在 dev 里存在，但 `git grep -E 'GraphSplit|graphSplit|splitGraph'` 命中 **0**。
- 提交主题自述是 `wip(graph-split): preserve an uncommitted workstream before its worktree is retired` → **它的目的是"保住"，不是"交付"**。⇒ 需要业主/主控一句"合并还是丢弃"。

**`audit-verify`（`593b253`，1 提交）——活文档，正在被写。**
- 新增 `docs/AUDIT_2026-10-02_PART2.md`，dev 里没有。
- 它的 head 在**本轮盘点期间变了三次**（`34e56b7` → `811f1e0` → `593b253`），工作树在某一刻还出现过 `?? docs/AUDIT_2026-10-02_PART2.md`，之后被提交 → **这是并发会话正在推进的活分支**，不是历史遗留。

---

## 2. 远端分支（18 条）

`git ls-remote --heads origin` 与 `git branch -r` 一致；`origin/HEAD -> origin/main`。

| 远端分支 | SHA | 领先 | 落后 | 已包含于 `origin/dev` |
| --- | --- | ---: | ---: | :---: |
| `origin/dev` | `9b4910a` | 0 | 0 | ✅ |
| `origin/main` | `8a1336c` | 0 | 59 | ✅ |
| `origin/mobile-preserved` | `29e37f6` | 0 | 18 | ✅ |
| `origin/feat-arrangement-layout` | `6d34c94` | 0 | 323 | ✅ |
| `origin/feat-arrangement-playback` | `39c83e9` | 0 | 341 | ✅ |
| `origin/feat-choke-groups` | `ae71307` | 0 | 333 | ✅ |
| `origin/feat-genre-store` | `547b3c1` | 0 | 343 | ✅ |
| `origin/feat-mcp-midi-import` | `b8aeb74` | 0 | 307 | ✅ |
| `origin/feat-musicxml-depth` | `e5efdbb` | 0 | 341 | ✅ |
| `origin/feat-ruler` | `2f4a7c8` | 0 | 339 | ✅ |
| `origin/feat-schema-passthrough` | `6f8900f` | 0 | 341 | ✅ |
| `origin/feat-sfz-loop` | `570376d` | 0 | 310 | ✅ |
| `origin/fix-sfz-probe` | `57b6f02` | 0 | 319 | ✅ |
| `origin/feat-audio-lane-render` | `9a94a53` | 3 | 241 | ❌ |
| `origin/feat-gs1-patch-passthrough` | `d25e534` | 1 | 231 | ❌ |
| `origin/feat-lyric-export` | `0138beb` | 1 | 236 | ❌ |
| `origin/feat-transform-pattern` | `f8871f6` | 2 | 236 | ❌ |
| `origin/fix-app-export-audio-lanes` | `3ebcf25` | 3 | 241 | ❌ |

**这 5 条"远端领先"的分支，内容也都在 dev 里**：`feat-transform-pattern` / `feat-gs1-patch-passthrough` / `feat-lyric-export` 的 `git cherry` 结果是 **0 个 `+`**（补丁等价）；`feat-audio-lane-render` 与 `fix-app-export-audio-lanes` 的 `+` 提交在 dev 上有同题提交 `c0eead2` / `25a2dcd`。⇒ **远端没有"等合并的实现"。**

**`main` 的角色**：`origin/main`（`8a1336c`）是 `origin/dev` 的**祖先**（落后 59 提交）→ `dev` 是集成分支，`main` 只在 `dev` 远程门禁绿之后被快进。

---

## 3. 工作树（8 棵）

`git worktree list`（**实测：`groove-wt25` 不在里面**，见 §4）。

| 工作树 | 分支 | HEAD | 干净？ | 领先 | 落后 |
| --- | --- | --- | --- | ---: | ---: |
| `/home/crow/music/groove` | `next` | `ee5cb9c` | ✅ 干净 | 2 | 230 |
| `/home/crow/music/groove-audit` | `audit-verify` | `593b253` | ✅ 干净 | 1 | 0 |
| `/home/crow/music/groove-headless` | `headless-mcp` | `34e56b7` | ❌ 5 处 | 0 | 4 |
| `/home/crow/music/groove-int` | `int` | `9b4910a` | ❌ 1 处 | 0 | 0 |
| `/home/crow/music/groove-wt44` | `feat-logic-import` | `99fe440` | ✅ 干净 | 0 | 116 |
| `/home/crow/music/groove-wt45` | `fix-arrangement-hang` | `eb828ee` | ✅ 干净 | 0 | 112 |
| `/home/crow/music/groove-wt46` | `fix-lane-keyzone-pitch` | `727bfc8` | ✅ 干净 | 0 | 112 |
| `/home/crow/music/groove-wt47` | `feat-gs1-param-writes` | `434e411` | ✅ 干净 | 0 | 93 |

逐棵说明：

* **`/home/crow/music/groove`（`next`）** — **主检出，但分支是陈旧的**：领先 dev 2 提交、**落后 230**。那 2 提交（`ee5cb9c` 等）`git cherry` 判定**补丁等价于 dev**（dev 上有同题 `ee5cb9c`/`2949d5d` 的对应物）⇒ **没有东西要合并；分支该退场**。⚠️ **它落后得足以让"在这里做手机砍除"变成在旧基线上砍** —— 砍除应当在 `int`（= `origin/dev`）上做。
* **`/home/crow/music/groove-audit`（`audit-verify`）** — 干净，**领先 1**（`docs/AUDIT_2026-10-02_PART2.md`）。**这是 8 棵树里唯一还有未合并内容的**，而且正在被写。
* **`/home/crow/music/groove-headless`（`headless-mcp`）** — **不在简报的清单里**，实测存在。落后 4（即 tip 曾是 dev 的祖先），**工作树脏：`M mcp/registry.ts`、`M mcp/render/worker.ts`、`?? mcp/render/headless.ts` 等 5 处** ⇒ 有**未提交**的无头工作，**但它在分支上没有任何未合并的提交**。
* **`/home/crow/music/groove-int`（`int`）** — **集成分支树，`int` = `origin/dev`（领先 0 / 落后 0）**。⚠️ **快照时工作树脏（1 处改动）**。
* **`groove-wt44/45/46/47`** — 四棵工作树的分支**都已是 `origin/dev` 的祖先（领先 0）**，工作树**都干净**：`feat-logic-import`（落后 116）、`fix-arrangement-hang`（112）、`fix-lane-keyzone-pitch`（112）、`feat-gs1-param-writes`（93）。⇒ **这四条都已合并，没有待合并内容。**
* **⚠️ `groove-wt25` 不是工作树**（见 §4）——它既不在 `git worktree list` 里，也不是 git 仓库。

**与手机砍除的冲突面（实测）**：对**全部 26 条领先分支**与**全部 5 条远端领先分支**跑 `git diff --name-only origin/dev...<branch> -- src/mobile`，**命中数都是 0** ⇒ **没有任何未合并分支改过 `src/mobile/`**，手机砍除**不会**与这些分支冲突。同样地，没有任何领先分支改过 `.github/workflows/ci.yml`。

---

## 4. 同级目录逐项判定（`ls -d /home/crow/music/*/`）

实测存在的 13 个目录（简报列了 12 个，**漏了 `groove-audit/`、`groove-headless/`、`1b535ec…_report/`，而 `groove-wt25/` 并不是仓库**）：

| 目录 | 是 git 仓库？ | 分支 | 未提交改动 | 未合并提交 |
| --- | --- | --- | --- | --- |
| `groove/` | ✅ 同一仓库的**主检出** | `next`（`ee5cb9c`） | 无 | 2 提交领先，但**补丁等价于 dev** |
| `groove-audit/` | ✅ **worktree** | `audit-verify`（`593b253`） | 无 | **1 提交真未合并**（`docs/AUDIT_2026-10-02_PART2.md`） |
| `groove-headless/` | ✅ **worktree** | `headless-mcp`（`34e56b7`） | **5 处**（`mcp/registry.ts`、`mcp/render/worker.ts`、`mcp/render/headless.ts`…） | 0 |
| `groove-int/` | ✅ **worktree**（集成树） | `int`（`9b4910a`） | **1 处**（快照时） | 0（= `origin/dev`） |
| `groove-wt25/` | ❌ **不是仓库** | — | — | — |
| `groove-wt44/` | ✅ **worktree** | `feat-logic-import`（`99fe440`） | 无 | 0 |
| `groove-wt45/` | ✅ **worktree** | `fix-arrangement-hang`（`eb828ee`） | 无 | 0 |
| `groove-wt46/` | ✅ **worktree** | `fix-lane-keyzone-pitch`（`727bfc8`） | 无 | 0 |
| `groove-wt47/` | ✅ **worktree** | `feat-gs1-param-writes`（`434e411`） | 无 | 0 |
| `synth/` | ✅ **独立仓库**（GS-1） | `master`（`dedce2e`） | 无 | 45 条分支，44 条在 `master` 上；**只有 `p141` 领先 4 提交** |
| `midi-corpus/` | ❌ **不是仓库** | — | — | — |
| `void/` | ✅ **独立仓库** | `main`（`6fc705e`） | 无 | 只有一条分支，0 |
| `release/` | ❌ 本身不是仓库 | — | — | 见下 |
| `1b535ec6114db4635e228c5cafdddd0b6b33a925_report/` | ❌ 不是仓库 | — | — | 外部审计报告（7 份）的存放处 |

**逐条要点**：

* **`groove-wt25/`**：目录存在，但**里面只有一个 `.vite/` 子目录，没有 `.git`，也没有被注册为 worktree**（`git worktree list | grep -c wt2` = **0**）。⇒ **"`groove-wt25` 是一棵 worktree"这个前提不成立**，它是遗留的空目录。
* **`synth/`（GS-1 自己的仓库，不是 groove 的分支）**：**没有任何 remote**（`git remote -v` 输出 0 行）⇒ 它的一切都是"未推送"的。45 条本地分支里 **44 条的 tip 都在 `master` 上**，只有 `p141` 领先 4 提交（`bfb714d`、`5ffcb9a`、`a796bff`、`3d45373`）。`master` 上 `src/mobile` **不存在**（0 个文件）⇒ **手机砍除在 synth 上没有对象**。
* **`void/`**：独立仓库，**没有 remote**，只有 `main` 一条分支，工作树干净，`main` 领先自己 0 ⇒ **没有未合并提交**。
* **`midi-corpus/`**：**不是 git 仓库**（`fatal: not a git repository`），只是一份语料目录（内含 `midi/`）。
* **`release/`**：本身不是仓库，装了 **3 个独立克隆**：
  * **`release/groove-github`** —— **已退休的镜像**。它是一个**独立克隆**（`.git` 是真目录，不是 worktree 的 gitfile），当前在 `dev` @ **`ed7c6330`**，树干净。**它已经和当前 `origin/dev` 脱节**：`ed7c6330` 这个对象**在 groove 仓库里根本不存在**（`git cat-file -t ed7c6330` → `Not a valid object name`），它自己的 `origin/dev` 还停在 `37a7873`，而当前 `origin/dev` 是 `9b4910a`。⇒ **§十／§十.1 的"镜像退休"实测成立**：这份克隆记的是**归一之前那条平行历史**。
  * `release/synth-github` —— `main` @ `b8df488`，**1 处未提交改动**。
  * `release/void-github` —— `main` @ `95288b9`，**5 处未提交改动**。

---

## 5. 核实 `docs/OPEN_WORK.md` §二（"正在并行进行…均**未推送**"）

§二（在 `int`/`dev` 的副本里，`:23-30`）记着四条分支在 `../groove-wt20/21/22/23` 里并行、**均未推送**。**实测结论：这一节现在不成立，至少有两处已经过期。**

**① "各自独立 worktree" 已经不对。** `../groove-wt20`、`wt21`、`wt22`、`wt23` **全部不存在**（`groove-wt24` 也不存在；`groove-wt25` 存在但只是个空的 `.vite` 目录，且从未被注册为 worktree）。§二 里四个 worktree 路径**一个都不在了**。

**② "均未推送"仍然成立**——四条的 `origin/<同名>` 都不存在（`git branch -r` 里没有它们）。**但它们的内容大多已经回到 `dev` 了**：

| §二 的分支 | worktree | 未推送？ | 内容现在在哪 |
| --- | --- | :---: | --- |
| `feat-criteria` (`b227230`) | `../groove-wt20` **已不存在** | ✅ 仍成立 | **一半在 dev**（`8b3f018`，同题改写）；**另一半被取代**（dev 改为读出带空格路径，`ade94c6`） ⇒ §1.2 |
| `feat-orchestral` (`8cee4b7`) | `../groove-wt21` **已不存在** | ✅ 仍成立 | **已在 dev**：`b2ac664` 的同题提交是 `ade94c6`；另外 2 提交补丁等价 |
| `docs-adjudication` (`0ae60eb`) | `../groove-wt22` **已不存在** | ✅ 仍成立 | **已在 dev**（`git cherry` = 0 个 `+`，补丁等价） |
| `feat-midi-export` (`5247c7f`) | `../groove-wt23` **已不存在** | ✅ 仍成立 | **已在 dev**（`git cherry` = 0 个 `+`，补丁等价） |

⇒ **§二 需要改写**：不是"四条在并行"，而是"**四条都收了尾：三条的成果已进 dev，一条（`feat-criteria`）被 dev 的后续决定取代**；四棵 worktree 都已退休"。

### 5.1 哪些"未推送的工作"还没回到 `dev`

**"未推送"的分支共 21 条**（`origin` 上无同名分支且领先 dev）：`audit-verify`、`backup-fa44717`、`build-retire-mirror`、`docs-adjudication`、`feat-criteria`、`feat-graph-split`、`feat-gs1-assessment`、`feat-list-examples`、`feat-midi-export`、`feat-orchestral`、`feat-vsco-articulations`、`feat-vsco2ce`、`feat/genre-mix-loudness`、`fix-headless-silence`、`fix-long-render-timeouts`、`fix-sfz-keyswitch-paths`、`fix-vsco-fetch`、`fix-worker-honesty`、`measure-render-profile`、`next`、`probe-headless-core`。

其中**内容确实还没回到 `dev` 的只有 4 条**：`audit-verify`（活文档）、`feat-graph-split`（WIP 实现）、`feat-criteria`（被取代）、`feat/genre-mix-loudness`（被取代）。**其余 17 条的内容都已在 dev 里**（补丁等价或同题提交）。

---

## 6. 结论：要启动手机砍除，还差哪些合并

### 6.1 "等哪些合并"的明确清单

按业主的规则"**手机砍除要等所有开发分支都完成合并**"，**内容层面还差这几笔**（每条都给了分支名与它领先的提交数）：

| # | 分支 | 领先提交数 | 内容 | 建议动作 |
| ---: | --- | ---: | --- | --- |
| 1 | **`audit-verify`** | **1** | `docs/AUDIT_2026-10-02_PART2.md`（dev 无）；**正在被写** | **落地**（把活文档推上 dev，或并入 `int` 一起推） |
| 2 | **`feat-graph-split`** | **1** | `5df017b` WIP；`src/test/graphSplit.test.ts`、`scripts/measure_graph_split.mjs` **dev 无** | **合并或明确丢弃**——这是唯一还有未合并实现的开发分支 |
| 3 | **`feat-criteria`** | **1** | 一半已在 dev（`8b3f018`）；SFZ 半边**被 dev 取代** | **不要照原样合并**；决定丢弃或按"读出带空格路径"的新语义重写 |
| 4 | **`feat/genre-mix-loudness`** | **1** | 被 dev 更新的 `GENRE_MIX_RESOLVED` 断言取代 | **丢弃** |
| — | `next` | 2 | 补丁等价于 dev | **不合并**；分支应退场（它落后 230，合并会带回旧版本） |
| — | 其余 21 条领先分支 | 1–7 | 补丁等价 / dev 有同题提交 | **不合并**；应**删除**而不是合并 |

**⇒ 一句话**：**真正"卡住手机砍除"的只有 `feat-graph-split` 一条**（加上业主对它的取舍）；`audit-verify` 是并发会话在写的活文档，会自己落地；`feat-criteria` 与 `feat/genre-mix-loudness` 需要的是**"丢弃"这个决定**，而不是一次合并。**没有任何工作树分支（`wt44/45/46/47`、`headless-mcp`、`next`）还有未合并内容。**

### 6.2 手机砍除本身的状态（实测，供判断"能否开工"）

* **砍除尚未执行**：`origin/dev` 上 `src/mobile/` 仍有 **30 个文件**（`MobileApp.tsx`、`screens/`、`skins/`、`vinyl/`…）。
* **但外围已经动了**：`origin/dev` 上 `package.json` 里 **`test:e2e:mobile` 已经不在**（grep 命中 0），`ci.yml` 的矩阵已经是 **desktop-only**（`only: Desktop`，注释写着"the mobile version is cut"）。
* **`mobile-preserved` @ `29e37f6` 已推到 `origin`，且是 `origin/dev` 的祖先（落后 18）** ⇒ 手机版的保全点在 dev 的历史里，砍除**不会丢失历史**。
* ⚠️ **边界（照 §十三.2 记的实测）**：`src/test/iosAudioUnlock.test.ts` 在 dev 上**存在**，它测的是 iOS Safari 静音开关绕过，**不是手机外壳，不能跟着删**。

### 6.3 两个与"能不能开工/推送"直接相关的阻塞

1. **`scripts/push_dev.sh` 会拒绝脏树**（实测脚本内容）：第 2/3 步 `if [ -n "$(git status --porcelain)" ]` → 打印脏文件并以 **1** 退出。**本轮快照时 `groove-int` 的工作树是脏的（1 处）**，`groove-audit`、`groove-headless` 也曾分别出现未提交改动 ⇒ **推送前必须先让工作树干净**。
2. **`groove`（主检出）在 `next` 上，落后 `dev` 230 提交** ⇒ 手机砍除应当在 **`groove-int`（`int` = `origin/dev`）** 上做，不要在 `next` 上做。

---

## 7. 未能判定的

| # | 未能判定的事 | 为什么 |
| ---: | --- | --- |
| 1 | **`feat-graph-split` 该合并还是该丢弃** | 提交自述是 `wip(...): preserve an uncommitted workstream before its worktree is retired`——"保住"本身不是"交付"。仓库里没有任何东西能判出意图，需要业主/主控一句话。 |
| 2 | **`feat-criteria` 的 SFZ 半边要不要按新语义重写** | 它测的"报告截断"与 dev 现在的"读出带空格的路径"是**两个相反的设计**。重写=新工作，不是合并；本盘点只判定"不能照原样合并"。 |
| 3 | **22 条"内容已在 dev 里"的分支能否安全删除** | 我只量到**内容**在 dev 里（`git cherry` 0 个 `+`，或 dev 有同题提交：14 条纯补丁等价 ＋ 8 条有同题提交）。**"可以删"是策略决定**，本盘点不执行删除（规矩：不 `branch -D`）。 |
| 4 | **11 条 `+` 提交里每一处的逐块可合并性** | 我用的判据是**新增文件是否缺于 dev** + **dev 是否有同题提交**（这是决定性的两个信号）。**行级 `not_in_dev` 计数会被"dev 把同一文件改得更晚"污染**（例如 `feat-audio-lane-render` 有 70/705 行不在 dev，但 dev 上有同题 `c0eead2`/`25a2dcd` 且 `offlineAudioLanes.ts` 真实存在）⇒ **我没有对每一个 hunk 逐块验证**。 |
| 5 | **`groove-headless` 的 5 处未提交改动属于谁、要不要提交** | 那是**未提交**的工作（`mcp/registry.ts`、`mcp/render/worker.ts`、`?? mcp/render/headless.ts`），不是提交；本盘点不动它。 |
| 6 | **`release/groove-github` 何时/是否删除** | §十.1 明说"删目录是另一件更大的决定"。我只量到它已脱节（`ed7c6330` 不在 groove 对象库、其 `origin/dev` = `37a7873`），**不判断它是否该删**。 |
| 7 | **`synth/p141`（领先 `master` 4 提交）要不要合** | `synth` **没有 remote**，"未合并"只能相对 `master` 定义；它是**另一个产品的仓库**，不在"groove 的开发分支"范围内（§十四.1）。 |
| 8 | **`1b535ec…_report/` 里的审计结论** | 不是 git 仓库，且 §十三.1 已明记"第 03/04 份的 DSP 与性能结论仍未核"——本盘点不重复审计。 |
| 9 | **本快照的稳定性** | ⚠️ **`origin/dev` 在本轮里移动了三次，`int`/`audit-verify` 的 head 也都在动**（并发会话在推提交）。**§1–§3 的数字是 `9b4910a` 那一刻的值**；结论（§0/§6）只依赖内容归属，不随那三次提交改变。 |

---

## 8. 附：可复现的实测命令

```bash
cd /home/crow/music/groove            # 任意一棵 groove 树都行（remote 是全仓库共享的）
git fetch --all --prune
DEV=$(git rev-parse origin/dev)       # 本快照 = 9b4910a

# 1) 本地分支：SHA / 领先 / 落后 / 是否包含在 dev / 推送状态 / 所在工作树
git branch -vv
git for-each-ref --format='%(refname:short)' refs/heads/ | while read b; do
  echo "$b ahead=$(git rev-list --count $b ^$DEV) behind=$(git rev-list --count $DEV ^$b)"
done

# 2) 远端分支
git branch -r
git ls-remote --heads origin

# 3) 工作树
git worktree list
for p in $(git worktree list --porcelain | awk '/^worktree /{print $2}'); do
  echo "--- $p $(git -C "$p" rev-parse --abbrev-ref HEAD)"
  git -C "$p" status --short | head
  echo "ahead=$(git -C "$p" rev-list --count HEAD ^$DEV)"
done

# 4) 内容在不在 dev 里（关键判据）
git cherry $DEV <branch>                                   # '+' = 补丁不在 dev
git log --format=%h $DEV --grep="<分支提交的主题>" -F        # dev 上的同题提交
git diff --name-status --diff-filter=A $DEV...<branch>     # 分支新增的文件
git cat-file -e $DEV:<新增文件>                              # 该文件在 dev 里是否存在

# 5) 与手机砍除的冲突面（实测全为 0）
git diff --name-only $DEV...<branch> -- src/mobile
git diff --name-only $DEV...<branch> -- .github/workflows/ci.yml

# 6) 同级目录
git -C /home/crow/music/synth  remote -v ; git -C /home/crow/music/void remote -v
git -C /home/crow/music/release/groove-github rev-parse --git-dir HEAD
```

**没有执行的命令**（规矩：这是盘点，不是整理）：`git merge`、`git rebase`、`git checkout`、`git worktree remove`、`git worktree prune`、`git branch -D`、`git push`、`git reset`。
