# R - Start production does nothing when signed out

Branch `claude/r-publish-logged-out`, forked from `6f5855d9`. The owner's production finding of
2026-09-22: on the production page, Start production appeared to do nothing while he was signed
out. Owner walk: `docs/acceptance/owner-queue/2026-09-22-r-publish-logged-out.md`.

## What reproduced

`ProductionPage.publish` was not silent in its own code. With a backend and no session it called
`openSignIn(...)` and returned. The dialog that store drives, `SignInDialog`, was mounted only
inside `HomePage`, `AppShell` and `VideoAppShell`. The production route (`#/production/<id>`) and
the graphic control route (`#/control/<id>`) render neither, so the request set a flag nothing on
screen read. Reproduced against main's code in the configured dev server, signed out, with a
temporary spec: after the click, `useAuthUi.getState().signInOpen` was `true`, `.auth-card` count
was 0, and no page note appeared. The same mechanism broke the "Sign in" button on the control
page's "Sign in to open this panel" state. It is the defect class `App.tsx` already documents for
the save dialogs.

Two more account-gated verbs on the production page were worse than silent when signed out.
`control_shows` RLS only grants `authenticated` owners, and a signed-out PostgREST
update or delete matches no row and returns no error. So `unpublishControlShow` resolved, and the
page cleared the local slug and said "Production unpublished - its links stop working" while
the hosted output kept running. `claimJoinName` likewise reported the new audience name as live.
Read from the code and the policies (`0008_hosted_control.sql`, `0054_team_productions.sql`), not
driven against production data.

A third defect turned up while pinning the control-page door. `GraphicControlPage`'s lookup
effect skipped any earlier lookup for the same id unless it said `needs-sign-in`, including a
lookup still `looking` whose result its own cleanup had thrown away. Under StrictMode (dev) the
page sat on "Opening..." for good. In production the same thing happens when auth resolves to
signed-in while the first lookup is in flight, for a graphic this browser has not synced.

## What changed, and what I decided

1. **`SignInDialog` mounts once, in `App.tsx`,** beside `SaveDialogs`, and the three shell copies
   are gone. `AgentAccessConsent` keeps its own because it returns before that tree. Offline the
   dialog still renders nothing, since it is gated on `backendConfigured`.
2. **One account gate for the page's three hosted writes** (`accountBlocks` in `ProductionPage`):
   publish, unpublish and claim name. When signed out it opens the dialog with a plain reason.
   While auth is still `loading` it shows a note ("Still checking your account...") rather than
   firing an anonymous write. Offline it never blocks, so an offline build grows no auth UI.
3. **Publishing continues after sign-in.** Pressing Start production signed out arms a ref. If
   auth turns `signed-in` while the dialog is up, the publish runs. If the dialog closes first,
   the press is forgotten, so a later sign-in never publishes by surprise. If the two auth updates
   ever land in separate renders, the press is simply forgotten and the user presses again, which
   is the safe direction to fail in. Unpublish and claim do NOT continue by themselves: unpublish
   is destructive and the claim needs the typed name re-checked.
4. **Copy.** The dialog's first line reads "Starting a production puts it online, and that needs a
   free account. Sign in and it starts straight away." The dialog's own second line then says
   what the account is for and that making and exporting never needs one. The signed-out tooltip
   on the button says it needs a free account. The offline title lost its em dash ("Publishing
   needs the cloud backend, and this build runs offline"), and so did the offline publish note.
   Copy baseline re-recorded.
5. **Kept the orchestrator's decision: publishing needs an account.** Anonymous Supabase sign-in
   is off (`supabase/config.toml` `enable_anonymous_sign_ins = false`) and nothing in `src/` uses
   it. Turning it on means hosted rows owned by throwaway identities, plus rate limiting and
   reclaim rules that do not exist. That is not cheap and not safe four days before the lecture.
6. `GraphicControlPage`'s lookup now skips only a SETTLED answer (`found` or `unknown`).

## Verification

- `npm run build`: exit 0 (after `npm run check:copy -- --update`, which the dash removals required).
- Reproduction on main's code: the numbers above (job `j-1740`).
- `e2e/configured/anonymous.spec.ts`: two new tests, **"signed out, Start production says it
  needs an account and offers sign-in right there"** and **"signed out, a control-panel link
  offers a sign-in that actually opens"**. The whole file passed, 10 of 10 (`j-1738`), run
  signed out against the configured backend (no credentials needed). Before the fixes, both new
  tests failed (`j-1728`).
- `e2e/auth.spec.ts`: new **"offline / no-backend: the production page grows no auth UI and says
  why publishing is off"**. The file passed with `overlay-layers.spec.ts`, 10 of 10 (`j-1736`).
- The continue-after-sign-in half, checked locally with a temporary spec (not committed, because
  it fakes a session through the auth client's private `_notifyAllSubscribers`, `j-1743`). Press,
  fake SIGNED_IN, and the dialog closed and the publish ran: it reached the server and came back
  "Publish failed: permission denied for table control_shows", which is right for a made-up token.
  Press, close the dialog, fake SIGNED_IN, and no publish ran (no note after 4 s). No real account
  was available on this machine (`E2E_EMAIL` unset, no Docker for the local stack), so a real
  sign-in walk is the owner-queue item.
- Looked at the dialog on the production page at 1366x768 and at 390x844. It sits centred over
  the header and the stage, and the reason, the account line, the form and both toggles all read.
  The first draft of the reason ran to four lines and repeated the account sentence under it, so I
  cut it to two.
- `npm run test:e2e:affected`: 1433 passed, 8 failed, and the catalog gate passed. All eight were
  re-run on their own and passed (`j-1756`, `j-1757`). They are the first tests alphabetically
  (`advanced-mode`, `agent-access`, `agent-made-graphics`, `ai-consent`) plus one `import-svg`
  case, and every failure was "element not found" on a surface that renders on boot, which is the
  cold dev server, not this change. None of them touches auth, publishing or the production page.
- `configured-suite.yml` `MIN_TESTS` 51 -> 53, and `bridge-real-server.spec.ts` allowlisted. The
  suite lists 54 tests now (52 before this branch), but one of them drives a real Bridge and a
  real CasparCG behind `BRIDGE_REAL=1` and can only skip on a runner. It landed on 2026-09-22 with
  an empty skip allowlist, which is why the configured suite went red at `6f5855d9` with "51 ran,
  1 skipped, 0 failed" (issue #371). The floor is now what actually runs.
- `scripts/e2e-affected.mjs`: `ProductionLinks.tsx` now also selects `auth.spec.ts`.
- `/check`: review `delegated`, clean, and its scope matched (branch `claude/r-publish-logged-out`,
  base `6f5855d9`, the same 14 files `review-request.mjs` handed it). simplify returned fan-out
  instructions, so that leg ran `inline` over reuse, dead code, indirection and house style, and
  changed nothing. taste: not applicable, since nothing here moves what a graphic looks like.
  The review noted one edge it did not file, and I agree with leaving it: if `getSupabase()` ever
  threw, auth would sit in `loading` for good and the three verbs would answer "Still checking
  your account" rather than failing loudly. That needs a broken backend import.

## For the owner

Nothing blocks. One taste call is in the owner-queue file: whether publish should continue by
itself after sign-in (it does now) or wait for a second press.

## Left for later

- Sign-up by email needs a confirmation link, which leaves the page. The press is forgotten then,
  and the student presses Start production again after confirming. Carrying the intent across
  that redirect would need a persisted flag, which is more than this row should take on before
  Friday.
- `claimJoinName` against a production owned by a DIFFERENT signed-in account also matches no row
  and reports success. The same RLS shape applies, but it is not a signed-out case, so I left it.
  The fix is `.select()` on the update and treating zero rows as a refusal.
- `unpublishControlShow` has the same zero-row blind spot for a signed-in non-owner.
