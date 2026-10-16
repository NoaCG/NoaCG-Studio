# Provider-separated continuation and laptop handoff probes

Owner direction, 2026-10-16: Claude launch probes and measurements run from the
existing Claude Code cloud session; Codex measurements stay in Codex. Once, on
the laptop, launch one worker from each provider's own CLI and close the laptop
session. Launching is light work. Neither provider launches the other's sessions.
This is a runbook, not evidence that those pending probes passed.

## Claude cloud coordinator: copy this task

```text
Continue NoaCG cloud-execution phase 1 and Claude-native launch qualification.
Repository: https://github.com/NoaCG/NoaCG-Studio
Measurement delivery: https://github.com/NoaCG/NoaCG-Studio/pull/1300
Read AGENTS.md, docs/ARCHITECTURE.md, docs/work-specs/README.md, canonical
check/verify/queue-merge/orchestrator/plan-run, and docs/work-specs/cloud-execution.
Reuse cloud-landing-recovery evidence; do not repeat its unchanged AC-1..AC-5.

Use only this provider's existing NoaCG cloud environment and subscription.
Inspect supported session-launch/transcript/status/follow-up tools actually
available here. Record their exact names and nonsecret arguments. Launch one
Claude worker, with a unique probe key and explicit intended environment and
source SHA. Do not launch Codex or use API model calls as a substitute.
Before retrying an uncertain launch, reconcile existing session IDs/transcripts
and the probe key; unresolved submission stops rather than creating a duplicate.

Use a 90-minute measurement/launch probe window starting at the first launch;
record its UTC start/end. One browser queue job at a time. No shared policy edits
until the owner approves the numerical depth. Preserve assertions, retries,
timeouts, baselines and quarantine rules. Fetch the current remote tip, then use
an owned branch/worktree containing PR1300's merged measurement tools; record its
full SHA. Stop on a missing tool rather than silently changing the source.
Use the exact measurement cohorts and commands below. Read actual reports, not
just the planner. Keep failures and unfinished cases. Do not publish secrets,
private files, binaries or unrelated ignored files.

The worker first returns its native session ID/URL, saved environment ID/name,
exact git HEAD, clean/dirty paths, and a nonce echoed from the coordinator.
Then run the measurements. The coordinator reads the worker's transcript/status,
sends one follow-up asking it to echo that nonce and HEAD again, and collects
commands, receipts, case identities, outcome counts, logs and artifact locations.
Record which transport returned each artifact; local paths alone do not prove
the coordinator can retrieve them. Reconnect once and recover the same task.
Record unsupported operations explicitly. Saved environment identity must come
from the provider binding as well as inside-worker observations.

Before any unattended PR, designate exactly one repair owner. Use the existing
qualified landing procedure. Narrow Claude ccr/auto_merge permission still needs
a fresh click-free exact-SHA merge-queue proof; do not grant broad permissions.
Only claim scheduled recovery after an observed supported cloud wake, bounded
to the probe window, with repository/log/push/check/queue access and re-arming.
No proven durable wake means remain active through merge and post-land results.

Commit text evidence to an owned follow-up branch; run /check and /queue-merge
for a verified phase. Leave AC-1..AC-5 open until their actual evidence exists.
Return the PR URL, reviewed SHA, native IDs, measurement summary, failures and
remaining gaps. Do not change this Codex worker's branch or PR1300 while it is live.
```

The previous qualified Claude receipt identifies hosted environment
`env_017nuiDZBW9smUNLdWVQK8cf` and session
`session_01J9NDriM1w6f1wkgzBTYAxu`. Verify that this is still the intended saved
NoaCG environment; do not treat this historical ID as a new launch receipt.

## Exact measurements requested from the Claude worker

In the owned Linux feature worktree, record OS, Node/Playwright versions, setup
time, image/browser revision, active queue and the full source SHA. Run:

```sh
git rev-parse HEAD
git status --short
node --input-type=module -e 'import {machine} from "./scripts/cloud-measure.mjs"; console.log(JSON.stringify(machine(), null, 2))'
node scripts/cloud-measure.mjs --seconds 1200 --out /tmp/claude-build.json -- npm run build > /tmp/claude-build.log 2>&1
node scripts/cloud-measure.mjs --seconds 300 --out /tmp/claude-gates.json -- node scripts/gates.mjs run --changed origin/main > /tmp/claude-gates.log 2>&1
```

Inspect every exit status/receipt before proceeding. If the sampler reports
`containerLimitsObserved: false`, inspect the actual cgroup hierarchy/ancestor
limits; retain unknown limits until established. Do not substitute host RAM.
Do not alter injected credentials or print environment values. Set up dependencies
and the pinned Playwright browser only as needed; keep setup time separate.

The committed Codex JSON contains the exact historical PR path sets and affected
plans. Replay PRs 1278, 1287, 1292 and 1293 through the gate utility. This snippet
prints the exact bounded commands and creates only temporary path-set files:

```sh
node --input-type=module <<'JS'
import {readFileSync, writeFileSync} from 'node:fs';
const data = JSON.parse(readFileSync('docs/work-specs/cloud-execution/evidence/codex-measurements.json'));
for (const pr of [1278, 1287, 1292, 1293]) {
  const plan = data.plans.find(p => p.pr === pr);
  if (!plan) throw Error(`Missing PR ${pr} path set`);
  const file = `/tmp/claude-pr${pr}-paths.json`;
  writeFileSync(file, JSON.stringify({files: plan.files}));
  console.log(`node scripts/cloud-measure.mjs --seconds 300 --out /tmp/claude-pr${pr}-gates.json -- node scripts/cloud-measure-gates.mjs ${file} > /tmp/claude-pr${pr}-gates.log 2>&1`);
}
JS
```

For browser measurements, replay the exact files in these recorded cohorts:
`v2-pr1278-w4` (seven specs), `v2-pr1287-w4` (downloads), `v2-pr1292-w4`
(large production selection), and `v2-pr1299-w4` (onboarding/downloads).
PR1293 selected no browser tests: report none rather than inventing execution.
Run the two recorded maintained shards, then compare shard1 at 2, 4 and 6 workers
if the measured quota/memory supports them. Start with 2; do not attempt 6 on a
smaller VM without memory headroom. Record the reason for an omitted worker count.
The sampler/Playwright flags deliberately bound each run. These are offline
measurements; configured/live suites are a separate verification rung.

To generate one exact queue command, change only the cohort and worker count in
this snippet. Execute its printed command, then use `node scripts/jobs.mjs wait
<returned-job-id>` and inspect the completed job before generating the next:

```sh
node --input-type=module <<'JS'
import {readFileSync} from 'node:fs';
const cohort = 'v2-full-shard1-w4'; // also shard2 or a named PR cohort above
const workers = 2; // repeat shard1 at 4, then 6 only with measured headroom
const data = JSON.parse(readFileSync('docs/work-specs/cloud-execution/evidence/codex-measurements.json'));
const run = data.runs.find(r => r.label === cohort);
if (!run) throw Error(`Missing cohort ${cohort}`);
const specs = run.receipt.command.filter(a => /^e2e\/[\w/.-]+\.spec\.ts$/.test(a));
if (!specs.length) throw Error('No explicit spec paths');
const label = `claude-${cohort}-workers${workers}`;
const command = `PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/${label}-tests.json node scripts/cloud-measure.mjs --seconds 1200 --out /tmp/${label}.json -- node node_modules/@playwright/test/cli.js test ${specs.join(' ')} --workers=${workers} --reporter=json --global-timeout=1100000`;
console.log(`node scripts/jobs.mjs add '${command}' --kind sweep --cap 21`);
JS
```

Keep both JSON outputs for each run. Summarize planned cases, actually completed
passes/failures, ordinary skips, cases never run, flaky outcomes, retries, elapsed
time, RSS/PSS/container peaks and monitor CPU overhead. Preserve global timeout
errors. The large selection may hit its existing 18m20s inner bound; record that
as incomplete. Budget the remaining cohorts within the 90-minute window; never
silently extend it. No whole-suite guard is disabled and `CI` is not set to bypass
the scheduler. Compare against measurements.md, including native snapshot failures.

## One laptop launch per provider, then close the laptop session

Run these from the existing signed-in CLIs in the NoaCG checkout after PR1300
lands. They submit small tasks; no laptop build, server or browser test is needed.
Set an immutable expected SHA from the remote before either submission:

```sh
git fetch origin main
NOACG_PROBE_SHA=$(git rev-parse origin/main)
git show --no-patch --oneline "$NOACG_PROBE_SHA"
```

Use a different unique nonce for each provider. Each small worker prompt says:

```text
NoaCG laptop-closed handoff probe; nonce=<unique nonce>; expected SHA=<full SHA>.
Use the existing intended NoaCG cloud environment. Read AGENTS.md and use an
owned feature worktree at the expected SHA. If HEAD differs, fetch that exact
commit, verify it and stop on mismatch. Record native task ID/URL, provider saved
environment binding, git HEAD, UTC start and nonce. After a 90-second bounded
delay, run node --test scripts/cloud-measure.test.mjs and record UTC end, exit
status and all four outcomes. Return the transcript/results; no PR or landing.
The launcher will close its laptop session once it has the native task ID.
```

**Codex CLI.** Capture `codex --version`, `codex cloud exec --help` and
`codex cloud list --limit 5 --json`. Browse the environment with `codex cloud` and
verify that its ID maps to the current prepared NoaCG environment, rather than
assuming the published runtime's ccarenv ID is accepted by the CLI. Once verified:

```sh
codex cloud exec --env <verified-current-NoaCG-env-id> --branch main --attempts 1 '<probe prompt with exact SHA and nonce>'
```

Save the returned native task ID/URL, UTC submission time and environment binding,
then close the CLI and laptop. After reconnecting, use `codex cloud status
<task-id>` and `codex cloud diff <task-id>`, plus its native task page/transcript
for the result (a read-only probe can have an empty diff). Compare the worker's
SHA/nonce and execution times against the recorded laptop closure interval.
If the CLI only reaches legacy environments or cannot map the current one, stop
and return the exact version/help/error: that is an unsupported handoff finding,
not permission to substitute a GitHub legacy `@codex` task. No duplicate launch.

**Claude Code.** Capture `claude --version` and `claude --help`. In the signed-in
interactive CLI, use `/remote-env` to select the existing hosted NoaCG environment
and record its ID. Use the documented cloud launch with the prompt above:

```sh
claude --cloud '<probe prompt with exact SHA and nonce>'
```

`--environment` selects a self-hosted ccpool_, so do not pass a hosted env_ there.
Save the native session ID/URL and submit/closure times, then close the CLI and
laptop after the acknowledged launch. Read that session's status/transcript from
the Claude cloud coordinator. After reconnecting, send a single nonce/HEAD
follow-up with `claude -p --cloud <session-id> 'Report the original nonce, exact HEAD and completed test result; do not start another worker.'`.
Use `--teleport <session-id>` only if testing local continuation is needed; it is
not necessary to prove cloud execution while the laptop is closed.

For both probes, record when the laptop session ended and resumed. A successful
launch acknowledgement alone does not pass: execution/test completion after
closure, exact revision, intended environment and recoverable results must all
be observed. These short probes do not prove scheduled recovery, reclaimed
containers, archive revival or a complete unattended landing; keep those separate.

References inspected: [Codex CLI](https://developers.openai.com/codex/cli/reference/),
[current cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environments),
[legacy GitHub distinction](https://learn.chatgpt.com/docs/third-party/github),
[Claude cloud](https://code.claude.com/docs/en/claude-code-on-the-web),
[Claude environments](https://code.claude.com/docs/en/cloud-environments).
