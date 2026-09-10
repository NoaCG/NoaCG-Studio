---
kind: agent
date: 2026-09-08
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

The item's own 'What I decided, and what I would undo it with' argues the trade whole, and the
three deliberate leftovers are filed on the shelf. What remains is the two-import sequence
behaving as described, which an agent drives.

It stays here until an agent drives the route below and records what it saw. Its original
text follows, unchanged; the re-kinding rules are in `docs/acceptance/OWNER_QUEUE.md`.

# Importing your artwork twice under one name keeps ONE graphic, not two you cannot tell apart

This is the sequence the class will walk: import your own graphic, build a production on it, go
back to your drawing tool, change something, export it again, import it again. You reuse the name,
because it is the same graphic.

Until today the second import made a SECOND library record under that name. Home then showed two
rows nobody could tell apart, and the production quietly moved its link to the new one - so the
graphic your cues were built on was no longer the graphic in your production. Edit the wrong of
the two rows afterwards, and your change never reaches air. I reproduced it tonight through all
four import doors before changing anything.

## The route, in under a minute

1. `/app` -> **Import graphic** -> drop any `.html` or SPX-style `.zip` template.
2. **Next** -> on Finish pick **＋ New production…**, name it `Class`, press **Add to the
   production - go live**, confirm. You land on the production with one cue.
3. Go back to `/app`, press **+ New graphic**, **Import graphic**, and drop a CHANGED version of
   the same file - same `<title>`, so the same name. Next -> pick `Class` -> press the door.

**What to look at.** Two screens.

First, the confirmation before you commit. It now says **"Replace it in this production?"** and,
in the list under it, **"Match Score is saved over the version in your library. Its data rows
stay."** Before today that line said "is saved to your library", which was not true - nothing was
saved over, a twin was minted. If your new version dropped a field the old one had, the same list
names it: *"Cue values for Home team no longer match a field in this version and are ignored on
air; new fields start from their defaults."* That is the one thing that can bite you on air, and
it used to be silent.

If you pick a DIFFERENT production instead of `Class`, the dialog still tells you about the
library half - the title becomes **"Save over Match Score and add it here?"**. The old dialog only
ever looked at the production, so that case said nothing at all.

Second, Home. **One** row called `Match Score`, not two. Open it and it is your new version. The
production still points at that same row, so the cue you prepared is still on the graphic you
prepared it for.

## What I decided, and what I would undo it with

A name you already used means that graphic. The production pool has always worked that way; the
library did not, and the disagreement was the bug. So a wizard save under a name your library
already holds writes over that record instead of minting a twin.

I did not make it ask every time. The door you press already confirms on every press, so the
sentence goes there and costs an extra click to nobody. If you meant a genuinely new graphic, the
dialog says so too: cancel and give it its own name in the field one line above the door.

Three things I deliberately left alone, so you can see them and rule differently. All three are
written up in `docs/backlog/two-doors-still-mint-a-twin-under-a-taken-name.md`:

- The plain **Save** dialog (Ctrl+S on an unsaved graphic) still mints a twin under a taken name,
  with no warning at all. Same defect, a door I did not reproduce tonight.
- The **kit / Pro package** save does too, and it pools straight into a production afterwards, so
  running the same kit into the same production twice reproduces the exact shape I fixed.
- A library that ALREADY holds twins from before today keeps them. The newest one wins from now
  on, so later saves converge on one record - the stale one stays until somebody deletes it. Home
  shows a date on each row, which is how you tell them apart. The one case where that tie-break
  can be wrong is a production pooling the OLDER twin; closing the two doors above removes it.
