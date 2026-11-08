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


## Proposed key clipboard rules

These rules are checked before any clipboard implementation. They are independent
of the loop phase.

- Copy captures the selected key values, effective incoming eases, source track
  selectors/properties and relative stored times in the active authoring session.
  It leaves source, selection, playhead and undo history untouched. A source
  boundary key with two authored cue sides has no unambiguous copied segment.
- Paste puts the earliest copied key at the playhead in the active cue and retains
  relative intervals on the same tracks. Copy/paste is scoped to the same document
  session. The existing operation/session path checks target ownership and the
  latest revision before committing. Switching documents discards the clipboard.
- The entire paste is refused before any write when a target key already exists,
  the batch would cross a destination cue boundary, the destination track no
  longer exists, or the source path/track is unsupported. A successful paste
  leaves original keys, source outside the authored block and operator fields
  intact and adds one undo. Undo restores the exact previous source.
- Clipboard shortcuts belong to timeline focus and leave normal browser text
  input copy/paste untouched. Context or toolbar actions must share the same
  operation if included. Changes remain in the existing animation JSON format.


## Checkpoint

The E1 inventory and verified alias repair are published on the owned branch.
E1 has no pull request, queue entry or phase verdict. There is no migration.
The native and defect-probe jobs are stopped. The next verification needs
an admitted Windows browser, an isolated test backend/account, and supported
native controller access. Reproduce the two close-flag/key clipboard probes
before touching those product paths. Remeasure the [reported rotated text
offset](../../research/editor-r1-1d/README.md#reproduction-and-fidelity-boundary)
on the maintained Illustrator fixture. Check the reported agent easing and
clip-path split portions separately, preserving the current exact-refusal
contract. Animated anchors and broader authoring checks remain open.

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
