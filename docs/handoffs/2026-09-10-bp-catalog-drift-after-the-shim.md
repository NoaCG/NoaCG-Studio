# BP - the catalog render baseline, and which of the two endings was true

Branch `claude/bp-catalog-drift-after-the-shim`. **Neither of the two endings the row was given
was true, and the third one is.** The flex-gap shim did not move a single element in any of the
504 catalog designs. The render baseline was simply four days stale: two earlier commits added a
hidden `display: none` data holder to the markup of 24 designs, re-recorded the SOURCE baseline
beside it, and left the RENDER baseline behind. The baseline is re-recorded here, and the gate is
green on this laptop for that reason.

Nothing about this is observable in the product - no rendered pixel moved anywhere - so there is
no `docs/acceptance/owner-queue/` item.

## The verdict, and how it was earned

**It is 24 designs, not 26.** The failure prints 26 added lines because two of them are the
diff's `Array [` and `]`. The set is cr01, cr02, cr03, cr04, cr06, cr08, cr11, cr12, cr13 and
tk01-tk06, tk11-tk17, tk20, tk22. Both earlier reports say 26; row BN's backlog file inherited the
count from the older one.

**Every one of the 24 has exactly the same cause, checked one design at a time** (job j-0996's
per-element records against `e2e/catalog-render-baseline.json`, which the failure writes to
`test-results/catalog-baseline-.../rendered/<id>.txt`). In each design:

- exactly ONE element key moved, and it is a `div.noacg-data-source` holder;
- that key is NEW - the baseline never had it, so nothing "moved" at all;
- it is the LAST holder in document order, which is where both families emit the speed field;
- its rect is `0,0,0,0` and its record is byte-identical to a holder the baseline already had, so
  the element is hidden and carries no geometry;
- the element count is up by exactly one, never more.

**The cause is named, not inferred.** The set of designs whose emitted HTML changed in the two
speed-field commits is EXACTLY the set that drifts - 24 and 24, with nothing left over on either
side. `cde2a2da` (2026-09-06, "Give credit rolls an operator speed") moved cr01, cr02, cr03, cr04,
cr06, cr08, cr11, cr12, cr13; `1a9269c0` and `4b6642e5` (2026-09-09, the ticker speed field and
its narrowing) moved the fifteen tickers. Both re-recorded `e2e/catalog-baseline.json` and neither
re-recorded `e2e/catalog-render-baseline.json`, whose last recording is `aa15e625`, 2026-08-28.

**Which says the shim is innocent, positively rather than by elimination.** The baseline predates
the shim by thirteen days, and every design in the catalog is compared against it. The comparison
covers 9,793 elements across all 504 designs - the spec's 80-element cap is never reached by any
design, so there is no unmeasured tail to hide in. Of those 9,793, the number whose computed style
or rect moved after the shim landed is ZERO. PR 229's own sweep counts 289 designs carrying a flex
gap between painted items; not one of them moved. That is what a shim which returns at its feature
test looks like from the outside, and it is what the shim is written to do on any engine from
Chromium 84 up.

**The two dates the reader needs.** The gate went red on 2026-09-06, was first READ on 2026-09-08,
and was first attributed correctly today. The shim landing on 2026-09-10 is a coincidence of who
ran the spec on which morning, nothing more.

## What was done

- `e2e/catalog-render-baseline.json` re-recorded. Only the 24 designs above change, each gaining
  one hidden-holder key and one on its count; every other fingerprint in the file is byte-identical
  to the 2026-08-28 recording, which is itself the proof that nothing else moved.
- `e2e/catalog-baseline.spec.ts`: the baseline now records the DAY it was taken, the failure message
  prints that day and hands over `git log --since=<that date> -- e2e/catalog-baseline.json`, and a
  drifted key the baseline never had is marked `+` and shown FIRST, since only four keys fit on the
  line and one element inserted mid-subtree renumbers every later sibling. The old message named
  only the cause that has never yet been the real one, and it sent two sessions down the wrong path.
- `docs/backlog/a-fourth-data-holder-appears-in-credits-on-this-laptop.md` deleted - it asked for
  exactly this verdict and got it. Its guess that "the laptop renders one holder more than CI does"
  was wrong in an instructive way: CI renders nothing, because the comparison skips on Linux.
- `docs/backlog/catalog-render-baseline-only-runs-on-one-laptop.md` updated rather than replaced.
  It was filed on 2026-09-08 and already owns the open half, so the settled half goes in it: the
  verdict, the corrected count, and the correction of its own guess that the first-frame paint was
  involved. A fourth shape is added - run it daily against `main` and let the morning brief speak
  the red - and the instruction to investigate the nine credits records is removed, because that
  is what this row did. This row's first draft filed a THIRD item for the same problem; the review
  caught it, and it is gone.
- `docs/VERIFICATION.md` gains one sentence: `recorded` is the line in the render baseline that
  always moves, so the "nothing existing changed is the healthy shape" rule beside it stays usable.

## The check

`review: delegated` (6 findings, 6 acted on), `simplify: inline`, `verify: inline`,
`taste: not applicable` - nothing in this change can move what a graphic looks like; it touches a
spec, a recorded fingerprint and three documents, and no design file, shared template machinery,
fit or alignment code.

The review's scope was checked against this worktree before any of it was believed: it reported
merge base `4b7a121f` and the same five paths that `git diff --name-only 4b7a121f..HEAD` plus
`git status --porcelain=v1` report here. It matched, so the pass counts.

It earned its keep. **Its first finding is the one that mattered**: the shelf already carried
`catalog-render-baseline-only-runs-on-one-laptop.md`, filed 2026-09-08 for the same hole and
naming two of the same shapes, and this row's first draft had filed a THIRD item for it without
noticing. That file is now the one that owns it. The other five were a `+key` sentence pointing at
a rect the message never prints, a four-key truncation that could hide every `+`, `recorded`
making the render baseline's diff non-additive against advice in `docs/VERIFICATION.md`, a
UTC-versus-Helsinki day, and a reference to a file that does not exist in this tree.

The simplify skill returned fan-out instructions rather than a result, so that leg ran inline over
its four angles. It found one thing worth changing: `localDay()`, written to answer the review's
UTC finding, was a lone divergence from `toISOString().slice(0, 10)`, which eleven generated files
in this repository stamp - one of them, `scripts/check-ograf-schema.mjs`, into a field with this
same name. Two files written the same night disagreeing about the clock is worse than a three-hour
window, and `git log --since=<a bare date>` reads local midnight, so a UTC stamp looks further back
rather than less far. The helper is gone and the comment names the clock.

`npm run build` exit 0 (its own exit code, twice). `npx playwright test catalog-baseline` green
four times: j-0998's recording pass and its verifying pass, and j-1003 after the check's edits -
that last one while a full build ran beside it, which is the load the spec's own comments warn
about, and it still matched.

## What row BN's file owes

`docs/backlog/catalog-render-drift-after-the-flex-gap-shim.md` (on `claude/bn-private-command-topic`,
PR 233, in flight as this was written) is answered and should be DELETED once both branches are on
main - not edited, because its Why is now settled rather than changed. For the record it closes on:
its "likely cause" section is wrong. The shim's `'unknown'` feature-test path is not involved; the
catalog spec renders into an iframe that has a width and a height, so the probe answers cleanly and
the shim returns at parse time. The reasoning that "every drifted element is a `.noacg-data-source`
holder" was the right observation pointed the wrong way: a hidden holder cannot move, which is
exactly why its appearance is a markup change and not a layout one.

## Traps that exist in no repo file

- **A drifted key that is NEW reads identically to one whose record changed**, in the old failure
  output. That is the whole reason two sessions reasoned about geometry that had not moved. Fixed
  here with the `+` marker, but anyone reading an OLD failure log (j-0985, j-0991, and j-0996's
  first half) still has the ambiguous form in front of them.
- **`#count` moving is the loudest signal in that spec and it is nearly always markup, not look.**
  A computed style or a rect cannot change the number of elements; only the DOM can.
- **A `display: none` holder's record is a constant.** Rect `0,0,0,0`, everything else inherited.
  Two holders in the same design have byte-identical records. If a holder key is in the drift list,
  the only thing that can have happened is that it was added or removed.
- **The render baseline and the source baseline move for different reasons ON PURPOSE**, so the
  obvious gate - "if one moved, the other must" - is wrong: a tokenization commit moves the source
  and must leave the render alone. What actually distinguishes them is whether the emitted HTML
  moved, not whether the emitted CSS did.
- **A landing job holds the whole browser budget.** j-0998 sat behind a 21-minute `land-watch` for
  its entire wait while doing nothing that needs a browser. That is
  `docs/backlog/a-live-landing-starves-every-browser-job.md`, and it is why this row's re-record
  arrived long after its verdict did. The verdict itself needed exactly one queued run.
- **Before filing a backlog item, grep the shelf for the problem rather than for the symptom.**
  This row searched for the drift and found row BN's file; the item that actually owned the
  problem was filed under the GATE, two days earlier, and only the code review caught the
  duplicate. 231 files is past the size where a name you would have chosen is a reliable search.

## Needs the owner

Nothing.

## Pointers

- The gate: `e2e/catalog-baseline.spec.ts`, the render test at the end of the file.
- Its blind spot: `.github/workflows/catalog-gates.yml`, the "Catalog specs" step's comment.
- The commits that moved the markup: `cde2a2da`, `1a9269c0`, `4b6642e5`. The last render recording
  before this one: `aa15e625`.
- Jobs: j-0996 (the reproduction), j-0998 (the re-record and its verification).
