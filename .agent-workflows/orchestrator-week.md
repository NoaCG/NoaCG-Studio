# orchestrator-week - the weekly owner session

Shared canonical procedure - `/orchestrator-week` in Claude Code, `$orchestrator-week` in Codex,
and the body of the `weekly-owner-session` scheduled task (`docs/ROUTINES.md`). Runs once a week on
Tuesday morning, in a fresh session, read-only on the repository; it writes exactly one gitignored
file.

**Why.** Two owner rulings, one week apart, and they fit together.

- 2026-09-03: a standing loop that checks the orchestrator skill once a week - how much of the Codex
  and Antigravity subscriptions were used, how many decisions were taken without asking him, what
  the skill changed about itself, and how it can improve.
- 2026-09-05: *"We need to have the agents aligned with my thoughts about NoaCG and we could have
  weekly alignment checks so we make sure that we have the same plan and vision. The rest we can
  automate."* No technical or design question ever reaches him. **Alignment is the only gate that
  does, and it is weekly.**

So this session has two halves and they are not equal. **Part A is his five minutes** - the plan
for the week and the places where the plan and his vision could genuinely differ. Parts B to D are
the machine reviewing itself, which he never has to read. Part A goes in chat; everything goes in
the file.

Tuesday, not Monday, by his ruling (2026-09-03): his weekly allowance can be spent by Monday.

## 1. Measure - three commands, nothing recalled

Work from the PRIMARY checkout, `C:\claude\NoaCG-Studio`, so the orchestrator home and the `.env`
the feedback count needs are in reach. The wave plans live in the store, not in a checkout
(`node scripts/wave-plan-store.mjs --list`), and are reachable from anywhere.

    node scripts/orchestrator-week.mjs
    npm run feedback:count
    npm run check:freshness

The first prints one page: tokens by model and per harness on each meter, the Codex snapshot, the
Antigravity calls, the delegation outcomes and which capability observations lapsed; the waves and
their rows by pool, and what the queue landed; the `DECIDED:` count against the asks in the week's
handoffs and the owner-queue items by kind; and the commits that touched the orchestration system,
with the common-path line count now against the window's start. Every number names its source in the
script's header; do not restate a number the page does not carry.

**If the waves section says NO WAVE PLAN FOUND, that is not a quiet week.** It names every
directory it searched and what each held; a page in that state has lost the week's routing and its
`DECIDED:` record, so section 6 says the evidence is gone rather than reporting zeroes. Say which
directory was empty and whether the store itself is missing - the plans went missing exactly this
way in the 2026-09-01 window, before the store existed.

`feedback:count` counts the last 168 hours - total, negative against positive, how many carried a
written note, how many are still at status `new`. **It never reads the message column**, so what
people wrote stays behind the admin login; that is deliberate and it is why the number can be read
out in chat at all. If it fails on a missing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, say the
checkout's `.env` lost the pair. Never substitute a zero for an error.

`check:freshness` covers vendored GSAP/Lottie versions, pinned model ids and the e2e duration
check. It exits non-zero when something has aged; **that is a report, not a failure**. It rides here
because `docs/STACK_FRESHNESS.md` is time-driven and nothing in CI ever notices that a week passed.

## 2. Part A - the alignment read

This is the half the owner attends, so it is written for him and it is short. Read four things:

- the north star and `## NOW` in `docs/GOALS.md` - what we have committed to build next;
- the programme register in `docs/PROGRAMMES.md` - which programmes are ACTIVE, AUTHORIZED or held,
  and what each one's next gate is;
- `node scripts/owner-receipts.mjs` - what he has asked for, what advanced, what is still unstarted;
- the backlog frontier: the `docs/backlog/` entries whose `serves:` is NOW, newest first.

Then write **the week's plan as something he can read in five minutes**: what the queue will work
toward this week, in order, in plain words. Not tasks - directions. A line an outsider could not
follow is a line he cannot check.

**The shape is what decides whether that holds**, and the first session to run this page cold drifted
straight past the sentence above (dry run, 2026-09-10): it wrote four bold-headed entries with a
justifying paragraph under each, twelve lines for four directions, and what came out was a sprint
board with reasons attached. So the shape is fixed rather than described. **One sentence per
direction, four or five of them, no bold lead-ins, no sub-bullets**, and the last one says what is
NOT being started this week - that line is the most useful thing on the page, because it is the only
one that tells him what he is giving up. A direction needing a second sentence to justify itself is a
task; the justification belongs in section 7, and its absence here is what keeps the page short.

Then read it back cold before printing, against one question: **would this still make sense to
someone who does not know what the queue is?** Bold headers and a reason under each are the tell -
that is a board, and a board is what the 2026-09-05 ruling deleted.

### The two or three questions, and nothing else

End Part A with **at most three questions**, and apply the ask-test the repo already has rather than
a second one. The invariant `root/question-owner-names-reason-own-text` gives a question to the
owner five possible reasons - `needs: account`, `money`, `identity`, `harness`, `alignment` - and
this page owns exactly one of them. **Every question here is a `needs: alignment` question, and its
block must say so** - on the HEADING line, `### ALIGN-<date>-<n> - needs: alignment`, which the
parser reads and he never has to. Not at the front of the question itself: the dry run put
`needs: alignment.` as the first words of all three questions, so the first thing he read three
times was a routing token from a contract he has never opened, in the half of the page written for
him - and `rulingBlock` then copies it into `docs/OWNER_RULINGS.md` as the opening words of the
permanent record of what he was asked. The requirement is unchanged and so is the invariant behind
it; only the line it sits on moves, and it stays inside the block that gets carried forward. The
other four reasons reach him when they arise, through whatever session hits them; they do not wait
for Tuesday.

So the filter is the orchestrator's §6 ask-test narrowed to that one reason:

> Would his answer change WHAT we build or IN WHICH ORDER, in a way no model can derive from the
> docs?

A question about direction, taste, what NoaCG is for, or whether an item still deserves its place in
`NOW` passes. **A technical question, a design question, a merge conflict, a "which first" the plan
already answers, and anything of the form "is this okay?" all fail** - those were removed from him
by the 2026-09-05 ruling, and putting one here reintroduces the gate through the back door. Decide
them, record the decision where he can revert it, keep working. If a week has no such question, say
*"nothing needs you this week"* and mean it - a manufactured question is worse than none, because it
teaches him the page is padding.

Where the plan and the vision could differ is usually one of these, and they are worth looking for
by name: an item in `NOW` that has been there for weeks without moving, and may no longer be what he
wants; a programme sitting at a gate only he can open; an owner ask that has gone unstarted long
enough that it may have stopped mattering; a decision taken on his behalf that a reasonable person
could have taken the other way.

### It never blocks

**Unanswered is not a stop.** If he does not answer, the plan stands exactly as written and the
queue keeps working toward it - that is the point of the ruling, not a fallback. Next week's session
carries the question forward once, then drops it and records the decision it took instead. Nothing
in NoaCG ever waits on this page.

### Write every question down in the shape the machine reads

**A question said only in chat is gone when the session closes**, and so is his answer. So each
question is written into this session's own file (step 5) under a stable id, and when he answers -
in this session, or in a later one that opens the same file - the answer is filled in beside it.
From that moment the answer is on disk and nobody's memory is load-bearing.

The id is `ALIGN-<the date>-<n>`, and the shape is exactly this, because
`scripts/alignment-answers.mjs` parses it:

    ### ALIGN-2026-09-15-1 - needs: alignment
    **Question:** Does the SVG road still deserve the top of NOW, six weeks in?
    **Answer:**

An empty `**Answer:**` is an open question. Fill it in when he answers, faithfully enough that the
ruling can be written from it, and change nothing else in the block. **Both fields run until the
next blank line**, so wrap them like any other prose in this repository and write as much of what he
said as it takes - the parser joins the lines. What ends an answer is the blank line before the next
block, which is also why an unanswered question with the section's prose below it stays open.

**His answers are then recorded by a session, not by this routine.** The answer belongs in
`docs/OWNER_RULINGS.md` under its id, and in whichever doc it moves (`GOALS.md`, `PROGRAMMES.md`, a
backlog entry). Routines report; sessions write. What makes that happen rather than being hoped for:
`node scripts/wave-plan-check.mjs` refuses a wave plan that does not mention an answered id which is
not yet in `OWNER_RULINGS.md`, so the next `/orchestrator` plans the row that writes it, and the
refusal returns every morning until the ruling has landed. `npm run alignment:pending` prints what
is outstanding and the block to append.

## 3. Part B - the skill's own week

- `git log --since=7.days --format='%h %s' -- .agent-workflows/orchestrator.md .agent-workflows/orchestrator scripts/hooks`
  and read each commit's diff for one question: did it add a mechanism, or text? A lesson that
  arrived as prose where a hook, script, test or ledger line was available is the week's first
  finding (`docs/MISTAKE_TRIGGERS.md`, the four places a lesson can live).
- `.agent-workflows/orchestrator/incidents.md`: the entries dated this week, read for repeats -
  the same shape in a new costume is a mechanism that did not fire, never a new incident.
- The last wave plan's alignment questionnaire (the newest plan the store holds, written by
  `orchestrator/report.md` item 10 - NOT by the morning brief, which writes no questionnaire):
  which `DECIDED:` items were the machine's to take, and which asks in the week's handoffs were not.
- **The routines against the scheduler.** List the scheduled tasks and compare them to the table in
  `docs/ROUTINES.md`: every row has a registered task, every registered task has a row, and the
  cadences match on both sides. Say which side is wrong when they disagree - usually the doc, but on
  2026-09-08 a routine had been running weekly while the doc called it monthly, so check the cron
  and not just the name. This costs one call and it is here because the table is otherwise a claim
  nobody verifies; three of its rows had rotted before the owner asked.

## 4. Part C - look outside, briefly

Search for what other orchestrator skills and multi-agent coordinators do now - GitHub first
(`orchestrator skill`, `multi-agent coordinator playbook`, `SKILL.md orchestrate`, the pstack and
Claude Code plugin ecosystems), then whatever the search turns up. Read the source, not a
summary. Bring back at most three ideas, each classified **Already have / Adopt / Experiment /
Reject** against a measured NoaCG failure from step 1 or 3 - an idea with no failure behind it is
noted in one line and not proposed. `docs/ORCHESTRATION_REVIEW.md` carries the classifications
made so far; do not re-argue one it already settled unless the evidence changed.

## 5. Write the recap

Write `C:\claude\NoaCG-Studio\docs\handoffs\<date>-orchestrator-week.local.md` - the name MUST end
in `.local.md`, because `docs/handoffs/` is tracked and an ordinary untracked file in the primary
checkout stops every landing on the machine (`docs/ROUTINES.md`, the morning brief's rule).
Overwrite the same date's file if it exists. Seven short sections, numbers from step 1:

1. **The week's plan** - the five-minute list from step 2, in order.
2. **What needs you** - the at-most-three questions, each as an `### ALIGN-<date>-<n>` block in the
   shape step 2 gives, with an empty `**Answer:**` line; or the words "nothing needs you this week"
   and no blocks at all. **This heading is where the answers get written**, so keep it verbatim and
   check the round trip before you print: `npm run alignment:pending` must list every question you
   just wrote as open. A block the parser cannot see is a question that will be lost.
3. **Feedback** - the counts in one or two lines. If anything arrived at all, the one action:
   *open <https://noacg.studio/admin> and read what they wrote* - the count cannot tell you what
   they said, only that they said something. Zero is one line, unpadded.
4. **Freshness** - only what it flagged. All current is one line.
5. **Spend** - the by-model table and the three harness lines, then one sentence: was the scarce
   pool spent on work a proven cheaper pool could have carried, and did any cheap delegation cost
   more in repair than it saved (the delegation ledger says).
6. **Decisions and the skill** - decisions taken against asks made, and the two or three asks that
   should have been decisions, with the shape each took (a measurable question treated as taste; a
   deviation filed as a ratification; a walk that needed a test account, not his eyes). Then what
   changed in the skill, one line per commit, marked mechanism or text; the common path now against
   a week ago; any incident that repeated.
7. **Improve** - the outside ideas classified, then at most three improvements for the coming week,
   each as a candidate row in the orchestrator's section-5 shape (GOAL, WHY, TOUCHES, POOL), so the
   next `/orchestrator` invocation can lift it straight into a wave. A row whose why is "the number
   went down" is not a row; name the failure it ends. **Each row's `GOAL` line is what identifies
   it** - `scripts/weekly-candidates.mjs` numbers the file's GOAL lines in order and gives each an
   id, and for a week afterwards the plan check refuses a wave plan that leaves one unmentioned. So
   write one GOAL line per row and none anywhere else in the file, and check the round trip before
   you print: `npm run weekly:candidates` must list every row you just wrote, with its title.

**Then print sections 1 to 4 in chat, and nothing else.** Those are his five minutes. Sections 5 to
7 are the machine reviewing itself and they stay in the file, where the next `/orchestrator`
invocation reads them with the rest of `docs/handoffs/` (`orchestrator/grounding.md`).

Plain English in sections 1 to 4, written for a non-technical reader: no run ids, no SHAs, no
workflow filenames, no praise, no summary paragraph.

## What this never does

It edits no tracked file, commits nothing, queues nothing, and starts no wave: routines report,
sessions write (`docs/ROUTINES.md`). An improvement it is sure of is still a row for a session,
because the session that lands it verifies it and the coherence session reads it cold. It does
not compute a Claude percentage - the machine cannot read one, and the owner reads the weekly
figure off his own account page - and it never sums tokens across harnesses, because the meters
count different things.
