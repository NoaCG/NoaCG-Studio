# Vercel Pro without on-demand charges

This is the operating plan for using the Pro subscription fully while keeping the bill at the
fixed platform fee. Review it when Vercel changes pricing or before enabling another paid service.

## Current baseline (2026-08-09)

- `https://noacg.studio` is the canonical production origin. `www.noacg.studio` and the two old
  `vercel.app` hostnames redirect directly to it with HTTP 308.
- Production deploys from `main`. Branch previews remain opt-in through `[preview]`, which avoids
  paying to build every short-lived worktree branch twice.
- Pro provides a $20 monthly infrastructure credit, 1 TB of Fast Data Transfer, and 10 million
  Edge Requests before metered usage draws from that credit.
- Spend Management notifications are enabled, but the dashboard still has Vercel's $200
  on-demand default and production pausing disabled. The dashboard did not persist attempts to
  lower it on 2026-08-09. This is the only unresolved billing guardrail.
- AI Gateway auto-reload is off. The `noacg-studio` project has a hard $25 daily Gateway budget;
  the existing production key also retains its stricter $25 monthly budget. Gateway credit is
  separate from the Pro infrastructure credit.
- Observability Plus is currently shown as included for this team. Web Analytics Plus, Speed
  Insights, Vercel Agent usage billing, and every other monthly add-on remain disabled.

## The no-overage policy

1. Set the team on-demand budget to the lowest value Vercel accepts, enable email/web/SMS
   notifications, and enable **Pause Production Deployments**. Vercel measures this per billing
   cycle, not per day. A hard pause can make the site return 503 and requires a manual resume, but
   that is the strongest available guard against infrastructure overage. Vercel checks usage
   periodically, so a small amount can still accrue before the pause takes effect.
2. Never enable an add-on just because it appears in the Pro dashboard. Confirm that its fixed
   monthly price is $0 first. In particular, keep Web Analytics Plus and Speed Insights off.
3. Keep AI Gateway auto-reload off. Treat the $25 daily project budget as an abuse ceiling, not a
   target. Lower it when real Lite-tier usage gives us a dependable daily baseline.
4. Review the team Usage page weekly and at 50%, 75%, and 100% notifications. The first resources
   to inspect are Build CPU, Sandbox CPU/duration, Function CPU/duration, Blob storage/transfer,
   and AI Gateway traces.

## Use the included capacity well

### Deployments and builds

- Keep `main` as the only production branch and continue using opt-in previews.
- Delete merged worktree branches after their worktree is safely removed. This reduces dashboard
  clutter but does not materially reduce Vercel cost because skipped previews do not build.
- Keep the ignore command and build cache effective. Build CPU was the largest infrastructure
  consumer immediately after the Pro upgrade, so unnecessary redeploys are the first waste to
  remove.

### Functions

- Keep Fluid Compute enabled and retain explicit maximum durations. Waiting on network I/O is
  cheaper than active CPU, but abandoned work must still time out.
- Keep the repository's own function budget (`docs/DEPLOYMENT.md`, "The serverless function
  budget") even though Pro permits more. Consolidated routers reduce cold starts,
  configuration drift, and accidental function growth.
- Use runtime logs and the included Observability surface before buying Speed Insights or another
  monitoring add-on.

### Sandbox rendering

- Use Sandbox for hosted renders, not interactive previews or routine validation.
- Destroy every sandbox after completion or failure, cap concurrent renders by entitlement, and
  keep render inputs and outputs subject to TTL cleanup.
- Track Sandbox CPU, duration, storage, invocation, and data-transfer usage together. They all
  draw from the same $20 infrastructure credit.

### Blob and future video files

- Pro does not make Blob unlimited. It changes Blob from Hobby hard limits to metered usage drawn
  from the shared $20 credit.
- A single Blob can be up to 5 TB. Use direct client uploads above the 4.5 MB Function request
  limit and multipart uploads above 100 MB.
- Blobs above 512 MB are not cached and incur origin-transfer work on every access. Blob is a good
  render-delivery store, but not a free permanent video archive.
- Keep public delivery where access permits, retain short output TTLs, make deletion automatic,
  and show storage/retention estimates before adding long-lived user video libraries.

### Alerts, security, and analytics

- Keep the default team usage and error anomaly rule. Add project-specific rules only when they
  provide a different action or recipient, not duplicate noise.
- Review the render-start firewall rule after a week of traffic and move it from log-only to an
  enforcing rate limit once legitimate peaks are known.
- Enable only the free/basic Web Analytics tier when the funnel work needs it. Do not enable Web
  Analytics Plus or Speed Insights while the no-overage policy is active.
- Keep preview deployment protection and Git fork protection enabled.

## Review points

- Weekly: Usage by project and resource, AI Gateway spend, failed functions, and lingering
  sandboxes or blobs.
- Before a public launch: confirm Spend Management can pause production, exercise the alert path,
  and verify that the pause/resume runbook is understood.
- Before persistent video storage: model storage plus download traffic against the remaining
  monthly credit and add a product-level quota and retention policy first.
