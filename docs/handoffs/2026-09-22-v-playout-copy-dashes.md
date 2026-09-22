# V - the playout surfaces lose their em dashes

Branch `claude/v-playout-copy-dashes`, worktree `.claude/worktrees/agent-ae90daf9d750e7e25`,
forked from `5a2b8548`. The owner asked on 2026-09-22 for the sweep row P did in
`src/components/wizard/` (`docs/handoffs/2026-09-22-p-friday-polish.md`, item 3) to be repeated on
the playout pages. Owner walk: `docs/acceptance/owner-queue/2026-09-22-v-playout-copy-dashes.md`.

## What changed

**68 user-visible strings**, across nine files: 67 carrying an em dash and one carrying a hyphen
used the same way. Every em dash an operator can read on a playout surface is gone, and the rule
was the same as row P's: the dash becomes a plain sentence, never a hyphen and never a semicolon.

| File | Strings |
| --- | --- |
| `src/components/home/ProductionPage.tsx` | 23 |
| `src/components/HostedControlPage.tsx` | 13 |
| `src/components/home/GraphicControlPage.tsx` | 12 |
| `src/control/productionControllerHtml.ts` | 7 |
| `src/components/home/ProductionLinks.tsx` | 4 |
| `src/control/controlPanelHtml.ts` | 4 |
| `src/components/home/GraphicRow.tsx` | 2 |
| `src/control/hostedControl.ts` | 2 |
| `src/components/home/HomePage.tsx` | 1 |

I found them with a scanner that tracks block and line comments across a file, so a dash inside a
multi-line `{/* ... */}` was never mistaken for copy. Its counts agreed exactly with the copy
gate's own for all five baselined files, which is what says the two read the same set. Comments
keep their dashes: they are the house style, and `scripts/check-copy.mjs` says in its own header
why they are out of scope.

## What I decided

- **`PROGRAM · ON AIR`, not a sentence.** A two-word monitor heading sits beside a plain `PREVIEW`
  on the monitor next to it, and no sentence reads right in that space. The middle dot is already
  this page's separator (`L1 · L2`, `In: Rise · Out: Fade`). It is narrower than the dash it
  replaced, so nothing moved. Same choice in all three renderers and in
  `src/styles/playout-dashboard.css`'s comment about the 390px wrap case.
- **The two downloaded pages' `<title>` took the dot too**: `<show> · production controller` and
  `<graphic> · control panel`. The controller's own `<h1>` has always printed
  `<show> · controller`, so the tab title now matches the header instead of contradicting it.
- **`An entry is one saved set of field values: "Anna Andersson · Presenter", ...`** kept a colon
  rather than becoming two sentences, because a colon before an example is exactly what the house
  style rules allow and it is one character shorter than the dash was.
- **`Auto (recommended)`** in the easing list, which is the wording row P chose in the wizard and
  explicitly left behind in `GraphicControlPage.tsx`.
- **GraphicRow's table placeholder stays a literal em dash** (`<span aria-hidden>—</span>` at
  line 342). It is a typographic "no value" mark in a column that must fill its cell, not prose,
  and the comment above it already says so. Two specs assert it.
- **Two dashes that were not em dashes went too**, because leaving them would have split a pair
  that is meant to read identically on two surfaces: `ProductionPage.tsx`'s `not on air yet -
  press ✎ Update` (its hosted twin had the em-dash form) and `HomePage.tsx`'s shelf-card Open
  tooltip (its library-row twin is in `GraphicRow.tsx`, which was in scope).

## Where I am least sure

1. **`Fires "reveal", but only where the graph allows it.`** The old form put the qualifier after
   a dash. A comma plus "but only" is the plainest thing I could find, but it reads slightly
   formal for a hover on a button an operator presses in a hurry. The alternative was two
   sentences, which is long for a tooltip.
2. **`This is the live graphic's current state, and the greying is judged against it.`** on the
   state chip when a state is known. The chip's text is already the state name, so the tooltip
   now repeats the name and then explains it. That is one clause longer than the old line.
3. **`PROGRAM · ON AIR`.** The owner walk asks him about it directly, because it is the one place
   a separator survived rather than becoming words.

## Left, and why

- `src/components/home/sections/*.tsx` still hold 12 em dashes (GraphicsSection 3,
  ProductionsSection 4, VideosSection 2, LooksSection 1, plus HomePage 2). They render on the HOME
  page, not on a playout surface, so they are outside this row's scope. They are the obvious next
  sweep and the baseline names every one of them.
- The first-graphic tutorial's `step-10-typed-not-on-air.png` frame now shows the old wording. The
  text caption is corrected; the shot itself needs a re-run of
  `NOACG_TUTORIAL_SHOTS=<dir> npx playwright test import-svg-behaviour`, which is browser work for
  the job queue. The PNGs are not committed, so nothing in the repository is stale.

## The check

`review: delegated, 4 findings, 4 fixed`. The code-review skill got the `review-request.mjs`
scope (base `5a2b8548`, 13 files) and reported that same base sha and exactly those 13 files, so
the scope matched. All four findings were real and all four are fixed: two specs asserting the old
strings (`production-persistence.spec.ts:224`, `productions.spec.ts:112`), a stale quote in
`docs/PLAYOUT_DASHBOARD.md:511`, and the tutorial caption. A fifth of the same kind that the
review missed, `production-controls.spec.ts:290`, was caught by the suite: the rewrites capitalise
the word after the old dash, and Playwright's `toContainText` is case-sensitive.

`simplify: inline`. The skill returned fan-out instructions, so the pass ran here over its four
angles. One finding: the hosted live-number pair built the same hover string twice, once per
button, so it is now one `stepTitle` per field. Reuse and altitude both came up clean. The three
renderers repeat these sentences by design (the exported controller is standalone and can import
nothing), which `docs/CONTROL_PANEL_PARITY.md` owns.

`verify: inline`. `npm run build` exit 0 at `eb72d74c` and again after the simplify edit, read
from the build's own exit code. Job `j-1770` ran the affected set (31 specs) on `4605f573`, 344
passed and 3 failed, which is where the assertion breakages came from. `j-1772` re-ran after the
fixes, and by then the plan had escalated to the FULL suite plus the catalog battery: `src/styles`
is CORE in `scripts/e2e-lists.mjs`, so the one-line comment correction in
`playout-dashboard.css` widens the run. That is the mapping working, and CI will escalate the same
way. Screenshots of the control area at 1366x768 came from `j-1773`.

`taste: not applicable`. No graphic's rendering changed, only chrome copy, tooltips and two
document titles.

## Commits

`5f734b30` the copy itself, `4605f573` the two documents plus the owner walk, `eb72d74c` the
assertions and quotes the review and the suite found, `<simplify>` the one hover string, then this
handoff.
