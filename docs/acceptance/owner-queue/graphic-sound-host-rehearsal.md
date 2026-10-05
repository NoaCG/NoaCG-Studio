---
kind: desktop
date: 2026-10-04
serves: now
---
# Graphic sound on the receiving host

Browser proofs cover the Web Audio graph, packaged OGraf component, levels, recovery and
cleanup. They do not prove the venue's audio route or recorded picture/sound skew.
The 2026-10-05 studio report confirms native CasparCG audio files and video audio already
reach the broadcast bus. The remaining question is attached graphic sound through the HTML
producer. Hold the evening reliability branch before deployment; follow its
[operator guide](../../work-specs/studio-evening-reliability/operator-guide.md) on a test route.
Rehearse each host used for the production: OBS Browser Source, vMix browser input,
CasparCG HTML producer, or the external OGraf renderer. Record host/version and routing.

## The route, under a minute

Open the production in Playout, prepare its output, and open the program URL in the receiving
host used at the venue. Route that source's audio to the recording bus before taking a graphic.

1. Prepare the production output until Ready. Route its audio to the actual recording/program
   bus. Keep the operator monitor and previews silent; audition a clip deliberately.
2. Record In, Next, early Out, accepted correct/wrong answers and a refused answer. Check one
   sound at each accepted move, none at the refused move, and the recorded picture/sound skew.
   Compare the same clip at 0 and -12 dB; confirm adequate headroom when layers overlap.
3. Run countdown, pause, resume, reset, repeated Take, normal Out and All out. Pause/reset/All
   out must stop ticking; resume must start one loop. Normal Out may finish its own sound tail.
4. Reload or reconnect mid-countdown, republish, replace/remove the source, and change scenes.
   Recovery must play no old stings and restore at most one active loop. Removal/disposal must
   leave no audio. OBS program/preview switching and CasparCG route behavior need this check.
5. After Ready, temporarily block asset Storage access and repeat In, quiz and countdown
   actions. Prepared effects must still play. Restore access before preparing changed assets;
   hosted commands still use their existing backend connection.

For production-shared attachments, select the visual in Playout and expand Sounds below its
normal fields/actions. Check an image and a quiz, reuse the same file on several triggers,
then save/reopen and publish. [Implementation evidence](../../work-specs/playout-shared-sounds/verification.md)
distinguishes the browser/package proofs from this physical rehearsal.

Loops restart from the clip's beginning on resume/recovery; phase continuity is not promised.
Sounds fetched by recovery are suppressed, so an outage does not produce a burst of old stings.
Browser permission or an unsupported codec blocks readiness. Enabled attachments require
real-time audio; disable them for silent OGraf post-production export. Use a short WAV for the
first rehearsal. The independent server audio workflow remains available.

Repeat attached In/Out/step sounds on graphics routed to channel 1 and channel 2, recording
ATEM program audio. Compare with the same WAV as an independent audio/effect cue. An effect
on its own layer must leave the playing video and selected next question unchanged. Record
the actual CasparCG build and consumer settings. Claim support for a host only after this
recording passes; browser capability documentation alone does not establish NoaCG support.
