# Defects from the Friday rehearsal, still open on the in-app dashboard

**Filed:** 2026-09-24, out of `docs/handoffs/2026-09-21-g2-dashboard-demo-defects.md` ("Left, and
why"), which named them under row E's "For row G" list (items 6 and 7 of
`docs/handoffs/2026-09-21-e-demo-rehearsal.md`) and left them for a later row. Neither g2 nor
row G (`claude/g-hosted-control-parity`, hosted `» Next` / `✎ Update` parity) touched them; this
file is what replaces the handoff's pointer to them once that handoff is deleted.

## Why

Row E's live rehearsal on `https://noacg.studio` found two things a student would notice on the
in-app dashboard that no later row has picked up (items 1 and 2). Neither blocks anything that
shipped so far; both are copy or plumbing gaps an operator would read as "the app is confused."
Item 3 joined them from the hosted fix of the rehearsal's third item, a Reveal from a reloaded
hosted tab.

## The items

1. **"Reveal choice" is a disabled button the docs never mention.** `e2e/dashboard-operator-walk.spec.ts`
   already pins that it greys with the title "Reveal choice does nothing from where the graphic is
   now, so it is greyed out" (the quiz's hidden-pick road, `docs.html#quiz-run`), but nothing in
   the docs tells a student the button exists or why it starts disabled. Either the docs gain a
   line about it, or the button is hidden entirely until its road is legal.
2. **The activity log is empty after a reload of an unpublished production.** This is already the
   documented, tested behaviour (`e2e/dashboard-operator-walk.spec.ts` pins
   `action-log-empty` reading "not published, so the list starts empty each time the page opens"),
   so this item is about whether that design is the right one for a class that reloads mid-show,
   not about a bug. Row E's note: "if that is by design, the log's empty line could say so" - which
   it now does; what is still open is whether the design itself should change for a student
   audience.

3. **The in-app dashboard's PROGRAM monitor may rebuild a stale picture after a reload of a
   published production.** Found on 2026-09-27 while fixing the same thing on the hosted control
   page, not seen on the in-app page itself. The renderer reports its state 800 ms after its last
   change, so a page reloaded straight after a press reads the report from before it. The hosted
   page now replays the log rows after each report's baseline (`HostedControlPage`
   `bootReplay`, the renderer's own rule in `src/control/outputRecovery.ts`), which configured
   run 36281126714 showed it needed: without it the monitor came back on the previous
   question's reveal. `ProductionPage.tsx`'s `restoreProgram` still rebuilds from the report
   alone. Reproduce it with the report hold in `e2e/configured/hosted-reveal-after-reload.spec.ts`
   pointed at the dashboard before changing it.

## What it would take

Items 1 and 2 are copy/design decisions on the in-app dashboard
(`src/components/home/ProductionPage.tsx` and `docs.html`) - cheap once someone picks an answer.
Item 3 is the hosted page's replay moved into a shared control module and used by both
monitors.
