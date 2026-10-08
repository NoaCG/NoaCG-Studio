# orchestrator-week - the weekly owner session

Shared canonical procedure - `/orchestrator-week` in Claude Code, `$orchestrator-week` in Codex,
and the body of the `weekly-owner-session` scheduled task (`docs/ROUTINES.md`). Runs once a week on
Tuesday morning, in a fresh session, read-only on the repository; it writes no file at all.

**Why.** Two owner rulings, one week apart, and they fit together.

- 2026-09-03: a standing loop that checks the orchestrator skill once a week - how much of the Codex
  and Antigravity subscriptions were used, how many decisions were taken without asking him, what
  the skill changed about itself, and how it can improve.
- 2026-09-05: *"We need to have the agents aligned with my thoughts about NoaCG and we could have
  weekly alignment checks so we make sure that we have the same plan and vision. The rest we can
  automate."* No technical or design question ever reaches him. **Alignment is the only gate that
  does, and it is weekly.**

So this session is **his five minutes**: the plan for the week, the places where the plan and his
vision could genuinely differ, anything serious he should know about, and how the week went in the
few numbers that change what he would do. Each wave's retro fixes the machine; this page shows him
the week.

Tuesday, not Monday, by his ruling (2026-09-03): his weekly allowance can be spent by Monday.

## 1. Measure - six commands, nothing recalled

Work from a checkout of current `origin/main` - the scheduled run gets a fresh worktree of its own -
and never in the primary checkout, which the merge queue relies on. The feedback count reads the
main checkout's `.env` by itself, the orchestrator home is found from any checkout, and the wave
plans live in the store (`node scripts/wave-plan-store.mjs --list`), reachable from anywhere.

    node scripts/orchestrator-week.mjs
    npm run night:report -- --hours 168
    node scripts/alarm-issues.mjs
    node scripts/wave-plan-store.mjs --list
    npm run feedback:count
    npm run check:freshness

The first prints one page: tokens by model and per harness on each meter, the Codex snapshot, the
Antigravity calls, the delegation outcomes and which capability observations lapsed; the waves and
their rows by pool, and what the queue landed; the `DECIDED:` count and the issues opened, with how
many carry `owner ask` or `needs owner`; and the commits that touched the orchestration system,
with the common-path line count now against the window's start. Every number names its source in the
script's header; do not restate a number the page does not carry. **Most of it is raw material, not
report**: a number reaches him only when it changes something he would do (step 3).

The night report over 168 hours is the queue's week: what landed, what was refused and why, and how
many landings needed a retry. Its headline line is what matters; the per-branch lists are not for
him. `alarm-issues.mjs` names what is red on `main` right now. The wave-plan store lists this week's
waves; read the `## Report` at the end of each one written in the window, because each holds what
shipped, what was not done and that wave's retro. Last, compare the scheduler's list of tasks with
the table in `docs/ROUTINES.md`: every enabled routine there, on the cadence it states.

**If the waves section says NO WAVE PLAN FOUND, that is not a quiet week.** It names every
directory it searched and what each held; a page in that state has lost the week's routing and its
`DECIDED:` record, so the recap says the evidence is gone rather than reporting zeroes. Say which
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

## 2. The alignment read

This is the half the owner attends, so it is written for him and it is short. Read four things:

- the North Star and the outcomes marked `(now)` in `docs/GOALS.md` - what we are building toward;
- `gh issue list --label "owner ask"` - what he has asked for that is still open. An ask's age is the
  date he said it, quoted in the issue body, not the date the issue was opened;
- the `P1` and `P2` issues (`gh issue list --label P1 --limit 200`, then `P2`) that serve an outcome marked now;
- the open `bug` issues at `P1` (`gh issue list --label bug --label P1`) - what is broken for a user.

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
task, and leaving the justification out is what keeps the page short.

Then read it back cold before printing, against one question: **would this still make sense to
someone who does not know what the queue is?** Bold headers and a reason under each are the tell -
that is a board, and a board is what the 2026-09-05 ruling deleted.

### The two or three questions, and nothing else

End the read with **at most three questions**, under the ask-test the repo already has
(`root/question-owner-names-reason-own-text`): a question is his only when it changes the outcome
(intent, direction, UX or taste, scope, money), and it carries `needs: decision` in its own text.
Each question challenges an assumption or proposes a better goal, with a recommended
answer. When he names a date he is working toward, say plainly what that date needs, and plan
everything else on merit.

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
queue keeps working toward it - that is the point of the ruling, not a fallback. Nothing in NoaCG
ever waits on this page.

### Everything worth doing travels in one prompt, never a file

**A question said only in chat is gone when the session closes**, and so is his answer. So the
session ends with ONE fenced block he pastes as the prompt of his next `/orchestrator` wave. It holds
two things, either of which may be empty:

- **His answers**: each question, his answer in his own words (never trimmed to fit), and where the
  wave records it - direction in `docs/GOALS.md`, a rule or a plan in its scoped doc, private
  context in `docs/private/`. A question he leaves unanswered stays out; the plan stands.
- **At most three pieces of work** step 3 turned up - a serious problem, or a fix for where the week
  lost time - each with its goal, why, and the issue it serves if there is one. A problem already
  covered by an open issue the wave will pick anyway is not repeated here.

Routines report; sessions write, and the wave is the session that writes. With nothing in either
half, there is no block.

```
From the weekly owner session of <date>:
Record the owner's answers, where each belongs:
1. Q: Does the SVG road still deserve the top of NOW, six weeks in?
   A (his words): "..."
   Record in: docs/GOALS.md
Then do, most important first:
1. GOAL ... WHY ... (#<issue>)
```

## 3. Report in chat

Six short sections, numbers from step 1, and nothing written to disk. Each one is a line or a few,
and a quiet section says so in one line rather than disappearing, so he can tell quiet from missing:

1. **The week's plan** - the five-minute list from step 2, in order.
2. **What needs you** - the at-most-three questions, each tagged `needs: decision`, or the words
   "nothing needs you this week".
3. **Serious** - anything a user could hit or that could stop work: red on `main`
   (`alarm-issues.mjs`), a `P1` bug, an owner ask that has waited three weeks or more without
   starting, a routine missing from the scheduler or running on the wrong cadence, a meter near its
   cap that will change routing (Codex's weekly snapshot, for example). One line each, at most
   three, with what happens if nobody acts. Nothing is "the queue has it in hand" here; if the queue
   has it, it is not serious.
4. **How the week went** - at most three numbers, each with the one thing it suggests: what landed
   and how much needed a retry or was refused (night report headline); for each wave, how much of
   its window had rows running and how many pull requests it landed (its `## Report`); and where
   his own attention went that the machine could have covered. A number that suggests nothing is
   left out - token totals, the most-used model and session counts usually are.
5. **Feedback** - the counts in one or two lines. If anything arrived at all, the one action:
   *open <https://noacg.studio/admin> and read what they wrote* - the count cannot tell you what
   they said, only that they said something. Zero is one line, unpadded.
6. **Freshness** - only what it flagged. All current is one line.

**Then the prompt block from step 2, and nothing else.** That is his five minutes. Fixing the
machine itself is each wave's retro (`.agent-workflows/orchestrator.md`, step 6); this page shows
what a fix should aim at.

Plain English throughout, written for a non-technical reader: no run ids, no SHAs, no
workflow filenames, no praise, no summary paragraph.

## What this never does

It edits no tracked file, commits nothing, queues nothing, and starts no wave: routines report,
sessions write (`docs/ROUTINES.md`). An improvement it is sure of is still a row for a session,
because the session that lands it verifies it. It does
not compute a Claude percentage - the machine cannot read one, and the owner reads the weekly
figure off his own account page - and it never sums tokens across harnesses, because the meters
count different things.
