---
v: 2
kind: handoff
date: 2026-09-09
branch: claude/j-one-date-for-the-push
row: J
---
# J - every document agrees on the push

**Done and queued.** No live document names the NOW push by the 2026-09-12 date any more. Fourteen
sites across thirteen files now point at the `## NOW` section of `docs/GOALS.md` instead of
restating a date, so the next time the owner moves one they do not go stale again.

## What changed, and why a pointer

The finding said eight files. It was compiled from a grep that only matched text citing GOALS by
name, so it missed three more that make the same claim in their own words. All of them are fixed
and the finding's file is deleted, in the same commit, as the row asked.

The default edit is a POINTER, not the new date. A file saying "by 2026-09-25" is one owner ruling
away from being wrong again; a file saying "the NOW push, `docs/GOALS.md` `## NOW`" never is. The
pointers all name a SECTION HEADING, never a line number, so a rewrite of that section does not
break them. Every path and heading cited was checked to resolve.

**One file deliberately restates the date: `docs/PRODUCT_AND_MAP.md`.** It is the orientation
entry point, a reader arrives there knowing nothing, and the CLI-to-player half of the deliverable
was invisible from it. It now names both capabilities and the 25th, with GOALS `## NOW` cited as
the authority so there is an obvious place to correct.

**`docs/PROMISE_AUDIT.md`, the "Behaviour on your own artwork" row, is the one that needed
thought.** Its chain contradicted itself at both ends: it grounded "the owner's own walk is still
owed" on GOALS items that record five of those walks as done, and on a quiz he confirmed end to end
on 2026-09-03. It now says what is actually outstanding, in one sentence: that board walked again
now the text-box defects under it are fixed, and step 2 of
`docs/acceptance/IMPORTED_QUIZ_HOSTED_WALK.md`, the eyes-on half of the hosted walk. Cited by file,
never by row or item number, which that file's own header requires.

Left alone on purpose: the `.github` workflow comments, `docs/OWNER_RULINGS.md` line 121, the IBC
event on 12 September, and every place where 09-12 correctly names the student production as the
REHEARSAL. Rewriting a dated record is how history stops being evidence.

## Gates

- `npm run build`: green, exit 0 read from the build itself.
- CI on the tip `67a607dc`: **success**. Jobs that RAN: Build, Factory gates, E2E plan, CI gate.
  The E2E shards are `skipped`, which is correct and not a gap - the plan job saw a
  documentation-only diff and had no specs to map.
- `/check`: **review `discarded+inline`, simplify `inline`, verify `inline`. taste: not
  applicable** - nothing here can move what a graphic looks like.

**The review leg is why that first mode reads `discarded+inline`, and it matters to whoever runs
`/check` next.** The delegated code-review pass scoped against merge base `ae5a32b9` instead of
this branch's `761ad8e7`, read 117 files over 26 commits, and reported on row H's already-landed
work. Not one of its eight findings fell inside this branch's changed set, so the whole review was
discarded per the workflow's own phase-1 rule and the leg was redone by hand. This is the exact
failure `docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md` is filed about, seen
again today.

Redoing it inline found three real defects, all fixed in `67a607dc`. One was mine and factual: I
had written that the owner confirmed the scoreboard on 2026-09-04, when the owner-queue record has
him confirming the QUIZ on 09-03 and the scoreboard merely BUILT to his brief the day after and
still waiting to be seen. Simplify then found two more, including a "not this date's" left pointing
at a date I had just removed from its own sentence.

## The delegation measurement

Recorded with `scripts/delegation-outcome.mjs`: **codex / gpt-6-astra / medium / doc-sweep /
repaired / cause prompt**, landed sha `a87ae75d`.

**This is the second data point on row H's split-the-list lesson from this morning, and it held.**
Two calls, two files then four, rather than eight at once. Every site inside the given lists was
found and edited correctly on the first pass, and each call returned a reasoned leave-alone list
(IBC dates, ratification records, the rehearsal) that I re-derived and agreed with. Nothing was
missed inside a list, which is what the unsplit call failed at. Git was handed over rather than
banned; both calls used it and neither strayed outside its file list.

The three defects were all presentation, not substance: two reflowed paragraphs left over-long
lines because I never named the 100-column wrap convention, and one out-of-scope word change I
reverted. Cause is `prompt` rather than `worker` - an undeclared convention is my spec's gap.

The sharper lesson is about verification, not the worker. My own re-derivation found three sites
outside BOTH delegated lists, because the finding's list was wrong before the delegation started.
A delegate cannot be faulted for a list it was not given, and reading its report would never have
surfaced them - only re-deriving the receipt did.

## What is left, for whoever wants it

Two follow-ons, both small, neither blocking:

1. **A superseded WAIT, not a stale date.** `docs/OGRAF_ECOSYSTEM.md` §"Must influence current
   work" still says nothing new starts before 2026-09-12. The owner's 2026-09-03 "a date is not a
   gate" ruling and `docs/PROGRAMMES.md` "P6 OGraf & Interoperability" both say P6 may start now. I
   fixed this claim's twin in `docs/OGRAF_FIRST_REVIEW.md` §12 because I was already in that file;
   this one is a different defect class from the date sweep, so I stopped rather than sprawl.
2. **Eight findings addressed to nobody.** The discarded review's findings are about row H's
   landed work and are lost otherwise, so they are listed here for the orchestrator to route. Two
   are medium: `docs/DEMO_2026-09-25.md` cites `docs/backlog/docs-guides-to-write.md`, which that
   branch deletes; and the same file pins four gap-list cells to branch names the merge queue
   deletes, with all four still reading GAP while their deliverables exist at stable paths. Six are
   low, including `noacg login --name My Laptop` silently naming the key "My", and
   `noacg caspar play` dropping stray arguments. **I did not verify any of these** - they are
   another branch's diff and the workflow says they are that branch's business.

## Safe to archive

Yes, once the queue lands it. Nothing is uncommitted, the branch is pushed and green, the stamp is
written, and this file carries everything the next session needs.
