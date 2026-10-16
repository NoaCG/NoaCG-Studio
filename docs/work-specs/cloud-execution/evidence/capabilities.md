# Provider capability boundary — corrected 2026-10-16

This dated consolidation supersedes the earlier pre-#1305 capability assessment.
Historical measurements and cloud-landing-recovery qualifications remain unchanged.

| Capability | Codex | Claude |
|---|---|---|
| Native cloud coordinator | Current supported UI task; exact source and nonce recorded in continuation receipt | session_01UXXD4v5EXZAvPUVYAtsL5e |
| Native cloud child | Unverified: CLI endpoint returns 401; no submission | session_016cz59FTGY7bf8s7n7v3PvX, exact measurement SHA/environment/nonce confirmed |
| Follow-up and result transport | App follow-up received here; CLI has status/diff/apply but no follow-up command; child transport unverified | Native send_message, transcript/status inspection and fetched git receipts qualified |
| Local CLI launch | Failed before task creation; current UI fallback is separate evidence | session_01VFZtobiuJn6zpcu5Dz7Wi3; no nonce or pinned SHA in this local probe |
| Click-free landing | Reuse unchanged cloud-landing-recovery implementation | #1305 exact-head auto-merge and merge queue, with post-land receipt |
| Recovery | Reuse prior qualified one-shot wakes; no new native recovery claim | Reuse prior idle/reclaimed-container qualification; active check-ins do not establish all durable recovery obligations |

Both providers' measurements are committed at the same historical application baseline
4d55cf52585bb220d8d12d12f42140c76b315cc4. See measurements.md,
codex-measurements.json, claude-measurements.md and claude-measurements.json.
Failed/incomplete cohorts remain failed/incomplete. No repeated benchmarks are needed.

The owner-supplied canonical Codex binding is preserved in
`contracts/rules/root/work-feature-branch-own-worktree-made.md`, compiled into
the root adapters loaded by every agent; it is not replaced by runtime metadata.
The current runtime binding differs. The coordinator UI receipt establishes the
same saved source_config_id across revisions 2 and 3; the exact historical runtime
ID to CLI mapping remains unproven. Matching repository or labels alone cannot
qualify the exact binding. See continuation-20261016.md for actual metadata and blockers.

AC-2 approval and implementation, Codex's part of AC-3, uncertain native submission,
coordinator reconnect/restart, full filesystem reconstruction, observed bounded wake
and re-arming, and remote repair-owner fencing remain open. PR #1307's inert Node
control tests do not close them. Preserve exactly one acknowledged repair owner,
including no-webhook conflict checks. No archived revival or indefinite monitor claim.
