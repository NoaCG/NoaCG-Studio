# Retire the hosted control page

Status: draft for owner review, from the owner's decisions on issue #2301 (2026-11-09). Not built.

## Why

The production page already runs a show, and several signed-in people can have it open at the same
time. The hosted control page (`/app?control=<slug>`, Setup > Links > Control page) is a second
operator surface that looks almost the same. It costs about 2,700 lines that only it uses
(`src/components/HostedControlPage.tsx`, `src/styles/control-page.css`, its rules in
`src/styles/playout-dashboard.css`) and 21 configured browser specs that open it. Every change to
the operator view is made, and checked, twice.

## Goal

One operator surface: the production page. An old control link still leads somewhere useful.

## Owner decisions (2026-11-09, binding)

- **O1. Retire the page.** Everyone who runs a show has the production page open and is trusted to
  edit and operate it. A separate "operate, don't edit" page is not worth keeping.
- **O2. Operators have accounts.** Whoever controls anything signs in and reaches the production
  through their team. Whether a no-account mode should ever exist stays open; it is not decided
  here, and if it comes it is a mode of the production page, never a second page.

## Key decisions

Derived (revertible; each says how):

- **C1. Old links redirect.** `?control=<slug>` stays a route. It resolves the slug to the
  production id with the existing `control_show_by_slug` and replaces the URL with
  `#/production/<id>`. The production page then does what it does for any link: opens it, asks the
  visitor to sign in, or says it is not theirs. Revert: restore the page from git.
- **C2. Nothing persisted changes.** `control_shows.slug` (`Show.hostedSlug`), the
  `control_shows` table, every `control_*` function and grant, the entitlement key
  `control.hosted`, the presence value `'hosted'` and `panel_rooms.claim_where = 'control'` stay as
  stored values. Only the client stops producing the last two. The slug is still how every
  published production is identified and how the production page sends commands.
- **C3. Phones use the production page as it is.** It already reflows below 900 px. No phone
  layout work is part of this; AC-4 only checks that operating works there.
- **C4. Files the production page work is changing go last.** Open pull requests
  NoaCG/NoaCG-Studio#2314 and NoaCG/NoaCG-Studio#2293 both edit `ProductionPage.tsx` and
  `playout-dashboard.css`, and #2314 also edits `ProductionLinks.tsx`. Phases 1 and 2 do not touch
  those files. Phase 3 starts only after both have landed or closed, and is rebased on current
  `main` before it starts.

## Behaviour

### AC-1: An old control link opens the production
A signed-in member of the production's owner account or team who opens `?control=<slug>` lands on
`#/production/<id>` for that production.

### AC-2: An old control link asks a signed-out visitor to sign in
A signed-out visitor who opens `?control=<slug>` lands on the production page's existing "Sign in
to open this production" state, and after signing in as a member reaches the production.

### AC-3: A dead link says so
An unknown, unpublished or deleted slug shows a short "This link no longer works" page with a way
home. A backend outage keeps asking, as the hosted page did, rather than calling the link dead.

### AC-4: Operating from a phone still works
On a 390 px wide viewport, a signed-in member can Take, Next, Out and All out on the production
page, and a second signed-in device sees the same air.

### AC-5: Multi-operator coverage moves, it is not lost
Every behaviour a configured spec proved through a hosted tab is proved through a second signed-in
production page instead, or is retired with the reason in a `## Test maintenance` section that phase 1 adds here. No spec is
deleted to pass a gate.

### AC-6: No surface offers the control link
Setup > Links shows the Presenter and Audience rows only. User-facing copy (`docs.html`,
`src/components/auth/accountCopy.ts`, `companion-module/companion/HELP.md`, the delete confirmation
in `ProductionsSection.tsx`, the entitlement explanation in `src/entitlements/contract.ts`) no
longer sends anyone to a control page.

### AC-7: The code is gone
`HostedControlPage.tsx`, `control-page.css`, hosted-only rules in `playout-dashboard.css`, the
hosted-only exports of `src/control/hostedControl.ts` and the contract rules scoped to the page are
removed. `controlPageUrl` is removed. Design docs (`PLAYOUT_DASHBOARD.md`, `CLOUD_PLAYOUT.md`,
`CONTROL_PANEL_ANY_GRAPHIC.md`, `STUDENT_RELEASE_ACCEPTANCE.md`, `ARCHITECTURE.md`) describe one
operator surface.

## Preserved behaviour

- Publishing, the output URL, the presenter and audience links and their slugs.
- Several signed-in operators on one production, following each other live.
- Companion panels pairing with and moving between production pages.
- Timed cues, data rows, saved entries, Bridge and server clips on the production page.
- The data API and every slug-keyed database function (`control-link-guard.spec.ts` keeps passing).

## Non-goals

- Closing anonymous access to the slug-keyed database functions. Today anyone holding a slug can
  call them; that stays exactly as it is, because the production page uses the same functions and
  O2 leaves a no-account mode open. A follow-up decides it.
- A way to rotate or revoke a leaked slug (today republishing brings the same slug back). Separate
  follow-up.
- Any new phone layout, read-only role, or no-account mode.

## Plan

Each phase is one pull request, verified with `/check` and landed with `/queue-merge`.

1. **Move the coverage (tests only).** Add a configured helper that opens a second signed-in
   production page for the same production. Retarget each spec that opens `?control=` or
   `openHosted` to it: all-out-from-heads, command-sequence, dashboard-hosted-walk,
   hosted-control-profile, hosted-control-recovery, hosted-reveal-after-reload, hosted-space-modes,
   late-commit-notice, late-send-abandoned, live-health, live-prepare, live-presence-steady,
   live-ready, operator-outage-not-unpublished, panel-lease, panel-page, panel-production-page,
   playout-adjust-race, playout-both-roads, rundown-timing-recovery. Behaviour that exists only on
   the hosted page (a hosted-only layout or refusal) is listed in a `## Test maintenance` section
   added to this spec, with what replaces it. The hosted page still exists, so nothing breaks while this lands. Touches only
   `e2e/`.
2. **Replace the page with the redirect.** `App.tsx` renders a small `ControlLinkRedirect` for
   `?control=` (AC-1 to AC-3). Delete `HostedControlPage.tsx` and `control-page.css`, prune the
   hosted-only parts of `hostedControl.ts`, update `e2e/hosted-control.spec.ts`, `e2e/shows.spec.ts`
   and the scripts that read the page's source (`scripts/ograf-typed-recovery.test.mjs`,
   `scripts/failed-sends.test.mjs`, `scripts/acceptance-pack.mjs`), retire its contract rules
   through `npm run learn`, and update the user copy and docs listed in AC-6 and AC-7 that live
   outside the production page files. Add a blank-page browser spec for the redirect and its dead
   link state. Does not touch `ProductionPage.tsx`, `ProductionLinks.tsx` or
   `playout-dashboard.css`.
3. **Remove the link row (after #2314 and #2293).** Drop the Control page row from
   `ProductionLinks.tsx`, the `controlUrl` prop and `controlPageUrl` from `ProductionPage.tsx`, the
   hosted-only rules from `playout-dashboard.css`, and the `copy-control-url` / `control-url`
   checks in `production-links.spec.ts`, `production-persistence.spec.ts` and
   `publish-output-setup.spec.ts`. Check AC-4 on a phone viewport here.

## Verification

- Phase 1: the configured suite on the moved specs, green on the branch with the hosted page still
  present.
- Phase 2: blank-page spec for AC-1 to AC-3; the configured suite; `npm run rules` clean.
- Phase 3: offline and configured suites; AC-4 by a phone-viewport run of the operate path.
- `/check`, then `/queue-merge`, for each phase.
