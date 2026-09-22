# S - The playout dashboard's monitors and rundown stay fixed

Branch `claude/s-playout-fixed-panes`, forked from `6f5855d9`. The owner's production test on
2026-09-22: on the playout dashboard the rundown and the PREVIEW/PROGRAM monitors no longer
scrolled themselves, but they still moved or bounced when the control area was scrolled. Owner
walk: `docs/acceptance/owner-queue/2026-09-22-s-playout-fixed-panes.md`.

## The measured cause

The whole document scrolled, and the header, the stage head (monitors plus verbs) and the cue
rail were `position: sticky` on it. I reproduced it in Playwright with
`e2e/playout-fixed-panes.spec.ts` before touching anything, sampling `getBoundingClientRect().top`
every animation frame while a mouse wheel and a trackpad's small deltas scrolled the control area:

| | document scroll range | rail drift while scrolling | rundown end chains into page |
|---|---|---|---|
| 1366x768 | 611px | 0.27px | yes, page scrolled 611px |
| 1280x720 | 687px | 0.19px | yes, page scrolled 687px |
| 1920x1080 | 238px | 0 | yes, page scrolled 238px |

Headless Chromium holds a sticky block still in a plain wheel test, so the monitors measured 0px
there. What the owner saw on real hardware is the document moving under them: a trackpad's
elastic overscroll bounce drags the whole page, sticky blocks included, and the rundown's list
reaching its end handed the wheel on to the page. A headless browser cannot draw that bounce, so
the spec pins the reason for it (a document with something to scroll, and scrollers that chain)
rather than the bounce itself. The rail's sub-pixel drift was the same mechanism visible in the
numbers. No JS scroll handler, ResizeObserver or content-driven height was involved; the
ResizeObserver on the stage only sets the preview's inner scale.

## What changed, and what I decided

1. **A fixed app shell.** `.playout-dashboard` is `height: 100dvh` (with a `100vh` fallback) and
   `overflow: clip`. I chose `clip` over `hidden` on purpose: a `hidden` box is still a scroll
   container that `scrollIntoView` or a focus change can scroll by script, and that would move
   everything in it. `.pd-body` is a grid with one `minmax(0, 1fr)` row.
2. **One scroller.** A new wrapper, `.pd-control-area` (`data-testid="control-area"`), holds
   everything under the stage head: the note, the cue editor, graphic actions, live numbers, the
   controls panel and the activity log. It is `overflow-y: auto; overscroll-behavior: contain`.
   The same wrapper is on `HostedControlPage.tsx`, because the contract says both surfaces render
   the same dashboard. The JSX change is two wrapper lines per file; no control behaviour moved.
3. **Removed, not added.** The sticky rules on the header, the stage head and the rail are gone,
   with the stage head's negative-margin trick and background that only existed to make sticky
   look right, and the rail's `calc(100vh - header)` height. The phone breakpoint lost the rules
   that undid them.
4. **The rundown list and the Data/Audience sub-pages** are `overscroll-behavior: contain` too.
   The sub-pages scroll inside the body now, since the page no longer does.
5. **A thin scrollbar on the control area.** §3 said no pane shows scrollbar chrome and the page
   used the browser's bar. The control area took over the page's job, so it keeps a thin, dark
   bar as the one sign that there is more below. That is my call; `scrollbar-width: none` is a
   one-line revert in `playout-dashboard.css` if the owner prefers none.
6. **The phone stacks and scrolls as one column, deliberately.** At 390px there is no room to
   hold the monitors still beside a scrolling editor. The body scrolls, the verb bar stays pinned
   to the bottom, and the document never scrolls. Documented in §2 and in the CSS.
7. **The EXPORTED CONTROLLER got the same shell** (`src/control/productionControllerHtml.ts`).
   It carries its own stylesheet, not the app's, and the review caught that it still had the
   page-scroll model the branch removed everywhere else. It is the surface a show drops to when
   the network dies, so it would have had exactly the reported bounce. Its `main` is now the
   same fixed grid, its editor and activity feed sit in a `.controls` scroller, and the parity
   row in `docs/CONTROL_PANEL_PARITY.md` is rewritten to say what all three now do.
8. **A last resort for a window too short to hold the stage head.** `.pd-main` is
   `overflow: auto` with a 200px floor on the control area, so below the supported minimum (say
   1280x400, or a window with tall docked devtools) the column scrolls rather than clipping TAKE
   and Out out of reach inside a shell that cannot be scrolled. At every supported size the
   control area absorbs the overflow and the column has nothing to scroll, which
   `productions.spec.ts` and the new spec both assert.
9. **Noticed and fixed on the way: the phone header hid ■ All out.** At 390x844 the workspace
   tabs (Playout / Data / Audience) squeezed the production name to zero width and pushed All out
   past the right edge. The tabs now stand down at phone width, as Export and New graphic already
   did, since Data and Audience are authoring surfaces that open in their own browser tab.

Geometry is unchanged at every desktop size: the monitors, the verbs and the rail sit at exactly
the same pixel positions as before (monitors top 62px, rail top 50px, verbs at 62px or 265.75px
at 1280x720).

## After

| | document scroll range | control area scrolls | drift of header, monitors, verbs, rail, first cue |
|---|---|---|---|
| 1366x768 | 0 | 611px | 0 / 0 / 0 / 0 / 0 |
| 1280x720 | 0 | 687px | 0 / 0 / 0 / 0 / 0 |
| 1920x1080 | 0 | 238px | 0 / 0 / 0 / 0 / 0 |

Scrolling the rundown to its end now leaves the document at 0 and the control area where it was.

## Tests and docs

- `e2e/playout-fixed-panes.spec.ts` (new, 5 tests): the three desktop sizes, long and short
  control areas, wheel and trackpad deltas past both ends, a per-frame drift sampler, the
  rundown's chaining, no horizontal scroll in the document, the control area or the column; a
  phone test (body scrolls, document does not, verbs pinned to the bottom edge, All out wholly on
  screen); and the EXPORTED CONTROLLER built, served through the in-spec relay and wheel-scrolled
  at 1366x600. Mapped in `scripts/e2e-affected.mjs` for `ProductionPage.tsx` and
  `productionControllerHtml.ts`, and added to FOCUS in `scripts/e2e-lists.mjs`, because
  `src/styles` is CORE. `HostedControlPage.tsx` is deliberately not mapped to it: its DOM needs a
  configured backend, so no offline spec can mount it.
- `e2e/production-controls.spec.ts`: the two scroll-model tests now pin the control area as the
  scroller and the document as unscrollable, where they used to pin the page scroll.
- `scripts/acceptance-pack.mjs`: scrolls the control area as well as the window, measures the
  slack inside it, prints `control area scrolls` beside the (now always 0) `page scrolls`, and
  its captions no longer describe a sticky head.
- `docs/PLAYOUT_DASHBOARD.md` §2 and §3 describe the new model and the measurements;
  `docs/CONTROL_PANEL_PARITY.md` carries the rewritten scroll-model row.

Screenshots from the spec (`NOACG_SHOTS`) were checked at 1366x768, 1280x720, 1920x1080 and
390x844 in the session scratchpad; they are not committed.

## The check

`review: delegated`. The code-review skill got the `review-request.mjs` scope (base `6f5855d9`,
11 files) and reported the same base and the same 11 files plus the context it read, so the scope
matched. It had nine findings and I acted on eight:

- HIGH, the exported controller left on the old model: fixed, item 7 above, with a spec that
  drives it.
- MEDIUM, `controlAreaScrollable` measured but never printed by the pack: fixed.
- MEDIUM, the handoff's `CHECK_PLACEHOLDER`: this section.
- MEDIUM, the document-overflow assertions being tautologies once the shell clips, and no check
  for a horizontal scrollbar inside the control area: the spec now measures `scrollWidth` on the
  control area and the stage column too, which is where a too-wide row would show up.
- MEDIUM, a window too short for the stage head clipping TAKE and Out unreachably: fixed, item 8.
- LOW, Data and Audience becoming scrollers without the scrollbar treatment: they get the same
  thin bar.
- LOW, the pack's captions still saying "sticky head": rewritten.
- LOW, the mapping row pointing `HostedControlPage.tsx` at a spec that cannot open it: the row
  now names `ProductionPage.tsx` and `productionControllerHtml.ts`, and says why the hosted page
  is not there.
- LOW, the spec's LONG case being whichever graphic was inserted first: it is now named.

`simplify: inline`. The skill returned fan-out instructions, so I did the pass here over the same
diff. Two changes: the spec names the five fixed parts once and both the snapshot and the sampler
read that list, and the sampler looks its elements up once instead of querying five selectors on
every animation frame. Nothing else in the diff had a duplicate or a dead branch; the controller's
copy of the shell is deliberate, since an export carries no shared stylesheet.

`verify: inline`. `npm run build` exit 0. Job `j-1755` ran playout-fixed-panes, production-controls,
productions, exports and production-pack (76 tests) with one failure, the new exported-controller
test, whose 1366x768 window was too tall for that page's four-across editor to overflow; `j-1758`
re-ran the spec at 1366x600 and all 5 passed. Earlier, `j-1751` ran the spec with layout and the
production-data round trip, 15 of 15. Screenshots at 1366x768, 1280x720, 1920x1080 and 390x844
were read by eye. The full affected set is CI's.

`taste: not applicable`. No graphic's rendering changed: this is the operator surface's layout,
and every monitor and frame keeps its measured size and position.

## Left

Nothing for this row. The owner walk is the remaining step: a real trackpad on the demo laptop is
the only place the bounce itself can be seen.
