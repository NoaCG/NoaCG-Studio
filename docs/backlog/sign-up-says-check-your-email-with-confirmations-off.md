---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
---
# The sign-up dialog tells every new account to check its email, and there is no email

**Filed:** 2026-09-09 by `claude/g-demo-25-september`, found by its review while writing the
accounts beat of `docs/DEMO_2026-09-25.md`.

## Why

Email confirmation is off, decided and verified live on 2026-08-24: `docs/DEPLOYMENT.md`, "Email
confirmation is off" (`GET /auth/v1/settings` returns `"mailer_autoconfirm": true`), and
`supabase/config.toml` `enable_confirmations = false` with the rationale. A new account works at
once.

`src/components/auth/SignInDialog.tsx` line 115 still says, after every sign-up, "Check your
email to confirm your account, then sign in." A student in the room on 2026-09-25 goes to an inbox
for a message that never comes, and anyone driving the UI to check whether confirmations are on
concludes they are.

## What it would take

Replace the note with what actually happens (signed in, or "sign in with the password you just
set"), and pin it in `e2e/auth.spec.ts`, which already covers the dialog's offline posture. If a
deployment ever turns confirmations on, the note has to read the auth settings rather than assume;
that is the reason to make it a computed string rather than a fixed one.

## Evidence

`src/components/auth/SignInDialog.tsx:115`; `docs/DEPLOYMENT.md`, "Email confirmation is off";
`supabase/config.toml:53`.
