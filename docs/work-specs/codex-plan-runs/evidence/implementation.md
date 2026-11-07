# Codex planned-run implementation verification

Reviewed source: `6fa6a685124452a9899fb617e8f16212fbb3ebdc`, against
`fee8818c9fb20317548c1213538b07bab41b4c7b`, 7 November 2026.

An independent fresh review read all 20 changed paths, returned AGREE with grade A on this exact
source and found no remaining actionable defect or material simplification. Earlier findings were
fixed: checker source must match the recorded merge, dispatch rechecks authority and reserves once,
final non-delivery cannot dispatch, shared worker gates remain mandatory, Codex briefs use the
actual block end, and test guards cover the new helper and tailored templates.

## Repository behavior

| Criterion | Result and evidence |
| --- | --- |
| AC-1 | PASS for explicit harness routing, source reads and briefs. Instruction mutation tests cover wrong targets, missing procedures/mappings and critical contracts. Codex rendering tests cover four brief roles, absolute paths and shared traps. Fresh root/nested reads are described below. Claude command wrappers, shared plan procedures and default templates are byte-identical to the baseline. Automatic CLI skill discovery is not claimed. |
| AC-2 | PASS. Active kits arm no scheduled check-in; unattended mode remains separate. Independent instruction review verified current owner decisions, finite authority, phase order, fresh checkers, shared checks, repair limits and stopping. Legacy defaults and opaque non-Codex launch receipts remain supported. |
| AC-3 | PASS for the implemented opt-in launch protocol. Tests exercise exact native binding, unknown/wrong acknowledgements, one dispatch reservation, checker identity, paused/cancelled reconciliation, final non-delivery safe stop, empty-store restoration, publication refusal and accepted publication with lost acknowledgement. Unknown work cannot advance the phase or renew its block. These are control-protocol tests, not native host-loss proof. |
| AC-4 | PASS for the repository transition. Joined tests show the Codex pre-expiry check-in passes native wake admission while equality at expiry remains refused; actual worker briefs stop at the current block even for fixed-date projects. Pause/fixed-deadline protection and legacy timing remain intact. Actual unattended renewal is still unqualified. |
| AC-5 | UNVERIFIED overall. Native same-machine work and delayed active-session delivery were observed below. Required final PR/merge acceptance and broader wake/re-entry/renewal qualification need their own terminal receipts; none follows from the fixture tests. |

## Executed checks

- `node scripts/gates.mjs run --changed origin/main`: all affected static checks and **127 tests
  in seven selected test files passed**, zero failures, skips or cancellations on the reviewed source.
- Targeted native-recovery contract tests also passed in the earlier core selection. Existing
  source tests do not prove provider delivery or recovery after interruption.
- ESLint passed for all eight changed/new script and test files. The whitespace check passed.
- The first affected-test invocation lacked the worktree's TypeScript dependency. Installing locked
  dependencies with a writable temporary npm cache resolved setup; the final affected run passed.
  No gate, assertion, timeout, skip or retry allowance was weakened to clear a failure.
- No local production build or browser suite was needed for these Node control/instruction changes.
  GitHub Actions remains authoritative for full PR and merge checks.

## Native observations and limits

Coordinator preflights ran in separate shell calls at 19:33:03.900Z and 19:33:20.068Z, both passing
workspace child/IO, Git origin/main and Actions API reads. The invocation-only receipts retained
the native hosted-child mapping and host-loss wake/bootstrap gaps.

A fresh same-machine worker used an owned detached checkout at
`75aa163f0ba9dc50d102528daee8ee2ae4e6f0fb`. Its separate worker preflights at 19:26:11.594Z and
19:26:28.867Z passed the same checks. It read root rules, both wrappers/references and nested
component rules, resolved the references from the nested directory, and returned a clean status.
This proves explicit source reads, same-machine invocation and result transport at that source.
It does not establish automatic CLI skill discovery or independently hosted children. Later bounded
corrections are covered by the reviewed diff and targeted tests, not a fabricated newer probe pin.

A one-shot coding-wake probe requested 19:31:08Z arrived in the originating coding chat. Raw
executor arrival was **19:34:58.539Z**, with the same observed managed environment and original
clean feature worktree at `6fa6a685124452a9899fb617e8f16212fbb3ebdc`. The nonce and actual thread
matched. The local nonsecret receipt was written, and the disposable automation was disabled.
Provider fire time is not established by that executor timestamp. This demonstrates delayed
execution while the session was active, not autonomous idle/reclaimed-machine recovery.

The separate read-only CLI skill probe failed before app-server startup because its state path
was read-only. It produced no qualification receipt. No credential, model, environment binding or
permission change was made to obtain another route. Native automatic discovery, idle/machine-loss
recovery, renewal through interruption and usage-stop recovery remain explicitly unqualified.

Execution progress, overall criterion acceptance and owner disposition stay separate. This
implementation neither starts an editor product phase nor reopens a completed Claude run.
