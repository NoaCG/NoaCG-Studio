# Automated rehearsal of the completed refactor (phase 14, software half of AC-14)

Gates parent phase 14 (row 25 of the production-page plan run): AC-14's software half and
data-sources AC-16's software half, reconciled against the code after every refactor phase. Made
by the phase 14 builder on 2026-10-24 from a Claude cloud session, on branch
`claude/plan-production-page-p25-build`. The real-output half is parent phase S
(`evidence/final-acceptance.md`, not yet written).

## The completed candidate

- **Source state:** `dac20da` (on main `7bb3e64`, after phase 13b landed as #1648 at `a56e141`).
  Every refactor phase of spec.md "Phases" is on main: 1, 2+7, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13a,
  13b. This branch adds only the close-out (covers headers, comment lines in five `src/control/`
  modules, the compiled rule, the docs); no behaviour changes.
- **Runs on it:** the table under "Runs" at the end. A commit after `dac20da` that touches only
  this evidence folder leaves these results valid (spec.md §6, "Evidence-only commit"); the
  merge commit that lands this file carries the tested tree unchanged apart from it.

## What "in software" means here

As in C7's record (`../../data-sources/evidence/rehearsal.md`, "What in software means here"):
offline journeys run the page on its local provider with PROGRAM as the same renderer the
published browser output runs; configured specs run against a local Supabase stack in GitHub
Actions with the stack's own test secret; `e2e/_fakeBridge.ts` answers as NoaCG Bridge and
CasparCG; Sheets, feeds and the YouTube API are stubbed by the tests. One production per route,
not one production carrying every route. Every PROGRAM reading is the page's own monitor, a
simulation of the output fed the same commands; no picture was captured from a target output.
Production's tick switch was not touched, and no production database was queried.

## Reconciliation against C7: what the refactors touched

C7 recorded its routes on `86ebdd9` (offline) and `e53b7e7` (configured), landed in `44bfa89`.
Between `44bfa89` and the main this branch starts from, `git diff --name-only 44bfa89 7bb3e64 --
src` lists 21 files, all of them the production page and its new modules (this branch then adds
only comment lines and the two `AGENTS.md` files):

- `src/components/home/`: `ProductionPage.tsx`, `CueActions.tsx`, `CueEditor.tsx`,
  `CueRundown.tsx`, `PlayoutMonitors.tsx`, `ProductionShell.tsx`, `useProductionPublish.ts`,
  `useRundownAuthoring.ts`, `useRundownHistory.ts`;
- `src/control/`: `airState.ts`, `bridgeWatch.ts`, `cueArmEngine.ts`, `cueDraft.ts`,
  `folderPlayout.ts`, `graphicVerbs.ts`, `playoutSession.ts`, `serverVerbs.ts`, `sessionWire.ts`,
  `takeBlockers.ts`, `verbDispatch.ts`, `verbView.ts`.

Nothing under `src/audience/`, `src/model/`, `src/output/`, `api/` or `supabase/` changed, nor
`src/control/sheetSource.ts`, `feedSource.ts`, `anotherSystem.ts`, `contentFormats.ts`,
`liveData.ts` or `messageStaging.ts` (`git diff --name-only 44bfa89 dac20da` over those paths is
empty). So:

- **Every page journey is affected** (the page and everything it sends through moved), and every
  journey C7 cited was run again on this candidate (below). The C7 journey specs themselves
  changed only by `// covers:` lines since C7 (`git diff 44bfa89 dac20da` over
  `production-data`, `production-audience`, `production-controls`, `playout-folders` and
  `configured/audience-live` shows no other line), so the same assertions ran.
- **Reader-level evidence is reusable**, because its material inputs are unchanged: the Node
  tests of the Sheet, feed, API-pause, message, Twitch and YouTube readers. They were run again
  anyway (115 of 115). The **YouTube live smoke** (C7, 2026-10-22, `e53b7e7`) is reused, not
  repeated: the reader it ran (`src/audience/youtubeChat.ts` and `chatIntake.ts`) is
  byte-identical between `e53b7e7` and this candidate (the one `src/audience/` change since then is
  C7's own Twitch fix), and a second smoke would spend the shared key for no new
  kind of evidence.
- **C7's laptop walk** (`local/c7-casparcg-obs-walk.md`, on `44bfa89`) ran before phases 3 to 13b
  changed the page. It is not reused for this candidate; it is requested again (below).

## Routes (data-sources AC-16, software half)

Each route recorded separately. "Pass" means the named journey or test ran green on this
candidate in the run named under "Runs"; a route nothing proves is "unverified", never a pass.

| Route | Proven by (as C7 cited, run again here) | Result on this candidate |
| --- | --- | --- |
| Pasted rows | `e2e/production-data.spec.ts` "Paste rows fills a ticker, a schedule, standings and credits…" | RESULT |
| A Sheet ticker | `production-data` "Connect data previews the whole graphic…", "twelve Sheet rows reach a ticker on air…" | RESULT |
| Schedule, standings and credits from a Sheet | `production-data` "Sheet tabs fill a schedule, standings and credits on air…" | RESULT |
| A feed | `production-data` "a pasted news feed fills a ticker…"; `scripts/feed-source.test.mjs`; `e2e/configured/feed-route.spec.ts` | RESULT |
| A pushed score | `e2e/configured/production-data-key.spec.ts` "Another system: the card key pushes…" (quarantined on main, #1608; runs in a branch dispatch); `scripts/data-pause.test.mjs` | RESULT |
| A guest row | `production-data` "a guest row loads into a lower third and airs on Take…" | RESULT |
| Pasted messages | `e2e/production-audience.spec.ts` "a pasted message airs exactly as prepared…"; `e2e/configured/audience-live.spec.ts` | RESULT |
| Sheet messages | `production-audience` "a message Sheet: rows arrive as candidates…"; `audience-live`; `scripts/sheet-messages.test.mjs` | RESULT |
| YouTube comments | `scripts/youtube-comments.test.mjs`; `e2e/production-chat-intake.spec.ts` (quarantined, #1595: local run only) | RESULT |
| YouTube live chat | `scripts/youtube-chat.test.mjs`; C7's live smoke (reused, above); `production-chat-intake` (quarantined, local run only) | RESULT |
| Twitch chat (regression) | `scripts/twitch-chat.test.mjs` on recorded frames | RESULT |
| A staged vote | `production-audience` "the vote reaches air the same way a question does…"; `audience-live` "the published walk…" | RESULT |

### PROGRAM after each disturbance, overrides, readers, independence and confirmation

C7's other four tables (`../../data-sources/evidence/rehearsal.md`: PROGRAM after source edit,
delete, duplicate arrival, Pause, disconnect, reload and operator-page closure; custom graphics,
manual override, reader handover, unchanged and changed cells, delayed responses, Pause and
Resume; the quiz beside its clock, All together with a failed child and conflicting layers,
selection versus staged versus pending versus confirmed, disconnect dimming PROGRAM, simulation
versus target) cite journeys in `production-data`, `production-audience`, `production-controls`,
`playout-folders`, `playout-feedback-health`, `playout-clock` and the configured
`production-data-key`, `production-data-key-tick`, `production-data-key-dispatch`,
`playout-status`, plus the reader Node tests. RESULT_TABLES

## Required criteria and their results

| Criterion | Layer | Result |
| --- | --- | --- |
| AC-11 the guardrail stands | `contracts/rules/components/playout-behaviour-production-page-lands-verb.md`, compiled by `npm run learn` into `src/components/AGENTS.md`, `.claude/rules/src-components-home-productionpage.md` and `contracts/index.md`; no line count; `check:contracts` green | pass |
| AC-12 the docs follow the code | `src/components/home/AGENTS.md` split section rewritten; `docs/ARCHITECTURE.md` §2 lists `playoutSession`; `docs/CLIP_PLAYBACK_PLAN.md` §10 and §17.2 carry the superseded note; covers and guards (below); #766 closed by this merge | pass, #766 at landing |
| Covers and guards mappings | `node scripts/gates.mjs audit` (every Node test declares guards that match files) and the build's `auditSpecHeaders` (via `e2e-affected --list`) both clean; every new module is named by its specs and its Node test; 11 specs that press verbs on the page and 3 that drive the fake Bridge gained the moved modules (phase notes) | pass |
| AC-9 render targets | phase 13b's `e2e/playout-air-contract.spec.ts` render counts, in the full offline run | RESULT |
| The full offline suite on CI | `ci.yml` dispatched on the candidate with no base | RESULT |
| The whole configured suite | `configured-suite.yml` dispatched on the candidate | RESULT |
| Data-sources AC-16, software half | the route tables above | RESULT |
| Node, refactor modules | the 17 Node files of phases 1 to 13b | 290 of 290 |
| Node, readers | the 8 reader Node files C7 cited | 115 of 115 |
| `npm run depcruise` | | no violations (1367 modules) |
| Assessment A | a fresh read-only `/so` session on the final diff | RESULT |

## What stays unverified (requested, not done)

Required evidence that is unavailable blocks completion; nothing in the software half is in that
state (RESULT_BLOCK). The items below are the laptop helper's and the owner's, named so the final
report cannot read as complete without them.

**Performance (AC-9 timing; non-gating, laptop helper on the exact merge SHA, spec.md §7).**

| Comparison | Revision | State |
| --- | --- | --- |
| Baselines 1 and 2 | phase 1, `0ca774269` | measured; they agree within §7 (`perf/phase-1-baselines.md`) |
| Repeat after phase 11 | `08389cfc1` | measured; every gesture within §7 (`perf/phase-11-repeat.md`) |
| Repeat after phase 13b | `a56e141` | **not measured** |
| Final repeat | this phase's merge SHA | **not measured** |

The render targets (the part of AC-9 that gates) are Actions' and are in the table above.

**Laptop walks (non-gating; inform repairs, never gate).**

- The scratch CasparCG/NoaCG Bridge and OBS/browser-source walk of the four data boards, again on
  this phase's merge SHA: the C7 walk (`local/c7-casparcg-obs-walk.md`) ran on `44bfa89`, before
  phases 3 to 13b changed the page. Its open defect, #1618 (a results board taken a second time on
  a published output shows no rows), predates the run and is still open.
- What C7's walk did not cover: Continue/Next, a Sheet or feed source on a real output, fonts and
  assets on a separate target, a Bridge or CasparCG restart and reconnect, vMix.
- Hardware-panel receipts (row 2, H0.1) are recorded in `local/h0-1-companion.md`; its AC-8 p50
  stayed over its threshold and is not attributed.

**Real-studio receipts (phase S, the owner with an agent beside him).** A ticker, a schedule, a
standings board and credits updating through the actual CasparCG/NoaCG Bridge route and an
ordinary OBS/browser source; the actual consumer used in production; Bridge and CasparCG versions,
channels and layers, fonts and assets on a target, Take/Update/Continue/Out on CasparCG and OBS,
stacked graphics on a real output, a real restart or reconnect.

**A browser output receiving a data update, on one page.** As C7 recorded: the command log carries
data updates as update rows, and the published output renderer applies update rows, each proven
in the configured suite; the two together on one output page are not walked in software.

**Owner items.**

- The content trial kit (`../../data-sources/evidence/trial-kit.md`): no run is recorded yet
  (`trial.md` does not exist). Trials are reported from the kit as run and never block.
- A live Twitch check (C7 used recorded frames only).
- Friday 23 October's owner testing: no record of it is in this repository, so no revision is
  named for it here.

**Optional deferred routes, named apart.** Expanded vMix and SPX qualification is later work
(data AC-16); the hosted page's adoption of the session is its own later spec (spec.md §1.1,
decision 1).

## Runs

RUNS
