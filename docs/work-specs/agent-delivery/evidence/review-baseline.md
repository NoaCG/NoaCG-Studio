# Agent delivery review baseline

Date: 2026-10-15. Source build: `9a5e47db5` in an isolated review worktree. The later plan
preparation fetched `origin/main` at `0305d47d5`. This receipt describes the earlier review,
not a rerun on the preparation revision or proof of the deployed frontend.

## Source observations

- `CreationWizard.tsx` renders `wz-home` outside authentication conditions and navigates Home.
- `cli/src/commands/save.ts` saves a graphic; `pack.ts` sends a package awaiting Install.
- `api/_lib/me/packages.ts` returns an ID and the generic Productions URL.
- `api/_lib/me/agentKeys.ts` exposes a key view without its owning account identity.
- `src/backend/agentPackages.ts` returns an empty list on query errors.
- `src/packs/graphicsPack.ts` installs through `model/templateSet.ts`, saving library records
  before creating the production. The pending row is removed after installation.
- Downloads leads with plugin setup. The docs' longer starter prompt installs the plugin.

The supplied user-test handoff supports the delivery-state mismatch and later individual
saves. It does not establish lost backend records or wrong-account ownership. Its historical
commands were not executed and its customer graphics/resources were not read or changed.

## Navigation checks performed

Existing targeted journey:

```sh
npx playwright test e2e/wizard-shell.spec.ts --grep 'Home is one press from any step' --workers=1 --reporter=list
```

Result: 1 passed. It opens the wizard, advances into a template and uses Home to reach the library.

An ad hoc Playwright check (`node /tmp/noacg-home-check.mjs` in the review session) drove the
actual configured backend. It verified an existing disposable test-account login, created
a new temporary account through the wizard, and then logged into that new account in a fresh
browser context. For each signed-in case, Home was inside the viewport and opened Home at
1440, 768 and 390px: nine passing checks. Home was also visible on the fresh signed-out wizard.
The temporary account was removed through the admin cleanup path; cleanup reported success.

The managed proxy's CA was unavailable to Chromium, so an initial direct browser sign-in
failed with `ERR_CERT_AUTHORITY_INVALID`. The successful check forwarded only the configured
backend's HTTPS requests through Node fetch, retaining normal TLS validation. No certificate
checks were disabled. This transport adaptation is a test-environment detail, not a product fix.

The ad hoc script and browser data were temporary. No screenshot or test account is committed.
Phase 1 must move the maintained regression into an existing journey; no permanent regression
test or deployment evidence is claimed by this receipt. No product code changed in the review.
