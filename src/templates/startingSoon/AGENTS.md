# src/templates/startingSoon - the holding screens

## startingSoon/ - the holding screens

ss01…ss24, the HOLDING SCREEN set (prefix 'starting-soon'; hold-loop preset:
entrance + calm .starting-soon-pulse breathing + clock via shared/clock.ts). DATA BLOCKS via
convertToDataRegion (self-assembled, calls it directly): the breath imports as a looping scale
track (gap 6) and startClock/stopClock ride the step calls (docs/TIMELINE_V2_PLAN.md §3b); the clock runtime stays
outside the region.
**The category is every screen shown while the show is NOT happening** - before it starts,
between its parts, when it breaks, after it ends. A design declares three things and the
assembler does the rest: `lineCount` (how many #fN spans its markup carries, default 2),
`clock` (`minutes` | `start-time` | `none`), and any `extraFields`. The clock fields land AFTER
the lines, so a 2-line minutes design is f0/f1/f2 exactly as before and every existing variant
emits byte-identically.
**A design that draws MORE than the digits defines `clockPainted(secondsLeft, totalSeconds)`**
and the shared clock runtime calls it on every paint - the idle preview before the first
`play()`, each tick, a pause and a resume alike. `ss21` "Minute Rule" is its one user and the
reason it exists: its minute graduation and traveller are a picture of the same truth the digits
carry, so they are never counted separately, and a design polling on its own would have to guess
all four of those moments. A screen that only shows numbers defines nothing and emits nothing.
**`ss21` also overrides four of the assembler's box defaults on purpose** (anchor, transform, hug
cap, centred text) because its instrument has to span the FRAME rather than a centred column -
the one design here that is not a column, and the reason those four are worth knowing about.
**THE FAMILY GROUND IS A LIST OF IMAGES AND NOTHING ELSE.** `holdingBackgroundCss` lands its
per-family value in `background-image`, which takes no position or size: one stray
`/ 26px 26px` drops the whole declaration and the frame falls back to the neutral base, silently.
A design that wants a layer tiled sets `background-size` itself, as ss22 does for its halftone.
The three game-show families (ss22-ss24) each end their list with a solid wash of a palette
colour, so the Style panel retints the whole frame.

**`clock: 'none'` is a design decision, not a gap.** A technical pause cannot promise a time
and a sign-off card is not waiting for anything, so those screens emit no clock fields, no
clock element and no clock runtime, and ship on the `hold-still` preset (the hold loop with the
countdown calls removed). Swapping a clock preset onto one after creation degrades to "no
countdown" rather than throwing: the interpreter resolves a step's `calls` by NAME and treats a
missing function as a no-op.
