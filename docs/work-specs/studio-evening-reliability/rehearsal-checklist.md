# Off-air rehearsal for the studio reliability branch

Use only the isolated test build prepared from `codex/studio-evening-reliability`, test accounts
and a duplicate production. These controls are not yet in the deployed studio app. The agent
must supply the test address and finish backend/Linux prerequisites first. Keep the working
application and studio configuration available for rollback.

Bring the problematic original video and the two working originals, or their accessible file
paths. Record the Bridge and CasparCG versions. The agent compares the files and interprets
Bridge/INFO evidence; the operator does not need to run analysis or database commands.
For the known quiz import fix, also bring its original/corrected delivery SVG if available.
Export the intended artboard with Illustrator editing data disabled and the question/answers
inside the canvas. The agent checks the cleaned import's appearance and early eligibility.

Record pass/fail beside each step. An unexpected interruption ends that test; return to the
working production path and retain the recording or screenshot for investigation.

| Step | Operator action | Expected observation |
|---|---|---|
| 1. Cloud save | On computer A, edit the copied production and save a named graphic. Wait for the cloud-saved state, then open the account on computer B. | The same rundown and graphic appear after cloud reconciliation. A pending or failed write never says cloud-saved. |
| 2. Pending saves | In the test build, temporarily disconnect A, edit, reconnect and check B. The agent handles session-expiry testing separately. | A clearly says Not saved to cloud while pending. Reconnection either confirms the revision or shows a recovery/conflict state. |
| 3. Attached audio | Record ATEM program audio with a short known WAV attached to a graphic's In, step and Out. Repeat on channels 1 and 2. Compare with the same WAV as an independent audio cue. | Each accepted graphic action produces one sound in program audio; monitors stay silent. Native audio is the control comparison. Record the exact host/version and result before claiming support. |
| 4. Independent effects | Play a video, select the next quiz question, then press the assigned victory/fail keys. Repeat a key deliberately. | One effect fires per press on the effects slot. The video continues, selection/preview stay on the question, and holding the key does not repeat. |
| 5. Keyboard safety | Type the shortcut letters in a field, open the cue menu, and try a conflicting assignment. Then close editing UI and press Space on the selected question. | Typing/menu interaction fires no effects; duplicate assignments are refused/disabled. Space still performs the displayed action for the selected question. |
| 6. Three videos | Play each original and watch the countdown. Test its displayed Space/Out action, then Stop/Clear this slot on the isolated output. | Timing advances or is explicitly estimated/unavailable. Normal Out may use the configured fade. Clear immediately removes that exact slot, including an unidentified item, without clearing other slots. |
| 7. Readiness on air | Keep a graphic on air and reorder cues. Then change an output asset in the copy and press Publish & check readiness. Clear the output when ready to test preparation. | Reordering does not invalidate prepared assets. Status explains pending changes versus an output problem. Asset preparation defers while on air, resumes after clearing, and never blanks/reloads the running graphic. |
| 8. Stable rundown | Observe any unidentified-item diagnostic and its removal. Scroll through the mixed rundown and compare graphic/video/picture/audio cues. | Diagnostics stay outside the cue list. Existing positions, scroll and selection remain stable; cue tint, icons and route badges are legible. |
| 9. Companion, if used | After the isolated relay migration passes, trigger the same fixed cue through the test Companion module. | It behaves like the keyboard shortcut, preserves selection and does not replay a stale press after reconnection. |

Send back the failed step, what appeared on screen and the corresponding recording/screenshot.
The agent verifies expiry, malformed/stale commands, database privileges and Linux screenshots;
these are not operator tasks.
For the old home-edit incident, an account identifier, approximate edit time and access to the home
browser would help reconstruct historical writes. That investigation is separate from verifying
the new save safeguards. Do not clear home browser storage while recoverable edits may remain.
