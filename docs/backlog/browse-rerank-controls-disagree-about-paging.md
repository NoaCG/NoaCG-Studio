# Three Browse controls re-rank without filtering, and only one of them keeps your place

**Filed:** 2026-09-09. **Source:** the review of `claude/b-browse-page-reset-signature`, which was
launched to make the brand chooser reset the page and found the opposite - the brand chooser is the
one control already getting this right.

## Why

A control that re-orders the Browse result without removing anything from it should not cost the
reader the extra pages they pressed for. That is the reasoning recorded on 2026-09-07 in
`contracts/rules/wizard/feed-footer-brand-chooser-browse-context.md`: the brand chooser "re-ranks
without resetting the page, because the reader asked for those extra results and a re-rank should
not take them away".

Browse has **three** controls that re-rank without filtering, and the rule reached one of them.

- **The brand chooser** re-ranks via `BRAND_BOOST`. It is absent from the paging signature, so the
  depth survives. This is the ratified behaviour, and `e2e/wizard-filters.spec.ts` now pins it.
- **The sort dropdown** (`relevance` / `simplest`) only reorders - `sortResults` sorts the arrays
  the result already contains. It is in the signature by name, so switching it drops the reader
  back to twelve.
- **Programme family and format** only rank. `passesStrictFilters` (search.ts:86-96) never looks at
  `family` or `format`, and `formatBoost` (search.ts:427-438) scores a non-match at zero and keeps
  it in the result - which is precisely what the spec `programme selection ranks into Best for /
  Also works without hiding anything` asserts. They ride into the signature inside
  `JSON.stringify(filters)`, so picking a programme also drops the reader back to twelve.

So a reader on 36 cards keeps all 36 when they pick a brand and loses 24 of them when they change
the sort order, with nothing in the product explaining the difference. Whichever answer is right,
the same one should hold for all three.

## What it would take

Small, once the answer is chosen. The signature is one template string.

- To make them consistent the other way, take `sort` out of it and drop `family` and `format` from
  the JSON - both are pure re-ranks, so what is left in the signature is the strict facets that
  genuinely change what the result contains.
- To make them consistent the first way, the 2026-09-07 rule has to be withdrawn in the same
  commit, not worked around, and the spec that pins it flipped.

The cost is in deciding, not in typing. **It is a taste question and it belongs to the owner** -
`docs/acceptance/owner-queue/2026-09-09-browse-keeps-your-page-when-you-pick-a-brand.md` asks it
with a route he can walk in under a minute.

One thing worth weighing when it is answered: a re-rank the reader cannot see is not obviously
better than a reset. If they are scrolled down among 36 cards, the newly promoted best matches
arrive at the top where they are not looking, so keeping the depth preserves results at the cost of
hiding the effect of the control they just used. Neither answer is free.

## Evidence

- `src/components/wizard/steps/BrowseStep.tsx` - the signature and the comment naming this file.
- `src/templates/search.ts:86-96` - `passesStrictFilters`, with no family or format clause.
- `src/templates/search.ts:427-438` - `formatBoost`, which keeps a non-match at score zero.
- `contracts/rules/wizard/feed-footer-brand-chooser-browse-context.md` and its record - the ruling
  that covers the brand chooser and nothing else.
