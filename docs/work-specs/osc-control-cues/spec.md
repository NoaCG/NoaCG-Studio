# OSC control cues - fire a lighting desk or show controller from the rundown

## Problem and authority

An operator running a production wants one Take to start a graphic and send a cue to an external
device, for example "winner graphic on air and the lights blink". Today the rundown can air
graphics and CasparCG or vMix files only; a lighting desk, show controller or any other device that
listens for OSC (Open Sound Control) needs a second operator or a second program.

Authority: the owner's planning request and decisions of 2026-11-19 and 2026-11-20 in the session
that wrote this spec, after three independent second opinions (Fable, Gemini, Astra) were folded
in. The owner approved the revised plan on 2026-11-20 ("Let's start the work. I approve the plan").

## Owner requirements (2026-11-19 / 2026-11-20)

- An OSC cue is a standalone rundown cue, added with the + button, named, configured, selected and
  taken. It is not a graphic, video or asset. It can be added, edited, duplicated, reordered and
  saved in the rundown.
- Take sends the message once. Taking it again sends it again. Selecting, editing, preview,
  publishing, preparing, reload and sync never send. No on-air layer, no Out.
- An exact OSC address with correctly encoded, typed arguments, never a plain text UDP string.
  Example commands from the owner's desk (ZerOS, UDP 8830): `/zeros/playback/go/0`,
  `/zeros/cue/go/0/5`, `/zeros/cue/go` with string arguments `"0"` and `"5"`. Examples, not
  hardcoded commands.
- OSC over UDP first. Works alongside CasparCG but does not depend on it, and works with browser
  output. No new service and no second control system.
- Destinations are saved per production, not per account.
- Graphics and OSC cues fire together from one folder Take: this is the main use case.
- Companion and Stream Deck reuse the existing integration: select then Take, and fire one
  specific cue directly, through the same path as the operator's Take.
- If the destination is unavailable, the operator gets a meaningful reason, and nothing replays
  the command later.
- Public internet destinations are refused by default (owner, 2026-11-20, following the review).
- V1 argument types: string, int32, float32. True/false waits. A Send test button is in V1.

## Derived decisions (this spec's, revertible)

- **D1. NoaCG Bridge sends OSC.** The operator page calls a new authenticated, feature-gated
  `POST /osc` on the paired Bridge, which encodes the packet and sends one UDP datagram. Not
  CasparCG (its OSC reports server state), not the graphic command log, not `/output` (a browser
  cannot send UDP, and several output pages would each send). The Bridge transports the command;
  the cue's meaning stays on the page.
- **D2. The cue model.** `ShowCue.source: 'control'`, `sourceId: ''`, and an inline
  `control: { v: 1, kind: 'osc', destinationId, address, args: [{ type, value }] }`. A control
  record whose `v` this build cannot read makes the cue read-only. Destinations are
  `Show.oscDestinations: [{ id, name, host, port }]`, merged item by item by team sync. A cue whose
  destination is gone keeps its settings, names the missing device and refuses Take; it never
  falls back to another destination.
- **D3. One cue-kind reader.** `cueKind(cue)` returns `graphic`, `server` or `control`. No code
  compares `cue.source` itself, because most of the code read "not a server cue" as "a graphic".
  A Node test fails on a raw comparison.
- **D4. Rollout in two steps.** Release 1 teaches the build to read, keep, copy, undo and merge a
  control cue and to treat it as neither graphic nor server; nothing can create one. Release 2
  adds the + entry, the editor, the Bridge route and sending. A stale tab of release 1 or older
  meeting an OSC cue sends nothing and refuses rather than misreading it.
- **D5. Bridge reach.** The page reaches the Bridge for OSC only when the production has an OSC
  cue and this browser is already paired with a Bridge. An unpaired browser makes zero loopback
  requests and shows "Connect NoaCG Bridge" as the reason Take is refused. This narrows, and does
  not replace, the 2026-10-07 rule in `src/control/playoutStatus.ts` `relevantPlayout`.
- **D6. Bridge safety.** Loopback listener, token and origin checks as today. Destinations: IPv4
  unicast in loopback, private (10/8, 172.16/12, 192.168/16), link-local and CGNAT/VPN
  (100.64/10) ranges; localhost. Public unicast only when the Bridge is started with an explicit
  local flag. Broadcast, multicast and `0.0.0.0` always refused, and the socket's broadcast option
  stays off. Host names resolved once and the numeric address checked and used. Port 1 to 65535.
  Encoded packet at most 1 KB, at most 16 arguments. About 10 sends per second with bursts of 20;
  excess is refused at once. The Bridge sends within 500 ms of receipt or refuses and never sends.
- **D7. Exactly once per deliberate press.** Each press carries one identity (Companion's
  `press_id`, or one minted by the page for a key or click); each OSC member of a folder Take gets
  `<press>:<cueId>`. The Bridge reserves the id before any asynchronous step and answers a repeat
  with the first outcome without sending. Nothing resends automatically: a timeout after possible
  dispatch reads "Send uncertain. Check the desk." Held keys fire once.
- **D8. Folders.** All together and One by one take OSC cues; Play through refuses them with its
  own sentence. A fault known before dispatch refuses the whole folder Take and names the cue.
  OSC sends start in the same phase as the graphics, without waiting for the cloud; several OSC
  members to one desk go in rundown order. Out and All out stop OSC that has not started and send
  nothing to undo what was sent. OSC cues do not count in a folder's on-air tally. A One by one
  folder keeps its step for the tab across a reload, so a reload never resends an earlier step.
- **D9. What "Sent" means.** The Bridge handed the datagram to the network. UDP has no receipt, so
  a switched-off desk can still read "Sent"; the help says so. The row shows Sent, Not sent with a
  reason, or Send uncertain, with the time. The action log keeps cue, destination, time and
  outcome. Before first publish the rehearsal banner says OSC cues fire real hardware.

## Behaviour

### AC-1: A graphic and a lighting cue fire together from one folder Take

An All together folder holds a graphic cue and an OSC cue. With browser output and CasparCG and
vMix stopped, one Take puts the graphic on air and the paired Bridge sends exactly one datagram.
The folder reads ON AIR, and the note reads like "1 graphic on air, 1 OSC sent".
Layer: journey in an existing production-page E2E file with a fake Bridge and a real UDP listener.

### AC-2: An OSC cue is authored and kept like any cue

Add from +, name, choose or create a production destination, set address and typed arguments.
Duplicate, reorder, copy and paste, undo and redo, save and reopen keep it. Two team editors
changing cues and destinations at once merge item by item; a deleted destination leaves the cue
naming the missing device. Layer: Node tests over `shows.ts`, `cueClipboard.ts`,
`rundownHistory.ts`, `teamShowMerge.ts`; one E2E journey for the editor.

### AC-3: Every deliberate Take sends once, and nothing else sends

Take button, Take key, held Take key, direct cue shortcut, Play now, Take Now, Companion take,
take_cue and trigger_cue each send one datagram per press. Select, edit, preview, prepare,
publish, sync, reload, Out and All out send none. In Preview then Take the first press previews
and sends none, the second sends one. Timed graphics and server sequences skip OSC rows and still
find the right next graphic. Layer: Node tests over `verbDispatch.ts`, `cueAuto.ts`; E2E counts at
the listener.

### AC-4: The encoder writes correct OSC bytes

Zero arguments, string padding, int32 and float32 big-endian, `/zeros/cue/go "0" "5"` distinct
from two int32s, invalid addresses, out-of-range or non-finite numbers and the encoded size limit.
Layer: Node test with byte vectors.

### AC-5: The Bridge sends safely and at most once per send id

Token and origin required; `osc` advertised in `/health` features; destination rules of D6;
rate, size and deadline limits; repeated send id answered without a second datagram; Bridge
restart and lost reply never resend. Layer: Bridge Node tests with a real UDP listener.

### AC-6: A browser-only production reaches the Bridge only when paired

Opening or syncing a production with OSC cues in an unpaired browser makes zero loopback requests;
Take is refused with "Connect NoaCG Bridge". Paired, the status reads "Bridge ready" without any
CasparCG or vMix setup. An old Bridge without `osc` is named as too old. Layer: Node test over
`playoutStatus.ts`; E2E request count.

### AC-7: Folders treat OSC cues as one-shot members

All together and One by one as D8; Play through refuses; a broken OSC member refuses the whole
Take before anything is sent; Out mid-run skips unsent OSC; One by one survives a reload without
resending. Layer: Node tests over `folderPlayout.ts`, `serverPlayout.ts`, `folderAir.ts`,
`folderStep.ts`.

### AC-8: Companion fires OSC cues through the page's own path

Existing actions only, no new verb. A retried press with the same `press_id` sends once; a second
physical press sends again. A refusal carries its reason (Bridge not connected, invalid cue,
missing destination). With no page open, presses are refused as today. Layer: Node tests over
`panelRelay.ts` and `panelFeedback.ts`.

### AC-9: The operator can see what happened

Row status and action log as D9, a Send test button in the editor, and the rehearsal banner
wording. Layer: E2E journey.

### AC-10: Older builds and unknown versions fail safe

A release 1 build opening an OSC production treats the cue as neither graphic nor server, sends
nothing, and keeps the control record byte for byte through sync, copy and undo. An unknown
control `v` is read-only. Layer: Node tests; a raw `cue.source` comparison check.

### AC-11: The owner's desk reacts

On the owner's ZerOS desk over UDP 8830, the three example commands change the lights, from a
standalone cue and from an All together folder with a graphic. The gap between the lights and the
first visible graphic frame is recorded across repeated published Takes. Timing acceptance stays
open until measured. Layer: owner hardware check.

## Preserved behaviour

- Graphic cues, server cues, folders, Companion verbs and the command log behave as before.
- An unpaired browser on a production without OSC cues still never contacts a Bridge.
- No new Companion verb and no change to the panel SQL whitelist.
- Phone and hosted control do not fire OSC cues; they list them as not available there.

## Non-goals (V1)

Per-cue delay, Trigger on next, OSC bundles, TCP (SLIP), timed OSC auto-advance, reading OSC
replies, true/false arguments, IPv6 destinations, HTTP or MIDI control cues, firing with no
operator page open.

## Phase notes

Phases: 1 model safety (`cueKind`, keep unknown fields, rollout release 1); 2 Bridge `/osc`,
encoder, limits, send id; 3 page send operation on every Take path, repeat guard, Bridge gate;
4 UI (+ entry, editor, destinations, Send test, status); 5 folders; 6 Companion refusals and
wording; 7 owner desk check.

Phase 1 (release 1, model safety), notes for the phases after it:

- `src/model/controlCue.ts` is the one reader: `cueKind`, `isGraphicCue`, `isServerCue`,
  `isControlCue`, `readControl`, `controlReadOnly`. `scripts/control-cue.test.mjs` fails on a raw
  `cue.source` comparison anywhere in `src/`.
- Until phase 3, a control cue's Take, direct Play now, One by one step and any All together
  folder holding one are refused with `OSC_NOT_YET` before anything is sent
  (`takeBlockers.ts`, `graphicVerbs.ts` `take`, `serverPlayout.ts` `togetherPlan`). Phase 3 and 5
  replace those refusals with the send; they are the exact places to change.
- `panelFeedback.ts` still reports a control cue to Companion as `source: 'graphic'`. Phase 6
  decides the panel wording; it is harmless now because a control cue is never on air.
- The undo snapshot (`rundownHistory.ts` `RundownSlice`) holds cues, folders, graphics and playout
  items, not `oscDestinations`. Phase 4 decides whether destination edits join undo.
- The rehearsal banner (`ProductionPage.tsx` `rehearsing`) does not yet mention OSC; phase 4.
- The write gate `controlFrozen`, added after review of the phase 1 pull request, sits at the same
  doors as `typedFrozen`: a control cue of a later version is read-only in every byte and cannot be
  removed; no write may change a message or add a new one, except a copy of a message the record
  already holds and an undo. Phase 4's editor passes its own cue in `write`. A paste from another
  production is therefore refused until then, as typed data is.
- A test fixture in `scripts/folder-playout.test.mjs` wrote `source: 'graphic'`, a value no
  `ShowCue` can hold. Under `cueKind` an unknown source is a control cue, so the fixture now omits
  `source` as a real graphic cue does; the assertion is unchanged.

Phase 2 (NoaCG Bridge sends OSC), notes for the phases after it:

- `POST /osc` takes `{ sendId, host, port, address, args }` and answers `{ sent: { to, bytes } }`,
  with `repeat: true` when the send id was seen in the last minute (`cli/src/playout/osc.ts`,
  wire types `OscRequestWire` in both protocol files). It needs a token but no target and no
  adapter, so a browser-only production can use it. The page must check the `osc` feature on
  `/health` and name an old Bridge as too old.
- Error codes the page will meet: `usage` (HTTP 400, a bad message: show the Bridge's sentence on
  the cue), `refused` (destination rule or the rate bucket), `unreachable` (name not found, too
  slow, or the socket failed). A page timeout after the request left is the page's own
  "Send uncertain. Check the desk."; the page must never resend, and the send id makes a resend
  harmless anyway.
- Destinations ending in `.255` are refused as broadcast addresses even on networks wider than a
  /24. Revisit only if an owner's device really lives on such an address.
- The Bridge changelog entry stays under `## Unreleased` until phase 4 ships the rundown side;
  moving `bridgeVersion` is the release.
- Seven `cli/test/state.test.mjs` tests are cancelled on this cloud machine on unchanged `main`
  too ("Promise resolution is still pending"); not related to OSC.

Phase 3 (Take sends OSC), notes for the phases after it:

- Every single-cue Take path reaches one send: the Take button and key, Take Now and Companion
  `take`/`take_cue` through `graphicVerbs.take`, and Play now / Companion `trigger_cue` through the
  page's `trigger` branch; both call the page's `controlSend` (`ProductionPage.tsx`), which reads the
  cue as saved at the press, builds the request with `control/oscSend.ts` and calls `sendOsc`
  (`control/playoutLink.ts`). A held Take key fires once (`verbDispatch.ts`).
- The send id is minted per press by the page (`sendIds`). A Companion press is already run once
  per `press_id` by `panelRelay.ts` before it reaches `onVerb`, so the page id is enough; the Bridge
  answers a repeated id without sending.
- Take refusals: `takeBlockerFor` and `directBlocker` ask the page's `controlBlocker`
  (`oscBlocker`): unreadable record, missing destination, no address, or no Bridge pairing. The
  pairing check reads local settings only, so an unpaired browser makes no loopback request.
  `stepBlocker` and `togetherPlan` still refuse with `OSC_NOT_YET` until phase 5. Companion's
  `take_cue` and the panel's per-cue key state judge an OSC cue by `directBlocker`, not
  `stepBlocker` (`verbDispatch.ts`, `ProductionPage.tsx` `ownTakeRefusal`), so a refused press
  says why instead of being dropped.
- Not done here, for phase 4: the status control still reads CasparCG-only (`playoutStatus.ts`
  `relevantPlayout`); a browser-only production learns of an absent or old Bridge only when it
  sends. Phase 4 adds the "Bridge ready" status for productions with OSC cues and a paired browser,
  the rehearsal wording, and the e2e journey (create, edit, Take, Send test).

Phase 4 (authoring), notes for the phases after it:

- + Add has "OSC cue" (`CueRundown.tsx`); `addOscCue` makes it after the selected cue, sending to
  the production's first destination. `home/OscCueEditor.tsx` edits the name, destination
  (choose, New, Edit, Remove), address and arguments through `setCueControl`,
  `saveOscDestination` and `removeOscDestination` (`model/shows.ts`); its text boxes are deferred,
  so typing never writes per keystroke and never sends. Send test sends the stored cue once through
  the page's `controlSend`, as Take does.
- The write gate's `controlWrite` allowance is now passed by `addOscCue` and `setCueControl`
  (`patchShowChecked`'s last argument). Destination edits are not part of undo, as playout settings
  are not; a deleted destination leaves its cues naming the missing device.
- Departure from D5's wording, recorded: "Bridge ready" is shown in the OSC cue editor
  (`oscBridgeState`), not in the page's status control, which stays CasparCG/vMix-only. It answers
  the operator where the cue is set up, and keeps the page-wide Bridge poll (and its local-network
  prompt) off productions whose browser is not paired.
- The rehearsal line ("Graphics play on this page until you publish. OSC cues send to the device
  now.") sits in the OSC editor before the first publish.
- The rundown row of an OSC cue wears the `control` tone and reads `<destination>  <address>  <args>`
  (`oscRowSummary`). It never shows ON AIR.
- `e2e/playout-folders.spec.ts` holds the journey (+ Add, destination, address, arguments, Take,
  Send test, reload) against `e2e/_fakeBridge.ts`, which now answers `/osc` and records each
  request in `fake.osc`.

Phase 5 (folders), notes for the phases after it:

- All together: `togetherPlan` collects OSC cues as `controls`; one whose `controlBlockerOf`
  (`oscBlocker`) refuses stops the whole Take before anything is sent, naming it. `runTogether`
  sends the server cues first as before, then the graphics and the OSC cues in the same phase: the
  OSC cues one after another in rundown order, without waiting for the graphics' cloud answer. An
  OSC send is never taken back after Out or All out; one not yet sent when Out comes is skipped.
  `togetherNote` counts it apart: "1 of 1 on air, 1 of 1 OSC sent".
- The folder's own Take check (`takeBlocker` for a folder in `serverPlayout.ts`) now carries
  `controlBlockerOf` too, so the TAKE button and the panel judge an OSC member the same way.
- One by one: a step onto an OSC cue sends it through the cue's own Take and takes nothing off
  (`StepMember.control`), so the graphic it goes with stays up. Decided here: a lights cue in a
  run of graphics is a side effect, not a replacement.
- A One-by-one folder that holds an OSC cue keeps its step for the tab in session storage, wherever
  the step stands (`spx-gfx-osc-steps:<production>`, `io.oscSteps`), and it is put back after a
  reload, so the next press goes on instead of sending an earlier OSC cue again. Folders without an
  OSC cue read their step off the air as before.
- `oscBlocker` now also checks the message as the Bridge's encoder will (`oscMessageProblem` in
  `model/controlCue.ts`: address, values, 16 arguments, 1024 bytes), so an All together folder
  never sends its graphics and then fails on a badly typed OSC cue.
- Play through still refuses OSC cues ("is an OSC cue").
- `e2e/playout-folders.spec.ts`: the AC-1 journey (a graphic and an OSC cue in an All together
  folder, browser output, one Take, one datagram, nothing to a playout server).

Phase 6 (Companion), notes:

- `rundownPanelRows` sends an OSC cue as a cue row with `source: null`, which every Companion
  module version already reads (an unknown source reads as none), so no panel calls it a graphic or
  a file and the module needs no release. `take_cue`, `trigger_cue` and the per-cue refusals were
  done in phase 3: a refused press puts its reason on the note line.
- Still open, an owner decision: releasing NoaCG Bridge (moving `bridgeVersion` in
  `cli/package.json`) publishes everything under the changelog's `## Unreleased`, which now also
  holds the audio reader work. Until that release, an operator's Bridge cannot send OSC.
- Phase 7 (owner hardware, AC-11) waits on that release.
