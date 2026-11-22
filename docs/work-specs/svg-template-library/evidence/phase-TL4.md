# Phase TL4 evidence: templates on existing routes

Base: `main` at `66ab49d3db8058f0eb972414623e155ecabb71c0`. Acceptance for this phase, verbatim:

- "AC-3: Every template imports with its recipe or contract detected, or, where recorded as author choice, works after that documented choice; controls work; one visual family; a default preview plus named operator-visible states with descriptive alt text."
- "AC-5: Live vote, Vote results and Poll result pass separate cases (imported vote has no automatic close; Figures selector versus Live figures timing)."
- "AC-6: Countdown pulses in the last 10 seconds and flashes once at zero; Pause, Reset, bar, reduced motion and OGraf seeks behave."
- "AC-7: Each mechanism plays in every export target with its supported modes recorded." (for the countdown motion)

Also carried here: the batched browser sweep from "Tests and budget", with minutes before and
after and its dated test-maintenance entry. Row class: not Ordinary (runtime motion, an export
gate and the sweep), not Risky (no ownership, retry, recovery or writer rule; no Risky path).
Rules M1 to M4 (phase notes) were written after coding, so the final `/so` challenges them.

## What was built

- 28 studio templates, hand-written SVG in the house style (Manrope, white plates, ink, blue
  accent), each with `<title>`, `<desc>`, the taught layer names, a default preview and its named
  states with alt text, in `library.json` and in their packages (library: 65 templates).
- Countdown motion: `enter: 'pulse'` and `enter: 'flash'` on a look rule, read on every repaint
  (the clock's tick included), GSAP in the imported-design runtime (`noacgMove`), none under
  reduced motion. Both words are in `READS_ADDED`; old graphics keep their frozen runtime and the
  export check refuses a table asking for them under a runtime that cannot read them.
- OGraf non-real time for imported designs: the gate read the SVG namespace URI as a network
  dependency; known XML namespace names are skipped, any real address still refused.
- `e2e/svg-templates.spec.ts` and `e2e/svg-examples.spec.ts` batched (one page per batch).
- Coverage: 66 of 101 rows covered (35 at the base); the TL4 extensions of countdown,
  scoreboard, duel-score, goal-meter, live-poll and end-credits-columns are closed.

## AC-3, per template route

Every case below is a step of a batch in `e2e/svg-templates.spec.ts` ("<route>: <names>: each
template imports, keeps every named text, runs its controls and stays clean on air"); the
import step asserts the detected recipe (`map-svg-behaviour-kind`) or, for credits, the read
layout, and `airProblems` checks the frame on air at every state (no overlap, no cut, nothing off
the frame).

| Route | Templates | Recognition | Controls asserted |
| --- | --- | --- | --- |
| Plain fields | Sponsor bug, Topic card, Social handle, Sign-off, Now and next, Headline card, Statement, Station ident, Logo mark, Sponsor strip, Event ident, Award mark, Location chip, Call to action, Product card, Offer card, Listing card | automatic (no recipe) | every named text is a field; the first retyped long, updated on air, fits |
| Pictures | QR card, Versus, Framed picture | automatic (`f:` pictures are fields) | as plain, and each picture slot takes a sent picture on air and restores the drawn one when emptied |
| Frames | Two-up frames | automatic | as plain, and nothing is painted at either window's centre |
| List | Key facts, Recap card | automatic (`Item n`) | Entries fills the items; Next reveals the last, then the next, each staying up |
| Choice | Live bug | automatic (`choice:Status/...`) | Replay shows only Replay; Delayed only Delayed |
| Quiz | Answer board, three answers; two answers | automatic | Select B, Lock it in, Reveal correct: Correct B, Wrong on the others |
| Credits | End credits, pages; End credits, still board | layout automatic; playback author choice (Cards; Hold still), recorded in library README and coverage | pages: first page with title, Next card the second; still: holds with nothing rolling, roles left of names |

One visual family: one renderer made every new preview (`#7B8494` backdrop, 960 by 540, Manrope)
and the layer check (`scripts/check-example-layers.mjs`) passes on all 65 files.

## AC-5

- Live vote (imported): "Live vote: an imported vote stays open until the operator closes it, and
  Live figures shows the figures while it is open". After three seconds with no press the badge
  is up and the figures wait; Live figures set to live shows 75% while still open; only Close
  voting ends it. Result: pass.
- Vote results (imported): `e2e/production-audience.spec.ts` "saved Vote results and Message
  templates are offered in their pickers and each pick stages one working cue" (TL1), unchanged;
  the built-in Vote results board's Figures selector (percent, count, both) is
  `e2e/audience-pack.spec.ts` "result boards: three layouts by three placements...". Not re-run
  here: neither file nor the code under it changed.
- Poll result: not done in TL4. Its template needs the poll-rows recipe extension
  (`coverage.json` row `poll`, phase TL5), so its separate case lands with it in TL5.

## AC-6

"Countdown: the last ten seconds pulse, zero flashes once, and Pause, Reset and reduced motion
behave" (twelve-second count): the warning lights at ten seconds and pulses (opacity seen below
0.9); Pause holds it lit and still (opacity 1, no motion), Start pulses again; at zero the
warning goes and Time up flashes once and rests (opacity 1, scale 1, its tween finished); Reset
shows 0:12 with nothing lit or moving; with reduced motion the same looks light and nothing
moves. The bar shortening and Reset filling it to the drawn track are in the countdown batch.
OGraf seeks: see AC-7. Result: pass.

Mutation: with the runtime's motion call removed, both motion cases fail (see Verification).

## AC-7, the countdown motion per export target

"Countdown: the pulse and the flash play in every export target, and OGraf seeks land on the same
frame in any order": each target is built from the imported countdown with a three-second count,
loaded as its host loads it and driven as its host drives it.

| Target | Mode | Result |
| --- | --- | --- |
| SPX | update, play | pulse, then flash at zero |
| CasparCG | update (JSON), play | pulse, then flash |
| H2R | update, play | pulse, then flash |
| HTML overlay | autoplay with baked data | pulse, then flash |
| OGraf | real time: load, playAction | pulse, then flash |
| OGraf | non-real time: schedule, goToTime | in-order walk every 0.2 s; seven out-of-order seeks each equal to the in-order frame; the warning dims and moves; Time up scaled up on its first frame, at rest from one second later |
| LiveOS | real time (live-only package) | pulse, then flash |

The same case checks the gate: the imported countdown passes it, and the same graphic with a real
`https://` image, or a look-alike of the SVG namespace, is still refused.

## Tests and budget

Minutes, measured on this cloud worker (4 CPUs, 2 browser workers), the per-test times summed
from Playwright's list reporter:

| | Before (base, job j-0001) | After (this branch) |
| --- | --- | --- |
| `svg-templates.spec.ts` | 15 tests, 15 templates, 101.7 s (6.8 s a template) | 19 tests, 43 templates plus three new cases, 281.2 s; the 16 batches 211 s (4.9 s a template), the three cases 70 s (job j-0008) |
| `svg-examples.spec.ts` | 21 tests, 134.9 s | 6 tests, 123.9 s, the same 19 templates and the show walk (job j-0008) |

A batch saves the per-test page and fixture start (about a quarter of a template's time on the
studio set, 8% on the navy set, where the show walk dominates). The studio file still grows,
by what TL4 adds: 28 templates and the AC-5, AC-6 and AC-7 cases. The capacity check
(`scripts/e2e-capacity.mjs --changed origin/main`) passes with the run's standing warnings.
`check-e2e-protection` counts 21 -> 6 and 15 -> 19 tests; the dated entries in the spec's
"Test maintenance" cover the navy file's removal.

## Verification

- Browser (job queue, this cloud worker, e2e build): `svg-templates` and `svg-examples`, 25
  passed (j-0008, 3.5 min, the minutes above); after the review fixes, `svg-templates`,
  `svg-examples`, `import-svg-behaviour`, `exports`, `ograf-conformance` and `graphic-sound`, 116
  passed (j-0010, 7.3 min); after the simplification, the three countdown cases, 3 passed (j-0011). Mutation: with the runtime's look motion call removed, the AC-6 and
  AC-7 cases fail at the pulse (j-0007); restored.
- Node: `behaviour-reads`, `behaviour-look`, `svg-files`, `check-svg-example-coverage`,
  `concept-names`, `check-example-layers`, `template-coverage`, `illustrator-exports`,
  `check-tree-shape`, `svg-figure-fit`, `deploy-affecting-paths`, `e2e-affected` (200 tests), and
  every Node test that guards the imported-design runtime or the recipes: pass, except the four
  `svg-import-passes` records (inventory, bind, emit html, runtime) that fail the same way on an
  untouched copy of `main` on this machine (local Chromium; the TL2 trap). Pins moved by this
  change and re-recorded: the runtime `js` emit of ten corpus files and the countdown corpus
  file's table, two `appearance.js` hashes in `jev-svg-baseline`, nine credits build pins, the
  countdown paint in `jev-svg-contract` (taken from a local re-record on main and on this branch,
  only where the two differ).
- Review (`/check`, delegated, high): six findings. Fixed: a cleared flash dropped the look's own
  `transform` attribute (restored now); a pulse was judged dead by `isActive()` under a paused
  host (now: still on GSAP's list for the element); the flash ignored the graphic's speed (now
  divided by `motionSpeed()`; the pulse keeps one beat a second on purpose); the namespace skip
  was a host list (now any `xmlns` value and the quoted SVG, XLink and XHTML names); and non-real
  time is refused for imported credits rolls, which restart on font load. Not changed: batch
  titles carry template names (the coverage gate reads its case from a test title, and a name
  says what failed); a failing template still stops its batch, as a failing test did. Simplify
  (inline): one helper serves the OGraf packages in the export test.
- `tsc`, `eslint` on the changed files, `check-copy`, `check-e2e-protection --changed
  origin/main`: pass. README.pdf reprinted (10 pages).

## Final review

- Final `/so` on 3a4678a (fresh read-only cloud session): grade A, AGREE WITH CORRECTIONS, nothing
  blocking. Taken: `docs/OGRAF.md` now names the imported credits refusal and what is proven for
  imported designs (finding 2); TL5's phase line carries AC-5 for Poll result (finding 3);
  reduced motion asked for mid-pulse now stops the pulse, the same finding the PR's automated
  review raised on 3a4678a, with an AC-6 step for it (finding 4). Finding 1, seek parity for other
  imported designs, is issue #2699 for TL5.
- Automated PR review on 3a4678a: one finding (reduced motion mid-pulse), fixed as above; the
  countdown cases pass after it (j-0012, 3 passed).
