---
kind: walk
date: 2026-09-09
serves: now
---
# The /docs guide that walks an SVG all the way to air

The docs page had a guide to the SVG file and a guide to each kind of graphic, but nothing that
took a reader from a file they drew to a graphic an operator puts on air. It has one now.

## The route, under a minute

<https://noacg.studio/docs>, then in the left nav under **Make a graphic** click
**Your first graphic, step by step** - the second entry, between Graphics and Import your own SVG
graphic. The direct address is `/docs#first-graphic`. From `claude/d-import-road-guide`.

**What to look at.**

The guide is the road you asked for on the 25th: a file a student drew, and a graphic an operator
takes to air. It is one screen of reading and it points everywhere else rather than repeating it.

Four things are worth checking against your own sense of what a first-timer needs:

- **The table at the top.** Five steps, and one line each saying what that step asks. That is the
  whole shape of the wizard on one screen.
- **"Set the canvas before you drop the file".** The format row locks once artwork is in, so a
  vertical graphic has to be decided first. This is the sentence a student would otherwise pay for
  by starting over.
- **"Fields is where the graphic is decided".** The step that turns a drawing into something an
  operator can drive, group by group, including the fact that the too-long-text control names your
  own layer back to you.
- **"Take it to air".** Preview against program, Take, and the one that catches people: a typed
  change stays off air until Update, and the panel says so.

The guide was written by walking the road with an SVG drawn for the walk, not from the plan
documents, because the steps those documents named are not the steps the wizard has. Every quoted
string in it was read off a running build.

## Also on this branch

- The `/docs` shelf's guide list is finished, so its backlog file is deleted the way landed work is.
  Your 2026-09-03 ask for Teams instructions was sharing that receipt and is **not** done, so it
  now has its own file: `docs/backlog/teams-needs-written-instructions.md`.
- The three moments where the wizard needed a sentence of documentation to be usable were filed
  with repros, and have since been fixed on the screen itself: see
  `docs/acceptance/owner-queue/2026-09-09-m-wizard-says-it-itself.md` for the route to all three.
  That list is what your own standard asks for: anything the guide has to explain is a candidate
  defect in the screen.
