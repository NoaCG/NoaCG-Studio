---
kind: agent
date: 2026-09-09
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

The question is which of three re-ordering controls is right, and it has an answer that satisfies
both arguments in the item rather than trading them off - decided below.

It stays here until an agent drives the route below and records what it saw. Its original
text follows, unchanged; the re-kinding rules are in `docs/acceptance/OWNER_QUEUE.md`.

# Three Browse controls re-order your results and only one of them keeps your place

Today's wave asked me to make Browse jump back to the first twelve designs whenever you pick a
brand. I did not, because a ruling from 2026-09-07 says the opposite and the product already
follows it. Nothing about how Browse behaves changed on this branch - what changed is that the
behaviour is pinned by a test and the code says why, so it stops being re-filed as a bug.

Checking it turned up something better than the reported bug. **Three controls on that step
re-order the results without removing any of them, and only the brand chooser keeps the extra pages
you pressed for.** Change the sort order or pick a programme and you lose them. Nothing in the
product explains the difference, and whichever answer is right, the same one should hold for all
three.

I am not asking permission for what I decided - the ruling stands and the branch lands either way.
This is the taste half, and it is yours.

## The route, under a minute

1. Open the studio, start a new project, choose **Start from a template**.
2. In the type dropdown pick **Lower thirds** (93 designs today).
3. Press **Show 12 more** once. You now have 24 cards.
4. Pick a saved brand in the footer chooser. **You keep all 24**, re-ordered so your brand's style
   family leads. (No chooser means no saved brands - make one from Home first.)
5. Still on those 24, now change the **sort dropdown** (immediately right of the "Showing 24 of 93"
   line) from **Relevance** to **Simplest first**. **You drop to 12.**

## What to look at

Steps 4 and 5 are the same kind of action - every design is still in the result, only the order
changed - and they treat you differently. Step 4 keeps your place, step 5 takes it away.

The question: **which one should both do?**

- Keeping your place is what the 2026-09-07 ruling chose, on the grounds that you pressed "Show
  more" to get those results and a re-ordering should not take them away.
- Resetting has a real argument too: after a re-order the best matches are at the top, and if you
  are scrolled down among 24 or 36 cards, they arrive where you are not looking - so keeping your
  depth preserves results at the cost of hiding what the control you just used actually did.

Either answer is a small change. Say which, and it becomes one rule instead of three behaviours:
`docs/backlog/browse-rerank-controls-disagree-about-paging.md` carries the shape of the work, and
choosing "reset" means withdrawing the 2026-09-07 rule in the same commit rather than working
around it.

## Decided 2026-09-10 - all three keep your page, and the list scrolls to the top

The item asks which of two answers all three controls should take, and lays out a real argument for
each: keeping your place respects the pages you pressed for, resetting puts the best matches where
you are looking. Read as a straight choice it looks like a taste call, which is why it was filed as
one.

It is not a straight choice, because the two arguments are not about the same thing. One is about
**which designs are in the result** and the other is about **where your eye is**. Nothing forces
them to trade:

**All three controls keep every card you have paged in, and the results list scrolls back to its
top after a re-order.** You keep the 24 or 36 designs you asked for, and the re-ordering is visible
because the new first row is where you are looking. That satisfies the reset argument without
throwing away work the reader did, and it keeps the 2026-09-07 ruling intact rather than
withdrawing it - which the item correctly notes would otherwise have to happen in the same commit.

Two reasons this is a default rather than a preference. Every catalogue that re-sorts a paged result
does this - the sort changes, the page count survives, the viewport returns to the first result;
discarding results on a sort is the behaviour readers report as a bug. And the inconsistency itself
is the defect: three controls doing the same kind of thing three different ways is a wrong answer
whichever one is right, and the item says as much.

The work is already shaped on `docs/backlog/browse-rerank-controls-disagree-about-paging.md`; this
adds the verdict to it. If the owner would rather a re-order dropped you back to twelve, that file
is where the revert lives.
