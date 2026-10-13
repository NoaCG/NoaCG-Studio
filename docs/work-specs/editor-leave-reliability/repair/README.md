# Refused-discard repair

## Reproduction and scope

The exact independent checker commit `c6929791dc30b49e609d055598f687aeb1798d85`
is carried unchanged as `d62d76288`. Its failure is reproduced afresh on current
repair base `4e4eb8b0c953d0d4a9bd862b6e04c1d6582c2009`:
[run 38476277898](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38476277898),
disposable `0781c3dd2f4b0d998233819404000889fb82dfd7`, fails the unchanged
`e2e/leave-checker.spec.ts:61`. One refused `spx-gfx-project` put leaves the edited
source visible but changes Undo from one entry to zero. The other two adversarial
cases pass. This is a deterministic product failure, not a same-commit flake.

Before editing, the work spec was amended with observable refusal, delayed-write,
Redo and pending-autosave acceptance. No wizard/import, router, export, cloud
status, production, schema or storage-key implementation is changed.

## Change

Discard drains a pending working-slot autosave, then writes the replacement and
awaits its own durable receipts before publishing any source or baseline change.
A synchronous storage refusal with no receipt also leaves the editor open.
The existing library/default apply path runs only after success; a source change
while waiting refuses the stale discard and persists the newer draft. Successful
discard still clears old history and selection and keeps an open wizard until its
pending continuation runs. Normal library Open retains its existing persistence.

The maintained leave-editor journey adds linked and unsaved failure cases with
nonempty Undo and Redo, exact command/session/context and view preservation,
Cancel, Redo/Undo, successful retry and reload. It also holds the native IndexedDB
completion notification to prove source/history remain live until confirmation,
and refuses an outstanding autosave before allowing discard. Existing assertions
and the independent checker's failed assertion remain unchanged.

## References and account boundary

Fresh pinned lifecycle executions passed in
[38476301472](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38476301472).
Studio `3142fc7d` / official v0.17 cancels New, saves native source, accepts New
and reopens the unchanged saved file. Eyevinn `616841bd` switches between
already-saved templates, cancels Delete, accepts Delete and reloads the kept one.
Both resulting captures were inspected. Studio's reset clears private history
only after replacement, while its file Save awaits writing a snapshot. Eyevinn
reports localStorage failures but has no equivalent discardable unsaved draft.
NoaCG deliberately retains named Save and pre-navigation Save/Discard/Cancel.
These are lifecycle comparisons, not whole-editor parity.

Seventeen pinned source files were freshly retrieved and checked against every
SHA-256 in the independent reference receipt. The ten Studio file paths, including
Menubar, projectStore, historyStore, fileIO, autosave, renderers and tests, and the
seven Eyevinn event/model/render/storage/test paths were inspected. Upstream unit
suites were read, not run. The initial raw API response lost four bytes from
projectStore; the immutable Git tree identifies blob
`3b4de4a393193268d6c283bed033e62ac85693b3` at both Studio revisions. Reading its
base64 bytes matches the original hash exactly. All original hash assertions
remained intact. No third-party source enters product code or exports.

The repair passes the synthetic signed-in localhost account lifecycle in
[38476895614](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38476895614)
(31.4 seconds). Exact hydrated cloud/source and saved-record equality remain
asserted; discarding a never-saved experiment adds no graphic record. The driver
refuses a non-local backend. `supabase stop --no-backup` confirmed shutdown at
22:21:23 UTC. The account dialog capture was inspected. No hosted backend or
account was changed. Existing production-copy assertions remain in the unchanged
independent linked-save case.

## Passing verification and rendering

[Complete repair run 38476787644](https://github.com/NoaCG/NoaCG-Studio/actions/runs/38476787644)
executes disposable commit `688e16a4bfe1def010fcdadc005e67ad343bfabd`. Its two
product files and maintained test file are byte-identical to this repair. The
bounded maintained/independent selection passes 69 cases in 8.2 minutes, with eight
unchanged legacy-editor skips. All three independent adversarial cases and all
four new maintained cases pass. The old history assertion was not changed.
The same run passes two pinned reference cases (13.4 seconds), the unchanged
two-different-graphics export case (7.9 seconds), and four cumulative/native
viewport tasks (1.4 minutes), all with one worker and zero retries.

Desktop 1920x1080, laptop 1366x768, native 125%, their leave dialogs and the nested
copy capture were inspected. Save/Discard/Cancel remains legible over the editor.
Native zoom is measured as 1.25 before and after, with 1366x768 outer window,
1093x545 content, 196px canvas, 180px timeline and 280px Properties. The Fit artwork
is still small and Properties/timeline scroll; this is the existing comfort
limit. The three cumulative tasks preserve text, artwork, animation, source,
fields/assets, save/reopen and nine executable SPX/CasparCG/OGraf browser outputs,
all with empty error lists. These are not physical receiving-host tests.

Review and simplification ran inline: the available review connector reads CI
only and cannot execute a review. Review traced durable receipts, autosave timing,
source/session identity, wizard continuation and normal library Open, and checked
the carried failure against the repair and unchanged assertion. No further
product defect remained in the final diff. Simplification extracted only the
existing apply path so confirmed discard does not write the working slot twice.
Targeted ESLint, TypeScript, affected gates and whitespace checks pass. The full
build and merge suites remain pull-request/merge-group CI work. All 24 independent
receipt files remain byte-identical to the exact checker commit.

## Verification limits and next step

No local browser, dev server, full build or full suite ran. Free RAM was 1.76 GiB,
below the unchanged 4 GB scheduler floor. Only disposable CI ran the browser
work; no probe branch was queued or opened as a pull request. The human's explicit
publication and CI approval for this editor run covers those runs.

Automatic approval review rejected a supplementary mutation-probe dispatch,
interpreting the no-probe-queue restriction as a ban on that disposable branch.
It did not run, and no denial was bypassed. The fresh original-product run above
still proves the unchanged independent refusal assertion fails before this fix.
No same-commit fail/pass, quarantine, test-maintenance or budget exception applies.

The landed #1131 main CI `38471384589` and configured run `38471384774` are now
green. The pre-existing hosted-latency alarm #987 remains separate. After this
repair lands, a fresh independent checker must repeat the phase before Phase 3.
Broader comfort, owner acceptance, real receiving hosts, hosted cloud notices,
loops, full projects, R2/R3 and the editor default switch remain outside scope.
