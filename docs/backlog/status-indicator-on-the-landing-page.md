---
v: 2
source: owner
kind: ask
raised: 2026-10-02
state: unstarted
asked: "(paraphrase) users should always see whether NoaCG is running, upcoming maintenance and past incidents, as vMix shows"
serves: NOW
size: small
touches: index.html
needs-owner: account
---
# A status indicator on the landing page, linking to status.noacg.studio

**Filed:** 2026-10-02. **Source:** the owner's status-page ask of 2026-10-02, row BW
(`docs/work-specs/status-page/spec.md`). Waits on the owner's Better Stack account
(`docs/acceptance/owner-queue/2026-10-02-bw-status-page-account.md`).

## Why

A status page nobody can find does not answer "is it running?". A small line on the landing page
("All systems operational", or what is not), linking to `status.noacg.studio`, is where a user
looks first, and the vMix site the owner pointed at does the same.

## What it would take

Once the page is live:

1. Check whether `https://status.noacg.studio/index.json` answers a cross-origin `fetch` from
   `https://noacg.studio` (CORS). If it does, render our own one-line indicator in the landing
   footer from its `aggregate_state` (operational, degraded, downtime, maintenance), styled to
   `docs/DESIGN_LANGUAGE.md`, falling back to a plain "Status" link when the fetch fails.
2. If it does not, use Better Stack's iframe badge (`/badge?theme=dark`), sized to the footer.
3. Either way the visitor's browser contacts Better Stack, so the privacy page names it.
4. The landing CSP sets no `frame-src` or `connect-src` today; if one is added later, it must allow
   `status.noacg.studio`.

## Evidence

- The JSON feed and its `aggregate_state` values:
  <https://betterstack.com/docs/uptime/status-pages/subscribing-to-status-updates/subscribing-to-api/>.
- The iframe badge: <https://betterstack.com/docs/uptime/working-with-status-pages/embeddable-status-badge/>.
- The service choice and its limits: `docs/STATUS_PAGE.md`.
