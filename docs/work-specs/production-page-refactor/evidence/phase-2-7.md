# Phase 2+7 (row 4): store part, session skeleton, the production-data session

Gating acceptance: AC-3, AC-6, AC-8 and the phase 2 and phase 7 rows of the §6 matrix, in full.
Built on `main` `304a440a121c51d650f78437496ffc2e1bd56d0a`. Phase 2's half was pushed as its own
checkpoint commit (`88701bd`). Candidate code sha: `b12dd74d0e16b7103e93fc20889661c7e909c122`; commits after it touch only this
`evidence/` directory.

## What moved

| Module | From | Interface |
| --- | --- | --- |
| `src/control/storePart.ts` | `serverPlayoutStore.ts` (re-exported there) | `storePart<T>()`, `StorePart<T>` |
| `src/components/home/useStorePart.ts` | new (the `useSyncExternalStore` idiom) | `useStorePart(part)` |
| `src/control/liveCue.ts` | `hostedControl.ts` (re-exported there) | `LiveCueMap`, `readLiveCue`, `withLiveCue`, `VerbSent`, `leftAlone` |
| `src/control/cueItems.ts` | `hostedControl.ts` (re-exported there) | `takeCueItems`, `clearCueItems`, `clearAllCueBatches` |
| `src/control/playoutSession.ts` | new | `createPlayoutSession(id)`: `key`, `alive`, `data`, `apply`, `onDispose`, `dispose` |
| `src/control/productionDataSession.ts` | `ProductionPage.tsx` (the tree, its key, tree-read, the two write roads, the dispatch) | `published(slug)`, `setLiveData`, `patchBoundValues`, `refresh`, `dispatch(resolved, tree, send)` |

`ProductionPage.tsx` makes the session with `useMemo` on the id and ends it one task after its
effect's cleanup (a re-run of that effect cancels the end, which keeps one session through
StrictMode's extra cleanup in development), enters the data mode
from `hostedSlug`, reads the `data` part through `useStorePart`, and hands `runVerb` to the dispatch
(the temporary interface). `ProductionDataWorkspace.tsx` is unchanged: its props are the same.
Decisions, one departure and the traps: `phase-notes.md`, row 4.

## AC-3, AC-6, AC-8

| Criterion | Evidence |
| --- | --- |
| AC-3 Node tests with `// guards:` | `scripts/store-part.test.mjs`, `live-cue.test.mjs`, `cue-items.test.mjs`, `playout-session.test.mjs`, `production-data-session.test.mjs`, each importing its module directly in Node |
| AC-3 pure runtime imports, io injected | `storePart.ts` and `liveCue.ts` import nothing; `cueItems.ts` imports types only; `playoutSession.ts` imports `./storePart.ts`; `productionDataSession.ts` imports `../model/productionData.ts` and types. Browser doors (`productionDataApi.ts`, `productionState.ts`, `window` storage, the note line) arrive through `io` |
| AC-3 depcruise, no config change | `npm run depcruise`: no violations (1342 modules); `.dependency-cruiser.cjs` untouched |
| AC-6 storePart | identity of `get`/`subscribe` across writes; a listener hears a change and only a change (same value, same updater result, `NaN`); unsubscribe while notified |
| AC-6 session | create (key, alive, data at "not yet known"), parts and apply (one fold, listeners hear only a change), dispose (stops once, in order, `alive` already false; a late stop runs at once; a fold after dispose is a no-op) |
| AC-6 data session (matrix row 7) | the dataKey gate: `undefined` sends nothing whatever the tree holds, a published key sends nothing, `null` sends the changes once; both roads (key PATCH naming removals and holding the answer, refused PATCH says so and re-reads; slug press counting from its optimistic tree, refused press says so; unpublished press saves locally); other tab's write; mode change drops the old mode's late key; a render's older tree is passed over; dispose drops late answers, sends nothing, removes the listener |
| AC-8 | `git diff --name-only origin/main...HEAD -- src` lists exactly: `ProductionPage.tsx`, `useStorePart.ts`, `cueItems.ts`, `hostedControl.ts`, `liveCue.ts`, `playoutSession.ts`, `productionDataSession.ts`, `serverPlayoutStore.ts`, `storePart.ts` |

Mutation checks on the data session (each local, never committed): `if (dataKey) return` in place
of `dataKey !== null` fails "dataKey undefined: while the key is being read nothing dispatches";
removing the gate fails the same test; removing the `alive` check in `dispatch` fails the dispose
test.

## Matrix rows 2 and 7

| Item | Command | Result |
| --- | --- | --- |
| Row 2 and 7 local targeted (offline) | `npm run test:e2e -- e2e/playout-cues.spec.ts e2e/hosted-control.spec.ts e2e/playout-drills.spec.ts e2e/production-data.spec.ts e2e/playout-air-contract.spec.ts` (queue, 12-minute cap) | 71 passed on `b12dd74` (j-0005); also 71 on `123b514` and `ac3660f`, which shows this selection does not see the lifetime defect below |
| Row 2 Node | `node --test scripts/live-cue.test.mjs scripts/cue-items.test.mjs scripts/store-part.test.mjs scripts/playout-session.test.mjs` | 20 passed |
| Row 7 Node | `node --test scripts/production-data-session.test.mjs` | 12 passed (dataKey gate, both roads, other tab, mode change, older tree, dispose); 32 across the five files |
| Configured dispatch, rows 2 and 7 at once | `configured-suite.yml` on the branch | [run 39553817610](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39553817610), `headSha` `b12dd74`. Attempt 1: 117 passed, 1 failed, 0 flaky. The failure was `configured/agent-access.spec.ts:757` on both attempts, at `npm error errno -122` (EDQUOT, the runner's disk quota) during its `npx` install, before any assertion. That spec has been quarantined on main since 2026-10-20 and this PR does not touch it. Attempt 2 (the one re-run): pending at this commit. The row items all passed: `hosted-control-recovery`, `playout-both-roads`, `command-sequence`, `production-data-key`, `production-data-key-dispatch`, `hosted-control-profile`. |
| The walk that guards the lifetime defect | the same workflow on `ac3660f` (before the fix) | [run 39552893622](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39552893622): `production-data-key-dispatch.spec.ts:38` failed on both attempts at line 130 (`toHaveValue('3')`, received `"2"`). The feed's patch after the key resolved never reached the page, because the log follower held the disposed session. 116 passed, 1 flaky (`late-send-abandoned`, quarantined on main). |
| Assessment A | a fresh read-only `/so` session (`.agent-workflows/so.md`) | `ac3660f`: AGREE WITH CORRECTIONS, with one blocking finding (F1: under StrictMode the log follower kept a disposed session). `b12dd74`: AGREE WITH CORRECTIONS. F1 resolved; the remaining corrections were evidence wording, the placeholders and naming the departures in the PR, all done here. |
| `/check` | review delegated (8 findings: StrictMode lifetime, no-op writes re-rendering, a note lost after a mode change and the ownership read fixed; dispatch timing kept as a decision; 3 pre-existing, one filed as #1572); simplify delegated, 4 angles (dispatch takes the rendered resolve again, API types by `typeof`, one re-export statement, the mode's stop); verify inline | pass |
| depcruise | `npm run depcruise` | no violations (1342 modules); config unchanged |
| gates | `node scripts/gates.mjs run --changed origin/main` | exit 0 |
| AC-8 | `git diff --name-only origin/main...HEAD -- src` | the nine allowed files listed above |
| e2e mapping | `node scripts/e2e-affected.mjs --list --files <new module>` | `liveCue.ts`/`cueItems.ts` 24 specs (the `hostedControl.ts` covers set plus playout-drills, playout-folders, rundown-timing); `productionDataSession.ts` 53, including `production-data` and `playout-air-contract`; comment lines only, no assertion or selector changed |
| PR CI | `ci.yml` on `579929e` (same code as `b12dd74`) | attempt 1: `rundown-history.spec.ts:267` failed (an undo key dropped). That spec failed and then passed on main's CI at the base `304a440` (run 39549063877) and is quarantined there; it blocked here only because this PR adds a covers line to it. Locally it passed 48 of 48 with `--repeat-each 3`. Attempt 2: E2E green |

## Before and after

A throwaway walk (not committed): two scoreboards bound to one value on the Data tab, both taken,
two ± presses on the bound field. Screenshots of the Data tab and the playout surface on `main`
(`304a440a1`) and on the candidate; looked at, not committed. The two pictures match: both scoreboards read 2 after two presses, PROGRAM and the bound field agree, and the Data tab shows the value and both bindings.
