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
