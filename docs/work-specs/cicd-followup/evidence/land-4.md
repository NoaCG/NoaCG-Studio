# Land-4: a draft pull request runs the cheap checks only (Rules)

Owner, 2026-11-12 (run issue #1967, step 4): "Fewer runs per pull request. [...] propose how the
review loop can batch its fixes into one head before CI. [...] This is waste with no coverage loss,
so treat it as a straightforward win."

## Rules this change makes true

- R1. A `pull_request` run on a draft runs Build, Factory gates and Reviewed. The E2E plan and every
  job that needs it (E2E shards, catalog gate, guided mod, configured E2E and its verdict, the
  combined report) are skipped. The CI gate runs and fails with "Draft pull request", so a draft
  head never carries a passing or skipped gate. The gate and Reviewed are `continue-on-error` on a
  draft only: their checks stay red and still block the queue, while the run concludes green, so
  `scripts/ci-repeat-failures.mjs` (one page of `status=failure` runs) and the failure mail see no
  draft (final review finding).
- R2. Marking the pull request ready (`ready_for_review`) starts a run on the same head with the
  full selection, exactly as a non-draft run today. Every later push to a ready pull request does
  the same.
- R3. Merge group, push to main and dispatch runs are unchanged: `github.event.pull_request.draft`
  is empty on those events, so every condition reads as before.
- R4. A draft head never carries a passing `CI gate`. A skipped required check counts as passed,
  and the ready run's own gate check appears only after its needs finish, so a skipped draft gate
  could have admitted the head to the queue in that window (Rules-first review finding). Failing
  it closes that. The merge group's full gate stays the landing guarantee either way.
- R5. The review loop opens as draft, asks Codex on the draft head, fixes a round in one push,
  marks ready when clean, and reads a red run whole before pushing one repair
  (`.agent-workflows/queue-merge.md` cloud step 2, `.agent-workflows/verify.md` section 3).
- R6. No test, spec, check, limit or retry policy changes. The coverage on the landed tree is the
  same: the full selection still runs on the ready head and on the merge group.

## Proofs on GitHub before building

1. The Reviewed stamp and auto-merge accept a pull request that was a draft. #2368 was opened as a
   draft (01:00:17Z, no earlier `convert_to_draft`), marked ready 08:09:58Z, `noacg/reviewed`
   success 08:10:00Z on head e85660d8, `land` 08:10:03Z, `auto_merge_enabled` 08:10:06Z,
   `added_to_merge_queue` 08:10:49Z, merged 08:24:38Z. #2293 the same after a
   `convert_to_draft` (2026-11-10T14:25:57Z) and ready 2026-11-11T00:16:49Z: stamp 00:16:51Z,
   auto-merge 00:16:55Z, queued 00:17:21Z, merged 00:30:40Z. Source: issue events and commit
   statuses API.
2. The Codex review runs on drafts here. On #2368, `@codex review` at 04:10:16Z while draft; the
   Codex connector posted its summary 04:10:50Z and its receipt ("Didn't find any major issues")
   04:13:45Z. On #2293, while draft, `@codex review` 00:01:28Z, receipt 00:04:16Z. On a draft it
   does not start by itself: #2293's automatic review came 11 s after its first
   `ready_for_review` (2026-11-08T17:21:20Z / 17:21:31Z). Hence the explicit request in R5.

## Measured basis (re-verified, 2026-10-29..11-12, Actions API)

| Figure | Brief | Measured here |
|---|---|---|
| Pull request runs cancelled | 46% | 464 of 1018 (45.6%) |
| Follow-up heads pushed while the previous run was still going | 67% | 467 of 698 (66.9%), 320 branches, 3.18 heads per branch |
| Cost of a cancelled run | ~72 runner-min, ~21 jobs | 77.5 runner-min, 19.8 jobs started (random sample of 60) |
| Draft run (Build + Factory gates + Reviewed) | ~14 runner-min | 7.8 runner-min (job wall time, random sample of 40 successful runs; billed minutes round each job up) |

Scripts: the run lists come from
`gh api repos/noacg/noacg-studio/actions/workflows/ci.yml/runs?event=pull_request&created=<day>`
per day; job minutes from `.../actions/runs/<id>/jobs` (completed_at minus started_at).

## Rules-first review

Independent `/so` on head 0dd26ac88: AGREE WITH CORRECTIONS, grade B. Answered: the skipped draft
gate (now fails, R4); red `Reviewed` and `CI gate` on a draft are named as expected in
queue-merge.md so no one repairs them; the draft-run cost is measured. `Reviewed` stays on drafts
as the brief specifies.

Final `/so` on head 8e627f664: AGREE WITH CORRECTIONS, grade B. Answered: every draft run would
have concluded `failure` (the draft gate, and `Reviewed` before a stamp) and filled the weekly
repeat-failure report's one page; both jobs are now `continue-on-error` on a draft. The probe line
in queue-merge.md now says a draft runs no E2E.

## What it gives up

Nothing on the landed tree. A draft head gets no E2E answer until it is marked ready, so a worker
who wants a browser verdict on a draft runs its affected specs locally (verify.md) or marks it
ready.

## Revert

    git revert <merge commit of this pull request>

One merge commit; the workflow and both procedure files go back together.
