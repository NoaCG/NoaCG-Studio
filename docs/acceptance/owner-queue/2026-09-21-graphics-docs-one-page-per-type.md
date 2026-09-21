---
kind: walk
date: 2026-09-21
because: direction
serves: now
---
# The Graphics docs have one page per graphic type

You asked for the "make a graphic" part of the docs to be one topic: how to import an SVG, then a
page for each type, with the layer names in bullets and a picture of a working file and its layers.
It is built that way now.

## The route, under a minute

<https://noacg.studio/docs>. In the left nav under **Make a graphic**, **Graphics** now has
indented links: Import an SVG, Prepare the file, Layer names, then the types Scoreboard, Quiz,
Live vote, Countdown, End credits and Ticker. Click **Scoreboard** (`/docs#scoreboards`). From
`claude/noacg-graphics-docs-c6f0d7`.

## What to look at

- **One type page, top to bottom.** The example graphic as it renders, a download link for its
  SVG, a drawn Layers panel beside the list of layer names, the buttons the operator gets, and a
  screenshot of the wizard picking the type after the drop.
- **The Layers panel.** It is drawn in HTML to look like Illustrator's, top of the stack first.
  Amber names are the ones NoaCG reads, and hidden layers have a crossed-out eye. Say if it should
  look more like a real Illustrator panel.
- **Layer names** (`/docs#svg-layers`). The rules the wizard uses to find layers, in six bullets.
- **Download an example and drop it in the studio.** Each of the six files in
  `/docs/examples/` imports as its type with no picking by hand. `scripts/docs-shots.mjs` fails if
  the wizard stops picking the type a file promises.
- **What was removed.** The step-by-step walk shrank to six numbered steps, and the text about
  who the product is for is gone. The old guide for making a graphic with the catalog designs
  (Goal A buttons, the quiz's sealed lock) is gone too, except the text format for credits and
  tickers, which now sits under "A scrolling roll" and "A crawl".

Also fixed on the way: an unticked row in the Fields step used to squeeze its boxes to "Dire" and
"DIF" with the labels running into each other. It now shows only the layer name and
"stays as drawn".

The 2026-09-09 item about "Your first graphic, step by step" points at a nav entry that no
longer exists. The same content is now under **Import an SVG**.
