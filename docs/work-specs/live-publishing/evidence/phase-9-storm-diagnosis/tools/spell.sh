#!/bin/bash
# A 6 s slow spell every 15 s for $1 seconds.
F=/tmp/claude-0/-home-user-NoaCG-Studio/95dcffd7-8d01-5b08-b4b4-26416103bc99/scratchpad/SLOW
trap 'rm -f $F' EXIT
end=$((SECONDS + ${1:-100}))
while [ $SECONDS -lt $end ]; do sleep 9; touch $F; sleep 6; rm -f $F; done
