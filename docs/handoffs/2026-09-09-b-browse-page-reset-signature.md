# The Browse paging defect was not a defect, and the comment that made it look like one is fixed

Branch `claude/b-browse-page-reset-signature`, from `main` at `c5840fb0`.

Row B was launched to make Browse jump back to page one when the reader picks a brand or a design
gets hidden, by adding `brandFamily` and `hiddenIds` to the paging signature in `BrowseStep.tsx`.
**I did not make that change.** It would have broken an active contract rule and shipped a
regression three days before the class. What follows is what I measured, why I reversed it, and
what I landed instead.

## What I reproduced

I drove the real step before touching anything, which is what turned the row around.

Browse narrowed to lower thirds (93 results), **Show 12 more** pressed once, then a saved glass
brand chosen in the footer chooser:

```
before brand, shown=24  first=["House Strap","Underline","Masthead","Scrim"]
after  brand, shown=24  first=["Frosted Card","House Strap","Underline","Masthead"]
count line: "Showing 24 of 93"
shown === browseTemplates(..., {brandFamily:'glass'}).slice(0, 24)?   true
any shown card NOT in the new result?                                  []
```

The reader is not left on a page of a list that no longer exists. `shownLimit` is a **depth
count**, never a page index, and the grid is always `slice(0, shownLimit)` of the current outcome -
so a result that changes underneath re-flows into the same depth. The 24 cards were exactly the
first 24 of the correctly re-ranked list, the brand's own family had jumped to the head, and the
count line was honest. There is no frame of wrong designs and no stale card, because the state
shape cannot represent one.

## Why I reversed the assignment

`contracts/rules/wizard/feed-footer-brand-chooser-browse-context.md` is active, scoped to this
exact file, and dated **2026-09-07**:

> It re-ranks without resetting the page, because the reader asked for those extra results and a
> re-rank should not take them away.

Its record is blunter still: "The paging signature is built from the filters and the sort only, so
a brand change reorders the list in place. That is deliberate; the contract used to say the page
resets on any result change, which was too strong."

So the assigned change is the wording that ruling withdrew, and landing it would have collapsed the
grid to twelve under a chooser that sits in the footer, taking away results the reader had pressed
for.

**The `hiddenIds` half is worse than neutral.** `useMyEntitlement` resolves once per mount, going
from `[]` to the fetched list and never changing again; `resetMyEntitlement` has no callers in
`src`, and offline it never changes at all. The only in-session transition is the initial fetch
landing - so keying on it would turn a slow connection into a depth reset for a reader who pressed
Show more before the reply arrived. The assigned fix would have introduced a bug rather than
removed one.

**How the misfiling happened, which is the part worth keeping.** The code comment above the key
still carried the pre-ruling wording ("reset by any change to what the result IS"). It was written
2026-08-09 and the ruling that withdrew it landed 2026-09-07, so it outlived it by a month. The
backlog file quoted that comment as the intent the code failed and never checked the rule store.
An unverified Codex claim, checked against a stale comment instead of against the app, read as
confirmed.

I took a blocking second opinion from a Fable reviewer before reversing, with the measurement and
both documents. It agreed on every point and found the sharper defect below.

## What I landed instead

**The comment now states the rule.** It says `shownLimit` is a depth, names the rule by id, gives
the concrete reason for each of the two omissions, and records that its own previous wording was
withdrawn - so the next reader does not re-file this. `src/components/wizard/steps/BrowseStep.tsx`.

**A spec pins the ratified behaviour**, which nothing did before - the assigned change would have
landed green. `e2e/wizard-filters.spec.ts`, "a brand chosen after paging re-ranks in place and
keeps the depth the reader pressed for": pages to 24, picks the brand, then asserts the depth
survives, the brand family leads, and the shown names equal the first 24 of `browseTemplates` with
that brand - the order, not just the count, which is the half that would catch a genuinely stale
page. It registers in no new place: `BrowseStep.tsx` already routes to `wizard-filters.spec.ts`
through the `^src/components/wizard/(?!import/)` rule, and the file is already in `FOCUS`. **I did
not touch `scripts/e2e-affected.mjs`.** While in there I lifted the brand-seeding walk the
neighbouring test inlined into `seedGlassBrandAndReturnToBrowse`, so the two share it.

**The measurement is on the rule's own record**, appended with `npm run learn` rather than by hand,
so the next person who doubts the rule meets the numbers where they are looking.

**The backlog file is deleted** ("graduate or die"). Nothing but a dated handoff pointed at the
slug, and `backlog/` is exempt from the docs index.

**An owner-queue item asks him the taste question**, because that half is genuinely his:
`docs/acceptance/owner-queue/2026-09-09-browse-keeps-your-page-when-you-pick-a-brand.md`. The
ruling stands and the branch lands either way - but the person who planned this wave read the
screen and expected the opposite, which usually means the call is close. It carries the four-step
route.

## What the review found, and it is better than the reported bug

The `/check` review caught that my first version of the comment overstated the case. It asserted
"a re-rank must not take away results the reader pressed for" as the principle behind omitting
`brandFamily` - **and the file keeps that principle in one case out of three.**

Browse has three controls that re-rank without removing anything:

| control | pure re-rank? | in the paging signature? | keeps your depth? |
| --- | --- | --- | --- |
| brand chooser | yes, via `BRAND_BOOST` | no | **yes** |
| sort dropdown | yes, `sortResults` only reorders | yes, by name | no |
| programme family / format | yes | yes, inside the JSON | no |

I verified the third row rather than taking it: `passesStrictFilters` (search.ts:86-96) has no
family or format clause at all, and `formatBoost` (search.ts:427-438) scores a non-match at zero
and keeps it in the result - which is exactly what the neighbouring spec `programme selection ranks
into Best for / Also works without hiding anything` already asserts.

So a reader on 36 cards keeps all 36 when they pick a brand and loses 24 of them when they change
the sort order, with nothing in the product explaining the difference. **I did not unify them.** The
2026-09-07 ruling covers the brand chooser alone, the other two are a product decision rather than a
defect, and this row had no mandate to move them. The comment now says plainly that the file does
not keep a general rule here, and `docs/backlog/browse-rerank-controls-disagree-about-paging.md`
carries the question with both sides of it. The owner-queue item asks it as the walk, since it turns
on taste rather than on mechanism.

The review also caught two things in the spec, both fixed: `expect(shown).toEqual(expected.slice(0,
shown.length))` took its bound from the value under test, so a renamed card caption would have made
the order assertion pass against an empty expectation - it now pins the length first. And the
expectation was computed from `category: 'lower-third'` while the control actually sets
`group:lower-thirds` (the shelf has one member, so `chooseType` resolves to the group); the two
agree only until a second category joins that shelf, so the expectation now mirrors the control
through `CATEGORY_GROUP_OF`.

## The sibling read the backlog file asked for

Every `useMemo` on the step, against the signature derived beside it: lines 315-317 take no
arguments and correctly have empty dependency lists; 324, 325 and 326 match theirs exactly; 335
(`outcome`) matches its three. **No memo on this step has a dependency list longer than the
signature beside it** other than the `resultKey`/`outcome` pair, which is the deliberate one above.
`CommunityGallery` reads the same hidden set but has no paging, so it does not share the shape.

**What the read did turn up is filed, not fixed** -
`docs/backlog/browse-catalog-derivations-ignore-hidden-templates.md`. Two derivations in
`src/templates/search.ts` count designs the visitor is not allowed to see, while their neighbours
in `templateMeta.ts` take the hidden set properly:

- `mostRestrictiveFilter` calls `browseTemplates(without)` with no context (search.ts:665), so the
  zero-result escape hatch can name the filter whose removal restores the most designs this visitor
  cannot see. `BrowseStep.tsx:318-320` claims in so many words that hidden removal exists to stop
  exactly that. It does not.
- `offeredIntensities`, `offeredStructures` and `offeredCapabilityFilters` read the catalog whole,
  so a facet chip can be offered whose only carriers are hidden - and choosing it empties the grid
  into the escape hatch with the same blind spot.

Neither is reachable while `hiddenTemplates` is empty, which it is for everyone the entitlement
service does not single out, and always is offline. Both get more reachable as admin-hidden and
beta designs get used. Same fix shape for all five functions, so it is one item.

## State

`npm run build` exit **0**, read from the build's own exit code, not a pipe's.

**The spec was verified in both directions, in one queued job, because the box is RAM-bound.**

- As it stands, `wizard-filters.spec.ts` is **20/20 green**.
- With the assigned change applied to the signature, **exactly one test fails and it is the new
  one** - 25 passed, 1 failed. That is the part worth keeping: nothing else in the file noticed,
  which is why the change would have landed green before today.

`npm run test:e2e:affected` - the 39 spec files `BrowseStep.tsx` and the spec resolve to - **491
passed in 9.0 minutes, no failures**, run queued over the committed tree. Both brand tests are in
it, so the new one has now passed on the exact text that is landing as well as in the two-direction
job above.

`/check`: `review: delegated` (high, findings acted on - the three-controls inconsistency, the
self-referential slice bound and the category/group mismatch all came from it), `simplify: inline`
(the skill returned fan-out instructions, so the four angles were covered here: lifted the duplicated
first-card-style locator into one helper, and dropped the self-referential slice bound). `taste: not
applicable` - nothing in this change can move what a graphic looks like; it is a comment, a test and
four documents.

## What I would want the next planner to take from this

A row was planned off a backlog file that was itself planned off an unverified delegate claim, and
the only thing standing between it and a shipped regression was reproducing before fixing. The
backlog file even said the claim's author "was measured wrong on two of its six claims in the same
review" and it still became a row. The cheap guard is not more review of the claim - it is that a
defect report naming a file must be checked against the rule store for that file's scope, which
takes one grep and would have stopped this at filing.
