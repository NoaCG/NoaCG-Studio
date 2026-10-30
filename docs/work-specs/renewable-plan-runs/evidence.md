# Runner and Codex Cloud qualification

2026-10-30. This tests runner preparation only. No CI implementation project was started.

## Live cloud probe

The owner explicitly authorized one temporary cloud qualification chat. App-created chat
`01a18eb4-bbf6-751e-8312-0fce5fc76070` on host `durable` tested main
`3154220793fd5b4e4f3a085a3a2e30ee7e20066b`, completing at 21:29:13Z.

| Capability | Result and evidence |
| --- | --- |
| Coordinator | PASS: separate network-enabled preflights at 21:27:22.279Z and 21:27:34.043Z |
| Fresh same-VM worker | PASS: worker preflight at 21:27:57.462Z in its own worktree; nonce `qual-20261030-2127-worker-a` |
| Live-session follow-up | PASS: same worker answered `qual-20261030-2127-followup-b` at 21:28:32Z, preserving HEAD and its receipt |
| Independent hosted workers | BLOCKED: cloud CLI inventory returned HTTP 401, unable to parse authentication token; no cloud-create tool exposed in that chat |
| Native coding-chat wake | BLOCKED: no exposed supported route could target that cloud coding chat; no timer/reminder substitute created |
| Host-loss recovery | BLOCKED: no native wake/bootstrap path to test; a live worker follow-up does not prove it |
| Git/API/Actions reads | PASS: fetch, repository permissions and run/job reads |
| Full failed log | PASS via GitHub connector: run 41027970852, job 123970660214, 66,540 characters/565 lines; CLI log download failed |
| Push | PASS: disposable `codex/qualification-20261030-2127`, read back, zero Actions runs/deployments, then deleted |
| Queue/status/workflow writes | PARTIAL: permissions and tools visible, actual writes/dispatch/queue admission untested; no dummy landing |

The coordinator and worker shared a VM, so these are not independently hosted child receipts.
The local CLI separately returned "no cloud environments are available for this workspace"
for the canonical owner binding. A ready environment in the app is not a qualified CLI mapping.
Neither probe changed credentials or the repository owner binding. No wake remains armed.

The repository changes can make the short command and completion authority work, but cannot
manufacture platform worker authentication or a durable wake. Unattended admission must stop
before creating runtime state until the actual launch environment proves those capabilities.
The first legitimate CI phase can prove live queue writes, once coordinator admission is qualified.

## Local verification and review

- Reproduced target-expiry failures before implementation. Completion-authorized fixtures now
  cross the target, preserve the original worker/history, refuse duplicate work and old authority,
  enforce 24-hour blocks, complete all phases and reject renewal after finish. Fixed plans expire.
- Ran the eight affected runner files with `node --test`: 151 cases, initially 150 passed. The
  remaining case expected `continue` to undo a successfully persisted pause after network loss.
  Updated that obsolete expectation to require blocked/paused, unchanged block identity, stale
  owner refusal and explicit owner resume before progressing. Its focused rerun passed. No
  assertion was removed to conceal a failure; pause protection is now checked more strictly.
- Recovery tests use real local Git remotes, including filesystem-loss recovery, accepted writes
  with lost acknowledgement, hash/authorization mismatch, stale owners and retained phase history.
  These are runner proofs, not native cloud durability receipts.
- The 22 shared-instruction/support cases passed across their runs after restoring two required
  procedure markers. Selected static gates passed, including shared instructions, contract
  references, gate coverage and copy. `git diff --check` passed. No production build/browser
  suite was needed for this runner/docs change; GitHub Actions remains authoritative.
- In-memory CI plan checks confirm 18 matching ordered phase titles/IDs/dependencies and required
  environments, eight acceptance headings, matching normalized spec hash, agreed authority and
  no convergence review. All eight implementation criteria remain open.
- Independent skill forward test found qualification must precede the mutating `continue`
  command. Corrected that ordering and rechecked: new start, after-target recovery and owner
  pause scenarios now agree. Inline code review and simplification retain one authorization-end
  helper and the existing supervisor/ledger; no additional scheduler or state store.
- The standalone skill-creator Python validator could not run because PyYAML is absent. The
  repository's Claude/Codex wrapper validator and its mutation tests passed instead.

Local transient logs are in `C:/Claude/Temp/renewable-runner-tests.log`,
`renewable-pause-recovery-test.log`, `renewable-instructions-tests.log` and `renewable-checks.log`.
They are not portable acceptance artifacts for the future CI implementation.
