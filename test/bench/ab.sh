#!/bin/bash
# One heat: house + previous commit (HEAD) + working tree, N timed rounds (plus the warm-up), then the net trimmed
# means and the paired new-vs-previous statistics.   test/bench/ab.sh [rounds=31] [seed=1]
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
KIT=${MAKEFUN_KIT:-/d/sitegen/site-generator-speed-01-run-20261122-kit}
S=${SCRATCH:-/c/Users/hp/AppData/Local/Temp/claude/ceea36f34653e0a0/94bf1bf9-35cf-4da0-bbb6-ef7075204421/scratchpad}
R=${1:-31}; SEED=${2:-1}
rm -rf "$S/prev" && mkdir -p "$S/prev" && (cd "$ROOT" && git archive HEAD) | tar -x -C "$S/prev"
SW=$(cygpath -w "$S"); RW=$(cygpath -w "$ROOT"); KW=$(cygpath -w "$KIT")
powershell -NoProfile -File "$RW\test\bench\cpu.ps1" -InputDir "$KW\practice\input" -Rounds $((R+1)) -Seed "$SEED" -Out "$SW\ab.csv" \
  -Entries "house=$KW\baselines\makefun-site\main.ts","prev=$SW\prev\main.ts","new=$RW\main.ts"
node "$ROOT/test/bench/summarize.mjs" "$S/ab.csv" | cut -c1-60
node "$ROOT/test/bench/paired.mjs" "$S/ab.csv" prev new
