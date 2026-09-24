# The agent-access configured spec has been red since the package door landed

**Filed:** 2026-09-24. **Source:** build feedback (configured-suite and hosted-latency runs, issue #403)

## Why

The configured suite is the only automated check on the signed-in agent-access flow: consent,
loopback code, redeem, save, deep link, and revoke. While it stays red, every landing's
configured verdict reads "1 failed", so a second regression in the same suite would hide behind
this one. It also means nothing is currently proving that a revoked agent key stops working.

## What it would take

Reproduce from the failed run's `error-context.md` and trace. The spec times out at
`e2e/configured/agent-access.spec.ts:208`, `page.getByTestId('account-button').click()`, in step 5
("Settings lists the key; Revoke ends it"), on the first attempt and on retry. It was green at
`7baefbb29` (configured-suite run 36020575446) and red from `18aa69c02` (run 36029912722), the merge
of pull request #402, which added the package door (`0065_agent_packages.sql`,
`api/_lib/me/packages.ts` and an Install row on Home -> Productions). The likely cause is the
deep link now landing on a surface without the topbar account button, or something new covering it.
Fix whichever is wrong, the product or the spec, and close #403 when `main` is green again.

## Evidence

- Local stack: run 36029912722 on `main` and run 36040085954 on
  `claude/close-control-events-public-e26dfa`, both "53 ran, 52 passed, 1 failed", the same spec.
- Hosted staging: run 36040090428 fails the same step.
