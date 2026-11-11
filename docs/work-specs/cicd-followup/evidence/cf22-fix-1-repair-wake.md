# cf22 fix 1: a red PR reaches its repair owner, or the owner alarm

Owner decision 2026-11-11 on #1967 ("Let's do as you recommend"): build cf22's rank-1 fix F, then
rank 2. Evidence: [phase-cf22.md](phase-cf22.md) section 3.4 and 4. Branch
`claude/repair-loop-wake-owner`, from `main` at 92e581a.

## Reproduction: why nobody acted on the four long idle stretches

Read from each PR's comments and timeline (GitHub REST, 23 calls).

| PR | Failure (UTC) | Idle (min) | Repair owner at the failure | Why nobody acted |
| --- | --- | ---: | --- | --- |
| #1840 | 10-31 06:13, merge group | 1,463 | none: a bot PR (`bot/e2e-traced`) | Nobody owns bot PRs. The queue dropped it at 06:14 and nothing happened until the next nightly force-pushed it a day later. |
| #2218 | 11-05 13:50, PR run | 1,226 | none recorded | A local wave-row session opened it. Its repair-owner comment was written the next day at 10:21, after the fix, by another session. A local session has no wake once it ends. |
| #2227 | 11-05 15:30, PR run | 313 | a Claude Code Cloud session, subscribed to the PR, comment at 15:55 | The owner did wake: it commented at 15:33 and 15:39 that the failing specs fail on plain `main` (#2230) and waited for main's fix. Not an owner that slept. |
| #2374 | 11-11 05:28, PR run | 261 | a Codex Cloud coordinator, comment at 04:50 | Codex has no PR wake; it ran on its own heartbeat. Its next commits are dated 07:35 and were pushed at 09:41. About two hours passed with no work at all. |

So three of the four had no working wake: no owner at all (#1840), an owner recorded only after
the fact (#2218), and an owner whose provider cannot be woken by a red check (#2374). The working
route today is the Claude Code Cloud PR subscription and the Claude app's Auto-fix: both deliver a
red check to the owning session at once, as #2227 shows. Nothing in the repository can wake a
Codex chat or a local session, and nothing notices when no one owns a red PR.

## Design

Keep the wakes that work. Add one check, run by GitHub Actions on `main`, that notices a red PR
nobody is repairing and raises the owner alarm (`scripts/alarm-owner.mjs`, owner `miwco`, the
weekly owner session as backup). It changes no PR, check, test or limit.

## Rules

Each rule is observable from GitHub alone.

1. **Red.** An open, non-draft PR is red when its newest verdict is a failure:
   - its newest `ci.yml` PR run (event `pull_request` or `workflow_dispatch`) on the PR's current
     head has finished and its `CI gate` job ended `failure` or `timed_out`; or
   - its newest merge-group run (branch `gh-readonly-queue/main/pr-<n>-…`) was created after that
     PR run, has finished, and ended `failure` or `timed_out`.

   A run that is queued or in progress is not red. A red `Reviewed` beside a green `CI gate` is
   review wait, not red (cf17, cf22).
2. **Failure time and key.** The failure time is the `CI gate` job's end (PR run) or the run's
   last update (merge group). A failure's key is the PR number, the run id and the failure time.
3. **Acted.** Someone acted on a failure when, after its failure time, any of these happened: a
   push or a new run or attempt (rule 1 then reads the newer verdict), a PR comment by a person
   with owner, member or collaborator access (bots do not count: Codex's review, Vercel), or an
   edit of the repair-owner comment.
4. **Repair owner.** The PR's newest comment holding `<!-- noacg:repair-owner`, written by a bot or
   a repository member. None means the PR has no acknowledged repair owner.
5. **Alarm.** A red PR whose failure nobody acted on for **60 minutes** raises the owner alarm. The
   bound is the same with or without a repair owner; the alarm says which, and quotes the owner's
   record. Why 60: in cf22's window the idle time after a failure had p90 49 minutes; at 60 only 5
   of 57 bounces would have alarmed, and they include #1840, #2218 and #2374. A shorter bound for
   PRs with no owner would alarm on workers still busy repairing, because owners are recorded
   when a worker ends (13 of the 20 bounces idle over 15 minutes had no owner comment yet).
6. **Window.** A failure more than 24 hours old when checked is not alarmed here. Old open PRs
   are the delivery-age alarm's (`growth-report.mjs ages`), and the first run raises no history.
7. **Once per failure.** The alarm is one rolling issue, `Red pull requests nobody is repairing`,
   assigned to `ownerLogin` from `scripts/growth-ceilings.json`. Its body lists each alarmed
   failure that is still red and unacted, with its key. A new key opens the issue (the assignment
   notifies) or adds one comment to it (the assignee is notified). A key already listed is never
   alarmed again.
8. **Withdrawal.** A complete check that finds none of the listed failures still red and unacted
   closes the issue. An incomplete check (the call budget ran out, a read failed) closes nothing
   and drops no entry; it may still add a new one.
9. **Bounds.** At most 100 GitHub API calls per check. It runs when a `CI` run fails and every 20
   minutes, one at a time, so an alarm lands within about 20 minutes of the bound, plus GitHub's
   schedule delay.
10. **Owner.** The alarm goes to the owner `scripts/growth-ceilings.json` records, read by
    `alarmOwner`. If it names none, the check fails loudly; it never invents one.
11. **Read-only on PRs.** The check reads PRs, runs and comments and writes only its alarm issue.
    The weekly owner session sees it through `alarm-owner.mjs list`.
</content>
</invoke>
<invoke name="Bash">
<parameter name="command">cd /home/user/NoaCG-Studio/.claude/worktrees/repair-fix-1; git add -A && git commit -qm "cf22 fix 1: rules for waking a red PR's repair owner, before code

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017SdbwNq7cFBvsVc3RQYNXs" && git push -u origin claude/repair-loop-wake-owner 2>&1 | tail -1; git rev-parse HEAD