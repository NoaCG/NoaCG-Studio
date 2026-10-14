# Phase S4: doors (AC-2, AC-3, AC-5, AC-9)

Recorded by the S4 builder (branch `claude/plan-wizard-shell-p6-build`), 2026-10-14, Windows 10.
Before = `origin/main` at `20bda8867`. The local browser queue was not used: about 2.2 GB was
free against its 4 GB floor (#1067) and another worktree held it, so every journey runs on the
pull request's CI.

## Commands and results

| Command | Result |
|---|---|
| `node --test scripts/wizard-doors.test.mjs` | 24 of 24 pass |
| ten mutations of `shell/doors.ts` (press guard dropped; press never released; export window only after a good save; look captured over a production that has one; no `pendingProductionExport` on the set export; set busy never cleared; the built graphic read before the save; the wizard closed before the pool commit; the set gate skipped; the editor door saving) | each turned at least one test red (1, 6, 1, 1, 1, 3, 5, 4, 1, 3) |
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npx eslint --max-warnings 0` over `CreationWizard.tsx`, `shell/doors.ts`, the test and `no-old-editor.spec.ts` | clean |
| `npm run depcruise` | no violations, no config change (1373 modules) |
| `npm run gates -- run --changed origin/main` | every gate ok, `check:file-budgets` 2,105 of 2,105 |
| `git diff --name-only origin/main...HEAD -- src` (AC-9) | `CreationWizard.tsx`, `shell/doors.ts` |
| `node scripts/e2e-affected.mjs --list --files src/components/wizard/shell/doors.ts` | 41 specs, among them `wizard-finish`, `storage-full`, `import-name-collision`, `wizard-kit` and `no-old-editor` (the last through the covers line this phase adds) |
| browser journeys of the section 6 row (`wizard-finish`, `storage-full`, `import-name-collision`, `wizard-kit`, `no-old-editor`) | on the pull request's CI; all are in the shell's affected plan |

## How "identical" is checked

Each door in `shell/doors.ts` is the shell's body from `20bda8867` with `io.` in front of what it
reached directly: the same statements in the same order, the same alert strings, the same
landing. The Node test pins that order as a log per section 3.2 row, with the library save, the
production write and the pool held (late), refused (failed) and pressed twice, over the three
applier shapes (async catalog and AI, sync file). Two timing differences, both inside one
microtask: the file editor door's note, editor and close, and the file export door's save, now
follow an `await` of the sync applier, so React commits one render first with the wizard still
open. Nothing paints, and the catalog and AI doors always had this interleaving.

## Assessment A

PASS, by a fresh read-only `wave-row` session with the `/so` brief, on `c25c1b59d`. It re-ran the
Node test from `git show` (23 of 23 then), compared every removed door body with `shell/doors.ts`
and found the behaviour identical, every section 3.2 row covered, the imports type-only, the fence
and budget met. Three low findings, all taken: a row for a held production write (added, now 24);
the microtask wording (corrected above); `noteMade` must stay after the save, and the owed
`saveBuiltGraphic` Node tests (both in S5's notes).

## Shell size

2,357 lines before, 2,105 after; `scripts/file-budgets/components-wizard-CreationWizard.json`
lowered from 2,357 to 2,105 (AC-10).

## Limitations

No browser journey ran on this machine. The appliers stay in the shell (D4) and are stand-ins in
the Node test, so the snapshot, the build and the activation event are proved by the journeys,
not by Node. `saveBuiltGraphic` (R2) is injected until S5 and scripted in the test; its by-name
resolution is pinned by `wizard-finish` and `import-name-collision`.
