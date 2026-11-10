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
| Isolated Windows backend/account | Unavailable at worker intake | No Docker/Podman executable or running local stack identified; October's disposable branch was cleaned up. The Windows browser fixtures use offline local storage. A fresh admitted isolated backend and account receipt is still required for W. |

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
for unsupported interpolation. Browser controls and history still need their
own observation. The targeted Node suites for step authoring, easing and full
transforms passed 41 tests.

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
