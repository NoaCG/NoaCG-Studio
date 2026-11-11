# V3 evidence: vMix players and the media folder

## Rules proposed before coding

V3 makes the two vMix Video List players and media browser available in Bridge. The acceptance is AC-7 through AC-9. The Studio media UI, clip timing and fades, sequences, and Bridge release belong to later phases.

1. One loopback TCP connection and one serialized action per vMix port, shared with the overlay actions. Bridge requires exactly one vMix slot address, overlay or player. A player rejects overlay expectations and overlay-keyed tokens. Unsupported verbs, item kinds and options are refused before contacting vMix. A complete FUNCTION ER preserves vMix's refusal text. An unanswered or malformed reply after dispatch leaves the outcome uncertain, retires the connection, stops the action, and never replays a command. A later read may reconnect. With vMix closed, reads report not-running. A verb's commands and observation share the existing seven-second budget.
2. Basic HD is refused by edition name before any player function is sent. Each player has one GUID. Bridge first checks the saved GUID, then a unique matching shortTitle. A foreign kind, ambiguous match, or GUID claimed by the other player is refused. An AddInput request has no marker. A new empty Video List needs one stable, unique new GUID in fresh XML with the other input identities unchanged before Bridge sends any Input command. The empty mixer's built-in placeholder may be replaced if observed on the real host. Bridge keeps the identified GUID before naming or setting it up, so an unfinished setup can be revalidated on a later explicit Take. Unknown creation never authorizes guessing, adopting an unnamed list or deleting an input. A native writer creating an identical list at the same instant can be indistinguishable. Initialization names the input and disables Auto Play, Auto Pause, Auto Restart and Auto Play Next. It also sets Audio Auto off and Audio on for the audio player. Every Input parameter uses the GUID. Out, Clear and All out never create players. Mixer Program, Preview and transitions are outside the command surface.
3. Take sets Loop or Hold, disables Auto Play Next and sets full alpha, appends the requested file and selects and plays it. It succeeds only after XML shows the new item by path and index running, then confirms removal of the older items before it. A cleanup ER reports vMix's refusal and the already-observed playback, keeping the observed instance. An unanswered cleanup remains uncertain and stops the action. Observations check the ordered list and the selected occurrence, including on a re-Take of the same path. Pause, Resume and list emptying also require XML readback. Bridge checks flags with XML where available and records the command and real result for flags and alpha absent from XML. Readbacks use the actual list, including retained items from a partial action. Recovery starts with fresh XML and an explicit new action. State uses the observed file, position, duration, pause and loop. A cue and its instance belong to the observed item, survive Pause, Resume and ending changes, and lose their association when XML shows replacement. An external change leaving identical XML is indistinguishable. The vMix adapter checks the ending verb against the fresh owned item and reconciles instance and generation inside the port's serialized turn for both actions and reads. Audio actions use only the audio player. The real walk checks the visual replacement and records any fallback.
4. Bridge uses the Windows Videos known folder until the operator chooses another folder with the local picker. Only the picker can set a root, kept by port across Bridge restarts. Player keys and folder writes use the existing data-directory writer claim and merge their fields into the latest setup in serialized atomic writes. List and Take take relative paths. Bridge rejects traversal, absolute and drive paths, invalid Windows names and alternate streams, and checks that resolved ancestors and files stay within the canonical root. Bridge verifies the path close to ListAdd. A genuinely missing leaf under a verified in-root directory reaches vMix so its File Not Found includes the actual path. A dangling redirect, non-directory parent or access error is refused. Listing is one level and reads bounded headers for MP4, MOV and WAV durations. State and listing report only safe relative media paths. V2 overlay rows never carry the XML list paths. Concurrent local filesystem replacement between pathname validation and vMix's own open cannot be made atomic with these APIs.
5. A paired page can open the native picker and read the chosen folder. The picker holds no mixer lock or verb deadline. One dialog can be open across Bridge. A second request receives an already-open result. Cancellation or failure preserves the previous root. The new root is used only after the save succeeds. The built exe must demonstrate the picker over the browser and list the new choice, or demonstrate the Bridge-window fallback.

The independent Rules review agreed with corrections. The rules above include those corrections.

## Starting point and file allocations

The previous verified main was `a3f3e13caacb7bc8cbe4f00f8ffd5d694e489a44`, the independently accepted V2 and published Bridge 0.11.0 source. [V2 acceptance](https://github.com/NoaCG/NoaCG-Studio/pull/2293#issuecomment-6783585581)

On initial allocation review, codebase-health was closed and the changed paths in open PRs #2364, #2332, #2316, #1642 and #1641 did not overlap the V3 Bridge, wire-type, test or evidence paths. The mirrored wire fields also require the narrow registry change in `src/control/playoutLink.ts` so each remains scoped to its route. The CI/CD coordinator ended the cf13 hold. The exact changed files still need the queue's sideEnds check before landing. [Codebase health closeout](https://github.com/NoaCG/NoaCG-Studio/issues/2285#issuecomment-6721737348) [CI hold end](https://github.com/NoaCG/NoaCG-Studio/issues/1967#issuecomment-6749875855)


## V3 implementation decisions and automated checkpoint

The Bridge entrypoint passes the player setup file under its existing data-directory writer claim. The approved narrow extra paths are `cli/src/commands/bridge.ts` and `src/control/playoutLink.ts`. The latter only classifies the new wire fields and permits players on state replies. The separate player helper keeps player ownership and generation bookkeeping out of the CasparCG memory bank. The adapter shares one port turn across players, overlays and reads.

An unresolved Add records a durable creation marker before dispatch. A later explicit Take can use a saved GUID or the uniquely named Video List, and can finish setup of an identified GUID. It refuses another unmarked Add while the earlier creation is unknown. This leaves an input available for inspection instead of risking a duplicate player.

A same-path retake appends a distinct list occurrence and observes its index, ordered list and Running state before cleanup. A cleanup ER preserves vMix's refusal and the fact that the requested file was already observed playing, with its instance available in state. A missing cleanup reply stays uncertain and never causes a retry.

The Windows picker runs with a top-most owner window and a hidden PowerShell console. It holds no mixer turn. Closing Bridge aborts only its owned picker. Folder writes and player-key writes merge fields atomically in the same setup writer queue. The file browser reports canonical in-root relative paths and bounded header durations. Duration fields carry the MP4/MOV or WAV time base, which need not be a video frame rate.

The initial focused test run failed eight strict expected-path assertions because the test temporary root used a different Windows path casing from realpath. The fixtures now canonicalize the root at creation. The first full vMix-file run found one old expectation that media listing was unsupported. V3's media-list test replaces that expectation, while the old no-TCP refusal check now names the still-unsupported template list. These were deterministic test expectations for the new behavior.

Review also added immediate output-image-fit refusal, observed playback after prefix cleanup, preservation of ER text if clearing a failed Add marker cannot be saved, and teardown for an owned open picker. The configured selection planner selects the whole 65-spec set because the mirrored reply registry is a shared boundary. No selector or CI policy changed.

## Verification still pending

The exact committed Windows executable, native picker in front of the browser, real vMix 29 playback and snapshots, fresh final independent review, PR CI and exact-merge checks remain required. The automated checkpoint is separate from those proofs. No Bridge release is part of V3.

## Revert

The previous verified main is the full SHA above. Once PR #2368 lands, revert its merge with `git revert -m 1 <merge SHA of PR #2368>` through the ordinary feature-branch merge-queue flow. The change adds `vmix-setup.json` beside the existing Bridge token and output store. No database migration is involved.


### Automated checkpoint results

The CLI build passed. The full focused vMix and media files passed 99/99 tests, including all 76 V2 tests. Changed root gates passed, including 70 Node tests in three selected files. Studio and API TypeScript checks and changed Studio ESLint passed. The CLI source files are outside the root ESLint configuration, so their separate lint invocation was ignored and the CLI TypeScript build is the applicable compilation check. Git diff whitespace checks passed.

The inline review found and fixed four contained cases, output image-fit acceptance, cleanup completion before playback observation, owned picker lifetime, and ER detail preservation during a storage failure. Simplification remained within the player and media helpers. The next checkpoint needs real-host and packaged-picker evidence.


### Rule correction after independent review of c97586a9

The full independent review graded c97586a9 B+ and found one blocker. A valid AudioOn acknowledgement can leave the Audio Video List muted, while the candidate marks setup ready and reports a successful audio Take. The existing initial readback checks the name and list, but omits the observable muted attribute.

An audio player is ready only after fresh XML identifies the same GUID and named list with muted false. A missing, malformed or still-muted observation after AudioOn leaves setup uncertain and stops the action. Bridge sends no automatic retry. A reused ready audio input also needs an observed unmuted state before Take can proceed. This correction changes the observation rule, with a silent-no-op fake regression and the real audio-meter proof required. The default blank's initial and post-Add XML still need the real-host check.


The audio defect reproduced on the reviewed candidate, the silent-no-op fake returned success while muted remained true. The repair parses a strict optional mute attribute privately, requires an observed unmuted audio list during setup and Take observation, and refuses a reused muted player before another function. Missing and malformed post-AudioOn observations remain uncertain. The repaired CLI build passed, the complete vMix/media regression passed 102/102, and changed root gates passed with 70/70 Node tests. The first reviewed executable and checksum remain preserved in the local evidence folder.


### Reassessment of the audio observation rule

The next independent full review found a second variant of the same audio-observation defect. The cleanup observation after ListRemove could replace the confirmed unmuted Running snapshot with a muted snapshot and still authorize successful Take completion. The candidate and its package remain recorded separately.

The fresh independent reassessment agreed with one bounded correction. One shared readiness predicate applies at every observation that authorizes audio Take progress or success, including setup, reuse, pre-append, appended list, first Running and every prefix cleanup. Clips keep their existing behavior. Audio readiness means a strict observed muted false. Each stage keeps its list order, selected occurrence, loop and liveness requirements. A later cleanup failure preserves the instance established by confirmed Running, preserves a valid ER and partial-effect context, and leaves an unanswered function uncertain without retry.

Resume also needs readiness before any function and in the same-selection Running observation after Play. An initially muted or unconfirmed audio Resume is refused. An unreadable, missing or contradictory observation after its acknowledged Play is uncertain. Bridge does not unmute automatically. Pause, ending, Out and Clear prove their own requested effect. A mute change by itself keeps the selected item's instance and cue identity in state.

The focused reference checks cover muted, missing and malformed mute state across the progress stages, repeated paths with multiple prefix removals, intermediate and final cleanup changes, Resume before and after dispatch, clips with no mute field, natural short-clip completion during cleanup, and identity retained by Pause, ending and state.


The compiled 75556c97 baseline reproduced all three observation failures: an appended list let Take send SelectIndex despite unconfirmed readiness, replacement Take returned success after a muted prefix removal, and a muted Resume returned success. The repair applies the shared predicate at every successful observation and stops at the first structurally matching but unready reading. A strictly unreadable mute attribute is unconfirmed readiness while the independently validated ordered list remains readable. Structurally observed cleanup updates the retained identity even when audio readiness makes the action uncertain. An unanswered cleanup keeps the last confirmed identity until a fresh reading shows a different ordered list. No command is replayed.

The repaired CLI build passed. All 107 focused vMix/media file tests and all 70 changed-gate Node tests passed. The existing 76 V2 vMix tests are included. Both earlier reviewed Windows builds and hashes remain in the local evidence folder.


### Media root, overlay isolation and player lookup corrections

The full independent review of b326ceb9 graded B+ and found three families. Resume could send Play for the current selected file outside the configured root. Take could change loop or audio settings on that same out-of-root selection before appending its new file. A picker could publish a new root while a player action was still using its earlier root. Separately, a V3 setup read failure could make V2 overlay state fail, and player lookup could claim a reserved raw display title when the identifying shortTitle was absent.

Before any Take or Resume function, Bridge verifies any existing selected file against the current canonical root and the same supported media kind policy used for a requested file on that player. When the selected file fails this check, the action refuses with Clear or Out recovery. Pause, Out and Clear can stop or remove a selection even when its path is outside the current root. Ending still checks its own selected instance and named in-root file. The picker waits without the mixer turn. Only its final durable root publication joins the existing per-port turn so a player action uses one root. Setup field writes still merge atomically.

V2 output-scoped state reads its overlay inputs and ownership without opening the V3 setup. Generic state preserves those fields when it cannot read V3 setup and omits the optional players. Explicit V3 actions and setup requests still report the setup failure. Player lookup keeps a saved GUID. Fallback requires a unique exact shortTitle. A reserved raw display title with missing or contradictory shortTitle is an ownership conflict, never a fallback or an invitation to add another list.

The focused checks exercise outside-root and wrong-kind selections, stopping and clearing them, publication order against a live action, independent overlay state with an unreadable V3 setup, and a display-only name producing zero mixer functions. The published Rules precede the repair. The prior reviewed executable and all its verification are retained.


The existing Bridge ownership wire contract binds a stored instance to the response's session prefix. The vMix HTTP Take binds its instance to the same Bridge session used by its action and state replies. Pause and Resume preserve that identity. After a Bridge restart, readable mixer state still names the file and the new process has no prior cue instance.


The four focused media/root/ownership probes reproduced the reviewed failures on b326ceb9. The HTTP prefix probe also reproduced a player instance with no session prefix. On the repaired tree all 112 vMix and media tests passed, including 76 V2 tests and the new picker-publication, root recovery, overlay isolation, shortTitle and HTTP session checks. Changed root gates passed 70/70 Node tests, CLI compilation passed and the work-spec status reported no structural or digest problems. The prepared native proof scripts passed syntax checks. No device run was performed on the failed-reviewed candidates.


### First packaged host attempts on 701ad808

The development executable built in j-5169 had SHA-256 10435250c00d7dcaacdf6035712f5366b9151b1d461014364eaba00ba8b5aebd. It passed its native health smoke. The fresh full review graded this head B+. It confirmed the earlier corrections and found the default Blank attribution, reachable Resume entries and Windows case-sensitive path comparison problems.

The required packaged-picker probe j-5170 failed. Its owned headed browser issued the native chooser request, and a second request was refused while that request was pending. Both Windows window inventories showed the proof browser and no visible picker. The picker PowerShell process remained alive in the interactive session with no main window handle. The Chrome-for-Testing window also hit a Computer Use ownership error when binding for a screenshot. The first chooser request timed out after 125 seconds. No folder choice or visible modal was verified. The owned browser, Bridge and picker child exited, and the mixer and its settings were untouched.

A separately admitted AC-8-only diagnostic used a disposable Bridge setup and the owned blank vMix 29.0.0.49 Trial session. Initial XML reported two native inputs at positions 1 and 2, each with type, title and shortTitle Blank. The single AddInput VideoList request replaced position 1 with a new GUID, type VideoList and title/shortTitle List, with an empty list, Completed and zero position/duration. The remaining position-2 Blank also changed GUID. vMix changed its own Preview index from 2 to 1 during creation. The wire contained only XML reads and the one AddInput, with no keyed function or Program, Preview or transition function. Bridge stopped uncertain under the old attribution check. Both settings files were restored by SHA-256, the owned process was stopped, and vMixService stayed running. The before and after XML, TCP trace and receipt remain in the local real-10435250c00d-fixture-folder-blank-only evidence folder. This diagnostic makes no playback acceptance claim.


### Reassessed reachable paths, native Blank and picker rules

The fresh read-only reassessment agreed with the following bounded corrections and the updated Rules were published before implementation.

- Before a Take, Resume or ending can issue a playback-capable function, each existing list entry that playback can reach must resolve to a supported file inside the current root and on the intended player. Without an authoritative vMix Auto Play Next reading, any retained predecessor or successor can be reachable. Recheck later observed list changes before further playback exposure. Pause, Out and Clear remain available for recovery. A missing new leaf still reaches vMix after its parent is verified.
- Windows lexical folding can locate a candidate relative path. It grants no containment or identity. Resolve the actual candidate root and path, require exact canonical root segments, and compare item identity without folding distinct case names. A legitimate spelling alias is allowed only when its actual root resolves to the same canonical root. A lexical path on a foreign drive or UNC share is refused without probing it. Filesystem lookup cannot hold the port past the existing verb deadline or cause a late function.
- The measured native startup exception applies to exact built-in Blank inputs at their startup positions. Only one stable new empty VideoList can replace a Blank position. Other real input identities and the remaining Blank positions and shape stay fixed. A remaining native Blank GUID may rekey. A new or changed real input still leaves attribution uncertain. The observed native Preview movement is a vMix side effect of AddInput, with no runtime Preview command.
- The packaged picker uses a shown and activated top-most owned Windows form before opening its modal dialog. The native dialog still waits outside the mixer turn. If an exact packaged proof still cannot establish a visible choice, build and prove the spec's Bridge-window fallback.


The prior compiled candidate reproduced unsafe retained entries, a later unsafe list change, a hung lookup retaining the port, case-folded identity and the measured Blank refusal. The repaired CLI build and all 119 focused vMix/media tests passed, including all 76 V2 tests. Changed root gates passed 70/70 Node tests. The visible owner is implemented in this candidate. Its packaged foreground proof still needs to be run.


### Selected occurrence and bounded setup publication

The independent review of 6f636a63 graded B+. A fresh post-setup list could introduce an unsafe file before playback settings were sent. An acknowledged SelectIndex could leave the earlier paused file selected when Play was sent. A slow setup write held the mixer turn past the verb deadline, and checking a newly picked folder still took place inside that turn. The exact reviewed source and verification receipts are retained.

The owned vMix 29.0.0.49 Trial diagnostic observed index 1 Paused in the full one-item list 2.9 ms after SelectIndex ACK. For a paused replacement in the full two-item list, index 1 was still selected 1.1 ms after ACK, then index 2 was observable Paused at 28.5 ms before any replacement Play. The only Play in the trace started the first synthetic file for the fixture. Both settings were restored by hash and vMixService stayed running. The XML, trace and receipt are in the local selectindex-native-20261111-corrected folder. The first diagnostic harness checked the wrong TCP status token, issued only XML and restored the same settings. This is a selection prerequisite diagnostic.

The published correction requires full list validation after setup and on each readable observation before further playback exposure. After SelectIndex, poll for the same player, full order, exact occurrence, loop and audio readiness before Play. Observe Running separately. Report a partial effect and preserve the confirmed instance if later cleanup fails.

Resolve and inspect the picked path outside the mixer turn. The final publication uses a finite budget under the port turn. The actual serialized setup writer checks the deadline and writer claim before publication. Expiry before submitting a rename prevents it. After submission, a timeout reports uncertainty and fences affected player or folder operations until the outcome settles. Unrelated mixer reads and recovery on an independently authorized same GUID remain available. Later explicit actions read fresh disk and mixer state.

Keep the creation marker if Add has no usable reply. Clear it after a definitely unsent or refused Add only after the marker write has settled and only while its original attempt and claim still match. Unconfirmed marker publication leaves a conservative barrier. A timed-out writer can never continue to a mixer function.


The exact repaired CLI build and all 131 vMix/media tests passed, including the 76 V2 cases. The added checks cover the post-setup and intermediate list reads, delayed or ignored selection, missed post-ACK observation, slow picker path checks, pre-rename and queued expiry, pending key and root publication, writer claim loss, and creation barriers and explicit recovery. The unfinished-setup fixture first used a test deadline shorter than the native attribution reserve. After correcting that fixture budget, it exercised the intended write boundary. Changed root gates passed all 70 selected Node tests. The native foreground picker and the full synthetic playback proof remain pending.


### Native Loop ordering after the first packaged Take

The exact f7dd9bf8 package passed its independent A review and its Windows health check. The owned vMix 29.0.0.49 Trial started with two native Blank inputs. Bridge kept the stable new Clips GUID at position 1. The position-2 Blank rekeyed. vMix acknowledged LoopOn on the empty VideoList, yet XML still reported loop False. Bridge stopped uncertain before ListAdd, SelectIndex or Play. The original settings were restored by SHA-256, and vMixService stayed running. The package and first native XML and TCP receipt are retained.

The separately admitted raw TCP diagnostic used two synthetic clips. After ListAdd, the first file was selected and Paused. LoopOn was still False 1.9 ms after ACK, then True at 25.4 ms before SelectIndex or Play. For the running replacement, the append left the prior occurrence selected. LoopOff was still True 1.0 ms after ACK, then False at 23.2 ms while the earlier clip was Running. SelectIndex made the replacement Running at 224.8 ms without an additional Play, and loop stayed False in that reading and 100 ms later. Both settings were restored by SHA-256, the owned process stopped, and the service stayed running. The diagnostic trace includes command acknowledgements and contains no Program, Preview or transition function.

Under the independently reassessed Rules, Take disables Auto Play Next, verifies the fresh owned existing list, and appends the requested file. The full appended list and its current occurrence and audio readiness must be observed before setting Loop and full alpha. Loop is then read back for that same list and occurrence before SelectIndex. A first native append can select occurrence 1. An append to a populated list retains the old occurrence. Exact target occurrence, order, loop and readiness are still checked before Play, and Running is confirmed separately. Any lost reply or unconfirmed required observation stops the remaining functions under the existing verb deadline.


The repaired CLI built and passed all 133 vMix and media tests, including the 76 V2 cases. The fake now models the native empty-list Loop ACK without a state change, the first append's initial occurrence and delayed populated Loop updates. A populated Loop ACK that leaves the wrong state sends neither SelectIndex nor Play. The focused audio readiness and retained-path probes passed in their new command order. Changed root gates passed 70/70. The work-spec digest matches the explanatory ordering update, and the text of AC-7 through AC-9 is unchanged. The exact repaired package still needs real playback proof.
