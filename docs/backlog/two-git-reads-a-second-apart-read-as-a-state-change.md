---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: advanced
note: the defect is fixed and the incident is written out at scripts/wave-tick.mjs:154-171 (row AQ, PR on claude/aq-phantom-landing); what is left is the general rule, which wants `npm run learn` from a quiet tree, and one sentence in night.md
serves: NOW
size: small
touches: .agent-workflows/orchestrator/night.md, contracts/rules/
needs-owner: none
---

# The lesson behind the phantom landing has not been recorded as a rule

**Filed:** 2026-09-10. **Source:** row AQ, 2026-09-09 -
`git show 4f95444b:docs/handoffs/2026-09-09-aq-phantom-landing.md`, "What this row deliberately did
not do".

## Why

The defect is fixed. The night loop told the orchestrator that `claude/ac-harness-verdict` had landed
four minutes after it was created with nothing on it, and again an hour later when it really landed -
so a planned follow-on could fire against work that did not exist. `scripts/wave-tick.mjs:154-171`
now carries the fix, the cause and the two timestamped tick numbers, and four tests in
`scripts/wave-tick.test.mjs` pin it.

Two things did not get done, both deliberately and both for good reasons that have now expired.

**The general rule was not recorded.** *A batched git read and a per-branch git read taken at
different moments disagree, and the disagreement reads as a state transition.* Row AQ did not run
`npm run learn` because it regenerates the compiled `.claude/rules/` files while five other rows were
live, and the landing trap about generated files merging cleanly and coming out wrong is exactly that
shape. That reason is gone once the wave is over. A draft:

> Two reads of the same thing taken a second apart are two different facts. `wave-tick.mjs` read the
> merged-branch SET and then built the branch inventory about a second later, and a branch born
> inside that window was in one and not the other - which is indistinguishable from a branch that had
> committed. Where a cheap batched read and an expensive per-item read answer the same question,
> either take both from one snapshot or make the second one a receipt the first cannot forge.

**`night.md`'s landing-trigger bullet still understates the mechanism.** It says the landing signal
is containment for a branch the loop previously saw AHEAD of main, which is true and is no longer the
whole rule: containment for a branch the tick has not yet seen is not a reading at all, and the
previous tick's "ahead" can itself be wrong. One sentence would fix it. Row AQ's own instruction was
not to widen past `wave-tick.mjs`.

## What it would take

Run `npm run learn` from a quiet tree with the paragraph above, and add the sentence to
`.agent-workflows/orchestrator/night.md`. Check the line budget first: `check:shared-instructions`
reported the orchestrator core at 199/200 lines and the common path at 640/640 on 2026-09-10, so a
line added there has to come off somewhere else.

## Evidence

The events, from `C:\claude\NoaCG-Studio\.git\noacg-jobs\wave-tick-events.log` lines 249-258, which
is per-machine and committed nowhere:

```
2026-09-09T20:19:58.552Z tick 345 NEW BRANCH ahead of main: claude/ac-harness-verdict
2026-09-09T20:23:02.204Z tick 346 LANDED claude/ac-harness-verdict
2026-09-09T21:27:29.743Z tick 367 QUEUED claude/ac-harness-verdict
2026-09-09T21:30:33.696Z tick 368 LANDED claude/ac-harness-verdict
```

**And the cause was NOT the `git branch -m` rename**, which the wave prompt that commissioned the row
asserted. A branch created at main's tip and renamed, with no commits, is listed by
`git branch --merged origin/main` from the moment it exists; reproduced in a synthetic repository,
that sequence produces no event at all. Anyone tempted to "fix the rename" is fixing the wrong thing.

**One hole this does not close**, unchanged by the fix and pre-existing: a branch that commits AND
lands inside one inter-tick gap has never produced a `LANDED` event, because the tick that sees it
empty records `landed: true` and the next tick's `landed: true` is not a transition. It would need
CI, a queue slot and a merge inside three minutes, so nothing has hit it.
