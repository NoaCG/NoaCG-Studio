# The status page

`status.noacg.studio` tells users whether NoaCG is running, what maintenance is coming and what
went wrong before. It is hosted outside our own hosting on purpose: a page served by Vercel would
go down with the studio it reports on (owner, 2026-10-02). Spec:
[`docs/work-specs/status-page/spec.md`](work-specs/status-page/spec.md). Until the owner's
account steps are done (`docs/acceptance/owner-queue/2026-10-02-bw-status-page-account.md`), the
address does not serve a status page yet.

## The service: Better Stack, free plan

Read from the vendor's own pages on 2026-10-02. A plan can change; re-read the linked page
before relying on a number.

| What | Free plan | Source |
|---|---|---|
| Monitors | 10 monitors and 10 heartbeats | [betterstack.com/uptime](https://betterstack.com/uptime), [pricing](https://betterstack.com/pricing) ("10 monitors & heartbeats, 1 status page") |
| Check interval | 3 minutes at the fastest (paid: 30 s) | [Check frequency](https://betterstack.com/docs/uptime/check-frequency/) |
| Where checks run | each monitor from at least 4 locations; an incident opens only when at least 3 fail | [Locations and regions](https://betterstack.com/docs/uptime/locations-and-regions/) |
| Status pages | 1 | [pricing](https://betterstack.com/pricing) |
| Custom domain | our own subdomain, free: "Your logo and sub-domain, ... Completely free." One CNAME to `statuspage.betteruptime.com`; DNS can take up to 72 hours | [Status page](https://betterstack.com/status-page), [Custom subdomain](https://betterstack.com/docs/uptime/custom-subdomain/) |
| HTTPS on the subdomain | **not stated** on the pages read; checked once the page is live (spec AC-5) | - |
| Scheduled maintenance | a status report of type `maintenance` with a start and an end; a pinned announcement can also be used | [Create status page report](https://betterstack.com/docs/uptime/api/create-a-new-status-page-report/), [Status announcement](https://betterstack.com/docs/uptime/embedding-announcements-into-your-site/) |
| Incidents | manual status reports with updates, each marking monitors Downtime or Degraded; optionally opened automatically from a monitor's incident | [Status reports and updates](https://betterstack.com/docs/uptime/creating-status-report-and-status-update/) |
| Incident history | the public JSON carries 90 days of history per monitor; how long the page lists past reports is **not stated** | [JSON API](https://betterstack.com/docs/uptime/status-pages/subscribing-to-status-updates/subscribing-to-api/) |
| Subscribers | email, Slack, webhook, RSS and JSON; 1,000 subscribers is listed under status pages on the pricing page | [Subscribing](https://betterstack.com/docs/uptime/subscribing-to-status-updates/), [pricing](https://betterstack.com/pricing) |
| Badge and widget | an iframe badge (`/badge?theme=dark` or `light`) and `index.json` at the page's address | [Status badge](https://betterstack.com/docs/uptime/working-with-status-pages/embeddable-status-badge/), [JSON API](https://betterstack.com/docs/uptime/status-pages/subscribing-to-status-updates/subscribing-to-api/) |

**The limits we accept.**

- **Notifying subscribers of a hand-written report is paid.** The incident docs mark "Notify
  subscribers" as "(Small Team plan onward)". On free, people can still follow the page by RSS,
  JSON or by looking. If e-mail notices matter, that is the one upgrade worth paying for.
- **The page shows "Powered by Better Stack".** Removing it costs $250 per page per month
  ([pricing](https://betterstack.com/pricing)). We keep it.
- **The free plan is labelled "Free for personal projects"** on the pricing page. The
  [Terms of Use](https://betterstack.com/terms) (updated 2025-02-14) contain no personal-use or
  non-commercial clause, so we read the label as positioning, not a restriction. If Better Stack
  says otherwise, the paid plan or the runner-up below is the answer.

**Why not the others** (each fact from that vendor's own page, read 2026-10-02):

- **UptimeRobot** free: the status page has "a unique UptimeRobot URL only", and maintenance
  windows and subscribers are not included ([terms](https://uptimerobot.com/terms/),
  [pricing](https://uptimerobot.com/pricing/)).
- **Instatus** free: "No custom domain" ([pricing](https://instatus.com/pricing)).
- **Atlassian Statuspage** free: no custom domain on the Free plan
  ([custom domain](https://support.atlassian.com/statuspage/docs/set-a-custom-domain-and-ssl/)),
  and it "doesn't ping your servers or endpoints"
  ([automation](https://support.atlassian.com/statuspage/docs/know-when-to-automate-your-status-page/)).
- **OpenStatus** free: one monitor at a 10-minute interval
  ([pricing](https://www.openstatus.dev/pricing)).
- **HetrixTools** free, the runner-up: 15 monitors every minute and a custom domain with SSL
  ([pricing](https://hetrixtools.com/pricing/uptime-monitor/)), but we found no way for visitors
  to subscribe and no badge or JSON feed for the landing page.
- **Upptime** (GitHub Actions and Pages): GitHub says a scheduled run "can be delayed during
  periods of high loads" and queued jobs may be dropped
  ([events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)),
  which is a poor base for an outage signal.

## What users see: the components

| Component on the page | What it covers for a user | Monitors |
|---|---|---|
| **Studio** | the website, the studio app, audience and output pages | 1, 2 |
| **Sign-in** | signing in and staying signed in | 3 |
| **Library and saved work** | opening and saving designs, productions and their files | 4, 5 |
| **Realtime playout link** | cues from the control page and phone control reaching hosted outputs at once | 6 |
| **Bridge downloads** | getting NoaCG Bridge from the Downloads page | 7, 8 |

Not on the page as components, and posted as a status report by hand when they fail: **AI
generation** and **video render**. A real check of either would spend money on every run.

## The monitors

Every monitor is an HTTP monitor, GET, every 3 minutes (the free minimum), up when the answer is
2xx. That is 8 of the 10 free monitors.

| # | Name | URL |
|---|---|---|
| 1 | Website | `https://noacg.studio/` |
| 2 | Studio app | `https://noacg.studio/app` |
| 3 | Sign-in | `https://noacg.studio/api/status?component=auth` |
| 4 | Library data | `https://noacg.studio/api/status?component=database` |
| 5 | Library files | `https://noacg.studio/api/status?component=storage` |
| 6 | Realtime playout link | `https://noacg.studio/api/status?component=realtime` |
| 7 | Bridge release | `https://github.com/NoaCG/NoaCG-Studio/releases/latest` (redirects to the newest Bridge release) |
| 8 | Downloads page | `https://noacg.studio/downloads` |

## The health endpoint

`GET /api/status` (`api/status.ts`, checks in `api/_lib/statusProbe.ts`) needs no sign-in, is
never cached (`cache-control: no-store`) and answers 200 when every component asked about is
operational, 503 when one is down. `?component=database|auth|storage|realtime` asks about one;
with no query it checks all four. `HEAD` gives the same status without a body.

```json
{"status":"operational","checkedAt":"2026-10-02T07:22:53.448Z","components":{
  "database":{"status":"operational","latencyMs":275},
  "auth":{"status":"operational","latencyMs":184},
  "storage":{"status":"operational","latencyMs":150},
  "realtime":{"status":"operational","latencyMs":391}}}
```

| Component | What it does | What it proves |
|---|---|---|
| `database` | a `HEAD` query on `system_settings` through the Data API with the server key | the API gateway, PostgREST and Postgres answer a real query |
| `auth` | `GET /auth/v1/health` with the publishable key | the sign-in service is up |
| `storage` | `GET /storage/v1/status` | the storage service process answers. It does **not** prove a file can be read; a file-store fault is posted by hand |
| `realtime` | opens the realtime websocket with the publishable key and joins the PRIVATE topic `log-00000000-0000-0000-0000-000000000000` | a client can connect and pass the same authorisation a hosted output's join runs (the `log-<uuid>` read policy, migration 0064). The nil id belongs to no show, so it hears nothing |

A check slower than 5 seconds is down (`timeout`). Other reasons: `unreachable`, `rejected` (the
realtime join was refused), `http_<code>` and `not_configured`. A realtime handshake refused for a
wrong key also reads `unreachable`: the browser WebSocket API gives no status for it. The answer
never carries the project address, a key, a version or upstream error text. One measurement
answers repeat calls for 10 seconds on a warm instance. That keeps the monitors' cost to a few
backend requests a minute; it does not bound a flood spread over many instances, which is the
Vercel firewall's job.

**Read with care.** Monitors 3 to 6 reach the backend through our own Vercel function. If Vercel
Functions fail, all four go down together even when the backend is fine. Four backend monitors
down at once while the website is up points at Vercel first, and the report says so.

## Running it

**Who.** The owner holds the Better Stack account and posts maintenance and incident reports.
Anyone on call may be invited later; the free plan's seat count is not stated.

**Automatic incidents.** Turn on "Automatically create status page updates for new incidents", so
a confirmed outage (at least 3 locations failing) appears on the page without waiting for a
person. A person then takes it over: edit the wording and set the right severity.

**What reads as an outage.**

- **Downtime:** a monitor confirmed down by Better Stack, or a user-facing function failing for
  everyone (signing in, opening the library, cues not reaching outputs, the Bridge download
  missing).
- **Degraded:** it works but worse. The realtime monitor down while the database is up is
  Degraded, not Downtime: hosted outputs and control pages re-read the cue log every 30 seconds
  (`docs/CLOUD_PLAYOUT.md`), so cues still arrive, up to 30 seconds late. Say exactly that.
- **Not an incident:** a single failed check that recovers before confirmation, a problem only in
  a preview deployment, and a fault in one user's own setup.

**Planned maintenance.** Post it as a maintenance report with its start, end and the components
it affects, **at least 72 hours ahead**, and a week ahead for anything that stops playout or
sign-in. Never schedule it across a production a team has announced. Post a final update when it
ends.

**An incident.**

1. **Open** within 15 minutes of a confirmed outage: what users notice, which components, and
   that we are investigating. Plain words, no internal names.
2. **Update** at least every 30 minutes while it lasts, even if only to say it is still being
   worked on, and whenever the user-visible state changes.
3. **Close** with a Resolved update once the monitors are green and the function works for a
   user again: what happened, when it started and ended, and what users need to do, if anything.
4. **After** any outage longer than 30 minutes, add a short cause and what changes so it does not
   happen again, to the report itself.

**The landing page** gets a status indicator once the account exists:
`docs/backlog/status-indicator-on-the-landing-page.md`.
