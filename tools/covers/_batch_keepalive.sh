#!/bin/bash
# Touch the Colab session API while a detached remote run is alive.
# A remote-only loop never calls the session API, so Colab's idle reaper sees the
# session as idle and reclaims it after ~60 min (this cost us two G4s).
# Usage: _batch_keepalive.sh <session-name>   (default: $CG_SESSION or batch3)
C=/home/crow/music/groove/public/covers
SESSION="${1:-${CG_SESSION:-batch3}}"
exec 8>/tmp/covers_keepalive.lock
flock -n 8 || { echo "keepalive already running" >> $C/_batch_scratch/keepalive.log; exit 0; }
echo $$ > $C/_batch_scratch/keepalive.pid
n=0
while true; do
  n=$((n+1))
  S=$(colabgen status -s "$SESSION" 2>&1)
  if [ $((n % 15)) -eq 1 ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) keepalive session=$SESSION $(echo "$S" | grep -E 'session |idle ' | tr '\n' ' ')" >> $C/_batch_scratch/keepalive.log
  fi
  case "$S" in *"not running"*|*"is not running"*) echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) keepalive: session $SESSION DOWN" >> $C/_batch_scratch/keepalive.log; exit 0;; esac
  sleep 240
done
