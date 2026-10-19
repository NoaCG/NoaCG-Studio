# Configured artifact and whole-log audit

Artifact 12204499974 was downloaded via the GitHub connector; SHA256 matches the owner-supplied digest. The CLI redirect returned Forbidden; no retry/bypass was used. The full workflow log was fetched successfully with `gh run view 39287816358 --log`.

## Workflow steps present in whole log

```text
Configured E2E (authenticated, local Supabase)	Set up job
Configured E2E (authenticated, local Supabase)	Run actions/checkout@v5
Configured E2E (authenticated, local Supabase)	Run actions/setup-node@v5
Configured E2E (authenticated, local Supabase)	Run ./.github/actions/node-modules
Configured E2E (authenticated, local Supabase)	Run ./.github/actions/playwright-chromium
Configured E2E (authenticated, local Supabase)	Run supabase/setup-cli@v1
Configured E2E (authenticated, local Supabase)	Start the local Supabase stack
Configured E2E (authenticated, local Supabase)	Export the local stack's URL and keys
Configured E2E (authenticated, local Supabase)	Assert the schema, its grants, and the realtime publication
Configured E2E (authenticated, local Supabase)	Create the test account and prove it can sign in
Configured E2E (authenticated, local Supabase)	Configured E2E suite
Configured E2E (authenticated, local Supabase)	Assert the suite actually ran
Configured E2E (authenticated, local Supabase)	Upload report
Configured E2E (authenticated, local Supabase)	Close the rolling issue
Configured E2E (authenticated, local Supabase)	Post Run ./.github/actions/playwright-chromium
Configured E2E (authenticated, local Supabase)	Post Run ./.github/actions/node-modules
Configured E2E (authenticated, local Supabase)	Post Run actions/setup-node@v5
Configured E2E (authenticated, local Supabase)	Post Run actions/checkout@v5
Configured E2E (authenticated, local Supabase)	Complete job
Configured quarantine	Set up job
Configured quarantine	Bot token
Configured quarantine	Run actions/checkout@v5
Configured quarantine	Post each quarantined spec's verdict on the commit
Configured quarantine	Post Run actions/checkout@v5
Configured quarantine	Post Bot token
Configured quarantine	Complete job
```

## Failure context

```text
2026-10-19T16:54:18.8445420Z   ✓   46 [configured] › e2e/configured/deep-link-boot.spec.ts:51:3 › deep-link boot › a signed-out deep link keeps its address @production (4.6s)
2026-10-19T16:54:20.3905852Z   ✓   47 [configured] › e2e/configured/deep-link-boot.spec.ts:70:3 › deep-link boot › a signed-out production link asks for a sign-in rather than calling it gone @production (1.5s)
2026-10-19T16:55:28.7793844Z   ✘   48 [configured] › e2e/configured/deep-link-boot.spec.ts:80:3 › deep-link boot › a production link opens once signed in from it, and an absent one names only the account (1.1m)
2026-10-19T16:55:42.6218938Z   ✓   49 [configured] › e2e/configured/deep-link-boot.spec.ts:80:3 › deep-link boot › a production link opens once signed in from it, and an absent one names only the account (retry #1) (13.0s)
2026-10-19T16:56:03.8066206Z   ✓   50 [configured] › e2e/configured/deep-link-boot.spec.ts:132:3 › deep-link boot › a graphic saved elsewhere opens on its link, however slow the pull (21.2s)
2026-10-19T16:56:13.4828324Z   ✓   51 [configured] › e2e/configured/deep-link-boot.spec.ts:195:3 › deep-link boot › a sync asked for during a pass waits for one that can see the new data (9.7s)
2026-10-19T17:14:29.8702776Z   1) [configured] › e2e/configured/deep-link-boot.spec.ts:80:3 › deep-link boot › a production link opens once signed in from it, and an absent one names only the account 
2026-10-19T17:14:29.8705937Z     Locator: getByTestId('production-missing')
2026-10-19T17:14:29.8709141Z       - waiting for getByTestId('production-missing')
2026-10-19T17:14:29.8712352Z     > 115 |       await expect(page.getByTestId('production-missing')).toBeVisible({ timeout: 60_000 });
2026-10-19T17:14:29.8715989Z       117 |       await expect(page.getByTestId('production-missing-account')).toHaveText(`You are signed in as ${E2E_EMAIL}.`);
2026-10-19T17:14:29.8717992Z         at /home/runner/work/NoaCG-Studio/NoaCG-Studio/e2e/configured/deep-link-boot.spec.ts:115:60
2026-10-19T17:14:29.8721094Z   1 flaky
2026-10-19T17:14:29.8722762Z     [configured] › e2e/configured/deep-link-boot.spec.ts:80:3 › deep-link boot › a production link opens once signed in from it, and an absent one names only the account 
2026-10-19T17:14:29.8724091Z   3 skipped
2026-10-19T17:14:29.8724505Z   107 passed (28.6m)
2026-10-19T17:14:30.7699122Z Ran 108 tests (107 passed, 0 failed, 1 flaky), 3 skipped.
2026-10-19T17:14:30.7702949Z Quarantined: e2e/configured/deep-link-boot.spec.ts failed.
2026-10-19T17:14:32.2698168Z [36;1m  gh issue close "$EXISTING" --comment "Configured suite green again at 929d1f1f1137297e8763745f5217b48ee0370e6c (108 ran, 3 skipped, 0 failed, 1 flaky (1 of them quarantined)): https://github.com/NoaCG/NoaCG-Studio/actions/runs/39287816358"[0m
2026-10-19T17:14:46.3630224Z   OUTCOMES: {"e2e/configured/deep-link-boot.spec.ts":"failure"}
2026-10-19T17:14:47.9220625Z ##[notice]e2e/configured/deep-link-boot.spec.ts: failed in quarantine
```

## Failed-attempt page snapshot

```yaml
- banner:
  - link "NoaCG Studio":
    - /url: /
  - text: Opening production…
- main:
  - paragraph: Looking for this production in your account…
  - button "← Back"
  - button "Home"
- complementary "Optional analytics":
  - strong: Help improve NoaCG
  - paragraph: Share five limited milestones - visits, return visits, signup, creation, and export - so we can see whether people successfully make and deliver graphics. No project content, prompts, advertising, or marketing attribution. Kept for 90 days.
  - link "Privacy details":
    - /url: /privacy
  - button "No thanks"
  - button "Allow"
```

The failed attempt has only error-context.md. The trace belongs to retry 1, which passed. It contains no pageError events and no error/warning console records; it cannot establish the failed attempt’s sync state.
