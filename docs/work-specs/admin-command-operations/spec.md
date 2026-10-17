# Retire the admin dashboard

Owner approval, 2026-10-17: remove the admin page altogether, operate through commands and
sessions, and deliver important information through routines. Simplicity and iteration speed
take priority over speculative future UI. A roles page can be built when staff actually need it.

## Scope and acceptance

- Remove the standalone admin entry, all dashboard components/styles/types, its private HTTP
  handlers and dev middleware. They have no remaining client. No replacement dashboard or
  parallel authorization system.
- Preserve deployed data, migrations/RLS, shared entitlement and feature enforcement, community
  moderation, and the append-only audit log. Keep the service client used by live access loaders.
- Preserve `scripts/admin.mjs list|grant|revoke`. Other operations use authenticated Supabase
  sessions and the documented tables, with explicit readback and an audit row in the transaction.
- Replace the dashboard report with a single read-only SQL query over existing database
  aggregates and a scheduled private product brief: users/activity, spend, failures, feedback,
  current access/operational concerns and new model candidates for the graphics harness.
- No changes to editor/store, save formats, AI harness, catalog templates or old-editor files.
  #800 stays open: migrate or account for live-feature coverage inside the lean run, after
  isolated shell removal and before deleting old test helpers. It does not block this removal.

## Test maintenance

- e2e/admin.spec.ts: owner retired the admin UI and HTTP endpoints; remove their 33 declarations and fixtures, retaining the live offline entitlement/catalog regression in the same file. Shared access resolution remains covered by api/_lib/entitlements.test.ts, api/_lib/templateVisibility.test.ts and scripts/admin-security-migration.test.mjs. No live-product skip is deleted under #800.

Remove the Node tests of the retired HTTP gate, dashboard reporting periods, model eligibility
presentation and usage aggregation with their only subjects. Existing database aggregation and
privilege migration checks remain. Planner tests drop the deleted middleware from their mapping
examples; entry-risk coverage uses the live join entry instead of the removed admin entry.

## Checks

Targeted: TypeScript (app/API), changed-file eslint, e2e planner, copy baseline, e2e protection,
tree/architecture/contracts, Vercel routes/function budget, migration privilege tests and shared
entitlement/visibility tests. Execute the read-only report against the real connected database
and verify its window, scope and missing-data behavior. Full build and affected browser suite
run in GitHub CI; root configuration changes correctly escalate selection to the full suite.
Check production `/admin` and the retired API after deployment, and live `/app`/entitlement.

## Measurements and limits

Pre-removal at 7bd9f79cd: admin frontend 4,371 TS/TSX lines plus 656 CSS, backend 3,204 lines,
direct Node tests 1,179 lines and e2e 1,052 lines. These are subsystem totals, not promised net
deletions: shared loaders and enforcement remain. The admin entry's shipped JS/CSS were about
102 KB raw / 26 KB gzip; the main app did not load them. Primary saving is maintenance surface,
with one fewer serverless function and one fewer build entry. No ordinary-app bundle or large
CI-speed claim. Report exact diff totals after verification.

## Verification receipt

Checked on 2026-10-17 against main 7bd9f79cd. Review/simplify/verify ran inline. Review retained
the cache-reset seam used by live visibility tests, replaced legacy feedback-output links to
the removed page, and made the report include reviewed-but-unresolved feedback as well as new
items. Shared access tests: 44 pass; migration/execution-profile tests: 45 pass; feedback privacy
and output tests: 26 pass; e2e planner: 87 pass. App/API TypeScript pass. Vercel routing accepts
the config; routed functions decrease from 13 to 12 without changing the cap. Copy baseline
regeneration produces no diff. No database mutations were made; the report SELECT succeeds
against the connected production project. Live aggregates stay in private chat, outside git.

The Codex product brief is enabled for Tuesday mornings in the owner's existing personal
timezone, starting 2026-10-20. Tool readback confirms it targets this Codex chat. GitHub and
Supabase read access were checked before creation. Scheduled delivery has not yet occurred.
Unknown cloud ancestor limits leave the full build/browser run to GitHub CI as required.
The API-depth gate also scans comments; removed its stale admin-route example from the Pro
contract without changing any model route or runtime behavior.
