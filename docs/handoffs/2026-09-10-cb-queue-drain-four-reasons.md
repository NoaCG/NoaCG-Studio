# 2026-09-10 - the owner queue, drained against the four reasons

Branch `claude/cb-queue-drain-four-reasons`. Pull request 234 added a `because:` key that a `walk`
or `walk-p` item must carry from 2026-09-11; it could not touch the 68 already filed. This row
judged those 68 one at a time.

## The two depth numbers

`ls docs/acceptance/owner-queue/ | wc -l` - **92 before, 83 after.** That number moves least,
because a re-kinded item stays in the directory.

**The number that is his list moves from 68 to 23.** Open `walk` and `walk-p` items - the two lists
`/walk` presents to him - went 68 -> 23: four on the phone in three places, nineteen at the computer
in six. `node scripts/check-owner-queue.mjs --routes` prints the grouping and is where both numbers
come from.

The rest: 35 items re-kinded to `agent`, which takes them off his lists and onto the one an agent
walks; 7 consolidated into an item that opens the same screen; 2 dropped with the decision that
replaced them. Every drop and every consolidation is logged in `docs/acceptance/OWNER_QUEUE.md`
under Dropped, which is the one place a file that left this directory unwalked is findable.

The full standing of the directory afterwards: **23 `walk`/`walk-p`, 3 `owner-action`, 41 `agent`,
4 `hardware`** - 71 open, plus 12 `done: true` records. **The agent list went from 5 to 41, and
that is the honest cost of this drain.** The contract is explicit that an agent item nobody reads
is worse than no item, because it looks handled - so those 41 are a row of work, not a note. Each
carries a route and the note saying which half of the test it met.

## The test that did the cutting, and where it is written down

The test itself is in `docs/acceptance/OWNER_QUEUE.md`, under "The test the 2026-09-10 drain used",
so the next drain reads it rather than re-deriving it. Read it there; it is not repeated here.

What is worth carrying in a handoff is what the contract cannot say about itself. **The test turns
on one word - DECIDED - and the reason it needs a section at all is that the queue's own items are
written in a voice that hides the distinction.** Well over a dozen of the 68 ended with a sentence
shaped like *"say if you would rather…"* sitting directly under the paragraph that had already
settled the same question from ordinary practice. Filing sessions write that sentence out of good
manners. Reading it as a question is how a directory of 92 files came to put 68 items on his two
lists, and no gate can catch it, because the item is well written either way.

**Two of the 68 are named by the contract itself** as its worked example of what is not his -
`static:` versus `d:` as a prefix, and which share of the artwork makes a layer a background plate.
Both were still sitting on his list a day after that example was written, which is the measure of
how little a paragraph in a contract does on its own.

## What is left for him, and why each one is

**Four on the phone.** The 25 September beats and their re-cut timing; the tutorial pack's script;
and two landing-page items - whether the page's voice is right after he failed it on 2026-09-10,
and the Create with AI card, which he turned into a product decision in the same walk.

**Nineteen at the computer**, in the six places the gate itself groups them into - read them off
`--routes` rather than off any narrative here, which is what the first draft of this handoff got
wrong by counting one item twice and dropping another:

- **Import graphic, 10** (8 serve NOW) - his own artwork behaving. The live vote, the stagger, the
  box binding on his rotated quiz board, the growth road on the lower third he reported broken
  three times, the OGraf renderer round, the CasparCG operator page, and three of the seven
  game-show boards where what is left is a scope call - a clickable number grid, a two-key bracket
  recipe, batch import.
- **The studio, 5** (3 NOW) - the credit roll's ending, the AI card's steer, the library's
  production pills, the type-aware size floor on a TV, and the password-reset page.
- **The docs site, 1** - whether a half-built feature belongs on a public indexed page.
- **A checkout, 1** - the weekly alignment session's own format, plus the P2 gate ruling.
- **The public site, 1** - the footer's source link and the licence wording.
- **On its own, 1** - the 25 September deck, which absorbed the slide-4 item.

Eleven of the twenty-three carry a decision written into them today, so his minute is spent on the
half that is his rather than on a question already answered underneath it.

## What was decided rather than asked, and what it cost

Every question the drain settled is written into the item that raised it, with the argument, so he
can overrule a thing that exists rather than adjudicate one that does not. Five needed code this row
does not own and became backlog receipts:

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

75 files across three commits: `docs/acceptance/OWNER_QUEUE.md`; 67 under
`docs/acceptance/owner-queue/` (58 modified - 22 of them gaining a `because:`, 35 re-kinded to
`agent` - and 9 removed); 5 new receipts under `docs/backlog/`; one corrected citation in
`docs/backlog/the-text-step-breaks-when-you-play-with-it.md`; and this handoff. Twenty-three items
carry a `because:` in the end, because `2026-09-10-bs-tutorial-pack-for-the-import-road.md` already
had one and this branch never touched it.

## Gates

`npm run build` green, read off its own exit code rather than a pipe's, run twice - once over the
edits and once over the committed tree, because a rewrap of the re-kind blocks landed after the
first run. 1592 tests, `# fail 0`. `npm run check:owner-queue` green at 83 items, 63 of the 64 open
`walk`/`walk-p`/`agent` items grouped into six places. **CI on the pushed branch: completed
success**, run 34526795581.

## What the review caught, because it is the more useful half of this handoff

`/check`'s review leg came back with ten findings on a documentation-only change, and every one of
them was real. Three are worth carrying forward:

1. **`docs/backlog/README.md` forbids exactly the citation shape all five new receipts used.**
   "Never cite a file that is designed to disappear" - an item on the shelf outlives
   `docs/acceptance/owner-queue/`, which is emptied on purpose. Every receipt pointed at a queue
   item for its facts, and one pointed at three items this same change re-kinded to `agent`, so its
   whole Evidence section would have dangled the first time `/walk agent` ran. All five now state
   the fact and cite the durable thing. **The lesson is procedural: I read that README's shape
   section and not its rules, on a change that wrote five files into that folder.**
2. **Three consolidations folded a `walk` item into an item the same commit re-kinded to `agent`.**
   That satisfies the separate-commits condition by the letter and strains it in substance, because
   there is no commit in which the conversion is reviewable before the absorbed files are gone. The
   worst case was reversed - `bt` is a `walk` again - and the other two are named in the Dropped log
   rather than left implicit.
3. **A drop is the only outcome nobody can recover from his list, so a split argument is not enough
   for one.** `2026-09-07-pull-request-descriptions-for-people.md` was dropped on an argument that
   answered one of its three questions. It is back, as `agent`.

The other seven were arithmetic and record-keeping in this handoff and the Dropped log, all
corrected: a consolidated file missing from the log, `answered: true` stripped from an item that had
earned it, a retracted count left standing, a files-touched breakdown that did not add up, and a
summary of his desk list that counted one item twice and dropped another. That last one matters
most of the small ones - it is the paragraph he would read to see what is left for him, and it is
now taken straight from `--routes` rather than narrated.
