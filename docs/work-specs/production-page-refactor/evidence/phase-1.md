# Phase 1 (row 3): safety net and baseline

Gating acceptance: AC-1, AC-15 and the phase 1 row of the §6 matrix. Built on `main`
`995272d56` (H0.1, #1561), then on `4c1ae76` (the S1 fix, #1564) and `5476ff687` (the S4 fix,
#1566). Candidate code sha: `a0682c7c55070d1163db73af9c633ba5507d256e`; commits after it touch
only this `evidence/` directory. No `src/` file in this phase's pull request.

## AC-15: the suspected defects

| | Decision | Evidence |
| --- | --- | --- |
| S1 lost increment on rapid bound presses | **Confirmed, fixed in #1564** (merged `4c1ae76`) | Local stack, `e2e/configured/playout-adjust-race.spec.ts`: on `995272d56` both walks end with the server tree at 3 where two presses from 2 owe 4 (two ⚡ Goals inside one held round trip; a Goal and a ± press on the same bound score). On the fix branch both end at 4. The fix makes a press moving a bound field wait for the one before it on its graphic (bounded by a send's window plus an attempt) and count from the newest tree. |
| S2 a graphic Take waits on the draft save with no head start | **Characterised and retained** | `e2e/playout-air-contract.spec.ts` "S2": SPACE from a ticked checkbox in the cue editor (the press that does not blur the editor, like a panel key), with IndexedDB writes held: PROGRAM's `data-plays` and the chip do not move for 800 ms; when the write lands the Take airs, once. A click or a key from outside the editor blurs it first, which saves the draft and closes the edit group, so those presses do not wait. The server cue's 250 ms race (`serverVerb`) is unchanged and not walked offline, since no offline press reaches it with a draft open. |
| S3 two folder Take or step presses inside the save wait both run | **Refuted** | A held folder has no cue editor (`selectedCue` is null while a folder row is held), and holding the folder saves the draft and closes the edit group (`selectFolder`), so `flushDraft` and `closeGroup` in `takeFolder`/`stepFolder` resolve in microtasks and the first press registers its run before the next key event is handled. `e2e/playout-air-contract.spec.ts` "S3": an edit still saving on a slow disk, the folder held, two SPACE keydowns one task apart: the fake Bridge hears `take 2-10 VT` once and PROGRAM plays once. Fault injection: a 300 ms wait added inside that window makes the same walk fail with `["take 2-10 VT", "take 2-10 VT"]`, so the walk catches the defect if the window ever opens. |
| S4 (new) the next production inherits the last one's live map | **Confirmed, fixed in #1566** | Found by `playout-switch-mid-flight`: after opening another production with the same graphic, its chip read "up, not live: ○ House Scorebug" while its PROGRAM had played nothing, with or without a Take still in flight (scratch walk with no hold, same result). The page stayed mounted across productions and its on-air state is keyed by graphic name. The fix keys the route's page by production id. With it the held and unheld switch walks pass. |

Related, outside this plan's fence: the hosted control page has the S1 defect too (local-stack
scratch walk: two Goals inside one round trip, score 3 from 2). Filed as #1567; the plan keeps
`HostedControlPage.tsx` unchanged (owner decision 1.1.1).

## AC-1: what exists

- `e2e/playout-air-contract.spec.ts` (offline, 6 tests): S3, S2, type then Take inside the flush
  (one entrance, the typed value on PROGRAM), Update sends every field and `u` is the same press,
  `n` steps the quiz and does nothing where » Next is greyed, a row selected while the edit is
  still saving and the first cue taken (its typed value airs).
- `e2e/configured/playout-adjust-race.spec.ts` (2), `playout-resolve-race.spec.ts` (1),
  `playout-switch-mid-flight.spec.ts` (1), `production-data-key-dispatch.spec.ts` (1);
  `expected-run.json` `minTests` 105 to 110.
- `scripts/command-roads.test.mjs` (9): `withOid`, `mintOid`, `oidOf`, `createAppliedOnce`
  (both delivery orders, id-less commands, the 400-id bound), `readCommandFrame`.
- `e2e/dashboard-operator-walk.spec.ts` carries `// covers:` lines; a change to
  `ProductionPage.tsx` now selects 47 specs, both phase 1 offline specs among them.
- The inventory is spec §5.3; its facts reconciled for this phase: the floor is 105 before this
  phase (110 after), five allowed skips, and the quarantine is as `e2e/quarantine.json` holds it.

Mutation checks (each patch local, never committed, one at a time):

| Guard | Patch | Result |
| --- | --- | --- |
| resolve seed (`liveCueMoves`) | inverted | `playout-resolve-race` fails: chip "nothing on air" after the stale answer |
| published dispatch (`dataKey !== null`) | removed | `production-data-key-dispatch` fails: 16 update rows of the page's own after the release |
| published dispatch, the `undefined` half | `if (dataKey) return` | passes: a published page holds an empty tree until its key and the server's tree are read, so the held window has nothing to send. The walk pins the window by its outcome. |
| folder run registration | 300 ms window injected | `playout-air-contract` S3 fails with two takes |
| S1 (main's code) | none | `playout-adjust-race` fails 3 for 4, twice |

A first version of the resolve walk held the request rather than the answer and passed with the
guard inverted (the read then reached the server after the Take); the committed walk holds the
answer.

## Matrix row 1

| Item | Command | Result |
| --- | --- | --- |
| Local targeted | `npx playwright test e2e/dashboard-operator-walk.spec.ts e2e/playout-air-contract.spec.ts` (queue j-0027), then the contract spec again after the review fixes (j-0030) | 8 passed; 6 passed |
| Node | `node --test scripts/command-roads.test.mjs` | 9 passed |
| The gate's test | `node --test scripts/gates.test.mjs scripts/check-file-budgets.test.mjs` | 18 passed. D8 withdrew the size gate, so there is no new gate; this runs the existing gate and budget tests the matrix line once named. |
| Configured, local stack | `npx playwright test --config=playwright.live.config.ts` on the four new specs (Supabase CLI 2.111.0, `supabase start -x studio,edge-runtime`) | 5 passed on `a0682c7` (queue j-0032) |
| Configured dispatch | `configured-suite.yml` on `claude/plan-production-page-p3-build` | [run 39540143070](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39540143070), `headSha` `a0682c7c55070d1163db73af9c633ba5507d256e`: success, 118 passed, 0 failed, 0 flaky, 3 skipped (`bridge-real-server` twice and `connector-grants`, all on the allowlist); floor 110 met. An earlier dispatch on `22f9c07` (run 39540010785) was cancelled: that commit did not parse. |
| Assessment | none for phase 1 | - |
| Perf | laptop helper, two baselines on this merge's sha | not run here (non-gating, owner list) |
| `/check` | review delegated (10 findings on the specs and this file, 9 fixed: holds released by the walk, cleanup in `afterEach`, waits on what the page shows, value-level reads, the save held open in the type-then-Take walk; the tenth was this file's placeholders, filled here); simplify inline, nothing to change; verify inline | pass |
| depcruise | `npm run depcruise` | no violations (1336 modules) |
| gates | `node scripts/gates.mjs run --changed origin/main` | exit 0, the new Node test among them |
| AC-8 | `git diff --name-only origin/main...HEAD -- src` | empty |

Not checked here: the panel snapshot's `allowed` map against the bar's disabled states (§5.3
names it "read through the existing panel dialog"). Offline the dialog shows only "Publish this
production once" and no snapshot, so it cannot be read there; `allowed` is already asserted per
state by `e2e/configured/panel-production-page.spec.ts` (take, out, all-out, pause), and phase 12
gives the rule its Node test (`verbView`).
