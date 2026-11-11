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

Keep the wakes that work, and add one check that notices a red PR nobody is repairing and raises
the owner alarm (`scripts/alarm-owner.mjs`: owner `miwco`, the weekly owner session as backup).
The check changes no PR, check, test or limit.

How a red check reaches each kind of repair owner:

| Repair owner | Route to it on a red check | Within |
| --- | --- | --- |
| Claude Code Cloud session subscribed to the PR (`subscribe_pr_activity`) | the CI event wakes the session (existing) | minutes |
| Claude app with Auto-fix on | Auto-fix wakes on the red check (existing) | minutes |
| Plan-run coordinator | its PR subscription, or its check-in for the docs PRs it does not subscribe to (existing) | minutes to its check-in |
| Codex chat, local session, or a session that has ended | none: nothing in the repository can wake them | the owner alarm after the bound (rule 6) |
| None recorded, or a bot PR | none | the owner alarm after the bound, or at the next check when no worker can be left (rule 6) |

The gap the owner accepts: for owners in the last two rows, the first person to hear of a red
check is the owner, through the alarm, up to about 80 minutes after it (rule 6's bound plus rule
10's schedule). A repository workflow cannot resume a Codex chat or a local session: it has no
credential or interface to reach them.

## Rules

Each rule is observable from GitHub alone. Revised after the Rules-first review (grade B-, eight
required changes, all taken).

1. **Red.** An open, non-draft PR is red when its newest verdict is a red `CI gate`. Its
   verdict is its newest `ci.yml` PR run (event `pull_request` or `workflow_dispatch`) on the PR's
   current head, or its newest merge-group run (branch name matching
   `^gh-readonly-queue/main/pr-(\d+)-`) when that run's newest attempt started later. With no PR
   run on the current head there is no verdict, so a merge-group failure on an older head never
   outlives a push. A merge-group run already listed in the alarm is read by its id, so it stays
   the verdict after it leaves the check's two-day run listing. It is red when that run has
   finished and its `CI gate` job ended `failure` or `timed_out`. A run that is queued or in
   progress is not red. A red `Reviewed` beside a green `CI gate` is review wait, not red (cf17,
   cf22), on both kinds of run. Not covered: a run that never started (`startup_failure`), a PR
   with no run (a conflict), and the PRs of a batched merge group other than the one it is named
   after.
2. **Failure and key.** The failure time is the `CI gate` job's end. A failure's key is the PR
   number, the run id, its attempt and that time; a re-run that fails again is a new failure.
3. **Action.** An action on the PR is a person's comment (owner, member or collaborator access; a
   bot's does not count: Codex's review, Vercel), an edit of the repair-owner comment, or the
   start of a newer attempt of the red run. A push or a new run is not an action but a new
   verdict (rule 1).
4. **Repair owner.** The PR's newest comment holding `<!-- noacg:repair-owner`, written by a bot or
   a repository member. None means the PR has no acknowledged repair owner.
5. **Unattended for.** The time since the later of the failure and the PR's last action. An owner
   who answers and then goes quiet is unattended again from the answer.
6. **Alarm.** A red PR unattended for **60 minutes** raises the owner alarm, whether or not it has
   a repair owner; the alarm says which and quotes the owner's record. Why 60: in cf22's window
   the idle time after a failure had p90 49 minutes; at 60, 5 of 57 bounces would have alarmed,
   among them #1840, #2218 and #2374. With no repair owner the bound is the same for a PR run,
   because a worker may still be repairing it (owners are recorded when a worker ends: 13 of the
   20 bounces idle over 15 minutes had no owner comment yet). It is **0**, the next check, when no
   worker can be left: a merge-group failure on a PR with no repair owner (queueing needs one), or
   a PR a bot opened with no repair owner.
7. **New alarms only for recent failures.** A failure first found unattended more than 24 hours
   after it happened raises no alarm here: the first run raises no history, and old open PRs are
   the delivery-age alarm's too. A failure already listed stays listed at any age while it is red
   and unattended. One PR can appear in this alarm and in the delivery-age alarm.
8. **Once per failure, one notification per check.** The alarm is one rolling issue, `Red pull
   requests nobody is repairing`, assigned to `ownerLogin` from `scripts/growth-ceilings.json`.
   Its body lists, with its key, every alarmed failure that is still the PR's red verdict: those
   still unattended, and apart from them those someone has attended to since. A key stays listed
   while its failure is the PR's red verdict, so it is never alarmed again, however its owner's
   comments come and go. A check that finds new unattended keys opens the issue (the assignment
   notifies) or adds one comment listing all of them (the assignee is notified once per check).
   The keys of the newest closed alarm issue are remembered too: an owner who closes it by hand is
   not alarmed again for the same failures, and a closed issue is reopened as a new one only for
   a new failure. A list that has not changed is not rewritten.
9. **Withdrawal.** A complete check that finds none of the listed failures still a PR's red
   verdict closes the issue. A failure stops being one only by a new verdict (a push, a run, a
   re-run), the PR closing, or the PR turning draft, so it cannot come back with the same key
   while the issue is closed, except a draft made ready again. An incomplete check (the call budget ran out, a read failed)
   closes nothing and drops no entry; it may still add a new one, and it warns in its run.
10. **Bounds.** At most 100 GitHub API calls per check, reads and writes together; merge-group runs
    are read up to three pages (300 runs in two days; about 55 is usual). It runs every 20 minutes
    and after each failed `CI` run.
11. **Trust.** The workflow runs `main`'s code only (`workflow_run` and `schedule` run the default
    branch). It never checks out, or puts into a shell, the triggering run's head, branch or
    title; PR data reaches GitHub only as API arguments. Permissions: `contents`, `actions` and
    `pull-requests` read, `issues` write. One concurrency group on the job for every trigger, never
    cancelled mid-write; on the job, so the skipped runs that green CI runs start never displace a
    waiting check.
12. **Owner.** The alarm goes to the owner `scripts/growth-ceilings.json` records, read by
    `alarmOwner`. If it names none, the check fails loudly; it never invents one.
13. **Read-only on PRs.** The check reads PRs, runs and comments and writes only its alarm issue.
    The weekly owner session sees it through `alarm-owner.mjs list`.

Found after the Rules, in `/check`'s review (all fixed, each with a test): a sparse checkout that
would have crashed the script at load; workflow-level concurrency letting skipped runs displace a
waiting check; the zero bound ignoring a person's action; a listed merge-group failure dropping
out after two days; a hand-closed alarm alarming again; more than 100 merge-group runs leaving every
check incomplete; a body rewritten on every check; CRLF bodies losing their sections.

### The four PRs under these rules

- #1840: merge-group failure 06:13, no owner, a bot PR: alarmed at the next check, about 06:33.
- #2218: PR-run failure 13:50, no owner, no action: alarmed about 14:50.
- #2227: failure 15:30; the owner commented at 15:33 and 15:39, then waited on main's fix. Alarmed
  once, about 16:39. The PR's own comment says why; one notification.
- #2374: failure 05:28, an owner with no PR wake, no action: alarmed about 06:28, about an hour
  before its next work began.

