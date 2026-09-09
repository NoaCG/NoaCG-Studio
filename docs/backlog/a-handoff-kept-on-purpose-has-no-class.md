# A handoff kept on purpose is printed as one somebody failed to delete

**Filed:** 2026-09-08. **Source:** the 2026-09-02 orchestrator live run, friction 7 (handoff since
drained)

## Why
`scripts/handoff-drain.mjs:45` has four classes: consumed, spent, deferred, owner. Consumed, spent
and owner are DELETED by the wave. On 2026-09-02 a row was told to delete eleven files and
correctly kept two that `docs/backlog/` still cited as Evidence, and the drain went on printing
them as `consumed`, which reads as "somebody failed to delete these". `deferred` does not fit
either: it means machine-continuable work, and carries a graduate-or-die staleness flag these
files should never trip. So the right outcome has no vocabulary, and the next planner re-derives
the same argument or deletes the file. The 2026-09-08 drain hit it again, on six files kept purely
because a live backlog item cites them.

**Third occurrence, 2026-09-09**, and it now has a cost in wave slots. The night wave could not
inherit the previous drain's verdict, because `deferred` is all the plan could write and `deferred`
means "keep, for now" rather than "keep, because something names it". So a row was spent re-walking
seven files whose citations had not moved: the four OGraf and CI evidence files and the three the
`guard-preview` and mistake-trigger hooks name. Same seven, same reason, second night in a row.

**Fourth occurrence, 2026-09-09 - and the second option below was taken, at a measured price.** The
drain that emptied the folder repointed every citation into the folder before deleting the files
that held them. Counted off its own diff: **35 citations written as a path, plus two written
without one, across 27 files** - 21 backlog items, six `source` fields in
`scripts/harness-capabilities.json`, two script headers, `docs/CI_STABILITY.md`,
`docs/BRAND_PLAN.md` and a metrics record. The two without a path are why a path grep alone never
finishes this job: one was prose in a binding plan's READ line ("the landed row <1> handoff") and
one cited three handoffs by bare filename and line number.

So the manual route works and it is not cheap: about a third of that row went on it, and the next
drain pays it again from zero.

## What it would take
Either a fifth class ("cited: <file> still names it as Evidence") that is never deleted and never
goes stale, or make deletion the responsibility of the repoint, as `7fc1016a` did by hand and the
2026-09-09 drain did at scale.

**A third option is now the cheapest, and it is a gate rather than a class.** Nothing checks that a
citation into `docs/handoffs/` resolves - `check-docs-index.mjs` exempts the directory by design,
because the files are meant to disappear. A check that refuses a BARE path into `docs/handoffs/`
naming a file that no longer exists, while allowing the `git show <sha>:<path>` retrieval form that
survives the deletion, would make the repoint mandatory at the moment it is cheap instead of
discovered by the next drain. It cannot land as a one-liner: on 2026-09-02 there were already nine
pre-existing dangling references, so a strict check fails the build until they are triaged, and
that triage is the work rather than the checker. Seven needed it then; the 2026-09-09 drain
repointed everything it touched, so the standing count should be measured again before anyone
sizes this.

## Evidence
`scripts/handoff-drain.mjs:45`; `.agent-workflows/orchestrator/collisions.md`, "Consuming the
handoff folder"; commit `7fc1016a`.
