# Three defects from the Friday rehearsal, still open on the dashboard

**Filed:** 2026-09-24, out of `docs/handoffs/2026-09-21-g2-dashboard-demo-defects.md` ("Left, and
why"), which named them under row E's "For row G" list (items 6 to 8 of
`docs/handoffs/2026-09-21-e-demo-rehearsal.md`) and left them for a later row. Neither g2 nor
row G (`claude/g-hosted-control-parity`, hosted `» Next` / `✎ Update` parity) touched them; this
file is what replaces the handoff's pointer to them once that handoff is deleted.

## Why

Row E's live rehearsal on `https://noacg.studio` found three things a student would notice on the
in-app dashboard that no later row has picked up. None of the three blocks anything that shipped
so far; all three are copy or plumbing gaps an operator would read as "the app is confused."

## The three items

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
3. **Row C's open finding: Reveal from a reloaded hosted tab is still the one hosted defect
   known.** Row E's walk carried row C's workaround rather than re-investigating it. This is the
   one hosted (not in-app) item of the three, and it needs the configured suite or a live account
   to chase - the same ceiling every hosted-page defect in this family hits
   (see `docs/backlog/hosted-cold-boot-specs-still-stick-for-their-whole-timeout.md` for the
   general shape of hosted defects that only reproduce against a real backend).

## What it would take

Items 1 and 2 are copy/design decisions on the in-app dashboard (`src/components/home/ProductionPage.tsx`
and `docs.html`) - cheap once someone picks an answer. Item 3 needs a session with the configured
suite or a live hosted production, reloading a tab mid-reveal and reading what the renderer reports
versus what the dashboard shows, the same technique `docs/backlog/hosted-cold-boot-specs-still-stick-for-their-whole-timeout.md`
used to separate a real defect from a rehearsal artefact.
