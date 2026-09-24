# Agent save: scoped keys, the consent handoff, the save door, the boundary gates

The second phase of the agent door (`docs/AGENT_CLI.md`): how a coding agent's CLI puts a
graphic into a user's NoaCG library without ever holding the user's session, and what changed
at the library->air boundary so that a record the server never executed can still be trusted
on air.

```
 noacg login                                  browser (signed in)               /api/me
 ┌────────────────────────┐   opens           ┌──────────────────────┐  begin   ┌────────────────┐
 │ verifier (PKCE)        ├──────────────────▶│ /app?agent=<state>   ├─────────▶│ agent-keys     │
 │ listener 127.0.0.1:P   │                   │   &port=P&name=…     │◀─────────┤  code (120 s,  │
 │                        │◀──────────────────┤   &challenge=sha256  │  code    │  hashed, PKCE) │
 │ redeem(code, verifier) ├──────────────────────────────────────────────────────▶│  key, ONCE     │
 └────────────────────────┘   http://127.0.0.1:P/callback#code=…&state=…         └────────────────┘
 noacg save ./pkg        validate in the bridge -> graphicDoc -> POST /api/me/graphics (Bearer key) -> 201 {id, url}
```

## 1. The credential: a scoped agent key

- **Shape.** `noacg_ak_` + 64 hex. Stored only as `sha256` in `agent_keys.key_hash` (migration
  `0050`); the plaintext is returned exactly once by `redeem` and lives on the CLI's disk.
- **Scope.** A key carries a list of permissions (`src/entitlements/permissions.ts`). In this
  release every key carries exactly `graphics:create` - it can put a graphic in the library
  and nothing else: not read the library, not touch a production, not use AI, not delete.
  `playout:operate` is named now and is NEVER granted to an agent key (`NEVER_ON_AGENT_KEYS`).
- **`permits(principal, key)`** asks two questions, both required: the credential carries the
  permission (a session carries all, a key its list), AND the account's entitlement allows the
  feature the permission rides on (`graphics:create` -> `sync.cloud`). So a suspended account's
  key is dead, and the instance-wide `sync.cloud` switch stops agent saves (`docs/ADMIN.md`
  enforcement table). A permission can only ever NARROW what the account may do.
- **Principal resolution** is one door, `api/_lib/principal.ts resolvePrincipal(req)`: a
  Supabase JWT -> a session (`granted: null`); `Bearer noacg_ak_…` -> hash lookup through the
  0050 `agent_key_resolve` RPC -> the key's scopes (+ `last_used_at` stamped in the same
  statement); anything else -> anonymous. Every lookup failure degrades to anonymous - fail
  closed. A future OAuth access token is one more branch here, same `permits` downstream.
- **Storage on the CLI side** (`cli/src/auth.ts`): `<config dir>/credentials.json`, keyed by
  deployment origin (`%APPDATA%\noacg`, `~/Library/Application Support/noacg`,
  `$XDG_CONFIG_HOME/noacg`); 0700/0600 on POSIX, the directory's ACL reset to the current user on
  Windows (best effort). `NOACG_AGENT_KEY` (CI) beats the file; `noacg login --key` stores a
  pasted key. A keychain is a native dependency and is deliberately not in v1.

## 2. The handoff: how a key is minted without transiting the browser

1. `noacg login` invents a PKCE `verifier`, listens on `127.0.0.1:<random port>`, and opens
   `${NOACG_URL}/app?agent=<state>&port=<port>&name=<"noacg CLI on HOST">&challenge=<sha256 hex of verifier>`.
2. The consent page (`src/components/auth/AgentAccessConsent.tsx`, a query route in `App.tsx`
   beside `?control=` and `?chat=`) parses the request (`src/backend/agentAccess.ts
   parseAgentRequest`: state 8-128 url-safe chars, port 1024-65535, challenge 64 hex; anything
   else is refused before it asks). Signed in, it asks ONE question - *Allow "<name>" to save to
   your library?* - listing exactly what the key may do and naming the loopback port the code
   will go to. Signed out, it shows the sign-in prompt with the create-account half leading. An
   OFFLINE build (no backend) shows an honest "no account backend" card and ZERO auth UI
   (`e2e/agent-access.spec.ts`; the auth posture of root `AGENTS.md`).
3. Allow -> `POST /api/me/agent-keys {action:'begin', name, challenge}` with the user's JWT ->
   the server writes `agent_auth_codes` (hash of a fresh 256-bit code, the challenge, 120 s
   expiry) and returns the plaintext code. The page redirects ONLY to
   `http://127.0.0.1:<port>/callback#code=…&state=…` (`agentCallbackUrl` - the host is never read
   from the URL, the code rides the FRAGMENT so no server request line ever carries it).
4. The listener's page forwards the fragment to the CLI (`POST /complete` on the loopback),
   which checks `state` and calls `POST /api/me/agent-keys {action:'redeem', code, verifier}`
   (no auth). The server CONSUMES the code atomically (`agent_code_consume`: one `UPDATE …
   RETURNING`, so a racing second redeem finds nothing), checks `sha256(verifier) === challenge`,
   mints the key with the scopes the code was minted with, and returns the plaintext once. A
   wrong verifier still burns the code - an intercepted code must not stay redeemable.
5. The CLI stores the key. `noacg whoami` asks the deployment to describe it (prefix, name,
   scopes, last used); `noacg logout` revokes it (a key may revoke ITSELF and nothing else) and
   forgets it; Settings → Account → **Agent access** lists every live key with a Revoke button.
   Revocation takes effect on the key's next request.

## 3. The save door: `POST /api/me/graphics`

In order - the order IS the posture (`api/_lib/me/graphics.ts`):

1. `resolvePrincipal` (a session JWT or an agent key);
2. `permits(principal, 'graphics:create')` - a revoked key, a suspended account and the
   instance-wide switch all stop here;
3. rate limits, per IP and per PRINCIPAL (the account), before a byte of body is read;
4. `readJson(req, 4 MB)` - our own 413 under the platform's ~4.5 MB cap; inline assets must
   stay small (a logo, not a video; `SHAPE_LIMITS.assetsTotal` = 3 MB);
5. `graphicSaveShape` (`api/_lib/me/graphicShape.ts`) - a PURE shape + size guard on the
   LIBRARY RECORD the bridge built (`bridge.graphicDoc` -> `model/graphicDoc.ts newGraphicDoc`):
   version 1, a real `TemplateType`, the three sources within caps, the `SPXGCTemplateDefinition`
   marker PRESENT (a regex, never a parse), assets `{path, data:URL}` with relative paths,
   entries and fields as strings. **The template code is never parsed, evaluated or validated on
   the server** - `parseDefinition` runs the definition literal through `new Function`, and this
   function holds the service key with `fetch` as a global. The code is judged where it runs in a
   sandbox: the bridge's gate in the user's own browser before the CLI saves (the CLI refuses an
   invalid package itself), and the app's re-gate when the graphic is opened, published or
   exported;
6. `newGraphicDoc` re-stamps what a server must own: a SERVER uuid (a service-role upsert on a
   client id could overwrite another user's row), the server clock (sync's LWW reads
   `body.updatedAt` - never a client clock), `origin {tool, version}` (provenance, never proof),
   AI provenance nulled;
7. `INSERT` into `documents` (kind `graphic`, `user_id` set by the service role) - never an
   upsert; `201 { id, url }` with `url = <origin>/app#/graphic/<id>`.

The link opens the graphic's CONTROL page: the studio rewrites `#/graphic/<id>` to
`#/control/<id>` (the old code editor it used to open is closed, `src/App.tsx`). The record then
reaches the user's browser through the ordinary sync pull, and the link is usually opened before
that pull lands - the graphic is seconds old and the reader's studio has not synced since. A link
the local library cannot answer therefore ASKS THE CLOUD and waits for the answer
(`backend/graphicWhenSynced.ts`, driven from the control page): the record resolves the moment a
pull writes it, or when a sync pass that could have seen it COMPLETES CLEANLY without it. Only that
second answer says the graphic was not found - a pass that errored, or one that could not run
because the session was still coming back, knows nothing about whether the record exists and is
not allowed to answer for it.

A reader with NO SESSION keeps the graphic's id in the address instead: the record usually exists
perfectly well in an account this browser has never signed into, so the control page offers a
sign-in and the graphic opens as soon as there is one. Replacing the URL there used to destroy the only copy of it the reader had - it
was measured on `noacg.studio` doing exactly that, 846 ms after the click, on 2026-09-16.
`e2e/configured/deep-link-boot.spec.ts` holds all three answers, and its signed-out case runs
against the deployed site itself (`playwright.production.config.ts`, from `deploy-verify.yml`).

### Error table (the CLI prints the right-hand column)

| Status | Code | When | What to do |
|---|---|---|---|
| 400 | `invalid` | not a version-1 record, unknown type, no definition marker, a cap exceeded, bad JSON | fix the package; `noacg validate` |
| 401 | `unauthorized` | no credential, an unknown or REVOKED key | `noacg login` (or set `NOACG_AGENT_KEY`) |
| 403 | `forbidden` | the key does not carry `graphics:create`, or the account's entitlement withholds it (suspended, switched off) | the account owner; `docs/ADMIN.md` |
| 413 | `too_large` | body over 4 MB | keep inline assets small |
| 429 | `rate_limited` | per-IP or per-account burst | wait for `Retry-After` |
| 503 | `unavailable` | this deployment has no account backend (offline / self-host without Supabase) | zip the package and use the studio's Import door |
| 500 | `internal` | the insert failed | retry; nothing was stored |

`/api/me/agent-keys` answers the same codes: `begin` 401 without a session, 403 when an agent
key tries to mint a key; `redeem` 400 for an unknown / used / expired code or a wrong verifier
(the code is spent either way); `DELETE` 404 for a key that is not yours or already revoked.

## 4. The boundary gates (a behaviour change for everyone)

A library record may be a broken draft - the editor saves half-finished work, and the save door
stores a record the server never executed. What may NOT happen is a broken graphic reaching a
renderer somebody else is pointing a camera at. So the library->air boundary is now gated, in
the code that crosses it rather than in the dialogs that happen to show a verdict:

- `publishGate` (`src/validation/publishGate.ts`, moved from `community/gate.ts` which
  re-exports it) = `validateTemplate` + the share-safety bench, external deps and missing
  assets promoted to errors - the one gate behind the community door, the bridge's validator,
  and now:
- `publishControlShow` (`src/control/hostedControl.ts`) refuses an invalid graphic BEFORE it
  looks for a backend or pins anything to an output URL - `assertProductionGate` over the live
  library templates of the pool;
- `buildShowZip` / `buildShowZipFor` (`src/export/showExport.ts`) refuse the same way, for every
  target, whoever calls them; the production export dialog shows the same verdict
  (`productionGateFailures`) so "the button was enabled but the build refused" cannot happen.

`src/validation/productionGate.ts` is the helper both call (`docs/ARCHITECTURE.md` §3: `control
-> validation` and `export -> validation`, `productionGate` only). **The product promise is now
literal: an invalid graphic cannot publish or export.** Pinned by `e2e/production-gate.spec.ts`.
Previously an invalid graphic in a production could be published to a hosted page and, through
the programmatic builders, exported - this closes both. Ratified by the owner 2026-08-22.

## 5. Where things live

| Piece | File |
|---|---|
| permission vocabulary, `Principal`, `permits` | `src/entitlements/permissions.ts` (pure) |
| principal resolution | `api/_lib/principal.ts` |
| key + code store (Supabase service role; in-memory for tests) | `api/_lib/agentAccessStore.ts` |
| `/api/me/agent-keys` | `api/_lib/me/agentKeys.ts` (+ `.test.ts`) |
| `/api/me/graphics` + the pure shape guard | `api/_lib/me/graphics.ts`, `graphicShape.ts` (+ `.test.ts`) |
| `/api/me/packages` + its shape guard (§7) | `api/_lib/me/packages.ts`, `packageShape.ts` (+ `packages.test.ts`) |
| migrations | `supabase/migrations/0050_agent_keys.sql`, `0065_agent_packages.sql` |
| waiting packages in the studio (§7) | `src/backend/agentPackages.ts`, `src/components/home/sections/ProductionsSection.tsx` |
| consent page, browser client | `src/components/auth/AgentAccessConsent.tsx`, `src/backend/agentAccess.ts` |
| Settings list | `SettingsDialog.tsx` `AgentAccessSection` |
| CLI | `cli/src/auth.ts`, `cli/src/commands/{login,logout,whoami,save,pack}.ts`, the `save` and `pack` verbs of the `noacg` tool in `cli/src/mcp.ts` |
| gates | `src/validation/{publishGate,productionGate}.ts` |
| specs | `e2e/agent-access.spec.ts` (offline), `e2e/configured/agent-access.spec.ts` (live), `e2e/production-gate.spec.ts` |

## 6. Stated limits

- The key sits on disk, user-ACL'd, not in a keychain (v1). Scope + revocation + `last_used_at`
  + per-user config dir is the story; a leaked key can create graphics in one library until it
  is revoked, and nothing else.
- The server stores no "validated" claim; `origin` is provenance. The gates re-run where it
  matters: the editor validates live as soon as the record is opened (its preview is a
  `sandbox="allow-scripts"` iframe, so the code runs contained), and publish / export refuse an
  invalid graphic outright (§4). What is deliberately NOT done is a screen inside the sync
  engine that refuses to land a pulled record - a refused pull would be re-pulled forever, and
  the library is allowed to hold a draft; the community importer's in-place re-gate is the model
  for a later hardening if agent-saved records ever arrive from anything but the user's own key.
- Inline assets ride in `documents.body` until the browser's next sync push externalizes them
  to Storage (the provider's ordinary path); the 3 MB cap keeps a body well inside what a row
  should hold.
- Third-party OGraf packages cannot be saved yet (`docs/AGENT_CLI.md` "Future" - package hosting
  + an OGraf host in preview/output); `noacg save` says so.

## 7. The package door: `POST /api/me/packages`

`noacg save` puts ONE graphic in the library. A show needs several, each on its own playout
layer, with a running order - and the easiest path from "an agent made my graphics package" to
"it is on air" is one the user can follow from anywhere, including when the agent ran in the
cloud. So a whole package travels through the account, not through a file:

```
 noacg pack ./a ./b ./c --name "Show" [--rundown cues.json] [--layer 10] --save
   validate every graphic in the bridge (gate + bench) -> packEntry per graphic
   -> POST /api/me/packages (Bearer key) -> 201 { id, url: <origin>/app#/home/productions }
 studio, signed in: Home -> Productions lists it under "Waiting to install"
   Install -> parsePack -> installPack (validateTemplate per graphic, production, layers, cues)
           -> the waiting row is deleted -> the production page opens with its rundown
```

**Decided 2026-09-24 (owner asked for "prompt a package, it appears on Home, press Install").**
Recorded here so each can be reverted on its own:

- **The package WAITS; it is not a production on the server.** A production is the thing that
  airs, so the user sees it arrive and chooses to set it up. It also keeps the server from
  having to build or trust a production record: Install runs the studio's own `installPack` in
  the user's session, the same path as a pack file, so the rundown, layers and validation are
  one implementation. Creating the production directly would save one click and add a second
  way to write a production.
- **It rides `graphics:create`.** Nothing becomes a production until the user presses Install,
  so no new permission is needed and no existing key has to be re-authorised. The permission's
  label now says "Create graphics in your library and send graphics packages to your Home".
- **Its own table, not a `documents` kind.** `agent_packages` (migration 0065) is read and
  deleted by the browser under RLS and written only by the service role. A new `documents` kind
  would have pulled a transient inbox into the sync engine and every device's local store.
- **The payload is the pack FILE format** (`noacg-pack` v1, `docs/GRAPHICS_PACKS.md`). `--out`
  writes exactly what `--save` sends, so a package from the terminal and a package from a file
  are one format and one parser.

The door's checks are the save door's (§3) in the same order, then `packageSaveShape` (pure;
the code inside is never run on the server), then a cap of 25 waiting packages per account
(409 `limit_exceeded` - install or dismiss some), then the INSERT. The body cap is the same
4 MB.

**In the studio.** `ProductionsSection` loads the list when a session exists and again whenever
the tab becomes visible - the usual moment is switching back to the studio after the agent says
it sent something. It shows on the Home dashboard as well as the full Productions page. Install
deletes the row once the production exists (a failed delete leaves the row for Dismiss, never a
failed install). Dismiss deletes it unseen. An offline build, or a signed-out visitor, asks
nothing and shows no row (`e2e/pack-import.spec.ts`); the live walk - send, list, dismiss,
install, the rundown - is `e2e/configured/agent-access.spec.ts` step 4b.

**No account.** `noacg pack --out <file>` writes the same package; Home → Productions →
**Import a package** installs it. The MCP tool's `pack` verb sends when the machine holds a key
and writes `out` when given one.
