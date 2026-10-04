---
kind: desktop
date: 2026-10-05
serves: now
---
# Publish output and rundown in the studio

Overnight automated checks cover the setup flow, legacy compatibility, routing commands and sound regression cases. Actual receiving software, physical channel routing and audio buses still need a studio check before on-air use. The owner authorized the overnight merge with that limitation.

Use **Duplicate production** from the upcoming production's Home card menu. Keep the original ready production unchanged. A legacy duplicate inherits its existing cues/routes and does not ask for new output setup.

1. Open the duplicate and verify its normal output URL and existing routes. If testing the new setup, use **Playout status → Setup → Change output…**, then select CasparCG or the required browser software plus CasparCG. Changing this choice must not stop or reload the active output.
2. Connect NoaCG Bridge and the selected receiving software. Press **Check readiness**. For combined output, confirm both destinations report and the configured CasparCG server/slot is correct. Old untagged links still play; readiness may call their destination unconfirmed.
3. Take a Channel 1 graphic, Channel 2 server still and video on layer 10, then a transparent video on Channel 1. Confirm the picture on the actual switcher/recording, including alpha. Uploaded NoaCG PNG/JPG images are graphics; they have not been copied to CasparCG.
4. Check a shared file route: cancel one change, then confirm Change all on the duplicate. Confirm every referencing cue and any play-through folder override still uses the intended channel/layer. Check that a still has no play-through behavior.
5. Run the [graphic sound receiving-host rehearsal](graphic-sound-host-rehearsal.md), including gain, loops, silent previews and recovery. Confirm the recording/program audio bus rather than relying on the laptop speakers.
6. Take the normal folders, Out/All out/clear, disconnect and reconnect. Confirm cue order, playback, route badges and sound are correct after recovery. Custom cue highlights must not hide ON AIR/PVW/errors or change the route badge.

Record receiving host/version, channel/layer and audio bus, plus any failed step. [Implementation and verification evidence](../../work-specs/publish-rundown-clarity/verification.md).
