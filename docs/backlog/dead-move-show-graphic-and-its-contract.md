---
v: 2
source: derived
kind: finding
raised: 2026-09-08
state: unstarted
found: "moveShowGraphic in src/model/shows.ts is dead code, and the contract described it as the
  gesture that changes which pool graphic airs on top. Found while migrating src/model/AGENTS.md
  into the rule store, by checking a contract claim about layer order."
---
# `moveShowGraphic` is dead, and the layer story it belonged to is gone

**Filed:** 2026-09-08. **Source:** measurement, while migrating `src/model/AGENTS.md` into the rule
store.

## What is there

`moveShowGraphic(showId: string, graphicId: string, dir: -1 | 1)` in `src/model/shows.ts` swaps a
pool entry with its neighbour. Nothing calls it: the only references in the repository are its own
definition and a comment upstream in the same file. `src/components/home/ProductionPage.tsx` imports
`removeShowGraphic` and not this one. Its lookup also omits the `!s.deleted` filter that
`setShowGraphicLayer` and `removeShowGraphic` both apply, so it would act on a tombstoned show -
one more reason to delete it rather than revive it as it stands.

It is dead because the model it belonged to was replaced. A pool graphic now airs on a layer NUMBER
carried on its own entry (`DEFAULT_PLAYOUT_LAYER`, `nextFreeLayer`, read through `graphicLayer`),
and every z-order consumer reads that number: `src/control/hostedControl.ts`,
`src/export/showExport.ts`, `src/packs/graphicsPack.ts` and `ProductionPage.tsx`. Position in the
array decides nothing. Swapping two entries changes what airs on top by exactly nothing.

## Why it is worth a row

The hand-written contract said the opposite, in the imperative: "`graphics` order IS the layer
stack, in PAINT order", "both surfaces reverse it for display", "`moveShowGraphic(+1)` therefore
means forward". A session reaching for a way to restack a production would have found the sentence,
found the function, called it, and watched nothing move. The contract is fixed - the rule that
replaced it names the layer number - but the function is still there for the next person to find.

## The shape of the fix

Delete `moveShowGraphic` and the stale sentence in the comment above the pool field that survives
it, or, if a reorder gesture IS wanted on the production page, give it one that writes layer numbers
instead of array positions. The first is a five-line change; the second is a design question about
whether an operator reorders a production by dragging or by typing a layer, and the production page
already shows the number and warns about a clash, which argues for typing.

## Where it came from

`root/blocks`-style reachability checking applied to `src/model`: the migration row cross-checked
every contract claim describing a control or a default against the code that owns it. This was one
of seven false claims that pass found; the rest are recorded in
`contracts/records/model/2026-09-08-the-contract-this-replaced.md`.
