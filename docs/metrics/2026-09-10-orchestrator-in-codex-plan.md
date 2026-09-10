<!-- The delegate's own output, committed unedited as the evidence behind
     docs/metrics/2026-09-10-orchestrator-in-codex.md. Do not edit it: the whole of its value is
     that it is exactly what came back. Written by Codex gpt-5.6-sol at effort high on 2026-09-10,
     from commit 0634d6bd, for the window ending 2026-09-11T03:00:00Z. It planned and nothing
     more - it launched nothing, queued nothing and committed nothing. This is NOT a live wave
     plan and nothing reads it as one; the live plan for that night is in the wave-plan store. -->

# Night wave plan - 2026-09-10

Plan made from `0634d6bd` at 2026-09-10T20:12:14Z.

Pools at plan time: Claude Code has about 10% remaining by the owner's account reading (the local meter has no Claude percentage); Codex is 1% used in its five-hour window and 36% used weekly as of 2026-09-10T20:05:34Z; Antigravity quota is unknown, with 4 calls and 1 failure in the last 24 hours. Bulk work goes to Codex and Antigravity. Claude owns only the specification, verification, and landing wrapper.

Window ends: 2026-09-11T03:00:00Z

## Wave table

| L | goal | START | TOUCHES | MINTS | POOL | browser |
| --- | --- | --- | --- | --- | --- | --- |
| CA | Make the 25 September deck and demo ledger agree with the owner's 10 September calls and the measured CasparCG result | now | `docs/DEMO_2026-09-25.md`; `docs/STUDENT_RELEASE_ACCEPTANCE.md`; `docs/presentation-2026-09-25/make-deck.mjs`; `docs/presentation-2026-09-25/NoaCG-2026-09-25.pptx`; `docs/backlog/deck-contradicts-the-2026-09-10-calls.md`; one CA acceptance file; one CA handoff | the 25 September deck binary regeneration | agy-gemini, fallback codex - bounded cross-file artifact work with a visual acceptance checklist | no |
| CB | Turn the 92-file owner queue into a list containing only work that genuinely needs the owner, and drain the handoffs already spent | now | pre-2026-09-11 files under `docs/acceptance/owner-queue/`; related `docs/backlog/` receipts except the CA and CC reserved receipts; consumed and spent files under `docs/handoffs/`; one CB handoff | the owner-queue drain batch and the handoff deletion batch | codex, fallback agy-gemini after enumeration - long, rule-bound document triage | no |
| CC | Refuse unsupported project resolution and frame-rate values at load and save without losing the user's record | now | `src/model/projectFormat.ts`; `src/model/project.ts`; `src/store/templateStore.ts`; `src/store/saveActions.ts`; `e2e/project-format.spec.ts`; `scripts/e2e-affected.mjs` only if its mapping is incomplete; `docs/backlog/editor-canvas-1920x1880.md`; one CC acceptance file; one CC handoff | the project-format E2E mapping | codex, fallback opus - reproduce-first implementation with a narrow acceptance test | yes |

## What can run at once

CA, CB, and CC are order-free after these ownership rulings:

- CA alone owns the deck generator, generated presentation, demo ledger, and student acceptance ledger. CB must not edit or delete `docs/backlog/deck-contradicts-the-2026-09-10-calls.md` or CA's new acceptance and handoff files.

- CC alone owns the project format model, load/save paths, and `e2e/project-format.spec.ts`. CB must not edit or delete `docs/backlog/editor-canvas-1920x1880.md` or CC's new acceptance and handoff files.

- CB owns all deletion of consumed or spent handoffs. CA and CC only read `2026-09-10-owner-walk-and-the-because-gate.md`; leaving it unchanged on their branches means CB's deletion remains deleted whichever branch lands last.

- Only CC uses the machine browser slot, through `npm run test:e2e:queued -- e2e/project-format.spec.ts`. CA uses presentation rendering, not a browser. CB is document-only.

- No pair changes the same user-visible flow. CA changes the presentation and demo record, CB changes queue classification, and CC changes the editor load/save guard. Only CC may touch an E2E mapping or spec.

- The three rows cost roughly two local session slots: CA and CB are document/artifact wrappers and CC is the single full browser-driving row. That fits the measured 3-4 session ceiling.

The collision input was fresh: `node scripts/worktree-activity.mjs` reported no uncommitted or unmerged work elsewhere, `npm run jobs` reported an empty queue and nothing ahead of main, and `node scripts/merge-order.mjs` reported no ordering question. The refs `claude/ca-deck-and-demo-doc`, `claude/cb-queue-drain-four-reasons`, and `claude/cc-validate-project-format` already exist at exactly `0634d6bd`, with no commits ahead. This dry run was forbidden to inspect their worktrees or determine whether a live session holds them. Before a real launch, the executing orchestrator must rerun the three read-only collision commands and must not create a second holder for any live row.

## Landing

Branches already ahead of `main`: none. `npm run jobs` reports an empty job queue and nothing ahead of main. `node scripts/merge-order.mjs` agrees.

Already-landed branches in the current reporter window are `claude/bq-record-the-2026-09-10-rulings` (`a385fe76`), `claude/bf-ograf-walk-end-to-end` (`9ba2eb27`), `claude/bp-catalog-drift-after-the-shim` (`83d4ec88`), `claude/bs-tutorial-pack-for-one-road` (`46226527`), `claude/noacg-npm-publish-followup-5b7622` (`35bd61ef`), and `claude/bt-widen-and-grow-taller` (`0634d6bd`). They have nothing left to merge.

Today's CA, CB, and CC refs are zero-commit labels at main, not queued branches. Their future landing order is the merge queue's, never this plan's. No queue command ran in this dry planning session.

The primary checkout still contains a `ci-morning-report.local.md` claiming an older main tip had a detached preview-frame failure and an OGraf external-renderer failure. Later handoffs and landings address those reports, but the current GitHub run could not be rechecked because this sandbox denied network access to `api.github.com`. This plan therefore does not call current main red or green on that stale file's authority.

## What I would push back on

### The dry-run limits

- The canonical home step was not run. `node scripts/orchestrator-home.mjs` can create or fast-forward `.claude/worktrees/orchestrator`, while this measurement explicitly forbids touching any other worktree. Reads therefore come from the supplied checkout at the stated `origin/main` commit, `0634d6bd`.

- The durable store and plan checker were not run. Both named wave-plan scripts were explicitly off limits, and the wave-plan store directory was off limits for reading and writing. This document is the permitted stand-in, so the normal machine validation is unavailable.

- The launch phase, queue phase, Monitors, watch loop, candidate refill, and morning report were not started. That is required by the measurement. It also matches the Codex night rule: Codex has no Monitor, so no follow-on or refill may be load-bearing.

- No current CI verdict is asserted. The read-only GitHub query was attempted and failed at the sandbox network boundary.

### Scope and sequencing

- I would not spend tonight on the broad AI-harness merger. The owner has settled the destination, but its first engineering step is a measured Lite-versus-Pro comparison and the full merger crosses two pipelines, admin metering, the wizard, the landing page, contracts, and cost controls. It is a candidate, not a seven-hour tail beside the dated 12 September protection.

- I would not build the Monaco OGraf switch tonight. Its own receipt records the owner's words that it is a vanity item with no hurry and places it under the parked OGraf ladder.

- I would not restore rebuilds for every `main` commit. That buys one easy status comparison for roughly the full monthly Vercel credit. The better route is candidate CH: make `version.json` answer whether production is current using the existing deploy-affecting path list.

- The owner queue has 92 files, not the 78 cited before the latest walk. CB does not promise to delete 92 records blindly. It preserves genuine taste, scope, direction, money, account, identity, harness, and hardware needs; it moves machine-settleable work out of the owner's view and deletes only evidence-backed completions.

- The last coherence commit is dated 2026-09-03, exactly one week ago, not over a week. No overdue coherence row is invented tonight.

### Standing owner asks not started in the three-row core

- `video-through-playout-wrapper` (14d), `dashboard-load-weight` (13d), and `in-app-assistant` (13d): held by the owner's 2026-09-10 alignment answer until after the 25th; he said the dashboard has no known fire.

- `unique-first-catalog` (13d), `variety-within-a-kind-not-only-absent-ones` (6d), `template-variety-and-dedup` (15d), and `catalog-variety-by-programme-type` (7d): useful catalog breadth, but the owner called it non-required vanity for the 25th; dated rehearsal work wins tonight.

- `e2e-webserver-hang-blocks-the-machine` (7d): real reliability work, held because CC owns the only browser slot and the current three rows are the fresh handoff's ranked work.

- `pick-the-behaviour-before-typing-into-the-fields` (6d): a wizard-flow design change, held for a wave that can give it its own browser and flow tests.

- `merge-conflicts-are-resolved-by-a-consult-never-the-owner` (5d): no merge conflict exists tonight; the ask remains a mechanism task, not an owner question.

- `orchestrator-runs-the-same-in-codex` (5d): this invocation is the requested dry measurement. It advances the evidence, but constraints forbid changing the orchestration mechanism if the measurement finds a gap.

- `monaco-shows-ograf-not-only-spx` (0d): parked by the owner's own no-hurry framing.

- `one-noacg-ai-harness-not-lite-and-pro` (0d): candidate CF; held for the comparison-first slice described above.

- `public-copy-should-read-finnish-plain` (0d): candidate CE; it serves the owner's voice ruling but is not more urgent than the 12 September format guard or the already-wrong deck.

- `space-sends-to-preview-then-to-program` (0d): a large dashboard interaction change with keyboard, preview, program, and multi-layer edge cases; held for a dedicated browser wave.

- `version-json-should-answer-is-production-current` (0d): candidate CH; the zero-cost route is clear, but the three-row core fills this Codex night without relying on refill.

- `byo-key-and-create-with-ai-guidance` (15d): the studio steer shipped; `/docs` ordering and the entry card remain, best combined with candidate CF so one AI surface changes once.

- `graphic-use-case-metadata` (13d): the occasion facet shipped; the 466 undeclared designs and Browse-card presentation are a corpus/design round, not tonight's dated core.

- `ram-reclaimer` (13d): the command shipped; watchdog handling remains machine work for a dedicated reliability row.

- `style-step-palettes-match-graphic` (13d): perceptual palette collapse and richer options are design work needing visual comparison.

- `growth-rule-geometry-and-purpose` (11d): vertical growth is done; behaviour-derived sequence semantics are a consequential P2 design row, not a quick implementation tail.

- `back-to-the-wizard` (8d): reopening from Home still needs persisted wizard draft state; held for its own migration-free UI row and browser gate.

- `fit-ladder-exhaustive-sweep` (7d): the sweep exists; scheduling it would consume the machine browser lane tonight.

- `graphics-need-their-own-logic` (7d), `more-behaviours-than-poll-and-quiz` (7d), and `playout-logic-for-all-common-graphics` (15d): the open ranking reorder and remaining recipes are the next P2 prototype round, not mixed into the rehearsal fixes.

- `graphics-without-a-ready-made-template` (7d): the design pass exists; publishing the generated layer contract belongs to its planned phase 2.

- `import-step-copy-a-kid-can-read` (7d): the rewrite shipped; the missing cold read needs a stranger, not an unattended delegate pretending to be one.

- `instruction-files-need-a-shrinking-mechanism` (7d) and `memory-store-drain` (7d): important orchestration maintenance, but neither serves the 12th more directly than CA-C and the dry-run constraints forbid editing the orchestrator contract here.

- `run-a-real-audience-vote` (7d): the real phone-to-production run and short tutorial remain; they require account/real-people conditions not available unattended.

- `cloud-sessions-for-stateless-rows` (6d): remote isolation has been measured as a no-op and no cloud landing bridge is proven on this account.

- `teams-invite-join-code-and-what-a-new-member-sees` (6d): email invitation and join-code work are P1, behind the NOW rehearsal tonight; any migration would also be a scope edge.

- `playout-lag-when-working-the-queue` (5d): the fast private command road shipped; only cross-device ordering and the owner's walk remain, neither a hidden night fix.

- `the-mapping-step-should-explain-and-offer-to-do-it` (5d): the product asks shipped; the CLI agent road remains and is held for the agent-platform ladder.

- `the-text-step-breaks-when-you-play-with-it` (5d): the reproducible half and panel growth fixes shipped; the second symptom still lacks a reproduction, so a future row starts there.

- `weekly-alignment-check-is-the-only-owner-gate` (5d): served in code and rehearsal; it remains only until the first real 2026-09-15 run.

- `are-the-big-contracts-still-worth-loading` (3d): the three audits exist; the 34 proposed retirements deserve one deliberate contract row, not a night tail.

- `signed-in-looks-identical-to-signed-out` (0d): the state label shipped; the remaining question is what an account is for, a direction ruling rather than unattended copy work.

The owner-queue depth is 92 files. It is a record, never a gate; CB is planned precisely because the owner should not have to inspect machine-decidable items.

## The prompts, and every row's route

Start now: CA, CB, CC. No follow-ons. No refill.

```text
SESSION CA - deck and demo
BRANCH claude/ca-deck-and-demo-doc
MODEL  agy-gemini / gemini-3.7-flash-high - bounded artifact and cross-file consistency work; fallback codex / gpt-5.6-sol high
START  now
TOUCHES docs/DEMO_2026-09-25.md; docs/STUDENT_RELEASE_ACCEPTANCE.md; docs/presentation-2026-09-25/make-deck.mjs; docs/presentation-2026-09-25/NoaCG-2026-09-25.pptx; docs/backlog/deck-contradicts-the-2026-09-10-calls.md; docs/acceptance/owner-queue/2026-09-10-ca-deck-matches-the-day.md; docs/handoffs/2026-09-10-ca-deck-and-demo-doc.md   MINTS the 25 September deck binary regeneration
GOAL   The generated deck, its notes, and the demo ledgers tell one current story: the day stops at the NoaCG player, the take-home and two indexes are visible, and A4/A6 carry the real CasparCG result without claiming SDI, the hosted-origin permission, or venue networking was proven.
WHY    The deck the owner has not opened yet contradicts three decisions made on 10 September, and its worst slide teaches the room to configure playout paths deliberately cut from the day.
READ   docs/backlog/deck-contradicts-the-2026-09-10-calls.md; docs/handoffs/2026-09-10-owner-walk-and-the-because-gate.md; docs/handoffs/2026-09-10-bh-caspar-real-server.md; docs/DEMO_2026-09-25.md; docs/STUDENT_RELEASE_ACCEPTANCE.md; docs/presentation-2026-09-25/make-deck.mjs; docs/presentation-2026-09-25/README.md if present.
DELEGATE Resolve your worktree with `git rev-parse --show-toplevel`, write acceptance conditions first, then use `npm run agy -- --write` with literal absolute paths to exactly the seven existing files named above and no directory search. Antigravity may edit the markdown and generator; the owning session keeps regeneration, visual inspection, verification, commits, and landing. If the wrapper refuses or returns no usable patch, record the prompt defect and use the Codex rescue workflow.
DO     1. Rename the branch to `claude/ca-deck-and-demo-doc` and confirm it. 2. Invoke the Presentations skill, update A4/A6 and the gap rows from BH's measured evidence, and correct slides 3, 5, and 7 plus notes without restoring a cut demo path. 3. Preserve the old PPTX outside the generator's output path, regenerate, render every slide and notes page, inspect critically for clipping, hierarchy, spacing, and contradictions, and discard the backup only after the new artifact passes. 4. Re-read every status sentence against BH's limits, update the backlog receipt, and add the one-minute owner route.
CORE   Steps 1-3 are the core. If the window tightens, cut prose polish before any truth correction or visual inspection.
TRAPS  No chat-only trap. The generator overwrite refusal, Chromium 71 finding, collapsed 2.3 flex gaps, hosted-origin permission gap, and screen-consumer-versus-hardware limit are all in the READ files.
GATE   Run `npm run build`; run the presentation skill's structural and rendered-slide checks; push and read the CI run to a verdict, including which jobs ran. Commit each verified step.
QUEUE  Then, as your LAST THREE actions and in this order: 1. run /check (review delegated, simplify inline, verify inline, taste answered on the rendered deck); 2. write docs/handoffs/2026-09-10-ca-deck-and-demo-doc.md with what is left and why, evidence, chat-only traps, anything needing the owner, and commit/check/acceptance pointers; 3. run /queue-merge. Commit and queue only green work that stands alone; leave unfinished work uncommitted and describe it. Do not commit after queueing, never merge main yourself, and never end waiting on a CI run, landing, watcher, or background process.
```

```text
SESSION CB - queue drain
BRANCH claude/cb-queue-drain-four-reasons
MODEL  codex / gpt-5.6-sol high - long rule-bound document triage that is short to specify; fallback agy-gemini only after every input file is enumerated
START  now
TOUCHES every pre-2026-09-11 file under docs/acceptance/owner-queue/ except CA/CC reserved outputs; related docs/backlog receipts except deck-contradicts-the-2026-09-10-calls.md and editor-canvas-1920x1880.md; consumed and spent docs/handoffs files; docs/handoffs/2026-09-10-cb-queue-drain-four-reasons.md   MINTS the owner-queue drain batch and handoff deletion batch
GOAL   Every owner-facing queue item says the genuine reason it needs the owner, machine-settleable work is classified away from the owner's walk, mixed items are split, and every consumed or spent handoff is deleted only after its remaining facts point to durable evidence.
WHY    The owner opened an 80-item phone list and found half of a sample did not need him; the current folder has 92 files, so genuine taste and direction questions are being hidden by technical work the machine can settle.
READ   docs/backlog/owner-items-are-filed-at-the-wrong-kind.md; docs/handoffs/2026-09-10-owner-walk-and-the-because-gate.md; docs/acceptance/OWNER_QUEUE.md; scripts/check-owner-queue.mjs; scripts/check-owner-queue.test.mjs; every file under docs/acceptance/owner-queue/; the Handoffs classifications in this plan.
DELEGATE Resolve the owning worktree's absolute path, freeze an explicit manifest of the 92 input files, write the four-way acceptance rubric first, then use the Codex rescue workflow for the bulk classification and patches. The owning session re-derives every deletion and reason. If Codex is unavailable, Antigravity is allowed only with the literal manifest because its installed build's search behavior is unverified and prior grep-style sweeps returned nothing.
DO     1. Rename the branch to `claude/cb-queue-drain-four-reasons` and confirm it. 2. Measure the starting set and classify each item: keep `walk`/`walk-p` only for taste, scope, direction, or money; use `owner-action` only for account, identity, harness, or money; keep real-world equipment/people as hardware; move machine-decidable work to `agent`; split mixed files. 3. Settle cheap read-only or document-only agent items now and delete only those whose route was actually driven; never turn uncertainty into a reason to keep the owner. 4. Repoint every citation before deleting the consumed and spent handoffs listed in this plan; leave every deferred handoff. 5. Run the queue checker and report before/after counts by kind, not merely total files.
CORE   Classification of all 92 starting files and safe handoff drain are the core. Actually settling agent items is the tail and stops before it needs the browser slot.
TRAPS  The target is fewer questions, not no questions: the owner's final words in the owner-walk handoff say he expects to be asked sometimes. A body that ends with one real judgement after mechanical prose must be split, not deleted whole.
GATE   Run `npm run check:owner-queue`, then `npm run build`; push and read the CI run to a verdict, including which jobs ran. Commit coherent verified batches so a partial green drain can stand alone.
QUEUE  Then, as your LAST THREE actions and in this order: 1. run /check (review delegated, simplify inline, verify inline, taste not applicable); 2. write docs/handoffs/2026-09-10-cb-queue-drain-four-reasons.md with before/after counts, every unsettled class and why, evidence, chat-only traps, and commit/check pointers; 3. run /queue-merge. Commit and queue only green work that stands alone; leave unfinished work uncommitted and describe it. Do not commit after queueing, never merge main yourself, and never end waiting on a CI run, landing, watcher, or background process.
```

```text
SESSION CC - validate project format
BRANCH claude/cc-validate-project-format
MODEL  codex / gpt-5.6-sol high - reproduce first, then implement against a narrow existing format spec; fallback opus high
START  now
TOUCHES src/model/projectFormat.ts; src/model/project.ts; src/store/templateStore.ts; src/store/saveActions.ts; e2e/project-format.spec.ts; scripts/e2e-affected.mjs only if mapping is incomplete; docs/backlog/editor-canvas-1920x1880.md; docs/acceptance/owner-queue/2026-09-10-cc-unsupported-format-is-stated.md; docs/handoffs/2026-09-10-cc-validate-project-format.md   MINTS the project-format E2E mapping
GOAL   A template carrying an unsupported resolution or frame rate cannot silently become the open or saved graphic; the app states the exact problem, preserves the record, and valid catalog formats still load, autosave, reopen, and save normally.
WHY    `validateProjectFormat()` already identifies the owner's 1920x1880 value and has no caller, so a room of students on 12 September can load and persist an unsupported canvas without one warning.
READ   docs/backlog/editor-canvas-1920x1880.md; docs/handoffs/2026-09-10-owner-walk-and-the-because-gate.md; src/model/AGENTS.md; src/store/AGENTS.md; src/model/projectFormat.ts; src/model/project.ts; src/store/templateStore.ts; src/store/saveActions.ts; e2e/project-format.spec.ts; scripts/e2e-affected.mjs.
DELEGATE Resolve the owning worktree's absolute path, reproduce with a synthetic saved project whose template is 1920x1880, and write exact acceptance assertions before invoking the Codex rescue workflow. Give Codex literal absolute paths to the files above and permission only to edit those paths. The owning session reviews the data-loss boundary, runs the browser proof, records the outcome, and lands. If Codex is unavailable, continue on opus high.
DO     1. Rename the branch to `claude/cc-validate-project-format` and confirm it. 2. Reproduce the silent load and save on current main; record the observed result before diagnosis. 3. Put one reusable validation boundary at the narrowest load/save seam so autosave, library save, Save As, reopen, and cloud upsert cannot disagree; use the existing validator and keep an invalid record recoverable rather than normalizing or deleting it. 4. Add a visible, plain-language error path and Playwright coverage in the existing project-format spec for invalid load and invalid save, plus regression coverage for valid formats. Update the affected mapping only if the current mapping does not select the spec. 5. Add the under-a-minute acceptance route and advance the finding receipt with exactly what is and is not explained.
CORE   Reproduction, the shared guard, and the two-direction E2E proof are the core. Copy refinement and receipt wording are the tail.
TRAPS  The original 1920x1880 graphic cannot be identified and is not a prerequisite. Do not claim to explain where the value came from. Code is canonical, so a hand-edited unsupported value must degrade safely and visibly, not be silently rewritten.
GATE   Run `npm run build`, then acquire the one browser lane with `npm run test:e2e:queued -- e2e/project-format.spec.ts`; inspect the rendered error and unchanged record critically. Push and read CI to a verdict, including which jobs ran. Commit each verified step.
QUEUE  Then, as your LAST THREE actions and in this order: 1. run /check (review delegated, simplify inline, verify inline, taste answered on the rendered error); 2. write docs/handoffs/2026-09-10-cc-validate-project-format.md with the reproduction, evidence, what remains unexplained, chat-only traps, and commit/check/acceptance pointers; 3. run /queue-merge. Commit and queue only green work that stands alone; leave unfinished work uncommitted and describe it. Do not commit after queueing, never merge main yourself, and never end waiting on a CI run, landing, watcher, or background process.
```

Launch status for this measurement: not launched. The hard constraint forbids Agent sessions, delegate harness calls, rows, branches, jobs, servers, queues, and background watches. The launch module was therefore not entered, and the prohibited plan checker was not run.

## Open questions, then one pick

No open question passes the ask-test. The machine has enough information to choose the work, the delegate pools, the non-destructive invalid-format behavior, and the presentation's truthful wording. Real hardware, hosted-origin Local Network Access, and owner taste remain recorded for later, but none blocks CA-C.

Pick: DELEGATE-FIRST - CA fixes the teaching artifact through Antigravity, CB drains machine work from the owner's list through Codex, and CC protects the rehearsal's saved graphics through Codex.

## The morning report

No wave ran in this dry measurement, so there will be no morning result from it. If an authorized invocation later launches this plan, re-invoke the orchestrator after 2026-09-11T03:00:00Z to produce the report; Codex has no Monitor and this plan has no follow-on or refill.

## Candidates

These are next-wave candidates only. This Codex dry run launches none of them and has no refill loop.

| L | size | serves | TOUCHES | SPECS | goal | browser |
| --- | --- | --- | --- | --- | --- | --- |
| CE | standard | owner receipt `public-copy-should-read-finnish-plain`; public voice | `index.html`; `scripts/check-copy.mjs`; `scripts/copy-baseline.json`; one CE acceptance file | `e2e/landing.spec.ts` | Shorten the landing page, remove slogans and unstable counts, and record the Finnish-plain product-copy rule after the rewrite proves it | yes |
| CF | large | owner receipts `one-noacg-ai-harness-not-lite-and-pro` and `byo-key-and-create-with-ai-guidance` | `src/ai/lite/`; `src/ai/pro/`; `src/components/wizard/`; `src/admin/`; `index.html`; relevant contracts | `e2e/ai.spec.ts`, `e2e/ai-lite.spec.ts`, `e2e/ai-more-control.spec.ts`, `e2e/landing.spec.ts` | Measure the two hosted pipelines, choose one internal road, and expose one model-free Create with AI path while keeping BYO keys and the own-agent route first | yes |
| CG | small | owner-walk handoff item 5; truthful harness evidence | `docs/metrics/2026-09-09-harness-verdict.md`; its acceptance and handoff | none | State the metric window and filter beside the harness verdict headline so its number can be re-derived without changing the conclusion | no |
| CH | small | owner receipt `version-json-should-answer-is-production-current`; P5 reliability | `scripts/write-version.mjs`; `scripts/deploy-affecting-paths.mjs`; `scripts/deploy-affecting-paths.test.mjs`; related deployment docs | none | Add the newest deploy-affecting commit and a plain current boolean to `version.json` without rebuilding documentation-only commits | no |

## Handoffs

- deferred: `2026-09-09-ay-per-job-cost.md` - its rule candidate belongs to a job-store evidence wave, not CA-C.

- deferred: `2026-09-10-ba-ladder-frame-detach.md` - the PreviewFrame race needs a browser reliability row; CC's browser work is elsewhere.

- deferred: `2026-09-10-bd-drain-the-twelve.md` - it concerns the handoff drain mechanism, while CB is draining the owner queue and deleting only already-classified handoffs.

- deferred: `2026-09-10-be-agent-road-clean-profile.md` - its production-only CLI findings are not dated by the 12th or 25th.

- deferred: `2026-09-10-bf-ograf-walk-end-to-end.md` - renderer identity and `dispose()` are recorded but not machine-continuable tonight.

- deferred: `2026-09-10-bg-playout-lag.md` - instrument self-measurement needs a browser bench wave.

- consumed: `2026-09-10-bh-caspar-real-server.md` -> row CA.

- spent: `2026-09-10-bj-published-path-lag.md` - the transport diagnosis and successor fix already landed; CB may delete after repointing citations.

- spent: `2026-09-10-bk-flex-gap-on-old-engines.md` - its compatibility verdict landed; CB may delete after repointing citations.

- spent: `2026-09-10-bm-verbs-on-both-roads.md` - the private-topic successor landed; CB may delete after repointing citations.

- deferred: `2026-09-10-bn-private-command-topic.md` - cross-device clock semantics is a security-adjacent gate that should land alone.

- spent: `2026-09-10-bp-catalog-drift-after-the-shim.md` - its verdict landed and its remaining note is carried durably.

- spent: `2026-09-10-bq-record-the-2026-09-10-rulings.md` - the four answers are in `docs/OWNER_RULINGS.md` and their resulting receipts are durable.

- deferred: `2026-09-10-bs-tutorial-pack-for-one-road.md` - a second tutorial road is not dated by Friday and the live-vote sample remains blocked.

- deferred: `2026-09-10-bt-widen-and-grow-taller.md` - behaviour-derived sequence semantics and the remaining text-box surface need their own design/UI rows.

- consumed: `2026-09-10-owner-walk-and-the-because-gate.md` -> rows CA, CB, and CC; CB owns deletion after repointing.

## Weekly review

- none owed: `npm run weekly:candidates` reports that `2026-09-10-orchestrator-week.local.md` proposes no candidate rows. Its four alignment answers have already landed in `docs/OWNER_RULINGS.md`.

## Owner receipts

- planned: `editor-canvas-1920x1880` (finding, 12d) -> CC.

- measured here: `orchestrator-runs-the-same-in-codex` (ask, 5d) -> this dry run exercises the planner in Codex; no mechanism edit is permitted here.

- candidate: `public-copy-should-read-finnish-plain` (ask, 0d) -> CE.

- candidate: `one-noacg-ai-harness-not-lite-and-pro` (ask, 0d) -> CF.

- candidate: `version-json-should-answer-is-production-current` (ask, 0d) -> CH.

- deferred: `video-through-playout-wrapper` (ask, 14d), `dashboard-load-weight` (ask, 13d), `in-app-assistant` (ask, 13d) -> owner said not before the 25th unless a dashboard fire appears.

- deferred: `unique-first-catalog` (ask, 13d), `variety-within-a-kind-not-only-absent-ones` (ask, 6d), `template-variety-and-dedup` (ask, 15d), `catalog-variety-by-programme-type` (ask, 7d) -> valuable breadth, not required for the 25th.

- deferred: `e2e-webserver-hang-blocks-the-machine` (ask, 7d), `ram-reclaimer` (ask, 13d), `fit-ladder-exhaustive-sweep` (ask, 7d) -> dedicated machine/browser reliability wave.

- deferred: `pick-the-behaviour-before-typing-into-the-fields` (ask, 6d), `back-to-the-wizard` (ask, 8d), `space-sends-to-preview-then-to-program` (ask, 0d) -> dedicated wizard/dashboard UI waves.

- deferred: `merge-conflicts-are-resolved-by-a-consult-never-the-owner` (ask, 5d) -> mechanism row when collision evidence exists.

- parked: `monaco-shows-ograf-not-only-spx` (ask, 0d) -> owner called it no-hurry vanity.

- deferred: `byo-key-and-create-with-ai-guidance` (ask, 15d) -> combine remaining public AI copy with CF.

- deferred: `graphic-use-case-metadata` (ask, 13d), `style-step-palettes-match-graphic` (ask, 13d) -> corpus/design rounds.

- deferred: `growth-rule-geometry-and-purpose` (ask, 11d), `graphics-need-their-own-logic` (ask, 7d), `graphics-without-a-ready-made-template` (ask, 7d), `more-behaviours-than-poll-and-quiz` (ask, 7d), `playout-logic-for-all-common-graphics` (active programme receipt, 15d) -> P2 design and prototype rounds.

- deferred: `import-step-copy-a-kid-can-read` (ask, 7d) -> stranger cold read still needed.

- deferred: `instruction-files-need-a-shrinking-mechanism` (ask, 7d), `memory-store-drain` (ask, 7d), `are-the-big-contracts-still-worth-loading` (ask, 3d) -> dedicated instruction-system maintenance.

- deferred: `run-a-real-audience-vote` (ask, 7d) -> requires a published production, phone, and real audience path.

- deferred: `cloud-sessions-for-stateless-rows` (ask, 6d) -> no proven remote executor or landing bridge.

- deferred: `teams-invite-join-code-and-what-a-new-member-sees` (ask, 6d) -> P1 after the NOW rehearsal, with any migration treated as a scope edge.

- deferred: `playout-lag-when-working-the-queue` (ask, 5d) -> fast road shipped; owner walk and cross-device ordering remain.

- deferred: `the-mapping-step-should-explain-and-offer-to-do-it` (ask, 5d) -> only the CLI road remains.

- deferred: `the-text-step-breaks-when-you-play-with-it` (ask, 5d) -> reproduce the remaining symptom before another fix.

- deferred: `weekly-alignment-check-is-the-only-owner-gate` (ask, 5d) -> held until the first real 2026-09-15 run proves it.

- deferred: `signed-in-looks-identical-to-signed-out` (ask, 0d) -> remaining account-purpose direction question.

- parked: `noacg-desktop-client` (14d), `github-topics-reserve` (13d), `output-health-indicator` (12d), `git-push-allow-hook` (11d), `mistake-trigger-hooks` (9d) -> their recorded owner rulings or missing measurement still hold.

- deferred finding: `live-vote-fields-that-do-not-work` (7d) -> field-shape question remains on its durable receipt.

## Heartbeat

- 2026-09-10T20:12:14Z PLAN ONLY - grounded at `0634d6bd`; no home update, store write, plan check, launch, queue, branch operation, background watch, or other worktree access was performed.