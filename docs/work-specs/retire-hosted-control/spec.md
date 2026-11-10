# Retire the hosted control page

Status: agreed with the owner on 2026-11-09 (issue #2301). Not built.

## Why

The production page already runs a show, and several signed-in people can have it open at the same
time. The hosted control page (`/app?control=<slug>`, Setup > Links > Control page) is a second
operator surface that looks almost the same. About 2,700 lines and a set of configured browser specs
exist only for it, so every operator change is made and checked twice. Nobody is known to use it.

## Goal

One operator surface: the production page. Nothing on the production page changes behaviour.

## Owner decisions (2026-11-09, binding)

- **O1. Remove it.** Everyone who runs a show signs in, reaches it through their team, and is
  trusted to edit it. Remove the page and its tests in the simplest safe way.
- **O2. The production page must not break.** This outranks every other choice here.
- **O3. No-account operating stays an open question.** If it ever comes, it is a mode of the
  production page, never a second page.

## Key decisions

Derived (revertible; each says how):

- **C1. One pull request.** Nobody depends on the page, so there is no staged migration. Revert:
  restore the files from git.
- **C2. Old links get a tiny redirect.** `?control=<slug>` stays a route. It resolves the slug with
  the existing `control_show_by_slug` and replaces the URL with `#/production/<id>`, where the
  production page opens it or asks the visitor to sign in. An unknown slug shows "This link no
  longer works" with a link home. About forty lines; it keeps saved bookmarks from landing on the
  studio with an unexplained query. Revert: drop the route.
- **C3. Nothing persisted changes.** `control_shows.slug` (`Show.hostedSlug`) is still every
  published production's identity and the key the production page sends with. The table, every
  `control_*` function and grant, the entitlement key `control.hosted`, the presence value
  `'hosted'` and `panel_rooms.claim_where = 'control'` stay as stored values; the client just stops
  producing the last two. No migration.
- **C4. Shared modules stay unless only the hosted page used them.** `src/control/hostedControl.ts`
  is mostly shared with the production page (publish, send, log follow). Remove an export only when
  nothing outside `HostedControlPage.tsx` imports it, checked with `tsc` and a grep, not by
  judgement.
- **C5. Tests: delete what proves only the hosted page, keep what guards the production page.**
  - Delete whole specs whose subject is the hosted page: `hosted-control-profile`,
    `hosted-space-modes`, `hosted-reveal-after-reload`, `hosted-control-recovery`,
    `dashboard-hosted-walk` (configured), and `e2e/hosted-control.spec.ts` (offline).
  - Audit each deleted file by what each test proves, not by its name. Before deleting, move every
    assertion that guards shared code into a surviving spec. Found so far in
    `e2e/hosted-control.spec.ts`: the shared `canAdvance` and `movedStateNames` checks (around line
    896) and the production output-payload serialisation through `buildOutputPayload` and
    `readOutputPayload` (around line 1027). (Added after the live-publishing plan's fourth second
    opinion, 2026-11-09.)
  - Every other spec that opens `?control=` or `openHosted` also guards the production page or the
    server (command-sequence, all-out-from-heads, late-commit-notice, late-send-abandoned,
    live-health, live-prepare, live-ready, live-presence-steady,
    operator-outage-not-unpublished, playout-adjust-race, playout-both-roads,
    rundown-timing-recovery, panel-page, panel-lease, panel-production-page). Where the hosted tab
    was "the other screen", use a second signed-in production page instead. Where it was a
    hosted-only assertion, drop that assertion and keep the rest.
  - Drop the `control-url` / `copy-control-url` checks in `production-links.spec.ts`,
    `production-persistence.spec.ts` and `publish-output-setup.spec.ts`, and the hosted line in
    `e2e/shows.spec.ts`.
  - Each spec deleted or narrowed gets a line under `## Test maintenance` below, in the grammar
    `scripts/check-e2e-protection.mjs` reads. This is a planned feature removal, not a repair to
    pass a gate.

## Behaviour

### AC-1: An old control link opens the production
A signed-in member opening `?control=<slug>` lands on `#/production/<id>` for that production; a
signed-out visitor lands on the production page's existing sign-in state.

### AC-2: A dead link says so
An unknown or unpublished slug shows "This link no longer works" with a way home. A backend outage
keeps retrying rather than calling the link dead.

### AC-3: No surface offers the control link
Setup > Links shows Presenter and Audience only. `docs.html`, `src/components/auth/accountCopy.ts`,
`companion-module/companion/HELP.md`, the delete text in `ProductionsSection.tsx` and the
entitlement explanation in `src/entitlements/contract.ts` no longer mention a control page.

### AC-4: The hosted code is gone
`HostedControlPage.tsx`, `src/styles/control-page.css` and its import, hosted-only rules in
`src/styles/playout-dashboard.css`, `controlPageUrl`, hosted-only exports under C4, the
`controlUrl` prop of `ProductionLinksDialog`, and the contract rules scoped to the page (retired
through `npm run learn`, never by editing `AGENTS.md` or `.claude/rules` directly) are removed.
Scripts that read the page's source (`scripts/ograf-typed-recovery.test.mjs`,
`scripts/failed-sends.test.mjs`, `scripts/acceptance-pack.mjs`, `scripts/whats-new.mjs`,
`scripts/production-data-migration.test.mjs`) are updated. Design docs (`ARCHITECTURE.md`,
`PLAYOUT_DASHBOARD.md`, `CLOUD_PLAYOUT.md`, `CONTROL_PANEL_ANY_GRAPHIC.md`,
`STUDENT_RELEASE_ACCEPTANCE.md`) describe one operator surface.

### AC-5: The production page is unchanged
The production page's own behaviour is identical before and after: the offline suite and the full
configured suite pass, and a walk of publish, Take, Next, Out and All out with two signed-in
production pages on one production shows both following the same air. Production page diffs are
limited to removing the control link wiring.

## Preserved behaviour

- Publishing, the output URL, the presenter and audience links and their slugs.
- Several signed-in operators on one production, following each other live.
- Companion panels pairing with and moving between production pages.
- Timed cues, data rows, saved entries, Bridge and server clips on the production page.
- The data API and every slug-keyed database function (`control-link-guard.spec.ts` passes as is).

## Non-goals

- Closing anonymous access to the slug-keyed database functions (the production page uses the
  same functions; O3 leaves no-account operating open). Follow-up.
- Rotating or revoking a leaked slug (republishing brings the same slug back). Follow-up.
- Any phone layout, read-only role or no-account mode.

## Plan

One pull request, on a branch from current `main`, rebased again right before landing because
other production page work is in flight (NoaCG/NoaCG-Studio#2293 touches `ProductionPage.tsx` and
`playout-dashboard.css`).

1. Tests first (C5): retarget, narrow or delete, and fill in Test maintenance. Run the touched
   configured specs while the hosted page still exists, so a failure is the test's, not the removal's.
2. Remove the page, add the redirect (AC-1, AC-2), and remove the wiring and copy (AC-3, AC-4).
   Add one blank-page browser spec for the redirect and the dead-link state.
3. Verify AC-5: the type check, `npm run lint`, the offline suite, the full configured suite,
   the two-page walk. `/check`, then `/queue-merge`.

Stop and ask the owner if any step would change what the production page does.

## Test maintenance

One line per deleted or narrowed spec, owner miwco, expiry at most 30 days out. A planned feature
removal agreed on issue #2301 (C5), not a repair to pass a gate. Receipt for every line:
docs/work-specs/live-publishing/evidence/phase-1.md.

- e2e/configured/hosted-control-profile.spec.ts: its subject was the hosted page's own controls from a published profile; the read side of the profile stays pinned offline by e2e/hosted-control.spec.ts (published panel spec, arrange from the published bytes) and the production page's controls by e2e/production-controls.spec.ts; the publish WRITING the profile to the database is no longer checked in the configured suite, a gap filed as #2365 and covered meanwhile by the live-verify steps 8 and 9 in docs/CONTROL_LAYER.md, owner miwco, expires 2026-12-08
- e2e/configured/hosted-space-modes.spec.ts: its subject was the hosted page's SPACE keys; the one device preference stays pinned by e2e/hosted-control.spec.ts and the production page's keys by its offline playout specs, owner miwco, expires 2026-12-08
- e2e/configured/hosted-reveal-after-reload.spec.ts: its subject was the hosted page's own staged edits (components/control/ownStaged.ts, removed with it); multi-operator air on the production page stays guarded by command-sequence, playout-both-roads and panel-page, now driven from two production pages, owner miwco, expires 2026-12-08
- e2e/configured/hosted-control-recovery.spec.ts: its subject was the hosted page's PROGRAM recovery and cue adjust (HostedCueAdjust, removed with it); the production page's recovery stays guarded by playout-resolve-race.spec.ts and its PROGRAM entrance count by panel-page.spec.ts, owner miwco, expires 2026-12-08
- e2e/configured/dashboard-hosted-walk.spec.ts: its subject was the hosted page's walk of the dashboard; the production page's walk stays e2e/dashboard-operator-walk.spec.ts and its published half playout-resolve-race.spec.ts, owner miwco, expires 2026-12-08
- e2e/hosted-control.spec.ts: narrowed, not deleted: every test that guards shared code stays in it (receiver, panel spec, payload serialisation through buildOutputPayload and readOutputPayload, canAdvance and movedStateNames, the SPACE preference); only the two tests that read HostedControlPage.tsx's own source left with that file, and what they pinned through shared code stays in its canAdvance and movedStateNames test, owner miwco, expires 2026-12-08

Also removed with the page: scripts/hosted-own-staged.test.mjs, the Node test of
components/control/ownStaged.ts, which only the hosted page used.
