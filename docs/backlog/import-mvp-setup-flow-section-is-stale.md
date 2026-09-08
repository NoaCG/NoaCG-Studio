# `IMPORT_MVP.md`'s "SETUP flow" section describes a wizard that no longer exists

**Filed:** 2026-09-08. **Source:** the 2026-09-04 contracts-point session (handoff since drained)

## Why
The section says the wizard is three steps, and that everything its old Text, Style and Animation
steps did lives in the editor now. The shipped wizard renders `PlaceFieldsStep` at step 3 and an
Animation step at 4 (`src/components/wizard/CreationWizard.tsx`). The wizard's contract points at
this doc for what each step DOES, so a reader is sent from a true contract to a false page. The
2026-09-04 session found this and planted an explicit warning in the wizard contract not to follow
the section; the contract has since been regenerated from `contracts/rules/`, and the warning went
with it. So the doc is stale AND unguarded now.

## What it would take
Rewrite the section against `CreationWizard.tsx`'s actual step list, then decide whether a rule in
`contracts/rules/wizard/` should carry the step list instead of the doc. Do not re-plant a
warning: a pointer to a page that has to be disbelieved is worse than either fixing the page or
deleting the pointer.

## Evidence
`docs/IMPORT_MVP.md:120-132` against `src/components/wizard/CreationWizard.tsx`. The lost warning:
`src/components/wizard/AGENTS.md:27` and `.claude/rules/src-components-wizard-import.md:13` now say
only that what each step does is owned by `docs/IMPORT_MVP.md`.
