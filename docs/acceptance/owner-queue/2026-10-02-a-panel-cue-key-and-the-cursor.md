---
kind: decision
date: 2026-10-02
serves: now
---
# Should a Stream Deck cue key move the page's selection?

A Companion preset key for one cue (the `take-cue` verb) puts that cue on air, or takes it off when
it is already up. The two operator pages now do one thing differently:

- **Production page** (new): the key airs the cue and leaves the selection where the operator put
  it. SPACE still takes whatever was selected before.
- **Hosted control page** (since #632): the key also selects the cue it aired, so SPACE then acts on
  that cue (usually: takes it off).

Leaving the selection alone is the safer choice mid-show: a colleague's deck key cannot change what
your next SPACE does. Selecting it means the page's highlight always follows what was last fired,
which some operators expect from H2R and SPX.

**Which do you want, on both pages?** Answer "leave the selection" or "select the cue". Either is a
one-line change in each page's `onVerb`, plus one line in each page's configured spec.
