# Claude worker measurements: probe claude-measure-202610161247-82880f

## IDENTITY

- Native session ID (get_session, no session_id): `session_016cz59FTGY7bf8s7n7v3PvX`; parent `session_01UXXD4v5EXZAvPUVYAtsL5e`
- environment_id as the provider binding reports it: `env_017nuiDZBW9smUNLdWVQK8cf` (environment_kind `anthropic_cloud`)
- `git rev-parse HEAD` in `.claude/worktrees/measure`: `4d55cf52585bb220d8d12d12f42140c76b315cc4` (= origin/main, merge of PR #1300)
- `git status --short`: 0 lines (clean) at 12:49:02Z and 13:00:38Z
- UTC: identity at 2026-10-16T12:49:10Z; re-echoed to coordinator at 13:00:38Z
- Coordinator nonce: `3e13c596ff20b62e`

Measurement window: 12:48Z-14:18Z. All runs planned in the runbook were executed; none omitted.
Last browser job finished 13:50:06Z. Window was not extended.

## Machine (in-worker observation)

- Ubuntu 24.04.5 LTS, kernel 6.18.44-fc-v139, Intel Xeon @ 2.80GHz, 4 vCPU (affinity 4, cpuset 0-3)
- Host memory 16093 MiB, no swap. Disk 252G with 29G free at start
- Node v22.22.0, npm 10.9.4, @playwright/test 1.61.1, Chromium build 1228 at /opt/pw-browsers (already installed, no download)
- Sampler `machine()`: `containerLimitsObserved: false`, quotaCpus/memoryMax null (`raw/claude-machine.json`)
- cgroup inspection (`raw/claude-cgroup.txt`): cgroup v1 hybrid. Memory scope is
  `/process_api/<id>/claude-code-bash`, which has **memory.limit_in_bytes = 14343688192 (13.36 GiB)**.
  Its ancestors (`/process_api/<id>`, `/process_api`, root) are unlimited. CPU cgroup at root: cfs_quota_us = -1, so there is **no CPU quota**.
  The job-queue runner and all its children were confirmed to run inside the 13.36 GiB scope.
- The sampler's `cgroupSampledPeakBytes` is 0 on every receipt because it reads cgroup v2 only. A side sampler
  (1 s, `memory.usage_in_bytes` + failcnt of the claude-code-bash scope, including page cache) is in
  `raw/claude-cgroup-usage.log`. The "cgroup peak" column below comes from it.
- Setup, measured separately: `npm ci` took 15 s, exit 0 (`raw/claude-setup-npmci.log`). Browser was preinstalled. The queue was empty at start.
- No `CI` set; assertions, retries (0), timeouts, baselines, and quarantine left unchanged. No test was re-run.

## Commands

Exactly the runbook's commands, from the worktree:

- `node --input-type=module -e 'import {machine} ...'` → exit 0
- `node scripts/cloud-measure.mjs --seconds 1200 --out /tmp/claude-build.json -- npm run build`
- `node scripts/cloud-measure.mjs --seconds 300 --out /tmp/claude-gates.json -- node scripts/gates.mjs run --changed origin/main`
- The four PR gate replays, as printed by the runbook snippet (`raw/claude-pr-gate-cmds.txt`)
- Browser: the runbook's generator snippet, parameterised as `raw/gen.mjs <cohort> <workers>`, then `node scripts/jobs.mjs add '<cmd>' --kind sweep --cap 21`
  and `node scripts/jobs.mjs wait <id>`. Each exit status and receipt was inspected before the next job (`raw/run.sh`, `raw/sum.mjs`).

## Results

Monitor CPU = sampler `monitorCpuSeconds` (share of 4 vCPU over wall time). Retries were 0 everywhere; no flaky outcomes.

| Run | Job | Exit | Wall | Peak RSS | Peak PSS | cgroup peak | Monitor CPU | Planned | Passed | Failed | Skipped | Unrun |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Production build | — | 0 | 383.5s | 3.19 GiB | 3.12 GiB | — | 26.6s (1.7%) | node 2965 + gateway 419 | 2942 + 419 | 0 | 23 | 0 |
| gates --changed origin/main | — | 0 | 0.2s | 16 MiB | 9 MiB | — | 0.03s | 0 changed paths | — | — | — | — |
| pr1278-gates | — | 0 | 16.4s | 837 MiB | 599 MiB | — | 0.62s | | pass | | | |
| pr1287-gates | — | 0 | 9.9s | 614 MiB | 421 MiB | — | 0.41s | | pass | | | |
| pr1292-gates | — | 0 | 7.9s | 267 MiB | 166 MiB | — | 0.21s | | pass | | | |
| pr1293-gates | — | 0 | 6.5s | 240 MiB | 139 MiB | — | 0.18s | | pass | | | |
| v2-pr1278-w4 (7 specs) w4 | j-0001 | 1 | 61.2s | 3.84 GiB | 2.32 GiB | n/a* | 11.6s (4.7%) | 78 | 59 | 18 | 1 | 0 |
| v2-pr1287-w4 (downloads) w4 | j-0002 | 0 | 10.6s | 3.10 GiB | 1.63 GiB | n/a* | 1.1s | 8 | 8 | 0 | 0 | 0 |
| v2-pr1292-w4 (48 specs) w4 | j-0003 | 1 | 1101.4s | 5.28 GiB | 3.39 GiB | 4.56 GiB | 336.7s (7.6%) | 542 | 328 | 6 | 23 | 185 |
| v2-pr1299-w4 (onboarding/downloads) w4 | j-0004 | 0 | 10.3s | 3.11 GiB | 1.66 GiB | — | 1.1s | 8 | 8 | 0 | 0 | 0 |
| PR1293 browser | — | — | — | — | — | — | — | 0 (none selected; not run) | | | | |
| v2-full-shard1 w4 | j-0005 | 0 | 417.0s | 5.41 GiB | 3.38 GiB | 4.55 GiB | 112.8s (6.8%) | 204 | 153 | 0 | 51 | 0 |
| v2-full-shard2 w4 | j-0006 | 1 | 508.7s | 5.81 GiB | 3.80 GiB | 4.98 GiB | 163.0s (8.0%) | 205 | 160 | 1 | 44 | 0 |
| v2-full-shard1 w2 | j-0007 | 0 | 501.8s | 3.22 GiB | 2.19 GiB | 3.33 GiB | 97.0s (4.8%) | 204 | 153 | 0 | 51 | 0 |
| v2-full-shard1 w6 | j-0008 | 1 | 437.7s | 7.29 GiB | 4.36 GiB | 5.62 GiB | 129.4s (7.4%) | 204 | 120 | 36 | 48 | 0 |

\* The side sampler started at 12:59:36Z, after j-0001/j-0002 had finished. memory.failcnt stayed 0 throughout, so the 13.36 GiB limit was never hit.
The build's cgroup peak predates the side sampler. The scope's lifetime `max_usage_in_bytes` was 4.18 GiB (4488962048 B) at ~12:59.

Failure detail:

- **v2-pr1278-w4**: 18 screenshot failures in `public-chrome-baseline.spec.ts`. That is 16 `header.top` chrome cases (8 pages × desktop/phone),
  differing by 501-2035 px (ratio 0.02-0.03), plus `ograf page at desktop/phone` (2409 / 1358 px, ratio 0.01).
  Codex had 17 failures of 9-10 px each, so this runtime's rasterization diverges much further, even though it is Ubuntu 24.04 like the GitHub runners.
- **v2-pr1292-w4**: hit the 1100 s Playwright global bound, so the run is **incomplete**. Both global-timeout errors are retained
  ("Timed out waiting 1100s for the test suite to run" and "…for the teardown…"). The outer sampler bound was not reached (`timedOut: false`).
  The 6 failures are the same six `playout-baseline.spec.ts` snapshots Codex saw (graphics only / graphics and server cues / folders × 1920x1080, 1366x768).
  Completed 334 of 542 cases, versus Codex's 465. Playwright's skipped stat (208) combines 23 ordinary skips and 185 unrun cases.
- **v2-full-shard2 w4**: 1 failure that Codex's run did not have. It is `wizard-finish.spec.ts:659` "back onto a deep-linked walk restores it, and the link does not start it over (#1220)":
  `expect(locator('.wz-dot.active')).toHaveText(/Fields/)` failed with element not found after 7000 ms. It ran once with no retry and was not re-run, so it is not classified as flaky.
- **v2-full-shard1 w6**: 36 failures, where Codex's 6-worker run passed everything. 33 are `toBeVisible()` 7000 ms timeouts; the other three are 1× toHaveAttribute, 1× toBeGreaterThan and 1× toHaveCount 0.
  They span editor-model-proposals, editor-transforms, import-canvas, import-stretch, output-first-paint, production-data, project and rundown-history-storage.
  Memory was not the cause: the cgroup peak was 5.62 / 13.36 GiB and failcnt was 0. The likely cause is CPU oversubscription (6 workers plus server on 4 uncapped vCPUs), but that is an inference I have not verified.
  The skipped count was 48 rather than 51, probably serial-suite skips altered by the failures; see the tests JSON.

## Comparison with measurements.md (Codex VM: 4-CPU quota, 16 GiB cgroup-v2)

| Work | Codex | Claude |
|---|---|---|
| Build | 3m23s, 2.22 GiB | 6m24s, 3.19 GiB; same case counts (2965/23 skipped, 419 gateway) |
| Gates (PR replays) | 5.4-12.4s | 6.5-16.4s |
| pr1278-w4 | 39.7s, 60/17/1 | 61.2s, 59/18/1 (larger snapshot diffs) |
| pr1287-w4 / pr1299-w4 | 6.8s / 8.7s, 8/8 | 10.6s / 10.3s, 8/8 |
| pr1292-w4 | 18m21s, 459 pass / 6 fail / 30 skip / 47 unrun | 18m21s, 328 / 6 / 23 / 185 unrun |
| shard1 w2 / w4 / w6 | 6m05s / 5m24s / 5m32s, all 153/0/51 | 8m22s / 6m57s / 7m18s; w6 failed 36 |
| shard2 w4 | 6m12s, 161/0/44 | 8m29s, 160/1/44 |

On this VM, browser and build throughput is about 0.7× the Codex VM's. Four workers is the fastest clean count here.
Six workers was both slower and unreliable, so **4 workers** is again the calibrated count, and 6 should not be used on this environment.

## Raw artifacts (`raw/`)

- Receipts: `claude-*.json` (sampler) and `claude-*-tests.json` (Playwright JSON) for every run. Also `run-summaries.jsonl` (derived counts) and `jobs/j-000N.json` plus `jobs/j-000N.log` (queue records and output).
- Logs: `claude-build.log` (0.77 MB, kept whole; no log exceeded 1 MB, so none was truncated), `claude-gates.log`, `claude-pr*-gates.log`, `claude-setup-npmci.log`, `claude-wait-j-*.txt`
- Machine/cgroup: `claude-machine.json`, `claude-cgroup.txt`, `claude-cgroup-usage.log` (columns: UTC, usage bytes, failcnt, total_rss, total_cache)
- Helpers: `gen.mjs` (the runbook snippet with cohort/workers as args), `run.sh`, `sum.mjs`
- Logs were scanned for secret-shaped strings (JWT, sk-, ghp_, github_pat_, AKIA, PEM): no matches. No environment values are included.

Transport: this branch, `scratch/claude-measure-82880f`, pushed to origin. It is not queued and no PR exists.
