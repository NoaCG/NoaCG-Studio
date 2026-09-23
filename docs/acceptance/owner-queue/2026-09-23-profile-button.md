---
kind: walk
date: 2026-09-23
because: taste
---
# The account control is a profile button, and Settings lives in it

Signed in, the small round avatar in the top-right corner is now one pill-shaped button with your
first name, your picture and a ▾, opening Home, **Settings**, **Downloads** and Sign out. With it
there, Home's separate sliders button stands down, so Settings has one door. Signed out, or on a
build with no accounts, the sliders button stays, because Settings must never need an account.

Under 1480px the name hides and the button is the round avatar at its old size, because the
topbar's width at laptop sizes is measured and pinned (`e2e/configured/signed-in-ux.spec.ts`), and
the ▾ appears from 1600px. Those two steps are where a wider control would have pushed the bar
onto two rows.

## The route, under a minute

1. <https://noacg.studio/app#/home> signed in, on a window wider than 1480px - the top-right corner.
2. Press it: Home, Settings, Downloads - Bridge & CLI, Sign out.

**What to look at.** Whether it reads as "my account and settings" at a glance, and whether you
miss the sliders button signed in. Branch `claude/intelligent-gates-rlo5fp`.
