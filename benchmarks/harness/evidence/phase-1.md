# H1 evidence: the bench and the dry run

Phase 2 of `docs/work-specs/noacg-harness/spec.md` (AC-1 and the plumbing of AC-16; AC-2's test),
built 2026-10-14 on `origin/main` `78a429895`. Credit spent: $0. No session was created, no
Anthropic endpoint was called, and no subscription child was started.

## What exists now

| Piece | Where | What it does |
|---|---|---|
| `noacg coverage` | `cli/src/coverage.ts` (the plan, pure), `cli/src/commands/coverage.ts` | The matrix of 3.2 in one browser session: value sets `sample`, `long` (the brief's long value, else 1.7x the sample), `empty` (every field but the first text), and on a two-sided board `long-side-1` and `long-side-2`; grounds video and light (and busy when the brief's background is `busy:`); off; the Take, every declared event, every extra step, an update and Out as strips at 0 (shot at 20), 120, 300, 600 and 1500 ms, the Take and events also 10 s later; native-pixel crops of every text and image field of the long-value frame. Writes `coverage.json` (what each frame shows, the digest). An event that moves the machine from neither the settled Take nor after any other event that does is a finding (exit 1). |
| `noacg record` | `cli/src/commands/record.ts` | Validates (an error refuses, nothing written), then writes `record.json` (`noacg-record-v1`: the digest, the validation, the operator surface, and `doc`, the bridge's `graphicDoc`, exactly what `save` POSTs) and `record.zip` beside it. No key, nothing saved. |
| The digest | `cli/src/digest.ts` | `sha256:` over the normalized template, keys sorted, line endings LF. Printed by `validate --json` (`digest`), `coverage` and `record`. |
| Strips and crops | `cli/src/screenshot.ts` | `shootSequence` takes `offsets` (several frames in one run) and `crops`; two new plates, light and busy. Existing callers are unchanged (`screenshot-states.test.mjs` 8 of 8 against the live bridge). |
| The Skills API target | `cli/scripts/build-skill.mjs --skills-api <dir>` | The skill's own bytes under `noacg-graphic/` with `bundle.json` (each file's sha256 and the bundle's). Every run, `--check` included, now refuses a `SKILL.md` the Skills API would refuse (name, description, size). |
| The client | `api/_lib/harness/client.ts` + `client.test.ts` | Start a session (brief, type, budget in cents, run id, file resources), read it (status, completion, list cost, progress lines, the `noacg` commands and the digests they printed), list and download outputs by session, dispose (interrupt if running, delete files, delete the session), `sessionGone`. No route reaches it. |
| The stub | `api/_lib/harness/managedAgentsStub.ts` | The Managed Agents half of the SDK, replaying the documented shapes; its agent is whatever the caller passes. |
| The bench | `benchmarks/harness/lib/` | `ledger`, `arms` (fake, managed-agents, claude-code), `pipeline` (one cell), `gallery`, `judge` (skeleton), `subscription` (5.4), `sealed` (D7), `agent-def`, `cli`, `api-runtime`. |
| The runner | `scripts/harness-bench.mjs` | `--control`, `--build <H#>`, `--close <H#>`, `--review`, and the ledger with no flag. |
| The agent | `agents/noacg-harness/agent.md`, `environment.yaml`, `scripts/harness-agent-sync.mjs` | The definitions in `ant apply`'s layout and the SDK sync that records `claude-lock.<workspace>.json`. Not applied in H1: the plan prints `create` for all three. |
| The ledger | `benchmarks/harness/ledger.json` | H0 (subscription, $1.47 notional, $0 credit) and H1 (none, $0), both completed. |
| The bench key | `scripts/bench-env.mjs --profile=harness` | Writes `.env.bench.local` with `ANTHROPIC_BENCH_API_KEY` only, and refuses if it equals the production key. |

## The dry run

```
NOACG_URL=https://noacg.studio node scripts/harness-bench.mjs --control --out <scratch>/control3
```

Against the production bridge rather than this checkout's dev server: coverage and record are
this checkout's CLI and need nothing of the deployment but bridge functions it already serves
(`compose`, `stateData`, `inspect`, `graphicDoc`, `exportPackage`), and the dev server would have
added load to a machine other agents share. Output, 2026-10-14 (about 2.5 minutes):

```
CONTROL against https://noacg.studio: 2 brief(s)
  school-scoreboard.fake                       delivered, shape ok, validator clean, 57 frame(s), 2 crop(s), digests one version, MISSING flag, $0.00 [32s]
  school-scoreboard.managed-agents-stub        delivered, shape ok, validator clean, 57 frame(s), 2 crop(s), digests one version, MISSING flag, $0.00, cleanup gone [33s]
  debate-clock.fake                            delivered, shape ok, validator clean, 27 frame(s), 2 crop(s), digests one version, MISSING switch/penalty/reset, $0.00 [26s]
  debate-clock.managed-agents-stub             delivered, shape ok, validator clean, 27 frame(s), 2 crop(s), digests one version, MISSING switch/penalty/reset, $0.00, cleanup gone [26s]
  school-scoreboard.managed-agents-stub-budget not-ready, shape ok, validator clean, 57 frame(s), 2 crop(s), digests one version, MISSING flag, $0.00, cleanup gone [33s]
  the wall ($1 left, a $3 session)             REFUSED before any session was created
Spend recorded by this run: $0.00
Judge: not frozen yet - no judge.lock.json yet: H2 writes, calibrates and freezes the judge.
CONTROL PASSED
```

What each line proves:

- **Capture, record, shape check, gallery, ledger at $0 (AC-1).** Each cell's package went
  through `record` (the fake agent's hand-in), `graphicSaveShape` from `api/_lib/me/graphicShape.ts`
  compiled as Vercel compiles it, `coverage` with the brief's stress values, the bench's own
  `validate` and `inspect` of the delivered zip, and an entry in a copy of the ledger. The copy
  ends with five H1 entries at 0 cents; the committed ledger is never written by a dry run.
- **One version.** The record's digest, the bench's validate of the delivered zip and the last
  digest the agent's trace printed agree in every cell (`sha256:90b8fd33e5de...` for the board,
  `sha256:8663fdcd3ac2...` for the clock; the same in the fake and the stubbed cell, since a
  scaffold is deterministic).
- **The managed-agents arm on the stub.** Sessions `sesn_stub000001`, `...026`, `...051`: created
  with the brief, `budget {type: limit, max_list_cost: {amount: "300", currency: USD}}` and the CLI
  tarball as a file resource; read until idle; outputs listed by `scope_id` with the
  managed-agents beta, the record and zip downloaded; then disposed. After it, a session fetch
  answers 404 and the file list is empty (`cleanup gone`: 2 files deleted, 0 left). Progress
  lines came from the replayed `agent.tool_use` events: "Designing", "Checking the graphic",
  "Handing it in".
- **Not ready.** The session that ends `budget_reached` (`session.thread_status_idle`,
  `session.usage`, `session.status_idle`, in the documented order) hands in its last record as
  `not-ready`, and it still goes through the whole pipeline.
- **The wall.** A ledger copy with $1 left refused a $3 session with a $0.50 overshoot margin
  ("need $3.50") before the stub was asked for anything: 0 sessions created, a `refused` entry
  written.
- **MISSING** is the operability gate (3.6) measuring scaffolds that do not do what the brief
  asks: the neutral scoreboard has `goalA`, `goalB`, `clearFlag`, `final` against the brief's
  `flag`, and a typeless scaffold has no actions. It is the measurement working, not a fault;
  see the trap below about `flag`.

The gallery (`review.html`, `key.json`, `notes.md`, frames copied under `gallery/<id>/`) was
built in the scratch directory, 34 MB, and is not committed. I opened it: per brief one row per
render with each graphic's strip side by side under ids `83928a`, `8f4a75`, `b198aa`, `dacc48`,
`f856e3`, no arm on the page or in any image path; the "measured" row gives the validator, the
operator surface and the missing actions. Frames I looked at: the light-plate long-side-1 frame
(the 31-character team name fits its panel, "AWAY" on the other side), the Take strip at 120 ms
(the panel mid-entrance, before the text), and the native-pixel crop of the long name.

Five runs in all. Runs 1, 3 (above), 4 and 5 passed; run 5 is on the final code, after the
review's fixes, with the same lines. Run 2 ended the budget cell `failed - budget_reached` with
nothing handed in, because the stub session's fake agent failed and the stub swallowed the cause.
The same package validated cleanly by hand afterwards, so it was transient; the runner now prints
a fake agent's failure.

## The shapes the stub replays

From `@anthropic-ai/sdk` 0.133.0's own types (`resources/beta/sessions/*.d.ts`,
`resources/beta/files.d.ts`, `resources/skills/*.d.ts`; `client.test.ts` compiles a line that
fails if the real client stops fitting the interface the harness uses) and these pages, read
2026-10-14:

- https://platform.claude.com/docs/en/managed-agents/events-and-streaming: event types; a session
  created with `initial_events` starts `running`; `session.status_idle.stop_reason.type` of
  `end_turn`, `requires_action`, `budget_reached` (the SDK adds `retries_exhausted` and
  `refusal`); at a budget, `session.thread_status_idle`, `session.usage`, `session.status_idle`;
  webhook names differ (`session.status_idled`).
- https://platform.claude.com/docs/en/managed-agents/files: mounts under `/mnt/session/uploads/`,
  outputs from `/mnt/session/outputs/` listed with `client.beta.files.list({ scope_id, betas:
  ['managed-agents-2026-04-01'] })`, downloaded with `client.files.download(id)`, a short
  indexing lag after the idle.
- https://platform.claude.com/docs/en/managed-agents/environments: `limited` networking,
  `allowed_hosts`, `allow_package_managers` (required by `packages`), the package manager hosts.
- https://platform.claude.com/docs/en/build-with-claude/skills-guide: `client.skills.create({
  files })` with every file under one top folder holding `SKILL.md`, `latest_version_id`, a new
  version as a full snapshot, the name, description and 30 MB limits.

## The other acceptance pieces

- **AC-2** (`scripts/harness-bench.test.mjs`): the committed `briefs.sealed` has the seal's shape
  and a wrong passphrase gets nothing, everywhere; where the main checkout's
  `docs/private/harness-exam/passphrase.txt` exists (this machine), the file decrypts in memory to
  `briefs.sha256`. Run here: both pass. The runner's source never names the sealed set or the
  private folder, and a test pins that.
- **AC-16's cap**: the system prompt is 14 of 25 lines, plumbing only (where the CLI is,
  `NOACG_URL`, the time and money, the outputs, never save or login); web tools off,
  `always_allow`, Opus 5.5 at `high`, no multiagent block (the critic is off until H6 measures it).
- **5.4**: the reference arm and the judge build their child's environment from scratch (PATH,
  a fresh home and profile directories, `CLAUDE_CODE_OAUTH_TOKEN`, `NOACG_URL`, what Windows
  needs to start a process, `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` and `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`
  on every platform), refuse a variable named like a key, and start nothing unless `claude auth
  status` there reports `loggedIn: true` and `authMethod: oauth_token`. Tested with a stand-in
  `claude`; no real child was started in H1.
- **`--build`**: refuses a phase the ledger holds as completed (H0 and H1 now), needs `--arms`,
  `--briefs`, `--model` and, for managed-agents, `--budget-cents`, the synced lock and the bench
  key; refuses a model other than the synced agent's and an agent definition changed since the
  sync; skips cells the ledger already holds for the phase, so a resumed run never pays twice;
  writes each cell's entry to the committed ledger as soon as it is known, and stops if a
  session's cost could not be read.
- **Completion**: a session idle with `end_turn` whose last message says `NOT READY` is not ready,
  not delivered; a session that fails after it was created is still settled, read, deleted and
  named in the ledger (both tested).

## Checks run

`node --test scripts/harness-bench.test.mjs` 20 of 20; `node scripts/run-ai-gateway-tests.mjs`
394 of 394 (the client's 9 included); `cd cli && npm test` 276 pass, 18 skipped (no bridge);
`cli/test/screenshot-states.test.mjs` against `https://noacg.studio` 8 of 8; `npm run gates --
run --changed origin/main` green; `npx tsc --noEmit -p tsconfig.api.json`, the CLI's `tsc`, and
eslint on every changed file clean; `node cli/scripts/build-skill.mjs --check` OK.

Not checked: anything against Anthropic (no sync, no session, no file upload), the reference arm
with a real `claude -p`, and the judge beyond its lock check.
