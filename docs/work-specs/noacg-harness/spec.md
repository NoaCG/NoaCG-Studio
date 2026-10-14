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
  prompt. Its model and its effect are measured, not assumed (section 3.4). Revert: turn the
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
- **D8 Completion has three paths into one idempotent finalizer.** Polling by an open page
  (primary, inline), the Managed Agents webhook `session.status_idled` and
  `session.status_terminated` (second), and the existing daily cron `/api/render/cleanup`
  (backstop). All three call `finalizeRun(sessionId)`, which claims the run row, downloads the
  record, shape-checks it, inserts it and marks the row in one database transaction (an RPC),
  then deletes the output files and the session. Revert: drop the webhook; polling and the
  sweep remain.
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
- `GET /api/ai/harness-run?id=` polls: it reads the session's events and status; while running
  it returns progress lines; on `idle` (any stop reason, since `requires_action` cannot occur
  with the web tools off and no custom tool) or `terminated`, it calls `finalizeRun` inline and
  returns the result or the "checked, and not ready" state; `budget_reached` is the not-ready
  case.
- `POST /api/ai/harness-webhook` verifies the HMAC with the SDK's `webhooks.unwrap`
  (`ANTHROPIC_WEBHOOK_SIGNING_KEY`), dedupes on the event id, and calls `finalizeRun` for
  `session.status_idled` and `session.status_terminated`.
- The daily cron `/api/render/cleanup` sweeps runs older than the hard time cap that are not
  final: finalizes those with a record, fails the rest, interrupts and deletes their sessions.
- `finalizeRun(sessionId)` is retry-safe: an RPC claims the row (`status = 'finishing'` only from
  a non-final status), the server lists the session's files by `scope_id`, downloads the record
  (and the interim one when there is no final), runs `graphicSaveShape`, and one SQL transaction
  inserts the document and marks the row final with the graphic id. A crash between the insert
  and the mark cannot save twice: the transaction is one statement, and a retry that finds the
  row already final returns the stored graphic id. A crash before the claim retries from the
  start. The settled cost is read from the session before deletion.

### 7.4 Cleanup and retention

Once the graphic is saved, or the run failed for good, the server deletes the output files and
the session (`DELETE /v1/sessions/{id}`: session, event history, container and checkpoints),
which is what makes decision 2's "short retention" true. No-training is Anthropic's API default
and is asserted in the retention test (AC-11). The consent notice (`src/ai/consentNotice.ts`)
is checked for truth under decision 2; a wording change bumps `AI_NOTICE_VERSION`.

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
Polling, the webhook and the sweep each finalize a run; a second call on a final run returns the
stored graphic id; a crash before the claim retries; an interim record is saved as not ready.

### AC-10: No credential or graphic code crosses the boundary
**Layer:** a Node test of the create payload and the environment config.
The session carries the brief and nothing else; the environment's allowed hosts are exactly
H3's; web tools are off; the saved graphic comes only from the downloaded record after the shape
check and is re-validated in the browser.

### AC-11: Retention matches decision 2
**Layer:** a Node test.
After a save or a final failure, the output files and the session are deleted; no managed task
requires ZDR by default; the consent wording is true for the providers in use.

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
