# A panel's growth direction is chosen on a number nothing else uses

**Filed:** 2026-09-08. **Source:** measurement, during the `claude/l-panel-that-never-grows` review.

## Why

Since 2026-09-08 every room measurement for a growing panel is taken from the far edge of the
panel AND everything that travels with it (`svgMovingBox`, `src/templates/importedDesign/svg.ts`).
The DIRECTION is still chosen before that, by `svgGrowDir`, which for a vertical rule compares the
panel's own two margins and nothing else. So a plate with its followers stacked below it down to
the safe margin is sent downwards, finds zero room there, and "the panel gets taller" quietly
behaves like "the panel stays the size you drew" - while growing upwards had room the whole time.
That is exactly the class of defect the same day's work removed one layer down: an option that
does nothing on the graphic in front of you.

Not seen on any corpus file today. The owner's quiz board sends its question plate downwards and
still has 49px there, so nothing measured differently.

## What it would take

The circularity is real and is the reason it was left: the follower list is collected FROM the
growing edge, so the followers are not known until the direction is chosen. The honest shape is to
collect both candidate lists at rest (`svgFollowersOf` twice, up and down), measure the room each
way through `svgGrowRoom`, keep the side with more, and let `svgRestOneRule` store the list it
already computed. That is one extra follower sweep per vertical rule, at rest, once per pass.

## Evidence

`docs/TEXT_BOX_BINDING.md`, "The room a box has is what its followers leave it - measured
2026-09-08", and the handoff `docs/handoffs/2026-09-08-l-panel-that-never-grows.md`, which carries
the measured numbers for the board this was found on.
