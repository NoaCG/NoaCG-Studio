# R1.2b.6: groups and local editing

Base: fetched origin/main 7878a4ef4, 2026-10-05, in the fresh
codex/editor-r1-2b-6 worktree. Scope: E07 and the group portion of B02.

## Why and goal

Organize related artwork into a transformable group, edit its members in
context, and ungroup without changing their appearance or motion. Source stays
the persisted artwork model. The shared operation registry and session own
atomic edits, revision checks, cancellation and history.

## Scope and overnight decisions

The settled owner scope is a group with its own transform, parent bar, local
child ruler and breadcrumbs back, while the canvas remains visible. Root
Step/Out flags alone control broadcast holds. Anchor edits move only the pivot;
new group anchors start at the center of the selected artwork.

- Group 2 to 100 contiguous sibling layers. Preserve their source order and existing
  placement coordinates, text masks, identities, fields, assets and keys.
  Refuse mixed parents, parent/child selections and layouts or selectors whose
  meaning would change. Never silently reorder unselected artwork.
- Enter a group from its timeline row or canvas. Breadcrumbs navigate nested
  groups and back to the composition. Local editing filters the layer rows,
  retains the parent bar and shows time relative to its first visibility start.
  One composition playhead still drives preview and all authoring operations.
  Root markers remain visible as read-only references locally; create/move
  Step/Out remains a composition operation.
- Ungroup identity groups directly. If a group owns transform motion, retain
  readable source carrier wrappers per member rather than approximate its
  composed motion as child keys. SVG retains one shared transparent carrier,
  preserving the original bounding box GSAP uses for its pivot. Members keep
  their IDs and editable channels.
  Refuse group compositing effects that cannot be split exactly.
- Group eligible SVG members before authoring their motion. A static source
  transformOrigin initializer uses the existing interpreter to establish the
  centered SVG pivot before member motion; it stays outside key authoring and
  never moves with the parent bar. Source with existing member motion refuses
  this structural command exactly.
- Draw and import new artwork in Composition, then group it. Local group editing
  refines existing members; its creation controls explain this boundary.
- Use existing source adapters and source patches. No second scene, exported
  runtime or reusable instances. Folders/bins, loops, canvas typing and advanced
  vectors remain outside this slice.

## Observable acceptance

1. Written-first acceptance runs on the unchanged main snapshot, reproducing
   missing grouping/navigation and recording current nested selection capability.
2. Created shapes, Pen artwork, text masks and eligible imported SVG group
   without a rendered jump. Group movement, scale, rotation and anchor preserve
   child offsets; nested/transformed parents preserve fine coordinate precision.
3. Child and group motion survive grouping and exact ungrouping at multiple
   playhead times. Fields, asset bytes and member identities remain unchanged.
4. Enter/navigate/back changes selection and visible rows coherently. A parent
   bar and labeled local ruler remain beside the visible canvas; only root
   Step/Out flags control holds. Parent bar edits preserve relative child keys.
5. Each command/gesture has one exact undo/redo. Escape, stale source/assets,
   source updates and keyboard focus ownership cannot commit a transient edit.
   Unsupported commands explain refusal beside their control and leave source,
   selection and history unchanged. Relevant guards are mutation-tested alone.
6. Complete template search, created shapes and Pen artwork, grouping, member
   editing and motion, save/reopen, and executed SPX/CasparCG/OGraf exports.
   Inspect rendered desktop/laptop layouts and a 125% viewport proxy.
7. Run editor regressions including anim-engine and inspector in one queued job
   with E2E_WORKERS=3, restore rewritten historical artifacts, build, /check and
   /queue-merge. Confirm actual queue entry, merge and deployed /version.json.

Full B02/B04, owner judgment and physical receiving-host acceptance stay open.
The asynchronous [desktop item](../../acceptance/owner-queue/2026-10-05-editor-groups.md) follows the complete working task.

## Evidence

- **Acceptance 1, pass:** j-3416 ran the five written-first cases against the
  unchanged 7878a4ef4 source: one nested-selection probe passed and four cases
  failed on missing group controls. [Baseline log](written-first.log) and
  [original test source](written-first.spec.ts.txt) retain that result.
- **Acceptance 2-5, pass:** j-3455, `E2E_WORKERS=3 npx playwright test
  e2e/editor-groups.spec.ts`, passed all 32 cases. [Group log](groups.log).
  These include HTML and SVG geometry, masks/fields/assets, nested transformed
  parents, repeated child/group motion, centered/static SVG pivots, fine member
  movement after transformed ungroup, parent bar movement/trim, root flag
  ownership, local ruler/breadcrumbs, undo/redo, transient gestures, keyboard
  ownership, stale revisions and whole-batch/exact refusal.
- **Acceptance 6, pass:** the real Hairline search task draws two rectangles
  and a closed Pen triangle in the canvas, groups/moves/scales them, edits a
  member's rotation and child/group motion, saves and reopens exact source,
  then executes SPX, CasparCG and OGraf output and compares settled world
  bounds within 0.05 px. No page errors. The task ran at 1920 × 1080,
  1366 × 768 and a 1093 × 614 proxy for 125% laptop zoom.
  [Desktop](desktop.png), [laptop](laptop.png), [125% proxy](laptop-125.png).
  Agent judgment: clear group breadcrumb and highlighted parent row; the stage
  remains visible and child rows scroll. Compact group creation controls
  explain the Composition boundary. Owner comfort remains unaccepted.
- **Acceptance 5 mutation evidence, pass:** j-3456 ran alone. Its unmodified
  control passed; all thirteen mutations were killed: sibling contiguity, structural
  selector meaning, group compositing effects, parent-coordinate inverse,
  descendant key movement, exact transform carriers, wrapper inheritance,
  measured-motion selectors, member blending, removed group-marker paint,
  added carrier-marker paint, frame-attribute selectors and nonzero serialized
  frames. The runner validated mutated syntax before execution, waited two seconds after writes/restores,
  and confirmed byte-for-byte restoration. [Mutation log](mutations.log).
- **Native/source checks, pass:** TypeScript, focused ESLint, 77 browser/queue
  guard checks (one existing platform skip), and
  `node --test scripts/canvas-transforms.test.mjs scripts/key-ease.test.mjs
  scripts/sound-edit.test.mjs` (18 checks), plus `git diff --check`.
- **Final review regressions, pass:** j-3436 reproduced inherited wrapper
  paint, measured-motion targeting the new wrapper, and member blending during
  transformed HTML ungroup before their fixes. [Written-first log](review-written-first.log).
  j-3445 reproduced local Project placement adding root artwork
  ([placement baseline](placement-written-first.log)); j-3447 reproduced removed
  group-marker paint, added carrier-marker paint, frame-attribute selector
  changes and a serialized frame rounding to zero
  ([source-style baseline](source-style-written-first.log)). The final 32-case
  run includes all eight regressions.
- **Acceptance 7 regression, pass:** j-3430 ran the full affected suite in one
  queued job with E2E_WORKERS=3, including anim-engine and inspector: 1,473
  active checks passed, with 542 existing skips retained. All 35 catalog checks
  passed. [Full regression log](regressions.log). The checkout's player-host
  dependency junction was repaired after an initial setup-only run; both
  affected import cases passed as a preflight before the complete green run.
  j-3452 rechecked image and asset workflows after the Project control fix:
  17 passed, with 25 existing skips ([image regression log](images.log)). Historical research images/JSON were
  restored before committing or building. The pull request records the build
  on the committed tip, stamped check, actual merge-queue entry, merge revision
  and deployed version.

## CI fixture repair

PR #709's first push shard (run 37386988484, job 112022624829) failed at the
initial fixture mutation, before the canvas transform case began. Its other
163 active cases passed. [Whole job log](ci-fixture-failure.log). The inspected
trace contains one app navigation/request and the full-stop error emitted by
Playwright's protocol-error rewrite. This matches the repository's documented
[promise-collection mechanism](../context-destroyed-flake.md); the raw Chrome
error was discarded by Playwright, so that mechanism is inferred from the
matching trace and existing investigation.

The new group spec now uses the existing evaluateInPage helper for its JSON
page calls. It holds each promise until Chrome reports the result and retains
page exceptions. No assertion or guard was weakened. Auto-merge and the local
landing watcher were withdrawn before the change. j-3455 passed all 32 cases
and 20 repetitions of the failed canvas-transform case. j-3456 reran all
thirteen mutations alone with byte-exact source restoration. Production code
is unchanged by this repair; the full affected and image regression receipts
above still cover that source. The PR records the rebuilt and restamped tip.

## Review and boundaries

The inline review fixed the new spec's fixture promise handling, precise member placement inside transform carriers,
unnecessary JS reformatting on static ungroup, timeline drafts/selection leaking
across group navigation, lossy anchor edits on unknown animation data, parent
movement incorrectly treating child pivot keys as static group initializers,
compact laptop toolbar/timeline overflow, inherited paint on new wrappers,
new wrappers targeted by measured-motion selectors, split member blending,
local Project placement, removed group-marker paint, added carrier-marker
paint, frame-attribute selector changes and frames rounding to zero. Together
with mutation runner ownership/cleanup and rejection of infrastructure failures
as mutation proof, review fixed 17 findings. Simplification reused one neutral
wrapper style guard and the memoized hierarchy for group controls, expanded the
parent adapter into readable steps and reused the existing source/runtime
helpers.

The review also corrected the mutation runner's browser ownership:
it uses an absolute CLI path and the recognized
[mutation bench](../../../scripts/editor-group-mutation-bench.mjs), keeping
the browser slot through writes and restores. Its cleanup reports restoration
without masking the original failure. An overlapping attempt was canceled
and its interrupted inheritance mutation restored before the final isolated run.
j-3449 restored every source, but its carrier case failed on a rewritten browser evaluate error
before the behavior assertion and the job lost its terminal verdict.
That attempt is excluded as proof. The bench now requires a behavior assertion,
retries an inconclusive case once and rejects unresolved infrastructure errors.
Run the bench through the queue with `npm run test:editor-groups:mutations`.
No extra dependencies or exported runtime were added.

New groups own only source transform and visibility. Unsupported layout,
structural/pseudo/state selectors, noncontiguous or mixed-parent selections,
inherited wrapper paint, measured-motion targeting a new wrapper, unknown group
CSS/custom behavior and compositing effects (including member blending on
transformed HTML ungroup) refuse beside the controls. SVG with pre-existing member motion must be grouped before motion
is authored. HTML preserves existing member motion during grouping.
HTML transformed ungroup keeps a carrier per member; SVG keeps one shared
carrier to preserve GSAP's bounding-box pivot. This is readable persisted source,
not a reusable precomposition. Scoped timeline UI state resets on navigation.
Independent translation preserves fine placement inside groups and carriers;
its readable CSS marker survives neutral ungroup and reopening.

Full B02/B04, folders/bins, reusable instances, loops, advanced vectors, canvas
typing, actual owner acceptance and physical receiving-host acceptance remain
open. The 125% check is a viewport proxy, not a physical browser zoom check.
