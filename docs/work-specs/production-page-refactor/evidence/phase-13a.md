# Phase 13a (row 5): props-only cue editor extraction

Gating acceptance: AC-2, AC-8, and phase 3's matrix row plus `production-data` and
`playout-air-contract`, assessment A. Built on `main` `7ac4b22159ef3cb120271123599f70fda9fa559f`.
Candidate code sha: `502e081b7b03975f30237edd98474c255e42bdbd`; the commit after it touches only this `evidence/` directory.

## What moved

The graphic cue's editor (`data-testid="cue-editor"`, 345 lines of JSX) moves from
`ProductionPage.tsx` into `src/components/home/CueEditor.tsx`, props only. The moved text is
byte-identical to the old block apart from three places: the ends row (`{endsRow()}`), the sound
(`{sounds}`), both still built by the page, and the rundown history prop's name
(`rundownHistory`). No state, effect or derived value moved. Decisions and traps:
`phase-notes.md`, row 5.

## AC-2, AC-8 and the matrix row

| Item | Command | Result |
| --- | --- | --- |
| Phase 3 row plus `production-data`, `playout-air-contract` (offline, local) | `npm run test:e2e -- e2e/production-controls.spec.ts e2e/live-actions-first.spec.ts e2e/playout-baseline.spec.ts e2e/production-data.spec.ts e2e/playout-air-contract.spec.ts e2e/production-audience.spec.ts` (queue, 12-minute cap) | on `502e081b7b03975f30237edd98474c255e42bdbd`: 77 passed, 6 failed (j-0004). The 6 are `playout-baseline`'s screenshot comparisons, which fail the same way on unchanged `main` `7ac4b22` on this cloud machine (j-0002, about 10,000 pixels of text antialiasing each, the same counts within one pixel). Comparing this branch's captured screenshots with `main`'s captures directly: 0 to 30 differing pixels per image, noise between runs. GitHub Actions is authoritative for the baselines. |
| C0 Fill menu (paste staging) | `e2e/production-audience.spec.ts`, in the selection above | passed |
| One flake on the first candidate | `production-controls.spec.ts:347` failed once on `1938c45` (j-0001, the machine-state chip read "Enter · Live" instead of "spotlit" in time); passed on `main` (j-0002), passed 3 of 3 with `--repeat-each 3` on `bd1029c` (j-0003) and in the full selection on the candidate (j-0004) |
| Node | `node --test scripts/production-data-session.test.mjs` | 12 passed, including `dispatch` with `dataKey === undefined` |
| Configured dispatch | none for this row (phase 3's row has none) | - |
| AC-8 | `git diff --name-only origin/main...HEAD -- src` | `src/components/home/CueEditor.tsx`, `src/components/home/ProductionPage.tsx` |
| Covers | `node scripts/e2e-affected.mjs --list --files src/components/home/CueEditor.tsx` | 37 specs (19 before the covers lines); 23 specs gained one comment line each, no assertion or selector changed |
| Assessment A | a fresh read-only `/so` session (`.agent-workflows/so.md`) on `1938c45` | **AGREE**, no blocking findings: the moved markup is byte-identical outside the two slots, reconciliation unchanged, "derives nothing, moves no state" holds, types not lossy, AC-8 met. Its notes (the ends row was built eagerly; the evidence not yet committed) are both addressed on the candidate. |
| `/check` | review delegated (8 findings: covers mapping, the shadowing `history` prop, the inline IIFE and the notes' `editTarget` wording fixed; dead guards, prop count, double `nextRow` and the AGENTS.md list left for 13b and phase 14 as the spec plans); simplify delegated, 4 angles (`CueDraft` extends `CueEditorView`; keeping the ends row lazy and the sound slot as is, noted for 13b) | pass |
| Types, lint, depcruise, gates | `npx tsc --noEmit -p tsconfig.json`, `npx eslint` on both files, `npm run depcruise`, `node scripts/gates.mjs run --changed origin/main` | clean; no dependency violations (1343 modules); gates exit 0 |

## Before and after

`playout-baseline`'s six captures (graphics only, graphics and server cues, folders, at 1920x1080
and 1366x768) were taken on `main` and on the branch on the same machine and compared, then looked
at side by side: the editor head, setup fold, bands, note, ends row, Advanced and Sounds are
identical. Not committed.
