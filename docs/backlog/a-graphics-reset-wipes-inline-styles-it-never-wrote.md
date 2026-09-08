# A graphic's reset wipes inline styles the animation never wrote

**Filed:** 2026-09-08. **Source:** the 2026-09-01 one-field-per-item session (handoff since drained)

## Why
`noacgResetGraphic` returns a graphic to CSS rest with `gsap.set(el, { clearProps: 'all' })` over
the root and every descendant, so it cannot tell an animation's leftover transform from a
declaration the designer wrote. Measured on an Inkscape lower third that keeps its typography
inline: three layers drawn at 56, 30 and 22px painted at the browser's default 16px in the
fallback face the moment the editor parked the graphic. Imported artwork is safe today only
because import hoists every inline declaration onto a class, a workaround in one family while the
reset serves all of them. The image exception already carved out of it (re-hiding srcless field
images, so the reset does not turn an empty field into a broken-image box) is the same bug patched
once by hand.

## What it would take
Clear what the animation wrote rather than everything: record the properties each tween touched,
or capture a rest pose at load and restore from it. In `src/templates/shared/animRuntime.ts`, so
every category and every export gets it, with the Inkscape lower third as the fixture.

## Evidence
`src/templates/shared/animRuntime.ts:731`; `src/assets/svgImport.ts:729` ("A GRAPHIC RESETS BY
CLEARING ITS INLINE STYLES").
