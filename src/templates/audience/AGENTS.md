# src/templates/audience - the audience graphics

## audience/ - what the people watching sent in

the AUDIENCE graphics (prefix 'audience'): what the people watching sent in.
ONE assembler, FIVE forms (`AudienceForm` in shared.ts - viewer question, Q&A card, chat
highlight, question queue, community/prayer request), 20 designs in five per-form files
(`viewerQuestion.ts`, `qaCard.ts`, …), four style families each. A form declares its FIELDS and
the runtime it needs; everything else - the attribution rules, the long-message clamp, the
style contract, the export path - is written once. Deliberate deviations from the
one-file-per-design convention, both documented in the files: the four designs of a form live
together (they are one object in four skins, and side by side a drift between them is
reviewable), and the blocks they share come from **familyCss.ts** (panel / kicker / byline per
family). DATA BLOCKS via convertToDataRegion; the Q&A card's answer is a real middle step with
`reveals` (keyframes, not a call - so a SNAP to the answered state shows the answer).
Two rules the category exists to hold: **the platform is TEXT, never a logo** (one operator
field, so the same card serves YouTube, Zoom, a church app or slips of paper handed up from the
room), and **a missing name or source renders cleanly** - `audienceRuntime.ts`'s
`audienceAttribution()` marks the root and the CSS swaps in an `.audience-anon` element whose
WORD lives in the markup, so it can be translated. The queue's live row is an INDEX in runtime
data, never a state per question.
