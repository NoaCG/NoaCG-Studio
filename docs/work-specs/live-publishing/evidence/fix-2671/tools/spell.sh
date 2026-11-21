#!/bin/bash
# A 6 s slow spell every 15 s for $1 seconds (the proxy holds traffic while the flag file exists).
F=/tmp/claude-0/-home-user-NoaCG-Studio/5dca23fa-bfdf-587f-977f-1dfa3bae181f/scratchpad/SLOW
trap 'rm -f $F' EXIT
end=$((SECONDS + ${1:-100}))
while [ $SECONDS -lt $end ]; do sleep 9; touch $F; sleep 6; rm -f $F; done
