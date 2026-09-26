#!/bin/bash
# Watcher for the genre-cover batch. Prints only new anomaly/skin-transition lines.
# Quiet while healthy, so any output means something happened.
COVERS=/home/crow/music/groove/public/covers
LOG=$COVERS/_batch_progress.log
SEEN=/tmp/_batch_watch_seen
CYCLES=${1:-20}
SLEEP=${2:-60}
RUNNER_PID=$(pgrep -f "_batch_runner.py" | head -1)
[ -f "$SEEN" ] || echo 0 > "$SEEN"

for i in $(seq 1 "$CYCLES"); do
  if [ -z "$RUNNER_PID" ] || ! kill -0 "$RUNNER_PID" 2>/dev/null; then
    echo "WATCHER: runner PID '$RUNNER_PID' is GONE at $(date -u +%H:%M:%SZ)"
    tail -3 "$LOG"
    exit 0
  fi
  N=$(wc -l < "$LOG" 2>/dev/null || echo 0)
  P=$(cat "$SEEN")
  if [ "$N" -gt "$P" ]; then
    NEW=$(tail -n $((N - P)) "$LOG" | grep -E "SKIN-DONE|BATCH-END|FAIL|GEN-FAIL|BATCH-INTERRUPTED|UNVERIFIED|CHECKPOINT")
    [ -n "$NEW" ] && echo "$NEW"
    echo "$N" > "$SEEN"
    if echo "$NEW" | grep -qE "BATCH-END|BATCH-INTERRUPTED"; then exit 0; fi
    if [ "$(echo "$NEW" | grep -c "FAIL")" -ge 3 ]; then
      echo "WATCHER: >=3 FAILs in the last interval — session health:"
      colabgen status -s batch 2>&1 | sed -n '2,7p'
    fi
  fi
  if [ "$i" = "$CYCLES" ]; then
    OK=$(grep -c " OK " "$LOG")
    FL=$(grep -c "FAIL" "$LOG")
    echo "WATCHER heartbeat $(date -u +%H:%M:%SZ) ok=$OK faillines=$FL lastline=$(tail -1 "$LOG" | cut -c1-19) runner=alive"
  fi
  sleep "$SLEEP"
done
