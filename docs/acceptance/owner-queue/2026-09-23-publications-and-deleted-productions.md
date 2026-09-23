---
kind: walk-p
date: 2026-09-23
because: money
---
# Publications stay until you unpublish or delete, and deleting now unpublishes

Measured on production today: 19 publications take 13 MB of a 63 MB database on an 8 GB plan. A
publication nobody has open costs its one database row and nothing else: no storage, no server
function, no connection. Connections, polling and bandwidth exist only while an output or control
page is open, which is somebody using it. So there is no expiry: it would save kilobytes and break
the output URL an OBS or vMix preset holds for next month's show.

What was wrong: 5 of the 19 were productions their owners had deleted, still live with working
links. Deleting a published production now asks "Delete and unpublish?" and unpublishes it, and a
nightly database job (migration 0061) unpublishes whatever a delete made elsewhere left behind. It
only removes a publication whose owner deleted it more than a day ago and whose output nobody has
shown for a day. It ran once when it applied, so those five are gone. Re-publishing a production
gets its same links back.

## The route, under a minute

`docs/CLOUD_PLAYOUT.md`, the section "Publication lifecycle" - the numbers, the decision, and the
point to revisit (about 1 GB or 2,000 publications, when a dormancy rule would start to pay).

**What to look at.** Only whether you agree with "no expiry". If you would rather have one, the
doc names the rule that would be safe. Branch `claude/intelligent-gates-rlo5fp`.
