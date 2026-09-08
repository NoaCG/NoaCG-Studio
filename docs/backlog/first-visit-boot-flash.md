---
v: 1
source: measured
raised: 2026-09-02
state: unstarted
asked: "a first-ever visit to /app still paints the canvas editor for a frame on its way to the wizard"
---
# A first-ever visit to `/app` still flashes the editor on its way to the wizard

**Filed:** 2026-09-02, from the route-transition-flash branch `claude/g-route-transition-flash`
(handoff since drained), which closed the same defect for every
other boot. This is the one case left, and it is left deliberately.

## Why

It is the same frame the owner complained about on 2026-08-28, on the one boot that belongs to a
reader who has never used the product before. Every other boot is fixed and pinned by
`e2e/route-transition-flash.spec.ts`; this one is not pinned at all, because a test asserting the
wrong behaviour would only make it harder to see. First impressions are the whole point of that
boot: it is the wizard-first entry the student release is built around.

## What is happening

`decideBootRoute` in `src/App.tsx` settles every boot at module load except this one. A bare
`/app` with **no autosaved project** resolves to the wizard, and that decision is still made by
the small mount effect further down the file. An effect runs after the first commit is painted,
so `''` parses as the editor, `<AppShell/>` renders, and the redirect to `#/new` lands a frame
later.

## The CI failure that stopped the move is understood, and fixed

Read this before the two sections below, which were written while it was still a mystery and
describe the dead end rather than the answer.

`layout.spec.ts:171` was not failing because of which surface sits under the wizard. It was
failing because the wizard never closed. `decideBootRoute` reads `window.location.hash` at App.tsx's
MODULE LOAD; the first render is a later moment, because main.tsx imports App only after the
durable store hydrates and then renders a concurrent root. A URL that moves inside that window
leaves `decideBootRoute` having judged a page the reader has already left, and the boot effect
that used to rescue it (on `main` it read the LIVE route and closed the wizard for any route that
was neither `editor` nor `new`) now returns early at `if (route.view !== 'editor') return`. So the
startup wizard - open by `galleryOpen`'s initial value and owned by no route - stays full screen
over Home. `routedWizard.current` is never set, which is why the routed-wizard effect did not
close it either. That answers this file's own "why leaving `#/new` does not close a boot-opened
wizard on CI": on that walk the route was never `#/new` at all.

It reproduces on this laptop once the window is widened deliberately: 8x CPU throttling, a
`waitUntil: 'commit'` boot, and the second `goto` fired the moment `__noacgBootStage` reads
`mounted`. That case is now pinned in `e2e/route-transition-flash.spec.ts` ("a navigation inside
the boot window never strands the startup wizard"), and the routed-wizard effect closes a
stranded startup wizard against the live route.

So the obstacle to resolving the first-ever visit at module load is gone: it was never about the
under-surface. What remains below is the record of how that was mistaken, kept because the
measurements in it are real.

## Why it was not simply moved

It was moved, measured working, and then backed out. Resolving it at module load means the route
already says `new` when React first renders, which changes **which surface renders under the
wizard** - `bootedOnWizard` reads the arrival URL, so a bare `/app` gets Home underneath rather
than nothing. With Home mounted under the wizard, `e2e/layout.spec.ts:171` ("mobile: Home leads
with Productions...") failed on CI: its `home-page` visibility gate passes while the wizard is
still up, and it then clicked Home's dashboard door into the wizard's backdrop until it timed out
- 27 retries over 60 s, so a stuck state rather than a race.

**It would not reproduce on this laptop.** The whole spec file passed, the single test passed, and
a reduction of that exact walk (bare `/app` boot onto the wizard, seed a graphic and a show, move
to `#/home`, check the wizard is gone) passed both with and without the speculative fix that was
tried - which is what proved the hypothesis wrong rather than confirming it. Two of three CI runs
failed it; the one that passed had the other `bootedOnWizard` reading.

## Where to start

The correlation is mechanical and worth trusting as a lead rather than a conclusion: the failure
tracks which surface sits under the wizard on that boot, not the route decision itself. So the
question to answer first is **why leaving `#/new` does not close a boot-opened wizard on CI**, and
the honest way to answer it is on a Linux runner, not here. `routedWizard` in `src/App.tsx` is
only ever set inside the effect's `route.view === 'new'` branch; initialising it from the boot was
tried and is NOT the answer (the reduction passes without it).

Once that is understood, the change itself is small, and
`e2e/route-transition-flash.spec.ts` already carries the instrument: a MutationObserver installed
before the first commit that records every surface the first time it enters the DOM. Add the case
back as `expect(seen).not.toContain('editor')` on a fresh profile.
