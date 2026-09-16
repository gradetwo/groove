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

# ② 快机器上
tar xzf slowpack-v2.0.17-src.tar.gz && cd slowpack-v2.0.17-src
git apply --whitespace=nowarn changes.patch      # 只有树是脏的时候才需要
npm ci
npx playwright install chromium firefox webkit   # E2E 矩阵与性能门禁需要真浏览器

# ③ 先看计划，再跑（CPU 越快越省时间）
node scripts/slow_pack.mjs list
node scripts/slow_pack.mjs run --label v2.0.17
#   需要重新测量基线时（小时级）：
node scripts/slow_pack.mjs run --label v2.0.17-measured --measure

# ④ 把这两个文件发回来
#   slowpack-v2.0.17.tar.gz
#   slowpack-v2.0.17.tar.gz.sha256
```

## 4. 包回来之后

```bash
node scripts/slow_pack.mjs verify slowpack-out/slowpack-v2.0.17.tar.gz
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
