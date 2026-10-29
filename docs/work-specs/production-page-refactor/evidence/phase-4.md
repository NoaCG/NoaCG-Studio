# Phase 4 (row 16): useProductionPublish (publish, slot, links)

Gating acceptance: AC-2, AC-8, phase 4's matrix row, assessment A. Built on `main`
`799924c32546d05a414ae733f4214f1f824bce6f`. Candidate code sha: `c9fa3a4e24d5ea1ecb5a68e2202078c32b8236c0` (after it only this directory changes).

## What moved

The publish, CasparCG slot and links state (`statusOpen`, `linksOpen`, `busy`, `publishing`,
`copied`, `nameDraft`, `nameNote`, `replaceAsk`, `slotBusy` and `slotBusyRef`), the sign-in
follow-through of a Publish, the handlers (`accountBlocks`, `claimName`, `downloadEmbed`, `copy`,
`slotAction`, `loadOnSlot`, `takeOffSlot`, `unloadFromSlot`, `clearThroughBridge`, `publishNow`,
`publish`) and the header action and CasparCG facts move from `ProductionPage.tsx` into
`src/components/home/useProductionPublish.ts`. Why it is a hook plus two plain functions, what
stayed, and every non-mechanical change: `phase-notes.md`, row 16.

## Reproduce the move check

```sh
git show 799924c:src/components/home/ProductionPage.tsx > /tmp/main.tsx
# 1. the moved text, in the order the new file holds it, against the new file
for r in 326,335 518,525 528,531 663,667 479,497 2650,2696 2698,2719 2811,2820 2822,3014 4624,4644 4652,4688; do
  sed -n "${r}p" /tmp/main.tsx; done > /tmp/moved.txt
diff /tmp/moved.txt src/components/home/useProductionPublish.ts | grep '^<'
# 2. the old page minus those ranges against the new page
sed -e '326,336d;479,497d;518,525d;528,531d;663,667d;2650,2720d;2811,3014d;4624,4644d;4652,4688d' /tmp/main.tsx \
  | diff - src/components/home/ProductionPage.tsx
```

Result on the candidate: (1) prints only the four removed lines of the two listed text changes
(the rehearsal clear's `applyProgram(...)` and `setLiveCue({})`, now the page's
`onFirstPublish`, and the two lines of `publishNow`'s comment); every other old line is in the
new file unchanged. (2) prints only trimmed imports, the three call sites
(`useProductionPublish`, `publishActions`, `publishFacts`) and the removed
`publishRef.current = publish;` line, now set inside `publishActions`.

## AC-2, AC-8 and the matrix row

| Item | Command | Result |
| --- | --- | --- |
| Phase 4 row (offline, local) | `npm run test:e2e -- e2e/publish-output-setup.spec.ts e2e/bridge-connect.spec.ts e2e/playout-feedback-health.spec.ts` (queue, 5-minute cap) | 60 passed on `ccecb27` (j-0001) and 60 passed on `c9fa3a4` (j-0002) |
| Configured dispatch | `configured-suite.yml` on the branch, [run 39907518911](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39907518911), `headSha` `c9fa3a4e24d5ea1ecb5a68e2202078c32b8236c0` | 124 passed, 0 failed, 0 flaky, 3 skipped (the allowlisted `bridge-real-server` pair and `connector-grants`); `configured-verdict.mjs` against `expected-run.json` passed. `publish-guard` (both tests), `production-links`, `playout-status` and `live-prepare` green. An earlier dispatch on `ccecb27` was cancelled as stale. |
| C6 Node tests | `node --test scripts/legacy-sheet-block.test.mjs scripts/team-show-merge.test.mjs scripts/published-record.test.mjs` | 28 of 28 pass, unchanged |
| e2e diff | `git diff origin/main...HEAD -- e2e \| grep '^[-+]' \| grep -v '^+++\|^---\|^+// covers: src/components/home/useProductionPublish.ts'` | empty: 19 specs gain one `// covers:` line each; no assertion or selector changes |
| AC-8 | `git diff --name-only origin/main...HEAD -- src` | `src/components/home/ProductionPage.tsx`, `src/components/home/useProductionPublish.ts` |
| Covers | `node scripts/e2e-affected.mjs --list --files src/components/home/useProductionPublish.ts` | 24 offline specs (19 before the covers lines), including the three of the row, `auth` and `studio-feedback` |
| Assessment A | a fresh read-only `/so` session (`.agent-workflows/so.md`) on `c9fa3a4` | **AGREE WITH NOTES**, nothing blocking: it re-ran both identity diffs, found the same four non-mechanical changes and judged them safe, effect order and dependency arrays unchanged, no imported name re-binds, AC-8 and AC-2 hold, the covers selection is sound. Notes: state the spec-wording departure in the pull request (done), `PublishActionsIo` should shrink in later phases, `home/AGENTS.md`'s split paragraph waits for the AC-12 docs pass. |
| `/check` | review delegated (6 findings: 3 fixed in `3dabd03`, 3 declined with reasons in the pull request); simplify delegated (2 type reuses and one un-export applied in `c9fa3a4`, the rest no change) | pass |
| Types, lint, depcruise, gates | `npx tsc --noEmit -p tsconfig.json`, `npx eslint` on the two files, `npm run depcruise`, `npm run gates -- run --changed origin/main` | clean; no dependency violations (1355 modules); gates 27 passed |
| Pull request review bot | on pull request open (`6e3f7ce`, code identical to `c9fa3a4`) | no findings |

## Before and after

No visible change: the moved code holds no markup, and the page's JSX is unchanged. No
screenshots taken.
