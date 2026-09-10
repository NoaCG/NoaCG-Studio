---
kind: agent
date: 2026-09-06
serves: now
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

A labelled dropdown in a wizard footer reads as a choice; that is the default, not a taste call.
The other two questions - the control absent rather than greyed with no brands, and the logo half
- are claims an agent drives.

It stays here until an agent drives the route below and records what it saw. Its original
text follows, unchanged; the re-kinding rules are in `docs/acceptance/OWNER_QUEUE.md`.

# Pick a brand when you make a graphic, and the logo lands in it

**Date:** 2026-09-06 · **Branch:** `claude/a-brand-model-chooser`

## What changed

The first half of `docs/BRAND_PLAN.md`: the wizard's footer checkbox "Colors & typeface from
this project" is gone, and a **Brand** chooser stands in its place, naming the brands you have
saved. Choosing one puts its accent, its typeface AND its logo into the graphic's own code.

- **The checkbox copied a look off a graphic nobody chose.** Every Create used to overwrite one
  anonymous record, and the checkbox offered that back. Create now writes nothing, and the
  chooser lists the brands you made on purpose, by name.
- **A brand can carry a logo.** Where the design has a place for one, the mark goes in it, even
  where the design's own default is logo-off. Where the design has no place for one, nothing is
  invented: no floating overlay, no grafted slot.
- **None takes back exactly what the brand put there** - and only that. A picture you imported
  yourself is never removed on a brand's way out.
- **A slot drawn for a PERSON or a PRODUCT is left alone.** The streamer card's round avatar and
  the music strap's cover artwork use the same machinery as a logo slot, and a brand never fills
  either - replacing a presenter with a channel mark is worse than showing no mark at all.
- **"Use for new" on Home is now a pointer, not a copy**, reads "Use for new graphics", and the
  brand it names wears a ★.

## The route (under a minute)

There is no brand CREATOR yet (that is the next row), so a brand still has to start from a
graphic:

1. `#/app` -> make any lower third, and in the Style step set a distinctive accent.
2. Home -> **Brand looks** -> name it and press **Save current look**.
3. Press **Use for new graphics** on that row. The ★ appears.
4. **+ New graphic** -> Templates -> Topic -> Hairline Card. The footer now says **Brand: None**.
5. Pick your brand from it. The preview beside you should take the accent and the typeface.
6. Switch it back to **None**. Everything the brand put there should come off.

## What to look at

- **Does the chooser read as "which brand" without a tooltip?** It is one word plus a dropdown in
  a footer that also carries Back and Next. If it reads as furniture rather than a choice, say so.
- **With no brands saved, the control should not be there at all** - not greyed. Open the wizard
  in a fresh browser profile and check that the footer has nothing where it used to have a
  checkbox.
- **The logo half is only visible with a brand that HAS a logo**, and today nothing in the UI can
  put one into a brand - the creator does that. A logo brand can be made from the console
  meanwhile; the e2e spec `e2e/wizard-brand.spec.ts` walks it end to end and is what stands behind
  the claim until the creator lands.

## What is NOT done

The Home brand creator (logo upload, colours, notes, live preview), the editor's "Apply brand…",
"Apply brand to all graphics" on a production, and the logo thumbnail on the Home rows. All are
the next row of `docs/BRAND_PLAN.md`.
