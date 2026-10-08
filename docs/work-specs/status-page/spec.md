# A public status page at status.noacg.studio

## Why

NoaCG is a cloud service and a playout system, and a production depends on it while it is on air.
Users should always be able to see whether it is running, what maintenance is coming and what
went wrong before, the way vMix shows it (owner, 2026-10-02). It serves `docs/GOALS.md` outcome 5,
production and playout reliability.

## Goal

An outside hosted status page at `status.noacg.studio`, on a free tier, fed by honest checks of
what a user's studio needs, with a written process for maintenance and incidents.

## Non-goals

- A status page on our own hosting: it would fail together with the thing it reports on (owner,
  2026-10-02). That ruled out building one.
- A paid plan, and creating the account: the owner does both.
- The landing-page status indicator: filed as [issue #810](https://github.com/NoaCG/NoaCG-Studio/issues/810),
  to be built once the account exists.
- Probing AI generation or video render: each real check would spend money. They are posted by
  hand when they fail.

## Decisions

- **D1. Better Stack's free plan.** It is the only free tier we found that serves the page on our
  own subdomain and also has visitor subscriptions, scheduled maintenance, an embeddable badge
  and a public JSON feed. Reasons, limits and the alternatives, each with its primary source, are
  in `docs/STATUS_PAGE.md`. Revert by picking another service there; the endpoint does not depend
  on the choice.
- **D2. One public endpoint, `GET /api/status`, with `?component=<name>`.** One monitor per
  component reads one answer: 200 when it is operational, 503 when it is down. Any service can
  read a status code, so no keyword or JSON assertion is needed.
- **D3. Each check takes the path a user takes.** Database: a real query through the Data API with
  the server key. Sign-in: the auth service's health route. Storage: the storage service's status
  route. Realtime: a websocket join on a private command-log topic, so it passes the same
  authorisation a hosted output's join does.
- **D4. Nothing private in the answer.** No project address, key, version or upstream error text;
  a failure is a short reason code.
- **D5. A 10-second shared measurement per warm instance.** It is not an HTTP cache (the answer
  is `no-store`); it caps what a flood of calls can cost the backend.
- **D6. The endpoint is its own function.** That takes `api/` to 12 functions, the budget in
  `check:function-budget`. The next standalone function must raise that constant on purpose.

## Acceptance criteria

### AC-1: The endpoint reports every component

A local call to `/api/status` against the real backend returns JSON naming `database`, `auth`,
`storage` and `realtime`, each `operational` with a latency, with `cache-control: no-store`. With
wrong keys it answers 503 and names the failing components.

### AC-2: Honest and private by test

Unit tests in `api/_lib/statusProbe.test.ts` prove: a component that is down, hangs, refuses or is
not configured reads as down, never as operational; one component can be asked alone and only it is
checked; the body never carries the project address, a key or upstream error text.

### AC-3: The service is chosen from primary sources

`docs/STATUS_PAGE.md` names the service and its free-tier limits (monitors, interval, custom
domain, maintenance, incident history, subscribers, badge or widget), each linked to the vendor's
own page; the components users see; each monitor and its interval; and the maintenance and
incident process, including what reads as an outage.

### AC-4: The owner's steps are filed

[issue #810](https://github.com/NoaCG/NoaCG-Studio/issues/810) lists only the steps that need
his account: sign-up, the DNS record, the monitors. `npm run build` accepts it.

### AC-5: The page is live (after the owner's steps)

`https://status.noacg.studio` serves the Better Stack page over HTTPS with every monitor in
`docs/STATUS_PAGE.md` green. An agent checks this once the owner reports the account is set up.
