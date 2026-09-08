---
v: 1
source: measured
raised: 2026-09-02
state: unstarted
asked: "the wizard paints its Entry step for one frame before jumping to the step the URL named"
---
# A wizard deep link paints Entry first, then jumps to the step it was asked for

**Filed:** 2026-09-02, from the route-transition-flash work on `claude/g-route-transition-flash`
(handoff since drained).
The owner's own report (2026-08-28) is CLOSED by that branch; this is a second instance of the
same mistake, found by sweeping for its shape rather than by anyone walking it.

## Why

The link it spoils is not an obscure one. Every prerendered template page ends in a "use this
design" door (`/app#/new/<designId>`, 502 of them - docs/PRERENDER.md), which is the road from a
search result into the product. A reader arriving there is shown the wizard's front page for a
frame and then thrown a step forward, so the first thing the product does is look like it changed
its mind. That impression is exactly what the boot fix on the branch above was written to remove,
and this is the half of it still standing. It is also the cheapest kind of thing to leave
undone: it never fails, never logs, and costs only a little trust, on the first screen a new
reader ever sees.

## The shape

A component decides which whole screen to show from inside a `useEffect`. An effect runs after
the first commit has been PAINTED, so the surface the first render chose is on screen for at
least one frame before the effect corrects it. `src/App.tsx` had this for the app's boot surface
and now decides at module load instead; `CreationWizard` still has it for its STEP.

## Where

`src/components/wizard/CreationWizard.tsx`, three effects that all write `step` (declared
`useState(0)` at ~line 187, and the wizard is a full-screen opaque modal, so `step` IS the visible
screen):

- ~line 379 (`setStep` ~392), deps `[open]`. On a cold boot onto `#/new/step/<name>` the wizard is
  already open at module load, so this behaves as mount-only: Entry paints, then Fields.
- ~line 439 (`setStep` ~462), deps `[open, pendingDesignId]`. Both are already set before the
  first render on the cold path, because `decideBootRoute` calls `openGallery(url.design)` at
  module load. This is the one a template page's deep link (`/app#/new/<designId>`,
  docs/PRERENDER.md) hits: Entry paints, then step 2.
- ~line 319 (`setStep` ~336), deps `[open, route, stepKey, stepTitles]`. Route-dependent, so its
  Back/Forward path is right; on the FIRST mount it takes the `else` branch and sets the step too.

## The fix shape

Resolve the initial `step`/`mode` in a lazy `useState` initializer, or alongside `openGallery` in
`App.tsx`'s `decideBootRoute`, so the first render already sits on the named step. The three
effects then only handle real changes, which is what they are for.

## How to see it, and how to gate it

`e2e/route-transition-flash.spec.ts` has the instrument: a MutationObserver installed before the
first commit that records every surface the first time it enters the DOM. A one-frame defect can
be missed by sampling (rAF, screenshots, a screencast) but never by that, because a screen has to
be inserted to be painted. Point the same recorder at the wizard's step panels and assert the
Entry step never enters the DOM on a `#/new/step/<name>` or `#/new/<designId>` boot.

**Not started because** `CreationWizard.tsx` is a hot, heavily-commented file with three
interlocking step effects, and it sat outside the flash branch's agreed touch set. It is a
contained piece of work, not a risky one - it just wants its own branch and its own suite run.
