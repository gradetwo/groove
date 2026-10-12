#!/usr/bin/env bash
# 只读 `dev` 分支的门禁状态，并按【行】给出判词。
#
# 业主的规矩：门禁在 dev，main 的分支 CI 平时不看。此前我两次读错：
#   1) 用 `completed +success`（空格）去匹配制表符分隔的列 → 一个都没匹配，报 0 失败；
#   2) 硬编码 `$4=="dev"` → 而 `in_progress` 行的空字段会让列号移位，分支名落在 `$5`。
# 所以这里不猜列号：先找出哪一列的值是 `dev`，再只看那些行。
set -uo pipefail
raw="$(timeout 150 npm run --silent ci:status 2>/dev/null)"
branch_col="$(printf '%s\n' "$raw" | awk -F'\t' '
  /^(completed|in_progress)/ { for (i = 1; i <= NF; i++) if ($i == "dev") { print i; exit } }
')"
if [ -z "$branch_col" ]; then
  echo "读不到 dev 的行 ✗（计数不可信，按规矩不推）"; exit 2
fi
rows="$(printf '%s\n' "$raw" | awk -F'\t' -v c="$branch_col" '$c == "dev"')"
[ -z "$rows" ] && { echo "dev 没有任何运行 ✗（同样不推）"; exit 2; }
printf '%s\n' "$rows" | head -3 | cut -c1-96
newest="$(printf '%s\n' "$rows" | head -1)"
fails="$(printf '%s\n' "$rows" | grep -cE 'completed[[:space:]]+(failure|failed|cancelled)' || true)"
if printf '%s' "$newest" | grep -qE '^in_progress'; then
  echo "⇒ 最新一笔仍在跑，不推 ✗"
elif printf '%s' "$newest" | grep -qE 'completed[[:space:]]+success'; then
  echo "⇒ 最新一笔 dev 已绿 ✓（dev 内失败计数 = $fails）"
else
  echo "⇒ 最新一笔不是 success，不推 ✗"; exit 1
fi
