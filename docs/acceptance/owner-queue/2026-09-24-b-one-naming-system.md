---
kind: phone
date: 2026-09-24
because: taste
serves: now
---
# The Graphics docs: one page per type, and layer names in 30 seconds

You asked for the "make a graphic" docs to be one topic, a page per graphic type, and for one
naming system every example and every agent follows. Both are built: each type page has its
example, a download link, a drawn Layers panel and the operator's buttons, and a five-line cheat
sheet opens the layer-names page. The build fails if an example file breaks the system
(`npm run check:example-layers`), and `scripts/docs-shots.mjs` fails if an example stops importing
as its type.

## The route, three minutes

<https://noacg.studio/docs#svg-layers-cheat>, then the **Scoreboard** and **Quiz** pages from the
left nav under Graphics.

**What to look at.** Whether a student could name their layers from the five bullets alone, and
whether a type page reads top to bottom without help. Every word in the cheat sheet is one edit in
`src/templates/behaviours/layer-names.json`, so say which word you would change.
