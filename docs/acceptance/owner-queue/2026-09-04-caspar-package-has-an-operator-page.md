---
kind: walk
date: 2026-09-04
because: scope
---
# A CasparCG export now carries an operator page

**Date:** 2026-09-04 · **Branch:** `claude/n-panel-pairs-with-import`

## What changed

Export a graphic as **CasparCG export** and the folder now has a `controlpanel.html` in it, with
every field and every button that graphic declares. It did not before: the CasparCG package wrote
four files and none of them was an operator page, so there was nothing to open when the playout
machine was not there.

This was filed last night as "the exported panel does not pair with an imported design". It is
not about imported designs. The same imported score board pairs immediately out of the **SPX
export**, and a catalog quiz fails a CasparCG package exactly the same way. The file was missing
from that one target, for every graphic, and had been all along.

A CasparCG server drives the graphic through your CasparCG client and needs none of this. The
panel is the fallback: one folder, one browser, no network, no rundown.

## The route, in under a minute

1. Make a graphic - the quickest is **Import graphic**, drop
   `docs/svg-samples/quiz-board.svg` on it, **Create project**.
2. **Export** in the dock → pick **CasparCG export** → **Validate & download**. Unzip it.
3. Serve the unzipped folder over any local web address (`npx serve`, `python -m http.server`, an
   SPX template server - anything http). Opening the files by double-clicking will NOT work, and
   the panel says so when you try.
4. Open the graphic's own `.html` in one tab and `controlpanel.html` in another, from that same
   address.

## What to look at

- **The panel's footer says `connected: …`, not "waiting for a graphic".** That line is the whole
  claim - it only appears when the graphic has actually answered.
- Press **▶ Play**, then the quiz's own buttons: **Select answer**, **Lock it in**, **Reveal
  choice**. Each one should change the board in the other tab.
- Buttons grey themselves: before Play, Select and Lock are dead; after Lock, Select is dead
  again, because the pick is final.
- Do the same with a score board (`e2e/fixtures/svg-corpus/illustrator-four-team-scoreboard.svg`,
  or draw one). **+1** and **−1** should move the figure on the artwork and the number in the
  panel's own box together, and **New game** should zero both.
- Then press **⟳ Take** after New game. The old score must not come back.

## Also worth a glance

`GETTING-ON-AIR.md` and `README.md` in the same folder now describe the panel and, more
importantly, the two places it cannot reach: files opened from disk, and a graphic loaded inside
CasparCG's or OBS's own browser engine. If either reads as though the panel works there, that is
the wrong promise and worth saying so.

## The judgement worth arguing with

The CasparCG package deliberately carries no localhost relay and no double-click launcher - the
playout host is the controller there, and the HTML overlay target is the flavour built for hosts
with no controller of their own. This change adds only the panel and the receiver that answers
it, not the relay. If what you actually want is a CasparCG package you can operate by
double-clicking one file, that is a different and larger change, and this walk is the moment to
say so.
