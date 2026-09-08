---
kind: walk
date: 2026-09-08
serves: now
answered: false
---
# What you answer on Tuesday now has to be written down

**Date:** 2026-09-08 · **Branch:** `claude/alignment-answer-recording`

## What changed

The weekly alignment check shipped earlier today with one honest hole in it: your answers arrived in
a chat window, and whether they ever reached `docs/OWNER_RULINGS.md` depended on somebody
remembering to lift them out. By our own rule that is a missing mechanism, not a habit to improve.
It is closed now.

Each question is written into the session's own file under an id like `ALIGN-2026-09-15-1`, with an
empty answer line. When you answer, the session fills that one line in. From that moment the answer
is on disk rather than in a conversation.

Then the plan check does the rest. `node scripts/wave-plan-check.mjs`, which every wave already has to pass
before it launches, **refuses a plan that does not mention an answered question still missing from
`OWNER_RULINGS.md`**. So the next orchestrator has to plan the row that writes your ruling down, and
if it does not, the same refusal comes back the next morning and the morning after. It clears itself
the moment the ruling lands.

An unanswered question is untouched by all of this. It is yours, nothing chases it, and nothing
blocks on it.

## The route, under a minute

```bash
npm run alignment:pending
```

Today it prints "no weekly owner session file - nothing to record", because the first session is on
the 15th. After that session it lists every question, which ones you answered, and for anything
unrecorded, the exact block a session appends to `OWNER_RULINGS.md`.

## What to look at

- **Whether the refusal is at the right place.** It is on the wave plan, not on `npm run build`. A
  build gate would have blocked every unrelated branch on this laptop over a ruling that belongs to
  the orchestrator, and would have been blind in CI, since the weekly file is gitignored per
  machine. If you would rather it were louder, that is a one-line change.
- **The recorded form of a ruling.** The appended block is your question, your answer as a quote,
  and the id. Read the first real one on the 15th and say if it loses something.

## What needs you

Nothing now. On 2026-09-15, after the first session, run the command above and tell me whether the
round trip actually held - that is the one thing tests cannot prove, and the backlog entry says so
rather than claiming the mechanism is finished.
