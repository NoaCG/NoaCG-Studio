# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately to **contact.noacg@gmail.com**.

Please include what you were doing, what you observed, and enough detail to reproduce it. If you
are not sure whether something counts, report it anyway.

We will acknowledge your report and tell you whether we consider it in scope. If it is, we will
keep you updated as we fix it and will credit you when it is resolved, unless you would rather stay
anonymous.

## What is in scope

NoaCG Studio is a browser application with a small serverless backend, and it can be self-hosted in
full. The parts most worth your attention:

- **The hosted studio** at [noacg.studio](https://noacg.studio) and its API routes under `api/`.
- **Account features**: sign-in, cloud sync, sharing, show chat and the scoped agent keys used by
  the `noacg` CLI. Anything that lets one account reach another account's projects is serious.
- **Generated and exported templates.** Exports run inside broadcast playout systems, so an export
  that could carry an injection into a customer's playout server matters a great deal.
- **The import path.** SVG and HTML import takes untrusted files from the user and turns them into
  running templates.
- **Self-hosted deployments**: anything that leaks server-side configuration or secrets into the
  client bundle.

## What is not

- The studio is deliberately open with **no login wall**. Create, preview, export and local saves
  work for everyone, hosted or self-hosted, and that is a design decision rather than a
  misconfiguration.
- Preview deployments and branch URLs are not production.
- Reports produced only by automated scanners, with no demonstrated impact.
- Denial of service through simple volume against the hosted instance.

## Supported versions

This is a continuously deployed web application. The supported version is whatever
[noacg.studio](https://noacg.studio) currently serves, which is the tip of `main`. Self-hosters
should track `main`; there is no long-term support branch.

## Licence note

NoaCG Studio is AGPL-3.0. If you run a modified copy as a network service, the licence requires you
to offer your users the corresponding source. That is a licence obligation rather than a security
matter, but it is the question self-hosters ask most often alongside this page.
