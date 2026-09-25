# src/components/auth - the account UI

## Auth UI (auth/)

useAuthState hook + authUi store + SignInDialog + SignInPrompt + AuthStatus profile button
(-> Home / Settings / Downloads / Sign out). Above the 1480px step the name and the avatar are
ONE pill-shaped button; below it the button is the old 34px round avatar, because the topbar's
width ladder is measured and pinned (e2e/configured/signed-in-ux.spec.ts). Signed in, Home's
own Settings button stands down and the profile menu carries Settings; signed out and offline
it stays, because Settings must never need an account. **AuthStatus states WHICH STATE it is
in, not only what it offers**: a `.auth-state` word beside the control, the account's first name signed in and
"Not signed in" signed out (owner, 2026-09-04). Keep `.auth-status` meaning "there is a
session" - `e2e/configured/anonymous.spec.ts` asserts it is absent signed out and `_helpers.ts`
waits for it as proof a sign-in landed - so the signed-out cluster is `.auth-anon`. The Sign in
button keeps its class and its exact accessible name for the same reason.
The gating pattern: read `useAuthState().needsSignIn` (true
only when a backend is configured AND the visitor is signed out) and render `SignInPrompt` /
call `useAuthUi().openSignIn(reason)` - never block the app. Signup is OPEN (migration `0006`
made the Before-User-Created hook permissive; restore the 0002 function body to re-close it to
the allowlist). The signup half links the public `/terms` and `/privacy` pages and states that
creating an account agrees to the Terms and acknowledges the Privacy Policy. This is an
acknowledgement, not a separate consent checkbox. No login wall, ever - see the root AGENTS.md
"Auth posture".

ACCOUNT ESSENTIALS (docs/GOALS_ARCHIVE.md "Student release" step 9): SignInDialog carries a third
'reset' mode ("Forgot your password?" - email only, backend/auth `requestPasswordReset`).
The reset link's return trip is a ROUTE, **PasswordRecoveryPage**, which App.tsx renders INSTEAD
of the studio beside `?agent=` and `?control=`. Two keys open it and BOTH are needed: the
`?recovery=1` query (backend/auth `RECOVERY_REDIRECT`) and a `type=recovery` fragment, which is
what Supabase itself appends to every reset link including the ones already sent. The evidence is
read by `backend/recoveryLink.ts` **at module load**, before any Supabase client can strip the
fragment - never from an effect, and never by waiting for the PASSWORD_RECOVERY event, which is
emitted while the client is being constructed and is not replayed to a later subscriber. That
race is why a working link showed no dialog at all (docs/backlog/password-reset-link-lands-nowhere.md).
A link that does not work must SAY WHICH, and the page keeps three cases apart rather than
calling everything expired: the provider REFUSED it (`kind: 'error'`, quote its own sentence), a
real token produced no session (say the check did not complete and offer a retry - `getSession`
gives up after 6 s on a filtered network, and "expired" would be a lie there), or there is no
token at all. **There is no recovery DIALOG any more and no `onPasswordRecovery`**: Supabase
emits PASSWORD_RECOVERY from inside client construction and never replays it, so any listener
registered from an effect is racing a notification that has already gone out. Do not add one
back. The page renders nothing offline, and App.tsx does not take the branch there either - a
null would be a blank screen instead of the studio.
SettingsDialog's Account section (email + password change
via `updatePassword` + sign out) renders nothing offline and waits through 'loading'. An
EXPIRED session (a signed-in to signed-out transition that was not the user's own Sign out -
backend/auth's consume-once deliberate-sign-out flag, checked in syncController) dispatches
`spx-session-expired`; App.tsx answers with openSignIn + a reason naming that local work is
safe, on the `'resume'` intent (authUi.ts) - the reader already has an account, so
SignInDialog suppresses the free-account sentence (`ACCOUNT_IS_FOR`) for as long as the form
stays on the signin/reset side; toggling to signup restores it, because that reader IS creating
an account. Offline pins in e2e/auth.spec.ts; the real flows in e2e/configured/account.spec.ts;
the dialog copy itself in e2e/configured/anonymous.spec.ts.

AGENT ACCESS (docs/AGENT_SAVE.md): **AgentAccessConsent** is the `?agent=…` QUERY route App.tsx
renders INSTEAD of the studio (beside `?control=`): `noacg login` opened it; it asks ONE
question - allow "<name>" to save graphics to your library? - and hands a one-time code to the
CLI's loopback listener (`backend/agentAccess.ts` parses the request and owns the ONLY redirect
target, `http://127.0.0.1:<port>/callback#…`). Offline = an honest "no backend" card with ZERO
auth UI; signed out = SignInPrompt `offerSignUp` + its own SignInDialog; signed in = the card
naming what the key may do (`PERMISSION_LABELS`) and the local port. Settings → Account grows
**Agent access** (`AgentAccessSection`): live keys with a Revoke each - minted in a terminal,
never here. Pins: e2e/agent-access.spec.ts (offline), e2e/configured/agent-access.spec.ts.
