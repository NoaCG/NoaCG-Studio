---
kind: agent
date: 2026-09-24
serves: now
---
# Three small fixes found walking the closed old editor on noacg.studio

**Date:** 2026-09-24 · **Branch:** `claude/h-old-editor-live-walk`

## What changed

The live walk of "nobody reaches the old code editor" passed every clause. It found three small
defects next to that change, fixed here:

- **The control page's "Sign in to open this panel" and "Graphic not found" used the full page.**
  Before, they sat in a 190px column at the left edge, because they reused Home's two-column grid
  with no nav in it, so the heading wrapped over two lines and the rest of the page was empty.
  Every old `#/graphic/<id>` link lands on this page now.
- **The "Start from a template" card no longer says "Tweak the code it writes".** No door opens
  code any more, so the card ends after "choose your fields, style and animation".
- **Home's recent-graphics cards print the category name ("Lower third"), not its id
  ("lower-third")**, the same as the Graphics list.

## The route, under a minute

1. Open `https://noacg.studio/app#/graphic/anything` signed out. The sign-in message starts at
   the left of the page body with its heading on one line.
2. Open `https://noacg.studio/app#/new`. The first card's description is two sentences.
3. Make any graphic ("Start from a template", any design, "Skip to finish", "Add to the
   production and go live"), then press Home. The recent-graphics card reads "Lower third · date"
   or the category you picked.

## What to look at

That the sign-in message on the control page no longer looks broken, and that the template card
still reads well without its last sentence.
