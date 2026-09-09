# Two Browse derivations count designs the visitor is not allowed to see

**Filed:** 2026-09-09. **Source:** measured while refuting
`browse-page-reset-key-omits-brand-and-hidden` on `claude/b-browse-page-reset-signature`; the
backlog file that row was launched from asked for a read of the rest of `BrowseStep.tsx`, and this
is what the read turned up.

## Why

`src/templates/search.ts` has two families of catalog-wide derivation. One takes the visitor's
hidden set and one does not, and the split is not deliberate.

`browsableGroups(hiddenIds)` and `browsableCategories(hiddenIds)` honour it, and `BrowseStep.tsx`
says why directly above the call, at lines 318 to 320: a design nobody can use is removed before
scoring because it "would otherwise inflate every category count and the 'remove the most limiting
filter' hint".

The hint is not protected. `mostRestrictiveFilter(filters)` calls `browseTemplates(without)` with
no context at all (search.ts:665), so every count it compares is taken over the whole catalog. The
escape hatch on the zero-result state can therefore name the filter whose removal restores the most
designs this visitor cannot see, and pressing it lands them on a smaller result than the button
promised, or on another empty one. That is the failure the comment claims to have prevented.

The same shape sits beside it in the facet chips. `offeredIntensities()`, `offeredStructures()` and
`offeredCapabilityFilters()` all read `allTemplateMeta()` wholesale and take no hidden set, so a
chip can be offered whose only carriers are hidden - and choosing it empties the grid, which then
offers the escape hatch that has the same blind spot.

Neither is reachable today for most people: `hiddenTemplates` is empty for everyone the entitlement
service does not single out, and offline it is always empty. It gets more reachable as admin-hidden
and beta designs are used, which is what the field exists for.

## What it would take

Thread the hidden set through the five functions, the way `browsableCategories` already takes it,
and pass it at the three `BrowseStep.tsx` call sites. `mostRestrictiveFilter` needs the context
object `browseTemplates` already accepts, so its signature grows one optional argument rather than
changing shape. The facet three each grow the same optional argument.

Worth deciding once while doing it: whether an offered facet value should count the visitor's
catalog or the whole one. Counting the visitor's is what the category tiles already chose, so
matching them is the cheap and consistent answer.

## Evidence

- `src/templates/search.ts:665` - `browseTemplates(without)`, no context.
- `src/templates/search.ts:677-693` - the three facet-offering functions, no hidden set.
- `src/templates/templateMeta.ts:422-459` - the two that do take one, for the contrast.
- `src/components/wizard/steps/BrowseStep.tsx:318-320` - the comment stating the intent the hint
  does not keep.
