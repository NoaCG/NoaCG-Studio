# A failed drop goes silent about the other files, and a template can sit beside a stale design card

**Filed:** 2026-09-08. **Source:** the 2026-09-05 drop-several-files session (handoff since drained)

## Why
Two leftovers the multi-file notice did not cover, both pre-existing, both reported and never
filed. `ImportDesignStep.tsx` renders the notice only when `error` is null (`:413`), but `take`
sets `error` on every failure path (`:219`, `:229`, `:239`, `:247`). So a drop whose CHOSEN file
fails - a broken PNG plus four good ones - reports the failure and says nothing about the four,
which is exactly the silence the notice exists to end.

Separately, `CreationWizard.tsx` `onTemplateFile` (`:1988`) sets `importedFile` without clearing
`draft.designArt` or `draft.designSvg`, so a template dropped after artwork leaves both cards on
the step while only one of them is what gets built.

## What it would take
Move the notice above the error, or render both: the skipped-file list is true whether or not the
used file parsed. For the second, clear the design fields in `onTemplateFile` the way `onArt`
clears the SVG fields, or say on the card which of the two the walk is using.

## Evidence
The code paths above, read on 2026-09-08; the multi-file notice itself landed as `b631a62f`.
