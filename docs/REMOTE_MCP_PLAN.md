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

Filled in by phase 5: enable the OAuth server and the hook on staging, connect Claude.ai to a
staging deployment once, then the same on production; add `remotes` to `cli/server.json` on the
next CLI release; the directory submissions.

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
