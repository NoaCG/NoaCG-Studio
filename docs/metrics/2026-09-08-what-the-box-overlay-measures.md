# Measured 2026-09-08: what the box overlay draws, on the owner's own board

Numbers read out of the running step while building the preview overlay
(docs/TEXT_BOX_BINDING.md step 2), on
`e2e/fixtures/svg-corpus/illustrator-owner-quiz-board-rotated.svg`. All lengths are the artwork's
own px unless the column says otherwise.

## The two boxes

| | Marker | Drawn rect | On the artwork | Its text |
|---|---|---|---|---|
| Question plate | `s1` = `q_bg` | 231 x 1233, rotated -88.68 | 1238 x 259 | drawn LEVEL |
| An answer plate | `s3` = `a3_bg` | 76 x 520, rotated -79.38 | a 520 x 76 band tilted 10.62 | tilted 10.62 |

The question is the only line on the board whose text and plate are not on the same angle, and it
is the case that decided the frame question below.

## The room, two ways of reading it

The overlay's dashed line is the room the LADDER uses, which is not the same as the margins the
designer left. On an axis the block is centred on, both gaps are half the centring by construction,
so `svgAlignOf` and `measureSvgRoom` both substitute a typographic margin - half the drawn type
sideways, half a line vertically. The overlay makes the same two substitutions.

| Line | Axis | Drawn inset, mirrored | What the ladder keeps | Room that leaves |
|---|---|---|---|---|
| Question | sideways (centred) | 209 | **18** | 820 -> **1202** |
| Question | vertical (middle) | 97 | **22** | 65 -> **215** |
| Answer | sideways (left) | 34 | 34, unchanged | 452 of a 520 plate |
| Answer | vertical (middle) | 47 | **17** | 42 |

**215 is the confirmation worth keeping.** The 2026-09-02 ruling note records the runtime measuring
"216 units of room rather than 198" on this same plate after the vertical snap was built. The
overlay, which shares no code with it and measures on a different canvas, draws 215. That agreement
is the whole argument for substituting rather than showing the drawn insets: had the overlay drawn
the mirror, it would have shown the owner's question with 65 units of room in a plate the ladder
gives it 215 of.

## Which frame the measurement is taken in

The doctrine section of `docs/TEXT_BOX_BINDING.md` says every measurement is taken in the BOX's
local coordinate system. The runtime does not: `svgAlignOf` maps the plate into the LINE's system
through `svgLocalBox` and measures there. The two are one answer wherever text and plate carry the
same rotation - all four answer plates - and stand 88.68 degrees apart on the question.

Built in the box's frame first, and measured: the text bounds round the question came out turned
88.68 degrees away from the words they were meant to hug, which is what the spec caught. The
alignment WORDS survived it, but only because the question is centred on both axes, so the swap
between them is invisible; a line centred on one axis and not the other would have been described
about the wrong one. The overlay now uses the line's frame throughout.

## What it costs to carry

The canvas protocol gained two general capabilities rather than one special case:

| | What it is | Payload |
|---|---|---|
| `'mark'` | a CLASS carried into the document | one message per hover change, not per frame |
| `CanvasFrame` | an element's own bbox plus its matrix, beside its rect | 10 numbers per frame, for the ONE selector the overlay draws in |

Frames are opt-in on the `'track'` command, so the editor canvas - which tracks hundreds of
selectors and hit-tests every one of them with a rectangle - pays nothing.

## The step's height budget

Unchanged. The overlay is drawn on the preview and adds no chrome to the checklist, so the
scorebug's seven rows still arrive whole at 1280x720 (`e2e/import-svg.spec.ts`, "the mapping step's
checklist is on screen"). The roughly 30 px of headroom the grouping headings bought back is still
there for step 3's alignment control.
