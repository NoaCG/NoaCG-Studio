---
v: 2
source: derived
kind: finding
raised: 2026-09-25
state: unstarted
found: "at 1366x768 the production page's top bar shows the production Quiz Night as Quiz ..., so a two-word name of ten characters does not fit"
serves: NOW
size: small
touches: src/components/home/ProductionPage.tsx
covered-by: e2e/productions.spec.ts
needs-owner: none
---

# The production top bar cuts a two-word production name

On https://noacg.studio at commit 60b3e8d1 on 2026-09-25, logged out, at 1366x768 (a common
school laptop), the production page's top bar shows the production "Quiz Night" as "Quiz ...".
A five-letter name ("Probe") fits. The bar also holds Back, Home, + New graphic, the publish
chip, Start production, the clock, the Playout, Data and Audience tabs, Playout, Export and All
out, so the name gets what is left. Judged from the screenshot that is about 40 px, which wants
measuring before the fix.

The name is the one thing on that bar that says which show is open. With a class of students each
running their own production, "Quiz ..." on every screen does not tell the teacher which one they
are looking at. Give the name a minimum width that fits a two-word name, or move the lower-priority
buttons into a menu below some width, and pin it at 1366 and 1280 in a spec.

Screenshot: `docs/handoffs/2026-09-24-j-classroom-live-walk/13-rundown-five-cues.jpg`.
