# Durable run qualification, 2026-10-16

Scope: the opt-in local supervisor and research recommendation, not a deployed cloud control
plane. Windows, Node 24.13.0. Inert Node children were the only coordinators started or killed.
No model call, new wake task, cloud environment or credential was created.

## Acceptance

| Criterion | Verdict | Evidence and limit |
| --- | --- | --- |
| AC-1 | Pass | `docs/research/durable-orchestration.md` inspects current authorities, compares the five named projects and retaining the scripts, cites primary sources, and gives one hosted architecture with compatibility, state, recovery and migration details |
| AC-2 | Pass | `run-supervisor.test.mjs` kills a real coordinator, runs fresh CLI supervisor processes, races two ticks, checks one action journal entry, and kills a supervisor after the adapter committed success but before its own receipt. After simulated lease expiry it reconciles without redelivery |
| AC-3 | Pass | Tests cover a quiet live process, owner/permission/dependency waits, usage wait/reset and unknown reset, unknown provider state, stable intent IDs, backoff and three-attempt refusal |
| AC-4 | Pass | Tests cover explicit finish/cancel, report and expiry, stale lease fencing, changed wave window and immutable registration/objective, invalid dates/receipts and oversized packets including phase carry |
| AC-5 | Pass with stated limits | Usage-only reader and `measurements.json` quantify available polling/cache counters. Process tests report healthy/recovery timing and packet bytes. Cloud replacement and provider recovery usage are explicitly unverified, as the criterion requires when real platform access is absent |

## Commands and observations

`node --test scripts/run-supervisor.test.mjs`

- Fourteen tests passed. The adapter's SQLite journal reserves an action ID before launching an
  inert worker. An uncertain provider launch would stay unknown. No exactly-once claim is made
  for providers that do not implement this protocol.
- The killed-supervisor test first confirmed the abandoned lease suppresses a second tick,
  then advanced its injected clock past 60 seconds. It did not wait a real minute or reboot a host.
- Sample measurements across repeated development/final gate runs: healthy CLI check about
  150 to 191 ms; recovery plus concurrent/duplicate ticks about 466 to 544 ms; delivered fixture
  packet 612 bytes; zero model/planning calls. These are fixture/control measurements only.

`node --test scripts/run-supervisor.test.mjs scripts/run-wake.test.mjs scripts/run-wake-gate.test.mjs scripts/plan-run.test.mjs scripts/wave-plan-store.test.mjs scripts/wave-recover.test.mjs`

- Existing wake, hook, phase/store and wave recovery checks passed alongside the supervisor.
  The earlier combined run had 66 passing tests; the final run adds the multi-run isolation case.
  No working desktop mechanism was edited.

`node scripts/gates.mjs run --changed origin/main`

- Targeted contract freshness/citations, docs map, client-secret, gate coverage, copy and landed
  ref checks passed. The selected supervisor and Windows process-visibility tests passed.
- Full builds and browser suites are left to GitHub Actions, per repository policy. There is
  no product UI change requiring a browser or taste review.

`node scripts/run-wake-measure.mjs <primary-Claude-project-folder> docs/work-specs/durable-runs/evidence/measurements.json`

- 146 top-level transcripts scanned since Oct 12; 88 scheduled-task envelopes matched, no
  malformed JSONL. Counters deduplicated using the existing `harness-usage` helpers.
- First positive request context min/median/max: 77,838 / 87,106 / 90,091 tokens.
- Totals: ordinary input 592; cache write 3,443,805; cache read 12,979,008; output 16,453.
- 87 explicit check commands, zero native send/Skill/Read calls. This sample therefore cannot
  quantify actual coordinator recovery or repeated planning after recovery. A zero-token usage
  row is not evidence of a successfully blocked gate. Missing/archived transcripts are excluded.
- Only usage/timing/tool-category metadata was saved. Prompts, tool output and full transcripts
  were not saved or fed to a recovery worker. Dollar charges and subscription accounting were
  not inferred from token counters.

## Review and simplification

Review mode: inline. No usable local delegated-review or simplification capability was exposed.
Reviewed the exact feature-worktree scope against `720cf2abfb3ec75198685a1ff4a91829904da036`,
including new files. Confirmed and fixed during review: derived ledger carry was outside the
packet bound; start-time edits could evade window identity checks; and the test receiver needed
an atomic reservation before its external launch. Added focused regression coverage.

Simplification mode: inline. Reused `nextStep`, wave deadline/report/window constants and the
existing usage counter/deduplication helpers. Used built-in SQLite instead of a file-lock
reclamation protocol or new dependency. Moved measurement code out of the evidence directory;
evidence remains text receipts. No change to shared instructions or product code.

## Not demonstrated

Actual Claude/Codex session death and restart, permission-dialog continuation, authenticated
cloud dispatch, ephemeral workspace deletion/replacement, machine reboot or power failure,
Temporal deployment/replay, remote ownership fencing, real scheduler catch-up, and provider
recovery/cache/planning comparisons. Local Claude auth status succeeded. Codex cloud CLI help
advertised submission/status/list; no target environment or lifecycle was qualified. App project
inventory exposed NoaCG as a local project. Viewing an existing paused heartbeat succeeded,
but no new heartbeat was armed and no wake firing was claimed.

## CI repair

[CI run 38929923054](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38929923054) passed its
Node tests and Factory gates but failed ESLint on an empty cleanup catch in the new test file.
Targeted local ESLint reproduced `run-supervisor.test.mjs:71 no-empty`. The catch now explains
the expected already-gone/no-worker cleanup case; behavior and assertions are unchanged.
Targeted ESLint over all three new scripts and the recovery tests passed after the fix.
This is repair attempt 1 on a new commit, not a same-commit retry or a weakened gate.
