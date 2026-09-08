---
kind: walk
date: 2026-09-05
serves: now
---
# Four controls that did nothing, and one that lied about what it was doing

Your nit from the outlined-text walk, taken as the principle it had earned: "it would be nice if
we wouldn't offer things that don't do anything". The one you pointed at is fixed, and a sweep of
the whole wizard found three more of the same shape. All four were reproduced in the running
product before being touched, and all four re-checked after.

**Route, under a minute:** `/app` -> **Import graphic** -> drop
`e2e/fixtures/svg-corpus/figma-outline-text-title-card.svg` -> **Next** -> **Next**.

## What to look at

1. **The Animation step no longer offers "Layer stagger" on this file.** That card promises "the
   design's layers rise into place one after another". This file is a Figma frame export: every
   shape sits in one unnamed group, so there are no layers to stagger, and the graphic used to
   come out with a plain fade. Six motion cards remain, and each one does what it says.
2. **Drop `docs/svg-samples/scorebug.svg` instead and the card is back**, because that artwork has
   named layers. Pick it and watch them arrive one after another. That is the test that the fix
   hides the dead case rather than the feature.
3. **Pick any lower third -> Style -> Typeface -> Apply to.** Choose **Label**, then a face from
   the list, and the kicker changes while the headline keeps its own. Until now that pick was
   silently dropped: the dropdown moved, the picker showed the face, the graphic never changed.
   The list of roles is also read off the design now, so a graphic with no numeric or body face
   is not asked about one.
4. **A scoreboard or a versus card no longer offers "Reveal in steps".** Those graphics enter
   whole - their own code says so - and ticking the box wrote a setting nothing read. It is still
   there on lower thirds, info cards, corner bugs, alerts and public-info graphics, where it works.
5. **The video walk no longer offers "Colors & typeface from this project".** A video project has
   no palette and no typeface to give it to. Same for a dropped template file (applied exactly as
   its author wrote it) and a blank graphic.

## Judgement I made that is yours to overrule

**Hidden, not greyed out.** Your file said a greyed control still asks to be understood, and I
agree with it here: in every one of these five cases something that DOES work sits right beside
the thing that vanished - six motion cards, four typeface roles, the rest of the footer. There is
nothing to teach and nothing lost. The one place a sentence might have been worth it is the layer
stagger, where "export with your layers named and this becomes available" is real advice for a
designer - but that advice belongs on the import door, next to the re-export advice already
there, not on a greyed card two steps later.

## What is not done

The typeface panel's **🔎 Find a typeface**, **⬆ Upload** and **💻 Installed** roads still ignore
"Apply to" and change every face in the graphic. That is a wrong answer rather than a missing one,
and it needs the font's bytes to travel with the role, so it is filed rather than rushed:
`docs/backlog/typeface-search-ignores-apply-to.md`.

Branch `claude/i-offer-nothing-dead`, landed as `e6bdabce` and `8b5a8706`. Build green; the e2e
run was recorded in that session's handoff, drained on 2026-09-08.
