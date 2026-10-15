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

No implementation phases started. The baseline receipt preserves prior navigation evidence;
it does not mark this plan's implementation criteria complete. Builders append findings,
decisions, migrations/compatibility notes, rollback and downstream dependencies here.
