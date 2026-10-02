---
v: 2
source: derived
kind: finding
raised: 2026-09-27
state: unstarted
found: "The SPX package now says what it drops and carries the rule for a hidden field Continue writes, but SPX still cannot set that field, and the CasparCG production flavour carries the same trap without the words."
serves: NOW
size: small
touches: cli/skill/noacg-graphic/references/contract.md, src/export/showExport.ts, src/export/spxLeftBehind.ts
needs-owner: none
---
# A hidden reported field in a host that stores data

**Filed:** 2026-09-27, from the walk in `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6h. **Served the
same day:** the SPX production package (`buildShowZip`) now names, in its README and
GETTING-ON-AIR.md, the bindings and production data it leaves behind (and the combined controls,
until they were removed on 2026-10-02), with the
SPX operator's by-hand equivalent of each, and carries the SPX rule for a hidden field that a
Continue writes (the votes board's Shown: finish every field before Continue; Stop, Play,
Continue to recover). Written by `src/export/spxLeftBehind.ts`, pinned by `e2e/shows.spec.ts`
("the SPX package says what it leaves behind").

## What remains

1. **SPX still cannot set the field.** The rule is words, and the trap stays: an SPX item keeps
   Shown at `votes`, and the votes board repaints from it on every `update()`. The structural fix
   would be to offer a reported field to SPX as a dropdown of the values its controls set, so an
   operator could move Shown to `revealed` on the item and Update keeps the marks. That changes
   what a hidden field means in the export, which is a contract question for
   `cli/skill/noacg-graphic/references/contract.md` §5c, not an export tweak. Changing the votes
   board's own `update()` is not the fix: the read-back is what lets a data-only host show the
   reveal at all (§5c's reported field), so the board is behaving as the contract says.
2. **The CasparCG production flavour is not covered.** `buildShowZipFor(show, 'casparcg')` builds
   the same templates for a CasparCG client, which also stores item data and sends it again with
   an update. The same trap is expected there, not measured, and its README and guide carry
   neither the left-behind lines nor the rule. Measure it first; if it holds, the two functions in
   `spxLeftBehind.ts` are written in SPX words and would need CasparCG wording (`CG NEXT`,
   `CG UPDATE`) rather than a copy.

3. **The rule is only at the production root.** `spxReportedFieldRulesMd` depends on the graphic
   alone, but it is written only into the production package's root README and guide. A graphic
   folder's own README (`buildStarterInto`, `src/export/targets/spxStarter.ts`) and a
   single-graphic SPX export of the votes board carry no rule. Calling the same function there is
   small; it was left out of the first cut to keep the single-graphic export's output unchanged
   without a spec for it.

## Done means

For (1): the contract says whether a reported field travels to a data-storing host as a hidden
field or as a choice, and the export follows it. For (2): a measured answer for the CasparCG
flavour, and, if the trap holds, its package says so the way the SPX package does. For (3): a
single-graphic SPX export of the votes board carries the rule, pinned by a spec.
