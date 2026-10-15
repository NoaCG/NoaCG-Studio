# The NoaCG harness: one Create with AI that makes graphics as well as Claude Code

Authority: owner, 2026-10-14, final (see `work.json` and section 1.1). Baseline: `origin/main`
`179ab22a3`, 2026-10-14. Plan for `/plan-run noacg-harness`: twelve sequential phases, each built
by one fresh session and checked by another on `main`, over as many runs as it takes. This plan
replaces the draft `docs/work-specs/built-in-agent/spec.md` on local commit `f44e86403` (branch
`noacg/max-20x-api-credits-892542`); what still held from it is carried here, and that file is
not landed. Answers issue #771.

## Verdict

Build the built-in Create with AI as the Claude Code recipe run on Anthropic Claude Managed
Agents: the published `noacg` CLI and the `noacg-graphic` skill in a container with its own
Chromium, a frontier model that looks at the rendered frames of every state and every transition,
the freedom to revise until it would air the result, a per-session dollar budget, and nothing of
NoaCG's in the container but the brief. Prove the mechanism for about $10 before any quality is
measured, reserve the exam before any tuning, tune on briefs the exam never sees, and let a
frozen, calibrated judge settle whether a blind reader can still prefer Claude Code's graphic.
Only a pass opens the product half: the server with durable completion and cleanup, the one
composer in the step, and a switch that stays owner-only until the owner has glanced.

Not promised: that the first run reaches the exam. The spend ladder stops the run at each stage
whose signal is missing, and the exam reservation can refuse to fit in $100. Either is a report
to the owner, not a failure of the plan.

Biggest risk: the money. At list prices a strong-model graphic with the full coverage matrix is
estimated at about $2 (section 5.2), and at that estimate the exam reserve leaves room for one
full tuning round at $15, not three; the plan fits by running smaller rounds, and if even two
small rounds do not fit, the reservation phase stops before any tuning and the owner decides
between a larger run budget, a smaller exam, or the exam on Sonnet 5.5. The second risk is the
judge: a model that approves everything would pass a harness the owner rejects, which is why
calibration on held-back owner verdicts runs at zero credit before any paid stage depends on it.

## Why

Students on noacg.studio need AI creation without an AI plan of their own, and every built-in
attempt so far fell short of the coding-agent route. In the 2026-08-22 round, Claude Code with
the `noacg` CLI and plugin made 25 validator-clean graphics from 6 briefs in 5 configurations,
and the owner would have aired every one ("so much better than through the Create with AI and
the API", `benchmarks/agent/rounds/2026-08-22/VERDICT.md`). That round is evidence that the
approach works, not that it is reliable: several good-looking graphics shipped without the
operator actions their brief needed (three scoreboards with no buttons, one countdown with no
pause, `RESULTS.md`), it ran at about $5 notional and 12 minutes a graphic, and 6 briefs are 6
briefs.

The owner's Max 20x plan carries $200 a month of Claude API credit in the linked Console
organization, auto-reload off. That credit can run the proven loop for students, at the quality
Claude Code reaches, within hard limits.

## Goal and the bar

A signed-in student types a brief and, within about ten minutes, has one graphic of any
registered type, or typeless, in their library and on the wizard's result card, with fields and
operator actions that work. Behind the brief the same loop a coding agent runs (scaffold or
author, validate, look at every rendered state and transition, fix, hand in) runs on Claude,
paid from the credit.

The bar is Claude Code, not a checklist: on briefs nobody tuned against, the harness delivers
usable, operable graphics with no basic visible mistake (text over text, unreadable contrast,
clipped or escaping text, a missing button the brief needed), and a calibrated blind judge
cannot reliably prefer Claude Code's graphic. The judge is a model. The owner glances at about
ten pairs at the end; a graphic the owner rejects that the judge confidently approved means the
judge's calibration failed, and opening the harness to students waits.

## Non-goals

- Packages, rundowns, editing an existing graphic, import conversion, chat refinement. One
  graphic per request.
- A tier, a model chooser, a visible price, an allowance counter.
- Deleting the Lite and Pro code. Their doors close; deletion is a later cleanup.
- A second harness or our own loop. The fallback is documented (section 9), not built.
- Opening the harness to students. The plan ends owner-only; one server switch opens it later.
- Changing the own-key routes or the coding-agent route.

## 1. Decisions

### 1.1 Owner decisions (2026-10-14, final)

1. **Funding.** NoaCG-funded AI calls go straight to the Anthropic API, paid from the Max 20x
   plan's monthly credit ($200) in the linked Console organization. The production key is
   `ANTHROPIC_API_KEY` in Vercel production and in the main checkout's `.env`. Auto-reload stays
   off: an empty balance stops requests and never bills. Supersedes "who pays decides the route"
   (`docs/AI_PLATFORM_PLAN.md` decision 5), `FUNDED_ROUTE_PROVIDER = 'vercel'` and its price
   ceiling (`api/_lib/aiModelCatalog.ts`), and #771 part 7 ("the hosted harness always runs on
   the Vercel AI Gateway").
2. **Retention.** All NoaCG-funded models: no training on prompts, short provider retention.
   Zero data retention is no longer required for any managed task; no-training stays pinned.
   "Short" is made true by deleting each agent session once its graphic is saved (section 7.4).
3. **One engine, no name.** Users see only "Create with AI": no tiers, no model chooser, no
   price, no allowance counter. Internally it is "the NoaCG harness". Lite and Pro disappear
   from everything a user sees.
4. **Host.** The first try is Claude Managed Agents running the published `@noacg/cli` and the
   `noacg-graphic` skill in its container. If that cannot reach the bar, the fallback is our own
   loop, which is a plan of its own (section 9).
5. **Quality over volume.** The cheapest model the judge rates as matching Claude Code wins,
   even if that is Opus at over $1 a graphic. Volume follows from it.
6. **Scope.** One graphic of any registered type, or typeless, per request.
7. **Limits**, as server settings changeable without a deploy: 50 graphics a month per student;
   a $200 fleet cap per month with no headroom; a per-graphic session budget the plan sets from
   measurement; a kill switch.
8. **Out of credit.** When the credit, the fleet cap or a student's allowance is spent, Create
   with AI says it is resting until a date and points to templates, the editor and the
   coding-agent route. No fallback engine runs.
9. **Wait.** Up to about 10 minutes a graphic, with progress shown. The student can leave; the
   graphic still lands in their library.
10. **End state.** Built, measured against Claude Code, live on noacg.studio for the owner's
    account only. One server switch opens it to students after the owner's glance; the plan
    never flips it.
11. **Run budget.** At most $100 of credit in total, across all runs of this plan, on measuring
    and tuning. The rest stays for students.
12. **Subscription first.** The credit pays only for the harness's own runs. The Claude Code
    reference arm, the exam judge and its calibration, brief writing and analysis run on the
    owner's Max subscription through `claude -p`, authenticated with `CLAUDE_CODE_OAUTH_TOKEN`
    from the main checkout's `.env`; every such child process runs with `ANTHROPIC_API_KEY` and
    `ANTHROPIC_BENCH_API_KEY` absent from its environment; a free check confirms subscription
    auth before each subscription stage; subscription usage windows are paced, and a stage
    pauses until a window resets rather than switching to the credit. The credit side of the
    bench uses `ANTHROPIC_BENCH_API_KEY` (its own Console workspace, $100 spend limit) through
    `scripts/bench-env.mjs` profiles; the production key never funds a bench run.
13. **Where it runs.** On the owner's machine as a local plan run (the reference arm and the
    judge need the subscription token; cloud runs have measured blockers,
    `scripts/harness-capabilities.json` `claude-cloud-*`). The graphic work runs in Anthropic's
    cloud anyway.

### 1.2 Derived decisions (revertible; each says how)

- **D1 Agent and environment definitions are files, synced by a script.** `agents/noacg-harness/`
  holds `agent.md` (model, effort, the plumbing-only system prompt, the toolset with web tools
  off and `permission_policy: always_allow`, the pinned custom skill) and `environment.yaml`
  (`cloud`, `limited` networking with `allow_package_managers: true` and `allowed_hosts` of
  exactly the NoaCG deployment and whatever Chromium's download needs, measured in H3, and the
  environment's `packages` field carrying the CLI and a Chromium if H3 shows it can, so no
  session pays the install). The `ant`
  CLI is not installed on this machine, so `scripts/harness-agent-sync.mjs` reads the same files
  through `@anthropic-ai/sdk` (added as a dependency; it sets the `managed-agents-2026-04-01`
  header and verifies webhooks) and records ids per workspace in
  `agents/noacg-harness/claude-lock.<bench|production>.json`. Revert: install `ant` and run
  `ant apply` on the same files.
- **D2 The skill in the container is the same bytes as `cli/skill/noacg-graphic/`**, uploaded
  through the Skills API as one more generated target of `cli/scripts/build-skill.mjs` and
  pinned by version on the agent. The system prompt carries only plumbing: where the CLI is,
  `NOACG_URL`, the time and money budget, what to write to `/mnt/session/outputs/`, and that
  `save` and `login` are never run. A guidance change goes into the skill or the CLI, never into
  that prompt (AC-16). Revert: none; this is the portability rule.
- **D3 The CLI gains two verbs and a digest, host-neutral**: `noacg coverage <dir> --out <dir>`
  captures the full matrix of section 3.2 in one browser session; `noacg record <dir> --out
  <file>` writes the library record the save door would POST (the bridge's `graphicDoc`), with
  no key and no save, plus the package zip and a sha256 of the sources; `validate --json` and
  `record` both print that digest, which is what proves a delivered package is the version last
  reviewed. The bench installs the CLI in the container from a tarball mounted as a session
  file until the verbs are published; production pins the published version. Revert: keep the
  verbs bench-only.
- **D4 The critic is a second agent in the session's roster** (`multiagent`), a fresh thread
  with no authoring history that reads the frames and the brief and answers the inspection
  questions of `references/critique.md`, phrased as what earns a pass. It is Anthropic machinery
  used because it costs no NoaCG code; in our own loop it is a second model call with the same
  prompt. The `multiagent` block is `multiagent_20261001` with `workflows` set to
  `{ "type": "disabled" }` explicitly, because dynamic workflows are on by default with that
  type, and with `subagents.inline_agents` disabled and the critic as the only predefined
  agent, so the author can delegate to nothing else; a session idle with `end_turn` is then the
  end of the work and never hides an open workflow run. The AC-10 payload test pins both
  settings. Its model and its effect are measured, not assumed (section 3.4). Revert: turn the
  roster off; the author re-reads its own frames.
- **D5 The bench is host-neutral behind one arm interface.** `benchmarks/harness/` holds the
  ledger, the arms (`managed-agents` on the credit, `claude-code` on the subscription, `fake` at
  zero tokens), the coverage capture, the judge runner and the gallery. An arm returns the
  package, the record, the trace, the cost and the wall time; everything after that is shared.
  `scripts/harness-bench.mjs` is the runner (named `*bench*` so the one-job-per-machine guard
  sees it). Revert: none; this is what makes a later engine a new adapter.
- **D6 Model ladder.** Quality is established on Opus 5.5 (`claude-opus-5-5`, $4/$20 per
  million, effort `high`), the closest practical reproduction of the August setup; Sonnet 5.5
  ($2/$10) is then measured against that baseline and Haiku 5.5 only if Sonnet matches. Fable
  5.1 ($10/$50) enters only if Opus misses the bar, as an owner money decision. Revert: change
  `agent.md`; the sync creates a new agent version.
- **D7 The exam briefs are sealed by encryption.** The brief-writing session writes the
  plaintext outside the repository (`docs/private/harness-exam/` in the main checkout,
  gitignored), commits `benchmarks/harness/exam/briefs.sealed` (AES-256 with a passphrase file
  beside the plaintext) and `briefs.sha256` of the plaintext. The exam phase decrypts, verifies
  the hash, runs. The protection is the hash plus the procedure; a tuning session is told not to
  open the folder, and the checker of each tuning phase confirms no path under it was read by
  grepping the session's evidence for the folder name. Revert: keep the plaintext in a private
  gist.
- **D8 Completion has four paths into one idempotent finalizer.** Polling by an open page
  (primary, inline), the Managed Agents webhook `session.status_idled` and
  `session.status_terminated` (second), a bounded sweep of stale runs on every harness route
  call (third, because Hobby cron jobs run once a day), and the existing daily cron
  `/api/render/cleanup` (last). All four call `finalizeRun(sessionId)`, which takes a leased
  claim on the run row, downloads the record, shape-checks it, inserts it and marks the row in
  one database transaction (an RPC), then deletes the output files and the session, interrupting
  it first if it is still running. The fleet lease expires at the hard time cap. Revert: drop the
  webhook; polling and the sweeps remain.
- **D9 Engine interface.** `api/_lib/harness/engine.ts` declares `start`, `progress`, `collect`
  and `dispose`; `managedAgentsEngine` is the first implementation; the routes and the step
  speak only to the interface. Revert: none; this is what lets a later engine swap in.
- **D10 Limits live in the system settings table** (`api/_lib/systemSettings.ts`, the 10 s
  cache) with env defaults, so a change needs no deploy: per-student monthly count, fleet cap,
  session budget, fleet and per-student concurrency, the hard time cap, the resting date, and
  `harness_open`. The kill switch is the feature key `ai.create` in `disabled_features`.
  Owner-only enable follows `AI_LITE_OVERRIDE_USER_IDS`: `AI_HARNESS_OVERRIDE_USER_IDS` lists
  the accounts that may use it while `harness_open` is off. Revert: env only.
- **D11 Product integration starts only after the exam passed** (H9 onward). Until then the
  only server code is the engine client module `api/_lib/harness/client.ts`, which the bench
  uses first and the product reuses, with no route reaching it. Revert: move the client under
  `benchmarks/harness/lib/` and port it in H9.

## 2. What failed before, cause by cause, and what this plan does differently

Read against `docs/AI_ATTEMPTS.md`, `docs/NOACG_PRO_PLAN.md` sections 15 to 23,
`docs/PRO_HARNESS_PLAN.md`, `src/ai/pro/harness/tools.ts` and the August round. The working
hypothesis holds on the evidence, with two sharpenings.

| Cause | Evidence | What this plan does |
|---|---|---|
| **No sight.** The model never saw its work, or saw one frame. | Findings-only scored 3 of 21 airable where the same loop with one frame scored 10 of 21 across seven types (Pro plan section 22.1); on lower thirds alone the two tied 9 of 12, so sight matters most on wide and dense types. Lite and the Pro composer have no eyes; the Pro harness returns one downscaled JPEG per inspection (`tools.ts` `recordInspection`). | Real screenshots of every state, every transition as timed frames, long and empty values, light and dark grounds, with detail crops, read by the model through the container's `read` tool at broadcast resolution (section 3.2). |
| **Starved budgets and cheap models.** | The Pro harness: 12 steps, $0.15, 4 rounds, one critique, three writable regions, `gemini-2.5-flash`; 5 of 21 delivered at $1.44 and a delivered podium with eight advisory findings and 60% empty panel (`AI_ATTEMPTS.md`, "The nine blocked cells, re-run"). A frontier model without the loop did not save it: `claude-opus-5` inside the free-form coder harness landed 3 of 11 (section 21.1). August: a frontier model, tools, screenshots and 2 to 8 cycles chosen by need: 25 of 25. | A strong model first (D6), a dollar budget sized from measurement rather than a step count, no fixed round count, and the model writing the whole package the way August did. Cheaper models are measured against that baseline, never assumed. |
| **Instruments that reported clean on visibly broken graphics, and refused good ones.** | 12 of 24 "delivered clean" aired (section 22.1): `spacingCheck` dropped children that escaped the panel, the union rect cannot see a hole, `step-contract` refused every shipped quiz board, `bench-field-unpainted` refused every shipped timer, the 50 px floor failed 312 of 489 shipped designs. Four of the six faults of the 2026-09-06 round were the gate. | The deterministic gate in the loop is the CLI validator's errors (the export contract) and nothing else blocks; warnings are measurements the model reads. An instrument that disagrees with the picture is fixed against the shipped corpus or dropped, never trusted over it (section 3.5, AC-17). |
| **An author judging its own work.** | The Pro critic was a cheap model at chance on every question but one (`CRITIC-CALIBRATION-2026-08-19.md`); the Lite judge agreed with the owner 3 of 6. August's author judged its own frames and the owner agreed on every visual, but the author missed what it did not look for: operator actions absent on 4 of 7 typed-action cells. | A fresh-eyes critic that did not author the graphic, reading the frames and the brief's operator needs, with the operator surface in its brief (section 3.4), and operability as a mechanical gate besides (section 3.6). Its value is measured in tuning. |
| **A loop that stops at "the checks pass".** | `tools.ts`: `finishGraphic` is offered the moment the gate is clean, one visual round at most, "Repair ONLY what is listed", one frame returned. A mechanically clean graphic never got the chance to become a good one. | Delivery needs a clean validator, the full matrix looked at, the critic's basic-mistake questions clear, and the author's own verdict that it would air; a clean gate is where design starts, not where it ends (section 3.3). |
| **The platform owned the decisions the model needed.** | "Remove the decision" raised the composer's rates on narrow types (section 15.3), but three writable regions and a platform-owned machine capped novel briefs; August's novel debate clock succeeded because the agent authored the machine. | The model authors the package against the contract, as the skill teaches; the platform keeps what playout and editability need (the validator) and nothing about the look. |
| **Harness faults measured as model faults.** | The seated round voided by a serialization that dropped the definition; two paid rounds mis-read as model failure. | Every stage runs its zero-token control first (the fake arm, the dry run), and a refusal that looks wrong is reproduced against the shipped corpus before any conclusion about the model. |

Retired approaches, read by their RETRY WHEN lines:

- **The Lite skin vision judge as a production gate** ("retry when a completed round yields 20+
  joined items and the judge catches something no deterministic gate can"): fires here through
  the calibration of H2, on about 100 archived items with owner verdicts, before the judge
  decides anything. The exam judge is a judge of a pilot, not a production gate; the in-loop
  critic blocks only the basic-mistake classes, and stays only if H6's with-and-without
  measurement shows it removes defects at a cost that does not rise more than it saves.
- **The model-vs-harness study** ("retry when a materially different checkpoint class exists, or
  the harness changes enough that D-vs-A could invert"): the Managed Agents loop with sight is
  that different harness class; the exam replaces re-running that rig.
- **The Pro harness** ("retry when the size floor is ruled on"): the floor became type-aware on
  2026-09-08. The Pro harness is not retried here; it is the fallback path (section 9).
- **Adding prompt lines** and **a prohibition as enforcement**: the skill stays contract-only, a
  guidance change replaces rather than adds and is written as inspection, and a change ships
  only with the measurement that earned it (section 3.7).
- **Cheap models unaided** ("retry when a ~$0.01 route beats the control blind on 20+ pairs"):
  not a retry; the cheapest model here is measured against a frontier baseline inside the loop.

## 3. The harness: sight and freedom

### 3.1 The loop in the container

One session per graphic, created with `initial_events` carrying one `user.message` (the brief,
the type if the student named one, and the hand-off instructions), a `budget` of the per-graphic
cap in cents, a `metadata` run id, and no resources but the CLI tarball while the verbs are
unpublished. The agent installs or finds the pinned CLI and a Chromium, runs `noacg doctor`
against the deployment's `/bridge`, then the skill's loop: `types` or `scaffold`, author,
`validate --screenshots`, look, fix, `inspect` against the brief's operator needs, repeat. Before
delivery it runs `noacg coverage` (the full matrix) and looks at all of it, asks the critic
(section 3.4), fixes what either found, and hands in with `noacg record`, writing the record,
the zip, `validate.json`, `inspect.json` and the final frames to `/mnt/session/outputs/`. It
writes an interim record after every clean validate, so a budget or time stop still has the best
validated version.

Progress lines come from the session's events: each `agent.tool_use` of a `noacg` verb maps to
a plain line ("Designing", "Checking every state", "Fixing two things the review found").

### 3.2 The coverage matrix

Captured by `noacg coverage` (D3) for any package, derived from the package's own contract
(`inspect`: fields, events, steps) and the brief's stress values:

- values: the sample values, every text at the brief's long value or 1.7x, every optional field
  empty, and on a two-sided board the long value on each side separately;
- grounds: the built-in video-like plate and a light plate, so dark and bright backgrounds are
  both seen;
- states: off, take (an entrance strip at 0, 120, 300, 600 ms and settled), every declared
  operator event executed from the settled take (its transition strip and its settled frame),
  every extra step through `next`, an update of a value (its strip), `out` (its exit strip); a
  graphic with a clock also gets a frame after time has passed;
- detail crops of every field element at native pixels, because a 1920x1080 frame is read
  downscaled and a contact sheet is illegible.

During revision the agent inspects the affected states plus one overview with `validate
--screenshots` and `screenshot --event`, as today. Before delivery the full matrix runs. The same
verb captures both arms of the exam, so the judge sees the same set for both.

### 3.3 Freedom to improve, stop rules, the per-graphic budget

Visual judgement may drive another revision when every validator is clean; the agent may
rearrange layout, typography and animation; functional contracts stay enforced by the validator.
"No measurement changed" and "no visual improvement" are different things, and only the second
ends design.

Stops:

- **Delivered**: validator clean, the full matrix looked at, the critic's basic-mistake questions
  clear, the author would air it, the record written.
- **Budget**: the platform pauses the session at the cap (`stop_reason: budget_reached`); the
  server treats it as not finished and saves the best interim record, marked "checked, and not
  ready". A request already in flight completes, so a session can pass its cap by one model
  request per running thread; the ledger's overshoot margin covers that.
- **Time**: the agent is told the ten-minute target; the server's hard cap (a setting, 15 min
  to start) interrupts, finalizes from the best interim record if one exists, else fails the run.
- **No record at all**: the run fails; the reservation is released if no model spend settled.

The per-graphic session budget is set in H4 from H3's measurement: about 1.5x the strong
model's measured mean, rounded to the cent, and revised in H7 for the winning model.

### 3.4 The fresh-eyes critic

A separate agent in the roster (D4), prompted from the shared `references/critique.md` plus the
brief and the `inspect` output, reads the coverage frames and answers, for each basic-mistake
class and for anything a designer would refuse to air, what it saw and where, as inspection
questions ("every line of live text sits fully inside a surface that reads behind it, at a
contrast a viewer can read: yes or no, which frame, which text"). The author repairs what the
critic found and re-captures the affected states; a disagreement is settled by the picture, not
by the critic. The critic is not the exam judge and never sees the reference arm.

Measured in tuning (H6, when H5 delivered a basic defect or a missing action): the same briefs
with and without, on the same model; the critic stays only if it removes basic defects or
missing actions at a cost per accepted graphic that does not rise more than it saves. A clean
H5 leaves the critic off, because a review with nothing to find is cost without a measurement.

### 3.5 Instruments that agree with the picture

In the loop: the CLI validator's errors block delivery (the export gate contract, correctness
and editability), its warnings are measurements the model reads, and the bench instruments
under `src/ai/spike/` stay out. In the exam: the same validator runs on both arms' delivered
packages; an error is a functional failure.

Rule, binding on every phase: when an instrument fires on a graphic the critic, the judge or the
owner called clean, or stays silent on one they called broken, the disagreement goes into
`evidence/instruments.md` with the frame, the instrument is checked against the shipped corpus
the way the 2026-09-07 entry did, and it is fixed in the shared validator or demoted. It is never
left ruling over the picture.

### 3.6 Operability as a gate

Mechanical, both in the loop and in the exam: `noacg inspect --json` must list every action the
brief's `expect.actions` names (the exam and tuning briefs carry `expect` as the v1 bank does),
and `noacg coverage` executes every declared event and reports one that did not move the machine
as a finding. The skill's step 4 already tells the agent to read the buttons against what the
operator must do live; the system prompt restates nothing. A delivered graphic missing a needed
action is a functional failure in the exam, whatever it looks like.

### 3.7 The skill and the system prompt

The skill stays contract-only, free design by default, as the August verdict decided. A tuning
round may change the skill or the CLI only with the round's measurement attached, replacing text
rather than adding it, written as inspection, and the change lands in `cli/skill/` and `cli/`
where every route benefits, including the plugin users run in their own Claude Code or Codex.
The container's system prompt is plumbing (D2); a Node test caps it at 25 lines and a checker
reads it for guidance (AC-16).

### 3.8 Strong model first, then the ladder

H5 reproduces August as closely as practical: Opus 5.5 at effort `high`, the skill as published,
no critic, the coverage verb and the record hand-off. H6 runs the one variable H5's evidence
picks: the critic if H5 delivered any basic defect or missing action, else Sonnet 5.5 on the
same briefs and configuration. H7 takes the next rung (section 5.1). The cheapest model whose
tuning-set verdict matches wins and runs the exam; Haiku 5.5 is measured only if Sonnet matched
and the money fits.

## 4. The exam

Frozen before any tuning: the sealed briefs (H0), the judge's prompt, rubric and model (H2), and
the pass thresholds (4.5).

### 4.1 Briefs

- **Held-out**: 20 new briefs written in H0 by a `claude -p` child on the subscription whose
  prompt file holds exactly the permitted inputs (the product docs, the type registry,
  `benchmarks/agent/v1/briefs.json` and this section's requirements) and nothing of this plan's
  harness design, the skill tuning or any tuning evidence; H0's builder, who has read this plan,
  writes no brief, records the prompt and the child's session id in `evidence/phase-0.md`,
  checks coverage, and seals (D7). At least eight graphic types; stress cases: long names and
  titles, two-sided boards, bright and dark logos, busy backgrounds, operator actions; each with
  `stress` values, `expect` fields and actions, and a one-line `judge` note, as
  `benchmarks/agent/v1/briefs.json`.
- **Tuning**: the 6 v1 briefs plus 10 new tuning briefs from the same session, unsealed, in
  `benchmarks/harness/tuning/briefs.json`, varied types. These are the only briefs the harness is
  tuned on. The 21 Pro custom-bank briefs are a reservoir if a round needs a type the bank lacks.

### 4.2 The reference arm

Claude Code with the published plugin on the same briefs, on the subscription: one fresh
`claude -p` session per brief in an empty directory outside the repository, the plugin loaded
with `--plugin-dir`, the built or published CLI on PATH behind the ledgering shim
`scripts/agent-round-bench.mjs` already has, `NOACG_URL` the same deployment the harness used,
no save. Its package goes through the same `noacg coverage`. For the five NoaCG v1 briefs (the
sixth, the hand-written OGraf package, is not a library graphic and stays out of tuning) the
August cells' sources in `C:\claude\noacg-bench-archive\agent-round-2026-08-22\cells\` are
re-captured locally at zero cost.

### 4.3 The judge and its calibration

- **Model**: the strongest vision model the subscription serves through `claude -p --model`,
  pinned by the exact id the CLI reports; prompt and rubric in `benchmarks/harness/judge/`,
  their sha256 together with the model id committed before H5 as `judge.lock.json`. The judge
  reads the frames through `claude -p`'s Read tool and answers a strict JSON schema. The exam
  runner refuses a judge whose hash differs; if the pinned model is no longer served by exam
  time, H2 is repeated as a re-pin and recorded, never patched in place.
- **Two tasks**: single airability (would this air; which basic mistakes; which actions are
  missing) and pairwise preference (which would air, which is better, what is wrong, with
  reasons), over the full coverage matrix of both arms, blind. Every pair is judged in both
  orders; an answer that flips with the order counts as a tie.
- **Calibration (H2, subscription)**: good examples are the 25 August cells (owner: all airable)
  and the 21 rules re-read cells the owner aired; bad examples are the owner's FAIL and TWEAKS
  verdicts in the type sweep (`typesweep-blind-final-2026-08-18`, 18 minimax and 11 gemini cells
  not airable), the free-form coder round (about 30 of 43) and the instruments round, all with
  frames and notes in `C:\claude\noacg-lite-eval-archive\` and `C:\claude\noacg-bench-archive\`,
  plus planted-defect variants of good cells (an overlap, a clipped title, grey-on-grey text
  injected into saved sources and re-rendered). A stratified 30% is held back and never used to
  write the prompt. Pass: on the held-back part, airability agreement with the owner at least
  85% with no basic-defect FAIL called airable, and pairwise good-versus-bad preferred correctly
  at least 90% with order flips counted as errors. A judge that approves everything fails. The
  archived frames are stills, not the full matrix; stated as the calibration's limit.

### 4.4 What is reported

Separately, in `benchmarks/harness/exam/REPORT.md`, with Wilson intervals on every rate:

- delivered and usable graphics out of all requests, counting refusals, budget stops and
  timeouts;
- basic visual defects and functional failures (validator errors, missing actions, events that
  did not move the machine), per graphic;
- preference wins, losses and ties, with the order-flip count;
- total cost per accepted graphic, including failed attempts, critic threads and retries, and
  the same for the reference arm as notional subscription usage;
- wall time per graphic against the ten-minute limit, median and 90th percentile;
- spend per stage, per model and per accepted graphic across the whole plan.

### 4.5 Pass, fixed in advance

All of:

- usable delivery within one graphic of Claude Code's (if Claude Code delivers 19 of 20 usable,
  the harness delivers at least 18);
- zero basic visible mistakes and zero missing operator actions in the delivered graphics;
- Claude Code preferred in no more than 10 of the 20 pairs, ties counted as not preferred;
- median wall time at most 10 minutes and no accepted graphic over the session budget.

"Ties counted" is read leniently: a tie is a pair in the denominator and not a Claude Code
preference. Because the judge is calibrated on stills, a tie that comes from an order flip is
also a reliability reading: more than 5 flip-ties in 20 makes the exam "inconclusive: judge
unreliable on this set" rather than a pass, and the report says which pairs flipped.

Twenty briefs make this a pilot: a 10 of 20 split carries an interval of roughly 30% to 70%. The
pass earns the owner-only launch; real use is what proves broad reliability, and the report says
so.

### 4.6 The owner gallery

A local, private page, `benchmarks/harness/exam/gallery/review.html` (frames never committed):
about ten pairs, every state and the motion strips side by side, arms hidden, the key in
`key.json` beside it, `notes.md` for the owner's verdict. The owner's verdict overrides the
judge; a confident judge approval the owner rejects is recorded as a calibration failure and the
report's "Needs you" says that opening to students waits.

## 5. Spending safely

### 5.1 The ladder

| Stage | Phase | Ceiling | Runs on | Hypothesis, and the signal that lets the next stage start |
|---|---|---|---|---|
| Briefs, dry run, judge | H0, H1, H2 | $0 | local, subscription | the bench, hand-off, completion and ledger work on a fake agent; the briefs are sealed; the judge separates good from bad on held-back verdicts |
| Feasibility | H3 | $10 | Haiku 5.5, then Opus 5.5 | the container installs the CLI and a Chromium, reaches `/bridge`, renders, writes outputs; the agent sees an image, names a planted defect, fixes it, and the delivered digest equals the last reviewed one; one real graphic's cost and time are measured |
| Reservation | H4 | $0 | local | the exam fits (5.2); the per-graphic budget is set |
| Tuning round 1 | H5 | the round ceiling | Opus 5.5 | the August reproduction on the round's tuning briefs; the judge's verdict against the reference arm, the defect and missing-action counts, the median wall time |
| Tuning round 2 | H6 | the round ceiling | Opus 5.5 or Sonnet 5.5 | the variable H5's evidence picks: the critic if round 1 delivered any basic defect or missing action, else Sonnet 5.5 on the round 1 configuration; progress against round 1 |
| Tuning round 3 | H7 | the round ceiling | the next rung | Sonnet 5.5 on the configuration that won after round 2 if round 2 was the critic; else Haiku 5.5 only if Sonnet matched and the money fits, else recorded as not needed |
| Held-out exam | H8 | the reserved amount | the winner | the thresholds of 4.5 |

The round ceiling is $15 for about 5 briefs, or $9 for 3 briefs when H4's fit rule says so
(5.2). Each paid phase writes its hypothesis, its ceiling and its signal into
`evidence/<phase>.md` before the first session starts, and the checker confirms the order. A
stage whose signal is missing stops the run with a report.

### 5.2 The reservation arithmetic

From H3's measured mean cost of one real graphic on the strong model, `m`:

- per-graphic session budget `B = round-up(1.5 m)`; overshoot `o` = one model request at the
  session's largest context, estimated from H3's trace (about $0.50 on Opus 5.5);
- exam reserve `R = 20 (B + o)`, plus the critic's share if H6 keeps it;
- remainder for tuning `T = 100 - ledger spent - R`.

The fit rule, applied in H4 before any tuning: the ladder needs at least two rounds, the
baseline (H5) and the model ladder (decision 5), with the critic round only when H5 shows a
defect or a third round fits. H4 computes how many rounds fit at $15; if fewer than two, it
recomputes at $9 (3 briefs a round); if still fewer than two, it stops with `needs: decision`
before H5 spends anything, with a recommendation in this order: a run budget large enough for
two $9 rounds, then a 10-brief exam, then the exam on Sonnet 5.5. That is a money decision,
not the run's. H4 also fits time: if H3's measured wall time plus cold start is above the
ten-minute median of 4.5, the same stop reports it, because the pass rule's number is the
owner's to set against decision 9's "about ten minutes".

| `m` measured in H3 | `B` | `R` (`o` = $0.50) | `T` after $10 feasibility | rounds at $15 | rounds at $9 |
|---|---|---|---|---|---|
| $1.00 | $1.50 | $40 | $50 | 3 | 5 |
| $1.50 | $2.25 | $55 | $35 | 2 | 3 |
| $2.00 (the estimate) | $3.00 | $70 | $20 | 1 | 2 |
| $2.50 | $3.75 | $85 | $5 | 0, stop | 0, stop |

The estimate: a 12-minute Opus 5.5 session with about 50k output tokens, 100k fresh input
tokens including the images, a million cached reads and two cents of container time.

### 5.3 Walls, and their honest limits

- **The ledger** `benchmarks/harness/ledger.json`, committed, cumulative across runs and months,
  authoritative: one entry per session (phase, stage, model, session id, `usage.list_cost`,
  wall, outcome). The runner refuses to start a session when `remaining - overshoot margin <
  session budget x concurrency`, where the margin is `o x concurrency` plus the critic's worst
  thread. The mechanical figure is the sum of the sessions' `usage.list_cost`, the same list
  price the workspace limit meters. Reading the Console's workspace usage needs a person or an
  Admin key, so each paid phase's pull request asks the owner for one glance (which page, which
  number to compare with the ledger's) instead of claiming a reconciliation it cannot make.
- **Session budgets can overshoot** by one request per running thread; the margin covers it.
- **The bench workspace's spend limit** is a monthly backstop that holds even if the ledger is
  wrong. Each month the owner sets it no higher than what the ledger has left (owner setup).
- **Cheap models for plumbing only**: install, screenshots and hand-off are proved on Haiku 5.5;
  no quality claim comes from it.

### 5.4 Subscription work

The runner constructs the environment of every `claude -p` child from scratch (PATH, HOME, the
profile directories, `CLAUDE_CODE_OAUTH_TOKEN`, `NOACG_URL`) rather than scrubbing its own, so
no API key can reach it. Before each subscription stage it runs `claude auth status` in that
environment and refuses unless it reports `loggedIn: true` and `authMethod: oauth_token`
(verified 2026-10-14 on this machine with both keys absent). A child that reports the usage
limit with a reset time pauses the stage until that time and records `paused` in the ledger;
nothing moves to the credit. Subscription-heavy stages (20 reference graphics, about 100
calibration judgements, 40 exam judgements with 30 to 60 images each) are spread over usage
windows.

### 5.5 Stop rules

- H3: any of its four proofs fails: stop, recommend the fallback plan.
- H4: fewer than two rounds fit even at $9, or the measured time is over the pass rule: stop
  before H5, report the numbers with the recommendation of 5.2.
- Two tuning rounds in a row without measurable progress, measured as cost per accepted graphic
  or the judge's verdict on the tuning set: stop; a third idea is not tried on hope. The report
  says what was learned and what the next plan should change.
- H8 misses a threshold: stop with the report; the plan never ships a harness that failed.
- The ledger refuses a session: the phase stops where it is, records the spend, and reports.

Spend is reported at every stop, per stage, per model and per accepted graphic.

## 6. Feasibility (H3), the first paid phase

Four proofs, in order, each with its evidence kept under `evidence/phase-3/` (images and traces
on this machine, described in words in `evidence/phase-3.md`; session ids and costs in the
ledger):

1. **Plumbing, on Haiku 5.5, about $1.** A session installs the CLI tarball and finds or installs
   a Chromium (the container's own, `npx playwright install chromium` with its download host
   allowed, or a package), runs `noacg doctor` against `https://noacg.studio/bridge` (served
   publicly, 200 from this machine with a headless user agent on 2026-10-14; datacenter egress
   and any firewall challenge are what this proves), scaffolds a neutral scoreboard, runs
   `validate --screenshots` and `coverage`, writes the record and frames to the outputs, and the
   bench lists and downloads them. Measured: cold start to the first `noacg` call, the install
   path that worked, the hosts that had to be allowed, the `environment.yaml` that results.
   Then the same with the CLI and the Chromium declared in the environment's `packages` field,
   if the field can carry them, so later sessions start warm; the cold start of both paths is
   recorded, because time is a pass rule (4.5) and H4 fits it.
2. **The defect-repair proof, on Opus 5.5, about $3.** The bench plants a visible defect (a title
   overlapping the name, or a clipped long value) in a scaffolded package mounted into the
   session and asks the agent to finish the graphic. The trace must show: an image read, not a
   filename or text findings; the defect named from that image; the package changed and the new
   render inspected; a delivered record whose digest equals the digest of the last `validate
   --json` or `coverage` the trace shows. Images, revision digests and the tool trace are the
   evidence.
3. **One real graphic on Opus 5.5, about $3.** A v1 brief, the full loop, the full matrix, the
   record. Measured: `usage.list_cost`, wall time, turns, image count, the cost of the largest
   single request (the overshoot `o`).
4. **Cleanup.** The bench deletes the output files and the session, and a subsequent list of
   files by that session id and a session fetch answer not found.

If any of this cannot work, the phase says so, stops the run, and the report recommends the
fallback plan (section 9).

## 7. The product half (H9 to H11)

### 7.1 Reuse

- The AI task registry (`api/_lib/aiTaskRegistry.ts`): a fourth task `harness-create`, tiers
  `['free']`, whose route policy names an engine (`{ kind: 'managed-agents', model }`) rather
  than a gateway route; `taskConfigured` checks the key and a priced model for an engine task,
  and the funded-route gate admits it (decision 1).
- The `ai_generations` ledger (`profile = 'harness'`, one migration for the CHECK constraint and
  the run table) with Pro's lease and capacity pattern (`api/_lib/pro/generations.ts`
  `reserveProCapacity`, `reservationAccounting.test.ts`): a reservation books the session budget,
  the settled cost is the session's `usage.list_cost`, a run with no model spend releases its
  reservation, a fleet slot is leased and renewed by progress.
- The export gate's re-validation in the browser when the result arrives, as a sent package is
  re-validated on install.
- The shape check on save (`api/_lib/me/graphicShape.ts` `graphicSaveShape`) and the one record
  builder (`newGraphicDoc`), as the save door does; the record's `origin` is
  `{ tool: 'noacg-harness', version: <session id> }`.
- The existing `api/ai/[...path].ts` function, four single-segment routes (`harness-status`,
  `harness-runs`, `harness-run`, `harness-webhook`), keeping the function count under
  `scripts/check-function-budget.mjs`'s cap.
- Owner-only enable: `AI_HARNESS_OVERRIDE_USER_IDS` while `harness_open` is off (D10).

### 7.2 One engine interface

D9. The step and the routes never name Managed Agents; a later engine is a second
implementation and a re-run of the exam through the bench's arm interface.

### 7.3 Durable completion and recovery

- `POST /api/ai/harness-runs` reserves, creates the session with the budget, stores the run row
  (`ai_harness_runs`: id, user, session id unique, status, interim and final record file ids,
  graphic id, cost, timestamps) and returns at once; Vercel functions stop at 300 s.
- `GET /api/ai/harness-run?id=` polls: it reads the session's status and its latest
  `session.status_idle` event; while running it returns progress lines. Work is done when the
  session is `idle` with `stop_reason` `end_turn`: the agent's `multiagent` block disables
  `workflows` explicitly (D4), so no workflow run can stay open behind an idle, and session
  status aggregates thread status, so an idle session has no critic thread still working. Then,
  and on `terminated`, it calls
  `finalizeRun` inline and returns the result. `budget_reached` is the not-ready case (the
  interim record is saved as such); `retries_exhausted` or `refusal` with no record fails the
  run; `requires_action` cannot occur with the web tools off and no custom tool, and is treated
  as a failure if it ever does.
- `POST /api/ai/harness-webhook` verifies the HMAC with the SDK's `webhooks.unwrap`
  (`ANTHROPIC_WEBHOOK_SIGNING_KEY`), dedupes on the event id, and calls `finalizeRun` for
  `session.status_idled` and `session.status_terminated`.
- The backstop for a missed webhook is not the daily cron alone: the deployment is on Vercel's
  Hobby plan, whose cron jobs run at most once a day (`vercel.json`, `30 3 * * *`), and
  Anthropic's own guidance is to list sessions on a schedule because a delivery can be missed.
  So every harness route call (`harness-status`, `harness-runs`, `harness-run`) first sweeps at
  most three runs past the hard time cap that are not final, the same way the render status
  path finalizes inline and the cron "only has to be eventually right"; the fleet slot is a
  lease that expires at the hard cap, so a missed completion never holds capacity; and the
  daily cron `/api/render/cleanup` sweeps whatever traffic did not reach. A sweep finalizes a
  run that has a record, fails the rest, and interrupts a session that is still running before
  deleting it, since a running session cannot be deleted.
- `finalizeRun(sessionId)` is retry-safe and single-writer through a leased claim: an RPC sets
  `status = 'finishing'` with a fresh claim token and `claimed_at`, from a non-final status or
  from a `finishing` whose claim is older than the lease (six minutes, longer than the 300 s an
  invocation can live at most, so a live holder is never superseded; the work itself is a
  download of at most 4 MB, a shape check and one insert). The holder lists the session's files
  by `scope_id`, downloads the record
  (and the interim one when there is no final), runs `graphicSaveShape`, and one SQL transaction
  inserts the document and marks the row final with the graphic id, conditioned on the row still
  carrying its token; a holder whose lease was taken over gets zero rows and stops. A crash
  between the insert and the mark cannot save twice: the transaction is one statement, and a
  retry that finds the row already final returns the stored graphic id. A crash right after the
  claim strands nothing: the next poll, webhook or sweep re-claims after the lease. The settled
  cost is read from the session before deletion.

### 7.4 Cleanup and retention

Once the graphic is saved, or the run failed for good, the server deletes the output files and
the session (`DELETE /v1/sessions/{id}`: the session, its event history and its files), which
is what makes decision 2's "short retention" true for the brief and the graphic. The honest
limit, from Anthropic's monitoring page (read 2026-10-14): sandbox state is kept for 30 days
after the sandbox is created regardless of deletion, and Managed Agents is not eligible for
zero data retention, which decision 2 no longer requires. Nothing of the student's but the
brief and the graphic's sources is ever in that sandbox. No-training is Anthropic's API default
and is asserted in the retention test (AC-11). The consent notice (`src/ai/consentNotice.ts`)
is checked for truth under decision 2 and this limit; a wording change bumps
`AI_NOTICE_VERSION`.

### 7.5 Security boundary

The container receives the brief, the CLI, the skill and `NOACG_URL`. No student token, NoaCG
secret, Supabase key or Anthropic key enters the session, the environment or its files; the
environment's allowed hosts are exactly those H3 measured; web tools are off. The graphic's code
runs in the container's Chromium against the public `/bridge` page and later in the student's
browser, never on NoaCG servers: the server parses, evaluates and validates nothing of it
(`graphicShape.ts` says why). A Node test pins the create payload and the environment config
(AC-10).

### 7.6 Limits and the out-of-credit note

D10's settings, defaults: 50 a month per student, $200 fleet cap, the H4 budget, 2 concurrent per
student, 8 across the fleet, 15 minutes hard cap, resting date the first of next month. The
status endpoint answers `resting until <date>` when the fleet cap or the student's allowance is
spent or when Anthropic refuses for an empty balance, and the step shows that with the three
alternatives; no other engine runs and no error code is shown (AC-13).

### 7.7 What the student sees

| Moment | The student sees | What runs |
|---|---|---|
| Opens Create with AI, signed in | one composer, no tiers, no model names | `GET /api/ai/harness-status` |
| Presses Create | plain progress lines | `POST /api/ai/harness-runs` |
| Waits or leaves | the lines keep coming; leaving is safe | `GET /api/ai/harness-run` polls |
| Finished | the result card as today; the graphic in the library | `finalizeRun`, then the browser re-gate |
| Not ready | "Checked, and not ready", with the best validated version | the interim record saved and marked |
| Credit, cap or allowance spent | "Create with AI is resting until <date>" and the three alternatives | status says resting |
| Not signed in | the sign-in prompt, as today | status says sign-in |

## 8. Coordination with `wizard-ai` and `wizard-shell`

On `origin/main` at `25849748c` (2026-10-14, the day this plan landed): `wizard-ai` A1 to A4
landed and checked (the step now lives under `src/components/wizard/ai/`), A5 (the close-out,
with contract recompiles) open; `wizard-shell` S1a to S4 landed, S5 to S7 open. The rules below
read the live state, so this snapshot is a starting point, not a dependency. `wizard-ai` owns
`src/components/wizard/ai/*`, `src/ai/*`, `e2e/_ai-step.ts`, `e2e/ai*.spec.ts`,
`e2e/pro*.spec.ts` and two test scripts while a phase of it is open.

- H0 to H9 touch none of those files, so they run beside both wizard plans (plan runs of
  different plans may run side by side, never two on one file).
- H10 edits `src/ai/creation.ts`, the AI step and the AI journeys. The coordinator launches it
  only when `wizard-ai` has no open phase (A4 and A5 landed, or the plan closed), read from that
  spec's phase notes on `origin/main` and `gh pr list --head claude/plan-wizard-ai-*`; otherwise
  it waits for that landing and re-checks. It builds on whatever landed: the step under
  `src/components/wizard/ai/` (A4), the route through `creationRoute` and `runCreation` in
  `src/ai/creation.ts` (A2), and whatever A5's close-out changed.
- H11 recompiles contracts, so it waits while `wizard-ai` A5 or `wizard-shell` S7 is open
  (launched, not landed), the one-writer rule of `wizard-structure` section 8.
- `e2e/ai.spec.ts` carries a budget exception until 2026-11-13 from `wizard-ai`; H10 adds its
  own line under `## Budget exceptions` if it adds minutes past that date.
- H1 adds one dependency line to `package.json`, a file `wizard-structure` section 8 names as
  shared; it is one added line the merge queue rebases.

## 9. Long-term direction, and the fallback path

Anthropic is the first working way, not the only one. All graphics capability stays in
NoaCG-owned, host-neutral pieces: the CLI and its bridge verbs, the skill text, the validator,
the coverage capture, the bench. Managed Agents supplies only the loop, the container and the
budget; the two Anthropic-only mechanisms used are the multiagent critic (replaced elsewhere by
a second model call, D4) and the Skills API upload (replaced by mounting the same folder). Any
improvement tuning finds goes into the CLI or the skill. The exam is host-neutral behind the
arm interface, and cost per accepted graphic, not token price, is the number that compares
engines.

**Fallback path: our own loop.** The Pro harness skeleton (`src/ai/pro/harness/`, its `Workbench`
seam) run server-side with screenshots from a Vercel Sandbox browser (the planned bridge
workbench, `docs/PRO_HARNESS_PLAN.md` section 5.4), the model through the Vercel AI Gateway or
direct, including cheaper vision and tool-calling models (Qwen, DeepSeek, GLM and their
successors), with the sight, freedom, critic and budget rules of section 3 and the same exam.
It is a plan of its own and needs its own isolation work (#843's rendering concern) before any
graphic code runs on NoaCG infrastructure.
**RETRY WHEN** H3 shows Managed Agents cannot run the recipe, or H8 fails on a cause that is
the host rather than the model, or a cheaper arm passes the same exam at a lower cost per
accepted graphic.

## 10. Acceptance criteria

### AC-1: The bench works on a fake agent before a model is paid
**Layer:** a Node test (`scripts/harness-bench.test.mjs`, build gate) and
`node scripts/harness-bench.mjs --control`.
The fake arm pushes a scaffolded graphic through capture, record, shape check, gallery and
ledger with $0 recorded; the managed-agents arm runs against a stub client replaying the
documented event and file shapes; the ledger refuses a session when the remainder is short.

### AC-2: The exam briefs are sealed before tuning starts
**Layer:** a Node test (`scripts/harness-bench.test.mjs`: the sealed file decrypts to the
committed hash with the passphrase and is refused without it) and the checker's read.
`briefs.sealed` and `briefs.sha256` are committed by H0; no plaintext brief is in the repository
or in any tuning evidence; the child session's prompt and id are in `evidence/phase-0.md`.

### AC-3: The judge is frozen and calibrated
**Layer:** `benchmarks/harness/judge/judge.lock.json` and the calibration report.
Prompt, rubric and model id hashed; on the held-back part, the thresholds of 4.3 are met and
the numbers are in `evidence/phase-2.md`; the exam runner refuses a judge whose hash differs.

### AC-4: The mechanism works in the container
**Layer:** `evidence/phase-3.md`, the ledger, images and traces on this machine.
The four proofs of section 6, within $10, with the measured cold start, cost, wall time and the
largest request's cost.

### AC-5: The exam is reserved before any tuning
**Layer:** `benchmarks/harness/ledger.json` and `evidence/phase-4.md`.
`B`, `o`, `R` and `T` computed as 5.2 says from H3's numbers; the reserve recorded; the round
ceiling and brief count set; the run stopped with the numbers before H5 if fewer than two rounds
fit even at $9 or the measured time is over the pass rule.

### AC-6: Every tuning round states its hypothesis before spending and measures its signal
**Layer:** `evidence/phase-5.md`, `-6.md`, `-7.md` and the ledger.
Each round's hypothesis, ceiling and signal are written before its first session; one variable
per round; the judge's verdict against the reference arm, the defect and missing-action counts
and the median wall time recorded; the stop rule applied; H8 launched only within the time
rule.

### AC-7: The held-out exam passed the fixed thresholds
**Layer:** `benchmarks/harness/exam/REPORT.md`, the gallery on this machine.
Every number of 4.4; the thresholds of 4.5 met; the gallery built and the owner notified.

### AC-8: Spend is bounded at every level
**Layer:** Node tests in `api/_lib/harness/*.test.ts`, plus AC-1's ledger test.
A run starts only within the per-student allowance, both concurrencies and the fleet cap; every
session is created with the budget; the settled cost is the session's list cost; a run with no
model spend releases its reservation; the kill switch refuses new runs.

### AC-9: A run finishes after the student leaves, and never saves twice
**Layer:** Node tests with the stubbed client; a journey in the configured suite.
Polling, the webhook, the on-traffic sweep and the cron sweep each finalize a run; a second call
on a final run returns the stored graphic id; a crash before the claim retries; a crash right
after the claim is recovered by the next caller once the lease expires, and two concurrent
callers produce exactly one save; a stale fleet lease frees its slot; an interim record is
saved as not ready; an idle with `budget_reached`, `retries_exhausted` or `refusal` takes its
own path.

### AC-10: No credential or graphic code crosses the boundary
**Layer:** a Node test of the create payload and the environment config.
The session carries the brief and nothing else; the environment's allowed hosts are exactly
H3's; web tools are off; the agent's `multiagent` block has `workflows` disabled and only the
critic as a predefined subagent; the saved graphic comes only from the downloaded record after
the shape check and is re-validated in the browser.

### AC-11: Retention matches decision 2
**Layer:** a Node test.
After a save or a final failure, the output files and the session are deleted; no managed task
requires ZDR by default; the consent wording is true for the providers in use, the 30-day
sandbox retention included.

### AC-12: One Create with AI
**Layer:** the `ai-tiers` journey, updated, and a journey in `e2e/ai.spec.ts`.
The step offers no tier and no model chooser; Lite's door is gone; the harness route shows
progress lines and the result card with routed status answers; the own-key routes and the
coding-agent route pass unchanged.

### AC-13: Out of credit rests honestly
**Layer:** a journey in `e2e/ai.spec.ts` with routed status answers.
The fleet cap, the student's allowance and the empty-balance refusal each show the resting note
with its date and the three alternatives; no other engine runs; no error code is shown.

### AC-14: Live on production for the override list only
**Layer:** one recorded production walk in `evidence/phase-11.md`.
With `harness_open` off and the override list holding the owner's id and, for the check only,
the bench account's id (added for the walk and removed after), the bench account creates three
graphics from unseen briefs (a lower third, a two-sided board, a type with operator actions);
each lands in the library, opens, and plays in the browser output with its fields and controls;
an account outside the list sees no Create with AI engine. The owner's own look is the gallery
verdict of 4.6, never a walk the run waits on.

### AC-15: The superseded rulings are retired where they live
**Layer:** `npm run learn`, the compiled contracts, the docs diff.
Decision 5 of the platform plan and the funded-route gate say what decision 1 says; the ZDR
default and `pin-managed-calls-preserve-task-requires` say what decision 2 says; the tier rules
say what decision 3 says; `docs/AI_PROVIDER_GATEWAY.md`, `docs/AI_TASK_REGISTRY.md`,
`docs/AGENT_CLI.md`, `docs/ARCHITECTURE.md` and `docs/GOALS.md` match; #771 is closed with a
link to this spec.

### AC-16: Improvements live in the shared CLI or skill, never in an Anthropic-only prompt
**Layer:** a Node test capping the system prompt and the checker's read of it at each phase.
The container's system prompt is plumbing within 25 lines; every skill or CLI change in H5 to H8
carries the measurement that earned it in the phase's evidence.

### AC-17: Instruments never outrank the picture
**Layer:** `evidence/instruments.md` and the exam report.
Every disagreement between an instrument and the critic, judge or owner is logged with its
resolution; at exam time no blocking instrument finding stands on a graphic the judge or owner
approved without that entry.

## Phases

Each phase runs `/check` and lands with `/queue-merge`; the builder adds the next phase's notes
under `## Phase notes` and the spend to the ledger. Every phase ends at a safe stopping point,
with `main` green and the spend recorded, so the next run resumes without redoing or re-spending.
Product integration (H9 onward) starts only after H8 passed. `plan-run` numbers phases 1 to 12
from this list; phase n is H(n-1), and evidence files are named by H number.

A checker spends nothing: it creates no session and runs no reference arm. It verifies from the
ledger, free session fetches on the bench key (not found after cleanup is itself AC-4's fourth
proof), the committed artifacts, a local re-capture of the delivered packages and `--control`.
Mechanically, `scripts/harness-bench.mjs` creates sessions only with an explicit `--build
<phase>` and refuses when the ledger already holds that phase's completed entries.

1. **H0. The sealed briefs** (AC-2). The builder writes no brief: a `claude -p` child on the
   subscription writes them from the permitted inputs of 4.1, the builder reviews coverage and
   seals. Files: `benchmarks/harness/exam/briefs.sealed`, `briefs.sha256`,
   `benchmarks/harness/tuning/briefs.json`, `evidence/phase-0.md`; the plaintext and passphrase
   under `docs/private/harness-exam/` in the main checkout. No `src/`, no `cli/`. No credit.
2. **H1. The bench and the dry run** (AC-1; the plumbing of AC-16). Files: `benchmarks/harness/`
   (ledger, arms, capture, gallery, judge runner skeleton), `scripts/harness-bench.mjs`,
   `scripts/harness-bench.test.mjs`, `scripts/harness-agent-sync.mjs`, `agents/noacg-harness/`,
   `api/_lib/harness/client.ts` with its test (no route), `cli/` for `coverage`, `record` and the
   digest with their offline tests, `cli/scripts/build-skill.mjs` for the Skills API target,
   `scripts/bench-env.mjs` for a `harness` profile, `package.json` for `@anthropic-ai/sdk`. No
   credit; the dry run is `--control`.
3. **H2. The judge** (AC-3). Files: `benchmarks/harness/judge/` (prompt, rubric, lock, the
   calibration runner), `evidence/phase-2.md`. Subscription only, paced; the held-back part
   never read while writing the prompt.
4. **H3. Feasibility** (AC-4, $10). Files: `agents/noacg-harness/environment.yaml` as measured
   (networking, and `packages` if it worked), `evidence/phase-3.md`, `evidence/phase-3/` traces,
   the ledger. Stops with the fallback recommendation on any failed proof.
5. **H4. The exam reservation** (AC-5, $0). Files: the ledger, `evidence/phase-4.md`, the budget
   default in `agents/noacg-harness/agent.md`, the round ceiling and brief count for H5 to H7.
   Stops with `needs: decision` before H5 if fewer than two rounds fit or the time is over the
   pass rule (5.2).
6. **H5. Tuning round 1: the August reproduction** (AC-6, AC-16, AC-17, the round ceiling). The
   round's v1 tuning briefs on Opus 5.5, the archived August cells as the reference, the judge on
   the tuning set. Files: `evidence/phase-5.md`, `evidence/instruments.md`, the ledger; `cli/` or
   `cli/skill/` only with a measurement.
7. **H6. Tuning round 2: the variable round 1 picked** (AC-6, AC-16, AC-17, the round ceiling).
   The critic on the same briefs and model if round 1 delivered any basic defect or missing
   action, else Sonnet 5.5 on the round 1 configuration; the variable named in the evidence
   before any spend. Reference runs for new tuning briefs on the subscription.
8. **H7. Tuning round 3: the next rung** (AC-6, the round ceiling). Sonnet 5.5 on the
   configuration that won after round 2 (the critic kept or dropped on its measurement) if round
   2 was the critic; else Haiku 5.5 only if Sonnet matched and the money fits, else the round is
   recorded as not needed and spends nothing. The winner named; the session budget revised for
   it; the stop rule applied across H5 to H7.
9. **H8. The held-out exam** (AC-7, the reserved amount). Decrypt and verify; the winner on all
   20; the reference arm on all 20 on the subscription; capture, judge in both orders, report,
   gallery; the owner notified by phone. A miss stops the run; the report lands either way, and
   `docs/AI_ATTEMPTS.md` gets the entry.
10. **H9. The server** (AC-8, AC-9, AC-10, AC-11). Files: `api/_lib/harness/*` with tests, the
    task in `aiTaskRegistry.ts` and the engine admission in `aiModelCatalog.ts` with tests, one
    migration (`profile = 'harness'`, `ai_harness_runs`, the finalize RPC), the four routes in
    `api/ai/[...path].ts`, the sweep in `api/render/cleanup.ts`, the settings rows in
    `systemSettings.ts` and `/admin`, the feature key in `src/entitlements/contract.ts`,
    `.env.example`. Off by default; the CLI verbs published as a release if not yet.
11. **H10. The step** (AC-12, AC-13). Only when `wizard-ai` has no open phase. Files:
    `src/ai/creation.ts`, the AI step and its folder, `e2e/_ai-step.ts`, `e2e/ai.spec.ts`,
    `e2e/ai-tiers.spec.ts`, the configured journey. Lite's door closed in the same change; Pro
    stays quarantined.
12. **H11. Owner-only live, the glance, the rule pass** (AC-14, AC-15). Only while `wizard-ai`
    A5 and `wizard-shell` S7 are not open. Enable on production for the owner's id and, for the
    walk only, the bench account's id (removed after), the three walks, the owner's gallery
    verdict recorded if given, `npm run learn` for the retirements, the docs, `Closes #771`.

## Readiness

Before H0: this spec and `work.json` on `main`, `work-spec.mjs status` clean, the "Runnable
plans" line present, `origin/main` CI green, the owner's window supplied. Before H3 and every
paid phase: the bench workspace's monthly limit at or under the ledger's remainder, the machine
awake, `claude auth status` green in the constructed environment, Chrome or Edge present for the
local capture. Before H9: `@anthropic-ai/sdk` on `main` (H1). Before H11: the webhook endpoint
registered in the Console (Manage, Webhooks) with `ANTHROPIC_WEBHOOK_SIGNING_KEY` in Vercel
production, the owner's user id and the bench account's id for the override list, the migration
applied by the landing.

## Execution settings and how the owner starts this plan

`/plan-run noacg-harness`, sequential, `wave-row` (Opus, high) builders, `wave-row-deciding` for
H4 and for H7's winner; the preflight of `.agent-workflows/plan-run.md` step 1 with this spec's
`work.json`; the start template:

```
/plan-run noacg-harness until <date and time with UTC offset>
```

A later run resumes at the first phase without a `landed` record; a paid phase whose ledger
entries already exist resumes from its last recorded session and never re-spends. Opening the
harness to students is not a phase: the owner flips `harness_open` after the glance.

## What the plan can demonstrate, and what stays uncertain

Demonstrable: the mechanism in the container with evidence a reader can replay; a judge that
separates the owner's good from bad on held-back verdicts; a pilot exam against Claude Code on
20 sealed briefs with every number reported; a product path that completes without the student,
saves once, deletes the session, and refuses beyond its limits; one Create with AI, owner-only.
Uncertain: whether the money fits (5.2); whether a cheaper model matches; broad reliability,
which only real use proves; the judge on motion, calibrated on stills.

## Owner setup

Already done: `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY` and `ANTHROPIC_BENCH_API_KEY` in
the main `.env`; the bench workspace's $100 limit; Managed Agents reachable on the bench key
(2026-10-14, free read). Before the first run: keep the machine awake and the Claude desktop app
open for the wake-up task. Each later month: set the bench workspace's limit to the ledger's
remainder. Before H11: the webhook registration and its signing key in Vercel.

## Phase notes

Each phase's pull request adds here what the next phase must allow for, newest first: the
previous verified `main` sha, the merge sha, the revert command, decisions taken, traps found,
the spend added to the ledger, and the check's findings.

### H7 second check (2026-10-15, on `c7c5ae224`)

- **Verdict: PASS.** H7's round, the Opus 5.5 winner and the stop-rule reading hold as the first
  check found, and the repair (PR #1264) lets H8 start on the skill tuning measured. Checked on
  `main` `c7c5ae224` in a fresh worktree; no product code changed, no session, no credit.
- **The decision, against the spec:** path (a) is the reading AC-7 and AC-16 support. The exam
  scores what tuning chose, and #1258's skill change was never measured on the tuning set, so an
  exam on v8 would score an untuned skill (AC-16) and need a round first. Holding the skill
  constant in both arms keeps 4.5's comparison to one variable, the harness against Claude Code.
  It also keeps the reference arm, which never saves (4.2), off the new "connect first" text.
  `2128d984d` and npm's `gitHead` `e4d7b0841` hold the same `cli/skill`. One nuance: the
  marketplace serves `./cli/plugin` from `main`, so a user who installs plugin "0.11.0" today gets
  #1258's skill. "Published" in 4.2 is true of the npm package only. That does not change the
  verdict, and H9's reconciliation covers it.
- **Dry runs on `main`:** `harness-agent-sync --workspace bench` planned environment, skill and
  agent `keep` with the frozen note naming bundle `c9e114cc79e5` against `7f130e3e6099`, cause
  `37329aa4f`, source `2128d984d`. `--apply` printed "Everything matches the lock; nothing to do",
  and the lock and ledger hashes were the same before and after. With one line added to
  `agent.md`, the dry plan showed `agent update (the server's v7 differs in system)` and "Nothing
  to apply: the bench agent is frozen for H8's exam" (restored after). `--build H8 --dry --arms
  managed-agents,claude-code --model claude-opus-5-5` (after `npm run build` in `cli/`) printed
  the `skill:`, `agent:` v7 and `reference:` lines and "DRY H8: every check before the first
  session passed ... $0" in 5.6 s. Its plugin's 15 files equal `cli/plugin` and, for the 9 skill
  files, `2128d984d`'s plugin copy. `--build H9 --dry` refused (frozen), and `--build H7 --dry`
  refused (completed).
- **The server, my own free read:** agent `agent_0183yBA1miijGFNvm5bkMv6B` latest version 7, Opus
  5.5 effort high, `session_budget_cents` 194, `multiagent` null, `mcp_servers` empty, one tool
  set, skill `skill_01G2iMqxJJJr4GJQe6q94ddo` `skver_01KXt4Xf4msx422tocc44dmh`, system prompt 15
  lines and contained in `agent.md`. Environment `env_01PFiXgBUuDv5aFgEwHXayiY` is active and
  never updated since it was created (2026-10-14 22:43Z). Its networking equals `environment.yaml`,
  as the lock names it.
- **The drift test bites:** `harness-bench.test.mjs` passed 43 of 43. With the freeze disabled
  (`examPending` returning null, the pre-repair behaviour), 3 failed: the freeze window, the
  changed `cli/skill`, and the frozen sync. The dry sync then planned `skill version, agent update`
  again. The code at `ef7ed795d` planned the same. `--control` was run directly in the shell with
  `NOACG_URL=https://noacg.studio` (without it the CLI looks for a local bridge) and printed
  CONTROL PASSED at $0.
- **Spend:** none. The ledger is unchanged since `c360a1515`: H3 266, H5 624, H6 1,008, H7 236
  (35, 53, 53, 60, 35), $21.34 spent, reserve $46.60 (20 x (194 + 39)), $32.06 left,
  `examPending` H8. `cli/src` is unchanged since `1d3aade23`.
- **Still missing for H8, H8's own build, not a defect of this phase:** `--build` reads only
  `tuning/briefs.json`. The sealed-brief path (decrypt with the private passphrase, verify against
  `briefs.sha256`, 4.1), the 20-brief exam run, and `exam/REPORT.md` with 4.4's figures and Wilson
  intervals are not wired yet. The parts exist (`sealed.mjs` `openSealed`/`verifySealed`,
  `calibration.mjs` `wilson`, `judgeRun` judging in both orders, `buildGallery`). H8's phase line
  names decrypt, verify, report and gallery as its own work. H7's scope (AC-6, the round ceiling)
  does not include them.

### H7 repair: the exam runs the skill v7 pins (2026-10-15, on `ef7ed795d`)

- **Check's findings (H7 check, on `dd31ec76d`):** FAIL product. H7's round holds and the stop rule
  lets H8 run (5.5 measures progress on the tuning set; H6 moved cost and verdict; 3.8 the winner
  runs the exam), but H8 could not start as written. PR #1258 (`37329aa4f`, the agent-delivery plan)
  changed `cli/skill/noacg-graphic` (`SKILL.md`, `references/setup.md`) just before H7 merged. On
  `main` the dry sync planned `skill version, agent update`; with `cli/skill` and the plugin copy
  restored to `1d3aade23` it planned all `keep`, so that change was the whole difference. A re-sync
  would put the exam on an untuned v8 (AC-16) whose skill says to run `noacg login` before the
  brief, which the container prompt forbids. `--build H8` refused before any session, naming
  `agents/noacg-harness` and pointing at the re-sync. Everything else held: v7 on the server equals
  its definition (Opus 5.5 high, budget 194, `multiagent` null, the lock's skill), ledger $21.34,
  reserve $46.60, $32.06 left, tests 38 of 38, `--control` passed.
- **DECIDED: path (a), the exam runs agent v7 as tuned, on the lock's skill, in both arms.**
  Reasons: (1) AC-7 and AC-16: the exam scores what tuning chose, and v7 pins
  `skver_01KXt4Xf4msx422tocc44dmh` (bundle `7f130e3e...`), the bytes H5 to H7 measured. (2) #1258's
  change is the delivery flow of a user's own session (connect first, save every graphic, a
  package pending Install). The harness never logs in or saves (the host saves), the change touches
  no design or contract text, and it contradicts the container prompt. Measuring a v8 would spend
  about $6 of the $32.06 left (H5's five Opus graphics cost $6.24) on a change that cannot improve a
  harness graphic, and it would first need the login conflict resolved in the skill (AC-16), which
  is product work. (3) The tuned bytes are the skill of the published `@noacg/cli` 0.11.0 (npm's
  `gitHead` `e4d7b0841` holds the same skill as `2128d984d`, the release commit). So the reference
  arm, "Claude Code with the published plugin" (4.2), gets the released skill too.
  The exam then holds the shared skill constant and measures the harness against Claude Code.
  **Revert:** `git revert -m 1` the merge; the freeze and the pin go and `--build H8` refuses as
  before. To take (b) instead: revert, resolve the `noacg login` conflict in `cli/skill`, sync to
  v8, measure it on the tuning set as a round before the exam, and re-reserve if `B` moves.
- **What landed:** `benchmarks/harness/lib/skill-pin.mjs` finds the lock's skill in git (the newest
  commit whose `cli/skill/noacg-graphic` hashes to the lock's bundle: `2128d984d` today) and builds
  the reference arm's plugin from it. `examSkill` decides what a `--build` runs. With the same bytes,
  the run goes on. With different bytes, a tuning round is refused and the cause named. In the
  exam, the lock's skill runs, refused only where a session would still meet the checkout's text:
  a `noacg docs` topic (contract, package, validator, control, design-notes) that differs, or a
  CLI version other than the lock's 0.11.0 (the topics are read from `cli/src`, which every CLI
  build a session runs is compiled from). `examPending` (ledger) is the window from the close of
  tuning to the close of the exam. In it, `harness-agent-sync` plans against the lock's skill and
  says what the exam's `--build` will say of the checkout's skill, `--apply` refuses any change,
  and `--build` refuses every phase but the exam. `--build <H#> --dry` makes every check before
  the first session and stops at $0, with no briefs; any spelling (`--dry=1`, `--dry-run`) counts.
  A build now checks the reference arm's subscription before any arm's first session, so a
  reference that cannot start is found before the credit arm spends. `--build`'s messages name
  `cli/skill` and the commit; in the exam they never say sync. Five new tests (43 of 43).
- **Dry outputs on this branch** (current `origin/main` `ef7ed795d` plus this change):
  ```
  $ node scripts/harness-agent-sync.mjs --workspace bench
    environment  keep
    skill        keep
    agent        keep
    frozen for H8's exam: agent v7 keeps skill skver_01KXt4Xf4msx422tocc44dmh as tuned.
    cli/skill/noacg-graphic is bundle c9e114cc79e5, not the 7f130e3e6099 that agent v7 pins
    (changed by 37329aa4f Lead Downloads with one short coding-agent prompt that needs no plugin):
    H8 runs the lock's skill as tuned, from 2128d984d. ...; H9 reconciles the product's skill with it
  $ node scripts/harness-agent-sync.mjs --workspace bench --apply
  Everything matches the lock; nothing to do.
  $ node scripts/harness-bench.mjs --build H8 --dry --arms managed-agents,claude-code --model claude-opus-5-5
    skill: cli/skill/noacg-graphic is bundle c9e114cc79e5, not the 7f130e3e6099 that agent v7 pins
    (changed by 37329aa4f ...): H8 runs the lock's skill as tuned, from 2128d984d. ...
    agent: agent_0183yBA1miijGFNvm5bkMv6B v7 read back from the server as agents/noacg-harness
    defines it, skill skver_01KXt4Xf4msx422tocc44dmh
    reference: claude-code on claude-opus-5-5, the subscription's oauth_token, plugin cli/plugin
    with the lock's skill in <run dir>\plugin
  DRY H8: every check before the first session passed. Nothing uploaded, no session created, $0.
  $ node scripts/harness-bench.mjs --build H9 --dry --arms managed-agents
  harness-bench: tuning is closed and H8's exam is pending: the bench is frozen for it until it closes
  ```
  The built plugin's nine skill files equal `2128d984d`'s plugin copy, and its other files equal
  the checkout's `cli/plugin`. The lock file is unchanged after `--apply`.
- **H8 must allow for:**
  - Run with no sync: the bench stays frozen until `--close H8`. Read the run's first lines: the
    `skill:` line must name the lock's bundle and `2128d984d`, the `agent:` line v7. Run the dry
    form first, with the arms and the reference `--model` the exam uses.
  - `--build` reads only the tuning briefs. H8 adds the sealed briefs' path (decrypt and verify, 4.1).
    The dry form needs no briefs.
  - The pin covers the skill only. The container installs this checkout's CLI (`npm pack` of `cli/`),
    and the bench captures with it. `cli/src` is unchanged since H7's base `1d3aade23` as of this
    repair. If it has changed by H8, say so in the report (`git diff --stat 1d3aade23 HEAD -- cli/src`).
  - If the exam is refused for a `noacg docs` topic or the CLI version, another plan moved them.
    Decide then: pack the CLI from a copy of `cli/` with the lock's skill, or record the
    difference. Never sync.
  - **H9 must reconcile the product's current skill with the bench lock.** The shipped skill now
    says to connect first (`noacg login`) and save every graphic, which the container's plumbing
    forbids. Resolve that in the skill (AC-16), then sync the production agent and measure the
    harness on it before AC-14.
- **Decisions** (each revertible in the merge):
  - DECIDED: path (a), above.
  - DECIDED: the reference plugin is the checkout's `cli/plugin` with the lock's skill copied in as
    build-skill copies it (`name: graphic`), so its manifests carry this CLI's version and
    `noacg doctor` sees one. Not `cli/plugin` at `2128d984d`.
  - DECIDED: the CLI the sessions run (the container's tarball, the reference arm's shim) is not
    repacked with the lock's skill. `noacg docs` is the only way it shows skill text, and none of
    its topics differ today (#1258 changed `SKILL.md` and `setup.md`, which it does not print), so
    a refusal when one does is simpler and is never silent.
  - DECIDED: the lock's bytes are found in git, not recorded beside the lock: the lock is untouched,
    and a later lock is found the same way. The freeze has no override flag; leaving it early is a
    revert.
- **Traps:** finding the bytes needs history, so on a shallow clone, or after a sync from
  uncommitted files, the exam is refused ("no commit on this branch holds those bytes"). The dry
  form reads the server (free), runs `claude auth status` and builds the api runtime; it creates
  nothing. `--agent-version` still runs another version unchecked. The freeze reads this
  checkout's ledger: a branch older than H7's close is not frozen, and its `--apply` would update
  the shared environment in place (the bench reads the agent back, not the environment) and move
  its own lock. Before H8 spends, check that `claude-lock.bench.json` still names v7 and
  `env_01PFiXgBUuDv5aFgEwHXayiY`, as on `ef7ed795d`.
- **Spend:** none. No session, no sync, no upload; the read-backs are free. The ledger is unchanged:
  $21.34 spent, $46.60 held for H8, $32.06 left. **Shas:** built on `ef7ed795d`; the merge sha is
  the one the queue records. Nothing on the bench workspace to undo.

### H7 check (2026-10-15, on `dd31ec76d`)

- **Verdict: FAIL product.** The round holds; H8 cannot start as carried. Checked on `main`
  `dd31ec76d` (H7 merged from PR #1257); no product code changed, no session, no credit, no
  re-judging.
- **Blocker: the skill on `main` is not the skill agent v7 pins.** PR #1258 ("Lead Downloads with
  one short coding-agent prompt", `37329aa4f`) changed `cli/skill/noacg-graphic/SKILL.md` and
  `references/setup.md` and landed just before H7's merge. On `main` the dry
  `harness-agent-sync --workspace bench` plans `skill version, agent update`, not "everything
  keep"; with `cli/skill` and the plugin copy restored to `1d3aade23` it plans all `keep`, so the
  skill change is the whole drift. `--build` refuses on any non-`keep` step, so `--build H8` stops
  before a session. Re-syncing would put the exam on a v8 whose skill was never tuned (AC-16) and
  now says "Connect before the brief ... run `noacg login`", against the plumbing prompt's "Never
  run `noacg save` or `noacg login`". Fix before H8 spends: decide and record whether the exam runs
  v7 as tuned (the run checks the lock's skill, not the checkout's) or a re-synced v8, with that
  conflict resolved and measured.
- **Agent v7 on the server**, my own free read of `agent_0183yBA1miijGFNvm5bkMv6B`: v7 is the
  latest; system prompt 15 lines, equal to `agent.md`, and differing from v6 only by ` </dev/null`
  on the certificate line; model Opus 5.5 effort high; metadata `session_budget_cents` 194;
  `multiagent` null; `mcp_servers` empty; skill `skver_01KXt4Xf4msx422tocc44dmh` (the lock's);
  tools, name and description equal to v6's; the sync's own read-back drift for v7 is empty.
- **Order (AC-6):** `cd4904409` committed 13:36:09Z, PR #1257 opened on it 13:36:21Z, its first
  check 13:36:26Z; the first session's `createdAt` 13:36:41.29Z. Timeline: three commits, no force
  push.
- **Spend:** the ledger sums to 2,134 cents (H3 266, H5 624, H6 1,008, H7 236: 35, 53, 53, 60, 35);
  reserve 20 x (194 + 39) = 4,660 set by H7; `T` = 10,000 - 2,134 - 4,660 = 3,206. From each trace's
  usage and running time at $0.08/h, Sonnet's cache read at $0.10 gives 35.03, 53.12, 53.37, 59.73,
  34.62 cents against list 35, 53, 53, 60, 35; at $0.20 it gives 7 to 15 cents over, so the price fix
  holds. All five sessions 404; the bench file list is empty.
- **Verdict figures:** 15 judgement lines, 20 calls, $68.76 notional; judge files hash to the lock
  (LF). Re-tallied: Sonnet airable on the news lower third and countdown only, three with basic
  mistakes; pairs harness 3, August 2, no order flip. I looked at the three frames: the debate
  clock's right numeral cut at its foot and on "SECONDS LEFT" with an empty box under the title,
  the live vote's label on its bar after the Update, GOAL beside both sides at 120 ms after clear.
  Even with the scoreboard accepted, Sonnet is 3 of 5 with defects, so Opus wins either way.
- **The stop rule (5.5):** the builder's reading is the one the text and intent support. 5.5
  measures progress "as cost per accepted graphic or the judge's verdict on the tuning set", which
  is the configuration's result, not the variable's; H6 moved both ($1.56 to $1.20, August 2 to 1).
  3.8 says the matching model "wins and runs the exam", and 5.1 lets H7 be "recorded as not needed
  and spends nothing", a round that by construction makes no progress before H8; the rule exists
  so "a third idea is not tried on hope", and the exam is not an idea. H8 need not wait for the
  owner on this.
- **Tests and scope:** `harness-bench.test.mjs` 38 of 38; `--control` run directly after `cli/` was
  built, against `https://noacg.studio`: CONTROL PASSED at $0. H7's own diff touches no `cli/`,
  `src/` or `api/` file. Issue #1259 is open; `instruments.md` entries 13 to 16 are present.

### H7. Tuning round 3: Sonnet 5.5 (built 2026-10-15)

- **Check's findings (H6 second check, on `a8aa62e38`):** AC-6, AC-16, AC-17 and the round ceiling
  hold after the repair: agent v6 read back by the checker (`multiagent` null while v5 still shows
  the critic; prompt 15 lines, equal to v3's and `agent.md`; tools, model Opus 5.5 high, name and
  description as v3; skill `skver_01KXt4Xf4msx422tocc44dmh` = lock bundle `7f130e3e...`; budget 224;
  `mcp_servers` empty); the sync's dry plan all `keep`, compared with the server (v6 no diff, v5
  differs in `multiagent`, v3 only in the skill id); bench file list empty; the new test fails on
  the old update body, 38 of 38 now; `--control` passed at $0; ledger 1,898 cents (H3 266, H5 624,
  H6 1,008), `T` $34.42, reserve 4,660, H6 figures untouched. Trap: `--agent-version N` skips the
  server check. Carried: v6 never v5, Sonnet 5.5, five briefs, 224 cents, `--ceiling-cents 1500`, no
  `--critic-cents`, the stop rule's reading before spend, Update ops before pairs, #1251's
  five-option state outside the frames.
- **Shas:** previous verified `main` `1d3aade23`; built on `claude/plan-noacg-harness-p8-build`. The
  hypothesis, ceiling, signal, match rule and stop-rule reading committed in `cd4904409`
  (13:36:09Z), on GitHub by 13:36:21Z (draft PR #1257), before the first session (13:36:41Z). The
  merge sha is the one the queue records. **Revert:** `git revert -m 1` the merge, then restore
  `benchmarks/harness/ledger.json` from the merge (the spend stays recorded, and a ledger without
  it would let `--build H7` pay again), and `node scripts/harness-agent-sync.mjs --workspace bench
  --apply`, which makes a new version with v6's configuration. Nothing on the bench workspace to
  clean up (every session 404, the file list empty).
- **What landed** (`benchmarks/harness/evidence/phase-7.md`): five Sonnet 5.5 sessions (a
  per-session override of v6, effort `high`) on the five v1 briefs, all delivered validator-clean
  with every action, **$2.36** of $15, median **419 s**. The frozen judge: **3 graphics with a basic
  visual defect** (the debate clock's numeral cut by its mask and on its label, the live vote's
  label on its bar after the Update, the scoreboard flashing GOAL beside the side that did not
  score on clear), **2 of 5 accepted, $1.18 per accepted graphic**, pairs harness 3, August 2, tie
  0, no order flip. Sonnet read 0 to 6 coverage frames by name and missed defects in frames it
  had. **DECIDED: Opus 5.5 wins** (the match rule fixed before spend: at least 4 accepted and no
  basic defect). No progress (August 2 against 1); with H6 counted as progress, the stop rule does
  not fire and H8 runs the winner. Haiku not measured (3.8: only after Sonnet matched). The
  bench's Sonnet cache-read price corrected to $0.10 (every session's list cost reproduced to the
  cent). `instruments.md` entries 13 to 16; the validator's silence on a vertical mask cut is
  #1259.
- **H8 must allow for:**
  - **H8 runs agent v7** (`agent_0183yBA1miijGFNvm5bkMv6B`, lock hash `b1cf0534...`): Opus 5.5
    effort `high`, no critic, budget **194** (`agent.md`), `o` 39, `R` **$46.60** set by H7. Run it
    with no `--model`, `--effort` or `--agent-version`, so the server check reads v7 back. The
    reference arm is Claude Code on the subscription (4.2), which needs `--model`.
  - v7's certificate import closes stdin (`</dev/null`), new and not yet run on Opus: read the first
    exam session's trace for the import (rc 0, `bridge ready` near 35 s) before trusting the rest.
  - The 194 cap sits 5 cents over the dearest Opus graphic measured (H5's debate clock, $1.89). A
    harder exam brief can stop at it (`budget_reached`, not ready, a delivery miss in 4.5): report
    each capped session as such.
  - Before the judge: compare each pair's Update ops and check each cell's `stress.json` against
    its fields (the sealed briefs key stress by position); a list brief's verdict covers only the
    item count its stress gives (#1251); the validator misses a line its mask cuts vertically at
    rest (#1259), so a judge finding there is not an instrument disagreement to resolve against
    the picture.
  - The stop rule's reading is recorded in `phase-7.md`: if the owner reads it strictly (H6's
    critic made no progress, so H7 is the second round in a row), H8 waits for the owner.
- **Decisions** (each with its reasons in `phase-7.md`):
  - DECIDED: `--effort high` on the Sonnet override. Revert: another round at `medium`.
  - DECIDED: the match rule, the winner rule and the stop rule's reading, before any spend.
  - DECIDED: `session_budget_cents` 194 (was 224), the reserve's `B`. Revert: 224 in `agent.md`,
    re-sync, `--reserve --by H7 --budget-cents 224 --overshoot-cents 39`.
  - DECIDED: `</dev/null` on the prompt's certificate import (two Sonnet sessions hung 295 s there).
    Revert: drop it from `agent.md` and re-sync.
- **Traps:**
  - A `--model` override replaces the agent's model object in full: pass `--effort` with it, or the
    session runs at the model's default effort.
  - The certificate hang ends at the tool's 295 s timeout, four seconds inside the cache's five
    minutes: a slower one would rewrite the whole context.
  - The judge on ten cells and five pairs took about 31 minutes on the subscription.
- **Spend:** $2.36 credit; the ledger at $21.34 of $100, $46.60 held for H8, $32.06 over. $68.76
  notional on the subscription.

### H6 second check (2026-10-15, on `a8aa62e38`)

- **Verdict: PASS.** The first check's blocker is gone. Checked on `main` `a8aa62e38` (the repair,
  PR #1254); no product code changed, no session, no credit.
- **Agent v6 on the server**, my own free read of `agent_0183yBA1miijGFNvm5bkMv6B` on the bench
  key: v6 is the latest version, `multiagent` null (v5 still shows the critic, as recorded),
  system prompt 15 lines and equal to v3's and to `agent.md`, tools, model (Opus 5.5, effort high),
  name and description equal to v3's, skill `skver_01KXt4Xf4msx422tocc44dmh` (lock bundle
  `7f130e3e...`), metadata `session_budget_cents` 224, `mcp_servers` empty.
- **The sync's dry plan:** environment, skill and agent all `keep`, with no "not read back" line,
  so it compared the server. Its read-back on the same definition gives no drift for v6,
  `multiagent` for v5 and `skills` for v3 (another skill version id, the same bytes).
- **Bench workspace files:** none; `file_01QppTruKxMVpKQdtubuC9Lc` is gone.
- **Tests:** with the update body no longer sending `null` for omitted fields, the new sync test
  fails ("null is what agents.update takes to clear it"); restored, `harness-bench.test.mjs` passes 38 of 38.
  `--control` run directly, after `cli/` was built and with this checkout's dev server up:
  CONTROL PASSED at $0.
- **H6 figures unchanged:** since H6's merge `06acc2e34`, the ledger, judge files, `cli/`, `src/`
  and `api/` are untouched. The ledger still sums to 1,898 cents (H3 266, H5 624, H6 1,008), so `T`
  is $34.42 and the reserve is 4,660. In `phase-6.md` the only line changed is H7's rung, now v6;
  the rest of the change is the added repair section. The H6 ledger note still says "v5"; it is a
  record and stays as written.
- **Carry for H7** (from the first check and the repair, all written above): agent v6, never v5;
  Sonnet 5.5 (`--model claude-sonnet-5-5`) on the five briefs, 224 cents, `--ceiling-cents 1500`,
  no `--critic-cents`. Say which stop-rule reading applies before any spend. Compare Update ops
  before judging pairs. A credit run now checks the server copy of the lock's version before it
  starts, and `--agent-version` runs another version unchecked.

### H6 repair: the sync clears what the definition dropped (2026-10-15, on `0305d47d5`)

- **Check's findings (H6, on `06acc2e34`):** FAIL product. Bench agent v5 still carried v4's
  `multiagent` block (the critic `agent_01HSHf5nbrnRVkTx591MJNJj` v1 as an enabled predefined
  subagent; workflows, inline agents and advisor disabled) on the server: `agentCreateBody` sent
  `multiagent` only when present, `agents.update` keeps unsent fields, and the lock hash
  (`c47526c8...`) compares local files only, so the dry plan showed no drift. H7 on v5 would not run
  the configuration that won. Also the first H6 run's CLI upload `file_01QppTruKxMVpKQdtubuC9Lc` was
  still on the bench workspace. Everything else re-derived (order, ledger 1,898c, H6 1,008c, `T`
  $34.42, reserve untouched, the $0.4105 cache lapse after a 332 s critic wait, sessions 404, judge
  tally, defects 0, missing 0, the CLI fix, #1251, tests, `--control`). The departures stand as
  recorded; the composite progress claim is valid arithmetic on n=1, so H7 states its stop-rule
  reading before it spends.
- **H7 runs agent v6** (`agent_0183yBA1miijGFNvm5bkMv6B`, lock `claude-lock.bench.json`). Read back
  on the bench key: `multiagent` null, system prompt 15 lines equal to v3's, tools and model equal to
  v3's, skill `skver_01KXt4Xf4msx422tocc44dmh` (bundle `7f130e3e...`), metadata `session_budget_cents`
  224. Do not run v5. A credit run now refuses to start if the server's locked version differs from
  `agents/noacg-harness`, so a drift shows before any session.
- **Decisions:** an update sends `null` for each clearable field the definition omits
  (`description`, `mcp_servers`, `multiagent`, `tools`) and for metadata keys the server has and the
  definition does not, as the SDK documents for clearing. The plan reads back the agent only, not
  subagents (none are listed now); the read compares what is sent, contained in what the server
  returns, since the server fills defaults in. Leftover CLI uploads are deleted at the start of the
  next credit run, by name (`noacg-cli-*.tgz`), on the rule that bench runs are one at a time on the
  bench workspace; an age or liveness test was not needed for that.
- **Traps:** a dry `harness-agent-sync` now makes a free read when the workspace key is in `.env`;
  without it, or when the read fails, it says the plan is from the lock alone. The run's guard
  checks the locked version only: `--agent-version 5` would still run v5 with the critic, so a
  control names v3. A leftover upload from a run stopped mid-way is only
  removed when the next credit run starts, not at once.
- **Spend:** none. No session; sync, reads and the file deletion are free. Revert: `git revert` the
  merge; v6 stays on the server and is v3's configuration on the same skill bytes.

### H6 check (2026-10-15, on `06acc2e34`)

- **Verdict: FAIL product.** The round itself holds; the configuration it hands H7 does not. Checked
  on `main` `06acc2e34` (H6 merged from PR #1252); no product code changed, no credit spent, no
  session created. One `claude -p` re-judgement on the subscription ($1.59 notional, not in the
  ledger).
- **Blocker: agent v5 on the bench still carries the critic.** A free read of
  `agent_0183yBA1miijGFNvm5bkMv6B` shows v5 with v4's `multiagent` block (the critic
  `agent_01HSHf5nbrnRVkTx591MJNJj` v1 as a predefined subagent, enabled); v3 has `multiagent: null`.
  v5's system prompt and tools equal v3's. The cause is in the sync: `agentCreateBody` sets
  `multiagent` only when the definition has one, and `agents.update` keeps a field it is not sent,
  so dropping the block removed nothing on the server. The lock's `c47526c8...` is the hash of the
  local files, and the sync's plan compares only files to the lock, so it reports nothing to do.
  H7 as carried (Sonnet 5.5 "on agent v5, no critic") would run with an Opus critic in the roster.
  Fix before H7 spends: clear the block on update (or create a fresh agent), re-sync, and read the
  new version back from the server to confirm `multiagent` is null; a test that an update without
  subagents sends the clearing value. A stopgap is `--agent-version 3` (same prompt, tools and skill
  bytes, `7f130e3e...`).
- **Also on the bench:** one CLI upload is still there (`file_01QppTruKxMVpKQdtubuC9Lc`,
  `noacg-cli-0.11.0.tgz`, created 08:31:08Z, the first H6 run's), against "the CLI upload deleted".
  It costs nothing; delete it with the fix. The likely cause is the stopped run, which never reached
  its cleanup.
- **Order (AC-6):** `fc693944f` and `c9f1a27f7` committed 08:27:33Z and 08:27:34Z, `ed28a2320`
  08:29:11Z, and its first check run started 08:29:23Z, so it was on GitHub before the first
  session's first event (08:31:09Z). `108c85147` (the cut) had checks at 08:45:51Z, before the next
  new session (live vote, 08:58:38Z). The scoreboard session began at 08:42:32Z, before the cut, as
  recorded. The PR timeline shows nine commits and no force push.
- **Spend:** the ledger sums to 1,898 cents (H3 266, H5 624, H6 1,008: 304, 301, 312, 91);
  `T` = 10,000 - 1,898 - 4,660 = 3,442. From a copy of the raw events: per thread, requests,
  images, largest request and minimum cache read are as `phase-6.md` says (author + critic: 25 + 35,
  36 + 31, 37 + 25; control 21). The only lapse is the news lower third's $0.4105 rewrite of 76,947
  tokens after the author sat idle 332 s (request end to next start) waiting on the critic. Each
  session's priced tokens plus running time give its list cost. All four sessions 404, with no
  files scoped to them.
- **Verdict figures:** 12 judgement lines, 7 singles and 5 pairs, $50.90 notional. The judge files
  hash to the lock as committed. Re-tallied: news lower third a tie (each order preferred the
  first shown); scoreboard harness, high; live vote harness (critic and control), medium; the
  control over the critic arm in both orders. Re-judging the control alone gave airable, no basic
  mistake (medium, was high). Its Update frame shows labels shrunk to fit, without overlap.
- **The fix and #1251:** the CLI diff touches only a `Label | value` line. Among the H5 and H6
  captures only the live-vote cells hold a `|` value. The fixed `coverage` on H5's live-vote zip
  now shows every option wrapped in the long and Update frames. Re-shot with five options and a
  `33.33` leader, the critic arm's live vote clips LEADING to "LEADINC" (#1251 is real), and the
  control's holds.
- **Tests and scope:** `harness-bench.test.mjs` 36 of 36, `cli/test/coverage.test.mjs` 9 of 9;
  `--control` run directly after `cli/` was built: CONTROL PASSED at $0. The merge changes no
  `cli/skill/`, `src/` or `api/` file. In `agents/` only `agent.md`'s comment and the lock changed.
  The system prompt is 15 lines on the server.
- **The departures, judged:**
  - *The fix and the critic in one round:* acceptable. The fix was decided in writing before any
    spend. It changes only the live vote's matrix, and the no-critic control isolates it there.
  - *300 cents against 224:* recorded before the first session, and it does not change the
    outcome. The critic thread alone ($1.31 to $1.68) plus an author thread (at least $1.36) is
    above $1.56 a graphic at any budget, so the cost rule drops the critic either way.
  - *The cut briefs:* recorded and pushed before the next new session. The drop was already
    settled by cost, and the control was the only reading left that the round needed.
  - *The composite progress claim* is arithmetically right (99 + 133 + 88 + 189 + 91 = $6.00 over
    5 accepted; 3-1-1), but it rests on one live-vote sample and credits the round with a change
    that was not its variable. Read strictly, the critic round made no progress, and H7 without
    progress would be the second round in a row (5.5). H7 should state which reading it applies
    before it spends. Its fresh five-brief Sonnet measurement settles it either way.
  - *Reserve and `o`:* they follow 5.2. The critic is dropped, so there is no critic share. The one
    larger request came from a wait the winning configuration never has: the control's longest gap
    was 24 s.
- **Carry for H7:** fix and verify the agent's roster on the server first (above). Then run as
  carried: Sonnet 5.5 on the five briefs, 224 cents, `--ceiling-cents 1500`, no `--critic-cents`.
  Name the stop-rule reading, and compare Update ops before judging pairs. The live vote's
  five-option state is outside every frame until #1251 lands.

### H6. Tuning round 2: the fresh-eyes critic (built 2026-10-15)

- **Check's findings (H5, on `4a089f9bb`):** AC-6, AC-16, AC-17 and the round ceiling hold: the
  hypothesis `1b6f5db84` (alias rule included) was pushed before the first session (06:05:35Z), no
  force push; ledger H5 624 cents, total 890 of 10,000, `m` 128.8, `B` 194, `R` 4,660, `T` 4,450 (two
  $15 rounds), median 337 s; raw events 129 requests, minimum cache read 99.927%, largest $0.3899,
  tokens $6.20 plus running time = $6.24; sessions 404, file lists empty; 15 counted judgements, 4
  void, pairs 2-2-1, judge files hash to the lock; the live vote re-judged on the subscription not
  airable, overlap seen in the frame; missing actions re-run on 10 cells match; prompt 15 lines,
  tests 32 of 32, `--control` passed at $0; no `cli/`, skill, `agents/`, `src/` or `api/` change. New:
  coverage's Update drives only `textKeys[0]`, so the arms were updated on different fields (August
  re-shot with the options Update handles it, verdict stands; `instruments.md` entry 9). The
  work-spec status reading "spec changed: reconcile acceptance" predates H5.
- **Shas:** previous verified `main` `384f0eff2`; built on `claude/plan-noacg-harness-p7-build`. The
  hypothesis, ceiling and signal committed in `ed28a2320` (08:29:11Z, pushed at once) before the
  first session (08:31:08Z); the mid-round cut in `108c85147` (08:45:37Z) before the next new session
  (08:58:37Z). The merge sha is the one the queue records. **Revert:** `git revert -m 1` the merge,
  then restore `benchmarks/harness/ledger.json` from the merge (the spend stays recorded, and a
  ledger without it would let `--build H6` pay again), and `node scripts/harness-agent-sync.mjs
  --workspace bench --apply`. Nothing on the bench workspace to clean up (every session and output
  deleted, the CLI upload deleted; agents v4 and the critic agent stay, unused).
- **What landed** (`benchmarks/harness/evidence/phase-6.md`): **#1246 fixed first** (`noacg coverage`
  grows the label of a `Label | value` line, to at least 32 characters), measured at $0 and with a
  control. **The critic** (agent v4: the critic, `critic.md`, the only subagent, Opus 5.5 high,
  read-only, the skill's new fresh-eyes review) ran on three briefs at 300 cents: all three stopped
  at the cap (critic threads $1.31 to $1.68, 48% of the arm), **none delivered**, median 705 s; the
  frozen judge called all three airable with no defect, preferred them to August A on two and tied
  the third. The **control** (v3, no critic, the fixed CLI) on the live vote: **$0.91**, 265 s,
  delivered, airable, no defect, preferred to August A and to the critic arm. H5's defect is gone,
  by the fix. `lecture-countdown` and `debate-clock` were cut from the critic arm after the first
  capped session, to keep the control inside the ceiling. **$10.08** of $15. The critic is dropped
  by the cost rule fixed before the round; `agent.md` and `critique.md` are back to H5's text and the
  bench is on **agent v5** (v3's definition, hash `c47526c8...`). The bench gained subagent sync,
  per-thread measurement, `--agent-version` and `--adopt`. 17 judge calls, $50.90 notional.
- **H7 must allow for:**
  - **H7 is Sonnet 5.5 on agent v5** (3.8: the configuration that won, no critic, the fixed CLI): the
    same five briefs, `--model claude-sonnet-5-5` on `--build H7 --arms managed-agents,august`, budget
    224 (`agent.md`), `--ceiling-cents 1500`, no `--critic-cents`. Progress is measured against the
    Opus estimate: 5 of 5 accepted, **$1.20 per accepted graphic**, harness 3, tie 1, August 1 (H5's
    four untouched briefs plus the control). H6 counted as progress (the fix), so a third round
    without progress is not yet in play; H7 without progress is the first.
  - The reserve is unchanged (`B` 194, `o` 39, `R` $46.60); `T` **$34.42**. H7 names the winner and
    sets `B` and `o` for it in `agent.md` (re-synced) and the reserve alike.
  - A list brief's verdict covers only the item count its stress gives: the critic found the live
    vote's LEADING chip clipped at five options with a decimal leader, a state no frame shows and the
    judge passed (`instruments.md` entry 12, #1251). Also for H8.
  - Before pair judging, compare each pair's Update op (`instruments.md` entries 9 and 11); on
    `live-vote` August A updates its kicker, the harness its options. Re-shoot both ways.
  - Lecture countdown and debate clock have no H6 sample: H5's are the Opus figures for them.
- **Decisions** (each with its reasons in `phase-6.md`):
  - DECIDED: #1246 fixed before the round, with a no-critic control on the only brief it touches.
    Revert: `git revert` the fix commit (`fc693944f`).
  - DECIDED: 300 cents for a critic session (224 plus the critic's thread). Revert: `--budget-cents 224`.
  - DECIDED: after the first capped session, cut two briefs from the critic arm to keep the control.
    Revert: run them with the same flags within what the ceiling admits.
  - DECIDED: the critic dropped and its skill text reverted; `o` kept at $0.39 though the critic
    wait caused a $0.41 request. Revert: re-apply `c9f1a27f7`, re-sync, `--reserve` with `o` 41.
- **Traps:**
  - Stopping `--build` between sessions can create a session the bench does not track. Stop it while
    a session works and resume with `--adopt <brief>=<session>`.
  - A critic on the same model doubles the cost of a graphic and makes the author wait past the
    five-minute cache, so its next request rewrites the whole context.
  - The H5 August A cells read as two versions in their digest check again (`news-lower-third` and
    `live-vote`); the captured version is the recorded one, as H5 found.
- **Spend:** $10.08 credit; the ledger at $18.98 of $100, $46.60 held for H8, $34.42 for H7 and
  after. $50.90 notional on the subscription.

### H5 check (2026-10-15, on `384f0eff2`)

- **Verdict: PASS.** Checked on `main` `384f0eff2` (H5 merged as `4a089f9bb`, PR #1247); no product
  code changed, no credit spent, no session created. One `claude -p` re-judgement on the
  subscription (below, $1.48 notional, not in the ledger: no phase was passed).
- **Order (AC-6):** `1b6f5db84` (hypothesis, ceiling, signal, the alias rule in code and in
  `tuning/briefs.json`) was on GitHub by 06:05:27Z (its first check run started then); the first
  session's first event is 06:05:35Z. The PR timeline shows the three build commits and no force
  push.
- **Spend:** the ledger sums to 890 cents (H3 266, H5 624); five H5 sessions 99, 133, 88, 115,
  189; `m` = 128.8, `B` = 194, `R` = 20 x 233 = 4,660, `T` = 4,450: two $15 rounds. Median wall
  337 s. From a copy of the raw events: 129 requests, 124 follow-ons, none reading under 99.927%
  of the previous context, the largest $0.3899 (the scoreboard; the token total $6.20 plus running
  time matches the $6.24). All five sessions 404 and their scoped file lists empty on free reads.
- **Verdict figures:** the 15 counted answers and 4 void ones re-tallied: pairs 2 harness, 2
  August, 1 tie (the news lower third, each order preferring the second shown); singles as
  `phase-5.md` says; 24 calls, $79.04 notional. The judge files hash to the lock as committed (LF)
  and the fingerprint is `60bfb08e18a4`. Re-judging `live-vote.managed-agents` alone gave the same
  answer: not airable, high, text over text at the 1,500 ms Update frame. I looked at that frame
  and re-shot it from the delivered zip: the first option's wrapped lines lie on the second row.
- **The alias rule was fixed before counting.** It was committed and pushed before any session
  existed. Without it the harness scoreboard would count `flag` missing (accepted 3 of 5, not 4).
  It is the brief's own word: the brief asks for "a visible 'goal' flag moment for either side",
  the judge independently found no missing action, and `event-goala-01500ms.jpg` shows a GOAL
  HOME flag. Re-run through `missingActions` on all ten cells, the counts are as committed.
- **The stress fix leaves the verdict sound.** The re-keying came after the first live-vote answer
  was seen, but it applies to both arms. I checked every re-keyed value against `noacg inspect`'s
  labels in all four packages, and the long values are the v1 brief's own words. No counted figure
  moved: the harness live vote failed before and after, August A's passed before and after, and
  both debate clocks were airable before and after. Every pair was judged on the corrected frames
  only.
- **New, not verdict-changing: the Update strip drives each package's first text field**
  (`cli/src/coverage.ts`, `textKeys[0]`), so the two arms are updated on different fields. On
  `live-vote` the harness's Update set its options; August A's set only its kicker, so the one
  counted defect sits in a state the reference never entered. Re-shot with the harness's Update
  (`noacg screenshot --event "f2=<long options>" --at 1500ms`), August A's rows grow and nothing
  overlaps, so the live-vote verdict stands. Logged as `instruments.md` entry 9.
- **Code and tests:** `harness-bench.test.mjs` 32 of 32 (the 25-line prompt cap included; the
  prompt is 15 lines); `--control` run directly: CONTROL PASSED at $0; PR #1247 touched no `cli/`,
  `cli/skill/`, `agents/`, `src/` or `api/`; #1244 and #1246 open.
- **For H6:** the carry above stands (the critic, `--critic-cents 22` until measured, margin `o`
  39, decide #1246 in `phase-6.md` before spending). Also read each cell's `coverage.json` Update
  op before judging pairs: if the arms were updated on different kinds of field, re-shoot the
  other arm with the same Update and log it, as here. The same applies to H8.

### H5. Tuning round 1: the August reproduction (built 2026-10-15)

- **Check's findings (H4, on `fc0237bc8`):** AC-5 holds: `--control` run directly passed at $0
  (five cells as scripted, the wall refused before any session, `spentCents` 0; a fresh worktree
  needs `cli/` built first); `B` 224, `o` 22, `R` 4,920, `T` 4,814, 3 rounds at $15, 5 at $9, 503 s
  of 600, three DECIDED lines with reverts; the raw H3 events gave 52 requests, the largest
  $0.2162, a minimum cache-read ratio of 0.99927 and a longest gap of 23.3 s; the wall on a ledger
  copy admits 4,792 and refuses 4,793 for H5, refuses H6 at 6,000 and admits H8, and after 4,700 of
  tuning refuses H7 at 224 and admits 92; `--build H4` and `--build H8` exit 2 before reading a key;
  tests 30 of 30, lint and scope clean. Carried into H5: the control's wall row no longer tests the
  boundary (-$50.86 left with the reserve held) and prints a $0.50 margin where the reserve's is
  $0.22 (the unit tests cover it); run `--control` directly, not through the job queue; re-run
  `--reserve --by H5` with the mean of H3 and H5; report each session's largest request and any
  cache lapse; `agent.md` stays 224 until H7; the contact sheets; map v1 action names to event
  names before counting missing actions; `instruments.md` entries 1 to 4; a judge run stopped
  during a pause re-judges the answered order on its next start.
- **Shas:** previous verified `main` `7b25eb2a8`; built on `claude/plan-noacg-harness-p6-build`;
  the hypothesis, ceiling and signal committed in `1b6f5db84` (06:05:11Z) before the first session
  (06:05:34Z); the merge sha is the one the queue records. **Revert:** `git revert -m 1` the merge
  commit, then restore `benchmarks/harness/ledger.json` from the merge, since spend that happened
  stays recorded and a ledger without it would let `--build H5` pay again. Nothing on the bench workspace to clean up (every
  session and output deleted, the CLI upload deleted).
- **What landed** (`benchmarks/harness/evidence/phase-5.md`): five Opus 5.5 sessions on the five v1
  library briefs, all delivered validator-clean, **$6.24** of the $15 ceiling, median **337 s**,
  none near the 224-cent budget. Against the August A cells, re-captured at $0 by a new `august`
  arm, the frozen judge preferred **the harness 2, August 2, tie 1** (one order flip). The harness:
  **1 basic visual defect** (the live vote: after an Update to long options the first row wraps
  without growing and covers the second), **0 missing actions**, 4 of 5 accepted, **$1.56 per
  accepted graphic**; August A: 2 graphics missing actions, 3 of 5 accepted. Largest request
  **$0.39** (the scoreboard writing its design in one turn into a warm cache), no cache lapse in
  124 follow-on requests. Judging: 24 answered `claude -p` calls, $79.03 notional, no pause.
  `--reserve --by H5`: `m` $1.29 over six Opus graphics, `B` **$1.94**, `o` **$0.39**, `R`
  **$46.60**, `T` **$44.50**: two $15 rounds left. The bench gained the alias and word rule for
  missing actions (`expect.aliases` on `school-scoreboard`), label-keyed stress (`stressFile`,
  `stress.json` per cell), and the reference arm. No `cli/`, `cli/skill/` or `agents/` change.
- **H6 must allow for:**
  - **H6 tests the critic** (3.8: a basic defect was delivered), same five briefs, Opus 5.5, agent
    v3's configuration plus the `multiagent` block of D4, `--critic-cents 22` on `--build` until
    its own largest request is measured, and the margin the reserve now holds (`o` 39). Run the
    reference in the same run directory (`--arms managed-agents,august`) so the pairs judge on one
    capture; the five `august-A` cells cost $0 and a few minutes.
  - **The critic cannot find this round's defect in the frames it gets.** In the container the
    agent's `noacg coverage` has no brief stress, and the CLI lengthens a `Label | value` lines field
    by growing its number column (`52 Yes`), so no frame shows a long option label (issue #1246).
    Either keep the matrix as is and say a critic that misses the live vote measured the matrix, or
    land #1246 first and re-run the no-critic arm too. Decide before spending, in `phase-6.md`.
  - The bench's capture now writes the stress it used beside each cell (`stress.json`): read it for
    any new brief before judging. The other ten tuning briefs still key stress by position.
  - The debate clock judged airable alone but not in either pair order (no active speaker after the
    Take, so Penalty shows nothing): a behaviour a critic could raise, not a counted defect.
  - Progress for the stop rule is measured against $1.56 per accepted graphic and the 2-1-2 verdict.
- **H8 must allow for:** the sealed briefs key stress by position. Before the judge reads, check each
  cell's `stress.json` against its fields, both arms, and re-key or re-capture a wrong one alike
  (`instruments.md` entry 6).
- **Decisions** (each with its reasons in `phase-5.md`):
  - DECIDED: the reference is the August **arm A** cells, the configuration the August verdict kept
    as the skill's default; one reference a brief keeps judging to five pairs. Revert: `--build H5
    --arms august --august-config <B..E>` into the same run directory and judge again ($0 credit).
  - DECIDED: the stress mapping was fixed and the four affected cells re-judged before any pair, both
    arms alike; the first answers are kept and count for nothing. Revert: judge on
    `frames.v1-positional`, which would count a swapped question as the harness's defect.
  - DECIDED: no CLI or validator change in H5 (#1244, #1246), so H6 changes one thing.
- **Traps:**
  - The guard counts `--judge` as browser work: `--reserve` during a judge run needs
    `NOACG_ALLOW_PARALLEL_E2E=1` (it drives no browser).
  - Stopping a judge run leaves its staging directory (`%TEMP%\nj-*`); delete it.
  - The first `validate` of an archived August package regenerates its files, so its digest is not
    the recorded one; the arm validates twice now.
  - `news-lower-third.A` carries a stray `news-lower-third.html`; its zip and folder digests differ.
  - The judge's single and pairwise airability can disagree on one graphic (the debate clock):
    report both, count the single.
- **Spend:** $6.24 credit; the ledger at $8.90 of $100, $46.60 held for H8, $44.50 for H6 and H7.
  $79.03 notional on the subscription.

### H4 check (2026-10-15, on `fc0237bc8`)

- **Verdict: PASS**, on the second check. Checked on `main` `fc0237bc8`, the merge of PR #1235;
  no product code changed, nothing spent, no session, no `--reserve`, no `claude -p` call.
- **The first check (01:18Z to 01:38Z, same sha) was FAIL blocked:** it queued `--control`
  through the job queue, whose 4.0 GB RAM floor held it at 3.2 GB free, and cancelled it. Run
  directly in the shell (`NOACG_URL=https://noacg.studio node scripts/harness-bench.mjs
  --control`, default out dir) it passed: CONTROL PASSED at $0.00, five cells delivered or
  not-ready as scripted, cleanup gone, the wall refused before any session. On this machine, run
  the dry run directly, as the H1 to H3 checks did. A fresh worktree also needs `npm ci` and
  `npm ci && npm run build` in `cli/` first, or the bench exits 2 on a missing `cli/dist`.
- **AC-5 and 5.2, recomputed from the ledger:** six H3 sessions sum to 266 cents; `m` = 149
  (one Opus graphic), `B` = ceil(223.5) = 224, `o` = 22 (the raw H3 events give 52 requests, the
  largest $0.2162, no cache read under 99.9% of the previous context, longest gap 23.3 s),
  `R` = 20 x 246 = 4,920, `T` = 10,000 - 266 - 4,920 = 4,814: 3 rounds at $15, 5 at $9.
  `reservation()` and the committed `reserve` agree; `agent.md` reads 224. Time: 471 s plus the
  slowest `bridgeReady` of H3's cells, 32.1 s, is 503 s against 600 s. `phase-4.md` holds the
  three DECIDED lines (`o`, the $15 and 5-brief round, the 224 default) with their reverts.
- **The wall, on a ledger copy:** an H5 session of 4,792 cents (`T - o`) is admitted and 4,793
  refused "past the $49.20 held for H8's exam"; H6 at 6,000 refused, H8 at 6,000 admitted; after
  a simulated 4,700 of tuning, H7 at 224 is refused, H7 at 92 and H8 at 224 admitted. The
  committed ledger was unchanged. `--build H4` ("spends nothing (5.1)") and `--build H8` ("H5,
  H6, H7 not closed") exit 2, refused after reading only the ledger, before any key.
- **Code and tests:** `harness-bench.test.mjs` 30 of 30; eslint clean on the four changed
  scripts; PR #1235 touched no `src/`, `cli/`, `api/` or migration.
- **For H5 (minor):** the control's wall row still reads "$1 left, a $3 session", but with the
  reserve held its synthetic ledger now has -$50.86 left, so it no longer tests the boundary (the
  copy test above and the unit tests do). It also prints a $0.50 margin from the control's own
  entry while the reserve's is $0.22. Neither changes a verdict.

### H4. The exam reservation (built 2026-10-15)

- **Check's findings (H3, on `55369d924`):** AC-4 holds: the hypothesis committed 22:44Z before the
  first session at 22:50Z; Opus list costs reproduced from trace usage ($1.0852 against 109 cents,
  $1.4943 against 149); the real graphic 36 requests, 40 tool calls, 11 images, 471 s; the largest
  request $0.2162 and the largest context 149,012 tokens, which supports the $0.76 lapsed-cache
  bound; proof 1's traces show the tarball install and the `certutil` loop, the bridge reached in
  18.2 to 32.1 s; proof 2's planted `scaleY(-1)` passes the validator clean, the image read
  precedes the edit, and the delivered digest equals the last validate or coverage; proof 4
  re-fetched by the checker: six sessions 404, file lists 200 with 0 files (accepted on intent);
  the ledger's six entries sum to 266 of 1,000 cents, the run $2.66 of $100, H0 to H3 completed;
  re-capture digests match; `--control` passes; agent-sync keep x3; cli 276 pass, bench 27 of 27,
  gates clean. Carried for H4: every 5.2 number present (`m` $1.49 from one sample, `B` $2.24, `o`
  $0.22 measured, $0.50 default, $0.76 lapsed-cache bound, spent $2.66, 471 s plus cold start
  under 600 s); `o` decides 3 or 2 rounds at $15 (`T` about $48, $43 or $37) and H4 must say which;
  the critic's share is unknown until H6; the graphic agent read the 69 coverage frames as six
  contact sheets (open for H5); H3's merge sha is the one the queue recorded, `55369d924`. Not
  checked: Console usage against $2.66 (the owner's glance, asked in PR #1234).
- **Shas:** previous verified `main` `55369d924`; built on `claude/plan-noacg-harness-p5-build`;
  the merge sha is the one the queue records. **Revert:** `git revert -m 1` the merge commit, then
  `node scripts/harness-agent-sync.mjs --workspace bench --apply`, which makes a v4 equal to v2
  (metadata only differs). The ledger then has no reserve and `--build` refuses tuning again.
- **What landed** (`benchmarks/harness/evidence/phase-4.md`): at $0, `B` = round-up(1.5 x $1.49) =
  **$2.24**, `o` = **$0.22**, `R` = 20 x ($2.24 + $0.22) = **$49.20**, `T` = $100 - $2.66 - $49.20 =
  **$48.14**: **3 rounds at $15** (5 at $9). Time 471 s + 32 s cold start = 503 s, under 600 s.
  The run continues. The ledger carries `reserve` (H8, 4,920 cents, its own arithmetic checked on
  every read) and H4 `completed` with no session; the wall leaves the reserve out of `remaining`
  for every phase but H8's; `--build` refuses the $0 phases (H4: "spends nothing (5.1)"), any
  tuning without a reserve, and H8 until H5 to H7 are closed, defaults `--budget-cents` to
  `agent.md` and the margin to the reserve's `o` and critic share (`--critic-cents` names another);
  `--reserve` does 5.2's arithmetic with every term named and records it. `agent.md` carries
  `metadata.session_budget_cents: "224"`; synced to agent v3 on the bench key (free; v2 and v3 read
  back identical but for metadata). Tests 30 of 30.
- **Decisions** (each with its reasons in `evidence/phase-4.md`):
  - DECIDED: `o` = $0.22, the largest of H3's 52 Opus requests, for the reserve and the wall. No
    cache lapse in 50 follow-on requests (longest gap 23 s of the 300 s lifetime); a request at
    the largest context cost $0.04 to $0.11. A too-small `o` costs money only if most exam sessions
    reach their budget, an exam that has failed 4.5 anyway, at most $10.80 and covered first by
    unspent tuning money; $0.50 or $0.76 would cost the third $15 round for certain, the round that
    measures Sonnet after a critic round. Revert: `--reserve --by <H#> --overshoot-cents 50`.
  - DECIDED: the round ceiling is $15 with 5 briefs for each of H5, H6 and H7 (worst case 5 x
    $2.46 = $12.30 a round). Revert: run the rounds at $9 with 3 briefs.
  - DECIDED: the session budget default is 224 cents, in `agent.md`'s metadata (never shown to the
    model; the system prompt still names no amount, which stays tuning's to measure). Revert: drop
    the key and re-sync.
- **H5 must allow for:**
  - `m` was one sample. When H5 closes, `m` is the mean of H3's and H5's Opus graphic sessions (a
    session that reached its budget counts at its list cost and is named as a floor), and
    `--reserve --by H5 --budget-cents <round-up(1.5 m)> --overshoot-cents <o>` records the exam's
    forecast before H6 spends. `agent.md`'s 224 stays until H7, so H5 and H6 compare at one budget.
    Two $15 rounds survive an Opus mean up to $1.79; then one $15 and one $9 up to $1.96, two $9 up
    to $2.14; past about $2.39 the run stops with `needs: decision`.
  - Report each session's largest request and any request whose cache read falls short of the
    previous context: a request over $0.22 or a lapse raises `o` in the same `--reserve`.
  - Run with `--ceiling-cents 1500` and five briefs; `--budget-cents` may be left out (224 from
    `agent.md`), and the margin is the reserve's. The agent is v3: same prompt, model and skill as
    H3's v2. The committed-ledger test pins H4's numbers only while H4's reserve stands.
  - Carried from H3, not acted on here: the real graphic's agent read the 69 coverage frames as six
    Pillow contact sheets; measure whether that misses what the single frames show. The `flag`
    alias gap on `school-scoreboard`; `packages` once the CLI release is out.
- **H6 and H7 must allow for:** critic sessions run with `--critic-cents 22` on `--build` (a margin
  for the second thread before its own is measured). If the critic stays, re-measure `m` with both
  threads and run `--reserve --by H6 --budget-cents <B> --overshoot-cents <o> --critic-cents <the
  critic's largest request>`; a second thread adds time too, so re-check 503 s against 600 s. H7
  sets `B` and `o` for the winner in `agent.md` (re-synced) and the reserve alike. `--build H8` is
  refused until H5 to H7 are closed; H8 runs with `--ceiling-cents` equal to the reserve and first
  confirms `agent.md`'s budget is the reserve's `B`.
- **Left as they are, from the review:** the round ceiling is the builder's `--ceiling-cents`, as
  in H3, not a stored limit; the "no round fits" stop is printed by `--reserve` and applied by the
  plan, not by `--build`. Either way the wall keeps tuning out of the reserve, so a mistake there
  spends `T`, never the exam.
- **Traps:**
  - `phase-3.md` says the $0.22 request wrote "new frames" to the cache; it was the planted
    package's printed sources (a 79k-character script with its HTML and CSS). A large file read is
    what makes a request large, as much as a batch of images.
  - The 471 s wall is the bench's (create to downloads and cleanup); the session went idle at
    408.6 s. The exam's median is read from the same bench figure, so it is the cautious one.
  - The raw events behind `o` live only in `%TEMP%\noacg-harness\H3-*` on this machine; the
    committed traces keep only the largest request.
- **Spend:** $0; the ledger stays at $2.66 of $100, $49.20 held for H8, $48.14 for everything else.

### H3. Feasibility (built 2026-10-14)

- **Check's findings (H2 repair, on `f430c0b97`):** AC-3 holds: lock hashes match (LF-normalised),
  frozen files byte-identical since `f85a356d5`, the committed `results-heldout.jsonl` rescores to
  `score-heldout.json` (agreement 38/41, 0 basic-defect FAIL airable, pairwise 16/16, 0 flips,
  PASS), 11 re-run pairs stamped after the reset, the leaky run not mixed in, six labels
  spot-checked against the archives; ledger $0 credit, 529 calls, $164.21 notional, H0 to H2
  completed; tests 24/24, lint clean; `--judge` on an empty run dir passes the sign-in check and
  names the judge, a changed prompt is refused. Carried: a run stopped during a pause still
  re-judges the answered order on its next start (only `judgePair`'s resume is tested); `nj-`
  blinding rests on code and test, records keep no working dir; `instruments.md` entries 1 to 4
  open for H5; the judge figure rests on 16 pairs of stills (lower bound 80.6%). From H1 and H2
  for H3: the Chromium download host, the Haiku re-sync, the arm passing `files`, the reused
  `--control --out` collision, the unsynced agent; all handled below.
- **Shas:** previous verified `main` `f430c0b97`; built on `claude/plan-noacg-harness-p4-build`;
  the hypothesis, ceiling and signal were committed in `93531e92d` before the first session; the
  merge sha is the one the queue records. **Revert:** `git revert -m 1` the merge commit. The bench
  workspace keeps the agent, environment and skill (free, and the lock names them); no session,
  output file, upload or extra environment is left (`evidence/phase-3/cleanup-check.txt`).
- **What landed** (`benchmarks/harness/evidence/phase-3.md`): all four proofs of section 6 hold
  in six sessions for **$2.66** of the $10 ceiling. The container needs one plumbing line: its
  egress gateway inspects TLS, and Chromium trusts the gateway only after its certificates are
  added to the NSS store (`certutil` is preinstalled). Then the tarball install, `doctor` (Google
  Chrome, already in the sandbox), scaffold, `validate --screenshots`, `record` and `coverage` all
  work, and the bench downloads every output. The defect repair (an upside-down name the validator
  passes clean) read two images, removed the defect, re-inspected and handed in one version
  ($1.09). One real graphic on `school-scoreboard`: **$1.49, 471 s, 36 model requests, 40 tool
  calls, 11 images, largest request $0.22 across H3 (`o`; $0.14 in that session)**. Cold start to
  a reachable bridge 27 to 32 s with the tarball, 18 to 27 s with the CLI in `packages`. Fixed on
  the way: the CLI digest counted a zip's `thumbnail.png`, so a handed-in zip read as another
  version than its folder (test added); `packCli` threw on every real run; the arm tried to
  download the session's copies of mounted files. Added: a per-session model override
  (`agent_with_overrides`), so Haiku ran without an agent version; a phase ceiling in the ledger's
  wall, which `--build` now requires (`--ceiling-cents`); `--proof`, `--effort`; a resumed run
  tells cells apart by model too; `lib/trace.mjs`, whose Opus 5.5 prices reproduce both Opus
  sessions' `usage.list_cost` to the cent (its Haiku row is fitted, not checked). H3 is closed in
  the ledger.
- **H4 must allow for:**
  - `m` is **one sample**, $1.49 (the defect repair, a smaller job, $1.09). `B = round-up(1.5 m)`
    gives $2.24. `o` measured $0.22; a 5-minute cache that lapsed mid-session would make the next
    request at the largest context seen (149k tokens) about $0.76, so the 5.2 default of $0.50 sits
    between the two: say which one `R` uses.
  - Time: 471 s of session wall for the real graphic plus about 30 s of cold start inside it, under
    the ten-minute median of 4.5; the bench's own capture adds about 35 s outside the session.
  - The ledger now holds H3's six sessions and its completed entry; `--ceiling-cents` is the way to
    hold a round to its ceiling.
- **H5 must allow for:**
  - The real graphic's agent read the 69 coverage frames as six Pillow contact sheets of twelve, not
    one by one, though the system prompt says "Read every frame". 3.2 says a contact sheet is
    illegible: measure whether it misses what the single frames show before trusting a delivery.
  - `MISSING flag` on `school-scoreboard` is the alias gap of H1's notes, again: map it before H5
    counts missing actions.
  - `packages` can carry the CLI only by a published name; put it in `environment.yaml` when the
    release with `coverage` and `record` is out (saves about 10 s a session).
  - A model's thinking is not in the trace (Opus 5.5 omits it), so "named from the image" rests on
    the order of the trace and the agent's own words; the planted line was also in CSS the agent had
    printed.
- **Decisions** (each revertible in the file named):
  - *Haiku ran as a per-session model override*, not a re-synced agent (D6's revert path): the
    agent stays Opus 5.5, and an override never leaves a version behind. Revert: drop `model` from
    `StartRequest` in `api/_lib/harness/client.ts`.
  - *The planted defect is one the validator cannot see* (an upside-down name, `feasibility.mjs`):
    an overlap or a clip, 6's examples, is a validator ERROR here, so the agent could fix it from the
    text alone. Revert: plant an overlap.
  - *No browser download host is allowed*: the sandbox has Chrome and Playwright's Chromium, and the
    Playwright CDN does not even resolve. *`packages` stays out of `environment.yaml`* until the CLI
    release (see H5).
  - *The trust store is set up by the system prompt*, as plumbing: an environment cannot run a setup
    script. Revert: if a later sandbox trusts the gateway in Chromium, drop the line.
- **Traps:**
  - Without the trust line `noacg doctor` reports "No NoaCG bridge ... ERR_CERT_AUTHORITY_INVALID":
    the bridge is up, the browser distrusts the gateway. `curl` succeeds, which misleads.
  - Output files lose their folders in the Files API list (`coverage/x.jpg` lists as `x.jpg`).
  - A cell that ran is never paid twice: a re-run of a proof needs a new proof id (`h3-plumbing-2`).
  - The packages proofs make their environment per run: `h3-packages-warm` measures a cached start
    only in the same invocation as, and after, `h3-packages-cold`.
  - The zip read (`src/model/importTemplate.ts`) still imports a package's `thumbnail.png` as an
    asset; only the digest ignores it now. A zip saved as is carries the frame twice (the asset and
    the manifest thumbnail); outside this phase's files, reported in the pull request.
  - Shell heredocs through this machine's Bash tool can turn `\n` inside quoted code into real
    newlines; edit JavaScript with the editor, not with an inline script.

### H2 second check (2026-10-15, on `f430c0b97`)

- **Verdict: PASS.** Checked on `main` `f430c0b97`, the merge of the H2 repair (PR #1231); no
  product code changed, nothing spent, no `claude -p` judgement run.
- **AC-3 and 4.3:** the lock's hashes recompute on the LF-normalised files (prompt `3060b854`,
  rubric `82311f0d`; a Windows checkout's CRLF bytes hash differently, which the lock's own hashing
  allows for). `git diff f85a356d5 f430c0b97 -- benchmarks/harness/judge/` shows only
  `calibration.mjs`, `results-heldout.jsonl` and `score-heldout.json`; prompt, rubric, lock, split,
  set and `plant.mjs` are byte-identical. A copy of the committed results, scored outside the
  repository, gives the committed `score-heldout.json` exactly (line endings aside): agreement 38 of
  41 (Wilson 80.6% to 97.5%), no basic-defect FAIL aired, pairwise 16 of 16 (80.6% to 100%), 0
  flips, 0 unanswered, PASS. The file is the temp work file, line endings aside, and holds one judge
  fingerprint (`60bfb08e18a4`): 41 single, 16 pair answers, 11 error records that the scorer
  supersedes. Every pair answer has two orders, each served by `claude-fable-5-1` only; the 11
  re-judged pairs are stamped 21:48 to 21:51Z, after the 21:20Z reset. The leaky run's
  results (`results-heldout.leaky-cwd.jsonl`, 20:23Z) are not in the committed file, and the
  blinded run started at 20:35Z. The records keep no working directory, so `nj-` rests on the
  code at `f85a356d5` and its test; the kept per-order prompts name only `A-1.png` and the like.
  The labels spot-checked against the archived notes agree (`rr:X-07` OK*, `rr:X-13` AIR,
  `ts:X-10` TWEAKS, `ts:X-11` FAIL with the accent over the text, `ts:X-19` FAIL empty, `ff:X-55`
  not okay for a stroke almost over the logo).
- **Ledger:** $0 credit (`spentCents` 0); `phaseCompleted` is true for H0, H1 and H2 and false for
  H3. The call counts add up: 59 + 161 + 161 + 73 + 2 probes + 51 blinded = 507, then 22 = 529; the
  notional $155.43 + $8.78 = $164.21, and the runs log gives $8.78 for the repair run.
- **Code and tests:** `harness-bench.test.mjs` 24 of 24; eslint clean on the four changed scripts.
  The `scripts/harness-bench.mjs` edit is the pass-back only. PR #1231 touched no `src/`, `cli/`,
  `api/` or migration.
- **Try-out (H5's builder):** `--judge` on an empty run directory signed in on the subscription and
  judged nothing ("Judged with claude-fable-5-1 (60bfb08e18a4)"). With one line added to
  `prompt.md` it refused before any call ("prompt.md changed after it was frozen (lock 3060b854176a,
  now 12be17878efa)"); restored after. The resume is pinned on `judgePair`; the runners' wiring was
  read, not run.
- **Minor, for H5:** the repair entry below names its merge as "the one the queue records": it is
  `f430c0b97`. A run stopped during a pause still re-judges an answered order on its next start, as
  that entry says.

### H2 repair. The blind pairs (2026-10-15)

- **Check's findings (H2, on `f85a356d5`):** fail on product: AC-3's blind pairwise figure did not
  exist. The blinded held-back run judged 5 of 16 pairs; the other 11 were saved as errors because
  that run's runner missed the "session limit" wording, so the 15 of 16 came only from the run that
  leaked the good item's name through the working directory (`pair~<good>~<bad>`). Everything else
  held: lock hashes recomputed (prompt `3060b854`, rubric `82311f0d`, `claude-fable-5-1` at
  `high`), the tamper refusal in both runners, the split (`c5cc0367e`) before the prompt before the
  lock (`851f23255`) before the first held-back record, 25 of 81 groups stratified on seed
  20261014, the set as 4.3 names it (46 good, 29 + 30 + 5 bad, 22 planted), the working directory
  blinded (`nj-XXXXXX`, only the G, A and B files), the 5.4 environment on `oauth_token`, $0
  credit, tests 24 of 24, lint and gates clean, no product code. Minor: the ledger said 454 calls
  against the evidence's about 520; the ledger marked H2 completed with the pairs unfinished; the
  phase notes did not name the merge sha; `instruments.md` entries 1 to 4 open and deferred to H5
  without the corpus check; `judgePair` re-ran a finished first order when the second paused.
- **Shas:** previous verified `main` `f85a356d5` (H2's merge); built on
  `claude/plan-noacg-harness-p3-repair`; the merge sha is the one the queue records. **Revert:**
  `git revert -m 1` the merge commit; that removes the committed answers and the figure, and the
  judge stays as H2 froze it.
- **What landed:** the detection was confirmed first: `usageLimit` on the recorded text ("You've
  hit your session limit · resets 12:20am (Europe/Kyiv)") returns the reset, 21:20 UTC; the 11
  errors predate PR #1230's fix, so no detection change was needed. `calibration.mjs run --part
  heldout --task pairwise` then judged exactly the 11 errored pairs, both orders each, all by
  `claude-fable-5-1`, in `nj-` directories, with no pause. `score --part heldout`: **pairwise 16 of
  16 (100%, Wilson 80.6% to 100%), 0 flips, 0 wrong; agreement 38 of 41; no basic-defect FAIL
  aired; PASS.** The leaky run's one flip (`rr:X-07` against `ts:X-10`) held blind. The answers
  (`benchmarks/harness/judge/results-heldout.jsonl`, every record, the refused attempts included)
  and the score (`score-heldout.json`) are committed, so the evidence no longer lives only in
  `%TEMP%`. `judgePair` now returns the answered orders on a pause or error as `answered`, and
  both runners pass them back when they retry after a pause within one run (a test pins
  `judgePair`'s resume; the runners' wiring is untested); a pause no longer uses up the
  calibration runner's one error retry. A run stopped during a pause still re-judges the answered
  order on its next start. Spend: $8.78 notional, 22 calls, $0 credit; H2 in all 529 answered
  calls and at least 24 refused at $0, $164.21 notional. The ledger's first H2 entry is
  corrected to `paused` with the true count (it counted 59 + 161 + 161 + 73 and left out the probes
  and the blinded re-run), and a second H2 entry is `completed`.
- **H3 must allow for:** nothing of the judge. **H5 must allow for:** the H2 list below stands; the
  judge's blind pairwise figure rests on 16 stills pairs (lower bound 80.6%), not on coverage
  matrices, so H5's first judged round is also the judge's first read of a full matrix.
  `instruments.md` entries 1 to 4 stay open for H5 with their corpus check.
- **Decisions:** the prompt, rubric, lock and split were not touched; the repair measured the
  frozen judge and tuned nothing. The committed results file keeps the 11 error records rather
  than a cleaned copy, so it is exactly what the scorer read.
- **Traps:** a fresh worktree has no `node_modules`; `harness-bench.test.mjs` fails to load
  (`@anthropic-ai/sdk` missing in `api/_lib/harness`) until `npm ci`.

### H2. The judge (built 2026-10-14)

- **Check's findings (H1, on `e349156e6`):** AC-1 holds: `--control` CONTROL PASSED at $0 (both
  arms deliver school-scoreboard 57 frames and debate-clock 27, `budget_reached` hands in not-ready,
  cleanup 404, a $1 ledger refuses a $3 session); the stub matches the Managed Agents docs and SDK
  0.133.0 (cents as strings, event order, the `/mnt/session/uploads` mount, `scope_id` outputs); the
  gallery is blind (235 images, the 3.2 states and crops present); `harness-bench.test` 20 of 20
  with the passphrase, 19 and 1 skip without; the system prompt 14 lines, `build-skill --check` OK,
  coverage and record derive from inspect and stress; cli 276 pass; API tests 394 of 394; the 5.4
  child environment holds no key-like name, reports `oauth_token`, refuses with the token blanked;
  `agent-sync --workspace bench` shows create x3 and applies nothing. Carried: a reused `--control
  --out` directory fails ("graphic is not empty": the runner clears `cells/`, not `stub-sessions/`,
  and stub ids restart at 000001), so use the default timestamped directory; H1's "bridge flakes"
  trap is probably that collision, not the bridge; H1's merge sha is `e349156e6`; the published
  `@noacg/cli` 0.11.0 lacks `coverage` and `record`, so the next release needs a version bump; H3's
  gaps were already recorded (the Chromium download host, the Haiku re-sync, the arm passing
  files); the MISSING actions on v1 briefs are the alias gap, to map before H5.
- **Shas:** previous verified `main` `e349156e6`; built on `claude/plan-noacg-harness-p3-build`; the
  split was committed in `c5cc0367e` before any prompt existed and the lock in `851f23255` before the
  held-back part was read; the merge sha is `f85a356d5` (PR #1230). **Revert:** `git revert -m 1`
  the merge commit; no Anthropic resource exists, nothing to clean up.
- **What landed** (`benchmarks/harness/evidence/phase-2.md`): the judge in `benchmarks/harness/judge/`
  (`prompt.md`, `rubric.json`, `judge.lock.json`, `calibration.mjs`, `plant.mjs`,
  `calibration-set.json`, `split.json`); `benchmarks/harness/lib/judge.mjs` filled in (single and
  pairwise, both orders, the model check, `coverageFrames`); `harness-bench.mjs --judge <runDir>`,
  which refuses a judge whose hash differs; `runClaudeAsync` and `pauseMs` in `subscription.mjs`;
  five tests; `evidence/instruments.md` (3.5 fired). Held-back 30%: agreement 38 of 41 (92.7%) and
  no basic-defect FAIL called airable, in both runs; pairwise 15 of 16 (93.8%, one flip) in the
  first run, which leaked the item's name through the judge's working directory (fixed). The
  blinded re-run judged 5 of 16 pairs (5 correct) before the subscription's session limit; the H2
  repair above finished the other 11 (blind pairwise 16 of 16). Spend: $0 credit, $155.43 notional
  on the subscription, two `paused` session entries in the ledger. The `judgePair` re-run of a finished first
  order on a pause is fixed in the repair.
- **H3 must allow for:** nothing of the judge; H3 measures the container. The ledger now holds H0 to
  H2 as completed.
- **H5 must allow for:**
  - Judge a round with `node scripts/harness-bench.mjs --judge <runDir> --phase H5`. It reads every
    cell's `frames/coverage.json` (frames and crops, captioned) and its operator surface from
    `cell.json`, judges each cell alone and every two arms on one brief in both orders, writes
    `judgements.jsonl` in the run directory and resumes past what it already holds. A usage-limit
    pause is written to the ledger and waited out.
  - The calibration judged 2 to 5 stills a graphic at a median 22 s and about $0.25 to $0.40 a
    judgement; a coverage matrix is 30 to 60 images a graphic, so a pair is several times that.
    Pace it across usage windows.
  - The judge's `missingActions` is uncalibrated (the owner judged frames, not surfaces): keep the
    mechanical gate of 3.6, with the alias list, as the count of missing actions.
  - Read `evidence/instruments.md` first: a count-up captured before it settles reads as broken
    (check the coverage's 10 s Take frame), and `bench-field-unpainted` fires on computed fields
    the owner aired.
- **Decisions** (each revertible by repeating H2, which needs a new held-back set):
  - *The judge is `claude-fable-5-1` at effort `high`*: the subscription serves Fable 5.1 and Opus 5.5
    through `claude -p --model`, and D6 ranks Fable above Opus. Revert: re-pin on Opus.
  - *The prompt is the system prompt* (`--system-prompt`), not a user message under Claude Code's
    coding persona; Read is the only tool and the frames sit alone in the judgement's directory.
  - *Labels:* good and bad as 4.3 names them; TWEAKS is bad; a bad item carries a basic mistake only
    where the owner's note names one. The owner judged pictures without operator surfaces, so the
    calibration passes none.
  - *The split holds back briefs, not items*, so a pair and its two graphics are on one side.
  - *Planted defects* are a script appended to the graphic's own `template.js` (the most prominent
    text: font size times width), one per August library cell, round-robin over the three kinds, each
    checked by a pixel measurement against its original.
  - *Three drafts, then frozen*: v1 to v3 on the development part only (76%, then 91.2%, then 92.3%);
    the remaining misses were design calls the prompt could not name without fitting to them.
  - *The held-back part is read once*: the runner refuses an unfrozen judge there, and a second judge
    on a part another judge already read.
- **Traps:**
  - `claude -p` children must not run through `spawnSync` when several should run at once: it blocks
    the event loop, and "four at a time" ran one at a time. The judge uses `runClaudeAsync`.
  - The CLI's own stress frame doubles every value (each set twice over), unlike the archived
    rounds' brief stress values; the captions say so.
  - Probing `--model fable` with `--tools ""` listed `claude-opus-4-8` beside Fable in
    `modelUsage`; judgement runs list only the pinned id, and the runner rejects an answer that
    lacks it.

### H1. The bench and the dry run (built 2026-10-14)

- **Check's findings (H0, on `78a429895`):** AC-2 holds: the sealed file (noacg-sealed-v1,
  aes-256-gcm/scrypt) decrypts to `briefs.sha256`, a wrong passphrase is refused, the plaintext
  equals the private copy byte for byte; 20 exam briefs, 18 types and 2 typeless, every 4.1 stress
  case over its minimum, ids unique across 36; a leak scan of 144 needles over 6,632 files and
  `git log -p` since 10-13 found 0 hits (one generic stress value coincides with
  `src/templates/audience` files from July and August); child session `cd7d9f1d`, 2 messages,
  0 tools, its prompt exactly the 4.1 inputs; the 5.4 environment rebuilt, `oauth_token`; $0
  credit, $1.47 notional on the subscription; PR #1215 touched 5 files and no `src/` or `cli/`;
  a checker wrote the AC-2 test from the evidence alone and it passed. Carried into H1: the
  evidence gave `docs.html`'s hash of the CRLF working-tree file, not the LF git blob
  (`746d7b36...`): `evidence/phase-0.md` now says so. The two-sided count is 6 in the evidence and
  7 by the checker's heuristic (3 required): either way over the minimum, left as it is. Child
  isolation needs `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`
  (HOME alone does not isolate on Windows): `benchmarks/harness/lib/subscription.mjs` sets both.
  The AC-2 test checks the hash only where the private passphrase is present; CI checks the
  format and the wrong-passphrase refusal.
- **Shas:** previous verified `main` `78a429895`; built on `claude/plan-noacg-harness-p2-build`;
  merged as `e349156e6`. **Revert:** `git revert -m 1` the merge commit; no
  Anthropic resource exists to clean up (nothing was synced).
- **What landed** (`benchmarks/harness/evidence/phase-1.md`): `noacg coverage`, `noacg record`
  and the digest in `validate --json`, with offline tests (`cli/test/coverage.test.mjs`); the
  Skills API target of `build-skill.mjs`; `api/_lib/harness/client.ts`, its stub and its test
  (no route); `benchmarks/harness/lib/` (ledger, arms, pipeline, gallery, judge skeleton,
  subscription, sealed); `scripts/harness-bench.mjs` and its build-gate test (AC-1, AC-2, AC-16's
  cap); `agents/noacg-harness/` and `scripts/harness-agent-sync.mjs`; `bench-env.mjs
  --profile=harness`; `@anthropic-ai/sdk` 0.133.0. `--control` passed at $0 against the
  production bridge. Spend: $0 credit, no subscription child. The ledger holds H0 and H1 as
  completed.
- **H2 must allow for:**
  - The judge's files go in `benchmarks/harness/judge/` as `prompt.md` and `rubric.json` (its
    `schema` is passed to `claude -p --json-schema`); freeze with `lockFor(dir, model)` from
    `benchmarks/harness/lib/judge.mjs` into `judge.lock.json`. `loadJudge` refuses a changed file;
    `judgeInvocation` builds the call (Read only, `--strict-mcp-config`). Calibration children use
    `subscriptionEnv` and `checkSubscriptionAuth` from `subscription.mjs`, not a new runner.
  - The archived calibration frames are stills; the coverage frames the exam judges are
    `coverage.json`'s `frames` (each with `render`, `state`, `values`, `ground`, `atMs`) and `crops`.
- **H3 must allow for:**
  - Nothing is synced yet: `node scripts/bench-env.mjs --profile=harness`, then `node
    scripts/harness-agent-sync.mjs --workspace bench --apply` (it prints `create` for the
    environment, the skill and the agent) writes `agents/noacg-harness/claude-lock.bench.json`;
    commit it. `environment.yaml` allows only `noacg.studio` beside the package managers; the
    Chromium download host is what H3 measures and adds, then re-syncs.
  - `scripts/harness-bench.mjs --build H3 --arms managed-agents --briefs <tuning id> --model
    <id> --budget-cents <n>` packs the CLI (`npm pack` in `cli/`), uploads it, mounts it at
    `/noacg-cli.tgz` (the system prompt installs it from `/mnt/session/uploads/noacg-cli.tgz`),
    runs, collects, disposes and checks not-found. The model is the agent's, so a Haiku proof
    needs the agent's model changed and re-synced (a new agent version), or an
    `agent_with_overrides` path the client does not have yet. Proof 2's planted defect needs a
    session that starts from a mounted package: the client takes `files`, the arm does not yet
    pass one; add it there, small.
  - The run's `--out` must be outside the repository (the runner refuses otherwise).
- **Decisions** (each revertible in the file named):
  - *The definitions are YAML in its JSON form* (`agent.md` frontmatter, `environment.yaml`):
    `ant apply` reads them as they are and the repository needs no YAML parser. Revert: rewrite as
    block YAML and add a parser to the sync.
  - *No multiagent block on the agent*: 3.8 puts the critic off until H5's evidence picks it; the
    SDK has the `multiagent_20261001` shape D4 names, for H6.
  - *One record file, overwritten*: the agent records to `/mnt/session/outputs/record.json` after
    every clean validate; the last one is the hand-in, and the session's stop reason says whether
    it is delivered or not ready. No separate interim file id.
  - *The coverage hand-in lives in the system prompt*, not the skill, until the verbs are
    published: the published skill must not name a verb its pinned CLI lacks. When the CLI release
    carries `coverage` and `record` (H9 at the latest), move the "run coverage, look at every
    frame" step into `cli/skill/` and drop it from the prompt.
  - *An event that does not move the machine from the settled Take is pressed again after each
    event that does*, and is a finding only if it moves it from none: `clearFlag` from a board
    with no flag moved nothing, which is correct, and was a false finding before (3.5).
  - *Image fields' `bright:` and `dark:` stress values become test crests* (SVG data URLs in
    `coverage.ts`), and `busy:` backgrounds the busy plate; `logo` on a type without an image
    field is noted, not drawn.
  - *Runs write outside the repository* (`--control` by default, `--build` always); the gallery
    copies frames under opaque ids so no image path names an arm.
- **Traps:**
  - The v1 briefs' `expect.actions` are not always the registry's event names: `school-scoreboard`
    expects `flag`, the scoreboard type's events are `goalA`, `goalB`, `clearFlag`, `final`. The
    mechanical gate (3.6, `missingActions`, case-insensitive name match) reports it missing on a
    correct graphic. Before H5 counts missing actions, map these (an alias list per brief, or the
    judge reading the operator surface), and expect an authored package to name events its own way.
  - A remote bridge flakes now and then: one of five dry runs lost a stub session's fake agent
    with the cause swallowed (the runner prints it now). A paid run must read a failed cell's
    reason before counting it against the model.
  - The bench-process guard (`scripts/hooks/guard-command.mjs`) counts any `harness-bench`
    command as browser work: `--close` and the ledger print wait for a running control.
  - Editing this file changes the spec's sha256 again (H0's trap): left as it is.

### H0. The sealed briefs (built 2026-10-14)

- **Check's findings:** none; this is the plan's first phase (the run opened 2026-10-14 on
  `origin/main` `afca974f1`).
- **Shas:** previous verified `main` `e4d7b0841`; built on `claude/plan-noacg-harness-p1-build`;
  the merge sha is the one the queue records. **Revert:** `git revert -m 1` the merge commit; the
  private folder can stay, it is gitignored.
- **What landed** (`benchmarks/harness/evidence/phase-0.md`): `exam/briefs.sealed` and
  `exam/briefs.sha256` (20 briefs, 18 registered types and 2 typeless), `tuning/briefs.json` (the
  6 v1 briefs verbatim, then 10 new), the evidence. Private, in the main checkout's
  `docs/private/harness-exam/`: `briefs.json` (plaintext), `passphrase.txt`, `seal.mjs`, and
  `child/` with the prompt, the runner, the coverage script, both raw answers and the transcript.
  Child session `cd7d9f1d-94ad-47ad-8b3d-ea3835646bfa`. Spend: $0 credit; about $1.47 notional
  on the subscription. There is no ledger yet; H1 creates it and records H0 as $0.
- **Decisions** (each revertible by re-running the child, which needs a new seal):
  - *The brief writer had no tools* (`--tools ""`) and its three inputs inline, so "exactly the
    permitted inputs" is the prompt file itself. Model Opus 5.5.
  - *The product docs* are `docs.html` (the noacg.studio/docs page) as text; *the type registry*
    is `noacg types --json` from production, without designs.
  - *Stress keys for pictures:* an image field's value describes the test picture, a logo
    starting `bright:` or `dark:`; `logo` holds a logo for a type with no image field;
    `background` starting `busy:` is the picture behind the graphic. 4.1 names these cases; v1
    had no key for them.
  - *Minimum counts* for the exam's stress cases (long 4, two-sided 3, bright and dark logo 2
    each, busy 3, actions 8); the child exceeded every one. 4.1 names the cases, not the counts.
  - *One follow-up* in the same session made the tuning prompts as detailed as the exam's; the
    exam briefs were returned unchanged (deep-equal).
  - *Seal format:* AES-256-GCM, key `scrypt(passphrase, salt, 32, N 16384, r 8, p 1)`, as a JSON
    file `{ format: "noacg-sealed-v1", cipher, kdf, N, r, p, salt, iv, tag, ciphertext }`;
    `briefs.sha256` is `<hex>  briefs.json`. GCM makes a wrong passphrase fail outright.
- **H1 must allow for:**
  - *AC-2's test.* The passphrase exists only on this machine, in the main checkout
    (`<git common dir>/../docs/private/harness-exam/passphrase.txt` from a worktree). Where it is
    present, the test decrypts in memory and compares the sha256 to `briefs.sha256`, and never
    writes or prints the plaintext. Everywhere (CI included) it checks the file's shape and that
    a wrong passphrase throws. The Node verify one-liner in `evidence/phase-0.md` is the
    reference; it printed `ok` on 2026-10-14. A Windows checkout rewrites both committed files
    with CRLF, so read them whitespace-tolerant, as the one-liner does; the hash is of the
    private plaintext, which is LF.
  - *The bench's stress mapping:* `bright:`, `dark:` and `busy:` descriptions need fixture
    pictures (a bright and a dark logo, busy background plates). Both sets use them; typeless
    briefs carry v1's `fields` string, keyed `f0..fN` in its order.
  - `third-party-ograf` is in `tuning/briefs.json` as v1 has it, but stays out of the rounds (4.2).
  - *The 5.4 environment on Windows:* `HOME` and `USERPROFILE` do not stop the owner's
    `~/.claude/CLAUDE.md` from loading; Claude Code finds it through the Windows profile.
    `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` do, with a fresh
    `CLAUDE_CONFIG_DIR`. The judge needs the same. The reference arm loads the plugin with
    `--plugin-dir`, so test there that nothing else loads besides it.
- **Traps:** editing this file changes the spec's sha256, so `work-spec.mjs` reports "spec
  changed" against `work.json`. Earlier plans' phase-note pull requests left that as it is, and
  so did this one. A tuning session must never open `docs/private/harness-exam/`; the checker of
  each tuning phase greps that session's evidence for the folder name (D7).
