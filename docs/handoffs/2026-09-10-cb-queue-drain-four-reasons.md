# 2026-09-10 - the owner queue, drained against the four reasons

Branch `claude/cb-queue-drain-four-reasons`. Pull request 234 added a `because:` key that a `walk`
or `walk-p` item must carry from 2026-09-11; it could not touch the 68 already filed. This row
judged those 68 one at a time.

## The two depth numbers

`ls docs/acceptance/owner-queue/ | wc -l` - **92 before, 82 after.** That number moves least,
because a re-kinded item stays in the directory.

**The number that is his list moves from 68 to 22.** Open `walk` and `walk-p` items - the two lists
`/walk` presents to him - went 68 -> 22: four on the phone in three places, eighteen at the computer
in six. `node scripts/check-owner-queue.mjs --routes` prints the grouping.

The rest: 36 items re-kinded to `agent`, which takes them off his lists and onto the one an agent
walks; 7 consolidated into an item that opens the same screen; 3 dropped with the decision that
replaced them. Every drop and every consolidation is logged in `docs/acceptance/OWNER_QUEUE.md`
under Dropped, which is the one place a file that left this directory unwalked is findable.

The full standing of the directory afterwards: **22 `walk`/`walk-p`, 3 `owner-action`, 41 `agent`,
4 `hardware`** - 70 open, plus 12 `done: true` records. **The agent list went from 5 to 41, and
that is the honest cost of this drain.** The contract is explicit that an agent item nobody reads
is worse than no item, because it looks handled - so those 41 are a row of work, not a note. Each
carries a route and the note saying which half of the test it met.

## The test that did the cutting, and where it is written down

It is in `docs/acceptance/OWNER_QUEUE.md` now, under "The test the 2026-09-10 drain used", so the
next drain does not re-derive it. In short: does answering it change the product (scope, direction,
money); or is there a shipped result on screen whose quality has no defensible general answer and
which no gate can assert (taste); otherwise it is not his.

**The whole thing turns on one word: DECIDED.** A question an item raises and then argues to a
conventional answer in its own text is decided, whoever wrote it. Eleven items ended with a
sentence shaped like *"say if you would rather…"* sitting directly under the paragraph that had
already settled the same question from ordinary practice. That sentence is politeness, not a
question, and reading it as one is how the queue reached 92.

**Two of the 68 are named by the contract itself** as its worked example of what is not his -
`static:` versus `d:` as a prefix, and which share of the artwork makes a layer a background plate.
Both were still sitting on his list a day after the example was written. Both are decided in their
items now.

## What is left for him, and why each one is

**Four on the phone.** The 25 September beats and their re-cut timing; the tutorial pack's script;
and two landing-page items - whether the page's voice is right after he failed it on 2026-09-10,
and the Create with AI card, which he turned into a product decision in the same walk.

**Eighteen at the computer**, and the honest shape of them is three groups. Nine open Import
graphic and are his own artwork behaving - the live vote, the stagger, the box binding on his
rotated quiz board, the OGraf renderer round, and three of the seven game-show boards where the
remaining question is a scope one (a clickable number grid, a two-key bracket recipe, batch import).
Four are about what the product IS or says in public. Five are single looks - the CasparCG operator
page, the password-reset page, the library's production pills, the credit roll's ending, the
type-aware size floor on a TV.

Ten of the twenty-two carry a decision written into them today, so his minute is spent on the half
that is his rather than on a question already answered underneath it.

## What was decided rather than asked, and what it cost

Sixteen questions were settled and written into the item that raised them, with the argument, so he
can overrule a thing that exists. Five needed code this row does not own and became backlog
receipts:

- `docs/backlog/a-centred-line-is-handed-its-own-width-as-room.md` - **the biggest one.** The room
  rule hands a line sitting on its box's middle exactly the width it already occupies (453, 701 and
  319 units against drawn widths of 453, 702 and 319), so a centred line never fills and goes
  straight to wrapping and then shrinking. It was offered to the owner as "a number and a taste
  call". A rule that returns its own input has computed nothing, and this is the likeliest surviving
  cause of his standing complaint, *"when I add a longer text it gets smaller"*.
- `docs/backlog/a-settled-roll-previews-a-frame-that-tells-designs-apart.md` - four credit-roll
  designs now preview the same logo over the same year.
- `docs/backlog/called-bingo-tiles-lose-their-numerals.md` - white on amber, on the tile a player
  scans for.
- `docs/backlog/install-lines-need-a-copy-control.md`
- `docs/backlog/the-docs-nav-has-grown-to-fourteen-entries.md` - two queue items were asking him to
  rule on individual nav entries; he already gave the rule.

Three more were decided inside items with no code to write: the vote's percentages wait for Show
result (a poll showing its numbers while open changes the vote it measures); the admin bypass on
the merge queue stays; and the compiled rule format is the house voice.

## Evidence and traps that exist in no repo file

**The measured failure mode held exactly as the row predicted, and it is now quantified.**
`gemini-3.7-flash-high` returned all 68 verdicts in well-formed blocks, every mechanical condition
met, and **the his/not-his call had to be changed on 14 of 68 - 9 of them saying NONE where the item
stayed his.** Its bias is one-directional and it is the dangerous direction: it reads an item that
argues its own reasoning well as settled, missing that the item is asking the owner to judge the
RESULT rather than the argument. It dropped the password-reset page (whose route only he can drive,
because only he has the mailbox) on the strength of a sentence about a redirect.

**The second pool is better at this and the gap is measurable.** On the same twelve items,
`claude-opus-4-6-thinking` got 9 of 12 against Gemini's 7, and it alone caught the two whose route
the owner alone can walk. It cost 85 s against 73 s and takes no `--effort` flag. **For a judgement
task on this repo's own contracts, run the head-to-head batch first and read the disagreements -
they were where the errors were, every time.** The scoring script is
`<scratchpad>/score.py`; the raw proposals are in the same folder and are not committed.

**The three-outcome shape matters more than the count.** Re-kinding to `agent` and deleting are
separate commits by rule, and this row made none of the delete commits. Anyone tempted to walk the
36 agent items and delete them in one pass is doing the thing the re-kinding rule exists to refuse.

**One citation could not be repointed and is covered instead.**
`docs/handoffs/2026-09-10-bj-published-path-lag.md` cites
`2026-09-10-bj-published-take-is-half-a-second.md`, which was folded into `bm`. A handoff is a dated
snapshot and rewriting one is worse than leaving it, so the Dropped log names it as the forwarding
address. The one live citation, in `docs/backlog/the-text-step-breaks-when-you-play-with-it.md`, was
repointed.

## Where I overruled both delegates, so it can be re-litigated

`2026-08-30-a-live-vote-on-your-own-artwork.md` was called NONE by both pools, on the grounds that
every thread it holds is filed elsewhere. It stays his. He gave verbatim feedback on that board on
2026-09-03, two of his three bugs have since been fixed, and he needs a poll for a real show this
autumn - the re-look is owed. If that is wrong, it is one item and the file says exactly what it is
waiting for.

## Anything that needs the owner

Nothing needs him to unblock anything. The 22 items are a to-do list, not a dependency, and the
`--routes` grouping puts them in nine trips rather than twenty-two.

**The one thing worth his eye about this row rather than about the product:** if any of the sixteen
decisions turns out to be one he wanted to make, the 2026-09-10 handoff's own words apply - *"that
is a signal to move the line, not evidence the gate works"*. Each decision names its argument in
the item, so overruling one costs him a sentence.

## Blocked / blocking

Nothing. The follow-ups are the five backlog receipts above, and the 36 agent items, which are a
row of work rather than a note - `/walk agent` walks them.

## Files this branch touched

75 files in one commit: `docs/acceptance/OWNER_QUEUE.md`; 68 under `docs/acceptance/owner-queue/`
(22 given a `because:`, 36 re-kinded to `agent`, 10 removed); 5 new receipts under `docs/backlog/`;
one repointed citation in `docs/backlog/the-text-step-breaks-when-you-play-with-it.md`; and this
handoff.

## Gates

`npm run build` green, read off its own exit code rather than a pipe's, run twice - once over the
edits and once over the committed tree, because a rewrap of the 36 re-kind blocks landed after the
first run. `npm run check:owner-queue` green at 82 items, 62 of the 63 open `walk`/`walk-p`/`agent`
items grouped into six places.
