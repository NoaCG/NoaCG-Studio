# The render-baseline gate runs on one laptop, by hand, and its red reaches nobody

**Filed:** 2026-09-10. **Source:** measurement - the verdict in
`docs/handoffs/2026-09-10-bp-catalog-drift-after-the-shim.md`, which found this gate had been red
on `main` for four days and cost two backlog items that both guessed at the wrong cause.

## Why

`e2e/catalog-baseline.spec.ts`, "every catalog variant renders identically", is the only gate on
what a catalog design actually renders as. It compares a computed-style and geometry fingerprint
of all 504 designs against `e2e/catalog-render-baseline.json`, and the fingerprint is bound to the
OS font rasterizer, so the spec skips itself on any platform other than the one that recorded the
file. The recorded platform is `win32`. Every CI runner is Linux. `.github/workflows/catalog-gates.yml`
says so in its own words: the render-baseline comparison "is win32-only and therefore inert on a
runner".

So the gate fires only when somebody on this laptop happens to run it. Between 2026-09-06 and
2026-09-10 it was red on `main` and nothing said so anywhere. Two sessions found the red while
verifying unrelated branches, and both did the natural thing: they assumed the red belonged to
whatever they were holding. One filed
`a-fourth-data-holder-appears-in-credits-on-this-laptop.md` reasoning that the laptop rendered an
extra holder CI did not - CI was not rendering anything. The other filed
`catalog-render-drift-after-the-flex-gap-shim.md` reasoning that the shim that landed that morning
had moved the layout - it had not; it was simply the next commit anyone happened to test against.
Two rows of work, both spent on a cause that was not there, because a red gate had nowhere to
speak.

That is the cost, and it recurs every time. The gate itself is good and its platform-binding is
correct - a Linux-recorded baseline was tried and CI was red for a day on font rasterization alone
(the spec's own comment records it). What is missing is somewhere for its verdict to land.

## What it would take

Two options, cheapest first. They are not alternatives - the first is worth doing whether or not
the second ever is.

**A daily win32 run against `main`, spoken by the morning brief.** `docs/ROUTINES.md` already has
`daily-morning-brief` at 07:00 Helsinki, whose whole job is the three questions that decide whether
the morning needs a person, and whose default is silence. A fourth line - "the render baseline is
red on main, N designs, run `npx playwright test catalog-baseline` to see which" - would have
turned this four-day hole into one morning. The constraints to respect: it drives a browser, so it
goes through `npm run queue` and not straight into the routine (one such job per machine); and it
needs a checkout on `main` that is not the primary one, because the root contract forbids reading
or building in the checkout that holds `main`. A routine that queues a read-only job and reports
its exit code is still reporting, but it does stretch "routines report, sessions write" far enough
that the rule should be read before writing it, not after.

**A Linux companion baseline, so every pull request carries the gate.** The file already records
which platform recorded it, so the shape is a second recording keyed by platform and a spec that
picks the one matching `process.platform`. That makes `main`'s green honest rather than merely
undisputed. The risk is the one that was already paid for once: a Linux fingerprint is only as
stable as the runner's fontconfig, and a gate that is red for a reason nobody can act on is worse
than no gate. Anyone taking this needs to prove stability across repeated runs on the runner image
before recording anything.

There is also a smaller repair already landed on
`claude/bp-catalog-drift-after-the-shim`: the baseline now records the DAY it was taken and the
failure message prints it, marks a key the baseline never had with `+`, and tells the reader to
check `git log --since=<that date> -- e2e/catalog-baseline.json` before reasoning about the look.
That shortens the wrong path; it does not close it.

## Evidence

The gate was recorded on 2026-08-28 (`aa15e625`). The emitted markup of nine credits designs moved
on 2026-09-06 (`cde2a2da`) and of fifteen tickers on 2026-09-09 (`1a9269c0`, `4b6642e5`); each
commit re-recorded the SOURCE baseline beside it and left the render baseline behind. The gate went
red on 2026-09-06 and was first read on 2026-09-08, first attributed correctly on 2026-09-10.
Twenty-four designs, and in every one the only element that moved was a `display: none` data
holder with a `0,0,0,0` rect - nothing a viewer could ever have seen. Jobs j-0985, j-0991, j-0996.
