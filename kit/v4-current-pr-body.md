Operators can browse the Bridge media folder and take vMix clips and audio from the same rundown. The cue editor names the player, and Playout Settings shows and changes the media folder.

**Risk** Player controls act on the mixer's current selection. Each request checks the current pairing and cue ownership, and the page orders requests to the same player.

## Rules

- A vMix item keeps its adapter and relative media name, with layer 0 and no channel. CasparCG records keep their existing routes.
- Only the production's current system can send. Replacing a cue retires the old cue's controls. An uncertain action retires the affected player without retrying the action.
- A delivered pairing change retires vMix ownership, status, capability and pending media reads before a subsequent action or reply can use them. A known current media capability allows a direct action.
- Choose folder requires the displayed pairing to still be current. A changed or uncertain root invalidates readings for its originating Bridge. Settings displays the path after a fresh Bridge read. Cancellation and definite refusal retain the previous reading.
- Readiness and metadata checks use the file's adapter and verify each vMix parent and leaf name exactly. A stale picker or nested lookup cannot send or accept rows using another pairing.
- The editor names NoaCG Clips or NoaCG Audio and gates playback settings by capability. V5 adds mixer observation and the clip clock.

The independent Rules review, subsequent reassessments, verified V3 starting point and rollback are recorded in the [V4 evidence](docs/work-specs/bridge-vmix-adapter/evidence/phase-v4.md).

- An accepted All out can finish after leaving the production. The Bridge cuts only the original player instance, after verifying it in the same turn. A changed pairing or a replacement cue ends that authority.

## Verification

Current-main reconciliation at 5b7300b6bfd452da0504e1199fc69351d18c1021 preserves OBS scenes and the automatic-publishing send guard. The exact independent review passed at A. GitHub Codex completed with no findings. The affected Windows gates and 932 Node tests passed using the exact committed line endings. Studio typecheck, focused lint, Bridge build and 36 fake-vMix Bridge tests passed.

Windows Chromium j-5251 ran all 24 tests successfully. Playwright wrote a passing report and listed every passing case. The queue record retains its missing wrapper exit code. Previous j-5242 ended before a verdict and remains separate. Normal PR CI 43638046576 selects all 62 configured specs and is under observation.

V4 has no Bridge version or release.

<!-- noacg:queue-merge -->
