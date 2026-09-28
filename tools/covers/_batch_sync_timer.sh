#!/bin/bash
# Lock-aware incremental artifact pull, every 5 minutes.  Run names come from
# _batch_scratch/SYNC_RUNS.txt (first line = main run, owns REMOTE_ACTIVE).
C=/home/crow/music/groove/public/covers
exec 9>/tmp/covers_sync_timer.lock
if ! flock -n 9; then
  echo "another sync timer already holds the lock; exiting" >> $C/_batch_scratch/sync.stdout
  exit 0
fi
echo $$ > $C/_batch_scratch/sync_timer.pid
while true; do
  FIRST=1
  while read -r R; do
    [ -n "$R" ] || continue
    if [ "$FIRST" = "1" ]; then
      CG_SYNC_RUN="$R" CG_SYNC_MARKER=1 \
        /home/crow/.venv/bin/python $C/_batch_sync.py >> $C/_batch_scratch/sync.stdout 2>&1
      FIRST=0
    else
      CG_SYNC_RUN="$R" CG_SYNC_STAGING=$C/_batch_scratch/fetched_$R \
        CG_SYNC_MANIFEST=$C/_batch_scratch/sync_manifest_$R.json \
        /home/crow/.venv/bin/python $C/_batch_sync.py >> $C/_batch_scratch/sync.stdout 2>&1
    fi
  done < $C/_batch_scratch/SYNC_RUNS.txt
  sleep 300
done
