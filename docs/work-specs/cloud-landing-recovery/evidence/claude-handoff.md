# Independent Claude Code Cloud verification — OPEN

Use a fresh Claude Code Cloud session in the existing prepared NoaCG environment
and the existing subscription. Do not infer permissions from matching environment
variables, tool names, or this Codex receipt. No new account, environment, paid API
agent, laptop process or daemon is needed or authorized by this handoff.

Goal: independently qualify the shared `.agent-workflows/queue-merge.md` procedure
and the late-failure owner in Claude Code Cloud. Parent spec AC-1 through AC-5;
Claude acceptance remains unverified until this session records passing evidence.
Related work: implementation PR #1284, disposable Codex proof #1283, open issue #860.

1. Fetch current main, read AGENTS.md, docs/ARCHITECTURE.md, the work-spec conventions
   and canonical check/verify/queue-merge/plan-run/orchestrator procedures. Use your
   own feature worktree; run `npm run rules -- <paths> --loaded AGENTS.md` before
   editing. Inspect current related PRs/issue #860 first. Do not rerun full builds or
   suites in cloud; those remain in GitHub Actions.
2. Record provider/version and operation-by-operation probes: git fetch/push,
   repository/PR read, Actions runs/jobs read, whole failed-job log, dispatch/rerun,
   status write and session-owned auto-merge. Try installed gh normally, then the
   available provider GitHub tools for rejected operations. Preserve inherited
   proxy/auth. Never print tokens, full environment, credential files or signed
   download URLs. Codex's status POST was 403, REST PR read 401, redirected log
   blocked, gh pr edit hit the retired projectCards field; GraphQL PR read,
   dispatch/rerun, connector logs/metadata and guarded auto-merge worked. These are
   Codex observations, not predictions about Claude.
3. Create a disposable draft `scratch/claude-cloud-recovery-proof` PR. Reuse the
   focused workflow/test fixture from #1283 (fetch `refs/pull/1283/head` if needed),
   changing only the workflow's push-branch filter. Copy current main's unchanged
   `scripts/cloud-queue.test.mjs`. Deliberately restore only the faulty helper from
   `git show 687c6b52a8668d8bf48247a1d96bd3ce11fc5c35:scripts/cloud-queue.mjs`.
   Expected: 10/12 passing, denied/malformed Actions cases fail with Missing expected
   exception. Never add land, enable auto-merge or queue this probe.
4. Before the initial worker ends, record exactly one repair owner. Bind/enable
   native Claude PR Auto-fix if available, and verify that it actually wakes that
   owner. A bounded scheduled wake must target that SAME owner for mergeability
   even with no webhook. A notification/subscription acknowledgement alone is not
   qualification. If native Auto-fix owns repair, do not create a second fixer.
5. Let CI finish red after the worker's initial response. Without manually prompting
   repair, the armed owner must read the full failed job log, reproduce via
   `node scripts/cloud-queue.test.mjs`, restore current main's fixed helper, rerun the
   same assertions and push. Observe focused Actions green. Hash the test file
   before/after; it must match. Record wake/owner receipt, SHAs, logs and run links.
   At most three attempts per failure; preserve every assertion, gate and limit.
6. Qualify the no-webhook conflict path safely: use a second disposable base branch
   as simulated main, add differing versions of one probe-only text file on base
   and worker, then advance/retarget the base to produce CONFLICTING/DIRTY. Do not
   touch repository main to manufacture a failure. The scheduled wake must discover
   it, merge the newer base in the worker's worktree, resolve both intents, regenerate
   generated files when present, rerun checks and observe MERGEABLE. Native Auto-fix
   alone cannot be assumed to notice this; official Claude docs state the missing
   webhook limit. Close probes unmerged and disable their wakes after qualification.
7. In the real, scoped evidence PR, reconcile newer origin/main and regenerate
   compiled instructions. Run /check and stamp the resulting full SHA; queue only
   that reviewed tip through /queue-merge. If status writes require Actions,
   dispatch cloud-queue-merge.yml on main with that SHA; inspect its jobs and the
   PR's OWN Reviewed job. Re-run a stale red Reviewed in its original run once
   completed, rather than counting a separate green dispatch. A deliberately stale
   SHA dispatch on a disposable probe must refuse before any stamp/land label.
8. Enable auto-merge from the session with an exact-head guard when available.
   Record actual mergeQueueEntry/AddedToMergeQueueEvent, merged SHA, merge-group CI,
   and that SHA's CI/post-land/configured-suite/deployment-verification results.
   Green PR checks or an auto-merge acknowledgement alone do not pass.
9. Run one relevant focused browser check in Claude's cloud runtime through npm run
   queue, collect an inspected screenshot and console/network evidence. Codex used
   `npm run test:e2e -- e2e/landing.spec.ts --grep 'root shows' --trace on`; do not
   count skipped retired cases. Keep screenshots out of Git.
10. Land only the qualification receipt/ledger through /check and /queue-merge,
    preserving task scope and recording limitations. Update #860 with precisely
    what Claude proved. Mark Claude acceptance pass only after observed delayed
    repair, conflict recovery, exact-SHA queue entry, actual merge and post-land
    results. A missing tool or denied permission is an explicit gap, not a pass.

Suggested model/effort: the existing Claude subscription's capable coding model,
high effort. This can run independently after the Codex evidence landing; the
Codex qualification probes must be closed and their wakes paused first.
