# R1.2b.4: bounded Pen

Base: fetched `origin/main` `5b91be155`, 2026-10-03. R1.2b.3 is landed.

## Why and goal

E06/B04 need simple custom artwork drawn and adjusted without source editing.
Add the settled Pen interactions to the existing canvas and operation registry.
Readable SVG remains the source of truth; there is no persisted vector scene.

## Scope and decisions

- Click adds a corner; drag adds paired cubic tangents. First point closes,
  Enter finishes an open path, Escape cancels, Backspace removes the last point.
- Evaluate an original native single-subpath M/L/C/Z adapter in Node first.
  Relative forms and repeated arguments are accepted without changing untouched
  source. Other commands, multiple subpaths, driven geometry and ambiguous
  source refuse with a specific reason beside Edit points. No third-party code.
- SVG attribute transforms are supported. Independent CSS scale/rotate/translate
  on SVG ancestors have a bounded refusal. Paths use the native screen CTM,
  including transformed HTML parents. Singular poses remain inspectable and
  refuse an inverse edit with a specific reason.
- New paths use an HTML layer containing SVG, with a centered transform pivot
  (owner decision), normal layer transforms and one visibility bar at the playhead.
  Geometry edits retain that original transform frame and pivot, so changing a
  vertex does not shift existing motion. SVG overflow remains visible.
- Edit points in Properties enters Pen editing for the selected path. Drag a
  vertex or either tangent. Vertex movement carries its tangents; each tangent
  can subsequently move independently. Select returns to whole-layer transforms.
- Open paths start with no fill and a visible stroke; closed paths have a solid
  fill and stroke. Properties exposes fill (including None), stroke and width.
  Stroke width reads unitless and pixel attributes. Relative units retain their
  source and explain the refusal beside the control.
- Drafts retain the starting revision and playhead; source/pose changes cancel
  or refuse completion. Every completion and edit gesture is one transaction/undo.

No align/distribute, grouping, bins, loops, canvas typing, Boolean operations,
auto-tracing, variable-width strokes, morph animation or new export runtime.

## Observable acceptance

1. Catalog, imported SVG/raster and created graphics draw a triangle and open
   polyline, show draft points/handles, select the completed layer/bar and preserve
   untouched source and motion. Hairline maps frame points into its low drawing
   root, including negative y. New transform pivot is centered.
2. A closed cubic shape serializes and renders readable M/C/Z; vertex and tangent
   edits under transformed SVG parents map exactly and undo as whole gestures.
3. Backspace, Escape, pointer cancellation, tool switches and stale revisions
   leave no orphan source/history. One-point completion and invalid geometry refuse.
4. Fill, stroke, width, whole-layer movement, scale/rotation and visibility at
   the playhead work. Unsupported commands/drivers explain refusal at the control.
5. Complete a task through real template search, save/reopen in the UI, execute
   SPX/CasparCG/OGraf exports and compare path source and rendered geometry.
6. Written-first browser acceptance fails on the unmodified-main snapshot; native
   adapter fixtures and guard mutations pass. Run editor/anim-engine/inspector as
   one queued job, affected checks with E2E_WORKERS=3, build, /check, /queue-merge,
   then confirm queue entry, merge and deployed version. Owner desktop judgment
   is asynchronous; full B04 and physical playout-host acceptance stay open.

## Evidence

The unmodified application remained at the base throughout j-3093. The probe
passed on catalog, imported SVG and F4: zero Pen tools and point controls. Seven
written-first acceptance cases failed on the absent Pen button. The exact initial
spec is [written-first.spec.ts.txt](written-first.spec.ts.txt), and its output is
[written-first.log](written-first.log).

The original native adapter passes seven Node fixtures: corner/relative/cubic
round trips, curved closure, coordinate and syntax refusals, point movement with
carried tangents, independent handles, exact cubic bounds, affine mapping and
source-token preservation. No dependency, persisted model or export runtime was
added. The complete curve capability is therefore included in this bounded slice.

j-3098 passed all 11 focused browser cases (36.2 s). Anonymous imported SVG points
and tangents map under a translated, rotated, nonuniformly scaled parent; the
first edit mints an identity, and undo restores original bytes. Creation, paint,
one-gesture history, cancellation, stale-source refusal, template-search Hairline,
save/reopen and executed SPX/CasparCG/OGraf packages pass.

j-3094 found an incorrect test expectation: a cubic's frame starts at its actual
extremum, before its first vertex. The corrected Hairline check measures the first
path vertex through its CTM. j-3097 found the historical fixture's existing
interpreter migration on reopen. The save check now requires exact authored
motion, HTML and CSS; each geometry edit still requires byte-identical JS.

Final focused acceptance [j-3158](acceptance.log) passed all 17 cases (34.7 s). It also proves
point coordinates after whole-layer rotation/nonuniform scale, safe inspection
and refusal under a truly collapsed parent, selecting edited geometry outside
its original frame, selecting/moving a horizontal open stroke, and visibility
hidden before creation and visible at the creation playhead. Node fixtures,
TypeScript and the focused lint check pass.

Review reproduced two hit-testing defects: extending a vertex outside the
original frame made it unselectable, and horizontal strokes had bounds with zero
height. Measurement now follows actual path bounds, with a canvas tolerance of
four screen pixels for paths; the original pivot and transform frame stay
fixed. Forward mapping permits a singular pose while inverse mapping refuses.
The initial zero-scale fixture updated CSS beneath an
existing GSAP layer cache and remained visibly unscaled. Its replacement asserts
that an untracked parent's measured width is zero before checking the refusal. Mutation
evidence showed native SVG mapping already handled that parent, so simplify
removed the redundant HTML transform workaround and retained the native CTM.
Review also reproduced CSS keyframes driving `d` without an edit refusal
(j-3130). The source guard now follows matching animation names into keyframe
properties, preserving animated geometry and paint priority. The guard's named
mutation is included in the final run.

j-3147 reproduced a blank numeric control for a valid SVG `stroke-width="7px"`.
The last UI correction reads pixel widths, preserves them on undo and refuses
relative units explicitly. Its isolated [j-3151](paint-mutations.log) killed both
display/refusal mutations. TypeScript and focused lint also pass.

Review also reproduced duplicate source attributes when an imported path used
uppercase `D` or `STROKE-WIDTH`, or a quoted path value spanned multiple lines.
Source token matching now follows HTML attribute case rules, spans lines,
updates the existing token and refuses mixed-case duplicates. Seven Node
fixtures cover both defects; the transformed imported browser fixture uses a
multiline path and requires exact coordinates and source restoration on undo.
The [j-3157 source mutation receipt](source-mutations.log) killed case, multiline,
literal-value and duplicate-attribute checks, 4/4.

j-3148's browser output reported 17 passes, but the queue reaped its process
before recording an exit status. Its dependent mutation job never ran. The
isolated guards above and final direct-CLI browser run replace those verdicts.

The full isolated mutation job [j-3132](mutations.log) killed 33/33 cases and
restored every source byte. It covers bounded/finite geometry, SVG syntax,
closure/subpaths, indices, affine safety, tangents/extrema, literal attributes,
timeline preservation, CSS/SVG/code drivers, animated CSS ownership, topology,
paint bounds and priority, revision/playhead/cancellation, extended geometry
hit bounds and thin-stroke selection. Each write and restoration waits two
seconds; each browser check owns its headless server. Together with the two paint
mutations and two attribute-matching mutations, all 37 named mutations are killed.
The final source run repeats two existing guards without counting them twice.

j-3135 also proves that clicking an anonymous imported vertex without moving
does not rewrite source or create history. A drag still mints identity on the
first actual edit and undo restores the original bytes.

The first mutation run j-3099 killed 26/27 mutations. Removing the draft revision
guard still reached the registry's stale-source refusal, so source stayed safe;
the acceptance now asserts Pen's own specific refusal. This strengthened check
is included in the passing final run above.

The [desktop](catalog-path.png) and [laptop](laptop-path.png) captures were
inspected for handle visibility, alignment, contrast, panel spacing and usable
canvas/timeline space. The completed Hairline task qualifies the
[desktop judgment item](../../acceptance/owner-queue/2026-10-03-editor-pen.md).
Engineering verification does not close full B04, owner acceptance or physical
playout-host acceptance.

## Broad verification and landing

j-3136 ran all 17 editor specs plus anim-engine and inspector as one queued job,
with `E2E_WORKERS=3`: 259 passed, 20 existing retired-editor skips (6.6 minutes).
The Pen cases also passed inside this combined run. The existing skips remain
visible as gaps; no skipped test is claimed as verified by this slice.

j-3137 ran the affected plan with `E2E_WORKERS=3` and a 120-minute cap: 43 specs,
482 passed and 201 existing skips (12.6 minutes), then 35/35 catalog calibration
checks passed (4.9 minutes). The final pixel-width display and attribute-matching
corrections above came after this broad run; the full 17-case Pen run, seven Node
fixtures and their named mutations verify those contained fixes. Linux CI checks
the final tip and merge group.

/check ran inline over the branch diff: seven confirmed findings fixed (singular
forward mapping, extended bounds, thin strokes, CSS keyframe ownership, pixel
width display, attribute casing and multiline values). Simplify removed unused paint protocol data
and redundant HTML transform composition, and memoized path inspection. The
stamp covers the committed tip. The pull request and session report record the
queue entry, merge commit and deployed version; full B04 remains open.
