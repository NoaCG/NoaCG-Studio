---
kind: walk
date: 2026-09-19
because: direction
serves: now
answered: false
---
# Open the editor Alpha from the wizard

The wizard homepage has an Open editor Alpha link. It opens the current graphic in the
R1.0 foundation without Advanced mode. Phone portrait and landscape views stack the
canvas, Properties and timeline so the graphic remains useful to look at.

## Route in under a minute

Deployed as cfb28e74 through PR #331. Open [the wizard](https://noacg.studio/app#/new) and
choose **Open editor Alpha**. Or bookmark
[the direct Alpha route](https://noacg.studio/app?editor=foundation#/editor-foundation).
Live engineering check j-1422 passed. Owner feedback requested this shortcut and phone viewing; the subsequent missing-link report was traced to unmerged local work and resolved by the verified deployment. Owner usability confirmation remains pending.

## What to look at

Check that the shortcut is easy to find beside the headline on desktop and below it
on phone. The current graphic opens visibly; scroll down to Properties and the timeline
on phone, scrub the ruler, then use Home. R1.0 authoring remains read-only.

[Verification and actual screenshots](../../research/editor-r1-foundation/README.md#wizard-shortcut-and-phone-viewing)
record the viewport checks. This change does not claim physical phone-browser coverage.
R1.1a is the next bounded slice; see the linked review and handoff. This item remains unanswered until owner review.
