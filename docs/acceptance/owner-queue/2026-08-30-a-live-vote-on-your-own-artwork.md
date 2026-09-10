---
kind: walk
date: 2026-08-30
because: taste
serves: now
---
# A LIVE AUDIENCE VOTE, on a poll board you drew yourself

You said you need a poll for a real show this autumn. Until now a poll only worked on a board WE
drew: the audience plane has been counting votes since Phase 6, and there was nowhere on somebody
else's artwork to put the counts. That join now exists.

**Route (about 10 minutes):**
1. `/app` -> New graphic -> **Import graphic**, and drop a vote board. Either draw one, or use
   `e2e/fixtures/svg-corpus/illustrator-live-vote-band.svg` (a wide band: a question, three option
   rows, a full-length bar per row, a percentage each, a VOTE NOW badge, three hidden winner
   arrows).
2. On the **Fields** step open **What it does**. It should already say "a live vote: open, close,
   result" with every picker filled from the layer names. Change one and change it back, so you
   can see the pickers are the road and the names are only a shortcut.
3. Finish into a NEW production. On the production page the cue's buttons are **Close voting**,
   **Show result**, **Call the winner**.
4. Open the production's **Audience** tab, type a question and three options, **Open the vote**,
   then press **Simulate votes** twice, then **Stage the counts**.
5. Back on the rundown, select the `Vote — …` cue and **Take** it. Then press Close voting, Show
   result, Call the winner.

**What to look at:**
- **The bars.** They move on the DATA, not on a button: the counts land and the bars travel to
  their shares. Whether that reads right on air, and whether the timing (0.9s, staggered 0.12s,
  the catalog vote board's own numbers) is what you want on a graphic somebody else designed.
- **The figures wait for Show result.** That matches the catalog board, and it is a one-line
  change if you want the percentages running live while the vote is open. This is the decision
  I would most like your answer on.
- **The Fields step's vote section.** Whether a student reads "Bar", "Figure", "Winner" and knows
  which of their layers each one means, with no training.
- **The layers the vote takes over.** Picking a layer as the question, an option or a figure stops
  it being a field the operator types into, and the step says so. Whether that sentence lands.

**What is NOT done, so you are not surprised:**
- The hosted road is not walked. This is offline end to end; the real `/output` renderer following
  a command log is the quiz pilot's walk repeated for the vote, and nobody has repeated it.
- One vote per graphic. A round with more options than the board has rows counts them all and
  shows what it drew.
- There is no "Open vote" button, deliberately: taking the cue IS opening the vote, and the
  catalog board's automatic 20-second window is filtered out here, because a real audience votes
  over minutes and an arrow nobody drew must not close the vote under the operator.

Reasoning and the third-behaviour finding: `docs/GRAPHIC_BEHAVIOUR_PLAN.md` section 12.

## Owner walk, 2026-09-03 - detection works, the step's words do not, and three real bugs

He imported `illustrator-live-vote-band.svg`. **The behaviour detection passed:** *"Everything
looks good. It knows that it's a livevote."* Everything below is what happened next, verbatim.

### The words on the step, with a screenshot

> the whole import page right now is difficult to read. The info text is confusing. I don't know,
> everything. [...] Everything here is difficult to understand, and the information buttons don't
> really add that much help. We need to do an /unslop for this too, so it would read so a kid could
> understand what's happening.

> There's something that needs to be done so it's more clear what it actually does, and it should
> be just very simple and tested. It's clear for everyone what it does, and it works exactly as it
> claims it should work.

> The "What it does" info box is also confusing.

> this info is confusing, it needs to be shorter and just what it does. Should it explain anything
> extra? No one wants to read more than a few lines. It should be intuitive.

Screenshot supplied: the WHEN THE TEXT IS TOO LONG block, its "WHAT ELSE MOVES" panel and the ⓘ
buttons. Filed as `docs/backlog/import-step-copy-a-kid-can-read.md`.

### How does it know, and how would a designer make one

> How does it know it's a livevote? Quite interesting. How do you make it in Illustrator so it
> understands it's a livevote? Anyway, this is confusing for me

Answered in chat and filed for the docs: it reads layer names (`Bar 1`, `Bar 2`, `Percent 1`,
`Winner 1`, `Question`, `Total`, `Badge` / `Vote now`), needs at least two rows carrying bars, and
tests the quiz signature first. Nothing in the docs says so.

### Three bugs

1. **A too-long badge value destroys the graphic, permanently.** *"I like it that it warns me that
   a badge text is too long. That was a nice touch, but when I made it even longer and updated it,
   the whole badge disappeared. Now I made the badge text shorter, and it doesn't reappear, so I
   broke the graphic now. Yeah, I guess I should re-import it or something to get it back to
   work."* The warning is good and stays; hiding a layer and never restoring it is the defect.
2. **The percentage fields will not take typing.** *"the other text boxes don't react when I write
   something different, so nothing happens with the text. [...] I can't change the percentages
   either. [...] I can select them fine. It shows on the preview that it's selected, so I know
   which one is which, but I can't change the text."* The question and the option rows DO accept
   text, so it is specific to the percentages.
3. **The badge shrinks before it needs to and jumps.** *"First, it worked fine, and then I added a
   new letter, and then it shrank it down, and it doesn't fill the whole shape. It could. [...] It
   can randomly jump from normal size to small and back again."* Same family as the fit-ladder
   findings on the quiz board.

### One shape question, and one thing he liked

> the options are one field, so I need to write them on separate lines in the same input, and then
> it updates. That's not horrible. It's fine, but we have everything else on their own fields, so
> this could also be their own fields.

> This is something that you can also just brute-force test: do these fields work or not?

### What he wants next on this road

> The question is now how I can actually connect the percentages in the poll to real questions that
> I can give to the audience. A tutorial on how to do that would be nice, like a few sentences, and
> then it could be added to the docs. You could try it out until it works for sure, at the same
> time as we fix other bugs here.

> I know that we only have a poll and quiz right now, but we need to add more. That needs to be on
> the to-do list. Of course, we need to get this logic figured out so you can do them automatically
> and not have me check every single board. We just need to follow how other programs do them.

**The item stays open.** Rows filed: `import-step-copy-a-kid-can-read.md`,
`live-vote-fields-that-do-not-work.md`, `more-behaviours-than-poll-and-quiz.md`,
`run-a-real-audience-vote.md`.

## Where this item stands, 2026-09-10

Two of your three bugs are fixed and measured, in
`2026-09-05-the-badge-fills-its-pill.md`: the badge now holds the size you drew it until the pill is
genuinely full (`PLEASE VOTE NOW` at 20.5 px where it aired at 12.1 px squeezed), and the dead
boxes on the percentage rows are gone, replaced by a row that says which layer it is and that the
vote fills it. The third - the badge that shrank early and jumped - was fixed the night before by
the fit ladder and could not be reproduced after.

**Decided rather than asked: the figures wait for Show result.** This item called that *"the
decision I would most like your answer on"*, and it has a defensible general answer. A poll that
shows its percentages while voting is open changes the vote it is measuring, which is why broadcast
polls hold the numbers until the vote closes. It also matches the catalogue vote board, so a
student moving between the two boards meets one behaviour. If you want them running live it is
still the one-line change the item describes.

Your four other threads from the 2026-09-03 walk are filed and are not this item:
`import-step-copy-a-kid-can-read.md`, `live-vote-fields-that-do-not-work.md`,
`more-behaviours-than-poll-and-quiz.md`, `run-a-real-audience-vote.md`.

**What keeps this open is the re-look you are owed**, on the board you imported yourself: whether
the bars travelling on the data reads right on air, and whether the Fields step's vote section now
says something a student follows with no training.
