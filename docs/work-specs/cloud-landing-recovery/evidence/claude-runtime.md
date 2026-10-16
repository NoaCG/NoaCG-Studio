# Claude Code Cloud runtime qualification — 2026-10-16

Independent run of `claude-handoff.md` in a fresh Claude Code Cloud session, in the existing prepared
NoaCG environment and subscription. No new account, environment, paid API agent, laptop process or
daemon. Codex results in `runtime.md` were read as prior work, not as predictions for this provider.

- Session `session_01J9NDriM1w6f1wkgzBTYAxu`, environment `env_017nuiDZBW9smUNLdWVQK8cf`
  (`anthropic_cloud`), Claude Code 2.1.301, gh 2.89.0, Node v22.22.0, git 2.43.0.
- Read AGENTS.md, docs/ARCHITECTURE.md, docs/work-specs/README.md, and the check, verify,
  queue-merge and plan-run procedures; inspected #860, #1283, #1284 and #1286 first. Probe and
  evidence each ran in their own worktree; `npm run rules -- <paths> --loaded AGENTS.md` ran before
  editing. Full builds and suites stayed in GitHub Actions.
- Official source read live: https://code.claude.com/docs/en/claude-code-on-the-web. Auto-fix
  "subscribes to GitHub activity on the PR"; GitHub credentials stay server-side behind the GitHub
  proxy; "GitHub does not emit a webhook when the base branch advances and creates a merge conflict,
  so auto-fix can't react to conflicts on its own."

## Measured operations (this provider differs from Codex)

| Operation | Result |
|---|---|
| git fetch, push of new branches/commits | works |
| git push `--delete` of a branch | refused (proxy hangs up); REST `DELETE git/refs` returns 403 |
| GraphQL (`gh pr view`, `gh pr create`; other GraphQL-backed gh commands untried) | 403 "GitHub GraphQL is not available from Claude Code sessions" |
| REST repository/PR reads (`gh api repos/...`) | works; repository reports admin/push permission |
| REST PR create, PR close (`PATCH pulls/<n>`), issue comment create/edit | works |
| Actions run list, jobs, `gh run view --log-failed`, whole job log (`actions/jobs/<id>/logs`) | works (the whole 200-line job log) |
| Re-run failed jobs, cancel a run, `workflow_dispatch` | works |
| Commit-status POST | 403 "Write access to this GitHub API path is not permitted through this proxy"; nothing written |
| Auto-merge | GraphQL path blocked; the proxy names `PUT pulls/<n>/ccr/auto_merge`. Not used on the probe; its use on the evidence PR is in the landing receipt |
| PR activity subscription (`subscribe_pr_activity`) | delivers CI and comment events into the same session |
| Scheduled self wake (`send_later`, one-shot) | delivers into the same session; spent itself after firing |

Matching permissions on the repository did not predict the proxy's per-path write policy, the same
lesson as Codex's 403 with a different set of allowed operations.

## Delayed repair (AC-2, AC-4)

Disposable draft [#1291](https://github.com/NoaCG/NoaCG-Studio/pull/1291), base the disposable
`scratch/claude-cloud-base-proof` (a simulated main), never labelled, auto-merged or queued. It
carried #1283's workflow with only the push-branch filter changed, main's unchanged
`scripts/cloud-queue.test.mjs` (sha256 `67d5737df76d61e3571a4c48706fabde465c4b3a6d0e6379e1f0277f6b42f4c4`)
and the faulty helper from `687c6b52:scripts/cloud-queue.mjs`. Local run: 10/12, both
denied/malformed Actions cases `Missing expected exception`.

- Owner recorded before the worker's response ended, in one PR comment (edited in place since):
  this session; PR activity subscription plus one bounded `send_later` wake to the same session.
  No second fixer. The subscription is the PR-activity mechanism the docs describe for Auto-fix.
- First red [38868388311](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38868388311) on
  `e6486e6ab6fcdb0fc649719aa3926f80a1b1c05f` finished before the response ended, so its failed job
  was re-run at 07:38:24Z and the response ended with nothing repaired.
- 07:39:03Z: the subscription delivered `check_run.completed` failure (job 116866764469, attempt 2)
  into the idle session. Without a human prompt the owner read the whole 200-line job log (the same
  two failing tests), reproduced 10/12 with `node scripts/cloud-queue.test.mjs`, restored main's
  helper only, reran 12/12 and pushed `97be18f6e5b43ef0f75a947ae670af418d025127`.
  [38868617445](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38868617445) passed 12/12.
  Test hash unchanged. One attempt of three.
- The PR's own CI `Reviewed` went red by design (a probe is never stamped); one PR comment said so
  and it was not re-run or treated as a repair target.

## No-webhook conflict recovery (AC-4)

- Worker commit `67c1e28549f5c2d39a53e7161217e7ef436798fd` added the probe-only
  `docs/work-specs/claude-cloud-base-proof.txt`; the simulated main then advanced to
  `8ee2665be396ebf6f2f99d2fc0b5ce9d6ec0472d` with a different line in the same new file (07:40:55Z).
  GitHub reported `mergeable=false`, `mergeable_state=dirty`. Repository main was not touched.
- No event about the conflict reached the session (only Vercel comment edits, a `check_suite` for the
  old head and the by-design `Reviewed` failure), matching the documented webhook limit.
- 08:04:57Z: the scheduled wake (`trig_01QLtg5dGvRATkFJ341qVULj`, run SUCCEEDED, then disabled with
  `run_once_fired`) delivered into the same session. The container had been reclaimed while idle:
  system boot 08:04:56Z and a `SessionStart:resume` hook; the probe worktree and its commits were
  present. The owner read `dirty` over REST, fetched the base with an explicit refspec, merged it,
  hit a real add/add conflict, kept both lines (both intents), reran 12/12 with the test hash
  unchanged and pushed `22c5c3abcd8b53ff66b96adc06798fe51d8d52de` (base an ancestor). No generated
  files are touched by the probe, so nothing needed regenerating.
  [38871385594](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38871385594) passed 12/12 and
  GitHub reported `mergeable=true` (`unstable` only from the by-design `Reviewed`).
- The probe was then closed unmerged, the subscription removed, the leftover CI run cancelled; the
  one-shot wake had already disabled itself. Branch deletion is refused here (table above), so both
  `scratch/claude-*` branches remain on origin with no open PR and a push-only probe workflow.

## Stale SHA refusal (AC-3)

[Dispatch 38868625745](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38868625745) of
`cloud-queue-merge.yml` on main named the probe's superseded `e6486e6a…` after the branch moved.
Main's helper refused before any write: "scratch/claude-cloud-recovery-proof is at 97be18f6e5b4 on
origin, not the reviewed e6486e6ab6fc". Afterwards the probe had no labels and neither SHA had a
`noacg/reviewed` status.

## Focused browser check

- `npm run queue -- "npm run test:e2e -- e2e/landing.spec.ts --grep 'root shows' --trace on"` (job
  j-0001): 1 Chromium test passed ("root shows the landing page, not the editor"); no skipped case
  counted. Trace: 2 console messages (both Vite debug), 0 page errors, 21 network entries, none >=400.
- Walk on this checkout's dev server (`npm run dev:worktree`, http://localhost:5174/): title "NoaCG
  Studio - Broadcast graphics and playout in your browser", h1 "Create live graphics. Run the show.",
  three "Start creating" links, 20 responses none >=400, 0 page errors. The first screenshot caught
  the staggered intro mid-reveal; the settled one, inspected, shows the nav, hero copy, both buttons
  and the program-monitor preview. Screenshots stay in the session scratchpad, not Git.

## Landing and limits

This receipt's own pull request is reconciled with current main, `/check`ed and stamped through the
dispatch path (status writes are refused here). Its queue entry, merge SHA and post-land results
are recorded in a separate receipt once observed, because a receipt cannot contain its own merge.

Not qualified here: revival of an archived session (only an idle, reclaimed container was revived);
indefinitely recurring monitoring; native root/nested Codex instruction loading. The session stays
the active owner through post-land results.
