---
v: 2
source: owner
kind: ask
raised: 2026-09-15
state: advanced
asked: "if I'm not on the computer then it's okay to use more RAM and also to check whether we actually need 4 GB ready every time so we aren't too conservative with the RAM ... During a day wave it's always good to ask if you can go over 4 GB."
serves: H0
size: small
touches: scripts/jobs-store.mjs, scripts/jobs-store.test.mjs, docs/JOB_RUNNER_PLAN.md
needs-owner: none
note: "the mechanism landed 2026-09-16 on claude/sf-ram-floor-by-presence; what is left is measuring a real Playwright suite and a catalog battery at peak, to confirm or correct the 3072 MB the walk measurement implies"
---
# The queue's memory floor follows the owner's presence, and is measured rather than guessed

**Filed:** 2026-09-15, the evening the control-panel chain stalled on it. **Source:** the owner,
in session, recorded as the rule `jobs/owner-away-machine-job-queue-may` the same evening and as
the 2026-09-16 ruling in the retired owner rulings.

## What landed, 2026-09-16

All three mechanisms this asked for. `docs/JOB_RUNNER_PLAN.md` carries the measurement and the
"Presence" section carries the commands.

- **The floor follows presence.** Two floors in `POLICY.freeMemFloorMb`: 3072 MB while the machine
  is declared away, 4096 MB otherwise. Presence is declared with `npm run jobs -- presence away`
  and read from a sidecar file on every scheduling pass, so it takes effect under a running runner.
  No environment variable and no runner restart, which was the specific thing this item asked to
  stop needing. A declaration expires after twelve hours, and every unknown - no file, a torn
  write, a misspelt state, a caller that passes no presence - reads as `present`.
- **A number with a measurement behind it.** A browser walk measured 1.4 GB peak on this box on
  2026-09-16, so a suite-equivalent is about 3 GB, and the away floor IS that cost. The gigabyte
  between the two floors is now named for what it is: the room kept for whoever is at the keyboard,
  which is dropped when nobody is.
- **The day-wave ask.** A job held by the stricter floor prints the gigabyte being kept and the one
  command that releases it, instead of waiting silently.

## What is still open

**One measurement, and it is the one that would move the number.** The ask was for the peak memory
a suite, a walk and a catalog run actually take. Only the walk was measured directly - a
`save-to-air-bench` job running in the live queue, sampled every five seconds. The suite figure is
DERIVED from it (1.4 GB at cost 0.5, so 3 GB at cost 1.0) and cross-checked against the 2026-09-09
reading of two suites leaving under 2 GB free on a box that idles near 6.5. That cross-check agrees,
but it is not the same as watching a suite.

Why it was not done on the day: running a Playwright suite and a catalog battery means enqueuing
two browser-driving jobs, one per machine, into the queue five other rows of that wave were using.

What would close it: run `npm run test:e2e:affected` and one catalog battery through the queue on a
quiet machine, sample free memory and the `chrome-headless-shell` working set every five seconds,
and put the peaks in `docs/JOB_RUNNER_PLAN.md` beside the walk. If a suite peaks above 3 GB the away
floor is under-reserving and should move up; if it peaks well below, the away floor can come down
further. Either way the table there is replaced with its own date, never edited in place.
