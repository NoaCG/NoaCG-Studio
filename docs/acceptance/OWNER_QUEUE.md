# Owner queue

The owner queue holds the few things where the owner's own judgment adds something no agent or
gate can: a decision only he can make, or a look at shipped work where product judgment matters.
Everything an agent can meaningfully verify, it verifies, and it is never filed here
(`.agent-workflows/verify.md`, step 5). Aim for at most a few new items a day.

Each item is its own file in [`owner-queue/`](owner-queue/), named `<date>-<slug>.md`. `/walk`
(`$walk` in Codex) goes through them with him. `npm run check:owner-queue` checks every item's keys
on each build. No open item is a real answer: nothing is waiting on him.

## Why one file per item

Several sessions file items at the same time. Edits to one shared list land at the same offset and
conflict, and a conflict strands a landing. Separate files cannot collide. Priority (`serves: now`)
lives in each item's front matter for the same reason, never in a ranked list here.

## Which kind does an item get

First ask whether it belongs here at all. If an agent can settle it by driving the product,
running a check or reading the output, the agent does that and files nothing. Then pick the kind
by what he has to do:

| `kind:` | When | Example |
|---|---|---|
| `decision` | Something only he can decide: direction, scope, money, or an account, identity or harness refusal only he can clear. | "Should a rundown also hold video clips, or stay graphics-only this phase?" |
| `phone` | A quick look he can take from his phone and answer in a sentence: a public page, a hosted link, a screenshot. | "The landing page's new headline: does it sound like us?" |
| `desktop` | A desktop or production check where product judgment matters: he drives the product, a production or real playout. | "Run the quiz kit through a rehearsal in `/app`: would an operator trust it on air?" |

Prefer `phone` over `desktop` whenever the look fits on a phone. If you cannot say why his
judgment matters, the item is not his.

## What never reaches him

### A TECHNICAL problem is never his

A failing build, a branch that will not land, a stuck queue, a bad worktree, a CI or GitHub
problem, a dependency to upgrade, a command to run: an agent solves each one, including the ones
nobody has solved yet. Not knowing how is a reason to research it or ask another agent. An action
is his only for one of four reasons, named in `needs:`:

- `account`: credentials or a console we do not hold.
- `money`: a significant or unusual cost. Routine releases and trivial costs are not his.
- `identity`: he must speak or sign as himself or as the organisation.
- `harness`: the agent harness refuses it by design, and the item names the refusal.

### A design default is NOT a taste question

If a question has a defensible general answer (what broadcast graphics conventionally do, what a
designer or most users would expect), it is a default, not taste.

In both cases the agent decides it, does it, and says in the item or the commit what it decided
and why, so he can overrule something that exists. Never wait on him either: an item is a to-do,
not a dependency, and other work carries on around it.

## The shape of an item

```markdown
---
kind: desktop
date: 2026-09-27
because: taste
serves: now
---
# A short title a non-technical reader follows

What changed, in one sentence.

## The route, under a minute

/app, then Browse, then open the Quiz Show kit.

**What to look at.** The one thing his judgment decides, not a feature summary. Then the commit or
branch it came from.
```

The front matter holds one `key: value` per line and no comments.

- `kind:` required. From 2026-09-27 (`KINDS_V2_REQUIRED_FROM`) it is `decision`, `phone` or
  `desktop`.
- `date:` required, `YYYY-MM-DD`, the day it was filed. It sets the order and which dated rules
  apply.
- `because:` only on `phone` and `desktop`: `taste`, `scope`, `direction` or `money`. Optional on
  new items, required on legacy `walk` and `walk-p` items dated from 2026-09-11.
- `needs:` only on `decision`: `account`, `money`, `identity` or `harness`. Optional on new items,
  required on legacy `owner-action` items dated from 2026-09-05.
- `serves: now` optional: the work serves an outcome marked now in `docs/GOALS.md`. It is set when
  the item is filed and read as written, never re-derived. `now` is the only value.
- `answered: true` optional: his feedback is in the item and later work answers it, so his re-look
  sorts ahead.
- `done: true` a settled record kept on purpose. It is never presented and needs no route.

**The route is a section.** An open `phone` or `desktop` item (or legacy `walk`, `walk-p` or
`agent` item) dated from 2026-09-10 fails the build without one. It starts at a heading that
opens with "Route" or "The route" (`## The route, under a minute`) or at a
`**Route, under a minute.**` line, and it ends at the next heading or at a line starting with
"What" (`**What to look at.**`). Open it with the place: `/app`, `/docs`,
`<https://noacg.studio>`, a github.com link or the command. `/walk` groups items by the place their
route opens (`placeOf` in `scripts/check-owner-queue.mjs`). A new place is fine and lands under "On
their own". A `decision` item needs no route.

## Old kinds

Items filed before 2026-09-27 may carry an old kind. They stay valid and are read as the new ones,
so nobody rewrites them. The build refuses an old kind on an item dated from 2026-09-27.

| Old kind | Read as |
|---|---|
| `walk-p` | `phone` |
| `walk` | `desktop` |
| `hardware` | `desktop`, but shown only as a count unless asked for |
| `owner-action` | `decision` |
| `agent` | nothing: it is not his. An agent drives the route, checks the claim and deletes the item. |

## The order he sees them in

`node scripts/check-owner-queue.mjs --routes` prints the lists in this order, and `/walk` never
re-sorts them by eye:

1. **From your phone**: `phone` and `walk-p`, grouped by place.
2. **At the computer**: `desktop` and `walk`, grouped by place (`hardware` is left out).
3. **Only you can decide these**: `decision` and `owner-action`, one flat list showing `needs:`.

It ends with the count of open legacy `agent` and `hardware` items. Inside a list or a place the
order is `serves: now` first, then `answered: true`, then newest `date:`, then file name. Places
holding a `serves: now` item come first, then the biggest, and "On their own" is always last.
`done: true` items are never shown. `--routes <kind>` shows one kind in either vocabulary, and a
new kind also collects the old kinds read as it.

## How an item leaves

- **He says it is checked or OK**: delete the file at once, unless he names a follow-up. Never keep
  an item open because he has not reproduced every environment himself.
- **He gives feedback**: write it into the item word for word and turn it into work, a fix now or a
  `docs/backlog/` item. The item stays until that work lands. If the fix needs his eyes again, mark
  it `answered: true`; if an agent can verify the fix, the agent verifies it and deletes the item.
- **Not now**: leave it. Nothing expires for age.
- **It turns out not to be his** (technical, a design default, or agent-checkable): an agent
  settles it, says in the commit what it decided or saw, and deletes the item. Whether shipped work
  is any good stays his, however easy the route.
- **A legacy `agent` item**: an agent drives the route itself and deletes the item. The commit says
  what it checked and what it saw.

Git is the archive. `git log --diff-filter=D -- docs/acceptance/owner-queue/` finds any deleted
item.
