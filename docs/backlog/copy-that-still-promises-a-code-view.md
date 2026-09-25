# Copy that still promises a code view the studio no longer has

**Filed:** 2026-09-24. **Source:** the live walk of the closed old code editor on noacg.studio
(`docs/handoffs/2026-09-24-h-old-editor-live-walk.md`).

## Why

Since 2026-09-24 no door opens the old code editor, and the new editor has no code view. A
student who reads "open as code" or "code you can open" looks for a place that does not exist.
The template card on the wizard's front page made the same promise ("Tweak the code it writes,
or never open it"); that sentence was dropped on the walk's own branch because the card is in a
file the closing change touched. These are the ones outside it.

It also touches a pillar: the root taste rule says the code "is real and always available, with
the view optional". Today the only way to see it is to export. Whether the new editor grows a
read-only code view, or the copy says "the export carries the code", is the owner's direction
call; the copy below is wrong under either answer.

## What it would take

Rewrite each line to say what happens now, then `npm run check:copy -- --update` if a count moves.

- `src/components/wizard/steps/AiStep.tsx`: the drop zone and the imported-template card say
  "Open as code" (lines near 868, 872, 1226, 1234, 1244 and the button near 1288). The button no
  longer opens code. `CreationWizard.tsx`'s `onOpenImported` sends the file to the Import card's
  Finish, which applies it byte for byte. Something like "Use it as it is (no AI)" says that.
  The two error strings near 868 and 872 tell the reader to "Open it as code" for the same road.
- `index.html`, the landing page's CUSTOMISE step: "Every change writes readable code you can
  open or ignore." and the "Real code" fact chip. Only an export opens it now.

Check the e2e specs that match on "Open as code" before renaming the button.

## Evidence

- Live walk screenshots: `C:\claude\noacg-live-walks\2026-09-24-h\02-front-page-three-cards.png`
  (the template card's sentence as it shipped at `c8754c1e`).
- `grep -rn "Open as code" src/components/wizard` lists every line.
