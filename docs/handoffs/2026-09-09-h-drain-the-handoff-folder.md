# The handoff folder went from 37 files to empty, and every citation into it was repointed first

Branch `claude/h-drain-the-handoff-folder`, from `main` at `ae5a32b9`, six commits.

**37 files deleted, oldest first, in four commits.** No file was deleted on its own "what is left"
heading. Every open item was traced individually to a landed commit, a backlog file, a contract
rule, a source header, an owner-queue item or a roadmap section - or judged optional and deleted
with the file, which the owner asked for by name and which is recorded below rather than filed.

The predecessor drain (`claude/p-handoff-drain`, 2026-09-09) kept fifteen files and wrote down
exactly what held each. **That work is what made this row possible, and this row is the other half
of it**: seven were held only by a live citation, three by a one-paragraph edit somebody else owned
that night, five were that wave's own. All three of those edits are in this branch, so all fifteen
are free.

## The thing that took the row: repointing, not deleting

`docs/backlog/README.md` forbids leaning on a file designed to disappear, and
`collisions.md` says to grep prose as well as paths. Both were right and both were expensive.

**35 citations written as a path, plus two written without one, across 27 files** - 21 backlog
items, six `source` fields in `scripts/harness-capabilities.json`, two script headers,
`docs/CI_STABILITY.md`, `docs/BRAND_PLAN.md` and a metrics record. Each now states its own fact and
cites something durable: the code, the contract, or `git show <sha>:<path>` at worst. The two
without a path are the ones that matter for the next drain, because a path grep never sees them:

- `docs/BRAND_PLAN.md:278` - "the landed row <1> handoff", in the READ line of an unbuilt binding
  row. It now names `src/model/brand.ts` and `packets.ts` instead, which is stronger anyway.
- `docs/backlog/check-fanout-in-launched-sessions.md:57` - three handoffs by bare filename and line
  number. Their words are quoted in the file now.

Three citations carried an argument that lived nowhere else, so it was written INTO the citing file
rather than repointed: the shadow-root-versus-parser trade-off for the OGraf document boundary (into
`ograf-markup-inline-styles.md`), the quiz board's 49px of honestly honourable room (into
`a-panels-growth-direction-ignores-what-travels.md`), and the spanner narrowing that removed "stay
exactly as drawn" for panel furniture (into `docs/TEXT_BOX_BINDING.md`, beside the decision it
qualifies). The type-floor owner-queue item gained the four residue designs it had never listed.

## The trace table

One row per file. "Where it went" is where the open items now live; every entry was opened and read.

| handoff | open items | where they went |
| --- | --- | --- |
| `2026-09-02-a-teams-spec-diagnosability` | the dangling-pointer check; seven references to triage | `a-handoff-kept-on-purpose-has-no-class.md`, which now carries the gate as a third option, why it cannot land as a one-liner, and what a manual repoint costs |
| `2026-09-02-b-queue-walks-itself` | two unsettled queue items; the agent-kind reporter | `a-counting-graphic-airs-a-zero.md` and `apply-plain-style-names.md`; the counting half closed by `086aa030`; `agent-queue-items-have-no-reporter.md` |
| `2026-09-02-c-ograf-host-page` | eight review findings; two unverified renderer questions | seven OGraf backlog items plus `css-rule-walker-shared.md`; both renderer questions are now the first thing `spx-gc-ograf-round.md` asks a real renderer |
| `2026-09-02-d-leaving-the-wizard` | dialog duplication; kit/Pro doors; acceptance; e2e lock | new `one-dialog-body-and-one-backdrop-guard-written-out-many-times.md`; `back-to-the-wizard.md`; walked and deleted by `f80e9ec8`; `e2e-webserver-hang-blocks-the-machine.md` carries all three fixes |
| `2026-09-02-d-mistake-trigger-hooks` | four | one hook landed 2026-09-05; one is `mistake-trigger-hooks.md` "What is left"; two are `docs/MISTAKE_TRIGGERS.md`'s own unbuilt list; the last is `warn-command.mjs`'s header, and its `jobsDir` half went into `dev-port-resolves-the-git-directory-by-guessing.md` |
| `2026-09-04-t-shard-cap-poisons-every-gate` | bin-packing watch; durations gate; a stale API read | `docs/VERIFICATION.md` recorded the first bin-packed run; `e2e-durations-table-drifts-unwatched.md`; the stale read deleted (one occurrence, consumer retired) |
| `2026-09-04-u-honest-timings-and-selection` | overhead recording; hand-refreshed table; issue #53; three workflows | recorded in `scripts/e2e-durations.json`; `the-durations-table-is-refreshed-by-hand.md`; #53 lives on GitHub; the three cache adoptions deleted as optional |
| `2026-09-06-a-brand-model-chooser` | row 2, section 6, thumbnails, the `minimal` degradation | `docs/BRAND_PLAN.md` §4 and §6 and its own owner-queue item; the degradation is stated in `packets.ts:275-279`, so that item had already landed |
| `2026-09-06-cloud-lander` | six, all programme-shaped | `docs/WORKFLOW_ARCHITECTURE.md` phases 1c, 1d, 2a; the retired-name mechanism it called unbuilt now exists as `contracts/retired.json` |
| `2026-09-06-f-growth-question` | the narrowing; the grow-follower spec; the double sweep; wording | `docs/TEXT_BOX_BINDING.md` (written in here); `no-spec-covers-a-declared-grow-follower.md`; the shared pass recorded in the same paragraph; `2026-09-06-f-one-less-question-on-import.md` |
| `2026-09-07-phase-2b-contract-migration` | nine | `WORKFLOW_ARCHITECTURE.md` phases 2b, 3 and 4; `four-checks-each-spawn-their-own-git-ls-files.md`; `a-stacked-branch-queues-its-parents-commits.md`; `draft-ts-out-of-components.md`; the seven worktrees deleted as housekeeping needing fresh measurement |
| `2026-09-07-phase-2b-first-areas` | five | the wizard contract migrated; `contracts/retired.json` built; #85 and #90 on GitHub; new `the-configured-suite-has-no-quarantine.md`; the cross-check practice is in `contracts/records/model/2026-09-08-*` |
| `2026-09-08-blocks-contract-migrated` | four | `src/model` migrated; retired names built; new `four-blocks-modules-have-no-rule-in-the-migrated-contract.md`; `stub-provider-crashes-on-lower-third.md` and `armed-delete-disarms-on-blur.md` |
| `2026-09-08-f-gates-that-measure-nothing` | five | three named backlog files plus `advisor-gate-runs-nowhere.md`; the fifth is new: `the-ai-gateway-runner-keeps-two-parallel-file-lists.md` |
| `2026-09-08-g-import-name-collision` | five doors and tie-breaks | all five in `two-doors-still-mint-a-twin-under-a-taken-name.md` |
| `2026-09-08-h-landing-truth` | two owner judgement calls | `2026-09-08-the-landing-page-says-what-it-can-prove.md` |
| `2026-09-08-j-squash-or-merge` | merge method; nothing schedules `land:ruleset`; a lesson | both written into `ruleset-drift-compares-objects-as-object-object.md`, with row J's sizing corrected; the lesson is `gates.mjs`'s glob discovery, described in `WORKFLOW_ARCHITECTURE.md` phase 1d |
| `2026-09-08-k-allowlist-friction` | the ignored settings file; a historical scan | `the-allowlist-is-not-what-stops-a-row-at-night.md` (parked, `needs-owner: harness`); `blocked-sessions-cannot-tell-waiting-from-abandoned.md` |
| `2026-09-08-l-panel-that-never-grows` | the wider-then-taller owner look | carried into `a-panels-growth-direction-ignores-what-travels.md` with the numbers |
| `2026-09-08-o-ticker-speed-field` | stale titles; rotator swap; the rotators question | `src/templates/tickers/AGENTS.md`; `a-rotating-ticker-holds-at-a-rate-nobody-can-change.md`; `2026-09-09-a-ticker-you-can-slow-down.md` |
| `2026-09-08-orchestrator-on-the-queue`, `-q-oss-community-files`, `-r-deploy-verify-patience` | none open; row Q's cross-row finding | `code-review-scopes-a-branch-against-a-stale-main.md`; row R's parser findings are `a-wrapped-owner-answer-is-recorded-truncated.md` and `an-owner-answer-on-the-next-line-is-lost.md` |
| `2026-09-08-s-loop-liveness-signals` | a stuck pull request; the stale local `main`; a duplicated scan | PR 102 landed as `c68f2a92`; row T landed `check:landed-ref`; `cleanup-worktrees-dedup-and-speed.md` |
| `2026-09-08-type-aware-size-floor` | four unlisted residue designs | appended to `2026-09-08-type-aware-size-floor.md` in the owner queue |
| `2026-09-09-b-browse-page-reset-signature` | the filing guard | now a rule in `docs/backlog/README.md` |
| `2026-09-09-day-wave` | three defects; the `--list` trap; a `hold` rule; the effort floor | three backlog files; both rules rescued into `collisions.md` and `queue-merge.md` by this row's review; `docs/HARNESS_ROUTING.md:594` |
| `2026-09-09-e-refill-scarce-slot` | a CI leg; a night.md sentence; row M's precondition | `finished-looking-needs-a-ci-leg.md` and the liveness backlog file; the precondition deleted as speculative |
| `2026-09-09-f-weekly-candidates` | the wrapped answer; the dev-port guess | `a-wrapped-owner-answer-is-recorded-truncated.md`; `dev-port-resolves-the-git-directory-by-guessing.md` |
| `2026-09-09-p-handoff-drain` | fifteen kept files, each with its reason | this row, entirely |
| `2026-09-09-t-stale-main-ref` | `/code-review`'s scope | `code-review-scopes-a-branch-against-a-stale-main.md`, `needs-owner: harness` |
| `2026-09-09-u-wave-plan-survives` | the instruction-chain ceiling | `instruction-files-need-a-shrinking-mechanism.md` - and this row paid it, below |
| `2026-09-09-v-port-registry-race` | `--prune` tidiness; a live intermittent | the tidiness deleted, on its own row's word; `the-fit-ladder-spec-detaches-its-own-frame.md` |
| `2026-09-09-w-walk-covers-a-route` | one owner question | `2026-09-09-a-walk-now-covers-a-route.md` |
| `2026-09-09-x-capability-reprobe` | three | `harness-routing-doc-cites-four-refuted-claims.md`, `owner-receipts-serves-diffs-against-local-main.md`, and the cadence answered by `docs/ROUTINES.md:79-90`, which chose report-never-reprobe deliberately |
| `2026-09-09-y-measured-holes` | the unreachable-call limit; the `[object Object]` species | the limit is written over `judgeMeasurement` with a test pinning it; `ruleset-drift-compares-objects-as-object-object.md` |
| `2026-09-09-z-rename-takes-the-mint` | a red local baseline; two kept-on-purpose facts | `a-fourth-data-holder-appears-in-credits-on-this-laptop.md`; both facts are code comments |

## Deleted as optional, named rather than filed

The owner's instruction, verbatim: *"be mindful that we should not invent work. If the handoffs are
clearly optional and not high or even medium priority, then we can delete them."* Fourteen items
went this way. Each is here so the judgement can be reversed:

- Adopting the dependency cache in `configured-suite.yml`, `hosted-latency.yml` and
  `weekly-audit.yml` - none is cap-bound, and the last deliberately wants a real registry round.
- Issue #53 and issue #85's per-file diagnosis - GitHub is their durable home.
- One unreproduced stale run-list read, whose consumer (`main-health.mjs`) has since been retired.
- Seven worktrees called disposable two days ago; ancestry has to be re-measured before anyone acts.
- `dev-port --prune` not sweeping `claim-*.lock` and `*.dead` files - its own row called it tidiness
  and explained why neither can wedge anything.
- A queue-fairness case where a browser job starves behind land-watch slices - fairness, not
  correctness, and its row said so.
- Coverage instrumentation over every gate's `measured` calls - the measuring row judged it bigger
  than its value, and the receipts print beside each gate name in the build log anyway.
- A logo thumbnail in a `<select>`, which the brand creator row will decide with the section in
  front of it.
- Two container-only e2e failures and the headless-shell shim that worked around one.
- The corpus test's three-minute container ceiling.
- Two CI jobs that duplicate a version fetch ON PURPOSE, so the two mechanisms keep agreeing.
- `post-land.yml` announcing itself as a production deployment - its own row judged the fix (a
  separate environment) not worth doing on that evidence.
- Row W's two grouping calls, decided rather than deferred.
- Row M's second precondition, which its row did not model and which may never recur.

## Kept, filed or written in

Four new backlog items, for open items that lived nowhere else and are not optional:

- `the-ai-gateway-runner-keeps-two-parallel-file-lists.md` - two hand-written 22-entry lists of the
  same files, `.ts` and `.js`. Add a file to one and it compiles and never runs. Two lines to fix.
- `four-blocks-modules-have-no-rule-in-the-migrated-contract.md` - the item is the reporting gap,
  not the four files: a rule naming a removed mechanism is caught, a module with no rule is
  invisible, and only one of those leaves a trace.
- `one-dialog-body-and-one-backdrop-guard-written-out-many-times.md` - six body sites and twelve
  guard sites, grown by half in a week.
- `the-configured-suite-has-no-quarantine.md` - the tier covering teams has the flake failure mode
  and none of the machinery phase 1c built, cross-referenced against the item that narrows the
  `ci.yml` version so nobody files a third.

Six existing files gained what a deleted handoff held: `a-handoff-kept-on-purpose-has-no-class.md`
(a fourth occurrence with a measured cost and a third option), `ruleset-drift-...` (row J's two
neighbours), `spx-gc-ograf-round.md` (the two renderer questions), `dev-port-resolves-...` (the
absolute-path hook consequence), `a-panels-growth-direction-...` and `docs/backlog/README.md`.

## Nothing was kept, and that is the one thing to sanity-check

All 37 went. With the folder empty, `node scripts/handoff-drain.mjs` printed "holds no tracked
handoff files - nothing to drain", and both readers of the directory (`handoff-drain.mjs`,
`session-start.mjs`) handle its absence. This file puts a tracked file back in it, so the drain now
reports exactly one unclassified - itself. **That is the mechanism working**: a handoff written
today is unclassified until the next plan reads it and says what it did with it. Three sessions of
this wave are still running and their handoffs land after this one; none was touched.

**Where I would look first if a deletion turns out to have been wrong:** the four 2026-09-07 and
2026-09-08 contract-migration files. Their items are roadmap-shaped and I traced them to
`docs/WORKFLOW_ARCHITECTURE.md` sections rather than to individual receipts, which is a weaker kind
of trace - true, but coarser. Everything else traced to something specific.

## The delegation, and what it was worth

`codex` / `gpt-6-astra` / effort `medium`, through `scripts/codex-rescue.mjs`, one launch, 22
minutes. Recorded with `node scripts/delegation-outcome.mjs` as **`repaired`, cause `prompt`**.

It covered **17 of 37 files and said so plainly** instead of guessing the rest, which is the
behaviour worth paying for. Every claim I spot-checked held: `back-to-the-wizard.md` carrying the
kit doors, `docs/VERIFICATION.md` recording the first bin-packed run, `ograf-checker-83-rules.md`
recording the ajv mismatch, `docs/metrics/2026-09-07-blocks-migrated.md` naming the four uncovered
modules. **It corrected two of my own conclusions**: `contracts/retired.json` and
`check-retired-names.mjs` exist, so two handoffs calling that mechanism unbuilt were stale; and the
four blocks modules were already recorded, which turned a duplicate backlog file into a useful one
about the reporting gap instead.

One conclusion was wrong, and it is mine rather than the model's. It read the wizard-exit acceptance
item as lost because the file is absent, when `f80e9ec8` walked and deleted it - a direct
consequence of my "run no git" instruction, which was there because twelve gates here shell out to
git and all twelve fail in a delegate's environment. **Cause `prompt` on both counts**: a 37-file
scope in one call, and a ban that removed the only tool that answers "consumed or lost". Next time,
split the file list across calls and hand the delegate a pre-computed deletion log instead of
banning git.

## Check

`review: delegated` - the code-review skill at level `high` forked and returned five findings
directly. Scope-checked first: it named this branch and files inside this worktree's changed set.
All five confirmed against the source before acting, all five fixed. Two were rules that only a
deleted handoff carried and that I would have lost:

1. **The collision pass told planners to run `node scripts/e2e-affected.mjs` without `--list`.**
   Bare, that is not a planner but a runner - it spawns the whole suite plus the catalog gate on the
   machine's one browser slot. Three sessions have paid for it. Fixed at the line that gives the
   command.
2. **A `hold` verdict older than the fix to the tool that issued it must be re-measured.** A
   finished branch waited overnight on one that named a file it had never touched. Now in
   `queue-merge.md` beside the verdict it applies to.

The other three were my own inaccuracies, and the first is a small embarrassment worth stating: my
`owner-preflight` bullet repeated a 2026-09-08 report that the shared ruleset reader has since made
stale, which is exactly the check `docs/backlog/README.md` gained in this same branch. The dialog
item overcounted two things, and my repoint count was guessed rather than measured.

`simplify: inline` - the skill returned fan-out instructions, so the four angles were covered here.
Two findings, both fixed: a comment reflow left an orphaned line in `e2e-affected.mjs`, and the new
quarantine item needed a cross-reference so it would not read as a duplicate of
`repeat-failures-across-shas-go-unseen.md`. Altitude: the deeper fix for the repointing cost is a
gate, not a manual pass - it is named and sized in the backlog item, and a gate lands alone. The
deeper fix for the `--list` trap is the script refusing a bare run, which is a behaviour change to a
CI-facing script and belongs in its own change; reported, not done.

`verify: inline`. `npm run build` exit code read directly, green four times - after the repoints,
after the deletions, and twice around the check's fixes. The first of those two was RED, and
correctly: four lines added to `collisions.md` put the orchestrator's common path at 644 against its
640-line budget. Paid for out of the same file rather than by raising the ceiling - a justification
stated three ways became one, and a repeated aside went. That is the constraint
`instruction-files-need-a-shrinking-mechanism.md` describes, working.

`node --test` over `e2e-affected` and `handoff-drain`: 49 pass. The two script changes are
comment-only, verified by diffing with comment lines filtered out.

**E2E: deferred to CI, deliberately.** `e2e-affected --list` escalates to the full suite plus the
catalog gate because `e2e-affected.mjs` itself changed - a comment. Running that on this laptop
would hold the machine's one browser slot for half an hour while three sibling sessions are live,
to prove a comment. CI is the pre-merge gate and it does strictly more on a clean checkout: run
34346592322 on `218ad7c1` was green with **all nine E2E shards, Build, Factory gates and CI gate**
(`Reviewed` skipped, as it is until the queue posts the stamp). The check-fix sha `48d10b30` is
running as 34348666178.

`taste: not applicable` - every file here is markdown, a comment or a JSON `source` string. Nothing
in this diff can move what a graphic looks like.

Verdict stamp at `.git/noacg-jobs/checks/claude-h-drain-the-handoff-folder.json`.

## Needs the owner

Nothing.
