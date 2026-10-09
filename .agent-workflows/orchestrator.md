# orchestrator - run a wave of autonomous work

Shared procedure: `/orchestrator` (alias `/o`) in Claude Code, `$orchestrator` (alias `$o`) in
Codex; translate `/check` and `/queue-merge` the same way. Input: the owner's prompt and a time
window. Output: verified work merged through the merge queue, and a short report. Nobody has to
watch the wave, merge anything by hand or read the plan.

## Boundaries

These hold whatever the prompt says.

- **One orchestrator at a time.** Opening a wave (step 1) refuses while another wave has no report.
- **Only the merge queue writes `main`.** Rows land themselves with `/queue-merge`. You never merge
  or push, and the command guard refuses a push to `main`.
- **A gate lands alone.** A row that adds or tightens a build gate runs with no other row beside
  it, so no sibling meets a gate its prompt never saw.
- **24 hours is the ceiling** of any unattended wave; opening a wave refuses a longer window.
- **Never touch another session's worktree.** Read it through `node scripts/worktree-activity.mjs`
  and plan around it: never open, change, clean or adopt it.
- **One browser-driving job per machine.** The job queue starts one at a time, whatever its budget;
  rows run e2e and screenshots through it (`:queued` scripts), never the shared browser pane.
- **`docs/private/` stays private.** Plan with it; never copy it or cite a date from it in a prompt,
  PR, commit or report.

You plan, launch, read results and report. You do not edit product code, build or merge: a fix you
can see becomes a row.

## 1. Start

- **The window** is what the prompt names, in Helsinki time, written with its offset
  (`2026-10-09T06:00:00+03:00`). Unstated: ask if the owner is here, otherwise run to the next
  06:00. A night wave first runs `npm run jobs -- presence away`, so the job queue may use more
  memory; a day wave leaves presence alone.
- **Open the wave**: `node scripts/wave-plan-store.mjs --open <date> <day|night> --until <iso>`.
  It refuses a second open wave and a window over 24 hours, and prints the wave file, which lives
  outside any checkout. The prompt, the work list, one line per launch and result, and the report
  go there; nobody else has to read it. After a restart, open the same date and kind again.
- **Read once**: the prompt; `docs/GOALS.md` headings and the `## Outcomes` rank line;
  `node scripts/worktree-activity.mjs`; `npm run jobs`; free memory; the retro in the last wave
  file's `## Report` (`node scripts/wave-plan-store.mjs --list`). Read code only to settle a planning
  question; each row does its own research.
- **If the owner is here** and the prompt leaves a choice of direction, scope or taste open, ask
  it now, one question at a time, with your recommendation. Once rows run, ask nothing: decide,
  record the decision in the wave file and the report, and keep going.

## 2. The work list

Most important first, written in the wave file before the first launch:

1. Everything the prompt asks for, in its order. Answers it carries from the owner's weekly session
   are recorded where they belong first.
2. Then the backlog, which is GitHub Issues: `P1`, then `P2`, then `P3`, and within a priority by
   `docs/GOALS.md` rank with `owner ask` first (`gh issue list --label P1 --limit 200 --json number,title,labels`).
   Skip an issue that waits on the owner (`needs owner`, a decision, money, an account, his own
   check), one labelled `later` or speculative, and one whose files a live worktree holds.

**The issue list gets shorter every wave.** Count the open `P1`-`P3` issues when the wave opens and
when it ends. Before building from the backlog, one row checks the open issues against current
`main` and closes each one it verifies is already fixed, obsolete or a duplicate, with a one-line
comment saying what it checked; only a product decision waits on the owner. An issue closes only on
evidence (the check that proves it, a screenshot in the PR), never on hope. Keep going until no
open issue fits the window or the list is empty.

Shape each item into a row one session can finish. An issue too big for one row, or a new major
outcome, is planned first: a planning subagent on Fable (the Agent tool, model `fable`) writes a
compact spec (`docs/work-specs/README.md`) with acceptance criteria and steps that each land on
their own, and Opus rows build them, commenting on the issue with what is done and what is left; it
closes when every criterion is verified. Two items on the same file or user flow are one row, or
run in turn; so are two rows that each need a new migration number, e2e spec or `package.json`
change, unless the prompt assigns the numbers. **The owner's intent binds, his wording does not**:
serve what he wanted, keep the detail where he made it the point (a taste ruling, a figure he
gave), and report a difference rather than asking about it.

## 3. Launch

At most four rows at once; a docs-only row counts half; fewer when free memory is under 4 GB. Each
row runs in its own worktree on `claude/<letter>-<name>` or `codex/<letter>-<name>`. Letters run
A, B, C and never repeat within a wave. Log each launch in the wave file: letter, branch, goal,
time.

- **Claude Code:** the Agent tool with `run_in_background`, agent `wave-row` (`wave-row-deciding`
  for one expensive judgement with the evidence in hand, `wave-row-mechanical` for a written
  recipe). Each finished row wakes you.
- **Codex:** `git worktree add -b <branch> <path> origin/main`, then `spawn_agent` with the prompt
  and that absolute path as the row's only working directory; `wait_agent` with a timeout.

The prompt, about fifteen lines:

```
ROW <L> - <three-word name>      BRANCH <tool>/<l>-<name>
GOAL    <what is true when it is done, observable>
WHY     <the owner's words or the GOALS outcome it serves; the issue, if any>
ACCEPT  <the checks or the before and after that show it>
READ    <pointers; line ranges for big files>
TOUCHES <forecast; mark a file the row creates (new)>; <row X> owns <Y> in this wave
<the row brief below, as it stands>
```

The row brief:

```
You own this row like a session of your own: research or reproduce first, decide the design, build,
verify, land. Decide design defaults yourself and say what and why in the PR. Ask nobody; if a real
owner decision blocks part of it, finish the rest and say so.
If your branch is worktree-agent-*, run `git fetch origin main && git reset --hard origin/main &&
git branch -m <BRANCH>` before your first commit.
Verify with targeted checks only; CI runs the full build and suites. Locally: `npm run gates -- run
--changed origin/main`, lint and type checks on what changed, and for a visible change the one or
two specs covering it, through the job queue. Look at before and after screenshots yourself; never
commit them.
A row that finishes an issue puts `Closes #<n>` on its own line in a commit message. Left over:
genuine unfinished work becomes a GitHub issue (`gh issue create`, with a priority, an area label
and why it matters); a small follow-up is fixed in this row instead, because every new issue counts
against the wave. Nothing speculative. No handoff file, and no new doc unless the doc is the goal.
Then /check and /queue-merge. Right after queueing, post one comment on the pull request
(`gh pr comment`): what is not done, with its issue, and for a visible change which page to open
on the preview deployment. Do not wait for the landing.
Never merge or push main, never touch another worktree, and leave nothing running.
```

## 4. While rows run

Act when a row finishes or the timer fires, and at no other time:

- Log one line: the PR, what it did, what it left as issues.
- If the window still fits another row (the median row time so far, or 60 minutes before there is
  one, plus 30 minutes to land), launch the next item.
- Read `npm run jobs -- failed`: each queued pull request whose landing failed, with its CI log.
  That row, or one that ended without a PR, is sent the failure (Claude Code: SendMessage to the
  row; Codex: `send_message`) and resumes in its own worktree. After two failed repairs, report it.
  Another session's failed PR is that session's to repair; if no live session holds it, give it a row.
- A row past twice the median with no result is reported, never killed; launch beside it only if
  the machine has room.

Do not poll and do not watch CI: GitHub's merge queue, quarantine and alarms keep `main` green. One
timer covers a row that never reports: in Claude Code a background `sleep 1800`, re-armed when it
fires while rows run; in Codex a thread heartbeat every 30 minutes. End each turn with one line on
what is running, never a promise to wait.

## 5. End

Stop launching when the next row would not land inside the window. When no row is running, wait
for the wave's pull requests to merge or fail (`npm run jobs`, `gh pr view <n>`), confirm `main`'s
CI is green after the last landing, and look at the changed public surfaces on production. Then
write the report into the wave file under `## Report` and send it to the owner. A row still
running at the window's end keeps running; the report says so.

**The report**, at most 25 lines, in plain words for a non-technical reader:

1. **Needs you**, first, each with the exact step, or "nothing".
2. **Issues**: open at the start and at the end; closed as fixed, as already done or obsolete, and
   as duplicates; opened, each with why it could not be fixed in this wave.
3. **Shipped**: one line per pull request, what changed for a user and how it was verified.
4. **Not done or not checked**: one line each, with the issue it went to.
5. **Retro**: at most three findings and what was done about each.

## 6. The retro: improve without growing

Look at what cost time or attention in this wave: waits, refusals, reruns, a row that went wrong,
anything you or a row read that changed nothing. Close each finding in exactly one way:

- **Fix the cause**: a script, test, hook or default, as a row now or an issue.
- **Edit this file or the row brief**, by replacing or deleting text. Add a line only when nothing
  can go, and say so in the report.
- **Drop it** as a one-off.

Never write a new doc, record or note for a lesson. At the start of the next wave, check the last
retro's fixes took effect; one that did not gets a second look, not a second rule.
