# Extract `ProductionPage.tsx` - one 2,968-line component behind the 12 September production

**Filed:** 2026-08-28. **Source:** weekly quality review (measurement)

## Why

**The screen the student release runs on is the hardest file in the repo to change safely.**

`src/components/home/ProductionPage.tsx` is 2,968 lines with a **single export**: the default
component opens at line 168 and runs to roughly line 2,460. That one function body holds
**30 `useState` calls and 77 hooks in total**. Only six helpers have ever been pulled out
(`elapsed`, `nameList`, `ProductionShell`, `CasparAirRow`, `LinkRow`, `ProductionLinks`).

It is also **the highest-churn component in the repo at 66 edits in the month to 2026-08-28**,
and it is the playout dashboard - the surface the 2026-09-12 production depends on. So every
remaining student-release change lands in the file where a mistake is least visible, at the point
in the calendar where a mistake is most expensive.

The state names say why it resists editing: `liveCue`, `selectedCueId`, `draft`, `liveData`,
`machineStates`, `airedData`, `wireLog`, `programOverflow`, `previewOverflow` - the rundown, both
monitors, the cue draft and the wire log are one interleaved scope, so a change to any of them is
a change to all of them.

## What it would take

A day.

**The safe half is done and the rest is planned:** the state map and the five remaining phases,
each session-sized with its own proof, are in **docs/backlog/production-page-phases.md**. Read
that before starting any of them - it records which state a surface may take with it and which
it may not.

Split along the surfaces the file's own header comment already names - rundown, PREVIEW monitor,
PROGRAM monitor, cue draft, data/wire panels - lifting only the state each genuinely needs.

The order that keeps it safe: extract the **read-only** pieces first (the wire log, the links
rows, the overflow readouts), which cannot change Take behaviour. Do the cue draft last, because
`liveCue` is a MAP keyed by layer and every verb but Take addresses the selected cue's layer - the
one piece of state that must not be split by accident.

Its CSS half is already lifted: `src/styles/playout-dashboard.css` is the dashboard's 1,314
lines, split out of the former `src/styles.css` on 2026-08-28. What is left is the component.

**Risk: hook order, and state that is genuinely shared.** Lifting `liveCue` or `selectedCueId`
into the wrong child changes what Take airs - the one behaviour in the product that must not
regress quietly.

**Proof it did not break:** the production-route e2e specs already exist (`hosted-control.spec.ts`,
`caspar-connect.spec.ts` and the others matching `production`); run the affected plan. Any cue path
that turns out to be uncovered gets its own spec in the same commit (root `AGENTS.md`,
verification rule 2), because "it still rendered" is not proof that Take still aired the right
layer.

## Evidence

- `wc -l` -> 2,968. `grep -n '^export'` -> exactly one line (168).
- `grep -c 'useState\|useEffect\|useMemo\|useCallback'` -> 77; `useState` alone -> 30.
- `git log --since="1 month ago" --name-only` -> 66 commits, rank 1 among components
  (rank 3 overall, behind the former `src/styles.css` and `src/ai/AGENTS.md`).
- Its CSS is `src/styles/playout-dashboard.css` (1,314 lines), already its own file.
- Deadline context: root `AGENTS.md` "Current push" - a QUIZ and a SCOREBOARD decide the release
  by 2026-09-12, both played out from this surface.

## Trend

- 2026-08-28: 2,968 lines, 1 export, 77 hooks (30 `useState`), 66 commits/month
- 2026-08-28, after phase 0: 2,541 lines, 4 exports across 4 files, 77 hooks (30 `useState`)
- 2026-09-08: 2,635 lines, 1 export, 66 hooks (31 `useState`), 43 commits/month. Regained 94 lines since phase 0 and churn nearly halved; still one export and one scope
