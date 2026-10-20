# Q record: server tick cost estimate (gates C2)

Estimated by the Q worker of the production-page plan run, 2026-10-20, from figures measured
21:07 to 22:07 UTC in a Claude cloud session (Node 22.22.0), repository revision `cc3500f2`.
Prices read from Vercel's docs the same evening: "Fluid compute pricing"
(`/docs/functions/usage-and-pricing`, updated 2026-06-16) and "Configuring Memory and CPU"
(`/docs/functions/configuring-functions/memory`, updated 2026-07-15).

## What the tick is

C2's tick (`../spec.md`, C2): `/api/data/tick`, a segment of `api/data/[...path].ts`, run by a
Vercel cron every minute (`* * * * *`), `maxDuration` 30 s, each read with a 10-second timeout and
no new read started after 20 s. It checks the switch, takes the lease, reads published Sheet and
feed sources with no live lease, and applies through `control_data_apply`.

## Measured inputs

- **Export read time** (`sheet-endurance.md`): 720 reads of the public CSV export from a cloud
  machine, median READ_P50 ms, p95 READ_P95 ms, slowest READ_MAX ms.
- **Active CPU of one read** (30 reads of a third test Sheet, 21:21 to 21:22 UTC, Node
  `process.cpuUsage` around fetch plus CSV split): median 3.9 ms, p90 7.3 ms; the first read in a
  fresh process 189 ms (TLS and code warm-up). Wall time median 205 ms, slowest 423 ms.

## Assumptions

- Vercel Pro, Fluid compute, the default size 2 GB / 1 vCPU (`vercel.json` cannot set memory and
  the repo sets none). Rates per the docs: Active CPU $0.128 an hour and Provisioned Memory
  $0.0106 a GB-hour in Washington (iad1, Vercel's default region), $0.184 and $0.0152 in Frankfurt
  (fra1, the dearest likely region); Invocations $0.60 a million.
- 31-day month: 44,640 ticks.
- Each tick pays 1.0 s of wall time and 0.25 s of CPU before any read, for the switch, lease, apply
  and a cold start every time. This is a generous allowance, not a measurement: the database calls
  were not timed from Vercel.
- Reads run one after another (the worst case; parallel reads cost less memory time). Each read
  adds its measured wall time and 10 ms of CPU.
- Memory is billed for the whole wall time, CPU only while code runs (the docs' Fluid rules).

## Estimate

| Scenario | Wall s / tick | CPU s / tick | GB-hours / month | CPU-hours / month | iad1 / month | fra1 / month |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
TABLE

Invocations alone: 44,640 a month, $0.03. A 48-hour switch window (2,880 ticks) with six sources
at p95 costs WINDOW48.

## Against included usage

Pro bills Functions on demand against the plan's $20 monthly usage credit
(`docs/VERCEL_PRO_NO_OVERAGE_PLAN.md`, "Current baseline"); Pro has no separate included CPU,
memory or invocation allowance. The tick's realistic cost, SIX_P95 a month with six published
sources read every minute all month, is under a tenth of that credit. Even the ceiling, every tick
held to its 30-second `maxDuration` all month, is CEILING, which fits the credit alone but would
take most of it from builds and other functions.

## Judgement

The tick is affordable inside the no-overage plan: about IDLE a month when it reads nothing and
about SIX_P95 for six sources, well under the $20 credit. The cost that matters is wall time, not
CPU or invocations, so C2 should keep the 10-second read timeout and the 20-second cut-off (they
bound the ceiling), read sources in parallel where the code allows, and keep the switch off
except while a run uses it. The 48-hour expiry already limits a forgotten switch to about
WINDOW48_FRA per window. The current month's spend against the credit was not read; the weekly
Usage review in the plan covers it.
