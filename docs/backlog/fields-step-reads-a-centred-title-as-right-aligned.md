---
v: 2
source: derived
kind: finding
raised: 2026-09-25
state: unstarted
found: "the SVG Fields step says the classroom show intro's centred Title is aligned right, while on air the same Title stays centred at every length"
serves: NOW
size: small
touches: src/components/wizard/import/MapSvgFieldsStep.tsx, src/templates/importedDesign/svg.ts
covered-by: e2e/import-svg.spec.ts
needs-owner: none
---

# The Fields step reads a centred title as right-aligned

`docs/tutorials/classroom-package/SVG/show-intro.svg` draws "QUIZ NIGHT" centred in the yellow
`Title box` (Illustrator writes no `text-anchor`, only the position). On https://noacg.studio at
commit 60b3e8d1 on 2026-09-25, logged out, 1366x768, the Fields step shows the Title row as
"Aligned right, middle" with the right-middle dot of the nine-dot grid ringed as "read from your
drawing". The Subtitle row, drawn the same way, reads "centred, middle".

On air the Title is centred whatever is typed. Measured as the text's centre over the frame
width, after Take and three Updates: QUIZ NIGHT 0.5000, FINAALI 0.5000, QUIZ NIGHT FINAL 0.5000,
KOULUN TIETOVISA 2026 0.5000 (the box grows symmetrically to 0.135-0.865). So the output is right
and the step's words are not: a student is told "right" about a title that behaves centred, and
clicking the centre dot to "fix" it declares an alignment the drawing already had.

Likely cause, not yet proven: the step's `fit.drawn` answer is measured before the embedded Oswald
face has loaded, so the fallback face's wider "QUIZ NIGHT" puts the line's centre right of the
box's centre and past `SVG_ALIGN_TOL`; the graphic's own runtime measures after the font and gets
`middle`. Reproduce by importing the file in a profile without Oswald installed and reading
`map-svg-align-*` before and after `document.fonts.ready`.

Evidence: the row J live walk, `docs/handoffs/2026-09-24-j-classroom-live-walk.md`.
