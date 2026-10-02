# Hardware panel control - run a live show from a Stream Deck through Companion

## Problem and authority

An operator's hands are on hardware, but today a Stream Deck reaches NoaCG only as a keyboard: the
browser window must have focus, the playout column must be on screen, and the keys show nothing
back (`docs/PLAYOUT_DASHBOARD.md` §2). A key that lights red while its cue is on air and counts a
clip down, flashing at 10 s and 5 s, is what lets the operator watch the program instead of the
laptop.

Authority: the owner's decisions of 2026-10-01 on `docs/HARDWARE_CONTROL_RESEARCH.md` §11 (the
suggestion on every question), recorded in `docs/backlog/companion-and-stream-deck.md`
("Decided"), and the build prompt of 2026-10-02. The research's §10 is the design sketch, §6 the
measurements this build is held to. `protocol.md` beside this file is the wire protocol.

## Owner requirements (2026-10-01, not reopened)

- A NoaCG Companion module relays each press through the NoaCG cloud to the open operator page,
  which runs it through `onVerb` exactly like a key press. The keyboard route stays. No Bridge
  relay, no WebHID, and the module never writes the command log.
- A panel key per production, made by pairing: the page shows a one-time code (a few minutes,
  single use) and the module exchanges it for a secret kept in Companion's secret-text field. The
  key can only ask an open page to run named verbs and read the feedback that page publishes. It
  never writes the log and never reaches Bridge or AMCP.
- Anyone who can operate the production may pair. Keys never expire; the page lists and revokes
  them.
- No page open: presses are refused, the keys show "no operator page", nothing is queued.
- An explicit "Answer the panel on this page" switch on the production page and the hosted control
  page. The last page to switch it on wins.
- The module is published in Bitfocus's repository under MIT.
- Key feedback: on air, the selected cue, clip time left with the 10 s and 5 s warnings, which
  verbs are allowed. Setup suits a non-technical user. Press to air through the relay must not be
  slower than the measured p50 192 ms (keyboard 133 ms).

## Derived decisions (this spec's, revertible)

Each is recorded with its reason in `protocol.md`; the owner can overturn any of them without
reopening the requirements above.

- **D1. Topic tokens are the Realtime capability.** A panel key is not a JWT, so it cannot be
  checked by a Realtime policy. Each production gets two random 128-bit topic tokens: presses
  arrive on `pnp-<token>`, which only the database writes and only pages learn (through the
  control slug); feedback rides `pfb-<token>`, which the answering page writes and paired panels
  read. A panel learns the feedback token only by presenting a valid key, and revoking any key
  rotates it. Every module-to-page message goes through an RPC that checks the key.
- **D2. Exactly one page runs a press, enforced by the server.** Switching the answer on takes a
  numbered claim from the server; the relay stamps every press with the current claim, and a page
  runs only presses carrying its own. A newer claim is announced to the other pages on the press
  topic, and they switch off.
- **D3. A press is refused at the server when no page holds the claim**, and refused by the module
  when no page has been heard for 12 s. Broadcasts are never stored, so nothing can queue.
- **D4. `take-cue` airs that cue whatever the SPACE mode, and takes it off when pressed while that
  cue is on air.** A per-cue key is a toggle, the H2R and SPX habit on a deck; it never only
  previews. `select-cue` moves the selection and airs nothing.
- **D5. Panels may press** `take`, `retake`, `update`, `next`, `out`, `select-prev`,
  `select-next`, `pause`, `resume`, `pause-toggle`, `all-out`, `select-cue`, `take-cue`. The rundown
  editing verbs and `folder-*` stay keyboard-only (no editing from hardware, research §10.2).
- **D6. Pairing needs a published production**, since the control slug is the capability the
  pairing, listing and revoking calls take. Before publish the panel section says so.
- **D7. The module lives in `companion-module/`** with its own `package.json`, outside the app's
  lint, typecheck and build, and is copied into Bitfocus's repository when submitted.

## Preserved behaviour

- The keyboard verbs, the SPACE modes and the exported controller are unchanged.
- A page with the switch off makes no new subscription and publishes nothing; a production that
  never pairs a panel behaves exactly as before.
- Every Take the page sends still carries its own Step 2 sender protocol (`control_send_seq`), so
  the server's duplicate and stale refusals apply to relayed presses unchanged.
- No new path reaches Bridge, AMCP or the command log. The control slug never leaves the page.

## Non-goals

- Running any verb with no page open, or a server-side verb engine (research §3c-direct).
- Talking to Bridge, CasparCG, OBS or vMix from the module; player actions stay with those
  players' own Companion modules.
- Editing cue values or data from hardware; rundown editing verbs from hardware.
- An Elgato Stream Deck app plugin, WebHID, or a Bridge relay.
- Expiring keys, per-key verb scopes, or per-person accounts in the module.

## Acceptance

### AC-1: A panel pairs with a one-time code and is listed on the page

On a published production, the panel section on the production page and on the hosted control page
shows a code of 8 letters and digits that lives 5 minutes. Entering it in the module's connection
settings pairs the panel: the module stores the key in a secret-text field, the code field clears,
and within 5 s the page lists the panel with its name, when it was paired and when it was last
used. The same code used a second time, or after 5 minutes, is refused with a sentence that says
which. Scenario: a configured spec pairs through the RPCs; the module's fake-relay test covers the
config flow; the isolated Companion run pairs for real.

### AC-2: Revoking a panel stops it at once and leaves the others working

Revoking a listed panel removes it from the list; that module's next press is refused, its keys
show "Panel key revoked" and it stops receiving feedback within 15 s, while a second paired panel
keeps pressing and receiving feedback. Scenario: configured spec with two keys.

### AC-3: Every panel verb runs through the answering page's own dispatcher

Each verb in D5, pressed through the relay, does on the answering page exactly what the same key or
button does there: a greyed button refuses the press, a Take sends one `control_send_seq` with the
page's sender protocol and reaches the output. The hosted control page refuses the verbs it has no
use for with "not on this page". Scenario: configured spec pressing through the RPC; module test
for the action-to-message mapping.

### AC-4: Duplicate and stale presses are refused, never aired twice

A press id the page has already handled is answered `duplicate` and runs nothing. A press whose
target no longer matches what the verb would act on (the selection moved, the cue already came
off), or a toggle whose direction changed since the state the key was drawn from, is refused
`stale`; the key flashes and the page's activity line names the panel and the reason. Scenario:
configured spec sending the same id twice and a press with an old target, reading the command log.

### AC-5: With no answering page, presses are refused and nothing queues

With no page answering, a press is refused (by the server when no claim is held, by the module
when no page has been heard for 12 s) and every NoaCG key shows "No operator page". A page that
switches the answer on afterwards runs none of the earlier presses. Scenario: configured spec and
module test.

### AC-6: Exactly one page answers, and the last one switched on wins

Switching "Answer the panel on this page" on in a second page (production page or hosted control
page, any machine) switches the first off within 2 s; the first says which page now answers; only
the second runs presses. Closing the answering tab releases the claim when the browser allows it,
and otherwise the module still shows "No operator page" after 12 s. Scenario: configured spec with
two pages.

### AC-7: The keys show on air, selected, allowed verbs and the clip clock with its warnings

The module's boolean feedbacks follow the answering page: a cue key is on air and selected exactly
when the page shows it; a verb key is allowed exactly when the page's own button is enabled; the
clip clock key counts the remaining time down in the module from one message, turns to the warning
at 10 s and the final style at 5 s, and stops on pause. A page state change reaches the module at
p50 under 100 ms. Scenario: configured spec reading the published state; module test with a fake
relay and a fake clock; the latency measured and recorded.

### AC-8: Press to air is no slower than the measured relay

Press to first frame on the output through a Companion button, the module and the relay, 10 presses
on a preview branch from this laptop: p50 at or under 192 ms. Keyboard measured in the same run for
reference. Scenario: research §6.1 method, recorded in `evidence/`.

### AC-9: The module is complete, tested and self-contained

`companion-module/` builds with Bitfocus's module tools against companion-module-base 2.x, outside
the app's lint, typecheck and build. It has actions for every verb in D5, the boolean feedbacks
(on air, selected, verb allowed, warning, final, no page), variables (production, selected cue,
on-air cues, clip name and time left, answering page, connection), presets built from the
production's rows plus the transport keys, `HELP.md`, an MIT licence, and tests that run against a
fake relay. Scenario: `npm test` and `npm run build` in that folder.

### AC-10: A panel key can do nothing beyond its scope

With a valid key, the RPCs refuse a verb outside D5, a malformed press, and more than 20 presses in
2 s. The key cannot read the control slug or the show id, write the command log, or join the press
topic as a writer; no client can broadcast on a `pnp-` topic. The migration's self-checks call each
RPC; a configured spec proves a revoked key and a wrong key are refused. Scenario: configured spec
and the migration self-checks on a preview branch.

### AC-11: Setup suits a non-technical operator

From an installed Companion, pairing and a working Take key take: add the NoaCG connection, type
the code, drag a preset. The module's `HELP.md` and a short operator page in the app's docs walk
it in plain words. Scenario: the isolated Companion run, timed and recorded.

### AC-12: It works with CasparCG, OBS and vMix

One relayed Take and Out each on CasparCG, OBS and vMix through the real module, seen in each
player's own capture, with the owner's setups left as found (research §4). Scenario: recorded in
`evidence/`.

### AC-13: Nothing else changed

The keyboard route, the exported controller, and a page with the switch off behave as before; the
existing configured specs for hosted control, the command sequence and the playout keys pass.
Scenario: those specs in the landing runs.
