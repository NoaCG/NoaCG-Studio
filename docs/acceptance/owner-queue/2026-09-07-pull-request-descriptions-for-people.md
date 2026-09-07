---
kind: walk
date: 2026-09-07
---
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
