# The Pro harness exemplar card has never been measured against a model, and the round that ran cannot settle it

**Filed:** 2026-09-09, carried out of `docs/handoffs/2026-09-06-b-pro-harness-exemplars.md` during
the handoff drain. **Source:** the row's own statement of what its work does not prove.

## Why

The exemplar card spends about 270 tokens of every Pro request telling the model what the catalog's
measured numbers actually are. It landed on 2026-09-06 and the paid round of `docs/PRO_HARNESS_PLAN.md`
§10 ran the same day at $1.44 over the bank. That round is the closest thing to a verdict the card
has, and it cannot be one.

Of the bank's 21 briefs, **18 get a card** - lower-third, scoreboard, quiz-board, ticker, countdown,
podium-score - and the three `stat-panel` briefs get none, because the bank maps no graphic type for
them. The three uncarded briefs are also a different kind of graphic, so the comparison is
uncontrolled in two ways at once. Read as a hint it is fine. Read as the card's verdict it is
wrong, and the plan's item 3 currently says the paid round "is the first thing that will say
whether the card earns its ~270 tokens", which overstates what a run of it can say.

Tokens spent on every request forever, against evidence that cannot separate the card from the
graphic type, is exactly the kind of cost that survives because nobody ever priced it.

## What it would take

The same bank twice, with the card forced off in the second pass. That is a one-line change to
`firstMessage` and one more run of a bank that already costs about $1.44. Matched briefs, matched
types, one variable.

If the answer is that the card changes nothing, 270 tokens per request come back. If it changes a
lot, the plan gets a measured reason to spend them, and the seam for the category half
(`exemplarForCategory` / `exemplarCardFor({ typeId, category })`, already written and tested, called
by nothing) has a reason to be wired.

## Evidence

- `docs/PRO_HARNESS_PLAN.md` §3.4 "Exemplar measurements (`harness/exemplars.ts`)", lines 137-186,
  marked BUILT 2026-09-06; and `:455-457` item 3, the claim this file narrows.
- `docs/PRO_HARNESS_PLAN.md:430-441` and `docs/AI_ATTEMPTS.md` - the round that ran, $1.44 over the
  bank and $1.97 including the two abandoned attempts, resumable at 2 of 21.
- `src/ai/pro/harness/exemplars.ts`, `scripts/pro-harness-exemplars.test.mjs`.
- Landed as `c2829edd`.
