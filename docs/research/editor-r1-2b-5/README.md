# R1.2b.5: align, distribute and keyboard transforms

Base: fetched origin/main 5b34aefb4, 2026-10-05, in a fresh worktree on
codex/editor-r1-2b-5. E07/E17, with scoped B02-B04 evidence.

## Why and goal

Finish ordinary artwork layout without source editing: align and distribute
catalog, imported and created artwork, including Pen layers, and move or resize
the selection with the keyboard. Every command or held-key gesture is atomic
and has one undo through the existing source adapters and operation registry.

## Scope and decisions

Owner decisions, 2026-10-05:

- Align to Selection or Canvas. Multiple selection defaults to Selection; a
  single item defaults to Canvas. Use rendered bounds in composition coordinates.
- Distribution uses equal gaps between rendered bounds, leaving the outermost
  items fixed. It requires three independent targets; overlapping arrangements
  may have equal negative gaps. Distribution uses the selection's extent.
- With canvas focus: Arrows move one composition pixel, Shift ten.
  Ctrl/Cmd+Arrows resize width/height by one layer pixel, Shift ten. Text boxes
  reflow; other artwork scales in local axes about the existing pivot. A held
  key, including auto-repeat, is one undo. Escape cancels the complete gesture.

Use the current revision and playhead pose, parent inverse mapping and existing
base/key behavior. Preserve independent animation channels and authored keys.
Ancestor/descendant selections cannot be arranged independently and refuse
specifically. Unknown or mixed unsupported targets refuse as a whole, beside
the controls, preserving source and history. Text inputs, timeline keys/flags,
Pen drafting and ordinary browser text shortcuts retain keyboard ownership.
Changing source, selection, playhead or focus cancels a transient gesture safely.
An authored SVG or CSS transform the writer cannot resize along its local axes
about the existing pivot specifically refuses unarmed base
resize, which the existing CSS scale writer cannot apply in those axes exactly;
alignment/nudge still work, and eligible animated scale uses the current writer.
One layer spanning both outer edges also refuses fixed-endpoint distribution.
Source remains the only persisted artwork model.

No grouping, folders/bins, loops, canvas typing, vertex alignment, advanced
vectors, new source format or export runtime. The settled anchor contract
remains: moving the pivot changes only the pivot; new artwork starts centered.

## Observable acceptance

1. Six visible alignment commands work against both references. Unequal-width
   items distribute with equal horizontal/vertical gaps and fixed endpoints.
2. Catalog, nested/transformed imports and created shapes/images/Pen layers
   move in composition coordinates, preserving siblings, fields and assets.
   Rotated/scaled artwork aligns by its actual rendered bounds.
3. Nudge, coarse nudge and width/height resize work from canvas focus. Held-key
   previews change pixels without source writes, release commits once, undo
   restores exact source/pose, and Escape/blur/stale edits cannot commit a draft.
4. Armed properties key at the playhead; unarmed properties change the base.
   Existing keys/motion and mixed base/key selections survive. Unsupported
   batches and collapsed parents explain refusal without partial changes.
5. Inputs, timeline shortcuts and Pen drafting remain quiet on the artwork
   mutation path. Cancellation and stale-revision guards are mutation-tested.
6. Complete template search through created artwork, align/distribute/nudge,
   save/reopen, and execute SPX, CasparCG and OGraf exports. Inspect desktop
   1920x1080 and laptop 1366x768 layouts, including 125% zoom.
7. Written-first browser acceptance fails on unmodified main. Relevant editor,
   anim-engine and inspector regressions run in one queued job; affected checks
   use E2E_WORKERS=3, then build, /check and /queue-merge. Confirm queue entry,
   merge and deployed /version.json. Owner judgment is asynchronous; full B04
   and physical receiving-host acceptance stay open.

## Evidence

### Written-first baseline

The first five-case browser acceptance ran on the unmodified fetched-main
snapshot: one capability probe passed and four behavior cases failed for absent
alignment, distribution, held-key movement and resize. See
[written-first acceptance](written-first.spec.ts.txt) and
[baseline log](written-first.log). The implementation was restored only after
that run. No retired-editor skip was used as feature evidence.

### Review and simplification

Review and simplify ran inline against the exact branch diff from 5b34aefb4.
The available review connector exposes check inspection, with no callable review
initiation capability. Confirmed findings were fixed: stale error precedence;
sample-data gesture invalidation; canceled OS repeats restarting a gesture;
coarse scale precision; distribution choosing a start-sorted item instead of
the true farthest rendered endpoint; source transforms resizing in the wrong
axes or moving their pivot; the phone grid retaining three rows after adding
the arrangement row; and coarse position precision under a normalized SVG parent.
The precision and source-transform failures were reproduced before their fixes.

Simplification removed an unused gesture accessor, kept the preview callback
stable, and shared the fine transform rounding helper in the existing base
writer. Source capability inspection and the existing parent inverse, pose,
base/key, text-box and transaction writers remain the only authoring paths.

The first broad affected run reported four failures: two phone viewport-height
checks and two exact numeric/drag source-parity checks. The phone row was fixed.
The parity fixtures now enter the actual scale percentage instead of truncating
it to three decimals; their exact source equality assertions remain unchanged.
[First regression log](regressions-first.log) retains the failures.

### Guards and task evidence

Five native geometry fixtures cover all six edges and both references, unequal
gaps and stable endpoints, thin/overlapping bounds, invalid inputs and identities,
and the actual rendered extreme. The initial browser receipt is
[browser log](browser-first.log); the final run below covers the expanded suite.

Seventeen distinct mutations cover count/finite/identity checks, equal gaps and
true outer endpoints, scale and position precision, parent inversion,
source writes during held-key preview, cancellation and stale views, canceled
repeats, text-input and Pen ownership, text-box pivot, source local axes,
collapse and ancestor/descendant refusal. The source is restored byte-for-byte
after every isolated queued run, with two seconds after writes and restores:
[15 guard mutations](mutations.log),
[source-frame mutation](source-frame-mutations.log), and the position-precision
[position-precision receipt](position-mutations.log).
[SVG before the guard](svg-before.log),
[CSS control cases](source-frame-controls.log) and
[normalized SVG before the precision fix](position-before.log) preserve the
reproductions. The [mutation runner](mutations.mjs) runs each named guard.

The complete task uses template search for Hairline, creates two rectangles and
a closed Pen badge through the UI, selects timeline rows, aligns and distributes
the three items, and performs a coarse keyboard nudge. Save settles to durable
storage before reload; reopened source and motion match exactly. Registry
exports for SPX and CasparCG execute their play() entrance, and OGraf executes
load() and playAction(). All three reach the authored world bounds without
browser errors. This proves the local exported programs, while physical
receiving-host acceptance remains open.

Rendered [desktop](desktop.png) at 1920x1080,
[laptop](laptop.png) at 1366x768 and
[125% viewport equivalent](laptop-125.png) at 1093x614 were inspected: controls
wrap, panels remain readable and the artwork stays visible. The last is a CSS
viewport proxy, not a physical display or browser-native zoom check.

### Final verification and landing

The final queued job j-3399 ran with E2E_WORKERS=3 and a 120-minute cap:
npm run test:e2e:affected selected 33 spec files, including anim-engine and
inspector, and passed 328 active checks. All 25 arrangement cases passed.
It retained 134 existing retired-editor skips, which are not claimed as passes.
The same job passed all 35 catalog checks. Its own exit code is 0:
[final regression receipt](regressions.log).

The five native fixtures, TypeScript, focused lint, documentation index and
owner-queue checks passed. Seventeen distinct guard mutations were killed over
three isolated queued runs; every source was restored byte-for-byte.
Historical research artifacts rewritten by the broad run were restored before
committing and building.

The full build runs on the final committed tip before /check stamps it.
Its own exit, commit-bound inline review/simplify/verify stamp, actual queue
entry, merge and deployed revision are recorded in the pull request and final
session report. The queued branch is frozen throughout landing.

The [desktop owner item](../../acceptance/owner-queue/2026-10-05-editor-arrangement.md)
requests workflow comfort after deployment. Full B02/B04, physical hosts and
owner judgment remain open. Grouping, bins, loops, canvas typing and advanced
vector work were not implemented.
