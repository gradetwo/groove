# 搬机器前的暂停笔记（2026-09-30）

**状态：没有半发布。** 线上仍是 **2.34.33**，`v2.34.34` 标签未创建，发布在"全量 CI"这一步被停掉（部署在它之后，所以什么都没发出去）。所有长任务（release、ci_full）与 agent 都已停止。

## 搬完之后要做的第一件事

```bash
cd /home/crow/music/groove && npm run push:dev -- "release: v2.34.34"   # 门禁 + 推 dev（含已经提交的版本与发布说明）
bash scripts/release.sh                                                 # 重新发布 2.34.34
```

发布说明与版本已经在主树里提交（181 字，六条）。

## 未提交 / 半成品（都在工作树里，未推）

| 工作树 | 分支 | 状态 |
| --- | --- | --- |
| `../groove-wt11` | `feat-sfz-loop` | **已推、远程绿**：`loop_mode=one_shot`（松键不停） |
| `../groove-wt14` | `feat-graph-split` | agent 被中断，未提交；TRACK B 的图拆解（测量接缝 + 探针 + CI 步骤） |
| 主树 | `next` | 干净，含界面改造 + 探针修复的合并 |

## 一件正在手上、**必须接着做**的事

**掐断组的语义被实测证明是反的。** 用 sfizz 做的频率选择性测量：

| 写法 | 掐断后 440Hz（被掐的） | 掐断后 1500Hz（触发的） | 结论 |
| --- | --- | --- | --- |
| 开镲 `off_by=2`、闭镲 `group=2` | **0.0002**（消失） | 0.0503 | ✅ 掐断 |
| 闭镲 `off_by=1`、开镲 `group=1` | **0.0502**（还在响） | 0.0503 | ❌ 不掐断 |

结论：**`off_by=N` 写在被停掉的音区上，意思是"当 N 组发声时停掉我"（受害者指认凶手）**。我们的 `playerFromEngine` 实现成了"我来停掉 N 组"，而判据编码的是这个错误读法，所以一直是绿的。

修法（两处反转）：起音时 `choke(note.group)`（而不是 `note.offBy`），登记时 `rememberGroup(note.offBy, voice)`（而不是 `note.group`）。改完必须**重写 `src/test/sfzChokeGroups.test.ts` 的判据**并把实测数字写进注释与 `docs/SAMPLE_LIBRARY_INTEGRATION.md`。

## 其他待办（按价值）

1. **TRACK B 车道曲线数字**：CI 的 `manual-verify scope=audio` 里 "Lane cost curve" 那一步的结果还没取回；取回后写进 `docs/RENDER_PROFILE.md`（该文档写明"本机拿不到，属于 CI"，不要编数字）。
2. **入口体积只剩 0.1 KB**（226.9/227）：编排整条路由虽然懒加载，但布局 agent 报告 `index.js` 涨了 0.8 KB。值得实测并做路由拆分（`studio` 与 `new` 都静态引用编排组件）。
3. `dev` 已推两次（`d8991cf9`、`537edec8`），其 CI 结果未读。

## 纪律提醒（这一轮又踩到的）

- 推送/发布的门禁跑着时**不要动主树**（这一轮因此白跑了两次推送）。要动就开 worktree。
- 不要用 `grep -c` 的数字代替读错误（`replaceAll` 那次）；也不要让 `pkill -f` 的模式匹配到自己的命令行。

## 那条曲线所在的 CI 运行

**运行编号 `36698283048`**（分支 `fix-sfz-probe`），在 GitHub 上继续跑，不依赖本机。搬完后先读它：

```bash
cd ../release/groove-github
gh run view 36698283048 --log | grep -iE "lane|peak|ms"
```

"Real instrument, end to end" 那一步已经是 **success**（探针修复生效），曲线那一步是它后面的慢步骤。
