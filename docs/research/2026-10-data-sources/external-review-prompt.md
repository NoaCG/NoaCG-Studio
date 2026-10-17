# Independent review: NoaCG production, data and message workflow

Research and design review only. Do not implement, migrate, merge, publish or start a plan run.
Return a self-contained Markdown review that I can bring back to the planning agent.

Status, 2026-10-17: two reviews answered this brief (`reviews/`) and were reconciled in
`synthesis-2026-10-17.md`. The brief is kept as they received it; its phase table is the plan as
it stood at `7313cd8`, not the current one.

## Your task

Challenge our entire production-page plan, all 26 phases, against the outcomes below. This is
one of the most important changes to NoaCG's playout workflow. I care about what students and
operators can accomplish, not preserving the proposed architecture, pages or phase numbering.
You may simplify, replace, reorder, combine or defer parts of the plan. Be specific about why.
Do not rubber-stamp it or assume that more infrastructure means a better product.

Form your own model from the goals and current code first. Write down a short independent
proposal before reading our proposed solution, then compare them. If you cannot access the
repository, review the self-contained brief below and clearly separate that conceptual review
from a code-verified review. Tell me which files would resolve material uncertainty.

## Product and owner outcomes

NoaCG is a browser-based broadcast graphics and playout tool. A production contains graphics,
a rundown of cues and outputs used with OBS, vMix, CasparCG and SPX. An operator Takes cues to
air. Users, including me and my students, are often not technical.

Today's Data tab is confusing: paths, seed, bindings, Raw JSON and tables share one screen.
The outcome I want is: choose content, see it correctly in a graphic, put it in the program.
It should not take a binding lesson or require reading documentation for ordinary tasks.

The important data cases are tickers, schedules, standings and credits. Sheets are useful for
long text and lists, but even creating the right Sheet is difficult. Give users useful starting
content or a simpler native paste/edit route. Scores usually use NoaCG controls or pushed data.
The data API and a direct RSS feed should be understandable routes in this same product.

Audience is close to data binding. It need not be a separate system or page. My main message
task is to get a chosen message from anywhere, perhaps X, SMS, WhatsApp or another service,
into an on-air graphic. A manual copy/paste step or a Google Sheet is a perfectly good solution.
Do not turn this into a requirement to build native integrations with every platform.

YouTube comments are useful now. Distinguish ordinary video comments from live chat; do not
silently call one support for the other. Twitch is not important for me now, but keep a sensible
extension path and avoid breaking existing users. New persistent Twitch support may be deferred.

Nothing a viewer sends should air automatically. I must choose the message, edit the broadcast
text/name or make it anonymous, see the graphic, put it in the rundown and Take it. Later arrivals
or source edits must not replace that prepared or on-air message. Optional audience join links,
presenter controls and voting should remain useful without complicating this main task.

I have accepted the current recommendations for inclusion in the plan, and requested this
independent review before we settle it. That is not final approval of its design or execution.
The latest direction above supersedes older wording requiring separate Data/Audience tabs or
equal priority for Twitch. Please challenge earlier decisions where the outcome warrants it.

## Repository and evidence

Repository: https://github.com/NoaCG/NoaCG-Studio
Current planning PR: https://github.com/NoaCG/NoaCG-Studio/pull/1390
Head branch: `codex/data-binding-research`.

Read the PR's current head, not only `main`, and report the SHA you reviewed. If the PR has
landed, identify the landing and use that revision. Do not assume an old line number is current.
The prompt may be pasted outside the repository, so lack of private-repo access is possible.

Read these current implementation paths before the proposed specs if access permits:

- `src/components/home/ProductionPage.tsx`
- `src/components/home/ProductionDataPanel.tsx` and `ProductionDataWorkspace.tsx`
- `src/components/home/ProductionAudienceWorkspace.tsx`
- `src/model/productionData.ts`, `src/model/shows.ts`, `src/control/cueData.ts`
- `src/control/productionDataApi.ts`, `api/data/[...path].ts`
- `src/audience/youtubeChat.ts`, `chatIntake.ts`, `localAudience.ts`, `audienceTypes.ts`
- `src/templates/tickers/shared.ts`, `src/templates/infographics/dataRuntimes.ts`
- `src/templates/competition/results/shared.ts`, `src/templates/endCredits/shared.ts`

Then read the complete proposal, not just the added audience paragraphs:

- `docs/work-specs/production-page-refactor/spec.md` and its `work.json`
- `docs/work-specs/data-sources/spec.md` and its `work.json`
- `docs/work-specs/sheet-data-flow/spec.md` and its `work.json`
- `docs/work-specs/audience-flow/spec.md` and its `work.json`
- `docs/research/2026-10-data-sources/README.md` and `second-opinion.md`
- `docs/PRODUCTION_DATA_PLAN.md`, `docs/DATA_API.md`, `docs/CLOUD_PLAYOUT.md` section 7
- `docs/INTERACTIVE_PLAYOUT_PLAN.md` and relevant repository rules/tests

## Known current behavior to verify

- Production data already supplies live values; arrays of strings become newline field text.
  Bindings currently affect a graphic and all its cues, and override cue field values.
- A selected `ShowDataset` row is copied into a cue. Existing audience intake also stages cues.
  These are useful building blocks, not a requirement to create another generic data store.
- Message staging has an unsafe fallback to an unrelated graphic/field, issue #1313. A title
  match alone can also mistake a vote graphic for a message destination.
- The current YouTube driver reads live chat, keeps its key in browser memory, and discards the
  first history page. It is not ordinary video comments or proven closed-page server intake.
- The data API needs a published production and bearer data key. `/patch` writes production
  JSON; `/state` reads it; `/update` writes graphic fields. Arrays replace; null deletes keys.
  Current published bindings reflect the last publish. The new workflow must persist connection
  changes without a hidden republish step while preserving existing integration compatibility.
- One production key does not identify several independent senders. Do not promise per-sender
  Pause or attribution without an actual contract and migration.
- Existing embedded Sheet code in graphics must keep working. New connections should live with
  the production, not be injected into templates.

These are starting findings, not permission to repeat them without checking where possible.
No new browser walkthrough or live-provider acceptance run was performed for this plan update.

## Candidate solution, open to replacement

One shared content workflow, accessible at the graphic and through stable navigation. A
Messages view may specialize the task; two separate setup systems are not required. Avoid
duplicating editable records simply to make the navigation look unified.

Keep two independent concepts behind the workflow: where content arrives and how it is used.
A Sheet can feed a live ticker or a collection of messages to select. Message candidates from
clipboard, Sheet, join or YouTube receive no live writer. The operator creates a cue snapshot.
Neither the provider name nor approval creates a live binding. Vote tallies follow only when
the operator explicitly enables the existing live-tally behavior.

For live connections: preview the selected destination, save stable identities, and make sharing
explicit. Equal field titles must not silently bind unrelated graphics. Say which cues use the
connection. Retain existing paths, controls, templates, exports and command-log behavior.

For messages: body is sufficient, name optional; original and broadcast text remain distinct.
Sheet starter columns: Name, Message, optional Source and Reference. Show only chosen broadcast
fields, not private sender metadata. Imported/native content survives reload. Define IDs,
revisions, duplicate/retry behavior and ID-less Sheet reordering without using row position as
identity. Preserve prepared cues when the source row changes or disappears. Do not silently
remove another cue's live bindings to make a message fit; offer a compatible unbound card.
Later live connections and direct data-key `/update` writes cannot bypass snapshot protection.
Explicit operator editing and Update remain available.
Review whether that restriction or a different small isolation mechanism best meets the task.

Sheets: one tab per reusable content set, each linked once. Generate starter rows/CSV from the
chosen graphic. No all-tab discovery from a CSV. A link-shared read does not require Google OAuth;
creating a personal Sheet still needs a Google account. Ticker uses one column; schedule uses
Time/Programme; standings need rows plus column headers; credits need section breaks. A universal
join-all-cells rule is insufficient. Keep a small native editor available without Google.

Source management shares identity, status, ownership and Pause. Polling, push and subscriptions
can have different runners. Published live sources work with operator pages closed; local
browser-owned sources need an open page. A scheduler is not itself a streaming listener.
Failed reads hold the last good content. Valid empty live content clears managed fields without
globally changing legacy empty-array behavior. Pause must cover all data-key write routes and
preserve partial patches, null deletions and ordering for Resume. Manual controls still work.

Proposed Sheet target: read every 5 s, edited live values visible within 10 s. This is a target
to measure over 20 real edits and an hour of polling, not a current guarantee. Measure server
cost too. Sheets import formulas can be much slower; polling cannot accelerate their upstream
refresh. RSS candidates use guarded cached reads, about 5 minutes, with provider backoff.

Direct YouTube scope, provider access, history/reconnect policy, quota, secure credential storage
and hosting must be qualified. Manual copying remains independently useful but cannot be counted
as proof of a direct connector. New durable Twitch support is not required for completion.

## All candidate phases

Current order is refactor first, then shared content/data, then safe messages and YouTube.
Research/prototypes can happen before code moves. Challenge the order and unnecessary work.

| Phase | Proposed result |
| --- | --- |
| 1 | Safety net, held-request race tests and performance baseline; no product moves |
| 2 | Pure helpers and session skeleton; no state moves yet |
| 3 | Extract ProductionShell and CueActions through props |
| 4 | Extract publication hook |
| 5 | Extract Take blockers and server verbs |
| 6 | Extract Bridge watcher and lifecycle part |
| 7 | Extract production-data session and dispatch ownership |
| 8 | Extract rundown authoring hook |
| 9 | Extract timed cue arming engine |
| 10 | Extract folder playout and cancellation handling |
| 11 | Move liveCue once into air state; session wire and command-log ownership |
| 12 | Extract graphic verbs, dispatch and action view |
| 13 | Extract cue draft/editor and fresh label/preview subscriptions |
| 14 | Refactor close-out, guardrail, docs, performance and automated rehearsal |
| 15 | Prototype shared content/messages; qualify sources; write continuation check matrix |
| 16 | Scoped identity, formats, runners, message revisions and snapshot contracts |
| 17 | Native lists, starter rows and local Sheet connections |
| 18 | Published ownership, durable connections and closed-page updates |
| 19 | Direct guarded RSS/Atom feeds |
| 20 | Custom API setup, status, Pause and held-write ordering |
| 21 | Selected rows and manual/Sheet message intake, editing and preview |
| 22 | Data usability journeys, exports, legacy compatibility and docs |
| 23 | Safe compatible message destinations, reliable staging and exact cue snapshots |
| 24 | Shared message workflow; optional phone join, presenter and votes |
| 25 | Qualified YouTube intake; preserve Twitch compatibility/extension path |
| 26 | Combined production rehearsal and route-by-route acceptance |

Refactor constraints: behavior preservation in 1-14; selected cue remains in React; liveCue
has one owner and moves once late. HostedControlPage migration is outside this run, but optional
core capabilities prepare for later reuse. No new output protocol or general framework.
Phases 3/4/6/8/9 are identified as maintenance work worth challenging before execution.

Command semantics: capture target/verb at press, read current draft/bound values after persistence
wait, retain one ordered command log and duplicate guards. Production switches dispose timers,
watchers and late callbacks; an already accepted external command cannot be assumed undone.
Two suspected baseline defects, lost increments and folder double Take, need evidence and
separate fixes before extraction tests can claim green. Do not hide existing failures in moves.

Verification: 1-14 have a per-phase matrix with Node, offline and configured published tests,
independent assessments and performance checks. Phase 15 must specify concrete checks for 15-26;
the old matrix alone is insufficient. Each bounded phase is checked and landed sequentially.
Readiness includes reviewed specs, current-main health, runner readiness and an owner-supplied
execution window. This review does not start that window. Hardware rehearsal remains distinct
from automated local-stack tests. No real show should be the first integration rehearsal.

## Questions your review must resolve

1. What is the simplest coherent operator model? Should content live at the graphic, in one
   workspace, in specialized views, or somewhere else? Compare at least two viable approaches.
2. Does the plan deliver manual messages and Sheets first-class, or still treat them as a side
   feature of a chat platform? Can the useful paste-to-graphic result safely land before 23?
3. Which refactor phases are essential for reliability or the new workflows? Which are optional
   maintenance, overbuilt, ordered poorly or likely to introduce avoidable risk?
4. Can source updates, title collisions, live-binding precedence, row reordering, reconnect or
   retry make the wrong message air? Trace the precise path and smallest protective contract.
5. Are sheets/starters and six graphic formats practical for nontechnical users? Is there a
   simpler solution than the proposed adapters or source model? Explain migration consequences.
6. What YouTube capability is actually needed and feasible? Separate live chat, video comments,
   copying, authorization, recent history, runtime and quota. What should be deferred for Twitch?
7. Are Pause, failure, empty content, manual override and published/local ownership precise
   enough? What races and legacy integrations could break? Check both `/patch` and `/update`.
8. Do the proposed acceptance checks prove the user outcome, not just implementation details?
   Where are migration, performance, output correctness, usability or device checks missing?

## Required output

Start with a verdict of at most ten lines: ready, revise or rethink, and why. Then provide:

- Your independent model and comparison with our candidate. State which parts you would keep,
  replace or remove. Separate owner outcomes from implementation choices you are challenging.
- Concrete operator walkthroughs: paste a WhatsApp/SMS-style message; select a Sheet message;
  choose YouTube input; fill ticker/schedule/standings/credits; connect pushed scores; add RSS.
  Include no compatible graphic and two prepared messages using one graphic. Explain what the
  operator sees, does, and expects when the source changes after staging or while on air.
- A phase-by-phase disposition for all 26: keep, change, combine, reorder or defer, with the
  reason, real dependency and acceptance evidence. Then give your recommended shorter or revised
  sequence. Do not merely add more phases or tests to every concern.
- The most consequential risks or contradictions, ranked. For each, give a failure example,
  evidence, the smallest fix or design decision, and a useful verification case.
- A small prototype/user-trial plan that can settle the big UX decisions before expensive
  implementation. Proposed targets are under 2 minutes for paste and under 5 for a prepared
  Sheet message, without instruction; question these targets if they measure the wrong thing.
- Explicit remaining decisions, measured facts versus assumptions, confidence and limitations.
  Prefer a recommendation with tradeoffs over sending every routine choice back to the owner.

Cite repository paths and current lines for code claims, and primary provider documentation for
external claims. Say what you could not inspect or test. Do not invent browser observations,
provider receipts, timings or support promises. Keep the report clear enough for the product
owner to compare with a second independent review. Do not apply product changes or approve the
plan on my behalf.
