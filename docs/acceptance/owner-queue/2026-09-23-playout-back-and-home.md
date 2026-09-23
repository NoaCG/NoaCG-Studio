---
kind: walk
date: 2026-09-23
because: taste
serves: now
---
# Playout has Back and Home, and they do different things

The production page's header has **← Back** and **Home** side by side. Back returns to wherever
you came from: the graphic in the editor, the creation wizard, or Home. It used to jump to the
productions list every time. When there is nowhere to go back to, such as a production opened
from a bookmark or in a new tab, Back goes to the productions list. Home always goes to the
dashboard.

## The route, under a minute

1. `/app` - open any graphic in the editor, and from its Control dock's **Productions** section
   press **Open production page →**.
2. On the production page press **← Back**: you are in the editor again. Press the browser's
   Forward, then **Home**: you are on the dashboard.

**What to look at.** That the two never surprise you. The browser's own Back button does the same
as ← Back. Branch `claude/intelligent-gates-rlo5fp`; `e2e/playout-nav.spec.ts` pins both.
