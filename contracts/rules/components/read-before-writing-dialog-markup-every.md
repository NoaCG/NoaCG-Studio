---
v: 1
scope: src/components/**
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-read-before-writing-dialog-markup-every.md
---
Read `src/styles/AGENTS.md` before writing dialog markup: every dialog shares ONE anatomy defined in `src/styles/wizard-and-dialogs.css` - the header row with its hard-right close control, the checkbox row, the `110px | 1fr` form row, the one-row footer, and the `.spacer`-is-not-a-push trap. Do not restate or fork those rules in a component.
