# Standing routines

Scheduled Claude Code tasks that run on TIME, not on a commit - the whole point, because CI fires on
a push and so never notices that a week went by, a dependency aged, a competitor shipped, or
somebody left feedback nobody read.

They live per machine, not in this repo, under `~/.claude/scheduled-tasks/<id>/SKILL.md`, and run
while Claude Code is open.

| Routine | Cadence | Task id | Reaches the owner |
|---|---|---|---|
| Morning brief | daily 07:00, before the wave is planned | `daily-morning-brief` | only when something needs him |
| Delegation tooling update | daily 09:17 | `codex-update-check` | only when an update broke |
| **Weekly owner session** | **Tuesdays 09:15** | `weekly-owner-session` | **every week - this is his gate** |
| Competitor review | 1st of the month, 10:00 | `monthly-competitor-review` | monthly |
| Quality / refactor review | 15th of the month, 10:00 | `monthly-quality-review` | monthly |

Five routines, and he attends one of them. That is the shape to keep.

## The two rules

**Routines report; sessions write.** A routine that finds something says what to do and stops. It
does not start the work, and it never edits a tracked file in the primary checkout - `auto-merge.mjs`
refuses every queued landing while `git status --porcelain` is non-empty there, so one stray
untracked file jams the merge queue for the whole morning. The three files routines are allowed to
write all end in `.local.md`, which `.gitignore` carries for exactly this reason.

**The one exception, written here so it cannot widen quietly:** the monthly quality review files its
findings under `docs/backlog/` on a BRANCH, through the ordinary landing flow, and only when the
primary checkout is clean and on `main`. It is an exception because a ranked finding that exists
only in a chat log is gone by Tuesday, and because the shelf is how `/orchestrator` picks up spare
capacity. No other routine may write a tracked file, and this one may not write anything outside
`docs/backlog/`.

**Silence is the default on a daily.** A routine that speaks every morning is a routine that gets
skimmed and then ignored. The morning brief says nothing on a clean night, and that is not a bug to
be helpfully fixed later.

## Daily - the morning brief

`daily-morning-brief`, 07:00 Helsinki, so the verdict is in hand **before the morning wave is
planned** (owner, 2026-08-29). A report that lands after the wave has started cannot change what the
wave does.

It answers three questions that arrive at the same moment and used to be three separate routines:

1. **What is still broken now**, after the night's noise settled - the CI verdict. GitHub already
   emails when a run fails, so a break that went red at 21:00 and was fixed by 04:00 is never
   repeated here. Resolved is silent.
2. **What the queue did overnight** - `npm run night:report -- --write` over the last twelve hours:
   what landed, what refused and under which refusal kind, what the queue repaired by itself, and
   what still needs a person, each with the command that answers it. It groups by the kinds
   `refusalGuidance` (`scripts/jobs-store.mjs`) already owns rather than inventing a second
   vocabulary that would drift from the one the queue acts on.
3. **What did not run at all** - silence never sends an email, so a cron that stopped firing is
   invisible everywhere else. That covers `nightly.yml` and `configured-suite.yml`.

**Why these three are one routine.** They were written separately and the seams showed. The night
report was documented to run "just before" the CI verdict so the two would arrive together, which is
an admission that they are one answer to one question: *does this morning need me?* The
configured-suite cron check was a standing task created for a specific investigation in August 2026;
its finding has long since resolved and what remains of it is one line inside silence detection. Two
of the three had also drifted out of existence - see "What the table used to claim" below.

It writes `docs/handoffs/night-report.local.md` every run and
`docs/handoffs/ci-morning-report.local.md` only when it speaks, deleting that second file on a clean
morning. Deleting is what keeps it honest: the file's whole meaning is *this was true at 07:00
today*, so yesterday's must never survive into today. `npm run night:report` on demand answers the
same question over any window (`-- --hours 24`, `-- --since 2026-09-04T18:00`, `-- --json`).

## Daily - delegation tooling

`codex-update-check` upgrades the Codex CLI, the Codex plugin and the Antigravity `agy` CLI on
sight, verifies each one, and rolls back automatically if verification fails. **It is the only
routine that acts rather than reports**, which is exactly why it is not folded into the morning
brief: an alert-only brief that quietly installs things is a brief nobody can trust. It speaks only
when something changed or a rollback happened.

## Weekly - the owner session

`weekly-owner-session`, Tuesdays 09:15. It runs `.agent-workflows/orchestrator-week.md`, which is
the canonical procedure, shared with the `/orchestrator-week` command and the Codex skill of the
same name.

**This is the only standing gate that needs the owner**, and it exists because of his ruling on
2026-09-05: *"We need to have the agents aligned with my thoughts about NoaCG and we could have
weekly alignment checks so we make sure that we have the same plan and vision. The rest we can
automate."* The same ruling removed him from every technical and design question. So the session's
first half is the alignment check - the week's plan in five minutes, and at most three questions,
each of which must pass one test: *would his answer change what we build or in which order, in a way
no model can derive from the docs?* A technical question, a merge conflict, a "which first" the plan
already answers, and anything of the form "is this okay?" all fail that test and are decided by the
strongest available model, recorded where he can revert them.

**Unanswered is not a stop.** If he does not answer, the plan stands and the queue keeps working
toward it. Nothing in NoaCG waits on this page. That is the property that makes "the rest we can
automate" safe rather than merely optimistic.

The session's second half is the machine reviewing itself - spend by model and harness, decisions
taken against asks made, what the orchestrator skill changed about itself, what other orchestrators
do now, and at most three improvements as candidate wave rows. That half is written to the file and
not read out.

Feedback and freshness ride here too, and they used to be their own Monday routine. Feedback,
because `/admin` has a real inbox that only works for somebody who opens it - the owner's ruling,
2026-08-26: *"I will not remember to go to the admin page."* Counts travel and words do not:
`--count` never asks the database for the message column, so what a person wrote stays behind the
admin login as a property of the query rather than of the printing. Freshness, because
`docs/STACK_FRESHNESS.md` is time-driven and nothing else mentions it; it reports weekly and nothing
auto-upgrades.

**It writes one gitignored file**, `docs/handoffs/<date>-orchestrator-week.local.md` in the main
checkout, and prints only the owner-facing sections in chat. The next `/orchestrator` invocation
reads the file with the rest of the handoff folder and turns its candidate rows into a wave, or says
why not.

Tuesday and not Monday, by his ruling (2026-09-03): his weekly allowance can be spent by Monday, and
he reads the weekly percentage off his account page himself, so the routine never computes or asks
for it.

## Monthly - competitor review

MXMZ, Loopic, Singular.Live, Flowics, and the SPX / CasparCG / OGraf ecosystem: what each shipped
since the last run, what it means for us, and **what we would need in place before their users could
switch**. That third section is the point; the first two exist to earn it. It is measured against
`docs/GOALS.md` NOW so it proposes against the real road, a quiet month is reported as one, and
`docs/COMPETITORS.md` + `docs/COMPETITOR_MXMZ.md` are the background it starts from.

**Its OGraf findings get a written destination, and the routine still does not write.** The
OGraf-leads bet is decided by OTHER PEOPLE's adoption accumulating over months, so a finding said in
chat and nowhere else is gone when the session closes - which is what had been happening. The ledger
is `docs/backlog/ograf-ecosystem-watch.md`, and the routine's job is to end its run by printing the
block to append: a date heading, one bullet per item with a date, what it means for us, and a source
URL, or the words for a quiet month. The append itself is made by a session working on a branch.

## Monthly - quality and refactor review

Three to seven ranked proposals about the SOURCE, plus the Supabase advisor baseline, CI and e2e
cost, and context-window cost: the grandfathered-debt list in `docs/ARCHITECTURE.md`, lint
suppressions, oversized modules, duplication, dead code, verification gaps, the month's churn - each
with a measured cost, a size, and what would prove it did not break. Every run covers all four
areas, because the point of a fixed set is that a quiet area proves itself quiet.

**Deliberately NOT the coherence session.** That one (`.agent-workflows/orchestrator/coherence.md`)
owns the written surface - cold-read test, contract contradictions, the byte ratchet, GOALS drift.
This one owns code and hands any doc defect over. Two reviews that overlap get read as one, then
neither.

It is also deliberately not merged with the competitor review, though both are monthly and both
produce ranked findings. They keep different write permissions - the competitor review prints a
block for a session to append, this one files to `docs/backlog/` on a branch - and fusing two
permission regimes into one prompt is how a routine quietly gains access it should not have.

## What the table used to claim

Recorded because it is the failure mode this file exists to prevent, and it took a direct question
from the owner on 2026-09-08 to surface it. A table that describes routines nobody has checked
against the scheduler is worse than no table: it reads as a verified inventory.

- **`nightly-queue-night-report` was listed and never existed.** The table said so in its own text
  and the note was six days old. The night report now runs as part of the morning brief.
- **`configured-suite-cron-check` had a task directory but was never registered**, so it had never
  run once. Its live remnant is one line of silence detection inside the morning brief.
- **`monthly-quality-review` was scheduled weekly**, cron `0 10 * * 2`, and its own description
  called it weekly while this file called it monthly. It had been running four times a month. Now
  `0 10 15 * *`, as documented.

The check that catches this next time is cheap and belongs to the weekly owner session: list the
scheduler, compare it to this table, and say which side is wrong.

The three superseded tasks - `nightly-ci-morning-report`, `weekly-feedback-and-freshness`,
`weekly-orchestrator-review` - are **disabled, not deleted**, and their descriptions say what
replaced them. They are years of tuning that took real incidents to earn, and a disabled task costs
nothing; if a merged routine turns out worse than the pair it replaced, the old prompt is still
there. Listing the scheduler therefore shows eight tasks and five schedules, which is why this table
is the one that counts.

## The parked mail digest

`.github/workflows/feedback-digest.yml` would mail the inbox nightly instead. Built, tested and
scheduled, it stays **inert-green**: with its secrets absent it prints a notice and exits 0. Turning
it on needs a Gmail app password (two-step verification on, then
<https://myaccount.google.com/apppasswords>) and four `gh secret set` commands - `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `FEEDBACK_DIGEST_SMTP_USER`, `FEEDBACK_DIGEST_SMTP_PASS`. Parked
because that is five minutes nobody has spent, not because it is wrong.
`npm run feedback:digest:dry` shows what it would send, with no configuration at all.
