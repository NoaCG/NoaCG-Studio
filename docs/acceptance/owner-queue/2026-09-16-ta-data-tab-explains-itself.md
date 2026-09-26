---
kind: desktop
date: 2026-09-16
because: taste
---
# Production data, bindings and tables: do they make sense now?

On 2026-09-15 you opened a production's Data tab and could not tell what "Bind all by title" does,
why a second press changed nothing, or how the boxes work. The tab now has a "How this tab works"
drawer, one line saying what the button does, rows that line up, and plain words; a bound field
reads out instead of taking typing, and a ± on it moves the shared value on every graphic bound to
it. The docs gained one worked example show with photographs of the real product. One value moving
every bound graphic, and one save per edit, are pinned by `e2e/production-data.spec.ts`.

## The route, about three minutes

/app, make two lower thirds from the templates and add both to one production. Open its **Data**
tab, add `match.home.name` = `Finland` and `match.away.name` = `Sweden`, open "How this tab works"
once, then press **Bind all by title** twice. Then read "One show, worked through" in the docs,
under Run the show.

**What to look at.** You were the one who was confused, so you are the test: does the tab now say
what it is for, and does the worked example make the difference between production data and a
table land? If a sentence needs a second read, that is the finding.
