---
kind: walk
date: 2026-09-23
because: taste
serves: now
---
# Playout has Back and Home, and they do different things

The production page's header has **← Back** and **Home** side by side. Back returns to wherever
you came from: the dashboard, the productions list, or the graphic you were making. It used to jump
to the productions list every time. When there is nowhere to go back to, such as a production
opened from a bookmark or in a new tab, Back goes to the productions list. Home always goes to the
dashboard.

## The route, under a minute

1. `/app#/home` - open a production from the dashboard, then press **← Back**: you are on the
   dashboard again, not the productions list.
2. **Productions** in the left nav, open the same production, press **Home**: the dashboard. The
   browser's Back returns to the production, and **← Back** there returns to the productions list.

**What to look at.** That the two never surprise you. The browser's own Back button does the same
as ← Back. Branch `claude/intelligent-gates-rlo5fp`; `e2e/playout-nav.spec.ts` pins both.
