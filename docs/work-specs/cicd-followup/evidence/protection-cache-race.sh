#!/bin/bash
# Lists every Playwright config of a checkout at once, as scripts/check-e2e-protection.mjs does,
# from a cold compile cache, and counts the rounds where a listing failed on a cut-off module.
#   protection-cache-race.sh <checkout with node_modules> <rounds> shared|separate
# shared: one PWTEST_CACHE_DIR for all listings (the check before the fix).
# separate: one PWTEST_CACHE_DIR per listing (the check after the fix).
set -u
TREE=$1; ROUNDS=$2; MODE=$3
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
cd "$TREE" || exit 2
fails=0
for i in $(seq 1 "$ROUNDS"); do
  rm -rf "$WORK/cache"; mkdir -p "$WORK/cache"; pids=()
  for c in playwright*.config.ts; do
    dir="$WORK/cache"; [ "$MODE" = separate ] && dir="$WORK/cache/$c"
    PWTEST_CACHE_DIR="$dir" timeout 120 node node_modules/@playwright/test/cli.js test --list --pass-with-no-tests --config "$c" > "$WORK/out-$c.txt" 2>&1 &
    pids+=($!)
  done
  for p in "${pids[@]}"; do wait "$p"; done
  if grep -qs "does not provide\|SyntaxError" "$WORK"/out-*.txt; then
    fails=$((fails + 1)); grep -hs "does not provide" "$WORK"/out-*.txt | head -1
  fi
done
echo "$MODE: $fails of $ROUNDS rounds failed"
