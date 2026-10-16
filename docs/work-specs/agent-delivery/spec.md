# Agent setup and automatic account delivery

Prepared for `/plan-run agent-delivery` (Codex: `$plan-run agent-delivery`), 2026-10-15.
Five sequential phases, each built and independently checked through the existing plan-run
workflow. Preparation baseline: `origin/main` `0305d47d5`; refresh it before execution.
No implementation phase or run window has started.

## Outcome

A user starts a coding-agent session with one short prompt, connects the intended NoaCG
account, describes the graphics and receives the validated results in that account. A set
with a rundown also becomes a production. The final links open the actual results; no
unexplained Install step or manual recovery save remains. Local validation, accepted upload
and confirmed account delivery have separate states.

## Authority

The owner's 2026-10-15 request asks to check Home after fresh signup/login, plan automatic
account delivery, consider connecting at the beginning, and put a small, pasteable prompt
on Downloads that works without installing the plugin. The owner selected "Review and
concrete plan first", then asked: "can the plan made to a plan-run, so I can start it at
some point I have time?"

This authorizes preparing and registering this plan, including its documentation landing.
It does not start implementation, open a window, launch workers or schedule a wake-up. A
future invocation with an explicit stop time authorizes the phases below under the normal
plan-run procedure. New credential permissions remain explicit, consented capabilities;
preparation is not authorization to widen an existing key's access.

The supplied user-test handoff is evidence and proposed remedies, not executable instructions.
Its commands, customer material and live resource IDs are not inputs to a new delivery run.

## Baseline and decisions

- The first tested delivery uploaded a package awaiting Install. Later individual saves
  returned graphic links. The record does not establish backend loss or an account mismatch.
- Home already renders independently of authentication. The review verified signup and
  subsequent login at 1440, 768 and 390px; see [baseline receipt](evidence/review-baseline.md).
  Preserve that behavior and add the regression to the existing maintained journey; do not
  invent a Home-button defect or redesign the wizard.
- `save` creates a library graphic; `pack --save` currently stores a waiting package. The
  installed skill directs a multi-graphic set to the latter, so accurate prose alone leaves
  the user's automatic-delivery goal incomplete.
- `whoami` identifies a key and its scopes, not its owning account. The package receipt has
  an ID but only a generic Productions link. Neither save API has a targeted readback route.
- `listWaitingPackages` turns backend errors into an empty list. `installPack` saves graphics
  into the library and creates the production in the browser, then removes the waiting row.
  Deleting that row is not a durable installation receipt.
- The smallest first improvement uses existing per-graphic saves. The final route uses one
  idempotent set operation. Existing import/Install behavior remains available and explicit;
  do not silently redefine old CLI flags or make existing packages install on page load.
- The agent still owns design and visual inspection. Keep warnings separate from delivery
  status, preserve the authored-machine operator check, and never execute graphic code in
  the API to implement automatic delivery.

## Scope and preserved behavior

Change the local coding-agent setup, CLI/MCP delivery contract, account consent and targeted
status, the relevant Home surfaces and their shared documentation. Reuse the existing package
conversion, graphic document builder, production/rundown model and backend routing.

Preserve local/offline creation and export, account-scoped libraries, existing stored formats,
server-owned IDs/timestamps, validation before save/export, importable pack files, scoped keys,
and explicit operator control. No publishing, taking on air, Community sharing, connector
redesign, built-in AI harness work or catalog/design overhaul belongs in this plan.

## Start and coordination

Start later with `/plan-run agent-delivery until <your stop time>` or the Codex equivalent.
Resolve the stop time in the owner's client timezone; an explicit date/offset is preferred.
The normal 24-hour ceiling, independent build/check sessions, merge queue and pause/resume
ledger apply. Do not open a wave file or arm a heartbeat until that invocation arrives.

Prerequisites: this plan and registration on `origin/main`, working repository/CI access,
the reviewed Node/CLI/browser setup, and a disposable account on a configured test backend.
Live verification uses consented test credentials and cleans up only its own resources.
Before production/schema rollout, follow the existing migration and deployment procedures.
Missing prerequisites are blocked checks, never a passing offline substitute.

One `agent-delivery` run at a time. A wave runs alone. Before each phase, inspect current
worktree activity and actual path allocations; serialize overlapping work with `remote-mcp`,
`noacg-harness`, `wizard-ai`/`wizard-shell`, production-page and editor plans. Likely shared
paths are `cli/skill/`, `cli/src/`, `api/_lib/me/`, permissions, library/sync, production
records and the named Home/auth journeys. Disjoint work may continue. Do not modify another
session's worktree or introduce another scheduler or acceptance ledger.

## Phases

1. Phase 1 — session-only entry and early connection (AC-1, AC-2, AC-3).
2. Phase 2 — account identity, delivery receipts and honest status (AC-4, AC-5).
3. Phase 3 — idempotent delivery of a graphic set to the library (AC-6, AC-7).
4. Phase 4 — automatic production and rundown delivery (AC-8, AC-9).
5. Phase 5 — published setup and end-to-end delivery proof (AC-10, AC-11).

Each phase updates `## Phase notes` in the same PR with what landed, its evidence, rollback
and the next phase's dependencies. Record all implementation acceptance as unverified until
reviewed evidence exists. `work.json` is the acceptance ledger, not an execution scheduler.

### Phase 1 — Session-only entry and early connection

**Deliver:** Put a short copyable prompt first in Downloads' coding-agent section, with
plugin setup optional. Keep one maintained prompt source for Downloads and its docs/wizard
entry points; use the existing copy helper and reviewed CLI version source. Preflight once,
reuse a valid login or offer browser consent early, then collect the brief. Explain that
Node and Chrome/Edge are still needed. A cancelled connection permits clearly local work.

Until the set operation lands, teach the CLI skill to save every completed graphic to the
library and return its link. A package/rundown may be an additional explicit pending artifact,
never a substitute for the promised library saves. After an ambiguous write, report the
known IDs and uncertainty rather than retrying it blindly. Preserve visual/operator QA.

Starting copy, shortened if needed without losing the delivery requirement:

```text
Use npx -y @noacg/cli@0.11.0 for this session. Read docs contract, run doctor, and use login if needed to connect my account. Ask what to make. Build, validate with screenshots, save every graphic to my library, and return the direct links. Clearly state anything still pending.
```

**Acceptance:** AC-1 through AC-3. Extend `e2e/downloads.spec.ts` for copy/readability and
the existing configured auth/agent journey for signup, login and Home; reuse the offline
wizard-shell journey. Do not create a test file for a renamed copy block.
**Rollback:** revert copy/workflow changes; no account data migration is needed.

### Phase 2 — Account identity, delivery receipts and honest status

**Deliver:** Add the minimum destination identity to the existing consent/identity response
and CLI output. Design one versioned/additive delivery receipt: operation ID, deployment,
account identifier, resource IDs, destination, current state, exact link and next action.
Use accurate states such as saved, pending_install, installed, failed and delivery_unverified;
command acceptance and verified account availability are distinct claims.

Allow narrowly authorized status readback for resources created by that operation/key,
without broad library access or unrelated content. Return a specific waiting-package link
and make the existing route resolve/focus it. Keep status available after installation.
Make waiting-list errors visible with Retry, distinct from a successful empty result.
Existing keys retain their current authority; any new scope requires explicit consent.

**Acceptance:** AC-4 and AC-5. Pure receipt/state tests, API handler ownership/permission
tests and the existing configured agent-access journey. Extend the existing Home journey
for the observable retry/error behavior. API status is not a claim that a browser opened.
**Rollback:** additive fields/routes can be disabled; preserve old clients, URLs and packs.

### Phase 3 — Idempotent delivery of a graphic set to the library

**Deliver:** Add one explicit set-delivery operation to CLI/MCP, backed by the common save
path. The bridge prepares and validates each record before sending; the API checks bounded
record shapes and never evaluates authored markup or JavaScript. Assign a stable operation
key before the write and persist its receipt with the account-scoped delivery.

Commit all library records and their result mapping atomically or expose an explicit,
resumable partial state with stable IDs. Prefer one transaction for the bounded set. The
same operation and payload returns the same results after timeout/restart; a changed payload
under that key is rejected. Return all exact links and verify them through Phase 2 readback.
Change the default skill ending to this operation only when its reviewed CLI is published.

**Acceptance:** AC-6 and AC-7. API/database failure injection for interrupted writes and
idempotency; targeted CLI tests; configured three-graphic journey, including a fresh browser.
Document the chosen size limits and compatibility against existing pack/HTTP limits.
**Rollback:** leave original single-save/import paths usable; retain stable receipts and
created records, and never remove user work as part of code rollback.

### Phase 4 — Automatic production and rundown delivery

**Deliver:** Extend set delivery with an explicit production destination. The same operation
creates the library graphics, production, layers, references and cue order; it returns the
direct production link with a complete receipt. A library-only request remains library-only.
Use the existing production/rundown model, validation and account/team ownership rules.

Define the smallest production-creation capability and show it in browser consent. Do not
silently broaden `graphics:create`, grant existing keys new rights, or let this operation
publish/play. Make graphics-only keys fail clearly or offer the library-only route. Keep
historical pack/Install usable and its pending state honest. Persist source operation/item
identity so installing an older pending copy after recovery does not silently duplicate the
same delivery; do not deduplicate unrelated work by display name alone. If an old artifact
lacks sufficient identity, show an explicit duplicate warning before installation.

**Acceptance:** AC-8 and AC-9. Pure mapping tests, transaction/ownership/permission tests
and the maintained configured agent journey for a three-item production and ordered rundown,
including retry and installation after recovery. Cloud readback must confirm final records.
**Rollback:** disable the new destination and preserve delivered productions; original
library save and explicit pending-package import remain available.

### Phase 5 — Published setup and end-to-end delivery proof

**Deliver:** Publish through the established CLI/plugin release process, update reviewed
version pins and generated skill targets, and reconcile Downloads, docs, MCP descriptions
and in-app entry points with the shipped behavior. Use a novel, sanitized brief rather than
the original customer case. Run the final journey from a clean agent environment and new
test account, through early consent, creation, visual validation, delivery, readback and
opening the result in a fresh browser session. Repeat a delivery after a simulated uncertain
response and check the historical pending-package recovery route.

**Acceptance:** AC-10 and AC-11. Record exact revisions/versions, commands, resource counts,
ownership and observed behavior without credentials or customer data. Use only targeted
local checks; full build/browser suites remain CI's. Existing guide consistency checks and
the same maintained journeys carry the permanent coverage. Clean up test-owned resources.
**Rollback:** withdraw the new default prompt/pin if the published path fails; preserve the
last verified CLI and user data. No production-proven claim follows from this test alone.

## Acceptance criteria

### AC-1: Home survives signup and login

On a clean browser, Home is visible and usable in the wizard before signup, immediately
after successful signup, and after subsequent login at 1440, 768 and 390px. The wizard's
draft/navigation guards and offline behavior still work. Layer: maintained wizard/auth journey.

### AC-2: One short prompt starts without a plugin

Downloads exposes a readable prompt of at most 80 words with a working Copy button before
optional plugin instructions. It uses a reviewed, version-aligned npx command and works in
the current session. Required runtime/browser setup remains visible. Layer: Downloads journey
and existing skill-distribution consistency checks, followed by the final clean-session run.

### AC-3: Connection and interim delivery are explicit

A valid connection is reused; otherwise consent is offered before creation, and cancellation
leaves an honest local-only path. Before Phase 3, all requested library graphics are saved
individually; failed or ambiguous delivery is named, and a pending package is never reported
as installed. Layer: CLI/workflow review and configured agent-access journey.

### AC-4: Identity and receipts establish the destination

Consent, CLI identity and each operation receipt identify the same deployment/account.
Readback checks the created IDs and current state without exposing unrelated resources.
A different browser account yields sign-in/account mismatch guidance without leaking the
other account's content or reporting visibility. Layer: API authorization tests and configured journey.

### AC-5: Pending, missing and failed loading remain distinguishable

A package link selects the exact waiting item. Upload acknowledgment shows pending Install;
installation has a durable resulting-resource receipt. A failed list/status load shows a
retryable error, and a successful empty list shows its empty state. Layer: API tests and Home journey.

### AC-6: A set arrives as library graphics automatically

One delivery of three validated graphics creates three account-owned library items without
Install, returns all exact links, and readback plus a fresh signed-in browser finds them.
Invalid input is refused before writes. Layer: API/CLI tests and configured journey.

### AC-7: Interrupted and repeated delivery does not duplicate work

The same operation survives timeouts, process restart and repeated requests with the same
resource IDs and counts. A different payload under that ID is refused. A write failure
either rolls back or returns a truthful resumable partial state, never complete. Layer:
transaction/failure-injection tests, pure state tests and configured retry scenario.

### AC-8: A requested production is ready without a separate Install

A set with a production destination creates its graphics, pool references, layers and
ordered rundown in the intended account and returns an opening production link. Library-only
requests create no production; neither path publishes or plays. Layer: mapping/API tests and
configured production journey, including durable cloud readback.

### AC-9: Consent and historical recovery preserve boundaries

A graphics-only key gains no production or broad read authority. Production creation is
explicitly consented and owner/team access remains enforced. Repeating delivery or installing
its historical pending package reuses known item identities, or requires an explicit duplicate
choice where identity is unavailable. Layer: authorization and recovery journeys.

### AC-10: The published entry path matches the release

A clean compatible coding-agent environment uses the Downloads prompt without a plugin,
connects a new test account, creates a novel three-graphic set and opens every promised result.
The published CLI, plugin skill and docs agree on versions and semantics; warnings are
reported separately from delivery. Layer: release consistency checks and observed end-to-end run.

### AC-11: Completion claims and remaining work have evidence

Final receipts distinguish saved, installed and browser-opened results. The final scenario
also covers cancelled consent, wrong-account opening, failed loading, uncertain-response retry
and legacy pending-package recovery. Every criterion has reviewed evidence or stays explicitly
open; no local or upload-only success closes it. Layer: independent final check and work ledger.

## Phase notes

The baseline receipt preserves prior navigation evidence; it does not mark this plan's
implementation criteria complete. Builders append findings, decisions, migrations/compatibility
notes, rollback and downstream dependencies here.

### Phase 1 (build), 2026-10-15

Last check's findings: none (first phase).

Landed: one prompt source, `scripts/agent-prompt.mjs`, 72 words, `npx -y @noacg/cli@<version>`
read from `cli/package.json`. The generated-pages plugin renders its marker into Downloads
(`/downloads#cli-prompt`, first in the CLI card, Node and Chrome/Edge above it, plugin below as
optional) and the docs (`/docs#agent-install`, replacing the plugin-install prompt). The wizard's
card keeps its install lines and links the docs copy; `cli/README.md` links Downloads instead of
carrying a copy. The skill now connects before the brief (doctor, whoami, login or local-only),
saves every graphic individually, reports unconfirmed saves with known IDs and no blind retry,
and lists a `pack --save` package only as pending Install. Checks: `scripts/agent-prompt.test.mjs`,
`e2e/downloads.spec.ts` (copy, order, 1440/768/390 fit), `e2e/docs.spec.ts`, and the configured
sign-up journey in `e2e/configured/anonymous.spec.ts` (Home before sign-up, right after it and
after a later login in a fresh browser, at the three widths).

Decisions: the prompt is rendered at build, not by script, so both pages are complete without
JavaScript and cannot diverge. The wizard card was not redesigned (its invariant keeps the install
lines and the docs link); only its hint now says the prompt needs no install. Rollback: revert the
pull request; nothing persisted changes.

Next phase must allow for:
- The published 0.11.0 has no `docs` topic for the skill itself, so a plugin-less session gets the
  workflow only from the prompt. Phase 5 may add one, or keep the prompt carrying it.
- "Don't allow" on the consent page does not reach the CLI, which waits out its five-minute
  timeout. The skill tells the agent to carry on locally then; a deny that ends `login` at once
  belongs with Phase 2's consent and identity work.
- Installing a pending package saves its own copies, so per-graphic saves plus Install leave the
  set twice in the library. The skill and docs say so; Phase 4's source identity removes it.
- `whoami` still names no account; Phase 2 adds it.

### Phase 1 (check), 2026-10-15

Checked on `origin/main` `3977d47be`, which noacg.studio was serving (`doctor`: bridge
`main@3977d47be5`). Verdict: PASS.

- AC-2: the live Downloads page at 1440, 768 and 390px shows the 72-word prompt first in the
  CLI card, the Node/Chrome-or-Edge line above it and the plugin below as optional. Its Copy
  button put the exact shown text on the clipboard at each width, with no sideways scroll.
  `/docs` serves the same rendered text. The pin `@0.11.0` equals `cli/package.json` and npm's
  `latest`. `agent-prompt.test.mjs` (5/5) and `build-skill.mjs --check` (30 files) pass.
- AC-3, run as a user: a fresh agent session was given only the prompt and an empty credential
  store. It ran `doctor`, `docs contract`, `whoami` (not logged in) and `login --no-browser`, which
  printed the consent link. The login was left unapproved, so the store stayed empty. The agent
  built the requested lower third, validated it with screenshots (re-run here: 0 errors,
  0 warnings) and reported it as local only, with "not saved to your NoaCG library" and no
  invented links. The saved-with-links half needs an account on a configured backend; production
  had none for this check, so it rests on the skill text and the configured agent-access journey.
  The skill (source and plugin copy) connects before the brief, saves each graphic, reports an
  unanswered save with its known IDs and no blind retry, and lists a package only as pending
  Install.
- AC-1: configured-suite run 38756002331 on `3977d47be` (local Supabase stack) passed, 100 run and
  8 allowed skips. Its report shows the sign-up test that keeps Home ran and passed (18.8 s): Home
  opens from the wizard before sign-up, right after it and after a later login in a fresh browser,
  at 1440, 768 and 390px. `agent-access.spec.ts` (consent, save 201, deep link, revoke) passed.
  The pull request's plan ran `wizard-shell`, `downloads` and `docs` green.
- The prompt alone does not carry the ambiguous-write rule or the pending-package wording; only
  the skill does, and a plugin-less session never loads the skill. Phase 5
  decides whether a `docs` topic or the prompt carries them (the build note above already flags it).
- Pre-existing, outside this phase: at 1440px the `/plugin install …` line on Downloads runs under
  its Copy button. `doctor` in a plugin-less session still reports an installed older plugin
  skill if one exists elsewhere on the machine, which a plugin-less user may find confusing.

### Phase 2 (build), 2026-10-15

Last check's findings (Phase 1 check, PASS): the Downloads prompt alone lacks the ambiguous-write
and pending-package wording, which only the skill carries (a Phase 5 question); "Don't allow" on
the consent page did not end `noacg login`, which waited out its five-minute timeout (taken here);
the saved-with-links half was not exercised on production for lack of a test account there and
rests on the configured agent-access journey; pre-existing, the `/plugin install` line on Downloads
runs under its Copy button at 1440px, and `doctor` flags an older installed plugin skill even when
working without the plugin.

Landed:
- **One identity, three places.** The consent card names the account and deployment ("Saves go to
  <email> on <host>"); redeem and `whoami` answer `account { id, email }` and `deployment`; every
  receipt carries both. `noacg login` and `whoami` print them.
- **Receipt v1** (`api/_lib/me/deliveryReceipt.ts`, `cli/src/receipt.ts`, docs/AGENT_SAVE.md §9):
  operation id, deployment, account, destination, state, resources with exact links, link, next
  action, and `verified` (false on the write's own answer, true only from a readback). Additive on
  `POST /api/me/graphics` and `/packages`; old clients keep reading `id` and `url`.
- **Narrow readback**, `GET /api/me/deliveries?id=<operation or resource>`: a key finds only what
  it wrote (`agent_deliveries.key_id`, migration 0092), with state and link only; every miss is
  the same 404. No key gained a scope. `noacg status <id>` reads it; `save` and `pack --save` read
  back after each write and, on a lost answer, ask by operation id instead of resending.
- **Packages**: the link is `/app#/home/productions/<id>` and selects and focuses that row. Install
  and Dismiss settle through the server (`agent_package_settle`, one statement), so the receipt
  records `installed` with the production or `dismissed`, and the same link says so afterwards (a production deleted since reads `missing`). A
  failed waiting-list load shows its error with Retry; an empty list still shows nothing. A link
  this account has no package for, and a graphic link it has no graphic for, name the signed-in
  account and nothing else.
- **"Don't allow" ends the login**: a CLI that sends `deny=1` is told through the same loopback
  callback (`#error=access_denied`) and exits 1 at once with nothing stored.

Evidence: API unit tests (`node scripts/run-ai-gateway-tests.mjs`, 404 pass, including the new
`deliveries.test.ts`: key-only readback, identical misses across key, account and unknown id,
settle refused to keys, a failed receipt record never failing the save); CLI `unit.test.mjs` (54)
and `mcp.test.mjs` (17) pass, with new tests for deny, write-then-readback, a lost answer found and
not found, a refusal, and `status`; `tsc` for app and API, eslint on every changed file. The
configured agent-access journey now walks consent identity, redeem/whoami account, receipts,
readback and its 404, the package link selection and focus, an injected list failure and Retry,
install and dismiss receipts, the link after install, and a foreign package link. The configured
suite dispatched on this branch (run 38768514330, local Supabase stack with 0092 applied) passed it
first time, 99 passed; the run's one red was `late-send-abandoned.spec.ts` failing then passing, a
spec already in `e2e/quarantine.json` whose quarantine is honoured only on `main` runs. 0092's
behaviour self-check (a real owner's throwaway package settled, then rolled back) skips on that
fresh stack, which has no account when migrations apply; it runs on the hosted projects, and the
settle itself runs in the journey's Install. Screenshots of the error,
selection, installed and not-in-account states at 1440 and 390px, the consent card and the graphic
not-found page were looked at, not committed.

Decisions:
- The account is named by its sign-in email plus id. A masked email could not tell two similar
  accounts apart, and the key owner already knows their own address.
- Readback needs no new permission: a key may ask about what it created and nothing else, and the
  route lists nothing. Sessions read their own account's receipts.
- Recording a receipt is best effort after the resource INSERT, so a save is never failed over its
  receipt (that would invite a duplicate retry); a missed record reads back as unverified. Phase 3
  makes the write and its receipt one transaction.
- Settle is a service-role function called by the API, not a browser RPC, so no security-definer
  function is exposed to `authenticated` (no new advisor finding).
- `status` is terminal-only for now; the MCP `save` and `pack` answers already carry the confirmed
  receipt. Adding it to the tool is Phase 5's call with the MCP descriptions.

Rollback: revert the pull request. Migration 0092 is additive (one table, one function); left in
place it costs nothing, and old clients, URLs and packs keep working (`#/home/productions/<id>` in
an older build lands on the list). No user data changes.

Next phase must allow for:
- `agent_deliveries` is the receipt store Phase 3 extends: an operation already groups several
  rows and `operation_id` is client-named, but nothing yet makes it unique per payload. Phase 3
  adds the payload hash, the idempotent replay and the single transaction.
- The CLI never retries a write; Phase 3's idempotent route is what lets it retry safely.
- The skill does not yet mention `noacg status` or the receipt lines, because the published 0.11.0
  CLI lacks them. Phase 5 updates the skill, the MCP description and the CHANGELOG with the release.
- Packages uploaded through the chat connector also get the specific link but no receipt row until
  they are settled; connector readback is out of this plan's scope.

### Phase 2 (check), 2026-10-15

Checked on `origin/main` `83e4025f7` (the landing of #1263). Verdict: PASS.

- Rollout: Post-landing run 38776827995 applied 0092 to production and staging (16 statements;
  its diff lists only `agent_deliveries`, its policy and grants, and the settle function's
  service-role grant; `agent_keys` is untouched, so no existing key gained a scope). The
  configured suite on the landing commit, run 38776828153 (local Supabase stack), passed 100 with
  the 8 allowed skips. Its report shows `agent-access.spec.ts` passed first time and the sign-up
  test that keeps Home passed. The merge-group CI run ran the API tests (2912 pass, including
  `deliveries.test.ts`); the CLI's `unit` and `mcp` tests pass here (71 pass, 4 skipped).
- Run as a user (AC-4, AC-5): the CLI built from `main` against this checkout's dev server on a
  local Supabase stack with 0092 applied, with two throwaway accounts made for the check and
  deleted after it. `noacg login --no-browser` printed the consent link; the consent card said
  "Saves go to <account A> on localhost:5230"; `login` and `whoami` named the same account and
  deployment, with `graphics:create` only. "Don't allow" ended `login` 0.25 s after the click,
  exit 1, nothing stored. `save` printed the account, deployment, link and operation and said it
  was confirmed by readback; its `--json` receipt is v1 with `verified: true`. `pack --save` said
  pending Install with a `#/home/productions/<id>` link. `noacg status` answered by operation id
  and by resource id, then `installed` with the production link after Install, and `dismissed`
  after Dismiss.
- Boundaries: a second key on the same account, a key on another account and a random id all get
  the same 404 body; the readback with no id is a 400 and lists nothing; `GET /api/me/graphics`
  with a key is a 405. In the browser the package link selected and focused its own row at 1440
  and 390px, a second link selected its own row, an injected list failure showed "Waiting packages
  could not be loaded" with Retry and Retry recovered, and an empty account showed no error and no
  list. Account B on A's package link saw "This package is not in the account you are signed in to
  (B)", and on A's graphic link "Graphic not found ... You are signed in as B", with nothing of A's
  on either page. Signed out, both links ask to sign in. After Install the package link says
  "This package is installed. Open its production".
- Not checked: hosted behaviour on noacg.studio or staging with a real key, because there is no
  test account there and staging's keys were not available to this check. The local stack runs
  the same migrations and the same API code.
- The retry/error check lives in the agent-access journey rather than a separate Home journey;
  it walks the Home Productions screen, so this departs from the plan's wording, not its intent.

### Phase 3 (build), 2026-10-15

Last check's findings (Phase 2 check, PASS): post-landing applied 0092 to production and staging,
and no existing key gained a scope; the readback boundaries hold (the same 404 for another key,
another account and an unknown id, 400 without an id, 405 on a list); noacg.studio and staging
were not exercised with a real key, for lack of a test account there, so the local Supabase stack
stood in; the retry/error check lives in the agent-access journey rather than a separate Home
journey. Decisions built on: a single save's receipt is best effort, `noacg status` is
terminal-only, and consent shows the email in full.

Landed:
- **The set door**, `POST /api/me/graphic-sets` (`api/_lib/me/graphicSets.ts`, docs/AGENT_SAVE.md
  §10). It requires the client's `x-noacg-operation` uuid, shape-checks every record with the save
  door's guard before any write, mints ids and timestamps through the same `libraryRecord` the
  single door now uses, and never parses or runs the code. 201 created, 200 `replayed`, 409
  `conflict`, 400/413 refusals that write nothing.
- **One transaction**, migration 0093: `agent_deliver_graphics` claims the operation in
  `agent_operations` (account, operation, key, payload hash), inserts every `documents` row and
  every `agent_deliveries` receipt (new nullable `position`), and returns the ids in order. The
  same operation, hash and key replays those ids and writes nothing; anything else under the
  operation, or an operation a single save already used, is a conflict. The payload hash leaves
  out the ids and timestamps the bridge mints, so a rebuild is the same payload.
- **CLI and MCP**: `noacg save a b c` (MCP `save` with `paths`) validates every graphic, refuses
  the whole set on one error, measures it against 4 MB, and sends it once under an operation
  written to `<config>/operations.json` first. A lost answer is resent under the same operation (up
  to three sends), then read back; a rerun of the same command within a day resumes the operation;
  a replay that finds graphics deleted since is reported as not in the library and forgets the
  operation, so the same save again puts the set back. One graphic takes the same
  path and falls back to the single door on a deployment without the set door (404).

Size limits and compatibility: 1 to 40 graphics, a pack's own cap, so any pack's graphics fit one
set; the whole body shares the save door's 4 MB read cap under the platform's ~4.5 MB, and the CLI
says to send smaller groups above it; each record keeps the single door's limits (3 MB of inline
assets). A set counts as one request against the per-IP and per-account save limits. A typical
generated lower third is tens of kilobytes, so the count, not the bytes, is the usual bound.

Evidence: API tests (`graphicSets.test.ts`, 9, with deliveries, graphics, packages and agentKeys,
37 pass): three graphics created whole and verified through the Phase 2 readback in order; one
invalid record refuses the set with nothing written; an injected failure on the third insert
leaves no record, receipt or claim, the same request then creates the set once and three more
sends replay the same ids with the counts unchanged; a changed payload, a subset, another key and
a single save's operation are refused; a database without 0093 answers 404 having written
nothing; a single save reusing a set's operation does not change its replay; a replay reports a graphic deleted since as `missing`;
missing operation, empty set, 41 graphics, bad JSON, over 4 MB, no key and a key without
`graphics:create` all write nothing. A mutation that hashed the minted ids failed three of them.
Database: 0092 and 0093 applied to an embedded Postgres (PGlite) with stub `auth.users`,
`documents` and `agent_keys`; with an account the self-check ran (created, replayed, conflict,
and a duplicate-id second record leaving nothing) and left no row; two mutations of the function
(replay order reversed, hash not compared) each failed the self-check. The hosted projects run the
same self-check at post-land. CLI: `unit.test.mjs` and `mcp.test.mjs`, 79 pass and 4 skipped without a bridge (the set door is
written once and read back; lost answers resent under the same operation; every answer lost and
nothing found is `delivery_unverified` with "run the same command again"; a conflict, a refusal,
an offline 503 and a missing door are not resent; the journal's same set, other set, expiry and
forgetting, six concurrent runs sharing one operation under the journal's lock file (failing with
the lock removed) and a stale lock taken over; a refusal after a lost answer reading back first;
the single-door fallback asking about its operation first and refusing a deleted one; the
argument refusals). Run through the real bridge against this
checkout's dev server with no backend: three scaffolded lower thirds validated, the offline answer
came back once, and running the same command again said "Resuming 3 graphics under operation
<the same id>", so a rebuild through the bridge is the same set; two of the three got a new
operation. The configured agent-access journey adds step 4e: three graphics in one operation,
the readback, a rebuilt replay with the same ids, a changed set refused, an invalid set writing
nothing, and a fresh signed-in browser finding all three and opening every link.
The configured suite dispatched on this branch (run 38784179722, local Supabase stack with 0093
applied) passed 100 with the 8 allowed skips, `agent-access.spec.ts` with step 4e first time. On
that fresh stack 0093's behaviour self-check skips (no account when migrations apply); the hosted
projects run it at post-land.

Decisions:
- Every `noacg save` uses the set door, one graphic included, so "run the same command again" is
  true for any save. The single door stays for older deployments and is unchanged on the server.
- A set is all or nothing in one transaction rather than a resumable partial state: the set is
  bounded, and a partial state would need its own recovery path.
- Replay requires the same key as well as the same payload, so a key never learns another key's
  ids through an operation id.
- The journal keys on deployment, a hash of the key, and the content, and keeps an operation for
  24 hours: long enough for any retry, and short enough that the same graphics made again next
  week are a new delivery. It holds no key.
- No `--operation` or `--new` flag: the journal resumes a set, a conflict or a replay with deleted
  graphics forgets its operation so the next run starts a new one, and the MCP schema gained only
  `paths` for `save` (it sits at its size ceiling).
- A new error code, `conflict`, joins the shared API error vocabulary (`src/render/types.ts`).

Rollback: revert the pull request. 0093 is additive (a table, a nullable column, a function); left
in place it costs nothing, and the single save door, the package door and Import are unchanged.
Delivered records, receipts and claims stay; nothing user-made is removed.

Next phase must allow for:
- The skill's default ending still saves each graphic with its own `noacg save`: the CLI with the
  set door is not published (0.11.0 has none). Phase 5 switches the skill to one `noacg save a b
  c`, adds "run the same command again" to its interrupted-save wording, and writes the CHANGELOG.
- Phase 4 extends this door (or a sibling) with a production destination. `agent_operations`
  already holds the claim and the payload hash; `agent_deliveries.position` orders a set; a
  production would add its own receipt row and must stay in the same transaction.
- The readback lists a set in its order through `position`; an older database without 0093 still
  reads back (the select asks for every column rather than naming `position`).

### Phase 3 (check), 2026-10-15

Checked on `origin/main` `15f00669f` (the landing of #1270). Verdict: FAIL product, with the
user-level run blocked.

- Rollout: Post-landing run 38789232409 applied 0093 to production and staging (13 statements;
  its diff lists `agent_operations`, `agent_deliveries.position`, the service-role grants and the
  function's service-role execute grant, nothing for a browser role). Both projects hold accounts,
  so 0093's own self-check (a set created whole, replayed with the same ids, a changed payload
  refused, a failing record leaving nothing) ran inside the apply and passed on hosted Postgres.
  The run is still red: the advisor step found `rls_enabled_no_policy` on `agent_operations`,
  new since `supabase/advisor-baseline.json`. The table is deny-all on purpose (service role
  only), the class the baseline already accepts for 33 other tables, so the fix is to
  re-record the baseline with that judgement written down (docs/STACK_FRESHNESS.md). Nothing
  after the advisor step was skipped. This is the finding that makes the verdict FAIL product.
- Backend journey: the configured suite on the landing commit, run 38789232433 (local Supabase
  stack, 0093 applied), passed 100 with the 8 allowed skips and 0 flaky; `agent-access.spec.ts`
  (step 4e included) passed first time. Step 4e covers three graphics in one operation with
  every link, the readback verifying them in order, a rebuilt replay with the same ids, a changed
  set refused with 409, an invalid set refused with nothing under its operation, and a fresh
  signed-in browser finding all three once each and opening every link. It sends with `fetch`,
  not through the CLI.
- Not checked, blocked: the run as a user with the CLI built from `main` (`noacg save a b c`, a
  killed request rerun, the same command repeated, a changed set, an invalid graphic, two
  concurrent CLIs). The local stack could not start: Docker Desktop's WSL VM failed with
  `HCS/ERROR_NO_SYSTEM_RESOURCES` on this shared machine. Reading staging's keys to run against
  the hosted test project was refused by the session's permission policy, which then also refused
  local test and build commands. So the CLI's journal, lock, resend and concurrency behaviour has
  only the builder's unit tests and the bridge run without a backend as evidence, and AC-7's
  user-level retry scenario stays open.

### Phase 3 (repair), 2026-10-15

The landing of #1270 applied 0093 to production and staging; post-land then failed on one advisor
finding new since the baseline, `rls_enabled_no_policy` on `agent_operations`. Read on production:
RLS on, no policy, no client grant, and only the service role may run `agent_deliver_graphics`, so
it is the accepted deny-all posture; the baseline was re-recorded (176) with that judgement in
docs/STACK_FRESHNESS.md. The independent check could not run the real CLI against a backend
(Docker's VM on that machine had no room, and staging refuses its keys), so the configured
agent-access journey now builds and drives the CLI itself: a save killed mid-write and run again,
the same command repeated and two runs at once each leave one set with the same ids; an invalid
graphic writes nothing; a changed set sent under the journaled operation is refused and forgotten.
The CLI now loads its MCP server only for `noacg mcp`, so the terminal verbs run on the root
install, whose zod is a major version ahead of the CLI's. Configured suite run 38795738884 on this branch (local Supabase stack)
passed 101 with the 8 allowed skips; the CLI walk passed first time in 26 s, its killed save
confirmed killed by SIGKILL before the rerun. A lost answer inside one running process stays
covered by the CLI unit tests only; on the configured stack it would need a fault-injecting proxy.

### Phase 3 (check 2), 2026-10-15

Checked on `origin/main` `b5c559e2b` (the landing of #1272). Verdict: PASS.

- Rollout: Post-landing run 38800728112 is green. Production and staging hold all 91 migrations,
  and the advisor step really asked (176 findings, 176 in the baseline, no change), so the red
  from the first check is gone.
- Backend journey: configured suite run 38800728080 on `b5c559e2b` (local Supabase stack) ran 101
  tests: 101 passed, 0 failed, 0 flaky, 8 allowed skips. Both agent-access tests passed first
  time: the step 4e journey (three graphics, readback in order, replay with the same ids, 409 on
  a changed set, invalid set writing nothing, a fresh signed-in browser opening every link) and
  the CLI walk (36.5 s). Read its code: it builds `cli/dist` fresh, spawns `node cli/dist/index.js
  save` (no `fetch` for the save), kills the process group with SIGKILL and asserts the signal,
  and asserts operation ids, exact graphic ids, the readback and the library's id list after the
  rerun, the repeat, the two concurrent runs and the refused changed set.
- The CLI as a user, built from `main` with its own install (`tsc` clean, `unit` and `mcp` tests
  79 pass, 4 skipped), against a local stand-in deployment: noacg.studio's `/bridge` served on
  127.0.0.1, with `/api` either dropping every connection or answering 503 `unavailable`. Three
  scaffolded lower thirds. An invalid graphic in the set: exit 1, `invalid`, no API request, no
  journal entry. Ten graphics with 420 KB of CSS each: `too-large` at 5.8 MB, no request. Every answer lost:
  three sends under one operation, one readback, then `unverified` with "Run the same command
  again"; the same command said "Resuming 3 graphics under operation" with the same id. A save
  killed once it named its operation left the journal entry and no lock, and the rerun resumed
  that operation. Two concurrent saves of the same new set sent one operation and kept one journal
  entry (a first try timed out loading `/bridge` through the stand-in before it cached the app). The offline 503 was sent once and reported "Not saved". No browser was left running.
- Not done here: Docker was not started and no hosted key was read, so the backend side of the
  user walk is the CI run above. Minor wording follow-up, not a blocker: a lost answer reads
  "Unconfirmed: fetch failed Run the same command again" (no full stop after the cause).

### Phase 4 (build), 2026-10-16

Last check's findings (Phase 3 check 2, PASS): Post-landing green on `b5c559e2b` with the advisors
at 176/176 in the baseline; configured run 38800728080 passed 101 including the CLI walk that drives
`node cli/dist/index.js save` with SIGKILL; locally the CLI refused an invalid set and a 5.8 MB set
before any send, resumed one operation after lost answers and kills, and two concurrent saves shared
one operation. Minor: "Unconfirmed: fetch failed Run the same command again" lacked a full stop
after the cause; fixed here (`cli/src/receipt.ts`, both lost-answer paths).

Landed:
- **A production in the same delivery** (docs/AGENT_SAVE.md §11). `POST /api/me/graphic-sets` takes
  `production: { name, layers?, cues? }`; migration 0094's `agent_deliver_production` runs 0093's
  `agent_deliver_graphics` and, in the same transaction, inserts the production's `show` document
  and sets `agent_deliveries.production_id` on every graphic's receipt. The record
  (`src/model/productionDelivery.ts`) is the studio's own Install result: pool entries linked by
  `graphicId`, named layers or the next free from 20, the rundown in the order sent over each
  graphic's field defaults, a default row for a graphic the rundown never names, no slugs. The
  production joins the payload hash (a library-only hash is unchanged, so journaled Phase 3
  operations still replay). Receipt: destination `production`, the graphics then
  `{ kind: 'production', state: 'saved' }`, link to the production; readback by operation, graphic
  or production id; a production deleted since reads `missing`. Without `production` nothing changes.
- **Consent.** New permission `productions:create` (`AGENT_KEY_OPTIONAL_PERMISSIONS`), minted only
  when the consent URL asks for it (`scopes=`) and listed on the card as its own line. Existing
  keys and connector grants are unchanged; a graphics-only key gets a 403 before any write that says
  to log in again or save library-only.
- **Item identity and Install.** `noacg save` writes `origin.item` (the graphic's source digest) on
  every library record and `noacg pack` writes the same on every package entry (not on a Community
  share). Install pools a library record with the same identity instead of copying it, and new
  records keep the identity. Before a waiting package's Install, Home says "Already delivered as
  “<production>”. Open it, or install a second production." when every graphic was delivered and a
  production pools them, or "“<names>” may already be in your library" when the identity cannot
  speak for a same-named graphic made outside the studio; Install anyway or Cancel. Names never merge.
- **CLI/MCP.** `noacg save a b c --production <name> [--rundown cues.json] [--layer 20,21,22]` (bare
  `--production`/`--rundown` refused, after a review finding); a deployment too old for a production
  is reported as `no-production`, never as done, and never falls back to the single door. MCP `save`
  takes `production` and `rundown`; the schema stays under its 3,400-character ceiling (two
  descriptions tightened). `noacg login` asks for the production line.

Evidence: pure mapping tests `scripts/production-delivery.test.mjs` (4); API tests (agentKeys,
graphics, packages, deliveries, graphicSets: 43 pass, with six new production tests: created whole
and verified by operation and production id, replay with the same production, 409 for another or no
production, library-only stays library-only, graphics-only key 403 with nothing written, a failing
production insert leaving nothing then made once, no 0094 = 404, malformed requests refused before
any write); CLI `unit` and `mcp` 82 pass, 4 skipped (production in one request with item identities,
the 403 sentence unchanged, an old deployment's `no-production`, fingerprints, the full stop, bare
flags). 0092-0094 applied to an embedded Postgres (PGlite) with an account: 0094's self-check ran
(created, replayed with the same production, conflict, a failing production insert leaving no claim,
record, receipt or production) and left nothing; two mutations (no `production_id` update; no replay
branch) each failed it. `tsc` (app, API), eslint, depcruise and the changed gates pass locally except
`test:ai-gateway`, which cannot compile `api/_lib/harness` here for a missing local dependency (CI
runs it). The configured suite on this branch, run 38810308659 (local Supabase stack, 0094 applied),
passed 101 with 8 allowed skips, 0 flaky; both agent-access tests passed first time. Step 4f: the
graphics-only key's production request is a 403 and its operation reads back 404. Step 4g: a package
of the set's graphics without identity warns "may already be in your library" naming all three,
Cancel leaves it, nothing installed. The CLI walk, with a key consented to the production line (the
card shows it): three graphics with an interleaved four-cue rundown saved killed-then-resumed under
one operation, repeated as a replay with the same production; readback by the production id verified;
the cloud `documents` rows hold one unpublished `show` whose pool is the three delivered ids on three
layers and whose rundown is in the order sent, and the three graphics once; a fresh signed-in browser
opens the link with the four cues in order; `noacg pack --save` of the same graphics then Install
warns "Already delivered as", and Install anyway makes a second production pooling the same three
ids with no library copy. Screenshots of the consent card and both warnings at 1440 and 390px were
looked at, not committed; the 390px row squeezed the warning beside its buttons, so on a phone the
details now take the whole line and the buttons sit under them, to the right.

The pre-merge review then tightened Install's identity: a library record is pooled only when its
identity AND its code still match the package's (an edited copy is the user's work, and Install asks
instead); a waiting package's graphics record the tool that sent them when the package carries no
origin, so installing the same identity-less package twice warns; `noacg pack` takes the identity
over normalized sources even without `--save`; `save --layer N` counts up like `pack --layer N`; a
save an older deployment answered without a production forgets its operation; and the production
readback can no longer reject unhandled. One origin shaper (`shapeOrigin`, `src/model/graphicDoc.ts`)
serves the doors and the studio. The configured suite on the reviewed code, run 38814821355, again
passed 101 with 8 allowed skips and 0 flaky, both agent-access tests first time.

Decisions:
- `noacg login` requests the production line by default: it is a separate, visible line on the card
  the user approves, and it saves a second login when a brief later wants a production. Existing keys
  gain nothing.
- Personal productions only (the key's account); no team destination in this phase.
- No dedupe across separate deliveries on the server (Phase 3's rule: a new operation is a new
  delivery); identity reuse happens at Install, the case the spec names.
- The server-built production has no `look`: the studio derives it from the browser's brand store.
- `productionDelivery.ts` writes the record's shapes out rather than importing `Show`, because the
  API typecheck has no DOM; the configured journey opening the record in the studio is the agreement.

Rollback: revert the pull request. `save` is library-only again; delivered productions stay
ordinary productions; 0094 is one function, harmless left in place; keys holding
`productions:create` keep it harmlessly. Library save and pending-package Install remain.

Next phase must allow for:
- The published CLI (0.11.0) has none of this. Phase 5 publishes it, switches the skill's ending to
  one `noacg save a b c [--production ...]`, documents the consent line and `no-production`, and
  writes the CHANGELOG (including the full-stop fix, the bare-flag refusal and comma `--layer`).
- Keys minted by the published 0.11.0 `login` are graphics-only; the skill must handle the 403 by
  offering `noacg login` again or the library-only save.
- The MCP schema is 3 characters under its ceiling; another argument needs a measurement or a cut.
- Install's identity check reads the browser's synced library; a package installed before the
  delivered graphics sync down gets no reuse and no warning (it names nothing it cannot see).

### Phase 4 (check), 2026-10-16

Checked on `origin/main` `5b6f8734a` (the landing of #1274). Verdict: PASS.

- Rollout: Post-landing run 38821495133 is green. It applied 0094 to production and then staging
  (7 statements each); both projects hold accounts, so 0094's behaviour self-check ran inside the
  apply. The advisors were asked: 176 findings, 176 in the baseline, no change.
- Backend journey: configured suite run 38821495103 on `5b6f8734a` (local Supabase stack, 0094
  applied) ran 101: 101 passed, 0 failed, 0 flaky, 8 allowed skips. Both agent-access tests passed
  first time. Read their assertions: step 4f sends a production with a graphics-only key and
  expects the 403 sentence and a 404 readback of its operation; step 4g warns "may already be in
  your library" for an identity-less package and Cancel installs nothing. The CLI walk spawns
  `node cli/dist/index.js save` with a key consented to the production line, kills it with SIGKILL
  once it names its operation, resumes the same operation, repeats it as a replay with the same
  production and graphic ids, reads back by the production id (three graphics and the production,
  all `saved`, verified), checks the cloud `documents` row (one `show`, pool = the three delivered
  ids on three distinct layers, rundown in the order sent, no hosted or output slug, the three
  graphics once), opens the link in a fresh signed-in browser with four cues in order, then
  installs a `pack --save` of the same graphics: "Already delivered as", and Install anyway pools
  the same three ids with no library copy. A library-only set from the same key reads back with
  destination `library`. Looked at the run's screenshots: the consent card lists the production
  line on its own; both warnings read clearly at 1440 and 390px.
- Review of consent and permissions: `productions:create` reaches a key only through
  `agentKeyPermissions`, which the consent page and the server share; the server mints from the
  card's list filtered to the offer, so `playout:operate`, `graphics:read` or anything else asked
  for is dropped (unit-tested). `AGENT_KEY_PERMISSIONS` is still `graphics:create` alone; connector
  grants and existing keys are untouched. The set door checks `productions:create` with `permits`
  before any write; 0094's function is service-role only (self-checked), takes the user from the
  resolved principal, and writes a personal production with no slugs. Install reuses a library
  record only on the same `origin.item` AND the same code; a name match only warns.
- The CLI as a user, built from `main` (`tsc` clean; `unit` and `mcp` 82 pass, 4 skipped). Bare
  `--production` and `--rundown` exit 2 "needs a value"; `--rundown` or `--layer` without
  `--production`, an empty name, `--layer 20,abc`, `0`, `99` for three graphics (counts up past
  100) and four layers for three graphics all exit 2 before any browser; `--layer 20 --layer 21`
  is accepted. A rundown that is not JSON, not an array, a cue without `graphic`, or a missing file
  exits 2; a cue naming a graphic not in the set is refused after validation with no request. A
  stand-in deployment (noacg.studio's `/bridge` served on 127.0.0.1, `/api` answered locally, a
  fake key) checked the old-deployment paths: a Phase 3 set door that ignores `production` gave
  exit 1 `no-production` ("Saved the graphics to the library, but ... made no production"), the
  graphic links in `--json`, and the operation forgotten; a 404 gave `no-production` "Not saved"
  with one request and no fall-back to the single door, a single graphic included; the 403 was
  shown verbatim after one request. `--layer 30` sent `[30, 31, 32]`, and every record carried
  `origin.item`.
- Not done: Docker was not started and no hosted key was read, so the backend half rests on the CI
  run above, not on noacg.studio or staging; the published-CLI walk is Phase 5's.
- Minor, for Phase 5: `noacg --help` does not list `--production`, `--rundown` or `--layer` on
  `save`; the human `no-production` message names no graphic links (only `--json` has them); the
  consent card's title still reads "to save to your library?" when it also offers productions.

### Phase 5 (build), 2026-10-16

Last check's findings (Phase 4 check, PASS): Post-landing green on `5b6f8734a` (0094's self-check
ran on production and staging; advisors 176/176 in the baseline); configured run 38821495103 ran
101 of 101, including the CLI production save with kill, resume and replay, cloud readback, a fresh
browser and install-after-recovery reuse. Small follow-ups for this phase, all taken here: `noacg
--help` did not list the production flags on `save`; the human-readable `no-production` message gave
no graphic links (only `--json` did), which a review of #1277 flagged against AC-6's "returns all
exact links"; the consent card's title said "to save to your library?" when it also offered
productions. Left by earlier phases: the Downloads prompt alone lacked the ambiguous-write and
pending-package wording, the published 0.11.0 had no docs topic for the skill, the skill, MCP
descriptions and CHANGELOG did not mention receipts, `noacg status`, set delivery or
`--production`, and the skill's default ending was to switch to one `noacg save a b c
[--production ...]` once the reviewed CLI is published.

Landed:
- **The release, @noacg/cli 0.12.0.** `cli/package.json` 0.12.0 with its CHANGELOG section (set
  delivery and resume, a production in the same save, receipts, account identity and `noacg
  status`, "Don't allow" ending login, item identity at Install, `docs skill`, the help and
  `no-production` fixes, and the `coverage` and `record` verbs that landed since 0.11.0);
  `build-skill.mjs` stamped both plugins' manifests, the marketplace, `server.json` and the skill's
  pins. Landing this pull request is the release request: `release-cli.yml` publishes on the push to
  `main` (owner, 2026-10-08), so no pin moves in a second pull request. The Downloads and docs prompt
  reads its pin from `cli/package.json`, so it says 0.12.0 from the same landing.
- **The skill's ending** (`cli/skill/noacg-graphic/SKILL.md`, step 5 and two new sections): one
  `noacg save a b c`, with `--production "<name>" [--rundown] [--layer]` only when the user asks for
  a production, and how to report each answer: confirmed by readback (the only "delivered"), the 403
  of a key made without the production line (ask: log in again, or library-only), `no-production`
  (report what was saved), unconfirmed (run the same command again, then report the operation id;
  `noacg status` reads it back), a 401 (log in again), any other error. `pack --save` is the older
  route, reported as pending Install. The final report keeps saved, pending and warnings apart and
  says "saved", not "opened".
- **One prompt carries it without the plugin.** `noacg docs skill` prints SKILL.md without its front
  matter, under one line saying each `references/<name>.md` it names prints as `noacg docs <name>`
  (setup, critique and share included, unlisted), and the Downloads and docs prompt (77 words) says "read docs skill and follow it" and
  "anything still pending or unconfirmed". A plugin-less session now reads the skill's own text, so
  the ambiguous-write and pending-package rules are no longer the plugin's alone.
- **The three Phase 4 follow-ups.** `noacg --help` shows `--production N [--rundown <cues.json>]
  [--layer n[,n...]]` on `save` (smoke test). A not-done outcome that saved graphics (an old
  deployment's `no-production`, a replay with deletions) prints every saved graphic's link after the
  honest sentence (unit test). The consent title asks to "save graphics and productions to your
  NoaCG account" when the card offers `productions:create`, and "save graphics to your NoaCG
  library" otherwise (asserted in the configured journey).
- **Docs and MCP agree with 0.12.0.** docs/AGENT_CLI.md (`docs`, `login`, `status`, `save` rows),
  `docs.html` (the key's reach; one save, a production in it, the same command again; the package as
  the older route), `references/package.md`; the MCP tool says "deliver to the library
  (+production)" and names `docs "skill"` as the procedure, within its 3,400-character ceiling.

The final journey, `e2e/configured/agent-access.spec.ts`'s third test, runs in both configured
workflows (`minTests` 98): a HOME, config dir and npm cache with nothing NoaCG in them, no inherited
`NOACG_*` variable, and the CLI reached only through `npx -y @noacg/cli@<pin>`; before npm has the
pin, the same walk runs this checkout packed as a tarball (`npm pack` of a fresh `dist`), through `npx
--package`. The run's annotation names which. A new account is made for the run and deleted after
it with everything it owns. It walks `--version` = the pin, `doctor`, `docs skill`, `whoami` not
logged in; `login --no-browser` answered "Don't allow" (exit 1, nothing stored) and then Allow on a
card naming both lines and the new account; a novel, sanitized brief (a harbour regatta: name strap,
start countdown, results ticker) scaffolded and validated with screenshots, the onair and stress
frames kept with the run's results; one `save --production --rundown --layer 10` killed once it
named its operation, resumed under it and replayed (same ids, same production); `status <operation>`
verified, with three graphics and the production `saved` in the new account; a fresh browser signed
in as the new account opening every graphic link and the production with its three cues in order;
another account opening a graphic link told "Graphic not found ... You are signed in as <other>"
with the graphic's name nowhere on the page; the same graphics' `pack --save` reading back
`pending_install` and Install warning "Already delivered as"; `logout` leaving `whoami` logged out.

Decisions:
- One pull request carries code, docs and the version bump, because the repository's release is the
  bump landing; the pins derive from `cli/package.json` and move with it.
- `docs skill` rather than a longer prompt: the prompt stays under 80 words and the rules live in
  one place. The reference list `TOPICS` in `cli/src/commands/docs.ts` is unchanged, because the
  harness bench (`benchmarks/harness/lib/skill-pin.mjs`) reads it as a list of reference files;
  `skill` sits beside it.
- No `status` verb in the MCP tool: its `save` answer already carries the receipt read back, the
  same call resumes, and the schema is at its ceiling.
- The checkout's tarball stands in only for an unreleased pin (newer than npm's `latest`); npm must
  answer, and a run dispatched on `main` fails unless it ran the package from npm, so that run is
  the published-path evidence and a tarball can never pass for it (a review finding on #1278).
- The journey's account comes from the admin API, as the sign-up test's does; the sign-up form
  itself stays covered by `anonymous.spec.ts`. The browser is the runner's Chromium named through
  `NOACG_BROWSER`, which the setup notes allow, because the CLI bundles none.
- Failed loading is not repeated in the third test: the first test's step 4b injects a failed
  waiting-list load and recovers with Retry on every run.

Open, not closed by this build:
- AC-6 to AC-11 stay open in work.json (no review recorded) until the Phase 5 check confirms them on
  the published version. AC-10's end-to-end evidence is a configured run on `main` after npm serves
  0.12.0, whose annotation must say `npm @noacg/cli@0.12.0`.
- No run against hosted noacg.studio with a real new account was made: none was available in this
  window. It is open, not passed. The hosted-latency workflow runs the same third test against
  staging on its schedule.
- A person has not looked at the walk's kept frames; they are in the run's test results.

Rollback: revert the pull request. If 0.12.0 is published and its path fails, deprecate it on npm
and release the last verified behaviour as a new version (npm never reuses a version), so the
prompt's pin moves with it. The release changes no user data.

Next phase must allow for (the Phase 5 check):
- Confirm npm serves `@noacg/cli@0.12.0` as `latest` with provenance, and the MCP Registry record,
  then dispatch the configured suite on `main` so the third test runs the published package.
- The harness bench's exam (another plan) pins the skill and CLI version it tuned on; 0.12.0 and the
  new SKILL.md are refused there by name ("the CLI is v0.12.0 where that skill's commands pin
  v0.11.0"), which is that plan's designed answer, not a defect here.
