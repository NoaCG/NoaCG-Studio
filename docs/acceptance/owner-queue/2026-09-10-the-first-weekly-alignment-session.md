---
kind: walk
date: 2026-09-10
serves: now
---
# Everything the first weekly alignment session on 2026-09-15 has to settle

Four separate items were waiting for the same Tuesday, each opening the same command and each
asking you to judge something that does not exist until the session has run once. They are now one
item, consolidated on 2026-09-10 during an agent walk of the computer list. Nothing was dropped:
every question below is quoted from the item it came from, and git holds the originals.

## The route, under a minute - and NOT before 2026-09-15

```bash
npm run alignment:pending
```

Before Tuesday it prints "no weekly owner session file - nothing to record", which is all it can
say and is not worth your time. After the session it lists your questions, your answers, and the
exact block a session appends to `docs/OWNER_RULINGS.md`.

## What to look at, after the first run

1. **Does the recorded form of a ruling lose anything?** The appended block is your question, your
   answer as a quote, and the id. Read the first real one and say whether it survives whole. Two of
   the four consolidated items existed only to ask this.
2. **Does Part A read like directions or like a task list?** It is written for you, not for a
   session. If the first run reads like a sprint board, the format is wrong.
3. **The three-question cap, and the test each question has to pass.** That is the line between a
   check that respects your ruling and a questionnaire that reinstates the gate you removed. It is
   a guess, and it is the thing most likely to be wrong.
4. **Is the refusal in the right place?** It is on the wave plan, not on `npm run build`. A build
   gate would have blocked every unrelated branch on this laptop over a ruling that belongs to the
   orchestrator, and would have been blind in CI, since the weekly file is gitignored per machine.
   If you would rather it were louder, that is a one-line change.

## One decision that is genuinely yours, and it is not about the mechanism

From `2026-09-05-one-binding-for-any-svg-behaviour.md`, which routed itself here:

> Phases 0-2 generalize what already ships and close four filed defects; they are current work and
> start without you. **Phase 3 onwards adds capability under programme P2**, which by the register
> enters implementation on evidence plus your ruling. The plan proposes that the phase-2 paper pass
> (the eight challenge graphics walked against the vocabulary) is that evidence. Say at the weekly
> alignment whether that is enough, or whether it waits for the round-2 proxy protocol in
> `docs/BEHAVIOUR_AUTHORING_RESEARCH.md` §6.

Read `docs/SVG_BEHAVIOUR_PLAN.md` §0, then §9, then §12 before answering. Its §3c proposes two
prefixes and no more, `show:` and `choice:` - a taste line as much as a design one, because
designers will draw against it.

## Why this is one item and not four

Because it is one sitting. Four items each opening `npm run alignment:pending` on the same morning
is four trips through the same command for one session's worth of judgement - the same arithmetic
that turned the walk into places rather than items. It also stopped four rows reading as open work
all week when not one of them could be walked before Tuesday.
