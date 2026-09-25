# src/templates/lowerThirds - the lower thirds and the specialist pack

## lowerThirds/ - the straps

### specialist/ - ls01…ls41

ls01…ls41, the SPECIALIST pack: lower thirds drawn for ONE
production rather than for any show (interview duos, host-and-guest, commentary booths,
athletes, esports, worship, academic, politics, analysis, music, live-and-location, creator,
and the BROADCAST-JOURNALISM group ls33-ls40, whose subject is the words or their status
rather than the person: a quotation, an interpreted line with a language tag per line, a
caller on the line, a location slate with a computed hour, breaking and developing marks, a
fact-check ruling, and the parliamentary register).
Mechanically ordinary - same category, assembler, preset bank, export path - and they carry NO
discovery metadata of their own: browse/search facets come from the ONE taxonomy
(model/taxonomy.ts + templates/templateMeta.ts), so a design is declared there like any other.
`specialist/shared.ts` holds what the pack cannot repeat per file:
- `slot`/`slots`/`hasLine` - place a line BY INDEX into a named slot. An absent line emits
  NOTHING (the operator can delete any row, not just the last), so a design closes over the
  gap instead of reserving a hole. This is what makes the pack survive missing optional roles.
- **The two-person contract.** `duoSplitBalanced` for PEERS (the interview straps: fewer
  lines drop the ROLES first, so both people stay named - "two names, no titles" is a real
  broadcast format) and `duoSplitLed` for a LEAD + SUPPORT pair (host-and-guest: the lead is
  completed BEFORE the second person appears, so dropping to two lines never re-reads the
  guest's own role as the host's name). Picking the wrong one is a silent content bug, not a
  layout one. `duoGridCss` writes the structural half once: content-sized `auto` columns
  (a symmetric grid pads a short name out to a long one's width), `min-width: 0` on each
  column (a grid item refuses to shrink by default - that is what pushes long names off the
  safe area), a per-column cap so an extreme value wraps in its OWN column, and
  `align-items: start`. Browser-verified with a 55-character name beside a two-character one.
- `liveClockJs` / `zoneClockJs` - design-owned clock runtime (emitted OUTSIDE the marked
  region via `runtimeExtraJs`, DOM-ready guarded, the corner-bug doctrine). The zone clock
  reads a UTC offset from a HIDDEN input-only field on every tick, so one template is any
  city's clock.
**THE ACCENT RULE this pack pinned:** a design declaring `hasAccent: true` must emit its
`.lower-third-accent` node UNCONDITIONALLY. The animation data keyframes it by selector, so an
accent that comes and goes with a field leaves the timeline addressing an element that is not
there - `validateTemplate`'s `anim-data-target` warning catches it, and it caught six designs
here. Make the CONTENT conditional, never the node.
**AND THE CLIP RULE:** bounding an atomic token cell (a squad number, a party tag) needs the
bound on the SPAN - `max-width` + `white-space: nowrap` + `text-overflow: ellipsis`.
`overflow: hidden` on the WRAPPER clips the PAINT but not the layout box, and the runtime
bench measures layout - so the token still collided with the name beside it.

**DO NOT SET A LOWER THIRD'S TYPE VERTICALLY.** `writing-mode` is used ZERO times in this
category and that is the correct number, not a gap. lt65 "Edge Rail" was drawn as the side-column
silhouette the catalog lacked, passed every gate, and the owner withdrew it on sight
(2026-08-23): *"the text is vertical, so it's the wrong way... no one would turn their head to
read the text."* A lower third is read in about three seconds while somebody is talking; turned
type belongs to things a reader has time with - a spine, a poster, a festival bumper. A taller
frame does not rescue it, because vertical is vertical at every aspect, and the silhouette cannot
be salvaged by setting the same rail horizontally: a name needs a much wider column, at which
point the design IS lt64 "Portrait Column". **The whole shape is closed, not just that design.**

**THE MEASUREMENT THAT ARGUED FOR IT WAS SOUND AND THE CONCLUSION WAS STILL WRONG**, which is the
part worth carrying. `card-look-sweep` reported one silhouette across 96% of the category and
`writing-mode` at zero uses; both were true. An instrument can tell you a shape is ABSENT. It
cannot tell you the shape is WANTED, and reading the first as the second is how a session spends
a day drawing something the catalog was right not to have. Ask what the absence is evidence OF
before treating it as a defect - the same trap as a threshold that fits the data perfectly and
asserts something nobody holds (`src/ai/AGENTS.md`, the withdrawn rule 5).

**A HUGGING DESIGN IS BOUNDED ON ONE AXIS ONLY - THE ONE ITS TYPE RUNS ALONG**, and that outlives
the design that found it. A strap hugs sideways and the assembler's wrap cap bounds it there, so a
long name wraps instead of leaving the picture; nothing bounds the other axis. Any future design
that hugs vertically - a roll, a column, a rail - states its own bound, and states it as a
FRACTION of the frame (`vh`) rather than in px, because the anchor insets are percentages so the
safe run is resolution-independent. The retired rail used `calc(78vh - var(--accent-weight))`:
2 x (50% - 11%), the mid-zone case, which binds tighter than top or bottom.

The gate is `e2e/catalog/long-value-containment.spec.ts`: a 51-character name through every lower
third, measuring the TEXT against the safe area (the owner's 2026-08-23 ruling lets a decorative
panel bleed, never a word). **Its first draft asserted the FRAME and could not fail** - every
design in the category keeps text on the frame at 51 characters, including the one that was
broken - which is why the threshold is where it is, and why it is mutation-tested rather than
merely green.
**A DEDICATED MARK VARIANT OF A SLOT-CAPABLE SIBLING IS THE SAME CARD TWICE.** Four designs
(lt23, lt29, lt36, lt47) existed only to answer "this strap, with a leading/trailing mark" -
and their plain siblings (lt02, lt25, lt32, lt15) already carry the shared optional logo slot.
At default render, where no mark is set, each pair measured near-identical off the pixels
(`card-pair-sweep`, 2026-08-28), so all four were retired along with lt10 and lt21 (rendered
twins of ls16 and lt27). Before drawing a design whose one difference is where an optional
mark parks, check whether the sibling's `logo: 'optional'` already answers it. Retired ids are
never re-minted; the list is in index.ts's header.

**RETIRING A DESIGN IS A RENAME WITH NO COMPILER BEHIND IT** - grep `e2e/` for the design's NAME in
the same commit. A spec picks a design by its display name (`pickDesign` fills the Browse search box
and clicks the first matching card), so a retirement leaves the spec compiling, passing review, and
then waiting a full 60-second timeout for a card that no longer exists. Retiring lt10 "Soft Stack"
did exactly that to `flows.spec.ts`: four CI failures across three branches over the next three and a
half hours, each reading as `locator.click: Test timeout` in a shared helper - which looks like
flakiness from the outside and was filed as a flake until it was traced back
(`docs/CI_STABILITY.md` class 5).

### The shared bank - lt01…lt67

lt01…lt67 on shared.ts (prefix 'lower-third', `dataRegion: true` - the
first category to create as NOACG_ANIM data blocks) + animPresets.ts (the shared marked-region
GSAP preset bank, prefix-parameterized - it animates any category's `.{prefix}-box` structure;
on a data category the preset's emit is converted at create, and blocks/presetApply.ts derives
keyframes from the same emitters after). The bank leads with the **Slide family**
(`makeSlidePreset`: slide-up/-down/-left/-right - one choreography, four directions of travel,
ids adjacent + `SLIDE_FAMILY`/`isSlidePreset` so pickers group them: the wizard renders ONE
Slide card with a direction picker, the Inspector one optgroup), then line-reveal, mask-wipe,
pop-spring, snap-stinger, blur-in, fade, flip-3d.
