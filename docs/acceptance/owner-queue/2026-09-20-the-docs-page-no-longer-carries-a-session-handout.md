---
kind: walk
date: 2026-09-20
because: direction
serves: now
---
# The public docs page no longer carries a dated session handout

You asked on 2026-09-20 for every trace of your own teaching out of NoaCG and off GitHub. The
public docs page carried two sections written for one room on one date: a student index with a
take-home brief that told a group to email finished files in, and a running order naming who
drives each beat and for how long. Both are gone, with the print rules that made each one a
sheet and the specs that pinned them.

The same pass removed the session script and the slide deck from the repository, and took the
date, the audience it named, the school domain and every reference to the people you teach out of
the goals, the rulings, the backlog and the code comments. The product's own words for who it
serves - a student or non-technical operator - are untouched, because that is who the product is
for rather than who you teach.

## The route, under a minute

1. Open `https://noacg.studio/docs` and scroll to the bottom. The last section is the CLI
   reference; there is nothing after it.
2. Try the two old addresses, `#session-student` and `#session-owner`. Nothing is selected and
   the page reads normally.
3. Press Ctrl+P anywhere on the page. It prints as it reads, all of it, with no nav column.

## What to look at

- **Whether the page ends well.** The CLI reference is now the last thing a reader meets. It was
  written as a middle section, not a closer, and you may want something after it.
- **Whether anything you wanted kept went with it.** The deck, the script and the two handouts
  are on this machine at `C:\claude\noacg-teaching-local\`, unchanged, outside every checkout.
  `session-indexes-from-docs-page.html` there is the two sections exactly as they were.

## What this does not do

Git history still holds every removed file. Deleting them from the current tree stops anyone
reading the site or browsing the repository from finding them; it does not stop someone digging
through old commits. Rewriting the published history is a separate decision and it is yours.
