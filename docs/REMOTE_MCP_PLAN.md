# Remote MCP connector: adapt and assemble from a chat client

**Status: runnable with `/plan-run remote-mcp`.** Owner, 2026-10-12: build every phase now, in one
plan run; the connector stays **off in production**, and turning it on is the owner's (the
"Owner's steps" below). Evidence and the alternatives weighed:
[research/2026-10-12-remote-app-mcp.md](research/2026-10-12-remote-app-mcp.md). Narrows the first
slice of [issue #843](https://github.com/NoaCG/NoaCG-Studio/issues/843).

## Why

The agent door reaches people who run a coding agent with a shell. Most NoaCG users (churches,
schools, student productions, small teams) work in Claude.ai or ChatGPT, where the local CLI cannot
run. A connector they add by signing in lets them ask for a show's graphics and rundown in the chat
and press Install on Home, which is scenario 2 of the North Star with the least friction.

## Goal

From a chat client, a signed-in user can have an agent look at their library, brands and
productions, pick catalog designs or their own graphics, fill them from a run sheet, apply a brand,
and send the package with its rundown to Home, where one Install opens the production.

## Non-goals

- New graphic code from the agent, in either form: a draft the agent never saw, or server-side
  rendering. Revisit with evidence (research section 5).
- Editing anything that already exists: no library edits, no production replacement, no
  `productions:attach`. The connector only creates waiting packages.
- Take, Update, Next, Out, publish, delete, CasparCG or Bridge access, AI generation.
- A Supabase Edge Function, `@supabase/server` as a requirement, Supabase Compute.
- CIMD before Supabase supports it; a domain namespace in the MCP Registry.
- Any change to the hosted projects' Auth configuration (production or staging), a `remotes`
  entry in `cli/server.json`, or a directory submission. Those are the owner's steps.

## Key decisions

1. **Route:** `POST <deployment>/mcp`, rewritten to a handler in the `api/me` catch-all (no new
   function slot), stateless Streamable HTTP, answering both the 2026-07-28 request metadata and
   the 2025-11-25 `initialize` handshake. Protected resource metadata at
   `/.well-known/oauth-protected-resource/mcp`; 401 with `WWW-Authenticate` when unauthenticated.
   While the deployment's Supabase Auth has no OAuth server (production today), every connector
   path answers 503 `connector_disabled` and nothing else changes.
2. **Sign-in:** the Supabase Auth OAuth server with dynamic client registration, declared in
   `supabase/config.toml` so a local stack and a self-hoster get it. NoaCG's consent page (a query
   route beside `?agent=`) names the client and lists NoaCG permissions.
3. **Permissions:** OAuth scopes stay identity-only (Supabase allows no others). Consent writes a
   `connector_grants` row with `graphics:read` and `graphics:create`; `resolvePrincipal` maps a
   token with `client_id` to `kind: 'connector'` with that row's permissions, and `permits()` runs
   as for keys. Missing or revoked grant: anonymous. `NEVER_ON_AGENT_KEYS` applies to grants.
4. **Connector tokens have no direct database rights.** Preferred: a Custom Access Token Hook gives
   tokens carrying `client_id` a role with no grants. Fallback: restrictive policies on
   `client_id is null` (live-path, waits for a quiet window). Phase 1 decides and records it.
5. **Server never runs graphic code.** A package entry is a catalog recipe (type, design, palette,
   font or brand id, logo, field values) or a library graphic id whose sources the server copies as
   data. The recipe is an additive optional entry kind in `noacg-pack` v1; `installPack` realizes
   it with the studio's scaffold and `applyLookToTemplate`, then validates as today.
6. **Four tools**, each with `title` and explicit `readOnlyHint`, `destructiveHint`,
   `openWorldHint`: `noacg_catalog`, `noacg_library`, `noacg_send_package`, `noacg_guide`
   (dropped if tool descriptions suffice). Total schema under 1,000 tokens, pinned by a test.
7. **Catalog index** generated at build from the type registry, served as a static file the tool
   reads.
8. **Revocation and audit:** Settings → Agent access lists connectors beside keys; Revoke marks the
   grant and calls Supabase `revokeGrant`. `last_used_at` on the grant, `origin` on each package.

## Acceptance criteria

All are proven on a **local Supabase stack** (`supabase start`, Docker) with the OAuth server and
asymmetric keys enabled from `supabase/config.toml`, a dev server, and two local test accounts the
run creates. A scripted MCP client (`@modelcontextprotocol/sdk`, the CLI's dependency) stands in
for Claude.ai; the real Claude.ai connection is the owner's step after the switch-on.

### AC-1: The local stack issues connector tokens, and the token boundary is decided

`config.toml` enables the OAuth server with dynamic registration and asymmetric signing keys; a
local stack starts with the CLI version the repo then pins. A script registers a client, runs the
authorization code flow with PKCE as one test account, and receives an access token carrying
`client_id`. The phase records which form of decision 4 works, with the evidence, and whether a
port-agnostic loopback redirect is accepted.

### AC-2: Consent, grant, revocation and the closed database

Unauthenticated `/mcp` answers 401 with the metadata pointer, and the metadata names the local
authorization server. The consent page shows the client's name and exactly the two permission
labels; Deny leaves no grant. After Allow, a tool call resolves to a `connector` principal. With
the connector's token, a raw PostgREST read and write on every `public` table, `storage.objects`
and an RPC that takes a capability slug is refused. Revoke in Settings makes the next tool call
fail and the refresh fail. A build with no OAuth server answers 503 `connector_disabled`.

### AC-3: Read tools

`tools/list` returns the read tools with title and all three hints, under the schema ceiling.
`noacg_catalog` finds designs by category and words and returns ids, names, fields, palettes and
fonts from the build-time index. `noacg_library` returns test account A's graphics, brands and
productions, and those of a team A belongs to, never account B's, and never template sources.

### AC-4: Send a package

`noacg_send_package` with three catalog recipes, one copy of A's own graphic, a brand, field
values from a run sheet and rundown cues creates one waiting package on A's Home and returns its
link. Install opens a production whose graphics carry those values and the brand, pass the gate,
and play in a browser source. Over the waiting cap, over the rate limit, an unknown id or a
malformed recipe each get an actionable error and store nothing. A pack file with a recipe entry
installs through Import the same way.

### AC-5: Ready to switch on, and still off

A written owner's runbook (in this file) turns the connector on for staging and then production
with exact commands, and says how to turn it off again. The skill's reference text gains the chat
path (connector: assemble; CLI: also make). With production's configuration unchanged, a request
to `https://noacg.studio/mcp` on the deployed site answers 503 `connector_disabled`. The whole of
AC-1 to AC-4 passes again in one scripted run on a fresh local stack.

## Phases

1. **Local OAuth spike**: AC-1.
2. **Sign-in, grants and the closed database**: AC-2.
3. **Read tools**: AC-3.
4. **Send**: AC-4.
5. **Ready, and off in production**: AC-5.

Each phase keeps the earlier phases' criteria passing.

## How a phase is checked

On current `main`, in the checker's own worktree: start Docker Desktop if it is not running
(`%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`), `supabase start` with the pinned CLI
(`npx supabase@<pin>`), the checkout's dev server, then run the phase's scripted acceptance the
way a chat client would: register, consent through the real page in a browser, call the tools,
open the result in the studio as the test user. Drive the consent page and the studio with the
built-in test accounts only, on localhost only. The user outcome is "a chat user gets a package
on Home that installs into a working production", so the checker says in plain words whether that
now holds as far as the phase reaches. Run `supabase stop` at the end; another session may need
the ports.

## Traps known before the run

- `npm run db:push` fails closed on a statement shape it does not know; a `create role` or an auth
  hook function may be refused after landing. That is a refusal for the owner (a `needs owner`
  issue), not a reason to reshape the migration; the build gate (`scripts/db-push.test.mjs`) says
  so first.
- Supabase CLI 2.112.0 is installed globally and cannot push; use `npx supabase@<pin>` and leave
  the global install alone.
- A Custom Access Token Hook on production would run for every sign-in. It is declared in
  `config.toml` and created by migration, but enabling it on a hosted project is the owner's step.
- `api/` must not gain a routed file (thirteen today against the Hobby cap of twelve).

## Owner's steps (after the run)

The connector is ON for a project exactly when its Supabase Auth runs the OAuth server with
dynamic registration: the site reads that from Auth's discovery document (cached a minute), and
nothing in Vercel or the code changes. One command makes every switch and check, from a terminal
in the main checkout after `git pull`. It takes the account token from `.env`, needs no deploy,
and acts only on the project named on its line:

```bash
node scripts/connector-switch.mjs <staging|production> <on|off|status> [--hook-off]
```

Its first line names the project (`== production (kprolrchuldgfrzspthy): on`); check it is the
one you mean. A line starting `REFUSED` (Auth's HTTP code and message, a setting Auth does not
hold as sent, no token, an unknown name) or `NOT` (the connector did not reach the state asked
for) means stop; the command then exits non-zero. The one exception is `NOT` after `off`: the
connector may still be on, so run the same `off` again. `status` only reads. To rehearse on a throwaway
preview branch of production, put `--ref <branch ref>` in place of the project name; it refuses
any ref that is not such a branch.

**1. Check the projects are ready.** `npm run check:migration-drift` lists no pending migration
(0089, 0090 and 0091 must be applied; a landing pushes them to both). The signing key must be
asymmetric (the connector refuses HS256 tokens); `on` checks it first and changes nothing if not,
and `status` prints it (`signing key ES256 in use` on both projects today).

**2. Staging on.**

```bash
node scripts/connector-switch.mjs staging on
```

In this order, each read back from Auth before the next: the security notification emails (they
tell a user, after the fact, that their password, email, phone, MFA factors or linked identities
changed); the access token hook, which runs on every sign-in of the project and passes
first-party tokens through unchanged; then the OAuth server with dynamic registration, which is
the switch. It ends `staging (garafohbzmsybtysxphb): connector on` once Auth's discovery offers
registration. Staging has no deployed site, so Auth's answer is the check there.

Not set: `security_update_password_require_current_password`. The hook already keeps connector
tokens away from password change, and turning it on breaks Settings' password form, which has no
current-password field.

**3. Prove it on staging** (from a checkout of `main`, with staging's anon and service keys from
the dashboard): the four connector specs against staging, the same run as phase 5's hosted proof.

```bash
NOACG_CONNECTOR_TEST_REF=garafohbzmsybtysxphb VITE_SUPABASE_URL=https://garafohbzmsybtysxphb.supabase.co \
VITE_SUPABASE_ANON_KEY=<staging anon key> SUPABASE_SERVICE_ROLE_KEY=<staging service key> \
npx playwright test -c playwright.live.config.ts e2e/configured/connector-oauth.spec.ts \
  e2e/configured/connector-tools.spec.ts e2e/configured/connector-send.spec.ts e2e/configured/connector-grants.spec.ts
```

All pass, and the spike's log shows `connector_account_refused: GET /user 400 bad_jwt ...` and
`first_party_account_allowed`, which is staging's check that a first-party sign-in still works
with the hook on. Supabase allows about ten client registrations per five minutes from one
address (burst 30), so run it once, not in a loop.

**4. Production.**

```bash
node scripts/connector-switch.mjs production on
```

The same as step 2, then it waits about 80 s (each warm noacg.studio instance keeps Auth's last
answer for a minute) and ends `https://noacg.studio/mcp 401` and
`production (kprolrchuldgfrzspthy): connector on`. Then sign in at noacg.studio as yourself once
and open Home. If sign-in fails, turn it all off:
`node scripts/connector-switch.mjs production off --hook-off`.

Then the first real chat connection with your own account: Claude.ai → Settings → Connectors →
Add custom connector, URL `https://noacg.studio/mcp`; sign in, Allow, ask "what is in my NoaCG
library?", then ask for a two-graphic package and press Install on Home. Settings → Account →
Agent access lists it; Revoke there ends it.

**Later, not part of the switch:** add a `remotes` entry for `https://noacg.studio/mcp` to
`cli/server.json` on the next CLI release; the directory submissions.

**Turning it off.** One project per command, named on it (for staging, `staging` in its place):

```bash
node scripts/connector-switch.mjs production off
```

It sets the OAuth server and dynamic registration off (with the authorization path, which Auth
requires beside any OAuth change), reads them back, waits for Auth's discovery to read off (about
15 s), then out the site's one-minute cache, and ends `https://noacg.studio/mcp 503` and
`production (kprolrchuldgfrzspthy): connector off`, about 80 s in all. From then every connector
path answers 503 `connector_disabled`, and tokens already issued are refused at `/mcp`, by the
database and by Auth. Off is a pause: switching on again lets connections that were not revoked
work again. To end one for good, Revoke it in Settings. To see where a project stands at any
time: `node scripts/connector-switch.mjs production status`.

Leave the hook on: it touches only connector tokens. **Never turn the hook off while the OAuth
server is on.** Connector tokens issued then would carry the plain `authenticated` role and the
user's own id, so they would reach the database with the user's rights and open Auth's account
endpoints. (`/mcp` would refuse them, so nothing in NoaCG would show the problem.) The command
turns the hook off only with `off --hook-off`, after Auth reads the OAuth server off, and
`status` prints `NOT safe` if it finds the OAuth server on without the hook.

### Security review (issue #1083), phase 5

**What a connector token can reach now** (all measured on a hosted preview branch of production,
see phase 5's notes): the three tools, scoped to the user who allowed it, while their grant is
live. Refused: every Auth endpoint that acts as the user (user read, metadata, password, MFA
enrolment, the user's grants, reading or approving another client's request, sign-out), each
`400 bad_jwt` before Auth reads anything; PostgREST, RPCs and Storage (`permission denied to set
role "noacg_connector"`); NoaCG's own API outside `/mcp` (401). The same probes without the lock,
on the same branch, changed the password, enrolled a TOTP factor and signed the user out
everywhere, which is the takeover #1083 describes.

**How it holds.** The access token hook (migration 0091) gives connector tokens a `sub` that is
not a UUID and a `session_id` that names no session, so Auth's account middleware refuses them;
`/mcp` verifies the token locally (JWKS, issuer, expiry) and reads the user from `noacg_uid`
plus a live grant row, and refuses a token without the lock. NoaCG never approves a request for
the `openid` scope, because the ID token that scope buys carries the real `sub` and no session,
the hook never sees it, and Auth's `/user` accepted it (GET and PUT, measured on the branch).
The protected resource metadata asks for `email` only, and NoaCG's own API refuses any token
that names no session, which an ID token never does.

**Real risks left.**

- *The tools themselves.* Whoever holds a live connector token (the chat client's operator, or
  someone who took the token from it) can read the user's library (names, field values, brands,
  productions, team productions) and fill Home with waiting packages (25 at most, 10 sends a
  minute). Nothing is edited, published or played. Revoke in Settings stops it on the next call.
- *A client that insists on `openid`* cannot connect; the consent page says why. If Claude.ai or
  ChatGPT turns out to be such a client, the choice is between not supporting it and accepting a
  bearer that opens the account endpoints. That would be a new owner decision; nothing is
  accepted today.
- *A future GoTrue change.* If Supabase starts rejecting such claims at issue time, sign-in
  through the connector fails (closed). If it ever stopped loading the user by `sub`, the lock
  would open silently; `connector-oauth.spec.ts` runs the refusals on every landing against the
  pinned CLI's GoTrue, but hosted Auth upgrades on Supabase's schedule. Repeat step 3 after a
  Supabase Auth upgrade notice.
- *Client names are self-declared.* Any site can register as "Claude" and send a user to the
  consent page; the page names the client and where it will return to, and the user decides.
  Standard for dynamic registration; the tools' reach above is the cost of a wrong Allow.
- *Dynamic registration is per address, about ten per five minutes.* If a chat service
  registers every user's connection from a few addresses, a launch-day rush could see "too many
  requests" on connect. Not a security risk; a reason to watch the first week.
- *Turning the hook off with the OAuth server on* reopens everything (see "Turning it off").

**Safeguards.** The notification emails (`on` sets them); Revoke in Settings; the grant row checked on
every call; refresh tokens end with Revoke; access tokens live an hour (`jwt_expiry`).

**Launch decision.** With a project switched on by `on` (steps 2 and 4), the #1083 boundary
holds as the plan states it. No risk above needs accepting to switch on; the second and fourth
are worth knowing.

## Phase notes

Each phase's pull request adds what the next phase must allow for: decisions, traps, and the
check's findings.

### Phase 1: local OAuth spike (AC-1)

**Last check's findings:** none (first phase).

**Evidence.** `scripts/connector-oauth-spike.mjs` ran on the configured suite's local stack
(CLI 2.111.0, GoTrue v2.194.0) through `e2e/configured/connector-oauth.spec.ts`, which now keeps
it passing on every landing: [run 38281590911](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38281590911),
97 passed, 0 failed. Discovery answers with a registration endpoint and S256. A client registers
with no apikey (201). `/oauth/authorize` sends the browser to `http://localhost:5174/?authorization_id=…`.
Approving with the account's own session returns the code and the same state, and the code and
verifier buy an access token, a refresh token and an ID token. The access token carries
`client_id` and the test account's `sub`, and its ES256 signature verifies against the JWKS. The
rest of the suite passed with the hook on, so first-party sign-in is unchanged.

**Decision 4: the preferred form works.** The Custom Access Token hook
(`public.connector_access_token`, migration 0089, `[auth.hook.custom_access_token]`) sees
`client_id` in its input and sets `role` to `noacg_connector`, a role with no privileges that no
API role is a member of. PostgREST and Storage switch roles with SET ROLE, so they refuse the
connector token before reading anything: documents GET and POST and `rpc/control_show_by_slug`
answer `403 42501 permission denied to set role "noacg_connector"`, and Storage answers
`400 AccessDenied` with the same message. A first-party token reads documents and lists its Storage bucket (200). A refresh
keeps `client_id` and the role, and rotates the refresh token. The restrictive-policy fallback is
not needed. Leaving the role ungranted to `authenticator` is deliberate: Postgres gives EXECUTE on
new functions to PUBLIC, and a role the API cannot assume makes that irrelevant.

**Port-agnostic loopback: not accepted.** Redirect URIs match exactly. With `http://localhost/callback`
registered, `http://localhost:49152/callback` and `http://127.0.0.1:49152/callback` get
`400 invalid redirect_uri`. A client that registers per connection with the port it listens on
works (step 3 of the spike); Claude Code over DCR should be that case, unverified until phase 2's
scripted client or the owner's connection tries it.

**CLI pin.** 2.111.0, the version CI already pins, knows `[auth.oauth_server]` and ships GoTrue
v2.194.0 with the OAuth server, so no bump was needed. The research's "2.117+" is the Edge
Function block's requirement, not the OAuth server's. A local stack signs ES256 with the CLI's
built-in key when `signing_keys_path` is unset, so no private key is committed; a self-hoster sets
one.

**What the next phases must allow for.**

- **Auth's own account endpoints accept a connector token.** `GET /auth/v1/user` and
  `PUT /auth/v1/user` (user metadata) answered 200. GoTrue's `requireAuthentication` reads the
  session, never the role, `client_id` or `aud`, and the same middleware guards password and email
  change, MFA factors, `/logout` and `/user/oauth/grants`. So "a leaked token can do no more than
  the tools allow" holds for the database only. An owner judgement before switch-on:
  [issue #1083](https://github.com/NoaCG/NoaCG-Studio/issues/1083).
- **NoaCG's own API accepts a connector token today.** `api/_lib/auth.ts` `verifyUser` asks
  `auth.getUser`, which answers for a connector token, so `api/ai/generate.ts`, `api/render/start.ts`
  and every other signed-in route would serve it as the user. Phase 2 must make every route except
  the connector's refuse a token that carries `client_id` (the `resolvePrincipal` branch, plus
  `verifyUser`), with a test. No exposure yet: no hosted project issues such tokens.
- **The consent page is `/?authorization_id=<id>` on the site URL** (`authorization_url_path = "/"`).
  Phase 2 adds it as a query route in `App.tsx` beside `?agent=`, calling
  `GET /auth/v1/oauth/authorizations/{id}` and `POST …/consent {action}` with the user's session.
  The same route works on any hosted `site_url`.
- **Discovery by path insertion 404s locally.** The CLI's Kong does not route
  `/.well-known/oauth-authorization-server/auth/v1`; `/auth/v1/.well-known/oauth-authorization-server`
  and the OIDC form `/auth/v1/.well-known/openid-configuration` answer. Phase 2's protected
  resource metadata names the issuer `<supabase>/auth/v1`; check which form the scripted MCP
  client tries.
- **The token's `aud` is `authenticated`**, not the MCP resource, and the metadata advertises
  `plain` PKCE beside S256. The MCP 2026-07-28 audience check needs a decision in phase 2: verify
  `client_id` plus a grant row, or have the hook also set `aud` to the resource.
- **The MCP server must not forward the connector token to PostgREST**, which refuses it. Read
  and write with the service role and the principal's user id, as the plan already says.
- **An anon-callable capability RPC is refused to a connector token** even though the anon key
  alone reaches it (200). Harmless: the anon key is public anyway.

**Traps.**

- This machine could not start Docker Desktop (WSL `ERROR_NO_SYSTEM_RESOURCES`: the 4 GB VM cap
  in `~/.wslconfig` against about 3 GB free), and the session was not allowed to lower the cap.
  The evidence comes from CI's local stack instead. A checker with the same RAM can dispatch
  `configured-suite.yml` on `main`, or read its landing run, and search the log for
  `connector OAuth spike:`.
- Migration 0089 creates a role. `db:push` classifies it as additive and the build gate passes,
  but a hosted project could still refuse `create role`; that is a `needs owner` refusal, not a
  reason to reshape the migration. The hook stays off on hosted until the owner enables it.

### Phase 2: sign-in, grants and the closed database (AC-2)

**Last check's findings (phase 1 check):** PASS on CI run 38286615002 (97 passed; Docker could not
start on the checker's machine). The token carries `client_id`; the `noacg_connector` role is
refused on read, write, RPC and Storage; first-party sessions are unaffected; loopback redirects
match exactly. Asymmetric keys come from the CLI's built-in ES256 key, not `signing_keys_path`. A
connector token was accepted by `/auth/v1/user` and by NoaCG's `verifyUser` (phase 2 must refuse
it there). `aud` is `authenticated`. Path-inserted discovery 404s locally. Claude Code's
per-port registration is unverified.

**What was built.** `POST /mcp` and `/.well-known/oauth-protected-resource/mcp` are vercel.json
rewrites into the `api/me` catch-all (routes `mcp` and `oauth-protected-resource`; the dispatcher
also names them from the public path, since a rewritten request may arrive under either). The dev
server reads the same rewrites from vercel.json (`scripts/meDevPlugin.mjs`). Migration 0090 adds
`connector_grants` (RLS on, no policies, service role only, one live row per user and client,
`playout:operate` refused by a check constraint) and `connector_grant_resolve`, which stamps
`last_used_at`. The consent page is `ConnectorConsent.tsx` at `/app?authorization_id=` (the root
forwards the query, as it does for `?control=`). Settings → Account → Agent access lists connected
apps above keys. `api/_lib/me/connectors.ts` is Allow, list and Revoke.

**Evidence.** On a local stack on this machine (Docker started once RAM allowed; CLI 2.111.0,
dev server on the worktree's port), a scripted MCP client (`@modelcontextprotocol/sdk` 1.30.0,
now a root dev dependency pinned to the CLI's version) met the 401, read the metadata, discovered
Auth (the SDK falls back past the 404ing path-inserted URL on its own), registered, and was sent
to sign in. Deny returned `error=access_denied` and left no row. Allow wrote one row
(`graphics:read`, `graphics:create`, client name "Claude (scripted)"), the code bought a token
(iss `http://127.0.0.1:54321/auth/v1`, role `noacg_connector`, aud `authenticated`), `tools/list`
answered `[]`, a tool call reached the tool table (`-32602 Unknown tool`) and stamped
`last_used_at`. `/api/me/agent-keys`, `/api/me/connectors` and `/api/me/graphics` answered 401 to
the connector token. All 43 public tables, read and written, plus `storage.objects` and
`rpc/control_show_by_slug`, answered `permission denied to set role "noacg_connector"`. Revoke
answered 200; the next `/mcp` call 401; the refresh `400 refresh_token_not_found`. The browser
half (the consent page itself, Settings' Revoke button) is `e2e/configured/connector-grants.spec.ts`
on CI's local stack; the 503 half runs in the same file on hosted staging, whose Auth has no OAuth
server. Unit tests: `api/_lib/me/mcp.test.ts`, `connectors.test.ts`.

**Decisions.**

- *Audience (MCP 2026-07-28).* The token's `aud` stays `authenticated`. The binding is the grant
  row: a token is admitted only for the exact client the user approved on NoaCG's page, while that
  row is live. Setting `aud` to the resource in the hook stays possible (GoTrue never checks `aud`,
  per the #1083 research) but was not needed.
- *Connector tokens are verified locally* (`verifyConnectorToken` in `api/_lib/connectorAuth.ts`):
  asymmetric signature against the issuer's JWKS (refetched once for an unknown `kid`), `exp`, and
  `iss` equal to the discovery document's issuer. Never `auth.getUser` or `/oauth/userinfo`, so the
  #1083 hardening below cannot break `/mcp`. Revocation is the grant row, not the token's session.
- *The user id is read in one place:* `connectorUserId(claims)` in `connectorAuth.ts`, today
  `sub` (a UUID).
- *Only a connector principal reaches `/mcp`.* A session or an agent key gets the same 401 as no
  token, so a chat client is always sent to sign in. `resolvePrincipal` admits a connector token
  only with `{ connector: true }`; every other path, and `verifyUser`, treats it as anonymous.
- *Allow runs on the server, Deny does not.* Allow reads the client from Auth's own record of the
  authorization (never from the page), writes the grant, then approves; a grant it made is dropped
  if the approval fails. Deny goes from the page straight to Auth, so nothing in NoaCG can record
  it. If Auth answers "already consented" (a redirect only), the page follows it; with no live grant
  that token is anonymous at `/mcp` (fail closed).
- *Revoke marks the row first*, then deletes Auth's grant (`DELETE /user/oauth/grants`) with the
  user's session; if Auth does not answer, the call says so and can be repeated while the dialog is
  open, and the connector is already refused. Once Settings is closed the revoked row is no longer
  listed, so Auth's half cannot be retried from the UI; a client that kept its `client_id` would
  then be auto-approved by Auth and get tokens `/mcp` refuses. Rare and fail-closed; revisit if it
  is ever seen.
- *The consent page navigates only to http(s)* (`webRedirect`): clients register their own
  redirect URIs.
- *`last_used_at` is written at most once a minute per grant* (`connector_grant_resolve`), so a
  chatty client does not write a row per message.
- *Off.* "On" is read from Auth's discovery document (cached a minute per instance): without a
  registration endpoint every connector path, `/api/me/connectors` included, answers 503
  `connector_disabled`. Settings treats that as "no connected apps".
- *Both protocol eras, stateless.* Requests carrying `_meta["io.modelcontextprotocol/protocolVersion"]`
  are served by 2026-07-28 (headers checked against the body, `server/discover`, `resultType`);
  `initialize` negotiates 2025-11-25, 2025-06-18 or 2025-03-26. No session ids; GET and DELETE 405;
  a foreign `Origin` 403. PRM `scopes_supported` is `openid email`.

**What the next phases must allow for.**

- *The tool table is empty* (`TOOLS` in `api/_lib/me/mcp.ts`). Phase 3 adds tools with a
  `permission`; `tools/call` already asks `permits()` and returns `isError` when it is withheld.
  Add `graphics:read` to `ENFORCED_PERMISSION_KEYS` in the change that adds its call site.
- *Tools must not forward the token.* Read and write with the service role and
  `principal.userId`; `principal.clientId` and `principal.grantId` are there for the package's
  `origin` and audit.
- *Body cap* on `/mcp` is 1 MB; raise it in phase 4 only if a package needs more.
- *The per-IP limit* is `CONNECTOR_RATE_MAX` (120/min). Phase 4 should add a per-principal budget
  for `noacg_send_package`, as the save door has.
- *Grants accumulate per connection.* DCR makes a new client per connection, so a user who
  reconnects gets a second row and Settings shows the same name twice. Harmless; worth a "last
  used" sort or a merge by name if it confuses.

**For phase 5 and issue #1083 (owner decision pending; nothing decided here).** The research on
#1083 proposes that the Custom Access Token hook rewrite `sub` to a non-UUID and `session_id` to a
random nonexistent UUID on `client_id` tokens, moving the real values into NoaCG claims
(for example `noacg_uid`, `noacg_sid`), so every authenticated GoTrue endpoint refuses connector
tokens while refresh keeps working. Phase 2 is built to survive that: `/mcp` never asks Auth who
a token is. If phase 5 builds it, it must also: point `connectorUserId` at the new claim (and keep
the UUID check); keep `client_id` in the token (`oauthClientOf` and `verifyUser`'s refusal key on
it); never use an empty or nil-UUID `session_id` (GoTrue treats that as no session and serves the
user); pin in `connector-oauth.spec.ts` that `GET`/`PUT /auth/v1/user`, `/factors`, `/logout`,
`/user/oauth/grants` and the consent endpoint refuse a connector token, refresh still works, and
`connector-grants.spec.ts` still passes. Two phase 2 calls use the USER's first-party session and
are unaffected: Allow (`/oauth/authorizations/{id}` and `/consent`) and Revoke
(`DELETE /user/oauth/grants`). The consent page shows no text about Auth's account endpoints.

**Traps.**

- PostgREST's refusal message arrives JSON-escaped; compare against the parsed `message`, not the
  raw body (`permission denied to set role \"noacg_connector\"` in the text).
- `npm run dev:worktree` leaves vite running after its npm parent is stopped; kill the process on
  the port.
- On this machine the job queue's RAM floor refuses any browser run while the local stack is up
  (about 1.3 GB free with the stack); the browser half is proven on CI. Stopping the stack through
  the queue deadlocks on the same floor; run `npx supabase@2.111.0 stop` directly.

### Phase 2 repair: the consent page's double read

**Last check's findings (phase 2 check):** the consent page showed "This sign-in request cannot
continue" on 5 of 7 dev loads. React StrictMode runs `ConsentCard`'s effect twice, which sent two
overlapping `GET /auth/v1/oauth/authorizations/{id}`, and GoTrue answers one of them 404 (5 of 5
overlapping pairs; sequential pairs 200/200). `connector-grants.spec.ts` was red twice on main's
configured suite (run 38301494935) and flaky on 38299878376. Everything else in AC-1 and AC-2 held
(226/226 database refusals, 12 routes, Revoke, the 503 half, the #1083 constraint).

**Reproduced.** On a local stack (CLI 2.111.0), two overlapping GETs of a fresh authorization with
the user's session gave `404 oauth_authorization_not_found` and 200 in 5 of 5 pairs; two
sequential GETs gave 200/200. In a local headless browser each load sent its two reads in the
same millisecond, but GoTrue answered them about 60 ms apart and both 200, so 10 of 10 loads
passed there before the fix too. The race depends on timing, which is why CI and the checker's
machine lost it and this one did not.

**Decision: one read in flight per authorization, no retry.** `readConnectorRequest` in
`src/backend/connectorAccess.ts` keeps one in-flight promise per authorization id, so a second
effect run, a remount or a second caller during the read shares it and overlapping reads cannot
happen. Once it settles the entry is dropped: a later read (after signing in again, or as another
account) asks Auth afresh under the session the page has then, and sequential reads are answered
alike. Keeping the answer for the page's lifetime was tried first and dropped in review: it would
pin a transient 401 or network error past a sign-in, and show one account's answer to the next. A
retry on 404 was not added, because it would hide a real 404 (an expired or already answered
request) behind a second wait. `scripts/connector-request-once.test.mjs` pins it: it runs the
real module against a counted Auth stub and fails on the old code. After the fix, 10 of 10 first
loads on the dev server (StrictMode on) sent one read and showed the client name and both labels.

**What the next phases must allow for.** Anything else the page asks Auth about one
authorization must be idempotent or deduplicated the same way: a page-level effect runs twice in
development. Allow and Deny are button clicks guarded by `busy`, and are not affected.

**Traps.** A double read that passes locally is no evidence that there is no race: GoTrue's answer
depends on timing. Prove a concurrency fix with the HTTP-level pair, not only with page loads.

### Phase 2 second check (after the repair): PASS

On `main` at 8824cbf1, local stack (CLI 2.111.0) and this checkout's dev server with StrictMode on.

- **The race is gone from the page, not from Auth.** 12 of 12 signed-in first loads and 5 of 5
  signed-out first visits (fresh browser, sign in on the page) showed "Allow “Repro client”…" and
  exactly the two labels, each with one `GET /oauth/authorizations/{id}` (200). GoTrue still
  answers one of two overlapping reads 404 (5 of 5 pairs), so the in-flight sharing in
  `readConnectorRequest` is what holds it. `connector-grants.spec.ts` passed first try on main's
  configured suite twice: [38311447932](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38311447932)
  (push) and [38312673116](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38312673116)
  (dispatched), each 98 passed, 0 flaky. It stays in quarantine until its consecutive passes
  release it.
- **AC-2 held point by point.** 401 with the metadata pointer; metadata names the local issuer.
  Deny returned `access_denied` and left no row; Allow wrote one grant with the two permissions,
  the token carried `client_id` and role `noacg_connector`, a tool call reached the tool table and
  stamped `last_used_at`; a first-party session at `/mcp` got 401. 12 other routes treated the
  connector token exactly as no token. 43 tables x GET/POST/PATCH/DELETE, 51 RPCs and Storage
  list, upload and buckets: 226 of 226 refused for the role. Revoke in Settings removed the row;
  the next tool call 401, the refresh `400 refresh_token_not_found`.
- **Off.** Against an Auth with no OAuth server, `/mcp`, the PRM and `/api/me/connectors` answer
  503 `connector_disabled`, with or without a bearer; production `https://noacg.studio` answers
  the same on all three today.
- **#1083 constraint.** The API unit tests (343 pass) include "verified locally against the
  issuer's JWKS, never by asking Auth who it is" and "verifyUser refuses a connector token before
  asking Auth".
- **AC-1 still holds:** `scripts/connector-oauth-spike.mjs` on the local stack, 11 of 11 required
  checks; `connector-oauth.spec.ts` green in both runs above.
- **For the next phases.** The 503 half of `connector-grants.spec.ts` skips on the local stack and
  would run only in `hosted-latency.yml`, which has not run since 2026-10-11 (red then). Its
  evidence today is the local stub, the unit test and production's answer.

### Phase 3: read tools (AC-3)

**Last check's findings (phase 2 second check, #1096):** the race is fixed in the page (GoTrue
still answers one of two overlapping reads 404; one read in flight per id holds it), 17 of 17
loads showed the client and both labels, `connector-grants.spec.ts` green twice on main (still in
quarantine from #1094), AC-1 and AC-2 hold locally (226 of 226 refusals, Revoke, 503 on the stub
and on production, the JWKS unit tests). Gap: the 503 half of that spec runs only in
`hosted-latency.yml`, which has not run since 2026-10-11 and was red then (#987).

**What was built.** `tools/list` answers `noacg_catalog` and `noacg_library`
(`api/_lib/me/connectorTools.ts`), each with a title and `readOnlyHint: true`,
`destructiveHint: false`, `openWorldHint: false`; `initialize` gains a one-sentence
`instructions`. The catalog index is `/catalog-index.json`, generated from the type registry by
`scripts/catalogIndexPlugin.mjs`: the dev server answers it from its module graph, `vite build`
writes it into `dist/` after the bundle with a middleware-mode server of its own, and the preview
server serves the built file. Its shape is `src/templates/catalogIndex.ts`, its builder
`catalogIndexBuild.ts`.

**Evidence.** On a local stack on this machine (CLI 2.111.0, the dev server Playwright starts),
`e2e/configured/connector-tools.spec.ts` passed first try: accounts A and B each signed in a
scripted MCP client through registration, the authorization URL, Allow at `/api/me/connectors`
with their own session, and the code exchange. `tools/list` returned both tools with all three
hints (1,097 characters). `/catalog-index.json` served 69 types; `noacg_catalog` with category
`scoreboard` returned 8 types all in that category, and "lower third name title" put
`lower-third` first with its `name` and `title` fields, designs, and palette and font ids that
resolve in the same answer. `noacg_library` gave A exactly A's graphic (fields Name, Title),
brand, production and A's team production (labelled "A team"), and B exactly B's; neither
answer held the other's ids or the template-source marker written into every seeded template,
data URL and asset. A's team production came back with its pool graphic (`graphicId`, layer)
and its cue by graphic name with its values; B's production and B's team production were refused
to A. `connector-oauth.spec.ts` passed in the same run (AC-1). The configured suite on this
branch's final commit (CI's local stack): [run 38321190642](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38321190642),
99 passed, 0 failed, 0 flaky, with `connector-tools`, `connector-grants` (consent page, 43
tables refused, Revoke) and `connector-oauth` all green. Unit tests:
`connectorTools.test.ts` and `mcp.test.ts` (the schema ceiling, the hints, permits), 354 pass;
`scripts/catalogIndexPlugin.test.mjs` builds the real index and checks every type has fields and
designs, every design id is unique, and every design's palette and font are in the index.

**Decisions.**

- *No `noacg_guide`* (key decision 6). Reading needs no contract text. What a recipe looks like
  belongs to the send tool's own schema; the guide earns its place only if that cannot fit under
  the ceiling.
- *Schema ceiling:* 3,500 characters of the `tools/list` JSON, which is under 1,000 tokens at 3.5
  characters a token (JSON schemas measure more; the CLI's measured about 4.1). Pinned in
  `mcp.test.ts` over every tool. The read tools use 1,097, leaving about 2,400 for the send tool.
- *The index holds the type registry only:* 69 types, 317 designs, 20 palettes, 17 fonts, 95 KB.
  Hand-written variants outside the registry (camera frames, sponsor strips, `card04`, `vs01`,
  `ig01`-`ig07`) are not in it, because the scaffold that realizes a recipe takes a type and a
  design.
- *The tool reads the index over HTTP from the request's own origin*, cached ten minutes per warm
  instance. Search: a category by id or name; words ranked by prefix match (two points for the
  type's own text, one for a design's); at most eight types (9 to 17 KB an answer) with `more`;
  palettes and fonts in every answer. No arguments: every category and type by name (9 KB).
- *The library is read with the service role, scoped by `principal.userId`*: `documents` of kind
  `graphic`, `look` (a brand is a saved look; the retired `brand` singleton is not listed) and
  `show`, not deleted; the user's `team_members` rows to `teams` to `team_productions`. A personal
  record of the same id as a team production (what a move leaves) is not listed. Lists are names,
  types and folders, newest first (own and team productions merged), 100 at most with `more`;
  fields are read afterwards for the graphics answered, since a stored field can hold an inlined
  file. The store reads at most 1,000 rows of each kind (PostgREST's row cap), and an answer says
  `searched: "the newest 1000 of each kind"` when that limit was reached. A brand carries `font`
  (a bundled font id) or `customFont` (an imported family's name), never one key for both. A
  production's graphics and cues come only with `production: <id>`, because a production body
  carries every template and the listing should not read them. Values are repeated only when
  short and not a data URL; no `html`, `css`, `js` or assets ever leave.
- *Permissions:* `graphics:read` is enforced (`ENFORCED_PERMISSION_KEYS`) by `noacg_library`;
  `noacg_catalog` needs none (public data) but is still only reachable as a connector.

**What the next phase must allow for.**

- *Two kinds of field key.* A catalog recipe fills the type's LOGICAL keys (`name`, `title`, the
  scaffold's `values`); a library graphic and a cue use SPX field ids (`f0`, `f1`). The send tool
  must take each on its own entry kind and refuse the other with an actionable error.
- *Ids the send tool resolves:* type and design ids (design ids are unique catalog-wide, pinned),
  palette and font ids from the index, a brand as a `look` document id, a library graphic id. It
  reads the graphic's sources itself with the service role in the same user scope; the read tool
  never returns them. A team production's `brandId` may name another member's look, which the
  caller cannot use.
- *Tool calls get a context* (`McpToolContext.origin`), the deployment origin.
- *The catalog fetch is a request to the deployment itself.* A deployment behind Vercel Deployment
  Protection would answer it 401 and `noacg_catalog` would fail. Phase 5's staging switch-on must
  check the staging domain is reachable from its own functions (or send the automation bypass).
  The origin comes from the request URL, which on Vercel is a routed domain; on the dev server it
  follows the `Host` header. If either becomes a problem, ship the index inside the function
  (`includeFiles`) instead of fetching it.

**Traps.**

- `tsconfig.api.json` compiles type-only imports transitively without the DOM lib, so api/
  importing a type that imports the registry's types fails on DOM modules. That is why
  `catalogIndex.ts` imports nothing and the builder is a second file.
- Vite calls `closeBundle` when a dev server closes, not only after a build; the plugin writes
  only for `vite build`.
- Docker Desktop here: the first launch fails ("Docker Desktop is unable to start"). Killing only
  `Docker Desktop.exe` leaves `com.docker.backend.exe` running and the relaunch fails again; quit
  both, then relaunch (up in 9 s). A fresh worktree has no `node_modules`; run `npm ci` first.

### Phase 4: send (AC-4)

**Last check's findings (phase 3 check):** PASS, 60 of 60 locally (three accounts; leak attempts
by id, by words, by undeclared arguments, by forged tokens and after leaving a team were all
refused); the index built, production byte-identical, 69 types; main's configured suite
38326104062 green. Notes: `additionalProperties: false` is not enforced (undeclared arguments are
ignored, harmless); a team production's `brandId` or `graphicId` can name a teammate's look or
graphic (ids only), so phase 4 must refuse those for the caller; the 503 half still skips locally
(#987); about 2,400 characters were left under the schema ceiling for the send tool.

**What was built.** `noacg_send_package` (`api/_lib/me/connectorSend.ts`), title "Send a package
to Home", `readOnlyHint: false`, `destructiveHint: false`, `openWorldHint: false`, permission
`graphics:create`. It takes a production name, an optional brand id, graphics and an ordered
rundown, and writes ONE row to `agent_packages` (the CLI door's waiting table, migration 0065), so
the package waits on Home → Productions like a `noacg pack --save` one. The pack format gains two
additive v1 parts (`src/packs/graphicsPack.ts`, docs/GRAPHICS_PACKS.md): a RECIPE graphic entry
(`{ name, recipe: { type, design, palette?, font?, values? }, layer?, cues? }`) and a pack `brand`
(`{ id?, name, look }`, a saved look as data). `installPack` first builds each recipe with
`templateFromRecipe` (`src/templates/types/recipeTemplate.ts`, which the bridge scaffold now calls
too), applies the brand to every graphic with `applyLookToTemplate`, points the production at the
look when the account has that look, then validates and installs as before. The package door's
shape guard (`packageShape.ts`) accepts and narrows both parts, so the CLI door and the connector
store one format. New dependency edge: `packs` -> `templates/types/recipeTemplate` (ARCHITECTURE §3
and `.dependency-cruiser.cjs`). No migration: `agent_packages.origin` was already jsonb.

**Evidence.** On a local stack on this machine (CLI 2.111.0, Docker relaunched once, the dev
server Playwright starts), `e2e/configured/connector-send.spec.ts` passed: account A's scripted
client (`@modelcontextprotocol/sdk`) signed in through registration, the authorization URL, Allow
with A's session and the code exchange, then sent three recipes (`lower-third`, `title-card`,
`logo-bug`), a copy of A's own graphic, A's brand (its logo a Storage reference, as sync leaves
it) and four cues. One row was stored, origin `{ tool: "noacg-connector", client, grant }`.
Another account's graphic and brand, a design of another type, a value key the type lacks, the
waiting cap (25) and the send budget each got a sentence and stored nothing. Install on Home in a
browser as A opened the production: four graphics on their layers, every one passing
`publishGate` and `productionGateFailures` empty, every one carrying the brand's accent, the
brand's mark in the logo bug, the production's `brandId` set to the look, the cues in order with
the run sheet's values under the SPX ids (`name`/`title` became `f0`/`f1`). Published, its first
cue taken, the browser source showed "Anna Andersson / Pastor" on air in the brand's colours
(opacity and size checked, screenshot looked at). A pack file with a recipe entry then installed
through Import and passed the gate. `connector-tools.spec.ts` passed in the same run with the
three tools. `tools/list` is 2,726 characters for three tools (ceiling 3,500). Unit tests:
`connectorSend.test.ts` (the package built, 19 refusals storing nothing, the cap, the budget,
an asset outside the user's own Storage folder), `packages.test.ts` (the recipe and brand shape),
`mcp.test.ts` (three tools, the send tool's hints and permission, the ceiling); 379 pass. The
configured suite on the branch ([run 38330971066](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38330971066),
99 passed, 1 failed) passed `connector-send.spec.ts` on CI's local stack; the one failure was
`connector-grants.spec.ts` still expecting two tools, fixed in the follow-up that adds the third.

**Decisions.**

- *`noacg_guide` stays dropped.* The send tool fits: the three tools are 2,726 characters, under
  the 3,500 ceiling, and the descriptions say what a recipe is.
- *Own means `user_id` is the caller.* Graphics and the brand are read from `documents` with
  `user_id = principal.userId`, so a teammate's look or graphic named by a team production is
  refused like an unknown id ("no graphic ... in this user's own library; a teammate's cannot be
  sent"). A team's own brand would need a team-scoped read; not in this phase.
- *Two kinds of key, one stored key.* A recipe's `values` and its cues use the type's logical keys
  (the catalog index's field keys, the logo slot excluded: the brand fills it); a copy's cues use
  its SPX field ids. The server translates a recipe's cue keys to `f0..fN` (the type's declaration
  order, `typeFieldsToSpx`), so the stored rundown speaks SPX ids like every pack. The wrong kind is
  refused with the list of the right keys.
- *The brand travels as data and applies to every graphic,* the copy included, as the studio's
  "Apply brand to all graphics" does. A recipe for a design with a logo slot is built with the
  slot on when the brand has a mark (the wizard's own rule: never into a picture slot, never where
  the design drew none). The brand's colours win over a recipe's `palette`.
- *Stored assets are read back as data.* The studio's sync stores a look's logo and a graphic's
  files in the `user-assets` bucket behind `spx-storage:` references; the tool downloads them with
  the service role, only under `<user id>/`, so the pack installs on any device and through Import.
- *Send budget:* `CONNECTOR_SEND_RATE_MAX`, 10 a minute per user, every call counted, before
  anything else is read. The waiting cap is the CLI door's 25, shared.
- *Recipe entries in a file are checked at install,* not by the shape guard: the guard checks ids
  are catalog-shaped strings, the connector checks them against the index, and `templateFromRecipe`
  refuses an id the build does not have with a sentence naming the graphic.
- *Until install, a recipe entry's template is a placeholder* (type `blank`, no code). Anything that
  validates a parsed pack without installing it (the community shelf's checks) would refuse a
  recipe pack; community packs with recipes are not a goal of this plan.

**What the next phase must allow for.**

- *AC-5's single scripted run* can reuse `connector-send.spec.ts` as is; it mints its own two
  accounts and cleans up its OAuth client, users and Storage object.
- *The skill's reference text* can describe the chat path as: catalog recipes, copies of the user's
  own graphics, a brand id, cues by field key (recipes) or field id (copies), Install on Home.
- *A package's body is a pack file again,* so the CLI could later send recipes too; no CLI change
  was made.
- *The 503 half* of `connector-grants.spec.ts` still runs only on hosted staging (#987).

**Traps.**

- *A graphic's text is in the markup before it plays.* A browser source check must look at the
  frame's opacity and size, not only at `#f0`'s text (the first try of this spec passed on a blank
  output); `output-cold-boot.spec.ts` says the same.
- *The studio fills a cue's other fields from the graphic's defaults* at install (the brand mark's
  path among them), so assert the run sheet's keys with `objectContaining`, not the whole map.
- *The job queue's RAM floor (4 GB) refuses a browser run while the local stack is up* on this
  machine (1.7 GB free); the spec was run directly, then the stack stopped.

### Phase 5: ready, and off in production (AC-5)

**Last check's findings (phase 4 check):** PASS end to end locally on effab612: consent, library
and catalog picks, one waiting row, Install passes the gate, cues on air in brand colours, Import
of a recipe pack; every refusal actionable and storing nothing; main's configured suite
38334080210 green (100/0/0). Findings: empty recipe fields kept the design's sample text (a
church card aired "ELECTIONS 2026"), so blank them or say so in the tool description; the Home row
said "sent from your coding agent" for a connector package; the send budget let 9, not 10, a
minute through; the 503 half is still unchecked on hosted (#987).

**What was built.**

- *The account lock (#1083).* Migration 0091 extends the access token hook: on a token carrying
  `client_id` it moves the user id to `noacg_uid`, sets `sub` to `noacg-connector:<user id>` (no
  UUID parser form takes 52 characters) and `session_id` to a fresh random UUID. Auth's account
  middleware loads the user by `sub` first, so every endpoint that acts as the user answers
  `400 bad_jwt` before reading anything. `connectorUserId` reads `noacg_uid` and nothing else, so
  `/mcp` refuses a token issued without the lock.
- *No ID token.* The protected resource metadata asks for `email` only, and NoaCG's Allow refuses
  a request whose scope (as Auth recorded it) includes `openid`, or names no scope at all, before
  any grant or approval. Behind that, `verifyUser` refuses a token that names no session (an ID
  token names none), so NoaCG's own API never serves one even if a client held it.
- *Pinned:* `connector-oauth-spike.mjs` gains three required checks (`account_claims_locked`,
  `connector_account_refused`, `first_party_account_allowed`; 14 in all), so
  `connector-oauth.spec.ts` fails on any landing that reopens the account endpoints.
  `connector-grants.spec.ts` checks the client holds no ID token and that an `openid` request is
  refused with no grant; its 503 half now asks Auth whether the OAuth server runs instead of
  guessing from the URL. The connector specs run on one hosted test project named in
  `NOACG_CONNECTOR_TEST_REF` (a preview branch, or staging once it is on); production is refused.
- *Phase 4's findings:* a recipe's text lines left out are stored as blank (number lines such as
  a score, and other fields, keep the design's default: a working setting, not sample copy),
  and the values description says so; the Home row says "sent from a connected app", the name
  Settings gives the connector; the send budget is an exact count of calls in the last minute
  (`hitCallLog`), because the two-window estimate still charged a call made 61 s earlier.
- *The chat path* in the skill's setup reference (`cli/skill/.../references/setup.md` and its
  generated copy): the connector assembles, the CLI also makes.
- *The owner's runbook and the security review*, above.

**Evidence: a hosted preview branch of production.** Branch `connector-p5-proof` (ref
`pdonkjqmgtcdwikhwbax`, eu-west-1, Postgres 17), created through the Management API at 06:09 UTC
on 2026-10-13 and deleted at 06:35 (the branch list then held only `main`, and the project
answered 404 "Resource has been removed"). Cost: Micro compute for under half an hour, about
0.01 USD, against the owner's 2 EUR cap. Production's Auth was only read (OAuth server off, hook
off, notifications off, before and after). The branch came up at migration 0073; 0074 to 0091
were applied through the query endpoint (`create role` in 0089 worked on hosted; 0074's
`concurrently` was dropped for that endpoint's transaction). Branch-only Auth config: OAuth
server with dynamic registration, authorization path `/`, the hook, `site_url` the local dev
server. Test accounts were minted by the specs and deleted by them.

- *The refusal.* With a real connector token (ES256, the branch's own key): `GET /user`,
  `PUT /user` (metadata and password), `POST /factors`, `GET /user/oauth/grants`, reading and
  approving another client's request, and `POST /logout?scope=global` each answered `400 bad_jwt -
  invalid claim: sub claim must be a UUID`; the metadata was unchanged and the account's own
  password still signed in; PostgREST, RPC and Storage answered `permission denied to set role
  "noacg_connector"`; a refresh kept the lock. *Control on the same branch* with 0089's hook (no
  lock): the same probes answered 200 and 204, the password changed, a TOTP factor was enrolled
  and the user was signed out everywhere. *ID token:* with `openid`, `GET` and `PUT /user` with
  the ID token answered 200 and the metadata changed, lock or no lock; hence `email` only.
- *The flow (AC-2 to AC-4)* through this checkout's dev server on the branch, with the
  `@modelcontextprotocol/sdk` client: `connector-oauth`, `connector-tools`, `connector-grants`
  (the consent page in a browser, 43 tables refused, Revoke) and `connector-send` (one package of
  three recipes, a copy and a brand; Install on Home; published; the first cue on air in the
  brand's blue, screenshot looked at; the card's left-out lines blank; Import of a recipe pack).
  `tools/list` is 2,814 characters.
- *Repeat runs, consecutive, no retries:* the spike 10 of 10 (median 2.2 s), then
  `connector-oauth` and `connector-tools` 4 of 4 each, `connector-grants` and `connector-send` 3 of
  3 each. Two spike runs in between failed by design (the control) or on Auth's registration limit
  (`429` after about 40 registrations in ten minutes), not on NoaCG.
- *Real client:* the MCP SDK client the CLI ships. Claude Code's `claude mcp add --transport
  http` needs a person to sign in in a browser, so it was not run; Claude.ai's first connection
  is runbook step 6.
- *Off in production:* `POST https://noacg.studio/mcp`, the PRM and `/api/me/connectors` each
  answered 503 `connector_disabled` (2026-10-13, after the branch was deleted).
- *CI's local stack:* the configured suite on this branch's final code,
  [run 38359107581](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38359107581): 100 passed,
  0 failed, 0 flaky, with the spike's 14 checks and all four connector specs green (`tools/list`
  2,807 characters there, after the values description was shortened).

**Decisions.**

- *Build the control, and refuse `openid`.* Both hold on hosted; nothing needs accepting to
  switch on. If a chat client turns out to insist on `openid`, that is a new owner decision (the
  review says what it would cost).
- *`noacg_uid` only, no fallback to `sub`.* A token without the lock is refused at `/mcp`, so the
  connector cannot run on an Auth whose account endpoints a token still opens.
- *Blank lines, not a description warning.* A blank line shows on Home and in the studio before
  air; a sample line is not noticed until it airs. Only text lines: blanking a score, a clock, a
  "LIVE" word or a choice would break the graphic. Only on the connector's path: the CLI's
  scaffold keeps samples for a draft an agent then edits, and a recipe in a pack file is its
  author's.
- *"Connected app"* on the Home row, the word Settings already uses, rather than the client's
  self-declared name, which the waiting row does not store.
- *An exact send budget* for this gate only; the per-IP gates keep the estimate, where one call of
  slack does not matter.
- *No current-password requirement.* The lock makes it unnecessary for the connector, and it
  would break Settings' password form.

**What the owner's switch-on must allow for.**

- Hook before OAuth server, and never the hook off while the OAuth server is on (runbook).
- Auth's dynamic registration limit is about ten per five minutes per address (burst 30). A chat
  service registering from a few addresses could meet `429` on a busy day.
- The 503 half of `connector-grants.spec.ts` skips on staging once staging is on; production's
  503 is then the runbook's curl, and after production's switch-on it answers 401 by design.

**Traps.**

- `supabase link` (CLI from npx) failed against a fresh branch with `LegacyLinkApiKeysNetworkError`
  (a date-format schema error in the API keys answer), so `db:push --ref <branch>` could not
  push; the Management API's query endpoint applied the files instead.
- The registration limit bites test loops: about 40 registrations in ten minutes met `429`, and a
  spike step that registers a second client then reads as a failure. Wait five minutes.
- `GET v1/branches/{id}` returns the branch's database password and JWT secret in its body; read
  the status from the branch list instead.
- The job queue asked 4 GB free for the browser specs with about 2 GB free (Docker not running),
  so they were run directly, one worker, as phase 4 did.

### Phase 5 check: FAIL (product), the runbook's off switch

On `main` at f7facccb, 2026-10-13: a fresh local stack (CLI 2.111.0, volume recreated, 0091
applied), this checkout's dev server, then one throwaway preview branch of production.

- **The off command does not turn the connector off.** "Turning it off" sends
  `{"oauth_server_enabled":false,"oauth_server_allow_dynamic_registration":false}`; the Management
  API answers `400 "Both OAUTH_SERVER_ENABLED and OAUTH_SERVER_AUTHORIZATION_PATH must be provided
  together when updating OAuth configuration"` and changes nothing. The `patch` helper only greps
  for the key, so it prints nothing and the owner sees no error; on the branch the dev server
  still served a connector token 80 s later and discovery still offered registration. With
  `"oauth_server_authorization_path":"/"` added the call answered 200, and `/mcp`, the PRM and
  `/api/me/connectors` answered 503 `connector_disabled` within 40 s. To fix: that body in
  "Turning it off", and a `patch` that prints the error when its key is not in the answer
  (the same silence would hide a failed step 2, 3 or 4).
- **The rest of the runbook holds, run verbatim on the branch** (ref `ttncixlmgvdjkekfnxvx`):
  step 1's signing-key grep printed its line on production, staging and the branch;
  `check:migration-drift` says both hosted projects hold all 89 migrations; steps 2, 3 and 4
  each printed `true`, and the dev server's `/mcp` then answered 401. The hook-off rollback
  `{"hook_custom_access_token_enabled":false}` answered 200 on its own. The order is right
  (emails, hook, OAuth server; OAuth off before hook off). The field names match production's
  and staging's config, which were only read: OAuth server, hook and notifications off on both.
- **#1083 lock, on evidence of my own** (an independent probe, not the spike; token from NoaCG's
  own Allow), locally and on the branch alike: `GET`/`PUT /user` (metadata, password, email),
  `POST /factors`, `DELETE /factors/{id}`, `/reauthenticate`, `/user/identities/authorize`,
  `GET` and `DELETE /user/oauth/grants`, another client's request read and approved, and
  `POST /logout?scope=global` each answered `400 bad_jwt - sub claim must be a UUID`; metadata,
  email and factors unchanged, the own password and first-party session still worked, the
  tools still answered. A refresh kept the lock. An `openid` request got 403 at Allow with no
  grant; the consent page shows the reason in red above its buttons once Allow is pressed. A
  request with no scope is recorded by Auth as `email` and gets no ID token. An ID token obtained by
  approving `openid` straight at Auth is refused by `/mcp` and `/api/me/*` (401), while Auth's
  `/user` accepts it (200), which is why Allow refuses `openid`. The spike: 14 of 14 locally
  and on the branch (PostgREST and Storage refused there too).
- **AC-1 to AC-4 in one scripted run:** the four connector specs together, one worker, no
  retries, on the fresh local stack: 4 passed, 1 skipped (the 503 half, by design locally).
  Screenshots looked at: the consent page (client name, the two labels), the Home row ("4
  graphics · sent from a connected app"), and "Anna Andersson / PASTOR" on air in the brand's
  blue.
- **Off in production:** `POST` and `GET https://noacg.studio/mcp` (with and without a bearer),
  the PRM and `/api/me/connectors` each answered 503 `connector_disabled`;
  `/catalog-index.json` serves (95 KB). The skill's setup reference has the chat path in both
  copies.
- **User outcome:** a chat client's flow (sign in, consent, tools, send, Install on Home, on air)
  works end to end locally and the lock holds on hosted Auth. Production is off. Switching on
  is safe by the runbook, but switching off again is not until the off body is fixed.
- **Not checked (needs a person):** Claude Code's `claude mcp add` sign-in and Claude.ai's
  first connection.
- **Hosted branch:** `connector-p5-check`, created 07:44:56 UTC and deleted 07:50:46. The
  branch list then held only `main` and the branch's query endpoint answered 404 "Resource has
  been removed". Micro compute for 6 minutes, under 0.02 USD.

**Traps.**

- *A local stack can start on a stale volume.* `supabase start` reused another session's volume
  that was at 0090 and applied nothing new, so the spike failed 4 of 14 checks: no `noacg_uid`,
  and the account endpoints were open (it changed the test account's password and signed it
  out). Run `npx supabase@2.111.0 stop --no-backup` before `start` for a fresh stack, and check
  `select max(version) from supabase_migrations.schema_migrations`.
- *The off-switch failure is silent* because `patch` greps for success. Read the HTTP status
  when testing any runbook call.

### Phase 5 repair: the runbook's off switch

**Last check's findings:** FAIL product: the runbook's off body was refused by the Management API
(`400 "Both OAUTH_SERVER_ENABLED and OAUTH_SERVER_AUTHORIZATION_PATH must be provided
together"`), and the `patch` helper grepped for its key and hid the error (it would have hidden a
failed step 2, 3 or 4 too). Fix: add `oauth_server_authorization_path` to the off body, and make
`patch` print the error. Everything else held: steps 1 to 4 verbatim on a throwaway branch, the
#1083 lock (`400 bad_jwt` on every account endpoint, locally and hosted), `openid` refused with
403, AC-1 to AC-4 in one run (4 passed, 1 skipped by design locally), production 503.

**What changed.** Only the runbook. The off body names the authorization path. `patch` takes the
body alone: on a 2xx it prints every setting it sent as Auth now holds it; on anything else it
prints `REFUSED, HTTP <status>: <Auth's message>` to stderr and returns 1; with no answer at all
it prints `REFUSED: no answer`. Step 1's signing-key line says that no output means stop.
"Turning it off" says what it prints, and that off is a pause: connections not revoked work
again after a switch-on. Every other body was read for the same pairing rule and run on the
branch: step 2, step 3's hook (enabled and URI together already) and step 4 were accepted, and
the hook-off rollback `{"hook_custom_access_token_enabled":false}` was accepted on its own.

**Evidence: a throwaway preview branch of production.** Branch `connector-p5-repair` (ref
`zitmesddhqlrvhhmjahl`), created 07:57:26 UTC on 2026-10-13 through the Management API; it came
up at 0073 and 0074 to 0091 were applied through the query endpoint. The runbook text was taken
from this file by a script (setup block, step 1's curl, every `patch` line), with only `REF`
swapped for the branch, and run against this checkout's dev server on the branch. One test
account and one OAuth client were minted for the run; the account was deleted, the client went
with the branch.

- *On, verbatim:* step 1 printed `"algorithm":"ES256","status":"in_use"`; step 2 printed all
  seven notification settings `true`; step 3 `"hook_custom_access_token_enabled":true` and the
  URI; step 4 `"oauth_server_enabled":true`, `"oauth_server_allow_dynamic_registration":true`,
  `"oauth_server_authorization_path":"/"`. A connector token minted through NoaCG's Allow then
  got `200` with a result from `noacg_library` at `/mcp`; `/mcp` without a token 401, the PRM
  200; Auth's `/user` with the token `400 bad_jwt`; PostgREST `permission denied to set role
  "noacg_connector"`.
- *A refused body is loud:* the old off body printed `REFUSED, HTTP 400: {"message":"Both
  OAUTH_SERVER_ENABLED and OAUTH_SERVER_AUTHORIZATION_PATH must be provided together when
  updating OAuth configuration"}` and returned 1, and the branch's Auth still read OAuth server
  on; a malformed body printed `REFUSED, HTTP 400: {"message":"Expected double-quoted property
  name in JSON at position 30 ..."}`.
- *Off, verbatim* at 08:00:15: printed `false`, `false`, `"/"`. Auth's discovery answered 404
  within 15 s; at 08:01:04 (49 s) `/mcp` with the token answered `503 connector_disabled`, and
  `/mcp`, the PRM and `/api/me/connectors` without one each answered 503. The hook-off rollback
  then printed `"hook_custom_access_token_enabled":false`.
- *Reversible:* steps 1 to 4 again at 08:01:32 (all printed as above); `/mcp` 401 and the PRM
  200 at 08:02:14. The token minted before the first off worked again (200 result). Off again
  at 08:02:24: all three paths 503 at 08:03:24.
- *Deleted* at 08:03:38: the branch list then held only `main`, and the branch's project
  answered 404 "Resource has been removed". Micro compute for about 6 minutes, under 0.01 USD
  (phase 5 in all about 0.04 USD of the owner's 2 EUR). Production's and staging's Auth were
  only read, before and after: OAuth server off with no authorization path, hook off,
  notifications off.
- *Production after:* `POST /mcp`, the PRM and `/api/me/connectors` on noacg.studio answered 503
  `connector_disabled`.

**Decisions.**

- *Report each setting as Auth holds it, not the key the caller names.* The second argument was
  where the silence came from; printing every sent setting also shows a 200 that kept a value.
- *Keep `"/"` in the off body* rather than `null`: it is the value step 4 sets, so switching on
  again is the same call, and Auth accepts it with the server off.
- *Say that off is a pause*, not a revocation: measured, and it matters if the owner turns the
  connector off because of an incident.

**What the owner's switch-on must allow for.** Each `patch` line prints its settings; a line
starting `REFUSED` means that step did not happen. Nothing else changed from phase 5's list.

**Traps.**

- *The Management API pairs OAuth fields:* any change to the OAuth server must send
  `oauth_server_enabled` and `oauth_server_authorization_path` together.
- *Deleting the test OAuth client after off answers 404* (Auth's admin OAuth routes go away
  with the server); the branch's deletion removes it.
- *Stopping a backgrounded `vite` through the shell leaves its `node` child listening* on
  Windows; kill it by PID (`netstat -ano`).

### Phase 5 second check: FAIL (product), the runbook's project switch

On `main` at dd2bcbaa, 2026-10-13, with this checkout's dev server on one throwaway preview
branch of production. No product code changed since the first check (#1104), so AC-1 to AC-4 and
the #1083 lock rest on that check's evidence (one scripted run on a fresh local stack, the lock
on every account endpoint locally and hosted); the lock was spot-checked again on the branch.

- **Changing `REF` does not change the project the runbook acts on.** The setup block expands
  `AUTH` from `REF` once, when it is pasted, and `patch` and step 1's curl use `AUTH`. Step 6 says
  "steps 1 to 4 with `REF=kprolrchuldgfrzspthy`"; in the shell that ran staging, typing that
  leaves `AUTH` on staging (measured: after `REF=kprolrchuldgfrzspthy`, `AUTH` still ended in
  `garafohbzmsybtysxphb/config/auth`). Every step then succeeds and prints `true` against staging,
  and step 1 checks staging's key. The same holds for "Turning it off": it names no project, and
  a fresh paste of the setup block gives staging's `REF`, so during an incident on production the
  off call would turn staging off, print `false`, `false`, `"/"`, and leave production on, with
  nothing in that section that checks production. Step 4's curl on noacg.studio would show the
  switch-on mistake (503, not 401); nothing shows the switch-off mistake. To fix: build the URL
  from `REF` inside `patch` and step 1's curl (or say to paste the whole block again with the
  new `REF`), say in "Turning it off" to set `REF` to the project, and end that section with the
  production check (`curl -sS -o /dev/null -w '%{http_code}\n' -X POST https://noacg.studio/mcp`
  answers 503).
- **The runbook works as written for the project `REF` names**, taken from this file by a
  script with only `REF` swapped for the branch, in Git Bash with the token line from a CRLF
  `.env` (the token keeps its trailing CR, and curl accepted every call with it). Step 1's
  signing-key line printed `"algorithm":"ES256","status":"in_use"` on the branch, production and
  staging; `check:migration-drift` says both hosted projects hold all 89 migrations. Steps 2, 3
  and 4 printed every setting `true` (and the hook URI, the path `"/"`), exit 0.
- **On:** a test account's first-party token kept a UUID `sub` with the hook on, and
  `/api/me/connectors` answered 200. Through the dev server: `/mcp` without a token 401 with
  `resource_metadata`; the PRM named the branch's Auth and `email` only. A client registered,
  authorized with PKCE and `scope=email`, and NoaCG's Allow returned a code; the ES256 token
  carried `client_id`, `sub` `noacg-connector:<id>`, `noacg_uid` the user, role
  `noacg_connector`, and no ID token. `/mcp` `initialize`, `tools/list` (three tools, 2,851
  characters) and `noacg_library` answered 200.
- **Lock spot-check on hosted:** with that token, Auth's `GET` and `PUT /user` (metadata and
  password), `POST /factors` and `POST /logout?scope=global` each answered `400 bad_jwt - invalid
  claim: sub claim must be a UUID`; PostgREST 403 and Storage refused, both `permission denied
  to set role "noacg_connector"`. Afterwards the metadata was unchanged, no factor, the own
  password signed in, the first-party session still worked, and `noacg_library` still answered.
- **A bad body is loud:** the old unpaired off body and a misspelt OAuth key each printed
  `REFUSED, HTTP 400: {"message":"Both OAUTH_SERVER_ENABLED and OAUTH_SERVER_AUTHORIZATION_PATH
  must be provided together ..."}`, malformed JSON printed `REFUSED, HTTP 400: {"message":
  "Expected double-quoted property name ..."}`, each exit 1, and Auth still read the OAuth server
  on. A misspelt key alone (`hook_custom_access_token_enabld`) is accepted by the API and
  ignored: `patch` prints no line and returns 1, but no `REFUSED`; the hook stayed on. Only a
  hand-edited body meets this.
- **Off, verbatim,** at 08:25:15 UTC printed `false`, `false`, `"/"`, exit 0. The token still
  worked at 08:26:11; at 08:26:21 `/mcp` with and without it, the PRM and `/api/me/connectors`
  each answered 503 `connector_disabled` (56 to 66 s, so "within a minute" is about a minute).
  Issued tokens were refused everywhere: the OAuth refresh 404 `feature_disabled`, Auth `/user`
  400 `bad_jwt`, PostgREST 403. The hook-off rollback printed
  `"hook_custom_access_token_enabled":false`, exit 0.
- **Production:** `GET` and `POST https://noacg.studio/mcp`, the PRM and `/api/me/connectors`
  each answered 503 `connector_disabled` before and after. Production's and staging's Auth were
  only read, before (08:19) and after (08:27): OAuth server off with no authorization path, hook
  off, notifications off, `jwt_exp` 3600.
- **User outcome:** the connector flow holds and the off switch works on the project the shell
  points at, but an owner switching production on or off by the runbook's words can act on
  staging instead and see success.
- **Smaller points for the repair:** step 3's "sign in to the studio on that project once" has
  no studio for staging (step 5's `first_party_account_allowed` check covers it, the step could
  say so).
- **Not checked (needs a person):** Claude Code's `claude mcp add` sign-in and Claude.ai's first
  connection. Step 5's four specs against a hosted project were not rerun (phase 5's build ran
  them on a branch).
- **Hosted branch:** `connector-p5-check2` (ref `fppausjfpxkapcvhadif`), created 08:19:43 UTC,
  came up at 0073; 0074 to 0091 applied through the query endpoint (0074 without
  `concurrently`). Branch-only Auth config: `site_url` the dev server, then the runbook's steps.
  One test account, deleted by the run; the OAuth client went with the branch. Deleted at
  08:27:07: the branch list then held only `main`, and the branch's query endpoint answered 404
  "Resource has been removed". Micro compute for under 8 minutes, under 0.01 USD (phase 5 in all
  about 0.05 USD of the owner's 2 EUR).

**Traps.**

- *A fresh branch can first answer at an older migration level.* The query endpoint read 0044
  a minute after creation and 0073 a minute later; wait until the level stops moving before
  applying the rest.

### Phase 5 second repair: the runbook names its project at every call

**Last check's findings:** FAIL product: the setup block fixed `AUTH` from `REF` when pasted, so
`REF=<production>` in the window that ran staging kept acting on staging and printed `true`;
"Turning it off" named no project and checked nothing, so a production off could turn staging
off and report success. Off took 56 to 66 s to reach 503, not "within a minute". Smaller: step 3
asked for a studio sign-in staging does not have; a misspelt key alone is accepted and ignored by
the API, and `patch` returned 1 with no `REFUSED` line. The lock, bad-body refusals, production's
503 and both projects' unchanged Auth held.

**What changed.** Only the runbook.

- *No project in the setup block.* It defines `project`, `patch` and `connector`; each builds its
  URL from `REF` when it runs and prints the project first (`== production (kprolrchuldgfrzspthy)`,
  `staging (...)`, or `project <ref>` for any other). With no `REF`, `REFUSED: no project, set
  REF first`. Step 1's signing-key curl reads `REF` at call time too and prints the project.
- *Every section names its project:* a `REF=` line before step 1 (staging), one in step 6
  (production), and one at the top of "Turning it off", which also says to paste the setup block
  first in a new window.
- *Every section ends on a check:* `connector on|off` polls Auth's discovery document (what the
  site reads) until it reads that state, three minutes at most; on production it then waits 65 s
  and needs `https://noacg.studio/mcp` to answer 401 (on) or 503 (off). Anything else prints
  `NOT ...` and returns 1. Staging has no deployed site (`scripts/supabase-projects.mjs`), so
  Auth's answer is its check.
- *A misspelt key is loud:* `patch` compares each setting it sent with what Auth holds and prints
  `REFUSED: sent <setting>, Auth holds no setting named <key>` (or the value held), returning 1.
- *Step 3:* a studio sign-in on production only; staging's first-party sign-in is checked by step
  5's `first_party_account_allowed`.
- *The token line* strips the CR a Windows `.env` leaves (curl accepted it, but a stray CR in a
  header is not worth relying on).

**Evidence: two throwaway preview branches of production,** created 08:40:08 UTC on 2026-10-13
through the Management API: `connector-p5r2-decoy` (ref `xeixbpiusdddajvjikzk`) and
`connector-p5r2-real` (ref `klcvooqhbjczdisolras`). Both came up at 0073 (status
`MIGRATIONS_FAILED` on the decoy, `FUNCTIONS_DEPLOYED` on the other); 0074 to 0091 were applied through the query
endpoint and the hook function and `noacg_connector` role read back on both. No Auth config was
set outside the runbook's own calls; no test account was needed. A script took every `bash`
block of "Owner's steps" from this file verbatim and ran them in ONE bash shell, substituting
only the `REF=` lines (staging's with the decoy, production's and the off section's with the
real branch), with this checkout's dev server pointed at the real branch:

- *The old block, first, as a reused window holds it:* after `REF=<real>`, `AUTH` still ended in
  the decoy's ref (the finding, reproduced). The new setup block was then pasted over it.
- *No `REF`:* `patch` printed `REFUSED: no project, set REF first`, exit 1.
- *Decoy, steps 1 to 4:* each call printed `project xeixbpiusdddajvjikzk` first; step 1 the
  ES256 line; steps 2 to 4 every setting `true` (the hook URI, the path `"/"`); `connector on`
  printed `project xeixbpiusdddajvjikzk: Auth on` 9 s after the patch. The dev server (pointed at
  the real branch) still answered 503 on `/mcp`, the PRM and `/api/me/connectors`.
- *Step 6's `REF` line, then steps 1 to 4 again in the same shell:* every call printed `project
  klcvooqhbjczdisolras`; the same settings, `connector on` `Auth on`. A minute later the dev server
  answered `/mcp` 401, the PRM 200, `/api/me/connectors` 401.
- *Refusals on the real branch:* the misspelt `hook_custom_access_token_enabld` printed
  `REFUSED: sent "hook_custom_access_token_enabld":true, Auth holds no setting named
  hook_custom_access_token_enabld`, exit 1; a trailing-comma body `REFUSED, HTTP 400: {"message":
  "Expected double-quoted property name ..."}`; the old unpaired off body `REFUSED, HTTP 400:
  {"message":"Both OAUTH_SERVER_ENABLED and OAUTH_SERVER_AUTHORIZATION_PATH must be provided
  together ..."}`; a ref of no project of ours `REFUSED, HTTP 404`. Each exit 1.
- *"Turning it off", verbatim, at 08:44:50* (the dev server read just before, so its cache was
  fresh, the worst case): `== project klcvooqhbjczdisolras`, `false`, `false`, `"/"`;
  `connector off` printed `Auth off` at +8 s. The dev server answered 401 until +52 s and 503 on
  all three paths at +57 s, which is Auth's flip plus the one-minute cache. Hence the 65 s wait
  in `connector` and "about 80 s" in the runbook (40 to 66 s measured across four
  offs). Afterwards the real branch's discovery answered 404 and the decoy's 200: the decoy was
  still on (OAuth server, registration, hook, notifications), so the off acted on the named
  project only. The hook-off rollback then printed `"hook_custom_access_token_enabled":false`.
- *Production's branch of `connector`, read only:* `REF=kprolrchuldgfrzspthy; connector off`
  (no `patch`) printed `production (kprolrchuldgfrzspthy): Auth off`, then after 65 s
  `https://noacg.studio/mcp 503`, exit 0.
- *Deleted* at 08:47:17: the branch list then held only `main`, and both refs' query endpoints
  answered 404 "Resource has been removed". Two Micro branches for about 7 minutes each, under
  0.01 USD (phase 5 in all about 0.06 USD of the owner's 2 EUR). Production's and staging's Auth
  were only read, before (08:39) and after (08:47): OAuth server off with no authorization path,
  hook off, notifications off. Production's `POST /mcp`, PRM and `/api/me/connectors` answered 503
  `connector_disabled` after.

**Decisions.**

- *`REF` read at call time, not a ref argument.* Steps 1 to 4 run twice, once per project; one
  `REF=` line per section keeps the step blocks identical, and every call prints the name it
  acts on. The setup block sets no `REF`, so a fresh paste cannot quietly pick staging.
- *Staging's check is Auth's discovery document.* There is no staging deployment; that document
  is exactly what any deployment reads.
- *Wait 65 s after Auth flips on production* rather than trusting the first 503: each warm
  instance keeps its own one-minute answer, so one 503 does not prove the others are off.
- *Name production and staging in `project` only for the label.* Any other ref still runs, so the
  runbook can be rehearsed on a branch verbatim; the label shows it is not one of the two.

**What the owner's switch-on must allow for.** Each section starts with its `REF=` line and ends
with `connector on` or `connector off`; check the project each call prints. Production's
`connector` takes about 80 s.

**Traps.**

- *A worktree has no `node_modules`;* `npm ci` took 51 s before this checkout's dev server
  (`npm run dev:worktree`) could start. The branch's anon key was passed inline; no `.env` needed.

### Phase 5 third check: FAIL (product), `patch` is also a system command

On `main` at 4e22a6ac, 2026-10-13, with two throwaway preview branches of production and this
checkout's dev server pointed at the second. No product code changed since the first check
(#1104), so AC-1 to AC-4 and the full #1083 lock rest on that check's evidence; the lock was
spot-checked again here, and step 5's four specs ran on a branch.

- **Without the setup block, `patch` runs GNU patch and hangs without a word.** Git Bash ships
  `/usr/bin/patch` (`type -a patch` in a fresh shell). In a new window where the owner forgets the
  setup block and pastes "Turning it off", the `REF` line runs, then GNU patch takes the JSON as a
  file name and reads the patch from the terminal: it prints nothing and waits until end of input
  (measured: silent for as long as its input stayed open; fed the pasted lines, it swallowed
  `connector off` and only then said `Only garbage was found in the patch input`). Nothing
  changes on any project, but the owner, told that off takes about 80 s, waits on a silent
  prompt while production stays on. Steps 2 to 4 hang the same way; `project` and `connector` say
  `command not found`, which is the loud failure wanted. To fix: rename the function to a name
  no system command has (`authset` is free in Git Bash), check every helper name with `type -a`
  in a fresh window, and re-run this slip as a paste.
- **The runbook acts on the project `REF` names, in one shell,** with every block taken from this
  file by a script and only the `REF=` lines swapped (staging's for branch A, production's and the
  off section's for branch B; step 5's hard-coded staging ref and its key placeholders for A's).
  A `.env` holding only the token, with CRLF endings, stood in for the main checkout's.
  - *Staging's steps on A:* step 1 printed `project <A>` and the ES256 line; steps 2, 3 and 4
    printed every setting `true` (the hook URI, the path `"/"`), exit 0; `connector on` printed
    `Auth on` 10 s after the patch. B's whole Auth config was byte-identical before and after,
    and the dev server (on B) still answered 503 on all three paths.
  - *Step 5 on A, as written:* 4 passed, 1 skipped (the 503 half, by design with the OAuth server
    on), 58 s, with `first_party_account_allowed`, `connector_account_refused` (eight account
    endpoints `400 bad_jwt`) and the spike's 14 checks.
  - *Step 6's `REF` line, then steps 1 to 4 in the same shell:* every call printed `project <B>`;
    the same settings; `connector on` `Auth on`. A's config was byte-identical before and after.
    The dev server then answered `/mcp` 401, the PRM 200 naming B's Auth and `email` only,
    `/api/me/connectors` 401.
  - *On B, through the dev server:* a test account's first-party token kept a UUID `sub` with the
    hook on, and `/api/me/connectors` answered it 200. A scripted MCP SDK client registered,
    authorized with `scope=email`, and NoaCG's Allow answered 200; the ES256 token carried
    `client_id`, `sub` `noacg-connector:<uuid>`, `noacg_uid` the user, role `noacg_connector`,
    and no ID token. `tools/list` (three tools, 2,817 characters) and `noacg_library` worked.
  - *Lock spot-check with that token:* Auth's `GET` and `PUT /user` (metadata and password) each
    `400 bad_jwt - invalid claim: sub claim must be a UUID`; the metadata was unchanged and the own
    password still signed in; PostgREST 403 `permission denied to set role "noacg_connector"`;
    `noacg_library` still answered.
  - *"Turning it off" on B* at 09:10:59 UTC: `== project <B>`, `false`, `false`, `"/"`, then
    `connector off` printed `Auth off`, exit 0. By 09:11:59 the dev server answered 503
    `connector_disabled` on `/mcp` (with the token too), the PRM and `/api/me/connectors`. A
    stayed on: its config byte-identical, its discovery 200 while B's answered 404.
- **The other slips fail loudly.** `REF` unset: `patch`, `connector off` and step 1 each printed
  `REFUSED: no project, set REF first`, exit 1. Misspelt keys: `oauth_server_enabeld` got
  `REFUSED, HTTP 400` (Auth's pairing rule); `hook_custom_access_token_enabld` and
  `oauth_server_allow_dynamic_registraton` each `REFUSED: sent ..., Auth holds no setting named
  ...`, exit 1. Bad bodies (a trailing comma, `flase`): `REFUSED, HTTP 400` with Auth's reason.
  `connector of`: `say connector on, or connector off`. Setup pasted in a folder with no `.env`,
  then the off section against A (on): `grep: .env: No such file or directory`, `REFUSED, HTTP
  401`, and after three minutes `NOT off: project <A>, Auth on after 3 minutes`, exit 1; A unchanged.
- **Production and staging:** `REF=kprolrchuldgfrzspthy; connector off` (no `patch`) printed
  `production (kprolrchuldgfrzspthy): Auth off` and, 65 s later, `https://noacg.studio/mcp 503`.
  `GET` and `POST https://noacg.studio/mcp`, the PRM and `/api/me/connectors` answered 503
  `connector_disabled` before and after. Both projects' whole Auth config was byte-identical at
  09:04 and 09:17 (OAuth server off, path null, hook off, notifications off, `jwt_exp` 3600);
  `check:migration-drift` says both hold all 89 migrations.
- **User outcome:** the flow holds and every runbook call names and acts on the project set, but
  an owner who skips the setup block in a new window meets a silent hang at the off switch.
- **Smaller points (not blockers):** `patch` with no body prints `== <project>` and exits 0
  having changed nothing; a body written with spaces (`"key": false`) is applied but each key is
  reported `REFUSED` (loud, but a false alarm); step 5 names staging's ref inline rather than
  `$REF`, which is right for a staging-only step.
- **Not checked (needs a person):** Claude Code's `claude mcp add` sign-in and Claude.ai's first
  connection.
- **Hosted branches:** `connector-p5c3-a` (ref `hbxnzcxhjzczedmrkghu`) and `connector-p5c3-b`
  (ref `catyisoerledmvnhturi`), created 09:04:27 and 09:04:31 UTC; both came up at 0073
  (`MIGRATIONS_FAILED` at 0074's `concurrently`), and 0074 to 0091 were applied through the query
  endpoint. No branch Auth config was set outside the runbook's own calls. Test accounts: those
  step 5's specs mint and delete, and one for the B flow, deleted. Both branches deleted at
  09:17:26 and 09:17:29: the branch list then held only `main`, and both refs answered 404
  "Resource has been removed". Two Micro branches for about 13 minutes each, under 0.01 USD
  (phase 5 in all about 0.07 USD of the owner's 2 EUR).

**Traps.**

- *A hand-fed test of a paste is not a terminal.* A command that reads standard input ends when
  piped lines run out, but waits forever on a terminal; judge a slip by what a terminal does.
- *`npm run dev:worktree` listens on `localhost` only* (`[::1]`); `127.0.0.1:<port>` refused it.

### Phase 5 third repair: one committed switch command

**Last check's findings:** FAIL product: the runbook's paste-in helper `patch` collides with
`/usr/bin/patch` in Git Bash; in a window without the setup block the off section hangs silently
(GNU patch reads the terminal and swallows the next pasted line) while production stays on;
steps 2 to 4 the same. The rest held in one shell on two branches: every call named its project,
A untouched, off 503 within 60 s, the lock spot-checked, slips refused, step 5's specs 4 passed 1
skipped, the spike 14 of 14; production 503, production's and staging's Auth byte-identical.
Small: `patch` with no body exited 0; a body with spaces after colons was applied but reported
REFUSED.

**What changed.** The owner decided (in session) to replace the pasted shell helpers with one
repo command, because all three failed checks came from pasted shell state.

- *`scripts/connector-switch.mjs`*, Node built-ins and `fetch` only:
  `node scripts/connector-switch.mjs <staging|production> <on|off|status> [--hook-off]`. Names map
  to refs through `scripts/supabase-projects.mjs`; anything else is refused before any request.
  `--ref <ref>` replaces the name for rehearsals and takes only a preview branch of production
  (read from the branch list); production's or staging's own ref is refused ("name it instead").
  The first line names the project. The token comes from the window or the checkout's `.env`
  (CR stripped; a worktree falls back to the main checkout's `.env`, as every keyed script does).
- *`on`* checks the signing key (only ES256, RS256 or EdDSA pass; anything else is refused
  before any change), then sends the notification emails, the hook and the OAuth server in that
  order; *`off`* sends the paired off body; *`--hook-off`* (off only) sends the hook off after
  Auth's config and discovery read the OAuth server off. Each body is checked by value in the
  PATCH's answer and then in a fresh read of the config (a failed or stale read is retried for a
  minute). Each run ends on Auth's discovery, read by the site's own rule in
  `api/_lib/connectorAuth.ts` (up to 3 minutes), and on production on `https://noacg.studio/mcp`:
  401 with `resource_metadata` for on, 503 `connector_disabled` for off (a platform 503 does not
  count), polled once 65 s have passed since Auth flipped, for a minute more. `status` only reads,
  and says `NOT safe` if the OAuth server runs without the connector's hook (enabled and pointing
  at `connector_access_token`). Every refusal is `REFUSED: ...` with the HTTP code and Auth's
  message, every missed state `NOT on|off: ...`, both exit 1. Every request has a 20 s timeout and
  nothing reads the terminal.
- *The runbook* now has four steps: 1 ready (`check:migration-drift`; the signing key is in `on`
  and `status`), 2 staging on, 3 the four specs on staging (unchanged), 4 production on; then
  "Turning it off". The setup block, `REF=` lines, `patch` and `connector` are gone. The security
  review's step references follow the new numbers; the notes above keep the old ones.
- *Unit tests* (`scripts/connector-switch.test.mjs`, 15, a stubbed `fetch` and clock): project
  mapping and a window that disagrees with `.env` or stands in for a missing one, unknown project,
  action and option, missing token, a refusal (no OAuth server after it), a mismatch and an
  unknown key, a read-back that lags, fails once, or never agrees, the paired off body, the order,
  hook off only once a lagging discovery reads off, the ending checks (NOT off with the site still
  on or answering a platform 503, NOT on with Auth never flipping), a request that never answers,
  `status` read only and `NOT safe` (no hook, or a hook pointing elsewhere), `--ref` refusals
  (including a persistent branch), HS256 and an unknown algorithm. Thirteen hand-made mutants of
  the command (unpaired off body, order swapped, no cache wait, string comparison, no mismatch
  check, hook off before discovery, no site check, no branch check, persistent branch accepted,
  site read by code only, a failed read-back refusing, hook function unchecked, token keeping its
  CR) each fail at least one test.
- *The review's fixes,* made after the hosted run below: the site's answer is read by its body
  and header, not its code alone; discovery by the site's own rule; a failed read-back is retried
  rather than reported as a refused write; production's ref comes from `.env` only; persistent
  branches are refused by `--ref`; the signing key passes on an allow-list; `NOT safe` checks the
  hook's function; the runbook says to run `off` again after a `NOT` from it. Re-checked on hosted
  read-only: `production status` and `staging status` at 10:17 printed the same as at 10:08, and
  a window pointing `VITE_SUPABASE_URL` elsewhere was refused. The site's 401 header was read in
  `api/_lib/me/mcp.ts`, not on a live on-state.

**Evidence: two throwaway preview branches of production,** `connector-p5r3-a` (ref
`wswzaccfukrfxvimjgvz`) and `connector-p5r3-b` (ref `wbnetwsdsxarnsvhvzri`), created 09:54:10
and 09:54:16 UTC on 2026-10-13. Both came up at 0073 (`MIGRATIONS_FAILED`); 0074 to 0091 were
applied through the query endpoint and the hook function and `noacg_connector` role read back on
both. No branch Auth config was set outside the command; no test account was needed. This
checkout's dev server pointed at B. The runbook's commands were taken from this file by a script
with only the project name swapped for `--ref <branch>`, as the runbook says, and run from this
worktree (the main checkout does not hold the command until this lands; the `.env` read was the
main checkout's).

- *First run, a finding:* `on` for A printed `REFUSED: security notification emails on: sent
  mailer_notifications_password_changed_enabled=true, Auth holds false; ...`, exit 1, and stopped
  before the hook. Auth had stored the emails: the Management API serves `GET config/auth` from a
  cache that lagged a PATCH by about 10 s (measured: a PATCH answered with the new value at 2.3 s,
  `GET` gave the old one until 13 s). The command now checks the PATCH's answer, then reads the
  config again until it agrees, for a minute at most; the unit tests cover both.
- *One terminal, verbatim:* staging's `on` for A printed `== branch wswzaccfukrfxvimjgvz,
  throwaway preview branch only: on`, the branch line, `signing key ES256 in use`, the three
  steps `ok`, `Auth's discovery reads on`, `connector on`, exit 0. The dev server (on B) still
  answered 503 on `/mcp`, the PRM and `/api/me/connectors`. Production's `on` for B the same (the
  hook's read-back waited once); the dev server then answered `/mcp` 401, the PRM 200,
  `/api/me/connectors` 401. "Turning it off" for B printed `OAuth server off: Auth reads back 3
  settings as sent`, `Auth's discovery reads off`, `connector off`, exit 0 at 10:03:27; all three
  paths answered 503 43 s later.
- *A new bash process* (no functions, no aliases): B on, then the dev server 401/200/401 within
  6 s; B off, all three 503 53 s later. Exit 0 each.
- *A untouched by B's commands:* A's whole Auth config hashed the same (`235f3a28...`) after A's
  `on` and after each of B's four commands and the slips.
- *Slips, each exit 1 with nothing changed:* `prodution off` printed `REFUSED: unknown project
  "prodution"` and the usage; `production of` `REFUSED: unknown action "of"`; `--ref` with
  production's or staging's ref `REFUSED: --ref ... is production; name it instead of --ref`;
  `--ref` with a ref that is no branch `REFUSED: ... is not a preview branch of production`;
  `on --hook-off` refused; a checkout whose `.env` has no token printed `== production
  (kprolrchuldgfrzspthy): off` then `REFUSED: no SUPABASE_ACCESS_TOKEN in this window or in
  <checkout>\.env; nothing was changed`; a window whose `VITE_SUPABASE_URL` named B printed
  `REFUSED: this window sets VITE_SUPABASE_URL=... but .env says ..., so the project name is
  ambiguous`. A misspelt key cannot come from the runbook any more (the bodies are in the
  command); the unit tests cover it. B's and A's config hashed the same before and after.
- *The hook-off rollback on B* printed the OAuth server off, `Auth's discovery reads off`, then
  `access token hook off: Auth reads back 1 setting as sent`, exit 0; `status` then read B off
  with the hook off, and A on with all 7 emails, hook and OAuth server on.
- *Names:* `type -a` in a new Git Bash finds `node`, `npm`, `npx` only under `C:\Program
  Files\nodejs` and `git` only as Git's own; no function or alias. (`patch` is still
  `/usr/bin/patch`; the runbook no longer uses it.)
- *Deleted* at 10:07:13 and 10:07:16: the branch list then held only `main`, and both refs
  answered 404 "Resource has been removed". Two Micro branches for about 13 minutes each, under
  0.01 USD (phase 5 in all about 0.08 USD of the owner's 2 EUR).
- *Production and staging, read only:* both projects' whole Auth config hashed the same at 09:54
  and 10:08 (OAuth server off, path null, hook off, notifications off). `node
  scripts/connector-switch.mjs production status` at 10:08 printed `signing key ES256 in use`,
  the config off, `Auth's discovery reads off`, `https://noacg.studio/mcp 503`, `production
  (kprolrchuldgfrzspthy): connector off`, exit 0; `GET /mcp`, the PRM and `/api/me/connectors`
  on noacg.studio answered 503 `connector_disabled`.

**Decisions.**

- *One `on` for emails, hook and OAuth server,* rather than a stop between hook and OAuth server
  for the studio sign-in. A command that waits for an answer would read the terminal, the hang
  this repair removes; two commands bring back an order the owner must keep. A broken hook
  breaks connector tokens too, so nothing unsafe opens; the sign-in check follows `on`, and its
  rollback is one command (`off --hook-off`).
- *`--ref` only for non-persistent preview branches of production,* checked against the branch
  list, so a rehearsal can never be aimed at a real project and the runbook stays verbatim apart
  from it.
- *Production's ref comes from `.env` only* (staging's from `.env` or the default), and a window
  that sets a different value, or sets one `.env` lacks, is refused, not obeyed: a shell left
  pointed at a branch must not make `production` mean that branch. A fork keeping its own staging
  sets `STAGING_SUPABASE_PROJECT_REF` in `.env`.
- *The PATCH's answer and a re-read of the config,* not the re-read alone: the read is cached
  for about 10 s, so a stale read can neither confirm nor refute on its own.
- *Step 1's drift check stays manual* (`npm run check:migration-drift` is already the one
  reading of the ledger); the signing-key check moved into `on` and `status`.

**What the owner's switch-on must allow for.** Run it from the main checkout after `git pull`
(the command lands with this change). Check the first line names the project meant; a line
starting `REFUSED` or `NOT` means stop. Production's `on` and `off` take about 80 to 100 s
(read-backs, Auth, the site's one-minute cache).

**Traps.**

- *`GET v1/projects/{ref}/config/auth` lags a PATCH by about 10 s;* trust the PATCH's answer or
  read again.
- *A dev server started through a background shell keeps its `node` child* listening after the
  shell is stopped; kill it by PID (`netstat -ano`), as before.
