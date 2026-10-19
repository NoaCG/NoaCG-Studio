# Account Sign in locator repair and normal gate restoration

Separate repair owner: `codex/repair-account-signin-gate`, in
`/workspace/NoaCG-Studio-account-gate`. Implementation window: 2026-10-19
15:30:27–17:30:27 UTC (18:30:27–20:30:27 Kyiv). The owner authorized a separate
repair and normal gate restoration in the independent check chat. This repair owner
built none of the Phase 2 implementation, and does not perform or claim independent
Phase 2 acceptance. The independent checker builds none of this repair.

Pinned starting source: `86e795dc9f66183633d7c99a73bea8c27e4e32f6`.
`account.spec.ts:58:78` checks a global exact Sign in button after deliberate sign-out.
Home and the account-save notice can both offer that button before the library is
released. The correction scopes the same visibility assertion to Home, retaining its
15-second timeout, every other assertion, all three case titles and all 24 existing
`expect` calls. No product source changes.

The owner explicitly authorized releasing this account quarantine after fixing the
cause. The proposed change uses `release`/`serializeStore` from
`scripts/e2e-quarantine.mjs`; the entry moves from `specs` to `released`, preserving its
entry count. Other quarantine entries, classifications, cases, skips, retry settings,
expected-run floor and suite budgets stay as found. The unrelated editor-keys
quarantine introduced by #1513 is outside this repair and remains an acceptance-side
owner decision.

## Historical evidence remains unchanged

- Repair #1487 merged as `b11adf155430c0f6888f524e16fa5ae599c28408`.
  Configured run `39252546204`, job `118059664098`, reported **107 passed, 1 flaky,
  3 existing skips**. Its account strict-mode failure then passing retry is not clean.
- Quarantine #1510 merged as `ec79ae58c5b6c10bbd57e68b7cc42cabd38536d5` after the
  preceding implementation deadline. That reclassification did not fix the locator.
- Readiness #1509 merged as `9294d250d67b6e274c7da7fac580bbb9f3391f73`; configured
  run `39255931088`, job `118071084143`, ran before #1510 with account unquarantined:
  **108 passed, 0 flaky, 3 existing skips**. That pass did not erase the earlier defect.
- Original runtime/capacity CI `39250656173` remains failed despite a passing retry.
  #1506 was closed; #1509 preserved its 32 cases and existing assertions. Those are
  engineering receipts, not acceptance of #1466.

## Verification recipe and current state

At this checkpoint the proof and landing are **pending**, not passing evidence.

Disposable proof branch: `codex/probe-account-signin-gate`, exact commit
`61e79019570697a95cad9e0085059f1a6b6386b4`. Its only changed file is
`.github/workflows/account-signin-fault-proof.yml`; it has no PR, land label or queue
entry. The workflow copies the existing configured-suite job's isolated backend
setup, CLI 2.111.0 pin, repository migration count, grants/publication assertions and
throwaway-account authentication. It adds no production credentials.

Run `39279909249`, job `118152031755`, is queued with no steps as of the checkpoint.
It runs each of these once with `--workers=1 --retries=0` and the integrity reporter:

1. The untouched original account test under a temporary two-second delay in
   `releaseLibrary`, immediately before `setLibraryAccount(null)`. Require precisely
   one failure at `account.spec.ts:58:78`, strict mode, matching Home and notice buttons.
2. The scoped assertion under the same fault. Temporary diagnostics explicitly require
   both buttons and log total 2, Home 1, notice 1. The original no-auth-modal assertion
   and every preceding account/password/sign-out assertion still run.
3. Restore product source, remove temporary diagnostics and run all three original
   account cases with the scoped assertion. Require 3 passed, 0 failed/flaky/skipped.

The workflow restores product and test files in `finally` and uploads the reports and
failure artifacts. The proof's initial queued run `39279813869` was superseded before
any steps after its logger was corrected to read both Playwright `message` and `stack`.
Cancellation was requested; force-cancel answered HTTP 409 because it was not running.
It has no test verdict.

Local commands and limits:

- `node scripts/cloud-network-preflight.mjs`: Git origin/main and Actions API PASS.
- `node scripts/execution-profile.mjs`: cloud, 4 CPUs, 16 GiB machine memory,
  2-worker ceiling, one browser job per VM; cgroup ancestor limits unreadable, so
  machine totals were used. Small/broader caps remain 5/12 minutes. No local full
  suite or production build was attempted.
- `node scripts/worktree-activity.mjs` reported no other work; no local main exists,
  so supplemented it with `origin/main...codex/check-editor-p2-independent-11` and
  worktree status. That branch has only the independent check's own documentation.
  Shared editor/save/store/router/saved-data/preferences/CSS reservations remain.
- `node scripts/e2e-affected.mjs --list --files e2e/configured/account.spec.ts
  e2e/quarantine.json`: configured-only coverage, no offline selection.
- `npx eslint e2e/configured/account.spec.ts`: PASS.
- `npx tsc --noEmit -p tsconfig.json`: PASS; the config includes product `src`.
- Exact comparison with the pinned original confirms three identical titles, 24
  existing assertions and the unchanged credentials skip; the sole semantic diff is
  the Home scope on the existing assertion.

Local backend setup did not reach tests. Unmodified Supabase CLI 2.113.0 start first
received Forbidden from `public.ecr.aws`, then used its built-in permitted ghcr.io
fallback without registry/proxy/policy changes. Docker's vfs layers exhausted the
32-GiB filesystem while extracting the database image. Only this attempt's processes
and nine newly created images were removed; no containers had started. Disk recovered
to 29 GiB free. The temporary product-source fault was restored byte-for-byte.

Two unchanged reached-gate attempts were interrupted at contract freshness's
`git check-ignore --stdin`. Minimal Node `execFileSync` with piped input also hung for
native `/usr/bin/git` and `/bin/cat`; bounded probes timed out (10/5 seconds). A shell
pipe to the same git command succeeds. This is an unresolved local worker subprocess
limitation, not a passing gate or product failure. No gate or Node implementation was
changed. ESLint and TypeScript completed. CI evidence is still required before a
passing `/check` and queue submission.

## Boundaries and ownership

This repair does not accept or close #1466. No Step 6 or Phase 3 work is authorized,
and no #800-retired helper or released skip is restored. Existing disclosed red
assertions and precise C-pull facts belong to the independent checker unchanged.

The active repair session is the sole repair/landing owner, with no durable wake
claimed, and remains responsible through exact-SHA terminal CI/post-land/configured
results. New implementation ends at the window deadline; after that only owned
terminal landing checks continue. Repairs are bounded to three attempts per failure
and never weaken checks or limits. Independent or out-of-scope product failures stop
for an owner decision. The independent checker remains blocked until this repair is
proved, normally classified and landed, and any other independent blockers have an
owner disposition.
