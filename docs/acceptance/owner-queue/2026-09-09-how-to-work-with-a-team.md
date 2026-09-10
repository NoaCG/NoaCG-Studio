---
kind: walk
date: 2026-09-09
because: direction
serves: now
answered: false
---
# Teams has written instructions now, and they say which half of it does not work yet

**Date:** 2026-09-09 · **Branch:** `claude/ak-teams-instructions`

## What changed

You asked for this on 2026-09-03: "we need to add it to our instructions. There should be
instructions on how to do it as well." `/docs` has a new section, **Working with other people**,
under Run the show. It covers making a team, getting somebody into it, who can do what, whose
storage it counts against, and what will happen to a production when it moves into a team.

**The thing to judge is the honesty, not the prose.** Walking the feature first turned up that the
guide cannot say what you asked it to say, because the product cannot do it yet. Moving a
production into a team is stage 4 of the plan and has not shipped, so the `Move to team` button is
present and switched off. A guide that walked a reader up to that button and stopped would be a
worse page than none. So the section leads with the road that DOES work today, which is that
operating one show from three devices needs no accounts at all, only the links the production page
already mints. The team half is written as what it is: the group, ready for the production that
will go into it.

Your second sentence was read as binding, not as flattery: "it should be so intuitive that you can
just use it without reading anything." Nine places where the screen made me guess are listed in
`docs/backlog/the-team-dialog-makes-you-guess-nine-times.md`, filed as screen work rather than
answered with more prose here. Three of them are worth your eye:

- **The join code is the biggest thing on the team screen, and it is the half that does not work.**
  Nothing in the app takes a typed code. The only way in is the link underneath it, in small grey
  type. That is the same wall you hit on 2026-09-04.
- **A member who joins a class team has no way back to it.** Both doors into the team dialog hang
  off a production you own, so a student with no production of their own cannot see their team at
  all.
- **The code cannot be read out loud.** It is eight mixed-case characters, this run's was
  `V3f3j023`, and the dialog's own text tells you to read it out.

## The route, under a minute

1. `/docs#teams`, or the left nav under **Run the show**, "Working with other people".
2. Read the amber **What works today** box in the middle. That is the sentence the whole section
   turns on.
3. Then the table above it, "Who can do what". Six rows, all of them true today.

## What to look at

- **Whether a half-built feature belongs on the public page at all.** This is your call, not mine.
  The argument for it: every signed-in user already sees the disabled button and the dialog, so the
  page is only saying out loud what the screen is already admitting. The argument against: `/docs`
  is public and indexed. Say the word and the section comes off until stage 4 lands.
- **The nav.** Fourteen entries, confirmed against `docs.html` on 2026-09-10, up from thirteen.
  This is now the ONLY place the nav-length question is asked; `2026-09-06-h-two-new-docs-guides.md`
  used to ask it too, with a stale count of twelve, and points here instead. The entries earlier
  items wanted to argue about are "Pictures, logos & Lottie" and "Which package do I want". Your
  standing rule is "only the most
  important information on the left".
- **"What will happen when a production moves in".** Five bullets of design that you cannot try
  yet. It is labelled as design. If you would rather the page carried nothing it cannot demonstrate,
  that sub-head is the one to cut.

## Not seen by anyone yet

The team surfaces themselves WERE walked, by `e2e/configured/teams.spec.ts` against the real
backend and real accounts, and the five screenshots it took are what the nine findings were read
off. The `/docs` page itself is verified by `e2e/docs.spec.ts` and by the build, but no human has
looked at the new section rendered.

## Decided 2026-09-10 - the nav question is ours, not yours

This item inherited the `/docs` nav-length question from
`2026-09-06-h-two-new-docs-guides.md`, with the corrected count of fourteen. It goes back where it
came from: you already gave the rule - *"only the most important information on the left"* - and
applying your own rule to a list of fourteen entries is our work, not a second ruling. A nav that
has grown from ten to fourteen in three weeks needs grouping or nesting rather than a verdict on
each new entry, and "Pictures, logos & Lottie" and "Which package do I want" are not the two to
argue about; they are simply the two most recent.

Filed as `docs/backlog/the-docs-nav-has-grown-to-fourteen-entries.md`.

What is left is the call the item correctly says is yours and not ours: whether a half-built feature
belongs on a public, indexed page at all.
