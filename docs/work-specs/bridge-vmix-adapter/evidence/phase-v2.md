# V2 vMix setup and production output

V1 was independently verified on `4dab8e67af7d76d2e7f2cd180e36d14df9d151b4`
(PR #2291, receipt comment 6722265444). To revert V2 after landing, open a PR
with `git revert -m 1 <V2 merge SHA>` through the queue.

V2 lets an operator pair, choose vMix and load or unload a published production's
Browser input on an overlay. Media controls and the media library belong to later
phases. vMix keeps control of Program, Preview and transitions.

## Rules

- The Bridge owns a new Browser key only after a successful AddInput reply and
  the complete three-second observation window. Exactly one new Browser key may
  appear across the readings, including keys that later disappear. That key must
  still be present with the default title for the requested hostname at the final
  reading. No pre-existing key can become owned. The existing seven-second action
  budget leaves time for naming, overlay dispatch and readback. An action that
  cannot start within the budget sends no AddInput.
- The versioned store marks an addition before the send. An unanswered function
  or incomplete or ambiguous readback never names, records ownership of, or airs a
  Browser. New additions stay blocked until the operator restarts vMix and clears
  only the pending marker with the Bridge closed. Known owned Browsers still work.
  vMix reports the hostname but omits the URL, and its reply identifies no key. If
  the Bridge's addition produces no observable Browser during the entire window
  and a concurrent external Browser for the same hostname is its only candidate,
  that case is still indistinguishable from a successful addition in live XML.
  The requested addition may have no effect, arrive after the window or appear and
  disappear between snapshots. A key already kept for another address is excluded.
  An XML response that omits inputs or overlays cannot establish ownership.
- A key belongs to the vMix TCP port and the output URL with its display name
  removed. The store beside the Bridge token keeps the address as a digest and the
  Browser key. Load and Unload use that key only while vMix lists it as a Browser.
  An action durably forgets a missing or invalid key before any new addition.
  The store serializes updates across ports and commits each replacement as one
  file. Missing storage starts empty. Unreadable, corrupt or unsupported storage
  blocks writes. One Bridge instance owns the store for each local user.
- An acknowledged, unambiguous new key is kept before renaming or overlaying it.
  Failure to save sends neither command. If rename or overlaying later fails, a new
  explicit Load rechecks the kept key. An unanswered function is uncertain and
  never sent again as part of the same operation.
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
  put the same owned Browser on a second overlay.
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
documents Value as the AddInput parameter. This probe did not find an
attribution mechanism within the current action surface. Literal AC-4 stays
open, so V2 stays outside the queue and the Bridge release waits.

The review also found a dispatch interval between React route teardown and
deferred session disposal. With timers paused, browser job j-4977 reproduced a
vMix /act after Home had replaced the old production. The layout-effect cleanup
now revokes the mounted production's dispatch authority before session disposal.
The session's deferred cleanup still tolerates StrictMode's extra effect cycle.

## Verification before landing

| Criterion | Evidence |
| --- | --- |
| AC-1 | Independently reran the Slice 1 fake-vMix checks at the V1 baseline, 21 passing, and again with V2, 29 passing. They exercise `/health`, the 29 and 28 and Basic HD channel counts, version and edition, refused and silent greetings, connection loss and ACTS lines. V2 also starts the built CLI with `--vmix-port` pointing at a separate fake TCP listener and reads vMix 28 through the Bridge. [Slice 1 evidence](slice-1.md). |
| AC-3 | Browser queue `j-4980` verified pairing, both setup diagnoses, Try again, all eight options, default 8, a choice of 3 surviving reload and Update with an older Bridge. The Settings screenshot was inspected. |
| AC-4 | The focused TCP suite verifies ownership across Bridge restart, unchanged URL identity after renaming or a display-name change, same-title inputs, an operator's same-title Browser, stale keys, transition readback, delayed uncertain additions, save failure and a replacement during preparation. It reproduces the early same-host Browser race and confirms the Bridge sends no rename or overlay command. Two queued delayed adds both pass within the existing 7 s budget (6.01 s measured). With the rebuilt exe in `j-4972`, vMix 29.0.0.49 Trial created the named Browser and read it back on Overlay 8. Program and Preview indices stayed at 1 and 2. The settled Program image showed the lower third over the original plate. Unload restored the original Program frame by decoded pixel hash. |
| AC-5 | Browser queue `j-4980` passed all 67 tests in the maintained Bridge connection and Publish setup specs. It verified one Load of the named output URL with title and Overlay 3, On air from state, Unload from the live overlay after choosing another, Cancel sending nothing, a keyed Replace, the Bridge's setup error, disabling Take and Stop/Clear for a CasparCG cue, switching back to CasparCG, abandoning a Load after navigation, and first Publish with vMix selected and unselected. The production panel was inspected in screenshots. The real run also operated Load and Unload from the studio page. |
| AC-6 | Local build of NoaCG-Bridge-0.11.0.exe, SHA-256 `48f38d2707469dac5a7eab8d75494b9b05db6468297b45b612aff849caa7826f`. Its smoke test reported 0.11.0, `vmix` and `vmix-output-key`. The published baseline is 0.10.2. The release changes only the independent Bridge version and operator notes. Exact-merge release and download checks remain for the independent checker after the #1967 hold and landing. |

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

The changed-gate run on 5e92b77a passed 385 tests after supplying the exact
pinned LF blobs for the three unchanged files read by LF-sensitive assertions.
Their normal Windows checkout bytes were restored. TypeScript, changed Studio
and browser lint, and the ten focused Node tests passed again after the route
guard change. The local browser-protection check requires a directory symlink
that this Windows account cannot create. Its CI result is pending.

Every real run confirmed the vMix GUI was idle, verified both listeners belonged to the
owned vMix process, and restored `last.vmix` and `user.config` with matching SHA-256 hashes.
The vMix service stayed Running. Other editions were covered by fakes. V4 still owns
the adapter guard for native rundown and folder actions before it adds vMix media cues.

### Changed files

- Studio request and control code in `src/control/playoutLink.ts`, `vmixSetup.ts`,
  `playoutProtocol.ts` and `takeBlockers.ts`. The focused logic tests live in
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
