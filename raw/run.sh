#!/bin/bash
S=/tmp/claude-0/-home-user-NoaCG-Studio/7ab597b4-4750-5b1d-afbe-87fc7a85bb7e/scratchpad
cd /home/user/NoaCG-Studio/.claude/worktrees/measure
out=$(eval "$(node $S/gen.mjs $1 $2)"); id=$(echo "$out" | grep -o '^j-[0-9]*' | head -1)
echo "$1 w$2 job=$id start=$(date -u +%T)"
node scripts/jobs.mjs wait $id > /tmp/claude-wait-$id.txt 2>&1
echo "wait-exit=$? $(head -1 /tmp/claude-wait-$id.txt) end=$(date -u +%T)"
node $S/sum.mjs claude-$1-workers$2
