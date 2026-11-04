# Feature acceptance and evidence

For substantial work only; this file is the procedure.
Small fixes retain GOAL/WHY/GATE. Existing goals/programmes/rulings retain product authority;
existing plans, waves, jobs and landings retain execution authority. No retrospective conversion.

Each feature has a compact `spec.md`, `work.json` acceptance ledger and `evidence/` receipts.
The spec describes problem, behaviour, preserved behaviour and non-goals. Stable headings
`### AC-1: <observable outcome>` define the acceptance inventory, followed by scenarios.
Owner requirements, derived choices and evidence are labeled separately. Child specs name their
parent and inherited IDs; parent-level integration still requires its own observed evidence.
An acceptance criterion that needs an automated check names its layer (a Node test, a blank-page
browser spec, a journey in an existing E2E file, the configured suite, scheduled validation); a
new E2E file is the choice only for a new user-visible flow. Two optional sections carry the
suite-budget records the CI gate reads: `## Test maintenance` (one line per spec whose coverage
this work moves, merges or retires: `- e2e/x.spec.ts: <what stays protected, by what; receipt>,
owner miwco, expires YYYY-MM-DD`, at most 30 days; an expired line stays on record and covers
nothing) and
`## Budget exceptions` (`- e2e/x.spec.ts: <minutes> min, protects <behaviour>, expires YYYY-MM-DD`,
at most 30 days). Grammar and reasons: `scripts/check-e2e-protection.mjs`, `scripts/e2e-capacity.mjs`.

`work.json` version 2 deliberately has no tasks, lifecycle states, ready sets or dependencies:

```json
{
  "version": 2,
  "specSha256": "<digest of spec.md>",
  "authority": { "status": "agreed", "source": "<actual owner message/ruling>" },
  "review": null
}
```

Task decomposition, size, dependencies, worker IDs and next work belong in the existing plan and
wave/job/landing records. Oversized work is autonomously split there, never sent to the owner
unless it reveals a real product/intent decision. `SPEC <record> AC-1,AC-2` and `SIZE standard`
bind a wave row to acceptance without giving this ledger execution authority.
A plan built phase by phase keeps a `## Phase notes` section: the pull request that lands a phase
adds there what the next phase must allow for, decisions, traps and the check's findings
(`docs/EDITOR_REBUILD_PLAN.md`). A note anywhere else does not survive the worktree.

A reviewer records `review` with a full Git `revision`, `specSha256`, review-receipt `evidence`
and one `criteria` entry per AC:

```json
{
  "id": "AC-1",
  "status": "pass",
  "evidence": [{ "path": "docs/work-specs/example/evidence/save.md", "sha256": "<digest>" }]
}
```

Use fail/unverified for unsatisfied criteria. A missing criterion remains open. Each text receipt
contains command/run references, observed behaviour and limitations. `.md`, `.json`, `.txt` and
`.log` receipts are supported. Screenshots and clips stay on the machine that made them, never
committed (`repo-pictures/spec.md`); a receipt says in words what one showed. Hashes normalize CRLF
to LF, so Windows and Linux checkouts agree. Empty or changed receipts cannot pass.

```sh
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {digest} from './scripts/work-spec.mjs'; console.log(digest(readFileSync(process.argv[1])))" docs/work-specs/example/spec.md
node scripts/work-spec.mjs status docs/work-specs/example/work.json
node scripts/work-spec.mjs scope docs/work-specs/example/work.json AC-1,AC-2
node scripts/work-spec.mjs converge docs/work-specs/example/work.json
```

Commands write nothing and execute no evidence command. Status reports open criteria, capped at
ten entries per list with counts (`--details` retrieves all). Scope validates agreed intent and
criterion IDs, not launch eligibility. Converge refuses unless all criteria have current reviewed
evidence. `evidence-complete` is record integrity, not proof that a reviewer judged behaviour well.
A report saying "button exists" cannot prove "save survives reload", regardless of its hash.

Commit implementation before recording the review revision. Validated version 2 review-only ledger updates and newly added, hash-checked text receipts
referenced within their own `evidence/` directories may follow that revision, including reviews
for sibling specs already present in the reviewed tree. Unknown fields, changed ledger authority,
unreferenced files, existing evidence edits, code, tests, spec or instructions require re-review. Partial reviews are also invalidated by changed code. Keep code out of the
evidence directory. This is accidental-drift detection, not an adversarial attestation scheme.

Version 1 mixed task lifecycle into the ledger. It migrates ON READ to version 2, preserving old
evidence references as `priorEvidence` and clearing the review for honest revalidation. It never
promotes old verified-task flags to accepted behaviour. Writers serialize version 2. Unknown
versions are read-only refusals; additive optional fields need no bump. Git preserves original
records, so the discarded scheduling interpretation is not lost history.

The existing wave tick observes SPEC parents separately from branches. A worker finishing while
criteria are open yields an open parent; the Orchestrator continues bounded gap work in its
existing wave until reviewed convergence or a real execution/authority boundary. It never closes
the parent from worker confidence, and it never extends an expired authorized window.

Parallel workers write distinct evidence/handoff files. One assigned consolidation row updates
the acceptance ledger after landing; its file is allocated in TOUCHES. Production/owner acceptance
remain separate evidence rungs. The broader instruction/context audit is tracked explicitly in
[the post-pilot follow-up](https://github.com/NoaCG/NoaCG-Studio/issues/805).
