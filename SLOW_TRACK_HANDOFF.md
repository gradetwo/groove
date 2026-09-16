# 慢轨交接（Slow-track handoff）

> 目的：把「几十分钟到几小时」的慢轨门禁与基线测量，从我这边（慢机器）交到快机器上执行，
> 只把一个带完整证据与校验和的压缩包带回来。工具：`scripts/slow_pack.mjs`。

## 1. 为什么需要它

`npm run slow` 有两个不适合长跑的问题：

1. **fail-fast**：第一个红门禁直接 `exit`，后面的门禁根本没跑，你拿不到「还有哪些坏了」；
2. **证据只存在于终端**：日志一滚就没了，换台机器重跑又不知道结果是否可归属到同一个提交。

`slow_pack.mjs` 修掉这两点：**每个门禁都跑**（不管前面是否已经红了），每个门禁的完整输出
落进自己的日志，抽出关键数字写进 `SUMMARY.md`，最后把日志 + 实测产物 + **精确 git 状态** +
**逐文件 SHA-256** 打成一个包。包可以被独立校验，因此「结果属于哪个提交、有没有被改过」不需要信任。

## 2. 四个模式

```bash
node scripts/slow_pack.mjs list                    # 只打印计划，不产生任何副作用
node scripts/slow_pack.mjs export [--out <dir>]    # 把「当前这棵树」打包，便于拷到快机器
node scripts/slow_pack.mjs run [flags]             # 跑全部门禁并打包证据
node scripts/slow_pack.mjs verify <dir|tar.gz>     # 校验回来的包（哈希 + 完整性）
```

对应 npm 脚本：`npm run slow:pack` / `npm run slow:export` / `npm run slow:verify`。

`run` 的开关：

| 开关 | 作用 |
|------|------|
| `--label <name>` | 包名，默认 `v<版本>_<sha7>_<时间戳>` |
| `--out <dir>` | 输出目录，默认 `slowpack-out/`（已加入 `.gitignore`） |
| `--measure` | 额外跑四个小时级的基线测量（响度 / 音色 / GS-1 负载 / GS-1 抖动） |
| `--install` | 跑门禁前先 `npm ci`（新机器） |
| `--only a,b` / `--skip a,b` | 只跑 / 跳过指定门禁；**会被记录成 PARTIAL 包** |
| `--timeout-scale <n>` | 所有门禁超时乘以 n（慢机器给 2） |
| `--no-tarball` / `--quiet` | 只留目录 / 不往终端刷日志 |
| `--selftest` | 用两个假门禁（一绿一红）自检打包与失败路径，不需要真跑回归 |

退出码：**0** 全绿 · **3** 包已生成但有红门禁 · **4** 打包器自身出错。
注意 3 是「有结果可读」，不是失败——包照样可用。

## 3. 快机器上的完整流程

```bash
# ① 把这棵树带过去（仓库没有 remote，所以用 export 而不是 git clone）
node scripts/slow_pack.mjs export --label v2.0.17-src
#   -> slowpack-out/slowpack-v2.0.17-src.tar.gz  (~2 MB)

# ② 快机器上（建议解到任何 git 检出之外；包自带一次性 git，解在别处也能跑）
tar xzf slowpack-v2.0.18-src.tar.gz && cd slowpack-v2.0.18-src
git apply --whitespace=nowarn changes.patch      # 只有树是脏的时候才需要
npm ci
npx playwright install chromium firefox webkit   # E2E 矩阵与性能门禁需要真浏览器

# ③ 先看计划，再跑（CPU 越快越省时间）
node scripts/slow_pack.mjs list
node scripts/slow_pack.mjs run --label v2.0.18
#   需要重新测量基线时（小时级）：
node scripts/slow_pack.mjs run --label v2.0.18-measured --measure

# ④ 把这两个文件发回来
#   slowpack-v2.0.18.tar.gz
#   slowpack-v2.0.18.tar.gz.sha256
```

## 4. 包回来之后

```bash
node scripts/slow_pack.mjs verify slowpack-out/slowpack-v2.0.18.tar.gz
```

`verify` 做四件事，任何一件不过就退出 1：

1. **容器校验**：如果 `.sha256` 一起回来了，先核对压缩包本身的摘要；
2. **逐文件校验**：`MANIFEST.json` 里每个文件的字节数与 SHA-256 必须与实际一致（多余文件会列出但不算错）；
3. **完整性**：计划里的门禁是否都在包里（有 `--only`/`--skip` 的按它自己声明的范围核对），每个非跳过门禁是否都有日志；
4. **可归属**：记录的提交在本仓库是否存在；`git/changes.patch` 是否能**正向**或**反向**应用
   （反向可应用 = 这棵树本来就含这份改动，是本地核对的正常情形；两个方向都不行才会报错）。

`verify` 会把红门禁的关键证据行直接打出来，所以「哪些门禁红了、红在哪一行」不必解开压缩包看。

## 5. 测量产物不会被写回基线

四个测量脚本都支持 `--out`，`run --measure` 因此把结果写进包里：

```
artifacts/loudness.measured.json
artifacts/timbre.measured.json
artifacts/gs1.load.measured.json
artifacts/gs1.jitter.measured.json
```

**committed 的 `scripts/*.baseline.json` 在整个流程里不会被覆盖**——这是刻意的：一台新机器的测量
不该静默改写基线。包回来之后，`SUMMARY.md` 的「Fresh measurement vs committed baseline」一节会给出
新测量与已提交基线的对比（比较了多少个曲风、最大 / 平均 |Δ|、差得最远的五个），
这才是第二台机器唯一能回答的问题：**我们提交的基线，是「这套代码的性质」还是「那台机器的怪癖」**。

## 6. 诚实说明

- `run` 只证明**在那台机器上、那个提交（或那份 patch）上**这些自动检查通过了；它不是听感复核，也不是正确性证明。
- 记为 `skipped` 的门禁**没有被执行**，原因写在 `MANIFEST.json` 的 `args` 里；`--only`/`--skip` 产生的包在
  `SUMMARY.md` 顶部和 `verify` 输出里都会标成 **PARTIAL**，不要当成发布门禁。
- 门禁耗时只在同一台机器内可比；换机器后数字变化本身不是结论。
- 四个测量脚本**不在** `slow` 轨道里，只有 `--measure` 才会跑——因为它们是小时级的，
  而慢轨门禁分钟级。门禁读的是已提交的基线，不是现测的数据。
- `scripts/slow_pack.mjs` 本身**没有单元测试**：它的正确性靠 `--selftest`（绿 + 红两条路径）、
  一次真实的 `run --only docs,redlines`，以及 `verify` 的自校验来证明——这三样都在本轮跑过，
  期间确实抓出并修掉了四个真实缺陷（truncated patch、SUMMARY 未被哈希、子集包被误判为不完整、反向 patch 被误判为不可归属）。

## 7. 一次真实事故：解到别人的检出里面（v2.0.18 的两次红门禁）

回来的包里 `data-lint` 与 `suite` 红，日志是：

```
RUN  v2.1.9 /Users/crow/work/music/groove/slowpack-v2.0.18-src
Error: Failed to load url /Users/crow/work/music/groove/src/test/setup.ts …
Test Files  120 failed (120)      Tests  no tests
```

**一个断言都没有跑**：包被解到了 `/Users/crow/work/music/groove/` 这个已有检出里面的
`slowpack-v2.0.18-src/`，于是 Vite/Vitest 解析测试 setup 时按**外层 worktree** 找，找到的是外层的
路径，120 个测试文件全部无法加载。代码没问题——同一份包里的 `e2e`（7 端、67.8s）、`build`、
`budget`、`perf`、四个证据门禁、GS-1 契约 25 项、typecheck、lint、红线**全部通过**。

### 7.1 现在有三种防线（其中两条是根治）

1. **根治其一**：`vitest.config.ts` 的 `setupFiles` 改成绝对路径
   （`path.resolve(__dirname, './src/test/setup.ts')`）。原来那个相对路径由 Vitest 按它自己的
   project root 解析，嵌套启动时就会指到外层 worktree——这正是 120 个文件全部无法加载的直接原因。
2. **根治其二**：导出包**自带一个一次性 git 仓库**。`git archive` 出来的树没有 `.git`，
   而 `redlines` 里有一条检查用 `git ls-files`（R4a/R5a/R9a 靠它知道哪些文件被跟踪）。
   第二次运行剩下的那一个红门禁就是它：`fatal: not a git repository`。现在 `run` 会在临时目录里
   建一个单提交仓库、用 `GIT_DIR`/`GIT_WORK_TREE` 指向它跑门禁、跑完删掉；`COMMIT.txt` 仍是
   **唯一权威**的版本来源（清单里写明 attribution）。
3. **兜底 preflight**：`package.json` / `vitest.config.ts` / `src/test/setup.ts` 是否在、
   `node_modules` 是否装了——不通过直接 `exit 4`，**一条门禁都不跑**，可用 `--continue-anyway`
   覆盖。另外「解在别人的检出里」现在只作为**警告**打印（两条根因都已根治，结果依然有效），
   不再拒绝运行。

实测：在一个没有 `.git` 的导出树里跑 `run --only redlines` → **PASS**（0.6s，借用一次性仓库）；
`verify` 正确报出 `attribution: COMMIT.txt`。

### 7.2 归属判定改成看证据，而不是看一个布尔

那次包的 `MANIFEST` 说 `dirty: true` 但 `changes.patch` 是 0 字节，于是旧版 `verify` 判
「结果不可归属」。真实情况是：唯一的变化是**未跟踪**的 `?? slowpack-v2.0.18-src/`
（也就是解包出来的目录本身），而补丁只能携带**已跟踪文件的改动**。现在：

- `dirty` 只表示「已跟踪文件与 HEAD 不同」；未跟踪文件单独记录；
- `verify` 用证据判断：`trackedChanges` 非空且补丁为空才算不可归属；
  旧清单没有该字段时，从记录下来的 `status --porcelain` 里剔除 `??`/`!!` 行推算；
- 显示上不再把干净的树说成 dirty。

### 7.3 macOS 重新打包会产生 `._*`

用 Mac 的 `tar` 重打包（或在 Finder 里拷贝）会给每个条目加上 AppleDouble 资源叉
（`._MANIFEST.json`、`._logs` …）。`verify` 现在把它们识别为**元数据并忽略**，只报告数量，
而不是当成 28 个「包外文件」——否则真正的问题（有没有重要文件没进哈希清单）会被噪音淹没。
