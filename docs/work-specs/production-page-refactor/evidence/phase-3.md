# Phase 3 (row 15): ProductionShell and CueActions, props-only

Gating acceptance: AC-2, AC-8, phase 3's matrix row, assessment A. Built on `main`
`823d1604408c2005d2b15d3297b7f6605fa5cbb3`. Candidate code sha:
`92a3b268557c15cc032fe5f540f5f97ce49d0cae`.

## What moved

- `ProductionShell` (the header and the two-column body) moves from the bottom of
  `ProductionPage.tsx` into `src/components/home/ProductionShell.tsx`, with the one constant only
  it read (`NO_CUES`). The moved text is byte-identical apart from `export default` on its first
  line.
- The `liveBlock` fragment (⚡ GRAPHIC ACTIONS and ± LIVE NUMBERS) moves into
  `src/components/home/CueActions.tsx` as the component's return, byte-identical. The page keeps
  `const liveBlock = selectedGraphic && (<CueActions … />)`, so both mount conditions and both
  places (`liveFirst && liveBlock`, `!liveFirst && liveBlock`) are unchanged.

Decisions and traps: `phase-notes.md`, row 15.

## Reproduce the move check

```sh
git show 823d160:src/components/home/ProductionPage.tsx > /tmp/old.tsx
# the shell: old tail against the new file, from the same doc comment
diff <(sed -n '/^\/\*\* The shell: header/,$p' /tmp/old.tsx) \
     <(sed -n '/^\/\*\* The shell: header/,$p' src/components/home/ProductionShell.tsx)
# the block: the old liveBlock fragment against the component's return
diff <(awk '/^  const liveBlock = selectedGraphic && \($/{f=1;next} f&&/^  \);$/{exit} f' /tmp/old.tsx) \
     <(awk '/^  return \($/{f=1;next} f&&/^  \);$/{exit} f' src/components/home/CueActions.tsx)
```

Result on the candidate: the first prints one changed line (`function ProductionShell({` to
`export default function ProductionShell({`), the second prints nothing.

## AC-2, AC-8 and the matrix row

| Item | Command | Result |
| --- | --- | --- |
| Phase 3 row (offline, local) | `npm run test:e2e -- e2e/production-controls.spec.ts e2e/live-actions-first.spec.ts e2e/playout-baseline.spec.ts` (queue j-0001, 12-minute cap) | on `92a3b26`: 33 passed, 6 failed. The 6 are `playout-baseline`'s screenshot comparisons (9,655 to 12,067 px each). Unchanged `main` `823d160` on the same machine (j-0002) fails the same 6 by the same counts within 2 px. Comparing this branch's captures with main's directly: 0 to 73 differing pixels per image, scattered single pixels. GitHub Actions decides the baselines. |
| e2e diff | `git diff origin/main...HEAD -- e2e` | 22 specs gain one `// covers:` line each; no assertion or selector changes |
| Configured dispatch | none (phase 3's row has none) | - |
| AC-8 | `git diff --name-only origin/main...HEAD -- src` | `src/components/home/CueActions.tsx`, `src/components/home/ProductionPage.tsx`, `src/components/home/ProductionShell.tsx` |
| Covers | `node scripts/e2e-affected.mjs --list --files src/components/home/{ProductionShell,CueActions}.tsx` | 29 and 28 specs (19 each before the covers lines) |
| Types, lint, depcruise, gates | `npx tsc --noEmit -p tsconfig.json`, `npx eslint` on the three files, `npm run depcruise`, `node scripts/gates.mjs run --changed origin/main` | clean; no dependency violations (1354 modules); gates 27 passed |

## Before and after

`playout-baseline`'s six captures (graphics only, graphics and server cues, folders, at 1920x1080
and 1366x768) were taken on `main` and on the branch on the same machine, compared pixel by pixel
and looked at side by side: header, ⚡ block, ± row and rail identical. Not committed.
