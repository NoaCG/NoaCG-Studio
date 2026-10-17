# Production page refactor: a thin screen over Node-tested playout modules

Baseline: main `70fad3a94`, 2026-10-11; every line number below is of that revision. Authority:
owner, 2026-10-11 (see `work.json`). Plan for `/plan-run production-page`: fourteen refactor
phases, each built by one session and checked by another on `main`, and the content continuation
C0-C7 of `docs/work-specs/data-sources/spec.md`. The run order reconciled on 2026-10-17 (see
"Run order") runs refactor phases 1, 2+7 and 13a in this window with the content phases, and the
other refactor phases in a later window; the owner has not yet agreed that order. Replaces
the phase map of
[issue #766](https://github.com/NoaCG/NoaCG-Studio/issues/766) (its phases 0-2 are done; its old
phase 3 is phase 4 here, phase 4 is phase 3, phase 5 is phase 13).

## Verdict

Do it, as fourteen small sequential phases, each independently releasable and revertible, the safety
net first and the on-air ownership moves (liveCue, then the draft) late and alone. The playout
system works and stays: its wire, formats and operator behaviour do not change. What changes is
where the rules live and how they are proved: the on-air rules run and are tested in Node with
controlled clocks and held answers, the page holds screen state and rendering, one owner holds
liveCue, and a compiled rule sends new playout behaviour to `src/control/`. Not promised: that this
makes the next show safer by itself. It makes regressions cheaper to find and changes smaller to
review.

Biggest risk: a verb reading a stale selection, draft or bound value against a fresh live map
while an owner moves, which airs the wrong cue or value and shows nothing on screen. Second: the
published command path is proved only by the configured suite, which is not a pull request check.
Both are addressed by the contracts in §4, the pre-merge configured run in §6 and the stop rules
in §8.

## Why

`src/components/home/ProductionPage.tsx` is 5,676 lines: imports at 1-305, the component at
370-5,394, `ProductionShell` at 5,398-5,676; 107 imports, 23 `useState(`, 31 `useEffect(`, 28
`useCallback(`, 23 `useMemo(`, 51 lines naming `useRef`. It was 2,430 lines on 2026-08-20; three
extraction phases moved about 1,100 lines out and it still more than doubled: 246 commits since it
was created on 2026-08-02, 88 pull requests landed on `main` since 2026-08-12 changed it, most of
them live-show fixes. Every such fix lands in one scope that only a browser can test, two agents
cannot work in it at once, and the raced-send class of defect (`liveCueMoves`, 600-624) is found
on staging rather than in a test. About fifteen of the refs exist only so that long-lived callbacks
(the log follower 1685-1869, `applyProgram` 955, `restoreProgram` 1896, `sendVerb` 2160, `cueView`
1654) read the newest value without re-subscribing.

## Goal

The page becomes a thin screen over Node-tested playout modules in `src/control/`, with operator
behaviour, keyboard controls, published command rows, durable formats and output behaviour
unchanged, and every moved rule pinned by a test that existed or was written before the move.

## Non-goals

Backend migrations; protocol changes (`control_send_*`, `control_tail*`, the Bridge API); the
hosted page migration; UI redesign; a general playout framework; performance features beyond
keeping today's numbers; fixing behaviour inside an extraction (§1.3).

## 1. Decisions

### 1.1 Owner decisions (2026-10-11)

1. **HostedControlPage** is designed for, not migrated: the core takes its capabilities (Bridge,
   local data tree, PROGRAM monitor, folders) as optional inputs so the hosted page could adopt it
   in its own later spec. `src/components/HostedControlPage.tsx` is unchanged by this plan and
   keeps its own `liveCue` (176).
2. **`liveCue` moves once, late, into a plain session store under `src/control/`** (one owner
   within ProductionPage and its extracted modules); `selectedCueId` stays React state in the
   page; no general framework is built. This supersedes docs/CLIP_PLAYBACK_PLAN.md §10 (571-573)
   and §17.2 (1067-1068) for `liveCue` only; `selectedCueId` stays where those lines put it.

### 1.2 Derived decisions (revertible; each says how)

- **D1 Store primitive.** `storePart<T>()` is lifted verbatim from
  `src/control/serverPlayoutStore.ts:39-57` into `src/control/storePart.ts` and re-exported from
  its old home; the React adapter is `src/components/home/useStorePart.ts`
  (`useSyncExternalStore(part.subscribe, part.get)`, the idiom `ClipClock` already uses). Revert:
  inline both.
- **D2 Session identity.** `createPlayoutSession(productionId)`; the key is the production id
  only. First publish is a mode change (`session.published(slug)`), as today's effects keyed on
  `hostedSlug` are (1446, 1496, 1685): drafts and pending saves (keyed on `[id]`, 1421), folder
  runs (a ref, 511), send debts (keyed on `showId`, 835) and the arm engine survive it as they do
  today; the rehearsal clear (2723-2729) stays in the publish flow. A route change to another
  production disposes the session and creates a new one (§3). Account changes do not re-key;
  `accountBlocks` (2396-2407) re-checks at press. Revert: key on `${id}|${slug}`.
- **D3 Command rules** (§4.1) reuse today's mechanisms: `liveCueMoves` (620-624, 1693-1723) for
  the resolve seed, `leftAlone(sent)` (`hostedControl.ts:1391`) for the marker, and
  `createAppliedOnce` (`commandRoads.ts:193`) for duplicate delivery. No new per-graphic
  generation counter: the seq protocol orders presses server-side and reports `skipped` and
  `superseded`, and a second counter would be a second opinion.
- **D4 Cross-part writes** are one synchronous `session.apply(fold)`, parts set in a fixed order
  (air, aired, log), as `serverPlayout.apply` sets timing then ownership
  (`serverPlayoutStore.ts:73-77`). No transaction layer.
- **D5 Browser lifecycle in adapters**, injected: `now`, `wallClock`, `setTimeout`,
  `clearTimeout`, `setInterval`, `clearInterval`, `onVisible`, `onStorage`, `onPageHide`,
  `loadSettings`, `urls`. The page passes browser ones; Node tests pass fakes.
- **D6 Hooks under `components/home/`** for publish/slot/links and rundown authoring (precedent
  `usePublishDrift.ts`, `useRundownHistory.ts`); they orchestrate dialogs, sign-in and durable
  writes and decide nothing about air.
- **D7 No new ARCHITECTURE §3 edge.** New control modules runtime-import only pure `.ts` modules
  under `control/` and `model/` (the `serverPlayout.ts` convention) and type-only imports
  otherwise; browser-only modules (`hostedControl.ts`, `playoutLink.ts`, `productionDataApi.ts`,
  the arm RPC, `model/shows.ts` writes) arrive through an `io` argument. `templates/picture` and
  `export/outputEmbed` stay in the components hooks.
- **D8 No size gate (owner, 2026-10-17).** The page gets no line budget: "drop the page size limit
  and the line-count half of AC-11; keep the compiled rule that playout behaviour lands in
  src/control/." It follows his codebase-health ruling (no new hard ceiling or blocking size
  policy). Regrowth is guarded by where code goes (AC-11's compiled rule), not by a number. The
  earlier design, a `scripts/check-file-budgets.mjs` entry for `ProductionPage.tsx` lowered by
  each shrinking phase, is withdrawn; the wizard's existing budgets are not this plan's.
- **D9 Never weaken.** A phase pull request may change a selector in a characterisation spec,
  never an assertion; the pre-merge assessor diffs the e2e files for that.
- **D10 Secondary guardrails.** Line, effect and ref counts are watched, and the design is not
  bent to them.
- **D11 Defects apart from extraction.** A suspected existing defect is reproduced first; a
  confirmed one is fixed in its own pull request, landed before the safety-net test that covers
  it is declared green; the affected baseline evidence is refreshed after the fix.
- **D12 Render boundary** (§7). The page subscribes to a memoised `unsent` selector over the
  draft part (a joined field list compared by value), never to the draft itself, so it cannot
  carry every changed value. Every consumer that needs the values subscribes to the draft part:
  `CueEditor` (the boxes), `CueRundown` rows (labels through `cueView`), and `PlayoutMonitors`
  for the preview's settle data (today the page computes `settleData` from
  `cueView(previewCue).values` at 1990-1992; after phase 13 the monitor takes `previewCue` and the
  session and derives it through `useStorePart(session.draft)`). Revert: a `VerbBar.tsx` child
  and the page subscribing to the draft.

### 1.3 Suspected existing defects (phase 1 reproduces each; decided on evidence)

- **S1 Lost increment on rapid bound presses.** `fireEvent` reads the adjust base from
  `resolvedRef` after the save wait (3881, 3893-3899) and applies `patchBoundValues(tree)` only
  after the send resolves (3913); a second press during the round trip computes the same
  absolute value. Reproduce in the configured suite (two ⚡ adjust presses while
  `control_send_seq` is held). Confirmed: fixed in its own pull request (count from the
  optimistic tree, or serialise presses per graphic), landed before phase 1's test is declared
  green. Refuted: the test records today's behaviour.
- **S2 Graphic Take waits on the draft save without the 250 ms head start a native cue has**
  (`takeGraphicCue` 2963 against `serverVerb` 2878-2879). Characterised (a test records the wait)
  and retained as existing behaviour; not changed by this plan.
- **S3 Two folder Take (or step) presses inside the save wait both run.** The `folderRuns.has`
  check (3549, 3637) precedes `await flushDraft(); await history.closeGroup()` (3550, 3651), and
  the run registers only after (3551, 3652). Reproduce offline with the fake Bridge holding the
  first action and a durable write in flight. Confirmed: own pull request (register before the
  await); refuted: recorded.

## 2. Module boundaries

Each row is justified by a maintenance or testing benefit, not by size. ProductionPage keeps:
selection and range state, the session hook, the wires, the derived view, the render. Required
for the testing benefit: phases 1, 2, 5, 7, 10, 11, 12, 13, 14. Maintenance-only and individually
droppable before a window is authorised: 3, 4, 6, 8, 9 (each later phase takes the callbacks it
needs from the page instead, see Phases). In the reconciled run order only 1, 2+7 and the
props-only half of 13 run in this window; 5, 10, 11, 12, the draft half of 13 and 14 keep their
testing benefit and wait for the later window ("Run order").

| Module | Responsibility | Owns | Runtime imports / injected IO | Interface | Benefit |
|---|---|---|---|---|---|
| `control/storePart.ts` | the part primitive | - | - / - | `storePart<T>()` | the proven primitive; part-level subscriptions |
| `components/home/useStorePart.ts` | React adapter | - | react / - | `useStorePart(part)` | one subscription idiom |
| `control/playoutSession.ts` | the store's lifetime and part registry | from phase 2: `key`, `alive`; later phases add parts | storePart / - | `createPlayoutSession(id)`, `apply(fold)`, `dispose()`, `alive()` | one object the wires and verbs hold; disposal in one place |
| `control/liveCue.ts` | the live map's pure folds | - | - / - | `withLiveCue`, `readLiveCue`, `leftAlone` (from `hostedControl.ts` 908-944, 1391; re-exported there) | Node-importable, which `hostedControl.ts` is not (§5.2) |
| `control/cueItems.ts` | what a Take, Out and All out send | - | liveCue / - | `takeCueItems`, `clearCueItems`, `clearAllCueBatches` (1596-1670; re-exported) | same |
| `control/takeBlockers.ts` | why a Take would not go | - | serverPlayout, serverState, playoutSlots / settings as a value | pure functions over `{cues, items, folders, places, ownership, settings, ability, casparOn}` (3344-3457) | refusal rules tested in Node; today e2e only |
| `control/serverVerbs.ts` | one server verb and its fold | - | serverPlayout, serverState, cuePlayback / `act`, `loadSettings`, `now`, `wake` | `runAndRecord(store, io, intent)` (2857-2945, with the Play-through move-off 2894-2906) | the last untested glue around the best-tested module |
| `control/bridgeWatch.ts` | the Bridge's five polls as one lifecycle | `bridge` part: status, outputSlot, serverFiles, slotSeenOurs, learntFacts | serverStatePoll, serverState, playoutSlots / `subscribeTargetStatus`, `readState`, `listLibrary`, `syncStudio`, `loadSettings`, timers, `onVisible` | `startBridgeWatch(session, io, adapters) -> stop()`, restart keys explicit (checkAgain, settingsRev, slotRev) (1134-1327) | one restart rule instead of five dependency arrays (the double-run note at 1141-1143) |
| `control/productionDataSession.ts` | the tree, its key, dispatch, the two write roads | `data` part: liveData, dataKey, treeRead, lastResolved | model/productionData / `fetchProductionData`, `patchProductionData`, `patchProductionDataBySlug`, `productionDataKey`, `loadLiveData`, `saveLiveData`, `onStorage` | `setLiveData`, `patchBoundValues`, `dispatch(resolved, send)`, `refresh()` (1429-1626, 2270-2285) | the dataKey gate pinned in Node |
| `control/cueArmEngine.ts` | the unpublished timed-cue engine | `arms` part | cueAuto / `send`, `cueView`, `liveCueOf`, `wallClock`, timers, `onVisible`, the arm wire when published | `onMarker`, `runDue`, `hold`, `manual`, `onProgramState`, `stop()` (535-564, 2303-2337, 2982-3098) | controlled-clock tests of due, missed, held, visibility |
| `control/folderPlayout.ts` | a folder's Take, Out, step, cancellation | `folders` part: folderSteps, takeMisses, runs, sending | serverPlayout, folderAir, folderStep, liveCue / `serverVerb`, `takeGraphic`, `send`, `liveCueOf`, `flush` | `take`, `out`, `step`, `stopAll(reason)` (3515-3674, 2954-2980) | the cancellation contract tested with held sends |
| `control/airState.ts` | pure folds over air state | - | liveCue, matchClockWire, commandRoads / - | `rememberAired` (806-828), `programItems` (907-994), `claimAndApply` (1013-1034), `seedFromResolve` (1723-1764, with the moves guard), `restoreItems` (1896-1921) | the raced-resolve, dedupe, seed and clock rules in Node |
| `control/sessionWire.ts` | resolve, seed, follow, stop | - | airState / `controlShowBySlug`, `hostedControlTail`, `followControlLog`, `controlOutputSeenAt`, `createCueArmWire`, timers | `startSessionWire(session, io, adapters) -> stop()` (1685-1869) | lifetime testable with a scripted wire |
| `control/graphicVerbs.ts` | the web-graphic verbs | - | cueItems, liveCue, airState, allOut / `sendControlVerbs`, `headsSay`, `headsStillOn`, `cueView`, `resolvedOf`, `flush` | `send`, `take`, `out`, `allOut`, `update`, `bump`, `next`, `event`, `snap` (2160-2258, 2960-3305, 3879-3935) | the §4 contracts tested with held and reordered answers |
| `control/verbDispatch.ts`, `control/verbView.ts` | key, button or panel press to action; the bar's and the panel's facts | - | spaceMode, folderStep, serverState / - | `decideVerb(key, press, view)`, `verbView(inputs)`, `panelSnapshot(view)` (4006-4162, 2756-2830, 3486-3513, 4173-4210) | greying and allowed rules in Node; `u` and `n` are never pressed in any spec today |
| `control/cueDraft.ts` | the typed-but-unsaved cue | `draft` part | - / `writeCue`, timers, `onPageHide`, `onVisible` | `edit`, `flush`, `cancel`, `view(cue)`, `label(cueId)`, `unsent(graphic, aired)` (1329-1359, 1654-1671, 2831-2846) | type-then-Take right by construction; typing stops re-rendering the page |
| `components/home/ProductionShell.tsx` | header and body chrome | - | react | the current props (5398-5456) | a file move; the header is edited often |
| `components/home/CueActions.tsx` | the ⚡ block and ± live numbers | arranging, folded | react | props (4236-4410, 3945-3988); derives nothing | the most feedback-edited UI block |
| `components/home/CueEditor.tsx` | the cue editor | advancedFor, foldedFields, lastLoaded, loadSide | react, useStorePart(draft) | props (4934-5271, 3749-3866) | the largest JSX block; subscribes to the draft |
| `components/home/useProductionPublish.ts` | publish, slot, links, header facts | busy, publishing, copied, nameDraft, nameNote, replaceAsk, slotBusy, statusOpen, linksOpen | react; hostedControl, playoutLink, outputEmbed | handlers, `casparFacts`, `headerAction`; takes `onFirstPublish(rehearsed)` (427-445, 2387-2456, 2565-2755, 4412-4541) | 450 lines of dialog and sign-in orchestration leave the air surface |
| `components/home/useRundownAuthoring.ts` | rundown edits, clipboard, pictures, refresh | clip, rangeIds, rangeEnd, rundownNote, refreshing | react; model/shows, templates/picture, history | takes `offAir(graphic)`, `serverOut(cue)` (1360-1396, 2472-2552, 3190-3220, 3676-3747, 4049-4103) | 350 lines that never air leave the air surface |

Not made: a separate verb bar component (120 lines of JSX reading fifteen derived values would
be a props interface, not a benefit) and a separate panel snapshot module (part of `verbView.ts`).

## 3. Session lifetime

- **Key and modes.** `createPlayoutSession(productionId)`; `published(slug)` starts the wire and
  re-seeds the data tree; `dispose()` runs on a production change (the page stays mounted,
  1694-1696).
- **What survives first publish, as today:** the draft and its pending save (1421), folder runs
  (511), send debts (835), the Bridge watch (keyed on the Bridge target, 1148), the arm engine
  unless the published server keeps no arms (2335-2337). What changes: the wire starts (1685),
  the data tree re-seeds from the server (1442-1446), the rehearsal markers are cleared by the
  publish flow (2723-2729).
- **Disposal (production change):** stop the wire (unsubscribe, the 30 s seen timer, the arm
  wire: 1860-1868), the Bridge watch (1148-1152, 1217-1220, 1322-1326), the arm timer and its
  visibility listener (2328-2331), the draft timer and the synchronous `retainClosingDraft`
  (1413-1419); set every folder run's stop flag and clear the map; flip `alive` so late folds are
  no-ops and verbs refuse to send. In-flight RPCs are not aborted (they are not today); their
  answers are ignored for this page's state and their external effect stands (§4.1 R3).
- **Consistency:** one synchronous `session.apply(fold)` per command step, parts in a fixed
  order; the panel hears timing after the whole fold as today (2297-2300).
- **Adapters** as in D5; Node tests pass a fake clock and timers (the cue-auto tests already use
  stand-ins, `scripts/cue-auto.test.mjs` 160-496).
- **Preparation for hosted reuse:** `createPlayoutSession(id, { bridge?, dataTree?, monitor?,
  folders? })`; a Node test constructs one with none. This is preparation, not parity with
  HostedControlPage, whose eight semantic forks (snap's data source, event values source, timed
  marker placement, clock stamping, the stale-resolve guard, boot replay, the fast-events set,
  the editor target switch) are recorded here for the follow-up spec.

## 4. Command contracts (reconciled against the code)

### 4.1 Rules

- **R1 Press capture.** The verb records the target and intent at the press from the render
  that handled it: `{verb, cueId, graphic, label, options}`; a server verb also runs its
  blocker check at the press (2868-2871).
- **R2 Read after the wait.** After `flushDraft` and `closeGroup`, the verb reads what must be
  newest: the draft through `cueView` (1654), bound values through `resolved` (1624), the live
  map through `liveCueRef`, and server ownership through the store at the moment the action is
  built (`serverPlayout.ownership.get().onAir[item.id]` at 2914, so Out, Update and pause go
  where the take went even if a reading moved the store during the wait); a server verb reads
  settings and derives `slotNow` after the wait too (2880, 2893). Captured at press and never
  re-read: the cue, the graphic, the verb and its options, and the blocker verdict.
- **R3 Three distinct cases.** A stale local update is ignored: the boot resolve seeds only if
  `liveCueMoves` did not move while it was in flight, and a fold on a disposed session is a
  no-op. No further sends after disposal: verbs check `session.alive()` before `send`, folder
  runs read their stop flag between members, the arm engine's timer is cleared. A command
  accepted externally stands: ignoring its answer does not cancel it; the next resolve of that
  production learns it from the server's `live_cue`. The marker is set from an answer only if
  the graphic was left alone since the press (`leftAlone`).
- **R4 One command path.** Commands reach the monitor and the wire only through `sendVerb` and
  `sendControlVerbs` (2160-2249); no second sender exists at any phase.

### 4.2 Per command (today's order; kept)

| Command | At press | Waits | After the wait | Answer handling |
|---|---|---|---|---|
| Take graphic (2960) | cue id, graphic name via `cueGraphicName` (render map), label, `direct` | `flushDraft`; `closeGroup` (unbounded, S2) | values = `withBoundValues(graphic, cueView(cue).values)` (2966); the arm marker added in `sendVerb` from `armSpecRef` (2204) | published: `sendControlVerbs` applies locally first (`applyHere`), then the RPC; marker set unless `leftAlone`; `clearMisses` |
| Take server (2857) | cue, verb, options; `takeBlockerFor` or `directBlocker` (render) | `race(flush + closeGroup, 250 ms)` (2878-2879) | `settings = loadPlayoutSettings()` (2880); `through`, `run`, `chain` from the press render's `places`, `cues`, `playoutItems`, `folders` (2881-2891); `slotNow` (2893); a Play-through folder's stray copies taken off first from the store's ownership (2897-2906); `live` from the store (2914); values via `cueView` | accepted actions folded with `applyAccepted` (2923-2940); the poll woken (2943); a refused take marks nothing |
| Re-take | as Take on a live cue (4131) | as Take | as Take; a moved slot's old copy goes off first (742-754) | as Take |
| Out (3169) | `selectedGraphic`, `selectedLayerLive` (render) | none | - | marker cleared unless `leftAlone` |
| All out (3229) | stop flags on every folder run (3232, synchronous); `livePlayoutLayers`, `liveLayers` (render); `headsSay` (fresh) | server outs each awaited (cut), `outUnnamed`, then one graphics send | `headsStillOn` within 5 s | a graphic pressed again stands; `clearing` cleared in `finally` |
| Update (3113) | `editingCue`, `selectedGraphic`, `editingIsLive` (render) | flush; closeGroup | the full set = bound over `cueView(editingCue).values` | none on the marker; `rememberAired` merges on apply |
| ± bump (3144) | `editingCue`, graphic, field, delta (render) | flush; closeGroup (3146) | bound path from the render's `bindings` (3147); bound: base from `resolvedRef` (fresh), `patchBoundValues` optimistic on `liveDataRef`; unbound: base from the render's `airedData` (3154), cue written, partial update sent | bound: the PATCH answer replaces the tree; unbound: none |
| Next (3160) | graphic, layer-live (render) | none | - | none |
| ⚡ event (3879) | button, graphic, layer-live, `bound` map (render) | flush; closeGroup (3881) | `airValues()` = `cueView(airCue)` (airCue from the render); moved keys from `resolvedRef` (fresh) or the render's `airedData`; `boundPressReady` (fresh) | tree patched only if sent and not skipped or superseded (3913); the S1 window lies between press and patch |
| Snap (3922) | graphic, group, state | flush; closeGroup | `airValues()` | none |
| Folder Take (3542) | folder, `members` (render), `takeBlockerFor(folder)` (render); `has(run)` check (3549) | flush; closeGroup (3550) | run registered (3551; the S3 window precedes it); Play-through: one server Take; All together: `togetherPlan` from render inputs, `runTogether` with stop checks | a member landing after stop is taken off (`offLate`) |
| Folder Out (3598) | stop flag set synchronously (3600); steps reset | per member | `cueOnAirNow` from the store and `liveCueRef` (3584) | notes joined |
| Folder step (3636) | `has(run)` (3637), step from the store and `folderSteps` (render), `stepBlocker` | flush; closeGroup (3651) | run registered (3652); off members, then `takeCue(next)` | after stop: taken back off, step reset |
| Timed fire (2995) | graphic, arm | none before the send | `liveCueRef` (fresh), `cues` of the latest render (3036 reassigns every render), `cueView(next)` | marker moves unless `leftAlone` |
| Data dispatch (2270) | the diff of `resolved` against `lastResolved` | none | - | none |
| Panel and keyboard (4006, 4173) | the render's view; `take-cue` re-checks `cueOnAirNow` (fresh) | - | - | a refused press is a log note (4214) |

Each row becomes a Node test in phases 10-12 with a scripted `send` or `act` that answers late,
out of order, or after `dispose()`.

## 5. Safety net

### 5.1 Environments

The offline config pins the backend off (`playwright.config.ts` webServer env;
`e2e/_offline-guard.ts`), so published resolve, send and follow paths do not run there (the
`src/backend/config.ts` route trick of `e2e/publish-output-setup.spec.ts:25-27` runs them against
a fake whose RPCs answer null; it is not used for new wire scenarios). Published scenarios go in
`e2e/configured/` against the local Supabase stack (`playwright.live.config.ts`), seeded with
`publishProduction` (`e2e/_publish.ts:8`), holding the real RPC with `page.route` on
`**/rest/v1/rpc/control_send_seq` as `e2e/configured/take-behind-out.spec.ts:59-68` does, and
asserting the held request was seen (a counter in the route handler). Unpublished scenarios go
offline with the fake Bridge (`e2e/_fakeBridge.ts`: `gate` 96, `stateGate` 83, `refuse` 94,
`restart` 103) and `page.clock` (as `e2e/rundown-timing.spec.ts:57` uses it). A configured spec
added raises `e2e/configured/expected-run.json` `minTests` in the same pull request.

### 5.2 Node importability (verified on Node 24.13)

`commandRoads.ts`, `allOut.ts`, `cueAuto.ts`, `serverPlayout.ts`, `serverState.ts`,
`folderAir.ts`, `folderStep.ts`, `panelFeedback.ts` and `model/productionData.ts` import.
`hostedControl.ts` fails (`../model/outputSetup`, extensionless), `productionDataApi.ts` fails
(`../backend/supabase`), `controlModel.ts` fails (`../blocks/animData`). The convention for pure
modules is `.ts` on runtime imports and type-only imports for the rest (the `serverPlayout.ts`
header, `cueArmWire.ts:39`). Therefore phase 1 tests what imports today; phase 2 extracts
`liveCue.ts` and `cueItems.ts`; `productionDataApi.ts` stays browser-side (pinned by
production-data 538 and 604 and the configured data-key specs); `controlModel.canAdvance` keeps
its e2e coverage (`live-actions-first.spec.ts:152`, `hosted-control.spec.ts:737`) and gets no
Node test; `matchClockWire.ts` has no Node test today (its readers are in-page imports in
`productions.spec.ts` 1278-1481) and gets one in phase 11 through `airState.programItems`.

### 5.3 Inventory

Reconciled against `origin/main` on 2026-10-11: `e2e/quarantine.json` holds
`e2e/configured/late-send-abandoned.spec.ts` and `e2e/configured/dashboard-hosted-walk.spec.ts`;
`e2e/configured/production-data-key.spec.ts` was released that day and counts again.
`e2e/configured/expected-run.json`: floor 96 tests, four allowed skips including
`bridge-real-server.spec.ts`. `skipOldEditor()` disables nine production-data tests, two
productions tests, one production-controls test and one hosted-control test; they are not
coverage. A change to only `ProductionPage.tsx` selects 43 specs through `scripts/e2e-affected.mjs`;
`e2e/dashboard-operator-walk.spec.ts` declares `covers: none` and is not among them although it
presses Take, Update, Next and Out.

Coverage by behaviour (e = `e2e/`, c = `e2e/configured/`, Node = `scripts/*.test.mjs`):

| Behaviour (page code) | Proved today | Gap |
|---|---|---|
| Take (3100, 2960, 2160) | e productions 684/903, production-controls 58, playout-drills 77, publish-output-setup 230/306, playout-cues 269/709/1032; c output-cold-boot 36, relay-cold-boot 43, playout-both-roads 112, take-behind-out 29; Node seq-send, failed-sends, cue-auto | the page's own Take has no Node test; `takeCueItems`, `withLiveCue`, `leftAlone` untested in Node |
| Out (3169, 3184) | e productions 684/787/142, playout-cues 435, playout-clock 420, playout-folders 616/1314; c take-behind-out, command-sequence 187; Node server-playout 94, folder-playout 395 | `clearCueItems`, `leftAlone` untested in Node |
| All out (3229-3298) | e playout-cues 838, playout-folders 683/1286/1387/1584, publish-output-setup 162/359; c all-out-from-heads 22, take-behind-out, command-sequence 235; Node all-out, folder-playout 289 | `headsSay`, `headsStillOn`, `clearAllCueBatches` untested in Node |
| Update and ± (3113, 3144) | e quiz-live-consistency 75/164, production-controls 129/398, playout-drills 153/178; c quiz-output 25, scorebug-output 43; Node production-data 154/295/315 | a ± press on a bound field on this page runs only in skipped tests |
| Next (3160) | e live-actions-first 152, playout-cues 709; Node seq-send 140 | nothing configured presses Next; `canAdvance` has no Node test |
| Re-take (4131, 742-754) | e playout-drills 77, playout-cues 838/1124; c playout-both-roads, scorebug-output; Node server-playout 117/143, folder-playout 190/401 | a graphic re-take has no Node test |
| Folders (3515-3674) | e playout-folders (51 tests; held takes at 616, 1365, 1387, 1584 assert the fake Bridge action log); Node folder-playout (20), show-folders, rundown-rows | the page's run orchestration (stop flags, `sendingFolders`, `offLate`) is browser-only; no published folder Take anywhere |
| Server clips (2857-2952, 3299) | e playout-cues (21), playout-clock (15), playout-sequence, bridge-connect; Node server-playout (38), studio-reliability | best covered; a real CasparCG is never used in CI |
| Publish (2640-2755) | e publish-output-setup 77/115/134/230/359, playout-feedback-health 12; c publish-guard 165/263, production-links 25, playout-status 25, live-prepare 33; Node readiness 250/271/281 | `publishControlShow` and the `PublishBehind` retry are proved only after landing |
| Data dispatch (1429-1626, 2270-2285) | e production-data 24/149/199/538/604/655; c production-data-key 47, hosted-control-profile 133; Node production-data (25) | `productionDataApi.ts` untested in Node; a delayed key is untested |
| Hardware panel (2290, 4173-4215) | c panel-production-page 25/145, panel-lease 19, panel-relay; Node panel-feedback (14) | `panelRelay.ts` has no Node test; the snapshot is proved only after landing |
| Keyboard (`playoutKeys.ts`, 5463-5465) | e productions 787, playout-drills 77/123, playout-folders 198/365/401/1340, playout-clock 544, rundown-timing 107; Node studio-reliability 25/79 | `u` and `n` are never pressed |
| Status readouts | e bridge-connect, playout-feedback-health, studio-feedback; c playout-status, live-ready, live-health; Node playout-status (7) | `prepareBridge.ts` has no Node test |
| Rundown edits and history (1342, 2831, 3679-3747) | e rundown-history (16), rundown-history-storage (7), production-persistence 39/77/88, cross-tab 42/103; c teams 450/623; Node rundown-history (6), team-save (8), cue-clipboard | the hook's grouping is browser-only |
| Cloud sync (2198-2246, 1685-1869) | c command-sequence 136/187/235, late-commit-notice 67, playout-both-roads 112, follow-status-is-visible 24, output-realtime-floor 39; Node seq-send (18), seq-follow (25), log-follow (11), failed-sends (13) | `hostedControl.ts` and `commandRoads.ts` untested in Node; the local stack hides latency-shaped faults |
| `liveCue` and selection (480, 534, 621, 2776-2794) | e productions 903, production-controls 85, playout-cues 1032, rundown-timing 74, playout-folders 365/913/1061; c panel-production-page 25 | React state inside the page: no Node test can see it |

Critical behaviours and where each is proved; "reused" is unchanged:

| Behaviour | Existing (reused) | New: baseline characterisation (phase 1) | New: lifecycle (later phase) |
|---|---|---|---|
| type then Take at once; Update's full set | playout-drills 153/178; production-controls 129 | offline `e2e/playout-air-contract.spec.ts`: type then Take within the 300 ms flush, asserting PROGRAM `#f0` and `data-plays` moved by 1; Update: every field's text on PROGRAM | - |
| bound values override; rapid ± | production-data 604, 24 | configured `e2e/configured/playout-adjust-race.spec.ts`: two ⚡ adjust presses while `control_send_seq` is held; assert the held request count and the tree's final value through `control_tail` rows (S1) | - |
| published data: no local dispatch; the key resolves before any dispatch | production-data 538; configured production-data-key 47 (the key's presence and the server-owned tree) | configured `e2e/configured/production-data-key-dispatch.spec.ts` (a different behaviour: the key's read is held): publish, hold `productionDataKey`'s read, move the tree; assert through `control_tail` that the page appended no `update` row without `src` while the key was unresolved, and that the rows after the release carry `src` | Node: `productionDataSession.dispatch` with `dataKey === undefined` sends nothing (phase 7) |
| selection or draft change while a save or send is pending | production-persistence 77 | offline: select another row during the flush, then Take the first; assert the first cue's typed value on PROGRAM | - |
| the initial resolve after a newer Take | relay-cold-boot 43 (hosted tier, the scenario that found it) | configured `e2e/configured/playout-resolve-race.spec.ts`: hold `control_show_resolve` and `control_show_by_slug`, Take, release; assert the chip still names the taken cue and `data-plays` is 1; evidence that the guard inverted locally fails it | - |
| Take then Out or All out with delayed requests | take-behind-out 29, command-sequence 187/235 | none new | - |
| folder cancellation, partial acceptance, failed sends | playout-folders 616/1365/1387/1584, folder-playout Node, failed-sends Node, late-commit-notice 67 | offline: S3 | Node: `folderPlayout` with a scripted send after `stopAll` (phase 10) |
| duplicate delivery, reconnect, reload, boot replay | playout-both-roads 112, follow-status-is-visible 24, output-realtime-floor 39, output-cold-boot 36, hosted-control-recovery 66, playout-cues 1032 | Node `scripts/command-roads.test.mjs` (`createAppliedOnce`, `withOid`) | Node `airState.claimAndApply`, `seedFromResolve` (phase 11) |
| production change and disposal while work is pending | cross-tab 42/103, playout-nav 100 | configured `e2e/configured/playout-switch-mid-flight.spec.ts`: Take with `control_send_seq` held, navigate to another production, release; assert the other production's chip reads nothing on air, its PROGRAM `data-plays` is 0, and the first production's `control_tail` holds the play row (the command stood) | Node: `dispose()` mid-flight makes the fold a no-op and refuses the next send (phase 11) |
| timed cues, clocks, preview-against-air editing, panel and keyboard | rundown-timing 74/107, rundown-timing-recovery 78, cue-auto Node; production-controls 85; panel-production-page 25; productions 787, playout-drills 77 | offline: `u` and `n`; the panel snapshot's `allowed` map against the bar's disabled states, read through the existing panel dialog | Node `verbDispatch`, `verbView` (phase 12), `cueArmEngine` (phase 9) |
| one command on the controller and on a separate output | playout-both-roads 112, output-cold-boot 36, quiz-output 25, scorebug-output 43 | none new | - |

Phase-1 tests use only observables that exist today: PROGRAM `#f0`, `data-plays`, `data-renders`
on the page root, `live-cue-chip`, `cue-unsent`, the action log rows, `control_tail` rows, the
fake Bridge action log. Nothing in phase 1 reads an attribute, store or hook that a later phase
introduces. Rules from `e2e/AGENTS.md` apply: a guard fix is asserted backwards and
mutation-tested; a duplicate command is asserted as arithmetic; a race is fault-injected, never
repeated harder.

## 6. Verification matrix (one per phase; the builder follows it as written)

Local targeted specs run through the browser queue: `node scripts/e2e-runs.mjs --wait && npx
playwright test <files>`, the configured ones with `--config=playwright.live.config.ts` only
where a local stack exists, else dispatched. Node tests: `node --test <files>`. Configured
dispatch on the candidate ref: `gh workflow run configured-suite.yml --ref <branch>` (about 25
minutes; the run's JSON must meet `expected-run.json`, whose `minTests` the pull request raised
for every configured spec it adds, with nothing skipped outside the allowlist; a run that exits 0
with a new spec skipped is not a pass; record the run URL and its `headSha`).
Independent assessment: A = a fresh read-only session with the `/so` brief
(`.agent-workflows/so.md`) by `wave-row` (Opus, high); A+ = the same by `wave-row-deciding`
(Opus, xhigh). Every phase also runs `/check`, `npm run depcruise`, `node scripts/gates.mjs run
--changed origin/main` and AC-8's scope fence. Broad affected suites stay on GitHub Actions.

| Phase | Local targeted specs | Node | Configured dispatch | Assessment | Perf |
|---|---|---|---|---|---|
| 1 | playout-air-contract, dashboard-operator-walk | command-roads, the gate's test | yes (playout-adjust-race, playout-resolve-race, playout-switch-mid-flight, production-data-key-dispatch) | none | baseline, twice |
| 2 | playout-cues, hosted-control, playout-drills | live-cue, cue-items, store-part, playout-session (create, dispose) | yes (hosted-control-recovery, playout-both-roads, command-sequence: shared helpers) | A | - |
| 3 | production-controls, live-actions-first, playout-baseline | - | no | none | - |
| 4 | publish-output-setup, bridge-connect, playout-feedback-health | - | yes (publish-guard, production-links, playout-status, live-prepare) | A | - |
| 5 | playout-cues, playout-clock, playout-sequence, playout-folders | take-blockers, server-verbs (the server-playout fakes) | no | A | - |
| 6 | bridge-connect, playout-clock, studio-evening-reliability | bridge-watch (fake io, fake clock; start, restart, stop) | no | A | - |
| 7 | production-data, playout-air-contract | production-data-session (dataKey gate, both roads, dispose) | yes (production-data-key, production-data-key-dispatch, hosted-control-profile) | A | - |
| 8 | rundown-history, rundown-history-storage, playout-folders, cross-tab, productions | - | no | none | - |
| 9 | rundown-timing | cue-arm-engine (fake clock, visibility, stop) | yes (rundown-timing-recovery) | A | - |
| 10 | playout-folders | folder-playout extended (held send, stopAll, dispose) | yes (take-behind-out, command-sequence) | A | - |
| 11 | every playout and production offline spec named in §5.3 | air-state, playout-session (parts, apply order, dispose), session-wire (scripted wire; production switch mid-flight) | yes (whole suite) | A+ | repeat |
| 12 | as 11 plus panel-production-page | graphic-verbs (every §4.2 row), verb-dispatch, verb-view | yes (whole suite) | A+ | - |
| 13 | playout-air-contract, production-persistence, production-data, playout-drills | cue-draft (edit, flush, cancel, dispose, the unsent selector) | yes (whole suite) | A+ | repeat |
| 14 | the full offline suite on CI; the automated rehearsal | - | yes (whole suite) | A | final |

Evidence (`evidence/phase-<n>.md`): the candidate sha, each command and its summary, the
configured run URL with its tested sha, the assessor's verdict with the reviewed sha.

- **Revalidation.** A commit that changes `src/`, `e2e/`, `scripts/` or `package.json` after any
  evidence invalidates that evidence; the matrix rows the change reaches run again (all of them
  for `src/control/` or the page).
- **Evidence-only commit.** A commit touching only this spec's `evidence/` directory is allowed
  once after the last material commit; it does not invalidate evidence; `/check` then runs on
  that tip, and its verify step cites the evidence after confirming the tested sha differs only
  by that commit (`git diff <tested> HEAD -- . ':!docs/work-specs/production-page-refactor/evidence'`
  is empty). `/queue-merge` requires the stamp on the final tip; a review or simplify change
  during `/check` is a material commit and restarts the matrix.
- **Mappings.** New Node tests carry `// guards: <module>`; specs whose `// covers:` named a
  moved behaviour gain the new path in the same pull request; `node scripts/e2e-affected.mjs
  --list --files <new module>` must select the specs that covered the behaviour before the move
  (noted per phase).
- **After landing:** plan-run's checker (its brief, on `origin/main`), the push-to-main configured
  run, `deploy-verify.yml`. PASS requires the phase's named specs and Node files green on main's
  CI, the landing's configured run green, and the evidence file present.

## 7. Performance and UI freshness

**Scope.** The controller's own PROGRAM monitor and the wire-side timings the page controls
(`rpcSent->rpcDone`, `wsRow`). Output-side render latency is excluded from the claims: this plan
changes neither `src/output/`, the renderer, nor `sendControlVerbs`, so the page can only move the
wire-side numbers the bench already records. Per-spec staging durations are not a latency measure
and are not cited as one.

**Fixtures.** The built app (`npm run dev:worktree -- --preview`), the owner's machine (Windows
10, Chromium headless), the bench's own "Lag Bench" productions (`scripts/playout-lag-bench.mjs
--seed`, and `--seed --published` against the local Supabase stack; never production or the
owner's productions). Samples: `--measure --rounds 12 --headless`; medians and p90 computed from
`playout-lag.json`.

**Baseline validity.** Phase 1 runs the baseline twice on the same build; the thresholds below
apply only if the two baselines agree within them; otherwise the tolerance is 1.5 times the
observed spread and is recorded. Both baselines and every repeat's `playout-lag.json` are kept in
`evidence/perf/`.

**Comparison rule** (a repeat against the first baseline): click to command, to played and to
painted medians within +5 ms and p90 within +10 ms; `rpcSent->rpcDone` and `wsRow` medians within
+15%; `frozeMs` p90 within +10 ms. A result outside the rule is repeated with `--rounds 24` before
it is judged; a confirmed regression is a stop (§8). Repeats after phases 11 and 13 and at 14.

**Render counts and freshness** (`e2e/playout-air-contract.spec.ts`). `data-renders` on the page
root (exists, 5486) and, from phase 13, on the cue editor. Target after phase 13: ten keystrokes
into a value field move the page root's count by at most 1 (the `unsent` selector's first
transition, D12) and the editor's by at most 10; a timing reading moves the page root by 0
(existing, `e2e/playout-clock.spec.ts:379-391`). Asserted beside the counts in the same test: the
preview iframe's `#f0` holds the typed text (read as production-data 604 reads it), `cue-unsent`
shows, the rundown row's label updates, Update is enabled, the panel dialog shows `update`
allowed; after a timing reading, the clip clock moved. A monitor that stopped updating cannot
pass on counts alone. Subscribers after phase 13: `CueEditor` (draft), `CueRundown` rows (draft
labels via `cueView`), `PlayoutMonitors` (its own draft subscription deriving `settleData` for
the preview cue it is given), the page's verb bar (the `unsent` selector and the air part), the
panel feed (view).

## 8. Release, stop conditions, recovery

**Deployment, verified.** A merge to `main` runs CI's full suite; Vercel builds `main` when the
range touches deploy-affecting paths (`vercel.json` `ignoreCommand` ->
`scripts/vercel-ignore-build.mjs`; `src/` qualifies) and promotes production; `deploy-verify.yml`
checks `version.json` on the live site. Phases 2 through 14 change `src/` and deploy on landing;
phase 1 does not. plan-run does not isolate the refactor from production.

**Per phase**, in its phase notes: the `main` sha before the merge, the merge sha, the
deploy-verify run, and the exact revert command.

**Ledger sequences** (`scripts/plan-run.mjs`):
- A failed post-merge check: `fail` -> `repair` (one) -> `landed` -> `check` -> `pass`; a second
  `fail` makes the coordinator record `stop` and ask the owner; only his real answer is recorded
  as `answered`.
- A product regression found after `pass` (the landing's configured run, deploy-verify, a later
  main run attributed to the phase, an owner report): the coordinator records `stop` on the next
  phase with the reason, asks the owner (plan-run's stop path with a phone notification), and a
  repair session lands the revert through the queue. The run resumes only after `answered`; the
  phase is rebuilt in a later window.
- Infrastructure unavailable (CI, the local stack, Vercel, GitHub): `stop` with the reason; no
  revert of healthy source; resume after `answered` once the infrastructure is back.

**Revert, default:** in an isolated worktree, `git revert -m 1 <merge sha>` on `revert/<sha7>`,
`/check`, `/queue-merge`; unrelated landings stay. `scripts/revert-landing.mjs` only when its
first-parent range (`git log --first-parent <since>..<sha>`) contains exactly the phase's landing.

**Destructive verification** uses e2e fixtures, the bench's productions, the local stack and the
staging project only.

**Final automated completion** (phase 14): the production path on the built app against the
local stack with the fake Bridge, published output on a second page, All out, folders, timed
cues, panel keys, recorded in `evidence/rehearsal-automated.md`. Distinct from it: a hardware
rehearsal on the owner's CasparCG, Bridge, Stream Deck, OBS and vMix, which this plan cannot run;
each stays unverified until the owner records a walk. The next real show is not the first
rehearsal; this spec names no show date and claims no waiting period makes it safe.

## 9. Execution settings

- **Coordinator:** `/plan-run`, sequential; the wave file lists the remaining spec phases as
  `N. Phase <k> of the spec: <name> (AC-...)`; the ledger numbers them 1..N per run; a later
  window is a new run whose list starts at the first unfinished spec phase (a wave file cannot be
  stretched past 24 hours from its recorded start, `scripts/wave-plan-store.mjs` `openWave`).
- **Builders and ordinary checks:** `wave-row` (Opus, high). One builder owns the page in any
  phase.
- **`wave-row-deciding`** (Opus, xhigh): the pre-merge assessments of phases 11-13 (A+), and any
  narrow state or lifetime decision a builder meets that this spec does not settle (the builder
  records the question and the decision in the phase notes; it never widens scope).
- **Optional review mechanisms** (explicit opt-in; none is stacked by default): the Workflow
  tool (multi-agent scripts; needs the owner's opt-in per run), `/code-review ultra` (user
  triggered, billed), `/so`. At most one additional mechanism for phases 11-13:
  `/code-review ultra <PR#>` when the owner triggers it; otherwise none.
- **Runner readiness is an external prerequisite.** A separate session is improving
  `/plan-run`'s deadline, checkpoint and continuation handling. This spec does not specify or
  depend on those changes and does not assume them done; the coordinator revalidates the runner
  (the ledger commands in `.agent-workflows/plan-run.md` as they stand then) when a run is
  authorised.
- **Preflight before phase 1** (recorded in the wave file): `node scripts/work-spec.mjs status
  docs/work-specs/production-page-refactor/work.json` clean and the plan listed under "Runnable
  plans"; `origin/main` CI green and the latest `configured-suite` and `deploy-verify` runs on
  main green (`gh run list --workflow <file> --limit 1`); a local Supabase stack can start or
  the dispatch route is confirmed, the browser queue is idle enough (`npm run test:e2e:runs`),
  `gh` is authenticated, `wave-row` and `wave-row-deciding` are available; no open wave or plan
  run (`scripts/wave-plan-store.mjs`, never assumed from a document); the owner has supplied the
  window in Helsinki time with its offset.
- **Preflight before phase 2** (recorded in phase 1's notes): phase 1's tests green on main; S1
  and S3 decided with evidence and any fix landed; two baselines within tolerance or the widened
  tolerance recorded.

## 10. How the owner starts this plan

1. Execution is `/plan-run`, never an ordinary session working through the phase list by hand.
   The owner starts ONE coordinator session; it opens the run, launches each phase's builder and,
   after the landing, its independent checker (`.agent-workflows/plan-run.md` §2), and advances
   to the next phase by itself when the check passes. The merge safeguards stay: every builder
   lands through `/check` and `/queue-merge`; only the merge queue writes `main`.
2. The deadline comes from the owner at the start, from when the computer must be closed. This
   spec carries no date. A start instruction without a deadline is answered with one question
   for it before the run is opened. The runner's ceiling is 24 hours from the recorded start; a
   longer window is refused.
3. Start template, once the plan is registered under "Runnable plans":

   ```
   /plan-run production-page until <date and time with UTC offset>
   ```

   The coordinator reads this spec on `origin/main`, runs the §9 preflight (phase 1) or the
   phase-2 prerequisites (recorded in phase 1's notes), opens the run, copies the unfinished
   phases into the wave file and starts at the first unfinished one. It continues through the
   following phases inside the authorised window. No per-phase start and no routine approval is
   needed from the owner; the coordinator stops only on `stop` (§8) and asks him then.
4. Permission mode is a harness setting, not an execution step. Switching a session to auto mode
   never replaces invoking `/plan-run`, supplying the deadline, passing the preflight, or the
   merge safeguards.
5. Continuation in a fresh session: open the same run again (`wave-plan-store.mjs --open` with
   the date the run started), read the ledger with `node scripts/plan-run.mjs next <wave file>`,
   reconcile the step it names (a merged pull request is recorded as `landed`; a queued one is
   waited for; a step whose session is gone is started again in its recorded worktree with the
   same brief and recorded as `resume`), and continue from that step. An expired window is a new
   run with a new authorised window whose phase list starts at the first unfinished spec phase.
   The plan is never restarted from phase 1 and no active step is launched twice.
6. At the window's end the coordinator writes the `## Report` in the wave file (needs-you first,
   each phase's pull requests and verdicts, where it stopped, what was not checked), sends it to
   the owner, and adds a self-contained continuation prompt built from the runner's own handoff
   (the wave file path, the ledger's next step and the start template with a new window). Runner
   improvements are a separate session's task and are neither specified nor assumed here.

## 11. Acceptance criteria

### AC-1: The safety net exists before any move
The §5.3 phase-1 tests, the `// covers:` header on `dashboard-operator-walk`, two perf baselines
and the inventory exist on `main` before phase 2 lands.

### AC-2: Behaviour is identical at every phase
Every §5.3 inventory spec and every phase-1 spec passes at every phase with unchanged
assertions; the pre-merge assessor confirms the e2e diff changed selectors at most.

### AC-3: The core runs in Node
Each new `control/*.ts` module has a `scripts/*.test.mjs` with `// guards:`, runtime-imports
only pure `.ts` modules, takes browser IO through `io` and adapters, and `npm run depcruise`
passes with no config change.

### AC-4: The command contracts are pinned
Every §4.2 row is a Node test with late, reordered and post-dispose answers; the Take
"read after the wait" test exists; evidence shows that the inverted moves guard and the inverted
`leftAlone` fail their tests.

### AC-5: One owner for liveCue within the page and its modules
No `useState<LiveCueMap>` remains under `components/home/`; the writers are the named folds in
`airState.ts`; `HostedControlPage.tsx` is unchanged.

### AC-6: Infrastructure is tested
`storePart` (identity, notify on change only), the session (create, parts, apply order,
dispose) and each watcher or engine (start, restart keys, stop) have Node tests.

### AC-7: The UI stays fresh
The §7 freshness assertions pass after phase 13.

### AC-8: Each phase stays inside its fence
`git diff --name-only origin/main...HEAD -- src` lists only the phase's allowed files.

### AC-9: Performance holds
§7's comparison rule holds at every repeat; the render targets hold after phase 13.

### AC-10: Evidence precedes landing
Each phase's `evidence/phase-<n>.md` records the shas, commands, run URLs and the assessment;
the ledger shows `landed` only after it; the final tip carries the stamp.

### AC-11: The guardrail stands
A compiled rule (`npm run learn`, scope `src/components/home/ProductionPage.tsx`) says playout
behaviour lands in `src/control/`. No line count is part of it (D8).

### AC-12: The docs follow the code
The split section of `src/components/home/AGENTS.md` is rewritten; `docs/ARCHITECTURE.md` §2
lists `playoutSession` in the control seam column; docs/CLIP_PLAYBACK_PLAN.md §10 and §17.2 carry
the superseded note; covers and guards mappings are updated; #766 is closed.

### AC-13: The core is prepared for hosted reuse
A session constructs with no optional capability (Node test); no hosted page code changes.

### AC-14: Completion evidence names what stays unverified
`evidence/rehearsal-automated.md` exists and lists the hardware the plan did not exercise.

### AC-15: Suspected defects are decided on evidence
S1 and S3 are reproduced or refuted in phase 1; a confirmed one is fixed in its own pull
request, landed before its regression test is declared green, and the baseline is refreshed. S2 is
characterised and retained as existing behaviour.

## Phases

Each phase runs `/check` and the §6 matrix and lands with `/queue-merge`; the builder adds the
next phase's notes under `## Phase notes` (the previous verified `main` sha, the merge sha, the
revert command, traps, the check's findings). Allowed `src` files are exactly those named.
Temporary interfaces are the callbacks a module takes from the page while the page still owns the
state; each is removed in the phase that moves that state.

1. **Safety net and baseline** (AC-1, AC-15). Files: `e2e/playout-air-contract.spec.ts`,
   `e2e/configured/playout-adjust-race.spec.ts`, `e2e/configured/playout-resolve-race.spec.ts`,
   `e2e/configured/playout-switch-mid-flight.spec.ts`,
   `e2e/configured/production-data-key-dispatch.spec.ts`, `e2e/configured/expected-run.json`,
   `e2e/dashboard-operator-walk.spec.ts` (header), `scripts/command-roads.test.mjs`,
   `evidence/*`. No `src/`. A confirmed S1 or S3 fix is a separate pull request landed before
   this phase's tests are declared green.
2. **Infrastructure and pure helpers** (AC-3, AC-6, AC-8). Files: `src/control/storePart.ts`,
   `src/control/playoutSession.ts` (skeleton: key, alive, apply, dispose; no parts),
   `src/control/liveCue.ts`, `src/control/cueItems.ts`, `src/control/serverPlayoutStore.ts`
   (re-export), `src/control/hostedControl.ts` (re-exports only),
   `src/components/home/useStorePart.ts`, `src/components/home/ProductionPage.tsx` (creates the
   session keyed on `id`, disposes on change; nothing reads it yet), tests. Moves no state.
3. **ProductionShell.tsx and CueActions.tsx** (AC-2, AC-8). Files: the two new files,
   `ProductionPage.tsx`. Props only; derives nothing.
4. **useProductionPublish.ts** (AC-2, AC-8). Files: the hook, `ProductionPage.tsx`. Temporary
   interface: `onFirstPublish(rehearsed)` keeps `applyProgram` and `setLiveCue({})` in the page.
5. **takeBlockers.ts and serverVerbs.ts** (AC-2, AC-3, AC-8). Files: the two modules,
   `ProductionPage.tsx`, tests. Temporary interface: `cueView`, `flush` (flushDraft and
   closeGroup), `loadSettings`, `act`, `statePoll.wake` injected from the page.
6. **bridgeWatch.ts and the `bridge` part** (AC-2, AC-3, AC-6, AC-8). Files: the module,
   `playoutSession.ts` (adds the part), `ProductionPage.tsx` (the five effects become one
   `useEffect(() => startBridgeWatch(...), [restart keys])`), tests.
7. **productionDataSession.ts and the `data` part** (AC-2, AC-3, AC-6, AC-8). Files: the module,
   `playoutSession.ts`, `ProductionPage.tsx`, `ProductionDataWorkspace.tsx` only if its props
   change, tests. Temporary interface: `send` is the page's `runVerb`.
8. **useRundownAuthoring.ts** (AC-2, AC-8). Files: the hook, `ProductionPage.tsx`. Temporary
   interface: `offAir(graphic)`, `serverOut(cue)`, `flush`.
9. **cueArmEngine.ts and the `arms` part** (AC-2, AC-3, AC-6, AC-8). Files: the module,
   `playoutSession.ts`, `ProductionPage.tsx`, tests. Temporary interface: `send`, `cueView`,
   `liveCueOf` (`() => liveCueRef.current`), `withBoundValues`, `cuesOf`.
10. **folderPlayout.ts and the `folders` part** (AC-2, AC-3, AC-4 cancellation, AC-8). Files: the
    module, `playoutSession.ts`, `ProductionPage.tsx`, `FolderEditor.tsx` only if props change,
    tests. Temporary interface: `serverVerb`, `takeGraphic`, `send`, `liveCueOf`, the `setLiveCue`
    folds, `flush`.
11. **airState.ts, sessionWire.ts, the `air` and `log` parts: the liveCue move** (AC-2, AC-3,
    AC-4 seed, claim and restore, AC-5, AC-6, AC-8, AC-9 repeat, AC-13). Safety-sensitive. Files:
    the two modules, `playoutSession.ts`, `ProductionPage.tsx`, `PlayoutMonitors.tsx` and
    `CueRundown.tsx` only if a prop type changes, tests. The page's verbs call the session's
    folds; no verb moves; the `liveCueOf` and `setLiveCue` interfaces of phases 9 and 10 are
    replaced by the session.
12. **graphicVerbs.ts, verbDispatch.ts, verbView.ts** (AC-2, AC-3, AC-4 all rows, AC-8). Files:
    the three modules, `ProductionPage.tsx`, tests. Selection is passed in; the remaining
    temporary interfaces (`cueView`, `flush`, `resolvedOf`) stay until phase 13.
13. **cueDraft.ts, the `draft` part, CueEditor.tsx** (AC-2, AC-3, AC-6, AC-7, AC-8, AC-9 repeat).
    Safety-sensitive: the draft decides what Take and Update air, and the preview shows it. Files:
    the module, the component, `playoutSession.ts`, `ProductionPage.tsx`, `CueRundown.tsx` (label
    subscription), `PlayoutMonitors.tsx` (its own draft subscription for `settleData`, D12),
    tests. Removes the last temporary interfaces. Reconciled 2026-10-17: split into **13a**, a
    props-only move of the cue editor JSX into `CueEditor.tsx` in the phase-3 style (derives
    nothing, moves no state; the Fill and Connect menus of C0 and C1 live there), run in this
    window after 2+7 with phase 3's matrix row plus `production-data` and `playout-air-contract`;
    and **13b**, the draft part as written here, in the later window.
14. **Close-out** (AC-9 final, AC-11, AC-12, AC-14). Files: `ProductionPage.tsx` (imports),
    `contracts/rules/...` through `npm run learn`,
    `src/components/home/AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CLIP_PLAYBACK_PLAN.md`,
    `e2e/*` covers headers, evidence. `Closes #766`.

### Run order (reconciled 2026-10-17; the owner's agreement pending)

History. The owner made the playout dashboard the top priority with its data and audience flows
and ruled on 2026-10-16 "production page cleanup first, then Sheet data, then audience, all in
the one run". The Sheet-only phases 15-20 were superseded by data-sources DS16 on 2026-10-17,
then a continuation 15-26 was drafted and sent for two independent whole-plan reviews. Both
reviews found the order upside-down: the paste result depends on nothing in the refactor, and the
content work needs the data session and a props-only cue editor move, not the press verbs. The
reconciliation (`docs/research/2026-10-data-sources/synthesis-2026-10-17.md`) replaces the
"cleanup first" order with the one below. The refactor's safety contracts (§4-§8) are unchanged.

One `/plan-run production-page`, sequential; the wave file names each step as
`N. Phase <k> of the <spec> spec: <name>`:

| Step | Phase | Spec | Result |
| --- | --- | --- | --- |
| 1 | C0 | data-sources | Paste a message and safe staging; #1313 fixed. A feature change outside the refactor fence, landed before phase 1 so the baseline includes it |
| 2 | 1 | this spec | Safety net, S1 and S3 decided, two perf baselines |
| 3 | 2+7 | this spec | Store part, session skeleton, the production-data session (one phase; phase 7's matrix row plus phase 2's Node tests) |
| 4 | 13a | this spec | Props-only cue editor extraction |
| 5 | C1 | data-sources | Native lists (paste rows), starter rows, local Sheets, the browser reader, the sources line, the Data overview with Advanced |
| 6 | C2 | data-sources | Sheet messages, the cue-editor message pick, YouTube comments and live chat |
| 7 | C3 | data-sources | Published ownership: bindings and sources persist at once, the lease, the server tick, cost |
| 8 | C4 | data-sources | Feeds |
| 9 | C5 | data-sources | The another-system card and Pause |
| 10 | C6 | data-sources | Journeys, compatibility, docs |
| 11 | C7 | data-sources | Combined rehearsal, trials, Twitch and output-player checks |

Track Q (qualification and the trial) runs beside step 1 in its own session and is recorded
before step 5. The later window, its own run with its own authorised time: phases 3, 4, 5, 6, 8,
9, 10, 11, 12, 13b and 14 as written above, in that order, 11 alone.

Each content phase uses §8 and §9 of this spec and the verification matrix in the data-sources
spec; §6 here covers steps 2-4. The D3 stop rule holds. Required manual, Sheet and YouTube
outcomes are reported separately from optional Twitch deferral and hardware checks. No run starts
from this documentation update.

## What the plan can demonstrate, and what stays uncertain

Demonstrable: behaviour identical on every pinned scenario (the offline suite, the configured
suite on the local stack, Node contracts with held and reordered answers); one owner for liveCue
within the page and its modules; the core running in Node; wire-side and monitor latency and
render comparisons on the owner's machine under §7's rule; a compiled rule that sends new playout
behaviour to `src/control/`.
Uncertain: real CasparCG, Bridge-on-server and hardware panel behaviour; hosted-staging latency
(twice-weekly runs, not per phase); output-side render latency (excluded); timings the held
answers do not reproduce; the hosted page's fitness for the core (not in scope).

## Readiness

Before the next run: the two independent reviews are reconciled
(`docs/research/2026-10-data-sources/synthesis-2026-10-17.md`), and the owner agrees the resulting
plan, including the run order above and the four decisions in the synthesis §7. This is a
planning review gate, not authorization to start a run.

Before starting phase 1 (the start instruction): this spec and `work.json` landed on `main`,
`work-spec.mjs status` clean and the "Runnable plans" line present; `origin/main` CI, the latest
configured-suite run and deploy-verify green; the local Supabase stack or the dispatch route
confirmed, `gh auth status` ok, the browser queue idle, `wave-row` and `wave-row-deciding`
available; no open wave or plan run and the runner revalidated as it stands then; the owner's
window supplied.

Added 2026-10-16: the phase 1 builder reads `evidence/reconcile-2026-10-16.md` first: line numbers
here are of `70fad3a94`, and code that landed since (#1057's boot replay) is reused. The owner
answered D8 on 2026-10-17 (no size gate), so that receipt's D8 caveats are settled.

Before C0 (step 1): nothing from the refactor; C0 lands before phase 1's baseline, and phase 1's
characterisation then covers it. Before C1 (step 5): phases 1, 2+7 and 13a checked PASS on
`main`; track Q recorded with the Sheet measurement inside D3, or the plan stopped and asked; the
data-sources and audience-flow specs agreed; digests current and `work-spec.mjs status` clean.
Later readiness per content phase is in the data-sources spec. A manual YouTube copy does not
prove a direct connector; optional Twitch work is not a completion gate.

Before starting phase 2 (from phase 1's evidence and notes): phase 1's tests green on main (the
offline spec, the four configured specs, the Node files, the gate); S1 and S3 decided with
evidence and any confirmed fix landed in its own pull request; S2 characterised; two baselines
within tolerance or the widened tolerance recorded, both kept in `evidence/perf/`.

## Phase notes

Each phase's pull request adds here what the next phase must allow for, newest first: the
previous verified `main` sha, the merge sha, the revert command, decisions taken, traps found,
and the check's findings.
