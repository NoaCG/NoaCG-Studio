# V6 rules for timed vMix clip playback

V5 played or held a selected vMix file and reported its clock. V6 lets the operator trim it, control how it ends, and set its fades and level. This phase covers one already-supported media cue on a vMix player. Folder playback, Play next and sequence execution belong to V7.

## Baseline reproduction

On Windows at `6da76c942cc19136b67ed0235d8074733b129257`, the CLI compiled and the adapter played a plain Take through the existing fake TCP vMix. A trimmed Take, faded Take, gain setting, live change to Clear and faded Out each returned `unsupported` and sent zero new vMix functions. The adapter advertised only `state` for the target. This trace describes the baseline. The Program picture, Pause timing and +6 dB behavior need the separate vMix 29 checks below.

## Rules

1. A trimmed Take pauses the list and observes it stopped before appending and selecting. Native Loop is off for a Bridge-managed boundary. XML must show the requested stopped occurrence and a measured duration before seek. The interval must be nonempty and lie within that duration. A still keeps Hold and can fade on Take or Out. It cannot be given a trim or automatic Clear. After `SetPosition`, confirm that the same stopped occurrence settles at or after the requested in point and below the out point. A single acknowledgement or transient position never grants `Play`. A bounded second, different seek may advance by at most one 40 ms control frame when a seek settles just before the in point. A seek that remains unusable leaves the replacement covered and returns a failure. In the normal fake trace every `Running` sample starts at or after in. On native vMix the cover starts before selection and stays black and silent through a confirmed `Running` sample at or after in and before out. This also covers the native decoder reporting a lower first `Running` position after a stable paused seek. Prefix cleanup follows observed playback and keeps the latest confirmed occurrence if cleanup partly fails.
2. The clock reports the effective segment's start and length in seconds, with position relative to its start and within its length. Unknown timing can preserve presentation identity under V5 but grants no timed action. Studio accepts a nonzero start and an owned relative position on the V6 contract. V5 retains its zero-start checks. The effective Loop flag identifies a Bridge-armed trimmed Loop even while native Loop is off. An untrimmed Hold holds the native last frame and an untrimmed Loop stays under vMix control. At a trimmed out point, fresh evidence of that position grants Hold to pause, Loop to seek back, or Clear to remove. An untrimmed Clear observes `Completed` before removing. A confirmed Hold shows a stopped occurrence, Clear shows the empty list, and a Bridge Loop confirms its own rewind for that occurrence before updating the continuity checkpoint. For every automatic Loop or seeking restart that could expose pre-in material, use the same guarded stopped seek, black and silent cover and in-range `Running` proof as Take. A transient, rounded-back or rebounding seek never authorizes reveal or updates the trusted continuity checkpoint. Any other conclusive rewind follows the V5 ownership rules. Paused time does not count toward an automatic boundary.
3. One fade owns a player at a time. Fade-in starts at alpha zero and volume zero. One `SetVolumeFade` targets the cue level, and one `SetAlpha` per 40 ms control frame reaches 255. The vMix TCP API does not expose the output rate. The 25 Hz picture cadence corresponds to frames on the 25p fixture, with the requested wall-clock duration on other rates. Missed intermediate updates are dropped, and the endpoint takes priority over any missed update. Out fades from the current alpha to black and the actual native fader to zero. For automatic Clear, anchor the fade to the observed clip clock so it ends at the out point or native end. Arming Clear inside that window uses the remaining time. An exit fade takes over from an overlapping entrance. Black and silence precede removal. If Clear has less than 40 ms left while a conflicting native ramp is active, prioritize the boundary: black the exact held player and stop it there, unless it is already `Completed`. Replace the conflicting ramp with the measured minimum and confirm volume zero under the same guard before removing. If a scheduled fade to zero is still settling at the boundary, use the same black and stopped endpoint and wait for zero before removal. Report actual late removal when settling takes longer. Ordinary faded Out reports success after observing the empty list. All out remains a guarded cut.
4. Each Take applies its own gain, defaulting to unity. At or below unity the fader endpoint is 100 x gain^(1/4) and `SetGain` is zero. Above unity the fader endpoint is 100 and `SetGain` is 20 x log10(gain). An acknowledged `SetVolume` does not cancel a pending native fade. A later accepted action that must change the endpoint supersedes an active or uncertain native ramp with a measured replacement of at least 40 ms and waits for the new level to be observed where a safe start or end depends on it. A Take keeps its black or silent cover during a conflicting ramp reset. A Pause or ending change cancels its superseded frames and settles the level of the same held cue when it stops a fade out. A new fade to zero can take over directly. When ownership is unavailable the Bridge stands down. A native ramp already sent can still run for the remainder of its duration.
5. A live ending change acts on its exact expected instance and records the new end without playing the clip again. A trimmed ending replaces Bridge Hold, Loop or Clear. An untrimmed ending confirms native Loop and arms or disarms Clear. Pause suspends boundary work. Resume recomputes it from observed playback. A successful Out or Clear retires the occurrence. A stale action cannot affect a later Take of the same file. V6 uses explicit guarded wire forms for live ending and faded Out, so an older responding Bridge refuses the new operation before dispatch. With an older advertised Bridge the Studio still sends its guarded cut on normal Out. Existing V5 action forms remain available and can operate without starting V6 timed work.
6. An automatic step is bound to the Bridge session, exact port, player, generation and occurrence. After waiting for the same serialized mixer turn as foreground actions, check the generation and observe current native identity and the state needed for the send. Between complete XML reads a measured `XMLTEXT` predicate can attest exact GUID, list type, selected index, ordered file paths and relevant state, with one returned scalar. Automatic complete XML reads are capped at four per second per port. A changed media setup, changed occurrence or invalid, missing or ambiguous read grants no write. Unconfirmed or interrupted timed work disarms until an explicit accepted action obtains fresh authority. A refused or unknown write grants no automatic follow-up or resend. Closing or restarting Bridge drops pending work and never adopts timers from native state. Other ports and players retain their own work. Timed player writes are keyed player functions across product and fake traces. Program, Preview and transitions stay with the operator.
7. The vMix `/status` target capabilities advertise end, fade, trim and level. The cue editor uses those four capabilities to offer Clear, fades, trim and level, and Take and ordinary Out carry the applicable settings. The live ending wire command is available to paired clients. The editor's saved ending continues to apply on the next Take. CasparCG and vMix overlay actions keep their existing paths.

## Native probes before implementation

The vMix 29.0.0.49 Trial ran in an owned blank 25p startup preset. Native XML identified two blanks, then one setup `AddInput` produced the stable new first-position Video List. It was already active. All later writes were keyed to that test player, and Program snapshots were reads. Two earlier boots accepted the private preset path but did not load its empty saved Video List. Those boots sent only XML. All runs restored `last.vmix` and `user.config` by SHA-256, and vMixService stayed running.

- `XMLTEXT` returned position and volume through the exact ordered-list XPath, including synthetic paths containing an apostrophe and ampersand. A changed index, path or count rejected the predicate with `XML Entry Not Found`. These observations support the compact guard. They do not identify an indistinguishable edit between observations. [vMix 29 TCP API](https://www.vmix.com/help29/TCPAPI.html)
- From native volume 100, the one-second fade reported 71.64 at 202 ms, 21.38 at 402 ms, 5.31 at 601 ms, 0.46 at 801 ms, 0.00026 at 1052 ms and zero at 1201 ms. The samples show a nonlinear volume curve. There was no sample at exactly 1000 ms. At +6 dB the tone's input meter rose from 0.122–0.127 to 0.254–0.259 with the same fader. `SetVolume 80` allowed the prior ramp to continue to zero. `SetVolumeFade` with 0 ms was refused and 1 ms acknowledged without reliably superseding it. Replacements of 20, 40, 80, 125, 200 and 220 ms each held the requested fader 80 (XML volume 40.96) past the old ramp. The rule uses 40 ms with measured settling. [vMix 29 Shortcut Function Reference](https://www.vmix.com/help29/ShortcutFunctionReference.html)
- The single-keyframe clip used a synthetic 8-second MP4 at 25 fps. After the second occurrence was selected and paused, `SetPosition 2040` reported 2040 at 3 and 24 ms and returned to zero by 42 ms. A separate covered diagnostic Play started at zero. Seeking again while Running also rebounded. With no earlier output exposed, the safe result for that failed seek is to keep the cover and refuse. The diagnostic hidden start does not belong to production.
- On a separate all-intra 25 fps MP4, paused positions 2001 and 2039 settled at 2000, and 2041 settled at 2040. On aligned seeks the decoder held 2040 or 2080 for 250 ms. One Play from the stable paused reading 2080 reported 2049 before advancing past 2080. The black, silent cover stays through an in-range Running observation. A separate control used a red marker before 2080 and green from frame 52. Its cover samples were black [2, 0, 2], and its first captured revealed frame after confirming progress was green [0, 255, 1].

## First implementation review and native findings

The first built candidate, `0066420ea4b9f38ea1d21937f86562f6a8523b2b`, held the 3600 ms trim at
3720 ms, a signed error of +120 ms. The last guarded position query went out 1 ms before Pause.
Its post-command state reads began at about +1, +78 and +120 ms. Program samples showed the prior
blue clip, black cover and green replacement. The red pre-in marker stayed out of the samples.
The candidate then stopped on native `SetGain` refusing the floating-point text `5.999999999999998`.
The settings hashes matched their originals and vMixService stayed running.

A separate native check found that `SetGain`, `SetVolume` and the fader part of `SetVolumeFade` accept
integer text and refuse fractional text, including `6.0` and `70.8`. Whole fader 70 gave XML volume
24.01%. The adapter rounds after applying the equations in Rule 4. The cue keeps its saved dB and
linear gain values. A verified short fade sends its requested duration. The 40 ms minimum applies
when superseding a pending native ramp.

The first product review found a shared timing and ownership gap. The repair preserves an unresolved
black cover on the native GUID across failed seeks and requires a newly confirmed Take to reveal it.
Every background write checks the captured root and peer identity, and samples the selected
position as the final scalar. A held trim can finish its fade while the clip is paused. A faded Out
also pauses a trimmed clip at its out point while the fade settles. Controlled fake traces cover
short Loop, a changed containing root, a rewind between reads, contradictory selection markers,
0/0 timing and the short-fade or conflicting-ramp cases.

The Windows owned fixture then ran the second candidate,
`ddff59d774152fdda9305fbb4e107952bd6ebe16`. Thirteen replacement snapshots showed the old blue clip,
eight black samples and the revealed green clip. Hold reached 3640 ms for an out point of 3600 ms.
The +6 dB tone rose from 0.126 to 0.255. From full volume, the one-second Out reached alpha zero
at 1005 ms, reported native volume 0.02073608 at 1003 ms and confirmed hard zero and a zero
meter at 1051 ms. Removal followed at 1092 ms. The private settings were restored by hash.

A second independent review reproduced an unsafe trimmed Resume, a newer nonzero scalar being
missed before Clear, and the entrance changing ownership on Loop, held ending changes or overlapping
replacement Takes. The revised lifecycle keeps the observed player presentation on the native GUID,
separate from cancellable, generation-bound playback work. Take, Loop and Resume share the guarded
trim start. Resume refuses a sampled position outside the half-open trim. A short Loop mutes the
verified player through its stopped seek and restores the captured mute state after an in-range
Running observation, carrying the same elapsed entrance. Ending changes preserve a held entrance.
Clear checks unique GUID, stopped state, boundary and any required audio zero in its final predicate.
An observed duplicate GUID fails the compact guard even if its other attributes differ.

A vMix 29 25p diagnostic sampled Clips, Audio with Audio Auto off, and an initially muted Clips
input. Keyed AudioOff held the routed master meter at zero through Pause, the settled 2080 ms
seek and covered Play. The original 1.8-second fader ramp continued in all three cases to volume
100. AudioOn restored sound where the input started unmuted. An originally muted input stayed
silent. An interleaved AudioOn was acknowledged immediately, while the mute-conditioned
XMLTEXT predicate rejected the changed state at 107 ms, after still accepting it at 79 ms.
The guard describes observed state, and vMix has no atomic compare-and-set. Both original
settings hashes were restored and vMixService stayed running.

Whole XML and compact XML can briefly disagree after Bridge removes its own confirmed prefix.
On `1eff5c53afb8064f2d94801b971fd5a96cb47a3c`, the complete native XML had the new sole
selected item while the compact index-only and both GUID-specific occurrence predicates still
missed. A key-only scalar saw the older position. Both complete occurrence predicates matched
on the later sample, about 339 ms after the native ListRemove acknowledgement. The checked
foreground handoff starts only after Bridge acknowledges its own selection or list removal
and complete XML proves the exact successor. A native not-found response can wait within
450 ms of acknowledgment, including each reply. Malformed or failed transport, another
native refusal, or a proved contradictory occurrence or phase ends the handoff. A trimmed
replacement remains black and muted through the handoff and needs a valid in-range
position before reveal or automatic work. A known accepted unmute can be reversed only
if fresh exact evidence shows the same occurrence is outside its trim.

On `a2556c6ed15b03f557e515267140e5f42929ab57`, 21 Program samples followed the old blue
clip through black to the green in-range clip. Hold stopped at the requested 3600 ms.
The +6 dB tone rose from 0.11246 to 0.25472. The one-second Out reached black at 1003 ms
and volume and meter zero at 1203 ms, then removed the list contents at 1219 ms.
A supplementary Loop attempt from an empty list stopped without Play, because an exact
compact read missed the newly selected stopped file just after the full reading confirmed
it. Both original settings files were restored by hash.

Each timed reveal requires the current exact playback phase and its intended audio level.
Fade-in proves hard zero while the captured mute is still in effect, and proves zero again
before dispatching its sole native ramp. A paused or completed restore binds the exact
frozen position that was observed. Ordinary V5 Takes continue to use their existing native
reads. An explicit faded Out reserves time to confirm the result within the original 7-second
request, refuses an impossible duration before replacing prior work, and expires at that
deadline even while its deferred turn is waiting. Automatic post-Take work keeps its
per-step deadline.

The foreground handoff also applies to gain-only Takes that use native cover, and to a
replacement that inherits cover or an interrupted ramp. Compact replies must arrive as
bounded, valid UTF-8 lines ending in CRLF. A malformed success or not-found reply grants
neither a write nor a retry. An interrupted exit follows one restore on current and
legacy Pause or Resume when its held occurrence is confirmed. A trimmed Resume proves
Running in range, finishes the intended fader reset while still muted and reveals once.
An ongoing entrance carries its original ramp. An originally muted Clip remains muted.

The first compact proof also covers an own SelectIndex from an empty list when that
Take needs compact evidence. A known stopped exit can survive the outgoing request
expiry as an observation on its original occurrence and mixer connection. A manual
Pause or ending change rechecks that same frozen state and position before taking
over the settled output. It captures mute before restoring the level when the
outgoing operation had only blacked the picture. An unresolved cover or a moved
stop grants no reveal. Both Resume forms cover and reset a stopped active exit
before Play, then prove Running and the intended fader before reveal. A trim at
its out point still refuses Resume. A caller requiring Running cannot substitute
a native Completed sample as authority for its reset.

A reveal commits the final exact native state, position and mute after its writes. Timed
Take, Loop and Resume attach their work to that evidence. A raw Running observation
while muted is provisional. The player can retain that selection after partial cleanup
without granting timed authority. A verified Bridge-imposed mute can be carried across
a refused level restore for the same frozen exit. An operator-imposed mute grants no
Audio Resume. On empty retirement the Bridge restores an affirmatively owned mute once
if still needed. An already restored route or an externally muted empty player needs
no write.

The covered Loop rechecks its boundary before setting alpha and before the separately keyed
mute write. A naturally completed clip can finish its original entrance on an ending change.
An interrupted fade retains its physical presentation even when an alpha write is refused after
the fader settles. A subsequent Take can reveal only its own confirmed occurrence.

## Routing rules refined after implementation review

A V6 cover checks the exact current mute against its latest known source before
blacking, muting, seeking or playing. NoaCG Audio requires an unmuted route or the
same occurrence still muted by the Bridge. NoaCG Clips preserves the operator's
observed mute. A fresh unmuted observation replaces an older route decision.

Only an acknowledged AudioOff followed by an exact muted reading establishes
ownership of the temporary mute. An unmuted reading, changed occurrence, media
folder or mixer connection retires that ownership. The Bridge can carry its
verified mute to the observed successor of its own acknowledged list edit in
the same action. The same proof governs empty retirement. An already open or
externally muted empty player receives no AudioOn. Timed playback reports
success and arms its clock only after rechecking its intended route on the
final native occurrence.

During an acknowledged covered list change, a readable state can show its exact
predecessor while the change is pending. The first exact successor carries the
temporary mute. A later predecessor, a third selection, a missing input or a
different type stops the handoff. A confirmed unmute retires its authority as soon
as the Bridge observes it, including while checking other state for the same
response. Compact absence remains bounded to the accepted observation window.

An initially hidden Take retains its exact selection for cleanup. Public state
uses occupied, unidentified player state until the Bridge verifies reveal or
dispatches a verified entrance. Before that point the selection cannot supply
a cue, instance, segment or automatic timer. A V5 Take observed playing retains
its visible identity if prefix cleanup partly fails.

Every valid full native snapshot records a confirmed unmute, a foreign or
missing occurrence, or a changed connection before any state, readiness or
media checks. An acknowledged list change admits its predecessor and successor
only for its own input. The pre-append Pause requires the same selection
throughout. A confirmed foreign occurrence, changed timed connection or
contradictory measured loop or duration retires the old timed instance. A
confirmed nonloop rewind over 750 ms compares against the highest trusted
position and retires the instance in either full or compact reads. Only an
own seek or reveal with positive confirmation rebases the nonloop checkpoint. Unreadable playback, 0/0
timing or loss of expected Audio mute readback disarms work and preserves the
passive instance and position checkpoint. A readable change from a frozen exit
state or position ends its restoration authority even if that state later
returns. An acknowledged live ending permits the planned Loop flag change.
The same sample still confirms the selection, duration, route, position and
any frozen stop. Exact compact witnesses check continuity before presentation
and transport writes, including faded Out and Resume. After its own acknowledged
seek, the Bridge carries the confirmed local position through covered Play
and reveal before committing the new checkpoint. Removal requires the same
exact stopped position as its final state and hard-zero check, when required.
Native Loop wraps remain supported.

## Verification, release and rollback

- Use the existing fake TCP server with a controlled clip clock and a reference trace based on the Rules. Check guarded wire skew, command order, settled and relative positions, native and Bridge endings, fade ownership and endpoints, gain reset, paused time, delayed and unknown results, the port read budget, and stale work queued before a later action. Include a loop seek that rebounds, and a Clear armed inside 40 ms during another native ramp. Record the configured and actual sound and picture endpoint timing and removal. Keep the browser check in the existing playout-cues journey and run it through the shared Windows queue.
- For the idle local vMix 29 Trial, use two synthetic clips with identifiable frame positions and a tone in a private startup preset already showing the player. Check GUI and port ownership first. Read Program snapshots around a replacement Take and a fade to black. Record Pause error from the requested out point, volume samples across a full-level `SetVolumeFade`, and the measured effect of +6 dB. The test sends no Program, Preview or transition function. Restore `last.vmix` and `user.config` by hash, and leave vMixService alone.
- Bridge 0.12.0 is the newest version on main and GitHub at this checkpoint. The intended release is Bridge 0.13.0 with operator notes at the top of `cli/BRIDGE_CHANGELOG.md` and incremental coverage in `docs/BRIDGE.md`. The independent checker verifies `release-bridge.yml` and the Windows download asset on the exact merge.
- Previous verified main SHA is `6da76c942cc19136b67ed0235d8074733b129257` (V5). Revert the landed change with `git revert -m 1 <V6 merge SHA>` through the merge queue. Release and tag records follow the separate Bridge release procedure. No migration is planned.
- At this checkpoint, the #1967 cf13 hold ended on 2026-11-09 at 19:50 UTC. #2285 is closed. Open #2573, #2569, #2552 and #2423 share no planned path. Recheck allocations, the hold and `sideEnds` against the actual PR files before queue admission.
