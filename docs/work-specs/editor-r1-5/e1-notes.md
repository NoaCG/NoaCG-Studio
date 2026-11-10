# E1 baseline and authoring verification

The previous verified main is `361cb6f628df0a44d410954aae527cde976d1750`
([October Phase 3 closeout](https://github.com/NoaCG/NoaCG-Studio/pull/2294#issuecomment-6723373701)).
After the E1 landing, revert its queue merge with `git revert -m 1 <E1 queue merge SHA>`
on a revert branch and use the normal merge queue. The queue assigns the SHA at landing.

Use the [finalized plan](https://github.com/NoaCG/NoaCG-Studio/blob/f0f2e3fe0c2cc14e23b171957b6f8d18905fd434/docs/work-specs/editor-r1-5/spec.md)
and [November 8 launch receipt](https://github.com/NoaCG/NoaCG-Studio/blob/4cf522a32bf34cd743b38744aba51f6ccb0ae1e9/kit/state.json).
The owner authorized active execution and brought the GSAP request forward. One active
authoring tab on one device per account remains the acceptance boundary.

## Observable checks before product edits

- An imported SVG text layer whose own family aliases the bundled Bebas Neue static file
  shows its real drawable weight, Regular, in the Artwork Weight control. Selecting it
  leaves the source and history unchanged. An alias that points to a variable face
  keeps that face's weight range. An unrelated system family keeps the existing choices.
- Apply the requirement inventory and the original October failure dispositions to the
  pinned source. Exercise the gaps through the reachable Windows editor, preserve
  source and operator fields, and separate native Windows and browser-only results.
  Phase E2 owns loop motion checks and E6 owns Linux text fit and receiving-system proof.

## Reproduction and verification so far

| Check | Result | Scope |
| --- | --- | --- |
| Worker preflight at 2026-11-08T18:23:49Z | PASS | Exact baseline, owned Windows worktree, disposable workspace I/O, Git remote read and GitHub Actions API read |
| Windows queue j-4996, BebasNeue-Regular reproduction | FAIL at the expected assertion on the baseline product | Rendered imported SVG alias resolved to BebasNeue-Regular, but the Weight menu offered Regular, Medium, Semibold, Bold and Extra bold for one drawable weight |
| Windows queue j-4997, `e2e/editor-typography.spec.ts` | 8 PASS, 0 retries/skips | On the alias correction, static font shows Regular even when the old source requests 700, source/history stay unchanged, and the maintained catalog, imported SVG, fit, save/reopen checks pass |
| Windows queue j-4998, fidelity trim, groups, key ease and layer/property qualification | 62 PASS, 0 retries/skips | On the alias correction, ordinary Illustrator and catalog fixtures edit/group/undo/cancel/animate/save/reopen and execute browser-hosted SPX, CasparCG and OGraf outputs. Headless local persistence and browser-hosted output have this bounded scope. |
| j-4999 and j-5000 native attempts | Unverified, no visible owned target | j-4999 exited 0 during browser startup without an observed window. j-5000 started installed Chrome in the desktop session but kept the window hidden. j-5000 was cancelled. |
| j-5001 native attempt | Unverified, app approval timed out after 300 s | Installed Chrome in a fresh profile gave a unique native NoaCG window when launched visibly. No native actions were sent before cancellation. |
| j-5002 native retry | Cancelled before start | The coordinator qualified an alternate native controller. The fresh queued browser did not reach the existing 3.5 GB scheduler floor. No zoom, picker, drop, native save/reopen or native download was observed. |
| j-5003 close flags and key clipboard probes | Cancelled before start | Two focused browser probes were ready. The same scheduler floor held them. No current rendered failure or fix is claimed. |
| Targeted lint, TypeScript and affected gates | PASS | ESLint on the font alias fix/regression, TypeScript app check, 7 cheap gates and 128 Node tests across 8 affected files. No production build or full suite run locally. |
| Isolated Windows backend/account | Unavailable at worker intake | No Docker/Podman executable or running local stack identified; October's disposable branch was cleaned up. `j-5047` later exercised the authorized sign-in simulation. It used isolated fixtures rather than an account or a live backend. |

### November 10 Windows file checks

The owner imported the Illustrator lower third through the Windows picker,
opened the preview again by dropping the fixture from File Explorer, and saved
the SPX ZIP through the native Save dialog in job `j-5042`. The isolated Chrome
profile served candidate `be049c7ea10ee2b8a1bae6d86711ce507a9468a7`. The coordinator
read the 422,113-byte ZIP and confirmed the SPX definition, fixture text, Archivo
fonts and bundled GSAP. The archive SHA256 is
`87cff7d631fa6a665f4c511e753232011e85ade8f9fde3bb2ead112315300325`.
Job `j-5041` opened the same candidate and ended without a completed file receipt.
The separate `j-5004` receipt supplies actual Chrome 125% zoom on the pinned candidate.

The packaged GSAP entry matches the Windows checkout byte for byte. Git
checkout line endings account for its 11 additional bytes compared with the
inventoried upstream runtime. After line-ending normalization the SHA256 is
`92bb9a96476f983d212a2bc4f54c889039c1696dd4461d40a736860938570fbb`.
These checks cover the SVG fixture and SPX download. Raster/logo replacement,
saved-document reopening and account UI still need their own evidence.

Current main `9afdd04df93279429089666e2fb399ddf10854ad` merged cleanly into
the E1 branch at `8f4ced46d0916fe6bde911d856bd8635353a3efb`. Main changed
the import fit runtime and its fidelity baseline in #2355, and the CLI now uses
the wizard's SVG default through #2343. The November 10
native receipt remains pinned to the source actually operated. Retest affected
import and export behavior on the reconciled candidate before claiming parity.

### Agent easing and clip-path splits

The agent guide covered plain GSAP ease names but omitted the data form's key
sides, cubic curves, Hold and jump. The source and generated plugin guide now
explain the destination key's ease, the cue default and how the next key
controls departure. `npm run check:skill` passed for all 32 generated files.

A Node probe bundled the real `applyStep` and `applyOut` authoring operations.
On the reconciled candidate it added a `clipPath` track to `#box` in each
entrance cue of `e2e/fixtures/steps-authoring.json`, from `inset(100%)` to
`inset(0%)`. The emitted source parsed the string keys. Add Step at 0.40 s
and Set Out at 1.20 s each refused to split the crossed track and left the
serialized template identical. This preserves the existing exactness policy
for unsupported interpolation. Windows `j-5059` verified the same refusal from
both editor controls with the full document and history unchanged. The
targeted Node suites for step authoring, easing and full transforms passed 41 tests.

Commit `f589ae0f6` resolves a computed CSS family's template-local alias only when
the matching font-face declarations consistently point to one bundled face.
It reads the supported weights from the existing font registry and retains the
saved CSS and requested weight. No weight option should promise a different
drawing from the same static font. Normal bundled names, imported font choices
and unknown system names keep their existing path. The reference
[Studio v0.17 receipt](../editor-layer-property-qualification/independent/README.md)
has scoped ordinary text and transform interactions, but no comparable SVG alias
weight menu was established. No new reference or usability claim follows from
this inspector correction.

## External prerequisites staged for their dependent phases

| Phase | Lead and package to stage | Missing receipt and resume |
| --- | --- | --- |
| E3 | [Prior model proposal run](../editor-model-proposals/README.md) used the then-configured Anthropic claude-sonnet-5 route. The maintained editor proposal path, free/BYOK routes and external CLI/MCP access are the checks to qualify under existing funding and provider rules. | No current isolated access or model call proven in E1. Qualify the existing route and authorized test account before the real-model check; record task quality separately from deterministic parity. |
| E5 | Recruit two or three first-time broadcast graphics users and a moderator. Use the Illustrator and Starter-to-rundown tasks, short introduction, individual times/assistance sheet and named desktop/laptop setups. Previous owner judgment and bounded native zoom receipts inform task design. | No named participant, moderator or session slot confirmed. Coordinator stages the candidates and obtains attendance/availability before E5. |
| E6 | CasparCG 2.3/2.5 host leads in [receiving guidance](../../ACCEPTANCE_SPX_CASPARCG.md) and [Bridge host notes](../../BRIDGE.md); SPX 1.4.1 OGraf renderer lead in the [actual server walk](../../SPX_ON_A_REAL_SERVER.md), with its documented action limitations. Linux CasparCG or OBS is needed for [#775](https://github.com/NoaCG/NoaCG-Studio/issues/775). | No current receiving host/operator or off-air slot confirmed. E4 can stage the exact font/logo export and expected output. E6 needs a named clean host/version and qualified operator with an off-air or rehearsal output. Confirm actual renderer controls and Linux fit before claiming compatibility. |
| OW1 | [GSAP inventory and owner request](gsap.md). Coordinator received the draft and the exact version and byte receipts. | Written disposition and clean candidate rights, provenance, notices and redistribution review are release decision prerequisites. Engineering through E6 can proceed independently. |

## Boundaries carried forward

The [October single-device closure](../editor-leave-reliability/scoped-closure/README.md)
retains the source pins, original failed and stopped runs, limits, owner
deferrals and the one-active-tab/device operating rule. Save, retain an exported
backup, close the first editor, reopen the intended saved record from Home, and
inspect it before editing. An offline fixture pass is separate from the October
cloud/profile receipt, and browser execution is separate from E6 physical host
qualification. Phase E2 owns #774's loop scope and #775 remains E6 Linux/host
work. The active coordinator is responsible for E1 review stamping, normal
queue entry and exact-merge monitoring.


## November 10 timeline and account observations

On `b4466bfb52d0b804e95462f8c8c8dbad85449fbf`, Windows Chromium job `j-5046`
ran the two saved probes with one worker and zero retries. Both reproduced.
After copy and paste at 0.40 s, the Box X track still held only its original
keys. At a 1093 px CSS viewport, the nearby flag labels overlapped by 66.14 px.
The flag fix must keep each marker at its authored time and give each neighbor
a separate hit area. Full names stay available when the visible label has to
fit a short interval. Inspect, drag, rename and keyboard focus keep their
existing behavior. The viewport probe does not establish physical Chrome zoom.

Job `j-5047` passed all three selected `sync-dot.spec.ts` scenarios with one
worker and zero retries. The team sign-in prompt, delayed personal save
confirmation and session-local recovery ran in an isolated simulation.

## Key clipboard rules

- Copy captures selected values, track owners, effective incoming eases and
  offsets on the concatenated stored ruler. A first key has no incoming
  segment and uses the source cue's default when pasted after another key.
  Copy changes no source, selection, playhead or undo history. A same-track
  time with multiple authored keys is ambiguous, including two cue sides on a
  flag, even when only one reference was selected. An empty selection leaves
  the previous snapshot alone. An attempted copy of a nonempty but invalid
  selection clears it and explains the refusal.
- One snapshot belongs to the current authoring instance and its source
  revision. Timeline remounts, scrubbing, selection changes and live sample
  changes leave it intact. A successful paste keeps it for another position
  at the resulting source revision. Other source edits, undo, redo and
  document switches invalidate it. The paste request still checks the latest
  document revision through the existing session transaction. A still-current
  refused paste keeps the snapshot. A stale paste discards it.
- Paste places the first copied key at the live playhead and retains the
  relative offsets after canonical millisecond rounding. Ordinary scrub
  uses the arriving side of a flag. Explicit inspection uses the departing
  side, including the retained Out side when scrubbing within inspected Out.
  The live session supplies both time and cue. A position outside that cue
  refuses before rounding. An interrupted Out rehearsal, even paused, must
  return to authored time by seeking or inspecting before paste.
  Every new key stays in that one cue, including its endpoints.
  Any authored key at the same stored time on that track occupies the slot,
  including the opposite side of a flag. A synthetic legacy Out or an Out
  with carried motion refuses paste. Nothing extends or clamps a cue.
- Capture records both the uniquely addressable artwork selector and its
  data owner. Paste re-resolves that pair without creating or changing an
  identity. Every target must already have authored keys in the destination
  cue. Inherited-only
  tracks do not acquire keys. The existing ownership and lossless-source
  checks apply to every track. Keep value types. Each composed filter value
  must be recognized in canonical form and have the same ordered functions
  as every existing key in the destination track. Existing filter strings
  are kept byte for byte.
  Refuse the entire batch on a missing, protected, incompatible or occupied
  target. A successful batch adds one undo and preserves the original keys,
  fields, assets and bytes outside the animation data literal. If the guarded
  writer requires an interpreter upgrade, paste refuses. Undo restores the
  exact previous source.
- Ctrl or Command with C or V applies when the timeline owns focus,
  including after selecting with a marquee, which focuses the timeline lane.
  Text fields and active modal surfaces keep their own shortcuts. Clipboard
  actions wait for an active editor gesture to end or cancel. No system
  clipboard data is read or written. The saved animation format stays the same.

The transition checks use hand-written expectations for source revision and
instance changes, distinct cue sides and occupied slots, mixed-track refusal,
preserved offsets and easing, and exact undo. The browser probe also checks
focus and the document source through the normal timeline shortcuts.

### Timeline verification

The independent rules review of `71f580e48` against `b4466bfb5` found four
corrections before coding. The [rules correction commit](https://github.com/NoaCG/NoaCG-Studio/commit/8696e384bcc3626b9867e0437a26c33f1521da6d)
records them.
The clarified rules above bind the clipboard to the actual instance and
revision, preserve interpreter bytes, and make focus, cue sides and owner
validation observable. During implementation the existing runtime limit on
Hold and jump segments was applied to intervals changed by paste. A
shortened discontinuity under 10 ms refuses the whole batch.

Windows Chromium `j-5050` passed 21 cases across `editor-key-ease.spec.ts`
and `editor-steps.spec.ts`. Copy leaves source and history intact, paste
keeps values and eases in one undo, an occupied slot refuses, and the same
snapshot can be used at another time until an intervening source edit.
Marquee focuses the timeline and Out at zero stays operable. The captured
1093 px ruler shows separate labels at their authored coordinates. Job
`j-5051` verified that paste on inspected Out retains interpreter bytes and
refuses without source or history changes when the existing writer would
need to replace an older interpreter. The Node clipboard cases cover both
flag sides, offset arithmetic, carried Out and filter compatibility.

Job `j-5048` passed 24 cases across SVG fidelity and typography on
`b4466bfb52d0b804e95462f8c8c8dbad85449fbf`. Its measured nested Illustrator
fixture still reports the rotated headline 3.25 local units higher after
import/export. The original and exported bounding boxes have y=24 and
y=20.75 respectively, with equal x, width and height. That is an observed
shift even though the existing fidelity spec passes.

### Rotated text plate measurement

The imported headline belongs to the plate drawn around it. On the nested
Illustrator fixture the wizard should offer its existing alignment controls
while preserving the fit and centering defaults. The full-frame backplate
threshold remains 70% of the SVG frame. Use the area of the rectangle after
its transform so a rotation does not turn a foreground plate into a
full-frame backplate. Unrelated grouping, fitting and exported defaults stay
as before. A true full-frame background still offers no field alignment.

Windows `j-5058` measured the existing fixture through the live Fields step.
It first associated text `t0` with plate `s1`, then dropped the association
because its screen-aligned box covers 75.3299% of the frame. The transformed
rectangle covers 34.5679%. The plate's local measurement agreed with the
runtime. The text starts 3.25 units below the center of its band and moves
3.25 units up under the [owner's center-snap rule](../../TEXT_BOX_BINDING.md#1-a-centred-block-snaps-on-both-axes).
At 22 px its drawn offset is below the existing 5.5 px offer threshold, so
the existing Keep position control stays absent for this fixture.

`j-5059` reproduced the missing alignment grid with the maintained fixture
regression before the correction. The same run's separate clip-path UI case
passed. Its overall exit was 1 because the alignment regression reproduced.
Windows `j-5061` then passed all 12 selected cases with exit 0. The rotated
plate now offers alignment. The fitting output and existing text geometry
remain consistent with the import baseline. A true full-frame backplate still
has no group, a line without a plate still has no alignment, and existing
grouping order, margins, alignment and nudge controls passed.

### Comparable Windows timeline task

Windows `j-5056` ran Studio v0.17 standalone at release source
`a1e9776120fa19d9f3f9d40ab4b10ae1be034347`. Its published Windows executable
SHA256 was `88836062eab024aac85e5f71400bcf2e198ca09f12447fe4c52ebc1e7473cebd`.
The relevant `apps/editor/src/panels/TimelinePanel.tsx` blob
`c6057bc432e33234ad94709f0dc28e8ea0f76bcc` matches the reference pin
`3142fc7d02934494931eb14e7dc255393e4110d0`. The local reference process served
an isolated disposable workspace and was closed at the end of the check.

Studio starts a rectangle with keys at frames 0, 12 and 24. The first attempt
`j-5055` incorrectly expected one key and stopped before the interaction.
The corrected run added one at frame 1, selected it, advanced to frame 2 and
pressed Ctrl+C and Ctrl+V across those two positions. The key list stayed
at 0, 1, 12 and 24. Alt+Right moved the selected key from frame 1 to 2.
The corresponding NoaCG timeline case adds a new key at the paste time
and leaves the source key at its own time. Studio's result is scoped to
this layer-key workflow and shortcut path. The screenshots were captured
in headless Windows Chromium at CSS viewport sizes. Studio shows the key at
frame 2 on its ruler and in the key inspector, with the other three keys
intact. The capture SHA256 is
`402e5359281247a707734c8a523e27b8577af84f4bc3bd1efcddad8e6525290c`.

### Maintained authoring observations

Windows `j-5057` logged 20 passing browser cases on `24439f46f`, including
catalog entry, exact Illustrator group/ungroup, the existing static anchor
rules, image creation/replacement, Pen point and tangent editing, asset bin
transactions, and reopening and executing the catalog and artwork exports.
The scheduler reaped the job as dead without capturing an exit code, so it
has a failed scheduler verdict even though Playwright recorded all cases
as passed. The image files entered through browser automation, while native
Windows SVG picker, Explorer drop and SPX download have their own earlier receipt.
In `j-5060` the owner dragged `public/noacg-mark-512.png` from Windows File
Explorer onto the isolated editor canvas on exact `24439f46f8a585c79ad9bc9458d8e01aca5d89de`.
The owner observed both the rendered logo and the new image layer. The fixture
SHA256 is `f690e10b37a7b7499dd0b8eda9562b3664cac39e8e90c89c48e4916e9c34a304`.
The coordinator cancelled the native session after observing the result at
20:15:17Z and confirmed the local server closed. The native result is raster
placement. The asset replacement and persistence checks above are separate.
The affected local gates passed 341 tests across 24 files on the timeline
changes. The wider browser plan selects 152 offline and 70 configured specs
for GitHub Actions. The standalone protection gate could not create its
base-worktree `node_modules` symlink on Windows (`EPERM`).

### Animated anchor rules for review

The existing static anchor is the base pivot for Rotation and Scale. Typing
X or Y, Center anchor and the canvas tool move the pivot in layer pixels
without writing Position. On a rotated or scaled layer the artwork moves
according to the new pivot. This is the October 1 owner rule and applies
with or without keyed anchors.

- A supported layer has one editable transform owner and a rendered pivot
  that matches its source. An axis is armed when it has an authored key
  anywhere in the supported linear sequence. Its diamond adds or removes a
  key in the inspected cue. Enable writes one key with the displayed value
  and leaves that rendered pose unchanged. Typing keys only the armed axis.
  Center and canvas edits route each axis independently and commit a pair
  in one undoable change. An unarmed axis edits its base. An explicit base
  edit can change the base while retaining keys. Removing the last key, or
  disabling the axis and removing its keys sequence-wide, retains its
  displayed value in the base. Removing an earlier key never bakes a base.
- Use the existing G02 cue rule. At an ordinary flag a visible layer uses
  the arriving pose and a newly revealing layer uses its departing pose.
  Explicit Step or Out inspection uses the named cue. Commit requires the
  same document instance, selection, source revision, rendered pose, time
  and cue side captured when the edit starts. Rehearsal cannot edit keys.
  A no-op, refusal, cancelled drag or stale edit changes neither source,
  history nor selection.
- Test layer-pixel values against the rendered marker on a created rotated
  and scaled rectangle and the Frosted Panel box. For SVG, qualify both an
  editor-owned group and ordinary nested text `#f0` in the imported
  `fidelity-nested.svg` card under translate, rotate and scale. Keep the
  transformed member check with its own markup transform in the canvas
  transform fixture. Measure SVG pivot from the top-left of the intended
  local box and map its rendered marker through the SVG matrices. The SVG
  group's zero-time initializer is static bookkeeping even if there is
  authored motion. Its existing center, cue repartition and base edit
  behavior are preserved. A group pass cannot qualify the nested member.
- Compare preview and the same saved/reopened document with executed HTML,
  SPX, CasparCG and OGraf browser outputs. Sample forward and reverse, the
  arriving hold and departure, interrupted Out from an earlier cue and
  normal last-cue Out, one-key and zero-time Out, and carried Out. First
  enable and unchanged axes preserve the observed pivot and other motions.
  E6 verifies receiving hosts separately.
- Source changes are confined to the owned anchor tracks, needed base
  values, and any required exact known-runtime or identity upgrade in the
  same transaction. Position, Rotation, Scale, unrelated tracks, existing
  SVG markup transforms, assets, fields and foreign source stay as authored.
  Unknown runtime, ambiguous ownership, raw or design-driven transforms,
  singular geometry and any first SVG fold that cannot preserve its pose
  show an explicit reason beside the control before writing. A refusal on
  a required layer stays open. Existing unkeyed documents continue to work.

The [rules checkpoint](https://github.com/NoaCG/NoaCG-Studio/commit/222822aa9cde7489af09d6419c45bc52b13c59bb)
received AGREE WITH CORRECTIONS in a fresh review. The rules above incorporate
its cue and axis semantics, static SVG initializer separation, required target
scope and saved/exported artifact checks. These expected outcomes are written
before runtime work and define the independent transition checks:

| Start and action | Expected source, history and geometry |
| --- | --- |
| Unarmed X/Y, enable X at a nonzero inspected time | One X key at that cue-local time, Y still base, one history entry, same pivot and painted corners at that pose. |
| X armed, Y base, drag the pivot | One X key edit at the inspected time plus one Y base edit in one undo. The marker follows the drag and Position remains exact. |
| X keys in two cues, remove one diamond, then disable X | The first edit removes only that cue's key and keeps the base. Disable clears the remaining X keys and bakes the inspected X. Each successful edit has one undo. Y and Position stay exact. |
| Visible or newly revealing layer at a Step, or explicit Step/Out inspection | Compare authored cue-local records against the named side and verify the other side's source and pose. |
| Cancel, stale context, competing owner, or unknown runtime | Identical template and history, selected layer and rendered pose retained, refusal reason where applicable. |
| Reopen and output playback across held and Out cases | Same pivot and transformed corners at equivalent cue times, with no jump or residue from authoring a different cue or replaying. |

In `j-5057`, the rotated/scaled rectangle and animated Frosted Panel had
working static controls. The nested SVG member displayed the existing pivot
refusal. In `j-5058`, direct GSAP `transformOrigin` jumped to the final HTML
pivot at the first sample. A CSS-variable pivot interpolated 100/50 to
140/70 to 180/90 and returned exactly to the midpoint when seeking backward.
Applying the direct SVG route to its original pivot changed the rotated SVG
member's first painted bounds from x=12.593, y=250.237 to x=−8.698, y=268.718.
These are primitive measurements in isolated Chromium. They establish the
regression target and the requirement to prove SVG mapping separately.

#### Ordinary layer anchor verification

The created HTML rectangle keys its two CSS anchor variables through the
existing numeric timeline, without a second animation model. In `j-5065`
enabling X at a nonzero time kept the painted box, the second X key left
Y in CSS, and disable kept the inspected X without writing Position.
Undo restored the exact prior source. The existing catalog and placed
text static pivot checks passed.

`j-5067` reproduced a replay defect before the reset correction. A pivot
keyed only in Out moved from 100 to 180 and the next Take still read 180.
The existing entrance now clears only the authored anchor properties in
source carrying the guarded generated anchor extension. The shared
interpreter remains byte-identical in emitted unkeyed graphics. An
independent writer test requires the exact generated body before adding
the extension and preserves the rest of the source. The maintained Out
case verifies 100 → 180 → 100 in every browser export and the simulator.

On the ordinary nested Illustrator headline, the CSS-only rotation
preview had retained glyph bounds from before the rotation. The first
key caused a reload and its fitted bounds moved from y=20.75 to y=24,
which moved the pivot's SVG matrix by 2.0745 px horizontally and 1.9009 px
vertically in `j-5071`. The editor now refits with its existing SVG fitter
when base transforms change on artwork eligible for a CSS pivot. The
first keyed edit starts from the same fitted glyph box as a fresh render.
`j-5072` matched all six matrix components within 0.0005, and editing and
reverse seek retained source, history, bindings and unrelated transforms.
An existing independently owned SVG transform still refuses key authoring.

In `j-5074` the saved and reopened graphic matched its original HTML, CSS
and JS. HTML, SPX, CasparCG and OGraf used the same saved operator data and
public playback path and matched visible text and forward/reverse matrices.
`j-5073` omitted that data/lifecycle in the comparison and failed on its
output text, while its other checks passed. The comparison was corrected
without loosening its assertions. The static SVG group passed its existing
check. Keyed group pivots still need the separate rules and checks below.

The first reset placed new code into every catalog template. The raw
catalog gate exposed that drift, so the reset moved to the guarded
extension emitted only with authored anchor keys. The raw Windows gate
still exits 1 for `jc01` alone. A control over all 539 designs, using
the exact `27d50cc14fffffdabaa4df70adf0ed65bb3105c2` source in the same
Windows environment, found no raw fingerprint differences between main
and the candidate. The `jc01` JS on both has hash `ec5dc4ccf279231f`.
Normalizing eight CRLF sequences from the unchanged QR encoder gives the
committed hash `8d17b8a35536b6dd`. The baseline stays as committed.
`j-5075` completed all six Windows cases with exit 0 on the resulting guarded
emit, including ordinary HTML, saved Illustrator and the unchanged static
SVG group. The final ordinary test set includes the all-target Out retake.

#### Editor-owned SVG group rules for review

- Only a uniquely addressable editor-owned SVG group with a valid stored
  frame and its existing zero-time `transformOrigin` initializer can take
  pivot keys. The initializer belongs to the base. It remains unchanged
  when enabling, typing or retiming a key, stays hidden from the authored
  key rows, and continues to initialize groups with no authored anchor keys
  exactly as before. A separate source owner or invalid frame refuses
  before changing source or history.
- The keyed value is in the stored group frame, independent of the current
  member bounds. A group can turn and scale about its own animated pivot
  while a member moves. Only the group anchor channels change on a pivot
  edit. A first enable captures the current displayed pivot and preserves
  both members' first painted matrices. The other axis and all group and
  member Position, Rotation, Scale, identity, masks and fields stay exact.
- Before an axis has an authored pose, playback uses its existing base.
  Once an authored pivot is visible, Next, arriving hold and departing
  zero keep or change it under the same rules as other numeric keys. The
  static initializer must not erase a held axis. Out begins at the observed
  pivot when interrupted from an earlier cue, keeps carried motion only
  on the applicable path, and handles one-key and zero-time cases. A new
  take clears both animated axes back to their authored base before In.
- Repartitioning a cue keeps static initializers at their original base
  value and moves authored anchor keys through the ordinary numeric path.
  Ungrouping must preserve pivot motion through its transform carrier or
  explicitly refuse with source, history and selection intact. Existing
  non-anchor group edits and ungroups keep their verified behavior.
- The maintained imported SVG group fixture must compare actual group and
  member geometry in the editor, after durable reopen, and through HTML,
  SPX, CasparCG and OGraf browser execution. Sample forward and backward,
  including the Next hold, departing pose, carried/early/normal Out and
  replay. An independently written expected transition checks a moving
  child and two unequal group pivot values; a static-only group pass is
  regression coverage and cannot stand in for authored group motion.

## Checkpoint

The E1 inventory and verified alias repair are published on the owned branch.
E1 has no pull request, queue entry or phase verdict. There is no migration.
The November 8 native and defect-probe jobs ended at their recorded states.
The November 10 owner walkthrough covers the previously blocked Illustrator
file interactions. The next verification needs an admitted Windows browser.
The authorized sign-in UI check uses the isolated simulation in
`e2e/sync-dot.spec.ts` and will be reported as simulated. Reproduce the two
close-flag/key clipboard probes before touching those product paths. Remeasure
the [reported rotated text offset](../../research/editor-r1-1d/README.md#reproduction-and-fidelity-boundary)
on the maintained Illustrator fixture. Verify the clip-path refusal at the
browser controls. Animated anchors and broader authoring checks remain open.

On November 10 the restored flag and clipboard probes were queued together
with one browser worker as `j-5043`. The scheduler held the job for its 3.5 GB
memory requirement. It was cancelled without a start at 2,099 MB free. The
original diagnostic patch remains in the run kit at
`receipts/e1-pending-probes.patch`, SHA256
`8131576d9a90b3c9419a3a08758cc86117e48661b186a88921adc646cf39c9b0`.
It was removed from the working tree after cancellation and still passes
`git apply --check`. When memory allows, apply it after verifying the digest
and run only the two added probe cases in `editor-key-ease.spec.ts` and
`editor-steps.spec.ts` through the scheduler. Then run the isolated
`sync-dot.spec.ts` simulation and the remaining authoring checks on the
reconciled candidate.

The independent pre-code clipboard rules review on
`155be8ca8deb4356073bfc0f5eeb5f5021ed21af` returned AGREE WITH CORRECTIONS.
Resolve these points and obtain the required independent rules review before
implementing that operation.

- Resolve destination cue from the live playhead and the explicit flag-side
  override. Ordinary scrub lands on the arriving side. Explicit inspection
  uses the departing side. Define both sides' collision rules and reject
  ambiguous, synthetic legacy Out and unsupported carried-Out destinations.
- Compute relative offsets using cumulative stored cue time. Define the
  same-track two-sided boundary case even when one copy appears selected.
  Check occupancy after canonical millisecond rounding without clamping or
  extending the cue.
- Use the existing authoring instance identity across timeline remounts.
  Define source revision invalidation and how refused/empty copy treats a
  previous snapshot. Establish the smallest allowed destination scope before
  code, including whether an inherited-only track may receive pasted keys.
- Preserve filter shape, legacy and foreign source boundaries. No unrelated
  normalization or interpreter writes. Preserve native text and modal
  keyboard behavior, including copy after a marquee which blurs focus.
- Use independent hand-written expectations for the transition, exact
  source/history/fields and changed-default-ease or Hold behavior. A
  successful targeted copy/paste adds one undo. A refused paste adds none.
