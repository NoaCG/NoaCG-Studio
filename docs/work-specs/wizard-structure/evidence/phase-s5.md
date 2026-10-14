# Phase S5: walk reducer and lifecycle (AC-2, AC-3, AC-4, AC-9)

Recorded by the S5 builder (branch `claude/plan-wizard-shell-p7-build`), 2026-10-14, Windows 10.
Before = `origin/main` at `afca974f1`. The local browser queue was not used: about 1.6 GB was
free against its 4 GB floor (#1067), so every journey runs on CI.

## Commands and results

| Command | Result |
|---|---|
| `node --test scripts/wizard-walk-state.test.mjs` | 24 of 24 pass |
| eleven mutations of `shell/walkState.ts` (fresh keeps the file; Continue stays put; a mode change not resetting the furthest step; close ignoring `left`; `needs-name` not minting; restore keeping the kit; restore ignoring the landed production; rewind keeping the brand; the deep link dropping the brand; "has work" counting the format; fresh keeping the accepted AI generation) | each turned at least one test red (3, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1) |
| `node --test` over `wizard-doors`, `wizard-walks`, `wizard-kit-plan`, `import-drop` | 55 of 55 pass |
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npx eslint --max-warnings 0` over the shell, the two new modules and the test | clean |
| `npm run depcruise` | no violations, no config change (1377 modules) |
| `npm run gates -- run --changed origin/main` | every gate ok, `check:file-budgets` 1,661 of 1,661 |
| `git diff --name-only origin/main...HEAD -- src` (AC-9) | `CreationWizard.tsx`, `shell/walkState.ts`, `shell/useWalkLifecycle.ts` |
| `node scripts/e2e-affected.mjs --list --files src/components/wizard/shell/walkState.ts` | 44 specs, among them `wizard-shell`, `wizard-finish`, `wizard-draft-guard`, `template-deep-link`, `wizard-brand`, `wizard-logo`, `wizard-setup-fields`, `new-graphic-guard` and `route-transition-flash` (the last four through the covers lines this phase adds) |
| browser journeys of the section 6 row | on the pull request's CI and the merge group; `wizard-logo` and `wizard-setup-fields` run revived once #1212 is on `main` |

## How "identical" is checked

Every removed shell body was compared with its new home: the open effect's three branches and the
close are `transition`'s `continue`, `restore`, `fresh` and `close`; `leaveStep` is `rewind`; the
deep-link effect is the `deepLink` action; `chooseBrand`, `resetKit`, `forgetWalk`, `walkHasWork`,
`rememberWalk`, `noteMade` and `saveBuiltGraphic` moved with the same statements over the record
or the walk memory. The `[open, mode, step]` effect that kept the furthest step is now a rule the
reducer applies to each action's final mode and step; every handler moves the step at most once,
so the rule sees what the effect saw. The one batch that differs (the route sync's `go` and a
restore in one commit) can only raise a furthest step that Continue never reads after a restore.
Effect order is kept: the route sync, then the hook's open effect, then the deep link.

## Assessment A

PASS, by a fresh read-only `wave-row-deciding` session with the `/so` brief, on `4146f8b3e`. It
re-ran the Node test (24 of 24) and depcruise, compared every removed body, and found behaviour
identical, every section 4 cell a `transition` assertion, `walkHasWork` false after a fresh open in
all seven modes, no second reset left in the shell, the fence and budget met. Findings: land #1212
first (done before queueing); Browse and Template still built their own pick patch (fixed in
`da6022343`, also raised by Codex on the pull request); the phase notes and this file (added); the
restore plus deep-link case (filed as #1220); an extra render from a setter that changed nothing
(fixed: the plain setters keep the record).

## Shell size

2,105 lines before, 1,661 after; `scripts/file-budgets/components-wizard-CreationWizard.json`
lowered from 2,105 to 1,661 (AC-10).

## Limitations

No browser journey ran on this machine. The hook's IO (the route, the guard's one-shots, the
saved looks, the production) is proved by the journeys, not by Node. The restore plus deep-link
case is characterised in Node only; its browser half is by reading `App.tsx` (#1220).
