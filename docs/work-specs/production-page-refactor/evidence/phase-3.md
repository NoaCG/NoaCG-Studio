# Phase 3 (row 15): ProductionShell and CueActions, props-only

Gating acceptance: AC-2, AC-8, phase 3's matrix row, assessment A. Built on `main`
`823d1604408c2005d2b15d3297b7f6605fa5cbb3`. Candidate code sha:
`c429a6dedea93a4d0fe4969d6df03bc63406142b` (the move is `92a3b26`; after it only `// covers:` lines and this directory changed).

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
| Phase 3 row (offline, local) | `npm run test:e2e -- e2e/production-controls.spec.ts e2e/live-actions-first.spec.ts e2e/playout-baseline.spec.ts` (queue, 12-minute cap) | on `92a3b26` (j-0001) and again on `c429a6d` (j-0003): 33 passed, 6 failed each time. The 6 are `playout-baseline`'s screenshot comparisons (9,655 to 12,067 px each). Unchanged `main` `823d160` on the same machine (j-0002) fails the same 6 by the same counts within 2 px. Comparing this branch's captures with main's directly: 0 to 73 differing pixels per image, scattered single pixels. GitHub Actions decides the baselines. |
| e2e diff | `git diff origin/main...HEAD -- e2e \| grep '^[-+]' \| grep -v '^+++\|^---\|^+// covers: src/components/home/'` | empty: 34 specs gain one `// covers:` line each; no assertion or selector changes |
| Configured dispatch | none (phase 3's row has none) | - |
| AC-8 | `git diff --name-only origin/main...HEAD -- src` | `src/components/home/CueActions.tsx`, `src/components/home/ProductionPage.tsx`, `src/components/home/ProductionShell.tsx` |
| Covers | `node scripts/e2e-affected.mjs --list --files src/components/home/{ProductionShell,CueActions}.tsx` | 32 offline specs each (19 before the covers lines) |
| Assessment A | a fresh read-only `/so` session (`.agent-workflows/so.md`) on `bbe4a2b` (code `c429a6d`) | **AGREE WITH NOTES**, nothing blocking: the moved text is byte-identical both ways (every line removed from the page is in a new file, apart from trimmed imports), mount condition, places and keys unchanged, no hook or derived value moved in, the shell's own hooks rightly move with it, types not lossy, the e2e diff is covers lines only, AC-8 holds. Notes: the spec's file table gives `CueActions` the `arranging` and folded state, which no phase moves (recorded in `phase-notes.md`, row 15); matrix row 3 says assessment "none" (run anyway, as the brief asks); `home/AGENTS.md`'s split list waits for the AC-12 docs pass. |
| `/check` | review delegated (7 findings: 4 covers gaps fixed in `c429a6d`, the wording departures put in the pull request, wrapped callbacks declined to keep the move verbatim, the Actions run is the PR's CI); simplify inline (no change: any cleanup breaks the verbatim move) | pass |
| Types, lint, depcruise, gates | `npx tsc --noEmit -p tsconfig.json`, `npx eslint` on the three files, `npm run depcruise`, `node scripts/gates.mjs run --changed origin/main` | clean; no dependency violations (1354 modules); gates 27 passed; `node --test scripts/e2e-affected.test.mjs` 93 passed |

## Before and after

`playout-baseline`'s six captures (graphics only, graphics and server cues, folders, at 1920x1080
and 1366x768) were taken on `main` and on the branch on the same machine, compared pixel by pixel
and looked at side by side: header, ⚡ block, ± row and rail identical. Not committed.
