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
