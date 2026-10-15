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
- **Scope.** A key carries a list of permissions (`src/entitlements/permissions.ts`). Every key
  carries `graphics:create` - it can put a graphic in the library - and, when its consent listed
  it, `productions:create`, which lets a set delivery make a new production of its graphics (§11).
  Nothing else: not read the library, not change or publish a production, not use AI, not delete.
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
  Windows (best effort). `NOACG_CREDENTIALS_DIR` moves the file to another folder (in this
  repository each checkout's `.noacg/`, `docs/AGENT_CLI.md`). `NOACG_AGENT_KEY` (CI) beats the
  file; `noacg login --key` stores a pasted key. A keychain is a native dependency and is deliberately not in v1.

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
   scopes, last used, and the ACCOUNT it saves into); `noacg logout` revokes it (a key may revoke
   ITSELF and nothing else) and forgets it; Settings → Account → **Agent access** lists every live
   key with a Revoke button. Revocation takes effect on the key's next request.

**One account, named three times.** The consent card says which account and deployment the key
will save into ("Saves go to <email> on <host>"), redeem and `whoami` answer the same `account`
(`{ id, email }`) and `deployment` (the origin that answered), and every delivery receipt (§9)
carries them again. That is the key owner's own identity, not access to anything in the account.

**"Don't allow" ends the login.** A CLI that takes a refusal adds `deny=1` to the consent URL; the
page then sends `#error=access_denied&state=…` to the same loopback `/callback` (`agentDenyUrl`),
and `noacg login` stops at once with exit 1 and nothing stored. A consent URL without `deny=1` (an
older CLI) only shows "Nothing was granted", and that CLI waits out its timeout as before.

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
   upsert; `201 { id, url, receipt }` with `url = <origin>/app#/graphic/<id>` and the delivery
   receipt of §9 (additive: an older client reads `id` and `url`).

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
| `/api/me/deliveries`, the receipt (§9) | `api/_lib/me/deliveries.ts`, `deliveryReceipt.ts` (+ `deliveries.test.ts`) |
| `/api/me/graphic-sets`, a set in one delivery (§10) | `api/_lib/me/graphicSets.ts` (+ `graphicSets.test.ts`) |
| migrations | `supabase/migrations/0050_agent_keys.sql`, `0065_agent_packages.sql`, `0092_agent_deliveries.sql`, `0093_agent_graphic_sets.sql` |
| waiting packages in the studio (§7) | `src/backend/agentPackages.ts`, `src/components/home/sections/ProductionsSection.tsx` |
| consent page, browser client | `src/components/auth/AgentAccessConsent.tsx`, `src/backend/agentAccess.ts` |
| Settings list | `SettingsDialog.tsx` `AgentAccessSection` |
| CLI | `cli/src/auth.ts`, `cli/src/receipt.ts`, `cli/src/operations.ts`, `cli/src/commands/{login,logout,whoami,save,pack,status}.ts`, the `save` and `pack` verbs of the `noacg` tool in `cli/src/mcp.ts` |
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
   -> POST /api/me/packages (Bearer key) -> 201 { id, url: <origin>/app#/home/productions/<id>, receipt }
 studio, signed in: the link opens Home -> Productions with that package selected
   Install -> parsePack -> installPack (validateTemplate per graphic, production, layers, cues)
           -> settle: the waiting row goes, the receipt records the production (§9)
           -> the production page opens with its rundown
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
it sent something. It shows on the Home dashboard as well as the full Productions page. A load
that FAILS shows its error with Retry, never the empty list it used to pass for. The package
link (`#/home/productions/<id>`) selects and focuses that row; once the package no longer waits,
the same link says what became of it from its receipt - installed (with its production), dismissed,
no longer waiting, or not in the account you are signed in to. Install settles the package once
the production exists (a failed settle leaves the row for Dismiss, never a failed install); Dismiss
settles it unseen. An offline build, or a signed-out visitor, asks nothing and shows no row
(`e2e/pack-import.spec.ts`); the live walk - send, the link, a failed load and Retry, dismiss,
install, the rundown, the receipt afterwards - is `e2e/configured/agent-access.spec.ts` step 4b.

**No account.** `noacg pack --out <file>` writes the same package; Home → Productions →
**Import a package** installs it. The MCP tool's `pack` verb sends when the machine holds a key
and writes `out` when given one.

## 8. The share door: `POST /api/me/community-packs`

Community packs (`docs/work-specs/community-packs/spec.md` AC-12) can be given from the CLI and
the plugins as well as from the studio's shelf, and only when the user asks for it:

```
 noacg pack ./a ./b --name "Show" --description "One line" --save \
   --share --license cc-by-4.0 --shown-as "Quizmaster K"
   §7's gate first: validate, packEntry
   bridge.communityCheck: the shelf's own checks (words, share gate per graphic, then each
     graphic played with outside requests refused) over the templates the gate validated
   -> POST /api/me/community-packs (Bearer key) { name, description, author, license, pack }
   -> community_pack_submit_for(user, ...) -> 201 { id, state: "in_review" }
   then §7's POST /api/me/packages -> the Home copy waits for Install
 studio: the pack is In review under Your packs; a NoaCG admin reviews it like any other
```

**Decided 2026-10-09 (the owner's three yeses on issue #797).** Each can be reverted on its own:

- **It rides `graphics:create`; no new scope.** The share happens only on the user's explicit
  request, a human reviews every pack before anyone sees it, and the maker withdraws it at once.
  A separate scope would put a sharing line on every CLI login's consent page and make every
  existing key log in again before its first share.
- **One submit gate for both doors.** An agent key is not a session, so the door cannot call the
  session function `community_pack_submit`. Migration 0087 moved its body into
  `community_pack_submit_for(p_uid, ...)`, granted to the service role only, with every check
  naming the account explicitly (the `community.publish` and suspension checks through the
  service-only `feature_denied_for`). The session function is now a wrapper passing
  `auth.uid()`. A change to who may submit is one function for both doors.
- **The user confirms the shown name and the licence once.** The skill's
  `references/share.md` has the agent say both in one message before the first share, unless
  the request already gave them, and the command line carries them: `--license cc-by-4.0`,
  `--shown-as` and `--description` are required and are never filled from the account (D15).
  The door refuses a body without the licence.
- **Never offered.** The skill section is OFF unless the user asks to share; the MCP schema's
  only trace is the `share` argument pointing at that reference.
- **The share comes first (#876).** `--share` needs `--save`, and the community checks and the
  share door run before the Home copy is sent, so a refused share sends nothing and the retry
  after a fix adds no second package to Home. With the Home copy first, as it was at first, each
  refused attempt left one more package on Home. The cost of this order is a share with no Home
  copy when the package door refuses after the share went through (the 25-package waiting cap,
  a rate limit); the CLI says so and says to pack it again without sharing, because a retry with
  the share would put a duplicate in the review queue. The shared copy carries no cues; a
  `--rundown` stays on the Home copy.

The door's checks are the package door's (§7) in the same order, then the shape (the three words,
the licence, a `noacg-pack` with no cues; the code inside is never run on the server), then the
submit gate. A refusal of the gate - ten packs waiting, an account that cannot submit, a size -
comes back as 409 with the database's own sentence, which the CLI prints as it is. The body cap
is the same 4 MB, below the shelf's 8 MB; a larger pack is shared from the studio. The bridge
check is additive (`BRIDGE_V` stays 1): a deployment without it gets a plain "cannot check a
pack for Community packs yet" rather than a late failure.

## 9. Delivery receipts and readback: `GET /api/me/deliveries`

Every write answers a **receipt** (`api/_lib/me/deliveryReceipt.ts`, version 1, additive) and
records it (`agent_deliveries`, migration 0092), so "which account received what, and is it really
there?" has one answer:

| Field | Meaning |
|---|---|
| `operationId` | Named by the CLI before it writes (`x-noacg-operation`, a uuid), or minted by the server |
| `deployment`, `account` | The origin that answered, and the account's `{ id, email }` (§2) |
| `destination` | `library` (Home → Graphics) or `home` (waiting on Home → Productions) |
| `state` | `saved`, `pending_install`, `installed`, `dismissed`, `missing`; the CLI adds `failed` and `delivery_unverified` |
| `resources` | Each delivered item with its id, state and exact link; an installed package adds its production |
| `link`, `nextAction` | The one link to open (the production over its package), and what to do, if anything |
| `verified` | `false` on the write's own answer (accepted and stored); `true` only from a readback that found it |

Acceptance, verified availability and "a browser opened it" are three different claims. A receipt
makes the first two and never the third.

**Readback is narrow.** `GET /api/me/deliveries?id=<operation or resource id>` with an agent key
finds only the receipts THAT key wrote, in its own account, and answers each one's current state
(a deleted graphic reads `missing`, an installed package `installed`). It returns no names and no
content and lists nothing; another key's id, another account's id and an id that never existed are
the same 404. A session (the studio) reads its own account's receipts. No key gained a scope: a
key that may create may ask what became of what it created.

**Install and Dismiss settle.** The studio posts `{ action: 'settle', package, production }` with
the user's session; `agent_package_settle` deletes the waiting row and records `installed` (with
the production) or `dismissed` in one statement. An agent key cannot settle anything. A package
from before 0092 gets its receipt at settle time; a waiting row an older studio deleted directly
reads `missing`.

**The CLI never sends a single write twice.** `pack --save`, and `save` on a deployment without
the set door, read the delivery back after the write. If
the answer is lost (a 5xx, a dropped connection), they ask by the operation id: found means it
landed; not found leaves it `delivery_unverified`, with `noacg status <operationId>` as the next
action. `noacg status <id>` reads any of this key's deliveries back later. Recording a receipt is
best effort - a save is never failed over its receipt, since that would invite a duplicate retry -
so a missed record reads back as a 404 and the CLI reports it unverified.

## 10. A set in one delivery: `POST /api/me/graphic-sets`

`noacg save ./a ./b ./c` puts every graphic of a set in the library as ONE operation, with no
Install step, and sending it again never adds a second copy. One graphic takes the same path.

```
 noacg save ./a ./b ./c [--folder F]
   validate every graphic in the bridge (gate + bench); one error refuses the set, nothing is sent
   bridge.graphicDoc per graphic -> the operation id: the journal's for this set, or a new one,
     written to <config>/operations.json BEFORE the write
   -> POST /api/me/graphic-sets (Bearer key, x-noacg-operation) { graphics: [record, ...] }
      201 { operationId, replayed: false, graphics: [{ id, name, url }], receipt }
      200 the same answer with replayed: true   (this operation, this payload, this key, again)
      409 conflict                              (this operation, a different payload or key)
   -> GET /api/me/deliveries?id=<operation>     (§9: every graphic, verified, in the order sent)
```

**All or nothing.** The door checks every record with the save door's shape guard (§3) before
anything is written, mints the ids and timestamps through the same `libraryRecord`, and hands the
set to `agent_deliver_graphics` (migration 0093). That one database call claims the operation in
`agent_operations`, inserts every `documents` row and every `agent_deliveries` receipt (with its
`position` in the set), and is one transaction: a failure part way leaves no record, no receipt
and no claim. Unlike the single save door, where the receipt is best effort (§9), a set's receipts
commit with its records.

**Sending it again is safe, so the CLI does.** The same operation with the same payload from the
same key answers the first delivery's ids and writes nothing. "The same payload" is the records as
stored without the ids and timestamps the bridge mints on every build, so the same packages built
again by a restarted CLI are the same set. A lost answer (a 5xx, a dropped connection) is sent
again twice under the same operation; if every answer is lost and a readback finds nothing, the
receipt is `delivery_unverified` and running the same command again resumes the operation. The
journal reuses an operation for the same deployment, key and content for 24 hours. A replay
reports what is there now: a graphic deleted since reads `missing`, the CLI says the set is not
all in the library and forgets the operation, and the same save run again delivers it anew.
A replay after the CLI's own lost answer is reported as this run's save, not an earlier one, and a
refusal that follows a lost answer (a rate limit the first send used up) is checked by readback
before it is reported. The journal is locked while it is read and written, so two saves of the same
set at once share one operation.

**Limits, against the existing ones.** One set holds 1 to 40 graphics, a pack's own cap
(`packageShape.ts`), so any pack's graphics fit one set. The whole body shares the save door's
4 MB read cap, under the platform's ~4.5 MB; the CLI measures the set before sending and asks for
smaller groups above it. Each record keeps the save door's per-graphic limits (`SHAPE_LIMITS`,
3 MB of inline assets). The per-IP and per-account save rate limits count one set as one request.

**Compatibility and rollback.** Additive: a route, a table, a nullable column and a function. The
single save door, the package door and Import are unchanged. `save` with one graphic falls back to
the single save door when a deployment answers 404 for the set door (one from before 0093); with
several it says the deployment cannot take a set yet. Reverting the code leaves every delivered
record, receipt and claim in place; nothing user-made is removed.

| Status | Code | When |
|---|---|---|
| 400 | `invalid` | no `x-noacg-operation` uuid, not 1-40 records, or one record fails the shape guard (named by its place and name) |
| 409 | `conflict` | the operation already delivered a different payload, was sent by another credential, or is a single save's |
| 413 | `too_large` | the set's body is over 4 MB |
| 500 | `internal` | the call failed: all of it was saved or none, and sending the same request again settles which |

The other codes are the save door's (§3).

## 11. A production in the same delivery

`noacg save ./a ./b ./c --production "Evening news" [--rundown cues.json] [--layer 20,21,22]`
(MCP `save` with `production` and `rundown`) makes the set door also create a NEW production of the
set, ready to open, with no Install step. Without `--production` the delivery is library-only and
makes no production, whatever the key may do.

```
 -> POST /api/me/graphic-sets { graphics: [...], production: { name, layers?, cues?: [{ graphic, label, values?, note? }] } }
    201 { ..., production: { id, name, url: <origin>/app#/production/<id> }, receipt }
    receipt.destination 'production'; resources: the graphics, then { kind: 'production', state: 'saved' }; link: the production
```

**The record** (`src/model/productionDelivery.ts`) is the one the studio's own Install builds: a
pool entry per graphic, a copy of its template linked by `graphicId`, on the layer the request
names or the next free one from 20; the rundown in the order sent, each row's values over the
graphic's field defaults, then a default row for any graphic the rundown never names. It is a new
personal production of the key's account, unpublished: no slug, nothing on air.

**One transaction.** `agent_deliver_production` (migration 0094) runs `agent_deliver_graphics`
and, in the same call, inserts the production's `show` document and names it on every graphic's
receipt (`agent_deliveries.production_id`). The production joins the payload hash: the same
request again replays the same graphics AND the same production; the same graphics with another
production, or without one, under that operation are a conflict. The readback (§9) finds the
delivery by its operation, a graphic, or the production's id, and says `missing` for a production
deleted since.

**Consent.** A production needs `productions:create` on the credential as well as
`graphics:create`. It is a separate permission (`AGENT_KEY_OPTIONAL_PERMISSIONS`): `noacg login`
asks for it with `scopes=productions:create` on the consent URL, and the consent card lists it as
its own line ("Make new productions with rundowns from the graphics it saves (never publishes or
plays them)"). A key minted without it, every key from before it existed included, keeps exactly
`graphics:create`; its production request is refused with 403 before anything is written, saying
to log in again or save library-only. A connector grant does not carry it. It makes new
productions only: it cannot add to, change, publish or play an existing one.

**The same delivery, installed again.** Every record `noacg save` delivers carries its ITEM
IDENTITY (`origin.item`, the graphic's source digest), and `noacg pack` writes the same identity on
the graphic's package entry. Installing a package (§7) pools a library record with the graphic's
identity instead of saving a second copy, and new records keep the identity. Before a waiting
package is installed, Home says when Install would repeat a delivery: every graphic already
delivered and pooled by a production ("Already delivered as …", with Open it), or a graphic the
identity cannot speak for (no identity on the package or on a same-named record made outside the
studio: "may already be in your library"). The user chooses Install anyway or Cancel. A name alone
never merges two graphics.

**Rollback.** Revert the code: the destination is gone, `save` is library-only again, and delivered
productions stay ordinary productions. 0094 is one function; left in place it costs nothing. Keys
that carry `productions:create` keep it harmlessly. The library door and pending-package Install
are unchanged apart from the identity reuse.

| Status | Code | When |
|---|---|---|
| 400 | `invalid` | `production` without a name, two graphics with one name, a layer outside 1-100, or a cue naming no graphic of the set |
| 403 | `forbidden` | the key lacks `productions:create` |
| 404 | `not_found` | the deployment's database has no 0094 yet: nothing was saved |
