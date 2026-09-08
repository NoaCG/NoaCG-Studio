---
kind: walk-p
date: 2026-09-08
---
# Your own words print whole again, and a receipt that looks served says so out loud

Twelve of your quotes on the receipts shelf were printing cut off mid-sentence. The files were
right; the reader was wrong. It read a quote that ran over more than one line as if it stopped at
the end of the first one, kept the opening quote mark, and threw the rest away.

## The route, in under a minute

From any checkout:

    node scripts/owner-receipts.mjs

**What to look at.** Two things.

First, the quotes. Every `asked:` and `found:` now runs to its last word, wrapped and indented
instead of cut. The clearest one is `playout-lag-when-working-the-queue`, which used to stop at
"moving around the queue, and" and now carries the whole paragraph, including the part where you
say it is existential for the playout software. The same was happening to the `note:` line on
`advanced` receipts, which is the line that says what is STILL OPEN - so on
`the-text-step-breaks-when-you-play-with-it` and `are-the-big-contracts-still-worth-loading` the
half we had not finished was invisible while the half we had was on screen.

Second, the last section of the report:

    Unstarted receipts whose own words appear in a commit on main (1) - a WORD MATCH,
    not a verdict.

Today it names `the-mapping-step-should-explain-and-offer-to-do-it` and points at commit 6824d306
from 2026-09-06, which shipped hints under empty pickers, an unmatched-count notice and a Fill
button. The receipt still says `unstarted`. It may be most of the way served, and an evening plan
nearly scheduled it a second time.

## Why it only points, and never decides

It matches the receipt's own distinctive words against commit subjects. That is a fact about words
and not about work, so it never changes a receipt's state, never fails a build, and never says a
thing is done. Three lines of the report say so where anybody reading it will see them. A wrong
guess that read as fact would retire something you actually asked for, which is worse than no
check at all.

**Nothing here needs a decision from you.** The one flagged receipt is ours to settle, by reading
the commit and either closing the receipt or writing down what is still missing.
