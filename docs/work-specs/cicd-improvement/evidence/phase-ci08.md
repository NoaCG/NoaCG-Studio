# Phase ci08: maintenance candidate one, the arrangement geometry cases

Row ci08 of the [cicd-improvement spec](../spec.md) (P3; AC-5). Built 2026-11-01 by the ci08
builder (Claude Code Cloud worker of plan run #1842) from `main` at
`7030eb18dcceef18243e0dc3e937a2b7ef51918e` (JEV #1899 merge).

## 1. The choice

The spec names three candidates from the suite-budget inventory
([candidates.md](../../e2e-suite-budget/evidence/candidates.md)): geometry cases currently booting
the app, repeated playout setup, and overlapping editor qualification walks. This row takes the
**geometry cases**, in `e2e/editor-arrangement.spec.ts` (inventory item 4). Why this one:

- Remeasured on current `main`, its geometry cases are the slowest tests in the file: the two
  `six alignment edges` tests take 5.49 s and 5.60 s on the main CI shard (run 41287750200, the
  merge of `7030eb18`), twice the file's median of 3.0 s, and they repeat arithmetic that
  `scripts/editor-arrangement.test.mjs` already checks in Node. The inventory's zero-assertion
  `baseline probe` (2.31 s) is still there.
- The change keeps every rendered and persistence boundary in the browser (section 3), so no
  protection moves to scheduled cadence and the selection does not change (section 6).
- It stays clear of the other two rows and of the JEV plan: ci09 and ci10 take repeated playout
  setup and the editor qualification walks. No open pull request or JEV branch touches these files
  (open PRs read 2026-11-01: #1834, #1642, #1641, #1503).
- `e2e/editor-groups.spec.ts` (the inventory's other half of item 4) is untouched: its probe has
  assertions, and its geometry runs through `editorGroups.ts` source rewriting, not pure arithmetic.
  Its numbers below are only the control for machine noise.

Production-page studio acceptance: this candidate touches no production page, rundown or playout
surface, so it opens no gap there and claims nothing for that plan.

## 2. Inventory: behaviour, failure, boundary (acceptance a)

Three browser tests leave `e2e/editor-arrangement.spec.ts`. Each one boots `/app`, applies the
catalog fixture and creates three layers (about 2 s of CI time before its first assertion).

| Test (before) | Behaviour it protects | Failure it would show | Boundary |
|---|---|---|---|
| `baseline probe: current alignment and canvas arrow capability` | None asserted. It logs the Align and Distribute button counts and whether ArrowRight changed the source. | Only a thrown error while booting, creating, selecting or pressing a key. Every other test in the file goes through the same steps. | browser app |
| `six alignment edges against selection` | B1 each of the six Align buttons moves along its own axis to its own edge (left/center/right, top/middle/bottom); B2 against the selection's rendered extent; B4 the rendered bounds after the click; B5 each click is one undo step back to the exact source | B1 a wrong button table entry or a dropped button; B2 a wrong edge fraction; B4 a broken targets/translate/preview path; B5 an alignment split over two transactions | B1 table (pure data), B2 arithmetic (pure), B4/B5 Canvas wiring, preview render, editor history (browser) |
| `six alignment edges against canvas` | B1, B4, B5 as above; B3 against the composition resolution, per axis, chosen through the `Align to` box; B6 a single selection defaults to Canvas and Distribute is disabled | B3 the canvas reference ignored or its axes swapped; B6 a wrong default or enable rule | B3 Canvas.tsx reference wiring (browser), B6 UI state (browser) |

What replaces them:

- **Node** (`scripts/editor-arrangement.test.mjs`, new test `every arrangement button does what
  its label says against the selection and the canvas`). The button table moves unchanged from
  `ArrangementControls.tsx` into `src/blocks/arrangementGeometry.ts` as `ARRANGEMENT_COMMANDS`, and
  the component renders it as before. The test reads each label's words (left, horizontal center,
  bottom, horizontally, ...) and checks that button's command against both references: the axis it
  moves along, that it moves along no other, the edge it lands on, and equal gaps for the two
  Distribute buttons. That is B1 for all eight buttons and B2 for both references. The existing
  arithmetic test (all edges, both references) stays.
- **Browser** (one test, `alignment edges reach rendered bounds against the selection and the
  canvas`): one boot, then four click-and-undo rounds through the `Align to` box: selection with
  horizontal center and bottom, canvas with right and vertical center. Both references, both axes,
  fractions 0.5 and 1 through rendered bounds and exact undo (B3, B4, B5), then the old test's
  single-selection tail verbatim (B6). Fraction 0 through rendered bounds stays in
  `selection alignment uses rendered bounds` (Align left) and the imported SVG test (Align top).
- **Retired**: the baseline probe. Nothing replaces it because it asserted nothing.

## 3. Fault replay (acceptance a)

There is no recorded defect in this code to replay: `arrangementGeometry.ts` and
`ArrangementControls.tsx` have had two commits since 2026-10-05 (`a63990674`, `a16d0da40`), neither
a fix. So each failure mode in the inventory was injected as a source patch, one at a time. For
each one, the old tests (the base file, run unchanged from a copy) and the replacement (the new
browser test and the Node file) ran on this machine, and the patch was reverted afterwards.
F0 is the fix: no patch.

| Fault | Patch | Old probe | Old selection | Old canvas | New browser | New Node |
|---|---|---|---|---|---|---|
| F0 none (the fix) | none | pass | pass | pass | pass | pass |
| F1 a table entry: Align top lands at the centre | `ARRANGEMENT_COMMANDS` Align top `edge: 'start'` to `'center'` | pass | **fail** | **fail** | pass | **fail** |
| F2 the canvas reference ignored | `Canvas.tsx`: `reference === 'canvas' &&` to `false &&` | pass | pass | **fail** | **fail** | pass |
| F3 canvas axes swapped | `Canvas.tsx`: canvas `{ width: resolution.height, height: resolution.width }` | pass | pass | **fail** | **fail** | pass |
| F4 wrong centre fraction | `arrangementGeometry.ts`: `.5` to `.45` | pass | **fail** | **fail** | **fail** | **fail** |
| F5 the Align group drops a button | `ArrangementControls.tsx`: `slice(0, 6)` to `slice(0, 5)` | pass | **fail** | **fail** | **fail** | pass |
| F6 no arrangement toolbar | `ArrangementControls.tsx`: render nothing | **fail** | **fail** | **fail** | **fail** | pass |
| F7 one alignment, two undo steps | `Canvas.tsx`: first operation and the rest as two transactions | pass | **fail** | **fail** | **fail** | pass |

Every fault the old tests catch, the replacement also catches. F1 shows why the Node test is
needed: the browser now clicks four of the six buttons, and the Node test covers the other two from
their labels. The probe fails only on F6, which every other test in the file also catches.

## 4. Before and after: time and runner cost (acceptance a)

Comparable environments, same command on each side:

- **This machine** (Claude Code Cloud, 4 CPUs, 2 Playwright workers), queued through
  `scripts/jobs.mjs`. One run of both editor specs per side, then the spec alone,
  before and after alternating, `before` being the base file run from a copy in the same tree.
- **GitHub Actions** (the standard `ubuntu-latest` runner the offline shards use; per-test
  durations from the shard's blob report). Before: main CI run 41287750200, shard 7/15 (merge
  `7030eb18`). After: this PR's CI run, which selects the edited spec (section 6).

Per-test time of the tests that change (the three removed on one side, the one added on the
other), and the whole spec, in seconds of test time (the sum over tests, so independent of how the
two workers share them):

| Sample | Removed three (before) | Added one (after) | Whole spec before | Whole spec after |
|---|---|---|---|---|
| This machine, both editor specs, one run per side | 30.2 | 8.3 | 206.0 (25 tests) | 178.3 (23 tests) |
| This machine, spec alone, sample 1 | 27.9 (tainted, see section 7) | 8.9 | 197.4 | 182.3 |
| This machine, spec alone, sample 2 | 25.8 | 8.5 | 185.7 | 163.6 |
| This machine, spec alone, sample 3 | 24.6 | | 184.4 | |
| Actions, standard runner | 13.40 (2.31 + 5.49 + 5.60) | CI_AFTER_NEW | 89.7 (25 tests) | CI_AFTER_SPEC |

In the both-specs runs, `editor-groups.spec.ts` (unchanged) read 260.3 s before and 264.6 s after,
so machine noise between samples is a few percent; the whole-spec totals move with it. The tests
that change are the stable comparison: about 17 to 22 s saved per execution here, CI_SAVED on
Actions.

Runner cost. The offline shards run on standard Linux runners, so a runner-second saved is a
billed second saved. CI_COST. The spec runs in every full main run (once per landing) and in every
pull request plan that selects it (its header covers all of `src/components/editorFoundation/`
and three blocks), so the saving repeats on each of those.

Growth controls: `node scripts/e2e-capacity.mjs --changed origin/main` adds no case and no
exception (the table reads the spec at 1.50 min until the next durations refresh, bot PR #1503).
With this PR's measured report it reads CAPACITY_REPORT. `node scripts/check-e2e-protection.mjs
--changed origin/main` passes with no test-maintenance entry (section 7 says why none is written).

## 5. Integration kept (acceptance b)

- **UI and rendering**: every remaining browser test is unchanged. The new browser test still
  clicks real buttons, reads rendered bounds in the preview iframe and checks undo against the
  exact source, on both references and both axes.
- **Persistence**: this file's save/reopen and export journey (`template search, UI-created
  artwork, save/reopen and executed exports at desktop and laptop sizes`) is unchanged. The removed
  tests never saved or reopened anything.
- **Scheduled cadence**: nothing moves to a scheduled or nightly run. The Node test runs in the
  build gates on every pull request that changes `arrangementGeometry.ts` (its `guards:` line) and
  on every full build.
- **Critical set and contract map**: `editor-arrangement.spec.ts` is not a critical journey and is
  not named in `scripts/e2e-contracts.mjs`. Neither changes.

## 6. Selection and the audit reset (acceptance b)

Classification: **no audit reset.** The runbook's reset classes: selector code, header or list
interpretation, critical/shared membership, a dependency mapping corrected after a miss, and
replaced or moved protection *that changes which existing contracts are selected*. This change
touches no selector code, no `// covers`, `// focus` or `// critical` line, no list, and no
`guards:` line. Protection moves from browser to Node inside the same contract, and the selection
is unchanged, measured on base and head:

| Changed file | `e2e-affected --list` specs, base | head |
|---|---|---|
| `src/blocks/arrangementGeometry.ts` | 18 | 18, identical |
| `src/components/editorFoundation/ArrangementControls.tsx` | 105 | 105, identical |
| `e2e/editor-arrangement.spec.ts` | 1 | 1, identical |
| `scripts/editor-arrangement.test.mjs` | 0 | 0 |

`node scripts/e2e-selection-misses.mjs resets --ref HEAD` still reads the latest reset as
`06d3836c` (ci07, 2026-11-01T07:53:03Z), so the audit window is not restarted, and no commit here
carries a `Selection-audit-reset` trailer.

## 7. Decisions and traps

- The button table moves into `arrangementGeometry.ts` rather than being exported from the
  component, so the Node test bundles plain TypeScript with no JSX, as it already did. The
  component's markup and behaviour are unchanged.
- **No test-maintenance entry.** `check-e2e-protection` counts `test(` lines, and the two six-edge
  tests came from one `for (...) test(` line it does not count, so it sees one removed and one
  added and passes. An entry would also cover every later change to this file, because the check
  matches entries by file name with no date. So this file and the PR are the receipt, and the blind
  spot is follow-up issue FOLLOWUP.
- Trap for ci09 and ci10: on a cloud worker, a queued job with `--cap 12` cannot run Playwright on
  an uncommitted tree ("Broader selection needs reviewed source admission"). Fault injection needs
  one `--cap 5` job per fault, run one after another, because the patches share the tree.
- Trap: a source patch while a timed run is in progress taints that sample. The first `before` alone
  sample overlapped a one-second patch check and is replaced by a later sample (section 4).

## 8. Verification

VERIFICATION

## 9. Phase notes

- Previous verified main: `7030eb18dcceef18243e0dc3e937a2b7ef51918e` (JEV #1899 merge; its full
  CI run 41287750200 passed).
- Revert: `git revert -m 1 <this PR's merge commit>`, landed through `/queue-merge`. It restores the
  three browser tests and the table in the component, and removes the Node test. It changes no
  selection either, so it is not a reset.
