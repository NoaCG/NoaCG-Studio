# 2026-09-10 - the owner's phone walk, an agent walk, and the gate that came out of both

Three branches landed: pull requests 231, 232 and 234. All contained in `origin/main`.

## What's next, best first

1. **Call `validateProjectFormat()`.** It exists in `src/model/projectFormat.ts`, returns
   `Unsupported project resolution 1920×1880.` for exactly the value the owner screenshotted on
   2026-08-29, and **has no callers anywhere in `src/`** (grepped 2026-09-10). Nothing checks a
   template's resolution against the format catalogue at load or at save. **Why now:** the
   2026-09-12 student production is a room full of people saving graphics, and today an
   unsupported format reaches the header, the resolution chip and a saved record in silence. Call
   it where a template is loaded and where one is saved. The receipt is
   `docs/backlog/editor-canvas-1920x1880.md`, now `advanced` with the trace on it. How the original
   template came to hold 1880 is still unexplained and probably unfindable - the owner does not
   remember which graphic - so do not wait for it.
2. **Rebuild the 25 September deck.** `docs/presentation-2026-09-25/NoaCG-2026-09-25.pptx` now
   contradicts the script on three slides, worst of all slide 5, which shows four playout targets
   and tells the room to point OBS at the output URL - the thing the owner cut that day. **Why:**
   it is gap-list row 13 and he has not opened it yet, so he would open it cold and find it wrong.
   Steps and the exact `make-deck.mjs` lines are in
   `docs/backlog/deck-contradicts-the-2026-09-10-calls.md`. The generator refuses to overwrite, by
   design; move the file aside rather than defeating that.
3. **Drain the pre-gate queue items against the four reasons.** Pull request 234 added a
   `because:` key that a `walk`/`walk-p` item must carry from 2026-09-11. It cannot touch the 78
   already filed. **Why:** the owner's whole complaint is the size of the list, and the gate only
   stops it growing. Judge each open item against `taste | scope | direction | money`; anything
   that cannot name one is not his - decide it, do it, and say in the item what was decided.
4. *(Optional)* **The landing-page copy pass**, `docs/backlog/public-copy-should-read-finnish-plain.md`.
   Shorter, no hype, and no countable number on any public surface. **Why:** he passed the page's
   honesty and failed its voice, and named one slogan for deletion.
5. *(Optional)* **State the window and filter beside the harness verdict's headline number.**
   `docs/metrics/2026-09-09-harness-verdict.md` opens with nine ledger tasks in 24 hours, seven
   ours; reading `C:/Users/ahonemi/.noacg/delegation-outcomes.jsonl` over the tables' own window
   gives five, four ours. **Why:** the conclusion is unaffected, so this is not a correction - it
   is that the number cannot be re-derived, and the document uses "nine" for two different
   quantities in two paragraphs.

## Known only from this chat

**The `because:` gate can over-correct, and the owner said so himself.** His closing words:

> it's okay that I need to check stuff every once in a while. I just don't want to have an 80-item
> list waiting for me. That's my main concern. I should check and you should demand my opinions on
> something but it has just been way too much, with too many technical questions that I know the AI
> can answer.

So the target is FEWER questions, not NO questions, and he expects to be asked. A session that
uses the four reasons as licence to stop asking has misread it. If a decision made under the gate
turns out to be one he wanted, that is a signal to move the line, not evidence the gate works.

**A real CasparCG has now aired the output URL** (from the parallel branch that landed mid-walk),
so demo beats A4 and A6 are proven on hardware - and the owner had already cut them from the day
hours earlier. The beats are proven and unused. Nobody has reconciled `docs/DEMO_2026-09-25.md`'s
A4 cell, which still reads UNSEEN (box), with
`docs/acceptance/owner-queue/2026-09-10-bh-a-real-casparcg-has-now-run-the-output-url.md`. That is
main disagreeing with itself, not a merge artefact, and it was left alone deliberately because it
belongs to the branch that measured it.

**Half the owner's phone list did not need him.** Three of eight items said so in their own text
and a fourth was a diff. Filed as `docs/backlog/owner-items-are-filed-at-the-wrong-kind.md`, which
proposes the gate that pull request 234 then built.

**The import items are correctly his.** They were sampled looking for agent-settleable work and
they ask things like which threshold to draw and whether a prefix reads `static:` - and the owner's
own answer was that two of those three were decidable after all. That is the worked example now in
`docs/acceptance/OWNER_QUEUE.md`.

## Blocked / blocking

Nothing blocks this line of work. Item 1 blocks nothing but is dated by the 12 September
production; item 2 is dated by the 25th.

## Files these branches touched

`docs/DEMO_2026-09-25.md`, `docs/GOALS.md`, `docs/acceptance/OWNER_QUEUE.md`,
`.agent-workflows/walk.md`, `scripts/check-owner-queue.mjs`,
`scripts/check-owner-queue.test.mjs`, `scripts/check-vendored-versions.mjs`,
`contracts/rules/root/file-walk-walk-item-only-naming.md` and its record, plus 9 backlog receipts
and 16 owner-queue items added, edited or deleted. About 40 files across the three branches.

## Bottom line

SAFE TO ARCHIVE WITH NOTES. Every branch is an ancestor of `origin/main`, all three worktrees are
clean, no stash holds anything, and the follow-ups are the five above.
