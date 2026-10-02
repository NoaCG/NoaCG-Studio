#!/bin/sh
# Collects one cell's evidence into ../cells/<cell>/ after its builder finished: the validate and
# inspect output, two CLI frames over the CLI's video-like ground (the same two shots for every
# cell, so the reviewer compares like with like), and the studio walk (walk-cell.mjs). Frames are
# then made small enough to commit: the CLI frames become JPEG and the page shots (taken at 2x)
# are scaled to the 1600x900 window they show. Needs ffmpeg on PATH.
# BENCH is the run folder whose bin/ holds the `noacg` shim for this checkout's CLI build.
# Usage: collect-cell.sh <cell> <package-dir> <zip> [steps.json]
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/../cells/$1"
BENCH=${BENCH:-/c/claude/cj-bench-2026-10-02}
export PATH=$BENCH/bin:$PATH NOACG_URL=${NOACG_URL:-http://localhost:5206}
mkdir -p "$OUT/studio"
noacg validate "$3" > "$OUT/validate.txt" 2>&1; echo "exit $?" >> "$OUT/validate.txt"
noacg inspect "$2" > "$OUT/inspect.txt" 2>&1
for state in onair stress; do
  png="$OUT/cli-$state-video.png"
  if noacg screenshot "$2" --state $state --background video --out "$png" > /dev/null 2>&1; then
    ffmpeg -y -loglevel error -i "$png" -q:v 3 "${png%.png}.jpg" && rm "$png"
  else
    echo "$state render failed" >> "$OUT/validate.txt"
  fi
done
node "$HERE/walk-cell.mjs" "$3" "$OUT/studio" ${4:+"$4"} > /dev/null 2>&1
for page in "$OUT"/studio/*-page.jpg; do
  [ -f "$page" ] || continue
  ffmpeg -y -loglevel error -i "$page" -vf scale=1600:-1 -q:v 4 "$page.tmp.jpg" && mv "$page.tmp.jpg" "$page"
done
tail -n 3 "$OUT/validate.txt"
grep -E '^(reach|actions|FAILED|pageerror)' "$OUT/studio/walk-log.txt"
