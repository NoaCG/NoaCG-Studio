---
v: 2
source: session
kind: finding
raised: 2026-09-10
state: unstarted
found: "three of the eight items on his phone list say, in their own text, that nothing in them needs a decision from him"
---
# Items reach the owner's list that say in their own words he is not needed

**Found:** 2026-09-10, walking the phone list with him.

## The measurement

Grepping the open queue for items whose own body says no decision is required returns three files,
and **all three are `kind: walk-p`** - his phone list:

- `2026-09-08-your-own-words-print-whole.md`: *"Nothing here needs a decision from you."*
- `2026-09-05-your-asks-and-our-bugs-are-two-lists.md`: same sentence.
- `2026-09-05-how-to-draw-a-live-vote-in-illustrator.md`: same sentence.

His phone list held eight items. Three of them declared themselves unnecessary in the body, which
makes the real list five. A fourth, `2026-09-07-main-no-longer-always-deploys.md`, was not marked
that way but its "what to look at" was a diff between two commits against a path list - settled
during the same walk by running the check rather than by asking him.

So half his list was either mechanical or self-declared unnecessary. His first words on opening it
were *"I'm very confused how we have 81. The number should get smaller at some point."*

## Why this is the expensive kind of mistake

`.agent-workflows/walk.md` already warns that **defaulting to `walk` is not the safe choice** and
that a deep queue stops being read at all. This is worse than a long list: an item that opens with
a route and closes with "nothing here needs a decision from you" spends his attention to tell him
it did not need it. It also hides the items that DO need him, which on the same walk were real -
five product calls about the 25 September session, an address, a landing-page verdict and a build
budget.

Two of the three are not even fully wrong. Each ends with one genuine sentence-sized question for
him buried under a mechanical body. That is the actual shape: a `kind: agent` item that an agent
settles, plus a one-line `walk-p` for the judgement, filed as one `walk-p`.

## What would fix it, roughly in order of cheapness

1. **A gate.** `npm run check:owner-queue` already refuses a `walk`, `walk-p` or `agent` item with
   no route section. It could equally refuse a `walk` or `walk-p` whose body asserts that no
   decision is needed - the phrase is searchable and the three files above prove the pattern is
   literal, not paraphrased. That catches the honest version of this mistake, where the filing
   session knew and said so.
2. **Split at filing time.** Where a body is mechanical and only its last paragraph is his, the
   filing session writes two files: the `agent` item with the check, and the `walk-p` carrying only
   the question. The queue is one file per item precisely so this is cheap.
3. **A walk that settles rather than presents.** A session running `/walk` should run the
   mechanical half of any item it can before putting the item in front of him. That happened twice
   by hand on 2026-09-10 and both times it removed the item from his list entirely.

The first is a gate and belongs in `scripts/check-owner-queue.mjs`. The second is a rule and, if it
is worth binding, goes through `npm run learn` rather than into a doc.
