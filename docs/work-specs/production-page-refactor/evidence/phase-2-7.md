# Phase 2+7 (row 4): store part, session skeleton, the production-data session

Gating acceptance: AC-3, AC-6, AC-8 and the phase 2 and phase 7 rows of the §6 matrix, in full.
Built on `main` `304a440a121c51d650f78437496ffc2e1bd56d0a`. Phase 2's half was pushed as its own
checkpoint commit (`88701bd`). Candidate code sha: `CANDIDATE`; commits after it touch only this
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

RESULTS

## Before and after

A throwaway walk (not committed): two scoreboards bound to one value on the Data tab, both taken,
two ± presses on the bound field. Screenshots of the Data tab and the playout surface on `main`
(`304a440a1`) and on the candidate; looked at, not committed. SHOTS
