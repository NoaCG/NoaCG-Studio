---
kind: decision
date: 2026-09-01
needs: account
---
# Google sign-in and email confirmations, whenever you want them

**When to decide.** Whenever you choose; nothing waits on it. You parked it on 2026-09-04: *"let's
do the Google auth later. That can remain on the to-do list, but there is no hurry for that."* On
2026-09-05 you kept email confirmations off and Google sign-in off.

**Why it is yours.** Both are settings in consoles only you hold: a Google Cloud OAuth client, and
Supabase's Authentication settings.

**The one ordering rule.** Supabase links identities by email address. With confirmations off, a
person who signed up with a password and later presses "Continue with Google" on the same address
loses the password (the account and the work survive). So turn confirmations on before or with
Google sign-in. Custom SMTP, which confirmations need, has been live and verified since 2026-09-04.

**What it takes.** About twenty minutes of console work: the steps are in `docs/DEPLOYMENT.md`,
"Google sign-in". An agent then flips `GOOGLE_SIGN_IN_ENABLED` in
`src/components/auth/SignInDialog.tsx`. Delete this file once it is done, or if you decide against
it.
