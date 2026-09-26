---
kind: desktop
date: 2026-08-30
because: taste
serves: now
---
# A live vote on a board you drew: does it read right on air now?

You walked the live vote on your own artwork on 2026-09-03. Detection worked, the step's words did
not, and you found three bugs. The bugs are fixed and pinned by `e2e/import-svg-behaviour.spec.ts`
("imported vote board: a real audience round moves the bars the designer drew"). What is left is
the re-look you are owed.

## The route, about five minutes

/app, **Import graphic**, and drop `live-vote.svg` (download it from the Live vote section of the
docs). Finish into a new production. On its **Audience** tab type a question and three options,
**Open the vote**, press **Simulate votes** twice, then **Stage the counts**. Back on the rundown,
**Take** the vote cue and press **Close voting**, **Show result** and **Call the winner**.

**What to look at.** Two things only your eye settles: whether the bars travelling to their shares
on the data read right on air, and whether the Fields step's vote section now says something a
student follows with no training. The figures wait for **Show result** on purpose, because a poll
that shows its numbers while voting is open changes the vote it measures. Say so if you want them
live.

## Your words, 2026-09-03

> the whole import page right now is difficult to read. The info text is confusing. I don't know,
> everything. [...] Everything here is difficult to understand, and the information buttons don't
> really add that much help.

> this info is confusing, it needs to be shorter and just what it does. Should it explain anything
> extra? No one wants to read more than a few lines. It should be intuitive.

> the options are one field, so I need to write them on separate lines in the same input, and then
> it updates. That's not horrible. It's fine, but we have everything else on their own fields, so
> this could also be their own fields.

> The question is now how I can actually connect the percentages in the poll to real questions that
> I can give to the audience. A tutorial on how to do that would be nice, like a few sentences, and
> then it could be added to the docs.

The work these became is on the shelf: `docs/backlog/import-step-copy-a-kid-can-read.md`,
`docs/backlog/live-vote-fields-that-do-not-work.md`,
`docs/backlog/more-behaviours-than-poll-and-quiz.md` and
`docs/backlog/run-a-real-audience-vote.md`.
