# Admin weight and a simpler operating model

Measured 2026-10-17 against main `ea71261c97a7bca8c8fd3b68adef1307561588dd`.
The admin files are unchanged since the original audit pin. This is a source and public-asset
inspection, not a production data query. No account, database, schedule or application changed.

## How heavy it is

| Scope | Files | Physical lines |
|---|---:|---:|
| Admin frontend TS/TSX | 18 | 4,371 |
| Admin CSS | 1 | 656 |
| Admin handlers/support, including the dispatcher and shared adminAuth | 19 | 3,204 |
| Direct Node tests | 5 | 1,179 |
| Admin E2E spec | 1 | 1,052 |
| Bootstrap CLI and dev API adapter | 2 | 197 |
| ADMIN.md | 1 | 1,041 |
| Total of those non-overlapping scopes | 47 | 11,700 |

This excludes SQL migrations and shared dependencies; it is a maintenance footprint, not a
deletion total. Frontend TS/TSX is about 1.44% of the original app-source baseline. The browser
spec has 34 static declarations and costs **0.553 recorded spec-minutes** per full offline run
(about 33 seconds of summed spec time, not guaranteed wall-time saving). Retiring the page
would not retire all its authorization, entitlement and aggregation checks.

The frontend is ten sections, with user detail embedded in Users. It imports all sections
eagerly. Largest presentation files: UserDetail 560 lines, Overview 544, Models 410, Plans 343,
Feedback 307 and System 293. Shared wire types/constants contribute another 685 lines.
The only direct package imports are React and ReactDOM; there is no dedicated charting or
admin framework dependency to remove. Source line counts include comments and blanks.

## What users download

`admin.html` has its own Vite entry, `src/admin/main.tsx`. App does not import the admin UI.
The production HTML fetched from `https://noacg.studio/admin` names:

- `admin-CzSjqLaA.js`: **86,113 bytes** (22,400 bytes with a local gzip estimate).
- `admin-Dq4PqNQi.css`: **15,798 bytes** (3,780 bytes with a local gzip estimate).

The two admin entry assets total **101,911 bytes raw / 26,180 estimated gzip bytes**.
The admin HTML links 16 resources totaling 319,202 raw bytes / 97,667 estimated gzip bytes,
including shared React, authentication, Supabase and runtime chunks. Those shared bytes are
not savings attributable to the admin page. This is not a full browser network waterfall:
runtime requests, cache hits and transfer encoding can change what a visit transfers.
The deployed asset hashes are recorded; their exact Git commit was not established.

The ordinary `/app` HTML contains neither admin entry asset. Source imports also establish
that normal app routes do not load the admin page. Keeping it does not add this 102 KB to
every app visit. Its main cost is maintenance and an extra build/test surface. No build-time
delta, cold-start latency, memory profile or billed database cost was measured.

## Runtime work and shared code

One routed serverless function dispatches 13 admin paths. Visiting the authorized overview
loads a session, the overview and system state; other sections fetch when selected or refreshed.
The shared data hook has no polling interval. With the page closed, its component fetches do
not run. A separate scheduled feedback workflow is discussed below.

Overview aggregation uses SQL functions. Some other handlers read bounded row windows into
JavaScript; usage permits up to 20,000 generation rows and marks truncation. This is a reason
to keep a report bounded, not to recreate an expensive interactive dashboard in a cron job.

The whole `api/_lib/admin*` family cannot disappear with the page. `adminAuth` supplies the
database client used by current entitlement, system-setting and template-visibility readers.
The app/AI service still needs access enforcement, budgets, route switches and stored settings.
The admin page edits these policies; it is not the only reason they exist. `src/admin/types.ts`
also supplies handler types and a runtime scope constant. Move/narrow these only with their
actual consumers; preserve data and authorization boundaries.

The maintenance-notice publisher is still reachable in the admin UI. SystemNoticeBar and its
reader are only mounted by the retired AppShell, so the reader's absence from current routes
is a disconnected feature, not proof the published notice has no purpose. Do not add a new
cross-surface banner solely to justify retaining it. Decide whether notices remain useful in
the admin scope decision, and remove publisher/reader together if the feature is retired.

## What a periodic report could replace

| Existing function | Recommendation |
|---|---|
| Usage, cost and failures | Read-only report: actual spend, reservations separately, failure counts and changes needing action |
| External usage/adoption | Small weekly summary; distinguish external users from development activity and missing telemetry from zero |
| Feedback/quality | New negative feedback and reproducible failures; keep messages in authorized private context, not public CI logs |
| Model catalog/eligibility browsing | On-demand report for current supported lanes; do not maintain a dashboard for speculative comparisons |
| Audit browsing | On-demand query when investigating an action; retain the audit data and write trail |
| User access, grants, plans, feature/model switches, template visibility | These are actions, not monitoring. Retain only needed audited commands or a compact controls page |
| Maintenance notices | Owner value decision; neither automatically rebuild the banner nor keep both halves indefinitely |

The current dashboard primarily describes Lite generations, gateway requests, renders and
product funnel activity. The active graphics-harness experiments keep their own benchmark
ledger/results under `benchmarks/harness/`; the report should read those existing receipts
when asking about harness spend and success. Do not quietly treat Lite totals as harness totals.

Five read-only section components alone contain 1,425 lines. The full frontend excluding its
685-line shared wire module is 4,342 lines including CSS. These are gross alternatives, not
net removal promises: reporting, any retained controls and required tests must be accounted for.

## Reuse the existing reporting path

`npm run feedback:count` already reads the last 168 hours and prints counts without fetching
feedback message text. `docs/ROUTINES.md` assigns it to the weekly owner session; that is
documentation of intended scheduling, not proof that the owner's machine is currently running
it. `scripts/feedback-digest.mjs`, its tests and the parked mail workflow already total 1,179
lines. Do not build another feedback reader or configure email merely to avoid the admin page.

The workflow is still scheduled. Run 39027541183 took 11 seconds of job time: the “Say why
nothing was sent” step ran and the mail step was skipped. No secrets were read. A successful
run is therefore not mail-delivery evidence. A scheduled inert job still consumes runner/setup
time, despite old comments saying it costs nothing. If the existing chat routine is chosen, retire the unused mail transport and
workflow while retaining the shared count path and its privacy checks, after verifying actual
configuration and users. Do not promise removal of the whole digest script.

Recommended direction: one compact report through the existing owner routine, plus only the
occasional control operations the owner wants. Report meaningful changes/actionable failures;
daily checks stay quiet otherwise. Use existing metric definitions, ledgers and access checks;
do not create a second set of accounting formulas or automatic account/model mutations.

Do not expand the ten-section page now. The owner can decide to remove the presentation once
the useful report and action path are concrete. Git preserves the old interface if needed later;
future usefulness alone is not a reason to maintain dormant sections.

## Evidence and limits

`admin-measurements.json` names every counted file, the source pin and duration provenance.
Counts use `git ls-tree` and `git show <pin>:<path>`; package imports use TypeScript AST nodes.
`admin-shipped-assets.json` records fetched asset paths, byte counts, ETags and compression
estimates. No production build, authenticated page walk, mutation, paid API call or database
query was run. Exact future net deletions and report requirements depend on the owner's choice
of indispensable operations; current billing, usage population and actual routine execution
are not inferred from source.
