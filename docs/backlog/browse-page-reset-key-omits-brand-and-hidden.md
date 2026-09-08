# Browse keeps your page number when the brand or a hidden design changes the result under you

**Filed:** 2026-09-09. **Source:** an unverified Codex claim from the 2026-09-07 wizard row, held
back at the time because the delegate got one in three wrong; verified against the code during the
handoff drain and it is real.

## Why

`src/components/wizard/steps/BrowseStep.tsx` computes the result from three inputs and the paging
key from one:

```ts
const outcome = useMemo(
  () => browseTemplates(filters, { brandFamily, hiddenIds }),
  [filters, brandFamily, hiddenIds],
);
const resultKey = `${JSON.stringify(filters)}|${sort}`;   // line 346
```

`brandFamily` and `hiddenIds` change what the result IS and are absent from the key, so a reader who
has pressed Show more four times, then picks a brand or hides a design, stays on page five of a list
that is now a different list. The comment directly above the key states the intent it fails - "reset
by any change to what the result IS" - and explains that the signature form was chosen over an
effect precisely so the reader never sees a frame of the wrong designs.

Nobody has reported it, which fits: it needs paging plus a brand change in one sitting, and the
brand chooser only shipped on 2026-09-06. It gets more reachable, not less, as the brand work of
`docs/BRAND_PLAN.md` §4 and §6 lands.

## What it would take

Add both inputs to the signature. `hiddenIds` is a collection, so the key needs a stable derivation
of it rather than an identity - a sorted join, or its size plus a sorted join if the ids are long.
The fix is one line; the spec is the work: drive Browse to page two, change the brand, and assert
the first `PAGE_SIZE` cards are what is shown.

Worth reading the rest of the file for siblings of the same shape while it is open: any other
`useMemo` on this step whose dependency list is longer than the signature derived beside it.

## Evidence

- `src/components/wizard/steps/BrowseStep.tsx:335-349` - the two lists, side by side.
- `contracts/rules/wizard/show-page-browse-results-catalog-twelve.md` states the paging doctrine but
  says nothing about which inputs belong in the signature, which is why no gate catches this.
- The claim's origin, and the reason it sat unverified for two days, was that the same delegate was
  measured wrong on two of its six claims in the same review.
