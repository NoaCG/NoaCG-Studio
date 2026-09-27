# components/build-playout-dashboard-desktop-production-page

Rule: `components/build-playout-dashboard-desktop-production-page`. Recorded 2026-09-27 on `claude/casparcg-playback-planning-vt214l` at fcccfc6.

Owner ruling 2026-09-27 in the clip playback planning session (docs/CLIP_PLAYBACK_PLAN.md §15, §17 item 1): loosen the rule that the phone control must look the same; focus 100% on the computer view, the phone is a nice add-on if it works.

Why a rule rather than a fix, a mechanism or a check: The old invariant made both surfaces identical in every commit, which the owner judged unrealistic once server clip playback, a resizable rundown and folders were planned: the hosted page cannot reach a Bridge, and holding every desktop change to phone parity slows the surface that shows are run from. No check can decide which differences are acceptable, so it stays scoped guidance.
