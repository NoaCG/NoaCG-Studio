# NoaCG product brief

Read-only replacement for the retired admin dashboard, approved 2026-10-17. Send the owner
one compact weekly report in this private chat. Routines report; implementation sessions write.

1. Read this procedure and `scripts/admin-report.sql` from current `NoaCG/NoaCG-Studio` main.
   Use the connected GitHub app when a fresh checkout is unavailable. Never run an old cached
   query after its schema has changed. Query the connected Supabase project **NoaCG Studio**
   with that SELECT, or run it with `psql "$NOACG_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f
   scripts/admin-report.sql` on a trusted machine. Do not print connection strings or secrets.
2. Lead with new external accounts and active accounts, compared with the preceding seven days.
   Distinguish external activity from internal testing. Include graphics made, exports, AI
   successes/failures/declines, cloud render failures and overdue jobs. Show Lite spend and
   managed gateway spend separately: do not assume these ledgers are independent billable totals.
   Flag new feedback and the entire unresolved backlog, even when its entries are older than the
   reporting window. Counts and categories suffice; no emails, user ids or feedback text in the
   routine. State that feedback/quality totals include internal accounts. Mention disabled
   features/routes, expiring grants and operator changes when they need attention.
3. Read current `api/_lib/aiModelCatalog.ts`, `docs/AI_TASK_REGISTRY.md`, and the harness plan
   under `docs/work-specs/harness-ladder/` if present. Research provider release notes and current
   model documentation for coding, graphics/image and video models released or materially changed
   in the past seven days. Recommend at most three concrete candidates for the NoaCG graphics
   harness: model id, availability, pricing if published, why it fits, and a small proposed test.
   Cite dated primary sources. Distinguish an announced model from an API available for testing.
   If none is relevant, say so. This is separate from the existing agent-orchestration tooling
   brief; don't repeat Claude Code/Codex/worktree news. Never run paid benchmarks or promote models.
4. Read current GitHub main CI and configured/nightly run status. Link unresolved failures or
   missed runs that matter to the product; avoid repeating resolved alarms from the morning brief.
   Keep issue #800 visible until its live-feature coverage has been migrated or accounted for
   during the lean-code run; it follows isolated shell removal and precedes old helper deletion.
5. End with any action needed and the next scheduled reporting date. Explicitly label missing
   access, missing telemetry, failed queries and stale evidence. A query error is never zero
   users, zero spend or a healthy system. Reports cannot measure untracked local export failures
   or activity from opted-out/self-hosted users. A weekly report is not incident detection;
   existing health/CI alerts and daily routines continue. Do not write files, change access,
   mutate database rows, file issues or send email. Give one next-session prompt when useful.

The SQL returns aggregate data only. The owner can request a focused private session to inspect
feedback or an individual account and make audited changes using `docs/ADMIN.md`.
