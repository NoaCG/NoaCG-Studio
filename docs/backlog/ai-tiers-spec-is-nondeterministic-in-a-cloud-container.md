---
v: 2
source: derived
kind: finding
raised: 2026-09-06
state: unstarted
found: "`e2e/ai-tiers.spec.ts` fails a DIFFERENT, RANDOM subset of its own tests on each run in a
  cloud container - including two runs on the same tree - always at the same line, the
  `expect(page.locator('.wz-modal')).toBeVisible()` in its `openAiSettings` helper. Measured on the
  night wave of 2026-09-05/06 while gating the AI-door row."
---
# The AI-tiers spec fails a different subset every run in a cloud container

## Why

It cost a real diagnosis on the 2026-09-05/06 night wave and will cost the next one the same,
because the failure LOOKS exactly like a regression in whatever row last touched the AI door. It is
not one, and here is the measurement that says so.

Three runs of `npx playwright test e2e/ai-tiers.spec.ts` in the same container within ten minutes:

| tree | result |
| --- | --- |
| `f588e10` (BEFORE the AI-door row) | 4 failed, 2 passed |
| `379d67f` (AFTER it, 7 tests) | 6 failed, 1 passed |
| `f588e10` again, unchanged | **6 failed, 0 passed** |

The same commit produced two passes and then none. So the subset is not a function of the code, and
the branch under test is no worse than its own base. Every failure is the same assertion in the
shared `openAiSettings` helper - the wizard modal not visible after `page.goto('/app')` - which is
BOOT, before anything the spec is about.

Sibling finding, same night, same shape:
`docs/backlog/hover-highlight-spec-red-in-a-cloud-container.md`.

## What it would take

1. Decide whether `/app`'s boot is genuinely slower than the assertion allows under a container's
   CPU, or whether the mocked `**/api/ai/*` routes change the boot path this spec waits on. The
   BOOT WATCHDOG in `app.html` and `durableStoreHealth`'s 4 s localStorage fallback are the two
   places a slow boot is already known to change behaviour (root `AGENTS.md`, "Gotchas").
2. If it is timing, the fix is in the helper - wait for what the page actually settles on - not a
   longer global timeout, which hides the next one.
3. Until then, a red `ai-tiers` on a container row is not evidence about that row. Re-run it on the
   base commit before believing it, which is what this file exists to save the next session.

## Evidence

The three runs above, on the night wave of 2026-09-05/06. The other three specs gated that night -
`docs.spec.ts`, `wizard-brand.spec.ts`, `import-svg-behaviour.spec.ts` - passed 37 tests in the
same container in the same window, so the container is not simply unable to run Playwright.
