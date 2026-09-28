---
v: 1
scope: src/components/wizard/steps/EntryStep.tsx, e2e/wizard-entry-fit.spec.ts
kind: rule
fires: contract
status: active
since: 2026-09-28
supersedes: wizard/carry-beta-tag-inside-create-title
record: contracts/records/wizard/2026-09-28-carry-caveat-entry-start-card-create.md
---
Carry no caveat on an Entry start card: Create with AI has no Beta tag and no testing note, and the Video card is greyed with no not-recommended sentence, the grey being its whole signal. Neither door is ever disabled: a visitor known to be signed out gets the sign-in dialog when pressing Video, and a session still resolving is treated as signed in.
