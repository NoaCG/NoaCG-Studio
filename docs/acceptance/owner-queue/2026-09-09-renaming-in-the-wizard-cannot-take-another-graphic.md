---
kind: walk
date: 2026-09-09
---
# Renaming a graphic in the wizard can no longer take another graphic with it

Yesterday's fix made a wizard save under a name your library already holds write OVER that
record instead of minting a twin. That is right for the sequence it was built for: you come back
with a second version of your own artwork and reuse the name.

It reached further than that. It resolved the name for EVERY save, including one made by a walk
that had already saved a graphic under a different name. Rename mid-walk and the save went
looking for whatever graphic already carried the new name and wrote today's artwork into it. If
that name belonged to something you made last week, last week's artwork was gone. There is no
undo in the library and no history, so it was gone for good. I reproduced it in the running app
before changing anything: the record's fields went from `zz` to `f0`, which is the whole of it.

## The route, in under a minute

1. `/app` -> **Import graphic** -> drop any `.html` template. **Next** -> on Finish name it
   `Away Team`, pick **＋ New production…**, call it `Class`, press the production door, confirm.
   You land on the production. That is last week's graphic.
2. Back to `/app` -> **+ New graphic** -> **Import graphic** -> drop a DIFFERENT template.
   **Next** -> name it `Sponsor` -> press **Export it**, then close the export window. You are
   back on Finish with a graphic saved.
3. Now change the name field to `Away Team` and read the screen before pressing anything.

**What to look at.** The line under the name field, and then Home.

The line now says: *"A different graphic in your library is already called **Away Team**.
Finishing leaves its artwork alone and renames the one you just saved to match, so two graphics
share the name. Change the name above to keep them apart."* Before today it said your library
already had that graphic and finishing would save over it, which was true and was the problem.
Both doors under it say the same thing in their own words, and the production door's
confirmation adds the one fact only it causes: a rundown that already holds that name points at
this graphic afterwards, not at the other one.

Press **Export it** anyway and go to Home. Your `Away Team` from step 1 is untouched, still with
its own artwork, and your production still points at it. The graphic you made in step 2 is the
one that moved: it is now called `Away Team` too, and there is no leftover `Sponsor` row. Rename
either row on Home if you want them apart.

## What I decided, and what I would undo it with

The record a Finish door writes to is the one THIS WALK made, whenever it still exists, whatever
the name field now says. Only a walk that has saved nothing resolves its name against the
library, which is the case yesterday's rule was written for.

That is a deliberate trade and it is the one thing to rule differently on if you disagree: it can
leave two graphics sharing a name, which yesterday's fix set out to prevent. I took it because
the two costs are not the same size. Two rows under one name is untidy and one rename on Home
puts it right. Somebody else's artwork written over is work nobody gets back, three days before a
class where students share machines and reuse obvious names. Home's own rename has always let you
put two graphics under one name with no warning at all, so the tidier state was never enforced
anywhere but this one door.

Closing the wizard with the ✕ still ends the walk, so the next graphic you build is its own
record even under a name you used a minute ago. That was already true and is still pinned.

## Two smaller things on the same screen

- **The warning used to go stale.** The Finish step read your library once, when the step opened.
  A graphic that appeared afterwards - another tab, or the door you just pressed - was invisible
  to it, so the step said nothing while the save wrote over that graphic anyway. It now re-reads
  on every change, the same way Home does.
- **It now names what an overwrite strands.** When you do save over a graphic your library
  already holds and your version has no field for something the old one had, the line says which:
  *"Cue values for Home team no longer match a field in this version and are ignored on air."*
  The production door's confirmation has said that since yesterday; the name field, which is the
  only thing the Export door shows you, did not.

Reproduced, fixed and pinned in `e2e/import-name-collision.spec.ts` (two new cases, both failing
before the change). The deliberate twin cell is written up in
`docs/backlog/two-doors-still-mint-a-twin-under-a-taken-name.md` so it is not "fixed" back by
somebody reading yesterday's rule on its own.
