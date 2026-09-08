# Nothing counts a receipt whose work already landed, so a planner steers by a drifting number

**Filed:** 2026-09-08. **Source:** measurement - a sweep of every `state: unstarted` receipt on
2026-09-08.

## Why
`state: advanced` exists because a receipt with real work landed against it counted as `unstarted`
beside a genuinely untouched one, and the one number a planner steers by was drifting in the
direction that manufactures work. The word was added; nothing counts it. Advancing a receipt
depends on the session that served it remembering to, and that session is the only one that ever
knows.

Measured today: 51 receipts said `unstarted`, and 6 of them were wrong. Five had landed work and no
note (`more-behaviours-than-poll-and-quiz`, `graphics-need-their-own-logic`,
`wave-leftovers-2026-08-27`, `open-threads-from-the-memory-cull`, and
`a-counting-graphic-airs-a-zero`, whose premise the owner's own walk had refuted). The sixth,
`the-mapping-step-should-explain-and-offer-to-do-it`, had three of its four asks served by
`cddb75be` two days earlier, and today's wave nearly planned it a second time. Twelve percent wrong
after four days is the argument for counting it; a human pass costs about an hour and is due again
the moment it finishes.

## What it would take
Not a refusal, and not a `touches:` diff - most receipts carry no `touches:`, and the ones that do
name a directory broad enough that any commit in it would flag them. Two cheaper shapes, either of
which beats a yearly sweep:

1. **A report, not a gate.** `owner-receipts.mjs` already reads `raised:`. Have it print, under the
   standing asks, any `unstarted` receipt older than N days whose slug words appear in a commit
   subject since `raised:` - the same probe a human uses. It would have caught at least the mapping
   step, `more-behaviours` and `graphics-need-their-own-logic`, whose landings all name their
   subject in the message.
2. **Ask at the landing.** `/queue-merge` already asks about a receipt naming this branch in
   `branch:`. The gap is the receipt nobody marked `active`. Ask the queueing session one question
   instead: which receipt does this branch serve, if any. It is one line, at the only moment
   somebody knows the answer.

Shape 2 is the mechanism; shape 1 catches what shape 2 misses and is worth having anyway, because a
report that is sometimes wrong is fine and a gate that is sometimes wrong is not.

## Evidence
The six corrections landed on `claude/d-drain-handoffs`, 2026-09-08, each with the commit that
justified it in its own `note:`. The `advanced` state and its reason are in
`docs/backlog/README.md`, "The states"; the landing-time question is
`node scripts/owner-receipts.mjs --serves <branch>`.
