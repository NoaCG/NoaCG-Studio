# OS4: Clocks, evidence

Acceptance AC-7 and AC-8 (`docs/work-specs/obs-scenes/spec.md`). Rules R1 to R16 are in the spec's
phase notes. Simulated checks only, on Playwright's clock: nothing here is OBS hardware proof.

**Graphics made before this lands need Update.** A production's graphic is its own copy of the
template (`src/model/library.ts` `templateForSavedGraphic`), so an existing sponsor rotation or
start-time countdown keeps today's behaviour until its design is refreshed with Update.

## Per clause

| Clause | Changed behaviour | Proof |
| --- | --- | --- |
| AC-7: two pages loaded at different times show the same logo at the same moment | `src/templates/cornerBug/bugRuntimes.ts`: cycle `floor(Date.now() / P)` of the machine's own length picks the slot; while the rotation's timer is armed the runtime replaces it and fires the crossfade so its midpoint lands on the boundary (R1, R3, R4) | `e2e/sponsor-rotation.spec.ts` "two copies": the second copy is taken 2 s before a boundary; at the middle of four cycles and 0.6 s before each boundary both show the wall clock's slot |
| AC-7: a page hidden and throttled for a minute rejoins within one change | The page's own late timer is never trusted; the first read after it runs again (or the visibility event) fires the crossfade to the current cycle (R3, R5) | same file, "throttled for a minute": a 61 s jump of the system time with no timer run, then the visibility event; shown slot equals the wall's within 0.7 s and for three cycles after |
| AC-7: a crossfade stalled while hidden (reads go on, drawing stops) | Its midpoint shows the current cycle's partner, not the one it was fired for | same file, same test: GSAP's global timeline paused for 2.25 cycles, then resumed; the shown slot is the wall's |
| AC-7: a reloaded page rejoins within one change | A reload's recovery snap (timers on) arms the timer; the runtime joins and the next boundary brings the wall's slot (R5) | same file: a fresh copy snapped on air with timers matches the first copy and the wall at the next two cycles |
| AC-7 boundaries: off air, parked and held nothing moves | No armed timer, no change (R2, R4) | same file, "off air, parked or held": an untaken copy and a copy parked with `timers: false` stay on slot 0 for 20 s; Hold stays across two boundaries; Resume advances one, then rejoins |
| AC-8: an ISO deadline with an offset shows the right time left across a reload and a hidden page, in another timezone | `src/templates/shared/clock.ts`: `clockDeadlineAt` reads the start-time field as an ISO deadline; `clockSeconds` and `clockAnchor` count to that instant (R7, R9) | `e2e/holding-pack.spec.ts` "a countdown to an absolute deadline", page timezone America/New_York, deadline at +02:00: 1:29:00, 1:19:00 after ten minutes, a second copy started then also 1:19:00, both 1:14:00 after a five-minute jump with no timer run |
| AC-8: holds at zero after the deadline; a past deadline shows zero, never tomorrow | Past or reached: 0:00 with `starting-soon-done`, finished from its start; nothing takes the graphic out (R8) | same describe: 0:03 runs to 0:00 with the done class and holds a minute later; a past `+02:00` deadline starts at 0:00 already finished, and a past `Z` one at 0:00 |
| AC-8: a new deadline after zero | A deadline held at 0:00 on air counts to a new one written by Update | same describe: Update to a deadline 170 s away, a minute later 1:50, not finished |
| AC-8: an invalid value shows the empty state | No offset, an impossible date or hour: read as an empty field, the duration counts (R10) | same describe: no offset, 31 November, hour 24 and empty all show the 10:00 duration; a `Z` deadline with fractions reads |
| AC-8: `HH:MM` behaves as before | The HH:MM parse is unchanged (R11) | `e2e/holding-pack.spec.ts` "a start-time countdown chases the wall clock" (unchanged, passes) |
| R12: only the start-time designs change | The anchor and deadline code are emitted only with the start-time field | `node scripts/check-catalog-emit.mjs`: 10 designs moved, js only (bug21 to bug24, ss05, ss07, ss10, ss11, ss13, ss18), re-recorded on purpose; every other design byte-identical |

## Mutation checks run locally

- The runtime and clock from `main`: all six new tests fail (`e2e/sponsor-rotation.spec.ts` three,
  the deadline describe three). Restored.
- The rotation runtime without taking over the machine's timer (it only fires at boundaries): the
  two-copy test fails ("cycle 0: just before the boundary", the second copy changes early) and the
  throttled-page test fails. Restored.
- A stalled crossfade showing the cycle it was fired for: the throttled-page test fails ("a stalled
  crossfade lands on the current cycle"). Restored. (Sleeping GSAP's ticker does not stall it: a new
  timeline wakes the ticker, so the spec pauses the global timeline instead.)

## Local runs

- `e2e/sponsor-rotation.spec.ts` (3 pass), `e2e/holding-pack.spec.ts` (13 pass).
- Regression selection: `e2e/catalog-baseline.spec.ts`, `snap-recovery`, `output-first-paint`,
  `graphic-types`: 31 passed, 1 skipped (a skip already in the file).
- `node scripts/check-catalog-emit.mjs`: pass after the re-record.
- `npx tsc --noEmit -p tsconfig.json` and eslint on the changed files: clean.
- `node scripts/e2e-capacity.mjs --changed origin/main`: warnings only; `check-e2e-protection`: OK.

## Not checked here

- OBS's own browser throttling of a hidden source: the jump of the system time stands in for it.
  The owner sees the rotation in OS2 and OS7.
- Machines with skewed clocks show different partners (R15 assumes NTP).
- The render service's virtual clock: the runtime reads `Date.now()` and timers, both virtualized
  there; no render was run.
