# V2 vMix setup and production output

V1 was independently verified on `4dab8e67af7d76d2e7f2cd180e36d14df9d151b4`
(PR #2291, receipt comment 6722265444). To revert V2 after landing, open a PR
with `git revert -m 1 <V2 merge SHA>` through the queue.

The owner approved a saved local Bridge address after an owned vMix 29 Trial
prototype. It read the exact random default title in XML, followed the
redirect to the original renderer, and saved its key and Overlay 8.
Reopening with the listener ready restored the original decoded Program
frame. Reopening with the listener down showed the underlying plate and
stayed there after Bridge startup. Explicit Browser Reload recovered the
same composite. Each run verified restoration of last.vmix and user.config.
The isolated prototype lives in C:/claude/Temp/vmix-state-1108.
V2 first reconciled with main at `361cb6f628df0a44d410954aae527cde976d1750`.
The Interaction reconciliation used `7c16e66a89942d7020d19004603d091a56e4f635`.
Main at `bb527e5f73006834ae4fdddd4942a94f2b274436` adds the review rules from PR #2348.
`d260583ea12b0564f3f63a35fde78dec23951fea` restores one configured spec from quarantine in
PR #2351. The final review base, `446ae235e7760273734f7d6ef10862ca85338f29`, adds the
cf02 evidence from PR #2352. These merges do not change the Bridge or Studio inputs.

V2 lets an operator pair, choose vMix and load or unload a published production's
Browser input on an overlay. Media controls and the media library belong to later
phases. vMix keeps control of Program, Preview and transitions.

## Rules

- Each AddInput gets a fresh, cryptographically random 128-bit hostname under
  .localhost on the same loopback listener and port as the Bridge. Its exact
  GET path carries the original output address. After an OK, the Bridge
  accepts only a new Browser with the exact marker title and a valid key
  that was neither listed before the command nor kept for another address.
  A lookalike, a concurrent foreign Browser, a no-op, an unacknowledged
  function, an incomplete XML or an ambiguous marker never establishes
  ownership. The Bridge sends each function once. Observation stays within
  the existing three-second cap and leaves time in the seven-second action
  budget for naming, overlay dispatch and readback. Malformed or duplicate
  input rows fail closed. Overlay rows must be complete, with only a numeric
  input reference or an explicit empty value. Load requires every available
  channel to be explicitly empty or resolved both before creating an input
  and just before Overlay In. Unload requires a resolved current channel.
  An omitted channel cannot confirm that the Browser went off air.
- The alias serves a redirect during its own AddInput attempt. An unsuccessful
  attempt loses the alias and can leave an unowned Browser in vMix. Explicit
  retry gets a fresh marker and cannot adopt that Browser. Before rename or
  Overlay In, the Bridge atomically commits the key and the redirect binding.
  A failed save sends neither function. An operator can remove the unowned
  Browser in vMix if an addition could not be confirmed.
- The only alias response is a non-cacheable redirect from an exact known
  hostname and GET path on the Bridge's port, from a loopback peer, without
  CORS or referrer. The decoded HTTP or HTTPS destination must match the
  digest authorized by the original output action, including the display
  name query value and the original Bridge HTTP port. URL credentials and
  other Bridge aliases are refused.
  The redirect passes navigation to the output page without fetching or
  proxying it. The URL carries no Bridge pairing token, and aliases cannot
  reach any control route.
- Every status, scoped state or action request shares the same turn for its
  vMix TCP port. The action keeps its turn through its final XML and channel
  command. A queued reading cannot interleave there. Deadlines start when
  the request arrives. A newly needed greeting fits the remaining budget.
  A shortened greeting timeout is a request timeout. Passive ACTS events
  still arrive normally. vMix can still change state in the native gap
  between its final XML and the unconditional channel command. Version and
  a nonblank edition are required before deriving overlay count.
- The key belongs to the vMix TCP port and the production address with its
  display name removed. A key missing from complete live XML is forgotten
  before Load makes another. The committed redirect stays valid for a
  saved preset even after that key has been forgotten. Reopening the old
  preset does not regain Bridge ownership. The preset's local URL carries
  the full address. The versioned store keeps
  the digests and keys. Updates across ports are serialized and replaced
  atomically. Missing storage starts empty. Corrupt or unsupported storage
  fails closed. One Bridge process owns the store for each local user.
- Start Bridge on the same port before reopening saved vMix presets. If
  Bridge starts late, explicitly reload the Browser input in vMix. Starting
  Bridge never changes or reloads an input or overlay.

- A new Browser gets the first available `NoaCG <title>` name with suffixes starting
  at `(2)` when taken. The Bridge excludes its own key when checking names. It updates
  an owned input's name on Load and when Unload finds it on the chosen overlay.
  Unload rechecks ownership immediately before Out and verifies that the channel
  leaves the key after its transition. If the production was renamed, the Bridge
  names its input after the verified Out. Empty and foreign overlays receive no
  function. Input-addressing functions use keys.
- A production row derives on-air ownership from the Bridge's XML reading and its
  own output address. The Bridge reports ownership on a scoped state request
  without returning the address or the persisted map. A Bridge that advertises
  vMix can report status. The studio requires the new Bridge capability before
  it sends a vMix output verb because an older vMix adapter acts by title.
- Load requires a current overlay read. A foreign input requires confirmation
  naming that input and channel. Cancel sends nothing. The action carries the
  observed input key (or an empty overlay) for the Bridge to check against fresh
  XML immediately before it puts the Browser on air. A settings change invalidates
  confirmation. vMix does not offer a conditional overlay
  command, so an operator action between XML and that command remains possible.
- The current saved production choice is checked at dispatch, including the old
  CasparCG Put on air button and first Publish. First Publish only loads vMix
  after an explicit vMix choice, and requires the same overlay check as Load.
- While this production is on an overlay, the panel shows the actual owned overlay
  even if Settings now chooses a different one. Unload addresses the actual
  overlay. After Unload, Load uses the configured channel. The Bridge refuses to
  put the same owned Browser on a second overlay. Polling after a switch
  or action starts with no prior reading. Load is a no-op when a fresh
  reading already shows this production on the chosen overlay.
- At the React route commit, the former production immediately loses authority
  to send a pending Bridge output action. The session store still disposes on its
  existing deferred schedule. vMix Load, Replace and Unload, production CasparCG
  Load and reload, Settings Put on air, native actions, and CasparCG Stop/Clear
  check the mounted session at dispatch. With vMix selected, CasparCG Stop/Clear
  is disabled. The shared Clear
  sender rechecks the saved choice and session after probing the Bridge. The same
  guard applies to native sends and the offline CasparCG output cleanup. CasparCG
  Out and Clear operate by slot, so cached browser ownership cannot authorize
  cleanup once vMix is selected. Existing cleanup stays available with CasparCG
  selected. V4 owns per-cue adapter routing.

## Before implementation

The V1 source still matches and takes off an input by title in
`cli/src/playout/adapters/vmix.ts`. It has no vMix routes in the studio request
layer. Slice 1 records the existing greeting, version and edition, status errors,
port and overlay-count checks.

An owned blank vMix 29.0.0.49 probe showed that a new Browser input for a loopback
URL is titled `Browser 127.0.0.1` in the XML, with no URL attribute. The vMix
process was stopped by its own PID and both `last.vmix` and `user.config`
restored and verified by SHA-256. The vMix background service stayed running.

The independent rules review returned AGREE WITH CORRECTIONS. The rules above
include its storage, delayed addition, overlay readback and dispatch corrections.
A separate real vMix probe showed a nonce in the default title and reached the
actual URL with BrowserNavigate after Chromium was ready. The saved preset still
held the original marker URL, so the Bridge adds the actual output URL directly.
Both probes restored the two configuration files and verified their SHA-256 hashes.

## Rules made explicit during implementation

- The vMix action repeats the capability check at dispatch and prefixes the paired
  token for that route. An older Bridge replacing the current one after `/health`
  rejects the marked token. The Bridge still requires the same paired secret, and
  the prefix is accepted only for vMix `/act` requests.
- Unload performs the channel's Out before renaming so the rename cannot delay
  removal or enlarge the interval between its final XML and the channel command.
  If the rename later fails, the result reports that warning and keeps the key.

## Local review and rule reassessment

The local Codex review reproduced a product defect in input ownership. A same-host
operator Browser arrived before the delayed AddInput Browser, and the first matching
reading was claimed. It also found that the configured overlay hid the actual live
Unload control, the old production page could send after navigation, and Stop/Clear
could still send a CasparCG clear with vMix selected. A fresh read-only rule review
confirmed the full observation window, strict recovery for unresolved additions, and
the overlay and dispatch rules above before the corrections were implemented.

### Independent review findings

The independent review rated commit 5e92b77af175318275b0e044b49efd05ef3d7644 B.
It reproduced the remaining AC-4 failure in the built adapter and fake. The
requested AddInput replied OK without creating an input. An operator added the
only observed Browser for the same hostname with another production address.
The Bridge named it and put it on Overlay 8. The three-second observation
window protects against multiple observed candidates but cannot establish
ownership in this case.

A bounded owned vMix 29.0.0.49 Trial probe compared three ways to add a Browser
on its actual fixture URL. Plain AddInput, AddInput with generic SelectedName,
Name, Title and Key query parameters, and a Browser Value with dimensions and
a trailing marker all fetched their exact loopback fixture address. Each
replied FUNCTION OK Completed. Each XML row had a generated key and the title
Browser 127.0.0.1, with neither the supplied marker nor the URL. Program and
Preview stayed at 1 and 2. The probe sent no overlay, rename or preset command.
It stopped only the owned process, restored and verified last.vmix and
user.config by SHA-256, and left vMixService running. The runnable probe and
log are in the local V2 runtime folder as addinput-attribution.mjs,
addinput-attribution.ps1 and addinput-attribution.log.
The [vMix TCP API](https://www.vmix.com/help29/TCPAPI.html) describes a generic
FUNCTION acknowledgement, and the [shortcut reference](https://www.vmix.com/help29/ShortcutFunctionReference.html)
documents Value as the AddInput parameter. The direct-address variants
provided no attribution mechanism. The owner subsequently approved the local
Bridge address after the separate saved-preset prototype. A fresh read-only
rules review agreed with corrections before implementation. The updated rules
cover the alias handoff, HTTP port binding and complete XML readback.

The implemented adapter reproduces the original fake failure without acquiring
the foreign key, renaming the foreign Browser or sending an overlay command.
Only the exact one-time marker identifies the new Browser. The store commits
the key and redirect digest together before rename or Overlay In. A dropped
reply, ambiguous readback or failed save revokes the temporary alias. The next
explicit Load cannot adopt an orphan from the earlier attempt.

The review also found a dispatch interval between React route teardown and
deferred session disposal. With timers paused, browser job j-4977 reproduced a
vMix /act after Home had replaced the old production. The layout-effect cleanup
now revokes the mounted production's dispatch authority before session disposal.
The session's deferred cleanup still tolerates StrictMode's extra effect cycle.

The next local Codex review found two product defects in the XML ownership
family. A malformed occupied row could be read as empty, and omitting another
channel could conceal an owned Browser already on air. Both failed in focused
fake reproductions. Fresh read-only rule reassessment required complete root
sections, valid unique input and overlay rows, and complete supported channel
coverage before Load and before Overlay In. The repaired cases preserve the
operator's input and send no Overlay In.

The exact-head independent review then reproduced a queued status or state
read between the final XML and the channel command. The before-patch Out
trace was XML, XML, XML, OverlayInput8Out, XML. The third XML let the Bridge
clear a newly placed foreign Image while reporting OK. It also found that a
missing edition let a Basic HD reading be treated as eight channels.
The fresh rule review confirmed the shared TCP turn and absolute deadline,
including the HTTP slot queue. The same two wire-order tests now pass with
XML, XML, the channel command, XML, XML and the foreign Image preserved.
The missing and blank edition cases authorize no function. A queued HTTP
action whose deadline elapsed sends no further XML or mixer command.

The same round found stale panel state after Load or a switch change. The
panel now drops its reading when polling restarts. Fresh state showing the
owned Browser already on the chosen overlay makes a second Load a no-op.
Browser job j-4993 removed only the remount guard and reproduced the stale
Load control. The maintained suite j-4992 passed with the guard.

The original direct-address implementation kept the renderer's first display
name when reusing a Browser on a different overlay. V2 keeps that saved address
stable, so the renderer's reported display name can still name its original
overlay. The outgoing Studio action and current overlay status use the actual
channel. NoaCG does not navigate or reload an existing mixer input to change
its display name. Broader routing stays with V4.

## Verification before landing

| Criterion | Evidence |
| --- | --- |
| AC-1 | Independently reran the Slice 1 fake-vMix checks at the V1 baseline, 21 passing, and again with V2, 38 passing. They exercise `/health`, the 29 and 28 and Basic HD channel counts, version and edition, refused and silent greetings, connection loss and ACTS lines. V2 also starts the built CLI with `--vmix-port` pointing at a separate fake TCP listener and reads vMix 28 through the Bridge. [Slice 1 evidence](slice-1.md). |
| AC-3 | Browser queue `j-4992` verified pairing, both setup diagnoses, Try again, all eight options, default 8, a choice of 3 surviving reload and Update with an older Bridge. The Settings screenshot was inspected. |
| AC-4 | The fake TCP and HTTP suite checks exact-marker ownership, the original no-op and sole foreign Browser, a concurrent unrelated addition, malformed or incomplete XML, unknown and modified alias requests, failed or dropped replies, explicit retry, store restart, stale keys, same-title names, transition readback, and replacement during preparation. Two queued delayed additions finished in 5.76 s under the unchanged seven-second action budget. The final packaged executable also passed the owned vMix preset round trip below. |
| AC-5 | Browser queue `j-4992` passed all 75 tests in the maintained Bridge connection, Publish setup and production persistence specs. It verified one Load of the named output URL with title and Overlay 3, On air from state, Unload from the live overlay after choosing another, Cancel sending nothing, a keyed Replace, the Bridge's setup error, disabling Take and Stop/Clear for a CasparCG cue, switching back to CasparCG, abandoning a Load after navigation, and first Publish with vMix selected and unselected. The production panel was inspected in screenshots. The real run also operated Load and Unload from the studio page. |
| AC-6 | The rebuilt NoaCG-Bridge-0.11.0.exe from the current code has SHA-256 `3b801e5c040b00df3c3dd6a45e8262a6dfb5ff96d3ff1b649b9669ed5bf9a32d`. Its smoke test reported 0.11.0, `vmix` and `vmix-output-key`. The published baseline is 0.10.2. The release changes only the independent Bridge version and operator notes. The CI/CD coordinator lifted the hold. Exact-merge release and download checks remain for the independent checker after landing. [Hold release](https://github.com/NoaCG/NoaCG-Studio/issues/1967#issuecomment-6749875855). |

The final packaged preset check used three owned blank vMix 29.0.0.49 Trial
sessions, with a synthetic renderer and isolated Bridge storage. It saved the
generated local Browser address, key and Overlay 8. Reopening with the rebuilt
Bridge on the same port returned the exact fixture URL and the same decoded RGB
Program SHA-256, 8e6102059b5c4212c1a82f0df2e8f5b954b11184d890530fb0d46ea598e66d9a.
Reopening with Bridge down showed the underlying plate. It stayed pixel-identical
to that plate for 5.5 s after Bridge startup. Reloading the input in vMix
fetched the exact URL and restored the original composite hash. Program and
Preview input selections stayed at 1 and 2. Each run stopped only its owned vMix
process and verified restoration of both vMix files by SHA-256. The service
remained running. The replayable probe, logs and captures are in
C:/claude/Temp/vmix-v2-runtime-1108/packaged-preset-sequenced.

Browser job j-4995 used the final packaged executable with the real Studio
production page, an isolated renderer and fixture RPCs. Load put the named
Browser on Overlay 8. Its first sampled Program frame showed the settled
lower third with the original plate outside the graphic. Unload restored the
original decoded Program SHA-256, a9b7a25fcc3d2ccba090dc980baa3cc2d97bf398793dc007d1f30f5152ec5710.
Program and Preview stayed at 1 and 2. Both configuration files were restored
and verified. Captures and the runnable probe are in
C:/claude/Temp/vmix-v2-runtime-1108/visuals-alias-sequenced.

The shorter observation build in j-4990 showed the existing startup flash
before the renderer settled. The final build keeps the prior observation
interval within the same action budget, and the final walk did not sample a
flash. The interval does not verify the readiness of a slower renderer, so
#2292 remains open. Job j-4991 missed browser admission at the memory floor
and correctly refused to run the proof after its owned vMix session closed.
It provided no product evidence.

The final focused Node selection passed 95 tests, including 38 vMix TCP and
HTTP alias cases, the Bridge HTTP and protocol suite, CasparCG compatibility
and Studio output rules. Studio TypeScript and lint on changed Studio and
browser source passed.

Real runs used the owned Vite port, an isolated loopback fixture and isolated Bridge storage.
The first snapshot attempt (`j-4958`) read a partial PNG. The next (`j-4960`) confirmed the
overlay and Unload, but its first changed Program snapshot was opaque black. The settled
frame probe (`j-4962`) required the top of Program to match the original and the lower third
to differ. `ffmpeg` confirmed that the decoded Program frames before Load and after Unload
matched. The screenshots and rerunnable local probe are in the V2 runtime folder
`C:/claude/Temp/vmix-v2-runtime-1108` under `visuals-r3`, `visuals-final` and the probe scripts.
The rebuilt Bridge's first sample in `j-4972` showed the original plate, followed by the
lower third. The observation window for input ownership does not establish renderer
readiness for slower pages.

The old Bridge uses the same AddInput, name, and Overlay In sequence. The published
Bridge 0.10.2 (release SHA `cac694063910ff0bcd2cf07f74ef7b4220a18041`) has no CLI tree
difference from the pinned V1 source. Its download matched the published SHA-256
`c05ddebae393483c5ad88375e6ca127b458af79bd4fa0cde0db8d5f11f7a39e2`. The same owned
fixture and renderer with that Bridge in `j-4964` also captured an opaque black Program
frame before the Browser settled. Both versions kept Program and Preview inputs fixed.
The inherited first-load flash needs a Browser readiness signal and is tracked in
[#2292](https://github.com/NoaCG/NoaCG-Studio/issues/2292).

The final changed-gate run passed 388 tests after supplying the exact Git LF
blobs for three unchanged files read by Linux-oriented assertions. Their
normal Windows checkout bytes were restored. The Bridge HTTP suite separately
passed 29 tests, including the byte-identical protocol mirror and the ordinary
Host and origin refusal rules. The local browser-protection check requires a
directory symlink this Windows account cannot create. CI owns that result.

Every real run confirmed the vMix GUI was idle, verified both listeners belonged to the
owned vMix process, and restored `last.vmix` and `user.config` with matching SHA-256 hashes.
The vMix service stayed Running. Other editions were covered by fakes. V4 still owns
the adapter guard for native rundown and folder actions before it adds vMix media cues.

### Interaction reconciliation and review repairs

The main merge kept the Interaction Publish and name controls, Links pointer and Results mapping,
along with V2's mounted session and adapter guards. Browser job `j-5030` sent one correct vMix
Take from Interaction and read On air. When the Bridge refused the Take, the same job found the
setup sentence hidden with Playout. The note now appears in the Playout panel on another workspace,
and stays in the control area on Playout. The production uses one note at a time. The final focused
browser job `j-5034` passed 11 cases, including both Interaction Publish outcomes, the compact panel,
the `/j/` name change and the offline CasparCG fallback. The error and On air screenshots were
inspected. The full three-spec pass `j-5031` covered 75 cases. `j-5032` passed the Interaction
rehearsal, Results staging and QR SVG/PNG journeys.

The exact-base review reproduced two additional faults. Closing the production during the final
Bridge health read cancelled a CasparCG clear already in progress. An accepted All out can now
finish a native cut on the original route after navigation if the Bridge still reports the same
occupant and the saved adapter permits it. An offline renderer fallback admitted before navigation
also verifies the original slot and production address. A failed cloud clear that returns after
teardown cannot start a new fallback. Ordinary delayed verbs still need the mounted session. The
review also found an inherited folder teardown path that can discard a late Take's cleanup after
All out. This merge does not change that folder engine.

The other reproduction restarted Bridge with the same mixer on a different HTTP port. The old
build reported a successful Load even though the Browser could only reach the closed listener.
On a real vMix with Bridge at 48826, the rebuild reported the input still on Overlay 8 and named
its original port, 48825. Load refused before renaming or changing the overlay. Unload cleared
the owned input. A kept key with an unknown HTTP port also cannot authorize Load. The redirect,
Browser source and ownership remain usable on the original port, and startup sends no mixer action.

The rebuilt executable's four owned vMix 29.0.0.49 Trial stages covered create, same-port preset
reopen, late listener with explicit Browser Reload, and wrong-port refusal with Unload. The correct
port and manual reload restored the same RGB composite hash shown above. Every session kept Program
and Preview selections at 1 and 2, restored and verified both vMix configuration files, and left
vMixService running. An initial OpenPreset probe did not complete while the browser queue was active.
The isolated rerun with a shorter copy of the same scratch preset passed. Logs and captures are in
`C:/claude/Temp/vmix-v2-runtime-1108/packaged-preset-main-reconciled`.

The Studio and renderer browser job `j-5033` used that same rebuilt executable and an isolated
production. Load put its Browser on Overlay 8 and produced the fixture lower third in vMix.
Unload returned Program to decoded RGB SHA-256 `78b62dcc8f27e1303f44b598e398bffeccde2d2aa65f1d51faa5266c28ac0eb1`,
equal to the original plate. Program and Preview input numbers remained fixed. The launcher restored
both configuration files. The probe and captures are in
`C:/claude/Temp/vmix-v2-runtime-1108/visuals-v2-main-reconciled`.

The repaired product tree passed 574 changed-gate tests and 39 fake vMix tests. TypeScript
and lint on the 15 changed Studio and browser TypeScript files passed. The changed-gate run
used the exact Git LF bytes for three unchanged fixtures and restored their checkout bytes.

### Cross-process ownership and Settings retry rules

The cf21 round-cap reassessment reviewed the ownership, incomplete XML, TCP sequencing,
navigation and wrong-listener findings above. A new fault-injection run at `4155bb3283acea37b88b4f560875634a619d0e90`
gave two store instances the same snapshot. Both saves reported success and the last erased the
other key and redirect. The same review found that Settings lost Try again when Bridge health
failed. Browser job `j-5035` reproduced the section disappearing before it could show the outage.

- On Windows, the Bridge claims exclusive vMix output storage for its canonical local data
  folder after its HTTP listener starts. The OS releases the claim when the process exits.
  A second Bridge can still report the mixer and its overlays and operate other adapters. It
  cannot claim Browser ownership, send vMix functions or serve vMix Browser redirects.
  Output ownership stays unavailable until an eligible Bridge starts and obtains the claim.
  Non-Windows Bridge invocations can report vMix for diagnostics and direct tests. Persistent
  vMix output control runs on the same Windows computer as vMix.
- A successful health reply establishes whether the current pairing advertises vMix. Unknown
  health keeps a previously advertised section visible with the current failure and Retry.
  Only a valid reply can disprove support. A new pairing starts a fresh request with no prior
  diagnosis, capability or retry state.

Two real Windows Bridge CLI processes using the same isolated data folder and different HTTP
ports reproduced the contention safely with fake mixers on two TCP ports. Both could detect
vMix. The second process sent no vMix functions, left the stored bytes unchanged and reported
that another Bridge owns vMix output storage. The owner's saved Browser address redirected
normally. Forced termination released the ownership claim. The second process stayed read-only,
and a fresh Bridge on the original port served the same alias and unloaded the owned key.
The focused Bridge and CasparCG suites passed 69 tests. The setup and dispatch logic passed 12.

Browser queue `j-5036` passed 12 cases. Settings kept the error and Retry during the same-pairing
outage, recovered when Bridge returned, and hid the section when a healthy Bridge confirmed it
did not list vMix. The rebuilt Bridge then passed the four owned vMix preset stages again, including
wrong-port Load refusal on 48828 with the original Browser on 48827. In `j-5037`, Studio Load and
Unload with the rebuilt Bridge changed Program on Overlay 8 and returned it to the same original
RGB SHA-256 above. Program and Preview selections stayed at 1 and 2. Both vMix files were restored
and verified after each run, and vMixService stayed running. The final artifacts are under
`C:/claude/Temp/vmix-v2-runtime-1108/packaged-preset-final-lease` and
`C:/claude/Temp/vmix-v2-runtime-1108/visuals-v2-final-lease`.

### Complete snapshots and valid health replies

The full independent review rated `a329007d4c83c03a9c0fd07754df4e3239973ea6` B. The
fake mixer answered with a complete initial snapshot, then omitted Overlay 7 from all 20
AddInput observations. The Bridge kept a key and sent AddInput, SetInputName and OverlayInput8In.
The parser also accepted a bad GUID and stray text in the input table. The two earlier code
repairs in this family were `6394eb6bc` and `b3bf2f226`. The final rule reassessment called for
one authority boundary through every read, with the operation's initial overlay count fixed.
Load and state require all supported channels. Out and Clear require the chosen channel. Each
must have a valid input table. A status diagnosis does not require full channel coverage.

The same review found that a failed HTTP reply, a string protocol version, and an explicit
`ok: false` reply all hid Retry. A successful recognized current or legacy Bridge health reply
can confirm absence. Failure or malformed data cannot erase the current pairing's capability.

The repaired fake reproductions send only AddInput, keep neither the key nor the redirect, and
return uncertain. An unreadable selected channel after Out cannot authorize a rename. An overlay
In readback with the right GUID but a different input type cannot confirm a Browser on air.
The captured vMix 29 XML and all 73 focused vMix and CasparCG tests passed. The 12 setup and
dispatch tests passed, including failed and malformed health replies and the genuine legacy
Bridge shape. Browser job `j-5038` passed 13 cases including Retry through the malformed reply,
explicit capability absence, older Bridge behavior and the production controls.

The strict-snapshot executable passed all four real vMix preset stages. Bridge on 48830 refused
Load of the input created on 48829 and unloaded that owned input. Reopening on the correct port
and reloading after late startup recovered the same RGB composite above. The Studio proof
`j-5039` passed with the same executable. Unload restored the original Program pixels and the
Program and Preview selections stayed fixed. Every owned vMix session restored and verified both
configuration files and left vMixService running. The captures are under
`C:/claude/Temp/vmix-v2-runtime-1108/packaged-preset-final-snapshot` and
`C:/claude/Temp/vmix-v2-runtime-1108/visuals-v2-final-snapshot`.

### Validate the whole XML start tag

The next full independent review rated the retained candidate
`da70b219a62c32fee1d21673f62670af83856c7d` B. The fake mixer returned its complete
overlay table and the exact new Browser marker, but wrote the input as
`<input/ key="…">…</input>`. The compiled Bridge kept the input key, renamed it and
put it on Overlay 8. The first three repairs in this family were `6394eb6bc`,
`b3bf2f226` and `cd9d211d1`. The owner authorized one additional repair of the
start-tag grammar after the independent rule review.

The parser now reads attributes in order and checks the entire tag before a row
can prove ownership or overlay state. An empty element ends in contiguous `/>`.
The same parser reads input and overlay rows, including paired empty overlays.
Malformed attribute separators, duplicates and mismatched closes make the snapshot
unusable. The fake reproduction now returns uncertain after only AddInput, keeps
no key or redirect, and leaves Overlay 8 empty. The captured vMix 29 fixture and
valid quoted and multiline rows still parse. Mixer commands and deadlines are unchanged.

The rebuilt Windows Bridge 0.11.0 passed all four owned vMix 29.0.0.49 Trial preset
checks on ports 48831 and 48832. Reopening with the original listener and reloading
after late startup each recovered the same Program composite. The different-port
Bridge refused Load without changing the overlay, then unloaded the owned input.
The four sessions restored both settings files by SHA-256 and left vMixService running.
The captures are in `C:/claude/Temp/vmix-v2-runtime-1108/packaged-preset-final-grammar`.

### Rules for replacing the XML scanner

The independent review of `b515256d2444292f92c27117bf378fb073129c7f` graded it B.
The compiled Bridge accepted malformed input body text, malformed comments and
malformed attribute prefixes. Those snapshots authorized durable ownership and
overlay commands. The owner approved replacing the scanner with a strict XML
parser. This checkpoint records the rules before implementation. The parser here
still has the known failures.

- A length-framed reply must decode as UTF-8 and parse as one complete,
  well-formed, namespace-aware XML document before any part can supply state.
  Syntax errors in ignored descendants and after an otherwise valid state table
  invalidate the entire reply. DTDs are refused and no custom entities or external
  resolver are available. Only parsed predefined and numeric XML references may
  supply text.
- The root and recognized direct state sections are unqualified. The direct input
  and overlay rows, and the attributes that supply their state, are unqualified.
  A nested input layer or unrelated metadata never supplies an input or an
  output overlay. Legitimate nested records are allowed and are checked for XML
  well-formedness. Version, edition and overlay occupancy are scalar values.
- The existing vMix state checks still apply after parsing. The required sections
  occur once. Input keys and positions are valid and unique. Overlay numbers are
  valid and unique. A reported empty overlay is distinct from an omitted one.
  Status can identify a supported edition with partial coverage. Load and scoped
  state still require the complete supported overlay set, and Out or Clear still
  requires the chosen channel to resolve. A malformed observation after AddInput
  cannot keep the key or redirect, rename the input or send Overlay In.
- The captured vMix 29 fixture and the fake vMix 28 and Basic HD cases must still
  read correctly. The compiled Bridge must reject the earlier malformed cases
  and prove the AddInput ownership boundary in a fake. The rebuilt Windows
  Bridge must pass the applicable preset cases on an owned blank vMix process.
  The Bridge version, deadlines, CasparCG and CI policy are outside this repair.

The fresh Rules review agreed with corrections. A successful frame starts with
the exact `XML <bytes>` header and keeps the 16 MiB limit. Decode UTF-8 without
replacement. Accept one optional leading UTF-8 BOM and an optional XML 1.0
declaration with a compatible encoding. Require plain character text in version,
edition and overlay occupancy. Children, comments, CDATA and processing
instructions cannot stand for scalar values. Reject unexpected direct input
and overlay rows. Nested metadata can use namespaces and is checked through
the end of the reply. Bound nesting at 128 elements to keep namespace lookup
bounded inside the existing byte and action limits. The compiled fake must
exercise a valid marked observation followed by a malformed reply and observe
only AddInput, no key or redirect, and an empty overlay.

### Strict parsing verification

The parser comparison tested Saxes 6.0.0, sax 1.6.1, xmldom 0.9.12,
parse-xml 5.1.0 and saxen 11.2.0 with the same malformed documents. Saxes
with namespace checks and DTDs refused was the only one to reject every
earlier failure in that comparison. Its source repository is archived. The
package is small, uses no native modules, and does not resolve external
entities. The active libxml2-wasm wrapper uses an ES module with top-level
await, which does not fit the Bridge's current CommonJS executable build.
The [Saxes source](https://github.com/lddubeau/saxes) and [npm package](https://www.npmjs.com/package/saxes/v/6.0.0)
document the behavior and the pin.

A probe also found that Saxes accepts a qualified name whose local part starts
with a digit. The Bridge uses the parser's `xmlchars` dependency to check the
initial character of parsed names and rejects whitespace that Saxes would trim
from a namespace declaration. An isolated comparison against the XML conformance
test data refused all 1,017 selected cases marked not well-formed. The compiled
tests exercise these checks in ignored content as well as in vMix state.

The new fake reproduced the failure on the prior compiled Bridge. After a valid
observation, a malformed comment after the root still led to Overlay In. With
strict parsing the same fake returned uncertain, sent only AddInput, left the
overlay empty and wrote no ownership file. The raw TCP test also refused invalid
UTF-8 and an extra word on the XML success header. The genuine vMix 29 fixture,
a nested input layer with Unicode metadata, and the existing vMix and CasparCG
cases passed. The focused compiled Bridge run passed 94 tests.

Windows Bridge 0.11.0, SHA-256
`56c5beed4707bf8cafd0193b11e2cc3c0ed126d0d772d7f21ca9c04aad6163eb`,
passed `/health` and four owned vMix 29.0.0.49 Trial preset checks. The listener
on 48833 restored the original composite. Late startup stayed on the plate
until an explicit Browser Reload restored the same composite. The listener on
48834 refused Load and unloaded the owned input. Program and Preview selections
stayed fixed. Both vMix configuration files were restored and hash-verified
after every stage. The vMix service stayed running. The local logs and captures
are under `C:/claude/Temp/vmix-xml-parser-probes-1110/packaged-preset`.

### Changed files

- Studio request and control code in `src/control/playoutLink.ts`, `vmixSetup.ts`,
  `playoutProtocol.ts`, `graphicVerbs.ts` and `takeBlockers.ts`. The focused logic tests live in
  `scripts/vmix-setup.test.mjs`.
- UI wiring in `src/components/BridgePairPage.tsx`, `PlayoutSettingsPanel.tsx`,
  `PlayoutSettingsDialog.tsx` and, under `src/components/home`, `PlayoutPanel.tsx`,
  `ProductionPage.tsx`, `CueRundown.tsx` and `useProductionPublish.ts`. Journeys
  extend `e2e/bridge-connect.spec.ts`, `e2e/publish-output-setup.spec.ts` and
  `e2e/_fakeBridge.ts`.
- Bridge entry, protocol, server and persistence in `cli/src/commands/bridge.ts`,
  `cli/src/playout/protocol.ts`, `server.ts`, `vmixTcp.ts` and `vmixOutputs.ts`. The adapter
  and its shared interface are in `cli/src/playout/adapters/vmix.ts` and
  `casparcg.ts`. TCP coverage is in `cli/test/vmix.test.mjs` and `_fakeVmix.mjs`.
- `cli/package.json`, `cli/BRIDGE_CHANGELOG.md`, `docs/BRIDGE.md`,
  `docs/PLAYOUT_INTEGRATION.md` and this work spec's `spec.md`, `work.json`
  and `evidence/phase-v2.md`. No database migration.
