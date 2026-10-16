# Claude Code Cloud landing receipt — 2026-10-16

The live queue landing of the qualification receipt (`claude-runtime.md`), observed by the same Claude
Code Cloud session that wrote it (`session_01J9NDriM1w6f1wkgzBTYAxu`). Read over REST; GraphQL is
refused in this environment (see `claude-runtime.md`).

## Reconcile, check and stamp (AC-3)

- [#1293](https://github.com/NoaCG/NoaCG-Studio/pull/1293), branch `noacg/sharp-mayer-6rt569`. Its
  commits were rebased onto then-current main `459fc028c0273b4462cbbcde0e540467d7093cc7`
  and squashed into one (unpushed, so no shared history was rewritten); `contracts:compile` regenerated 264 outputs with no
  diff. `/check` then ran on the resulting tip: inline review found three overclaims in the receipt
  (an untried `gh pr edit`, an auto-merge result not yet observed, "not truncated"), all fixed;
  simplify inline; verify inline with the five changed-file gates passing. Stamp on the reviewed tip
  `b21cae8ccc383bd6c3783f320d6d3c76a02f6e1f`.
- Status writes are refused through this session's proxy, so
  [dispatch 38871975944](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38871975944) of
  `cloud-queue-merge.yml` on main posted `noacg/reviewed` on exactly that SHA and added `land`. The
  PR's own `Reviewed` in [CI 38871969395](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38871969395)
  passed on that head, so no stale-Reviewed re-run was needed. The Codex review bot reported no
  findings on `b21cae8c`.

## Auto-merge and queue entry (AC-3)

- The session's first attempt was refused by its own permission classifier as self-approval. The
  owner was asked in the session and allowed it. At 08:52:30Z the session called
  `PUT pulls/1293/ccr/auto_merge` with `merge_method=MERGE` and `expected_head_oid` `b21cae8c…`;
  the response was `{"enabled":true,"merge_method":"merge"}`. The REST PR's `auto_merge` field
  stayed null throughout, so it is not evidence either way.
- Issue timeline: `added_to_merge_queue` 08:52:30Z (actor miwco, the session acting as the owner),
  `removed_from_merge_queue` 08:57:55Z, `merged` 08:57:56Z. A `pull_request.enqueued` event also
  reached the session.
- [Merge group 38876634477](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38876634477) tested
  `a6a28a56abb9c3a3fd78037edab5f58df17e270c` (the PR on main `df78ff21`, three landings newer than
  the reconcile point): Build, Factory gates, Reviewed, E2E plan, CI gate and After the gate passed;
  the planner selected no E2E specs for this docs change.
- Merged as `a6a28a56abb9c3a3fd78037edab5f58df17e270c`, the SHA the merge group tested.

## Post-land results on a6a28a56 (AC-5)

- [Post-landing 38877208442](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38877208442): success.
- [Quarantine 38877208482](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38877208482): success.
- [configured-suite 38877208328](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38877208328):
  success; 104 ran, 103 passed, 0 failed, 1 flaky (`e2e/configured/deep-link-boot.spec.ts:80`, passed
  on retry), 8 skipped.
- [Main CI 38877208505](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38877208505): run
  conclusion **cancelled**, not success. Its jobs started about 17 minutes after it was created, waiting for runners. Full E2E shard 5/11
  reached its 20-minute job limit at test 165 of 186 and was cancelled. The workflow's own
  same-commit retry then ran that shard's files once as their first verdict: 136 passed,
  50 skipped, 0 failed. `CI gate` and `After the gate` passed. Recorded as cancelled with a green gate.
- deploy-verify runs were skipped; Vercel reported "Canceled by Ignored Build Step". No product
  deployment is claimed for a docs-only change.

## What this adds to Claude acceptance

With `claude-runtime.md`, this Claude Code Cloud session observed: a CI failure repaired from a wake
delivered after the response ended; a no-webhook conflict found and resolved by a scheduled wake that
revived an idle, reclaimed container; a stale-SHA refusal; a focused browser check; exact-SHA stamp
and queue entry; actual merge; and that SHA's post-land results.

Limits: auto-merge needed the owner's one-time permission in this session; branch deletion is refused
(two `scratch/claude-*` branches remain); during a worker restart, PR events queued 08:05–08:16Z
reached the session only at about 08:52Z, delayed but not lost; archived-session revival and
indefinitely recurring monitoring were not exercised. This receipt's own pull request records its
landing in its PR comments and on #860.
