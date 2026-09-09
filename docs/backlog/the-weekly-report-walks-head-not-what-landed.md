---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "orchestrator-week.mjs counts handoffs, owner-queue items and skill commits by walking HEAD with no revision, so run from the primary checkout - which the workflow requires - it under-reports the week by whatever the local main is behind"
serves: NOW
size: small
touches: scripts/orchestrator-week.mjs
covered-by: none
needs-owner: none
---

# The weekly report walks HEAD, not what landed

`scripts/orchestrator-week.mjs` builds the owner's weekly page. Three of its git reads name no
revision at all, so they walk HEAD:

- `addedInWindow` (around line 287) - `git log --since=… --diff-filter=A --name-only` - which feeds
  both `handoffsAdded` and `queueItemsAdded`;
- the `--no-merges` log in `gather` (around line 348) that feeds `improvementsFrom`;
- `startRev`, a `rev-list -1 --before=<since>` used to compare the common path then and now.

`.agent-workflows/orchestrator-week.md` line 26 tells the weekly session to run from the primary
checkout, and that is the checkout holding the stale local `main`. Measured on 2026-09-09 for a
seven-day window: `git log main … -- docs/handoffs` counts 105 added files, `git log origin/main …`
counts 114. The page silently reports the smaller number.

## Why

This is the same defect the receipts had, in the form no scanner can see. There is no `main` token
to match, so `scripts/check-landed-ref.mjs` says out loud in its header that an absent ref is its
blind spot and only a reader finds one. A reader found this one during the review of
`claude/t-stale-main-ref`.

The direction of the error is the quiet one. A week that landed more than the page says looks like
a slower week, and nothing anywhere contradicts it.

## What would settle it

Resolve the landed ref once in `gather` through `mainRef` from `scripts/main-ref.mjs`, exactly as
`owner-receipts.mjs` now does, and pass it as the revision to those three reads. `commonPathAt`
takes a rev already and is called with `'HEAD'` for "now"; that call wants the same treatment and
is the one judgement in the change, because "now" for a report about what landed is the landed ref
rather than whatever the checkout is sitting on.

It was left out of `claude/t-stale-main-ref` on the check workflow's own rule: a real pre-existing
bug outside the diff is reported, not silently fixed, because it belongs in its own change with its
own verification. The weekly page is owner-facing and its numbers should not move inside a branch
about something else.
