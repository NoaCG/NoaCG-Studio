# Graphic sound shared-controls verification

2026-10-04. Code revision: 76f7ee03f3da016f0636adcd58e8c48d62f26889.
Review and simplification ran inline over the controls changes. Playback source is unchanged
from phase 1; the attached phase-1 receipt remains part of this reviewed tree.

## Acceptance

| Criterion | Result and proof |
|---|---|
| AC-1 | Pass. Phase-1 actual Web Audio proofs cover linear In/Out/Next, accepted/refused quiz and timer execution. The new saved-control scenario publishes its enabled -12 dB attachment into the actual output stage: monitor zero starts, program one start at its own gain. |
| AC-2 | Pass. Phase-1 loop/pause/reset/interruption/disposal proofs remain applicable to unchanged playback code. Audition tests stop during a deliberately held decode, prove zero late starts, and close every context on stop or leaving the page. |
| AC-3 | Pass. Phase-1 saved-state/history/refill/snap/OGraf proofs remain applicable. Controls do not send execution events or alter the applied-once delivery path. Preview audition is local and does not go to any program renderer. |
| AC-4 | Pass. Saved attachment id, enabled flag and -12 dB survive actual save/reopen. Editor upload plus descriptor is one undo/redo transaction; asset rename retains the binding. Bad/oversized bytes cause no mutation. Phase-1 package/import/published-byte and runtime-readiness proofs remain applicable. |
| AC-5 | Pass. One Sounds component serves saved graphics and the editor: attach/remove, enable/disable, -60 to +6 dB/reset, state/step loop or edge one-shot, and explicit audition. New attachments start disabled. Actual output stage measures monitor zero/program one; authoring frames have zero starts. Image/motion/server regressions hold. |
| AC-6 | Pass for evidence distinction. Chromium and the packaged OGraf component are machine-proven. Physical output-host routing and recorded skew, signed-in backend upload and codecs beyond the tested WAV remain unverified. The receiving-host checklist remains open. |

## Checks and observations

- Queued j-3263, npm run build: exit 0; 2,433 passed, 3 skips. Types, lint, dependency rules, bundle, 526-page prerender, client-secret and line-ending gates passed on the final code revision.
- node --test scripts/sound-edit.test.mjs: 2/2 pass. Invalid Out/edge loops, duplicate ids,
  bad levels, future data and incoming-edge/loop conflicts refuse without losing source.
- Queued j-3247: all 6 controls browser scenarios pass, including actual sandboxed output
  frames, real AudioContext decoding/gain, durable reopen, undo, rename and decode cancellation.
- Queued j-3240: 23 existing image/motion regressions pass. Two new scenarios initially
  failed: an incorrect parent-side sandbox probe, and a real phone overlap. The probe was
  moved into Playwright frame evaluation; the sandbox is unchanged. The overlap was fixed
  by keeping expanded sections in normal scrolling flow. Neither assertion was weakened.
- Queued j-3249 final affected suite: 621 passed, 249 existing skips, one SVG grow-axis gesture failure at import-svg.spec.ts:2249; the catalog calibration gate passed 35/35. The unchanged scenario passed with trace in j-3256 (2.9s test) and on the playback parent in j-3257 (2.6s test). Its final click did not register in the broad run; the cause is not established. No fixture, assertion, deadline or retry was changed. The broad command exited 1 and is not recorded as green.
- All six prescribed catalog gates pass, plus emit verification for 528 variants. j-3260 completed type floor 526, overflow 528 and field coverage 526 (105 explicitly not driven), then was cancelled to give the remaining gates correct server lifecycles; the cancelled job is not a global pass. j-3262 exited 0: numerals 349, catalog specs 35 + 4, and factory 317/317 candidates.
- Screenshots inspected at 1366px and 390px: move/asset selectors, enabled, playback, level,
  reset and audition fit without horizontal overflow. Console/page errors and local HTTP
  error responses are empty. The editor's 230px Project panel retains its existing scrolling;
  its dropdown labels fit and the running-state loop controls use the same component.
- git diff --check: pass. No health-session spec/fixture helper, server audio, default catalog
  attachment, normalization, live mixer or cue-color code was changed.

Review fixed two product defects: ordinary lifecycle-normalized data was incorrectly refused
as lossy, and expanded phone controls exceeded the saved panel's fixed preview row. The writer
now compares normalized data to canonical serialization and still refuses unknown data loss;
the mobile flow fix is scoped to the saved-graphic panel.

## Limits and rehearsal

Backend tests run offline. Local publication gates, saved snapshots and output payload bytes
are verified; a signed-in cloud upload was not performed. Program playback tests assume browser
permission by the same explicit autoplay setting as phase 1. Only actual PCM WAV was decoded
and measured; other accepted codecs depend on the receiving browser.

No physical OBS Browser Source, vMix browser input, CasparCG HTML producer or external OGraf
renderer has proof from this work. Rehearse audio routing/recorded skew and gain, accepted moves,
countdown pause/reset/All out, and reconnect/source or scene replacement using the
[receiving-host checklist](../../../acceptance/owner-queue/graphic-sound-host-rehearsal.md).
Loops restart from the clip beginning on resume/recovery. Enabled attachments require realtime
OGraf and supported decoding/permission. Existing independent server audio remains available.
