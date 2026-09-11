# The 25 September 2026 deck

`NoaCG-2026-09-25.pptx` is the presentation for the session with students and Yle. Double-click
it. It opens, presents and edits in PowerPoint or LibreOffice, needs no network and no browser,
and its speaker notes name the beat, its status and the proving file for every slide.

The content of record is `docs/DEMO_2026-09-25.md`; the deck was built from its beats on
2026-09-09 and every slide sentence traces to that file's evidence column. It was rebuilt from the
generator on 2026-09-10, when three of the owner's calls that day made slides 4, 6 and 7 wrong:
air now ends at our own hosted player (slide 6), the small-group take-home is on the road 1 slide
(slide 4), and the close names both one-page indexes (slide 7). The rebuild moved the previous
deck out of the way first rather than getting round the refusal below, and nobody had hand-edited
it, so nothing was lost.

To check a slide without PowerPoint, render it with LibreOffice. Its PNG export writes only the
first slide of a file, so make a copy of the deck that holds just the one slide (edit
`ppt/presentation.xml`'s `<p:sldIdLst>` down to the one `<p:sldId>`), then run
`soffice --headless --convert-to png` on that copy. That is how the 2026-09-10 rebuild was
checked. The generator's own size estimates were wrong by a line on three panels, and only the
render showed it.

`make-deck.mjs` is the starting-point generator. It refuses to write over an existing deck, so a
hand edit always wins, and nothing in the repository lints or runs it; its header says why. This
file exists so that `docs/README.md` can point at the directory through a row the docs-index gate
covers: a row naming a `.pptx` is invisible to `scripts/check-docs-index.mjs`, a row naming this
`.md` is not.
