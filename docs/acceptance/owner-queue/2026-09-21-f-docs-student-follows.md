---
kind: walk
because: taste
date: 2026-09-21
serves: now
---

# The Graphics docs, read cold and rebuilt in Illustrator, plus two lower-third examples

## What changed

The public Graphics docs were read the way a student reads them, then both demo graphics were
drawn in Adobe Illustrator 2026 from the docs text alone and pushed through the real exporter.
Three sentences were wrong and one thing was missing:

- **Illustrator's Export As leaves every hidden layer out of the file.** Measured on Illustrator
  30.1 today: a quiz with twelve hidden moment groups and a hidden Full time layer exported with
  none of them, and the wizard still picked Quiz from the answers alone, so a student would get
  NoaCG's default highlights and never learn their own drawings were dropped. The legacy
  `File > Save a Copy > SVG` keeps them as a `display:none` class, which the importer already
  reads. The docs now teach Save a Copy with its five settings, and say plainly what Export As
  does.
- **Use Artboards.** Without it the export is cut down to the drawing (a 1600x250 file for a
  lower third), which the wizard treats as a floating object. The docs now say to tick it.
- **Name the text object, or put it alone in a layer.** Four unnamed texts inside a layer called
  Answers arrive as "Answers", "Answers 2" and so on, and no type is found. The docs say so.
- **The import walk's last step** no longer mentions "Create project"; it names Skip to finish,
  which is what the default studio shows after PR #354.

Two new example files, drawn in Illustrator and saved with the settings the docs teach:
`public/docs/examples/quiz-lower-third.svg` and `scoreboard-lower-third.svg`. Each type page
links it under the full-frame example (the picture follows once the shot job has run, see the
handoff), and the Layer names page now
has a line of download links for every example so a student can open one in Illustrator and copy
the layer structure. Opening `quiz.svg` and `scoreboard.svg` in Illustrator was measured too: the
Layers panel shows `Answer D`, `static:Letter D`, `A selected (hidden)` and the rest, and a
Save a Copy of that file imports as the same type with every layer bound.

## Route in under a minute

`/docs#svg-export` for the Illustrator settings row. `/docs#svg-layers` for the naming rules and
the download line. `/docs#quiz` and `/docs#scoreboards` for the lower-third pictures and links.
Then `/app#/new` -> Import graphic, drop `quiz-lower-third.svg`: the Fields step says Quiz with
every answer's selected, correct and wrong layer filled in.

## What to look at

- Do you want the lower-third files to replace the full-frame ones as THE example on each type
  page, or stay beside them as they are now? Both are one link each.
- The Illustrator row now teaches Save a Copy rather than Export As. `docs/SVG_AUTHORING.md`
  section 6 still says Export As and was not changed on this row; it is the internal page.
- The lower thirds use Arial in Illustrator on this laptop; the shipped files carry Archivo and
  Inter in its place, and the file comment says so.
