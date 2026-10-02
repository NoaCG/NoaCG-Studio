#!/bin/sh
# Collects one cell's evidence into ../cells/<cell>/ after its builder finished: the validate and
# inspect output, two CLI frames over the CLI's video-like ground (the same two shots for every
# cell, so the reviewer compares like with like), and the studio walk (walk-cell.mjs).
# Usage: collect-cell.sh <cell> <package-dir> <zip> [steps.json]
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/../cells/$1"
export PATH=/c/claude/cj-bench-2026-10-02/bin:$PATH NOACG_URL=http://localhost:5206
mkdir -p "$OUT/studio"
noacg validate "$3" > "$OUT/validate.txt" 2>&1; echo "exit $?" >> "$OUT/validate.txt"
noacg inspect "$2" > "$OUT/inspect.txt" 2>&1
noacg screenshot "$2" --state onair --background video --out "$OUT/cli-onair-video.png" > /dev/null 2>&1 || echo "onair render failed" >> "$OUT/validate.txt"
noacg screenshot "$2" --state stress --background video --out "$OUT/cli-stress-video.png" > /dev/null 2>&1 || echo "stress render failed" >> "$OUT/validate.txt"
node "$HERE/walk-cell.mjs" "$3" "$OUT/studio" ${4:+"$4"} > /dev/null 2>&1
tail -n 3 "$OUT/validate.txt"
grep -E '^(reach|actions|FAILED|pageerror)' "$OUT/studio/walk-log.txt"
