---
kind: walk
date: 2026-09-24
because: direction
---
# Graphics are account-bound: a second account on the same browser sees only its own work

**Date:** 2026-09-24 · **Branch:** `claude/jolly-maxwell-6jcsme`

## What changed

A new account signed in on the same browser used to open Home onto the previous account's
graphics and productions. The browser kept ONE local library whoever was signed in, and the new
account's first sync then copied those graphics into its own cloud under fresh ids. Now every
account keeps its own library on the device, only the signed-in account's is shown, and sync
never copies a record that belongs to another account.

- **Sign out** returns the studio to an empty signed-out workspace. Your library stays on the
  device and comes back the moment you sign in again.
- **Signing in with a different account** reloads the page onto that account's own library.
- **Work made before signing in** becomes the account's when you sign in, as before.

## The route, under a minute

1. On noacg.studio, `/app` signed in to your main account: Home shows your graphics.
2. Account menu -> **Sign out**. The page reloads; Home has none of your graphics.
3. Sign in with the second account. Home shows only that account's graphics.
4. Sign out, sign back in to the main account: everything is where you left it.

## What to look at

- **The test account already holds copies.** The copies the old sync made before this fix are
  real rows in the second account now, under new ids. Delete them there once (Home -> select ->
  Delete); the main account is untouched.
- Whether the reload on sign-out and on an account switch is acceptable. It is what guarantees
  nothing of the previous account is left in memory.

## Decided, so you can overrule a thing that exists

- **An expired session keeps the library on screen.** Only your own Sign out puts it away, so a
  dropped session never snatches work in progress; a different account signing in still switches.
- **Signed-out work meets an account that already has a library on this browser through the
  cloud:** it is uploaded to the account and pulled back in. The unsaved working draft stays in
  the signed-out workspace rather than overwrite the account's.
