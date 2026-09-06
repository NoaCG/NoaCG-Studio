---
kind: walk
date: 2026-09-06
serves: now
answered: false
---
# Your own coding agent comes first on the AI door

**Date:** 2026-09-06 · **Branch:** `claude/i-steer-to-the-cli`

## What changed

"Create with AI" now tells a visitor, before any tier and before any key field, that if they
have Claude Code or Codex they already own the better and cheaper road to the graphic - your
ruling of 2026-08-26, re-confirmed 2026-09-03 ("That is the preferred way of using AI with
NoaCG"). Three surfaces, one message:

- **The AI step** opens with the testing caution, then a bordered card tagged *Preferred*: one
  line, "Have Claude Code or Codex? Your own agent is the best way to make graphics with NoaCG,
  and you already pay for it." *Show me* unfolds what the agent does, what it needs (their
  subscription and a terminal), the two Claude Code install lines as a block you can select with
  one click, the Codex pair, a link to the docs page's paste-one-prompt, and a line for people
  with no agent so the tiers do not read as second best.
- **⚙ AI settings** leads with the same steer, above Lite / Pro / Bring your own key, with a
  *Show me* that opens the card and scrolls to it.
- **Bring your own key**'s description ends "If you have Claude Code or Codex, you do not need
  this."

Nothing runs in the studio; the hosted tiers are reached in the same clicks as before.

## The route (under a minute)

1. Open `/app`. On the front page click **Create with AI**.
2. Under the "Still in testing" line: the *Preferred* card. Click **Show me ›**.
3. Scroll to the brief and click **⚙ AI settings**: the steer is the first line of the sheet;
   pick **Bring your own key** and read its description.
4. On a self-hosted or Lite-off build the sheet and the card are both open on arrival, because
   that is the build where the key field is on screen at once.

## What to look at

- Does the card read as *the better road you already own*, not as "go away and use something
  else"? The receipt named that as the hard half, and no gate can judge it.
- Is one amber (the *Preferred* tag) enough, or does the card want the same weight as the tiers?
- The two install lines: the block selects whole on one click. Is that enough, or does it want
  a Copy button?
- Not done tonight, deliberately: the Entry card's hint (its three-line height reserve) and the
  `/docs` page ordering (`docs.html` was landed tonight by another row). Both are recorded as
  open on `docs/backlog/byo-key-and-create-with-ai-guidance.md`.
