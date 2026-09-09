# The 25 September 2026 deck

`NoaCG-2026-09-25.pptx` is the presentation for the session with students and Yle. Double-click
it. It opens, presents and edits in PowerPoint or LibreOffice, needs no network and no browser,
and its speaker notes name the beat, its status and the proving file for every slide.

The content of record is `docs/DEMO_2026-09-25.md`; the deck was built from its beats on
2026-09-09 and every slide sentence traces to that file's evidence column.

`make-deck.mjs` is the starting-point generator. It refuses to write over an existing deck, so a
hand edit always wins, and nothing in the repository lints or runs it; its header says why. This
file exists so that `docs/README.md` can point at the directory through a row the docs-index gate
covers: a row naming a `.pptx` is invisible to `scripts/check-docs-index.mjs`, a row naming this
`.md` is not.
