# Graphic audio: current behavior and a small attachment proposal

2026-10-03. Code inspected at `5b91be155`; proposal only, no product changes.
Serves [sound with graphics](../backlog/sound-with-graphics-and-steps.md) and
[playout feedback point 3](../backlog/playout-feedback-followups.md).

## Scope and acceptance

**Why:** a quiz answer, clock warning or sting should sound with the graphic's actual move.
**Goal:** answer what works today and propose the smallest portable attachment model.
**Non-goals:** build audio playback, a mixer, automation, normalization or a new control surface.
**Key decisions:** reuse existing steps, transitions, asset packaging and level terminology;
keep graphics' own behavior in the graphic and cross-cue behavior in playout.
**Acceptance:** distinguish code, prior measurements and proposal; cover folders, levels,
migration, outputs, timing and recovery; leave normalization later; account for all seven asks.

## What works today

Yes: put a graphic cue and a server audio cue in a folder, choose **All together**, and Take
the folder. This is the Bridge/CasparCG route for the audio; a browser output does not play that
server file. Files stay on the server, with NoaCG storing their names and slots.

| Claim | Grounding and limit |
|---|---|
| One press starts both kinds of cue | `togetherPlan` in `src/control/serverPlayout.ts` partitions server cues and graphics. `runTogether` awaits server cues sequentially, then sends graphics concurrently. This is coordinated triggering, not a shared playback clock. |
| Audio keeps its own ending and level | `serverAction` calls `takePlayback`; the cue supplies ending, fades, trim and gain. Loop remains native server Loop until Out. All together refuses Play next. |
| Sound need not replace video | `addPlayoutItem` in `src/model/shows.ts` defaults known audio to layer 5 and video to layer 10. Explicit slot choices still matter; two server cues on the same slot refuse the folder Take. |
| Errors are visible | The folder checks missing sources, duplicate graphics/layers, Bridge availability and per-cue capability before sending. A later member failure does not undo successes or stop the rest; results report each member, with no retry. Out/All out cancels pending sends and takes late successes off. |
| Audio and video have cue level controls | `ServerCueEditor.tsx`, `CuePlayback.levelDb` and `cuePlayback.ts`: -60 to +6 dB in 1 dB steps, reset to 0 dB. The value applies at the next Take; it is not a live fader. |
| The level is gain, not loudness matching | `takePlayback` converts dB using `10^(dB/20)`. `casparcg.ts` sends the file's `AF "volume=..."`, rounded to four decimals, and never sets persistent layer `MIXER VOLUME`. Different source loudness stays different. |
| Graphic sound has no equivalent control yet | `AnimStep`, `AnimTransition`, `AnimState` and `ControlMessage` have no declarative audio attachment. Handwritten template media is not a supported attachment/level workflow. |

The current Level control changes saved cue playback settings. Editing it while on air does not
alter the playing file. Capability checks refuse a nonzero level an older Bridge/target cannot
honor. Still files have no sound to level. A live fader remains the existing later item in
[CLIP_PLAYBACK_PLAN.md](../CLIP_PLAYBACK_PLAN.md), not a second task here.

**Prior real-server evidence, not rerun tonight:** that plan's §12 item 4 records mean levels
-23.0 and -35.0 dB for 0 and -12 dB settings, through manual Take and AUTO, on CasparCG 2.5.0
and 2.3, with layer mixer gain still 1. Item 8 records video plus its WAV within one frame on
2.5.0 and two on 2.3. That was a video/audio pair, not graphic animation/audio synchronization.
These observations do not guarantee identical starts for arbitrary media, servers or graphics.
Older phase notes describe sequential graphic sends; current `runTogether` and §20 supersede
that detail with concurrent graphic sends after the server cues.

## Proposed attachment model

Start with one optional sound descriptor on an existing execution boundary: an `AnimStep` for a
linear graphic, or an `AnimTransition` for a machine graphic. It references a packaged asset and
has an enabled flag, `levelDb` and one-shot/loop playback. One common descriptor and runtime
helper serve both. Do not infer sound from a button label, template category or incoming event.

| Need | Attachment executes when |
|---|---|
| Take / In | The entrance step or lifecycle play transition actually starts. |
| Out | The exit step or lifecycle stop transition starts, including early Out. |
| Individual step | The selected step begins; Next uses the existing ordered walk. |
| Correct / incorrect answer | The accepted authored answer transition begins, including a self-transition. Different event edges may carry different sounds. |
| Timer event | The existing timer transition executes in the graphic runtime. Its `after` currently starts after the entry timeline settles, not at the operator press. |
| Tick while running | A loop on entering the running state; stop on leaving that state. A semantic warning at a threshold belongs to the graphic's own declared timer/event logic. |
| Other template action | An authored transition or the same runtime helper in the graphic's own code. No per-template operator panel. |

Attach to the accepted execution, after the structural guard and serialized event queue, not to
the panel press. This avoids sound for illegal events, queued moves that have not started, or a
timer fired only in a controller. For a styled machine transition, sound accompanies its styled
timeline rather than also triggering the destination step's sound. For an ordinary transition,
an explicit edge sound overrides the step sound; never play both accidentally.

The first slice starts sound at animation start. Add timeline offsets only after a real graphic
needs them and a rendered timing check proves the implementation. Decoding/preload must finish
before readiness is reported; network loading on the event cannot be the timing mechanism.
Using one runtime makes tight local alignment plausible, not yet measured or frame guaranteed.

Sound instances belong to the graphic and executing state/transition. A one-shot may finish
while its graphic remains on air; a loop stops on leaving its state. Out stops previous sounds
before starting its optional Out sound; normal Out may let that tail finish before disposal.
All out, replacement, reset and disposal stop everything. Repeated Take/answer presses have a
defined restart policy rather than accidentally stacking copies. Start with restart of the same
attachment; preserve independent parallel-group sounds and test their summed levels.

Keep Take, Out, Next, quiz and clock controls unchanged. A common **Sounds** section exposes
enable/disable and level per attachment; an optional lower-third swoosh is disabled by default.
Defaults for quiz/countdown sounds are template choices. Changes stage for the next execution,
as cue level does now. A live fader would need its own measured behavior and scope.
Preview, simulator and thumbnails stay silent unless explicitly auditioned; audible program
belongs to an output instance, never the operator page's PROGRAM monitor. Multiple renderers
must each address their own output mix, without an extra duplicate sound route in that mix.

## Packaging, compatibility and recovery

- Preserve the existing optional-data pattern: no attachments means exactly today's behavior;
  do not automatically convert existing folders or import a server filename as a web asset.
- Store assets with the graphic, export relative references, and include them in publication
  readiness. Cue overrides, if needed, should reuse saved cue values and existing data transport;
  keep stable attachment identities and stage changes through the normal published/live split.
- Before choosing an additive schema field, extend parser, writer, validator, editor operations
  and runtime pairing together. Old runtimes must not silently lose enabled sounds. Preserve
  references through step reorder/duplicate/delete and save/reopen; no copied index binding.
- For hosted reconnect/replay, snap and `skipAnimation`, suppress historical one-shots. Rebuild
  loops only for the current active state, once. Do not trust visual recovery to recover audio
  automatically; the existing code has no such audio contract.
- Keep separate server cues for long beds and independent files. Do not mirror every graphic
  event into a second AMCP command: it would introduce another clock, network race and lifecycle.
  A target lacking graphic audio must report that limitation before live use; fallback is an
  explicit existing audio cue/folder, with its looser timing, rather than a silent substitution.

## Output facts and unresolved checks

The [OGraf v1 specification](https://ograf.ebu.io/v1/specification/docs/Specification.html)
allows referenced resources and executable web graphics, with play, stop, custom actions and
disposal. It does not give a portable audio capability guarantee. The
[published manifest schema](https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json)
has no audio requirement field; vendor extensions use `v_`.
[EBU issue 30](https://github.com/ebu/ograf/issues/30) still proposes renderer audio capability.
Therefore packaging a sound resource is a reasonable implementation direction, not proof that
every compliant renderer routes it to an audible output.

[OBS's browser-source documentation](https://obsproject.com/kb/browser-source) explicitly
includes audio, and documents unload/refresh on visibility changes. This supports a target
prototype, not proof of NoaCG attachment playback. Test source audio routing, enablement,
scene changes, preload, gain and the absence of monitor duplicates in a real OBS host. vMix and
CasparCG HTML-producer audio must be checked on supported host versions and output consumers;
tonight's server-file measurements do not establish HTML/Web Audio support. No universal
CasparCG version claim is made here.

Keep real-time and offline export separate. NoaCG currently rejects `<audio>`/`<video>` for
non-real-time export (`validateOgrafOfflineCompatibility` in `src/export/targets/ograf.ts`).
[EBU issue 77](https://github.com/ebu/ograf/issues/77) proposes a separate offline audio API;
it is not the implemented v1 contract. Initially require real-time sound support or an explicit
silent offline export; never advertise offline audio solely because image seeks work.

## Smallest next implementation and proof

1. Prototype an imported linear graphic and a branched quiz with the common descriptor/helper.
   Verify enabled/default-disabled, In/Out, Next, accepted/refused answers and early Out.
2. Prove one countdown loop, pause/stop/reset and warning transition with the existing clock
   semantics; exercise repeated presses, interruption, parallel groups and cleanup.
3. Package/save/reopen/publish/export and prove the supported audio paths in real hosts. Measure
   recorded picture/sound skew and gain; test reconnect/replay silent one-shots and single loops.
4. Only then expose the shared Sounds controls on the existing surfaces and record target limits.

Normalization stays in [the later feedback plan](../backlog/playout-feedback-followups.md).
No normalization target, codec policy, host-audio guarantee or new runtime is chosen by this note.

## Verification record

Code and prior evidence above were inspected; primary references checked on 2026-10-03.
`node --test scripts/server-playout.test.mjs scripts/folder-playout.test.mjs`: 58/58 passed,
including server-before-graphics, concurrent graphics, gain descriptors, capability refusals and
Out cancellation. `node scripts/owner-receipts.mjs --check`: passed, 67 receipts.
`npm run build`: exit 0 with approved host permissions, including 2,413 passing tests, zero
failures and three skips, plus type checks, lint, dependency checks, bundle and documentation
gates. The initial sandbox attempt failed on shared Git and process-fixture permissions; the
same unmodified checks passed on the host. `git diff --check`: passed.
Review ran inline over these three documents against `5b91be155`: one missing owner receipt
was fixed. Simplification ran inline, replacing old research questions with the remaining host
and timing proofs. No browser, backend, real-server recording or audible host walk was performed.
