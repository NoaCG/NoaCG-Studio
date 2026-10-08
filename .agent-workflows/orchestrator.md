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
- **One browser-driving job per machine.** Rows run e2e and screenshots through the job queue
  (`:queued` scripts), never the shared browser pane.
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
  go there; nobody else has to read it.
- **Read once**: the prompt; `docs/GOALS.md` headings and the `## Outcomes` rank line;
  `node scripts/worktree-activity.mjs`; `npm run jobs`; free memory; the last wave file's
  `## Retro` (`node scripts/wave-plan-store.mjs --list`). Read code only to settle a planning
  question; each row does its own research.
- **If the owner is here** and the prompt leaves a choice of direction, scope or taste open, ask
  it now, one question at a time, with your recommendation. Once rows run, ask nothing: decide,
  record the decision in the wave file and the report, and keep going.

## 2. The work list

Most important first, written in the wave file before the first launch:

1. Everything the prompt asks for, in its order, then any ruling the owner gave that no doc
   records yet (`npm run alignment:pending`).
2. Then the backlog by `docs/GOALS.md` rank, the owner's asks first within a rank
   (`node scripts/owner-receipts.mjs` lists them; `docs/backlog/` holds the rest). Skip an item
   that waits on the owner (a decision, money, an account, his own check), one that is speculative,
   and one whose files a live worktree holds.

Shape each item into a row one session can finish: split a large item into steps that each land on
their own; make two items that change the same file or the same user flow one row, or run them one
after the other. Two rows that each need a new migration number, e2e spec or `package.json` change
get their numbers in the prompt or run in turn. **The owner's intent binds, his wording does not**:
serve what he wanted, keep the detail where he made it the point (a taste ruling, a figure he
gave), and report a difference rather than asking about it. A new major outcome gets a compact
spec first (`docs/work-specs/README.md`).

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
WHY     <the owner's words or the GOALS outcome it serves; the backlog file, if any>
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
Verify in proportion: `npm run build`, and the e2e specs that cover what you changed, through the
job queue (`node scripts/e2e-affected.mjs --list --files <changed>` finds them; a copy or style
change runs the specs that assert it, not the affected set). A visible change gets a before and
after screenshot linked in the PR body, never committed.
Then /check and, as your last action, /queue-merge. Do not wait for the landing.
Left over: genuine unfinished work or a worthwhile follow-up goes under "Not done" in the PR body
and into docs/backlog/ (one file, linked from the PR). Nothing speculative. No handoff file, and no
new doc unless the doc is the goal.
Never merge or push main, never touch another worktree, and leave nothing running.
```

## 4. While rows run

Act when a row finishes and at no other time:

- Log one line: the PR, what it did, its "Not done" items.
- If the window still fits another row (the median row time so far, or 60 minutes before there is
  one, plus 30 minutes to land), launch the next item.
- A row that ended without a PR, or whose PR went red or conflicted, gets a fresh repair row: the
  branch, the failing check and its log, the row's GOAL and WHY. Never resume or enter the old
  worktree. After two failed repairs, stop and report it.
- A row past twice the median with no result is reported, never killed; launch beside it only if
  the machine has room.

Do not poll and do not watch CI: GitHub's merge queue, quarantine and alarms keep `main` green. One
timer covers a row that never reports: in Claude Code a background `sleep 1800`, re-armed when it
fires while rows run; in Codex a thread heartbeat every 30 minutes.

## 5. End

Stop launching when the next row would not land inside the window. When no row is running, wait
for the wave's pull requests to merge or fail (`npm run jobs`, `gh pr view <n>`), confirm `main`'s
CI is green after the last landing, and look at the changed public surfaces on production. Then
write the report into the wave file and send it to the owner. A row still running at the window's
end keeps running; the report says so.

**The report**, at most 25 lines, in plain words for a non-technical reader:

1. **Needs you**, first, each with the exact step, or "nothing".
2. **Shipped**: one line per pull request, what changed for a user and how it was verified.
3. **Not done or not checked**: one line each, with the backlog file it went to.
4. **Retro**: at most three findings and what was done about each.

## 6. The retro: improve without growing

Look at what cost time or attention in this wave: waits, refusals, reruns, a row that went wrong,
anything you or a row read that changed nothing. Close each finding in exactly one way:

- **Fix the cause**: a script, test, hook or default, as a row now or a backlog item.
- **Edit this file or the row brief**, by replacing or deleting text. Add a line only when nothing
  can go, and say so in the report.
- **Drop it** as a one-off.

Never write a new doc, record or note for a lesson. At the start of the next wave, check the last
retro's fixes took effect; one that did not gets a second look, not a second rule.
