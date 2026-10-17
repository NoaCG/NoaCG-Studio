# Provider-native continuation and bounded recovery

Owner corrections in #1301 and the current coordinator brief supersede the original
runbook. Laptop-closure probes are dropped. Reuse Claude measurements, native launch,
follow-up/git transport and #1305 click-free landing; do not repeat successful probes.
Each provider launches its own workers in existing environments and subscriptions.

1. Read AGENTS.md and current #1301 receipts. Inspect remote branches and worktree
   activity; preserve another session's files. Fetch, then use an owned feature
   worktree at the explicitly supplied full SHA. Never silently qualify another SHA.
2. Record native ID, provider binding, source, dirty paths, UTC time and nonce.
   Keep the canonical saved Codex binding in capabilities.md unchanged. Establish
   its relationship to the current runtime through supported provider metadata;
   matching labels is insufficient. Wait for runtime readiness before repository work.
3. Inspect installed CLI help and normal authentication without printing credentials.
   Use the managed proxy and supported network permissions. On endpoint/auth denial,
   record it and stop; do not bypass the proxy, replace credentials or retry a denial.
   Current blocker and exact endpoint are in continuation-20261016.md.
4. Before any submission retry, inspect native task IDs/status and the nonce. Unknown
   delivery is not permission to create another task. Launch at most one child only
   after binding/access qualification. Verify its exact SHA, native ID, environment,
   useful result and completed status. An acknowledgement alone is insufficient.
5. Reconnect to the same task and preserve results through supported native artifacts
   or a pushed owned branch. CLI status/diff/apply do not imply a follow-up operation.
6. For recovery, reuse existing wave/plan/job/landing state and #1307 helpers; do not
   install another scheduler or credential path. Record an immutable owner window,
   one repair owner and its attempt count. Prove a real wake resumes repository,
   whole failed-log, push/check/queue capabilities, then observe bounded re-arming.
   Inspect base conflicts even without webhooks. Reuse reclaimed-container evidence
   only for its demonstrated scope; new filesystem reconstruction remains separate.
7. With no proven durable wake, remain active through merge and post-land results.
   Land through /check and /queue-merge. Stop wakes at terminal state/window expiry;
   do not claim archived revival or indefinite monitoring.

Numerical policy approved in #1301 comment 6223002051 (execute via the canonical verify workflow):
small affected browser selection <=5 minutes; one relevant broader selection or
maintained shard <=12 minutes; <=4 browser workers with lower executing-worker
limits respected; unknown limits permit conservative targeted work only. Build only
for bundle/dependency/entrypoint/packaging risk, once per reviewed source state,
<=5 minutes Codex or <=10 minutes Claude. Avoid checks duplicated by the build;
docs/copy need no build unless build inputs. Larger selections stay in GitHub Actions.
The canonical verify workflow, shared resource helper, planner and job queue implement these defaults.

Claude local launch automation must omit CLAUDE_CODE_OAUTH_TOKEN from the child
process while preserving the parent's configuration. Normal claude.ai login worked;
the override previously caused pre-submission HTTP403. This is separate from Codex.
