# Section 7 - the morning report

**Only for a wave that has already run** - when the plan is first written this section is one line
saying when the report will be available. It is what the user reads instead of opening six
sessions, produced entirely from read-only commands in this session, and **ordered by who is
blocked** - the reader acts on it over coffee, so the report is short and everything long sits
behind a link. Every number in it names the command it came from.

1. **Needs you, FIRST, and step-by-step.** Anything waiting on the user carries its FULL
   instructions inline - never a pointer to a file they must open. The user is the critical path:
   a night's work postponed because their part was unclear is the whole night wasted. Walk items
   stay one line each - `/walk` carries the detail - it is the non-walk actions (a registry
   setting, a token to revoke, anything with a form to fill) that get every step written out.
2. **Landed** - a one-line-per-branch table from `npm run jobs`: branch, commit, five words.
3. **Continue prompts, pasteable - only where the work is real.** One fenced block per session
   whose handoff leaves genuinely valuable follow-up, in the section-5 format, so the user can
   scroll and paste. **A finished session gets no prompt.** Never invent work to fill this section
   - most mornings it holds zero or one block, and an empty section is the good outcome.
4. **Handoffs, drained** - the output of `node scripts/handoff-drain.mjs`: every file with its
   class, and the one quoted "what is left" line for each `deferred` or `owner` file. Never the
   full text. A file still `UNCLASSIFIED` here is the report's own defect, fixed before it ships.
5. **Refused, and WHICH KIND** - a refusal is written on the pull request (`gh pr view <n>`,
   `gh pr checks <n>`), and the kinds are different mornings: a check red ON THE PULL REQUEST
   (`CI gate` or `Reviewed`), so it never entered the queue; dropped FROM THE MERGE GROUP, `CI gate`
   red on the temporary merge and auto-merge turned off; a CONFLICT with what landed, a pull
   request that cannot merge; and no `noacg/reviewed` on the tip, the branch having moved after it
   was queued. A stacked pull request also leaves the queue when its parent lands, with every check
   green - `gh pr merge <n> --auto` puts it back. Name the kind, not just the failure, and read the
   watcher job's log (`node scripts/jobs.mjs log <id>`), not only the listing: a refused landing
   drops out of `npm run jobs` by morning and reads as "never queued", a different (wrong) story.
6. **Still unqueued** - `npm run jobs` for every branch ahead of `main` with no landing,
   `node scripts/worktree-activity.mjs` for work a session left uncommitted.
7. **Spend, on each pool's own meter** - `npm run harness:usage -- --wave`, pasted as it prints:
   which harnesses ran, the Codex window percentages where a snapshot exists, the Antigravity
   calls and failures, Claude tokens by project, and the delegation outcomes table - every
   delegated row with its pool, its outcome, and whether the fault was the worker's or ours. **Never a single cost
   summed across providers**: the meters count different things, and the script refuses to add
   them for that reason. A pool with no line did not run.
8. **Owner receipts** - `node scripts/owner-receipts.mjs`: what this wave started, landed or
   parked, and every standing ask with its age. A receipt older than a week that no wave has
   started is the first line of the next plan's pushback.
9. **Follow-ons and loop vitals, brief, last** - which fired and when, which did not and why; for
   a conditional one, which arm the handoff file selected; ticks fired and the time of the last
   one, read from the wave-state file's heartbeat lines and `wave-tick-events.log`. A report that
   cannot show a live tick late in the night is reporting a dead loop, and says so. Any rewind
   taken (`recovery.md`) is named here with the abandoned branch and the corrected assignment.
   Work the night opened up that fits no prompt goes here as candidate rows.
10. **The alignment questionnaire** - every decision taken on the owner's behalf this wave (the
    section-6 answer-it-yourself rule), asked back as options-with-recommendation with the taken
    answer marked, each item opening with `DECIDED:` so `scripts/orchestrator-week.mjs` can count
    them against the asks. A teaching instrument, not a gate: the work already shipped, the owner vetoes
    cheaply, and the pattern of vetoes is what tunes the next wave's decisions.
11. **One lesson, in every report** - one thing this wave taught that the next wave will apply,
    named concretely; when it is an orchestration lesson, the report says which mechanism, test,
    state or module carries it now (the core's "Every wave improves the orchestration system").
    A wave that taught nothing says so - a lesson is found, never invented.

**The report and the questionnaire are written for a NON-TECHNICAL reader**: what happened, what
was chosen, why, and what to do - in plain words, with jargon never carrying the meaning.
*"Nothing gets lost just because I don't understand it."* A row the owner cannot follow is a
failed row, whatever it records.

In Claude Code the watch loop produces this by itself when the wave finishes. Anywhere without a
loop, it is produced by re-invoking this workflow in the morning, and section 7 of the evening's
plan says so in one line.

Nothing in this section merges, re-queues or cleans up anything. A refusal is reported with the
command that would settle it and WHERE to run it, exactly as section 5's prompts are.

## Work the wave surfaces

**A suggestion addressed to the owner is not a tracked task.** A wave routinely uncovers real work
outside the row that found it - a defect noticed in passing, a machine fault, a rule that wants a
mechanism. Whatever channel surfaced it (a task chip, a handoff's "next", a line in a review), the
orchestrator files it as a **`docs/backlog/` item with front matter per that folder's README**,
inside the same wave. The chip is at most a convenience on top of the file, never instead of it.

Owner, 2026-09-03: *"I am not going to click these suggested task chips manually. If the system
surfaces a useful task like this, the orchestrator should automatically capture it into the
backlog/to-do system when appropriate."* The evidence was one wave old when he said it: the e2e
web-server hang that blocked the whole machine for 126 minutes had been captured as a chip, and a
grep the next morning found it in no backlog file and no commit. **A chip is a suggestion to a
human; a backlog file is a tracked item**, and the difference only shows on the day nobody clicks.

The judgement stays real - not every observation is a task, and `docs/backlog/README.md` deletes an
item with no stated Why. What changes is the default: anything worth surfacing to the owner is
worth a file, and "it was in the chip" is not an answer to "where is it tracked".
