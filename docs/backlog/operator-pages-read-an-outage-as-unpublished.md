---
v: 2
source: derived
kind: finding
raised: 2026-09-29
state: unstarted
found: "During a database outage the hosted control page says the production is invalid or unpublished, and the production page's log follow stops until a reload."
serves: NOW
size: small
touches: src/control/hostedControl.ts, src/components/HostedControlPage.tsx, src/components/home/ProductionPage.tsx
needs-owner: none
---

# An operator page reads a database outage as "invalid or unpublished"

**Filed:** 2026-09-29. **Source:** Phase 6 playout research (`docs/PLAYOUT_ISOLATION_RESEARCH.md`
§2.4, §4, §16).

## Why

An operator who reloads or opens the hosted control page (or the phone link) while the database is
not answering is told the link is wrong. `controlShowBySlug` returns `null` on ANY error
(`src/control/hostedControl.ts:559-565`), and the page renders "Control page not found… invalid or
unpublished" for `null`. The renderer's own resolve fixed exactly this confusion months ago with
`RpcAnswer` and `untilAnswered` (`hostedControl.ts:619-684`): an error means "ask again", never "no
such production". The production page's follow has the same shape: its effect gives up on a failed
resolve and stays silent until the page is reloaded. In the 2026-09-29 incident both would have
sent operators hunting for a broken link while the real answer was "wait three minutes".

## What it would take

- `controlShowBySlug` returns `RpcAnswer<ResolvedControlShow | null>`; the hosted page retries with
  `untilAnswered` and shows "Waiting for the server…" meanwhile, keeping "not found" for a real
  `null`.
- The production page's follow retries its resolve on the same backoff and says so in the notice
  line.
- A spec that routes the resolve to 503 and asserts the page never shows the not-found text, then
  recovers without a reload when the route is removed.

## Evidence

- Code as cited above.
- The REST-outage run in `docs/PLAYOUT_ISOLATION_RESEARCH.md` §5 (a hosted page opened during a
  blocked PostgREST).
