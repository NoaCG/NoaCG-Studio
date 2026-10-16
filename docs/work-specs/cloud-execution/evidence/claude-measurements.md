# Claude cloud measurements and launch receipts — 2026-10-16

The Claude half of AC-1 (measurements) and Claude evidence for AC-3 (revision-bound
cloud worker result), run from an existing Claude Code cloud session as the owner
directed in [provider-runbook.md](provider-runbook.md). Existing environment and
subscription only; no API model calls. Compact receipts, job records and every failing
test identity are in [claude-measurements.json](claude-measurements.json). The full
Playwright reports and logs are on branch `scratch/claude-measure-82880f`, commit
`836785a137340ea96d41fe100bf5b958c0863987`, which is never queued.

No shared policy was changed. AC-2 still waits on the owner's approval of a depth.

## Cloud coordinator to cloud worker (AC-3, Claude)

| | |
|---|---|
| Coordinator | `session_01UXXD4v5EXZAvPUVYAtsL5e`, Anthropic-hosted, started from the Claude desktop app |
| Worker | `session_016cz59FTGY7bf8s7n7v3PvX`, provider record `parent_session_id` = the coordinator |
| Environment | `env_017nuiDZBW9smUNLdWVQK8cf` (NoaCG), from both the provider binding and the worker's own `get_session` |
| Source | `4d55cf52585bb220d8d12d12f42140c76b315cc4` (origin/main, merge of #1300), clean worktree |
| Probe key / nonce | `claude-measure-202610161247-82880f` / `3e13c596ff20b62e` |
| Launched | 2026-10-16T12:48:09Z |

Tools used, all from the `claude-code-remote` MCP server in the coordinator:
`create_session` (`source_url` the repository, `source_revision` the SHA above,
`environment_id` above, `outcome_branch` `scratch/claude-measure-82880f`, one prompt),
`get_session`, `list_events` (transcript), `send_message` (follow-up) and `send_later`
(the coordinator's own check-ins). One submission, no retries, so there was no uncertain
submission to reconcile.

- **Identity.** The worker checked the SHA, environment and clean tree at 12:49:10Z but
  did not print the requested identity block. The coordinator's single follow-up at
  13:00Z asked for it. The worker's reply at 13:00:38Z, delivered by the provider's
  cross-session message, matched the session ID, environment, HEAD, clean tree and nonce.
- **Result transport.** Status and progress came through the transcript (`list_events`)
  and `get_session`'s turn summary. Receipts came back as a git push to the outcome
  branch, which the coordinator fetched. Local paths in the worker were not relied on.
- **Not exercised here:** coordinator restart or reconnect, reclaimed-container recovery,
  scheduled cloud wake beyond this session's own check-ins, and click-free landing.
  They stay open under AC-4 and AC-5.

## Local session to cloud session (owner probe)

A local Claude Code session on the owner's Windows laptop ran `claude --cloud` and
created `session_01VFZtobiuJn6zpcu5Dz7Wi3` at 13:15:50Z. The coordinator read it
through `get_session` and `list_events`:
- **Provider record:** `origin` `claude_code_cli`, environment `env_017nuiDZBW9smUNLdWVQK8cf`
  (the CLI picked it out of NoaCG and "Default"), source `main`.
- **Session's own report:** HEAD `4d55cf52585bb220d8d12d12f42140c76b315cc4`, no changes,
  finished at 13:16:33Z.

Earlier attempts failed with HTTP 403 while listing environments, before any session was
created. The owner's Windows user environment sets `CLAUDE_CODE_OAUTH_TOKEN`, the
long-lived token. It overrides the claude.ai sign-in, and cloud launches are refused under
it. The launch worked once the variable was cleared in that shell. So cloud launches need
the normal sign-in, and automation running on the long-lived token gets 403.

**Departure from the runbook.** The owner dropped the laptop-closed probes as unnecessary
by design. A cloud session runs on the provider's machine whatever happens to the session
that launched it, so closing the laptop tests nothing beyond a successful launch.
The question that remains is whether an agent can launch, and the probe above answers
that for Claude.

## Measurements (AC-1, Claude)

**Machine.** Ubuntu 24.04.5, 4 vCPU Xeon 2.80 GHz with no CPU quota, 16093 MiB host memory,
Node v22.22.0, Playwright 1.61.1, Chromium build 1228 preinstalled.
- **Memory limit:** cgroup v1. The worker's command scope `/process_api/<id>/claude-code-bash`
  is capped at **13.36 GiB** (`memory.limit_in_bytes` 14343688192), and its ancestors are
  unlimited. The job runner and all its children ran inside that scope. `failcnt` stayed 0.
- **Sampler gap:** the sampler reports `containerLimitsObserved: false` and
  `cgroupSampledPeakBytes: 0` here because it reads cgroup v2 only. The worker sampled the
  v1 scope once a second instead (the "cgroup peak" column).
- **Setup:** `npm ci` took 15 s, kept outside the timings.

Exact runbook commands, one queued browser job at a time (`--kind sweep --cap 21`, 1200 s
outer bound, 1100 s Playwright bound). Zero retries, `CI` unset, nothing re-run.
Window 12:48Z–14:18Z; the last job ended 13:50:06Z and every planned run executed.

| Run | Exit | Wall | Peak RSS | cgroup peak | Planned | Pass | Fail | Skip | Unrun |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Production build | 0 | 6m24s | 3.19 GiB | — | 2965 + 419 gateway | all | 0 | 23 | 0 |
| Changed-path gates, PR 1278/1287/1292/1293 gate replays | 0 | 0.2–16.4s | ≤ 0.84 GiB | — | | pass | | | |
| v2-pr1278-w4, 4 workers | 1 | 61s | 3.84 GiB | — | 78 | 59 | 18 | 1 | 0 |
| v2-pr1287-w4, 4 workers | 0 | 11s | 3.10 GiB | — | 8 | 8 | 0 | 0 | 0 |
| v2-pr1292-w4, 4 workers | 1 | 18m21s | 5.28 GiB | 4.56 GiB | 542 | 328 | 6 | 23 | 185 |
| v2-pr1299-w4, 4 workers | 0 | 10s | 3.11 GiB | — | 8 | 8 | 0 | 0 | 0 |
| PR 1293 browser | — | — | — | — | none selected, so none run | | | | |
| Shard 1, 2 workers | 0 | 8m22s | 3.22 GiB | 3.33 GiB | 204 | 153 | 0 | 51 | 0 |
| Shard 1, 4 workers | 0 | 6m57s | 5.41 GiB | 4.55 GiB | 204 | 153 | 0 | 51 | 0 |
| Shard 1, 6 workers | 1 | 7m18s | 7.29 GiB | 5.62 GiB | 204 | 120 | 36 | 48 | 0 |
| Shard 2, 4 workers | 1 | 8m29s | 5.81 GiB | 4.98 GiB | 205 | 160 | 1 | 44 | 0 |

The coordinator recounted every Playwright report from the worker's raw JSON, and the
counts match. Monitor CPU was 1.7–8.0% of the 4 vCPUs.

**Failures, kept as observed:**
- **v2-pr1278-w4:** 18 `public-chrome-baseline.spec.ts` screenshot mismatches, 501–2409 px.
  Codex saw 17 of 9–10 px on the same source, so rasterization differs much more here,
  even on Ubuntu 24.04.
- **v2-pr1292-w4:** hit the 1100 s bound and is **incomplete**. It finished 334 of 542 cases,
  where Codex finished 465. Both global-timeout errors are kept. The 6 failures are the same
  `playout-baseline.spec.ts` snapshots Codex saw.
- **Shard 2:** one failure Codex did not have, `wizard-finish.spec.ts:659` (`.wz-dot.active`
  not found after 7 s). It ran once and was not re-run, so it is not classified as flaky.
- **Shard 1 at 6 workers:** 36 failures where Codex's 6-worker run was clean. 33 are 7 s
  `toBeVisible()` timeouts across eight specs. Memory was not the cause: the peak was 5.62 of
  13.36 GiB and `failcnt` was 0. CPU oversubscription on 4 uncapped vCPUs is the likely
  cause, but that is unverified.

## Comparison with the Codex VM ([measurements.md](measurements.md))

| Work | Codex (4-CPU quota, 16 GiB) | Claude (4 vCPU, 13.36 GiB scope) |
|---|---|---|
| Build | 3m23s, 2.22 GiB | 6m24s, 3.19 GiB |
| Shard 1 at 2 / 4 / 6 workers | 6m05s / 5m24s / 5m32s, all clean | 8m22s / 6m57s / 7m18s, 6 workers failed 36 |
| Shard 2 at 4 workers | 6m12s, clean | 8m29s, 1 failure |
| Large affected selection (PR 1292) | bound hit, 47 unrun | bound hit, 185 unrun |

Inputs for the AC-2 depth proposal, not a policy change:
- **Speed:** this Claude VM runs build and browser work at roughly 0.7× the Codex VM's speed.
- **Browser workers:** **4** is the fastest clean count on both providers. 6 is slower and
  unreliable on the Claude environment, so a cloud profile should cap it at 4.
- **Large selections:** a large affected selection does not finish inside the existing
  18m20s bound on either provider. A depth that relies on full affected selections in a
  single cloud worker would leave cases unrun.
- **Screenshots:** baselines differ between the two clouds and from Ubuntu CI. Cloud
  screenshot failures are not evidence about the change until compared with CI.
