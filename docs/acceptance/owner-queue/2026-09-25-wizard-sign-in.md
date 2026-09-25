---
kind: walk
date: 2026-09-25
because: taste
---
# The wizard now says "Not signed in" and offers Sign in, beside Home

The creation wizard covers the whole studio, and it is where `/app` and the landing's "Start
creating" put a first-time visitor. Its header had Home and "+ New graphic" but no account
control, so a signed-out visitor had no word that they were signed out and no way to sign in or
make an account without leaving it first. The header now carries the same account control every
other bar has. Signed out, it says **Not signed in** with a **Sign in** button, and the dialog
that opens also creates an account. Signed in, it shows the profile button. Offline builds show
nothing, as before.

## The route, under a minute

Signed out, in a private window: https://noacg.studio/app (the wizard opens by itself).

## What to look at

- Top right of the wizard: **Feedback · Not signed in · Sign in · ✕**. Is that obvious enough
  for a student on a shared laptop, or should the button say "Sign in / Register"? It says
  "Sign in" today to match every other bar, and its dialog has "Create account".
- **Home** is still the second control from the left, on every step.

From branch `claude/noacg-bridge-feedback-cimjwc`. Pinned by `e2e/configured/anonymous.spec.ts`
("the wizard a first visit opens on says Not signed in ..."), which needs the configured suite.
The header height stayed at 53px at 1366, 1600 and 900 wide (measured with a stand-in backend).
