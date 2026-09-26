#!/usr/bin/env bash
# Compact status line for the cover batch (cheap to call every goal round).
cd "$(dirname "$0")" || exit 1
n=$(ls */*.jpg 2>/dev/null | wc -l)
r=$(ls _rejected/*/*.jpg 2>/dev/null | wc -l)
last=$(ls -t */*.jpg 2>/dev/null | head -1)
age=$(( $(date +%s) - $(date -r "$last" +%s) ))
cp=$(grep -c CHECKPOINT _batch_progress.log 2>/dev/null)
rj=$(grep -c "REGEN-OK" _batch_progress.log 2>/dev/null)
echo "n=$n/954 rejected=$r regen_ok=$rj checkpoints=$cp last=$(basename "$last") age=${age}s $(date +%H:%M:%S)"
