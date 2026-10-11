# October 10 recovery findings

Compared against main at `1442117acdc7518c4f2672f92551a4a590f4a666`.

## Rundown history

Stash `80044b5f92358ce2fbc6d8147f65c0bc03e05ea5` is superseded by the history
implementation in [PR #718](https://github.com/NoaCG/NoaCG-Studio/pull/718), commit `f4510a1b3`.
All seven tracked files were compared against the stash base and the landing. The storage test,
receipt capture and keyboard hook are identical at landing. Checked model mutators are retained;
the later model adds no-op colour guards. The page retains grouped authoring, acknowledged saves,
identity boundaries, clipboard sequencing, duplicate/delete/rename history and live safety.
Later differences fix empty Delete handling, current cue reads and closing folder drafts, improve
feedback and incorporate concurrent UI changes. The implementation report adds acceptance receipts.

The stash also has two untracked files in its third parent: the history hook and page tests.
Both landed. Later hook changes improve refusal/failure messages; the test waits for local
acknowledgement before inverse and checks successful feedback colour. No missing behavior found.
The original stash and all its parents were preserved in a verified external Git bundle.

## Orphan source snapshot

The orphan's non-secret files were hashed against current main, all reachable Git objects,
all retained Codex snapshot trees and October 2-4 first-parent history. Of 2,224 archived files,
2,219 match one October 3 tree (`5b91be155`, also retained by Codex snapshots). The five other
files are two local launch/port configurations and generated player/font output. Generated output
was identified from the maintained generators; no orphan scripts were executed. A test fixture
matching a credential pattern was excluded from the archive and checked separately against Git.
The archive was reopened and every file verified against its SHA-256 manifest.
No unique application source was found. An originating chat could not be established from current
thread metadata or exact-path transcript searches; the snapshot origin is established by file hashes.

## Toolkit

Original commits `2036628c1` and `428c96bf4` were compared with adopted commits `98d89d705`
and `c7f4fec13` in [PR #864](https://github.com/NoaCG/NoaCG-Studio/pull/864).
Nineteen of thirty changed paths are byte-identical at adoption. Eight differ only in reviewed
CLI version pins, the release workflow reconciles already-landed automatic publication and keeps
the distribution job, package scripts retain both toolkit commands, and the old account checklist
was migrated to issues. No unique toolkit implementation remains. Current directory acceptance
belongs to its existing live session. Preserve the original non-ancestor ref as recovery evidence.

## Automation

- [PR #939](https://github.com/NoaCG/NoaCG-Studio/pull/939): still warranted. Run `38005906607`
  records the same test failing and passing on retry at `de9cb17fa`. The test is unchanged on
  current main; no quarantine entry or earned release exists. Recover only its five-line entry,
  preserving every existing entry and the twenty-pass release policy. Recent green configured
  suites do not replace the missing per-spec quarantine release receipts.
- [PR #945](https://github.com/NoaCG/NoaCG-Studio/pull/945): superseded by
  [PR #947](https://github.com/NoaCG/NoaCG-Studio/pull/947), `296077bd0`. The original repeated
  fidelity failure was the intended SVG line-balancing output, repaired in its baseline and covers
  mapping. Main CI `38071623838` passed all ten full shards with retry skipped. The newest main
  CI was cancelled, so it is not claimed green. The unused revert should close; retain its ref.
- [PR #687](https://github.com/NoaCG/NoaCG-Studio/pull/687): already closed as superseded by
  [PR #684](https://github.com/NoaCG/NoaCG-Studio/pull/684), with full/configured green receipts
  in its closure comment. Retain the unused revert ref; do not reapply it.

## Editorial and infrastructure holds

[PR #737](https://github.com/NoaCG/NoaCG-Studio/pull/737) remains accurate; the newest published
update is October 7. Recommend publishing the existing six bullets. The owner was asked for this
editorial choice; no copy is published before that answer.

The orchestrator is permanent infrastructure. Its tracked deletions are instruction and attribute
files, with no established purpose, so leave them untouched. The detached day-wave checkout's
October 9 ledger records a completed wave and the forward fidelity repair, but detached lifecycle
ownership is not proven. Preserve it. Preserve all live sessions and their branch/checkouts.
The archive-repair helper still waits for normal desktop exit; no result exists. Leave it alone.
