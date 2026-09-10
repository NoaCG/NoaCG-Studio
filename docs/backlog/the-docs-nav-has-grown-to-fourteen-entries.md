---
v: 2
source: derived
kind: finding
raised: 2026-09-10
state: unstarted
found: "the /docs left nav has grown from ten entries to fourteen in about three weeks, and two separate queue items were asking the owner to rule on individual entries rather than on the shape"
---
# The /docs nav has grown to fourteen entries, and nobody is applying the rule to it

**Filed:** 2026-09-10, during the owner-queue drain against the four reasons. **Source:** two queue
items - `2026-09-06-h-two-new-docs-guides.md`, which asked about it with a stale count of twelve,
and `2026-09-09-how-to-work-with-a-team.md`, which inherited the question with the right count.

## Why

The owner's rule already exists and is quoted in both items: *"only the most important information
on the left."* Applying his own rule is our work, so the question does not belong on his queue -
and it had reached his queue twice, once with a wrong number.

Asking about each new entry as it arrives is also the wrong shape. A nav that went from ten to
fourteen in three weeks is not a list with two questionable rows on it; it is a list that has
outgrown being flat. "Pictures, logos & Lottie" and "Which package do I want" are simply the two
most recent, not the two least deserving, and arguing about them one at a time keeps the total
climbing.

## What it would take

Read `docs.html`'s nav as a whole against the rule, then either group the guides under their
existing shelves so the top level stops growing, or merge the entries whose whole content is one
screen. The measurement worth having first is how many of the fourteen a reader actually reaches -
the page's own gates already assert the nav, so the change is cheap and the argument is what needs
doing. Whatever lands, the count belongs in one place so a third item cannot ask about it with a
third number.

## Evidence

**Fourteen entries, counted off `docs.html` itself on 2026-09-10**, up from ten on 2026-08-26 and
thirteen before "Working with other people" landed on 2026-09-09. The file is the count, so the
number re-derives from the nav markup rather than from any note about it. The owner's rule is his
2026-08-26 walk, *"only the most important information on the left"*, in `docs/OWNER_RULINGS.md`.

The two entries earlier notes wanted to argue about are "Pictures, logos & Lottie" and "Which
package do I want", both landed 2026-09-06 on branch `claude/h-docs-guides`. One owner-queue item
asked this question with a stale count of twelve and was corrected to point at the other; both were
resolved by this receipt on 2026-09-10.
