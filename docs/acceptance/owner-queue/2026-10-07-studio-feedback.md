---
kind: decision
date: 2026-10-07
serves: now
---
# Independent browser outputs

Recommendation: keep one browser output for this follow-up. Prioritize independent outputs
only when a show needs a persistent scorebug and scene-specific lower thirds on separate sources.
Current destination links mirror the same output; they do not route different graphics.

OBS and vMix can use multiple browser inputs, so those use cases are practical. Supporting them
in NoaCG needs coordinated cue routing, publication, monitors, exports and readiness, including
safe reassignment while live. Extra channel controls alone would advertise a capability we lack.

Owner decision: should that separate routing feature become a priority? If yes, use those two
overlays as its first acceptance scenario. No channel controls or production migrations were added.

[Research and current implementation](../../work-specs/studio-feedback/spec.md).
