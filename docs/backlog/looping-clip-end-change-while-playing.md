---
v: 2
source: owner
kind: ask
raised: 2026-09-30
state: unstarted
asked: "If you have a looping video and you change it mid-video playout to play next, it doesn't register that. It would be nice if it would be possible to switch everything while we are live. Let's not break our backs because of this."
size: small
touches: cli/src/playout/, src/control/serverPlayout.ts
needs-owner: none
---

# Changing a playing clip from loop to "play next" takes effect

## Why

In the studio on 2026-09-30 a clip was playing on loop through NoaCG Bridge; changing its end
behaviour to "play next" while it played did nothing. An operator decides this live (let the
opener loop until the host is ready, then move on), so the change should reach the running clip.
The owner called it a nice-to-have.

## What it would take

- Check whether CasparCG can change looping on a clip that is already playing (for example
  `CALL <channel-layer> LOOP 0` on 2.3 and 2.5), and whether Bridge's sequence runner can then play
  the next item when that clip ends.
- If CasparCG cannot, say so on the clip's row rather than silently ignoring the change.
