Protocol only; nothing executed or changed.

Same native actor/action13. Owned feature worktree remains clean at **`62e4523eba23696960bb2c50f68bab2b9ba4e1c5`**, branch `codex/plan-editor-r1-5-e5f-blank`, path `/workspace/noacg-editor-r1-5-e5f-blank`. Queue commit `f2954d1c2c94e412c71707a6d928e17228f48267` has the identical tree `a3a17568bf8ec0a57471e3036aac75b235992318`.

I read the complete causal verdict and both whole gzip logs. The original API test lost its execution context before retention assertions; the retry job refused application execution. Neither establishes a cause. The historical DEV-mode failure establishes an earlier occurrence of the symptom, not equivalent conditions or cause.

Proposed bounded collection:

- **Base:** exact `3b06afdf39905ea728d2fd846de3ed7b7bbb7dd0`, in a later-created owned worktree `/workspace/noacg-editor-r1-5-e5f-blank-built-control`, branch `codex/plan-editor-r1-5-e5f-blank-built-control`. Both path and branch are currently absent.
- **Feature:** existing clean `62e4523e` worktree.
- **Maximum:** two sequential queued jobs, **one worker and five-minute cap each**; one `build:e2e` bundle and ten initial samples per head. Base first. Any failure stops the collection pending root review, including before starting feature.
- Only the unchanged named API case, with every original assertion and helper preserved. No suite, dev fallback, provider calls, retries, source repair or automatic additional sampling.

The unchanged 3,601-byte external-door test block has SHA256 **`c5d59a5ada6beaa13001416e507dda255bcdc569eb64e25de57aba62f16f1d6e`** on both heads. `_authoringProject.ts`, `_durable.ts`, Playwright/Vite configuration, lockfile and `deploySkew.ts` are also identical.

No `dist` or `dist-e2e` exists in the owned feature worktree, so this proposal requests **two E2E builds**, not reuse of an unqualified artifact. `build:e2e` is only `vite build --mode e2e`; it does not perform normal-build checks. Installed Playwright is **1.61.1**, matching CI. Cloud Node **24.19.0** differs from CI **24.22.2**.

After separate admission, each head would run this command through the queue from its own worktree:

```bash
node scripts/jobs.mjs add \
"CI=1 NOACG_E2E_ON_BUILD=1 NOACG_E2E_EXPECTED_SPECS=editor-projects.spec.ts DEBUG=pw:api npm run test:e2e -- --config=e5f.local/built-api-diagnostic/playwright.config.ts e2e/editor-projects.spec.ts --project=chromium --workers=1 --retries=0 --repeat-each=10 --max-failures=1 --grep 'external draft is durably retained through project api$' --output=e5f.local/built-api-diagnostic/results" \
--cap 5
```

The proposed ignored configuration would inherit the maintained configuration, including its original build/preview command, offline environment pins, global guard, integrity reporter, browser project and timeout bounds. It would preserve the `webServer` array and set its working directory to the worktree root. Relative configuration paths would resolve to that same root. Trace mode would be `on`, retaining the existing `snapshots:false`; **`NOACG_E2E_TRACE` would remain unset**.

One small passive observer fixture is justified because standard trace/API logging alone may miss `vite:preloadError` and explicit crash/disconnect classification. Following the existing alias pattern, it would import directly from `playwright/test`, leave maintained tests untouched, and record:

- Main/child-frame navigation, request failures, console errors and page errors.
- Page crash/close and browser disconnect.
- Document identity plus `pagehide`, `beforeunload` and `vite:preloadError`.

It would add no waits, retries, application calls, state writes or event cancellation. Teardown would be marked separately; observer errors or overflow would make the evidence incomplete. No tracing framework or additional probes are proposed.

Before execution, qualify exact-lock dependencies and owned cache/output I/O, record source/config/fixture hashes and assigned ports. Feature’s existing port record is **5240**; control’s port must be assigned and recorded after its worktree exists. Do not borrow old-source bundles or dependency links.

Retain the complete queue logs, traces, failure screenshots, per-sample observer records, build/source/lock manifests and actual execution count in each owned `e5f.local/built-api-diagnostic/` directory. No original trace download retry is proposed.

**Interpretation:** ten samples per head provide a small bounded opportunity to collect the symptom, not a rate comparison. Zero failures remains **INCONCLUSIVE**. Isolation omits the original shard’s preceding workload; tracing adds overhead, and Cloud differs from the CI host. No outcome alone waives the red edited-spec gate or authorizes a patch.

Stopped awaiting root’s explicit command/count/cap admission.