# OS2: First laptop test, evidence

Acceptance AC-13 (`docs/work-specs/obs-scenes/spec.md`). Owner phase, run on the owner's Windows
laptop on 2026-11-12 with the checklist and receipt template in `phase-OS1a.md`. An agent drove OBS
on the owner's behalf; the owner answered the open lines on 2026-11-13. Recordings were deleted
after reading.

## Receipt

```
OS2 receipt
OBS version: 32.2.1 (obs-websocket 5.7.4, obs-browser 2.26.9, CEF/Chromium 127), Windows 10 22H2
Laptop (CPU, GPU, RAM): AMD Ryzen 7 5800H, NVIDIA GeForce RTX 3080 Laptop GPU, 16 GB
Scenes loaded (n of n, 1920x1080, 60 fps): 12 of 12, after one refresh (#2474)
1. 20 min cutting - frames skipped (encoding lag):     pass (0 of 72,037)
   frames missed (rendering lag) <= 0.1%:               pass (value: 0.001%, 1 of 72,038)
   average render time <= 8 ms:                         pass (value: 1.14 ms mean, 2.9 ms highest sample)
2. Stale frame, Studio Mode preview, 10 takes, old frames seen:  0 (pass)
   Stale frame, default transition, 10 takes, old frames seen:   11 faint frames, under ~10% opacity (information, see D9)
   Stale frame, direct Cut, 10 takes, old frames seen:           12 full frames, 1 or 2 per take (information)
3. Stinger start / cut point / on-program event, 10 times:       not run (no stinger file yet; information)
4. Sign-in inside a Custom Browser Dock:                          pass (owner, 2026-11-13: email and password; still signed in after an OBS restart)
5. Load failures, and the show PC repeat:                         none
6. Hand-written or imported graphics rest on air when taken:  not run (none exist yet; moves to OS7)
```

## How it was run

- A separate OBS profile and scene collection: 1920x1080 base and output, 60 fps, x264 recording.
- Twelve scenes, one per scene link of a placeholder production (two graphics in one scene, one in
  each other), each with a looping 1080p video as load, a webcam and the scene link on top.
- Item 1: Studio Mode, a 300 ms Fade, the next scene into preview every 5 s and a transition, 240
  takes over 20 minutes with recording on. OBS stats sampled every 5 s.
- Item 2: the changing value was a running countdown. Its scene was taken from an opaque scene
  after at least 5 s away, so every take had a value its kept picture did not show. Three
  recordings at 60 fps, read frame by frame in the countdown's box.

## Findings

- **Load is far inside the limits** on a machine weaker than the show PC.
- **The stale frame is OBS keeping the last picture of an off-air browser source**, as measured in
  `docs/OBS_ON_A_REAL_HOST.md` §11. At 60 fps a Cut shows it for one or two frames; a 300 ms Fade
  shows it faintly in its first frame; Studio Mode preview shows none. Only a graphic that changed
  while off air can show it. Owner decision (D9, amended): direct cuts and fades are supported, and
  graphics that change off air go in one shared source added to every scene that shows them. AC-14
  now checks that rule in OBS.
- **A scene link added before its production is published stays empty until refreshed:** #2474,
  fixed with OS3.
- **Browser source memory grew from 454 MB to 868 MB over 20 minutes:** #2475, measured over a
  show-length run before OS7.
- OBS's "Small" recording quality hung at "starting" on this laptop (outdated GPU driver, so no
  NVENC); "Same as stream" recorded normally. Not a NoaCG matter.

## Verdict

AC-13 as amended: pass. Load, the preview stale-frame line and dock sign-in pass; the default
transition and direct Cut lines are information under the amended D9; the stinger and
hand-made-graphic lines move to the owner rehearsal (OS7), where the stinger file and the event
graphics exist.
