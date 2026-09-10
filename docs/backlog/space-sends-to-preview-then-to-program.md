---
v: 2
source: owner
kind: ask
raised: 2026-09-10
state: unstarted
asked: "I think we need to have a checkbox for this so the operator can choose for themselves. One is that you press Space and it goes to the preview and then you press Space again and it goes to program. That would mean that when you go up and down the queue list, nothing gets automatically put into the preview. If the graphic that you have chosen is selected in the queue list and it's in the program, then when you press space again, it disappears from the program and is just in the preview. It works like a cut button on a mixer."
---
# A checkbox for two Space/queue behaviours: auto-preview-on-scroll, or Space-to-preview-then-Space-to-program

**Filed:** 2026-09-10. **Source:** owner, weekly alignment session, answering
`docs/OWNER_RULINGS.md` §ALIGN-2026-09-10-3 (two dashboard questions open since early August:
whether pressing Take a second time is how the next row goes on air, and whether Space should send
a graphic to preview first).

## Why

Both dashboard questions had sat open since early August because only the owner could close them.
He closed them this session by asking for a choice rather than a single behaviour: a checkbox lets
the operator pick the queue/preview model that matches how they work, rather than the product
picking one for everyone.

## What it would take

A checkbox setting with two modes, in his own words:

**Mode A - Space-to-preview-then-Space-to-program (the new one, a "cut button on a mixer").**
Moving up and down the queue list does not automatically put anything into preview. Pressing Space
on the graphic selected in the queue list sends it to preview; pressing Space again sends it from
preview to program. If the graphic that is currently in program is the one selected in the queue
list, pressing Space again takes it out of program and leaves it in preview only.

**Mode B - the current behaviour.** Everything is automatically shown in preview as you scroll the
queue list. Pressing Space sends the previewed graphic live (to program). Pressing Space again
takes it out; if something else is in preview and on a different layer, graphics stack; on the same
layer, the new one replaces the old one.

The file's job is to hold the ask, not to spec the feature further - the exact checkbox label,
where it lives in settings, and edge cases (multi-layer interaction, keyboard focus) are for the
session that builds this to work out against the existing queue/preview/program code.

## Evidence

Owner, 2026-09-10, quoted verbatim in the front matter and above. Full exchange, including the
question that prompted it, in `docs/OWNER_RULINGS.md` §ALIGN-2026-09-10-3.
