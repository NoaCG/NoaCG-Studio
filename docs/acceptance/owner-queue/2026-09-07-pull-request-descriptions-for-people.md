---
kind: agent
date: 2026-09-07
---
## Re-kinded to `agent`, 2026-09-10 - restored rather than dropped

This item was dropped during the four-reasons drain, on the argument that how a commit subject is
written is already a landed rule and a second ruling from the owner adds nothing. The review of
that drain found the argument answers only one of the item's three questions. The other two -
*"Does it tell you what the change does in words you would use? Is it short enough that you read
all of it?"* - are about the rendered description on the pull request, which no rule asserts.

So it comes back, as `agent` rather than as a drop. An agent can open the newest merged pull
request, read its description cold and judge it against the commit-message rule, which is what the
question actually needs; and a drop is the one outcome nobody can recover from, so it was the wrong
one to reach for on a split argument. The original text follows, unchanged.

# Pull request descriptions written for a person

Landing pull requests used to carry one machine line: "Landed by the queue. reviewed by /check at
abc12345 (pass)." Now the title is the branch's first commit subject and the body says what
changed (every commit subject), optionally why, and how it was tested.

**Route, under a minute.** Open the newest merged pull request on
https://github.com/NoaCG/NoaCG-Studio/pulls?q=is%3Apr+sort%3Aupdated-desc and read the
description without scrolling.

**What to look at.** Does it tell you what the change does in words you would use? Is it short
enough that you read all of it? If a line reads as agent or machine language, say which one - the
text comes from the commit subjects, so the fix is either the description template
(`scripts/pr-description.mjs`) or how commits are written.
